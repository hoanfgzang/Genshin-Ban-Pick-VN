# PROJECT_CONTEXT

## 1. Dự án là gì

**Genshin Ban/Pick VN** — ứng dụng web cho cộng đồng người chơi Genshin Impact Việt Nam, tổ chức các trận thi đấu **La Hoàn (Spiral Abyss) 1v1** theo thể thức Ban/Pick nhân vật có **Cost cân bằng**.

Tầm nhìn dài hạn (từ chủ dự án): giao lưu & kết nối người chơi, tổ chức/theo dõi trận, hồ sơ người dùng, thống kê thắng/thua & thành tích, các tính năng cộng đồng về sau.

> [!WARNING]
> **Tầm nhìn ≠ hiện trạng.** Hiện tại sản phẩm mới là *công cụ thi đấu Ban/Pick realtime + kho nhân vật + bộ luật*. Các mục cộng đồng (kết nối, hồ sơ công khai, thống kê, giải đấu) **chưa có code**. Đừng viết như thể đã có; khi được yêu cầu thêm, coi đó là tính năng mới (Tier 2 nếu cần schema/API mới).

Ngôn ngữ giao diện & thông báo lỗi: **tiếng Việt**. Mã nguồn, tên biến, commit: tiếng Anh.

## 2. Trạng thái tính năng

| Tính năng | Trạng thái | Nơi hiện thực chính |
|---|---|---|
| Đăng ký/đăng nhập UID + mật khẩu | ✅ Xong | `app/routers/auth.py`, `web/src/features/auth/` |
| Chế độ Khách (kho cục bộ, xem trận) | ✅ Xong | `web/src/services/mock/`, `authStore` |
| Phân quyền Player / Admin / Super admin | ✅ Xong | `app/core/deps.py`, `routers/admin_users.py`, `pages/AdminUsersPage.tsx` |
| Kho nhân vật cá nhân (C0–C6, Lv 90/95/100) | ✅ Xong | `routers/inventory.py`, `features/inventory/`, `pages/ProfilePage.tsx` |
| Bộ luật & Cost (CRUD, CSV, custom cost, mốc giây) | ✅ Xong | `routers/rulesets.py`, `schemas/ruleset.py`, `features/rules/` |
| Phòng đấu 1v1 realtime, BO1/BO3 | ✅ Xong | `services/draft_engine.py`, `room_manager.py`, `features/match/` |
| Timer lượt, reserve time, overtime/forfeit, undo | ✅ Xong | `draft_engine.py`, `room_manager.py` |
| Chọn vũ khí + tinh luyện, nhập 3 ải, tie-break | ✅ Xong | `draft_engine.py`, `cost_engine.py`, `MatchScoringPhase.tsx` |
| Nhà Lữ Hành chọn nguyên tố | ✅ Xong (commit gần nhất) | `services/traveler.py`, `TravelerElementDialog.tsx` |
| Danh sách trận gần đây (20) | ✅ Xong (trong Lobby) | `GET /api/me/matches`, `LobbyPage.tsx` |
| Tinh chỉnh UI bảng draft | 🔧 Đang làm (theo git log) | `features/match/DraftSlotsBoard.tsx`, `DualRosterGrid.tsx` |
| Hồ sơ công khai / xem kho người khác | ❌ Chưa có | — |
| Thống kê tỷ lệ thắng, thành tích tổng hợp | ❌ Chưa có (mới có dữ liệu thô trong `matches.state_json`) | — |
| Trang lịch sử/replay trận | ❌ Chưa có | — |
| Giải đấu/bracket, overlay stream | ❌ Chưa có | — |
| OAuth, quên mật khẩu, xác thực email | ❌ Chưa có | — |
| CI/CD, deploy production | ❌ Chưa có | — |

## 3. Thuật ngữ

