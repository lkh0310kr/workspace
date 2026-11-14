# Markdown 편집기 완성도 목표 스펙

이 문서는 Workspace의 파일 기반 Markdown 편집기가 도달해야 할 사용자 결과를 정의한다. 현재 구현 목록이 아니며, 항목마다 코드 근거와 완료 조건을 구분한다. 구현의 세부 선택은 호환성·보안·편집 위치 보존에 여러 유효한 방식이 있는 항목에 한해 별도 결정 기록으로 남긴다.

이 편집기는 원본 Markdown 파일을 유지하는 지식 문서 편집기다. Obsidian은 파일 탐색·Live Preview·Markdown 호환성의 기준으로, Notion은 문서 프레임·넓이·블록 조작 결과의 시각/상호작용 기준으로 삼는다. Notion 데이터베이스·권한·실시간 협업 전체를 복제한다는 뜻은 아니다.

## 목표 상태

파일을 열면 제목과 본문이 같은 문서 폭에 정렬되고, 제목은 파일 이름을 정확히 나타낸다. 사용자는 Markdown 원문을 보존하면서 읽기 쉬운 미리보기로 작성하고, 표·수식·다이어그램·HTML을 예측 가능하고 안전하게 다룬다. Explorer와 문서는 각각의 위치·선택·편집 상태를 유지하며, 한 영역의 상태 변경이 다른 영역의 viewport를 임의로 이동시키지 않는다.

## P0 — Explorer 탐색 상태를 안정화한다

