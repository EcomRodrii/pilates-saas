'use client';

// LA PUERTA DEL PORTAL — reconstruida (2026-08-30) para la "Tentare Studio
// App": antes una sola pantalla de LOGIN con el alta delegada a
// `/reservar/{slug}`, ahora tres pasos en el mismo componente, en el orden
// que verifica el diseño real:
//
//   intro  → "Muévete. Lo demás, ya está." (Empezar / Ya tengo cuenta)
//   crear  → "Crea tu cuenta" (Google, o nombre+email por enlace mágico)
//   login  → "¿Entramos?" (email+contraseña — lo que YA existía, sin tocar)
//
// ⚠️ El mecanismo de alta NO cambia, solo la portada. `crear` no crea nada al
// pulsar "Continuar": manda el MISMO enlace mágico de siempre
// (`enviarEnlace`/`altaAlEntrar('enlace')`, endurecido contra el
// account-takeover ya arreglado una vez en este flujo) y aterriza en
// `/clave-nueva`, igual que la recuperación de contraseña. Un botón nuevo que
// creara sesión antes de verificar el email sería una TERCERA vía de alta sin
// las mismas protecciones — analizado con `tentare-arquitecto` antes de
// escribir esto.
//
// ⚠️ Sin botón de Apple, aunque el diseño lo pida: no hay proveedor Apple
// configurado en este proyecto de Supabase Auth, y este mismo archivo ya
// tenía la regla escrita para Google — "un botón que promete y no entra es
// una mentira en la pantalla de acceso". Se añade el día que exista de
// verdad, no antes. Mismo criterio para el permiso de ubicación del diseño:
// sin ningún "clases cerca de ti" real en el portal de la clienta hoy
// (existe en Network, para buscar estudios, no aquí), pedirlo aquí sería el
// mismo patrón que ya documenta este repo como decoración (captcha/honeypot
// sin caller). El permiso de notificaciones SÍ tiene consumidor real
// (`PushPrompt`, ya en `portal-shell.tsx`) — se sigue pintando ahí, tras
// entrar, en vez de duplicarlo aquí como un modal nuevo.
//
// ⚠️ LA REGLA DE SEGURIDAD DEL LOGIN SIGUE INTACTA: el paso `login` no le
// pregunta al servidor si tal email tiene contraseña (enumeración de
// cuentas). El rótulo del enlace por correo sigue nombrando las dos cosas —
// «no tengo contraseña o la he olvidado»— por el mismo motivo de siempre.
//
// Las dos rutas (/acceso y /login) siguen pintando este componente, pero ya
// NO son idénticas: /login entra directa al paso `login` (un enlace
// guardado/repartido debe seguir siendo un atajo a "entrar", no un rodeo por
// la portada de marketing); /acceso empieza en `intro`.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCore } from '@/lib/core-context';
import { useModo } from '@/lib/portal-modo';
import { usePortalAuth } from '@/lib/portal-auth';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { EASE, dur, display, micro, texto, altura, radio, sombra, transicion } from '@/lib/portal-design';
import { BienvenidaPortal } from '@/components/portal/bienvenida-portal';
import { yaVioBienvenida, marcarBienvenidaVista } from '@/lib/portal-bienvenida';
import { GoogleIcon } from '@/components/icons/brand-icons';
import { altaAlEntrar } from '@/lib/api-client';
import {
  PortadaAcceso, CampoLinea, BotonCta, ErrorCampo, entrada, MARCA, MARCA_FG,
} from '@/components/portal/acceso/piezas';

/** El botón de Google, idéntico en `crear` y en `login` — no se duplica. */
function BotonGoogle({ onClick, trabajando }: { onClick: () => void; trabajando: boolean }) {
  const { t } = useModo();
  return (
    <button
      onClick={onClick}
      disabled={trabajando}
      style={{
        width: '100%', height: 52, borderRadius: 26,
        border: `1px solid ${t.line}`, background: t.surface, color: t.ink,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        fontSize: 15, fontWeight: 500,
        cursor: trabajando ? 'default' : 'pointer',
        opacity: trabajando ? 0.6 : 1,
      }}
    >
      <GoogleIcon size={18} />
      {trabajando ? 'Abriendo Google…' : 'Continuar con Google'}
    </button>
  );
}

