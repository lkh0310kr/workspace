import type { Route } from "./+types/health";

export function loader(_: Route.LoaderArgs) {
  return Response.json({ ok: true, service: "pkms", protocolVersion: 1 });
}
