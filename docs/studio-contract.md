# Hợp đồng giao tiếp Agent Studio / Agent Watch của company mode

Tài liệu này liệt kê mọi giao diện mà code `managed/` của Piagent (company mode)
đang dùng để nói chuyện với Agent Watch (broker) và Agent Studio (HTTP), để bản
viết lại trên stock Pi có thể được kiểm thử đối chiếu. Chỉ đọc code, không chạy
mạng, không đọc secret. Mọi giá trị ví dụ là giá trị giả.

## 0. Phạm vi, nguồn, quy ước trích dẫn

Phiên bản nguồn: Piagent `1.47.0` (worktree `piagent-strict-handoff`, commit
`8d30e016`); Agent Studio memory protocol `4` (`memory/quality.go:20`); Agent Watch
macOS (Swift). Cổng Windows của Agent Watch không được đọc (xem mục 10).

Tiền tố trích dẫn (đường dẫn tương đối từ thư mục gốc từng repo):

| Tiền tố | Thư mục |
|---|---|
| `M/` | `piagent-strict-handoff/packages/piagent-core/managed/` |
| `R/` | `piagent-strict-handoff/packages/piagent-core/runtime/` |
| `P/` | `piagent-strict-handoff/` (gốc repo Piagent: `scripts/`, `tests/`, `packages/`) |
| `W/` | `agentwatch/Sources/AgentWatchCore/` |
| `S/` | `agent-studio/internal/httpapi/` |
| `SI/` | `agent-studio/internal/` (các package khác) |

Ký hiệu `file:N` là số dòng của file nguồn tại thời điểm đọc.

Ba thành phần và hai kênh:

```
Piagent (Node, managed/)  --stdio JSONL-->  Agent Watch broker (Swift, "managed-broker")
        |                                           |
        | HTTP trực tiếp bằng run token             | HTTP bằng device token / member key
        v                                           v
                       Agent Studio (Go, internal/httpapi)
```

- Kênh 1 (broker, mục 2): Piagent KHÔNG bao giờ giữ member key. Nó hỏi broker xin
  grant (run token), rồi dùng grant đó gọi Studio trực tiếp.
- Kênh 2 (HTTP, mục 3): suy luận model, memory, search, settle, báo cáo tool lỗi,
  workspace, disconnect, heartbeat, capabilities, cancel.
- Binding file (mục 8) nói cho launcher biết broker nào, Node nào, entrypoint nào,
  origin nào.

## 1. Tóm tắt các điểm cần giữ khi viết lại

1. Grant (run token) sống ngắn (khoảng 2 phút, `M/tool-failures.mjs:52`); mỗi
   request model phải `renew` trước. Mỗi `renew` thay token của role đó và vô
   hiệu token cũ, nên các request song song cùng role phải chia sẻ một lần renew
   (`M/grant-share.mjs:6-14`, hạn chia sẻ 60 giây).
2. `fence` của grant chỉ tăng; broker từ chối renew nếu `fence` không tăng hoặc
   model/profile đổi (`W/StudioManaged.swift:229-236`).
3. Studio chỉ chấp nhận request model nếu có run token, không chấp nhận member
   key (`run_grant_required`, `S/managed.go`, `S/inference.go` `inferenceError`).
4. Mọi lỗi Studio có dạng `{"error":{"code","message","request_id"}}`
   (`S/server.go:102-119`); client suy ra mã lỗi từ chuỗi lỗi, xem mục 7.
5. Tính năng mới chỉ dùng khi Studio liệt kê tên capability (mục 6); Studio cũ
   trả 404 nghĩa là "không có gì".

## 2. Broker (stdio JSON lines)

### 2.1 Khởi chạy và framing

- Lệnh: `<broker> managed-broker --profile <profile_id 64 hex>`;
  `broker` phải là đường dẫn tuyệt đối đã `realpath`, `profile_id` khớp
  `^[a-f0-9]{64}$`, nếu không ném `managed-broker-binding-invalid`
  (`M/broker-client.mjs:11-12`). Phía Swift kiểm tra tương tự
  (`W/StudioManagedBrokerCommand.swift:47`).
- Môi trường con: `PATH=/usr/bin:/bin`, `LANG=en_US.UTF-8`, cộng biến WSL
  (`WSL_INTEROP`, `WSL_DISTRO_NAME`) nếu có (`M/broker-client.mjs:13`,
  `M/store.mjs:21-23`).
- Một dòng JSON mỗi message, kết thúc `\n`, UTF-8.
- Request (Piagent -> broker): `{...args, id, action}` với `id` là UUID ngẫu nhiên
  (`M/broker-client.mjs:44-47`). Broker từ chối khóa ngoài tập
  `id, action, operation_id, effort, task_class, role, run_id, process, slot`
  (`W/StudioManagedBrokerCommand.swift:76`), `id` phải là UUID (`:74`).
- Response (broker -> Piagent): `{"id":"<uuid>","result":<json>}` hoặc
  `{"id":"<uuid>","error":"<coarse>","studio_code":"<studio reason>"}`
  (`W/StudioManagedBrokerCommand.swift:50-56`). `studio_code` chỉ có khi Studio
  trả mã lý do hợp lệ `^[a-z0-9_]{1,64}$` (`W/StudioManaged.swift:99-107`).
- Phía Piagent:
  - các request được xếp hàng tuần tự (`#tail`, `M/broker-client.mjs:42,49`);
  - timeout 25 giây mỗi request: kill broker và ném `managed-broker-timeout`
    (`:45`);
  - bộ đệm đọc quá 2 MiB: kill, `managed-broker-disconnected` (`:21`);
  - dòng không parse được hoặc `id` lạ: kill (`:27,37`);
  - lỗi được dựng thành `Error("managed-broker:" + error đã bỏ ký tự ngoài [A-Za-z_], tối đa 80)`
    và gắn `error.studioCode` nếu hợp lệ (`:32-33`);
  - `dispose()` gửi `close` rồi kill (`:51-55`).
- Phía Swift: request tối đa 65 536 byte, vượt thì in `{"id":"","error":"broker_request_too_large"}`
  rồi thoát (`W/StudioManagedBrokerCommand.swift:68`); action đầu tiên bắt buộc là
  `config` (broker chưa enroll), nếu không `permissionDenied` (`:80`); action lạ
  `permissionDenied` (`:106`); lỗi khác `broker_failed` (`:110`).

### 2.2 Giá trị `error` thô của broker (`StudioError.rawValue`)

`invalidOrigin, invalidKey, incompatibleVersion, invalidResponse, redirectDenied,
permissionDenied, quotaExceeded, rateLimited, serverUnavailable,
upstreamUnavailable, offline, storage, keychainApprovalRequired, identityChanged,
disconnectFirst` (`W/StudioClient.swift:4-7`), cộng `broker_failed` và
`broker_request_too_large`. Piagent thấy chúng dưới dạng `managed-broker:<giá trị>`.

Ánh xạ HTTP -> `error` ở broker (`W/StudioManaged.swift:152-168`): 3xx
`redirectDenied`; 401 `invalidKey`; 403 `permissionDenied`; 409
`identityChanged`; 429 `rateLimited`; 400 `invalidResponse`; mọi mã khác
(kể cả 404 và 5xx) `serverUnavailable`; lỗi transport `offline`; 200/201 phải có
`Content-Type: application/json` nếu không `invalidResponse`; 204 là body rỗng.
Timeout mỗi request broker -> Studio: 20 giây (`:140`).

### 2.3 Các action

Bảng tổng hợp (chi tiết từng action bên dưới):

| action | Tham số request | Result | Gọi Studio |
|---|---|---|---|
| `config` | không | manifest + `broker_features` | lần đầu: `GET /studio/v1/client-config` rồi `POST /studio/v1/managed/devices`; các lần sau trả bản đã cache |
| `start` | `operation_id`, `effort`, `task_class` | grant `role:"main"` | `POST /studio/v1/managed/runs` |
| `child` | `role`, `slot?` | grant helper | `POST /studio/v1/managed/runs/{run}/children` |
| `renew` | `role`, `slot?` | grant mới | `POST /studio/v1/managed/roles/{role_id}/renew` |
| `recover` | `run_id` | grant `role:"main"` | `POST /studio/v1/managed/runs/{run}/recover` |
| `close` | `role?`, `slot?`, `process?` | `true` | `POST /studio/v1/managed/runs/{run}/close` |

Nguồn dispatch: `W/StudioManagedBrokerCommand.swift:89-107`. Phía Piagent gọi:
`M/session.mjs:101,161,220,222,354`, `M/grant-share.mjs:10`,
`M/helper-run.mjs:69,131,135`, `M/studio-link.mjs:280`,
`P/scripts/piagent-studio.mjs:88,161`, `M/doctor.mjs:113`.

#### `config`

- Request: `{"id":"…","action":"config"}`.
- Lần đầu trong một tiến trình broker: lấy member key từ Keychain (không tương
  tác), `GET /studio/v1/client-config`, kiểm tra manifest, yêu cầu có `harness`,
  rồi `POST /studio/v1/managed/devices` với `{"installation_id":"<uuid
  thường>"}` để lấy device token (`W/StudioManaged.swift:188-197`). Lỗi ở
  bước này là lỗi của `config`.
- Result: manifest (JSON) cộng `broker_features` (mảng chuỗi). Piagent chấp nhận
  khi `usable()` (`M/session.mjs:61-64`): `schema_version === 2`,
  `credential_mode === "managed"`, có `authority`, có `harness`; ngược lại ném
  `managed-configuration-unavailable`.
- Trường manifest mà Piagent đọc (nguồn server `SI/ledger/client_config.go:21-38`,
  nguồn broker `W/StudioManifest.swift:26-49`; Swift mã hóa lại bằng schema cố
  định nên trường lạ bị bỏ, xem `S/capabilities.go:17`):

