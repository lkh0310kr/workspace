# Desktop 영속 상태와 복구 항목

Main 파일, Renderer storage, Chromium 저장과 외부 process의 저장 책임을 구분한다. 모든 저장을 transaction·암호화·자동 복구로 일반화하지 않는다. 공통 UI cache는 [Editor package](../../editor/code/README.md)가 소유한다.

## 저장 namespace

[persistence.ts](../../../../apps/desktop/src/main/persistence.ts)의 `appSupportDir`는 앱 설정·Workspace layout·terminal buffer 같은 app 상태를 보관한다. Electron `userData`, 로컬 파일 root, Renderer `localStorage`는 별도 저장 위치다. 경로를 같은 상수로 간주하지 않는다.

Dev profile과 packaged profile은 Workspace snapshot, Chromium storage와 userData를 분리한다. 이 경계는 개발 UI가 사용 중인 상태를 덮지 않게 한다. Google Drive 동기화 중인 폴더는 사용자 파일 경로이며 Desktop이 별도 queue나 cursor를 만들지 않는다.

| 데이터 | 위치/owner | writer·복구 |
| --- | --- | --- |
| app config·default root·usageMeters | `appSupportDir/config.electron.json`; Main persistence | load 오류는 빈 설정, save 오류는 호출자에 전달 |
| Workspace 탭·root·layout | `appSupportDir/workspace.electron.json`; Main Workspace | load parse 실패는 새 Workspace, layout salvage 적용 |
| terminal buffers | `appSupportDir/terminal-sessions.electron.json` | 주기적 저장 및 종료 전 capture merge |
| PTY host token/session | `userData/pty-host-token`과 socket/pipe | file mode 0600, process/replay는 host가 소유 |
| ebook 읽기 상태 | `appSupportDir/ebook-state.json` | book location key로 merge, temp 파일 후 rename |
| model import cache | `<workspaceRoot>/.workspace/model3d-cache` | 재생성 가능한 import metadata와 변환물 |
| runtime logs | 앱별 logs directory | 회전·gzip·보관 정책은 logging guide |
| browser cookies/storage | `persist:browser` Chromium partition | Chromium session이 소유 |
| browser 방문 기록 | Renderer localStorage | HTTP(S)만 기록, 최대 500개 |
| Editor item identity | localStorage `workspace:editor-item-ids:<tabId>` | path→stable item ID; rename/move 때 remap |
| Editor view 상태 | localStorage `editor:view-state:<identity>`와 memory cache | clean 문서만 저장 cache로 유지 |
| Editor tree 확장·scroll·root | workspace/pane scoped localStorage keys | root 불일치 시 초기 상태 |
| theme·autosave | Renderer localStorage | preference와 실제 적용 수명은 각 module 소유 |

JSON 이름과 storage prefix는 schema version을 대신하지 않는다. Main persistence 파일은 temp+rename을 모두 사용하지 않으므로 power loss에서도 항상 atomic하다고 가정하지 않는다.

## 복구·삭제 경계

- Workspace snapshot은 남아 있는 유효한 layout state를 salvage하고 default terminal을 복구한다.
- Dirty text cache는 provider 저장소나 crash journal이 아니다.
- Model cache는 재생성 가능한 파생물이며 사용자 원본 파일과 다르다.
- Editor는 파일을 선택한 로컬 경로에 저장하며 OS sync tool의 충돌·동기화 상태를 소유하지 않는다.

## 근거와 검증

[persistence](../../../../apps/desktop/src/main/persistence.ts), [ebookState](../../../../apps/desktop/src/main/ebookState.ts), [model cache](../../../../apps/desktop/src/main/model3d/cacheStore.ts), [Editor tree state](../../../../packages/editor/src/tree/editorTreeState.ts), [usage config](../../../../apps/desktop/src/main/usageMeterConfig.ts)가 writer다.

복구 scenario는 profile 분리, JSON parse 실패, ebook merge, dirty view cache, Editor tree state, cache 재생성을 확인한다. Storage-full·power-loss·OS별 credential 복구 전체는 별도 acceptance다.
