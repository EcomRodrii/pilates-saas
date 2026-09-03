'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/student/ui/Input';
import { Button } from '@/components/student/ui/Button';
import { useAuthStudent } from '@/lib/student/auth';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useOnline } from '@/lib/student/useOnline';
import { guardarFirma } from '@/lib/student/consentimiento';
import { catalogo } from '@/lib/student/catalogo';
import { textoLegalCompleto } from '@/lib/legal-textos';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';

/**
 * Crear cuenta. Literal del paquete (`app/(auth)/registro/page.tsx`): mismos
 * campos, mismo medidor de fuerza de tres barras, mismo checkbox de política.
 *
 * Lo que cambia respecto al paquete es lo que pasa al pulsar. Aquí ocurren DOS
 * cosas que el diseño no podía saber que estaban separadas:
 *
 *  1. La IDENTIDAD (gotrue): `signUp` con email y contraseña.
 *  2. La FICHA DE SOCIA de este estudio, que necesita un JWT verificado y por
 *     tanto no puede crearse hasta que confirme el correo.
 *
 * Una persona puede tener cuenta y no ser socia de ESTE estudio, así que son
 * dos cosas de verdad, no un paso partido por gusto. La firma del contrato se
 * recoge aquí y la persiste `/acceso/verificar` en cuanto hay sesión.
 */
export default function RegistroPage() {
  const r = useRouter();
  const { estudio, slug } = useEstudio();
  const href = usePortalHref();
  const { online } = useOnline();
  const { registrarCuenta } = useAuthStudent(slug);
  const { widget: captcha, pedirToken } = useCaptcha();

  const [f, setF] = useState({ nombre: '', email: '', telefono: '', pass: '', acepto: false });
  const [err, setErr] = useState<Record<string, string>>({});
  const [global, setGlobal] = useState('');
  const [cargando, setCargando] = useState(false);

  // El texto legal del estudio, que es lo que se firma. Sale del payload
  // público (`studioPublico` lo incluye), no de una constante: cada estudio
  // tiene el suyo y lo que hay que guardar es el que estaba vigente hoy.
  const [textoLegal, setTextoLegal] = useState('');
  useEffect(() => {
    let vivo = true;
    void catalogo(slug).then((d) => {
      if (!vivo || !d?.studio) return;
      const s = d.studio as { politicaPrivacidad?: string; terminosServicio?: string };
      setTextoLegal(textoLegalCompleto({
        politicaPrivacidad: s.politicaPrivacidad ?? '',
        terminosServicio: s.terminosServicio ?? '',
      }));
    });
    return () => { vivo = false; };
  }, [slug]);

  const crear = async () => {
    const e: Record<string, string> = {};
    if (!f.nombre.trim()) e.nombre = 'Escribe tu nombre';
    if (!/.+@.+\..+/.test(f.email)) e.email = 'Escribe un email válido';
    if (f.pass.length < 8) e.pass = 'Mínimo 8 caracteres';
    if (!f.acepto) e.acepto = 'Necesitamos tu consentimiento';
    setErr(e); setGlobal('');
    if (Object.keys(e).length) return;

    setCargando(true);
    const token = await pedirToken();
    if (token === null) { setCargando(false); setGlobal(ERROR_CAPTCHA); return; }

    const res = await registrarCuenta(f.email, f.pass, token || undefined);
    if ('error' in res) { setCargando(false); setGlobal(res.error); return; }

    // La firma queda guardada para la pantalla de verificación, que es la que
    // ya tendrá sesión para persistirla. Se guarda DESPUÉS del alta correcta:
    // guardarla antes dejaría una firma huérfana si gotrue rechaza el email.
    guardarFirma(slug, {
      fecha: new Date().toISOString(),
      firma: f.nombre.trim(),
      versionTexto: textoLegal,
      telefono: f.telefono.trim() || undefined,
    });

    setCargando(false);
    r.push(`${href('/acceso/verificar')}?email=${encodeURIComponent(f.email)}`);
  };

  // Medidor de fuerza del paquete, sin cambios.
  const fuerza = f.pass.length === 0 ? 0 : f.pass.length < 8 ? 1 : /[A-Z]/.test(f.pass) && /\d/.test(f.pass) ? 3 : 2;

  return (
    <form onSubmit={(e) => { e.preventDefault(); void crear(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
      <div>
        <h2 className="t-h1" style={{ fontSize: 22 }}>Crea tu cuenta</h2>
        <p className="t-meta" style={{ marginTop: 4, fontSize: 12.5 }}>Para reservar en {estudio.nombre}. Un minuto.</p>
      </div>

      {global && (
        <p role="alert" style={{ margin: 0, background: 'var(--destructive-soft)', color: 'var(--destructive-foreground)', borderRadius: 12, padding: '10px 13px', fontSize: 12.5, fontWeight: 700 }}>
          {global}
        </p>
      )}

      <Input label="Nombre" autoComplete="given-name" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} error={err.nombre} />
      <Input label="Email" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={err.email} />
      <Input label="Teléfono" type="tel" autoComplete="tel" inputMode="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} hint="Para avisarte si se libera una plaza. Opcional." />

      <div>
        <Input label="Contraseña" type="password" autoComplete="new-password" value={f.pass} onChange={(e) => setF({ ...f, pass: e.target.value })} error={err.pass} />
        <div aria-hidden style={{ display: 'flex', gap: 4, marginTop: 8 }}>
          {[1, 2, 3].map((n) => (
            <span key={n} style={{ flex: 1, height: 4, borderRadius: 99, background: fuerza >= n ? (fuerza === 1 ? 'var(--warning)' : '#4F8A5B') : 'var(--muted)', transition: 'background .25s' }} />
          ))}
        </div>
      </div>

      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
        <button
          type="button" role="checkbox" aria-checked={f.acepto}
          aria-label={`Acepto la política de privacidad de ${estudio.nombre}`}
          onClick={() => setF({ ...f, acepto: !f.acepto })}
          style={{ width: 20, height: 20, flexShrink: 0, marginTop: 1, borderRadius: 6, border: 'none', background: f.acepto ? 'var(--accent)' : 'var(--card)', boxShadow: f.acepto ? 'none' : 'inset 0 0 0 1.5px var(--border-strong)', color: '#fff', fontSize: 12, fontWeight: 800, transition: 'all .2s' }}
        >
          {f.acepto ? '✓' : ''}
        </button>
        <span style={{ fontSize: 12, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
          Al inscribirme, acepto la{' '}
          <Link href="/legal/privacidad" target="_blank" style={{ color: 'var(--foreground)', fontWeight: 700, textDecoration: 'underline' }}>
            política de privacidad
          </Link>{' '}
          de {estudio.nombre}.
        </span>
      </label>
      {err.acepto && <p role="alert" className="field-error" style={{ marginTop: -6 }}>{err.acepto}</p>}

      <Button type="submit" full loading={cargando} disabled={!online} style={{ marginTop: 4 }}>
        {online ? 'Crear cuenta' : 'Sin conexión'}
      </Button>

      <p className="t-meta" style={{ textAlign: 'center', fontSize: 12.5 }}>
        ¿Ya tienes cuenta? <Link href={href('/acceso/login')} style={{ fontWeight: 800, color: 'var(--foreground)' }}>Entrar</Link>
      </p>

      {captcha}
    </form>
  );
}
