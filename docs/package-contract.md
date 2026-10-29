# Hợp đồng giữa ba package (v1, thống nhất ở bước 2.5)

Ba package nói chuyện qua event bus của Pi (`pi.events`). Không package nào import code của package khác. Mọi payload mang `v` (số nguyên). Bản mới chỉ thêm trường; đổi nghĩa trường thì tăng `v`. Một yêu cầu mang `reply`; bên trả lời gọi `reply` đúng một lần.

**Nguyên tắc:** token run (`as_run_...`) không bao giờ đi qua bus. Helper nhận một hàm `stream` đã gắn grant; lời gọi Studio đi qua provider.

Bản này thay các bản nháp ở 2.1 (provider), 2.2 (sandbox) và 2.3 (harness). Mục "đề xuất" của 2.3 đã được hai phía kia cài và chạy thật (xem "Kiểm hợp đồng"); không còn đề xuất nào treo.

## 1. Kênh

| Kênh | Hướng | Payload (v1) |
|---|---|---|
| `piagent:grant.request` | harness → provider | `{ v, role: 'scout'\|'research'\|'verify'\|'review', slot?, purpose?, reply }`. Cần run đang mở. `purpose` tùy chọn (harness chưa gửi; provider bỏ qua). |
| (trả lời qua `reply`) | provider → harness | `{ v, ok, role, effort, models: [{ id, contextWindow, maxTokens, reasoning }], stream(context, options), error? }`. `stream` trả `AssistantMessageEventStream` của Pi, đã gắn grant (broker `child`) và route của role. `error` là mã lỗi (`failure.mjs`). |
| `piagent:grant.close` | harness → provider | `{ v, role, slot? }` — đóng role helper (broker `close {role, slot}`). |
| `piagent:run.state` | provider → harness, **sandbox cũng đọc** | `{ v, runId, capabilities: string[], team, scope: { studio_instance_id, dataset_epoch, auth_generation, key_id }, harness: { thinking: { allowed: string[], effort }, helperCalls: string[], bypassMode, protocol, features: string[], workflow, helperLimit? } }`. `runId` là `null` khi phát lúc mở phiên. `protocol` là phiên bản process report broker hỗ trợ (0 nếu không); `features` là `broker_features`; `workflow` là `harness.configuration.workflow` nguyên dạng hoặc `null`; `helperCalls` là các role helper Harness có; `helperLimit` chỉ có khi manifest có `helper_slots`. Sandbox chỉ đọc `harness.bypassMode === true` (cho `/bypass on`). |
| `piagent:run.process` | harness → provider | `{ v, process }` — báo cáo process của run; provider gửi kèm `close` khi broker có `process`; chỉ một run. |
| `piagent:studio.call` | harness → provider | `{ v, method: 'GET'\|'POST', path, role?, body?, reply }` → `reply({ v, ok, status, body })` (body đã che secret, tối đa 1 MiB). `path` chỉ `/v1/...` hoặc `/studio/v1/managed/...` (không `..`, không `//`, không URL tuyệt đối). `role` mặc định `main`; helper (`review`, `review#2`) phải đang có grant: settle dùng token của helper. `ok` là HTTP ok; refused thì `ok:false`, `error`, không có `status`. |
| `piagent:notice` | provider → mọi bên | `{ v, type, ... }` — `provider_ready`, `managed_studio_wait` (start/waiting/end), `managed_capacity_wait`. |
| `piagent:tools.attest` | sandbox → harness | `{ v, tools: [{ name, source: 'piagent-sandbox' }] }` — phát ở `session_start` và mỗi `before_agent_start`; gồm 7 tool lõi và các tool duyệt/process. |
| `piagent:permission.mode` | sandbox → harness | `{ v, mode: 'ask'\|'full'\|'bypass' }` — khi khôi phục từ hội thoại và mỗi lần đổi; Bypass bị rút lại thì phát `full`. |
| `piagent:tools.child` | harness → sandbox | `{ v, readOnly: true, commands, web, key, reply }` → `reply({ v, ok, tools: [ToolDefinition] })`: read, grep, find, ls (+ bash khi `commands`: project chỉ đọc, không mạng); không bao giờ edit/write. Sandbox giữ một boundary chỉ đọc cho mỗi `key`; gọi lại cùng `key` thì thay boundary cũ. |
| `piagent:tools.child.close` | harness → sandbox | `{ v, key }` — bỏ boundary của helper. Harness phát khi helper đóng và khi helper không khởi động được (từ 2.5; trước đó boundary rò). |
| `piagent:tools.blocked` | harness → mọi bên | `{ v, bad: [{ name, found }] }` khi 7 tool lõi không đến từ sandbox. |

## 2. Thứ tự nạp và thời điểm (đo trên Pi 1.3.0 thật ở 2.5, chạy lại trên Pi 1.4.0 ở 2.7: không đổi)

Bộ nạp theo thứ tự `harness`, `sandbox`, `provider` (`launchPlan`; Agent Watch dùng cùng thứ tự). Handler cùng sự kiện chạy theo thứ tự nạp. Hệ quả đã sửa và là một phần của hợp đồng:

