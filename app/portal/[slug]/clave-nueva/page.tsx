'use client';

// FINAL DE LA PUERTA — la socia llega aquí desde el enlace del correo.
//
// Cuatro estados en una sola pantalla: comprobando el enlace, enlace que ya no
// vale, elegir contraseña, y guardada. Son cuatro momentos del mismo trámite,
// no cuatro pantallas: comparten portada, hilo y forma.
//
// El enlace mágico lleva SIEMPRE aquí y nunca directo a /home, y sirve por
// igual para el alta y para recuperar — cambia el copy, no el mecanismo.
//
// La sesión ya está resuelta cuando se llega: si `session` existe, Supabase
// confirmó el email Y el servidor confirmó que pertenece a una socia de este
// estudio (`resolverSociaAutenticada`). Solo entonces se deja fijar clave.
//
// ⚠️ Y si NO era socia, aquí es donde se da de alta — no antes. `resolver` deja
// la sesión en `null` cuando el email autenticado no pertenece a ninguna socia
// del estudio, así que sin este paso quien creaba cuenta por correo aterrizaba
// en «ese enlace ya no vale»: un callejón, y encima mintiendo, porque el enlace
// había funcionado perfectamente.
//
// El alta va AQUÍ y no dentro de `resolver` a propósito: en `resolver` se
// dispararía en cualquier navegación —una socia de otro estudio abriendo este
// portal quedaría dada de alta sin haber hecho nada—, y lo que se aprobó es dar
// de alta a quien ENTRA. Este aterrizaje y la vuelta de Google son las dos
// puertas de entrada, y son los dos únicos sitios donde se llama.

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { altaAlEntrar } from '@/lib/api-client';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { useStudio } from '@/lib/studio-context';
import { dur, display, micro, texto } from '@/lib/portal-design';
import {
  PortadaAcceso, CampoLinea, BotonCta, ErrorCampo, entrada, MARCA,
} from '@/components/portal/acceso/piezas';

/**
 * Los neutros de esta pantalla, del kit (`--ap-*`) y no de `useModo()`.
 * Mismos nombres que los del tema a propósito, igual que en
 * `components/portal/acceso/puerta.tsx`: el diff es el cambio de ORIGEN del
 * color, no una reescritura de cada `style`.
 */
const T = {
  bg: 'var(--ap-fondo, #FAF9F5)',
  surface: 'var(--ap-card, #FFFFFF)',
  ink: 'var(--ap-tinta, #1A1A1A)',
  muted: 'var(--ap-sec, #5A5A52)',
  muted2: 'var(--ap-verde, #3E6B4A)',
  micro: 'var(--ap-ter, #98A093)',
  line: 'var(--ap-borde, #E5E3DA)',
} as const;

const MIN_LEN = 8;

