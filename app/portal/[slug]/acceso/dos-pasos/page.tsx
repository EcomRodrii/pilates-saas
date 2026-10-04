'use client';

// El segundo paso de la verificación en dos pasos en la app del estudio (4-oct-
// 2026, decisión del fundador: opcional, la activa cada alumna en su perfil).
// Solo llega aquí quien la tiene activada: las guardias de la app, `/acceso/
// verificar`, `/reservar` y el widget la mandan con `?next=` cuando a su sesión
// le falta el paso. Quien no la tiene activada no ve nunca esta pantalla.
//
// Igual que el panel (app/verificar-acceso): por defecto un código al CORREO de
// la cuenta, con la marca del estudio; la app de autenticación para «No tengo
// acceso a mi correo», y siempre si entró sin contraseña (con un enlace, un
// código o Google el correo sería el mismo factor dos veces: lo decide el
// servidor). «No volver a pedirlo en este dispositivo», desmarcado por defecto.
// `?codigo=1` va directo a la app: lo usa Perfil → Seguridad para desactivarla,
// que exige el código de verdad.
//
// La cerradura es el servidor (`pasoDeLaSesion`, lib/auth-server.ts). Al
// terminar se recarga la app entera: lo que hubiera en memoria era de una
// sesión sin datos.
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { Input } from '@/components/student/ui/Input';
import { Button } from '@/components/student/ui/Button';
import { Icono } from '@/components/student/ui/Icono';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { useAuthStudent } from '@/lib/student/auth';
import { destinoTrasDosPasos } from '@/lib/student/doble-factor-portal-reglas';
import {
  confiarDispositivo, enviarCodigoCorreo, reabrirCorreo, recordarDispositivo, verificarCodigoCorreo,
} from '@/lib/auth/doble-factor-acciones';
import { verificarCodigoApp } from '@/lib/auth/codigo-app';
import { DIAS_DISPOSITIVO_CONFIANZA } from '@/lib/auth/dispositivo-confianza-reglas';
import { MINUTOS_CODIGO_CORREO } from '@/lib/auth/codigo-correo-reglas';

type Estado = { tipo: 'cargando' } | { tipo: 'sin-sesion' } | { tipo: 'listo'; email: string | null };
type Correo = { tipo: 'enviando' } | { tipo: 'enviado'; reenviarDesde: number } | { tipo: 'no-disponible'; mensaje: string };

async function tokenActual(): Promise<string | null> {
  const { data: { session } } = await supabasePortal.auth.getSession();
  return session?.access_token ?? null;
}

