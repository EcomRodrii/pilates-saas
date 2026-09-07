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
// Relativo y con `.ts` explícita: el alias `@/` no lo resuelve el runner de
// `node --test`, y este módulo tiene tests propios. El `import type` de arriba
// sí puede usarlo porque desaparece al quitar los tipos.
import { mesesDeCiclo, nombrePeriodo } from '../bono-logic.ts';

// Cómo se llaman los tipos de tarifa EN CASTELLANO.
//
// `MENSUAL`, `BONO` y `PUNTUAL` son constantes de la base de datos, y se
// enseñaban tal cual —en mayúsculas— en el desplegable de crear tarifa, en su
// texto de ayuda y en la insignia de la tabla. Una dueña de estudio no dice
// «PUNTUAL»: dice «clase suelta». Aquí, junto al resto de la entidad, para que
// las dos pantallas de tarifas digan lo mismo.
export const NOMBRE_TIPO_PLAN: Record<TipoPlan, string> = {
  // «Cuota» a secas, no «Cuota mensual»: desde que una cuota puede ser
  // trimestral, semestral o anual (`periodicidadMeses`), la insignia de la
  // tabla llamaba «mensual» a una tarifa que se cobra cada tres meses. Cada
  // cuánto se cobra se dice junto al precio, que es donde importa.
  MENSUAL: 'Cuota',
  BONO: 'Bono de sesiones',
  PUNTUAL: 'Clase suelta',
};

/** Una línea explicando cada tipo, para el desplegable de crear tarifa. */
export const EXPLICACION_TIPO_PLAN: Record<TipoPlan, string> = {
  MENSUAL: 'Se cobra sola cada mes, trimestre, semestre o año hasta que la clienta se dé de baja.',
  BONO: 'Un puñado de sesiones que se van gastando conforme reserva.',
  PUNTUAL: 'Un pago único, sin renovación.',
};

/**
 * Cada cuánto se puede cobrar una cuota, para el desplegable.
 *
 * Los mismos cuatro valores que acota el CHECK de `planes_tarifa`
 * (migr 20260907031555). Si algún día se añade uno, se añade aquí y en el
 * CHECK — el `nombre` sale de `nombrePeriodo`, así que no hay una tercera
 * lista que mantener.
 */
export const PERIODICIDADES_CUOTA = [1, 3, 6, 12].map(meses => ({
  meses,
  /** «Cada mes», «Cada trimestre»… */
  etiqueta: `Cada ${nombrePeriodo({ periodicidadMeses: meses })}`,
}));

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
  /**
   * Cuota combinada: cuántas de CADA tipo por semana. Clave = tipo_clase_id,
   * valor = lo que se escribió (texto, como el resto del formulario; '' = sin
   * tope para ese tipo).
   *
   * Solo cuentan las claves que estén también en `tiposClaseIds`: desmarcar un
   * tipo NO borra su número, para que volver a marcarlo no obligue a
   * reescribirlo. Lo que se guarda lo filtra `datosDelFormulario`.
   */
  limitePorTipo: Record<string, string>;
  activo: boolean;
  // P2 (auditoría "Veredicto de Marta"): fecha 'YYYY-MM-DD' de fin de una
  // oferta temporal sobre `precio`, o '' = sin oferta. Puramente informativa
  // (ver comentario en lib/types.ts) — no participa en ningún cálculo aquí.
  ofertaHasta: string;
  /**
   * Cada cuántos meses se cobra la cuota, como string porque sale de un
   * `<select>`. Solo se usa con `tipo: 'MENSUAL'`.
   */
  periodicidadMeses: string;
  /** Cuota de alta en euros, o '' = sin matrícula. */
  matricula: string;
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
    limitePorTipo: {},
    activo: true,
    ofertaHasta: '',
    periodicidadMeses: '1',
    matricula: '',
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
    limitePorTipo: Object.fromEntries(
      Object.entries(p.limitePorTipo ?? {}).map(([k, v]) => [k, texto(v)]),
    ),
    activo: p.activo,
    ofertaHasta: p.ofertaHasta ?? '',
    periodicidadMeses: String(mesesDeCiclo(p)),
    // 0 = sin matrícula, y el input se enseña VACÍO, no con un «0» que hay que
    // borrar antes de escribir. Vacío vuelve a 0 en `formularioAPlan`, así que
    // la ida y vuelta no cambia nada.
    matricula: p.matricula ? String(p.matricula) : '',
  };
}

