# Archive

이 디렉터리는 현재 Workspace·PKMS 제품 범위에서 제외한 코드와 기록을 보관합니다. 여기에 있는 앱·서비스는 빌드되거나 Workspace UI에 노출되지 않습니다.

## 보관된 기능

| 기능 | 보관 위치 | 현재 앱에서 제거한 연결 |
|---|---|---|
| World Engine | [`world-engine/`](./world-engine/), [`workspace/src/main/worldEngine.ts`](./workspace/src/main/worldEngine.ts), [`schemas/`](./schemas/), [`docs/architecture/world-engine/`](./docs/architecture/world-engine/) | 앱 메뉴, TreeView 실행 동작, IPC/preload, 패키징, 예제 fixture와 Cargo workspace |
| Hardware Simulator | [`hardware-sim/`](./hardware-sim/), [`workspace/src/main/hardwareSim.ts`](./workspace/src/main/hardwareSim.ts), [`workspace/src/renderer/panes/`](./workspace/src/renderer/panes/) | 파일 열기 진입점, IPC/preload, Arduino sidecar, 패키징, fixture와 Cargo workspace |
| Godot/Web App 호스팅 | [`workspace/src/main/engineBundleProtocol.ts`](./workspace/src/main/engineBundleProtocol.ts), [`workspace/src/main/godotExport.ts`](./workspace/src/main/godotExport.ts), `workspace/test-fixtures/` | “Open as App” 및 Godot export 메뉴, 사용자 정의 프로토콜, 설치·빌드 스크립트 |
| CAD 모델 프로젝트·검증 자동화 | [`models/`](./models/), [`scripts/`](./scripts/) | 기계 모델 제작 프로젝트와 CAD 전용 자동화. 일반 모델 미리보기는 유지 |
| 엔진 embed·호스팅 실험 | [`world-engine-embed/`](./world-engine-embed/), [`docs/research/`](./docs/research/) | 이전 구현과 탐색 기록 |

## 현재 제품에 남은 범위

- Workspace 셸, 탭·pane, Terminal, Browser, Editor, 파일 탐색·검색과 Home 서비스 대시보드
- PKMS Web/Desktop/iOS와 Workspace용 PKMS pane
- 파일 확인을 위한 일반 3D/CAD 미리보기

Home의 이전 PKMS 결합 구현은 활성 제품 코드가 아닙니다. 복구된 화면과 독립 API는 `apps/workspace/src/renderer/src/dashboard/` 및 `apps/workspace-server/`에 있습니다.

보관 코드의 빌드·실행 절차는 현재 제품 문서에 포함하지 않습니다. 복구할 때는 앱 경로와 배포 경계를 다시 설계하고 명시적으로 제품 범위에 채택해야 합니다.
