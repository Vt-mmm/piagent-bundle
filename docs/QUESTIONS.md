# Câu hỏi cho owner

Mục mở. Làm tiếp phần không bị chặn, hỏi gộp.

0. **Đã giải (spike 29/10/2026, Pi 1.3.0 thật qua pty, docs/spikes/i1-i4):**
   - I1 làm được: `setEditorComponent` với `CustomEditor` bọc setter `onSubmit` (Pi gán `newEditor.onSubmit = defaultEditor.onSubmit` sau khi tạo). `/model` và `/share` bị chặn, hiện cảnh báo tiếng Việt. Còn lại: autocomplete vẫn liệt kê lệnh (chỉ là hiển thị).
   - I4 làm được bằng cách hoàn lại: `thinking_level_select` gọi `pi.setThinkingLevel(mức cũ)`; `/thinking low` bị đưa về `medium`. Giới hạn: UI nháy "Thinking level: low" trước khi bị hoàn. Chưa kiểm Shift+Tab.
   - I3 (che secret khi stream) và I8 (gzip, đổi token giữa request) chưa spike; theo yêu cầu owner, chấp nhận có thể không xử lý hết.

1. **Tính năng có thể không làm được trên Pi 1.3.0** (parity.md, mục I1–I16; điều kiện dừng sớm của prompt):
   - I1: Pi xử lý `/model`, `/login`, `/share`, `/bug` trước sự kiện `input`, nên extension không chặn được trực tiếp. Cần spike (bọc ô nhập). Nếu không được, chấp nhận mức nào?
   - I3: không che được secret trong văn bản model đang stream.
   - I4: `thinking_level_select` chỉ quan sát, không ép mức thinking.
   - I8: gzip và đổi token giữa request buộc provider tự viết `streamSimple`.
2. **P0-6 (giới hạn gọi helper lấy từ Studio)** cần thêm trường vào giao thức Studio. Thêm trường tùy chọn (không phá bản cũ) có được không?
3. **Tính năng đề xuất "bỏ có chủ đích"** cần duyệt: F122 (skill plugin Claude/Codex), F125 (preset Atlassian), F126 (skill `fe-change-report`), F155 (`/changelog`). F121 (Herdr) đang xếp "phải làm".
4. Các câu hỏi cuối parity.md (thư mục file trạng thái Agent Watch, vị trí `sandbox-domains`...).

## Quyết định tạm của agent (theo /goal 29/10/2026, owner có thể đảo)

- **I3 (che secret khi stream):** chấp nhận giới hạn. Che secret ở output tool, ở log và ở báo cáo gửi Studio; không che văn bản model đang stream trên màn hình. Ghi vào security-review.
- **I8 (gzip, đổi token giữa request):** provider tự viết `streamSimple`; không phải rủi ro, chỉ là công việc.
- **P0-6 (số lần gọi helper từ Studio):** thêm trường TÙY CHỌN `helper_slots` ở manifest/grant. Thêm trường không làm hỏng bản cũ; client không thấy trường thì dùng mặc định cũ. Studio chỉ cần phát thêm trường.
- **F122, F125, F126, F155:** bỏ có chủ đích như đề xuất. **F121 (Herdr):** giữ "phải làm", ưu tiên thấp, làm sau cùng.
- **Branch protection bắt buộc CI xanh:** bật sau khi CI của repo xanh ổn định hai lần liên tiếp trên PR.
- **Chạy thật qua Agent Watch/Studio của mini:** chỉ làm ít và nhỏ, với key test không phải Team A; việc nào chưa được owner cho phép riêng thì ghi "chưa kiểm".

## Câu hỏi từ bước 2.1 (provider; mã P5–P9)

