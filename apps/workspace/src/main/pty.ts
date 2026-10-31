import * as crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as net from 'node:net'
import * as os from 'node:os'
import * as path from 'node:path'
import { app } from 'electron'

export interface PtyOptions {
  id: number
  cols: number
  rows: number
  cwd?: string
  extraEnv?: Record<string, string>
}

type AttachResult = { snapshot: Buffer; existed: boolean }
type PendingRequest = { resolve: (value: any) => void; reject: (error: Error) => void }

const HOST_ID = crypto.createHash('sha256').update(app.getPath('userData')).digest('hex').slice(0, 20)
const SOCKET_PATH = process.platform === 'win32'
  ? `\\\\.\\pipe\\workspace-pty-${HOST_ID}`
  : path.join(os.tmpdir(), `workspace-pty-${HOST_ID}.sock`)
let requestId = 1
let hostLaunch: Promise<void> | null = null

function hostToken(): string {
  const tokenPath = path.join(app.getPath('userData'), 'pty-host-token')
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true })
  try {
    return fs.readFileSync(tokenPath, 'utf8').trim()
  } catch {
    const token = crypto.randomBytes(32).toString('hex')
    try {
      fs.writeFileSync(tokenPath, token, { mode: 0o600, flag: 'wx' })
      return token
    } catch {
      return fs.readFileSync(tokenPath, 'utf8').trim()
    }
  }
}

function launchHost(): void {
  if (hostLaunch) return
  hostLaunch = new Promise((resolve, reject) => {
    const daemonPath = app.isPackaged
      ? path.join(`${app.getAppPath()}.unpacked`, 'out', 'main', 'ptyHostDaemon.js')
      : path.join(app.getAppPath(), 'out', 'main', 'ptyHostDaemon.js')
    if (!fs.existsSync(daemonPath)) {
      reject(new Error(`PTY host entry not found: ${daemonPath}`))
      hostLaunch = null
      return
    }
    const child = spawn(process.execPath, [daemonPath], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        NODE_PATH: [path.join(app.getAppPath(), 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
        WORKSPACE_PTY_SOCKET: SOCKET_PATH,
        WORKSPACE_PTY_TOKEN: hostToken()
      }
    })
    child.once('error', (error) => {
      hostLaunch = null
      reject(error)
    })
    child.unref()
    setTimeout(resolve, 250)
  })
}

function connectOnce(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(SOCKET_PATH)
    const onError = (error: Error) => {
      socket.destroy()
      reject(error)
    }
    socket.once('error', onError)
    socket.once('connect', () => {
      socket.removeListener('error', onError)
      resolve(socket)
    })
  })
}

export class Pty {
  private socket: net.Socket | null = null
  private cols: number
  private rows: number
  private disposed = false
  private activated = false
  private dataCallback: ((data: Buffer) => void) | null = null
  private pendingData: Buffer[] = []
  private pendingRequests = new Map<number, PendingRequest>()
  private receivedText = ''
  private attachPromise: Promise<AttachResult> | null = null
  private operationQueue: Promise<unknown> = Promise.resolve()
  private token: string

  constructor(private readonly options: PtyOptions) {
    this.cols = options.cols
    this.rows = options.rows
    this.token = hostToken()
  }

  onData(cb: (data: Buffer) => void): void {
    this.dataCallback = cb
  }

  private async ensureSocket(): Promise<net.Socket> {
    if (this.disposed) throw new Error('PTY detached')
    if (this.socket && !this.socket.destroyed) return this.socket
    try {
      this.socket = await connectOnce()
    } catch {
      await launchHost()
      let lastError: unknown
      for (let attempt = 0; attempt < 80; attempt += 1) {
        try {
          this.socket = await connectOnce()
          break
        } catch (error) {
          lastError = error
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      }
      if (!this.socket) {
        hostLaunch = null
        throw lastError ?? new Error('PTY host did not start')
      }
    }
    this.installSocketHandlers(this.socket)
    return this.socket
  }

  private installSocketHandlers(socket: net.Socket): void {
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      this.receivedText += chunk
      while (true) {
        const newline = this.receivedText.indexOf('\n')
        if (newline === -1) break
        const line = this.receivedText.slice(0, newline)
        this.receivedText = this.receivedText.slice(newline + 1)
        let message: any
        try { message = JSON.parse(line) } catch { continue }
        if (message.event === 'data' && message.terminalId === this.options.id) {
          const data = Buffer.from(message.data, 'base64')
          if (this.activated) this.dataCallback?.(data)
          else this.pendingData.push(data)
          continue
        }
        const pending = this.pendingRequests.get(message.id)
        if (!pending) continue
        this.pendingRequests.delete(message.id)
        if (message.error) pending.reject(new Error(message.error))
        else pending.resolve(message.result)
      }
    })
    socket.on('close', () => {
      if (this.socket === socket) this.socket = null
      for (const pending of this.pendingRequests.values()) pending.reject(new Error('PTY host disconnected'))
      this.pendingRequests.clear()
    })
  }

  private async request(op: string, fields: Record<string, unknown> = {}): Promise<any> {
    const socket = await this.ensureSocket()
    const id = requestId++
    const result = new Promise((resolve, reject) => this.pendingRequests.set(id, { resolve, reject }))
    socket.write(`${JSON.stringify({ id, token: this.token, op, terminalId: this.options.id, ...fields })}\n`)
    return result
  }

  attach(): Promise<AttachResult> {
    if (!this.attachPromise) {
      this.attachPromise = this.request('attach', {
        cwd: this.options.cwd,
        cols: this.cols,
        rows: this.rows,
        env: { ...process.env, ...this.options.extraEnv }
      }).then((result) => ({ snapshot: Buffer.from(result.snapshot, 'base64'), existed: result.existed }))
    }
    return this.attachPromise
  }

  activate(): void {
    this.activated = true
    const pending = this.pendingData
    this.pendingData = []
    for (const data of pending) this.dataCallback?.(data)
  }

  start(): void {
    void this.attach().catch((error) => console.error('[pty] attach failed:', error))
  }

  write(data: Buffer): void {
    if (data.length === 0 || this.disposed) return
    this.operationQueue = this.operationQueue
      .then(() => this.attach())
      .then(() => this.request('write', { data: data.toString('base64') }))
      .catch((error) => console.error('[pty] write failed:', error))
  }

  resize(cols: number, rows: number): void {
    this.cols = cols
    this.rows = rows
    if (this.disposed) return
    this.operationQueue = this.operationQueue
      .then(() => this.attach())
      .then(() => this.request('resize', { cols, rows }))
      .catch((error) => console.error('[pty] resize failed:', error))
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.activated = false
    const socket = this.socket
    this.socket = null
    if (socket && !socket.destroyed) {
      socket.end()
      socket.destroy()
    }
    this.pendingData = []
  }

  disposeAndDestroySession(): void {
    if (this.disposed) return
    void this.request('kill').finally(() => this.dispose()).catch(() => this.dispose())
  }
}
