import { useCallback, useEffect, useState } from "react";
import { DashboardWidget } from "../DashboardWidget";

type Check = { name: string; detail: string; state: "up" | "degraded" | "unknown"; href: string };
type CloudflareWorker = { name: string; lastModified: string | null; analytics24h: { requests: number; errors: number; subrequests: number } | null };
type SupplementStatus = "available" | "not_configured" | "permission_required" | "provider_error" | "inactive" | "no_data";
type SupabaseProject = { id: string; name: string; status: string; region: string | null; databaseSizeMb: number | null; activeConnections: number | null; storageRequests: number | null; apiRequests: number | null; diskUsedBytes: number | null; usageStatus: SupplementStatus; diskStatus: SupplementStatus; metricsError?: string };
type ServiceAccount = { id: string; name: string; workers?: CloudflareWorker[]; analytics24h?: { requests: number; errors: number; subrequests: number } | null };
type ServiceSummary = { provider: "cloudflare" | "supabase"; connected: boolean; error?: string; accounts?: ServiceAccount[]; projects?: SupabaseProject[]; supplementalTokenConfigured?: boolean };

function supplementMessage(status: SupplementStatus): string {
  switch (status) {
    case "not_configured": return "보조 토큰 미등록";
    case "permission_required": return "토큰 권한 또는 프로젝트 접근 권한 확인 필요";
    case "inactive": return "비활성 프로젝트에는 제공되지 않음";
    case "no_data": return "집계 데이터 없음";
    case "provider_error": return "Supabase에서 지표를 가져오지 못함";
    default: return "";
  }
}

const checks: Array<{ name: string; url: string; href: string; detail: string }> = [
  { name: "PKMS Cloud", url: "https://pkms-cloud.lkh0310kr.workers.dev/api/health", href: "https://pkms-cloud.lkh0310kr.workers.dev", detail: "Cloudflare Worker" },
  { name: "Cloudflare", url: "https://www.cloudflarestatus.com/api/v2/status.json", href: "https://www.cloudflarestatus.com", detail: "플랫폼 상태" },
  { name: "Supabase", url: "https://status.supabase.com/api/v2/status.json", href: "https://status.supabase.com", detail: "플랫폼 상태" },
];

async function checkService(item: (typeof checks)[number]): Promise<Check> {
  try {
    if (item.name === "PKMS Cloud") {
      const result = await window.pkmsDesktop.request<{ ok?: boolean }>("/api/health", { method: "GET" });
      return { ...item, state: result.status === 200 && result.body.ok ? "up" : "degraded", detail: result.status === 200 ? item.detail : `HTTP ${result.status}` };
    }
    const response = await fetch(item.url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!response.ok) return { ...item, state: "degraded", detail: `HTTP ${response.status}` };
    const body = await response.json() as { ok?: boolean; status?: { indicator?: string; description?: string } };
    const healthy = body.ok === true || body.status?.indicator === "none";
    return { ...item, state: healthy ? "up" : "degraded", detail: body.status?.description ?? item.detail };
  } catch {
    return { ...item, state: "unknown", detail: "상태를 확인할 수 없습니다" };
  }
}

