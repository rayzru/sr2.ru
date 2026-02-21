"use client";

import { type WeatherData } from "~/lib/weather";
import { cn } from "~/lib/utils";

// ============================================================================
// WMO weather code helpers
// ============================================================================

export const WMO_LABELS = new Map([
  [0, "Ясно"],
  [1, "Преимущественно ясно"],
  [2, "Переменная облачность"],
  [3, "Пасмурно"],
  [45, "Туман"],
  [48, "Туман с инеем"],
  [51, "Лёгкая морось"],
  [53, "Морось"],
  [55, "Сильная морось"],
  [56, "Морось с замерзанием"],
  [57, "Сильная морось с замерзанием"],
  [61, "Небольшой дождь"],
  [63, "Дождь"],
  [65, "Сильный дождь"],
  [66, "Замерзающий дождь"],
  [67, "Сильный замерзающий дождь"],
  [71, "Небольшой снегопад"],
  [73, "Снегопад"],
  [75, "Сильный снегопад"],
  [77, "Снежная крупа"],
  [80, "Ливень"],
  [81, "Умеренный ливень"],
  [82, "Сильный ливень"],
  [85, "Снежный ливень"],
  [86, "Сильный снежный ливень"],
  [95, "Гроза"],
  [96, "Гроза с градом"],
  [99, "Гроза с сильным градом"],
]);

export type WeatherCondition =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "heavy-rain"
  | "freezing-rain"
  | "snow"
  | "heavy-snow"
  | "sleet"
  | "thunderstorm";

export type TimeOfDay = "night" | "morning" | "day" | "evening";

export function getCondition(wmo: number): WeatherCondition {
  if (wmo === 0 || wmo === 1) return "clear";
  if (wmo === 2) return "partly-cloudy";
  if (wmo === 3) return "cloudy";
  if (wmo === 45 || wmo === 48) return "fog";
  if (wmo >= 51 && wmo <= 57) return "drizzle";
  if (wmo === 61 || wmo === 63) return "rain";
  if (wmo === 65) return "heavy-rain";
  if (wmo === 66 || wmo === 67) return "freezing-rain";
  if (wmo === 71 || wmo === 73) return "snow";
  if (wmo === 75 || wmo === 77) return "heavy-snow";
  if (wmo === 80 || wmo === 81) return "rain";
  if (wmo === 82) return "heavy-rain";
  if (wmo === 85 || wmo === 86) return "sleet";
  if (wmo === 95 || wmo === 96 || wmo === 99) return "thunderstorm";
  return "clear";
}

export function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 9) return "morning";
  if (hour >= 9 && hour < 18) return "day";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  });
}

// ============================================================================
// Sky gradient by time-of-day
// ============================================================================

const SKY_GRADIENTS: Record<TimeOfDay, string> = {
  night: "from-slate-950 via-slate-900 to-indigo-950",
  morning: "from-orange-300 via-rose-200 to-sky-300",
  day: "from-sky-500 via-sky-400 to-blue-300",
  evening: "from-orange-500 via-purple-600 to-indigo-900",
};

const CONDITION_OVERLAY: Record<WeatherCondition, string> = {
  "clear": "",
  "partly-cloudy": "bg-white/5",
  "cloudy": "bg-slate-400/30",
  "fog": "bg-slate-300/50",
  "drizzle": "bg-slate-500/25",
  "rain": "bg-slate-600/40",
  "heavy-rain": "bg-slate-700/55",
  "freezing-rain": "bg-slate-500/40",
  "snow": "bg-slate-100/20",
  "heavy-snow": "bg-white/25",
  "sleet": "bg-slate-400/35",
  "thunderstorm": "bg-slate-900/65",
};

const TEXT_COLOR: Record<TimeOfDay, string> = {
  night: "text-slate-50",
  morning: "text-slate-800",
  day: "text-white",
  evening: "text-white",
};

const SUBTLE_COLOR: Record<TimeOfDay, string> = {
  night: "text-slate-300",
  morning: "text-slate-600",
  day: "text-blue-50",
  evening: "text-orange-100",
};

const DIVIDER: Record<TimeOfDay, string> = {
  night: "bg-white/10",
  morning: "bg-black/10",
  day: "bg-white/20",
  evening: "bg-white/15",
};

