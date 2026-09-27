'use client';

// Widget «Formulario de contacto» (lib/widgets/catalogo.ts): la vista
// `?tab=contacto` de /reservar/[slug]. Una persona que aún no es clienta escribe
// al estudio; la consulta llega a Clientas (app/api/public/contacto).
//
// Lo que se cuida, y por qué:
// - El estado de carga se enciende ANTES de pedir el token del captcha: tarda
//   segundos y, sin esto, el botón parece muerto y se pulsa dos veces.
// - Lo que falta o el email con errata se dicen antes de pedir ese token
//   (lib/contacto/formulario.ts): vale para una sola petición.
// - Un fallo nunca borra lo escrito, y dice cómo contactar por otra vía.
// - Sin captcha comprobable en el servidor (falta la clave), el formulario no
//   se pinta: se enseña cómo escribir al estudio. Un formulario que nunca envía
//   es peor que ninguno.
// - En la vista previa del constructor no se envía nada.

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { captchaGastado } from '@/lib/auth/captcha-usado';
import { CAMPO_TRAMPA } from '@/lib/auth/trampa-bots';
import { CONSERVACION_MESES, LIMITES_CONSULTA } from '@/lib/contacto/consulta';
import {
  avisoCamposVacios, camposVacios, emailConFormato, primerNombre, viasDeContacto,
  type CampoObligatorio, type ViaDeContacto,
} from '@/lib/contacto/formulario';
import { cq, serif, shadow } from '@/lib/reservar-publico-tokens';

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
  /** Foto del estudio: de fondo tras la tarjeta, o en banda arriba si el hueco es estrecho. */
  fotoFondo?: string | null;
}

const EMAIL_CON_ERRATA = 'Escribe un email válido para que te puedan responder.';

// La foto cambia de papel según el ancho REAL del hueco (container query y no
// media query: incrustado, el viewport es el del iframe; a página completa,
// la columna). Estrecho, banda arriba y el formulario debajo: de fondo solo
// asomaría como un marco de 16 px. Ancho, de fondo con la tarjeta encima; y a
// partir de 880 px la tarjeta se va a un lado para que la foto se vea de
// verdad y las líneas del formulario no se estiren.
const CSS = `
.contacto-raiz{container:contacto/inline-size}
.contacto-marco{position:relative;overflow:hidden;border-radius:24px;border:1px solid var(--portal-line);background:var(--portal-surface)}
.contacto-foto{display:block;width:100%;object-fit:cover}
.contacto-tarjeta{position:relative;background:var(--portal-surface)}
.contacto-campo::placeholder{color:color-mix(in srgb,var(--portal-muted) 72%,var(--portal-surface));opacity:1}
.contacto-campo[aria-invalid=true]{border-color:var(--destructive)!important}
.contacto-enviar:focus-visible,.contacto-enlace:focus-visible{outline:2px solid var(--portal-brand);outline-offset:3px}
@container contacto (max-width:479.98px){
  .contacto-foto{height:clamp(132px,40cqw,190px)}
  .contacto-tarjeta{padding:24px 20px 22px}
  .contacto-marco[data-foto] .contacto-tarjeta{margin-top:-24px;border-radius:24px 24px 0 0}
}
@container contacto (min-width:480px){
  .contacto-marco{display:grid;justify-items:center;padding:clamp(16px,5cqw,56px);background:color-mix(in srgb,var(--portal-brand) 12%,var(--portal-surface-2))}
  .contacto-marco[data-foto]{padding-top:clamp(64px,12cqw,112px)}
  .contacto-foto{position:absolute;inset:0;height:100%}
  .contacto-tarjeta{width:100%;max-width:560px;border-radius:20px;border:1px solid var(--portal-line);box-shadow:${shadow.hero};padding:clamp(24px,5cqw,36px)}
}
@container contacto (min-width:880px){
  .contacto-marco[data-foto]{justify-items:end;padding:56px}
  .contacto-tarjeta{max-width:520px}
}
`;

const campo: CSSProperties = {
  width: '100%', minHeight: 48, padding: '12px 14px', fontSize: 16, color: 'var(--portal-ink)',
  background: 'var(--portal-surface)', border: '1.5px solid var(--portal-line)',
  borderRadius: 12, outline: 'none', fontFamily: 'inherit',
};
const etiqueta: CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--portal-ink)', marginBottom: 6 };
const titular: CSSProperties = {
  fontFamily: serif, fontSize: cq(24, 6, 30), fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.1,
  color: 'var(--portal-ink)', outline: 'none',
};
const entradilla: CSSProperties = { marginTop: 8, fontSize: 14.5, lineHeight: 1.55, color: 'var(--portal-muted)' };

function Marco({ foto, children }: { foto: string | null | undefined; children: ReactNode }) {
  return (
    <div className="contacto-raiz" style={{ padding: `${cq(16, 2.4, 32)} 0 ${cq(24, 3.4, 48)}` }}>
      <style>{CSS}</style>
      <div className="contacto-marco" data-foto={foto ? '' : undefined}>
        {foto && (
          // Decorativa: el estudio ya se nombra en el texto.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="contacto-foto" src={foto} alt="" decoding="async" />
        )}
        <div className="contacto-tarjeta">{children}</div>
      </div>
    </div>
  );
}

