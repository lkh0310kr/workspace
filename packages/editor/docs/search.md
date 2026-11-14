# Editor 검색 스펙

문서 안 Find/Replace, provider 이름 검색 Quick Open, Desktop 파일 내용 검색은 별도 경로다. 하나의 검색 상태나 결과 모델로 합치지 않는다.

## 문서 안 Find/Replace

근거: [editorSearch.ts](../src/editorSearch.ts). 공통 TextSurface에 항상 포함한다. CodeMirror search 확장이 매칭·highlight·이동·치환을 담당하고 custom top panel이 UI를 제공한다.

Mod-f는 열기/닫기 toggle, Mod-d는 다음 occurrence 선택이다. Find Enter/Shift-Enter는 다음/이전 match, Escape는 panel을 닫는다. replace Enter는 replaceNext다. Match Case, Whole Word, RegExp 버튼은 query의 해당 boolean만 반전하고 입력으로 focus를 돌린다. 버튼 mousedown의 default를 막아 입력 blur를 방지한다. 제목의 Alt+C/W/R 표시만으로 별도 custom handler 구현을 추정하지 않는다.

query/본문/selection이 바뀌면 count를 다시 계산한다. 비어 있는 query는 label을 비운다. invalid 또는 일치 없음은 `No results`. 현재 selection이 match와 정확히 같을 때 `n of total`, 아니면 total만 표시한다. 999번째 match에서 스캔을 중단하고 `999+`로 표시한다. 따라서 정확히 999개여도 +가 붙는다. panel 상태는 onSearchPanelChange로 host에 알린다.

## Provider 검색 타입

`EditorSearchOptions`는 target=`names | contents`, caseSensitive, regex, wholeWord, 선택적 fuzzy와 limit이다. 결과는 item과 선택적 line/column/preview/matches를 가진다. 각 match는 line/column/preview/ranges이며 ranges는 UTF-16 start/end다. local contents는 1-based line/column을 반환한다. query 이름 검색과 파일 내용 치환의 word boundary는 adapter별 차이가 있다.

## Quick Open

근거: [useEditorQuickOpenSearch.ts](../src/useEditorQuickOpenSearch.ts), [fuzzySearch.ts](../src/fuzzySearch.ts), [EditorQuickOpenDialog.tsx](../src/EditorQuickOpenDialog.tsx).

provider/enabled/names capability가 있어야 검색한다. query·provider·limit이 바뀔 때 AbortController를 새로 만들고 이전 요청을 취소한다. 옵션은 target=names, caseSensitive=false, regex=false, wholeWord=false, fuzzy=true다. 결과 item 목록을 dialog에 공급한다. 응답이 아직 현재 query와 일치하지 않으면 이전 결과 대신 items=[], loading=true다. 비활성·미지원은 [], false, null. 취소 오류는 표시하지 않고 다른 오류는 message를 표시한다. hook 자체에는 debounce가 없다.

local provider는 fs.listAllFiles의 전체 path로 fuzzy 검색, 기본 limit=100이다. PKMS는 loadedFiles의 folder 제외 목록으로 검색하며 기본 limit=MAX_SAFE_INTEGER다. 공통 fuzzy 구현은 소문자 text/query에서 연속 포함의 시작 index를 score로 사용한다. 연속 포함이 없으면 query 글자를 순서대로 탐색해 subsequence가 존재할 때 `1000 + (lastIndex - firstIndex) + firstIndex`, 없으면 제외한다. score 오름차순, 동점은 입력 순서, limit만큼 반환한다. query.trim()이 비면 입력 앞 limit개를 반환한다.

Quick Open dialog는 document.body portal이며 mount 시 input focus, query 또는 결과 ID 배열 변경 시 선택 index=0이다. Up/Down은 양끝 clamp, Enter는 loading이 아니고 선택 item이 있을 때 onSelect(id), Escape와 backdrop click은 onClose다. hover는 선택 index를 바꾸고 선택 행을 nearest scrollIntoView한다. error→loading→empty→결과 순으로 UI 우선순위를 적용한다.

## Desktop 파일 내용 검색과 치환

근거: [localEditorProvider.ts](../../../apps/workspace-app/src/renderer/src/editor/localEditorProvider.ts).

내용 검색은 UUID requestId를 만들고 onSearchResult/onSearchDone을 등록한 뒤 searchInFiles를 요청한다. 자신의 requestId만 받아 path별 마지막 결과를 Map에 축적하고 onResult로 stream한다. 완료 시 최종 배열 반환, 오류 시 reject한다. abort는 cancelSearch(requestId)를 보내며 모든 listener를 해제하고 AbortError로 종료한다. 빈 contents query는 []다.

replaceContents는 provider ID/path를 검증하고 해당 파일의 열린 session이 clean이 아니면 false다. disk를 재읽고 현재 match 개수가 expectedMatchCount와 다르면 false. 일치하면 JS replace를 수행하고 실제 변경이 있을 때만 writeFileIfUnchanged(current,next)로 기록한다. 비교 실패는 false, 변경이 없으면 true다. 검색 결과가 최신 본문이라는 보장은 match count 재검사와 조건부 쓰기의 조합으로 제공한다.

현재 local 이름 검색의 wholeWord는 Unicode letter/number/underscore 경계를 사용하지만 replaceRegex는 `\b`를 쓴다. 두 경계 판정은 동등하지 않다. 대체 문자열의 capture 치환은 JS String.replace 규칙이다.

## 검증 시나리오

| ID        | 행동                         | 결과                                 |
| --------- | ---------------------------- | ------------------------------------ |
| SEARCH-01 | Mod-f 두 번                  | panel 열림→닫힘                      |
| SEARCH-02 | 999 match                    | count=999+                           |
| SEARCH-03 | query A→B, A가 늦게 완료     | A 결과 표시하지 않음                 |
| SEARCH-04 | search 중 취소               | IPC 취소와 result/done listener 정리 |
| SEARCH-05 | 검색 후 disk match 개수 변경 | replace=false, 쓰기 없음             |
| SEARCH-06 | 검색 후 열린 session dirty   | replace=false                        |
| SEARCH-07 | 이름 검색 미지원 provider    | Quick Open 요청하지 않고 빈 상태     |

문서 search panel과 Quick Open의 DOM 키보드 동작은 현재 자동 테스트로 전부 검증되지 않았다. 재구현 시 위 시나리오를 수락 기준으로 사용한다.
