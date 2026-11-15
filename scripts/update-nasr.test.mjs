// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { DOWNLOAD_CURL_OPTIONS, getCurrentSubscriptionDate } from './update-nasr.mjs';

describe('getCurrentSubscriptionDate', () => {
  it('selects Current even when the upcoming Preview is listed first', () => {
    // FAA index layout when the October 25, 2026 scheduled run failed.
    const html = `
      <h2>Preview</h2>
      <ul><li><a href="./../NASR_Subscription/2026-10-29">Upcoming</a></li></ul>
      <h2>Current</h2>
      <ul><li><a href="./../NASR_Subscription/2026-10-01">Current</a></li></ul>
      <h2>Archives</h2>
      <a href="./../NASR_Subscription/2026-09-03">Previous</a>`;

    expect(getCurrentSubscriptionDate(html)).toBe('2026-10-01');
  });

  it('uses the new current date after a cycle rollover', () => {
    expect(getCurrentSubscriptionDate(`
      <h2 class="section"> Current </h2>
      <a href="/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/2026-10-29/">Current</a>
    `)).toBe('2026-10-29');
  });

  it('rejects a page without a Current section instead of using Preview', () => {
    expect(() => getCurrentSubscriptionDate(`
      <h2>Preview</h2><a href="NASR_Subscription/2026-10-29">Upcoming</a>
    `)).toThrow('Could not find current NASR subscription date');
  });

  it('does not fall through an empty Current section into Archives', () => {
    expect(() => getCurrentSubscriptionDate(`
      <h2>Current</h2><p>Unavailable</p>
      <h2>Archives</h2><a href="NASR_Subscription/2026-09-03">Previous</a>
    `)).toThrow('Could not find current NASR subscription date');
  });
});

