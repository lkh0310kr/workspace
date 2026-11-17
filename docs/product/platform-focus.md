# 제품 집중 범위

Workspace의 현재 제품 중심은 Desktop에서 로컬 파일을 편집하는 경험이다. 사용자는 폴더를 열고 기본 Editor에서 문서와 코드를 편집하며, 같은 작업 공간에서 Home, Terminal, Browser를 사용한다.

- **Desktop:** 로컬 폴더와 파일의 접근·저장을 소유한다. 외부 동기화 앱이 관리하는 경로도 일반 로컬 폴더로 연다.
- **기능 패키지:** Home, Browser, Terminal, Editor의 UI와 기능별 도메인을 소유한다. Desktop은 Electron, 운영체제 기능, IPC 등 host 능력을 제공한다.
- **Server:** 배포 상태를 확인하는 `GET /api/health`만 제공한다. Editor와 Desktop 사용은 Server에 의존하지 않는다.
- **범위 밖:** 앱 내부 계정, 클라우드 파일 동기화, 서비스 자격 증명 관리, 공동 편집은 현재 제품 기능이 아니다.

현재 실행 앱은 `apps/desktop/`과 `apps/server/`다. 이전 제품과 보류 프로젝트는 `archive/`에 보존하며, 활성 제품 설명과 기능 목록에는 포함하지 않는다.
