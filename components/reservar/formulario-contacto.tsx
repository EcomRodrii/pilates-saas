'use client';

// Widget «Formulario de contacto» (lib/widgets/catalogo.ts): la vista
// `?tab=contacto` de /reservar/[slug]. Una persona que aún no es clienta escribe
// al estudio; la consulta llega a Clientas (app/api/public/contacto).
//
// Lo que se cuida, y por qué:
// - El estado de carga se enciende ANTES de pedir el token del captcha: tarda
//   segundos y, sin esto, el botón parece muerto y se pulsa dos veces.
// - Un fallo nunca borra lo escrito, y dice cómo contactar por otra vía.
// - Sin captcha comprobable en el servidor (falta la clave), el formulario no
//   se pinta: se enseña cómo escribir al estudio. Un formulario que nunca envía
//   es peor que ninguno.
// - En la vista previa del constructor no se envía nada.

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { captchaGastado } from '@/lib/auth/captcha-usado';
import { CAMPO_TRAMPA } from '@/lib/auth/trampa-bots';
import { CONSERVACION_MESES, LIMITES_CONSULTA } from '@/lib/contacto/consulta';
import { serif } from '@/lib/reservar-publico-tokens';

type Estado =
  | { tipo: 'libre' }
  | { tipo: 'enviando' }
  | { tipo: 'enviada'; nombre: string; email: string }
  | { tipo: 'error'; mensaje: string; conOtraVia: boolean };

interface Props {
  slug: string;
  nombreEstudio: string;
  emailEstudio: string | null;
  telefonoEstudio: string | null;
  /** La etiqueta del widget (`?ref=`), para saber desde qué web llegó. */
  origen: string | null;
  vistaPrevia: boolean;
  onAbrirPrivacidad: () => void;
}

const campo: CSSProperties = {
  width: '100%', padding: '12px 14px', fontSize: 16, color: 'var(--portal-ink)',
  background: 'var(--portal-surface)', border: '1.5px solid var(--portal-line)',
  borderRadius: 14, outline: 'none', fontFamily: 'inherit',
};
const etiqueta: CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--portal-ink)', marginBottom: 6 };

