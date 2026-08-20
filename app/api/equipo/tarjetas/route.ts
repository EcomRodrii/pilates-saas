import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import type { MiembroCompleto } from '@/lib/equipo-tarjetas.ts';
import { DIAS_LARGOS, MIN_CLASES_OCUPACION } from '@/lib/equipo-tarjetas.ts';

// GET /api/equipo/tarjetas — el equipo, ya listo para la rejilla de tarjetas
// del rediseño. El contrato de permisos vive en `lib/equipo-tarjetas.ts`
// (funciones puras, testeadas); este endpoint solo RECOGE los datos reales y
// decide, campo a campo, qué manda a cada rol: para una instructora mirando a
// una compañera, `email`/`telefono`/`ocupacionPct`/`valoracion`/`horasMes`/
// `costeMes`/`semana`/`horasDia` se ponen a null/vacío ANTES de serializar —
// el valor real nunca sale del servidor, no se esconde en el cliente después
// de haber llegado. `/equipo` ya está bloqueado para RECEPCIÓN en
// `lib/permisos-reglas.ts` (BLOQUEADO_RECEPCION); se repite el guard aquí por
// si algún día un cliente llama a la API sin pasar por esa pantalla.

export const dynamic = 'force-dynamic';

const MS_DIA = 86400000;
const OCUPADAS_ESTADOS = ['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO'];

