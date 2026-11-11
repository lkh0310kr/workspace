# Desktop Editor ↔ PKMS 편집기 정렬 계획

이 문서는 Desktop Editor의 현재 편집 경험을 기준으로 Desktop PKMS와 Web PKMS의 차이를 추적한다. 목표는 PKMS 기능을 순수 Editor에 합치는 것이 아니라, PKMS 안에서 파일을 읽고 편집할 때 같은 편집기 UI·동작·렌더링 기준을 사용하는 것이다.

## 제품 경계

| 제품 영역 | 소유하는 책임 |
|---|---|
| Desktop Editor | 로컬 파일 편집, 코드/Markdown 편집기 동작과 UI의 기준 구현 |
| Desktop PKMS | 계정, GitHub 저장소, 협업, 서버 저장, GitHub 백업, 로컬 폴더 sync 및 PKMS 파일 provider |
| Web PKMS | 웹 인증·라우팅·SSR과 PKMS 파일 provider. 편집기 경험은 Desktop Editor 기준을 따른다. |
| `packages/editor` | 제품 shell이 주입하는 provider/session/확장을 받아 공유하는 편집기 surface, 문서 프레임, 트리·탭·검색 UI |
| `packages/pkms-client` | Web/Desktop PKMS 공용 계정·파일·동기화 UI와 PKMS provider/session 연결 |

Desktop Editor는 순수 편집기 기능을 유지한다. GitHub, 계정, PKMS 동기화 기능은 Editor로 옮기지 않는다. PKMS provider가 저장·rename·이미지 해석·협업 session 같은 기능을 제공하고, 편집기 공용 surface가 이를 사용한다.

## 구현 진입점

- Desktop Editor 화면: [EditorContent.tsx](../../src/renderer/src/panes/EditorContent.tsx)
- Desktop Editor pane 및 탭/Explorer chrome: [PaneGroup.tsx](../../src/renderer/src/panes/PaneGroup.tsx)
- Desktop PKMS 편집기 host: [PkmsClientApp.tsx](../../../../packages/pkms-client/src/PkmsClientApp.tsx)
- Desktop PKMS host adapter: [PkmsPane.tsx](../../src/renderer/src/panes/pkms/PkmsPane.tsx)
- Web PKMS route: [home.tsx](../../../pkms-web/app/routes/home.tsx)
- Web PKMS document shell: [root.tsx](../../../pkms-web/app/root.tsx)
- 공유 편집기 API: [packages/editor README](../../../../packages/editor/README.md)
- 공유 PKMS client 경계: [packages/pkms-client README](../../../../packages/pkms-client/README.md)

Desktop과 Web PKMS는 같은 `PkmsClientApp`을 사용한다. 따라서 `packages/pkms-client` 또는 `packages/editor` 수정은 원칙상 양쪽에 같이 반영된다. Desktop host는 PKMS client를 별도 React root·MemoryRouter·Shadow DOM에 마운트하므로 스타일을 명시적으로 넣어야 한다. Web host는 React Router document shell에서 client를 직접 렌더한다.

## 현행 코드 비교

상태:

- **공유됨**: 동일한 `packages/editor` 구현을 사용한다.
- **부분 정렬**: 공통 surface를 사용하지만 host 배치, chrome, extension, 상태 처리 중 차이가 있다.
- **불일치**: Desktop Editor 기준과 동작/화면이 다르거나 PKMS에 별도 UI가 있다.
- **검증 필요**: 소스 연결은 확인했지만 실제 Web/Desktop 렌더링이 같은지는 acceptance가 없다.

