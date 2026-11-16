import { lazy } from 'react'
import type { EditorViewerHost } from '@workspace/editor/viewers'
import { getMediaUrl, getMediaUrlAbsolute, pickMediaFileDialog } from './editorIpc'
import { readFileBinaryPreview } from './localFileSystem'
import { EpubReaderContent } from '../viewers/EpubReaderContent'

const ModelViewerContent = lazy(() =>
  import('../viewers/ModelViewerContent').then((module) => ({
    default: module.ModelViewerContent
  }))
)
const CadViewerContent = lazy(() =>
  import('../viewers/CadViewerContent').then((module) => ({
    default: module.CadViewerContent
  }))
)

export const desktopEditorViewerHost: EditorViewerHost = {
  readFileBinaryPreview,
  getMediaUrl,
  getMediaUrlAbsolute,
  pickMediaFileDialog,
  EpubReaderContent,
  ModelViewerContent,
  CadViewerContent
}
