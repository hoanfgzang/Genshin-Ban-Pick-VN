# DECISION_LOG

Nhật ký quyết định kiến trúc (ADR). Quy tắc:
- Thêm ADR mới ở **cuối** bảng; **không sửa nội dung** ADR cũ — chỉ đổi `Status` thành *Superseded by ADR-xxx*.
- Quyết định Tier 2 (xem `DEVELOPMENT_WORKFLOW.md` §3) phải có ADR **trước hoặc cùng** thay đổi code.
- **Nguồn gốc** ghi rõ: `Inferred` = suy ra từ code/git sẵn có (chưa được chủ dự án xác nhận bằng văn bản); `Decided` = chủ dự án/AI đã chốt có ghi nhận.

## Mẫu ADR

```markdown
### ADR-0xx: Tiêu đề
- Ngày · Status (Proposed | Accepted | Superseded by ADR-yyy | Rejected) · Nguồn gốc (Inferred | Decided)
- **Bối cảnh:** …
- **Quyết định:** …
- **Hệ quả / đánh đổi:** …
- **Bằng chứng / liên kết:** file, commit
```

## Các quyết định hiện có (phục dựng từ codebase)

> [!NOTE]
> Các ADR-001…013 **phục dựng** từ source tại commit `0b4e185` để agent không đảo ngược nhầm. Chủ dự án có thể sửa `Status`/hệ quả khi xác nhận.

### ADR-001: Hai ứng dụng trong một repo, không monorepo tool
- 2026-11-28 · Accepted · Inferred
- **Quyết định:** `app/` (Python) và `web/` (React) độc lập; không `pnpm-workspace`, không `packages/shared`.
- **Hệ quả:** logic dùng chung bị trùng lặp (ADR-011); backend đọc dữ liệu từ `web/src/data` (ADR-012). `docs/BACKEND_PLAN.md` §3 (monorepo) **không được áp dụng**.
- **Bằng chứng:** cấu trúc repo; không có workspace file.

### ADR-002: Backend FastAPI + SQLAlchemy 2.0 async (không phải Node/Fastify)
- 2026-11-28 · Accepted · Inferred · *Thay thế đề xuất trong `docs/BACKEND_PLAN.md` (Node + Fastify + Prisma + Socket.IO)*
- **Hệ quả:** server luật chơi viết bằng Python; không dùng được cùng code TS với frontend.
- **Bằng chứng:** `app/main.py`, `app/requirements.txt`.

### ADR-003: SQLite làm database mặc định
- Accepted · Inferred. `DATABASE_URL` mặc định `sqlite+aiosqlite:///app/data/gbp.db`; có thể đổi URL nhưng chỉ SQLite được kiểm thử (driver khác chưa có trong `requirements.txt`).
- **Hệ quả:** phù hợp 1 process / quy mô nhỏ; PostgreSQL trong kế hoạch cũ **chưa** được áp dụng.

### ADR-004: Tạo schema bằng `create_all`, không migration
- Accepted (hiện trạng) · Inferred. **Rủi ro đã biết** — xem Open-01.
- **Hệ quả:** đổi cột/bảng không áp lên DB đã có; thay đổi `state_json`/`config_json` phải tương thích ngược qua validator Pydantic (tiền lệ `migrate_legacy_*` trong `schemas/ruleset.py`, `services/traveler.py`).

### ADR-005: Realtime bằng WebSocket thuần, server-authoritative, broadcast toàn bộ state
- Accepted · Inferred. Một endpoint `/ws/matches/{code}`; client gửi `{action,...}`; server xác thực lượt, tính toán, lưu rồi gửi `match:state` đầy đủ.
- **Hệ quả:** đơn giản, dễ reconnect (REST tải state + WS); nhưng trạng thái kết nối/timer in-memory ⇒ **chỉ 1 process** (Open-05). Không dùng Socket.IO/Redis như kế hoạch cũ.

### ADR-006: Lưu trận dưới dạng JSON snapshot
- Accepted · Inferred. `matches.state_json` (toàn bộ `MatchState`) + `ruleset_snapshot`; không có bảng riêng cho lượt ban/pick/kết quả.
- **Hệ quả:** replay/thống kê tương lai cần parse JSON hoặc thêm bảng (Tier 2). Sửa luật sau không ảnh hưởng trận cũ.

