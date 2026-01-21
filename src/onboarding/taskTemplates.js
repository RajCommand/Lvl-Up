export const STORAGE_KEY = "solo_leveling_checklist_v1";

export const CATEGORY_OPTIONS = [
  { id: "body", label: "Body" },
  { id: "mind", label: "Mind" },
  { id: "hobbies", label: "Hobbies" },
  { id: "life", label: "Life" },
];

export const TASK_TEMPLATES = {
  body: [
    { id: "pushups", name: "Push-ups", unitType: "reps", unit: "reps", measurementType: "reps", activityKind: "strength", current: 10, s: 100 },
    { id: "situps", name: "Sit-ups", unitType: "reps", unit: "reps", measurementType: "reps", activityKind: "strength", current: 10, s: 80 },
    { id: "pullups", name: "Pull-ups", unitType: "reps", unit: "reps", measurementType: "reps", activityKind: "strength", current: 5, s: 20 },
    { id: "run", name: "Running / Jogging", unitType: "distance", unit: "km", measurementType: "distance", activityKind: "cardio", current: 1, s: 5 },
  ],
  mind: [
    { id: "meditation", name: "Meditation", unitType: "minutes", unit: "min", measurementType: "time", activityKind: "mindfulness", current: 10, s: 30 },
    { id: "focus", name: "No-phone / Focus time", unitType: "reps", unit: "", measurementType: "habit", activityKind: "focus", current: 1, s: 1 },
    { id: "journaling", name: "Journaling", unitType: "minutes", unit: "min", measurementType: "time", activityKind: "mindfulness", current: 10, s: 30 },
    { id: "breathing", name: "Breathing practice", unitType: "minutes", unit: "min", measurementType: "time", activityKind: "mindfulness", current: 5, s: 20 },
    { id: "reading", name: "Reading", unitType: "minutes", unit: "min", measurementType: "time", activityKind: "learning", current: 15, s: 60 },
    { id: "study", name: "Studying", unitType: "minutes", unit: "min", measurementType: "time", activityKind: "learning", current: 30, s: 120 },
  ],
  hobbies: [
    { id: "language", name: "Language practice", unitType: "minutes", unit: "min", measurementType: "time", activityKind: "practice", current: 15, s: 60 },
    { id: "art", name: "Art practice", unitType: "minutes", unit: "min", measurementType: "time", activityKind: "creative", current: 20, s: 90 },
    { id: "music", name: "Music practice", unitType: "minutes", unit: "min", measurementType: "time", activityKind: "practice", current: 20, s: 90 },
  ],
  life: [
    { id: "deepwork", name: "Deep work session", unitType: "minutes", unit: "min", measurementType: "time", activityKind: "productivity", current: 45, s: 180 },
    { id: "inbox", name: "Inbox cleanup", unitType: "minutes", unit: "min", measurementType: "time", activityKind: "admin", current: 10, s: 30 },
    { id: "cleaning", name: "Cleaning / Laundry", unitType: "minutes", unit: "min", measurementType: "time", activityKind: "chores", current: 20, s: 60 },
  ],
};