| Trường | Kiểu | Dùng ở |
|---|---|---|
| `schema_version` | int, phải `2` | `M/session.mjs:62` |
| `credential_mode` | `"managed"` | `M/session.mjs:62` |
| `revision` | string | binding `configuration_revision` (`W/StudioManagedConfiguration.swift:84`) |
| `authority.studio_instance_id`, `authority.dataset_epoch` (UUID), `authority.auth_generation` (int > 0) | | `sameAuthority` (`M/session.mjs:54`), `memoryScope` (`M/memory-outbox.mjs:9-14`) |
| `key_id`, `key_label`, `key_prefix` | string | scope, doctor (`M/doctor.mjs:116`) |
| `user.id` (UUID), `user.display_name`, `user.role`, `user.active`, `user.version`, `user.team_id`, `user.team_name` | | `user.id` định danh member (`M/store.mjs:28-31`, `M/session.mjs:55`) |
| `org_id`, `expires_at`, `refresh_seconds` | | broker kiểm tra `expires_at > now` (`W/StudioManifest.swift:59`) |
| `models[]`: `id`, `display_name`, `owned_by` (`claude` / `codex` / id vendor), `protocol` (`messages` / `responses` / `chat`), `provider_model_id`, `max_output_tokens?`, `context_mode` (phải `provider_default`) | | `verifyGrant` (`M/session.mjs:81-82`), `installModel` (`:377-405`) |
| `thinking_levels[]` | tập con của `off, minimal, low, medium, high, xhigh, max` | `M/capabilities.mjs:11-20`, `M/session.mjs:219` |
| `harness.id`, `harness.team_id`, `harness.revision` | | broker xác thực (`W/StudioManaged.swift:51-56`) |
| `harness.configuration.main` / `scout` / `research` / `verify` / `review` = `{mode: "fixed"\|"auto", model_ids[1..20], effort?}` | | `M/session.mjs:111`, `M/helper-roles.mjs` |
| `harness.configuration.workflow` = `{plan, verify, review ∈ off\|suggest\|require, max_fix_loops 0..3}` | | `workflowPolicy` (`M/workflow.mjs`), điều kiện gửi process report |
| `harness.configuration.fast_mode` (bool) | | `M/fast-mode.mjs:12` |
| `harness.configuration.bypass_mode` (bool; chỉ `true` mới bật Bypass) | | `M/permission.mjs` |
| `process_versions[]` | ví dụ `[1,2,3]` | quyết định `process-vN` trong `broker_features` |
| `helper_slots` | int | CodingKey có trong Swift (`W/StudioManifest.swift:48`) nhưng Studio hiện hành không phát (mục 10) |
| `codex_catalog` | JSON | broker giữ, Piagent không đọc |

- `broker_features` (`W/StudioManagedBrokerCommand.swift:29-30`): luôn có
  `"process"` và `"close-retry"`; thêm `"process-v2"` / `"process-v3"` nếu
  `process_versions` chứa 2 / 3; thêm `"helper-slots"` nếu `helper_slots >= 2`.
  Piagent đọc ở `M/session.mjs:299-300`, `M/studio-link.mjs:281`,
  `M/helper-run.mjs:75`.
- Request tới Studio: `GET /studio/v1/client-config` với `Authorization: Bearer
  <member key>`, `Accept: application/json`, `User-Agent: AgentWatch/<ver>`,
  `X-Studio-Client-Features: api-vendors`, tùy chọn `If-None-Match: "<revision>"`
  (`W/StudioClient.swift:222-247`). Trả 304 thì dùng bản trước; 401
  `invalidKey`, 403 `permissionDenied`, 404 `incompatibleVersion`, 429
  `rateLimited`.
- Piagent còn gọi `config` ở nhiều nơi: lúc mở session (`M/session.mjs:101`,
  retry tối đa 3 lần với lỗi BUSY), khi enroll lại (`:354`), để lấy `user.id` khi
  chọn store (`P/scripts/piagent-studio.mjs:88`), trong `--doctor`
  (`M/doctor.mjs:113`).

#### `start`

- Request: `{"action":"start","operation_id":"<uuid>","effort":"<level|''>","task_class":"simple|standard|complex"}`
  (`M/session.mjs:220`; `effort` là `''` khi thinking là `off`; `operation_id` là
  `randomUUID()` mới mỗi lần, dùng làm idempotency key của Studio).
- Broker kiểm tra: chưa có run đang mở (`root == nil`), `effort` thuộc
  `["", off, minimal, low, medium, high, xhigh, max]`, `task_class` thuộc
  `[simple, standard, complex]`, nếu không `permissionDenied`
  (`W/StudioManaged.swift:199`).
- Studio: `POST /studio/v1/managed/runs` body `{operation_id, effort, task_class}`
  (`S/managed.go:63-76`), xác thực bằng device token (Bearer). Studio dựng route
  cho mọi role từ harness, 201 trả grant (`S/managed.go:130`).
- Result: grant (mục 2.4), `role: "main"`. Piagent gọi `verifyGrant`; nếu fail thì
  `close` rồi ném (`M/session.mjs:221-223`).
- Lỗi Studio có thể gặp: 409 `harness_model_unsupported`, 503
  `harness_route_unavailable`, 409 `harness_profile_unavailable`, 400
  `thinking_level_unavailable` (`S/managed.go:117-121,309-350`).

#### `child`

- Request: `{"action":"child","role":"scout|research|verify|review","slot":<1..3>?}`
  (`slot` bỏ khi là 1; `M/grant-share.mjs:23-26`).
- Broker: yêu cầu có run gốc, chưa có grant cho khóa `role` (hoặc `role#slot`),
  `slot` trong 1..3 và `slot == 1` hoặc `helper_slots >= slot`
  (`W/StudioManaged.swift:210-221`).
- Studio: `POST /studio/v1/managed/runs/{run_id}/children` body `{role}` (kèm
  `slot` khi lớn hơn 1) (`S/managed.go:169-201`; broker tại
  `W/StudioManaged.swift:215-217`). Lỗi: 429 `helper_capacity_exhausted`,
  429 `helper_run_limit_reached`.
- Result: grant của helper, `run_id` trùng run gốc.

#### `renew`

- Request: `{"action":"renew","role":"<main|helper>","slot":<n>?}`
  (`M/grant-share.mjs:10`).
- Studio: `POST /studio/v1/managed/roles/{role_id}/renew` body `{"fence":<fence cũ>}`
  (`S/managed.go:204-219`; `W/StudioManaged.swift:232`).
- Broker kiểm tra grant mới: `run_id`, `role_id`, `role` giữ nguyên, `fence`
  tăng ngặt, `model_id`, `provider_model_id`, `profile_id` giữ nguyên; sai thì
  `identityChanged` (`W/StudioManaged.swift:234-235`).
- Mỗi lần renew thay token cũ. Piagent gọi renew trước mọi request model
  (`M/request-stream.mjs:70`), mọi lần search, mọi lần gọi memory.

#### `recover`

- Request: `{"action":"recover","run_id":"<uuid>"}`; chỉ dùng khi mở lại
  conversation có entry `agent-watch-run` ở trạng thái `active`
  (`M/session.mjs:154-164`).
- Studio: `POST /studio/v1/managed/runs/{run_id}/recover` body `{}`
  (`S/managed.go:246-260`). Broker yêu cầu `root == nil` và grant trả về có
  `role == "main"` và `run_id` khớp (`W/StudioManaged.swift:222-228`).
- Recover chỉ xoay fence, không phát lại prompt. Lỗi bất kỳ -> Piagent ghi
  `agent-watch-run {state: "abandoned"}` và conversation vẫn dùng được
  (`M/session.mjs:163`). Mã 409 `run_recovery_pending_usage` có trong bảng lỗi.

#### `close`

- Request: `{"action":"close","role":"<''|main|helper>","slot":<n>?,"process":{…}?}`.
  `role` rỗng hoặc `main` là đóng cả run; helper đóng riêng role đó.
  `process` chỉ hợp lệ khi đóng cả run (mục 5).
- Studio: `POST /studio/v1/managed/runs/{run_id}/close` body `{role, slot?, process?}`,
  trả 204 (`S/managed.go:221-244`). `process` chỉ được broker đưa vào body khi
  harness có `workflow` (`W/StudioManaged.swift:255`).
- Result: `true`.
- Retry: broker giữ `unconfirmed` run khi close thất bại (trừ khi lỗi là
  `invalidResponse`, tức báo cáo bị từ chối) để lần `close` sau tới được Studio
  (`W/StudioManaged.swift:249,262-266`). Tính năng này được quảng bá là
  `close-retry`; nếu thiếu, Piagent coi close thất bại là "chưa gửi"
  (`M/studio-link.mjs:278-287`).
- Piagent đóng run ở cuối mỗi round (`M/session.mjs:295-303`) và đóng role helper
  sau mỗi attempt (`M/helper-run.mjs:68-71,203`).

### 2.4 Grant (run token) do `start` / `child` / `renew` / `recover` trả về

Server (`SI/runs/service.go:19-32`) và broker (`W/StudioManaged.swift:68-88`):

```json
{
  "studio_instance_id": "00000000-0000-4000-8000-000000000001",
  "dataset_epoch":      "00000000-0000-4000-8000-000000000002",
  "auth_generation":    1,
  "run_id":   "00000000-0000-4000-8000-0000000000a1",
  "role_id":  "00000000-0000-4000-8000-0000000000b1",
  "role":     "main",
  "model_id": "claude-sonnet-5-5",
  "provider": "claude",
  "provider_model_id": "claude-sonnet-5-5",
  "effort":   "medium",
  "fence":    3,
  "token":    "as_run_<role_id>_<43 ký tự base64url>",
  "expires_at": "2026-01-01T00:00:00Z",
  "profile_id": "00000000-0000-4000-8000-0000000000c1",
  "slot": 2
}
```

`slot` chỉ xuất hiện khi Studio nêu rõ. Piagent kiểm tra bằng `verifyGrant`
(`M/session.mjs:78-83`):

- `sameAuthority(grant, manifest.authority)` (3 trường authority);
- `grant.role` và `slot` khớp khóa (`role` hoặc `role#slot`);
- `fence` là số nguyên an toàn >= 1;
- `token` khớp `^as_run_[a-f0-9-]{36}_[\w-]{43}$` (broker còn kiểm `role_id` nằm
  trong token, `W/StudioManaged.swift:124-132`);
- `provider` thuộc `claude`, `codex` hoặc id vendor `^[a-z][a-z0-9-]{1,39}$`
  (khác `claude`/`codex`; `M/native-catalog.mjs:47-48`);
- tồn tại `manifest.models[i]` với `id == model_id`, `owned_by == provider`,
  `provider_model_id` khớp.

