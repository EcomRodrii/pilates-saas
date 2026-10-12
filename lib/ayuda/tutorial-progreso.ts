// ─────────────────────────────────────────────────────────────────────────────
// Qué tutoriales ha visto (o saltado) cada persona en cada estudio, y cuándo se
// abre uno solo. Puro: se prueba con `node --test` y un Storage falso.
//
// Decisión del fundador (12-oct-2026): localStorage, con el id del usuario Y el
// del estudio en la clave (hay multisede), todo envuelto en try/catch y con la
// versión del tutorial para volver a enseñarlo si cambia su contenido. Si no hay
// storage, el tutorial se ve igualmente; para no reabrirlo en cada navegación,
// lo saltado se recuerda en memoria durante la sesión.
//
// Por qué basta localStorage: un tutorial no se retoma a medias (solo importa
// «visto» o «saltado»), la clave por usuario resuelve el iPad compartido de
// recepción, y otro dispositivo cuesta como mucho un «Saltar».
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Se abre SOLO en estudios creados desde este día; en los que ya trabajan, solo
 * con el «?». Es la opción que no cambia nada a quien ya usa Tentare.
 */
export const TUTORIALES_DESDE = '2026-10-13';

export type ComoTermino = 'completado' | 'saltado';
export type ProgresoTutoriales = Record<string, { version: number; como: ComoTermino }>;

type Lector = Pick<Storage, 'getItem'>;
type Escritor = Pick<Storage, 'setItem'>;

export function claveProgreso(usuarioId: string, studioId: string): string {
  return `tentare:tutoriales:v1:${usuarioId}:${studioId}`;
}

/** Lo guardado, o `{}` si no hay, no se puede leer o está corrupto. Nunca lanza. */
export function leerProgreso(almacen: Lector | null, clave: string): ProgresoTutoriales {
  try {
    const crudo = almacen?.getItem(clave);
    if (!crudo) return {};
    const v: unknown = JSON.parse(crudo);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const limpio: ProgresoTutoriales = {};
    for (const [ruta, e] of Object.entries(v as Record<string, unknown>)) {
      const entrada = e as { version?: unknown; como?: unknown } | null;
      if (entrada && typeof entrada.version === 'number' && (entrada.como === 'completado' || entrada.como === 'saltado')) {
        limpio[ruta] = { version: entrada.version, como: entrada.como };
      }
    }
    return limpio;
  } catch {
    return {};
  }
}

/** Guarda; `false` si no se pudo (modo privado, cuota llena, bloqueado). Nunca lanza. */
export function guardarProgreso(almacen: Escritor | null, clave: string, progreso: ProgresoTutoriales): boolean {
  try {
    if (!almacen) return false;
    almacen.setItem(clave, JSON.stringify(progreso));
    return true;
  } catch {
    return false;
  }
}

export function anotar(progreso: ProgresoTutoriales, ruta: string, version: number, como: ComoTermino): ProgresoTutoriales {
  return { ...progreso, [ruta]: { version, como } };
}

/** ¿Ya lo vio (o lo saltó) en esta versión o una posterior? */
export function yaVisto(progreso: ProgresoTutoriales, ruta: string, version: number): boolean {
  const e = progreso[ruta];
  return !!e && e.version >= version;
}

/**
 * ¿Se abre solo ahora? Todo tiene que cumplirse:
 *  · la propietaria (el resto, con el «?»);
 *  · sin la visita guiada en marcha (nunca dos guías a la vez);
 *  · ningún diálogo de la app abierto;
 *  · una sede de cadena no (la monta quien ya conoce Tentare);
 *  · un estudio creado desde `TUTORIALES_DESDE` (nada nuevo a quien ya trabaja);
 *  · no lo ha visto ni saltado en esta versión, tampoco en esta sesión.
 */
export function debeAbrirseSolo(p: {
  rol: string | null;
  visitaActiva: boolean;
  dialogoAbierto: boolean;
  esSedeDeCadena: boolean;
  creadoEn: string | null | undefined;
  ruta: string;
  version: number;
  progreso: ProgresoTutoriales;
  vistosEnSesion: ReadonlySet<string>;
}): boolean {
  if (p.rol !== 'PROPIETARIO' || p.visitaActiva || p.dialogoAbierto || p.esSedeDeCadena) return false;
  if (!p.creadoEn || p.creadoEn.slice(0, 10) < TUTORIALES_DESDE) return false;
  if (p.vistosEnSesion.has(p.ruta)) return false;
  return !yaVisto(p.progreso, p.ruta, p.version);
}
