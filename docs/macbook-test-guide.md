# Hướng dẫn test `runtime = pi` trên MacBook

Bản thử, chưa phát hành. Chỉ dùng **key test**, không dùng key team thật. Máy test là MacBook riêng, không phải mini production.

## Hai file
| File | SHA-256 |
|---|---|
| `AgentWatch-pi-trial.zip` (Agent Watch 0.15.17 + launcher `runtime=pi`, agentwatch#18 @ `969e7ed`, universal arm64+x86_64, ký ad-hoc, tắt tự cập nhật) | `e3528f878bdbcfbf20c1df9fee10004752fc62064d074fd2ecb460d861d9e2c2` |
| `piagent-bundle-0.1.1.zip` (Pi 1.3.0 + harness/sandbox/provider; giao thành 2 phần `.part-aa`, `.part-ab` ≤ 20 MiB) | `c85c67896d52f0ba96991c7db4e414245907db21a6e9279e38c95bbc85a1b2b9` (phần aa `417311183802e478854d920bb80e051cfb7d634da3c6da5f70f264a4545e5a3d`, ab `876c57f324bcf50dd1210e9d136117344edce01b9c40791dcf42d7e4cd50ba7d`) |

Digest `manifest.json` của bộ (Agent Watch ghim giá trị này): `96a303e59c4bdff1cf3ae89d88059b2e7cf6fcc7db9f3eb24eb9b5b06a2c9342`.
Bộ 0.1.1 dựng từ feat/integration + fix/security-bundle (38ad152); provider 5c5c088 (PR #5, đọc lại config theo `configuration_revision`), sandbox d2b2457, harness 80c3890 gộp thêm fix/security-harness b230d89 (commit gộp b6e6f62, chỉ có trong bản dựng). Bản 0.1.0 (provider 48647e2, sandbox 4c57c75, harness b230d89) bị thay thế. App không đổi so với bản đầu (binding đã có `configuration_revision`, ghi lại mỗi lần đồng bộ).

Ghép phần và kiểm: `cat piagent-bundle-0.1.1.zip.part-aa piagent-bundle-0.1.1.zip.part-ab > piagent-bundle-0.1.1.zip && shasum -a 256 -c sha256.txt` (hai dòng part + dòng zip).

## 1. Cài Agent Watch bản thử
```bash
cd ~/Downloads && ditto -x -k AgentWatch-pi-trial.zip /Applications
xattr -dr com.apple.quarantine /Applications/AgentWatch.app
```
- Bản ký ad-hoc (không có Developer ID, không notarize). Lần đầu: chuột phải → Open nếu macOS chặn.
- Cùng bundle id với Agent Watch thật: nếu MacBook đã có bản thật thì bản này **thay** nó và dùng chung cài đặt. Thoát bản cũ trước.
- Chữ ký ad-hoc đổi mỗi lần build nên Keychain sẽ hỏi lại quyền với helper: chọn Always Allow. Nếu không chạy được, build từ source: `git checkout runtime-pi-launcher && swift build -c release` rồi chạy helper trong `.build/release/`.
- Không có nút "Sửa cài đặt" trong app này (chưa làm). "Cài lại" = làm lại bước 2.

## 2. Cài bộ Pi
```bash
D="$HOME/Library/Application Support/AgentWatch/ManagedPi"
mkdir -p "$D" && rm -rf "$D/bundle"
ditto -x -k ~/Downloads/piagent-bundle-0.1.1.zip "$D"
xattr -dr com.apple.quarantine "$D/bundle"
node ~/path/to/piagent-bundle/bin/piagent-bundle-doctor.mjs "$D/bundle"   # tuỳ chọn, cần Node ≥ 22.19: phải ra ok: true
```
Kết quả: `.../ManagedPi/bundle/manifest.json` (đúng chỗ app tìm). Dùng `ditto`, không dùng công cụ giải nén khác: hash tính cả quyền thực thi và symlink.

## 3. Studio
1. Tạo **key test** trong Studio (bạn tự làm).
2. Đặt `runtime = pi` cho key đó.
3. Harness: main → **Codex** (bạn tự đổi).
4. Bản bộ tối thiểu của key phải ≤ 0.1.1 (hoặc để trống); cao hơn thì Studio trả 426 `bundle_too_old`.
5. Trong Agent Watch nhập key, bấm đồng bộ. Mở bằng nút **Terminal** (không có WebUI với `runtime = pi`).

## 4. Các bước kiểm
1. **Mở task sửa lỗi có test**: một repo nhỏ có test đỏ; yêu cầu sửa. Phải chạy được test và xanh.
2. **Đổi model Claude ↔ Codex giữa hội thoại**: đổi qua Studio/harness (không dùng `/model`); hội thoại tiếp tục, không mất ngữ cảnh.
3. **Lệch hash không mở**: `echo x >> "$D/bundle/pi/packages/piagent-harness/package.json"`. Bấm Terminal: phải từ chối, báo `hash-mismatch:harness`, gợi ý "Sửa cài đặt", không mở cửa sổ Terminal. Khôi phục bằng bước 2.
4. **Gạt `runtime = piagent`** trong Studio, đồng bộ lại, mở: phải ra bản cũ (Piagent, `~/.pi/agent`). Gạt lại `pi`, **đồng bộ** rồi mới mở (binding Pi bị xoá khi gạt đi).
5. **Hội thoại cũ**: mở lại hội thoại tạo bằng bản cũ → mở bằng bản cũ, không chuyển sang Pi gốc.
6. **`/model` bị chặn**: gõ `/model` trong Pi: không đổi được sang model ngoài `studio/agent-watch-auto`.
7. **Không thấy key**: khi Pi đang chạy:
```bash
ps eww -p $(pgrep -f 'pi/bin/pi' | head -1) | tr ' ' '\n' | grep -iE 'key|token|secret|sk-' ; echo "exit=$?"   # mong đợi: không dòng nào, exit=1
```
8. **Bộ quá cũ**: đặt bản bộ tối thiểu của key lên 0.2.0 → mở phải báo tiếng Việt "Bộ Pi … đã quá cũ" kèm "Sửa cài đặt". Đặt lại ≤ 0.1.1.
9. Kiểm đường ghi: `ls "$D"` có `agent/`, `ManagedSessions/`, `agent-watch-managed-pi.json`; `~/.pi/agent` không bị đụng bởi `runtime = pi`.

10. **Test lại bản 0.1.1 — (1) đổi Harness giữa hội thoại**: đang có hội thoại, đổi Harness trong Studio (ví dụ main Codex → Claude), chờ Agent Watch đồng bộ (binding đổi `configuration_revision`), gõ tin tiếp: không còn lỗi `managed-grant-invalid`.
11. **Test lại bản 0.1.1 — (2) lượt chỉ chạy `env`**: trong project không phải git, nhờ agent chạy `env` rồi dừng: cổng hoàn thành không gửi lại bắt chạy `npm test`.

## Checklist báo lại
- [ ] sha256 hai file khớp; `doctor` ok
- [ ] (0.1.1) đổi Harness giữa hội thoại, gõ tiếp: không `managed-grant-invalid`
- [ ] (0.1.1) lượt chỉ chạy `env`: không bị gửi lại bắt `npm test`
- [ ] 1 task sửa lỗi có test xanh (Codex làm main)
- [ ] đổi Claude ↔ Codex giữa hội thoại: ok / lỗi gì
- [ ] lệch hash: từ chối + đúng thông báo
- [ ] gạt `piagent` mở bản cũ; gạt lại `pi` mở bản mới
- [ ] hội thoại cũ vẫn mở bằng bản cũ
- [ ] `/model` bị chặn
- [ ] `ps eww` không thấy key
- [ ] bộ quá cũ: thông báo đúng
- [ ] dòng Pi nhắc "fd/rg not found, Downloading" hoặc lỗi mạng khi mở: có / không
- [ ] Studio: lượt chạy xuất hiện với runtime=pi, bản bộ 0.1.1
- Gửi kèm: ảnh/đoạn lỗi, `ls "$D/ManagedSessions"`, giờ xảy ra.

## Giới hạn đã biết
- Bản thử, chưa có nút "Sửa cài đặt"; App target Xcode chưa được kiểm tay (chỉ build + ký ad-hoc + `swift test` 378 test).
- Windows chưa hỗ trợ `runtime = pi`.
- Luồng thật với Keychain và Studio thật chưa chạy trên máy nào trước bản này.
- Provider chưa in trường `message` của broker, nên với 426 Pi có thể chỉ hiện mã lỗi; app vẫn hiện thông báo đầy đủ khi mở.

## Bằng chứng F1 (Pi thật, offline)
Chạy trên mini, Pi 1.3.0 của bộ, `sandbox-exec -p '(version 1)(allow default)(deny network*)'`, `env -i`, HOME giả, `PI_CODING_AGENT_DIR` riêng, provider dùng broker giả (không key, không mạng), TUI lên đủ (hiện `agent-watch-auto`).

| Lượt | Cờ/env | Kết quả |
|---|---|---|
| đối chứng | không có `--offline` và PI_OFFLINE… | TUI in "fd not found. Downloading…" và "ripgrep not found. Downloading…"; **1** lần kết nối mạng bị sandbox chặn |
| launcher #18 | `--no-extensions --no-approve --no-skills --no-prompt-templates --offline`, `PI_OFFLINE=1 PI_TELEMETRY=0 PI_SKIP_VERSION_CHECK=1` | không có "Downloading"; **0** kết nối bị chặn (`log show` lọc `deny(1) network`); không có `agent/bin` |

Kết luận: với cờ/env của launcher, Pi không tải fd/rg và không thử kết nối mạng; không cần đóng gói fd/rg. Giới hạn: kiểm 12 giây đầu sau khi mở, chưa gửi prompt (đường gửi prompt đi qua provider → Studio, đó là kết nối được phép).
