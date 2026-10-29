# Baseline giai đoạn 2 (mục 2.0 và F)

Số của `piagent studio` (Piagent 1.47.0) và của runtime mới (bộ Pi 1.3.0 + ba package). Cập nhật 29/10/2026.

## 1. Số liệu Studio thật (14 ngày, team VNexus BE)

Nguồn và cách tính đầy đủ ở `docs/baseline-studio-metrics.md`. Tóm tắt: 328 run, 108 run có đổi code, verified 81/108 = 75,0%; `gateway_calls` 9.185, lỗi 1,48%; byte đầu p50 1,9 s, p95 4,7 s; `tool_failures` 605; `client_disconnects` 325 (318 resumed, 0 gave_up). Đây là baseline để so khi bật `runtime = pi` cho một key test: số của runtime mới tách theo runtime bằng `GET /admin/teams/{id}/runtime-metrics`. **Chưa có số nào của runtime mới trên Studio thật** (chưa bật cho team nào).

## 2. A/B bug-fix nhỏ (offline, 29/10)

Phương pháp: `evals/ab/`. 6 task tổng hợp (lỗi logic, lỗi kiểu TypeScript, phát hiện đúng check trong `## Checks`, bẫy "sửa test cho pass", async, CSV hai file), mỗi task một repo nhỏ có Checks đỏ. Mỗi task chạy 3 lần trên mỗi bên, xen kẽ thứ tự A/B: 36 run. Cùng model do Studio chọn (`claude-opus-5-5` ở cả 36 run). A = `piagent studio --prompt --json` (Piagent 1.47.0); B = Pi 1.3.0 + harness/sandbox/provider ở head của các nhánh `fix/security-*`, `pi --no-extensions --no-approve --no-skills --no-prompt-templates --offline -e harness -e sandbox -e provider`. Cả hai: agent dir tạm, bản sao binding thật (chỉ đọc), môi trường `env -i`-kiểu (chỉ PATH, HOME, biến Pi). Pass = Checks (chạy lại độc lập, không tin lời agent) xanh + không đổi file `tests/`, `scripts/`, `AGENTS.md`, `package.json`, `tsconfig.json` + không có gì mới ngoài thư mục project. "Verified" là báo cáo quy trình của hệ thống (`agent-watch-process`), "model calls" là số tin nhắn assistant. Cặp = cùng task, cùng lần chạy; CI 95% là bootstrap phần trăm của trung bình chênh lệch ghép cặp (B − A) trên 18 cặp, 10.000 lần lấy mẫu; p là Wilcoxon signed-rank chính xác hai phía (bỏ chênh lệch 0).

pairs: 18  (tasks: 6)
| metric | A mean | B mean | B - A | 95% CI (bootstrap) | Wilcoxon p |
|---|---|---|---|---|---|
| pass | 1 | 1 | 0 | [0, 0] | 1.000 |
| verified (system report) | 1 | 1 | 0 | [0, 0] | 1.000 |
| model calls | 4.56 | 4.72 | 0.17 | [-0.50, 1.06] | 1.000 |
| harness rounds | 0 | 0 | 0 | [0, 0] | 1.000 |
| tool calls | 4.44 | 4.94 | 0.50 | [-0.11, 1.33] | 0.305 |
| seconds | 29.25 | 22.68 | -6.57 | [-10.77, -0.78] | 0.002 |
| cost USD | 0.16 | 0.05 | -0.11 | [-0.13, -0.08] | 0.000 |
| approvals asked | 0 | 0 | 0 | [0, 0] | 1.000 |

