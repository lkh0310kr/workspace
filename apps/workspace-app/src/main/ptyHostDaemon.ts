import * as fs from 'node:fs'
import * as net from 'node:net'
import * as pty from 'node-pty'
import { resolvePtySpawnAttempts } from './ptyShell'

type Session = {
  child: pty.IPty
  chunks: Buffer[]
  bytes: number
  seq: number
}

type Request = {
  id: number
  token: string
  op: 'attach' | 'write' | 'resize' | 'pause' | 'resume' | 'detach' | 'kill'
  terminalId: number
  cwd?: string
  cols?: number
  rows?: number
  env?: Record<string, string>
  data?: string
}

const socketPath = process.env.WORKSPACE_PTY_SOCKET
const token = process.env.WORKSPACE_PTY_TOKEN
if (!socketPath || !token) throw new Error('PTY host socket and token are required')

const sessions = new Map<number, Session>()
const clients = new Map<net.Socket, Set<number>>()
const MAX_REPLAY_BYTES = 2 * 1024 * 1024

function send(socket: net.Socket, message: unknown): void {
  if (socket.destroyed) return
  socket.write(`${JSON.stringify(message)}\n`)
}

function spawnSession(request: Request): Session {
  const existing = sessions.get(request.terminalId)
  if (existing) return existing
  // The app sends its current environment on attach. The detached PTY host can
  // outlive the app that launched it, so its own process.env may contain stale
  // launcher flags (for example NO_COLOR=1 inherited from Codex) that should
  // not leak into new terminal sessions after Workspace has restarted.
  const inheritedEnv = { ...(request.env ?? process.env) }
  delete inheritedEnv.WORKSPACE_PTY_SOCKET
  delete inheritedEnv.WORKSPACE_PTY_TOKEN
  delete inheritedEnv.ELECTRON_RUN_AS_NODE
  const env: Record<string, string | undefined> = {
    ...inheritedEnv,
    ...request.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    LANG: request.env?.LANG?.toUpperCase().includes('UTF-8') ? request.env.LANG : 'en_US.UTF-8',
    LC_ALL: request.env?.LANG?.toUpperCase().includes('UTF-8') ? request.env.LANG : 'en_US.UTF-8'
  }
  let child: pty.IPty | null = null
  let lastError: unknown
  for (const attempt of resolvePtySpawnAttempts(request.cwd, request.env?.SHELL)) {
    try {
      child = pty.spawn(attempt.file, attempt.args, {
        name: 'xterm-256color',
        cols: request.cols ?? 120,
        rows: request.rows ?? 40,
        env,
        cwd: attempt.cwd,
        encoding: null
      })
      break
    } catch (error) {
      lastError = error
    }
  }
  if (!child) throw lastError ?? new Error('PTY spawn failed')
  const session: Session = { child, chunks: [], bytes: 0, seq: 0 }
  sessions.set(request.terminalId, session)
  child.onData((data) => {
    const chunk = Buffer.from(data as unknown as Uint8Array)
    session.chunks.push(chunk)
    session.bytes += chunk.length
    while (session.bytes > MAX_REPLAY_BYTES && session.chunks.length > 1) {
      session.bytes -= session.chunks.shift()!.length
    }
    session.seq += 1
    const encoded = chunk.toString('base64')
    for (const [socket, ids] of clients) {
      if (ids.has(request.terminalId)) send(socket, { event: 'data', terminalId: request.terminalId, seq: session.seq, data: encoded })
    }
  })
  child.onExit(() => {
    sessions.delete(request.terminalId)
    for (const [socket, ids] of clients) {
      if (ids.delete(request.terminalId)) send(socket, { event: 'exit', terminalId: request.terminalId })
    }
  })
  return session
}

function handle(socket: net.Socket, request: Request): void {
  if (request.token !== token || !Number.isInteger(request.terminalId)) {
    send(socket, { id: request.id, error: 'unauthorized or invalid terminal id' })
    return
  }
  try {
    if (request.op === 'attach') {
      const existed = sessions.has(request.terminalId)
      const session = spawnSession(request)
      let ids = clients.get(socket)
      if (!ids) clients.set(socket, (ids = new Set()))
      ids.add(request.terminalId)
      send(socket, {
        id: request.id,
        result: {
          snapshot: Buffer.concat(session.chunks).toString('base64'),
          seq: session.seq,
          existed
        }
      })
      return
    }
    if (request.op === 'detach') {
      clients.get(socket)?.delete(request.terminalId)
      send(socket, { id: request.id, result: true })
      return
    }
    const session = sessions.get(request.terminalId)
    if (!session) {
      send(socket, { id: request.id, error: 'terminal session not found' })
      return
    }
    if (request.op === 'write' && request.data) session.child.write(Buffer.from(request.data, 'base64'))
    else if (request.op === 'resize') session.child.resize(request.cols ?? 120, request.rows ?? 40)
    else if (request.op === 'pause') session.child.pause()
    else if (request.op === 'resume') session.child.resume()
    else if (request.op === 'kill') {
      session.child.kill()
      sessions.delete(request.terminalId)
    }
    send(socket, { id: request.id, result: true })
  } catch (error) {
    send(socket, { id: request.id, error: error instanceof Error ? error.message : String(error) })
  }
}

const server = net.createServer((socket) => {
  clients.set(socket, new Set())
  let pending = ''
  socket.setEncoding('utf8')
  socket.on('data', (chunk) => {
    pending += chunk
    while (true) {
      const newline = pending.indexOf('\n')
      if (newline === -1) break
      const line = pending.slice(0, newline)
      pending = pending.slice(newline + 1)
      try {
        handle(socket, JSON.parse(line) as Request)
      } catch {
        send(socket, { id: -1, error: 'invalid request' })
      }
    }
  })
  socket.on('close', () => clients.delete(socket))
})

function listen(): void {
  server.listen(socketPath, () => {
    if (process.platform !== 'win32') fs.chmodSync(socketPath!, 0o600)
  })
}

server.on('error', (error: NodeJS.ErrnoException) => {
  // A competing app launch already owns the persistent host.
  if (error.code === 'EADDRINUSE') process.exit(0)
  throw error
})

if (process.platform !== 'win32' && fs.existsSync(socketPath)) {
  const probe = net.createConnection(socketPath)
  probe.once('connect', () => {
    probe.destroy()
    process.exit(0)
  })
  probe.once('error', () => {
    try { fs.unlinkSync(socketPath) } catch { /* another starter may have removed it */ }
    listen()
  })
} else {
  listen()
}
