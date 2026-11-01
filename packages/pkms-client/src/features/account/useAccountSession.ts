import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useSearchParams } from "react-router";
import type { User, Workspace } from "../../domain/types";
import { desktopBridge } from "../../platform/desktopApi";

interface Options {
  request: <T = unknown>(path: string, options?: RequestInit) => Promise<T>;
  setError: Dispatch<SetStateAction<string>>;
  setActiveWorkspace: Dispatch<SetStateAction<Workspace | null>>;
}

export function useAccountSession({ request, setError, setActiveWorkspace }: Options) {
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [deviceFlow, setDeviceFlow] = useState<{ deviceCode: string; userCode: string; verificationUri: string; interval: number; expiresAt: number } | null>(null);
  const mounted = useRef(true);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    const result = await request<{ workspaces: Workspace[] }>("/api/workspaces");
    setWorkspaces(result.workspaces);
    setActiveWorkspace((previous) => previous ? result.workspaces.find((item) => item.id === previous.id) ?? previous : result.workspaces[0] ?? null);
  }, [request, setActiveWorkspace]);

  const beginDesktopSignIn = useCallback(async () => {
    const desktop = desktopBridge();
    if (!desktop) return;
    setError(""); setDeviceFlow(null);
    try {
      const flow = await request<{ device_code: string; user_code: string; verification_uri: string; expires_in: number; interval: number }>("/api/auth/device/start", { method: "POST" });
      const expiresAt = Date.now() + flow.expires_in * 1000;
      setDeviceFlow({ deviceCode: flow.device_code, userCode: flow.user_code, verificationUri: flow.verification_uri, interval: flow.interval, expiresAt });
      await desktop.openVerification(flow.verification_uri);
      let delay = Math.max(flow.interval, 5);
      while (mounted.current && Date.now() < expiresAt) {
        await new Promise((resolve) => window.setTimeout(resolve, delay * 1000));
        if (!mounted.current) return;
        const result = await request<{ pending?: boolean; interval?: number; user?: User }>("/api/auth/device/poll", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceCode: flow.device_code }),
        });
        if (result.pending) { delay = Math.max(result.interval ?? flow.interval, 5); continue; }
        if (!result.user) throw new Error("Device authorization returned no user");
        setDeviceFlow(null); setUser(result.user);
        await refreshWorkspaces();
        return;
      }
      if (mounted.current) { setDeviceFlow(null); setError("GitHub sign-in expired. Try again."); }
    } catch (cause) {
      if (mounted.current) { setDeviceFlow(null); setError(cause instanceof Error ? cause.message : "GitHub sign-in failed"); }
    }
  }, [refreshWorkspaces, request, setError]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const result = await request<{ user: User | null }>("/api/session");
        if (!alive) return;
        setUser(result.user);
        if (result.user) await refreshWorkspaces();
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : "Could not load your session");
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [refreshWorkspaces, request, setError]);

  useEffect(() => {
    const reason = searchParams.get("auth_error");
    if (!reason) return;
    const requestId = searchParams.get("request_id");
    const messages: Record<string, string> = {
      github_access_denied: "GitHub access was declined.", github_account_not_allowed: "This GitHub account is not allowed.",
      github_authorization_failed: "GitHub authorization failed.", invalid_oauth_state: "Sign-in expired. Try again.",
      github_code_rejected: "GitHub rejected the sign-in code.", github_token_missing: "GitHub did not return an access token.",
      github_user_lookup_failed: "Could not read the GitHub account.", github_credentials_store_failed: "Could not save GitHub credentials.",
      session_create_failed: "Could not create a session.", github_token_exchange_failed: "Could not exchange the GitHub sign-in code.",
      oauth_callback_internal_error: "GitHub sign-in failed. Check the request log.",
    };
    setError(`${messages[reason] ?? "GitHub sign-in failed."}${requestId ? ` · ${requestId}` : ""}`);
    const next = new URLSearchParams(searchParams);
    next.delete("auth_error"); next.delete("request_id");
    setSearchParams(next, { replace: true });
  }, [searchParams, setError, setSearchParams]);

  const clearAccount = useCallback(() => { setUser(null); setWorkspaces([]); setActiveWorkspace(null); }, [setActiveWorkspace]);
  return { user, workspaces, loading, deviceFlow, mounted, refreshWorkspaces, beginDesktopSignIn, clearAccount };
}
