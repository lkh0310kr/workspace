# 백로그

이 문서에는 채택되어 실행할 작업만 둔다. 구현이 끝났거나 현재 코드에 이미 동작 경로가 있는 요청은 미완료 버그로 단정하지 않고, 필요한 제품 acceptance로 기록한다. 범위가 커지면 결과 스펙과 검증 계획을 owner 문서에 두고 여기에는 다음에 실행할 구체 단위만 남긴다. 상태는 코드 존재 여부, 런타임 acceptance, 배포·운영 확인을 구분한다.

## 진행 중

### PKMS 즉시 반응, Web→local 반영, context-menu 전용 파일 작업

- **목표 결과:** TreeView와 Editor의 모든 사용자 입력은 현재 보이는 상태를 즉시 갱신한다. Cache가 있으면 바로 렌더하고, 서버·파일시스템 작업은 background에서 완료한다. 실패 시 영향받은 item/directory만 authoritative source에서 재조정한다. Web에서 저장한 Markdown은 Cloud revision을 거쳐 연결된 Desktop local folder에 반영되며, sync 경고는 조작 가능한 UI를 가리지 않는다.
- **파일 조작 정책:** PKMS tree toolbar에는 Files filter와 New note/New folder만 둔다. Upload, Rename, Delete는 toolbar, keyboard shortcut, editor title click에서 시작할 수 없고 tree right-click menu에서만 시작한다. Move는 drag-and-drop 및 cut/paste를 유지한다. Context menu는 선택된 항목 기준으로 Upload/Rename/Delete를 한 번씩 제공한다.
- **즉시 동작 목록 / acceptance:**
  1. Workspace 재열기: cached tree·확장 상태·scroll을 먼저 표시하고 최신 `/directory` 결과로 background refresh한다.
  2. 파일 열기/전환: route, 선택, editor frame을 즉시 바꾸고 cached Yjs/document body를 먼저 보여준다. 이전 문서 저장이나 local mirror sync 완료가 다음 문서 표시를 막지 않는다. 미전송 데이터는 durable queue/session에 남고 이후 ACK/error가 분명해야 한다.
  3. 폴더 펼치기/접기: 펼침을 즉시 표시하고 cache miss만 해당 row에 loading 표시한다. 직계 목록을 fetch하고 그 하위 폴더를 한 단계 prefetch한다. stale response가 이후 상태를 되돌리지 않는다.
  4. Selection, multi-select, keyboard focus, tree scroll, breadcrumb, back/forward: 입력 frame에서 반영하고 editor·tree scroll 위치를 보존한다.
  5. Create note/folder: optimistic row를 즉시 추가한다. ACK가 오면 canonical ID/path로 바꾸고, 실패하면 해당 row만 제거한다.
  6. Rename/move: path와 열린 문서·selection·expanded/current folder를 즉시 remap한다. 서버 충돌/링크 수정은 background로 처리하고 실패 시 최신 경로로 rollback/reconcile한다. 여러 항목은 독립 요청을 제한된 동시성으로 처리한다.
  7. Delete: context menu에서만 시작한다. 확인 후 즉시 숨기고 서버 ACK 후 확정한다. subtree conflict이면 삭제를 복원하고 보존된 path와 이유를 표시한다.
  8. Upload: context menu에서만 시작한다. target directory에 optimistic row와 byte progress를 표시하고 성공/실패를 해당 항목에 귀속한다.
  9. Autosave/Cloud→local: 입력 후 짧은 debounce로 Yjs update를 ACK 받는다. Desktop Realtime wakeup을 우선 쓰고, realtime이 끊긴 동안 revision poll이 bounded interval로 회복한다. 저장된 Cloud revision이 local file의 bytes/hash와 수렴한다.
  10. Search/Quick Open: 키 입력과 focus는 즉시, 요청은 debounce/abort, cache hit는 먼저 노출한다. 검색 결과 열기는 현재 문서 저장 대기로 막히지 않는다.
  11. Error/sync status/toast: red error와 dismiss target이 tree toolbar, breadcrumb, editor control을 가리지 않는다. 경고는 내용·대상·retry/dismiss 행동을 제공한다.
