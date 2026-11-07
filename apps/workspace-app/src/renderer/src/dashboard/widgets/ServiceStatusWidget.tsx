import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardWidget } from "../DashboardWidget";

type MetricPoint = { timestamp: string; requests: number; errors?: number; subrequests?: number; cpuTimeP99?: number | null; authRequests?: number; realtimeRequests?: number; restRequests?: number; storageRequests?: number };
type GraphRange = "1h" | "24h" | "7d";
type GraphMetric = "requests" | "errors" | "subrequests";
type CloudflareWorker = { name: string; lastModified: string | null; usageModel?: string | null; dashboardUrl?: string; requests24h?: number | null; errors24h?: number | null; subrequests24h?: number | null; cpuTimeP99?: number | null };
type CloudflareAccount = {
  id: string;
  name: string;
  dashboardUrl?: string;
  workers?: CloudflareWorker[];
  analytics24h?: { requests: number; errors: number; subrequests: number; cpuTimeP99: number | null } | null;
  analyticsStatus?: "available" | "provider_error";
  trend?: MetricPoint[];
};
type SupabaseProject = {
  id: string; name: string; status: string; region: string | null;
  databaseSizeMb: number | null; activeConnections: number | null;
  storageRequests: number | null; apiRequests: number | null; usageTrend: MetricPoint[];
  diskUsedBytes: number | null; diskSizeBytes: number | null; diskAvailableBytes: number | null;
  usageStatus: string; diskStatus: string; databaseMetricsStatus: string; metricsError?: string;
};
type VercelProject = { id: string; name: string; framework?: string | null; dashboardUrl?: string | null; latestDeployment?: VercelDeployment | null };
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
type PlatformIncident = { id: string; name: string; status: string; impact: string; updatedAt: string | null; url: string; update: string; components: Array<{ name: string; status: string }> };
type PlatformStatus = { id: string; name: string; status: string; description: string; incidentCount: number; incidents?: PlatformIncident[]; maintenanceCount?: number; statusUrl?: string };
type StatusResponse = { services?: ServiceSummary[]; platforms?: PlatformStatus[]; updatedAt?: string };
type Series = { name: string; color: string; values: number[] };

function number(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString("ko-KR");
}

function compact(value: number): string {
  return new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function deploymentUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value.startsWith("https://") ? value : "https://" + value);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch { return null; }
}

function bytes(value: number | null): string {
  if (value === null) return "—";
  const gb = value / (1024 ** 3);
  return gb < 1 ? (value / (1024 ** 2)).toFixed(0) + " MB" : gb.toFixed(2) + " GB";
}

function platformState(status: string, description = ""): "up" | "degraded" | "down" | "unknown" {
  if (["none", "operational"].includes(status)) return "up";
  if (["minor", "maintenance", "degraded_performance", "partial_outage"].includes(status)) return "degraded";
  if (["major", "critical", "major_outage"].includes(status)) return /partial|minor|degrad/i.test(description) ? "degraded" : "down";
  return "unknown";
}

function projectState(status: string): "healthy" | "paused" | "degraded" {
  if (status === "ACTIVE_HEALTHY") return "healthy";
  if (status === "INACTIVE") return "paused";
  return "degraded";
}

function statusLabel(state: "up" | "degraded" | "down" | "unknown"): string {
  return state === "up" ? "정상" : state === "degraded" ? "일부 영향" : state === "down" ? "서비스 장애" : "확인 불가";
}

function platformDescription(status: string, fallback: string): string {
  if (/partial/i.test(fallback)) return "일부 서비스에 영향";
  switch (status) {
    case "none": case "operational": return "모든 시스템 정상";
    case "minor": return "일부 서비스 성능 저하";
    case "maintenance": return "계획된 점검";
    case "major": return "주요 서비스 장애";
    case "partial_outage": return "일부 서비스 장애";
    case "major_outage": return "광범위한 서비스 장애";
    default: return fallback;
  }
}

