# 제품 범위와 핵심 여정

Workspace는 로컬 terminal·browser·editor·viewer를 한 Desktop 작업 공간에서 쓰는 앱이다. PKMS는 GitHub 저장소에 연결한 문서·첨부 파일을 Web/Desktop/iOS에서 다루는 별도 서비스다. Workspace Home은 Desktop의 기기·외부 서비스 상태 화면과 그 provider API다. 제품은 일부 UI와 인증 경계를 공유하지만 저장·프로세스·운영 상태가 모두 같은 것은 아니다.

## 제품과 플랫폼

| 제품 | 사용자 작업 | 실행/배포 owner | 공유 코드와 경계 |
|---|---|---|---|
| Workspace Desktop | workspace/pane 구성, 로컬 shell·파일 편집·웹 탐색·파일 열기 | [workspace-app](../../apps/workspace-app/README.md) | Electron Main 권한. editor UI·PKMS client는 package 소비 |
| PKMS Web | 로그인, 저장소 선택, 문서·첨부 파일·협업 | [pkms-web](../../apps/pkms-web/README.md), [pkms-server](../../apps/pkms-server/README.md) | Web은 UI/SSR, Server는 auth/data API. 브라우저 cookie 요청 |
| PKMS Desktop pane | 같은 PKMS UI, device sign-in, 선택적 로컬 폴더 sync | [workspace-app](../../apps/workspace-app/README.md) | pkms-client 재사용, 자격 증명·filesystem·bridge는 Main |
| PKMS iOS | 네이티브 문서 탐색·편집·협업 | [pkms-ios](../../apps/pkms-ios/README.md) | Keychain session, Rust/Yrs native 문서 |
| Workspace Home | 기기 summary, Cloudflare/Supabase 등 연결 서비스 상태 | [workspace-app](../../apps/workspace-app/README.md), [workspace-server](../../apps/workspace-server/README.md) | PKMS가 발급한 audience 제한 token으로 Home 인증. Home provider grants는 별도 저장 |

현재 Desktop 릴리스 우선순위는 macOS Apple Silicon이다. Windows/WSL 코드는 존재하지만 코드 존재와 native 배포 검증을 동일시하지 않는다. 활성 플랫폼 정책은 [릴리스 기준](../architecture/desktop-release.md)을 따른다.

## 핵심 여정과 보존할 동작

| ID | 여정 | 성공·실패에서 보존할 계약 | owner 진입점 |
|---|---|---|---|
| J-01 | workspace/pane을 배치하고 다시 열기 | 탭·활성 선택·layout 복원, 손상 salvage, 닫기 취소, 정상 종료/crash 차이 | workspace-app |
| J-02 | 파일을 찾아 Markdown/code 수정·저장 | 안정 identity, undo·dirty·조건부 쓰기, 외부 충돌 보존 | editor + Desktop adapter |
| J-03 | shell/TUI 실행, 다른 pane 이동 | 순서·UTF-8·ACK·scroll·IME·focus, 재연결과 프로세스 수명 | workspace-app terminal |
| J-04 | browser 탐색과 pane 전환 | URL/history·guest focus·overlay·drag·download·재부착 | workspace-app browser |
| J-05 | 이미지/책/영상/모델 열기 | 포맷별 pipeline·로딩/실패·자원 cleanup·읽기 상태 | workspace-app viewers |
| J-06 | PKMS 로그인·저장소 선택·협업 편집 | 계정/권한·CRDT·cache·presence, 만료·offline·remote mirror | PKMS apps + pkms-client |
| J-07 | 연결 폴더에서 수정·이동·삭제 | durable intent·cursor·idempotency·충돌 복사·삭제 guard | Desktop bridge + PKMS server |
| J-08 | Home 연결·기기 상태 확인 | 기본 summary와 상세 monitor 구분, OAuth 설정 대기·만료·provider 오류 | Desktop Home + Home server |
| J-09 | agent 상태·사용량·설정 확인 | evidence freshness·실제 adapter 지원·측정 실패·설정 적용 범위 | workspace-app |
| J-10 | 업데이트·장애 진단·복구 | native build/서명·업데이트 수명·로그 보존·검증 기록 | 각 앱 운영 문서 |

각 owner의 app/package 문서가 이 여정의 구체 상태 전이를 정의한다. 전역 여정 표에서 provider timer나 protocol payload를 다시 정의하지 않는다.

여정 스펙의 기본은 사용자가 시작하는 상태와 성공/실패 후 관찰할 결과다. 내부 구현 순서는 요구하지 않는다. 구현 선택에 따라 결과·보안·호환성·데이터 안전성이 달라지는 경계는 owner 스펙에서 필요한 만큼 구체화한다.

## 상태 읽기

기능별 구현/운영/acceptance는 [기능 상태](../planning/feature-status.md), 스펙 상세화와 검증의 남은 범위는 [SDD 진행 계획](../planning/spec-driven-development-roadmap.md)을 따른다. UI 구현, 서버 배포, secrets/migration 적용, 실제 다중 기기 acceptance는 서로 다른 증거다.

## 제품 범위 밖

`archive/`의 과거 모델·검증 스크립트, iOS legacy와 cancelled Android Data Node를 현재 제품 요구로 다시 활성화하지 않는다. 현재 CAD/3D **viewer 연결 기능**은 Desktop 소유이며 보관된 CAD 모델 제작 프로젝트와 구분한다. generic cloud backend, 모든 OS의 동시 출시, 새 데이터 노드 서비스는 이번 문서화 범위에 추가하지 않는다.
