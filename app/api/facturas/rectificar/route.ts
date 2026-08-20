import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { sellarRectificativaDeFactura } from '@/lib/billing/sellar-factura-server';
import { puedeMoverDinero } from '@/lib/permisos-reglas';

// ─────────────────────────────────────────────────────────────────────────────
// Emite una factura rectificativa (issue #769, Fase A — disparo MANUAL). Solo
// staff con puedeMoverDinero: emite números Veri*Factu encadenados, igual
// criterio que /api/facturas/sellar (S-2).
//
// El cliente decide QUÉ se rectifica (tipo R1-R5, método S/I, importes) — el
// servidor no infiere ninguna fórmula fiscal por su cuenta, ver el aviso de
// cabecera en sellar-factura-server.ts. La respuesta incluye `aviso`
// explicando que la transmisión a Fiskaly/AEAT no se ha activado todavía.
// ─────────────────────────────────────────────────────────────────────────────

interface RectificativaEntrante {
  facturaOriginalId: string;
  tipoFactura: 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
  tipoRectificativa: 'S' | 'I';
  baseImponible: number;
  cuotaIVA: number;
  total: number;
  importeRectificacion: number;
}

const TIPOS_VALIDOS = new Set(['R1', 'R2', 'R3', 'R4', 'R5']);

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede emitir facturas rectificativas' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Servidor sin service-role configurada' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as Partial<RectificativaEntrante> | null;
  // ⚠️ `typeof x === 'number'` deja pasar NaN e Infinity, que acabarían en el
  // payload que se firma y se manda a la AEAT. `Number.isFinite` no.
  if (!body?.facturaOriginalId || !TIPOS_VALIDOS.has(body.tipoFactura ?? '')
    || (body.tipoRectificativa !== 'S' && body.tipoRectificativa !== 'I')
    || !Number.isFinite(body.baseImponible) || !Number.isFinite(body.cuotaIVA)
    || !Number.isFinite(body.total) || !Number.isFinite(body.importeRectificacion)) {
    return NextResponse.json({ error: 'Datos de la rectificativa incompletos o inválidos' }, { status: 400 });
  }
  // I-12: los tres importes se aceptaban sueltos, sin comprobar que cuadraran
  // entre ellos. Una rectificativa cuya base + cuota no da el total es una
  // factura mal emitida, y aquí se firma y se envía a Hacienda: es el último
  // sitio donde se puede parar. Un céntimo de margen por el redondeo.
  // `Number.isFinite` valida pero NO estrecha `number | undefined` (a diferencia
  // de `typeof`), así que a partir de aquí se usan estas locales ya estrechadas.
  const base = body.baseImponible as number;
  const cuota = body.cuotaIVA as number;
  const total = body.total as number;
  const importeRectificacion = body.importeRectificacion as number;
  if (Math.abs(base + cuota - total) > 0.01) {
    return NextResponse.json(
      { error: `Los importes no cuadran: base (${base}) + IVA (${cuota}) no da el total (${total}).` },
      { status: 400 },
    );
  }

  // I-12 · idempotencia. `sellarRectificativaDeFactura` YA es idempotente por id
  // (comprueba si esa rectificativa está sellada y no la repite), pero aquí se
  // le pasaba un `randomUUID()` nuevo en cada petición, así que esa comprobación
  // no se activaba jamás: dos clics = dos rectificativas selladas y enviadas a
  // la AEAT sobre la misma factura, y eso no se deshace.
  //
  // El id se deriva del CONTENIDO, así que repetir la misma petición cae en el
  // camino `yaExistia` en vez de emitir otra. Rectificar dos veces la misma
  // factura por los mismos importes exactos es un doble envío, no una intención.
  const facturaRectificativaId = 'rect-' + createHash('sha256')
    .update([sesion.studioId, body.facturaOriginalId, body.tipoFactura, body.tipoRectificativa,
             base, cuota, total, importeRectificacion].join('|'))
    .digest('hex').slice(0, 40);

  const r = await sellarRectificativaDeFactura(admin, {
    studioId: sesion.studioId,
    facturaOriginalId: body.facturaOriginalId,
    facturaRectificativaId,
    tipoFactura: body.tipoFactura as 'R1' | 'R2' | 'R3' | 'R4' | 'R5',
    tipoRectificativa: body.tipoRectificativa,
    baseImponible: base,
    cuotaIVA: cuota,
    total,
    importeRectificacion,
  });
  if (!r.ok) {
    const status = r.error === 'Factura original no encontrada' ? 404 : 500;
    return NextResponse.json({ error: r.error }, { status });
  }
  return NextResponse.json(r);
}
