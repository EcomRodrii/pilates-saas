'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Session } from '@supabase/auth-js';
import { captchaGastado } from '@/lib/auth/captcha-usado';
import { mensajeSeguro } from '@/lib/errores';
import { ERROR_CAPTCHA, useCaptcha } from '@/components/auth/turnstile-widget';
import {
  emailDelIntento, encargoDelIntento, ERROR_COMPROBAR_CUENTA, MENSAJE_CUENTA_DE_EQUIPO, MOTIVO_CUENTA_DE_EQUIPO,
  RUTA_CUENTA_DE_EQUIPO, sesionAutenticadaPorEmailDespuesDe, sesionPorContrasenaDespuesDe,
  TIPO_ENLACE_ENVIADO, TIPO_PUENTE_LISTO, TIPO_RESULTADO_ACCESO, urlPuente, urlReservarCompleta, veredictoCuenta,
  type EncargoAcceso, type VeredictoCuenta,
} from '@/lib/widget/puente-sesion';
import { useCodigoDelCorreo, type ClienteAuth } from '@/lib/student/codigo-del-correo';
import { clienteEfimero, clientePuente, olvidarSesionDelCorreo } from './clientes-auth';

// Mitad cliente de app/widget-auth-retorno/page.tsx. `destino`, `nonce` y
// `abiertoEn` ya vienen resueltos por el servidor — este componente NUNCA
// vuelve a leer la URL ni a decidir a quién mandar los tokens.
//
// Tres cosas que hace esta ventana, todas para el widget sin marco de la web
// del estudio que la abrió (`window.opener`, en `destino`):
//
//  · ENTRAR CON CONTRASEÑA por encargo del widget (16-oct-2026). El captcha que
//    gotrue exige solo da token en tentare.app (en la web del estudio, error
//    110200), así que el acceso se hace AQUÍ: captcha + `signInWithPassword`
//    con un cliente SIN almacenamiento, y se devuelve exactamente esa sesión.
//    Nunca toca la sesión guardada en el navegador ni la deja guardada en
//    tentare.app (dos dueños del mismo refresh token se lo revocarían el uno
//    al otro al rotarlo).
//  · La del CORREO, igual de un solo dueño (20-oct-2026): se abre en el cliente
//    propio del puente (`clientePuente`, su propia clave, nunca la del portal
//    de la alumna) y, al entregarla, se borra a mano de tentare.app, sin
//    llamar a gotrue (ver `CLAVE_SESION_PUENTE`).
//  · Antes de entregar NINGUNA sesión, se pregunta al servidor si la cuenta es
//    de equipo (`RUTA_CUENTA_DE_EQUIPO`). Si lo es, o si no hay respuesta
//    clara, no sale: se cierra esa sesión (solo esa, `scope: 'local'`; no la
//    tiene nadie más) y se dice por qué.
//  · MANDAR EL CORREO por encargo del widget (mismo motivo): captcha +
//    `signInWithOtp`, con la vuelta del enlace a esta misma página y nonce.
//  · Esperar la sesión del correo. Solo la que nace de un acceso por email
//    completado después de abrir esta página (ver
//    `sesionAutenticadaPorEmailDespuesDe`). ⚠️ Nunca reenvía la sesión que ya
//    hubiera en el navegador: el tipo de evento de auth-js NO sirve de señal (al
//    arrancar emite `INITIAL_SESSION`/`SIGNED_IN` con la sesión guardada), así
//    que cada vía pasa por el mismo filtro. Dos vías, según el correo:
//      - ENLACE (cuenta ya confirmada): la alumna lo abre en OTRA pestaña (sin
//        `opener`), allí auth-js guarda la sesión y la anuncia por
//        BroadcastChannel; aquí llega a `onAuthStateChange`. Como red de
//        seguridad para navegadores sin BroadcastChannel, se sondea.
//      - CÓDIGO de 6 cifras (alumna nueva: gotrue le manda el correo de alta).
//        Se escribe aquí y abre la sesión en este documento, con el mismo filtro.
//
// Un encargo por ventana: si llega otro, se ignora. Y solo se acepta de la
// ventana que abrió esta, desde `destino`, con el nonce de esta página.
const SONDEO_MS = 3_000;
/**
 * La pestaña del ENLACE guarda la sesión para que la recoja la ventana (al
 * momento por BroadcastChannel, o en el siguiente sondeo). Pasado esto, si sigue
 * ahí es que no había ventana esperando: se olvida, no se queda en tentare.app.
 */
