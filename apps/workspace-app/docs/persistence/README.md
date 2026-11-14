# Desktop 영속 상태와 복구 inventory

이 문서는 Main 파일·renderer storage·외부 프로세스의 저장 책임을 구분한다. 모든 저장을 transaction·암호화·자동 복구로 일반화하지 않는다. 공통 UI cache는 [Editor package](../../../../packages/editor/docs/code/README.md)가 owner다.

## 저장 namespace

[persistence.ts](../../src/main/persistence.ts)의 appSupportDir는 macOS에서 `~/Library/Application Support/workspace-app[-dev]`, 다른 OS는 `app.getPath('appData')/workspace-app[-dev]`다. 반면 일부 기능은 Electron `userData`를 직접 쓴다. 두 경로를 같은 상수로 간주하지 않는다. dev/packaged의 분리 여부도 실제 startup 설정을 함께 확인한다.

## Dev와 packaged profile 정책

Dev(`workspace-app-dev`)와 packaged(`workspace-app`)는 workspace/layout snapshot, Electron `userData`, IndexedDB·Chromium storage, PKMS sync queue와 cursor를 분리한다. 이 경계는 개발 UI가 실사용 workspace state를 덮거나 두 앱이 같은 sync cursor를 갱신하지 않게 한다. PKMS folder sync는 동일한 절대 경로에 process-wide lock을 사용하므로 같은 편집 폴더를 두 앱이 동시에 sync owner로 열 수 없다.

PKMS Editor의 Finder Reveal은 실제 로컬 파일 경로가 필요하지만 sync state 공유가 필요하지 않다. Dev profile에 로컬 폴더 설정이 없으면 Main process가 packaged profile의 `pkms-sync-bridge.json`에서 해당 workspace의 `folderPath`만 읽어 경로를 찾을 수 있다. 파일·폴더 존재 여부와 symlink·상위 경로를 검증하고 Finder reveal/open만 수행한다. Queue, baseline, cursor, sync worker는 가져오거나 시작하지 않는다.

설계 기준: app profile은 분리하고, 환경 간 동일성이 필요한 데이터는 소유권·쓰기 경계를 보존하는 명시적 인터페이스로 공유한다. PKMS folder root의 동시 writer는 허용하지 않는다.

| 데이터 | 위치/owner | writer·손상/실패·복구 |
|---|---|---|
| app config·default root·usageMeters | appSupportDir/config.electron.json; Main persistence | direct writeFileSync. load 오류는 {}. save는 오류를 호출자에 전달. usage 변경은 기존 config를 merge |
| Workspace 탭·root·layout | appSupportDir/workspace.electron.json; Main Workspace | direct write, save 실패는 best-effort 무시. load parse 실패 null→새 workspace. layout 내용은 salvage |
| terminal serialized buffers | appSupportDir/terminal-sessions.electron.json | 45초 autosave와 quit capture merge. 손상/없음은 빈 buffers. byte limit·cold restore는 shared helper |
| PTY host access token/세션 | userData/pty-host-token + userData hash 기반 local socket/pipe | 생성 token은 mode 0600, host가 process·raw replay 소유. app JSON backup과 별개 |
| PKMS native session | appSupportDir/pkms-session.safe; Main safeStorage | 암호화 가능할 때 disk, 아니면 volatile memory만. decrypt/load 오류 null. logout은 메모리 clear와 파일 제거 |
| PKMS folder queue/baseline/cursor | userData/pkms-sync-bridge.json | temp 파일 mode 0600 후 rename. folder lock은 별도 tmp lock. sync 알고리즘은 PKMS bridge 문서 |
| ebook 읽기 상태 | appSupportDir/ebook-state.json | book location key로 merge, updatedAt. temp→rename, 실패 fallback에서 대상 제거 후 rename. 손상은 {} |
| model import cache | workspaceRoot/.workspace/model3d-cache | importer source metadata와 manifest/변환물. 앱 userData에만 있는 자료가 아님 |
| runtime logs | log sink의 앱별 logs directory | 회전·gzip·보관 정책은 logging guide. cache 정리와 동일 retention으로 처리하지 않음 |
| browser cookies/storage | persist:browser Electron partition | session owner는 Chromium. renderer 방문 history JSON과 별개 |
| browser 방문 기록 | localStorage workspace.browserHistory | HTTP(s)만, 최대 500, 저장 실패 시 best-effort memory |
| editor item identity | localStorage workspace:editor-item-ids:<tabId> | path→stable item ID. rename/move remap, storage 불가 시 memory |
| editor view 상태 | localStorage editor:view-state:<encoded identity> + memory cache | clean일 때만 durable cache, 용량 제한·legacy key migration. dirty close는 memory discard |
| explorer 확장/scroll/root | workspace.explorerExpanded/Scroll/Root.<stateKey> | stateKey는 workspace+pane. root 불일치면 초기 상태. 일부 read 경로의 storage 예외 처리 범위는 helper별로 다름 |
| explorer sidebar | pane별 open/width/mode storage | explorerSidebarChrome와 host hook 소유 |
| theme·autosave | renderer localStorage | theme preference와 OS resolved theme, autosave 선택은 separate key. 적용/구독 해제는 각 모듈 |

