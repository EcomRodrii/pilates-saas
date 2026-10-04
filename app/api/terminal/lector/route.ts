import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { puedeCambiarCuentaDeCobro } from '@/lib/billing/cuenta-cobro';
import { contextoCobroDe } from '@/lib/pos/terminal';
import { direccionDelEstudio } from '@/lib/pos/datafono';
import {
  conectarLector, desconectarLector, leerFilaEstudio, leerLector, renombrarLector,
} from '@/lib/pos/datafono-servidor';
import {
  conectarLectorSumup, cuentaSumup, desconectarLectorSumup, leerLectorSumup, renombrarLectorSumup, sumupDisponible,
} from '@/lib/pos/sumup-lector-servidor';

// ─────────────────────────────────────────────────────────────────────────────
// El datáfono del estudio (el de Stripe o el SumUp Solo): verlo, conectarlo,
// renombrarlo y desconectarlo. Lo usan «Conectar datáfono» en la Caja y la fila
// «Datáfono» de Configuración → Cobros y facturas.
//
// Service-role sin RLS debajo: la única cerradura es el rol, en CADA método
// (`puedeMoverDinero`: propietaria y recepción, las que ya pueden cobrar). Lo
// vigila lib/terminal-rol-rutas.test.ts. El estudio sale siempre de la sesión.
//
// Stripe: mismas puertas que cobrar (`contextoCobroDe`) y el lector en la cuenta
// Connect del ESTUDIO. SumUp: en la cuenta de SumUp del estudio (lib/pos/
// sumup-lector-servidor.ts). Un datáfono por sede: conectar uno olvida el otro en
// el mismo UPDATE y lo da de baja en su proveedor después.
// ─────────────────────────────────────────────────────────────────────────────

const NO_AUTORIZADO = { error: 'No autorizado' };
const SIN_PERMISO = { error: 'Conectar el datáfono lo hace la propietaria o recepción.' };

