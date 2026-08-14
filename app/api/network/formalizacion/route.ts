import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase, verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { uid } from '@/lib/utils';

// Formalizar contratación (siguiente fase tras #1069) — brief del fundador:
// "en cuanto consigan tener un chat y acorden [...] las 2 aceptan se crea la
// instructora en equipo y elegir si temporal, indefinido". Doble
// confirmación explícita sobre el hilo YA existente (red_mensajes), nunca un
// alta unilateral: cualquiera de las dos partes propone un tipo de
// contrato, la otra lo confirma tal cual (no puede cambiarlo a ciegas), y
// solo cuando AMBAS marcas están rellenas se intenta el alta real en
// `instructores` — y esa ejecución exige además `puedeGestionarEquipo`,
// igual que app/api/equipo/route.ts: que el chat tenga consenso no sustituye
// el control de roles de quién puede escribir en el equipo.
type FilaFormalizacion = {
  id: string;
  solicitud_id: string;
  propuesto_por: string;
  tipo_contrato: 'temporal' | 'indefinido';
  estudio_confirmado_en: string | null;
  instructora_confirmada_en: string | null;
  estado: 'pendiente' | 'confirmada' | 'cancelada';
  instructor_id: string | null;
};

async function resolverParticipante(req: NextRequest, admin: ReturnType<typeof getSupabaseAdmin>, solicitudIdBody?: string) {
  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario || !admin) return null;

  const solicitudId = req.nextUrl.searchParams.get('solicitudId') ?? solicitudIdBody;
  if (typeof solicitudId !== 'string') return null;

  const { data: solicitud } = await admin
    .from('red_solicitudes_contacto')
    .select('id, perfil_id, studio_id, estado, red_perfiles ( auth_user_id, nombre )')
    .eq('id', solicitudId).eq('estado', 'aceptada').maybeSingle();
  if (!solicitud) return null;

  const perfil = solicitud.red_perfiles as unknown as { auth_user_id: string; nombre: string } | null;
  if (perfil?.auth_user_id === usuario.userId) {
    return {
      userId: usuario.userId, solicitudId, studioId: solicitud.studio_id as string,
      perfilId: solicitud.perfil_id as string, nombrePerfil: perfil.nombre,
      lado: 'instructora' as const, sesionStaff: null,
    };
  }

  const sesionStaff = await verificarSesionStaff(req);
  if (sesionStaff && sesionStaff.studioId === solicitud.studio_id) {
    return {
      userId: usuario.userId, solicitudId, studioId: solicitud.studio_id as string,
      perfilId: solicitud.perfil_id as string, nombrePerfil: perfil?.nombre ?? '',
      lado: 'estudio' as const, sesionStaff,
    };
  }

  return null;
}

// Si ambas partes ya confirmaron y todavía no se ejecutó el alta, lo intenta
// AHORA — pero solo si quien llama es staff con permiso. Se llama tanto
// desde el GET (para que abrir el chat, sin tocar nada, complete un alta que
// quedó pendiente porque quien confirmó en segundo lugar fue la
// instructora) como desde el POST.
async function intentarEjecutarAlta(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  fila: FilaFormalizacion,
  participante: NonNullable<Awaited<ReturnType<typeof resolverParticipante>>>,
): Promise<FilaFormalizacion> {
  if (fila.estado !== 'pendiente') return fila;
  if (!fila.estudio_confirmado_en || !fila.instructora_confirmada_en) return fila;
  if (participante.lado !== 'estudio' || !participante.sesionStaff) return fila;
  if (!puedeGestionarEquipo(participante.sesionStaff.rol)) return fila;

  const { data: solicitud } = await admin
    .from('red_solicitudes_contacto')
    .select('perfil_id, red_perfiles ( auth_user_id, nombre, email_contacto, telefono_contacto )')
    .eq('id', fila.solicitud_id).maybeSingle();
  const perfil = solicitud?.red_perfiles as unknown as {
    auth_user_id: string; nombre: string; email_contacto: string | null; telefono_contacto: string | null;
  } | null;
  if (!perfil) return fila;

  const instructorId = `red-eq-${uid()}`;
  const { error: errAlta } = await admin.from('instructores').insert({
    id: instructorId,
    studio_id: participante.studioId, // autoridad: el estudio de la solicitud/sesión, nunca del body
    nombre: perfil.nombre,
    email: perfil.email_contacto,
    telefono: perfil.telefono_contacto,
    rol: 'INSTRUCTOR',
    auth_user_id: perfil.auth_user_id,
    tipo_contrato: fila.tipo_contrato,
  });
  // UNIQUE(auth_user_id, studio_id) — ya tenía ficha activa en esa sede
  // (p. ej. dada de alta a mano antes de pasar por Network). No es un error
  // de servidor: se marca confirmada igualmente, sin instructor_id nuevo.
  if (errAlta && errAlta.code !== '23505') {
    return fila;
  }

  const { data: actualizada } = await admin
    .from('red_formalizaciones')
    .update({ estado: 'confirmada', instructor_id: errAlta ? null : instructorId, actualizado_en: new Date().toISOString() })
    .eq('id', fila.id).select('*').single();
  return (actualizada as FilaFormalizacion | null) ?? { ...fila, estado: 'confirmada' };
}

