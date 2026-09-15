import type { NextRequest } from 'next/server';
import { supabase } from '@/lib/db/supabase';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { resolverStudioPorSlug } from '@/lib/db/supabase-data-admin';
import { escaparLike } from '@/lib/escapar-like';

// La instructora dentro de la app del estudio (`app/portal/[slug]`).
//
// Decisión del fundador (14-sep-2026): la app de la alumna es también la de la
// instructora. Mismo login, sin selector; si la cuenta es INSTRUCTORA de ESE
// estudio, entra a su parte.
//
// ⚠️ Por qué no se reutiliza `verificarSesionStaff` (lib/auth-server.ts). Esa
// función resuelve la sede con `sesion_activa` o, si no hay, con la primera
// fila de `instructores`: está pensada para el panel, donde la persona elige
// sede. En la app la sede la fija el SLUG de la URL. Con la del panel, alguien
// que sea gerente en la sede A e instructora en la B abriría la app de B y
// actuaría como gerente de A. Aquí la sede sale siempre del slug.
//
// Solo rol INSTRUCTOR (decisión confirmada): propietaria, gerencia y recepción
// que den alguna clase siguen trabajando en el panel.
//
// Corre con service-role, que se salta la RLS: por eso cada consulta va acotada
// a mano a `auth_user_id` + `studio_id`. `neq('activo', false)` deja fuera a
// quien tiene una baja explícita — y, ojo, TAMBIÉN a un `activo` nulo (en SQL
// `null <> false` no es verdad). Hoy no hay ninguno y la columna nace a `true`;
// ante la duda, fuera es lo seguro.

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export interface InstructoraDelEstudio {
  instructorId: string;
  nombre: string;
  fotoUrl: string | null;
}

export interface SesionInstructoraPortal extends InstructoraDelEstudio {
  userId: string;
  email: string | null;
  studioId: string;
}

/**
 * La ficha de instructora ACTIVA de este usuario en este estudio, o null.
 *
 * ⚠️ Un fallo de la base de datos LANZA, no devuelve null. «No lo sé» no puede
 * leerse como «no es instructora»: la guardia del alta de alumna dejaría pasar
 * justo lo que existe para parar, y la app recordaría ese «no» durante horas.
 */
export async function instructoraActivaEnEstudio(
  admin: Admin, authUserId: string, studioId: string,
): Promise<InstructoraDelEstudio | null> {
  // `maybeSingle` es seguro: UNIQUE(auth_user_id, studio_id) en `instructores`.
  const { data, error } = await admin
    .from('instructores').select('id, nombre, foto_url')
    .eq('auth_user_id', authUserId).eq('studio_id', studioId)
    .eq('rol', 'INSTRUCTOR').neq('activo', false)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const fila = data as { id: string; nombre: string | null; foto_url: string | null };
  return { instructorId: fila.id, nombre: fila.nombre || 'Instructora', fotoUrl: fila.foto_url ?? null };
}

/**
 * La ficha de INSTRUCTORA de este estudio con este correo que todavía no se ha
 * unido a ninguna cuenta —la han dado de alta en Equipo y aún no ha entrado—,
 * o null.
 *
 * El caso (15-sep-2026): la propietaria da de alta a una instructora con su
 * correo, ella entra en la app con ese correo sin pasar por la invitación, y la
 * app —que la veía sin ficha de alumna y sin ficha de instructora UNIDA— la daba
 * de alta como alumna: aparecía una clienta nueva en el panel.
 *
 * Decisión del fundador (15-sep-2026): en ese caso la app le deja ELEGIR, entrar
 * como instructora o como alumna. Esto solo lee; la unión la hace
 * `/api/portal/instructora/unirse` cuando ella lo pulsa, y ahí están las
 * condiciones (ver `lib/equipo/reclamar-reglas.ts`).
 *
 * El correo tiene que ser el del TOKEN de quien pregunta: así solo se le dice a
 * quien ya ha demostrado que es suyo, y no enseña nada sobre nadie más.
 * `order('id')`: con dos fichas duplicadas por error, siempre la misma.
 */
export async function fichaInstructoraPendiente(
  admin: Admin, email: string, studioId: string,
): Promise<{ instructorId: string; nombre: string } | null> {
  const limpio = email.trim();
  if (!limpio || !studioId) return null;
  const { data, error } = await admin
    .from('instructores').select('id, nombre')
    .eq('studio_id', studioId).is('auth_user_id', null)
    .eq('rol', 'INSTRUCTOR').neq('activo', false)
    .ilike('email', escaparLike(limpio))
    .order('id')
    .limit(1);
  if (error) throw error;
  const fila = (data ?? [])[0] as { id: string; nombre: string | null } | undefined;
  return fila ? { instructorId: fila.id, nombre: fila.nombre || 'Instructora' } : null;
}

/**
 * Verifica el JWT de la app (el mismo `auth.uid()` que en el panel: la sesión
 * del portal solo cambia DÓNDE se guarda) y resuelve si es instructora del
 * estudio del slug. La identidad sale del token, nunca del body.
 */
export async function verificarInstructoraEnEstudio(
  req: NextRequest, slug: string,
): Promise<SesionInstructoraPortal | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!token || !slug) return null;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  // También por dirección antigua, igual que la sesión de la alumna.
  const resuelto = await resolverStudioPorSlug(admin as never, slug);
  if (!resuelto) return null;
  const studioId = (resuelto.row as { id: string }).id;

  const instructora = await instructoraActivaEnEstudio(admin, user.id, studioId);
  if (!instructora) return null;

  return { ...instructora, userId: user.id, email: user.email ?? null, studioId };
}
