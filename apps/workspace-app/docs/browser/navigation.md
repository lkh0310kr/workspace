# 탐색, session, IPC 스펙

## 주소 정규화

근거: [browserUrl.ts](../../src/renderer/src/browserUrl.ts). normalizeBrowserNavigationUrl(raw,searchFallback)는 string|null을 반환한다. 순서는 trim→blank→local dev→Unix absolute path→명시 URL→https prefix→선택적 검색 fallback이다.

| 입력 | 결과 |
|---|---|
| 공백 또는 about:blank | about:blank |
| localhost:3000, 127.0.0.1, 0.0.0.0, [::1]:8080 | http:// prefix 후 URL 정규화 |
| /Users/me/a b.txt | segment별 encode한 file:///Users/me/a%20b.txt |
| 명시 http/https/file URL | URL.toString() |
| javascript:, data:, 그 외 명시 scheme | null |
| example.com | https://example.com/ |
| 주소창 `react hooks` | https://www.google.com/search?q=react%20hooks |

공백 포함은 검색어로, 도메인 패턴은 URL로, `.` 또는 `:`가 있는 입력은 URL 시도로 분류한다. searchFallback=false는 https prefix가 파싱되면 단일 단어도 URL로 허용한다. 즉 초기/programmatic URL 검증과 주소창 검색 분기를 같게 만들지 않는다.

BrowserContent.navigate는 정규화 실패면 무시한다. guest 미준비면 pendingNavigationRef에 최신 URL을 보관하고 dom-ready에서 소비한다. 준비됐으면 action helper로 loadURL한다. 탐색 이벤트가 canonical URL을 주소창과 layout item에 반영한다.

## Guest 이벤트 전이

| 이벤트 | 상태/출력 |
|---|---|
| did-start-loading | loading=true |
| did-stop-loading | loading=false, history 동기화 |
| did-navigate / did-navigate-in-page | addressInput/currentUrl/item.url 갱신, history 동기화 |
| page-title-updated | item.title 갱신, getURL/title로 방문 기록 |
| page-favicon-updated | 첫 favicon이 있으면 item.favicon 갱신 |
| render-process-gone | rendererGone=true |
| dom-ready | ready=true, rendererGone=false, loadError 제거, webContentsId 획득, history 동기화, pending URL 처리, chipShown이면 focus 요청 |
| did-fail-load | `Could not load this page. Check the address and try again.` 표시 |

현재 did-fail-load handler는 error code별 예외 처리를 하지 않는다. abort 오류를 항상 숨긴다고 재구현하지 않는다.

## 방문 기록과 주소 제안

근거: [history](../../src/renderer/src/browserHistory.ts), [suggestions](../../src/renderer/src/browserAddressBarSuggestions.ts).

방문 기록은 module cache와 localStorage `workspace.browserHistory`를 사용한다. entry는 url/title/lastVisitedAt/visitCount이며 http(s)만 기록한다. 같은 URL은 title/시간/count를 갱신한다. 최대 500개를 넘으면 가장 오래된 것을 제거한다. storage 실패는 탐색을 막지 않는다.

제안 최대 8개, 입력 UTF-8 2048 bytes 초과는 []. 빈 입력/about:blank/data: 시작은 최근 방문순이다. 그 외 history score는 다음을 합산한다.

- www를 제거한 hostname prefix +220, hostname includes +90 중 하나.
- URL prefix 또는 https prefix +100, URL includes +40 중 하나.
- title includes +30. 앞 조건 중 아무것도 안 맞으면 제외.
- min(visitCount,50), max(0,24-ageHours) 추가.

hostname stem이 ASCII 영숫자/하이픈과 선택적 마지막 점으로 구성되고 길이>=3이며 강한 history prefix가 없으면 com/net/org/io 추측을 만든다. strong history→URL/TLD actions→Google 검색 action→other history 순으로 URL dedupe하고 8개로 자른다. 주소창 제안 popover의 overlay 등록은 coordinator portal 정책을 따른다.

## Session과 권한

근거: [browserSession](../../src/main/browserSession.ts), [UA](../../src/main/browserSessionUA.ts), [WebAuthn](../../src/main/browserWebauthn.ts).

