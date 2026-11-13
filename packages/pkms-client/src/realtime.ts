import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { PkmsRealtimeMessage, PkmsUser } from "@pkms/protocol/types";

export type RealtimeUser = PkmsUser;
export type RealtimeEnvelope = PkmsRealtimeMessage;
type Api = <T>(path: string, init?: RequestInit) => Promise<T>;
type RealtimeStatus = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED" | "CONNECT_ERROR" | "SYSTEM_ERROR" | "SOCKET_CREATED" | "SOCKET_OPEN" | "SOCKET_CLOSE" | "SOCKET_ERROR";
type SocketDiagnostic = (status: "SOCKET_CREATED" | "SOCKET_OPEN" | "SOCKET_CLOSE" | "SOCKET_ERROR", closeCode?: number, wasClean?: boolean) => void;
function diagnosticWebSocket(report: SocketDiagnostic): typeof WebSocket {
  return class DiagnosticWebSocket extends WebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      report("SOCKET_CREATED");
      this.addEventListener("open", () => report("SOCKET_OPEN"));
      this.addEventListener("close", (event) => report("SOCKET_CLOSE", event.code, event.wasClean));
      this.addEventListener("error", () => report("SOCKET_ERROR"));
    }
  };
}
function errorMetadata(error: unknown, fallbackCode?: string): { errorType?: string; errorCode?: string } {
  if (!error || typeof error !== "object") return {};
  const value = error as { name?: unknown; code?: unknown };
  const safe = (input: unknown) => typeof input === "string" && /^[A-Za-z0-9_.:-]{1,64}$/.test(input) ? input : undefined;
  return { errorType: safe(value.name), errorCode: safe(value.code) ?? safe(fallbackCode) };
}

export class PKMSRealtimeSocket {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: (() => void) | null = null;
  private client?: SupabaseClient;
  private channel?: RealtimeChannel;
  private accessToken?: string;
  private tokenTimer = 0;
  private closed = false;

  constructor(private readonly workspaceId: string, private readonly clientId: string, private readonly user: RealtimeUser, private readonly api: Api) {}

