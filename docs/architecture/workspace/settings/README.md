# 설정·theme·확대/축소·usage 계약

App scope는 설정 저장·적용 범위와 Main usage adapter다. 공통 editor theme API는 [editor package](../../editor/README.md)에서 관리한다.

## 설정과 표시 범위

| 설정                  | owner·default/적용                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------- |
| theme preference      | renderer workspace.theme, light/dark/system; 미설정/잘못된 값은 system                        |
| resolved theme        | DOM data-theme와 flexlayout class, system media-query subscription; cleanup에서 listener 해제 |
| autosave              | workspace root `.workspace/settings.json`; default는 기존 localStorage 값 또는 false          |
| pane zoom             | PaneGroupConfig.zoom, pane의 text 크기와 kind별 host 적용                                     |
| browser guest zoom    | item.zoomFactor, browserZoom helper의 guest factor; pane zoom과 별도                          |
| usage 선택            | Main config usageMeters.enabled, 기본 claude; normalizer가 허용 ID와 고정 순서로 정리         |
| Editor tree layout    | pane별 open/width/mode, root별 tree 확장/scroll                                               |
| Editor workspace 설정 | 프로젝트 root의 `.workspace/settings.json`; 자동 저장과 숨김 파일 표시 여부                   |

[theme](../../../../apps/desktop/src/renderer/src/theme.ts)는 system preference일 때만 OS 변경을 구독하고 xterm처럼 CSS로 바뀌지 않는 소비자에게 resolved theme를 알린다. 앱 오른쪽의 기어 버튼은 전역 theme·usage 설정을 연다. Editor pane이 focus된 상태에서 `Cmd+,`를 누르면 왼쪽 탐색 메뉴가 있는 Editor 설정창을 연다. 메뉴에서 텍스트 편집기와 파일 및 폴더를 선택하고 폼 입력으로 값을 바꾸면 workspace root의 `.workspace/settings.json`에 저장한다. 숨길 파일·폴더는 이름 또는 `*` 패턴 목록으로 설정한다. 기존 `showHiddenFiles: false` 값은 `hiddenFiles: [".*"]`로 변환해 동작을 유지한다. TreeView에서만 이 목록을 적용하며 빠른 열기와 파일 내용 검색 결과는 바꾸지 않는다.

`Cmd+,`는 Editor pane이 focus된 경우에만 Editor 설정창을 연다. 다른 pane에서는 이 shortcut을 설정에 연결하지 않는다.

Workspace 탭의 root 폴더 선택은 [workspaceRootPicker](../../../../apps/desktop/src/renderer/src/features/workspace/runtime/workspaceRootPicker.ts)가 native dialog IPC에 연결한다.

## Usage 수집과 UI

[usage settings](../../../../apps/desktop/src/shared/usage-meter-settings.ts)의 ID는 claude/codex다. Main API는 [usage.ts](../../../../apps/desktop/src/main/agent/usage/usage.ts)의 Claude/Codex 수집 경로와 systemCapabilities handler, UI는 [AgentUsageStatusBar](../../../../apps/desktop/src/renderer/src/features/agent-usage/AgentUsageStatusBar.tsx)를 따른다.

UI는 60초 poll, countdown 표시를 위한 30초 clock을 사용하고 해제 시 timer를 정리한다. 퍼센트는 유효한 finite number일 때 0~100으로 clamp하고 unknown은 대시다. reset 시각·plan type·provider unavailable과 사용량 0은 구분한다. 각 adapter가 local CLI auth/저장소 또는 remote endpoint를 이용하므로 renderer가 원본 credentials를 받도록 만들지 않는다.

## 수락·제약

SET-01 theme system 변경과 cleanup. SET-02 autosave 초기 false/선택 저장. SET-03 pane/guest/font zoom의 shortcut 대상을 구분. SET-04 unknown usage는 0%가 아님. SET-05 enabled ID normalizer가 중복·미지원 값을 제거하고 기본값을 적용. SET-06 provider 수집 실패가 앱 전체를 중단하지 않음.

일부 localStorage read/write helper는 try/catch 범위가 다르다. 모든 설정이 storage-disabled 환경에서 동일 fallback을 제공한다고 일반화하지 않는다. 사용량 adapter별 로컬 인증 상태·캐시·rate-limit 오류와 모든 설정 UI의 keyboard/ARIA fixture는 후속 상세화/검증 대상이다.
