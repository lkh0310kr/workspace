# Android Data Node 작업 취소 기록

작성일: 2026-11-08
상태: 사용자 요청으로 구현 작업 취소

## 결정

사용자 지시에 따라 Android Data Node의 후속 구현을 중단한다. 취소 사유는 별도로 제시되지 않았다. 이 문서는 현재까지 커밋되고 실제 기기에서 확인한 범위와 남은 항목을 기록한다. 추가 구현, 기기 정리, 앱 제거, 데이터 삭제는 수행하지 않는다.

## 완료하고 확인한 범위

- GitHub/Supabase 저장 구조, Android SQLite + app-private object storage 구조, 백업 역할에 대한 조사 자료를 `docs/research/data-node/`에 보관했다.
- [Android Data Node 프로토타입](../../../apps/android-data-node/README.md)에 네트워크 없는 Android 저장소, SQLite 배치 record transaction, idempotency/CAS, content-addressed object storage를 구현했다.
- USB debugging으로 APK를 설치하고 ADB shell에서 제한된 ContentProvider를 호출하는 one-click 검증을 추가했다. Worker, IP listener, Supabase, GitHub 연결은 이 검증 경로에 포함되지 않는다.
- SQLite v1→v3 migration, 기존 record/object 보존, pending upload 복구, missing/corrupt object 분류, orphan 파일 후보 기록을 구현했다. orphan 파일은 자동 삭제하지 않는다.
- 2026-11-08 S21 Ultra (SM-G998N, Android API 35)에서 마지막 실행이 통과했다. 초기 검사 9개, 앱 프로세스 재시작 검사 12개, ADB 호스트 검사 12개가 통과했고, 기존 v1 데이터가 v3로 이전됐다. 복구 fixture 결과는 pending publish 1건 복구, staging-only 업로드 1건 정리, missing 1건, corrupt 1건, orphan 후보 1건 탐지였다.
- Android API 36 에뮬레이터에서도 앞선 로컬 검증이 통과했다.

마지막 S21 실행 보고서와 Logcat은 개발 머신의 무시된 로컬 경로 `apps/android-data-node/.artifacts/local-20261108083232-18313/`에 남아 있다. 저장소의 `.gitignore` 때문에 이 실행 결과 파일들은 커밋하지 않았다.

## 관련 커밋

- `7eecf24` — Data Node 조사 및 설계 문서
- `ba65b46` — Android ADB 로컬 저장소 프로토타입
- `0e2a033` — staging object 재시작 복구
- `16d8cd8` — missing/corrupt/orphan object 분류 및 검사
- `73ab461` — recovery 완료 범위에 맞춘 문서 갱신 (커밋 제목은 `feat(data-node): classify missing corrupt and orphan objects`)

## 취소 시점에 남은 항목

- 큰 객체를 위한 streamed upload/download API. 파일을 Base64로 ADB Binder 호출에 실어 보내는 현재 검증 경로는 작은 fixture만 다룬다.
- 일반 앱/Worker용 인증 API, TLS/network transport, 기기 pairing.
- record delete/list/change cursor, object head/delete/reference/GC와 수명 정책.
- 파일 누락·손상 복구를 실제 backup/replica에서 수행하는 기능, backup/restore, A Quantum 복제 검증, GitHub export.
- 저장 공간 부족·전원 차단·장시간/백그라운드 실행 테스트, production 수준 키 관리·암호화·운영 서비스.

Streaming object upload/download 작업은 초안 수정을 시작했지만 검증·커밋되기 전에 취소되어, 미완성 변경은 되돌렸다. 마지막 커밋 상태는 v3 schema와 위에 기록한 ADB 검증 기능이다.

## 현재 기기 상태

마지막 검증 때 S21에 debug 앱과 검증용 private data가 설치돼 있었다. 취소 과정에서는 앱을 제거하거나 앱 데이터/SQLite/object 파일을 지우지 않았다. 이 폴더의 프로토타입은 운영용 node나 PKMS backend가 아니다.
