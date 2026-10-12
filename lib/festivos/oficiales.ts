// ─────────────────────────────────────────────────────────────────────────────
// Festivos laborales oficiales (nacionales + autonómicos) de las comunidades
// donde trabaja Tentare. Puro: lo leen el aviso de la bandeja, «Comprobar mi
// horario» y «Repetir este mes».
//
// ⚠️ Esto son FECHAS LEGALES: se copian a mano del boletín oficial, nunca las
// propone un modelo ni se calculan. Cada calendario cita su fuente (diario,
// número, fecha y enlace) y se ha contrastado contra el texto publicado. Si
// una fecha no se puede comprobar contra su boletín, NO entra: mejor un
// festivo sin aviso que un aviso falso que haga cerrar un día laborable.
//
// Fuera a propósito: las dos fiestas LOCALES de cada municipio (cambian de un
// pueblo a otro y no hay una fuente única); el aviso lo dice.
//
// Cada noviembre se añade el año siguiente: la guardia de `oficiales.test.ts`
// falla a partir del 1-nov si falta (el BOE publica la relación a finales de
// octubre; los boletines autonómicos, antes).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Zona con calendario propio. `ARAN` es Cataluña con las sustituciones que la
 * propia norma catalana fija para el Valle de Arán (17-jun, Festa d'Aran).
 */
export type ZonaFestivos = 'CATALUNA' | 'ARAN' | 'MADRID' | 'ANDALUCIA';

export interface FestivoOficial {
  /** YYYY-MM-DD, día civil en España (sin hora). */
  fecha: string;
  nombre: string;
}

interface CalendarioOficial {
  anio: number;
  zona: ZonaFestivos;
  /** Norma y diario oficial del que se ha copiado. */
  fuente: string;
  url: string;
  festivos: readonly FestivoOficial[];
}

/** Para la etiqueta «Festivo en Cataluña». */
export const NOMBRE_ZONA: Record<ZonaFestivos, string> = {
  CATALUNA: 'Cataluña',
  ARAN: 'el Valle de Arán',
  MADRID: 'la Comunidad de Madrid',
  ANDALUCIA: 'Andalucía',
};

const BOE_2026 =
  'Resolución de 17 de octubre de 2025, de la Dirección General de Trabajo, por la que se publica la relación de fiestas laborales para el año 2026 (BOE núm. 259, de 28 de octubre de 2025, BOE-A-2025-21667)';
const BOE_2026_URL = 'https://www.boe.es/buscar/doc.php?id=BOE-A-2025-21667';

const CATALUNA_2026: readonly FestivoOficial[] = [
  { fecha: '2026-01-01', nombre: 'Año Nuevo' },
  { fecha: '2026-01-06', nombre: 'Reyes' },
  { fecha: '2026-04-03', nombre: 'Viernes Santo' },
  { fecha: '2026-04-06', nombre: 'Lunes de Pascua' },
  { fecha: '2026-05-01', nombre: 'Fiesta del Trabajo' },
  { fecha: '2026-06-24', nombre: 'San Juan' },
  { fecha: '2026-08-15', nombre: 'Asunción' },
  { fecha: '2026-09-11', nombre: 'Diada de Cataluña' },
  { fecha: '2026-10-12', nombre: 'Fiesta Nacional de España' },
  { fecha: '2026-12-08', nombre: 'Inmaculada' },
  { fecha: '2026-12-25', nombre: 'Navidad' },
  { fecha: '2026-12-26', nombre: 'San Esteban' },
];

const CATALUNA_2027: readonly FestivoOficial[] = [
  { fecha: '2027-01-01', nombre: 'Año Nuevo' },
  { fecha: '2027-01-06', nombre: 'Reyes' },
  { fecha: '2027-03-26', nombre: 'Viernes Santo' },
  { fecha: '2027-03-29', nombre: 'Lunes de Pascua' },
  { fecha: '2027-05-01', nombre: 'Fiesta del Trabajo' },
  { fecha: '2027-06-24', nombre: 'San Juan' },
  { fecha: '2027-09-11', nombre: 'Diada de Cataluña' },
  { fecha: '2027-10-12', nombre: 'Fiesta Nacional de España' },
  { fecha: '2027-11-01', nombre: 'Todos los Santos' },
  { fecha: '2027-12-06', nombre: 'Día de la Constitución' },
  { fecha: '2027-12-08', nombre: 'Inmaculada' },
  { fecha: '2027-12-25', nombre: 'Navidad' },
];

/** En Arán, la norma catalana cambia UN festivo por el 17 de junio. */
function conFestaDAran(base: readonly FestivoOficial[], sustituida: string, anio: number): readonly FestivoOficial[] {
  return [...base.filter((f) => f.fecha !== sustituida), { fecha: `${anio}-06-17`, nombre: "Festa d'Aran" }].sort((a, b) =>
    a.fecha.localeCompare(b.fecha),
  );
}

const CALENDARIOS: readonly CalendarioOficial[] = [
  // ── 2026 ──────────────────────────────────────────────────────────────────
  {
    anio: 2026,
    zona: 'CATALUNA',
    fuente: `${BOE_2026}, anexo; recoge la Orden EMT/66/2025 de la Generalitat (DOGC de 6 de mayo de 2025)`,
    url: BOE_2026_URL,
    festivos: CATALUNA_2026,
  },
  {
    anio: 2026,
    zona: 'ARAN',
    fuente: `${BOE_2026}, anexo, nota (2): en Arán el 26 de diciembre se sustituye por el 17 de junio`,
    url: BOE_2026_URL,
    festivos: conFestaDAran(CATALUNA_2026, '2026-12-26', 2026),
  },
  {
    anio: 2026,
    zona: 'MADRID',
    fuente: `${BOE_2026}, anexo`,
    url: BOE_2026_URL,
    festivos: [
      { fecha: '2026-01-01', nombre: 'Año Nuevo' },
      { fecha: '2026-01-06', nombre: 'Reyes' },
      { fecha: '2026-04-02', nombre: 'Jueves Santo' },
      { fecha: '2026-04-03', nombre: 'Viernes Santo' },
      { fecha: '2026-05-01', nombre: 'Fiesta del Trabajo' },
      { fecha: '2026-05-02', nombre: 'Fiesta de la Comunidad de Madrid' },
      { fecha: '2026-08-15', nombre: 'Asunción' },
      { fecha: '2026-10-12', nombre: 'Fiesta Nacional de España' },
      { fecha: '2026-11-02', nombre: 'Todos los Santos, trasladado' },
      { fecha: '2026-12-07', nombre: 'Día de la Constitución, trasladado' },
      { fecha: '2026-12-08', nombre: 'Inmaculada' },
      { fecha: '2026-12-25', nombre: 'Navidad' },
    ],
  },
  {
    anio: 2026,
    zona: 'ANDALUCIA',
    fuente: `${BOE_2026}, anexo`,
    url: BOE_2026_URL,
    festivos: [
      { fecha: '2026-01-01', nombre: 'Año Nuevo' },
      { fecha: '2026-01-06', nombre: 'Reyes' },
      { fecha: '2026-02-28', nombre: 'Día de Andalucía' },
      { fecha: '2026-04-02', nombre: 'Jueves Santo' },
      { fecha: '2026-04-03', nombre: 'Viernes Santo' },
      { fecha: '2026-05-01', nombre: 'Fiesta del Trabajo' },
      { fecha: '2026-08-15', nombre: 'Asunción' },
      { fecha: '2026-10-12', nombre: 'Fiesta Nacional de España' },
      { fecha: '2026-11-02', nombre: 'Todos los Santos, trasladado' },
      { fecha: '2026-12-07', nombre: 'Día de la Constitución, trasladado' },
      { fecha: '2026-12-08', nombre: 'Inmaculada' },
      { fecha: '2026-12-25', nombre: 'Navidad' },
    ],
  },
  // ── 2027 (el BOE aún no ha publicado su relación: mandan los boletines
  //    autonómicos, que son la norma de origen) ────────────────────────────────
  {
    anio: 2027,
    zona: 'CATALUNA',
    fuente:
      'Ordre EMT/52/2026, de 25 de març, per la qual s’estableix el calendari oficial de festes laborals per a l’any 2027 (DOGC núm. 9637, d’1 d’abril de 2026), article 1',
    url: 'https://dogc.gencat.cat/ca/document-del-dogc/?documentId=1040896',
    festivos: CATALUNA_2027,
  },
  {
    anio: 2027,
    zona: 'ARAN',
    fuente:
      'Ordre EMT/52/2026 (DOGC núm. 9637, d’1 d’abril de 2026), article 1: a l’Aran el 29 de març se substitueix pel 17 de juny (Festa d’Aran)',
    url: 'https://dogc.gencat.cat/ca/document-del-dogc/?documentId=1040896',
    festivos: conFestaDAran(CATALUNA_2027, '2027-03-29', 2027),
  },
  {
    anio: 2027,
    zona: 'MADRID',
    fuente:
      'Decreto 82/2026, de 30 de septiembre, del Consejo de Gobierno, por el que se establecen las fiestas laborales para el año 2027 en la Comunidad de Madrid (BOCM núm. 234, de 1 de octubre de 2026), anexo',
    url: 'https://www.bocm.es/boletin/CM_Orden_BOCM/2026/10/01/BOCM-20261001-19.PDF',
    festivos: [
      { fecha: '2027-01-01', nombre: 'Año Nuevo' },
      { fecha: '2027-01-06', nombre: 'Reyes' },
      { fecha: '2027-03-19', nombre: 'San José' },
      { fecha: '2027-03-25', nombre: 'Jueves Santo' },
      { fecha: '2027-03-26', nombre: 'Viernes Santo' },
      { fecha: '2027-05-01', nombre: 'Fiesta del Trabajo' },
      { fecha: '2027-08-16', nombre: 'Asunción, trasladada' },
      { fecha: '2027-10-12', nombre: 'Fiesta Nacional de España' },
      { fecha: '2027-11-01', nombre: 'Todos los Santos' },
      { fecha: '2027-12-06', nombre: 'Día de la Constitución' },
      { fecha: '2027-12-08', nombre: 'Inmaculada' },
      { fecha: '2027-12-25', nombre: 'Navidad' },
    ],
  },
  {
    anio: 2027,
    zona: 'ANDALUCIA',
    fuente:
      'Decreto 84/2026, de 29 de abril, por el que se determina el calendario de fiestas laborales de la Comunidad Autónoma de Andalucía para el año 2027 (BOJA núm. 84, de 5 de mayo de 2026), anexo',
    url: 'https://www.juntadeandalucia.es/eboja/2026/84/BOJA26-084-00002-5812-01_00337048.pdf',
    festivos: [
      { fecha: '2027-01-01', nombre: 'Año Nuevo' },
      { fecha: '2027-01-06', nombre: 'Reyes' },
      { fecha: '2027-03-01', nombre: 'Día de Andalucía, trasladado' },
      { fecha: '2027-03-25', nombre: 'Jueves Santo' },
      { fecha: '2027-03-26', nombre: 'Viernes Santo' },
      { fecha: '2027-05-01', nombre: 'Fiesta del Trabajo' },
      { fecha: '2027-08-16', nombre: 'Asunción, trasladada' },
      { fecha: '2027-10-12', nombre: 'Fiesta Nacional de España' },
      { fecha: '2027-11-01', nombre: 'Todos los Santos' },
      { fecha: '2027-12-06', nombre: 'Día de la Constitución' },
      { fecha: '2027-12-08', nombre: 'Inmaculada' },
      { fecha: '2027-12-25', nombre: 'Navidad' },
    ],
  },
];

/** Solo para los tests y la guardia: los calendarios tal cual. */
export const CALENDARIOS_OFICIALES = CALENDARIOS;

/** Años con calendario cargado para una zona. */
export function aniosConFestivos(zona: ZonaFestivos): number[] {
  return CALENDARIOS.filter((c) => c.zona === zona).map((c) => c.anio);
}

/**
 * Festivos de la zona entre dos días (YYYY-MM-DD, ambos incluidos), en orden.
 * Un año sin calendario cargado no devuelve nada: sin dato, no se avisa.
 */
export function festivosEntre(zona: ZonaFestivos, desde: string, hasta: string): FestivoOficial[] {
  const out: FestivoOficial[] = [];
  for (const c of CALENDARIOS) {
    if (c.zona !== zona) continue;
    for (const f of c.festivos) if (f.fecha >= desde && f.fecha <= hasta) out.push(f);
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** El festivo de ese día en la zona, o null. */
export function festivoDe(zona: ZonaFestivos, fecha: string): FestivoOficial | null {
  return festivosEntre(zona, fecha, fecha)[0] ?? null;
}

/** ¿Hay calendario cargado para el año de esa fecha? (para decir «no lo sé»). */
export function hayCalendario(zona: ZonaFestivos, fecha: string): boolean {
  const anio = Number(fecha.slice(0, 4));
  return CALENDARIOS.some((c) => c.zona === zona && c.anio === anio);
}
