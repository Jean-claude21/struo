import { describe, expect, it } from 'vitest';
import { reportPeriods } from './jobs.server.ts';

describe('the periodic reports (spec 039)', () => {
  it('sends the past week on Mondays and the past month on the 1st', () => {
    expect(reportPeriods(new Date('2026-11-16T08:00:00Z'))).toEqual([{ kind: 'weekly', key: 'week:2026-11-09', from: '2026-11-09', to: '2026-11-15' }]);
    expect(reportPeriods(new Date('2026-12-01T08:00:00Z'))).toEqual([{ kind: 'monthly', key: 'month:2026-11', from: '2026-11-01', to: '2026-11-30' }]);
    expect(reportPeriods(new Date('2026-06-01T08:00:00Z')).map((period) => period.kind)).toEqual(['weekly', 'monthly']);
    expect(reportPeriods(new Date('2026-11-19T08:00:00Z'))).toEqual([]);
  });
});
