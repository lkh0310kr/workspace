import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardWidget } from "../DashboardWidget";

type MetricPoint = { timestamp: string; requests: number; errors: number };
type CloudflareWorker = { name: string; lastModified: string | null; usageModel?: string | null };
type CloudflareAccount = {
  id: string;
  name: string;
  workers?: CloudflareWorker[];
  analytics24h?: { requests: number; errors: number; subrequests: number; cpuTimeP99: number | null } | null;
  hourly?: MetricPoint[];
};
type SupabaseProject = {
  id: string; name: string; status: string; region: string | null;
  databaseSizeMb: number | null; activeConnections: number | null;
  storageRequests: number | null; apiRequests: number | null; usageTrend: MetricPoint[];
  diskUsedBytes: number | null; diskSizeBytes: number | null; diskAvailableBytes: number | null;
  usageStatus: string; diskStatus: string; databaseMetricsStatus: string; metricsError?: string;
};
type VercelProject = { id: string; name: string; framework?: string | null; latestDeployment?: VercelDeployment | null };
type VercelDeployment = { id: string; name?: string; projectId?: string; url?: string; state?: string; readyState?: string; target?: string; createdAt?: number; ready?: number };
type ServiceSummary = {
  provider: "cloudflare" | "supabase" | "vercel";
  connected: boolean;
  error?: string;
  accounts?: CloudflareAccount[];
  projects?: SupabaseProject[] | VercelProject[];
  supplementalTokenConfigured?: boolean;
  tokenConfigured?: boolean;
  deployments?: VercelDeployment[];
  deployments24h?: { total: number; ready: number; failed: number };
  deploymentHourly?: Array<{ timestamp: string; total: number; failed: number }>;
};
type PlatformStatus = { id: string; name: string; status: string; description: string; incidentCount: number };
type StatusResponse = { services?: ServiceSummary[]; platforms?: PlatformStatus[]; updatedAt?: string };
type Series = { name: string; color: string; values: number[] };

function number(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString("ko-KR");
}

