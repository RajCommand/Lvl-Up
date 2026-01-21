import React, { useEffect, useMemo, useRef, useState } from "react";

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
  const [showLegend, setShowLegend] = useState(false);
  const swipeStartRef = useRef(null);

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
  const lineColor = isDark ? "#f4f4f5" : "#111827";
  const lineWidth = 3;
  const lineLen = r + 6;

  const leftStrBig = `${leftH}h ${pad2(leftM)}m`;
  const onPointerDown = (e) => {
    if (e.pointerType !== "touch" && e.pointerType !== "mouse") return;
    swipeStartRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    setShowAnalog(dx < 0);
  };
  const onTouchStart = (e) => {
    const t = e.touches[0];
    if (!t) return;
    swipeStartRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    setShowAnalog(dx < 0);
  };

  const Wrapper = Card
    ? Card
    : ({ children, className }) => (
        <div className={cx("rounded-2xl border shadow-sm", border, surface, className)}>{children}</div>
      );

  return (
    <Wrapper className="p-4" border={border} surface={surface}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-extrabold">Daily Time Window</div>
        </div>
        <button
          type="button"
          onClick={() => setShowLegend((v) => !v)}
          className={cx(
            "inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold transition",
            isDark ? "border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900" : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100"
          )}
          aria-label="Day timer info"
        >
          i
        </button>
      </div>

      {showLegend ? (
        <div
          className={cx(
            "mt-3 rounded-xl border px-3 py-2 text-xs",
            isDark ? "border-zinc-800 bg-zinc-950/40 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-700"
          )}
          onClick={() => setShowLegend(false)}
        >
          <div className="font-semibold">How the timer works</div>
          <div className="mt-1">Timer starts at your wake time and ends at bedtime.</div>
          <div className="mt-1">Tasks completed after the timer ends will not be accepted (sleep time).</div>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-4">
        <div
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={() => {
            swipeStartRef.current = null;
          }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
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

              <div className="absolute left-1/2 top-1/2" style={{ width: 0, height: 0, transform: `rotate(${wakeAngle}deg)`, zIndex: 2 }}>
                <div
                  style={{
                    width: lineWidth,
                    height: lineLen,
                    background: lineColor,
                    transform: `translateX(-${lineWidth / 2}px) translateY(-${lineLen}px)`,
                  }}
                />
              </div>
              <div className="absolute left-1/2 top-1/2" style={{ width: 0, height: 0, transform: `rotate(${bedAngle}deg)`, zIndex: 2 }}>
                <div
                  style={{
                    width: lineWidth,
                    height: lineLen,
                    background: lineColor,
                    transform: `translateX(-${lineWidth / 2}px) translateY(-${lineLen}px)`,
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
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setShowAnalog(false)}
            className={cx(
              "h-2.5 w-12 rounded-full transition",
              showAnalog
                ? isDark
                  ? "bg-zinc-800"
                  : "bg-zinc-200"
                : isDark
                ? "bg-zinc-100"
                : "bg-zinc-900"
            )}
            aria-label="Show time left view"
          />
          <button
            type="button"
            onClick={() => setShowAnalog(true)}
            className={cx(
              "h-2.5 w-12 rounded-full transition",
              showAnalog
                ? isDark
                  ? "bg-zinc-100"
                  : "bg-zinc-900"
                : isDark
                ? "bg-zinc-800"
                : "bg-zinc-200"
            )}
            aria-label="Show timer face view"
          />
        </div>
      </div>
    </Wrapper>
  );
}
