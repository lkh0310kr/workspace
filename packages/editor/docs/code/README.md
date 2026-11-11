# Text surface와 code editor 스펙

[EditorTextSurface](../../src/EditorTextSurface.tsx)는 Markdown과 code에서 공유하는 유일한 CodeMirror view 소유자다. Desktop의 모드별 extension과 저장은 [EditorContent](../../../../apps/workspace-app/src/renderer/src/panes/EditorContent.tsx)가 조정한다.

## Surface 입력과 수명

입력은 `value?`, `session?`, `initialValue?`, 필수 `extensions`, `documentKey?`, `viewStateStorage?`, `onDocumentKeyChange?`, className/ariaLabel/spellcheck/autocapitalize와 onChange/onSessionError/onViewReady/onSearchPanelChange 콜백이다. 본문 우선순위는 초기 생성에서 session text → initialValue → value → 빈 문자열, 이후 갱신에서 session text → value다. asset snapshot을 text로 변환하지 않는다.

mount 시 history, 공통 검색, host extensions, default/history keymap, Tab indent, lineWrapping을 조합하고 view를 한 번 생성한다. extension prop 변경만으로 view를 재생성하지 않는다. 모드 변경은 host React key를 변경하거나 Compartment를 reconfigure한다. cleanup은 scroll listener 해제, cache 즉시 기록, onViewReady(null), view.destroy 순서다.

사용자 docChanged에서 `externalEditorChange` annotation이 있으면 provider 쓰기와 onChange를 건너뛴다. 그렇지 않으면 현재 snapshot revision으로 session.replaceText를 호출하고 즉시 session.snapshot을 다시 읽는다. 오류는 onSessionError에 전달한다. 읽기 전용 session에는 쓰지 않지만 이것만으로 DOM 입력이 차단되는 것은 아니다. readOnly UI는 host extension 책임이다.

## 외부 snapshot과 문서 교체

[codeMirror.ts](../../src/codeMirror.ts)의 replacement 규칙:

1. 기존 text와 새 text가 같으면 transaction을 만들지 않는다.
2. UTF-16 단위 공통 prefix와 suffix를 구해 중간 부분만 교체한다.
3. `Transaction.addToHistory(false)`와 선택적 external annotation을 붙인다. 기존 selection을 change mapping으로 이동시키며 외부 변경을 local undo에 넣지 않는다.
4. 동일 identity의 snapshot 변경은 이 transaction으로 적용한다.
5. documentKey 변경 시 먼저 이전 상태를 저장한다. onDocumentKeyChange가 같은 문서의 identity 확정임을 인정할 때만 cache를 새 key로 이동한다. 새 key cache를 restore하고 target 본문과 reconcile한 뒤 setState한다. cache가 없으면 새 state를 만들고 scroll=0이다.

## View state cache

근거: [viewStateCache.ts](../../src/viewStateCache.ts), [documentDirtyRegistry.ts](../../src/documentDirtyRegistry.ts).

| 항목 | 값/규칙 |
|---|---|
| key | `${providerId}:${itemId}`; 미확정 identity의 임시 key는 host 책임 |
| 상태 | serialized EditorState(history 포함), doc, scrollTop/Left, touchedAt, persistable |
| 메모리 | 최대 64개; 초과 시 touchedAt이 가장 오래된 것 제거 |
| storage | host가 adapter 주입할 때만 사용. `editor:view-state:${encodeURIComponent(key)}` |
| 이전 key | `workspace:editor-view-state:`에서 읽고 새 prefix로 best-effort 이동 |
| 영속 한도 | 24개, serialized JSON 문자열 길이 40,000 초과는 storage에서 제거 |
| 기록 시점 | doc/selection/scroll 변경 후 700ms debounce; unmount·key 변경·clean snapshot은 즉시 |
| 미저장 내용 | 메모리에는 기록, session이 clean일 때만 storage 기록. session이 없으면 기록 가능 |
| 장애 | JSON 손상/fromJSON 실패는 복원 포기, storage quota/비활성은 메모리로 계속 동작 |

읽기 시 메모리를 우선하고 touchedAt을 갱신한다. discard는 메모리 key를 즉시 삭제한 뒤 setTimeout(0)에서도 지워 unmount의 마지막 dirty 기록을 제거한다. 영속 cache 전체를 삭제하는 명령은 아니다.

