# Tiến độ giai đoạn 2

Cập nhật sau mỗi bước con. Mỗi dòng có bằng chứng (lệnh, kết quả rút gọn).

## 2.0 Chuẩn bị

| Việc | Trạng thái | Bằng chứng |
|---|---|---|
| Tạo 4 repo public | xong | `gh repo create Vt-mmm/piagent-{provider,sandbox,harness,bundle} --public` |
| Skeleton + CI + lockfile | xong (chờ CI chạy lần đầu) | `npm test` local: 2 pass mỗi repo |
| Branch protection, secret scanning, push protection | xem mục dưới | |

| piagent-bundle: manifest sha256, kiểm hash, doctor, launch plan | xong phần logic, test offline | `npm test` 6 pass (hash lệch → `hash-mismatch:sandbox`; plan chỉ chứa đường dẫn bộ; env agent dir riêng). Đóng gói và chạy trên mini: xem 2.5. |
| runbook.md | bản nháp | các bước chưa kiểm trên máy thật |
| 2.4b agentwatch (macOS) | PR mở, chưa merge: https://github.com/Vt-mmm/agentwatch/pull/18 | `swift test` 371 test, 0 lỗi; 8 test mới: đường piagent trùng snapshot trước thay đổi, hash lệch không mở, key không vào tiến trình Pi. Windows chưa làm (không có dotnet). Cần chốt với harness: biến `AGENT_WATCH_MANAGED_BINDING`. |
| 2.4a agent-studio | xem session p2-studio | |
| Quét secret/IP lịch sử git (4 repo, tạm thời, 29/10) | chưa có gitleaks; grep regex | `git log --all -p \| grep -E 'gho_…\|sk-…\|as_run_…\|AKIA…\|PRIVATE KEY\|IP riêng'` → chỉ trùng chuỗi phiên bản trong package-lock (false positive). Chạy lại gitleaks trước release. |
| studio-contract.md, parity.md, baseline | đang làm | |
| studio-contract.md | viết xong, chờ owner duyệt; chưa chạy thử với broker giả | 1000 dòng, trích file:line; 5 khoảng trống ghi cuối file |
| parity.md | viết xong, chờ owner duyệt | 141 tính năng; 16 mục I1–I16 chưa chắc làm được trên Pi 1.3.0 (QUESTIONS.md) |
| baseline-studio-metrics.md | số liệu Studio 14 ngày VNexus BE xong (SELECT chỉ đọc) | 328 run, 1,48% gateway lỗi, 325 disconnect |
| baseline soak lane + A/B của `piagent studio` | CHƯA CHẠY | |
| CI lần đầu trên 4 repo | xem `gh run list` | |
| Spike I1 (chặn /model, /login, /share, /bug) | ĐẠT trên Pi 1.3.0 | `python3 docs/spikes/i1-i4/drive.py "/model" "/share"` → cảnh báo "bị chặn trong chế độ công ty" |
| Spike I4 (ép thinking theo Harness) | ĐẠT bằng hoàn lại, UI nháy một lần | `/thinking low` → log `reverted low -> now medium`; chưa kiểm Shift+Tab |

## 2.1 Provider (PR Vt-mmm/piagent-provider#3, branch `feat/provider`)

Mọi bằng chứng dưới đây chạy với Studio và broker GIẢ LẬP (không gọi Studio, model, Keychain thật). `npm test` trong piagent-provider: 65 pass.

| Nghiệm thu B | Trạng thái | Bằng chứng |
|---|---|---|
| 1. Một model "Auto (công ty)"; chặn `/login /model /scoped-models /share /bug` | ĐẠT một phần | Pi 1.3.0 thật qua pty (`tests/pi-smoke.test.mjs`): cả 5 lệnh hiện "Lệnh /x bị chặn trong chế độ công ty"; Ctrl+P: "Only one model in scope". Footer hiện id `agent-watch-auto`, không phải tên (QUESTIONS P5). Một-model dựa vào `enabledModels` của launcher + hoàn `model_select`. |
| 2. Grant theo run qua broker, đăng ký lại token ở `turn_start`, không hook `context`, reset chỉ khi `messageType==='user'`; 3 wire; đổi model giữa hội thoại | ĐẠT (giả lập) | `tests/provider.test.mjs`: Anthropic, Responses, Chat Completions đều `authorized`; renew đúng 1 lần mỗi turn; 4 run liên tiếp đổi Claude→Codex→vendor→Claude không lỗi; lịch sử có thinking có chữ ký của Claude chạy tiếp trên Codex và vendor. `pi -p` thật: broker `grant…close` đủ. |
| 3. Thinking theo Harness | ĐẠT (giả lập) | `thinking_level_select` mức cấm bị hoàn về mức trước, hoặc mức gần nhất; run xin mức gần nhất Harness cho (`tests/small-modules.test.mjs`, `provider.test.mjs`). Chưa kiểm Shift+Tab; UI có thể nháy một lần. |
| 4. Session id cố định; chờ Studio không giới hạn; log `disconnect` | ĐẠT (giả lập) | Cùng `X-Claude-Code-Session-Id` qua 4 request/2 wire. Studio giả tắt ≥ 120 s (fake clock): lượt chờ rồi chạy tiếp, `logs/studio-link.jsonl` có `studio_disconnect` `resumed`, báo `POST /studio/v1/managed/disconnects`. Stop kết thúc chờ. Giới hạn: QUESTIONS P7. |
| 5. Không token trong env, file, log | ĐẠT (giả lập) | `tests/no-token-leak.test.mjs` grep `as_run_` trên stream, bus, UI, entry hội thoại, đăng ký provider, stdout/stderr, mọi file ở state dir, `process.env`; tắt hàm che secret thì test đỏ. `pi -p` thật cũng grep sạch. |

