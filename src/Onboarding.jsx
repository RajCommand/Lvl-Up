import React, { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_OPTIONS, TASK_TEMPLATES } from "./onboarding/taskTemplates.js";
import mindPic from "./assets/onboardingpics/mind1pic.jpeg";
import hobbiesPic from "./assets/onboardingpics/hobbies1pic.jpeg";
import bodyPic from "./assets/onboardingpics/body1pic.jpeg";
import productivityPic from "./assets/onboardingpics/Productivity1pic.jpeg";

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
  const [transitionKey, setTransitionKey] = useState(0);
  const [typedLabel] = useState("Leveler Name");
  const [openCategories, setOpenCategories] = useState(() => new Set());

  const nameInputRef = useRef(null);
  const dobInputRef = useRef(null);

  const stepsTotal = 6;
  const isDark = typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;

  const categoryCards = useMemo(() => ({
    body: {
      title: "Body",
      subtitle: "Physical strength and endurance",
      image: bodyPic,
    },
    mind: {
      title: "Mind",
      subtitle: "Focus, calm, and awareness",
      image: mindPic,
    },
    hobbies: {
      title: "Hobbies",
      subtitle: "Skills, learning, and creation",
      image: hobbiesPic,
    },
    productivity: {
      title: "Productivity",
      subtitle: "Execution and daily discipline",
      image: productivityPic,
    },
  }), []);

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

  useEffect(() => {
    setTransitionKey((v) => v + 1);
  }, [step]);

  useEffect(() => {
    if (step === 2) nameInputRef.current?.focus();
    if (step === 3) dobInputRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (step === 5) {
      setOpenCategories(new Set(selectedCategories));
    }
  }, [step, selectedCategories]);

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

  function toggleCategoryOpen(id) {
    setOpenCategories((prev) => {
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

  const contentAlignment = step <= 4 ? "items-center justify-center" : "items-start justify-center";

  return (
    <div className={cx("min-h-screen", isDark ? "bg-zinc-950 text-zinc-50" : "bg-zinc-50 text-zinc-900")}>
      <style>{`
        @keyframes stepIn {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes softFade {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes ctaIn {
          0% { opacity: 0; transform: translateY(10px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-step-in { animation: stepIn 320ms ease both; }
        .animate-logo { animation: softFade 1.5s ease both; }
        .animate-subtitle { animation: softFade 1s ease 1.5s both; }
        .animate-cta { animation: ctaIn 1.2s ease 2.6s both; }
      `}</style>

      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 pb-28">
        <div className="flex-1 overflow-y-auto">
          <div
            className={cx("min-h-full flex", contentAlignment)}
            style={step <= 4 ? { paddingTop: "14vh" } : undefined}
          >
            <div key={transitionKey} className="w-full animate-step-in">
              {step === 1 ? (
                <div className="text-center">
                  <div
                    className={cx(
                      "text-6xl sm:text-7xl font-black tracking-tight",
                      isDark ? "text-zinc-50" : "text-zinc-900"
                    )}
                    style={{ textShadow: isDark ? "0 0 22px rgba(255,255,255,0.12)" : "0 0 18px rgba(0,0,0,0.08)" }}
                  >
                    <span className="animate-logo">Level Up.</span>
                  </div>
                  <div className={cx("mt-3 text-sm", isDark ? "text-zinc-300" : "text-zinc-600")}> 
                    <span className="animate-subtitle">Turn habits into quests. Progress by leveling up.</span>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="text-center">
                  <div
                    className={cx(
                      "mx-auto w-full max-w-md px-2"
                    )}
                  >
                  <div className={cx("text-6xl sm:text-7xl font-black tracking-tight animate-logo", isDark ? "text-zinc-50" : "text-zinc-900")}>
                    <span>
                      {typedLabel}
                      <span className="ml-3 inline-flex flex-col items-center gap-2 align-middle">
                        <span className={cx("h-2.5 w-2.5 rounded-full", isDark ? "bg-zinc-50" : "bg-zinc-900")} />
                        <span className={cx("h-2.5 w-2.5 rounded-full", isDark ? "bg-zinc-50" : "bg-zinc-900")} />
                      </span>
                    </span>
                  </div>
                    <div className="mt-3">
                      <input
                        ref={nameInputRef}
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        className={cx(
                          "w-full rounded-xl border px-3 py-2 text-sm",
                          isDark ? "border-zinc-800 bg-zinc-950/20 text-zinc-100" : "border-zinc-200 bg-white text-zinc-900"
                        )}
                        placeholder="Your name"
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <div className="text-center space-y-3">
                  <div className={cx("text-6xl sm:text-7xl font-black tracking-tight animate-logo", isDark ? "text-zinc-50" : "text-zinc-900")}>
                    Date of Birth
                  </div>
                  <input
                    ref={dobInputRef}
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className={cx(
                      "mx-auto w-full max-w-md rounded-2xl border px-4 py-3 text-sm",
                      isDark ? "border-zinc-800 bg-zinc-950/20" : "border-zinc-200 bg-white"
                    )}
                  />
                </div>
              ) : null}

              {step === 4 ? (
                <div className="text-center space-y-4">
                  <div className={cx("text-6xl sm:text-7xl font-black tracking-tight animate-logo", isDark ? "text-zinc-50" : "text-zinc-900")}>
                    Choose Your Domains
                  </div>
                  <div className={cx("mx-auto max-w-md text-sm leading-relaxed", isDark ? "text-zinc-300" : "text-zinc-600")}>
                    <div>Choose what you want to level up.</div>
                    <div>You can change this anytime.</div>
                  </div>
                  <div className="mt-6 grid grid-cols-2 gap-4 text-left">
                    {CATEGORY_OPTIONS.map((cat) => {
                      const active = selectedCategories.has(cat.id);
                      const info = categoryCards[cat.id];
                      return (
                        <button
                          key={cat.id}
                          onClick={() => toggleCategory(cat.id)}
                          className={cx(
                            "relative overflow-hidden rounded-2xl border p-3 transition",
                            active
                              ? isDark
                                ? "border-zinc-100 bg-zinc-900 text-zinc-50"
                                : "border-zinc-900 bg-zinc-900 text-white"
                              : isDark
                              ? "border-zinc-800 bg-zinc-950/10"
                              : "border-zinc-200 bg-white"
                          )}
                        >
                          <img
                            src={info.image}
                            alt={info.title}
                            className={cx(
                              "aspect-square w-full rounded-xl object-cover transition",
                              active ? "grayscale-0" : "grayscale"
                            )}
                          />
                          <div className="mt-3 text-sm font-extrabold">{info.title}</div>
                          <div className={cx("mt-1 text-xs", active ? "text-zinc-200" : isDark ? "text-zinc-400" : "text-zinc-600")}>
                            {info.subtitle}
                          </div>
                          <div
                            className={cx(
                              "absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border",
                              active
                                ? isDark
                                  ? "border-zinc-100"
                                  : "border-white"
                                : isDark
                                ? "border-zinc-700"
                                : "border-zinc-200"
                            )}
                          >
                            {active ? (
                              <div className={cx("h-2.5 w-2.5 rounded-full", isDark ? "bg-zinc-100" : "bg-white")} />
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className={cx("pt-2 text-xs", isDark ? "text-zinc-400" : "text-zinc-500")}>
                    Progress begins with a choice.
                  </div>
                </div>
              ) : null}

              {step === 5 ? (
                <div className="space-y-4">
                  <div className="sticky top-0 z-10 -mx-5 px-5 pb-2 pt-1" style={{ background: isDark ? "rgba(9,9,11,0.8)" : "rgba(248,250,252,0.9)", backdropFilter: "blur(10px)" }}>
                    <div className="text-center text-lg font-extrabold">Choose Starter Tasks</div>
                  </div>
                  {Array.from(selectedCategories).map((catId) => {
                    const templates = TASK_TEMPLATES[catId] || [];
                    const open = openCategories.has(catId);
                    return (
                      <div key={catId} className={cx("rounded-2xl border", isDark ? "border-zinc-800" : "border-zinc-200")}> 
                        <button
                          type="button"
                          onClick={() => toggleCategoryOpen(catId)}
                          className={cx(
                            "flex w-full items-center justify-between px-4 py-3 text-left",
                            isDark ? "text-zinc-100" : "text-zinc-900"
                          )}
                        >
                          <div className="text-sm font-extrabold">{CATEGORY_OPTIONS.find((c) => c.id === catId)?.label || catId}</div>
                          <span className={cx("text-xs transition", open ? "rotate-90" : "")}>{">"}</span>
                        </button>
                        {open ? (
                          <div className="space-y-1 px-4 pb-3">
                            {templates.map((t) => (
                              <label
                                key={t.id}
                                className={cx(
                                  "flex items-center justify-between rounded-xl px-2 py-2",
                                  isDark ? "hover:bg-zinc-900/40" : "hover:bg-zinc-100"
                                )}
                              >
                                <span className="text-sm font-semibold">{t.name}</span>
                                <input
                                  type="checkbox"
                                  checked={selectedTasks.has(t.id)}
                                  onChange={() => toggleTask(t.id)}
                                  className={cx("h-4 w-4", isDark ? "accent-zinc-100" : "accent-zinc-900")}
                                />
                              </label>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {step === 6 ? (
                <div className="space-y-4">
                  <div className="text-center text-lg font-extrabold">Configure Targets</div>
                  <div className="space-y-3">
                    {selectedTaskList.map((t) => {
                      const cfg = taskConfig[t.id] || {};
                      const currentValue = cfg.currentTargetValue ?? t.current;
                      const sValue = cfg.sTargetValue ?? t.s;
                      return (
                        <div
                          key={t.id}
                          className={cx(
                            "rounded-2xl border p-4",
                            isDark ? "border-zinc-800 bg-zinc-950/20" : "border-zinc-200 bg-white"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-extrabold">{t.name}</div>
                              <div className={cx("text-xs", isDark ? "text-zinc-400" : "text-zinc-600")}>Unit: {unitLabel(t.unitType)}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                updateTaskConfig(t.id, "currentTargetValue", t.current);
                                updateTaskConfig(t.id, "sTargetValue", t.s);
                              }}
                              className={cx(
                                "rounded-full border px-3 py-1 text-[11px] font-semibold",
                                isDark ? "border-zinc-700 text-zinc-200" : "border-zinc-200 text-zinc-700"
                              )}
                            >
                              Default
                            </button>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <label className="text-xs font-semibold">
                              Current
                              <input
                                type="number"
                                min="1"
                                step={t.unitType === "distance" ? "0.1" : "1"}
                                value={currentValue}
                                onChange={(e) => updateTaskConfig(t.id, "currentTargetValue", e.target.value)}
                                className={cx(
                                  "mt-1 w-full rounded-xl border p-2 text-sm",
                                  isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                                )}
                              />
                            </label>
                            <label className="text-xs font-semibold">
                              S Target
                              <input
                                type="number"
                                min="1"
                                step={t.unitType === "distance" ? "0.1" : "1"}
                                value={sValue}
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
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div
        className={cx(
          "fixed bottom-0 left-0 right-0 border-t",
          isDark ? "border-zinc-800 bg-zinc-950/90" : "border-zinc-200 bg-white/90"
        )}
        style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-3 px-5 py-3">
          <div className={cx("flex items-center justify-center gap-2", step === 1 ? "animate-cta" : "")}>
            {Array.from({ length: stepsTotal }).map((_, idx) => {
              const active = idx + 1 <= step;
              return (
                <div
                  key={idx}
                  className={cx(
                    "h-1.5 w-7 rounded-full transition",
                    active
                      ? isDark
                        ? "bg-zinc-100"
                        : "bg-zinc-900"
                      : isDark
                      ? "bg-zinc-800"
                      : "bg-zinc-200"
                  )}
                />
              );
            })}
          </div>
          {step > 1 ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleBack}
                className={cx(
                  "rounded-full px-4 py-3 text-sm font-semibold transition",
                  isDark ? "border border-zinc-700 bg-zinc-900 text-zinc-100" : "border border-zinc-200 bg-white text-zinc-900"
                )}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!canProceed}
                className={cx(
                  "flex-1 rounded-full px-5 py-3 text-sm font-semibold transition",
                  isDark ? "bg-zinc-100 text-zinc-900 disabled:opacity-50" : "bg-zinc-900 text-white disabled:opacity-50",
                  step === 1 ? "animate-cta" : ""
                )}
              >
                {step === stepsTotal ? "Finish" : "Next"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canProceed}
              className={cx(
                "w-full rounded-full px-5 py-3 text-sm font-semibold transition",
                isDark ? "bg-zinc-100 text-zinc-900 disabled:opacity-50" : "bg-zinc-900 text-white disabled:opacity-50",
                step === 1 ? "animate-cta" : ""
              )}
            >
              {step === stepsTotal ? "Finish" : "Next"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
