'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { resolverReservaPendiente } from '@/lib/db/supabase-data-admin';

/**
 * reservasResolverpendienteAction
 * Approves or rejects a PENDIENTE_APROBACION reservation
 */

export async function reservasResolverpendienteAction(input: {
  reservaId?: string;
  aprobar?: boolean;
}) {
  const sesion = await requireAuthInServerAction();
  
  if (!puedeGestionarCalendario(sesion.rol)) {
    throw new Error('No tienes permiso');
  }

  if (!input?.reservaId || typeof input.aprobar !== 'boolean') {
    throw new Error('Faltan datos');
  }

  const r = await resolverReservaPendiente({
    studioId: sesion.studioId,
    reservaId: input.reservaId,
    aprobar: input.aprobar,
  });

  if ('error' in r) throw new Error(r.error);
  return r;
}
