# Workspace Desktop 로그 운영

## 디스크를 차지하던 원인

앱은 각 NDJSON 기록을 제한 없이 동기식 plain-text 파일에 썼다. Terminal trace에는 shell read, renderer 전달, xterm scheduling과 수신 등 여러 단계의 원시 PTY 입력·출력이 중복 기록됐다. Layout trace도 model snapshot과 예약된 persistence event를 모두 기록했다. 이 trace는 production과 development에서 모두 활성화돼 있었다.

확인한 Mac에서는 stable과 development 로그 폴더를 합쳐 약 2.6 GiB를 사용했다. Stable `terminal.ndjson`은 237만 건에 1.36 GiB, `layout.ndjson`은 101만 건에 604 MiB였다. Browser focus 기록 116.5 MiB가 `interaction.ndjson`과 `browser-focus.ndjson`에 byte 단위로 중복돼 있었다.

## 데이터 손실 없는 저장 정책

- 활성 `.ndjson` 파일은 사람이 읽을 수 있도록 유지하고 16 MiB마다 새 segment로 전환한다.
- 닫힌 segment는 Node 내장 gzip stream의 기본 압축 수준으로 압축한다. Gzip은 손실이 없고 메모리 사용량을 제한한다. 압축이 끝난 뒤에만 원본을 제거하며, 실패하면 복구를 위해 원본을 남긴다.
- 기간 또는 크기 기준으로 삭제하지 않는다. 압축 archive는 모든 기록을 보존한다. 나중에 로컬 디스크 상한이 필요하면 삭제를 검토하기 전에 오래된 gzip archive를 외부 저장소로 옮긴다.
- 중복 browser-focus 기록은 더 이상 쓰지 않는다. 해당 이벤트는 `interaction.ndjson`에 유지한다.
- 기존 대용량 파일을 위한 일회성 압축 명령을 제공한다. 원본과 압축 해제 결과의 SHA-256이 일치하는 경우에만 원본을 교체한다.

확인한 로그의 16 MiB sample은 Terminal 0.76 MiB, Layout 0.24 MiB, Interaction 0.29 MiB로 줄었다. 실제 압축률은 segment마다 달라진다.

## 기존 로그 압축과 복구

기존 파일을 압축하기 전에 모든 Workspace 인스턴스를 종료한다. 실행 중인 프로세스가 검증 중 파일에 추가 기록을 하지 못하도록 `--app-closed` 확인을 명시해야 한다. 저장소 root에서 실행한다.

```sh
npm run logs:compress -- --app-closed
```

이 명령은 stable과 development 로그 폴더에서 1 MiB 이상인 파일을 압축하고, 기존 이름으로 빈 활성 파일을 만든다. 활성 로그를 덮어쓰지 않고 `.ndjson.gz` 파일을 복원하려면 다음 명령을 실행한다.

```sh
npm run logs:restore
```

복원 파일은 각 로그 폴더의 `restored-logs/` 아래에 기록된다. 압축은 Terminal 내용을 가리지 않는다. Archive에는 원래 기록이 그대로 남는다.

## 구현 위치와 제한

실행 중 writer는 `apps/workspace-app/src/main/logFileWriter.ts`에 있다. Streaming gzip을 사용하고 파일을 truncate하지 않고 순환한다. 자동 삭제 정책은 없다. 파일 상한과 영구 보존을 동시에 보장하려면 archive를 다른 저장소로 이동해야 하기 때문이다.
