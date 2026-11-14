# Workspace desktop logs

## What was filling the disk

The app wrote every NDJSON record synchronously to an unbounded plain-text file. The terminal trace stored raw PTY input and output at several pipeline points, including shell read, renderer delivery, xterm scheduling, and xterm receipt. Layout traces also recorded model snapshots and every scheduled persistence event. These traces were enabled in production as well as development.

On the inspected Mac, the stable and development log folders together held about 2.6 GiB. Stable `terminal.ndjson` was 1.36 GiB across 2.37 million records, `layout.ndjson` was 604 MiB across 1.01 million records, and the same 116.5 MiB of browser focus records existed byte-for-byte in both `interaction.ndjson` and `browser-focus.ndjson`.

## Lossless storage policy

- Keep the active `.ndjson` file readable and rotate it at 16 MiB.
- Compress closed segments with Node's built-in gzip stream at the default compression level. Gzip is lossless and uses bounded streaming memory; the writer removes the raw segment only after gzip finishes. Failed compression leaves the raw archive in place for recovery.
- Do not apply an age or size retention limit. Compressed archives retain every record. If a fixed local disk limit is needed later, move older gzip archives to external storage before considering deletion.
- Stop writing the exact duplicate browser-focus copy. Those records remain in `interaction.ndjson`.
- Provide a one-time compressor for existing large files. It computes SHA-256 for the source and the decompressed result, and replaces a source only when the hashes match.

Sixteen MiB samples from the inspected logs compressed to 0.76 MiB for terminal records, 0.24 MiB for layout records, and 0.29 MiB for interaction records. Actual ratios vary by segment.

## Existing logs and recovery

Quit all Workspace instances before compressing existing files. The command requires an explicit `--app-closed` acknowledgement so an active process cannot append to a file during verification. From the repository root:

```sh
npm run logs:compress -- --app-closed
```

The command compresses log files of at least 1 MiB in the stable and development log folders. It leaves a fresh empty active file with the original name. To restore `.ndjson.gz` files without overwriting active logs:

```sh
npm run logs:restore
```

Restored files are written under each log folder's `restored-logs/` directory. Compression does not redact terminal contents; archives preserve the exact original records.

## Implementation details

The runtime writer is in `apps/workspace-app/src/main/logFileWriter.ts`. It uses streaming gzip and rotates rather than truncating. There is deliberately no automatic deletion policy: a hard cap and permanent retention cannot both be guaranteed without moving archives to another storage location.