| 영역 | Desktop Editor 기준 | Desktop/Web PKMS 현행 | 상태 | 반영 결과 |
|---|---|---|---|---|
| Markdown frame 및 filename title | `EditorMarkdownEditor` + `EditorMarkdownTitle`; 공용 문서 폭·title·width toggle | 같은 공용 컴포넌트를 `PkmsClientApp`에서 사용 | 공유됨 / 검증 필요 | component 복제 없이 같은 CSS와 상호작용을 유지한다. 양 host의 title/body 폭, padding, wide/readable 동작이 같아야 한다. |
| Markdown surface 및 렌더러 | `EditorMarkdownSurface` 공용 CodeMirror parser, syntax theme, live preview, link/image pipeline | 같은 surface 사용. PKMS는 provider 이미지 resolver와 link activation을 주입 | 공유됨 / 검증 필요 | 표·Mermaid·TeX·HTML·code fence는 공용 renderer 기준. provider 차이는 resource/link resolver에서만 허용한다. |
| PKMS 링크 문법 | Desktop Editor와 PKMS가 `editorMarkdownParserExtensions`를 parser에 주입 | 공용 Markdown parser extension preset 사용 | 정렬 완료 / UI 검증 필요 | `[[wikilink]]`/alias parser configuration은 한 export를 사용한다. 실제 open/alias/target behavior는 host별 확인한다. |
| Markdown breadcrumbs | Desktop Editor는 `EditorBreadcrumbs`를 title/document 위에 렌더하고 provider로 경로 이동 지원 | PKMS Markdown 화면도 shared `EditorBreadcrumbs`를 사용하고 provider에서 sibling entries를 읽음 | 1차 반영 / UI 검증 필요 | repository는 shell chrome에, 파일 경로는 공용 breadcrumb에 둬 중복 표시하지 않는다. Web/Desktop sibling menu 및 파일 open 결과를 확인한다. |
| Markdown title 편집 | 공용 title component, click 위치 caret, provider rename 지원 시에만 edit | 공용 title component와 PKMS provider rename 사용 | 공유됨 / 검증 필요 | 기존 동작을 보존하고 PKMS rename·충돌·동기화 후 경로/title 갱신을 확인한다. |
| Markdown search | Desktop Editor는 편집기 내부 `Cmd/Ctrl+F` 검색 panel을 사용 | 공용 text surface 기반. PKMS 전체 앱 단축키/검색 진입을 별도 보유할 수 있음 | 검증 필요 | 문서 내 찾기와 파일 전체 검색을 구분하고, 같은 단축키가 shell과 surface에서 중복 실행되지 않게 한다. |
| Code editor | Desktop Editor는 Markdown 외 코드 파일을 CodeMirror 언어 지원·syntax theme와 함께 편집 | PKMS의 문서 화면은 Markdown 편집 및 asset preview 중심, 일반 코드 편집 surface 없음 | 불일치 / 제품 결정 | PKMS 저장소의 코드 파일 편집이 범위라면 Desktop Editor와 동일한 shared `EditorTextSurface`/language registry를 재사용한다. PKMS 전용 syntax editor를 만들지 않는다. 범위 밖이면 파일을 편집 가능하다고 노출하지 않는다. |
| 코드 fence | shared Markdown surface에서 언어 식별·highlight 및 fence presentation | 같은 Markdown surface를 사용하지만 PKMS host 실기 확인 부족 | 검증 필요 | fence 안 언어 표시 위치, 클릭 복사, 배경/모서리/높이, 지원 언어 색상이 Web/Desktop에서 같아야 한다. |
| 문서 탭 | Workspace Pane tab strip가 탭·dirty marker·close를 소유 | PKMS `EditorDocumentTabBar`와 PKMS 전용 open-document state 사용 | 불일치 | PKMS는 multi-document 기능을 유지하되 동일 `EditorDocumentTabBar` visual/keyboard/dirty/close 계약을 따른다. Desktop Pane tab strip 자체를 PKMS에 복제하지 않는다. |
| 저장 표시 및 오류 | Desktop Editor는 clean/saving 상태 라벨을 노출하지 않고 실패 시에만 오류 표시 | 정상 `Saved`/`Saving` label 제거. 로컬 sync notice는 status message로 유지 | 1차 반영 / 추가 정리 필요 | 정상 문서 저장 label은 없다. sync notice는 PKMS 동기화 결과를 안내한다. 실패·충돌은 actionable error/sync UI로 유지한다. |
| 키보드 단축키 | Editor surface와 Workspace shell이 책임을 나눔 | PKMS 자체 sidebar `Cmd+\\`, Quick Open `Cmd+P`, save 및 검색 처리 포함. Desktop shell도 `Cmd+\\`를 Explorer에 사용 | 부분 정렬 | Desktop PKMS의 `Cmd+\\` key handler를 비활성화해 shell과의 중복을 막았다. Web standalone은 sidebar shortcut을 유지한다. 그 외 shortcut ownership은 후속 정렬 항목이다. |
| Scroll/view state | Editor 문서 key로 CodeMirror selection/scroll state 저장 및 restore | PKMS도 document key 및 view-state cache 사용 | 공유됨 / 검증 필요 | 동일 문서의 재열기·workspace 전환·저장 rename 후 scroll/caret 복원과 서로 다른 문서 간 상태 격리를 확인한다. PKMS session key를 바꿀 때 view state를 유실하지 않는다. |
| TreeView | Workspace Explorer가 tree scroll/selection/expand와 pane navigation을 소유 | PKMS FileTreeList는 shared EditorTreeView를 사용하지만 PKMS가 별도 sidebar·selection/state/chrome를 소유 | 부분 정렬 | 공통 row visual/keyboard/context interaction을 따르고 PKMS provider capability만 주입한다. Desktop Explorer 상태와 PKMS 전용 파일 tree 상태의 소유권을 혼동하지 않는다. |
| 파일 생성/rename/move/delete | Desktop Editor provider capability와 공용 tree actions | PKMS client provider/API가 PKMS mutation, collaboration dirty guard 및 sync 보호를 소유 | 부분 정렬 | UI 동작은 공용 editor/tree action, 권한·충돌·revision·folder-sync 안전성은 PKMS provider에서 처리한다. destructive mutation guard를 약화하지 않는다. |
| 첨부 및 이미지 | Workspace viewer pane 및 editor image resolver | PKMS는 provider image resolver와 자체 inline asset preview/download를 제공 | 부분 정렬 | Markdown inline image는 같은 document renderer를 사용하고 PKMS resolver만 인증 asset URL을 만든다. standalone attachment는 PKMS 저장/다운로드 기능을 유지하며 preview 시 공용 viewer 결과를 목표로 한다. |
| 알림 | Workspace 공용 toast viewport | PKMS `notice`/`error` 및 별도 notice 영역이 존재 | 불일치 | 복사 완료, 일시적 성공/실패는 공용 알림 체계로 통합한다. sync conflict처럼 상세 조치가 필요한 상태는 PKMS sync UI에 남긴다. |
| 시각 토큰 및 Shadow DOM | Workspace theme 및 editor CSS token | PKMS 별도 app CSS/token; Desktop에서 PKMS/editor CSS를 Shadow DOM에 별도 주입 | 불일치 위험 / 검증 필요 | 편집기 surface는 `packages/editor` CSS/tokens가 소유한다. PKMS shell reset/selector가 title·heading·link·table·code colors를 덮지 않는지 두 host에서 확인한다. |

