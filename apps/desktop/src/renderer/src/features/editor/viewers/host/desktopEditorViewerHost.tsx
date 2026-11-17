import { lazy } from 'react'
import type { EditorViewerHost } from '@workspace/editor/viewers'
import { getMediaUrl, getMediaUrlAbsolute, pickMediaFileDialog } from './editorIpc'
import { readFileBinaryPreview } from '../../provider/local/localFileSystem'
import { EpubReaderContent } from '../EpubReaderContent'

const ModelViewerContent = lazy(() =>
  import('../ModelViewerContent').then((module) => ({
    default: module.ModelViewerContent
  }))
)
const CadViewerContent = lazy(() =>
  import('../CadViewerContent').then((module) => ({
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
