# PKMS editor provider와 session 스펙

[공통 계약](../../editor/provider.md)을 구현하는 PKMS adapter다. Workspace 파일시스템 provider와 저장 정책을 구분한다.

## PKMS provider

근거: [pkmsEditorProvider.ts](../../../../packages/pkms-client/src/features/editor/pkmsEditorProvider.ts).

ID=`pkms:${workspaceId}`, itemId=file.id. 기본 operations는 비어 있고 names=true, contents=false, replace=false, multiSelect/dragMove=true, codeLanguages는 빈 Set, collaborativeDocuments=true다. 주입된 capabilities와 operations가 실제 지원 범위를 결정한다.

listChildren은 parentId로 getFile을 조회하고 folder가 아니면 []를 반환한다. listDirectory의 path를 shared item으로 변환한다. subscribeTree는 부모 path를 loaded folder ID로 바꾸며 없으면 UTF-8 path의 base64url `local-...` ID를 만든다. names 검색은 **로드된 파일만** 대상으로 한다. 전체 저장소 검색을 보장하지 않는다. contents target은 []다. openDocument는 다른 provider/folder/삭제 파일을 거부하고 openSession에 위임한다. open 완료 후 abort됐으면 session을 close한다.

## PKMS local session

근거: [pkmsLocalEditorSession.ts](../../../../packages/pkms-client/src/features/editor/pkmsLocalEditorSession.ts).

Desktop bridge의 readLocalMarkdown/writeLocalMarkdown을 사용한다. 초기 save=clean, sync=pending. replaceText는 baseRevision을 확인하고 실제 변경에 editGeneration 증가, dirty/pending, **5초** 자동 저장을 예약한다. Workspace host의 600ms 정책과 다르다.

1초 poll은 동시에 하나만 실행한다. syncBridgeStatus와 조건부 read를 Promise.allSettled로 병렬 수행한다. clean 또는 재시도 시각이 지난 error에서만 읽고, 읽기 시작 후 generation이 바뀌면 응답을 적용하지 않는다. 읽기 오류 backoff는 1초부터 두 배로 최대 30초다. sync 상태 synced는 synced, offline/error는 blocked, 그 외 pending이며 미저장이 있으면 pending이다.

save는 dirty에서만 쓰고 revision을 전달한다. 쓰기 중 generation 변경 시 dirty 유지 후 자동 저장 재예약, 같으면 clean. 쓰기 실패는 conflict로 반환한다. close는 poll·timer·listeners를 해제하며 저장하지 않는다.

## PKMS Yjs와 asset session

근거: [pkmsYjsEditorSession.ts](../../../../packages/pkms-client/src/features/editor/pkmsYjsEditorSession.ts).

Yjs session revision은 `${doc.clientID}:${sequence}:${text.length}`다. text observer마다 sequence 증가. transaction.origin이 `server`가 아니면 dirty/pending; server 변경은 clean일 때 sync만 pending으로 바꾼다. replaceText는 revision 일치 여부를 확인하고 공통 prefix/suffix를 제외한 중간 구간만 Y.Text delete/insert를 하나의 transaction으로 수행한다. 동일 본문은 no-op다.

save는 promise tail로 직렬화한다. saving/pending 알림 후 `saveDocument(file.id, doc, options.flushSync !== false, editorDocumentKey(item))`를 실행한다. 저장 중 sequence가 바뀌면 dirty/pending을 유지한다. 실패는 error/blocked와 message를 알리고 throw한다. close는 observer와 listeners를 해제하고 Y.Doc 소유자의 수명은 바꾸지 않는다.

asset session은 고정 asset snapshot, clean/idle, readOnly=true이며 replaceText는 readOnly 오류다. close는 주입된 dispose를 한 번 호출한다.

## 수락 기준

PKMS-01: names 검색은 로드된 파일만 대상으로 한다. PKMS-02: local poll 응답보다 편집 generation이 앞서면 응답을 폐기한다. PKMS-03: Yjs save 중 sequence가 증가하면 dirty/pending을 유지한다. PKMS-04: asset close의 dispose는 한 번만 실행한다. PKMS-05: abort 후 완료된 open session은 close한다.

서버·폴더 동기화는 [기존 PKMS 아키텍처](../README.md)를 따른다.
