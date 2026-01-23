function clampInt(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function ensureMonotonicLadder(base, sRankTarget) {
  const ladder = [...base];
  ladder[0] = Math.max(1, ladder[0]);
  for (let i = 1; i < ladder.length - 1; i += 1) {
    const minNext = ladder[i - 1] + 1;
    const remaining = ladder.length - 1 - i;
    const maxNext = sRankTarget - remaining;
    if (maxNext < minNext) {
      ladder[i] = Math.max(1, maxNext);
    } else {
      ladder[i] = clampInt(Math.max(ladder[i], minNext), minNext, maxNext);
    }
  }
  ladder[ladder.length - 1] = sRankTarget;
  return ladder;
}

export function buildQuestProgression({
  sRankTarget,
  startTarget,
  startTargetWasAuto = true,
  sessionsPerWeek = 7,
  sessionsToS = 84,
}) {
  const sTarget = Math.max(1, clampInt(sRankTarget, 1, Number.MAX_SAFE_INTEGER));
  const base = [
    Math.round(sTarget * 0.1),
    Math.round(sTarget * 0.25),
    Math.round(sTarget * 0.4),
    Math.round(sTarget * 0.6),
    Math.round(sTarget * 0.8),
    sTarget,
  ];
  const ladderValues = ensureMonotonicLadder(base, sTarget);
  const ladder = {
    E: ladderValues[0],
    D: ladderValues[1],
    C: ladderValues[2],
    B: ladderValues[3],
    A: ladderValues[4],
    S: ladderValues[5],
  };
  const recommendedStartTarget = ladder.E;
  const start = clampInt(
    startTargetWasAuto ? recommendedStartTarget : startTarget ?? recommendedStartTarget,
    1,
    sTarget
  );
  const sessionsPerWeekSafe = clampInt(sessionsPerWeek, 1, 7);
  const sessionsToSSafe = clampInt(sessionsToS, 1, Number.MAX_SAFE_INTEGER);
  const increasePerSession = Math.max(1, Math.round((sTarget - start) / sessionsToSSafe));
  const weeklyIncrease = increasePerSession * sessionsPerWeekSafe;
  const estimatedWeeksToS = Math.max(0, Math.ceil(sessionsToSSafe / sessionsPerWeekSafe));
  const startingRankLetter = rankLetterForTarget(start, ladder);

  return {
    sRankTarget: sTarget,
    recommendedStartTarget,
    startTarget: start,
    startTargetWasAuto,
    weeklyIncrease,
    estimatedWeeksToS,
    sessionsPerWeek: sessionsPerWeekSafe,
    ladder,
    startingRankLetter,
  };
}

export function rankLetterForTarget(target, ladder) {
  const t = clampInt(target, 1, Number.MAX_SAFE_INTEGER);
  if (t < ladder.D) return "E";
  if (t < ladder.C) return "D";
  if (t < ladder.B) return "C";
  if (t < ladder.A) return "B";
  if (t < ladder.S) return "A";
  return "S";
}
