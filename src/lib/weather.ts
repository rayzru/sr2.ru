import { fetchWeatherApi } from "openmeteo";

const params = {
  latitude: 47.257537,
  longitude: 39.712776,
  current: [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "is_day",
    "precipitation",
    "rain",
    "showers",
    "snowfall",
    "weather_code",
    "cloud_cover",
    "pressure_msl",
    "surface_pressure",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
    "uv_index",
    "visibility",
  ],
  daily: [
    "temperature_2m_max",
    "temperature_2m_min",
    "sunrise",
    "sunset",
  ],
  timezone: "Europe/Moscow",
  forecast_days: 2,
};

const url = "https://api.open-meteo.com/v1/forecast";

export const fetchWeather = async () => {
  // Cache for 15 minutes — Open-Meteo updates ~hourly
  // fetchWeatherApi signature: (url, params, retries?, backoffFactor?, backoffMax?, fetchOptions?)
  const responses = await fetchWeatherApi(url, params, undefined, undefined, undefined, {
    next: { revalidate: 900 },
  } as RequestInit);

  if (responses.length === 0 || !responses[0]) {
    throw new Error("No weather data found");
  }

  const response = responses[0];
  const current = response.current()!;
  const daily = response.daily()!;

  // sunrise/sunset are unix epoch seconds (UTC). valuesInt64(0) = today, valuesInt64(1) = tomorrow.
  const sunriseTs = Number(daily.variables(2)!.valuesInt64(0));
  const sunsetTs  = Number(daily.variables(3)!.valuesInt64(0));
  const tomorrowSunriseTs = Number(daily.variables(2)!.valuesInt64(1));

  return {
    current: {
      // Store as true UTC so comparisons with sunrise/sunset (also UTC) are consistent.
      // Use getUTCHours() in the component, not getHours().
      time: new Date(Number(current.time()) * 1000),
      temperature2m: current.variables(0)!.value(),
      relativeHumidity2m: current.variables(1)!.value(),
      apparentTemperature: current.variables(2)!.value(),
      isDay: current.variables(3)!.value(),
      precipitation: current.variables(4)!.value(),
      rain: current.variables(5)!.value(),
      showers: current.variables(6)!.value(),
      snowfall: current.variables(7)!.value(),
      weatherCode: current.variables(8)!.value(),
      cloudCover: current.variables(9)!.value(),
      pressureMsl: current.variables(10)!.value(),
      surfacePressure: current.variables(11)!.value(),
      windSpeed10m: current.variables(12)!.value(),
      windDirection10m: current.variables(13)!.value(),
      windGusts10m: current.variables(14)!.value(),
      uvIndex: current.variables(15)!.value(),
      visibility: current.variables(16)!.value(),
    },
    daily: {
      temperatureMax: daily.variables(0)!.valuesArray()![0]!,
      temperatureMin: daily.variables(1)!.valuesArray()![0]!,
      sunrise: new Date(sunriseTs * 1000),
      sunset: new Date(sunsetTs * 1000),
      tomorrowSunrise: new Date(tomorrowSunriseTs * 1000),
    },
  };
};

export type WeatherData = Exclude<Awaited<ReturnType<typeof fetchWeather>>, undefined>;
