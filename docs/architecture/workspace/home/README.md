# Desktop Home 화면 계약

App scope의 J-08이다. [DashboardView](../../../../apps/workspace-app/src/renderer/src/dashboard/DashboardView.tsx)는 SystemInformationWidget와 ServiceStatusWidget를 조합한다. PKMS 문서 UI와 Home 대시보드는 다른 화면·상태다.

## 목표 상태와 사용자 결과

사용자는 한 화면에서 **기기의 기본 상태를 확인하고**, 선택한 Cloudflare·Supabase·Vercel 계정의 운영 지표를 확인하거나 연결할 수 있어야 한다. Home은 상세 프로세스 감시기나 범용 cloud console이 아니다.

- 측정 불가·연결 안 됨·권한 부족·오류·실제 0을 서로 구분해 사용자가 잘못된 상태 결론을 내리지 않는다.
- 서비스 연결 전에는 필요한 로그인/권한/설정 조치를 알 수 있고, 연결·해제 후에는 결과 상태를 다시 확인할 수 있다.
- 한 서비스의 실패가 다른 서비스나 로컬 기기 정보 확인을 막지 않는다.
- 수동 갱신 또는 자동 갱신 후에는 표시 데이터가 어느 시점 기준인지 드러난다.

알림/임계치, 과거 데이터 보존, 사용자 정의 위젯, 프로세스별 감시는 이 계약에 포함하지 않는다. 이를 제품 기능으로 추가하려면 별도 요구와 성공 기준을 먼저 정의한다.

## 현재 구현 근거

다음 세부사항은 코드에서 관찰한 현 구현이며, 목표 결과를 만족하는 유일한 구현 방법으로 요구하지 않는다.

### 기기 정보

[system widget](../../../../apps/workspace-app/src/renderer/src/dashboard/widgets/SystemInformationWidget.tsx)은 mount/수동 refresh와 3초 interval에서 window.api.system.summary를 조회한다. 실패 시 summary=null, cleanup은 interval 제거다. Main은 누적 CPU time의 두 표본 차이로 cpuPercent를 계산하므로 첫 조회는 null일 수 있다. memory는 total−available, disk는 homedir volume의 statfs total/available, uptime은 OS 가동 시간이다.

로딩/측정 중·정보 없음과 값 0을 구분한다. 이것은 프로세스별 Activity Monitor나 모든 mount의 storage 분석이 아니다. Main의 previousCpu는 handler closure에 저장되어 여러 소비자가 조회하면 공통 표본에 영향을 준다.

### 서비스 상태와 연결

[service widget](../../../../apps/workspace-app/src/renderer/src/dashboard/widgets/ServiceStatusWidget.tsx)은 Main PKMS desktop bridge로 서비스 상태를 가져오고 60초 recovery refresh를 예약한다. connect/disconnect·supplemental token 입력·수동 refresh와 상태 그래프가 UI 책임이다. 로그인 필요·OAuth 미설정·disconnected·provider metric 오류를 한 종류의 빈 데이터로 처리하지 않는다.

Main [pkms API](../../../../apps/workspace-app/src/main/pkms/api.ts)는 PKMS 세션으로 Home audience token을 얻어 Home server 요청에 붙인다. renderer가 Home bearer나 저장 grant를 직접 읽지 않는다. callback grant 교환과 D1·provider API는 [Home Server](../../workspace-server/README.md)가 소유한다. device-flow 로그인 화면도 server polling pending/expiry를 처리해야 한다.

## 수락과 운영 경계

HOME-UI-01 기기 측정이 아직 불가능할 때 사용자가 CPU를 0으로 오해하지 않고 측정 결과가 준비된 뒤 실제 값을 확인한다. HOME-UI-02 unavailable disk/memory를 0 사용으로 오해하지 않는다. HOME-UI-03 PKMS 로그인 대기와 provider 연결 대기를 구분하고 알맞은 다음 행동을 알린다. HOME-UI-04 provider 오류 하나가 local system widget이나 다른 provider 결과를 가리지 않는다. HOME-UI-05 Home을 벗어나거나 다시 열어도 이전 요청의 늦은 응답이 현재 상태를 덮지 않고, 화면을 사용하지 않을 때 갱신 요청이 계속 누적되지 않는다.

provider secrets/callback 등록·reconnect는 운영 작업이다. 기본 summary는 source 구현됐지만 프로세스별 monitor·상세 storage는 별도 요구다. 실제 OAuth/metric acceptance와 UI race의 자동 fixture는 후속 검증이다.