function lunesDe(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

interface SesionFila {
  id: string;
  instructor_id: string | null;
  tipo_clase_id: string | null;
  sala_id: string | null;
  inicio: string;
  fin: string;
  aforo_maximo: number | null;
  cancelada: boolean;
}

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol === 'RECEPCION') {
    return NextResponse.json({ error: 'No tienes acceso al equipo' }, { status: 403 });
  }

  const ahora = new Date();
  const lunes = lunesDe(ahora);
  const finSemana = new Date(lunes.getTime() + 7 * MS_DIA);
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  // Ventana única que cubre: ocupación de los últimos 30 días, horas del mes en
  // curso y la semana actual completa. El límite futuro es intencional (3
  // semanas): "próxima clase" no necesita alcance ilimitado, y así la query no
  // crece sin tope en un estudio con agenda cargada.
  const desde = new Date(Math.min(ahora.getTime() - 30 * MS_DIA, inicioMes.getTime(), lunes.getTime()));
  const hasta = new Date(ahora.getTime() + 21 * MS_DIA);

  const [{ data: instructores, error: errInst }, { data: sesiones, error: errSes }, valRpc, ultimaClaseRes, dispRes] = await Promise.all([
    admin.from('instructores')
      .select('id, nombre, rol, color, avatar, foto_url, activo, auth_user_id, email, telefono')
      .eq('studio_id', sesion.studioId),
    admin.from('sesiones')
      .select('id, instructor_id, tipo_clase_id, sala_id, inicio, fin, aforo_maximo, cancelada')
      .eq('studio_id', sesion.studioId)
      .eq('cancelada', false)
      .gte('inicio', desde.toISOString())
      .lt('inicio', hasta.toISOString()),
    admin.rpc('valoraciones_resumen_estudio', { p_studio_id: sesion.studioId }),
    // Última clase PASADA de cada instructora, para el aviso de "lleva tiempo
    // sin dar clase" (I-avisoInactividad) — independiente de la ventana de 30
    // días de arriba (esa es para ocupación/coste, esto necesita ver más
    // atrás). Se acota a las 2000 sesiones pasadas más recientes del estudio
    // en vez de sin límite: de ahí en adelante "hace mucho" ya es aviso
    // suficiente, no hace falta la fecha exacta — y así no reintroduce el
    // corte silencioso de 1000 filas de PostgREST con datos imprecisos.
    admin.from('sesiones')
      .select('instructor_id, inicio')
      .eq('studio_id', sesion.studioId)
      .eq('cancelada', false)
      .not('instructor_id', 'is', null)
      .lte('inicio', ahora.toISOString())
      .order('inicio', { ascending: false })
      .limit(2000),
    // P3 (auditoría "Veredicto de Marta"): "Pedirle disponibilidad" no decía
    // si ya había respondido. `guardarDisponibilidad` (lib/sustituciones/
    // disponibilidad.ts) borra e reinserta TODAS sus filas en cada guardado,
    // así que el `creado_en` más reciente de sus propias filas ES la fecha de
    // su último guardado — sin columna nueva. Límite conocido: si guarda su
    // disponibilidad completamente VACÍA, no queda ninguna fila y este dato
    // desaparece — caso raro, no se resuelve aquí.
    admin.from('instructora_disponibilidad')
      .select('instructor_id, creado_en')
      .eq('studio_id', sesion.studioId)
      .order('creado_en', { ascending: false }),
  ]);
  if (errInst) return errorInterno('equipo:tarjetas:instructores', errInst, 'No se ha podido cargar el equipo.');
  if (errSes) return errorInterno('equipo:tarjetas:sesiones', errSes, 'No se ha podido cargar el equipo.');
  if (valRpc.error) return errorInterno('equipo:tarjetas:valoraciones', valRpc.error, 'No se ha podido cargar el equipo.');
  if (ultimaClaseRes.error) return errorInterno('equipo:tarjetas:ultima_clase', ultimaClaseRes.error, 'No se ha podido cargar el equipo.');
  if (dispRes.error) return errorInterno('equipo:tarjetas:disponibilidad', dispRes.error, 'No se ha podido cargar el equipo.');

  // Primera fila vista de cada instructor_id = su más reciente, porque venimos
  // ordenados por inicio descendente.
  const ultimaClasePorInstructor = new Map<string, string>();
  // Mismo dataset, sin otra query: cuántas de esas hasta 2000 sesiones caen en
  // los últimos 90 días, por instructora — base de frecuenciaMensual() en
  // lib/equipo-tarjetas.ts (ver ese comentario para el porqué).
  const hace90dias = new Date(ahora.getTime() - 90 * MS_DIA).toISOString();
  const clasesUltimos90DiasPorInstructor = new Map<string, number>();
  for (const row of (ultimaClaseRes.data ?? []) as { instructor_id: string; inicio: string }[]) {
    if (!ultimaClasePorInstructor.has(row.instructor_id)) ultimaClasePorInstructor.set(row.instructor_id, row.inicio);
    if (row.inicio >= hace90dias) {
      clasesUltimos90DiasPorInstructor.set(row.instructor_id, (clasesUltimos90DiasPorInstructor.get(row.instructor_id) ?? 0) + 1);
    }
  }

  // Primera fila vista por instructor_id = la más reciente (venimos ordenados desc).
  const disponibilidadActualizadaPorInstructor = new Map<string, string>();
  for (const row of (dispRes.data ?? []) as { instructor_id: string; creado_en: string }[]) {
    if (!disponibilidadActualizadaPorInstructor.has(row.instructor_id)) {
      disponibilidadActualizadaPorInstructor.set(row.instructor_id, row.creado_en);
    }
  }

  const sesionesRows = (sesiones ?? []) as SesionFila[];
  const sesionIds = sesionesRows.map(s => s.id);

  const [reservasRes, tiposRes, salasRes, tarifasRes] = await Promise.all([
    sesionIds.length
      ? admin.from('reservas').select('sesion_id, estado').in('sesion_id', sesionIds).in('estado', OCUPADAS_ESTADOS)
      : Promise.resolve({ data: [] as { sesion_id: string; estado: string }[], error: null }),
    admin.from('tipos_clase').select('id, nombre').eq('studio_id', sesion.studioId),
    admin.from('salas').select('id, nombre').eq('studio_id', sesion.studioId),
    // Coste solo tiene sentido calcularlo para PROPIETARIO — evita traer la
    // tabla salarial cuando quien mira no va a ver ningún euro.
    sesion.rol === 'PROPIETARIO'
      ? admin.from('instructor_tarifas').select('instructor_id, tarifa_hora').eq('studio_id', sesion.studioId)
      : Promise.resolve({ data: [] as { instructor_id: string; tarifa_hora: number | null }[], error: null }),
  ]);
  if (reservasRes.error) return errorInterno('equipo:tarjetas:reservas', reservasRes.error, 'No se ha podido cargar el equipo.');

  const nombreTipo = new Map((tiposRes.data ?? []).map(t => [t.id, t.nombre as string]));
  const nombreSala = new Map((salasRes.data ?? []).map(s => [s.id, s.nombre as string]));
  const tarifaPorInstructor = new Map((tarifasRes.data ?? []).map(t => [t.instructor_id, t.tarifa_hora == null ? null : Number(t.tarifa_hora)]));
  const valoracionPorInstructor = new Map(
    ((valRpc.data ?? []) as { instructor_id: string; media: number | string; total: number | string }[])
      .map(r => [r.instructor_id, { media: Number(r.media), total: Number(r.total) }]),
  );

  const ocupadasPorSesion = new Map<string, number>();
  for (const r of (reservasRes.data ?? []) as { sesion_id: string; estado: string }[]) {
    ocupadasPorSesion.set(r.sesion_id, (ocupadasPorSesion.get(r.sesion_id) ?? 0) + 1);
  }

  const porInstructor = new Map<string, SesionFila[]>();
  for (const s of sesionesRows) {
    if (!s.instructor_id) continue;
    const arr = porInstructor.get(s.instructor_id);
    if (arr) arr.push(s); else porInstructor.set(s.instructor_id, [s]);
  }

  // El propio instructor puede tener más de una ficha histórica; la primera
  // activa es la que cuenta — mismo criterio que app/api/equipo/tarifas y
  // app/api/equipo/ausencias.
  const miFicha = (instructores ?? []).find(i => i.auth_user_id === sesion.userId && i.activo !== false) ?? null;

  function labelSesion(s: SesionFila): string {
    const hora = new Date(s.inicio).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const partes = [nombreTipo.get(s.tipo_clase_id ?? '') ?? 'Clase', hora];
    const sala = s.sala_id ? nombreSala.get(s.sala_id) : null;
    if (sala) partes.push(sala);
    return partes.join(' · ');
  }

  const miSemanaDias = new Set<number>();
  if (miFicha) {
    for (const s of porInstructor.get(miFicha.id) ?? []) {
      const d = new Date(s.inicio);
      if (d >= lunes && d < finSemana) miSemanaDias.add((d.getDay() + 6) % 7);
    }
  }

  const gestiona = sesion.rol !== 'INSTRUCTOR';

  const items: MiembroCompleto[] = (instructores ?? []).map(i => {
    const esYo = i.auth_user_id === sesion.userId;
    const propias = porInstructor.get(i.id) ?? [];

    const semana = [0, 0, 0, 0, 0, 0, 0];
    const horasDia: (string | null)[] = [null, null, null, null, null, null, null];
    let enClaseAhora = false;
    let claseHoyLabel: string | null = null;
    let proximaClaseIso: string | null = null;
    let ocupadasVentana = 0;
    let aforoVentana = 0;
    let sesionesVentana = 0;
    let horasMes = 0;
    const misDiasSemana = new Set<number>();

    for (const s of propias) {
      const ini = new Date(s.inicio);
      const fin = new Date(s.fin);
      if (ini >= lunes && ini < finSemana) {
        const dia = (ini.getDay() + 6) % 7;
        semana[dia] += 1;
        misDiasSemana.add(dia);
        const hora = ini.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        horasDia[dia] = horasDia[dia] ? `${horasDia[dia]} · ${hora}` : hora;
      }
      if (ini <= ahora && ahora <= fin) {
        enClaseAhora = true;
        claseHoyLabel = labelSesion(s);
      } else if (ini > ahora && (proximaClaseIso === null || ini.toISOString() < proximaClaseIso)) {
        proximaClaseIso = ini.toISOString();
        if (ini.toDateString() === ahora.toDateString() && !claseHoyLabel) claseHoyLabel = labelSesion(s);
      }
      if (ini >= new Date(ahora.getTime() - 30 * MS_DIA) && ini <= ahora && s.aforo_maximo) {
        ocupadasVentana += ocupadasPorSesion.get(s.id) ?? 0;
        aforoVentana += s.aforo_maximo;
        sesionesVentana += 1;
      }
      if (ini >= inicioMes && ini < new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1)) {
        horasMes += Math.max(0, (fin.getTime() - ini.getTime()) / 3600000);
      }
    }

    // Con menos de MIN_CLASES_OCUPACION clases pasadas, el % es ruido de
    // muestra (típico de un estudio recién creado con una sola clase ya dada
    // y sin clientas reales todavía) — null es "sin datos suficientes", no
    // "0% de ocupación" (#845).
    const ocupacionPct = aforoVentana > 0 && sesionesVentana >= MIN_CLASES_OCUPACION
      ? Math.round((100 * ocupadasVentana) / aforoVentana) : null;
    const tarifa = tarifaPorInstructor.get(i.id) ?? null;
    const costeMes = sesion.rol === 'PROPIETARIO' && tarifa != null ? Math.round(tarifa * horasMes * 100) / 100 : null;

    // Con qué días coincide con quien mira (solo relevante en la vista de
    // compañeras): intersección de sus días con clase esta semana.
    let coincideContigo: string | null = null;
    if (!gestiona && !esYo && miFicha) {
      const comunes = [...misDiasSemana].filter(d => miSemanaDias.has(d)).sort((a, b) => a - b);
      coincideContigo = comunes.length
        ? comunes.map(d => DIAS_LARGOS[d].toLowerCase()).join(' y ')
        : null;
    }

    const base: MiembroCompleto = {
      id: i.id, nombre: i.nombre, rol: i.rol, color: i.color,
      avatar: i.avatar ?? null, fotoUrl: i.foto_url ?? null, activo: i.activo,
      conAcceso: !!i.auth_user_id, esYo,
      email: i.email ?? null, telefono: i.telefono ?? null,
      enClaseAhora, claseHoyLabel, proximaClaseIso,
      ultimaClaseIso: ultimaClasePorInstructor.get(i.id) ?? null,
      clasesUltimos90Dias: clasesUltimos90DiasPorInstructor.get(i.id) ?? (ultimaClasePorInstructor.has(i.id) ? 0 : null),
      semana, horasDia,
      ocupacionPct, valoracion: valoracionPorInstructor.get(i.id) ?? null,
      horasMes: Math.round(horasMes * 10) / 10, costeMes,
      coincideContigo,
      disponibilidadActualizadaEn: disponibilidadActualizadaPorInstructor.get(i.id) ?? null,
    };

    // La vista de compañeras (instructora mirando a otra persona) no recibe
    // NINGÚN campo de gestión: se omiten aquí, no se ocultan en el cliente.
    if (!gestiona && !esYo) {
      return {
        ...base,
        email: null, telefono: null,
        ocupacionPct: null, valoracion: null, horasMes: null, costeMes: null,
        semana: [0, 0, 0, 0, 0, 0, 0], horasDia: [null, null, null, null, null, null, null],
        ultimaClaseIso: null, clasesUltimos90Dias: null,
        disponibilidadActualizadaEn: null,
      };
    }
    return base;
  });

  return NextResponse.json({ items, esInstructora: !gestiona });
}
