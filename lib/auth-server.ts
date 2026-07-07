import type { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';

export interface SesionStaff {
  userId: string;
  studioId: string;
  rol: 'PROPIETARIO' | 'RECEPCION' | 'INSTRUCTOR';
}

// Verifica el JWT que el cliente manda en el header Authorization (obtenido
// de supabase.auth.getSession() en el navegador) y resuelve a qué negocio
// pertenece y con qué rol — el mismo criterio que current_studio_id()/
// current_rol() en SQL, pero en una ruta de servidor.
export async function verificarSesionStaff(req: NextRequest): Promise<SesionStaff | null> {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer /, '');
  if (!token) return null;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: instructor } = await supabase
    .from('instructores')
    .select('studio_id, rol')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (instructor) {
    return { userId: user.id, studioId: instructor.studio_id, rol: instructor.rol };
  }

  const { data: studio } = await supabase
    .from('studios')
    .select('id')
    .eq('owner_auth_user_id', user.id)
    .maybeSingle();
  if (studio) {
    return { userId: user.id, studioId: studio.id, rol: 'PROPIETARIO' };
  }

  return null;
}
