// ─────────────────────────────────────────────────────────────────────────────
// Una tarifa, un sitio donde se decide qué se guarda.
//
// POR QUÉ EXISTE ESTO: había DOS formularios de la misma entidad —
// `/productos` (menú Ventas) y `configuración → Planes y tarifas`— cada uno con
// su copia de la derivación. Se separaron, y esa separación costó dos bugs de
// dinero seguidos: un bono de 120 € vendido desde una pantalla no generaba
// recibo, y no caducaba nunca (`fecha_fin` NULL) porque a ese formulario le
// faltaba el campo. Mismo concepto, dos verdades.
//
// A partir de aquí las dos pantallas pintan lo que quieran, pero LO QUE SE
// GUARDA se decide una sola vez, aquí, y está cubierto por tests. Añadir un
// campo nuevo a la tarifa se hace en este fichero, y entonces no puede
// quedarse a medias en una de las dos.
// ─────────────────────────────────────────────────────────────────────────────
import type { PlanTarifa, TipoPlan } from '@/lib/types';

// Cómo se llaman los tipos de tarifa EN CASTELLANO.
//
// `MENSUAL`, `BONO` y `PUNTUAL` son constantes de la base de datos, y se
// enseñaban tal cual —en mayúsculas— en el desplegable de crear tarifa, en su
// texto de ayuda y en la insignia de la tabla. Una dueña de estudio no dice
// «PUNTUAL»: dice «clase suelta». Aquí, junto al resto de la entidad, para que
// las dos pantallas de tarifas digan lo mismo.
export const NOMBRE_TIPO_PLAN: Record<TipoPlan, string> = {
  MENSUAL: 'Cuota mensual',
  BONO: 'Bono de sesiones',
  PUNTUAL: 'Clase suelta',
};

/** Una línea explicando cada tipo, para el desplegable de crear tarifa. */
export const EXPLICACION_TIPO_PLAN: Record<TipoPlan, string> = {
  MENSUAL: 'Se cobra sola cada mes hasta que la clienta se dé de baja.',
  BONO: 'Un puñado de sesiones que se van gastando conforme reserva.',
  PUNTUAL: 'Un pago único, sin renovación.',
};

/** El formulario en crudo: todo texto, como sale de los <input>. */
export type FormularioPlan = {
  nombre: string;
  descripcion: string;
  precio: string;
  tipo: PlanTarifa['tipo'];
  sesiones: string;
  validezDias: string;
  limiteSemanal: string;
  /** Vacío = el plan vale para todas las clases (lo de siempre). */
  tiposClaseIds: string[];
  activo: boolean;
  // P2 (auditoría "Veredicto de Marta"): fecha 'YYYY-MM-DD' de fin de una
  // oferta temporal sobre `precio`, o '' = sin oferta. Puramente informativa
  // (ver comentario en lib/types.ts) — no participa en ningún cálculo aquí.
  ofertaHasta: string;
};

/** Lo que se guarda: un plan sin los campos que pone el sistema. */
export type DatosPlan = Omit<PlanTarifa, 'id' | 'studioId'>;

// FÁBRICA, no constante: `tiposClaseIds` es un array, y una constante
// compartida significaría que dos formularios abiertos a la vez —o uno abierto
// dos veces seguidas— se pasan la misma lista. Hoy los chips crean arrays
// nuevos y no se notaría; el día que alguien haga un `.push()` sería un plan
// heredando las clases del anterior, y de esos fallos no se sospecha del
// formulario vacío.
export function planVacio(): FormularioPlan {
  return {
    nombre: '',
    descripcion: '',
    precio: '',
    tipo: 'MENSUAL',
    sesiones: '',
    validezDias: '',
    limiteSemanal: '',
    tiposClaseIds: [],
    activo: true,
    ofertaHasta: '',
  };
}

// Un mensual se RENUEVA, no caduca por días; un bono o un puntual sí. El límite
// semanal, en cambio, tiene sentido para cualquier tipo (un mensual ilimitado
// puede querer tope de 3 clases por semana).
export function caducaPorDias(tipo: PlanTarifa['tipo']): boolean {
  return tipo !== 'MENSUAL';
}

/** Plan guardado → formulario. */
export function planAFormulario(p: PlanTarifa): FormularioPlan {
  // `?? ''` y no `!== null ? ... : ''`: estos campos son OPCIONALES en el tipo,
  // así que pueden llegar `undefined` además de `null`. Con la comparación
  // estricta, un `undefined` pintaba el literal "undefined" dentro del input.
  const texto = (v: number | null | undefined) => (v ?? '').toString();
  return {
    nombre: p.nombre,
    descripcion: p.descripcion ?? '',
    precio: texto(p.precio),
    tipo: p.tipo,
    sesiones: texto(p.sesiones),
    validezDias: texto(p.validezDias),
    limiteSemanal: texto(p.limiteSemanal),
    tiposClaseIds: p.tiposClaseIds ?? [],
    activo: p.activo,
    ofertaHasta: p.ofertaHasta ?? '',
  };
}

// Un entero positivo o null. Evita que un "0", un "-3" o un "abc" acaben en la
// base de datos: 0 sesiones o 0 días de validez sería un bono nacido muerto, y
// NaN revienta más abajo sin decir dónde.
function enteroPositivo(v: string): number | null {
  if (!v.trim()) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Formulario → lo que se guarda. Es LA regla, y solo vive aquí. */
export function formularioAPlan(f: FormularioPlan): DatosPlan {
  const conCaducidad = caducaPorDias(f.tipo);
  const precio = parseFloat(f.precio);
  return {
    nombre: f.nombre.trim(),
    descripcion: f.descripcion.trim() || null,
    // Un precio ilegible es 0, no NaN: NaN se propaga hasta el recibo y ahí ya
    // no se sabe de dónde salió.
    precio: Number.isFinite(precio) && precio >= 0 ? precio : 0,
    tipo: f.tipo,
    sesiones: conCaducidad ? enteroPositivo(f.sesiones) : null,
    validezDias: conCaducidad ? enteroPositivo(f.validezDias) : null,
    limiteSemanal: enteroPositivo(f.limiteSemanal),
    tiposClaseIds: f.tiposClaseIds,
    activo: f.activo,
    ofertaHasta: f.ofertaHasta.trim() || null,
  };
}

/**
 * Por qué NO se puede guardar todavía, o null si está listo.
 * Devuelve el motivo en vez de un booleano para poder decírselo a quien lo
 * rellena: un botón gris sin explicación es de las cosas que más desesperan.
 */
export function motivoNoGuardable(f: FormularioPlan): string | null {
  if (!f.nombre.trim()) return 'Ponle un nombre a la tarifa';
  if (!f.precio.trim()) return 'Falta el precio';
  const precio = parseFloat(f.precio);
  if (!Number.isFinite(precio) || precio < 0) return 'El precio no puede ser negativo';
  // Un bono sin sesiones no es un bono: sería un plan que no da derecho a nada
  // y que la app no sabría descontar.
  if (caducaPorDias(f.tipo) && !enteroPositivo(f.sesiones)) {
    return 'Un bono necesita cuántas sesiones incluye';
  }
  return null;
}
