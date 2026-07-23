import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { emailValido, parsearFecha, normalizarEstadoMembresia } from '@/lib/csv';
import { uid } from '@/lib/utils';
import { registrarIdsBatch, RE_BATCH_ID } from '@/lib/migracion/batches';

// Una importación con miles de filas hace varios lotes secuenciales de INSERT;
// damos margen sobre el default de Vercel para que no corte a medias.
export const maxDuration = 60;

// Importación masiva de MEMBRESÍAS / BONOS (suscripciones) desde CSV — segunda
// parte de la migración asistida. Autenticada (JWT staff), scopeada al estudio de
// la sesión (nunca se fía del body para el studio_id). Empareja cada fila con una
// socia por EMAIL (debe existir) y con un plan por NOMBRE (debe existir en el
// catálogo). Solo PROPIETARIO y RECEPCION.

const MAX_FILAS = 5000;
const LOTE = 500;

interface FilaEntrada {
  email?: string;
  plan?: string;
  sesiones?: number | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  estado?: string | null;
}

const RE_DIACRITICOS = /[̀-ͯ]/g;
const normPlan = (s: string) => s.toLowerCase().normalize('NFD').replace(RE_DIACRITICOS, '').trim();

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO' && sesion.rol !== 'RECEPCION') {
    return NextResponse.json({ error: 'No tienes permiso para importar membresías' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { rows?: FilaEntrada[]; batchId?: string } | null;
  const filas = body?.rows;
  // Migración Mágica: registrar los ids creados para poder deshacer el lote.
  const batchId = typeof body?.batchId === 'string' && RE_BATCH_ID.test(body.batchId) ? body.batchId : null;
  if (!Array.isArray(filas)) {
    return NextResponse.json({ error: 'Formato inválido: falta el array "rows"' }, { status: 400 });
  }
  if (filas.length === 0) return NextResponse.json({ error: 'No hay filas que importar' }, { status: 400 });
  if (filas.length > MAX_FILAS) {
    return NextResponse.json({ error: `Máximo ${MAX_FILAS} filas por importación` }, { status: 413 });
  }

  // Catálogo del estudio para emparejar: socias por email + planes por nombre.
  const [{ data: socios, error: errS }, { data: planes, error: errP }, { data: susExist, error: errX }] = await Promise.all([
    admin.from('socios').select('id, email').eq('studio_id', sesion.studioId),
    admin.from('planes_tarifa').select('id, nombre, tipo, sesiones').eq('studio_id', sesion.studioId),
    admin.from('suscripciones').select('socio_id, plan_id, estado').eq('studio_id', sesion.studioId),
  ]);
  if (errS || errP || errX) {
    return NextResponse.json({ error: 'No se pudo leer la base de datos' }, { status: 500 });
  }

  const socioPorEmail = new Map<string, string>();
  for (const s of socios ?? []) if (s.email) socioPorEmail.set(s.email.toLowerCase(), s.id);

  const planPorNombre = new Map<string, { id: string; tipo: string; sesiones: number | null }>();
  for (const p of planes ?? []) planPorNombre.set(normPlan(p.nombre), { id: p.id, tipo: p.tipo, sesiones: p.sesiones });

  // Dedup: no recrear una membresía ACTIVA que ya existe (socia + plan). Permite
  // reimportar sin duplicar y no bloquea planes distintos para la misma socia.
  const activasExistentes = new Set<string>();
  for (const s of susExist ?? []) if (s.estado === 'ACTIVA' && s.socio_id && s.plan_id) activasExistentes.add(`${s.socio_id}|${s.plan_id}`);

  const errores: { fila: number; email: string; motivo: string }[] = [];
  const paraInsertar: Record<string, unknown>[] = [];
  const vistosEnLote = new Set<string>();
  const hoy = new Date().toISOString().slice(0, 10);
  let duplicadas = 0;

  filas.forEach((f, i) => {
    const numFila = i + 1;
    const emailRaw = (f.email ?? '').trim();
    const email = emailRaw.toLowerCase();
    const planNombre = (f.plan ?? '').trim();

    if (!emailRaw || !emailValido(emailRaw)) {
      errores.push({ fila: numFila, email: emailRaw, motivo: 'Email no válido' });
      return;
    }
    const socioId = socioPorEmail.get(email);
    if (!socioId) {
      errores.push({ fila: numFila, email: emailRaw, motivo: 'No hay ninguna socia con ese email (impórtala primero)' });
      return;
    }
    if (!planNombre) {
      errores.push({ fila: numFila, email: emailRaw, motivo: 'Falta el plan' });
      return;
    }
    const plan = planPorNombre.get(normPlan(planNombre));
    if (!plan) {
      errores.push({ fila: numFila, email: emailRaw, motivo: `No existe el plan «${planNombre}» en tu catálogo` });
      return;
    }

    const clave = `${socioId}|${plan.id}`;
    if (activasExistentes.has(clave) || vistosEnLote.has(clave)) {
      duplicadas++;
      return;
    }

    const estado = (f.estado ? normalizarEstadoMembresia(f.estado) : null) ?? 'ACTIVA';
    // Solo dedup-tracking de las que quedarán ACTIVA (una socia sí puede tener
    // varias históricas canceladas del mismo plan).
    if (estado === 'ACTIVA') vistosEnLote.add(clave);

    const fechaInicio = parsearFecha(f.fechaInicio) ?? hoy;
    const fechaFin = parsearFecha(f.fechaFin);
    // Saldo de bono: usa el del CSV si viene; si no y el plan es BONO, el del plan.
    const sesionesCsv = typeof f.sesiones === 'number' && Number.isFinite(f.sesiones) ? Math.max(0, Math.trunc(f.sesiones)) : null;
    const sesionesRestantes = sesionesCsv ?? (plan.tipo === 'BONO' ? plan.sesiones : null);

    paraInsertar.push({
      id: `sus-${uid()}`,
      studio_id: sesion.studioId, // autoridad: el estudio del JWT
      socio_id: socioId,
      plan_id: plan.id,
      estado,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      sesiones_restantes: sesionesRestantes,
    });
  });

  let importadas = 0;
  for (let i = 0; i < paraInsertar.length; i += LOTE) {
    const lote = paraInsertar.slice(i, i + LOTE);
    const { error } = await admin.from('suscripciones').insert(lote);
    if (error) {
      if (batchId && importadas > 0) {
        await registrarIdsBatch(admin, { studioId: sesion.studioId, batchId, entidad: 'suscripciones', ids: paraInsertar.slice(0, importadas).map(r => r.id as string) });
      }
      return errorInterno('suscripciones:import', error,
        `Se han importado ${importadas} membresías y el proceso se ha detenido ahí. `
        + 'Comprueba que las socias y los planes del archivo existan ya en tu cuenta, y vuelve a subirlo.',
        500,
        { importadas, duplicadas, errores },
      );
    }
    importadas += lote.length;
  }

  const batchAviso = batchId && importadas > 0
    ? (await registrarIdsBatch(admin, { studioId: sesion.studioId, batchId, entidad: 'suscripciones', ids: paraInsertar.map(r => r.id as string) })) ? null : 'No se pudo registrar el lote para deshacer'
    : null;

  return NextResponse.json({ batchAviso, total: filas.length, importadas, duplicadas, errores });
}
