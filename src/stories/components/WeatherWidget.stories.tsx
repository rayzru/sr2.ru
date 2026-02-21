"use client";

import { useState } from "react";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import Weather, {
  getTimeOfDay,
  type WeatherCondition,
  type WeatherWidgetProps,
} from "~/components/weather";

// ============================================================================
// Base mock data
// ============================================================================

const sunrise = new Date("2025-07-15T05:18:00+03:00");
const sunset = new Date("2025-07-15T20:52:00+03:00");
const tomorrowSunrise = new Date("2025-07-16T05:19:00+03:00");

const baseArgs: WeatherWidgetProps = {
  current: {
    time: new Date("2025-07-15T14:30:00+03:00"),
    temperature2m: 27.4,
    relativeHumidity2m: 52,
    apparentTemperature: 28.1,
    isDay: 1,
    precipitation: 0,
    rain: 0,
    showers: 0,
    snowfall: 0,
    weatherCode: 0,
    cloudCover: 5,
    pressureMsl: 1013,
    surfacePressure: 1008,
    windSpeed10m: 4.2,
    windDirection10m: 220,
    windGusts10m: 7.1,
    uvIndex: 7,
    visibility: 24000,
  },
  daily: {
    temperatureMax: 29.5,
    temperatureMin: 18.2,
    sunrise,
    sunset,
    tomorrowSunrise,
  },
};

// Per-condition overrides for realistic data
const CONDITION_PRESETS: Record<WeatherCondition, Partial<WeatherWidgetProps["current"]>> = {
  "clear":         { weatherCode: 0, precipitation: 0, snowfall: 0, cloudCover: 5, temperature2m: 27, apparentTemperature: 28, windSpeed10m: 4 },
  "partly-cloudy": { weatherCode: 2, precipitation: 0, snowfall: 0, cloudCover: 40, temperature2m: 24, apparentTemperature: 23, windSpeed10m: 5 },
  "cloudy":        { weatherCode: 3, precipitation: 0, snowfall: 0, cloudCover: 85, temperature2m: 19, apparentTemperature: 18, windSpeed10m: 6 },
  "fog":           { weatherCode: 45, precipitation: 0, snowfall: 0, cloudCover: 100, temperature2m: 10, apparentTemperature: 9, visibility: 200, windSpeed10m: 1 },
  "drizzle":       { weatherCode: 51, precipitation: 0.3, rain: 0.3, snowfall: 0, cloudCover: 80, temperature2m: 15, apparentTemperature: 13, windSpeed10m: 4 },
  "rain":          { weatherCode: 63, precipitation: 2.1, rain: 2.1, snowfall: 0, cloudCover: 95, temperature2m: 14, apparentTemperature: 11, windSpeed10m: 8 },
  "heavy-rain":    { weatherCode: 65, precipitation: 8.5, rain: 8.5, snowfall: 0, cloudCover: 100, temperature2m: 12, apparentTemperature: 9, windSpeed10m: 14 },
  "freezing-rain": { weatherCode: 66, precipitation: 1.5, rain: 1.5, snowfall: 0, cloudCover: 100, temperature2m: -0.5, apparentTemperature: -3, windSpeed10m: 6 },
  "snow":          { weatherCode: 73, precipitation: 0, rain: 0, snowfall: 1.2, cloudCover: 90, temperature2m: -5, apparentTemperature: -8, windSpeed10m: 5 },
  "heavy-snow":    { weatherCode: 75, precipitation: 0, rain: 0, snowfall: 5, cloudCover: 100, temperature2m: -8, apparentTemperature: -14, windSpeed10m: 11 },
  "sleet":         { weatherCode: 85, precipitation: 2, rain: 1, snowfall: 0.8, cloudCover: 100, temperature2m: -1, apparentTemperature: -4, windSpeed10m: 7 },
  "thunderstorm":  { weatherCode: 95, precipitation: 12, rain: 12, snowfall: 0, cloudCover: 100, temperature2m: 18, apparentTemperature: 16, windSpeed10m: 18, windGusts10m: 32 },
};

