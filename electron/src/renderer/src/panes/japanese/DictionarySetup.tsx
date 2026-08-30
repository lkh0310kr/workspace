import { JapaneseDiagnostics } from "./JapaneseDiagnostics";
import { useJapaneseDb } from "./useJapaneseDb";

const DATA_SOURCES = [
  {
    name: "JMdict",
    required: true,
    note: "단어·영어 뜻·품사 (필수)",
    url: "https://www.edrdg.org/jmdict/j_jmdict.html",
    flag: "--jmdict",
    file: "JMdict_e.xml",
  },
  {
    name: "KANJIDIC2",
    required: true,
    note: "한자 획수·음훈·JLPT (필수)",
    url: "https://www.edrdg.org/wiki/index.php?title=KANJIDIC_Project",
    flag: "--kanjidic",
    file: "kanjidic2.xml",
  },
  {
    name: "KanjiVG",
    required: false,
    note: "획순 SVG·필기 인식 (권장)",
    url: "https://kanjivg.tagaini.net/",
    flag: "--kanjivg",
    file: "kanjivg/ 폴더",
  },
  {
    name: "KRDICT",
    required: false,
    note: "한국어 뜻",
    url: "https://krdict.korean.go.kr/",
    flag: "--krdict",
    file: "krdict XML 또는 한국어기초사전 JSON 폴더",
  },
  {
    name: "Tatoeba",
    required: false,
    note: "예문 (sentences + links TSV)",
    url: "https://tatoeba.org/en/downloads",
    flag: "--tatoeba-sentences / --tatoeba-links",
    file: "sentences.tsv, links.tsv",
  },
  {
    name: "Kanjium",
    required: false,
    note: "성조(액센트) 패턴",
    url: "https://github.com/mifunetoshiro/kanjium",
    flag: "--kanjium",
    file: "accents.txt",
  },
];

function buildImportCommand(dbPath: string | null): string {
  const outLine = dbPath ? `  --out ${dbPath} \\` : "  # --out 생략 시 workspace-app-dev";
  return `cd electron
npm run japanese:import -- \\
  --jmdict /path/to/JMdict_e.xml \\
  --kanjidic /path/to/kanjidic2.xml \\
  --kanjivg /path/to/kanjivg \\
  --krdict /path/to/krdict.xml \\
  --tatoeba-sentences /path/to/sentences.tsv \\
  --tatoeba-links /path/to/links.tsv \\
  --kanjium /path/to/accents.txt \\
${outLine}`;
}

export function DictionarySetup() {
  const { status, loading, reloading, reload } = useJapaneseDb();

  if (loading && !status) {
    return <div className="japanese-pane-detail-empty">사전 상태 확인 중…</div>;
  }

  if (status?.ready) {
    return (
      <div className="japanese-setup-ready">
        <p className="japanese-setup-lead">
          사전 로드됨 — 단어 {status.entryCount.toLocaleString()}개, 한자 {status.kanjiCount.toLocaleString()}자
          {status.strokeKanjiCount > 0 ? `, 획 데이터 ${status.strokeKanjiCount.toLocaleString()}자` : ""}.
        </p>
        {status.loadedPath && status.loadedPath !== status.path ? (
          <p className="japanese-diagnostics-alert">대체 DB 사용 중: {status.loadedPath}</p>
        ) : null}
        {status.importedAt ? (
          <p className="japanese-pane-toolbar-hint">
            마지막 import: {new Date(status.importedAt).toLocaleString()}
          </p>
        ) : null}
        <p className="japanese-pane-toolbar-hint">기본 경로: {status.path}</p>
        <button type="button" className="japanese-stroke-btn" onClick={() => void reload()} disabled={reloading}>
          {reloading ? "다시 불러오는 중…" : "사전 다시 불러오기"}
        </button>
        <JapaneseDiagnostics status={status} />
      </div>
    );
  }

  return (
    <div className="japanese-setup">
      <h2 className="japanese-setup-title">일본어 사전 데이터 불러오기</h2>
      {status?.loadMessage ? <p className="japanese-diagnostics-alert">{status.loadMessage}</p> : null}
      <p className="japanese-setup-lead">
        앱은 로컬 SQLite 파일을 읽습니다. git에는 데이터가 없고, 오픈소스 XML/TSV를 한 번 받아 CLI로 import
        해야 합니다.
      </p>

      <section className="japanese-setup-section">
        <h3 className="japanese-section-title">1. 빠른 테스트 (fixture)</h3>
        <pre className="japanese-pane-import-hint">cd electron{"\n"}npm run japanese:import:fixtures</pre>
        <p className="japanese-pane-toolbar-hint">
          <code>test-fixtures/japanese/</code> 샘플 5단어. 개발·동작 확인용입니다.
        </p>
      </section>

      <section className="japanese-setup-section">
        <h3 className="japanese-section-title">2. 전체 import</h3>
        <p className="japanese-setup-lead">
          아래 소스를 받은 뒤 경로를 바꿔 실행하세요. 없는 항목은 플래그를 빼도 됩니다.
        </p>
        <pre className="japanese-pane-import-hint">{buildImportCommand(status?.path ?? null)}</pre>
        <p className="japanese-pane-toolbar-hint">
          dev 기본 출력: <code>workspace-app-dev</code>. 예전에 <code>workspace-app</code>에 넣었다면 앱이
          자동으로 찾습니다.
        </p>
      </section>

      <section className="japanese-setup-section">
        <h3 className="japanese-section-title">3. 앱에서 reload</h3>
        <p className="japanese-setup-lead">import가 끝나면 아래 버튼 — 앱 재시작은 필요 없습니다.</p>
        <button type="button" className="japanese-stroke-btn" onClick={() => void reload()} disabled={reloading}>
          {reloading ? "다시 불러오는 중…" : "사전 다시 불러오기"}
        </button>
      </section>

      <JapaneseDiagnostics status={status} />

      <section className="japanese-setup-section">
        <h3 className="japanese-section-title">데이터 소스</h3>
        <ul className="japanese-source-list">
          {DATA_SOURCES.map((source) => (
            <li key={source.name}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.name}
              </a>
              <span className="japanese-source-flag">
                {source.required ? "필수" : "선택"} · {source.file} · {source.flag}
              </span>
              <span className="japanese-source-note">{source.note}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
