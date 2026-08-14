'use client';

import { useState, useEffect, useId, useRef } from 'react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/db/supabase';
import { dbCreateStudio, dbInsertInstructoraPropia, dbReclamarAccesoEquipo, setCurrentStudioId } from '@/lib/supabase-data';
import { authHeader } from '@/lib/api-client';
import { uid as generarId } from '@/lib/utils';
import { CLAVE_INVITACION, leerTokenInvitacion, olvidarTokenInvitacion } from '@/lib/equipo/invitacion-pendiente';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';

export default function LoginPage() {
  const uid = useId();
  const { signIn, signUp, session, user, loading, recuperarPassword, reenviarConfirmacion } = useAuth();
  const [modo, setModo] = useState<'entrar' | 'crear'>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Sin NEXT_PUBLIC_TURNSTILE_SITE_KEY configurada, el widget no se pinta y
  // esto nunca bloquea el envío — mismo comportamiento que hoy.
  const { widget: captcha, pedirToken } = useCaptcha();
  // Recuperar la contraseña no existía en esta pantalla. Quien la olvidaba se
  // quedaba fuera de su propio negocio: la clienta sí tenía cómo
  // (/portal/[slug]/acceso), la propietaria no, y la única salida era que
  // alguien le mandase el enlace desde el panel de Supabase.
  const [recuperando, setRecuperando] = useState(false);
  // Se enseña solo cuando el error ES el de email sin confirmar: un botón de
  // "reenviar confirmación" siempre visible invita a pulsarlo a quien no lo
  // necesita, y cada pulsación gasta el rate limit de correos del proyecto.
  const [faltaConfirmar, setFaltaConfirmar] = useState(false);
  // Este efecto crea el estudio, y crear un estudio NO es idempotente. Sus
  // dependencias cambian de identidad más de una vez por login (`user` es un
  // objeto nuevo en cada evento de auth), y `pending_studio` solo se limpia al
  // final del await — así que cada re-disparo veía el alta aún pendiente y
  // creaba OTRO estudio. En producción eso dejó a cinco propietarios con
  // estudios duplicados; a uno, con cuatro en 1,24 s.
  //
  // La guarda va en un ref y no en estado: tiene que cerrar la puerta en el
  // mismo tick, antes del primer await, o dos disparos seguidos se cuelan igual.
  const yaArrancado = useRef(false);

  // `?alta=1` lo pone /invitacion, que ya sabe que esta persona NO tiene cuenta.
  // Lo mandaba desde el principio y nadie lo leía: la invitada aterrizaba en
  // "Iniciar sesión" y tenía que encontrar sola el enlace de abajo. En un efecto
  // y no en el useState inicial para no arriesgar un desajuste de hidratación.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('alta') !== '1') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModo('crear');
  }, []);

  useEffect(() => {
    if (loading || !session || !user) return;
    if (yaArrancado.current) return;
    yaArrancado.current = true;

    (async () => {
      // Alta pendiente de /crear-estudio (el proyecto exigía confirmar el
      // email antes de tener sesión): crea el negocio real ahora que ya hay
      // sesión. Los datos viajan en la metadata del usuario (no localStorage),
      // así que esto funciona aunque el email se confirme desde otro
      // dispositivo distinto al que hizo el alta.
      const pending = user.user_metadata?.pending_studio as
        | { nombre: string; ciudad: string; telefono: string; comoNosConocio?: string }
        | undefined;
      if (pending) {
        const newStudio = await dbCreateStudio({ ...pending, ownerAuthUserId: user.id });
        if (newStudio) setCurrentStudioId(newStudio.id);
        await supabase.auth.updateUser({ data: { pending_studio: null } });
      }
      // Alta de instructora freelance (feature #9, /instructora/alta): mismo
      // patrón que pending_studio, con un paso extra — el estudio de un solo
      // miembro necesita también SU PROPIA ficha en `instructores` (rol
      // PROPIETARIO) para poder ser instructor_id de sus propias sesiones.
      // Sin fila en `instructores`, `current_studio_id()` seguiría resolviendo
      // por el brazo `studios.owner_auth_user_id` — sirve para el rol, pero
      // no hay a quién asignar una clase.
      const pendingFreelance = user.user_metadata?.pending_freelance as
        | { nombre: string; ciudad: string; telefono: string }
        | undefined;
      if (pendingFreelance) {
        const newStudio = await dbCreateStudio({
          nombre: pendingFreelance.nombre, ciudad: pendingFreelance.ciudad, telefono: pendingFreelance.telefono,
          ownerAuthUserId: user.id, tipoCuenta: 'FREELANCE',
        });
        // La metadata solo se limpia si las DOS escrituras salieron bien —
        // igual que pending_studio de arriba nunca comprobaba el resultado
        // de dbCreateStudio, así que un fallo raro (RLS, red) borraba la
        // metadata igual y dejaba un estudio a medias sin forma de reintentar
        // (dbCreateStudio ES idempotente por su id determinista, así que
        // reintentar en el siguiente login es seguro, nunca duplica). Sin
        // fila en `instructores`, no hay a quién asignar una clase — dejar
        // pending_freelance puesto es lo que permite que el próximo login
        // lo complete solo.
        let instructoraOk = false;
        if (newStudio) {
          setCurrentStudioId(newStudio.id);
          const res = await dbInsertInstructoraPropia({
            id: `ins-${generarId()}`, studioId: newStudio.id, authUserId: user.id,
            nombre: pendingFreelance.nombre, email: user.email ?? null,
          });
          instructoraOk = res.ok;
        }
        if (newStudio && instructoraOk) {
          await supabase.auth.updateUser({ data: { pending_freelance: null } });
        }
      }
      // Vincular la cuenta con su ficha de equipo. Solo si viene de un enlace de
      // invitación: sin él no hay nada que reclamar (el servidor tampoco lo
      // aceptaría — ver lib/equipo/reclamar-reglas.ts).
      //
      // El token viaja en la metadata del usuario por el mismo motivo que
      // `pending_studio`: sobrevive al rebote de confirmación del email, que
      // puede abrirse horas después y en otro dispositivo. sessionStorage es el
      // respaldo para el tramo dentro de la misma pestaña.
      const token = (user.user_metadata?.[CLAVE_INVITACION] as string | undefined) ?? leerTokenInvitacion();
      if (token) {
        await dbReclamarAccesoEquipo(token);
        olvidarTokenInvitacion();
        if (user.user_metadata?.[CLAVE_INVITACION]) {
          await supabase.auth.updateUser({ data: { [CLAVE_INVITACION]: null } });
        }
      }
    })().finally(async () => {
      // Hard navigation on purpose: StudioProvider (mounted once at the root
      // layout) already resolved/fetched with whatever studio_id was current
      // *before* the studio creation/claim above finished. A client-side
      // router.replace wouldn't remount it, so the dashboard could briefly
      // show the wrong tenant's data. A full reload guarantees a fresh
      // resolution against the now-final state.
      //
      // `?destino=` lo usa el panel interno para volver donde estabas tras
      // cambiar de cuenta, y la pantalla de consentimiento OAuth
      // (app/oauth/authorize/page.tsx) para volver ahí tras el login. Se
      // acota a esos dos prefijos a propósito: aceptar cualquier destino
      // convertiría el login en un redirector abierto que se puede usar
      // para phishing con nuestro propio dominio.
      const destino = new URLSearchParams(window.location.search).get('destino');
      const seguro = destino === '/interno' || destino?.startsWith('/interno/')
        || destino === '/oauth/authorize' || destino?.startsWith('/oauth/authorize?');
      if (seguro) { window.location.href = destino!; return; }

      // Antes esto era un `/dashboard` fijo, sin mirar si la cuenta tiene
      // estudio de verdad — una cuenta de Tentare Network (sin studio_id) se
      // quedaba atrapada en un skeleton infinito ahí (docs/NETWORK-AUDIT-2.md
      // §2). /api/auth/destino-post-login es la única fuente de verdad de
      // "a dónde pertenece esta cuenta"; fail-open a /dashboard si la llamada
      // falla, que es el comportamiento de siempre.
      const destinoResuelto = await fetch('/api/auth/destino-post-login', { headers: await authHeader() })
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null);
      window.location.href = destinoResuelto?.destino ?? '/dashboard';
    });
  }, [session, user, loading]);

  // El captcha se exige a nivel de PROYECTO en Supabase, así que esta llamada
  // también lo necesita: sin token, gotrue la rechaza igual que un login.
  async function reenviarElCorreoDeConfirmacion() {
    setError(''); setInfo('');
    setRecuperando(true);
    const token = await pedirToken();
    if (token === null) { setRecuperando(false); setError(ERROR_CAPTCHA); return; }
    const r = await reenviarConfirmacion(email, token || undefined);
    setRecuperando(false);
    if (r.error) { setError(r.error); return; }
    setFaltaConfirmar(false);
    setInfo(`Te hemos reenviado el correo de confirmación a ${email.trim()}. Mira también en spam.`);
  }

  async function pedirEnlaceDeRecuperacion() {
    setError(''); setInfo(''); setFaltaConfirmar(false);
    if (!email.trim()) {
      setError('Escribe tu email arriba y vuelve a pulsar.');
      return;
    }
    setRecuperando(true);
    const token = await pedirToken();
    if (token === null) { setRecuperando(false); setError(ERROR_CAPTCHA); return; }
    const r = await recuperarPassword(email, token || undefined);
    setRecuperando(false);
    if (r.error) { setError(r.error); return; }
    // A propósito NO se dice si ese email tiene cuenta: eso convertiría esta
    // pantalla en una forma de averiguar quién es cliente de Tentare.
    setInfo(
      `Si hay una cuenta con ${email.trim()}, te llega un correo con un enlace. `
      + 'Es de un solo uso y caduca, así que ábrelo en cuanto lo recibas.',
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setSubmitting(true);

    // Un solo token para los dos modos: se pide antes de bifurcar para no
    // duplicar la llamada ni el manejo del fallo.
    const token = await pedirToken();
    if (token === null) { setSubmitting(false); setError(ERROR_CAPTCHA); return; }

    if (modo === 'entrar') {
      const { error } = await signIn(email, password, token || undefined);
      if (error) {
        // Antes se aplastaba CUALQUIER error a «Email o contraseña incorrectos».
        // Recién dada de alta, con la contraseña buena, lo que fallaba era que
        // faltaba confirmar el email — y ese mensaje manda a restablecer la
        // contraseña en bucle sin que se te ocurra buscar el correo. El
        // argumento de no revelar si la cuenta existe no aplica aquí: la
        // pantalla anterior acaba de decirlo. Los mensajes concretos salen de
        // `mensajeDeError` en auth-context, que sí distingue los casos.
        setError(error);
        // Y ese mensaje decía "busca nuestro correo" sin ofrecer nada más: si
        // el correo no llegó, se borró, o el enlace caducó, era un callejón sin
        // salida. Ahora se ofrece reenviarlo, solo en este caso concreto.
        setFaltaConfirmar(/confirmar tu email/i.test(error));
        setSubmitting(false);
      }
      // El redirect + reclamo de cuenta lo hace el useEffect al detectar sesión.
    } else {
      // El token de invitación se guarda en la metadata de la cuenta para que
      // sobreviva al enlace de confirmación del email (ver el efecto de arriba).
      const invitacion = leerTokenInvitacion();
      const { error, needsConfirmation, yaRegistrado } = await signUp(
        email, password,
        invitacion ? { [CLAVE_INVITACION]: invitacion } : undefined,
        token || undefined,
      );
      if (error) {
        setError(error);
        setSubmitting(false);
      } else if (yaRegistrado) {
        // Ya hay cuenta confirmada con ese email: gotrue no manda nada, así
        // que decir "revisa tu email" sería mentir. Se dice la verdad y se
        // manda a iniciar sesión (o a "he olvidado mi contraseña" si no la
        // recuerda).
        setInfo('Ya existe una cuenta con ese email. Inicia sesión, o usa «he olvidado mi contraseña» si no la recuerdas.');
        setModo('entrar');
        setSubmitting(false);
      } else if (needsConfirmation) {
        setInfo('Cuenta creada. Revisa tu email para confirmarla y luego inicia sesión.');
        setModo('entrar');
        // Nada más crearse es cuando más falla: el correo tarda, cae en spam, o
        // se escribe mal la dirección. Que el reenvío esté a mano desde ya.
        setFaltaConfirmar(true);
        setSubmitting(false);
      }
      // Si no requiere confirmación, ya hay sesión y el useEffect se encarga.
    }
  }

  if (loading) return null;

  return (
    <div className="min-h-dvh flex items-center justify-center px-4" style={{ background: '#EEEEE8' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <LogoTentare formato="vertical" alto={76} className="mb-2" />
          <p className="text-[14px] text-[#8E8E86] mt-1">Panel de gestión</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-6" style={{ border: '1px solid #E7E7E0', boxShadow: '0 30px 60px -30px rgba(26,26,26,.18)' }}>
          <h2 className="text-[16px] font-semibold text-[#1A1A1A] mb-5">
            {modo === 'entrar' ? 'Iniciar sesión' : 'Crear cuenta de equipo'}
          </h2>

          {modo === 'crear' && (
            <p className="text-[13px] text-[#8E8E86] mb-4 -mt-2">
              Tu acceso se activa con el enlace que te haya enviado tu estudio. Si no lo tienes a mano, pídele que te lo reenvíe desde Equipo.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor={`${uid}-1`} className="block text-[13px] font-medium text-[#3A3A34] mb-1.5">
                Email
              </label>
              <input id={`${uid}-1`}
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E7E7E0] text-[14px] text-[#1A1A1A] placeholder:text-[#A8A89F] focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand transition-all"
              />
            </div>

            <div>
              <label htmlFor={`${uid}-2`} className="block text-[13px] font-medium text-[#3A3A34] mb-1.5">
                Contraseña
              </label>
              <input id={`${uid}-2`}
                type="password"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E7E7E0] text-[14px] text-[#1A1A1A] placeholder:text-[#A8A89F] focus:outline-none focus:ring-2 focus:ring-brand/15 focus:border-brand transition-all"
              />
            </div>

            {error && (
              <p className="text-[13px] text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
            )}
            {faltaConfirmar && (
              <button
                type="button" disabled={recuperando}
                onClick={() => void reenviarElCorreoDeConfirmacion()}
                className="w-full text-center text-[12.5px] font-semibold text-[#3A3A34] hover:underline disabled:opacity-60"
              >
                {recuperando ? 'Enviando…' : 'Reenviarme el correo de confirmación'}
              </button>
            )}
            {info && (
              <p className="text-[13px] rounded-lg px-3 py-2" style={{ color: '#22251A', background: '#F1F2EA' }}>{info}</p>
            )}

            {captcha}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-full text-[14px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
              style={{ background: 'var(--brand)', color: 'var(--brand-foreground)', boxShadow: '0 10px 22px color-mix(in srgb, var(--brand) 28%, transparent)' }}
            >
              {submitting ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
            </button>

            {modo === 'entrar' && (
              <button
                type="button"
                disabled={recuperando}
                onClick={() => void pedirEnlaceDeRecuperacion()}
                className="w-full text-center text-[12.5px] text-[#8E8E86] hover:text-[#3A3A34] hover:underline disabled:opacity-60"
              >
                {recuperando ? 'Enviando…' : 'He olvidado mi contraseña'}
              </button>
            )}
          </form>
        </div>

        <p className="text-center text-[12px] text-[#A8A89F] mt-5">
          {modo === 'entrar' ? (
            <>¿Eres del equipo y aún no tienes cuenta?{' '}
              <button onClick={() => { setModo('crear'); setError(''); setInfo(''); }} className="font-semibold text-[#3A3A34] hover:underline">
                Crear cuenta
              </button>
            </>
          ) : (
            <>¿Ya tienes cuenta?{' '}
              <button onClick={() => { setModo('entrar'); setError(''); setInfo(''); }} className="font-semibold text-[#3A3A34] hover:underline">
                Iniciar sesión
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
