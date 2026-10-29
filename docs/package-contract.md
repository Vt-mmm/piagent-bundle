# Hợp đồng giữa ba package (v1, provider 2.1)

Ba package nói chuyện qua event bus của Pi (`pi.events`). Không package nào import code của package khác. Mọi payload mang `v` (số nguyên). Bản mới chỉ thêm trường; đổi nghĩa trường thì tăng `v`.

**Nguyên tắc:** token run (`as_run_...`) không bao giờ đi qua bus. Helper nhận một hàm `stream` đã gắn grant; lời gọi Studio đi qua provider.

Phía provider (đã cài, `piagent-provider/src/bus.mjs`, test ở `tests/bus.test.mjs`):

| Kênh | Hướng | Payload (v1) |
|---|---|---|
| `piagent:grant.request` | harness → provider | `{ v, role: 'scout'\|'research'\|'verify'\|'review', slot?, purpose, reply }`. Cần run đang mở. |
| (trả lời qua `reply`) | provider → harness | `{ v, ok, role, effort, models: [{ id, contextWindow, maxTokens, reasoning }], stream(context, options), error? }`. `stream` trả `AssistantMessageEventStream` của Pi, đã gắn grant và route của role. `error` là mã lỗi (`failure.mjs`). |
| `piagent:grant.close` | harness → provider | `{ v, role, slot? }` — đóng role helper (broker `close {role, slot}`). |
| `piagent:run.state` | provider → harness | `{ v, runId, harness: { thinking: { allowed: string[], effort }, helperCalls: string[], bypassMode, protocol } }` — phát khi run bắt đầu. `protocol` là phiên bản process report broker hỗ trợ (0 nếu không). |
| `piagent:run.process` | harness → provider | `{ v, process }` — báo cáo process của run; provider gửi kèm `close` khi broker có `process`; chỉ dùng cho một run. |
| `piagent:studio.call` | harness → provider | `{ v, method: 'GET'\|'POST', path, body?, reply }` → `reply({ v, ok, status, body })` (body đã che secret, tối đa 1 MiB). `path` chỉ được `/v1/...` hoặc `/studio/v1/managed/...` (không `..`, không `//`, không URL tuyệt đối). Dùng grant main. Để harness gửi settle, tool failures, workspace, memory mà không cầm token. |
| `piagent:notice` | provider → mọi bên | `{ v, type, ... }` — `provider_ready`, `managed_studio_wait` (start/waiting/end), `managed_capacity_wait`. |

Phía sandbox/harness (nháp, chốt ở 2.2/2.3):

| Kênh | Hướng | Payload (v1) |
|---|---|---|
| `piagent:tools.attest` | sandbox → harness | `{ v, tools: [{ name, source }] }` — để harness kiểm `sourceInfo` |
| `piagent:permission.mode` | sandbox → harness | `{ v, mode: 'ask'\|'full'\|'bypass' }` |

Khác với nháp v0: `grant.result` bỏ (kết quả đi qua `reply`, vì cần trả hàm `stream`); thêm `grant.close`, `run.process`, `studio.call`, `notice`.

## Ma trận version

| provider | harness | sandbox | bus |
|---|---|---|---|
| 0.x (2.1) | chưa | chưa | v1 |

Thay đổi sau này ghi ở đây kèm ma trận version.

## Hợp đồng không qua bus

- Launcher (bundle) đặt agent dir riêng và `settings.json` với `enabledModels: ["studio/agent-watch-auto"]`; provider chỉ hoàn lại model khác bằng `model_select` nếu settings thiếu.
- Binding Agent Watch đọc từ `~/.pi/agent/agent-watch-managed.json` (chỉ đọc) hoặc `PIAGENT_BINDING`; log và state ghi ở `PI_CODING_AGENT_DIR`.
