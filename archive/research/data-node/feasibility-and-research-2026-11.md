# PKMS Data Node: 현실성 평가와 추가 리서치

조사일: 2026-11-08  
대상 설계: [PKMS_Data_Node_Full_Context.md](PKMS_Data_Node_Full_Context.md)

## 요약 판단

**실험·개인용 저부하 노드로는 현실적이다. 중요한 데이터를 유일하게 보관하는 상시 저장 서버로는 현재 안 그대로는 현실성이 낮다.** 앱에서 HTTP API, SQLite metadata, 파일 저장, 해시·압축을 구현하는 것은 가능하다. 어려운 부분은 구현보다 Android가 서버 프로세스를 계속 살려 두고, 전원·발열·배터리·저장장치 장애 중에도 데이터를 보존한다는 운영 보장이다.

따라서 S21 Ultra는 우선 **재생성 가능한 수집물의 캐시/edge replica 또는 실험 노드**로 한정하고, 유일한 원본은 PC/NAS에 둔 뒤 검증 결과를 보고 역할을 올리는 것이 맞다. 꼭 폰을 primary로 써야 한다면 독립 백업이 성공하기 전에는 업로드를 영구 저장으로 승인하지 않는 설계가 필요하다.

| 항목                                       |    현실성 | 판단                                                                         |
| ------------------------------------------ | --------: | ---------------------------------------------------------------------------- |
| Kotlin 앱 안에서 Ktor API와 SQLite 실행    |      높음 | 일반적인 앱 개발 범위                                                        |
| 스트리밍 파일 저장, SHA-256, Zstd          |      높음 | 라이브러리와 단계적 파일 처리로 구현 가능                                    |
| 파일/DB 정합성 복구                        |      중간 | 상태 머신과 재시도는 가능하나 모든 전원 차단 경계를 시험해야 함              |
| 외부 Worker가 지속 접속                    | 중간 이하 | 네트워크 변경, 절전, 제조사 정책, 앱 종료가 가용성에 영향                    |
| 24/7 무인 운용                             | 낮음~중간 | Android foreground service도 범용 무중단 서버 보장이 아님                    |
| 폰 내부 저장소를 유일한 영구 보관소로 사용 |      낮음 | 기기 단일 장애점, 앱 제거/초기화 위험, 백업 없는 내구성 없음                 |
| NAS/Linux로 이식                           | 중간~높음 | API 계약은 재사용 가능하지만 Android 파일/서비스 구현은 그대로 이식되지 않음 |

## 조사에서 확인한 제약

### 1. 백그라운드 상시 서버는 핵심 기술 위험

