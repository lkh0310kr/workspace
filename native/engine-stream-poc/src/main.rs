// World Engine Track B feasibility spike — see
// docs/architecture/09-future-native-architecture.md's "Unified hosting
// design" section. Proves the core chain works at all: a standalone Rust
// process generates synthetic animated frames, encodes them to H.264
// (software, via openh264 — hardware VideoToolbox is a stated follow-up,
// not this spike), and streams them over WebRTC to a plain browser page.
// No real engine, no Electron involvement — see the plan's explicit
// non-goals.
//
// webrtc-rs's published 0.20.x is the newer sans-IO-backed rewrite (API
// split across the `webrtc` and `rtc` crates) — this file follows the
// shape of the upstream `play-from-disk-h26x` example
// (webrtc-rs/webrtc/examples/examples/play-from-disk-h26x), adapted from
// "read H.264 from a file, signal over stdin" to "generate+encode frames
// in-process, signal over one HTTP POST".

use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use openh264::encoder::{Encoder, EncoderConfig};
use openh264::formats::{RgbSliceU8, YUVBuffer};
use openh264::OpenH264API;
use rtc::interceptor::Registry;
use rtc::media::Sample;
use rtc::media_stream::MediaStreamTrack;
use rtc::peer_connection::configuration::interceptor_registry::register_default_interceptors;
use rtc::peer_connection::configuration::media_engine::{MediaEngine, MIME_TYPE_H264};
use rtc::peer_connection::configuration::RTCConfigurationBuilder;
use rtc::peer_connection::sdp::RTCSessionDescription;
use rtc::peer_connection::transport::RTCIceServer;
use rtc::rtp_transceiver::rtp_sender::{
    RTCRtpCodec, RTCRtpCodecParameters, RTCRtpCodingParameters, RTCRtpEncodingParameters,
    RtpCodecKind,
};
use warp::Filter;
use webrtc::media_stream::track_local::static_sample::TrackLocalStaticSample;
use webrtc::media_stream::track_local::TrackLocal;
use webrtc::peer_connection::{
    PeerConnection, PeerConnectionBuilder, PeerConnectionEventHandler, RTCIceGatheringState,
    RTCPeerConnectionState,
};
use webrtc::runtime::{channel, Sender};

const WIDTH: usize = 640;
const HEIGHT: usize = 360;
const FPS: u64 = 30;
const FRAME_DURATION: Duration = Duration::from_millis(1000 / FPS);
const SIGNALING_PORT: u16 = 8787;

#[derive(Clone)]
struct Handler {
    gather_complete_tx: Sender<()>,
    connected_tx: Sender<()>,
}

#[async_trait::async_trait]
impl PeerConnectionEventHandler for Handler {
    async fn on_ice_gathering_state_change(&self, state: RTCIceGatheringState) {
        if state == RTCIceGatheringState::Complete {
            let _ = self.gather_complete_tx.try_send(());
        }
    }

