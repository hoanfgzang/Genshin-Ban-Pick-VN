import os
import requests
from concurrent.futures import ThreadPoolExecutor

SAVE_DIR = "genshin_avatar_icons"
os.makedirs(SAVE_DIR, exist_ok=True)

api_url = "https://gi.yatta.moe/api/v2/en/avatar"
avatars = requests.get(api_url).json()["data"]["items"]

def download_icon(item):
    char_id, info = item
    icon_name = info.get("icon")  # Giữ nguyên tiền tố UI_AvatarIcon_
    if not icon_name:
        return

    # Link trực tiếp tới ảnh Avatar Icon vuông
    img_url = f"https://gi.yatta.moe/assets/UI/{icon_name}.png"
    res = requests.get(img_url)

    if res.status_code == 200:
        char_name = info.get("route", char_id)
        file_path = os.path.join(SAVE_DIR, f"{char_name}.png")
        with open(file_path, "wb") as f:
            f.write(res.content)
        print(f"[OK] {char_name}.png")
    else:
        print(f"[Lỗi] Không tải được {char_id}")

print(f"Đang tải {len(avatars)} avatar nhân vật...")
with ThreadPoolExecutor(max_workers=10) as executor:
    executor.map(download_icon, avatars.items())

print("Hoàn tất!")