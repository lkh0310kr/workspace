# Editor 통합 스펙

## 목표

PKMS와 Workspace가 같은 Editor Workbench를 사용한다. 파일 탐색, 열린 문서, 편집기, 목차, quick open, 검색 UI와 편집 상호작용을 공유하고, 로컬 파일과 PKMS 저장소의 읽기·쓰기·협업은 각 문서 provider가 담당한다.

통합 기준은 제품 이름이 아니라 문서 소스다. 같은 Workbench가 로컬 파일과 PKMS 문서를 열 수 있지만, 파일 권한이나 PKMS 인증을 공통 UI 패키지에 옮기지 않는다.

## 제품 동작 스펙

| 영역 | 공통 동작 | Workspace provider | PKMS provider |
|---|---|---|---|
| 파일 트리 | 확장/선택/키보드 탐색, 선택한 문서 열기, 선택 상태 표시 | 로컬 디렉터리 지연 로드, 파일 변경 감시, 다중 선택과 파일시스템 작업 | 저장소 디렉터리와 파일 조회, 원격 변경 및 캐시 반영 |
| 문서 탭 | 문서 식별, 활성화, 닫기 전 dirty 확인, dirty 표시, 문서별 편집 상태 유지 | pane group 안에서 code, Markdown, 지원하는 파일 viewer 열기 | PKMS 문서를 여러 탭으로 열기. 기존 뒤로/앞으로는 문서 탐색 이력으로 유지 |
| 텍스트 편집 | 공통 키 입력, 선택/undo, 저장 명령, 검색, outline, 테마 토큰 | Markdown과 일반 코드 편집, 언어 감지, 자동 저장, 로컬 파일 충돌 표시 | Markdown 편집, 협업 상태, 로컬 캐시와 서버 저장 상태 표시 |
| Markdown | 공통 Markdown 문법, 실시간 미리보기, task/table, 링크, 목차 동작 | 로컬 이미지와 Workspace 위키 링크 해석, callout 포함 Workspace 확장 | PKMS 자산 링크 해석, PKMS 링크 규칙과 task/table 지원 |
| 파일 작업 | 트리·검색 결과에서 열기, capability가 있는 작업의 공통 확인/오류 표시 | 파일 생성·폴더 생성·rename·move·delete·로컬 검색/치환 | 저장소 생성·rename·move·delete, 로드된 저장소 목록에서 이름 검색 |
| 저장 상태 | `clean`, `dirty`, `saving`, `conflict`, `error`의 공통 상태와 메시지 표시 | clean은 디스크에 기록됨을 뜻함 | clean은 PKMS 서버에 기록됨을 뜻함. GitHub 반영은 별도 동기화 상태로 표시 |

PKMS는 일반 코드 파일 편집과 파일 내용 검색/치환을 현재 제공하지 않는다. 현재 PKMS quick open은 이미 로드한 저장소 파일 목록에서 이름을 찾는다. Workspace의 다중 파일 검색·치환은 PKMS가 같은 검색 capability를 제공하기 전까지 Workspace provider 전용으로 유지한다. PKMS의 협업/오프라인 상태와 Workspace의 파일 watcher/외부 수정 충돌은 공통 UI 상태 모델에 매핑하되 각각의 원인과 복구 동작은 provider가 소유한다.

## 패키지와 소유권

```text
packages/editor/                 # 공통 Workbench, CodeMirror 표면, Markdown 기능, tree/search UI
packages/pkms-client/            # PKMS 계정/저장소 진입 UI, PKMS provider, Web/Desktop transport
apps/workspace-app/              # 로컬 파일 provider, Electron 권한/IPC, pane 배치와 Workspace 설정
apps/pkms-web/                   # PKMS 웹 진입점과 세션 경계
```

`packages/editor`는 React와 CodeMirror 기반 UI 및 문서 provider 계약만 의존한다. Electron, 파일시스템 권한, PKMS API·token·Yjs 세션을 직접 참조하지 않는다. 제품 앱은 Editor Workbench를 조립하고 제품 설정과 테마 토큰을 전달한다.

공통 패키지는 편집 화면의 뼈대와 상호작용을 소유한다. Workspace pane 분할과 배치, PKMS 계정 로그인·저장소 선택, 각 provider의 저장·충돌·협업 정책은 제품/adapter 책임으로 남긴다.

## Provider 계약

모든 트리 항목과 문서는 provider ID와 provider 내부의 안정적인 ID로 식별한다. 경로는 표시·탐색 주소이며 rename/move 때 바뀔 수 있으므로 열린 문서의 identity로 사용하지 않는다.

