import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarCalendario } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import {
  instantesUltimoMensaje, resumirConversaciones,
  type FilaLectura, type FilaUltimoMensaje,
} from '@/lib/mensajeria/resumen';
import type { RowConversacionesConParticipantes } from '@/lib/mensajeria/tipos';

const TIPOS_ABRIBLES = ['ALUMNA_INSTRUCTORA', 'ALUMNA_MOSTRADOR'] as const;
type TipoAbrible = (typeof TIPOS_ABRIBLES)[number];

// Mismo helper local que ya usa app/api/mi-disponibilidad/route.ts para
// resolver el instructor_id propio de una sesión de staff con rol
// INSTRUCTOR — sin UNIQUE(auth_user_id, studio_id) en `instructores`, así que
// limit(1) en vez de maybeSingle().
async function resolverInstructorPropio(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  userId: string, studioId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('instructores').select('id')
    .eq('auth_user_id', userId).eq('studio_id', studioId)
    .neq('activo', false).order('id', { ascending: true }).limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}

// Abre (o reutiliza) una conversación desde el lado STAFF. Llama siempre a la
// RPC `abrir_conversacion` con service-role (mismo patrón que
// crearReservaPublica/resolver_reserva_pendiente): el guardia de autorización
// vive TAMBIÉN aquí, en la API route, no solo dentro de la RPC — porque la
// RPC se invoca con service-role, donde auth.uid() es NULL y su propio
// guardia queda como defensa en profundidad, no como el único candado.
//
// Criterio de "en nombre de quién":
// - ALUMNA_INSTRUCTORA: una INSTRUCTOR solo puede abrir la conversación de SU
//   PROPIA relación con la alumna — no puede abrir en nombre de una
//   compañera. PROPIETARIO/MANAGER/RECEPCION sí pueden abrirla en nombre de
//   cualquier instructora del estudio (p.ej. desde la ficha de la clienta en
//   el panel), porque ya tienen visión y control total sobre el calendario.
// - ALUMNA_MOSTRADOR: reservado a quien gestiona el calendario/mostrador
//   (PROPIETARIO/MANAGER/RECEPCION) — una instructora no tiene mostrador
//   propio que abrir. Mismo corte que exige la RPC (`puede_gestionar_calendario()`).
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // Por usuario, no por IP: varias personas del mismo estudio comparten
  // conexión/oficina y no deben limitarse entre sí (misma asimetría deliberada
  // que ya aplica el lado portal, hallazgo de tentare-seguridad tras el P0).
  const limited = await enforceRateLimit(req, 'staff-mensajeria-conversaciones', { max: 60, windowSeconds: 60 }, sesion.userId);
  if (limited) return limited;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const body = await req.json().catch(() => null) as {
    tipo?: string; socioId?: string; instructorId?: string;
  } | null;

  if (!body?.tipo || !TIPOS_ABRIBLES.includes(body.tipo as TipoAbrible)) {
    return errorPeticion('Tipo de conversación no válido.');
  }
  const tipo = body.tipo as TipoAbrible;
  if (!body.socioId) return errorPeticion('Falta la socia.');

  let instructorId: string | null = null;

  if (tipo === 'ALUMNA_INSTRUCTORA') {
    if (sesion.rol === 'INSTRUCTOR') {
      const propio = await resolverInstructorPropio(admin, sesion.userId, sesion.studioId);
      if (!propio) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
      if (body.instructorId && body.instructorId !== propio) {
        return NextResponse.json({ error: 'No puedes abrir una conversación en nombre de otra instructora.' }, { status: 403 });
      }
      instructorId = propio;
    } else if (puedeGestionarCalendario(sesion.rol)) {
      if (!body.instructorId) return errorPeticion('Falta la instructora.');
      instructorId = body.instructorId;
    } else {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
  } else {
    // ALUMNA_MOSTRADOR
    if (!puedeGestionarCalendario(sesion.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
  }

  const { data, error } = await admin.rpc('abrir_conversacion', {
    p_studio_id: sesion.studioId,
    p_tipo: tipo,
    p_socio_id: body.socioId,
    p_instructor_id: instructorId,
    p_ancla_sesion_id: null,
    p_ancla_reserva_id: null,
  });

  if (error) {
    if (error.message.includes('SIN_RELACION_VALIDA')) {
      return errorPeticion('Esta socia no tiene ninguna clase con esa instructora, no se puede abrir la conversación.');
    }
    if (error.message.includes('PARTICIPANTE_SIN_CUENTA')) {
      return errorPeticion('La socia o la instructora todavía no tienen cuenta vinculada.');
    }
    if (error.message.includes('PARAMETROS_INCOMPLETOS') || error.message.includes('TIPO_INVALIDO')) {
      return errorPeticion('Faltan datos para abrir la conversación.');
    }
    if (error.message.includes('NO_AUTORIZADO')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
    return errorInterno('mensajeria:conversaciones:POST', error, 'No se ha podido abrir la conversación.');
  }

  const fila = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ id: fila?.id as string, creada: Boolean(fila?.creada) });
}

// Lista las conversaciones visibles para el usuario de staff actual. Usa el
// cliente de SESIÓN (JWT propio, no service-role) a propósito: la RLS de
// `conversaciones` ya resuelve exactamente esta visibilidad (studio-wide para
// EQUIPO/ALUMNA_MOSTRADOR si tiene puede_gestionar_calendario(), más las
// propias como participante si es INSTRUCTOR) — reimplementarla en TS
// duplicaría una lógica que ya vive, correcta y probada, en la política.
//
// ⚠️ CAMBIO DE FORMA DE RESPUESTA (rediseño de la mensajería, solo aditivo):
// cada fila lleva ahora `ultimo_cuerpo`/`ultimo_remitente_auth_user_id` y
// `leido_hasta`/`leido_hasta_otros`. Ni tabla ni columna nuevas: la
// previsualización sale de `mensajes` con UNA consulta más (ver
// lib/mensajeria/resumen.ts) y el estado de lectura ya venía en el embed de
// participantes, solo faltaba pedir la columna. Sin esos cuatro campos la
// bandeja no puede enseñar de qué va cada conversación ni cuál tiene algo sin
// leer — que es justo lo que la hacía sentirse un CRUD. Ninguna de las dos
// consultas amplía lo que este usuario ya podía leer: las dos van con su
// propio JWT, bajo la misma RLS.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const sesionCliente = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await sesionCliente
    .from('conversaciones')
    .select('id, studio_id, tipo, titulo, ancla_sesion_id, ancla_reserva_id, creado_en, ultimo_mensaje_en, mostrador_leido_hasta, conversacion_participantes(socio_id, rol_en_conversacion, auth_user_id, leido_hasta)')
    .eq('studio_id', sesion.studioId)
    .order('ultimo_mensaje_en', { ascending: false })
    .limit(100);

  if (error) return errorInterno('mensajeria:conversaciones:GET', error, 'No se han podido cargar las conversaciones.');

  const filas = (data ?? []) as unknown as RowConversacionesConParticipantes[];
  if (filas.length === 0) return NextResponse.json({ conversaciones: [] });

  const { data: ultimos } = await sesionCliente
    .from('mensajes')
    .select('conversacion_id, cuerpo, remitente_auth_user_id, creado_en')
    .in('conversacion_id', filas.map(c => c.id))
    .in('creado_en', instantesUltimoMensaje(filas));

  const lecturas: FilaLectura[] = filas.flatMap(c =>
    c.conversacion_participantes.map(p => ({
      conversacion_id: c.id, auth_user_id: p.auth_user_id, leido_hasta: p.leido_hasta,
    })));

  return NextResponse.json({
    conversaciones: resumirConversaciones(
      filas, (ultimos ?? []) as FilaUltimoMensaje[], lecturas, sesion.userId,
    ),
  });
}
