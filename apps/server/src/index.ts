import type { Env } from './env'
import { authenticate } from './auth'
import { handleServiceApi, handleServiceOAuthCallback } from './serviceIntegrations'
import { json } from './crypto'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/api/health')
      return json({ ok: true, service: 'workspace-home' })
    try {
      const callback = await handleServiceOAuthCallback(request, env)
      if (callback) return callback
      if (!url.pathname.startsWith('/api/services/'))
        return json({ error: 'not_found' }, { status: 404 })
      const session = await authenticate(request, env)
      if (!session) return json({ error: 'unauthorized' }, { status: 401 })
      return (
        (await handleServiceApi(request, env, session)) ??
        json({ error: 'not_found' }, { status: 404 })
      )
    } catch {
      return json({ error: 'workspace_home_request_failed' }, { status: 500 })
    }
  }
} satisfies ExportedHandler<Env>
