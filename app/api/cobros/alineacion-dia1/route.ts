import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { registrarAuditoriaServidor } from '@/lib/auditoria/registrar-servidor';
import { cargarVistaPreviaAlineacion } from '@/lib/billing/alineacion-dia1-servidor';
import { normalizarModoAlineacion, validarCambioModo } from '@/lib/billing/alineacion-dia1';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// «Cobrar todas las cuotas el día 1»: cómo se alinean las alumnas que YA tienes.
//
//   GET  → VISTA PREVIA. Calculada aquí sobre las cuotas reales; no cobra nada ni
//          escribe nada. Devuelve la lista por alumna, los totales y una `huella`.
//   POST → { modo: 'PROPORCIONAL', huella } activa el modo B; { modo: 'ENTERA' }
//          vuelve al de siempre.
//
// Por qué una ruta y no el `updateStudio` del navegador: es dinero de las alumnas.
// La columna `studios.cobro_dia_1_modo` NO es escribible por `authenticated`
// (migr 20261021190000): solo esta ruta puede ponerla en PROPORCIONAL, y solo si
// trae la huella de la lista que HOY sale. Si la lista cambió desde que la vio
// (otra alumna, otro día, otro ajuste de días mínimos) → 409 y vuelve a verla.
// Volver a ENTERA no pide huella: es el comportamiento de siempre y es reversible.
//
// Solo la PROPIETARIA: es una política de cobro del estudio, y la lista trae nombres.
// El estudio sale SIEMPRE de la sesión, nunca del cuerpo.
// ─────────────────────────────────────────────────────────────────────────────

async function puerta(req: NextRequest, limite: number) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) } as const;
  if (sesion.rol !== 'PROPIETARIO') {
    return { error: NextResponse.json({ error: 'Solo la propietaria puede cambiar cuándo se cobra a las alumnas.' }, { status: 403 }) } as const;
  }
  const limitado = await enforceRateLimit(req, 'cobros-alineacion-dia-1', { max: limite, windowSeconds: 60 }, sesion.userId);
  if (limitado) return { error: limitado } as const;
  const admin = getSupabaseAdmin();
  if (!admin) return { error: NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 }) } as const;
  return { sesion, admin } as const;
}

export async function GET(req: NextRequest) {
  const p = await puerta(req, 20);
  if ('error' in p) return p.error;
  try {
    const { data: est } = await p.admin.from('studios').select('cobro_dia_1_activo, cobro_dia_1_modo').eq('id', p.sesion.studioId).maybeSingle();
    const vista = await cargarVistaPreviaAlineacion(p.admin, p.sesion.studioId);
    return NextResponse.json({
      ...vista,
      dia1Activo: est?.cobro_dia_1_activo === true,
      modo: normalizarModoAlineacion(est?.cobro_dia_1_modo),
    });
  } catch (e) {
    Sentry.captureException(e instanceof Error ? e : new Error('alineacion-dia1 vista previa'), { tags: { area: 'cobros' }, extra: { studioId: p.sesion.studioId } });
    return NextResponse.json({ error: 'No se ha podido calcular la vista previa. Inténtalo otra vez.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const p = await puerta(req, 10);
  if ('error' in p) return p.error;
  const { sesion, admin } = p;
  const cuerpo = await req.json().catch(() => null) as Record<string, unknown> | null;
  const modo = cuerpo?.modo;
  if (modo !== 'PROPORCIONAL' && modo !== 'ENTERA') return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });

  const { data: antes, error: errLeer } = await admin.from('studios').select('cobro_dia_1_activo, cobro_dia_1_modo').eq('id', sesion.studioId).maybeSingle();
  if (errLeer || !antes) {
    if (errLeer) Sentry.captureException(new Error(`[alineacion-dia1] leer: ${errLeer.message}`), { tags: { area: 'cobros' } });
    return NextResponse.json({ error: 'No se ha podido leer el ajuste. Inténtalo otra vez.' }, { status: 500 });
  }
  const modoAntes = normalizarModoAlineacion(antes.cobro_dia_1_modo);

  let huellaActual: string | null = null;
  if (modo === 'PROPORCIONAL' && antes.cobro_dia_1_activo === true) {
    try {
      huellaActual = (await cargarVistaPreviaAlineacion(admin, sesion.studioId)).huella;
    } catch (e) {
      Sentry.captureException(e instanceof Error ? e : new Error('alineacion-dia1 recomputar'), { tags: { area: 'cobros' }, extra: { studioId: sesion.studioId } });
      return NextResponse.json({ error: 'No se ha podido comprobar la lista. Inténtalo otra vez.' }, { status: 500 });
    }
  }
  const v = validarCambioModo({ rol: sesion.rol, modo, dia1Activo: antes.cobro_dia_1_activo === true, huella: cuerpo?.huella, huellaActual });
  if (!v.ok) return NextResponse.json({ error: v.error, codigo: v.codigo }, { status: v.status });

  if (modo !== modoAntes) {
    // Con B, la escritura vuelve a exigir el día 1 encendido: si lo apagó entre la lectura y aquí, no escribe.
    let q = admin.from('studios').update({ cobro_dia_1_modo: modo }).eq('id', sesion.studioId);
    if (modo === 'PROPORCIONAL') q = q.eq('cobro_dia_1_activo', true);
    const { data: filas, error: errEsc } = await q.select('id');
    if (errEsc) {
      Sentry.captureException(new Error(`[alineacion-dia1] escribir: ${errEsc.message}`), { tags: { area: 'cobros' }, extra: { studioId: sesion.studioId } });
      return NextResponse.json({ error: 'No se ha podido guardar. No se ha cambiado nada.' }, { status: 500 });
    }
    if ((filas ?? []).length === 0) {
      return NextResponse.json({ error: 'Primero guarda «Todas el día 1 de cada mes».', codigo: 'DIA_1_APAGADO' }, { status: 409 });
    }
    await registrarAuditoriaServidor(admin, {
      sesion, tabla: 'studios', filaId: sesion.studioId, operacion: 'UPDATE',
      antes: { cobro_dia_1_modo: modoAntes }, despues: { cobro_dia_1_modo: modo },
      contexto: { accion: 'ALINEACION_DIA_1_MODO_CAMBIADO', modo },
    });
  }
  return NextResponse.json({ ok: true, modo, sinCambios: modo === modoAntes });
}
