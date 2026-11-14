# Desktop viewer pipeline 지도

App scope의 J-05다. 공유 editor의 asset snapshot과 실제 renderer를 구분한다. 파일 분류·picker/legacy absolute path 입력·image/media 기본 계약은 [asset 연결 문서](../../../../packages/editor/docs/assets.md), 이 문서는 앱 내부 pipeline을 연결한다.

## Format과 owner

| 경로            | Main                                              | Renderer·상태                                                                   |
| --------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| image/PDF       | readFileBinaryPreview                             | FileViewerContent의 base64→Blob URL, 교체/unmount revoke                        |
| audio/video     | mediaProtocol·mediaRange                          | protocol URL의 Range streaming, native media element·SRT→VTT·subtitle offset    |
| EPUB            | epub/epubInspect/miniEpub + protocolSchemes       | EpubReaderContent→epubLoader→foliate paginator, theme·TOC·page turn·읽기 위치   |
| model3d         | model3d assetRouter/importers/cacheStore/protocol | ModelViewerContent→renderer model3d modules, manifest·loading/error·3D controls |
| CAD/robot files | cadViewer local process adapter                   | CadViewerContent의 viewer URL 연결. 서비스 launch/reuse·종료 책임은 Main        |

직접 file URL, app custom protocol, Blob URL, local viewer service URL은 서로 다르다. format 분류 목록은 [mediaKind](../../src/renderer/src/panes/mediaKind.ts), UI dispatch는 [FileViewerContent](../../src/renderer/src/panes/FileViewerContent.tsx)가 기준이다.

## 3D import 계약

[assetRouter](../../src/main/model3d/assetRouter.ts)는 request intent와 package/format을 판단해 import-preview pipeline으로 보낸다. [formatSniffer](../../src/main/model3d/formatSniffer.ts), [packageResolver](../../src/main/model3d/packageResolver.ts), importerRegistry는 파일 확장자 하나만으로 native parsing 결과를 보장하지 않는다. GLTF/mesh/FBX/STEP importer와 conversion dependency는 각각 다르다.

[ImportJobQueue](../../src/main/model3d/importJobQueue.ts)는 메모리 Map에 import-N ID를 기록하고 update event를 발생시킨다. enqueue는 queued→sniffing→converting→caching→ready, 오류면 failed/error를 반환한다. **이 이름만으로 제한된 worker pool·durable queue·취소를 구현한 것으로 간주하지 않는다.** 현재 enqueue는 run Promise를 직접 await한다. app main이 update를 model:import-status로 중계한다.

cache는 workspaceRoot/.workspace/model3d-cache 아래 manifest와 파생 GLB를 저장하며 source metadata와 key를 검증한다. renderer는 shared SceneManifest/ImportJob type을 소비한다. 원본 파일과 cache를 구분하고 cache hit/실패/변환 불가/지원 수준을 UI에 반영한다. import job의 ready는 모든 포맷의 시각 fidelity가 검증됐다는 뜻이 아니다.

## EPUB와 CAD 수명

EPUB는 [epubLoader](../../src/renderer/src/panes/epub/epubLoader.ts)가 책 resource와 paginator를 연다. 읽기 위치·선호는 Main ebook-state와 shared merge 규칙을 거쳐 저장한다. page turn key는 focused control/selection 등을 고려한 [epubKeys](../../src/renderer/src/panes/epub/epubKeys.ts), theme는 epubTheme가 owner다. image/PDF의 단일 binary Blob 로딩으로 EPUB zip을 대체하지 않는다.

CAD adapter는 serveRoot별 instances와 pendingLaunches로 동시 시작을 조정하고 실행 환경의 viewer binary 또는 project Python 후보를 탐색한다. 종료 시 disposeCadViewers가 child를 정리한다. Python이 필요한 경로는 프로젝트 `.agents/.venv` 환경과 agents:python setup 명령을 사용하며 system Python fallback을 문서 작업으로 도입하지 않는다. 활성 viewer adapter와 archive CAD 모델은 별개다.

## 수락과 상세화 범위

VIEW-01 media가 full-file base64 경로를 타지 않는다. VIEW-02 Blob·subtitle URL revoke. VIEW-03 import failed가 ready로 숨겨지지 않는다. VIEW-04 cache/source 불일치 재처리. VIEW-05 EPUB location restore·키보드와 선택 충돌. VIEW-06 CAD 중복 launch 조정과 quit cleanup.

mediaRange/mediaKind/srtToVtt, epub/epubLoader/epubKeys, model3d assetRouter/import queue/cache/importer 테스트가 부분 근거다. 포맷별 장면·성능·대형 모델·책·native process의 전체 분기와 시각 fixture는 아직 상세화/acceptance 대상이다. 이 pipeline 지도만으로 모든 viewer를 독립 재생성 완료한 것으로 표시하지 않는다.
