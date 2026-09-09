// VALORACIÓN INICIAL — las reglas, sin React y sin base de datos.
//
// Qué es: lo que una alumna cuenta de sí misma antes de sus primeras clases,
// para que quien se la dé sepa a quién tiene delante. Qué NO es: una historia
// clínica. La diferencia no es de tono, es de alcance — aquí no se diagnostica,
// no se prescribe y no se pregunta nada que no vaya a cambiar lo que la
// instructora hace en la sala.
//
// ⚠️ La palabra «Assessment» no aparece en ningún texto que lea la alumna. Es
// el nombre interno del concepto y se queda en el código.
//
// ── POR QUÉ ESTE FICHERO EXISTE ─────────────────────────────────────────────
// Tres reglas de este flujo son fáciles de escribir mal y caras de descubrir
// tarde, y ninguna necesita servidor para comprobarse:
//
//  1. Qué es obligatorio. Si el cliente y el servidor no coinciden, o la alumna
//     se queda atascada sin saber por qué, o guarda una valoración a medias que
//     la instructora leerá como completa.
//  2. La regla condicional. «Zona obligatoria SOLO si dice que tiene
//     molestias» — y, al revés, si cambia a «no», las zonas que hubiera
//     marcado tienen que IRSE, no quedarse escondidas en el payload.
//  3. Cuál es la inicial y cuál la actual. Es la petición central del encargo,
//     y es una regla sobre un conjunto de filas: se equivoca en silencio y solo
//     se nota meses después, cuando ya hay historial que interpretar mal.
//
// El servidor manda igual (`/api/public/valoracion` revalida todo antes de
// escribir): esto es la MISMA regla, en un sitio donde se puede probar.

// ── Catálogo ────────────────────────────────────────────────────────────────
// Las opciones son cerradas a propósito: un desplegable de texto libre por
// pregunta daría datos que nadie puede agregar después. `otro` es la válvula.

export const OBJETIVOS = [
  'movilidad', 'fuerza', 'postura', 'molestias', 'flexibilidad',
  'bienestar', 'lesion', 'otro_deporte', 'estres', 'otro',
] as const;
export type Objetivo = (typeof OBJETIVOS)[number];

export const EXPERIENCIAS = ['nunca', 'algunas_veces', 'habitual', 'bastante'] as const;
export type Experiencia = (typeof EXPERIENCIAS)[number];

export const NIVELES = ['principiante', 'basico', 'intermedio', 'avanzado', 'no_segura'] as const;
export type Nivel = (typeof NIVELES)[number];

export const ESTADOS_CUERPO = ['agil', 'algo_rigida', 'bastante_rigida', 'recuperandome', 'no_segura'] as const;
export type EstadoCuerpo = (typeof ESTADOS_CUERPO)[number];

export const ZONAS = [
  'cuello', 'hombros', 'espalda', 'lumbar', 'cadera', 'rodillas', 'tobillos', 'munecas', 'otra',
] as const;
export type Zona = (typeof ZONAS)[number];

export const FRECUENCIAS = ['nada', 'menos_1', 'una_dos', 'tres_cuatro', 'cinco_mas'] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];

// ── La forma de una valoración ──────────────────────────────────────────────

/** La mitad que NO es dato de salud. */
export interface ValoracionBase {
  objetivos: Objetivo[];
  /** Cuál de los objetivos manda. Debe estar dentro de `objetivos`. */
  objetivoPrincipal: Objetivo | null;
  experiencia: Experiencia | null;
  nivel: Nivel | null;
  actividadHabitual: string;
  frecuencia: Frecuencia | null;
  expectativas: string;
}

/**
 * La mitad que SÍ es dato de salud (RGPD art. 9), aunque la declare ella misma.
 * Vive aparte porque su gate de acceso es distinto — ver la migración.
 */