describe('download failures through the CLI', () => {
  it.each([404, 503].flatMap(status => [1, 2, 3].map(failedDownload => ({ status, failedDownload }))))('preserves existing files when download $failedDownload fails with HTTP $status', ({ status, failedDownload }) => {
    const root = fs.mkdtempSync(path.join(tmpdir(), 'windplot-nasr-'));
    try {
      fs.mkdirSync(path.join(root, 'scripts'));
      fs.mkdirSync(path.join(root, 'bin'));
      fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
      fs.copyFileSync(fileURLToPath(new URL('./update-nasr.mjs', import.meta.url)), path.join(root, 'scripts', 'update-nasr.mjs'));
      fs.symlinkSync(fileURLToPath(new URL('../node_modules', import.meta.url)), path.join(root, 'node_modules'), 'dir');
      fs.mkdirSync(path.join(root, 'data'));
      const cached = ['APT_CSV.zip', 'APT_BASE.csv', 'APT_RWY.csv', 'APT_RWY_END.csv'];
      for (const file of cached) fs.writeFileSync(path.join(root, 'data', file), 'existing cache');
      const outputs = ['airports-data.json', 'spatial-index.bin'];
      for (const output of outputs) {
        fs.writeFileSync(path.join(root, 'src', 'lib', output), 'existing data');
      }

      // Exercise the real CLI in an isolated directory; replace only curl.
      fs.writeFileSync(path.join(root, 'bin', 'curl'), `#!${process.execPath}
const fs = require('node:fs');
const log = process.env.NASR_TEST_LOG;
fs.appendFileSync(log, JSON.stringify(process.argv.slice(2)) + '\\n');
const attempt = fs.readFileSync(log, 'utf8').trim().split('\\n').length;
if (attempt === Number(process.env.NASR_TEST_FAIL)) {
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex !== -1) fs.writeFileSync(process.argv[outputIndex + 1], 'partial ZIP');
  console.error('curl: (22) The requested URL returned error: ' + process.env.NASR_TEST_STATUS);
  process.exit(22);
}
console.log(attempt === 1
  ? '<h2>Current</h2><a href="NASR_Subscription/2026-10-01">Current</a>'
  : '<a href="https://nfdc.faa.gov/webContent/28DaySub/extra/01_Oct_2026_APT_CSV.zip">APT</a>');
`, { mode: 0o755 });

      const log = path.join(root, 'curl-calls.jsonl');
      const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'update-nasr.mjs')], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}`, NASR_TEST_LOG: log, NASR_TEST_FAIL: String(failedDownload), NASR_TEST_STATUS: String(status) },
        timeout: 10000,
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(String(status));
      expect(result.stdout).not.toContain('Extracting');
      expect(result.stdout).not.toContain('Parsing airport data');
      expect(fs.readdirSync(path.join(root, 'data')).sort()).toEqual([...cached].sort());
      for (const file of cached) expect(fs.readFileSync(path.join(root, 'data', file), 'utf8')).toBe('existing cache');
      for (const output of outputs) {
        expect(fs.readFileSync(path.join(root, 'src', 'lib', output), 'utf8')).toBe('existing data');
      }

      const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      expect(calls).toHaveLength(failedDownload);
      for (const args of calls) {
        expect(args).toEqual(expect.arrayContaining(['--fail', '--show-error', '--location']));
        for (const [option, value] of [['--retry', '5'], ['--retry-delay', '60'], ['--retry-max-time', '600'], ['--connect-timeout', '30'], ['--max-time', '300']]) {
          expect(args[args.indexOf(option) + 1]).toBe(value);
        }
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('bounded curl retry behavior', () => {
  it.each([
    { label: 'honors a Retry-After longer than the retry delay, then recovers', statuses: [503, 200], retryAfter: '2', retries: 1, expectedCode: 0 },
    { label: 'fails visibly after transient retries are exhausted', statuses: [503, 503, 503], retries: 2, expectedCode: 22 },
    { label: 'does not retry a permanent HTTP error', statuses: [404], retries: 2, expectedCode: 22 },
  ])('$label', async ({ statuses, retryAfter, retries, expectedCode }) => {
    const requestTimes = [];
    const server = createServer((request, response) => {
      requestTimes.push(performance.now());
      const status = statuses[Math.min(requestTimes.length - 1, statuses.length - 1)];
      response.writeHead(status, retryAfter && status === 503 ? { 'Retry-After': retryAfter } : {});
      response.end(status === 200 ? 'download complete' : 'upstream error');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      // Use the production options with scaled timing for a real local HTTP
      // test. Full minute-scale values are checked by the CLI tests above.
      const result = await new Promise((resolve, reject) => {
        const child = spawn('curl', [
          ...DOWNLOAD_CURL_OPTIONS,
          '--retry', String(retries), '--retry-delay', '1', '--retry-max-time', '5',
          '--connect-timeout', '2', '--max-time', '2', '--noproxy', '*',
          `http://127.0.0.1:${server.address().port}/NASR.zip`,
        ], { timeout: 8000 });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.on('error', reject);
        child.on('close', code => resolve({ code, stdout, stderr }));
      });
      expect(result.code, result.stderr).toBe(expectedCode);
      expect(requestTimes).toHaveLength(statuses.length);
      if (expectedCode === 0) expect(result.stdout).toBe('download complete');
      else expect(result.stderr).toContain(String(statuses[0]));
      if (retryAfter) expect(requestTimes[1] - requestTimes[0]).toBeGreaterThanOrEqual(1800);
      else if (requestTimes.length > 1) {
        for (let i = 1; i < requestTimes.length; i++) expect(requestTimes[i] - requestTimes[i - 1]).toBeGreaterThanOrEqual(800);
      }
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  }, 10000);

  it('sets a hard job timeout and schedules daily recovery at 06:00 UTC', () => {
    const workflow = fs.readFileSync(fileURLToPath(new URL('../.github/workflows/update-nasr.yml', import.meta.url)), 'utf8');
    expect(workflow).toMatch(/^    timeout-minutes: 20$/m);
    expect(workflow).toContain("- cron: '0 6 * * *'");
  });
});
