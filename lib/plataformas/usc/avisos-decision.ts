// Qué se hace con un aviso de integrador de USC al recibirlo, sin base de datos.
// Puro, sin `@/`.
import type { AvisoIntegradorUsc, TipoAvisoIntegradorUsc } from './avisos.ts';

/** Sin tildes, en mayúsculas, sin signos y con los espacios colapsados: para comparar nombres de negocio. */
export function normalizarNombre(n: string): string {
  return n.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ').trim();
}

/** Texto estable del aviso: dos entregas del mismo aviso dan el mismo texto. Se hashea (sha256) fuera. */
export function textoHuellaAviso(a: AvisoIntegradorUsc): string {
  return [a.tipo, a.providerId, a.locationId ?? '', a.inicio ?? '', a.fin ?? '', a.modificado ?? ''].join('|');
}

export type EstadoAviso = 'SIN_ASIGNAR' | 'PENDIENTE' | 'CONFIRMADO' | 'RECHAZADO' | 'CONFLICTO' | 'INFORMATIVO';

export interface EstudioCoincidente {
  studioId: string;
  /** `providerId` que ya tiene guardado en su configuración de USC, si lo hay. */
  providerIdActual: string | null;
}

/**
 * En qué queda un aviso al recibirlo. NUNCA se aplica nada: lo más que pasa es
 * `PENDIENTE` (se le ofrece a UN estudio, que tiene que confirmarlo).
 *
 * `coincidencias`: para `IntegratorAssociated`, los estudios de TODA la
 * plataforma cuyo nombre normalizado es el del aviso (no solo los que usan USC:
 * si no, un estudio que copiara el nombre de otro quedaría como único
 * candidato). Para los demás tipos, los estudios que ya tienen ese proveedor
 * (pegado a mano).
 * `confirmadoPor`: estudio que ya confirmó este proveedor, si lo hay.
 */
export function decidirEstadoAviso(args: {
  tipo: TipoAvisoIntegradorUsc;
  providerId: string;
  coincidencias: EstudioCoincidente[];
  confirmadoPor: string | null;
}): { estado: EstadoAviso; candidato: string | null } {
  const { tipo, providerId, coincidencias, confirmadoPor } = args;
  if (tipo !== 'IntegratorAssociated') {
    // Solo informan al estudio que YA tiene ese proveedor; a nadie más.
    const dueno = confirmadoPor ?? (coincidencias.length === 1 ? coincidencias[0].studioId : null);
    return dueno ? { estado: 'INFORMATIVO', candidato: dueno } : { estado: 'SIN_ASIGNAR', candidato: null };
  }
  if (coincidencias.length !== 1) return { estado: 'SIN_ASIGNAR', candidato: null };
  const c = coincidencias[0];
  if (confirmadoPor && confirmadoPor !== c.studioId) return { estado: 'CONFLICTO', candidato: c.studioId };
  if (c.providerIdActual && c.providerIdActual.toLowerCase() === providerId) return { estado: 'INFORMATIVO', candidato: c.studioId };
  if (c.providerIdActual) return { estado: 'CONFLICTO', candidato: c.studioId };
  return { estado: 'PENDIENTE', candidato: c.studioId };
}

export interface FilaAviso {
  tipo: TipoAvisoIntegradorUsc;
  modificado: string | null;
  recibidoEn: string;
}

/**
 * El aviso de PROVEEDOR vigente (Associated/Updated/Removed): el de `ModifiedDate`
 * más reciente. No hay estado mutable que un aviso viejo pueda pisar: se leen
 * todos y manda el último, lleguen en el orden que lleguen.
 */
export function vigentePorProveedor<T extends FilaAviso>(filas: T[]): T | null {
  let mejor: T | null = null;
  for (const f of filas) {
    if (f.tipo !== 'IntegratorAssociated' && f.tipo !== 'IntegratorUpdated' && f.tipo !== 'IntegratorRemoved') continue;
    if (!mejor) { mejor = f; continue; }
    const a = Date.parse(f.modificado ?? ''), b = Date.parse(mejor.modificado ?? '');
    if (a > b || (a === b && Date.parse(f.recibidoEn) > Date.parse(mejor.recibidoEn))) mejor = f;
  }
  return mejor;
}
