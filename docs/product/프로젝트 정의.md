# 제품 범위와 핵심 여정

Workspace는 로컬 terminal·browser·editor·viewer를 한 Desktop 작업 공간에서 쓰는 앱이다. PKMS는 GitHub 저장소에 연결한 문서·첨부 파일을 Web/Desktop/iOS에서 다루는 별도 서비스다. Workspace Home은 Desktop의 기기·외부 서비스 상태 화면과 그 provider API다. 제품은 일부 UI와 인증 경계를 공유하지만 저장·프로세스·운영 상태가 모두 같은 것은 아니다.

## 제품과 플랫폼

| 제품              | 사용자 작업                                                 | 실행/배포 owner                                                                                                | 공유 코드와 경계                                                                  |
| ----------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Workspace Desktop | workspace/pane 구성, 로컬 shell·파일 편집·웹 탐색·파일 열기 | [workspace-app](../../apps/workspace-app/README.md)                                                            | Electron Main 권한. editor UI·PKMS client는 package 소비                          |
| PKMS Web          | 로그인, 저장소 선택, 문서·첨부 파일·협업                    | [pkms-web](../../apps/pkms-web/README.md), [pkms-server](../../apps/pkms-server/README.md)                     | Web은 UI/SSR, Server는 auth/data API. 브라우저 cookie 요청                        |
| PKMS Desktop pane | 같은 PKMS UI, device sign-in, 선택적 로컬 폴더 sync         | [workspace-app](../../apps/workspace-app/README.md)                                                            | pkms-client 재사용, 자격 증명·filesystem·bridge는 Main                            |
| PKMS iOS          | 네이티브 문서 탐색·편집·협업                                | [pkms-ios](../../apps/pkms-ios/README.md)                                                                      | Keychain session, Rust/Yrs native 문서                                            |
| Workspace Home    | 기기 summary, Cloudflare/Supabase 등 연결 서비스 상태       | [workspace-app](../../apps/workspace-app/README.md), [workspace-server](../../apps/workspace-server/README.md) | PKMS가 발급한 audience 제한 token으로 Home 인증. Home provider grants는 별도 저장 |

현재 Desktop 릴리스 우선순위는 macOS Apple Silicon이다. Windows/WSL 코드는 존재하지만 코드 존재와 native 배포 검증을 동일시하지 않는다. 활성 플랫폼 정책은 [릴리스 기준](../architecture/desktop-release.md)을 따른다.

## 핵심 여정과 보존할 동작

| ID   | 여정                                | 성공·실패 후 사용자가 확인할 결과                                                                                                                                               | owner 진입점                 |
| ---- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| J-01 | workspace/pane을 배치하고 다시 열기 | 다시 열었을 때 작업 구성이 복원된다. 손상이나 취소된 닫기는 가능한 작업과 편집 내용을 잃지 않고, 복원할 수 없는 상태는 구분해 알린다.                                           | workspace-app                |
| J-02 | 파일을 찾아 Markdown/code 수정·저장 | 사용자가 편집한 내용이 선택한 파일에 저장된다. 저장 충돌·실패·취소 시 어떤 내용이 남았는지 확인하고 안전하게 복구할 수 있다.                                                    | editor + Desktop adapter     |
| J-03 | shell/TUI 실행, 다른 pane 이동      | pane을 바꿔도 명령 입력과 출력이 의도치 않게 끊기거나 뒤섞이지 않는다. 앱을 닫거나 연결이 끊겼을 때 복원 가능한 화면 내용과 재개할 수 없는 프로세스를 구분한다.                 | workspace-app terminal       |
| J-04 | browser 탐색과 pane 전환            | 현재 페이지와 사용자의 탐색 작업을 유지하면서 주소 이동, 뒤로/앞으로, 다운로드, 다른 pane 전환을 할 수 있다. 페이지가 종료되거나 복구 중일 때 상태와 가능한 다음 행동이 보인다. | workspace-app browser        |
| J-05 | 이미지/책/영상/모델 열기            | 지원되는 파일은 해당 형식에 맞게 확인할 수 있고 읽기 위치 등 지원 상태가 보존된다. 지원 불가·손상·취소·변환 실패는 빈 화면이나 성공으로 오인되지 않는다.                        | workspace-app viewers        |
| J-06 | PKMS 로그인·저장소 선택·협업 편집   | 권한 있는 사용자가 지원 클라이언트에서 같은 문서를 확인·편집할 수 있다. 오프라인·세션 만료·동시 수정 뒤에도 저장된 변경과 해결이 필요한 충돌을 구분한다.                        | PKMS apps + pkms-client      |
| J-07 | 연결 폴더에서 수정·이동·삭제        | 로컬과 원격의 변경이 일관되게 반영된다. 충돌이나 연결 중단 때 변경이 조용히 유실·삭제되지 않고, 재시도 후 해결 여부를 확인할 수 있다.                                           | Desktop bridge + PKMS server |
| J-08 | Home 연결·기기 상태 확인            | 기기와 연결 서비스의 현재 상태를 확인하고, 미연결·권한 부족·측정 실패·실제 0을 구분해 다음 조치를 알 수 있다.                                                                   | Desktop Home + Home server   |
| J-09 | agent 상태·사용량·설정 확인         | 표시된 상태와 사용량이 확인 가능한 근거·시점에 기반하며, 알 수 없음·오래된 정보·측정 실패를 정상/0으로 오해하지 않는다. 설정 변경 결과도 확인할 수 있다.                        | workspace-app                |
| J-10 | 업데이트·장애 진단·복구             | 사용자가 지원되는 앱 버전을 설치·실행하고, 업데이트나 실행 실패 시 현재 버전·실패 원인·복구 방법을 확인할 수 있다.                                                              | 각 앱 운영 문서              |

각 owner의 app/package 문서가 이 여정의 구체 상태 전이를 정의한다. 전역 여정 표에서 provider timer나 protocol payload를 다시 정의하지 않는다.

여정 스펙의 기본은 사용자가 시작하는 상태와 성공/실패 후 관찰할 결과다. 내부 구현 순서는 요구하지 않는다. 구현 선택에 따라 결과·보안·호환성·데이터 안전성이 달라지는 경계는 owner 스펙에서 필요한 만큼 구체화한다.

## 상태 읽기

기능별 구현/운영/acceptance는 [기능 상태](../planning/feature-status.md), 스펙 상세화와 검증의 남은 범위는 [SDD 진행 계획](../planning/spec-driven-development-roadmap.md)을 따른다. UI 구현, 서버 배포, secrets/migration 적용, 실제 다중 기기 acceptance는 서로 다른 증거다.

## 제품 범위 밖

`archive/`의 과거 모델·검증 스크립트, iOS legacy와 cancelled Android Data Node를 현재 제품 요구로 다시 활성화하지 않는다. 현재 CAD/3D **viewer 연결 기능**은 Desktop 소유이며 보관된 CAD 모델 제작 프로젝트와 구분한다. generic cloud backend, 모든 OS의 동시 출시, 새 데이터 노드 서비스는 이번 문서화 범위에 추가하지 않는다.
