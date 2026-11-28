# AGENTS.md — Hướng dẫn cho AI Agent

Dự án: **Genshin Ban/Pick VN** — ứng dụng thi đấu Ban/Pick Genshin Impact 1v1 realtime (FastAPI + React). Đây là **codebase đang chạy**, không phải dự án mới.

**Trước khi làm bất cứ điều gì, đọc `.ai/README.md`** rồi theo thứ tự trong đó (`PROJECT_CONTEXT` → `DEVELOPMENT_WORKFLOW` → `ARCHITECTURE` → `CODING_STANDARDS` → `DECISION_LOG`).

## Luật tối thiểu
1. Đọc code thật trước khi sửa; không giả định tính năng tồn tại.
2. Phạm vi tối thiểu; không refactor/đổi format ngoài task.
3. **Không** tự đổi kiến trúc, framework, dependency, schema DB, hợp đồng API/WS, auth, luật chơi/điểm → lập kế hoạch và **chờ chấp thuận** (Tier 2, xem `.ai/DEVELOPMENT_WORKFLOW.md` §3).
4. Không xóa/vô hiệu hóa tính năng hiện có.
5. Chạy kiểm chứng và báo kết quả thật; cập nhật tài liệu theo ma trận ở workflow §7.
6. Không commit/push/tạo nhánh nếu chưa được yêu cầu.

## Lệnh
```powershell
.\app\.venv\Scripts\python.exe -m pytest app/tests -q                  # backend
cd web ; pnpm test -- --run ; pnpm typecheck ; pnpm lint              # frontend
```
Lưu ý: UI & thông báo lỗi bằng **tiếng Việt**; PowerShell hiển thị tiếng Việt bị mojibake là bình thường — đừng "sửa" file.
