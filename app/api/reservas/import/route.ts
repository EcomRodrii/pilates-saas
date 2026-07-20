import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { horaParedAInstante } from '@/lib/citas/slots';
import { uid } from '@/lib/utils';
import type { FilaReserva } from '@/lib/csv';

// Importación de RESERVAS desde CSV — cuarta pieza de la migración asistida.
// Sin ella, el día del cambio las clases salen vacías y las alumnas llegan sin su
// sitio. Admite además el histórico (ASISTIDA / NO_ASISTIO), que alimenta el
// riesgo de plantón y las señales de retención.
//
// Cada fila se empareja con:
//   · la SOCIA, por email (debe existir: se importa antes),
//   · la SESIÓN, por nombre de clase + fecha + hora (debe existir: se importa
//     con el horario). No se crean sesiones aquí: una reserva sin su clase sería
//     un dato huérfano, así que se informa y se omite.
//
// DECISIÓN IMPORTANTE — no se consumen bonos. Los saldos se importan tal cual
// venían del programa anterior, así que ya reflejan lo consumido; descontar otra
// vez al importar las reservas cobraría dos veces la misma clase.
//
// El aforo NO bloquea: si el histórico trae una clase por encima de su aforo, se
// importa igual y se avisa. Descartar en silencio la reserva de alguien es peor
// que un aviso.

const MAX_FILAS = 5000;
const LOTE = 500;
const TZ = 'Europe/Madrid';

const RE_DIACRITICOS = /[̀-ͯ]/g;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(RE_DIACRITICOS, '').trim();