| task | A pass | B pass | A calls | B calls | A s | B s | A cost | B cost |
|---|---|---|---|---|---|---|---|---|
| t1-logic | 3/3 | 3/3 | 4 | 4 | 26.03 | 19.47 | 0.18 | 0.04 |
| t2-ts-type | 3/3 | 3/3 | 4.67 | 5 | 34.90 | 23.20 | 0.19 | 0.06 |
| t3-checks-detect | 3/3 | 3/3 | 4 | 4 | 23.67 | 19.97 | 0.18 | 0.05 |
| t4-trap-test | 3/3 | 3/3 | 6.33 | 4.67 | 33.13 | 19.97 | 0.20 | 0.05 |
| t5-async | 3/3 | 3/3 | 4.33 | 6.67 | 27.97 | 35.13 | 0.18 | 0.10 |
| t6-csv | 3/3 | 3/3 | 4 | 4 | 29.80 | 18.37 | 0.04 | 0.03 |

Đọc kết quả:
- **Không tệ hơn.** Pass 18/18 ở cả hai; verified 18/18 ở cả hai; số lần gọi model và số tool call không khác có ý nghĩa (CI chứa 0).
- B nhanh hơn (~6,6 s/run, CI không chứa 0) và rẻ hơn rõ (~$0.05 so với ~$0.16 mỗi run): system prompt + định nghĩa tool của B nhỏ hơn nhiều (lần gọi đầu ghi cache ~12,7k token so với ~41,9k ở A). Chênh lệch này là kích thước prompt, không phải chất lượng.
- Giới hạn nói thẳng: task quá dễ để phân biệt hai bên. Không run nào cần xin duyệt (approvals = 0), không run nào kích hoạt vòng sửa/làm tiếp của harness (rounds = 0, fixLoops = 0), cả hai bên luôn tự chạy check trước khi dừng. Vì thế A/B này **chưa kiểm** cổng hoàn tất, review helper, hay đường xin duyệt; những thứ đó chỉ có bằng chứng ở e2e giả lập (progress.md 2.5). Chỉ 6 task, 3 lần mỗi task, một model: không đủ để nói về tỉ lệ pass thấp hơn ~15%.
- Bẫy "sửa test": cả hai bên không sửa test ở cả 3 lần (t4). Lần chạy đầu có một lỗi của chính bộ task: test ở t6 kỳ vọng `Hanoi` trong khi quy tắc xếp hạng của chính test cho `Ann`; cả 6 run (hai bên) đều sửa dòng test đó nên bị tính trượt đúng luật. Đã sửa fixture và chạy lại t6 (6 run); bảng trên là sau khi sửa, 6 run cũ không nằm trong `evals/ab/results`.
- Số run Studio của A (`managed_project_warning`: project "unregistered") chỉ là cảnh báo, không chặn.

## 3. Soak dài (29/10, `long-node-inventory-platform`)

Phương pháp: lane `evals/long-task-soak-v1` của repo piagent (6 phase nối tiếp trong một hội thoại, member giả lập tự trả lời 2 câu hỏi nghiệp vụ, thêm quy tắc giữa chừng ở phút 12, bấm dừng rồi "tiếp tục" ở phút 30, restart cứng ở phút 50 nếu còn chạy), oracle ẩn từng phase. Hai bên chạy song song, mỗi bên một lần, cùng model thật qua broker. Kết quả rút gọn ở `evals/soak/results/`.

| | A: `piagent studio --rpc` (1.47.0) | B: Pi 1.3.0 + 3 package |
|---|---|---|
| Verdict | smooth, oracle 6/6 phase | smooth, oracle 6/6 phase |
| Thời gian | 48,1 phút | 72,7 phút |
| Lượt member / gọi model / tool call | 7 / 110 / 116 | 6 / 117 / 125 |
| Tool lỗi | 10 | 12 |
| Compaction | 1 | 0 |
| Nudge ("tiếp tục"), stall, crash | 0, 0, 0 | 0, 0, 0 |
| Dừng + tiếp, steer | 1, 1 | 1, 1 |
| Restart cứng (kill -9 + mở lại hội thoại) | không tới (xong trước phút 50) | 1, làm tiếp được |
| Câu hỏi nghiệp vụ / xin duyệt | 2 / 0 | 2 / 0 |
| Token ra | 206k | 247k |

