"""Dataminer nhân vật Genshin Impact cho web Ban/Pick.

Nguồn: https://gi.yatta.moe/api/v2/en/avatar

Đầu ra:
  - web/public/characters/<slug>.png     (avatar vuông)
  - web/src/data/characters.json         (metadata đã chuẩn hóa)

Cách dùng (chạy từ bất kỳ thư mục nào):
  py assets/dataminer2.py                 # tải ảnh còn thiếu + ghi JSON
  py assets/dataminer2.py --json-only     # chỉ ghi JSON
  py assets/dataminer2.py --icons-only    # chỉ tải ảnh
  py assets/dataminer2.py --force         # tải lại toàn bộ ảnh
"""

from __future__ import annotations

import argparse
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_DIR = os.path.join(ROOT, "web", "public", "characters")
JSON_PATH = os.path.join(ROOT, "web", "src", "data", "characters.json")

API_URL = "https://gi.yatta.moe/api/v2/en/avatar"
ICON_URL = "https://gi.yatta.moe/assets/UI/{icon}.png"

ELEMENTS = {
    "Fire": "pyro",
    "Water": "hydro",
    "Wind": "anemo",
    "Electric": "electro",
    "Grass": "dendro",
    "Ice": "cryo",
    "Rock": "geo",
}

WEAPONS = {
    "WEAPON_SWORD_ONE_HAND": "sword",
    "WEAPON_CLAYMORE": "claymore",
    "WEAPON_POLE": "polearm",
    "WEAPON_BOW": "bow",
    "WEAPON_CATALYST": "catalyst",
}

# Nhà Lữ Hành: API trả về 14 biến thể (7 nguyên tố x nam/nữ).
# Chỉ giữ 2 mục, lấy ảnh của biến thể Anemo (ảnh giống nhau giữa các nguyên tố).
TRAVELERS = {
    "10000005-anemo": ("traveler-boy", "Nhà Lữ Hành (Nam)"),
    "10000007-anemo": ("traveler-girl", "Nhà Lữ Hành (Nữ)"),
}


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def normalize(char_id: str, info: dict) -> dict | None:
    if char_id.startswith(("10000005", "10000007")):
        if char_id not in TRAVELERS:
            return None
        slug, name = TRAVELERS[char_id]
        element = None
    else:
        name = info["name"]
        slug = slugify(info.get("route") or name)
        element = ELEMENTS.get(info.get("element"))

    rank = info.get("rank", 4)
    rarity = 5 if rank >= 5 else 4  # Aloy có rank=105 (5★ đặc biệt)
    release = info.get("release")

    return {
        "id": str(char_id),
        "slug": slug,
        "name": name,
        "rarity": rarity,
        "element": element,
        "weapon": WEAPONS.get(info.get("weaponType"), "sword"),
        "region": (info.get("region") or "").lower() or None,
        "release": (
            datetime.fromtimestamp(release, tz=timezone.utc).date().isoformat()
            if release
            else None
        ),
        "icon": f"/characters/{slug}.png",
        "_sourceIcon": info.get("icon"),
    }


def download_icon(char: dict, force: bool) -> None:
    path = os.path.join(ICON_DIR, f"{char['slug']}.png")
    if os.path.exists(path) and not force:
        return
    res = requests.get(ICON_URL.format(icon=char["_sourceIcon"]), timeout=30)
    if res.status_code == 200:
        with open(path, "wb") as f:
            f.write(res.content)
        print(f"[OK]  {char['slug']}.png")
    else:
        print(f"[LỖI] Không tải được {char['slug']} ({res.status_code})")


def main() -> None:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--json-only", action="store_true")
    group.add_argument("--icons-only", action="store_true")
    parser.add_argument("--force", action="store_true", help="tải lại ảnh đã có")
    args = parser.parse_args()

    items = requests.get(API_URL, timeout=30).json()["data"]["items"]
    chars = [c for c in (normalize(k, v) for k, v in items.items()) if c]
    chars.sort(key=lambda c: (c["release"] or "9999", c["id"]))
    print(f"Tìm thấy {len(chars)} nhân vật (từ {len(items)} mục API).")

    if not args.json_only:
        os.makedirs(ICON_DIR, exist_ok=True)
        with ThreadPoolExecutor(max_workers=10) as pool:
            list(pool.map(lambda c: download_icon(c, args.force), chars))

    if not args.icons_only:
        os.makedirs(os.path.dirname(JSON_PATH), exist_ok=True)
        out = [{k: v for k, v in c.items() if not k.startswith("_")} for c in chars]
        with open(JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"Đã ghi {JSON_PATH}")

    print("Hoàn tất!")


if __name__ == "__main__":
    main()
