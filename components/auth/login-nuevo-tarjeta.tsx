'use client';

// ─────────────────────────────────────────────────────────────────────────────
// El login nuevo (`LOGIN_NUEVO`, 19-nov-2026): marco oscuro con el logo, una tarjeta en escritorio y una
// HOJA a pantalla completa en móvil. Maqueta aprobada por el fundador. SOLO pinta: toda la lógica (captcha,
// doble verificación, invitaciones, recuperar contraseña) sigue en app/login/login-cliente.tsx.
//
// Tres paneles —«correo», «clave» (entrar) y «crear» (cuenta de equipo)— apilados: el activo es el que se
// ve, los demás están `inert` (ni foco, ni lector de pantalla, ni validación) y se deslizan fuera. La caja
// anima su ALTO al del panel activo (ResizeObserver), así que nunca sobra hueco blanco.
//
// Cada panel lleva su propio <form>: un campo `required` de un panel oculto bloquearía el envío del activo.
// El captcha (un solo widget) va FUERA de los paneles.
//
// Movimiento: solo transform, opacity y el alto; quieto con «reducir movimiento».
// Facebook y WhatsApp NO se pintan hasta que existan sus proveedores en Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { GoogleIcon } from '@/components/icons/brand-icons';

function AppleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.37 12.64c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.71-3.19-1.73-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.1 8.78.73 1.06 1.6 2.25 2.74 2.21 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.7.71 2.87.69 1.19-.02 1.94-1.08 2.66-2.14.84-1.23 1.19-2.42 1.21-2.48-.03-.01-2.32-.89-2.29-3.54ZM14.2 6.17c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.54 1.31-.56.65-1.05 1.69-.92 2.68.97.07 1.96-.49 2.56-1.23Z" />
    </svg>
  );
}

/** Las reglas del marco, la hoja y los paneles. Va una vez, dentro del marco de /login. */
export function EstilosLoginNuevo() {
  return (
    <style>{`
.ln-marco { position: relative; display: flex; justify-content: center; min-height: 100dvh; overflow: hidden; background: var(--t-ink-950); }
.ln-marco::before { content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(60% 45% at 50% 0%, color-mix(in srgb, var(--t-blue-500) 16%, transparent), transparent 70%),
              radial-gradient(40% 35% at 88% 100%, color-mix(in srgb, var(--t-magenta-500) 10%, transparent), transparent 70%); }
.ln-columna { position: relative; display: flex; width: 100%; max-width: 420px; flex-direction: column; align-items: center; gap: 28px; margin: auto 0; padding: 48px 24px; }
.ln-logo { display: block; width: auto; flex: none; }
.ln-hoja { width: 100%; border-radius: 24px; background: var(--t-paper); color: var(--t-ink-950); padding: 36px;
  box-shadow: 0 0 0 1px rgb(255 255 255 / .06), 0 30px 70px -24px rgb(0 0 0 / .7); }
.ln-columna > .ln-logo { animation: ln-fundido .35s cubic-bezier(.25,.1,.25,1) both; }
.ln-columna > :not(.ln-logo) { animation: ln-entra .4s cubic-bezier(.22,.8,.3,1) .03s both; }
.ln-cajas { position: relative; margin: -4px; padding: 4px; overflow: hidden; contain: layout; transition: height .36s cubic-bezier(.32,.72,0,1); }
.ln-panel { will-change: transform, opacity; transition: transform .36s cubic-bezier(.32,.72,0,1), opacity .16s cubic-bezier(.25,.1,.25,1); }
.ln-panel:not([inert]) { transition: transform .36s cubic-bezier(.32,.72,0,1), opacity .24s cubic-bezier(.25,.1,.25,1) .08s; }
.ln-panel[inert] { position: absolute; inset: 4px 4px auto 4px; opacity: 0; pointer-events: none; }
.ln-panel[data-lado="izq"] { transform: translateX(-28px); }
.ln-panel[data-lado="der"] { transform: translateX(28px); }
.ln-aviso { animation: ln-aviso .3s cubic-bezier(.25,.1,.25,1) both; }
.ln-pulsable { transition: transform .12s cubic-bezier(.25,.1,.25,1), background-color .15s, opacity .15s, border-color .15s, box-shadow .15s; }
.ln-pulsable:active:not(:disabled) { transform: scale(.985); }
@keyframes ln-fundido { from { opacity: 0; } to { opacity: 1; } }
@keyframes ln-entra { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes ln-sube { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }
@keyframes ln-aviso { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
@media (max-width: 640px) {
  .ln-marco { display: block; }
  .ln-columna { max-width: none; min-height: 100dvh; margin: 0; padding: 0; gap: 0; align-items: stretch; }
  .ln-columna > .ln-logo { margin: auto; padding: max(48px, env(safe-area-inset-top)) 0 40px; box-sizing: content-box; }
  .ln-hoja { flex: none; border-radius: 28px 28px 0 0; padding: 32px 24px calc(24px + env(safe-area-inset-bottom)); box-shadow: 0 -1px 0 rgb(255 255 255 / .08); }
  .ln-columna > :not(.ln-logo) { animation-name: ln-sube; }
  .ln-columna > :not(.ln-logo):not(.ln-hoja) { margin: 0 16px 24px; width: auto; }
}
@media (prefers-reduced-motion: reduce) {
  .ln-columna > *, .ln-aviso { animation: none !important; }
  .ln-cajas, .ln-panel, .ln-pulsable { transition: none; }
}
`}</style>
  );
}

