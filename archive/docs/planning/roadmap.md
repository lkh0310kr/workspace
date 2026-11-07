# 개발 로드맵

Workspace는 코드·문서·터미널·브라우저를 한 작업 공간에서 함께 사용하는 데스크톱 앱입니다. 전문 도구 통합은 실제 사용자 작업을 끝까지 지원할 범위가 정해질 때만 제품 계획으로 채택합니다.

## 현재 제품

- 핵심 Workspace: 탭, 분할 pane, Terminal, Browser, Editor, 파일 탐색과 미리보기
- PKMS: Markdown 지식 관리와 Web/Desktop/iOS 간 동기화
- Home: Workspace의 운영 화면. 서비스 상태 API가 PKMS Worker에 결합된 구조를 분리하는 일이 현재 다음 백엔드 작업입니다.
- World Engine, Hardware Simulator, 3D/CAD Viewer: 구현된 전문 도구 프로토타입. 추가 범위와 우선순위는 아직 채택하지 않았습니다.

## 원칙

- 한 번에 하나의 새 작업만 백로그에서 진행합니다.
- 새 기능은 대상 사용자 작업과 첫 완료 조건이 명확할 때만 채택합니다.
- 기존 전문 도구가 해결하는 문제는 직접 재구현하기 전에 연결 비용과 유지 비용을 비교합니다.
- 구현되지 않은 아이디어와 phase 목록을 일정이나 약속으로 취급하지 않습니다.

현재 구현 범위는 [기능 상태](./feature-status.md), 실행 순서는 [백로그](./backlog.md)를 봅니다.