```ts
import type { Extension } from "@codemirror/state";

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
  line?: number;
  column?: number;
  preview?: string;
}

interface EditorProvider {
  readonly id: string;
  readonly capabilities: EditorProviderCapabilities;
  listChildren(parentId: string | null, signal?: AbortSignal): Promise<EditorTreeItem[]>;
  subscribeTree(listener: (changedParentIds: readonly string[]) => void): () => void;
  openDocument(item: EditorItemRef, signal?: AbortSignal): Promise<EditorDocumentSession>;
  search(query: string, options: EditorSearchOptions, signal?: AbortSignal): Promise<EditorSearchResult[]>;
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
  /** Document synchronization only, such as a PKMS Yjs binding. */
  readonly extensions?: readonly Extension[];
  snapshot(): EditorDocumentSnapshot;
  subscribe(listener: (snapshot: EditorDocumentSnapshot) => void): () => void;
  replaceText(text: string, baseRevision: string): Promise<void>;
  save(options?: { flushSync?: boolean }): Promise<EditorDocumentSnapshot>;
  close(): Promise<void>;
}
```

계약 규칙은 다음과 같다.

- `itemId` stays stable across rename and move. `parentId: null` identifies the provider root; all other parent IDs are provider item IDs. A provider emits tree invalidations and updated metadata; the Workbench updates labels and tree position without reopening or discarding the editor session.
- `revision` is opaque to the Workbench. The provider checks or reconciles it when accepting edits; it reports an external-edit conflict rather than silently overwriting newer content.
- `replaceText` reports local editor edits to the provider. Provider snapshots report remote or external changes back to the Workbench. Implementations suppress echo updates and preserve selection/undo state when applying snapshots.
- `save()` flushes pending durable writes. `flushSync: false` permits secondary mirrors to remain pending. For PKMS, server persistence and GitHub mirroring are distinct: `savePhase: clean` confirms server persistence, while `syncPhase` reports mirror progress. For Workspace, `clean` confirms the local file write.
- Save or operation failures use `EditorProviderErrorCode` with a user-safe message. The provider owns recovery and retry rules.
- Optional operations are callable only when declared in `capabilities`; the UI hides unsupported commands and does not infer support from product name.
- `close()` releases subscriptions, realtime resources, and pending provider work. The Workbench asks before closing a dirty session unless the provider reports that all edits are durable.

`previewUrl`은 provider가 수명을 관리하는 임시 URL일 수 있다. Workbench는 문서 세션이 닫힐 때 asset preview도 해제한다. `asset` 문서는 읽기 전용 세션이며 `replaceText`를 제공하지 않는다.

공용 Editor는 CodeMirror 인스턴스를 만들고 공통 명령, 문법 UI, Markdown 미리보기, 목차, 선택, 포커스 수명을 소유한다. 문서 세션은 PKMS 협업 바인딩 같은 문서 동기화 확장만 제공할 수 있다. Provider가 편집 UI를 교체하거나 공통 키 동작을 조용히 바꾸지는 않는다.

Workbench가 소유하는 상태는 열린 문서 탭, 활성 문서, 문서별 커서·스크롤·선택·undo 이력, 트리 확장·선택·스크롤이다. 상태 저장 키는 제품 shell이 전달한다. PKMS에서 뒤로/앞으로는 열린 탭을 대신하지 않고 기존 문서 탐색 이력을 이동한다.

## Acceptance and migration order

통합 완료 조건은 PKMS Web/Desktop과 Workspace가 같은 Workbench와 provider 계약을 사용하고, 표에 적힌 제품별 동작을 유지하는 것이다. 문서를 전환해도 각 문서의 커서·스크롤·선택·undo 이력이 보존되어야 한다. 원격 또는 로컬 변경이 저장하지 않은 편집 내용을 조용히 덮어쓰면 안 된다.

Migrate in this order:

1. Extract the common CodeMirror surface, Markdown extensions, outline, and command definitions into `packages/editor`. Match the current Workspace and PKMS feature sets before consolidating duplicate behavior.
2. Move the Workspace local tree and document I/O behind `EditorProvider`. Keep Electron IPC and filesystem permission checks in `apps/workspace-app`.
3. Move PKMS document/tree operations behind the same provider contract. Keep login, repository selection, API transport, Yjs, cache, and GitHub status in `packages/pkms-client`.
4. Replace each product's editor UI with the shared Workbench. Retain the current Workspace pane layout and PKMS web navigation shell.
5. Verify each acceptance item against both providers before removing old UI implementations.

