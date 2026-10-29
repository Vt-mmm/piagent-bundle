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
| baseline-studio-metrics.md | số liệu Studio 14 ngày VNexus BE xong (SELECT chỉ đọc) | 328 run, 1,48% gateway lỗi, 325 disconnect |
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
