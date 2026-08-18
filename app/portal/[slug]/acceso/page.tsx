'use client';

// PASO 1 DE LA PUERTA — el email. Y el estado «te hemos escrito».
//
// Antes esta ruta y /login eran dos pantallas HERMANAS entre las que la socia
// tenía que elegir: «entrar con contraseña» o «pedir un enlace». Perderse ahí
// era el motivo del rediseño — la socia no sabe cuál es su caso, y el producto
// se lo estaba preguntando a ella.
//
// Ahora es un solo camino: se pide el email, y desde el paso 2 salen las dos
// continuaciones. Las rutas físicas se mantienen (esta y /login) para no tocar
// portal-shell.tsx ni los e2e; lo que cambia es que ya no se elige entre ellas.
//
// ⚠️ REGLA DE NEGOCIO QUE NO SE PUEDE ROMPER: entre el paso 1 y el paso 2 no
// hay NINGUNA consulta al servidor. Preguntar «¿esta socia tiene contraseña?»
// respondería también a quien no es socia, y eso es enumeración de cuentas:
// diría quién está dada de alta en el estudio. Por eso el paso 2 enseña
// siempre las dos salidas en vez de adivinar cuál toca.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { display, micro, texto } from '@/lib/portal-design';
import { BienvenidaPortal } from '@/components/portal/bienvenida-portal';
import { yaVioBienvenida, marcarBienvenidaVista } from '@/lib/portal-bienvenida';
import { usePortalAuth } from '@/lib/portal-auth';
import { altaConGoogle } from '@/lib/api-client';

/** El logotipo de Google, en línea: son sus colores oficiales y no hay que teñirlos. */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.7-.4-3.9H24v7.1h12.1c-.2 1.8-1.6 4.6-4.5 6.4l6.9 5.3c4.1-3.8 6.6-9.3 6.6-14.9z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.3c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.700000000000001l-7.1 5.5C7.9 40.8 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.5 27.9c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4l-7.1-5.5C2.9 16.5 2 20.1 2 23.5s.9 7 2.4 9.9z" />
      <path fill="#EA4335" d="M24 9.5c4.1 0 6.9 1.8 8.5 3.3l6.1-6C34.9 3.4 29.9 1 24 1 15.4 1 7.9 6.2 4.4 13.6l7.1 5.5C13.3 13.3 18.2 9.5 24 9.5z" />
    </svg>
  );
}
import {
  PortadaAcceso, CampoLinea, BotonCta, ErrorCampo, entrada, MARCA_FG,
} from '@/components/portal/acceso/piezas';

/** El email tiene una arroba. Nada más: validar de más rechaza direcciones reales. */
function pareceEmail(v: string) {
  return v.includes('@') && v.trim().length > 2;
}

