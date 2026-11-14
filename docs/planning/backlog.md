# 백로그

이 문서에는 채택되어 실행할 작업만 둔다. 구현이 끝났거나 현재 코드에 이미 동작 경로가 있는 요청은 미완료 버그로 단정하지 않고, 필요한 제품 acceptance로 기록한다. 범위가 커지면 결과 스펙과 검증 계획을 owner 문서에 두고 여기에는 다음에 실행할 구체 단위만 남긴다. 상태는 코드 존재 여부, 런타임 acceptance, 배포·운영 확인을 구분한다.

## 진행 중

### Editor 탐색·Markdown 회귀와 제품 acceptance

- **목표 결과:** Workspace Editor에서 Explorer의 열림 상태와 스크롤 위치가 선택·파일 열기·새로고침·접기·pane 크기 변경 뒤에도 일관된다. Markdown 제목과 본문은 같은 문서 폭에 정렬되고, 렌더링 또는 직접 편집을 지원하지 않는 문법은 원문을 잃지 않는다.
- **미해결 보고:** Explorer pane 토글/탭 전환/폭 변경의 실제 앱 acceptance가 남아 있다. dark theme active-line gutter는 공통 theme token으로 수정했고 생성 CSS 회귀 테스트를 추가했으나 실제 dark/light 화면 수락은 남아 있다. `Cmd/Ctrl+\\`는 한국어 키 문자 입력으로 sidebar handler가 닫기·재열기하는 React 회귀 테스트까지 통과했다. Explorer의 active file 변경, component unmount/remount, anchor 우선 복원은 TreeView 통합 테스트에서 확인했고 pixel fallback·viewport clamp도 단위 테스트가 통과했다. 표 셀 click 편집은 CodeMirror DOM 테스트에서 Markdown source 갱신까지 통과했으며 Tab 이동·caret·scroll 앱 acceptance가 남아 있다. 웹 PKMS Mermaid 문제는 `guitaringo.md` 전체 그래프에서 재현해 공유 renderer를 수정했다. unquoted colon label은 렌더 시 quote 처리하고 원문은 보존하며 전체 fixture의 SVG 출력 테스트와 PKMS 웹 production build를 통과했다. 실제 배포 화면 확인은 남아 있다.
- **수락:** [Editor 완성도 목표 스펙](../../packages/editor/docs/markdown/product-completeness.md)의 EXP·DOC·TBL·TEX·DIA·HTML·KEY 시나리오를 실제 Workspace 화면과 저장 파일 round-trip으로 확인한다. 검색 결과를 클릭하면 해당 파일·줄이 열린다. 수정하지 않은 문서와 선택·스크롤 위치가 다른 문서 전환 때문에 이동하지 않는다. 재현된 실패는 입력 fixture, 기대 결과, 실행 증거를 owner 문서에 연결한다.
- **경계:** 이 항목은 모든 Markdown 기능을 한 번에 구현한다는 뜻이 아니다. 우선 Explorer 복원과 재현 가능한 시각/렌더링 실패를 닫고, 표·수식·HTML 등은 각 수락 ID 단위로 진행한다.
- **근거:** [TreeView 목표](../../packages/editor/docs/treeview/README.md), [Markdown 구현 현황](../../packages/editor/docs/markdown/README.md), [탐색 검토](./editor-navigation-review.md)

### PKMS folder sync 안전성 acceptance

- **현재 상태:** root 전환 때 해당 workspace의 local replica baseline/cache를 정리하는 정책과 단위 테스트가 있다. 삭제·충돌 정책도 구현돼 있으나 실제 macOS 및 배포 migration acceptance는 완료 근거가 없다.
- **목표 결과:** 다른 로컬 root를 연결하거나 scan이 불완전하다는 이유만으로 Cloud 파일·폴더가 삭제되지 않는다. 원격 변경과 로컬 삭제가 경합하면 최신 원격 데이터를 보존하고 충돌·복구 결과를 사용자에게 보여준다. attachment와 durable sync 상태도 저장 파일 결과와 일치한다.
- **수락:** 기존 remote tree를 둔 채 empty/populated root로 재연결하고, 앱 재시작·partial scan·동시 원격 변경·재시도를 수행한다. 의도하지 않은 tombstone이 없는지 확인한다. macOS에서 파일/폴더 삭제와 충돌 복구를 실행하고, attachment 및 재시작 뒤 sync 표시를 검증한다. deployed migration은 실제 적용 버전과 결과를 별도 기록한다.
- **근거:** [Folder sync 결과·durability 계약](../../apps/workspace-app/docs/pkms/folder-sync/README.md), [삭제 계약](../../apps/workspace-app/docs/pkms/folder-sync/deletion.md), [UI acceptance](../../apps/workspace-app/docs/pkms/folder-sync/ui-acceptance.md), [기능 상태](./feature-status.md)

