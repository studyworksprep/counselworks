import { afterEach, describe, expect, it } from 'vitest';
import { formatCalendarDate, formatDateTime } from '@/lib/utils';

const previousZone=process.env.TZ;
afterEach(()=>{if(previousZone===undefined)delete process.env.TZ;else process.env.TZ=previousZone;});
describe('all-day application deadline display',()=>{
 for(const zone of ['America/New_York','UTC','Pacific/Auckland'])it(`keeps the saved deadline in ${zone}`,()=>{
  process.env.TZ=zone;
  expect(formatCalendarDate('2027-11-01T00:00:00+00:00')).toBe('Nov 1, 2027');
  expect(formatCalendarDate('2027-11-01')).toBe('Nov 1, 2027');
 });
 it('still converts a timed meeting to its local wall-clock',()=>{
  process.env.TZ='America/New_York';
  expect(formatDateTime('2027-11-01T00:00:00Z')).toBe('Oct 31, 2027, 8:00 PM');
 });
});
