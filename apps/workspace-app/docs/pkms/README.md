# Desktop PKMS adapter와 folder sync

App scope다. UI·계정/문서 session은 [pkms-client](../../../../packages/pkms-client/docs/editor-sessions.md), 서버 mutation은 PKMS Server가 소유한다. Desktop은 token/HTTP proxy, asset fetch, 로컬 folder·watcher·durable queue·IPC·pane mount를 맡는다.

- [Folder sync 현재 구현·설계·수락 조건](./folder-sync.md)
- [로컬 file/folder 삭제·동시성 guard](./local-deletion-sync.md)
- [native token과 queue 저장 위치](../persistence/README.md)
- [제품 간 PKMS 통합 경계](../../../../docs/architecture/pkms/overview.md)

## 상태 구분

local directory inventory·pending delete intent·tree suppression은 source 구현됨, deployed migration과 macOS runtime acceptance는 확인 대기다. binary attachment sync와 durable visual item-state 복원도 별도 미완료다. folder protectSubtree는 현재 workspace revision equality에 기반한 보수적 guard여서 다른 subtree의 concurrent mutation도 거부할 수 있다. source에 있는 기능을 배포·실기 완료로 올리지 않는다.

## App 연결 근거

[pkms IPC](../../src/main/pkms/ipc.ts), [API proxy](../../src/main/pkms/api.ts), [session](../../src/main/pkms/session.ts), [syncBridge](../../src/main/pkms/syncBridge.ts), [PkmsPane](../../src/renderer/src/panes/pkms/PkmsPane.tsx)가 진입점이다. pane은 공용 client를 별도 React root·MemoryRouter·Shadow DOM에 mount하고 cleanup하며, renderer가 Main bearer token을 소유하지 않는다.
