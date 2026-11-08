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
  EditorReplaceOptions,
  EditorSearchResult,
  EditorSyncPhase,
  EditorTreeItem,
} from "./provider";
export { EditorProviderError, isEditorAbortError, isEditorProviderError, withEditorProviderErrors } from "./provider";
export { editorSavePhaseLabel } from "./editorSaveStatus";
export { useEditorDocumentSnapshot } from "./useEditorDocumentSnapshot";
export { editorDocumentKey } from "./documentIdentity";
export { createEditorView, editorDocumentReplacement, replaceEditorDocument } from "./codeMirror";
export type { CreateEditorViewOptions } from "./codeMirror";
export { markdownEditorTheme, markdownProseTheme } from "./themes";
export { EditorTreeRow } from "./EditorTreeRow";
export type { EditorTreeRowProps } from "./EditorTreeRow";
export { EditorTreeVirtualList } from "./EditorTreeVirtualList";
export type { EditorTreeVirtualListProps } from "./EditorTreeVirtualList";
export { EditorDocumentTabBar } from "./EditorDocumentTabBar";
export type { EditorDocumentTab } from "./EditorDocumentTabBar";
export { EditorMenuList } from "./EditorMenuList";
export type { EditorMenuItem } from "./EditorMenuList";
export { EditorTabChip } from "./EditorTabChip";
export type { EditorTabChipProps } from "./EditorTabChip";
export { EditorSearchButton } from "./EditorSearchButton";
export { editorSearch, toggleEditorSearch } from "./editorSearch";
export { EditorTextSurface, externalEditorChange } from "./EditorTextSurface";
export type { EditorTextSurfaceProps } from "./EditorTextSurface";
export { EditorMarkdownDocument } from "./EditorMarkdownDocument";
export type { EditorMarkdownDocumentProps } from "./EditorMarkdownDocument";
export { EditorMarkdownTitleInput } from "./EditorMarkdownTitleInput";
export { discardEditorViewState, moveEditorViewState, readEditorViewState, writeEditorViewState } from "./viewStateCache";
export type { EditorViewStateStorage, CachedEditorState } from "./viewStateCache";
export { EditorOutlineList } from "./EditorOutlineList";
export type { EditorOutlineEntry, EditorOutlineListProps } from "./EditorOutlineList";
export { markdownFormattingKeymap, toggleMarkdownWrap } from "./markdownCommands";
export { markdownLinkNavigation } from "./markdownLinkNavigation";
export type { EditorMarkdownLink } from "./markdownLinkNavigation";
export { buildRenamedPath, markdownExtensionOf, markdownTitleFor, validateTitleInput } from "./markdownTitle";
export type { TitleValidationError } from "./markdownTitle";
export { resolveEditorRelativeLink } from "./relativeLink";
export { resolveEditorTreePath } from "./resolveEditorTreePath";
export { HEADING_TYPES, markdownImageResolver, markdownLivePreview, markdownRootPath } from "./markdownLivePreview";
export type { MarkdownImageResolver, MarkdownImageResource } from "./markdownLivePreview";
export { wikiLinkExtension } from "./markdownWikilink";
export { createMarkdownEditorExtensions } from "./markdownEditor";
export type { MarkdownEditorOptions } from "./markdownEditor";
export { markdownOutlineFromState, markdownOutlineFromText } from "./markdownOutline";
export type { MarkdownHeading } from "./markdownOutline";
export { EditorQuickOpenDialog } from "./EditorQuickOpenDialog";
export type { EditorQuickOpenItem } from "./EditorQuickOpenDialog";
export { flattenEditorTree, projectEditorTreeRows, EDITOR_TREE_ROW_HEIGHT } from "./treeModel";
export type { EditorTreeBranchEntry, EditorVisibleTreeRow, EditorTreeProjection } from "./treeModel";
export { clearEditorDocumentDirty, confirmDirtyEditorDocumentsInPaths, confirmEditorDocumentClose, confirmEditorDocumentCloseById, discardEditorDocumentViewState, setEditorDocumentDirty } from "./documentDirtyRegistry";
export { fuzzyEditorSearch } from "./fuzzySearch";
export type { EditorFuzzyMatch } from "./fuzzySearch";
export { resolveEditorTreeArrowKey, resolveEditorTreeKeyboardAction } from "./treeNavigation";
export type { EditorTreeArrowAction, EditorTreeKeyboardAction, EditorTreeNavigationRow } from "./treeNavigation";
export { editorTreeSelectionRoots, resolveEditorTreeSelection } from "./treeSelection";
export type { EditorTreeSelectionModifiers, EditorTreeSelectionState } from "./treeSelection";
export { useEditorTreeSelection } from "./useEditorTreeSelection";