/** El estudio de la sesión, con su datáfono. Solo después de comprobar el rol. */
async function cargar(studioId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return { res: NextResponse.json({ error: 'Servidor sin configurar' }, { status: 503 }) } as const;
  const fila = await leerFilaEstudio(admin, studioId);
  if (!fila) return { res: NextResponse.json({ error: 'No se ha podido leer el estudio. Inténtalo otra vez.' }, { status: 500 }) } as const;
  return { admin, fila } as const;
}

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json(NO_AUTORIZADO, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) return NextResponse.json(SIN_PERMISO, { status: 403 });
  const p = await cargar(sesion.studioId);
  if ('res' in p) return p.res;
  const { admin, fila } = p;

  const disponible = sumupDisponible(sesion.studioId);
  const sumup = {
    disponible,
    // Sin SumUp para este estudio ni Solo emparejado, no se pregunta por la cuenta.
    cuenta: disponible || fila.sumup_reader_id ? await cuentaSumup(sesion.studioId) : null,
    puedeConectarCuenta: puedeCambiarCuentaDeCobro({ rol: sesion.rol, esDuena: fila.owner_auth_user_id === sesion.userId }),
  };

  const cx = await contextoCobroDe(admin, sesion.studioId);
  const direccion = direccionDelEstudio(fila);
  const base = { ok: true, stripeConectado: cx.ok, test: cx.ok ? cx.ctx.esTest : false, direccion, sumup };

  if (fila.sumup_reader_id) {
    const lector = await leerLectorSumup(sesion.studioId, fila.sumup_reader_id);
    // `undefined` (SumUp no respondió) viaja como ausencia de `lector`: «comprobando».
    return NextResponse.json({ ...base, proveedor: 'sumup', emparejado: true, ...(lector === undefined ? {} : { lector }) });
  }
  if (!cx.ok) {
    // Sin cuenta de Stripe no es un error para esta pantalla: es un estado
    // («primero, el cobro con tarjeta», o conectar un Solo).
    if (cx.status === 409 || disponible) return NextResponse.json({ ...base, proveedor: null, emparejado: false, lector: null });
    return NextResponse.json({ error: cx.motivo }, { status: cx.status });
  }
  if (!cx.readerId) return NextResponse.json({ ...base, proveedor: null, emparejado: false, lector: null });

  const lector = await leerLector(cx.ctx, cx.readerId);
  return NextResponse.json({ ...base, proveedor: 'stripe', emparejado: true, ...(lector === undefined ? {} : { lector }) });
}

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json(NO_AUTORIZADO, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) return NextResponse.json(SIN_PERMISO, { status: 403 });
  const p = await cargar(sesion.studioId);
  if ('res' in p) return p.res;
  const { admin, fila } = p;
  const body = (await req.json().catch(() => ({}))) as { proveedor?: unknown; codigo?: unknown; nombre?: unknown; direccion?: unknown };

  if (body.proveedor === 'sumup') {
    if (!sumupDisponible(sesion.studioId)) {
      return NextResponse.json({ error: 'El datáfono de SumUp todavía no está disponible para tu estudio.' }, { status: 409 });
    }
    const r = await conectarLectorSumup(admin, sesion.studioId, { codigo: body.codigo, nombre: body.nombre, anterior: fila.sumup_reader_id });
    if (!r.ok) return NextResponse.json({ error: r.error, ...(r.falta ? { falta: r.falta } : {}) }, { status: r.status });
    // El de Stripe que hubiera ya está olvidado (mismo UPDATE); se da de baja en Stripe.
    if (fila.stripe_terminal_reader_id) {
      const cx = await contextoCobroDe(admin, sesion.studioId);
      if (cx.ok) await desconectarLector(cx.ctx, admin, fila.stripe_terminal_reader_id).catch(() => {});
    }
    return NextResponse.json({ ok: true, proveedor: 'sumup', lector: r.lector });
  }

  const cx = await contextoCobroDe(admin, sesion.studioId);
  if (!cx.ok) return NextResponse.json({ error: cx.motivo, ...(cx.status === 409 ? { falta: 'stripe' } : {}) }, { status: cx.status });
  const r = await conectarLector(cx.ctx, admin, { codigo: body.codigo, nombre: body.nombre, direccion: body.direccion });
  if (!r.ok) return NextResponse.json({ error: r.error, ...(r.falta ? { falta: r.falta } : {}) }, { status: r.status });
  // El SumUp Solo que hubiera ya está olvidado (mismo UPDATE); se da de baja en SumUp.
  if (fila.sumup_reader_id) await desconectarLectorSumup(admin, sesion.studioId, fila.sumup_reader_id).catch(() => {});
  return NextResponse.json({ ok: true, proveedor: 'stripe', lector: r.lector });
}

export async function PATCH(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json(NO_AUTORIZADO, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) return NextResponse.json(SIN_PERMISO, { status: 403 });
  const p = await cargar(sesion.studioId);
  if ('res' in p) return p.res;
  const { admin, fila } = p;
  const body = (await req.json().catch(() => ({}))) as { nombre?: unknown };

  if (fila.sumup_reader_id) {
    const r = await renombrarLectorSumup(sesion.studioId, fila.sumup_reader_id, body.nombre);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, proveedor: 'sumup', lector: r.lector });
  }
  const cx = await contextoCobroDe(admin, sesion.studioId);
  if (!cx.ok) return NextResponse.json({ error: cx.motivo }, { status: cx.status });
  if (!cx.readerId) return NextResponse.json({ error: 'No hay ningún datáfono conectado.' }, { status: 404 });
  const r = await renombrarLector(cx.ctx, cx.readerId, body.nombre);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, proveedor: 'stripe', lector: r.lector });
}

export async function DELETE(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json(NO_AUTORIZADO, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) return NextResponse.json(SIN_PERMISO, { status: 403 });
  const p = await cargar(sesion.studioId);
  if ('res' in p) return p.res;
  const { admin, fila } = p;

  if (fila.sumup_reader_id) {
    const r = await desconectarLectorSumup(admin, sesion.studioId, fila.sumup_reader_id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true });
  }
  const cx = await contextoCobroDe(admin, sesion.studioId);
  if (!cx.ok) return NextResponse.json({ error: cx.motivo }, { status: cx.status });
  if (!cx.readerId) return NextResponse.json({ ok: true });
  const r = await desconectarLector(cx.ctx, admin, cx.readerId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
