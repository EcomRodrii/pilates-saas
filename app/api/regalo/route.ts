import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeMoverDinero, puedeVerFinanzas } from '@/lib/permisos-reglas';
import { bloqueoPorSuscripcion } from '@/lib/billing/billing-guard';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  AJUSTES_POR_DEFECTO, MENSAJE_MOTIVO_REGALO, huellaCodigo, pareceCodigo, validarDatosRegalo, validarImporte,
  type AjustesRegalo,
} from '@/lib/regalo/reglas';
import { crearTarjeta, guardarAjustes, leerAjustes, listarTarjetas, pasivoVivo } from '@/lib/regalo/servidor';
import { enviarCorreosRegalo } from '@/lib/regalo/enviar';

export const dynamic = 'force-dynamic';

// Panel · Tarjeta regalo. Cada verbo comprueba el rol en SERVIDOR (la UI no es el límite) y
// escribe por las RPC de service_role; el navegador no escribe ninguna de estas tablas.

// GET: ajustes + tarjetas + pasivo vivo. Lo ve quien ve finanzas.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVerFinanzas(sesion.rol)) return NextResponse.json({ error: 'Tu rol no puede ver las tarjetas regalo' }, { status: 403 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  try {
    const [ajustes, tarjetas] = await Promise.all([leerAjustes(admin, sesion.studioId), listarTarjetas(admin, sesion.studioId)]);
    return NextResponse.json({ ajustes, tarjetas, pasivoVivo: pasivoVivo(tarjetas), puedeEditarAjustes: sesion.rol === 'PROPIETARIO' });
  } catch (err) {
    return errorInterno('regalo:GET', err, 'No se han podido cargar las tarjetas regalo.');
  }
}

const enteros = (v: unknown, max: number, tope: number): number[] | null => {
  if (!Array.isArray(v) || v.length > max) return null;
  const out = v.map(Number);
  return out.every(n => Number.isInteger(n) && n > 0 && n <= tope) ? [...new Set(out)].sort((a, b) => a - b) : null;
};

// PUT: ajustes del producto. Solo la propietaria (es una decisión de oferta y de dinero).
export async function PUT(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'Solo la propietaria cambia la tarjeta regalo' }, { status: 403 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });
  const importes = enteros(b.importesEur, 6, 2000);
  const min = Number(b.importeMinEur); const max = Number(b.importeMaxEur); const meses = Number(b.caducidadMeses);
  if (!importes || !Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 2000 || min > max) {
    return NextResponse.json({ error: 'Revisa los importes: enteros en euros y el mínimo no puede superar al máximo.' }, { status: 400 });
  }
  if (!Number.isInteger(meses) || meses < 1 || meses > 60) return NextResponse.json({ error: 'La caducidad va de 1 a 60 meses.' }, { status: 400 });
  const terminos = typeof b.terminos === 'string' && b.terminos.trim() ? b.terminos.trim().slice(0, 4000) : null;
  const ajustes: AjustesRegalo = {
    activo: b.activo === true, importesEur: importes, permiteImporteLibre: b.permiteImporteLibre !== false,
    importeMinEur: min, importeMaxEur: max, caducidadMeses: meses, terminos,
  };
  const bloqueo = await bloqueoPorSuscripcion(sesion.studioId);
  if (bloqueo) return bloqueo;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });
  const r = await guardarAjustes(admin, sesion.studioId, ajustes);
  if (!r.ok) return errorInterno('regalo:PUT', r.error, 'No se han podido guardar los ajustes.');
  return NextResponse.json({ ok: true, ajustes });
}

const METODOS = ['EFECTIVO', 'TARJETA', 'BIZUM', 'TRANSFERENCIA'] as const;

