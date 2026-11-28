# TASK_TEMPLATE

Sao chép vào phản hồi hoặc `.ai/tasks/YYYY-MM-DD-<slug>.md` cho thay đổi Tier 1 (rút gọn) và Tier 2 (đầy đủ). Xóa mục không áp dụng.

```markdown
# <Tên task>

- Tier: 0 | 1 | 2   · Người yêu cầu: …   · Ngày: …   · Trạng thái: Planned | Approved | In progress | Done | Blocked

## 1. Mục tiêu
(1–3 câu: kết quả người dùng/developer thấy được.)

## 2. Ngoài phạm vi
- …

## 3. Bối cảnh đã xác minh
(File/hàm đã đọc, hành vi hiện tại, test liên quan. Chỉ ghi điều đã kiểm chứng trong code.)

## 4. Phương án   (Tier 2: ≥ 2 phương án nếu có lựa chọn)
| | Mô tả | Ưu | Nhược |
|---|---|---|---|
Đề xuất: …

## 5. Kế hoạch thay đổi
1. `đường/dẫn/file` — thay đổi gì, vì sao
2. …

## 6. Tác động
- Dữ liệu đã lưu (DB/localStorage) & tương thích ngược: …
- Hợp đồng FE↔BE / WS: …
- Bảo mật / hiệu năng: …
- Tính năng hiện có có thể bị ảnh hưởng: …

## 7. Kiểm chứng
- Test mới/sửa: …
- Lệnh chạy: …
- Kiểm tra thủ công: …

## 8. Tài liệu cần cập nhật
(Theo ma trận `DEVELOPMENT_WORKFLOW.md` §7.)

## 9. Rollback
…

## 10. Câu hỏi cho developer
- …

## 11. Nhật ký thực hiện (cập nhật khi làm)
- [ ] Bước 1 …
- Quyết định đã chốt: …
- Bước kế tiếp / lệnh để tiếp tục: …
```
