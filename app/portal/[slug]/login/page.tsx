'use client';

// PASO 2 DE LA PUERTA — la contraseña.
//
// Se llega SIEMPRE desde el paso 1 (/acceso), con el email en la URL. Ya no es
// una pantalla hermana entre las que elegir: es la continuación.
//
// ⚠️ LAS DOS SALIDAS SE ENSEÑAN SIEMPRE, y esto no es una decisión de diseño
// sino de seguridad. La pantalla NO pregunta al servidor si esta socia tiene
// contraseña: esa respuesta también la daría para quien no está dada de alta,
// y sería enumeración de cuentas — diría quién es clienta del estudio. Así que
// aquí conviven el campo de contraseña y «nunca he creado una, mándame un
// enlace», y decide la socia. El precio es una línea más en la pantalla; lo
// que se compra es no filtrar la lista de socias de cada estudio.
//
// El fundido «Bienvenida.» se conserva tal cual estaba: cubre el hueco entre
// que Supabase responde y PortalShell redirige, que si no es un salto en seco.
//
// ⚠️ La pantalla de BIENVENIDA (la de una vez por dispositivo) ya NO se decide
// aquí: se mudó al paso 1. Con la puerta nueva nadie aterriza en /login —se
// llega siempre desde /acceso—, así que dejarla aquí la habría dejado sin
// mostrarse nunca. Lo cazaron los e2e del tema Editorial, que usan esta
// pantalla como marcador.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { TurnstileWidget, turnstileConfigurado } from '@/components/auth/turnstile-widget';
import { EASE, dur, display, micro, texto } from '@/lib/portal-design';
import {
  PortadaAcceso, CampoLinea, BotonCta, ErrorCampo, entrada,
} from '@/components/portal/acceso/piezas';

export default function PortalLogin() {
  const { slug } = useParams<{ slug: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { loginConPassword, enviarEnlace } = usePortalAuth();
  const { studio } = useStudio();
  const { t } = useModo();

  const email = params.get('email') ?? '';
  const [password, setPassword] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  // Sin email en la URL no hay paso 2 que valga: se vuelve al paso 1. Pasa si
  // alguien guarda /login en favoritos, que era la forma NORMAL de entrar
  // antes de este rediseño — así que no es un caso raro, es todo el mundo que
  // ya tenía el enlace guardado.
  useEffect(() => {
    if (!email) router.replace(`/portal/${slug}/acceso`);
  }, [email, router, slug]);

  const listo = password.length > 0 && (!turnstileConfigurado() || !!captchaToken);

  async function entrar() {
    if (!listo || loading) return;
    setError('');
    setLoading(true);
    const r = await loginConPassword(email, password, captchaToken ?? undefined);
    if ('error' in r) {
      setLoading(false);
      setError(r.error || 'Email o contraseña incorrectos.');
      return;
    }
    setEntrando(true);
    // La sesión se propaga vía onAuthStateChange (usePortalAuth); PortalShell
    // redirige sola cuando resuelva. Empujamos por si tarda.
    router.replace(`/portal/${slug}/home`);
  }

  // La salida secundaria. El envío ocurre AQUÍ, donde está el botón, y el
  // resultado se enseña en el paso 1 — que es la pantalla que cuenta el estado
  // «te hemos escrito». Antes intenté dispararlo al montar aquella con un
  // parámetro en la URL: un remontaje habría pedido un segundo enlace, y el
  // segundo invalida el primero.
  async function mandarEnlace() {
    setError('');
    setLoading(true);
    const r = await enviarEnlace(email, captchaToken ?? undefined);
    setLoading(false);
    if ('error' in r) { setError(r.error || 'No se pudo enviar el enlace.'); return; }
    router.push(`/portal/${slug}/acceso?enviado=1&email=${encodeURIComponent(email)}`);
  }

  const nombre = studio?.nombre?.trim() || 'Tentare';

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* La portada RETIRADA (212, no 300) y el nombre a 26: es lo que cuenta
          que se ha avanzado un paso, sin escribir «paso 2 de 2». */}
      <PortadaAcceso
        alto={212}
        fotoUrl={studio?.imagenBienvenidaUrl?.trim() ? studio.imagenBienvenidaUrl : null}
        nombre={nombre}
        ciudad={studio?.ciudad}
        progreso={68}
        tamNombre={26}
      />

      <div
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          padding: '26px 30px calc(32px + env(safe-area-inset-bottom))',
        }}
      >
        <div>
          <button
            type="button"
            onClick={() => router.push(`/portal/${slug}/acceso?email=${encodeURIComponent(email)}`)}
            aria-label="Volver al paso anterior"
            style={{
              width: 40, height: 40, borderRadius: 20, border: `1px solid ${t.line}`,
              background: 'transparent', color: t.ink, fontSize: 15,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...entrada(0),
            }}
          >
            ←
          </button>

          <h1 style={{ ...display(36, false, 1.1), color: t.ink, marginTop: 20, ...entrada(1) }}>
            Y ahora, <em style={{ fontStyle: 'italic' }}>la clave.</em>
          </h1>
          <p style={{ ...texto.meta, color: t.muted, marginTop: 8, ...entrada(2) }}>{email}</p>

          <div style={{ marginTop: 24, ...entrada(3) }}>
            <CampoLinea
              etiqueta="Contraseña"
              tipo={ver ? 'text' : 'password'}
              valor={password}
              onChange={setPassword}
              marcador="Tu contraseña"
              autoComplete="current-password"
              autoFocus
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
            <ErrorCampo>{error}</ErrorCampo>
          </div>
        </div>

        <div style={{ ...entrada(3) }}>
          <TurnstileWidget onToken={setCaptchaToken} />
          <div style={{ marginTop: 18 }}>
            <BotonCta listo={listo} cargando={loading} onClick={entrar}>Entrar</BotonCta>
          </div>

          {/* La otra salida. Nunca oculta, nunca condicionada: ver arriba. */}
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <button
              type="button"
              onClick={mandarEnlace}
              disabled={loading}
              style={{
                ...texto.meta, color: t.muted2, background: 'none', border: 'none',
                borderBottom: `1px solid ${t.line}`, paddingBottom: 2,
              }}
            >
              Nunca he creado una — mándame un enlace
            </button>
          </div>

          <p style={{ ...texto.pie, color: t.micro, textAlign: 'center', marginTop: 18 }}>
            ¿Primera vez en {nombre}?{' '}
            <Link href={`/reservar/${slug}`} style={{ color: t.muted2, fontWeight: 500, textDecoration: 'underline' }}>
              Reserva tu primera clase
            </Link>
          </p>
        </div>
      </div>

      {/* Fundido de bienvenida — sin cambios respecto a antes. */}
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