Sai thì ném `managed-grant-invalid`. Piagent không dựa vào đồng hồ máy để xét
`expires_at` (`W/StudioManaged.swift:93`).

Khi chạy, mỗi request model còn bị chặn nếu route đổi:
`grant.provider_model_id !== route.native`, `grant.provider !== route.provider`,
`grant.model_id !== route.model_id`, hoặc `model.id !== "agent-watch-auto"` ->
`managed-route-changed` (`M/request-stream.mjs:88-89`).

### 2.5 Các endpoint Studio chỉ broker dùng (device token)

Xác thực bằng device token `as_device_<device_id>_<43 ký tự>` (Bearer)
(`S/managed.go:24-43`, `W/StudioManaged.swift:124-132`). Mọi call có thêm header
`X-Agent-Watch-Machine` (mục 4). Chi tiết ở bảng mục 3.

## 3. Endpoint Studio

Quy ước: "run token" là `grant.token` của role đang gọi. "member key" chỉ broker
dùng. Hầu hết route được `s.employee("inference", …)` bảo vệ (`S/server.go:331-349`).
Mọi response có `X-Request-ID`, `X-Studio-Boot`, `X-Studio-Version`, `Cache-Control:
no-store` (`S/server.go:204-217`, hàm `secure`).

Timeout phía Piagent ghi trong cột "Client".

### 3.1 Suy luận model

| Route | Provider | Ghi chú |
|---|---|---|
| `POST {origin}/claude/v1/messages` | `claude` (Anthropic Messages) | `baseUrl = origin + "/claude"`; server cũng có `/v1/messages` (`S/server.go:323-325`) |
| `POST {origin}/v1/responses` | `codex` (OpenAI Responses) | `baseUrl = origin + "/v1"` |
| `POST {origin}/openai/v1/chat/completions` | vendor API-key (DeepSeek, Kimi, GLM, MiMo, Qwen, OpenCode, Grok) | `baseUrl = origin + "/openai/v1"`; server cũng có `/v1/chat/completions` |

- Ánh xạ: `studioPath` (`M/native-catalog.mjs:51`), `studioAPI` (`:50`:
  `anthropic-messages` / `openai-responses` / `openai-completions`); đăng ký
  provider `agent_watch_managed` với `apiKey: 'managed-run-required'`,
  `authHeader: true`, model duy nhất `agent-watch-auto`
  (`M/session.mjs:400-404`).
- Auth: `Authorization: Bearer <run token>` (Pi gửi `grant.token` qua `apiKey`,
  `M/request-stream.mjs:100`). Studio còn chấp nhận `x-api-key`
  (`S/server.go:200`). Header xác thực do caller truyền bị loại
  (`M/request-stream.mjs:21-24`).
- Body: payload gốc của provider do Pi dựng; `model` được thay bằng
  `provider_model_id` thật (`M/request-stream.mjs:100`:
  `{ ...model, id: route.native }`). Giới hạn body 4 MiB (413
  `request_too_large`, `S/inference.go:135,145`). Từ `?` chỉ chấp nhận
  `beta=true` cho messages (`S/inference.go:125`).
- Body lớn hơn 64 KiB được gzip (`Content-Encoding: gzip`) sau khi Studio từng
  quảng bá `X-Studio-Accept-Encoding: gzip` (`M/compressed-fetch.mjs:8-27`;
  `S/inference.go:53,101`). Chỉ áp cho URL cùng origin và body là string.
- Fast mode: khi bật và route là codex model trong `CODEX_FAST`, payload thêm
  `service_tier: "priority"` (`M/fast-mode.mjs:42-43,60-65`).
- `maxRetries: 0` ở Pi; việc retry do wrapper (`M/request-stream.mjs:100`).
- Response: SSE. Lỗi giữa stream: `event: error` với
  `{"type":"error","error":{"type":"api_error","code":"<code>","message":"<…>"}}`
  (`S/inference.go:436-441`). Lỗi trước stream: HTTP status + JSON envelope.
- Client chỉ coi request là "được Studio nhận" khi thấy event đầu tiên sau
  `start`; trước đó giữ mọi event lại để có thể hỏi lại sau khi bị từ chối
  (`M/request-stream.mjs:102-113`).

### 3.2 Bảng endpoint đầy đủ

| # | Method + path | Người gọi / auth | Body (request) | Response | Client | Server |
|---|---|---|---|---|---|---|
| 1 | `GET /studio/v1/client-config` | broker, member key | không; header `X-Studio-Client-Features: api-vendors`, `If-None-Match` | manifest JSON (2.3) / 304 | `W/StudioClient.swift:222-247` | `S/server.go:347` |
| 2 | `POST /studio/v1/managed/devices` | broker, member key | `{installation_id}` | 201 `{device_id, token, expires_at, studio_instance_id, dataset_epoch, auth_generation}` | `W/StudioManaged.swift:194` | `S/managed.go:44-62`, `S/server.go:336` |
| 3 | `POST /studio/v1/managed/runs` | broker, device token | `{operation_id, effort, task_class}` | 201 grant | `W/StudioManaged.swift:200` | `S/managed.go:63`, `S/server.go:337` |
| 4 | `POST /studio/v1/managed/runs/{id}/children` | broker, device token | `{role, slot?}` | 201 grant | `:217` | `S/managed.go:169`, `S/server.go:338` |
| 5 | `POST /studio/v1/managed/roles/{id}/renew` | broker, device token | `{fence}` | 200 grant | `:232` | `S/managed.go:204`, `S/server.go:339` |
| 6 | `POST /studio/v1/managed/runs/{id}/close` | broker, device token | `{role, slot?, process?}` | 204 | `:257` | `S/managed.go:221`, `S/server.go:340` |
| 7 | `POST /studio/v1/managed/runs/{id}/recover` | broker, device token | `{}` | 200 grant | `:224` | `S/managed.go:246`, `S/server.go:341` |
| 8 | `POST /claude/v1/messages`, `/v1/responses`, `/openai/v1/chat/completions` | Piagent, run token | payload provider (3.1) | SSE | `M/session.mjs:400` | `S/server.go:322-329` |
| 9 | `GET /v1/heartbeat` | Piagent, không auth | không; `Accept: application/json`, `User-Agent` | `{status, version, boot_id, started_at}` | `M/studio-link.mjs:92-107` | `S/heartbeat.go:65-81`, `S/server.go:197` |
| 10 | `GET /v1/capabilities` | Piagent, run token | không | `{capabilities:[…], studio:"<ver>"}` | `M/studio-capabilities.mjs:44` | `S/capabilities.go:36-39`, `S/server.go:348` |
| 11 | `POST /v1/requests/{id}/cancel` | Piagent, run token | `{}` | 202 `{status:"cancelling"}` / 404 `request_not_running` | `M/request-stream.mjs:176-181` | `S/livecalls.go:90-100`, `S/server.go:331` |
| 12 | `POST /v1/search` | Piagent, run token | `{query, max_results:5, include_domains?}` | `{results:[…], answer?, provider?}` | `M/web-search.mjs:104-130` | `S/server.go:333` |
| 13 | `POST /v1/memory/{brief,search,page,ask,retain,telemetry,git}` | Piagent, run token | theo op (3.3) | theo op | `M/memory.mjs:114-152` | `S/memory.go:86-190` |
| 14 | `POST /v1/managed/settle` | Piagent, run token của helper | settlement (3.4) | 200 `{settlement:{…}}` | `M/helper-settlement.mjs:89-110` | `S/managed.go:383-396`, `S/server.go:349` |
| 15 | `POST /studio/v1/managed/tool-failures` | Piagent, run token | `{os, failures[]}` (3.5) | 204 | `M/tool-failures.mjs:56-74` | `S/tool_failures.go:63-114`, `S/server.go:343` |
| 16 | `POST /studio/v1/managed/workspace` | Piagent, run token | `{repositories[], names?, folder?}` (3.6) | 200 `{team, warnings[]}` | `M/workspace-report.mjs:19-62` | `S/project_warnings.go:40-124`, `S/server.go:345` |
| 17 | `POST /studio/v1/managed/disconnects` | Piagent, run token | `{os, events[]}` (3.7) | 204 | `M/studio-link.mjs:199-222` | `S/heartbeat.go:154-210`, `S/server.go:346` |
| 18 | `GET /v1/models` | `--doctor` thôi | không | bất kỳ HTTP nào | `M/doctor.mjs:130` | `S/server.go:322` |
| 19 | `POST /claude/v1/messages` hoặc `/v1/responses` với tool web search | Piagent, run token | 3.8 | SSE | `M/web-search.mjs:71-96` | như #8 |

Ghi chú:

- Route #12 và #19 là hai tầng của `web_search`: pool trước, rồi nếu pool 404 /
  lỗi / rỗng và provider không phải vendor thì dùng search tích hợp của provider
  (`M/web-search.mjs:137-148`).
- Route #1 và #2 chỉ broker gọi; kênh Piagent không bao giờ thấy member key.
- Studio cũng có `GET /studio/v1/heartbeat` (alias) và
  `GET /studio/v1/capabilities` (thông tin khác, `{api_version,…}`, không dùng ở
  đây) (`S/server.go:198-201`).
- Server còn route memory `signal`, `served`, `status` (`S/memory.go:151-180`)
  mà code `managed/` KHÔNG gọi.

### 3.3 Memory (route #13)

Chung: header `Authorization: Bearer <run token>`, `Content-Type: application/json`,
`User-Agent: piagent/<ver>`, `X-Session-Id: <role_id>` (`M/memory.mjs:119-121`).
Mỗi lần gọi lấy grant qua lease renew dùng chung (`M/memory.mjs:127-128`); `401`
-> renew rồi gửi lại một lần (`:130-135`). Giới hạn body phía server: brief 16 KiB,
search 16 KiB, page 16 KiB, ask 16 KiB, retain 48 KiB, telemetry 8 KiB, git 96 KiB
(`S/memory.go`). Timeout phía client: brief 5 s, retain/git ghi 4 s (git 6 s),
tool 10 s, ask 50 s, đóng round 4,5 s (`M/memory.mjs:18-25`).

