import { createContext, type RefObject } from 'react'

/** Optional host scroll owner for documents whose title and editor scroll together. */
export const editorViewScrollElement = createContext<RefObject<HTMLElement | null> | null>(null)
