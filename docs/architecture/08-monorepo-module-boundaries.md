# 모노레포 모듈 경계

활성 앱은 `apps/desktop`과 `apps/server`다. 공유 편집기 계약과 UI는 `packages/editor`에 둔다. 자세한 구현 문서는 각 모듈의 기준 문서와 `docs/` 아래 기능 문서가 소유한다.

## 앱 경계

| 앱 | 책임 | 기준 |
| --- | --- | --- |
| Desktop | Electron shell, 로컬 파일, 터미널, 브라우저, 뷰어와 기기 정보 | [Workspace 문서](./workspace/README.md) |
| Server | 서비스 API, OAuth 연결, 암호화된 자격 증명과 D1 | [Server 문서](./workspace-server/README.md) |

## 패키지 경계

| 패키지 | 책임 | 소비자 |
| --- | --- | --- |
| `editor` | provider 계약, tree, CodeMirror, Markdown, 공통 UI | Desktop |

앱은 package를 import할 수 있고 package는 앱 구현을 import하지 않는다. Desktop의 Electron/native 의존성 설치는 root npm workspace와 별도다.

## 운영 기준

Workspace Server 인증 issuer와 JWKS 주소는 배포 환경에서 명시적으로 설정한다. 외부 identity 제공자가 설정되지 않으면 인증된 API는 fail closed 해야 한다. 기존 데이터와 제공자 grant의 운영·배포 변경은 코드 보관 작업과 별도로 수행한다.