Server không có memory (`Memory == nil`) hoặc team tắt -> 204. Client coi 204 và
404 là "memory off" 30 phút (`OFF_MS`) và xóa `memory-known.json`
(`M/memory.mjs:136-143`); riêng `retain` với protocol < 2, 204 chỉ nghĩa là
"team không giữ session" (`retain=false`). `ask` truyền `offOnMissing:false` nên
404 không tắt memory.

| op | Request | Response |
|---|---|---|
| `brief` | `{repo_key, prompt (≤2000), context?{branch≤100, paths[]} (protocol ≥3), folder?}`. `folder` (một trong `not_a_repository`, `no_origin`, `unsupported_remote`) kèm `repo_key:""` khi thư mục không có repo | `{protocol_version, text, facts, rules, pages[], git_head: string\|null, retain_sessions, repository?, serve_id?}` |
| `search` | `{repo_key, query (≤2000), context?}` | `{text, serve_id?}` |
| `page` | `{repo_key, name ∈ PAGE_NAMES}` (`M/memory-tools.mjs:6`: `Component map`, `Core concepts`, `Conventions and patterns`, `Key decisions and rationale`, `Initiatives and work in progress`) | `{markdown}` |
| `ask` | `{repo_key, question, context?}` | `{answer, sources[{text,type?,when?,origin,status?,note?}], text}` (`SI/memory/ask.go:21-42`) |
| `retain` (protocol 1) | `{repo_key, conversation_id, text}` | `{status:"accepted"}` |
| `retain` (protocol ≥2) | `{repo_key, conversation_id, text, event_id (UUID), source_key_id, occurred_at (ISO)}`; protocol ≥3 thêm `context{branch,paths}`, `files[≤12]`, `checks{passed,failed,final}`; protocol ≥4 thêm `serves[≤20 UUID]` | receipt `{status ∈ pending\|processing\|completed\|failed\|cancelled\|unknown, event_id, operation_id, duplicate}` hoặc `{status:"retain_disabled"}` |
| `telemetry` (protocol ≥2) | `{repo_key, event_id, source_key_id, conversation_id, counters{}, outcome ∈ answered\|aborted\|error\|unknown, duration_ms ≤604800000}` | `{status:"recorded"}` |
| `git` | `{repo_key, head (40 hex), commits[{sha, date (ISO), subject, body≤2000, dirs?[], changes?[{path,kind ∈ deleted\|renamed\|rewritten}]}]}`; mỗi batch <60 KiB, tối đa 300 commit | `{status:"accepted", commits:n}` |

Lỗi memory: 409 `memory_scope_changed` (`source_key_id` khác key của token),
409 `memory_event_conflict`, 400 `invalid_request`, 503 `memory_unavailable`,
403 `run_grant_required` (member key thay vì run token) (`S/memory.go:54-75`).
Client lượng giá `retain`: 400/409 -> quarantine file outbox; mọi lỗi khác thử lại
(`M/memory.mjs:341`).

Phần dữ liệu cục bộ của memory (không phải giao diện Studio nhưng ràng buộc
protocol): outbox `<store>/memory-outbox-v2/<sha256 scope>/<event_id>.json`
(`M/memory-outbox.mjs:38`), tối đa 2 MiB; `<store>/memory-known.json`
`{origin, scope, at, protocol?}` hiệu lực 7 ngày (`M/memory.mjs:90-99`).

### 3.4 Settle (route #14)

Gửi sau mỗi attempt của helper, bằng token hiện hành của role helper, trước khi
role đóng (`M/helper-run.mjs:202-203`). Chỉ gửi khi Studio liệt kê
`managed.settle.v1` (`M/helper-settlement.mjs:90`). Body
(`SI/runs/settle.go:19-27`, dựng ở `M/helper-settlement.mjs:55-83`):

```json
{
  "outcome": "succeeded",
  "summary": "…≤600 ký tự…",
  "evidence": ["…≤300 ký tự…"],
  "files": ["path/a.ts"],
  "spec": { "target": "…", "change": "…", "constraints": "…", "ownership": "…", "acceptance": "…" }
}
```

- `outcome ∈ succeeded | failed | cancelled | unverifiable`; `summary` không rỗng;
  `evidence` ≤ 8; `files` ≤ 50 (mỗi path ≤ 300); `spec` tùy chọn, mỗi trường ≤ 1000
  (`SI/runs/settle.go:34-45`).
- Retry: timeout 3 s mỗi lần; khi không có trả lời, 5xx hoặc 429 thử lại sau 500 ms
  rồi 2000 ms; các mã khác ngừng (`M/helper-settlement.mjs:88-108`). Kết quả không
  bao giờ làm hỏng helper.
- Lỗi: 409 `settlement_conflict`, 400 `invalid_request` (`S/managed.go:309-320`).
- Studio coi helper đóng mà không có settle là `unverifiable`
  (`M/helper-settlement.mjs:7-8`).

### 3.5 Tool failures (route #15)

Body (`M/tool-failures.mjs:63-66`; server `S/tool_failures.go:19-38`):

```json
{
  "os": "darwin 27.0.0 arm64",
  "failures": [{
    "id": "<uuid>", "tool": "bash", "role": "main", "code": "exit_1",
    "input": "npm test", "error": "…đầu 1000 + đuôi 2000 ký tự…",
    "duration_ms": 1200, "age_ms": 300, "engine": "available"
  }]
}
```

- `tool` khớp `^[a-z0-9_]{1,40}$` (ngoài ra `other`); `role` ∈
  main/scout/research/verify/review; `engine ∈ used|available|none`;
  `input` ≤ 500; `age_ms` ≤ 1 ngày; mỗi batch ≤ 20 (`BATCH`), hàng đợi giữ 100
  (`KEEP`), tối đa 3 lần thử (`M/tool-failures.mjs:16`).
- `code`: nếu lỗi mở đầu bằng `managed-…` hoặc `web-search-…` thì đổi `-` thành `_`
  (ví dụ `managed-domain-blocked` -> `managed_domain_blocked`); `Command exited with
  code N` -> `exit_N`; `Command timed out…` -> `timeout`; còn lại `error`
  (`M/tool-failures.mjs:29-37`). Không gửi:
  `managed_tool_cancelled`, `managed_helper_cancelled`, `managed_operation_denied`
  (`:18`).
- Bí mật được redact và home đổi thành `~` trước khi gửi (`:22-25`).
- Phản ứng: 404/405 -> tắt gửi vĩnh viễn trong session; 400 -> bỏ batch; lỗi khác
  hoặc không trả lời -> xếp lại tối đa 3 lần (`:67-70`). Server: 403
  `run_grant_required` nếu không phải run token; 503 `operation_unavailable`
  (`S/tool_failures.go:63-110`).
- Gửi kèm mỗi request model kế tiếp (`M/request-stream.mjs:84`) và ngay khi có
  failure (`M/tool-failures.mjs:89`).

### 3.6 Workspace (route #16)

Chỉ main gửi, mỗi run một lần (`M/request-stream.mjs:86`,
`M/workspace-report.mjs:19-26`), nếu có capability `managed.workspace.v1`. Với
`managed.workspace.v2`, thư mục không có remote vẫn được báo như project cục bộ.

- Body v1: `{"repositories":["github.com/acme/shop"], "folder"?: "…"}`.
  Body v2: `{"repositories":["<key>"], "names"?: {"<key>":"<tên thư mục>"}}` hoặc
  `{"repositories":[],"folder":"not_a_repository"}`. Key là `host/path` của remote,
  hoặc `local/git/…`, `local/dir/…` cho dự án cục bộ (v2). Tối đa 6 repo;
  `names[k]` chỉ hợp lệ nếu `k` có trong `repositories`, ≤ 400 ký tự
  (`S/project_warnings.go:40-59`).
- Response: `{"team":"<tên>", "warnings":[{"repo_key":<string|null>,
  "project_name"?:"…", "kind":"other_team|unlisted|unregistered|no_repository"}]}`.
  v1 chỉ hiển thị `other_team`, `unlisted` (`M/workspace-report.mjs:17,47`).
- Phản ứng: 400/404/405 -> đánh dấu `workspaceUnsupported` (không hỏi nữa); lỗi khác
  thử lại tối đa 3 lần (`:43-44`). Server 403 `run_grant_required`, 503
  `operation_unavailable`.
- Piagent ghi `agent-watch-project {warnings, team, at}` vào session
  (`M/workspace-report.mjs:66-72`).

### 3.7 Disconnects (route #17)

Body (`M/studio-link.mjs:203-214`; server `S/heartbeat.go:83-143`):

```json
{
  "os": "darwin 27.0.0 arm64",
  "events": [{
    "id": "<uuid>", "phase": "model", "cause": "studio_update", "outcome": "resumed",
    "attempts": 3, "codes": ["studio-unreachable"],
    "started_age_ms": 120000, "ended_age_ms": 5000,
    "conversation": "<session id>", "run_id": "<uuid>",
    "boot_before": "<uuid>", "boot_after": "<uuid>",
    "version_before": "1.2.3", "version_after": "1.2.4"
  }]
}
```

- `phase ∈ model|broker|continue`; `cause ∈ studio_update|studio_restart|studio_unavailable|network|broker_offline|unknown`;
  `outcome ∈ resumed|stopped|gave_up` (client chỉ gửi `resumed`/`stopped`);
  `codes` ≤ 8, `codes` được Studio đổi `-` và `:` thành `_`; batch ≤ 20; mốc thời gian
  là "tuổi" (ms) tính từ lúc gửi, tối đa 7 ngày (`S/heartbeat.go:111-143`).
- Gửi kèm token của request model kế tiếp (`void link?.flush(grant.token)`,
  `M/request-stream.mjs:87`). 204 = xong; 404 -> tắt cho cả conversation; lỗi khác
  giữ lại tối đa 5 lần thử (`M/studio-link.mjs:34,210-218`).
- Studio tự suy ra `cause` từ bảng `studio_boots`, ưu tiên hơn giá trị client báo.

### 3.8 Fallback web search của provider (route #19)

- Claude: `POST /claude/v1/messages`, body `{model, max_tokens:4096, system, stream:true,
  messages:[{role:"user",content:query}], tools:[{type:"web_search_20250305",
  name:"web_search", max_uses:5, allowed_domains?}], thinking?, output_config?}`,
  thêm header `anthropic-version: 2023-06-01`.
