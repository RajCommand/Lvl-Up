import React, { useEffect, useMemo } from "react";
import { Sparkles } from "lucide-react";
import { normalizeMeasurementType } from "./taxonomy";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

const RANK_THRESHOLDS = [
  { rank: "E", min: 0.0, max: 0.19 },
  { rank: "D", min: 0.2, max: 0.39 },
  { rank: "C", min: 0.4, max: 0.59 },
  { rank: "B", min: 0.6, max: 0.74 },
  { rank: "A", min: 0.75, max: 0.89 },
  { rank: "S", min: 0.9, max: 1.0 },
];

const BASE_XP_BY_RANK = {
  E: 40,
  D: 60,
  C: 85,
  B: 115,
  A: 150,
  S: 200,
};

const RANK_ORDER = ["E", "D", "C", "B", "A", "S"];

const TIER_MULTIPLIERS = {
  "E->D": 2,
  "D->C": 2.25,
  "C->B": 2.5,
  "B->A": 3,
  "A->S": 4,
  "S->S": 3,
};

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function parseTimeToMinutes(str) {
  if (!str || typeof str !== "string") return 8 * 60;
  const [hRaw, mRaw] = str.split(":");
  const h = clamp(Number(hRaw || 0), 0, 23);
  const m = clamp(Number(mRaw || 0), 0, 59);
  return h * 60 + m;
}

function progressPct(currentTargetValue, sTargetValue) {
  if (!sTargetValue || sTargetValue <= 0) return 0;
  return clamp(currentTargetValue / sTargetValue, 0, 1);
}

function rankFromProgressPct(pct) {
  const entry = RANK_THRESHOLDS.find((r) => pct >= r.min && pct <= r.max);
  return entry ? entry.rank : "E";
}

function baseXPForRank(rank) {
  return BASE_XP_BY_RANK[rank] || BASE_XP_BY_RANK.E;
}

function questMeasurementType(q) {
  return normalizeMeasurementType(q?.measurementType, q?.unitType);
}

function questUnitLabel(q, measurementType) {
  if (!q || measurementType === "habit") return "";
  if (q.unit) return q.unit;
  if (measurementType === "time") return "min";
  if (measurementType === "distance") return "km";
  if (measurementType === "count") return "x";
  return "reps";
}

function templateAllows(template, measurementType, activityKind) {
  if (!template.allowedMeasurementTypes?.includes(measurementType)) return false;
  if (template.allowedActivityKinds && !template.allowedActivityKinds.includes(activityKind)) return false;
  return true;
}

function templateTextValid(text, measurementType) {
  if (measurementType === "time" || measurementType === "distance") {
    return !/\b(reps?|sets?|\d+x)\b/i.test(text);
  }
  return true;
}

function incrementXpByDay(map, key, delta) {
  const next = { ...(map || {}) };
  const prevVal = Number(next[key] || 0);
  const updated = prevVal + delta;
  next[key] = Math.max(0, updated);
  return next;
}

