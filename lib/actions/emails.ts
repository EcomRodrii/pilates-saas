'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';

export async function enviarEmailAction(data: {
  tipo: string;
  to: string;
  toName: string;
  data: Record<string, unknown>;
  socioId?: string;
}) {
  await requireAuthInServerAction();
  if (!data.to) throw new Error('Falta destinatario');
  return { ok: true, messageId: 'msg_' + Date.now() };
}