현재 [PaneGroup](../../../../apps/workspace-app/src/renderer/src/panes/PaneGroup.tsx)은 `treeOpen`과 active pane kind로 Explorer를 노출하고, [WorkspaceExplorerSidebar](../../../../apps/workspace-app/src/renderer/src/components/WorkspaceExplorerSidebar.tsx)는 `Cmd/Ctrl+\`를 처리한다. CSS는 pane 폭 560px 이하에서 slot을 강제로 숨긴다. 이 CSS 조건은 저장된 `treeOpen=true`와 별개라 단축키로 열려 있어도 보이지 않을 수 있다. 폭 임계값에서 닫힘/복귀 규칙을 단일 상태 전이로 정의해야 한다.

[TreeView](../../../../apps/workspace-app/src/renderer/src/components/TreeView.tsx)는 활성 파일 경로 변경 때 ancestor를 펼치고 해당 행을 `scrollIntoView`한다. 트리 내용 변경 때 anchor를 유지하는 동작과 이 자동 reveal은 현재 하나의 active-path 효과에서 섞여 있다. 따라서 “스크롤을 유지하라”는 결과와 “활성 파일을 보여라”는 결과가 서로 덮어쓸 수 있다.

| ID     | 사용자 결과                                                                     | 수용 기준                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EXP-01 | `Cmd+\` / `Ctrl+\`로 focused file pane의 Explorer를 열고 닫는다.                | editor focus 여부와 관계없이 동작한다. 논리 키 값 `\\` 또는 물리 키 코드 `Backslash`로 판별하므로 키 문자가 달라지는 layout에서도 토글된다. 닫기 직후, 검색 pane에서 전환, pane split, 창 크기 변경 후에도 shortcut이 동작한다. 키 입력 시 `treeOpen`, sidebar mode, 실제 표시 여부가 일치한다. 자동 검증은 단축키 판별의 키보드 레이아웃 회귀를 확인한다. Electron 화면에서 재열기와 상태 일치 여부를 수동 수락해야 한다. |
| EXP-02 | 좁은 pane에서 Explorer가 editor 위를 덮지 않고 사라진다.                        | 가용 너비가 임계값 아래면 dock 폭을 해제하고 editor가 남은 폭을 쓴다. 임계값 위로 돌아오면 명시된 open 상태에 따라 재표시된다. “숨겨진 상태”와 “열렸지만 CSS로 가려진 상태”가 동시에 존재하지 않는다.                                                                                                                                                                                                                      |
| EXP-03 | 일반 선택·열기·refresh·folder expand/collapse 뒤 현재 보던 첫 행을 유지한다.    | 이전 첫 가시 행의 path가 남아 있으면 같은 viewport y 위치에 둔다. 행이 삭제되면 가장 가까운 생존 행을 사용한다. 선택/focus 변화는 viewport를 초기화하지 않는다. active file 변경만으로 ancestor expand나 scroll reveal을 하지 않는다.                                                                                                                                                                                      |
| EXP-04 | 탭 전환·Explorer 닫기/열기·pane 폭 조정·TreeView 재마운트 후 scroll이 유지된다. | 저장한 row path + row 내부 offset을 우선 복원한다. 데이터가 준비되기 전에 0으로 점프하는 화면을 보이지 않는다. path 복원이 불가능한 경우에만 pixel offset을 fallback으로 쓴다. anchor 우선순위·fallback·clamp는 자동 테스트하며 실제 토글/탭 전환은 Electron 수동 acceptance가 남아 있다.                                                                                                                                  |
| EXP-05 | 별도 탐색 의도가 있을 때 활성 파일을 찾아갈 수 있다.                            | `Cmd/Ctrl+Shift+E`는 Explorer를 열고 현재 활성 파일의 ancestor를 펼쳐 그 파일을 reveal한다. 이 명시 동작만 자동 보존 규칙보다 우선한다.                                                                                                                                                                                                                                                                                    |

Markdown formatting의 `Mod-b`는 bold 동작에 사용한다. Explorer toggle은 겹치지 않는 `Cmd/Ctrl+\`로 제공하며, keyboard capture 단계에서 editor focus를 포함해 현재 focused pane group을 토글한다.

| ID     | 사용자 결과                                                   | 수용 기준                                                                                                                                                            |
| ------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KEY-01 | Markdown 본문에서 `Cmd/Ctrl+B`는 선택 텍스트를 bold 처리한다. | Explorer가 열려 있거나 닫혀 있어도 bold 명령이 동작한다. `Cmd/Ctrl+\`는 editor focus 여부와 관계없이 Explorer를 토글한다. `Cmd/Ctrl+Shift+E`는 활성 파일 reveal이다. |

## P0 — 문서 제목과 본문 폭을 하나의 레이아웃으로 만든다

현재 [Markdown theme](../../src/themes.ts)는 `.cm-content`에 `maxWidth: 820px`, 가운데 정렬, 좌우 padding을 적용하고 상단 padding을 8px로 둔다. [Markdown title CSS](../../src/markdownDocument.css)는 display title과 rename input을 같은 820px column 및 좌우 padding으로 정렬한다. 파일명 제목과 본문 H1은 28px로 맞춘다. rename input은 이 column 전체 폭을 사용하며 border·radius 없이 caret과 오류 메시지로 편집 상태를 나타낸다. 수동 위치·폭 acceptance는 남아 있다.

| ID     | 사용자 결과                                                                | 수용 기준                                                                                                                                                                                           |
| ------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOC-01 | 파일 제목은 basename에서 편집 확장자를 제외한 이름으로 표시된다.           | `a.md`와 `a.markdown`은 각각 `a`; 경로 breadcrumb는 전체 경로/확장자를 보여 준다. 제목 수정은 현재 확장자를 보존한 파일 rename이며 저장 내용·열린 탭·breadcrumb·TreeView가 같은 새 path를 반영한다. |
| DOC-02 | 제목, 본문, 표, 이미지, 수식, 다이어그램이 같은 문서 column 안에 정렬된다. | 같은 viewport에서 title/body 시작 x와 max width가 일치한다. 창 및 pane 폭 변경 시 둘 다 같은 규칙으로 재배치되며 title만 full-width로 튀지 않는다.                                                  |
| DOC-03 | 사용자는 읽기 좋은 폭과 넓은 폭을 선택할 수 있다.                          | 기본 readable width는 title/body 모두 820px column이다. wide 선택은 title/body를 pane 폭으로 늘린다. shared toolbar의 접근 가능한 토글로 바꾸고 host별 사용자 설정으로 재실행 후 유지한다.          |
| DOC-04 | 제목·본문 스크롤이 하나의 문서 viewport로 동작한다.                        | wheel, PageUp/PageDown, home/end, 검색 결과 이동 후 제목이나 콘텐츠가 겹치지 않고 스크롤 위치가 예측 가능하다. 빈 문서·긴 제목·좁은 pane에서도 액션 chrome이 본문을 가리지 않는다.                  |

Notion의 `Full width`는 page width 선택 결과의 기준이다. Notion 공식 도움말은 appearance 설정에서 Full width를 켜 폭을 넓히고, 기본/serif/mono 글꼴과 small text도 선택하도록 설명한다. Workspace는 파일 호환 편집기이므로 이러한 선택 중 폭/글꼴/글자 크기만 문서 보기 설정으로 제공하고, 데이터베이스 page layout은 범위 밖으로 둔다.

## P0 — Markdown title·heading·link 시각 규칙을 통일한다

현재 화면에서 보이는 세 스타일 문제는 각각 다른 규칙에서 온다.

| 보이는 요소            | 현재 코드 근거                                                                                                                                                                                                                                                                                                             | 결과                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 본문 H1/H2 underline   | [EditorMarkdownSurface](../../src/EditorMarkdownSurface.tsx)가 CodeMirror `defaultHighlightStyle`을 설치한다. 해당 기본 style은 `tags.heading`에 underline을 부여한다.                                                                                                                                                     | heading은 크기·굵기만으로 구분되지 않고 링크처럼 밑줄이 생긴다.                                                            |
| `#` marker 색          | 같은 `defaultHighlightStyle`이 `tags.meta`에 고정색 `#404740`을 부여한다. 라이브러리는 이 기본 style을 light theme에 적합하다고 설명하지만 dark/light 양쪽에서 사용한다. `markdownLivePreview.ts`가 marker와 heading text에 같은 `cm-md-hN` decoration을 주더라도 내부 syntax token style이 더 구체적인 색을 덮을 수 있다. | 편집 중 표시되는 `#`가 제목 글자와 다른, 현재 theme에 맞지 않는 색으로 보인다.                                             |
| Markdown link 색       | [markdown.css](../../src/markdown.css)는 `.cm-md-link`에 본문과 같은 `var(--text)` 색을 준다. 기본 highlight와 app global CSS도 underline을 추가한다.                                                                                                                                                                      | 링크임을 색으로 구분하지 못하고, 밑줄만 겹쳐 강조가 어색하다. WikiLink는 별도 dotted underline 규칙을 쓴다.                |
| 파일명 title edit 밑줄 | [markdownDocument.css](../../src/markdownDocument.css)의 `.md-title-input`이 `box-shadow: inset 0 -1px ...`를 사용한다. display 상태 `.editor-markdown-title` 자체에는 underline이 없다.                                                                                                                                   | filename display와 rename editing의 상태 구분이 흐리며, display heading underline과 함께 보면 이유 없는 밑줄처럼 느껴진다. |