const ALL_CONDITIONS: WeatherCondition[] = [
  "clear", "partly-cloudy", "cloudy", "fog",
  "drizzle", "rain", "heavy-rain", "freezing-rain",
  "snow", "heavy-snow", "sleet", "thunderstorm",
];

const CONDITION_LABELS: Record<WeatherCondition, string> = {
  "clear":         "☀️ Ясно",
  "partly-cloudy": "⛅ Переменная облачность",
  "cloudy":        "☁️ Пасмурно",
  "fog":           "🌫 Туман",
  "drizzle":       "🌦 Морось",
  "rain":          "🌧 Дождь",
  "heavy-rain":    "⛈ Сильный дождь",
  "freezing-rain": "🌨 Замерзающий дождь",
  "snow":          "❄️ Снег",
  "heavy-snow":    "🌨 Снегопад",
  "sleet":         "🌧❄️ Мокрый снег",
  "thunderstorm":  "⛈ Гроза",
};

// ============================================================================
// Meta
// ============================================================================

const meta: Meta<WeatherWidgetProps> = {
  title: "Components/WeatherWidget",
  component: Weather,
  tags: ["stable"],
  parameters: {
    controls: { disable: true },
    layout: "fullscreen",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// ============================================================================
// Story 1: All States Grid
// ============================================================================

export const AllStates: Story = {
  name: "🗂 Все состояния",
  render: () => (
    <div className="bg-background min-h-screen p-6">
      <h2 className="text-foreground mb-6 text-xl font-semibold">Все состояния виджета погоды</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {(["day", "morning", "evening", "night"] as const).map((tod) =>
          ALL_CONDITIONS.map((condition) => (
            <div key={`${tod}-${condition}`} className="space-y-1.5">
              <p className="text-muted-foreground text-xs font-medium capitalize">
                {CONDITION_LABELS[condition]} · {tod}
              </p>
              <Weather
                {...baseArgs}
                current={{
                  ...baseArgs.current,
                  ...CONDITION_PRESETS[condition],
                }}
                _forceTimeOfDay={tod}
                _forceCondition={condition}
              />
            </div>
          ))
        )}
      </div>
    </div>
  ),
};

// ============================================================================
// Story 2: Playground (interactive form)
// ============================================================================

function PlaygroundStory() {
  const [hour, setHour] = useState(14);
  const [condition, setCondition] = useState<WeatherCondition>("clear");
  const [temperature, setTemperature] = useState(22);
  const [windSpeed, setWindSpeed] = useState(5);
  const [windDir, setWindDir] = useState(220);
  const [humidity, setHumidity] = useState(55);
  const [pressure, setPressure] = useState(1013);
  const [precipitation, setPrecipitation] = useState(0);

  const timeOfDay = getTimeOfDay(hour);

  // Build time: use a fixed date but set the hour
  const currentTime = new Date("2025-07-15T00:00:00+03:00");
  currentTime.setHours(hour, 0, 0, 0);

  const conditionPreset = CONDITION_PRESETS[condition];

  const props: WeatherWidgetProps = {
    current: {
      ...baseArgs.current,
      ...conditionPreset,
      time: currentTime,
      temperature2m: temperature,
      apparentTemperature: temperature - 1.5,
      windSpeed10m: windSpeed,
      windDirection10m: windDir,
      windGusts10m: windSpeed * 1.5,
      relativeHumidity2m: humidity,
      pressureMsl: pressure,
      precipitation: precipitation,
      rain: condition.includes("rain") ? precipitation : 0,
      snowfall: condition.includes("snow") ? precipitation * 0.3 : 0,
    },
    daily: {
      temperatureMax: temperature + 3,
      temperatureMin: temperature - 8,
      sunrise,
      sunset,
      tomorrowSunrise,
    },
    _forceTimeOfDay: timeOfDay,
    _forceCondition: condition,
  };

  const labelClass = "block text-xs font-medium text-foreground/70 mb-1";
  const inputClass = "w-full accent-primary";
  const rowClass = "space-y-1";

  return (
    <div className="bg-background min-h-screen p-6">
      <h2 className="text-foreground mb-6 text-xl font-semibold">Playground — настройка виджета</h2>
      <div className="flex flex-col gap-8 lg:flex-row">

        {/* Widget preview */}
        <div className="w-full max-w-xs shrink-0">
          <Weather {...props} />
          <p className="text-muted-foreground mt-2 text-center text-xs">
            {hour}:00 · {timeOfDay} · {CONDITION_LABELS[condition]}
          </p>
        </div>

        {/* Controls */}
        <div className="flex-1 space-y-6">

          {/* Time slider */}
          <div className={rowClass}>
            <label className={labelClass}>
              Время суток — {String(hour).padStart(2, "0")}:00
              <span className="text-muted-foreground ml-2">({timeOfDay})</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-6 text-xs">🌙</span>
              <input
                type="range"
                min={0}
                max={23}
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
                className={inputClass}
              />
              <span className="text-muted-foreground w-6 text-xs">☀️</span>
            </div>
            <div className="text-muted-foreground mt-1 flex justify-between text-[10px]">
              <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
            </div>
          </div>

          {/* Condition buttons */}
          <div className={rowClass}>
            <label className={labelClass}>Состояние погоды</label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_CONDITIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCondition(c)}
                  className={[
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                    c === condition
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted text-foreground hover:border-primary/50",
                  ].join(" ")}
                >
                  {CONDITION_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          {/* Numeric sliders */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={rowClass}>
              <label className={labelClass}>Температура: {temperature}°C</label>
              <input type="range" min={-30} max={45} value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))} className={inputClass} />
              <div className="text-muted-foreground flex justify-between text-[10px]">
                <span>-30°</span><span>0°</span><span>+45°</span>
              </div>
            </div>

            <div className={rowClass}>
              <label className={labelClass}>Скорость ветра: {windSpeed} м/с</label>
              <input type="range" min={0} max={40} value={windSpeed}
                onChange={(e) => setWindSpeed(Number(e.target.value))} className={inputClass} />
              <div className="text-muted-foreground flex justify-between text-[10px]">
                <span>0</span><span>20</span><span>40 м/с</span>
              </div>
            </div>

            <div className={rowClass}>
              <label className={labelClass}>Направление ветра: {windDir}°</label>
              <input type="range" min={0} max={359} value={windDir}
                onChange={(e) => setWindDir(Number(e.target.value))} className={inputClass} />
              <div className="text-muted-foreground flex justify-between text-[10px]">
                <span>С 0°</span><span>В 90°</span><span>Ю 180°</span><span>З 270°</span>
              </div>
            </div>

            <div className={rowClass}>
              <label className={labelClass}>Влажность: {humidity}%</label>
              <input type="range" min={0} max={100} value={humidity}
                onChange={(e) => setHumidity(Number(e.target.value))} className={inputClass} />
              <div className="text-muted-foreground flex justify-between text-[10px]">
                <span>0%</span><span>50%</span><span>100%</span>
              </div>
            </div>

            <div className={rowClass}>
              <label className={labelClass}>Давление: {pressure} гПа</label>
              <input type="range" min={960} max={1060} value={pressure}
                onChange={(e) => setPressure(Number(e.target.value))} className={inputClass} />
              <div className="text-muted-foreground flex justify-between text-[10px]">
                <span>960</span><span>1013</span><span>1060</span>
              </div>
            </div>

            <div className={rowClass}>
              <label className={labelClass}>Осадки: {precipitation.toFixed(1)} мм</label>
              <input type="range" min={0} max={20} step={0.1} value={precipitation}
                onChange={(e) => setPrecipitation(Number(e.target.value))} className={inputClass} />
              <div className="text-muted-foreground flex justify-between text-[10px]">
                <span>0</span><span>10</span><span>20 мм</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export const Playground: Story = {
  name: "🎛 Playground",
  render: () => <PlaygroundStory />,
};
