// ─────────────────────────────────────────────────────────────────────────────
// Cada estado de Tenti en su momento: qué significa y dónde sale.
//
// Desde el 5-oct-2026 por la noche (fundador: «que use todos sus estados y
// emociones, cada uno en su momento») Tenti usa sus estados y sus emociones en
// el panel. Cada uno significa UNA sola cosa en todo el producto
// (`SIGNIFICADO`), y cada sitio pide su estado a una función de este fichero
// con el dato que lo decide (`MAPA`): ninguna pantalla escribe un estado a
// mano, salvo los literales que `MAPA` le da a ese fichero.
//
// La guardia (lib/tenti/donde-vive-tenti.test.ts) importa `MAPA` en vez de
// copiar sus listas, y /interno/tenti pinta «Cada estado, en su sitio» con los
// mismos dos objetos: el catálogo no puede contar otra cosa que el panel.
//
// Puro, sin DOM ni React: lo prueba lib/tenti/momentos.test.ts. Del motor solo
// los TIPOS (importarlo de valor metería el canvas en el chunk de Resumen).
// ─────────────────────────────────────────────────────────────────────────────

import type { EmocionTenti, EstadoTenti } from './motor.ts';
import type { ClaseDelDia } from '../hoy-agenda.ts';

/**
 * Desde cuántas cosas esperando tu visto bueno Tenti está 'agobiado'. Con un
 * minuto por decisión son más de diez minutos: más de lo que se atiende de una
 * sentada.
 * ⚠️ SIN MEDIR TODAVÍA (primera versión aceptada el 5-oct-2026). Antes de
 * fiarse, mirar el p90 de `nDecidir` de un día normal en los estudios activos
 * (GET /api/estado-estudio desde /interno): si pasa de 10, subirlo, porque un
 * 'agobiado' todas las mañanas sería ruido.
 */
export const UMBRAL_AGOBIO = 10;

// ── Qué significa cada uno ────────────────────────────────────────────────────

export const SIGNIFICADO: {
  estados: Record<EstadoTenti, { es: string; nunca: string }>;
  emociones: Record<EmocionTenti, { es: string; cuando: string }>;
  saludo: { es: string; cuando: string };
} = {
  estados: {
    reposo: {
      es: 'La firma: aquí interviene Tentare y no está haciendo nada delante de ti.',
      nunca: '«Todo bien». Si hay algo que avisar, lo dice el texto.',
    },
    pensando: {
      es: 'Una petición tuya está en vuelo (IA o análisis), tiene fin y su resultado vuelve a esta pantalla.',
      nunca: 'Cargar la pantalla, guardar o importar filas.',
    },
    buscando: {
      es: 'Tentare está consultando los datos de tu estudio para responderte.',
      nunca: 'La búsqueda de ⌘K, que es local e instantánea.',
    },
    trabajando: {
      es: 'Tentare está haciendo un proceso por su cuenta, que ya ha empezado y no necesita que toques nada.',
      nunca: 'Una petición tuya que espera respuesta (eso es «pensando»).',
    },
    hecho: {
      es: 'Algo que estabas viendo acaba de terminar, y el servidor lo confirma. Con celebración en los hitos (Listo, la migración); breve en lo diario (el veredicto).',
      nunca: 'Un hecho pasado pintado al cargar la pantalla, ni junto a un cobro.',
    },
    error: {
      es: 'Algo que Tentare hizo o intentó por ti no ha salido.',
      nunca: 'Un error tuyo de formulario o una pantalla que no carga (eso lo dicen el texto y los avisos).',
    },
    esperaTuOk: {
      es: 'Algo no avanza hasta que digas sí. La cifra es siempre la de la bandeja única.',
      nunca: 'El Centro de Control: sus sugerencias no bloquean nada, y el Contrato promete no interrumpir.',
    },
    pregunta: {
      es: 'Tentare te pregunta algo y puedes no contestar: nada se para si no lo haces (el mensaje del día, la apertura).',
      nunca: 'Algo que bloquea (eso es «espera tu visto bueno»).',
    },
    agobiado: {
      es: `Se ha acumulado más de lo que se atiende de una sentada (${UMBRAL_AGOBIO} o más cosas esperando tu visto bueno).`,
      nunca: 'Un reproche: va con el mismo texto neutro de la bandeja.',
    },
    dormido: {
      es: 'El ESTUDIO descansa: hoy ya no quedan clases, o no hay ninguna. Siempre con «Tentare sigue atento…».',
      nunca: '«Tentare apagado», ni donde se firma trabajo autónomo (piloto, automatizaciones, lo que está en marcha).',
    },
    mareado: {
      es: 'Le has tocado demasiadas veces seguidas.',
      nunca: 'Cualquier dato.',
    },
  },
  emociones: {
    amor: { es: 'Llega alguien nuevo al estudio.', cuando: 'Hoy viene una alumna por primera vez.' },
    orgullo: { es: 'Un récord de verdad.', cuando: 'Hoy es el día con más alumnas desde que el estudio usa Tentare.' },
    guino: { es: 'Te doy una pista.', cuando: 'La única novedad del día es un hueco que puedes llenar.' },
    bostezo: { es: 'Has estado fuera un buen rato.', cuando: 'Vuelves a la pestaña tras media hora o más fuera.' },
    sorpresa: { es: 'Algo nuevo que no estaba hace un momento.', cuando: 'La bandeja sube mientras la tienes delante.' },
    feliz: { es: 'Lo que acabas de poner ha quedado bien.', cuando: 'El logo, guardado.' },
    molesto: { es: 'Le estás tocando.', cuando: 'El segundo toque seguido.' },
  },
  saludo: { es: 'Primer contacto.', cuando: 'La bienvenida del logo, y el primer Tenti tocable que se ve en la sesión.' },
};

