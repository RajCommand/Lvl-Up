import React, { useEffect, useState } from "react";
import App from "./App.jsx";
import Onboarding from "./Onboarding.jsx";
import { STORAGE_KEY } from "./onboarding/taskTemplates.js";

function safeParseJSON(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function buildStorageState(quests) {
  return {
    quests,
    settings: {
      themeMode: "system",
      hardcore: false,
      penaltyMode: "xp_debt",
      streakBonusPctPerDay: 1,
      maxStreakBonusPct: 20,
      weeklyBossEnabled: true,
      wakeTime: "07:00",
      bedTime: "23:00",
    },
  };
}

function isOnboardingComplete() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("onboardingComplete") === "true";
}

function hasQuestData() {
  if (typeof window === "undefined") return false;
  const questList = safeParseJSON(window.localStorage.getItem("quests"), []);
  if (Array.isArray(questList) && questList.length) return true;
  const saved = safeParseJSON(window.localStorage.getItem(STORAGE_KEY), null);
  return Array.isArray(saved?.quests) && saved.quests.length > 0;
}

export default function Boot() {
  const [ready, setReady] = useState(() => isOnboardingComplete() && hasQuestData());

  useEffect(() => {
    setReady(isOnboardingComplete() && hasQuestData());
    if (typeof window !== "undefined") {
      window.__restartOnboarding = () => {
        window.localStorage.setItem("onboardingComplete", "false");
        setReady(false);
      };
    }
  }, []);

  function handleComplete({ profile, categories, quests }) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("playerProfile", JSON.stringify(profile));
    window.localStorage.setItem("selectedCategories", JSON.stringify(categories));
    window.localStorage.setItem("quests", JSON.stringify(quests));
    window.localStorage.setItem("onboardingComplete", "true");
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(buildStorageState(quests)));
    setReady(true);
  }

  if (!ready) {
    return <Onboarding onComplete={handleComplete} />;
  }

  return <App />;
}
