export const STORAGE_KEY = "solo_leveling_checklist_v1";

export const CATEGORY_OPTIONS = [
  { id: "body", label: "Body" },
  { id: "mind", label: "Mind" },
  { id: "hobbies", label: "Hobbies" },
  { id: "productivity", label: "Productivity" },
];

export const TASK_TEMPLATES = {
  body: [
    { id: "pushups", name: "Push-ups", unitType: "reps", current: 10, s: 100 },
    { id: "situps", name: "Sit-ups", unitType: "reps", current: 10, s: 80 },
    { id: "pullups", name: "Pull-ups", unitType: "reps", current: 5, s: 20 },
    { id: "run", name: "Running / Jogging", unitType: "distance", current: 1, s: 5 },
  ],
  mind: [
    { id: "meditation", name: "Meditation", unitType: "minutes", current: 10, s: 30 },
    { id: "focus", name: "No-phone / Focus time", unitType: "minutes", current: 20, s: 60 },
    { id: "journaling", name: "Journaling", unitType: "minutes", current: 10, s: 30 },
    { id: "breathing", name: "Breathing practice", unitType: "minutes", current: 5, s: 20 },
  ],
  hobbies: [
    { id: "reading", name: "Reading", unitType: "minutes", current: 15, s: 60 },
    { id: "language", name: "Language practice", unitType: "minutes", current: 15, s: 60 },
    { id: "art", name: "Art practice", unitType: "minutes", current: 20, s: 90 },
  ],
  productivity: [
    { id: "study", name: "Studying", unitType: "minutes", current: 30, s: 120 },
    { id: "deepwork", name: "Deep work session", unitType: "minutes", current: 45, s: 180 },
    { id: "inbox", name: "Inbox cleanup", unitType: "minutes", current: 10, s: 30 },
  ],
};
