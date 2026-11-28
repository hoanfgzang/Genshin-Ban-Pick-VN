# PROJECT_ANALYSIS — Genshin Ban/Pick VN

> Báo cáo phân tích codebase thực tế. Ngày phân tích: 2026-11-28 · commit `0b4e185` (nhánh `main`, 19 commit).
> Chỉ ghi những gì **đã xác minh trong source**. Mục nào là suy luận được đánh dấu rõ `(suy luận)`.
> Khi code thay đổi đáng kể, cập nhật file này **và** `.ai/` (xem `.ai/DEVELOPMENT_WORKFLOW.md` §7).

## 1. Tóm tắt điều hành

- Hệ thống hiện tại là **ứng dụng thi đấu Ban/Pick 1v1 realtime** cho Genshin Impact, không phải nền tảng cộng đồng đầy đủ. Các hạng mục "kết nối cộng đồng", "tỷ lệ thắng/thành tích", "hồ sơ người dùng công khai" **chưa tồn tại** trong code (xem §12).
- Kiến trúc: **FastAPI (Python) + SQLite + WebSocket thuần** ở backend; **React 19 + Vite + TypeScript + Tailwind v4 + zustand** ở frontend. Hai phần nằm cùng repo (`app/`, `web/`), không có monorepo tool.
- Chất lượng baseline: pytest **33 passed**, vitest **68 passed (15 file)**, `tsc -b` OK, `eslint .` OK (đo ngày phân tích).
- Rủi ro lớn nhất: logic nghiệp vụ tập trung trong `draft_engine.py` (1521 dòng) + `room_manager.py` (626 dòng), phụ thuộc tiến trình đơn (in-memory), không có migration DB, không có CI, và **tài liệu `docs/` đã lỗi thời** so với code (xem §11).

## 2. Cấu trúc repository

```text
Genshin-Ban-Pick-VN/
├── app/                  # Backend FastAPI (package Python `app`, chạy: uvicorn app.main:app)
│   ├── main.py           # create_app(), lifespan (create_all + seed), CORS, error handlers, include routers
│   ├── core/             # config.py, database.py, deps.py (auth deps), errors.py (AppError), security.py (JWT, PBKDF2)
│   ├── models/           # SQLAlchemy 2.0: User, UserCharacter, RuleSet, Match
│   ├── schemas/          # Pydantic v2 (CamelModel -> JSON camelCase): auth, inventory, ruleset, match, admin_users
│   ├── routers/          # auth, catalog, inventory, rulesets, matches, admin_users, ws_match
│   ├── services/         # draft_engine (state machine), room_manager (WS + timers + persist), cost_engine, traveler
│   ├── scripts/set_role.py   # CLI đổi role qua API từ xa
│   ├── data_loader.py    # đọc web/src/data/{characters,weapons}.json (lru_cache)
│   ├── tests/            # pytest (33 test)
│   ├── requirements.txt, .env.example
│   └── .venv/, data/gbp.db   # KHÔNG track (gitignore)
├── web/                  # Frontend React SPA (pnpm)
│   ├── src/
│   │   ├── main.tsx, router.tsx
│   │   ├── pages/        # Home, Login(+Register), Profile, Rules, Lobby, Match, AdminUsers, NotFound
│   │   ├── features/     # auth, inventory, match, rules (UI + store + logic theo tính năng)
│   │   ├── components/   # layout/ (AppShell, UserMenu), ui/ (Button, Dialog, Chip, ...)
│   │   ├── domain/       # TS thuần: types + cost, inventory, ruleset, traveler, characters, weapons
│   │   ├── services/     # types.ts (interface) + http/* (thật) + mock/* (localStorage)
│   │   ├── data/         # characters.json (126), weapons.json (219) — sinh bởi dataminer
│   │   ├── config/brand.ts, lib/ (cn, storage), styles/index.css, test/setup.ts
│   └── public/           # character_cards/*.webp, weapons/*.png (ảnh tĩnh)
├── assets/               # dataminer2.py, dataminer_weapons.py (cập nhật dữ liệu game); ảnh nguồn bị gitignore
├── docs/                 # BACKEND_PLAN.md, ROADMAP.md (LỖI THỜI — §11), PROJECT_ANALYSIS.md (file này)
├── script.txt            # snippet JS chạy trong console trình duyệt để scrape danh sách nhân vật (công cụ phụ)
├── README.md, LICENSE, .gitignore
```

