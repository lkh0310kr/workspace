/** Remove launcher-only color suppression and provide a capable terminal environment. */
export function createTerminalEnvironment(
  source: NodeJS.ProcessEnv | Record<string, string | undefined>,
  overrides: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...source, ...overrides }
  delete env.NO_COLOR
  if (env.COLOR === '0') delete env.COLOR
  if (!env.TERM || env.TERM === 'dumb') env.TERM = 'xterm-256color'
  if (!env.COLORTERM) env.COLORTERM = 'truecolor'
  return env
}