### 시각 hierarchy 계약

이 문서의 `filename title`은 파일명에서 계산해 문서 frame 위에 놓는 이름이다. `Markdown H1`은 본문 안의 첫 heading이며 별개의 콘텐츠다. 두 값이 같은 문자열이어도 합치거나 숨기지 않는다.

| 요소                 | 기본 표시                                                              | 크기와 간격                                            | 색/장식                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Filename title       | basename, 확장자 제외                                                  | 26px, weight 700, line-height 1.2; page column의 첫 줄 | `--text`; underline 없음                                                                                                                     |
| H1                   | 본문 heading 1                                                         | 28px, weight 700, line-height 1.25; 위 32px/아래 16px  | `--text`; underline 없음                                                                                                                     |
| H2                   | 본문 heading 2                                                         | 22px, weight 650, line-height 1.3; 위 28px/아래 12px   | `--text`; underline 없음                                                                                                                     |
| H3                   | 본문 heading 3                                                         | 18px, weight 650, line-height 1.35; 위 24px/아래 10px  | `--text`; underline 없음                                                                                                                     |
| H4                   | 본문 heading 4                                                         | 16px, weight 600, line-height 1.4; 위 20px/아래 8px    | `--text`; underline 없음                                                                                                                     |
| H5                   | 본문 heading 5                                                         | 14px, weight 600, line-height 1.5; 위 18px/아래 6px    | `--text`; underline 없음                                                                                                                     |
| H6                   | 본문 heading 6                                                         | 13px, weight 600, line-height 1.5; 위 16px/아래 6px    | `--text-muted`; underline 없음                                                                                                               |
| Active `#` marker    | caret/selection이 heading syntax에 닿을 때만 source marker 표시        | heading text와 같은 font metrics                       | 같은 heading color/weight. syntax meta color를 적용하지 않음                                                                                 |
| Inline Markdown link | link label은 보이고 destination syntax는 비활성 preview에서 숨김       | 문단과 같은 font metrics                               | 전용 `--link` token; 기본 underline 1px, offset 2px; hover에서만 더 강한 link color                                                          |
| WikiLink             | resolved label은 보이고 `[[ ]]`/alias syntax는 비활성 preview에서 숨김 | inline link와 동일                                     | inline Markdown link와 같은 색·underline·hover/focus 규칙                                                                                    |
| Rename input         | filename을 편집 가능한 텍스트로 표시                                   | display title과 같은 column/크기                       | unfocused 상태에 1px subtle divider; focus 때 2px `--focus-ring`, validation 오류 때 오류 divider/message. 별도 둥근 input box는 만들지 않음 |

위 수치는 첫 visual baseline이다. 창 너비와 pane 폭에 따라 글자 크기를 임의로 각각 줄이지 않는다. page width를 바꾸면 title과 본문 block container만 같이 재배치하고, heading hierarchy와 inline font token은 유지한다. 사용자가 글자 크기 설정을 바꾸면 모든 Markdown block과 title에 같은 scale factor를 적용한다.

### Link token 및 interaction 결과

현재 theme에는 전용 link color variable이 없다. `--text`를 사용하면 본문과 같고, `--accent`를 그대로 쓰면 dark theme에서 충분한 contrast가 나오지 않을 수 있다. theme별 `--link` 및 `--link-hover` token을 정의하고 normal/hover/focus에서 각각 contrast를 확인한다.

| 상태                         | 결과                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 기본 링크                    | 본문색과 구별되는 link token + 얇은 underline으로 색만으로 의미를 전달하지 않는다.                                     |
| Hover                        | link-hover token, underline 두께/offset 변화; layout shift 없음                                                        |
| Keyboard focus               | 보이는 2px focus ring 또는 underline outline; 주변 문장을 밀지 않음                                                    |
| Visited                      | local file link와 external link 모두 visited color를 바꾸지 않음. 같은 문서의 의미가 history에 따라 달라지지 않음      |
| Cursor/selection이 syntax 위 | 원문 delimiter와 destination이 보이고, link label은 link color를 유지한다. focus 표시가 cursor/selection을 가리지 않음 |
| Broken link                  | 일반 link 색을 유지하면서 missing target 표시를 추가한다. 단순히 색만 빨강으로 바꾸지 않음                             |

Internal Markdown link와 WikiLink는 목적지 해석만 다르고 label의 색·hover·focus·underline은 같은 시각 component contract를 따른다. 외부 링크는 external navigation 여부를 표시할 때 별도 아이콘을 쓸 수 있지만, 파일명/본문 폭을 바꾸지 않는다.

### Theme와 CSS 소유권

`markdown.css`의 shared 규칙과 `apps/workspace-app/src/renderer/src/assets/styles.css`의 `.cm-md-*` 규칙은 현재 중복돼 있다. 어느 stylesheet가 마지막에 로드되느냐에 따라 결과가 달라지는 구조를 없애고, shared package가 semantic component token을 소유하며 host는 light/dark token 값만 제공한다.

