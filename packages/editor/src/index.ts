export type {
  EditorDocumentSession,
  EditorDocumentSnapshot,
  EditorItemKind,
  EditorItemRef,
  EditorOperation,
  EditorProvider,
  EditorProviderCapabilities,
  EditorProviderErrorCode,
  EditorSavePhase,
  EditorSearchOptions,
  EditorSearchMatch,
  EditorSearchPage,
  EditorReplaceOptions,
  EditorSearchResult,
  EditorSyncPhase,
  EditorTreeItem
} from './provider'
export {
  EditorProviderError,
  editorSupportsCodeLanguage,
  editorSupportsOperation,
  editorSupportsSearch,
  isEditorAbortError,
  isEditorProviderError,
  withEditorProviderErrors
} from './provider'
export { editorSavePhaseLabel } from './editorSaveStatus'
export { dispatchEditorNotification, EDITOR_NOTIFICATION_EVENT } from './editorNotifications'
export type { EditorNotificationDetail } from './editorNotifications'
export { useEditorDocumentSnapshot } from './useEditorDocumentSnapshot'
export { useEditorQuickOpenSearch } from './quick-open'
export { editorDocumentKey } from './documentIdentity'
export { createEditorView, editorDocumentReplacement, replaceEditorDocument } from './codeMirror'
export type { CreateEditorViewOptions } from './codeMirror'
export {
  codeSyntaxTheme,
  collectDocumentWords,
  createCodeEditorExtensions,
  createCodeSnippetExtension,
  documentWordCompletion
} from './codeEditor'
export type { CodeEditorExtensionOptions } from './codeEditor'
export { markdownEditorTheme, markdownProseTheme } from './themes'
export * from './tree'
export { EditorDocumentTabBar } from './EditorDocumentTabBar'
export type { EditorDocumentTab } from './EditorDocumentTabBar'
export { EditorBreadcrumbs } from './EditorBreadcrumbs'
export type { EditorBreadcrumbEntry, EditorBreadcrumbsProps } from './EditorBreadcrumbs'
export { MenuList as EditorMenuList } from '@workspace/ui/MenuList'
export type { MenuListItem as EditorMenuItem } from '@workspace/ui/MenuList'
export { EditorTabChip } from './EditorTabChip'
export type { EditorTabChipProps } from './EditorTabChip'
export { EditorSearchButton } from './EditorSearchButton'
export { editorSearch, toggleEditorSearch } from './editorSearch'
export { EditorNameForm } from './EditorNameForm'
export { EditorTextSurface, externalEditorChange } from './EditorTextSurface'
export type { EditorTextSurfaceProps } from './EditorTextSurface'
export { EditorMarkdownDocument } from './EditorMarkdownDocument'
export type { EditorMarkdownDocumentProps } from './EditorMarkdownDocument'
export { EditorMarkdownEditor } from './EditorMarkdownEditor'
export type { EditorMarkdownEditorProps } from './EditorMarkdownEditor'
export { EditorMarkdownTitleInput } from './EditorMarkdownTitleInput'
export { EditorMarkdownTitle } from './EditorMarkdownTitle'
export { EditorAssetPreview } from './EditorAssetPreview'
export type { EditorAssetPreviewProps } from './EditorAssetPreview'
export { editorAssetContentType } from './assetContentType'
export {
  discardEditorViewState,
  moveEditorViewState,
  readEditorViewState,
  writeEditorViewState
} from './viewStateCache'
export type { EditorViewStateStorage, CachedEditorState } from './viewStateCache'
export { markdownFormattingKeymap, toggleMarkdownWrap } from './markdownCommands'
export { markdownLinkNavigation } from './markdownLinkNavigation'
export type { EditorMarkdownLink } from './markdownLinkNavigation'
export {
  buildRenamedPath,
  markdownExtensionOf,
  markdownTitleFor,
  resolveMarkdownTitleRenameTarget,
  validateTitleInput
} from './markdownTitle'
export type { MarkdownTitleRenameTarget } from './markdownTitle'
export type { TitleValidationError } from './markdownTitle'
export { resolveEditorRelativeLink } from './relativeLink'
export { resolveEditorWikiLink } from './resolveEditorWikiLink'
export type { EditorWikiLinkSource } from './resolveEditorWikiLink'
export {
  HEADING_TYPES,
  markdownDocumentPath,
  markdownImageResolver,
  markdownLivePreview,
  markdownRootPath
} from './markdownLivePreview'
export { markdownMathExtension } from './markdownMath'
export type { MarkdownImageResolver, MarkdownImageResource } from './markdownLivePreview'
export { editorMarkdownParserExtensions, wikiLinkExtension } from './markdownWikilink'
export { createMarkdownEditorExtensions } from './markdownEditor'
export type { MarkdownEditorOptions } from './markdownEditor'
export {
  editorCodeMirrorCodeSelectionExtensions,
  editorCodeMirrorHostExtensions
} from './editorCodeMirrorHost'
export {
  detectIndentation,
  indentGuideColumns,
  indentGuides,
  whitespaceGuideDepth
} from './indentGuides'
export { EditorQuickOpenDialog } from './quick-open'
export type { EditorQuickOpenItem } from './quick-open'
export {
  clearEditorDocumentDirty,
  confirmDirtyEditorDocumentsInPaths,
  confirmEditorDocumentClose,
  confirmEditorDocumentCloseById,
  discardEditorDocumentViewState,
  setEditorDocumentDirty
} from './documentDirtyRegistry'
export type { EditorConfirm } from './documentDirtyRegistry'
export { fuzzyEditorSearch } from './quick-open'
export type { EditorFuzzyMatch } from './quick-open'
