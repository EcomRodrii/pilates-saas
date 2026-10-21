// ─────────────────────────────────────────────────────────────────────────────
// Las 52 provincias españolas por las dos primeras cifras del código postal.
//
// Sin servicio externo: el código postal español lleva la provincia en sus dos
// primeras cifras (01 Álava … 52 Melilla). De cada una, dos cosas:
//   · `nombre`, lo que se le enseña a una persona («Provincia: Madrid», en el
//     alta nueva, lib/alta/tu-estudio.ts);
//   · `iso`, el código ISO 3166-2:ES sin el «ES-», que es lo que pide Stripe para
//     registrar el sitio de un datáfono (lib/pos/datafono.ts). Los 52 se
//     probaron uno a uno contra Stripe en modo de prueba el 5-oct-2026; los
//     nombres tienen variantes (Gerona/Girona, Vizcaya/Bizkaia) y el código no.
//
// Un solo mapa para los dos: antes vivía dentro del datáfono y el alta habría
// tenido que copiarlo.
//
// Puro, sin `@/`: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export interface Provincia {
  nombre: string;
  /** ISO 3166-2:ES sin «ES-» (28 → «M»). */
  iso: string;
}

export const PROVINCIAS: Readonly<Record<string, Provincia>> = {
  '01': { nombre: 'Álava', iso: 'VI' },
  '02': { nombre: 'Albacete', iso: 'AB' },
  '03': { nombre: 'Alicante', iso: 'A' },
  '04': { nombre: 'Almería', iso: 'AL' },
  '05': { nombre: 'Ávila', iso: 'AV' },
  '06': { nombre: 'Badajoz', iso: 'BA' },
  '07': { nombre: 'Illes Balears', iso: 'PM' },
  '08': { nombre: 'Barcelona', iso: 'B' },
  '09': { nombre: 'Burgos', iso: 'BU' },
  '10': { nombre: 'Cáceres', iso: 'CC' },
  '11': { nombre: 'Cádiz', iso: 'CA' },
  '12': { nombre: 'Castellón', iso: 'CS' },
  '13': { nombre: 'Ciudad Real', iso: 'CR' },
  '14': { nombre: 'Córdoba', iso: 'CO' },
  '15': { nombre: 'A Coruña', iso: 'C' },
  '16': { nombre: 'Cuenca', iso: 'CU' },
  '17': { nombre: 'Girona', iso: 'GI' },
  '18': { nombre: 'Granada', iso: 'GR' },
  '19': { nombre: 'Guadalajara', iso: 'GU' },
  '20': { nombre: 'Gipuzkoa', iso: 'SS' },
  '21': { nombre: 'Huelva', iso: 'H' },
  '22': { nombre: 'Huesca', iso: 'HU' },
  '23': { nombre: 'Jaén', iso: 'J' },
  '24': { nombre: 'León', iso: 'LE' },
  '25': { nombre: 'Lleida', iso: 'L' },
  '26': { nombre: 'La Rioja', iso: 'LO' },
  '27': { nombre: 'Lugo', iso: 'LU' },
  '28': { nombre: 'Madrid', iso: 'M' },
  '29': { nombre: 'Málaga', iso: 'MA' },
  '30': { nombre: 'Murcia', iso: 'MU' },
  '31': { nombre: 'Navarra', iso: 'NA' },
  '32': { nombre: 'Ourense', iso: 'OR' },
  '33': { nombre: 'Asturias', iso: 'O' },
  '34': { nombre: 'Palencia', iso: 'P' },
  '35': { nombre: 'Las Palmas', iso: 'GC' },
  '36': { nombre: 'Pontevedra', iso: 'PO' },
  '37': { nombre: 'Salamanca', iso: 'SA' },
  '38': { nombre: 'Santa Cruz de Tenerife', iso: 'TF' },
  '39': { nombre: 'Cantabria', iso: 'S' },
  '40': { nombre: 'Segovia', iso: 'SG' },
  '41': { nombre: 'Sevilla', iso: 'SE' },
  '42': { nombre: 'Soria', iso: 'SO' },
  '43': { nombre: 'Tarragona', iso: 'T' },
  '44': { nombre: 'Teruel', iso: 'TE' },
  '45': { nombre: 'Toledo', iso: 'TO' },
  '46': { nombre: 'Valencia', iso: 'V' },
  '47': { nombre: 'Valladolid', iso: 'VA' },
  '48': { nombre: 'Bizkaia', iso: 'BI' },
  '49': { nombre: 'Zamora', iso: 'ZA' },
  '50': { nombre: 'Zaragoza', iso: 'Z' },
  '51': { nombre: 'Ceuta', iso: 'CE' },
  '52': { nombre: 'Melilla', iso: 'ML' },
};

/** La provincia de un código postal español (cinco cifras), o `null` si no lo es (00…, 53…, «2800»). */
export function provinciaDeCp(codigoPostal: string | null | undefined): Provincia | null {
  const cp = (codigoPostal ?? '').trim();
  return /^\d{5}$/.test(cp) ? PROVINCIAS[cp.slice(0, 2)] ?? null : null;
}

/**
 * ¿Es de Canarias (35 Las Palmas, 38 Santa Cruz de Tenerife)? Tentare calcula
 * todo en hora peninsular (`TZ_ESTUDIO`, lib/utils.ts): allí los recordatorios
 * y los cierres de reserva irían una hora antes, y se dice.
 */
export function esCanarias(codigoPostal: string | null | undefined): boolean {
  return /^(35|38)\d{3}$/.test((codigoPostal ?? '').trim());
}