const CAMPO = 'ln-pulsable h-12 w-full rounded-xl border border-[color:color-mix(in_srgb,var(--t-ink-900)_16%,white)] bg-white px-3.5 text-[15px] text-[color:var(--t-ink-950)] placeholder:text-[color:var(--t-ink-400)] focus-visible:border-[color:var(--t-ink-950)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--t-ink-950)]/10 max-sm:h-[54px] max-sm:rounded-[14px] max-sm:px-4 max-sm:text-[16px]';
const BOTON_OSCURO = 'ln-pulsable mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-b from-[color:var(--t-ink-900)] to-[color:var(--t-ink-950)] text-[15px] font-medium text-white shadow-[0_1px_2px_rgb(18_22_27/.3),inset_0_1px_0_rgb(255_255_255/.14)] hover:opacity-90 disabled:opacity-60 max-sm:h-[54px] max-sm:rounded-[14px] max-sm:text-[16px]';
const BOTON_SOCIAL = 'ln-pulsable flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-[color:color-mix(in_srgb,var(--t-ink-900)_16%,white)] bg-white text-[15px] font-medium text-[color:var(--t-ink-950)] hover:bg-[color:var(--t-ink-950)]/[.03] disabled:opacity-60 max-sm:h-[54px] max-sm:rounded-[14px] max-sm:text-[16px]';
const ENLACE = 'font-medium text-[color:var(--t-blue-700)] hover:underline';
const ETIQUETA = 'mb-2 block text-[14px] font-medium max-sm:text-[15px]';

type Panel = 'correo' | 'clave' | 'crear';
const ORDEN: Panel[] = ['correo', 'clave', 'crear'];

/** Un panel del login: el activo se ve; los demás están `inert` y se deslizan hacia su lado. */
function PanelAnimado({ panel, activo, registrar, children }: {
  panel: Panel; activo: Panel; registrar: (panel: Panel, el: HTMLDivElement | null) => void; children: React.ReactNode;
}) {
  const lado = panel === activo ? undefined : ORDEN.indexOf(panel) < ORDEN.indexOf(activo) ? 'izq' : 'der';
  return (
    <div
      ref={el => registrar(panel, el)}
      className="ln-panel"
      inert={panel !== activo}
      data-lado={lado}
      aria-hidden={panel !== activo || undefined}
    >
      {children}
    </div>
  );
}

export interface LoginNuevoProps {
  modo: 'entrar' | 'crear';
  paso: 'correo' | 'clave';
  email: string;
  password: string;
  error: string;
  info: string;
  captcha: React.ReactNode;
  submitting: boolean;
  conectandoGoogle: boolean;
  conectandoApple: boolean;
  /** Si el proveedor de Apple está configurado (`LOGIN_APPLE=on`): sin él no se pinta el botón. */
  apple?: boolean;
  recuperando: boolean;
  minimoPassword: number;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onContinuarCorreo: () => void;
  onCambiarCorreo: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onGoogle: () => void;
  onApple: () => void;
  onRecuperar: () => void;
  onCambiarModo: (m: 'entrar' | 'crear') => void;
}

