import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { mapFilaAVacante, type FilaRedVacante } from '@/lib/network/mapeo';
import { encajeCandidaturaDe } from '@/lib/network/encaje-candidatura';
import { emitirRedVacanteEncaja } from '@/lib/notifications/emit';
import type { VacanteNetwork } from '@/lib/network/tipos';

// Umbral de "encaja lo bastante como para avisar" — solo push, sin canal
// EMAIL: es el único evento de Network no solicitado por quien lo recibe
// (ver lib/notifications/catalog.ts). 2+ criterios aplicables evita avisar
// por una única coincidencia casual (p. ej. solo la ciudad, con el resto de
// datos ausentes en algún lado, daría barra=100 con un solo dato real).
const ENCAJE_MINIMO = 50;
const CRITERIOS_MINIMOS = 2;

const SELECT_COLUMNAS = `
  id, studio_id, titulo, especialidades, horarios, tipo_trabajo, tarifa_rango,
  requisitos, descripcion, estado, creado_en, actualizado_en, cerrado_en
`;

// Publicar/cerrar una vacante — endpoint aparte de PATCH /[id] a propósito
// (mismo criterio que /api/network/perfil/estado): cambiar de estado tiene
// su propia regla de negocio (mínimos para publicar), no debe colarse en
// cada guardado de un campo suelto.
const TRANSICIONES: Record<string, string[]> = {
  draft: ['published'],
  published: ['closed'],
  closed: [],
};

function motivoNoPublicable(fila: Pick<FilaRedVacante, 'titulo' | 'descripcion' | 'especialidades'>): string | null {
  if (!fila.titulo?.trim()) return 'Añade un título antes de publicar.';
  if (!fila.descripcion?.trim()) return 'Añade una descripción antes de publicar.';
  if (!fila.especialidades || fila.especialidades.length === 0) return 'Añade al menos una especialidad antes de publicar.';
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para publicar vacantes.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { estado?: unknown } | null;
  const estado = typeof body?.estado === 'string' ? body.estado : null;
  if (!estado || !(estado in TRANSICIONES)) return errorPeticion('Estado no válido.');

  const { id } = await params;
  const { data: fila, error: errLeer } = await admin
    .from('red_vacantes')
    .select('id, studio_id, titulo, descripcion, especialidades, horarios, tipo_trabajo, tarifa_rango, estado, studios ( ciudad )')
    .eq('id', id)
    .maybeSingle();
  if (errLeer) return errorInterno('network:vacantes:estado:leer', errLeer, 'No se ha podido leer la vacante.');
  if (!fila || fila.studio_id !== sesion.studioId) return NextResponse.json({ error: 'Vacante no encontrada.' }, { status: 404 });

  if (!TRANSICIONES[fila.estado]?.includes(estado)) {
    return errorPeticion(`No se puede pasar de "${fila.estado}" a "${estado}".`);
  }
  if (estado === 'published') {
    const motivo = motivoNoPublicable(fila as Pick<FilaRedVacante, 'titulo' | 'descripcion' | 'especialidades'>);
    if (motivo) return errorPeticion(motivo);
  }

  const ahora = new Date().toISOString();
  const update: Record<string, unknown> = { estado, actualizado_en: ahora };
  if (estado === 'closed') update.cerrado_en = ahora;

  const { data, error } = await admin
    .from('red_vacantes')
    .update(update)
    .eq('id', id)
    .select(SELECT_COLUMNAS)
    .single();
  if (error) return errorInterno('network:vacantes:estado:actualizar', error, 'No se ha podido cambiar el estado de la vacante.');

  // Avisar a instructoras activas cuyo perfil encaja — solo al publicar, en
  // el momento de la acción (sin cron, sin tabla de alertas guardadas: ver
  // diseño de tentare-arquitecto). Best-effort: nunca puede convertir un
  // publicar exitoso en un error de cara al estudio.
  if (estado === 'published') {
    await avisarInstructorasQueEncajan(admin, {
      vacanteId: id,
      studioId: fila.studio_id,
      titulo: fila.titulo,
      especialidades: fila.especialidades as VacanteNetwork['especialidades'],
      horarios: fila.horarios as VacanteNetwork['horarios'],
      tipoTrabajo: fila.tipo_trabajo as VacanteNetwork['tipoTrabajo'],
      tarifaRango: fila.tarifa_rango as VacanteNetwork['tarifaRango'],
      estudioCiudad: (fila.studios as unknown as { ciudad: string | null } | null)?.ciudad ?? null,
    });
  }

  return NextResponse.json({ vacante: mapFilaAVacante(data as unknown as FilaRedVacante) });
}

// Perfiles activos publicados, en memoria contra `encajeCandidaturaDe` — sin
// cron, sin tabla de alertas guardadas. Coste proporcional al volumen de
// `red_perfiles` en ese instante y a UNA acción humana (publicar), no a un
// tic periódico contra todos los estudios (el patrón que ya se comió cuota
// de Inngest con recordatorios/penalizaciones). Best-effort: un fallo aquí
// nunca debe convertir "vacante publicada con éxito" en un error 500.
async function avisarInstructorasQueEncajan(
  admin: SupabaseClient,
  vacante: {
    vacanteId: string; studioId: string; titulo: string;
    especialidades: VacanteNetwork['especialidades']; horarios: VacanteNetwork['horarios'];
    tipoTrabajo: VacanteNetwork['tipoTrabajo']; tarifaRango: VacanteNetwork['tarifaRango'];
    estudioCiudad: string | null;
  },
): Promise<void> {
  try {
    const { data: perfiles } = await admin
      .from('red_perfiles')
      .select('auth_user_id, ciudad, especialidades, disponibilidad_horarios, tipo_trabajo, tarifa_rango')
      .eq('estado', 'published')
      .in('disponibilidad_estado', ['disponible', 'disponible_sustituciones', 'buscando_trabajo']);

    const authUserIds = (perfiles ?? [])
      .filter(p => {
        const encaje = encajeCandidaturaDe(vacante, {
          ciudad: p.ciudad,
          especialidades: p.especialidades as VacanteNetwork['especialidades'],
          disponibilidadHorarios: p.disponibilidad_horarios as VacanteNetwork['horarios'],
          tipoTrabajo: p.tipo_trabajo as string[],
          tarifaRango: p.tarifa_rango as VacanteNetwork['tarifaRango'] | null,
        });
        return encaje.criterios.length >= CRITERIOS_MINIMOS && encaje.barra >= ENCAJE_MINIMO;
      })
      .map(p => p.auth_user_id as string);

    if (authUserIds.length === 0) return;

    await emitirRedVacanteEncaja(admin, {
      studioId: vacante.studioId, vacanteId: vacante.vacanteId, titulo: vacante.titulo, authUserIds,
    });
  } catch (e) {
    console.error('[network] avisarInstructorasQueEncajan:', e instanceof Error ? e.message : e);
  }
}
