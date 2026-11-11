# Asset viewer 연결 계약

공유 provider의 asset은 읽기 전용 `{previewUrl,mediaType}` snapshot이다. Desktop의 실제 파일 viewer는 앱 소유이며 [FileViewerContent](../../../apps/workspace-app/src/renderer/src/panes/FileViewerContent.tsx), [viewerKind](../../../apps/workspace-app/src/renderer/src/panes/kinds/viewerKind.tsx)가 렌더링한다. 이 문서는 편집기와의 연결 계약이며 EPUB·3D·CAD 내부 알고리즘 전체의 재생성 스펙은 아니다.

## 입력과 라우팅

viewer pane item은 id/kind=viewer, 상대 filePath 또는 absolutePath, 선택적 legacy viewerHint(video/audio/ebook)를 보관한다. 파일 label은 basename, 경로가 없으면 hint에 따라 Video/Audio/Ebook 또는 New tab이다. UI label은 Editor이며 별도 viewer picker는 없다. hasFileExplorer=true다.

FileViewerContent의 입력은 tabId, filePath, absolutePath, viewerHint, treeOpen/onToggleTree, paneActive와 onAssignAbsolutePath다. 표시 분류는 filePath 우선, 없으면 absolutePath다. viewerHint는 경로 없는 이전 탭의 Browse filter에만 사용한다.

[mediaKind.ts](../../../apps/workspace-app/src/renderer/src/panes/mediaKind.ts)의 case-insensitive 확장자 분류:

| kind | 확장자 |
|---|---|
| image | png,jpg,jpeg,gif,webp,svg,bmp |
| pdf / epub | pdf / epub |
| video | mp4,webm,mov,mkv |
| audio | mp3,wav,m4a,ogg,flac |
| model3d | glb,gltf,fbx,obj,stl,ply,dae,step,stp |
| cad | urdf,srdf,sdf,dxf |
| other | 그 외 |

## 로딩과 자원 수명

image/PDF는 workspace-relative readFileBinaryPreview의 base64 bytes를 Blob URL로 바꾼다. 변경/해제 시 revoke한다. video/audio는 getMediaUrl 또는 getMediaUrlAbsolute로 streaming protocol URL을 받아 native media element가 Range 요청을 하도록 한다. 전체 영상 bytes를 base64로 읽지 않는다.

EPUB는 EpubReaderContent, model3d/CAD는 lazy import한 별도 renderer가 로딩을 소유하므로 binary preview를 호출하지 않는다. 경로 변경 때 error/zoom/naturalSize/mediaUrl/subtitle 상태를 초기화한다. 비동기 응답은 cancelled flag로 폐기하며 URL이 없거나 읽기 실패면 오류 상태다. SRT 자막은 parse→VTT Blob URL로 만들고 교체/해제 시 revoke한다.

이미지 zoom은 null=fit, 숫자=배율이다. 범위 0.1~20, 버튼 단계는 0.1~1의 0.1 간격 후 1.5,2,3,5,7,10,15,20이고 3배 초과에서 pixelated 표시다. pinch factor는 0.075다.

## 수락 기준과 범위

ASSET-01: video를 열 때 binary preview IPC가 없어야 한다. ASSET-02: 이미지 전환/해제 때 Blob URL을 revoke한다. ASSET-03: lazy viewer 파일은 해당 renderer만 로드한다. ASSET-04: 경로 없는 legacy media 탭의 Browse 취소는 path를 변경하지 않는다.

mediaKind.test와 srtToVtt.test는 분류·자막 순수 규칙의 기존 근거다. 포맷별 렌더 전체를 문서화 완료한 것으로 해석하지 않는다. 세부 viewer는 [전체 커버리지 목록](../../../docs/architecture/spec-driven-development.md)에서 남은 범위를 확인한다.