Chưa kiểm: chạy thật Claude/Codex qua Agent Watch của mini (chưa có đồng ý của owner); Windows; Shift+Tab; tool failures/workspace/memory/settle (module của harness); `helper_slots` thật từ Studio.

### Chạy thật trên mini (29/10, owner đồng ý trong chat)

Agent dir tạm, `env -i`, binding thật chỉ đọc (origin `http://127.0.0.1:17922`, Studio local; không xác nhận được key là key test). `pi -p` hai lượt qua broker Agent Watch thật: (1) "trả lời đúng một từ: ok" → `ok`, model `claude-opus-5-5` / `anthropic-messages`, entry `agent-watch-run` `closed`; (2) câu hỏi có tool call, 3 lần gọi model (`stop`, `toolUse`, `stop`), đúng. `as_run_` không có trong stdout, stderr hay file nào của agent dir tạm. CHƯA kiểm: Codex run (Harness của key này chỉ route về Claude), vendor Chat Completions, `helper_slots`.
## 2.3 Harness (PR Vt-mmm/piagent-harness#3, branch `feat/harness`, commit `d5de142`)

Mọi bằng chứng chạy với Studio, bus, provider và sandbox GIẢ LẬP (không gọi Studio, model, Keychain thật; không ghi `~/.pi/agent`). `npm test` trong piagent-harness: 145 pass, 0 fail, ~2 giây, không dòng nào quá 200 ký tự.

| Nghiệm thu D | Trạng thái | Bằng chứng (`node --test tests/<file>`) |
|---|---|---|
| Cổng hoàn tất: sửa code không chạy check bị gửi lại | ĐẠT | `harness-completion-gate`: 9 pass ("no check sends back", check cũ hết hiệu lực sau sửa, docs-only, hết vòng thì "unverified", bị dừng thì "interrupted") |
| `npm test \| tail` có fail không tính pass | ĐẠT | cùng file: "piped check: failing output is not a pass"; `0 failed` không bị tính nhầm |
| `pytest -k x`, `tsc --version` không là check | ĐẠT | cùng file: 8 lệnh lọc/version → `isCheckCommand` false; `pytest`, `tsc --noEmit`, `go test ./...` → true |
| Sửa file test/CI chuyển làn rủi ro | ĐẠT | `harness-test-edit-lane`: 4 pass; patch 1 file test → `risky`, "suggest" thành "require" |
| Vòng sửa verify và review riêng | ĐẠT | `harness-fix-loop-counters`: 3 pass; `max_fix_loops=1` vẫn cho 1 vòng review sau khi hết vòng verify; `fix_loops` báo cáo = tổng |
| Check từ `## Checks` rồi manifest | ĐẠT | `harness-checks-source`: 4 pass |
| Helper review: session Pi con chỉ đọc, grant riêng `child` qua bus, kết quả qua tool schema, lỗi chặn gửi lại agent | ĐẠT (bus giả) | `harness-review-helper`: 9 pass; tool con chỉ `read grep find ls submit_review` (không edit/write/bash); `grant.request {role, slot}`/`grant.close`; JSON viết trong văn bản bị bỏ qua; không gọi tool thì hỏi lại 1 lần rồi "unverifiable"; blocking gửi lại agent. CHƯA kiểm với provider/sandbox thật |
| Reviewer chỉ đọc file đã đổi | ĐẠT | cùng file: prompt "Since your last review only these files changed: ..."; `harness-review-split` focus chỉ các phần có file đổi |
| Patch > 120 KB chia phần | ĐẠT | `harness-review-split`: 7 pass; 4 file x 50 KB → 2 phần, mỗi phần <= 120 KB, mỗi phần một lần hỏi child, gộp finding; file > 400 KB ghi "Not read"; > 96 phần thì `too-large` |
| Ledger, phản đối brief: bất đồng lần hai chuyển member, lượt kết "disputed" | ĐẠT | `harness-ledger-objections`: 6 pass; phản đối lần hai → `managed-helper-disputed`, `outcome: disputed` ở v3 và outcome cũ ở v2 |
| Settle đúng cho từng helper succeeded/failed/cancelled/unverifiable | ĐẠT (stub Studio) | `harness-helper-settle`: 6 pass; body `/v1/managed/settle` có `spec`; thử lại 500ms/2s khi 5xx/429, không thử khi 4xx; không có `managed.settle.v1` thì không gửi |
| Số lần gọi helper từ Studio, mặc định cũ | ĐẠT | `harness-helper-limit`: 9 pass; `helperLimit` 2 → lần 3 bị từ chối; không có → 8 |
| `ask_user` trong Terminal Pi; headless nói rõ giả định | ĐẠT (UI giả) | `harness-ask-user`: 6 pass; chưa chạy trong TUI thật |
| Team memory, `memory_ask` protocol 3, lessons chỉ từ bằng chứng | ĐẠT (Studio stub) | `harness-memory`: 15 pass; brief, ask (timeout 50 s, nguồn), retain + outbox + quarantine, lesson chỉ khi check fail → sửa → pass; rerun không đổi gì không là lesson |
| Làm tiếp checklist tối đa 30 bước, dừng sau 2 vòng không đổi | ĐẠT | `harness-continuation`: 9 pass; `harness-extension` chạy vòng đầy đủ |
| Compaction 90% hoặc 300k, giữ plan | ĐẠT (logic) | `harness-compaction`: 5 pass; 1M cửa sổ → 300k; plan nằm trong instructions và tin `agent-watch-plan-kept`. Chưa chạy compaction thật của Pi |
| Process report v3 đủ trường như bản cũ | ĐẠT | `harness-process-report`: 7 pass; so từng byte với báo cáo `RunProcess` của Piagent 1.47.0 trên cùng kịch bản (`tests/fixtures/process-report-golden.json`) cho v1, v2, v3 |
| Chặn mọi tool call khi 7 tool lõi không từ sandbox, báo Studio | ĐẠT | `harness-toolset-guard`: 6 pass; extension giả đăng ký `bash` → chặn + `tool-failures` code `managed_toolset_untrusted`; sourceInfo mẫu đo trên Pi 1.3.0 thật |
| Pi 1.3.0: reset cổng chỉ khi `messageType === 'user'`, token đăng ký lại ở `turn_start` (provider) | ĐẠT (phần harness) | `harness-extension`: "the gate resets only when before_agent_start is a member's message" |
| UI công ty: header, footer không USD, `/style`, file trạng thái Agent Watch | ĐẠT (logic) | `harness-company-ui`: 7 pass; định dạng khớp `agentwatch/Sources/AgentWatchCore/PiagentStatus.swift` |

