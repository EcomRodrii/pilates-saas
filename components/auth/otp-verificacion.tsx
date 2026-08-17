'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { OtpInput } from '@/components/auth/otp-input';
import { codigoCompleto, formatearCuentaAtras, LONGITUD_OTP } from '@/lib/otp-utils';

// Coincide con `max_frequency` de supabase/config.toml (1 min) — el
// contador no inventa un número, refleja el cooldown real del servidor. Si
// se reenvía antes de que el servidor lo permita, gotrue lo rechaza igual;
// el contador solo evita el viaje a pedirlo de más.
const COOLDOWN_REENVIO_SEGUNDOS = 60;

export interface OtpVerificacionProps {
  email: string;
  /** Verifica el código contra el servidor. `null` en errorCode = fallo de red/desconocido. */
  onVerificar: (codigo: string) => Promise<{ error: string | null; errorCode: 'INVALIDO' | 'DEMASIADOS_INTENTOS' | null }>;
  /** El padre ya tiene el captcha resuelto — aquí solo se orquesta el cooldown/feedback. */
  onReenviar: () => Promise<{ error: string | null }>;
  onCambiarEmail: () => void;
  /** Se llama tras el breve feedback de éxito — el padre decide a dónde sigue. */
  onVerificado: () => void;
  /** El sitio que lo incrusta (SeccionRegistro, landing de Network) ya pinta
   *  su propia tarjeta blanca alrededor — sin esto quedaban dos tarjetas
   *  anidadas, una dentro de otra. `/login` y el paso 1 del wizard de
   *  Network SÍ necesitan la tarjeta propia (no hay ninguna otra alrededor). */
  sinTarjeta?: boolean;
}

type Estado = 'rellenando' | 'verificando' | 'exito' | 'error';