P5. **Footer của Pi hiện id model (`agent-watch-auto`), không hiện tên "Auto (công ty)".** Tên chỉ hiện ở danh sách chọn model (đã bị chặn). Đổi id (binding hiện bắt buộc `agent-watch-auto`) hay chấp nhận? Tạm: chấp nhận.
P6. **Tool failures, workspace report, memory, settle** gửi Studio cần grant. Tạm: harness gọi qua `piagent:studio.call` (provider giữ token). Chấp nhận kênh này không? Provider chưa có sẵn các module đó (thuộc harness 2.3).
P7. **Chờ Studio không giới hạn khi Studio tắt giữa lúc đang stream:** lượt bị cắt phải nhờ retry của Pi (`retry.maxRetries` trong settings của launcher; tạm 3). Studio chập chờn hơn số đó thì lượt lỗi. Có cần provider tự thử lại không (cần bọc thêm, hoặc dừng chấp nhận)?
P8. **Id model trong transcript:** các tin assistant mang id model thật (do stream trong), còn model đang chọn là `agent-watch-auto`, nên Pi coi mỗi lượt là "model khác" và đổi thinking block có chữ ký thành text. Giữ hành vi cũ. Muốn giữ chữ ký thì đặt id model theo route (mất tên cố định).
P9. **Chạy thật trên mini** (Claude run và Codex run qua broker Agent Watch): chưa làm, chờ owner đồng ý trong chat.

## Câu hỏi từ bước 2.3 (harness; mã H10–H15)

H10. **Thêm trường vào `run.state`, `studio.call` (`role`) và kênh `piagent:tools.child` của sandbox** (xem package-contract.md, mục đề xuất 2.3). Không có chúng: harness không biết workflow/capabilities của Studio, settle đi bằng token main, helper review không có tool đọc. Tạm: harness dựng theo đề xuất, test bằng bus giả; đã nhắn hai session kia. Chấp nhận không?
H11. **`helper_slots` mang hai nghĩa.** Broker hiểu nó là số slot song song (`helper-slots` khi >= 2); P0-6 muốn dùng làm số lần gọi helper mỗi vai. Tạm: provider chuyển nó thành `harness.helperLimit` riêng; nếu Studio phát `helper_slots = 2` để nói slot, giới hạn gọi sẽ thành 2. Cần Studio phát trường riêng (ví dụ `helper_calls`)?
H12. **File trạng thái Agent Watch (F117):** giữ `<agent dir>/status/company/<conversation>.json` đúng định dạng `PiagentStatus.swift` (đọc từ agentwatch), ghi vào `PI_CODING_AGENT_DIR` nếu có. Tạm: giữ như plan; test chỉ ghi vào thư mục tạm.
H13. **Gửi báo cáo process mỗi vòng làm tiếp checklist:** bản cũ mở một run Studio cho mỗi vòng; trên Pi 1.3.0 cả lượt chỉ có một run của provider nên chỉ báo cáo vòng cuối đi cùng `close`. Chấp nhận mất báo cáo từng vòng, hay provider mở run mới cho mỗi vòng?
H14. **Team memory một repo mỗi thư mục:** thư mục chứa nhiều repo (F, `findRepositories` bản cũ) chưa chuyển. Làm ở 2.3b hay bỏ?
H15. **Giao diện câu hỏi `ask_user` chỉ ở Terminal:** bề mặt WebUI đã bỏ (dashboard để giai đoạn 3).


## Câu hỏi từ bước 2.2 (sandbox; mã S10–S17)

