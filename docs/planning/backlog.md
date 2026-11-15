# 백로그

이 문서에는 채택되어 실행할 작업만 둔다. 구현이 끝났거나 현재 코드에 이미 동작 경로가 있는 요청은 미완료 버그로 단정하지 않고, 필요한 제품 acceptance로 기록한다. 범위가 커지면 결과 스펙과 검증 계획을 owner 문서에 두고 여기에는 다음에 실행할 구체 단위만 남긴다. 상태는 코드 존재 여부, 런타임 acceptance, 배포·운영 확인을 구분한다.

## 진행 중

### PKMS Google Drive 직접 저장·동기화 전환

- **목표 결과:** 현재 단계에서는 Web과 Desktop PKMS가 중간 sync Worker/server 없이 동일 Google Drive workspace를 직접 사용한다. platform-neutral adapter 경계를 유지해 iOS를 나중에 추가할 수 있게 한다. 기존 저장 경로는 Drive 이관의 tree·본문·byte parity가 검증될 때까지 read-only rollback source로 보존한다.
- **현재 구현:** [pkms-google-drive package](../../packages/pkms-google-drive/README.md)에 Drive API client, app marker 기반 root 탐색, branch/tree/file repository, IndexedDB outbox와 incremental change cursor, immutable operation log, foreground Web OAuth, file-scoped Yjs loader가 있다. Web `/`가 shared Editor UI를 사용하는 Drive route로 전환됐고, 기존 API-backed `PkmsClientApp`은 `/existing-pkms`에 migration fallback으로 남는다. Desktop에는 PKCE OAuth, Electron `safeStorage` refresh-token vault, SQLite WAL durable outbox/Yjs 저장소, main-process Drive workspace service와 token 비노출 IPC가 있다. Google Cloud `workspace-514715`의 `Workspace Desktop` client가 native OAuth 기본값으로 연결됐다. Web production Worker는 2026-11-15 재배포했다. 격리 Drive test workspace에서 OAuth 연결, 기존 root 재연결, note open/edit/save/sync, reload+reauth 후 본문 재개방과 `Google Drive is up to date`를 확인했다. 이 과정에서 발견한 legacy operation record ID 충돌 및 root marker 복구를 수정하고 테스트했다.
- **남은 작업:** Desktop stable 반영 후 실계정 Drive CRUD와 재시작을 확인한다. Web·Desktop 모두 Drive fullText 기반 word/phrase 검색을 제공하지만, substring·matching-line preview·offline full-workspace index는 DRIVE-SYNC-08 acceptance를 만족하지 않는다. Binary 편집·기존 자료의 read-only dry-run parity migration도 남아 있다. Web↔Desktop 동시 수렴, offline/restart/ACK-loss, conflict, permission/429 복구 acceptance를 진행한다. iOS는 현재 범위에서 제외하고 공통 provider 경계만 유지한다.
- **완료 조건:** 제품의 sync data path가 Drive API로만 연결되고, 모든 Drive acceptance scenario가 격리 workspace에서 자동 또는 실제 runtime으로 통과하며, 기존 cloud/GitHub source를 건드리지 않는 parity migration이 확인된다.
- **근거:** [Google Drive 직접 동기화 결과 스펙](../architecture/pkms/google-drive-direct-sync.md), [package README](../../packages/pkms-google-drive/README.md), [격리 browser prototype](../../apps/pkms-web/prototypes/google-drive-direct/README.md), [Web route](../../apps/pkms-web/app/routes/pkms-google-drive.tsx)

### PKMS Google Drive API 호출량 절감