// ============================================================================
// Animated particles
// ============================================================================

// Wind physics helpers
// skewX angle from wind direction + speed.
// Max tilt: ±60deg at 30 m/s; direction: east (+sin) tilts right, west tilts left.
// skewX(+N) leans the column to the right — matches rain falling eastward.
function windSkewX(deg: number, speed: number): number {
  const rad = (deg * Math.PI) / 180;
  const eastComponent = Math.sin(rad); // -1=W … +1=E
  const maxTilt = 60;
  const maxSpeed = 30;
  const angle = eastComponent * (Math.min(speed, maxSpeed) / maxSpeed) * maxTilt;
  return Math.round(angle * 10) / 10;
}

function RainDrops({
  count = 20,
  heavy = false,
  windDeg = 180,
  windSpeed = 4,
}: {
  count?: number;
  heavy?: boolean;
  windDeg?: number;
  windSpeed?: number;
}) {
  const trailPx = heavy ? 14 : 9;
  const skew = windSkewX(windDeg, windSpeed);
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ transform: `skewX(${skew}deg)` }}
    >
      {Array.from({ length: count }).map((_, i) => {
        const left = ((i / count) * 100 + (i % 3) * 3).toFixed(1);
        const delay = ((i * 0.07) % 1.5).toFixed(2);
        const dur = (heavy ? 0.55 + (i % 5) * 0.06 : 0.8 + (i % 7) * 0.07).toFixed(2);
        // Each span spans the full height; a short trail moves via background-position
        return (
          <span
            key={i}
            className="absolute top-0 block w-px opacity-60"
            style={{
              left: `${left}%`,
              bottom: 0,
              backgroundImage: `linear-gradient(to bottom, transparent 0%, rgba(180,220,255,0.9) 50%, transparent 100%)`,
              backgroundSize: `1px ${trailPx * 2}px`,
              backgroundRepeat: "no-repeat",
              animationName: "wRainFall",
              animationDuration: `${dur}s`,
              animationDelay: `${delay}s`,
              animationTimingFunction: "linear",
              animationIterationCount: "infinite",
            }}
          />
        );
      })}
    </div>
  );
}

function SnowFlakes({
  count = 18,
  windDeg = 180,
  windSpeed = 4,
}: {
  count?: number;
  windDeg?: number;
  windSpeed?: number;
}) {
  const skew = windSkewX(windDeg, windSpeed) * 0.6; // snow tilts less than rain
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ transform: `skewX(${skew}deg)` }}
    >
      {Array.from({ length: count }).map((_, i) => {
        const left = ((i / count) * 100 + (i % 4) * 2).toFixed(1);
        const delay = ((i * 0.17) % 3.0).toFixed(2);
        const dur = (2.2 + (i % 5) * 0.4).toFixed(2);
        const size = 2 + (i % 3);
        return (
          <span
            key={i}
            className="absolute block rounded-full bg-white opacity-80"
            style={{
              left: `${left}%`,
              top: `-${size}px`,
              width: `${size}px`,
              height: `${size}px`,
              animationName: "wSnowFall",
              animationDuration: `${dur}s`,
              animationDelay: `${delay}s`,
              animationTimingFunction: "linear",
              animationIterationCount: "infinite",
            }}
          />
        );
      })}
    </div>
  );
}

function FogLayer() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="absolute block h-8 w-[200%] rounded-full bg-white/20 blur-xl"
          style={{
            top: `${25 + i * 22}%`,
            animationName: "wFogDrift",
            animationDuration: `${9 + i * 3}s`,
            animationDelay: `${i * 2.5}s`,
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
            animationDirection: "alternate",
          }}
        />
      ))}
    </div>
  );
}

function ThunderFlash() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Primary full-screen flash */}
      <span
        className="absolute inset-0 block"
        style={{
          animationName: "wThunderFlash",
          animationDuration: "6s",
          animationDelay: "1.5s",
          animationTimingFunction: "ease-in-out",
          animationIterationCount: "infinite",
        }}
      />
      {/* Secondary offset flash for double-strike realism */}
      <span
        className="absolute inset-0 block"
        style={{
          animationName: "wThunderFlash2",
          animationDuration: "9s",
          animationDelay: "4s",
          animationTimingFunction: "ease-in-out",
          animationIterationCount: "infinite",
        }}
      />
    </div>
  );
}

