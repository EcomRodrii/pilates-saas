// GET: detalle de lead
// PATCH: actualizar lead

import type { NextRequest } from 'next/server';
import { comprobarAdminInterno } from '@/lib/interno/auth.ts';
import { tienePermiso } from '@/lib/interno/permisos.ts';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin.ts';
import { obtenerLead, actualizarLead, moverLead } from '@/lib/sales/leads.ts';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const res = await comprobarAdminInterno(request);
    if ('motivo' in res) {
      const codigo = res.motivo === 'MFA_REQUERIDO' ? 401 : 403;
      return Response.json({ error: res.motivo }, { status: codigo });
    }

    if (!tienePermiso(res.admin.permisos, 'crm.update')) {
      return Response.json({ error: 'No tienes permiso' }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    if (!admin) throw new Error('Base de datos no disponible');

    const lead = await obtenerLead(admin, params.id);
    if (!lead) {
      return Response.json({ error: 'Lead no encontrado' }, { status: 404 });
    }

    return Response.json(lead);
  } catch (error) {
    console.error('[/api/interno/sales/leads/[id]] GET:', error);
    const mensaje = error instanceof Error ? error.message : 'Error desconocido';
    return Response.json({ error: mensaje }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const res = await comprobarAdminInterno(request);
    if ('motivo' in res) {
      const codigo = res.motivo === 'MFA_REQUERIDO' ? 401 : 403;
      return Response.json({ error: res.motivo }, { status: codigo });
    }

    if (!tienePermiso(res.admin.permisos, 'crm.update')) {
      return Response.json({ error: 'No tienes permiso' }, { status: 403 });
    }

    const body = await request.json();

    const admin = getSupabaseAdmin();
    if (!admin) throw new Error('Base de datos no disponible');

    // Si se quiere mover de estado, usar endpoint dedicado
    if ('estado' in body) {
      return Response.json(
        { error: 'Para cambiar estado, usa PUT /sales/leads/[id]/estado' },
        { status: 400 }
      );
    }

    const lead = await actualizarLead(admin, params.id, body, res.admin.userId);
    return Response.json(lead);
  } catch (error) {
    console.error('[/api/interno/sales/leads/[id]] PATCH:', error);
    const mensaje = error instanceof Error ? error.message : 'Error desconocido';
    return Response.json({ error: mensaje }, { status: 500 });
  }
}
