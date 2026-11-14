import type { MouseEvent, ReactNode, RefObject } from 'react'
import { EditorMarkdownTitleInput } from './EditorMarkdownTitleInput'

function titleOffsetAtPoint(event: MouseEvent<HTMLDivElement>, title: string): number {
  const element = event.currentTarget
  const style = window.getComputedStyle(element)
  const textStart =
    element.getBoundingClientRect().left + Number.parseFloat(style.paddingLeft || '0')
  const targetX = event.clientX - textStart
  if (targetX <= 0) return 0
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) return title.length
  context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  let width = 0
  for (let index = 0; index < title.length;) {
    const character = String.fromCodePoint(title.codePointAt(index)!)
    const characterWidth = context.measureText(character).width
    if (targetX < width + characterWidth / 2) return index
    width += characterWidth
    index += character.length
  }
  return title.length
}

interface Props {
  path: string | null
  title: string
  editing: boolean
  draft: string
  error: string | null
  inputRef: RefObject<HTMLInputElement | null>
  trailing?: ReactNode
  onStartEditing?: (caretPosition: number) => void
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
}

/** Shared Markdown title display/edit switch; rename policy stays with each host. */
export function EditorMarkdownTitle({
  path,
  title,
  editing,
  draft,
  error,
  inputRef,
  trailing,
  onStartEditing,
  onChange,
  onCommit,
  onCancel
}: Props) {
  return (
    <div className="editor-title-block">
      {editing ? (
        <EditorMarkdownTitleInput
          inputRef={inputRef}
          value={draft}
          error={error}
          onChange={onChange}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      ) : (
        <div
          className="editor-markdown-title"
          title={path ?? undefined}
          onClick={(event) => onStartEditing?.(titleOffsetAtPoint(event, title))}
        >
          {title}
        </div>
      )}
      {trailing}
    </div>
  )
}
