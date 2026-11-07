import { createRequestHandler } from "react-router";

interface WebEnv { ASSET_FILES: Fetcher; PKMS_SERVER: Fetcher; PKMS_SERVER_ORIGIN: string; PKMS_CANONICAL_ORIGIN: string; }

const serverRoutes = ["/api/", "/.well-known/", "/mcp", "/oauth/"];
const requestHandler = createRequestHandler(() => import("virtual:react-router/server-build"), import.meta.env.MODE);

async function forwardToPkmsServer(request: Request, env: WebEnv): Promise<Response> {
  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, env.PKMS_SERVER_ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete("Origin");
  headers.delete("Host");
  const upstream = new Request(target, { method: request.method, headers, body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body, redirect: "manual" });
  return env.PKMS_SERVER.fetch(upstream);
}

export default {
  async fetch(request: Request, env: WebEnv, ctx: ExecutionContext): Promise<Response> {
    const incoming = new URL(request.url);
    const path = incoming.pathname;
    if (request.headers.get("X-PKMS-Web-Internal") !== "1") {
      return Response.redirect(new URL(`${path}${incoming.search}`, env.PKMS_CANONICAL_ORIGIN).toString(), 302);
    }
    if (serverRoutes.some(route => path.startsWith(route))) return forwardToPkmsServer(request, env);
    const asset = await env.ASSET_FILES.fetch(request);
    if (asset.status !== 404) return asset;
    return requestHandler(request);
  },
} satisfies ExportedHandler<WebEnv>;
