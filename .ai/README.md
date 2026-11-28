# .ai/ — Hệ thống làm việc AI ↔ Developer

Thư mục này là **nguồn sự thật chung** cho mọi AI Agent (và developer) làm việc trong repo **Genshin Ban/Pick VN**. Nó mô tả dự án *đúng như code hiện tại*, quy trình làm việc, và các quyết định đã chốt.

> [!IMPORTANT]
> Đây là **dự án đang chạy**, đã hoàn thành một giai đoạn. **Không** viết lại kiến trúc, đổi framework hay xóa tính năng nếu chưa có chấp thuận của developer (xem `DEVELOPMENT_WORKFLOW.md` §3).

## Thứ tự đọc (mỗi phiên làm việc mới)

| Bước | File | Thời gian | Khi nào |
|---|---|---|---|
| 1 | `PROJECT_CONTEXT.md` | ~3 phút | Luôn đọc |
| 2 | `DEVELOPMENT_WORKFLOW.md` | ~4 phút | Luôn đọc |
| 3 | `ARCHITECTURE.md` | ~5 phút | Trước khi sửa code |
| 4 | `CODING_STANDARDS.md` | ~3 phút | Trước khi viết code |
| 5 | `DECISION_LOG.md` | ~2 phút | Trước khi đề xuất thay đổi cấu trúc / thư viện |
| 6 | `../docs/PROJECT_ANALYSIS.md` | tham khảo | Khi cần chi tiết, rủi ro, số liệu |

## Nội dung

| File | Mục đích |
|---|---|
| `PROJECT_CONTEXT.md` | Sản phẩm là gì, tính năng nào đã có / chưa có, thuật ngữ, luật chơi |
| `ARCHITECTURE.md` | Cấu trúc code, luồng dữ liệu, giao thức WS, bất biến, vùng nhạy cảm |
| `CODING_STANDARDS.md` | Quy ước code **rút ra từ code hiện có** (Python & TypeScript), test, ngôn ngữ UI |
| `DEVELOPMENT_WORKFLOW.md` | Quy trình: Orient → Scope → Plan → Implement → Verify → Document → Report; phân loại thay đổi; checklist đồng bộ tài liệu; bàn giao giữa phiên/agent |
| `DECISION_LOG.md` | Nhật ký quyết định kiến trúc (ADR) + danh sách câu hỏi còn mở |
| `TASK_TEMPLATE.md` | Mẫu "task brief" cho thay đổi không nhỏ |
| `../AGENTS.md` | Điểm vào ở thư mục gốc, trỏ về đây (nhiều công cụ AI tự đọc file này) |

## 7 luật bất di bất dịch

1. **Đọc trước, sửa sau.** Không sửa file chưa đọc; không giả định tính năng tồn tại — kiểm tra trong code.
2. **Phạm vi tối thiểu.** Chỉ sửa những gì task yêu cầu. Không refactor "tiện thể", không đổi format, không đổi tên hàng loạt.
3. **Không tự quyết kiến trúc.** Thư viện mới, framework, cấu trúc thư mục, schema DB, giao thức API/WS, cơ chế auth → phải **hỏi** (Tier 2).
4. **Bảo toàn tính năng.** Không xóa/vô hiệu hóa tính năng, route, endpoint, action WS, cột DB đang dùng.
5. **Xác minh trước khi báo xong.** Chạy test/lint/typecheck liên quan; báo kết quả thật, kể cả khi không chạy được.
6. **Tài liệu đi cùng code.** Đổi hành vi/kiến trúc → cập nhật `.ai/` và `README.md` trong cùng thay đổi (checklist ở workflow §7).
7. **Không bịa, không nhìn nhầm.** Chuỗi tiếng Việt hiển thị lỗi trong PowerShell là do encoding — **không** "sửa" (xem `CODING_STANDARDS.md` §6).

## Lệnh nhanh

```powershell
# Backend (từ thư mục gốc repo; python hệ thống KHÔNG nằm trong PATH — dùng venv)
.\app\.venv\Scripts\python.exe -m pytest app/tests -q
.\app\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# Frontend (từ web/)
pnpm test -- --run ; pnpm typecheck ; pnpm lint ; pnpm build ; pnpm dev
```

Baseline ngày 2026-11-28: pytest 33 ✅ · vitest 68 ✅ · tsc ✅ · eslint ✅.

## Bảo trì thư mục này

- Mỗi file có mục **"Cập nhật lần cuối"** ở cuối; sửa khi nội dung đổi.
- Thêm file mới vào bảng trên. Giữ file ngắn, ưu tiên bảng/danh sách; không sao chép code dài.
- Quyết định mới → thêm ADR vào `DECISION_LOG.md` (không sửa ADR cũ, chỉ đánh dấu *Superseded*).
- Khi `.ai/` mâu thuẫn với code: **code đúng**; sửa tài liệu và ghi chú trong báo cáo.

_Cập nhật lần cuối: 2026-11-28 (thiết lập ban đầu)._