- **Provider phát `run.state` ngay ở `session_start`** (từ manifest, `runId: null`), vì `before_agent_start` của harness chạy trước khi provider mở run. Không có điều này tin nhắn đầu của phiên chạy không có cổng hoàn tất. Provider phát lại khi run bắt đầu và khi danh sách capability của Studio làm mới (`capabilities` đầy đủ chỉ có từ đó).
- **Harness kiểm tập tool trước run đầu tiên** (`before_agent_start`, và trước tool call đầu nếu chưa kiểm), không kiểm ở `session_start`: sandbox nạp sau harness và chỉ attest ở `session_start` của chính nó.
- **Báo cáo `managed_toolset_untrusted` gửi qua `studio.call`**, cần run đang mở; ở `before_agent_start` đầu chưa có run, nên harness thử lại ở tool call bị chặn đầu tiên và chỉ đánh dấu "đã báo" khi Studio trả `ok`.
- **Tên tool trùng.** Pi 1.3.0 từ chối khởi động nếu hai extension đăng ký cùng tên tool lúc nạp (`Tool "bash" conflicts with ...`). Đăng ký lúc chạy (ở `session_start`) thì extension nạp trước thắng: extension nạp trước sandbox có thể chiếm `bash`; khi đó `getAllTools()` cho `sourceInfo.path` của extension đó và harness chặn mọi tool call. Extension nạp sau sandbox không chiếm được.

Quy tắc kiểm `sourceInfo`: nạp bằng `-e <thư mục>` cho `{ path: <file vào của package>, source: 'cli' }`; tool dựng sẵn là `builtin:<tên>`. Sandbox tự khai `source: 'piagent-sandbox'`; harness chấp nhận khi một thư mục trong `path` tên đúng như vậy và cả 7 tool cùng một file. **Thư mục của gói phải tên `piagent-sandbox`** (build-bundle làm đúng).

## 3. Ngoài bus

- **Binding.** Launcher đặt `AGENT_WATCH_MANAGED_BINDING=<file>` (Agent Watch `runtime = pi` ghi `agent-watch-managed-pi.json`; test của provider dùng `PIAGENT_BINDING`, thắng khi cả hai có). Không có biến nào thì provider đọc `~/.pi/agent/agent-watch-managed.json` (chỉ đọc; chỉ cho cài Pi gốc kiểu cũ). Binding của runtime `pi` không có `model`; nếu có phải là `agent-watch-auto`. Provider không bao giờ ghi binding.
- **Agent dir.** Launcher đặt `PI_CODING_AGENT_DIR` và `PI_CODING_AGENT_SESSION_DIR` riêng, và `settings.json` có `enabledModels: ["studio/agent-watch-auto"]`, `retry.maxRetries` (`prepareAgentDir`). Provider chỉ hoàn lại model khác bằng `model_select` nếu settings thiếu.
- **Môi trường.** Ngoài ba biến trên, `launchPlan.env` đặt `PI_OFFLINE=1`, `PI_TELEMETRY=0`, `PI_SKIP_VERSION_CHECK=1`: Pi không tự gọi mạng (telemetry cài đặt, kiểm bản mới trên pi.dev, làm mới catalog); chỉ Studio qua provider. Launcher nào tự dựng env (Agent Watch) phải đặt đủ.
- **Bố cục bộ** (`scripts/build-bundle.mjs`): `manifest.json`; `pi/` là một project npm (`package.json` + `package-lock.json` ghim Pi 1.4.0, `npm ci --ignore-scripts`) với `bin/pi` (file Node nạp `dist/bundle/cli.js` của Pi trong `pi/node_modules`); ba package ở `pi/packages/piagent-{harness,sandbox,provider}`. Package nằm trong `pi/` vì chúng nạp `@earendil-works/*` bằng `import()` thường mà Pi không đặt bí danh cho; Node tìm được chúng nhờ `pi/node_modules` là tổ tiên. Hệ quả: hash của phần `pi` bao cả ba package (thêm một lớp kiểm), và mỗi package vẫn có hash riêng. Package không có `dependencies` và không có script cài đặt (build từ chối).
- **Launch plan.** `command = <pi>/bin/pi` (file Node; người gọi chạy bằng Node đã ghim), `args = --no-extensions -e harness -e sandbox -e provider -e builtin:mcp`.

## 4. Kiểm hợp đồng

- Từng package: test bus giả của chính nó (`tests/bus.test.mjs` ở provider, `tests/sandbox-child-tools.test.mjs`, `tests/harness-review-helper.test.mjs`...).
- Cả ba cùng nhau trên Pi 1.4.0 thật (1.3.0 ở 2.5): `piagent-bundle/tests/e2e/company.e2e.test.mjs` (probe ghi lại bus và `sourceInfo`), kiểm payload gửi Studio bằng `tests/e2e/helpers/contract.mjs` (luật trong `studio-contract.md` mục 3.4 và 5; có test riêng `tests/e2e-contract.test.mjs`).

## 5. Ma trận version

| bundle | provider | harness | sandbox | bus |
|---|---|---|---|---|
| 0.x (2.5, Pi 1.3.0) | `feat/provider` ở commit đã ghim | `feat/harness` ở commit đã ghim | `feat/sandbox` ở commit đã ghim | v1 (bản này) |
| 0.2.0 (2.7, Pi 1.4.0, `bundle.pins.json`) | `92c341c` | `1c4299f` | `24a9a39` | v1 (không đổi) |

Thay đổi sau này ghi ở đây kèm ma trận version.
