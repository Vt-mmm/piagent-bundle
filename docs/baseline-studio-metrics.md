# Baseline Agent Studio — team "Team A" (14 ngày)

Thu thập ngày 2026-10-29, chỉ đọc (read-only). Cửa sổ: 2026-10-15 11:40 UTC đến 2026-10-29 11:40 UTC. Ngày trong bảng theo múi giờ Asia/Ho_Chi_Minh (UTC+7).

## Phạm vi và cách thu thập

- Nguồn: Postgres của Compose project `agent-studio-mini` (container `agent-studio-mini-postgres-1`, DB `studio`), truy vấn `SELECT` trong `BEGIN READ ONLY` + `SET default_transaction_read_only=on`, qua `docker exec ... psql -U postgres` trên socket cục bộ. Không đọc `.env`, `secrets/`, key hay token; không gọi HTTP API của Studio; không ghi dữ liệu.
- Team: `teams.name = 'Team A'` (id `<team-id>`, 4 thành viên đang hoạt động; 5 người có membership chồng lên cửa sổ).
- Gán sự kiện về team: `gateway_calls`, `tool_failures`, `client_disconnects` không có cột `team_id`, nên gán theo `user_id` có membership của team **tại thời điểm xảy ra sự kiện** (`memberships.started_at <= t < ended_at`). `managed_runs` có `team_id` nên lọc trực tiếp.
- Chỉ số tổng hợp, không có nội dung prompt, `input`/`error` của tool_failures, tên máy, tên thành viên hay khách hàng.
- Đơn vị "turn": báo cáo quy trình (`managed_runs.process`, migration 028) được client gửi theo **run**, nên "tỷ lệ verified" tính theo run, không theo từng lượt chat.
- "Verified" = `process->>'verified'` là true. Hai mẫu số: run có thay đổi code (`changed`, mẫu số chính, cùng cách tính với báo cáo Process trong `internal/runs/process.go`) và mọi run đã báo cáo.
- Dữ liệu của team bắt đầu từ 2026-10-19 (run đầu tiên 05:43 UTC); các ngày 10-15 đến 10-18 không có hoạt động. `tool_failures` giữ 30 ngày, `client_disconnects` 90 ngày, `gateway_calls` 93 ngày, nên cửa sổ 14 ngày không bị cắt bởi retention. `gateway_calls` ghi bất đồng bộ theo lô nên có thể thiếu vài dòng.

## Tóm tắt

| Chỉ số | Giá trị |
|---|---|
| Run (managed_runs) | 328 (317 closed, 9 active, 2 closing), 4 thành viên |
| Run có process report | 313 (95,4%) |
| Run có thay đổi code | 108 |
| Verified / run có thay đổi code | 81 / 108 = 75,0% |
| Verified / run đã báo cáo | 81 / 313 = 25,9% |
| Outcome `clean` | 47 (43,5% run có thay đổi) |
| Checks / checks_failed / fix_loops | 485 / 103 / 60 |
| gateway_calls | 9.185, lỗi (status >= 400) 136 = 1,48% |
| Độ trễ byte đầu (first_byte_ms) p50 / p95 | 1.880 ms / 4.677 ms |
| tool_failures | 605 (xem B) |
| client_disconnects | 325 (resumed 318, stopped 7, gave_up 0; xem C) |

Policy trong mọi run đã báo cáo: plan=require, verify=require, review=require (D5).

## A. gateway_calls

**A0 tong quan**

```text
 calls |  ok  | err | members_active | avg_ms | p50_fb_ms | p95_fb_ms 
-------+------+-----+----------------+--------+-----------+-----------
  9185 | 9049 | 136 |              4 |   9214 |      1880 |      4677
```

**A1 gateway_calls theo purpose**