- **현재 발견 / 구현 진행:** Web autosave debounce 400ms, Desktop revision fallback poll 5초를 적용했다. PKMS toolbar는 filter/create만 유지하며 Upload/Rename/Delete는 context menu에 하나씩 있다. keyboard Delete/F2와 title-click rename은 비활성화했다. 오류 알림 본문은 pointer event를 통과시키고 닫기 버튼만 hit target으로 남겼다. Web Worker를 배포·reload했고 실제 화면을 확인했다. Desktop app을 `promote:stable`로 교체했고 우클릭 메뉴와 toolbar를 확인했다. `invalid_sync_cursor`는 authoritative snapshot + durable full-scan으로 회복했다. 실행 중 Sync settings `Up to date`, cursor 3096, pending paths 0, Web 열린 문서와 local file SHA 일치를 확인했다.
- **수락 테스트:** 저장한 표본 Markdown 한 개를 Web에서 편집하고 Cloud Yjs revision/내용, Desktop local file bytes/hash, local editor 표시를 같은 변경으로 비교한다. Realtime 정상·차단 두 경우를 확인한다. UI에서는 toolbar에 Upload/Rename/Delete가 0개, 우클릭 menu에 각각 하나, keyboard/title click 경로에서는 시작 불가를 확인한다. 오류 알림이 떠 있는 상태에서도 tree row·breadcrumb·editor control을 클릭할 수 있어야 한다. 모두 production Web과 실행 중인 Desktop에서 재현 확인한다.
- **근거:** [Folder sync UI acceptance](../architecture/workspace/pkms/folder-sync/ui-acceptance.md), [Folder sync protocol](../architecture/workspace/pkms/folder-sync/server-protocol.md), [PKMS Editor parity](../architecture/workspace/pkms/editor-parity.md)

### Editor 탐색·Markdown 회귀와 제품 acceptance

- **목표 결과:** Workspace Editor에서 Explorer의 열림 상태와 스크롤 위치가 선택·파일 열기·새로고침·접기·pane 크기 변경 뒤에도 일관된다. Markdown 제목과 본문은 같은 문서 폭에 정렬되고, 렌더링 또는 직접 편집을 지원하지 않는 문법은 원문을 잃지 않는다.
- **미해결 보고:** `a6b373a`를 `/Applications/Workspace.app`에 `promote:stable`로 설치하고 실제 PKMS 데스크톱에서 `guitaringo.md`를 열어 Mermaid 그래프 라벨 대비와 표 안의 `<br>` 줄바꿈을 확인했다. 파일을 `now.md`로 전환하고 돌아온 뒤 TreeView의 보이는 항목 위치도 유지됐다. `Cmd+\\`의 실제 물리 키 입력은 컴퓨터 제어에서 검증하지 못했으며 자동화된 sidebar 회귀 테스트만 통과했다. Explorer의 폭 변경·접기/펼치기, 표 셀 caret/스크롤, 검색 이동, 실제 dark/light acceptance, 웹 PKMS 배포 화면은 남아 있다. 기존 CodeMirror DOM·TreeView 통합 테스트와 renderer fixture 테스트는 통과했다.
- **수락:** [Editor 완성도 목표 스펙](../architecture/editor/markdown/product-completeness.md)의 EXP·DOC·TBL·TEX·DIA·HTML·KEY 시나리오를 실제 Workspace 화면과 저장 파일 round-trip으로 확인한다. 현재 설치판에서 DIA의 Mermaid 라벨 가독성, TBL의 `<br>` 줄바꿈, 파일 간 TreeView 위치 유지는 확인했다. 나머지 수락은 검색 결과가 해당 파일·줄을 여는지, 수정하지 않은 문서의 선택·스크롤이 전환 뒤 유지되는지, 표 편집 caret과 편집 결과가 저장 파일에 round-trip되는지까지 실제 앱에서 확인한다. dark/light와 web PKMS는 각 배포 경로에서 확인한다. 재현된 실패는 입력 fixture, 기대 결과, 실행 증거를 owner 문서에 연결한다.
- **경계:** 이 항목은 모든 Markdown 기능을 한 번에 구현한다는 뜻이 아니다. 우선 Explorer 복원과 재현 가능한 시각/렌더링 실패를 닫고, 표·수식·HTML 등은 각 수락 ID 단위로 진행한다.
- **근거:** [TreeView 목표](../architecture/editor/treeview/README.md), [Markdown 구현 현황](../architecture/editor/markdown/README.md), [탐색 검토](./editor-navigation-review.md)

