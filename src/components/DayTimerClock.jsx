import React, { useEffect, useMemo, useState } from "react";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parseHHMM(str) {
  if (!str || typeof str !== "string") return 0;
  const [hRaw, mRaw] = str.split(":");
  const h = clamp(Number(hRaw || 0), 0, 23);
  const m = clamp(Number(mRaw || 0), 0, 59);
  return h * 60 + m;
}

function fmtMinToHHMM(min) {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${pad2(h)}:${pad2(mm)}`;
}

export function DayTimerClock({ wakeTime, bedTime, isDark, border, surface, textMuted, Card }) {
  const [now, setNow] = useState(() => new Date());
  const [showAnalog, setShowAnalog] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const wakeMin = useMemo(() => parseHHMM(wakeTime), [wakeTime]);
  const bedRaw = useMemo(() => parseHHMM(bedTime), [bedTime]);

  const { bedMin, durationMin } = useMemo(() => {
    const bedAdj = bedRaw <= wakeMin ? bedRaw + 1440 : bedRaw;
    return { bedMin: bedAdj, durationMin: Math.max(1, bedAdj - wakeMin) };
  }, [bedRaw, wakeMin]);

  const nowMin = useMemo(() => {
    const m = now.getHours() * 60 + now.getMinutes();
    return m < wakeMin ? m + 1440 : m;
  }, [now, wakeMin]);

  const progress = useMemo(() => clamp((nowMin - wakeMin) / durationMin, 0, 1), [nowMin, wakeMin, durationMin]);

  const leftMin = useMemo(() => Math.max(0, Math.round(bedMin - nowMin)), [bedMin, nowMin]);
  const leftH = useMemo(() => Math.floor(leftMin / 60), [leftMin]);
  const leftM = useMemo(() => leftMin % 60, [leftMin]);

  const sleepHours = useMemo(() => {
    const wakeNext = wakeMin + 1440;
    const sleepMin = wakeNext - bedMin;
    return sleepMin / 60;
  }, [wakeMin, bedMin]);

  const dayHours = useMemo(() => durationMin / 60, [durationMin]);

  const leftPct = useMemo(() => (durationMin ? clamp(leftMin / durationMin, 0, 1) : 0), [leftMin, durationMin]);

  const timeLeftTextClass = useMemo(() => {
    if (leftPct <= 0.1) return isDark ? "text-red-400" : "text-red-600";
    if (leftPct <= 0.4) return isDark ? "text-amber-400" : "text-amber-600";
    return isDark ? "text-zinc-50" : "text-zinc-900";
  }, [leftPct, isDark]);

  const size = 180;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const intervalLen = (durationMin / 1440) * c;
  const passedLen = intervalLen * progress;

  const wakeAngle = (wakeMin / 1440) * 360;
  const bedAngle = ((bedMin % 1440) / 1440) * 360;

  const ringBase = isDark ? "#27272a" : "#e4e4e7";
  const ringGreen = isDark ? "#10b981" : "#059669";
  const ringRed = isDark ? "#ef4444" : "#dc2626";
  const lineColor = isDark ? "rgba(255,255,255,0.75)" : "rgba(39,39,42,0.75)";

  const leftStrBig = `${leftH}h ${pad2(leftM)}m`;
  const onDoubleClick = () => setShowAnalog((v) => !v);

  const Wrapper = Card
    ? Card
    : ({ children, className }) => (
        <div className={cx("rounded-2xl border shadow-sm", border, surface, className)}>{children}</div>
      );

  return (
    <Wrapper className="p-4" border={border} surface={surface}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-extrabold">Day Timer</div>
          <div className={cx("mt-1 text-xs", textMuted)}>Double-click the left panel to switch views</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div
          onDoubleClick={onDoubleClick}
          className={cx(
            "relative flex items-center justify-center rounded-2xl border p-4",
            border,
            isDark ? "bg-zinc-950/10" : "bg-white",
            "select-none"
          )}
          role="button"
          aria-label="Toggle day timer view"
          title="Double-click to toggle"
        >
          {!showAnalog ? (
            <div className="text-center">
              <div className={cx("text-xs font-semibold", textMuted)}>Time left</div>
              <div className={cx("mt-2 text-4xl font-black tabular-nums", timeLeftTextClass)}>{leftStrBig}</div>
              <div className={cx("mt-2 text-xs", textMuted)}>
                {progress === 0
                  ? "Day hasn't started yet."
                  : progress >= 1
                  ? `Day complete • Sleep time ${fmtMinToHHMM(bedMin)}`
                  : "Keep going."}
              </div>
            </div>
          ) : (
            <div className="relative mx-auto" style={{ width: size, height: size }}>
              <svg width={size} height={size} className="block">
                <g transform={`rotate(${wakeAngle - 90} ${size / 2} ${size / 2})`}>
                  <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ringBase} strokeWidth={stroke} />
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={ringGreen}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={`${intervalLen} ${c - intervalLen}`}
                  />
                  <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={ringRed}
                    strokeWidth={stroke}
                    strokeLinecap="round"
                    strokeDasharray={`${passedLen} ${c - passedLen}`}
                  />
                </g>
              </svg>

              <div className="absolute left-1/2 top-1/2" style={{ width: 0, height: 0, transform: `rotate(${wakeAngle}deg)` }}>
                <div
                  style={{
                    width: 2,
                    height: r + 4,
                    background: lineColor,
                    transform: `translateX(-1px) translateY(-${r + 4}px)`,
                  }}
                />
              </div>
              <div className="absolute left-1/2 top-1/2" style={{ width: 0, height: 0, transform: `rotate(${bedAngle}deg)` }}>
                <div
                  style={{
                    width: 2,
                    height: r + 4,
                    background: lineColor,
                    transform: `translateX(-1px) translateY(-${r + 4}px)`,
                  }}
                />
              </div>

              <div
                className={cx(
                  "absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full",
                  isDark ? "bg-zinc-100" : "bg-zinc-900"
                )}
              />
            </div>
          )}
        </div>

        <div className={cx("rounded-2xl border p-4", border, isDark ? "bg-zinc-950/10" : "bg-white")}>
          <div className="grid grid-cols-2 gap-3">
            <div className={cx("rounded-xl border p-3", border)}>
              <div className={cx("text-[11px] font-semibold", textMuted)}>Wake time</div>
              <div className="mt-1 text-sm font-black tabular-nums">{wakeTime}</div>
            </div>
            <div className={cx("rounded-xl border p-3", border)}>
              <div className={cx("text-[11px] font-semibold", textMuted)}>Bed time</div>
              <div className="mt-1 text-sm font-black tabular-nums">{bedTime}</div>
            </div>
            <div className={cx("rounded-xl border p-3", border)}>
              <div className={cx("text-[11px] font-semibold", textMuted)}>Sleep (goal)</div>
              <div className="mt-1 text-sm font-black tabular-nums">{sleepHours.toFixed(1)} h</div>
            </div>
            <div className={cx("rounded-xl border p-3", border)}>
              <div className={cx("text-[11px] font-semibold", textMuted)}>Daytime</div>
              <div className="mt-1 text-sm font-black tabular-nums">{dayHours.toFixed(1)} h</div>
            </div>
          </div>

          <div className={cx("mt-3 text-xs", textMuted)}>
            Now:{" "}
            <span className={cx("font-semibold tabular-nums", isDark ? "text-zinc-100" : "text-zinc-900")}>
              {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>
      </div>
    </Wrapper>
  );
}
