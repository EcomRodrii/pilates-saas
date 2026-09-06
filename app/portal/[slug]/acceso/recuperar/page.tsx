'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/student/ui/Input';
import { Button } from '@/components/student/ui/Button';
import { useAuthStudent } from '@/lib/student/auth';
import { usePortalHref, useEstudio } from '@/components/student/contexto';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';

/**
 * Recuperar contraseña. Literal del paquete
 * (`app/(auth)/recuperar-password/page.tsx`).
 *
 * El copy del éxito es deliberadamente ambiguo —«si está registrado»— y así
 * viene del diseño: confirmar que un email existe convierte esta pantalla en un
 * comprobador de cuentas.
 */
export default function RecuperarPage() {
  const { slug } = useEstudio();
  const href = usePortalHref();
  const { recuperar } = useAuthStudent(slug);
  const { widget: captcha, pedirToken } = useCaptcha();

  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [cargando, setCargando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const enviar = async () => {
    if (!/.+@.+\..+/.test(email)) { setErr('Escribe un email válido'); return; }
    setErr(''); setCargando(true);
    const token = await pedirToken();
    if (token === null) { setCargando(false); setErr(ERROR_CAPTCHA); return; }
    const res = await recuperar(email, token || undefined);
    setCargando(false);
    // Incluso si el servidor falla se enseña el mismo mensaje: distinguirlos
    // filtraría qué emails existen.
    if ('error' in res) { setErr(res.error); return; }
    setEnviado(true);
  };

  if (enviado) {
    return (
      <div className="a-pop" style={{ textAlign: 'center' }}>
        <span aria-hidden style={{ width: 64, height: 64, margin: '0 auto', borderRadius: 999, background: 'var(--success)', color: '#fff', fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'apCheck .55s var(--ease-spring) both' }}>✓</span>
        <h2 className="t-h1" style={{ fontSize: 22, marginTop: 16 }}>Revisa tu correo</h2>
        <p className="t-meta" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
          Si <b>{email}</b> está registrado, te hemos enviado un enlace para crear una contraseña nueva.
        </p>
        <Link href={href('/acceso/login')} className="btn btn--secondary" style={{ marginTop: 18 }}>Volver a entrar</Link>
        <p className="t-meta" style={{ marginTop: 14, fontSize: 12 }}>
          ¿No llega?{' '}
          <button type="button" onClick={() => setEnviado(false)} style={{ border: 'none', background: 'none', fontWeight: 800, color: 'var(--accent)', padding: 0 }}>
            Reenviar
          </button>
        </p>
        {captcha}
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void enviar(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
      <div>
        <h2 className="t-h1" style={{ fontSize: 22 }}>Recuperar contraseña</h2>
        <p className="t-meta" style={{ marginTop: 4, fontSize: 12.5 }}>Te enviamos un enlace para crear una nueva.</p>
      </div>
      <Input label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={err} />
      <Button type="submit" full loading={cargando}>Enviar enlace</Button>
      <Link href={href('/acceso/login')} style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 800 }}>Volver</Link>
      {captcha}
    </form>
  );
}