S10. **Vị trí file `sandbox-domains` (F004).** Tạm: `<PI_CODING_AGENT_DIR>/sandbox-domains`, ghi đè bằng `PIAGENT_SANDBOX_DOMAINS`. Một host mỗi dòng, `*.example.com` cho subdomain, IP bị bỏ qua. Duyệt?
S11. **`run_on_host` hỏi mỗi lần kể cả Bypass** (plan 113). Bản cũ ở Bypass chỉ hỏi khi lệnh là handoff hoặc chạm credential. Tạm: theo plan, hỏi mỗi lần.
S12. **`/undo` không sống qua việc tắt/mở lại Pi.** Bản cũ lưu lịch sử checkpoint bền; bản mới giữ trong bộ nhớ và thư mục tạm. Cần lưu xuống `PI_CODING_AGENT_DIR` (resume phiên cũ vẫn `/undo` được) không? Tạm: không.
S13. **Harness kiểm 7 tool lõi (F120) bằng gì.** `sourceInfo.source` là `cli` khi nạp bằng `-e` (sẽ khác khi cài từ npm/git), `sourceInfo.path` là file nhập của package. Tạm: harness so `realpath(sourceInfo.path)` với thư mục package sandbox và đối chiếu `piagent:tools.attest`; không dựa chuỗi `source`. Chốt ở 2.3.
S14. **Tool `powershell` dựng sẵn của Pi** vẫn có trong `getAllTools()` (builtin) và không bị thay. Chỉ liên quan Windows native, ngoài phạm vi (WSL). Chấp nhận, hay harness cũng chặn `powershell`?
S15. **Sandbox gọi được mọi cổng loopback và địa chỉ LAN của chính máy** (xem carry-over 2). Chấp nhận như bản cũ, hay siết (ví dụ chỉ cho cổng do chính lệnh mở — Seatbelt không hỗ trợ)?
S16. **Bộ chọn lọc handoff** (carry-over 5): cần review bảo mật trước khi tin tương đương bản cũ. Ai review, và có chạy lại bộ test lớn của `piagent` làm so sánh không?
S17. **Chạy WSL2 thật** (máy Windows có WSL2): chưa có máy. Cần máy để đóng nghiệm thu C8.

## Câu hỏi từ bước 2.5 (tích hợp ba package; mã I18–I22)

Giải quyết bằng chạy thật (bằng chứng ở progress.md mục 2.5, hợp đồng ở package-contract.md):

- **H10 (đã giải).** `run.state` có đủ trường harness cần, `studio.call` nhận `role`, `piagent:tools.child` do sandbox cài. Chạy ba package trong Pi 1.3.0 thật: helper review dùng grant `child` qua provider và tool chỉ đọc của sandbox, settle đi bằng token của helper. Phát hiện thêm 5 chỗ lệch, đã sửa ở hai phía và ghi vào hợp đồng: `tools.child.close` (harness không phát, sandbox giữ boundary), `run.state` chưa có lúc tin nhắn đầu, guard kiểm trước khi sandbox attest, báo cáo toolset mất vì chưa có run, helper nhận `memory_search` khi Studio không có memory.
- **S13 (đã giải).** Harness kiểm bằng `sourceInfo.path` có thư mục `piagent-sandbox` và `tools.attest`, không dùng chuỗi `source`.
- **AGENT_WATCH_MANAGED_BINDING (đã giải).** Provider đọc biến này (agentwatch#18 đặt nó) và chấp nhận binding không có `model`; `PIAGENT_BINDING` thắng khi cả hai có.

Mở:

18. **Agent Watch (agentwatch#18) phải đặt thêm `PI_OFFLINE=1`, `PI_TELEMETRY=0`, `PI_SKIP_VERSION_CHECK=1`.** `launchPlan` đã đặt; hàm `launch` bằng Swift trong PR chỉ đặt ba biến cộng binding. Không có chúng Pi 1.3.0 mặc định gửi telemetry cài đặt và hỏi pi.dev bản mới nhất. Cần sửa PR đó (không thuộc session này) hoặc cho Agent Watch dùng `launchPlan`.
19. **`pi -p` (chế độ in) không in gì sau lượt có cổng hoàn tất:** tin trạng thái cuối của harness (`agent-watch-process`) là tin cuối, không phải tin assistant, nên stdout trống. Terminal tương tác không bị. Chấp nhận (Agent Watch mở Terminal), hay harness gắn trạng thái vào tin assistant?
20. **Hash của phần `pi` bao cả ba package** (package nằm trong `pi/` để Node tìm `@earendil-works/*`). Bộ kiểm hash của Agent Watch (Swift) không cần đổi, nhưng một thay đổi package đổi cả hai hash. Chấp nhận, hay muốn đặt package ngoài `pi/` với liên kết `node_modules` (Swift và `hashDir` bỏ qua symlink nên đổi hướng liên kết không bị bắt)?
21. **Linux và macOS chỉ có CI chạy e2e;** chưa chạy tay trên Linux thật. Windows chưa có.
22. **Pin commit:** `bundle.pins.json` ghim commit của ba nhánh `feat/*` (chưa merge). Khi PR của ba repo merge (squash đổi sha), phải ghim lại.