function incidentTitle(name: string): string {
  if (/increased errors for durable objects in western europe/i.test(name)) return "서유럽 Durable Objects 오류 증가";
  return name;
}

function incidentPhase(status: string): string {
  switch (status) {
    case "investigating": return "원인 조사 중";
    case "identified": return "원인 확인 · 조치 중";
    case "monitoring": return "복구 확인 중";
    case "postmortem": return "사후 분석 중";
    default: return "제공자 업데이트 확인";
  }
}

function incidentImpact(impact: string): string {
  switch (impact) {
    case "none": return "영향 없음";
    case "minor": return "영향 범위 제한적";
    case "major": return "영향 큼";
    case "critical": return "심각한 영향";
    default: return "영향도 확인 중";
  }
}

function incidentUpdate(update: string): string {
  if (/issue has been resolved.*monitoring/i.test(update.replaceAll("\n", " "))) return "문제는 해결됐고, 재발 여부를 확인하고 있습니다.";
  if (/investigating/i.test(update)) return "제공자가 원인을 조사하고 있습니다.";
  if (/identified/i.test(update)) return "제공자가 원인을 확인하고 조치 중입니다.";
  return update || "제공자의 추가 설명이 없습니다.";
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

function getBuckets(range: GraphRange): Array<{ timestamp: string; label: string }> {
  const size = range === "1h" ? 15 * 60_000 : range === "24h" ? 60 * 60_000 : 24 * 60 * 60_000;
  const count = range === "1h" ? 4 : range === "24h" ? 24 : 7;
  const now = Date.now();
  const end = Math.floor(now / size) * size;
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end - (count - 1 - index) * size);
    const label = range === "7d"
      ? date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })
      : date.toLocaleTimeString("ko-KR", { hour: "2-digit", ...(range === "1h" ? { minute: "2-digit" } : {}) });
    return { timestamp: date.toISOString(), label };
  });
}

