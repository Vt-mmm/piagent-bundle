# Tiến độ giai đoạn 2

Cập nhật sau mỗi bước con. Mỗi dòng có bằng chứng (lệnh, kết quả rút gọn).

## 2.0 Chuẩn bị

| Việc | Trạng thái | Bằng chứng |
|---|---|---|
| Tạo 4 repo public | xong | `gh repo create Vt-mmm/piagent-{provider,sandbox,harness,bundle} --public` |
| Skeleton + CI + lockfile | xong (chờ CI chạy lần đầu) | `npm test` local: 2 pass mỗi repo |
| Branch protection, secret scanning, push protection | xem mục dưới | |
| studio-contract.md, parity.md, baseline | đang làm | |
| studio-contract.md | viết xong, chờ owner duyệt; chưa chạy thử với broker giả | 1000 dòng, trích file:line; 5 khoảng trống ghi cuối file |
| parity.md | viết xong, chờ owner duyệt | 141 tính năng; 16 mục I1–I16 chưa chắc làm được trên Pi 1.3.0 (QUESTIONS.md) |
| baseline-studio-metrics.md | số liệu Studio 14 ngày của một team nhỏ, đã ẩn danh và làm tròn | khoảng 330 run, khoảng 1,5% gateway lỗi, khoảng 325 disconnect |
| baseline soak lane + A/B của `piagent studio` | CHƯA CHẠY | |
| CI lần đầu trên 4 repo | xem `gh run list` | |
| Spike I1 (chặn /model, /login, /share, /bug) | ĐẠT trên Pi 1.3.0 | `python3 docs/spikes/i1-i4/drive.py "/model" "/share"` → cảnh báo "bị chặn trong chế độ công ty" |
| Spike I4 (ép thinking theo Harness) | ĐẠT bằng hoàn lại, UI nháy một lần | `/thinking low` → log `reverted low -> now medium`; chưa kiểm Shift+Tab |
