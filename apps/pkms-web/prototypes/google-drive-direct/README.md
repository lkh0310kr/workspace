# Google Drive 직접 연결 prototype

Google Drive API v3에 직접 접근하는 정적 브라우저 prototype이다. 애플리케이션 backend가 없으며 PKMS Worker, PKMS Server, Supabase, GitHub를 호출하지 않는다. 사용자가 생성/연결 버튼을 누른 뒤 `Workspace Drive Prototype` 폴더 안에만 데이터를 만든다.

## Web client ID 발급

1. [Google Cloud Console OAuth clients](https://console.cloud.google.com/auth/clients)을 열고 프로젝트를 선택하거나 새로 만든다.
2. 프로젝트에서 **Google Drive API**를 사용 설정한다.
3. Google Auth Platform audience를 **External / Testing**으로 설정하고 테스트 사용자에 Google 계정을 추가한다.
4. 애플리케이션 유형이 **Web application**인 OAuth client를 만든다.
5. Authorized JavaScript origin에 `http://localhost:4173`을 추가한다. GIS token model에는 redirect URI가 필요하지 않다.
6. Data Access에는 Drive scope `https://www.googleapis.com/auth/drive.file`만 추가한다. 이 prototype에서 OAuth client secret을 사용하지 않는다.
7. `.apps.googleusercontent.com`으로 끝나는 client ID를 복사한다.

Web client ID는 공개 식별자다. 편의를 위해 이 브라우저의 localStorage에 저장하지만 access token은 아니다. OAuth 인증에는 Google popup/dialog flow를 사용한다. Google은 로컬 테스트를 위해 port를 포함한 localhost origin을 등록하도록 요구한다. 자세한 내용은 [Google: Get a client ID](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid)를 참고한다.

## 실행

저장소 root에서 실행한다.

```sh
npm run drive:prototype --workspace @pkms/web
```

`http://localhost:4173`을 열고 Web client ID를 붙여 넣은 뒤 Google Drive에 연결한다. Vite server는 정적 개발 파일만 제공하며 OAuth/API backend가 아니다. Production Web 배포를 위해서는 static hosting origin도 Google에 등록해야 한다.

## 실험 항목

- `drive.file`로 연결하며 access token은 JavaScript memory에만 보관한다.
- 남은 시간은 응답의 실제 `expires_in` 값을 사용한다. 만료 후에는 **Google Drive 연결**을 다시 눌러야 하며 server-side 또는 자동 refresh token은 없다.
- Drive에 표시되는 prototype root, 폴더, Markdown 파일을 만들고 목록 조회, 편집, 이름 변경, 휴지통 이동을 수행한다.
- Drive change feed를 초기화하고 조회한다. 모든 결과 page를 읽은 뒤에만 저장된 시작 cursor를 앞으로 이동한다.
- 편집한 note를 저장하기 전 Drive metadata/checksum을 다시 읽는다. 파일이 바뀌었다면 조용히 덮어쓰지 않고 conflict copy로 보존한다. 이 prototype의 사전 확인은 기기 간 atomic compare-and-swap이 아니다.

Drive scope를 사용하는 External/Testing OAuth grant는 개별 access token의 수명은 더 짧더라도 7일 뒤 만료된다. 이 설정은 권한 취소와 재동의를 시험할 수 있지만, 사용자 개입이 없는 상시 sync에는 적합하지 않다. Production background sync 전에 OAuth app을 production으로 전환하고 검증한다. 자세한 내용은 [Google OAuth token lifecycle](https://developers.google.com/identity/protocols/oauth2)을 참고한다.

## 데이터 정리

UI의 **휴지통으로** action은 선택한 prototype 항목을 복구 가능한 Drive 휴지통으로 이동한다. 이 폴더를 PKMS 데이터에 사용하지 않는다. 앱은 prototype root ID와 root별 change cursor만 localStorage에 저장한다. **목록 새로고침**을 눌러 Drive의 현재 상태를 가져온다.