Không có: `.github/` (CI), Dockerfile/compose, `.editorconfig`, `.gitattributes`, thư mục `server/` hay `packages/shared/` (nhắc trong tài liệu cũ nhưng không tồn tại).

## 3. Công nghệ & công cụ

| Lớp | Chi tiết (xác minh từ file cấu hình) |
|---|---|
| Backend | Python (venv hiện dùng 3.14; README ghi 3.11+), FastAPI ≥0.115, uvicorn[standard], SQLAlchemy 2.0 async + aiosqlite, Pydantic v2 + pydantic-settings, PyJWT, httpx, pytest + pytest-asyncio |
| Database | SQLite file `app/data/gbp.db` (mặc định, cấu hình `DATABASE_URL`). **Không dùng Alembic/migration**: bảng tạo bằng `Base.metadata.create_all` khi startup |
| Frontend | React 19, react-router 8 (`createBrowserRouter`), zustand 5, react-hook-form + zod 4, Radix UI (dialog, tabs, tooltip), Tailwind CSS 4 (`@tailwindcss/vite`), clsx + tailwind-merge |
| Build/tool | Vite 8, TypeScript ~6.0 (strict-ish, `erasableSyntaxOnly`, `verbatimModuleSyntax`), React Compiler (babel preset), ESLint 10 flat config (+ react-hooks, react-refresh), Vitest 5 + Testing Library + jsdom |
| Package manager | **pnpm** (web, `pnpm-lock.yaml`); **pip + venv** (app) |
| Alias | `@/*` → `web/src/*` (tsconfig + vite) |

## 4. Kiến trúc backend

**Phân lớp thực tế:** `routers/` (HTTP/WS, mỏng) → `services/` (nghiệp vụ) → `models/` (ORM) ; `schemas/` là hợp đồng dữ liệu (Pydantic, alias camelCase qua `CamelModel`).

- `main.py::create_app(db_engine, session_factory)` cho phép tiêm engine (tests dùng SQLite tạm trong `tmp_path`). Lifespan: bind session factory cho `room_manager` → `create_all` → `seed_initial_data` (admin gốc + 1 ruleset mặc định) → khi tắt: `room_manager.cancel_all_timers()`.
- Lỗi: `AppError(HTTPException)` với `code` + `message` (tiếng Việt) → JSON `{code, message}`. `RequestValidationError` được chuẩn hóa thành `VALIDATION_ERROR` (HTTP 422).
- **REST API** (xác minh từ router):

| Method | Path | Quyền |
|---|---|---|
| GET | `/api/health` | public |
| GET | `/api/auth/config` · POST `/api/auth/register` · `/login` · `/logout` · GET `/api/auth/me` | public / user |
| GET | `/api/characters` · `/api/weapons` | public |
| GET / PUT | `/api/me/inventory` | user (PUT ghi đè toàn bộ kho) |
| GET | `/api/rulesets` (`?activeOnly=`) · `/api/rulesets/{id}` | public |
| POST / PUT / DELETE | `/api/rulesets[/{id}]` | admin |
| POST | `/api/matches` (tạo phòng, `format: bo1|bo3`) | user |
| GET | `/api/matches/{code}` | public (xem/khán giả) |
| GET | `/api/me/matches` (20 trận gần nhất) | user |
| GET / PATCH / POST | `/api/admin/users`, `/{id}/role`, `/by-uid` | super admin hoặc `X-Admin-Secret` |
| WS | `/ws/matches/{code}` | khách chỉ xem; thao tác cần token |

