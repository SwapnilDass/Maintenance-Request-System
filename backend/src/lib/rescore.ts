// keeps automatically-scored priorities up to date as requests wait (story #16).
// the score includes "+2 a day waiting", so an open request's priority can go up over time.
// the request lists and the dashboard call refreshAutoPriorities() first so they always show current priorities
import { prisma } from "./prisma";
import { CLOSED_STATUSES } from "./status";
import { scoreRequest } from "./priorityScore";

// only requests the system scored (priorityScore isn't null) that a manager hasn't overridden.
// cheap enough at this size: one read, and a write only for the ones whose score changed
export async function refreshAutoPriorities() {
  const auto = await prisma.request.findMany({
    where: { status: { notIn: CLOSED_STATUSES }, priorityScore: { not: null }, priorityOverridden: false },
    select: { id: true, title: true, description: true, createdAt: true, priorityScore: true, priority: true, category: { select: { name: true } } },
  });

  const changed = auto
    .map((r) => ({ r, s: scoreRequest({ categoryName: r.category.name, title: r.title, description: r.description, createdAt: r.createdAt }) }))
    .filter(({ r, s }) => s.score !== r.priorityScore || s.priority !== r.priority);

  await Promise.all(
    changed.map(({ r, s }) =>
      prisma.request.update({ where: { id: r.id }, data: { priorityScore: s.score, priority: s.priority } })
    )
  );
}

// adds "scoreReasons" (what the score is made of) to a request for the manager's list and the detail page.
// requests from before sprint 4 weren't scored, so they get an empty list
export function withScoreReasons<
  T extends { title: string; description: string; createdAt: Date; priorityScore: number | null; category: { name: string } },
>(request: T) {
  if (request.priorityScore === null) return { ...request, scoreReasons: [] as string[] };
  const { reasons } = scoreRequest({
    categoryName: request.category.name,
    title: request.title,
    description: request.description,
    createdAt: request.createdAt,
  });
  return { ...request, scoreReasons: reasons };
}
