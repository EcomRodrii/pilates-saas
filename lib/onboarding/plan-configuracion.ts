// ─────────────────────────────────────────────────────────────────────────────
// §8 — De las respuestas del onboarding a configuración REAL del estudio.
//
// El problema que resuelve: el asistente de bienvenida ya preguntaba seis
// cosas y guardaba las seis en `studios.onb_*`… y NADIE las leía. Comprobado
// con grep: las únicas tres referencias de cada columna fuera del propio
// asistente son el mapper de escritura, el mapper de lectura y la declaración
// de tipo. Cero lógica de negocio. Encima el asistente promete en pantalla
// cosas que no pasaban ("activamos la vista multicentro", "ajustamos los
// límites a tu tamaño real"). Eso es exactamente lo que no se quiere: datos
// que se guardan y no se usan.
//
// Este módulo es la mitad PURA del arreglo: respuestas → lista de cosas a
// crear. No toca la base de datos, así que se puede probar entera con
// `node --test`. El ejecutor (app/api/onboarding/configurar) solo aplica el
// plan y es deliberadamente tonto.
//
// Dos reglas que definen el diseño:
//
//   1. **Nada que pueda cobrar dinero se crea activo.** Un bono con un precio
//      inventado es peor que no tener bono: se puede comprar. Los planes se
//      crean con `activo: false` y `precio: 0` — un BORRADOR con la forma
//      correcta, que la propietaria completa poniendo su precio. Verificado
//      que `/api/stripe/checkout` rechaza un plan inactivo (`if (!plan.activo)`
//      → 409), así que un borrador no puede cobrarle a nadie.
//   2. **Solo se crea lo que la propietaria ha dicho.** Sin respuesta, no se
//      inventa nada: el plan sale vacío para esa parte. Rellenar huecos con
//      valores "sensatos" es como se acaba con un estudio de 3 salas que tiene
//      una sala "Sala 1" de aforo 10 que nadie pidió.
// ─────────────────────────────────────────────────────────────────────────────

import type { NivelClase, TipoPlan } from '@/lib/types';

// Paleta compartida con el formulario de salas (`colorSalaPorDefecto`): dos
// salas del mismo color dejan de distinguir nada en el calendario.
const COLORES = ['#F7A6C4', '#7FB2E5', '#8FC98A', '#E8B45C', '#B79BE0', '#5FC2C2'];

export function colorPorIndice(i: number): string {
  return COLORES[i % COLORES.length];
}

// Los tipos de clase que puede elegir en el asistente. Lista CERRADA a
// propósito: es la que se le enseña como opciones, y así el plan no depende de
// texto libre que habría que sanear. Quien quiera "Barre Concept" lo crea
// después en Configuración — el onboarding cubre el caso normal, no todos.
export const TIPOS_CLASE_SUGERIDOS = [
  'Reformer', 'Mat', 'Cadillac', 'Barril', 'Silla', 'Prenatal', 'Suelo pélvico', 'Rehabilitación',
] as const;
export type TipoClaseSugerido = (typeof TIPOS_CLASE_SUGERIDOS)[number];

export interface RespuestasOperativa {
  /** Cuántas salas tiene. Ausente = no crear ninguna. */
  numSalas?: number;
  /** Plazas por sala. Sin esto no se crea sala: el aforo ES el límite de reservas. */
  aforoPorSala?: number;
  /** Duración habitual de una clase, en minutos. */
  duracionMinutos?: number;
  /** Tipos de clase que da, de la lista cerrada de arriba. */
  tiposClase?: string[];
  /** Vende bonos de sesiones. */
  usaBonos?: boolean;
  /** Vende cuotas mensuales. */
  usaMembresias?: boolean;
  /** Vende clases sueltas.
   *
   *  ⚠️ «Clase suelta» se ofrecía en el asistente desde el principio y aquí NO
   *  se miraba: la propietaria la elegía, el asistente decía «dejamos preparado
   *  lo que uses» y no se creaba nada. Es el mismo fallo que este módulo
   *  existe para arreglar —datos que se recogen y no se usan— colado dentro
   *  del propio arreglo. */
  usaClaseSuelta?: boolean;
  /** Da clases ella misma. Crea su ficha de instructora, que es lo que permite
   *  asignarse una clase en el calendario el primer día. */
  imparteClases?: boolean;
  /** Franja en la que da clases, en horas 'HH:MM:SS'. Ausente = no tocar la
   *  del estudio. */
  horaApertura?: string;
  horaCierre?: string;
}

export interface SalaAPlanificar { nombre: string; capacidad: number; color: string }
export interface TipoClaseAPlanificar {
  nombre: string; color: string; duracionMinutos: number; nivel: NivelClase;
}
export interface PlanAPlanificar {
  nombre: string; tipo: TipoPlan; precio: number; sesiones: number | null;
  /** Siempre false: ver regla 1 de la cabecera. */
  activo: false;
}

