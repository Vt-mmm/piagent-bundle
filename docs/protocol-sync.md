# Đồng bộ giao thức provider ↔ Agent Studio ↔ Agent Watch

Bảng này so sánh từng request thật của `piagent-provider` với code Studio (Go, `agent-studio` @ `0b24782`) và broker (Swift, `agentwatch` @ `536068a`) và với `studio-contract.md`. Nguồn bằng chứng: lần chạy thật 29/10/2026 trên mini qua broker Agent Watch (Studio local, key theo binding hiện có; chỉ đọc binding, agent dir tạm, `env -i`, không gọi Studio trực tiếp). Chống lệch về sau: `piagent-provider/tests/contract.test.mjs` + fixture đã che `tests/fixtures/real-wire.json` (chạy trong `npm test`, offline).

Quy ước: ✓ khớp và đã thấy trong lần chạy thật; ○ khớp theo code nhưng chưa chạy thật (chỉ Studio giả); ✗ lệch (đã sửa hoặc ghi ở mục "Lệch").

## 1. Chạy thật (bằng chứng, đã che)

Manifest của key (qua broker `config`): `thinking_levels = [medium]`, `broker_features = [process, process-v2, process-v3, close-retry, helper-slots]`, `helper_slots = 3`, models `claude-haiku-5-5`, `claude-opus-5-5`, `gpt-6-astra`, `gpt-6-luna`; `main` auto `[claude-opus-5-5, gpt-6-astra]` effort medium; `review` auto `[gpt-6-astra, gpt-6-luna]`; `scout` `[claude-haiku-5-5, gpt-6-luna]` effort low.

Định tuyến: 5 lần `start` (task_class simple/standard/complex, lặp lại) đều giao main cho `claude-opus-5-5`; `child review` luôn giao `gpt-6-astra` (Codex). Không có đường nào đưa main sang Codex mà không đổi cấu hình Harness (không được phép), nên **Codex được kiểm bằng grant `review`**, trên đúng wire Responses.

Một phiên (`real-run.mjs`, FakePi + provider + broker thật + Studio thật), cùng một session id:

| Lượt | Route | Kết quả |
|---|---|---|
| claude1 (tool call `get_time`) | claude / claude-opus-5-5, effort medium | `toolUse` rồi `stop`, có text đúng |
| claude2, claude3 | như trên, run mới mỗi lượt | `stop`, không `503 session_account_busy_retry_later` |
| codex (grant `review`, cả lịch sử Claude gồm thinking ký và tool call) | codex / gpt-6-astra, Responses, effort medium | `toolUse` rồi `stop` |
| claude4 (lịch sử có câu trả lời của Codex) | claude-opus-5-5 | `stop`, tóm tắt đúng cả hai |

8 request, tất cả HTTP 200 sau khi sửa; 5 entry `agent-watch-run … closed`; `as_run_` không có trong output, hội thoại, bus, file state, `process.env`.

## 2. Bảng request

