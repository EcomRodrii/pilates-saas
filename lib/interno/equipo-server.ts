// Lectura del equipo interno (SERVER-ONLY). Vive aparte de las rutas porque
// las tres la necesitan: listar, dar de alta y cambiar permisos — y las dos
// últimas la necesitan para aplicar las reglas de `equipo-reglas.ts`, que se
// deciden mirando al equipo ENTERO (p.ej. "¿queda algún admin.full activo?").
import type { SupabaseClient } from '@supabase/supabase-js';

export interface MiembroConEmail {
  userId: string;
  email: string | null;
  nombre: string;
  cargo: string | null;
  activo: boolean;
  creadoEn: string;
  ultimoAcceso: string | null;
  permisos: string[];
}

export async function leerEquipo(db: SupabaseClient): Promise<MiembroConEmail[]> {
  // `plataforma_equipo()` es una función acotada (migr 0135): hace el join con
  // auth.users por dentro, así que por aquí no puede salir el email de nadie
  // que no sea del equipo interno.
  const [fichas, permisos] = await Promise.all([
    db.rpc('plataforma_equipo'),
    db.from('plataforma_permiso').select('auth_user_id, permiso'),
  ]);
  if (fichas.error) throw new Error(fichas.error.message);

  const porUsuario = new Map<string, string[]>();
  for (const p of permisos.data ?? []) {
    const uid = p.auth_user_id as string;
    if (!porUsuario.has(uid)) porUsuario.set(uid, []);
    porUsuario.get(uid)!.push(p.permiso as string);
  }

  return (fichas.data ?? []).map((f: Record<string, unknown>) => ({
    userId: f.auth_user_id as string,
    email: (f.email as string | null) ?? null,
    nombre: (f.nombre as string | null) ?? 'Sin nombre',
    cargo: (f.cargo as string | null) ?? null,
    activo: f.activo === true,
    creadoEn: String(f.creado_en ?? ''),
    ultimoAcceso: (f.ultimo_acceso as string | null) ?? null,
    permisos: (porUsuario.get(f.auth_user_id as string) ?? []).sort(),
  }));
}
