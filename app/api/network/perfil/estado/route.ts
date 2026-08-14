import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { mapFilaAPerfil, type FilaRedPerfil } from '@/lib/network/mapeo';

// Tentare Network, Fase 3 (publicación) — docs/NETWORK-IMPLEMENTATION-PLAN.md.
//
// Endpoint APARTE de PUT /api/network/perfil a propósito: cambiar de estado
// tiene una regla de negocio propia (validación mínima para publicar) que no
// debe colarse en cada guardado de un campo suelto del formulario.
//
// 'published' y 'suspended' NUNCA son valores aceptados aquí. 'suspended' ya
// era exclusivo de moderación; 'published' se les unió tras feedback directo
// del fundador (evitar spam/perfiles falsos — un perfil completo ya no
// "se publica solo", pasa por /interno/network primero). La RLS
// (red_perfiles_en_revision) cierra esto por los dos lados: el dueño no
// puede escribir ninguno de los dos ni aunque llame a Supabase REST
// directamente con su propio JWT, saltándose esta API por completo. Este
// 403/400 explícito es solo para dar un mensaje claro — la cerradura real
// ya está en la BD.

const ESTADOS_ACEPTADOS = new Set(['draft', 'en_revision', 'hidden']);

const SELECT_COLUMNAS = `
  id, auth_user_id, slug, nombre, foto_url, ciudad, zona, radio_km, descripcion,
  especialidades, anios_experiencia, tarifa_rango, disponibilidad_estado,
  disponibilidad_horarios, tipo_trabajo, email_contacto, telefono_contacto,
  estado, destacado, identidad_verificada_en, creado_en, actualizado_en, ultimo_acceso_en,
  idiomas, instagram, linkedin, web
`;

// Barra mínima para aparecer en el buscador (Fase 4): con esto un estudio
// puede al menos filtrar por ubicación y especialidad — las dos primeras
// preguntas de cualquier búsqueda. Deliberadamente NO exige el 100% de
// completitud (docs/NETWORK-AUDIT.md riesgo #3: completitud y publicación
// son conceptos distintos, un perfil incompleto pero localizable puede
// publicarse igual).
function motivoNoPublicable(fila: Pick<FilaRedPerfil, 'nombre' | 'ciudad' | 'especialidades'>): string | null {
  if (!fila.nombre?.trim()) return 'Añade tu nombre antes de publicar.';
  if (!fila.ciudad?.trim()) return 'Añade tu ciudad antes de publicar: es el primer filtro que usan los estudios.';
  if (!fila.especialidades || fila.especialidades.length === 0) {
    return 'Añade al menos una especialidad antes de publicar.';
  }
  return null;
}

export async function PATCH(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { estado?: unknown } | null;
  const estado = typeof body?.estado === 'string' ? body.estado : null;
  if (!estado || !ESTADOS_ACEPTADOS.has(estado)) {
    return errorPeticion('Estado no válido.');
  }

  const { data: perfil, error: errLeer } = await admin
    .from('red_perfiles')
    .select('id, nombre, ciudad, especialidades, estado, slug')
    .eq('auth_user_id', usuario.userId)
    .maybeSingle();
  if (errLeer) return errorInterno('network:perfil:estado:leer', errLeer, 'No se ha podido leer tu perfil.');
  if (!perfil) return errorPeticion('Todavía no tienes un perfil creado.', 404);

  if (perfil.estado === 'suspended') {
    return errorPeticion(
      'Tu perfil ha sido suspendido por moderación y no puedes modificarlo. Contacta con soporte si crees que es un error.',
      403,
    );
  }

  if (estado === 'en_revision') {
    const motivo = motivoNoPublicable(perfil as FilaRedPerfil);
    if (motivo) return errorPeticion(motivo);
  }

  // El slug (para /network/instructoras/[slug]) ya NO se genera aquí: solo
  // hace falta cuando el perfil de verdad se vuelve público, y eso ahora lo
  // decide moderación (app/api/interno/network/perfiles), no este endpoint.

  const ahora = new Date().toISOString();
  const { data, error } = await admin
    .from('red_perfiles')
    .update({ estado, actualizado_en: ahora, ultimo_acceso_en: ahora })
    .eq('id', perfil.id)
    .select(SELECT_COLUMNAS)
    .single();
  if (error) return errorInterno('network:perfil:estado:actualizar', error, 'No se ha podido cambiar el estado de tu perfil.');

  return NextResponse.json({ perfil: mapFilaAPerfil(data as unknown as FilaRedPerfil) });
}
