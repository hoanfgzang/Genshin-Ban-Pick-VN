"""Dataminer nhân vật Genshin Impact cho web Ban/Pick.

Nguồn:
  - Metadata & icon vuông: https://gi.yatta.moe/api/v2/en/avatar
  - Ảnh thẻ dọc (Multi Wish): https://genshin-impact.fandom.com/api.php (fallback gacha splash)

Đầu ra:
  - web/public/characters/<slug>.png        (avatar vuông)
  - web/public/character_cards/<slug>.webp  (ảnh dọc cho thẻ đội hình)
  - web/src/data/characters.json            (metadata đã chuẩn hóa)

Cách dùng (chạy từ bất kỳ thư mục nào):
  py assets/dataminer2.py                   # tải ảnh còn thiếu + ghi JSON
  py assets/dataminer2.py --json-only       # chỉ ghi JSON
  py assets/dataminer2.py --icons-only      # chỉ tải avatar vuông
  py assets/dataminer2.py --cards-only      # chỉ tải & crop ảnh thẻ dọc
  py assets/dataminer2.py --skip-cards      # bỏ qua bước tải ảnh thẻ dọc
  py assets/dataminer2.py --force           # tải lại toàn bộ ảnh
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from io import BytesIO
import json
import os
import re
import time

from PIL import Image
import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_DIR = os.path.join(ROOT, "web", "public", "characters")
CARD_DIR = os.path.join(ROOT, "web", "public", "character_cards")
JSON_PATH = os.path.join(ROOT, "web", "src", "data", "characters.json")

API_URL = "https://gi.yatta.moe/api/v2/en/avatar"
ICON_URL = "https://gi.yatta.moe/assets/UI/{icon}.png"
GACHA_URL = "https://gi.yatta.moe/assets/UI/{gacha}.png"
FANDOM_API_URL = "https://genshin-impact.fandom.com/api.php"
HTTP_HEADERS = {"User-Agent": "GenshinBanPickVN/1.0"}

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


def get_with_retry(url: str, *, timeout: int = 30, attempts: int = 3) -> requests.Response | None:
    for i in range(attempts):
        try:
            res = requests.get(url, timeout=timeout, headers=HTTP_HEADERS)
            if res.status_code == 404:
                return res
            if res.status_code == 200:
                return res
        except requests.RequestException:
            pass
        if i + 1 < attempts:
            time.sleep(0.8 * (i + 1))
    return None


def fetch_multi_wish_urls(chars: list[dict]) -> dict[str, str]:
    """Lấy link ảnh <Name>_Multi_Wish.png hàng loạt từ Genshin Impact Wiki (Fandom API)."""
    title_to_slug = {f"File:{c['name']} Multi Wish.png": c["slug"] for c in chars}
    slug_to_url: dict[str, str] = {}
    for i in range(0, len(chars), 50):
        batch = chars[i : i + 50]
        titles = "|".join(f"File:{c['name'].replace(' ', '_')}_Multi_Wish.png" for c in batch)
        for attempt in range(3):
            try:
                res = requests.get(
                    FANDOM_API_URL,
                    params={
                        "action": "query",
                        "titles": titles,
                        "prop": "imageinfo",
                        "iiprop": "url",
                        "format": "json",
                    },
                    timeout=25,
                    headers=HTTP_HEADERS,
                )
                if res.status_code == 200:
                    pages = res.json().get("query", {}).get("pages", {}).values()
                    for p in pages:
                        if "missing" not in p and p.get("imageinfo"):
                            slug = title_to_slug.get(p.get("title", ""))
                            if slug:
                                slug_to_url[slug] = p["imageinfo"][0]["url"]
                    break
            except requests.RequestException:
                time.sleep(0.8 * (attempt + 1))
    return slug_to_url


def format_multi_wish_card(img: Image.Image, target_w: int = 240) -> Image.Image:
    """Giữ trọn khung dọc gốc của ảnh Multi_Wish (320x1024 -> 240x768) để CSS căn giữa chính xác."""
    rgba = img.convert("RGBA")
    w, h = rgba.size
    target_h = round(h * target_w / w)
    return rgba.resize((target_w, target_h), Image.Resampling.LANCZOS)


def crop_gacha_card(img: Image.Image, target_w: int = 240, target_h: int = 504) -> Image.Image:
    """Crop vùng thân trên từ ảnh gacha trong suốt và nén sang kích thước thẻ dọc."""
    rgba = img.convert("RGBA")
    w, h = rgba.size
    alpha_bytes = rgba.getchannel("A").tobytes()

    # Dùng ngưỡng alpha gần như đặc (>= 245) trong dải trung tâm để tránh bị hiệu ứng/vũ khí kéo lệch
    bx_start = int(w * 0.38)
    bx_end = int(w * 0.64)
    top_y = int(h * 0.10)
    for y in range(h):
        row = alpha_bytes[y * w + bx_start : y * w + bx_end]
        if row and max(row) >= 245:
            top_y = y
            break

    by_end = min(h, top_y + int(h * 0.42))
    sum_x = 0
    count = 0
    for y in range(top_y, by_end):
        row_offset = y * w
        for x in range(bx_start, bx_end):
            if alpha_bytes[row_offset + x] >= 245:
                sum_x += x
                count += 1
    cx = (sum_x / count) if count else (w / 2)

    y0 = max(0, top_y - int(h * 0.02))
    crop_h = min(h - y0, int(h * 0.78))
    crop_w = int(crop_h * target_w / target_h)
    if crop_w > w:
        crop_w = w
        crop_h = min(h - y0, int(crop_w * target_h / target_w))
    x0 = max(0, min(w - crop_w, int(cx - crop_w / 2)))

    cropped = rgba.crop((x0, y0, x0 + crop_w, y0 + crop_h))
    return cropped.resize((target_w, target_h), Image.Resampling.LANCZOS)


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
        "card": None,
        "_sourceIcon": info.get("icon"),
    }


def download_icon(char: dict, force: bool) -> None:
    path = os.path.join(ICON_DIR, f"{char['slug']}.png")
    if os.path.exists(path) and not force:
        return
    res = get_with_retry(ICON_URL.format(icon=char["_sourceIcon"]))
    if res and res.status_code == 200:
        with open(path, "wb") as f:
            f.write(res.content)
        print(f"[OK]   icon {char['slug']}.png")
    else:
        code = res.status_code if res else "ERR"
        print(f"[LỖI]  Không tải được icon {char['slug']} ({code})")


def download_card(char: dict, force: bool, multi_wish_urls: dict[str, str]) -> None:
    path = os.path.join(CARD_DIR, f"{char['slug']}.webp")
    if os.path.exists(path) and not force:
        return

    mw_url = multi_wish_urls.get(char["slug"])
    if mw_url:
        res = get_with_retry(mw_url, timeout=30)
        if res and res.status_code == 200:
            with Image.open(BytesIO(res.content)) as img:
                card = format_multi_wish_card(img)
                card.save(path, format="WEBP", quality=84, method=4)
            print(f"[OK]   card (MultiWish) {char['slug']}.webp")
            return

    source_icon = char.get("_sourceIcon") or ""
    if not source_icon.startswith("UI_AvatarIcon_"):
        return

    gacha_name = source_icon.replace("UI_AvatarIcon_", "UI_Gacha_AvatarImg_", 1)
    res = get_with_retry(GACHA_URL.format(gacha=gacha_name), timeout=40)
    if not res or res.status_code != 200:
        code = res.status_code if res else "ERR"
        print(f"[BỎ QUA] card {char['slug']} ({code})")
        return

    with Image.open(BytesIO(res.content)) as img:
        card = crop_gacha_card(img)
        card.save(path, format="WEBP", quality=82, method=4)
    print(f"[OK]   card (Gacha) {char['slug']}.webp")


def main() -> None:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--json-only", action="store_true")
    group.add_argument("--icons-only", action="store_true")
    group.add_argument("--cards-only", action="store_true")
    parser.add_argument("--skip-cards", action="store_true", help="bỏ qua ảnh thẻ dọc")
    parser.add_argument("--force", action="store_true", help="tải lại ảnh đã có")
    args = parser.parse_args()

    items = requests.get(API_URL, timeout=30).json()["data"]["items"]
    chars = [c for c in (normalize(k, v) for k, v in items.items()) if c]
    chars.sort(key=lambda c: (c["release"] or "9999", c["id"]))
    print(f"Tìm thấy {len(chars)} nhân vật (từ {len(items)} mục API).")

    do_icons = not args.json_only and not args.cards_only
    do_cards = not args.json_only and not args.icons_only and not args.skip_cards
    do_json = not args.icons_only and not args.cards_only

    if do_icons:
        os.makedirs(ICON_DIR, exist_ok=True)
        with ThreadPoolExecutor(max_workers=10) as pool:
            list(pool.map(lambda c: download_icon(c, args.force), chars))

    if do_cards:
        os.makedirs(CARD_DIR, exist_ok=True)
        multi_wish_urls = fetch_multi_wish_urls(chars)
        print(f"Tìm thấy {len(multi_wish_urls)}/{len(chars)} ảnh Multi_Wish trên Fandom Wiki.")
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda c: download_card(c, args.force, multi_wish_urls), chars))

    if do_json:
        for c in chars:
            card_path = os.path.join(CARD_DIR, f"{c['slug']}.webp")
            c["card"] = f"/character_cards/{c['slug']}.webp" if os.path.exists(card_path) else None
        os.makedirs(os.path.dirname(JSON_PATH), exist_ok=True)
        out = [{k: v for k, v in c.items() if not k.startswith("_")} for c in chars]
        with open(JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
            f.write("\n")
        card_count = sum(1 for c in out if c["card"])
        print(f"Đã ghi {JSON_PATH} ({card_count}/{len(out)} nhân vật có thẻ dọc)")

    print("Hoàn tất!")


if __name__ == "__main__":
    main()
