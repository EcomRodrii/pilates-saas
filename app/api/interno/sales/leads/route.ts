// API para listar y crear leads
// GET: listar con filtros
// POST: crear lead

import type { NextRequest } from 'next/server';
import { comprobarAdminInterno } from '@/lib/interno/auth.ts';
import { tienePermiso } from '@/lib/interno/permisos.ts';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin.ts';
import { listarLeads, crearLead } from '@/lib/sales/leads.ts';

export async function GET(request: NextRequest) {
  try {
    const res = await comprobarAdminInterno(request);
    if ('motivo' in res) {
      const codigo = res.motivo === 'MFA_REQUERIDO' ? 401 : 403;
      return Response.json({ error: res.motivo }, { status: codigo });
    }

    if (!tienePermiso(res.admin.permisos, 'crm.update')) {
      return Response.json({ error: 'No tienes permiso para ver leads' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get('estado') || undefined;
    const owner_id = searchParams.get('owner_id') || undefined;
    const ciudad = searchParams.get('ciudad') || undefined;
    const search = searchParams.get('search') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const admin = getSupabaseAdmin();
    if (!admin) throw new Error('Base de datos no disponible');

    const { leads, total } = await listarLeads(admin, {
      estado: estado as any,
      owner_id,
      ciudad,
      search: search || undefined,
      limit,
      offset,
    });

    return Response.json({ leads, total });
  } catch (error) {
    console.error('[/api/interno/sales/leads] GET:', error);
    const mensaje = error instanceof Error ? error.message : 'Error desconocido';
    return Response.json({ error: mensaje }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const res = await comprobarAdminInterno(request);
    if ('motivo' in res) {
      const codigo = res.motivo === 'MFA_REQUERIDO' ? 401 : 403;
      return Response.json({ error: res.motivo }, { status: codigo });
    }

    if (!tienePermiso(res.admin.permisos, 'crm.update')) {
      return Response.json({ error: 'No tienes permiso para crear leads' }, { status: 403 });
    }

    const body = await request.json();
    const { email, estudio_nombre, nombre_contacto, telefono, ciudad, origen, source_url } = body;

    if (!email) {
      return Response.json({ error: 'Email requerido' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!admin) throw new Error('Base de datos no disponible');

    const lead = await crearLead(admin, {
      email,
      estudio_nombre,
      nombre_contacto,
      telefono,
      ciudad,
      origen,
      source_url,
      owner_id: res.admin.userId,
    });

    return Response.json(lead, { status: 201 });
  } catch (error) {
    console.error('[/api/interno/sales/leads] POST:', error);
    const mensaje = error instanceof Error ? error.message : 'Error desconocido';
    return Response.json({ error: mensaje }, { status: 500 });
  }
}
