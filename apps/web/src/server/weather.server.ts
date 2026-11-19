// Weather on the sites (spec 023): Open-Meteo, free and keyless. Only the site's coordinates leave the
// server; forecasts are cached for an hour per place. A failure simply shows no weather.
export interface DayWeather { date: string; code: number; max: number; rain: number }

const cache = new Map<string, { at: number; days: DayWeather[] }>();
const HOUR = 3_600_000;

export async function forecast(latitude: number, longitude: number): Promise<DayWeather[]> {
  const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < HOUR) return hit.days;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(3)}&longitude=${longitude.toFixed(3)}`
      + '&daily=weathercode,temperature_2m_max,precipitation_probability_max&timezone=auto&forecast_days=3';
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return hit?.days ?? [];
    const body = (await response.json()) as { daily?: { time: string[]; weathercode: number[]; temperature_2m_max: number[]; precipitation_probability_max: (number | null)[] } };
    const daily = body.daily;
    const days = daily ? daily.time.map((date, index) => ({
      date, code: daily.weathercode[index] ?? 0, max: Math.round(daily.temperature_2m_max[index] ?? 0), rain: daily.precipitation_probability_max[index] ?? 0,
    })) : [];
    cache.set(key, { at: Date.now(), days });
    return days;
  } catch {
    return hit?.days ?? [];
  }
}

/** Pouring concrete is advised against above this rain probability. */
export const RAIN_LIMIT = 60;
