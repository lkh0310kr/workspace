# 프로세스와 IPC

Desktop은 Electron Main, preload, renderer 세 경계를 사용한다.

| 경계 | 책임 | 기준 |
| --- | --- | --- |
| Main | 파일 시스템, 터미널, 네이티브 프로토콜과 운영체제 권한 | [`apps/desktop/src/main`](../../apps/desktop/src/main/) |
| Preload | 허용한 Main 기능만 타입이 있는 API로 노출 | [`apps/desktop/src/preload`](../../apps/desktop/src/preload/) |
| Renderer | UI, 로컬 Editor provider, pane 상태와 사용자 입력 | [`apps/desktop/src/renderer`](../../apps/desktop/src/renderer/) |

파일을 읽고 쓰는 호출은 Renderer에서 임의 파일 API를 직접 호출하지 않고 제한된 preload bridge를 거친다. 각 IPC family의 입력, 권한과 lifecycle은 [Workspace IPC 지도](./workspace/ipc/README.md)에서 관리한다.
