# 백로그

현재 제품 범위에 남아 있는 검증·정리 작업만 기록한다. 보류 제품이나 기능 아이디어는 이 목록에 넣지 않고 `archive/`에서 관리한다.

## 우선순위 1 — Desktop 로컬 Editor 실제 사용 확인

- 선택한 폴더에서 파일 열기, 편집, autosave, 이름 변경을 확인한다.
- 외부 프로그램이 파일을 바꾸거나 저장 충돌이 생겼을 때 감지·표시·복구 동작을 확인한다.
- 일반 로컬 폴더와 외부 동기화 앱이 관리하는 로컬 폴더에서 동일한 편집 결과를 확인한다. 앱 자체 동기화 기능은 추가하지 않는다.
- 실제 UI에서 확인한 결과와 재현 절차를 기록한다.

## 우선순위 2 — Editor 탐색·문서 형식 acceptance

- Quick Open과 파일 내용 검색이 올바른 파일·줄을 열고 문서 전환 후 선택·scroll 상태를 보존하는지 확인한다.
- Markdown 표·링크·이미지·Mermaid·코드 fence의 저장 결과와 렌더링 결과를 확인한다.
- Tree, 검색, 파일 viewer의 주요 흐름이 Editor 안에서 계속 동작하는지 확인한다.

## 우선순위 3 — 플랫폼별 Home·기능 host 확인

- Home의 OS별 CPU·저장 공간 정보가 지원 플랫폼에서 올바르게 표시되는지 확인한다.
- Home, Browser, Terminal, Editor 패키지와 Desktop host 사이의 계약·수명주기가 문서와 구현에서 일치하는지 검토한다. 기존 pane 선택·visibility 동작은 유지한다.

## 우선순위 4 — Server 운영 확인

- 배포된 `GET /api/health` 응답과 현재 배포 workflow를 확인한다.
- Server는 상태 확인만 제공하며 Desktop 편집 흐름에 의존성을 추가하지 않는다.

## 완료된 정리

- 저장소 활성 앱 경로를 `apps/desktop`과 `apps/server`로 정리했다.
- 기능 패키지를 `packages/home`, `packages/browser`, `packages/terminal`, `packages/editor`, `packages/ui`로 구분했다.
- Cursor·Gemini·OpenCode 에이전트 인식과 UI, 서비스 연동 API, 앱 내 Google Drive 연동 코드를 제거했다.
- Server를 health endpoint로 축소하고 배포 workflow에서 제거된 D1 마이그레이션 단계를 삭제했다.
