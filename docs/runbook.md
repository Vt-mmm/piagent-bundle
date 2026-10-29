# Runbook: Piagent company mode trên Pi gốc

Trạng thái: bản nháp. Các bước ghi "chưa kiểm" chưa chạy trên máy thật.

## Bật cho một team
1. Trong Studio đặt `runtime = pi` cho **một key test** trước (không phải key của team thật). Chờ PR agent-studio (trường `runtime`) được owner merge và deploy.
2. Trên máy member, Agent Watch bản có launcher mới phải đã cài bộ (Pi riêng + 3 package). Chạy `node bin/piagent-bundle-doctor.mjs <thư mục bộ>`: phải trả `ok: true`.
3. Mở một task nhỏ có test; kiểm trạng thái và log (mục dưới).
4. Đặt `runtime = pi` cho team. Theo dõi chỉ số Studio tách theo runtime (gateway_calls lỗi, tool_failures, disconnects, tỷ lệ verified) so với baseline ở `baseline-studio-metrics.md`.

## Rollback
Đặt `runtime = piagent` ở key hoặc team trong Studio. Lần mở sau của member dùng launcher cũ; hội thoại cũ vốn vẫn mở bằng bản cũ. Không cần cài lại gì. (Chưa kiểm trên máy thật.)

## Sửa cài đặt (hash lệch)
Agent Watch từ chối mở khi `doctor` báo `hash-mismatch:<phần>`, `absent:<phần>` hoặc `manifest-missing`. Dùng "Sửa cài đặt" (cài lại bộ đúng bản đã pin). Không sửa tay file trong thư mục bộ.

## Đọc log khi member báo lỗi
- Log local: `ManagedSessions/<hash>/` (cùng chỗ với bản cũ).
- Studio: lọc theo runtime, bản bộ và key; xem `tool_failures`, `gateway_calls` (mã lỗi `session_account_busy_retry_later` nghĩa là thiếu session id), `client_disconnects`.
- Không có nội dung prompt trong log; secret đã được che.

## Bộ bị từ chối vì quá cũ
Studio trả lỗi kèm lời nhắn cập nhật khi bản bộ thấp hơn mức tối thiểu của team. Cài bản bộ mới (Sửa cài đặt hoặc cập nhật Agent Watch), kiểm `doctor`, mở lại. Muốn tạm cho chạy tiếp: hạ bản bộ tối thiểu hoặc gạt `runtime = piagent`.

## Ma trận version
| Bộ | Pi | harness | sandbox | provider | Studio tối thiểu | Agent Watch tối thiểu |
|---|---|---|---|---|---|---|
| (chưa phát hành) | 1.3.0 | - | - | - | - | - |

Mỗi release của bộ thêm một dòng. Chỉ owner tag release.
