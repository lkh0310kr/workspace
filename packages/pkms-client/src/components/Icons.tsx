import type { ReactNode } from 'react'

type AppIconName =
  | 'plus'
  | 'filter'
  | 'filePlus'
  | 'folderPlus'
  | 'upload'
  | 'pencil'
  | 'trash'
  | 'folder'
  | 'fileText'
  | 'file'
  | 'chevron'
  | 'logout'
  | 'menu'
  | 'lock'
  | 'arrowRight'
  | 'list'
  | 'close'

export function AppIcon({ name, className = '' }: { name: AppIconName; className?: string }) {
  const path = {
    plus: <path d="M12 5v14M5 12h14" />,
    filter: <path d="M4 5h16l-6.5 7.3V19l-3 1.5v-8.2L4 5Z" />,
    filePlus: (
      <>
        <path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7M13 3v6h6M13 3l6 6" />
        <path d="M17 14v7m-3.5-3.5h7" />
      </>
    ),
    folderPlus: (
      <>
        <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v3M3 7v11a2 2 0 0 0 2 2h8" />
        <path d="M18 14v7m-3.5-3.5h7" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4m-4 4 4-4 4 4" />
        <path d="M5 14v5h14v-5" />
      </>
    ),
    pencil: (
      <>
        <path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5 4 16.5Z" />
        <path d="m13.8 6.7 3.5 3.5" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" />
      </>
    ),
    folder: (
      <path d="M3 6.5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11Z" />
    ),
    fileText: (
      <>
        <path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-6Z" />
        <path d="M13 3v6h7M8 13h8m-8 4h8" />
      </>
    ),
    file: (
      <>
        <path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-6Z" />
        <path d="M13 3v6h7" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    logout: (
      <>
        <path d="M10 17l5-5-5-5m5 5H3" />
        <path d="M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
      </>
    ),
    menu: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
      </>
    ),
    lock: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
    arrowRight: (
      <>
        <path d="M4 12h15m-6-6 6 6-6 6" />
      </>
    ),
    list: (
      <>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="M4 6h.01M4 12h.01M4 18h.01" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />
  } satisfies Record<AppIconName, ReactNode>
  return (
    <svg
      className={`app-icon ${className}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path[name]}
    </svg>
  )
}

export function GitHubIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.56.1.76-.24.76-.54v-2.1c-3.1.67-3.76-1.31-3.76-1.31-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.73 1.16 1.73 1.16 1 .1.12.1.2.09.1-.78.39-1.3.71-1.6-2.48-.28-5.09-1.24-5.09-5.52 0-1.22.44-2.22 1.16-3-.12-.28-.5-1.42.1-2.96 0 0 .95-.3 3.05 1.15a10.6 10.6 0 0 1 5.55 0c2.1-1.43 3.04-1.15 3.04-1.15.61 1.54.23 2.68.12 2.96.72.78 1.15 1.78 1.15 3 0 4.3-2.61 5.24-5.1 5.51.4.35.76 1.03.76 2.08v3.08c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z"
      />
    </svg>
  )
}
