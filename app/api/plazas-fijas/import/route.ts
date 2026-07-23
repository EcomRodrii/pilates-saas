import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { emailValido, parsearFecha } from '@/lib/csv';
import { uid } from '@/lib/utils';
import { registrarIdsBatch, RE_BATCH_ID } from '@/lib/migracion/batches';

export const maxDuration = 60;

// Importación masiva de PLAZAS FIJAS desde CSV (rescate desde Excel · F2 B2.11).
// Autenticada (JWT staff), scopeada al estudio de la sesión. Empareja por EMAIL de
// la socia (debe existir) + NOMBRE de sala (debe existir). Solo PROPIETARIO/RECEPCION.

const MAX_FILAS = 5000;
const LOTE = 500;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

interface FilaEntrada {
  email?: string;
  diaSemana?: number | null;
  horaInicio?: string | null;
  sala?: string;
  vigenciaDesde?: string | null;
}

const RE_DIACRITICOS = /[̀-ͯ]/g;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(RE_DIACRITICOS, '').trim();

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO' && sesion.rol !== 'RECEPCION') {
    return NextResponse.json({ error: 'No tienes permiso para importar plazas fijas' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { rows?: FilaEntrada[]; batchId?: string } | null;
  const filas = body?.rows;
  const batchId = typeof body?.batchId === 'string' && RE_BATCH_ID.test(body.batchId) ? body.batchId : null;
  if (!Array.isArray(filas)) return NextResponse.json({ error: 'Formato inválido: falta el array "rows"' }, { status: 400 });
  if (filas.length === 0) return NextResponse.json({ error: 'No hay filas que importar' }, { status: 400 });
  if (filas.length > MAX_FILAS) return NextResponse.json({ error: `Máximo ${MAX_FILAS} filas por importación` }, { status: 413 });

  const [{ data: socios, error: errS }, { data: salas, error: errSa }, { data: plazasExist, error: errP }] = await Promise.all([
    admin.from('socios').select('id, email').eq('studio_id', sesion.studioId),
    admin.from('salas').select('id, nombre').eq('studio_id', sesion.studioId),
    admin.from('plazas_fijas').select('socio_id, dia_semana, hora_inicio, sala_id, estado').eq('studio_id', sesion.studioId),
  ]);
  if (errS || errSa || errP) return NextResponse.json({ error: 'No se pudo leer la base de datos' }, { status: 500 });

  const socioPorEmail = new Map<string, string>();
  for (const s of socios ?? []) if (s.email) socioPorEmail.set(s.email.toLowerCase(), s.id);
  const salaPorNombre = new Map<string, string>();
  for (const s of salas ?? []) salaPorNombre.set(norm(s.nombre), s.id);

  // Dedup: no recrear una plaza fija ACTIVA idéntica (socia + día + hora + sala).
  const existentes = new Set<string>();
  for (const p of plazasExist ?? []) {
    if (p.estado === 'ACTIVA') existentes.add(`${p.socio_id}|${p.dia_semana}|${String(p.hora_inicio).slice(0, 5)}|${p.sala_id}`);
  }

  const errores: { fila: number; email: string; motivo: string }[] = [];
  const paraInsertar: Record<string, unknown>[] = [];
  const vistosEnLote = new Set<string>();
  const hoy = new Date().toISOString().slice(0, 10);
  let duplicadas = 0;

  filas.forEach((f, i) => {
    const numFila = i + 1;
    const emailRaw = (f.email ?? '').trim();
    const email = emailRaw.toLowerCase();
    if (!emailRaw || !emailValido(emailRaw)) { errores.push({ fila: numFila, email: emailRaw, motivo: 'Email no válido' }); return; }
    const socioId = socioPorEmail.get(email);
    if (!socioId) { errores.push({ fila: numFila, email: emailRaw, motivo: 'No hay ninguna socia con ese email (impórtala primero)' }); return; }
    if (typeof f.diaSemana !== 'number' || f.diaSemana < 0 || f.diaSemana > 6) { errores.push({ fila: numFila, email: emailRaw, motivo: 'Día de la semana no válido' }); return; }
    const hora = (f.horaInicio ?? '').trim();
    if (!RE_HORA.test(hora)) { errores.push({ fila: numFila, email: emailRaw, motivo: 'Hora no válida' }); return; }
    const salaId = salaPorNombre.get(norm(f.sala ?? ''));
    if (!salaId) { errores.push({ fila: numFila, email: emailRaw, motivo: `No existe la sala «${(f.sala ?? '').trim()}» en tu estudio` }); return; }

    const clave = `${socioId}|${f.diaSemana}|${hora}|${salaId}`;
    if (existentes.has(clave) || vistosEnLote.has(clave)) { duplicadas++; return; }
    vistosEnLote.add(clave);

    paraInsertar.push({
      id: `plaza-${uid()}`,
      studio_id: sesion.studioId,
      socio_id: socioId,
      dia_semana: f.diaSemana,
      hora_inicio: `${hora}:00`,
      sala_id: salaId,
      tipo_clase_id: null,
      spot_id: null,
      vigencia_desde: parsearFecha(f.vigenciaDesde) ?? hoy,
      vigencia_hasta: null,
      estado: 'ACTIVA',
    });
  });

  let importadas = 0;
  for (let i = 0; i < paraInsertar.length; i += LOTE) {
    const lote = paraInsertar.slice(i, i + LOTE);
    const { error } = await admin.from('plazas_fijas').insert(lote);
    if (error) {
      if (batchId && importadas > 0) {
        await registrarIdsBatch(admin, { studioId: sesion.studioId, batchId, entidad: 'plazas_fijas', ids: paraInsertar.slice(0, importadas).map(r => r.id as string) });
      }
      return errorInterno('plazas-fijas:import', error,
        `Se han importado ${importadas} plazas fijas y el proceso se ha detenido ahí. `
        + 'Comprueba que las socias y las salas del archivo existan ya en tu cuenta, y vuelve a subirlo.',
        500, { importadas, duplicadas, errores });
    }
    importadas += lote.length;
  }

  const batchAviso = batchId && importadas > 0
    ? (await registrarIdsBatch(admin, { studioId: sesion.studioId, batchId, entidad: 'plazas_fijas', ids: paraInsertar.map(r => r.id as string) })) ? null : 'No se pudo registrar el lote para deshacer'
    : null;

  return NextResponse.json({ batchAviso, total: filas.length, importadas, duplicadas, errores });
}
