import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';

// Cola de verificaciones pendientes del estudio — docs/NETWORK-IMPLEMENTATION-
// PLAN.md §4 (pantalla en /equipo/verificaciones-network). Mismo permiso que
// gestionar el equipo: confirmar una experiencia es una decisión de gerencia,
// no de mostrador (RECEPCION queda fuera, igual que en la RLS de la tabla).
export interface FilaVerificacionPendiente {
  id: string;
  solicitadoEn: string;
  experienciaId: string;
  nombreEstudio: string;
  fechaInicio: string;
  fechaFin: string | null;
  especialidades: string[];
  descripcion: string | null;
  profesionalNombre: string;
  profesionalFotoUrl: string | null;
}

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) return NextResponse.json({ error: 'No tienes permiso para ver esto' }, { status: 403 });

  const { data, error } = await admin
    .from('red_verificaciones_experiencia')
    .select(`
      id, solicitado_en, experiencia_id,
      red_experiencias (
        id, nombre_estudio, fecha_inicio, fecha_fin, especialidades, descripcion,
        red_perfiles ( nombre, foto_url )
      )
    `)
    .eq('studio_id', sesion.studioId)
    .eq('estado', 'pendiente')
    .order('solicitado_en', { ascending: true });
  if (error) return errorInterno('network:verificaciones:GET', error, 'No se han podido cargar las verificaciones pendientes.');

  type FilaCruda = {
    id: string; solicitado_en: string; experiencia_id: string;
    red_experiencias: {
      id: string; nombre_estudio: string; fecha_inicio: string; fecha_fin: string | null;
      especialidades: string[]; descripcion: string | null;
      red_perfiles: { nombre: string; foto_url: string | null } | null;
    } | null;
  };

  const filas: FilaVerificacionPendiente[] = ((data ?? []) as unknown as FilaCruda[])
    .filter(f => f.red_experiencias)
    .map(f => ({
      id: f.id,
      solicitadoEn: f.solicitado_en,
      experienciaId: f.experiencia_id,
      nombreEstudio: f.red_experiencias!.nombre_estudio,
      fechaInicio: f.red_experiencias!.fecha_inicio,
      fechaFin: f.red_experiencias!.fecha_fin,
      especialidades: f.red_experiencias!.especialidades,
      descripcion: f.red_experiencias!.descripcion,
      profesionalNombre: f.red_experiencias!.red_perfiles?.nombre ?? 'Profesional',
      profesionalFotoUrl: f.red_experiencias!.red_perfiles?.foto_url ?? null,
    }));

  return NextResponse.json({ verificaciones: filas });
}
