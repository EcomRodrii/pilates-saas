'use client';

import { useId, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { NW } from './data';

// Sección final: es aquí donde se decide todo, así que lleva el peso visual
// de un "CTA final" de landing (fondo oscuro, titular grande) pero con el
// formulario real dentro en vez de solo un botón — a diferencia de la
// landing principal, aquí la conversión ES rellenar el formulario, no un
// enlace a otra pantalla.

export function SeccionRegistro() {
  const uid = useId();
  const { signUp } = useAuth();
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { widget: captcha, pedirToken } = useCaptcha();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setSubmitting(true);
    const token = await pedirToken();
    if (token === null) { setSubmitting(false); setError(ERROR_CAPTCHA); return; }

    const { error, needsConfirmation, yaRegistrado } = await signUp(
      email, password,
      { nombre: nombre.trim() },
      token || undefined,
      '/network/inicio',
    );
    if (error) { setError(error); setSubmitting(false); return; }
    if (yaRegistrado) {
      setInfo('Ya existe una cuenta con ese email. Inicia sesión — si ya tenías perfil en Network, lo verás tal cual lo dejaste.');
      setSubmitting(false);
      return;
    }
    if (needsConfirmation) {
      setInfo('Cuenta creada. Revisa tu email para confirmarla — al volver, tu perfil ya estará listo para rellenar.');
      setSubmitting(false);
      return;
    }
    window.location.href = '/network/inicio';
  }

  return (
    <section id="registro" className="nw-reg" aria-labelledby="nw-reg-h">
      <div className="nw-reg-wrap">
        <div className="nw-reg-copy">
          <h2 id="nw-reg-h">Crea tu perfil. Es gratis.</h2>
          <p>Publica tu disponibilidad y experiencia. Los estudios te encuentran y te contactan — tú decides con quién hablar.</p>
        </div>

        <div className="nw-reg-card">
          <form onSubmit={handleSubmit} className="nw-reg-form">
            <div>
              <label htmlFor={`${uid}-nombre`}>Tu nombre</label>
              <input id={`${uid}-nombre`} required value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ana García" />
            </div>
            <div>
              <label htmlFor={`${uid}-email`}>Email</label>
              <input id={`${uid}-email`} type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" />
            </div>
            <div>
              <label htmlFor={`${uid}-pass`}>Contraseña</label>
              <input id={`${uid}-pass`} type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>

            {error && <p className="nw-reg-error">{error}</p>}
            {info && <p className="nw-reg-info">{info}</p>}

            {captcha}

            <button type="submit" disabled={submitting} className="nw-reg-boton">
              {submitting ? 'Un momento…' : 'Crear mi perfil'}
            </button>
          </form>

          <p className="nw-reg-login">
            ¿Ya tienes cuenta de Tentare? <a href="/login">Inicia sesión</a>
          </p>
        </div>
      </div>

      <style>{`
        .nw-reg { background: #0F0F0F; padding: clamp(64px,10vw,96px) clamp(20px,4vw,48px); }
        .nw-reg-wrap { max-width: 1040px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: clamp(32px,5vw,64px); align-items: center; }
        .nw-reg-copy h2 { font-size: clamp(28px,4vw,44px); font-weight: 800; line-height: 1.02; letter-spacing: -.04em; color: #fff; margin: 0 0 16px; max-width: 14ch; }
        .nw-reg-copy p { font-size: 15.5px; line-height: 1.6; color: rgba(255,255,255,.72); margin: 0; max-width: 44ch; }

        .nw-reg-card { background: #fff; border-radius: 20px; padding: 28px; box-shadow: 0 30px 60px -30px rgba(0,0,0,.5); }
        .nw-reg-form { display: flex; flex-direction: column; gap: 16px; }
        .nw-reg-form label { display: block; font-size: 13px; font-weight: 600; color: #3A3A34; margin-bottom: 6px; }
        .nw-reg-form input { width: 100%; padding: 10px 14px; border-radius: 12px; border: 1px solid #E7E7E0;
          font-size: 14px; color: #1A1A1A; }
        .nw-reg-form input::placeholder { color: #A8A89F; }
        .nw-reg-form input:focus { outline: none; border-color: ${NW}; box-shadow: 0 0 0 3px rgba(79,138,91,.15); }
        .nw-reg-error { font-size: 13px; color: #B3261E; background: rgba(179,38,30,.08); border-radius: 10px; padding: 8px 12px; margin: 0; }
        .nw-reg-info { font-size: 13px; color: #22251A; background: #F1F2EA; border-radius: 10px; padding: 8px 12px; margin: 0; }
        .nw-reg-boton { width: 100%; padding: 13px; border-radius: 999px; font-size: 14px; font-weight: 800; color: #fff;
          background: ${NW}; box-shadow: 0 10px 22px rgba(79,138,91,.28); transition: filter .2s, opacity .2s; }
        .nw-reg-boton:hover { filter: brightness(1.08); }
        .nw-reg-boton:disabled { opacity: .6; }
        .nw-reg-login { text-align: center; font-size: 12.5px; color: #A8A89F; margin: 18px 0 0; }
        .nw-reg-login a { font-weight: 600; color: #3A3A34; }
        .nw-reg-login a:hover { text-decoration: underline; }

        @media (max-width: 820px) {
          .nw-reg-wrap { grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  );
}