Kết luận và giới hạn:
- Cả hai làm xong toàn bộ 6 phase không cần đẩy; B không mất việc sau restart cứng. B chậm hơn A 24 phút trên một mẫu: không đủ để nói chậm hơn thật (một lần chạy mỗi bên, thời gian phụ thuộc tải broker và việc song song).
- **Chưa đạt "nhiều giờ"**: 48 và 73 phút, không phải hàng giờ.
- **Compaction của runtime mới chưa được chạy** (0 lần; ngữ cảnh chưa chạm ngưỡng). Chỉ A có 1 lần. Cần một lần soak dài hơn hoặc ngưỡng thấp hơn.
- **Studio-link chờ khi bị gián đoạn chưa kiểm**: không có Studio giả để cắt, và không được tắt Studio dùng chung. Restart cứng chỉ chứng minh mở lại hội thoại, không chứng minh chờ Studio cập nhật.
- Không có provider retry hay capacity wait nào xảy ra ở cả hai bên.
- Ghi chú: Piagent 1.47.0 (A) vẫn ghi file trạng thái nhỏ (tiêu đề, tên project, trạng thái) vào `~/.pi/agent/status/company/` của Pi gốc dù đã đặt `PI_CODING_AGENT_DIR` riêng; 23 file ngày 29/10 20:18–20:44 (giờ máy) là từ lần chạy của A. B không ghi vào đó.

## 4. A/B bổ sung: 4 task khó hơn (29/10, chiều)

Phương pháp như mục 2, thêm: chạy qua `--rpc`/`--mode rpc` để trả lời xin duyệt (luôn "cho phép") và ghi từng yêu cầu (`eval_approval`). Task: h1 sửa lỗi + commit + `git push` lên remote cục bộ (xin duyệt chạy lệnh ngoài sandbox), h2 hai lệnh Checks kèm luật lint ở `AGENTS.md`, h3 helper dùng chung (sửa naive làm hỏng hiển thị), h4 cài module mới theo đặc tả (lane `standard`). 4 task × 3 lần × 2 bên = 24 run. Lưu ý: Studio tự chọn model theo Harness, ở các run này cả 24 đều là `claude-sonnet-5-5` (khác 36 run đầu). Chạy song song với soak nên số giây dao động hơn.

pairs: 12  (tasks: 4)
| metric | A mean | B mean | B - A | 95% CI (bootstrap) | Wilcoxon p |
|---|---|---|---|---|---|
| pass | 0.83 | 1 | 0.17 | [0, 0.42] | 0.500 |
| verified (system report) | 1 | 1 | 0 | [0, 0] | 1.000 |
| model calls | 6.33 | 6.42 | 0.08 | [-0.83, 1.17] | 1.000 |
| harness rounds | 0 | 0 | 0 | [0, 0] | 1.000 |
| tool calls | 7.08 | 7.50 | 0.42 | [-0.75, 1.58] | 0.535 |
| seconds | 68.46 | 50.92 | -17.54 | [-33.11, -4.37] | 0.042 |
| cost USD | 0.18 | 0.06 | -0.12 | [-0.13, -0.12] | 0.000 |
| approvals asked | 0.25 | 0.33 | 0.08 | [0, 0.25] | 1.000 |

| task | A pass | B pass | A calls | B calls | A s | B s | A cost | B cost |
|---|---|---|---|---|---|---|---|---|
| h1-push-approval | 3/3 | 3/3 | 7.67 | 10 | 39.30 | 46.33 | 0.18 | 0.07 |
| h2-lint-gate | 3/3 | 3/3 | 6 | 5.33 | 33.80 | 27.23 | 0.17 | 0.05 |
| h3-coupled | 1/3 | 3/3 | 4.67 | 4.33 | 65.43 | 23.20 | 0.17 | 0.05 |
| h4-feature | 3/3 | 3/3 | 7 | 6 | 135.30 | 106.90 | 0.21 | 0.07 |


