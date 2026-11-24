# Genshin Ban/Pick VN

Ứng dụng web thi đấu **Ban/Pick nhân vật Genshin Impact 1v1 thời gian thực**, quản lý kho nhân vật cá nhân (C0–C6 và Lv 90/95/100), hệ thống **Cost cân bằng** theo từng bộ luật, chọn vũ khí khi thi đấu và tính điểm 3 ải theo mốc `09:00`.

## Tính năng chính

- **Tài khoản & Phân quyền**:
  - Đăng ký & đăng nhập bằng **UID Genshin (9–10 chữ số) + mật khẩu** (email tùy chọn hoặc cấu hình bắt buộc qua `REQUIRE_EMAIL`).
  - **Chế độ Khách**: lưu kho nhân vật cục bộ trên trình duyệt, xem Bộ luật/bảng Cost và theo dõi trực tiếp trận đấu.
  - **Admin**: đầy đủ quyền của Player + tạo/chỉnh sửa/xóa Bộ luật, thứ tự từng lượt Ban/Pick, bảng Cost nhân vật (`4★/5★`, `C0–C6`), Cost vũ khí & thời gian cộng thêm khi tinh luyện (`4★–5★`, `R1–R5`) và các mốc cộng giây.
- **Kho nhân vật cá nhân (`/profile`)**:
  - Lưu nhân vật sở hữu kèm cung mệnh (`C0–C6`) và level (`90/95/100`). Vũ khí **không** cần lưu vào kho tài khoản.
- **Hệ thống Bộ luật & Cost (`/rules`)**:
  - Mặc định 1 bộ luật chuẩn (**mỗi bên 3 Ban + 8 Pick**, đội Xanh Dương bên trái Ban trước & Pick trước).
  - Cost mặc định: nhân vật 5★ `C0 = 1 cost` (`+1` mỗi cung mệnh), vũ khí 5★ `1 cost` (tinh luyện `R2–R5` cộng thẳng `+5s/bậc` vào điểm tổng), nhân vật 4★ có thể gán Cost riêng (hỗ trợ số lẻ như `0.5`).
  - Cost sử dụng quy đổi thành **giây cộng thêm (điểm)** theo mốc do Admin cài đặt.
- **Phòng đấu 1v1 Realtime (`/lobby`, `/match/:code`)**:
  - Tạo phòng theo bộ luật, mời đối thủ qua link/mã 6 ký tự, chọn bên **Xanh Dương (Trái)** hoặc **Đỏ (Phải)**.
  - Tự động gắn cung mệnh & level từ kho khi Pick nhân vật; cho phép điền **Vũ khí (`R1–R5`)** ngay cạnh nhân vật lúc đang Pick hoặc trong khoảng thời gian trống sau khi Ban/Pick xong.
  - Nhập thời gian hoàn thành 3 ải (`Phút : Giây`), hệ thống lấy `09:00 − thời gian nhập` ở mỗi ải cộng vào điểm Cost — **bên có tổng điểm thấp nhất thắng**.

## Cài đặt & chạy local

### 1. Backend Python (`app/`)

Yêu cầu: Python 3.11+ (khuyến nghị tạo virtualenv trong `app/.venv`).

```powershell
py -m venv app/.venv
.\app\.venv\Scripts\python.exe -m pip install -r app/requirements.txt
.\app\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Tài khoản **Admin mặc định** được tự động khởi tạo khi chạy lần đầu (cấu hình qua biến môi trường trong `app/.env`, tham khảo `app/.env.example`):
- **UID**: `100000000`
- **Mật khẩu**: `admin12345`

Chạy kiểm thử Backend:
```powershell
.\app\.venv\Scripts\python.exe -m pytest app/tests -v
```

### 2. Frontend React (`web/`)

Yêu cầu: Node.js + `pnpm`.

```powershell
cd web
pnpm install
pnpm dev
```

Frontend chạy mặc định ở `http://localhost:5173` và tự động proxy `/api` + `/ws` sang Backend Python (`127.0.0.1:8000`).

Các lệnh kiểm tra trong `web/`:
```powershell
pnpm lint          # Kiểm tra ESLint + React Compiler
pnpm build         # Kiểm tra TypeScript (tsc -b) và build production
pnpm test -- --run # Chạy unit tests (Vitest)
```

## Cập nhật dữ liệu Nhân vật & Vũ khí

Khi Genshin Impact ra nhân vật hoặc vũ khí mới:

```powershell
py assets/dataminer2.py          # Cập nhật nhân vật -> web/src/data/characters.json
py assets/dataminer_weapons.py   # Cập nhật vũ khí  -> web/src/data/weapons.json
```
