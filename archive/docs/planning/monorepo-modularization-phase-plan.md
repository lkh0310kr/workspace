# Monorepo 모듈화 단계 계획

## 목표와 종료 조건

UI 조립, 기능 상태, IPC adapter, service route, wire 계약을 분리해 PKMS 통합부와 Workspace 앱 진입점을 쉽게 변경할 수 있도록 합니다. 아래 범위에 든 모든 진입점이 조립 계층이 되고 기능 동작이 이름 있는 모듈에 들어가면 종료합니다. 저장소의 모든 대형 파일을 다시 쓰는 작업으로 범위를 넓히지 않습니다.

5개 단계가 모두 종료 기준을 만족하면 범위가 완료됩니다. 새 제품 기능이나 무관한 정리는 범위를 늘리지 않습니다.

## 범위

### 범위에 포함

- PKMS shared client: `packages/pkms-client/src/PkmsClientApp.tsx`와 account, repository, file browser, editor, sync 모듈.
- Workspace PKMS 통합 및 desktop shell 경계: `apps/workspace/src/main/index.ts`, `apps/workspace/src/main/ipc/`, `apps/workspace/src/preload/index.ts`.
- PKMS Cloudflare service: `apps/web/workers/app.ts`, `apps/web/workers/SupabaseVault.ts` 및 관련 auth, MCP, persistence, scheduled-sync 모듈.
- iOS PKMS 조정: `apps/ios/PKMSModel.swift`, `apps/ios/PKMSProtocolModels.swift`, native FFI 사용.
- 공유 PKMS 계약 및 Rust core 경계: `packages/pkms-protocol/` 및 `packages/pkms-core/`.
- 이 경계에 관한 아키텍처 문서.

### 범위에서 제외

- 모든 Workspace renderer pane을 재구성하거나 browser, terminal 내부, CAD, World Engine, hardware simulation 같은 무관한 시스템을 변경하는 작업.
- `apps/ios/legacy/v1/` 또는 vendored dependency를 다시 작성하는 작업.
- UI redesign, 새 제품 동작, API 또는 Realtime wire 변경, database migration, backend 교체, 배포 변경, Rust core의 networking 또는 UI 책임 확장.
- 줄 수 목표만 채우기 위한 기계적 파일 분리.

## 단계 계획

| 단계 | 작업 | 종료 기준 | 상태 |
|---|---|---|---|
| 0. 경계 | 앱/패키지 소유권과 의존성 방향을 기록합니다. | 아키텍처 지도와 명시적인 범위 포함/제외 목록을 저장소에 반영합니다. | 완료 |
| 1. 공유 PKMS client | account/session, file browser, editor/document, sync 기능을 분리합니다. Web과 Desktop은 같은 공개 client 진입점을 사용합니다. | `PkmsClientApp`이 기능 hook과 view를 조합합니다. 파일 탐색, 변경, editor lifecycle, offline cache, realtime message, sync 피드백은 이름 있는 모듈에 둡니다. Web/Desktop typecheck와 Web build를 통과합니다. | 완료 |
| 2. Workspace shell | Main IPC handler를 capability registrar로 옮기고 preload API 정의를 namespace별로 분리하되 작은 조립 진입점을 유지합니다. | `main/index.ts`가 lifecycle과 조립을 담당합니다. IPC capability는 이름 있는 모듈에 등록하고 preload는 동일한 namespace와 channel 이름을 노출합니다. Workspace typecheck를 통과합니다. | 완료 |
| 3. Cloud service | Worker 요청 dispatch를 auth, workspace API, MCP, scheduled flush 동작에서 분리합니다. 공통 helper를 사용하는 vault persistence와 GitHub flush 의미는 기존 service 경계에 둡니다. | `app.ts`가 route module을 dispatch하고 조립합니다. service module이 auth, workspace route, MCP, persistence, scheduled flush를 담당합니다. Status code, auth scope, Supabase 호출, GitHub flush 의미, scheduled trigger를 유지합니다. Web typecheck/build를 통과합니다. | 완료 |
| 4. iOS client | `PKMSModel` 조정을 API/session, workspace/file 작업, document/Realtime 모듈로 분리합니다. SwiftUI state 이름과 Rust FFI 계약을 유지합니다. | `PKMSModel`이 추출한 transport와 feature extension을 조정합니다. simulator build를 통과합니다. | 완료 |
| 5. 계약 마무리 | OpenAPI와 Realtime JSON Schema를 계약의 기준으로 삼고 TypeScript와 Swift wire model을 기계적으로 검증합니다. 문서를 정리하고 범위에 든 모든 앱을 확인합니다. | OpenAPI component schema 13개와 공유 Realtime envelope의 field/discriminator를 TypeScript/iOS model과 대조합니다. Workspace typecheck, Web typecheck/build, iOS simulator build를 통과합니다. | 완료 |

