# Genshin Ban/Pick VN

Ứng dụng web hỗ trợ cộng đồng người chơi Genshin Impact tạo trận đấu **ban/pick nhân vật 1v1**, lưu trữ kho nhân vật cá nhân (cung mệnh C0–C6 và level 90/95/100), lựa chọn bộ luật thi đấu và cân bằng đầu tư giữa các tài khoản trong trận.

## Tính năng hiện tại (Giai đoạn 0 & 1)

- **Đăng nhập / Đăng ký / Chế độ Khách**: giao diện Auth đầy đủ validation (`zod` + `react-hook-form`), lưu phiên và tài khoản giả lập trên trình duyệt.
- **Kho nhân vật cá nhân (`/profile`)**:
  - 126 nhân vật (kèm 2 mục Nhà Lữ Hành Nam/Nữ) hiển thị theo độ hiếm, nguyên tố và vũ khí.
  - Hai chế độ thao tác: **Chỉnh sửa** (dialog chỉnh sở hữu, C0–C6, Lv 90/95/100, phím tắt `0–6` và `←/→`) và **Chọn nhanh** (bấm thẻ để bật/tắt sở hữu).
  - Bộ lọc kết hợp (tìm tiếng Việt không dấu, nguyên tố, độ hiếm, vũ khí, trạng thái sở hữu, sắp xếp) đồng bộ qua URL query.
  - Thao tác hàng loạt (**Đánh dấu tất cả 4★**, **Có tất cả**, **Bỏ tất cả**, **Đặt level…**) và **Nhập / Xuất JSON**.

## Cài đặt & chạy local

Yêu cầu: Node.js + `pnpm`.

```bash
cd web
pnpm install
pnpm dev
```

Các lệnh kiểm tra khác trong `web/`:

```bash
pnpm lint          # Kiểm tra ESLint
pnpm build         # Kiểm tra TypeScript (tsc -b) và build production
pnpm test -- --run # Chạy unit tests (Vitest)
```

## Cập nhật dữ liệu nhân vật

Khi Genshin Impact ra nhân vật mới, chạy lại script dataminer (yêu cầu Python 3 và thư viện `requests`) để tải icon vào `web/public/characters/` và cập nhật `web/src/data/characters.json`:

```bash
py assets/dataminer2.py
```

Tùy chọn thêm: `--json-only`, `--icons-only`, `--force`.

## Tài liệu quy hoạch

- [Lộ trình phát triển dài hạn (GĐ 0–6)](docs/ROADMAP.md)
- [Kế hoạch kiến trúc Backend (để duyệt sau)](docs/BACKEND_PLAN.md)
