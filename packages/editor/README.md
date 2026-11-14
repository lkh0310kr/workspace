# Shared Editor package

Package scope의 공통 tree·문서 tab·CodeMirror text/Markdown UI와 provider 계약이다. Workspace Desktop과 PKMS client가 소비하며 Electron·인증·Yjs·파일시스템을 직접 소유하지 않는다.

[구현 스펙과 읽는 순서](../../docs/architecture/editor/README.md) → [provider](../../docs/architecture/editor/provider.md) → [text surface](../../docs/architecture/editor/code/README.md) → tree/Markdown/search 순으로 읽는다. 호스트별 저장·인증·asset resolver는 소유 app/package 문서에 둔다.

공개 entrypoint와 CSS subpath는 [package.json](./package.json), export symbol은 [index.ts](./src/index.ts)가 기준이다. [공개 API 분류와 작은 UI](../../docs/architecture/editor/public-api.md)는 API별 owner를 연결한다. 현재 독립 test script는 없고 소비 앱 테스트가 일부 계약을 검증한다. 패키지 독립 검증·시각 fixture와 문서만의 재생성은 후속 범위다.
