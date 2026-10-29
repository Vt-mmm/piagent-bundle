# Hợp đồng giữa ba package (v0, nháp)

Ba package nói chuyện qua event bus của Pi (`pi.events`). Không package nào import code của package khác. Mọi payload mang `v` (số nguyên). Bản mới chỉ thêm trường; đổi nghĩa trường thì tăng `v`.

Nháp ban đầu, chốt ở 2.1/2.3:

| Kênh | Hướng | Payload (v1) |
|---|---|---|
| `piagent:grant.request` | harness → provider | `{ v, role: 'main'\|'child', purpose, reply }` — xin grant cho helper |
| `piagent:grant.result` | provider → harness | `{ v, ok, role, effort, models?, error? }` |
| `piagent:run.state` | provider → harness | `{ v, runId, harness: { thinking, helperCalls, bypassMode, protocol } }` |
| `piagent:tools.attest` | sandbox → harness | `{ v, tools: [{ name, source }] }` — để harness kiểm `sourceInfo` |
| `piagent:permission.mode` | sandbox → harness | `{ v, mode: 'ask'\|'full'\|'bypass' }` |

Thay đổi sau này ghi ở đây kèm ma trận version.
