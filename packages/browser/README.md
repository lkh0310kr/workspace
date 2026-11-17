# @workspace/browser

Browser pane UI와 overlay slot, pane kind 생성기, 주소 입력·탐색·기록 UI, viewport 상태, guest 복구·확대 정책, 탭 URL·label 정책과 pane chrome 스타일을 소유한다. `BrowserWebviewPort`는 기능이 사용하는 guest 표면만 설명한다. Desktop은 형식이 지정된 `BrowserPaneHost`로 guest lifecycle, webview 생성, 영속 guest registry 조회, 다운로드 상태·표시, InteractionCoordinator와 IPC 기능을 전달한다. Electron webview 변환은 Desktop adapter 경계에서 수행한다. BrowserContent가 패키지 소유 pane·overlay CSS를 불러온다.

세부 lifecycle과 IPC 계약은 [Browser 아키텍처 문서](../../docs/architecture/workspace/browser/README.md)를 참고한다.
