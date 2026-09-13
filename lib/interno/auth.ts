// ─────────────────────────────────────────────────────────────────────────────
// Panel interno — autenticación y autorización (SERVER-ONLY).
//
// Regla que sostiene la seguridad de todo el backoffice: el panel lee datos de
// TODOS los estudios, y eso NO se consigue aflojando RLS. Se consigue validando
// aquí que quien pide es un admin de plataforma con el permiso concreto, y solo
// entonces usando el service-role. Las políticas de `studios`, `socios`, etc.
// siguen intactas para el resto de la aplicación.
//
// Si algún día alguien añade una política que dé acceso cross-tenant a
// `authenticated` "para que el panel funcione", eso es un fallo de seguridad,
// no un atajo: el panel no lo necesita.
// ─────────────────────────────────────────────────────────────────────────────
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../db/supabase-admin.ts';
import { verificarUsuarioSupabase } from '../auth-server.ts';
import { tieneAlguno, tienePermiso, type Permiso } from './permisos.ts';
import { exigeMfa, nivelAutenticacion, type NivelAal } from './mfa.ts';

export interface AdminInterno {
  userId: string;
  email: string;
  nombre: string;
  cargo: string | null;
  permisos: string[];
  /** Nivel de la sesión que hace la petición. `aal2` = pasó el segundo factor. */
  nivel: NivelAal;
}

/**
 * Por qué no entra. `MFA_REQUERIDO` va aparte para que la UI mande a verificar
 * en vez de enseñar «no eres del equipo», que sería mentira.
 */
export type MotivoSinAccesoInterno = 'NO_AUTORIZADO' | 'MFA_REQUERIDO';

const NO_AUTORIZADO = { motivo: 'NO_AUTORIZADO' } as const;

// Devuelve la persona interna si el JWT es válido, está dada de alta y activa,
// y la sesión cumple el nivel exigido. Si no, el motivo.
export async function comprobarAdminInterno(
  req: NextRequest,
): Promise<{ admin: AdminInterno } | { motivo: MotivoSinAccesoInterno }> {
  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NO_AUTORIZADO;

  const admin = getSupabaseAdmin();
  if (!admin) return NO_AUTORIZADO;

  const { data: fila } = await admin
    .from('plataforma_admin')
    .select('nombre, cargo, activo')
    .eq('auth_user_id', usuario.userId)
    .maybeSingle();
  if (!fila || fila.activo !== true) return NO_AUTORIZADO;

  // A-3/A1: segundo factor. Se mira DESPUÉS de saber que es del equipo, para
  // que a una propietaria cualquiera no se la mande a una pantalla de MFA de
  // un sitio que no es suyo.
  //
  // El `aal` se lee del MISMO token que `verificarUsuarioSupabase` acaba de
  // validar con `getUser` (misma extracción de la cabecera), así que no hace
  // falta volver a comprobar la firma: un payload retocado ya habría fallado
  // ahí. Ver `nivelAutenticacion` en ./mfa.ts.
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  const nivel = nivelAutenticacion(token);
  if (exigeMfa(process.env, nivel)) return { motivo: 'MFA_REQUERIDO' };

  const { data: permisos } = await admin
    .from('plataforma_permiso')
    .select('permiso')
    .eq('auth_user_id', usuario.userId);

  return {
    admin: {
      userId: usuario.userId,
      email: usuario.email,
      nombre: (fila.nombre as string | null) ?? 'Equipo Tentare',
      cargo: (fila.cargo as string | null) ?? null,
      permisos: (permisos ?? []).map(p => p.permiso as string),
      nivel,
    },
  };
}

// Igual que `comprobarAdminInterno`, para quien solo necesita saber si entra.
// null en cualquier otro caso — incluido "es un usuario legítimo de Tentare
// pero no es del equipo interno", que es el caso que más importa distinguir.
export async function verificarAdminInterno(req: NextRequest): Promise<AdminInterno | null> {
  const r = await comprobarAdminInterno(req);
  return 'admin' in r ? r.admin : null;
}

// 401 en los dos casos: ninguno de los dos es «esto no te toca» (403). El
// `codigo` es lo que distingue, y lo lee `lib/interno/client.ts`.
export function respuestaSinAccesoInterno(motivo: MotivoSinAccesoInterno): NextResponse {
  if (motivo === 'MFA_REQUERIDO') {
    return NextResponse.json(
      { error: 'Esta zona exige verificación en dos pasos.', codigo: 'MFA_REQUERIDO' },
      { status: 401 },
    );
  }
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
}

// Guardia para las rutas: o devuelve el admin, o la respuesta de error ya hecha.
//
//   const g = await exigirPermiso(req, 'studios.read');
//   if ('error' in g) return g.error;
//   g.admin.nombre …
//
// Se distingue 401 (no eres del equipo) de 403 (eres, pero esto no te toca) a
// propósito: al depurar por qué alguien no ve algo, el código de estado ya lo dice.
export async function exigirPermiso(
  req: NextRequest, permiso: Permiso,
): Promise<{ admin: AdminInterno } | { error: NextResponse }> {
  const r = await comprobarAdminInterno(req);
  if (!('admin' in r)) return { error: respuestaSinAccesoInterno(r.motivo) };
  if (!tienePermiso(r.admin.permisos, permiso)) {
    return {
      error: NextResponse.json(
        { error: `Te falta el permiso "${permiso}" para hacer esto.` },
        { status: 403 },
      ),
    };
  }
  return { admin: r.admin };
}

// Igual que `exigirPermiso` pero basta con UNO de los de la lista. Existe para
// las pantallas que sirven a dos trabajos distintos: la lista del equipo la
// necesita quien da de alta (`users.create`) y quien da de baja
// (`users.delete`), y exigir los dos dejaría fuera a media plantilla.
export async function exigirAlguno(
  req: NextRequest, permisos: readonly Permiso[],
): Promise<{ admin: AdminInterno } | { error: NextResponse }> {
  const r = await comprobarAdminInterno(req);
  if (!('admin' in r)) return { error: respuestaSinAccesoInterno(r.motivo) };
  if (!tieneAlguno(r.admin.permisos, permisos)) {
    return {
      error: NextResponse.json(
        { error: `Necesitas uno de estos permisos: ${permisos.join(', ')}.` },
        { status: 403 },
      ),
    };
  }
  return { admin: r.admin };
}
