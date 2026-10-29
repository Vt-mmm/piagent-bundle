# Runbook: Piagent company mode trên Pi gốc

Trạng thái: bản nháp, cập nhật ở 2.6. Các bước ghi "chưa kiểm" chưa chạy trên máy thật; phần "Dựng bộ" và "Kiểm bộ" đã chạy thật trên mini (progress.md, 2.5); mở bằng launcher Swift, rollback và hash lệch đã chạy thật trong môi trường cách ly trên mini (progress.md, 2.6), còn Keychain thật và giao diện app thì chưa.

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
1. Trong Studio đặt `runtime = pi` cho **một key test** trước (không phải key của team thật). Chờ PR agent-studio (trường `runtime`) được owner merge và deploy. **Không đặt `STUDIO_MIN_BUNDLE_VERSION`** cho tới khi broker gửi bản bộ (progress 2.6, F2): hiện mọi run `pi` bị 426 khi có sàn.
2. Trên máy member, Agent Watch bản có launcher mới phải đã cài bộ (Pi riêng + 3 package). Chạy `node bin/piagent-bundle-doctor.mjs <thư mục bộ>`: phải trả `ok: true`.
3. Mở một task nhỏ có test; kiểm trạng thái và log (mục dưới).
4. Đặt `runtime = pi` cho team. Theo dõi chỉ số Studio tách theo runtime (gateway_calls lỗi, tool_failures, disconnects, tỷ lệ verified) so với baseline ở `baseline-studio-metrics.md`.

## Rollback
Đặt `runtime = piagent` ở key hoặc team trong Studio. Lần mở sau của member dùng launcher cũ; hội thoại cũ vốn vẫn mở bằng bản cũ. Không cần cài lại gì. Đã kiểm trong môi trường cách ly (2.6, E9/E10): gạt `pi → piagent → pi` đổi manifest ngay, đường Piagent cũ cho binding và file `.command` giống từng byte với bản Agent Watch trước PR, và chạy xong bài; thư mục `ManagedPi/` của Pi tách hẳn thư mục Piagent. Chưa kiểm bằng cách bấm trong app và mở lại một hội thoại cũ.

## Sửa cài đặt (hash lệch)
Agent Watch từ chối mở khi `doctor` báo `hash-mismatch:<phần>`, `absent:<phần>` hoặc `manifest-missing`. Dùng "Sửa cài đặt" (cài lại bộ đúng bản đã pin). Không sửa tay file trong thư mục bộ.

## Đọc log khi member báo lỗi
- Log local: `ManagedSessions/<hash>/` (cùng chỗ với bản cũ).
- Studio: lọc theo runtime, bản bộ và key; xem `tool_failures`, `gateway_calls` (mã lỗi `session_account_busy_retry_later` nghĩa là thiếu session id), `client_disconnects`.
- Không có nội dung prompt trong log; secret đã được che.

## Bộ bị từ chối vì quá cũ
Studio trả 426 `bundle_too_old` kèm lời nhắn tiếng Việt khi bản bộ thấp hơn mức tối thiểu hoặc không báo bản (Studio đã kiểm trong 2.6, E2). **Lời nhắn chưa tới được member**: broker đổi 426 thành `serverUnavailable` (giữ `studio_code`) và Pi đứng im; broker cũng chưa gửi `bundle_version` (F2). Cho tới khi sửa, đây không phải cách rollout dùng được. Cài bản bộ mới (Sửa cài đặt hoặc cập nhật Agent Watch), kiểm `doctor`, mở lại. Muốn tạm cho chạy tiếp: hạ bản bộ tối thiểu hoặc gạt `runtime = piagent`.

## Ma trận version
| Bộ | Pi | harness | sandbox | provider | Studio tối thiểu | Agent Watch tối thiểu |
|---|---|---|---|---|---|---|
| (chưa phát hành; thử 2.5) | 1.3.0 | `13afcba` | `f1ac85b` | `1b40fa4` | chưa đo | chưa đo |

Mỗi release của bộ thêm một dòng. Chỉ owner tag release.

## Kiểm cách ly trên mini (không đụng production)
Dùng khi cần kiểm lại E mà không deploy, không cài đè app, không ghi Keychain. Chi tiết kết quả: progress.md 2.6. Bộ công cụ (Go test máy chủ, probe Swift, script) lưu cạnh ghi chú của phiên; quy trình:
1. Postgres riêng: compose project khác (`studio-e2e-iso`), cổng `127.0.0.1:55449`, `tmpfs`, mật khẩu ngẫu nhiên. Không dùng `agent-studio-mini*`.
2. Studio PR: `git archive <commit>` vào thư mục tạm, thêm một test giữ máy chủ sống (fixture `internal/httpapi` như `TestManagedDesktopBrokerSDKEndToEnd`, model giả theo kịch bản, team/key TEST tổng hợp, `Workflow verify require`), `go test -c`, chạy binary với `STUDIO_TEST_DATABASE_URL` trỏ Postgres riêng. Cần: làm mới `provider_accounts.observed_at` mỗi vài chục giây, xả hộp thư `f.seen`, đưa usage event vào ledger (`settle`) để slot không kẹt.
3. Bộ: `node scripts/build-bundle.mjs --out <tạm>/bundle --pins <pins ba commit fix> --bundle-version 0.2.0-e2e --source provider=<clone> --source sandbox=<clone> --source harness=<clone>`; `doctor.ok` phải true.
4. Agent Watch: `git archive` commit PR, `swift build --product agentwatch`, biên dịch broker fixture (`scripts/studio-qa/StudioManagedBrokerFixture.swift`, key lấy từ `fixture.json` thay Keychain) và probe gọi `StudioManagedPiRuntime`. **Đặt broker và bộ dưới `$HOME`, không phải `/tmp`** (F3).
5. Chạy Pi đúng argv/env của `StudioManagedPiRuntime.launch` (`env -i`), thêm `-p "<việc>"`; hoặc chạy file `.command` trong pty cho TUI. Lấy mẫu `ps eww` và `lsof -i` để kiểm key và kết nối mạng.
6. Dọn: dừng máy chủ, `docker compose -p studio-e2e-iso down -v`, xóa thư mục tạm.

## Giới hạn đã biết của lần kiểm cách ly
- Model, connector, Studio là giả/đặt riêng; Keychain là file `fixture.json`; `managed-authorize` của broker fixture luôn trả 0 (chưa kiểm chấp thuận Keychain thật).
- Không bấm giao diện Agent Watch (đồng bộ `StudioSyncStore`, "Mở Terminal", "Sửa cài đặt"); không mở lại hội thoại cũ bằng `--session`.
- Review helper chưa chạy (lane tiny tắt review); chưa thử `helper_slots`, memory, Windows, Linux.
- Pi đổi process title ở TUI nên `ps` không đọc được argv/env của TUI.
