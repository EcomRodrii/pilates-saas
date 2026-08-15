'use client';

// Login/registro dentro del Shadow Root del widget embebible (Modo B) —
// Fase 2 del Booking Engine, ver docs/auth-widget-diseno.md.
//
// Contraseña es el camino primario (§2 del diseño: petición directa a
// gotrue, sin CORS que resolver — menor fricción real dentro del Shadow
// Root). El magic link es el fallback para quien no tiene contraseña
// todavía, resuelto con el puente pestaña+postMessage de
// app/widget-auth-retorno/page.tsx — NO se completa dentro de este mismo
// documento porque `detectSessionInUrl` no puede capturar el retorno del
// email en el DOM de un dominio de tercero.
import { useState } from 'react';
import type { ModoTokens } from '@/lib/portal-modo';
import { useAuthWidget, urlRetornoWidgetAuth, type AceptacionWidget } from '@/lib/widget/usar-auth-widget';
import { useCaptchaWidget } from '@/lib/widget/turnstile-shadow';
import { textoLegalCompleto } from '@/lib/legal-textos';
import { telefonoValido } from '@/lib/csv';
import { sans, radius } from '@/lib/reservar-publico-tokens';

const ERROR_CAPTCHA = 'No hemos podido comprobar que no eres un robot. Vuelve a intentarlo; si sigue fallando, recarga la página.';

const inputStyle = (t: ModoTokens): React.CSSProperties => ({
  width: '100%', fontSize: 14, padding: '10px 14px', borderRadius: radius.card,
  border: `1px solid ${t.line}`, background: t.surface, color: t.ink, fontFamily: sans,
});

const botonPrimario = (t: ModoTokens, deshabilitado: boolean): React.CSSProperties => ({
  width: '100%', height: 44, borderRadius: radius.pillBtnSm - 2, border: 'none',
  background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
  fontSize: 14, fontWeight: 600, cursor: deshabilitado ? 'default' : 'pointer', opacity: deshabilitado ? 0.6 : 1,
});

const botonTexto = (): React.CSSProperties => ({
  background: 'none', border: 'none', color: 'var(--portal-brand)', fontSize: 13,
  cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: 3,
});

