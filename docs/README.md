# 문서 안내

## 바로가기

- [백로그](./backlog.md) — 진행 중인 작업
- [시스템 구조](./architecture/README.md) — 실제 구현 구조와 읽는 순서
- [디자인 원칙](./DESIGN.md) — 레이아웃, 색상, 상호작용 기준
- [개발 로드맵](./ROADMAP.md) — 저장소의 큰 방향과 단계
- [수동 QA 체크리스트](./manual-qa-checklist.md) — 릴리스 전 주요 흐름
- [UI/UX 개선 기록](./ui-ux-improvements.md) — 화면 개선 후보와 완료 내역
- [하드웨어 부품 자료표](./hardware/component-datasheet-matrix.md)
- [Windows 빌드 안내](./windows-build.md)
- [연구·실험 기록](./research/README.md)

## 문서 영역

| 경로 | 용도 |
|------|------|
| `architecture/` | 현재 구현 구조와 장기 기술 방향. `README.md`에서 읽는 순서를 안내합니다. |
| `planning/` | CAD, 하드웨어 시뮬레이션, World Engine 등 기능별 계획 |
| `research/` | 제품에 포함하지 않은 조사와 실험 기록 |
| `hardware/` | 전자 부품과 데이터시트 출처 |

## 아이디어 메모

- [제품 아이디어](./ideation.md) — 제품 방향과 보류 중인 pane 후보
- [미정 아이디어](./backlog-ideas.md) — 일정에 포함하지 않은 메모

구현 여부와 현재 동작의 기준은 문서가 아니라 `apps/workspace/`와 관련 Rust crate 코드입니다. 계획 문서의 범위와 상태를 확인한 뒤 구현으로 취급하세요.

문서는 한국어를 기본으로 씁니다. 코드 식별자, 경로, 명령, 외부 API 이름은 원문을 유지합니다. 기존 영문 계획·역사 문서는 정리 과정에서 순차적으로 번역합니다.
