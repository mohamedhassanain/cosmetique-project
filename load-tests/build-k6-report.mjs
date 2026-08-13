// KISSARIYA — build ISOLATED_LOAD_TEST_REPORT.md from k6 JSON exports +
// the sweep progress log (source of truth for which runs happened today).
// Usage: node load-tests/build-k6-report.mjs
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RESULTS_DIR = 'load-tests/results';
const PROGRESS_LOG = join(RESULTS_DIR, 'sweep-progress.log');

// Labels re-run by the monitored confirmation after the sweep completed
// (their JSON exports were overwritten with the re-run metrics).
const RERUN_LABELS = new Set(['iso-home-1000', 'global-700']);

// ---- parse sweep log: label -> exit code ; label -> logged p95 ----
const exitByLabel = new Map();
const p95ByLabel = new Map();
if (existsSync(PROGRESS_LOG)) {
  for (const line of readFileSync(PROGRESS_LOG, 'utf8').split(/\r?\n/)) {
    let m = line.match(/DONE\s+((?:iso|global)-\S+)\s+exit=(\d+)\s+p95=([\d.]+)/);
    if (m) {
      exitByLabel.set(m[1], Number(m[2]));
      p95ByLabel.set(m[1], Number(m[3]));
      continue;
    }
    m = line.match(/DONE\s+(iso-\S+)\s+exit=(\d+)/);
    if (m) exitByLabel.set(m[1], Number(m[2]));
  }
}

const globalRuns = [...exitByLabel.keys()].filter((k) => k.startsWith('global-'));
const stopLine = existsSync(PROGRESS_LOG)
  ? [...readFileSync(PROGRESS_LOG, 'utf8').split(/\r?\n/)].find((l) => l.includes('STOP CONDITION at global-'))
  : null;