// ── Las reglas ───────────────────────────────────────────────────────────────

/** Fuera de la pestaña al menos esto para que Tenti bostece al volver. */
export const AUSENCIA_BOSTEZO_MS = 30 * 60_000;

/** El récord del día solo cuenta con historia y con un día de verdad lleno. */
export const RECORD_DIAS_MINIMOS = 56;
export const RECORD_ALUMNAS_MINIMAS = 10;

/** Cuánto dura una emoción del panel (los ojos, el rubor, las partículas). */
export const DURACION_EMOCION_MS = 1800;

/**
 * El Tenti del titular de «Decidir», en la bandeja única. `null` = sin Tenti
 * (se queda el Check de siempre): con cero o sin saber cuántas, no hay cara.
 */
export function estadoDeLaBandeja(nDecidir: number | null | undefined): 'esperaTuOk' | 'agobiado' | null {
  if (nDecidir == null || !(nDecidir > 0)) return null;
  return nDecidir >= UMBRAL_AGOBIO ? 'agobiado' : 'esperaTuOk';
}

/**
 * El Tenti de «Sistema autónomo» de Resumen (Automatizaciones ya no lleva
 * Tenti desde el 6-oct-2026: lo quitó el fundador). Lo que no avanza sin ti va antes que lo que falló: lo
 * fallido ya sale en la línea de abajo. `esperandoEnBandeja` es la cifra de la
 * BANDEJA, nunca un recuento propio; con `null` (no ha contestado, o este rol
 * no la tiene), 'reposo': la cara no puede afirmar lo que la bandeja no ha
 * contado.
 */
export function estadoDelAutonomo({ esperandoEnBandeja, fallidasHoy }: {
  esperandoEnBandeja: number | null; fallidasHoy: number;
}): 'reposo' | 'esperaTuOk' | 'error' {
  if (esperandoEnBandeja === null) return 'reposo';
  if (esperandoEnBandeja > 0) return 'esperaTuOk';
  return fallidasHoy > 0 ? 'error' : 'reposo';
}

type ClaseParaHoy = Pick<ClaseDelDia, 'finalizada' | 'estado' | 'senal' | 'pendientes'>;

/**
 * El Tenti de la tira de «Hoy en el estudio». 'dormido' = el ESTUDIO descansa:
 * hoy (nunca otro día) ya no queda ninguna clase por dar, o no hay ninguna, y
 * no queda nada por resolver. Con un problema o una pendiente manda el texto,
 * nunca una cara dormida.
 */
export function estadoDeHoy({ esHoy, cargando, fallo, clases }: {
  esHoy: boolean; cargando: boolean; fallo: boolean; clases: readonly ClaseParaHoy[];
}): 'reposo' | 'dormido' {
  if (!esHoy || cargando || fallo) return 'reposo';
  const terminado = clases.every(c => c.finalizada || c.estado === 'CANCELADA');
  const queda = clases.some(c => c.senal === 'PROBLEMA' || c.pendientes > 0);
  return terminado && !queda ? 'dormido' : 'reposo';
}

