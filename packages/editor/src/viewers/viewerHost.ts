import type { ElementType } from 'react'

export type EditorMediaPickerKind = 'video' | 'audio' | 'ebook'

export interface EditorBinaryPreview {
  content: string
  mimeType: string
}

export type EditorEpubViewerProps =
  | {
      tabId: number
      filePath: string
      absolutePath?: undefined
      paneActive: boolean
    }
  | {
      tabId?: undefined
      filePath?: undefined
      absolutePath: string
      paneActive: boolean
    }

export interface EditorModelViewerProps {
  tabId: number
  filePath: string | null
  paneActive: boolean
}

export interface EditorCadViewerProps {
  tabId: number
  filePath: string
  paneActive: boolean
}

export interface EditorViewerHost {
  readFileBinaryPreview: (tabId: number, path: string) => Promise<EditorBinaryPreview | null>
  getMediaUrl: (tabId: number, path: string) => Promise<string | null>
  getMediaUrlAbsolute: (absolutePath: string) => Promise<string>
  pickMediaFileDialog: (kind: EditorMediaPickerKind) => Promise<string | null>
  EpubReaderContent: ElementType<EditorEpubViewerProps>
  ModelViewerContent: ElementType<EditorModelViewerProps>
  CadViewerContent: ElementType<EditorCadViewerProps>
}

export interface EditorFileViewerProps {
  host: EditorViewerHost
  tabId: number
  filePath: string | null
  absolutePath: string | null
  viewerHint?: EditorMediaPickerKind
  onAssignAbsolutePath: (path: string) => void
  paneActive?: boolean
}
