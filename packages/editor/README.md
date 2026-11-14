# Shared Editor package

Package scope의 공통 tree·문서 tab·CodeMirror text/Markdown UI와 provider 계약이다. Workspace Desktop과 PKMS client가 소비하며 Electron·인증·Yjs·파일시스템을 직접 소유하지 않는다.

[구현 스펙과 읽는 순서](../../docs/architecture/editor/README.md) → [provider](../../docs/architecture/editor/provider.md) → [text surface](../../docs/architecture/editor/code/README.md) → tree/Markdown/search 순으로 읽는다. Host별 저장·인증·asset resolver는 [루트 docs](../../docs/README.md)에서 해당 기능 문서를 찾는다.

공개 entrypoint와 CSS subpath는 [package.json](./package.json), export symbol은 [index.ts](./src/index.ts)를 기준으로 한다. [공개 API 분류와 UI](../../docs/architecture/editor/public-api.md)에서 API별 owner를 확인한다. 현재 독립 test script는 없고 소비 앱 test가 일부 계약을 검증한다. Package 단독 검증, 시각 fixture, 문서 스펙에서 재생성하는 절차는 후속 범위다.
