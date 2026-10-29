# Runbook: Piagent company mode trên Pi gốc

Trạng thái: bản nháp, cập nhật ở 2.5. Các bước ghi "chưa kiểm" chưa chạy trên máy thật; phần "Dựng bộ" và "Kiểm bộ" đã chạy thật trên mini (progress.md, 2.5).

## Dựng bộ
Cần Node >= 22.19, git, tar, npm và mạng tới registry npm (chỉ lúc dựng). Không ghi gì ngoài thư mục `--out` và cache của npm.
```bash
node scripts/build-bundle.mjs --out /đường/dẫn/mới/bundle
```
- Pi 1.3.0 riêng: `npm ci --ignore-scripts` từ `pi-lock/package-lock.json` (không dùng Pi global, không script cài đặt).
- Ba package đúng commit trong `bundle.pins.json`, lấy từ repo công khai (hoặc `--source provider=<clone git>` để dùng bản cục bộ; commit ghim phải có trong clone).
- Ghi `manifest.json` (sha256 từng phần) rồi chạy `doctor`; thoát 0 khi `ok: true`.
- Ghim lại sau khi package đổi: `node scripts/pin-heads.mjs provider=<clone> sandbox=<clone> harness=<clone>`, rồi commit `bundle.pins.json`.

## Kiểm bộ
```bash
node bin/piagent-bundle-doctor.mjs /đường/dẫn/bundle
```
`ok: true` và thoát 0 khi mọi phần khớp hash. Sai: `hash-mismatch:<phần>`, `absent:<phần>`, `manifest-missing`, `pi-version:<v>`; thoát 1. Phần `pi` bao cả ba package nên một thay đổi trong package báo cả `pi` lẫn package đó.

## Chạy thử cả bộ (không Studio thật)
```bash
npm run test:e2e
```
Dựng bộ, chạy Pi 1.3.0 thật với ba package, Studio/broker/model giả (cần python3 cho thử `/model`). Cục bộ: đặt `E2E_SOURCE_PROVIDER`, `E2E_SOURCE_SANDBOX`, `E2E_SOURCE_HARNESS` tới clone, hoặc `E2E_BUNDLE` tới bộ đã dựng.

## Môi trường launcher
`launchPlan` đặt `PI_CODING_AGENT_DIR`, `PI_CODING_AGENT_SESSION_DIR`, `AGENT_WATCH_MANAGED_BINDING`, `PI_OFFLINE=1`, `PI_TELEMETRY=0`, `PI_SKIP_VERSION_CHECK=1`. Launcher khác (Agent Watch) phải đặt đủ; thiếu ba biến cuối thì Pi tự gọi mạng (QUESTIONS I18). `command` là file Node (`<bộ>/pi/bin/pi`): chạy bằng Node đã ghim. PATH tối thiểu `/usr/bin:/bin` đủ cho `--version`.

## Bật cho một team
1. Trong Studio đặt `runtime = pi` cho **một key test** trước (không phải key của team thật). Chờ PR agent-studio (trường `runtime`) được owner merge và deploy.
2. Trên máy member, Agent Watch bản có launcher mới phải đã cài bộ (Pi riêng + 3 package). Chạy `node bin/piagent-bundle-doctor.mjs <thư mục bộ>`: phải trả `ok: true`.
3. Mở một task nhỏ có test; kiểm trạng thái và log (mục dưới).
4. Đặt `runtime = pi` cho team. Theo dõi chỉ số Studio tách theo runtime (gateway_calls lỗi, tool_failures, disconnects, tỷ lệ verified) so với baseline ở `baseline-studio-metrics.md`.

## Rollback
Đặt `runtime = piagent` ở key hoặc team trong Studio. Lần mở sau của member dùng launcher cũ; hội thoại cũ vốn vẫn mở bằng bản cũ. Không cần cài lại gì. (Chưa kiểm trên máy thật.)

## Sửa cài đặt (hash lệch)
Agent Watch từ chối mở khi `doctor` báo `hash-mismatch:<phần>`, `absent:<phần>` hoặc `manifest-missing`. Dùng "Sửa cài đặt" (cài lại bộ đúng bản đã pin). Không sửa tay file trong thư mục bộ.

## Đọc log khi member báo lỗi
- Log local: `ManagedSessions/<hash>/` (cùng chỗ với bản cũ).
- Studio: lọc theo runtime, bản bộ và key; xem `tool_failures`, `gateway_calls` (mã lỗi `session_account_busy_retry_later` nghĩa là thiếu session id), `client_disconnects`.
- Không có nội dung prompt trong log; secret đã được che.

## Bộ bị từ chối vì quá cũ
Studio trả lỗi kèm lời nhắn cập nhật khi bản bộ thấp hơn mức tối thiểu của team. Cài bản bộ mới (Sửa cài đặt hoặc cập nhật Agent Watch), kiểm `doctor`, mở lại. Muốn tạm cho chạy tiếp: hạ bản bộ tối thiểu hoặc gạt `runtime = piagent`.

## Ma trận version
| Bộ | Pi | harness | sandbox | provider | Studio tối thiểu | Agent Watch tối thiểu |
|---|---|---|---|---|---|---|
| (chưa phát hành; thử 2.5) | 1.3.0 | `13afcba` | `f1ac85b` | `1b40fa4` | chưa đo | chưa đo |

Mỗi release của bộ thêm một dòng. Chỉ owner tag release.
