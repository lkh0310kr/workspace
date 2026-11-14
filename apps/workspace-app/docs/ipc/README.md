# Main·preload·renderer 계약 지도

App scope의 bridge 경계다. [preload index](../../src/preload/index.ts)가 contextBridge로 노출하고 renderer는 [electron shim](../../src/renderer/src/electron.ts)과 플랫폼 adapter를 사용한다. 타입 선언이 runtime payload 검증이나 sender 소유권 확인을 자동 보장하지 않는다.

## IPC family와 owner

| family                             | preload/API             | Main 처리·반환·수명                                                                                                                                    |
| ---------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| workspace:*                        | contentApi.workspace    | ipc/workspace → Workspace mutation/persist/broadcast. getState/setRoot 반환과 renderer snake_case 변환 구분                                            |
| fs:*                               | contentApi.fs           | ipc/workspace → root-scoped file/search. read/list/write/조건부 쓰기/create/rename/delete/binary preview. search는 requestId result/done/cancel 이벤트 |
| pty:* / terminal:*                 | terminalApi             | ipc/terminal와 terminalSessionBuffers. spawn/connect invoke, input/resize/ACK send, data/capture events. disconnect는 process destroy 아님             |
| browser:*                          | browserApi              | browserNav/session/downloads와 guest relay. webContentsId 핸들, history null/boolean, subscription 해제                                                |
| shortcut:*                         | browserApi.shortcuts 등 | main shortcut relay → renderer dispatch. guest/native terminal·focused editor 대상 구분                                                                |
| media:* / model:* / cad:* / epub:* | contentApi              | contentCapabilities와 protocol adapters. model job update는 subscribe/unsubscribe, asset payload는 shared 모델                                         |
| pkms:* / home 경로                 | window.pkmsDesktop      | pkms/ipc의 sender·허용 path 처리, session은 Main 저장. public renderer API와 server auth 분리                                                          |
| agentStatus:*                      | terminal/system bridge  | ipc/agentStatus + Main hook/evidence → store. pane identity/freshness는 shared 규칙                                                                    |
| system:* / usage:*                 | systemApi               | systemCapabilities: local summary, usage 수집·settings. summary first CPU sample은 null 가능                                                           |
| clipboard:* / dialog:* / shell:*   | systemApi               | clipboard image limit·temp 저장, native pickers, reveal-in-dir. picker 취소는 path 미할당                                                              |
| window:* / debug:*                 | systemApi               | owning window 조작·logs. debug 전송이 durable 제품 상태를 바꾸는 API는 아님                                                                            |

Main handler 등록은 [main/index](../../src/main/index.ts)의 register* 호출이 기준이다. [preload/api](../../src/preload/api.ts)는 system/browser/terminal/content API를 합친다. [contentApi](../../src/preload/contentApi.ts)의 unknown 반환을 모든 DTO가 완전히 static 검증됐다는 뜻으로 해석하지 않는다.

## 호출 형식과 실패

invoke는 Promise 응답/rejection, send는 직접 응답 없는 단방향 요청, on*은 등록 해제 함수를 반환하는 이벤트다. 파일 내용 검색은 중간 결과와 완료를 requestId로 묶고 취소 시 Main 작업과 renderer listener를 함께 정리한다. latest request/session/identity를 확인하는 host 책임은 provider·layout·browser 스펙을 따른다.

Workspace file API는 tabId와 root 아래 상대 경로를 쓰지만 사용자가 native picker로 고른 absolute media path는 별도 explicit path다. browser webContentsId, terminal ID, workspace ID의 범위 검사 강도는 handler별 실제 코드와 다르므로 모든 handler가 동일 authorization을 제공한다고 서술하지 않는다.

## 재구현·검증

IPC-01 channel/method의 invoke/send/event 형태를 보존한다. IPC-02 on* cleanup 후 해당 component에 이벤트가 오지 않는다. IPC-03 검색 두 요청의 결과가 섞이지 않는다. IPC-04 browser/native handle 부재 반환을 처리한다. IPC-05 token을 renderer session payload에 포함하지 않는다. IPC-06 파일 쓰기는 조건부 compare 결과 false와 I/O rejection을 구분한다.

세부 DTO는 [shared](../../src/shared), [preload 타입](../../src/preload/index.d.ts), 각 handler가 기준이다. 이 지도는 channel 전 분기의 payload 검증 테스트를 완료했다는 뜻은 아니다. family별 상세 상태는 [layout](../layout/README.md), [browser](../browser/README.md), [local editor](../editor/providers.md), [runtime](../runtime/README.md)로 내려간다.
