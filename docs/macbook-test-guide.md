# Hướng dẫn test `runtime = pi` trên MacBook

Bản thử 0.2.0 (Pi 1.4.0), chưa phát hành. Chỉ dùng **key test**, không dùng key team thật. Máy test là MacBook riêng, không phải mini production.

## Hai file (bản thử, chưa publish)
| File | SHA-256 |
|---|---|
| `AgentWatch-pi-trial-3.zip` — **chưa dựng**. `AgentWatch-pi-trial-2.zip` (agentwatch#18 @ `3a3e7b2`) chỉ chấp nhận bộ Pi 1.3.0 và **từ chối** bộ 0.2.0 (`pi-version:1.4.0`). Cần bản dựng từ nhánh `runtime-pi-launcher-pi14` (đổi tập Pi của bộ sang 1.4.0, tập của Piagent giữ nguyên). | (chưa có) |
| `piagent-pi-bundle-0.2.0.tgz` (package npm `@piagent/pi-bundle` 0.2.0: Pi 1.4.0 + provider 92c341c, sandbox 24a9a39, harness 1c4299f) | `8b1c9c9039f829f150a979af4863d0b9ccd65c96ff7e26969ebc9a955cc9eef3` |

Digest `manifest.json` trong tarball (Agent Watch ghim): `994f38f93ca9527962a99c872d4046372dcac888c66cb195fd451edede4a68db`.
Kiểm file: `shasum -a 256 <file>`. Gói đã cài thử vào prefix tạm trên mini: `doctor` ok:true, và Agent Watch (Swift) kiểm hash v2 của bản đã cài khớp.

## 1. Cài Agent Watch bản thử
```bash
cd ~/Downloads && ditto -x -k AgentWatch-pi-trial-3.zip /Applications
xattr -dr com.apple.quarantine /Applications/AgentWatch.app
```
- Bản ký ad-hoc (không Developer ID, không notarize). Lần đầu: chuột phải → Open nếu macOS chặn.
- Cùng bundle id với Agent Watch thật: nếu MacBook đã có bản thật thì bản này **thay** nó và dùng chung cài đặt. Thoát bản cũ trước.
- Chữ ký ad-hoc làm Keychain hỏi lại quyền với helper: chọn Always Allow. Không chạy được thì build từ source (`git checkout runtime-pi-launcher && swift build -c release`).

## 2. Cài bộ Pi — một lệnh npm (giống Piagent)
Bộ là package npm toàn cục `@piagent/pi-bundle`. Agent Watch **không cài** nó, chỉ tìm ở mọi prefix npm (nvm, fnm, volta, asdf, mise, `~/.npm-global`, Homebrew…) rồi ghim đường dẫn + hash. Cần Node ≥ 22.19.
```bash
npm install --global --ignore-scripts ~/Downloads/piagent-pi-bundle-0.2.0.tgz
piagent-pi-bundle doctor        # phải ra "ok": true và in manifestSha256 = digest ở trên
```
(Khi đã publish, lệnh sẽ là `npm install --global @piagent/pi-bundle`.)
- Cập nhật: `piagent-pi-bundle update`. Sửa: `piagent-pi-bundle repair`. Rollback: `npm install --global @piagent/pi-bundle@<bản cũ>` (hoặc gạt `runtime = piagent` trong Studio).
- Trong app, khi bộ thiếu/lệch hash: nút **Sửa cài đặt** mở Terminal chạy đúng lệnh npm trong shell của bạn (Agent Watch không tự chạy npm); nút **Sao chép lệnh** để tự dán. Sau đó bấm Đồng bộ rồi mở lại.
- Vị trí cũ `~/Library/Application Support/AgentWatch/ManagedPi/bundle` (bản thử 0.1.0/0.1.1 dạng zip, Pi 1.3.0) vẫn được chấp nhận nhưng gói npm được ưu tiên. Xoá vị trí cũ cho khỏi nhầm: `rm -rf "$HOME/Library/Application Support/AgentWatch/ManagedPi/bundle"`.
- Dữ liệu của Pi (agent, phiên) vẫn ở `~/Library/Application Support/AgentWatch/ManagedPi/{agent,ManagedSessions}`.

## 3. Studio
1. Tạo **key test** trong Studio (bạn tự làm).
2. Đặt `runtime = pi` cho key đó.
3. Harness: main → **Codex** (bạn tự đổi).
4. Bản bộ tối thiểu của key phải ≤ 0.2.0 (hoặc để trống); cao hơn thì Studio trả 426 `bundle_too_old`.
5. Trong Agent Watch nhập key, bấm đồng bộ. Mở bằng nút **Terminal** (không có WebUI với `runtime = pi`).

## 4. Các bước kiểm
1. **Mở task sửa lỗi có test**: một repo nhỏ có test đỏ; yêu cầu sửa. Phải chạy được test và xanh.
2. **Đổi model Claude ↔ Codex giữa hội thoại**: đổi qua Studio/harness (không dùng `/model`); hội thoại tiếp tục, không mất ngữ cảnh.
3. **Lệch hash không mở**: `echo x >> "$(piagent-pi-bundle path)/pi/packages/piagent-harness/package.json"`. Bấm Terminal: phải từ chối, báo `hash-mismatch:harness`, gợi ý "Sửa cài đặt", không mở cửa sổ Terminal. Khôi phục: nút **Sửa cài đặt** hoặc `piagent-pi-bundle repair`, rồi Đồng bộ.
4. **Gạt `runtime = piagent`** trong Studio, đồng bộ lại, mở: phải ra bản cũ (Piagent, `~/.pi/agent`). Gạt lại `pi`, **đồng bộ** rồi mới mở (binding Pi bị xoá khi gạt đi).
5. **Hội thoại cũ**: mở lại hội thoại tạo bằng bản cũ → mở bằng bản cũ, không chuyển sang Pi gốc.
6. **`/model` bị chặn**: gõ `/model` trong Pi: không đổi được sang model ngoài `studio/agent-watch-auto`.
7. **Không thấy key**: khi Pi đang chạy:
```bash
ps eww -p $(pgrep -f 'pi/bin/pi' | head -1) | tr ' ' '\n' | grep -iE 'key|token|secret|sk-' ; echo "exit=$?"   # mong đợi: không dòng nào, exit=1
```
8. **Bộ quá cũ**: đặt bản bộ tối thiểu của key lên 0.3.0 → mở phải báo tiếng Việt "Bộ Pi … đã quá cũ" kèm "Sửa cài đặt". Đặt lại ≤ 0.2.0.
9. Kiểm đường ghi: `ls "$HOME/Library/Application Support/AgentWatch/ManagedPi"` có `agent/`, `ManagedSessions/`, `agent-watch-managed-pi.json`; `~/.pi/agent` không bị đụng bởi `runtime = pi`.

10. **Test lại (từ 0.1.1) — (1) đổi Harness giữa hội thoại**: đang có hội thoại, đổi Harness trong Studio (ví dụ main Codex → Claude), chờ Agent Watch đồng bộ (binding đổi `configuration_revision`), gõ tin tiếp: không còn lỗi `managed-grant-invalid`.
11. **Test lại (từ 0.1.1) — (2) lượt chỉ chạy `env`**: trong project không phải git, nhờ agent chạy `env` rồi dừng: cổng hoàn thành không gửi lại bắt chạy `npm test`.

## Checklist báo lại
- [ ] sha256 hai file khớp; `npm install --global` ok; `piagent-pi-bundle doctor` ok:true
- [ ] lệch hash: nút Sửa cài đặt mở Terminal, chạy xong + Đồng bộ thì mở lại được
- [ ] (từ 0.1.1) đổi Harness giữa hội thoại, gõ tiếp: không `managed-grant-invalid`
- [ ] (từ 0.1.1) lượt chỉ chạy `env`: không bị gửi lại bắt `npm test`
- [ ] 1 task sửa lỗi có test xanh (Codex làm main)
- [ ] đổi Claude ↔ Codex giữa hội thoại: ok / lỗi gì
- [ ] lệch hash: từ chối + đúng thông báo
- [ ] gạt `piagent` mở bản cũ; gạt lại `pi` mở bản mới
- [ ] hội thoại cũ vẫn mở bằng bản cũ
- [ ] `/model` bị chặn
- [ ] `ps eww` không thấy key
- [ ] bộ quá cũ: thông báo đúng
- [ ] dòng Pi nhắc "fd/rg not found, Downloading" hoặc lỗi mạng khi mở: có / không
- [ ] Studio: lượt chạy xuất hiện với runtime=pi, bản bộ 0.2.0
- Gửi kèm: ảnh/đoạn lỗi, `ls "$HOME/Library/Application Support/AgentWatch/ManagedPi/ManagedSessions"`, giờ xảy ra.

## Giới hạn đã biết
- Bộ 0.2.0 đổi Pi 1.3.0 → 1.4.0: request Responses của model GPT/Codex khai báo tool trong `input` (`additional_tools`), không còn `tools` ở mức trên. Chưa ai chạy với Studio thật (xem QUESTIONS P10). Nếu bước "Codex làm main" lỗi 400/422 từ Studio thì ghi lại nguyên văn.
- Bản thử: App target Xcode chỉ được build + ký ad-hoc + `swift test` 383 test, chưa ai bấm tay nút Sửa cài đặt; gói npm chưa publish nên lệnh cài dùng file `.tgz`.
- Windows chưa hỗ trợ `runtime = pi`.
- Luồng thật với Keychain và Studio thật chưa chạy trên máy nào trước bản này.
- Provider chưa in trường `message` của broker, nên với 426 Pi có thể chỉ hiện mã lỗi; app vẫn hiện thông báo đầy đủ khi mở.

## Bằng chứng F1 (Pi thật, offline)
Chạy trên mini, Pi 1.3.0 của bộ 0.1.1 (**chưa chạy lại trên Pi 1.4.0**; đo lại nếu cần), `sandbox-exec -p '(version 1)(allow default)(deny network*)'`, `env -i`, HOME giả, `PI_CODING_AGENT_DIR` riêng, provider dùng broker giả (không key, không mạng), TUI lên đủ (hiện `agent-watch-auto`).

| Lượt | Cờ/env | Kết quả |
|---|---|---|
| đối chứng | không có `--offline` và PI_OFFLINE… | TUI in "fd not found. Downloading…" và "ripgrep not found. Downloading…"; **1** lần kết nối mạng bị sandbox chặn |
| launcher #18 | `--no-extensions --no-approve --no-skills --no-prompt-templates --offline`, `PI_OFFLINE=1 PI_TELEMETRY=0 PI_SKIP_VERSION_CHECK=1` | không có "Downloading"; **0** kết nối bị chặn (`log show` lọc `deny(1) network`); không có `agent/bin` |

Kết luận: với cờ/env của launcher, Pi không tải fd/rg và không thử kết nối mạng; không cần đóng gói fd/rg. Giới hạn: kiểm 12 giây đầu sau khi mở, chưa gửi prompt (đường gửi prompt đi qua provider → Studio, đó là kết nối được phép).
