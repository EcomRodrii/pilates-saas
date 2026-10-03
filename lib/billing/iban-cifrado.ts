// ─────────────────────────────────────────────────────────────────────────────
// El IBAN de un mandato SEPA (domiciliación del cuaderno 19.14) se guarda
// CIFRADO (contrato de encargo, 2-oct-2026). Antes lo protegían solo la
// separación por estudio y la RLS por rol.
//
// Mismo cifrado que las credenciales de las integraciones (AES-256-GCM en la
// app, `lib/integraciones/cifrado-credenciales.ts`), con su PROPIA clave
// (`SEPA_CLAVE_CIFRADO`, 32 bytes en base64, solo en Vercel; `_ANTERIOR` para
// rotar). El dato autenticado es estudio + mandato: un IBAN cifrado copiado a
// otro mandato no se descifra.
//
// Falla CERRADO en las dos direcciones: sin clave no se guarda ningún IBAN
// (la BD además lo exige con un CHECK, migr 20261003020100) y uno que no se
// descifra no sale. El panel solo conoce los 4 últimos dígitos; el IBAN entero
// solo lo pide el fichero de la remesa, al generarlo.
//
// Sin `server-only` ni `@/`, para probarlo con node --test.
// ─────────────────────────────────────────────────────────────────────────────
import {
  cifrarCredencial, descifrarCredencial, estaCifrado, type ClavesCredenciales,
} from '../integraciones/cifrado-credenciales.ts';

function leerClave(valor: string | undefined): { clave: Buffer | null; malformada: boolean } {
  const limpio = valor?.trim();
  if (!limpio) return { clave: null, malformada: false };
  const clave = Buffer.from(limpio, 'base64');
  return clave.length === 32 ? { clave, malformada: false } : { clave: null, malformada: true };
}

export function clavesIbanDelEntorno(env: Record<string, string | undefined> = process.env): ClavesCredenciales {
  const actual = leerClave(env.SEPA_CLAVE_CIFRADO);
  const anterior = leerClave(env.SEPA_CLAVE_CIFRADO_ANTERIOR);
  return { actual: actual.clave, anterior: anterior.clave, malformada: actual.malformada || anterior.malformada };
}

export function contextoIban(studioId: string, mandatoId: string): string {
  return `iban:${studioId}:${mandatoId}`;
}

/** IBAN en formato de guardar: sin espacios y en mayúsculas. */
export function ibanLimpio(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase();
}

export function ultimos4(iban: string): string {
  return ibanLimpio(iban).slice(-4);
}

/** El IBAN cifrado, o `null` si no hay clave válida (y entonces NO se guarda). */
export function cifrarIban(iban: string, studioId: string, mandatoId: string, claves: ClavesCredenciales): string | null {
  if (!claves.actual || claves.malformada) return null;
  return cifrarCredencial(ibanLimpio(iban), contextoIban(studioId, mandatoId), claves.actual);
}

/** El IBAN en claro, o `null` si no se puede descifrar. Nunca devuelve el cifrado. */
export function descifrarIban(guardado: string, studioId: string, mandatoId: string, claves: ClavesCredenciales): string | null {
  // Un IBAN en claro no puede existir (CHECK en la BD); si apareciera, no se da por bueno.
  if (!estaCifrado(guardado)) return null;
  const r = descifrarCredencial(guardado, contextoIban(studioId, mandatoId), claves);
  return r.ok ? r.valor : null;
}
