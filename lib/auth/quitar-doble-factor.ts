// El estudio le quita la verificación en dos pasos a una alumna que ha perdido
// el acceso a su app Y a su correo (decisión del 4-oct-2026). Sin esto, esa
// alumna se quedaría fuera para siempre: la verificación solo se quita con
// sesión verificada (GoTrue exige aal2), y para verificarla le falta todo.
//
// Quién y cuándo lo decide `motivoNoQuitar` (lib/auth/quitar-doble-factor-reglas.ts):
// solo si este estudio es el único dueño de la cuenta. Aquí, el I/O: leer lo
// que hace falta para decidirlo, quitar los factores con service-role, olvidar
// sus dispositivos recordados, dejar constancia en Actividad y avisarla por
// correo (con la marca del estudio). El permiso de la persona del equipo lo
// comprueba la ruta (`puedeGestionarClientas`).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { uid } from '@/lib/utils';
import { motivoNoQuitar, type MotivoNoQuitar } from '@/lib/auth/quitar-doble-factor-reglas';
import { correoDobleFactorQuitado } from '@/lib/emails/estudio/cuenta';
import { marcaCorreoDesde } from '@/lib/emails/estudio/marca-correo';
import { resolverMarcaEstudio } from '@/lib/emails/plantillas-server';
import { remitentePorMarca } from '@/lib/emails/remitente';

interface Cuenta {
  socio: { id: string; nombre: string; authUserId: string | null };
  motivo: MotivoNoQuitar | null;
  factores: Array<{ id: string }>;
}

/** Lo necesario para decidir, todo acotado al estudio de la sesión. `null` = la ficha no es de este estudio. */
async function leerCuenta(admin: SupabaseClient, studioId: string, socioId: string): Promise<Cuenta | null> {
  const [{ data: socio, error: eSocio }, { data: estudio, error: eEstudio }] = await Promise.all([
    admin.from('socios').select('id, nombre, auth_user_id').eq('id', socioId).eq('studio_id', studioId).maybeSingle(),
    admin.from('studios').select('id, cadena_id').eq('id', studioId).maybeSingle(),
  ]);
  if (eSocio || eEstudio) throw eSocio ?? eEstudio;
  if (!socio || !estudio) return null;
  const authUserId = (socio.auth_user_id as string | null) ?? null;
  const ficha = { id: socio.id as string, nombre: (socio.nombre as string) ?? '', authUserId };
  const estudioRef = { studioId, cadenaId: (estudio.cadena_id as string | null) ?? null };
  if (!authUserId) {
    return { socio: ficha, factores: [], motivo: motivoNoQuitar({ tieneCuenta: false, factoresVerificados: 0, esDelEquipo: false, enNetwork: false, estudiosComoAlumna: [], estudio: estudioRef }) };
  }

  const cuantos = (tabla: string, columna = 'auth_user_id') =>
    admin.from(tabla).select(columna, { count: 'exact', head: true }).eq(columna, authUserId);
  // Cualquier sitio donde la cuenta es algo más que alumna de este estudio.
  // Fila en la tabla, activa o no: «ya no» puede volver a ser «sí».
  const [factoresRes, fichas, ...otras] = await Promise.all([
    admin.auth.admin.mfa.listFactors({ userId: authUserId }),
    admin.from('socios').select('studio_id, studios!inner(cadena_id)').eq('auth_user_id', authUserId),
    cuantos('instructores'),
    cuantos('studios', 'owner_auth_user_id'),
    cuantos('cadenas', 'owner_auth_user_id'),
    cuantos('plataforma_admin'),
    cuantos('red_perfiles'),
    cuantos('red_perfiles_alumna'),
  ]);
  if (factoresRes.error) throw factoresRes.error;
  if (fichas.error) throw fichas.error;
  const fallo = otras.find((r) => r.error);
  if (fallo?.error) throw fallo.error;
  const [equipo, propia, cadena, tentare, redProfesional, redAlumna] = otras.map((r) => (r.count ?? 0) > 0);

  const factores = factoresRes.data?.factors ?? [];
  const estudiosComoAlumna = (fichas.data ?? []).map((f) => {
    const s = f.studios as unknown as { cadena_id: string | null } | Array<{ cadena_id: string | null }> | null;
    const cadena = Array.isArray(s) ? s[0]?.cadena_id ?? null : s?.cadena_id ?? null;
    return { studioId: f.studio_id as string, cadenaId: cadena };
  });
  return {
    socio: ficha,
    factores: factores.map((f) => ({ id: f.id })),
    motivo: motivoNoQuitar({
      tieneCuenta: true,
      factoresVerificados: factores.filter((f) => f.status === 'verified').length,
      esDelEquipo: equipo || propia || cadena || tentare,
      enNetwork: redProfesional || redAlumna,
      estudiosComoAlumna,
      estudio: estudioRef,
    }),
  };
}

