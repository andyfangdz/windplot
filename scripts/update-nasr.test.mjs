// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { getCurrentSubscriptionDate } from './update-nasr.mjs';

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
  it.each([1, 2, 3])('stops before extraction or generation when download %i fails', (failedDownload) => {
    const root = fs.mkdtempSync(path.join(tmpdir(), 'windplot-nasr-'));
    try {
      fs.mkdirSync(path.join(root, 'scripts'));
      fs.mkdirSync(path.join(root, 'bin'));
      fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
      fs.copyFileSync(fileURLToPath(new URL('./update-nasr.mjs', import.meta.url)), path.join(root, 'scripts', 'update-nasr.mjs'));
      fs.symlinkSync(fileURLToPath(new URL('../node_modules', import.meta.url)), path.join(root, 'node_modules'), 'dir');
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
  console.error('curl: (22) The requested URL returned error: 404');
  process.exit(22);
}
console.log(attempt === 1
  ? '<h2>Current</h2><a href="NASR_Subscription/2026-10-01">Current</a>'
  : '<a href="https://nfdc.faa.gov/webContent/28DaySub/extra/01_Oct_2026_APT_CSV.zip">APT</a>');
`, { mode: 0o755 });

      const log = path.join(root, 'curl-calls.jsonl');
      const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'update-nasr.mjs')], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}`, NASR_TEST_LOG: log, NASR_TEST_FAIL: String(failedDownload) },
        timeout: 10000,
      });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('404');
      expect(result.stdout).not.toContain('Extracting');
      expect(result.stdout).not.toContain('Parsing airport data');
      expect(fs.readdirSync(path.join(root, 'data'))).toEqual([]);
      for (const output of outputs) {
        expect(fs.readFileSync(path.join(root, 'src', 'lib', output), 'utf8')).toBe('existing data');
      }

      const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
      expect(calls).toHaveLength(failedDownload);
      for (const args of calls) {
        expect(args).toEqual(expect.arrayContaining(['--fail', '--show-error', '--location']));
        for (const [option, value] of [['--retry', '3'], ['--connect-timeout', '30'], ['--max-time', '300']]) {
          expect(args[args.indexOf(option) + 1]).toBe(value);
        }
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
