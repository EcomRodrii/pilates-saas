import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

// Unirse a un equipo no puede cambiarle a nadie el estudio en el que abre su panel.
//
// `current_studio_id()` (y `lib/auth-server.ts`) resuelven la sede así: la de
// `sesion_activa` si sigue siendo válida; si no, la PRIMERA ficha de equipo
// activa por `studio_id`; y solo después, el estudio propio. Así que a una
// propietaria sin fila en `sesion_activa` que se une como instructora a otro
// estudio —o a quien ya trabaja en varias sedes— la ficha nueva puede quedar la
// primera y su panel abrirse en el estudio de otra persona, con lo que teclee
// cayendo allí.
//
// Por eso, JUSTO ANTES de unir, se deja escrita la sede que se le resuelve hoy.
// Lo llaman las dos puertas: la invitación del panel (`equipoReclamarAction`) y
// «Como instructora» en la app (`/api/portal/instructora/unirse`).
//
//   · Si ya tiene una sede guardada y sigue siendo válida: no se toca (manda lo
//     que eligió en el selector).
//   · Si no tiene, o la guardada ya no vale: se escribe la que se le resuelve hoy.
//   · Sin fichas ni estudio propio: no hay panel que conservar.
//
// Si la escritura falla, LANZA: mejor que tenga que reintentar a que su panel se
// abra en otro estudio.

export async function conservarEstudioDelPanel(admin: Admin, userId: string): Promise<void> {
  const { data: sesion, error: errSesion } = await admin
    .from('sesion_activa').select('studio_id').eq('auth_user_id', userId).maybeSingle();
  if (errSesion) throw errSesion;
  if (sesion && await sedeValida(admin, userId, sesion.studio_id as string)) return;

  const actual = await sedeQueSeResuelveHoy(admin, userId);
  if (!actual) return;

  const { error } = await admin
    .from('sesion_activa')
    .upsert({ auth_user_id: userId, studio_id: actual, actualizado_en: new Date().toISOString() },
      { onConflict: 'auth_user_id' });
  if (error) throw error;
}

/** Mismo criterio que `current_studio_id()`: dueña del estudio o ficha activa en él. */
async function sedeValida(admin: Admin, userId: string, studioId: string): Promise<boolean> {
  const [propio, ficha] = await Promise.all([
    admin.from('studios').select('id').eq('id', studioId).eq('owner_auth_user_id', userId).limit(1),
    admin.from('instructores').select('id')
      .eq('studio_id', studioId).eq('auth_user_id', userId).or('activo.is.null,activo.eq.true')
      .limit(1),
  ]);
  if (propio.error) throw propio.error;
  if (ficha.error) throw ficha.error;
  return (propio.data ?? []).length > 0 || (ficha.data ?? []).length > 0;
}

/**
 * Lo que `current_studio_id()` le da sin sede guardada: su primera ficha activa
 * por `studio_id` (`coalesce(activo, true)`) y, si no tiene, su primer estudio propio.
 */
async function sedeQueSeResuelveHoy(admin: Admin, userId: string): Promise<string | null> {
  const { data: fichas, error: errFichas } = await admin
    .from('instructores').select('studio_id')
    .eq('auth_user_id', userId).or('activo.is.null,activo.eq.true')
    .order('studio_id').limit(1);
  if (errFichas) throw errFichas;
  const deFicha = (fichas ?? [])[0]?.studio_id as string | undefined;
  if (deFicha) return deFicha;

  const { data: suyos, error: errSuyos } = await admin
    .from('studios').select('id').eq('owner_auth_user_id', userId)
    .order('id').limit(1);
  if (errSuyos) throw errSuyos;
  return ((suyos ?? [])[0]?.id as string | undefined) ?? null;
}
