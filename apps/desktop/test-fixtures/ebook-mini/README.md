# Mini Page Turn

장 내부 페이지 넘김과 장 경계를 확인하기 위한 spine 2개짜리 EPUB이다.

- Generator: `apps/desktop/src/main/content/epub/miniEpub.ts`
- 바이너리: `mini-page-turn.epub` (파일 뷰어 트리에서 열기)
- Contract tests: `epub.test.ts`, `epubFoliate.test.ts`, `epubKeys.test.ts` (`ebookTurnAfterPage`)

첫 번째 장은 `next()`가 `ch2.xhtml`로 이동하기 전에 열(column)을 넘겨야 할 만큼 충분히 길다.
