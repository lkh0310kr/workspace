# Japanese Pane — 데이터 소스 & 모델 리서치

> 목표 기능(초안): ① 손글씨로 한자 찾기 ② 획순/필기 애니메이션 ③ 히라가나·뜻·한국어 뜻 등 기본 정보 ④ 예문·JLPT·성조(액센트) 등 확장
>
> 작성: 2026-08-30

---

## 1. 결론 요약

| 영역 | 1차 추천 소스 | 비고 |
|------|---------------|------|
| **단어·뜻·품사·교차참조** | [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) (`ent_seq`) | 사실상 표준. 영어 gloss 기본, 다국어는 별도 |
| **한자 메타(획수·급수·음독·훈독)** | [KANJIDIC2](https://www.edrdg.org/wiki/index.php?title=KANJIDIC_Project) | 한자 literal / codepoint로 키 |
| **획순 SVG** | [KanjiVG](https://kanjivg.tagaini.net/) | 획순 애니메이션·필기 가이드의 기준 데이터 |
| **한국어 뜻** | [한국어기초사전 KRDICT](https://krdict.korean.go.kr/) (일본어↔한국어) | Open API 또는 XML bulk; `target_code` |
| **예문** | [Tatoeba](https://tatoeba.org/en/downloads) + JMdict 예문 큐레이션 | `sentence_id`로 안정적 |
| **성조(액센트)** | [Kanjium](https://github.com/mifunetoshiro/kanjium) `accents.txt` | 상업 이용 전 라이선스 재확인 |
| **통합 빌드 참고** | [japanese-language-data](https://github.com/jkindrix/japanese-language-data) | JMdict+KANJIDIC+KanjiVG+Tatoeba+Kanjium 크로스링크 예시 (CC-BY-SA 4.0) |

**모델 방향:** `한자 모델 / 단어 모델 / 히라가나 모델`을 **형제 최상위**로 두기보다, **Lexeme(사전 항목)을 허브**로 두고 Kanji·Reading·Sense·Stroke·Example을 **연결 그래프**로 두는 편이 다소스 병합·업데이트에 유리함. 히라가나/가타카나는 별도 엔티티가 아니라 **Reading 표기** + 형태소 분석 결과로 다룸.

---

## 2. 기능별 로직 리서치

### 2.1 손글씨로 한자 찾기

입력: stroke polyline 시퀀스 `[(x,y,t), ...]` per stroke.

| 접근 | 엔진/프로젝트 | 장점 | 단점 | 오프라인 |
|------|---------------|------|------|----------|
| **SVM 온라인 인식** | [Zinnia](https://taku910.github.io/zinnia/) + Tomoe 모델 | 가볍고 임베드 쉬움, Electron에서 C++/WASM 가능 | 모델 별도 다운로드, 획순 민감 | ✅ |
| **획 모양 매칭** | [kanjidraw](https://github.com/obfusk/kanjidraw) (KanjiVG 기반) | 구현 단순, 설명 가능 | 획순·비율에 민감, 후보 수 제한 | ✅ |
| **웹 KanjiCanvas** | [sljfaq.org](https://kanji.sljfaq.org/) (Ben Bullock) | stroke order on/off, shape match 옵션 | 서버/JS 로직 참고용; 라이선스 확인 필요 | △ |
| **CNN (stroke→image)** | [cnn_chinese_hw](https://github.com/mcyph/cnn_chinese_hw) (PyTorch→ONNX) | **획순 어느 정도 무시** 가능 | 모델 크기, LGPL 2.1 | ✅ (ONNX) |
| **클라우드 Vision API** | Google/Azure 등 | 정확도 높음 | 오프라인·비용·프라이버시 | ❌ |

**권장 2단계 파이프라인 (Workspace 오프라인 우선과 맞춤):**

1. **Fast path:** Zinnia 또는 ONNX CNN → top-N 후보 한자 literal (예: 20개)
2. **Refine (선택):** KanjiVG와 획 벡터 유사도 재순위 (kanjidraw 방식) — 사용자가 획순을 어겨도 1차 후보는 살림
3. **Resolve:** 후보 literal → `kanji` 테이블 → 관련 `lexeme` (KANJIDIC + JMdict 역링크)

Electron 통합: renderer canvas → stroke JSON → **main process** 또는 **WASM worker**에서 인식 (UI 스레드 블로킹 방지).

### 2.2 획순으로 쓰는 법 보여주기

- **데이터:** KanjiVG SVG (`kvg-*` 파일) — stroke path + `kvg:element` / `kvg:radical` 메타
- **렌더:** SVG path를 순서대로 `stroke-dashoffset` 애니메이션, 또는 path를 stroke index별로 분할해 순차 표시
- **연습 모드:** 사용자 필기와 KanjiVG ghost stroke overlay 비교 (허용 오차는 Bézier 단순화 + Procrustes 정렬)
- **참고 앱:** Tagaini, Kanji Study, sljfaq stroke diagrams — 모두 KanjiVG 파생

### 2.3 히라가나·뜻·한국어 뜻·기본 정보

| 정보 | 소스 | 획득 방법 |
|------|------|-----------|
| 표기(한자/가나) | JMdict `k_ele` / `r_ele` | XML bulk |
| 읽기(히라가나/가타카나) | JMdict `reb` | 동일 |
| 영어 뜻 | JMdict `sense/gloss` (lang=en) | 동일 |
| 품사·JLPT·빈도 | JMdict `pos`, `ke_pri`/`re_pri`; Waller JLPT (커뮤니티) | pri 코드 매핑 테이블 |
| 한자별 음훈·급수 | KANJIDIC2 | literal join |
| **한국어 뜻** | KRDICT 일본어 항목 / Open API `translated=y` | `target_code` 또는 표기 fuzzy match |
| 예문 | Tatoeba `sentence_id` ↔ JMdict (jmdict-examples, japanese-language-data) | 링크 테이블 |
| 성조 | Kanjium | 표기(lemma) 키; JMdict ent_seq와 별도 crosswalk 필요 |
| 고유명사 | JMnedict | 별도 DB; 일반 사전과 분리 권장 |

**히라가나 단독 검색:** 가나는 대부분 JMdict `r_ele`만 있는 항목. 「あ」같은 문자 자체는 유니코드 블록 + 소수 사전 항목으로 커버; **실사용은 "읽기로 단어 검색"**이 핵심.

### 2.4 기타 확장 기능 (로직만)

- **형태소 분석:** [Sudachi](https://github.com/WorksApplications/Sudachi) / UniDic — 문장에서 단어 경계·읽기 정규화
- **교차참조·동의어:** JMdict `xref`, `ant` (XMLng에서 `seq`/`sno` 속성 강화 중)
- **SRS/플래시카드:** 앱 로직; 데이터는 `lexeme_id` + 사용자 상태만 로컬 DB
- **Handwriting practice scoring:** KanjiVG ideal path vs user path (DTW on normalized strokes)

---

## 3. 데이터 모델 제안

### 3.1 왜 Lexeme 허브인가

- JMdict는 이미 **항목(entry) = lexeme** 단위로 `ent_seq`가 영구 ID
- 한 **단어**가 여러 **한자 표기**·**읽기**·**sense**를 가짐 → 형제 모델 3개보다 정규화가 자연스러움
- **한자**는 문자 그래프의 노드; **단어**와는 N:M (`lexeme_kanji`, `kanji` 자체 메타)

### 3.2 엔티티 (논리 스키마)

```
Lexeme          id (= ent_seq 또는 내부 UUID + ent_seq unique)
  ├─ Writing    orthography (kanji/kana string), priority, info tags
  ├─ Reading    kana, restrictions (re_restr), priority
  ├─ Sense      sense_no, pos[], field[], misc[]
  │    └─ Gloss lang (en|ko|ja|...), text, source_provenance
  ├─ Xref       target_lexeme_id, sense_no, type (see|ant)
  └─ (optional) PitchPattern, JlptLevel, FrequencyRank

Kanji           literal (U+XXXX), codepoint
  ├─ Metadata   strokes_count, grade, jlpt, frequency (KANJIDIC2)
  ├─ Reading    on_yomi[], kun_yomi[] (KANJIDIC)
  └─ StrokeSet  kanjivg_revision, svg_path or normalized strokes JSON

Example         tatoeba_id (or internal)
  ├─ text_ja, text_en, text_ko?
  └─ lexeme_links (many-to-many, confidence)

SourceRecord    (source, external_id, fetched_at, checksum, raw_path)
FieldProvenance (entity_type, entity_id, field_name, source, external_id, updated_at)
```

### 3.3 유일성 & 멀티 소스 업데이트

**원칙: Natural key per source, canonical merge in app layer**

| 소스 | Natural key | Upsert 전략 |
|------|-------------|-------------|
| JMdict | `ent_seq` | XML diff 또는 전체 replace; `ent_seq` 불변 |
| KANJIDIC2 | `literal` | codepoint 기준 upsert |
| KanjiVG | `literal` + `revision` | SVG checksum; revision bump 시 stroke만 갱신 |
| Tatoeba | `sentence_id` | CSV append-only + tombstone 없음 → full reimport 주기적 |
| KRDICT | `target_code` | API는 온디맨; bulk는 XML `target_code` |
| Kanjium | `expression` string | 충돌 시 JMdict lemma 우선, manual override 테이블 |
| Handwriting model | `model_name` + `version` | 바이너리 blob; 앱 버전과 분리 |

**필드 수준 병합 규칙 (예시):**

1. `gloss.lang=ko`: KRDICT > 수동 편집 > (없음) → JMdict EN gloss는 fallback
2. `gloss.lang=en`: JMdict > Wiktionary supplement
3. `pitch`: Kanjium > Wiktionary (kaikki) > null
4. `stroke`: KanjiVG only (수정 시 CC-BY-SA로 파생 공개)

**충돌 로그:** `field_provenance`에 source 우선순위와 타임스탬프 저장 → UI에서 "출처: JMdict / KRDICT" 표시.

### 3.4 저장소 (Electron Workspace 기준)

| 계층 | 기술 | 용도 |
|------|------|------|
| **번들 DB** | SQLite (읽기 전용, 앱 리소스) | JMdict+KANJIDIC+KanjiVG 인덱스, FTS5 |
| **사용자 DB** | SQLite (workspace per user) | SRS, 메모, 수동 gloss override, 최근 검색 |
| **Blob** | `assets/kanjivg/` 또는 압축 아카이브 | SVG/stroke JSON (lazy load) |
| **모델** | `models/zinnia/` 또는 `*.onnx` | 손글씨 인식 (~수 MB~수십 MB) |

FTS5 예: `writings`, `readings`, `glosses` 통합 가상 테이블 + `kanji.literal`.

**초기 빌드 파이프라인:** `scripts/japanese/import/` — XML/CSV → SQLite; [japanese-language-data](https://github.com/jkindrix/japanese-language-data) 스키마·테스트 참고 가능 (CC-BY-SA 파생물도 SA 준수).

---

## 4. 라이선스 체크리스트 (배포 전 필수)

| 소스 | 라이선스 | 앱 내 표기 | 파생 DB |
|------|----------|------------|---------|
| JMdict / KANJIDIC | [CC-BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html) | EDRDG attribution | SA — 통합 DB도 SA |
| KanjiVG | CC-BY-SA 3.0 | KanjiVG 링크 | stroke 수정 시 SA |
| Tatoeba | CC-BY 2.0 FR (일부) | 라이선스별 필터 | 문장만 추출 시 BY |
| KRDICT | CC-BY-SA 2.0 KR | 국립국어원 정책 | SA |
| Kanjium | **저장소 README 확인** | 별도 표기 | 재배포 조건 확인 |
| Zinnia | BSD | LICENSE | 모델(Tomoe) 별도 |
| cnn_chinese_hw | LGPL 2.1 | 동적 링크 고려 | ONNX 런타임 |

상업 배포 가능(JMdict 명시)하나 **SA 파생물 공개** 의무는 별도 — Workspace 데이터 번들을 repo에서 빌드 스크립트로 재생산 가능하게 두는 것이 안전.

---

## 5. 구현 단계 제안 (Japanese Pane)

### Phase A — 읽기 전용 사전 (MVP)
- [ ] JMdict + KANJIDIC2 → SQLite import + FTS 검색
- [ ] KanjiVG lazy load + 획순 애니메이션 뷰어
- [ ] Pane UI: 검색 → lexeme 상세 (읽기, EN gloss, 한자 breakdown)

### Phase B — 한국어 + 예문
- [ ] KRDICT crosswalk (표기/reading 매칭 + `target_code` direct)
- [ ] Tatoeba 예문 링크 (curated subset 우선)

### Phase C — 손글씨 찾기
- [ ] Canvas stroke capture UI
- [ ] Zinnia WASM **또는** ONNX 모델 통합
- [ ] top-N → kanji → lexeme browse

### Phase D — 학습 확장
- [ ] SRS / 플래시카드 (로컬 user DB)
- [ ] Pitch accent 표시
- [ ] 손글씨 연습 채점 (KanjiVG compare)

### Phase E — 사전 품질 & 학습 UX
- [x] JMdict 품사(POS) import + lexeme 상세 표시
- [x] SRS due 카운트 배지 (복습 탭)
- [x] 한국어 pane 탭 라벨
- [ ] Zinnia/ONNX 손글씨 인식 고도화 (후속)
- [ ] JMdict xref / JLPT lexeme 레벨 (후속)

---

## 6. 참고 링크

- EDRDG licence: https://www.edrdg.org/edrdg/licence.html
- JMdict DTD: https://www.edrdg.org/jmdict/jmdict_dtd_h.html
- JMdict XML Next Gen (xref 구조): https://www.edrdg.org/jmdemo/web/doc/2026-03-xmlng.html
- KanjiVG: https://kanjivg.tagaini.net/
- Tatoeba downloads: https://tatoeba.org/en/downloads
- KRDICT Open API: https://krdict.korean.go.kr/eng/openApi/openApiInfo
- Unified dataset example: https://github.com/jkindrix/japanese-language-data
- Handwriting: Zinnia https://taku910.github.io/zinnia/ , kanjidraw https://github.com/obfusk/kanjidraw