## Desktop code 모드

code extension은 lineNumbers, highlightActiveLineGutter, foldGutter, bracketMatching, closeBrackets, autocompletion, indentOnInput, syntaxTheme이다. 공통으로 4칸 indent, 다중 selection, drawSelection, indent guides, Alt-click selection을 사용한다. `Mod-/`는 toggleComment, `Mod-Shift-v`는 plain paste이며 close-bracket/completion/fold keymap도 포함한다. font size CSS 변수는 `13 * zoom` px다.

파일명으로 `LanguageDescription.matchFilename(languageData,filePath)`를 찾고 provider의 codeLanguages가 허용할 때 비동기로 load한다. 없거나 미지원이면 빈 extension. 늦게 완료된 이전 load가 새 view에 적용되지 않도록 cancelled flag와 view identity를 확인한다. 언어 extension만 Compartment로 교체한다. LSP·프로젝트 진단·format-on-save 계약은 현재 없다.

## Desktop load와 save

[로컬 provider](../../../../apps/workspace-app/docs/editor/providers.md)의 save가 실제 쓰기를 한다. host는 다음 순서를 지킨다.

- 로딩마다 AbortController와 증가하는 sequence를 쓴다. 경로→provider item→session 순으로 resolve한다. 완료 시 sequence와 현재 path가 다르면 session을 닫는다. 아직 view가 준비되지 않았으면 최대 12 animation frame에서 시작을 재시도한다.
- text snapshot을 view에 적용할 때 provider edit/dirty 피드백을 억제한다. jumpToLine이 있으면 해당 line 시작으로 이동하고 소비 콜백을 호출한다. 이미 로드된 파일의 후속 jump도 지원한다.
- 사용자 편집은 host editRevision을 증가시키고 dirty=true로 만든다. 자동 저장이 켜져 있고 path가 있으며 rename 중이 아닐 때 600ms debounce한다. untitled는 자동 저장하지 않는다.
- `Mod-s`는 현재 focused editor view에만 적용한다. 자동 저장 timer를 취소하고 saveActiveFile을 실행한다. path rename 중에는 저장 shortcut을 실행하지 않는다.
- saveNow는 실패한 이전 작업에 막히지 않는 promise queue로 직렬화한다. session이 대상 path와 같으면 save한다. 없으면 item resolve 또는 create 후 open하고 현재 text를 replaceText한 뒤 save한다.
- untitled 최초 저장은 root의 directory를 제외한 파일명을 case-insensitive 비교해 untitled.md, untitled 1.md, untitled 2.md 순으로 정해 저장하고 onAssignPath한다. 성공 직후 dirty를 지울 때 view, path, editRevision이 아직 같은지 확인한다. 저장 중 추가 입력을 saved로 잘못 표시하지 않는다.
- 오류는 saveError로 표시한다. 자동 저장이 꺼졌거나 오류가 있을 때 save 상태 badge를 표시한다. 현재 Desktop host는 공통 phase 전체 대신 saveError/dirty를 조합해 label을 만든다.

## 검증 시나리오

| ID | 입력/행동 | 결과 |
|---|---|---|
| TEXT-01 | 외부 snapshot 교체 후 undo | 외부 교체 transaction 자체가 undo 항목이 아님 |
| TEXT-02 | A/B key를 교대로 선택 | 각 선택·scroll·undo 복원, 본문은 provider와 reconcile |
| TEXT-03 | dirty snapshot 후 재시작 | 미저장 text를 storage에서 새 문서로 부활시키지 않음 |
| TEXT-04 | 언어 A load가 B 전환 후 완료 | A extension 적용하지 않음 |
| TEXT-05 | 저장 대기 중 입력 | 완료가 최신 입력의 dirty를 지우지 않음 |
| TEXT-06 | storage 차단 또는 손상 | Editor 정상 생성, 메모리 cache 사용 |
| TEXT-07 | 두 editor 중 하나 focus하고 Mod-s | focused view만 저장 |

자동 검증 연결은 [스펙 검증 목록](../../../../docs/architecture/spec-driven-development.md)을 따른다. 표의 모든 항목에 현재 자동 테스트가 있다는 의미는 아니다.
