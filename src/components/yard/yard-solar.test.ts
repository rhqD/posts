import test from 'node:test';
import assert from 'node:assert/strict';
import { beijingClock, parseBeijingTime, solarPosition } from './yard-solar.js';

const at = (value: string) => {
  const instant = parseBeijingTime(value);
  assert.ok(instant);
  return solarPosition(instant);
};

test('Beijing date rolls over independently of the browser timezone', () => {
  assert.deepEqual(beijingClock(new Date('2026-11-13T16:05:00Z')), {
    dateTime: '2026-11-14T00:05', date: '2026-11-14', time: '00:05', minutes: 5,
  });
  assert.equal(parseBeijingTime('2026-11-14T00:05')?.toISOString(), '2026-11-13T16:05:00.000Z');
  assert.equal(parseBeijingTime('2026-02-30T12:00'), null);
  assert.equal(parseBeijingTime('2026-11-13T24:00'), null);
  assert.equal(parseBeijingTime(''), null);
});

test('morning light comes from east, afternoon from west, and midnight is below the horizon', () => {
  const morning = at('2026-06-21T08:00'), evening = at('2026-06-21T17:00');
  assert.ok(morning.elevation > 0 && morning.azimuth < 180 && morning.direction[0] < 0);
  assert.ok(evening.elevation > 0 && evening.azimuth > 180 && evening.direction[0] > 0);
  assert.ok(at('2026-06-21T00:00').elevation < 0);
});

test('solar noon includes longitude offset and seasonal declination', () => {
  // At this longitude solar noon is about 12:49 in summer and 12:46 in winter.
  const summer = at('2026-06-21T12:49'), winter = at('2026-12-21T12:46');
  assert.ok(Math.abs(summer.elevation - 79.26) < .3);
  assert.ok(Math.abs(winter.elevation - 32.38) < .3);
  assert.ok(Math.abs(summer.azimuth - 180) < 2);
  assert.ok(Math.abs(winter.azimuth - 180) < 2);
  for (const position of [summer, winter]) assert.ok(Math.abs(Math.hypot(...position.direction) - 1) < 1e-10);
});
