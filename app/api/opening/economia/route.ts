import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { requireSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarApertura, puedeVerFinanzas } from '@/lib/permisos-reglas';
import type { Rol } from '@/lib/types';
import { cargarEstadoApertura } from '@/lib/opening/servidor';
import { cargarEntradaEconomia } from '@/lib/opening/economia-servidor';
import { simularEconomia } from '@/lib/opening/economia';

// Simulador económico de la apertura («¿Cuánto necesito aguantar?»). Se carga
// al desplegar el bloque, no con la home.
//
// ⚠️ Cliente service-role: la RLS NO filtra aquí. Solo quien gestiona la
// apertura Y ve finanzas —hoy, la propietaria—, el mismo criterio que la RLS de
// opening_economia (migr 20260922000237). MANAGER gestiona la apertura pero no
// ve el dinero del estudio.
const puede = (rol: Rol) => puedeGestionarApertura(rol) && puedeVerFinanzas(rol);

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puede(sesion.rol)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const admin = requireSupabaseAdmin();
  try {
    const estado = await cargarEstadoApertura(admin, sesion.studioId);
    if (!estado) return NextResponse.json({ error: 'No se pudo cargar' }, { status: 500 });
    const entrada = await cargarEntradaEconomia(admin, sesion.studioId, estado.config, new Date());
    return NextResponse.json({
      fijosMes: entrada.fijosMes,
      colchon: entrada.colchon,
      ivaPct: entrada.ivaPct,
      sesionesSemanaSinTope: entrada.sesionesSemanaSinTope,
      resultado: simularEconomia(entrada),
    });
  } catch (e) {
    console.error('[opening:economia:get]', e);
    return NextResponse.json({ error: 'No se pudo calcular' }, { status: 500 });
  }
}

const MAX_EUR = 10_000_000;
function importe(v: unknown): number | null | 'invalido' {
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_EUR) return 'invalido';
  return Math.round(v * 100) / 100;
}

// PATCH { fijosMes: number|null, colchon: number|null } — null = borrar el dato.
export async function PATCH(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puede(sesion.rol)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });

  const body = await req.json().catch(() => null) as { fijosMes?: unknown; colchon?: unknown } | null;
  if (!body || typeof body !== 'object' || !('fijosMes' in body) || !('colchon' in body)) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
  const fijos = importe(body.fijosMes);
  const colchon = importe(body.colchon);
  if (fijos === 'invalido' || colchon === 'invalido') {
    return NextResponse.json({ error: 'Pon cantidades en euros, sin signo negativo.' }, { status: 400 });
  }
  const { error } = await requireSupabaseAdmin().from('opening_economia').upsert(
    { studio_id: sesion.studioId, fijos_mes_eur: fijos, colchon_eur: colchon, updated_at: new Date().toISOString() },
    { onConflict: 'studio_id' },
  );
  if (error) {
    console.error('[opening:economia:patch]', error);
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
