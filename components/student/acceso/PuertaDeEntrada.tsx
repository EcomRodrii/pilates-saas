'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/student/ui/Input';
import { Button } from '@/components/student/ui/Button';
import { Icono } from '@/components/student/ui/Icono';
import { OtpInput } from '@/components/auth/otp-input';
import { useOnline } from '@/lib/student/useOnline';
import { useAuthStudent } from '@/lib/student/auth';
import { usePortalHref, useEstudio } from '@/components/student/contexto';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { recuerdaSesion, fijarRecordarSesion } from '@/lib/db/portal-almacen-sesion';
import { useCodigoDelCorreo } from '@/lib/student/codigo-del-correo';
import { enmascararCorreo, mensajeCodigoFallido, MINUTOS_CADUCIDAD_CODIGO } from '@/lib/student/entrada-codigo';
import { formatearCuentaAtras, LONGITUD_OTP } from '@/lib/otp-utils';
import { useAppNativa } from '@/lib/nativo/use-app-nativa';
import { BotonApple } from '@/components/nativo/BotonApple';
import { LogoGoogle } from '@/components/nativo/BotonGoogle';
import { entrarConGoogleEnLaApp } from '@/lib/nativo/google';

/**
 * La puerta del estudio (P08): tu correo, un código de 6 cifras en casillas que
 * el iPhone rellena solo, y dentro. Igual que la entrada de la app Tentare
 * (`/app`), con la portada del estudio encima (acceso/layout.tsx).
 *
 * UNA puerta para entrar y para darse de alta: el código lo manda
 * `signInWithOtp`, que crea la cuenta si no existe. Con el código bueno se va a
 * `/acceso/verificar`, que es quien ya sabía decidir: si es alumna del estudio,
 * dentro; si es su instructora, a su parte; si es nueva, a «Tus datos»
 * (`/acceso/registro?firma=1`), que es el único sitio donde se recoge el
 * consentimiento. Así nada de lo que protegía el alta cambia de dueño.
 *
 * La contraseña sigue, como segunda opción: «Usar mi contraseña».
 */
type Fase = 'correo' | 'codigo' | 'contrasena';
const VACIO = Array<string>(LONGITUD_OTP).fill('');
const emailValido = (e: string) => /.+@.+\..+/.test(e.trim());

const enlace = {
  border: 'none', background: 'none', padding: '6px 0', fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)', cursor: 'pointer',
} as const;

