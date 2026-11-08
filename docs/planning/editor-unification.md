# Editor 통합 스펙

## 목표

PKMS와 Workspace가 `packages/editor`의 공통 편집기를 사용한다. 파일 탐색, 열린 문서, 편집기, 목차, quick open, 검색 UI와 편집 상호작용을 공유하고, 로컬 파일과 PKMS 저장소의 읽기·쓰기·협업은 각 문서 provider가 담당한다.

통합 기준은 제품 이름이 아니라 문서 소스다. 같은 공통 편집기가 로컬 파일과 PKMS 문서를 열 수 있지만, 파일 권한이나 PKMS 인증을 공통 UI 패키지에 옮기지 않는다.

## 제품 동작 스펙

| 영역 | 공통 동작 | Workspace provider | PKMS provider |
|---|---|---|---|
| 파일 트리 | 확장/선택/키보드 탐색, 선택한 문서 열기, 선택 상태 표시 | 로컬 디렉터리 지연 로드, 파일 변경 감시, 다중 선택과 파일시스템 작업 | 저장소 디렉터리와 파일 조회, 원격 변경 및 캐시 반영 |
| 문서 탭 | 문서 식별, 활성화, 닫기 전 dirty 확인, dirty 표시, 문서별 편집 상태 유지 | pane group 안에서 code, Markdown, 지원하는 파일 viewer 열기 | PKMS 문서를 여러 탭으로 열기. 기존 뒤로/앞으로는 문서 탐색 이력으로 유지 |
| 텍스트 편집 | 공통 키 입력, 선택/undo, 저장 명령, 문서 내 Find/Replace, outline, 테마 토큰 | Markdown과 일반 코드 편집, 언어 감지, 자동 저장, 로컬 파일 충돌 표시 | Markdown 편집, 협업 상태, 로컬 캐시와 서버 저장 상태 표시 |
| Markdown | 공통 Markdown 문법, 실시간 미리보기, task/table, 링크, 목차 동작 | 로컬 이미지와 Workspace 위키 링크 해석, callout 포함 Workspace 확장 | PKMS 자산 링크 해석, PKMS 링크 규칙과 task/table 지원 |
| 파일 작업 | 트리·검색 결과에서 열기, capability가 있는 작업의 공통 확인/오류 표시 | 파일 생성·폴더 생성·rename·move·delete·로컬 검색/치환 | 저장소 생성·rename·move·delete, 로드된 저장소 목록에서 이름 검색 |
| 저장 상태 | `clean`, `dirty`, `saving`, `conflict`, `error`의 공통 상태와 메시지 표시 | clean은 디스크에 기록됨을 뜻함 | clean은 PKMS 서버에 기록됨을 뜻함. GitHub 반영은 별도 동기화 상태로 표시 |

PKMS는 일반 코드 파일 편집과 파일 내용 검색/치환을 현재 제공하지 않는다. 현재 PKMS quick open은 이미 로드한 저장소 파일 목록에서 이름을 찾는다. Workspace의 다중 파일 검색·치환은 PKMS가 같은 검색 capability를 제공하기 전까지 Workspace provider 전용으로 유지한다. PKMS의 협업/오프라인 상태와 Workspace의 파일 watcher/외부 수정 충돌은 공통 UI 상태 모델에 매핑하되 각각의 원인과 복구 동작은 provider가 소유한다.

## 패키지와 소유권

```text
packages/editor/                 # 공통 편집기, CodeMirror 표면, Markdown 기능, tree/search UI
packages/pkms-client/            # PKMS 계정/저장소 진입 UI, PKMS provider, Web/Desktop transport
apps/workspace-app/              # 로컬 파일 provider, Electron 권한/IPC, pane 배치와 Workspace 설정
apps/pkms-web/                   # PKMS 웹 진입점과 세션 경계
```