### ADR-007: Xác thực bằng UID Genshin + mật khẩu, JWT (cookie httpOnly + Bearer)
- Accepted · Inferred. PBKDF2-SHA256 600k vòng tự cài; JWT HS256; WS nhận token qua query/cookie; email tùy chọn; không OAuth.
- **Hệ quả:** không thu hồi token, không rate-limit (Open-09). Super admin xác định bằng `uid == SEED_ADMIN_UID`; có đường mở khóa `X-Admin-Secret`.

### ADR-008: Lớp `services/` ở frontend, mock/http chuyển bằng `VITE_API_MODE`
- Accepted · Inferred. UI/store chỉ gọi interface trong `services/types.ts`. Mock (localStorage) chỉ cho `auth` + `inventory`, phục vụ Khách và test.
- **Hệ quả:** thêm API mới = thêm vào `types.ts` + `http/*`; Khách mode lưu kho cục bộ.

### ADR-009: Triển khai production chưa được định nghĩa
- Accepted (trạng thái) · Inferred. Không Docker/CI/hướng dẫn deploy; backend không phục vụ static của frontend. Xem Open-02.

### ADR-010: Quy đổi Cost → giây phạt bằng hệ số phẳng theo mốc (milestone)
- Accepted · Inferred. Commit `03df2da` "switch cost penalty milestones to flat-rate tier multiplication".
- **Quyết định:** `calc_cost_penalty_seconds` nhân **toàn bộ** tổng Cost với `secondsPerCost` của mốc đang áp dụng (+ `bonusSeconds`), không tính lũy tiến.
- **Hệ quả:** thay đổi công thức phải đồng bộ `domain/cost.ts` + test hai phía.

### ADR-011: Logic domain nhân đôi ở TypeScript và Python; backend là nguồn đúng
- Accepted · Inferred. `cost_engine.py` ↔ `domain/cost.ts`; `split_draft_into_phases` ↔ `splitDraftIntoPhases`.
- **Hệ quả:** mọi thay đổi công thức = sửa 2 nơi + test 2 nơi. Kết quả trận chỉ do server tính.

### ADR-012: Backend đọc dữ liệu game từ `web/src/data/*.json`
- Accepted · Inferred. `app/core/config.py::WEB_DATA_DIR`, `app/data_loader.py`; dataminer ghi trực tiếp vào đó.
- **Hệ quả:** không di chuyển/đổi định dạng các file này nếu không sửa backend + test.

### ADR-013: Chuỗi giao diện tiếng Việt viết cứng, không i18n
- Accepted · Inferred. Thông báo lỗi `AppError.message` hiển thị trực tiếp tới người dùng.
- **Hệ quả:** giữ tiếng Việt; i18n sẽ là thay đổi lớn (Tier 2).

### ADR-014: Thiết lập hệ thống `.ai/` và quy trình Tier 0/1/2
- 2026-11-28 · Accepted · Decided (theo yêu cầu của chủ dự án)
- **Bối cảnh:** nhiều phiên/agent làm việc trên codebase đã trưởng thành; cần ngữ cảnh chung, hạn chế quyết định kiến trúc tùy tiện.
- **Quyết định:** tạo `.ai/` (README, PROJECT_CONTEXT, ARCHITECTURE, CODING_STANDARDS, DEVELOPMENT_WORKFLOW, DECISION_LOG, TASK_TEMPLATE), `AGENTS.md` ở gốc, và `docs/PROJECT_ANALYSIS.md`. **Không** sửa code ứng dụng, không sửa `docs/ROADMAP.md`/`BACKEND_PLAN.md`/`README.md` trong lần thiết lập này.
- **Hệ quả:** tài liệu phải được giữ đồng bộ theo `DEVELOPMENT_WORKFLOW.md` §7.

