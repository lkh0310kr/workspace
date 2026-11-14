# Markdown editor 스펙

Markdown은 plain text 문서에 CodeMirror decoration을 적용하는 live preview다. HTML로 변환한 문서를 저장하지 않는다. [Text surface](../code/README.md)와 [provider](../provider.md)를 먼저 구현한다.

제품 목표, 미지원 결과, 표·수식·Mermaid·HTML acceptance는 [Markdown 편집기 완성도 목표 스펙](./product-completeness.md)을 따른다. 이 문서는 코드에서 확인한 현재 동작의 상세 근거다.

## 구성과 프레임

[EditorMarkdownEditor](../../../../packages/editor/src/EditorMarkdownEditor.tsx)는 document frame과 MarkdownSurface를 조합한다. Surface는 shared grammar, syntax fallback highlighting, markdownEditorTheme/markdownProseTheme, host extensions, linkNavigation, imageResolver를 구성한다.

[Document frame](../../../../packages/editor/src/EditorMarkdownDocument.tsx)은 title·본문이 함께 움직이는 외부 scroll을 가진다. 문서 outline/structure control은 제공하지 않는다. Code pane은 Cmd/Ctrl+F search shortcut을 제공하고 toolbar search button은 렌더링하지 않는다. cm-editor/title 내부 click을 제외한 background click만 host에 전달한다. Desktop은 이때 focus와 cursor를 본문 끝으로 옮긴다. code 모드의 내부 scroll과 구분한다.

## 문법과 입력

[markdownEditor.ts](../../../../packages/editor/src/markdownEditor.ts)는 markdownLanguage를 base로 host parserExtensions를 더하고 addKeymap=false로 만든다. indentOnInput, 4칸 indent, Enter의 continue-markup(nonTightLists:false)→일반 newline fallback, Backspace의 deleteMarkupBackward를 사용한다. WikiLink parser는 제품이 주입한다.

Mod-b는 `**`, Mod-i는 `*`로 모든 selection을 감싼다. 선택 양쪽에 동일 marker가 이미 있고 선택이 비어 있지 않으면 marker를 제거한다. 선택 범위를 marker 길이만큼 보정한다. 빈 selection은 marker 두 개를 삽입하고 가운데 cursor를 둔다. transaction userEvent는 input이다.

## Live preview 렌더 규칙

근거: [markdownLivePreview.ts](../../../../packages/editor/src/markdownLivePreview.ts), [스타일](../../../../packages/editor/src/markdown.css), [themes](../../../../packages/editor/src/themes.ts).

선택 범위가 노드 경계에 닿아도 overlap으로 판단한다(`range.from <= node.to && range.to >= node.from`). 선택이 해당 요소에 들어오면 원문 marker를 드러내 편집할 수 있게 한다. marker 숨김 replace와 내용 스타일 mark를 인접한 비중첩 range로 만든다. block line decoration과 inline range decoration을 분리한다. HTML/table처럼 높이를 바꾸는 block replacement는 별도 StateField로 관리한다.

| 요소                    | 현재 렌더 책임                                                                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ATX heading 1~6         | marker와 level별 스타일                                                                                                                                                                                           |
| 강조·code·link·WikiLink | 원문 marker 숨김과 내용 class; 링크 클릭은 별도 resolver                                                                                                                                                          |
| 목록·task               | bullet/checkbox widget; checkbox 조작은 해당 원문 task marker 변경                                                                                                                                                |
| blockquote/callout      | line 스타일과 `[!type]` label; note/info/tip/success/question/warning/danger/failure/bug/example/quote label                                                                                                      |
| fenced code             | CodeMirror language-data의 language/alias/extension 매칭 및 syntax colors; preview header의 오른쪽 language label click은 fence body copy 후 host global toast를 요청; 원문 편집 상태에서도 같은 background/frame |
| table                   | alignment, escaped pipe, inline Markdown·KaTeX와 안전한 `<br>` line break를 th/td DOM으로 표시; 셀 클릭 시 원문 Markdown 편집                                                                                     |
| image                   | host resolver 또는 rootPath 기반 URL, 자원 cleanup                                                                                                                                                                |
| HTML block              | sandbox iframe srcdoc 미리보기; 원문 보존                                                                                                                                                                         |

HTML iframe의 sandbox는 `allow-same-origin`이며 script 허용 flag는 없다. title=`Embedded HTML preview`, scrolling=no, 기본 높이 120px. document 크기를 ResizeObserver로 측정하고 32~2400px로 제한한다. destroy 시 observer를 disconnect한다. 일반 browser webview와 다른 renderer다.

이미지 resolver는 URL→`{src, release?} | null` 또는 해당 Promise다. 비동기 결과 도착 전에 widget이 제거됐으면 자원을 해제하고 붙이지 않는다. 기본 fallback은 http(s) 그대로, 그 외 rootPath가 없으면 null, 있으면 앞 `./`와 `/`를 제거하고 rootPath에 결합해 segment별 encode한 file URL이다. 이 fallback은 현재 문서 directory 기준 상대 링크 해석기와 같지 않다.

