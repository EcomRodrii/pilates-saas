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

export interface AdminInterno {
  userId: string;
  email: string;
  nombre: string;
  cargo: string | null;
  permisos: string[];
}

// Devuelve la persona interna si el JWT es válido, está dada de alta y activa.
// null en cualquier otro caso — incluido "es un usuario legítimo de Tentare
// pero no es del equipo interno", que es el caso que más importa distinguir.
export async function verificarAdminInterno(req: NextRequest): Promise<AdminInterno | null> {
  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return null;

  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data: fila } = await admin
    .from('plataforma_admin')
    .select('nombre, cargo, activo')
    .eq('auth_user_id', usuario.userId)
    .maybeSingle();
  if (!fila || fila.activo !== true) return null;

  const { data: permisos } = await admin
    .from('plataforma_permiso')
    .select('permiso')
    .eq('auth_user_id', usuario.userId);

  return {
    userId: usuario.userId,
    email: usuario.email,
    nombre: (fila.nombre as string | null) ?? 'Equipo Tentare',
    cargo: (fila.cargo as string | null) ?? null,
    permisos: (permisos ?? []).map(p => p.permiso as string),
  };
}

// Guardia para las rutas: o devuelve el admin, o la respuesta de error ya hecha.
//
//   const g = await exigirPermiso(req, 'studios.read');
//   if ('error' in g) return g.error;
//   g.admin.nombre …
//
// Se distingue 401 (no eres del equipo) de 403 (eres, pero esto no te toca) a
// propósito: al depurar por qué Meri no ve algo, el código de estado ya lo dice.
export async function exigirPermiso(
  req: NextRequest, permiso: Permiso,
): Promise<{ admin: AdminInterno } | { error: NextResponse }> {
  const admin = await verificarAdminInterno(req);
  if (!admin) {
    return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }
  if (!tienePermiso(admin.permisos, permiso)) {
    return {
      error: NextResponse.json(
        { error: `Te falta el permiso "${permiso}" para hacer esto.` },
        { status: 403 },
      ),
    };
  }
  return { admin };
}

// Igual que `exigirPermiso` pero basta con UNO de los de la lista. Existe para
// las pantallas que sirven a dos trabajos distintos: la lista del equipo la
// necesita quien da de alta (`users.create`) y quien da de baja
// (`users.delete`), y exigir los dos dejaría fuera a media plantilla.
export async function exigirAlguno(
  req: NextRequest, permisos: readonly Permiso[],
): Promise<{ admin: AdminInterno } | { error: NextResponse }> {
  const admin = await verificarAdminInterno(req);
  if (!admin) {
    return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }
  if (!tieneAlguno(admin.permisos, permisos)) {
    return {
      error: NextResponse.json(
        { error: `Necesitas uno de estos permisos: ${permisos.join(', ')}.` },
        { status: 403 },
      ),
    };
  }
  return { admin };
}
