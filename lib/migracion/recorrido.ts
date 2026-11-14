// ─────────────────────────────────────────────────────────────────────────────
// «Cambiar a Tentare»: el recorrido de migración de Academy. Puro y sin `@/`: se prueba con `node --test`.
//
// El importador (`lib/migracion/**`, «Traer mis datos») ya sabe leer, mapear, revisar y deshacer. Lo que faltaba era el RECORRIDO: de
// «voy a cambiar de software» a «Tentare es mi software principal», con el miedo de perder datos o parar el estudio a la vista. Son 11
// pasos con cinco estados (Pendiente, En progreso, Completado, Requiere revisión, Bloqueado).
//
// ── De dónde sale cada estado ────────────────────────────────────────────────
//  · Los pasos de DATOS (importar alumnas, bonos, horario) se dan por hechos solos cuando el dato existe de verdad en el estudio:
//    nunca se marcan a mano, igual que el progreso de «Primeros pasos». Si la propietaria los marca «Requiere revisión» o «Bloqueado»,
//    eso manda sobre el dato.
//  · Los MANUALES (exportar, revisar, hacer una prueba, activar) son cosas que ocurren fuera de Tentare o que solo ella puede dar por
//    buenas: los marca ella y quedan guardados (`migracion_checklist`).
//
// ── Lo que NO se promete ─────────────────────────────────────────────────────
// El «te la hacemos nosotros» se retiró el 21-oct-2026: nadie hace la migración por la propietaria. Aquí no aparece. Y de cada software
// de origen solo se dan pasos de exportación cuando constan en SU documentación pública, con la fecha en que se comprobó; si no constan,
// se dice tal cual y se da la salida (pedírselo a su soporte), sin inventar menús.
// ─────────────────────────────────────────────────────────────────────────────

export const ESTADOS = ['PENDIENTE', 'EN_PROGRESO', 'COMPLETADO', 'REQUIERE_REVISION', 'BLOQUEADO'] as const;
export type EstadoPaso = (typeof ESTADOS)[number];

export const ETIQUETA_ESTADO: Readonly<Record<EstadoPaso, string>> = {
  PENDIENTE: 'Pendiente', EN_PROGRESO: 'En progreso', COMPLETADO: 'Completado', REQUIERE_REVISION: 'Requiere revisión', BLOQUEADO: 'Bloqueado',
};

export function esEstado(v: unknown): v is EstadoPaso {
  return typeof v === 'string' && (ESTADOS as readonly string[]).includes(v);
}

/** Los datos del estudio que dan por hecho un paso de datos. */
export interface DatosEstudioMigracion {
  numAlumnas: number;
  numPlanesActivos: number;
  numSuscripciones: number;
  numClases: number;
  numReservas: number;
}

export interface PasoMigracion {
  id: string;
  numero: string;
  titulo: string;
  descripcion: string;
  /** `datos`: se completa solo cuando el dato existe. `manual`: lo marca la propietaria. */
  modo: 'datos' | 'manual';
  /** A dónde lleva «Hacerlo». */
  href?: string;
  etiquetaHref?: string;
  /** ¿Se cumple con los datos del estudio? Solo en los de `datos`. */
  cumplido?: (d: DatosEstudioMigracion) => boolean;
}

export const PASOS: readonly PasoMigracion[] = [
  { id: 'diagnostico', numero: '01', titulo: 'Elige de qué software vienes', modo: 'manual',
    descripcion: 'Te enseñamos cómo sacar tus datos de ese programa y qué te puedes llevar.' },
  { id: 'que-traes', numero: '02', titulo: 'Decide qué datos traes', modo: 'manual',
    descripcion: 'Clientes, bonos y membresías, clases y horario, reservas, citas, pagos históricos y recuperaciones pendientes: es lo que el importador sabe leer.' },
  { id: 'exportar', numero: '03', titulo: 'Exporta tus datos del software anterior', modo: 'manual',
    descripcion: 'Descarga los archivos tal cual salen: no hace falta tocarlos.' },
  { id: 'preparar', numero: '04', titulo: 'Mira los archivos antes de subirlos', modo: 'manual',
    descripcion: 'Que se abren, que traen cabeceras y que no falta ninguna columna con los nombres o los correos.' },
  { id: 'importar-alumnas', numero: '05', titulo: 'Importa tus alumnas', modo: 'datos', href: '/migracion', etiquetaHref: 'Traer mis datos',
    descripcion: 'Se sube el archivo, ves el plan antes de ejecutar nada y puedes deshacerlo.',
    cumplido: d => d.numAlumnas > 0 },
  { id: 'importar-bonos', numero: '06', titulo: 'Importa bonos y membresías', modo: 'datos', href: '/migracion', etiquetaHref: 'Traer mis datos',
    descripcion: 'Con sus sesiones restantes y sus fechas. Si tu programa no los exporta, los creas a mano y lo anotas aquí.',
    cumplido: d => d.numPlanesActivos > 0 && d.numSuscripciones > 0 },
  { id: 'horario', numero: '07', titulo: 'Pon tu horario y tus clases', modo: 'datos', href: '/calendario', etiquetaHref: 'Ir al calendario',
    descripcion: 'Importado o creado a mano: lo que cuenta es que tu semana esté en el calendario.',
    cumplido: d => d.numClases > 0 },
  { id: 'revisar', numero: '08', titulo: 'Revisa lo importado', modo: 'manual', href: '/clientas', etiquetaHref: 'Ver tus clientes',
    descripcion: 'Abre tres o cuatro fichas que conozcas bien y comprueba nombre, contacto, bono y fechas.' },
  { id: 'validar', numero: '09', titulo: 'Valida reservas y cobros', modo: 'manual', href: '/cobros', etiquetaHref: 'Ver cobros',
    descripcion: 'Que las reservas ya hechas están y que sabes cómo vas a cobrar a partir de ahora.' },
  { id: 'prueba', numero: '10', titulo: 'Haz una prueba de principio a fin', modo: 'manual',
    descripcion: 'Entra como una alumna, reserva una clase y comprueba el aviso, la plaza y el bono. Antes de decirle nada a nadie.' },
  { id: 'activar', numero: '11', titulo: 'Activa Tentare como tu software principal', modo: 'manual',
    descripcion: 'Avisa a tus alumnas, cambia el enlace de reservas de tu web y deja el programa anterior en solo lectura unos días.' },
];