```text
  purpose   | calls |  ok  | err | err_pct 
------------+-------+------+-----+---------
 tool_step  |  7886 | 7803 |  83 |    1.05
 brief      |   563 |  562 |   1 |    0.18
 answer     |   558 |  512 |  46 |    8.24
 harness    |   100 |   98 |   2 |    2.00
 summary    |    67 |   64 |   3 |    4.48
 continue   |    10 |   10 |   0 |    0.00
 web_search |     1 |    0 |   1 |  100.00
```

**A2 gateway_calls theo status/code**

```text
 status |                     code                      | calls 
--------+-----------------------------------------------+-------
    200 | -                                             |  9044
    503 | session_account_busy_retry_later              |    73
    409 | session_account_unavailable_start_new_session |    37
    502 | connector_unavailable                         |    13
    401 | invalid_run_grant                             |     6
    200 | client_cancelled                              |     5
    502 | upstream_unavailable                          |     4
    503 | session_account_not_ready_retry_later         |     2
    503 | execution_capability_unavailable              |     1
```

**A3 gateway_calls loi theo purpose x status/code**

```text
  purpose   | status |                     code                      | calls 
------------+--------+-----------------------------------------------+-------
 tool_step  |    503 | session_account_busy_retry_later              |    66
 answer     |    409 | session_account_unavailable_start_new_session |    36
 tool_step  |    502 | connector_unavailable                         |     8
 answer     |    502 | connector_unavailable                         |     5
 summary    |    503 | session_account_busy_retry_later              |     3
 answer     |    503 | session_account_busy_retry_later              |     3
 tool_step  |    401 | invalid_run_grant                             |     3
 tool_step  |    502 | upstream_unavailable                          |     2
 tool_step  |    503 | session_account_not_ready_retry_later         |     2
 web_search |    503 | session_account_busy_retry_later              |     1
 answer     |    502 | upstream_unavailable                          |     1
 brief      |    401 | invalid_run_grant                             |     1
 harness    |    401 | invalid_run_grant                             |     1
 harness    |    502 | upstream_unavailable                          |     1
 tool_step  |    409 | session_account_unavailable_start_new_session |     1
 tool_step  |    503 | execution_capability_unavailable              |     1
 answer     |    401 | invalid_run_grant                             |     1
```

**A4 outcome va upstream_error**

```text
      outcome       | upstream_error | calls 
--------------------+----------------+-------
 -                  | -              |   119
 cancelled          | -              |    23
 upstream_error     | -              |     8
 transport_complete | api_error      |     5
```

**A5 gateway_calls theo model**

```text
       model       | calls | err 
-------------------+-------+-----
 gpt-6-sol         |  4912 | 108
 claude-sonnet-5-5 |  2048 |  13
 claude-haiku-5-5  |  1382 |   7
 gpt-6-luna        |   779 |   2
 gpt-6-astra       |    58 |   0
 -                 |     6 |   6
```

**A6 gateway_calls theo ngay (UTC+7)**

```text
    day     | calls | err | s429 | s5xx | err_pct 
------------+-------+-----+------+------+---------
 2026-10-19 |   766 |   4 |    0 |    4 |    0.52
 2026-10-20 |   458 |  10 |    0 |   10 |    2.18
 2026-10-21 |  1009 |   3 |    0 |    3 |    0.30
 2026-10-22 |  1505 |  35 |    0 |   25 |    2.33
 2026-10-23 |   959 |  46 |    0 |   33 |    4.80
 2026-10-24 |   623 |  12 |    0 |    8 |    1.93
 2026-10-25 |    95 |   2 |    0 |    0 |    2.11
 2026-10-26 |    58 |   4 |    0 |    0 |    6.90
 2026-10-27 |  1316 |   4 |    0 |    0 |    0.30
 2026-10-28 |  1624 |   9 |    0 |    8 |    0.55
 2026-10-29 |   772 |   7 |    0 |    2 |    0.91
```


