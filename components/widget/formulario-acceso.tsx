'use client';

// Login/registro dentro del Shadow Root del widget embebible (Modo B) —
// Fase 2 del Booking Engine, ver docs/auth-widget-diseno.md.
//
// Contraseña es el camino primario; el correo (enlace o código), para quien no
// tiene contraseña todavía. Los dos se HACEN en una ventana de Tentare
// (app/widget-auth-retorno), no aquí: el captcha que gotrue exige en todo
// acceso solo da token en tentare.app, nunca en la web del estudio (error
// 110200 de Turnstile). Este formulario recoge los datos, abre esa ventana en
// el propio clic y espera su respuesta (lib/widget/usar-auth-widget.ts).
// Si la ventana no se puede abrir, ofrece la página de reservas entera.
import { useState } from 'react';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { verificarCodigoApp } from '@/lib/auth/codigo-app';
import type { ModoTokens } from '@/lib/portal-modo';
import { useAuthWidget, type AceptacionWidget, type ResultadoAcceso } from '@/lib/widget/usar-auth-widget';
import { MENSAJE_CUENTA_DE_EQUIPO, urlReservarCompleta } from '@/lib/widget/puente-sesion';
import { textoConsentimientoMarketing, textoLegalCompleto } from '@/lib/legal-textos';
// Auditoría 2026-09-22 (F-6/E-22): aquí la divergencia no descartaba el dato,
// BLOQUEABA el alta. `@/lib/csv` exige 9 dígitos españoles (es el validador del
// importador de CSV), así que una alumna con móvil extranjero no podía
// registrarse en el widget que el estudio paga por tener en su web — y el
// estudio no se enteraba de que había existido. `lib/reservar/formato.ts` es la
// fuente única para un teléfono tecleado por una persona.
import { telefonoValido } from '@/lib/reservar/formato';
import { sans, radius } from '@/lib/reservar-publico-tokens';

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
  t, slug, baseUrl, studioId, autenticado, segundoPaso = false, politicaPrivacidad, terminosServicio, nombreEstudio, onListo,
}: {
  /** El texto del consentimiento de marketing lleva el nombre del estudio, como el del servidor. */
  nombreEstudio?: string;
  t: ModoTokens;
  slug: string;
  baseUrl: string;
  studioId: string;
  /** JWT válido pero sin ficha de socia — saltar directo al registro. */
  autenticado: boolean;
  /**
   * Tiene la verificación en dos pasos activada y esta sesión aún no la ha
   * pasado: se le pide aquí mismo el código de su app. Solo la app: la cookie
   * del dispositivo recordado y el código por correo viven en la web de
   * Tentare, no en la del estudio.
   */
  segundoPaso?: boolean;
  politicaPrivacidad: string;
  terminosServicio: string;
  onListo: () => void;
}) {
  // La ventana puede decir que no DESPUÉS de «correo enviado» (al abrir el
  // enlace o escribir el código): se vuelve al formulario con el porqué.
  const auth = useAuthWidget(slug, baseUrl, (r) => {
    if (!('error' in r)) return;
    setModo('magic-link');
    setCuentaDeEquipo('cuentaDeEquipo' in r);
    setError('cuentaDeEquipo' in r ? null : r.error);
  });

  const [modo, setModo] = useState<'password' | 'magic-link' | 'magic-enviado'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [aceptaContrato, setAceptaContrato] = useState(false);
  // Consentimiento de marketing: aparte, desmarcado y opcional (RGPD art. 7).
  const [aceptaMarketing, setAceptaMarketing] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La ventana de Tentare no se pudo usar: se ofrece la página de reservas.
  const [sinVentana, setSinVentana] = useState<'bloqueada' | 'cerrada' | null>(null);
  // La cuenta es de un equipo: la ventana no entrega su sesión aquí.
  const [cuentaDeEquipo, setCuentaDeEquipo] = useState(false);

  const contratoTexto = politicaPrivacidad && terminosServicio
    ? textoLegalCompleto({ politicaPrivacidad, terminosServicio })
    : null;

  // ⚠️ `auth.acceder` va SIN ningún `await` delante: abre la ventana en el
  // propio clic (si no, el navegador la bloquea). Por eso estos manejadores
  // validan de forma síncrona y el estado de carga se enciende después.
  async function esperarAcceso(intento: Promise<ResultadoAcceso>): Promise<ResultadoAcceso> {
    setEnviando(true);
    const r = await intento;
    setEnviando(false);
    if ('sinVentana' in r) setSinVentana(r.sinVentana);
    if ('cuentaDeEquipo' in r) setCuentaDeEquipo(true);
    else if ('error' in r) setError(r.error);
    return r;
  }

  async function onLoginPassword() {
    setError(null); setSinVentana(null); setCuentaDeEquipo(false);
    if (!email.trim() || !password) { setError('Escribe tu email y tu contraseña.'); return; }
    const r = await esperarAcceso(auth.acceder({ accion: 'password', email: email.trim(), password }));
    if ('ok' in r) setPassword('');
    // usar-sesion-widget.ts recoge la sesión sola (onAuthStateChange); si ya
    // tenía ficha, el padre deja de mostrar este formulario.
  }

  async function onEnviarEnlace() {
    setError(null); setSinVentana(null); setCuentaDeEquipo(false);
    if (!email.trim()) { setError('Escribe tu email.'); return; }
    const r = await esperarAcceso(auth.acceder({ accion: 'enlace', email: email.trim() }));
    if ('enviado' in r) setModo('magic-enviado');
  }

  async function onRegistrar() {
    setError(null);
    if (!nombre.trim()) { setError('Escribe tu nombre.'); return; }
    if (!telefonoValido(telefono)) { setError('Escribe un teléfono válido.'); return; }
    if (!aceptaContrato || !contratoTexto) { setError('Acepta las condiciones para continuar.'); return; }
    setEnviando(true);
    const r = await auth.registrar(studioId, nombre, telefono, {
      fecha: new Date().toISOString(), firma: nombre.trim(), versionTexto: contratoTexto,
    } satisfies AceptacionWidget, aceptaMarketing);
    setEnviando(false);
    if (!r.ok) { setError(r.error ?? 'No se ha podido completar el registro.'); return; }
    onListo();
  }

  const contenedorEstilo: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360,
    padding: 20, borderRadius: radius.card, background: t.surface, border: `1px solid ${t.line}`, fontFamily: sans,
  };

  if (segundoPaso) {
    return <CodigoAppWidget t={t} estilo={contenedorEstilo} slug={slug} baseUrl={baseUrl} onSalir={() => void auth.logout()} />;
  }

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
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: t.muted }}>
          <input type="checkbox" checked={aceptaMarketing} onChange={(e) => setAceptaMarketing(e.target.checked)} style={{ marginTop: 2 }} />
          <span>Quiero recibir novedades y ofertas de {nombreEstudio || 'el estudio'} por email (opcional).</span>
        </label>
        <details style={{ fontSize: 11.5, color: t.muted, marginTop: -6, marginLeft: 22 }}>
          <summary style={{ cursor: 'pointer' }}>Qué acepto</summary>
          {textoConsentimientoMarketing({ nombre: nombreEstudio || undefined })}
        </details>
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
        {/* Qué llega depende de la cuenta: con cuenta confirmada, un ENLACE;
            una alumna nueva recibe el correo de alta, con un CÓDIGO de 6 cifras
            que se escribe en la ventana que se acaba de abrir (el puente). */}
        <p style={{ margin: 0, fontSize: 14, color: t.ink }}>
          Te hemos escrito a <strong>{email}</strong>. Sigue en la ventana que se ha abierto: si te llega un
          código de 6 cifras, escríbelo allí; si te llega un enlace, ábrelo. Después entrarás aquí sola.
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
      {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: 'var(--destructive)' }}>{error}</p>}
      {sinVentana && <SinVentana t={t} motivo={sinVentana} href={urlReservarCompleta(baseUrl, slug)} />}
      {cuentaDeEquipo && <CuentaDeEquipo t={t} href={urlReservarCompleta(baseUrl, slug)} />}
      {enviando && (
        <p style={{ margin: 0, fontSize: 12.5, color: t.muted }}>
          Sigue en la ventana de Tentare que se ha abierto; se cerrará sola.
        </p>
      )}
      {modo === 'password' ? (
        <>
          <button type="button" onClick={onLoginPassword} disabled={enviando} style={botonPrimario(t, enviando)}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
          <button type="button" onClick={() => { setError(null); setSinVentana(null); setCuentaDeEquipo(false); setModo('magic-link'); }} style={botonTexto()}>
            No tengo contraseña — enviarme un enlace
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={onEnviarEnlace} disabled={enviando} style={botonPrimario(t, enviando)}>
            {enviando ? 'Enviando…' : 'Enviarme un enlace por email'}
          </button>
          <button type="button" onClick={() => { setError(null); setSinVentana(null); setCuentaDeEquipo(false); setModo('password'); }} style={botonTexto()}>
            Ya tengo contraseña
          </button>
        </>
      )}
    </div>
  );
}

