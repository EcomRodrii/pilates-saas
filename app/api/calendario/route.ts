import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { mapSesion, mapReserva, mapSala, mapInstructor } from '@/lib/supabase-data';
import { enriquecerSesiones, ocultarImporteSiCorresponde, filtrarSesionesPorRol } from '@/lib/calendario-datos';
import type { RowSesiones, RowReservas, RowSalas, RowInstructores, RowStudios, RowSustituciones, RowStudioHorario } from '@/lib/db-types';

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

  const [{ data: reservasRows }, { data: sustitucionesRows }] = await Promise.all([
    sesionIds.length > 0
      ? admin.from('reservas').select('*').in('sesion_id', sesionIds)
      : Promise.resolve({ data: [] as RowReservas[] }),
    sesionIds.length > 0
      ? admin.from('sustituciones')
          .select('id, sesion_id, estado, motivo, sustituta_final_id, creado_en, resuelto_en')
          .in('sesion_id', sesionIds).order('creado_en', { ascending: true })
      : Promise.resolve({ data: [] as Pick<RowSustituciones, 'id' | 'sesion_id' | 'estado' | 'motivo' | 'sustituta_final_id' | 'creado_en' | 'resuelto_en'>[] }),
  ]);

  let instructorId: string | null = null;
  if (sesion.rol === 'INSTRUCTOR') {
    // limit(1) en vez de maybeSingle(): no hay UNIQUE(auth_user_id, studio_id)
    // en `instructores` (mismo motivo que app/api/mi-disponibilidad/route.ts).
    const { data } = await admin
      .from('instructores').select('id')
      .eq('auth_user_id', sesion.userId).eq('studio_id', studioId)
      .eq('activo', true).order('id', { ascending: true }).limit(1);
    instructorId = (data?.[0]?.id as string | undefined) ?? null;
  }

  const enriquecidas = enriquecerSesiones(sesionesRaw.map(mapSesion), sustitucionesRows ?? []);
  const sinImporteSegunRol = ocultarImporteSiCorresponde(enriquecidas, sesion.rol);
  const sesionesFinal = filtrarSesionesPorRol(sinImporteSegunRol, sesion.rol, instructorId);
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
  const sustitucionesFinal = ((sustitucionesRows ?? []) as SustitucionRow[])
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
    instructores: ((instructoresRows ?? []) as RowInstructores[]).map(mapInstructor),
    horaApertura,
    horaCierre,
    horarioSemana,
    rol: sesion.rol,
  });
}
