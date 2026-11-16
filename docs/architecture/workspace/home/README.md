# Desktop Home 화면 계약

Home 화면은 현재 기기의 기본 시스템 정보를 보여준다. [HomeView](../../../../packages/home/src/HomeView.tsx)는 `SystemInformationWidget`을 표시한다.

## 사용자 결과

- 사용자는 CPU, 메모리, 저장 공간과 가동 시간 요약을 확인한다.
- 측정 중 또는 정보를 얻을 수 없는 상태는 실제 값 0과 구분한다.
- 수동·자동 갱신 뒤에는 최신 결과만 적용하고 화면을 벗어난 뒤 늦게 온 결과는 무시한다.

프로세스별 감시, 과거 데이터 보존, 사용자 정의 위젯은 이 계약에 포함하지 않는다.

## 현재 구현 근거

[SystemInformationWidget](../../../../packages/home/src/widgets/SystemInformationWidget.tsx)은 주입된 `readSystemSummary` host 함수를 mount·수동 갱신·3초 interval에서 호출한다. Desktop shell이 이를 `window.api.system.summary`에 연결한다. 화면 스타일은 feature의 `home.module.css`에 두고 공용 design token과 scroll surface만 host와 공유한다. Home view 추출은 기존 navigation과 Workspace bootstrap gate를 변경하지 않는다. 실패 시 요약을 비우고 interval은 unmount 때 정리한다. Main은 CPU 표본 차이로 사용률을 계산하므로 첫 값은 측정 중일 수 있다. 메모리는 total−available, 저장 공간은 홈 디렉터리 volume의 `statfs`, 가동 시간은 OS uptime에서 계산한다.

`packages/home`이 소유한 `useLatestRefresh`는 중복 갱신을 직렬화하고 unmount 이후의 응답 적용을 막는다. 이미 Main IPC로 전달한 요청 자체는 취소하지 않는다.

Home route 활성 상태와 구독은 `packages/home/src/homeViewActivity.ts`가 소유한다. Desktop navigation은 Home 진입·이탈 시 상태를 갱신하고, Workspace interaction scope는 공개 API를 구독해 기존 shortcut scope 결과를 유지한다. 이 상태는 Home route 표시 여부만 나타내며 Browser·Terminal pane 수명에는 관여하지 않는다.
