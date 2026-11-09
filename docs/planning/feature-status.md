# 기능 상태

현재 유지하는 제품 범위만 기록합니다. `implemented`는 현재 앱에서 동작하는 구현을 뜻합니다. 보관된 기능과 실험은 목록에 넣지 않습니다.

| 기능 | 상태 | 범위 | 코드 근거 |
|---|---|---|---|
| Workspace 셸·탭·분할 pane | `implemented` | Electron 창, 탭과 pane 레이아웃 | `apps/workspace-app/src/renderer/src/App.tsx` |
| Terminal | `implemented` | PTY 세션을 사용하는 터미널 pane | `apps/workspace-app/src/main/pty.ts` |
| Browser | `implemented` | 웹 탐색 pane | `apps/workspace-app/src/renderer/src/panes/BrowserContent.tsx` |
| Editor·파일 탐색·검색 | `implemented` | 코드·Markdown 편집, 파일 트리와 검색 | `apps/workspace-app/src/renderer/src/panes/EditorContent.tsx` |
| 파일·미디어 뷰어 | `implemented` | 이미지, PDF, EPUB, 오디오·비디오와 모델 미리보기 | `apps/workspace-app/src/renderer/src/panes/FileViewerContent.tsx` |
| PKMS Web·Desktop·iOS | `implemented` | GitHub 기반 지식 관리, 협업과 플랫폼별 클라이언트 | `apps/pkms-web/`, `apps/pkms-server/`, `packages/pkms-client/`, `apps/pkms-ios/` |
| PKMS Desktop Folder Sync Bridge | `in_progress` | pane에서 로컬 Markdown 폴더 연결·제외·상태 확인 및 cloud 양방향 동기화 구현. 1초 미만 단일 파일 반영은 아직 미충족, 수동 end-to-end acceptance와 attachment 지원도 남음. 현재 동작과 충돌 규칙은 [PKMS Desktop folder sync](../architecture/09-pkms-folder-sync.md) 참조 | `apps/workspace-app/src/main/pkms/syncBridge.ts`, `apps/pkms-server/src/SupabaseVault.ts`, `packages/pkms-client/src/components/SyncBridgePanel.tsx` |
| Workspace Home 서비스 대시보드 | `in_progress` | Desktop UI 복구 및 독립 Worker 배포 완료. provider OAuth secret/callback 설정과 재연결이 남음 | `apps/workspace-app/src/renderer/src/dashboard/`, `apps/workspace-server/`, `apps/pkms-server/src/realtimeAuth.ts` |

PKMS Web/Server와 Workspace App/Server의 소스 디렉터리 경계 정리는 별도 후속 작업입니다. 목표 구조와 현재 분리 상태는 [제품별 앱 경계](../architecture/08-monorepo-module-boundaries.md)에 있습니다.
