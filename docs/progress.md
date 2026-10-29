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
| 2.4b agentwatch (macOS) | PR mở, chưa merge: https://github.com/Vt-mmm/agentwatch/pull/18 | `swift test` 371 test, 0 lỗi; 8 test mới: đường piagent trùng snapshot trước thay đổi, hash lệch không mở, key không vào tiến trình Pi. Windows chưa làm (không có dotnet). Cần chốt với harness: biến `AGENT_WATCH_MANAGED_BINDING`. |
| 2.4b sửa F1–F3 (mini e2e, 29/10) | agentwatch#18 cập nhật | `swift test` 378 test, 0 lỗi. F2: broker gửi `bundle_version` từ binding pi (Piagent không đổi), 426 → `bundleTooOld` + lời nhắn "Sửa cài đặt"; test: bộ 0.2.1 được cấp run, 0.1.9/thiếu bị từ chối, body Piagent y cũ. F1: env `PI_OFFLINE/PI_TELEMETRY/PI_SKIP_VERSION_CHECK` + cờ T6 (chưa kiểm bằng Pi thật không còn tải fd/rg). F3: broker ghim bằng `realpath(3)`. `--expect`: binding ghim `manifest_sha256`. Hash Swift theo định dạng v2 của #12 (cũ vẫn chấp nhận). |
| 2.4a agent-studio | xem session p2-studio | |
| Quét secret/IP lịch sử git (4 repo, tạm thời, 29/10) | chưa có gitleaks; grep regex | `git log --all -p \| grep -E 'gho_…\|sk-…\|as_run_…\|AKIA…\|PRIVATE KEY\|IP riêng'` → chỉ trùng chuỗi phiên bản trong package-lock (false positive). Chạy lại gitleaks trước release. |