function mapFila(f: FilaFormalizacion) {
  return {
    id: f.id,
    tipoContrato: f.tipo_contrato,
    estudioConfirmadoEn: f.estudio_confirmado_en,
    instructoraConfirmadaEn: f.instructora_confirmada_en,
    estado: f.estado,
  };
}

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const participante = await resolverParticipante(req, admin);
  if (!participante) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data } = await admin.from('red_formalizaciones').select('*').eq('solicitud_id', participante.solicitudId).maybeSingle();
  if (!data) return NextResponse.json({ formalizacion: null, miLado: participante.lado });

  const actualizada = await intentarEjecutarAlta(admin, data as FilaFormalizacion, participante);
  return NextResponse.json({ formalizacion: mapFila(actualizada), miLado: participante.lado });
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { solicitudId?: unknown; tipoContrato?: unknown } | null;
  const solicitudId = typeof body?.solicitudId === 'string' ? body.solicitudId : undefined;
  const participante = await resolverParticipante(req, admin, solicitudId);
  if (!participante) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: existente } = await admin
    .from('red_formalizaciones').select('*').eq('solicitud_id', participante.solicitudId).maybeSingle();

  const ahora = new Date().toISOString();
  const marca = participante.lado === 'estudio' ? 'estudio_confirmado_en' : 'instructora_confirmada_en';

  let fila: FilaFormalizacion;
  if (!existente) {
    const tipoContrato = body?.tipoContrato;
    if (tipoContrato !== 'temporal' && tipoContrato !== 'indefinido') {
      return errorPeticion('Elige si es un contrato temporal o indefinido.');
    }
    const { data, error } = await admin.from('red_formalizaciones').insert({
      id: `redform-${uid()}`,
      solicitud_id: participante.solicitudId,
      propuesto_por: participante.userId,
      tipo_contrato: tipoContrato,
      [marca]: ahora,
    }).select('*').single();
    if (error) {
      // UNIQUE(solicitud_id) — la otra parte propuso en el mismo instante y
      // ganó la carrera. No es un error de servidor: se relee la fila que
      // ganó y se confirma sobre ella, como si esta petición hubiera sido
      // un "confirmar" desde el principio.
      if (error.code === '23505') {
        const { data: yaCreada } = await admin
          .from('red_formalizaciones').select('*').eq('solicitud_id', participante.solicitudId).maybeSingle();
        if (!yaCreada) return errorInterno('network:formalizacion:POST:crear', error, 'No se ha podido proponer la contratación.');
        const { data: confirmada, error: errConfirmar } = await admin
          .from('red_formalizaciones')
          .update({ [marca]: (yaCreada as FilaFormalizacion)[marca] ?? ahora, actualizado_en: ahora })
          .eq('id', (yaCreada as FilaFormalizacion).id).select('*').single();
        if (errConfirmar) return errorInterno('network:formalizacion:POST:crear', errConfirmar, 'No se ha podido confirmar la contratación.');
        fila = confirmada as FilaFormalizacion;
      } else {
        return errorInterno('network:formalizacion:POST:crear', error, 'No se ha podido proponer la contratación.');
      }
    } else {
      fila = data as FilaFormalizacion;
    }
  } else {
    const previa = existente as FilaFormalizacion;
    if (previa.estado === 'cancelada') return errorPeticion('Esta propuesta de contratación se canceló. Proponla de nuevo.');
    // Confirmar: se acepta el tipo de contrato YA propuesto, nunca se
    // cambia aquí — si la otra parte pudiera alterarlo al confirmar, "las 2
    // aceptan" dejaría de significar que las dos aceptaron lo mismo.
    const { data, error } = await admin
      .from('red_formalizaciones')
      .update({ [marca]: previa[marca] ?? ahora, actualizado_en: ahora })
      .eq('id', previa.id).select('*').single();
    if (error) return errorInterno('network:formalizacion:POST:confirmar', error, 'No se ha podido confirmar la contratación.');
    fila = data as FilaFormalizacion;
  }

  fila = await intentarEjecutarAlta(admin, fila, participante);
  return NextResponse.json({ formalizacion: mapFila(fila), miLado: participante.lado });
}