/**
 * El Tenti del acta de la migración. Mudar el estudio entero es un hito: con
 * todo dentro, 'hecho' con celebración; si una entidad trae error, 'error' (el
 * texto ya dice «el proceso se detuvo ahí»). Deshecha, sin Tenti.
 */
export function estadoDeLaMigracion({ resultados, deshecho }: {
  resultados: readonly { error?: string | null; estado?: string }[]; deshecho: boolean;
}): 'hecho' | 'error' | null {
  if (deshecho) return null;
  // Una entidad saltada («no_importada») no lleva error propio pero tampoco es éxito.
  return resultados.some(r => r.error || (r.estado !== undefined && r.estado !== 'importada')) ? 'error' : 'hecho';
}

/** Lo que dura el 'hecho' breve de lo diario (el veredicto, el asistente). */
export const HECHO_BREVE_MS = 1500;

/**
 * El Tenti del veredicto del día (Centro de Control), en lugar del anillo que
 * había (decisión del fundador, 5-oct). El primero que se cumpla:
 *   0. el mensaje de hoy, vivo y sin aplazar, cobra al aprobarlo → `null`:
 *      nunca una cara junto a «Cobrar ahora» (se lee como manipulación), ni
 *      siquiera pensando;
 *   1. «Analizar ahora» en curso o tardando → 'pensando';
 *   2. el análisis acaba de terminar y hay análisis de hoy → 'hecho' breve
 *      (un análisis que murió no deja veredicto nuevo: sigue SIN_ANALIZAR);
 *   3. acabas de responder al mensaje y el servidor dijo que sí → 'hecho' breve;
 *   4. el mensaje de hoy, vivo y sin aplazar → 'pregunta' (puedes no contestar:
 *      nada se para);
 *   5. el piloto intentó algo hoy y no salió → 'error';
 *   6. si no, la firma: 'reposo'.
 * Sin sonido ni emociones: el Contrato promete no interrumpir.
 */
export function estadoDelVeredicto({
  tipo, hayRecomendacion, pospuesta, efectoCobra, analisis, recienTerminado, recienRespondido, fallidasHoy,
}: {
  tipo: 'MENSAJE' | 'SILENCIO' | 'SIN_ANALIZAR';
  hayRecomendacion: boolean;
  pospuesta: boolean;
  efectoCobra: boolean;
  analisis: 'quieto' | 'en-curso' | 'tardando';
  recienTerminado: boolean;
  recienRespondido: boolean;
  fallidasHoy: number;
}): 'pensando' | 'hecho' | 'pregunta' | 'error' | 'reposo' | null {
  const mensajeVivo = tipo === 'MENSAJE' && hayRecomendacion && !pospuesta;
  if (mensajeVivo && efectoCobra) return null;
  if (analisis !== 'quieto') return 'pensando';
  if (recienTerminado && tipo !== 'SIN_ANALIZAR') return 'hecho';
  if (recienRespondido) return 'hecho';
  if (mensajeVivo) return 'pregunta';
  return fallidasHoy > 0 ? 'error' : 'reposo';
}

/** Si un recuento ha subido (nunca al cargar: sin valor anterior, no). */
export function subio(antes: number | null | undefined, ahora: number | null | undefined): boolean {
  return antes != null && ahora != null && ahora > antes;
}

/** Hoy es el día con más alumnas desde que el estudio usa Tentare. */
export function esRecordDelDia({ alumnasHoy, maxPrevio, diasDeHistoria }: {
  alumnasHoy: number; maxPrevio: number | null; diasDeHistoria: number | null;
}): boolean {
  return diasDeHistoria != null && diasDeHistoria >= RECORD_DIAS_MINIMOS
    && maxPrevio != null && alumnasHoy >= RECORD_ALUMNAS_MINIMAS && alumnasHoy > maxPrevio;
}

/** Una emoción por carga, con esta prioridad: amor > orgullo > guiño. */
export function emocionDeHoy({ primerasVeces, record, soloHuecos }: {
  primerasVeces: number; record: boolean; soloHuecos: boolean;
}): 'amor' | 'orgullo' | 'guino' | null {
  if (primerasVeces > 0) return 'amor';
  if (record) return 'orgullo';
  return soloHuecos ? 'guino' : null;
}