function FlowChart({ series, buckets, range, metric }: { series: Series[]; buckets: Array<{ timestamp: string; label: string }>; range: GraphRange; metric: GraphMetric }): React.JSX.Element {
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
        <span className="ops-chart-window">{range === "1h" ? "최근 1시간 · 15분 단위" : range === "24h" ? "최근 24시간 · 1시간 단위" : "최근 7일 · 일 단위"}</span>
      </div>
      {activeSeries.length ? <svg className="ops-flow-chart" viewBox={"0 0 " + width + " " + height} role="img" aria-label="최근 24시간 서비스 요청 추이">
        {[0, 1, 2, 3].map((line) => {
          const y = padY + (chartHeight / 3) * line;
          return <g key={line}><line x1={padX} x2={width - padX} y1={y} y2={y} className="ops-chart-gridline" /><text x={padX} y={y - 4} className="ops-chart-y-label">{compact(Math.round(maximum * (1 - line / 3)))}</text></g>;
        })}
        {activeSeries.map((item) => <g key={item.name}>
          <path d={toPath(item.values)} fill="none" stroke={item.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ops-chart-line" />
          {item.values.map((value, index) => {
            const x = padX + (index / Math.max(1, item.values.length - 1)) * chartWidth;
            const y = height - padY - (value / maximum) * chartHeight;
            return <circle key={index} cx={x} cy={y} r="3" fill={item.color} className="ops-chart-point"><title>{buckets[index]?.label}: {number(value)}{metric === "requests" ? " 요청" : metric === "errors" ? " 오류" : " 하위 요청"}</title></circle>;
          })}
        </g>)}
      </svg> : <div className="ops-chart-empty"><span>···</span><strong>{series.length ? "선택한 기간에 요청이 없습니다" : "선택한 지표를 제공하는 연결 서비스가 없습니다"}</strong><small>{series.length ? "연결된 서비스가 이 기간에 보고한 값은 0입니다." : "계정 연결과 지표 권한을 확인하세요. 조회 오류는 0건으로 표시하지 않습니다."}</small></div>}
      <div className="ops-chart-x-labels">{[0, Math.floor((buckets.length - 1) / 3), Math.floor(2 * (buckets.length - 1) / 3), buckets.length - 1].filter((index, position, array) => array.indexOf(index) === position).map((index) => <span key={index}>{buckets[index]?.label}</span>)}</div>
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
  const label = status === "healthy" ? "성공" : normalized === "canceled" ? "취소" : status === "degraded" ? "실패" : "진행 중";
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
  const [graphRange, setGraphRange] = useState<GraphRange>("24h");
  const [graphMetric, setGraphMetric] = useState<GraphMetric>("requests");

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await window.workspaceHome.request<StatusResponse>("/api/services/status", { method: "GET" }).catch(() => ({ status: 0, body: {} as StatusResponse }));
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
      const result = await window.workspaceHome.request<{ url?: string; error?: string }>("/api/services/" + provider + "/connect", { method: "POST" });
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
      const result = await window.workspaceHome.request(path, { method: "DELETE" });
      if (result.status !== 200) throw new Error("연결 정보를 삭제하지 못했습니다.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "연결 해제에 실패했습니다."); }
    finally { setBusy(null); }
  };

  const deleteSupabaseToken = async () => {
    setBusy("supabase-token"); setMessage(null);
    try {
      const result = await window.workspaceHome.request("/api/services/supabase/metrics-token", { method: "DELETE" });
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
      const result = await window.workspaceHome.request(path, { method: "PUT", body: { kind: "json", value: JSON.stringify({ token: value }) } });
      if (result.status !== 200) {
        const detail = result.body && typeof result.body === "object" && "error" in result.body ? String(result.body.error) : "요청이 거부되었습니다";
        const requestId = result.body && typeof result.body === "object" && "requestId" in result.body ? String(result.body.requestId) : result.requestId;
        throw new Error(`저장 실패 (HTTP ${result.status} · ${detail}${requestId ? ` · 요청 ${requestId}` : ""})`);
      }
      if (provider === "supabase") { setSupabaseToken(""); setShowSupabaseToken(false); }
      else { setVercelToken(""); setShowVercelToken(false); }
      setMessage(provider === "supabase" ? "Supabase 토큰을 저장했습니다." : "Vercel 토큰을 저장했습니다.");
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
  const cfHasMetrics = cfAccounts.length > 0 && cfAccounts.every((account) => account.analytics24h !== null && account.analytics24h !== undefined);
  const trackedSupabaseProjects = sbProjects.filter((project) => project.status !== "INACTIVE");
  const supabaseHasMetrics = trackedSupabaseProjects.length > 0 && trackedSupabaseProjects.every((project) => project.apiRequests !== null);
  const requestSources = [cfHasMetrics ? "Cloudflare" : null, supabaseHasMetrics ? "Supabase" : null].filter((source): source is string => source !== null);
  const requestTotals = requestSources.length
    ? cfAccounts.reduce((total, account) => total + (account.analytics24h?.requests ?? 0), 0) + trackedSupabaseProjects.reduce((total, project) => total + (project.apiRequests ?? 0), 0)
    : null;
  const errorTotals = cfHasMetrics ? cfAccounts.reduce((total, account) => total + (account.analytics24h?.errors ?? 0), 0) : null;
  const activeProjects = sbProjects.filter((project) => project.status === "ACTIVE_HEALTHY").length;
  const platformHealthy = platforms.filter((platform) => platformState(platform.status, platform.description) === "up").length;
  const platformIssues = platforms.filter((platform) => ["degraded", "down"].includes(platformState(platform.status, platform.description))).length;
  const platformIncidents = platforms.flatMap((platform) => (platform.incidents ?? []).map((incident) => ({ platformName: platform.name, incident })));
  const maintenanceCount = platforms.reduce((sum, platform) => sum + (platform.maintenanceCount ?? 0), 0);
  const platformSummary = platformIssues
    ? platforms.some((platform) => platformState(platform.status, platform.description) === "down") ? platformIssues + "곳 서비스 장애" : platformIssues + "곳 일부 영향"
    : platforms.length ? number(platformHealthy) + "/" + number(platforms.length) + " 정상" : "확인 중";
  const buckets = useMemo(() => getBuckets(graphRange), [graphRange, updatedAt]);
  const requestSeries = useMemo(() => {
    const bucketSize = graphRange === "1h" ? 15 * 60_000 : graphRange === "24h" ? 60 * 60_000 : 24 * 60 * 60_000;
    const metricValue = (point: MetricPoint): number | null => {
      if (graphMetric === "requests") return point.requests;
      if (graphMetric === "errors") return point.errors ?? null;
      return point.subrequests ?? null;
    };
    const toBucketMap = (points: MetricPoint[]) => {
      const map = new Map<string, number>();
      for (const point of points) {
        const date = new Date(point.timestamp);
        const value = metricValue(point);
        if (!Number.isFinite(date.getTime()) || value === null) continue;
        date.setTime(Math.floor(date.getTime() / bucketSize) * bucketSize);
        const key = date.toISOString();
        map.set(key, (map.get(key) ?? 0) + value);
      }
      return map;
    };
    const cloudflareMap = toBucketMap(cfAccounts.flatMap((account) => account.trend ?? []));
    const supabaseMap = toBucketMap(trackedSupabaseProjects.flatMap((project) => project.usageTrend ?? []));
    return [
      ...(cfHasMetrics ? [{ name: "Cloudflare Workers", color: "#f6821f", values: buckets.map((bucket) => cloudflareMap.get(bucket.timestamp) ?? 0) }] : []),
      ...(graphMetric === "requests" && supabaseHasMetrics ? [{ name: "Supabase API", color: "#58c699", values: buckets.map((bucket) => supabaseMap.get(bucket.timestamp) ?? 0) }] : []),
    ];
  }, [cfAccounts, trackedSupabaseProjects, cfHasMetrics, supabaseHasMetrics, buckets, graphRange, graphMetric]);

  return (
    <DashboardWidget className="dashboard-widget--wide dashboard-widget--operations" ariaLabel="서비스 흐름 및 상태" onRefresh={() => void refresh()}>
      <div className="ops-dashboard">
        <section className="ops-overview">
          <div className="ops-page-title"><div><h1>서비스 운영</h1><p>Cloudflare · Supabase · Vercel의 요청, 배포, 상태</p></div><div className="ops-updated"><span className={loading ? "ops-refresh-dot is-loading" : "ops-refresh-dot"} />{loading ? "갱신 중" : updatedAt ? updatedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) + " 기준" : "아직 갱신 안 됨"}</div></div>
          {apiError ? <div className="ops-alert"><span>!</span>{apiError}</div> : null}
          {authenticated === false ? <div className="ops-alert"><span>↗</span><span>계정별 지표를 연결하려면 PKMS 로그인이 필요합니다.</span><button type="button" onClick={() => void login()} disabled={busy === "pkms"}>PKMS 로그인</button></div> : null}
          <div className="ops-kpi-grid">
            <div className="ops-kpi ops-kpi--requests"><span>최근 24시간 요청</span><strong>{requestTotals === null ? "—" : compact(requestTotals)}</strong><small>{requestSources.length ? requestSources.join(" + ") : "사용량 지표를 불러오지 못함"}</small></div>
            <div className="ops-kpi ops-kpi--errors"><span>Cloudflare 오류</span><strong>{number(errorTotals)}</strong><small>최근 24시간 Worker 요청</small></div>
            <div className="ops-kpi ops-kpi--projects"><span>활성 데이터베이스</span><strong>{number(activeProjects)}<em> / {number(sbProjects.length)}</em></strong><small>Supabase 프로젝트</small></div>
            <div className="ops-kpi ops-kpi--deploys"><span>성공한 배포</span><strong>{number(vercel?.connected ? vercel.deployments24h?.ready ?? 0 : null)}</strong><small>Vercel · 최근 24시간</small></div>
          </div>
        </section>

        <div className="ops-section-grid">
          <section className="ops-panel ops-panel--flow">
            <div className="ops-panel-heading ops-chart-heading"><div><h2>서비스 지표 추이</h2><p>{graphMetric === "requests" ? "서비스별 요청 수" : graphMetric === "errors" ? "Cloudflare Worker 오류" : "Cloudflare Worker 하위 요청"} · {graphRange === "1h" ? "최근 1시간" : graphRange === "24h" ? "최근 24시간" : "최근 7일"}</p></div><div className="ops-chart-controls">
              <div className="ops-chart-control-group" role="group" aria-label="그래프 기간">{([ ["1h", "1시간"], ["24h", "24시간"], ["7d", "7일"] ] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={graphRange === value} onClick={() => setGraphRange(value)}>{label}</button>)}</div>
              <div className="ops-chart-control-group" role="group" aria-label="그래프 지표">{([ ["requests", "요청"], ["errors", "오류"], ["subrequests", "하위 요청"] ] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={graphMetric === value} onClick={() => setGraphMetric(value)}>{label}</button>)}</div>
            </div></div>
            <FlowChart series={requestSeries} buckets={buckets} range={graphRange} metric={graphMetric} />
          </section>
          <section className="ops-panel ops-panel--status">
            <div className="ops-panel-heading"><div><h2>제공자 상태</h2><p>Cloudflare · Supabase · Vercel</p></div><span className="ops-platform-count">{platformSummary}</span></div>
            <div className="ops-platform-list">
              {platforms.map((platform) => {
                const state = platformState(platform.status, platform.description);
                return <div className="ops-platform-row" key={platform.id}><span className={"ops-state-indicator ops-state-indicator--" + state} /><span className="ops-platform-name"><strong>{platform.name}</strong><small>{platformDescription(platform.status, platform.description)}{platform.incidentCount ? " · " + platform.incidentCount + "건 추적" : ""}</small></span><span className={"ops-state-label ops-state-label--" + state}>{statusLabel(state)}</span></div>;
              })}
              <div className="ops-platform-row"><span className="ops-state-indicator ops-state-indicator--up" /><span className="ops-platform-name"><strong>PKMS Cloud</strong><small>상태 API 응답 정상</small></span><span className="ops-state-label ops-state-label--up">정상</span></div>
            </div>
            {platformIncidents.length ? <div className="ops-incident-list">
              <h3>제공자 사건</h3>
              {platformIncidents.map(({ platformName, incident }) => <article className="ops-incident" key={incident.id}>
                <div className="ops-incident-heading"><strong>{incidentTitle(incident.name)}</strong><span>{incidentPhase(incident.status)}</span></div>
                <div className="ops-incident-meta">{platformName} · {incidentImpact(incident.impact)}{incident.updatedAt ? " · " + new Date(incident.updatedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</div>
                <p>{incidentUpdate(incident.update)}</p>
                {incident.components.length ? <small>영향 구성 요소: {incident.components.map((component) => component.name.replace("Western Europe", "서유럽")).filter(Boolean).join(", ")}</small> : null}
                <a href={incident.url} target="_blank" rel="noreferrer">{platformName} 공지 보기 ↗</a>
              </article>)}
            </div> : null}
            <div className="ops-status-foot"><span>{maintenanceCount ? "제공자 전체에서 " + maintenanceCount + "개 지역 점검 중 · " : ""}공개 상태와 사건을 구분해 표시</span>{platforms.find((platform) => platform.id === "cloudflare")?.statusUrl ? <a href={platforms.find((platform) => platform.id === "cloudflare")?.statusUrl} target="_blank" rel="noreferrer">공식 상태 페이지 ↗</a> : null}</div>
          </section>
        </div>

        <section className="ops-panel ops-panel--resources">
          <div className="ops-panel-heading"><div><h2>연결된 리소스</h2></div><span className="ops-count-pill">{number(cfAccounts.length + sbProjects.length + vercelProjects.length)}개</span></div>
          <div className="ops-resource-columns">
            <section className="ops-resource-group">
              <header className="ops-provider-heading"><div><strong>Cloudflare</strong><small>{cloudflare?.connected ? number(cfAccounts.reduce((sum, account) => sum + (account.workers?.length ?? 0), 0)) + "개 Worker" : "연결되지 않음"}</small></div>{cloudflare?.connected ? <button type="button" className="ops-text-button" onClick={() => void disconnect("cloudflare")} disabled={busy === "cloudflare"}>연결 해제</button> : <button type="button" className="ops-text-button" onClick={() => void connect("cloudflare")} disabled={busy === "cloudflare"}>계정 연결</button>}</header>
              {cloudflare?.connected ? cfAccounts.length ? cfAccounts.map((account) => <div className="ops-resource-card" key={account.id}>
                <div className="ops-resource-card-top"><div><strong>{account.dashboardUrl ? <a className="ops-resource-link" href={account.dashboardUrl} target="_blank" rel="noreferrer">{account.name} <span aria-hidden="true">↗</span></a> : account.name}</strong><small>Cloudflare 계정 · Workers &amp; Pages</small></div></div>
                <div className="ops-mini-stats"><div><small>최근 24시간 요청</small><b>{number(account.analytics24h?.requests)}</b></div><div><small>하위 요청</small><b>{number(account.analytics24h?.subrequests)}</b></div></div>
                {!account.analytics24h ? <small className="ops-inline-error">Cloudflare Analytics 응답을 확인할 수 없습니다. 0건으로 집계하지 않았습니다.</small> : null}
                <div className="ops-worker-list">{(account.workers ?? []).map((worker) => <div key={worker.name}><div className="ops-worker-main"><span className="ops-worker-dot" />{worker.dashboardUrl ? <a className="ops-resource-link" href={worker.dashboardUrl} target="_blank" rel="noreferrer"><strong>{worker.name}</strong><span aria-hidden="true">↗</span></a> : <strong>{worker.name}</strong>}<small>{worker.lastModified ? new Date(worker.lastModified).toLocaleDateString("ko-KR") + " 배포" : "배포 시각 없음"}</small></div><small className="ops-worker-metrics">{worker.requests24h === null || worker.requests24h === undefined ? "Worker별 분석 지표 없음" : `${number(worker.requests24h)} 요청 · ${number(worker.errors24h)} 오류 · 하위 ${number(worker.subrequests24h)} · CPU p99 ${number(worker.cpuTimeP99)} ms`}</small></div>)}</div>
              </div>) : <div className="ops-empty-state">배포된 Worker가 없습니다.</div> : <div className="ops-connect-state"><span>Workers 배포와 요청 지표를 연결합니다.</span><small>읽기 전용 계정 권한</small></div>}
            </section>

            <section className="ops-resource-group">
              <header className="ops-provider-heading"><div><strong>Supabase</strong><small>{supabase?.connected ? number(sbProjects.length) + "개 프로젝트 · " + number(activeProjects) + "개 운영 중" : "계정 연결 안 됨"}</small></div>{supabase?.connected ? <button type="button" className="ops-text-button" onClick={() => void disconnect("supabase")} disabled={busy === "supabase"}>연결 해제</button> : <button type="button" className="ops-text-button" onClick={() => void connect("supabase")} disabled={busy === "supabase"}>계정 연결</button>}</header>
              {supabase?.connected ? sbProjects.map((project) => {
                const state = projectState(project.status);
                const projectActive = project.status === "ACTIVE_HEALTHY" || project.status === "ACTIVE_UNHEALTHY";
                const recentUsage = project.usageTrend.filter((point) => new Date(point.timestamp).getTime() >= Date.now() - 24 * 60 * 60_000);
                const usageCategoryTotal = (key: "authRequests" | "realtimeRequests" | "restRequests" | "storageRequests") => recentUsage.reduce((sum, point) => sum + (point[key] ?? 0), 0);
                return <div className={"ops-resource-card ops-project-card ops-project-card--" + state} key={project.id}>
                <div className="ops-resource-card-top"><div><strong><a className="ops-resource-link" href={`https://supabase.com/dashboard/project/${encodeURIComponent(project.id)}`} target="_blank" rel="noreferrer">{project.name} <span aria-hidden="true">↗</span></a></strong><small>{project.region ?? "리전 정보 없음"} · Supabase 프로젝트</small></div><span className={"ops-project-chip ops-project-chip--" + state}>{state === "healthy" ? "정상" : state === "paused" ? "일시 중지" : "상태 확인 필요"}</span></div>
                  {projectActive ? <div className="ops-mini-stats"><div><small>DB 크기</small><b>{project.databaseSizeMb === null ? projectMetricStatus(project.databaseMetricsStatus) || "—" : project.databaseSizeMb.toFixed(1) + " MB"}</b></div><div><small>활성 연결</small><b>{number(project.activeConnections)}</b></div><div><small>API 요청 · 24H</small><b>{number(project.apiRequests)}</b></div></div> : <div className="ops-project-paused">{project.status === "INACTIVE" ? "프로젝트가 일시 중지되어 실시간 지표가 제공되지 않습니다." : "프로젝트 상태를 확인할 수 없어 실시간 지표가 없습니다."}</div>}
                  {project.usageStatus === "available" ? <div className="ops-service-breakdown"><span>Auth {number(usageCategoryTotal("authRequests"))}</span><span>Realtime {number(usageCategoryTotal("realtimeRequests"))}</span><span>REST {number(usageCategoryTotal("restRequests"))}</span><span>Storage {number(usageCategoryTotal("storageRequests"))}</span></div> : null}
                  <DiskMeter project={project} />
                  {project.storageRequests !== null ? <div className="ops-project-foot"><span>Storage 요청</span><strong>{number(project.storageRequests)} <small>/ 24H</small></strong></div> : null}
                </div>;
              }) : <div className="ops-connect-state"><span>프로젝트·DB 지표는 Supabase OAuth 연결에서 가져옵니다.</span><small>{supabase?.supplementalTokenConfigured ? "보조 토큰 등록 완료 · OAuth 연결 후 사용량/디스크 조회" : "Usage Analytics Read + Disk Config Read 토큰 필요"}</small></div>}
              {authenticated ? <div className="ops-token-row"><span>{supabase?.supplementalTokenConfigured ? "보조 토큰 등록됨" : "읽기 전용 Management API 토큰"}</span><div><button type="button" className="ops-text-button" onClick={() => setShowSupabaseToken((value) => !value)}>{supabase?.supplementalTokenConfigured ? "교체" : "등록"}</button>{supabase?.supplementalTokenConfigured ? <button type="button" className="ops-text-button ops-text-button--danger" onClick={() => void deleteSupabaseToken()} disabled={busy === "supabase-token"}>토큰 삭제</button> : null}</div></div> : null}
              {showSupabaseToken ? <form className="ops-token-form" onSubmit={(event) => void saveToken("supabase", event)}><div className="ops-token-help">서버에는 토큰을 잠가 보관하고, Supabase 지표를 불러올 때만 열어 씁니다.</div><input type="password" autoComplete="new-password" value={supabaseToken} onChange={(event) => setSupabaseToken(event.target.value)} placeholder="Supabase 읽기 전용 토큰" aria-label="Supabase 읽기 전용 토큰" /><button type="submit" disabled={!supabaseToken.trim() || busy === "supabase-token"}>저장</button></form> : null}
            </section>

            <section className="ops-resource-group">
              <header className="ops-provider-heading"><div><strong>Vercel</strong><small>{vercel?.connected ? number(vercelProjects.length) + "개 프로젝트 · " + number(vercel?.deployments24h?.total ?? 0) + "회 배포 / 24시간" : "토큰 연결 안 됨"}</small></div>{vercel?.tokenConfigured ? <button type="button" className="ops-text-button ops-text-button--danger" onClick={() => void disconnect("vercel")} disabled={busy === "vercel"}>토큰 삭제</button> : null}</header>
              {vercel?.connected ? <>
                {(vercel?.error ? <div className="ops-connect-state"><span>토큰에 프로젝트·배포 읽기 권한이 있는지 확인하세요.</span></div> : null)}
                {vercelProjects.map((project) => {
                  const deploy = project.latestDeployment as VercelDeployment | null | undefined;
                  const liveUrl = deploymentUrl(deploy?.url);
                  return <div className="ops-vercel-project" key={project.id}><div><strong>{project.dashboardUrl ? <a className="ops-resource-link" href={project.dashboardUrl} target="_blank" rel="noreferrer">{project.name} <span aria-hidden="true">↗</span></a> : project.name}</strong><small>{project.framework || "Vercel Project"}</small></div><div>{deploy ? <><DeploymentState state={deploy.readyState ?? deploy.state} /><small>{deploy.createdAt ? new Date(deploy.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "시간 없음"}</small>{liveUrl ? <a className="ops-deployment-link" href={liveUrl} target="_blank" rel="noreferrer">배포 미리보기 ↗</a> : null}</> : <small>최근 배포 없음</small>}</div></div>;
                })}
                {vercel?.deployments?.length ? <div className="ops-recent-deployments"><h3>최근 배포 기록</h3>{vercel.deployments.slice(0, 6).map((deploy) => {
                  const project = vercelProjects.find((item) => item.id === deploy.projectId);
                  const liveUrl = deploymentUrl(deploy.url);
                  return <div className="ops-recent-deployment" key={deploy.id}><div><strong>{project?.dashboardUrl ? <a className="ops-resource-link" href={project.dashboardUrl} target="_blank" rel="noreferrer">{project.name}<span aria-hidden="true">↗</span></a> : project?.name ?? deploy.name ?? "Vercel 프로젝트"}</strong><small>{deploy.target === "production" ? "Production" : deploy.target ?? "Preview"} · {deploy.createdAt ? new Date(deploy.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "시간 없음"}</small></div><div><DeploymentState state={deploy.readyState ?? deploy.state} />{liveUrl ? <a className="ops-deployment-link" href={liveUrl} target="_blank" rel="noreferrer">열기 ↗</a> : null}</div></div>;
                })}</div> : null}
                <div className="ops-deployment-summary"><span>최근 24시간</span><b>{number(vercel?.deployments24h?.ready ?? 0)}회 성공</b><b className="ops-deploy-failed">{number(vercel?.deployments24h?.failed ?? 0)}회 실패</b></div>
              </> : <div className="ops-connect-state"><span>프로젝트와 최근 배포 상태를 불러옵니다.</span><small>Vercel Access Token · 읽기 전용 사용</small></div>}
              {authenticated && !vercel?.tokenConfigured ? <button type="button" className="ops-token-cta" onClick={() => setShowVercelToken((value) => !value)}>{showVercelToken ? "토큰 입력 닫기" : "Vercel 토큰 등록"}</button> : null}
              {showVercelToken ? <form className="ops-token-form" onSubmit={(event) => void saveToken("vercel", event)}><div className="ops-token-help">서버에는 토큰을 잠가 보관하고, Vercel 정보를 불러올 때만 열어 씁니다.</div><input type="password" autoComplete="new-password" value={vercelToken} onChange={(event) => setVercelToken(event.target.value)} placeholder="Vercel Access Token" aria-label="Vercel Access Token" /><button type="submit" disabled={!vercelToken.trim() || busy === "vercel-token"}>저장</button></form> : null}
              {vercel?.error ? <small className="ops-inline-error">Vercel API에서 정보를 가져오지 못했습니다.</small> : null}
            </section>
          </div>
        </section>
        {message ? <div className="ops-toast" role="status">{message}</div> : null}
      </div>
    </DashboardWidget>
  );
}