- Codex: `POST /v1/responses`, body `{model, instructions, stream:true, store:false,
  input:[…], tools:[{type:"web_search", filters?}], include:["web_search_call.action.sources"],
  tool_choice:"required", reasoning?}`.
- Cả hai: headers `Authorization`, `Content-Type`, `Accept: text/event-stream`,
  `User-Agent`, `X-Session-Id`, `X-Agent-Purpose: web_search`; timeout 120 s
  (`M/web-search.mjs:82-86`). Lỗi HTTP -> `web-search-failed: <error.code | http-NNN>`.
- `POST /v1/search`: headers `Authorization`, `Content-Type`, `User-Agent`,
  `X-Session-Id`; timeout 150 s; 404 -> `managed-web-search-unavailable`; lỗi khác
  `web-search-failed: <code>` (`M/web-search.mjs:104-120`). Kết quả rỗng ->
  `web-search-empty`.

### 3.9 Heartbeat, capabilities, cancel

- `GET /v1/heartbeat`: 200 `{"status":"ready","version","boot_id","started_at"}`;
  503 với `status ∈ starting|draining` và `Retry-After: 2` (`S/heartbeat.go:65-81`).
  Client: timeout 5 s; 404 kèm `X-Request-ID` -> Studio cũ, coi như `ready`;
  `state=down` nếu không có body JSON hợp lệ (trang của gateway) hoặc `ready` nhưng
  HTTP không ok (`M/studio-link.mjs:92-107`). `boot_id` phải là UUID, `version`
  khớp `^[A-Za-z0-9][A-Za-z0-9.+_-]{0,39}$`.
- `GET /v1/capabilities`: xem mục 6.
- `POST /v1/requests/{id}/cancel`: `{id}` lấy từ header `X-Request-ID` của response
  stream (UUID), chỉ gửi khi `stopReason` là `error` hoặc `aborted`
  (`M/request-stream.mjs:99,117,172-181`). Chỉ run token của chủ request; 404 nếu
  request không còn chạy hoặc không phải của caller. Client coi chỉ 202 là thành
  công, nuốt mọi lỗi.

## 4. Header

### 4.1 Piagent -> Studio

Chung cho mọi call HTTP của Piagent: `User-Agent: piagent/<version>`
(`M/client-agent.mjs:6`; `<version>` đọc từ `package.json` gốc), `Authorization:
Bearer <run token>` (trừ heartbeat). Studio dùng `User-Agent` để ghi công cụ và
phiên bản (`S/accesslog.go:121`, `clients.ParseTool`).

Chỉ trên request model (`M/request-stream.mjs:100-101`, `M/call-purpose.mjs:30-59`):

| Header | Giá trị | Ghi chú |
|---|---|---|
| `X-Session-Id` | `grant.role_id` | tên role, mọi role |
| `X-Claude-Code-Session-Id` | id conversation của Pi (`^[\w-]{8,128}$`, thêm `-N` sau lần rebind) | chỉ role main; Studio dùng gắn conversation với một tài khoản và giữ prompt cache (`M/request-stream.mjs:183-196`); Studio nhận biết các header session: `X-Claude-Code-Session-Id`, `X-Claude-Code-Agent-Id`, `Session-Id`, `Session_id`, `X-Session-Id` (`SI/connectors/session.go:20-26`) |
| `sessionId` (tùy chọn Pi, không phải header) | `conversation ?? role_id` | để Pi/provider sinh header riêng (ví dụ `session_id` của Codex) |
| `X-Agent-Purpose` | `answer` \| `tool_step` \| `brief` \| `summary` \| `harness` \| `continue` \| `web_search` | `summary` khi system prompt bắt đầu bằng `You are a context summarization assistant`; `tool_step` khi tin nhắn cuối là toolResult; `brief` cho helper; `harness`/`continue` do `owner.nextPurpose`; còn lại `answer`. Danh sách chấp nhận ở Studio: `SI/observability/calls.go:346` |
| `X-Agent-After` | ví dụ `read:3,bash` | tối đa 8 tên công cụ của lượt trả lời trước, nhiều nhất trước, `^[a-z0-9_]{1,40}(:[0-9]{1,4})?(,…){0,7}$` (`SI/observability/calls.go:347`) |
| `X-Agent-Task` | `encodeURIComponent(title)` | chỉ `brief`; tiêu đề job ≤ 100 ký tự; server từ chối nếu thô > 2048 |
| `X-Agent-Compaction` | `<id>;<reason>;<part>` | chỉ main, request `summary`; `reason ∈ threshold|overflow|manual`; `part` 1..999 (`SI/observability/calls.go:99-111`) |
| `X-Agent-Compacted` | `<id>;<reason>;<outcome>;<before>;<after>;<ms>` | chỉ main, một lần trên request không phải `summary` đầu tiên sau khi nén; `outcome ∈ done|failed|aborted`; số đếm có thể rỗng |
| `Content-Encoding` | `gzip` | khi body ≥ 64 KiB và Studio đã quảng bá |
| `Accept` | `application/json` / `text/event-stream` | tùy route |
| `anthropic-version` | `2023-06-01` | chỉ search fallback của Claude (Pi tự thêm cho đường chính) |

Memory và search còn đặt `X-Session-Id: <role_id>`; `/v1/managed/settle`,
`tool-failures`, `workspace`, `disconnects`, `requests/{id}/cancel` chỉ có
`Authorization`, `Content-Type`, `User-Agent`.

### 4.2 Broker (Agent Watch) -> Studio

`Authorization: Bearer <device token | member key>`, `Content-Type: application/json`,
`Accept: application/json`, `User-Agent: AgentWatch/<version>`,
`X-Agent-Watch-Machine: <tên máy, percent-encoded, ≤80 ký tự>`
(`W/StudioManaged.swift:111-120,141-145`; Studio đọc ở `S/managed_events.go:85`),
và chỉ với `client-config`: `X-Studio-Client-Features: api-vendors`, `If-None-Match`.

### 4.3 Studio -> client

| Header | Ý nghĩa | Client dùng |
|---|---|---|
| `X-Request-ID` | UUID của request, mọi response | `studioRequestID` (`M/request-stream.mjs:172-175`) dùng cho cancel; heartbeat 404 + header này = Studio cũ còn sống (`M/studio-link.mjs:97`) |
| `X-Studio-Boot` | UUID của lần khởi động Studio | `StudioLink.observe` (`M/studio-link.mjs:80-83`) để phân loại `studio_restart`/`studio_update` |
| `X-Studio-Version` | version Studio | như trên |
| `X-Studio-Accept-Encoding: gzip` | Studio nhận body gzip | `M/compressed-fetch.mjs:25` |
| `Retry-After: 2` | khi heartbeat 503 | client không đọc, chỉ dùng pause riêng |
| `X-Should-Retry: false` | 400, 401, 403, 404, 413, 415, 422 và 409 `session_account_unavailable_start_new_session` | dành cho client Claude Code; Piagent không đọc (`S/server.go:107-116`) |
| `Cache-Control: no-store` | | |

## 5. Process report (kèm lúc đóng run)

Chỉ gửi khi: manifest có `broker_features` chứa `"process"`, `self.run` tồn tại
(`M/session.mjs:300`), và broker chỉ chuyển tiếp khi harness có `workflow`
(`W/StudioManaged.swift:255`). Phiên bản chọn (`M/session.mjs:300`):

```
features ∋ "process-v3" -> 3 ; else ∋ "process-v2" -> 2 ; else 1
```

`process-vN` chỉ xuất hiện nếu `manifest.process_versions` chứa N (`W/StudioManagedBrokerCommand.swift:29`).
Studio hiện hành phát `[1,2,3]` (`SI/runs/process.go:52`).

Dựng báo cáo: `RunProcess.report(plan, version)` (`M/workflow.mjs:293-303`).

Mô tả từng trường (kiểu: `int` là số nguyên 0..1000; `bool`; `enum`):

| Trường | v1 | v2 | v3 | Kiểu và ràng buộc | Nguồn giá trị |
|---|---|---|---|---|---|
| `version` | có | có | có | `1`, `2` hoặc `3`, phải thuộc `process_versions` | |
| `policy` | có | có | có | object chính xác 3 khóa `plan`, `verify`, `review`, mỗi cái `off|suggest|require` | `this.policy` |
| `changed` | có | có | có | bool | có đổi code trong run |
| `plan_steps` | có | có | có | int; bỏ bước `deferred` | số bước trong checklist |
| `plan_done` | có | có | có | int, ≤ `plan_steps` | bước `completed` |
| `checks` | có | có | có | int | số lần chạy lệnh check |
| `checks_failed` | có | có | có | int, ≤ `checks` | |
| `verified` | có | có | có | bool | check pass trên code cuối |
| `reviews` | có | có | có | int | số lần review |
| `reviewed` | có | có | có | bool | patch cuối đã review |
| `blocking` | có | có | có | int | finding mức blocking |
| `blocking_open` | có | có | có | int, ≤ `blocking` | |
| `fix_loops` | có | có | có | int, ≤ 3 | |
| `outcome` | có | có | có | enum: `no_change`, `interrupted`, `blocking_open`, `unverified`, `review_unavailable`, `unreviewed`, `clean`; v3 thêm `disputed` | v1/v2 dùng `legacyOutcome`, v3 dùng `outcome` (`M/workflow.mjs:300`); mặc định `interrupted` nếu đã đổi code, `no_change` nếu không |
| `plan_skipped` | không | có | có | bool | đổi code dù thiếu checklist bắt buộc |
| `unknown_tools` | không | có | có | int | số lần gọi tool không tồn tại (`Tool X not found`, `M/session.mjs:185-187`) |
| `objections` | không | không | có | int | helper phản đối brief |
| `objections_answered` | không | không | có | int, ≤ `objections` | |
| `disputes` | không | không | có | int; `outcome == "disputed"` đòi `disputes > 0` | bất đồng giao cho member |

Quy tắc kiểm tra:

- Broker (`W/StudioManaged.swift:284-299`): tập khóa phải đúng bằng tập khóa của
  phiên bản (khóa thừa hay thiếu đều bị từ chối); `bool` chỉ ở các khóa cờ; số
  nguyên 0..1000; sai -> `invalidResponse`.
