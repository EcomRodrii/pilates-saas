import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { computeCierreAnual, mapFacturaRow, mapIngresoManual } from '@/lib/fiscal/cierre-engine';
import { enviarCierreAGestoria } from '@/lib/emails/cierre-gestoria-server';
import type { RowFacturas, RowIngresosManuales } from '@/lib/db-types';

// Envía el paquete del Cierre de año a la gestoría. El servidor RECOMPUTA el
// cierre desde la BD (no confía en números del cliente), guarda el email de la
// gestoría en el estudio para no volver a pedirlo, y manda el resumen + CSV.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { anio?: unknown; email?: unknown } | null;
  const anio = Number(body?.anio);
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!Number.isInteger(anio) || anio < 2000) return NextResponse.json({ error: 'Año no válido' }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Introduce un email de gestoría válido' }, { status: 400 });

  const sid = sesion.studioId;
  const desde = `${anio}-01-01`, hasta = `${anio}-12-31`;

  const [studioRes, facRes, manRes] = await Promise.all([
    admin.from('studios').select('nombre, email, color_primario, logo_url').eq('id', sid).maybeSingle(),
    admin.from('facturas').select('*').eq('studio_id', sid).gte('fecha_emision', desde).lte('fecha_emision', `${hasta}T23:59:59`),
    admin.from('ingresos_manuales').select('*').eq('studio_id', sid).gte('fecha', desde).lte('fecha', hasta),
  ]);

  // Guarda el email de la gestoría para no volver a pedirlo (no rompe si falla).
  await admin.from('studios').update({ gestoria_email: email }).eq('id', sid);

  const facturas = (facRes.data ?? []).map((r) => mapFacturaRow(r as RowFacturas));
  const ingresosManuales = (manRes.data ?? []).map((r) => mapIngresoManual(r as RowIngresosManuales));
  const cierre = computeCierreAnual({ facturas, ingresosManuales, anio });

  if (cierre.totales.numFacturas + cierre.totales.numManuales === 0) {
    return NextResponse.json({ error: `No hay ingresos registrados en ${anio} para enviar.` }, { status: 400 });
  }

  const studio = studioRes.data as { nombre: string | null; email: string | null; color_primario: string | null; logo_url: string | null } | null;

  const r = await enviarCierreAGestoria({
    to: email,
    estudioNombre: studio?.nombre ?? 'Tu estudio',
    estudioEmail: studio?.email,
    logoUrl: studio?.logo_url,
    colorPrimario: studio?.color_primario,
    anio,
    cierre,
  });

  if (r.skipped) return NextResponse.json({ error: 'El envío de emails no está configurado en este servidor.' }, { status: 503 });
  if (!r.ok) return errorInterno('cierre:enviar-gestoria', r.error, 'No se ha podido enviar el email. Inténtalo de nuevo.');
  return NextResponse.json({ ok: true, email });
}