export function LoginNuevoTarjeta(p: LoginNuevoProps) {
  const id = useId();
  const activo: Panel = p.modo === 'crear' ? 'crear' : p.paso;
  const [verClave, setVerClave] = useState(false);
  const [alto, setAlto] = useState<number | undefined>(undefined);
  const refs = useRef<Record<Panel, HTMLDivElement | null>>({ correo: null, clave: null, crear: null });
  const primera = useRef(true);

  // El alto de la caja sigue al del panel activo (también si crece un aviso o el captcha).
  useLayoutEffect(() => {
    const el = refs.current[activo];
    if (!el) return;
    // Medir una vez en el layout effect (sin parpadeo) y, después, solo cuando el panel cambia de tamaño de verdad.
    const medir = () => setAlto(h => (h === el.offsetHeight + 8 ? h : el.offsetHeight + 8));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activo]);

  // El foco viaja al primer campo del panel que entra (no en la carga: ahí ya lo pone autoFocus).
  useEffect(() => {
    if (primera.current) { primera.current = false; return; }
    const t = setTimeout(() => refs.current[activo]?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(t);
  }, [activo]);

  const registrar = useCallback((panel: Panel, el: HTMLDivElement | null) => { refs.current[panel] = el; }, []);
  const panelDe = (panel: Panel) => ({ panel, activo, registrar });

  const avisos = (
    <>
      {p.error && <p role="alert" className="ln-aviso mt-4 rounded-lg bg-[color:var(--t-error-100)] px-3 py-2 text-[13px] text-[color:var(--t-error-700)]">{p.error}</p>}
      {p.info && <p role="status" className="ln-aviso mt-4 rounded-lg bg-[color:var(--t-blue-100)] px-3 py-2 text-[13px] text-[color:var(--t-ink-900)]">{p.info}</p>}
    </>
  );
  const ayuda = (
    <p className="mt-6 text-center text-[14px] text-[color:var(--t-ink-500)]">
      ¿Necesitas ayuda? <Link href="/ayuda" className={ENLACE}>Escríbenos</Link>
    </p>
  );
  const cabecera = (titulo: string, sub: string) => (
    <>
      <h1 className="text-[26px] font-semibold leading-8 tracking-[-0.025em] max-sm:text-[28px] max-sm:leading-[34px]">{titulo}</h1>
      <p className="mt-1.5 text-[15px] text-[color:var(--t-ink-500)] max-sm:text-[16px]">{sub}</p>
    </>
  );
  const campoClave = (n: string) => (
    <>
      <label htmlFor={`${id}-${n}`} className={`${ETIQUETA} mt-5`}>Contraseña</label>
      <div className="relative">
        <input
          id={`${id}-${n}`}
          type={verClave ? 'text' : 'password'}
          required
          autoComplete={p.modo === 'crear' ? 'new-password' : 'current-password'}
          // Solo al CREAR importa el mínimo: al entrar, el servidor decide si la contraseña vale.
          minLength={p.modo === 'crear' ? p.minimoPassword : undefined}
          value={p.password}
          onChange={e => p.onPassword(e.target.value)}
          className={`${CAMPO} pr-12`}
        />
        <button
          type="button"
          onClick={() => setVerClave(v => !v)}
          aria-label={verClave ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
          className="absolute right-1.5 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-[color:var(--t-ink-500)] hover:text-[color:var(--t-ink-950)]"
        >
          {verClave ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
        </button>
      </div>
    </>
  );

  return (
    <div className="ln-hoja">
      <div className="ln-cajas" style={alto === undefined ? undefined : { height: alto }}>
        {/* 1 · Correo */}
        <PanelAnimado {...panelDe('correo')}>
          {cabecera('Inicia sesión', 'Continúa a tu estudio en Tentare')}
          <form
            className="mt-7"
            onSubmit={e => { e.preventDefault(); if (p.email.trim()) p.onContinuarCorreo(); }}
          >
            <label htmlFor={`${id}-e1`} className={ETIQUETA}>Correo electrónico</label>
            <input id={`${id}-e1`} type="email" required autoComplete="email" autoFocus value={p.email} onChange={e => p.onEmail(e.target.value)} className={CAMPO} />
            {avisos}
            <button type="submit" className={BOTON_OSCURO}>Continuar</button>
          </form>
          <div className="my-5 flex items-center gap-3.5 text-[13px] text-[color:var(--t-ink-400)]" aria-hidden>
            <span className="h-px flex-1 bg-[color:color-mix(in_srgb,var(--t-ink-900)_10%,white)]" /> o <span className="h-px flex-1 bg-[color:color-mix(in_srgb,var(--t-ink-900)_10%,white)]" />
          </div>
          <button type="button" onClick={p.onGoogle} disabled={p.conectandoGoogle} className={BOTON_SOCIAL}>
            <GoogleIcon size={20} /> {p.conectandoGoogle ? 'Conectando…' : 'Continuar con Google'}
          </button>
          {p.apple && (
            <button type="button" onClick={p.onApple} disabled={p.conectandoApple} className={`${BOTON_SOCIAL} mt-2.5`}>
              <AppleIcon size={20} /> {p.conectandoApple ? 'Conectando…' : 'Continuar con Apple'}
            </button>
          )}
          <p className="mt-6 text-center text-[14px] text-[color:var(--t-ink-500)] max-sm:text-[15px]">
            ¿Primera vez en Tentare? <Link href="/crear-estudio" className={ENLACE}>Crea tu estudio</Link>
          </p>
          <p className="mt-2 text-center text-[13px] text-[color:var(--t-ink-500)]">
            ¿Eres del equipo y aún no tienes cuenta?{' '}
            <button type="button" onClick={() => p.onCambiarModo('crear')} className="font-medium text-[color:var(--t-ink-950)] hover:underline">Crear cuenta</button>
          </p>
          {ayuda}
        </PanelAnimado>

        {/* 2 · Contraseña */}
        <PanelAnimado {...panelDe('clave')}>
          {cabecera('Inicia sesión', 'Continúa a tu estudio en Tentare')}
          <form className="mt-7" onSubmit={p.onSubmit}>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[color:color-mix(in_srgb,var(--t-ink-900)_10%,white)] bg-[color:var(--t-ink-950)]/[.03] px-3.5 py-2.5 max-sm:rounded-[14px] max-sm:py-3.5">
              <span className="min-w-0 break-all text-[15px]">{p.email}</span>
              <button type="button" onClick={p.onCambiarCorreo} className={`${ENLACE} shrink-0 whitespace-nowrap text-[13.5px]`}>Cambiar</button>
            </div>
            {campoClave('c2')}
            <button type="button" disabled={p.recuperando} onClick={p.onRecuperar} className={`${ENLACE} mt-2.5 text-[14px] disabled:opacity-60`}>
              {p.recuperando ? 'Enviando…' : '¿Olvidaste tu contraseña?'}
            </button>
            {avisos}
            <button type="submit" disabled={p.submitting} className={BOTON_OSCURO}>{p.submitting ? 'Un momento…' : 'Iniciar sesión'}</button>
          </form>
          {ayuda}
        </PanelAnimado>

        {/* 3 · Crear cuenta de equipo */}
        <PanelAnimado {...panelDe('crear')}>
          {cabecera('Crea tu cuenta de equipo', 'Tu acceso se activa con el enlace de tu estudio.')}
          <p className="mt-3 text-[13px] leading-[18px] text-[color:var(--t-ink-500)]">
            Si tu correo no está en ningún equipo, te llevamos a crear tu estudio.
          </p>
          <form className="mt-6" onSubmit={p.onSubmit}>
            <label htmlFor={`${id}-e3`} className={ETIQUETA}>Correo electrónico</label>
            <input id={`${id}-e3`} type="email" required autoComplete="email" value={p.email} onChange={e => p.onEmail(e.target.value)} className={CAMPO} />
            {campoClave('c3')}
            <p className="mt-1.5 text-[13px] text-[color:var(--t-ink-500)]">Al menos {p.minimoPassword} caracteres.</p>
            {avisos}
            <button type="submit" disabled={p.submitting} className={BOTON_OSCURO}>{p.submitting ? 'Un momento…' : 'Crear cuenta'}</button>
          </form>
          <p className="mt-6 text-center text-[14px] text-[color:var(--t-ink-500)]">
            ¿Ya tienes cuenta?{' '}
            <button type="button" onClick={() => p.onCambiarModo('entrar')} className={ENLACE}>Inicia sesión</button>
          </p>
          {ayuda}
        </PanelAnimado>
      </div>
      {/* Un solo widget de captcha, fuera de los paneles: sin altura, no cambia el diseño. */}
      {p.captcha}
    </div>
  );
}
