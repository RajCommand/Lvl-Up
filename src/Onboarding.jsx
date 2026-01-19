import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
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

function formatWindow(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${m}m`;
}

const PRESET_LABELS = [
  { id: "beginner", label: "Beginner" },
  { id: "standard", label: "Standard" },
  { id: "hardcore", label: "Hardcore" },
];

const PRESET_VALUES = {
  push: { beginner: [5, 50], standard: [10, 100], hardcore: [20, 150] },
  pull: { beginner: [1, 15], standard: [5, 30], hardcore: [10, 40] },
  run: { beginner: [1, 5], standard: [2, 10], hardcore: [5, 15] },
  medit: { beginner: [5, 20], standard: [10, 30], hardcore: [20, 60] },
  focus: { beginner: [15, 60], standard: [30, 120], hardcore: [60, 240] },
  read: { beginner: [10, 30], standard: [20, 60], hardcore: [45, 120] },
  study: { beginner: [30, 90], standard: [60, 180], hardcore: [90, 240] },
  defaultMinutes: { beginner: [10, 30], standard: [20, 60], hardcore: [40, 120] },
  defaultReps: { beginner: [5, 50], standard: [10, 100], hardcore: [20, 150] },
  defaultDistance: { beginner: [1, 5], standard: [2, 10], hardcore: [5, 15] },
};

const DOMAIN_COLORS = {
  body: "#3B82F6",
  mind: "#EF4444",
  hobbies: "#22C55E",
  productivity: "#EAB308",
};

const colorForDomain = (domain) => DOMAIN_COLORS[String(domain || "").toLowerCase()] || "#9CA3AF";

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

function presetForTask(task, presetId) {
  const name = String(task.name || "").toLowerCase();
  if (name.includes("push")) return PRESET_VALUES.push[presetId];
  if (name.includes("pull")) return PRESET_VALUES.pull[presetId];
  if (name.includes("run") || name.includes("jog")) return PRESET_VALUES.run[presetId];
  if (name.includes("medit")) return PRESET_VALUES.medit[presetId];
  if (name.includes("focus") || name.includes("no-phone")) return PRESET_VALUES.focus[presetId];
  if (name.includes("read")) return PRESET_VALUES.read[presetId];
  if (name.includes("study") || name.includes("learn")) return PRESET_VALUES.study[presetId];
  if (task.unitType === "distance") return PRESET_VALUES.defaultDistance[presetId];
  if (task.unitType === "minutes") return PRESET_VALUES.defaultMinutes[presetId];
  return PRESET_VALUES.defaultReps[presetId];
}

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(1);
  const [playerName, setPlayerName] = useState("");
  const [dob, setDob] = useState("");
  const [selectedCategories, setSelectedCategories] = useState(() => new Set());
  const [selectedTasks, setSelectedTasks] = useState(() => new Set());
  const [taskConfig, setTaskConfig] = useState({});
  const [difficultyByTask, setDifficultyByTask] = useState({});
  const [globalDifficulty, setGlobalDifficulty] = useState("");
  const [transitionKey, setTransitionKey] = useState(0);
  const [typedLabel] = useState("Leveler Name:");
  const [focusedTaskId, setFocusedTaskId] = useState("");
  const [wakeTime, setWakeTime] = useState("08:00");
  const [bedTime, setBedTime] = useState("00:00");
  const [xpDebtEnabled, setXpDebtEnabled] = useState(false);
  const [blockAfterBedtime, setBlockAfterBedtime] = useState(true);
  const [noPhonePenaltyEnabled, setNoPhonePenaltyEnabled] = useState(false);
  const [noPhonePenaltyMinutes, setNoPhonePenaltyMinutes] = useState(60);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const nameInputRef = useRef(null);
  const dobInputRef = useRef(null);
  const scrollContainerRef = useRef(null);

  const stepsTotal = 7;
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
    if (step === 7) return agreementChecked;
    return true;
  }, [step, playerName, dob, selectedCategories, selectedTaskList, agreementChecked]);

  useEffect(() => {
    setTransitionKey((v) => v + 1);
  }, [step]);

  useEffect(() => {
    if (step === 2) nameInputRef.current?.focus();
  }, [step]);

  function openDobPicker() {
    const el = dobInputRef.current;
    if (!el) return;
    const trigger = () => {
      if (typeof el.showPicker === "function") el.showPicker();
      else el.click();
    };
    requestAnimationFrame(trigger);
  }

  useLayoutEffect(() => {
    scrollContainerRef.current?.scrollTo?.({ top: 0, left: 0, behavior: "instant" });
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [step]);

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

  function applyPreset(task, presetId) {
    const [cVal, sVal] = presetForTask(task, presetId);
    updateTaskConfig(task.id, "currentTargetValue", cVal);
    updateTaskConfig(task.id, "sTargetValue", sVal);
  }

  function setTaskDifficulty(task, presetId) {
    setDifficultyByTask((prev) => ({ ...prev, [task.id]: presetId }));
    setGlobalDifficulty("");
    applyPreset(task, presetId);
  }

  function setAllDifficulties(presetId) {
    setGlobalDifficulty(presetId);
    setDifficultyByTask((prev) => {
      const next = { ...prev };
      selectedTaskList.forEach((task) => {
        next[task.id] = presetId;
      });
      return next;
    });
    selectedTaskList.forEach((task) => applyPreset(task, presetId));
  }

  function handleNext() {
    if (step < stepsTotal) {
      setStep((s) => s + 1);
      return;
    }
    const createdAt = Date.now();
    const quests = selectedTaskList.map((t, idx) => {
      const cfg = taskConfig[t.id] || {};
      const currentRaw = Number(cfg.currentTargetValue ?? t.current ?? 1);
      const sRaw = Number(cfg.sTargetValue ?? t.s ?? currentRaw);
      const currentTargetValue = Math.max(1, Number.isFinite(currentRaw) ? currentRaw : 1);
      const sTargetValue = Math.max(currentTargetValue, Number.isFinite(sRaw) ? sRaw : currentTargetValue);
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
      settings: {
        wakeTime,
        bedTime,
        xpDebtEnabled,
        blockAfterBedtime,
        noPhonePenaltyEnabled,
        noPhonePenaltyMinutes,
      },
    });
  }

  function handleBack() {
    if (step > 1) setStep((s) => s - 1);
  }

  const contentAlignment = step <= 4 ? "items-center justify-center" : "items-start justify-center";

  return (
    <div
      className={cx(
        "min-h-screen w-full overflow-x-hidden",
        isDark ? "bg-zinc-950 text-zinc-50" : "bg-zinc-50 text-zinc-900"
      )}
    >
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
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overscroll-contain">
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
                  <div
                    className={cx(
                      "text-[clamp(2.5rem,9vw,4.5rem)] sm:text-7xl font-black tracking-tight animate-logo whitespace-nowrap",
                      isDark ? "text-zinc-50" : "text-zinc-900"
                    )}
                  >
                    <span>
                      {typedLabel}
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
                    Date of Birth.
                  </div>
                  <div className="mx-auto w-full max-w-md px-2 min-w-0">
                    <div
                      onClick={openDobPicker}
                      className={cx(
                        "w-full cursor-pointer rounded-2xl border px-4 py-3",
                        isDark ? "border-zinc-800 bg-zinc-950/20" : "border-zinc-200 bg-white"
                      )}
                    >
                      <input
                        ref={dobInputRef}
                        type="date"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        className={cx(
                          "w-full bg-transparent text-sm outline-none",
                          isDark ? "text-zinc-50" : "text-zinc-900"
                        )}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {step === 4 ? (
                <div className="text-center space-y-4">
                  <div className={cx("text-6xl sm:text-7xl font-black tracking-tight animate-logo", isDark ? "text-zinc-50" : "text-zinc-900")}>
                    Choose Your Domains.
                  </div>
                  <div className={cx("mx-auto max-w-md text-sm leading-relaxed", isDark ? "text-zinc-300" : "text-zinc-600")}>
                    <div>Choose what you want to level up.</div>
                    <div>You can change this anytime.</div>
                  </div>
                  <div className="mt-6 grid w-full grid-cols-2 gap-4 text-left">
                    {CATEGORY_OPTIONS.map((cat) => {
                      const active = selectedCategories.has(cat.id);
                      const info = categoryCards[cat.id];
                      const domainColor = colorForDomain(cat.id);
                      const activeStyle = active
                        ? {
                            borderColor: isDark ? "#ffffff" : "#000000",
                            boxShadow: `0 0 0 1px ${rgba(domainColor, 0.25)}`,
                          }
                        : undefined;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => toggleCategory(cat.id)}
                          className={cx(
                            "relative flex h-full max-w-full flex-col overflow-hidden rounded-2xl border p-3 transition",
                            active
                              ? isDark
                                ? "border-zinc-100 bg-white text-zinc-900"
                                : "border-zinc-900 bg-zinc-900 text-white"
                              : isDark
                              ? "border-zinc-800 bg-zinc-950/10"
                              : "border-zinc-200 bg-white"
                          )}
                          style={activeStyle}
                        >
                          <img
                            src={info.image}
                            alt={info.title}
                            className={cx("aspect-square w-full rounded-xl object-cover transition", active ? "grayscale-0" : "grayscale")}
                          />
                          <div className="mt-3 min-h-[44px]">
                            <div
                              className="text-sm font-extrabold"
                              style={{ color: active ? domainColor : isDark ? "rgba(255,255,255,0.85)" : "rgba(17,24,39,0.85)" }}
                            >
                              {info.title}
                            </div>
                            <div
                              className={cx(
                                "mt-1 text-xs",
                                active ? (isDark ? "text-zinc-600" : "text-zinc-200") : isDark ? "text-zinc-400" : "text-zinc-600"
                              )}
                              style={{
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {info.subtitle}
                            </div>
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
                <div className="space-y-6">
                  <div className="text-center space-y-3">
                    <div className={cx("text-6xl sm:text-7xl font-black tracking-tight animate-logo", isDark ? "text-zinc-50" : "text-zinc-900")}>
                      Choose Your Quests.
                    </div>
                    <div className={cx("mx-auto max-w-md text-sm leading-relaxed", isDark ? "text-zinc-400" : "text-zinc-500")}>
                      Select preexisting domain specific quests. You can add your own quests later.
                    </div>
                  </div>

                  <div className="space-y-8">
                    {Array.from(selectedCategories).map((catId) => {
                      const templates = TASK_TEMPLATES[catId] || [];
                      const domainColor = colorForDomain(catId);
                      return (
                        <div key={catId} className="space-y-3">
                          <div className={cx("text-2xl font-extrabold", isDark ? "text-zinc-100" : "text-zinc-900")} style={{ color: domainColor }}>
                            {CATEGORY_OPTIONS.find((c) => c.id === catId)?.label || catId}
                          </div>
                          <div className="space-y-3">
                            {templates.map((t) => {
                              const active = selectedTasks.has(t.id);
                              const selectedStyle = active
                                ? {
                                    borderColor: domainColor,
                                    boxShadow: `0 0 0 1px ${rgba(domainColor, 0.25)}`,
                                  }
                                : undefined;
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => toggleTask(t.id)}
                                  className={cx(
                                    "w-full rounded-2xl border px-4 py-4 text-left transition",
                                    active
                                      ? isDark
                                        ? "border-zinc-100 bg-zinc-900 text-zinc-50"
                                        : "border-zinc-900 bg-zinc-900 text-white"
                                      : isDark
                                      ? "border-zinc-800 bg-zinc-950/10 text-zinc-400"
                                      : "border-zinc-200 bg-white text-zinc-500"
                                  )}
                                  style={selectedStyle}
                                >
                                  <div
                                    className="text-sm font-semibold"
                                    style={{
                                      color: active
                                        ? domainColor
                                        : isDark
                                        ? "rgba(255,255,255,0.6)"
                                        : "rgba(17,24,39,0.55)",
                                    }}
                                  >
                                    {t.name}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {!selectedTaskList.length ? (
                    <div className={cx("text-center text-xs", isDark ? "text-zinc-400" : "text-zinc-500")}>
                      Select at least one quest to continue.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {step === 6 ? (
                <div className="space-y-4">
                  <div className="text-center space-y-3">
                    <div className={cx("text-6xl sm:text-7xl font-black tracking-tight animate-logo", isDark ? "text-zinc-50" : "text-zinc-900")}>
                      Set Your Goals.
                    </div>
                    <div className={cx("mx-auto max-w-md text-sm leading-relaxed", isDark ? "text-zinc-400" : "text-zinc-500")}>
                      Set your current level and your S-rank goal. You can always adjust this later.
                    </div>
                  </div>

                  <div className={cx("rounded-2xl border p-4 text-left", isDark ? "border-zinc-800 bg-zinc-950/20" : "border-zinc-200 bg-white")}>
                    <div className="text-sm font-extrabold">Not sure yet?</div>
                    <div className={cx("mt-1 text-xs", isDark ? "text-zinc-400" : "text-zinc-600")}>
                      Keep the defaults for now. Start today, then fine-tune your goals anytime in Settings.
                    </div>
                  </div>
                  <div className={cx("rounded-2xl border p-4 text-left", isDark ? "border-zinc-800 bg-zinc-950/20" : "border-zinc-200 bg-white")}>
                    <div className="text-sm font-extrabold">Choose your difficulty</div>
                    <div className={cx("mt-1 text-xs", isDark ? "text-zinc-400" : "text-zinc-600")}>
                      Set everything to Beginner, Standard, or Hardcore — or choose individual difficulty per quest.
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {PRESET_LABELS.map((preset) => {
                        const active = globalDifficulty === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => setAllDifficulties(preset.id)}
                            className={cx(
                              "rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                              active
                                ? isDark
                                  ? "border-zinc-100 bg-zinc-100 text-zinc-900"
                                  : "border-zinc-900 bg-zinc-900 text-white"
                                : isDark
                                ? "border-zinc-700 bg-zinc-900 text-zinc-200"
                                : "border-zinc-200 bg-white text-zinc-700"
                            )}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-8">
                    {CATEGORY_OPTIONS.map((cat) => {
                      const list = selectedTaskList.filter((t) => t.category === cat.id);
                      if (!list.length) return null;
                      const domainColor = colorForDomain(cat.id);
                      return (
                        <div key={cat.id} className="space-y-3">
                          <div className={cx("text-2xl font-extrabold", isDark ? "text-zinc-100" : "text-zinc-900")} style={{ color: domainColor }}>
                            {cat.label}
                          </div>
                          <div className="space-y-4">
                            {list.map((t) => {
                              const cfg = taskConfig[t.id] || {};
                              const currentValue = cfg.currentTargetValue ?? t.current;
                              const sValue = cfg.sTargetValue ?? t.s;
                              const isFocused = focusedTaskId === t.id;
                              const cardStyle = {
                                borderColor: rgba(domainColor, isFocused ? 0.8 : 0.35),
                              };
                              return (
                                <div
                                  key={t.id}
                                  className={cx(
                                    "rounded-2xl border p-4",
                                    isDark ? "border-zinc-800 bg-zinc-950/20" : "border-zinc-200 bg-white"
                                  )}
                                  style={cardStyle}
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <div className="text-sm font-extrabold" style={{ color: rgba(domainColor, 0.9) }}>{t.name}</div>
                                      <div className={cx("text-xs", isDark ? "text-zinc-400" : "text-zinc-600")}>
                                        Unit: {unitLabel(t.unitType)}
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {PRESET_LABELS.map((preset) => (
                                        <button
                                          key={preset.id}
                                          type="button"
                                          onClick={() => {
                                            setTaskDifficulty(t, preset.id);
                                          }}
                                          className={cx(
                                            "rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                                            difficultyByTask[t.id] === preset.id
                                              ? isDark
                                                ? "border-zinc-100 bg-zinc-100 text-zinc-900"
                                                : "border-zinc-900 bg-zinc-900 text-white"
                                              : isDark
                                              ? "border-zinc-700 bg-zinc-900 text-zinc-200"
                                              : "border-zinc-200 bg-white text-zinc-700"
                                          )}
                                        >
                                          {preset.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="mt-3 grid grid-cols-2 gap-3">
                                    <label className="text-xs font-semibold">
                                      Current level
                                      <input
                                        type="number"
                                        min="1"
                                        step={t.unitType === "distance" ? "0.1" : "1"}
                                        value={currentValue}
                                        onChange={(e) => updateTaskConfig(t.id, "currentTargetValue", e.target.value)}
                                        onFocus={() => setFocusedTaskId(t.id)}
                                        onBlur={() => setFocusedTaskId("")}
                                        className={cx(
                                          "mt-1 w-full rounded-xl border p-2 text-sm",
                                          isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                                        )}
                                      />
                                    </label>
                                    <label className="text-xs font-semibold">
                                      S-rank goal
                                      <input
                                        type="number"
                                        min="1"
                                        step={t.unitType === "distance" ? "0.1" : "1"}
                                        value={sValue}
                                        onChange={(e) => updateTaskConfig(t.id, "sTargetValue", e.target.value)}
                                        onFocus={() => setFocusedTaskId(t.id)}
                                        onBlur={() => setFocusedTaskId("")}
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
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {step === 7 ? (
                <div className="space-y-4">
                  <div className="text-center space-y-3">
                    <div className={cx("text-5xl sm:text-6xl font-black tracking-tight animate-logo", isDark ? "text-zinc-50" : "text-zinc-900")}>
                      Rules of the Game
                    </div>
                    <div className={cx("mx-auto max-w-md text-sm leading-relaxed", isDark ? "text-zinc-400" : "text-zinc-500")}>
                      Your progress only counts inside your day window. You can change this anytime.
                    </div>
                  </div>

                  <div className={cx("rounded-2xl border p-4 text-left", isDark ? "border-zinc-800 bg-zinc-950/20" : "border-zinc-200 bg-white")}>
                    <div className="text-sm font-extrabold">Daily Time Window</div>
                    <div className={cx("mt-1 text-xs", isDark ? "text-zinc-400" : "text-zinc-600")}>
                      Choose your wake and bed times.
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <div className={cx("text-xs font-semibold", isDark ? "text-zinc-400" : "text-zinc-600")}>Wake time</div>
                        <input
                          type="time"
                          value={wakeTime}
                          onChange={(e) => setWakeTime(e.target.value)}
                          className={cx(
                            "mt-1 w-full rounded-xl border p-2 text-sm",
                            isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                          )}
                        />
                      </div>
                      <div>
                        <div className={cx("text-xs font-semibold", isDark ? "text-zinc-400" : "text-zinc-600")}>Bed time</div>
                        <input
                          type="time"
                          value={bedTime}
                          onChange={(e) => setBedTime(e.target.value)}
                          className={cx(
                            "mt-1 w-full rounded-xl border p-2 text-sm",
                            isDark ? "border-zinc-800 bg-zinc-950/10" : "border-zinc-200 bg-white"
                          )}
                        />
                      </div>
                    </div>
                    <div className={cx("mt-3 text-xs", isDark ? "text-zinc-300" : "text-zinc-600")}>
                      You have {formatWindow(dayWindowMinutes(wakeTime, bedTime))} each day to complete quests.
                    </div>
                    <div className={cx("mt-2 rounded-xl border p-3 text-xs", isDark ? "border-zinc-800 bg-zinc-950/10 text-zinc-400" : "border-zinc-200 bg-zinc-50 text-zinc-600")}>
                      Quests completed outside this window won’t count.
                    </div>
                  </div>

                  <div className={cx("rounded-2xl border p-4 text-left", isDark ? "border-zinc-800 bg-zinc-950/20" : "border-zinc-200 bg-white")}>
                    <div className="text-sm font-extrabold">XP Debt + Punishments</div>
                    <div className={cx("mt-1 text-xs", isDark ? "text-zinc-400" : "text-zinc-600")}>
                      Optional guardrails for discipline.
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-xs font-semibold">Enable XP Debt</div>
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={xpDebtEnabled}
                          onChange={(e) => {
                            const next = e.target.checked;
                            setXpDebtEnabled(next);
                            if (next) setBlockAfterBedtime(true);
                          }}
                          className="h-4 w-4"
                        />
                        <span className="text-sm font-semibold">{xpDebtEnabled ? "On" : "Off"}</span>
                      </label>
                    </div>

                    {xpDebtEnabled ? (
                      <div className="mt-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs font-semibold">Block quest completion after bedtime</div>
                            <div className={cx("mt-1 text-[11px]", isDark ? "text-zinc-400" : "text-zinc-600")}>
                              After bedtime, quests cannot be marked complete until next day.
                            </div>
                          </div>
                          <label className="inline-flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={blockAfterBedtime}
                              onChange={(e) => setBlockAfterBedtime(e.target.checked)}
                              className="h-4 w-4"
                            />
                            <span className="text-sm font-semibold">{blockAfterBedtime ? "On" : "Off"}</span>
                          </label>
                        </div>

                        <div className={cx("rounded-xl border p-3", isDark ? "border-zinc-800" : "border-zinc-200")}>
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold">No-phone penalty</div>
                              <div className={cx("mt-1 text-[11px]", isDark ? "text-zinc-400" : "text-zinc-600")}>
                                If you miss quests, you owe a no-phone session the next day.
                              </div>
                            </div>
                            <label className="inline-flex cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                checked={noPhonePenaltyEnabled}
                                onChange={(e) => setNoPhonePenaltyEnabled(e.target.checked)}
                                className="h-4 w-4"
                              />
                              <span className="text-sm font-semibold">{noPhonePenaltyEnabled ? "On" : "Off"}</span>
                            </label>
                          </div>
                          {noPhonePenaltyEnabled ? (
                            <div className="mt-3">
                              <div className={cx("text-xs font-semibold", isDark ? "text-zinc-400" : "text-zinc-600")}>Duration</div>
                              <select
                                value={noPhonePenaltyMinutes}
                                onChange={(e) => setNoPhonePenaltyMinutes(Number(e.target.value))}
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

                  <div className={cx("rounded-2xl border p-4 text-left", isDark ? "border-zinc-800 bg-zinc-950/20" : "border-zinc-200 bg-white")}>
                    <label className="flex items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={agreementChecked}
                        onChange={(e) => setAgreementChecked(e.target.checked)}
                        className="mt-1 h-4 w-4"
                      />
                      <span className={cx("text-sm font-semibold", isDark ? "text-zinc-100" : "text-zinc-900")}>
                        I understand: to level up, I complete quests inside my daily window.
                      </span>
                    </label>
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