| Request | Provider gửi | Studio/broker đọc | |
|---|---|---|---|
| Broker `config` | không tham số | `StudioManagedBrokerCommand.swift:90`; manifest + `broker_features` (`:29`) | ✓ |
| Broker `start` | `operation_id` (UUID mới), `effort` (`''` khi off), `task_class` | khóa hợp lệ `id, action, operation_id, effort, task_class, role, run_id, process, slot` (`:76`) | ✓ |
| Broker `renew` / `child` / `close` | `{role, slot?}`; `close` thêm `process?` | như trên | ✓ (`child review` chạy thật; `close` ghi `closed`) |
| Broker `recover` | không dùng | `:98` | ○ chưa làm (mở lại hội thoại có run `active`; việc của 2.x) |
| `POST /claude/v1/messages?beta=true` | `x-api-key: <token>`, `anthropic-version`, `anthropic-beta`, `X-Agent-Purpose`, `X-Agent-After`, `X-Claude-Code-Session-Id` (= id phiên Pi), `X-Session-Id` (= `role_id`), `User-Agent` | `rawKey` đọc `Authorization` hoặc `X-Api-Key` (`server.go:259`); header phiên cho phép `X-Claude-Code-Session-Id, X-Claude-Code-Agent-Id, Session-Id, Session_id, X-Session-Id` (`connectors/session.go:21`); purpose/after/task (`accesslog.go:154`) | ✓ |
| — body Claude | `model` (= `provider_model_id`), `messages`, `max_tokens`, `stream`, `system`, `tools`, `thinking` (adaptive), `output_config` | mức thinking hiện hành = `output_config.effort` của system message cuối trong `messages` (marker), `output_config` cấp trên chỉ là mặc định (`native/request.go:60-100`) | ✓ |
| — effort lệch run | provider luôn gửi mức của run (Pi `reasoning`; helper mặc định `grant.effort`) | `runs/auth.go:235`: model hoặc effort khác grant → `invalid_run_grant` | ✓ (xem Lệch 3) |
| `POST /v1/responses` (Codex) | `Authorization: Bearer <token>`, `session_id`, `x-client-request-id`, `X-Session-Id`, purpose headers | như trên; effort = `reasoning.effort` (`request.go:48`) | ✓ |
| — body Responses | `model`, `input`, `stream`, `prompt_cache_key`, `store:false`, `tools`, `reasoning{effort,summary}`, `include`; `service_tier:"priority"` khi Fast mode | `service_tier` ghi vào ledger (`ledger/served_tier.go`) | ✓ (service_tier ○) |
| `POST /openai/v1/chat/completions` (vendor) | `Authorization: Bearer`, purpose headers | effort không kiểm (`EffortUnverifiable`, `inference.go:206`) | ○ manifest của key không có vendor |
| `GET /v1/capabilities` | `Authorization: Bearer <token đã renew>`, `User-Agent`, `Accept` | `capabilities.go`: `capabilities.v1, managed.settle.v1, managed.workspace.v1/v2, requests.cancel.v1, managed.supersede.v1, search.v1, memory.vN, memory.ask.v1` | ✓ (xem Lệch 2) |
| `GET /v1/heartbeat` | không auth | `server.go:197`; header `X-Studio-Boot`, `X-Studio-Version` trên mọi trả lời (thấy trong lần chạy thật) | ○ (không tắt Studio dùng chung để thử) |
| `POST /studio/v1/managed/disconnects` | `Authorization: Bearer <run token>`, `{os, events[]}` | `server.go:346` (`employee("inference")`) | ○ |
| `POST /v1/requests/{id}/cancel` | token của role, body `{}`; id từ `X-Request-ID` | `server.go:331`; capability `requests.cancel.v1` | ○ (provider gọi không cần kiểm capability; 404 vô hại) |
| Gzip body > 64 KiB | `Content-Encoding: gzip` sau khi thấy `X-Studio-Accept-Encoding: gzip` | `AcceptEncodingHeader` (`inference.go:53`); Studio trả header này (thấy thật) | ✓ phản hồi, ○ gửi gzip thật |
| `User-Agent` | `piagent/<version>` | `clients/service.go:190`: mẫu `pi(-coding-agent|agent)?/<semver>` | ✗→✓ (Lệch 1) |
| Session id cố định | `X-Claude-Code-Session-Id` = id phiên Pi qua mọi lượt; helper không gửi | `connectors/session.go`; ledger gắn hội thoại vào một tài khoản | ✓ (3 lượt liên tiếp, 2 wire, không 503) |

## 3. Lệch đã tìm ra

1. **User-Agent.** Bản đầu gửi `piagent-provider/<v>`; mẫu của Studio (`pi` + `agent` tùy chọn + `/semver`) không khớp, Studio sẽ ghi tool là `other` không có version. Sửa ở provider: `piagent/<v>` (như Piagent cũ). Có test khớp mẫu của Studio.
2. **`/v1/capabilities` bằng token của `start`.** Lần chạy thật đầu trả `401 invalid_run_grant`: lần `renew` đầu thay token của `start`. Sửa ở provider: hỏi capabilities bằng token vừa renew ở `turn_start` (test `contract.test.mjs`).
3. **Mã lỗi gây hiểu nhầm (cần Studio, chỉ ghi).** Một request có thinking khác effort của run (ví dụ thinking tắt khi run `medium`) bị `401 invalid_run_grant` (`runs/auth.go:235`), giống hệt token hết hạn. Provider đã tránh (luôn gửi mức của run) nhưng Studio nên trả mã riêng (ví dụ `thinking_level_mismatch`), thêm mã mới thì client cũ vẫn coi là lỗi chung. Không đổi giao thức phá bản cũ; chờ owner quyết.
4. **Stream của helper mặc định không có mức thinking.** Harness gọi `stream` không truyền `reasoning` nên bị mục 3. Sửa ở provider: mặc định `reasoning = grant.effort`.
5. **Tên model ở footer Pi** là id `agent-watch-auto` (QUESTIONS 5), không phải lệch giao thức.

## 4. Chưa kiểm được

- Vendor (Chat Completions): key này không có model vendor; chỉ Studio giả.
- Studio tắt/bật thật, `disconnects` thật, `cancel` thật, gzip thật: cần làm gián đoạn một Studio dùng chung; chỉ Studio giả.
- Main route sang Codex: Harness của key không cho (xem mục 1).
- `recover`, `child` slot ≥ 2, `helper_slots` > 1 thật.