function Clouds({
  count = 3,
  opacity = 0.25,
  windSpeed = 4,
}: {
  count?: number;
  opacity?: number;
  windSpeed?: number;
}) {
  // Base 22s at calm (0 m/s), faster with wind; floor at 6s
  const baseDur = Math.max(6, 22 - windSpeed * 0.7);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="absolute block h-32 w-96 rounded-full bg-white blur-3xl"
          style={{
            top: `${12 + i * 18}%`,
            opacity,
            animationName: "wCloudMove",
            animationDuration: `${(baseDur + i * 4).toFixed(1)}s`,
            animationDelay: `${i * -8}s`,
            animationTimingFunction: "linear",
            animationIterationCount: "infinite",
          }}
        />
      ))}
    </div>
  );
}

function SunGlow({ isNight }: { isNight: boolean }) {
  return (
    <div className="pointer-events-none absolute right-5 top-5">
      {/* Soft diffuse glow only — no solid circle */}
      <span
        className={cn(
          "block h-12 w-12 rounded-full blur-2xl",
          isNight ? "bg-slate-300/20" : "bg-yellow-300/50"
        )}
        style={{
          animationName: "wSunPulse",
          animationDuration: "4s",
          animationTimingFunction: "ease-in-out",
          animationIterationCount: "infinite",
        }}
      />
    </div>
  );
}

function WeatherParticles({
  condition,
  timeOfDay,
  windDeg,
  windSpeed,
}: {
  condition: WeatherCondition;
  timeOfDay: TimeOfDay;
  windDeg: number;
  windSpeed: number;
}) {
  const isNight = timeOfDay === "night";
  const w = { windDeg, windSpeed };
  switch (condition) {
    case "clear":
      return <SunGlow isNight={isNight} />;
    case "partly-cloudy":
      return <><SunGlow isNight={isNight} /><Clouds count={2} opacity={0.3} windSpeed={windSpeed} /></>;
    case "cloudy":
      return <Clouds count={4} opacity={0.4} windSpeed={windSpeed} />;
    case "fog":
      return <FogLayer />;
    case "drizzle":
      return <><Clouds count={3} opacity={0.35} windSpeed={windSpeed} /><RainDrops count={14} {...w} /></>;
    case "rain":
      return <><Clouds count={4} opacity={0.5} windSpeed={windSpeed} /><RainDrops count={24} {...w} /></>;
    case "heavy-rain":
      return <><Clouds count={5} opacity={0.6} windSpeed={windSpeed} /><RainDrops count={36} heavy {...w} /></>;
    case "freezing-rain":
      return <><Clouds count={4} opacity={0.5} windSpeed={windSpeed} /><RainDrops count={20} {...w} /></>;
    case "snow":
      return <><Clouds count={3} opacity={0.3} windSpeed={windSpeed} /><SnowFlakes count={16} {...w} /></>;
    case "heavy-snow":
      return <><Clouds count={4} opacity={0.4} windSpeed={windSpeed} /><SnowFlakes count={30} {...w} /></>;
    case "sleet":
      return <><Clouds count={4} opacity={0.45} windSpeed={windSpeed} /><RainDrops count={12} {...w} /><SnowFlakes count={10} {...w} /></>;
    case "thunderstorm":
      return <><Clouds count={5} opacity={0.7} windSpeed={windSpeed} /><RainDrops count={32} heavy {...w} /><ThunderFlash /></>;
    default:
      return null;
  }
}

// ============================================================================
// Wind direction label
// ============================================================================

const WIND_DIR: [number, string][] = [
  [22.5, "С"], [67.5, "СВ"], [112.5, "В"], [157.5, "ЮВ"],
  [202.5, "Ю"], [247.5, "ЮЗ"], [292.5, "З"], [337.5, "СЗ"],
];

function windLabel(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  for (const [t, l] of WIND_DIR) if (d < t) return l;
  return "С";
}