function Vias({ vias }: { vias: ViaDeContacto[] }) {
  return (
    <>
      {vias.map((v, i) => (
        <span key={v.href}>
          {i > 0 && ' · '}
          <a href={v.href} className="contacto-enlace"
            style={{ color: 'var(--portal-ink)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3, overflowWrap: 'anywhere' }}>
            {v.texto}
          </a>
        </span>
      ))}
    </>
  );
}

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
  // Tras el primer intento, los campos que siguen mal se marcan (y se desmarcan
  // solos al corregirlos): antes no, que un formulario en rojo sin tocar asusta.
  const [intentado, setIntentado] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: 'libre' });
  const titularRef = useRef<HTMLHeadingElement>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const mensajeRef = useRef<HTMLTextAreaElement>(null);
  const privacidadRef = useRef<HTMLInputElement>(null);

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

  const vias = viasDeContacto(p.emailEstudio, p.telefonoEstudio);
  const estudio = p.nombreEstudio || 'el estudio';

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (estado.tipo === 'enviando' || p.vistaPrevia) return;
    setIntentado(true);
    // El foco va al primer campo que falla: el aviso se anuncia (role=alert) y
    // quien no ve la pantalla aterriza donde tiene que escribir.
    const faltan = camposVacios({ nombre, email, mensaje });
    if (faltan.length > 0) {
      const primero: Record<CampoObligatorio, { current: HTMLElement | null }> = { nombre: nombreRef, email: emailRef, mensaje: mensajeRef };
      setEstado({ tipo: 'error', mensaje: avisoCamposVacios(faltan) ?? '', conOtraVia: false });
      primero[faltan[0]].current?.focus();
      return;
    }
    if (!emailConFormato(email)) {
      setEstado({ tipo: 'error', mensaje: EMAIL_CON_ERRATA, conOtraVia: false });
      emailRef.current?.focus();
      return;
    }
    if (!privacidad) {
      setEstado({ tipo: 'error', mensaje: 'Marca que has leído la información sobre privacidad.', conOtraVia: false });
      privacidadRef.current?.focus();
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
        setEstado({ tipo: 'enviada', nombre: primerNombre(nombre), email: email.trim() });
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

  if (estado.tipo === 'enviada') {
    return (
      <Marco foto={p.fotoFondo}>
        <div role="status" className="pantalla-reserva-seccion">
          <span aria-hidden="true" style={{
            width: 48, height: 48, borderRadius: 999, display: 'grid', placeItems: 'center', marginBottom: 16,
            background: 'color-mix(in srgb, var(--portal-brand) 12%, var(--portal-surface))', color: 'var(--portal-brand)',
          }}>
            <Check size={24} strokeWidth={2.2} />
          </span>
          <h2 ref={titularRef} tabIndex={-1} style={titular}>Gracias, {estado.nombre}</h2>
          <p style={{ ...entradilla, marginTop: 10 }}>
            Hemos recibido tu mensaje. {p.nombreEstudio || 'El estudio'} te responderá a{' '}
            <strong style={{ color: 'var(--portal-ink)', overflowWrap: 'anywhere' }}>{estado.email}</strong>.
          </p>
        </div>
      </Marco>
    );
  }

  if (disponible === false) {
    return (
      <Marco foto={p.fotoFondo}>
        <h2 style={titular}>¿Tienes alguna duda?</h2>
        <p role="status" style={{ ...entradilla, marginTop: 10 }}>
          {vias.length > 0
            ? <>El formulario no está disponible ahora mismo. Puedes escribirnos directamente: <Vias vias={vias} /></>
            : 'El formulario no está disponible ahora mismo. Vuelve a intentarlo más tarde.'}
        </p>
      </Marco>
    );
  }

  const enviando = estado.tipo === 'enviando';
  const quedan = LIMITES_CONSULTA.mensaje - mensaje.length;

  return (
    <Marco foto={p.fotoFondo}>
      <h2 id={`${id}-t`} style={titular}>¿Tienes alguna duda?</h2>
      <p style={entradilla}>Escríbenos y te responderemos lo antes posible.</p>

      <form onSubmit={enviar} noValidate aria-labelledby={`${id}-t`} aria-busy={enviando}
        style={{ display: 'grid', gap: 16, marginTop: 22 }}>
        <div>
          <label htmlFor={`${id}-nombre`} style={etiqueta}>Nombre</label>
          <input ref={nombreRef} id={`${id}-nombre`} name="nombre" type="text" autoComplete="name" required
            maxLength={LIMITES_CONSULTA.nombre} placeholder="Tu nombre" aria-invalid={intentado && !nombre.trim()}
            value={nombre} onChange={e => setNombre(e.target.value)} className="pantalla-reserva-campo contacto-campo" style={campo} />
        </div>
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))' }}>
          <div>
            <label htmlFor={`${id}-email`} style={etiqueta}>Email</label>
            <input ref={emailRef} id={`${id}-email`} name="email" type="email" inputMode="email" autoComplete="email" required
              maxLength={LIMITES_CONSULTA.email} placeholder="tu@email.com" aria-invalid={intentado && !emailConFormato(email)}
              value={email} onChange={e => setEmail(e.target.value)} className="pantalla-reserva-campo contacto-campo" style={campo} />
          </div>
          <div>
            <label htmlFor={`${id}-tel`} style={etiqueta}>
              Teléfono <span style={{ fontWeight: 400, color: 'var(--portal-muted)' }}>(opcional)</span>
            </label>
            <input id={`${id}-tel`} name="telefono" type="tel" inputMode="tel" autoComplete="tel"
              maxLength={LIMITES_CONSULTA.telefono} placeholder="Tu teléfono"
              value={telefono} onChange={e => setTelefono(e.target.value)} className="pantalla-reserva-campo contacto-campo" style={campo} />
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-mensaje`} style={etiqueta}>Mensaje</label>
          <textarea ref={mensajeRef} id={`${id}-mensaje`} name="mensaje" required rows={4} maxLength={LIMITES_CONSULTA.mensaje}
            placeholder="Cuéntanos en qué podemos ayudarte…" aria-describedby={`${id}-salud`} aria-invalid={intentado && !mensaje.trim()}
            value={mensaje} onChange={e => setMensaje(e.target.value)} className="pantalla-reserva-campo contacto-campo"
            style={{ ...campo, resize: 'vertical', minHeight: 116, lineHeight: 1.5 }} />
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

        <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--portal-muted)', background: 'var(--portal-surface-2)', border: '1px solid var(--portal-line)', borderRadius: 12, padding: '10px 12px' }}>
          <strong style={{ color: 'var(--portal-ink)' }}>Información sobre privacidad.</strong>{' '}
          Responsable: {estudio}. Finalidad: responder a tu consulta. Legitimación: tu solicitud.
          Se guarda como máximo {CONSERVACION_MESES} meses y no se usa para nada más.
          {p.emailEstudio ? <> Puedes pedir acceder a tus datos, corregirlos o borrarlos escribiendo a {p.emailEstudio}.</> : <> Puedes pedir acceder a tus datos, corregirlos o borrarlos escribiendo al estudio.</>}{' '}
          <button type="button" onClick={p.onAbrirPrivacidad} className="contacto-enlace"
            style={{ border: 0, background: 'none', padding: 0, font: 'inherit', color: 'var(--portal-ink)', textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }}>
            Política de privacidad
          </button>
        </div>

        <label htmlFor={`${id}-priv`} style={{ display: 'flex', gap: 12, alignItems: 'center', minHeight: 44, fontSize: 14, lineHeight: 1.45, color: 'var(--portal-ink)', cursor: 'pointer' }}>
          <input ref={privacidadRef} id={`${id}-priv`} type="checkbox" checked={privacidad} onChange={e => setPrivacidad(e.target.checked)}
            aria-invalid={intentado && !privacidad}
            style={{ width: 20, height: 20, margin: 0, flex: '0 0 auto', accentColor: 'var(--portal-brand)', cursor: 'pointer' }} />
          <span>He leído la información sobre privacidad</span>
        </label>

        {estado.tipo === 'error' && (
          <p role="alert" style={{
            fontSize: 14, lineHeight: 1.45, color: 'var(--destructive)', borderRadius: 12, padding: '10px 12px',
            background: 'color-mix(in srgb, var(--destructive) 8%, var(--portal-surface))',
          }}>
            {estado.mensaje}
            {estado.conOtraVia && vias.length > 0 && <> Si corre prisa, escríbenos a <Vias vias={vias} />.</>}
          </p>
        )}

        {/* El captcha pegado al botón y sin hueco propio: casi siempre mide
            0 px, y cualquier separación quedaría como aire en blanco. */}
        <div style={{ display: 'grid' }}>
          {captcha}
          <button type="submit" disabled={enviando || p.vistaPrevia} className="contacto-enviar"
            style={{
              width: '100%', minHeight: 52, padding: '0 24px', borderRadius: 999, border: 0,
              background: 'var(--portal-brand)', color: 'var(--portal-brand-foreground)', fontSize: 15.5, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              cursor: enviando ? 'wait' : p.vistaPrevia ? 'not-allowed' : 'pointer', opacity: enviando || p.vistaPrevia ? 0.7 : 1,
            }}>
            {p.vistaPrevia ? 'En la vista previa no se envía' : enviando ? (
              <><Loader2 size={18} className="animate-spin" aria-hidden="true" />Enviando…</>
            ) : (
              <>Enviar mensaje<ArrowRight size={18} strokeWidth={2.2} aria-hidden="true" /></>
            )}
          </button>
        </div>
      </form>
    </Marco>
  );
}