Nhận xét ngắn: lỗi chủ yếu là 503 `session_account_busy_retry_later` (73) và 409 `session_account_unavailable_start_new_session` (37, chỉ ở purpose `answer`); không có 429. Dòng `status 200 / code client_cancelled` (5) là client hủy, không phải lỗi. Model có `-` (6 dòng) là cuộc gọi bị từ chối trước khi biết model.

## B. tool_failures (theo tool và error class)

Error class = cột `code` (mã của Piagent `managed_*`, hoặc cách lệnh kết thúc: `exit_N`, `timeout`, `error`).

**B1 tool_failures theo tool x code**

```text
       tool        |              code               |  n  | runs 
-------------------+---------------------------------+-----+------
 read              | error                           | 118 |   40
 bash              | error                           | 108 |   58
 edit              | error                           |  47 |   31
 bash              | exit_1                          |  40 |   32
 grep              | error                           |  33 |   21
 bash              | timeout                         |  27 |   20
 delegate          | timeout                         |  25 |   12
 bash              | managed_sandbox_denied          |  19 |   15
 web_fetch         | error                           |  17 |    8
 bash              | exit_2                          |  16 |   14
 run_with_docker   | managed_docker_unreachable      |  12 |   11
 ls                | error                           |   9 |    6
 delegate          | managed_helper_failed           |   8 |    6
 run_with_network  | error                           |   7 |    4
 bash              | managed_runtime_changed         |   7 |    5
 write             | managed_plan_required           |   6 |    6
 start_docker      | managed_docker_start_timeout    |   6 |    6
 delegate          | error                           |   6 |    6
 run_with_network  | managed_network_unreachable     |   5 |    3
 ask_user          | error                           |   5 |    5
 delegate          | managed_helper_unavailable      |   5 |    4
 find              | error                           |   5 |    5
 bash              | managed_network_blocked         |   4 |    3
 delegate          | managed_review_base_unknown     |   4 |    2
 delegate          | exit_1                          |   4 |    3
 bash              | managed_tool_timeout            |   4 |    4
 grep              | managed_tool_timeout            |   4 |    4
 resolve_objection | error                           |   3 |    2
 resolve_objection | managed_objection_settled       |   3 |    1
 bash              | exit_128                        |   3 |    3
 delegate          | managed_helper_disputed         |   3 |    3
 ls                | managed_runtime_changed         |   3 |    2
 delegate          | managed_network_blocked         |   3 |    3
 run_with_docker   | error                           |   3 |    2
 read              | managed_runtime_changed         |   3 |    3
 update_plan       | error                           |   3 |    3
 bash              | managed_toolchain_missing       |   2 |    2
 ask_user          | managed_question_cancelled      |   2 |    2
 find              | managed_runtime_changed         |   2 |    2
 grep              | managed_runtime_changed         |   2 |    1
 grep              | managed_sandbox_denied          |   2 |    2
 run_on_host       | error                           |   2 |    1
 update_plan       | managed_plan_invalid            |   2 |    2
 run_on_host       | exit_1                          |   1 |    1
 run_on_host       | exit_128                        |   1 |    1
 fetch_origin      | managed_repository_fetch_failed |   1 |    1
 edit              | managed_plan_required           |   1 |    1
 delegate          | managed_helper_limit            |   1 |    1
 delegate          | managed_broker                  |   1 |    1
 bash              | managed_objection_open          |   1 |    1
 bash              | managed_docker_blocked          |   1 |    1
 write             | managed_runtime_changed         |   1 |    1
 bash              | exit_3                          |   1 |    1
 web_search        | web_search_failed               |   1 |    1
 read              | managed_sandbox_denied          |   1 |    1
 bash              | exit_254                        |   1 |    1
```

**B2 tool_failures theo tool**

