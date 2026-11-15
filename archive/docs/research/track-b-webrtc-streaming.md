# Track B: WebRTC 픽셀 스트리밍 (보관된 실험)

**상태:** 조사 기록 전용 — `native/engine-stream-poc/` crate는 2026-08-29에 제거했습니다.
웹 내보내기를 지원하지 않는 실제 타사/원격 엔진 때문에 Track B가 필요해질 경우를 위해 조사 결과를 보존합니다.

## Problem Track B solves

일부 엔진(Omniverse급, 상용 CAD, 웹 내보내기를 지원하지 않는 MonoGame)은 **WASM/HTML5 내보내기를 지원하지 않습니다**. Workspace는 이 엔진도
"just a URL" in a Browser pane — same UX goal as Track A
(`workspace-engine://` web bundles for Godot/Bevy).

```
Engine picked
  ├─ Has WASM/web export? ──► Track A: workspace-engine:// (shipped)
  └─ No web export         ──► Track B: sidecar → encode → WebRTC → <video>
```

**Track A를 항상 기본으로 합니다.** 구체적인 엔진이 웹 내보내기 경로를 제공하지 않을 때만 Track B를 구현합니다.

## What the spike proved (2026-08-28)

독립형 Rust 바이너리(`engine-stream-poc`, 현재 제거됨)로 다음을 확인했습니다.

1. Synthetic frames can be H.264-encoded (software `openh264`) and streamed via
   `webrtc-rs` to a browser client.
2. A real WebRTC peer (Python `aiortc`) received correctly sized, timed frames.
3. Signaling over `POST http://127.0.0.1:8787/offer` + browser `static/index.html`
   works as a minimal client.

### Bug found and fixed in the spike

SDP 협상이 끝나기 **전에** `sender.get_parameters()`로 RTP payload type을 읽으면 협상 후 값이 아닌 협상 전 기본값이 반환됩니다. 잘못된 payload type으로 전송한 프레임은 송신 측 오류 없이 수신 측에서 **조용히 폐기됩니다**. 해결 방법: payload type은
`set_local_description` / ICE gathering complete.

## Why this is NOT World Engine transport

Workspace의 자체 엔진(`world-engine-core`)은 같은 시스템에 함께 있으며 완전히 신뢰할 수 있습니다. WebRTC를 추가하면 다음 비용이 생깁니다.

- Lossy H.264 compression and encode latency for no benefit
- ICE/SDP negotiation overhead between processes we own via `spawn()`
- Open UDP port on localhost
- Payload-type class of bugs (above)

**World Engine 통합 방식:**

| 방식 | 용도 |
|----------|-----|
| `world-engine-qt-shell` | **Default** — separate native window, zero input/embed issues |
| `world-engine-electron-embed` | Experimental in-pane wgpu (direct GPU, no video) |
| WebRTC / `engine-stream-poc` | **Not used** for our engine |

See [네이티브 아키텍처 조사 기록](./native-architecture-history.md) for the historical transport critique; current integration direction is in [도구 호스팅 경계](../architecture/09-tool-hosting.md).

## Revised Track B design (not built)

실제 적용 대상이 생기면 다음과 같이 진행합니다.

1. **Rust sidecar** (Electron main의 GStreamer가 아님) — 플랫폼별 정적 바이너리 하나.
2. **webrtc-rs** for transport (MIT/Apache-2.0, no GStreamer plugin tree).
3. **하드웨어 인코딩**을 우선 사용(VideoToolbox / NVENC / VAAPI)하고, 소프트웨어 x264는 대체 경로로만 사용.
4. 가능하면 엔진에서 sidecar로 **SHM 전달**을 사용하고, 대체 경로로 창 캡처 사용.
5. WebRTC data channel을 통한 **입력** — 아직 해결되지 않은 가장 어려운 부분(OS 입력 합성 또는 엔진 API).

## If reviving implementation

삭제한 crate를 그대로 되살리지 않습니다. 이 문서와
`docs/research/native-architecture-history.md` Track B 개정본(2026-08-28)에서 다시 시작합니다. 실험에서 반드시 가져올 교훈은 **협상 완료 후 payload type을 읽어야 한다**는 점뿐입니다.
