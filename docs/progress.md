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

## 2.6 Eval A/B và soak (branch `feat/eval`, 29/10)

Chạy thật qua broker Agent Watch của mini (binding thật chỉ đọc, bản sao trong agent dir tạm); số liệu và phương pháp đầy đủ ở `docs/baseline.md`. Bộ B dựng bằng `node scripts/build-bundle.mjs --out <tmp> --pins <pins ở head fix/security-*> --source …`, `doctor.ok: true`.

| Việc | Trạng thái | Bằng chứng |
|---|---|---|
| Bộ 6 task A/B offline | xong | `evals/ab/tasks/`; lỗi logic, TypeScript, Checks trong `## Checks`, bẫy sửa test, async, CSV. Lỗi fixture t6 tìm ra ở lần chạy đầu và đã sửa. |
| A/B 3 lần × 6 task × 2 bên (36 run, cùng model) | xong | `node evals/ab/batch.mjs --out <dir> --reps 3`, `node evals/ab/stats.mjs`: pass 18/18 cả hai; model calls B−A = +0,17 (CI −0,50…1,06); thời gian −6,6 s (CI −10,8…−0,8); cost $0,05 vs $0,16. Kết luận: không tệ hơn. Task quá dễ: 0 xin duyệt, 0 vòng sửa của harness. |
| Soak A (piagent studio) | xong | smooth, 6/6 phase, 48,1 phút, 1 compaction |
| Soak B (runtime mới) | xong | smooth, 6/6 phase, 72,7 phút, restart cứng làm tiếp được; 0 compaction |

Chưa kiểm (nói thẳng): soak chỉ ~1–1,2 giờ chứ chưa nhiều giờ; compaction của runtime mới chưa chạy; studio-link chờ khi Studio gián đoạn chưa kiểm; cổng hoàn tất, review helper, xin duyệt chưa bị A/B kích hoạt; Codex/vendor không chạy (Harness của key này chỉ route Claude); mỗi cấu hình một mẫu soak; chưa chạy trên Linux/Windows. Cách chạy lại: `evals/README.md`.

### 2.6b Việc F bổ sung (29/10 chiều)

| Việc | Trạng thái | Bằng chứng |
|---|---|---|
| Dọn status của Piagent cũ | xong | `~/.pi/agent/status/company/` có 23 file, mọi tiêu đề đều là prompt của lần chạy A/soak của tôi (kiểm từng `title`, 0 file lạ); đã xóa cả 23, thư mục còn 0 file. Piagent 1.47.0 vẫn ghi vào đó dù đặt `PI_CODING_AGENT_DIR` riêng; các lần chạy A sau này sẽ tạo lại, cần dọn lại sau khi chạy |
| A/B 4 task khó (xin duyệt, vòng sửa, lane standard) | xong, 24 run | `docs/baseline.md` mục 4: pass B 12/12, A 10/12 (2 lần A thêm test); approvals thật (A 1/lần, B 1–2) và `fixLoops` ≥ 1 xảy ra ở cả hai bên; review helper và checklist-continuation vẫn 0 vì key `review = off` |
| Compaction + plan còn nguyên | xong | `docs/baseline.md` mục 5 |
| Studio giả tắt 125 s giữa lượt | xong | `tests/e2e/studio-disconnect.e2e.test.mjs` (`E2E_LONG=1`), `studio_disconnect` outcome `resumed` |
| Shift+Tab | xong | `tests/e2e/thinking-shift-tab.e2e.test.mjs` |
| Soak nhiều giờ trên runtime mới | **ĐANG CHẠY** | bắt đầu 15:10 UTC 29/10; ba scenario nối tiếp (`long-node-inventory-platform`, `long-polyglot-platform`, `long-python-billing-platform`, mỗi cái 6 phase hoặc 5 phase, tối đa 150–160 phút mỗi cái), compaction hạ ngưỡng (`--reserve 900000`), cờ/biến theo agentwatch#18 + HOME. Xem tiến độ: `node evals/soak/summarize.mjs <work>/soak-long` (work: thư mục scratchpad của session, hoặc đường dẫn trong `stdout.log` của nó); đến 15:50 UTC: scenario 1 đã qua phase 2, 1 compaction, dừng-rồi-tiếp xong. Kết quả cuối chưa có: ghi vào `docs/baseline.md` mục 3 khi xong |
