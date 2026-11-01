"""Converts a Kakao Map favorites export into a `*.map` folder the app can open.

Input folder: `list.md` (response of favorite/mine/list) plus one `<folderid>.md` per folder
(response of the folder's favorites). Output: `<out>/folders.json` and `<out>/<folderid>.json`.

    python3 -I scripts/convert-kakao-favorites.py data ../pkms/map.map
"""
import json
import sys
from pathlib import Path

import numpy as np

src, out = Path(sys.argv[1]), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

def load(path):
    return json.loads(path.read_text(encoding="utf-8"))

def all_favorites():
    for path in sorted(src.glob("[0-9]*.md")):
        yield from load(path)["favorites"]

# Some entries only carry Kakao's own x/y (WCONGNAMUL, 0.4 m units) and no lon/lat. Fit a
# 2nd-degree polynomial on the entries that have both (median error under 1 m) and use it for the rest.
known = [f for f in all_favorites() if "lat" in f and "x" in f]
xy = np.array([[f["x"], f["y"]] for f in known], float)
lonlat = np.array([[f["lon"], f["lat"]] for f in known])
mean, std = xy.mean(0), xy.std(0)

def basis(points):
    z = (np.atleast_2d(points) - mean) / std
    return np.c_[tuple(z[:, 0] ** i * z[:, 1] ** j for i in range(3) for j in range(3 - i))]

coefficients = np.linalg.lstsq(basis(xy), lonlat, rcond=None)[0]

def estimate(x, y):
    lon, lat = (basis([[x, y]]) @ coefficients)[0]
    return round(float(lon), 8), round(float(lat), 8)

skipped = 0
folders = []
for folder in load(src / "list.md")["folders"]:
    fid = folder["folderid"]
    items = []
    favorites = src / f"{fid}.md"
    if favorites.exists():
        for fav in sorted(load(favorites)["favorites"], key=lambda f: f["created_at"]):
            is_place = fav["type"] == "PLACE"
            if "x" not in fav:  # e.g. saved walking routes have no position
                skipped += 1
                continue
            estimated = "lat" not in fav
            if estimated:
                fav["lon"], fav["lat"] = estimate(fav["x"], fav["y"])
            items.append({
                "id": fav["seq"],
                "name": fav["display1"],
                **({"address": fav["display2"]} if fav.get("display2") else {}),
                **({"memo": fav["memo"]} if fav.get("memo") else {}),
                "lat": fav["lat"],
                "lon": fav["lon"],
                "createdAt": fav["created_at"],
                **({"estimated": True} if estimated else {}),
                **({"kakaoPlaceId": fav["key"]} if is_place else {}),
            })
    (out / f"{fid}.json").write_text(
        json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    folders.append({
        "id": fid,
        "title": folder["title"],
        **({"memo": folder["memo"]} if folder.get("memo") else {}),
        "icon": folder.get("icon", "01"),
        "count": len(items),
    })

(out / "folders.json").write_text(
    json.dumps({"version": 1, "folders": folders}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"{len(folders)} folders, {sum(f['count'] for f in folders)} places -> {out} ({skipped} skipped without a position)")
