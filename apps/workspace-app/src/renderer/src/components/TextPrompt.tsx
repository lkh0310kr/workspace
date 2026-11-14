import { Popover, type AnchorRect } from './Popover'
import { EditorNameForm } from '@workspace/editor'

// Electron doesn't implement window.prompt() at all — it throws
// "prompt() is not supported" unconditionally (a long-standing, never-
// fixed Electron gap: window.alert()/confirm() work via native dialogs,
// prompt() never got the same treatment). TreeView's New Folder/Rename
// both used it, so both were completely broken. This is the replacement:
// a small popover with a text input, anchored wherever the caller says
// (the context-menu click position, for TreeView's case).
interface Props {
  anchorRect: AnchorRect
  title: string
  defaultValue?: string
  submitLabel?: string
  onSubmit: (value: string) => void
  onClose: () => void
}

export function TextPrompt({
  anchorRect,
  title,
  defaultValue = '',
  submitLabel = 'OK',
  onSubmit,
  onClose
}: Props) {
  return (
    <Popover anchorRect={anchorRect} onClose={onClose} className="text-prompt">
      <EditorNameForm
        title={title}
        initialValue={defaultValue}
        submitLabel={submitLabel}
        titleClassName="text-prompt-title"
        actionsClassName="text-prompt-actions"
        onSubmit={(value) => {
          onSubmit(value)
          onClose()
        }}
        onCancel={onClose}
      />
    </Popover>
  )
}
