import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { emailValido, MAX_RECUPERACIONES_POR_FILA } from '@/lib/csv';
import { uid } from '@/lib/utils';
import { registrarIdsBatch, RE_BATCH_ID } from '@/lib/migracion/batches';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';
import { catalogo } from '@/lib/migracion/catalogo';
import { enforceRateLimit } from '@/lib/rate-limit';
import { mapLimit } from '@/lib/concurrency';

export const maxDuration = 60;

// Importación de RECUPERACIONES pendientes desde el software anterior. Era lo
// último que el importador no sabía traerse: sin ellas, un estudio que migra
// deja a sus socias sin las clases que ya les debía.
//
// ⚠️ Va por la RPC `crear_recuperacion`, una llamada por recuperación, y NO por
// un INSERT en lotes como el resto de importadores. Es más lento a propósito:
// el tope de 4 vivas por socia, la caducidad según la política del estudio y la
// validación de que la socia es de este estudio viven DENTRO de la RPC.
// Insertando directo habría que reimplementar las tres aquí, y una regla
// escrita dos veces es una regla que acabará diciendo cosas distintas. El
// volumen lo permite: con tope de 4, un estudio de 200 socias tiene como mucho
// 800 recuperaciones vivas.

const MAX_FILAS = 2000;
const CONCURRENCIA = 8;

interface FilaEntrada {
  email?: string;
  cantidad?: number;
  caducaEl?: string | null;
  motivo?: string | null;
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'recuperaciones-import', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // Conceder una recuperación es regalar una clase: mismo permiso que la ficha
  // (`FichaRecuperaciones`) y que la RLS de la tabla desde la 0122.
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para importar recuperaciones' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { rows?: FilaEntrada[]; batchId?: string } | null;
  const filas = body?.rows;
  const batchId = typeof body?.batchId === 'string' && RE_BATCH_ID.test(body.batchId) ? body.batchId : null;
  if (!Array.isArray(filas)) return NextResponse.json({ error: 'Formato inválido: falta el array "rows"' }, { status: 400 });
  if (filas.length === 0) return NextResponse.json({ error: 'No hay filas que importar' }, { status: 400 });
  if (filas.length > MAX_FILAS) return NextResponse.json({ error: `Máximo ${MAX_FILAS} filas por importación` }, { status: 413 });

  const { data: socios, error: errS } = await catalogo<{ id: string; email: string | null }>(
    (d, h) => admin.from('socios').select('id, email').eq('studio_id', sesion.studioId).range(d, h),
  );
  if (errS) return NextResponse.json({ error: 'No se pudo leer la base de datos' }, { status: 500 });

  const socioPorEmail = new Map<string, string>();
  for (const s of socios ?? []) if (s.email) socioPorEmail.set(s.email.toLowerCase(), s.id);

  const errores: { fila: number; email: string; motivo: string }[] = [];
  // Cada recuperación a crear, ya desdoblada: una fila con "cantidad 3" son
  // tres llamadas, porque en la base son tres filas independientes.
  const aCrear: { id: string; fila: number; email: string; socioId: string; caducaEl: string | null; motivo: string | null }[] = [];

  filas.forEach((f, i) => {
    const numFila = i + 1;
    const emailRaw = (f.email ?? '').trim();
    if (!emailRaw || !emailValido(emailRaw)) {
      errores.push({ fila: numFila, email: emailRaw, motivo: 'Email no válido' });
      return;
    }
    const socioId = socioPorEmail.get(emailRaw.toLowerCase());
    if (!socioId) {
      errores.push({ fila: numFila, email: emailRaw, motivo: 'No hay ninguna socia con ese email (impórtala primero)' });
      return;
    }
    const cantidad = Number.isInteger(f.cantidad) ? (f.cantidad as number) : 1;
    if (cantidad < 1 || cantidad > MAX_RECUPERACIONES_POR_FILA) {
      errores.push({ fila: numFila, email: emailRaw, motivo: `Cantidad fuera de rango (1–${MAX_RECUPERACIONES_POR_FILA})` });
      return;
    }
    for (let n = 0; n < cantidad; n++) {
      aCrear.push({
        id: `recup-${uid()}`,
        fila: numFila,
        email: emailRaw,
        socioId,
        caducaEl: f.caducaEl ?? null,
        motivo: f.motivo ?? null,
      });
    }
  });

  const creadas: string[] = [];
  let tope = 0;
  let falloRpc: unknown = null;

  const resultados = await mapLimit(aCrear, CONCURRENCIA, async (r) => {
    const { data, error } = await admin.rpc('crear_recuperacion', {
      p_id: r.id,
      p_studio_id: sesion.studioId,
      p_socio_id: r.socioId,
      p_origen_reserva_id: null,
      p_motivo: r.motivo,
      p_caduca_el: r.caducaEl,
    });
    if (error) return { r, estado: 'ERROR' as const, error };
    return { r, estado: (data as string) ?? 'ERROR', error: null };
  });

  for (const res of resultados) {
    if (res.estado === 'CREADA') { creadas.push(res.r.id); continue; }
    if (res.estado === 'TOPE') {
      // No es un fallo del archivo: la socia ya tiene el máximo de 4 vivas. Se
      // cuenta aparte para poder decirlo tal cual en el acta, en vez de
      // esconderlo entre los errores.
      tope++;
      continue;
    }
    if (res.error) falloRpc = res.error;
    errores.push({
      fila: res.r.fila,
      email: res.r.email,
      motivo: res.estado === 'YA_EXISTE' ? 'Ya la tenía importada' : 'No se pudo crear',
    });
  }

  const batchAviso = batchId && creadas.length > 0
    ? (await registrarIdsBatch(admin, { studioId: sesion.studioId, batchId, entidad: 'recuperaciones', ids: creadas })) ? null : 'No se pudo registrar el lote para deshacer'
    : null;

  // Un fallo de la RPC no borra lo ya creado (queda registrado en el lote para
  // poder deshacerlo), pero sí se reporta: el acta tiene que decir dónde se
  // torció, no dar por bueno un import a medias.
  if (falloRpc && creadas.length === 0) {
    return errorInterno('recuperaciones:import', falloRpc,
      'No se ha podido importar ninguna recuperación. Comprueba que las socias del archivo existan ya en tu cuenta.',
      500, { importadas: 0, tope, errores });
  }

  return NextResponse.json({
    batchAviso,
    total: filas.length,
    importadas: creadas.length,
    duplicadas: tope,
    errores,
  });
}
