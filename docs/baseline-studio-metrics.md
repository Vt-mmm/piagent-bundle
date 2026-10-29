# Baseline Agent Studio — một team nhỏ (14 ngày, đã ẩn danh)

Số liệu thật (tên team, id, bảng, câu truy vấn, số chính xác) nằm ngoài repo công khai, trong `reports/` của owner. Tệp này chỉ giữ **mức độ lớn** và **hình dạng** của baseline để so sánh A/B; mọi số đã làm tròn. Quy tắc: repo này công khai, không đưa tên khách hàng, id, lược đồ hay SQL của Studio vào.

## Phạm vi

- Một team nội bộ nhỏ (khoảng 4 thành viên), cửa sổ 14 ngày kết thúc 2026-10-29, thu thập chỉ đọc, chỉ số tổng hợp (không có nội dung prompt, đầu ra lỗi, tên máy hay tên người).
- Đơn vị "turn" là **run**: báo cáo quy trình được client gửi theo run, nên các tỷ lệ tính theo run, không theo lượt chat.
- "Verified" là tự khai của client trong báo cáo, không phải kiểm chứng độc lập từ Studio.

## Tóm tắt (làm tròn)

| Chỉ số | Mức |
|---|---|
| Run | khoảng 330 |
| Run có báo cáo quy trình | khoảng 95% |
| Run có thay đổi code | khoảng 110 |
| Verified / run có thay đổi code | khoảng 75% |
| Verified / mọi run đã báo cáo | khoảng 26% |
| Lệnh gọi model | khoảng 9.000; lỗi (>= 400) khoảng 1,5% |
| Độ trễ byte đầu | p50 khoảng 2 giây, p95 khoảng 5 giây |
| Lệnh công cụ lỗi | khoảng 600 |
| Lần ngắt kết nối client | khoảng 325, hầu hết được nối lại; không có lần bỏ cuộc |

Policy của mọi run đã báo cáo: plan, verify và review đều ở mức `require`.

## Hình dạng

- Lỗi gọi model gồm 503 "tài khoản bận, thử lại" và 409 "tài khoản không còn, mở phiên mới" (chỉ ở lượt trả lời), 502 do connector hoặc upstream, một ít 401 do grant hết hạn; không có 429.
- Công cụ lỗi nhiều nhất: `read`, `bash` (mã thoát khác 0, timeout, bị sandbox từ chối), `edit`, `grep`, `delegate` (timeout). Lỗi liên quan Docker chủ yếu là engine không chạy hoặc không mở kịp.
- Ngắt kết nối: đa số không rõ nguyên nhân; còn lại do mạng, broker ngoại tuyến hoặc Studio cập nhật.
- Tỷ lệ verified theo ngày dao động mạnh khi ít run (mẫu nhỏ; ngày cuối chưa hết).

## Hạn chế

- Mẫu nhỏ; 15 run không có báo cáo quy trình (client cũ hoặc chưa đóng) không tính vào mẫu số.
- Lọc theo thời điểm membership cho số nhỏ hơn đếm thô theo user.
- Chỉ lượng tổng hợp; không phân tích nội dung.
