import React, { useEffect, useMemo, useState } from "react";
import { DayTimerClock } from "./components/DayTimerClock";

/**
 * Level Up: Quest Board — Solo Leveling–inspired MVP (single-file)
 * - Offline-first (LocalStorage)
 * - Tabs: Today / Calendar / Quests / Stats / Settings
 * - Calendar days are clickable and open a modal (popup)
 * - FIX: input focus glitch (components that render inputs are top-level, not redefined per keystroke)
 */

// -----------------------------
// Storage
// -----------------------------
const STORAGE_KEY = "solo_leveling_checklist_v1";

// -----------------------------
// Helpers
// -----------------------------
function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function fmtDateKey(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun
  const diff = (day + 6) % 7; // Monday-start
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function levelFromXP(totalXP) {
  let level = 1;
  let xp = totalXP;
  let req = 100;
  while (xp >= req) {
    xp -= req;
    level += 1;
    req = 100 + 25 * (level - 1);
  }
  return { level, xpIntoLevel: xp, nextReq: req };
}

function today() {
  return new Date();
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function monthMatrix(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const firstDay = (first.getDay() + 6) % 7; // Monday=0

  const weeks = [];
  let dayCounter = 1 - firstDay;
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(year, monthIndex, dayCounter);
      const inMonth = d.getMonth() === monthIndex;
      week.push({ date: d, inMonth });
      dayCounter++;
    }
    weeks.push(week);
  }
  return weeks;
}

// -----------------------------
// Default quests + scaling rules
// -----------------------------
const DEFAULT_QUESTS = [
  {
    id: "q_pushups",
    name: "Push-ups",
    kind: "reps",
    baseTarget: 10,
    scaleEveryLevels: 3,
    scaleAmount: 2,
    baseXP: 30,
    tier: "Main",
  },
  {
    id: "q_situps",
    name: "Sit-ups",
    kind: "reps",
    baseTarget: 10,
    scaleEveryLevels: 3,
    scaleAmount: 2,
    baseXP: 30,
    tier: "Main",
  },
  {
    id: "q_pullups",
    name: "Pull-ups",
    kind: "reps",
    baseTarget: 5,
    scaleEveryLevels: 4,
    scaleAmount: 1,
    baseXP: 45,
    tier: "Main",
  },
  {
    id: "q_run",
    name: "Run",
    kind: "distance",
    baseTarget: 1.0,
    scaleEveryLevels: 2,
    scaleAmount: 0.1,
    baseXP: 60,
    tier: "Main",
  },
];

const DEFAULT_SETTINGS = {
  theme: "dark", // dark | light
  hardcore: false,
  penaltyMode: "xp_debt", // xp_debt | cooldown
  streakBonusPctPerDay: 1,
  maxStreakBonusPct: 20,
  weeklyBossEnabled: true,
  wakeTime: "07:00",
  bedTime: "23:00",
};

function targetForLevel(q, level) {
  const bumps = Math.floor((level - 1) / q.scaleEveryLevels);
  const raw = q.baseTarget + bumps * q.scaleAmount;
  if (q.kind === "distance") return Math.max(0.5, Math.round(raw * 10) / 10);
  return Math.max(1, Math.round(raw));
}

function xpForQuest(q, opts) {
  const { level, streakDays, settings, isBoss, modifiers = [] } = opts;

  const tierMult = q.tier === "Main" ? 1.0 : 0.75;
  const levelMult = 1 + Math.min(0.6, (level - 1) * 0.02);

  const streakBonus = clamp(streakDays * settings.streakBonusPctPerDay, 0, settings.maxStreakBonusPct);
  const streakMult = 1 + streakBonus / 100;

  const modBonus = clamp(modifiers.length * 10, 0, 40);
  const modMult = 1 + modBonus / 100;

  const bossMult = isBoss ? 1.8 : 1.0;

  return Math.round(q.baseXP * tierMult * levelMult * streakMult * modMult * bossMult);
}

function rankFromLevel(level) {
  if (level >= 40) return "S";
  if (level >= 30) return "A";
  if (level >= 22) return "B";
  if (level >= 15) return "C";
  if (level >= 8) return "D";
  return "E";
}

// -----------------------------
// UI building blocks (TOP-LEVEL)
// -----------------------------
function Card({ children, className = "", border, surface }) {
  return <div className={cx("rounded-2xl border shadow-sm", border, surface, className)}>{children}</div>;
}

