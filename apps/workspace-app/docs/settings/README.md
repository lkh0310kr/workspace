# 설정·theme·zoom·usage 계약

App scope는 설정 저장·적용 범위와 Main usage adapter다. 공통 editor theme API는 [editor package](../../../../packages/editor/docs/README.md), provider OAuth는 [Home](../home/README.md)와 다르다.

## 설정과 표시 범위

| 설정 | owner·default/적용 |
|---|---|
| theme preference | renderer workspace.theme, light/dark/system; 미설정/잘못된 값은 system |
| resolved theme | DOM data-theme와 flexlayout class, system media-query subscription; cleanup에서 listener 해제 |
| autosave | renderer workspace.autoSave 값 1만 true; setter가 subscriber에 알림 |
| pane zoom | PaneGroupConfig.zoom, pane의 text 크기와 kind별 host 적용 |
| browser guest zoom | item.zoomFactor, browserZoom helper의 guest factor; pane zoom과 별도 |
| usage 선택 | Main config usageMeters.enabled, 기본 claude/cursor; normalizer가 허용 ID와 고정 순서로 정리 |
| explorer layout | pane별 open/width/mode, root별 tree 확장/scroll |

[theme](../../src/renderer/src/theme.ts)는 system preference일 때만 OS 변경을 구독하고 xterm처럼 CSS로 바뀌지 않는 소비자에게 resolved theme를 알린다. autosave 선택과 실제 debounce는 별도다. Desktop editor 자동 저장 시간과 PKMS local/Yjs session의 저장 정책을 한 상수로 합치지 않는다.

## Usage 수집과 UI

[usage settings](../../src/shared/usage-meter-settings.ts)의 ID는 claude/cursor/codex/gemini/opencode다. 이 enum은 각 provider의 live data adapter가 모두 구현됐다는 의미가 아니다. 실제 Main API는 [usage.ts](../../src/main/usage.ts)의 Claude/Cursor/Codex 수집 경로와 systemCapabilities handler, UI는 [AgentUsageStatusBar](../../src/renderer/src/components/AgentUsageStatusBar.tsx)를 따른다.

UI는 60초 poll, countdown 표시를 위한 30초 clock을 사용하고 해제 시 timer를 정리한다. 퍼센트는 유효한 finite number일 때 0~100으로 clamp하고 unknown은 대시다. reset 시각·plan type·provider unavailable과 사용량 0은 구분한다. 각 adapter가 local CLI auth/저장소 또는 remote endpoint를 이용하므로 renderer가 원본 credentials를 받도록 만들지 않는다.

## 수락·제약

SET-01 theme system 변경과 cleanup. SET-02 autosave 초기 false/선택 저장. SET-03 pane/guest/font zoom의 shortcut 대상을 구분. SET-04 unknown usage는 0%가 아님. SET-05 enabled ID normalizer가 중복·미지원 값을 제거하고 기본값을 적용. SET-06 provider 수집 실패가 앱 전체를 중단하지 않음.

일부 localStorage read/write helper는 try/catch 범위가 다르다. 모든 설정이 storage-disabled 환경에서 동일 fallback을 제공한다고 일반화하지 않는다. provider별 auth·캐시·rate-limit 오류와 모든 설정 UI의 keyboard/ARIA fixture는 후속 상세화/검증 대상이다.