```text
       tool        |  n  | avg_ms 
-------------------+-----+--------
 bash              | 234 |  86165
 read              | 122 |   7376
 delegate          |  60 | 490993
 edit              |  48 |   5317
 grep              |  41 |   7647
 web_fetch         |  17 |   3289
 run_with_docker   |  15 |  13522
 run_with_network  |  12 |  56805
 ls                |  12 |   2917
 ask_user          |   7 |  12839
 find              |   7 |   3513
 write             |   7 |     36
 resolve_objection |   6 |      1
 start_docker      |   6 | 256503
 update_plan       |   5 |     18
 run_on_host       |   4 |    502
 fetch_origin      |   1 |   1457
 web_search        |   1 |   3537
```

**B3 tool_failures theo role**

```text
   role   |  n  
----------+-----
 main     | 439
 review   | 114
 scout    |  26
 research |  18
 verify   |   8
```

**B4 tool_failures theo engine (Docker)**

```text
  engine   |  n  
-----------+-----
 available | 307
 none      | 283
 used      |  15
```

**B5 tool_failures theo ngay (UTC+7)**

```text
    day     |  n  | runs_affected 
------------+-----+---------------
 2026-10-19 |  37 |             7
 2026-10-20 |  26 |             4
 2026-10-21 |  52 |            12
 2026-10-22 |  90 |            28
 2026-10-23 |  52 |            15
 2026-10-24 |  37 |             4
 2026-10-25 |   7 |             3
 2026-10-27 |  98 |            15
 2026-10-28 | 134 |            36
 2026-10-29 |  72 |            22
```


## C. client_disconnects

**C1 client_disconnects theo cause x phase x outcome**

```text
       cause        | phase  | outcome |  n  | avg_s | max_s 
--------------------+--------+---------+-----+-------+-------
 unknown            | model  | resumed | 195 |   165 |   379
 network            | model  | resumed |  40 |   138 |   788
 broker_offline     | broker | resumed |  38 |    36 |   303
 broker_offline     | model  | resumed |  22 |   184 |   491
 studio_update      | broker | resumed |  13 |   110 |   224
 studio_update      | model  | resumed |   7 |   179 |   425
 broker_offline     | model  | stopped |   5 |   210 |   522
 unknown            | model  | stopped |   2 |   183 |   263
 studio_unavailable | broker | resumed |   2 |   263 |   447
 studio_unavailable | model  | resumed |   1 |   212 |   212
```

**C2 client_disconnects theo reported_cause vs cause**

```text
   reported_cause   |       cause        |  n  
--------------------+--------------------+-----
 unknown            | unknown            | 197
 broker_offline     | broker_offline     |  65
 network            | network            |  40
 studio_update      | studio_update      |  20
 studio_unavailable | studio_unavailable |   3
```

**C3 client_disconnects theo ngay (UTC+7)**

```text
    day     |  n  | resumed | not_resumed 
------------+-----+---------+-------------
 2026-10-21 |   9 |       9 |           0
 2026-10-22 |  45 |      40 |           5
 2026-10-23 | 100 |     100 |           0
 2026-10-24 | 123 |     121 |           2
 2026-10-27 |  29 |      29 |           0
 2026-10-28 |  19 |      19 |           0
```


Tất cả các lần ngắt đều ghi nhận `outcome` là `resumed` hoặc `stopped`; không có `gave_up`. Số lần `unknown` chiếm đa số vì Piagent không phân loại được nguyên nhân.

## D. Run và process report

**D1 run counts**

```text
 runs | active | closing | closed | process_reported | reported_pct | members 
------+--------+---------+--------+------------------+--------------+---------
  328 |      9 |       2 |    317 |              313 |         95.4 |       4
```

**D2 process outcome**

```text
      outcome       | runs | changed 
--------------------+------+---------
 no_change          |  197 |       0
 clean              |   47 |      47
 review_unavailable |   22 |      22
 interrupted        |   22 |      22
 disputed           |   20 |      12
 (no report)        |   15 |       0
 unverified         |    5 |       5
```

**D3 verified rate**