export default function PortalClaveNueva() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  // Viene de la URL de vuelta del enlace mágico (ver enviarEnlace en
  // portal-auth.tsx) — solo lo puso ahí el paso "Crea tu cuenta" del
  // onboarding nuevo. Quien recupera contraseña por esta misma vía no manda
  // nombre, y altaAlEntrar lo trata como ausente (usa el de antes de la
  // arroba del email).
  const nombreOnboarding = useSearchParams().get('nombre');
  const { session, isLoading, establecerPassword, revalidarSesion } = usePortalAuth();
  // Una sola vez por carga: si el alta no la deja entrar, reintentarla en bucle
  // no la va a dejar entrar tampoco. Es estado y no un `ref` porque el render
  // depende de ello — un `ref` no repinta y la pantalla se quedaría colgada en
  // «comprobando».
  const [alta, setAlta] = useState<'sin-mirar' | 'en-curso' | 'resuelta'>('sin-mirar');
  const { studio } = useStudio();
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [guardada, setGuardada] = useState(false);

  async function guardar() {
    setError('');
    if (password.length < MIN_LEN) { setError(`Mínimo ${MIN_LEN} caracteres.`); return; }
    if (password !== confirmar) { setError('Las dos no coinciden.'); return; }
    setLoading(true);
    const r = await establecerPassword(password);
    setLoading(false);
    if ('error' in r) { setError(r.error || 'No se pudo guardar la contraseña.'); return; }
    setGuardada(true);
    setTimeout(() => router.replace(`/portal/${slug}/home`), dur.washInner);
  }

  // Autenticada de verdad pero sin ficha de socia: es un alta, no un enlace
  // caducado. Se le crea la ficha y se vuelve a preguntar.
  useEffect(() => {
    if (isLoading || session || alta !== 'sin-mirar') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Marca que el trámite con el servidor ha empezado, y es justo lo que impide que se repita. Misma sincronización con un sistema externo que `resolver` en `portal-auth`.
    setAlta('en-curso');
    (async () => {
      // Distinguir las dos razones de no haber sesión: un enlace REALMENTE
      // caducado no deja token ninguno, y ahí no hay a quién dar de alta.
      const { data: { session: sb } } = await supabasePortal.auth.getSession();
      if (sb?.access_token) {
        await altaAlEntrar(slug, 'enlace', nombreOnboarding ?? undefined);
        await revalidarSesion();
      }
      setAlta('resuelta');
    })();
  }, [isLoading, session, alta, slug, revalidarSesion, nombreOnboarding]);

  const nombre = studio?.nombre?.trim() || 'Tentare';
  // Solo se declara caducado cuando ya se ha intentado el alta y sigue sin
  // haber socia — si no, se acusaría al enlace de algo que no ha hecho.
  const caducado = !isLoading && !session && alta === 'resuelta';

  return (
    <div style={{ minHeight: '100dvh', background: T.bg, display: 'flex', flexDirection: 'column' }}>
      <PortadaAcceso
        alto={212}
        fotoUrl={studio?.imagenBienvenidaUrl?.trim() ? studio.imagenBienvenidaUrl : null}
        nombre={nombre}
        ciudad={studio?.ciudad}
        // 88 y no 100: la socia todavía tiene que elegir la clave. El hilo
        // llega al final cuando el trámite acaba, no cuando queda poco.
        progreso={guardada ? 100 : 88}
      />

      <div
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          padding: '30px 30px calc(32px + env(safe-area-inset-bottom))',
        }}
      >
        {isLoading ? <Comprobando />
          : caducado ? <Caducado onPedir={() => router.push(`/portal/${slug}/acceso`)} />
            : guardada ? <Guardada />
              : (
                <>
                  <div>
                    <p style={{ ...micro(9.5, 0.28), color: T.micro, ...entrada(0) }}>Email verificado</p>
                    <h1 style={{ ...display(36, false, 1.1), color: T.ink, marginTop: 10, ...entrada(1) }}>
                      Elige tu <em style={{ fontStyle: 'italic' }}>contraseña.</em>
                    </h1>
                    <p style={{ ...texto.meta, lineHeight: 1.75, color: T.muted, marginTop: 10, ...entrada(2) }}>
                      Hola {session?.nombre}. A partir de ahora entras con ella.
                    </p>

                    <div style={{ marginTop: 22, ...entrada(3) }}>
                      <CampoLinea
                        etiqueta="Nueva contraseña"
                        tipo="password"
                        valor={password}
                        onChange={(v) => { setPassword(v); setError(''); }}
                        marcador="Nueva contraseña"
                        autoComplete="new-password"
                        autoFocus
                        alto={54}
                        tamano={18}
                      />
                      <div style={{ marginTop: 6 }}>
                        <CampoLinea
                          etiqueta="Repite la contraseña"
                          tipo="password"
                          valor={confirmar}
                          onChange={(v) => { setConfirmar(v); setError(''); }}
                          marcador="Repítela"
                          autoComplete="new-password"
                          onEnter={guardar}
                          alto={54}
                          tamano={18}
                        />
                      </div>
                      <ErrorCampo>{error}</ErrorCampo>
                    </div>
                  </div>

                  <div style={{ ...entrada(3) }}>
                    <p style={{ ...texto.nota, color: T.micro, textAlign: 'center', marginBottom: 12 }}>
                      Mínimo {MIN_LEN} caracteres.
                    </p>
                    <BotonCta
                      listo={password.length > 0 && confirmar.length > 0}
                      cargando={loading}
                      onClick={guardar}
                    >
                      Guardar y entrar
                    </BotonCta>
                  </div>
                </>
              )}
      </div>
    </div>
  );
}

function Comprobando() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16 }}>
      <Spinner />
      <p style={{ ...texto.meta, color: T.muted }}>Comprobando tu enlace…</p>
    </div>
  );
}

/**
 * El enlace ya no vale.
 *
 * ⚠️ El texto NO distingue entre «ha caducado», «ya se usó» y «tu email no es
 * de ninguna socia de este centro», aunque el código sí sabría cuál es: decir
 * el tercero confirmaría a un desconocido que ese email NO está dado de alta,
 * y eso es la misma enumeración de cuentas que la puerta evita. Un solo
 * mensaje para los tres casos, y salida a pedir otro enlace.
 */
function Caducado({ onPedir }: { onPedir: () => void }) {
  return (
    <>
      <div>
        <div
          aria-hidden
          style={{
            width: 44, height: 44, borderRadius: 22, background: 'rgba(239,68,68,.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#B85436', fontSize: 20, fontWeight: 600, ...entrada(0),
          }}
        >
          !
        </div>
        <h1 style={{ ...display(36, false, 1.1), color: T.ink, marginTop: 18, ...entrada(1) }}>
          Ese enlace <em style={{ fontStyle: 'italic' }}>ya no vale.</em>
        </h1>
        <p style={{ ...texto.meta, lineHeight: 1.75, color: T.muted, maxWidth: 290, marginTop: 12, ...entrada(2) }}>
          Ha caducado o ya se usó una vez. Te mandamos otro y sigues por donde ibas.
        </p>
      </div>
      <div style={{ ...entrada(3) }}>
        <BotonCta listo onClick={onPedir}>Pedir un enlace nuevo</BotonCta>
      </div>
    </>
  );
}

function Guardada() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', flex: 1 }}>
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
      <h1 style={{ ...display(36, false, 1.1), color: T.ink, marginTop: 18, ...entrada(1) }}>
        Contraseña <em style={{ fontStyle: 'italic' }}>guardada.</em>
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, ...entrada(2) }}>
        <Spinner />
        <p style={{ ...texto.meta, color: T.muted }}>Te llevamos a tu portal…</p>
      </div>
    </div>
  );
}

/** 26 px, 900 ms y lineal: es el único sitio del portal donde `linear` es correcto — una rueda que acelera se lee como un tirón. */
function Spinner() {
  return (
    <span
      aria-hidden
      className="animate-spin"
      style={{
        width: 26, height: 26, borderRadius: 13, display: 'inline-block',
        border: `2px solid ${T.line}`, borderTopColor: MARCA,
        animationDuration: '900ms', animationTimingFunction: 'linear',
      }}
    />
  );
}
