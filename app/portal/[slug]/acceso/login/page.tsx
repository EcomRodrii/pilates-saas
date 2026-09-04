'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/student/ui/Input';
import { Button } from '@/components/student/ui/Button';
import { useOnline } from '@/lib/student/useOnline';
import { useAuthStudent } from '@/lib/student/auth';
import { usePortalHref, useEstudio } from '@/components/student/contexto';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { leerFirma } from '@/lib/student/consentimiento';
import { recuerdaSesion, fijarRecordarSesion } from '@/lib/db/portal-almacen-sesion';

/**
 * Entrar. Literal del paquete (`app/(auth)/login/page.tsx`) con el backend real
 * enchufado donde el paquete tenía un `setTimeout` de demostración.
 *
 * Dos caminos, como el diseño: contraseña y —para quien nunca se puso una—
 * enlace por correo. El segundo no estaba en el paquete pero SÍ en el producto,
 * y sin él una alumna que llegue de un magic link antiguo no tiene entrada.
 */
export default function LoginPage() {
  const r = useRouter();
  const params = useSearchParams();
  const { online } = useOnline();
  const { slug } = useEstudio();
  const href = usePortalHref();
  const { loginConPassword, enviarEnlace, entrarConGoogle } = useAuthStudent(slug);
  const { widget: captcha, pedirToken } = useCaptcha();

  const [f, setF] = useState({ email: '', pass: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const [global, setGlobal] = useState('');
  const [cargando, setCargando] = useState(false);
  const [enlaceEnviado, setEnlaceEnviado] = useState(false);
  // Arranca con lo que ya eligió la última vez, no con un valor fijo.
  const [recordar, setRecordar] = useState(recuerdaSesion);

  // `?next=` conserva a dónde iba la alumna antes de que le pidieran entrar.
  // Se valida que sea una ruta de ESTE estudio: sin eso, un `?next=` externo
  // convierte la pantalla de acceso en un redirector abierto.
  const destino = (() => {
    const n = params.get('next');
    return n && n.startsWith(href() + '/') ? n : href();
  })();

  const entrar = async () => {
    const e: Record<string, string> = {};
    if (!/.+@.+\..+/.test(f.email)) e.email = 'Escribe un email válido';
    if (!f.pass) e.pass = 'Escribe tu contraseña';
    setErr(e); setGlobal('');
    if (Object.keys(e).length) return;

    setCargando(true);
    // El token se pide AL ENVIAR, no al montar: Turnstile tarda ~3,5 s y su
    // contrato está invertido (components/auth/turnstile-widget.tsx).
    const token = await pedirToken();
    if (token === null) { setCargando(false); setGlobal(ERROR_CAPTCHA); return; }

    // ⚠️ ANTES de autenticar: así el token que emita Supabase se escribe ya en
    // el almacén que toca, y no hay que mudarlo después.
    fijarRecordarSesion(recordar);
    const res = await loginConPassword(f.email, f.pass, token || undefined);
    setCargando(false);
    if ('error' in res) { setGlobal(res.error); return; }
    r.push(destino);
  };

  const pedirEnlace = async () => {
    if (!/.+@.+\..+/.test(f.email)) { setErr({ email: 'Escribe tu email y te mandamos el enlace' }); return; }
    setErr({}); setGlobal(''); setCargando(true);
    const token = await pedirToken();
    if (token === null) { setCargando(false); setGlobal(ERROR_CAPTCHA); return; }
    fijarRecordarSesion(recordar);
    const res = await enviarEnlace(f.email, token || undefined);
    setCargando(false);
    if ('error' in res) { setGlobal(res.error); return; }
    setEnlaceEnviado(true);
  };

  /**
   * Entrar con Google, pero NO antes de tener la firma.
   *
   * Google es a la vez «entrar» y «crear cuenta», y desde aquí no hay forma de
   * saber cuál de las dos será: no sabemos su email hasta que vuelve. Si vuelve
   * siendo alguien sin ficha en este estudio, hace falta consentimiento para
   * crearla — `socios.aceptacion_origen` tiene un CHECK citando el art. 7.1 del
   * RGPD— y pedirlo DESPUÉS significa pedírselo a alguien que ya tiene sesión y
   * ninguna ficha, que es el peor sitio donde dejar a nadie.
   *
   * Así que se recoge antes de salir, y en la pantalla que ya sabe recogerla:
   * `/acceso/registro?firma=1`. Si ya hay firma en esta pestaña —porque viene
   * de ahí, o porque ya lo intentó— se va derecha a Google sin repetirla.
   *
   * Para una socia que ya existe la firma sobra: `verificar` ve que es socia y
   * entra sin llegar a usarla. Es el precio de no poder distinguir los dos casos
   * hasta después, y se paga una vez por pestaña, no en cada entrada.
   */
  const irAGoogle = () => {
    setGlobal('');
    fijarRecordarSesion(recordar);
    if (!leerFirma(slug)) { r.push(`${href('/acceso/registro')}?firma=1`); return; }
    void entrarConGoogle().then((res) => { if ('error' in res) setGlobal(res.error); });
  };

  if (enlaceEnviado) {
    return (
      <div className="a-pop" style={{ textAlign: 'center' }}>
        <span aria-hidden style={{ width: 64, height: 64, margin: '0 auto', borderRadius: 999, background: '#4F8A5B', color: '#fff', fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'apCheck .55s var(--ease-spring) both' }}>✓</span>
        <h2 className="t-h1" style={{ fontSize: 22, marginTop: 16 }}>Revisa tu correo</h2>
        <p className="t-meta" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
          Si <b>{f.email}</b> está registrado, te hemos enviado un enlace para entrar. Ábrelo en este mismo móvil.
        </p>
        <button type="button" onClick={() => setEnlaceEnviado(false)} className="btn btn--secondary" style={{ marginTop: 18 }}>
          Volver
        </button>
        {captcha}
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void entrar(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
      <div>
        <h2 className="t-h1" style={{ fontSize: 22 }}>Hola de nuevo</h2>
        <p className="t-meta" style={{ marginTop: 4, fontSize: 12.5 }}>Entra para reservar tu próxima clase.</p>
      </div>

      {global && (
        <p role="alert" style={{ margin: 0, background: 'var(--destructive-soft)', color: 'var(--destructive-foreground)', borderRadius: 12, padding: '10px 13px', fontSize: 12.5, fontWeight: 700 }}>
          {global}
        </p>
      )}

      <Input label="Email" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={err.email} />
      <Input label="Contraseña" type="password" autoComplete="current-password" value={f.pass} onChange={(e) => setF({ ...f, pass: e.target.value })} error={err.pass} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: -4 }}>
        {/* ⚠️ Este control NO «activa» la persistencia: la sesión ya persistía
            siempre (auth-js usa localStorage cuando `persistSession` es true y
            no se le pasa `storage`). Lo que decide es si debe MORIR al cerrar
            el navegador — el caso del móvil prestado o la tablet del estudio.
            Marcado por defecto, que es como se comportaba hasta ahora. */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <button
            type="button" role="checkbox" aria-checked={recordar}
            aria-label="Recordar inicio de sesión en este dispositivo"
            onClick={() => setRecordar((v) => !v)}
            style={{ width: 19, height: 19, flexShrink: 0, borderRadius: 6, border: 'none', background: recordar ? 'var(--accent)' : 'var(--card)', boxShadow: recordar ? 'none' : 'inset 0 0 0 1.5px var(--border-strong)', color: '#fff', fontSize: 11.5, fontWeight: 800, transition: 'all .2s' }}
          >
            {recordar ? '✓' : ''}
          </button>
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Recordar sesión</span>
        </label>

        <Link href={href('/acceso/recuperar')} style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)' }}>
          ¿Has olvidado la contraseña?
        </Link>
      </div>

      <Button type="submit" full loading={cargando} disabled={!online} style={{ marginTop: 4 }}>
        {online ? 'Entrar' : 'Sin conexión'}
      </Button>

      {/* La segunda puerta: quien entró alguna vez por enlace y nunca eligió
          contraseña no tiene ninguna que escribir arriba. */}
      <button
        type="button"
        onClick={() => void pedirEnlace()}
        disabled={cargando || !online}
        style={{ border: 'none', background: 'none', fontSize: 12.5, fontWeight: 800, color: 'var(--accent)', padding: '4px 0' }}
      >
        No tengo contraseña — mándame un enlace
      </button>

      {/* Separador antes de la vía de tercero. El diseño la pone en el
          registro; también aquí, porque quien se dio de alta con Google no
          tiene contraseña que escribir y su única puerta es esta. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0' }}>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span className="t-meta" style={{ fontSize: 11 }}>o</span>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      <button
        type="button"
        onClick={irAGoogle}
        disabled={cargando || !online}
        className="btn btn--secondary"
        style={{ width: '100%', gap: 8 }}
      >
        {/* Marca de Google en SVG en línea: el CSP del proyecto no admite
            imágenes de terceros y un PNG local se ve mal en pantallas densas. */}
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden focusable="false">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.8-6.8C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v8.3h12.6c-.3 2.1-1.6 5.2-4.6 7.3l7.7 6c4.5-4.2 6.4-10.1 6.4-17.5z" />
          <path fill="#FBBC05" d="M10.5 28.6A14.6 14.6 0 0 1 9.7 24c0-1.6.3-3.2.8-4.6l-7.9-6.2A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.2z" />
          <path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.7-5.9l-7.7-6c-2.1 1.4-4.8 2.4-8 2.4-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z" />
        </svg>
        Continuar con Google
      </button>

      <p className="t-meta" style={{ textAlign: 'center', fontSize: 12.5 }}>
        ¿Primera vez? <Link href={href('/acceso/registro')} style={{ fontWeight: 800, color: 'var(--foreground)' }}>Crear cuenta</Link>
      </p>

      {captcha}
    </form>
  );
}
