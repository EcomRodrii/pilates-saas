import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { uid } from '@/lib/utils';
import { parsearFecha, type FilaPago } from '@/lib/csv';
import { registrarIdsBatch, RE_BATCH_ID } from '@/lib/migracion/batches';
import { puedeVerFinanzas } from '@/lib/permisos-reglas';
import { catalogo } from '@/lib/migracion/catalogo';
import { enforceRateLimit } from '@/lib/rate-limit';

export const maxDuration = 60;

// Importación de PAGOS HISTÓRICOS desde CSV — sexta pieza de la migración
// asistida. Sin esto, la ficha de una socia migrada empieza "en blanco" el día
// del cambio, sin nada de lo que ya pagó en la plataforma anterior.
//
// DECISIÓN IMPORTANTE — esto NO crea recibos reales. `recibos` arrastra Stripe,
// Veri·Factu/AEAT y el cron de dunning; una fila histórica sin factura real ni
// NIF verificado obligaría a apagar toda esa maquinaria con flags nuevos en
// cada consumidor. Se inserta en `pagos_historicos`, una tabla aparte de solo
// lectura desde el cliente — no dispara notificación, gamificación ni entra en
// el cierre fiscal (esos importes ya los declaró la gestoría anterior).
//
// Se empareja por email (la socia debe existir: se importa antes). Un email
// que no encuentra socia se informa y se omite — no se crea una socia nueva
// desde aquí.