function compact(value: number): string {
  return new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function bytes(value: number | null): string {
  if (value === null) return "—";
  const gb = value / (1024 ** 3);
  return gb < 1 ? (value / (1024 ** 2)).toFixed(0) + " MB" : gb.toFixed(2) + " GB";
}

function platformState(status: string): "up" | "degraded" | "down" | "unknown" {
  if (["none", "operational"].includes(status)) return "up";
  if (["minor", "maintenance"].includes(status)) return "degraded";
  if (["major", "critical", "partial_outage", "major_outage"].includes(status)) return "down";
  return "unknown";
}

function projectState(status: string): "healthy" | "paused" | "degraded" {
  if (status === "ACTIVE_HEALTHY") return "healthy";
  if (status === "INACTIVE") return "paused";
  return "degraded";
}

function statusLabel(state: "up" | "degraded" | "down" | "unknown"): string {
  return state === "up" ? "정상" : state === "degraded" ? "주의" : state === "down" ? "장애" : "확인 불가";
}

function projectMetricStatus(status: string): string {
  switch (status) {
    case "inactive": return "일시 중지";
    case "permission_required": return "권한 확인";
    case "not_configured": return "토큰 필요";
    case "no_data": return "데이터 없음";
    case "provider_error": return "가져오기 실패";
    default: return "";
  }
}

function getHours(): Array<{ timestamp: string; label: string }> {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return Array.from({ length: 24 }, (_, index) => {
    const date = new Date(now.getTime() - (23 - index) * 60 * 60_000);
    return { timestamp: date.toISOString(), label: date.toLocaleTimeString("ko-KR", { hour: "2-digit" }) };
  });
}

function FlowChart({ series }: { series: Series[] }): React.JSX.Element {
  const hours = useMemo(getHours, []);
  const activeSeries = series.filter((item) => item.values.some((value) => value > 0));
  const maximum = Math.max(1, ...activeSeries.flatMap((item) => item.values));
  const width = 720;
  const height = 210;
  const padX = 12;
  const padY = 14;
  const chartHeight = height - padY * 2;
  const chartWidth = width - padX * 2;
  const toPath = (values: number[]) => values.map((value, index) => {
    const x = padX + (index / Math.max(1, values.length - 1)) * chartWidth;
    const y = height - padY - (value / maximum) * chartHeight;
    return (index ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
  }).join(" ");
  return (
    <div className="ops-chart-shell">
      <div className="ops-chart-legend">
        {series.map((item) => <span key={item.name}><i style={{ background: item.color }} />{item.name}</span>)}
        <span className="ops-chart-window">최근 24시간</span>
      </div>
      {activeSeries.length ? <svg className="ops-flow-chart" viewBox={"0 0 " + width + " " + height} role="img" aria-label="최근 24시간 서비스 요청 추이">
        {[0, 1, 2, 3].map((line) => {
          const y = padY + (chartHeight / 3) * line;
          return <g key={line}><line x1={padX} x2={width - padX} y1={y} y2={y} className="ops-chart-gridline" /><text x={padX} y={y - 4} className="ops-chart-y-label">{compact(Math.round(maximum * (1 - line / 3)))}</text></g>;
        })}
        {activeSeries.map((item) => <g key={item.name}>
          <path d={toPath(item.values)} fill="none" stroke={item.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ops-chart-line" />
          {item.values.map((value, index) => {
            if (index % 4 !== 0 && index !== item.values.length - 1) return null;
            const x = padX + (index / Math.max(1, item.values.length - 1)) * chartWidth;
            const y = height - padY - (value / maximum) * chartHeight;
            return <circle key={index} cx={x} cy={y} r="3" fill={item.color} className="ops-chart-point" />;
          })}
        </g>)}
      </svg> : <div className="ops-chart-empty"><span>···</span><strong>요청 추이를 모으는 중입니다</strong><small>연결된 서비스에서 시간별 데이터가 들어오면 여기에 표시됩니다.</small></div>}
      <div className="ops-chart-x-labels"><span>{hours[0]?.label}</span><span>{hours[5]?.label}</span><span>{hours[11]?.label}</span><span>{hours[17]?.label}</span><span>지금</span></div>
    </div>
  );
}

function DiskMeter({ project }: { project: SupabaseProject }): React.JSX.Element {
  const percent = project.diskUsedBytes !== null && project.diskSizeBytes ? Math.min(100, (project.diskUsedBytes / project.diskSizeBytes) * 100) : null;
  return (
    <div className="ops-disk">
      <div><span>디스크</span><strong>{bytes(project.diskUsedBytes)}{project.diskSizeBytes ? " / " + bytes(project.diskSizeBytes) : ""}</strong></div>
      {percent !== null ? <><div className="ops-meter"><i style={{ width: percent + "%" }} /></div><small>{percent.toFixed(0)}% 사용 · {bytes(project.diskAvailableBytes)} 여유</small></> : <small>{projectMetricStatus(project.diskStatus) || "용량 정보 없음"}</small>}
    </div>
  );
}

function DeploymentState({ state }: { state?: string }): React.JSX.Element {
  const normalized = (state ?? "unknown").toLowerCase();
  const status = normalized === "ready" ? "healthy" : normalized === "error" || normalized === "canceled" ? "degraded" : "pending";
  const label = status === "healthy" ? "READY" : status === "degraded" ? normalized.toUpperCase() : (state ?? "진행 중");
  return <span className={"ops-deploy-state ops-deploy-state--" + status}>{label}</span>;
}

export function ServiceStatusWidget(): React.JSX.Element {
  const [summary, setSummary] = useState<ServiceSummary[]>([]);
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [supabaseToken, setSupabaseToken] = useState("");
  const [vercelToken, setVercelToken] = useState("");
  const [showSupabaseToken, setShowSupabaseToken] = useState(false);
  const [showVercelToken, setShowVercelToken] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await window.pkmsDesktop.request<StatusResponse>("/api/services/status", { method: "GET" }).catch(() => ({ status: 0, body: {} as StatusResponse }));
    if (result.status === 200) {
      setSummary(result.body.services ?? []);
      setPlatforms(result.body.platforms ?? []);
      setUpdatedAt(result.body.updatedAt ? new Date(result.body.updatedAt) : new Date());
      setAuthenticated(true); setApiError(null);
    } else {
      setSummary([]); setPlatforms([]); setAuthenticated(result.status === 401 ? false : null);
      setApiError(result.status === 404 ? "운영 Worker에 대시보드 API가 배포되지 않았습니다." : result.status === 0 ? "PKMS API에 연결할 수 없습니다." : result.status === 401 ? null : "상태 정보를 불러오지 못했습니다. (HTTP " + result.status + ")");
    }
    setLoading(false);
  }, []);

  const login = async () => {
    setBusy("pkms"); setMessage(null);
    try {
      const started = await window.pkmsDesktop.request<{ device_code?: string; user_code?: string; verification_uri?: string; interval?: number; expires_in?: number }>("/api/auth/device/start", { method: "POST", body: { kind: "json", value: "{}" } });
      if (started.status !== 200 || !started.body.device_code || !started.body.verification_uri) throw new Error("PKMS 로그인을 시작하지 못했습니다.");
      await window.pkmsDesktop.openVerification(started.body.verification_uri);
      setMessage("GitHub 로그인 페이지에서 코드 " + (started.body.user_code ?? "") + "를 입력하세요.");
      const deadline = Date.now() + Math.min(started.body.expires_in ?? 900, 900) * 1000;
      let interval = Math.max(started.body.interval ?? 5, 5);
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, interval * 1000));
        const polled = await window.pkmsDesktop.request<{ pending?: boolean; interval?: number }>("/api/auth/device/poll", { method: "POST", body: { kind: "json", value: JSON.stringify({ deviceCode: started.body.device_code }) } });
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
      const result = await window.pkmsDesktop.request<{ url?: string; error?: string }>("/api/services/" + provider + "/connect", { method: "POST" });
      if (result.status !== 200 || !result.body.url) throw new Error(result.status === 503 ? provider + " OAuth 앱 설정이 없습니다." : result.status === 401 ? "먼저 PKMS 계정으로 로그인하세요." : "서비스 연결을 시작하지 못했습니다.");
      await window.pkmsDesktop.openServiceOAuth(result.body.url);
      setMessage(provider === "supabase" ? "Supabase 승인을 마친 뒤 돌아와 새로고침하세요." : "Cloudflare 승인을 마친 뒤 돌아와 새로고침하세요.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "연결을 시작할 수 없습니다."); }
    finally { setBusy(null); }
  };

  const disconnect = async (provider: "cloudflare" | "supabase" | "vercel") => {
    setBusy(provider); setMessage(null);
    try {
      const path = provider === "vercel" ? "/api/services/vercel/token" : "/api/services/" + provider + "/connect";
      const result = await window.pkmsDesktop.request(path, { method: "DELETE" });
      if (result.status !== 200) throw new Error("연결 정보를 삭제하지 못했습니다.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "연결 해제에 실패했습니다."); }
    finally { setBusy(null); }
  };

  const deleteSupabaseToken = async () => {
    setBusy("supabase-token"); setMessage(null);
    try {
      const result = await window.pkmsDesktop.request("/api/services/supabase/metrics-token", { method: "DELETE" });
      if (result.status !== 200) throw new Error("Supabase 보조 토큰을 삭제하지 못했습니다.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "토큰을 삭제하지 못했습니다."); }
    finally { setBusy(null); }
  };

  const saveToken = async (provider: "supabase" | "vercel", event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = provider === "supabase" ? supabaseToken.trim() : vercelToken.trim();
    if (!value) return;
    setBusy(provider + "-token"); setMessage(null);
    try {
      const path = "/api/services/" + provider + (provider === "supabase" ? "/metrics-token" : "/token");
      const result = await window.pkmsDesktop.request(path, { method: "PUT", body: { kind: "json", value: JSON.stringify({ token: value }) } });
      if (result.status !== 200) throw new Error("토큰을 저장하지 못했습니다.");
      if (provider === "supabase") { setSupabaseToken(""); setShowSupabaseToken(false); }
      else { setVercelToken(""); setShowVercelToken(false); }
      setMessage(provider === "supabase" ? "Supabase 토큰을 암호화해 저장했습니다." : "Vercel 토큰을 암호화해 저장했습니다.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "토큰 저장에 실패했습니다."); }
    finally { setBusy(null); }
  };

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 60_000); return () => window.clearInterval(timer); }, [refresh]);

  const cloudflare = summary.find((service) => service.provider === "cloudflare");
  const supabase = summary.find((service) => service.provider === "supabase");
  const vercel = summary.find((service) => service.provider === "vercel");
  const cfAccounts = cloudflare?.accounts ?? [];
  const sbProjects = (supabase?.projects ?? []) as SupabaseProject[];
  const vercelProjects = (vercel?.projects ?? []) as VercelProject[];
  const requestTotals = cfAccounts.reduce((total, account) => total + (account.analytics24h?.requests ?? 0), 0) + sbProjects.reduce((total, project) => total + (project.apiRequests ?? 0), 0);
  const errorTotals = cfAccounts.reduce((total, account) => total + (account.analytics24h?.errors ?? 0), 0);
  const activeProjects = sbProjects.filter((project) => project.status === "ACTIVE_HEALTHY").length;
  const platformHealthy = platforms.filter((platform) => platformState(platform.status) === "up").length;
  const hours = useMemo(getHours, []);
  const requestSeries = useMemo(() => {
    const toHourMap = (points: MetricPoint[]) => {
      const map = new Map<string, number>();
      for (const point of points) {
        const date = new Date(point.timestamp);
        if (!Number.isFinite(date.getTime())) continue;
        date.setUTCMinutes(0, 0, 0);
        const key = date.toISOString();
        map.set(key, (map.get(key) ?? 0) + point.requests);
      }
      return map;
    };
    const cloudflareMap = toHourMap(cfAccounts.flatMap((account) => account.hourly ?? []));
    const supabaseMap = toHourMap(sbProjects.flatMap((project) => project.usageTrend ?? []));
    return [
      { name: "Cloudflare Workers", color: "#f6821f", values: hours.map((hour) => cloudflareMap.get(hour.timestamp) ?? 0) },
      { name: "Supabase API", color: "#58c699", values: hours.map((hour) => supabaseMap.get(hour.timestamp) ?? 0) },
    ];
  }, [cfAccounts, sbProjects, hours]);

  return (
    <DashboardWidget className="dashboard-widget--wide dashboard-widget--operations" ariaLabel="서비스 흐름 및 상태" onRefresh={() => void refresh()}>
      <div className="ops-dashboard">
        <section className="ops-overview">
          <div className="ops-page-title"><div><span className="home-overline">SERVICE OBSERVABILITY</span><h1>서비스 흐름과 상태</h1><p>배포, 트래픽, 데이터베이스 상태를 한눈에 확인합니다.</p></div><div className="ops-updated"><span className={loading ? "ops-refresh-dot is-loading" : "ops-refresh-dot"} />{loading ? "동기화 중" : updatedAt ? "마지막 갱신 " + updatedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "대기 중"}</div></div>
          {apiError ? <div className="ops-alert"><span>!</span>{apiError}</div> : null}
          {authenticated === false ? <div className="ops-alert"><span>↗</span><span>계정별 지표를 연결하려면 PKMS 로그인이 필요합니다.</span><button type="button" onClick={() => void login()} disabled={busy === "pkms"}>PKMS 로그인</button></div> : null}
          <div className="ops-kpi-grid">
            <div className="ops-kpi ops-kpi--requests"><span>24H REQUESTS</span><strong>{compact(requestTotals)}</strong><small>Cloudflare + Supabase</small><i>↗</i></div>
            <div className="ops-kpi ops-kpi--errors"><span>24H ERRORS</span><strong>{number(errorTotals)}</strong><small>Cloudflare Worker invocations</small><i>!</i></div>
            <div className="ops-kpi ops-kpi--projects"><span>ACTIVE DATABASES</span><strong>{number(activeProjects)}<em> / {number(sbProjects.length)}</em></strong><small>Supabase projects</small><i>◫</i></div>
            <div className="ops-kpi ops-kpi--deploys"><span>READY DEPLOYMENTS</span><strong>{number(vercel?.deployments24h?.ready ?? 0)}</strong><small>Vercel · last 24 hours</small><i>⌁</i></div>
          </div>
        </section>

        <div className="ops-section-grid">
          <section className="ops-panel ops-panel--flow">
            <div className="ops-panel-heading"><div><span className="home-overline">TRAFFIC FLOW</span><h2>요청 추이</h2></div><span className="ops-range-pill">24시간</span></div>
            <FlowChart series={requestSeries} />
          </section>
          <section className="ops-panel ops-panel--status">
            <div className="ops-panel-heading"><div><span className="home-overline">PLATFORM STATUS</span><h2>플랫폼 상태</h2></div><span className="ops-platform-count">{platforms.length ? number(platformHealthy) + "/" + number(platforms.length) + " 정상" : "확인 중"}</span></div>
            <div className="ops-platform-list">
              {platforms.map((platform) => {
                const state = platformState(platform.status);
                return <div className="ops-platform-row" key={platform.id}><span className={"ops-state-indicator ops-state-indicator--" + state} /><span className="ops-platform-name"><strong>{platform.name}</strong><small>{platform.description}</small></span><span className={"ops-state-label ops-state-label--" + state}>{statusLabel(state)}</span>{platform.incidentCount ? <b className="ops-incident-count">{platform.incidentCount}</b> : null}</div>;
              })}
              <div className="ops-platform-row"><span className="ops-state-indicator ops-state-indicator--up" /><span className="ops-platform-name"><strong>PKMS Cloud</strong><small>상태 API 응답 정상</small></span><span className="ops-state-label ops-state-label--up">정상</span></div>
            </div>
            <div className="ops-status-foot"><span className="ops-refresh-dot" /> 공급자 공개 상태 + 실제 계정 API를 함께 확인합니다</div>
          </section>
        </div>

        <section className="ops-panel ops-panel--resources">
          <div className="ops-panel-heading"><div><span className="home-overline">CONNECTED SERVICES</span><h2>서비스 리소스</h2></div><span className="ops-count-pill">{number(cfAccounts.length + sbProjects.length + vercelProjects.length)} resources</span></div>
          <div className="ops-resource-columns">
            <section className="ops-resource-group">
              <header className="ops-provider-heading"><span className="ops-provider-icon ops-provider-icon--cf">C</span><div><strong>Cloudflare</strong><small>{cloudflare?.connected ? number(cfAccounts.reduce((sum, account) => sum + (account.workers?.length ?? 0), 0)) + " Workers" : "연결되지 않음"}</small></div>{cloudflare?.connected ? <button type="button" className="ops-text-button" onClick={() => void disconnect("cloudflare")} disabled={busy === "cloudflare"}>연결 해제</button> : <button type="button" className="ops-text-button" onClick={() => void connect("cloudflare")} disabled={busy === "cloudflare"}>계정 연결</button>}</header>
              {cloudflare?.connected ? cfAccounts.length ? cfAccounts.map((account) => <div className="ops-resource-card" key={account.id}>
                <div className="ops-resource-card-top"><div><strong>{account.name}</strong><small>{number(account.analytics24h?.requests ?? 0)} requests · {number(account.analytics24h?.errors ?? 0)} errors</small></div><span className="ops-healthy-chip">LIVE</span></div>
                <div className="ops-mini-stats"><div><small>요청</small><b>{number(account.analytics24h?.requests ?? 0)}</b></div><div><small>하위 요청</small><b>{number(account.analytics24h?.subrequests ?? 0)}</b></div><div><small>CPU p99</small><b>{account.analytics24h?.cpuTimeP99 === null || account.analytics24h?.cpuTimeP99 === undefined ? "—" : account.analytics24h.cpuTimeP99.toFixed(0) + " ms"}</b></div></div>
                <div className="ops-worker-list">{(account.workers ?? []).map((worker) => <div key={worker.name}><span className="ops-worker-dot" /><strong>{worker.name}</strong><small>{worker.lastModified ? new Date(worker.lastModified).toLocaleDateString("ko-KR") + " 배포" : "배포 시각 없음"}</small></div>)}</div>
              </div>) : <div className="ops-empty-state">배포된 Worker가 없습니다.</div> : <div className="ops-connect-state"><span>Workers 배포와 요청 지표를 연결합니다.</span><small>읽기 전용 계정 권한</small></div>}
            </section>

            <section className="ops-resource-group">
              <header className="ops-provider-heading"><span className="ops-provider-icon ops-provider-icon--sb">S</span><div><strong>Supabase</strong><small>{supabase?.connected ? number(sbProjects.length) + " projects · " + number(activeProjects) + " active" : "OAuth 미연결"}</small></div>{supabase?.connected ? <button type="button" className="ops-text-button" onClick={() => void disconnect("supabase")} disabled={busy === "supabase"}>연결 해제</button> : <button type="button" className="ops-text-button" onClick={() => void connect("supabase")} disabled={busy === "supabase"}>OAuth 연결</button>}</header>
              {supabase?.connected ? sbProjects.map((project) => {
                const state = projectState(project.status);
                return <div className={"ops-resource-card ops-project-card ops-project-card--" + state} key={project.id}>
                  <div className="ops-resource-card-top"><div><strong>{project.name}</strong><small>{project.region ?? "리전 정보 없음"}</small></div><span className={"ops-project-chip ops-project-chip--" + state}>{state === "healthy" ? "HEALTHY" : state === "paused" ? "INACTIVE" : project.status}</span></div>
                  {state === "healthy" ? <div className="ops-mini-stats"><div><small>DB 크기</small><b>{project.databaseSizeMb === null ? projectMetricStatus(project.databaseMetricsStatus) || "—" : project.databaseSizeMb.toFixed(1) + " MB"}</b></div><div><small>활성 연결</small><b>{number(project.activeConnections)}</b></div><div><small>API 요청 · 24H</small><b>{number(project.apiRequests)}</b></div></div> : <div className="ops-project-paused">프로젝트가 일시 중지되어 실시간 지표가 제공되지 않습니다.</div>}
                  <DiskMeter project={project} />
                  {project.storageRequests !== null ? <div className="ops-project-foot"><span>Storage 요청</span><strong>{number(project.storageRequests)} <small>/ 24H</small></strong></div> : null}
                </div>;
              }) : <div className="ops-connect-state"><span>프로젝트·DB 지표는 Supabase OAuth 연결에서 가져옵니다.</span><small>{supabase?.supplementalTokenConfigured ? "보조 토큰 등록 완료 · OAuth 연결 후 사용량/디스크 조회" : "Usage Analytics Read + Disk Config Read 토큰 필요"}</small></div>}
              {authenticated ? <div className="ops-token-row"><span>{supabase?.supplementalTokenConfigured ? "보조 토큰 등록됨" : "읽기 전용 Management API 토큰"}</span><div><button type="button" className="ops-text-button" onClick={() => setShowSupabaseToken((value) => !value)}>{supabase?.supplementalTokenConfigured ? "교체" : "등록"}</button>{supabase?.supplementalTokenConfigured ? <button type="button" className="ops-text-button ops-text-button--danger" onClick={() => void deleteSupabaseToken()} disabled={busy === "supabase-token"}>토큰 삭제</button> : null}</div></div> : null}
              {showSupabaseToken ? <form className="ops-token-form" onSubmit={(event) => void saveToken("supabase", event)}><input type="password" autoComplete="new-password" value={supabaseToken} onChange={(event) => setSupabaseToken(event.target.value)} placeholder="Supabase 읽기 전용 토큰" aria-label="Supabase 읽기 전용 토큰" /><button type="submit" disabled={!supabaseToken.trim() || busy === "supabase-token"}>저장</button></form> : null}
            </section>

            <section className="ops-resource-group">
              <header className="ops-provider-heading"><span className="ops-provider-icon ops-provider-icon--vc">▲</span><div><strong>Vercel</strong><small>{vercel?.connected ? number(vercelProjects.length) + " projects · " + number(vercel?.deployments24h?.total ?? 0) + " deployments / 24H" : "토큰 미연결"}</small></div>{vercel?.tokenConfigured ? <button type="button" className="ops-text-button ops-text-button--danger" onClick={() => void disconnect("vercel")} disabled={busy === "vercel"}>토큰 삭제</button> : null}</header>
              {vercel?.connected ? <>
                {(vercel?.error ? <div className="ops-connect-state"><span>토큰에 프로젝트·배포 읽기 권한이 있는지 확인하세요.</span></div> : null)}
                {vercelProjects.map((project) => {
                  const deploy = project.latestDeployment as VercelDeployment | null | undefined;
                  return <div className="ops-vercel-project" key={project.id}><div><strong>{project.name}</strong><small>{project.framework || "Vercel Project"}</small></div><div>{deploy ? <><DeploymentState state={deploy.readyState ?? deploy.state} /><small>{deploy.createdAt ? new Date(deploy.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "시간 없음"}</small></> : <small>최근 배포 없음</small>}</div></div>;
                })}
                <div className="ops-deployment-summary"><span>최근 24시간</span><b>{number(vercel?.deployments24h?.ready ?? 0)} READY</b><b className="ops-deploy-failed">{number(vercel?.deployments24h?.failed ?? 0)} FAILED</b></div>
              </> : <div className="ops-connect-state"><span>프로젝트와 최근 배포 상태를 불러옵니다.</span><small>Vercel Access Token · 읽기 전용 사용</small></div>}
              {authenticated && !vercel?.tokenConfigured ? <button type="button" className="ops-token-cta" onClick={() => setShowVercelToken((value) => !value)}>{showVercelToken ? "토큰 입력 닫기" : "Vercel 토큰 등록"}</button> : null}
              {showVercelToken ? <form className="ops-token-form" onSubmit={(event) => void saveToken("vercel", event)}><input type="password" autoComplete="new-password" value={vercelToken} onChange={(event) => setVercelToken(event.target.value)} placeholder="Vercel Access Token" aria-label="Vercel Access Token" /><button type="submit" disabled={!vercelToken.trim() || busy === "vercel-token"}>암호화해 저장</button></form> : null}
              {vercel?.error ? <small className="ops-inline-error">Vercel API에서 정보를 가져오지 못했습니다.</small> : null}
            </section>
          </div>
        </section>
        {message ? <div className="ops-toast" role="status">{message}</div> : null}
      </div>
    </DashboardWidget>
  );
}
