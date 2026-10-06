// Dónde se va el tiempo de una pregunta (POST /api/asistente). Puro: se prueba
// con `node --test` (tiempos.test.ts).
//
// Solo nombres de fase y milisegundos: nada de la pregunta, de la respuesta ni
// de las personas. Las fases de antes del stream van también en la cabecera
// `Server-Timing` (se ven en la pestaña Red del navegador); las de dentro del
// stream, solo en el registro `[asistente] tiempos`, porque la cabecera ya se
// ha mandado cuando ocurren.

export interface Cronometro {
  /** Cierra la fase `nombre`: el tiempo desde la marca anterior (o desde el inicio). */
  marcar: (nombre: string) => void;
  /** Guarda un instante suelto, medido desde el inicio (p. ej. el primer evento de Anthropic). Solo la primera vez. */
  hito: (nombre: string) => void;
  /** `Server-Timing`: `auth;dur=12.3, carga;dur=80.1` (solo las fases cerradas hasta ahora). */
  cabecera: () => string;
  /** Para el registro: { fases: { auth: 12 }, hitos: { primerEvento: 900 }, totalMs }. */
  resumen: () => { fases: Record<string, number>; hitos: Record<string, number>; totalMs: number };
}

const NOMBRE_VALIDO = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const redondo = (ms: number) => Math.round(ms * 10) / 10;

export function cronometro(ahora: () => number = () => performance.now()): Cronometro {
  const inicio = ahora();
  let ultima = inicio;
  const fases: [string, number][] = [];
  const hitos = new Map<string, number>();
  return {
    marcar(nombre) {
      if (!NOMBRE_VALIDO.test(nombre)) return;
      const t = ahora();
      fases.push([nombre, redondo(t - ultima)]);
      ultima = t;
    },
    hito(nombre) {
      if (!NOMBRE_VALIDO.test(nombre) || hitos.has(nombre)) return;
      hitos.set(nombre, redondo(ahora() - inicio));
    },
    cabecera: () => fases.map(([n, d]) => `${n};dur=${d}`).join(', '),
    resumen: () => ({ fases: Object.fromEntries(fases), hitos: Object.fromEntries(hitos), totalMs: redondo(ahora() - inicio) }),
  };
}