function Button({ children, onClick, variant = "default", className = "", disabled = false, type = "button", isDark }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed";

  const styles =
    variant === "ghost"
      ? cx("bg-transparent", isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100")
      : variant === "danger"
      ? "bg-red-600 text-white hover:bg-red-700"
      : variant === "outline"
      ? cx(
          "border",
          isDark
            ? "border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-100"
            : "border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-900"
        )
      : cx(isDark ? "bg-zinc-100 text-zinc-900 hover:bg-white" : "bg-zinc-900 text-white hover:bg-zinc-800");

  return (
    <button type={type} disabled={disabled} onClick={onClick} className={cx(base, styles, className)}>
      {children}
    </button>
  );
}

function Pill({ children, tone = "neutral", isDark }) {
  const cls =
    tone === "good"
      ? isDark
        ? "bg-emerald-900/40 text-emerald-200"
        : "bg-emerald-100 text-emerald-800"
      : tone === "warn"
      ? isDark
        ? "bg-amber-900/40 text-amber-200"
        : "bg-amber-100 text-amber-800"
      : tone === "bad"
      ? isDark
        ? "bg-red-900/40 text-red-200"
        : "bg-red-100 text-red-800"
      : isDark
      ? "bg-zinc-800 text-zinc-200"
      : "bg-zinc-100 text-zinc-700";

  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", cls)}>{children}</span>;
}

function ProgressBar({ value, max, isDark }) {
  const pct = max ? clamp((value / max) * 100, 0, 100) : 0;
  return (
    <div className={cx("h-2 w-full overflow-hidden rounded-full", isDark ? "bg-zinc-800" : "bg-zinc-200")}>
      <div className={cx("h-full", isDark ? "bg-zinc-100" : "bg-zinc-900")} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Modal({ open, title, onClose, children, isDark, border, surface, textMuted }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" onMouseDown={() => onClose?.()} role="presentation">
      <div className={cx("absolute inset-0", isDark ? "bg-black/60" : "bg-black/40")} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => e.stopPropagation()}
          className={cx("w-full max-w-lg rounded-2xl border shadow-xl", border, surface)}
        >
          <div className={cx("flex items-center justify-between gap-3 border-b p-4", border)}>
            <div className="min-w-0">
              <div className="truncate text-sm font-extrabold">{title}</div>
              <div className={cx("mt-0.5 text-xs", textMuted)}>Click outside or press Esc to close</div>
            </div>
            <Button variant="outline" onClick={onClose} isDark={isDark}>
              Close
            </Button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------
// Input-containing components (TOP-LEVEL)
// -----------------------------
function DayInspector({ state, selectedDay, setState, isDark, border, surface, textMuted }) {
  const entry = state.days[selectedDay] || { completed: {}, earnedXP: 0, xpDebt: 0, note: "" };
  const completedCount = state.quests.filter((q) => entry.completed?.[q.id]?.done).length;
  const total = state.quests.length;

  return (
    <Card className="p-4" border={border} surface={surface}>
      <div className="text-sm font-extrabold">Day Details</div>
      <div className={cx("mt-2 text-xs", textMuted)}>{selectedDay}</div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className={cx("rounded-xl border p-3", border)}>
          <div className={cx("text-xs", textMuted)}>XP</div>
          <div className="mt-1 text-lg font-black">{entry.earnedXP || 0}</div>
        </div>
        <div className={cx("rounded-xl border p-3", border)}>
          <div className={cx("text-xs", textMuted)}>Completed</div>
          <div className="mt-1 text-lg font-black">
            {completedCount}/{total}
          </div>
        </div>
      </div>

      {entry.xpDebt > 0 ? (
        <div
          className={cx(
            "mt-3 rounded-xl border p-3 text-xs",
            isDark ? "border-amber-900/40 bg-amber-900/20 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-900"
          )}
        >
          Debt: <span className="font-bold">{entry.xpDebt}</span> XP
        </div>
      ) : null}

      <div className="mt-4">
        <div className={cx("text-xs font-semibold", textMuted)}>Notes</div>
        <textarea
          value={entry.note || ""}
          onChange={(e) => {
            const val = e.target.value;
            setState((prev) => ({
              ...prev,
              days: {
                ...prev.days,
                [selectedDay]: { ...(prev.days[selectedDay] || entry), note: val },
              },
            }));
          }}
          placeholder="How did it go? (sleep, mood, pain, etc.)"
          className={cx(
            "mt-2 w-full resize-none rounded-xl border p-2 text-sm outline-none focus:ring-2",
            isDark ? "border-zinc-800 bg-zinc-950/10 focus:ring-zinc-100" : "border-zinc-200 bg-white focus:ring-zinc-900"
          )}
          rows={5}
        />
      </div>
    </Card>
  );
}

function DayModalContent({ dayKey, state, setState, isDark, border, textMuted }) {
  const entry = state.days[dayKey] || { completed: {}, earnedXP: 0, xpDebt: 0, note: "" };
  const completed = state.quests.filter((q) => !!entry.completed?.[q.id]?.done);
  const missed = entry.note === "(missed)";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className={cx("rounded-xl border p-3", border)}>
          <div className={cx("text-xs", textMuted)}>XP gained</div>
          <div className="mt-1 text-lg font-black">{entry.earnedXP || 0}</div>
        </div>
        <div className={cx("rounded-xl border p-3", border)}>
          <div className={cx("text-xs", textMuted)}>Quests completed</div>
          <div className="mt-1 text-lg font-black">
            {completed.length}/{state.quests.length}
          </div>
        </div>
      </div>

      {missed ? (
        <div className={cx("rounded-xl border p-3 text-sm", isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white")}>
          <div className="font-extrabold">Missed day</div>
          <div className={cx("mt-1 text-xs", textMuted)}>No recorded activity.</div>
        </div>
      ) : null}

      {entry.xpDebt > 0 ? (
        <div
          className={cx(
            "rounded-xl border p-3 text-sm",
            isDark ? "border-amber-900/40 bg-amber-900/20 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-900"
          )}
        >
          <div className="font-extrabold">XP Debt</div>
          <div className="mt-1 text-xs">
            <span className="font-bold">{entry.xpDebt}</span> XP must be repaid before XP counts toward leveling.
          </div>
        </div>
      ) : null}

      <div>
        <div className="flex items-center justify-between">
          <div className="text-sm font-extrabold">Achievements</div>
          <Pill tone={completed.length ? "good" : "neutral"} isDark={isDark}>
            {completed.length ? "Active" : "No clears"}
          </Pill>
        </div>
        <div className="mt-2 space-y-2">
          {completed.length ? (
            completed.map((q) => (
              <div key={q.id} className={cx("rounded-xl border p-3", border)}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold">{q.name}</div>
                  <Pill tone="good" isDark={isDark}>
                    Complete
                  </Pill>
                </div>
              </div>
            ))
          ) : (
            <div className={cx("rounded-xl border p-3 text-sm", border)}>
              <div className={cx("text-xs", textMuted)}>No completed quests recorded for this day.</div>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className={cx("text-xs font-semibold", textMuted)}>Notes</div>
        <textarea
          value={entry.note || ""}
          onChange={(e) => {
            const val = e.target.value;
            setState((prev) => ({
              ...prev,
              days: {
                ...prev.days,
                [dayKey]: { ...(prev.days[dayKey] || entry), note: val },
              },
            }));
          }}
          placeholder="What happened this day?"
          className={cx(
            "mt-2 w-full resize-none rounded-xl border p-2 text-sm outline-none focus:ring-2",
            isDark ? "border-zinc-800 bg-zinc-950/10 focus:ring-zinc-100" : "border-zinc-200 bg-white focus:ring-zinc-900"
          )}
          rows={4}
        />
      </div>
    </div>
  );
}

function Shell({ children, page }) {
  return (
    <div className={cx("min-h-screen", page)}>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}

function Tabs({ tab, setTab, isDark }) {
  const items = [
    { id: "today", label: "Today" },
    { id: "calendar", label: "Calendar" },
    { id: "quests", label: "Quests" },
    { id: "stats", label: "Stats" },
    { id: "settings", label: "Settings" },
  ];

  const tabBase = "rounded-xl px-3 py-2 text-sm font-semibold transition border";

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const active = tab === it.id;
        const cls = isDark
          ? active
            ? "bg-zinc-200 text-zinc-900 border-zinc-200"
            : "bg-zinc-800 text-zinc-100 border-zinc-700 hover:bg-zinc-700"
          : active
          ? "bg-zinc-900 text-white border-zinc-900"
          : "bg-white text-zinc-900 border-zinc-200 hover:bg-zinc-50";

        return (
          <button key={it.id} className={cx(tabBase, cls)} onClick={() => setTab(it.id)}>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function Header({
  tab,
  rank,
  isDark,
  textMuted,
  textSoft,
  level,
  streakDays,
  isCooldownActive,
  toggleTheme,
  setTab,
  resetAll,
  xpIntoLevel,
  nextReq,
  border,
  surface,
}) {
  return (
    <div className="mb-6 flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight">Level Up: Quest Board</h1>
            <Pill tone={rank === "S" || rank === "A" ? "good" : rank === "E" ? "warn" : "neutral"} isDark={isDark}>
              Rank {rank}
            </Pill>
          </div>
          <div className={cx("mt-1 text-sm", textMuted)}>
            Level <span className={cx("font-semibold", textSoft)}>{level}</span> • Streak{" "}
            <span className={cx("font-semibold", textSoft)}>{streakDays}</span> day{streakDays === 1 ? "" : "s"}
            {isCooldownActive ? <span className="ml-2 text-amber-500">• Cooldown active (bonus XP disabled)</span> : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={toggleTheme} isDark={isDark}>
            {isDark ? "Light Mode" : "Dark Mode"}
          </Button>
          <Button variant="outline" onClick={() => setTab("today")} isDark={isDark}>
            Go to Today
          </Button>
        </div>
      </div>

      <Card className="p-4" border={border} surface={surface}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className={cx("text-sm font-semibold", textSoft)}>XP Progress</div>
            <div className={cx("mt-1 text-sm", textMuted)}>
              {xpIntoLevel} / {nextReq} XP to next level
            </div>
          </div>
          <div className="w-full sm:w-1/2">
            <ProgressBar value={xpIntoLevel} max={nextReq} isDark={isDark} />
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <Tabs tab={tab} setTab={setTab} isDark={isDark} />
        <div className="hidden sm:block">
          <Button variant="danger" onClick={resetAll} isDark={isDark}>
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}

function TodayPanel({
  state,
  todays,
  level,
  streakDays,
  isCooldownActive,
  settings,
  stats,
  boss,
  bossDone,
  toggleQuestDone,
  toggleBossDone,
  setHardcore,
  setPenaltyMode,
  resetAll,
  isDark,
  border,
  surface,
  textMuted,
  textSoft,
}) {
  const doneCount = state.quests.filter((q) => !!todays.completed?.[q.id]?.done).length;
  const total = state.quests.length;
  const percent = total ? Math.round((doneCount / total) * 100) : 0;

  const debt = todays.xpDebt || 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <DayTimerClock
          wakeTime={settings.wakeTime}
          bedTime={settings.bedTime}
          isDark={isDark}
          border={border}
          surface={surface}
          textMuted={textMuted}
          Card={Card}
        />

        <Card className="p-4" border={border} surface={surface}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-extrabold">Today’s Quests</div>
              <div className={cx("mt-1 text-sm", textMuted)}>
                {fmtDateKey(today())} • {doneCount}/{total} completed • {todays.earnedXP || 0} XP gained today
              </div>
            </div>
            <Pill tone={percent >= 80 ? "good" : percent >= 40 ? "warn" : "bad"} isDark={isDark}>
              {percent}%
            </Pill>
          </div>

          {debt > 0 ? (
            <div
              className={cx(
                "mt-3 rounded-xl border p-3 text-sm",
                isDark ? "border-amber-900/40 bg-amber-900/20 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-900"
              )}
            >
              <div className="font-semibold">XP Debt:</div>
              <div>{debt} XP must be repaid before XP counts toward leveling up.</div>
            </div>
          ) : null}

          <div className="mt-4 space-y-2">
            {state.quests.map((q) => {
              const done = !!todays.completed?.[q.id]?.done;
              const target = targetForLevel(q, level);
              const effStreak = isCooldownActive ? 0 : streakDays;
              const xp = xpForQuest(q, { level, streakDays: effStreak, settings, isBoss: false, modifiers: [] });

              const cardCls = done
                ? isDark
                  ? "border-emerald-900/40 bg-emerald-900/20"
                  : "border-emerald-200 bg-emerald-50"
                : isDark
                ? "border-zinc-800 bg-zinc-950/10"
                : "border-zinc-200 bg-white";

              return (
                <button
                  key={q.id}
                  onClick={() => toggleQuestDone(q.id)}
                  className={cx("w-full rounded-2xl border p-3 text-left transition hover:shadow-sm active:scale-[0.998]", cardCls)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={cx("h-3 w-3 rounded-full", done ? "bg-emerald-500" : isDark ? "bg-zinc-700" : "bg-zinc-300")} />
                        <div className="truncate text-sm font-extrabold">{q.name}</div>
                        <Pill isDark={isDark}>{q.tier}</Pill>
                      </div>
                      <div className={cx("mt-1 text-xs", textMuted)}>
                        Target:{" "}
                        <span className={cx("font-semibold", textSoft)}>
                          {target}
                          {q.kind === "distance" ? " km" : " reps"}
                        </span>
                        <span className="mx-2">•</span>
                        Reward: <span className={cx("font-semibold", textSoft)}>{xp} XP</span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <Pill tone={done ? "good" : "neutral"} isDark={isDark}>
                        {done ? "Complete" : "Pending"}
                      </Pill>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {boss ? (
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-extrabold">Weekly Boss</div>
                <Pill tone={bossDone ? "good" : "warn"} isDark={isDark}>
                  {bossDone ? "Cleared" : "Available"}
                </Pill>
              </div>

              <div
                className={cx(
                  "w-full rounded-2xl border p-3 text-left transition hover:shadow-sm",
                  bossDone
                    ? isDark
                      ? "border-violet-900/40 bg-violet-900/20"
                      : "border-violet-300 bg-violet-50"
                    : isDark
                    ? "border-zinc-800 bg-zinc-950/10"
                    : "border-zinc-200 bg-white"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold">{boss.name}</div>
                    <div className={cx("mt-1 text-xs", textMuted)}>{boss.desc}</div>
                    <div className={cx("mt-1 text-xs", textMuted)}>
                      Reward: <span className={cx("font-semibold", textSoft)}>High XP</span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <Button onClick={toggleBossDone} variant={bossDone ? "outline" : "default"} isDark={isDark}>
                      {bossDone ? "Undo" : "Claim"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-4" border={border} surface={surface}>
          <div className="text-sm font-extrabold">System Status</div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className={cx("rounded-xl border p-3", border)}>
              <div className={cx("text-xs", textMuted)}>Total XP</div>
              <div className="mt-1 text-lg font-black">{state.totalXP}</div>
            </div>
            <div className={cx("rounded-xl border p-3", border)}>
              <div className={cx("text-xs", textMuted)}>Today XP</div>
              <div className="mt-1 text-lg font-black">{todays.earnedXP || 0}</div>
            </div>
            <div className={cx("rounded-xl border p-3", border)}>
              <div className={cx("text-xs", textMuted)}>Compliance (30d)</div>
              <div className="mt-1 text-lg font-black">{stats.compliance}%</div>
            </div>
            <div className={cx("rounded-xl border p-3", border)}>
              <div className={cx("text-xs", textMuted)}>Avg XP (active)</div>
              <div className="mt-1 text-lg font-black">{stats.avgXP}</div>
            </div>
          </div>
        </Card>

        <Card className="p-4" border={border} surface={surface}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-extrabold">Hardcore Mode</div>
              <div className={cx("mt-1 text-xs", textMuted)}>Increases stakes (you can expand this later).</div>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={settings.hardcore} onChange={(e) => setHardcore(e.target.checked)} className="h-4 w-4" />
              <span className="text-sm font-semibold">{settings.hardcore ? "On" : "Off"}</span>
            </label>
          </div>

          <div className="mt-4">
            <div className={cx("text-xs font-semibold", textMuted)}>Penalty Mode</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant={settings.penaltyMode === "xp_debt" ? "default" : "outline"} onClick={() => setPenaltyMode("xp_debt")} isDark={isDark}>
                XP Debt
              </Button>
              <Button variant={settings.penaltyMode === "cooldown" ? "default" : "outline"} onClick={() => setPenaltyMode("cooldown")} isDark={isDark}>
                Cooldown
              </Button>
            </div>
            <div className={cx("mt-2 text-xs", textMuted)}>
              {settings.penaltyMode === "xp_debt"
                ? "Missed days add XP debt that must be repaid before leveling counts."
                : "Missed days trigger a 24h cooldown (bonus XP disabled)."}
            </div>
          </div>
        </Card>

        <div className="sm:hidden">
          <Button variant="danger" onClick={resetAll} className="w-full" isDark={isDark}>
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}

function CalendarPanel({
  dateKey,
  state,
  setState,
  selectedDay,
  setSelectedDay,
  modalDayKey,
  setModalDayKey,
  dayModalOpen,
  setDayModalOpen,
  setCalCursor,
  weeks,
  monthName,
  isDark,
  border,
  surface,
  textMuted,
}) {
  const nowKey = dateKey;

  function dayTone(key) {
    const e = state.days[key];
    if (!e) return "none";
    if (e.xpDebt > 0) return "debt";
    if ((e.earnedXP || 0) > 0) return "good";
    if (e.note === "(missed)") return "missed";
    return "none";
  }

  const toneCls = {
    good: isDark ? "bg-emerald-900/30 text-emerald-100" : "bg-emerald-100 text-emerald-900",
    missed: isDark ? "bg-zinc-800 text-zinc-200" : "bg-zinc-200 text-zinc-800",
    debt: isDark ? "bg-amber-900/30 text-amber-100" : "bg-amber-100 text-amber-900",
    none: "bg-transparent",
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="p-4 lg:col-span-2" border={border} surface={surface}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-lg font-extrabold">{monthName}</div>
            <div className={cx("mt-1 text-xs", textMuted)}>Tap a day to view XP + notes</div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setCalCursor((p) => {
                  const d = new Date(p.y, p.m, 1);
                  d.setMonth(d.getMonth() - 1);
                  return { y: d.getFullYear(), m: d.getMonth() };
                })
              }
              isDark={isDark}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                setCalCursor((p) => {
                  const d = new Date(p.y, p.m, 1);
                  d.setMonth(d.getMonth() + 1);
                  return { y: d.getFullYear(), m: d.getMonth() };
                })
              }
              isDark={isDark}
            >
              Next
            </Button>
          </div>
        </div>

        <div className={cx("mt-4 grid grid-cols-7 gap-2 text-xs font-semibold", textMuted)}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="px-1">
              {d}
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-2">
          {weeks.flat().map(({ date, inMonth }, idx) => {
            const key = fmtDateKey(date);
            const tone = dayTone(key);
            const isToday = key === nowKey;
            const e = state.days[key];
            const xp = e?.earnedXP || 0;

            return (
              <button
                key={idx}
                onClick={() => {
                  setSelectedDay(key);
                  setModalDayKey(key);
                  setDayModalOpen(true);
                }}
                className={cx(
                  "aspect-square rounded-xl border px-2 py-2 text-left transition hover:shadow-sm active:scale-[0.99]",
                  inMonth ? border : "border-transparent opacity-50",
                  toneCls[tone],
                  isToday ? (isDark ? "ring-2 ring-zinc-100" : "ring-2 ring-zinc-900") : ""
                )}
              >
                <div className="flex items-start justify-between">
                  <div className={cx("text-sm font-black", inMonth ? "" : "opacity-60")}>{date.getDate()}</div>
                  {xp > 0 ? <div className="text-[10px] font-bold">+{xp}</div> : null}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Pill tone="good" isDark={isDark}>
            Active day
          </Pill>
          <Pill tone="warn" isDark={isDark}>
            XP debt
          </Pill>
          <Pill isDark={isDark}>Missed</Pill>
        </div>
      </Card>

      <DayInspector
        state={state}
        selectedDay={selectedDay}
        setState={setState}
        isDark={isDark}
        border={border}
        surface={surface}
        textMuted={textMuted}
      />

      <Modal
        open={dayModalOpen}
        title={`Day Report • ${modalDayKey}`}
        onClose={() => setDayModalOpen(false)}
        isDark={isDark}
        border={border}
        surface={surface}
        textMuted={textMuted}
      >
        <DayModalContent dayKey={modalDayKey} state={state} setState={setState} isDark={isDark} border={border} textMuted={textMuted} />
      </Modal>
    </div>
  );
}

function QuestsPanel({ state, level, textMuted, textSoft, isDark, border, surface, updateQuest, addQuest, deleteQuest }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="p-4 lg:col-span-2" border={border} surface={surface}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-extrabold">Quest Editor</div>
            <div className={cx("mt-1 text-sm", textMuted)}>Edit base targets and scaling. Your current level affects today’s target.</div>
          </div>
          <Button onClick={addQuest} isDark={isDark}>
            Add Quest
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {state.quests.map((q) => {
            const target = targetForLevel(q, level);
            return (
              <div key={q.id} className={cx("rounded-2xl border p-3", border)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <input
                        value={q.name}
                        onChange={(e) => updateQuest(q.id, { name: e.target.value })}
                        className={cx(
                          "w-full rounded-lg border px-2 py-1 text-sm font-extrabold outline-none focus:ring-2",
                          isDark ? "border-zinc-800 bg-zinc-950/10 focus:ring-zinc-100" : "border-zinc-200 bg-white focus:ring-zinc-900"
                        )}
                      />
                      <Pill isDark={isDark}>{q.tier}</Pill>
                    </div>
                    <div className={cx("mt-1 text-xs", textMuted)}>
                      Current target at Level {level}: <span className={cx("font-bold", textSoft)}>{target}{q.kind === "distance" ? " km" : " reps"}</span>
                    </div>
                  </div>
                  <Button variant="danger" onClick={() => deleteQuest(q.id)} isDark={isDark}>
                    Delete
                  </Button>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <div className={cx("text-xs font-semibold", textMuted)}>Type</div>
                    <select
                      value={q.kind}
                      onChange={(e) => updateQuest(q.id, { kind: e.target.value })}
                      className={cx("mt-1 w-full rounded-xl border p-2 text-sm", isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white")}
                    >
                      <option value="reps">Reps</option>
                      <option value="distance">Distance (km)</option>
                      <option value="time">Time (min)</option>
                    </select>
                  </div>

                  <div>
                    <div className={cx("text-xs font-semibold", textMuted)}>Tier</div>
                    <select
                      value={q.tier}
                      onChange={(e) => updateQuest(q.id, { tier: e.target.value })}
                      className={cx("mt-1 w-full rounded-xl border p-2 text-sm", isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white")}
                    >
                      <option value="Main">Main</option>
                      <option value="Side">Side</option>
                    </select>
                  </div>

                  <div>
                    <div className={cx("text-xs font-semibold", textMuted)}>Base Target</div>
                    <input
                      type="number"
                      step={q.kind === "distance" ? "0.1" : "1"}
                      value={q.baseTarget}
                      onChange={(e) => updateQuest(q.id, { baseTarget: Number(e.target.value) })}
                      className={cx("mt-1 w-full rounded-xl border p-2 text-sm", isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white")}
                    />
                  </div>

                  <div>
                    <div className={cx("text-xs font-semibold", textMuted)}>Base XP</div>
                    <input
                      type="number"
                      value={q.baseXP}
                      onChange={(e) => updateQuest(q.id, { baseXP: Number(e.target.value) })}
                      className={cx("mt-1 w-full rounded-xl border p-2 text-sm", isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white")}
                    />
                  </div>

                  <div>
                    <div className={cx("text-xs font-semibold", textMuted)}>Scale Every (Levels)</div>
                    <input
                      type="number"
                      value={q.scaleEveryLevels}
                      onChange={(e) => updateQuest(q.id, { scaleEveryLevels: Math.max(1, Number(e.target.value)) })}
                      className={cx("mt-1 w-full rounded-xl border p-2 text-sm", isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white")}
                    />
                  </div>

                  <div>
                    <div className={cx("text-xs font-semibold", textMuted)}>Scale Amount</div>
                    <input
                      type="number"
                      step={q.kind === "distance" ? "0.1" : "1"}
                      value={q.scaleAmount}
                      onChange={(e) => updateQuest(q.id, { scaleAmount: Number(e.target.value) })}
                      className={cx("mt-1 w-full rounded-xl border p-2 text-sm", isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white")}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4" border={border} surface={surface}>
        <div className="text-sm font-extrabold">How scaling works</div>
        <div className={cx("mt-2 text-sm", textMuted)}>Each quest increases its target every N levels by a fixed amount.</div>
        <div className={cx("mt-4 rounded-xl border p-3 text-xs", border, textSoft)}>
          Example: base 10 pushups, scaleEvery=3, scaleAmount=2
          <div className="mt-2">
            Level 1–2: 10
            <br />
            Level 3–5: 12
            <br />
            Level 6–8: 14
          </div>
        </div>
      </Card>
    </div>
  );
}

function StatsPanel({ dateKey, state, stats, level, rank, streakDays, isDark, border, surface, textMuted, textSoft, setTab, resetAll }) {
  const keys = Object.keys(state.days).filter((k) => k <= dateKey).sort();
  const last7 = keys.slice(-7);

  const bars = last7.map((k) => ({ key: k, xp: state.days[k]?.earnedXP || 0 }));
  const maxXP = Math.max(1, ...bars.map((b) => b.xp));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="p-4 lg:col-span-2" border={border} surface={surface}>
        <div className="text-lg font-extrabold">Stats</div>
        <div className={cx("mt-1 text-sm", textMuted)}>Last 7 days XP</div>

        <div className="mt-4 grid grid-cols-7 gap-2">
          {bars.map((b) => {
            const h = Math.round((b.xp / maxXP) * 100);
            const isToday = b.key === dateKey;
            return (
              <div key={b.key} className="flex flex-col items-center gap-2">
                <div className={cx("relative h-24 w-full rounded-xl border p-1", border, isDark ? "bg-zinc-950/10" : "bg-white")}>
                  <div className={cx("absolute bottom-1 left-1 right-1 rounded-lg", isDark ? "bg-zinc-100" : "bg-zinc-900")} style={{ height: `${h}%` }} />
                </div>
                <div className={cx("text-[10px] font-bold", isToday ? (isDark ? "text-zinc-100" : "text-zinc-900") : "text-zinc-500")}>
                  {b.key.slice(5)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className={cx("rounded-xl border p-3", border)}>
            <div className={cx("text-xs", textMuted)}>Level</div>
            <div className="mt-1 text-lg font-black">{level}</div>
          </div>
          <div className={cx("rounded-xl border p-3", border)}>
            <div className={cx("text-xs", textMuted)}>Rank</div>
            <div className="mt-1 text-lg font-black">{rank}</div>
          </div>
          <div className={cx("rounded-xl border p-3", border)}>
            <div className={cx("text-xs", textMuted)}>Streak</div>
            <div className="mt-1 text-lg font-black">{streakDays}</div>
          </div>
          <div className={cx("rounded-xl border p-3", border)}>
            <div className={cx("text-xs", textMuted)}>Debt (today)</div>
            <div className="mt-1 text-lg font-black">{state.days[dateKey]?.xpDebt || 0}</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-sm font-extrabold">Quest consistency (last 14 days)</div>
          <div className="mt-3 space-y-2">
            {state.quests.map((q) => {
              const done = stats.questDone[q.id] || 0;
              const tot = stats.questTotals[q.id] || 0;
              const pct = tot ? Math.round((done / tot) * 100) : 0;
              return (
                <div key={q.id} className={cx("rounded-xl border p-3", border)}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold">{q.name}</div>
                    <div className={cx("text-xs font-semibold", textMuted)}>
                      {done}/{tot}
                    </div>
                  </div>
                  <div className="mt-2">
                    <ProgressBar value={pct} max={100} isDark={isDark} />
                    <div className={cx("mt-1 text-xs", textMuted)}>{pct}%</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Card className="p-4" border={border} surface={surface}>
        <div className="text-sm font-extrabold">Actions</div>
        <div className="mt-3 space-y-2">
          <Button variant="outline" onClick={() => setTab("calendar")} className="w-full" isDark={isDark}>
            Open Calendar
          </Button>
          <Button variant="outline" onClick={() => setTab("quests")} className="w-full" isDark={isDark}>
            Edit Quests
          </Button>
          <Button variant="danger" onClick={resetAll} className="w-full" isDark={isDark}>
            Hard Reset
          </Button>
        </div>
      </Card>
    </div>
  );
}

function SettingsPanel({ settings, isDark, border, surface, textMuted, resetAll, setWeeklyBossEnabled, setState }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="p-4 lg:col-span-2" border={border} surface={surface}>
        <div className="text-lg font-extrabold">Settings</div>
        <div className={cx("mt-1 text-sm", textMuted)}>This MVP is offline-first using LocalStorage.</div>

        <div className="mt-5 space-y-4">
          <div className={cx("rounded-2xl border p-4", border)}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-extrabold">Weekly Boss</div>
                <div className={cx("mt-1 text-xs", textMuted)}>Enable or disable the weekly raid challenge.</div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={settings.weeklyBossEnabled} onChange={(e) => setWeeklyBossEnabled(e.target.checked)} className="h-4 w-4" />
                <span className="text-sm font-semibold">{settings.weeklyBossEnabled ? "On" : "Off"}</span>
              </label>
            </div>
          </div>

          <div className={cx("rounded-2xl border p-4", border)}>
            <div className="text-sm font-extrabold">Streak Bonus</div>
            <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className={cx("text-xs font-semibold", textMuted)}>% per day</div>
                <input
                  type="number"
                  value={settings.streakBonusPctPerDay}
                  onChange={(e) =>
                    setState((p) => ({
                      ...p,
                      settings: { ...p.settings, streakBonusPctPerDay: Number(e.target.value) },
                    }))
                  }
                  className={cx("mt-1 w-full rounded-xl border p-2 text-sm", isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white")}
                />
              </div>
              <div>
                <div className={cx("text-xs font-semibold", textMuted)}>Max bonus %</div>
                <input
                  type="number"
                  value={settings.maxStreakBonusPct}
                  onChange={(e) =>
                    setState((p) => ({
                      ...p,
                      settings: { ...p.settings, maxStreakBonusPct: Number(e.target.value) },
                    }))
                  }
                  className={cx("mt-1 w-full rounded-xl border p-2 text-sm", isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white")}
                />
              </div>
            </div>
            <div className={cx("mt-2 text-xs", textMuted)}>Small multipliers keep leveling hard (but rewarding).</div>
          </div>

          <div className={cx("rounded-2xl border p-4", border)}>
            <div className="text-sm font-extrabold">Day Timer</div>
            <div className={cx("mt-1 text-xs", textMuted)}>Configure wake + bed times. (Shown on Today.)</div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className={cx("text-xs font-semibold", textMuted)}>Wake time</div>
                <input
                  type="time"
                  value={settings.wakeTime}
                  onChange={(e) =>
                    setState((p) => ({
                      ...p,
                      settings: { ...p.settings, wakeTime: e.target.value },
                    }))
                  }
                  className={cx(
                    "mt-1 w-full rounded-xl border p-2 text-sm",
                    isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                  )}
                />
              </div>

              <div>
                <div className={cx("text-xs font-semibold", textMuted)}>Bed time</div>
                <input
                  type="time"
                  value={settings.bedTime}
                  onChange={(e) =>
                    setState((p) => ({
                      ...p,
                      settings: { ...p.settings, bedTime: e.target.value },
                    }))
                  }
                  className={cx(
                    "mt-1 w-full rounded-xl border p-2 text-sm",
                    isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                  )}
                />
              </div>
            </div>

            <div className={cx("mt-2 text-xs", textMuted)}>
              If bed time is earlier than wake time, it's treated as next day.
            </div>
          </div>

          <div className={cx("rounded-2xl border p-4", border)}>
            <div className="text-sm font-extrabold">Danger Zone</div>
            <div className={cx("mt-2 text-xs", textMuted)}>Reset wipes your progress and quests.</div>
            <div className="mt-3">
              <Button variant="danger" onClick={resetAll} isDark={isDark}>
                Reset Everything
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4" border={border} surface={surface}>
        <div className="text-sm font-extrabold">Roadmap</div>
        <div className={cx("mt-2 text-sm", textMuted)}>Next upgrades you can ask me for:</div>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>Quest Modifiers (+XP) + time tracking</li>
          <li>AI difficulty coach (rule-based first, then LLM)</li>
          <li>Skill Trees (Fitness + Coding + Study)</li>
          <li>Notifications + daily reset logic</li>
          <li>SQLite persistence (better than LocalStorage)</li>
        </ol>
      </Card>
    </div>
  );
}

// -----------------------------
// App
// -----------------------------
export default function LevelUpQuestBoard() {
  const [tab, setTab] = useState("today");
  const [state, setState] = useState(() => {
    const saved = safeJsonParse(localStorage.getItem(STORAGE_KEY) || "", null);
    if (saved) {
      return {
        ...saved,
        settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) },
      };
    }

    const key = fmtDateKey(today());
    return {
      quests: DEFAULT_QUESTS,
      settings: DEFAULT_SETTINGS,
      days: {
        [key]: { completed: {}, earnedXP: 0, xpDebt: 0, note: "" },
      },
      totalXP: 0,
      lastActiveDate: key,
      cooldownUntil: null,
    };
  });

  const settings = state.settings;
  const isDark = settings.theme === "dark";
  const dateKey = fmtDateKey(today());

  // Keep .dark class for external CSS compatibility
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [isDark]);

  // Ensure today's entry exists + handle missed days penalties
  useEffect(() => {
    setState((prev) => {
      const next = { ...prev, days: { ...prev.days } };

      if (!next.days[dateKey]) {
        next.days[dateKey] = { completed: {}, earnedXP: 0, xpDebt: 0, note: "" };
      }

      if (next.lastActiveDate !== dateKey) {
        const last = new Date(next.lastActiveDate + "T00:00:00");
        const now = new Date(dateKey + "T00:00:00");
        const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));

        for (let i = 1; i < diffDays; i++) {
          const missedKey = fmtDateKey(addDays(last, i));
          if (!next.days[missedKey]) {
            next.days[missedKey] = { completed: {}, earnedXP: 0, xpDebt: 0, note: "(missed)" };
          }

          const missed = next.days[missedKey];
          const anyDone = missed.earnedXP > 0 || Object.values(missed.completed || {}).some((x) => x?.done);
          if (!anyDone) {
            if (next.settings.penaltyMode === "xp_debt") {
              missed.xpDebt = (missed.xpDebt || 0) + 50;
            } else if (next.settings.penaltyMode === "cooldown") {
              next.cooldownUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            }
          }
        }

        next.lastActiveDate = dateKey;
      }

      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const { level, xpIntoLevel, nextReq } = useMemo(() => levelFromXP(state.totalXP), [state.totalXP]);
  const rank = useMemo(() => rankFromLevel(level), [level]);

  const streakDays = useMemo(() => {
    let count = 0;
    let d = new Date(dateKey + "T00:00:00");
    for (let i = 0; i < 365; i++) {
      const key = fmtDateKey(d);
      const entry = state.days[key];
      const ok = entry && (entry.earnedXP > 0 || Object.values(entry.completed || {}).some((x) => x?.done));
      if (!ok) break;
      count += 1;
      d = addDays(d, -1);
    }
    return count;
  }, [state.days, dateKey]);

  const todays = state.days[dateKey] || { completed: {}, earnedXP: 0, xpDebt: 0, note: "" };

  const isCooldownActive = useMemo(() => {
    if (!state.cooldownUntil) return false;
    return Date.now() < new Date(state.cooldownUntil).getTime();
  }, [state.cooldownUntil]);

  const bossKey = useMemo(() => {
    const sow = startOfWeek(today());
    return fmtDateKey(sow) + "_boss";
  }, [dateKey]);

  const boss = useMemo(() => {
    if (!settings.weeklyBossEnabled) return null;

    const totalReps = state.quests
      .filter((q) => q.kind === "reps")
      .reduce((sum, q) => sum + targetForLevel(q, level), 0);

    const dist = state.quests.find((q) => q.kind === "distance");
    const runTarget = dist ? Math.min(5, Math.round(targetForLevel(dist, level) * 1.5 * 10) / 10) : 1;

    return {
      id: bossKey,
      name: "Weekly Boss Raid",
      desc: `Complete a high-volume circuit (total reps ≈ ${totalReps}) + run ${runTarget} km`,
      baseXP: 220,
      tier: "Boss",
      kind: "boss",
      meta: { totalReps, runTarget },
    };
  }, [settings.weeklyBossEnabled, bossKey, state.quests, level]);

  const bossDone = useMemo(() => {
    if (!boss) return false;
    const entry = state.days[bossKey];
    return !!entry?.completed?.[boss.id]?.done;
  }, [state.days, boss, bossKey]);

  function toggleTheme() {
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, theme: prev.settings.theme === "dark" ? "light" : "dark" },
    }));
  }

  function resetAll() {
    const key = fmtDateKey(today());
    setState({
      quests: DEFAULT_QUESTS,
      settings: DEFAULT_SETTINGS,
      days: { [key]: { completed: {}, earnedXP: 0, xpDebt: 0, note: "" } },
      totalXP: 0,
      lastActiveDate: key,
      cooldownUntil: null,
    });
    setTab("today");
  }

  function toggleQuestDone(questId) {
    setState((prev) => {
      const key = dateKey;
      const day = prev.days[key] || { completed: {}, earnedXP: 0, xpDebt: 0, note: "" };
      const was = !!day.completed?.[questId]?.done;

      const q = prev.quests.find((x) => x.id === questId);
      if (!q) return prev;

      const currentDone = { ...(day.completed || {}) };
      const modifiers = currentDone[questId]?.modifiers || [];

      const effStreak = isCooldownActive ? 0 : streakDays;

      const xp = xpForQuest(q, {
        level,
        streakDays: effStreak,
        settings: prev.settings,
        isBoss: false,
        modifiers,
      });

      const earnedDelta = was ? -xp : xp;
      currentDone[questId] = { done: !was, modifiers };

      let newDebt = day.xpDebt || 0;
      let credited = earnedDelta;
      if (earnedDelta > 0 && prev.settings.penaltyMode === "xp_debt" && newDebt > 0) {
        const pay = Math.min(newDebt, earnedDelta);
        newDebt -= pay;
        credited -= pay;
      }

      const newDay = {
        ...day,
        completed: currentDone,
        earnedXP: Math.max(0, (day.earnedXP || 0) + credited),
        xpDebt: newDebt,
      };

      return {
        ...prev,
        totalXP: Math.max(0, prev.totalXP + credited),
        days: { ...prev.days, [key]: newDay },
      };
    });
  }

  function toggleBossDone() {
    if (!boss) return;

    setState((prev) => {
      const entry = prev.days[bossKey] || { completed: {}, earnedXP: 0, xpDebt: 0, note: "" };
      const was = !!entry.completed?.[boss.id]?.done;

      const base = boss.baseXP;
      const effStreak = isCooldownActive ? 0 : streakDays;
      const bossXP = Math.round(base * (1 + Math.min(0.6, (level - 1) * 0.02)) * (1 + Math.min(0.2, effStreak / 100)));
      const delta = was ? -bossXP : bossXP;

      const completed = { ...(entry.completed || {}) };
      completed[boss.id] = { done: !was, modifiers: ["Boss"] };

      let newDebt = entry.xpDebt || 0;
      let credited = delta;
      if (delta > 0 && prev.settings.penaltyMode === "xp_debt" && newDebt > 0) {
        const pay = Math.min(newDebt, delta);
        newDebt -= pay;
        credited -= pay;
      }

      const updated = {
        ...entry,
        completed,
        earnedXP: Math.max(0, (entry.earnedXP || 0) + credited),
        xpDebt: newDebt,
      };

      return {
        ...prev,
        totalXP: Math.max(0, prev.totalXP + credited),
        days: { ...prev.days, [bossKey]: updated },
      };
    });
  }

  function setPenaltyMode(mode) {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, penaltyMode: mode } }));
  }

  function setHardcore(v) {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, hardcore: v } }));
  }

  function setWeeklyBossEnabled(v) {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, weeklyBossEnabled: v } }));
  }

  function updateQuest(id, patch) {
    setState((prev) => ({
      ...prev,
      quests: prev.quests.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    }));
  }

  function addQuest() {
    const id = `q_${Math.random().toString(16).slice(2)}`;
    setState((prev) => ({
      ...prev,
      quests: [
        ...prev.quests,
        {
          id,
          name: "New Quest",
          kind: "reps",
          baseTarget: 10,
          scaleEveryLevels: 3,
          scaleAmount: 2,
          baseXP: 25,
          tier: "Side",
        },
      ],
    }));
  }

  function deleteQuest(id) {
    setState((prev) => ({
      ...prev,
      quests: prev.quests.filter((q) => q.id !== id),
    }));
  }

  const stats = useMemo(() => {
    const keys = Object.keys(state.days).sort();
    const last30 = keys.filter((k) => k <= dateKey).slice(-30);
    const totalDays = last30.length;
    const activeDays = last30.filter((k) => (state.days[k]?.earnedXP || 0) > 0).length;
    const sumXP = last30.reduce((s, k) => s + (state.days[k]?.earnedXP || 0), 0);

    const last14 = keys.filter((k) => k <= dateKey).slice(-14);
    const questTotals = {};
    const questDone = {};
    for (const k of last14) {
      const entry = state.days[k];
      for (const q of state.quests) {
        questTotals[q.id] = (questTotals[q.id] || 0) + 1;
        const done = !!entry?.completed?.[q.id]?.done;
        if (done) questDone[q.id] = (questDone[q.id] || 0) + 1;
      }
    }

    return {
      totalDays,
      activeDays,
      compliance: totalDays ? Math.round((activeDays / totalDays) * 100) : 0,
      avgXP: activeDays ? Math.round(sumXP / activeDays) : 0,
      debt: state.days[dateKey]?.xpDebt || 0,
      questTotals,
      questDone,
    };
  }, [state.days, state.quests, dateKey]);

  // Calendar state
  const [calCursor, setCalCursor] = useState(() => {
    const d = today();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selectedDay, setSelectedDay] = useState(dateKey);

  // Calendar day modal
  const [dayModalOpen, setDayModalOpen] = useState(false);
  const [modalDayKey, setModalDayKey] = useState(dateKey);

  useEffect(() => {
    setSelectedDay(dateKey);
    setModalDayKey(dateKey);
  }, [dateKey]);

  useEffect(() => {
    if (!dayModalOpen) return;
    setSelectedDay(modalDayKey);
  }, [dayModalOpen, modalDayKey]);

  const weeks = useMemo(() => monthMatrix(calCursor.y, calCursor.m), [calCursor]);
  const monthName = useMemo(() => {
    return new Date(calCursor.y, calCursor.m, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
  }, [calCursor]);

  // Theme helpers
  const textMuted = isDark ? "text-zinc-300" : "text-zinc-600";
  const textSoft = isDark ? "text-zinc-200" : "text-zinc-700";
  const border = isDark ? "border-zinc-800" : "border-zinc-200";
  const surface = isDark ? "bg-zinc-900" : "bg-white";
  const page = isDark ? "bg-zinc-950 text-zinc-50" : "bg-zinc-50 text-zinc-900";

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <Shell page={page}>
      <Header
        tab={tab}
        rank={rank}
        isDark={isDark}
        textMuted={textMuted}
        textSoft={textSoft}
        level={level}
        streakDays={streakDays}
        isCooldownActive={isCooldownActive}
        toggleTheme={toggleTheme}
        setTab={setTab}
        resetAll={resetAll}
        xpIntoLevel={xpIntoLevel}
        nextReq={nextReq}
        border={border}
        surface={surface}
      />

      {tab === "today" ? (
        <TodayPanel
          state={state}
          todays={todays}
          level={level}
          streakDays={streakDays}
          isCooldownActive={isCooldownActive}
          settings={settings}
          stats={stats}
          boss={boss}
          bossDone={bossDone}
          toggleQuestDone={toggleQuestDone}
          toggleBossDone={toggleBossDone}
          setHardcore={setHardcore}
          setPenaltyMode={setPenaltyMode}
          resetAll={resetAll}
          isDark={isDark}
          border={border}
          surface={surface}
          textMuted={textMuted}
          textSoft={textSoft}
        />
      ) : null}
      {tab === "calendar" ? (
        <CalendarPanel
          dateKey={dateKey}
          state={state}
          setState={setState}
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
          modalDayKey={modalDayKey}
          setModalDayKey={setModalDayKey}
          dayModalOpen={dayModalOpen}
          setDayModalOpen={setDayModalOpen}
          setCalCursor={setCalCursor}
          weeks={weeks}
          monthName={monthName}
          isDark={isDark}
          border={border}
          surface={surface}
          textMuted={textMuted}
        />
      ) : null}
      {tab === "quests" ? (
        <QuestsPanel
          state={state}
          level={level}
          textMuted={textMuted}
          textSoft={textSoft}
          isDark={isDark}
          border={border}
          surface={surface}
          updateQuest={updateQuest}
          addQuest={addQuest}
          deleteQuest={deleteQuest}
        />
      ) : null}
      {tab === "stats" ? (
        <StatsPanel
          dateKey={dateKey}
          state={state}
          stats={stats}
          level={level}
          rank={rank}
          streakDays={streakDays}
          isDark={isDark}
          border={border}
          surface={surface}
          textMuted={textMuted}
          textSoft={textSoft}
          setTab={setTab}
          resetAll={resetAll}
        />
      ) : null}
      {tab === "settings" ? (
        <SettingsPanel
          settings={settings}
          isDark={isDark}
          border={border}
          surface={surface}
          textMuted={textMuted}
          resetAll={resetAll}
          setWeeklyBossEnabled={setWeeklyBossEnabled}
          setState={setState}
        />
      ) : null}

      <div className={cx("mt-8 text-center text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
        Offline-first MVP • LocalStorage • Solo Leveling vibe
      </div>
    </Shell>
  );
}

// -----------------------------
// Tiny sanity tests (dev-only)
// -----------------------------
function runSanityTests() {
  // Level math
  {
    const r0 = levelFromXP(0);
    console.assert(r0.level === 1, "Expected level 1 at 0 XP");
    console.assert(r0.xpIntoLevel === 0, "Expected 0 xpIntoLevel at 0 XP");

    const r100 = levelFromXP(100);
    console.assert(r100.level === 2, "Expected level 2 at 100 XP (first threshold)");
  }

  // Scaling
  {
    const q = { id: "t", kind: "reps", baseTarget: 10, scaleEveryLevels: 3, scaleAmount: 2 };
    console.assert(targetForLevel(q, 1) === 10, "Level 1 target should be base");
    console.assert(targetForLevel(q, 3) === 10, "Level 3 still base");
    console.assert(targetForLevel(q, 4) === 12, "Level 4 should bump by 2");
  }

  // Date + month matrix
  {
    const d = new Date("2026-01-16T12:00:00");
    console.assert(fmtDateKey(d) === "2026-01-16", "fmtDateKey should format YYYY-MM-DD");

    const weeks = monthMatrix(2026, 0);
    console.assert(Array.isArray(weeks) && weeks.length === 6, "monthMatrix should return 6 weeks");
    console.assert(weeks.every((w) => w.length === 7), "Each week should have 7 days");
  }

  // XP calc sanity
  {
    const q = { id: "x", tier: "Main", baseXP: 30 };
    const xp = xpForQuest(q, { level: 1, streakDays: 0, settings: DEFAULT_SETTINGS, isBoss: false, modifiers: [] });
    console.assert(xp > 0, "xpForQuest should return positive XP");
  }

  // Storage key
  {
    console.assert(typeof STORAGE_KEY === "string" && STORAGE_KEY.length > 0, "STORAGE_KEY should exist");
  }
}

if (typeof window !== "undefined") {
  if (!window.__LEVELUP_SANITY__) {
    window.__LEVELUP_SANITY__ = true;
    runSanityTests();
  }
}
