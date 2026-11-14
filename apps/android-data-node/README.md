# Android Data Node prototype

> **상태: 취소됨** — 사용자의 요청으로 2026-11-08에 구현을 중단했다. 확인된 범위와 미완료 항목은 [취소 기록](../../docs/research/data-node/CANCELLATION.md)을 참고한다.

이 prototype은 로컬 storage engine이다. Network, Supabase, Cloudflare, GitHub 또는 USB port forwarding을 사용하지 않는다. Record는 SQLite에, immutable object는 앱 전용 files directory에 저장한다. 로컬 개발에서는 보호된 Android ContentProvider를 통해 ADB shell이 앱에 storage 명령을 직접 보낸다. 일반 앱에는 `android.permission.DUMP` 권한을 주지 않는다.

## 한 번에 실행하는 device 검증

JDK 17, Android SDK Platform 35, platform tools, USB debugging이 켜져 있고 현재 컴퓨터가 인증된 Android device 한 대가 필요하다.

Workspace root에서 실행한다.

```bash
npm run data-node:one-click
```

명령은 debug APK를 build/install하고 로컬 storage 검사를 수행한다. Laptop에서 `adb shell content call`로 record/object 작업을 보내고 pending upload, 누락·손상된 metadata 연결 object, orphan file의 crash fixture를 만든다. 앱을 강제 종료하고 다시 실행한 뒤 reconciliation과 저장된 오류 코드를 확인한다. 앱 private data는 유지하므로 반복 실행에서 기존 database도 검사한다. Android device가 여러 대 연결돼 있으면 하나를 지정한다.

```bash
npm run data-node:one-click -- --serial=DEVICE_SERIAL
```

Report와 필터링된 Android log는 `apps/android-data-node/.artifacts/` 아래에 기록된다. 앱 안의 **Run local verification** 버튼으로도 검사를 실행할 수 있다. 최신 report를 직접 확인하려면 다음 명령을 사용한다.

```bash
adb shell run-as dev.pkms.datanode cat files/data-node/latest-diagnostics.json
```

## Prototype이 확인하는 항목

- SQLite integrity before and after writes
- A multi-record transaction and monotonically increasing revision
- Idempotent retries and rejection of a reused operation ID with a different payload
- Transaction rollback on a version conflict
- SHA-256 content-addressed object write, read-back, and deduplication
- Record and object persistence after the Android app process is stopped and restarted
- Structured per-check result reports and Android log entries
- Direct host-to-Android commands over ADB without an IP network
- ADB shell batch transaction, retry/conflict behavior, rollback, and object round-trip
- ADB-written records and objects after the app process is stopped and restarted
- v1→v3 SQLite migration preserving existing records and objects
- 시작할 때 pending upload, 누락 object, checksum이 손상된 object와 orphan file을 복구한다. Orphan data는 후보로 남기고 삭제하지 않는다.

## ADB 로컬 command bridge

Debug app은 `content://dev.pkms.datanode.provider/node`를 통해 `health`, `record.put`, `record.batch`, `record.get`, `object.put`, `object.get`, `diagnostics.errors` method를 제공한다. `--arg`는 base64로 인코딩한 UTF-8 JSON object다. 예를 들어 빈 JSON object는 `e30=`이다.

```bash
adb shell content call \
  --uri content://dev.pkms.datanode.provider/node \
  --method health \
  --arg e30=
```

응답은 `result` Bundle field에 base64 JSON으로 반환된다. One-click runner가 encoding, decoding, 응답 확인을 자동으로 수행한다. 현재 shell bridge는 Binder call 안에 byte를 직접 담아 보내므로 작은 로컬 검증 payload에만 사용한다. 큰 파일에 필요한 streaming object API는 아니다.

이 prototype은 production database service가 아니다. Remote API, streaming object upload/download, encryption/key management, 삭제/reference/GC 규칙, replication, backup export, foreground service, 장시간 background operation을 제공하지 않는다. 다음 검증 단계는 streaming object API, 전원 차단·storage 부족 테스트, backup/restore, A Quantum에서 같은 one-click 검증을 반복하는 것이다.