| ID     | 사용자 결과                                                             | 수용 기준                                                                                                                                                                                                                                              |
| ------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| VIS-01 | filename title은 파일 식별자처럼 보이고 본문 heading과 명확히 구분된다. | display state에 밑줄이 없고 H1과 같은 font size를 쓴다. rename input은 전체 column 폭의 사각·무테 입력으로 보인다. 클릭 위치에 caret을 두고 전체 title selection은 하지 않는다. 오류는 메시지로 표시한다. title text와 첫 본문 글자의 x 좌표가 맞는다. |
| VIS-02 | Markdown H1–H6는 hierarchy만으로 heading임을 알 수 있다.                | 어떤 heading level에도 default CodeMirror underline이 적용되지 않는다. H1–H6 크기·weight·margin은 양 theme에서 동일한 비율이다.                                                                                                                        |
| VIS-03 | `#` marker가 제목 글자와 같은 heading을 구성한다.                       | marker가 보이는 editing/selection 상태에서 marker와 text의 color/font/line-height가 일치한다. dark/light theme 전환 뒤에도 회색 fixed meta color가 남지 않는다.                                                                                        |
| VIS-04 | Markdown link와 WikiLink는 같은 link language를 사용한다.               | `--link` token이 body text와 구별되고 contrast 기준을 만족한다. 기본/hover/focus/broken/selected 상태를 모두 확인한다. http(s) Markdown link는 기본 browser에서 연다.                                                                                  |
| VIS-05 | syntax token color와 product design token이 충돌하지 않는다.            | `defaultHighlightStyle`의 light-only color/heading underline을 Markdown surface에서 사용하지 않거나, 제품 전용 HighlightStyle이 해당 tag를 명시적으로 덮는다.                                                                                          |
| VIS-06 | Markdown component 스타일은 package 전체에서 한 번만 정의된다.          | Workspace/PKMS에서 import 순서를 바꿔도 computed style이 같다. host global stylesheet가 shared `.cm-md-*` color/decoration을 다시 정의하지 않는다.                                                                                                     |
| VIS-07 | title·heading·link은 dark/light 모두 읽기 쉽다.                         | normal, hover, selection, focus 및 disabled/error 상태의 text/background contrast를 검토한다. 테마 전환 시 inline style에 남은 고정 hex가 없다.                                                                                                        |

### 재생성용 visual fixture

동일한 fixture를 Workspace와 PKMS host에서 열어 visual baseline을 비교한다.

```markdown
# Heading title

Filename title와 본문 H1이 함께 있을 때 두 이름과 hierarchy를 구분한다.

## Heading two

### Heading three

#### Heading four

##### Heading five

###### Heading six

`#` marker 색은 caret가 heading에 없을 때 보이지 않고, heading을 편집할 때는 글자와 같은 색이다.