main startup에서 guest 탐색 전 `session.fromPartition('persist:browser')`를 설정한다. 탭들은 cookie/session을 공유한다. UA와 Google 인증 호환, WebAuthn handler를 해당 session에 설치한다. 자동 허용 목록은 fullscreen, clipboard-read, clipboard-sanitized-write, notifications, persistent-storage, pointerLock이다. request handler는 이 목록을 사용하고 check handler는 WebAuthn 예외도 확인한다. 사이트별 permission prompt UI는 없다.

## IPC 계약

근거: [preload/browserApi.ts](../../src/preload/browserApi.ts), [main/browserNav.ts](../../src/main/browserNav.ts), [main/index.ts](../../src/main/index.ts).

| 채널 | payload / 반환 |
|---|---|
| browser:open-new-tab | event `{hostWebContentsId,url}`; 해당 guest ID의 BrowserContent만 onOpenNewTab 호출 |
| browser:guest-focus | event `{webContentsId,focused}` |
| browser:guest-pointer-down | event `{webContentsId}` |
| browser:html-fullscreen-changed | event boolean |
| browser:download-event | event `{id,hostWebContentsId,phase,filename?,url?,path?,receivedBytes?,totalBytes?,state?}` |
| browser:get-nav-history | invoke webContentsId → `{entries:[{url,title}],activeIndex}` 또는 null |
| browser:go-back / go-forward | invoke webContentsId → boolean |
| browser:go-to-index | invoke webContentsId,index → boolean |
| browser:focus-guest / blur-guest | invoke webContentsId → boolean |

download phase는 started/updated/done, state는 progressing/interrupted/completed/cancelled다. main은 새 window 요청을 deny하고 host guest ID와 URL을 new-tab 이벤트로 전달한다. download bar는 해당 guest ID의 이벤트를 표시한다. preload event subscription은 각각 해제 함수를 반환한다.

history 명령은 webContents가 없으면 false/null, 있으면 Electron navigationHistory에 위임한다. goToIndex 범위 검사를 이 API에서 추가 제공하지 않는다. focus는 host window를 focus한 뒤 guest wc.focus하며 renderer sender를 다시 focus하지 않는다. blur는 renderer event.sender.focus를 호출한다. 현재 handler의 ID 조회를 sender 소유권 검증까지 구현된 것으로 해석하지 않는다.

## Zoom과 shortcut

근거: [browserZoom.ts](../../src/renderer/src/browser/browserZoom.ts). zoom factor 범위=0.5~3, step=0.1이다. guest 조회는 전달된 webContentsId 우선, 없거나 미조회면 active guest fallback이다. factor 읽기 실패는 1, 적용 실패는 null. 변경 시 dataset.tabItemId에 등록된 persist handler가 item.zoomFactor를 갱신한다. 최소/최대에서 값이 같으면 재적용하지 않는다.

main shortcut relay의 browser-reload는 `{hard:boolean}`, browser-zoom은 `{direction:'in'|'out',webContentsId}`다. 주소창과 renderer keyboard hook에서 생성하는 local zoom 이벤트는 `workspace:browser-zoom`이다. guest별 factor와 앱 전체 UI zoom을 구분한다.

## 검증 시나리오

| ID | 행동 | 결과 |
|---|---|---|
| B-NAV-01 | 주소 표의 입력을 각각 normalize | 표의 URL/null과 일치 |
| B-NAV-02 | dom-ready 전 두 URL 입력 | 최신 pending URL을 준비 후 탐색 |
| B-NAV-03 | guest A가 새 창 요청 | A의 owning pane만 새 탭 생성 |
| B-NAV-04 | 제안 입력 2049 UTF-8 bytes | [] |
| B-NAV-05 | 새 URL 501개 기록 | 가장 오래된 항목 제거, 500개 유지 |
| B-NAV-06 | 3배에서 zoom in | 3 유지 |
| B-NAV-07 | 닫힌 guest ID history 조회 | null/false |
| B-NAV-08 | 파일 URL 방문 | 주소 이동 가능, HTTP 방문 기록에는 추가되지 않음 |

browserUrl, browserAddressBarSuggestions, browserSession, browserZoom의 기존 테스트를 실행한다. 로그인·passkey·download의 실제 사이트 동작은 native 통합 확인 범위다.