// ── Los datos que lo deciden ─────────────────────────────────────────────────

/**
 * Cuántas alumnas vienen HOY por primera vez: las que tienen hoy una reserva
 * que cuenta (CONFIRMADA o ASISTIDA, de una clase no cancelada) y ninguna
 * reserva que contara antes de hoy.
 *
 * ⚠️ Una socia migrada sin sus reservas antiguas parecería nueva: por eso
 * fuera quien trae historial previo importado (`tieneHistorialPrevio`, el mismo
 * dato que lee el estado de la clienta). Y si no se sabe (la ficha no está),
 * tampoco cuenta: mejor sin 'amor' que un 'amor' falso.
 */
export function primerasVecesHoy({ reservasHoy, sesionesCanceladas, primeraReservaDe, historialPrevio, hoy, diaDe }: {
  reservasHoy: readonly { socioId: string | null; sesionId: string; estado: string }[];
  sesionesCanceladas: ReadonlySet<string>;
  /** Su primera reserva que contó, en todo el histórico (ISO), o null si no hay. */
  primeraReservaDe: (socioId: string) => string | null;
  /** true/false si se sabe; null si la ficha no está. */
  historialPrevio: (socioId: string) => boolean | null;
  hoy: string;
  /** El día del estudio ('YYYY-MM-DD') de un instante ISO. */
  diaDe: (iso: string) => string;
}): number {
  const nuevas = new Set<string>();
  for (const r of reservasHoy) {
    if (!r.socioId || (r.estado !== 'CONFIRMADA' && r.estado !== 'ASISTIDA') || sesionesCanceladas.has(r.sesionId)) continue;
    if (nuevas.has(r.socioId) || historialPrevio(r.socioId) !== false) continue;
    const primera = primeraReservaDe(r.socioId);
    if (primera == null || diaDe(primera) >= hoy) nuevas.add(r.socioId);
  }
  return nuevas.size;
}

/**
 * El máximo de alumnas en un día ANTERIOR a hoy, con la regla de `resumirDia`:
 * plazas ocupadas (CONFIRMADA y ASISTIDA) de clases no canceladas. `null` si no
 * hay ningún día anterior con clases.
 * `diaDe` se llama una vez por clase, no por reserva (un Intl por fila es caro:
 * memoria «Intl por llamada es caro»).
 */
export function maxAlumnasAntesDe({ sesiones, reservas, hoy, diaDe }: {
  sesiones: readonly { id: string; inicio: string; cancelada?: boolean | null }[];
  reservas: readonly { sesionId: string; estado: string }[];
  hoy: string;
  diaDe: (iso: string) => string;
}): number | null {
  const diaDeSesion = new Map<string, string>();
  for (const s of sesiones) {
    if (s.cancelada) continue;
    const d = diaDe(s.inicio);
    if (d < hoy) diaDeSesion.set(s.id, d);
  }
  if (diaDeSesion.size === 0) return null;
  const porDia = new Map<string, number>();
  for (const d of diaDeSesion.values()) porDia.set(d, 0);
  for (const r of reservas) {
    if (r.estado !== 'CONFIRMADA' && r.estado !== 'ASISTIDA') continue;
    const d = diaDeSesion.get(r.sesionId);
    if (d) porDia.set(d, porDia.get(d)! + 1);
  }
  return Math.max(...porDia.values());
}

// ── Lo que dice la tira de Hoy ───────────────────────────────────────────────

/** Lo que dice Tenti dormido: siempre que Tentare sigue, nunca «apagado». */
export const FRASE_DORMIDO = {
  terminadas: 'Hoy ya no quedan clases. Tentare sigue atento a las reservas y los avisos.',
  sinClases: 'Hoy no hay clases. Tentare sigue atento a las reservas y los avisos.',
} as const;

type ClaseParaFrase = Pick<ClaseDelDia, 'finalizada' | 'estado' | 'huecos'>;

