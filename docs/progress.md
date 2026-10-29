# Tiến độ giai đoạn 2

Cập nhật sau mỗi bước con. Mỗi dòng có bằng chứng (lệnh, kết quả rút gọn).

## 2.0 Chuẩn bị

| Việc | Trạng thái | Bằng chứng |
|---|---|---|
| Tạo 4 repo public | xong | `gh repo create Vt-mmm/piagent-{provider,sandbox,harness,bundle} --public` |
| Skeleton + CI + lockfile | xong (chờ CI chạy lần đầu) | `npm test` local: 2 pass mỗi repo |
| Branch protection, secret scanning, push protection | xem mục dưới | |
| studio-contract.md, parity.md, baseline | đang làm | |

## 2.4a agent-studio (29/10)

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| `runtime = piagent \| pi` theo team và key, migration 085, API admin, tab UI | xong, PR mở, chưa merge/deploy | Vt-mmm/agent-studio#41; mặc định `piagent`, key ghi đè team |
| Manifest thêm `runtime`, `package_allowlist`, `min_bundle_version`, `helper_slots` (trần theo team) | xong | chỉ thêm trường; Agent Watch cần học trường mới vì broker mã hóa lại theo schema cố định |
| Bản bộ tối thiểu | xong | header `X-Studio-Bundle-Version` hoặc body `bundle_version`; chỉ runtime `pi` bị kiểm, khi Studio đặt `STUDIO_MIN_BUNDLE_VERSION`; bản cũ/thiếu → 426 `bundle_too_old` + lời nhắn tiếng Việt |
| Chỉ số tách theo runtime và bản bộ | xong | `GET /admin/teams/{id}/runtime-metrics`; join qua run, không lưu thêm, không có nội dung prompt |
| Test | `go vet`, `go test ./... -race` trên postgres:17.6 `studio_test`, `tsc --noEmit` đều qua | test chứng minh client cũ/runtime `piagent` chạy như trước |
| Còn lại cho owner | review + merge PR, đặt `STUDIO_MIN_BUNDLE_VERSION`, deploy khi sẵn sàng | UI chưa có chỗ đặt runtime riêng của key (chỉ API) |
