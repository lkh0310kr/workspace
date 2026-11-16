# 백로그

## 진행 중

### Desktop 로컬 Editor 수락

- **목표:** 사용자가 선택한 로컬 폴더의 Markdown·코드 파일을 기본 Editor에서 편집하고 저장한다.
- **확인:** 파일 열기·편집·autosave·rename·외부 변경 감지와 충돌 표시를 확인한다.
- **폴더 동기화:** Google Drive 데스크톱 앱이 로컬에 동기화한 경로를 일반 폴더처럼 열어 편집한다. 앱은 별도 cloud sync queue나 계정을 만들지 않는다.
- **완료 조건:** 로컬 일반 폴더와 동기화 폴더에서 같은 편집 동작을 확인하고 문서 round-trip 결과를 기록한다.

### Server identity 설정

- **목표:** Server API는 명시적으로 설정한 identity issuer/JWKS로 검증한 token만 받는다.
- **현재 상태:** repository 설정은 identity 주소를 비워 두어 미설정 상태에서 fail closed 한다.
- **완료 조건:** 배포 전에 신뢰할 issuer·JWKS·audience와 provider OAuth callback을 설정하고 health 및 인증 요청을 확인한다.

## 다음

### Editor 탐색·Markdown acceptance

- Quick Open과 파일 내용 검색 결과가 올바른 파일·줄을 열고, 문서 전환 뒤 선택·scroll state를 복원하는지 확인한다.
- Markdown 표·링크·이미지·Mermaid·코드 fence가 저장 파일과 화면에서 일치하는지 확인한다.

### 경로 변경 뒤 CI 확인

- Desktop build/release와 Server deploy workflow가 `apps/desktop`·`apps/server` 경로를 사용하는지 확인한다.
- root workspace lockfile과 별도 Desktop lockfile을 재현 설치한다.