function getWeeklyWindow(now, wakeTime) {
  const wakeMinutes = parseTimeToMinutes(wakeTime || "08:00");
  const base = new Date(now);
  const day = base.getDay();
  const mondayOffset = (day + 6) % 7;
  const start = new Date(base);
  start.setDate(base.getDate() - mondayOffset);
  start.setHours(Math.floor(wakeMinutes / 60), wakeMinutes % 60, 0, 0);
  if (now < start) start.setDate(start.getDate() - 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

function getDailyWindow(now, wakeTime) {
  const wakeMinutes = parseTimeToMinutes(wakeTime || "08:00");
  const start = new Date(now);
  start.setHours(Math.floor(wakeMinutes / 60), wakeMinutes % 60, 0, 0);
  if (now < start) start.setDate(start.getDate() - 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start, end };
}

function formatEndsIn(nowMs, endMs) {
  const remaining = Math.max(0, endMs - nowMs);
  const totalHours = Math.floor(remaining / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `Ends in ${days}d ${hours}h`;
  const minutes = Math.floor((remaining / (1000 * 60)) % 60);
  if (hours > 0) return `Ends in ${hours}h ${minutes}m`;
  return `Ends in ${minutes}m`;
}

function formatResetsIn(nowMs, endMs) {
  const remaining = Math.max(0, endMs - nowMs);
  const totalHours = Math.floor(remaining / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = Math.floor((remaining / (1000 * 60)) % 60);
  if (days > 0) return `Resets in ${days}d ${hours}h`;
  if (hours > 0) return `Resets in ${hours}h ${minutes}m`;
  return `Resets in ${minutes}m`;
}

function nextRank(rank) {
  const idx = RANK_ORDER.indexOf(rank);
  if (idx < 0 || idx >= RANK_ORDER.length - 1) return null;
  return RANK_ORDER[idx + 1];
}

function roundTarget(value, unitType) {
  if (unitType === "distance") return Math.round(value * 10) / 10;
  return Math.max(1, Math.round(value));
}

function buildWeeklyChallenge({ quests, settings, windowStartMs, windowEndMs }) {
  const eligible = quests.filter((q) => q && q.name);
  if (!eligible.length) return null;
  const chosen = eligible[Math.floor(Math.random() * eligible.length)];
  const measurementType = questMeasurementType(chosen);
  const sTargetValue = Number.isFinite(chosen.sTargetValue) ? chosen.sTargetValue : chosen.currentTargetValue || 1;
  const currentTargetValue = Number.isFinite(chosen.currentTargetValue) ? chosen.currentTargetValue : 1;
  const pct = progressPct(currentTargetValue, sTargetValue);
  const rank = rankFromProgressPct(pct);
  const bumpRank = nextRank(rank);
  const bumpKey = bumpRank ? `${rank}->${bumpRank}` : "S->S";
  const multiplier = TIER_MULTIPLIERS[bumpKey] || 3;
  const baseXP = baseXPForRank(rank);

  let target = null;
  let targetText = "";
  let targetMeta = {};
  const isQuant = ["reps", "time", "distance", "count"].includes(measurementType);
  const atCap = currentTargetValue >= sTargetValue || !bumpRank || measurementType === "habit";

  if (isQuant && !atCap) {
    const nextThreshold = RANK_THRESHOLDS.find((r) => r.rank === bumpRank) || RANK_THRESHOLDS[RANK_THRESHOLDS.length - 1];
    let nextTarget = sTargetValue * nextThreshold.min;
    nextTarget = roundTarget(nextTarget, measurementType === "distance" ? "distance" : "reps");
    if (nextTarget <= currentTargetValue) {
      nextTarget = roundTarget(currentTargetValue + (measurementType === "distance" ? 0.1 : 1), measurementType === "distance" ? "distance" : "reps");
    }
    target = Math.min(sTargetValue, nextTarget);
    targetText = `${target} ${questUnitLabel(chosen, measurementType)}`;
    targetMeta = { type: "quantity", value: target, measurementType };
  } else {
    const requiredDays = 3;
    targetText = `Complete on ${requiredDays} days this week`;
    targetMeta = { type: "constraint", requiredDays };
  }

  const xpReward = Math.round(baseXP * multiplier);
  const wakeTime = settings?.wakeTime || "08:00";

  return {
    id: `wc_${windowStartMs}`,
    createdAt: windowStartMs,
    expiresAt: windowEndMs,
    taskId: chosen.id,
    title: chosen.name,
    target: targetText,
    xpReward,
    status: "active",
    meta: {
      measurementType,
      sTargetValue,
      currentTargetValue,
      rank,
      bumpRank: bumpRank || "S",
      multiplier,
      wakeTime,
      ...targetMeta,
    },
  };
}

function pickTemplate(templates) {
  return templates[Math.floor(Math.random() * templates.length)];
}

function buildMysteryBox({ quests, settings, windowStart, windowEnd }) {
  const eligible = quests.filter((q) => q && q.name);
  if (!eligible.length) return null;
  const chosen = eligible[Math.floor(Math.random() * eligible.length)];
  const measurementType = questMeasurementType(chosen);
  const activityKind = String(chosen.activityKind || "").toLowerCase();
  const isQuant = ["reps", "time", "distance"].includes(measurementType);
  const sTargetValue = Number.isFinite(chosen.sTargetValue) ? chosen.sTargetValue : chosen.currentTargetValue || 1;
  const currentTargetValue = Number.isFinite(chosen.currentTargetValue) ? chosen.currentTargetValue : 1;
  const pct = progressPct(currentTargetValue, sTargetValue);
  const rank = rankFromProgressPct(pct);
  const baseXP = baseXPForRank(rank);

  const quantTemplates = [
    {
      id: "tempo",
      multiplier: 1.35,
      allowedMeasurementTypes: ["reps"],
      build: () => ({
        text: `${chosen.name}: ${currentTargetValue} ${questUnitLabel(chosen, measurementType)} with a 3s down, 1s up tempo`,
        meta: { tempo: "3-1" },
      }),
    },
    {
      id: "sets",
      multiplier: 1.4,
      allowedMeasurementTypes: ["reps"],
      build: () => {
        const sets = 3;
        const perSet = Math.max(1, Math.ceil(currentTargetValue / sets));
        return {
          text: `${chosen.name}: ${sets} sets of ${perSet} (${questUnitLabel(chosen, measurementType)}), 60s rest`,
          meta: { sets, perSet },
        };
      },
    },
    {
      id: "ladder",
      multiplier: 1.5,
      allowedMeasurementTypes: ["reps"],
      build: () => {
        const top = clamp(Math.round(currentTargetValue / 3), 3, 6);
        return {
          text: `${chosen.name}: ladder 1-${top} then back to 1`,
          meta: { top },
        };
      },
    },
    {
      id: "timebox",
      multiplier: 1.6,
      allowedMeasurementTypes: ["reps", "time", "distance"],
      build: () => {
        const windowMin = measurementType === "time" ? Math.max(10, Math.round(currentTargetValue * 1.2)) : 12;
        return {
          text: `${chosen.name}: finish within ${windowMin} min`,
          meta: { windowMin },
        };
      },
    },
    {
      id: "no-music",
      multiplier: 1.25,
      allowedMeasurementTypes: ["reps", "time", "distance"],
      build: () => ({
        text: `${chosen.name}: complete with no music or headphones`,
        meta: { noMusic: true },
      }),
    },
    {
      id: "perfect-form",
      multiplier: 1.35,
      allowedMeasurementTypes: ["reps"],
      build: () => ({
        text: `${chosen.name}: strict form only (self-check each rep)`,
        meta: { strictForm: true },
      }),
    },
    {
      id: "pause-reps",
      multiplier: 1.45,
      allowedMeasurementTypes: ["reps"],
      build: () => ({
        text: `${chosen.name}: add a 2s pause at the hardest point each rep`,
        meta: { pauseSeconds: 2 },
      }),
    },
    {
      id: "even-odd",
      multiplier: 1.3,
      allowedMeasurementTypes: ["reps"],
      build: () => ({
        text: `${chosen.name}: alternate slow/fast reps (odd slow, even fast)`,
        meta: { pattern: "odd-slow-even-fast" },
      }),
    },
  ];

  const constraintTemplates = [
    {
      id: "streak-blocks",
      multiplier: 1.45,
      allowedMeasurementTypes: ["habit", "time", "count", "distance", "reps"],
      build: () => ({
        text: `${chosen.name}: complete ${3} blocks today`,
        meta: { blocks: 3 },
      }),
    },
    {
      id: "timing-window",
      multiplier: 1.35,
      allowedMeasurementTypes: ["habit", "time", "count", "distance", "reps"],
      build: () => ({
        text: `${chosen.name}: do it within your first waking hour`,
        meta: { timing: "first-hour" },
      }),
    },
    {
      id: "environment",
      multiplier: 1.3,
      allowedMeasurementTypes: ["habit", "time", "count", "distance", "reps"],
      build: () => ({
        text: `${chosen.name}: complete during meals only`,
        meta: { environment: "meals" },
      }),
    },
    {
      id: "replacement",
      multiplier: 1.5,
      allowedMeasurementTypes: ["habit", "time", "count"],
      build: () => ({
        text: `${chosen.name}: replace with one healthy alternative action`,
        meta: { replacement: true },
      }),
    },
    {
      id: "double-down",
      multiplier: 1.6,
      allowedMeasurementTypes: ["habit", "time", "count", "distance", "reps"],
      build: () => ({
        text: `${chosen.name}: complete + 5 minutes of reflection`,
        meta: { reflectionMinutes: 5 },
      }),
    },
  ];

  const pool = (isQuant ? quantTemplates : constraintTemplates).filter((t) =>
    templateAllows(t, measurementType, activityKind)
  );
  const fallbackPool = constraintTemplates.filter((t) => templateAllows(t, measurementType, activityKind));
  const selectionPool = pool.length ? pool : fallbackPool;
  let template = pickTemplate(selectionPool.length ? selectionPool : constraintTemplates);
  let result = template.build();
  if (!templateTextValid(result.text, measurementType)) {
    const safeTemplate = fallbackPool.find((t) => {
      const preview = t.build();
      return templateTextValid(preview.text, measurementType);
    });
    if (safeTemplate) {
      template = safeTemplate;
      result = safeTemplate.build();
    }
  }
  const xpReward = Math.round(baseXP * template.multiplier);

  return {
    id: `mb_${windowStart.toISOString()}`,
    createdAt: windowStart.toISOString(),
    expiresAt: windowEnd.toISOString(),
    status: "active",
    isRevealed: false,
    rerollUsed: false,
    baseTaskId: chosen.id,
    title: "Mystery Box Challenge",
    descriptionHidden: "Reveal to see today’s twist",
    descriptionRevealed: result.text,
    xpReward,
    templateId: template.id,
    metadata: {
      measurementType,
      activityKind,
      rank,
      currentTargetValue,
      sTargetValue,
      wakeTime: settings?.wakeTime || "08:00",
      ...result.meta,
    },
  };
}

export default function DoDifferent({
  state,
  setState,
  settings,
  dateKey,
  nowTick,
  isDark,
  border,
  surface,
  textMuted,
}) {
  const nowMs = useMemo(() => (typeof nowTick === "number" ? nowTick : Date.now()), [nowTick]);
  const { start, end } = useMemo(() => getWeeklyWindow(new Date(nowMs), settings?.wakeTime), [nowMs, settings?.wakeTime]);
  const { start: dailyStart, end: dailyEnd } = useMemo(
    () => getDailyWindow(new Date(nowMs), settings?.wakeTime),
    [nowMs, settings?.wakeTime]
  );

  useEffect(() => {
    setState((prev) => {
      const existing = prev.weeklyChallenge;
      const startMs = start.getTime();
      const endMs = end.getTime();
      const shouldReplace =
        !existing || existing.expiresAt <= nowMs || existing.createdAt < startMs || existing.createdAt >= endMs;
      if (!shouldReplace) return prev;

      const next = buildWeeklyChallenge({
        quests: prev.quests || [],
        settings: prev.settings,
        windowStartMs: startMs,
        windowEndMs: endMs,
      });

      if (!next) {
        if (!existing || existing.expiresAt <= nowMs) {
          return { ...prev, weeklyChallenge: existing ? { ...existing, status: "expired" } : null };
        }
        return prev;
      }

      return { ...prev, weeklyChallenge: next };
    });
  }, [setState, start, end, nowMs]);

  useEffect(() => {
    setState((prev) => {
      const existing = prev.mysteryBox;
      const startIso = dailyStart.toISOString();
      const endIso = dailyEnd.toISOString();
      const nowIso = new Date(nowMs).toISOString();
      const expiresAt = existing?.expiresAt || "";
      const createdAt = existing?.createdAt || "";
      const isExpired = expiresAt && expiresAt <= nowIso;
      const outOfWindow = createdAt && (createdAt < startIso || createdAt >= endIso);
      const shouldReplace = !existing || isExpired || outOfWindow;
      if (!shouldReplace) return prev;

      const next = buildMysteryBox({
        quests: prev.quests || [],
        settings: prev.settings,
        windowStart: dailyStart,
        windowEnd: dailyEnd,
      });

      if (!next) {
        if (!existing || isExpired) {
          return { ...prev, mysteryBox: existing ? { ...existing, status: "expired" } : null };
        }
        return prev;
      }

      return { ...prev, mysteryBox: next };
    });
  }, [setState, dailyStart, dailyEnd, nowMs]);

  const challenge = state.weeklyChallenge;
  const status = challenge?.status || "active";
  const isExpired = challenge && nowMs >= challenge.expiresAt && status !== "completed";
  const statusLabel = status === "completed" ? "Completed" : isExpired ? "Expired" : "Active";
  const badgeTone =
    statusLabel === "Completed" ? (isDark ? "bg-emerald-900/40 text-emerald-200" : "bg-emerald-100 text-emerald-800") : statusLabel === "Expired"
      ? isDark
        ? "bg-zinc-800 text-zinc-200"
        : "bg-zinc-100 text-zinc-600"
      : isDark
      ? "bg-violet-900/40 text-violet-200"
      : "bg-violet-100 text-violet-800";

  const endsLabel = challenge ? formatEndsIn(nowMs, challenge.expiresAt) : "";

  const mystery = state.mysteryBox;
  const mysteryExpiresAtMs = mystery?.expiresAt ? new Date(mystery.expiresAt).getTime() : 0;
  const mysteryExpired = mystery && nowMs >= mysteryExpiresAtMs && mystery.status !== "completed";
  const mysteryStatusLabel =
    mystery?.status === "completed" ? "Completed" : mysteryExpired ? "Expired" : "Active";
  const mysteryBadgeTone =
    mysteryStatusLabel === "Completed"
      ? isDark
        ? "bg-emerald-900/40 text-emerald-200"
        : "bg-emerald-100 text-emerald-800"
      : mysteryStatusLabel === "Expired"
      ? isDark
        ? "bg-zinc-800 text-zinc-200"
        : "bg-zinc-100 text-zinc-600"
      : isDark
      ? "bg-violet-900/40 text-violet-200"
      : "bg-violet-100 text-violet-800";
  const resetsLabel = mystery ? formatResetsIn(nowMs, mysteryExpiresAtMs) : "";

  const handleReveal = () => {
    if (!mystery || mystery.isRevealed || mysteryStatusLabel !== "Active") return;
    setState((prev) => ({
      ...prev,
      mysteryBox: { ...prev.mysteryBox, isRevealed: true },
    }));
  };

  const handleReroll = () => {
    if (!mystery || mystery.rerollUsed || mysteryStatusLabel !== "Active") return;
    setState((prev) => {
      const next = buildMysteryBox({
        quests: prev.quests || [],
        settings: prev.settings,
        windowStart: dailyStart,
        windowEnd: dailyEnd,
      });
      if (!next) return prev;
      return {
        ...prev,
        mysteryBox: {
          ...next,
          rerollUsed: true,
          isRevealed: prev.mysteryBox?.isRevealed || false,
        },
      };
    });
  };

  const handleCompleteMystery = () => {
    if (!mystery || mysteryStatusLabel !== "Active") return;
    if (nowMs >= mysteryExpiresAtMs) return;
    setState((prev) => {
      const current = prev.mysteryBox;
      if (!current || current.status !== "active") return prev;
      const day = prev.days[dateKey] || { completed: {}, earnedXP: 0, xpDebt: 0, note: "", debtApplied: false };
      let credited = current.xpReward || 0;
      let newDebt = day.xpDebt || 0;
      if (credited > 0 && prev.settings.xpDebtEnabled && newDebt > 0) {
        const pay = Math.min(newDebt, credited);
        newDebt -= pay;
        credited -= pay;
      }
      const updatedDay = {
        ...day,
        earnedXP: Math.max(0, (day.earnedXP || 0) + credited),
        xpDebt: newDebt,
      };
      return {
        ...prev,
        totalXP: Math.max(0, prev.totalXP + credited),
        xpByDay: incrementXpByDay(prev.xpByDay, dateKey, credited),
        days: { ...prev.days, [dateKey]: updatedDay },
        mysteryBox: {
          ...current,
          status: "completed",
          completedAt: new Date().toISOString(),
        },
      };
    });
  };

  const handleComplete = () => {
    if (!challenge || challenge.status !== "active") return;
    if (nowMs >= challenge.expiresAt) return;

    setState((prev) => {
      const current = prev.weeklyChallenge;
      if (!current || current.status !== "active") return prev;
      const day = prev.days[dateKey] || { completed: {}, earnedXP: 0, xpDebt: 0, note: "", debtApplied: false };
      let credited = current.xpReward || 0;
      let newDebt = day.xpDebt || 0;
      if (credited > 0 && prev.settings.xpDebtEnabled && newDebt > 0) {
        const pay = Math.min(newDebt, credited);
        newDebt -= pay;
        credited -= pay;
      }
      const updatedDay = {
        ...day,
        earnedXP: Math.max(0, (day.earnedXP || 0) + credited),
        xpDebt: newDebt,
      };
      return {
        ...prev,
        totalXP: Math.max(0, prev.totalXP + credited),
        xpByDay: incrementXpByDay(prev.xpByDay, dateKey, credited),
        days: { ...prev.days, [dateKey]: updatedDay },
        weeklyChallenge: {
          ...current,
          status: "completed",
          completedAt: Date.now(),
        },
      };
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-extrabold">Do Different</div>
        <div className={cx("mt-1 text-sm", textMuted)}>One weekly challenge. Big XP.</div>
        <div className="mt-2 h-1 w-14 rounded-full bg-violet-500/70" />
      </div>

      <div className={cx("rounded-2xl border p-4 shadow-sm", border, surface)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-extrabold">
              <Sparkles className={cx("h-5 w-5", isDark ? "text-violet-300" : "text-violet-600")} />
              <span>Weekly Challenge</span>
            </div>
            <div className={cx("mt-1 text-xs", textMuted)}>
              {challenge ? `Based on ${challenge.title}` : "Add quests to generate your weekly challenge."}
            </div>
          </div>
          <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", badgeTone)}>
            {statusLabel}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {challenge ? (
            <>
              <div className={cx("rounded-xl border p-3", border)}>
                <div className={cx("text-xs font-semibold uppercase tracking-[0.2em]", textMuted)}>Target</div>
                <div className="mt-2 text-base font-extrabold">
                  {challenge.title}: {challenge.target}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className={cx("rounded-xl border px-3 py-2 text-sm font-bold", border)}>
                  +{challenge.xpReward} XP
                </div>
                <div className={cx("text-xs font-semibold", textMuted)}>{endsLabel}</div>
              </div>
            </>
          ) : (
            <div className={cx("rounded-xl border p-3 text-sm", border)}>
              <div className={cx("text-xs", textMuted)}>No weekly challenge yet. Add a quest to generate one.</div>
            </div>
          )}
        </div>

        {challenge ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={handleComplete}
              disabled={statusLabel !== "Active"}
              className={cx(
                "inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
                statusLabel === "Active"
                  ? isDark
                    ? "bg-zinc-100 text-zinc-900 hover:bg-white"
                    : "bg-zinc-900 text-white hover:bg-zinc-800"
                  : isDark
                  ? "border border-zinc-800 bg-zinc-900 text-zinc-400"
                  : "border border-zinc-200 bg-white text-zinc-500"
              )}
            >
              Complete Weekly Challenge
            </button>
          </div>
        ) : null}
      </div>

      <div className={cx("rounded-2xl border p-4 shadow-sm", border, surface)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-extrabold">
              <Sparkles className={cx("h-5 w-5", isDark ? "text-violet-300" : "text-violet-600")} />
              <span>Mystery Box</span>
            </div>
            <div className={cx("mt-1 text-xs", textMuted)}>
              A twist based on your quests. Optional. Bonus XP.
            </div>
          </div>
          {mystery ? (
            <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", mysteryBadgeTone)}>
              {mysteryStatusLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-4 space-y-3">
          {!mystery ? (
            <div className={cx("rounded-xl border p-3 text-sm", border)}>
              <div className={cx("text-xs", textMuted)}>No mystery box yet. Add a quest to generate one.</div>
            </div>
          ) : mystery.isRevealed ? (
            <>
              <div className={cx("rounded-xl border p-3", border)}>
                <div className={cx("text-xs font-semibold uppercase tracking-[0.2em]", textMuted)}>Today’s Twist</div>
                <div className="mt-2 text-base font-extrabold">{mystery.descriptionRevealed}</div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className={cx("rounded-xl border px-3 py-2 text-sm font-bold", border)}>
                  +{mystery.xpReward} XP
                </div>
                <div className={cx("text-xs font-semibold", textMuted)}>{resetsLabel}</div>
                {mystery.rerollUsed ? (
                  <div className={cx("text-xs font-semibold", textMuted)}>Reroll used</div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className={cx("rounded-xl border p-3 text-sm", border)}>
                <div className={cx("text-xs font-semibold uppercase tracking-[0.2em]", textMuted)}>Mystery</div>
                <div className="mt-2 text-base font-extrabold blur-sm">??? ??? ???</div>
                <div className={cx("mt-1 text-xs", textMuted)}>{mystery.descriptionHidden}</div>
              </div>
              <div className={cx("text-xs font-semibold", textMuted)}>{resetsLabel}</div>
            </>
          )}
        </div>

        {mystery ? (
          <div className="mt-4 grid gap-2">
            {!mystery.isRevealed ? (
              <button
                type="button"
                onClick={handleReveal}
                disabled={mysteryStatusLabel !== "Active"}
                className={cx(
                  "inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
                  mysteryStatusLabel === "Active"
                    ? isDark
                      ? "bg-zinc-100 text-zinc-900 hover:bg-white"
                      : "bg-zinc-900 text-white hover:bg-zinc-800"
                    : isDark
                    ? "border border-zinc-800 bg-zinc-900 text-zinc-400"
                    : "border border-zinc-200 bg-white text-zinc-500"
                )}
              >
                Reveal
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCompleteMystery}
                disabled={mysteryStatusLabel !== "Active"}
                className={cx(
                  "inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
                  mysteryStatusLabel === "Active"
                    ? isDark
                      ? "bg-zinc-100 text-zinc-900 hover:bg-white"
                      : "bg-zinc-900 text-white hover:bg-zinc-800"
                    : isDark
                    ? "border border-zinc-800 bg-zinc-900 text-zinc-400"
                    : "border border-zinc-200 bg-white text-zinc-500"
                )}
              >
                Complete Mystery
              </button>
            )}
            {!mystery.rerollUsed ? (
              <button
                type="button"
                onClick={handleReroll}
                disabled={mysteryStatusLabel !== "Active"}
                className={cx(
                  "inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
                  isDark
                    ? "border border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                )}
              >
                Reroll
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