export function ServiceStatusWidget(): React.JSX.Element {
  const [items, setItems] = useState<Check[]>([]);
  const [updated, setUpdated] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ServiceSummary[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [metricsToken, setMetricsToken] = useState("");
  const [showTokenForm, setShowTokenForm] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    const [result, accountResult] = await Promise.all([
      Promise.all(checks.map(checkService)),
      window.pkmsDesktop.request<{ services?: ServiceSummary[] }>("/api/services/status", { method: "GET" }).catch(() => ({ status: 0, body: {} as { services?: ServiceSummary[] } })),
    ]);
    setItems(result);
    if (accountResult.status === 200) { setSummary(accountResult.body.services ?? []); setAuthenticated(true); setApiError(null); }
    else {
      setSummary([]);
      setAuthenticated(accountResult.status === 401 ? false : null);
      setApiError(accountResult.status === 404 ? "서비스 연동 API가 운영 Worker에 아직 배포되지 않았습니다. apps/web Worker를 배포하거나 로컬 Worker에 연결하세요." : accountResult.status === 0 ? "PKMS API에 연결할 수 없습니다." : accountResult.status === 401 ? null : `서비스 API 요청 실패 (HTTP ${accountResult.status})`);
    }
    setUpdated(Date.now());
    setLoading(false);
  }, []);

  const login = async () => {
    setBusy("pkms"); setMessage(null);
    try {
      const started = await window.pkmsDesktop.request<{ device_code?: string; user_code?: string; verification_uri?: string; interval?: number; expires_in?: number; error?: string }>("/api/auth/device/start", { method: "POST", body: { kind: "json", value: "{}" } });
      if (started.status !== 200 || !started.body.device_code || !started.body.verification_uri) throw new Error("PKMS 로그인을 시작하지 못했습니다.");
      await window.pkmsDesktop.openVerification(started.body.verification_uri);
      setMessage(`GitHub 로그인 페이지에서 코드 ${started.body.user_code ?? ""}를 입력하세요.`);
      const deadline = Date.now() + Math.min(started.body.expires_in ?? 900, 900) * 1000;
      let interval = Math.max(started.body.interval ?? 5, 5);
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, interval * 1000));
        const polled = await window.pkmsDesktop.request<{ pending?: boolean; interval?: number; error?: string }>("/api/auth/device/poll", { method: "POST", body: { kind: "json", value: JSON.stringify({ deviceCode: started.body.device_code }) } });
        if (polled.status === 202 || polled.body.pending) { interval = Math.max(polled.body.interval ?? interval, 5); continue; }
        if (polled.status !== 200) throw new Error("PKMS 로그인이 거부되었거나 만료되었습니다.");
        setAuthenticated(true); setMessage("PKMS 로그인 완료"); await refresh(); return;
      }
      throw new Error("PKMS 로그인 코드가 만료되었습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "PKMS 로그인에 실패했습니다."); }
    finally { setBusy(null); }
  };

  const connect = async (provider: "cloudflare" | "supabase") => {
    setBusy(provider); setMessage(null);
    try {
      const result = await window.pkmsDesktop.request<{ url?: string; error?: string }>(`/api/services/${provider}/connect`, { method: "POST" });
      if (result.status !== 200 || !result.body.url) throw new Error(result.status === 404 ? "서비스 연동 API가 운영 Worker에 아직 배포되지 않았습니다. apps/web Worker를 배포하거나 로컬 Worker에 연결하세요." : result.status === 503 ? `${provider === "cloudflare" ? "Cloudflare" : "Supabase"} OAuth 앱 설정이 Worker에 없습니다.` : result.status === 401 ? "먼저 PKMS 계정에 로그인하세요." : result.body.error ?? "연결을 시작할 수 없습니다.");
      await window.pkmsDesktop.openServiceOAuth(result.body.url);
      setMessage(`${provider === "cloudflare" ? "Cloudflare" : "Supabase"} 로그인 창을 열었습니다. 완료 후 새로고침하세요.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "서비스 연결에 실패했습니다."); }
    finally { setBusy(null); }
  };

  const disconnect = async (provider: "cloudflare" | "supabase") => {
    setBusy(provider); setMessage(null);
    try {
      const result = await window.pkmsDesktop.request(`/api/services/${provider}/connect`, { method: "DELETE" });
      if (result.status !== 200) throw new Error("연결을 해제하지 못했습니다.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "연결 해제에 실패했습니다."); }
    finally { setBusy(null); }
  };

  const saveMetricsToken = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!metricsToken.trim()) return;
    setBusy("supabase-token"); setMessage(null);
    try {
      const result = await window.pkmsDesktop.request("/api/services/supabase/metrics-token", {
        method: "PUT", body: { kind: "json", value: JSON.stringify({ token: metricsToken.trim() }) },
      });
      if (result.status !== 200) throw new Error("보조 토큰을 저장하지 못했습니다.");
      setMetricsToken(""); setShowTokenForm(false); setMessage("Supabase 읽기 전용 토큰을 저장했습니다."); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "보조 토큰 저장에 실패했습니다."); }
    finally { setBusy(null); }
  };

  const removeMetricsToken = async () => {
    setBusy("supabase-token"); setMessage(null);
    try {
      const result = await window.pkmsDesktop.request("/api/services/supabase/metrics-token", { method: "DELETE" });
      if (result.status !== 200) throw new Error("보조 토큰을 삭제하지 못했습니다.");
      setShowTokenForm(false); setMessage("Supabase 보조 토큰을 삭제했습니다."); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "보조 토큰 삭제에 실패했습니다."); }
    finally { setBusy(null); }
  };

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 60_000); return () => window.clearInterval(timer); }, [refresh]);

  return (
    <DashboardWidget className="dashboard-widget--wide" ariaLabel="서비스 상태" onRefresh={() => void refresh()}>
      <div className="service-status-widget">
        <div className="service-status-heading"><div><span className="home-overline">SYSTEM STATUS</span><h3>서비스 상태</h3></div><span>{loading ? "확인 중…" : updated ? `갱신 ${new Date(updated).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : ""}</span></div>
        <div className="service-status-grid">
          {items.map((item) => <a className="service-status-card" href={item.href} target="_blank" rel="noreferrer" key={item.name}>
            <span className={`service-status-dot service-status-dot--${item.state}`} />
            <span className="service-status-copy"><strong>{item.name}</strong><small>{item.detail}</small></span>
            <span className="service-status-value">{item.state === "up" ? "정상" : item.state === "degraded" ? "확인 필요" : "알 수 없음"}</span>
          </a>)}
        </div>
        <div className="service-account-heading"><span className="home-overline">CONNECTED ACCOUNTS</span><span>계정 지표</span></div>
        {apiError ? <p className="service-status-message" role="status">{apiError}</p> : null}
        {authenticated === false ? <div className="service-login-prompt"><span>계정 지표를 보려면 PKMS 계정으로 인증하세요.</span><button type="button" onClick={() => void login()} disabled={busy === "pkms"}>{busy === "pkms" ? "GitHub 승인 대기 중…" : "PKMS 로그인"}</button></div> : null}
        <div className="service-account-grid">
          {(["cloudflare", "supabase"] as const).map((provider) => {
            const service = summary.find((item) => item.provider === provider);
            const label = provider === "cloudflare" ? "Cloudflare" : "Supabase";
            return <div className="service-account-card" key={provider}>
              <div className="service-account-top"><strong>{label}</strong>{service?.connected ? <button type="button" onClick={() => void disconnect(provider)} disabled={busy === provider}>연결 해제</button> : <button type="button" onClick={() => void connect(provider)} disabled={busy === provider}>{busy === provider ? "연결 중…" : "로그인 연결"}</button>}</div>
              {!service?.connected ? <small>{service ? "Supabase 지표를 보려면 계정을 연결하세요." : authenticated ? "연결 상태를 가져오지 못했습니다." : "먼저 PKMS 계정에 로그인하세요."}</small> : provider === "cloudflare" ? <div className="service-resource-list">{(service.accounts ?? []).map((account) => <div key={account.id}><b>{account.name}</b><small>{account.workers?.length ?? 0} Workers{account.analytics24h ? ` · ${account.analytics24h.requests.toLocaleString()} requests / ${account.analytics24h.errors.toLocaleString()} errors (24h)` : " · Analytics unavailable"}</small>{account.workers?.slice(0, 6).map((worker) => <small className="service-resource-line" key={worker.name}>{worker.name} · 배포 {worker.lastModified ? new Date(worker.lastModified).toLocaleString() : "정보 없음"}</small>)}</div>)}</div> : <div className="service-resource-list">{(service.projects ?? []).map((project) => <div key={project.id}><b>{project.name}</b><small>{project.status}{project.region ? ` · ${project.region}` : ""}</small><small>{project.databaseSizeMb === null ? "DB 크기 정보 없음" : `DB ${project.databaseSizeMb.toLocaleString()} MB`}{project.activeConnections === null ? "" : ` · 활성 연결 ${project.activeConnections.toLocaleString()}`}</small><small>{project.diskUsedBytes === null ? `디스크: ${supplementMessage(project.diskStatus)}` : `디스크 사용 ${(project.diskUsedBytes / (1024 ** 3)).toFixed(2)} GB`}</small><small>{project.apiRequests === null ? `API 요청: ${supplementMessage(project.usageStatus)}` : `API ${project.apiRequests.toLocaleString()} 요청`}{project.storageRequests === null ? "" : ` · Storage ${project.storageRequests.toLocaleString()} 요청`}</small>{project.metricsError ? <small>DB 기본 지표: 제공자 응답 오류</small> : null}</div>)}</div>}
              {provider === "supabase" ? authenticated ? <>
                <div className="service-token-controls"><div><small>{service?.supplementalTokenConfigured ? "읽기 전용 보조 토큰이 등록되어 있습니다." : "API 요청량과 디스크 지표에는 별도의 읽기 전용 토큰이 필요합니다."}</small><small>필요 권한: Usage Analytics Read, Disk Config Read</small></div><div className="service-token-actions"><button type="button" onClick={() => setShowTokenForm((shown) => !shown)}>{service?.supplementalTokenConfigured ? "토큰 교체" : "토큰 등록"}</button>{service?.supplementalTokenConfigured ? <button type="button" onClick={() => void removeMetricsToken()} disabled={busy === "supabase-token"}>토큰 삭제</button> : null}</div></div>
                {showTokenForm ? <form className="service-token-form" onSubmit={(event) => void saveMetricsToken(event)}><label>Supabase Management API 읽기 전용 토큰<input type="password" autoComplete="new-password" value={metricsToken} onChange={(event) => setMetricsToken(event.target.value)} placeholder="토큰은 저장 후 다시 표시되지 않습니다" /></label><div><button type="submit" disabled={busy === "supabase-token" || !metricsToken.trim()}>{busy === "supabase-token" ? "저장 중…" : "암호화해 저장"}</button><button type="button" onClick={() => { setShowTokenForm(false); setMetricsToken(""); }}>취소</button></div></form> : null}
              </> : <small>토큰 설정 전에 PKMS 계정으로 로그인하세요.</small> : null}
            </div>;
          })}
        </div>
        {message ? <p className="service-status-message" role="status">{message}</p> : null}
        <p className="service-status-note">공개 상태와 계정 지표를 확인합니다. 상태 갱신은 1분마다 이루어집니다.</p>
      </div>
    </DashboardWidget>
  );
}