export function FormularioAccesoWidget({
  t, slug, baseUrl, studioId, autenticado, politicaPrivacidad, terminosServicio, onListo,
}: {
  t: ModoTokens;
  slug: string;
  baseUrl: string;
  studioId: string;
  /** JWT válido pero sin ficha de socia — saltar directo al registro. */
  autenticado: boolean;
  politicaPrivacidad: string;
  terminosServicio: string;
  onListo: () => void;
}) {
  const auth = useAuthWidget(slug, baseUrl);
  const { contenedorRef, pedirToken } = useCaptchaWidget(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  const [modo, setModo] = useState<'password' | 'magic-link' | 'magic-enviado'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [aceptaContrato, setAceptaContrato] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contratoTexto = politicaPrivacidad && terminosServicio
    ? textoLegalCompleto({ politicaPrivacidad, terminosServicio })
    : null;

  async function onLoginPassword() {
    setError(null);
    if (!email.trim() || !password) { setError('Escribe tu email y tu contraseña.'); return; }
    setEnviando(true);
    const token = await pedirToken();
    if (token === null) { setError(ERROR_CAPTCHA); setEnviando(false); return; }
    const r = await auth.loginConPassword(email, password, token || undefined);
    setEnviando(false);
    if ('error' in r) { setError(r.error); return; }
    // onAuthStateChange en usar-sesion-widget.ts recoge la sesión sola; si ya
    // tenía ficha, el padre deja de mostrar este formulario solo.
  }

  async function onEnviarEnlace() {
    setError(null);
    if (!email.trim()) { setError('Escribe tu email.'); return; }
    // La pestaña se abre AQUÍ, síncrona con el clic — antes de esperar el
    // token de Turnstile. Abrirla después de un `await` arriesga que el
    // navegador la trate como popup no solicitado (spike pendiente de medir,
    // docs/auth-widget-diseno.md §9.3).
    const popup = window.open(urlRetornoWidgetAuth(baseUrl, slug), 'tentare-widget-auth', 'width=420,height=600');
    setEnviando(true);
    const token = await pedirToken();
    if (token === null) { setError(ERROR_CAPTCHA); setEnviando(false); popup?.close(); return; }
    const r = await auth.enviarEnlace(email, token || undefined);
    setEnviando(false);
    if ('error' in r) { setError(r.error); popup?.close(); return; }
    setModo('magic-enviado');
  }

  async function onRegistrar() {
    setError(null);
    if (!nombre.trim()) { setError('Escribe tu nombre.'); return; }
    if (!telefonoValido(telefono)) { setError('Escribe un teléfono válido.'); return; }
    if (!aceptaContrato || !contratoTexto) { setError('Acepta las condiciones para continuar.'); return; }
    setEnviando(true);
    const r = await auth.registrar(studioId, nombre, telefono, {
      fecha: new Date().toISOString(), firma: nombre.trim(), versionTexto: contratoTexto,
    } satisfies AceptacionWidget);
    setEnviando(false);
    if (!r.ok) { setError(r.error ?? 'No se ha podido completar el registro.'); return; }
    onListo();
  }

  const contenedorEstilo: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360,
    padding: 20, borderRadius: radius.card, background: t.surface, border: `1px solid ${t.line}`, fontFamily: sans,
  };

  if (autenticado) {
    return (
      <div style={contenedorEstilo}>
        <p style={{ margin: 0, fontSize: 14, color: t.ink, fontWeight: 600 }}>Ya casi está — solo un par de datos</p>
        <input style={inputStyle(t)} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre" autoComplete="name" />
        <input style={inputStyle(t)} value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Tu teléfono" type="tel" autoComplete="tel" />
        {contratoTexto && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: t.muted }}>
            <input type="checkbox" checked={aceptaContrato} onChange={(e) => setAceptaContrato(e.target.checked)} style={{ marginTop: 2 }} />
            <span>He leído y acepto la política de privacidad y las condiciones del estudio.</span>
          </label>
        )}
        <div ref={contenedorRef} />
        {error && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--destructive)' }}>{error}</p>}
        <button type="button" onClick={onRegistrar} disabled={enviando} style={botonPrimario(t, enviando)}>
          {enviando ? 'Guardando…' : 'Continuar'}
        </button>
      </div>
    );
  }

  if (modo === 'magic-enviado') {
    return (
      <div style={contenedorEstilo}>
        <p style={{ margin: 0, fontSize: 14, color: t.ink }}>
          Te hemos enviado un enlace a <strong>{email}</strong>. Ábrelo en la pestaña nueva para entrar.
        </p>
        <button type="button" onClick={() => setModo('password')} style={botonTexto()}>Volver</button>
      </div>
    );
  }

  return (
    <div style={contenedorEstilo}>
      <p style={{ margin: 0, fontSize: 14, color: t.ink, fontWeight: 600 }}>Inicia sesión para reservar</p>
      <input style={inputStyle(t)} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" autoComplete="email" />
      {modo === 'password' && (
        <input style={inputStyle(t)} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña" type="password" autoComplete="current-password" />
      )}
      <div ref={contenedorRef} />
      {error && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--destructive)' }}>{error}</p>}
      {modo === 'password' ? (
        <>
          <button type="button" onClick={onLoginPassword} disabled={enviando} style={botonPrimario(t, enviando)}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
          <button type="button" onClick={() => { setError(null); setModo('magic-link'); }} style={botonTexto()}>
            No tengo contraseña — enviarme un enlace
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={onEnviarEnlace} disabled={enviando} style={botonPrimario(t, enviando)}>
            {enviando ? 'Enviando…' : 'Enviarme un enlace por email'}
          </button>
          <button type="button" onClick={() => { setError(null); setModo('password'); }} style={botonTexto()}>
            Ya tengo contraseña
          </button>
        </>
      )}
    </div>
  );
}