export function PuertaDeEntrada({ titulo, subtitulo, destino }: {
  titulo: string;
  subtitulo: string;
  /** A dónde va tras entrar con contraseña, o tras el código si ya es alumna. Ya validado (ruta de ESTE estudio). */
  destino: string;
}) {
  const r = useRouter();
  const { online } = useOnline();
  const { slug } = useEstudio();
  const href = usePortalHref();
  const { loginConPassword, enviarEnlace, entrarConGoogle } = useAuthStudent(slug);
  const { widget: captcha, pedirToken } = useCaptcha();
  // Dentro de la app de iOS: Apple, y Google por el navegador seguro de iOS.
  const enApp = useAppNativa();

  const [fase, setFase] = useState<Fase>('correo');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [errEmail, setErrEmail] = useState('');
  const [errPass, setErrPass] = useState('');
  const [global, setGlobal] = useState('');
  // «No has confirmado tu email» al entrar con contraseña: tiene salida, el código.
  const [sinConfirmar, setSinConfirmar] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [yendoAGoogle, setYendoAGoogle] = useState(false);
  // Arranca con lo que eligió la última vez, no con un valor fijo.
  const [recordar, setRecordar] = useState(recuerdaSesion);
  // Las seis casillas. `intento` las vuelve a montar (y a enfocar la primera)
  // cuando un código falla.
  const [digitos, setDigitos] = useState<string[]>(VACIO);
  const [intento, setIntento] = useState(0);
  // A qué correo salió el último código. Volver a «Seguir» con el MISMO antes del
  // minuto no manda otro (gotrue lo rechazaría): vuelve a las casillas, porque el
  // código que tiene en el buzón sigue valiendo diez minutos.
  const enviadoA = useRef<string | null>(null);

  /** Lo deja `/acceso/verificar` al aterrizar: a dónde iba antes de que le pidieran entrar. */
  const guardarDestino = () => {
    try { sessionStorage.setItem(`st_next_${slug}`, destino); } catch { /* modo privado: se pierde el destino, no el acceso */ }
  };

  /** Manda el código. Si el email no tiene cuenta, gotrue la crea y el correo trae el mismo código. */
  const mandarCodigo = useCallback(async (): Promise<{ ok: true } | { error: string; esperaS?: number }> => {
    const token = await pedirToken();
    if (token === null) return { error: ERROR_CAPTCHA };
    return enviarEnlace(email, token || undefined);
  }, [email, pedirToken, enviarEnlace]);

  const alFallar = useCallback(() => { setDigitos(VACIO); setIntento((i) => i + 1); }, []);
  const codigo = useCodigoDelCorreo(email, mandarCodigo, () => {
    guardarDestino();
    // `via=codigo` solo pinta la tira «Correo · Código · Tus datos» si resulta
    // que es nueva; la decisión sigue siendo de `/acceso/verificar`.
    r.replace(`${href('/acceso/verificar')}?via=codigo`);
  }, { alFallar, reenviarSiCaduca: true });

  const seguir = async () => {
    if (!emailValido(email)) { setErrEmail('Escribe un email válido'); return; }
    setErrEmail(''); setGlobal(''); setSinConfirmar(false);
    fijarRecordarSesion(recordar);
    const destinatario = email.trim().toLowerCase();
    const aCasillas = () => { enviadoA.current = destinatario; setDigitos(VACIO); setFase('codigo'); };
    if (enviadoA.current === destinatario && codigo.espera > 0) { aCasillas(); return; }
    // El estado de carga ANTES de pedir el token: Turnstile tarda segundos y la
    // pantalla no puede quedarse quieta ni dejar pulsar dos veces.
    setCargando(true);
    const res = await mandarCodigo();
    setCargando(false);
    if ('error' in res) {
      // A esa dirección le salió uno hace menos de un minuto (otra pestaña, o
      // volvió atrás y adelante): ese es el que vale.
      if (res.esperaS) { codigo.anotarEnvio(res.esperaS); aCasillas(); return; }
      setGlobal(res.error);
      return;
    }
    codigo.anotarEnvio();
    aCasillas();
  };

  const entrarConContrasena = async () => {
    const eEmail = emailValido(email) ? '' : 'Escribe un email válido';
    const ePass = pass ? '' : 'Escribe tu contraseña';
    setErrEmail(eEmail); setErrPass(ePass); setGlobal(''); setSinConfirmar(false);
    if (eEmail || ePass) return;
    setCargando(true);
    const token = await pedirToken();
    if (token === null) { setCargando(false); setGlobal(ERROR_CAPTCHA); return; }
    // ⚠️ ANTES de autenticar: así el token se escribe ya en el almacén que toca.
    fijarRecordarSesion(recordar);
    const res = await loginConPassword(email, pass, token || undefined);
    setCargando(false);
    if ('error' in res) { setGlobal(res.error); setSinConfirmar(res.codigo === 'sin-confirmar'); return; }
    r.push(destino);
  };

  // Google es a la vez «entrar» y «darse de alta»: el consentimiento se pide a
  // la vuelta y solo a quien no tiene ficha (`/acceso/verificar`, rama sin-firma).
  const irAGoogle = () => {
    setGlobal('');
    guardarDestino();
    setYendoAGoogle(true);
    fijarRecordarSesion(recordar);
    if (enApp) {
      void entrarConGoogleEnLaApp().then((res) => {
        setYendoAGoogle(false);
        if ('ok' in res) r.replace(href('/acceso/verificar'));
        else if ('error' in res) setGlobal(res.error);
      });
      return;
    }
    void entrarConGoogle().then((res) => {
      // Solo se vuelve aquí si gotrue rechazó ANTES de redirigir.
      if ('error' in res) { setYendoAGoogle(false); setGlobal(res.error); }
    });
  };

  const casillaRecordar = (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      {/* No «activa» la persistencia (ya persistía): decide si la sesión MUERE
          al cerrar el navegador, para el móvil prestado o la tablet del estudio. */}
      <button
        type="button" role="checkbox" aria-checked={recordar}
        aria-label="Recordar inicio de sesión en este dispositivo"
        onClick={() => setRecordar((v) => !v)}
        style={{ width: 19, height: 19, flexShrink: 0, borderRadius: 6, border: 'none', background: recordar ? 'var(--accent)' : 'var(--card)', boxShadow: recordar ? 'none' : 'inset 0 0 0 1.5px var(--border-strong)', color: 'var(--accent-foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, transition: 'all .2s' }}
      >
        {recordar && <Icono nombre="hecho" tamano={16} grosor={2} />}
      </button>
      <span style={{ fontSize: 'var(--t-small)', color: 'var(--muted-foreground)' }}>Recordar sesión</span>
    </label>
  );

  const aviso = global && (
    <div role="alert" className="note note--danger" data-testid="error-acceso">
      {global}
      {/* La SALIDA, no solo el diagnóstico: quien no ha confirmado su email no
          puede entrar con contraseña, y el código lo confirma y la deja dentro. */}
      {sinConfirmar && (
        <button
          type="button" onClick={() => void seguir()} disabled={cargando} data-testid="reenviar-confirmacion"
          style={{ display: 'block', marginTop: 'var(--s-2)', background: 'none', border: 'none', padding: 0, color: 'inherit', font: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3, cursor: cargando ? 'progress' : 'pointer' }}
        >
          Mándame un código para entrar y confirmarlo
        </button>
      )}
    </div>
  );

  const mensajeCodigo = codigo.fallo ? (mensajeCodigoFallido(codigo.fallo) ?? codigo.error) : codigo.error;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {fase === 'correo' && (
        <form onSubmit={(e) => { e.preventDefault(); void seguir(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
          <div>
            <h2 className="t-h1">{titulo}</h2>
            <p className="t-meta" style={{ marginTop: 4, lineHeight: 1.5 }}>{subtitulo}</p>
          </div>
          {aviso}
          <Input
            label="Tu correo" type="email" autoComplete="username email" inputMode="email" autoCapitalize="none"
            value={email} onChange={(e) => setEmail(e.target.value)} error={errEmail}
          />
          {casillaRecordar}
          <Button type="submit" full loading={cargando} disabled={!online}>{online ? 'Seguir' : 'Sin conexión'}</Button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0' }}>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span className="t-meta">o</span>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Apple solo en la app de iOS (el botón no se pinta fuera). */}
          <BotonApple disabled={cargando} onEntrado={() => { guardarDestino(); r.replace(href('/acceso/verificar')); }} onError={setGlobal} />
          <button
            type="button" onClick={irAGoogle} disabled={cargando || yendoAGoogle || !online}
            aria-busy={yendoAGoogle} data-testid="entrar-con-google" className="btn btn--secondary" style={{ width: '100%', gap: 8 }}
          >
            <LogoGoogle />
            {yendoAGoogle ? 'Abriendo Google…' : 'Continuar con Google'}
          </button>

          <button type="button" onClick={() => { setGlobal(''); setFase('contrasena'); }} style={{ ...enlace, color: 'var(--muted-foreground)' }}>
            Usar mi contraseña
          </button>
        </form>
      )}

      {fase === 'codigo' && (
        <form onSubmit={(e) => { e.preventDefault(); void codigo.verificar(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
          <button type="button" onClick={() => { setGlobal(''); setFase('correo'); }} style={{ ...enlace, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 2 }}>
            <Icono nombre="chevron-izquierda" tamano={16} /> Cambiar correo
          </button>
          <div>
            <h2 className="t-h1">Mira tu correo</h2>
            <p className="t-meta" style={{ marginTop: 6, lineHeight: 1.5 }}>
              Te hemos mandado un código a <b style={{ color: 'var(--foreground)', overflowWrap: 'anywhere' }}>{enmascararCorreo(email)}</b>.
              {' '}Caduca en {MINUTOS_CADUCIDAD_CODIGO} minutos. Mira también en spam.
            </p>
          </div>

          <OtpInput
            key={intento}
            apariencia="app"
            testIdPrimera="codigo-correo"
            valor={digitos}
            onCambiar={(d) => { setDigitos(d); codigo.escribir(d.join('')); }}
            disabled={codigo.verificando}
            error={!!mensajeCodigo}
            autoFocus
          />
          {codigo.verificando && <p className="t-meta" role="status" style={{ textAlign: 'center' }}>Comprobando…</p>}
          {mensajeCodigo && <p role="alert" className="field-error" data-testid="error-codigo" style={{ margin: 0, textAlign: 'center' }}>{mensajeCodigo}</p>}

          <p className="t-meta" style={{ textAlign: 'center', margin: 0 }}>
            {codigo.espera > 0 ? (
              <span data-testid="reenviar-espera">
                {codigo.reenviado
                  ? `Te hemos mandado otro. Podrás pedir uno más en ${formatearCuentaAtras(codigo.espera)}`
                  : `No me ha llegado · reenviar en ${formatearCuentaAtras(codigo.espera)}`}
              </span>
            ) : (
              <button
                type="button" onClick={() => void codigo.pedirOtro()} disabled={codigo.reenviando} aria-busy={codigo.reenviando}
                style={{ ...enlace, padding: 0, cursor: codigo.reenviando ? 'progress' : 'pointer' }}
              >
                {codigo.reenviando ? 'Enviando…' : 'No me ha llegado: reenviar'}
              </button>
            )}
          </p>
          <button type="button" onClick={() => { setGlobal(''); setFase('contrasena'); }} style={{ ...enlace, color: 'var(--muted-foreground)' }}>
            Usar mi contraseña
          </button>
        </form>
      )}

      {fase === 'contrasena' && (
        <form onSubmit={(e) => { e.preventDefault(); void entrarConContrasena(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
          <button type="button" onClick={() => { setGlobal(''); setFase('correo'); }} style={{ ...enlace, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 2 }}>
            <Icono nombre="chevron-izquierda" tamano={16} /> Volver
          </button>
          <h2 className="t-h1">Entra con tu contraseña</h2>
          {aviso}
          <Input
            label="Email" type="email" autoComplete="username email" inputMode="email" autoCapitalize="none"
            value={email} onChange={(e) => setEmail(e.target.value)} error={errEmail}
          />
          <Input label="Contraseña" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} error={errPass} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: -4 }}>
            {casillaRecordar}
            <Link href={href('/acceso/recuperar')} className="tap" style={{ fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)' }}>
              ¿Has olvidado la contraseña?
            </Link>
          </div>
          <Button type="submit" full loading={cargando} disabled={!online}>{online ? 'Entrar' : 'Sin conexión'}</Button>
          <button type="button" onClick={() => void seguir()} disabled={cargando || !online} style={enlace}>
            Entrar con un código
          </button>
        </form>
      )}

      {/* Un solo widget para las tres fases: remontarlo al cambiar de fase lo
          dejaba sin token (components/auth/turnstile-widget.tsx). */}
      {captcha}
    </div>
  );
}
