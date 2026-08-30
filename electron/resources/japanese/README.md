# Japanese dictionary data setup

The Japanese pane reads a **local SQLite database** — nothing is downloaded automatically. You import open-source dictionary files once with the CLI, then the app loads the DB from user data.

## Where the app looks

| Mode | Linux / WSL path |
|------|------------------|
| `npm run dev` | `~/.config/workspace-app-dev/japanese/dictionary.db` |
| Packaged build | `~/.config/workspace-app/japanese/dictionary.db` |

macOS: `~/Library/Application Support/workspace-app(-dev)/japanese/dictionary.db`  
Windows: `%APPDATA%\workspace-app(-dev)\japanese\dictionary.db`

User progress (SRS, practice logs) is stored separately in `japanese/user.db`.

## Native module (better-sqlite3)

The app uses `better-sqlite3`, which must be compiled for **Electron** (not only system Node). After `npm install` or upgrading Electron, run:

```bash
cd electron
npm run rebuild:native
```

Import scripts (`japanese:import`, `japanese:import:fixtures`) run via Electron’s Node automatically so they use the same binary as the app.

## Quick start (sample data)

```bash
cd electron
npm run japanese:import:fixtures
```

Then in the app: **Japanese pane → Data tab → Reload dictionary** (or the ↻ button).

## Full import

1. Download sources (see [NOTICE.md](./NOTICE.md) for licenses):

   - [JMdict](https://www.edrdg.org/jmdict/j_jmdict.html) — `JMdict_e.xml`
   - [KANJIDIC2](https://www.edrdg.org/wiki/index.php?title=KANJIDIC_Project) — `kanjidic2.xml`
   - [KanjiVG](https://kanjivg.tagaini.net/) — `kanjivg/` directory (optional, for strokes)
   - [KRDICT](https://krdict.korean.go.kr/) — Korean glosses (optional)
   - [Tatoeba](https://tatoeba.org/en/downloads) — sentences + links TSV (optional)
   - [Kanjium](https://github.com/mifunetoshiro/kanjium) — `accents.txt` (optional)

2. Run import (omit flags you do not have):

```bash
cd electron
npm run japanese:import -- \
  --jmdict /path/to/JMdict_e.xml \
  --kanjidic /path/to/kanjidic2.xml \
  --kanjivg /path/to/kanjivg \
  --krdict /path/to/krdict.xml \
  --tatoeba-sentences /path/to/sentences.tsv \
  --tatoeba-links /path/to/links.tsv \
  --tatoeba-lexeme-links /path/to/curated-links.tsv \
  --kanjium /path/to/accents.txt
```

`--out` is optional; defaults to the dev path above. Use `--packaged` when importing for a production install.

3. **Reload** in the app (no restart required).

## Re-import / update

Re-run the same command. By default the DB is cleared and rebuilt. Use `--no-clear` to append (advanced).

## In-app UI

- **Data** tab — setup guide, reload button, DB path
- **Search** — FTS word lookup (requires JMdict import)
- **Handwriting** — stroke matching (requires KanjiVG import)
- **Review** — SRS queue (uses local `user.db`)