/**
 * El precio tal cual se escribe en España → número.
 *
 * ⚠️ `parseFloat('59,50')` es **59**, no 59,50: se para en la coma y se come
 * los céntimos sin avisar. Aquí se escribe con coma —es el separador decimal
 * del idioma— así que el formulario tiene que entenderla. Se acepta también el
 * punto, y se quitan los espacios y el símbolo de euro por si se pega un
 * importe copiado de otro sitio.
 *
 * Devuelve NaN si no hay un número legible, para que quien llame decida: la
 * validación protesta, y `formularioAPlan` cae a 0 antes que propagar un NaN
 * hasta el recibo.
 */
export function precioANumero(v: string): number {
  const limpio = v.replace(/[€\s]/g, '').replace(',', '.');
  if (!limpio || !/^-?\d*\.?\d*$/.test(limpio)) return NaN;
  return parseFloat(limpio);
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
  const precio = precioANumero(f.precio);
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
    // Solo de los tipos MARCADOS: un número dejado atrás al desmarcar no puede
    // acabar en la BD, donde significaría un tope sobre una actividad que este
    // plan ya ni cubre.
    //
    // Y solo se emite el campo si hay ALGÚN tope. Un plan de los de siempre
    // tiene que salir de aquí idéntico a como entró —hay un test de ida y
    // vuelta que lo exige— y un `{tc-1: null}` sería un campo nuevo donde antes
    // no había nada. Cuando se BORRA el último tope, `limitePorTipo` vuelve a
    // ausente y `sincronizarTiposDePlan` lo lee como «ninguno», que es
    // justamente lo que hay que escribir.
    ...limitesDeTipos(f),
    activo: f.activo,
    ofertaHasta: f.ofertaHasta.trim() || null,
    // Fuera de una cuota no hay ciclo que renovar (un bono manda por
    // `validezDias`, un puntual no se renueva), así que se guarda 1 — el valor
    // por defecto de la columna — en vez de arrastrar un «cada 3 meses» que
    // ninguna pantalla enseñaría y nadie usaría. Mismo criterio que `sesiones`.
    periodicidadMeses: f.tipo === 'MENSUAL' ? mesesDeCiclo({ periodicidadMeses: parseInt(f.periodicidadMeses, 10) }) : 1,
    matricula: importeNoNegativo(f.matricula),
  };
}

/**
 * Un importe en euros escrito a mano → número, nunca NaN ni negativo.
 *
 * Vacío es 0 («sin matrícula»), que es lo que la propietaria quiere decir al
 * dejar la caja en blanco. Un texto ilegible también cae a 0 y no a NaN: la
 * validación ya protesta antes de llegar aquí, y un NaN que se cuela llega
 * hasta el recibo, donde ya no se sabe de dónde salió (mismo criterio que
 * `precio`).
 */