`packages/editor`는 React와 CodeMirror 기반 UI 및 문서 provider 계약만 의존한다. Electron, 파일시스템 권한, PKMS API·token·Yjs 세션을 직접 참조하지 않는다. 제품 앱은 공통 편집기를 기존 앱 구조에 조립하고 제품 설정과 테마 토큰을 전달한다.

공통 패키지는 편집 화면의 뼈대와 상호작용을 소유한다. Workspace pane 분할과 배치, PKMS 계정 로그인·저장소 선택, 각 provider의 저장·충돌·협업 정책은 제품/adapter 책임으로 남긴다.

## Provider 계약

모든 트리 항목과 문서는 provider ID와 provider 내부의 안정적인 ID로 식별한다. 경로는 표시·탐색 주소이며 rename/move 때 바뀔 수 있으므로 열린 문서의 identity로 사용하지 않는다.

```ts
type EditorItemKind = "directory" | "markdown" | "code" | "asset";
type EditorOperation = "createFile" | "createDirectory" | "rename" | "move" | "delete";
type EditorSavePhase = "clean" | "dirty" | "saving" | "conflict" | "error";
type EditorSyncPhase = "idle" | "pending" | "synced" | "blocked";
type EditorProviderErrorCode = "notFound" | "readOnly" | "conflict" | "offline" | "unauthorized" | "unsupported" | "unknown";

interface EditorItemRef {
  providerId: string;
  itemId: string;
}

interface EditorTreeItem extends EditorItemRef {
  parentId: string | null;
  name: string;
  path: string;
  kind: EditorItemKind;
  readOnly: boolean;
}

interface EditorProviderCapabilities {
  operations: ReadonlySet<EditorOperation>;
  searchNames: boolean;
  searchContents: boolean;
  replaceContents: boolean;
  multiSelect: boolean;
  dragMove: boolean;
  codeLanguages: ReadonlySet<string>;
  collaborativeDocuments: boolean;
}

interface EditorSearchOptions {
  target: "names" | "contents";
  caseSensitive: boolean;
  regex: boolean;
  wholeWord: boolean;
}

interface EditorSearchResult {
  item: EditorTreeItem;
  matches?: readonly {
    line: number;
    column: number;
    preview: string;
    /** UTF-16 string offsets for editor/display slicing. */
    ranges: readonly { start: number; end: number }[];
  }[];
}

interface EditorProvider {
  readonly id: string;
  readonly capabilities: EditorProviderCapabilities;
  listChildren(parentId: string | null, signal?: AbortSignal): Promise<EditorTreeItem[]>;
  subscribeTree(listener: (changedParentIds: readonly string[]) => void): () => void;
  openDocument(item: EditorItemRef, signal?: AbortSignal): Promise<EditorDocumentSession>;
  search(query: string, options: EditorSearchOptions, signal?: AbortSignal, onResult?: (result: EditorSearchResult) => void): Promise<EditorSearchResult[]>;
  replaceContents?(item: EditorItemRef, query: string, replacement: string, options: Omit<EditorSearchOptions, "target">, expectedMatchCount: number): Promise<boolean>;
  create?(parentId: string | null, kind: "file" | "directory", name: string): Promise<EditorTreeItem>;
  rename?(item: EditorItemRef, name: string): Promise<EditorTreeItem>;
  move?(items: readonly EditorItemRef[], parentId: string | null): Promise<void>;
  delete?(items: readonly EditorItemRef[]): Promise<void>;
}

interface EditorDocumentSnapshot {
  content:
    | { type: "text"; text: string }
    | { type: "asset"; previewUrl: string; mediaType: string };
  revision: string;
  savePhase: EditorSavePhase;
  message?: string;
  syncPhase?: EditorSyncPhase;
}

interface EditorDocumentSession {
  readonly item: EditorTreeItem;
  readonly readOnly: boolean;
  snapshot(): EditorDocumentSnapshot;
  subscribe(listener: (snapshot: EditorDocumentSnapshot) => void): () => void;
  replaceText(text: string, baseRevision: string): Promise<void>;
  save(options?: { flushSync?: boolean }): Promise<EditorDocumentSnapshot>;
  close(): Promise<void>;
}
```

