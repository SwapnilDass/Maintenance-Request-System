// creates notifications (story #8). the request routes call these after a change, so the people
// involved see it under the bell next time they look
import { prisma } from "./prisma";

// one notification per user. skips the person who made the change (no "you assigned this to yourself")
export async function notify(requestId: string, userIds: (string | null | undefined)[], message: string, actorId?: string) {
  const recipients = [...new Set(userIds.filter((id): id is string => !!id && id !== actorId))];
  if (recipients.length === 0) return;
  await prisma.notification.createMany({
    data: recipients.map((userId) => ({ userId, requestId, message })),
  });
}