JSON 이름·storage prefix는 schema version을 대신하지 않는다. 각 writer의 실제 형태와 migration 유무를 읽어야 한다. config/workspace/terminal 파일은 temp+rename 방식이 아니므로 power loss에서도 항상 atomic하다고 설명하지 않는다.

## 복구·삭제 경계

- workspace snapshot은 정보가 남아 있는 layout을 salvage하고 default terminal을 복구한다. 임의 손상 데이터를 완전히 복원하지는 않는다.
- dirty text cache는 provider durable 저장소가 아니다. 강제 종료·storage disable에서도 모든 입력을 보존하는 crash journal로 사용하지 않는다.
- native session 암호화 실패는 평문 fallback을 만들지 않는다. logout은 provider cache/로컬 workspace 파일 전체 삭제를 뜻하지 않는다.
- model cache는 재생성 가능한 파생물이며 사용자 원본 문서·attachment·terminal log와 구분한다. 이 문서화 작업에서 실제 저장물을 삭제하지 않는다.
- PKMS durable intent와 cloud acknowledgement 이전 local/remote 삭제 의미는 [삭제 sync 계약](../../../../docs/architecture/pkms/local-deletion-sync.md)을 따른다.

## 근거와 검증

[persistence](../../src/main/persistence.ts), [PKMS session](../../src/main/pkms/session.ts), [sync bridge](../../src/main/pkms/syncBridge.ts), [ebookState](../../src/main/ebookState.ts), [model cache](../../src/main/model3d/cacheStore.ts), [explorer state](../../src/renderer/src/explorer/explorerState.ts), [usage config](../../src/main/usageMeterConfig.ts)가 writer다.

DATA-01 dev와 packaged의 설정 위치와 격리 경계를 확인한다. DATA-02 JSON parse 실패가 새/default 상태로 전환되는 범위를 확인한다. DATA-03 ebook merge가 기존 필드를 보존한다. DATA-04 dirty view cache가 provider 저장을 대체하지 않는다. DATA-05 safeStorage 불가 시 session을 disk에 평문으로 남기지 않는다. DATA-06 PKMS queue 저장과 remote mutation 순서를 확인한다. DATA-07 dev Finder Reveal은 packaged 설정에서 folderPath만 읽고 sync worker/state를 공유하지 않는다.

ebookState·terminal-session-buffers·terminal-cold-restore·explorerState·model cache 테스트가 일부 계약을 검증한다. storage-full·power-loss·OS별 credential 복구 전체는 별도 acceptance 대상이다.
