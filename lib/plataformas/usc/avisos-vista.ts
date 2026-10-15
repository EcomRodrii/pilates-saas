// Lo que ve la propietaria en Conexiones › Urban Sports Club, a partir de los
// avisos que tiene como candidata. Puro, sin `@/`.
//
// Solo tres cosas que decidir para ella: «¿es tu centro?» (pendiente), «ya no
// está» (baja / fin) y «hay otro distinto» (conflicto). Nunca sale de aquí un
// id de proveedor ni nada de otro estudio.
import type { TipoAvisoIntegradorUsc } from './avisos.ts';
import { vigentePorProveedor } from './avisos-decision.ts';

export interface FilaAvisoVista {
  tipo: TipoAvisoIntegradorUsc;
  provider_id: string;
  provider_nombre: string | null;
  estado: string;
  modificado_usc: string | null;
  fin: string | null;
  recibido_en: string;
}

export type SituacionAviso = 'pendiente' | 'rechazado' | 'conflicto' | 'baja' | 'fin';

export interface VistaAviso {
  situacion: SituacionAviso;
  /** Nombre que USC da al centro; null si el aviso no lo traía. */
  nombre: string | null;
  /** Solo `fin`: ISO. */
  fin: string | null;
}

/** Ventana de lectura: un aviso más viejo ya no cuenta (un `Removed` falso no queda para siempre). */
export const DIAS_VIGENCIA_AVISO = 180;

export function vistaDeAvisos(
  filas: FilaAvisoVista[],
  estudio: { providerId: string | null; integracionActiva: boolean },
  ahora: number = Date.now(),
): VistaAviso | null {
  const recientes = filas.filter(f => ahora - Date.parse(f.recibido_en) <= DIAS_VIGENCIA_AVISO * 86400_000);
  const alta = [...recientes].filter(f => f.tipo === 'IntegratorAssociated')
    .sort((a, b) => Date.parse(b.recibido_en) - Date.parse(a.recibido_en))[0];
  if (!alta) return null;
  const proveedor = alta.provider_id;
  const vigente = vigentePorProveedor(recientes
    .filter(f => f.provider_id === proveedor)
    .map(f => ({ ...f, modificado: f.modificado_usc, recibidoEn: f.recibido_en })));
  if (!vigente) return null;
  const nombre = alta.provider_nombre;
  const suyo = estudio.providerId?.toLowerCase() === proveedor;

  if (vigente.tipo === 'IntegratorRemoved') return suyo ? { situacion: 'baja', nombre, fin: null } : null;
  if (suyo) {
    return vigente.tipo === 'IntegratorUpdated' && vigente.fin
      ? { situacion: 'fin', nombre, fin: vigente.fin }
      : null;
  }
  if (estudio.providerId) return { situacion: 'conflicto', nombre, fin: null };
  if (alta.estado === 'CONFLICTO') return { situacion: 'conflicto', nombre, fin: null };
  if (alta.estado === 'RECHAZADO') return { situacion: 'rechazado', nombre, fin: null };
  if (alta.estado === 'PENDIENTE' && estudio.integracionActiva) return { situacion: 'pendiente', nombre, fin: null };
  return null;
}
