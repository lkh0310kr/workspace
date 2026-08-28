# world-engine-core

An earlier iteration of World Engine — **transport-superseded, kept for
the record, not actively developed.** Same core idea as
[`../world-engine-qt-shell/`](../world-engine-qt-shell/) (a real engine
assembled from `wgpu` + `rapier3d` + `hecs` — rendering, physics, ECS,
not a hosted third-party engine), but this version streamed its output
over WebRTC (reusing [`../engine-stream-poc/`](../engine-stream-poc/)'s
transport) to a browser client, instead of rendering directly into a
native window.

## Why it's superseded

The WebRTC transport itself turned out to be the wrong tool once the
question became "how does *our own* engine, co-located and fully
trusted, talk to Workspace" rather than "how do we host a third party's
output." WebRTC solves problems (NAT traversal, untrusted networks,
browser cross-origin security) that don't exist between a process this
app spawns and this app's own main process on the same machine — real
costs, not hypothetical: lossy H.264 compression for a same-machine pipe
with no bandwidth constraint, an ICE handshake to connect two processes
already related by `spawn()`, and a real payload-type negotiation bug
that exists purely because of WebRTC's negotiation model. Full reasoning
in the "Transport critique" section of
[`docs/architecture/09-future-native-architecture.md`](../../docs/architecture/09-future-native-architecture.md).

`world-engine-qt-shell` replaced this: `wgpu` renders directly into a
real native window's surface — no encode, no network stack, no
readback.

## Build (if you want to look at it)

```sh
cargo build
cargo run
```

Same physics-driven single cube as the other early World Engine spikes,
streamed over WebRTC — open `static/index.html` (served separately,
e.g. `python3 -m http.server`) to view it. Not maintained going forward;
`world-engine-qt-shell` is where new engine work happens.