const OLVIDO_EN_LA_PESTANA_DEL_ENLACE_MS = 60_000;
/** Sin noticias del widget en este tiempo, se ofrece la página de reservas. */
const ESPERA_WIDGET_MS = 10_000;

const estiloCampo: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '12px 14px', borderRadius: 12,
  border: '1px solid #ddd8c8', background: '#fff', color: '#1a1a1a',
};
const estiloBotonSecundario: React.CSSProperties = {
  padding: '8px 20px', borderRadius: 999, border: '1px solid #ddd8c8', background: 'none', cursor: 'pointer',
};

function errorDeAcceso(mensaje: string): string {
  const msg = mensaje.toLowerCase();
  if (msg.includes('invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.';
  return mensajeSeguro(mensaje, 'No se ha podido iniciar sesión. Inténtalo de nuevo en unos segundos.');
}

/** Si esta carga de la página ya le dijo «listo» al widget (ver el efecto). */
let listoAvisado = false;

type Fase = 'conectando' | 'entrando' | 'enviando-correo' | 'esperando' | 'comprobando' | 'enviado' | 'sin-respuesta' | 'cuenta-de-equipo' | 'error';

/** Lo decide el servidor; cualquier fallo es «sin respuesta» (y no se entrega). */
async function comprobarCuenta(accessToken: string): Promise<VeredictoCuenta> {
  try {
    const res = await fetch(RUTA_CUENTA_DE_EQUIPO, {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
    });
    return veredictoCuenta(res.status, await res.json().catch(() => null));
  } catch {
    return 'sin-respuesta';
  }
}

export function WidgetAuthRetornoCliente({ slug, destino, nonce, abiertoEn }: {
  slug: string | null;
  destino: string | null;
  nonce: string | null;
  abiertoEn: number;
}) {
  const [fase, setFase] = useState<Fase>(destino && nonce ? 'conectando' : 'error');
  // El email del intento: lo manda el widget (no viaja en la URL). Si el widget
  // es una versión anterior y no contesta, lo escribe la alumna.
  const [email, setEmail] = useState('');
  const [emailDelWidget, setEmailDelWidget] = useState(false);
  // Sin reenvío desde aquí: pedir otro correo es otro intento del widget.
  const [codigoAceptado, setCodigoAceptado] = useState(false);
  // El cliente del correo (la sesión del código también se abre en él, nunca en
  // el del portal). Solo en el navegador, y solo con destino: sin él no hay a
  // quién entregar, y crear el cliente recogería la sesión del enlace de la URL
  // para dejarla guardada aquí sin dueño.
  const [cliente] = useState<ClienteAuth | undefined>(() => (
    typeof window === 'undefined' || !destino || !nonce ? undefined : clientePuente()));
  const codigo = useCodigoDelCorreo(
    email,
    async () => ({ error: 'Pídelo otra vez desde la web del estudio.' }),
    () => setCodigoAceptado(true),
    { cliente },
  );
  const { widget: captcha, pedirToken, esperarMontado } = useCaptcha();
  const captchaRef = useRef({ pedirToken, esperarMontado });
  useEffect(() => { captchaRef.current = { pedirToken, esperarMontado }; }, [pedirToken, esperarMontado]);
  // Sin ventana madre no hay a quién mandar la sesión: es la pestaña donde se
  // abrió el ENLACE del correo (que llega aquí porque es su vuelta), o una web
  // que corta el vínculo entre ventanas. Leído en el cliente: en el servidor no
  // hay `window`.
  const sinVentanaMadre = useSyncExternalStore(() => () => {}, () => !window.opener, () => false);

  useEffect(() => {
    if (!destino || !nonce) return;

    let cancelado = false;
    let enviado = false;
    let encargoRecibido = false;
    // El widget de ESTE intento ya ha hablado (encargo o email, desde `destino` y
    // con el nonce). Sin eso no se entrega: una pestaña del enlace que tenga otra
    // ventana madre (un webmail que abre los enlaces sin `noopener`) no es la
    // ventana del widget, y no debe gastar la sesión que esa espera.
    let conWidget = false;
    // Con un encargo de contraseña, la sesión es SOLO la que devuelve el cliente efímero: una sesión
    // por correo que apareciera mientras tanto en tentare.app (otra pestaña, otro estudio) no se reenvía.
    let soloContrasena = false;

    function alWidget(mensaje: Record<string, unknown>) {
      window.opener?.postMessage({ nonce, ...mensaje }, destino!);
    }
    // `desde`: el cliente donde está abierta la sesión. `delCorreo`: la guarda el
    // del puente, y hay que borrarla de tentare.app al entregarla.
    async function entregar(session: Pick<Session, 'access_token' | 'refresh_token'>, desde: ClienteAuth, delCorreo: boolean) {
      if (cancelado || enviado || !conWidget || !window.opener) return;
      enviado = true;
      setFase('comprobando');
      const veredicto = await comprobarCuenta(session.access_token);
      if (cancelado) { if (delCorreo) olvidarSesionDelCorreo(); return; }
      if (veredicto !== 'alumna') {
        // No sale. Se cierra en gotrue ESTA sesión (la del token que se tiene en
        // la mano, no lo que haya guardado, que podría ser otra o ya nada; y solo
        // ella: `local`), que no tiene nadie más, y se borra de aquí.
        await desde.admin.signOut(session.access_token, 'local').catch(() => {});
        if (delCorreo) olvidarSesionDelCorreo();
        if (veredicto === 'equipo') {
          alWidget({ tipo: TIPO_RESULTADO_ACCESO, ok: false, error: MENSAJE_CUENTA_DE_EQUIPO, motivo: MOTIVO_CUENTA_DE_EQUIPO });
          // La ventana se queda abierta con la salida: la página de reservas entera.
          setFase('cuenta-de-equipo');
          return;
        }
        fallar(ERROR_COMPROBAR_CUENTA);
        return;
      }
      // Un solo dueño: el token es del widget desde ya. Se borra a mano, SIN
      // `signOut` (revocaría también la sesión del widget, que es esta).
      if (delCorreo) olvidarSesionDelCorreo();
      alWidget({ tipo: TIPO_RESULTADO_ACCESO, ok: true, access_token: session.access_token, refresh_token: session.refresh_token });
      setFase('enviado');
      window.close();
    }
    function fallar(error: string) {
      if (cancelado) return;
      alWidget({ tipo: TIPO_RESULTADO_ACCESO, ok: false, error });
      setFase('enviado');
      window.close();
    }
    function enviarSiNueva(session: Session | null) {
      if (soloContrasena) return;
      if (!session?.access_token || !session.refresh_token) return;
      if (!sesionAutenticadaPorEmailDespuesDe(session.access_token, abiertoEn)) return;
      void entregar(session, clientePuente(), true);
    }

    async function cumplir(encargo: EncargoAcceso) {
      setEmail(encargo.email);
      setEmailDelWidget(true);
      if (encargo.accion === 'password') soloContrasena = true;
      setFase(encargo.accion === 'password' ? 'entrando' : 'enviando-correo');
      // El encargo llega nada más cargar, antes que el script de Cloudflare:
      // sin esperar a que el captcha esté montado, `pedirToken` diría «no eres
      // un robot» sin haberlo intentado.
      const montado = await captchaRef.current.esperarMontado();
      if (cancelado) return;
      const token = montado ? await captchaRef.current.pedirToken() : null;
      if (cancelado) return;
      if (token === null) { fallar(ERROR_CAPTCHA); return; }
      const captchaToken = token || undefined;

      if (encargo.accion === 'password') {
        const { data, error } = await clienteEfimero().signInWithPassword({
          email: encargo.email, password: encargo.password, options: { captchaToken },
        });
        if (captchaToken) captchaGastado();
        if (error || !data.session) { fallar(errorDeAcceso(error?.message ?? '')); return; }
        if (!sesionPorContrasenaDespuesDe(data.session.access_token, abiertoEn)) {
          fallar('No se ha podido iniciar sesión. Inténtalo de nuevo en unos segundos.');
          return;
        }
        await entregar(data.session, clienteEfimero(), false);
        return;
      }

      const { error } = await clientePuente().signInWithOtp({
        email: encargo.email,
        // La vuelta del enlace: esta misma página, con el mismo intento.
        options: { emailRedirectTo: urlPuente(window.location.origin, slug ?? '', destino!, nonce!), captchaToken },
      });
      if (captchaToken) captchaGastado();
      if (cancelado) return;
      if (error) {
        fallar(mensajeSeguro(error.message, 'No se ha podido enviar el enlace. Inténtalo de nuevo en unos segundos.'));
        return;
      }
      alWidget({ tipo: TIPO_ENLACE_ENVIADO });
      setFase('esperando');
    }

    const puente = clientePuente();
    async function sondear() {
      const { data: { session } } = await puente.getSession();
      enviarSiNueva(session);
    }
    void sondear();
    const intervalo = setInterval(() => { void sondear(); }, SONDEO_MS);
    const { data: sub } = puente.onAuthStateChange((_evento, session) => {
      enviarSiNueva(session);
    });
    // La pestaña del enlace (sin ventana madre) no entrega: deja la sesión para la
    // ventana y la olvida al minuto, o al cerrarse si es antes.
    const olvidoEnlace = window.opener ? undefined : setTimeout(olvidarSesionDelCorreo, OLVIDO_EN_LA_PESTANA_DEL_ENLACE_MS);
    if (!window.opener) window.addEventListener('pagehide', olvidarSesionDelCorreo);

    // Solo se atiende a la ventana que abrió esta, desde el origen ya validado
    // en servidor y con este nonce.
    function onMessage(e: MessageEvent) {
      if (e.origin !== destino || !window.opener || e.source !== window.opener) return;
      const encargo = encargoDelIntento(e.data, nonce);
      if (encargo) {
        if (encargoRecibido) return;
        encargoRecibido = true;
        conWidget = true;
        clearTimeout(sinRespuesta);
        void cumplir(encargo);
        return;
      }
      // Un widget de antes (o esta ventana recargada): solo el email, y el
      // correo ya lo mandó él.
      const suEmail = emailDelIntento(e.data, nonce);
      if (suEmail) {
        conWidget = true;
        clearTimeout(sinRespuesta);
        setEmail(suEmail); setEmailDelWidget(true);
        setFase((f) => (f === 'conectando' || f === 'sin-respuesta' ? 'esperando' : f));
      }
    }
    // Solo con ventana madre: la pestaña del enlace del correo no espera a nadie.
    const sinRespuesta = window.opener ? setTimeout(() => {
      setFase((f) => (f === 'conectando' ? 'sin-respuesta' : f));
    }, ESPERA_WIDGET_MS) : undefined;
    window.addEventListener('message', onMessage);
    // UNA vez por carga de la página, aunque el efecto corra dos veces (React en
    // desarrollo lo monta, desmonta y vuelve a montar): para el widget, un
    // segundo «listo» es una ventana RECARGADA, y con la contraseña ya enviada
    // lo trata como intento perdido.
    if (!listoAvisado) {
      listoAvisado = true;
      window.opener?.postMessage({ tipo: TIPO_PUENTE_LISTO, nonce }, destino);
    }

    return () => {
      cancelado = true;
      sub.subscription.unsubscribe();
      clearInterval(intervalo);
      clearTimeout(sinRespuesta);
      clearTimeout(olvidoEnlace);
      window.removeEventListener('pagehide', olvidarSesionDelCorreo);
      window.removeEventListener('message', onMessage);
    };
  }, [destino, nonce, abiertoEn, slug]);

  const enlaceReservar = slug && typeof window !== 'undefined' ? urlReservarCompleta(window.location.origin, slug) : null;
  const esperandoCorreo = fase === 'esperando' || (fase === 'conectando' && sinVentanaMadre);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif', padding: 24, boxSizing: 'border-box', color: '#1a1a1a', gap: 16,
    }}>
      {(fase === 'conectando' && !sinVentanaMadre) && <p style={{ margin: 0, fontSize: 15 }}>Un momento…</p>}
      {fase === 'entrando' && <p role="status" style={{ margin: 0, fontSize: 15 }}>Entrando…</p>}
      {fase === 'enviando-correo' && <p role="status" style={{ margin: 0, fontSize: 15 }}>Enviando el correo…</p>}
      {fase === 'comprobando' && <p role="status" style={{ margin: 0, fontSize: 15 }}>Entrando…</p>}
      {fase === 'cuenta-de-equipo' && (
        <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center', maxWidth: 340 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>{MENSAJE_CUENTA_DE_EQUIPO}</h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#555' }}>
            Desde la web de un estudio solo pueden entrar sus alumnas.
            {enlaceReservar && <> Para reservar, <a href={enlaceReservar} style={{ color: '#1a1a1a' }}>entra desde la página de reservas del estudio</a>.</>}
          </p>
          <button type="button" onClick={() => window.close()} style={estiloBotonSecundario}>Cerrar</button>
        </div>
      )}
      {fase === 'sin-respuesta' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center', maxWidth: 340 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>No hemos podido conectar con la web del estudio</h1>
          {enlaceReservar && (
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#555' }}>
              Puedes <a href={enlaceReservar} style={{ color: '#1a1a1a' }}>entrar desde la página de reservas del estudio</a>.
            </p>
          )}
          <button type="button" onClick={() => window.close()} style={estiloBotonSecundario}>Cerrar</button>
        </div>
      )}
      {esperandoCorreo && (sinVentanaMadre || codigoAceptado) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center', maxWidth: 340 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>{codigoAceptado ? 'Correo confirmado' : 'Ya puedes volver'}</h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#555' }}>
            {codigoAceptado
              ? 'Vuelve a la web del estudio para seguir.'
              : 'Vuelve a la web del estudio. Si has abierto el enlace del correo, allí ya habrás entrado.'}
          </p>
          <button type="button" onClick={() => window.close()} style={estiloBotonSecundario}>Cerrar</button>
        </div>
      )}
      {esperandoCorreo && !sinVentanaMadre && !codigoAceptado && (
        <form
          onSubmit={(e) => { e.preventDefault(); void codigo.verificar(); }}
          style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' }}
          noValidate
        >
          <h1 style={{ fontSize: 20, margin: 0 }}>Revisa tu correo</h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#555' }}>
            {emailDelWidget && <>Te hemos escrito a <strong>{email}</strong>. </>}
            Si te llega un código de 6 cifras, escríbelo aquí. Si te llega un enlace, ábrelo: esta ventana se cerrará sola.
          </p>
          {!emailDelWidget && (
            <input
              aria-label="Tu email" placeholder="Tu email" type="email" autoComplete="email" inputMode="email"
              value={email} onChange={(e) => setEmail(e.target.value)} style={estiloCampo}
            />
          )}
          <input
            aria-label="Código del correo" data-testid="codigo-correo" placeholder="Código de 6 cifras"
            inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={12}
            value={codigo.codigo} onChange={(e) => codigo.escribir(e.target.value)}
            style={{ ...estiloCampo, textAlign: 'center', letterSpacing: '0.3em' }}
          />
          {codigo.error && <p role="alert" style={{ margin: 0, fontSize: 13, color: '#b42318' }}>{codigo.error}</p>}
          <button
            type="submit" disabled={codigo.verificando}
            style={{ height: 44, borderRadius: 999, border: 'none', background: '#1a1a1a', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: codigo.verificando ? 0.6 : 1 }}
          >
            {codigo.verificando ? 'Comprobando…' : 'Entrar con el código'}
          </button>
          <button
            type="button" onClick={() => window.close()}
            style={{ background: 'none', border: 'none', color: '#555', fontSize: 13, textDecoration: 'underline', cursor: 'pointer' }}
          >
            Cerrar esta ventana
          </button>
        </form>
      )}
      {fase === 'enviado' && <p>Ya puedes cerrar esta ventana.</p>}
      {fase === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', textAlign: 'center' }}>
          <p>No hemos podido confirmar el acceso automáticamente.</p>
          <button type="button" onClick={() => window.close()} style={estiloBotonSecundario}>Cerrar</button>
        </div>
      )}
      {/* El captcha: invisible salvo que Cloudflare pida resolver algo a mano.
          Aquí sí da token: esta página es tentare.app. */}
      {destino && nonce && captcha}
    </div>
  );
}