export function FormularioContacto(p: Props) {
  const id = useId();
  const { widget: captcha, pedirToken } = useCaptcha();
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [privacidad, setPrivacidad] = useState(false);
  const [trampa, setTrampa] = useState('');
  const [estado, setEstado] = useState<Estado>({ tipo: 'libre' });
  const titularRef = useRef<HTMLHeadingElement>(null);

  // ¿Puede el servidor comprobar el captcha? Si la pregunta falla, se deja el
  // formulario: el envío dirá lo que haya.
  useEffect(() => {
    let vivo = true;
    fetch('/api/public/contacto', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { disponible?: unknown } | null) => { if (vivo) setDisponible(d?.disponible === false ? false : true); })
      .catch(() => { if (vivo) setDisponible(true); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (estado.tipo === 'enviada') titularRef.current?.focus();
  }, [estado.tipo]);

  const otraVia = [p.emailEstudio, p.telefonoEstudio].filter(Boolean).join(' · ');

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (estado.tipo === 'enviando' || p.vistaPrevia) return;
    if (!nombre.trim() || !email.trim() || !mensaje.trim()) {
      setEstado({ tipo: 'error', mensaje: 'Rellena tu nombre, tu email y el mensaje.', conOtraVia: false });
      return;
    }
    if (!privacidad) {
      setEstado({ tipo: 'error', mensaje: 'Marca que has leído la información sobre privacidad.', conOtraVia: false });
      return;
    }
    setEstado({ tipo: 'enviando' });
    const token = await pedirToken().catch(() => null);
    if (token === null) {
      setEstado({ tipo: 'error', mensaje: ERROR_CAPTCHA, conOtraVia: false });
      return;
    }
    try {
      const res = await fetch('/api/public/contacto', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: p.slug,
          nombre: nombre.trim(),
          email: email.trim(),
          telefono: telefono.trim(),
          mensaje: mensaje.trim(),
          aceptaPrivacidad: true,
          origen: p.origen ?? undefined,
          captcha: token,
          [CAMPO_TRAMPA]: trampa,
        }),
      });
      if (res.ok) {
        setEstado({ tipo: 'enviada', nombre: nombre.trim().split(' ')[0], email: email.trim() });
        return;
      }
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      // 400 y 429 traen un mensaje pensado para ella; lo demás es una avería.
      if ((res.status === 400 || res.status === 429) && d?.error) {
        setEstado({ tipo: 'error', mensaje: d.error, conOtraVia: res.status === 429 });
      } else {
        setEstado({ tipo: 'error', mensaje: 'No hemos podido enviar tu mensaje.', conOtraVia: true });
      }
    } catch {
      setEstado({ tipo: 'error', mensaje: 'No hemos podido enviar tu mensaje. Revisa tu conexión.', conOtraVia: true });
    } finally {
      // Un token de Turnstile vale para una sola petición.
      captchaGastado();
    }
  }

  const contenedor: CSSProperties = { maxWidth: 560, margin: '0 auto', padding: '28px 0 36px' };

  if (estado.tipo === 'enviada') {
    return (
      <div style={contenedor} role="status">
        <h2 ref={titularRef} tabIndex={-1} style={{ fontFamily: serif, fontSize: 28, lineHeight: 1.1, color: 'var(--portal-ink)', outline: 'none' }}>
          Gracias, {estado.nombre}
        </h2>
        <p style={{ marginTop: 12, fontSize: 15, lineHeight: 1.55, color: 'var(--portal-muted)' }}>
          Hemos recibido tu mensaje. {p.nombreEstudio || 'El estudio'} te responderá a <strong style={{ color: 'var(--portal-ink)' }}>{estado.email}</strong>.
        </p>
      </div>
    );
  }

  if (disponible === false) {
    return (
      <div style={contenedor}>
        <h2 style={{ fontFamily: serif, fontSize: 28, lineHeight: 1.1, color: 'var(--portal-ink)' }}>Escríbenos</h2>
        <p role="status" style={{ marginTop: 12, fontSize: 15, lineHeight: 1.55, color: 'var(--portal-muted)' }}>
          {otraVia
            ? <>El formulario no está disponible ahora mismo. Puedes escribirnos directamente: <strong style={{ color: 'var(--portal-ink)' }}>{otraVia}</strong></>
            : 'El formulario no está disponible ahora mismo. Vuelve a intentarlo más tarde.'}
        </p>
      </div>
    );
  }

  const enviando = estado.tipo === 'enviando';
  const quedan = LIMITES_CONSULTA.mensaje - mensaje.length;

  return (
    <div style={contenedor}>
      <h2 id={`${id}-t`} style={{ fontFamily: serif, fontSize: 28, lineHeight: 1.1, color: 'var(--portal-ink)' }}>Escríbenos</h2>
      <p style={{ marginTop: 8, fontSize: 14.5, lineHeight: 1.5, color: 'var(--portal-muted)' }}>
        Cuéntanos qué necesitas y {p.nombreEstudio || 'el estudio'} te responderá por email.
      </p>

      <form onSubmit={enviar} noValidate aria-labelledby={`${id}-t`} style={{ display: 'grid', gap: 14, marginTop: 20 }}>
        <div>
          <label htmlFor={`${id}-nombre`} style={etiqueta}>Nombre</label>
          <input id={`${id}-nombre`} type="text" autoComplete="name" required maxLength={LIMITES_CONSULTA.nombre}
            value={nombre} onChange={e => setNombre(e.target.value)} className="pantalla-reserva-campo" style={campo} />
        </div>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div>
            <label htmlFor={`${id}-email`} style={etiqueta}>Email</label>
            <input id={`${id}-email`} type="email" inputMode="email" autoComplete="email" required maxLength={LIMITES_CONSULTA.email}
              value={email} onChange={e => setEmail(e.target.value)} className="pantalla-reserva-campo" style={campo} />
          </div>
          <div>
            <label htmlFor={`${id}-tel`} style={etiqueta}>
              Teléfono <span style={{ fontWeight: 400, color: 'var(--portal-muted)' }}>(opcional)</span>
            </label>
            <input id={`${id}-tel`} type="tel" inputMode="tel" autoComplete="tel" maxLength={LIMITES_CONSULTA.telefono}
              value={telefono} onChange={e => setTelefono(e.target.value)} className="pantalla-reserva-campo" style={campo} />
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-mensaje`} style={etiqueta}>Mensaje</label>
          <textarea id={`${id}-mensaje`} required rows={5} maxLength={LIMITES_CONSULTA.mensaje}
            aria-describedby={`${id}-salud`}
            value={mensaje} onChange={e => setMensaje(e.target.value)} className="pantalla-reserva-campo"
            style={{ ...campo, resize: 'vertical', minHeight: 120, lineHeight: 1.5 }} />
          <p id={`${id}-salud`} style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.45, color: 'var(--portal-muted)' }}>
            Si es por una lesión o un tema de salud, no des detalles aquí: el estudio te lo preguntará en persona.
            {quedan < 200 && <span aria-live="polite"> Te quedan {quedan} caracteres.</span>}
          </p>
        </div>

        {/* La trampa para bots: invisible, fuera del orden de tabulación y sin autorrelleno. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: -10000, width: 1, height: 1, overflow: 'hidden' }}>
          <label>
            Web
            <input type="text" name={CAMPO_TRAMPA} tabIndex={-1} autoComplete="off" value={trampa} onChange={e => setTrampa(e.target.value)} />
          </label>
        </div>

        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--portal-muted)', background: 'var(--portal-surface-2, var(--portal-surface))', border: '1px solid var(--portal-line)', borderRadius: 12, padding: '10px 12px' }}>
          <strong style={{ color: 'var(--portal-ink)' }}>Información sobre privacidad.</strong>{' '}
          Responsable: {p.nombreEstudio || 'el estudio'}. Finalidad: responder a tu consulta. Legitimación: tu solicitud.
          Se guarda como máximo {CONSERVACION_MESES} meses y no se usa para nada más.
          {p.emailEstudio ? <> Puedes pedir acceder a tus datos, corregirlos o borrarlos escribiendo a {p.emailEstudio}.</> : <> Puedes pedir acceder a tus datos, corregirlos o borrarlos escribiendo al estudio.</>}{' '}
          <button type="button" onClick={p.onAbrirPrivacidad}
            style={{ border: 0, background: 'none', padding: 0, font: 'inherit', color: 'var(--portal-ink)', textDecoration: 'underline', cursor: 'pointer' }}>
            Política de privacidad
          </button>
        </div>

        <label htmlFor={`${id}-priv`} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.45, color: 'var(--portal-ink)', cursor: 'pointer' }}>
          <input id={`${id}-priv`} type="checkbox" checked={privacidad} onChange={e => setPrivacidad(e.target.checked)}
            style={{ marginTop: 2, width: 18, height: 18, flex: '0 0 auto', accentColor: 'var(--portal-brand)' }} />
          <span>He leído la información sobre privacidad</span>
        </label>

        {captcha}

        {estado.tipo === 'error' && (
          <p role="alert" style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--destructive, #A13A2A)' }}>
            {estado.mensaje}
            {estado.conOtraVia && otraVia && <> Si corre prisa, escríbenos a <strong>{otraVia}</strong>.</>}
          </p>
        )}

        <button type="submit" disabled={enviando || p.vistaPrevia}
          style={{
            justifySelf: 'start', minHeight: 48, padding: '0 26px', borderRadius: 999, border: 0,
            background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)', fontSize: 15, fontWeight: 700,
            cursor: enviando ? 'wait' : p.vistaPrevia ? 'not-allowed' : 'pointer', opacity: enviando || p.vistaPrevia ? 0.7 : 1,
          }}>
          {p.vistaPrevia ? 'En la vista previa no se envía' : enviando ? 'Enviando…' : 'Enviar mensaje'}
        </button>
      </form>
    </div>
  );
}