- **Realtime:** một WebSocket cho mỗi phòng. Server → client: `match:state` (toàn bộ state, kèm `notice` tùy chọn), `match:error`, `pong`. Client → server: JSON `{action: ...}`. Các action (xem `RoomManager.handle_action`): `select_side`, `refresh_inventory`, `set_ready`, `choose_next_side`, `draft_hover`, `draft_pick_or_ban`, `undo_draft_step`, `request_undo`, `respond_undo`, `cancel_undo_request`, `set_weapon`, `set_character_custom_cost`, `reorder_lineup`, `lock_weapons`, `submit_scores`, và `ping`.
- **State machine trận** (`MatchState.status`): `lobby → drafting → weapon_phase → scoring → (between_games →) finished`. Toàn bộ logic chuyển trạng thái nằm trong `services/draft_engine.py` (hàm thuần: nhận `MatchState`, trả `MatchState` mới). `room_manager.py` bọc ngoài: khóa `asyncio.Lock` theo phòng, hẹn giờ (weapon-phase timeout, draft forfeit), lưu DB, broadcast.
- **Lưu trữ trận:** bảng `matches` giữ `state_json` (toàn bộ `MatchState` dạng JSON) + `ruleset_snapshot` (đóng băng luật tại thời điểm tạo). Không có bảng chuẩn hóa cho từng lượt ban/pick/kết quả.
- **Cost/điểm** (`services/cost_engine.py`): cost nhân vật theo C0–C6, cost vũ khí, giây cộng thêm theo tinh luyện R1–R5, quy đổi cost → giây phạt qua `milestones` (nhân phẳng theo mốc), điểm ải = 540s − thời gian nhập (3 ải). **Bên có tổng điểm thấp hơn thắng** (xem `_resolve_game_winner` + `tie_break_rule`).
- **Traveler (Nhà Lữ Hành):** xử lý đặc biệt trong `services/traveler.py` — kho lưu `traveler-boy|girl`, khi pick phải chọn nguyên tố (slug `traveler-<element>`); có migration dữ liệu cũ (`migrate_legacy_traveler_cost_dict`, `normalize_traveler_inventory_dict`).

## 5. Authentication & Authorization

- Đăng ký/đăng nhập bằng **UID Genshin (9–10 chữ số) + mật khẩu (8–72 ký tự)**; email tùy chọn (`REQUIRE_EMAIL`).
- Mật khẩu: **PBKDF2-SHA256, 600.000 vòng** (tự cài trong `core/security.py`, không dùng thư viện bcrypt/argon2).
- Phiên: **JWT HS256** (`sub`, `role`, `iat`, `exp`; 12 giờ hoặc 14 ngày nếu "ghi nhớ"). Nhận token từ `Authorization: Bearer` **hoặc** cookie httpOnly `gbp_token` (SameSite=Lax). WebSocket nhận token qua **query `?token=`** hoặc cookie.
- Frontend lưu token ở `localStorage` (remember) hoặc `sessionStorage`, gửi bằng Bearer + `credentials: 'include'`.
- Role: `player` | `admin` (DB) và `guest` (chỉ phía frontend, không có bản ghi DB). **Super admin** = admin có `uid == SEED_ADMIN_UID`. `require_admin` đọc role **từ DB** (không tin role trong JWT).
- Cơ chế "mở khóa từ xa" bằng header `X-Admin-Secret` so với `ADMIN_SECRET_KEY` (`hmac.compare_digest`).

## 6. Frontend

