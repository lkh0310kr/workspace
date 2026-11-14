# PKMS protocol

이 package는 PKMS server와 client가 공유하는 TypeScript HTTP DTO와 Realtime 계약을 제공한다.

- `src/types.ts`는 공통 TypeScript HTTP DTO와 Realtime model을 정의한다. HTTP request/response는 server route handler와 client transport가 구현하고 DTO를 직접 함께 관리한다.
- `realtime.schema.json`은 Realtime message envelope와 payload를 정의한다.
- iOS HTTP 및 Realtime DTO는 [PKMSProtocolModels.swift](../../apps/pkms-ios/PKMSProtocolModels.swift)에서 관리한다.

Field, CRDT encoding, path 의미, conflict 동작을 바꾸면 protocol 변경으로 취급한다. 구현과 함께 관련 DTO 및 Realtime schema를 갱신하고 서비스 동작을 [PKMS architecture](../../docs/architecture/pkms/overview.md)와 [folder sync](../../docs/architecture/pkms/folder-sync.md)에 기록한다.

Realtime 계약이나 model을 바꾼 뒤 `npm run check:realtime-models --workspace @pkms/protocol`을 실행한다. Checker는 TypeScript Realtime envelope field/discriminator와 iOS peer, hello, document-update, operation-result payload를 `realtime.schema.json`과 비교한다. HTTP route 또는 HTTP DTO 호환성은 검사하지 않는다.

Model 소유권, encoding, 호환성 경계와 checker 범위는 [구현 계약](../../docs/architecture/pkms/protocol/README.md)을 읽는다.