Đã chạy với provider và sandbox thật ở 2.5 (grant child, `tools.child`, `run.state`; xem 2.5). Chưa kiểm: TUI thật cho `ask_user`; Studio thật; A/B eval với baseline 2.0; Windows; thư mục nhiều repo cho team memory; báo cáo process từng vòng checklist (QUESTIONS H13); khi `pi` thật chạy `agent_before_settle` với chuỗi gửi lại liên tiếp.


## 2.2 Sandbox (PR Vt-mmm/piagent-sandbox#3, branch `feat/sandbox`)

Mọi bằng chứng chạy OFFLINE: HOME giả trong thư mục tạm, registry giả trên 127.0.0.1, không Studio, không model, không Keychain hay Agent Watch thật. `npm test`: 109 test, 17 giây trên mini (macOS). CI trên PR: macos-latest 109 pass; ubuntu-latest 101 pass, 8 skip (chỉ macOS: `start_process`, chẩn đoán TS, dọn process lạc), 0 fail (https://github.com/Vt-mmm/piagent-sandbox/actions/runs/40872870788).

| Nghiệm thu C | Trạng thái | Bằng chứng |
|---|---|---|
| 1. 7 tool lõi bị thay, `getAllTools()` cho nguồn là piagent-sandbox | ĐẠT | `node --test tests/sandbox-core-tools.test.mjs` → 6 pass. Pi 1.3.0 thật nạp package (`DefaultResourceLoader` + `additionalExtensionPaths`): `bash read edit write grep find ls` có `sourceInfo.path` = `<package>/src/index.mjs`, không còn `builtin:`; `piagent:tools.attest` ghi `{name, source:'piagent-sandbox'}` cho cả 7. Lưu ý cho harness (F120): `sourceInfo.source` là `cli` khi nạp bằng `-e`, nên kiểm theo `sourceInfo.path` nằm trong thư mục package và theo `tools.attest`, không theo chuỗi `source`. Tool `powershell` dựng sẵn của Pi vẫn còn (chỉ liên quan Windows native). |
| 2. Bộ test chặn trên macOS và Linux | ĐẠT | `tests/sandbox-blocklist.test.mjs` 7 pass trên cả hai CI: không đọc được `~/.ssh`, Keychain, `.env`, `.npmrc`, file Agent Watch (HOME giả); không ghi ngoài project, không đổi `.env`/`.npmrc` của project; kết nối `192.0.2.1`, `10.0.0.1`, `169.254.169.254`, `8.8.8.8` bị từ chối ngay (không timeout); `curl https://example.com` thất bại; đọc/ghi/sửa/grep/ls và `node --test` trong project chạy; server 127.0.0.1 do lệnh tự mở gọi được. IP nội bộ + DNS rebinding: `tests/sandbox-package-proxy.test.mjs` (proxy trả 403 cho tên được phép mà phân giải ra `127.0.0.1`, `10.x`, `::1`, `::ffff:7f00:1`, `fd00::1`, hoặc một đáp án riêng lẫn một công khai) và `tests/sandbox-ip-policy.test.mjs` 4 pass. |
| 3. `npm install`, `pip install` trong venv qua proxy; host lạ `managed-domain-blocked` | ĐẠT | `tests/sandbox-package-proxy.test.mjs` 9 pass (macOS và Linux CI). Registry giả (npm packument+tarball, PyPI simple+wheel) trên 127.0.0.1, proxy được chỉ `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org` về đó: `npm install fakepkg` và `python3 -m venv .venv && pip install fakepip` chạy không hỏi và import được. `curl` tới `unknown-registry.example` và `npm install --registry=http://stranger.example/` lỗi `managed-domain-blocked: … Host bị chặn: unknown-registry.example … run_with_network`; registry giả không nhận request nào. |
| 4. Tool xin duyệt theo Ask first / Full access / Bypass | ĐẠT (tác dụng phụ trên máy được giả) | `tests/sandbox-approval-tools.test.mjs` 11 pass, `tests/sandbox-permission-modes.test.mjs` 5, `tests/sandbox-handoff-policy.test.mjs` 4, `tests/sandbox-run-on-host.test.mjs` 6, `tests/sandbox-fetch-origin.test.mjs` 3. Ask first: `run_with_network`, `run_with_docker`, `run_on_host`, `run_on_simulator` đều hỏi (4 lần hỏi); Full access chạy network/Docker/simulator, hỏi push và `docker compose down -v`; Bypass chạy cả `down -v`, vẫn hỏi `git push`, `gh pr create`, `npm publish`, `vercel deploy`, `docker push`; `run_on_host` hỏi mỗi lần ở cả ba mode (kể cả Bypass); từ chối thì lệnh không chạy và không bị hỏi lại; `start_docker` hỏi ở Ask first, tự chạy ở Full/Bypass, chờ engine; `fetch_origin` hỏi ở Ask first, tải nhánh vào `refs/remotes/origin/*` qua sandbox, file đang làm không đổi; `/bypass on` cần Harness cho (`piagent:run.state.harness.bypassMode`) và có hỏi xác nhận. `docker`, `xcrun`, `git push` thật KHÔNG được chạy trong test. |
| 5. `start_process` tối đa 4, qua nhiều lượt, dừng khi hết hội thoại hoặc sau 4 giờ | ĐẠT (macOS) | `tests/sandbox-start-process.test.mjs` 5 pass: server Node sống qua `agent_settled` của lượt, đọc đến dòng `server ready`, đọc lần hai không lặp; process thứ 5 bị `managed-process-limit`, dừng một thì có chỗ; timer 4 giờ là đồng hồ giả (`clock` truyền vào) — gọi nó thì process dừng với lý do "its 4-hour lifetime ended" và pid biến mất; `session_shutdown` dừng hết (kiểm pid). Linux/WSL: chưa có (F011, F037), 4 test skip trên CI Linux. |
| 6. `/undo` | ĐẠT | `tests/sandbox-undo.test.mjs` 6 pass: lượt 2 tạo/sửa/xóa file, `/undo` trả đủ, `/undo` nữa lùi lượt 1, lần ba báo hết; HEAD và index (`git write-tree`) không đổi, file staged vẫn staged, file `.gitignore` ngoài checkpoint; file bị member sửa lại sau lượt thì từ chối và không đụng file nào; từ chối khi đang chạy lượt; checkpoint lỗi (snapshot ném lỗi) không chặn edit; 4000 file + project không có git chạy được (vài giây). |
| 7. Lỗi TypeScript hiện kèm kết quả sửa file | ĐẠT (macOS) | `tests/sandbox-ts-diagnostics.test.mjs` 4 pass (TypeScript 5.9.3 pin làm devDependency): ghi `src/add.ts` có `const oops: string = add(1,2)` → kết quả có `[TypeScript, tsconfig.json] 1 error(s) in src/add.ts after this change` và `src/add.ts:2:… TS2322`; sửa lại thì ghi chú biến mất; project không có TypeScript hoặc file `.txt` thì không thêm gì. TS 6 (language service) và TS 7 (tsc native) giữ nguyên code cũ, CHƯA có test riêng. Linux: không có (như bản cũ). |
| 8. Windows WSL | CHƯA KIỂM | Máy mini không có WSL (`which wsl` → không có). Linux CI (ubuntu-latest, bubblewrap cài bằng apt, `kernel.apparmor_restrict_unprivileged_userns=0`) chạy được toàn bộ bộ test chặn, proxy, tool duyệt, undo. Chưa kiểm: interop Windows trong WSL2, `referenceFolders` với profile Windows, Docker Desktop qua WSL, đường dẫn `/mnt/c`. |

Thêm: `user_bash` (`!`, `!!`) chạy qua sandbox (`tests/sandbox-user-bash.test.mjs` 2 pass, F038); fetch guard `web_fetch` và cổng MCP ghi ra ngoài (`tests/sandbox-fetch-guard.test.mjs` 5); che secret (`sandbox-redaction` 1); `patch-snapshot` (4); profile Seatbelt/bubblewrap và terminal-seatbelt (8, chạy mọi OS).

Chưa làm/chưa kiểm (nói thẳng):
- Linux và WSL2 chỉ chạy trên CI, không chạy tay trên máy thật; macOS đã chạy cả cục bộ lẫn CI.
- Terminal `terminal-seatbelt` chỉ kiểm bằng pty giả (package không có node-pty; dashboard là giai đoạn 3).
- `run_with_docker`/`start_docker` kiểm bằng engine giả; chưa chạy Docker thật. `fetch_origin` kiểm bằng transport cục bộ, chưa gọi GitHub. `run_on_simulator` chỉ kiểm phần từ chối/duyệt, chưa chạy `xcrun simctl` thật.
- Không chạy qua Agent Watch/Studio thật.
- Không port (không thuộc 2.2 hoặc thuộc harness): freshness `ls/read` (F035), chia phần review lớn (`reviewParts`, `mergeReviews`), mutation observations, `source-revert-requests`, `BoundaryTerminals`/dashboard (F036 bỏ có chủ đích), pin hash của workspace worker, `servicesPrompt` (câu chữ cho system prompt, F119 của harness), tool `web_fetch` và `ask_user` (guard thì có).

## 2.4a agent-studio (29/10)

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| `runtime = piagent \| pi` theo team và key, migration 085, API admin, tab UI | xong, PR mở, chưa merge/deploy | Vt-mmm/agent-studio#41; mặc định `piagent`, key ghi đè team |
| Manifest thêm `runtime`, `package_allowlist`, `min_bundle_version`, `helper_slots` (trần theo team) | xong | chỉ thêm trường; Agent Watch cần học trường mới vì broker mã hóa lại theo schema cố định |
| Bản bộ tối thiểu | xong | header `X-Studio-Bundle-Version` hoặc body `bundle_version`; chỉ runtime `pi` bị kiểm, khi Studio đặt `STUDIO_MIN_BUNDLE_VERSION`; bản cũ/thiếu → 426 `bundle_too_old` + lời nhắn tiếng Việt |
| Chỉ số tách theo runtime và bản bộ | xong | `GET /admin/teams/{id}/runtime-metrics`; join qua run, không lưu thêm, không có nội dung prompt |
| Test | `go vet`, `go test ./... -race` trên postgres:17.6 `studio_test`, `tsc --noEmit` đều qua | test chứng minh client cũ/runtime `piagent` chạy như trước |
| Còn lại cho owner | review + merge PR, đặt `STUDIO_MIN_BUNDLE_VERSION`, deploy khi sẵn sàng | UI chưa có chỗ đặt runtime riêng của key (chỉ API) |

## 2.5 Tích hợp ba package (branch `feat/integration`)

Mọi bằng chứng chạy OFFLINE trên mini (macOS, Node 22.23.3): Pi 1.3.0 thật, Studio và broker GIẢ (stdio), model giả theo kịch bản, HOME/agent dir/binding/project là thư mục tạm. Không gọi Studio, model, Keychain hay Agent Watch thật; không ghi `~/.pi/agent`, `~/.piagent/agent`. Ba package ở commit ghim trong `bundle.pins.json`: provider `1b40fa4`, sandbox `f1ac85b` (không đổi), harness `13afcba`. `npm test` ở bundle: 9 pass. `npm run test:e2e`: 11 pass, ~48 giây (build bộ ~10 giây từ GitHub + 5 file chạy Pi).

| Việc | Trạng thái | Bằng chứng |
|---|---|---|
| 1. Chốt lệch bus, hợp đồng v1 thống nhất | ĐẠT | `docs/package-contract.md` viết lại. 5 lệch thật tìm ra khi chạy cùng nhau và đã sửa (commit nhỏ trên đúng nhánh `feat/*`, mỗi cái có test): (1) harness không phát `tools.child.close` nên sandbox rò một boundary mỗi helper (harness `e0a278e`); (2) harness kiểm tập tool ở `session_start`, trước khi sandbox (nạp sau) attest, nên chặn nhầm phiên và báo Studio một toolset tốt (harness, test `the sandbox loads after the harness`); (3) provider chỉ phát `run.state` khi run bắt đầu, sau `before_agent_start` đầu của harness, nên **tin nhắn đầu của phiên chạy không có cổng hoàn tất**; sửa: phát ngay ở `session_start` (provider, test `session start tells the harness the Harness before any run exists`); (4) báo cáo `managed_toolset_untrusted` ở `before_agent_start` đầu không có run để dùng grant, bị bỏ và không thử lại; sửa: thử lại ở tool call bị chặn đầu (harness); (5) helper nhận `memory_search` dù Studio không có capability `memory` (harness). Binding: provider đọc `AGENT_WATCH_MANAGED_BINDING` (agentwatch#18 đặt biến này) và chấp nhận binding không có `model` (provider `32792b2`). H10 đã giải (QUESTIONS). |
| 2. E2E trên Pi 1.3.0 thật | ĐẠT (macOS chạy tay; CI xem dưới) | `npm run test:e2e`, file `tests/e2e/company.e2e.test.mjs`: |
| 2a. Toolset guard thấy sourceInfo từ sandbox | ĐẠT | cả 7 tool lõi có `sourceInfo.path` trong thư mục `piagent-sandbox`; `piagent:tools.blocked` không phát; không có `tool-failures` `managed_toolset_untrusted` |
| 2b. Vòng sửa lỗi với cổng hoàn tất | ĐẠT | model giả: `npm test` (fail) → `write` sửa → nói xong mà chưa chạy check → harness gửi lại ("Harness process check…", `npm test` lấy từ `## Checks` của AGENTS.md, đúng một lần) → `npm test` pass (`# pass 1`) → mới kết thúc; 5 request main |
| 2c. Helper review: grant `child` qua provider, tool chỉ đọc của sandbox | ĐẠT | broker thấy `child` cho role `review`; request của helper có tool `find grep ls read submit_review` (không edit/write/bash; không memory); helper đọc được `src/add.js` đã sửa qua tool `read` của sandbox; probe thấy `tools.child {readOnly:true, commands:false, key:'review'}` rồi `tools.child.close`; grant helper đóng |
| 2d. Process report v3 + settle khớp hợp đồng | ĐẠT | `close` của main mang report v3 đúng từng giá trị (`checks:2, checks_failed:1, verified, reviews:1, reviewed, fix_loops:1, outcome:'clean'`), qua `tests/e2e/helpers/contract.mjs` (luật Studio, có test riêng); `POST /v1/managed/settle` bằng token của helper `review`, body hợp lệ, `outcome:'succeeded'` |
| 2e. Không có `as_run_` | ĐẠT | grep stdout, stderr, mọi file trong thư mục tạm (agent dir, phiên, status, log), mọi request tới model, mọi body gửi Studio, bản ghi bus: không có. Token của broker giả tạo bằng ghép chuỗi lúc chạy để file broker cũng sạch |
| 2f. `/model` bị chặn | ĐẠT | qua pty (cần python3): `/model /login /scoped-models /share /bug` đều "bị chặn trong chế độ công ty"; Ctrl+P "Only one model in scope" |
| 2g. Extension giả chiếm `bash` | ĐẠT | extension nạp trước sandbox, đăng ký `bash` lúc `session_start`: `getAllTools()` cho `sourceInfo` của extension giả; mọi tool call trả `managed-toolset-untrusted`, lệnh giả không chạy, file không bị tạo, Studio nhận đúng một `tool-failures` (`managed_toolset_untrusted`). Thêm: đăng ký `bash` lúc nạp thì **Pi 1.3.0 từ chối khởi động** (status ≠ 0, không request model); extension nạp sau sandbox không chiếm được |
| 3. `scripts/build-bundle.mjs` | ĐẠT trên mini | `node scripts/build-bundle.mjs --out /private/tmp/claude-501/bundle-real-*/bundle` → `doctor.ok: true`, 150 MB, ~10 giây; Pi 1.3.0 riêng (`npm ci --ignore-scripts` từ `pi-lock/package-lock.json`, mọi dependency có integrity), ba package đúng commit lấy từ GitHub công khai, không script cài đặt, không dependency riêng. `bin/pi` = file `launchPlan` chạy; `node pi/bin/pi --version` → `1.3.0` với PATH `/usr/bin:/bin` (không dùng Pi global). Build hai lần ra cùng bốn hash (`86c4f55bc3 7e5919390f ca95b67724 c0bac432cb`). `node bin/piagent-bundle-doctor.mjs <bộ>` → `ok: true` (exit 0); thêm 1 byte vào `harness/src/bus.mjs` → `hash-mismatch:harness` (và `hash-mismatch:pi`, vì phần `pi` bao các package; QUESTIONS I20), exit 1. Test tự động: `tests/e2e/bundle.e2e.test.mjs` 5 pass |
| 4. Chạy cùng nhau trên CI | CHƯA CÓ KẾT QUẢ lúc viết | job `e2e` (ubuntu + macos) trong `.github/workflows/ci.yml`; điền kết quả sau khi PR chạy |

Chưa làm/chưa kiểm (nói thẳng):
- Chưa chạy e2e tay trên Linux và Windows; Linux chỉ qua CI.
- Studio, broker, model đều GIẢ. Chưa chạy bộ này qua Agent Watch/Studio thật, chưa thử Codex/vendor, chưa thử `helper_slots`, memory, `ask_user` trong TUI, compaction, làm tiếp checklist, Bypass.
- `launchPlan` chưa được Agent Watch (Swift, agentwatch#18) dùng thật: PR đó dựng argv/env riêng và đang thiếu `PI_OFFLINE`, `PI_TELEMETRY=0`, `PI_SKIP_VERSION_CHECK=1` (QUESTIONS I18). Chưa kiểm hash của Swift với bộ dựng ở đây (hai bên cùng thuật toán, nhưng chưa chạy Swift trên bộ thật).
- `pi -p` không in gì sau lượt có cổng hoàn tất (QUESTIONS I19).
- Chưa đo A/B với baseline 2.0.

## 2.6 Mục E: kiểm `runtime = pi` thật trên mini, cách ly (29/10)

Chạy trên mini bằng code thật của ba bên, trong môi trường **cách ly hoàn toàn**: không đụng `agent-studio-mini`, app Agent Watch đang chạy, Keychain, `~/.pi/agent`, `~/.piagent/agent`, `~/Library/Application Support/AgentWatch`. Studio và Agent Watch production giữ nguyên (kiểm lại sau cùng: 5 container `agent-studio-mini-*` còn nguyên, `:17920` trả 200, grep profile/origin/team của lần thử trong bốn thư mục trên: 0 file). Mọi thứ tạm đã xóa (xem "Dọn dẹp").

**Phiên bản đã thử.** Studio = agent-studio#41, commit `9aa792b`. Agent Watch = agentwatch#18, commit `cc242f2` (bản trước PR để so sánh: `536068a`). Bộ dựng bằng `scripts/build-bundle.mjs` của `feat/integration` (`1700a58`) với ba package ở commit sửa bảo mật: harness `b653b6c` (`fix/security-harness`), sandbox `b7e2d26` (`fix/security-sandbox`), provider `baa0789` (`fix/security-provider`); `--bundle-version 0.2.0-e2e`; Pi 1.3.0; `doctor.ok: true`. (`fix/security-bundle` #12 chỉ đổi `launchPlan` của JS, bản Swift không dùng nó: xem E10.) Node do Agent Watch ghim: `/opt/homebrew/bin/node` = 26.10.0.

**Dựng cách ly.**
- Studio: không chạy image/compose của Studio, vì connector thật cần tài khoản nhà cung cấp thật. Dùng đúng quy trình test của repo: bộ test `internal/httpapi` (gateway Studio thật + PostgreSQL + connector giả `studio-execute`, như `TestManagedDesktopBrokerSDKEndToEnd`). Một "test" thêm (`zz_iso_server_test.go`, không commit vào Studio) dựng fixture rồi giữ máy chủ sống: gateway lắng nghe `127.0.0.1:<cổng ngẫu nhiên>`, team + member + key managed TEST **tổng hợp**, Harness 1 model `studio-model`, `workflow {plan off, verify require, review require, max_fix_loops 2}`, model giả theo kịch bản (5 bước cho main: `npm test` fail → `write` sửa → nói xong → `npm test` pass → xong). Postgres riêng: compose project `studio-e2e-iso`, `postgres:17.6-alpine3.22` (đúng digest của repo), cổng `127.0.0.1:55449`, `tmpfs`, mật khẩu ngẫu nhiên. Nhân viên chạy như `go test -c` rồi chạy binary trên host (Go 1.27.3 có trên mini).
- Agent Watch: build `swift build --product agentwatch` từ `git archive` của hai commit vào thư mục tạm, rồi biên dịch (cùng cách `scripts/studio-qa/build-managed-broker-fixture.sh`) hai thứ: broker fixture của repo (`StudioManagedBrokerFixture`, `StudioManagedBroker.enroll` thật, nhận key từ `fixture.json` thay vì Keychain) và một probe nhỏ gọi **code production** `StudioManagedPiRuntime.prepare/launch/terminal`, `StudioManagedConfiguration.prepare/terminal`, `StudioClient.configuration`. Bộ đã dựng và broker nằm dưới một thư mục tạm trong `$HOME` (không phải `/tmp`, xem E9/F3).
- Key TEST tổng hợp chỉ có trong file `fixture.json` cạnh broker (thay Keychain, 0600) và trong DB tmpfs. Không dùng credential nào tìm thấy trên đĩa. Model là giả; không có cuộc gọi model thật nào.

| # | Hạng mục E | Kết quả | Bằng chứng (đã che) |
|---|---|---|---|
| E1 | Manifest có `runtime` | ĐẠT | `GET /studio/v1/client-config`: mặc định `runtime:"piagent"`, `min_bundle_version:null`, `helper_slots:3`; sau khi đặt team `pi` (`SetRuntime`): `runtime:"pi"`, `min_bundle_version:"0.2.0"` khi đặt sàn. Probe Swift giải cùng manifest: `StudioManagedRuntime.from → pi / piagent` theo từng lần gạt |
| E2 | Bộ quá cũ bị từ chối 426, lời nhắn tiếng Việt | ĐẠT ở Studio, **CHƯA ĐẠT từ đầu đến cuối** (F2) | sàn `0.2.0`, runtime `pi`: không header → 426; `0.1.9` → 426; `0.2.0` và `0.2.1` → cấp run. Body: `{"error":{"code":"bundle_too_old","message":"Bộ Piagent trên máy này đã quá cũ hoặc chưa báo phiên bản, … Hãy cập nhật bộ Piagent … (Agent Watch → Sửa cài đặt) rồi thử lại."}}` |
| E3 | `runtime = piagent` và client cũ chạy y như trước | ĐẠT | cùng sàn `0.2.0`, runtime `piagent`: không header và `0.1.9` đều cấp run (không bị kiểm). Mặc định không có sàn: mọi client chạy. Piagent 1.47.0 cũ (`piagent studio --prompt`, binding của đường cũ) sửa cùng bài: 5 request main, `add.js` đúng, thoát 0 |
| E4 | Hash Swift = hash JS | ĐẠT | `StudioManagedPiRuntime.prepare` đọc `manifest.json` của bộ vừa dựng và tự tính lại: bốn hash trong binding (`pi 1a75415a…`, `harness 0e46416f…`, `sandbox 92417814…`, `provider 4fdea6ca…`) trùng từng ký tự với `manifest.json`. (Trước đây ghi "chưa kiểm hash của Swift": nay đã kiểm) |
| E5 | Mở và làm xong task sửa lỗi có test qua launcher mới | ĐẠT (có giới hạn F1, F4) | Project tổng hợp (`add()` trừ; `AGENTS.md` có `## Checks`). Qua đúng argv/env của `StudioManagedPiRuntime.launch`: Pi 1.3.0 của bộ, 5 request main (`npm test` fail → `write` → nói xong → cổng hoàn tất gửi lại "Harness process check…" → `npm test` pass → xong), `add.js` đã sửa, thoát 0. Process report tới Studio: `outcome clean, verified, checks 2, fixLoops 1`. Làm cả hai kiểu: `-p` và **TUI thật** (chạy file `.command` mà "Mở Terminal" tạo, trong pty): thấy header "Piagent công ty · team …", ô nhập, trả lời "Xong: npm test đã pass.", `[agent-watch-process]` clean. Review helper **không chạy** (F4) |
| E6 | Lệnh mở thật | ĐẠT | xem khối bên dưới |
| E7 | Key không có trong env/argv của Pi | ĐẠT (có giới hạn) | môi trường là `env -i` với đúng 6 biến (`AGENT_WATCH_MANAGED_BINDING LANG PATH PI_CODING_AGENT_DIR PI_CODING_AGENT_SESSION_DIR TERM`); lấy mẫu `ps eww` mỗi 0,3 giây suốt các lần chạy `-p`: chỉ thấy đúng các biến đó, key không xuất hiện. Quét toàn bộ thư mục gốc `ManagedPi` (agent, phiên, status, log, project): key chỉ có trong `fixture.json` (chỗ thay Keychain); không có `as_run_` thật (chỉ trùng mã nguồn của provider). Giới hạn: ở TUI Pi đổi process title thành `pi` nên `ps` không đọc được argv/env, chỉ kiểm bằng cấu trúc (file `.command` + `env -i`) |
| E8 | Lệch hash 1 byte thì KHÔNG mở, gợi ý "Sửa cài đặt" | ĐẠT | thêm 1 byte vào `harness/src/bus.mjs`: `launch` và `terminal` đều dừng, không tạo file `.command`: «Bộ Pi không khớp bản đã pin (hash-mismatch:pi, hash-mismatch:harness). Chưa mở. Dùng “Sửa cài đặt” để cài lại.». Đổi 1 byte của broker: «Broker hoặc Pi đã đổi so với lúc đồng bộ. Chưa mở. Dùng “Sửa cài đặt”.». Trả lại file thì mở được. (Thiếu `manifest.json` không chặn mở: binding đã ghim hash từng phần; không cần thiết) |
| E9 | Gạt `runtime = piagent` thì lần mở sau dùng launcher cũ; hội thoại cũ vẫn mở bằng bản cũ | ĐẠT ở mức logic + đường cũ chạy thật; **CHƯA KIỂM bằng bấm app** | gạt `pi → piagent → pi` ở Studio: manifest và `StudioManagedRuntime.from` đổi theo ngay lần đọc sau (app chọn đường theo `sync.managedRuntime`). Đường cũ sau khi gạt: `--check` ("connected; … no inference sent") và `--prompt` xong bài. Hai thư mục tách: `ManagedPi/` chỉ có file của Pi (binding, bundle, agent, ManagedSessions), thư mục Piagent chỉ có `agent-watch-managed.json`; binding Piagent không bị đụng khi ghi binding Pi. Chưa kiểm: mở lại một hội thoại cũ (`--session`) và nút trong giao diện |
| E10 | Đường piagent cũ không đổi (so argv/env trước/sau) | ĐẠT | cùng đầu vào, build `536068a` (trước PR) và `cc242f2` (PR): `StudioManagedConfiguration.prepare` (binding JSON) và `terminal` (file `.command`: argv, `env -i PATH TERM LANG`) giống từng byte sau khi chuẩn hóa đường dẫn/UUID, ở cả hai trường hợp manifest `runtime = piagent` và `runtime = pi` (build cũ bỏ qua trường lạ) |
| E11 | Chỉ số Studio tách theo runtime | ĐẠT | `RuntimeMetrics` sau 12 run: `pi`: 11 run, process_reported 10, clean 10, tool_failures 11 (đúng: lần `npm test` đầu cố ý fail, `exit_1`); `piagent`: 1 run. `bundle_version` rỗng ở mọi dòng (F2); `client = piagent-provider/0.0.0` |
| E12 | Keychain thật, giao diện Agent Watch, đồng bộ (`StudioSyncStore`), "Sửa cài đặt" bằng bấm | **CHƯA KIỂM** | cần app đã cài + Keychain thật (không được ghi). `managed-authorize` của broker fixture luôn trả 0, nên **không** chứng minh bước chấp thuận Keychain |

**Lệnh mở thật** (do `StudioManagedPiRuntime.terminal` tạo, file `.command` một lần, tự xóa; `<B>` = thư mục bộ, `<R>` = `…/ManagedPi`):
```sh
cd <project> || exit 1
exec /usr/bin/env -i 'AGENT_WATCH_MANAGED_BINDING=<R>/agent-watch-managed-pi.json' 'LANG=en_US.UTF-8' 'PATH=/usr/bin:/bin' \
  'PI_CODING_AGENT_DIR=<R>/agent' 'PI_CODING_AGENT_SESSION_DIR=<R>/ManagedSessions' 'TERM=xterm-256color' \
  <node ghim, sha256 trong binding> <B>/pi/bin/pi --no-extensions \
  -e <B>/pi/packages/piagent-harness -e <B>/pi/packages/piagent-sandbox -e <B>/pi/packages/piagent-provider -e builtin:mcp
```
Binding `agent-watch-managed-pi.json` (0600) ghim: `runtime`, `profile_id`, `origin`, `pi_version`, `bundle_version`, `bundle_root`, hash bốn phần, `entrypoint` + sha256, `node` + sha256, `broker` + sha256, `agent_dir`, `session_dir`, `configuration_revision`. Không có HOME trong env (giống đường Piagent cũ).

**Phát hiện mới khi chạy thật** (chưa sửa; thuộc code của các PR khác, ghi để owner/phiên liên quan quyết):
- **F1 · Pi gọi mạng khi mở bằng launcher Swift** (khớp QUESTIONS I18). Env Swift thiếu `PI_OFFLINE=1`, `PI_TELEMETRY=0`, `PI_SKIP_VERSION_CHECK=1`; argv thiếu cờ của T6 (`--no-approve --no-skills --no-prompt-templates --offline`, `fix/security-bundle`). Lần mở TUI đầu trong agent dir trống: màn hình hiện "fd not found. Downloading… ripgrep installed to …/agent/bin/rg" (Pi tự tải `fd`, `rg` về `agent/bin`), và một lần lấy mẫu `-p` thấy kết nối `104.16.5.34:443` (không lặp lại ở 8 lần sau, nên không kết luận được nơi đến). Cách sửa: `StudioManagedPiRuntime.launch` đặt thêm ba biến và thêm cờ T6.
- **F2 · Sàn bản bộ không chạy được từ đầu đến cuối.** Không thành phần nào gửi bản bộ cho Studio: broker `start` chỉ gửi `operation_id, effort, task_class` (không `bundle_version`, không header `X-Studio-Bundle-Version`), nên cột `bundle_version` của `managed_runs` luôn rỗng và, **khi Studio đặt `STUDIO_MIN_BUNDLE_VERSION`, mọi run `pi` đều bị 426**, kể cả bộ mới. Hơn nữa broker đổi 426 thành `error:"serverUnavailable"` kèm `studio_code:"bundle_too_old"`; Pi không in lời nhắn tiếng Việt, chỉ đứng im (bị kill ở 60 giây). Cách sửa: broker gửi `bundle_version` từ binding (đã có trường `bundle_version`) và provider/harness dịch `studio_code:"bundle_too_old"` thành lời nhắn "Sửa cài đặt". **Đừng đặt `STUDIO_MIN_BUNDLE_VERSION` ở production trước khi sửa.**
- **F3 · Broker trong thư mục có symlink (`/tmp`, `/var/…`) bị provider từ chối** (`managed-broker-binding-invalid`): Swift dùng `resolvingSymlinksInPath()` (bỏ `/private`), provider so với `realpathSync`. Không ảnh hưởng `/Applications/Agent Watch.app`; ảnh hưởng bản dev/test đặt dưới `/tmp` hoặc `/var/folders`. Cách sửa: Swift dùng `realpath(3)`, hoặc provider so sau khi chuẩn hóa như Swift.
- **F4 · Review helper chưa được thử**: lane "tiny" (1 file, 2 dòng) tắt review dù Studio đặt `review: require` (`"policy":{"verify":"require","review":"off"}`, `"lane":"tiny"`). Cần một task lớn hơn để thấy `child` grant ở Studio thật.
- Ghi chú về fixture (không phải lỗi sản phẩm): connector giả không làm mới `provider_accounts.observed_at` nên tài khoản "hết tươi" sau vài phút, và hộp thư `f.seen` của fixture phải được xả; đã xử lý trong máy chủ thử, ghi cạnh bộ công cụ.

**Việc cần owner** (duy nhất phần bắt buộc chạm production):
1. Chạy một lần thật qua app Agent Watch đã cài bản có PR #18 với **key test riêng** trong Studio production đã có PR #41 (`runtime = pi` cho key đó): cần Keychain thật, nút "Mở Terminal", "Sửa cài đặt" bằng bấm, và model thật (gọi nhỏ). Chưa làm vì phải deploy/cài đè và ghi Keychain.
2. Quyết định sửa F1 và F2 trước khi đặt `runtime = pi` cho team thật (F1: bảo mật/mạng; F2: không đặt `STUDIO_MIN_BUNDLE_VERSION`).
3. Merge/deploy agent-studio#41, agentwatch#18, các PR fix/security-*; tag release bộ.

**Dọn dẹp.** Dừng máy chủ Studio thử, `docker compose -p studio-e2e-iso down -v` (container, mạng, tmpfs), xóa thư mục làm việc tạm trong `$HOME` và thư mục scratch (bộ đã dựng, binary, probe, nhật ký). Bộ công cụ chạy lại (Go test máy chủ, probe Swift, các script) lưu cạnh ghi chú của phiên, không commit.
