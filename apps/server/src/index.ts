import type { Env } from './env'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/api/health')
      return Response.json({ ok: true, service: 'workspace-server' })
    return Response.json({ error: 'not_found' }, { status: 404 })
  }
} satisfies ExportedHandler<Env>
