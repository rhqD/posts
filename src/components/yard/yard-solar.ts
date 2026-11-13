// NOAA / Meeus solar geometry, evaluated at a UTC instant.
// https://gml.noaa.gov/grad/solcalc/calcdetails.html
// Coordinates match the original house preview; no location permission needed.
export const YARD_SITE = Object.freeze({ longitude: 108.09, latitude: 34.18, utcOffset: 8 });
const RAD = Math.PI / 180;
const deg = (radians: number) => radians / RAD;
const mod = (value: number, divisor: number) => (value % divisor + divisor) % divisor;

export function beijingClock(now = new Date()) {
  const shifted = new Date(now.getTime() + YARD_SITE.utcOffset * 3_600_000);
  const dateTime = shifted.toISOString().slice(0, 16);
  return { dateTime, date: dateTime.slice(0, 10), time: dateTime.slice(11), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

export function parseBeijingTime(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+08:00`);
  // Date normalizes invalid days; reject those instead of silently changing them.
  return Number.isFinite(date.getTime()) && beijingClock(date).dateTime === value ? date : null;
}

export function solarPosition(instant: Date) {
  if (!Number.isFinite(instant.getTime())) throw new RangeError('Invalid solar instant');
  const t = (instant.getTime() / 86_400_000 + 2440587.5 - 2451545) / 36525;
  const meanLongitude = mod(280.46646 + t * (36000.76983 + .0003032 * t), 360) * RAD;
  const anomaly = (357.52911 + t * (35999.05029 - .0001537 * t)) * RAD;
  const eccentricity = .016708634 - t * (.000042037 + .0000001267 * t);
  const centre = Math.sin(anomaly) * (1.914602 - t * (.004817 + .000014 * t))
    + Math.sin(2 * anomaly) * (.019993 - .000101 * t) + Math.sin(3 * anomaly) * .000289;
  const omega = (125.04 - 1934.136 * t) * RAD;
  const apparentLongitude = meanLongitude + (centre - .00569 - .00478 * Math.sin(omega)) * RAD;
  const obliquity = (23 + (26 + (21.448 - t * (46.815 + t * (.00059 - .001813 * t))) / 60) / 60
    + .00256 * Math.cos(omega)) * RAD;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude));
  const y = Math.tan(obliquity / 2) ** 2;
  const equationOfTime = 4 * deg(y * Math.sin(2 * meanLongitude) - 2 * eccentricity * Math.sin(anomaly)
    + 4 * eccentricity * y * Math.sin(anomaly) * Math.cos(2 * meanLongitude)
    - .5 * y * y * Math.sin(4 * meanLongitude) - 1.25 * eccentricity ** 2 * Math.sin(2 * anomaly));
  const utcMinutes = instant.getUTCHours() * 60 + instant.getUTCMinutes() + instant.getUTCSeconds() / 60;
  const hourAngle = (mod(utcMinutes + equationOfTime + 4 * YARD_SITE.longitude, 1440) / 4 - 180) * RAD;
  const latitude = YARD_SITE.latitude * RAD;
  const up = Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  const elevation = deg(Math.asin(Math.max(-1, Math.min(1, up))));
  const azimuth = mod(deg(Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude))) + 180, 360);
  const horizontal = Math.cos(elevation * RAD);
  // Scene axes: west +X, north +Z, up +Y (Blender is Z-up).
  const direction: [number, number, number] = [-Math.sin(azimuth * RAD) * horizontal, up, Math.cos(azimuth * RAD) * horizontal];
  return { elevation, azimuth, direction };
}