계약 규칙은 다음과 같다.

- `itemId` stays stable across rename and move. `parentId: null` identifies the provider root; all other parent IDs are provider item IDs. A provider emits tree invalidations and updated metadata; the shared editor updates labels and tree position without reopening or discarding the editor session.
- `revision` is opaque to the shared editor. The provider checks or reconciles it when accepting edits; it reports an external-edit conflict rather than silently overwriting newer content.
- `replaceText` reports local editor edits to the provider. Provider snapshots report remote or external changes back to the shared editor. Implementations suppress echo updates and preserve selection/undo state when applying snapshots.
- `save()` flushes pending durable writes. `flushSync: false` permits secondary mirrors to remain pending. For PKMS, server persistence and GitHub mirroring are distinct: `savePhase: clean` confirms server persistence, while `syncPhase` reports mirror progress. For Workspace, `clean` confirms the local file write.
- Save or operation failures use `EditorProviderError` with a user-safe message and stable `EditorProviderErrorCode`. The provider owns recovery and retry rules; shared UI may branch on the code without parsing product-specific text.
- Optional operations are callable only when declared in `capabilities`; the UI hides unsupported commands and does not infer support from product name.
- `close()` releases subscriptions, realtime resources, and pending provider work. The shared editor asks before closing a dirty session unless the provider reports that all edits are durable.

`previewUrl`은 provider가 수명을 관리하는 임시 URL일 수 있다. 공통 편집기는 문서 세션이 닫힐 때 asset preview도 해제한다. `asset` 문서는 읽기 전용 세션이며 `replaceText`를 제공하지 않는다.

공용 Editor는 CodeMirror 인스턴스를 만들고 공통 명령, 문법 UI, Markdown 미리보기, 목차, 선택, 포커스 수명을 소유한다. 문서 세션은 `replaceText`와 snapshot으로 협업·저장 동기화를 제공하며 CodeMirror extension을 주입하지 않는다. Provider가 편집 UI를 교체하거나 공통 키 동작을 조용히 바꾸지는 않는다.

여기서 **공통 편집기**는 단일 root React 컴포넌트나 제품 shell이 아니라 `packages/editor`의 UI와 기능 집합을 뜻한다. 공통 패키지는 편집 surface·Markdown 동작·outline·트리 알고리즘과 재사용 UI를 소유한다. 열린 문서의 membership과 active document는 host가 소유한다. Workspace는 pane/tabset 모델에, PKMS는 workspace별 document tab 모델에 연결한다. `EditorDocumentTabBar`는 재사용 가능한 표시 UI이며 두 제품의 tab state를 강제로 같은 모델로 바꾸지 않는다. 문서별 커서·스크롤·선택·undo 이력은 안정적인 provider item identity로 공통 저장 기능을 사용하고 상태 저장 키/저장소는 host가 전달한다. 트리 확장·선택·스크롤의 보존 키도 host가 전달한다. PKMS에서 뒤로/앞으로는 열린 탭을 대신하지 않고 기존 문서 탐색 이력을 이동한다.

## Acceptance and migration order

통합 완료 조건은 PKMS Web/Desktop과 Workspace가 같은 공통 편집기와 provider 계약을 사용하고, 표에 적힌 제품별 동작을 유지하는 것이다. 문서를 전환해도 각 문서의 커서·스크롤·선택·undo 이력이 보존되어야 한다. 원격 또는 로컬 변경이 저장하지 않은 편집 내용을 조용히 덮어쓰면 안 된다.

Migrate in this order:

