// Extrait les métriques clés d'un export JSON k6.
// Usage: node load-tests/extract-k6-metrics.mjs <fichier.json>
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node load-tests/extract-k6-metrics.mjs <file.json>');
  process.exit(1);
}

const data = JSON.parse(readFileSync(file, 'utf8'));
const m = data.metrics;
const pick = (name) => (m[name] ? m[name].values : null);

const duration = pick('http_req_duration');
const failed = pick('http_req_failed');
const reqs = pick('http_reqs');
const checks = pick('checks');
const iterations = pick('iterations');
const vusMax = pick('vus_max');

console.log(
  JSON.stringify(
    {
      file,
      http_req_duration: duration,
      http_req_failed: failed,
      http_reqs: reqs,
      checks,
      iterations,
      vus_max: vusMax,
      testRunDurationMs: data.state ? data.state.testRunDurationMs : null,
    },
    null,
    2,
  ),
);
