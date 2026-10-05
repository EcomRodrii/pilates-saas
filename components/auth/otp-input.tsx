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
  /**
   * `app`: la app del estudio (P08). Mismas casillas y mismo comportamiento,
   * pero con los tokens del ESTUDIO (`--card`, `--border-strong`, `--accent`,
   * `--destructive`) en vez de los grises fijos del panel: la app tiene ocho
   * estilos y modo oscuro, y un fondo blanco a mano se vería como un agujero.
   */
  apariencia?: 'panel' | 'app';
  /** `data-testid` de la PRIMERA casilla, la que recibe el autocompletado y el pegado. */
  testIdPrimera?: string;
}

const TONOS = {
  panel: {
    borde: '#E7E7E0', activo: 'var(--brand)', texto: '#1A1A1A', fondo: 'white',
    fondoError: 'color-mix(in srgb, var(--destructive) 6%, white)',
  },
  app: {
    borde: 'var(--border-strong)', activo: 'var(--accent)', texto: 'var(--foreground)', fondo: 'var(--card)',
    fondoError: 'var(--destructive-soft)',
  },
} as const;

// 6 recuadros independientes, pero se comportan como un único campo lógico:
// escribir avanza solo, backspace en uno vacío retrocede al anterior y lo
// vacía, y pegar el código completo en CUALQUIER posición lo distribuye
// entero (la lógica de extraer dígitos vive en lib/otp-utils.ts, sin DOM,
// para poder testearla sin levantar un navegador). No se basa solo en
// `onKeyDown`: `onPaste` intercepta el pegado directamente, y el propio
// `onChange` del input ya recibe el valor completo del navegador (móvil con
// autocompletado de SMS/one-time-code puede rellenar el campo entero de una
// vez sin pasar por eventos de tecla individuales).
export function OtpInput({ valor, onCambiar, disabled, error, autoFocus, apariencia = 'panel', testIdPrimera }: OtpInputProps) {
  const uid = useId();
  const t = TONOS[apariencia];
  const enApp = apariencia === 'app';
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
    <div
      className={enApp ? undefined : 'flex items-center justify-center gap-2 sm:gap-2.5'}
      // En la app, las seis ocupan el ancho del formulario (44×54 en un móvil
      // de 390, como la maqueta) y nunca lo desbordan en uno de 320.
      style={enApp ? { display: 'flex', justifyContent: 'space-between', gap: 8 } : undefined}
      role="group" aria-label="Código de verificación de 6 dígitos"
    >
      {Array.from({ length: LONGITUD_OTP }, (_, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          id={`${uid}-${i}`}
          type="text"
          inputMode="numeric"
          pattern={enApp ? '[0-9]*' : undefined}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={LONGITUD_OTP} // no 1: así el autofill/pegado que aterriza en esta posición no se trunca antes de leerlo en escribirEn
          value={valor[i] ?? ''}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          aria-label={`Dígito ${i + 1} de ${LONGITUD_OTP}`}
          aria-invalid={error || undefined}
          data-testid={i === 0 ? testIdPrimera : undefined}
          onChange={e => escribirEn(i, e.target.value)}
          onPaste={e => alPegar(i, e)}
          onKeyDown={e => alTeclaAbajo(i, e)}
          onFocus={e => e.target.select()}
          className={enApp ? undefined : 'h-12 w-10 sm:h-14 sm:w-12 rounded-xl border text-center text-[20px] sm:text-[22px] font-bold tabular-nums outline-none transition-all disabled:opacity-60'}
          style={{
            ...(enApp ? {
              flex: '0 1 44px', minWidth: 0, height: 54, borderRadius: 12, border: '1.5px solid', padding: 0,
              textAlign: 'center', fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums', outline: 'none',
              transition: 'border-color .15s, box-shadow .15s', opacity: disabled ? 0.6 : 1,
            } : {}),
            borderColor: error ? 'var(--destructive)' : t.borde,
            color: t.texto,
            background: error ? t.fondoError : t.fondo,
          }}
          onFocusCapture={e => { e.currentTarget.style.borderColor = error ? 'var(--destructive)' : t.activo; e.currentTarget.style.boxShadow = `0 0 0 3px ${error ? 'color-mix(in srgb, var(--destructive) 15%, transparent)' : `color-mix(in srgb, ${t.activo} 15%, transparent)`}`; }}
          onBlurCapture={e => { e.currentTarget.style.borderColor = error ? 'var(--destructive)' : t.borde; e.currentTarget.style.boxShadow = 'none'; }}
        />
      ))}
    </div>
  );
}
