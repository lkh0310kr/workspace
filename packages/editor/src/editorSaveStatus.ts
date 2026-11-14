import type { EditorSavePhase } from './provider'

/** Stable user-facing labels for provider save phases across editor hosts. */
export function editorSavePhaseLabel(phase: EditorSavePhase): string {
  switch (phase) {
    case 'clean':
      return 'Saved'
    case 'dirty':
      return 'Unsaved'
    case 'saving':
      return 'Saving'
    case 'conflict':
      return 'Conflict'
    case 'error':
      return 'Save failed'
  }
}