- **문제 확인:** Editor typing은 즉시 Drive API를 호출하지 않지만, Yjs transaction마다 outbox operation을 만들고 operation log는 operation마다 Drive 파일을 쓴다. Web/Desktop은 pending change가 없어도 visible 상태에서 15초마다 sync한다. 편집량과 idle reconciliation이 모두 원격 호출량을 불필요하게 늘릴 수 있다.
- **목표 결과:** 로컬 durability는 즉시 유지하면서 같은 문서의 짧은 입력 burst를 하나의 Yjs operation으로 병합한다. pending이 없을 때 polling sync를 줄이고 reconnect/focus/explicit sync에서 catch-up한다.
- **구현:** 문서별 1초 quiet window에서 미발행 Yjs updates를 `Y.mergeUpdates`로 합치며, 각 입력의 로컬 persistence는 유지한다. Editor의 600ms autosave는 로컬 persistence만 수행하고, remote sync를 1.25초 trailing debounce한다. explicit save는 즉시 sync한다. full-document replacement는 최소 Y.Text splice를 적용한다. Web/Desktop idle reconciliation은 15초에서 60초로 낮추고 visible 복귀·online 전환에서 catch-up한다.
- **현재 검증:** 1,000회 synthetic typing이 1개의 document-update outbox operation으로 병합되고, 1,000회 이상 로컬 flush가 유지되는 단위 테스트를 추가했다. UTF-16 surrogate pair가 있는 text replacement 테스트를 추가했다. Drive operation 파일 수 기준 편집 burst 1,000→1(99.9% 감소). PKMS 관련 테스트 43 files/119 tests, Desktop/Web typecheck, Desktop/Web production build 통과. 이 테스트는 실제 Google HTTP 요청 수/지연을 측정하지 않으며, 해당 런타임 계측과 crash/restart/offline/ACK-loss acceptance는 미완료다.
- **남은 acceptance:** DRIVE-SYNC-13. 격리 Google Drive workspace에서 요청별 HTTP 계측, API operation count, 로컬 persistence p50/p95를 기준선과 비교하고, crash/restart/offline/ACK-loss 복구를 확인한다.

### PKMS 즉시 반응과 sync runtime acceptance

- **목표 결과:** TreeView와 Editor 입력은 즉시 반응한다. Cache가 있으면 tree를 먼저 표시하고 서버·파일시스템 작업은 background에서 끝난다. Web에서 저장한 Markdown은 연결된 Desktop local file과 수렴하고, 중단·충돌·재시작에도 변경 내용과 sync 상태가 보존된다.
- **남은 acceptance:**
  1. FS-UI-01~05: 첫 연결·offline/reconnect·동시 수정·단일 item 오류에서 tree를 계속 조작할 수 있고, 오류 item만 attention에 남는지 실제 UI에서 확인한다.
  2. FS-UI-19~20: 느린 `/directory` 응답에서 cache가 먼저 보이는지, 대량 하위 폴더 prefetch가 확장·선택 입력을 막지 않는지 실제 Web에서 측정한다.
  3. FS-UI-21: folder revision conflict를 사용자 UI에서 재현해 삭제가 거부되고 remote subtree가 보존되는지 확인한다. SQL rollback regression은 통과했지만 사용자 UI acceptance는 남아 있다.
  4. FS-UI-22~24: realtime 차단 중 revision poll 복구, 겹치는 오류 알림 위의 실제 클릭, cursor 복구 중 앱 재시작을 검증한다. 정상 Web→local hash 수렴과 cursor 만료 후 full scan은 이미 확인했다.
  5. Desktop 재시작 시 마지막 per-item 상태가 먼저 복원되고 startup audit 후 실제 hash와 일치하는지 확인한다. 현재 UI 스펙에서 durable visual item-state 복원은 미완료로 기록돼 있다.
- **근거:** [Folder sync UI acceptance](../architecture/workspace/pkms/folder-sync/ui-acceptance.md), [Folder sync 결과·durability 계약](../architecture/workspace/pkms/folder-sync/README.md), [PKMS 상태](../architecture/workspace/pkms/README.md)

### Editor 탐색·Markdown 회귀와 제품 acceptance

- **목표 결과:** Workspace Editor에서 Explorer의 열림 상태와 스크롤 위치가 선택·파일 열기·새로고침·접기·pane 크기 변경 뒤에도 일관된다. Markdown 제목과 본문은 같은 문서 폭에 정렬되고, 렌더링 또는 직접 편집을 지원하지 않는 문법은 원문을 잃지 않는다.
- **미해결 보고:** `a6b373a`를 `/Applications/Workspace.app`에 `promote:stable`로 설치하고 실제 PKMS 데스크톱에서 `guitaringo.md`를 열어 Mermaid 그래프 라벨 대비와 표 안의 `<br>` 줄바꿈을 확인했다. 파일을 `now.md`로 전환하고 돌아온 뒤 TreeView의 보이는 항목 위치도 유지됐다. Terminal 포커스에서 `Cmd+\\`, `Cmd+P`, `Cmd+Shift+F`가 workspace UI를 열지 않는 동작을 stable 앱에서 검증했다. Explorer의 폭 변경·접기/펼치기, 표 셀 caret/스크롤, 검색 이동, 실제 dark/light acceptance, 웹 PKMS 배포 화면은 남아 있다. 기존 CodeMirror DOM·TreeView 통합 테스트와 renderer fixture 테스트는 통과했다.
- **수락:** [Editor 완성도 목표 스펙](../architecture/editor/markdown/product-completeness.md)의 EXP·DOC·TBL·TEX·DIA·HTML·KEY 시나리오를 실제 Workspace 화면과 저장 파일 round-trip으로 확인한다. 현재 설치판에서 DIA의 Mermaid 라벨 가독성, TBL의 `<br>` 줄바꿈, 파일 간 TreeView 위치 유지는 확인했다. 나머지 수락은 검색 결과가 해당 파일·줄을 여는지, 수정하지 않은 문서의 선택·스크롤이 전환 뒤 유지되는지, 표 편집 caret과 편집 결과가 저장 파일에 round-trip되는지까지 실제 앱에서 확인한다. dark/light와 web PKMS는 각 배포 경로에서 확인한다. 재현된 실패는 입력 fixture, 기대 결과, 실행 증거를 owner 문서에 연결한다.
- **경계:** 이 항목은 모든 Markdown 기능을 한 번에 구현한다는 뜻이 아니다. 우선 Explorer 복원과 재현 가능한 시각/렌더링 실패를 닫고, 표·수식·HTML 등은 각 수락 ID 단위로 진행한다.
- **근거:** [TreeView 목표](../architecture/editor/treeview/README.md), [Markdown 구현 현황](../architecture/editor/markdown/README.md), [탐색 검토](./editor-navigation-review.md)

