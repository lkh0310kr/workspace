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

## 방향 전환: Creative pane → 엔지니어링/분석 pane (2026-08)

Vector Editor(SVG 기반 벡터 에디터, M1-M6까지 직접 구현)를 만들었다가 삭제함 —
Creative 계열(Vector, Pixel Art, Diagram 등)보다 엔지니어링/분석/생산성 쪽이 이
프로젝트 성격과 재미 면에서 더 낫다고 판단. 다음 pane은 이 목록에서 고를 것 —
아직 어느 것부터 할지 미확정.

### 후보 (우선순위 높은 순)

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

### 만약 외부 오픈소스 앱을 통째로 fork/embed하게 된다면 (원칙)

외부 프로젝트(예: Penpot/Graphite/Pixelorama류)를 fork해서 Workspace 안에
넣는 방향을 고려한다면, **원본 앱의 내부 엔진/데이터 모델을 억지로 공통화하지
말 것** — Document Model/Editor Engine은 앱마다 근본적으로 다르고, 통합
시도는 fork maintenance 지옥으로 감. 대신:

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

이 원칙 자체는 Creative 앱 한정이 아니라, 나중에 뭘 fork하든(예: 오픈소스
Wireshark 대안, 오픈소스 로봇 시뮬레이터 등) 적용됨.