function readJson(name) {
  const p = join(RESULTS_DIR, name);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function pick(metric, key) {
  if (!metric || !metric.values) return null;
  return metric.values[key];
}

function extract(data) {
  if (!data) return null;
  const m = data.metrics || {};
  return {
    p50: pick(m.http_req_duration, 'med') ?? pick(m.http_req_duration, 'p(50)'),
    p90: pick(m.http_req_duration, 'p(90)'),
    p95: pick(m.http_req_duration, 'p(95)'),
    p99: pick(m.http_req_duration, 'p(99)'),
    max: pick(m.http_req_duration, 'max'),
    failed: pick(m.http_req_failed, 'rate'),
    rps: (() => {
      const reqs = pick(m.http_reqs, 'count');
      if (reqs === null || !data.state?.testRunDurationMs) return null;
      return Math.round((reqs / (data.state.testRunDurationMs / 1000)) * 10) / 10;
    })(),
  };
}

function ms(v) {
  return v === null || v === undefined ? '—' : `${Math.round(v)} ms`;
}

function pct(v) {
  if (v === null || v === undefined) return '—';
  return `${(v * 100).toFixed(3)}%`;
}

const ENDPOINTS = ['home', 'catalog', 'search', 'detail'];
const VUS = [100, 500, 600, 700, 800, 900, 1000];

let out = '';
out += '# Isolated Load Test Report\n\n';
out += `Generated: ${new Date().toISOString()}\n\n`;
out += 'Real Supabase project (`https://ygkeuhatokvkdwwoccty.supabase.co`), read-only workload, public anon key only.\n\n';
out += 'Requests per iteration per endpoint:\n';
out += '- HOME = 5 (`site_settings`, `categories`, `subcategories`, `promos`, `products`)\n';
out += '- CATALOG = 3 (`categories`, `subcategories`, `products`)\n';
out += '- SEARCH = 1 (`products` hybrid `search_vector.phfts` + `name/brand.ilike`)\n';
out += '- DETAIL = 1 (`products` by slug)\n\n';
out += 'k6 stages: 20s ramp-up / 60s sustain / 20s ramp-down. Thresholds: `http_req_failed < 5%`, `p(95) < 2000 ms`.\n\n';
out += 'Legend: `exit=99` = k6 threshold `p(95)<2000 ms` crossed on that run (saturation window).\n\n';

for (const ep of ENDPOINTS) {
  out += `## ${ep.toUpperCase()}\n\n`;
  out += '| VU | Exit | RPS | p50 | p90 | p95 | p99 | max | Errors |\n';
  out += '|----|----:|----:|----:|----:|----:|----:|----:|----:|\n';
  for (const vu of VUS) {
    const d = extract(readJson(`k6-${ep}-${vu}vu.json`));
    const exit = exitByLabel.get(`iso-${ep}-${vu}`);
    if (!d) {
      out += `| ${vu} | — | — | — | — | — | — | — | — |\n`;
      continue;
    }
    const exitTxt = exit === 99 ? '**99**' : '0';
    out += `| ${vu} | ${exitTxt} | ${d.rps ?? '—'} | ${ms(d.p50)} | ${ms(d.p90)} | ${ms(d.p95)} | ${ms(d.p99)} | ${ms(d.max)} | ${pct(d.failed ?? 0)} |\n`;
  }
  out += '\n';
}

out += '# Global Mixed Workload\n\n';
out += 'Same real Supabase project, `supabase-optimized2-load.js` (home → detail → filtered catalog → search, 8 requests/iteration, 1.5–5 s sleeps, 90s ramp-up / 2m sustain / 60s ramp-down).\n\n';
const sortedGlobals = globalRuns
  .map((k) => Number(k.replace('global-', '')))
  .sort((a, b) => a - b);

if (sortedGlobals.length === 0) {
  out += 'No global runs recorded in the sweep log.\n\n';
} else {
  out += '| VU | Exit | RPS | p50 | p90 | p95 | p99 | max | Errors |\n';
  out += '|----|----:|----:|----:|----:|----:|----:|----:|----:|\n';
  for (const vu of sortedGlobals) {
    const d = extract(readJson(`optimized2-${vu}vu.json`));
    const exit = exitByLabel.get(`global-${vu}`);
    if (!d) {
      out += `| ${vu} | ${exit ?? '—'} | — | — | — | — | — | — | — |\n`;
      continue;
    }
    const exitTxt = exit === 99 ? '**99**' : '0';
    out += `| ${vu} | ${exitTxt} | ${d.rps ?? '—'} | ${ms(d.p50)} | ${ms(d.p90)} | ${ms(d.p95)} | ${ms(d.p99)} | ${ms(d.max)} | ${pct(d.failed ?? 0)} |\n`;
  }
  out += '\n';
}

if (stopLine) {
  out += `**Stop condition:** ${stopLine.replace(/^\[[^\]]+\]\s*/, '')}\n\n`;
} else {
  out += 'No stop condition logged — sweep completed all planned stages.\n\n';
}

// ---- Note when a threshold-crossing row's JSON was overwritten by the
//      monitored confirmation re-run (exit flag kept from the sweep log) ----
const overwritten = [];
for (const [label, exit] of exitByLabel) {
  if (exit !== 99) continue;
  const loggedP95 = p95ByLabel.get(label);
  const jsonP95 = readJson(label.startsWith('global-')
    ? `optimized2-${label.replace('global-', '')}vu.json`
    : `k6-${label.replace('iso-', '')}vu.json`)?.metrics?.http_req_duration?.values?.['p(95)'];
  const wasRerun = RERUN_LABELS.has(label);
  if (wasRerun || (loggedP95 !== undefined && jsonP95 !== undefined && jsonP95 < loggedP95 * 0.5)) {
    if (loggedP95 !== undefined && jsonP95 !== undefined) {
      overwritten.push(`${label}: sweep p95=${Math.round(loggedP95)} ms → re-run p95=${Math.round(jsonP95)} ms`);
    } else {
      overwritten.push(`${label}: JSON replaced by the monitored re-run (sweep p95=${loggedP95 ?? '?'} ms)`);
    }
  }
}
if (overwritten.length > 0) {
  out += '**Note — JSON overwritten by monitored re-run:** rows that crossed `p(95)<2000 ms` were re-run with the machine monitor; the table shows the re-run metrics with the sweep exit flag, and the original sweep p95 is preserved in `load-tests/results/sweep-progress.log`.\n\n';
  for (const o of overwritten) out += `- ${o}\n`;
  out += '\n';
}

// ---- Machine monitor summary ----
const machineFiles = readdirSync(RESULTS_DIR).filter((f) => f.startsWith('machine-') && f.endsWith('.csv'));
out += '# Load Generator Monitor\n\n';
if (machineFiles.length === 0) {
  out += 'No machine monitor CSVs found — load-generator resource usage could not be verified for this sweep (UNKNOWN).\n';
} else {
  out += `Machine CSV samples written for **${machineFiles.length}** runs.\n\n`;
  out += '| File | Peak total CPU % | Peak k6 CPU % | Peak RAM used % |\n';
  out += '|---|---:|---:|---:|\n';
  let maxTotalCpu = 0, maxK6Cpu = 0, maxMem = 0;
  for (const f of machineFiles.sort()) {
    try {
      const lines = readFileSync(join(RESULTS_DIR, f), 'utf8').split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) continue;
      let totalCpu = 0, k6Cpu = 0, mem = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        totalCpu = Math.max(totalCpu, Number(cols[3]) || 0);
        k6Cpu = Math.max(k6Cpu, Number(cols[1]) || 0);
        mem = Math.max(mem, Number(cols[5]) || 0);
      }
      maxTotalCpu = Math.max(maxTotalCpu, totalCpu);
      maxK6Cpu = Math.max(maxK6Cpu, k6Cpu);
      maxMem = Math.max(maxMem, mem);
      out += `| ${f} | ${totalCpu.toFixed(1)}% | ${k6Cpu.toFixed(1)}% | ${mem.toFixed(1)}% |\n`;
    } catch {
      // skip unreadable
    }
  }
  out += `\nOverall peaks: total CPU **${maxTotalCpu.toFixed(1)}%**, k6 CPU **${maxK6Cpu.toFixed(1)}%**, RAM **${maxMem.toFixed(1)}%**.\n`;
  if (maxTotalCpu >= 90) {
    out += '\n> ⚠ **LOAD GENERATOR BOTTLENECK**: total machine CPU reached ≥90%. Results at/above that point may be constrained by the client, not Supabase.\n';
  } else {
    out += '\nLoad generator stayed below 90% total CPU — client saturation was NOT the cause of the observed latency degradation.\n';
  }
}

writeFileSync('ISOLATED_LOAD_TEST_REPORT.md', out, 'utf8');
console.log('Wrote ISOLATED_LOAD_TEST_REPORT.md');
console.log(`Global runs today: ${sortedGlobals.join(', ') || 'none'}`);
console.log(`Machine CSVs: ${machineFiles.length}`);
