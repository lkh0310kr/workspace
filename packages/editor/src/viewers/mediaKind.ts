// Pure extension classification for the File Viewer pane, split out from
// FileViewerContent.tsx so it's independently testable and so the
// component can decide *before* fetching whether to go through the small
// binary-preview IPC (images/PDF — base64+blob, fine for whole small
// files) or the streaming media protocol (video/audio — never loaded
// whole into memory, see mediaProtocol.ts).

import {
  AUDIO_EXTENSIONS,
  CAD_VIEWER_EXTENSIONS,
  IMAGE_EXTENSIONS,
  MODEL3D_EXTENSIONS,
  VIDEO_EXTENSIONS
} from '../assets/mediaExtensions'

export type MediaKind = 'image' | 'pdf' | 'video' | 'audio' | 'epub' | 'model3d' | 'cad' | 'other'

export function classifyMediaExtension(filePath: string): MediaKind {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.epub')) return 'epub'
  if (CAD_VIEWER_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'cad'
  if (MODEL3D_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'model3d'
  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'image'
  if (VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'video'
  if (AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'audio'
  return 'other'
}
