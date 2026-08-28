Idea: Code Editting + Markdown Editting (WYSIWYG) + Terminal + Browser In One Workspace
Feature

- Workspace
  - Tabs
  - Panes
  - Split
  - Window Layout
- Pane
    - Terminal
        - PTY
        - Shell
        - GPU Rendering
    - Browser
        - WebView
        - Navigation
        - Browser Tabs
    - Editor
        - Markdown Editor (WYSIWYG)
        - File System (Tree View)
    - Spotify
    - File Viewer (Image, PDF, Video(+ 영화 자막 파일 추가 및 조정 기능), E-Book, Audio Player)
    - RSS Reader
    - Calendar
    - Dashboard
        - Weather, Clock, Stock chart 등 종합적으로 brief
        - Notification Center
            - RSS, Download, Mail, Calendar
        - Newspaper
            - Blog, News
        - Economy
            - Stock/Crypto/Index/Gold/Exchange Rate
    - System
        - System Monitor
    - PPTX, DOCX, CSV, XLSX, HWPX

패널을 자유롭게 추가할 수 있도록 추상화 설계를 잘 했는가?
일본어 공부 패널.

## 방향: 그래픽/설계/CAD급 pane (2026-08, 현재 우선순위)

Vector Editor(SVG 기반 직접 구현, M1-M6)를 한 번 만들었다가 삭제하고 엔지니어링/
분석 방향으로 잠깐 틀었었는데, 다시 그래픽/설계 쪽으로 확정. 다만 이번엔 방향이
다름 — Vector Editor처럼 처음부터 직접 구현하는 게 아니라, **진짜 전문 도구급
소프트웨어를 만드는 게 최종 목표**라서 그 기반(architecture)을 먼저 단단히
하는 게 우선:

