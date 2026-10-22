// Huella del código de una tarjeta regalo — SOLO servidor y tests.
// Vive aparte de `reglas.ts` porque usa `node:crypto`: importarlo desde un componente de cliente
// arrastra el polyfill `crypto-browserify` (~121 KB gz) a /productos y a las pantallas de regalo
// de la alumna. Lo vigila `lib/sin-node-crypto-en-cliente.test.ts`.
import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { normalizarCodigo } from './reglas.ts';

export function huellaCodigo(texto: string): string {
  return createHash('sha256').update(normalizarCodigo(texto)).digest('hex');
}

/** Comparación en tiempo constante de dos huellas hexadecimales. */
export function huellasIguales(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
