// Borrador del wizard de bienvenida (11 preguntas tras crear el estudio).
//
// Auditoría de producto 2026-08-31 (P1-5): el estado del asistente vivía solo
// en un `useRef` (`components/onboarding/pantalla-bienvenida.tsx`) — recargar
// la pestaña a mitad, o un WiFi que corta, significaba repetir las 11
// preguntas desde cero. Mismo patrón que `lib/alta/borrador.ts` (el borrador
// de /crear-estudio): función pura, testable sin montar React, campo a campo
// en vez de un spread — lo que hay en localStorage lo puede editar cualquiera
// desde las herramientas del navegador.

const CLAVE = 'tentare-onboarding-wizard';
const CADUCA_MS = 1000 * 60 * 60 * 24 * 3; // 3 días: pasado eso, mejor repetir que arrastrar respuestas viejas.
const MAX_TEXTO = 60; // ninguna opción real del wizard se acerca a esto.

export interface RespuestasWizard {
  centros?: string;
  software?: string;
  alumnos?: string;
  importar?: string;
  foco?: string[];
  ayuda?: string;
  salas?: string;
  aforo?: string;
  duracion?: string;
  clases?: string[];
  cobro?: string[];
  imparte?: string;
  horario?: string;
}

type Guardable = { studioId: string; paso: number; ans: RespuestasWizard; guardadoEn: number };

/** Se guarda por estudio: el mismo navegador puede dar de alta más de uno. */
export function guardarProgresoWizard(studioId: string, paso: number, ans: RespuestasWizard): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: Guardable = { studioId, paso, ans, guardadoEn: Date.now() };
    window.localStorage.setItem(CLAVE, JSON.stringify(payload));
  } catch {
    // Modo privado, cuota llena, cookies bloqueadas. Perder el borrador es un
    // incordio; romper el wizard por no poder guardarlo, no.
  }
}

const texto = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 && v.length <= MAX_TEXTO ? v : undefined;

const listaTexto = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= MAX_TEXTO) : undefined;

/** `null` si no hay borrador, caducó, o es de OTRO estudio (mismo navegador, alta distinta). */
export function leerProgresoWizard(studioId: string): { paso: number; ans: RespuestasWizard } | null {
  if (typeof window === 'undefined') return null;
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const d = JSON.parse(crudo) as Partial<Guardable>;
    if (typeof d?.guardadoEn !== 'number' || Date.now() - d.guardadoEn > CADUCA_MS) {
      window.localStorage.removeItem(CLAVE);
      return null;
    }
    if (d.studioId !== studioId) return null;
    if (typeof d.paso !== 'number' || !Number.isInteger(d.paso) || d.paso < 0) return null;
    const a = (d.ans ?? {}) as Record<string, unknown>;
    const ans: RespuestasWizard = {
      centros: texto(a.centros), software: texto(a.software), alumnos: texto(a.alumnos),
      importar: texto(a.importar), foco: listaTexto(a.foco), ayuda: texto(a.ayuda),
      salas: texto(a.salas), aforo: texto(a.aforo), duracion: texto(a.duracion),
      clases: listaTexto(a.clases), cobro: listaTexto(a.cobro), imparte: texto(a.imparte),
      horario: texto(a.horario),
    };
    return { paso: d.paso, ans };
  } catch {
    return null;
  }
}

export function olvidarProgresoWizard(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CLAVE);
  } catch {
    // Ver guardarProgresoWizard.
  }
}
