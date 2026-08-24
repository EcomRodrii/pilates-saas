'use client';

// Paso 01 del wizard: cuenta (signup + código OTP + Google). Sin sesión
// todavía, así que es el único paso que no vive dentro del layout con rail
// (ver app/network/crear-perfil/page.tsx, que renderiza esto ANTES del
// `if (!user) return null` implícito del resto del wizard). Extraído tal
// cual — F0 del roadmap de Tentare Network 2.0, sin cambios de comportamiento.
import { useId } from 'react';
import Link from 'next/link';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { GoogleIcon } from '@/components/icons/brand-icons';
import { OtpVerificacion } from '@/components/auth/otp-verificacion';
import { ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { NW_TINTA, NW_MUTED, NW_MUTED_2, NW_BORDE, NW_SAGE, NW_PRODUCTO } from '@/components/network-v2/tokens';
import { inputCls, inputStyle, labelCls } from '../estilos';
import { ShellCentrado } from '../componentes';
import { PASOS_ONBOARDING as PASOS } from '@/lib/network/pasos-onboarding';

export function PasoCuenta({
  emailOtp,
  nombreCuenta, setNombreCuenta,
  emailCuenta, setEmailCuenta,
  passwordCuenta, setPasswordCuenta,
  errorCuenta, infoCuenta, cuentaExistente,
  creandoCuenta,
  conectandoGoogle, conectarConGoogle,
  captcha,
  crearCuenta,
  verificarOtpSignup,
  pedirToken,
  reenviarConfirmacion,
  onCambiarEmail,
  onVerificado,
}: {
  emailOtp: string | null;
  nombreCuenta: string; setNombreCuenta: (v: string) => void;
  emailCuenta: string; setEmailCuenta: (v: string) => void;
  passwordCuenta: string; setPasswordCuenta: (v: string) => void;
  errorCuenta: string; infoCuenta: string; cuentaExistente: boolean;
  creandoCuenta: boolean;
  conectandoGoogle: boolean; conectarConGoogle: () => void;
  captcha: React.ReactNode;
  crearCuenta: (e: React.FormEvent) => void;
  verificarOtpSignup: (email: string, token: string) => Promise<{ error: string | null; errorCode: 'INVALIDO' | 'DEMASIADOS_INTENTOS' | null }>;
  pedirToken: () => Promise<string | null>;
  reenviarConfirmacion: (email: string, captchaToken?: string) => Promise<{ error: string | null }>;
  onCambiarEmail: () => void;
  onVerificado: () => void;
}) {
  const uid = useId();

  if (emailOtp) {
    return (
      <ShellCentrado>
        <Link href="/network" className="inline-flex mb-8"><LogoTentare formato="horizontal" tinta="tinta" producto="network" titulo="Tentare Network" alto={24} decorativo /></Link>
        <OtpVerificacion
          email={emailOtp}
          onVerificar={codigo => verificarOtpSignup(emailOtp, codigo)}
          onReenviar={async () => {
            const token = await pedirToken();
            if (token === null) return { error: ERROR_CAPTCHA };
            return reenviarConfirmacion(emailOtp, token || undefined);
          }}
          onCambiarEmail={onCambiarEmail}
          onVerificado={onVerificado}
        />
      </ShellCentrado>
    );
  }

  return (
    <ShellCentrado>
      <Link href="/network" className="inline-flex mb-8"><LogoTentare formato="horizontal" tinta="tinta" producto="network" titulo="Tentare Network" alto={24} decorativo /></Link>
      {/* Antes solo había texto "Paso 1 de 12" — el resto del wizard (pasos
          2-12) sí tiene barra+lista completa en su rail; el primer contacto
          de la usuaria con el producto era, de todo el flujo, el que MENOS
          orientación daba (hallazgo de la auditoría UX). */}
      <div className="mb-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: NW_BORDE }}>
        <div className="h-full rounded-full" style={{ width: `${Math.round((1 / PASOS.length) * 100)}%`, background: NW_PRODUCTO }} />
      </div>
      <p className="text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: NW_PRODUCTO }}>Paso 1 de 12</p>
      <h1 className="text-[30px] font-extrabold" style={{ color: NW_TINTA }}>
        Tu <span style={{ color: NW_PRODUCTO }}>cuenta</span>
      </h1>
      <p className="mt-2 text-[14px] mb-6" style={{ color: NW_MUTED }}>Crea tu cuenta gratis. Es el primer paso para publicar tu perfil.</p>

      <button
        type="button"
        disabled={conectandoGoogle}
        onClick={() => void conectarConGoogle()}
        className="w-full max-w-sm flex items-center justify-center gap-2.5 py-2.5 rounded-xl text-[13.5px] font-semibold hover:bg-black/[.02] transition-colors disabled:opacity-60 mb-4"
        style={{ border: `1px solid ${NW_BORDE}`, color: NW_TINTA }}
      >
        <GoogleIcon size={16} />
        {conectandoGoogle ? 'Conectando…' : 'Continuar con Google'}
      </button>
      <div className="flex items-center gap-3 mb-4 max-w-sm">
        <div className="h-px flex-1" style={{ background: NW_BORDE }} />
        <span className="text-[11px] font-medium" style={{ color: NW_MUTED_2 }}>o</span>
        <div className="h-px flex-1" style={{ background: NW_BORDE }} />
      </div>

      <form onSubmit={crearCuenta} className="space-y-4 max-w-sm">
        <div>
          <label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-n`}>Tu nombre</label>
          <input id={`${uid}-n`} required value={nombreCuenta} onChange={e => setNombreCuenta(e.target.value)} className={inputCls} style={inputStyle} placeholder="Ana García" />
        </div>
        <div>
          <label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-e`}>Email</label>
          <input id={`${uid}-e`} type="email" required value={emailCuenta} onChange={e => setEmailCuenta(e.target.value)} className={inputCls} style={inputStyle} placeholder="tu@email.com" />
        </div>
        <div>
          <label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-p`}>Contraseña</label>
          <input id={`${uid}-p`} type="password" required minLength={6} value={passwordCuenta} onChange={e => setPasswordCuenta(e.target.value)} className={inputCls} style={inputStyle} placeholder="••••••••" />
        </div>
        {errorCuenta && <p className="text-[13px] text-destructive bg-destructive/10 rounded-lg px-3 py-2">{errorCuenta}</p>}
        {infoCuenta && (
          <p className="text-[13px] rounded-lg px-3 py-2" style={{ background: NW_SAGE, color: NW_TINTA }}>
            {infoCuenta}{cuentaExistente && (
              <> <Link href="/network/acceso" className="font-semibold underline" style={{ color: NW_TINTA }}>Inicia sesión</Link>.</>
            )}
          </p>
        )}
        {captcha}
        <button type="submit" disabled={creandoCuenta} className="w-full py-3 rounded-full text-[14px] font-bold text-white disabled:opacity-60" style={{ background: NW_PRODUCTO }}>
          {creandoCuenta ? 'Un momento…' : 'Continuar'}
        </button>
      </form>
      <p className="text-center text-[12px] mt-5" style={{ color: NW_MUTED_2 }}>
        ¿Ya tienes cuenta? <Link href="/network/acceso" className="font-semibold underline" style={{ color: NW_TINTA }}>Inicia sesión</Link>
      </p>
    </ShellCentrado>
  );
}
