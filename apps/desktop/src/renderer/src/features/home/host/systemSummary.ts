import type { ReadSystemSummary } from '@workspace/home'

/** Desktop bridge for the Home package's operating system summary capability. */
export const readSystemSummary: ReadSystemSummary = () => window.api.system.summary()
