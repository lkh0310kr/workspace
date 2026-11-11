# Provider와 session 계약

Provider는 저장소 탐색·작업을, session은 열린 문서의 본문·revision·저장 상태를 소유한다. 이 계약은 [provider.ts](../src/provider.ts)를 기준으로 한다.

## 데이터 모델

| 타입 | 필드와 의미 |
|---|---|
| `EditorItemRef` | `providerId: string`, `itemId: string`; provider 내 rename/move에도 유지하는 식별자 |
| `EditorTreeItem` | ref + `parentId: string \| null`, `name`, `path`, `kind`, `readOnly: boolean` |
| `EditorItemKind` | `directory \| markdown \| code \| asset` |
| `EditorDocumentSnapshot` | `content`, opaque `revision: string`, `savePhase`, 선택적 `message`, `syncPhase` |
| text content | `{ type: 'text', text: string }` |
| asset content | `{ type: 'asset', previewUrl: string, mediaType: string }` |
| save phase | `clean \| dirty \| saving \| conflict \| error` |
| sync phase | `idle \| pending \| synced \| blocked`; 본문 durable save와 독립 |

UI label은 clean=`Saved`, dirty=`Unsaved`, saving=`Saving`, conflict=`Conflict`, error=`Save failed`다. clean이어도 원격 mirror가 pending일 수 있다. revision은 공통 UI가 비교·전달할 뿐 생성하거나 숫자로 증가시키지 않는다.

## Provider 메서드

다음 표에서 `signal?`은 선택적 AbortSignal이다. async 메서드는 Promise를 반환한다.

| 메서드 | 입력 | 반환/부수 효과 |
|---|---|---|
| `listChildren` | `parentId: string \| null, signal?` | `EditorTreeItem[]`; null은 root |
| `subscribeTree` | `(changedParentIds: readonly (string \| null)[]) => void` | 해제 함수; synchronous 등록; 영향받은 부모를 무효화 |
| `openDocument` | `EditorItemRef, signal?` | `EditorDocumentSession`; provider가 본문 로드 |
| `search` | `query, EditorSearchOptions, signal?, onResult?` | 최종 `EditorSearchResult[]`; 선택적으로 중간 결과 전달 |
| `replaceContents?` | `ref, query, replacement, options, expectedMatchCount` | boolean; 검색 시점 일치 개수 검증 실패는 false |
| `create?` | `parentId, 'file' \| 'directory', name` | 생성된 item |
| `rename?` | `ref, name` | 변경된 item; 기존 item ID 유지 |
| `move?` | `readonly EditorItemRef[], parentId` | void |
| `delete?` | `readonly EditorItemRef[]` | void |

이 메서드 외 `readonly id: string`, `readonly capabilities`가 필수다. 원격 부모 무효화와 문서 snapshot 알림은 서로 다른 구독이다.

## Capability 판정

`operations`는 `ReadonlySet<'createFile' | 'createDirectory' | 'rename' | 'move' | 'delete'>`다. UI는 set에 선언되고 실제 메서드도 존재할 때만 명령을 노출한다. createFile/createDirectory는 모두 `create` 메서드를 확인한다.

나머지는 `searchNames`, `searchContents`, `replaceContents`, `multiSelect`, `dragMove`, `collaborativeDocuments` boolean과 `codeLanguages: ReadonlySet<string>`다. 언어는 `*` 또는 소문자 언어명이 있어야 지원한다. search target은 해당 boolean으로 검사한다. DnD는 dragMove와 move 지원을 함께 확인한다. 선언만으로 구현되지 않은 명령을 호출하지 않는다.

## Session 메서드

| 메서드/속성 | 계약 |
|---|---|
| `readonly item`, `readonly readOnly` | 열린 문서의 메타데이터와 수정 가능 여부 |
| `updateItem?(item)` | rename/move 이후 본문 재로드 없이 메타데이터 갱신 |
| `snapshot()` | 현재 snapshot을 synchronous 반환 |
| `subscribe(listener)` | snapshot 변경 알림, 반환값으로 해제; 현재 구현들은 등록 시 현재 snapshot도 알림 |
| `replaceText(text, baseRevision)` | 전체 text를 전달하되 provider가 stale revision 판정; Promise<void> |
| `save(options?: { flushSync?: boolean })` | durable 쓰기를 flush하고 snapshot 반환; false면 보조 mirror는 pending 가능 |
| `close()` | 구독과 session 자원 해제, Promise<void>; 자동 저장을 뜻하지 않음 |

`useEditorDocumentSnapshot`은 session이 바뀐 첫 render부터 새 session.snapshot을 사용한다. effect가 실행될 때까지 이전 문서 snapshot을 노출하지 않는다. effect에서 즉시 snapshot을 publish하고 subscribe하며 교체 시 unsubscribe한다.

## 오류와 취소

`EditorProviderError(code, message, {cause}?)`의 code는 `notFound`, `readOnly`, `conflict`, `offline`, `unauthorized`, `unsupported`, `unknown`이다. `withEditorProviderErrors`는 provider의 list/open/search/replace/create/rename/move/delete와 session의 replaceText/save/close rejection을 정규화한다. typed error와 name=`AbortError`는 그대로 보존하고, 나머지는 작업별 사용자 메시지와 cause를 가진 unknown 오류로 바꾼다. subscribeTree의 synchronous throw도 래핑한다. snapshot/subscribe/updateItem의 모든 throw를 래핑하는 범용 proxy는 아니다.

## 검증 계약

| ID | 조건 | 기대 결과 |
|---|---|---|
| PROV-01 | rename capability만 있고 rename 메서드 없음 | 지원=false |
| PROV-02 | openDocument가 일반 Error throw | unknown과 원본 cause, `Could not open this document.` |
| PROV-03 | AbortError 발생 | 취소로 유지, 일반 provider 오류로 바꾸지 않음 |
| PROV-04 | session A→B 교체 | 첫 render부터 B 본문; A 구독 해제 |
| PROV-05 | clean/pending snapshot | 저장 성공과 동기화 대기를 별도 표시 가능 |

## 재구현 순서와 제약

타입·오류 → capability helper → provider → session → React 구독 순서로 만든다. ref의 providerId를 검증하는 책임은 provider 구현에 있다. 공통 계약은 batch move/delete의 원자성이나 자동 재시도, 충돌 해결 UI를 보장하지 않는다. 각 adapter의 구체 동작은 [provider 구현](../../../apps/workspace-app/docs/editor/providers.md)을 따른다.
