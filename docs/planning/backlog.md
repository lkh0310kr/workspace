# 백로그

## 진행 중

### PKMS folder sync root 교체 안전성

- **문제:** `configurePkmsSyncBridge`가 workspace에 다른 root를 연결할 때 directory inventory와 pending delete를 초기화하지만 path baseline은 유지한다. 새 root full scan이 기존 baseline path의 부재를 local deletion으로 해석할 가능성이 있다. 이는 source 대조에서 확인한 경로이며 실제 원격 삭제 동작은 아직 재현 테스트하지 않았다.
- **요구 결과:** root 교체는 그 자체로 원격 파일/폴더 삭제 의사가 아니다. 새 root는 명시적 연결/이전 절차로 inventory를 seed하고, 첫 complete reconciliation에서 remote-only 항목을 보존한다. 의도적으로 다른 local tree를 authoritative source로 삼으려면 destructive action을 별도 확인하고 복구 가능성을 제공한다.
- **완료 조건:** 기존 remote workspace가 populated된 상태에서 새 empty/populated root로 재연결, process restart, partial scan, concurrent remote update를 시험한다. 의도하지 않은 file/folder tombstone이 없고, 명시적 사용자 선택 없이는 remote baseline을 삭제 의도로 전환하지 않는다. migration/OS matrix와 evidence를 기록한다.
- **스펙:** [Folder sync 결과·durability 계약](../../apps/workspace-app/docs/pkms/folder-sync/README.md), [삭제 acceptance](../../apps/workspace-app/docs/pkms/folder-sync/deletion.md)

### Workspace Home 운영 연결과 제품 acceptance

- **문제:** 앱·서버 디렉터리 분리와 Home source 복구는 구현됐지만 provider 운영 연결과 제품 acceptance가 남아 있다.
- **범위:** 기존 앱 경계를 유지하며 Home OAuth client secrets/callback을 설정하고 provider를 재연결한다. Web/Desktop/native acceptance와 source/배포 상태 기록을 맞춘다.
- **완료 조건:** Home 대시보드가 다시 동작하고 Cloudflare/Supabase 연결과 상태 API를 제공한다. PKMS 서버는 PKMS 기능만 소유한다. Web·Desktop·iOS는 같은 PKMS 서버 계약을 사용한다. CI, 개발/배포 명령, 문서가 새 경로를 가리키며 각 앱 경계를 독립적으로 검증할 수 있다.
- **설계 기준:** [제품별 앱 경계](../architecture/08-monorepo-module-boundaries.md)

### Editor 탐색·Markdown 문서 품질 완성

- **문제:** TreeView가 다시 열리지 않고 scroll 위치가 선택/열기 뒤에도 유지되지 않는다고 보고됐다. Markdown 파일 제목과 본문 폭이 어긋나고, 표는 읽기 전용 text widget이며 Mermaid/TeX 렌더링 경로가 없다. HTML 정책과 Obsidian/Notion 대비 문서 결과도 미완성이다.
- **요구 결과:** Explorer open/visible state와 scroll restoration이 일치하고, 파일 제목·본문 column이 함께 정렬된다. 표·수식·다이어그램·HTML은 source를 보존하며 편집 가능한 predictable preview를 제공한다. 미지원 syntax는 사라지거나 깨진 output 대신 원문을 보인다.
- **착수 순서:** P0 Explorer 재열기/scroll을 실제 pane에서 재현·수용 → P0 title/width 통일 → Markdown syntax compatibility ledger → 직접 편집 표 → inline/display/table TeX → Mermaid → 안전한 HTML → 채택된 Obsidian/Notion 편집 상호작용.
- **완료 조건:** [Editor 완성도 목표 스펙](../../packages/editor/docs/markdown/product-completeness.md)의 EXP/DOC/MD/TBL/TEX/DIA/HTML/KEY acceptance를 실제 실행 화면과 file round-trip으로 확인한다. typecheck만으로 완료하지 않으며 scroll/reopen issue는 실행 증거가 생길 때까지 열린다.
- **기준:** [현재 Markdown 구현](../../packages/editor/docs/markdown/README.md), [TreeView](../../packages/editor/docs/treeview/README.md), [탐색 검토](./editor-navigation-review.md)

## 문서·검증 체계 정비

### 제품 전체 스펙 주도 개발 전환

- **문제:** 상위 구조 설명과 현재 구현의 불일치, 기능별 계약 누락, 수락 기준과 실행 검증의 연결 부족으로 문서에서 코드를 재생성할 때 동작을 보존하기 어렵다.
- **범위:** [Top-down 감사](./top-down-documentation-audit.md)의 AUD-01~24와 [SDD 전환 계획](./spec-driven-development-roadmap.md)의 WP-01~12. 모듈 상세는 앱·패키지 소유 문서에 두고 최상단은 연결한다.
- **착수 순서:** 제품/기능 inventory → 현재 기준 충돌 정리 → 계약·영속 상태 지도와 CI/test 경로 → Shell·Terminal·PKMS 등 영역별 스펙 → 독립 단위 재생성 검증.
- **완료 조건:** 기능별 owner·현재 상태·스펙·검증 경로를 찾을 수 있고, 핵심 여정의 정상/실패/경합/복구 계약이 소스와 일치한다. 재생성 검증 여부와 남은 배포/native acceptance를 구분한다.
- **현재 상태:** 감사·기획 및 global/app/package 초기 문서화를 커밋했다. [진행 표](./spec-driven-development-roadmap.md)의 partial 범위와 CI·상세 fixture·native acceptance가 남아 있다.

## 다음

- PKMS·Workspace Editor 제품 acceptance와 호환 UI 정리 — [구현 상태·잔여 수락](./editor-unification.md)
- Home 상세 시스템 정보: 프로세스별 Activity Monitor·상세 Storage. 기존 CPU/메모리/홈 volume summary와 범위를 구분

