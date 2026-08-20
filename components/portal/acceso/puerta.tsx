'use client';

// LA PUERTA DEL PORTAL. Una sola pantalla, y ya está.
//
// Durante un tiempo fueron dos pasos —primero el email, después la clave— y
// antes de eso dos pantallas hermanas entre las que elegir. El fundador entró
// en la app, vio dos pantallas seguidas pidiéndole entrar y dijo lo evidente:
// eso sigue pareciendo dos accesos. Así que se colapsa: email y contraseña
// juntos, Google al lado, y la salida por correo debajo.
//
// ⚠️ LA REGLA DE SEGURIDAD SIGUE INTACTA, y ahora sale gratis: esta pantalla
// NO le pregunta al servidor si tal email tiene contraseña. Esa respuesta la
// daría también para quien NO está dada de alta, y eso es enumeración de
// cuentas — diría quién es clienta de cada estudio. Antes había que pagar un
// paso 2 que enseñaba siempre las dos salidas para no filtrarlo; con una sola
// pantalla no hay ni siquiera un momento en el que preguntarlo. Todo está a la
// vista desde el principio y decide la socia.
//
// ⚠️ Y el rótulo del enlace por correo nombra LAS DOS cosas —«no tengo
// contraseña o la he olvidado»— por lo mismo: es la misma vía para quien nunca
// tuvo una y para quien no se acuerda, y separarlas obligaría a preguntar cuál
// es el caso.
//
// Las dos rutas (/acceso y /login) pintan esto mismo. No es duplicación: son
// direcciones que la gente ya tiene guardadas y que el estudio ha repartido.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { usePortalAuth } from '@/lib/portal-auth';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { EASE, dur, display, micro, texto } from '@/lib/portal-design';
import { BienvenidaPortal } from '@/components/portal/bienvenida-portal';
import { yaVioBienvenida, marcarBienvenidaVista } from '@/lib/portal-bienvenida';
import { esTemaPortal } from '@/themes/registro';
import { GoogleIcon } from '@/components/icons/brand-icons';
import { altaAlEntrar } from '@/lib/api-client';
import {
  PortadaAcceso, CampoLinea, BotonCta, ErrorCampo, entrada, MARCA_FG,
} from '@/components/portal/acceso/piezas';

/** El email tiene una arroba. Nada más: validar de más rechaza direcciones reales. */
function pareceEmail(v: string) {
  return v.includes('@') && v.trim().length > 2;
}