export interface FilaPaso { paso: string; estado: EstadoPaso; nota: string | null }

export interface PasoConEstado { paso: PasoMigracion; estado: EstadoPaso; nota: string | null; /** El estado viene del dato, no de lo que ella marcó. */ porDatos: boolean }

/** El estado de cada paso. El dato real manda… salvo que ella haya dicho que requiere revisión o está bloqueado. */
export function resolverPasos(filas: readonly FilaPaso[], datos: DatosEstudioMigracion): PasoConEstado[] {
  const manual = new Map(filas.map(f => [f.paso, f]));
  return PASOS.map(paso => {
    const fila = manual.get(paso.id) ?? null;
    if (paso.modo === 'datos' && paso.cumplido?.(datos) && fila?.estado !== 'REQUIERE_REVISION' && fila?.estado !== 'BLOQUEADO') {
      return { paso, estado: 'COMPLETADO', nota: fila?.nota ?? null, porDatos: true };
    }
    return { paso, estado: fila?.estado ?? 'PENDIENTE', nota: fila?.nota ?? null, porDatos: false };
  });
}

export interface ResumenRecorrido {
  completados: number;
  total: number;
  pct: number;
  /** El primer paso sin completar, en orden: la migración se hace en este orden. */
  siguiente: PasoConEstado | null;
  /** Lo que pide atención ya: revisión o bloqueado. */
  conAviso: PasoConEstado[];
}

export function resumirRecorrido(pasos: readonly PasoConEstado[]): ResumenRecorrido {
  const completados = pasos.filter(p => p.estado === 'COMPLETADO').length;
  return {
    completados, total: pasos.length, pct: pasos.length ? Math.round((completados / pasos.length) * 100) : 0,
    siguiente: pasos.find(p => p.estado !== 'COMPLETADO') ?? null,
    conAviso: pasos.filter(p => p.estado === 'REQUIERE_REVISION' || p.estado === 'BLOQUEADO'),
  };
}

/** Qué falta antes de «Activar Tentare». No lo impide —es su estudio y su decisión—, pero se lo dice con claridad. */
export function pendientesAntesDeActivar(pasos: readonly PasoConEstado[]): PasoConEstado[] {
  return pasos.filter(p => p.paso.id !== 'activar' && p.estado !== 'COMPLETADO');
}

// ── Los softwares de origen ──────────────────────────────────────────────────

export type IdOrigen = 'timp' | 'bsport' | 'eversports' | 'mindbody' | 'momence' | 'otro';

export interface OrigenMigracion {
  id: IdOrigen;
  nombre: string;
  /**
   * ¿Constan los pasos de exportación en la documentación PÚBLICA del propio software? `false` no es «no se puede»: es «no hemos podido
   * confirmarlo», y la guía lo dice así y manda a su soporte.
   */
  verificado: boolean;
  /** Cuándo se miró su documentación (AAAA-MM-DD). Las cosas cambian: la fecha es parte del contenido. */
  comprobado: string;
  /** Lo que sí consta, en pasos. Vacío si no consta nada. */
  pasos: readonly string[];
  /** Lo que su documentación NO dice y conviene confirmar con ellos. */
  aviso: string;
  fuente: { texto: string; href: string } | null;
}

export const FECHA_COMPROBACION = '2026-11-14';