- **Routing** (`router.tsx`): `/login`, `/register` (ngoài shell); trong `AppShell`: `/` , `/rules`, `/lobby`, `/match/:code`, `/admin/users`, `/profile` (bọc `ProtectedRoute`), `*` → 404.
- **State:** zustand — `authStore`, `inventoryStore`; trạng thái trận lấy từ hook `useMatchSocket` (WebSocket + tự reconnect 1,5s + ping 25s), không qua store.
- **Lớp services:** `services/types.ts` định nghĩa interface + toàn bộ kiểu DTO trận; `services/index.ts` chọn `http/*` hoặc `mock/*`. `VITE_API_MODE=mock` **chỉ** áp dụng cho `auth` và `inventory`; `ruleset`, `match`, `adminUser` luôn gọi HTTP thật.
- **Domain TS thuần** (`web/src/domain`): tính cost, lọc inventory, traveler, ruleset (kèm `splitDraftIntoPhases`) — **trùng lặp có chủ đích với backend** (backend là nguồn đúng cho kết quả trận; frontend dùng để hiển thị/preview).
- **UI:** Tailwind v4 + `cn()`; component nền tảng ở `components/ui/`. Giao diện trận (`features/match/`) là phần phức tạp nhất: `DualRosterGrid` (790 dòng), `MatchScoreboardHeader` (785), `DraftSlotsBoard` (694), `MatchScoringPhase` (543).
- **Proxy dev:** Vite proxy `/api` và `/ws` → `127.0.0.1:8000`. Không có biến môi trường frontend nào khác được dùng ngoài `VITE_API_MODE`.

## 7. Cấu hình môi trường

`app/.env` (không track; mẫu `app/.env.example`): `DATABASE_URL`, `JWT_SECRET`, `REQUIRE_EMAIL`, `SEED_ADMIN_UID/PASSWORD/NAME`, `ADMIN_SECRET_KEY`, `CORS_ORIGINS`. Ngoài ra `Settings` còn có `JWT_ALGORITHM`, `JWT_EXPIRE_HOURS_*`, `COOKIE_NAME`, `COOKIE_SECURE` (không có trong `.env.example`).

## 8. Build, chạy, triển khai

- Dev: `uvicorn app.main:app --reload --port 8000` + `pnpm dev` (5173). Lệnh chi tiết trong README.
- Build frontend: `pnpm build` (`tsc -b && vite build`) → `web/dist`.
- **Quy trình deploy: chưa có** trong repo (không Dockerfile, không workflow, không hướng dẫn production). Backend **không** phục vụ file tĩnh của frontend. README chỉ đề cập "deploy lên server" ở mức đổi biến môi trường.

## 9. Kiểm thử

| Phạm vi | Công cụ | Hiện trạng |
|---|---|---|
| Backend | pytest (`app/tests/`), `TestClient` + SQLite tạm | 33 test: auth/roles, BO3 + tie-break, cost & scoring, luồng trận qua WS (14), set_role script, traveler |
| Frontend | Vitest + Testing Library (jsdom) | 68 test / 15 file: domain (cost, inventory, traveler, characters), lọc inventory, schemas auth, lineup/series, costCsv, mock services, một số component (AppShell, DraftSlotsBoard, DualRosterGrid, MatchScoringPhase) |
| E2E | — | **Không có** |
| CI | — | **Không có** |

Chưa có test cho: router HTTP của `rulesets` (ngoài vài case trong auth/roles), `inventory` router, `admin_users` chi tiết, các trang (`pages/`), `useMatchSocket`.

## 10. Git workflow

- Remote: `origin` = `github.com/giang1132006/Genshin-Ban-Pick-VN`. Một tác giả, 19 commit, nhánh duy nhất `main` (commit thẳng, có 1 merge).
- Quy ước commit quan sát được: **Conventional Commits** (`feat:`, `feat(match):`), mô tả tiếng Anh.
- Không có hook, template PR, hay tài liệu đóng góp.

## 11. Tài liệu hiện có — độ lệch so với code

