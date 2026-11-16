export function formatResetCountdown(resetsAtMs: number, now: number): string | null {
  const diffMs = resetsAtMs - now
  if (diffMs <= 0) return null
  const totalMinutes = Math.round(diffMs / 60_000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h`
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

export function usageBarColor(usedPercent: number): string {
  if (usedPercent >= 90) return '#cc0000'
  if (usedPercent >= 70) return '#c79100'
  return '#4e9a06'
}
