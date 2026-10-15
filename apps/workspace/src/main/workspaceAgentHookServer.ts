import http from 'node:http'
import type { WebContents } from 'electron'
import type { AgentStatusIpcPayload } from '../shared/agent-status-ipc'
import { parseAgentStatusPaneIdentity } from '../shared/agent-status-pane-key'

const terminalIdToPaneKey = new Map<number, string>()

let server: http.Server | null = null
let hookPort: number | null = null
let getTargetWebContents: (() => WebContents | null) | null = null

export function setWorkspaceAgentHookBroadcastTarget(getter: () => WebContents | null): void {
  getTargetWebContents = getter
}

export function registerTerminalAgentPaneKey(terminalId: number, paneKey: string): void {
  terminalIdToPaneKey.set(terminalId, paneKey)
}

export function unregisterTerminalAgentPaneKey(terminalId: number): void {
  terminalIdToPaneKey.delete(terminalId)
}

export function getWorkspaceAgentHookPort(): number | null {
  return hookPort
}

function sendStatus(payload: AgentStatusIpcPayload): void {
  const wc = getTargetWebContents?.()
  if (!wc || wc.isDestroyed()) return
  wc.send('agentStatus:set', payload)
}

function sendClear(paneKey: string): void {
  const wc = getTargetWebContents?.()
  if (!wc || wc.isDestroyed()) return
  wc.send('agentStatus:clear', { paneKey })
}

function resolvePaneKey(body: Record<string, unknown>): string | null {
  const paneKey = typeof body.paneKey === 'string' ? body.paneKey : null
  if (paneKey) return paneKey
  const terminalId = typeof body.terminalId === 'number' ? body.terminalId : Number(body.terminalId)
  if (Number.isFinite(terminalId)) {
    return terminalIdToPaneKey.get(terminalId) ?? null
  }
  return null
}

export function startWorkspaceAgentHookServer(): Promise<number> {
  if (server && hookPort !== null) {
    return Promise.resolve(hookPort)
  }
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('ok')
        return
      }
      if (req.method !== 'POST') {
        res.writeHead(405)
        res.end()
        return
      }
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
          const paneKey = resolvePaneKey(body)
          if (!paneKey) {
            res.writeHead(400, { 'Content-Type': 'text/plain' })
            res.end('paneKey or terminalId required')
            return
          }
          if (req.url === '/clear' || body.clear === true) {
            sendClear(paneKey)
            res.writeHead(204)
            res.end()
            return
          }
          const state = body.state
          if (state !== 'working' && state !== 'blocked' && state !== 'waiting' && state !== 'done') {
            res.writeHead(400, { 'Content-Type': 'text/plain' })
            res.end('invalid state')
            return
          }
          const identity = parseAgentStatusPaneIdentity(paneKey)
          const now = Date.now()
          const payload: AgentStatusIpcPayload = {
            paneKey,
            state,
            prompt: typeof body.prompt === 'string' ? body.prompt : undefined,
            agentType: typeof body.agentType === 'string' ? body.agentType : undefined,
            workingMode: body.workingMode === 'monitoring' ? 'monitoring' : undefined,
            receivedAt: now,
            evidenceObservedAt: now,
            stateStartedAt: typeof body.stateStartedAt === 'number' ? body.stateStartedAt : now,
            workspaceTabId: identity?.workspaceTabId,
          }
          sendStatus(payload)
          res.writeHead(204)
          res.end()
        } catch {
          res.writeHead(400)
          res.end('bad json')
        }
      })
    })
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('hook server address unknown'))
        return
      }
      hookPort = addr.port
      resolve(hookPort)
    })
  })
}
