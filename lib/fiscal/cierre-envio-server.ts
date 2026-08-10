import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { computeCierreAnual, mapFacturaRow, mapIngresoManual } from '@/lib/fiscal/cierre-engine';
import { enviarCierreAGestoria } from '@/lib/emails/cierre-gestoria-server';
import { fetchAllRows } from '@/lib/supabase-data';
import type { RowFacturas, RowIngresosManuales } from '@/lib/db-types';

// Núcleo del envío del Cierre a gestoría, extraído de
// app/api/cierre/enviar-gestoria/route.ts para poder reutilizarlo desde el
// cron de envío automático (lib/inngest/cierre-gestoria-automatico.ts) sin
// pasar por NextRequest/NextResponse. El endpoint sigue siendo el único sitio
// que comprueba `puedeVerFinanzas` y guarda `gestoria_email` — el cron no
// tiene sesión de usuario que comprobar y no debe reescribir el email cada
// vez que corre.

export async function generarYEnviarCierreGestoria(params: {
  studioId: string;
  anio: number;
  trimestre: 1 | 2 | 3 | 4 | null;
  email: string;
}): Promise<{ ok: boolean; sinDatos?: boolean; error?: unknown }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: 'sin service-role' };

  const { studioId: sid, anio, trimestre, email } = params;
  const desde = `${anio}-01-01`, hasta = `${anio}-12-31`;

  // Mismo paginado que el endpoint manual (fetchAllRows): un .select('*')
  // simple lo trunca PostgREST a 1000 filas en silencio.
  const [studioRes, facRes, manRes] = await Promise.all([
    admin.from('studios').select('nombre, email, color_primario, logo_url').eq('id', sid).maybeSingle(),
    fetchAllRows<RowFacturas>(sid, 'facturas', (from, to) =>
      admin.from('facturas').select('*').eq('studio_id', sid)
        .gte('fecha_emision', desde).lte('fecha_emision', `${hasta}T23:59:59`).range(from, to)),
    fetchAllRows<RowIngresosManuales>(sid, 'ingresos_manuales', (from, to) =>
      admin.from('ingresos_manuales').select('*').eq('studio_id', sid)
        .gte('fecha', desde).lte('fecha', hasta).range(from, to)),
  ]);

  if (facRes.error || manRes.error) return { ok: false, error: facRes.error ?? manRes.error };

  const facturas = (facRes.data ?? []).map((r) => mapFacturaRow(r as RowFacturas));
  const ingresosManuales = (manRes.data ?? []).map((r) => mapIngresoManual(r as RowIngresosManuales));
  const cierre = computeCierreAnual({ facturas, ingresosManuales, anio, ...(trimestre != null ? { trimestre } : {}) });

  if (cierre.totales.numFacturas + cierre.totales.numManuales === 0) return { ok: false, sinDatos: true };

  const studio = studioRes.data as { nombre: string | null; email: string | null; color_primario: string | null; logo_url: string | null } | null;

  const r = await enviarCierreAGestoria({
    to: email,
    estudioNombre: studio?.nombre ?? 'Tu estudio',
    estudioEmail: studio?.email,
    logoUrl: studio?.logo_url,
    colorPrimario: studio?.color_primario,
    anio,
    trimestre,
    cierre,
  });

  if (r.skipped || !r.ok) return { ok: false, error: r.error ?? 'envío de emails no configurado' };
  return { ok: true };
}