| File | Vấn đề |
|---|---|
| `docs/BACKEND_PLAN.md` | Đề xuất **Node.js/Fastify + Socket.IO + PostgreSQL/Prisma + Redis + monorepo pnpm**. Thực tế đã triển khai **FastAPI + SQLite + WebSocket thuần**, không monorepo. Tài liệu ghi "chưa triển khai" nhưng backend đã tồn tại → **đã bị thay thế, chưa được đánh dấu** |
| `docs/ROADMAP.md` | GĐ2–GĐ5 ghi "⏳ Kế hoạch" nhưng bộ luật, trận realtime, backend/auth đã hoàn thành. Liệt kê route không tồn tại (`/draft/local`, `/u/:username`, `/history`, `/match/:code/overlay`). Mô tả "2 mục traveler" và "tính điểm theo cung mệnh/level" khác cơ chế cost hiện tại |
| `README.md` | **Chính xác và còn mới** — nguồn tin cậy cho mô tả tính năng và lệnh chạy |
| `web/README.md` | Là README mặc định của template Vite, không chứa thông tin dự án |

Các file này **không bị sửa** trong lần thiết lập này; quyết định xử lý được ghi ở `.ai/DECISION_LOG.md` (mục Open).

## 12. Tính năng — đã làm / đang làm / chưa có

**Đã hoàn thành (có code + test):**
- Đăng ký/đăng nhập UID, chế độ Khách, phân quyền Player/Admin/Super admin, trang quản lý tài khoản.
- Kho nhân vật cá nhân (C0–C6, Lv 90/95/100), import/export JSON, hướng dẫn import HoYoLAB.
- Bộ luật & cost: CRUD (admin), thứ tự ban/pick tùy biến, bảng cost nhân vật/vũ khí, custom cost có điều kiện, mốc quy đổi giây, import/export CSV, sao chép bộ luật.
- Trận 1v1 realtime: phòng + mã mời, chọn bên, ban/pick theo phase, timer từng lượt + reserve time + overtime/forfeit, undo có xác nhận, chọn vũ khí, sắp xếp lineup, nhập thời gian 3 ải, BO1/BO3 + tie-break, chọn nguyên tố Traveler, người xem (khách).
- Danh sách "Các trận đấu gần đây của bạn" (20 trận gần nhất, `/api/me/matches`) hiển thị trong `LobbyPage`. Chưa có trang lịch sử/replay riêng.

**Đang phát triển (theo lịch sử commit gần nhất):** tinh chỉnh bảng draft/Match UI (căn hàng Ban/Pick, highlight lượt, edge cost panel), hỗ trợ Traveler element.

**Chưa tồn tại** (chớ giả định có): hồ sơ công khai/xem kho người khác, thống kê tỷ lệ thắng & thành tích tổng hợp, giải đấu/bracket, overlay stream, OAuth/Discord, email xác thực, đổi mật khẩu/quên mật khẩu, bạn bè/kết nối cộng đồng, i18n, trang lịch sử/replay trận riêng.

## 13. Technical debt & điểm nguy cơ

Xếp theo mức ảnh hưởng.