| Thuật ngữ | Nghĩa trong code |
|---|---|
| **UID** | UID Genshin 9–10 chữ số, dùng làm tên đăng nhập (`User.uid`) |
| **Cung mệnh C0–C6** | `constellation` 0..6 của nhân vật |
| **Level** | chỉ nhận `90 | 95 | 100` |
| **Bộ luật (RuleSet)** | cấu hình trận: thứ tự ban/pick, timer, cost, tie-break. Lưu `rulesets.config_json` (`RuleSetConfig`) |
| **Draft step** | một lượt `{step, side, action: ban|pick, seconds?}` |
| **Phase (draft)** | nhóm bước từ các Ban liên tiếp tới hết các Pick kế tiếp (`split_draft_into_phases`) |
| **Side** | `blue` (Xanh Dương, bên trái) / `red` (Đỏ, bên phải). Mặc định Blue ban & pick trước |
| **Cost** | điểm "giá" của nhân vật (theo C) + vũ khí; tổng Cost → **giây phạt** qua `milestones` |
| **Refinement R1–R5** | tinh luyện vũ khí; cộng thêm giây (mặc định 5★: 0/5/10/15/20s) |
| **Ải (chamber)** | 3 ải; mỗi ải nhập thời gian `mm:ss`, điểm = `10:00 − thời gian` |
| **Điểm cuối (finalScore)** | phạt từ Cost + giây tinh luyện + giây overtime + tổng điểm 3 ải (xem `_compute_final_score`); **thấp hơn thắng** |
| **Tie-break** | `none | lower_cost | fewer_4star | lower_cost_then_fewer_4star` |
| **Weapon phase** | giai đoạn điền vũ khí sau khi ban/pick xong, có timeout |
| **Lineup** | thứ tự sắp xếp các nhân vật đã pick (`reorder_lineup`) |
| **Traveler** | Nhà Lữ Hành: kho lưu `traveler-boy/girl`; khi pick dùng slug theo nguyên tố |
| **Super admin** | admin có `uid == SEED_ADMIN_UID`; quyền phân role |
| **Guest** | người dùng không đăng nhập; chỉ phía frontend; xem được, không thao tác trận |
| **Match code** | mã phòng 6 ký tự (bảng chữ không có `I O 0 1`) |
| **Ruleset snapshot** | bản sao luật đóng băng vào trận lúc tạo (`matches.ruleset_snapshot`, `MatchState.ruleset`) |

## 4. Luật chơi cốt lõi (rút từ code & README)

1. Host tạo phòng từ một bộ luật đang active; chọn BO1/BO3. Đối thủ vào bằng mã/link; mỗi bên chọn Blue/Red; cả hai bấm sẵn sàng.
2. **Draft** theo `draft_steps`. Mặc định: mỗi bên 3 Ban + 8 Pick (22 bước). Nhân vật chỉ được pick từ **kho của chính người chơi** (cung mệnh/level lấy từ kho). Không pick trùng (trừ khi `allow_duplicate_pick`); BO3: không được pick lại nhân vật đã pick ở ván trước (`_previously_picked_slugs_for_user`).
3. Hết giờ lượt → server tự xử lý (Ban: bỏ lượt; Pick: chọn ngẫu nhiên). Quá `max_overtime_seconds` → xử thua (`forfeit_timeout`). Có thể bật reserve time.
4. **Weapon phase**: điền vũ khí R1–R5 (không lưu trong kho tài khoản); khóa hoặc hết giờ → chuyển sang chấm điểm.
5. **Scoring**: mỗi bên nhập thời gian 3 ải; khi cả hai đã nộp, server tính điểm & xác định thắng (thấp hơn thắng; hòa → theo tie-break).
6. BO3: thắng 2 ván; giữa các ván có `between_games` (chọn bên ván sau, tự đổi bên).

Chi tiết số liệu (milestone, cost mặc định) nằm trong `app/schemas/ruleset.py::default_ruleset_config` và seed ở `app/main.py`. **Không hard-code lại** các con số này trong tài liệu hoặc code mới.

## 5. Người dùng & vai trò

| Role | Làm được |
|---|---|
| Guest | xem Bộ luật, xem trận (khán giả), lưu kho trên trình duyệt |
| Player | + kho nhân vật trên server, tạo/tham gia trận |
| Admin | + CRUD bộ luật |
| Super admin | + đổi role người dùng (`/admin/users`, hoặc CLI `set_role` + `ADMIN_SECRET_KEY`) |

## 6. Dữ liệu game

- `web/src/data/characters.json` (126 mục) và `weapons.json` (219 mục) do `assets/dataminer2.py`, `assets/dataminer_weapons.py` sinh ra khi game có bản cập nhật. **Backend cũng đọc các file này** (xem ARCHITECTURE §6).
- Ảnh: `web/public/character_cards/*.webp`, `web/public/weapons/*.png` theo `slug`.

## 7. Ràng buộc quan trọng

- Giữ nguyên codebase, kiến trúc, tính năng hiện có (yêu cầu của chủ dự án).
- Backend (Python) là **nguồn quyết định** kết quả trận; frontend không được là nơi tin cậy duy nhất.
- Mọi chuỗi hiển thị cho người dùng: tiếng Việt, giọng văn nhất quán với chuỗi sẵn có.

_Cập nhật lần cuối: 2026-11-28 (cập nhật mốc thời gian ải sang 10:00)._
