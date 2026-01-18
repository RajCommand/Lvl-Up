import React, { useMemo, useState } from "react";
import { CATEGORY_OPTIONS, TASK_TEMPLATES } from "./onboarding/taskTemplates.js";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function unitLabel(unitType) {
  if (unitType === "distance") return "km";
  if (unitType === "minutes") return "min";
  return "reps";
}

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(1);
  const [playerName, setPlayerName] = useState("");
  const [dob, setDob] = useState("");
  const [selectedCategories, setSelectedCategories] = useState(() => new Set());
  const [selectedTasks, setSelectedTasks] = useState(() => new Set());
  const [taskConfig, setTaskConfig] = useState({});

  const stepsTotal = 6;
  const isDark = typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;

  const selectedTaskList = useMemo(() => {
    const tasks = [];
    for (const cat of selectedCategories) {
      const templates = TASK_TEMPLATES[cat] || [];
      for (const t of templates) {
        if (selectedTasks.has(t.id)) {
          tasks.push({ ...t, category: cat });
        }
      }
    }
    return tasks;
  }, [selectedCategories, selectedTasks]);

  const canProceed = useMemo(() => {
    if (step === 2) return playerName.trim().length > 0;
    if (step === 3) return dob.trim().length > 0;
    if (step === 4) return selectedCategories.size > 0;
    if (step === 5) return selectedTaskList.length > 0;
    return true;
  }, [step, playerName, dob, selectedCategories, selectedTaskList]);

  function toggleCategory(id) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTask(id) {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateTaskConfig(id, field, value) {
    setTaskConfig((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  }

  function handleNext() {
    if (step < stepsTotal) {
      setStep((s) => s + 1);
      return;
    }
    const createdAt = Date.now();
    const quests = selectedTaskList.map((t, idx) => {
      const cfg = taskConfig[t.id] || {};
      const currentTargetValue = Number(cfg.currentTargetValue ?? t.current ?? 1);
      const sTargetValue = Number(cfg.sTargetValue ?? t.s ?? currentTargetValue);
      return {
        id: `q_${t.id}_${createdAt + idx}`,
        name: t.name,
        category: t.category,
        unitType: t.unitType,
        currentTargetValue,
        sTargetValue,
        baselineValue: currentTargetValue,
        priority: "main",
        xp: 0,
        createdAt: createdAt + idx,
      };
    });
    onComplete({
      profile: { name: playerName.trim(), dob },
      categories: Array.from(selectedCategories),
      quests,
    });
  }

  function handleBack() {
    if (step > 1) setStep((s) => s - 1);
  }

  return (
    <div className={cx("min-h-screen", isDark ? "bg-zinc-950 text-zinc-50" : "bg-zinc-50 text-zinc-900")}>
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-8">
        <div className="flex items-center justify-between">
          <div className={cx("text-xs font-semibold uppercase tracking-[0.2em]", isDark ? "text-zinc-400" : "text-zinc-600")}>
            Onboarding
          </div>
          <div className={cx("text-xs", isDark ? "text-zinc-400" : "text-zinc-600")}>
            Step {step} of {stepsTotal}
          </div>
        </div>

        <div className="mt-2 flex gap-2">
          {Array.from({ length: stepsTotal }).map((_, idx) => (
            <div
              key={idx}
              className={cx(
                "h-1.5 flex-1 rounded-full",
                idx + 1 <= step ? (isDark ? "bg-zinc-100" : "bg-zinc-900") : isDark ? "bg-zinc-800" : "bg-zinc-200"
              )}
            />
          ))}
        </div>

        <div className={cx("mt-6 rounded-2xl border p-5 shadow-sm", isDark ? "border-zinc-800 bg-zinc-900" : "border-zinc-200 bg-white")}>
          {step === 1 ? (
            <div className="space-y-3">
              <div className="text-2xl font-black">Welcome to Level Up</div>
              <div className={cx("text-sm", isDark ? "text-zinc-300" : "text-zinc-600")}>
                Turn habits into quests. Progress by leveling up.
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <div className="text-lg font-extrabold">Your Name</div>
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className={cx(
                  "mt-1 w-full rounded-xl border p-3 text-sm",
                  isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                )}
                placeholder="Your name"
              />
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              <div className="text-lg font-extrabold">Date of Birth</div>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className={cx(
                  "mt-1 w-full rounded-xl border p-3 text-sm",
                  isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                )}
              />
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <div className="text-lg font-extrabold">Choose Categories</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {CATEGORY_OPTIONS.map((cat) => {
                  const active = selectedCategories.has(cat.id);
                  return (
                    <button
                      key={cat.id}
                      onClick={() => toggleCategory(cat.id)}
                      className={cx(
                        "rounded-2xl border p-4 text-left transition",
                        active
                          ? isDark
                            ? "border-zinc-100 bg-zinc-900 text-zinc-50"
                            : "border-zinc-900 bg-zinc-900 text-white"
                          : isDark
                          ? "border-zinc-800 bg-zinc-950/10"
                          : "border-zinc-200 bg-white"
                      )}
                    >
                      <div className="text-sm font-extrabold">{cat.label}</div>
                      <div className={cx("mt-1 text-xs", active ? "text-zinc-200" : isDark ? "text-zinc-400" : "text-zinc-600")}>
                        Tap to toggle
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-4">
              <div className="text-lg font-extrabold">Choose Starter Tasks</div>
              {Array.from(selectedCategories).map((catId) => {
                const templates = TASK_TEMPLATES[catId] || [];
                return (
                  <div key={catId} className="space-y-3">
                    <div className={cx("text-xs font-bold uppercase tracking-[0.2em]", isDark ? "text-zinc-400" : "text-zinc-600")}>
                      {CATEGORY_OPTIONS.find((c) => c.id === catId)?.label || catId}
                    </div>
                    <div className="space-y-2">
                      {templates.map((t) => (
                        <label key={t.id} className={cx("flex items-center justify-between rounded-xl border px-3 py-2", isDark ? "border-zinc-800" : "border-zinc-200")}>
                          <span className="text-sm font-semibold">{t.name}</span>
                          <input
                            type="checkbox"
                            checked={selectedTasks.has(t.id)}
                            onChange={() => toggleTask(t.id)}
                            className="h-4 w-4"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {step === 6 ? (
            <div className="space-y-4">
              <div className="text-lg font-extrabold">Configure Targets</div>
              {selectedTaskList.map((t) => {
                const cfg = taskConfig[t.id] || {};
                return (
                  <div key={t.id} className={cx("rounded-2xl border p-4", isDark ? "border-zinc-800" : "border-zinc-200")}>
                    <div className="text-sm font-extrabold">{t.name}</div>
                    <div className={cx("mt-1 text-xs", isDark ? "text-zinc-400" : "text-zinc-600")}>
                      Unit: {unitLabel(t.unitType)}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="text-xs font-semibold">
                        Current target
                        <input
                          type="number"
                          min="1"
                          step={t.unitType === "distance" ? "0.1" : "1"}
                          value={cfg.currentTargetValue ?? t.current}
                          onChange={(e) => updateTaskConfig(t.id, "currentTargetValue", e.target.value)}
                          className={cx(
                            "mt-1 w-full rounded-xl border p-2 text-sm",
                            isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                          )}
                        />
                      </label>
                      <label className="text-xs font-semibold">
                        S target
                        <input
                          type="number"
                          min="1"
                          step={t.unitType === "distance" ? "0.1" : "1"}
                          value={cfg.sTargetValue ?? t.s}
                          onChange={(e) => updateTaskConfig(t.id, "sTargetValue", e.target.value)}
                          className={cx(
                            "mt-1 w-full rounded-xl border p-2 text-sm",
                            isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                          )}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 1}
            className={cx(
              "rounded-xl border px-4 py-2 text-sm font-semibold",
              isDark ? "border-zinc-700 text-zinc-200 disabled:opacity-50" : "border-zinc-200 text-zinc-700 disabled:opacity-50"
            )}
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canProceed}
            className={cx(
              "rounded-xl px-4 py-2 text-sm font-semibold",
              isDark ? "bg-zinc-100 text-zinc-900 disabled:opacity-50" : "bg-zinc-900 text-white disabled:opacity-50"
            )}
          >
            {step === stepsTotal ? "Start" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
