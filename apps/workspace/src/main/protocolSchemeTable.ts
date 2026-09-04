import type { CustomScheme } from 'electron'
import { ENGINE_SCHEME } from './engineBundlePaths'
import { MODEL_SCHEME } from './model3d/modelProtocolUrl'

export const MEDIA_SCHEME = 'workspace-media'
export const EPUB_SCHEME = 'workspace-epub'

// Electron allows exactly one registerSchemesAsPrivileged call ("can be
// called only once", protocol.registerSchemesAsPrivileged docs), so every
// workspace scheme has to be in this single table. Four modules used to
// register separately; only the last one evaluated kept its privileges,
// which stayed invisible until the EPUB reader needed fetch() and got
// "URL scheme workspace-epub is not supported".
export const PRIVILEGED_SCHEMES: CustomScheme[] = [
  {
    scheme: MEDIA_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  },
  {
    scheme: MODEL_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true
    }
  },
  {
    scheme: EPUB_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  },
  {
    scheme: ENGINE_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
]
