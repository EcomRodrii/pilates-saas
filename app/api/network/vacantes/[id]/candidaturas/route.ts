import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { mapFilaACandidatura, type FilaRedCandidatura } from '@/lib/network/mapeo';
import { encajeCandidaturaDe, type EncajeCandidatura } from '@/lib/network/encaje-candidatura';
import type { VacanteNetwork } from '@/lib/network/tipos';

// Candidaturas de UNA vacante — solo staff del estudio dueño. Se verifica
// vacante.studio_id === sesion.studioId ANTES de leer nada: el riesgo más
// fácil de colar aquí es que un manager de otro estudio, con un vacanteId
// ajeno, viera la lista de candidatas de un competidor (fuga de datos de
// reclutamiento, no genérica).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // Mismo gate que vacantes POST, vacantes/[id] PATCH, vacantes/[id]/estado
  // PATCH y candidaturas/[id] PATCH: esto no es "staff", es reclutamiento. Sin
  // esto, una RECEPCION del propio estudio veía nombre, foto, ciudad, tarifa,
  // mensaje y notas de cada candidata.
  //
  // ⚠️ PENDIENTE, y no es un olvido: `GET /api/network/vacantes` (el listado)
  // sigue SIN este gate pese a que su cabecera afirma tenerlo. Cerrarlo aquí y
  // no allí deja a RECEPCION viendo la lista de vacantes con su contador de
  // candidaturas. No se cierra en la misma tanda porque `/network` no está en
  // BLOQUEADO_RECEPCION (lib/permisos-reglas.ts): quitarle el listado es una
  // decisión de producto, no un arreglo de seguridad evidente.
  if (!puedeGestionarEquipo(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para ver las candidaturas.' }, { status: 403 });
  }

  const { id } = await params;
  const { data: vacante } = await admin
    .from('red_vacantes')
    .select('id, studio_id, especialidades, horarios, tipo_trabajo, tarifa_rango, studios ( ciudad )')
    .eq('id', id)
    .maybeSingle();
  if (!vacante || vacante.studio_id !== sesion.studioId) {
    return NextResponse.json({ error: 'Vacante no encontrada.' }, { status: 404 });
  }
  const estudioCiudad = (vacante.studios as unknown as { ciudad: string | null } | null)?.ciudad ?? null;
  const vacanteParaEncaje = {
    especialidades: vacante.especialidades as VacanteNetwork['especialidades'],
    horarios: vacante.horarios as VacanteNetwork['horarios'],
    tipoTrabajo: vacante.tipo_trabajo as VacanteNetwork['tipoTrabajo'],
    tarifaRango: vacante.tarifa_rango as VacanteNetwork['tarifaRango'],
    estudioCiudad,
  };

  const { data, error } = await admin
    .from('red_candidaturas')
    .select(`
      id, vacante_id, perfil_id, mensaje, notas_estudio, estado, solicitud_id, creado_en, actualizado_en, resuelto_en,
      red_perfiles ( nombre, foto_url, ciudad, especialidades, disponibilidad_horarios, tipo_trabajo, tarifa_rango )
    `)
    .eq('vacante_id', id)
    .order('creado_en', { ascending: false });
  if (error) return errorInterno('network:vacantes:candidaturas:GET', error, 'No se han podido cargar las candidaturas.');

  type FilaPerfil = {
    nombre: string | null; foto_url: string | null; ciudad: string | null;
    especialidades: string[]; disponibilidad_horarios: string[]; tipo_trabajo: string[]; tarifa_rango: string | null;
  };
  type Fila = FilaRedCandidatura & { red_perfiles: FilaPerfil | null };
  const candidaturas = ((data ?? []) as unknown as Fila[]).map(f => {
    const perfil = f.red_perfiles;
    const encaje: EncajeCandidatura | null = perfil
      ? encajeCandidaturaDe(vacanteParaEncaje, {
        ciudad: perfil.ciudad,
        especialidades: perfil.especialidades as VacanteNetwork['especialidades'],
        disponibilidadHorarios: perfil.disponibilidad_horarios as VacanteNetwork['horarios'],
        tipoTrabajo: perfil.tipo_trabajo,
        tarifaRango: perfil.tarifa_rango as VacanteNetwork['tarifaRango'] | null,
      })
      : null;
    return {
      ...mapFilaACandidatura(f, { perfilNombre: perfil?.nombre ?? null, perfilFotoUrl: perfil?.foto_url ?? null }),
      encaje,
    };
  });

  return NextResponse.json({ candidaturas });
}
