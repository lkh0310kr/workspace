# PKMS client package

Package scope의 Web/Desktop 공용 PKMS UI·계정·파일·문서 session·Realtime/cache다. [package 계약](../../docs/architecture/pkms/client/README.md)에서 시작한다. 공유 Editor는 packages/editor, native HTTP·folder 권한은 Desktop app, 서버 mutation은 PKMS Server가 소유한다.

공개 subpath는 PkmsClientApp, hostEvents, styles.css이며 [manifest](./package.json)가 기준이다. 이 패키지는 독립 배포 앱이 아니다. Web route와 Desktop pane이 각각 Router·style/environment를 제공한다.