  async connect(): Promise<void> {
    let failurePhase = "connect_config";
    try {
      const config = await this.api<{ url: string; anonKey: string; issuer: string }>("/api/realtime/config");
      failurePhase = "connect_token";
      const initial = await this.api<{ token: string }>("/api/realtime/token");
      if (this.closed) return;
      this.accessToken = initial.token;
      failurePhase = "connect_token_claims";
      const tokenParts = initial.token.split(".");
      const encodedClaims = tokenParts[1]?.replaceAll("-", "+").replaceAll("_", "/");
      const claims = encodedClaims ? JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encodedClaims.padEnd(Math.ceil(encodedClaims.length / 4) * 4, "=")), (char) => char.charCodeAt(0)))) as Record<string, unknown> : {};
      const appMetadata = claims.app_metadata && typeof claims.app_metadata === "object" ? claims.app_metadata as Record<string, unknown> : {};
      void this.api<void>(`/api/workspaces/${encodeURIComponent(this.workspaceId)}/diagnostics/realtime`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "TOKEN_CHECK", clientId: this.clientId, tokenRole: claims.role, issuerMatches: claims.iss === config.issuer.replace(/\/$/, ""), loginMatches: appMetadata.github_login === this.user.login.toLowerCase(), subjectPresent: typeof claims.sub === "string" && claims.sub.length > 0 }),
      }).catch(() => {});
      const reportSocket: SocketDiagnostic = (status, closeCode, wasClean) => { void this.reportStatus(status, undefined, closeCode, wasClean); };
      this.client = createClient(config.url, config.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        realtime: { transport: diagnosticWebSocket(reportSocket), logLevel: "info" },
        accessToken: async () => this.accessToken ?? null,
      });
      failurePhase = "connect_set_auth";
      await this.client.realtime.setAuth(initial.token);
      const topic = `pkms:${this.workspaceId}`;
      failurePhase = "connect_create_channel";
      const channel = this.client.channel(topic, {
        config: { private: true, presence: { key: this.clientId }, broadcast: { self: false } },
      });
      this.channel = channel;
      failurePhase = "connect_register_handlers";
      channel.on("broadcast", { event: "protocol" }, ({ payload }) => this.dispatch(payload as RealtimeEnvelope));
      const dispatchPeers = () => {
        const peers = Object.values(channel.presenceState()).flat().flatMap((presence) => {
          const value = presence as { clientId?: unknown; login?: unknown; avatarUrl?: unknown; fileId?: unknown };
          if (typeof value.clientId !== "string" || typeof value.login !== "string") return [];
          return [{
            clientId: value.clientId,
            login: value.login,
            ...(typeof value.avatarUrl === "string" ? { avatarUrl: value.avatarUrl } : {}),
            ...(typeof value.fileId === "string" ? { fileId: value.fileId } : {}),
          }];
        });
        this.dispatch({ type: "presence-state", peers });
      };
      channel.on("presence", { event: "sync" }, dispatchPeers);
      channel.on("presence", { event: "join" }, dispatchPeers);
      channel.on("presence", { event: "leave" }, dispatchPeers);
      channel.on("system", {}, (payload: { status?: unknown; message?: unknown }) => {
        if (payload.status === "error") {
          const message = typeof payload.message === "string" ? payload.message : "";
          const code = /client.*presence.*rate.*limit/i.test(message) ? "ClientPresenceRateLimitReached"
            : /rate.*limit/i.test(message) ? "rate_limit"
            : /row.level security|rls/i.test(message) ? "row_security"
            : /permission denied.*(table|schema)/i.test(message) ? "database_privilege"
            : /not authorized|unauthorized/i.test(message) ? "unauthorized"
            : /policy/i.test(message) ? "policy_check"
            : /permission[s]?[^.]{0,40}to read|read[^.]{0,40}permission/i.test(message) ? "read_permission_denied"
            : /permission[s]?[^.]{0,40}to write|write[^.]{0,40}permission/i.test(message) ? "write_permission_denied"
            : /permission/i.test(message) ? "permission_denied"
            : /jwt|token|auth/i.test(message) ? "authorization"
            : /timeout|timed out/i.test(message) ? "timeout"
            : "unclassified";
          void this.reportStatus("SYSTEM_ERROR", { name: "RealtimeSystemError", code });
        }
      });
      failurePhase = "connect_subscribe";
      channel.subscribe((status, error) => {
        if (this.closed && status === "CLOSED") return;
        if (status === "SUBSCRIBED") {
          void this.reportStatus("SUBSCRIBED");
          this.readyState = 1;
          this.onopen?.();
          this.tokenTimer = window.setInterval(() => { void this.refreshToken(); }, 10 * 60 * 1000);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          void this.reportStatus(status, error);
          this.readyState = 3;
          const notify = !this.closed;
          this.cleanup();
          if (notify) this.onclose?.();
        }
      });
    } catch (error) {
      void this.reportStatus("CONNECT_ERROR", error, undefined, undefined, failurePhase);
      this.readyState = 3;
      const notify = !this.closed;
      this.cleanup();
      if (notify) this.onclose?.();
    }
  }

  private reportStatus(status: RealtimeStatus, error?: unknown, closeCode?: number, wasClean?: boolean, errorCode?: string): Promise<void> {
    return this.api<void>(`/api/workspaces/${encodeURIComponent(this.workspaceId)}/diagnostics/realtime`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, ...errorMetadata(error, errorCode), closeCode, wasClean, connectionState: this.client?.realtime.connectionState(), transportClass: this.client?.realtime.transport.name, clientId: this.clientId }),
    }).then(() => {}).catch(() => {});
  }

  send(raw: string): void {
    const channel = this.channel;
    if (this.readyState !== 1 || !channel) return;
    let envelope: RealtimeEnvelope;
    try { envelope = JSON.parse(raw) as RealtimeEnvelope; } catch { return; }
    if (envelope.type === "hello" || envelope.type === "presence") {
      void channel.track({ clientId: this.clientId, login: this.user.login, avatarUrl: this.user.avatarUrl, fileId: envelope.fileId });
      return;
    }
    if (envelope.type !== "document-update" || !envelope.fileId || !envelope.operationId || !envelope.update) return;
    void this.api<RealtimeEnvelope>(`/api/workspaces/${encodeURIComponent(this.workspaceId)}/files/${encodeURIComponent(envelope.fileId)}/updates`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope),
    }).then((ack) => this.dispatch({ ...ack, type: "ack", fileId: envelope.fileId, operationId: envelope.operationId }))
      .catch((error: unknown) => this.dispatch({ type: "error", operationId: envelope.operationId, message: error instanceof Error ? error.message : "Could not save this change." }));
  }

  close(): void {
    this.cleanup();
    this.onclose?.();
  }

  private cleanup(): void {
    this.closed = true;
    this.readyState = 3;
    window.clearInterval(this.tokenTimer);
    if (this.channel && this.client) {
      void this.client.removeChannel(this.channel).catch(() => {});
    }
    this.channel = undefined;
  }

  private async refreshToken(): Promise<void> {
    try {
      const result = await this.api<{ token: string }>("/api/realtime/token");
      this.accessToken = result.token;
      await this.client?.realtime.setAuth(result.token);
    } catch {
      this.dispatch({ type: "error", message: "Live sync authorization expired. Reconnecting…" });
      this.close();
    }
  }

  private dispatch(envelope: RealtimeEnvelope): void {
    if (!this.closed) this.onmessage?.({ data: JSON.stringify(envelope) } as MessageEvent<string>);
  }
}