export interface PlanConfiguracion {
  salas: SalaAPlanificar[];
  tiposClase: TipoClaseAPlanificar[];
  planes: PlanAPlanificar[];
  /** Si hay que darla de alta como instructora de su propio estudio. No lleva
   *  nombre ni email: los pone el ejecutor desde la SESIÓN, nunca desde el
   *  body — mismo criterio que el `studio_id`. */
  instructoraPropia: boolean;
  /** La franja del calendario. `null` = no tocarla.
   *
   *  ⚠️ Es la ÚNICA parte del plan que MODIFICA algo existente en vez de crear
   *  filas nuevas — `studios.hora_apertura/hora_cierre` son NOT NULL con
   *  default 08:00/22:00, así que la fila siempre trae un valor. Por eso el
   *  ejecutor solo escribe si lo que hay es EXACTAMENTE ese default: es la
   *  única forma de distinguir «no lo ha tocado» de «lo ha puesto a mano», y
   *  sin esa comprobación reenviar el asistente le pisaría un horario que ella
   *  ya hubiera ajustado. */
  horario: { apertura: string; cierre: string } | null;
}

/** El default de la columna en la BD. Si el estudio tiene esto, nadie lo ha
 *  tocado. Vive aquí, con nombre, para que el ejecutor no lleve dos horas
 *  sueltas en un `if` sin explicación. */
export const HORARIO_POR_DEFECTO = { apertura: '08:00:00', cierre: '22:00:00' } as const;

// Topes de cordura. No son política de producto: son el freno a un número
// absurdo (un 0, un negativo, un 999 de un dedo resbalado) creando 999 filas.
const MAX_SALAS = 20;
const MAX_AFORO = 100;
const DURACION_MIN = 15;
const DURACION_MAX = 180;

function enteroEntre(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  return n >= min && n <= max ? n : null;
}

/**
 * Respuestas → qué crear. Determinista y sin efectos: la misma entrada da
 * siempre el mismo plan, que es lo que permite probarlo y lo que hace que el
 * ejecutor pueda ser idempotente comparando por nombre.
 */
export function planificarConfiguracion(r: RespuestasOperativa): PlanConfiguracion {
  const numSalas = enteroEntre(r.numSalas, 1, MAX_SALAS);
  const aforo = enteroEntre(r.aforoPorSala, 1, MAX_AFORO);
  const duracion = enteroEntre(r.duracionMinutos, DURACION_MIN, DURACION_MAX);

  // Una sala sin aforo no se crea: el aforo de la sala es lo que limita cuánta
  // gente entra en cada clase, así que una sala con un aforo inventado deja
  // pasar (o corta) reservas reales. Es el caso donde callarse es más seguro.
  const salas: SalaAPlanificar[] = numSalas && aforo
    ? Array.from({ length: numSalas }, (_, i) => ({
        // "Sala 1..N" cuando hay varias; con una sola, "Sala" a secas — un
        // "Sala 1" en un estudio de una sala solo invita a preguntarse dónde
        // está la 2.
        nombre: numSalas === 1 ? 'Sala' : `Sala ${i + 1}`,
        capacidad: aforo,
        color: colorPorIndice(i),
      }))
    : [];

  // Sin duración no se crean tipos de clase: `duracion_minutos` es NOT NULL en
  // la tabla y además decide dónde acaba cada clase en el calendario.
  const elegidos = (r.tiposClase ?? []).filter(
    (t): t is TipoClaseSugerido => (TIPOS_CLASE_SUGERIDOS as readonly string[]).includes(t),
  );
  // Dedup preservando el orden en que los eligió: dos "Reformer" romperían la
  // idempotencia por nombre del ejecutor.
  const unicos = [...new Set(elegidos)];
  const tiposClase: TipoClaseAPlanificar[] = duracion
    ? unicos.map((nombre, i) => ({
        nombre,
        color: colorPorIndice(i),
        duracionMinutos: duracion,
        // 'TODOS' y no un nivel concreto: el asistente no pregunta por nivel, y
        // marcar 'PRINCIPIANTE' a ciegas escondería la clase a quien busca otro
        // nivel en la página pública.
        nivel: 'TODOS' as NivelClase,
      }))
    : [];

  // Borradores, nunca vendibles (regla 1). El nombre lleva el número de
  // sesiones porque es lo primero que se busca en la lista de planes.
  const planes: PlanAPlanificar[] = [];
  if (r.usaBonos) {
    planes.push({ nombre: 'Bono 10 sesiones', tipo: 'BONO', precio: 0, sesiones: 10, activo: false });
  }
  if (r.usaMembresias) {
    planes.push({ nombre: 'Cuota mensual', tipo: 'MENSUAL', precio: 0, sesiones: null, activo: false });
  }
  // `PUNTUAL` con una sesión: es literalmente «una clase». Va con el mismo
  // freno que los otros dos —precio 0 y `activo: false`— porque es igual de
  // vendible que ellos en cuanto alguien le ponga precio.
  if (r.usaClaseSuelta) {
    planes.push({ nombre: 'Clase suelta', tipo: 'PUNTUAL', precio: 0, sesiones: 1, activo: false });
  }

  // Solo si vienen las DOS y en orden: media franja no dice nada, y una
  // apertura posterior al cierre dejaría el calendario sin ninguna fila
  // visible — peor que el default.
  const horario = r.horaApertura && r.horaCierre && r.horaApertura < r.horaCierre
    ? { apertura: r.horaApertura, cierre: r.horaCierre }
    : null;

  return { salas, tiposClase, planes, instructoraPropia: r.imparteClases === true, horario };
}