### ADR-015: Đổi mốc thời gian cơ sở mỗi phòng (ải) từ 09:00 (540s) sang 10:00 (600s)
- 2026-11-28 · Accepted · Decided (chủ dự án yêu cầu và duyệt kế hoạch Tier 2)
- **Bối cảnh:** luật thi đấu cập nhật mốc tính thời gian mỗi phòng từ 9 phút sang 10 phút (`10:00 − thời gian nhập`).
- **Quyết định:** đổi `CHAMBER_BASE_SECONDS` từ `540` sang `600` ở cả backend (`app/services/cost_engine.py`, `app/schemas/match.py`, `app/schemas/ruleset.py`) và frontend (`web/src/domain/cost.ts`, `web/src/domain/ruleset.ts`, `MatchScoringPhase.tsx`); thêm bước tự migrate `chamberBaseSeconds: 540 → 600` trong `RuleSetConfig.migrate_legacy_timer_fields` để tương thích ngược với dữ liệu đã lưu trong DB.
- **Hệ quả / đánh đổi:** cho phép nhập thời gian phòng từ `00:00` đến `10:00`; các trận cũ đã lưu sẵn `chamberDiffs`/`finalScore` trong `state_json` không bị ảnh hưởng.
- **Bằng chứng / liên kết:** `app/services/cost_engine.py`, `app/schemas/match.py`, `app/schemas/ruleset.py`, `web/src/domain/cost.ts`, `web/src/features/match/MatchScoringPhase.tsx`

## Câu hỏi còn mở (chờ chủ dự án quyết định — **agent không tự quyết**)

| ID | Câu hỏi | Vì sao quan trọng | Đề xuất tham khảo (chưa áp dụng) |
|---|---|---|---|
| Open-01 | Có đưa migration (vd. Alembic) vào không? | Mọi thay đổi schema đang không áp được lên DB có sẵn | Thêm Alembic khi có thay đổi schema tiếp theo |
| Open-02 | Mục tiêu triển khai production (host, DB, 1 hay nhiều worker, reverse proxy, HTTPS)? | Quyết định `COOKIE_SECURE`, CORS, DB engine, scale | Chốt trước khi mở cho người ngoài |
| Open-03 | Xử lý `docs/ROADMAP.md` & `docs/BACKEND_PLAN.md` đã lỗi thời: viết lại / chuyển vào `docs/archive/` / thêm banner "superseded"? | Agent đọc nhầm sẽ làm theo kế hoạch Node/Postgres không còn hiệu lực | Thêm banner superseded + trỏ tới `.ai/ARCHITECTURE.md`; viết ROADMAP mới theo hiện trạng |
| Open-04 | **Xác nhận hướng điểm:** code & README quy định *tổng điểm thấp hơn thắng*, trong đó điểm ải = `09:00 − thời gian nhập` (nhanh hơn ⇒ điểm ải **cao hơn**). Đây có phải ý đồ luật chơi không? | Nếu ngược ý đồ, ảnh hưởng toàn bộ kết quả trận | Chỉ xác nhận; test hiện hành đang khẳng định hành vi này (`_resolve_game_winner`, `_compute_final_score`) |
| Open-05 | Có cần chạy nhiều worker/instance? | State/timer in-memory sẽ hỏng | Giữ 1 worker; nếu cần scale → thiết kế lại room manager (Tier 2) |
| Open-06 | Thêm CI (GitHub Actions: pytest + pnpm lint/typecheck/test/build)? | Hiện không có kiểm tra tự động | Workflow tối giản chạy 4 lệnh baseline |
| Open-07 | Ưu tiên lộ trình tính năng cộng đồng (hồ sơ công khai, thống kê thắng/thua, lịch sử trận, giải đấu…) | Quyết định schema/API mới (dữ liệu hiện nằm trong `state_json`) | Bắt đầu từ lịch sử trận + thống kê, cần ADR về bảng chuẩn hóa |
| Open-08 | Chính sách line ending (LF/CRLF) & thêm `.editorconfig`/`.gitattributes`? | Diff nhiễu, merge conflict | `.gitattributes` `* text=auto`; chỉ thêm khi được duyệt |
| Open-09 | Củng cố bảo mật: guard "production" cho secret mặc định, rate-limit, thu hồi token, bỏ token khỏi query WS, không trả `{exc}` thô | Rủi ro khi mở công khai | Xử lý theo từng task riêng, mỗi cái một ADR |
| Open-10 | Ghim phiên bản Python/Node (venv đang 3.14; README nói 3.11+) | Tái lập môi trường | Thêm `.python-version`/`engines` khi duyệt |

_Cập nhật lần cuối: 2026-11-28 (thêm ADR-015 mốc 10:00 mỗi phòng)._