```text
 reported | changed | changed_verified | verified_pct_of_changed | verified_any | verified_pct_of_reported | clean | checks | checks_failed | fix_loops 
----------+---------+------------------+-------------------------+--------------+--------------------------+-------+--------+---------------+-----------
      313 |     108 |               81 |                    75.0 |           81 |                     25.9 |    47 |    485 |           103 |        60
```

**D4 run theo ngay (UTC+7)**

```text
    day     | runs | reported | changed | changed_verified | verified_pct | members 
------------+------+----------+---------+------------------+--------------+---------
 2026-10-19 |   13 |       11 |       5 |                4 |         80.0 |       2
 2026-10-20 |    8 |        8 |       5 |                5 |        100.0 |       2
 2026-10-21 |   19 |       19 |      13 |               12 |         92.3 |       2
 2026-10-22 |   55 |       54 |      26 |               21 |         80.8 |       2
 2026-10-23 |   28 |       26 |      13 |                8 |         61.5 |       2
 2026-10-24 |    8 |        8 |       4 |                3 |         75.0 |       2
 2026-10-25 |    1 |        1 |       0 |                0 |              |       1
 2026-10-26 |    1 |        1 |       0 |                0 |              |       1
 2026-10-27 |   32 |       28 |       9 |                6 |         66.7 |       3
 2026-10-28 |   85 |       80 |      16 |               14 |         87.5 |       4
 2026-10-29 |   78 |       77 |      17 |                8 |         47.1 |       3
```

**D5 policy**

```text
  plan   | verify  | review  | runs 
---------+---------+---------+------
 require | require | require |  313
```


## Hạn chế

- Mẫu nhỏ (4 thành viên, 328 run); tỷ lệ theo ngày dao động mạnh khi ít run (ví dụ 2026-10-29 chưa hết ngày, 47,1% trên 17 run có thay đổi).
- 15 run không có process report (client cũ, hoặc run chưa đóng), không tính vào mẫu số verified.
- "Verified" là tự khai của client trong report, không phải kiểm chứng độc lập từ Studio.
- Lọc theo thời điểm membership cho số nhỏ hơn đếm thô theo user có membership bất kỳ lúc nào trong cửa sổ (gateway_calls 9.185 so với 11.079); baseline dùng số đã lọc.
- Chỉ đọc lượng tổng hợp; không phân tích nội dung `input`/`error`.

## SQL đã chạy

Chạy bằng `docker exec -i agent-studio-mini-postgres-1 psql -U postgres -d studio -X` với DOCKER_CONTEXT=desktop-linux, nạp qua stdin. Kết thúc bằng `COMMIT` của transaction chỉ đọc (không có thay đổi dữ liệu).