export interface ValoracionSalud {
  tieneMolestias: boolean | null;
  zonas: Zona[];
  detalle: string;
  /**
   * ⚠️ Vive en la mitad de SALUD, y no es donde se puso al principio.
   *
   * «¿Cómo sientes tu cuerpo?» parece inocua —ágil, algo rígida— hasta que se
   * mira la quinta opción: «estoy recuperándome de algo». Eso es una condición
   * de salud declarada, y estaba cayendo en la tabla NO clínica: se preguntaba
   * ANTES de la puerta del consentimiento, y se pintaba en el bloque que ve
   * RECEPCIÓN. O sea, exactamente lo que partir la valoración en dos existe
   * para impedir, colado por la respuesta de una sola opción.
   *
   * No se arregla reescribiendo esa opción: la señal que de verdad le sirve a
   * la instructora es justo esa, y quitarla vaciaría la pregunta. Se arregla
   * poniendo la pregunta entera donde le corresponde — detrás del
   * consentimiento, y visible solo con rol clínico.
   */
  estadoCuerpo: EstadoCuerpo | null;
}

export type Valoracion = ValoracionBase & ValoracionSalud;

export const VALORACION_VACIA: Valoracion = {
  objetivos: [], objetivoPrincipal: null, experiencia: null, nivel: null,
  actividadHabitual: '', frecuencia: null, expectativas: '',
  tieneMolestias: null, zonas: [], detalle: '', estadoCuerpo: null,
};

// ── Los pasos ───────────────────────────────────────────────────────────────
// Uno por pantalla. El orden importa: se abre por lo que la alumna QUIERE
// (objetivos) y no por lo que le duele — preguntar primero por lesiones
// convierte la valoración en un parte médico desde la primera pantalla.
//
// `salud: true` marca los pasos que escriben en la tabla de salud. Se saltan
// enteros si no da su consentimiento, y la valoración se completa igual: es lo
// que hace que el consentimiento sea de verdad opcional y no un peaje.

export type IdPaso =
  | 'objetivos' | 'principal' | 'experiencia' | 'nivel'
  | 'consentimiento' | 'molestias' | 'cuerpo' | 'zonas' | 'detalle'
  | 'habitos' | 'expectativas' | 'resumen';

export interface Paso {
  id: IdPaso;
  /** ¿Escribe en la mitad de salud? */
  salud?: boolean;
  /** ¿Se puede pasar sin contestar? */
  opcional?: boolean;
  /** Solo se enseña MIENTRAS no haya consentimiento: es la puerta, no un paso. */
  soloSinConsentimiento?: boolean;
}

const PASOS: Paso[] = [
  { id: 'objetivos' },
  { id: 'principal' },
  { id: 'experiencia' },
  { id: 'nivel' },
  // ⚠️ La PUERTA del consentimiento es un paso propio, y tuvo que serlo.
  //
  // Antes no existía: la pantalla enseñaba la puerta cuando el paso actual era
  // de salud y no había consentimiento. Pero `pasosVisibles` **quita** los
  // pasos de salud justo cuando no hay consentimiento, así que el paso actual
  // nunca llegaba a ser uno de ellos y la puerta no se veía JAMÁS — es decir,
  // era invisible exactamente para quien tenía que verla. Lo cazó el e2e.
  //
  // Como paso propio también arregla el contador: «Paso 5 de 10» cuenta la
  // puerta, que es una pantalla real que hay que pasar.
  { id: 'consentimiento', soloSinConsentimiento: true },
  // Los cuatro de salud van seguidos y DESPUÉS de la puerta del
  // consentimiento. `cuerpo` está entre ellos por lo que explica
  // `ValoracionSalud.estadoCuerpo`.
  { id: 'molestias', salud: true },
  { id: 'cuerpo', salud: true, opcional: true },
  { id: 'zonas', salud: true },
  { id: 'detalle', salud: true, opcional: true },
  { id: 'habitos', opcional: true },
  { id: 'expectativas', opcional: true },
  { id: 'resumen' },
];

/**
 * Los pasos que de verdad se le enseñan, dado lo que lleva contestado.
 *
 * Dos podas, y las dos son la misma idea — no enseñar una pantalla cuya
 * respuesta ya se conoce:
 *  · Sin consentimiento de salud, fuera los tres pasos de salud.
 *  · Si dice que NO tiene molestias, fuera «zonas» y «detalle»: preguntar
 *    dónde le duele a quien acaba de decir que no le duele nada es el tipo de
 *    formulario que hace que la gente abandone.
 */
