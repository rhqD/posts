// Solar geometry: NOAA/Meeus equations, evaluated at the requested UTC instant.
// References: https://gml.noaa.gov/grad/solcalc/calcdetails.html
//             https://gml.noaa.gov/grad/solcalc/main.js
// No weather service, geolocation permission, or external runtime request.
export const SITE = Object.freeze({ longitude: 108.09, latitude: 34.18, utcOffset: 8, timeZone: 'Asia/Shanghai' });
const RAD = Math.PI / 180;
const deg = radians => radians / RAD;
const clamp = n => Math.max(-1, Math.min(1, n));
const mod = (n, divisor) => (n % divisor + divisor) % divisor;

function midnight(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError('日期格式应为 YYYY-MM-DD');
  const utc = Date.parse(date + 'T00:00:00Z');
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== date) throw new RangeError('日期无效');
  return utc - SITE.utcOffset * 3600000;
}

function ephemeris(timestamp) {
  const t = (timestamp / 86400000 + 2440587.5 - 2451545) / 36525;
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
  return { declination, equationOfTime };
}

function refraction(elevation) {
  const tangent = Math.tan(elevation * RAD);
  if (elevation > 85) return 0;
  if (elevation > 5) return (58.1 / tangent - .07 / tangent ** 3 + .000086 / tangent ** 5) / 3600;
  if (elevation > -.575) return (1735 + elevation * (-518.2 + elevation * (103.4 + elevation * (-12.79 + .711 * elevation)))) / 3600;
  return -20.774 / tangent / 3600;
}

// hour is a Beijing civil hour on date; 24 is midnight at the next day.
export function solarPosition(date, hour) {
  if (!Number.isFinite(hour) || hour < 0 || hour > 24) throw new RangeError('小时应在 0–24 之间');
  const { declination: d, equationOfTime } = ephemeris(midnight(date) + hour * 3600000);
  const latitude = SITE.latitude * RAD;
  const hourAngle = (mod(hour * 60 + equationOfTime + 4 * SITE.longitude - 60 * SITE.utcOffset, 1440) / 4 - 180) * RAD;
  const up = Math.sin(latitude) * Math.sin(d) + Math.cos(latitude) * Math.cos(d) * Math.cos(hourAngle);
  const geometricElevation = deg(Math.asin(clamp(up)));
  const elevation = geometricElevation + refraction(geometricElevation);
  const azimuth = mod(deg(Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(d) * Math.cos(latitude))) + 180, 360);
  const horizontal = Math.cos(elevation * RAD);
  // Blender: west +X, south +Y, up +Z. Azimuth is clockwise from true north.
  const direction = [-Math.sin(azimuth * RAD) * horizontal, -Math.cos(azimuth * RAD) * horizontal, Math.sin(elevation * RAD)];
  return { azimuth, elevation, geometricElevation, direction, equationOfTime };
}

export function solarDay(date) {
  const base = midnight(date);
  let noon = 12;
  for (let i = 0; i < 4; i++) {
    const { equationOfTime } = ephemeris(base + noon * 3600000);
    noon = (720 - 4 * SITE.longitude - equationOfTime + 60 * SITE.utcOffset) / 60;
  }
  // Standard flat-horizon sunrise/set: centre altitude -0.833 degrees includes
  // approximate refraction and solar-disc radius, not local hills/buildings.
  function crossing(low, high, rising) {
    for (let i = 0; i < 35; i++) {
      const middle = (low + high) / 2;
      const above = solarPosition(date, middle).geometricElevation > -.833;
      if (above === rising) high = middle; else low = middle;
    }
    return (low + high) / 2;
  }
  return { sunrise: crossing(0, noon, true), noon, sunset: crossing(noon, 24, false) };
}

export function beijingDate(now = new Date()) {
  return new Date(now.getTime() + SITE.utcOffset * 3600000).toISOString().slice(0, 10);
}

export function clockTime(hour) {
  const minutes = Math.round(hour * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
