# Apple FM Study Sidecar

macOS 26+ on-device Apple Intelligence bridge for Japanese Study Assist.

## Build

```bash
cd electron
npm run japanese:build-apple-fm-sidecar
```

Requires Xcode / Swift 6 with `FoundationModels` framework.

## Test

```bash
echo '{"task":"translate_to_ko","text":"食べる","user":"食べる"}' | ./apple-fm-sidecar
```

## Protocol

Stdin JSON:

```json
{ "task": "translate_to_ko", "text": "食べる", "system": "...", "user": "..." }
```

Stdout JSON:

```json
{ "ok": true, "content": "먹다" }
```
