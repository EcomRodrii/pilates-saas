'use client';

// 01 — ACCESO. Implementación del diseño "Tentare App Cliente v2".
//
// Tres decisiones que se apartan del lienzo, y por qué:
//
// 1. El diseño ofrece «Continuar con Apple / Google / email». Aquí no hay OAuth
//    social —cero `signInWithOAuth` en el repo— y un botón que promete entrar
//    con Apple y no entra es una mentira en la pantalla de acceso. Se conserva
//    el RITMO del diseño (una pila de cápsulas de 66 px sobre la hoja de
//    cristal) con los métodos que sí existen: contraseña y enlace por correo.
// 2. El lienzo pinta `pointer-events: none` sobre la hoja y `role="button"` en
//    divs: eso es para poder arrastrar el marco dentro del editor, no una
//    decisión de diseño. Aquí van botones y enlaces de verdad.
// 3. El logo del estudio no sale en v2, pero sí salía en v1 (círculo de 56 px
//    sobre el nombre). Se conserva de v1 cuando el estudio tiene logo: es un
//    producto de marca blanca y quitarle su logo a quien paga por ponerlo no es
//    una decisión que tocara tomar aquí.

import { useState, useId, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { TurnstileWidget, turnstileConfigurado } from '@/components/auth/turnstile-widget';
import { BienvenidaPortal } from '@/components/portal/bienvenida-portal';
import { yaVioBienvenida, marcarBienvenidaVista } from '@/lib/portal-bienvenida';
import {
  EASE, dur, transicion, display, micro, texto, radio, altura, sombra, cristal, desenfoque,
} from '@/lib/portal-design';

export default function PortalLogin() {
  const uid = useId();
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { loginConPassword } = usePortalAuth();
  const { studio, dataLoaded, tabBarStyle } = useStudio();
  const { t, noche } = useModo();
  // Tema "Editorial": una pantalla de bienvenida a pantalla completa antes del
  // login, una sola vez por dispositivo. Empieza en `true` (se ve el login,
  // el comportamiento de siempre) a propósito: bloquear la pantalla ENTERA
  // hasta que se resuelva el tema/localStorage la dejaba a merced de la
  // latencia real de red (rompió e2e/ayuda-no-miente.spec.ts en CI, que
  // carga esta página sin mockear nada). Solo se pasa a `false` si de verdad
  // hace falta la bienvenida — el pequeño flash login→bienvenida para quien
  // vea este tema por primera vez es preferible a bloquear a todo el mundo.
  const [bienvenidaVista, setBienvenidaVista] = useState(true);
  useEffect(() => {
    if (!dataLoaded || tabBarStyle !== 'pestanaActiva') return;
    if (yaVioBienvenida(slug)) return;
    // localStorage no existe en el servidor: esto solo puede resolverse tras
    // montar, no hay forma de calcularlo durante el render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBienvenidaVista(false);
  }, [dataLoaded, tabBarStyle, slug]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Sin NEXT_PUBLIC_TURNSTILE_SITE_KEY configurada, el widget no se pinta y
  // esto nunca bloquea el envío — mismo comportamiento que /login.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // El fundido de bienvenida del diseño: la pantalla se lava en crema y aparece
  // «Bienvenida, {nombre}» mientras la sesión se propaga. No es adorno — cubre
  // justo el hueco entre que Supabase responde y PortalShell redirige, que
  // antes era un salto en seco.
  const [entrando, setEntrando] = useState(false);

  const bloqueado = loading || !email || !password || (turnstileConfigurado() && !captchaToken);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const r = await loginConPassword(email, password, captchaToken ?? undefined);
    if ('error' in r) {
      setLoading(false);
      setError(r.error || 'No se pudo iniciar sesión.');
      return;
    }
    setEntrando(true);
    // La sesión se propaga vía onAuthStateChange (usePortalAuth); PortalShell
    // redirige sola a /clases cuando resuelva. Empujamos por si tarda.
    router.replace(`/portal/${slug}/home`);
  }

  const nombreEstudio = studio?.nombre?.trim() || 'Tentare';

  if (!bienvenidaVista) {
    return (
      <BienvenidaPortal
        nombreEstudio={nombreEstudio}
        fotoUrl={studio?.fotoUrl ?? null}
        onSiguiente={() => { marcarBienvenidaVista(slug); setBienvenidaVista(true); }}
      />
    );
  }

  // El nombre va en una sola línea a 44 px. Uno largo («Estudio Alma de
  // Marbella») desbordaría el marco de 402, así que se encoge hasta 26 px en
  // vez de partirse: partir un display serif en dos líneas rompe el bloque.
  const tamNombre = nombreEstudio.length > 22 ? 26 : nombreEstudio.length > 15 ? 34 : 44;
  const brillo = noche ? 'rgba(18,20,14,.95)' : 'rgba(246,244,239,.95)';

  // Campo de texto con la forma de los botones: cápsula de 66 px. Es lo que
  // mantiene el ritmo vertical del diseño aunque el contenido sea un formulario
  // y no una lista de proveedores.
  const campo: React.CSSProperties = {
    width: '100%', height: altura.botonAcceso, borderRadius: radio.botonAlto,
    background: t.surface, border: `1px solid ${t.line}`, color: t.ink,
    padding: '0 26px', fontSize: 16, fontFamily: 'inherit', outline: 'none',
    transition: transicion(['border-color', 'box-shadow'], dur.color),
  };

  return (
    <div style={{ height: '100%', position: 'relative', overflow: 'hidden', background: t.bg, color: t.ink }}>

      {/* Portada del estudio. El diseño nunca enseña esta pantalla sin imagen,
          pero la mayoría de estudios entra sin haber subido ninguna: sin foto,
          el degradado de marca ocupa la pantalla ENTERA, no los 486 px de la
          foto. Cortarlo a 486 dejaba una costura horizontal a media pantalla —
          se ve, y se ve mal. */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: studio?.fotoUrl ? altura.fotoAcceso : '100%', background: studio?.fotoUrl ? t.surface2 : t.hero }}>
        {studio?.fotoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={studio.fotoUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        )}
      </div>
      <div
        aria-hidden
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: altura.fotoAcceso, pointerEvents: 'none',
          background: `linear-gradient(180deg, ${noche ? 'rgba(18,20,14,.46)' : 'rgba(246,244,239,.46)'} 0%, ${noche ? 'rgba(18,20,14,.06)' : 'rgba(246,244,239,.06)'} 32%, ${noche ? 'rgba(18,20,14,0)' : 'rgba(246,244,239,0)'} 66%)`,
        }}
      />

      {/* Identidad del estudio sobre la foto */}
      <div style={{ position: 'absolute', top: 104, left: 0, right: 0, zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none' }}>
        {studio?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={studio.logoUrl}
            alt=""
            style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', marginBottom: 22, border: `1px solid ${t.heroLine}`, background: t.surface }}
          />
        )}
        <h1 style={{ ...display(tamNombre), color: t.heroText, textAlign: 'center', padding: '0 24px', textShadow: `0 2px 30px ${brillo}` }}>
          {nombreEstudio}
        </h1>
        {studio?.ciudad && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
            <span style={{ width: 20, height: 1, background: noche ? 'rgba(243,241,233,.35)' : 'rgba(34,38,31,.35)' }} />
            <span style={{ ...micro(9.5, 0.34), color: t.heroSub, textShadow: `0 1px 22px ${brillo}` }}>{studio.ciudad}</span>
            <span style={{ width: 20, height: 1, background: noche ? 'rgba(243,241,233,.35)' : 'rgba(34,38,31,.35)' }} />
          </div>
        )}
      </div>

      {/* La hoja de cristal */}
      <div
        style={{
          position: 'absolute', left: 12, right: 12, bottom: 12, zIndex: 6,
          borderRadius: radio.hoja,
          background: noche ? 'rgba(28,31,23,.76)' : 'rgba(246,244,239,.76)',
          ...cristal(desenfoque.hoja),
          border: `1px solid ${noche ? 'rgba(243,241,233,.10)' : 'rgba(255,255,255,.85)'}`,
          boxShadow: sombra.hojaAcceso,
          padding: '34px 26px 24px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          maxHeight: 'calc(100% - 24px)', overflowY: 'auto',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...display(34, false, 1.06), color: t.ink }}>Bienvenida de nuevo</div>
          <div style={{ ...display(34, true, 1.06), color: t.ink }}>a tu calma.</div>
          <div style={{ ...texto.meta, color: t.muted, marginTop: 14 }}>El movimiento como un lujo silencioso.</div>
        </div>

        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginTop: 30 }}>
          <label htmlFor={`${uid}-email`} className="sr-only">Email</label>
          <input
            id={`${uid}-email`}
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(''); }}
            placeholder="Tu email"
            required
            autoComplete="email"
            style={campo}
          />

          <label htmlFor={`${uid}-clave`} className="sr-only">Contraseña</label>
          <input
            id={`${uid}-clave`}
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            placeholder="Tu contraseña"
            required
            autoComplete="current-password"
            style={campo}
          />

          {error && (
            <p role="alert" style={{ ...texto.pie, color: '#B0453A', textAlign: 'center', padding: '2px 4px', lineHeight: 1.45 }}>
              {error}
            </p>
          )}

          <TurnstileWidget onToken={setCaptchaToken} />

          <button
            type="submit"
            disabled={bloqueado}
            style={{
              height: altura.botonAcceso, borderRadius: radio.botonAlto,
              background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)',
              ...texto.boton, border: 'none', cursor: bloqueado ? 'default' : 'pointer',
              boxShadow: sombra.botonOscuro, opacity: bloqueado ? 0.55 : 1,
              transition: transicion(['transform', 'opacity']),
            }}
          >
            {loading ? 'Un momento…' : 'Entrar'}
          </button>

          <Link
            href={`/portal/${slug}/acceso`}
            style={{
              height: altura.botonAcceso, borderRadius: radio.botonAlto,
              border: `1px solid ${noche ? 'rgba(243,241,233,.16)' : 'rgba(34,38,31,.16)'}`,
              color: t.muted2, ...texto.boton, fontWeight: 400,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              textDecoration: 'none', transition: transicion(['background', 'border-color', 'transform']),
            }}
          >
            {/* Antes decía solo "Entrar con un enlace" — para quien acaba de
                recibir su cuenta de la propietaria y nunca ha puesto una
                contraseña, ese texto no dice CUÁNDO usarlo (parecía una
                alternativa cualquiera, no LA vía para su caso). Ahora nombra
                directamente el motivo. */}
            ¿Sin contraseña todavía? Entra con un enlace
          </Link>
        </form>

        <p style={{ ...texto.pie, color: t.micro, marginTop: 24, textAlign: 'center', lineHeight: 1.5 }}>
          ¿Primera vez en {nombreEstudio}?{' '}
          <Link
            href={`/reservar/${slug}`}
            style={{ color: t.muted2, borderBottom: `1px solid ${noche ? 'rgba(243,241,233,.3)' : 'rgba(34,38,31,.3)'}`, paddingBottom: 1, textDecoration: 'none' }}
          >
            Reserva tu primera clase
          </Link>
        </p>
      </div>

      {/* Fundido de bienvenida */}
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
