# Desktop Home 화면 계약

App scope의 J-08이다. [DashboardView](../../src/renderer/src/dashboard/DashboardView.tsx)는 SystemInformationWidget와 ServiceStatusWidget를 조합한다. PKMS 문서 UI와 Home 대시보드는 다른 화면·상태다.

## 기기 정보

[system widget](../../src/renderer/src/dashboard/widgets/SystemInformationWidget.tsx)은 mount/수동 refresh와 3초 interval에서 window.api.system.summary를 조회한다. 실패 시 summary=null, cleanup은 interval 제거다. Main은 누적 CPU time의 두 표본 차이로 cpuPercent를 계산하므로 첫 조회는 null일 수 있다. memory는 total−available, disk는 homedir volume의 statfs total/available, uptime은 OS 가동 시간이다.

로딩/측정 중·정보 없음과 값 0을 구분한다. 이것은 프로세스별 Activity Monitor나 모든 mount의 storage 분석이 아니다. Main의 previousCpu는 handler closure에 저장되어 여러 소비자가 조회하면 공통 표본에 영향을 준다.

## 서비스 상태와 연결

[service widget](../../src/renderer/src/dashboard/widgets/ServiceStatusWidget.tsx)은 Main PKMS desktop bridge로 서비스 상태를 가져오고 60초 recovery refresh를 예약한다. connect/disconnect·supplemental token 입력·수동 refresh와 상태 그래프가 UI 책임이다. 로그인 필요·OAuth 미설정·disconnected·provider metric 오류를 한 종류의 빈 데이터로 처리하지 않는다.

Main [pkms API](../../src/main/pkms/api.ts)는 PKMS 세션으로 Home audience token을 얻어 Home server 요청에 붙인다. renderer가 Home bearer나 저장 grant를 직접 읽지 않는다. callback grant 교환과 D1·provider API는 [Home Server](../../../workspace-server/docs/README.md)가 소유한다. device-flow 로그인 화면도 server polling pending/expiry를 처리해야 한다.

## 수락과 운영 경계

HOME-UI-01 첫 CPU 조회 null과 다음 표본을 구분. HOME-UI-02 unavailable disk/memory를 0 사용으로 오해하지 않음. HOME-UI-03 PKMS 로그인 대기와 provider 연결 대기 구분. HOME-UI-04 provider 오류 하나가 local system widget을 막지 않음. HOME-UI-05 숨김/해제 때 구독과 timer 수명 확인.

provider secrets/callback 등록·reconnect는 운영 작업이다. 기본 summary는 source 구현됐지만 프로세스별 monitor·상세 storage는 별도 요구다. 실제 OAuth/metric acceptance와 UI race의 자동 fixture는 후속 검증이다.
