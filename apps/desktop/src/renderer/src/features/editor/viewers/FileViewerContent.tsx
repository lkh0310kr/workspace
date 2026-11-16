import { EditorFileViewer, type EditorFileViewerProps } from '@workspace/editor/viewers'
import { desktopEditorViewerHost } from '../runtime/desktopEditorViewerHost'

type Props = Omit<EditorFileViewerProps, 'host'>

export function FileViewerContent(props: Props) {
  return <EditorFileViewer {...props} host={desktopEditorViewerHost} />
}
