# Tiến độ giai đoạn 2

Cập nhật sau mỗi bước con. Mỗi dòng có bằng chứng (lệnh, kết quả rút gọn).

## 2.0 Chuẩn bị

| Việc | Trạng thái | Bằng chứng |
|---|---|---|
| Tạo 4 repo public | xong | `gh repo create Vt-mmm/piagent-{provider,sandbox,harness,bundle} --public` |
| Skeleton + CI + lockfile | xong (chờ CI chạy lần đầu) | `npm test` local: 2 pass mỗi repo |
| Branch protection, secret scanning, push protection | xem mục dưới | |

| piagent-bundle: manifest sha256, kiểm hash, doctor, launch plan | xong phần logic, test offline | `npm test` 6 pass (hash lệch → `hash-mismatch:sandbox`; plan chỉ chứa đường dẫn bộ; env agent dir riêng). Chưa đóng gói Pi thật, chưa chạy trên mini. |
| runbook.md | bản nháp | các bước chưa kiểm trên máy thật |
| 2.4a agent-studio, 2.4b agentwatch | CHƯA KHỞI ĐỘNG: chờ owner Trust repository | |
