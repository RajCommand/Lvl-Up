import React, { useEffect, useMemo, useRef, useState } from "react";
import { Brain, ChevronDown, ChevronUp, Eye, ChevronLeft, ChevronRight, Sparkles, Flame, Lock, Medal, ShieldAlert, Trophy } from "lucide-react";
import { DayTimerClock } from "./components/DayTimerClock";
import QuoteOfTheDay from "./components/QuoteOfTheDay";
import DoDifferent from "./DoDifferent";
import {
  ACTIVITY_TYPES_BY_DOMAIN,
  DOMAIN_OPTIONS,
  MEASUREMENT_TYPES,
  SCHEMA_VERSION,
  allowedMeasurementTypes,
  defaultUnitForMeasurement,
  inferQuestTaxonomy,
  measurementRequiresTarget,
  normalizeActivityKind,
  normalizeDomain,
  normalizeMeasurementType,
  unitTypeForMeasurement,
} from "./taxonomy";

/**
 * Level Up: Quest Board — Solo Leveling–inspired MVP (single-file)
 * - Offline-first (LocalStorage)
 * - Tabs: Today / Calendar / Quests / Progress / Settings
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

function pad2(n) {
  return String(n).padStart(2, "0");
}

function parseTimeToMinutes(str) {
  if (!str || typeof str !== "string") return 0;
  const [hRaw, mRaw] = str.split(":");
  const h = clamp(Number(hRaw || 0), 0, 23);
  const m = clamp(Number(mRaw || 0), 0, 59);
  return h * 60 + m;
}

function dayWindowMinutes(wakeTime, bedTime) {
  const wakeMin = parseTimeToMinutes(wakeTime);
  const bedRaw = parseTimeToMinutes(bedTime);
  const bedMin = bedRaw <= wakeMin ? bedRaw + 1440 : bedRaw;
  return Math.max(1, bedMin - wakeMin);
}

function formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${pad2(m)}`;
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
  return `${m}:${pad2(s)}`;
}

function computeAge(dob) {
  if (!dob) return null;
  const parsed = new Date(dob);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const monthDiff = now.getMonth() - parsed.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < parsed.getDate())) {
    age -= 1;
  }
  return Math.max(0, age);
}

function isWithinDayWindow(settings, now = new Date()) {
  const wakeMin = parseTimeToMinutes(settings.wakeTime);
  const bedRaw = parseTimeToMinutes(settings.bedTime);
  const bedMin = bedRaw <= wakeMin ? bedRaw + 1440 : bedRaw;
  let nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin < wakeMin) nowMin += 1440;
  return nowMin >= wakeMin && nowMin <= bedMin;
}

function getWeekStart(date, wakeTime, weekStartsOnMonday = true) {
  const base = new Date(date);
  const wakeMinutes = parseTimeToMinutes(wakeTime || "08:00");
  base.setHours(Math.floor(wakeMinutes / 60), wakeMinutes % 60, 0, 0);
  const day = base.getDay();
  const offset = weekStartsOnMonday ? (day + 6) % 7 : day;
  const start = new Date(base);
  start.setDate(base.getDate() - offset);
  if (date < start) start.setDate(start.getDate() - 7);
  return start;
}

function getWeekDays(weekStart) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.push(fmtDateKey(d));
  }
  return days;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dayIndexMonday(date) {
  const day = date.getDay(); // 0 Sun
  return (day + 6) % 7; // Mon=0
}

function normalizeFrequency(value) {
  return value === "weekly" ? "weekly" : "daily";
}

function normalizeDaysOfWeek(days) {
  if (!Array.isArray(days)) return [];
  return days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}

function defaultWeeklyDays() {
  return [0, 1, 2, 3, 4, 5, 6];
}

function isQuestScheduledForDate(q, date) {
  const frequency = normalizeFrequency(q?.frequency);
  if (frequency !== "weekly") return true;
  const days = normalizeDaysOfWeek(q?.daysOfWeek);
  if (!days.length) return true;
  return days.includes(dayIndexMonday(date));
}

function buildWeeklyChartData(xpByDay, weekStart) {
  const keys = getWeekDays(weekStart);
  let cumulative = 0;
  return keys.map((key) => {
    const dailyXP = Number(xpByDay?.[key] || 0);
    cumulative += dailyXP;
    const label = new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" });
    return { dayLabel: label, dateKey: key, dailyXP, cumulativeXP: cumulative };
  });
}

function incrementXpByDay(map, key, delta) {
  const next = { ...(map || {}) };
  const prevVal = Number(next[key] || 0);
  const updated = prevVal + delta;
  next[key] = Math.max(0, updated);
  return next;
}

function questIsTimed(q) {
  return q?.measurementType === "time" && typeof q.targetMinutes === "number" && q.targetMinutes > 0;
}

function questTimerLimitMs(q) {
  if (!questIsTimed(q)) return 0;
  const grace = typeof q.graceMinutes === "number" ? q.graceMinutes : 0;
  return (q.targetMinutes + grace) * 60 * 1000;
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
// Default quests + progression rules
// -----------------------------
const DEFAULT_QUESTS = [
  {
    id: "q_pushups",
    name: "Push-ups",
    category: "body",
    domain: "body",
    activityKind: "strength",
    measurementType: "reps",
    unit: "reps",
    unitType: "reps",
    currentTargetValue: 10,
    sTargetValue: 100,
    baselineValue: 10,
    priority: "main",
    xp: 0,
    frequency: "daily",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  },
  {
    id: "q_situps",
    name: "Sit-ups",
    category: "body",
    domain: "body",
    activityKind: "strength",
    measurementType: "reps",
    unit: "reps",
    unitType: "reps",
    currentTargetValue: 10,
    sTargetValue: 80,
    baselineValue: 10,
    priority: "main",
    xp: 0,
    frequency: "daily",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  },
  {
    id: "q_pullups",
    name: "Pull-ups",
    category: "body",
    domain: "body",
    activityKind: "strength",
    measurementType: "reps",
    unit: "reps",
    unitType: "reps",
    currentTargetValue: 5,
    sTargetValue: 20,
    baselineValue: 5,
    priority: "main",
    xp: 0,
    frequency: "daily",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  },
  {
    id: "q_run",
    name: "Run",
    category: "body",
    domain: "body",
    activityKind: "cardio",
    measurementType: "distance",
    unit: "km",
    unitType: "distance",
    currentTargetValue: 1.0,
    sTargetValue: 5.0,
    baselineValue: 1.0,
    priority: "main",
    xp: 0,
    frequency: "daily",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  },
];

const DEFAULT_SETTINGS = {
  themeMode: "system", // system | dark | light
  hardcore: false,
  xpDebtEnabled: false,
  blockAfterBedtime: true,
  noPhonePenaltyEnabled: false,
  noPhonePenaltyMinutes: 60,
  streakBonusPctPerDay: 1,
  maxStreakBonusPct: 20,
  weeklyBossEnabled: true,
  wakeTime: "07:00",
  bedTime: "23:00",
};


const RANK_THRESHOLDS = [
  { rank: "E", min: 0.0, max: 0.19 },
  { rank: "D", min: 0.2, max: 0.39 },
  { rank: "C", min: 0.4, max: 0.59 },
  { rank: "B", min: 0.6, max: 0.74 },
  { rank: "A", min: 0.75, max: 0.89 },
  { rank: "S", min: 0.9, max: 1.0 },
];

const XP_CAPS_BY_RANK = {
  E: 10000,
  D: 25000,
  C: 50000,
  B: 90000,
  A: 150000,
  S: 250000,
};

const BASE_XP_BY_RANK = {
  E: 40,
  D: 60,
  C: 85,
  B: 115,
  A: 150,
  S: 200,
};

const PRIORITY_MULTIPLIER = {
  main: 1.0,
  minor: 0.6,
};

const IMPROVEMENT_BONUS_MULT = 1.5;

const QUEST_CATEGORIES = ["body", "mind", "hobbies", "life"];

function normalizeQuestCategory(category) {
  return normalizeDomain(category);
}

function normalizeUnitType(unitType) {
  if (unitType === "time") return "minutes";
  if (unitType === "minutes" || unitType === "reps" || unitType === "distance") return unitType;
  return "reps";
}

function allowedKindsForCategory(category, activityKind) {
  return allowedMeasurementTypes(category, activityKind);
}

function categoryLabel(category) {
  const normalized = normalizeDomain(category);
  return DOMAIN_OPTIONS.find((opt) => opt.id === normalized)?.label || "Life";
}

function measurementLabel(kind) {
  const entry = MEASUREMENT_TYPES.find((m) => m.id === kind);
  return entry ? entry.label : "Reps";
}

function questUnitLabel(q) {
  if (!q || q.measurementType === "habit") return "";
  if (q.unit) return q.unit;
  if (q.measurementType === "time") return "min";
  if (q.measurementType === "distance") return "km";
  if (q.measurementType === "count") return "x";
  return "reps";
}

const DOMAIN_COLORS = {
  body: "#EF4444",
  mind: "#3B82F6",
  hobbies: "#22C55E",
  life: "#EAB308",
};

function hexToRgb(hex) {
  const raw = String(hex || "").replace("#", "");
  if (raw.length !== 6) return { r: 0, g: 0, b: 0 };
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return { r, g, b };
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getDomainColor(domain) {
  return DOMAIN_COLORS[normalizeDomain(domain)] || DOMAIN_COLORS.body;
}

function getDomainStyle(domain, isDark) {
  const color = getDomainColor(domain);
  const borderColor = rgba(color, isDark ? 0.26 : 0.16);
  return { color, borderColor, textClass: "" };
}

function categoryIconForName(name) {
  const n = String(name || "").toLowerCase().trim();
  if (/(strength|workout|fitness|body)/.test(n)) return IconDumbbell;
  if (/(mindfulness|mind|focus|meditation)/.test(n)) return Brain;
  if (/(hobby|hobbies|learning|study|reading|craft)/.test(n)) return IconBook;
  if (/(productivity|productive|work|life|admin|finance|chores|hydration|nutrition)/.test(n)) return IconTrendingUp;
  return IconTag;
}

function progressPct(currentTargetValue, sTargetValue) {
  if (!sTargetValue || sTargetValue <= 0) return 0;
  return clamp(currentTargetValue / sTargetValue, 0, 1);
}

function rankFromProgressPct(pct) {
  const entry = RANK_THRESHOLDS.find((r) => pct >= r.min && pct <= r.max);
  return entry ? entry.rank : "E";
}

function xpCapForRank(rank) {
  return XP_CAPS_BY_RANK[rank] || XP_CAPS_BY_RANK.E;
}

function baseXPForRank(rank) {
  return BASE_XP_BY_RANK[rank] || BASE_XP_BY_RANK.E;
}

function priorityMultiplier(priority) {
  return PRIORITY_MULTIPLIER[priority] ?? PRIORITY_MULTIPLIER.main;
}

function defaultSTargetValue({ name, unitType, category }) {
  const n = (name || "").toLowerCase();
  if (unitType === "distance") {
    if (n.includes("run")) return 5;
    return category === "body" ? 3 : 2;
  }
  if (unitType === "minutes") {
    if (n.includes("medit") || n.includes("mind")) return 30;
    if (n.includes("read")) return 60;
    if (n.includes("learn") || n.includes("study")) return 90;
    return 45;
  }
  if (n.includes("pull")) return 20;
  if (n.includes("push")) return 100;
  if (n.includes("sit")) return 80;
  return 50;
}

function normalizeQuest(q) {
  const inferred = inferQuestTaxonomy(q);
  const domain = normalizeDomain(q.domain || q.category || inferred.domain);
  const activityKind = normalizeActivityKind(domain, q.activityKind || inferred.activityKind);
  let measurementType = normalizeMeasurementType(q.measurementType || inferred.measurementType, q.unitType || q.kind);
  const allowedMeasurements = allowedKindsForCategory(domain, activityKind);
  if (!allowedMeasurements.includes(measurementType)) measurementType = allowedMeasurements[0];
  const unit = String(q.unit || inferred.unit || defaultUnitForMeasurement(measurementType)).trim();
  const unitType = unitTypeForMeasurement(measurementType);
  const currentTargetRaw = Number(q.currentTargetValue ?? q.baseTarget ?? q.target ?? 1);
  let currentTargetValue = Number.isFinite(currentTargetRaw) ? currentTargetRaw : 1;
  if (measurementRequiresTarget(measurementType)) currentTargetValue = Math.max(1, currentTargetValue);
  else currentTargetValue = 1;
  const sTargetRaw = Number(q.sTargetValue ?? defaultSTargetValue({ name: q.name, unitType, category: domain }));
  let sTargetValue =
    Number.isFinite(sTargetRaw) && sTargetRaw > 0
      ? sTargetRaw
      : defaultSTargetValue({ name: q.name, unitType, category: domain });
  if (!measurementRequiresTarget(measurementType)) sTargetValue = 1;
  const baselineRaw = Number(q.lastTargetValue ?? q.baselineValue ?? currentTargetValue);
  const baselineValue = Number.isFinite(baselineRaw) ? baselineRaw : currentTargetValue;
  const createdAtRaw = Number(q.createdAt ?? 0);
  const createdAt = Number.isFinite(createdAtRaw) ? createdAtRaw : 0;
  const rawPriority = String(q.priority || (q.tier === "Side" ? "minor" : "main")).toLowerCase();
  const priority = rawPriority === "minor" ? "minor" : "main";
  const xpRaw = Number(q.xp ?? 0);
  const targetMinutesRaw = Number(q.targetMinutes ?? (measurementType === "time" ? currentTargetValue : NaN));
  const targetMinutes = measurementType === "time" && Number.isFinite(targetMinutesRaw) ? Math.max(1, targetMinutesRaw) : null;
  const graceMinutesRaw = Number(q.graceMinutes ?? (targetMinutes ? 10 : 0));
  const graceMinutes = Number.isFinite(graceMinutesRaw) ? Math.max(0, graceMinutesRaw) : 0;
  const status =
    q.status === "active" || q.status === "completed" || q.status === "paused" ? q.status : "idle";
  const startedAt = typeof q.startedAt === "number" ? q.startedAt : null;
  const elapsedMs = typeof q.elapsedMs === "number" ? q.elapsedMs : 0;
  const pct = progressPct(currentTargetValue, sTargetValue);
  const rank = rankFromProgressPct(pct);
  const cap = xpCapForRank(rank);
  const xp = Number.isFinite(xpRaw) ? Math.min(xpRaw, cap) : 0;
  const safeStatus = status === "active" && !startedAt ? "idle" : status;
  const frequency = normalizeFrequency(q.frequency || q.cadence);
  let daysOfWeek = normalizeDaysOfWeek(q.daysOfWeek || q.weekDays);
  if (frequency === "weekly" && !daysOfWeek.length) daysOfWeek = defaultWeeklyDays();
  if (frequency === "daily") daysOfWeek = defaultWeeklyDays();
  return {
    ...q,
    category: domain,
    domain,
    activityKind,
    measurementType,
    unit,
    unitType,
    currentTargetValue,
    sTargetValue,
    baselineValue,
    priority,
    xp,
    createdAt,
    status: safeStatus,
    startedAt: safeStatus === "active" ? startedAt : null,
    elapsedMs: safeStatus === "completed" ? elapsedMs : 0,
    targetMinutes,
    graceMinutes,
    frequency,
    daysOfWeek,
  };
}

function migrateSavedState(saved) {
  if (!saved || typeof saved !== "object") return null;
  const schemaVersion = Number(saved.schemaVersion || 1);
  if (schemaVersion >= SCHEMA_VERSION) return saved;

  const migrated = { ...saved };
  migrated.schemaVersion = SCHEMA_VERSION;
  migrated.quests = (saved.quests || []).map((q) => {
    const inferred = inferQuestTaxonomy(q);
    const domain = normalizeDomain(q.domain || q.category || inferred.domain);
    const activityKind = normalizeActivityKind(domain, q.activityKind || inferred.activityKind);
    let measurementType = normalizeMeasurementType(q.measurementType || inferred.measurementType, q.unitType || q.kind);
    const allowed = allowedKindsForCategory(domain, activityKind);
    if (!allowed.includes(measurementType)) measurementType = allowed[0];
    const unit = String(q.unit || inferred.unit || defaultUnitForMeasurement(measurementType)).trim();
    const unitType = unitTypeForMeasurement(measurementType);
    const currentTargetValue = measurementRequiresTarget(measurementType)
      ? Math.max(1, Number(q.currentTargetValue ?? q.baseTarget ?? q.target ?? 1) || 1)
      : 1;
    const sTargetValue = measurementRequiresTarget(measurementType)
      ? Math.max(
          1,
          Number(q.sTargetValue ?? defaultSTargetValue({ name: q.name, unitType, category: domain })) || 1
        )
      : 1;
    const targetMinutes = measurementType === "time" ? Math.max(1, Number(q.targetMinutes ?? currentTargetValue) || 1) : null;
    const graceMinutes = measurementType === "time" ? Number(q.graceMinutes ?? 10) : 0;
    const frequency = normalizeFrequency(q.frequency || q.cadence);
    let daysOfWeek = normalizeDaysOfWeek(q.daysOfWeek || q.weekDays);
    if (frequency === "weekly" && !daysOfWeek.length) daysOfWeek = defaultWeeklyDays();
    if (frequency === "daily") daysOfWeek = defaultWeeklyDays();
    return {
      ...q,
      category: domain,
      domain,
      activityKind,
      measurementType,
      unit,
      unitType,
      currentTargetValue,
      sTargetValue,
      targetMinutes,
      graceMinutes,
      frequency,
      daysOfWeek,
    };
  });
  if (!migrated.xpByDay) {
    const xpByDay = {};
    for (const [dayKey, entry] of Object.entries(saved.days || {})) {
      xpByDay[dayKey] = Number(entry?.earnedXP || 0);
    }
    migrated.xpByDay = xpByDay;
  }
  return migrated;
}

function buildDefaultState({ settings = DEFAULT_SETTINGS, quests = DEFAULT_QUESTS } = {}) {
  const key = fmtDateKey(today());
  const normalizedQuests = quests.map((q) => {
    const createdAt = typeof q.createdAt === "number" ? q.createdAt : 0;
    return normalizeQuest({ ...q, createdAt });
  });
  const totalXP = normalizedQuests.reduce((sum, q) => sum + (q.xp || 0), 0);
  return {
    quests: normalizedQuests,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    days: { [key]: { completed: {}, earnedXP: 0, xpDebt: 0, note: "", debtApplied: false } },
    totalXP,
    lastActiveDate: key,
    cooldownUntil: null,
    weeklyChallenge: null,
    mysteryBox: null,
    schemaVersion: SCHEMA_VERSION,
    xpByDay: { [key]: 0 },
  };
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

function Modal({ open, title, onClose, children, isDark, border, surface, textMuted, showClose = true, showHint = true }) {
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
      <style>{`
        @keyframes modalFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes modalOverlayIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <div
        className={cx("absolute inset-0 backdrop-blur-sm", isDark ? "bg-black/60" : "bg-black/40")}
        style={{ animation: "modalOverlayIn 160ms ease" }}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => e.stopPropagation()}
          className={cx("w-full max-w-lg rounded-2xl border shadow-xl", border, surface)}
          style={{ animation: "modalFadeIn 180ms ease" }}
        >
          <div className={cx("flex items-center justify-between gap-3 border-b p-4", border)}>
            <div className="min-w-0">
              <div className="truncate text-sm font-extrabold">{title}</div>
              {showHint ? <div className={cx("mt-0.5 text-xs", textMuted)}>Click outside or press Esc to close</div> : null}
            </div>
            {showClose ? (
              <Button variant="outline" onClick={onClose} isDark={isDark}>
                Close
              </Button>
            ) : null}
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Toast({ message, isDark }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div
        className={cx(
          "rounded-full px-4 py-2 text-xs font-semibold shadow-lg",
          isDark ? "bg-zinc-100 text-zinc-900" : "bg-zinc-900 text-white"
        )}
      >
        {message}
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

function DayModalContent({ dayKey, state, setState, settings, isDark, border, textMuted }) {
  const entry = state.days[dayKey] || { completed: {}, earnedXP: 0, xpDebt: 0, note: "" };
  const dayDate = new Date(`${dayKey}T00:00:00`);
  const scheduled = state.quests.filter((q) => isQuestScheduledForDate(q, dayDate));
  const completed = scheduled.filter((q) => !!entry.completed?.[q.id]?.done);
  const missedQuests = scheduled.filter((q) => !entry.completed?.[q.id]?.done);
  const missed = entry.note === "(missed)";

  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      <div className="grid grid-cols-2 gap-3">
        <div className={cx("rounded-xl border p-3", border)}>
          <div className={cx("text-xs", textMuted)}>XP gained</div>
          <div className="mt-1 text-lg font-black">{entry.earnedXP || 0}</div>
        </div>
        <div className={cx("rounded-xl border p-3", border)}>
          <div className={cx("text-xs", textMuted)}>Quests completed</div>
          <div className="mt-1 text-lg font-black">
            {completed.length}/{scheduled.length}
          </div>
        </div>
      </div>

      {missed ? (
        <div className={cx("rounded-xl border p-3 text-sm", isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white")}>
          <div className="font-extrabold">Missed day</div>
          <div className={cx("mt-1 text-xs", textMuted)}>No recorded activity.</div>
        </div>
      ) : null}

      {settings?.xpDebtEnabled && entry.xpDebt > 0 ? (
        <div
          className={cx(
            "rounded-xl border p-3 text-sm",
            isDark ? "border-amber-900/40 bg-amber-900/20 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-900"
          )}
        >
          <div className="font-extrabold">XP Debt</div>
          <div className="mt-1 text-xs">
            <span className="font-bold">{entry.xpDebt}</span> XP must be repaid before rewards apply.
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
        <div className="flex items-center justify-between">
          <div className="text-sm font-extrabold">Missed</div>
          <Pill tone={missedQuests.length ? "warn" : "good"} isDark={isDark}>
            {missedQuests.length ? "Incomplete" : "All clear"}
          </Pill>
        </div>
        <div className="mt-2 space-y-2">
          {missedQuests.length ? (
            missedQuests.map((q) => (
              <div key={q.id} className={cx("rounded-xl border p-3", border)}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold">{q.name}</div>
                  <Pill isDark={isDark}>Missed</Pill>
                </div>
              </div>
            ))
          ) : (
            <div className={cx("rounded-xl border p-3 text-sm", border)}>
              <div className={cx("text-xs", textMuted)}>Nothing missed for this day.</div>
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
    <div className={cx("min-h-screen pb-36", page)}>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}

function IconCheckCircle({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </svg>
  );
}

function IconCalendar({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function IconChart({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V6" />
      <path d="M10 20V10" />
      <path d="M16 20V4" />
      <path d="M22 20H2" />
    </svg>
  );
}

function IconList({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6h12" />
      <path d="M9 12h12" />
      <path d="M9 18h12" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </svg>
  );
}

function IconGear({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1v.1a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-.4-1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4h-.1a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V2.9a2 2 0 1 1 4 0V3a1.7 1.7 0 0 0 .4 1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.24.31.4.67.47 1.05a1.7 1.7 0 0 0 1.23.95h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.23.95c-.07.38-.23.74-.47 1.05Z" />
    </svg>
  );
}

function IconMoreVertical({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}

function IconDumbbell({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10v4" />
      <path d="M6 9v6" />
      <path d="M9 8v8" />
      <path d="M15 8v8" />
      <path d="M18 9v6" />
      <path d="M21 10v4" />
      <path d="M9 12h6" />
    </svg>
  );
}

function IconTrendingUp({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l6-6 4 4 7-7" />
      <path d="M14 8h6v6" />
    </svg>
  );
}

function IconHome({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}

function IconBook({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h6a3 3 0 0 1 3 3v11H7a3 3 0 0 0-3 3z" />
      <path d="M20 5h-6a3 3 0 0 0-3 3v11h6a3 3 0 0 1 3 3z" />
    </svg>
  );
}

function IconTag({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12l-8 8-8-8V4h8z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  );
}

function BottomTabs({ tab, setTab, isDark }) {
  const items = [
    { id: "home", label: "Home", Icon: IconHome },
    { id: "quests", label: "Quests", Icon: IconList },
    { id: "do-different", label: "Do Different", Icon: Sparkles },
    { id: "stats", label: "Progress", Icon: IconChart },
  ];

  const frameCls = isDark
    ? "border-zinc-800 bg-zinc-900/80 text-zinc-100"
    : "border-zinc-200 bg-white/80 text-zinc-900";
  const activeCls = isDark ? "bg-zinc-100 text-zinc-900" : "bg-zinc-900 text-white";
  const idleCls = isDark ? "text-zinc-300 hover:text-zinc-50" : "text-zinc-600 hover:text-zinc-900";

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(env(safe-area-inset-bottom),12px)]">
      <div className={cx("mx-auto max-w-2xl rounded-2xl border px-2 py-3 shadow-2xl backdrop-blur", frameCls)}>
        <div className="grid grid-cols-4 gap-2">
          {items.map((it) => {
            const active = tab === it.id;
            const Icon = it.Icon;
            const accentIconCls = "";
            return (
              <button
                key={it.id}
                onClick={() => setTab(it.id)}
                className={cx(
                  "rounded-xl px-2 py-3 text-center text-sm font-semibold transition active:scale-[0.98]",
                  active ? activeCls : idleCls
                )}
                aria-current={active ? "page" : undefined}
              >
                <div className="flex flex-col items-center gap-1.5">
                  <Icon className={cx("h-6 w-6", active ? "opacity-100" : "opacity-80", accentIconCls)} />
                  <span className="leading-none">{it.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Header() {
  return null;
}

  function HomePanel({
    dateKey,
    settings,
    playerName,
    playerAge,
    playerPhoto,
    onPhotoChange,
    onOpenSettings,
    overallRank,
    totalXP,
    state,
    setState,
    joinDateKey,
    calCursor,
    setCalCursor,
    selectedDay,
    setSelectedDay,
    dayModalOpen,
  setDayModalOpen,
  modalDayKey,
  setModalDayKey,
  weeks,
  monthName,
  isDark,
  border,
  surface,
  textMuted,
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="flex items-center justify-between">
          <div className="text-2xl font-black leading-8 tracking-tight">Level Up</div>
          <button
            className={cx(
              "inline-flex h-8 w-8 items-center justify-center rounded-full border transition",
              isDark ? "border-zinc-800 bg-zinc-900 hover:bg-zinc-800" : "border-zinc-200 bg-white hover:bg-zinc-50"
            )}
            onClick={onOpenSettings}
            aria-label="Open settings"
            title="Settings"
          >
            <IconGear className="h-4 w-4" />
          </button>
        </div>

        <Card className="p-4" border={border} surface={surface}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 gap-5">
              <label
                className={cx(
                  "relative flex aspect-[2/3] w-32 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border transition sm:w-36",
                  border,
                  isDark ? "bg-zinc-950/30" : "bg-zinc-100"
                )}
              >
                {playerPhoto ? (
                  <img src={playerPhoto} alt="Player portrait" className="h-full w-full object-cover" />
                ) : (
                  <div className="text-center text-[11px] font-semibold text-zinc-500">
                    <div className={cx("mx-auto mb-2 h-7 w-7 rounded-full", isDark ? "bg-zinc-800" : "bg-zinc-200")} />
                    Add photo
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const result = typeof reader.result === "string" ? reader.result : "";
                      if (result) onPhotoChange(result);
                    };
                    reader.readAsDataURL(file);
                  }}
                  className="hidden"
                />
              </label>

              <div className="min-w-0 flex-1">
                <div
                  className={cx(
                    "flex items-center justify-between gap-3 rounded-xl border px-3 py-2",
                    isDark ? "border-zinc-800 bg-zinc-950/40" : "border-zinc-200 bg-zinc-50"
                  )}
                >
                  <div className={cx("text-sm font-semibold uppercase tracking-[0.2em]", textMuted)}>Leveler</div>
                </div>
                <div className="mt-3 space-y-1">
                  <div className={cx("text-sm font-semibold", isDark ? "text-zinc-50" : "text-zinc-900")}>
                    {playerName || "Unknown"}
                  </div>
                  <div className={cx("text-sm font-semibold", textMuted)}>
                    {playerAge !== null ? `${playerAge} years` : "Unknown"}
                  </div>
                  <div className="pt-1">
                    <Pill tone={overallRank === "S" || overallRank === "A" ? "good" : overallRank === "E" ? "warn" : "neutral"} isDark={isDark}>
                      Rank {overallRank}
                    </Pill>
                  </div>
                  <div className={cx("text-sm font-semibold", textMuted)}>Total XP: {totalXP}</div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <QuoteOfTheDay isDark={isDark} border={border} surface={surface} textMuted={textMuted} />

        <DayTimerClock
          wakeTime={settings.wakeTime}
          bedTime={settings.bedTime}
          isDark={isDark}
          border={border}
          surface={surface}
          textMuted={textMuted}
          Card={Card}
        />

        <HomeCalendarSection
          dateKey={dateKey}
          state={state}
          settings={settings}
          setState={setState}
          joinDateKey={joinDateKey}
          calCursor={calCursor}
          setCalCursor={setCalCursor}
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
          dayModalOpen={dayModalOpen}
          setDayModalOpen={setDayModalOpen}
          modalDayKey={modalDayKey}
          setModalDayKey={setModalDayKey}
          weeks={weeks}
          monthName={monthName}
          isDark={isDark}
          border={border}
          surface={surface}
          textMuted={textMuted}
        />
      </div>
    </div>
  );
}

function HomeCalendarSection({
  dateKey,
  state,
  settings,
  setState,
  joinDateKey,
  calCursor,
  setCalCursor,
  selectedDay,
  setSelectedDay,
  dayModalOpen,
  setDayModalOpen,
  modalDayKey,
  setModalDayKey,
  weeks,
  monthName,
  isDark,
  border,
  surface,
  textMuted,
}) {
  const [viewMode, setViewMode] = useState("month");
  const [showHint, setShowHint] = useState(false);
  const todayDate = new Date(dateKey);
  const totalQuests = state.quests.length;

  function dayStatus(date) {
    const key = fmtDateKey(date);
    if (key <= joinDateKey) return "inactive";
    const entry = state.days[key];
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const isFuture = dateOnly > todayDate;
    if (isFuture || !totalQuests) return "none";
    const doneCount = state.quests.filter((q) => !!entry?.completed?.[q.id]?.done).length;
    if (doneCount === 0) return "missed";
    if (doneCount >= totalQuests) return "good";
    return "partial";
  }

  const toneCls = {
    good: isDark ? "bg-emerald-900/40 text-emerald-100" : "bg-emerald-200 text-emerald-900",
    partial: isDark ? "bg-amber-900/40 text-amber-100" : "bg-amber-200 text-amber-900",
    missed: isDark ? "bg-rose-900/40 text-rose-100" : "bg-rose-200 text-rose-900",
    inactive: isDark ? "bg-zinc-900/40 text-zinc-300" : "bg-zinc-100 text-zinc-500",
    none: "bg-transparent",
  };

  const weekStart = startOfWeek(new Date(selectedDay));
  const weekDates = Array.from({ length: 7 }).map((_, idx) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + idx);
    return d;
  });

  function moveWeek(delta) {
    const d = new Date(selectedDay);
    d.setDate(d.getDate() + delta * 7);
    setSelectedDay(fmtDateKey(d));
  }

  return (
    <Card className="p-4" border={border} surface={surface}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-extrabold">Progress</div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cx(
              "flex items-center gap-1 rounded-full border p-1",
              isDark ? "border-zinc-800 bg-zinc-950/40" : "border-zinc-200 bg-zinc-50"
            )}
          >
            <button
              type="button"
              onClick={() => setViewMode("week")}
              className={cx(
                "rounded-full px-3 py-1 text-xs font-semibold transition",
                viewMode === "week" ? (isDark ? "bg-white text-black" : "bg-black text-white") : textMuted
              )}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={cx(
                "rounded-full px-3 py-1 text-xs font-semibold transition",
                viewMode === "month" ? (isDark ? "bg-white text-black" : "bg-black text-white") : textMuted
              )}
            >
              Month
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowHint((v) => !v)}
            className={cx(
              "inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold transition",
              isDark ? "border-zinc-800 bg-zinc-950/40 hover:bg-zinc-900" : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100"
            )}
            aria-label="Calendar info"
          >
            i
          </button>
        </div>
      </div>

      {showHint ? (
        <div
          className={cx(
            "mt-3 rounded-xl border px-3 py-2 text-xs",
            isDark ? "border-zinc-800 bg-zinc-950/40 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-700"
          )}
          onClick={() => setShowHint(false)}
        >
          <div>Tap a day to see clears, misses, and XP.</div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <Pill tone="good" isDark={isDark}>
              Complete
            </Pill>
            <Pill tone="warn" isDark={isDark}>
              Partial
            </Pill>
            <Pill tone="bad" isDark={isDark}>
              Missed
            </Pill>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between">
        <div className="text-sm font-semibold">{viewMode === "month" ? monthName : "This week"}</div>
        {viewMode === "month" ? (
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
              aria-label="Previous month"
              title="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
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
              aria-label="Next month"
              title="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>

      <div className={cx("mt-4 rounded-2xl border p-3", border, isDark ? "bg-zinc-950/10" : "bg-white")}>
        <div className={cx("grid grid-cols-7 gap-2 text-xs font-semibold", textMuted)}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="px-1">
              {d}
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-2">
          {(viewMode === "month" ? weeks.flat().map((w) => w.date) : weekDates).map((date, idx) => {
            const key = fmtDateKey(date);
            const tone = dayStatus(date);
            const isToday = key === dateKey;
            const inMonth = viewMode === "month" ? date.getMonth() === calCursor.m : true;
            const isInactive = tone === "inactive";
            return (
              <button
                key={`${key}-${idx}`}
                onClick={() => {
                  setSelectedDay(key);
                  setModalDayKey(key);
                  setDayModalOpen(true);
                  setShowHint(false);
                }}
                className={cx(
                  "aspect-square rounded-xl border px-2 py-2 text-left transition hover:shadow-sm active:scale-[0.99]",
                  inMonth ? border : "border-transparent opacity-50",
                  toneCls[tone],
                  isInactive ? "opacity-70" : "",
                  isToday ? (isDark ? "ring-2 ring-zinc-100" : "ring-2 ring-zinc-900") : ""
                )}
              >
                <div className="text-sm font-black">{date.getDate()}</div>
              </button>
            );
          })}
        </div>
      </div>

      <Modal
        open={dayModalOpen}
        title={`Day Report • ${modalDayKey}`}
        onClose={() => setDayModalOpen(false)}
        isDark={isDark}
        border={border}
        surface={surface}
        textMuted={textMuted}
      >
        <DayModalContent dayKey={modalDayKey} state={state} setState={setState} settings={settings} isDark={isDark} border={border} textMuted={textMuted} />
      </Modal>
    </Card>
  );
}
function TodayQuestsSection({
  dateKey,
  state,
  todays,
  settings,
  boss,
  bossDone,
  toggleBossDone,
  isWithinWindowNow,
  timerTick,
  onQuestStart,
  onQuestPause,
  onQuestResume,
  onQuestComplete,
  isDark,
  border,
  surface,
  textMuted,
  textSoft,
}) {
  const holdRef = useRef({});
  const [collapsingIds, setCollapsingIds] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState(() => new Set());
  const [openQuestId, setOpenQuestId] = useState("");
  const todayDate = new Date(`${dateKey}T00:00:00`);
  const scheduledQuests = state.quests.filter((q) => isQuestScheduledForDate(q, todayDate));
  const doneCount = scheduledQuests.filter((q) => !!todays.completed?.[q.id]?.done).length;
  const total = scheduledQuests.length;
  const percent = total ? Math.round((doneCount / total) * 100) : 0;

  const debt = todays.xpDebt || 0;
  const categories = [
    { id: "body", label: "Body" },
    { id: "mind", label: "Mind" },
    { id: "hobbies", label: "Hobbies" },
    { id: "life", label: "Life" },
  ];

  function orderedQuestsForCategory(catId) {
    return scheduledQuests
      .filter((q) => q.category === catId)
      .sort((a, b) => {
        const aDone = !!todays.completed?.[a.id]?.done;
        const bDone = !!todays.completed?.[b.id]?.done;
        if (aDone !== bDone) return aDone ? 1 : -1;
        if (a.priority !== b.priority) return a.priority === "main" ? -1 : 1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }

  function renderQuestCard(q) {
    const done = !!todays.completed?.[q.id]?.done;
    const isTimed = questIsTimed(q);
    const status = q.status || "idle";
    const isActive = status === "active";
    const isPaused = status === "paused";
    const isCollapsing = collapsingIds.includes(q.id);
    const elapsedMs = isTimed ? (isActive && q.startedAt ? Math.max(0, timerTick - q.startedAt) : q.elapsedMs || 0) : 0;
    const limitMs = questTimerLimitMs(q);
    const remainingMs = limitMs ? Math.max(0, limitMs - elapsedMs) : 0;

    const domainColor = getDomainColor(q.category);
    const borderColor = rgba(domainColor, isDark ? 0.35 : 0.18);
    const activeAccent = isDark ? "#ffffff" : "#000000";
    const accentColor = done ? rgba(domainColor, isDark ? 0.9 : 0.85) : isActive ? activeAccent : rgba(domainColor, isDark ? 0.35 : 0.18);
    const titleColor = done ? rgba(domainColor, isDark ? 0.95 : 0.85) : isActive ? activeAccent : isDark ? "rgba(255,255,255,0.6)" : "rgba(17,24,39,0.55)";
    const cardCls = isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white";

    const handlePointerDown = () => {
      if (!isActive || !isTimed) return;
      holdRef.current[q.id] = setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate(30);
        setCollapsingIds((ids) => [...ids, q.id]);
        setTimeout(() => {
          onQuestComplete(q.id);
          setCollapsingIds((ids) => ids.filter((x) => x !== q.id));
        }, 260);
      }, 600);
    };

    const clearHold = () => {
      const t = holdRef.current[q.id];
      if (t) clearTimeout(t);
      delete holdRef.current[q.id];
    };

    const handleClick = () => {
      setOpenQuestId((prev) => (prev === q.id ? "" : q.id));
    };

    return (
      <button
        key={q.id}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        className={cx(
          "relative w-full overflow-hidden rounded-2xl border p-3 text-left transition hover:shadow-sm active:scale-[0.998]",
          cardCls,
          isActive ? "shadow-[0_0_0_2px_var(--accent-color)]" : "",
          isCollapsing ? "max-h-0 overflow-hidden opacity-0" : openQuestId === q.id ? "max-h-[360px]" : "max-h-[160px]"
        )}
        style={{
          borderColor,
          "--accent-color": accentColor,
          transition: "all 240ms ease",
          filter: !done && !isActive ? "grayscale(1)" : "none",
          opacity: !done && !isActive ? 0.7 : 1,
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accentColor }} />
              <div
                className="truncate text-sm font-extrabold"
                style={{
                  color: titleColor,
                  textDecoration: done ? "line-through" : "none",
                  textDecorationThickness: done ? "3px" : "auto",
                  textDecorationColor: done ? (isDark ? "rgba(255,255,255,0.6)" : "rgba(15,23,42,0.6)") : "currentColor",
                }}
              >
                {q.name}
              </div>
              </div>
              {!done && (isActive || isPaused) ? (
                <div className="flex items-center gap-2">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      (isPaused ? onQuestResume : onQuestPause)(q.id);
                    }}
                    isDark={isDark}
                    className="px-3 py-1 text-xs"
                  >
                    {isPaused ? "Resume" : "Pause"}
                  </Button>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onQuestComplete(q.id);
                    }}
                    isDark={isDark}
                    className="px-3 py-1 text-xs"
                  >
                    Complete
                  </Button>
                </div>
              ) : null}
            </div>
            {isActive ? (
              <div className={cx("mt-1 text-xs font-semibold", textSoft)}>
                {isTimed ? `${formatElapsed(elapsedMs)} elapsed • ${formatElapsed(remainingMs)} left` : "In progress"}
              </div>
            ) : isPaused ? (
              <div className={cx("mt-1 text-xs font-semibold", textSoft)}>
                {isTimed ? `Paused • ${formatElapsed(elapsedMs)} elapsed` : "Paused"}
              </div>
            ) : null}
            {openQuestId === q.id ? (
              <div className={cx("mt-2 rounded-xl border p-3 text-xs", border, textMuted)}>
                {done ? (
                  <div className="mb-2 font-semibold">
                    Completed:{" "}
                    {isTimed
                      ? `${formatElapsed(q.elapsedMs || 0)} total`
                      : q.measurementType === "habit"
                      ? "Habit"
                      : `${q.currentTargetValue} ${questUnitLabel(q)}`}
                  </div>
                ) : null}
                <div className="font-semibold">
                  Target task goal:{" "}
                  {isTimed
                    ? `${q.targetMinutes} min`
                    : q.measurementType === "habit"
                    ? "Maintain habit"
                    : `${q.currentTargetValue} ${questUnitLabel(q)}`}
                </div>
                {isTimed ? (
                  <>
                    <div className="mt-1">Grace period: {q.graceMinutes} min</div>
                    <div className="mt-1">If you have breaks, schedule them inside this window.</div>
                    <div className="mt-1">This task must be started.</div>
                    <div className="mt-1">Complete within the allotted time to count.</div>
                  </>
                ) : (
                  <>
                    {q.measurementType !== "habit" ? (
                      <div className="mt-1">
                        S-rank goal: {q.sTargetValue} {questUnitLabel(q)}
                      </div>
                    ) : null}
                    <div className="mt-1">Start the quest, complete the task, then finish.</div>
                  </>
                )}
                {status === "idle" ? (
                  <div className="mt-3">
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuestStart(q.id);
                      }}
                      isDark={isDark}
                      className="w-full"
                    >
                      Start Quest
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </button>
    );
  }

  return (
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

      {debt > 0 && settings.xpDebtEnabled ? (
        <div
          className={cx(
            "mt-3 rounded-xl border p-3 text-sm",
            isDark ? "border-amber-900/40 bg-amber-900/20 text-amber-100" : "border-amber-200 bg-amber-50 text-amber-900"
          )}
        >
          <div className="font-semibold">XP Debt active</div>
          <div>{debt} XP must be repaid before rewards apply.</div>
        </div>
      ) : null}
      {settings.blockAfterBedtime && !isWithinWindowNow ? (
        <div
          className={cx(
            "mt-3 rounded-xl border p-3 text-sm",
            isDark ? "border-red-900/40 bg-red-900/20 text-red-100" : "border-red-200 bg-red-50 text-red-900"
          )}
        >
          <div className="font-semibold">Outside time window</div>
          <div>Completions will not count until your wake-to-bed window is active.</div>
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        {categories.map((cat) => {
          const list = orderedQuestsForCategory(cat.id);
          if (!list.length) return null;
          const expanded = expandedCategories.has(cat.id);
          const visible = expanded ? list : list.slice(0, 2);
          const Icon = categoryIconForName(cat.label);
          const headerColor = getDomainColor(cat.id);
          const completedCount = list.filter((q) => !!todays.completed?.[q.id]?.done).length;
          return (
            <div key={cat.id} className={cx("rounded-2xl border p-3", border)}>
              <button
                type="button"
                onClick={() => {
                  setExpandedCategories((prev) => {
                    const next = new Set(prev);
                    if (next.has(cat.id)) next.delete(cat.id);
                    else next.add(cat.id);
                    return next;
                  });
                }}
                className="flex w-full items-center justify-between"
              >
                <div className={cx("flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em]", textMuted)} style={{ color: headerColor }}>
                  <Icon className="h-4 w-4" style={{ color: headerColor }} />
                  <span>{cat.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold" style={{ color: headerColor }}>
                    {completedCount}/{list.length}
                  </span>
                  <span className={cx("text-xs font-semibold", textMuted)}>{expanded ? "Show less" : "Show all"}</span>
                </div>
              </button>
              <div className="mt-3 space-y-3">
                {visible.map((q) => renderQuestCard(q))}
              </div>
            </div>
          );
        })}
      </div>

    </Card>
  );
}

function CalendarPanel({
  dateKey,
  state,
  setState,
  settings,
  joinDateKey,
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
    if (key <= joinDateKey) return "inactive";
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
    inactive: isDark ? "bg-zinc-900/40 text-zinc-400" : "bg-zinc-100 text-zinc-500",
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
            const isInactive = tone === "inactive";

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
                  isInactive ? "opacity-70" : "",
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
        <DayModalContent dayKey={modalDayKey} state={state} setState={setState} settings={settings} isDark={isDark} border={border} textMuted={textMuted} />
      </Modal>
    </div>
  );
}

function QuestsPanel({
  dateKey,
  state,
  todays,
  settings,
  boss,
  bossDone,
  toggleBossDone,
  isWithinWindowNow,
  timerTick,
  onQuestStart,
  onQuestPause,
  onQuestResume,
  onQuestComplete,
  textMuted,
  textSoft,
  isDark,
  border,
  surface,
  updateQuest,
  addQuest,
  deleteQuest,
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [expandedById, setExpandedById] = useState({});
  const filterOptions = ["all", ...QUEST_CATEGORIES];

  const editorList = (categoryFilter === "all" ? state.quests : state.quests.filter((q) => q.category === categoryFilter))
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  function toggleExpanded(id) {
    setExpandedById((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function expandAll() {
    const next = {};
    editorList.forEach((q) => {
      next[q.id] = true;
    });
    setExpandedById(next);
  }

  function collapseAll() {
    const next = {};
    editorList.forEach((q) => {
      next[q.id] = false;
    });
    setExpandedById(next);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <TodayQuestsSection
          dateKey={dateKey}
          state={state}
          todays={todays}
          settings={settings}
          boss={boss}
          bossDone={bossDone}
          toggleBossDone={toggleBossDone}
          isWithinWindowNow={isWithinWindowNow}
          timerTick={timerTick}
          onQuestStart={onQuestStart}
          onQuestPause={onQuestPause}
          onQuestResume={onQuestResume}
          onQuestComplete={onQuestComplete}
          isDark={isDark}
          border={border}
          surface={surface}
          textMuted={textMuted}
          textSoft={textSoft}
        />

        <div className={cx("rounded-2xl border p-3", border, surface)}>
          <Button onClick={() => setEditorOpen(true)} isDark={isDark} className="w-full">
            Open Quest Editor
          </Button>
        </div>
      </div>

      <Modal
        open={editorOpen}
        title="Quest Editor"
        onClose={() => setEditorOpen(false)}
        isDark={isDark}
        border={border}
        surface={surface}
        textMuted={textMuted}
      >
        <div className="flex h-[70vh] flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className={cx("text-xs", textMuted)}>Edit quests, targets, and priority.</div>
            <Button onClick={addQuest} isDark={isDark}>
              Add Quest
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {filterOptions.map((opt) => {
              const active = categoryFilter === opt;
              const domainColor = opt === "all" ? null : DOMAIN_COLORS[opt];
              const activeStyle =
                active && domainColor
                  ? {
                      borderColor: domainColor,
                      color: domainColor,
                      boxShadow: `0 0 0 1px ${rgba(domainColor, 0.25)}`,
                    }
                  : undefined;
              return (
                <Button
                  key={opt}
                  variant={active ? "default" : "outline"}
                  onClick={() => setCategoryFilter(opt)}
                  isDark={isDark}
                  className="transition-colors duration-150"
                  style={activeStyle}
                >
                  {opt === "all" ? "All" : categoryLabel(opt)}
                </Button>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const allExpanded = editorList.length > 0 && editorList.every((q) => expandedById[q.id]);
                if (allExpanded) collapseAll();
                else expandAll();
              }}
              isDark={isDark}
            >
              {editorList.length > 0 && editorList.every((q) => expandedById[q.id]) ? "Collapse all" : "Expand all"}
            </Button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {editorList.map((q) => {
              const domain = normalizeDomain(q.domain || q.category);
              const activityOptions = ACTIVITY_TYPES_BY_DOMAIN[domain] || ACTIVITY_TYPES_BY_DOMAIN.life;
              const allowedKinds = allowedKindsForCategory(domain, q.activityKind);
              const measurementType = allowedKinds.includes(q.measurementType) ? q.measurementType : allowedKinds[0];
              const unitValue = q.unit || defaultUnitForMeasurement(measurementType);
              const needsTarget = measurementRequiresTarget(measurementType);
              const isExpanded = !!expandedById[q.id];
              const domainStyle = getDomainStyle(domain, isDark);
              const frequency = normalizeFrequency(q.frequency);
              const daysOfWeek = normalizeDaysOfWeek(q.daysOfWeek);
              const weeklyDays = daysOfWeek.length ? daysOfWeek : defaultWeeklyDays();
              return (
                <div
                  key={q.id}
                  className={cx("rounded-2xl border p-3", border)}
                  style={{ borderColor: domainStyle.borderColor }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="text-xs font-semibold uppercase tracking-[0.12em]"
                          style={{ color: domainStyle.color }}
                        >
                          {categoryLabel(domain)}
                        </span>
                        <div
                          className="text-sm font-extrabold"
                          style={{ color: rgba(domainStyle.color, isDark ? 0.85 : 0.7) }}
                        >
                          {q.name}
                        </div>
                      </div>
                      <div className={cx("mt-1 text-xs", textMuted)}>
                        Current target:{" "}
                        <span className={cx("font-bold", textSoft)}>
                          {q.measurementType === "habit" ? "Habit" : `${q.currentTargetValue} ${questUnitLabel(q)}`}
                        </span>
                      </div>
                      {isExpanded ? (
                        <div className={cx("mt-1 inline-flex items-center gap-2 text-xs", textMuted)}>
                          {(() => {
                            const Icon = categoryIconForName(q.activityKind || domain);
                            return <Icon className="h-4 w-4" style={{ color: domainStyle.color }} />;
                          })()}
                          <span className="font-semibold" style={{ color: domainStyle.color }}>
                            {categoryLabel(domain)}
                          </span>
                          <Pill isDark={isDark}>{q.priority === "minor" ? "Minor" : "Major"}</Pill>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => toggleExpanded(q.id)} isDark={isDark}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      <Button variant="danger" onClick={() => deleteQuest(q.id)} isDark={isDark}>
                        Delete
                      </Button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <div className={cx("text-xs font-semibold", textMuted)}>Domain</div>
                        <select
                          value={domain}
                          onChange={(e) => {
                            const nextDomain = normalizeQuestCategory(e.target.value);
                            const nextActivity = normalizeActivityKind(nextDomain, q.activityKind);
                            const nextAllowed = allowedKindsForCategory(nextDomain, nextActivity);
                            const nextMeasurement = nextAllowed.includes(measurementType) ? measurementType : nextAllowed[0];
                            const nextUnitType = unitTypeForMeasurement(nextMeasurement);
                            const nextUnit =
                              nextMeasurement === "count"
                                ? (q.unit || defaultUnitForMeasurement(nextMeasurement))
                                : defaultUnitForMeasurement(nextMeasurement);
                            const nextTarget = measurementRequiresTarget(nextMeasurement)
                              ? Math.max(1, Number(q.currentTargetValue) || 1)
                              : 1;
                            const nextSTarget = measurementRequiresTarget(nextMeasurement)
                              ? Math.max(
                                  1,
                                  Number(q.sTargetValue) || defaultSTargetValue({ name: q.name, unitType: nextUnitType, category: nextDomain })
                                )
                              : 1;
                            const nextTargetMinutes = nextMeasurement === "time" ? Math.max(1, Number(q.targetMinutes || nextTarget)) : null;
                            const nextGrace = nextMeasurement === "time" ? Number(q.graceMinutes ?? 10) : 0;
                            updateQuest(q.id, {
                              category: nextDomain,
                              domain: nextDomain,
                              activityKind: nextActivity,
                              measurementType: nextMeasurement,
                              unitType: nextUnitType,
                              unit: nextUnit,
                              currentTargetValue: nextTarget,
                              sTargetValue: nextSTarget,
                              targetMinutes: nextTargetMinutes,
                              graceMinutes: nextGrace,
                            });
                          }}
                          className={cx(
                            "mt-1 w-full rounded-xl border p-2 text-sm",
                            isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                          )}
                        >
                          {QUEST_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {categoryLabel(cat)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div className={cx("text-xs font-semibold", textMuted)}>Activity Type</div>
                        <select
                          value={q.activityKind || activityOptions[0]?.id}
                          onChange={(e) => {
                            const nextActivity = normalizeActivityKind(domain, e.target.value);
                            const nextAllowed = allowedKindsForCategory(domain, nextActivity);
                            const nextMeasurement = nextAllowed.includes(measurementType) ? measurementType : nextAllowed[0];
                            const nextUnitType = unitTypeForMeasurement(nextMeasurement);
                            const nextUnit =
                              nextMeasurement === "count"
                                ? (q.unit || defaultUnitForMeasurement(nextMeasurement))
                                : defaultUnitForMeasurement(nextMeasurement);
                            const nextTarget = measurementRequiresTarget(nextMeasurement)
                              ? Math.max(1, Number(q.currentTargetValue) || 1)
                              : 1;
                            const nextSTarget = measurementRequiresTarget(nextMeasurement)
                              ? Math.max(
                                  1,
                                  Number(q.sTargetValue) || defaultSTargetValue({ name: q.name, unitType: nextUnitType, category: domain })
                                )
                              : 1;
                            const nextTargetMinutes = nextMeasurement === "time" ? Math.max(1, Number(q.targetMinutes || nextTarget)) : null;
                            const nextGrace = nextMeasurement === "time" ? Number(q.graceMinutes ?? 10) : 0;
                            updateQuest(q.id, {
                              activityKind: nextActivity,
                              measurementType: nextMeasurement,
                              unitType: nextUnitType,
                              unit: nextUnit,
                              currentTargetValue: nextTarget,
                              sTargetValue: nextSTarget,
                              targetMinutes: nextTargetMinutes,
                              graceMinutes: nextGrace,
                            });
                          }}
                          className={cx(
                            "mt-1 w-full rounded-xl border p-2 text-sm",
                            isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                          )}
                        >
                          {activityOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div className={cx("text-xs font-semibold", textMuted)}>Measure</div>
                        <select
                          value={measurementType}
                          onChange={(e) => {
                            const nextMeasurementRaw = normalizeMeasurementType(e.target.value);
                            const nextMeasurement = allowedKinds.includes(nextMeasurementRaw) ? nextMeasurementRaw : allowedKinds[0];
                            const nextUnitType = unitTypeForMeasurement(nextMeasurement);
                            const nextUnit =
                              nextMeasurement === "count"
                                ? (q.unit || defaultUnitForMeasurement(nextMeasurement))
                                : defaultUnitForMeasurement(nextMeasurement);
                            const nextTarget = measurementRequiresTarget(nextMeasurement)
                              ? Math.max(1, Number(q.currentTargetValue) || 1)
                              : 1;
                            const nextSTarget = measurementRequiresTarget(nextMeasurement)
                              ? Math.max(
                                  1,
                                  Number(q.sTargetValue) || defaultSTargetValue({ name: q.name, unitType: nextUnitType, category: domain })
                                )
                              : 1;
                            const nextTargetMinutes = nextMeasurement === "time" ? Math.max(1, Number(q.targetMinutes || nextTarget)) : null;
                            const nextGrace = nextMeasurement === "time" ? Number(q.graceMinutes ?? 10) : 0;
                            updateQuest(q.id, {
                              measurementType: nextMeasurement,
                              unitType: nextUnitType,
                              unit: nextUnit,
                              currentTargetValue: nextTarget,
                              sTargetValue: nextSTarget,
                              targetMinutes: nextTargetMinutes,
                              graceMinutes: nextGrace,
                            });
                          }}
                          className={cx(
                            "mt-1 w-full rounded-xl border p-2 text-sm",
                            isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                          )}
                        >
                          {allowedKinds.map((kind) => (
                            <option key={kind} value={kind}>
                              {measurementLabel(kind)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div className={cx("text-xs font-semibold", textMuted)}>Cadence</div>
                        <div
                          className={cx(
                            "mt-1 inline-flex w-fit items-center gap-1 rounded-full border p-0.5 text-sm font-semibold",
                            isDark ? "border-zinc-700 bg-zinc-900" : "border-zinc-200 bg-white"
                          )}
                        >
                          {["daily", "weekly"].map((opt) => {
                            const active = frequency === opt;
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() =>
                                  updateQuest(q.id, {
                                    frequency: opt,
                                    daysOfWeek: opt === "weekly" ? weeklyDays : defaultWeeklyDays(),
                                  })
                                }
                                className={cx(
                                  "rounded-full px-2.5 py-1 text-sm font-semibold transition",
                                  active
                                    ? isDark
                                      ? "bg-white text-zinc-900"
                                      : "bg-zinc-900 text-white"
                                    : isDark
                                    ? "text-zinc-400"
                                    : "text-zinc-600"
                                )}
                                style={
                                  active
                                    ? {
                                        backgroundColor: isDark ? "#ffffff" : "#111827",
                                        color: isDark ? "#111827" : "#ffffff",
                                      }
                                    : {
                                        backgroundColor: "transparent",
                                        color: isDark ? "#9CA3AF" : "#4B5563",
                                      }
                                }
                                aria-pressed={active}
                              >
                                {opt === "daily" ? "Daily" : "Weekly"}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div
                        className={cx(
                          "transition-all overflow-hidden",
                          frequency === "weekly" ? "opacity-100 max-h-20" : "opacity-0 max-h-0 pointer-events-none"
                        )}
                        style={{ gridColumn: "1 / -1" }}
                      >
                        <div className={cx("text-xs font-semibold", textMuted)}>Weekly days</div>
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                          {WEEKDAY_LABELS.map((label, idx) => {
                            const active = weeklyDays.includes(idx);
                            return (
                              <button
                                key={label}
                                type="button"
                                onClick={() => {
                                  if (!active && frequency !== "weekly") return;
                                  const next = active ? weeklyDays.filter((d) => d !== idx) : [...weeklyDays, idx];
                                  const safeNext = next.length ? next : weeklyDays;
                                  updateQuest(q.id, { daysOfWeek: safeNext });
                                }}
                                className={cx(
                                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                                  active
                                    ? "text-zinc-900"
                                    : isDark
                                    ? "border-zinc-700 text-zinc-400"
                                    : "border-zinc-200 text-zinc-600"
                                )}
                                style={{
                                  borderColor: active
                                    ? domainStyle.color
                                    : isDark
                                    ? "#0F172A"
                                    : "#E5E7EB",
                                  color: active
                                    ? domainStyle.color
                                    : isDark
                                    ? "#FFFFFF"
                                    : "#6B7280",
                                  backgroundColor: active
                                    ? rgba(domainStyle.color, isDark ? 0.2 : 0.12)
                                    : isDark
                                    ? "#374151"
                                    : "#F3F4F6",
                                }}
                                aria-pressed={active}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className={cx("text-xs font-semibold", textMuted)}>Quest name</div>
                        <input
                          value={q.name}
                          onChange={(e) => updateQuest(q.id, { name: e.target.value })}
                          className={cx(
                            "mt-1 w-full rounded-xl border p-2 text-sm",
                            isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                          )}
                        />
                      </div>

                      {needsTarget ? (
                        <>
                          <div>
                            <div className={cx("text-xs font-semibold", textMuted)}>Target</div>
                            <input
                              type="number"
                              step={measurementType === "distance" ? "0.1" : "1"}
                              value={q.currentTargetValue}
                              onChange={(e) =>
                                updateQuest(q.id, { currentTargetValue: Math.max(1, Number(e.target.value) || 1) })
                              }
                              className={cx(
                                "mt-1 w-full rounded-xl border p-2 text-sm",
                                isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                              )}
                            />
                          </div>

                          <div>
                            <div className={cx("text-xs font-semibold", textMuted)}>Unit</div>
                            {measurementType === "count" ? (
                              <input
                                value={unitValue}
                                onChange={(e) =>
                                  updateQuest(q.id, {
                                    unit: (e.target.value || defaultUnitForMeasurement(measurementType)).trim(),
                                  })
                                }
                                className={cx(
                                  "mt-1 w-full rounded-xl border p-2 text-sm",
                                  isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                                )}
                              />
                            ) : (
                              <select
                                value={unitValue}
                                onChange={(e) => updateQuest(q.id, { unit: e.target.value })}
                                className={cx(
                                  "mt-1 w-full rounded-xl border p-2 text-sm",
                                  isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                                )}
                              >
                                <option value={unitValue}>{unitValue}</option>
                              </select>
                            )}
                          </div>

                          <div>
                            <div className={cx("text-xs font-semibold", textMuted)}>S Target</div>
                            <input
                              type="number"
                              step={measurementType === "distance" ? "0.1" : "1"}
                              value={q.sTargetValue}
                              onChange={(e) =>
                                updateQuest(q.id, { sTargetValue: Math.max(1, Number(e.target.value) || 1) })
                              }
                              className={cx(
                                "mt-1 w-full rounded-xl border p-2 text-sm",
                                isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                              )}
                            />
                          </div>
                        </>
                      ) : null}

                      <div>
                        <div className={cx("text-xs font-semibold", textMuted)}>Priority</div>
                        <select
                          value={q.priority}
                          onChange={(e) => updateQuest(q.id, { priority: e.target.value })}
                          className={cx(
                            "mt-1 w-full rounded-xl border p-2 text-sm",
                            isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                          )}
                        >
                          <option value="main">Major</option>
                          <option value="minor">Minor</option>
                        </select>
                      </div>

                      {measurementType === "time" ? (
                        <>
                          <div>
                            <div className={cx("text-xs font-semibold", textMuted)}>Target Minutes</div>
                            <input
                              type="number"
                              min="1"
                              value={q.targetMinutes ?? q.currentTargetValue}
                              onChange={(e) =>
                                updateQuest(q.id, { targetMinutes: Math.max(1, Number(e.target.value) || 1) })
                              }
                              className={cx(
                                "mt-1 w-full rounded-xl border p-2 text-sm",
                                isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                              )}
                            />
                          </div>
                          <div>
                            <div className={cx("text-xs font-semibold", textMuted)}>Grace Minutes</div>
                            <input
                              type="number"
                              min="0"
                              value={q.graceMinutes ?? 10}
                              onChange={(e) => updateQuest(q.id, { graceMinutes: Math.max(0, Number(e.target.value) || 0) })}
                              className={cx(
                                "mt-1 w-full rounded-xl border p-2 text-sm",
                                isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                              )}
                            />
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ProgressDashboard({
  dateKey,
  state,
  stats,
  overallRank,
  overallLevel,
  streakDays,
  overallProgressPctDisplay,
  isDark,
  border,
  surface,
  textMuted,
}) {
  const keys = Object.keys(state.days).filter((k) => k <= dateKey).sort();
  const last7 = keys.slice(-7);
  const bars = last7.map((k) => ({ key: k, xp: state.days[k]?.earnedXP || 0 }));
  const totalXPWeek = bars.reduce((sum, b) => sum + b.xp, 0);

  const domainTheme = {
    body: { label: "Body", color: "#EF4444", Icon: IconDumbbell },
    mind: { label: "Mind", color: "#3B82F6", Icon: Brain },
    hobbies: { label: "Hobbies", color: "#22C55E", Icon: IconBook },
    life: { label: "Life", color: "#EAB308", Icon: IconHome },
  };

  const categoryProgress = QUEST_CATEGORIES.map((cat) => {
    const info = stats.categoryProgress?.[cat] || { progressPct: 0, rank: "E" };
    return { cat, ...info };
  });

  const todayLabel = dateKey;
  const penaltyToday = state.days[dateKey]?.xpDebt || 0;

  function progressToNextRank(pct) {
    const entryIdx = RANK_THRESHOLDS.findIndex((r) => pct >= r.min && pct <= r.max);
    if (entryIdx < 0 || entryIdx === RANK_THRESHOLDS.length - 1) return 1;
    const current = RANK_THRESHOLDS[entryIdx];
    const next = RANK_THRESHOLDS[entryIdx + 1];
    const span = Math.max(0.0001, next.min - current.min);
    return clamp((pct - current.min) / span, 0, 1);
  }

  function StatCard({ title, value, subtitle, icon: Icon, accent }) {
    return (
      <div className={cx("rounded-2xl border p-4 shadow-sm", border, surface)} style={{ borderTopColor: accent, borderTopWidth: 3 }}>
        <div className="flex items-center justify-between">
          <div className={cx("text-xs font-semibold uppercase tracking-[0.2em]", textMuted)}>{title}</div>
          <Icon className="h-5 w-5" style={{ color: accent }} />
        </div>
        <div className="mt-3 text-2xl font-black">{value}</div>
        {subtitle ? <div className={cx("mt-1 text-xs font-semibold", textMuted)}>{subtitle}</div> : null}
      </div>
    );
  }

  function WeeklyXPChart() {
    const weekStart = getWeekStart(new Date(`${dateKey}T00:00:00`), state.settings?.wakeTime, true);
    const chartData = buildWeeklyChartData(state.xpByDay || {}, weekStart);
    const hasData = chartData.some((d) => d.dailyXP > 0);
    const totalXP = chartData[chartData.length - 1]?.cumulativeXP || 0;
    const width = 320;
    const height = 120;
    const padding = 12;
    const maxVal = Math.max(1, ...chartData.map((d) => d.cumulativeXP));
    const stepX = (width - padding * 2) / Math.max(1, chartData.length - 1);
    const lineColor = "#38BDF8";

    const points = chartData.map((d, i) => {
      const x = padding + i * stepX;
      const y = height - padding - (d.cumulativeXP / maxVal) * (height - padding * 2);
      return { ...d, x, y };
    });

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    const areaPath = `${linePath} L ${padding + (chartData.length - 1) * stepX} ${height - padding} L ${padding} ${height - padding} Z`;

    return (
      <div className={cx("rounded-2xl border p-4", border, surface)}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-extrabold">Weekly XP</div>
            <div className={cx("mt-1 text-xs", textMuted)}>Mon–Sun</div>
          </div>
          <div className={cx("text-xs font-semibold", textMuted)}>This week: {totalXP} XP</div>
        </div>

        {!hasData ? (
          <div className={cx("mt-6 rounded-xl border p-4 text-sm", border, textMuted)}>
            No XP earned yet this week.
          </div>
        ) : (
          <>
            <div className="mt-4">
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
                <defs>
                  <linearGradient id="xpGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={lineColor} stopOpacity="0.05" />
                  </linearGradient>
                </defs>
                <rect x="0" y="0" width={width} height={height} rx="12" fill={isDark ? "rgba(24,24,27,0.4)" : "rgba(248,250,252,1)"} />
                {[0.25, 0.5, 0.75].map((t) => (
                  <line
                    key={t}
                    x1={padding}
                    x2={width - padding}
                    y1={padding + t * (height - padding * 2)}
                    y2={padding + t * (height - padding * 2)}
                    stroke={isDark ? "rgba(63,63,70,0.6)" : "rgba(226,232,240,0.8)"}
                    strokeWidth="1"
                  />
                ))}
                <path d={areaPath} fill="url(#xpGradient)" stroke="none" />
                <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2.5" />
                {points.map((p) => (
                  <circle key={p.dateKey} cx={p.x} cy={p.y} r="3.5" fill={lineColor}>
                    <title>{`${p.dayLabel}: ${p.cumulativeXP} XP`}</title>
                  </circle>
                ))}
              </svg>
            </div>
            <div className="mt-3 flex justify-between text-[10px] font-semibold text-zinc-500">
              {points.map((p) => (
                <span key={p.dateKey} style={{ width: `${100 / points.length}%`, textAlign: "center" }}>
                  {p.dayLabel}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  function DomainCard({ domain }) {
    const theme = domainTheme[domain];
    const info = categoryProgress.find((c) => c.cat === domain) || { progressPct: 0, rank: "E" };
    const pctToS = Math.round(info.progressPct * 100);
    const pctToNext = Math.round(progressToNextRank(info.progressPct) * 100);
    const Icon = theme.Icon;
    return (
      <div className={cx("rounded-2xl border p-4 shadow-sm", border, surface)} style={{ borderLeft: `3px solid ${theme.color}` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-extrabold">
            <Icon className="h-4 w-4" style={{ color: theme.color }} />
            <span>{theme.label}</span>
          </div>
          <span
            className={cx(
              "rounded-full px-2 py-1 text-xs font-semibold",
              isDark ? "bg-zinc-800 text-zinc-200" : "bg-zinc-100 text-zinc-600"
            )}
          >
            Rank {info.rank}
          </span>
        </div>
        <div className={cx("mt-3 text-xs font-semibold", textMuted)}>Progress to next rank</div>
        <div className="mt-2">
          <ProgressBar value={pctToNext} max={100} isDark={isDark} />
        </div>
        <div className={cx("mt-2 text-xs font-semibold", textMuted)}>{pctToS}% to S</div>
      </div>
    );
  }

  function OverallProgress() {
    return (
      <div className={cx("rounded-2xl border p-4 shadow-sm", border, surface)}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-extrabold">Overall Progress</div>
            <div className={cx("mt-1 text-xs", textMuted)}>{overallProgressPctDisplay}% to S</div>
          </div>
          <span
            className={cx(
              "rounded-full px-2 py-1 text-xs font-semibold",
              isDark ? "bg-zinc-800 text-zinc-200" : "bg-zinc-100 text-zinc-600"
            )}
          >
            Rank {overallRank}
          </span>
        </div>
        <div className="mt-3">
          <ProgressBar value={overallProgressPctDisplay} max={100} isDark={isDark} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {categoryProgress.map((cat) => {
            const theme = domainTheme[cat.cat];
            const pct = Math.round(cat.progressPct * 100);
            return (
              <span key={cat.cat} className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: rgba(theme.color, isDark ? 0.2 : 0.12), color: theme.color }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: theme.color }} />
                {theme.label} {pct}%
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  function AchievementsGrid() {
    const tiers = [7, 14, 30, 50, 100];
    const badges = tiers.map((days) => ({
      id: `streak-${days}`,
      days,
      title: `${days}-Day Streak`,
      desc: `Maintain a ${days}-day streak.`,
      unlocked: streakDays >= days,
    }));

    return (
      <div className={cx("rounded-2xl border p-4 shadow-sm", border, surface)}>
        <div className="text-sm font-extrabold">Achievements</div>
        <div className={cx("mt-1 text-xs", textMuted)}>Consistency streaks</div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {badges.map((badge) => {
            const glow = badge.unlocked ? (isDark ? "shadow-[0_0_20px_rgba(16,185,129,0.2)]" : "shadow-[0_0_20px_rgba(16,185,129,0.15)]") : "";
            return (
              <div
                key={badge.id}
                className={cx("rounded-2xl border p-3 transition", border, badge.unlocked ? glow : "opacity-70")}
                style={{ borderColor: badge.unlocked ? "rgba(16,185,129,0.6)" : undefined }}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-extrabold">{badge.title}</div>
                  {badge.unlocked ? (
                    <Trophy className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Lock className="h-4 w-4 text-zinc-400" />
                  )}
                </div>
                <div className={cx("mt-1 text-xs", textMuted)}>{badge.desc}</div>
                <div className="mt-3">
                  {badge.unlocked ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                      Unlocked
                    </span>
                  ) : (
                    <span className={cx("rounded-full px-2 py-1 text-[10px] font-semibold", isDark ? "bg-zinc-800 text-zinc-300" : "bg-zinc-100 text-zinc-500")}>
                      Locked
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-extrabold">Progress</div>
          <div className={cx("mt-1 text-sm", textMuted)}>Last 7 days</div>
        </div>
        <div className={cx("text-xs font-semibold", textMuted)}>Updated: {todayLabel}</div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Overall Level" value={overallLevel} subtitle={`Rank ${overallRank}`} icon={Medal} accent="#6366F1" />
        <StatCard title="XP This Week" value={totalXPWeek} subtitle={`Today ${state.days[dateKey]?.earnedXP || 0} XP`} icon={Sparkles} accent="#6366F1" />
        <StatCard title="Streak" value={`${streakDays} days`} subtitle="Keep it alive" icon={Flame} accent="#22C55E" />
        <StatCard title="Penalty Today" value={penaltyToday} subtitle={penaltyToday ? "Clear to recover XP" : "No penalties"} icon={ShieldAlert} accent="#EF4444" />
      </div>

      <WeeklyXPChart />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {QUEST_CATEGORIES.map((cat) => (
            <DomainCard key={cat} domain={cat} />
          ))}
        </div>
        <OverallProgress />
      </div>

      <AchievementsGrid />
    </div>
  );
}

function StatsPanel({
  dateKey,
  state,
  stats,
  overallRank,
  overallLevel,
  streakDays,
  overallProgressPctDisplay,
  isDark,
  border,
  surface,
  textMuted,
}) {
  return (
    <ProgressDashboard
      dateKey={dateKey}
      state={state}
      stats={stats}
      overallRank={overallRank}
      overallLevel={overallLevel}
      streakDays={streakDays}
      overallProgressPctDisplay={overallProgressPctDisplay}
      isDark={isDark}
      border={border}
      surface={surface}
      textMuted={textMuted}
    />
  );
}

function SettingsPanel({ settings, isDark, border, surface, textMuted, requestReset, setWeeklyBossEnabled, setState }) {
  const totalWindowMinutes = dayWindowMinutes(settings.wakeTime, settings.bedTime);
  const totalWindowLabel = formatDuration(totalWindowMinutes);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="p-4 lg:col-span-2" border={border} surface={surface}>
        <div className="text-lg font-extrabold">Settings</div>
        <div className={cx("mt-1 text-sm", textMuted)}>This MVP is offline-first using LocalStorage.</div>

        <div className="mt-5 space-y-4">
          <div className={cx("rounded-2xl border p-4", border)}>
            <div className="text-sm font-extrabold">Theme</div>
            <div className={cx("mt-1 text-xs", textMuted)}>Choose system theme or a manual override.</div>
            <div className="mt-3 space-y-2">
              {[
                { id: "system", label: "System", desc: "Theme based on system theme" },
                { id: "light", label: "Light", desc: "Always light" },
                { id: "dark", label: "Dark", desc: "Always dark" },
              ].map((mode) => (
                <label key={mode.id} className={cx("flex items-center justify-between rounded-xl border px-3 py-2", border)}>
                  <div>
                    <div className="text-sm font-semibold">{mode.label}</div>
                    <div className={cx("text-[11px]", textMuted)}>{mode.desc}</div>
                  </div>
                  <input
                    type="radio"
                    name="themeMode"
                    value={mode.id}
                    checked={settings.themeMode === mode.id}
                    onChange={(e) =>
                      setState((p) => ({
                        ...p,
                        settings: { ...p.settings, themeMode: e.target.value },
                      }))
                    }
                    className="h-4 w-4"
                  />
                </label>
              ))}
            </div>
          </div>

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
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-extrabold">Hardcore Mode</div>
                <div className={cx("mt-1 text-xs", textMuted)}>Increases stakes (you can expand this later).</div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.hardcore}
                  onChange={(e) =>
                    setState((p) => ({
                      ...p,
                      settings: { ...p.settings, hardcore: e.target.checked },
                    }))
                  }
                  className="h-4 w-4"
                />
                <span className="text-sm font-semibold">{settings.hardcore ? "On" : "Off"}</span>
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
            <div className={cx("mt-2 text-xs", textMuted)}>Small multipliers keep progression hard (but rewarding).</div>
          </div>

          <div className={cx("rounded-2xl border p-4", border)}>
            <div className="text-sm font-extrabold">XP Debt + Punishments</div>
            <div className={cx("mt-1 text-xs", textMuted)}>
              When enabled, missed quests add XP debt and optional consequences.
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="text-sm font-semibold">Enable XP Debt</div>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.xpDebtEnabled}
                  onChange={(e) =>
                    setState((p) => ({
                      ...p,
                      settings: {
                        ...p.settings,
                        xpDebtEnabled: e.target.checked,
                        blockAfterBedtime: e.target.checked ? true : p.settings.blockAfterBedtime,
                      },
                    }))
                  }
                  className="h-4 w-4"
                />
                <span className="text-sm font-semibold">{settings.xpDebtEnabled ? "On" : "Off"}</span>
              </label>
            </div>

            {settings.xpDebtEnabled ? (
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold">Block quest completion after bedtime</div>
                    <div className={cx("mt-1 text-[11px]", textMuted)}>
                      After bedtime, quests cannot be marked complete until next day.
                    </div>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={settings.blockAfterBedtime}
                      onChange={(e) =>
                        setState((p) => ({
                          ...p,
                          settings: { ...p.settings, blockAfterBedtime: e.target.checked },
                        }))
                      }
                      className="h-4 w-4"
                    />
                    <span className="text-sm font-semibold">{settings.blockAfterBedtime ? "On" : "Off"}</span>
                  </label>
                </div>

                <div className={cx("rounded-xl border p-3", border)}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold">No-phone penalty</div>
                      <div className={cx("mt-1 text-[11px]", textMuted)}>
                        If you miss quests, you owe a no-phone session the next day.
                      </div>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={settings.noPhonePenaltyEnabled}
                        onChange={(e) =>
                          setState((p) => ({
                            ...p,
                            settings: { ...p.settings, noPhonePenaltyEnabled: e.target.checked },
                          }))
                        }
                        className="h-4 w-4"
                      />
                      <span className="text-sm font-semibold">{settings.noPhonePenaltyEnabled ? "On" : "Off"}</span>
                    </label>
                  </div>
                  {settings.noPhonePenaltyEnabled ? (
                    <div className="mt-3">
                      <div className={cx("text-xs font-semibold", textMuted)}>Duration</div>
                      <select
                        value={settings.noPhonePenaltyMinutes}
                        onChange={(e) =>
                          setState((p) => ({
                            ...p,
                            settings: { ...p.settings, noPhonePenaltyMinutes: Number(e.target.value) },
                          }))
                        }
                        className={cx(
                          "mt-1 w-full rounded-xl border p-2 text-sm",
                          isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                        )}
                      >
                        <option value={30}>30m</option>
                        <option value={60}>1h</option>
                        <option value={120}>2h</option>
                        <option value={180}>3h</option>
                        <option value={240}>4h</option>
                      </select>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className={cx("rounded-2xl border p-4", border)}>
            <div className="text-sm font-extrabold">Day</div>
            <div className={cx("mt-1 text-xs", textMuted)}>
              Configure your wake + bed times. Tasks must be completed inside this window to count.
            </div>
 
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
              Total active window: <span className="font-semibold">{totalWindowLabel}</span> hours to complete quests.
            </div>
            <div className={cx("mt-1 text-xs", textMuted)}>
              If bed time is earlier than wake time, it's treated as next day. Tasks completed outside the window do not count.
            </div>
          </div>

          <div className={cx("rounded-2xl border p-4", border)}>
            <div className="text-sm font-extrabold">Danger Zone</div>
            <div className={cx("mt-2 text-xs", textMuted)}>Reset wipes your progress and quests.</div>
            <div className="mt-3">
              <Button variant="danger" onClick={requestReset} isDark={isDark}>
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
  const [tab, setTab] = useState("home");
  const [state, setState] = useState(() => {
    const key = fmtDateKey(today());
    const savedRaw = safeJsonParse(localStorage.getItem(STORAGE_KEY) || "", null);
    const saved = migrateSavedState(savedRaw) || savedRaw;
    if (saved && typeof saved === "object") {
      const normalizedQuests = (saved.quests || DEFAULT_QUESTS).map((q) => {
        const createdAt = typeof q.createdAt === "number" ? q.createdAt : 0;
        return normalizeQuest({ ...q, createdAt });
      });
      const xpFromDays = {};
      for (const entry of Object.values(saved.days || {})) {
        if (!entry?.completed) continue;
        for (const [questId, info] of Object.entries(entry.completed)) {
          if (typeof info?.xp !== "number") continue;
          xpFromDays[questId] = (xpFromDays[questId] || 0) + info.xp;
        }
      }
      const quests = normalizedQuests.map((q) => {
        const xpCandidate = q.xp ? q.xp : xpFromDays[q.id] || 0;
        const pct = progressPct(q.currentTargetValue, q.sTargetValue);
        const cap = xpCapForRank(rankFromProgressPct(pct));
        return { ...q, xp: Math.min(xpCandidate, cap) };
      });
      const totalXP = quests.reduce((sum, q) => sum + (q.xp || 0), 0);
      const savedSettings = saved.settings || {};
      const themeMode = savedSettings.themeMode || savedSettings.theme || DEFAULT_SETTINGS.themeMode;
      const xpDebtEnabled =
        typeof savedSettings.xpDebtEnabled === "boolean"
          ? savedSettings.xpDebtEnabled
          : savedSettings.penaltyMode === "xp_debt"
          ? true
          : DEFAULT_SETTINGS.xpDebtEnabled;
      const blockAfterBedtime =
        typeof savedSettings.blockAfterBedtime === "boolean"
          ? savedSettings.blockAfterBedtime
          : xpDebtEnabled
          ? true
          : DEFAULT_SETTINGS.blockAfterBedtime;
      const noPhonePenaltyMinutes =
        typeof savedSettings.noPhonePenaltyMinutes === "number"
          ? savedSettings.noPhonePenaltyMinutes
          : DEFAULT_SETTINGS.noPhonePenaltyMinutes;
      const noPhonePenaltyEnabled =
        typeof savedSettings.noPhonePenaltyEnabled === "boolean"
          ? savedSettings.noPhonePenaltyEnabled
          : DEFAULT_SETTINGS.noPhonePenaltyEnabled;
      const days =
        saved.days && Object.keys(saved.days).length
          ? saved.days
          : { [key]: { completed: {}, earnedXP: 0, xpDebt: 0, note: "", debtApplied: false } };
      const xpByDay = saved.xpByDay
        ? { ...saved.xpByDay }
        : Object.fromEntries(Object.entries(days).map(([dayKey, entry]) => [dayKey, Number(entry?.earnedXP || 0)]));
      return {
        quests,
        totalXP,
        settings: {
          ...DEFAULT_SETTINGS,
          ...savedSettings,
          themeMode,
          xpDebtEnabled,
          blockAfterBedtime,
          noPhonePenaltyEnabled,
          noPhonePenaltyMinutes,
        },
        days,
        lastActiveDate: saved.lastActiveDate || key,
        cooldownUntil: saved.cooldownUntil || null,
        weeklyChallenge: saved.weeklyChallenge || null,
        mysteryBox: saved.mysteryBox || null,
        schemaVersion: SCHEMA_VERSION,
        xpByDay,
      };
    }
    return buildDefaultState();
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const scroller = document.scrollingElement;
    if (scroller) scroller.scrollTop = 0;
  }, [tab]);

  const settings = state.settings;
  const [playerProfile] = useState(() => {
    if (typeof window === "undefined") return null;
    return safeJsonParse(window.localStorage.getItem("playerProfile") || "", null);
  });
  const [playerPhoto, setPlayerPhoto] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("playerPhoto") || "";
  });
  const [joinDateKey] = useState(() => {
    if (typeof window === "undefined") return fmtDateKey(today());
    const stored = window.localStorage.getItem("joinDate");
    if (stored) return stored;
    const todayKey = fmtDateKey(today());
    window.localStorage.setItem("joinDate", todayKey);
    return todayKey;
  });
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [timerTick, setTimerTick] = useState(() => Date.now());
  const [toastMessage, setToastMessage] = useState("");
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return true;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const isDark =
    settings.themeMode === "dark" ? true : settings.themeMode === "light" ? false : systemPrefersDark;
  const dateKey = fmtDateKey(today());

  // Keep .dark class for external CSS compatibility
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [isDark]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setSystemPrefersDark(e.matches);
    if (mql.addEventListener) mql.addEventListener("change", handler);
    else mql.addListener(handler);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", handler);
      else mql.removeListener(handler);
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTimerTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!playerPhoto) return;
    window.localStorage.setItem("playerPhoto", playerPhoto);
  }, [playerPhoto]);

  useEffect(() => {
    if (!toastMessage) return undefined;
    const t = setTimeout(() => setToastMessage(""), 2400);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Ensure today's entry exists + handle missed days penalties
  useEffect(() => {
    setState((prev) => {
      const next = { ...prev, days: { ...prev.days } };

      if (!next.days[dateKey]) {
        next.days[dateKey] = { completed: {}, earnedXP: 0, xpDebt: 0, note: "", debtApplied: false };
      }

      if (next.lastActiveDate !== dateKey) {
        const last = new Date(next.lastActiveDate + "T00:00:00");
        const now = new Date(dateKey + "T00:00:00");
        const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));

        for (let i = 1; i < diffDays; i++) {
          const missedKey = fmtDateKey(addDays(last, i));
          if (!next.days[missedKey]) {
            next.days[missedKey] = { completed: {}, earnedXP: 0, xpDebt: 0, note: "(missed)", debtApplied: false };
          }

          const missed = next.days[missedKey];
          const anyDone = missed.earnedXP > 0 || Object.values(missed.completed || {}).some((x) => x?.done);
          if (!anyDone && next.settings.xpDebtEnabled) {
            missed.xpDebt = (missed.xpDebt || 0) + 50;
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

  const overallProgressPct = useMemo(() => {
    if (!state.quests.length) return 0;
    const sum = state.quests.reduce((acc, q) => acc + progressPct(q.currentTargetValue, q.sTargetValue), 0);
    return sum / state.quests.length;
  }, [state.quests]);
  const overallRank = useMemo(() => rankFromProgressPct(overallProgressPct), [overallProgressPct]);
  const overallProgressPctDisplay = Math.round(overallProgressPct * 100);
  const overallLevel = Math.max(1, overallProgressPctDisplay);
  const playerName = playerProfile?.name || "";
  const playerAge = computeAge(playerProfile?.dob);

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

  const todays = state.days[dateKey] || { completed: {}, earnedXP: 0, xpDebt: 0, note: "", debtApplied: false };
  const isWithinWindowNow = useMemo(
    () => isWithinDayWindow(settings, new Date(nowTick)),
    [settings.wakeTime, settings.bedTime, nowTick]
  );

  useEffect(() => {
    if (!settings.xpDebtEnabled) return;
    if (isWithinDayWindow(settings, new Date(nowTick))) return;

    setState((prev) => {
      const key = dateKey;
      const existing = prev.days[key] || { completed: {}, earnedXP: 0, xpDebt: 0, note: "", debtApplied: false };
      if (existing.debtApplied) return prev;
      const allDone = prev.quests.every((q) => existing.completed?.[q.id]?.done);
      const nextDay = {
        ...existing,
        debtApplied: true,
        xpDebt: allDone ? existing.xpDebt || 0 : Math.max(existing.xpDebt || 0, 50),
      };
      return { ...prev, days: { ...prev.days, [key]: nextDay } };
    });
  }, [settings.xpDebtEnabled, settings.wakeTime, settings.bedTime, nowTick, dateKey, state.quests]);

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
      .filter((q) => q.measurementType === "reps")
      .reduce((sum, q) => sum + (q.currentTargetValue || 0), 0);

    const dist = state.quests.find((q) => q.measurementType === "distance");
    const runTarget = dist ? Math.min(5, Math.round(dist.currentTargetValue * 1.5 * 10) / 10) : 1;

    return {
      id: bossKey,
      name: "Weekly Boss Raid",
      desc: `Complete a high-volume circuit (total reps ≈ ${totalReps}) + run ${runTarget} km`,
      baseXP: 220,
      tier: "Boss",
      kind: "boss",
      meta: { totalReps, runTarget },
    };
  }, [settings.weeklyBossEnabled, bossKey, state.quests]);

  const bossDone = useMemo(() => {
    if (!boss) return false;
    const entry = state.days[bossKey];
    return !!entry?.completed?.[boss.id]?.done;
  }, [state.days, boss, bossKey]);

  function resetAll() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("onboardingComplete", "false");
      window.localStorage.removeItem("playerPhoto");
      window.localStorage.removeItem("joinDate");
      window.location.reload();
      return;
    }
    setState(buildDefaultState());
    setTab("home");
  }

  function requestReset() {
    setResetModalOpen(true);
  }

  function toggleQuestDone(questId) {
    setState((prev) => {
      const key = dateKey;
      const day = prev.days[key] || { completed: {}, earnedXP: 0, xpDebt: 0, note: "", debtApplied: false };
      const was = !!day.completed?.[questId]?.done;

      const q = prev.quests.find((x) => x.id === questId);
      if (!q) return prev;

      const currentDone = { ...(day.completed || {}) };
      const prevAward = currentDone[questId]?.xp || 0;

      const pct = progressPct(q.currentTargetValue, q.sTargetValue);
      const rank = rankFromProgressPct(pct);
      const cap = xpCapForRank(rank);
      const baseXP = baseXPForRank(rank);
      const improvement = q.currentTargetValue > q.baselineValue;
      const improvementXP = improvement ? Math.round(baseXP * IMPROVEMENT_BONUS_MULT) : 0;
      const rawAward = Math.round((baseXP + improvementXP) * priorityMultiplier(q.priority));
      const remaining = Math.max(0, cap - (q.xp || 0));
      const award = Math.max(0, Math.min(rawAward, remaining));

      const earnedDelta = was ? -prevAward : award;
      let newDebt = day.xpDebt || 0;
      let credited = earnedDelta;
      if (earnedDelta > 0 && prev.settings.xpDebtEnabled && newDebt > 0) {
        const pay = Math.min(newDebt, earnedDelta);
        newDebt -= pay;
        credited -= pay;
      }
      const nextDone = !was;
      currentDone[questId] = { done: nextDone, xp: nextDone ? Math.max(0, credited) : 0 };

      const newDay = {
        ...day,
        completed: currentDone,
        earnedXP: Math.max(0, (day.earnedXP || 0) + credited),
        xpDebt: newDebt,
      };

      const updatedQuests = prev.quests.map((quest) => {
        if (quest.id !== questId) return quest;
        const nextXP = Math.max(0, (quest.xp || 0) + credited);
        const nextBaseline = !was && quest.currentTargetValue > quest.baselineValue ? quest.currentTargetValue : quest.baselineValue;
        const isTimed = questIsTimed(quest);
        if (!isTimed) {
          const nextStatus = !was ? "completed" : "idle";
          return { ...quest, xp: nextXP, baselineValue: nextBaseline, status: nextStatus, startedAt: null, elapsedMs: 0 };
        }
        const nextStatus = !was ? "completed" : "idle";
        const elapsedMs = !was
          ? quest.startedAt
            ? Math.max(0, Date.now() - quest.startedAt)
            : quest.elapsedMs || 0
          : 0;
        return {
          ...quest,
          xp: nextXP,
          baselineValue: nextBaseline,
          status: nextStatus,
          elapsedMs,
          startedAt: nextStatus === "completed" ? quest.startedAt : null,
        };
      });

      return {
        ...prev,
        quests: updatedQuests,
        totalXP: Math.max(0, prev.totalXP + credited),
        xpByDay: incrementXpByDay(prev.xpByDay, key, credited),
        days: { ...prev.days, [key]: newDay },
      };
    });
  }

  function startQuest(questId) {
    setState((prev) => ({
      ...prev,
      quests: prev.quests.map((q) => {
        if (q.id !== questId) return q;
        if (!questIsTimed(q)) return { ...q, status: "active", startedAt: null, elapsedMs: 0 };
        return { ...q, status: "active", startedAt: Date.now(), elapsedMs: 0 };
      }),
    }));
  }

  function pauseQuest(questId) {
    setState((prev) => ({
      ...prev,
      quests: prev.quests.map((q) => {
        if (q.id !== questId) return q;
        if (q.status !== "active") return q;
        if (!questIsTimed(q)) return { ...q, status: "paused" };
        const elapsedMs = q.startedAt ? Math.max(0, Date.now() - q.startedAt) : q.elapsedMs || 0;
        return { ...q, status: "paused", elapsedMs, startedAt: null };
      }),
    }));
  }

  function resumeQuest(questId) {
    setState((prev) => ({
      ...prev,
      quests: prev.quests.map((q) => {
        if (q.id !== questId) return q;
        if (q.status !== "paused") return q;
        if (!questIsTimed(q)) return { ...q, status: "active" };
        const elapsedMs = q.elapsedMs || 0;
        return { ...q, status: "active", startedAt: Date.now() - elapsedMs };
      }),
    }));
  }

  function completeQuest(questId) {
    const quest = state.quests.find((q) => q.id === questId);
    if (!quest) return;
    if (settings.blockAfterBedtime && !isWithinDayWindow(settings, new Date())) {
      setToastMessage("Outside your day window — completion won’t count.");
      return;
    }
    if (questIsTimed(quest)) {
      const elapsed = quest.startedAt ? Date.now() - quest.startedAt : quest.elapsedMs || 0;
      const limit = questTimerLimitMs(quest);
      if (limit && elapsed > limit) {
        setToastMessage("Timer ended — quest not accepted.");
        return;
      }
    }
    toggleQuestDone(questId);
  }

  function toggleBossDone() {
    if (!boss) return;

    setState((prev) => {
      const entry = prev.days[bossKey] || { completed: {}, earnedXP: 0, xpDebt: 0, note: "", debtApplied: false };
      const was = !!entry.completed?.[boss.id]?.done;
      const prevAward = entry.completed?.[boss.id]?.xp || 0;

      const base = boss.baseXP;
      const bossXP = base;
      const delta = was ? -prevAward : bossXP;

      const completed = { ...(entry.completed || {}) };
      completed[boss.id] = { done: !was, modifiers: ["Boss"], xp: !was ? bossXP : 0 };

      let newDebt = entry.xpDebt || 0;
      let credited = delta;
      if (delta > 0 && prev.settings.xpDebtEnabled && newDebt > 0) {
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
        xpByDay: incrementXpByDay(prev.xpByDay, dateKey, credited),
        days: { ...prev.days, [bossKey]: updated },
      };
    });
  }

  function attemptToggleBossDone() {
    if (settings.blockAfterBedtime && !isWithinDayWindow(settings, new Date())) {
      setToastMessage("Outside your day window — completion won’t count.");
      return;
    }
    toggleBossDone();
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
    const category = "body";
    const domain = "body";
    const activityKind = "strength";
    const measurementType = "reps";
    const unitType = unitTypeForMeasurement(measurementType);
    const unit = defaultUnitForMeasurement(measurementType);
    const currentTargetValue = 10;
    const createdAt = Date.now();
    setState((prev) => ({
      ...prev,
      quests: [
        {
          id,
          name: "New Quest",
          category,
          domain,
          activityKind,
          measurementType,
          unit,
          unitType,
          currentTargetValue,
          sTargetValue: defaultSTargetValue({ name: "New Quest", unitType, category }),
          baselineValue: currentTargetValue,
          priority: "main",
          xp: 0,
          frequency: "daily",
          daysOfWeek: defaultWeeklyDays(),
          createdAt,
          status: "idle",
          startedAt: null,
          elapsedMs: 0,
          targetMinutes: null,
          graceMinutes: 10,
        },
        ...prev.quests,
      ],
    }));
  }

  function deleteQuest(id) {
    setState((prev) => {
      const removed = prev.quests.find((q) => q.id === id);
      const removedXP = removed?.xp || 0;
      return {
        ...prev,
        totalXP: Math.max(0, prev.totalXP - removedXP),
        quests: prev.quests.filter((q) => q.id !== id),
      };
    });
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

    const categoryProgress = {
      body: { progressPct: 0, rank: "E" },
      mind: { progressPct: 0, rank: "E" },
      hobbies: { progressPct: 0, rank: "E" },
      life: { progressPct: 0, rank: "E" },
    };
    for (const category of QUEST_CATEGORIES) {
      const list = state.quests.filter((q) => q.category === category);
      if (!list.length) continue;
      const sum = list.reduce((acc, q) => acc + progressPct(q.currentTargetValue, q.sTargetValue), 0);
      const pct = sum / list.length;
      categoryProgress[category] = { progressPct: pct, rank: rankFromProgressPct(pct) };
    }

    return {
      totalDays,
      activeDays,
      compliance: totalDays ? Math.round((activeDays / totalDays) * 100) : 0,
      avgXP: activeDays ? Math.round(sumXP / activeDays) : 0,
      debt: state.days[dateKey]?.xpDebt || 0,
      questTotals,
      questDone,
      categoryProgress,
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
      <Header />

      {tab === "home" ? (
        <HomePanel
          dateKey={dateKey}
          settings={settings}
          playerName={playerName}
          playerAge={playerAge}
          playerPhoto={playerPhoto}
          onPhotoChange={setPlayerPhoto}
          onOpenSettings={() => setTab("settings")}
          overallRank={overallRank}
          totalXP={state.totalXP}
          state={state}
          setState={setState}
          joinDateKey={joinDateKey}
          calCursor={calCursor}
          setCalCursor={setCalCursor}
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
          dayModalOpen={dayModalOpen}
          setDayModalOpen={setDayModalOpen}
          modalDayKey={modalDayKey}
          setModalDayKey={setModalDayKey}
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
          dateKey={dateKey}
          state={state}
          todays={todays}
          settings={settings}
          boss={boss}
          bossDone={bossDone}
          toggleBossDone={attemptToggleBossDone}
          isWithinWindowNow={isWithinWindowNow}
          timerTick={timerTick}
          onQuestStart={startQuest}
          onQuestPause={pauseQuest}
          onQuestResume={resumeQuest}
          onQuestComplete={completeQuest}
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
      {tab === "do-different" ? (
        <DoDifferent
          state={state}
          setState={setState}
          settings={settings}
          dateKey={dateKey}
          nowTick={nowTick}
          isDark={isDark}
          border={border}
          surface={surface}
          textMuted={textMuted}
        />
      ) : null}
      {tab === "stats" ? (
        <StatsPanel
          dateKey={dateKey}
          state={state}
          stats={stats}
          overallRank={overallRank}
          overallLevel={overallLevel}
          streakDays={streakDays}
          overallProgressPctDisplay={overallProgressPctDisplay}
          isDark={isDark}
          border={border}
          surface={surface}
          textMuted={textMuted}
        />
      ) : null}
      {tab === "settings" ? (
        <SettingsPanel
          settings={settings}
          isDark={isDark}
          border={border}
          surface={surface}
          textMuted={textMuted}
          requestReset={requestReset}
          setWeeklyBossEnabled={setWeeklyBossEnabled}
          setState={setState}
        />
      ) : null}

      <Modal
        open={resetModalOpen}
        title="Reset Progress?"
        onClose={() => setResetModalOpen(false)}
        isDark={isDark}
        border={border}
        surface={surface}
        textMuted={textMuted}
        showClose={false}
        showHint={false}
      >
        <div className="space-y-4">
          <div className={cx("text-sm", textMuted)}>
            This will delete all quests, XP, ranks, settings, and history. You will have to start over.
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setResetModalOpen(false)} isDark={isDark}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setResetModalOpen(false);
                resetAll();
              }}
              isDark={isDark}
            >
              Delete Everything
            </Button>
          </div>
        </div>
      </Modal>

      <Toast message={toastMessage} isDark={isDark} />

      <BottomTabs tab={tab} setTab={setTab} isDark={isDark} />
    </Shell>
  );
}

// -----------------------------
// Tiny sanity tests (dev-only)
// -----------------------------
function runSanityTests() {
  // Rank thresholds
  {
    console.assert(rankFromProgressPct(0.05) === "E", "Progress 5% should be E");
    console.assert(rankFromProgressPct(0.35) === "D", "Progress 35% should be D");
    console.assert(rankFromProgressPct(0.6) === "B", "Progress 60% should be B");
    console.assert(rankFromProgressPct(0.92) === "S", "Progress 92% should be S");
  }

  // Date + month matrix
  {
    const d = new Date("2026-01-16T12:00:00");
    console.assert(fmtDateKey(d) === "2026-01-16", "fmtDateKey should format YYYY-MM-DD");

    const weeks = monthMatrix(2026, 0);
    console.assert(Array.isArray(weeks) && weeks.length === 6, "monthMatrix should return 6 weeks");
    console.assert(weeks.every((w) => w.length === 7), "Each week should have 7 days");
  }

  // XP cap sanity
  {
    console.assert(xpCapForRank("E") > 0, "XP cap should be positive");
    console.assert(baseXPForRank("A") > baseXPForRank("E"), "Higher ranks should have higher base XP");
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
