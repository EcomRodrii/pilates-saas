// Priorizador de conflictos (feedback del usuario sobre P2-5, 2026-07-31):
// dos especialistas pueden tener razón cada uno por su lado y aun así
// proponer acciones incompatibles ("abre otra clase" vs "esta franja va
// vacía, fusiónala") sobre la MISMA sala/instructora/tipo de clase.
// `coordinarColisiones` (director.ts) solo dedupea por `socioId` compartido
// — este módulo cubre el hueco: candidatas de especialistas DISTINTOS que
// comparten una entidad física con tipos de acción opuestos.
//
// No es detección semántica genérica: es una tabla explícita y pequeña de
// los únicos pares que el catálogo actual de `TipoRecomendacion`
// (tipos.ts:14-33) puede producir de verdad hoy. Ampliar esta tabla cuando
// el catálogo crezca, no antes — inventar pares para tipos que ningún
// especialista emite todavía sería sobre-ingeniería.
import type { Candidata, TipoRecomendacion } from './tipos.ts';

function claveDelPar(a: TipoRecomendacion, b: TipoRecomendacion): string {
  return [a, b].sort().join('|');
}

// ABRIR_SESION (Ingresos I1: "esta franja se llena, abre otra") es el
// opuesto literal de FUSIONAR_SESIONES/MOVER_HORARIO (Agenda A1/A3: "esta
// franja va vacía, quítala o muévela") — ver el comentario de agenda.ts:
// "Cubre el punto ciego de Ingresos, que solo detecta clases que se LLENAN".
//
// LLENAR_PLAZAS (Agenda A4, Fase 2 del Brain) choca con los mismos dos, y por
// el mismo motivo pero desde el otro lado del tiempo: A4 dice "esta clase del
// martes que viene va floja, vamos a llenarla" mientras A1/A3 dicen "la franja
// del martes lleva semanas medio vacía, fusiónala o muévela". Las dos pueden
// ser ciertas a la vez —rescatar la clase de esta semana Y replantear la
// franja— pero la propietaria tiene que verlas juntas para decidir si merece
// la pena el esfuerzo de llenar una franja que va a quitar.
const PARES_CONFLICTO: ReadonlySet<string> = new Set([
  claveDelPar('ABRIR_SESION', 'FUSIONAR_SESIONES'),
  claveDelPar('ABRIR_SESION', 'MOVER_HORARIO'),
  claveDelPar('LLENAR_PLAZAS', 'FUSIONAR_SESIONES'),
  claveDelPar('LLENAR_PLAZAS', 'MOVER_HORARIO'),
]);

function comparteEntidad(a: Candidata, b: Candidata): boolean {
  return (
    (!!a.instructorId && a.instructorId === b.instructorId) ||
    (!!a.salaId && a.salaId === b.salaId) ||
    (!!a.tipoClaseId && a.tipoClaseId === b.tipoClaseId)
  );
}

/**
 * Marca (sin ocultar ni elegir por la propietaria) candidatas cuyas
 * acciones se contradicen porque hablan de la misma sala/instructora/tipo
 * de clase con intenciones opuestas. Deja las dos visibles, cada una con un
 * aviso cruzado en `datosUsados.conflictoCon` — mismo principio que
 * `coordinarColisiones`: anota, no filtra. La decisión final es de la
 * propietaria, no del motor.
 */
export function detectarConflictos(candidatas: Candidata[]): Candidata[] {
  return candidatas.map(c => {
    const rival = candidatas.find(
      o => o !== c && o.especialista !== c.especialista &&
        PARES_CONFLICTO.has(claveDelPar(c.tipo, o.tipo)) && comparteEntidad(c, o)
    );
    if (!rival) return c;
    return {
      ...c,
      datosUsados: {
        ...c.datosUsados,
        conflictoCon: `${rival.especialista}: ${rival.tituloMotor}`,
      },
    };
  });
}