### PKMS folder sync 안전성 acceptance

- **현재 상태:** root 전환 때 해당 workspace의 local replica baseline/cache를 정리하는 정책과 단위 테스트가 있다. 삭제·충돌 정책도 구현돼 있으나 실제 macOS 및 배포 migration acceptance는 완료 근거가 없다.
- **목표 결과:** 다른 로컬 root를 연결하거나 scan이 불완전하다는 이유만으로 Cloud 파일·폴더가 삭제되지 않는다. 원격 변경과 로컬 삭제가 경합하면 최신 원격 데이터를 보존하고 충돌·복구 결과를 사용자에게 보여준다. attachment와 durable sync 상태도 저장 파일 결과와 일치한다.
- **수락:** 기존 remote tree를 둔 채 empty/populated root로 재연결하고, 앱 재시작·partial scan·동시 원격 변경·재시도를 수행한다. 의도하지 않은 tombstone이 없는지 확인한다. macOS에서 파일/폴더 삭제와 충돌 복구를 실행하고, attachment 및 재시작 뒤 sync 표시를 검증한다. deployed migration은 실제 적용 버전과 결과를 별도 기록한다.
- **근거:** [Folder sync 결과·durability 계약](../architecture/workspace/pkms/folder-sync/README.md), [삭제 계약](../architecture/workspace/pkms/folder-sync/deletion.md), [UI acceptance](../architecture/workspace/pkms/folder-sync/ui-acceptance.md), [기능 상태](./feature-status.md)

## 완료

### PKMS Editor tree와 파일명 표시 정리 — 완료

- **결과:** PKMS tree 상단에서 upload·rename·delete 도구를 제거했다. create는 기존 New note/New folder 동작으로, rename/delete는 tree context menu·키보드 명령과 Markdown 제목 rename으로 제공한다.
- **파일명 규칙:** Workspace Editor tree는 `.md`/`.markdown` suffix를 표시하고 PKMS Editor tree만 숨긴다. 공통 label helper는 제품별 표시 옵션을 받는다.
- **rename identity:** 제목 rename은 기존 확장자를 보존하며 provider item ID로 rename한다. PKMS provider는 열린 session의 item metadata를 갱신하고, 로컬 sync rename은 session을 새 경로로 rekey한다. Workspace는 기존 파일 path remap 흐름을 사용한다.
- **검증:** 실행 중인 `npm run dev` 앱에서 PKMS tree toolbar 항목이 사라지고 New note/New folder가 남는지, `.md` suffix가 숨겨지는지 확인했다. Workspace label 규칙과 Markdown rename extension 보존 테스트도 통과했다.
- **근거:** [Editor 통합·provider 계약](./editor-unification.md), [PKMS Editor parity](../architecture/workspace/pkms/editor-parity.md)

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
- **근거:** [Home UI 스펙](../architecture/workspace/home/README.md), [Home server](../architecture/workspace-server/README.md), [기능 상태](./feature-status.md)

### Home 상세 시스템 정보 범위 결정 및 구현

- **목표 결과:** 기본 CPU·메모리·홈 볼륨 요약과 구분되는 프로세스별 Activity Monitor 및 상세 Storage 정보를 제공한다.
- **완료 조건:** 표시할 값, 갱신/오류/권한 상태와 플랫폼별 제공 범위를 Home 결과 스펙에 정의하고, 지원되는 플랫폼에서 실제 값을 검증한다. 수집할 수 없는 정보는 빈 값이나 오해를 부르는 0으로 표시하지 않는다.
- **근거:** [Home UI 스펙](../architecture/workspace/home/README.md), [감사 AUD-17](./top-down-documentation-audit.md)

서버 로그 홈에서 확인하기
