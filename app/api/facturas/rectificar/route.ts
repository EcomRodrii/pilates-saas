import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
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
  if (!body?.facturaOriginalId || !TIPOS_VALIDOS.has(body.tipoFactura ?? '')
    || (body.tipoRectificativa !== 'S' && body.tipoRectificativa !== 'I')
    || typeof body.baseImponible !== 'number' || typeof body.cuotaIVA !== 'number'
    || typeof body.total !== 'number' || typeof body.importeRectificacion !== 'number') {
    return NextResponse.json({ error: 'Datos de la rectificativa incompletos o inválidos' }, { status: 400 });
  }

  const r = await sellarRectificativaDeFactura(admin, {
    studioId: sesion.studioId,
    facturaOriginalId: body.facturaOriginalId,
    facturaRectificativaId: randomUUID(),
    tipoFactura: body.tipoFactura as 'R1' | 'R2' | 'R3' | 'R4' | 'R5',
    tipoRectificativa: body.tipoRectificativa,
    baseImponible: body.baseImponible,
    cuotaIVA: body.cuotaIVA,
    total: body.total,
    importeRectificacion: body.importeRectificacion,
  });
  if (!r.ok) {
    const status = r.error === 'Factura original no encontrada' ? 404 : 500;
    return NextResponse.json({ error: r.error }, { status });
  }
  return NextResponse.json(r);
}
