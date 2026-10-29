# Hợp đồng giữa ba package (v1, provider 2.1)

Ba package nói chuyện qua event bus của Pi (`pi.events`). Không package nào import code của package khác. Mọi payload mang `v` (số nguyên). Bản mới chỉ thêm trường; đổi nghĩa trường thì tăng `v`.

**Nguyên tắc:** token run (`as_run_...`) không bao giờ đi qua bus. Helper nhận một hàm `stream` đã gắn grant; lời gọi Studio đi qua provider.

Phía provider (đã cài, `piagent-provider/src/bus.mjs`, test ở `tests/bus.test.mjs`):

| Kênh | Hướng | Payload (v1) |
|---|---|---|
| `piagent:grant.request` | harness → provider | `{ v, role: 'scout'\|'research'\|'verify'\|'review', slot?, purpose, reply }`. Cần run đang mở. |
| (trả lời qua `reply`) | provider → harness | `{ v, ok, role, effort, models: [{ id, contextWindow, maxTokens, reasoning }], stream(context, options), error? }`. `stream` trả `AssistantMessageEventStream` của Pi, đã gắn grant và route của role. `error` là mã lỗi (`failure.mjs`). |
| `piagent:grant.close` | harness → provider | `{ v, role, slot? }` — đóng role helper (broker `close {role, slot}`). |
| `piagent:run.state` | provider → harness | `{ v, runId, capabilities: string[], team, scope: { studio_instance_id, dataset_epoch, auth_generation, key_id }, harness: { thinking: { allowed: string[], effort }, helperCalls: string[], bypassMode, protocol, features: string[], workflow, helperLimit? } }` — phát khi run bắt đầu và khi danh sách capability của Studio làm mới. `protocol` là phiên bản process report broker hỗ trợ (0 nếu không); `features` là `broker_features`; `workflow` là `harness.configuration.workflow` nguyên dạng (plan, verify, review, max_fix_loops, lanes, main_web_lookups) hoặc null; `helperLimit` chỉ có khi manifest có `helper_slots`. |
| `piagent:run.process` | harness → provider | `{ v, process }` — báo cáo process của run; provider gửi kèm `close` khi broker có `process`; chỉ dùng cho một run. |
| `piagent:studio.call` | harness → provider | `{ v, method: 'GET'\|'POST', path, role?, body?, reply }` → `reply({ v, ok, status, body })` (body đã che secret, tối đa 1 MiB). `path` chỉ được `/v1/...` hoặc `/studio/v1/managed/...` (không `..`, không `//`, không URL tuyệt đối). Dùng grant của `role` (mặc định `main`; helper như `review` hoặc `review#2` phải đang có grant, vd settle dùng token của helper). `ok` là HTTP ok; refused thì `ok:false`, `error`, không có `status`. Để harness gửi settle, tool failures, workspace, memory mà không cầm token. |
| `piagent:notice` | provider → mọi bên | `{ v, type, ... }` — `provider_ready`, `managed_studio_wait` (start/waiting/end), `managed_capacity_wait`. |

Phía sandbox (đã cài, `piagent-sandbox/src/index.mjs`, test ở `tests/sandbox-core-tools.test.mjs`, `tests/sandbox-permission-modes.test.mjs`); harness chốt ở 2.3:

| Kênh | Hướng | Payload (v1) |
|---|---|---|
| `piagent:tools.attest` | sandbox → harness | `{ v, tools: [{ name, source: 'piagent-sandbox' }] }` — phát ở `session_start` và mỗi `before_agent_start`; gồm 7 tool lõi và các tool duyệt/process. Harness vẫn nên kiểm `sourceInfo.path` (xem QUESTIONS 13). |
| `piagent:permission.mode` | sandbox → harness | `{ v, mode: 'ask'\|'full'\|'bypass' }` — phát khi khôi phục từ hội thoại (`session_start`) và mỗi lần đổi; Bypass bị rút lại thì phát `full`. |
| `piagent:run.state` | provider → harness, **sandbox cũng đọc** | chỉ đọc `harness.bypassMode === true` để cho phép `/bypass on`; không có thì Bypass bị từ chối (`managed-bypass-unavailable`). |

Đề xuất thêm từ harness 2.3 (additive, v1; provider/sandbox chưa xác nhận lúc viết):

| Kênh / trường | Hướng | Nội dung |
|---|---|---|
| `piagent:run.state` thêm | provider → harness | `capabilities: string[]` (danh sách Studio, ví dụ `memory`, `managed.settle.v1`); `scope: { studio_instance_id, dataset_epoch, auth_generation, key_id }` (outbox team memory); `team`; trong `harness`: `workflow { plan, verify, review, max_fix_loops, lanes, main_web_lookups }`, `helperLimit` (số, từ trường tùy chọn `helper_slots`; không có thì harness dùng 8), `features` (broker_features) |
| `piagent:studio.call` thêm | harness → provider | `role?` (`review`, `review#2`...): dùng token của helper đó. Settle `/v1/managed/settle` phải dùng token helper, không phải main |
| `piagent:tools.child` | harness → sandbox | `{ v, readOnly: true, commands, web, key, reply }` → `reply({ ok, tools: [ToolDefinition] })`: read, grep, find, ls (+ bash khi `commands`, project chỉ đọc, không mạng); không bao giờ edit/write |
| `piagent:tools.blocked` | harness → mọi bên | `{ v, bad: [{ name, found }] }` khi 7 tool lõi không đến từ sandbox |

Quy tắc kiểm `sourceInfo` (đo trên Pi 1.3.0 thật, `-e <file>`): `{ path: <đường dẫn tuyệt đối file vào>, source: 'cli' }`; tool built-in là `builtin:<tên>`. Sandbox tự khai `source: 'piagent-sandbox'`; harness chấp nhận khi một thư mục trong `path` tên đúng như vậy và cả 7 tool cùng một file. Thư mục của gói phải tên `piagent-sandbox`.

Khác với nháp v0: `grant.result` bỏ (kết quả đi qua `reply`, vì cần trả hàm `stream`); thêm `grant.close`, `run.process`, `studio.call`, `notice`.

## Ma trận version

| provider | harness | sandbox | bus |
|---|---|---|---|
| 0.x (2.1) | chưa | chưa | v1 |
| 0.x (2.1) | 0.x (2.3, feat/harness) | chưa (2.2) | v1 + đề xuất ở trên |
| 0.x (2.1) | chưa | 0.x (2.2) | v1 |

Thay đổi sau này ghi ở đây kèm ma trận version.

## Hợp đồng không qua bus

- Launcher (bundle) đặt agent dir riêng và `settings.json` với `enabledModels: ["studio/agent-watch-auto"]`; provider chỉ hoàn lại model khác bằng `model_select` nếu settings thiếu.
- Binding Agent Watch đọc từ `~/.pi/agent/agent-watch-managed.json` (chỉ đọc) hoặc `PIAGENT_BINDING`; log và state ghi ở `PI_CODING_AGENT_DIR`.