/** Las partes de «Tentare ha encontrado…»: huecos y problemas del día. */
function encontrado(resumen: { problemas: number }, clases: readonly ClaseParaFrase[]): { texto: string | null; soloHuecos: boolean } {
  const sinInstructora = clases.filter(c => c.estado === 'SIN_INSTRUCTORA' && !c.finalizada).length;
  const conHueco = clases.filter(c => !c.finalizada && c.estado !== 'CANCELADA' && c.huecos > 0).length;
  const partes: string[] = [];
  if (conHueco > 0) partes.push(`${conHueco} clase${conHueco === 1 ? '' : 's'} con hueco que puedes llenar`);
  if (sinInstructora > 0) partes.push(`${sinInstructora} clase${sinInstructora === 1 ? '' : 's'} sin instructora`);
  const otros = resumen.problemas - sinInstructora;
  if (otros > 0) partes.push(`${otros} clase${otros === 1 ? '' : 's'} con algo que resolver`);
  if (partes.length === 0) return { texto: null, soloHuecos: false };
  const ultimo = partes.pop()!;
  return {
    texto: `Tentare ha encontrado ${partes.length ? `${partes.join(', ')} y ${ultimo}` : ultimo}.`,
    soloHuecos: conHueco > 0 && resumen.problemas === 0,
  };
}

/**
 * Lo que ha visto Tentare hoy, en una frase, y si es solo un hueco (para el
 * guiño). `null` si no hay nada que contar: la tira no se pinta.
 * Orden: quien viene por primera vez, lo encontrado, el récord y, si el estudio
 * descansa, que Tentare sigue.
 */
export function fraseDeHoy({ resumen, clases, primerasVeces, record, estado }: {
  resumen: { problemas: number; alumnas: number };
  clases: readonly ClaseParaFrase[];
  primerasVeces: number;
  record: boolean;
  /** El de `estadoDeHoy`: con 'dormido', la frase dice que Tentare sigue. */
  estado: ReturnType<typeof estadoDeHoy>;
}): { texto: string; soloHuecos: boolean } | null {
  const dormido = estado === 'dormido';
  const frases: string[] = [];
  if (primerasVeces > 0) {
    const viene = dormido ? (primerasVeces === 1 ? 'ha venido' : 'han venido') : (primerasVeces === 1 ? 'viene' : 'vienen');
    frases.push(`${primerasVeces === 1 ? 'Una alumna' : `${primerasVeces} alumnas`} ${viene} hoy por primera vez.`);
  }
  const { texto, soloHuecos } = encontrado(resumen, clases);
  if (texto) frases.push(texto);
  if (record) frases.push(`Hoy es el día con más alumnas desde que usas Tentare (${resumen.alumnas}).`);
  if (dormido) frases.push(clases.length === 0 ? FRASE_DORMIDO.sinClases : FRASE_DORMIDO.terminadas);
  return frases.length ? { texto: frases.join(' '), soloHuecos } : null;
}

// ── El mapa: sitio → función que decide → estados y emociones posibles ───────

/** Las funciones que deciden, por nombre (la guardia las busca así). */
export const DECIDEN = { estadoDeLaBandeja, estadoDelAutonomo, estadoDeHoy, estadoDeLaMigracion, estadoDelVeredicto } as const;

export interface SitioDeTenti {
  /** Dónde, en palabras. */
  sitio: string;
  /** La función de este fichero que decide el estado, o null si va fijo. */
  funcion: keyof typeof DECIDEN | null;
  /** Los nombres de estado que ESE fichero puede escribir a mano (además de 'reposo'). */
  literales: readonly EstadoTenti[];
  /** Todos los estados que pueden salir ahí. */
  estados: readonly EstadoTenti[];
  /** Las emociones que pueden salir ahí. */
  emociones: readonly EmocionTenti[];
  motivo: string;
}

/**
 * Cada sitio de Tenti con lo que puede enseñar y por qué. Lo que no está aquí
 * no sale en el panel. El veredicto del Centro de Control llega en su propio
 * PR, y 'buscando' con el asistente.
 */
