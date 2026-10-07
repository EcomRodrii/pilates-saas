// ─────────────────────────────────────────────────────────────────────────────
// A quién se le impone la visita, y qué pasos se le enseñan a cada cual.
//
// OBLIGATORIA solo si se cumple TODO:
//   · `tourObligatorio`: lo fija un TRIGGER al nacer el estudio (migración
//     20261007211202), nunca el cliente. Nace false en todos los que ya existían:
//     ni Rítmica La Luna ni ninguna sede de cadena se entera.
//   · no la ha completado ya,
//   · quien mira es la PROPIETARIA (MANAGER y RECEPCION no la ven obligatoria: no
//     son quienes montan el estudio),
//   · no es una sede de cadena, y ya vio la bienvenida (la visita empieza después
//     de ella, no encima).
//
// Para todos los demás hay una visita OPCIONAL con las mismas pantallas y su «Salir»
// (desde «Primeros pasos»).
// ─────────────────────────────────────────────────────────────────────────────

import { rutaBase, type PasoVisita } from './capitulos.ts';

export interface EstudioParaVisita {
  tourObligatorio?: boolean | null;
  tourCompletadoEn?: string | null;
  cadenaId?: string | null;
  bienvenidaVistaEn?: string | null;
}

export function visitaObligatoria(studio: EstudioParaVisita | null | undefined, rol: string | null | undefined): boolean {
  if (!studio) return false;
  return studio.tourObligatorio === true
    && !studio.tourCompletadoEn
    && rol === 'PROPIETARIO'
    && !studio.cadenaId
    && !!studio.bienvenidaVistaEn;
}

export interface ContextoAplica {
  puedeVer: (ruta: string) => boolean;
  esRutaCongelada: (ruta: string) => boolean;
  /** Pantalla ancha (≥ lg): el buscador de arriba y poco más solo existen ahí. */
  escritorio: boolean;
}

/** ¿Se le enseña este paso a esta persona ahora? Falso = se salta sin ruido. */
export function pasoAplica(paso: PasoVisita, c: ContextoAplica): boolean {
  const base = rutaBase(paso.ruta);
  if (c.esRutaCongelada(base)) return false;
  if (!c.puedeVer(base)) return false;
  if (paso.soloEscritorio && !c.escritorio) return false;
  return true;
}