## 제목과 실제 파일 rename

근거: [markdownTitle.ts](../../../../packages/editor/src/markdownTitle.ts), [Desktop EditorContent](../../../../apps/workspace-app/src/renderer/src/panes/EditorContent.tsx).

- title은 path basename에서 `.md` 또는 `.markdown`을 제거한다. null은 `Untitled`. path의 backslash는 slash로 정규화한다.
- 입력은 trim. 빈 값은 Desktop에서 편집 취소, slash/backslash 포함은 inline 오류와 focus 유지다. title 불변도 취소한다.
- 새 path는 기존 directory + 새 title + 확장자다. `.markdown`은 유지하고 나머지는 `.md`다. `.mdown`을 별도 유지하는 규칙은 없다.
- provider로 대상 directory, 현재 item, siblings를 조회한다. 같은 item ID를 제외하고 이름을 소문자로 비교해 collision을 거부한다. 제목 rename은 자동 suffix를 붙이지 않는다.
- rename 시작 시 자동 저장 timer를 취소하고 pathRenameInFlight=true. untitled는 먼저 대상 path에 저장한 뒤 path를 부여한다. 기존 파일은 autoSave가 켜져 있고 dirty일 때 기존 path를 먼저 저장하고 provider.rename을 수행한다.
- 성공 시 skipPathLoad를 지정해 rename된 파일을 다시 읽으며 현재 편집을 덮지 않게 한다. 실패 시 title draft와 편집 모드를 복원하고 오류를 표시한다. finally에서 rename flag를 해제하고 dirty면 자동 저장을 다시 예약한다.

## 링크

[markdownLinkNavigation.ts](../../../../packages/editor/src/markdownLinkNavigation.ts)는 `.cm-md-link` pointer down에서 destination을 찾아 연다. selection이 바뀌며 live-preview DOM이 재생성되어도 한 번의 클릭을 처리하고, 이어지는 click 이벤트는 중복 실행하지 않는다. WikiLink는 `[[target|label]]`의 target만 trim한다. 일반 Link는 URL child를 사용한다. http(s) destination은 새 외부 browser context로 열고, 다른 일반 링크는 host callback이 true를 반환할 때 preventDefault하고 처리 완료로 본다.

## 접기

헤딩은 `#` 수가 나타내는 level을 기준으로 접는다. 헤딩을 접으면 그 다음 같은 level 또는 상위 level 헤딩 전까지의 모든 block을 숨긴다. 접기 컨트롤은 가운데 정렬된 본문 폭을 기준으로 각 접을 수 있는 헤딩 바로 왼쪽에 놓는다. 목록은 여러 줄을 포함하는 `ListItem`에서 첫 줄 뒤의 하위/이어지는 내용을 접고, 형제 항목은 남긴다. CodeMirror `foldKeymap`의 키 조작도 제공한다. 접힌 상태는 문서 내용에 저장하지 않으며 editor state가 재생성되면 초기화된다.

[relativeLink.ts](../../../../packages/editor/src/relativeLink.ts)는 query/hash를 제거하고 segment별 decode한다. scheme/`//`/빈 path/잘못된 percent encoding을 거부한다. `/`는 provider root, 그 외 현재 파일 directory 기준이다. `..`가 root 밖으로 나가면 null. hash-only 이동은 이 함수로 해결되지 않는다. Desktop WikiLink는 target의 마지막 path segment를 trim하고 `.md`를 붙인 이름을 case-insensitive 비교한다. root부터 directory를 BFS하며 최대 500 directory를 조회하고 첫 markdown 일치를 연다. 없으면 root에 해당 이름의 빈 .md 파일을 생성한다. target이 이미 확장자를 가졌다고 확장자를 생략하는 규칙은 없다. 이 resolver로 대상 문서를 열며 일반 상대 링크는 확장자로 pane kind를 선택한다.

## 검증 시나리오

| ID    | 입력/행동                         | 결과                                           |
| ----- | --------------------------------- | ---------------------------------------------- |
| MD-01 | `**hello**` 밖/안으로 cursor 이동 | 스타일/marker 전환, 저장 text 불변             |
| MD-02 | 다중 selection에서 Mod-b 두 번    | 각 선택 감싸기/해제, 범위 유지                 |
| MD-03 | `a.markdown` 제목을 b로 수정      | 같은 directory의 b.markdown, item ID 유지      |
| MD-04 | sibling `B.md` 존재, 제목 b       | collision 오류; 원본 파일 유지                 |
| MD-05 | `notes/a.md`에서 `../b.md?q=1#h`  | b.md. `../../b.md`는 null                      |
| MD-06 | image load 중 document 전환       | 늦은 resource와 release 정리                   |
| MD-07 | HTML preview unmount              | ResizeObserver 해제; script 실행 허용하지 않음 |

기존 자동 검증은 markdownTitleRename.test에 연결된다. decoration/이미지/HTML의 실제 브라우저 렌더는 별도 수동 검증 대상이며 스냅샷 검증 완료를 뜻하지 않는다.
