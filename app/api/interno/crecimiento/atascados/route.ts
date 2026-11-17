import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { hoyEnEstudio, masDias } from '@/lib/utils';
import {
  alertasAtascadas, filaAtascadaDesdeBd, resumirAtascados, validarPeticionSeguimiento, type FilaAtascada,
} from '@/lib/alta/atascados';

// Estudios atascados (lib/alta/atascados.ts): quién empezó el alta y lleva días
// sin avanzar. Leer = `growth.read`; anotar un contacto, posponer o cerrar =
// `crm.update`. La tabla no tiene políticas para el cliente: esto la lee con
// service-role DESPUÉS de comprobar el permiso aquí. Nada se manda solo.

async function leerFilas(db: NonNullable<ReturnType<typeof getSupabaseAdmin>>): Promise<FilaAtascada[] | null> {
  const { data, error } = await db.rpc('estudios_atascados_detalle', { p_limite: 500 });
  if (error || !Array.isArray(data)) return null;
  return (data as unknown[]).map(filaAtascadaDesdeBd).filter((f): f is FilaAtascada => f !== null);
}

export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'growth.read');
  if ('error' in g) return g.error;
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const filas = await leerFilas(db);
  if (!filas) return NextResponse.json({ error: 'No se han podido leer los estudios atascados' }, { status: 500 });

  const alertas = alertasAtascadas(filas, hoyEnEstudio(new Date()));
  return NextResponse.json({ alertas, resumen: resumirAtascados(alertas) });
}

export async function POST(req: NextRequest) {
  const g = await exigirPermiso(req, 'crm.update');
  if ('error' in g) return g.error;
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  let cuerpo: unknown;
  try { cuerpo = await req.json(); } catch { return NextResponse.json({ error: 'Petición no válida' }, { status: 400 }); }
  const v = validarPeticionSeguimiento(cuerpo);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  // Solo se anota sobre una cuenta que está en la lista: el navegador no puede
  // escribir seguimiento de una cuenta cualquiera.
  const filas = await leerFilas(db);
  if (!filas) return NextResponse.json({ error: 'No se ha podido comprobar la cuenta' }, { status: 500 });
  if (!filas.some(f => f.clave === v.v.clave)) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });

  const { v: p } = v;
  const hoy = hoyEnEstudio(new Date());
  const { error } = await db.from('estudios_atascados_seguimiento').insert({
    auth_user_id: p.clave,
    accion: p.accion,
    hasta: p.accion === 'pospuesta' ? masDias(hoy, p.dias ?? 7) : null,
    nota: p.nota ?? null,
    por: g.admin.userId,
  });
  if (error) return NextResponse.json({ error: 'No se ha podido guardar el seguimiento' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
