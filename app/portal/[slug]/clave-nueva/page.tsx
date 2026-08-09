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

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { dur, display, micro, texto } from '@/lib/portal-design';
import {
  PortadaAcceso, CampoLinea, BotonCta, ErrorCampo, entrada, MARCA,
} from '@/components/portal/acceso/piezas';

const MIN_LEN = 8;

export default function PortalClaveNueva() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { session, isLoading, establecerPassword } = usePortalAuth();
  const { studio } = useStudio();
  const { t } = useModo();
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

  const nombre = studio?.nombre?.trim() || 'Tentare';
  const caducado = !isLoading && !session;

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, display: 'flex', flexDirection: 'column' }}>
      <PortadaAcceso
        alto={212}
        fotoUrl={studio?.fotoUrl?.trim() ? studio.fotoUrl : null}
        nombre={nombre}
        ciudad={studio?.ciudad}
        // 88 y no 100: la socia todavía tiene que elegir la clave. El hilo
        // llega al final cuando el trámite acaba, no cuando queda poco.
        progreso={guardada ? 100 : 88}
        tamNombre={26}
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
                    <p style={{ ...micro(9.5, 0.28), color: t.micro, ...entrada(0) }}>Email verificado</p>
                    <h1 style={{ ...display(36, false, 1.1), color: t.ink, marginTop: 10, ...entrada(1) }}>
                      Elige tu <em style={{ fontStyle: 'italic' }}>contraseña.</em>
                    </h1>
                    <p style={{ ...texto.meta, lineHeight: 1.75, color: t.muted, marginTop: 10, ...entrada(2) }}>
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
                    <p style={{ ...texto.nota, color: t.micro, textAlign: 'center', marginBottom: 12 }}>
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
  const { t } = useModo();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16 }}>
      <Spinner />
      <p style={{ ...texto.meta, color: t.muted }}>Comprobando tu enlace…</p>
    </div>
  );
}

/**
 * El enlace ya no vale.
 *
 * ⚠️ El texto NO distingue entre «ha caducado», «ya se usó» y «tu email no es
 * de ninguna socia de este centro», aunque el código sí sabría cuál es: decir
 * el tercero confirmaría a un desconocido que ese email NO está dado de alta,
 * y eso es la misma enumeración de cuentas que el paso 2 evita. Un solo
 * mensaje para los tres casos, y salida a pedir otro enlace.
 */
function Caducado({ onPedir }: { onPedir: () => void }) {
  const { t } = useModo();
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
        <h1 style={{ ...display(36, false, 1.1), color: t.ink, marginTop: 18, ...entrada(1) }}>
          Ese enlace <em style={{ fontStyle: 'italic' }}>ya no vale.</em>
        </h1>
        <p style={{ ...texto.meta, lineHeight: 1.75, color: t.muted, maxWidth: 290, marginTop: 12, ...entrada(2) }}>
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
  const { t } = useModo();
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
      <h1 style={{ ...display(36, false, 1.1), color: t.ink, marginTop: 18, ...entrada(1) }}>
        Contraseña <em style={{ fontStyle: 'italic' }}>guardada.</em>
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, ...entrada(2) }}>
        <Spinner />
        <p style={{ ...texto.meta, color: t.muted }}>Te llevamos a tu portal…</p>
      </div>
    </div>
  );
}

/** 26 px, 900 ms y lineal: es el único sitio del portal donde `linear` es correcto — una rueda que acelera se lee como un tirón. */
function Spinner() {
  const { t } = useModo();
  return (
    <span
      aria-hidden
      className="animate-spin"
      style={{
        width: 26, height: 26, borderRadius: 13, display: 'inline-block',
        border: `2px solid ${t.line}`, borderTopColor: MARCA,
        animationDuration: '900ms', animationTimingFunction: 'linear',
      }}
    />
  );
}
