'use client';

import { useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { captchaGastado } from '@/lib/auth/captcha-usado';
import { CAMPO_TRAMPA } from '@/lib/auth/trampa-bots';
import { EMAIL_VALIDO, TEXTO_CONSENTIMIENTO_NOVEDADES } from '@/lib/recursos/descargas';
import { capturarEvento } from '@/lib/posthog-cliente';
import { ACC } from '@/components/landing/theme';

// El recuadro «descárgala a cambio del email» de una guía (lib/recursos/descargas.ts).
//
// ⚠️ La casilla de novedades va SIN marcar y aparte del botón: descargar no es
// consentir. Su texto sale de la misma constante que guarda el servidor, para
// que lo guardado sea exactamente lo que se enseñó.

type Estado =
  | { tipo: 'libre' }
  | { tipo: 'enviando' }
  | { tipo: 'enviado'; email: string; novedades: boolean }
  | { tipo: 'error'; mensaje: string };

const FALLO_RED = 'No hemos podido enviártela. Revisa tu conexión y vuelve a intentarlo.';

export function DescargaRecurso(props: { recurso: string; formato: string; llamada: string; promesa: string }) {
  const id = useId();
  const { widget: captcha, pedirToken } = useCaptcha();
  const [email, setEmail] = useState('');
  const [estudio, setEstudio] = useState('');
  const [novedades, setNovedades] = useState(false);
  const [trampa, setTrampa] = useState('');
  const [estado, setEstado] = useState<Estado>({ tipo: 'libre' });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (estado.tipo === 'enviando') return;
    const limpio = email.trim();
    if (!EMAIL_VALIDO.test(limpio)) {
      setEstado({ tipo: 'error', mensaje: 'Escribe un email válido.' });
      return;
    }
    // El estado de carga va ANTES del captcha: el token tarda segundos en
    // llegar, y sin esto el botón parece muerto y se pulsa dos veces.
    setEstado({ tipo: 'enviando' });
    const token = await pedirToken().catch(() => null);
    if (token === null) {
      setEstado({ tipo: 'error', mensaje: ERROR_CAPTCHA });
      return;
    }
    try {
      const res = await fetch('/api/public/descargas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recurso: props.recurso,
          email: limpio,
          estudio: estudio.trim(),
          novedades,
          captcha: token,
          [CAMPO_TRAMPA]: trampa,
        }),
      });
      if (res.ok) {
        setEstado({ tipo: 'enviado', email: limpio, novedades });
        capturarEvento('recurso_descarga_pedida', { recurso: props.recurso, novedades });
        return;
      }
      const datos = (await res.json().catch(() => null)) as { error?: string } | null;
      setEstado({ tipo: 'error', mensaje: datos?.error || 'No hemos podido enviártela. Vuelve a intentarlo en un rato.' });
    } catch {
      setEstado({ tipo: 'error', mensaje: FALLO_RED });
    } finally {
      // Un token de Turnstile vale para una sola petición: el siguiente intento necesita otro.
      captchaGastado();
    }
  }

  const enviando = estado.tipo === 'enviando';

  return (
    <section
      aria-labelledby={`${id}-t`}
      style={{ background: '#fff', border: '1px solid #E0E5D0', borderRadius: 20, padding: 'clamp(18px,3vw,26px)', margin: '26px 0' }}
    >
      <p className="lp-mono" style={{ margin: '0 0 6px', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#6B6B63' }}>
        Plantilla en {props.formato}
      </p>
      <h3 id={`${id}-t`} style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 800, letterSpacing: '-.02em' }}>{props.llamada}</h3>

      {estado.tipo === 'enviado' ? (
        <div role="status" style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 6px', fontSize: 15, lineHeight: 1.55 }}>
            Te la hemos enviado a <strong>{estado.email}</strong>. Si no la ves en unos minutos, mira en spam o en promociones.
          </p>
          {estado.novedades && (
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: '#5A5A52' }}>
              Si es la primera vez que pides las novedades, confírmalas con el botón del correo.
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={enviar} noValidate style={{ marginTop: 6 }}>
          <p style={{ margin: '0 0 16px', fontSize: 14.5, lineHeight: 1.55, color: '#5A5A52' }}>{props.promesa}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            <label htmlFor={`${id}-email`} style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>Tu email</span>
              <input
                id={`${id}-email`}
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%', fontSize: 16, padding: '10px 12px', borderRadius: 12, border: '1px solid #D6D6CE', background: '#FAFAF7' }}
              />
            </label>
            <label htmlFor={`${id}-estudio`} style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>
                Nombre de tu estudio <span style={{ fontWeight: 400, color: '#6B6B63' }}>(opcional)</span>
              </span>
              <input
                id={`${id}-estudio`}
                type="text"
                autoComplete="organization"
                maxLength={120}
                value={estudio}
                onChange={(e) => setEstudio(e.target.value)}
                style={{ width: '100%', fontSize: 16, padding: '10px 12px', borderRadius: 12, border: '1px solid #D6D6CE', background: '#FAFAF7' }}
              />
            </label>
          </div>

          {/* La trampa para bots: invisible, fuera del orden de tabulación y sin autorrelleno. */}
          <div aria-hidden="true" style={{ position: 'absolute', left: -10000, width: 1, height: 1, overflow: 'hidden' }}>
            <label>
              Web
              <input type="text" name={CAMPO_TRAMPA} tabIndex={-1} autoComplete="off" value={trampa} onChange={(e) => setTrampa(e.target.value)} />
            </label>
          </div>

          <label htmlFor={`${id}-novedades`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, fontSize: 14, lineHeight: 1.5, cursor: 'pointer' }}>
            <input
              id={`${id}-novedades`}
              type="checkbox"
              checked={novedades}
              onChange={(e) => setNovedades(e.target.checked)}
              style={{ marginTop: 3, width: 18, height: 18, flex: '0 0 auto', accentColor: ACC }}
            />
            <span>{TEXTO_CONSENTIMIENTO_NOVEDADES}</span>
          </label>

          {captcha}

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 16px', marginTop: 16 }}>
            <button
              type="submit"
              disabled={enviando}
              style={{ background: ACC, color: '#fff', border: 0, borderRadius: 999, padding: '12px 22px', fontSize: 15, fontWeight: 700, cursor: enviando ? 'wait' : 'pointer', opacity: enviando ? 0.75 : 1 }}
            >
              {enviando ? 'Enviando…' : 'Enviármela'}
            </button>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: '#6B6B63' }}>
              Usamos tu email para enviarte la plantilla. Más información en la{' '}
              <Link href="/privacidad" style={{ color: ACC }}>política de privacidad</Link>.
            </p>
          </div>

          {estado.tipo === 'error' && (
            <p role="alert" style={{ margin: '12px 0 0', fontSize: 14, color: '#A13A2A' }}>{estado.mensaje}</p>
          )}
        </form>
      )}
    </section>
  );
}
