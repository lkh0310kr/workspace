export type ResolvedEbookTheme = "light" | "sepia" | "dark";
/** "auto" follows the app's own light/dark preference; the rest pin the
 * page to one palette regardless of the surrounding chrome. */
export type EbookTheme = ResolvedEbookTheme | "auto";
export type EbookFlow = "paginated" | "scrolled";

export interface EbookBookmark {
  cfi: string;
  label: string;
  createdAt: string;
}

export const EBOOK_STATE_SCHEMA = 1;

export interface EbookBookState {
  schema: number;
  cfi?: string;
  fraction?: number;
  theme: EbookTheme;
  fontScale: number;
  lineHeight: number;
  flow: EbookFlow;
  /** Off leaves paging to the keyboard and the toolbar, for readers who
   * click into the text to select or follow notes. */
  clickToTurn: boolean;
  bookmarks: EbookBookmark[];
  updatedAt: string;
}

export const DEFAULT_EBOOK_STATE: EbookBookState = {
  schema: EBOOK_STATE_SCHEMA,
  theme: "auto",
  fontScale: 1,
  lineHeight: 1.4,
  flow: "paginated",
  clickToTurn: true,
  bookmarks: [],
  updatedAt: "",
};

export function ebookLocationKey(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Schema 0 (unversioned) wrote the whole merged state on every page
 * turn, so its default theme — then "light" — is baked into every book
 * ever opened. Left alone those books would stay pinned to light and
 * ignore the app's dark mode, so an unversioned "light" is read as the
 * default it actually was rather than as a deliberate choice. A pick made
 * after this migration carries schema 1 and is preserved. */
function migrate(stored: Partial<EbookBookState>): Partial<EbookBookState> {
  if (stored.schema != null) return stored;
  return { ...stored, theme: stored.theme === "light" ? "auto" : stored.theme };
}

export function mergeEbookState(
  stored: Partial<EbookBookState> | undefined,
  patch: Partial<EbookBookState>,
): EbookBookState {
  const migrated = stored ? migrate(stored) : undefined;
  return {
    ...DEFAULT_EBOOK_STATE,
    ...migrated,
    ...patch,
    schema: EBOOK_STATE_SCHEMA,
    bookmarks: patch.bookmarks ?? migrated?.bookmarks ?? [],
    updatedAt: patch.updatedAt ?? migrated?.updatedAt ?? new Date().toISOString(),
  };
}