const OCUPA_PLAZA = ['CONFIRMADA', 'ASISTIDA'];

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesionStaff = await verificarSesionStaff(req);
  if (!sesionStaff) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesionStaff.rol !== 'PROPIETARIO' && sesionStaff.rol !== 'RECEPCION') {
    return NextResponse.json({ error: 'No tienes permiso para importar reservas' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { rows?: FilaReserva[] } | null;
  const filas = body?.rows;
  if (!Array.isArray(filas)) {
    return NextResponse.json({ error: 'Formato inválido: falta el array "rows"' }, { status: 400 });
  }
  if (filas.length === 0) return NextResponse.json({ error: 'No hay filas que importar' }, { status: 400 });
  if (filas.length > MAX_FILAS) {
    return NextResponse.json({ error: `Máximo ${MAX_FILAS} filas por importación` }, { status: 413 });
  }

  const studioId = sesionStaff.studioId;

  // ── Catálogo para emparejar ────────────────────────────────────────────────
  const [{ data: socios, error: eS }, { data: tipos, error: eT }, { data: sesiones, error: eSes }] = await Promise.all([
    admin.from('socios').select('id, email').eq('studio_id', studioId).is('borrado_en', null),
    admin.from('tipos_clase').select('id, nombre').eq('studio_id', studioId),
    admin.from('sesiones').select('id, tipo_clase_id, inicio, aforo_maximo').eq('studio_id', studioId),
  ]);
  if (eS || eT || eSes) return NextResponse.json({ error: 'No se pudo leer la base de datos' }, { status: 500 });

  const socioPorEmail = new Map<string, string>();
  for (const s of socios ?? []) if (s.email) socioPorEmail.set(s.email.toLowerCase().trim(), s.id);

  const tipoIdPorNombre = new Map<string, string>();
  for (const t of tipos ?? []) tipoIdPorNombre.set(norm(t.nombre), t.id);

  // Índice de sesiones por (tipo de clase, instante de inicio).
  const sesionPorClave = new Map<string, { id: string; aforo: number }>();
  for (const s of sesiones ?? []) {
    const clave = `${s.tipo_clase_id}|${new Date(s.inicio as string).toISOString()}`;
    sesionPorClave.set(clave, { id: s.id, aforo: s.aforo_maximo ?? 0 });
  }

  // Reservas activas ya existentes: el índice único uq_reserva_activa_socio_sesion
  // ya impide duplicar, pero filtrarlas aquí evita errores de lote enteros.
  const { data: yaReservado } = await admin
    .from('reservas').select('sesion_id, socio_id, estado').eq('studio_id', studioId);
  const activas = new Set(
    (yaReservado ?? [])
      .filter(r => ['CONFIRMADA', 'LISTA_ESPERA', 'ASISTIDA'].includes(r.estado as string))
      .map(r => `${r.sesion_id}|${r.socio_id}`),
  );

  // Ocupación actual por sesión, para avisar de sobreaforo tras importar.
  const ocupadas = new Map<string, number>();
  for (const r of yaReservado ?? []) {
    if (!OCUPA_PLAZA.includes(r.estado as string) || !r.sesion_id) continue;
    ocupadas.set(r.sesion_id as string, (ocupadas.get(r.sesion_id as string) ?? 0) + 1);
  }

  // ── Resolución fila a fila ─────────────────────────────────────────────────
  interface Pendiente { sesionId: string; socioId: string; estado: string }
  const pendientes: Pendiente[] = [];
  const errores: { fila: number; motivo: string }[] = [];
  let sinSocia = 0, sinSesion = 0, duplicadas = 0;
  const vistas = new Set<string>(); // dedup dentro del propio fichero

  filas.forEach((f, i) => {
    const socioId = socioPorEmail.get((f.email ?? '').toLowerCase().trim());
    if (!socioId) {
      sinSocia++;
      errores.push({ fila: i + 1, motivo: `No hay ninguna socia con el email ${f.email}` });
      return;
    }
    const tipoId = tipoIdPorNombre.get(norm(f.clase ?? ''));
    if (!tipoId) {
      sinSesion++;
      errores.push({ fila: i + 1, motivo: `No existe la clase "${f.clase}" — importa antes el horario` });
      return;
    }
    if (!f.fecha || !f.horaInicio) {
      errores.push({ fila: i + 1, motivo: 'Fecha u hora vacías' });
      return;
    }
    const inicioISO = horaParedAInstante(f.fecha, f.horaInicio, TZ).toISOString();
    const sesion = sesionPorClave.get(`${tipoId}|${inicioISO}`);
    if (!sesion) {
      sinSesion++;
      errores.push({ fila: i + 1, motivo: `No hay ninguna clase de "${f.clase}" el ${f.fecha} a las ${f.horaInicio}` });
      return;
    }

    const clave = `${sesion.id}|${socioId}`;
    const esActiva = ['CONFIRMADA', 'LISTA_ESPERA', 'ASISTIDA'].includes(f.estado);
    if (esActiva && (activas.has(clave) || vistas.has(clave))) { duplicadas++; return; }
    if (esActiva) vistas.add(clave);

    pendientes.push({ sesionId: sesion.id, socioId, estado: f.estado });
  });

  if (pendientes.length === 0) {
    return NextResponse.json(
      { error: 'Ninguna fila se pudo emparejar', sinSocia, sinSesion, duplicadas, errores: errores.slice(0, 50) },
      { status: 400 },
    );
  }

  // ── Inserción por lotes ────────────────────────────────────────────────────
  let importadas = 0;
  for (let i = 0; i < pendientes.length; i += LOTE) {
    const lote = pendientes.slice(i, i + LOTE).map(p => ({
      id: `res-${uid()}`, studio_id: studioId, sesion_id: p.sesionId, socio_id: p.socioId,
      estado: p.estado, spot_id: null, posicion_espera: null,
      check_in_en: p.estado === 'ASISTIDA' ? new Date().toISOString() : null,
      creado_en: new Date().toISOString(),
    }));
    const { error } = await admin.from('reservas').insert(lote);
    if (error) {
      return errorInterno('reservas:import', error,
        `Se han importado ${importadas} reservas y el proceso se ha detenido ahí. `
        + 'Comprueba que las socias y las clases del archivo existan ya en tu cuenta, y vuelve a subirlo.',
        500, { importadas });
    }
    importadas += lote.length;
  }

  // Aviso de sobreaforo: se importa igual, pero el estudio debe saberlo.
  for (const p of pendientes) {
    if (OCUPA_PLAZA.includes(p.estado)) ocupadas.set(p.sesionId, (ocupadas.get(p.sesionId) ?? 0) + 1);
  }
  let sobreAforo = 0;
  for (const [sesionId, n] of ocupadas) {
    const s = [...sesionPorClave.values()].find(x => x.id === sesionId);
    if (s && s.aforo > 0 && n > s.aforo) sobreAforo++;
  }

  return NextResponse.json({
    ok: true,
    importadas,
    duplicadas,     // ya estaban: reimportar no duplica
    sinSocia,       // email que no existe en el estudio
    sinSesion,      // no se encontró la clase a esa fecha/hora
    sobreAforo,     // clases que quedan por encima de su aforo
    errores: errores.slice(0, 50),
  });
}
