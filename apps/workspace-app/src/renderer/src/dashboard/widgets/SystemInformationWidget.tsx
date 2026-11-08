import { useCallback, useEffect, useState } from 'react'
import { DashboardWidget } from '../DashboardWidget'

type Summary = Awaited<ReturnType<typeof window.api.system.summary>>

function formatBytes(value: number): string {
  const gb = value / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(value / 1024 ** 2)} MB`
}

function Metric({ label, value, detail, percent }: { label: string; value: string; detail: string; percent: number | null }): React.JSX.Element {
  return <div className="home-system-metric">
    <div className="home-system-metric-heading"><span>{label}</span><strong>{value}</strong></div>
    <div className="ops-meter"><i style={{ width: `${percent ?? 0}%` }} /></div>
    <small>{detail}</small>
  </div>
}

export function SystemInformationWidget(): React.JSX.Element {
  const [summary, setSummary] = useState<Summary | null>(null)
  const refresh = useCallback(() => {
    void window.api.system.summary().then(setSummary).catch(() => setSummary(null))
  }, [])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, 3000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const memoryUsed = summary ? summary.memoryTotal - summary.memoryAvailable : null
  const diskUsed = summary?.diskTotal !== null && summary?.diskTotal !== undefined && summary.diskAvailable !== null
    ? summary.diskTotal - summary.diskAvailable : null
  const percent = (used: number | null, total?: number | null): number | null =>
    used !== null && total ? Math.min(100, Math.max(0, used / total * 100)) : null
  const uptime = summary ? `${Math.floor(summary.uptimeSeconds / 86400)}일 ${Math.floor(summary.uptimeSeconds % 86400 / 3600)}시간` : '불러오는 중'

  return <DashboardWidget className="dashboard-widget--operations home-system-widget" ariaLabel="시스템 정보" onRefresh={refresh}>
    <div className="home-system-header">
      <div><span className="home-system-kicker">이 기기</span><h2>시스템 정보</h2></div>
      <span>{summary ? `${summary.hostname} · ${summary.platform} ${summary.release} · ${summary.arch}` : '시스템 상태를 불러오는 중'}</span>
    </div>
    <div className="home-system-grid">
      <Metric label="CPU" value={summary?.cpuPercent === null || !summary ? '측정 중' : `${summary.cpuPercent}%`} detail={summary ? `${summary.cpuCores}코어` : '잠시 후 사용률이 표시됩니다'} percent={summary?.cpuPercent ?? null} />
      <Metric label="메모리" value={memoryUsed === null || !summary ? '—' : formatBytes(memoryUsed)} detail={summary ? `${formatBytes(summary.memoryTotal)} 중 ${formatBytes(summary.memoryAvailable)} 사용 가능` : '정보 없음'} percent={percent(memoryUsed, summary?.memoryTotal)} />
      <Metric label="저장 공간" value={diskUsed === null || !summary?.diskTotal ? '—' : formatBytes(diskUsed)} detail={summary?.diskTotal ? `${formatBytes(summary.diskTotal)} 중 ${formatBytes(summary.diskAvailable ?? 0)} 사용 가능` : '저장 공간 정보를 사용할 수 없음'} percent={percent(diskUsed, summary?.diskTotal)} />
      <div className="home-system-uptime"><span>가동 시간</span><strong>{uptime}</strong><small>마지막 새로고침 {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</small></div>
    </div>
  </DashboardWidget>
}