export function OtpVerificacion({ email, onVerificar, onReenviar, onCambiarEmail, onVerificado, sinTarjeta }: OtpVerificacionProps) {
  const [digitos, setDigitos] = useState<string[]>(Array(LONGITUD_OTP).fill(''));
  const [estado, setEstado] = useState<Estado>('rellenando');
  const [errorMsg, setErrorMsg] = useState('');
  const [segundosBloqueo, setSegundosBloqueo] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [reenviando, setReenviando] = useState(false);
  const [avisoReenvio, setAvisoReenvio] = useState('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // El bloqueo por demasiados intentos lo decide el servidor (rate limit por
  // email, ver /api/auth/otp/verificar) — este contador SOLO refleja lo que
  // ya pasó, no impone un límite propio del lado del cliente (fácil de
  // saltarse y no serviría de nada). Cuenta atrás en estado (no `Date.now()`
  // calculado en cada render, que el React Compiler rechaza por impuro).
  useEffect(() => {
    if (segundosBloqueo <= 0) return;
    const t = setInterval(() => setSegundosBloqueo(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [segundosBloqueo]);

  const codigo = codigoCompleto(digitos);
  const bloqueado = segundosBloqueo > 0;

  async function verificar(codigoAVerificar: string) {
    setEstado('verificando');
    setErrorMsg('');
    const r = await onVerificar(codigoAVerificar);
    if (!r.error) {
      setEstado('exito');
      // Feedback breve y ya — nada de pasos intermedios innecesarios.
      setTimeout(onVerificado, 550);
      return;
    }
    setEstado('error');
    setErrorMsg(r.error);
    if (r.errorCode === 'DEMASIADOS_INTENTOS') {
      setSegundosBloqueo(15 * 60);
    } else {
      // Código incorrecto: se borra para que la corrección sea inmediata,
      // sin tener que limpiar 6 recuadros a mano.
      setDigitos(Array(LONGITUD_OTP).fill(''));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!codigo || estado === 'verificando' || estado === 'exito' || bloqueado) return;
    void verificar(codigo);
  }

  async function handleReenviar() {
    setReenviando(true);
    setAvisoReenvio('');
    setErrorMsg('');
    const r = await onReenviar();
    setReenviando(false);
    if (r.error) { setErrorMsg(r.error); return; }
    // Best-effort: si esto falla, el peor caso es que un bloqueo viejo siga
    // en pie unos minutos — nunca bloquea el reenvío, que ya tuvo éxito.
    fetch('/api/auth/otp/reenviado', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    }).catch(() => {});
    setSegundosBloqueo(0);
    setCooldown(COOLDOWN_REENVIO_SEGUNDOS);
    setDigitos(Array(LONGITUD_OTP).fill(''));
    setEstado('rellenando');
    setAvisoReenvio('Código reenviado. Revisa tu correo.');
  }

  return (
    <div className={sinTarjeta ? 'w-full' : 'w-full max-w-sm'}>
      <div className={sinTarjeta ? '' : 'bg-white rounded-2xl p-6'} style={sinTarjeta ? undefined : { border: '1px solid #E7E7E0', boxShadow: '0 30px 60px -30px rgba(26,26,26,.18)' }}>
        <h2 className="text-[16px] font-semibold text-[#1A1A1A] mb-1.5">Verifica tu correo</h2>
        <p className="text-[13.5px] text-[#63635D] mb-6 leading-relaxed">
          Hemos enviado un código de verificación de 6 dígitos a{' '}
          <span className="font-semibold text-[#1A1A1A] break-all">{email}</span>
        </p>

        <form onSubmit={handleSubmit}>
          <OtpInput
            valor={digitos}
            onCambiar={d => { setDigitos(d); if (estado === 'error') { setEstado('rellenando'); setErrorMsg(''); } }}
            disabled={estado === 'verificando' || estado === 'exito' || bloqueado}
            error={estado === 'error'}
            autoFocus
          />

          <div className="mt-4 min-h-[20px]">
            {bloqueado && (
              <p className="text-[13px] text-destructive text-center">
                Demasiados intentos. Vuelve a probar en {formatearCuentaAtras(segundosBloqueo)}, o pide un código nuevo.
              </p>
            )}
            {!bloqueado && errorMsg && (
              <p className="text-[13px] text-destructive text-center">{errorMsg}</p>
            )}
            {!bloqueado && !errorMsg && avisoReenvio && (
              <p className="text-[13px] text-center" style={{ color: '#22251A' }}>{avisoReenvio}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!codigo || estado === 'verificando' || estado === 'exito' || bloqueado}
            className="w-full mt-2 py-3 rounded-full text-[14px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: estado === 'exito' ? 'var(--brand-medio, var(--brand))' : 'var(--brand)', color: 'var(--brand-foreground)', boxShadow: '0 10px 22px color-mix(in srgb, var(--brand) 28%, transparent)' }}
          >
            {estado === 'verificando' && <Loader2 size={16} className="animate-spin" />}
            {estado === 'exito' && <Check size={16} />}
            {estado === 'verificando' ? 'Verificando…' : estado === 'exito' ? 'Verificado' : 'Verificar correo'}
          </button>
        </form>

        <div className="mt-5 text-center">
          {cooldown > 0 ? (
            <p className="text-[12.5px] text-[#8E8E86]">Reenviar código en {formatearCuentaAtras(cooldown)}</p>
          ) : (
            <button
              type="button"
              disabled={reenviando || estado === 'exito'}
              onClick={() => void handleReenviar()}
              className="text-[12.5px] font-semibold text-[#3A3A34] hover:underline disabled:opacity-60"
            >
              {reenviando ? 'Enviando…' : '¿No has recibido el código? Reenviar código'}
            </button>
          )}
        </div>

        <p className="mt-3 text-center text-[12px] text-[#A8A89F]">
          ¿Has introducido un correo incorrecto?{' '}
          <button type="button" onClick={onCambiarEmail} className="font-semibold text-[#3A3A34] hover:underline">
            Cambiar correo
          </button>
        </p>
      </div>
    </div>
  );
}
