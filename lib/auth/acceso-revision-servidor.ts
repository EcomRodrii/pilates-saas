import 'server-only';
import { randomBytes } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { createClient, type EmailOtpType } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { escaparLike } from '@/lib/escapar-like';
import { contarVinculosCuenta } from '@/lib/socios/cuenta-acceso-servidor';
import {
  LIMITE_DIARIO_REVISION, codigoDeRevisionCoincide, configAccesoRevision, esEmailDeRevision, intentarAccesoRevision,
  type DepsRevision, type ResultadoRevision,
} from '@/lib/auth/acceso-revision';

// El I/O del acceso de la revisión de Apple (reglas y porqués en ./acceso-revision.ts).
// Lo llama SOLO /api/auth/otp/verificar (lo fija acceso-revision.test.ts).

// Solo el de entrar de una cuenta ya confirmada: `generateLink` haría un ALTA
// ('signup') si la cuenta no existiera (p. ej. borrada a la vez), y eso no se canjea.
const TIPO_OTP: EmailOtpType = 'magiclink';

function depsReales(): DepsRevision | null {
  const admin = getSupabaseAdmin();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!admin || !url || !anonKey) return null;

  return {
    async contarIntento() {
      const r = await rateLimit('app-review-dia', LIMITE_DIARIO_REVISION);
      // `resetAt` null = el limitador no ha contado (fail-open): aquí cuenta como cerrado.
      return { permitido: r.allowed, contado: r.resetAt !== null };
    },
    async buscarCuenta(email) {
      // La misma función de solo service_role que usa /interno: email -> id, sin crear nada.
      const { data, error } = await admin.rpc('plataforma_uid_por_email', { p_email: email });
      if (error) throw error;
      return typeof data === 'string' && data ? data : null;
    },
    async leerUsuario(userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) throw error;
      if (!data?.user) return null;
      const u = data.user as typeof data.user & { banned_until?: string | null };
      return { id: u.id, email: u.email ?? null, bloqueadoHasta: u.banned_until ?? null };
    },
    async factoresVerificados(userId) {
      const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
      if (error) throw error;
      return (data?.factors ?? []).filter((f) => f.status === 'verified').length;
    },
    vinculos: (userId) => contarVinculosCuenta(admin, userId),
    async tieneFicha(userId, email, studioId) {
      const [suyas, porEmail] = await Promise.all([
        admin.from('socios').select('id', { count: 'exact', head: true })
          .eq('studio_id', studioId).eq('auth_user_id', userId).is('borrado_en', null),
        // La ficha que dio de alta el estudio y aún no se ha vinculado (o que se
        // desvinculó al borrar la cuenta): la app la vincula al entrar por el email.
        admin.from('socios').select('id', { count: 'exact', head: true })
          .eq('studio_id', studioId).ilike('email', escaparLike(email)).is('auth_user_id', null).is('borrado_en', null),
      ]);
      if (suyas.error) throw suyas.error;
      if (porEmail.error) throw porEmail.error;
      return (suyas.count ?? 0) + (porEmail.count ?? 0) > 0;
    },
    async emitirSesion(userId, email) {
      // Un código de un solo uso generado en el servidor (no se manda correo) y
      // canjeado por la vía pública de siempre: la sesión es idéntica a la de
      // quien escribe el código del correo (aal1, amr `otp`).
      const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      if (error) throw error;
      const hash = data?.properties?.hashed_token;
      if (!hash || data?.properties?.verification_type !== TIPO_OTP || data.user?.id !== userId) return null;
      const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: v, error: eV } = await auth.auth.verifyOtp({ token_hash: hash, type: TIPO_OTP });
      if (eV || !v.session) return null;
      if (v.user?.id !== userId) {
        // De otra cuenta que la comprobada: se cierra y no se entrega.
        await admin.auth.admin.signOut(v.session.access_token, 'local').catch(() => undefined);
        return null;
      }
      return { access_token: v.session.access_token, refresh_token: v.session.refresh_token };
    },
    async blindarCuenta(userId, accessToken) {
      // Una contraseña al azar (con los cuatro tipos de carácter, por si el proyecto
      // los exige) borra la que hubiera puesto quien entró antes con el código; y
      // las demás sesiones de la cuenta se cierran. Si algo falla, la nueva también.
      const cerrarEsta = () => admin.auth.admin.signOut(accessToken, 'local').catch(() => undefined);
      const { error } = await admin.auth.admin.updateUserById(userId, { password: `${randomBytes(32).toString('base64url')}aA1!` });
      if (error) { await cerrarEsta(); throw error; }
      const { error: eOtras } = await admin.auth.admin.signOut(accessToken, 'others');
      if (eOtras) { await cerrarEsta(); throw eOtras; }
    },
    avisar(evento, { motivo, userId }) {
      const texto = evento === 'entrada'
        ? '[acceso-revision] entrada con la cuenta de revisión de Apple'
        : `[acceso-revision] código de revisión rechazado: ${motivo}`;
      console.warn(texto, userId ? { userId } : {});
      Sentry.captureMessage(texto, {
        level: evento === 'entrada' ? 'info' : 'warning',
        tags: { area: 'acceso-revision', evento, ...(motivo ? { motivo } : {}) },
        ...(userId ? { extra: { userId } } : {}),
      });
    },
  };
}

/** `no_aplica` si no es la cuenta de demo con su código fijo; si no, lo que haya decidido. */
export async function accesoRevision(email: string, codigo: string): Promise<ResultadoRevision> {
  const cfg = configAccesoRevision(process.env);
  if (!cfg) return { tipo: 'no_aplica' };
  const deps = depsReales();
  if (!deps) {
    // Sin service-role no se puede comprobar nada: solo importa si era la demo con su código.
    // Se trata como un código cualquiera (sin servicio, el camino del correo tampoco entra).
    if (esEmailDeRevision(cfg, email) && codigoDeRevisionCoincide(cfg, codigo)) {
      console.error('[acceso-revision] código de revisión sin servicio para comprobarlo');
    }
    return { tipo: 'no_aplica' };
  }
  return intentarAccesoRevision(cfg, email, codigo, deps);
}