export function pasosVisibles(v: Valoracion, conConsentimientoSalud: boolean): Paso[] {
  return PASOS.filter((p) => {
    // La puerta desaparece en cuanto se cruza.
    if (p.soloSinConsentimiento && conConsentimientoSalud) return false;
    if (p.salud && !conConsentimientoSalud) return false;
    if ((p.id === 'zonas' || p.id === 'detalle') && v.tieneMolestias !== true) return false;
    // ⚠️ Con menos de dos objetivos no hay nada que elegir, y la pantalla se
    // saltaba igualmente. `normalizar` ya resuelve el principal cuando solo hay
    // uno, y `loQueFalta` ya no lo pedía — pero esta lista seguía incluyendo el
    // paso, así que la alumna veía «¿Y si tuvieras que quedarte con una?» con
    // UNA sola opción, ya marcada, y un botón de Continuar. Una pregunta cuya
    // respuesta ya está decidida no es una pregunta: es un trámite.
    // Lo cazó el e2e, no el test unitario: este comprobaba `loQueFalta`, que
    // iba bien, mientras el hueco estaba en la otra mitad de la misma regla.
    if (p.id === 'principal' && v.objetivos.length < 2) return false;
    return true;
  });
}

// ── Qué falta ───────────────────────────────────────────────────────────────

/**
 * Los pasos SIN contestar que impiden completar. Vacío = se puede guardar.
 *
 * ⚠️ Devuelve la lista, no un booleano: la pantalla necesita saber A CUÁL
 * volver, y un `false` a secas deja a la alumna delante de un botón apagado sin
 * decirle qué le falta — que es exactamente la queja que abre este encargo.
 */
export function loQueFalta(v: Valoracion, conConsentimientoSalud: boolean): IdPaso[] {
  const falta: IdPaso[] = [];
  if (v.objetivos.length === 0) falta.push('objetivos');
  // El principal solo se puede pedir si hay entre qué elegir, y con UN objetivo
  // no hay elección que hacer: lo resuelve `normalizar`.
  else if (!v.objetivoPrincipal) falta.push('principal');
  if (!v.experiencia) falta.push('experiencia');
  if (!v.nivel) falta.push('nivel');
  // La existencia de molestias es obligatoria SOLO si se le ha llegado a
  // preguntar. Sin consentimiento no se pregunta, y no puede faltar lo que
  // nadie preguntó.
  if (conConsentimientoSalud && v.tieneMolestias === null) falta.push('molestias');
  // Y si dijo que sí, al menos una zona: «tengo molestias» sin dónde no le
  // sirve de nada a quien va a dar la clase.
  if (conConsentimientoSalud && v.tieneMolestias === true && v.zonas.length === 0) falta.push('zonas');
  return falta;
}

export function sePuedeCompletar(v: Valoracion, conConsentimientoSalud: boolean): boolean {
  return loQueFalta(v, conConsentimientoSalud).length === 0;
}

/**
 * Deja la valoración coherente consigo misma antes de guardarla.
 *
 * Las cuatro son contradicciones que el propio flujo puede crear al ir y volver
 * entre pantallas, y que si se guardan tal cual dejan a la instructora leyendo
 * algo que la alumna no ha dicho:
 *
 *  1. Marcar zonas, volver atrás y cambiar a «no tengo molestias» dejaba las
 *     zonas puestas. Es el peor de los cuatro: la ficha diría «lumbar» de
 *     alguien que ha dicho expresamente que no le duele nada.
 *  2. Un objetivo principal que ya no está entre los objetivos elegidos.
 *  3. Con UN solo objetivo, ese es el principal — no hay nada que preguntar.
 *  4. Texto libre con espacios sueltos —que se guarda como «hay algo
 *     escrito»— y texto sin tope, que es una tabla que se puede llenar.
 */
/**
 * Tope de los campos libres.
 *
 * ⚠️ No es paranoia de formulario: el endpoint acepta cualquier cuerpo JSON, las
 * columnas son `text` sin límite, y una socia con 40 peticiones por minuto puede
 * llenar la tabla de su estudio. Se corta aquí —que es la función que el
 * servidor usa antes de escribir— y no en el `maxLength` del input, que solo
 * limita a quien usa la pantalla.
 *
 * 600 da de sobra para lo que se pide («con una frase basta») sin dejar la
 * puerta abierta.
 */
const TOPE_TEXTO = 600;
const recortar = (t: string) => t.trim().slice(0, TOPE_TEXTO);

