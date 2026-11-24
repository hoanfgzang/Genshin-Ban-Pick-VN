"""Dataminer vũ khí Genshin Impact cho web Ban/Pick.

Nguồn: https://gi.yatta.moe/api/v2/en/weapon

Đầu ra:
  - web/public/weapons/<slug>.png   (icon vũ khí)
  - web/src/data/weapons.json       (metadata đã chuẩn hóa)

Cách dùng:
  py assets/dataminer_weapons.py              # tải ảnh còn thiếu + ghi JSON
  py assets/dataminer_weapons.py --json-only  # chỉ ghi JSON
  py assets/dataminer_weapons.py --icons-only # chỉ tải ảnh
  py assets/dataminer_weapons.py --force      # tải lại toàn bộ ảnh
"""

from __future__ import annotations

import argparse
import json
import os
import re
from concurrent.futures import ThreadPoolExecutor

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_DIR = os.path.join(ROOT, "web", "public", "weapons")
JSON_PATH = os.path.join(ROOT, "web", "src", "data", "weapons.json")

API_URL = "https://gi.yatta.moe/api/v2/en/weapon"
ICON_URL = "https://gi.yatta.moe/assets/UI/{icon}.png"

WEAPONS = {
    "WEAPON_SWORD_ONE_HAND": "sword",
    "WEAPON_CLAYMORE": "claymore",
    "WEAPON_POLE": "polearm",
    "WEAPON_BOW": "bow",
    "WEAPON_CATALYST": "catalyst",
}


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def normalize(weapon_id: str, info: dict) -> dict | None:
    if info.get("isWeaponSkin") or info.get("specialProp") == "NONE":
        return None
    rank = info.get("rank", 0)
    if rank not in (4, 5):
        return None
    weapon_type = WEAPONS.get(info.get("type"))
    icon_name = info.get("icon")
    if not weapon_type or not icon_name:
        return None

    name = (info.get("name") or "").strip()
    if not name:
        return None
    slug = slugify(info.get("route") or name)
    if not slug:
        return None

    rarity = 5 if rank >= 5 else 4
    return {
        "id": str(weapon_id),
        "slug": slug,
        "name": name,
        "rarity": rarity,
        "weaponType": weapon_type,
        "icon": f"/weapons/{slug}.png",
        "_sourceIcon": icon_name,
    }


def deduplicate(items: list[dict]) -> list[dict]:
    # Giữ bản đầu tiên (ID nhỏ nhất) nếu trùng (slug, rarity, weaponType) như các biến thể nhiệm vụ
    items.sort(key=lambda w: int(w["id"]) if w["id"].isdigit() else 99999999)
    seen_identity: set[tuple[str, int, str]] = set()
    used_slugs: set[str] = set()
    result: list[dict] = []

    for w in items:
        identity = (w["slug"], w["rarity"], w["weaponType"])
        if identity in seen_identity:
            continue
        seen_identity.add(identity)

        slug = w["slug"]
        if slug in used_slugs:
            slug = f"{slug}-{w['id']}"
            w = {**w, "slug": slug, "icon": f"/weapons/{slug}.png"}
        used_slugs.add(slug)
        result.append(w)

    result.sort(key=lambda w: (-w["rarity"], w["weaponType"], w["name"]))
    return result


def download_icon(weapon: dict, force: bool) -> None:
    path = os.path.join(ICON_DIR, f"{weapon['slug']}.png")
    if os.path.exists(path) and not force:
        return
    res = requests.get(ICON_URL.format(icon=weapon["_sourceIcon"]), timeout=30)
    if res.status_code == 200:
        with open(path, "wb") as f:
            f.write(res.content)
        print(f"[OK]  {weapon['slug']}.png")
    else:
        print(f"[LỖI] Không tải được {weapon['slug']} ({res.status_code})")


def main() -> None:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--json-only", action="store_true")
    group.add_argument("--icons-only", action="store_true")
    parser.add_argument("--force", action="store_true", help="tải lại ảnh đã có")
    args = parser.parse_args()

    items = requests.get(API_URL, timeout=30).json()["data"]["items"]
    raw_weapons = [w for w in (normalize(k, v) for k, v in items.items()) if w]
    weapons = deduplicate(raw_weapons)
    print(f"Tìm thấy {len(weapons)} vũ khí 4★–5★ (từ {len(items)} mục API).")

    if not args.json_only:
        os.makedirs(ICON_DIR, exist_ok=True)
        with ThreadPoolExecutor(max_workers=12) as pool:
            list(pool.map(lambda w: download_icon(w, args.force), weapons))

    if not args.icons_only:
        os.makedirs(os.path.dirname(JSON_PATH), exist_ok=True)
        out = [{k: v for k, v in w.items() if not k.startswith("_")} for w in weapons]
        with open(JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"Đã ghi {JSON_PATH}")

    print("Hoàn tất!")


if __name__ == "__main__":
    main()
