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
