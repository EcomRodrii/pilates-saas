'use server';
import { requireAuthInServerAction } from '@/lib/auth-server-action';
export async function decisionesAnalizarAction() {
  await requireAuthInServerAction();
  return { analyzed: true };
}
