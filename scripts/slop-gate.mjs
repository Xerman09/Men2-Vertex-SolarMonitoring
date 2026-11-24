// Standing slop gate — the five greps from the slopRecs/fullRecs audit series.
// Fails (exit 1) on any violation. Run: `node scripts/slop-gate.mjs`. CI runs it too.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.argv[2] || 'src');
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      walk(f);
    } else if (/\.(ts|tsx)$/.test(f)) files.push(f);
  }
})(ROOT);

const failures = [];
const check = (name, test, allow = () => false) => {
  for (const f of files) {
    const rel = path.relative(process.cwd(), f).replace(/\\/g, '/');
    fs.readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (test(line) && !allow(rel, i + 1)) failures.push(`${name} ${rel}:${i + 1}`);
      });
  }
};

// 1. No `any` escape hatches (R1–R3 across the series; canonical zero since fullRecs).
check('ANY', (l) => /:\s*any\b|<\s*any[\s,>\]]|as\s+any\b|any\[\]/.test(l));
// 2. No raw console outside the logger itself (R2; no-console twin for CI).
check(
  'CONSOLE',
  (l) => /console\.(log|warn|error|info|debug)\s*\(/.test(l),
  (rel) => rel === 'src/lib/logger.ts'
);
// 3. No magic `60 * 1000` outside the canonical definition (R1 exemption: rate-limit.ts:8).
check(
  'MAGIC',
  (l) => /\b60\s*\*\s*1000\b/.test(l),
  (rel) => rel === 'src/lib/rate-limit.ts'
);
// 4. No raw timers outside usePolling, the limiter itself, and tests.
check(
  'TIMER',
  (l) => /\b(setInterval|setTimeout)\s*\(/.test(l),
  (rel) =>
    rel === 'src/lib/usePolling.ts' || rel === 'src/lib/rate-limit.ts' || rel.includes('__tests__')
);
// 5. No god files: 1000-line ceiling (largest is ~920 and falling).
for (const f of files) {
  const n = fs.readFileSync(f, 'utf8').split('\n').length;
  if (n > 1000) failures.push(`GOD ${path.relative(process.cwd(), f).replace(/\\/g, '/')}:${n}`);
}

if (failures.length > 0) {
  console.error('slop-gate FAILED:\n' + failures.join('\n'));
  process.exit(1);
}
console.log(`slop-gate clean (${files.length} files).`);