- Studio (`SI/runs/process.go:60-81`): thêm ràng buộc `plan_done ≤ plan_steps`,
  `checks_failed ≤ checks`, `blocking_open ≤ blocking`, `fix_loops ≤ 3`,
  `objections_answered ≤ objections`; v1 cấm `plan_skipped`/`unknown_tools` khác
  rỗng; v1 và v2 cấm trường v3 và `disputed`; `!changed` đòi `outcome ∈
  {no_change, interrupted, disputed}` (`S/managed.go:229-232` trả 400
  `invalid_request`).
- Phản ứng của client khi báo cáo bị từ chối (`invalidResponse`): đóng lại không
  kèm báo cáo (`M/studio-link.mjs:284-285`).
- Báo cáo chỉ chứa số và enum, không có prompt, finding, đường dẫn.

## 6. Capability và phiên bản giao thức

### 6.1 Danh sách phiên bản

| Thứ | Giá trị | Nơi quy định |
|---|---|---|
| Binding file `schema_version` | `1` | `W/StudioManagedConfiguration.swift:81`, `M/binding-wait.mjs:22` |
| Manifest `schema_version` | `2` cho key managed (`1` cho key direct, Piagent từ chối) | `SI/ledger/client_config.go:75`, `M/session.mjs:62` |
| Piagent status file `schema_version` | `1` | `P/packages/piagent-webui/gateway/agent-status-files.ts:20` |
| Process report `version` | `1`, `2`, `3` | mục 5 |
| Memory protocol | client dùng `PROTOCOL = 3`, `FEEDBACK_PROTOCOL = 4`; Studio phát `memory.Protocol = 4` | `M/memory.mjs:29`, `M/memory-serves.mjs:5`, `SI/memory/quality.go:20` |
| Client-features header của broker | `api-vendors` | `W/StudioVendor.swift:8` |
| Piagent session entry | `agent-watch-*` (mục 8.4) | |

### 6.2 `GET /v1/capabilities`

- Request: `Authorization: Bearer <run token>`, `Accept: application/json`,
  `User-Agent`; timeout 3 s (`M/studio-capabilities.mjs:44-45`).
- Response: `{"capabilities": ["capabilities.v1", "managed.settle.v1", …], "studio":"<version>"}`
  (`S/capabilities.go:37-39`). Tên hợp lệ khớp
  `^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*\.v[0-9]+$`, lấy tối đa 200
  (`M/studio-capabilities.mjs:15,50`).
- 404 -> `names = null`: không có danh sách, mọi tính năng cần capability tắt
  (trừ `memory_ask`, xem dưới). Lỗi khác (không ok) -> giữ đáp án cũ.
- Cache: `<store>/studio-capabilities.json` = `{scope, at, names}`, tươi 1 giờ,
  giữ 7 ngày, cùng `scope` (hash của origin + key + user + authority). Làm mới ở
  `openRound` (không chờ) bằng grant của main (`M/memory.mjs:479`).

### 6.3 Tên capability Studio phát và cách Piagent dùng

Danh sách Studio hiện hành (`S/capabilities.go:19-34`):

| Tên | Điều kiện server | Piagent làm gì |
|---|---|---|
| `capabilities.v1` | luôn | không dùng |
| `managed.settle.v1` | luôn | bật `POST /v1/managed/settle` (`M/helper-settlement.mjs:90`) |
| `managed.workspace.v1` | luôn | bật báo workspace (`M/workspace-report.mjs:20`) |
| `managed.workspace.v2` | luôn | body v2 và hiển thị mọi `kind` (`:26,47`) |
| `requests.cancel.v1` | có engine suy luận | KHÔNG kiểm tra; Piagent cứ gọi cancel và chấp nhận 404 (`M/request-stream.mjs:117,176`) |
| `managed.supersede.v1` | có engine | hành vi phía server; client không kiểm |
| `search.v1` | có engine | KHÔNG kiểm; phát hiện bằng 404 của `/v1/search` |
| `memory.v4` | có engine + memory | KHÔNG đọc; protocol lấy từ `brief.protocol_version` |
| `memory.ask.v1` | có engine + memory | nếu danh sách đã nghe mà thiếu tên này thì không cung cấp tool `memory_ask`; chưa nghe được danh sách thì cung cấp (`M/memory.mjs:460`) |

### 6.4 Memory protocol (điều kiện "cần protocol 3")

Protocol được học từ `brief.protocol_version` (thiếu thì 1), lấy min trên các repo
(`M/memory.mjs:214`) và lưu ở `memory-known.json`. `speaks` = protocol của
conversation, nếu 0 thì giá trị đã lưu (`:101`).

| Protocol | Điều Piagent gửi / bật |
|---|---|
| 1 | `retain` dạng cũ `{repo_key, conversation_id, text}`, best effort, không outbox (`:288-295`) |
| >= 2 | outbox bền, `retain` có `event_id`, `source_key_id`, `occurred_at`; `telemetry` (`:322,348`) |
| >= 3 | gửi `context{branch,paths}` trong brief/search/ask (`:171`); commit kèm `dirs`, `changes` (`:242-249`); `retain` kèm `context`, `files`, `checks` (`:305-311`) |
| >= 4 | `retain` kèm `serves` (`:312`); brief/search trả `serve_id` được tích lũy bởi `RoundServes` |

Studio cũ từ chối trường lạ, nên các trường protocol 3 và 4 chỉ gửi khi Studio đã
nói như vậy; bản ghi nằm trong outbox khi Studio hạ protocol sẽ bị cắt trường
(`:335`). Tool `memory_ask` được ghi trong chú thích là "protocol 3" nhưng việc
bật nó thực tế kiểm bằng capability `memory.ask.v1` (`:26-28,460`), không kiểm
protocol.

Các tool memory chỉ được tạo khi `memory-known.json` còn hiệu lực cho đúng scope
(`M/memory.mjs:461`); helper chỉ nhận `memory_search` và `memory_ask`, không bao
giờ ghi (`:462-464`).

## 7. Mã lỗi mà client phản ứng

Phân tích: `failureCode(raw)` trong `R/managed-failure.mjs:156-183` rút mã theo thứ tự:

1. thẻ `[code]` ở cuối chuỗi (ví dụ lỗi do `describeFailure` tạo);
2. `"code":"…"` trong body lỗi Studio (và `web-search-failed: <code>`);
   `initial_request_limit_reached` đổi thành `live_trial_limit_reached`;
3. `managed-broker:<x>`, `managed-<x>`, `web-search-empty`;
4. `API error (502|503|504|52x|530)` không có mã Studio -> `studio-gateway-unavailable`;
5. mẫu `server_error`/`api_error`/`overloaded` của provider -> `upstream_server_error`;
6. khác `"code"` hoặc có `API error (NNN)` -> `studio-request-failed`;
7. `usage policy`/`violative` -> `upstream_policy_refusal`;
8. stream rỗng -> `upstream_incomplete`; `Request interrupted` -> `upstream_interrupted`;
   `The answer ran past its output limit` -> `output_limit_exceeded`;
9. mẫu mạng (`fetch failed`, `ECONNRESET`, `timeout`…) -> `studio-unreachable`;
10. mặc định `managed-request-failed`.

Lỗi do broker mang `studioCode` được ghép thành `... {"code":"<studio_code>"}` bởi
`failureText` (`R/managed-failure.mjs:187-190`), nên cùng bộ phân tích dùng cho cả
hai nguồn.

### 7.1 Nhóm phản ứng

