'use client';

import { useId, useRef } from 'react';
import { digitosDeTextoPegado, LONGITUD_OTP } from '@/lib/otp-utils';

export interface OtpInputProps {
  valor: string[];
  onCambiar: (digitos: string[]) => void;
  disabled?: boolean;
  /** Pinta los 6 recuadros en rojo (código incorrecto/caducado) sin borrar lo escrito. */
  error?: boolean;
  autoFocus?: boolean;
}

// 6 recuadros independientes, pero se comportan como un único campo lógico:
// escribir avanza solo, backspace en uno vacío retrocede al anterior y lo
// vacía, y pegar el código completo en CUALQUIER posición lo distribuye
// entero (la lógica de extraer dígitos vive en lib/otp-utils.ts, sin DOM,
// para poder testearla sin levantar un navegador). No se basa solo en
// `onKeyDown`: `onPaste` intercepta el pegado directamente, y el propio
// `onChange` del input ya recibe el valor completo del navegador (móvil con
// autocompletado de SMS/one-time-code puede rellenar el campo entero de una
// vez sin pasar por eventos de tecla individuales).
export function OtpInput({ valor, onCambiar, disabled, error, autoFocus }: OtpInputProps) {
  const uid = useId();
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function enfocar(indice: number) {
    refs.current[indice]?.focus();
    refs.current[indice]?.select();
  }

  function escribirEn(indice: number, textoCrudo: string) {
    const soloDigitos = textoCrudo.replace(/\D/g, '');
    // Un único carácter nuevo → caso normal, avanza uno. Varios (autofill del
    // teclado numérico de iOS a veces manda el valor completo por onChange en
    // vez de onPaste) → se trata igual que un pegado desde esa posición.
    if (soloDigitos.length > 1) {
      const distribuidos = digitosDeTextoPegado(soloDigitos, LONGITUD_OTP - indice);
      const nuevo = [...valor];
      distribuidos.forEach((d, i) => { if (indice + i < LONGITUD_OTP) nuevo[indice + i] = d; });
      onCambiar(nuevo);
      const ultimaLlena = Math.min(indice + distribuidos.filter(Boolean).length, LONGITUD_OTP - 1);
      enfocar(ultimaLlena);
      return;
    }
    const nuevo = [...valor];
    nuevo[indice] = soloDigitos;
    onCambiar(nuevo);
    if (soloDigitos && indice < LONGITUD_OTP - 1) enfocar(indice + 1);
  }

  function alPegar(indice: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const texto = e.clipboardData.getData('text');
    if (!/\d/.test(texto)) return; // deja pasar el pegado normal (no numérico) sin interceptar
    e.preventDefault();
    const distribuidos = digitosDeTextoPegado(texto, LONGITUD_OTP - indice);
    const nuevo = [...valor];
    distribuidos.forEach((d, i) => { if (indice + i < LONGITUD_OTP) nuevo[indice + i] = d; });
    onCambiar(nuevo);
    const ultimaLlena = Math.min(indice + distribuidos.filter(Boolean).length, LONGITUD_OTP - 1);
    enfocar(ultimaLlena);
  }

  function alTeclaAbajo(indice: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !valor[indice] && indice > 0) {
      // Posición ya vacía: el backspace "inteligente" retrocede Y vacía la
      // anterior en el mismo golpe, en vez de necesitar dos pulsaciones.
      e.preventDefault();
      const nuevo = [...valor];
      nuevo[indice - 1] = '';
      onCambiar(nuevo);
      enfocar(indice - 1);
      return;
    }
    if (e.key === 'ArrowLeft' && indice > 0) { e.preventDefault(); enfocar(indice - 1); return; }
    if (e.key === 'ArrowRight' && indice < LONGITUD_OTP - 1) { e.preventDefault(); enfocar(indice + 1); return; }
  }

  return (
    <div className="flex items-center justify-center gap-2 sm:gap-2.5" role="group" aria-label="Código de verificación de 6 dígitos">
      {Array.from({ length: LONGITUD_OTP }, (_, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          id={`${uid}-${i}`}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={LONGITUD_OTP} // no 1: así el autofill/pegado que aterriza en esta posición no se trunca antes de leerlo en escribirEn
          value={valor[i] ?? ''}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          aria-label={`Dígito ${i + 1} de ${LONGITUD_OTP}`}
          onChange={e => escribirEn(i, e.target.value)}
          onPaste={e => alPegar(i, e)}
          onKeyDown={e => alTeclaAbajo(i, e)}
          onFocus={e => e.target.select()}
          className="h-12 w-10 sm:h-14 sm:w-12 rounded-xl border text-center text-[20px] sm:text-[22px] font-bold tabular-nums outline-none transition-all disabled:opacity-60"
          style={{
            borderColor: error ? 'var(--destructive)' : '#E7E7E0',
            color: '#1A1A1A',
            background: error ? 'color-mix(in srgb, var(--destructive) 6%, white)' : 'white',
          }}
          onFocusCapture={e => { e.currentTarget.style.borderColor = error ? 'var(--destructive)' : 'var(--brand)'; e.currentTarget.style.boxShadow = `0 0 0 3px ${error ? 'color-mix(in srgb, var(--destructive) 15%, transparent)' : 'color-mix(in srgb, var(--brand) 15%, transparent)'}`; }}
          onBlurCapture={e => { e.currentTarget.style.borderColor = error ? 'var(--destructive)' : '#E7E7E0'; e.currentTarget.style.boxShadow = 'none'; }}
        />
      ))}
    </div>
  );
}