| # | Rủi ro | Bằng chứng | Hệ quả khi sửa code |
|---|---|---|---|
| 1 | **File lớn, nhiều trách nhiệm** | `draft_engine.py` 1521 dòng, `room_manager.handle_action` ~290 dòng if/elif | Sửa một luật dễ làm lệch luật khác; bắt buộc chạy `test_match_flow_ws.py`, `test_bo3_and_tiebreak.py` |
| 2 | **Không có migration DB** | `create_all` trong lifespan; không Alembic | Đổi cột/bảng không áp dụng lên DB đã có (`gbp.db`); đổi shape `state_json`/`config_json` phải tương thích ngược bằng validator (đã có tiền lệ: `migrate_legacy_*`) |
| 3 | **Trạng thái trận in-memory theo tiến trình** | `RoomManager._connections/_locks/timers` | Chỉ chạy đúng với **1 worker** uvicorn; scale ngang sẽ hỏng broadcast/timer |
| 4 | **Cặp logic TS ↔ Python trùng lặp** | `web/src/domain/cost.ts` ↔ `services/cost_engine.py`; `splitDraftIntoPhases` ↔ `split_draft_into_phases` | Đổi công thức ở một phía phải đổi phía kia + test cả hai |
| 5 | **Backend đọc dữ liệu từ thư mục frontend** | `config.py: WEB_DATA_DIR`; `data_loader.py` | Đổi vị trí/format `web/src/data/*.json` làm hỏng backend và test |
| 6 | **Mặc định bảo mật yếu nếu quên cấu hình** | `JWT_SECRET`, `SEED_ADMIN_PASSWORD=admin12345`, `COOKIE_SECURE=False` mặc định trong `config.py` | Không có kiểm tra "production mode"; mật khẩu admin mặc định công khai trong README |
| 7 | **Token trong query string WS** | `ws_match._resolve_ws_user`, `matchService.getWebSocketUrl` | Token có thể lọt vào log proxy; giữ nguyên trừ khi có quyết định mới |
| 8 | **Không rate-limit đăng nhập/WS** | không có middleware | — |
| 9 | **Rò rỉ chi tiết lỗi** | `ws_match.py`: `f"Không thể xử lý thao tác: {exc}"` | Thông báo exception thô gửi tới client |
| 10 | **Truy cập thành viên private** | `ws_match.py` dùng `room_manager._session_factory` | Đổi tên/thuộc tính này làm hỏng WS |
| 11 | **JWT không thu hồi được** | không có bảng session/blacklist; logout chỉ xóa cookie | Token cũ còn hiệu lực đến khi hết hạn |
| 12 | **Hiệu năng ghi** | `PUT /api/me/inventory` xóa rồi chèn lại toàn bộ; mỗi action ghi lại cả `state_json` | Ổn ở quy mô hiện tại; lưu ý nếu tăng tải |
| 13 | **Thiếu CI / test e2e / test cho nhiều router & page** | §9 | Hồi quy chỉ được phát hiện khi chạy tay |
| 14 | **Nhất quán tệp** | Trộn LF/CRLF (vd `cost_engine.py` dùng CRLF); không có `.editorconfig`/`.gitattributes` | Diff nhiễu nếu editor đổi line ending |
| 15 | **Thông điệp người dùng viết cứng tiếng Việt** | rải trong code backend & frontend; không i18n | Đổi/ dịch phải sửa nhiều nơi; bắt buộc giữ tiếng Việt cho UI |
| 16 | **Hiển thị tiếng Việt trong PowerShell** | console mặc định không UTF-8 → mojibake khi `Get-Content` | Dùng công cụ đọc file (UTF-8) hoặc đặt `[Console]::OutputEncoding`; **không** "sửa" chuỗi tiếng Việt nhìn bị lỗi trong terminal |
| 17 | **Hướng tính điểm cần xác nhận ý đồ** | `_compute_final_score` cộng `chamber_total_seconds` = Σ(540 − thời gian nhập); `_resolve_game_winner` cho bên điểm **thấp hơn** thắng ⇒ clear ải nhanh hơn làm điểm tăng | README mô tả đúng như code; chưa xác nhận đây là ý đồ luật chơi → `.ai/DECISION_LOG.md` Open-04. **Không tự đổi** |

## 14. Điểm vào quan trọng cho người/AI mới

1. Hiểu sản phẩm: `README.md` → `.ai/PROJECT_CONTEXT.md`.
2. Hiểu luồng trận: `app/schemas/match.py` → `app/services/draft_engine.py` (`apply_draft_action`, `submit_chamber_times`) → `app/services/room_manager.py::handle_action` → `web/src/features/match/useMatchSocket.ts` → `web/src/pages/MatchPage.tsx`.
3. Hiểu luật & cost: `app/schemas/ruleset.py` → `app/services/cost_engine.py` → `web/src/domain/cost.ts` + `features/rules/`.
4. Hợp đồng frontend ↔ backend: `web/src/services/types.ts` ↔ `app/schemas/*.py`.