/**
 * La salida cuando la ventana de Tentare no sirve: el navegador no la dejó
 * abrir, se cerró antes de terminar, o la web del estudio corta el vínculo
 * entre ventanas. La página de reservas entera vive en tentare.app, donde el
 * acceso funciona siempre.
 */
function SinVentana({ t, motivo, href }: { t: ModoTokens; motivo: 'bloqueada' | 'cerrada'; href: string }) {
  return (
    <p data-testid="widget-acceso-sin-ventana" role="status" style={{ margin: 0, fontSize: 12.5, color: t.ink, lineHeight: 1.5 }}>
      {motivo === 'bloqueada'
        ? 'Tu navegador no ha dejado abrir la ventana para entrar. '
        : 'La ventana para entrar se ha cerrado antes de terminar. '}
      Vuelve a intentarlo o{' '}
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--portal-brand)' }}>
        entra desde la página de reservas del estudio
      </a>.
    </p>
  );
}

/**
 * La cuenta es del equipo de un estudio (o de Tentare): por el widget de la web
 * de un estudio solo entran alumnas (decisión del fundador, 16-oct-2026). Reserva
 * desde la página entera, en tentare.app.
 */
function CuentaDeEquipo({ t, href }: { t: ModoTokens; href: string }) {
  return (
    <p data-testid="widget-acceso-cuenta-de-equipo" role="alert" style={{ margin: 0, fontSize: 12.5, color: t.ink, lineHeight: 1.5 }}>
      {MENSAJE_CUENTA_DE_EQUIPO}{' '}
      <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--portal-brand)' }}>
        Ir a la página de reservas del estudio
      </a>.
    </p>
  );
}

