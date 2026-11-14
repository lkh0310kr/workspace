# PKMS protocol package 계약

Package scope는 현재 직접 유지하는 [TypeScript DTO](../../../../packages/pkms-protocol/src/types.ts)와 [Realtime JSON schema](../../../../packages/pkms-protocol/realtime.schema.json)다. runtime route/auth/DB mutation은 [서버 app](../server/README.md), HTTP transport는 소비 client가 소유한다. 타입은 runtime validator나 모든 endpoint field의 자동 생성 원본이 아니다.

## HTTP 모델 family

| 모델                                | 의미·주의                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| User/SessionResponse                | login/avatar, user 또는 null. Web cookie와 native bearer의 저장 책임은 앱                                        |
| Repository/Workspace                | repo/branch/revision·GitHub status. githubStatus는 synced/pending/failed/external-change                         |
| File/WorkspaceSnapshot              | stable id/path/kind(markdown/asset/folder)/revision와 선택적 본문/size/hash. tree metadata와 문서 content를 구분 |
| SyncStatus                          | serverRevision·githubStatus·pendingFiles·선택적 flush 시각/오류                                                  |
| WorkspaceOperation/OperationRequest | create-folder/create-file/move/delete, operationId/baseRevision/clientId                                         |
| OperationResponse                   | acceptedRevision/duplicate, 선택적 conflictCopyPath/rebasedFrom                                                  |
| DocumentUpdateRequest               | operationId/fileId/base64 update                                                                                 |
| DeviceStart/PollResponse            | GitHub snake_case 시작 응답, pending·interval·native token·user                                                  |
| ApiError                            | error/code/message/requestId/currentRevision/conflictCopyPath/limit/scope 등 optional fields                     |

새 sync tree pagination·delete guard·Home payload가 이 모델 family에 모두 포함된 것은 아니다. 앱 handler가 실제로 수락하는 extra fields와 TS/Swift representation 차이는 app 계약으로 확인하고 호환 변경 때 함께 검토한다. core Rust OperationEnvelope의 snake_case 구조를 이 HTTP DTO와 이름만 보고 동일 포맷으로 간주하지 않는다.

## Realtime envelope

CRDT는 Yjs/Yrs v1 bytes를 base64로 운반한다. schema는 hello/document-update(document 요청/이벤트)/document-state/ready/presence(요청/이벤트)/presence-state/ack/operationResult/error의 shape를 정의한다. 같은 type 문자열이어도 요청과 server broadcast의 required fields가 다를 수 있다. peer는 clientId/login 필수, avatarUrl/fileId 선택이다.

TypeScript PkmsRealtimeMessage는 fields가 대부분 optional이고 index signature도 가진다. 이것만으로 schema의 discriminated union·additionalProperties=false를 runtime 보장하지 않는다. schema의 WebSocket 표현과 실제 Supabase transport/channel/auth 수명도 구분한다. 실제 adapter는 [pkms-client realtime](../../../../packages/pkms-client/src/realtime.ts), [iOS Realtime](../../../../apps/pkms-ios/PKMSRealtimeSession.swift)다.

## 검사와 변경

root의 `npm run check:realtime-models --workspace @pkms/protocol`는 TS envelope field union/discriminators·peer, Swift peer/hello/documentUpdate/operationResult를 schema와 비교한다. field/required 비교이며 HTTP route/DTO 전반, field type/인코딩 의미, 실제 broker 전달·auth를 검증하는 검사는 아니다.

PROTO-01 update encoding/UTF-16 의미를 보존한다. PROTO-02 required/optional 변경은 소비 TS/Swift를 함께 검토한다. PROTO-03 operation retry identity와 revision 의미는 server 계약과 일치한다. PROTO-04 새 field/type 추가가 검사 대상에 반영되는지 확인한다. 공개 API는 ./types export이며 credentials·SDK/client implementation을 package에 넣지 않는다.
