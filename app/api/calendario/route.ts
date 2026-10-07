import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { mapSesion, mapReserva, mapSala, mapInstructor } from '@/lib/supabase-data';
import {
  enriquecerSesiones, ocultarImporteSiCorresponde, instructoresVisiblesPorRol, completarSesiones, flojaDeRecomendacion,
  type ApartadasDeClase,
  type FlojaDeClase,
} from '@/lib/calendario-datos';
import { diaLocalDe, type BloqueoAgenda } from '@/lib/calendario/ausencias';
import type { RowSesiones, RowReservas, RowSalas, RowInstructores, RowStudios, RowSustituciones, RowStudioHorario } from '@/lib/db-types';
import { puedeGestionarEquipo, puedeVer } from '@/lib/permisos-reglas';

// Rediseño del Calendario — endpoint propio, separado a propósito de
// fetchAllStudioData() (lib/studio-context.tsx). Ese fetch genérico carga TODO
// el panel con el cliente admin (bypasa RLS) y nunca ha dado forma al payload
// por rol — vale para el resto del dashboard, pero el punto 6 del rediseño
// exige que "la respuesta no lleve los campos que ese rol no puede ver", y
// eso no se puede cumplir ocultando en el cliente encima de un over-fetch.
// Aparte, trae solo el rango de fechas visible (día/semana), no el histórico
// entero — cierra P0-29 para esta pantalla sin tocar el fetch genérico.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // Tentare Core retirado (14-sep-2026): el calendario del panel no es de la
  // instructora; su agenda la sirve `/api/portal/instructora/agenda`.
  if (sesion.rol === 'INSTRUCTOR') return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');
  if (!desde || !hasta) return NextResponse.json({ error: 'Faltan desde/hasta' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const studioId = sesion.studioId;

  const [{ data: studioRow }, { data: horarioRows }, { data: sesionesRows }, { data: salasRows }, { data: instructoresRows }] = await Promise.all([
    admin.from('studios').select('hora_apertura, hora_cierre').eq('id', studioId).maybeSingle(),
    admin.from('studio_horario').select('*').eq('studio_id', studioId),
    admin.from('sesiones').select('*').eq('studio_id', studioId).gte('inicio', desde).lt('inicio', hasta),
    admin.from('salas').select('*').eq('studio_id', studioId),
    admin.from('instructores').select('*').eq('studio_id', studioId).eq('activo', true),
  ]);

  const sesionesRaw = (sesionesRows ?? []) as RowSesiones[];
  const sesionIds = sesionesRaw.map(s => s.id);
  const instructorIds = [...new Set(sesionesRaw.map(s => s.instructor_id).filter((id): id is string => !!id))];
  const verFlojas = puedeVer(sesion.rol, '/centro-de-control');

  const [{ data: reservasRows }, { data: sustitucionesRows }, bloqueosRes, inactivasRes, flojasRes, apartadasRes] = await Promise.all([
    sesionIds.length > 0
      ? admin.from('reservas').select('*').in('sesion_id', sesionIds)
      : Promise.resolve({ data: [] as RowReservas[] }),
    sesionIds.length > 0
      ? admin.from('sustituciones')
          .select('id, sesion_id, estado, motivo, sustituta_final_id, creado_en, resuelto_en')
          .in('sesion_id', sesionIds).order('creado_en', { ascending: true })
      : Promise.resolve({ data: [] as Pick<RowSustituciones, 'id' | 'sesion_id' | 'estado' | 'motivo' | 'sustituta_final_id' | 'creado_en' | 'resuelto_en'>[] }),
    // Vacaciones, bajas y bloqueos que pisan clases ya programadas
    // (lib/calendario/ausencias.ts). Un día de margen por cada lado: el rango
    // llega en UTC y los bloqueos se guardan por día del estudio.
    instructorIds.length > 0
      ? admin.from('instructora_disponibilidad_excepciones')
          .select('instructor_id, fecha, hora_inicio, hora_fin, ausencia_id')
          .eq('studio_id', studioId).eq('tipo', 'bloqueo').in('instructor_id', instructorIds)
          .gte('fecha', diaLocalDe(new Date(Date.parse(desde) - 86_400_000).toISOString()))
          .lte('fecha', diaLocalDe(new Date(Date.parse(hasta) + 86_400_000).toISOString()))
      : Promise.resolve({ data: [], error: null }),
    // La instructora de la clase ya no está en el equipo (RES-8): `instructores`
    // de arriba solo trae las activas, así que sin esto no se sabría.
    instructorIds.length > 0
      ? admin.from('instructores').select('id').eq('studio_id', studioId).eq('activo', false).in('id', instructorIds)
      : Promise.resolve({ data: [], error: null }),
    // «Floja» = la regla A4 del Decision OS ya la ha detectado (con sus cifras).
    verFlojas && sesionIds.length > 0
      ? admin.from('recomendaciones').select('id, sesion_id, datos_usados')
          .eq('studio_id', studioId).eq('tipo', 'LLENAR_PLAZAS').eq('estado', 'PENDIENTE')
          .in('sesion_id', sesionIds).gt('expira_en', new Date().toISOString())
      : Promise.resolve({ data: [], error: null }),
    // Plazas apartadas para ClassPass (migr 20261007164222): la hoja de la clase
    // dice cuántas y hasta cuándo, y que quien se apunte irá a la lista de espera.
    sesionIds.length > 0
      ? admin.rpc('plazas_apartadas_de', { p_studio_id: studioId, p_sesion_ids: sesionIds })
      : Promise.resolve({ data: [], error: null }),
  ]);

  // No saber no es lo mismo que «no hay»: si los bloqueos no llegan, el payload
  // lo dice (`ausenciasCargadas`) en vez de dar por cubiertas todas las clases.
  const bloqueosRows = (bloqueosRes.data ?? []) as { instructor_id: string; fecha: string; hora_inicio: string | null; hora_fin: string | null; ausencia_id: string | null }[];
  const ausenciaIds = [...new Set(bloqueosRows.map(b => b.ausencia_id).filter((id): id is string => !!id))];
  const ausenciasRes = ausenciaIds.length > 0
    ? await admin.from('instructora_ausencias').select('id, tipo, desde, hasta').eq('studio_id', studioId).in('id', ausenciaIds)
    : { data: [] as { id: string; tipo: string; desde: string; hasta: string }[], error: null };
  const ausenciasCargadas = !bloqueosRes.error && !ausenciasRes.error;
  const bloqueos: BloqueoAgenda[] = ausenciasCargadas
    ? bloqueosRows.map(b => ({ instructorId: b.instructor_id, fecha: b.fecha, horaInicio: b.hora_inicio, horaFin: b.hora_fin, ausenciaId: b.ausencia_id }))
    : [];
  const ausencias = new Map(((ausenciasRes.data ?? []) as { id: string; tipo: string; desde: string; hasta: string }[]).map(a => [a.id, a]));
  if (apartadasRes.error) console.error('[calendario] no se pudieron leer las plazas apartadas', apartadasRes.error.message);
  const apartadas = new Map<string, ApartadasDeClase>();
  for (const f of (apartadasRes.data ?? []) as { sesion_id: string; plazas: number; liberan_en: string | null }[]) {
    if (f.plazas > 0 && f.liberan_en) apartadas.set(f.sesion_id, { plazas: f.plazas, hasta: f.liberan_en });
  }
  const flojas = new Map<string, FlojaDeClase>();
  for (const r of (flojasRes.data ?? []) as { id: string; sesion_id: string | null; datos_usados: unknown }[]) {
    const floja = r.sesion_id ? flojaDeRecomendacion(r) : null;
    if (floja && r.sesion_id) flojas.set(r.sesion_id, floja);
  }

  // El motivo de una baja puede hablar de la salud de quien la pidió: solo para
  // quien gestiona el equipo (mismo criterio que `puedeVerDetalleAusencias`).
  // Recepción sigue viendo que hay una baja y en qué estado está.
  const verMotivo = puedeGestionarEquipo(sesion.rol);
  const sustitucionesVisibles = (sustitucionesRows ?? []).map(s => (verMotivo ? s : { ...s, motivo: null }));

  const enriquecidas = completarSesiones(enriquecerSesiones(sesionesRaw.map(mapSesion), sustitucionesVisibles), {
    rol: sesion.rol, bloqueos, ausencias, flojas, apartadas,
    instructorasInactivas: new Set(((inactivasRes.data ?? []) as { id: string }[]).map(i => i.id)),
  });
  // Todo el estudio: la instructora ya no llega aquí (403 arriba) y el resto de
  // roles ve todas las clases.
  const sesionesFinal = ocultarImporteSiCorresponde(enriquecidas, sesion.rol);
  const idsVisibles = new Set(sesionesFinal.map(s => s.id));

  const reservasFinal = ((reservasRows ?? []) as RowReservas[])
    .filter(r => !!r.sesion_id && idsVisibles.has(r.sesion_id))
    .map(mapReserva);

  // Pestaña "Historial" del panel lateral (punto 5) — todas las filas de
  // `sustituciones` de esta sesión, no solo la abierta (esa ya se resume en
  // sustitucionAbierta/sustitucionId). Filtrado por las mismas sesiones
  // visibles según rol: una instructora nunca ve el historial de cobertura
  // de una clase ajena.
  type SustitucionRow = Pick<RowSustituciones, 'id' | 'sesion_id' | 'estado' | 'motivo' | 'sustituta_final_id' | 'creado_en' | 'resuelto_en'>;
  const sustitucionesFinal = (sustitucionesVisibles as SustitucionRow[])
    .filter(s => idsVisibles.has(s.sesion_id))
    .map(s => ({
      id: s.id,
      sesionId: s.sesion_id,
      estado: s.estado,
      motivo: s.motivo,
      sustitutaFinalId: s.sustituta_final_id,
      creadoEn: s.creado_en,
      resueltoEn: s.resuelto_en,
    }));

  // studio_horario: 0=domingo..6=sábado (EXTRACT(DOW)); el calendario usa la
  // convención local 0=lunes..6=domingo (mismo mapeo que ya hace el cliente
  // en app/(dashboard)/calendario/page.tsx para `dia`: `d === 0 ? 6 : d - 1`).
  const horarioRaw = (horarioRows ?? []) as RowStudioHorario[];
  const horarioSemana = horarioRaw.map(h => ({ dia: (h.dia_semana + 6) % 7, abierto: h.abierto }));

  // Eje de horas de la rejilla: la ventana más amplia entre los días
  // realmente abiertos, no un horario único ficticio. Si el estudio no
  // tuviera ninguna fila (o los 7 días cerrados, caso borde), cae al
  // fallback de `studios.hora_apertura/hora_cierre`.
  const diasAbiertos = horarioRaw.filter(h => h.abierto && h.hora_apertura && h.hora_cierre);
  const fallback = studioRow as Pick<RowStudios, 'hora_apertura' | 'hora_cierre'> | null;
  const horaApertura = diasAbiertos.length > 0
    ? diasAbiertos.reduce((min, h) => (h.hora_apertura! < min ? h.hora_apertura! : min), diasAbiertos[0].hora_apertura!)
    : fallback?.hora_apertura ?? '08:00:00';
  const horaCierre = diasAbiertos.length > 0
    ? diasAbiertos.reduce((max, h) => (h.hora_cierre! > max ? h.hora_cierre! : max), diasAbiertos[0].hora_cierre!)
    : fallback?.hora_cierre ?? '22:00:00';

  return NextResponse.json({
    sesiones: sesionesFinal,
    reservas: reservasFinal,
    sustituciones: sustitucionesFinal,
    salas: ((salasRows ?? []) as RowSalas[]).map(mapSala),
    // Sin email/teléfono de las compañeras para la instructora (sí los suyos).
    instructores: instructoresVisiblesPorRol(
      ((instructoresRows ?? []) as RowInstructores[]).map(mapInstructor), sesion.rol, sesion.userId,
    ),
    horaApertura,
    horaCierre,
    horarioSemana,
    ausenciasCargadas,
    rol: sesion.rol,
  });
}