PKMS와 Workspace의 인증, 저장소, 배포, 파일시스템 권한, 백엔드 서비스, iOS 네이티브 편집기는 통합 범위에 넣지 않는다. 사용자가 조작하는 Editor 환경을 통일하면서 데이터와 보안 경계는 유지한다.

## 구현 상태

화면과 조작 기준은 **Workspace Editor**다. 공통 편집기 UI는 Workspace의 밀도, 탐색, Markdown 편집 흐름을 따른다. PKMS의 로그인·저장소 선택·협업·동기화 표시는 PKMS shell에 남고, 그 안의 편집기와 트리는 공통 Workbench로 교체한다.

| 영역 | 상태 | 현재 근거 / 남은 일 |
|---|---|---|
| Provider 계약과 Workspace·PKMS adapter | done (implemented) | `packages/editor/src/provider.ts`와 두 adapter가 트리·문서·검색·작업 capability를 사용한다. 공통 CodeMirror 표면이 편집 내용을 session `replaceText`로 전달해 provider dirty phase를 갱신한다. 공통 tab-ID dirty registry가 탭 버튼과 전역 닫기 단축키를 보호하고, 파일 삭제는 열린 dirty 문서 확인 후 수행한다. |
| 공통 CodeMirror 표면 | done (implemented) | 두 앱이 `EditorMarkdownSurface`에 provider session을 전달한다. 공통 history, keymap, provider snapshot 반영, 편집 변경의 `replaceText` 전달, 기본 Markdown 구문·syntax highlighting, 줄 이동기, 문법 트리 기반 outline 갱신을 소유한다. Workspace는 WikiLink·로컬 검색·코드 편집 확장을 주입하고 PKMS는 기본 Markdown 확장을 사용한다. 편집기 주변 레이아웃과 Workbench 조립은 계속 통합 중이다. |
| 문서별 편집 상태 | in progress | Workspace의 path→item ID 매핑은 재시작 뒤에도 복원되고 두 provider 모두 rename/move 중 item ID를 유지한다. CodeMirror 커서·선택·scroll·undo 상태는 provider clean 시 안정 identity 키로 저장하고, 24개 LRU·문서별 40,000자 제한 안에서 재시작 뒤 복원한다. dirty이거나 더 큰 상태는 메모리에서만 유지한다. 양쪽 입력은 provider dirty phase를 갱신하고 PKMS 탭은 dirty 확인을 한다. 전체 rename/move·재시작 동작은 acceptance 검증이 남아 있다. |
| Outline과 트리 row·문서 tab 구성요소 | in progress | Outline UI와 Markdown heading parsing, row, PKMS 문서 tab, loaded branch 정렬·가시 행 계산·가상 스크롤 projection, 방향키 해석, 단일·다중·범위 선택 상태 전이를 공유한다. 두 제품은 같은 controller를 쓰며 상태 저장과 focus/scroll 반영은 각 트리 host가 수행한다. PKMS 폴더 조회는 provider 계약을 통한다. 트리 명령 UI는 아직 제품별이다. Workspace pane tab 배치는 Workspace 소유로 남긴다. |
| Markdown 편집 기능과 명령 | in progress | Markdown parser, indent-on-input, Bold/italic 단축키, live-preview decoration은 공통 패키지다. Workspace 이미지 root와 WikiLink target resolver, PKMS 저장소 asset/link resolver는 host 책임으로 남아 있다. 두 제품에서 링크·asset·callout 동작을 맞추고 확인한다. |
| Quick open·검색 UI와 Workbench 조립 | in progress | Quick-open dialog와 fuzzy ranking은 공유한다. Workspace 파일 목록 조회와 PKMS loaded repository 후보 범위, 검색 상태는 host 소유다. 트리·열린 문서·편집기·outline을 조립하는 공통 Workbench는 남아 있다. |
| 전체 acceptance 검증과 중복 UI 제거 | not yet | PKMS Web/Desktop 및 Workspace 각각에서 문서 전환, 외부 변경 conflict, 저장 상태, Markdown 기능을 확인한 뒤 구 구현을 제거한다. |

구현은 위 표의 `not yet` 항목부터 공통 UI로 이동하고, 매 단계에서 두 provider가 보존해야 할 차이를 계약 capability와 adapter로 표현한다. `done (implemented)`는 코드 연결이 있다는 뜻이며 전체 acceptance 통과를 의미하지 않는다.