## 완료한 작업

- `packages/pkms-client/src/domain/`에는 file tree, path, filter, encoding, Yjs text helper가 있고 `client/`에는 API와 revisioned operation transport가 있습니다.
- `components/FileTreeList.tsx`는 tree interaction을 렌더링하고 위임합니다. `features/files/useFileTreeSelection.ts`는 focus와 selection state를 소유합니다.
- `features/files/useWorkspaceDirectory.ts`는 폴더 로딩, directory 복원, directory tree state를 소유합니다.
- `apps/workspace/src/main/ipc/`에는 terminal 및 workspace/filesystem/search registrar가 있습니다.
- system, content, agent status, terminal quit buffer에 대한 Workspace Main capability도 이름 있는 IPC module에 등록했습니다. preload 정의는 system, browser, terminal, content API 파일로 묶었습니다.
- `packages/pkms-protocol/src/types.ts`를 Worker와 React client가 공유합니다. Realtime presence data가 이 계약에 맞는지 확인합니다.
- `packages/pkms-client/src/features/`는 account session, file 생성/변경, document lifecycle, realtime message 처리, directory state, tree selection, document sync를 소유합니다.
- Cloudflare auth와 workspace route를 Worker request dispatcher에서 분리했습니다. MCP와 scheduled vault flush는 이름 있는 service 경계로 유지합니다.
- iOS API transport, workspace 작업, Realtime session 조정을 SwiftUI-facing model에서 분리했습니다.
- `apps/ios/PKMSProtocolModels.swift`에는 iOS HTTP 및 Realtime DTO가 있습니다. `packages/pkms-protocol/scripts/check-wire-models.mjs`는 계약 field와 required field가 일치하는지 확인합니다.

## 호환성 규칙

- 모듈 이동 중 기존 HTTP 경로·메서드·요청/응답 형태·Realtime 메시지·IPC 채널·데이터베이스 스키마·Worker binding·FFI signature를 그대로 보존합니다.
- 비밀 값과 권한 작업은 현재 소유 runtime(Electron Main, Cloudflare Worker, iOS secure storage)에 둡니다.
- 의존성은 앱에서 패키지 방향으로 둡니다. 패키지에서 앱 코드를 import하지 않습니다.
- 기능 또는 단계가 끝날 때마다 변경 범위를 좁힌 커밋을 하나 만듭니다. 무관한 작업 트리 변경은 보존합니다.

## 검증

해당 단계 경계에서 다음 build/type 검사를 실행합니다.

```bash
npm run web:typecheck
npm run web:build
npm run check:app
npm run check:wire-models --workspace @pkms/protocol
xcodebuild -project apps/ios/PKMS.xcodeproj -scheme PKMS -destination 'generic/platform=iOS Simulator' ARCHS=arm64 ONLY_ACTIVE_ARCH=YES build
```

`packages/pkms-core/`가 바뀐 경우에만 Rust 검사를 실행합니다. 이 단계 계획에서는 테스트를 추가하거나 실행하지 않습니다.

## 완료

5개 단계가 모두 종료 기준을 만족합니다. 배포·데이터베이스·API·Realtime·Rust core 동작은 바꾸지 않았습니다. 기존 `docs/planning/backlog.md` 변경은 보존했습니다.