export default function PortalAcceso() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { studio, dataLoaded, tabBarStyle, variantes } = useStudio();
  const { t } = useModo();
  // ⚠️ El estado «enviado» y el email llegan por la URL desde el paso 2, que
  // es donde vive el botón que pide el enlace. El primer intento fue
  // dispararlo AQUÍ al montar con un `?enviar=1`: además de leer `window`
  // durante el render, un remontaje habría pedido un segundo enlace — y pedir
  // dos seguidos invalida el primero, así que la socia abriría justo el que
  // ya no vale.
  //
  // `params` va ANTES que los estados que lo leen: declararlo debajo compila
  // igual y revienta en runtime por zona muerta temporal.
  const params = useSearchParams();
  const [email, setEmail] = useState(() => params.get('email') ?? '');
  const [error, setError] = useState('');
  const [enviado, setEnviado] = useState(params.get('enviado') === '1');
  const [googleTrabajando, setGoogleTrabajando] = useState(false);
  const { entrarConGoogle, session } = usePortalAuth();

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
    altaConGoogle(slug).then((r) => {
      if (!vivo) return;
      // El error se enseña; no se deja a la persona autenticada y en blanco.
      if (r.error) return setError(r.error);
      router.replace(`/portal/${slug}/home`);
    });
    return () => { vivo = false; };
  }, [vueltaDeGoogle, session, slug, router]);
  // ⚠️ Aquí NO hay captcha, y no es un olvido: el paso 1 no llama al
  // servidor. Es la misma regla que hace que esta pantalla no pregunte «¿esta
  // socia tiene contraseña?» — sin petición no hay nada que proteger, y el
  // widget solo estaba porque el diseño viejo necesitaba un token para
  // habilitar el botón. El captcha vive en el paso 2, que es quien envía.

  // ── La bienvenida, una vez por dispositivo ────────────────────────────────
  // Vivía en /login. Con la puerta nueva nadie aterriza allí —se llega siempre
  // desde aquí—, así que allí no se habría visto nunca. El handoff la sitúa
  // justo antes del paso 1, que es esta pantalla.
  //
  // ⚠️ El OR con `tabBarStyle` NO es redundante: los estudios que YA
  // instalaron Editorial tienen `tabBarStyle: 'pestanaActiva'` guardado y
  // ningún `variantes` (`defaults` no es retroactivo). Sin él perderían la
  // bienvenida en silencio.
  const quiereBienvenida = variantes.bienvenida !== 'ninguna' || tabBarStyle === 'pestanaActiva';
  // Empieza en `true` —se ve la puerta, el comportamiento de siempre— a
  // propósito: bloquear la pantalla entera hasta resolver tema y localStorage
  // la dejaba a merced de la latencia de red, y eso ya rompió CI una vez.
  const [bienvenidaVista, setBienvenidaVista] = useState(true);
  useEffect(() => {
    if (!dataLoaded || !quiereBienvenida) return;
    if (yaVioBienvenida(slug)) return;
    // localStorage no existe en el servidor: solo puede resolverse tras montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBienvenidaVista(false);
  }, [dataLoaded, quiereBienvenida, slug]);
  // Cuenta atrás para poder reenviar. Existe para que la espera tenga una
  // forma: sin ella, quien no ve llegar el correo pulsa «otro email» a los
  // diez segundos pensando que se ha roto algo.
  //
  // El 60 se fija en el estado INICIAL, no dentro del efecto: a este estado se
  // llega siempre por navegación desde el paso 2, así que el componente se
  // monta de nuevo cada vez. Ponerlo dentro del efecto era además un
  // `setState` en montaje que el lint rechaza con razón — un render de más
  // para un valor que ya se sabe.
  const [quedan, setQuedan] = useState(() => (params.get('enviado') === '1' ? 60 : 0));

  useEffect(() => {
    if (!enviado) return;
    const id = setInterval(() => setQuedan((q) => (q <= 1 ? 0 : q - 1)), 1000);
    return () => clearInterval(id);
  }, [enviado]);

  // El email escrito viaja al paso 2 por la URL, no por un store: al volver
  // atrás con el botón del navegador la dirección sigue ahí, que es lo que
  // pide el diseño («volver conserva lo escrito»), y sin montar estado global
  // para dos pantallas.
  function seguir() {
    if (!pareceEmail(email)) { setError('Escribe un email para seguir.'); return; }
    setError('');
    router.push(`/portal/${slug}/login?email=${encodeURIComponent(email.trim())}`);
  }

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
  const listo = pareceEmail(email);

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, display: 'flex', flexDirection: 'column' }}>
      <PortadaAcceso
        alto={enviado ? 212 : 300}
        fotoUrl={studio?.imagenBienvenidaUrl?.trim() ? studio.imagenBienvenidaUrl : null}
        nombre={nombre}
        ciudad={studio?.ciudad}
        progreso={enviado ? 82 : 34}
        tamNombre={enviado ? 26 : tamNombre}
      />

      <div
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          padding: '34px 30px calc(32px + env(safe-area-inset-bottom))',
        }}
      >
        {enviado ? <Enviado email={email} quedan={quedan} onOtro={() => { setEnviado(false); setError(''); }} />
          : (
            <>
              <div>
                <h1 style={{ ...display(36, false, 1.1), color: t.ink, ...entrada(0) }}>
                  ¿Cuál es tu <em style={{ fontStyle: 'italic' }}>email?</em>
                </h1>
                <p style={{ ...texto.meta, lineHeight: 1.75, color: t.muted, maxWidth: 272, marginTop: 12, ...entrada(1) }}>
                  El mismo que le diste a tu instructora. Con eso empezamos, tengas contraseña o no.
                </p>

                <div style={{ marginTop: 28, ...entrada(2) }}>
                  <CampoLinea
                    etiqueta="Email"
                    tipo="email"
                    valor={email}
                    onChange={setEmail}
                    marcador="tu@email.com"
                    autoComplete="email"
                    onEnter={seguir}
                  />
                  <ErrorCampo>{error}</ErrorCampo>
                </div>
              </div>

              <div style={{ ...entrada(3) }}>
                <div style={{ marginTop: 18 }}>
                  <BotonCta listo={listo} onClick={seguir}>Seguir</BotonCta>
                </div>

                {/* ⚠️ Este botón SOLO puede estar aquí porque el proveedor de
                    Google está activo de verdad en el proyecto. Uno que promete
                    Google y no entra es una mentira en la pantalla de acceso —
                    es literalmente lo que impedía el test que había, y por eso
                    ese test cambia en este mismo commit en vez de borrarse.

                    Sin captcha a propósito: en OAuth la prueba de que hay una
                    persona la hace Google en su pantalla. Turnstile se exige en
                    las vías de email, que son las que un robot puede repetir. */}
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
                  <GoogleLogo />
                  {googleTrabajando ? 'Abriendo Google…' : 'Continuar con Google'}
                </button>
                <p style={{ ...texto.pie, color: t.micro, textAlign: 'center', marginTop: 20 }}>
                  ¿Primera vez aquí?{' '}
                  <Link href={`/reservar/${slug}`} style={{ color: t.muted2, fontWeight: 500, textDecoration: 'underline' }}>
                    Reserva tu primera clase
                  </Link>
                </p>
              </div>
            </>
          )}
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
