#!/usr/bin/env python3
"""Fetch only the iOS device/simulator slices needed from L Shell's NodeMobile release.

The upstream release ZIP is 600 MB because it includes dSYMs and visionOS slices.
HTTP range requests let this script fetch just the iOS NodeMobile binaries and headers.
"""

from __future__ import annotations

import io
import json
import plistlib
import shutil
import struct
import subprocess
import sys
import zipfile
import zlib
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
ROOT = REPO / "AgentRuntime"
VENDOR = ROOT / "Vendor"
RUNTIME = ROOT / "RuntimeTemplate"
NODE_RELEASE = "https://api.github.com/repos/fogtape/nodejs-mobile/releases/tags/v24.22.1-0"
# 2.1.112 is the last JavaScript CLI bundle used by the verified L Shell port.
# Newer npm releases ship platform-native executables, which iOS cannot launch.
CLAUDE_CODE_VERSION = "2.1.112"


def get_bytes(url: str, byte_range: tuple[int, int] | None = None) -> bytes:
    command = ["curl", "--fail", "--silent", "--show-error", "--location", "--max-time", "90"]
    if byte_range:
        command.extend(["--range", f"{byte_range[0]}-{byte_range[1]}"])
    command.extend(["--write-out", "\n%{http_code}", url])
    result = subprocess.run(command, check=True, capture_output=True)
    payload, status = result.stdout.rsplit(b"\n", 1)
    if byte_range and status != b"206":
        raise RuntimeError(f"Server ignored byte range {byte_range}: HTTP {status.decode()}")
    return payload


def central_directory_tail(url: str, size: int) -> tuple[zipfile.ZipFile, int]:
    # Includes the complete central directory and all small final entries.
    tail_size = min(size, 8 * 1024 * 1024)
    start = size - tail_size
    tail = io.BytesIO(get_bytes(url, (start, size - 1)))
    return zipfile.ZipFile(tail), start


def read_remote_entry(url: str, archive_start: int, info: zipfile.ZipInfo) -> bytes:
    offset = archive_start + info.header_offset
    header = get_bytes(url, (offset, offset + 4095))
    if header[:4] != b"PK\x03\x04":
        raise RuntimeError(f"Invalid ZIP local header: {info.filename}")
    fields = struct.unpack_from("<IHHHHHIIIHH", header)
    name_length, extra_length = fields[-2:]
    data_start = offset + 30 + name_length + extra_length
    compressed = get_bytes(url, (data_start, data_start + info.compress_size - 1))
    if info.compress_type == zipfile.ZIP_STORED:
        return compressed
    if info.compress_type == zipfile.ZIP_DEFLATED:
        return zlib.decompress(compressed, -15)
    raise RuntimeError(f"Unsupported compression type {info.compress_type}: {info.filename}")


def main() -> None:
    print("Fetching NodeMobile release metadata…", flush=True)
    release = json.loads(get_bytes(NODE_RELEASE))
    asset = next(item for item in release["assets"] if item["name"] == "nodejs-mobile-ios-24.22.1-0.zip")
    archive_url, archive_size = asset["browser_download_url"], asset["size"]
    archive, archive_start = central_directory_tail(archive_url, archive_size)
    entries = {item.filename: item for item in archive.infolist()}

    if VENDOR.exists():
        shutil.rmtree(VENDOR)
    VENDOR.mkdir(parents=True)

    wanted = ["NodeMobile.xcframework/Info.plist"]
    for platform in ("ios-arm64", "ios-arm64-simulator"):
        prefix = f"NodeMobile.xcframework/{platform}/NodeMobile.framework/"
        wanted.extend(name for name in entries if name.startswith(prefix) and not name.endswith("/"))

    for name in wanted:
        info = entries.get(name)
        if info is None:
            raise RuntimeError(f"Missing upstream file: {name}")
        print(f"  {name} ({info.file_size:,} bytes)", flush=True)
        destination = VENDOR / "NodeMobile.xcframework" / Path(*Path(name).parts[1:])
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(read_remote_entry(archive_url, archive_start, info))

    info_path = VENDOR / "NodeMobile.xcframework" / "Info.plist"
    manifest = plistlib.loads(info_path.read_bytes())
    manifest["AvailableLibraries"] = [
        library for library in manifest["AvailableLibraries"]
        if library["LibraryIdentifier"] in {"ios-arm64", "ios-arm64-simulator"}
    ]
    info_path.write_bytes(plistlib.dumps(manifest, fmt=plistlib.FMT_XML, sort_keys=False))
    print(f"NodeMobile ready at {VENDOR}", flush=True)

    print("Installing the pinned JavaScript runtime…", flush=True)
    subprocess.run(["npm", "ci", "--omit=dev", "--ignore-scripts"], cwd=RUNTIME, check=True)
    cli_tar = ROOT / f"anthropic-ai-claude-code-{CLAUDE_CODE_VERSION}.tgz"
    subprocess.run(["npm", "pack", f"@anthropic-ai/claude-code@{CLAUDE_CODE_VERSION}", "--pack-destination", str(ROOT)], cwd=ROOT, check=True)
    cli_dir = RUNTIME / "vendor" / "claude-code"
    cli_dir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(cli_tar, "r:gz") as package:
        for name in ("package/cli.js", "package/package.json", "package/LICENSE.md"):
            member = package.getmember(name)
            contents = package.extractfile(member)
            if contents is None:
                raise RuntimeError(f"Could not read Claude Code package file {name}")
            (cli_dir / Path(name).name).write_bytes(contents.read())
    cli_tar.unlink(missing_ok=True)
    print("Claude Code runtime ready.", flush=True)


if __name__ == "__main__":
    import tarfile
    try:
        main()
    except Exception as error:
        print(f"Runtime setup failed: {error}", file=sys.stderr)
        raise