export function PuertaPortal() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const { studio, dataLoaded, tabBarStyle, variantes, portalReact, themeIdPublicado } = useStudio();
  const { t } = useModo();
  const { loginConPassword, enviarEnlace, entrarConGoogle, session } = usePortalAuth();

  // El email puede venir en la URL: de un enlace guardado, o de volver atrás.
  const [email, setEmail] = useState(() => params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [googleTrabajando, setGoogleTrabajando] = useState(false);
  const [enviado, setEnviado] = useState(params.get('enviado') === '1');
  const { widget: captcha, pedirToken } = useCaptcha();

  // ── La cuenta atrás del reenvío ──────────────────────────────────────────
  // Existe para que la espera tenga una forma: sin ella, quien no ve llegar el
  // correo pulsa «otro email» a los diez segundos pensando que se ha roto algo.
  const [quedan, setQuedan] = useState(() => (params.get('enviado') === '1' ? 60 : 0));
  useEffect(() => {
    if (!enviado) return;
    const id = setInterval(() => setQuedan((q) => (q <= 1 ? 0 : q - 1)), 1000);
    return () => clearInterval(id);
  }, [enviado]);


  // ── Entrar con contraseña ────────────────────────────────────────────────
  const listo = pareceEmail(email) && password.length > 0;

  async function entrar() {
    if (!listo || loading) return;
    setError('');
    setLoading(true);
    // El token se pide AL ENVIAR, no antes: el widget está invisible hasta que
    // hace falta, y tarda segundos. Por eso el estado de carga se enciende
    // antes de pedirlo.
    const token = await pedirToken();
    if (token === null) { setLoading(false); setError(ERROR_CAPTCHA); return; }
    const r = await loginConPassword(email.trim(), password, token || undefined);
    if ('error' in r) {
      setLoading(false);
      // ⚠️ El mismo mensaje para email desconocido y contraseña mala, a
      // propósito: distinguirlos diría quién está dada de alta.
      setError(r.error || 'Email o contraseña incorrectos.');
      return;
    }
    setEntrando(true);
    router.replace(`/portal/${slug}/home`);
  }

  // ── La salida por correo ─────────────────────────────────────────────────
  async function mandarEnlace() {
    if (loading) return;
    if (!pareceEmail(email)) { setError('Escribe tu email y te mandamos el enlace.'); return; }
    setError('');
    setLoading(true);
    const token = await pedirToken();
    if (token === null) { setLoading(false); setError(ERROR_CAPTCHA); return; }
    const r = await enviarEnlace(email.trim(), token || undefined);
    setLoading(false);
    if ('error' in r) { setError(r.error || 'No se pudo enviar el enlace.'); return; }
    setEnviado(true);
    setQuedan(60);
  }

  // ── Google ───────────────────────────────────────────────────────────────
  // Sin captcha a propósito: en OAuth la prueba de que hay una persona la hace
  // Google en su propia pantalla. Turnstile se exige en las vías de email, que
  // son las que un robot puede repetir.
  const conGoogle = async () => {
    setError('');
    setGoogleTrabajando(true);
    const r = await entrarConGoogle();
    // Si sale bien, el navegador ya se va a Google: no se apaga el estado.
    if ('error' in r) { setError(r.error); setGoogleTrabajando(false); }
  };

  // La vuelta de Google. `?oauth=1` es lo que distingue este caso de una visita
  // normal, y por eso el alta NO vive en `/api/public/session` —que se llama en
  // cada carga—: ahí, cualquiera con una sesión de Supabase de otro sitio
  // quedaría dada de alta con solo VISITAR el portal de un estudio.
  const vueltaDeGoogle = params.get('oauth') === '1';
  useEffect(() => {
    if (!vueltaDeGoogle || !session) return;
    let vivo = true;
    altaAlEntrar(slug, 'google').then((r) => {
      if (!vivo) return;
      if (r.error) return setError(r.error);
      router.replace(`/portal/${slug}/home`);
    });
    return () => { vivo = false; };
  }, [vueltaDeGoogle, session, slug, router]);

  // ── La bienvenida, una vez por dispositivo ───────────────────────────────
  // ⚠️ Con un tema del KIT no se pinta: la bienvenida de ese tema ya la enseña
  // la raíz del portal, y salían DOS seguidas.
  //
  // ⚠️ El OR con `tabBarStyle` NO es redundante: los estudios que YA instalaron
  // Editorial tienen `tabBarStyle: 'pestanaActiva'` guardado y ningún
  // `variantes` (`defaults` no es retroactivo). Sin él perderían la bienvenida
  // en silencio.
  const hayTemaDelKit = portalReact && esTemaPortal(themeIdPublicado);
  const quiereBienvenida = !hayTemaDelKit
    && (variantes.bienvenida !== 'ninguna' || tabBarStyle === 'pestanaActiva');
  // Empieza en `true` —se ve la puerta— a propósito: bloquear la pantalla
  // entera hasta resolver tema y localStorage la dejaba a merced de la latencia
  // de red, y eso ya rompió CI una vez.
  const [bienvenidaVista, setBienvenidaVista] = useState(true);
  useEffect(() => {
    if (!dataLoaded || !quiereBienvenida) return;
    if (yaVioBienvenida(slug)) return;
    // localStorage no existe en el servidor: solo puede resolverse tras montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBienvenidaVista(false);
  }, [dataLoaded, quiereBienvenida, slug]);

  const nombre = studio?.nombre?.trim() || 'Tentare';

  if (!bienvenidaVista) {
    return (
      <BienvenidaPortal
        nombreEstudio={nombre}
        fotoUrl={studio?.imagenBienvenidaUrl ?? null}
        variante={variantes.bienvenida === 'marca' ? 'marca' : 'foto'}
        onSiguiente={() => { marcarBienvenidaVista(slug); setBienvenidaVista(true); }}
      />
    );
  }

  // Un nombre largo no se parte en dos líneas: se encoge. Partir un display
  // serif rompe el bloque, y la portada tiene un alto fijo.
  const tamNombre = nombre.length > 22 ? 26 : nombre.length > 15 ? 30 : 36;

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <PortadaAcceso
        alto={enviado ? 212 : 260}
        fotoUrl={studio?.imagenBienvenidaUrl?.trim() ? studio.imagenBienvenidaUrl : null}
        nombre={nombre}
        ciudad={studio?.ciudad}
        progreso={enviado ? 82 : 40}
        tamNombre={enviado ? 26 : tamNombre}
      />

      <div
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          padding: '28px 30px calc(32px + env(safe-area-inset-bottom))',
        }}
      >
        {enviado ? (
          <Enviado email={email} quedan={quedan} onOtro={() => { setEnviado(false); setError(''); }} />
        ) : (
          <>
            <div>
              <h1 style={{ ...display(36, false, 1.1), color: t.ink, ...entrada(0) }}>
                ¿Entramos?
              </h1>
              <p style={{ ...texto.meta, lineHeight: 1.75, color: t.muted, maxWidth: 282, marginTop: 12, ...entrada(1) }}>
                Con el email que le diste a tu instructora. Si no tienes contraseña —o no te acuerdas— te mandamos un enlace.
              </p>

              <div style={{ marginTop: 24, ...entrada(2) }}>
                <CampoLinea
                  etiqueta="Email"
                  tipo="email"
                  valor={email}
                  onChange={setEmail}
                  marcador="tu@email.com"
                  autoComplete="email"
                />
                <div style={{ marginTop: 18 }}>
                  <CampoLinea
                    etiqueta="Contraseña"
                    tipo={ver ? 'text' : 'password'}
                    valor={password}
                    onChange={setPassword}
                    marcador="Tu contraseña"
                    autoComplete="current-password"
                    onEnter={entrar}
                    sufijo={
                      <button
                        type="button"
                        onClick={() => setVer((v) => !v)}
                        style={{ ...micro(9.5, 0.16), color: t.muted2, background: 'none', border: 'none', padding: 0 }}
                      >
                        {ver ? 'ocultar' : 'ver'}
                      </button>
                    }
                  />
                </div>
                <ErrorCampo>{error}</ErrorCampo>
              </div>
            </div>

            <div style={{ ...entrada(3) }}>
              {captcha}
              <div style={{ marginTop: 18 }}>
                <BotonCta listo={listo} cargando={loading} onClick={entrar}>Entrar</BotonCta>
              </div>

              {/* ⚠️ Este botón SOLO puede estar aquí porque el proveedor de
                  Google está activo de verdad en el proyecto. Uno que promete
                  Google y no entra es una mentira en la pantalla de acceso. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 14px' }}>
                <span style={{ flex: 1, height: 1, background: t.line }} />
                <span style={{ ...micro(10, 0.14, 500), color: t.micro }}>o</span>
                <span style={{ flex: 1, height: 1, background: t.line }} />
              </div>
              <button
                onClick={conGoogle}
                disabled={googleTrabajando}
                style={{
                  width: '100%', height: 52, borderRadius: 26,
                  border: `1px solid ${t.line}`, background: t.surface, color: t.ink,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  fontSize: 15, fontWeight: 500,
                  cursor: googleTrabajando ? 'default' : 'pointer',
                  opacity: googleTrabajando ? 0.6 : 1,
                }}
              >
                <GoogleIcon size={18} />
                {googleTrabajando ? 'Abriendo Google…' : 'Continuar con Google'}
              </button>

              <div style={{ textAlign: 'center', marginTop: 20 }}>
                <button
                  type="button"
                  onClick={mandarEnlace}
                  disabled={loading}
                  style={{
                    ...texto.meta, color: t.muted2, background: 'none', border: 'none', padding: 0,
                    // ⚠️ Subrayado de texto y NO `border-bottom`: el rótulo
                    // envuelve a dos líneas en pantallas estrechas, y un borde
                    // se dibuja bajo la CAJA entera —una raya de lado a lado
                    // que se lee como separador, no como enlace—. Medido en el
                    // móvil: 315 px de ancho y 2 líneas.
                    textDecoration: 'underline',
                    textUnderlineOffset: 3,
                    textDecorationColor: t.line,
                  }}
                >
                  No tengo contraseña o la he olvidado — mándame un enlace
                </button>
              </div>

              <p style={{ ...texto.pie, color: t.micro, textAlign: 'center', marginTop: 18 }}>
                ¿Primera vez en {nombre}?{' '}
                <Link href={`/reservar/${slug}`} style={{ color: t.muted2, fontWeight: 500, textDecoration: 'underline' }}>
                  Reserva tu primera clase
                </Link>
              </p>
            </div>
          </>
        )}
      </div>

      {/* Fundido de bienvenida: cubre el hueco entre que Supabase responde y
          PortalShell redirige, que si no es un salto en seco. */}
      <div
        aria-hidden={!entrando}
        style={{
          position: 'absolute', inset: 0, zIndex: 9, background: t.bg,
          opacity: entrando ? 1 : 0, pointerEvents: entrando ? 'auto' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: `opacity ${dur.wash}ms ${EASE}`,
        }}
      >
        <div
          style={{
            ...display(34, true), color: t.ink, textAlign: 'center', padding: '0 32px',
            transform: entrando ? 'none' : 'scale(1.06)',
            transition: `transform ${dur.washInner}ms ${EASE}`,
          }}
        >
          Bienvenida.
        </div>
      </div>
    </div>
  );
}