## Markdown 기능별 기준

이 기능은 PKMS마다 따로 구현하지 않는다. 지원 여부와 사용자 결과는 `packages/editor` Markdown spec을 단일 기준으로 하고, 양 PKMS host는 같은 예제 문서로 결과를 검증한다.

| 기능 | 공용 구현 위치 | PKMS adapter 책임 | 비교/수용 결과 |
|---|---|---|---|
| 제목·본문 폭 및 filename title | `EditorMarkdownDocument`, `EditorMarkdownTitle` | 경로와 rename callback 연결 | filename, title, 첫 heading, 본문 시작선과 readable/wide 폭이 Desktop Editor와 일치 |
| Heading / paragraph / list / quote / thematic break | `markdownLivePreview.ts`, Markdown theme/CSS | parser extension만 주입 | source↔preview에서 구조·색·간격이 동일하고 `#` marker 및 heading에 임의 밑줄/색상 차이가 없음 |
| Table | 공용 live preview table widget | provider 작업 외 custom table renderer 금지 | 정렬, 긴 셀/가로 overflow, inline formatting, 수식, 링크, source 편집, caret/selection, 저장 후 원문 round-trip 일치. 현재 미지원 항목은 `packages/editor/docs/markdown/product-completeness.md` ledger에 기록 |
| Mermaid | 공용 Markdown diagram widget | theme token 공급 | 여러 diagram, invalid source fallback, editing/preview 전환, theme, 크기 제한 동작 일치 |
| TeX / KaTeX | 공용 math extension/widget | 별도 수학 parser 금지 | inline/display/table cell에서 렌더, 오류 source 복구, selection/editing 전환 동일 |
| HTML in Markdown | 공용 sandboxed HTML block | provider/resource URL 정책 전달 | 동일한 허용 문법과 CSP/sandbox 결과. PKMS 인증 자원 이외에 script/navigation 권한을 넓히지 않음 |
| Links / wikilinks / images | shared link navigation 및 image resolver | PKMS 경로 resolve, 인증 asset fetch, 문서 열기 callback | external HTTP(S)는 browser/web에서 열리고, 내부 링크는 PKMS provider에서 같은 파일로 이동. broken link fallback과 이미지 상대경로 동일 |
| Code fences | 공용 CodeMirror language-data 및 Markdown widget | 필요한 language-data 등록은 공용 package에서만 수행 | language label 위치, copy interaction, fence style, highlight, unknown-language fallback 일치 |

구체적인 syntax coverage와 미완료 상태는 [Markdown product completeness](../../../../packages/editor/docs/markdown/product-completeness.md)가 기준이다. 이 문서의 표는 제품별 parity 적용과 acceptance만 다룬다.

## 1차 반영 상태