export const MAPA: Record<string, SitioDeTenti> = {
  'components/dashboard/estado-del-estudio.tsx': {
    sitio: 'Resumen › la bandeja: el titular de «Decidir» y «Tentare lo está haciendo»',
    funcion: 'estadoDeLaBandeja', literales: ['trabajando'],
    estados: ['esperaTuOk', 'agobiado', 'trabajando'], emociones: ['sorpresa'],
    motivo: 'la bandeja única es la dueña de lo que espera tu visto bueno; «lo está haciendo» solo existe si hay algo en marcha',
  },
  'app/(dashboard)/dashboard/page.tsx': {
    sitio: 'Resumen › «Sistema autónomo»',
    funcion: 'estadoDelAutonomo', literales: [], estados: ['reposo', 'esperaTuOk', 'error'], emociones: [],
    motivo: 'lo que no avanza sin ti (la cifra de la bandeja) y lo que Tentare intentó hoy y no salió',
  },
  'components/dashboard/hoy-en-el-estudio.tsx': {
    sitio: 'Resumen › «Hoy en el estudio», la tira de lo que ha visto Tentare',
    funcion: 'estadoDeHoy', literales: [], estados: ['reposo', 'dormido'], emociones: ['amor', 'orgullo', 'guino', 'bostezo'],
    motivo: 'el estudio descansa; quien viene por primera vez, el récord, la pista del hueco y la vuelta tras un rato fuera',
  },
  'app/(dashboard)/migracion/page.tsx': {
    sitio: 'Migración › «Analizar», importando y el acta',
    funcion: 'estadoDeLaMigracion', literales: ['trabajando'],
    estados: ['reposo', 'pensando', 'trabajando', 'hecho', 'error'], emociones: [],
    motivo: 'Tentare lee los archivos (pensando), mete las filas solo (trabajando) y el acta dice si salió',
  },
  'components/decision/veredicto-del-dia.tsx': {
    sitio: 'Centro de Control › el veredicto del día, en lugar del anillo',
    funcion: 'estadoDelVeredicto', literales: [],
    estados: ['reposo', 'pensando', 'hecho', 'pregunta', 'error'], emociones: [],
    motivo: 'analizando, recién terminado o respondido, el mensaje que te pregunta (nunca si aprobar cobra) y lo que el piloto no pudo hacer',
  },
  'app/(dashboard)/bienvenido-apertura/page.tsx': {
    sitio: 'Bienvenida de apertura',
    funcion: null, literales: ['pregunta'], estados: ['pregunta'], emociones: [],
    motivo: 'son tres preguntas que se pueden dejar para luego («Lo veo más tarde»)',
  },
  'components/onboarding/listo-para-reservar.tsx': {
    sitio: '«Tu estudio ya puede recibir reservas»',
    funcion: null, literales: ['hecho'], estados: ['reposo', 'hecho'], emociones: [],
    motivo: 'el servidor confirma que una alumna nueva ya puede reservar: un hito, con celebración',
  },
  'components/onboarding/estudio-listo.tsx': {
    sitio: 'Bienvenida › «tu estudio ya está en marcha»',
    funcion: null, literales: ['hecho'], estados: ['reposo', 'hecho'], emociones: [],
    motivo: 'el alta termina y el estudio queda montado: un hito, con celebración (fundador, 7-oct-2026)',
  },
  'components/onboarding/pantallas-valor.tsx': {
    sitio: 'Bienvenida › el logo',
    funcion: null, literales: [], estados: ['reposo'], emociones: ['feliz'],
    motivo: 'el logo ha quedado guardado',
  },
  'components/calendario/adaptaciones-clase.tsx': {
    sitio: '«Preparar clase con IA»', funcion: null, literales: ['pensando'], estados: ['reposo', 'pensando'], emociones: [],
    motivo: 'una petición a un modelo en vuelo',
  },
  'components/socios/ficha-salud.tsx': {
    sitio: '«Adaptar ejercicios con IA»', funcion: null, literales: ['pensando'], estados: ['reposo', 'pensando'], emociones: [],
    motivo: 'una petición a un modelo en vuelo',
  },
  'components/socios/modal-nota-voz.tsx': {
    sitio: '«Estructurar con IA»', funcion: null, literales: ['pensando'], estados: ['reposo', 'pensando'], emociones: [],
    motivo: 'una petición a un modelo en vuelo',
  },
  'components/tenti/tenti.tsx': {
    sitio: 'Cualquier Tenti tocable, al tocarlo', funcion: null, literales: ['mareado'], estados: ['mareado'], emociones: ['molesto'],
    motivo: 'solo lo pone `tocar()`: se molesta al segundo toque y se marea si insistes',
  },
};

/** Estados sin sitio todavía, con su motivo. */
export const SIN_SITIO_TODAVIA: Partial<Record<EstadoTenti, string>> = {
  buscando: 'llega con el asistente (su PR D): una herramienta consultando los datos del estudio',
};
