'use server';

import { accionSinImplementar } from '@/lib/actions/errores';
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
  accionSinImplementar('enviarEmailAction');
}