const MAX_FILAS = 5000;
const LOTE = 500;

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'pagos-historicos-import', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesionStaff = await verificarSesionStaff(req);
  if (!sesionStaff) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVerFinanzas(sesionStaff.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para importar pagos' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { rows?: FilaPago[]; batchId?: string } | null;
  const batchId = typeof body?.batchId === 'string' && RE_BATCH_ID.test(body.batchId) ? body.batchId : null;
  const filas = body?.rows;
  if (!Array.isArray(filas)) {
    return NextResponse.json({ error: 'Formato inválido: falta el array "rows"' }, { status: 400 });
  }
  if (filas.length === 0) return NextResponse.json({ error: 'No hay filas que importar' }, { status: 400 });
  if (filas.length > MAX_FILAS) {
    return NextResponse.json({ error: `Máximo ${MAX_FILAS} filas por importación` }, { status: 413 });
  }

  const studioId = sesionStaff.studioId;

  const [{ data: socios, error: eS }, { data: pagosExist, error: eP }] = await Promise.all([
    catalogo<{ id: string; email: string | null }>(
      (d, h) => admin.from('socios').select('id, email').eq('studio_id', studioId).is('borrado_en', null).order('id').range(d, h)),
    // Dedup: era el ÚNICO de los ocho importadores sin ninguno, y a la vez su
    // mensaje de fallo a medias dice «vuelve a subirlo». Reimportar duplicaba
    // TODOS los pagos ya cargados, inflando el histórico de facturación que la
    // propietaria ve en la ficha de cada socia, sin forma de distinguirlos.
    catalogo<{ socio_id: string; fecha: string; importe: number; concepto: string | null }>(
      (d, h) => admin.from('pagos_historicos').select('socio_id, fecha, importe, concepto').eq('studio_id', studioId).order('id').range(d, h)),
  ]);
  if (eS || eP) return NextResponse.json({ error: 'No se pudo leer la base de datos' }, { status: 500 });

  const socioPorEmail = new Map<string, string>();
  for (const s of socios ?? []) if (s.email) socioPorEmail.set(s.email.toLowerCase().trim(), s.id);

  // La clave usa el importe en céntimos para no depender de cómo Postgres
  // formatee un numeric(10,2) ('12.50' vs 12.5).
  const claveDe = (socioId: string, fecha: string, importe: number, concepto: string | null) =>
    `${socioId}|${fecha}|${Math.round(importe * 100)}|${(concepto ?? '').trim().toLowerCase()}`;
  //
  // Se cuenta CUÁNTAS veces existe ya cada clave, no si existe. Dos clases
  // sueltas de 10 € el mismo día con el mismo concepto son dos pagos legítimos
  // y distintos: con un Set, el segundo desaparecería del histórico. Con el
  // recuento, se omiten tantas filas como ya haya en la base y el resto entra,
  // así que reimportar el mismo archivo es idempotente Y un archivo con
  // repeticiones reales se importa entero.
  const restantes = new Map<string, number>();
  for (const p of pagosExist ?? []) {
    const k = claveDe(p.socio_id, String(p.fecha).slice(0, 10), Number(p.importe), p.concepto);
    restantes.set(k, (restantes.get(k) ?? 0) + 1);
  }

  interface Pendiente { socioId: string; fecha: string; concepto: string | null; importe: number; medioPago: string | null }
  const pendientes: Pendiente[] = [];
  const errores: { fila: number; motivo: string }[] = [];
  let sinSocia = 0;
  let duplicadas = 0;

  filas.forEach((f, i) => {
    const socioId = socioPorEmail.get((f.email ?? '').toLowerCase().trim());
    if (!socioId) {
      sinSocia++;
      errores.push({ fila: i + 1, motivo: `No hay ninguna socia con el email ${f.email}` });
      return;
    }
    // Revalidación en servidor. Era el único de los ocho que se fiaba del
    // cliente para la fecha y el importe: iban crudos al INSERT. Una fecha
    // vacía (22007) o un importe negativo (viola `importe >= 0`) tumbaban el
    // LOTE DE 500 ENTERO, y el mensaje culpaba a las socias que faltaban, que
    // no tenía nada que ver. La UI ya filtra estas filas, pero cualquier staff
    // puede llamar a la API a mano.
    const fecha = parsearFecha(f.fecha);
    if (!fecha) {
      errores.push({ fila: i + 1, motivo: 'La fecha del pago falta o no se entiende' });
      return;
    }
    const importe = typeof f.importe === 'number' ? f.importe : Number(f.importe);
    if (!Number.isFinite(importe) || importe < 0) {
      errores.push({ fila: i + 1, motivo: 'El importe falta, no es un número o es negativo' });
      return;
    }
    const concepto = (f.concepto ?? '').trim() || null;

    const clave = claveDe(socioId, fecha, importe, concepto);
    const yaHay = restantes.get(clave) ?? 0;
    if (yaHay > 0) { restantes.set(clave, yaHay - 1); duplicadas++; return; }

    pendientes.push({ socioId, fecha, concepto, importe, medioPago: f.medioPago ?? null });
  });

  if (pendientes.length === 0) {
    // Si TODAS eran duplicadas no es un fallo: es una reimportación limpia y
    // debe salir 200, no un 400 que la propietaria lee como «no ha funcionado».
    if (duplicadas > 0 && errores.length === 0) {
      return NextResponse.json({ ok: true, batchAviso: null, importadas: 0, duplicadas, sinSocia, errores: [] });
    }
    return NextResponse.json(
      { error: 'Ninguna fila se pudo emparejar', sinSocia, duplicadas, errores: errores.slice(0, 50) },
      { status: 400 },
    );
  }

  let importadas = 0;
  const idsCreados: string[] = [];
  for (let i = 0; i < pendientes.length; i += LOTE) {
    const lote = pendientes.slice(i, i + LOTE).map(p => ({
      id: `pgh-${uid()}`, studio_id: studioId, socio_id: p.socioId, fecha: p.fecha,
      concepto: p.concepto, importe: p.importe, medio_pago: p.medioPago,
      creado_en: new Date().toISOString(),
    }));
    const { error } = await admin.from('pagos_historicos').insert(lote);
    if (error) {
      if (batchId && idsCreados.length > 0) {
        await registrarIdsBatch(admin, { studioId, batchId, entidad: 'pagos_historicos', ids: idsCreados });
      }
      return errorInterno('pagos-historicos:import', error,
        `Se han importado ${importadas} pagos y el proceso se ha detenido ahí. `
        + 'Comprueba que las socias del archivo existan ya en tu cuenta, y vuelve a subirlo: '
        + 'los que ya están importados se detectan y no se duplican.',
        500, { importadas, duplicadas });
    }
    idsCreados.push(...lote.map(l => l.id));
    importadas += lote.length;
  }
  const batchAviso = batchId && idsCreados.length > 0
    ? (await registrarIdsBatch(admin, { studioId, batchId, entidad: 'pagos_historicos', ids: idsCreados })) ? null : 'No se pudo registrar el lote para deshacer'
    : null;

  return NextResponse.json({
    ok: true,
    batchAviso,
    importadas,
    duplicadas,          // ya estaban: reimportar no duplica
    sinSocia,
    errores: errores.slice(0, 50),
  });
}