1. Extract the common CodeMirror surface, Markdown extensions, outline, and command definitions into `packages/editor`. Match the current Workspace and PKMS feature sets before consolidating duplicate behavior.
2. Move the Workspace local tree and document I/O behind `EditorProvider`. Keep Electron IPC and filesystem permission checks in `apps/workspace-app`.
3. Move PKMS document/tree operations behind the same provider contract. Keep login, repository selection, API transport, Yjs, cache, and GitHub status in `packages/pkms-client`.
4. Replace duplicated editor surfaces and interactions with shared Editor components. Each host composes them into its existing navigation model: retain the current Workspace pane layout and PKMS web navigation shell/document tabs.
5. Verify each acceptance item against both providers before removing old UI implementations.

PKMS와 Workspace의 인증, 저장소, 배포, 파일시스템 권한, 백엔드 서비스, iOS 네이티브 편집기는 통합 범위에 넣지 않는다. 사용자가 조작하는 Editor 환경을 통일하면서 데이터와 보안 경계는 유지한다.

## 구현 상태

화면과 조작 기준은 **Workspace Editor**다. 공통 편집기 UI는 Workspace의 밀도, 탐색, Markdown 편집 흐름을 따른다. PKMS의 로그인·저장소 선택·협업·동기화 표시는 PKMS shell에 남고, 그 안의 편집기와 트리는 `packages/editor`의 공통 UI로 교체한다.

