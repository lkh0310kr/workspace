# UI/UX 개선안

Workspace Electron 앱의 UI/UX 개선 백로그. 시각적 방향은 [DESIGN.md](./DESIGN.md)를 따른다 (Zed/Obsidian 톤, 절제된 radius·shadow·motion).

**리서치 원본:** [`ui-ux-improvements.worklog.md`](./ui-ux-improvements.worklog.md)  
**참고 구현 (읽기 전용):** `ref-proj/orca/`, `ref-proj/vscode/`

---

## 현재 상태

| 잘 되어 있는 것 | 부족한 것 |
|------------------|-----------|
| 통합 pane 탭 스트립, flexlayout 분할, Orca식 포커스 dimming | Quick Open이 빈약함 (경로만, 로딩·힌트 없음) |
| 플랫 컨텍스트 메뉴, 컴팩트 titlebar 탭 레일 | 단축키는 동작하지만 UI에 거의 안 보임 |
| light/dark/system 테마, terminal·browser pane | 빈 pane용 “여기서 시작” 워터마크 없음 |
| pane별 empty state (viewer, RSS, Japanese 등) | Explorer·Quick Open 로딩 표시 없음 |
| splitter·active tab 수정 완료 (2026-09-09) | CSS 5.6k줄 monolith, 토큰 파일 분리 전 |

---

## 참고 레포에서 가져올 것 / 버릴 것

| 출처 | 가져올 패턴 | 버릴 것 |
|------|-------------|---------|
| **orca** | Quick Open UX, hover-reveal (`can-hover`), split handle CSS, terminal title 대비, settings 사이드바 구조, modal focus 복귀 | shadcn pill, `--radius: 0.625rem`, 카드형 dashboard, glass blur |
| **vscode** | 빈 그룹 워터마크 + 단축키 칩, sash hover 의미, 시맨틱 색 *이름* 규칙, 비활성 그룹 dimming | Grid 엔진, DI/context key, extension settings registry, QuickInput 전체 |

**원칙:** Orca → **Electron UX 패턴**; VS Code → **IDE affordance**; **모양(geometry)** → DESIGN.md.

---

## 우선순위 백로그

### P0 — 매일 쓰는 것

1. **Quick Open v2** — 로딩 상태, 파일 타입 아이콘, dirname/파일명 분리, footer 힌트 (`Enter`, `↑↓`, `Esc`). 참고: `ref-proj/orca/.../QuickOpen.tsx`
2. **UI 단축키 라벨** — `formatShortcutLabel` + `.ui-kbd` 칩; Quick Open·컨텍스트 메뉴에 연결. 참고: orca `useShortcutLabel.ts`, vscode `keybindingLabel.ts`
3. **split/resize 피드백 검증** — flexlayout 토큰 (`--flexlayout-color-splitter*`) + explorer resizer; hover/drag 회귀 테스트

### P1 — 다듬기

4. **빈 pane 워터마크** — 의미 있는 콘텐츠가 없을 때 실행 가능한 단축키 3~5개 + live key label. 참고: vscode `editorGroupWatermark.ts`
5. **Modal focus 복귀** — Quick Open·설정 닫은 뒤 이전 editor/terminal로 focus. 참고: orca `useModalReturnFocus.ts`
6. **Explorer hover-reveal** — `@media (hover: hover)` 게이트; 터치에서는 항상 표시. 참고: orca `can-hover` + 테스트
7. **Terminal pane title 대비** — title chrome이 터미널 배경 밝기에 맞춤. 참고: orca `terminal-title-contrast.ts`
8. **테마 전환 가드** — 테마 바꿀 때 color transition 끄기. 참고: orca `theme-transition-disabled`

### P2 — 구조

9. **`tokens.css` 분리** — DESIGN.md v2 레이아웃; 시각 변경 없음
10. **Settings 사이드바** (설정 항목 늘어날 때) — popover 하나 대신 검색 가능한 섹션. 참고: orca settings page
11. **명령 팔레트 일부** — pane/workspace 액션용 `>` 접두 (VS Code 전체 복제 아님)
12. **아이콘 버튼 `focus-visible`** — titlebar, 탭 닫기, explorer 행

---

## PR 순서 제안

```
A  Quick Open v2 + CommandSurface primitive
B  Shortcut label helper + .ui-kbd
C  Pane empty watermark
D  tokens.css 분리
E  Terminal adaptive title chrome
```

해당 시 `// Ported from ref-proj/...` 주석 남길 것.

---

## 완료 (2026-09-09 기준선)

- Pane split divider hover/drag (flexlayout 토큰 수정)
- Active pane tab 밑줄 (`--shadow-inset-accent`)
- 디자인 토큰: `--radius-*`, `--shadow-*`, `--motion-*`
- Explorer sidebar resizer hover 라인
- DESIGN.md — border/shadow/animation 절제적 수용 반영

---

## 비목표

- VS Code Grid / QuickInput / configuration registry 재구현
- Orca shadcn 둥근 UI 그대로 복사
- Activity bar, SCM, minimap, extension marketplace UI
- Home dashboard를 SaaS 랜딩 페이지처럼 키우기
