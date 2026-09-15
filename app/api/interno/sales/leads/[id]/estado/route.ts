// PUT: cambiar estado de lead (movimiento en pipeline)

import type { NextRequest } from 'next/server';
import { comprobarAdminInterno } from '@/lib/interno/auth.ts';
import { tienePermiso } from '@/lib/interno/permisos.ts';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin.ts';
import { moverLead } from '@/lib/sales/leads.ts';

export async function PUT(
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
    const { nuevo_estado, notas } = body;

    if (!nuevo_estado) {
      return Response.json({ error: 'nuevo_estado requerido' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!admin) throw new Error('Base de datos no disponible');

    const lead = await moverLead(admin, {
      lead_id: params.id,
      nuevo_estado,
      actor_id: res.admin.userId,
      notas,
    });

    return Response.json(lead);
  } catch (error) {
    console.error('[/api/interno/sales/leads/[id]/estado] PUT:', error);
    const mensaje = error instanceof Error ? error.message : 'Error desconocido';
    return Response.json({ error: mensaje }, { status: 500 });
  }
}