- Desktop Editor와 PKMS가 각각 선언하던 wikilink parser extension 목록을 `packages/editor`의 `editorMarkdownParserExtensions` 하나로 통합했다. Desktop Editor와 `PkmsClientApp` 모두 같은 preset을 Markdown surface에 전달한다.
- PKMS Markdown 화면을 Desktop Editor와 같은 `EditorBreadcrumbs` component로 연결했다. PKMS provider에서 sibling list를 공급하고 선택 시 provider file ID로 파일을 연다. Repository context는 topbar에 남기고 active Markdown 경로는 breadcrumb에만 둔다.
- PKMS topbar의 일반 저장 단계(`Saved`/`Saving`) 표시를 제거했다. 파일 탭의 dirty state 및 저장 오류 처리는 유지하고, folder sync notice는 별도 status message로 남겼다.
- Desktop PKMS에서 `Cmd+\\`가 PKMS sidebar와 Workspace Explorer를 동시에 토글하지 않도록 PKMS shortcut listener가 해당 키를 처리하지 않게 했다. Web standalone의 PKMS sidebar shortcut은 유지한다.
- 다음 우선 순위는 Markdown host render 검증 및 code editing 범위 결정이다. 이번 1차는 전체 PKMS shell 통합이나 코드 파일 편집 지원을 완료한 것으로 간주하지 않는다.

## 작업 목록

### P0 — 편집기 화면·조작 parity

1. 공유 Editor의 현재 title, body width, breadcrumb, Markdown preview, code fence, shortcut 결과를 기준 캡처/fixture로 고정한다.
2. PKMS 정상 저장 `Saved`/`Saving` 라벨을 제거하고 오류/충돌 안내를 분리한다.
3. Desktop PKMS의 `Cmd+\` 중복 sidebar/Explorer 처리를 제거하고 shortcut 소유자를 명시한다.
4. Shared breadcrumb의 Web/Desktop menu interaction과 좁은 화면 결과를 검증한다.
5. Web/Desktop PKMS에서 heading, link, table, Mermaid, TeX, HTML, code fence의 theme/style override를 조사하고 shared CSS가 결과를 소유하게 한다.

### P1 — 기능 parity 및 provider 연결

1. Wikilink open/alias 동작이 Desktop/Web PKMS에서 동일한지 수용 검증한다.
2. PKMS 문서 검색, Quick Open, 파일 전체 검색, shell shortcut을 공용 Editor/PKMS command contract로 정렬한다.
3. 문서 tab visual/dirty/close interaction을 Editor 공용 기준으로 정렬하면서 PKMS multi-document session을 유지한다.
4. View-state identity migration 및 scroll/caret restore를 PKMS id/path rename·workspace switch·session reopen에서 검증한다.
5. 코드 파일 편집을 PKMS 범위에 포함할지 결정한다. 포함이면 shared CodeMirror surface/language support 사용. 제외면 PKMS tree에서 read-only/unsupported 결과를 분명히 표시한다.
6. asset preview와 Markdown image resolve를 provider capability 기반으로 연결하고, 다운로드 등 PKMS 고유 동작은 보존한다.

### P2 — 정합성 검증 및 회귀 방지

1. 공통 fixture `.md`를 Web PKMS와 Desktop PKMS에 열어 결과 비교: heading, title, links, lists, nested quote, table+TeX, Mermaid, HTML, 여러 fence 언어, 이미지.
2. 같은 fixture에서 title rename, 외부 link, wikilink, source edit↔preview, dirty close, save error, conflict 상태를 검증한다.
3. 각각의 host에서 dark/light theme와 좁은 pane/viewport를 확인한다.
4. Desktop PKMS Shadow DOM과 Web document CSS 간 cascade 차이를 확인한다.
5. 이 표의 상태를 코드 근거와 acceptance 증거가 있을 때만 갱신한다. 공용 component 사용만으로 시각 parity 완료로 표시하지 않는다.

## 완료 정의

- 편집기 UI·Markdown 렌더링·키보드·문서 view state의 단일 기준은 `packages/editor` 및 Desktop Editor 조합이다.
- Desktop/Web PKMS는 provider, session, 인증 자원 resolver, sync/conflict 정책만 편집기에 주입한다.
- PKMS client가 공용 surface를 썼다는 이유만으로 parity 완료라 하지 않는다. 두 host의 실제 render/interaction 확인이 필요하다.
- PKMS 고유 계정, 저장소, 협업, GitHub backup, folder sync, conflict 처리는 계속 동작하고 순수 Editor에 유입되지 않는다.
- 구현 전 P0 항목을 각각 명시적인 acceptance 결과로 닫고, P1/P2는 코드 및 검증 상태를 이 문서에서 추적한다.