| Nhóm | Mã | Phản ứng | Nguồn |
|---|---|---|---|
| Từ chối nhập học (admission refusal): xếp hàng chờ tài khoản | `session_account_busy_retry_later`, `session_account_not_ready_retry_later`, `concurrency_limit`, `account_capacity_unavailable`, `request_rate_limit`, `gateway_busy`, `connector_busy` | Giữ lỗi (không đẩy ra conversation), hỏi lại. Chờ tối đa 20 phút (`CAPACITY_WAIT_MS`). Trễ: nếu Studio đã giữ request >=10 s thì hỏi lại sau 0,5 đến 1,5 s, nếu bị từ chối ngay thì lùi 2 s nhân đôi đến 15 s, nhân hệ số ngẫu nhiên 0,75 đến 1,25. Phát event `managed_capacity_wait` (`start`, `waiting`, `end` với `outcome ∈ admitted|ended|gave-up|switched|rebound|stopped`). Hết hạn: lỗi cuối đưa ra. Helper: sau 60 s với `session_account_not_ready_retry_later` hoặc `account_capacity_unavailable` thì ngừng chờ và helper khởi động lại để Studio chọn model kế | `R/managed-failure.mjs:128-130`; `M/request-stream.mjs:27-33,213-250` |
| Từ chối ngắn (brief refusal) | `execution_precondition_failed`, `upstream_auth_required`, `invalid_run_grant`, `operation_unavailable` | Hỏi lại tối đa 3 lần cách 3 s, 6 s, 9 s; mỗi lần renew grant trước; grant dùng chung bị bỏ khỏi cache | `R/managed-failure.mjs:139-140`; `M/request-stream.mjs:33,109-110,125,145` |
| Tài khoản mất | `session_account_unavailable_start_new_session` (409) | Với main: tăng `conversationGeneration` (id session thêm `-N`) để Studio gắn tài khoản khác, tối đa 2 lần; mất prompt cache một lần | `M/request-stream.mjs:188,138-143,191` |
| Tài khoản nghỉ lâu | `session_account_not_ready_retry_later` kéo dài >= 90 s (main) | Cũng rebind như trên (`SESSION_REBIND_MS`) | `M/request-stream.mjs:139,190` |
| Studio/gateway/connector không trả lời | `studio-unreachable`, `studio-gateway-unavailable`, `connector_unavailable`, `inference_unavailable`, `operation_unavailable`, `managed-broker:offline`, `managed-broker-timeout`, `managed-broker-disconnected`, `managed-broker:serverUnavailable`, `managed-broker:upstreamUnavailable` | Chờ heartbeat về `ready` không giới hạn thời gian (chỉ Stop dừng), rồi hỏi lại. Nhóm "có điều kiện" (`connector_unavailable`, `inference_unavailable`, `operation_unavailable`, mọi `managed-broker*`): chỉ chờ nếu heartbeat không `ready` hoặc Studio vừa quay lại (`BROKER_GRACE_MS` 10 phút) hoặc broker lỗi dưới `BROKER_RETRY_MS` (3 phút). Ghi `studio-link.jsonl`, gửi `disconnects`, thêm thông điệp tiếp tục `agent-watch-process` | `M/studio-link.mjs:23-32,114-153,156-169,243-258` |
| Tự thử lại lượt sau khi Studio đã nhận | `upstream_interrupted`, `upstream_incomplete`, `upstream_timeout`, `upstream_unavailable`, `upstream_server_error`, `output_limit_exceeded`, `connector_unavailable`, `connector_execution_failed`, `inference_unavailable`, `studio-unreachable` | Retry theo Pi: tối đa 2 lần, trễ gốc 2 s (rồi 4 s), request lỗi bị bỏ khỏi ngữ cảnh. Các mã của nhóm "Studio không trả lời" thì chờ heartbeat và không đếm vào 2 lần | `M/request-stream.mjs:263-302` |
| Quá lớn | `request_too_large` (413, body > 4 MiB) luôn; `upstream_request_rejected` khi ước lượng > nửa cửa sổ context | Nén (`session.compact()`) rồi gửi lại ở round kế | `M/session.mjs:280,367-376` |
| Fast mode | `policy_denied`, `upstream_request_rejected` trên request có `service_tier` | Hỏi lại một lần không có tầng ưu tiên, tắt Fast cho conversation, thêm `agent-watch-fast-notice` | `M/fast-mode.mjs:46-56`; `M/request-stream.mjs:95,110,121` |
| Bắt đầu run | `managed-broker-disconnected`, `managed-broker-timeout`, `managed-grant-invalid`, `managed-broker:invalidKey`, `managed-broker:identityChanged`, `managed-broker:permissionDenied`, `managed-broker:invalidResponse` | Khi có `renewBroker`: enroll lại (broker mới, `config` mới) và `start` lần nữa. Nếu lỗi vẫn còn, round thành "preflight failure" (tin nhắn được trả lời bằng lý do, không có run) | `M/session.mjs:68,233-239,342-365` |
| Studio bận lúc `config`/`start` | `managed-broker:serverUnavailable`, `managed-broker:upstreamUnavailable`, `managed-broker:rateLimited` | `patiently`: `config` thử tối đa 3 lần, `start` và `child` tối đa 2 lần, nghỉ 1,5 s nhân số lần | `M/session.mjs:71-77,101,220` |
| Helper đổi model | `upstream_rate_limited`, `session_account_not_ready_retry_later`, `session_account_unavailable_start_new_session`, `account_capacity_unavailable`, `execution_capability_unavailable` | Helper chạy lại một lần (`HELPER_ATTEMPTS = 2`) để Studio cấp model kế của role | `M/helper-run.mjs:25-30,56-61` |
| Giới hạn helper | `helper_capacity_exhausted` (429), `helper_run_limit_reached` (429), `managed-helper-limit` (client, 8 lần/lượt) | Hiện cho main agent như lỗi công cụ | `M/session.mjs:473`; `M/helper-roles.mjs` (`HELPER_CALLS`) |
| Key / chính sách (dừng ngay, không thử lại) | `authentication_required`, `run_grant_required`, `managed-broker:invalidKey`, `managed-broker:permissionDenied`, `managed-broker:keychainApprovalRequired`, `policy_denied`, `thinking_level_unavailable`, `harness_model_unsupported`, `harness_profile_unavailable` | Hiện câu giải thích (`describeFailure`) kèm thẻ `[code]` và request id | `R/managed-failure.mjs:18-115,194-197` |
| Hạn mức | `token_quota_exhausted`, `managed-broker:quotaExceeded`, `live_trial_limit_reached` | Dừng, nói rõ | cùng nơi |
| Run bị đóng/thay | `run_state_conflict`, `managed-broker:identityChanged`, `managed-route-changed`, `managed-grant-invalid`, `managed-configuration-unavailable`, `managed-run-required` | Dừng; lượt kế có thể enroll lại | `M/request-stream.mjs:50-51,89` |
| Session sai chủ | `managed-session-scope-changed` | Conversation mở được, đọc được, không chạy; mọi tin nhắn trả lời bằng lý do | `M/session.mjs:152,360-361` |
| Cập nhật | `managed-native-catalog-update-required` | Báo cập nhật Piagent (Piagent không biết model của harness) | `M/session.mjs:380` |

Tất cả mã Studio đã được `R/managed-failure.mjs:18-115` ánh xạ sang `kind` và câu
tiếng Anh. Studio phát các mã đó từ `S/server.go`, `S/inference.go:473-515`,
`S/managed.go:309-350`.

### 7.2 Về `managed-domain-blocked`

Đây KHÔNG phải mã của Studio hay Agent Watch. Nó là lỗi cục bộ của sandbox khi
proxy package từ chối host ngoài danh sách registry quen thuộc
(`M/tool-boundary.mjs:342-348`), xuất hiện trong kết quả công cụ (`bash`), có
chuỗi tiếng Việt kèm danh sách host. Hệ quả duy nhất về phía Studio: nó được gửi
trong `tool-failures` với `code = "managed_domain_blocked"` (mục 3.5). Nó không có
trong bảng `CODES`, nên nếu xuất hiện trong lỗi request model, `failureCode`
quay về `managed-request-failed`.

### 7.3 Mã phía client không bao giờ đến từ Studio

Mã `managed-*` cục bộ (không có request id, `failureIsLocal`): xem
`R/managed-failure.mjs:151`. Ví dụ `managed-run-required`, `managed-helper-unavailable`,
`managed-helper-not-configured`, `managed-plan-required`, `managed-session-open-elsewhere`,
`managed-fast-unavailable`, `managed-web-search-unavailable`. Việc viết lại cần giữ
đúng tập chuỗi này nếu giao diện web/Terminal đang ánh xạ theo mã.

## 8. Định dạng file trên máy

Tất cả đường dẫn trong mục này tính theo `agentDir`. Trong nguồn đang đọc, binding
và status nằm ở `~/.pi/agent` (macOS, Linux). Bản viết lại đã dùng `~/.piagent/agent`
theo ghi nhớ dự án, nên đối chiếu lại đường dẫn trước khi kiểm thử (mục 10).

### 8.1 Binding: `~/.pi/agent/agent-watch-managed.json`

- Người ghi: Agent Watch (`W/StudioManagedConfiguration.swift:54-86`), ghi lại mỗi
  khi key/harness đổi hoặc Piagent/Agent Watch cập nhật (quét khoảng 5 phút một
  lần, khi thức dậy, khi đổi mạng; `M/binding-wait.mjs:6-11`).
- Người đọc: launcher `piagent studio` (`P/scripts/piagent-studio.mjs:42-71`), Gateway
  (`P/packages/piagent-webui/gateway/managed-launch.ts:36-47`), dashboard update job,
  `personal-pi-config.mjs`.
- Giới hạn: file thường (không symlink khi Gateway đọc), tối đa 16 384 byte.
- Trường (ví dụ giả):

```json
{
  "schema_version": 1,
  "model": "agent-watch-auto",
  "profile_id": "<64 ký tự hex>",
  "origin": "https://studio.example.test",
  "node": "/usr/local/bin/node",
  "node_sha256": "<64 hex>",
  "entrypoint": "/usr/local/lib/node_modules/@piagent/platform/scripts/piagent-studio.mjs",
  "entrypoint_sha256": "<64 hex>",
  "sdk_root": "/usr/local/lib/node_modules/@earendil-works/pi-coding-agent",
  "broker": "/Applications/AgentWatch.app/Contents/MacOS/AgentWatchMac",
  "broker_sha256": "<64 hex>",
  "configuration_revision": "<chuỗi revision của manifest>"
}
```

| Trường | Ý nghĩa và kiểm tra |
|---|---|
| `schema_version` | phải `1` |
| `model` | phải `agent-watch-auto` |
| `profile_id` | slot của key trong Agent Watch, `^[a-f0-9]{64}$`; truyền cho broker làm `--profile`; tên thư mục slot dưới `ManagedSessions` |
| `origin` | gốc API Studio, chỉ `https` hoặc `http` với `127.0.0.1` / `[::1]`; không user, query, hash, path (`M/session.mjs:84-89`) |
| `node`, `node_sha256` | Node đang chạy phải trùng đường dẫn (qua `realpath`) và hash |
| `entrypoint`, `entrypoint_sha256` | `scripts/piagent-studio.mjs` đang chạy phải trùng |
| `sdk_root` | thư mục Pi host (`@earendil-works/pi-coding-agent`); version phải khớp `PI_HOST_VERSION` của Piagent (`M/session.mjs:97`) |
| `broker`, `broker_sha256` | executable của Agent Watch, tuyệt đối, không symlink (`realpath` bằng chính nó, `M/broker-client.mjs:11`) |
| `configuration_revision` | đổi khi key/harness đổi; Piagent so sánh để biết có phải enroll lại (`P/scripts/piagent-studio.mjs:49`, `M/session.mjs:342-347`) |

Kiểm tra khi khởi động (`M/binding-wait.mjs:20-26`): `null` nếu mọi path và hash
khớp; `'entrypoint'` nếu chỉ hash launcher lệch (vừa cập nhật Piagent); `'broker'`
nếu chỉ hash broker lệch (vừa cập nhật Agent Watch); `'other'` cho mọi trường hợp
khác -> `managed-launch-binding-changed`. Với `'entrypoint'` hoặc `'broker'` mà
binding cũ hơn bản cài, launcher chờ tới 90 s để Agent Watch ghi binding mới
(`awaitRebind`, `M/binding-wait.mjs:76-87`), lỗi chờ: `managed-binding-update-pending`
hoặc `managed-binding-watch-not-running`.

File liên quan: `~/.pi/agent/piagent-runtime.json`
`{"schema_version":1,"entrypoint":"/abs/…/scripts/piagent-studio.mjs","node":"/abs/node","pi_sdk_root":"/abs/…"}`
do `piagent` ghi (`P/scripts/piagent-cli.mjs:167-169`) và Agent Watch đọc
(`W/StudioManagedConfiguration.swift:41-50`) để chọn runtime khi tạo binding.

### 8.2 Status của company: `~/.pi/agent/status/company/<hash>.json`