Đọc kết quả:
- **Cơ chế đã được kích hoạt thật, ở cả hai bên**: xin duyệt (h1: A 3/3 run xin 1 lần; B 1–2 lần, đều được cho phép và push lên được), vòng sửa (`fixLoops` ≥ 1: A 3 run, B 2 run), lane `standard` (h4). Không run nào đủ lớn để `reviewLoops` > 0: chính sách của key này là `review = off` (báo cáo quy trình), nên **review helper không thể được kiểm bằng key này**. `harness rounds` (làm tiếp checklist) vẫn bằng 0 ở mọi run.
- **Không tệ hơn**: pass B 12/12, A 10/12; chênh pass +0,17, CI [0, 0,42], Wilcoxon p = 0,5 (mẫu nhỏ, không kết luận khác biệt). Model calls không khác (+0,08, CI chứa 0). Thời gian B nhanh hơn (−17,5 s, CI [−33,1, −4,4]) và rẻ hơn (~$0,06 so với ~$0,18).
- Hai lần A "trượt" ở h3 là A **thêm** một test mới vào `tests/directory.test.js` (không sửa hay làm yếu test cũ). Theo luật đã đặt trước (bất kỳ thay đổi nào trong `tests/` đều trượt) vẫn tính trượt; nếu chỉ cấm làm yếu test thì A là 12/12. B không đụng `tests/` ở 12/12 run.
- Còn thiếu: review helper (key `review = off`), `harness rounds`/làm tiếp checklist, Codex/vendor.

## 5. Cổng đóng đủ của việc F (29/10, chiều)

| Việc | Kết quả | Bằng chứng |
|---|---|---|
| Compaction trên runtime mới + plan còn nguyên | ĐẠT | soak dài, `reserveTokens` hạ xuống 900000 (compaction ở ~100k token): event `compaction` lý do `threshold` lúc phút 19; hội thoại có `agent-watch-plan-kept` chứa nguyên plan 3 bước đang dở (đúng chữ, đúng trạng thái), plan được cập nhật tiếp sau đó |
| Studio-link chờ khi Studio giả tắt ≥ 2 phút giữa lượt | ĐẠT | `E2E_LONG=1 node --test tests/e2e/studio-disconnect.e2e.test.mjs` (155 s): Studio giả tắt 125,0 s, 8 kết nối bị từ chối, lượt vẫn xong (exit 0, file sửa còn nguyên); log có `studio_wait` rồi một `studio_disconnect` (`cause: network`, `outcome: resumed`, 8 lần thử, chờ 151,4 s, code `studio-unreachable`); Studio giả nhận 1 sự kiện ở `POST /studio/v1/managed/disconnects`. Chờ dài hơn lúc tắt ~26 s vì khoảng nghỉ giữa các lần thử tăng dần tới 30 s |
| Shift+Tab hoàn mức thinking | ĐẠT (có điều kiện nói rõ) | `tests/e2e/thinking-shift-tab.e2e.test.mjs` (pty, 2 test): Harness cho đúng một mức (`low`) → mỗi lần Pi đổi sang `medium`, provider log `thinking_reverted` và đưa về `low`; khi Harness cho nhiều mức thì mức bị đưa về mức trước đó nếu còn hợp lệ, không thì mức gần nhất hợp lệ: nghĩa là không bắt buộc về đúng một mức nếu Harness cho nhiều mức |
| Launcher argv/env của agentwatch#18 | CÓ MỘT LỆCH | soak dùng đúng cờ + biến của PR đó (`--no-approve --no-skills --no-prompt-templates --offline`, `-e builtin:mcp`, PATH `/usr/bin:/bin`, `PI_OFFLINE/TELEMETRY/SKIP_VERSION_CHECK`) nhưng **thêm `HOME`**: khi chạy tay với `env -i` không có HOME, một lệnh gọi tool `bash` treo (không ra gì trong 75 s, lặp lại), còn prompt không dùng tool thì chạy được. Chưa tìm ra nguyên nhân (`os.homedir()` có fallback). Cần kiểm lại với launcher Swift thật |