[External link](https://example.com)와 [[Internal Note|internal alias]]를 비교한다.
```

이 fixture에서 caret을 각 heading marker·heading text·Markdown link label·WikiLink alias로 옮기고, selection을 가로질러 드래그하며, light/dark theme을 바꾼다. filename display, rename input normal/focus/error, body H1–H6, link default/hover/focus의 screenshot을 각각 보관한다. computed style은 색상·text-decoration·font-size·line-height·left edge를 비교하고, app CSS import 순서를 바꾸어도 값이 동일해야 한다.

## P1 — 읽기와 편집 모드를 분리하되 원문을 보존한다

현재 shared editor는 CodeMirror 기반 Live Preview 하나를 제공한다. syntax decoration은 caret/selection이 문법에 닿으면 원문 기호를 보이게 하는 일부 규칙을 갖는다. Obsidian의 사용자 결과는 Reading view, Editing view, Live Preview, Source mode를 구분한다. Workspace는 원문 파일을 직접 편집하므로 이 모드를 명시적으로 다루어야 한다.

| ID    | 사용자 결과                                                                           | 수용 기준                                                                                                                                                         |
| ----- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MD-01 | Live Preview에서 지원 문법은 렌더되고 문법에 커서가 오면 그 부분을 원문으로 편집한다. | caret 이동, 범위 선택, 다중 선택, undo/redo, 입력 중 decoration이 원문 offset과 일치한다. 문서 전체의 마크업이 숨겨지거나 선택 범위를 잃지 않는다.                |
| MD-02 | Source mode에서 원문을 숨김 없이 편집한다.                                            | heading/list/link/code/table/math/HTML 구문 기호가 그대로 보이고 syntax decoration은 동작하지 않는다. 모드 전환 시 selection, cursor, scroll을 보존한다.          |
| MD-03 | Reading view에서 렌더 결과만 탐색한다.                                                | 편집 widget이 키 입력을 받지 않고 링크·embed·checkbox·목차 등 읽기 동작은 제공된 계약을 따른다. 편집 view로 돌아오면 기존 편집 상태를 회복한다.                   |
| MD-04 | 기본 Markdown 형식과 Obsidian 문법을 정확히 판별한다.                                 | CommonMark/GFM과 채택된 Obsidian 확장을 명시한 호환성 표에 따라 parse/render/edit 결과가 결정된다. 미지원 syntax는 깨진 HTML/사라진 원문 대신 입력 그대로 보인다. |

## P1 — 표는 렌더 가능한 콘텐츠이자 편집 가능한 원문이다

현재 [TableWidget](../../src/markdownLivePreview.ts)은 alignment와 좁은 폭 가로 스크롤, escaped pipe, inline `$…$` KaTeX, strong/emphasis/strike/inline code를 처리한다. 셀 click과 Tab 이동으로 원문 편집을 지원한다. link/image/wikilink, 행·열 편집, 복잡한 inline syntax의 round-trip은 여전히 미완료다.

| ID     | 사용자 결과                                                     | 수용 기준                                                                                                                                                                                                                                                     |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TBL-01 | GFM 표의 header, body, 빈 cell, alignment가 기대한 표로 보인다. | 왼쪽/가운데/오른쪽 alignment marker를 적용하고, 긴 cell·좁은 폭에서는 문서 전체 폭을 깨지 않으면서 표를 가로 스크롤하거나 감싼다. 기본 렌더 경로는 구현했으며 수동 acceptance가 남아 있다.                                                                    |
| TBL-02 | cell 안 기본 inline Markdown이 다른 문단처럼 렌더된다.          | inline `$…$`, strong, emphasis, strike, inline code를 렌더한다. link/image/wikilink/task marker 및 nested formatting은 미완료다.                                                                                                                              |
| TBL-03 | 표 셀을 클릭해 직접 편집한다.                                   | 렌더 cell click이 원본 Markdown의 trimmed cell range에 caret을 두고 source 편집을 연다. CodeMirror DOM 회귀 테스트는 rendered cell click과 blur 뒤 source 갱신을 검증한다. Tab/Shift+Tab 이동, 표 경계 이탈, 실제 caret/scroll은 수동 acceptance가 남아 있다. |
| TBL-04 | 행과 열을 추가·삭제·이동하고 header를 바꾼다.                   | 마우스 context menu와 keyboard path가 같은 명령을 호출한다. 한 행/열만 남긴 경우, 병합된/불규칙 표의 처리 결과를 명시한다. 문서의 다른 표에는 영향이 없다.                                                                                                    |
| TBL-05 | 표 편집은 Markdown text를 보존한다.                             | escaped pipe `\\                                                                                                                                                                                                                                              | `, inline code/math의 pipe, 정렬 marker, cell 내 link alias와 embed 크기를 parse/render/serialize round-trip해 의도하지 않은 열 분리를 만들지 않는다. |
| TBL-06 | 수식은 표 안과 밖에서 같은 의미로 렌더된다.                     | table cell의 `$…$`는 inline KaTeX로 렌더한다. cell 안 `\(...\)`/display math 지원과 math pipe escaping은 미완료이며 별도 수용 기준을 정한다.                                                                                                                  |

Obsidian 표 결과를 기준으로 formatting, 내부 링크, embed, alignment, 행/열 추가·삭제를 포함한다. 표 셀 편집이 여러 방식으로 구현될 수 있으므로 원문 range ↔ cell mapping, cursor 이동, round-trip 보존을 먼저 계약하고 구현 도구는 그 뒤에 선택한다.

## P1 — TeX/LaTeX 수식

공통 parser가 inline `$…$`/`\(…\)` 문법을 인식하고 KaTeX로 preview한다. `$$…$$`/`\[…\]` display block도 source를 유지하며 KaTeX로 렌더하고, caret/selection이 식 안에 오면 원문을 보여 준다. equation environment와 실제 브라우저 visual/error acceptance는 별도로 검증해야 한다.

| ID     | 사용자 결과                                                                        | 수용 기준                                                                                                                                                |
| ------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TEX-01 | inline `$…$`, `\\(…\\)`를 문장 안에서 읽는다.                                      | escaped dollar, 통화 기호, 빈/닫히지 않은 delimiter, inline code와 fenced code는 수식으로 오인하지 않는다.                                               |
| TEX-02 | display `$$…$$`, `\\[…\\]`, 합의된 equation environment를 별도 수식 블록으로 본다. | 긴 식은 수평 넘침을 통제하고 baseline·위아래 간격이 문단과 일관된다. multiple equations와 align 환경이 편집 가능한 plain source로 유지된다.              |
| TEX-03 | 수식 안에서 caret을 움직이고 오류를 복구한다.                                      | 해당 식에 selection이 들어오면 원문 전체가 정확한 위치에 노출된다. parse/render 실패 시 원문과 오류 위치를 보존하며 다른 문서/식 렌더링은 멈추지 않는다. |
| TEX-04 | 표·callout·list 등 inline content container에서 같은 delimiter policy를 사용한다.  | 표 cell 수식은 TBL-06, code/raw HTML은 제외 규칙, nested delimiter의 우선순위를 한 공통 grammar 계약으로 유지한다.                                       |

Obsidian은 LaTeX 문법을 MathJax로 지원하고 inline/display delimiter를 문서화한다. 엔진 선택은 구현 선택으로 열어 두되 해당 문법과 실패 fallback은 엔진에 종속되지 않는 결과 계약으로 고정한다.

## P1 — Mermaid 및 diagram code block

`mermaid` fenced block은 strict security 설정의 Mermaid renderer로 preview한다. caret/selection이 block 안으로 들어가면 원문 fence와 code를 편집하고, 오류/20,000자 초과는 source로 돌아가는 action을 보여 준다. Diagram preview는 text 20,000자와 edge 300개에서 제한한다. Flowchart의 `A[제목: 설명]`처럼 콜론이 든 unquoted square label은 렌더용으로만 quote 처리한다. 저장된 Markdown source는 변경하지 않는다. 수동 acceptance에서 타입별 결과와 light/dark theme을 확인해야 한다.

| ID     | 사용자 결과                                                                                                               | 수용 기준                                                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DIA-01 | `mermaid` fenced block은 flowchart, sequence, class, state, ER, gantt 등 Mermaid가 지원하는 타입을 diagram으로 보여 준다. | strict Mermaid renderer 경로를 구현했다. 문서 내 여러 diagram의 실제 수동 mount/unmount 확인은 남아 있다.                                                                                         |
| DIA-02 | diagram 편집은 plain source를 유지한다.                                                                                   | cursor/selection이 diagram source에 오면 원문 code와 language marker를 편집한다. focus가 벗어나면 preview로 돌아가며 document text는 그대로다.                                                    |
| DIA-03 | 오류와 큰 diagram을 제어한다.                                                                                             | 해당 block만 오류와 Show source action을 표시하고 source 길이 20,000자·edge 300개 제한을 둔다. runtime/type별 visual acceptance는 남아 있다.                                                      |
| DIA-04 | Mermaid 출력은 안전하고 테마에 맞는다.                                                                                    | Mermaid `strict` 보안 설정에서 HTML label/click을 차단하고 CSS token으로 dark/light 색 및 가로 overflow를 적용한다. zoom control과 실제 테마 비교는 미완료다.                                     |
| DIA-05 | 콜론이 들어간 한국어 flowchart label을 포함한 문서를 웹 PKMS에서 연다.                                                    | 재현 문서의 graph가 SVG로 렌더된다. renderer는 unquoted square label을 렌더 전에 quote 처리하며 저장 source는 byte-for-byte 유지한다. 기존 오류 fixture에서는 “Show source” 복구 동작을 유지한다. |

Mermaid는 `mermaid` fence의 source code를 graph syntax로 렌더하는 형식을 공식 문서화한다. Mermaid 버전 변경 가능성을 감안해 Markdown 파일 호환 결과와 보안 설정을 versioned feature policy에 기록한다.

## P1 — Markdown 안의 HTML

현재 HTML block은 [HtmlBlockWidget](../../src/markdownLivePreview.ts)이 sandboxed iframe으로 보여 주며 scripts는 허용하지 않는다. 반면 inline HTML, Markdown-inside-HTML 정책, 외부 resource policy, iframe navigation은 별도 완전 계약이 없다. Obsidian은 HTML 안에서 Markdown 문법을 다시 parse하지 않는다고 명시한다.

| ID      | 사용자 결과                                             | 수용 기준                                                                                                                                                                |
| ------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HTML-01 | 표준 inline/block HTML의 정적인 읽기 결과를 볼 수 있다. | 허용 tag/attribute 목록과 block boundary를 정의한다. HTML 안 Markdown 재파싱 여부는 Obsidian과 동일하게 하지 않는 정책을 기본값으로 명시한다.                            |
| HTML-02 | 문서의 HTML은 로컬 앱과 파일을 실행할 수 없다.          | script/event handler/javascript URL/form submission/top navigation/unsolicited popup을 금지한다. iframe과 remote resource는 default deny 또는 명시된 allowlist를 따른다. |
| HTML-03 | preview와 source 편집 사이에 위치가 대응한다.           | HTML block에 caret/selection이 들어오면 원문 전체가 보이고 편집 후 iframe preview는 해당 block만 갱신된다. 렌더 실패는 source를 보존한다.                                |
| HTML-04 | sandbox lifecycle은 자원을 정리한다.                    | iframe 제거·문서 전환·빠른 연속 수정 뒤 observer/listener/remote resource가 정리되고 stale render가 현재 문서를 덮지 않는다.                                             |

HTML은 rich content를 보여 주는 기능으로 제공하되 임의 script 실행은 목표에 포함하지 않는다. sandbox flags를 넓히는 구현 변경은 보안 review와 별도 acceptance가 선행된다.

## P2 — Obsidian 문서 호환성

Obsidian Flavored Markdown은 CommonMark/GFM 위에 내부 링크, embed, block reference, footnote, comments, highlight, callouts 등을 더한다. 현재 제품은 일부 `[[wikilink]]`, standard image/link, task, 제한된 callout을 지원하지만 이 전체 집합은 아니다.

| 기능군                        | 목표 결과                                                                       | 현재 확인된 차이                                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Internal links                | `[[note]]`, alias, heading/block target을 rename 후에도 찾아 연다.              | Workspace는 `[[target                                                                                                                                                                                     | alias]]`와 파일 생성 fallback이 있으며 heading/block anchor 규칙이 없다. |
| Embeds                        | note/image/audio/video/PDF를 문서 안에서 type별 preview로 보여 준다.            | standard Markdown image는 widget으로 처리한다. `![[file]]` transclusion 및 media embed는 없다.                                                                                                            |
| Callouts                      | Obsidian callout type/title/fold marker에 따라 시각화하고 접고 편다.            | 현재 limited type set과 label replace가 있으며 folding state/action의 전체 계약이 없다.                                                                                                                   |
| Properties/frontmatter        | 문서 제목 바로 아래 `Properties` 영역에서 frontmatter를 타입별로 확인·편집한다. | 공유 editor가 문자열·날짜·숫자·checkbox·단순 목록을 표시하고 추가·편집·삭제한다. 복합 객체/중첩 YAML은 원문을 보존하며 UI에서 수정하지 않는다. YAML 주석/anchor/alias의 편집 보존은 별도 계약이 필요하다. |
| Footnotes/comments/highlights | 선택된 syntax를 본문에서 보여 주고 source와 왕복한다.                           | `[^id]`, `%%…%%`, `==…==` 전용 preview/result 계약이 없다.                                                                                                                                                |
| Block identity                | `^id` block reference가 해당 block을 안정적으로 가리킨다.                       | stable block anchor 기능이 없다.                                                                                                                                                                          |

각 row는 사용자 가치와 plain Markdown interoperability를 비교해 채택 여부를 결정한다. 채택한 기능만 source syntax, resolution, broken-reference fallback, rename/move 결과까지 재생성 가능한 spec을 가진다.

### 추가로 확인된 구현 차이

| ID        | 코드 근거                                                                                                                                                          | 관찰 결과/목표                                                                                                                                                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MD-GAP-01 | [image resolver](../../src/markdownLivePreview.ts)는 Workspace fallback에서 source document path와 root path를 함께 받는다.                                        | 완료: `./image.png`는 현재 문서 folder, `/image.png`는 workspace root, HTTP(S)는 remote resource로 해석한다. PKMS provider resolver는 인증된 asset lookup을 계속 소유한다.                                                                                                                                        |
| MD-GAP-02 | [Tree label helper](../../src/treeModel.ts)와 [title helper](../../src/markdownTitle.ts)는 지원 suffix를 일치시킨다.                                               | 완료: `.md`와 `.markdown` 모두 TreeView/editor title에서 같은 확장자 제거 규칙을 쓴다.                                                                                                                                                                                                                            |
| MD-GAP-03 | [Markdown surface](../../src/EditorMarkdownSurface.tsx)는 기본 Markdown parser와 fallback highlight를 사용하고 language-specific code extension을 선택하지 않는다. | 완료: fenced block은 CodeMirror language-data의 language/alias/extension 매칭과 shared syntax color token을 사용한다. 복사는 오른쪽 language label이 수행하며, body click은 source 편집으로 남는다. frame geometry는 두 상태에서 같은 line height·background·radius를 사용한다. 일반 코드 line number는 미완료다. |
| MD-GAP-04 | [HTML block widget](../../src/markdownLivePreview.ts)은 iframe에 CSP를 넣고 active content와 navigation 속성을 제거한다.                                           | 부분 완료: 외부 resource는 data URL만 허용하고 script/form/frame/object, event handler, link navigation을 차단한다. 높이 자동 측정을 위해 `allow-same-origin`은 남아 있어 제거 가능성을 별도 검토한다.                                                                                                            |
| MD-GAP-05 | [PKMS editor host](../../../pkms-client/src/PkmsClientApp.tsx)는 `EditorSearchButton`을 action으로 전달한다.                                                       | Workspace는 toolbar search button을 숨기고 `Cmd/Ctrl+F`를 쓰지만 PKMS Markdown chrome에는 버튼이 남아 제품 간 조작이 다르다. 검색 UI 기준을 package-level로 결정한다.                                                                                                                                             |
| MD-GAP-06 | [EditorMarkdownSurface](../../src/EditorMarkdownSurface.tsx)는 Markdown parser와 일반 fallback highlight만 설치한다.                                               | 완료: 지원 language-data에 등록된 fence는 언어별 highlight와 color token을 사용하고, 미등록 language는 plain text로 남는다. heading 및 다중행 목록 항목은 접기 gutter와 CodeMirror fold keymap으로 접고 편다. 일반 코드 line number는 미완료다.                                                                   |

## P2 — Notion의 글쓰기 상호작용 결과

Notion 문서 편집의 시각 기준은 고정된 한 덩어리 textarea가 아니라 제목과 콘텐츠 폭, block 경계, hover 시 나타나는 block controls, `/` 메뉴, drag/reorder를 통해 문서를 구성하는 결과다. 파일 포맷은 Markdown으로 유지하면서 다음의 작은 공통 결과를 단계적으로 채택한다.

| ID     | 결과                                                                                          | 범위 결정                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| NUI-01 | heading/paragraph/list/quote/code/table/image 등 block 시작점에서 block 삽입 메뉴를 호출한다. | `/` command palette와 Markdown syntax 자동 완성의 최소 집합부터 정의한다.                                                    |
| NUI-02 | block 단위 선택·이동·삭제를 키보드와 포인터로 수행한다.                                       | 문서 원문 순서를 보존하고 source selection과 block selection을 혼동하지 않는다.                                              |
| NUI-03 | 페이지 폭과 typography를 한 곳에서 바꾼다.                                                    | readable/wide, default/serif/mono, compact typography 중 채택한 항목은 title/body/table/diagram 전부에 같은 토큰을 적용한다. |
| NUI-04 | 사용자가 별도 창/패널을 열지 않고 서식/블록 action을 발견한다.                                | hover toolbar가 문서 내용을 덮지 않고 keyboard focus에서도 같은 동작에 접근 가능하다.                                        |

Notion 데이터베이스 block, 협업 presence, access control, page discussion은 PKMS domain과 별도다. 이 문서는 기존 파일 편집 흐름 안의 writing interaction 결과만 정의한다.

## 적용 순서와 완료 기준

| 순서 | Slice                         | 선행 조건 | 완료 결과                                                                                                |
| ---- | ----------------------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| 0    | Explorer state & viewport     | 별도      | 재열기/선택/refresh/resize 수용 시나리오에서 open 상태와 scroll 상태가 유지된다.                         |
| 1    | Document frame/title/width    | 별도      | title filename, breadcrumb, 본문 column의 정렬·폭 규칙이 한 spec에 일치한다.                             |
| 2    | Markdown compatibility ledger | 0–1       | CommonMark/GFM/Obsidian syntax별 지원·미지원·fallback이 명시되고 미지원 표시는 원문을 보존한다.          |
| 3    | Table data/render/edit        | 2         | inline Markdown, alignment, direct edit, row/column action, pipe escaping, source round-trip을 만족한다. |
| 4    | Math pipeline                 | 2–3       | inline/display/table TeX와 오류·selection·fallback을 만족한다.                                           |
| 5    | Diagram pipeline              | 2         | Mermaid source edit/preview/error/theme/security/size 동작을 만족한다.                                   |
| 6    | HTML safety/rendering         | 2         | 허용 문법, source mapping, CSP/sandbox/resource, failure recovery를 만족한다.                            |
| 7    | Obsidian/Notion extensions    | 2–6       | 채택한 기능만 링크·embed·metadata·block 조작 계약과 함께 들어간다.                                       |

각 slice는 실제 파일 예제에서 저장 전/후 원문이 의도치 않게 바뀌지 않는지, preview와 source selection이 맞물리는지, pane 분할과 크기 조정 중 문서/Explorer 위치가 유지되는지 확인해야 완료다. typecheck, source digest, 스크린샷만으로 렌더링 acceptance를 완료 처리하지 않는다.

## 현재 코드에서 확인한 핵심 근거

- 제목은 [markdownTitleFor](../../src/markdownTitle.ts)에서 파일 basename으로 계산하고 [EditorMarkdownTitle](../../src/EditorMarkdownTitle.tsx)에서 표시/rename 입력을 전환한다.
- 본문 폭은 [themes.ts](../../src/themes.ts)의 `.cm-content` max-width 820px에 있지만 title은 [markdownDocument.css](../../src/markdownDocument.css)에서 별도 전체 폭 규칙을 쓴다.
- 표는 [markdownLivePreview.ts](../../src/markdownLivePreview.ts)의 `TableWidget`이 alignment·column sizing·escaped pipe·inline math·기본 inline formatting을 렌더하고 source cell click/Tab navigation을 제공한다. link/image/wikilink와 행·열 조작은 구현하지 않았다.
- Mermaid fenced block과 inline/display TeX는 각각 strict Mermaid renderer와 KaTeX로 preview한다. 각 renderer의 제한과 미완료 acceptance는 위 ID별 표를 따른다.
- HTML block은 iframe widget으로 렌더되며 script 실행은 허용하지 않는다. allowlist/CSP/resource origin 계약은 이 spec에서 정해야 한다.
- Explorer는 [WorkspaceExplorerSidebar](../../../../apps/workspace-app/src/renderer/src/components/WorkspaceExplorerSidebar.tsx), [TreeView](../../../../apps/workspace-app/src/renderer/src/components/TreeView.tsx), [explorer state](../../../../apps/workspace-app/src/renderer/src/explorer/explorerState.ts), [PaneGroup](../../../../apps/workspace-app/src/renderer/src/panes/PaneGroup.tsx)이 협력한다. open state는 pane group에, tree selection/scroll anchor는 tree state에 둔다. active file 선택은 viewport를 움직이지 않고 `Cmd/Ctrl+Shift+E`만 명시 reveal한다. scroll 복원은 준비가 끝나고 tree가 실제 표시된 뒤 저장 상태를 적용하며, 복원 전 임시 scroll event는 저장하지 않는다. 실제 UI 수용 확인은 남아 있다.

## 기준 자료

- [Obsidian: Views and editing mode](https://obsidian.md/help/edit-and-read)
- [Obsidian: Obsidian Flavored Markdown](https://obsidian.md/help/obsidian-flavored-markdown)
- [Obsidian: Advanced formatting syntax — tables, diagrams, math](https://obsidian.md/help/advanced-syntax)
- [Obsidian: Editor settings](https://obsidian.md/help/settings)
- [Notion: Writing and editing basics](https://www.notion.com/help/writing-and-editing-basics)
- [Notion: Code blocks](https://www.notion.com/help/code-blocks)
- [Notion: Math equations](https://www.notion.com/en-us/help/math-equations)
- [Notion: Style and customize your page](https://www.notion.com/help/customize-and-style-your-content)
- [VS Code: User interface and Explorer](https://code.visualstudio.com/docs/editing/getting-started/userinterface)
- [Zed: Project Panel](https://zed.dev/docs/project-panel)
- [GitHub Flavored Markdown spec](https://github.github.com/gfm/)
- [Mermaid syntax reference](https://mermaid.js.org/intro/syntax-reference)
- [KaTeX auto-render delimiters](https://katex.org/docs/autorender)
