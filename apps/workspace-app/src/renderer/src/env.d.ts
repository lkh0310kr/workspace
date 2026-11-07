/// <reference types="vite/client" />

declare module "*foliate-js/epub.js" {
  export class EPUB {
    constructor(loader: {
      loadText: (name: string) => Promise<string | null>
      loadBlob: (name: string) => Promise<Blob | null>
      getSize: (name: string) => number
    })
    init(): Promise<unknown>
  }
}

declare module "*foliate-js/view.js" {
  export class View extends HTMLElement {
    book: {
      dir?: string
      toc?: unknown[]
      metadata?: { title?: unknown; author?: unknown }
    }
    renderer: {
      setAttribute(name: string, value: string): void
      setStyles?(styles: string | string[]): void
      next(): Promise<unknown>
      prev(): Promise<unknown>
      destroy(): void
    }
    lastLocation?: {
      fraction?: number
      location?: { current?: number; next?: number; total?: number }
      tocItem?: { label?: string; href?: string }
      cfi?: string
    }
    open(book: File | Blob | string | unknown): Promise<void>
    close(): void
    init(options: { lastLocation?: unknown; showTextStart?: boolean }): Promise<void>
    prev(distance?: number): Promise<void>
    next(distance?: number): Promise<void>
    goLeft(): Promise<unknown>
    goRight(): Promise<unknown>
    goTo(target: unknown): Promise<unknown>
    goToFraction(fraction: number): Promise<void>
    search(options: { query: string; index?: number }): AsyncGenerator<unknown>
    clearSearch(): void
  }
  export function makeBook(file: File | Blob | string): Promise<unknown>
}

declare module "*foliate-js/ui/tree.js" {
  export function createTOCView(
    toc: unknown,
    onclick: (href: string) => void,
  ): { element: HTMLElement; setCurrentHref?: (href: string) => void }
}