export function normalizar(v: Valoracion): Valoracion {
  const objetivos = OBJETIVOS.filter((o) => v.objetivos.includes(o));
  const sinMolestias = v.tieneMolestias !== true;
  let objetivoPrincipal = v.objetivoPrincipal;
  if (objetivoPrincipal && !objetivos.includes(objetivoPrincipal)) objetivoPrincipal = null;
  if (!objetivoPrincipal && objetivos.length === 1) objetivoPrincipal = objetivos[0];
  return {
    ...v,
    objetivos,
    objetivoPrincipal,
    zonas: sinMolestias ? [] : ZONAS.filter((z) => v.zonas.includes(z)),
    detalle: sinMolestias ? '' : recortar(v.detalle),
    actividadHabitual: recortar(v.actividadHabitual),
    expectativas: recortar(v.expectativas),
  };
}

// ── Inicial vs. actual ──────────────────────────────────────────────────────

export type EstadoValoracion = 'EN_PROGRESO' | 'COMPLETADA';

export interface FilaValoracion {
  id: string;
  estado: EstadoValoracion;
  /** ISO. En las completadas, cuándo se completó. */
  creadoEn: string;
  valoracion: Valoracion;
}

export interface Historial {
  /** Cómo llegó. `null` si nunca completó ninguna. */
  inicial: FilaValoracion | null;
  /** Lo que dice hoy. Es la MISMA fila que `inicial` mientras solo haya una. */
  actual: FilaValoracion | null;
  /** La que tiene a medias, si la hay. */
  borrador: FilaValoracion | null;
  /** Cuántas veces la ha completado. 0, 1, o más. */
  vueltas: number;
}

/**
 * Reparte las filas en inicial / actual / borrador.
 *
 * ⚠️ `ACTUALIZADA` NO es un estado guardado, y no debe serlo: es «hay más de
 * una completada», y se deriva. Guardarlo como columna permitiría que se
 * desincronizara del dato que describe — el clásico campo que dice una cosa
 * mientras las filas dicen otra.
 *
 * ⚠️ Los BORRADORES no cuentan ni como inicial ni como actual. Una valoración a
 * medias no es lo que la alumna declara: es lo que estaba escribiendo cuando le
 * sonó el teléfono.
 *
 * ⚠️ Se ordena aquí y no se confía en el orden de llegada. Es la trampa que ya
 * pasó en este repo con el bono («el primero del array» en vez de «el que el
 * servidor gastaría primero», ver `compararPorCaducidad`): funciona en el
 * fixture y falla en producción cuando Postgres devuelve otro orden.
 */
export function repartirHistorial(filas: FilaValoracion[]): Historial {
  const completadas = filas
    .filter((f) => f.estado === 'COMPLETADA')
    .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
  return {
    inicial: completadas[0] ?? null,
    actual: completadas[completadas.length - 1] ?? null,
    borrador: filas.find((f) => f.estado === 'EN_PROGRESO') ?? null,
    vueltas: completadas.length,
  };
}

/**
 * Qué ha cambiado entre cómo llegó y lo que dice hoy — que es la razón de ser
 * de guardar las dos.
 *
 * Solo los cuatro campos en los que un cambio significa algo para quien da la
 * clase. Que ahora escriba tres frases en «expectativas» en vez de dos no es un
 * cambio: es otra redacción.
 */
export interface Cambio { campo: 'nivel' | 'experiencia' | 'molestias' | 'zonas'; antes: string; ahora: string; }

export function queHaCambiado(h: Historial): Cambio[] {
  if (!h.inicial || !h.actual || h.inicial.id === h.actual.id) return [];
  const a = h.inicial.valoracion;
  const b = h.actual.valoracion;
  const cambios: Cambio[] = [];
  if (a.nivel !== b.nivel) cambios.push({ campo: 'nivel', antes: a.nivel ?? '—', ahora: b.nivel ?? '—' });
  if (a.experiencia !== b.experiencia) cambios.push({ campo: 'experiencia', antes: a.experiencia ?? '—', ahora: b.experiencia ?? '—' });
  if (a.tieneMolestias !== b.tieneMolestias) {
    cambios.push({ campo: 'molestias', antes: a.tieneMolestias ? 'sí' : 'no', ahora: b.tieneMolestias ? 'sí' : 'no' });
  }
  const za = [...a.zonas].sort().join(',');
  const zb = [...b.zonas].sort().join(',');
  if (za !== zb) cambios.push({ campo: 'zonas', antes: za || '—', ahora: zb || '—' });
  return cambios;
}