### PKMS 종단 간 동기화 acceptance

- **현재 상태:** 지원 client 조합을 나누지 않는 23개 결과 checklist를 만들었다. 이번 실행에서 Desktop sync policy/move 12개 unit, Web/Server/Desktop typecheck와 build, iOS arm64 Simulator build, production DB rollback SQL 4개를 통과했다. 이전 runtime evidence에는 Web↔Desktop hash 수렴, 5,733개 local item, 12,472개 Cloud↔GitHub tree parity와 cursor 복구가 기록돼 있다.
- **현재 운영 blocker:** 2026-11-15 live check에서 `pkms-cloud` `/api/health`가 Cloudflare HTTP 429/error 1027을 반환했다. stable Desktop durable state에는 5,732 synced, 10 pending이 남아 있다(변경 file 1, baseline 없는 local item 8, directory 1; create/update/delete operation queue 0). 로컬 변경은 건드리지 않았고 이번 검증에서 sync/write 재시도를 발생시키지 않았다. Worker가 정상 응답한 뒤 10개 pending의 Cloud 수렴을 가장 먼저 재검증한다.
- **목표 결과:** 어떤 client에서 생성·수정·이동·삭제해도 PKMS cloud와 연결된 client가 같은 identity/bytes로 수렴한다. 장애·재시작·충돌에서 자료가 보존되고 sync 상태가 실제 결과와 맞는다.
- **남은 수락:** checklist의 미검증 경계(세 client 교대 편집, ACK 유실 뒤 재시작, offline/auth/429, partial scan/watch drop, root 전환 E2E, binary size 경계, conflict 순서, 재시작 중 item-state UI, 성능 측정)를 격리 workspace 및 temporary local root에서 실행한다. 통과/실패 근거를 각 ID에 추가하기 전까지 전체 동기화 완료로 표시하지 않는다.
- **근거:** [PKMS 종단 간 sync checklist](../architecture/pkms/acceptance-checklist.md), [Folder sync 계약](../architecture/workspace/pkms/folder-sync/README.md), [삭제 계약](../architecture/workspace/pkms/folder-sync/deletion.md), [기능 상태](./feature-status.md)

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

- 서버 로그 홈에서 확인하기
- Github Action Failure 해결
- PKMS editor web과 desktop의 treeview 정렬 순서가 다름.
- pkms editor conflict난 파일들만 따로 검수할 수 있는 기능 추가. - git merge conflict처럼 선택하거나 전체 삭제, 전체 선택 뭐 이런 기능 알지.
- (긴급) 지금 나 혼자 사용하고 있는데 Cloud Flare가 터짐. 429로 사이트가 뻗음. 도대체 몇시간만에 Total requests 128.53k 이게 어떻게 나오는거야. 모든 로그 확인하고 무한 리퀘스트 등 버그 있는지 확인.
- docs 폴더/파일 이름 한국어로 바꿔. 최상단 '#'을 없애고 그걸 파일 이름으로 바꿔.
- Cloud Worker 일일 사용량 초과하는 경우가 많다. 참고: ~/Desktop/Screenshot 2026-11-14 at 11.08.20 PM.png 흠 pkms-web/server를 vercel full stack으로 옮겨야하나... 아니면 AWS 같은 서비스를 사용해야하나.