| 영역 | 상태 | 현재 근거 / 남은 일 |
|---|---|---|
| Provider 계약과 Workspace·PKMS adapter | in progress | `packages/editor/src/provider.ts`와 두 adapter가 트리·문서·검색·작업 capability를 사용한다. 공통 CodeMirror 표면이 편집 내용을 session `replaceText`로 전달하고, Workspace EditorContent·TreeView의 경로 조회, 문서 생성·저장, rename은 provider를 경유한다. 공통 lazy-tree path resolver를 추가해 Workspace가 경로→항목 조회에 사용한다. Workspace Find/Replace가 `search`·`replaceContents`로 adapter를 경유한다. PKMS adapter는 content를 가져오지 않는 metadata endpoint에서 안정 file ID를 조회해 접힌/미로드 branch의 문서도 열고, PKMS tree 생성 UI도 parent path를 공통 lazy-tree resolver로 ID에 매핑하고 parent ID를 검증해 cache miss를 root 생성으로 바꾸지 않는다. toolbar·tree·문서 제목 rename은 provider를 경유하고, rename 대상도 안정 ID로 서버에서 조회한다. PKMS move/delete도 모든 source와 destination을 안정 ID로 조회하며 cache miss를 무시하지 않는다. PKMS move 목적지도 provider의 lazy-tree path resolver로 안정 ID를 찾고, 잘못된 경로가 root 이동으로 바뀌지 않게 검증한다. PKMS rename/move 뒤에는 열린 session의 `item` metadata를 안정 ID로 다시 조회해 갱신하되, 오프라인 큐 작업에서 서버가 반환한 이전 경로로 낙관적 로컬 경로를 되돌리지 않는다. 파일 작업 hook이 rename/move 성공 여부를 반환하고 PKMS provider가 실패 결과를 구조화 오류로 돌려, 실패한 작업이 성공으로 처리되거나 session metadata를 갱신하지 않게 한다. Workspace move/delete도 provider ID·item ID의 stale/mismatched 값을 조용히 건너뛰지 않고, batch 삭제·이동 전에 원본 항목을 확인하며, move destination이 실제 디렉터리인지 검증한다. 중복 선택된 상위 폴더와 하위 항목은 한 번만 처리한다. PKMS tree 삭제는 영향받는 열린 문서의 dirty 상태를 확인하고 삭제 성공 시 탭·Yjs session·메모리 view snapshot을 정리한다. 공통 tab-ID dirty registry가 탭 버튼과 전역 닫기 단축키를 보호하고, 파일 삭제는 열린 dirty 문서 확인 후 수행한다. Workspace 저장과 Find/Replace는 main-process compare-and-write로 stale disk 내용을 덮어쓰지 않으며, watcher 변경은 저장 중 기록한 내용과 비교해 자체 저장 알림과 외부 충돌을 구분한다. PKMS Yjs 세션은 저장 요청을 직렬화해 autosave와 Cmd+S 결과 경합을 막고, 원격 변경 시 mirror 상태를 pending으로 갱신한다. `EditorProviderError`와 공통 코드를 추가해 두 provider의 not-found·read-only·conflict 오류를 구조화하고, provider 경계가 미분류 비동기 예외를 작업별 안전 메시지의 `unknown` 오류로 변환하며 AbortError는 보존한다. 문서 열기의 AbortSignal을 Workspace·PKMS 경로에 연결하고 취소된 세션을 닫으며, 취소를 사용자 오류로 표시하지 않는다. 오래된 open 요청의 실패가 Workspace 오류나 PKMS의 현재 hydration 상태를 덮어쓰지 않도록 차단한다. 오류 표시와 open/cancel race의 양쪽 acceptance 확인이 필요하다. |
| 공통 CodeMirror 표면 | done (implemented) | 두 앱의 Markdown 편집기는 `EditorMarkdownSurface`, Workspace의 일반 코드 편집기는 `EditorTextSurface`를 provider session과 함께 사용한다. 공통 history, keymap, provider snapshot 반영, 편집 변경의 `replaceText` 전달을 소유한다. Markdown 표면은 공통 parser·syntax highlighting·theme·outline 갱신과 문서 내 Find/Replace를 항상 적용하고, Workspace host는 WikiLink parser와 제품별 링크 확장을 추가한다. PKMS는 Markdown과 asset만 제공한다. 편집기 주변 레이아웃과 host 조립은 계속 통합 중이다. |
| Markdown 문서 프레임 | in progress | 두 앱이 `EditorMarkdownDocument`의 공통 제목·floating actions·스크롤 가능한 문서 본문·outline 버튼/목록/이동 구조와 `EditorMarkdownTitle` 표시/편집 전환을 사용한다. 제목 표시와 inline rename 입력, 키 처리·오류 접근성·표시를 공통화했고, 경로 충돌 검사와 실제 rename 정책은 각 provider host가 소유한다. 빈 영역 클릭 판별은 공통 frame이 편집기·제목 내부 클릭을 제외하고, 두 host가 같은 문서 끝 focus 동작을 연결한다. 저장 단계(`clean`, `dirty`, `saving`, `conflict`, `error`)의 사용자 라벨은 공통 helper를 사용하고, host가 제공하는 제품별 동기화 메시지와 status chrome은 host 책임으로 남아 있다. |
| 문서별 편집 상태 | in progress | Workspace의 path→item ID 매핑은 재시작 뒤에도 복원되고 두 provider 모두 rename/move 중 item ID를 유지한다. CodeMirror 커서·선택·scroll·undo 상태는 provider clean 시 안정 identity 키로 저장하고, 24개 persisted LRU·문서별 40,000자 제한 안에서 재시작 뒤 복원한다. 임시 경로 키가 provider의 안정 identity로 확정되는 동일 문서 전환은 host가 명시해 메모리 또는 저장소에만 남은 캐시 상태를 새 키로 옮긴다. 캐시된 본문은 mount와 문서 전환 전에 provider 최신 본문으로 재기반해 오래된 텍스트가 먼저 보이거나 커서 매핑이 유실되지 않게 한다. Snapshot hook은 session identity가 바뀐 render부터 새 provider snapshot을 반환해 이전 문서 snapshot이 새 identity에 적용되지 않게 한다. dirty이거나 더 큰 상태는 메모리에서만 유지한다. 사용자가 dirty 문서 닫기를 확인하면 해당 문서의 in-memory snapshot을 버려 다음 열기에서 discard한 내용이 되살아나지 않게 한다. 저장소 구현은 host가 `viewStateStorage`로 주입하고 공통 패키지는 주어진 adapter만 사용한다. 양쪽 입력은 provider dirty phase를 갱신하고 PKMS 탭은 dirty 확인을 한다. 전체 rename/move·재시작 동작은 acceptance 검증이 남아 있다. |
| Outline과 트리 row·문서 tab 구성요소 | in progress | Outline UI와 Markdown heading parsing·공통 outline view-model 변환, row, PKMS 문서 tab, loaded branch 정렬·가시 행 계산·가상 스크롤 projection 및 spacer/행 렌더링, 방향키/Enter/Delete/F2 해석, 단일·다중·범위 선택 상태 전이를 공유한다. 두 제품은 같은 selection hook/controller와 keyboard action resolver 및 virtual list를 쓰며 상태 저장, focus/scroll 반영, 실제 파일 명령은 각 트리 host가 수행한다. 공통 virtual list는 tree group semantics를 제공하며 두 host root는 multi-select tree로 노출한다. Workspace 키보드 방향 이동은 활성 행으로 실제 DOM focus도 옮긴다. Outline 이동 위치는 두 앱 모두 CodeMirror 문서 offset을 사용한다. 가상 스크롤 행 높이와 PKMS 키보드 포커스 scroll 계산은 공통 27px 상수를 사용해 Workspace의 24px 기본값·PKMS의 28px 설정으로 생기던 누적 위치 오차를 제거했다. PKMS 폴더 조회는 provider 계약을 통한다. PKMS의 트리 생성·rename inline row는 제거했다. 새 note 생성은 충돌 없는 `untitled` 이름을 공유 helper로 선택해 바로 열고, folder 생성·rename은 공통 `EditorNameForm`과 host prompt shell을 거쳐 provider 명령을 호출한다. 우클릭 메뉴 항목 렌더링과 방향키 탐색은 공통이고, 메뉴 액션 및 provider capability에 따른 노출은 각 host가 소유한다. Workspace pane tab 배치는 Workspace 소유로 남긴다. |
| Markdown 편집 기능과 명령 | done (implemented) | Markdown parser, 4칸 들여쓰기, indent-on-input, 목록 연속 입력, markup Backspace, Bold/italic 단축키, 문서 내 Find/Replace, live-preview decoration, rendered-link hit testing, relative path normalization, 비동기 image resource 수명 관리는 공통 패키지다. Workspace plain-text paste·로컬 이미지 root·WikiLink resolver와 PKMS 저장소 asset 조회/인증은 host resolver 책임이다. 양쪽 구현 연결은 끝났고, 이미지·첨부파일·callout의 제품별 acceptance 확인은 전체 acceptance 항목에서 진행한다. |
| Quick open·검색 UI와 host 조립 | in progress | Quick-open dialog와 fuzzy ranking은 공유한다. 양쪽 Quick Open은 provider의 `search(target: "names", fuzzy: true)`를 사용하고, Workspace는 전체 로컬 파일을, PKMS는 loaded repository 파일을 후보로 제공한다. 표시 label·열기 동작과 PKMS ignored-file 필터는 host에 남긴다. Workspace Find/Replace는 공통 provider 검색 계약을 사용하고 PKMS는 name search만 제공한다. 각 host는 공통 Editor 요소를 기존 pane/tab/navigation shell에 연결하며, 중복된 편집 조립 로직을 더 공통화하고 양쪽에 연결하는 작업이 남아 있다. |
| 전체 acceptance 검증과 중복 UI 제거 | not yet | PKMS Web/Desktop 및 Workspace 각각에서 문서 전환, 외부 변경 conflict, 저장 상태, Markdown 기능을 확인한 뒤 구 구현을 제거한다. |

