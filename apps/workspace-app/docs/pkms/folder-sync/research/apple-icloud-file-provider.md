# Apple iCloud와 File Provider 동기화 연구

## 목적과 조사 범위

이 문서는 Apple이 공개한 File Provider/iCloud 문서 동기화 모델을 PKMS Desktop 폴더 동기화와 비교한다. Apple의 내부 iCloud 구현이나 비공개 wire protocol을 추측하지 않는다. 공개 API의 동작에서 설계 원칙만 도출한다.

## 공개 모델

- File Provider는 원격 항목의 로컬 표현을 관리한다. 항목은 이름·크기 같은 메타데이터만 있는 dataless 상태이거나 실제 본문이 있는 materialized 상태일 수 있다. 폴더도 메타데이터만 우선 보여주고 열 때 자식을 열거할 수 있다. [Apple: Synchronizing the File Provider Extension](https://developer.apple.com/documentation/FileProvider/synchronizing-the-file-provider-extension)
- 시스템은 materialized item과 pending local changes를 관리한다. 업로드 대기 변경이 있는 파일을 임의로 dataless 상태로 바꾸지 않아 변경 유실을 막는다. 확장 프로그램은 변경 이후 sync anchor를 기준으로 항목을 열거한다. [Apple: Synchronizing the File Provider Extension](https://developer.apple.com/documentation/FileProvider/synchronizing-the-file-provider-extension), [Apple: NSFileProviderSyncAnchor](https://developer.apple.com/documentation/fileprovider/nsfileprovidersyncanchor)
- 동기화는 파일 단위로 호출되고, 업로드 시 바뀐 파일의 일관된 clone과 최종 item version을 전달받는다. 완료 응답은 서버의 최종 상태를 로컬로 되돌려 일치시킨다. [Apple WWDC21: Sync files to the cloud with FileProvider on macOS](https://developer.apple.com/videos/play/wwdc2021/10182/)
- 동시에 여러 프로세스가 파일에 접근할 수 있으므로 파일 읽기/쓰기는 coordination 대상이다. 원격 본문을 내려받을 때 local changes와 충돌하는지 검사하고, conflict는 자동으로 버리는 대신 업로드 거부 후 최신 버전을 가져와 재기반(rebase)하거나 사용자에게 해결시킨다. [Apple: NSFileCoordinator](https://developer.apple.com/documentation/foundation/nsfilecoordinator), [Apple: fail upload on conflict](https://developer.apple.com/documentation/foundation/nsfilemanagerresumesyncbehavior/afteruploadwithfailonconflict)
- 원격 변경은 File Provider enumerator를 다시 실행하도록 신호할 수 있다. push는 변경 내용 자체가 아니라 원격 상태를 다시 확인하게 하는 신호로 사용될 수 있다. [Apple: Synchronizing the File Provider Extension](https://developer.apple.com/documentation/FileProvider/synchronizing-the-file-provider-extension)

## PKMS에 적용할 수 있는 결과 원칙

| 원칙 | PKMS에서 요구할 결과 | 현재 확인된 간극 |
|---|---|---|
| metadata와 본문 수명 분리 | tree는 본문 download 전에도 표시되고, 파일 open/필요 시 본문을 materialize한다. 로컬 변경 대기 파일은 eviction/덮어쓰기 대상이 아니다. | Tree metadata와 local Markdown 본문을 나눠 다루지만 local pending 변경 보호와 단일 file sync lifecycle 테스트가 약하다. |
| 변경 anchor를 기준으로 열거 | cursor는 “어디까지 remote change를 적용했는가”를 가리키고, 페이지를 완전히 반영한 뒤에만 확정한다. 오래되거나 잘못된 anchor는 안전한 full re-enumeration으로 복구한다. | revision cursor와 snapshot revision은 존재한다. cursor 저장/페이지 처리의 crash boundary와 stale cursor 재시작 검증이 부족하다. |
| 파일 접근을 조정하고 버전 비교 | 다운로드 직전과 atomic replace 직전에 local file이 예상 버전인지 확인한다. 로컬 편집이 경합하면 cloud body로 덮어쓰지 않고 retry/conflict 경로로 보낸다. | hash 확인·atomic rename은 있으나 편집기/외부 프로세스/전원 오류를 포함한 OS 동작 검증이 없다. |
| conflict를 명시적으로 보존 | 충돌한 양쪽 내용을 보존하고 사용자가 원본과 보존본을 열어 비교한다. 가장 최신 timestamp라는 이유만으로 삭제하지 않는다. | conflict 파일은 생성되지만 panel에서 바로 열고 정리하는 UX와 durable review 상태가 미완료다. |
| 알림은 힌트, 열거가 진실 | realtime notification 누락·중복·순서 뒤섞임 후에도 cursor feed/scan으로 수렴한다. | 현재 Realtime wakeup + revision poll + local full scan으로 비슷한 구조. wakeup을 잃거나 중복 수신하는 테스트가 없다. |

## 제품에 그대로 복사할 수 없는 점

Apple File Provider는 OS가 materialization, eviction, file coordination, enumeration anchor를 관리하는 플랫폼 framework다. PKMS Electron 앱은 이 framework의 durable journal이나 version handshake를 자동으로 얻지 않는다. 따라서 “iCloud처럼 작동한다”는 표현 대신 PKMS가 직접 제공해야 할 계약(파일 경합 감지, durable local intent, revision guard, conflict review)을 구현하고 검증해야 한다.

## PKMS 설계 결정으로 연결되는 항목

1. 파일 쓰기는 스캔 시 hash만 비교하지 말고, 읽기 버전·임시 파일 작성·rename 직전 버전을 비교하는 conditional apply로 정의한다.
2. `synced`는 적용 완료한 remote revision과 남은 local intent 수를 기준으로 표시한다. wakeup 수신이나 HTTP 요청 성공만으로 완료 표시하지 않는다.
3. conflict는 자동 복사에서 끝나지 않는다. conflict item의 보존 상태, 열기, 원본/보존본 비교, 재시도/해결 상태를 제품 흐름으로 정의한다.
4. root 변경은 이전 root의 baseline을 새 root identity에 재사용하지 않는다. 새 root materialization과 local-only import를 별도 reconcile로 수행한다.

## 출처

- Apple Developer Documentation, [Synchronizing the File Provider Extension](https://developer.apple.com/documentation/FileProvider/synchronizing-the-file-provider-extension)
- Apple Developer Documentation, [NSFileProviderSyncAnchor](https://developer.apple.com/documentation/fileprovider/nsfileprovidersyncanchor)
- Apple Developer Documentation, [NSFileCoordinator](https://developer.apple.com/documentation/foundation/nsfilecoordinator)
- Apple Developer Documentation, [NSFileManagerResumeSyncBehaviorAfterUploadWithFailOnConflict](https://developer.apple.com/documentation/foundation/nsfilemanagerresumesyncbehavior/afteruploadwithfailonconflict)
- Apple WWDC21, [Sync files to the cloud with FileProvider on macOS](https://developer.apple.com/videos/play/wwdc2021/10182/)