    async fn on_connection_state_change(&self, state: RTCPeerConnectionState) {
        println!("peer connection state: {state}");
        if state == RTCPeerConnectionState::Connected {
            let _ = self.connected_tx.try_send(());
        }
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    println!("engine-stream-poc: World Engine Track B feasibility spike");
    println!(
        "Open static/index.html in a browser (it POSTs to http://127.0.0.1:{SIGNALING_PORT}/offer)"
    );

    let offer_route = warp::path("offer")
        .and(warp::post())
        .and(warp::body::json())
        .and_then(handle_offer);

    let cors = warp::cors()
        .allow_any_origin()
        .allow_methods(vec!["POST"])
        .allow_headers(vec!["content-type"]);

    warp::serve(offer_route.with(cors))
        .run(([127, 0, 0, 1], SIGNALING_PORT))
        .await;

    Ok(())
}

async fn handle_offer(
    offer: RTCSessionDescription,
) -> std::result::Result<impl warp::Reply, std::convert::Infallible> {
    match negotiate_and_stream(offer).await {
        Ok(answer) => Ok(warp::reply::json(&answer)),
        Err(err) => {
            eprintln!("offer handling failed: {err:#}");
            Ok(warp::reply::json(
                &serde_json::json!({ "error": err.to_string() }),
            ))
        }
    }
}

async fn negotiate_and_stream(offer: RTCSessionDescription) -> Result<RTCSessionDescription> {
    let mut media_engine = MediaEngine::default();
    let video_codec = RTCRtpCodecParameters {
        rtp_codec: RTCRtpCodec {
            mime_type: MIME_TYPE_H264.to_owned(),
            clock_rate: 90000,
            channels: 0,
            sdp_fmtp_line: "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f"
                .to_owned(),
            rtcp_feedback: vec![],
        },
        payload_type: 102,
        ..Default::default()
    };
    media_engine.register_codec(video_codec.clone(), RtpCodecKind::Video)?;

    let registry = register_default_interceptors(Registry::new(), &mut media_engine)?;

    let config = RTCConfigurationBuilder::new()
        .with_ice_servers(vec![RTCIceServer {
            urls: vec!["stun:stun.l.google.com:19302".to_string()],
            ..Default::default()
        }])
        .build();

    let (gather_complete_tx, mut gather_complete_rx) = channel::<()>(1);
    let (connected_tx, mut connected_rx) = channel::<()>(1);
    let handler = Arc::new(Handler {
        gather_complete_tx,
        connected_tx,
    });

    let peer_connection = PeerConnectionBuilder::new()
        .with_configuration(config)
        .with_media_engine(media_engine)
        .with_interceptor_registry(registry)
        .with_handler(handler)
        .with_udp_addrs(vec!["0.0.0.0:0".to_string()])
        .build()
        .await?;

    let ssrc = rand::random::<u32>();
    let video_track: Arc<TrackLocalStaticSample> = Arc::new(TrackLocalStaticSample::new(
        MediaStreamTrack::new(
            "engine-stream-poc-stream".to_owned(),
            "engine-stream-poc-track".to_owned(),
            "engine-stream-poc".to_owned(),
            RtpCodecKind::Video,
            vec![RTCRtpEncodingParameters {
                rtp_coding_parameters: RTCRtpCodingParameters {
                    ssrc: Some(ssrc),
                    ..Default::default()
                },
                codec: video_codec.rtp_codec.clone(),
                ..Default::default()
            }],
        ),
    )?);
    let sender = peer_connection
        .add_track(Arc::clone(&video_track) as Arc<dyn TrackLocal>)
        .await?;

    peer_connection.set_remote_description(offer).await?;
    let answer = peer_connection.create_answer(None).await?;
    peer_connection.set_local_description(answer).await?;

    // Non-trickle ICE: wait for gathering to finish, then hand back one
    // complete SDP answer.
    let _ = gather_complete_rx.recv().await;

    let local_desc = peer_connection
        .local_description()
        .await
        .ok_or_else(|| anyhow::anyhow!("no local description after gathering"))?;

    // Why (found via a real failed test run, not assumed): reading this
    // right after add_track() — before negotiation — returned this
    // sender's own pre-negotiation default payload type (102), not what
    // SDP offer/answer actually settled on. The remote peer's offer can
    // propose a different payload-type number for the same codec (e.g.
    // 101), and every RTP packet sent with the wrong PT gets silently
    // rejected receiver-side ("payload type is not negotiated on this
    // sender leg") — zero frames arrive, no error surfaces to the
    // sender. Must read this *after* set_local_description/negotiation.
    let payload_type = sender
        .get_parameters()
        .await?
        .rtp_parameters
        .codecs
        .first()
        .map(|codec| codec.payload_type)
        .ok_or_else(|| anyhow::anyhow!("sender has no negotiated codec"))?;

    tokio::spawn(async move {
        if connected_rx.recv().await.is_none() {
            return;
        }
        println!("connected — streaming synthetic frames");
        if let Err(err) = stream_synthetic_frames(video_track, ssrc, payload_type).await {
            eprintln!("frame streaming stopped: {err:#}");
        }
    });

    Ok(local_desc)
}

async fn stream_synthetic_frames(
    track: Arc<TrackLocalStaticSample>,
    ssrc: u32,
    payload_type: rtc::rtp_transceiver::PayloadType,
) -> Result<()> {
    let mut encoder = Encoder::with_api_config(OpenH264API::from_source(), EncoderConfig::new())?;
    let mut ticker = tokio::time::interval(FRAME_DURATION);
    let mut frame_index: u32 = 0;

    loop {
        ticker.tick().await;
        let rgb = render_test_pattern(frame_index);
        let yuv = YUVBuffer::from_rgb_source(RgbSliceU8::new(&rgb, (WIDTH, HEIGHT)));
        // Scoped so the non-`Send` `EncodedBitStream` (holds raw pointers
        // into the encoder's internal buffer) is dropped before the
        // `.await` below — otherwise it gets captured in this async fn's
        // state machine across the yield point, which tokio::spawn (the
        // caller) requires to be `Send`.
        let data: Vec<u8> = {
            let bitstream = encoder.encode(&yuv)?;
            bitstream.to_vec()
        };

        track
            .sample_writer(ssrc, payload_type)
            .write_sample(&Sample {
                data: data.into(),
                duration: FRAME_DURATION,
                ..Default::default()
            })
            .await?;

        frame_index = frame_index.wrapping_add(1);
    }
}

/// Animated diagonal color-bar sweep — deliberately simple (no real engine
/// yet, see the plan's non-goals), just enough motion to visually confirm
/// live frames are actually arriving rather than one static image.
fn render_test_pattern(frame_index: u32) -> Vec<u8> {
    let mut rgb = vec![0u8; WIDTH * HEIGHT * 3];
    let shift = (frame_index % WIDTH as u32) as usize;
    for y in 0..HEIGHT {
        for x in 0..WIDTH {
            let idx = (y * WIDTH + x) * 3;
            let band = ((x + shift) / 40) % 6;
            let (r, g, b): (u8, u8, u8) = match band {
                0 => (255, 0, 0),
                1 => (0, 255, 0),
                2 => (0, 0, 255),
                3 => (255, 255, 0),
                4 => (0, 255, 255),
                _ => (255, 0, 255),
            };
            rgb[idx] = r;
            rgb[idx + 1] = g;
            rgb[idx + 2] = b;
        }
    }
    rgb
}
