# Mang theo từ `piagent`

Bản sửa lỗi hoặc bảo mật phát hiện ở `managed/` trong giai đoạn 2 (không thêm tính năng vào `managed/`). Mỗi dòng: phát hiện, file, package đích, trạng thái.

- `managed/workflow.mjs`: `verified` chấm theo exit code, nên `npm test | tail` có test fail vẫn tính pass; `isCheckCommand` tính `pytest -k x` và `tsc --version` là check; vòng sửa của verify và review dùng chung một số đếm. Đã sửa ngay khi chuyển sang `piagent-harness/src/{checks,workflow}.mjs` (P0-1, P0-2, P0-5), không sửa trong `managed/`. Trạng thái: sửa ở package đích.
- `managed/helper-roles.mjs`: `HELPER_CALLS = 8` viết cứng; harness mới lấy từ Studio (mặc định 8). Trạng thái: sửa ở package đích.
- Chưa phát hiện lỗi bảo mật nào khác trong các module đã chuyển.