트리에서 폴더와 그 하위 항목을 함께 선택해 삭제·이동하는 경우 `packages/editor`의 `editorTreeSelectionRoots`가 선택된 폴더만 남긴다. PKMS와 Workspace가 같은 규칙을 쓰므로 하위 항목 stale ID로 작업이 중단되거나 같은 경로를 중복 처리하지 않는다.

문서별 view state와 PKMS의 열린 Yjs document/session 캐시는 `editorDocumentKey(providerId, itemId)`를 사용한다. 따라서 같은 저장소·파일 ID가 여러 PKMS workspace에 나타나도 문서와 실시간 업데이트가 workspace 사이에서 섞이지 않는다.

PKMS 저장 완료·오류 상태도 저장 시작 시의 document key와 현재 열린 문서 key가 같을 때만 전역 saving/error UI에 반영한다. 이전 workspace에서 늦게 끝난 저장은 현재 workspace의 상태 표시를 덮지 않는다.

`EditorMarkdownSurface`는 공통 Markdown parser·highlighting·theme 확장을 기본으로 항상 구성하고, host 확장은 그 위에 추가한다. Workspace의 WikiLink는 parser extension 계약으로 주입하므로 제품 확장을 전달해도 공통 편집 기반을 대체하지 않는다. 이미지 resolver facet도 항상 설치하고 현재 host callback을 ref로 읽어, resolver가 비동기적으로 생기는 host에서도 extension set을 다시 만들지 않고 반영한다.

