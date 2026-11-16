import { useEffect, useState } from 'react'
import { getCurrentResolvedTheme, subscribeThemeChange } from '../../theme'

export function useTerminalSearchThemeKey(): 'dark' | 'light' {
  const [themeKey, setThemeKey] = useState<'dark' | 'light'>(() => getCurrentResolvedTheme())
  useEffect(() => subscribeThemeChange(setThemeKey), [])
  return themeKey
}
