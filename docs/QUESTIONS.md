# Câu hỏi cho owner

Mục mở. Làm tiếp phần không bị chặn, hỏi gộp.

1. **Tính năng có thể không làm được trên Pi 1.3.0** (parity.md, mục I1–I16; điều kiện dừng sớm của prompt):
   - I1: Pi xử lý `/model`, `/login`, `/share`, `/bug` trước sự kiện `input`, nên extension không chặn được trực tiếp. Cần spike (bọc ô nhập). Nếu không được, chấp nhận mức nào?
   - I3: không che được secret trong văn bản model đang stream.
   - I4: `thinking_level_select` chỉ quan sát, không ép mức thinking.
   - I8: gzip và đổi token giữa request buộc provider tự viết `streamSimple`.
2. **P0-6 (giới hạn gọi helper lấy từ Studio)** cần thêm trường vào giao thức Studio. Thêm trường tùy chọn (không phá bản cũ) có được không?
3. **Tính năng đề xuất "bỏ có chủ đích"** cần duyệt: F122 (skill plugin Claude/Codex), F125 (preset Atlassian), F126 (skill `fe-change-report`), F155 (`/changelog`). F121 (Herdr) đang xếp "phải làm".
4. Các câu hỏi cuối parity.md (thư mục file trạng thái Agent Watch, vị trí `sandbox-domains`...).
