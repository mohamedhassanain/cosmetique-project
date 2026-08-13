# SUPABASE LOAD MONITORING — KISSARIYA COSMÉTIQUES

Date: 13/08/2026. Exact procedure to collect the live Supabase evidence required to classify the 700–1000 VU saturation. **REQUIRES MANUAL SUPABASE DASHBOARD OBSERVATION** — this environment has no dashboard/API access to the Supabase project, so these metrics are currently UNKNOWN and must be captured by hand during a k6 run.

## 1. What must be monitored (and why)

| Metric | Where | Relevance | Current status |
|---|---|---|---|
| Database CPU | Dashboard → Database → Monitoring (CPU) | If ~100% while k6 p95 degrades → DB-bound (PROVEN) | UNKNOWN |
| Database memory (if available on free tier) | same panel | OOM/swap would show latency | UNKNOWN |
| Database connections (active/max) | Dashboard → Database / `pg_stat_activity` | Connection-pool saturation manifests as queuing | UNKNOWN |
| API latency | Dashboard → API → Monitoring (latency) or `api-logs` | Confirms whether the edge/PostgREST layer is the slow part | UNKNOWN |
| API errors (4xx/5xx, rate limits) | Dashboard → API (errors / reports) | 429/5xx → platform limit | UNKNOWN |
| API throughput (RPS) | Dashboard → API | Correlates with k6 RPS | UNKNOWN |
| Bandwidth | Dashboard → API/Bandwidth | Large payload/egress limits | UNKNOWN |
| Database size | Dashboard → Database → Size | Free-plan limit pressure | UNKNOWN |
| Storage usage | Dashboard → Storage | Not on the k6 path (no image loads) | UNKNOWN |
| Auth activity | Dashboard → Authentication | Zero in load tests — expected flat | UNKNOWN |
| Rate limits (platform) | Dashboard → API (Rate limits) / billing limits | 429s during the run → plan limit PROVEN | UNKNOWN |

## 2. Before the run (2 minutes)

1. Open the Supabase Dashboard for the project in a browser.
2. Open these tabs (refresh continuously during the run):
   - **Database → Monitoring → CPU** (and memory if present).
   - **API → Monitoring → Latency / Throughput** (or API Logs filtered to `rest`).
   - **API → Errors** (watch for 429 / 5xx counts).
   - **Database → Connections** (`pg_stat_activity`) or ask support for PgBouncer usage on Free.
   - **Billing → Usage** (free quota bars: API requests, database egress, CPU time).
3. Prepare the exact k6 command to run at the breaking point (see §4).

## 3. During the run (what to capture, minute by minute)

1. Start the k6 run with the SAME stop conditions and capture its summary JSON.
2. Every 30–60s record into a table (like below):
   - Wall-clock time (to correlate with k6 stages)
   - k6 current p95 (from the k6 live console)
   - DB CPU %, DB connections count
   - API latency (dashboard), API requests count/RPS
   - Errors (429/5xx) count
   - Bandwidth (if shown)
3. At the moment p95 crosses the threshold (e.g. >2s), record which panel moved first: DB CPU? connections? API latency? errors?

Suggested log:

| Time | k6 stage | k6 p95 | DB CPU% | Connections | API latency | API RPS | Errors | Notes |
|---|---|---|---|---|---|---|---|---|
| 13:00:00 | ramp 700 | 120ms | 12% | 12 | 80ms | 410 | 0 | |
| 13:00:30 | ramp 1000 | 900ms | 45% | 35 | 650ms | 520 | 0 | first slowdown |
| … | sustain 1000 | 3.2s | 98% | 64 | 3.1s | 380 | 0 | DB CPU saturated |

## 4. The decisive run (reproduce the collapse)

Command (from repo root, real project, anon key only, read-only):

```bash
k6 run -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e MAX_VUS=1000 \
       -e RAMP_UP=20s -e SUSTAIN_DURATION=60s -e RAMP_DOWN=20s \
       load-tests/k6-isolated.js   # ENDPOINT=home (highest RPS endpoint)
```

then repeat with `ENDPOINT=search` (highest per-query complexity) and `ENDPOINT=catalog`.

## 5. Decision table (how to classify afterward)

| Observation during run | Classification |
|---|---|
| DB CPU pegged ~100% when p95 degrades; connections flat | **PROVEN — PostgreSQL CPU (DB-bound)** |
| Connections pinned at max / queries queued in `pg_stat_activity`, CPU moderate | **PROVEN — connection saturation** |
| API latency panel degrades before DB CPU moves | **PROVEN — Supabase API/edge or rate limiting** |
| 429/5xx appear in API Errors exactly when k6 p95 jumps | **PROVEN — platform/rate-limit** |
| All panels healthy while k6 p95 degrades | Load generator / network are suspect (already partially excluded — see BOTTLENECK_ANALYSIS) |
| Dashboard metrics not visible during run | **UNKNOWN — REQUIRES LIVE SUPABASE DASHBOARD METRICS** |

## 6. Honest status

- The repository CANNOT see the Supabase dashboard. No Supabase metric (CPU, connections, API latency, errors, rate limits, bandwidth, DB size) has been observed during a load test.
- **Conclusion: the exact Supabase-internal bottleneck is UNKNOWN until §2–§4 are executed by someone with dashboard access.**