export type EstadoDobleFactorSocia =
  | { encontrada: false }
  | { encontrada: true; activa: boolean; motivo: MotivoNoQuitar | null };

export async function estadoDobleFactorSocia(admin: SupabaseClient, studioId: string, socioId: string): Promise<EstadoDobleFactorSocia> {
  const c = await leerCuenta(admin, studioId, socioId);
  if (!c) return { encontrada: false };
  const activa = c.motivo !== 'sin_cuenta' && c.motivo !== 'sin_verificacion';
  return { encontrada: true, activa, motivo: c.motivo };
}

export type ResultadoQuitar =
  | { ok: true; avisada: boolean }
  | { ok: false; motivo: MotivoNoQuitar | 'no_encontrada' };

export async function quitarDobleFactorSocia(
  admin: SupabaseClient,
  p: { studioId: string; socioId: string; actorNombre: string | null },
): Promise<ResultadoQuitar> {
  const c = await leerCuenta(admin, p.studioId, p.socioId);
  if (!c) return { ok: false, motivo: 'no_encontrada' };
  if (c.motivo) return { ok: false, motivo: c.motivo };
  const userId = c.socio.authUserId as string;

  // Todos sus factores, también los que dejó a medias: si quedara uno sin
  // verificar, al activarla de nuevo la app tropezaría con él.
  for (const f of c.factores) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
    if (error) throw error;
  }

  // Sus dispositivos recordados y sesiones confiadas ya no protegen nada, y si
  // vuelve a activarla no deben saltarse el código de la nueva. (Con la migración
  // del correo lo hace también un trigger; esto vale con o sin ella.)
  await Promise.all([
    admin.from('sesiones_confiadas').delete().eq('auth_user_id', userId),
    admin.from('dispositivos_confianza').delete().eq('auth_user_id', userId),
  ]).catch((e: unknown) => console.error('[quitar-doble-factor] dispositivos', e instanceof Error ? e.message : 'error'));

  const { error: eAct } = await admin.from('actividad_reciente').insert({
    id: uid(), studio_id: p.studioId, tipo: 'DOBLE_FACTOR_QUITADO',
    texto: `Quitó la verificación en dos pasos de ${c.socio.nombre || 'una clienta'}`,
    socio_id: c.socio.id, enlace: `/clientas/${c.socio.id}`, creado_en: new Date().toISOString(), actor_nombre: p.actorNombre,
  });
  if (eAct) console.error('[quitar-doble-factor] actividad', eAct.message);

  return { ok: true, avisada: await avisarAlumna(admin, p.studioId, userId) };
}

/** Al correo de la CUENTA (con el que entra), no al de la ficha: es a quien protege la verificación. */
async function avisarAlumna(admin: SupabaseClient, studioId: string, userId: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return false;
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    const to = data?.user?.email;
    if (!to) return false;
    const marca = await resolverMarcaEstudio(studioId);
    const nombre = marca.nombre || 'Tu estudio';
    const { error } = await new Resend(apiKey).emails.send({
      from: remitentePorMarca(nombre),
      to: [to],
      subject: `${nombre} ha quitado la verificación en dos pasos de tu cuenta`,
      html: correoDobleFactorQuitado({ marca: marcaCorreoDesde(marca, nombre) }),
      ...(marca.replyTo ? { replyTo: marca.replyTo } : {}),
    });
    if (error) { console.error('[quitar-doble-factor] correo', error.name); return false; }
    return true;
  } catch (e) {
    console.error('[quitar-doble-factor] correo', e instanceof Error ? e.name : 'error');
    return false;
  }
}
