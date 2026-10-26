// @vitest-environment node
import { describe, expect, it } from 'vitest';
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
