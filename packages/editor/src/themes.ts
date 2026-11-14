import { EditorView } from '@codemirror/view'

/** Markdown reading typography shared by PKMS and Workspace. */
export const markdownProseTheme = EditorView.theme({
  '.cm-content': { fontFamily: 'var(--font-ui, var(--editor-font, sans-serif))' }
})

/** Workspace-style note surface used by Markdown editor hosts. */
export const markdownEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--text)',
    backgroundColor: 'var(--editor-bg, var(--editor))',
    fontSize: 'var(--editor-font-size, 14px)'
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'var(--font-mono, var(--editor-font, monospace))'
  },
  '.cm-content': {
    padding: '8px clamp(18px, 5vw, 64px) 48px',
    lineHeight: '1.8',
    caretColor: 'var(--text)',
    maxWidth: '820px',
    margin: '0 auto'
  },
  '.cm-gutters': { display: 'none' },
  '.cm-md-fold-control': {
    display: 'inline-flex',
    width: '16px',
    height: '1.5em',
    marginLeft: '-22px',
    marginRight: '6px',
    padding: '0',
    alignItems: 'center',
    justifyContent: 'center',
    verticalAlign: 'middle',
    border: '0',
    background: 'transparent',
    color: 'var(--text-muted, var(--muted))',
    opacity: '0',
    cursor: 'pointer',
    transition: 'opacity 100ms ease, color 100ms ease'
  },
  '.cm-md-fold-control svg': {
    width: '11px',
    height: '11px',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.5',
    strokeLinecap: 'round',
    strokeLinejoin: 'round'
  },
  '.cm-line:hover .cm-md-fold-control, .cm-line:focus-within .cm-md-fold-control, .cm-md-fold-control:focus-visible':
    { opacity: '0.8' },
  '.cm-md-fold-control.is-folded': {
    color: 'var(--primary, var(--accent, var(--link)))',
    opacity: '1'
  },
  '.cm-md-fold-control.is-folded:hover': {
    color: 'var(--primary, var(--accent, var(--link)))',
    opacity: '1'
  },
  '.cm-md-fold-control:hover': { color: 'var(--text)', opacity: '1' },
  '.cm-md-fold-control:focus-visible': {
    outline: '2px solid var(--focus-ring, var(--accent))',
    outlineOffset: '1px'
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'transparent',
    border: '0',
    borderRadius: '0',
    color: 'var(--text-muted, var(--muted))',
    margin: '0 0 0 5px',
    padding: '0',
    fontSize: '1em',
    fontWeight: '600',
    verticalAlign: 'baseline',
    cursor: 'pointer'
  },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-md-h1, .cm-md-h2, .cm-md-h3, .cm-md-h4, .cm-md-h5, .cm-md-h6': {
    color: 'var(--text)',
    fontWeight: '600',
    textDecoration: 'none'
  },
  '.cm-md-h1': { fontSize: '28px', fontWeight: '700', lineHeight: '1.25' },
  '.cm-md-h2': { fontSize: '22px', fontWeight: '650', lineHeight: '1.3' },
  '.cm-md-h3': { fontSize: '18px', fontWeight: '650', lineHeight: '1.35' },
  '.cm-md-h4': { fontSize: '16px', fontWeight: '600', lineHeight: '1.4' },
  '.cm-md-h5': { fontSize: '14px', fontWeight: '600', lineHeight: '1.5' },
  '.cm-md-h6': {
    color: 'var(--text-muted, var(--muted))',
    fontSize: '13px',
    fontWeight: '600',
    lineHeight: '1.5'
  },
  '.cm-line:has(.cm-md-h1), .cm-line:has(.cm-md-h2), .cm-line:has(.cm-md-h3), .cm-line:has(.cm-md-h4), .cm-line:has(.cm-md-h5), .cm-line:has(.cm-md-h6)':
    { paddingTop: '0', paddingBottom: '0' },
  '.cm-cursor': { borderLeftColor: 'var(--text)' }
})
