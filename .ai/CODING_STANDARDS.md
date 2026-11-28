# CODING_STANDARDS

Quy ước **rút ra từ code hiện có** (không phải áp đặt mới). Khi sửa code: **bắt chước file lân cận**. Nếu quy ước ở đây mâu thuẫn với file lân cận, hỏi thay vì tự chọn.

## 1. Nguyên tắc chung

- Thay đổi nhỏ nhất đáp ứng yêu cầu; giữ nguyên style, thứ tự import, line ending của file đang sửa.
- Không thêm dependency, không đổi cấu hình build/lint/tsconfig nếu task không yêu cầu (Tier 2).
- Không để lại code chết, `console.log`/`print` gỡ lỗi, comment `TODO` không có chủ.
- Comment giải thích **vì sao**, không lặp lại **cái gì**. Comment hiện có phần lớn bằng tiếng Việt; tiếng nào cũng được, nhưng giữ nhất quán trong file.
- Tên định danh (biến, hàm, file, commit): **tiếng Anh**. Chuỗi hiển thị cho người dùng: **tiếng Việt**.

## 2. Python (`app/`)

| Chủ đề | Quy ước quan sát được |
|---|---|
| Đầu file | Luôn `from __future__ import annotations` |
| Kiểu | Type hint đầy đủ; kiểu hiện đại `str | None`, `list[str]`, `dict[str, X]` |
| Đặt tên | `snake_case` hàm/biến/module; `PascalCase` class; hằng `UPPER_SNAKE` |
| Schema | Kế thừa `CamelModel` (alias camelCase). Trong Python dùng `snake_case`; JSON ra/vào là camelCase. Trả về `model_dump(by_alias=True)` |
| Lỗi nghiệp vụ | Dùng helper `bad_request/not_found/conflict/forbidden/unauthorized` trong `core/errors.py` với `code` **UPPER_SNAKE** + `message` tiếng Việt. Không `raise HTTPException` trực tiếp |
| Router | Mỏng: validate → gọi service/ORM → trả schema. Dùng `Depends(get_db / get_current_user / require_admin)` |
| Engine | `draft_engine` là hàm **thuần**: `state.model_copy(deep=True)` rồi sửa bản copy, trả về state mới; không I/O, không `await` |
| Async | SQLAlchemy 2.0 async (`select`, `AsyncSession`); không dùng API sync |
| DB | Thêm bảng/cột = Tier 2 (không có migration). `Mapped[...]` + `mapped_column` |
| Cấu hình | Qua `get_settings()`; không đọc `os.environ` rải rác; biến mới → thêm vào `Settings` **và** `.env.example` |
| Bảo mật | Không log mật khẩu/token/secret; so sánh secret bằng `hmac.compare_digest`; không tin role trong JWT |
| Import | Quan hệ tương đối trong package (`from ..core.errors import ...`) |
| Test | `app/tests/test_*.py`, dùng fixture `test_client` (SQLite tạm). Thêm test cạnh test cùng chủ đề |

## 3. TypeScript / React (`web/src/`)

| Chủ đề | Quy ước quan sát được |
|---|---|
| Import alias | `@/…` cho mọi import xuyên thư mục; tương đối (`./`) trong cùng thư mục |
| Type import | `import type { … }` hoặc `type X` inline (**`verbatimModuleSyntax` bật**) |
| TS flags | `erasableSyntaxOnly` → **cấm `enum`, `namespace`, parameter properties**; `noUnusedLocals/Parameters` bật. Dùng union literal thay enum |
| Component | Function component, **named export** (`export function X`); 1 component chính / file; file `PascalCase.tsx` |
| Hook / store | `useX`; zustand store theo mẫu `create<State>()((set, get) => ({...}))` trong `features/*/…Store.ts` |
| Style | Tailwind v4 utility; gộp class bằng `cn()` (`@/lib/cn`); component nền ở `components/ui` (Radix cho Dialog/Tabs/Tooltip) |
| Form | `react-hook-form` + `zod` (`@hookform/resolvers`); schema ở `features/*/schemas.ts` |
| Gọi API | **Chỉ** qua `@/services` (interface trong `types.ts`, hiện thực `http/*`). Không `fetch` trong component/store |
| Lỗi hiển thị | `ServiceError(code, message)`; dùng `errorMessage(err)` / `toast.*` |
| Domain | `web/src/domain` thuần TS: **không** import React, DOM, `services`, `features` |
| React Compiler | Bật qua Babel; ESLint `react-hooks` (flat recommended) sẽ báo vi phạm — không tắt rule để lách; không `useMemo/useCallback` thừa chỉ để "tối ưu" nếu code lân cận không làm vậy |
| Kiểu DTO | Thêm/đổi field phải đồng bộ `services/types.ts` ↔ `app/schemas/*.py` |
| Test | Vitest + Testing Library; file `*.test.ts(x)` **đặt cạnh** file được test; `src/test/setup.ts` tự dọn DOM và storage |

