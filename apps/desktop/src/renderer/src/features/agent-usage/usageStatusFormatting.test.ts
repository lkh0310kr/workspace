import { describe, expect, it } from 'vitest'
import { formatResetCountdown, usageBarColor } from './usageStatusFormatting'

describe('usage status formatting', () => {
  it('formats reset countdowns in minutes, hours, and days', () => {
    const now = 0

    expect(formatResetCountdown(30_000, now)).toBe('1m')
    expect(formatResetCountdown(90 * 60_000, now)).toBe('1h 30m')
    expect(formatResetCountdown(49 * 60 * 60_000, now)).toBe('2d 1h')
  })

  it('omits countdowns after their reset time', () => {
    expect(formatResetCountdown(60_000, 60_000)).toBeNull()
  })

  it('keeps the rate limit color thresholds', () => {
    expect(usageBarColor(69.99)).toBe('#4e9a06')
    expect(usageBarColor(70)).toBe('#c79100')
    expect(usageBarColor(89.99)).toBe('#c79100')
    expect(usageBarColor(90)).toBe('#cc0000')
  })
})