/** El segundo paso dentro del widget: el código de la app de autenticación. */
function CodigoAppWidget({ t, estilo, slug, baseUrl, onSalir }: {
  t: ModoTokens; estilo: React.CSSProperties; slug: string; baseUrl: string; onSalir: () => void;
}) {
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verificar() {
    if (codigo.length !== 6 || enviando) return;
    setEnviando(true); setError(null);
    const r = await verificarCodigoApp(supabasePortal.auth, codigo);
    setEnviando(false);
    // Con el código bueno, la sesión sube a `aal2` y `usar-sesion-widget.ts`
    // vuelve a leer la socia sola (evento MFA_CHALLENGE_VERIFIED).
    if (!r.ok) { setError(r.mensaje); setCodigo(''); }
  }

  return (
    <div style={estilo}>
      <p style={{ margin: 0, fontSize: 14, color: t.ink, fontWeight: 600 }}>Verificación en dos pasos</p>
      <p style={{ margin: 0, fontSize: 13, color: t.muted }}>
        Abre tu app de autenticación y escribe el código de 6 dígitos.
      </p>
      <input
        style={inputStyle(t)} value={codigo} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
        aria-label="Código de 6 dígitos" placeholder="123456"
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onKeyDown={(e) => { if (e.key === 'Enter') void verificar(); }}
      />
      {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: 'var(--destructive)' }}>{error}</p>}
      <button type="button" onClick={() => void verificar()} disabled={enviando || codigo.length !== 6} style={botonPrimario(t, enviando)}>
        {enviando ? 'Comprobando…' : 'Verificar'}
      </button>
      {/* Aquí solo vale la app: el código por correo y «recordar este dispositivo»
          viven en la app del estudio, que es otra sesión. Se le ofrece como salida. */}
      <p style={{ margin: 0, fontSize: 12, color: t.muted }}>
        ¿No tienes la app a mano?{' '}
        <a href={`${baseUrl}/portal/${encodeURIComponent(slug)}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--portal-brand)' }}>
          Reserva desde la app del estudio
        </a>, allí puedes recibir el código por correo.
      </p>
      <button type="button" onClick={onSalir} style={botonTexto()}>Usar otra cuenta</button>
    </div>
  );
}
