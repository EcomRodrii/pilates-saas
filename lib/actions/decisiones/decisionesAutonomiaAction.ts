'use server';
import { requireAuthInServerAction } from '@/lib/auth-server-action';
export async function decisionesAutonomiaAction(input: { enabled?: boolean }) {
  await requireAuthInServerAction();
  return { autonomiaEnabled: input.enabled };
}