/** ¿Hay algo que hacer? Evita llamar al ejecutor para nada.
 *
 *  ⚠️ `instructoraPropia` cuenta. Sin mirarla, una propietaria que solo
 *  contestara «sí, doy clases» y nada más tendría un plan «vacío», el asistente
 *  no llamaría al ejecutor y su ficha no se crearía nunca — en silencio, que es
 *  la peor forma de no hacer algo. */
export function planVacio(p: PlanConfiguracion): boolean {
  return p.salas.length === 0 && p.tiposClase.length === 0
    && p.planes.length === 0 && !p.instructoraPropia && !p.horario;
}

// ─── Etiquetas del asistente → respuestas ────────────────────────────────────
//
// El asistente guarda lo que la propietaria TOCÓ, es decir la etiqueta literal
// ("8 plazas", "50 minutos"). La traducción a números vive aquí, con test, y no
// en el componente: es justo el sitio donde un "4 o más" mal interpretado crea
// una sala de aforo NaN, y en un `.tsx` no se puede probar con `node --test`.
//
// Las listas de opciones se exportan para que el asistente las pinte DESDE
// AQUÍ. Así la etiqueta que se enseña y la que se interpreta son literalmente
// el mismo dato y no pueden divergir al editar una de las dos.

export const OPCIONES_SALAS = ['1 sala', '2 salas', '3 salas', '4 o más'] as const;
export const OPCIONES_AFORO = ['4 plazas', '6 plazas', '8 plazas', '10 plazas', '12 o más'] as const;
export const OPCIONES_DURACION = ['45 minutos', '50 minutos', '55 minutos', '60 minutos'] as const;
export const OPCIONES_COBRO = ['Bonos de sesiones', 'Cuota mensual', 'Clase suelta'] as const;
export const OPCIONES_IMPARTE = ['Sí, yo doy clases', 'No, solo gestiono'] as const;

/** Franjas de clase. La etiqueta LLEVA las horas y las horas viven en la misma
 *  fila: así lo que se pinta y lo que se interpreta no son dos listas que
 *  puedan divergir, sino el mismo dato — mismo criterio que el resto de
 *  opciones de este módulo.
 *
 *  Cuatro y no un selector de horas: es una pregunta de un toque. Quien tenga
 *  una franja rara la ajusta en Configuración, que es donde de todos modos
 *  está el horario por día. */
export const OPCIONES_HORARIO = [
  { label: 'Solo mañanas (7:00 a 15:00)', apertura: '07:00:00', cierre: '15:00:00' },
  { label: 'Solo tardes (15:00 a 22:00)', apertura: '15:00:00', cierre: '22:00:00' },
  { label: 'Mañana y tarde (7:00 a 22:00)', apertura: '07:00:00', cierre: '22:00:00' },
  { label: 'De 9:00 a 21:00', apertura: '09:00:00', cierre: '21:00:00' },
] as const;

// "4 o más" / "12 o más" se quedan en el número que dicen, no en un invento
// mayor: si tiene 7 salas, crear 4 y que añada 3 es mucho mejor que crear 10 y
// que borre 3. Lo mismo con el aforo, donde además pasarse deja entrar reservas
// que no caben.
const NUMERO_INICIAL = /^(\d+)/;

function numeroDeEtiqueta(etiqueta: string | undefined): number | undefined {
  const m = etiqueta?.trim().match(NUMERO_INICIAL);
  return m ? Number(m[1]) : undefined;
}

export function interpretarRespuestasWizard(ans: {
  salas?: string;
  aforo?: string;
  duracion?: string;
  clases?: string[];
  cobro?: string[];
  imparte?: string;
  horario?: string;
}): RespuestasOperativa {
  const cobro = ans.cobro ?? [];
  return {
    numSalas: numeroDeEtiqueta(ans.salas),
    aforoPorSala: numeroDeEtiqueta(ans.aforo),
    duracionMinutos: numeroDeEtiqueta(ans.duracion),
    tiposClase: ans.clases ?? [],
    usaBonos: cobro.includes('Bonos de sesiones'),
    usaMembresias: cobro.includes('Cuota mensual'),
    usaClaseSuelta: cobro.includes('Clase suelta'),
    // Se compara contra la etiqueta EXACTA que se pinta, que sale de
    // OPCIONES_IMPARTE — no contra un `startsWith('Sí')` que se rompería al
    // reescribir el texto de la opción.
    imparteClases: ans.imparte === OPCIONES_IMPARTE[0],
    // Se busca la fila por su etiqueta exacta; si no está (respuesta vieja,
    // borrador manipulado), no se toca el horario del estudio.
    ...(() => {
      const f = OPCIONES_HORARIO.find(o => o.label === ans.horario);
      return f ? { horaApertura: f.apertura, horaCierre: f.cierre } : {};
    })(),
  };
}
