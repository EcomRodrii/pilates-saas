// Lógica pura del componente OTP (sin React, sin DOM) — el pegado de un
// código completo y el formato del contador de reenvío se testean aquí sin
// necesitar jsdom ni un navegador real.

export const LONGITUD_OTP = 6;

// Extrae SOLO los dígitos de lo que se haya pegado (un usuario puede pegar
// "482-913", "482 913" o el texto completo de un email con el código en
// medio de una frase) y los recorta/rellena a la longitud del OTP. Nunca
// lanza — un pegado con menos de 6 dígitos simplemente rellena lo que haya.
export function digitosDeTextoPegado(texto: string, longitud = LONGITUD_OTP): string[] {
  const soloDigitos = texto.replace(/\D/g, '').slice(0, longitud);
  return Array.from({ length: longitud }, (_, i) => soloDigitos[i] ?? '');
}

export function codigoCompleto(digitos: string[]): string | null {
  const codigo = digitos.join('');
  return /^\d+$/.test(codigo) && codigo.length === digitos.length ? codigo : null;
}

// "00:42" — nunca negativo, siempre dos dígitos en cada mitad.
export function formatearCuentaAtras(segundosRestantes: number): string {
  const s = Math.max(0, Math.round(segundosRestantes));
  const min = Math.floor(s / 60);
  const seg = s % 60;
  return `${String(min).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
}
