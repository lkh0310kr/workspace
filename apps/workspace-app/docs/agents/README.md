# Agent 상태 evidence와 표시

App scope의 J-09다. 터미널 안 agent의 실제 실행과 UI에 관측된 working/blocked/waiting/done 상태를 구분한다. 자동 감지·title·hook·retained entry의 증거와 freshness를 평가해 pane/workspace UI에 전달한다.

## Identity와 owner

| owner | 책임 |
|---|---|
| main workspaceAgentHookServer | loopback POST 상태 입력, terminalId→paneKey mapping, renderer relay |
| main agentHooks / terminal output observers | PTY/title 기반 감지와 spawn/종료 관측 |
| shared agent-status-*, agent/* | pane identity·타입·title parsing·evidence 시각·freshness·outcome/rollup 순수 규칙 |
| renderer terminal bridge | main event/title evidence를 live terminal pane에 연결 |
| agentStatusStore | paneKey별 live entry·retained done·live terminal ID·epoch |
| UI hooks/status bars | workspace summary와 아이콘·표시 projection |

[hook server](../../src/main/workspaceAgentHookServer.ts)는 health와 POST 처리, paneKey 또는 terminalId를 요구한다. state는 working/blocked/waiting/done만 수락하며 clear는 별도 지시다. receivedAt/evidenceObservedAt/stateStartedAt와 workspace/pane identity를 분리해 보낸다. secret/표준 API 인증을 갖춘 외부 공개 서비스로 서술하지 않는다.

## 시간과 상태

[store](../../src/renderer/src/store/agentStatusStore.ts)는 set 시 updatedAt을 갱신하되 payload state가 같으면 기존 stateStartedAt을 유지할 수 있다. prompt는 trim/기존값, agentType은 새값 또는 이전값이다. done retain은 실제 done entry가 있어야 한다. 단순 store 갱신 시간과 권위 있는 evidence 관찰 시각은 다르다.

[freshness](../../src/shared/agent-status-freshness.ts)의 기본 stale 상수는 30분이다. authority 시각은 evidenceObservedAt 또는 updatedAt, mirrored evidence는 별도 시각을 우선할 수 있다. title-derived는 age 한도를 적용한다. explicit 상태는 restoredUnconfirmed면 거부하고 structuredHostOwned는 age와 다른 경로로 fresh가 될 수 있다. 모든 상태를 updatedAt 한 필드로 TTL 처리하지 않는다.

main-agent verdict·interrupt·synthetic title·process detection·workspace rollup은 각각 shared helper가 결정한다. 서로 다른 증거를 단순 last-write-wins로 합치면 기존 우선순위가 바뀔 수 있으므로 이 지도와 함께 helper fixture를 기준으로 상세화한다.

## 수락과 제한

AGENT-01 terminal/pane 이동 후 stable key mapping. AGENT-02 clear/종료가 이전 pane 상태를 되살리지 않음. AGENT-03 title과 explicit evidence의 freshness 차이. AGENT-04 done retain은 working을 done으로 만들지 않음. AGENT-05 stale/mirrored/restored entry의 집계.

apply-hook-agent-status·terminal-title-agent-type·workspace-tab-agent-rollup과 shared title/evidence helper 테스트가 일부 근거다. agent provider별 title grammar·evidence 우선순위 전체 분기와 실제 CLI 환경 acceptance는 후속 상세화 범위다. 실제 agent 실행 성공을 UI state 하나로 증명하지 않는다.