// SVG compass arrow — north=up, rotates by wind direction degrees
function WindArrow({ deg, className }: { deg: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("inline-block shrink-0", className ?? "h-4 w-4")}
      aria-hidden="true"
      style={{ transform: `rotate(${deg}deg)` }}
    >
      {/* Arrow pointing up (north) */}
      <polygon points="8,1 11,13 8,10 5,13" fill="currentColor" opacity="0.9" />
      {/* Tail pointing down */}
      <polygon points="8,15 5,3 8,6 11,3" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

// ============================================================================
// Sunrise / sunset arc
// ============================================================================

/**
 * Flattened parabolic arc from sunrise (left) to sunset (right).
 * A dot travels along the arc proportional to current time between
 * sunrise and sunset. When outside that window the dot sits at start/end.
 * Uses stroke-dasharray/dashoffset so the solid portion always traces the
 * exact same path as the dashed track — no bezier subdivision needed.
 */

// Approximate quadratic bezier arc length by sampling N segments
function bzArcLength(
  x0: number, y0: number,
  cx: number, cy: number,
  x1: number, y1: number,
  segments = 60,
): number {
  let len = 0;
  let px = x0, py = y0;
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const nx = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
    const ny = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
    len += Math.hypot(nx - px, ny - py);
    px = nx; py = ny;
  }
  return len;
}

// Point on quadratic bezier at parameter t
function bzPoint(
  t: number,
  x0: number, y0: number,
  cx: number, cy: number,
  x1: number, y1: number,
) {
  const mt = 1 - t;
  return {
    x: mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
    y: mt * mt * y0 + 2 * mt * t * cy + t * t * y1,
  };
}

