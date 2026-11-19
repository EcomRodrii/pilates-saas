'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La tarjeta del login nuevo (`LOGIN_NUEVO`, 19-nov-2026): la piel del onboarding al estilo del
// admin de Shopify (docs/diseno/shopify-onboarding-flujo.md). SOLO pinta: toda la lógica (captcha,
// doble verificación, invitaciones, recuperar contraseña) sigue en app/login/login-cliente.tsx.
//
//   paso «correo»: correo + «Continuar con correo electrónico» · o · Google y Apple · «Empezar».
//   paso «clave» : el correo en una caja con «Cambiar correo electrónico» + contraseña con ojo.
//
// Facebook y WhatsApp NO se pintan hasta que existan sus proveedores en Supabase.
// Movimiento: la tarjeta entra con un fundido y los pasos cambian con otro, quieto con «reducir movimiento».
// ─────────────────────────────────────────────────────────────────────────────

import { useId, useState } from 'react';
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

const ESTILOS = `
@keyframes ln-entra { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes ln-paso { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: none; } }
.ln-tarjeta { animation: ln-entra .5s cubic-bezier(.25,.1,.25,1) both; }
.ln-paso { animation: ln-paso .35s cubic-bezier(.32,.72,0,1) both; }
@media (prefers-reduced-motion: reduce) { .ln-tarjeta, .ln-paso { animation: none; } }
`;

const CAMPO = 'h-[52px] w-full rounded-xl border border-border bg-card px-3.5 text-[16px] text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/15';
const BOTON_OSCURO = 'flex h-[52px] w-full items-center justify-center rounded-xl bg-[color:var(--t-surface-nav)] text-[16px] font-medium text-white shadow-[inset_0_0_12px_-6px_#ffffffbf,inset_0_0_4px_2px_#ffffff1a] transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[.99] disabled:opacity-60';
const BOTON_SOCIAL = 'flex h-[52px] items-center justify-center rounded-xl bg-muted text-foreground transition-colors duration-150 hover:bg-muted/70 disabled:opacity-60';

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
  const [verClave, setVerClave] = useState(false);
  const enClave = p.modo === 'crear' || p.paso === 'clave';
  const titulo = p.modo === 'crear' ? 'Crear cuenta de equipo' : 'Iniciar sesión';

  function alEnviar(e: React.FormEvent) {
    // Primer paso: solo avanza (nada va al servidor hasta la contraseña).
    if (p.modo === 'entrar' && p.paso === 'correo') {
      e.preventDefault();
      if (p.email.trim()) p.onContinuarCorreo();
      return;
    }
    p.onSubmit(e);
  }

  return (
    <div className="ln-tarjeta">
      <style>{ESTILOS}</style>
      <div className="rounded-[28px] bg-card p-8 shadow-[0_5px_5px_-2.5px_#00000008,0_3px_3px_-1.5px_#00000005,0_0_30px_#000] sm:p-10">
        <h1 className="text-[28px] font-semibold leading-8 tracking-[-0.03em] text-foreground">{titulo}</h1>
        <p className="mt-1 text-[16px] text-muted-foreground">Continuar a Tentare</p>

        {p.modo === 'crear' && (
          <p className="mt-4 text-[13px] leading-[18px] text-muted-foreground">
            Tu acceso se activa con el enlace que te haya enviado tu estudio. Si tu correo no está en ningún equipo, te llevamos a crear tu estudio.
          </p>
        )}

        <form onSubmit={alEnviar} className="mt-8">
          {!enClave ? (
            <div key="correo" className="ln-paso">
              <label htmlFor={`${id}-e`} className="mb-1.5 block text-[15px] text-foreground">Correo electrónico</label>
              <input id={`${id}-e`} type="email" required autoComplete="email" autoFocus value={p.email} onChange={e => p.onEmail(e.target.value)} className={CAMPO} />
            </div>
          ) : (
            <div key="clave" className="ln-paso">
              {p.modo === 'entrar' ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3">
                  <span className="min-w-0 break-all text-[15px] text-foreground">{p.email}</span>
                  <button type="button" onClick={p.onCambiarCorreo} className="shrink-0 text-[14px] font-medium text-[color:var(--t-text-link)] hover:underline">
                    Cambiar correo electrónico
                  </button>
                </div>
              ) : (
                <div>
                  <label htmlFor={`${id}-e`} className="mb-1.5 block text-[15px] text-foreground">Correo electrónico</label>
                  <input id={`${id}-e`} type="email" required autoComplete="email" value={p.email} onChange={e => p.onEmail(e.target.value)} className={CAMPO} />
                </div>
              )}
              <label htmlFor={`${id}-c`} className="mb-1.5 mt-5 block text-[15px] text-foreground">Contraseña</label>
              <div className="relative">
                <input
                  id={`${id}-c`}
                  type={verClave ? 'text' : 'password'}
                  required
                  autoFocus={p.modo === 'entrar'}
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
                  className="absolute right-1.5 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
                >
                  {verClave ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
                </button>
              </div>
              {p.modo === 'crear' ? (
                <p className="mt-1.5 text-[13px] text-muted-foreground">Al menos {p.minimoPassword} caracteres.</p>
              ) : (
                <button type="button" disabled={p.recuperando} onClick={p.onRecuperar} className="mt-2 text-[14px] font-medium text-[color:var(--t-text-link)] hover:underline disabled:opacity-60">
                  {p.recuperando ? 'Enviando…' : '¿Olvidaste tu contraseña?'}
                </button>
              )}
            </div>
          )}

          {p.error && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">{p.error}</p>}
          {p.info && <p role="status" className="mt-4 rounded-lg bg-muted px-3 py-2 text-[13px] text-foreground">{p.info}</p>}

          {p.captcha}

          <button type="submit" disabled={p.submitting} className={`${BOTON_OSCURO} mt-6`}>
            {p.submitting
              ? 'Un momento…'
              : p.modo === 'crear' ? 'Crear cuenta' : p.paso === 'correo' ? 'Continuar con correo electrónico' : 'Iniciar sesión'}
          </button>
        </form>

        {!enClave && (
          <>
            <div className="my-6 flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-border" />
              <span className="text-[14px] text-muted-foreground">o</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={p.onGoogle} disabled={p.conectandoGoogle} aria-label="Continuar con Google" className={BOTON_SOCIAL}>
                <GoogleIcon size={22} />
              </button>
              <button type="button" onClick={p.onApple} disabled={p.conectandoApple} aria-label="Continuar con Apple" className={BOTON_SOCIAL}>
                <AppleIcon size={22} />
              </button>
            </div>
          </>
        )}

        <p className="mt-8 text-[15px] text-muted-foreground">
          {p.modo === 'entrar' ? (
            <>
              ¿Primera vez en Tentare?{' '}
              <Link href="/crear-estudio" className="font-medium text-[color:var(--t-text-link)] hover:underline">Empezar →</Link>
              <span className="mt-2 block text-[13px]">
                ¿Eres del equipo y aún no tienes cuenta?{' '}
                <button type="button" onClick={() => p.onCambiarModo('crear')} className="font-medium text-foreground hover:underline">Crear cuenta</button>
              </span>
            </>
          ) : (
            <>
              ¿Ya tienes cuenta?{' '}
              <button type="button" onClick={() => p.onCambiarModo('entrar')} className="font-medium text-[color:var(--t-text-link)] hover:underline">Iniciar sesión</button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
