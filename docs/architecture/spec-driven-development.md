# 코드에서 추출한 스펙의 운영 규칙

이 문서군은 현재 코드를 역으로 분석한 재구현 기준이다. 모듈 스펙은 코드 소유 모듈에 두고 최상단 architecture는 링크와 공통 규칙을 관리한다. 기준일은 2026-11-11이며 파일별 소스 digest는 [스펙 인덱스](./spec-index.json)에 기록한다. 인덱스는 14개 모듈, 74개 등록 문서, 209개 소스 digest를 추적한다. 이 수치는 문서 등록 범위이지 의미 검토나 재생성 검증의 완료 수가 아니다.

## 기본 원칙: 상태와 결과부터 정의

스펙은 구현 방법을 먼저 지시하는 문서가 아니다. 요구된 **시작 조건 → 행위 → 목표 상태 → 관찰 가능한 결과**를 정의하고, 실패·취소·재시작·복구 후에도 보장할 결과를 수락 기준으로 둔다. 상위 제품 스펙은 사용자 결과, app 스펙은 앱 경계에서의 결과, package 스펙은 소비자에게 보장하는 결과를 소유한다.

세부 구현 계약은 선택지가 많은 데다 구현 선택에 따라 결과가 달라지는 경우에만 추가한다. wire protocol의 field/version 호환성, 인증·권한·만료, CRDT 동시성/충돌, durable sync/delete처럼 결과·보안·데이터 안전성을 결정하는 영역이 그 예다. 반면 timer 간격이나 내부 함수 호출 순서는 제품 결과를 규정하는 데 꼭 필요하지 않으면 현재 구현의 참고 근거로만 남기고 목표 스펙의 필수 방법으로 만들지 않는다. 현재 구현 관찰과 목표 결과가 다르면 두 항목을 분리해 적는다. 이 원칙은 [문서 scope 규칙](../documentation-scopes.md)에 적용한다.

## 문서를 구현에 사용하는 방법

1. 영역 README와 의존하는 provider/상태 계약을 읽는다. 구현 파일을 제거한 clean checkout 또는 별도 브랜치에서 작업한다. 현 작업 트리에서 재생성 실험을 이유로 소스를 삭제하지 않는다.
2. 목표 상태·관찰 결과·실패/복구 acceptance를 먼저 구현한다. 구현 세부를 규정한 계약이 있다면 protocol·인증·동시성·내구성처럼 결과에 영향을 주는 범위에서 이를 함께 지킨다. 코드 링크는 현재 동작의 근거와 추적용이며, 구현 방법을 추가로 강제하는 지시가 아니다.
3. 순수 helper→adapter→surface→host→shell 통합 순서로 만든다. package exports와 앱 의존 방향을 유지한다. 라이브러리 자체의 내부 알고리즘은 package manifest/lockfile에 고정된 의존성을 사용한다.
4. 각 스펙의 ID가 있는 수락 시나리오를 검증한다. 기존 테스트가 있는 항목과 수동/추가 통합 검증이 필요한 항목을 구분한다.
5. 미명시 동작은 새 기능으로 간주하지 말고 관련 구현과 기존 테스트에서 확인해 스펙에 보충한다. 현재 제약을 수정하려면 별도 의도된 변경으로 명시한다.

‘재생성’은 공개 계약과 관찰 가능한 기능을 복원하는 뜻이다. 동일한 바이트의 소스, pixel 단위 동일 UI, 모든 native/runtime 동작의 자동 증명을 보장하지 않는다. CSS·포맷별 viewer 내부·native OS 통합까지 완전한 독립 재생성은 아래 커버리지 밖이다.

## 모듈별 커버리지

| 영역                                                 | 현재 문서                                                                      | 재생성 상세 범위/남은 범위                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Shared Editor                                        | [Editor 기능 문서](./editor/README.md)                   | 공개 API·provider·tree·Markdown·code·검색·asset 연결. 전체 decoration/CSS·시각 fixture는 잔여 |
| Desktop editor/provider                              | [workspace-app editor docs](./workspace/editor/providers.md) | identity·저장·충돌·파일 작업; 수동 host acceptance 일부 잔여                                  |
| PKMS client/editor                                   | [pkms-client docs](./pkms/client/README.md)                  | account·cache·document session·Realtime·platform bridge; 서버/배포 acceptance 별도            |
| Browser                                              | [workspace-app browser docs](./workspace/browser/README.md)  | lifecycle·navigation·focus·session·IPC·history·zoom; native focus/로그인 검증 잔여            |
| Desktop shell/layout/interaction/IPC/persistence     | [Desktop 앱 문서 색인](./workspace/README.md)                | 주요 소유자·전이·데이터 흐름 초안; 전체 action/route fixture·CI 검증 잔여                     |
| Desktop terminal                                     | [Terminal 문서](./workspace/terminal/README.md)              | daemon→renderer/replay/ACK·buffer 경로; IME/OS별 실기 수락 잔여                               |
| Desktop viewer/Home/agents/settings/usage/operations | [모듈별 문서 색인](./workspace/README.md)                    | 라우팅·상태·운영 책임 초안; 포맷별 완전 상세와 native/provider acceptance 잔여                |
| PKMS Web/server, Workspace server, iOS               | [앱 scope 색인](../../docs/README.md)                                          | app별 route·auth·session·ownership 초안; 배포 DB·OAuth·iOS 실기 acceptance 잔여               |
| PKMS protocol/core                                   | [package scope 색인](../../docs/README.md)                                     | DTO·Realtime·CRDT·UTF-16·FFI 경계; HTTP 전체 자동 계약 및 clean-room 재생성 잔여              |

