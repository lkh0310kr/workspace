import { describe, expect, it } from 'vitest'
import { isWsl, windowsPathToWsl, wslPathToWindows } from './wslPaths'

describe('windowsPathToWsl', () => {
  it('maps drive letters to /mnt/<drive>', () => {
    expect(windowsPathToWsl('C:\\Users\\me\\workspace')).toBe('/mnt/c/Users/me/workspace')
  })

  it('maps wsl.localhost UNC paths to Linux paths', () => {
    const distro = process.env.WSL_DISTRO_NAME || 'Ubuntu'
    expect(windowsPathToWsl(`\\\\wsl.localhost\\${distro}\\home\\me\\workspace`)).toBe(
      '/home/me/workspace'
    )
  })

  it.skipIf(process.platform !== 'win32' && !isWsl())(
    'round-trips /home paths through wslPathToWindows',
    () => {
      const distro = process.env.WSL_DISTRO_NAME || 'Ubuntu'
      const win = wslPathToWindows('/home/me/workspace')
      expect(win).toBe(`\\\\wsl.localhost\\${distro}\\home\\me\\workspace`)
      expect(windowsPathToWsl(win!)).toBe('/home/me/workspace')
    }
  )
})

describe('wslPathToWindows', () => {
  it('maps /mnt paths back to Windows drive paths', () => {
    expect(wslPathToWindows('/mnt/c/Users/me/workspace')).toBe('C:\\Users\\me\\workspace')
  })

  it.skipIf(process.platform !== 'win32' && !isWsl())(
    'maps /home paths to wsl.localhost UNC under WSL',
    () => {
      const distro = process.env.WSL_DISTRO_NAME || 'Ubuntu'
      expect(wslPathToWindows('/home/me/workspace')).toBe(
        `\\\\wsl.localhost\\${distro}\\home\\me\\workspace`
      )
    }
  )
})