// POST: { accion: 'vender' | 'buscar' }.
//  · vender: alta de una tarjeta COBRADA FUERA (mostrador). Queda anotado quién y cómo; no
//    mueve la caja de Tentare (la venta por Caja/POS es Fase 2). Devuelve el código UNA vez.
//  · buscar: localiza una tarjeta por su código para gastarla en el mostrador.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) return NextResponse.json({ error: 'Tu rol no puede vender ni gastar tarjetas regalo' }, { status: 403 });
  const limited = await enforceRateLimit(req, 'regalo-staff', { max: 60, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: 'Petición no válida' }, { status: 400 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  if (b.accion === 'buscar') {
    if (typeof b.codigo !== 'string' || !pareceCodigo(b.codigo)) return NextResponse.json({ error: MENSAJE_MOTIVO_REGALO['no-existe'] }, { status: 404 });
    const { data: t } = await admin.from('tarjetas_regalo').select('id').eq('studio_id', sesion.studioId).eq('codigo_hash', huellaCodigo(b.codigo)).maybeSingle();
    if (!t) return NextResponse.json({ error: MENSAJE_MOTIVO_REGALO['no-existe'] }, { status: 404 });
    const todas = await listarTarjetas(admin, sesion.studioId);
    const vista = todas.find(x => x.id === t.id);
    return vista ? NextResponse.json({ tarjeta: vista }) : NextResponse.json({ error: MENSAJE_MOTIVO_REGALO['no-existe'] }, { status: 404 });
  }

  if (b.accion !== 'vender') return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  const bloqueo = await bloqueoPorSuscripcion(sesion.studioId);
  if (bloqueo) return bloqueo;
  try {
    const ajustes = await leerAjustes(admin, sesion.studioId);
    // El mostrador puede vender el importe que quiera dentro del rango del estudio aunque la venta
    // online esté apagada; los importes libres se validan con el mismo rango.
    const importe = validarImporte({ ...AJUSTES_POR_DEFECTO, ...ajustes, permiteImporteLibre: true }, b.importeEur);
    if (!importe.ok) return NextResponse.json({ error: importe.motivo }, { status: 400 });
    const metodo = METODOS.find(m => m === b.metodo);
    if (!metodo) return NextResponse.json({ error: 'Indica cómo se ha cobrado.' }, { status: 400 });
    // En el mostrador el regalo se puede dar en mano: los dos correos son opcionales (el marcador
    // `.invalid` solo existe para pasar la validación común y se descarta justo debajo).
    const sinCorreoComprador = !b.compradorEmail;
    const sinCorreoDestinataria = !b.destinatarioEmail;
    const datos = validarDatosRegalo({
      ...b, compradorEmail: b.compradorEmail || 'sin-correo@example.invalid',
      destinatarioEmail: b.destinatarioEmail || 'sin-correo@example.invalid',
    });
    if (!datos.ok) return NextResponse.json({ error: datos.motivo }, { status: 400 });
    const r = await crearTarjeta(admin, {
      studioId: sesion.studioId, origen: 'MANUAL', sessionId: null, paymentIntentId: null, importeEur: importe.centimos / 100,
      compradorNombre: datos.datos.compradorNombre, compradorEmail: sinCorreoComprador ? null : datos.datos.compradorEmail,
      destinatarioNombre: datos.datos.destinatarioNombre, destinatarioEmail: sinCorreoDestinataria ? null : datos.datos.destinatarioEmail,
      mensaje: datos.datos.mensaje || null, caducidadMeses: ajustes.caducidadMeses, metodoManual: metodo,
      actorTipo: 'staff', actorId: sesion.userId ?? null,
    });
    if (!r.ok) return errorInterno('regalo:POST:vender', r.error, 'No se ha podido crear la tarjeta.');
    const enviado = b.enviarCorreo === false ? { ok: false } : await enviarCorreosRegalo(admin, sesion.studioId, r.tarjetaId);
    return NextResponse.json({ ok: true, tarjetaId: r.tarjetaId, codigo: r.codigo, correoEnviado: enviado.ok });
  } catch (err) {
    return errorInterno('regalo:POST', err, 'No se ha podido crear la tarjeta.');
  }
}
