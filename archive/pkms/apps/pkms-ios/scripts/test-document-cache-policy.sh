#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
swiftc "$script_dir/../PKMSDocumentCachePolicy.swift" \
  "$script_dir/test-document-cache-policy.swift" \
  -o "${TMPDIR:-/tmp}/pkms-document-cache-policy-test"
"${TMPDIR:-/tmp}/pkms-document-cache-policy-test"
rm -f "${TMPDIR:-/tmp}/pkms-document-cache-policy-test"