문서 내 Find/Replace panel과 Cmd/Ctrl+F·Mod+D 동작 및 panel styling은 `packages/editor`의 `editorSearch`가 소유한다. Markdown surface와 일반 text surface가 같은 검색 확장을 사용하며, Workspace/PKMS toolbar는 공통 `EditorSearchButton`으로 panel을 연다. 파일 전체 검색/치환은 provider capability에 따라 host별로 유지한다.

Quick Open도 두 host가 파일 목록을 직접 취합·필터링하지 않고 provider의 fuzzy name search를 사용한다. Workspace provider는 전체 로컬 파일 후보를, PKMS provider는 현재 로드된 저장소 파일 후보를 검색한다. 공통 dialog는 검색 중 이전 후보를 Enter로 열지 않는다.

공통 트리 virtual list는 tree root 아래 `group`으로 노출된다. Workspace root도 PKMS처럼 multi-select tree semantics를 제공하고, 방향키 이동 시 다음 선택 행에 DOM focus를 맞춘다.

Markdown 제목 표시·검증·확장자/경로 생성은 `packages/editor`의 공통 helper와 shared frame CSS를 사용한다. Workspace와 PKMS는 충돌 확인 및 rename 호출에 각각의 provider를 연결한다.

제목 inline input의 렌더링, Enter/Escape 처리, 오류 표시도 `EditorMarkdownTitleInput`으로 공유한다. 각 host는 입력값 상태와 검증 결과·provider rename 동작을 전달한다.

트리의 이름 prompt도 `EditorNameForm`이 trim·빈 값 처리·submit form을 공유한다. Workspace Popover와 PKMS modal의 배치 및 host styling은 각 shell에 둔다.

공통 Markdown frame은 제목/CodeMirror 내부 클릭을 제외한 빈 본문 영역 클릭을 판별한다. 두 host는 각자 surface navigator를 통해 문서 끝으로 cursor와 focus를 옮긴다.

`useEditorDocumentSnapshot`은 현재 session identity에 맞는 snapshot만 반환한다. session 교체 render와 subscription effect 사이에도 이전 문서의 본문·save phase가 새 문서에 노출되지 않는다.

PKMS shell은 더 이상 편집 본문의 React `text` 복사본이나 사용되지 않는 `activeDocument.value` 문자열 mirror를 유지하지 않는다. 공통 surface는 Yjs provider session snapshot을 읽고, Yjs update handler는 autosave·realtime transport만 담당해 문서 입력마다 shell 전체가 rerender되지 않게 한다.

구현은 위 표의 `not yet` 항목부터 공통 UI로 이동하고, 매 단계에서 두 provider가 보존해야 할 차이를 계약 capability와 adapter로 표현한다. `done (implemented)`는 코드 연결이 있다는 뜻이며 전체 acceptance 통과를 의미하지 않는다.
