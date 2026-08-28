# engine-stream-poc

A transport feasibility spike — **still the right answer for the problem
it actually solves, just not how World Engine (Workspace's own engine)
talks to the app.** Proves a Rust process can stream real frames over a
genuine WebRTC connection to a browser-based client: generates synthetic
animated frames, encodes them with `openh264` (software), and streams
them via `webrtc-rs` — verified with a real WebRTC peer (Python's
`aiortc`, not a mock), which received and decoded correctly-sized,
correctly-timed video frames.

## What this is actually for

Not World Engine's own transport (see
[`../world-engine-qt-shell/`](../world-engine-qt-shell/) and the
"Transport critique" in
[`docs/architecture/09-future-native-architecture.md`](../../docs/architecture/09-future-native-architecture.md)
for why WebRTC was the wrong tool for a same-machine, fully-trusted
pipe). This spike is the right shape for a genuinely different problem —
**Track B**: hosting a *third-party* or *remote* engine that needs to
present as "just a URL" the same way Track A's `workspace-engine://`
web-bundle hosting already does for engines with a real WASM/web export
(Godot, Bevy). Not wired into anything yet; kept as a verified reference
for whenever a real Track B candidate (e.g. something Omniverse-class,
with no web export path) actually gets picked up.

## One real bug found and fixed here

The RTP payload type was read via `sender.get_parameters()` immediately
after `add_track()`, before SDP negotiation actually finished — at that
point it only reflects the sender's own pre-negotiation default, not
what offer/answer settled on. Every frame sent with the wrong payload
type was silently rejected receiver-side with *no error surfaced on the
sending side at all*. Fixed by reading the negotiated payload type only
after `set_local_description`/ICE-gathering-complete.

## Build & run

```sh
cargo build
cargo run
```

Then open `static/index.html` in a browser (served separately, e.g.
`python3 -m http.server` in `static/`) — it POSTs a WebRTC offer to
`http://127.0.0.1:8787/offer` and plays whatever comes back.
