# Track B: WebRTC pixel streaming (archived spike)

**Status:** Research only — the `native/engine-stream-poc/` crate was removed
2026-08-29. Findings are preserved here for when a real third-party/remote
engine without a web export forces Track B.

## Problem Track B solves

Some engines (Omniverse-class, production CAD, MonoGame without web export)
have **no WASM/HTML5 export**. Workspace still needs to present them as
"just a URL" in a Browser pane — same UX goal as Track A
(`workspace-engine://` web bundles for Godot/Bevy).

```
Engine picked
  ├─ Has WASM/web export? ──► Track A: workspace-engine:// (shipped)
  └─ No web export         ──► Track B: sidecar → encode → WebRTC → <video>
```

**Track A is always the default.** Build Track B only when a concrete engine
choice has no web-export path.

## What the spike proved (2026-08-28)

A standalone Rust binary (`engine-stream-poc`, since removed) verified:

1. Synthetic frames can be H.264-encoded (software `openh264`) and streamed via
   `webrtc-rs` to a browser client.
2. A real WebRTC peer (Python `aiortc`) received correctly sized, timed frames.
3. Signaling over `POST http://127.0.0.1:8787/offer` + browser `static/index.html`
   works as a minimal client.

### Bug found and fixed in the spike

Reading RTP payload type via `sender.get_parameters()` **before** SDP
negotiation completes returns the pre-negotiation default, not the settled
value. Frames sent with the wrong payload type are **silently dropped** on
the receiver with no error on the sender. Fix: read payload type only after
`set_local_description` / ICE gathering complete.

## Why this is NOT World Engine transport

Workspace's own engine (`world-engine-core`) is co-located, fully trusted,
same-machine. WebRTC adds:

- Lossy H.264 compression and encode latency for no benefit
- ICE/SDP negotiation overhead between processes we own via `spawn()`
- Open UDP port on localhost
- Payload-type class of bugs (above)

**World Engine integration instead:**

| Approach | Use |
|----------|-----|
| `world-engine-qt-shell` | **Default** — separate native window, zero input/embed issues |
| `world-engine-electron-embed` | Experimental in-pane wgpu (direct GPU, no video) |
| WebRTC / `engine-stream-poc` | **Not used** for our engine |

See [09-future-native-architecture.md](../architecture/09-future-native-architecture.md)
"Transport critique" and "World Engine build-out".

## Revised Track B design (not built)

When a real candidate appears:

1. **Rust sidecar** (not GStreamer in Electron main) — one static binary per platform.
2. **webrtc-rs** for transport (MIT/Apache-2.0, no GStreamer plugin tree).
3. **Hardware encode** primary (VideoToolbox / NVENC / VAAPI); software x264 fallback only.
4. **SHM handoff** engine → sidecar when possible; window capture as fallback.
5. **Input** via WebRTC data channel — hardest unsolved part (synthetic OS input
   or engine API).

## If reviving implementation

Do not resurrect the deleted crate verbatim. Start from this doc plus
`docs/architecture/09-future-native-architecture.md` Track B revision
(2026-08-28). The spike's only mandatory carry-over is the **post-negotiation
payload type** lesson.