```sql
BEGIN READ ONLY;
SET default_transaction_read_only=on;
SELECT '<team-id>' AS team, to_char(date_trunc('minute',now())-interval '14 days','YYYY-MM-DD HH24:MI:SS+00') AS since, to_char(date_trunc('minute',now()),'YYYY-MM-DD HH24:MI:SS+00') AS until \gset
\set m 'SELECT DISTINCT m.user_id FROM memberships m WHERE m.team_id=:\'team\' AND m.started_at<:\'until\' AND (m.ended_at IS NULL OR m.ended_at>:\'since\')'
\echo ## A0 tong quan
SELECT count(*) calls, count(*) FILTER(WHERE status<400) ok, count(*) FILTER(WHERE status>=400) err, count(DISTINCT user_id) members_active, round(avg(duration_ms)) avg_ms, percentile_disc(0.5) WITHIN GROUP(ORDER BY first_byte_ms) p50_fb_ms, percentile_disc(0.95) WITHIN GROUP(ORDER BY first_byte_ms) p95_fb_ms FROM gateway_calls g WHERE g.received_at>=:'since' AND g.received_at<:'until' AND EXISTS(SELECT 1 FROM memberships mm WHERE mm.user_id=g.user_id AND mm.team_id=:'team' AND mm.started_at<=g.received_at AND (mm.ended_at IS NULL OR mm.ended_at>g.received_at));
\echo ## A1 gateway_calls theo purpose
SELECT coalesce(purpose,'(null)') purpose, count(*) calls, count(*) FILTER(WHERE status<400) ok, count(*) FILTER(WHERE status>=400) err, round(100.0*count(*) FILTER(WHERE status>=400)/count(*),2) err_pct FROM gateway_calls g WHERE g.received_at>=:'since' AND g.received_at<:'until' AND EXISTS(SELECT 1 FROM memberships mm WHERE mm.user_id=g.user_id AND mm.team_id=:'team' AND mm.started_at<=g.received_at AND (mm.ended_at IS NULL OR mm.ended_at>g.received_at)) GROUP BY 1 ORDER BY 2 DESC;
\echo ## A2 gateway_calls theo status/code
SELECT status, coalesce(code,'-') code, count(*) calls FROM gateway_calls g WHERE g.received_at>=:'since' AND g.received_at<:'until' AND EXISTS(SELECT 1 FROM memberships mm WHERE mm.user_id=g.user_id AND mm.team_id=:'team' AND mm.started_at<=g.received_at AND (mm.ended_at IS NULL OR mm.ended_at>g.received_at)) GROUP BY 1,2 ORDER BY 3 DESC;
\echo ## A3 gateway_calls loi theo purpose x status/code
SELECT coalesce(purpose,'(null)') purpose, status, coalesce(code,'-') code, count(*) calls FROM gateway_calls g WHERE g.received_at>=:'since' AND g.received_at<:'until' AND EXISTS(SELECT 1 FROM memberships mm WHERE mm.user_id=g.user_id AND mm.team_id=:'team' AND mm.started_at<=g.received_at AND (mm.ended_at IS NULL OR mm.ended_at>g.received_at)) AND g.status>=400 GROUP BY 1,2,3 ORDER BY 4 DESC;
\echo ## A4 outcome va upstream_error
SELECT coalesce(outcome,'-') outcome, coalesce(upstream_error,'-') upstream_error, count(*) calls FROM gateway_calls g WHERE g.received_at>=:'since' AND g.received_at<:'until' AND EXISTS(SELECT 1 FROM memberships mm WHERE mm.user_id=g.user_id AND mm.team_id=:'team' AND mm.started_at<=g.received_at AND (mm.ended_at IS NULL OR mm.ended_at>g.received_at)) AND (g.outcome IS DISTINCT FROM 'transport_complete' OR g.upstream_error IS NOT NULL) GROUP BY 1,2 ORDER BY 3 DESC;
\echo ## A5 gateway_calls theo model
SELECT coalesce(requested_model,'-') model, count(*) calls, count(*) FILTER(WHERE status>=400) err FROM gateway_calls g WHERE g.received_at>=:'since' AND g.received_at<:'until' AND EXISTS(SELECT 1 FROM memberships mm WHERE mm.user_id=g.user_id AND mm.team_id=:'team' AND mm.started_at<=g.received_at AND (mm.ended_at IS NULL OR mm.ended_at>g.received_at)) GROUP BY 1 ORDER BY 2 DESC;
\echo ## A6 gateway_calls theo ngay (UTC+7)
SELECT ((g.received_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day, count(*) calls, count(*) FILTER(WHERE status>=400) err, count(*) FILTER(WHERE status=429) s429, count(*) FILTER(WHERE status>=500) s5xx, round(100.0*count(*) FILTER(WHERE status>=400)/count(*),2) err_pct FROM gateway_calls g WHERE g.received_at>=:'since' AND g.received_at<:'until' AND EXISTS(SELECT 1 FROM memberships mm WHERE mm.user_id=g.user_id AND mm.team_id=:'team' AND mm.started_at<=g.received_at AND (mm.ended_at IS NULL OR mm.ended_at>g.received_at)) GROUP BY 1 ORDER BY 1;
\echo ## B1 tool_failures theo tool x code
SELECT f.tool, f.code, count(*) n, count(DISTINCT f.run_id) runs FROM tool_failures f WHERE f.at>=:'since' AND f.at<:'until' AND EXISTS(SELECT 1 FROM memberships mm WHERE mm.user_id=f.user_id AND mm.team_id=:'team' AND mm.started_at<=f.at AND (mm.ended_at IS NULL OR mm.ended_at>f.at)) GROUP BY 1,2 ORDER BY 3 DESC;
\echo ## B2 tool_failures theo tool
SELECT f.tool, count(*) n, round(avg(f.duration_ms)) avg_ms FROM tool_failures f WHERE f.at>=:'since' AND f.at<:'until' AND EXISTS(SELECT 1 FROM memberships mm WHERE mm.user_id=f.user_id AND mm.team_id=:'team' AND mm.started_at<=f.at AND (mm.ended_at IS NULL OR mm.ended_at>f.at)) GROUP BY 1 ORDER BY 2 DESC;
\echo ## B3 tool_failures theo role
SELECT coalesce(f.role,'-') role, count(*) n FROM tool_failures f WHERE f.at>=:'since' AND f.at<:'until' AND EXISTS(SELECT 1 FROM memberships mm WHERE mm.user_id=f.user_id AND mm.team_id=:'team' AND mm.started_at<=f.at AND (mm.ended_at IS NULL OR mm.ended_at>f.at)) GROUP BY 1 ORDER BY 2 DESC;
\echo ## B4 tool_failures theo engine (Docker)
SELECT coalesce(f.engine,'-') engine, count(*) n FROM tool_failures f WHERE f.at>=:'since' AND f.at<:'until' AND EXISTS(SELECT 1 FROM memberships mm WHERE mm.user_id=f.user_id AND mm.team_id=:'team' AND mm.started_at<=f.at AND (mm.ended_at IS NULL OR mm.ended_at>f.at)) GROUP BY 1 ORDER BY 2 DESC;
\echo ## B5 tool_failures theo ngay (UTC+7)
SELECT ((f.at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day, count(*) n, count(DISTINCT f.run_id) runs_affected FROM tool_failures f WHERE f.at>=:'since' AND f.at<:'until' AND EXISTS(SELECT 1 FROM memberships mm WHERE mm.user_id=f.user_id AND mm.team_id=:'team' AND mm.started_at<=f.at AND (mm.ended_at IS NULL OR mm.ended_at>f.at)) GROUP BY 1 ORDER BY 1;
\echo ## C1 client_disconnects theo cause x phase x outcome
SELECT d.cause, d.phase, d.outcome, count(*) n, round(avg(extract(epoch FROM d.ended_at-d.started_at))) avg_s, round(max(extract(epoch FROM d.ended_at-d.started_at))) max_s FROM client_disconnects d WHERE d.started_at>=:'since' AND d.started_at<:'until' AND EXISTS(SELECT 1 FROM memberships mm WHERE mm.user_id=d.user_id AND mm.team_id=:'team' AND mm.started_at<=d.started_at AND (mm.ended_at IS NULL OR mm.ended_at>d.started_at)) GROUP BY 1,2,3 ORDER BY 4 DESC;
\echo ## C2 client_disconnects theo reported_cause vs cause
SELECT d.reported_cause, d.cause, count(*) n FROM client_disconnects d WHERE d.started_at>=:'since' AND d.started_at<:'until' AND EXISTS(SELECT 1 FROM memberships mm WHERE mm.user_id=d.user_id AND mm.team_id=:'team' AND mm.started_at<=d.started_at AND (mm.ended_at IS NULL OR mm.ended_at>d.started_at)) GROUP BY 1,2 ORDER BY 3 DESC;
\echo ## C3 client_disconnects theo ngay (UTC+7)
SELECT ((d.started_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day, count(*) n, count(*) FILTER(WHERE outcome='resumed') resumed, count(*) FILTER(WHERE outcome<>'resumed') not_resumed FROM client_disconnects d WHERE d.started_at>=:'since' AND d.started_at<:'until' AND EXISTS(SELECT 1 FROM memberships mm WHERE mm.user_id=d.user_id AND mm.team_id=:'team' AND mm.started_at<=d.started_at AND (mm.ended_at IS NULL OR mm.ended_at>d.started_at)) GROUP BY 1 ORDER BY 1;
\echo ## D1 run counts
SELECT count(*) runs, count(*) FILTER(WHERE state='active') active, count(*) FILTER(WHERE state='closing') closing, count(*) FILTER(WHERE state='closed') closed, count(process) process_reported, round(100.0*count(process)/count(*),1) reported_pct, count(DISTINCT owner_id) members FROM managed_runs r WHERE r.team_id=:'team' AND r.created_at>=:'since' AND r.created_at<:'until';
\echo ## D2 process outcome
SELECT coalesce(r.process->>'outcome','(no report)') outcome, count(*) runs, count(*) FILTER(WHERE (r.process->>'changed')::boolean) changed FROM managed_runs r WHERE r.team_id=:'team' AND r.created_at>=:'since' AND r.created_at<:'until' GROUP BY 1 ORDER BY 2 DESC;
\echo ## D3 verified rate
SELECT count(r.process) reported, count(*) FILTER(WHERE (r.process->>'changed')::boolean) changed, count(*) FILTER(WHERE (r.process->>'changed')::boolean AND (r.process->>'verified')::boolean) changed_verified, round(100.0*count(*) FILTER(WHERE (r.process->>'changed')::boolean AND (r.process->>'verified')::boolean)/nullif(count(*) FILTER(WHERE (r.process->>'changed')::boolean),0),1) verified_pct_of_changed, count(*) FILTER(WHERE (r.process->>'verified')::boolean) verified_any, round(100.0*count(*) FILTER(WHERE (r.process->>'verified')::boolean)/nullif(count(r.process),0),1) verified_pct_of_reported, count(*) FILTER(WHERE (r.process->>'changed')::boolean AND r.process->>'outcome'='clean') clean, coalesce(sum((r.process->>'checks')::int),0) checks, coalesce(sum((r.process->>'checks_failed')::int),0) checks_failed, coalesce(sum((r.process->>'fix_loops')::int),0) fix_loops FROM managed_runs r WHERE r.team_id=:'team' AND r.created_at>=:'since' AND r.created_at<:'until';
\echo ## D4 run theo ngay (UTC+7)
SELECT ((r.created_at) AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day, count(*) runs, count(r.process) reported, count(*) FILTER(WHERE (r.process->>'changed')::boolean) changed, count(*) FILTER(WHERE (r.process->>'changed')::boolean AND (r.process->>'verified')::boolean) changed_verified, round(100.0*count(*) FILTER(WHERE (r.process->>'changed')::boolean AND (r.process->>'verified')::boolean)/nullif(count(*) FILTER(WHERE (r.process->>'changed')::boolean),0),1) verified_pct, count(DISTINCT owner_id) members FROM managed_runs r WHERE r.team_id=:'team' AND r.created_at>=:'since' AND r.created_at<:'until' GROUP BY 1 ORDER BY 1;
\echo ## D5 policy
SELECT r.process->'policy'->>'plan' plan, r.process->'policy'->>'verify' verify, r.process->'policy'->>'review' review, count(*) runs FROM managed_runs r WHERE r.team_id=:'team' AND r.created_at>=:'since' AND r.created_at<:'until' AND r.process IS NOT NULL GROUP BY 1,2,3 ORDER BY 4 DESC;
```