/** «Te hemos escrito»: qué ha pasado, dónde mirar y cuánto dura. */
function Enviado({ email, quedan, onOtro }: { email: string; quedan: number; onOtro: () => void }) {
  const { t } = useModo();
  const reloj = `${Math.floor(quedan / 60)}:${String(quedan % 60).padStart(2, '0')}`;
  return (
    <>
      <div>
        <div
          aria-hidden
          style={{
            width: 44, height: 44, borderRadius: 22, background: 'rgba(62,155,108,.14)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#3E9B6C', fontSize: 20, ...entrada(0),
          }}
        >
          ✓
        </div>
        <h1 style={{ ...display(36, false, 1.1), color: t.ink, marginTop: 18, ...entrada(1) }}>
          Te hemos <em style={{ fontStyle: 'italic' }}>escrito.</em>
        </h1>
        <p style={{ ...texto.meta, lineHeight: 1.75, color: t.muted, maxWidth: 290, marginTop: 12, ...entrada(2) }}>
          El enlace va a <strong style={{ color: t.ink, fontWeight: 600 }}>{email}</strong>. Ábrelo en este
          mismo móvil y eliges tu contraseña. No hay prisa: dura una hora.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, ...entrada(3) }}>
        <span
          aria-hidden
          style={{
            width: 6, height: 6, borderRadius: 3, background: MARCA_FG,
            animation: 'portal-breathe 3200ms ease-in-out infinite',
          }}
        />
        {/* La cuenta atrás no bloquea nada: es información. Quien de verdad se
            equivocó de dirección puede cambiarla ya, sin esperar. */}
        <span style={{ ...micro(10.5, 0.12, 400), color: t.micro, textTransform: 'none' }}>
          {quedan > 0 ? `reenviar en ${reloj}` : 'ya puedes reenviar'}
        </span>
        <span aria-hidden style={{ width: 1, height: 12, background: t.line }} />
        <button
          type="button"
          onClick={onOtro}
          style={{ ...texto.pie, color: t.muted2, background: 'none', border: 'none', textDecoration: 'underline', padding: 0 }}
        >
          Otro email
        </button>
      </div>
    </>
  );
}