function DosPasos() {
  const { slug, estudio } = useEstudio();
  const href = usePortalHref();
  const sp = useSearchParams();
  const { logout } = useAuthStudent(slug);
  const pideLaApp = sp.get('codigo') === '1';

  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });
  const [metodo, setMetodo] = useState<'correo' | 'app'>(pideLaApp ? 'app' : 'correo');
  const [correo, setCorreo] = useState<Correo>({ tipo: 'enviando' });
  const [codigo, setCodigo] = useState('');
  const [recordar, setRecordar] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());

  const irDentro = useCallback(() => {
    // Recarga entera, a donde iba (solo rutas de este estudio o su página de reservas).
    window.location.assign(destinoTrasDosPasos(new URLSearchParams(window.location.search).get('next'), slug));
  }, [slug]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const { data: { session } } = await supabasePortal.auth.getSession();
      if (!vivo) return;
      if (!session) { setEstado({ tipo: 'sin-sesion' }); return; }
      // Con el token: los factores salen del servidor y no de la sesión guardada.
      // Si la activó en otro móvil, la de este no lo sabe, y el servidor sí la
      // corta: con la copia local se iría dentro y volvería aquí, en bucle.
      // Si no se puede leer, NUNCA la copia local: es justo la que puede estar
      // vieja, y entrar a ciegas sería ese bucle. Se pide el código; si en
      // realidad no tiene la verificación, el servidor lo dice al mandarlo.
      let aal: { currentLevel: string | null; nextLevel: string | null } | null = null;
      try { aal = (await supabasePortal.auth.mfa.getAuthenticatorAssuranceLevel(session.access_token)).data; } catch { aal = null; }
      if (!vivo) return;
      // Nada que pedir: no la tiene activada, o esta sesión ya la pasó.
      if (aal && (aal.nextLevel !== 'aal2' || aal.currentLevel === 'aal2')) { irDentro(); return; }
      // Dispositivo recordado (o sesión ya confiada por el correo): dentro sin
      // escribir nada. Con `?codigo=1` no: se viene a por el código de verdad.
      if (!pideLaApp && await confiarDispositivo(session.access_token) !== 'no') { irDentro(); return; }
      if (vivo) setEstado({ tipo: 'listo', email: session.user.email ?? null });
    })();
    return () => { vivo = false; };
  }, [irDentro, pideLaApp]);

  const pedirCorreo = useCallback(async (reenviar: boolean) => {
    setCorreo({ tipo: 'enviando' }); setError(null);
    const token = await tokenActual();
    const r = token ? await enviarCodigoCorreo(token, reenviar, slug) : { tipo: 'error' as const, mensaje: 'Tu sesión ha caducado. Vuelve a entrar.' };
    if (r.tipo === 'enviado') { const t = Date.now(); setAhora(t); setCorreo({ tipo: 'enviado', reenviarDesde: t + r.esperaSegundos * 1000 }); return; }
    if (r.tipo === 'error') { setCorreo({ tipo: 'enviado', reenviarDesde: Date.now() }); setError(r.mensaje); return; }
    // El correo no vale en esta sesión (entró sin contraseña, cambió la
    // contraseña hace poco…): a la app, diciendo por qué.
    setCorreo({ tipo: 'no-disponible', mensaje: r.mensaje });
    setMetodo('app');
  }, [slug]);

  // Al llegar, el correo sale solo (el servidor no manda otro si hay uno vivo).
  const correoPedido = useRef(false);
  useEffect(() => {
    if (estado.tipo !== 'listo' || metodo !== 'correo' || correoPedido.current) return;
    correoPedido.current = true;
    void pedirCorreo(false);
  }, [estado.tipo, metodo, pedirCorreo]);

  const esperandoReenvio = correo.tipo === 'enviado' && correo.reenviarDesde > ahora;
  useEffect(() => {
    if (!esperandoReenvio) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [esperandoReenvio]);

  const verificar = async () => {
    if (codigo.length !== 6 || trabajando) return;
    setTrabajando(true); setError(null);
    try {
      if (metodo === 'correo') {
        const token = await tokenActual();
        if (!token) { setError('Tu sesión ha caducado. Vuelve a entrar.'); return; }
        const r = await verificarCodigoCorreo(token, codigo, recordar);
        if (r.ok) { irDentro(); return; }
        setCodigo('');
        if (r.aLaApp) { setCorreo({ tipo: 'no-disponible', mensaje: r.mensaje }); setMetodo('app'); return; }
        setError(r.mensaje);
        return;
      }
      const r = await verificarCodigoApp(supabasePortal.auth, codigo);
      if (!r.ok) { setError(r.mensaje); setCodigo(''); return; }
      // Con la sesión ya en `aal2`: recordar el dispositivo si lo pidió, y
      // reabrir el correo si un cambio de contraseña lo había cerrado. Si algo
      // de esto falla, solo significa que la próxima vez lo volverá a pedir.
      const token = await tokenActual();
      if (token) await Promise.all([recordar ? recordarDispositivo(token) : null, reabrirCorreo(token)]);
      irDentro();
    } finally {
      setTrabajando(false);
    }
  };

  const salir = async () => {
    await logout();
    window.location.assign(href('/acceso/login'));
  };

  if (estado.tipo === 'cargando') {
    return <p className="t-meta" aria-busy="true">Comprobando tu sesión…</p>;
  }
  if (estado.tipo === 'sin-sesion') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 className="t-h1">Vuelve a entrar</h2>
        <p className="t-meta">Tu sesión ha terminado. Entra con tu cuenta para continuar.</p>
        <Link href={href('/acceso/login')} className="btn btn--primary">Entrar</Link>
      </div>
    );
  }

  const segundos = correo.tipo === 'enviado' ? Math.max(0, Math.ceil((correo.reenviarDesde - ahora) / 1000)) : 0;
  const puedeVolverAlCorreo = !pideLaApp && correo.tipo !== 'no-disponible';

  return (
    <form onSubmit={(e) => { e.preventDefault(); void verificar(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }} noValidate>
      <div>
        <h2 className="t-h1">Verificación en dos pasos</h2>
        <p className="t-meta" style={{ marginTop: 4, lineHeight: 1.5 }} aria-live="polite">
          {metodo === 'correo'
            ? correo.tipo === 'enviando'
              ? 'Enviándote un código a tu correo…'
              : <>Te hemos enviado un código de 6 dígitos a <b style={{ overflowWrap: 'anywhere' }}>{estado.email ?? 'tu correo'}</b>. Caduca en {MINUTOS_CODIGO_CORREO} minutos.</>
            : <>Abre tu app de autenticación y escribe el código de <b>{estudio.nombre}</b>.</>}
        </p>
      </div>

      {metodo === 'app' && correo.tipo === 'no-disponible' && (
        <p className="note" data-testid="motivo-app">{correo.mensaje}</p>
      )}

      <Input
        label="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus
        value={codigo} onChange={(e) => { setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
        error={error ?? undefined}
        style={{ letterSpacing: '.3em', fontVariantNumeric: 'tabular-nums' }}
      />

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
        <button
          type="button" role="checkbox" aria-checked={recordar}
          aria-label="No volver a pedirlo en este dispositivo"
          onClick={() => setRecordar((v) => !v)}
          style={{ width: 19, height: 19, flexShrink: 0, marginTop: 1, borderRadius: 6, border: 'none', background: recordar ? 'var(--accent)' : 'var(--card)', boxShadow: recordar ? 'none' : 'inset 0 0 0 1.5px var(--border-strong)', color: 'var(--accent-foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, transition: 'all .2s' }}
        >
          {recordar && <Icono nombre="hecho" tamano={16} grosor={2} />}
        </button>
        <span style={{ fontSize: 'var(--t-small)', color: 'var(--foreground)' }}>
          No volver a pedirlo en este dispositivo
          <span className="t-meta" style={{ display: 'block' }}>
            Durante {DIAS_DISPOSITIVO_CONFIANZA} días desde la última vez que entres. Márcalo solo en un móvil que uses únicamente tú.
          </span>
        </span>
      </label>

      <Button type="submit" full loading={trabajando} disabled={codigo.length !== 6}>Verificar</Button>

      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, fontSize: 'var(--t-small)' }}>
        {metodo === 'correo' ? (
          <>
            <button
              type="button" onClick={() => void pedirCorreo(true)} disabled={correo.tipo !== 'enviado' || segundos > 0 || trabajando}
              style={{ border: 'none', background: 'none', padding: 0, fontWeight: 800, color: segundos > 0 || correo.tipo !== 'enviado' ? 'var(--muted-foreground)' : 'var(--accent)' }}
            >
              {segundos > 0 ? `Reenviar en ${segundos} s` : 'Reenviar el código'}
            </button>
            <button
              type="button" onClick={() => { setMetodo('app'); setCodigo(''); setError(null); }}
              style={{ border: 'none', background: 'none', padding: 0, fontWeight: 800, color: 'var(--accent)' }}
            >
              No tengo acceso a mi correo
            </button>
          </>
        ) : puedeVolverAlCorreo ? (
          <button
            type="button" onClick={() => { setMetodo('correo'); setCodigo(''); setError(null); }}
            style={{ border: 'none', background: 'none', padding: 0, fontWeight: 800, color: 'var(--accent)' }}
          >
            Prefiero recibirlo por correo
          </button>
        ) : <span />}
      </div>

      <p className="t-meta" style={{ textAlign: 'center', marginTop: 4 }}>
        ¿Has perdido el acceso a tu app y a tu correo? Habla con {estudio.nombre}: puede quitarte la verificación.
      </p>
      <button
        type="button" onClick={() => void salir()}
        style={{ border: 'none', background: 'none', padding: 0, fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--muted-foreground)', textAlign: 'center' }}
      >
        Usar otra cuenta
      </button>
    </form>
  );
}

export default function Page() {
  // `useSearchParams` exige Suspense en App Router.
  return <Suspense fallback={null}><DosPasos /></Suspense>;
}
