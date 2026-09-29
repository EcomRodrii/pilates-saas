// Veri*Factu — qué marcas lleva un registro que corrige o anula a otro.
//
// Sale LITERAL del anexo «Operativas de alta y anulación admisibles» del
// documento «Validaciones» de la AEAT (v1.2.2, §6.1 y §6.2), para la modalidad
// VERI*FACTU. No hay interpretación propia aquí: si el cuadro cambia, cambia esto.
//
// ALTA (§6.1):
//   · Alta normal ......................................... Subsanacion —, RechazoPrevio —
//   · Alta por rechazo (el alta inicial fue rechazada) .... Subsanacion S, RechazoPrevio X
//   · Alta de subsanación (el registro está en la AEAT) ... Subsanacion S, RechazoPrevio —
//   · Alta por rechazo de subsanación (está en la AEAT y
//     una subsanación anterior fue rechazada) ............. Subsanacion S, RechazoPrevio S
//   · Subsanación sin registro previo (existe en el SIF pero
//     nunca se remitió) .................................... Subsanacion S, RechazoPrevio X
// ANULACIÓN (§6.2):
//   · Anulación normal .................................... SinRegistroPrevio —, RechazoPrevio —
//   · Anulación por rechazo (anulación anterior rechazada). SinRegistroPrevio —, RechazoPrevio S
//   · Anulación sin registro previo (nunca se remitió) .... SinRegistroPrevio S, RechazoPrevio —
//   · Anulación por rechazo sin registro previo ........... SinRegistroPrevio S, RechazoPrevio S
//
// ⚠️ La subsanación solo vale «cuando no se exija la emisión de una factura
// rectificativa» (misma fuente, §6.1, y FAQ de desarrolladores §17). Esa
// decisión es fiscal y la toma la propietaria (o su asesoría), no este código.

/** Qué sabe Tentare del registro que se va a corregir. */
export interface SituacionAlta {
  /** ¿Está ese registro (o uno anterior de la misma factura) admitido en la AEAT? */
  existeEnAeat: boolean;
  /** ¿La última subsanación de esa factura fue rechazada? Solo importa si existe en la AEAT. */
  subsanacionAnteriorRechazada: boolean;
}

export interface MarcasAlta {
  subsanacion: true;
  rechazoPrevio: 'N' | 'S' | 'X';
}

export function marcasSubsanacion(s: SituacionAlta): MarcasAlta {
  if (!s.existeEnAeat) {
    // Alta por rechazo / subsanación sin registro previo: la AEAT no tiene nada.
    return { subsanacion: true, rechazoPrevio: 'X' };
  }
  return { subsanacion: true, rechazoPrevio: s.subsanacionAnteriorRechazada ? 'S' : 'N' };
}

export interface SituacionAnulacion {
  existeEnAeat: boolean;
  anulacionAnteriorRechazada: boolean;
}

export interface MarcasAnulacion {
  sinRegistroPrevio: boolean;
  rechazoPrevio: boolean;
}

export function marcasAnulacion(s: SituacionAnulacion): MarcasAnulacion {
  return { sinRegistroPrevio: !s.existeEnAeat, rechazoPrevio: s.anulacionAnteriorRechazada };
}
