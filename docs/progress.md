# Tiến độ giai đoạn 2

Cập nhật sau mỗi bước con. Mỗi dòng có bằng chứng (lệnh, kết quả rút gọn).

## 2.0 Chuẩn bị

| Việc | Trạng thái | Bằng chứng |
|---|---|---|
| Tạo 4 repo public | xong | `gh repo create Vt-mmm/piagent-{provider,sandbox,harness,bundle} --public` |
| Skeleton + CI + lockfile | xong (chờ CI chạy lần đầu) | `npm test` local: 2 pass mỗi repo |
| Branch protection, secret scanning, push protection | xem mục dưới | |
| studio-contract.md, parity.md, baseline | đang làm | |
| studio-contract.md | viết xong, chờ owner duyệt; chưa chạy thử với broker giả | 1000 dòng, trích file:line; 5 khoảng trống ghi cuối file |
| parity.md | viết xong, chờ owner duyệt | 141 tính năng; 16 mục I1–I16 chưa chắc làm được trên Pi 1.3.0 (QUESTIONS.md) |
| baseline-studio-metrics.md | số liệu Studio 14 ngày Team A xong (SELECT chỉ đọc) | 328 run, 1,48% gateway lỗi, 325 disconnect |
| baseline soak lane + A/B của `piagent studio` | CHƯA CHẠY | |
| CI lần đầu trên 4 repo | xem `gh run list` | |
| Spike I1 (chặn /model, /login, /share, /bug) | ĐẠT trên Pi 1.3.0 | `python3 docs/spikes/i1-i4/drive.py "/model" "/share"` → cảnh báo "bị chặn trong chế độ công ty" |
| Spike I4 (ép thinking theo Harness) | ĐẠT bằng hoàn lại, UI nháy một lần | `/thinking low` → log `reverted low -> now medium`; chưa kiểm Shift+Tab |

## 2.1 Provider (PR Vt-mmm/piagent-provider#3, branch `feat/provider`)

Mọi bằng chứng dưới đây chạy với Studio và broker GIẢ LẬP (không gọi Studio, model, Keychain thật). `npm test` trong piagent-provider: 65 pass.

| Nghiệm thu B | Trạng thái | Bằng chứng |
|---|---|---|
| 1. Một model "Auto (công ty)"; chặn `/login /model /scoped-models /share /bug` | ĐẠT một phần | Pi 1.3.0 thật qua pty (`tests/pi-smoke.test.mjs`): cả 5 lệnh hiện "Lệnh /x bị chặn trong chế độ công ty"; Ctrl+P: "Only one model in scope". Footer hiện id `agent-watch-auto`, không phải tên (QUESTIONS 5). Một-model dựa vào `enabledModels` của launcher + hoàn `model_select`. |
| 2. Grant theo run qua broker, đăng ký lại token ở `turn_start`, không hook `context`, reset chỉ khi `messageType==='user'`; 3 wire; đổi model giữa hội thoại | ĐẠT (giả lập) | `tests/provider.test.mjs`: Anthropic, Responses, Chat Completions đều `authorized`; renew đúng 1 lần mỗi turn; 4 run liên tiếp đổi Claude→Codex→vendor→Claude không lỗi; lịch sử có thinking có chữ ký của Claude chạy tiếp trên Codex và vendor. `pi -p` thật: broker `grant…close` đủ. |
| 3. Thinking theo Harness | ĐẠT (giả lập) | `thinking_level_select` mức cấm bị hoàn về mức trước, hoặc mức gần nhất; run xin mức gần nhất Harness cho (`tests/small-modules.test.mjs`, `provider.test.mjs`). Chưa kiểm Shift+Tab; UI có thể nháy một lần. |
| 4. Session id cố định; chờ Studio không giới hạn; log `disconnect` | ĐẠT (giả lập) | Cùng `X-Claude-Code-Session-Id` qua 4 request/2 wire. Studio giả tắt ≥ 120 s (fake clock): lượt chờ rồi chạy tiếp, `logs/studio-link.jsonl` có `studio_disconnect` `resumed`, báo `POST /studio/v1/managed/disconnects`. Stop kết thúc chờ. Giới hạn: QUESTIONS 7. |
| 5. Không token trong env, file, log | ĐẠT (giả lập) | `tests/no-token-leak.test.mjs` grep `as_run_` trên stream, bus, UI, entry hội thoại, đăng ký provider, stdout/stderr, mọi file ở state dir, `process.env`; tắt hàm che secret thì test đỏ. `pi -p` thật cũng grep sạch. |

Chưa kiểm: chạy thật Claude/Codex qua Agent Watch của mini (chưa có đồng ý của owner); Windows; Shift+Tab; tool failures/workspace/memory/settle (module của harness); `helper_slots` thật từ Studio.

### Chạy thật trên mini (29/10, owner đồng ý trong chat)

Agent dir tạm, `env -i`, binding thật chỉ đọc (origin `<local-studio-address>`, Studio local; không xác nhận được key là key test). `pi -p` hai lượt qua broker Agent Watch thật: (1) "trả lời đúng một từ: ok" → `ok`, model `claude-opus-5-5` / `anthropic-messages`, entry `agent-watch-run` `closed`; (2) câu hỏi có tool call, 3 lần gọi model (`stop`, `toolUse`, `stop`), đúng. `as_run_` không có trong stdout, stderr hay file nào của agent dir tạm. CHƯA kiểm: Codex run (Harness của key này chỉ route về Claude), vendor Chat Completions, `helper_slots`.

### Chạy thật Claude và Codex qua broker (29/10, lần 2) — xem `protocol-sync.md`

Manifest: main auto `[claude-opus-5-5, gpt-6-astra]`, `thinking_levels=[medium]`, `helper_slots=3`. Studio luôn giao main cho Claude (5 lần `start`); `child review` giao Codex `gpt-6-astra`. Codex vì vậy được kiểm qua grant `review` (wire Responses thật). Một phiên, cùng session id: 3 lượt Claude (tool call + thinking) → Codex nhận cả lịch sử Claude, tool call → Claude lượt 4: toàn 200, không `503 session_account_busy_retry_later`, 5 run `closed`, `as_run_` không xuất hiện ở đâu. Thinking đúng mức Harness (`medium`). Tìm ra và sửa: User-Agent (Studio không nhận ra `piagent-provider/`), `/v1/capabilities` bằng token của `start` (401), stream helper thiếu mức thinking (401 `invalid_run_grant`). Cần Studio (chỉ ghi): mã lỗi riêng cho thinking lệch. Chưa kiểm: vendor Chat Completions, Studio tắt/bật thật, `disconnects`/`cancel`/gzip thật, `recover`. Dòng "Codex chưa kiểm" ở mục trước nay đã cũ.
