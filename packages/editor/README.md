# Shared Editor package

Package scope의 공통 Tree pane/frame·row·문서 tab·CodeMirror text/Markdown UI와 provider 계약이다. Workspace Desktop과 PKMS client가 소비하며 Electron·인증·Yjs·파일시스템을 직접 소유하지 않는다. Tree의 provider state와 작업 실행은 host에 두고, pane의 header/content/footer 조립과 row presentation은 공유 API로 강제한다.

[구현 스펙과 읽는 순서](../../docs/architecture/editor/README.md) → [provider](../../docs/architecture/editor/provider.md) → [text surface](../../docs/architecture/editor/code/README.md) → tree/Markdown/search 순으로 읽는다. `EditorMarkdownEditor`는 공통 문서 surface 조립 entrypoint이고, `EditorTreePane`은 세 제품에서 tree row를 조립하는 public entrypoint다. Host별 저장·인증·asset resolver는 [루트 docs](../../docs/README.md)에서 해당 기능 문서를 찾는다.

공개 entrypoint와 CSS subpath는 [package.json](./package.json), export symbol은 [index.ts](./src/index.ts)를 기준으로 한다. Tree toolbar는 `EditorTreeToolbar`를 사용하고 저수준 row와 virtual-list는 package 안에 둔다. `npm run check:editor-tree-contract`가 세 제품의 공용 tree 진입점과 비공개 구현 사용을 검사한다. [공개 API 분류와 UI](../../docs/architecture/editor/public-api.md)에서 API별 owner를 확인한다.