- Người ghi: company Gateway, mỗi 2 giây, mỗi conversation một file; ghi qua file
  tạm rồi `rename`, quyền `0600`, thư mục `0700`
  (`P/packages/piagent-webui/gateway/agent-status-files.ts:48-77`,
  khởi tạo ở `gateway-service.ts:255`).
- Người đọc: Agent Watch (`W/PiagentStatus.swift:36-56`), bỏ qua file > 16 384 byte
  hoặc parse lỗi; với cùng `conversation` giữ bản `updated_at` mới nhất.
- Tên file: `sha256(sessionRef).hex.slice(0,32) + ".json"` (`:25`).
- Xóa file của conversation đã archive, quá 24 giờ không đổi, hoặc không còn
  phục vụ (`:66,74`). Không ghi lại nếu `state`, `kind`, `helpers`, `title` không đổi
  (`:69`).
- Nội dung (không bao giờ có prompt hay câu trả lời):

```json
{
  "schema_version": 1,
  "conversation": "<sessionRef>",
  "title": "…≤80 ký tự…",
  "project": "…≤80 ký tự…",
  "company": true,
  "state": "working",
  "kind": "permission",
  "ended": "done",
  "helpers": 0,
  "since": "2026-01-01T00:00:00.000Z",
  "updated_at": "2026-01-01T00:00:05.000Z"
}
```

| Trường | Kiểu / giá trị |
|---|---|
| `schema_version` | `1` (Swift không giải mã trường này) |
| `conversation` | sessionRef |
| `title`, `project` | chuỗi; cắt 80 ký tự (thêm `…`) |
| `company` | `true` cho file ở `status/company` |
| `state` | `idle` \| `working` \| `blocked` \| `done` \| `error` |
| `kind` | chỉ khi `blocked`: `permission` \| `question` \| `auth` |
| `ended` | chỉ khi `done`/`error`: `done` \| `stopped` \| `failed` |
| `helpers` | số helper đang chạy (>= 0) |
| `since` | thời điểm bắt đầu `state`/`kind` hiện tại (giữ nguyên nếu không đổi) |
| `updated_at` | ISO 8601 lần ghi cuối |

Suy ra `state` (`statusOf`, `:28-44`): `waiting-approval` -> `blocked/permission`;
`needsAttention` khi `running|idle` -> `blocked/question`; `running|paused` ->
`working`; `recovery-required` -> `error/failed`; nếu trước đó `working|blocked` -> `done`
với `ended = stopped` khi `managedProcess.outcome == "interrupted"`, ngược lại
`done`; còn lại giữ trạng thái kết thúc trước hoặc `idle`. Agent Watch tạo thông báo
khi `blocked` mới (mọi lần đọc) và khi `working|blocked` -> `done|error` (không ở lần
đọc đầu) (`W/PiagentStatus.swift:80-110`). Thư mục `status/dashboard` dùng
cùng định dạng (`company:false`).

### 8.3 File trạng thái khác trong store của member

Store: `~/Library/Application Support/AgentWatch/ManagedSessions/<store slot>` trên
macOS; trên Linux `${XDG_DATA_HOME:-~/.local/share}/agentwatch/ManagedSessions/…`
(`M/store.mjs:15-18`). `<store slot>` là slot đang có nhiều conversation nhất của
member (hash `sha256("piagent-company-member-v1\0" + origin + "\0" + userId
thường)`), các slot khác trỏ tới nó qua file `store` (`M/store.mjs:28-76`).

| File | Nội dung |
|---|---|
| `<slot>/member` | hash member (hex 64) |
| `<slot>/store` | slot của store chung (hex 64) |
| `sessions/*.jsonl` | conversation của Pi |
| `logs/studio-link.jsonl` | JSON lines của `StudioLink`: `{at, kind: "studio_wait" \| "studio_disconnect" \| "turn_retry", …}`; xoay vòng ở ~2 MB thành `.1` (`M/studio-link.mjs:224-233`) |
| `studio-capabilities.json` | `{scope, at, names}` (6.2) |
| `memory-known.json` | `{origin, scope, at, protocol?}` |
| `memory-outbox-v2/<scope>/<event_id>.json` | record outbox của memory (`M/memory-outbox.mjs`) |

### 8.4 Entry tùy biến trong session JSONL (hợp đồng nội bộ với Gateway/WebUI)

`agent-watch-scope` (`{origin, key_id, user_id, studio_instance_id, dataset_epoch,
auth_generation}`), `agent-watch-run` (`{run_id, state: active|closed|abandoned}`),
`agent-watch-model`, `agent-watch-helpers` (`{active, maximum}`), `agent-watch-review`,
`agent-watch-fast`, `agent-watch-permission`, `agent-watch-bypass`,
`agent-watch-plan`, `agent-watch-objections`, `agent-watch-project`,
`agent-watch-memory`, `agent-watch-memory-turn`, `agent-watch-failure-detail`,
`agent-watch-baseline`, `agent-watch-workflow-context`, `agent-watch-turn-end`,
cùng các custom message `agent-watch-process`, `agent-watch-helper-receipt`,
`agent-watch-review-status`, `agent-watch-fast-notice`. Studio không đọc chúng;
`agent-watch-scope` và `agent-watch-run` quyết định chặn session và recover
(`M/session.mjs:144-164`).

## 9. Cách dựng bản giả để kiểm thử

Tài nguyên có sẵn trong repo Piagent:

- `P/tests/managed-studio-rpc.test.mjs:51` là một broker giả tối thiểu viết bằng
  Node: đọc từng dòng, `config` trả manifest, `close` trả `true`, mọi action khác
  trả grant với `token = "as_run_<role_id>_" + fence.padStart(43,"0")`. Manifest tối
  thiểu đủ cho `usable()`: `schema_version: 2`, `credential_mode: "managed"`,
  `authority`, `key_id`, `models[]`, `harness.configuration.main.model_ids`.
  Studio giả chỉ cần trả SSE cho `/…/messages`, 404 cho `/v1/capabilities`, 204 cho
  các route còn lại.
- `P/tests/managed-studio-link.test.mjs`, `managed-helper-settlement.test.mjs`,
  `managed-tool-failures.test.mjs`, `managed-workspace-report.test.mjs`,
  `managed-studio-capabilities.test.mjs`, `managed-team-memory.test.mjs`,
  `managed-memory-outbox.test.mjs`, `managed-failures.test.mjs`,
  `managed-provider-retry.test.mjs`, `managed-provider-error-resume.test.mjs`,
  `managed-studio-update-resume.test.mjs`, `managed-compressed-fetch.test.mjs`,
  `managed-call-purpose.test.mjs`, `managed-binding-wait.test.mjs`,
  `managed-store.test.mjs`, `managed-grant-share.test.mjs`,
  `managed-fast-mode.test.mjs`, `managed-harness-conformance.test.mjs`,
  `managed-crash-continue.test.mjs` (kiểm tra cả file status) kiểm từng phần ở trên.
- Phía Studio có thể xác thực hợp đồng bằng các test `managed_*_test.go` trong
  `S/` (không chạy trong lần đọc này).

Bộ kiểm thử đối chiếu tối thiểu cho bản viết lại trên stock Pi (mỗi dòng là một
khẳng định kiểm bằng broker giả và Studio giả):

1. Mỗi request model có `Authorization: Bearer <run token>`, `User-Agent:
   piagent/<ver>`, `X-Session-Id = role_id`, `X-Claude-Code-Session-Id` (chỉ main),
   `X-Agent-Purpose` đúng giá trị; body trỏ `provider_model_id` thật.
2. `renew` được gọi trước mỗi request và các request song song cùng role chỉ renew
   một lần.
3. `session_account_busy_retry_later` làm request chờ và hỏi lại tới 20 phút; các mã
   brief được hỏi lại 3 lần; `session_account_unavailable_start_new_session`
   dẫn tới rebind.
4. 404 ở `/v1/capabilities` tắt settle và workspace; danh sách có `managed.settle.v1`
   bật settle.
5. Báo cáo process phiên bản đúng khóa; chọn v3/v2/v1 theo `broker_features`.
6. Mất kết nối Studio: chờ heartbeat, sau đó gửi `disconnects` kèm token kế tiếp.
7. Binding lệch hash: chờ 90 s rồi lỗi `managed-binding-*`.
8. File status company đủ trường và tên file `sha256(ref)[0:32].json`.

## 10. Khoảng trống và điều chưa chắc

1. Cổng Windows của Agent Watch (`windows/…/StudioError.cs`, `Program.cs`) chưa
   được đối chiếu; giả định cùng giao thức broker như bản Swift. Cần đọc trước khi
   chốt hợp đồng cho Windows.
2. Studio hiện hành không phát `helper_slots` (không thấy trong `SI/ledger` hay
   `SI/runs`), nên tính năng `helper-slots` hiện không bao giờ bật dù code client
   hỗ trợ; chưa rõ đây là cố ý hay chưa triển khai phía server.
3. Đường dẫn lưu trữ: nguồn đọc dùng `~/.pi/agent` cho binding và status, trong khi
   ghi nhớ dự án nói từ 1.46.0 không ghi vào `~/.pi/agent` mà dùng
   `~/.piagent/agent`. Chưa kiểm tra cách Agent Watch tìm binding và status ở
   đường dẫn mới; phải đối chiếu `W/PiagentStatus.swift:31-33` và
   `W/StudioManagedConfiguration.swift:80` với bản chạy thực.
4. Header xác thực chính xác mà adapter Pi gửi tới `/claude` (Bearer hay `x-api-key`),
   và các header phiên của Codex, do thư viện provider của Pi quyết định; tài liệu
   này chỉ khẳng định phía Studio chấp nhận cả hai và nhận biết các header session
   nêu ở 4.1. Cần chụp request thật để khóa trong kiểm thử.
5. Capability `requests.cancel.v1`, `search.v1`, `memory.v4`, `managed.supersede.v1`
   được Studio phát nhưng client không kiểm (dựa vào 404/protocol); lần đầu trên một
   Mac mới, workspace/settle có thể bị bỏ ở round đầu vì danh sách capability chỉ
   nạp từ đĩa hoặc làm mới không chờ (`M/memory.mjs:479`). Chưa kiểm chứng bằng chạy
   thực.
