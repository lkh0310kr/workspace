# Desktop 로컬 provider 구현

공통 [계약](../../../../packages/editor/docs/provider.md)에 대한 adapter별 실행 규칙이다. 로컬 Workspace와 PKMS local session은 서로 다른 구현이다.

## Workspace provider identity와 수명

근거: [localEditorProvider.ts](../../src/renderer/src/editor/localEditorProvider.ts).

- provider ID는 `workspace:${tabId}`. module Map에서 tabId별 provider와 참조 수를 보관한다. acquire마다 참조 증가, release는 한 번만 유효하며 0에서 watcher·listeners·sessions를 dispose한다.
- 경로→itemId와 itemId→경로 Map을 유지한다. 신규 ID는 `${providerId}:item:${crypto.randomUUID()}`다. localStorage key `workspace:editor-item-ids:${tabId}`에 경로→ID를 보관한다. 이전 ID prefix를 보정하고 중복 ID를 건너뛴다. 손상/저장 불가는 메모리 동작을 막지 않는다.
- listChildren은 null을 root `''`로 바꾸고 listDir를 호출한다. 알 수 없는 parent ID는 빈 목록이다. 반환 뒤 취소를 재확인한다. 부모 ID가 필요하면 부모 item을 재귀 생성한다.
- rename/move는 파일시스템 작업 성공 후 하위 경로 Map과 열린 session 메타데이터를 갱신한다. ID는 유지한다. 외부 도구의 rename을 inode로 추적하는 기능은 없다.
- 모든 파일 작업, 이름/내용 검색, 치환, 다중 선택, DnD, 모든 코드 언어를 지원하고 collaboration은 false다.

파일 분류는 directory 우선, `md/markdown/mdown`은 markdown, `png/jpg/jpeg/gif/webp/svg/pdf/zip/7z/glb/gltf/stl/step/stp/epub`은 asset, 나머지는 code다. asset session은 읽기 전용 preview URL을 사용한다.

## Workspace text session 상태 전이

내부 상태는 `value`, disk 기준 `baseValue`, 쓰기 중 `savingValue`, UUID revision, phase, message, closed다. load에서 readFile null이면 notFound; 성공하면 value=baseValue, 새 revision, clean이다.

| 트리거 | 판정과 결과 |
|---|---|
| replaceText | closed/readOnly/conflict 거부; baseRevision 불일치면 conflict 알림 후 throw; 정상은 value 변경, dirty 알림. revision은 이 시점에 바꾸지 않음 |
| save | conflict면 throw. dirty 외 phase는 현재 snapshot 반환. savedValue와 expected base를 고정하고 saving 알림 |
| 조건부 쓰기 성공 | `writeFileIfUnchanged(tabId,path,expectedValue,savedValue)`; base와 revision 갱신. 추가 편집이 없으면 clean, value가 달라졌으면 dirty |
| 조건부 쓰기 false | conflict로 전이하고 throw; disk 덮어쓰지 않음 |
| 쓰기 예외 | 이미 conflict가 아니면 error, message 설정·알림 후 throw |
| 외부 disk 변경, clean | disk가 base와 다르면 value/base/revision 갱신, clean 알림 |
| 외부 disk 변경, dirty/saving | 저장 중 disk=savingValue면 자기 쓰기로 무시. 그 외 disk≠base면 conflict; 같으면 무시 |
| 파일 삭제 | dirty/saving이면 conflict; 그 외 error (`Document no longer exists`) |
| close | closed=true, listener clear, provider session Set에서 제거; save하지 않음 |

watcher가 빈 changedPaths 또는 모두 빈 경로를 주면 모든 session을 재조회하고 root를 invalidate한다. 나머지는 변경 경로의 부모 ID를 dedupe해 tree에 알리고 각 session에는 원래 변경 경로를 전달한다. conflict에 들어간 session은 외부 재조회로 자동 해제되지 않는다.

현재 제약: error phase에서 save를 다시 누르는 것만으로 쓰기를 재시도하지 않는다(dirty에서만 쓰기). replaceText로 다시 dirty가 되거나 문서를 재로드해야 한다. 구현 재생성 시 자동 retry를 추가한 것처럼 문서화하지 않는다.

## Workspace 파일 작업

create는 parent path와 name을 결합하고 directory는 createDir, file은 빈 문자열 writeFile을 쓴다. 충돌 이름 결정은 UI/helper의 책임이다.

rename은 기존 부모를 list해 directory 여부를 판정하고 renamePath 실행 후 자기 자신과 directory 후손을 remap한다. 이전/새 부모를 invalidate한다.

delete는 모든 ref의 provider와 경로, 부모 목록의 실제 존재 여부를 첫 삭제 전에 확인한다. 선택된 조상에 속한 후손은 작업에서 제외한다. 각 root를 순차 삭제하고 ID mapping을 제거한다. 실제 I/O 중간 실패까지 rollback하는 transaction은 없다.

move는 대상 directory 존재/타입과 모든 source 존재를 먼저 검증한다. 후손 중복 제거 후 순차 rename한다. 자기 자신/자기 하위로 이동은 skip한다. 성공 항목마다 mapping·session·storage를 갱신하고 이전/새 부모를 invalidate한다. 삭제 dirty 확인은 provider가 아닌 host에서 수행한다.

## PKMS 연결

PKMS adapter는 [소유 패키지의 스펙](../../../../packages/pkms-client/docs/editor-sessions.md)을 따른다.

## 검증 시나리오

| ID | 행동 | 결과 |
|---|---|---|
| ADAPT-01 | directory rename 후 열린 후손 저장 | 새 경로에 저장하고 item ID 유지 |
| ADAPT-02 | base=A, 사용자=B, disk=C 후 save | C 유지, conflict; B를 자동 폐기하지 않음 |
| ADAPT-03 | B 저장 요청 중 C 편집 | B durable 저장 후 C가 dirty로 남음 |
| ADAPT-04 | move refs 중 하나가 stale | 첫 filesystem mutation 전에 notFound |
| ADAPT-07 | 마지막 provider lease 해제 | watcher와 sessions 정리; release 재호출 무해 |

PKMS bridge의 서버·폴더 동기화 자체는 [PKMS 아키텍처](../../../../docs/architecture/pkms/README.md)를 함께 따른다.