/**
 * El CTA claro de la portada `intro`: cápsula lisa, sin el círculo-flecha de
 * `BotonCta` — el diseño la pide como un pill de texto centrado, en tinta
 * clara sobre el panel oscuro. `BotonCta` no cambia: la usan `crear`/`login`
 * tal cual, sobre fondo claro, y es la misma pieza en todo el resto del
 * portal.
 */
function BotonClaro({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', height: altura.botonCta, borderRadius: radio.botonCta,
        background: MARCA_FG, color: MARCA, border: 'none',
        ...texto.botonCta,
        boxShadow: sombra.cta, cursor: 'pointer',
        transition: transicion(['opacity'], dur.foco),
      }}
    >
      {children}
    </button>
  );
}

/** El email tiene una arroba. Nada más: validar de más rechaza direcciones reales. */
function pareceEmail(v: string) {
  return v.includes('@') && v.trim().length > 2;
}

export function PuertaPortal() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Auditoría integral 2026-08-21 (rendimiento, P0-2): useCore(), no useStudio() — solo campos de tema/nav ya publicados.
  const { studio, dataLoaded, tabBarStyle, variantes } = useCore();
  const { t } = useModo();
  const { loginConPassword, enviarEnlace, entrarConGoogle, session } = usePortalAuth();

  // /login es un atajo guardado/repartido: entra directa al formulario de
  // siempre, sin pasar por la portada de marketing. /acceso (y cualquier otra
  // vía de llegada) empieza en `intro`. `useState(() => ...)` para no
  // recalcularlo en cada render — el paso cambia solo por clic, nunca por
  // navegación de cliente entre estas dos rutas (son componentes distintos).
  const [paso, setPaso] = useState<'intro' | 'crear' | 'login'>(() => (pathname?.endsWith('/login') ? 'login' : 'intro'));

  // El email puede venir en la URL: de un enlace guardado, o de volver atrás.
  const [email, setEmail] = useState(() => params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [nombreCuenta, setNombreCuenta] = useState('');
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
  // ── Crear cuenta (nombre + email → enlace mágico) ───────────────────────
  const listoCrear = pareceEmail(email) && nombreCuenta.trim().length > 0;

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
    // `nombreCuenta` solo lleva algo cuando se llega desde "Crea tu cuenta"
    // (paso `crear`) — en `login` ("no tengo contraseña...") se queda vacío y
    // enviarEnlace lo ignora.
    const r = await enviarEnlace(email.trim(), token || undefined, nombreCuenta);
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
  // ⚠️ El OR con `tabBarStyle` NO es redundante: los estudios que YA instalaron
  // Editorial tienen `tabBarStyle: 'pestanaActiva'` guardado y ningún
  // `variantes` (`defaults` no es retroactivo). Sin él perderían la bienvenida
  // en silencio.
  const quiereBienvenida = variantes.bienvenida !== 'ninguna' || tabBarStyle === 'pestanaActiva';
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

  const fundidoBienvenida = (
    // Fundido de bienvenida: cubre el hueco entre que Supabase responde y
    // PortalShell redirige, que si no es un salto en seco.
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
  );

  // ── Paso 1: la portada de marketing ──────────────────────────────────────
  // Foto+caption reutilizan PortadaAcceso tal cual (misma pieza que `crear`/
  // `login`, solo más alta) — el panel de abajo usa el MISMO color de marca
  // que el degradado de la foto, para que se lea como una sola superficie
  // oscura continua, igual que el diseño verificado en vivo.
  if (paso === 'intro') {
    return (
      <div style={{ minHeight: '100dvh', background: MARCA, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <PortadaAcceso
          alto={360}
          fotoUrl={studio?.imagenBienvenidaUrl?.trim() ? studio.imagenBienvenidaUrl : null}
          nombre={nombre}
          ciudad={studio?.ciudad}
          progreso={25}
          tamNombre={tamNombre}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '28px 30px calc(32px + env(safe-area-inset-bottom))' }}>
          <div>
            <h1 style={{ ...display(34, false, 1.08), color: MARCA_FG, ...entrada(0) }}>
              Muévete. Lo demás, ya está.
            </h1>
            <p style={{ ...texto.meta, lineHeight: 1.75, color: 'rgba(246,244,239,.66)', maxWidth: 280, marginTop: 12, ...entrada(1) }}>
              Reserva, bono y acceso a tu estudio en una sola app.
            </p>
          </div>
          <div style={{ ...entrada(2) }}>
            <BotonClaro onClick={() => setPaso('crear')}>Empezar</BotonClaro>
            <div style={{ textAlign: 'center', marginTop: 18 }}>
              <button
                type="button"
                onClick={() => setPaso('login')}
                style={{
                  ...texto.meta, color: 'rgba(246,244,239,.66)', background: 'none', border: 'none', padding: 0,
                  textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: 'rgba(246,244,239,.3)',
                }}
              >
                Ya tengo cuenta
              </button>
            </div>
          </div>
        </div>
        {fundidoBienvenida}
      </div>
    );
  }

  // ── Pasos 2 y 3: crear cuenta / entrar ───────────────────────────────────
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
        ) : paso === 'crear' ? (
          <>
            <div>
              <h1 style={{ ...display(34, false, 1.1), color: t.ink, ...entrada(0) }}>
                Crea tu cuenta
              </h1>
              <p style={{ ...texto.meta, lineHeight: 1.75, color: t.muted, maxWidth: 282, marginTop: 12, ...entrada(1) }}>
                Treinta segundos y estás dentro.
              </p>

              <div style={{ marginTop: 24, ...entrada(2) }}>
                <BotonGoogle onClick={conGoogle} trabajando={googleTrabajando} />

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
                  <span style={{ flex: 1, height: 1, background: t.line }} />
                  <span style={{ ...micro(10, 0.14, 500), color: t.micro }}>o con tu email</span>
                  <span style={{ flex: 1, height: 1, background: t.line }} />
                </div>

                <CampoLinea
                  etiqueta="Tu nombre"
                  valor={nombreCuenta}
                  onChange={setNombreCuenta}
                  marcador="Tu nombre"
                  autoComplete="name"
                />
                <div style={{ marginTop: 18 }}>
                  <CampoLinea
                    etiqueta="Email"
                    tipo="email"
                    valor={email}
                    onChange={setEmail}
                    marcador="tu@email.com"
                    autoComplete="email"
                    onEnter={mandarEnlace}
                  />
                </div>
                <ErrorCampo>{error}</ErrorCampo>
              </div>
            </div>

            <div style={{ ...entrada(3) }}>
              {captcha}
              <div style={{ marginTop: 18 }}>
                <BotonCta listo={listoCrear} cargando={loading} onClick={mandarEnlace}>Continuar</BotonCta>
              </div>
              <div style={{ textAlign: 'center', marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() => { setPaso('login'); setError(''); }}
                  style={{ ...texto.pie, color: t.micro, background: 'none', border: 'none', padding: 0 }}
                >
                  ¿Ya tienes cuenta?{' '}
                  <span style={{ color: t.muted2, fontWeight: 500, textDecoration: 'underline' }}>Entra</span>
                </button>
              </div>
            </div>
          </>
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
              <BotonGoogle onClick={conGoogle} trabajando={googleTrabajando} />

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
                <button
                  type="button"
                  onClick={() => { setPaso('crear'); setError(''); }}
                  style={{ color: t.muted2, fontWeight: 500, textDecoration: 'underline', background: 'none', border: 'none', padding: 0, font: 'inherit' }}
                >
                  Crea tu cuenta
                </button>
                {' '}o{' '}
                <Link href={`/reservar/${slug}`} style={{ color: t.muted2, fontWeight: 500, textDecoration: 'underline' }}>
                  reserva tu primera clase
                </Link>
              </p>
            </div>
          </>
        )}
      </div>

      {fundidoBienvenida}
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