- **2D**: Figma, Illustrator, Photoshop급
- **3D**: Blender급
- **Video**: Video Editor
- **Engineering**: CAD, Nvidia Omniverse류(USD 파이프라인), **Game Engine** ← 첫 타깃으로 확정 (Godot)
  - 2026-08-28: "Game Engine"과 "엔지니어링 시뮬레이션"을 나눌 이유가 약해서
    **World Engine**이라는 이름으로 합치는 걸 검토함 — 단, 실제로 갈리는
    지점은 게임이냐 시뮬레이션이냐가 아니라 **호스팅 방식**(Godot처럼
    Web/WASM export 가능한 엔진 vs Omniverse/FreeCAD처럼 네이티브 전용이라
    완전히 다른 임베딩이 필요한 엔진). 자세한 내용은
    [ROADMAP.md의 World Engine 섹션](./ROADMAP.md#world-engine--planning-idea-not-started-2026-08-28) 참고.

**첫 타깃: Game Engine(Godot), Web export 방식으로 fork/embed.** 넷 중 뭐가 더
"근본적"이냐를 따진 게 아니라 — 지금 진짜 검증해야 할 근본 문제는 "포크한 엔진을
Workspace 안에 어떻게 host하느냐"이고, 그걸 제일 싸게 검증할 수 있는 후보가
Godot이라 골랐음(MIT, Web export 문서 잘 되어있음, Blender/FreeCAD보다 빌드
훨씬 가벼움). Host 방식은 Godot의 HTML5/WASM Web export를 `<webview>`로
로드하는 것 — 이미 BrowserContent.tsx가 쓰는 webview 패턴을 거의 그대로
재사용. 서빙 인프라(`workspace-engine://` 프로토콜, COOP/COEP 헤더 포함)는
`docs/ROADMAP.md` Phase 1에 구현 완료; 실제 Godot 프로젝트를 Web export해서
끝까지 로드되는지 검증하는 게 다음 단계.

이 넷은 전부 무거운 렌더링/연산 엔진이 필요한 카테고리라 — 아래 "만약 외부
오픈소스 앱을 fork/embed" 원칙과 [09-future-native-architecture.md](./architecture/09-future-native-architecture.md)의
Rust 코어/out-of-process 방향이 바로 이 타겟들을 위한 이야기임. Phase 2 pane을
아무거나 하나 골라서 얕게 구현하기보다, Phase 1(파운데이션)을 이 4개 카테고리를
실제로 지탱할 수 있는 형태로 설계하는 게 먼저.

**보류** (삭제 아님, 우선순위만 밀림) — 아래 엔지니어링/분석 pane 후보 목록:

### 후보 (우선순위 높은 순, 현재 보류)

- **Database Studio** — Postgres/SQLite/Redis. Tables/Views/Functions/Indexes,
  Query → EXPLAIN → Query Plan → Execution 시각화.
- **Network / Packet Analyzer** — Wireshark 복제가 아니라 패킷을 시간축 +
  프로세스 + 연결 그래프로 보는 도구.
- **Serial / Embedded Studio** — Embedded IDE와 잘 어울림. UART/SPI/I²C/CAN/
  Modbus/JTAG/SWD까지.
- **Hex / Binary Inspector** — Hex+ASCII 뷰 + 파일 포맷 자동 파싱(PNG IHDR/IDAT/
  IEND 같은 구조 트리).
- **GIS / Map Studio** — GeoJSON/Shapefile/KML/GPX 열고 편집. "지도용 포토샵".
- **Git / Code Archaeology** — Commit → Files → Functions → Authors 연결, 커밋
  클릭하면 실제 코드 변화와 연결.
- **Robot Simulator** — World/Robot/Camera/LiDAR/IMU/Motors/Environment. 로봇에
  꽂혀있는 방향이라 특히 흥미로움.
- **Research / Paper Reader** — PDF 열면 Abstract/Figures/References/Citations/
  Equations 자동 추출 + citation graph.

그 외 브레인스토밍만 된 것: Process/System Monitor(eBPF 연동), Data Analysis
Studio, Timeline/Event Explorer, Scientific Simulation Lab, Graph Knowledge
Base, Mind Map/Diagram Engine, Build/CI Studio, API Studio, Container Studio,
PCB/Circuit Studio, Logic Analyzer, SDR/RF Studio, Robot Fleet Manager,
Reinforcement Learning Studio, Malware/Binary Sandbox, Certificate/TLS
Inspector, Dependency/Supply Chain Explorer.

다음 설계 단계 제안: Database / Network / Hardware / Robot / GIS / Research 6개를
대상으로 "기존 오픈소스 프로젝트를 fork해서 가져올 수 있는지 + 라이선스 + 핵심
엔진 + Electron에서 어떻게 embed할지"를 조사.

### 그래픽/CAD pane을 실제로 만들 때의 원칙 — 외부 오픈소스 엔진 fork/embed

2D/3D/Video/CAD 넷 다 처음부터 직접 만들 규모가 아님(Vector Editor를 M1-M6까지
직접 짜본 경험상 SVG-DOM 수준도 상당한 작업이었는데, Blender/CAD/Omniverse급은
차원이 다름). 그래서 기본 전략은 **진짜 오픈소스 엔진을 fork/embed** —
후보: 2D는 Penpot(MIT)/Krita(GPL), 3D는 Blender(GPL) 자체, Video는 Shotcut/
Kdenlive, CAD는 FreeCAD(LGPL)/Open CASCADE, Game Engine은 Godot(MIT). 라이선스
확인은 필수(아래 참고).

**World Engine(2026-08-28 실제로 만들어본 것)만 예외** — wgpu/rapier3d/hecs로
직접 짠 엔진 코어이지, 이 절의 "fork/embed" 원칙 대상이 아님(합성 가능한
작은 라이브러리 몇 개를 조립하는 것과, Blender급 수십 년치 UX/툴링을
재구현하는 건 완전히 다른 문제). 2D/3D/Video/CAD는 이 절 원칙 그대로 감.
호스팅 방식도 결정됨: Electron 안에 진짜로 임베드하지 않고 **별도 프로세스로
spawn, 생명주기만 관리**(itch.io가 네이티브 게임 다루는 방식과 동일) —
Blender/Krita 같은 GPL 소프트웨어를 별도 프로세스로만 다루면 GPL 의무가
전이될 위험도 없어서(subprocess+IPC는 GPL에서도 안전한 "mere aggregation"
패턴), 라이선스 문제도 같이 해결됨. 자세한 내용:
[09-future-native-architecture.md](./architecture/09-future-native-architecture.md#world-engine-build-out--phase-1-4-2026-08-28)

**원본 앱의 내부 엔진/데이터 모델을 억지로 공통화하지 말 것** — Document
Model/Editor Engine은 앱마다 근본적으로 다르고, 통합 시도는 fork maintenance
지옥으로 감. 대신:

- 각 앱은 **자기 엔진을 그대로 유지**하고, Workspace는 공통 인프라만 제공
  (File System, Project, Asset, Clipboard, Command Bus, Shortcut Registry,
  IPC — 우선순위 높음; Font/Color/GPU resource는 중간; Rendering/Document
  Model은 통합 안 함).
- `third-party/<app>` (upstream 그대로, 손대지 않음) vs `integrations/<app>`
  (직접 작성한 adapter)를 분리 — upstream 업데이트가 쉬워짐.
- 각 앱이 `WorkspaceApp` 계약(`mount/unmount/open/save/commands`)만 구현하면
  Workspace가 Pane으로 취급.
- GPU는 각 앱이 자체 렌더러를 갖되, Workspace는 GPU Service Layer(adapter
  info, device info, memory budget, texture sharing)만 얇게 제공 — "모든 앱의
  GPU 렌더러를 처음부터 하나로 통합"은 시도하지 말 것.
- 라이선스는 fork하는 순간 필수 확인 — 프로젝트 자체 license뿐 아니라
  dependencies/asset/font/상표까지, `third-party/<app>/{LICENSE,NOTICE}`로
  provenance 보존.

이 원칙 자체는 그래픽/CAD 한정이 아니라, 나중에 뭘 fork하든(오픈소스 Wireshark
대안, 오픈소스 로봇 시뮬레이터 등 — 위 "보류" 목록 포함) 동일하게 적용됨.

