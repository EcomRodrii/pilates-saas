// ─────────────────────────────────────────────────────────────────────────────
// Teléfono para la llamada de puesta en marcha: validar, normalizar, enseñar.
//
// Puro y sin `@/` (se prueba con `node --test`). Lo usan el campo del asistente
// y el servidor, y tienen que decidir LO MISMO: si el cliente acepta un número
// que el servidor rechaza, la propietaria cree haber pedido una llamada y no la
// ha pedido.
//
// Se guarda en E.164 (`+34612345678`): sin espacios, sin guiones, con prefijo.
// Es lo único que no es ambiguo para quien marca.
// ─────────────────────────────────────────────────────────────────────────────

export interface Prefijo {
  /** Código de país sin el «+». */
  codigo: string;
  pais: string;
  /** Cifras del número nacional. España tiene un patrón propio; el resto, un rango. */
  min: number;
  max: number;
}

/** España primero (por defecto) y los países desde los que llegan estudios. */
export const PREFIJOS: readonly Prefijo[] = [
  { codigo: '34', pais: 'España', min: 9, max: 9 },
  { codigo: '351', pais: 'Portugal', min: 9, max: 9 },
  { codigo: '33', pais: 'Francia', min: 9, max: 9 },
  { codigo: '39', pais: 'Italia', min: 6, max: 11 },
  { codigo: '49', pais: 'Alemania', min: 7, max: 12 },
  { codigo: '44', pais: 'Reino Unido', min: 10, max: 10 },
  { codigo: '52', pais: 'México', min: 10, max: 10 },
  { codigo: '54', pais: 'Argentina', min: 10, max: 11 },
  { codigo: '56', pais: 'Chile', min: 9, max: 9 },
  { codigo: '57', pais: 'Colombia', min: 10, max: 10 },
  { codigo: '1', pais: 'EE. UU. / Canadá', min: 10, max: 10 },
] as const;

export const PREFIJO_POR_DEFECTO = '34';

/** Solo las cifras de lo que haya escrito: «612 34 56 78», «612-345-678», «(612)…». */
export function soloCifras(texto: string): string {
  return texto.replace(/\D+/g, '');
}

export type ResultadoTelefono =
  | { ok: true; e164: string; nacional: string }
  | { ok: false; error: string };

/**
 * Valida y normaliza. `numero` puede traer espacios, guiones o incluso el
 * prefijo pegado («+34 612 34 56 78»): quien pega el número de su móvil no tiene
 * por qué quitarlo a mano.
 */
export function normalizarTelefono(prefijo: string, numero: string): ResultadoTelefono {
  const pref = PREFIJOS.find((p) => p.codigo === prefijo);
  if (!pref) return { ok: false, error: 'Elige el prefijo de tu país.' };

  let digitos = soloCifras(numero);
  const traePrefijo = numero.trim().startsWith('+') || numero.trim().startsWith('00');
  if (traePrefijo) {
    // «+34…» o «0034…»: se quita SOLO si es el prefijo elegido. Si es otro, el
    // número no cuadra con el país y se pide que lo corrija en vez de adivinar.
    const sinCeros = numero.trim().startsWith('00') ? digitos.slice(2) : digitos;
    if (!sinCeros.startsWith(pref.codigo)) {
      return { ok: false, error: 'El prefijo del número no coincide con el país elegido.' };
    }
    digitos = sinCeros.slice(pref.codigo.length);
  }
  if (digitos.length === 0) return { ok: false, error: 'Escribe tu teléfono.' };

  if (pref.codigo === '34') {
    // Móviles 6/7 y fijos 8/9. Nueve cifras exactas.
    if (!/^[6-9]\d{8}$/.test(digitos)) {
      return { ok: false, error: 'Revisa el teléfono: son 9 cifras y empieza por 6, 7, 8 o 9.' };
    }
  } else if (digitos.length < pref.min || digitos.length > pref.max) {
    return { ok: false, error: 'Revisa el teléfono: no tiene las cifras de ese país.' };
  }
  return { ok: true, e164: `+${pref.codigo}${digitos}`, nacional: digitos };
}

/** «612 34 56 78» mientras se escribe (solo España; el resto, en bloques de tres). */
export function formatearNacional(prefijo: string, numero: string): string {
  const d = soloCifras(numero).slice(0, 12);
  if (prefijo === PREFIJO_POR_DEFECTO) {
    const g = [d.slice(0, 3), d.slice(3, 5), d.slice(5, 7), d.slice(7, 9)];
    return g.filter(Boolean).join(' ');
  }
  return d.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

/** Para enseñarlo en /interno: «+34 612 34 56 78». */
export function mostrarE164(e164: string): string {
  const m = /^\+(\d{1,3})(\d+)$/.exec(e164);
  if (!m) return e164;
  const pref = PREFIJOS.find((p) => e164.startsWith(`+${p.codigo}`));
  if (!pref) return e164;
  const nac = e164.slice(1 + pref.codigo.length);
  return `+${pref.codigo} ${formatearNacional(pref.codigo, nac)}`;
}

/** Máscara para cualquier traza: nunca el número entero fuera de la base de datos. */
export function enmascarar(e164: string): string {
  return e164.length > 4 ? `${e164.slice(0, 3)}…${e164.slice(-2)}` : '…';
}
