import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { contextoCobroDe } from '@/lib/pos/terminal';
import { direccionDelEstudio } from '@/lib/pos/datafono';
import {
  conectarLector, desconectarLector, leerFilaEstudio, leerLector, renombrarLector,
} from '@/lib/pos/datafono-servidor';

// ─────────────────────────────────────────────────────────────────────────────
// El datáfono de Stripe del estudio: verlo, conectarlo, renombrarlo y
// desconectarlo. Lo usan «Conectar datáfono» en la Caja y la fila «Datáfono» de
// Configuración → Cobros y facturas.
//
// Service-role sin RLS debajo: la única cerradura es el rol, en CADA método
// (`puedeMoverDinero`: propietaria y recepción, las que ya pueden cobrar). Lo
// vigila lib/terminal-rol-rutas.test.ts. El estudio sale siempre de la sesión.
//
// Mismas puertas que cobrar (`contextoCobroDe`): Stripe configurado, el modo de
// Stripe que toca en este entorno y la cuenta Connect del estudio. Un datáfono
// se registra en la cuenta del ESTUDIO, nunca en la de la plataforma.
// ─────────────────────────────────────────────────────────────────────────────

const NO_AUTORIZADO = { error: 'No autorizado' };
const SIN_PERMISO = { error: 'Conectar el datáfono lo hace la propietaria o recepción.' };

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json(NO_AUTORIZADO, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) return NextResponse.json(SIN_PERMISO, { status: 403 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor sin configurar' }, { status: 503 });

  const cx = await contextoCobroDe(admin, sesion.studioId);
  if (!cx.ok) {
    // Sin cuenta de Stripe no es un error para esta pantalla: es un estado
    // («primero, el cobro con tarjeta»).
    if (cx.status === 409) return NextResponse.json({ ok: true, stripeConectado: false, emparejado: false, lector: null });
    return NextResponse.json({ error: cx.motivo }, { status: cx.status });
  }
  const fila = await leerFilaEstudio(admin, sesion.studioId);
  const direccion = direccionDelEstudio(fila);
  const base = { ok: true, stripeConectado: true, test: cx.ctx.esTest, direccion };
  if (!cx.readerId) return NextResponse.json({ ...base, emparejado: false, lector: null });

  const lector = await leerLector(cx.ctx, cx.readerId);
  // `undefined` (Stripe no respondió) viaja como ausencia de `lector`: la
  // pantalla lo trata como «comprobando», no como desconectado.
  return NextResponse.json({ ...base, emparejado: true, ...(lector === undefined ? {} : { lector }) });
}

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json(NO_AUTORIZADO, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) return NextResponse.json(SIN_PERMISO, { status: 403 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor sin configurar' }, { status: 503 });

  const cx = await contextoCobroDe(admin, sesion.studioId);
  if (!cx.ok) return NextResponse.json({ error: cx.motivo, ...(cx.status === 409 ? { falta: 'stripe' } : {}) }, { status: cx.status });

  const body = (await req.json().catch(() => ({}))) as { codigo?: unknown; nombre?: unknown; direccion?: unknown };
  const r = await conectarLector(cx.ctx, admin, { codigo: body.codigo, nombre: body.nombre, direccion: body.direccion });
  if (!r.ok) return NextResponse.json({ error: r.error, ...(r.falta ? { falta: r.falta } : {}) }, { status: r.status });
  return NextResponse.json({ ok: true, lector: r.lector });
}

export async function PATCH(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json(NO_AUTORIZADO, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) return NextResponse.json(SIN_PERMISO, { status: 403 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor sin configurar' }, { status: 503 });

  const cx = await contextoCobroDe(admin, sesion.studioId);
  if (!cx.ok) return NextResponse.json({ error: cx.motivo }, { status: cx.status });
  if (!cx.readerId) return NextResponse.json({ error: 'No hay ningún datáfono conectado.' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { nombre?: unknown };
  const r = await renombrarLector(cx.ctx, cx.readerId, body.nombre);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, lector: r.lector });
}

export async function DELETE(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json(NO_AUTORIZADO, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) return NextResponse.json(SIN_PERMISO, { status: 403 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor sin configurar' }, { status: 503 });

  const cx = await contextoCobroDe(admin, sesion.studioId);
  if (!cx.ok) return NextResponse.json({ error: cx.motivo }, { status: cx.status });
  if (!cx.readerId) return NextResponse.json({ ok: true });

  const r = await desconectarLector(cx.ctx, admin, cx.readerId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