function SunArc({
  sunrise,
  sunset,
  now,
  subtleColor,
  textColor,
}: {
  sunrise: Date;
  sunset: Date;
  now: Date;
  subtleColor: string;
  textColor: string;
}) {
  const W = 220;
  const pad = 10;

  // Arc: endpoints sit at y=32 (bottom), control point at y=6 (peak).
  // Arc peak (midpoint of quadratic) ≈ y=(32+32+6)/4 = 17.5 → fits viewBox 0..36
  const y0 = 32, x0 = pad;
  const cx = W / 2, cy = 6;    // control point — flattened hill
  const x1 = W - pad, y1 = 32;

  // viewBox: top=0 (2px above peak for dot glow), height=36 (bottom+4px margin)
  const VH = 36;

  const pathD = `M${x0},${y0} Q${cx},${cy} ${x1},${y1}`;
  const totalLen = bzArcLength(x0, y0, cx, cy, x1, y1);

  const nowMs  = now.getTime();
  const riseMs = sunrise.getTime();
  const setMs  = sunset.getTime();

  // t in [0,1]: before sunrise → 0, after sunset → 1, during day → proportional
  const t = nowMs <= riseMs ? 0
    : nowMs >= setMs  ? 1
    : (nowMs - riseMs) / (setMs - riseMs);

  const elapsedLen = t * totalLen;
  const dot = bzPoint(t, x0, y0, cx, cy, x1, y1);
  const isDaytime = nowMs > riseMs && nowMs < setMs;

  // Day duration in hours
  const dayHours = (setMs - riseMs) / 3_600_000;
  const dayLabel = `${Math.floor(dayHours)}ч ${Math.round((dayHours % 1) * 60)}м`;

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg
        viewBox={`0 0 ${W} ${VH}`}
        className="w-full overflow-visible"
        style={{ maxHeight: VH }}
        aria-hidden="true"
      >
        {/* Full dashed track — sits behind everything */}
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeDasharray="3 5"
          className={subtleColor}
          opacity="0.35"
        />
        {/* Solid elapsed portion — exact same path, masked via dashoffset */}
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          /* draw only [0 … elapsedLen], hide the rest */
          strokeDasharray={`${elapsedLen.toFixed(1)} ${(totalLen + 10).toFixed(1)}`}
          strokeDashoffset="0"
          className={textColor}
          opacity="0.75"
        />
        {/* Sun dot — glow + core */}
        <circle cx={dot.x} cy={dot.y} r="7" fill="currentColor" className={textColor} opacity={isDaytime ? 0.15 : 0} />
        <circle cx={dot.x} cy={dot.y} r="4.5" fill="currentColor" className={isDaytime ? textColor : subtleColor} opacity={isDaytime ? 0.95 : 0.4} />
        {/* Endpoint dots */}
        <circle cx={x0} cy={y0} r="2" fill="currentColor" className={subtleColor} opacity="0.5" />
        <circle cx={x1} cy={y1} r="2" fill="currentColor" className={subtleColor} opacity="0.5" />
      </svg>

      {/* Time labels row */}
      <div className={cn("flex w-full items-center justify-between text-[10px] tabular-nums", subtleColor)}>
        <span className="flex items-center gap-0.5">
          <i className="wi wi-sunrise text-[11px] leading-none" aria-hidden="true" />
          {formatTime(sunrise)}
        </span>
        <span className="opacity-70">{dayLabel}</span>
        <span className="flex items-center gap-0.5">
          {formatTime(sunset)}
          <i className="wi wi-sunset text-[11px] leading-none" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Condition → wi-* icon class (day / night variants)
// ============================================================================

const CONDITION_ICON: Record<WeatherCondition, { day: string; night: string }> = {
  "clear":         { day: "wi-day-sunny",           night: "wi-night-clear" },
  "partly-cloudy": { day: "wi-day-cloudy",           night: "wi-night-alt-cloudy" },
  "cloudy":        { day: "wi-cloudy",               night: "wi-cloudy" },
  "fog":           { day: "wi-day-fog",              night: "wi-night-fog" },
  "drizzle":       { day: "wi-day-sprinkle",         night: "wi-night-alt-sprinkle" },
  "rain":          { day: "wi-day-rain",             night: "wi-night-alt-rain" },
  "heavy-rain":    { day: "wi-day-rain-wind",        night: "wi-night-alt-rain-wind" },
  "freezing-rain": { day: "wi-day-sleet-storm",      night: "wi-night-alt-sleet-storm" },
  "snow":          { day: "wi-day-snow",             night: "wi-night-alt-snow" },
  "heavy-snow":    { day: "wi-day-snow-wind",        night: "wi-night-alt-snow-wind" },
  "sleet":         { day: "wi-day-rain-mix",         night: "wi-night-alt-rain-mix" },
  "thunderstorm":  { day: "wi-day-thunderstorm",     night: "wi-night-alt-thunderstorm" },
};


// ============================================================================
// Global keyframes injected once
// ============================================================================

const KEYFRAMES = `
@keyframes wRainFall {
  0%   { background-position: center -20px; }
  100% { background-position: center calc(100% + 20px); }
}
@keyframes wSnowFall {
  0%   { transform: translateY(0px); opacity: 0; }
  10%  { opacity: 0.9; }
  90%  { opacity: 0.6; }
  100% { transform: translateY(110vh); opacity: 0; }
}
@keyframes wFogDrift {
  0% { transform: translateX(-8%); opacity: 0.25; }
  100% { transform: translateX(0%); opacity: 0.55; }
}
@keyframes wThunderFlash {
  0%, 85%, 88.5%, 92%, 100% { background-color: transparent; }
  86%, 87.5% { background-color: rgba(220,235,255,0.22); }
  89.5%, 91%  { background-color: rgba(220,235,255,0.14); }
}
@keyframes wThunderFlash2 {
  0%, 80%, 83.5%, 87%, 100% { background-color: transparent; }
  81%,  82.5% { background-color: rgba(220,235,255,0.28); }
  84.5%, 86%  { background-color: rgba(220,235,255,0.10); }
}
@keyframes wCloudMove {
  0% { left: -420px; }
  100% { left: 100%; }
}
@keyframes wSunPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.12); opacity: 0.75; }
}
`;

// ============================================================================
// Main component
// ============================================================================

export interface WeatherWidgetProps extends WeatherData {
  _forceTimeOfDay?: TimeOfDay;
  _forceCondition?: WeatherCondition;
}

export default function Weather(props: WeatherWidgetProps) {
  const { current, daily } = props;
  const condition = props._forceCondition ?? getCondition(current.weatherCode);
  // current.time is a true UTC Date. Convert to Moscow hour for time-of-day logic.
  // formatTime uses toLocaleTimeString with timeZone:"Europe/Moscow" for display.
  const moscowHour = new Date(
    current.time.toLocaleString("en-US", { timeZone: "Europe/Moscow" })
  ).getHours();
  const timeOfDay = props._forceTimeOfDay ?? getTimeOfDay(moscowHour);
  const isNight = timeOfDay === "night";

  const label = WMO_LABELS.get(current.weatherCode) ?? "Неизвестно";
  const textColor = TEXT_COLOR[timeOfDay];
  const subtleColor = SUBTLE_COLOR[timeOfDay];
  const divider = DIVIDER[timeOfDay];

  const hasPrecip = current.precipitation > 0.05;

  const conditionIconClass = isNight
    ? CONDITION_ICON[condition].night
    : CONDITION_ICON[condition].day;

  const wiIconClass = `wi text-3xl drop-shadow-sm select-none ${conditionIconClass}`;
  const wiStatClass = `wi text-base leading-none`;

  return (
    <>
      <style precedence="default">{KEYFRAMES}</style>
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl bg-gradient-to-br",
          SKY_GRADIENTS[timeOfDay]
        )}
      >
        {/* Condition overlay */}
        {CONDITION_OVERLAY[condition] && (
          <div className={cn("absolute inset-0 transition-opacity duration-1000", CONDITION_OVERLAY[condition])} />
        )}

        {/* Animated particles */}
        <WeatherParticles
          condition={condition}
          timeOfDay={timeOfDay}
          windDeg={current.windDirection10m}
          windSpeed={current.windSpeed10m}
        />

        {/* Content */}
        <div className={cn("relative z-10 p-4", textColor)}>
          {/* Big temp row */}
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-end gap-0.5 leading-none">
                <span className="text-5xl font-bold tabular-nums tracking-tight drop-shadow-sm">
                  {Math.round(current.temperature2m)}°
                </span>
                <span className={cn("mb-1 text-sm font-light", subtleColor)}>C</span>
              </div>
              <p className="mt-1 text-sm font-semibold drop-shadow-sm">{label}</p>
              <p className={cn("text-xs", subtleColor)}>
                Ощущ. {Math.round(current.apparentTemperature)}° &nbsp;·&nbsp;
                {Math.round(daily.temperatureMin)}°&thinsp;/&thinsp;{Math.round(daily.temperatureMax)}°
              </p>
            </div>
            {/* Condition icon */}
            <i className={wiIconClass} aria-hidden="true" />
          </div>

          {/* Divider */}
          <div className={cn("mb-3 h-px", divider)} />

          {/* Stats 2×2 */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            {/* Wind */}
            <div className={cn("flex items-center gap-1.5", subtleColor)}>
              <WindArrow deg={current.windDirection10m} />
              <span>{windLabel(current.windDirection10m)} {Math.round(current.windSpeed10m)} м/с</span>
            </div>
            {/* Humidity */}
            <div className={cn("flex items-center gap-1.5", subtleColor)}>
              <i className={cn(wiStatClass, "wi-sprinkle")} aria-hidden="true" />
              <span>{Math.round(current.relativeHumidity2m)}%</span>
            </div>
            {/* Pressure */}
            <div className={cn("flex items-center gap-1.5", subtleColor)}>
              <i className={cn(wiStatClass, "wi-thermometer")} aria-hidden="true" />
              <span>{Math.round(current.pressureMsl)} гПа</span>
            </div>
            {/* Precipitation or UV */}
            {hasPrecip ? (
              <div className={cn("flex items-center gap-1.5", subtleColor)}>
                <i className={cn(wiStatClass, "wi-umbrella")} aria-hidden="true" />
                <span>{current.precipitation.toFixed(1)} мм</span>
              </div>
            ) : (
              <div className={cn("flex items-center gap-1.5", subtleColor)}>
                <i className={cn(wiStatClass, "wi-hot")} aria-hidden="true" />
                <span>UV {Math.round(current.uvIndex)}</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className={cn("my-3 h-px", divider)} />

          {/* Sunrise/sunset arc */}
          <SunArc
            sunrise={daily.sunrise}
            sunset={daily.sunset}
            now={current.time}
            subtleColor={subtleColor}
            textColor={textColor}
          />
        </div>
      </div>
    </>
  );
}