export const ORIGENES: readonly OrigenMigracion[] = [
  {
    id: 'timp', nombre: 'TIMP', verificado: true, comprobado: FECHA_COMPROBACION,
    pasos: [
      'En TIMP, abre la sección «Clientes».',
      'Elige «Exportar clientes»: exporta todos los clientes de tu centro, estén dados de baja o suscritos, y puedes elegir si incluir los campos personalizados.',
      'Para las reservas de una clienta concreta: en su ficha, botón «Acciones» y «Exportar reservas».',
    ],
    aviso: 'Su ayuda no describe una exportación de bonos, membresías ni pagos. De esos datos, pregunta a su soporte qué informe te pueden dar.',
    fuente: { texto: 'Ayuda de TIMP: Reportes', href: 'https://intercom.help/timp-pro/es/articles/1802360-reportes' },
  },
  {
    id: 'eversports', nombre: 'Eversports', verificado: true, comprobado: FECHA_COMPROBACION,
    pasos: [
      'En Eversports Manager, abre el menú «Customers» (Clientes).',
      'Pulsa «More» (Más) y elige «Export all customers» (exportar todos los clientes).',
      'Si solo quieres un grupo: «Filter», «Apply Filter», «More» y «Export filtered customers».',
      'Abre el archivo con Excel o una hoja de cálculo parecida.',
    ],
    aviso: 'Los nombres de los botones son los de su ayuda en inglés; en tu pantalla pueden salir en español. Su ayuda no dice que el archivo lleve membresías, bonos ni reservas: comprueba qué columnas trae y pide el resto a su soporte.',
    fuente: { texto: 'Ayuda de Eversports Manager: exportar clientes', href: 'https://helpcenter.eversportsmanager.com/step-1-customer-export' },
  },
  {
    id: 'bsport', nombre: 'bsport', verificado: false, comprobado: FECHA_COMPROBACION,
    pasos: [],
    aviso: 'En su centro de ayuda público no hemos encontrado un artículo para exportar clientes, bonos o reservas. Sí tiene una sección de Informes (ventas, pagos, suscripciones, citas): ábrela y mira si el informe que necesitas se puede descargar. Si no, pídele a su soporte la exportación de tus miembros, bonos y reservas, y guarda su respuesta.',
    fuente: { texto: 'Ayuda de bsport: Informes', href: 'https://intercom.help/bsport-helpcenter/es/collections/3868534-informes' },
  },
  {
    id: 'mindbody', nombre: 'Mindbody', verificado: false, comprobado: FECHA_COMPROBACION,
    pasos: [],
    aviso: 'No hemos encontrado una guía oficial pública de exportación. Las guías de terceros que ayudan a salir de Mindbody citan, dentro de Informes, los de «Mailing List» (clientes) y «Membership» (membresías), con descarga a Excel; los nombres cambian según la versión, así que confírmalo en tu cuenta o con su soporte. El importador de Tentare reconoce un archivo de clientes con las columnas «Pricing Option», «Remaining» y «Expiration Date» y trae también el saldo de cada bono, y lee las fechas en formato MM/DD/AAAA.',
    fuente: { texto: 'Guía de terceros (PushPress), no oficial', href: 'https://help.pushpress.com/en/articles/9864391-core-migration-export-member-list-from-previous-software-platform' },
  },
  {
    id: 'momence', nombre: 'Momence', verificado: false, comprobado: FECHA_COMPROBACION,
    pasos: [],
    aviso: 'En su centro de ayuda público no hemos encontrado un artículo para exportar clientes ni membresías. Pídele a su soporte la exportación de tus clientes, membresías y reservas, y guarda su respuesta.',
    fuente: { texto: 'Centro de ayuda de Momence', href: 'https://help.momence.com' },
  },
  {
    id: 'otro', nombre: 'Otro programa o una hoja de cálculo', verificado: true, comprobado: FECHA_COMPROBACION,
    pasos: [
      'Busca en tu programa la opción de descargar clientes, bonos o reservas en CSV o Excel (suele estar en Informes o en Clientes).',
      'Si solo te deja descargar uno, empieza por los clientes: el resto se puede traer después.',
      'Sube los archivos tal cual en «Traer mis datos»: reconoce solo qué es cada uno y ves el plan antes de ejecutar nada.',
    ],
    aviso: 'Si tu programa no te deja descargar nada, pídeselo a su soporte. Tentare no puede conectarse a otro programa por ti.',
    fuente: null,
  },
];

export function origenDe(id: unknown): OrigenMigracion | null {
  return ORIGENES.find(o => o.id === id) ?? null;
}

/** Lo que no se puede traer, dicho claro. Las tarjetas guardadas no pasan de una plataforma a otra (lo dice también la FAQ de la web). */
export const LIMITES_DE_LA_MIGRACION: readonly string[] = [
  'Las tarjetas guardadas de tus alumnas no se pueden pasar de una plataforma a otra: tendrán que volver a guardarlas al reservar o pagar con Tentare.',
  'Los cobros automáticos que tuvieras en el programa anterior no se trasladan: se vuelven a configurar en Tentare, y hasta entonces conviene no cancelar los de allí.',
  'Lo que tu programa no deje exportar, no se puede importar: en ese caso se crea a mano o se pide a su soporte.',
];
