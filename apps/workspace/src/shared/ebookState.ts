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

export function mergeEbookState(
  stored: Partial<EbookBookState> | undefined,
  patch: Partial<EbookBookState>,
): EbookBookState {
  return {
    ...DEFAULT_EBOOK_STATE,
    ...stored,
    ...patch,
    schema: EBOOK_STATE_SCHEMA,
    bookmarks: patch.bookmarks ?? stored?.bookmarks ?? [],
    updatedAt: patch.updatedAt ?? stored?.updatedAt ?? new Date().toISOString(),
  };
}