현재 문서와 소스의 대응은 spec-index의 modules에 기록한다. 문서 범위가 늘면 이 표와 index를 함께 갱신한다. archive/models와 archive/scripts는 활성 제품 범위가 아니다.

## 수락 기준과 근거

각 시나리오 ID(예: TEXT-05)는 입력·전이·관찰 가능한 결과를 정의한다. 근거는 소스 링크와 기존 테스트이며 테스트가 없는 행도 요구 동작을 명시한다. 파일 존재와 digest는 추적 보조일 뿐 의미적 일치를 증명하지 않는다. 이 문서 작업에서는 **문서만으로 전체 제품을 별도 재생성하는 실험은 실행하지 않았다.**

기존 자동 검증은 저장소 root에서 다음과 같이 실행한다.

```bash
node scripts/check-architecture-specs.mjs
cd apps/workspace-app
npx vitest run src/renderer/src/components/TreeView.test.ts src/renderer/src/explorer/useTreeProjection.test.ts src/renderer/src/explorer/treeReload.test.ts src/renderer/src/markdownTitleRename.test.ts src/renderer/src/browserUrl.test.ts src/renderer/src/browserAddressBarSuggestions.test.ts src/renderer/src/browser src/renderer/src/layout/browserWebviewRegistry.test.ts src/renderer/src/layout/browserWebviewRegistry.park.test.ts src/main/browserSession.test.ts
```

위 명령은 직접 Vitest를 호출한다. 현재 npm test wrapper는 추가 인자를 전달하지 않고 전체 suite를 실행하기 때문이다.

코드 재생성/변경 시에는 저장소 root에서 추가로 `npm run check:app`와 `npm run pkms:web:typecheck`를 실행한다. 문서만 수정한 경우 코드 빌드 전체를 의미적 검증 대신 반복하지 않는다. 수동 확인은 Editor rename/dirty close/충돌, Markdown cursor preview, browser drag/remount/주소창/terminal focus를 포함한다.

## 변경과 drift 처리

스펙을 바꾼 기능 변경은 먼저 요구되는 전이/시나리오를 수정하고 코드와 검증을 함께 갱신한다. 코드부터 수정한 기존 동작은 관련 스펙을 같은 변경에서 보충한다. 의도된 미래 상태는 planning에 둔다.

`check-architecture-specs.mjs`는 등록 문서의 로컬 링크, 모듈 소스 파일 존재, source SHA-256를 검사한다. drift 발견 시 실제 코드와 문서를 대조한 뒤만 다음 명령으로 baseline을 갱신한다.

```bash
node scripts/check-architecture-specs.mjs --refresh
node scripts/check-architecture-specs.mjs
```

refresh는 소스를 생성하거나 스펙 본문을 고치지 않는다. baseline 갱신 자체를 문서 검토 완료나 기능 테스트 성공으로 해석하지 않는다. 새 source 파일도 검토 후 spec-index의 해당 모듈 sources에 추가한다. 스크립트는 아직 CI 필수 gate에 연결하지 않았다.

## 검증 기준과 실행 기록

2026-11-11 scope 확장 작업에서 Desktop layout·explorer·interaction·terminal·session buffer·ebook 관련 집중 검증은 9개 파일, 37개 테스트가 통과했다. 이번 문서 변경으로 clean-room 재생성, 전체 native 앱, OS focus/login 또는 실제 배포 acceptance를 실행하지 않았다. 재생성 상태는 아직 어떤 모듈에도 부여하지 않는다.

### 초기 editor/browser 추출 기록

2026-11-11 기준으로 등록된 4개 모듈, 문서 15개, 소스 digest 106개와 로컬 링크 검사가 통과했다. 검사 스크립트 자체도 임시 fixture에서 정상 baseline, source drift 실패, refresh 후 성공, 깨진 링크 실패를 확인했다.

위 직접 Vitest 명령은 15개 test file, 61개 test가 통과했다. 앞서 npm test wrapper로 실행된 전체 suite는 108개 file 통과/3개 file 실패, 623개 test 통과/6개 실패/2개 skip이었다. 실패는 relayAppShortcuts 2개, layoutActions.closeTab 1개, global.gc 미노출에 따른 terminal queue-retention 3개다. 이 문서 변경에서는 해당 제품 코드나 테스트 환경을 수정하지 않았다.

문서 검사와 기존 테스트 통과는 현재 코드의 일부 근거다. 문서로부터 clean-room 재생성, UI pixel 비교, 실제 OS focus·로그인·download 검증을 완료했다는 의미는 아니다.
