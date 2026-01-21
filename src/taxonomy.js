export const SCHEMA_VERSION = 2;

export const DOMAIN_OPTIONS = [
  { id: "body", label: "Body" },
  { id: "mind", label: "Mind" },
  { id: "hobbies", label: "Hobbies" },
  { id: "life", label: "Life" },
];

export const ACTIVITY_TYPES_BY_DOMAIN = {
  body: [
    { id: "strength", label: "Strength" },
    { id: "cardio", label: "Cardio" },
    { id: "mobility", label: "Mobility" },
    { id: "sport", label: "Sport" },
  ],
  mind: [
    { id: "learning", label: "Learning" },
    { id: "mindfulness", label: "Mindfulness" },
    { id: "focus", label: "Focus" },
    { id: "sleep", label: "Sleep" },
  ],
  hobbies: [
    { id: "creative", label: "Creative" },
    { id: "practice", label: "Practice" },
    { id: "social", label: "Social" },
    { id: "explore", label: "Explore" },
  ],
  life: [
    { id: "productivity", label: "Productivity" },
    { id: "nutrition", label: "Nutrition" },
    { id: "hydration", label: "Hydration" },
    { id: "chores", label: "Chores" },
    { id: "finance", label: "Finance" },
    { id: "admin", label: "Admin" },
  ],
};

export const MEASUREMENT_TYPES = [
  { id: "reps", label: "Reps", defaultUnit: "reps" },
  { id: "time", label: "Time", defaultUnit: "min" },
  { id: "distance", label: "Distance", defaultUnit: "km" },
  { id: "count", label: "Count", defaultUnit: "x" },
  { id: "habit", label: "Habit", defaultUnit: "" },
];

export function normalizeDomain(raw) {
  const n = String(raw || "").toLowerCase().trim();
  if (n === "productivity") return "life";
  if (n === "life") return "life";
  if (n === "mind") return "mind";
  if (n === "body") return "body";
  if (n === "hobbies" || n === "hobby" || n === "craft") return "hobbies";
  return "life";
}

export function normalizeActivityKind(domain, raw) {
  const d = normalizeDomain(domain);
  const list = ACTIVITY_TYPES_BY_DOMAIN[d] || [];
  const n = String(raw || "").toLowerCase().trim();
  const match = list.find((item) => item.id === n);
  return match ? match.id : (list[0] ? list[0].id : "admin");
}

export function normalizeMeasurementType(raw, unitType) {
  const n = String(raw || "").toLowerCase().trim();
  if (n === "reps" || n === "time" || n === "distance" || n === "count" || n === "habit") return n;
  if (unitType === "minutes" || unitType === "time") return "time";
  if (unitType === "distance") return "distance";
  if (unitType === "reps") return "reps";
  return "habit";
}

export function defaultUnitForMeasurement(measurementType) {
  const entry = MEASUREMENT_TYPES.find((m) => m.id === measurementType);
  return entry ? entry.defaultUnit : "x";
}

export function unitTypeForMeasurement(measurementType) {
  if (measurementType === "time") return "minutes";
  if (measurementType === "distance") return "distance";
  return "reps";
}

export function allowedMeasurementTypes(domain, activityKind) {
  const d = normalizeDomain(domain);
  const a = String(activityKind || "").toLowerCase().trim();
  if (d === "body" && a === "cardio") return ["time", "distance"];
  if (d === "mind" && a === "sleep") return ["time", "habit"];
  return ["reps", "time", "distance", "count", "habit"];
}

export function measurementRequiresTarget(measurementType) {
  return measurementType !== "habit";
}

export function inferQuestTaxonomy(q) {
  const name = String(q.name || "").toLowerCase();
  let domain = normalizeDomain(q.domain || q.category);
  let activityKind = normalizeActivityKind(domain, q.activityKind);
  let matched = false;

  const set = (d, a) => {
    domain = normalizeDomain(d);
    activityKind = normalizeActivityKind(domain, a);
    matched = true;
  };

  if (/(push|pull|sit|squat|deadlift|bench|strength|lift)/.test(name)) set("body", "strength");
  if (/(run|jog|walk|cardio|cycle|bike|swim)/.test(name)) set("body", "cardio");
  if (/(stretch|yoga|mobility)/.test(name)) set("body", "mobility");
  if (/(sport|basketball|soccer|tennis)/.test(name)) set("body", "sport");

  if (/(medit|breath|mindful)/.test(name)) set("mind", "mindfulness");
  if (/(journal)/.test(name)) set("mind", "mindfulness");
  if (/(learn|study|read|language|course)/.test(name)) set("mind", "learning");
  if (/(focus|no[- ]phone|no[- ]social|pomodoro)/.test(name)) set("mind", "focus");
  if (/(sleep)/.test(name)) set("mind", "sleep");

  if (/(art|draw|paint|creative)/.test(name)) set("hobbies", "creative");
  if (/(guitar|music|piano|practice)/.test(name)) set("hobbies", "practice");
  if (/(social|friends|family|call)/.test(name)) set("hobbies", "social");
  if (/(explore|travel|hike)/.test(name)) set("hobbies", "explore");

  if (/(deep work|work session|productiv)/.test(name)) set("life", "productivity");
  if (/(nutrition|meal|cook|diet|food)/.test(name)) set("life", "nutrition");
  if (/(water|hydrate|bottle)/.test(name)) set("life", "hydration");
  if (/(clean|laundry|dishes|tidy)/.test(name)) set("life", "chores");
  if (/(budget|finance|money|bill)/.test(name)) set("life", "finance");
  if (/(inbox|email|paperwork|admin)/.test(name)) set("life", "admin");

  const hasHabitKeywords = /(no[- ]phone|no[- ]social|avoid|no[- ]junk|no[- ]sugar|limit)/.test(name);
  let measurementType = normalizeMeasurementType(q.measurementType, q.unitType);
  if (hasHabitKeywords) measurementType = "habit";
  if (activityKind === "sleep" && measurementType !== "habit") measurementType = "time";

  if (activityKind === "cardio" && measurementType === "reps") measurementType = "time";
  if (domain === "life" && activityKind === "hydration") measurementType = "count";

  if (!matched && !q.activityKind && !q.measurementType) {
    domain = "life";
    activityKind = "admin";
    measurementType = "habit";
  }

  let unit = String(q.unit || "").trim();
  if (!unit) {
    if (measurementType === "count") {
      if (/(water|hydrate|bottle)/.test(name)) unit = "cups";
      else if (/(page|read)/.test(name)) unit = "pages";
      else unit = defaultUnitForMeasurement(measurementType);
    } else {
      unit = defaultUnitForMeasurement(measurementType);
    }
  }

  return { domain, activityKind, measurementType, unit };
}
