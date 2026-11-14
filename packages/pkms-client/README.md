# PKMS client package

Web/Desktop에서 공유하는 PKMS UI, 계정, 파일, 문서 session, Realtime/cache를 제공한다. [구현 계약](../../docs/architecture/pkms/client/README.md)에서 시작한다. 공유 Editor는 Editor package, native HTTP와 folder 권한은 Desktop app, 서버 mutation은 PKMS Server가 소유한다.

공개 subpath는 PkmsClientApp, hostEvents, styles.css이며 [manifest](./package.json)를 기준으로 한다. 이 package는 독립 배포 앱이 아니다. Web route와 Desktop pane이 각자의 Router·style/environment를 제공한다.
