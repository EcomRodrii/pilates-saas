import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { mapFilaAPerfilIdentidad, type FilaRedPerfilIdentidad } from '@/lib/network/mapeo';

// Paso 02 del wizard ("Verifica tu identidad") — datos privados en
// red_perfiles_identidad, tabla aparte de red_perfiles (ver el comentario
// de la migración). Mismo patrón que el resto de /api/network/perfil/*:
// getSupabaseAdmin() (service-role) + guard explícito por auth_user_id, la
// RLS de la tabla es la segunda cerradura, no la única.

const SELECT_COLUMNAS = `
  perfil_id, apellido1, apellido2, fecha_nacimiento, pais_residencia,
  tipo_documento, numero_documento, direccion_cp, direccion_ciudad,
  direccion_provincia, direccion_pais, telefono_verificado_en, email_verificado_en
`;

const TIPOS_DOCUMENTO = new Set(['DNI', 'NIE', 'Pasaporte']);

async function propioPerfilId(admin: ReturnType<typeof getSupabaseAdmin>, authUserId: string): Promise<string | null> {
  const { data } = await admin!.from('red_perfiles').select('id').eq('auth_user_id', authUserId).maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const perfilId = await propioPerfilId(admin, usuario.userId);
  if (!perfilId) return NextResponse.json({ identidad: null });

  const { data, error } = await admin
    .from('red_perfiles_identidad')
    .select(SELECT_COLUMNAS)
    .eq('perfil_id', perfilId)
    .maybeSingle();
  if (error) return errorInterno('network:perfil:identidad:GET', error, 'No se han podido cargar tus datos.');

  return NextResponse.json({ identidad: data ? mapFilaAPerfilIdentidad(data as unknown as FilaRedPerfilIdentidad) : null });
}

export async function PUT(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const perfilId = await propioPerfilId(admin, usuario.userId);
  if (!perfilId) return errorPeticion('Crea tu perfil (paso 1) antes de continuar.', 404);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return errorPeticion('Petición inválida.');

  // telefono_verificado_en/email_verificado_en NUNCA se aceptan aquí — la
  // RLS ya los protege (trigger red_perfiles_identidad_proteger_verificacion),
  // este guard evita ni siquiera intentarlo y dar un error confuso.
  const row: Record<string, unknown> = {};
  if ('apellido1' in body) row.apellido1 = body.apellido1 == null || body.apellido1 === '' ? null : String(body.apellido1).trim();
  if ('apellido2' in body) row.apellido2 = body.apellido2 == null || body.apellido2 === '' ? null : String(body.apellido2).trim();
  if ('fechaNacimiento' in body) {
    const v = body.fechaNacimiento;
    if (v != null && (typeof v !== 'string' || Number.isNaN(Date.parse(v)))) return errorPeticion('La fecha de nacimiento no es válida.');
    row.fecha_nacimiento = v || null;
  }
  if ('paisResidencia' in body) row.pais_residencia = body.paisResidencia == null || body.paisResidencia === '' ? null : String(body.paisResidencia).trim();
  if ('tipoDocumento' in body) {
    if (body.tipoDocumento != null && !TIPOS_DOCUMENTO.has(String(body.tipoDocumento))) return errorPeticion('El tipo de documento no es válido.');
    row.tipo_documento = body.tipoDocumento ?? null;
  }
  if ('numeroDocumento' in body) row.numero_documento = body.numeroDocumento == null || body.numeroDocumento === '' ? null : String(body.numeroDocumento).trim();
  if ('direccionCp' in body) row.direccion_cp = body.direccionCp == null || body.direccionCp === '' ? null : String(body.direccionCp).trim();
  if ('direccionCiudad' in body) row.direccion_ciudad = body.direccionCiudad == null || body.direccionCiudad === '' ? null : String(body.direccionCiudad).trim();
  if ('direccionProvincia' in body) row.direccion_provincia = body.direccionProvincia == null || body.direccionProvincia === '' ? null : String(body.direccionProvincia).trim();
  if ('direccionPais' in body) row.direccion_pais = body.direccionPais == null || body.direccionPais === '' ? null : String(body.direccionPais).trim();

  if (Object.keys(row).length === 0) return errorPeticion('Nada que actualizar.');

  // upsert: la fila puede no existir todavía (primera vez en el paso 02).
  const { data, error } = await admin
    .from('red_perfiles_identidad')
    .upsert({ perfil_id: perfilId, ...row, actualizado_en: new Date().toISOString() }, { onConflict: 'perfil_id' })
    .select(SELECT_COLUMNAS)
    .single();
  if (error) return errorInterno('network:perfil:identidad:PUT', error, 'No se han podido guardar tus datos.');

  return NextResponse.json({ identidad: mapFilaAPerfilIdentidad(data as unknown as FilaRedPerfilIdentidad) });
}