## 다음

### 영향 기반 Editor 검증 경로 고정 (SDD WP-04)

- **문제:** 공유 Editor 수정이 이를 소비하는 앱의 CI 경로에 포함되는지, test wrapper가 지정한 테스트와 실패 exit code를 올바르게 전달하는지 아직 계획상 미완료다.
- **목표 결과:** 변경된 공유 패키지와 소비 앱에 맞는 검증을 선택할 수 있고, 문서에 적힌 명령이 CI와 로컬에서 같은 범위를 실행한다. native ABI·GC 등 실행 전제와 기존 실패가 새 회귀와 구분된다.
- **완료 조건:** workflow path filter와 test wrapper를 현재 package graph에 맞춘다. Editor-only 변경이 PKMS Web 검증을 유발하는지 확인하고, 지정 테스트 실행·실패 exit 전달·필수 native 환경을 검증한다. 명령과 영향 범위를 소유 문서에 반영한다.
- **근거:** [SDD 전환 계획 WP-04](./spec-driven-development-roadmap.md), [감사 AUD-08~10](./top-down-documentation-audit.md)

### Home OAuth 운영 연결과 제품 acceptance

- **문제:** Home UI/API source는 분리돼 있으나 OAuth secrets, callback, provider 재연결과 실제 운영 acceptance는 현재 확인되지 않았다.
- **목표 결과:** 사용자는 외부 서비스 연결 상태, 실패, 재인증 필요 상태를 구분해 볼 수 있고, 유효한 연결은 Home에서 정상적으로 조회된다. Home API와 PKMS server의 책임 경계가 유지된다.
- **완료 조건:** 운영 환경의 client 설정·callback·재연결 결과를 확인하고 Web/Desktop의 성공·만료·취소·provider 오류 결과를 검증한다. 코드 구현, 외부 설정, 배포 검증을 따로 기록한다.
- **근거:** [Home UI 스펙](../../apps/workspace-app/docs/home/README.md), [Home server](../../apps/workspace-server/docs/README.md), [기능 상태](./feature-status.md)

### PKMS Editor tree와 파일명 표시 정리

- **현재 요청:** PKMS Editor tree 상단의 upload·rename·delete 도구 모음을 제거한다. `.md` 확장자는 Workspace Editor에서 표시하고 PKMS Editor에서만 숨긴다.
- **목표 결과:** 두 제품은 공유 편집기의 공통 편집 동작을 유지하면서 요청된 제품별 표시만 갖는다. PKMS 파일 생성·rename·delete capability 자체는 트리 상단 도구 모음 제거와 혼동되지 않는다.
- **완료 조건:** PKMS tree 상단에 해당 도구 모음이 없고 기존 지원 작업은 명시된 다른 진입점에서 계속 동작한다. 같은 Markdown 파일을 Workspace와 PKMS에서 열어 suffix 표시가 각각 요구대로 다르며, rename 결과의 실제 경로와 열린 문서 identity가 보존된다.
- **근거:** [Editor 통합·provider 계약](./editor-unification.md), [PKMS Editor parity](../../apps/workspace-app/docs/pkms/editor-parity.md)

### Home 상세 시스템 정보 범위 결정 및 구현

- **목표 결과:** 기본 CPU·메모리·홈 볼륨 요약과 구분되는 프로세스별 Activity Monitor 및 상세 Storage 정보를 제공한다.
- **완료 조건:** 표시할 값, 갱신/오류/권한 상태와 플랫폼별 제공 범위를 Home 결과 스펙에 정의하고, 지원되는 플랫폼에서 실제 값을 검증한다. 수집할 수 없는 정보는 빈 값이나 오해를 부르는 0으로 표시하지 않는다.
- **근거:** [Home UI 스펙](../../apps/workspace-app/docs/home/README.md), [감사 AUD-17](./top-down-documentation-audit.md)

Workspace.app.previous-2026-11-13T03-17-42-866Z.app 이런식으로 잔상을 남기는데 이런짓하지마. 용량 존나 차지함..
