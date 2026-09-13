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
  // ¿El fallo fue «no has confirmado tu email»? Ese caso NO es un error a
  // secas: tiene una salida concreta, y ofrecerla cierra el embudo que crea
  // cuentas duplicadas — ver `CodigoAuth`.
  const [sinConfirmar, setSinConfirmar] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [enlaceEnviado, setEnlaceEnviado] = useState(false);
  // Sale de `cargando` a propósito: `cargando` lo comparten entrar y pedir
  // enlace, y usarlo aquí apagaría los tres botones a la vez sin decir cuál
  // está trabajando.
  const [yendoAGoogle, setYendoAGoogle] = useState(false);
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
    setErr(e); setGlobal(''); setSinConfirmar(false);
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
    if ('error' in res) { setGlobal(res.error); setSinConfirmar(res.codigo === 'sin-confirmar'); return; }
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
   * Entrar con Google. Va A GOOGLE.
   *
   * ⚠️ Antes NO iba. Este botón empezaba por comprobar si había firma del
   * contrato en la pestaña y, si no la había, se desviaba a
   * `/acceso/registro?firma=1` en vez de llamar a `entrarConGoogle()`. Como la
   * firma vive en `sessionStorage` (lib/student/consentimiento.ts, y ahí a
   * propósito: es un trámite en curso, no una preferencia), en una pestaña
   * recién abierta NUNCA existe — así que el 100 % de los toques en «Continuar
   * con Google» aterrizaban en un formulario de Tentare pidiendo nombre,
   * teléfono y una casilla de privacidad. Verificado en el navegador: el clic
   * llevaba a `/acceso/registro?firma=1`, «Un paso antes», sin salir del
   * dominio ni una vez.
   *
   * El motivo por el que se puso era real: Google es a la vez «entrar» y «crear
   * cuenta» y no sabemos cuál será hasta que vuelve, y crear la ficha exige
   * consentimiento (`socios.aceptacion_origen` lleva un CHECK citando el art.
   * 7.1 del RGPD). Pero la conclusión estaba invertida: **el consentimiento
   * solo hace falta si vuelve siendo alguien SIN ficha**, y ese caso ya lo
   * resuelve `/acceso/verificar` a la vuelta — mira la sesión, ve que no hay
   * socia, y si además no hay firma manda ella misma a `?firma=1`
   * (acceso/verificar/page.tsx, rama `sin-firma`). Ese camino existía y estaba
   * escrito antes de este cambio.
   *
   * O sea que la puerta de antes no protegía nada que no estuviera ya
   * protegido: solo cobraba un formulario por adelantado a TODAS, incluidas las
   * socias que ya existen y para las que la firma nunca llega a usarse. Se
   * quita, y el consentimiento se pide únicamente a quien de verdad hay que
   * darle de alta.
   */
  const irAGoogle = () => {
    setGlobal('');
    // ⚠️ A dónde iba, guardado antes de salir. La vuelta de Google aterriza en
    // `/acceso/verificar` y esa pantalla no ve el `?next=` de esta, así que sin
    // esto una socia que llega a una clase concreta por un enlace acaba en la
    // home del portal y tiene que buscarla otra vez. Se guarda donde ya viven
    // los demás datos de trámite de esta pestaña.
    try { sessionStorage.setItem(`st_next_${slug}`, destino); } catch { /* modo privado: se pierde el destino, no el acceso */ }
    // El estado de carga ANTES de salir, no después: `signInWithOAuth` habla
    // con gotrue antes de redirigir y en móvil eso es más de un segundo de
    // pantalla quieta. Misma regla que ya obliga el captcha en `entrar()`.
    setYendoAGoogle(true);
    fijarRecordarSesion(recordar);
    void entrarConGoogle().then((res) => {
      // Solo se vuelve aquí si gotrue rechazó ANTES de redirigir; si todo va
      // bien, la pestaña ya se ha ido a Google.
      if ('error' in res) { setYendoAGoogle(false); setGlobal(res.error); }
    });
  };

  if (enlaceEnviado) {
    return (
      <div className="a-pop" style={{ textAlign: 'center' }}>
        <span aria-hidden style={{ width: 64, height: 64, margin: '0 auto', borderRadius: 999, background: 'var(--success)', color: '#fff', fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'apCheck .55s var(--ease-spring) both' }}>✓</span>
        <h2 className="t-h1" style={{ marginTop: 16 }}>Revisa tu correo</h2>
        <p className="t-meta" style={{ marginTop: 6, lineHeight: 1.5 }}>
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
        <h2 className="t-h1">Hola de nuevo</h2>
        <p className="t-meta" style={{ marginTop: 4 }}>Entra para reservar tu próxima clase.</p>
      </div>

      {global && (
        <div role="alert" className="note note--danger" data-testid="error-acceso">
          {global}
          {/* ⚠️ La SALIDA, no solo el diagnóstico. Quien no ha confirmado su
              email no puede entrar, y hasta ahora el mensaje terminaba ahí.
              Ese callejón tiene consecuencia: la salida natural es pulsar
              «Continuar con Google», y como gotrue solo vincula identidades
              cuando el email de la cuenta existente está confirmado, ahí nace
              una SEGUNDA cuenta.
              El enlace mágico resuelve las dos cosas de una vez: confirma la
              dirección y la deja dentro. Y no es un botón nuevo — es el que ya
              existía, ofrecido donde hace falta. */}
          {sinConfirmar && (
            <button
              type="button"
              onClick={() => void pedirEnlace()}
              disabled={cargando}
              data-testid="reenviar-confirmacion"
              style={{
                display: 'block', marginTop: 'var(--s-2)', background: 'none', border: 'none', padding: 0,
                color: 'inherit', font: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3,
                cursor: cargando ? 'progress' : 'pointer',
              }}
            >
              Mándame un enlace para entrar y confirmarlo
            </button>
          )}
        </div>
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
            style={{ width: 19, height: 19, flexShrink: 0, borderRadius: 6, border: 'none', background: recordar ? 'var(--accent)' : 'var(--card)', boxShadow: recordar ? 'none' : 'inset 0 0 0 1.5px var(--border-strong)', color: '#fff', fontSize: 'var(--t-meta)', fontWeight: 800, transition: 'all .2s' }}
          >
            {recordar ? '✓' : ''}
          </button>
          <span style={{ fontSize: 'var(--t-small)', color: 'var(--muted-foreground)' }}>Recordar sesión</span>
        </label>

        <Link href={href('/acceso/recuperar')} className="tap" style={{ fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)' }}>
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
        style={{ border: 'none', background: 'none', fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)', padding: '4px 0' }}
      >
        No tengo contraseña — mándame un enlace
      </button>

      {/* Separador antes de la vía de tercero. El diseño la pone en el
          registro; también aquí, porque quien se dio de alta con Google no
          tiene contraseña que escribir y su única puerta es esta. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0' }}>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span className="t-meta">o</span>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      <button
        type="button"
        onClick={irAGoogle}
        disabled={cargando || yendoAGoogle || !online}
        aria-busy={yendoAGoogle}
        data-testid="entrar-con-google"
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
        {yendoAGoogle ? 'Abriendo Google…' : 'Continuar con Google'}
      </button>

      <p className="t-meta" style={{ textAlign: 'center' }}>
        ¿Primera vez? <Link href={href('/acceso/registro')} className="tap" style={{ fontWeight: 800, color: 'var(--foreground)' }}>Crear cuenta</Link>
      </p>

      {captcha}
    </form>
  );
}