Android 15 이상을 대상으로 하는 앱은 `dataSync` foreground service를 백그라운드에서 24시간 중 합계 6시간까지만 실행할 수 있고, `BOOT_COMPLETED`에서 해당 서비스를 시작하는 것도 제한된다. 단순히 “Foreground Service와 알림을 쓴다”는 로드맵만으로 상시 API 서버가 보장되지는 않는다. 장시간 소켓 서버가 어떤 FGS 유형으로 허용되는지도 실제 target SDK, 앱 배포 경로, 사용 목적에 맞춰 검증해야 한다. [Android foreground service 시간 제한](https://developer.android.com/develop/background-work/services/fgs/timeout), [서비스 유형 가이드](https://developer.android.com/develop/background-work/services/fgs/service-types?hl=en)

이것은 서버 시작을 사용자 동작으로 시작하고 알림을 계속 표시하는 것만으로 해결된다고 가정하지 말아야 한다는 뜻이다. 첫 기술 스파이크에서 화면을 끈 뒤 장시간 유휴 상태, 업로드 중, 재부팅, 네트워크 전환, 제조사 절전 설정을 실기기에서 확인해야 한다. Android 버전이 올라갈수록 정책도 바뀌므로 APK target SDK 기준으로 다시 확인한다.

### 2. 앱 전용 디렉터리는 앱 제거 후 데이터가 삭제됨

Android 공식 문서는 앱 전용 내부·외부 파일은 앱을 제거하면 삭제된다고 명시하고, 사용자가 앱과 독립적으로 보존해야 하는 파일을 그 위치에만 보관하지 말라고 권고한다. 따라서 계획서의 “앱 제거 전 백업 안내”는 충분한 내구성 설계가 아니다. 관리 저장소를 앱 전용 영역에 둘 경우, 삭제·초기화 전 export를 강제하고 복원 절차를 검증해야 한다. Android는 공유 문서 위치를 제공하지만, SAF/공유 저장소 경로는 일반 POSIX 파일시스템처럼 항상 원자적 rename, 임의 접근, 동일 성능을 제공한다고 가정할 수 없다. [Android 저장소 선택 가이드](https://developer.android.com/training/data-storage/use-cases?hl=en), [앱 전용 파일 가이드](https://developer.android.com/training/data-storage/app-specific?authuser=2)

### 3. SQLite는 적합하지만 백업과 동기 설정을 명시해야 함

SQLite는 단일 노드 metadata 용도로 적합하고 WAL은 읽기/쓰기 동시성을 개선한다. Android 공식 가이드는 WAL에서 commit마다 기본적으로 `fsync`를 수행해 디스크 반영을 돕는다고 설명하며, SQLite 문서는 WAL과 `synchronous` 설정이 durability와 성능의 절충임을 명시한다. `pkms.db` 하나만 복사하는 방식은 WAL 상태에서 일관된 백업이라고 보장할 수 없다. SQLite backup API/온라인 백업 또는 쓰기 정지 후 일관된 스냅샷을 사용하고, 객체와 DB manifest를 함께 검증하는 복원 테스트가 필요하다. [Android SQLite 권고](https://developer.android.com/topic/performance/sqlite-performance-best-practices), [SQLite WAL 문서](https://www.sqlite.org/wal.html), [SQLite 손상 및 동기화 가이드](https://www.sqlite.org/howtocorrupt.html)

### 4. 단일 폰은 무결성과 내구성을 혼동하기 쉬움

SHA-256은 비트 손상·중복 식별에 도움을 주지만, 같은 기기 안의 단일 복사본은 기기 분실, 저장장치 고장, 사용자 초기화, 앱 제거를 견디지 못한다. `COMMITTED`의 의미를 “폰 내부 파일과 DB가 일치함”과 “독립된 두 번째 매체에 복제됨”으로 나눠야 한다. 백업이 비동기라면 API 응답도 `local_committed` / `replicated`처럼 내구성 수준을 드러내야 한다.

## 논문·연구와 적용 가능성

아래는 Android/mobile storage와 직접 맞닿은 문헌이다. 최근 연구가 있다고 해서 S21을 NAS 대체품으로 입증한 것은 아니다.

| 연구                                                                                                                               | 확인된 내용                                                                                                                                                    | PKMS에 주는 의미와 한계                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **INTACT: Compact Storage of Data Streams in Mobile Devices to Unlock User Privacy at the Edge** (arXiv, 2025 제출본)              | Android와 iOS에 모바일 시계열 압축/프라이버시 프레임워크를 구현한다. 손실 허용 오차 기반의 선형 근사 저장을 평가한다. [논문](https://arxiv.org/abs/2506.21998) | 모바일에서 로컬 저장·처리가 가능함을 보여주는 연구 사례. 단, 근사 손실이 허용되는 센서/GPS 시계열 대상이므로 PKMS의 원본 문서 무손실 보관에 제안된 기법을 적용하면 안 된다. Zstd/원본 보존의 근거도 아니다.                                  |
| **R-Drive: Resilient Data Storage and Sharing for Mobile Edge Computing Systems** (MASS 2022)                                      | Android 구현을 재난·전술형 mobile edge computing 앱과 통합하고, erasure coding과 암호화를 이용한 복원성을 다룬다. [논문](https://arxiv.org/abs/2204.10823)     | 모바일 저장을 현실 환경에서 활용하는 직접 관련 사례. 단일 전화기가 아니라 엣지 분산 환경의 복제/협력에 의존한다. PKMS에서도 내구성을 목표로 한다면 별도 노드 복제가 중요하다는 근거이지, 한 대의 폰만으로 내구성이 확보된다는 근거가 아니다. |
| **DistressNet-NG: A Resilient Data Storage and Sharing Framework for Mobile Edge Computing in Cyber-Physical Systems** (ACM, 2024) | R-Drive/R-Share, resilient coordination와 통신을 묶은 모바일 엣지 프레임워크 및 Android 앱들을 설명한다. [논문 DOI](https://doi.org/10.1145/3639057)           | 적용 영역은 재난 대응·CPS에 가깝고 장치 간 분산 및 통신 복원성이 중심이다. 제품 문서의 단일 S21 지속 가용성·영구보관 요구를 직접 검증하지 않는다.                                                                                            |
| **EdgeKeeper: Resilient and Lightweight Coordination for Mobile Edge Computing Systems** (2022)                                    | Android와 Linux에서 실행하는 분산 edge coordination 구현을 제시하며, 노드 이탈을 고려해 여러 노드에 데이터를 둔다. [논문](https://arxiv.org/abs/2204.11095)    | PKMS의 미래 다중 노드 확장에는 참고가 되지만 초기 단일 노드 APK의 최소 기능으로 가져오면 과도하다. 먼저 단일 노드 복구와 외부 백업을 완성해야 한다.                                                                                          |

INTACT는 현재 확인 가능한 최근 연구 중 모바일 저장 측면의 자료지만, 일반 파일 서버 내구성 논문은 아니다. 검색된 2025–26년 모바일 edge-storage 결과 중 일부는 preprint/초기 공개 자료여서 peer review와 재현성 근거로 과대평가하지 않았다. 이 조사에서 PKMS와 동일한 조건(상용 Android 폰 1대, 24/7 LAN API, 장기 무손실 객체 저장)을 검증한 연구는 확인하지 못했다.

## 실제 적용 사례

| 사례                   | 실제 제공 기능                                                                                                                                                                                                                    | 현실성 평가                                                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **DogNAS**             | Android 폰/태블릿을 SFTP 저장 노드로 쓰고, PC·Linux·자동화가 SFTP로 파일을 올리고 받도록 제품화했다. 앱 닫힘 중 전송, 재부팅 후 자동 시작은 제품 등급과 Android가 허용하는 조건에 연결한다. [제품/기능 설명](https://dognas.app/) | 사용자가 Android를 파일 저장 노드처럼 쓸 수 있다는 가장 직접적인 상용 사례. 제품 설명은 자체 제품 주장이며 장기 데이터 보존 SLA나 독립 검증된 NAS급 내구성 증거는 아니다. 부팅 후 시작도 조건부라는 점이 중요하다. |
| **Pocket Server**      | Android에서 LAN HTTP 파일 서버, 파일 브라우징, streaming upload/download, Range 요청을 제공한다. [프로젝트 README](https://github.com/saketkhundia/Pocket-Server)                                                                 | APK로 파일 서버를 구현하는 범위는 현실적임을 보여준다. README에 명시된 LAN 개인용 파일 서버 기능은 metadata transaction, 객체 복구, 장기 무인 운영을 입증하지 않는다.                                              |
| **Transfer (matan-h)** | Wi-Fi를 통한 Android 로컬 파일 서버로 특정 폴더를 공유한다. [프로젝트](https://github.com/matan-h/Transfer)                                                                                                                       | 단순 교환/전송은 흔한 활용 패턴이다. PKMS의 장기 저장 레이어로 쓰기에는 별도 상태 관리가 필요하다.                                                                                                                 |
| **Tailscale Android**  | Android 클라이언트로 tailnet에 기기를 연결하고 앱별 라우팅 설정을 제공한다. [설치 문서](https://tailscale.com/docs/install/android), [앱별 터널 문서](https://tailscale.com/docs/features/client/android-app-split-tunneling)     | 원격 연결은 Android용 Tailscale 앱을 별도 설치·로그인하는 방식으로 먼저 검증하는 것이 낮은 위험이다. VPN 권한을 쓰는 Tailscale을 APK에 자체 내장하는 것은 별도 통합/배포 부담을 낳으므로 MVP 범위에 넣지 않는다.   |

제품·프로젝트 사례는 “기술적으로 가능”의 근거이지 가동률·내구성의 보증은 아니다. 공개된 사용자 수, 독립 장기 가동률, 데이터 손실률을 확인할 수 없는 경우가 대부분이다.

## 원안에서 바꿀 의사결정

1. **역할 정의:** S21은 우선 edge cache/replica로 둔다. 유일한 원본 저장소가 필요하다면 저전력 Linux/NAS를 primary로 하고 S21은 백업/ingest 노드로 쓰는 것이 운영 목표에 더 잘 맞는다.
2. **실행 가능성 spike를 1단계로 이동:** Ktor CRUD 전체보다 먼저 최소 APK에서 `Start server → 화면 off → 24시간 요청/업로드 → Wi-Fi 전환 → 재부팅 → 앱 업데이트`를 검증한다. Android 15+ 및 실제 S21 OS 버전에서 실행 정책을 확정한다.
3. **저장소 lifecycle 결정:** 대규모 managed object를 앱 전용 영역에만 두지 말고, 공유/SAF 위치 또는 명시적인 export-and-restore 전략 중 하나를 채택한다. 앱 제거·초기화 시 실제 데이터 복원 절차가 검증돼야 한다.
4. **독립 복제를 commit 의미에 반영:** SHA-256 검증과 local DB commit 이후에도 별도 NAS/PC 복제가 완료되기 전에는 `replicated` 상태로 응답하지 않는다. PKMS가 허용할 데이터 손실량(RPO)과 복구 시간(RTO)을 정한다.
5. **원본 불변성 우선:** 문서/원본 파일은 Zstd로 lossless 압축할 수 있지만, 작은 파일은 압축률이 낮고 CPU·쓰기량을 늘릴 수 있으므로 콘텐츠 유형별 실측 후 압축을 생략할 수 있게 한다. hash는 원본 바이트 기준으로 유지한다.
6. **API/DB 포팅 주장을 구체화:** “같은 Storage Core를 공유”하더라도 Android와 Linux의 파일 API, 서비스 수명주기, 권한이 다르다. Core는 플랫폼 독립 Kotlin 모듈, storage backend와 service host는 플랫폼별 adapter로 분리하고 contract test를 양쪽에서 실행한다.
7. **보안 범위를 출시 전으로 당김:** 문서는 LAN/Tailscale와 API Token을 언급하지만 토큰 발급·회전, TLS 경계, 재생 방지/idempotency, 권한 분리, 로그 내 비밀 값 제거, at-rest encryption/key recovery가 미정이다. 원격 업로드 전에 이 계약을 결정한다.

## 권장 현실적 로드맵

### Gate 0 — 기기/OS 운영 스파이크

- S21의 정확한 모델, Android/One UI 버전, usable storage, 충전 시 열/배터리 조건을 기록한다.
- 앱 foreground server가 OS에 의해 종료되거나 재부팅 뒤 시작되지 않는 빈도와 재시작 동작을 실측한다.
- 외부 Worker가 실제 Tailscale 경로로 업로드/다운로드하도록 하고, 화면 꺼짐·Wi-Fi 재연결·라우터 재부팅을 포함한다.
- 24시간 성공은 초기 통과 기준일 뿐이다. 유의미한 무인 운영 판단에는 수 주간 soak test와 강제 종료/전원 차단 fault injection이 필요하다.

### Gate 1 — 저장 핵심

- 파일을 고정 크기 buffer로 staging에 스트리밍하고, 원본 SHA-256을 계산한다.
- idempotency key와 `STAGING → OBJECT_DURABLE → METADATA_COMMITTED → REPLICATED` 상태를 기록한다.
- 최종 위치로 이동 후 디렉터리/파일 sync 가능 여부를 Android 파일 backend에서 확인한다. 플랫폼 파일 API가 제공하는 보장을 문서화한다.
- 재시작 시 임시 파일, 메타데이터 누락, 객체 누락을 탐지하되 자동 삭제보다 quarantine을 우선한다.
- 객체와 SQLite를 함께 백업/복원하고, 복원 후 전체 해시 검증한다.

### Gate 2 — 제한된 파일럿

- 파일 크기/일일 유입량/동시 업로드 상한을 정한다. 현재 문서의 1–20 worker와 장시간 운영은 목표값이 아니라 시험 범위로 취급한다.
- 내부망 또는 Tailscale 전용으로 제한하고 공개 인터넷 포트는 열지 않는다.
- 다른 매체에 복제된 데이터만 장기보관 완료로 친다.
- 안정성, 복구 시간, 열/전원 비용, 백업 복구 성공률이 정한 기준을 통과하면 개인용 primary 후보로 승격한다.

## 아직 결정해야 할 운영 기준

- 주 저장소를 S21 단독으로 둘지, NAS/PC를 primary로 하고 S21을 replica로 둘지
- 데이터의 크기·유형·일일 증가량·최대 단일 객체·예상 동시 요청 수
- 허용 데이터 손실량(RPO), 복구 시간(RTO), 백업 주기와 보존 정책
- 앱 제거·기기 교체·분실 시 키 및 데이터 이전 방식
- 앱을 Play Store로 배포할지 직접 APK로 배포할지(서비스 정책 및 업데이트 동작에 영향)
- Android 버전, Tailscale 접속/인증 방식, idle 중 서버가 내려갔을 때 허용할 복구 시간

## 참고 자료

- Android Developers, [Foreground service timeouts](https://developer.android.com/develop/background-work/services/fgs/timeout)
- Android Developers, [Foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types?hl=en)
- Android Developers, [Storage use cases and best practices](https://developer.android.com/training/data-storage/use-cases?hl=en)
- Android Developers, [SQLite performance best practices](https://developer.android.com/topic/performance/sqlite-performance-best-practices)
- SQLite, [Write-Ahead Logging](https://www.sqlite.org/wal.html), [How To Corrupt An SQLite Database File](https://www.sqlite.org/howtocorrupt.html)
- Tailscale, [Android installation](https://tailscale.com/docs/install/android), [Android app split tunneling](https://tailscale.com/docs/features/client/android-app-split-tunneling)
- A. Nuñez et al., [INTACT](https://arxiv.org/abs/2506.21998) (2025 preprint)
- M. N. Hossain et al., [R-Drive](https://arxiv.org/abs/2204.10823) (2022)
- [DistressNet-NG](https://doi.org/10.1145/3639057) (ACM, 2024)
- [DogNAS](https://dognas.app/), [Pocket Server](https://github.com/saketkhundia/Pocket-Server), [Transfer](https://github.com/matan-h/Transfer)

## 결론

이 계획은 **APK 기반 저장 서비스 프로토타입**으로는 타당하고, DB/객체 상태 전이를 분리한 설계 방향도 좋다. 다만 “S21을 영구 데이터 저장 노드로 운영”한다는 목표는 현재 문서의 가정만으로 달성되지 않는다. Android background execution과 앱 데이터 lifecycle, 단일 기기 장애를 설계의 앞단으로 끌어오고, 독립 replica를 내구성 계약에 포함해야 한다.

가장 현실적인 첫 결과물은 “S21에서 동작하는 검증된 ingest/edge node + NAS/PC의 독립 replica”다. 단일 S21을 유일한 저장소로 승격할지는 장시간 실제 기기 테스트, 강제 종료 복구, 앱 제거 후 복원, 독립 백업 복원까지 통과한 뒤 판단한다.
