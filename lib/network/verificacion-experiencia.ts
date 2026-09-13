// Reglas PURAS de la verificación de experiencia de Tentare Network.
//
// El sello «experiencia verificada» dependía solo de que ALGÚN estudio lo
// aprobara: no se miraba si ese estudio era de la propia persona, y la ficha
// pública enseñaba el nombre escrito a mano en vez del estudio que verificó.

export type MotivoVerificadorNoPermitido = 'ES_SU_ESTUDIO' | 'GESTIONA_EL_ESTUDIO';

/**
 * ¿Puede ESTE estudio verificar la experiencia de ESTA persona?
 * No, si la cuenta del perfil es la dueña del estudio o lo gestiona
 * (PROPIETARIO/MANAGER en su fila de equipo): se lo estaría aprobando ella.
 */
export function motivoVerificadorNoPermitido(p: {
  perfilAuthUserId: string;
  ownerAuthUserId: string | null;
  gestionaElEstudio: boolean;
}): MotivoVerificadorNoPermitido | null {
  if (p.ownerAuthUserId && p.ownerAuthUserId === p.perfilAuthUserId) return 'ES_SU_ESTUDIO';
  if (p.gestionaElEstudio) return 'GESTIONA_EL_ESTUDIO';
  return null;
}

export const ROLES_QUE_RESUELVEN_VERIFICACION = ['PROPIETARIO', 'MANAGER'] as const;

/**
 * Nombre que se enseña en la ficha pública. Verificada → el nombre REAL del
 * estudio que la verificó, nunca el texto libre que escribió la instructora.
 * Sin verificar (o si el estudio verificador ya no existe) → el texto libre.
 */
export function nombreEstudioVisible(exp: {
  estadoVerificacion: string;
  nombreEstudio: string;
  estudioVerificadorNombre?: string | null;
}): string {
  if (exp.estadoVerificacion === 'confirmada' && exp.estudioVerificadorNombre?.trim()) {
    return exp.estudioVerificadorNombre.trim();
  }
  return exp.nombreEstudio;
}
