# 제품 집중 범위

Workspace의 현재 제품 범위는 Desktop 로컬 파일 편집과 이를 지원하는 Server다.

- **Desktop:** 사용자가 선택한 로컬 폴더를 기본 Editor에서 편집한다. Google Drive 동기화 폴더는 일반 로컬 폴더로 연다.
- **Server:** Desktop 편집과 분리된 Workspace 서비스 API를 유지한다. 인증 issuer와 키 집합은 배포 환경에서 명시적으로 설정한다.
- **보류:** 계정 기반 문서 서비스, 앱 내부 동기화와 공동 편집 기능은 활성 개발·검증 대상에서 제외한다.

현재 활성 앱 디렉터리는 `apps/desktop/`과 `apps/server/`다. 이전 제품 구현과 설계 자료는 `archive/`에 보존한다.
