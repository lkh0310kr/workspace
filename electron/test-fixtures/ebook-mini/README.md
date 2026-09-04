# Mini Page Turn

Two-spine EPUB used to verify in-chapter pagination and the chapter boundary.

- Generator: `electron/src/main/miniEpub.ts`
- Binary: `mini-page-turn.epub` (open from the File Viewer tree)
- Contract tests: `epub.test.ts`, `epubFoliate.test.ts`, `epubKeys.test.ts` (`ebookTurnAfterPage`)

Chapter one is long enough that `next()` must advance columns before `ch2.xhtml`.