function importeNoNegativo(v: string): number {
  if (!v.trim()) return 0;
  const n = precioANumero(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/** Los topes por actividad de los tipos marcados, o nada si no hay ninguno. */
function limitesDeTipos(f: FormularioPlan): { limitePorTipo?: Record<string, number | null> } {
  const pares = f.tiposClaseIds.map(id => [id, enteroPositivo(f.limitePorTipo[id] ?? '')] as const);
  if (!pares.some(([, v]) => v != null)) return {};
  return { limitePorTipo: Object.fromEntries(pares) };
}

/** Los campos del formulario que pueden llevar un error propio. */
export type CampoPlan = 'nombre' | 'precio' | 'sesiones' | 'validezDias' | 'limiteSemanal' | 'matricula';

/**
 * Qué está mal, CAMPO A CAMPO.
 *
 * Antes solo existía `motivoNoGuardable`, que devuelve el primer fallo como
 * una frase suelta: la pantalla la enseñaba encima de la botonera y quien
 * rellenaba tenía que adivinar a qué caja se refería. Aquí cada mensaje sabe
 * de quién es, y el formulario puede pintarlo pegado a su input.
 *
 * Añade además los tres estados imposibles que `enteroPositivo` se tragaba en
 * silencio: escribir `0` sesiones, `0` días de caducidad o `0` de límite
 * semanal se guardaba como `null` —es decir, como «sin caducidad» o «sin
 * tope»— que es lo contrario de lo que acababa de escribir la propietaria.
 */
export function erroresPlan(f: FormularioPlan): Partial<Record<CampoPlan, string>> {
  const e: Partial<Record<CampoPlan, string>> = {};

  if (!f.nombre.trim()) e.nombre = 'Ponle un nombre a la tarifa';

  const precio = precioANumero(f.precio);
  if (!f.precio.trim()) e.precio = 'Falta el precio';
  else if (!Number.isFinite(precio)) e.precio = 'Escribe el precio en números, por ejemplo 59,00';
  else if (precio < 0) e.precio = 'El precio no puede ser negativo';

  if (caducaPorDias(f.tipo) && !enteroPositivo(f.sesiones)) {
    e.sesiones = f.sesiones.trim()
      ? 'Tiene que ser un número entero mayor que 0'
      : 'Un bono necesita cuántas sesiones incluye';
  }
  // Estos dos son OPCIONALES: vacío es válido y significa «sin caducidad» /
  // «sin tope». Solo se protesta cuando hay algo escrito que no vale.
  if (f.validezDias.trim() && !enteroPositivo(f.validezDias)) {
    e.validezDias = 'Tiene que ser un número de días mayor que 0';
  }
  if (f.limiteSemanal.trim() && !enteroPositivo(f.limiteSemanal)) {
    e.limiteSemanal = 'Tiene que ser un número de clases mayor que 0';
  }
  // La matrícula es opcional (vacío = sin matrícula), pero si hay algo escrito
  // tiene que ser un importe de verdad: `importeNoNegativo` cae a 0 en
  // silencio, y guardar «sin matrícula» cuando se ha escrito «30 €uros» es
  // perder 30 € por socia sin que nadie avise.
  if (f.matricula.trim()) {
    const m = precioANumero(f.matricula);
    if (!Number.isFinite(m)) e.matricula = 'Escribe la matrícula en números, por ejemplo 30,00';
    else if (m < 0) e.matricula = 'La matrícula no puede ser negativa';
  }

  return e;
}

/**
 * Por qué NO se puede guardar todavía, o null si está listo.
 *
 * Se deriva de `erroresPlan` en un ORDEN FIJO para que siga diciendo lo mismo
 * que decía cuando era la única validación — la otra pantalla de tarifas
 * (`components/configuracion/tab-planes.tsx`) la sigue usando tal cual y no
 * debe cambiar de comportamiento porque aquí se haya afinado la presentación.
 */
export function motivoNoGuardable(f: FormularioPlan): string | null {
  const e = erroresPlan(f);
  const orden: CampoPlan[] = ['nombre', 'precio', 'sesiones', 'validezDias', 'limiteSemanal', 'matricula'];
  for (const campo of orden) if (e[campo]) return e[campo]!;
  return null;
}

/**
 * Las condiciones del plan dichas como se las diría a una clienta.
 *
 * Existe para que la propietaria no tenga que repetir a mano en la descripción
 * lo que ya ha rellenado en el formulario («Válido 2 meses» escrito debajo de
 * un campo de caducidad que ya dice 60). La descripción queda libre para lo
 * que de verdad aporta —el argumento de venta— y esto lo redacta la app.
 */
export function resumenCondicionesPlan(f: FormularioPlan): string[] {
  // La matrícula va la ÚLTIMA en los dos casos, y dice «solo la primera vez»
  // siempre: es la duda que trae de vuelta a la clienta al mostrador —«¿esto
  // me lo vais a cobrar cada trimestre?»— y contestarla aquí cuesta cinco
  // palabras.
  const matricula = importeNoNegativo(f.matricula);
  const conMatricula = (lineas: string[]) =>
    matricula > 0 ? [...lineas, `Matrícula de ${matricula} € solo la primera vez`] : lineas;

  if (f.tipo === 'MENSUAL') {
    const periodo = nombrePeriodo({ periodicidadMeses: parseInt(f.periodicidadMeses, 10) });
    const lineas = [`Se renueva y se cobra cada ${periodo}`];
    const tope = enteroPositivo(f.limiteSemanal);
    if (tope) lineas.push(`Máximo ${tope} ${tope === 1 ? 'clase' : 'clases'} por semana`);
    return conMatricula(lineas);
  }

  const lineas: string[] = [];
  if (f.tipo === 'PUNTUAL') {
    lineas.push('Una clase, pago único');
  } else {
    const n = enteroPositivo(f.sesiones);
    if (n) lineas.push(`${n} ${n === 1 ? 'sesión' : 'sesiones'}`);
  }
  const dias = enteroPositivo(f.validezDias);
  lineas.push(dias ? `Válido durante ${dias} días desde la compra` : 'Sin fecha de caducidad');
  const tope = enteroPositivo(f.limiteSemanal);
  if (tope) lineas.push(`Máximo ${tope} ${tope === 1 ? 'clase' : 'clases'} por semana`);
  return conMatricula(lineas);
}
