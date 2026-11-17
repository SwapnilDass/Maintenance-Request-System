// automatic priority scoring (story #16, from the sprint 3 stakeholder feedback:
// "customers shouldn't set priority, there should be a scoring mechanism").
//
// every new request gets a score from 0 to 100, made of:
//   1. the category       - Electrical/Plumbing problems are riskier than IT ones
//   2. danger words       - "fire", "sparks", "gas"... (safety) or "leak", "no power"... (disruption)
//   3. time waiting       - +2 a day while it's open, so old requests don't get stuck at the bottom
// and the score picks the priority:  60+ URGENT · 40+ HIGH · 20+ MEDIUM · below 20 LOW
//
// a manager can still change the priority by hand (story #13); after that the score stops changing it

import type { Priority } from "@prisma/client";

// 1. how risky each kind of problem is. categories an admin adds later get DEFAULT_CATEGORY_POINTS
export const CATEGORY_POINTS: Record<string, number> = {
  electrical: 30,
  plumbing: 30,
  hvac: 20,
  it: 10,
  other: 10,
};
export const DEFAULT_CATEGORY_POINTS = 15;

// 2. words in the title or description. each group counts once, even if several of its words appear
export const SAFETY_WORDS = ["fire", "smoke", "spark", "sparks", "sparking", "gas", "shock", "burning", "flood", "flooding", "sewage", "exposed wire"];
export const SAFETY_POINTS = 40;
export const DISRUPTION_WORDS = ["leak", "leaking", "no power", "outage", "no heat", "no water", "overheating", "broken", "not working"];
export const DISRUPTION_POINTS = 20;

// 3. waiting time
export const POINTS_PER_DAY = 2;
export const MAX_WAITING_POINTS = 20;

// score -> priority
export const THRESHOLDS: { min: number; priority: Priority }[] = [
  { min: 60, priority: "URGENT" },
  { min: 40, priority: "HIGH" },
  { min: 20, priority: "MEDIUM" },
  { min: 0, priority: "LOW" },
];

export interface ScoreResult {
  score: number;
  priority: Priority;
  reasons: string[]; // what made up the score, shown to the manager, ex. ["Electrical +30", "\"sparks\" +40"]
}

// whole words only, so "gas" matches "gas smell" but not "gasket"
function findWord(text: string, words: string[]) {
  return words.find((w) => new RegExp(`\\b${w}\\b`, "i").test(text));
}

export function priorityForScore(score: number): Priority {
  return THRESHOLDS.find((t) => score >= t.min)!.priority;
}

export function scoreRequest(input: {
  categoryName: string;
  title: string;
  description: string;
  createdAt?: Date;
  now?: Date; // so tests can pretend it's later
}): ScoreResult {
  const reasons: string[] = [];
  let score = 0;

  const categoryPoints = CATEGORY_POINTS[input.categoryName.trim().toLowerCase()] ?? DEFAULT_CATEGORY_POINTS;
  score += categoryPoints;
  reasons.push(`${input.categoryName} +${categoryPoints}`);

  const text = `${input.title} ${input.description}`;
  const safety = findWord(text, SAFETY_WORDS);
  if (safety) {
    score += SAFETY_POINTS;
    reasons.push(`"${safety}" (safety) +${SAFETY_POINTS}`);
  }
  const disruption = findWord(text, DISRUPTION_WORDS);
  if (disruption) {
    score += DISRUPTION_POINTS;
    reasons.push(`"${disruption}" +${DISRUPTION_POINTS}`);
  }

  if (input.createdAt) {
    const days = Math.floor(((input.now ?? new Date()).getTime() - input.createdAt.getTime()) / 86_400_000);
    const waiting = Math.min(Math.max(days, 0) * POINTS_PER_DAY, MAX_WAITING_POINTS);
    if (waiting > 0) {
      score += waiting;
      reasons.push(`waiting ${days} day${days === 1 ? "" : "s"} +${waiting}`);
    }
  }

  score = Math.min(score, 100);
  return { score, priority: priorityForScore(score), reasons };
}
