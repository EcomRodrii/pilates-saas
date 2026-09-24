'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Session } from '@supabase/auth-js';
import { supabasePortal } from '@/lib/db/supabase-portal';
import {
  emailDelIntento, sesionAutenticadaPorEmailDespuesDe, TIPO_PUENTE_LISTO,
} from '@/lib/widget/puente-sesion';
import { useCodigoDelCorreo } from '@/lib/student/codigo-del-correo';

// Mitad cliente de app/widget-auth-retorno/page.tsx. `destino`, `nonce` y
// `abiertoEn` ya vienen resueltos por el servidor — este componente NUNCA
// vuelve a leer la URL ni a decidir a quién mandar los tokens.
//
// ⚠️ Nunca reenvía la sesión que ya hubiera en el navegador. Solo la que nace
// de un acceso por email completado después de abrir esta página (ver
// `sesionAutenticadaPorEmailDespuesDe`). El tipo de evento de auth-js NO sirve
// de señal: al arrancar emite `INITIAL_SESSION`/`SIGNED_IN` con la sesión
// guardada. Por eso cada vía de entrada pasa por el mismo filtro.
//
// Dos vías de entrada, según el correo que le llegue:
//
//  · ENLACE (cuenta ya confirmada): la alumna lo abre en OTRA pestaña (sin
//    `opener`), allí auth-js guarda la sesión y la anuncia por BroadcastChannel
//    (canal = storageKey); aquí llega a `onAuthStateChange` con la sesión en el
//    propio evento — útil también si la sesión vive en sessionStorage, que no se
//    comparte entre pestañas. Como red de seguridad para navegadores sin
//    BroadcastChannel, se sondea `getSession()`.
//  · CÓDIGO de 6 cifras (alumna nueva: gotrue le manda el correo de alta, no el
//    de enlace). Se escribe aquí, que es la ventana que tiene el foco; abre la
//    sesión en este mismo documento y pasa por el MISMO filtro de arriba.
const SONDEO_MS = 3_000;

const estiloCampo: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '12px 14px', borderRadius: 12,
  border: '1px solid #ddd8c8', background: '#fff', color: '#1a1a1a',
};

export function WidgetAuthRetornoCliente({ destino, nonce, abiertoEn }: {
  destino: string | null;
  nonce: string | null;
  abiertoEn: number;
}) {
  const [estado, setEstado] = useState<'esperando' | 'enviado' | 'error'>(destino && nonce ? 'esperando' : 'error');
  // El email del intento: lo manda el widget (no viaja en la URL). Si el widget
  // es una versión anterior y no contesta, lo escribe la alumna.
  const [email, setEmail] = useState('');
  const [emailDelWidget, setEmailDelWidget] = useState(false);
  // Sin reenvío desde aquí: pedir otro correo necesita el captcha del widget.
  const [codigoAceptado, setCodigoAceptado] = useState(false);
  const codigo = useCodigoDelCorreo(
    email,
    async () => ({ error: 'Pídelo otra vez desde la web del estudio.' }),
    () => setCodigoAceptado(true),
  );
  // Sin ventana madre no hay a quién mandar la sesión: es la pestaña donde se
  // abrió el ENLACE del correo (que llega aquí porque es su vuelta), o una web
  // que no deja abrir ventanas relacionadas. Ahí el formulario del código no
  // pinta nada. Leído en el cliente: en el servidor no hay `window`.
  const sinVentanaMadre = useSyncExternalStore(() => () => {}, () => !window.opener, () => false);

  useEffect(() => {
    if (!destino || !nonce) return;

    let cancelado = false;
    let enviado = false;
    function enviarSiNueva(session: Session | null) {
      if (cancelado || enviado || !session?.access_token || !session.refresh_token) return;
      if (!sesionAutenticadaPorEmailDespuesDe(session.access_token, abiertoEn)) return;
      if (!window.opener) return;
      enviado = true;
      window.opener.postMessage({
        tipo: 'tentare-widget-auth', ok: true, nonce,
        access_token: session.access_token, refresh_token: session.refresh_token,
      }, destino!);
      setEstado('enviado');
      window.close();
    }
    async function sondear() {
      const { data: { session } } = await supabasePortal.auth.getSession();
      enviarSiNueva(session);
    }
    void sondear();
    const intervalo = setInterval(() => { void sondear(); }, SONDEO_MS);
    const { data: sub } = supabasePortal.auth.onAuthStateChange((_evento, session) => {
      enviarSiNueva(session);
    });

    // Pedir el email al widget. Solo se acepta la respuesta de la ventana que
    // abrió esta, desde el origen ya validado en servidor y con este nonce.
    function onMessage(e: MessageEvent) {
      if (e.origin !== destino || !window.opener || e.source !== window.opener) return;
      const suEmail = emailDelIntento(e.data, nonce);
      if (suEmail) { setEmail(suEmail); setEmailDelWidget(true); }
    }
    window.addEventListener('message', onMessage);
    window.opener?.postMessage({ tipo: TIPO_PUENTE_LISTO, nonce }, destino);

    return () => {
      cancelado = true;
      sub.subscription.unsubscribe();
      clearInterval(intervalo);
      window.removeEventListener('message', onMessage);
    };
  }, [destino, nonce, abiertoEn]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif', padding: 24, boxSizing: 'border-box', color: '#1a1a1a',
    }}>
      {estado === 'esperando' && (sinVentanaMadre || codigoAceptado) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center', maxWidth: 340 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>{codigoAceptado ? 'Correo confirmado' : 'Ya puedes volver'}</h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#555' }}>
            {codigoAceptado
              ? 'Vuelve a la web del estudio para seguir.'
              : 'Vuelve a la web del estudio. Si has abierto el enlace del correo, allí ya habrás entrado.'}
          </p>
          <button
            type="button" onClick={() => window.close()}
            style={{ padding: '8px 20px', borderRadius: 999, border: '1px solid #ddd8c8', background: 'none', cursor: 'pointer' }}
          >
            Cerrar
          </button>
        </div>
      )}
      {estado === 'esperando' && !sinVentanaMadre && !codigoAceptado && (
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
      {estado === 'enviado' && <p>Ya puedes cerrar esta ventana.</p>}
      {estado === 'error' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', textAlign: 'center' }}>
          <p>No hemos podido confirmar el acceso automáticamente.</p>
          <button
            type="button"
            onClick={() => window.close()}
            style={{ padding: '8px 20px', borderRadius: 999, border: '1px solid #ddd8c8', background: 'none', cursor: 'pointer' }}
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}