## 4. Hợp đồng & tương thích ngược

- Dữ liệu đã lưu (DB `state_json`/`config_json`, `localStorage` của kho Khách) có thể ở **phiên bản cũ**. Field mới phải có **giá trị mặc định**; đổi tên field phải có migration trong validator (`model_validator(mode="before")`) như `migrate_legacy_*` hiện có.
- Không đổi tên/xóa endpoint, action WS, field JSON đang được phía kia dùng nếu chưa sửa cả hai phía trong cùng thay đổi.
- Giữ nguyên giá trị mặc định luật chơi (`default_ruleset_config`, cost mặc định) trừ khi task nói rõ.

## 5. Kiểm thử

| Khi sửa | Tối thiểu phải chạy |
|---|---|
| `app/services/*`, `schemas/match.py`, `room_manager` | toàn bộ `pytest app/tests -q` (đặc biệt `test_match_flow_ws`, `test_bo3_and_tiebreak`, `test_cost_and_scoring`) |
| `app/routers/*`, `core/*` | `pytest app/tests -q` |
| `web/src/domain/*`, `features/*/*.ts` | `pnpm test -- --run` + `pnpm typecheck` |
| Component/trang | `pnpm test -- --run`, `pnpm lint`, `pnpm typecheck`; nếu đổi UI đáng kể: chạy `pnpm dev` + backend và kiểm tra bằng trình duyệt |
| Cả hai phía (đổi hợp đồng) | tất cả lệnh ở trên |

- Bug fix: viết/điều chỉnh test tái hiện lỗi trước khi sửa khi khả thi.
- Logic cost/điểm **trùng ở 2 nơi** (`cost_engine.py` ↔ `domain/cost.ts`): sửa một nơi thì kiểm tra nơi còn lại.
- Không xóa/sửa test cho "pass" — chỉ đổi khi hành vi đúng đã thay đổi theo yêu cầu, và nêu rõ trong báo cáo.

## 6. Môi trường Windows / PowerShell

- `python` **không** có trong PATH: dùng `.\app\.venv\Scripts\python.exe`.
- PowerShell mặc định không in UTF-8: tiếng Việt trong `Get-Content`/output hiện thành mojibake (`Ä‘…`). **Đó là lỗi hiển thị, file vẫn đúng.** Đọc file bằng công cụ đọc file (UTF-8), hoặc đặt `[Console]::OutputEncoding=[Text.Encoding]::UTF8`.
- Ghi file: **UTF-8 (không BOM)**. Không dùng `Set-Content` mặc định (Windows PowerShell 5 ghi ANSI/UTF-16 → hỏng tiếng Việt).
- Line ending: repo trộn LF/CRLF (vd `cost_engine.py` CRLF). **Giữ nguyên** line ending của file khi sửa; không chuyển đổi hàng loạt.
- Lệnh pnpm in dòng `$ tsc -b` ra stderr → PowerShell có thể báo `NativeCommandError` dù lệnh thành công; kiểm tra `$LASTEXITCODE`.

## 7. Git & commit

- Conventional Commits, tiếng Anh: `feat(match): …`, `fix(rules): …`, `docs: …`, `test: …`, `refactor: …`, `chore: …`.
- Một commit = một thay đổi logic. Không commit `app/.env`, `app/data/*.db`, `app/.venv`, `web/node_modules`, `web/dist`.
- **Không commit/push/tạo nhánh/rewrite history trừ khi developer yêu cầu.**

## 8. Điều không làm

- Không đổi framework, state manager, router, ORM, DB engine, cơ chế auth.
- Không thêm `any` / `# type: ignore` / `eslint-disable` để vượt qua kiểm tra (nếu bắt buộc, giải thích bằng comment + nêu trong báo cáo).
- Không "dọn dẹp" file ngoài phạm vi (format lại, sort import, đổi tên).
- Không xóa/ghi đè `docs/ROADMAP.md`, `docs/BACKEND_PLAN.md` khi chưa được duyệt (xem `DECISION_LOG.md` Open-03).

_Cập nhật lần cuối: 2026-11-28 (thiết lập ban đầu)._
