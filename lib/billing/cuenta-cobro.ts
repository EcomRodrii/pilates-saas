// ─────────────────────────────────────────────────────────────────────────────
// Cuenta de cobro del estudio: dónde entra el dinero de las socias.
//
// Son cuatro columnas de `studios` —`stripe_account_id` (Connect, direct
// charges) y los datos SEPA con los que se genera la remesa del cuaderno 19.14
// (`sepa_iban`, `sepa_acreedor_id`, `sepa_titular`)— y ya no las escribe el
// navegador: `authenticated` no tiene privilegio sobre ellas (migr
// 20260913160100). Pasan por rutas de servidor que usan estas reglas.
//
// Puro a propósito (sin Supabase ni React) para poder probarlo con node --test.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizarIBAN, validarIBAN } from '../sepa-19-14.ts';
import type { Rol } from '../types.ts';

// Quién puede cambiar a qué cuenta va el dinero. No basta con el rol
// PROPIETARIO: hay fichas de equipo con ese rol que no son la dueña del estudio,
// y cambiar la cuenta de cobro es decidir de quién es el dinero. Es la misma
// persona que firmó el alta, que es la que tiene la relación con Stripe.
export function puedeCambiarCuentaDeCobro(p: { rol: Rol; esDuena: boolean }): boolean {
  return p.esDuena && p.rol === 'PROPIETARIO';
}

// Identificador de cuenta conectada de Stripe. Solo lo produce Stripe (el
// callback OAuth de Connect); se valida igual antes de guardarlo.
export function esStripeAccountIdValido(valor: unknown): valor is string {
  return typeof valor === 'string' && /^acct_[A-Za-z0-9]{8,64}$/.test(valor);
}

// Identificador de acreedor SEPA (Creditor Scheme Id, AT-02 del rulebook):
// país (2) + dígitos de control (2) + código de negocio (3, libre) + id
// nacional. Los dígitos de control se calculan con ISO 7064 mod 97-10 sobre el
// id nacional seguido del país y los dos dígitos — el código de negocio NO
// entra en el cálculo, a diferencia del IBAN.
export function normalizarAcreedorSepa(valor: string): string {
  return valor.replace(/\s+/g, '').toUpperCase();
}

export function validarAcreedorSepa(valor: string): boolean {
  const s = normalizarAcreedorSepa(valor);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{3}[A-Z0-9]{1,28}$/.test(s)) return false;
  const reordenado = s.slice(7) + s.slice(0, 4);
  let resto = 0;
  for (const ch of reordenado) {
    const v = ch >= 'A' && ch <= 'Z' ? ch.charCodeAt(0) - 55 : ch.charCodeAt(0) - 48;
    resto = (resto * (v > 9 ? 100 : 10) + v) % 97;
  }
  return resto === 1;
}

export interface DatosSepa {
  sepaAcreedorId: string | null;
  sepaIban: string | null;
  sepaTitular: string | null;
}

export type ResultadoSepa =
  | { ok: true; datos: DatosSepa }
  | { ok: false; error: string };

// El SEPA admite 70 caracteres en el nombre del titular (Cdtr/Nm).
const MAX_TITULAR = 70;

function texto(valor: unknown): string | null {
  if (valor == null) return null;
  if (typeof valor !== 'string') return null;
  const t = valor.trim();
  return t === '' ? null : t;
}

// Valida y normaliza lo que manda el formulario. Vacío = borrar ese dato (la
// pantalla ya dejaba guardar los tres por separado); lo que se escribe tiene que
// ser válido, porque un IBAN mal copiado no falla aquí sino en el banco, días
// después, con la remesa entera rechazada.
export function validarDatosSepa(entrada: unknown): ResultadoSepa {
  if (entrada == null || typeof entrada !== 'object') {
    return { ok: false, error: 'Faltan los datos SEPA.' };
  }
  const e = entrada as Record<string, unknown>;
  for (const campo of ['sepaAcreedorId', 'sepaIban', 'sepaTitular']) {
    if (e[campo] != null && typeof e[campo] !== 'string') {
      return { ok: false, error: 'Los datos SEPA no tienen el formato esperado.' };
    }
  }

  const acreedor = texto(e.sepaAcreedorId);
  const iban = texto(e.sepaIban);
  const titular = texto(e.sepaTitular);

  if (acreedor && !validarAcreedorSepa(acreedor)) {
    return { ok: false, error: 'El identificador de acreedor SEPA no es válido. Revísalo con el que te dio tu banco.' };
  }
  if (iban && !validarIBAN(iban)) {
    return { ok: false, error: 'El IBAN no es válido. Revisa que esté completo y sin errores.' };
  }
  if (titular && titular.length > MAX_TITULAR) {
    return { ok: false, error: `El titular no puede tener más de ${MAX_TITULAR} caracteres.` };
  }

  return {
    ok: true,
    datos: {
      sepaAcreedorId: acreedor ? normalizarAcreedorSepa(acreedor) : null,
      sepaIban: iban ? normalizarIBAN(iban) : null,
      sepaTitular: titular,
    },
  };
}

// Para el registro de actividad: nunca el IBAN entero en un feed que ve más
// gente que la dueña.
export function ibanEnmascarado(iban: string | null): string {
  if (!iban) return 'sin IBAN';
  const s = normalizarIBAN(iban);
  return s.length <= 4 ? '••••' : `•••• ${s.slice(-4)}`;
}
