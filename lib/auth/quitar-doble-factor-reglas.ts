// ¿Puede un estudio quitarle la verificación en dos pasos a una alumna que ha
// perdido el acceso a su app Y a su correo? (decisión del 4-oct-2026). Puro,
// sin I/O: lo prueba `node --test` y lo aplica `lib/auth/quitar-doble-factor.ts`.
//
// La cuenta es UNA por persona y puede estar en varios estudios, así que quitar
// la verificación desde un estudio la quita en todos. Por eso solo se deja
// cuando ese estudio es el único que «tiene» la cuenta:
//   · nunca si la cuenta es del equipo de algún estudio (propietaria de un
//     estudio o de una cadena, o ficha de equipo, activa o no) o del equipo de
//     Tentare: la verificación protege el panel (y /interno), y un estudio no
//     puede abrir el panel de otro, ni el suyo propio por la puerta de atrás;
//   · nunca si la cuenta vive también fuera de este estudio: alumna de un
//     estudio que NO es de la misma cadena, o con perfil en Tentare Network.
//     Un estudio no decide sobre la seguridad de la cuenta con la que su alumna
//     entra en otro sitio.
// En esos casos no se toca nada, y el mensaje es el MISMO para los dos: decir
// cuál de ellos es contaría al estudio dónde más está su alumna.

export type MotivoNoQuitar = 'sin_cuenta' | 'sin_verificacion' | 'cuenta_de_equipo' | 'otro_estudio';

export interface CuentaParaQuitar {
  /** La alumna tiene cuenta en la app (`socios.auth_user_id`). */
  tieneCuenta: boolean;
  /** Factores verificados de la cuenta. */
  factoresVerificados: number;
  /** Propietaria de un estudio o una cadena, ficha de equipo en alguno, o del equipo de Tentare. */
  esDelEquipo: boolean;
  /** Tiene perfil en Tentare Network (profesional o alumna). */
  enNetwork: boolean;
  /** Estudios en los que la cuenta tiene ficha de alumna (sin dar de baja o no: la cuenta sigue siendo la misma). */
  estudiosComoAlumna: Array<{ studioId: string; cadenaId: string | null }>;
  /** El estudio que lo pide y su cadena. */
  estudio: { studioId: string; cadenaId: string | null };
}

export function motivoNoQuitar(c: CuentaParaQuitar): MotivoNoQuitar | null {
  if (!c.tieneCuenta) return 'sin_cuenta';
  if (c.factoresVerificados === 0) return 'sin_verificacion';
  if (c.esDelEquipo) return 'cuenta_de_equipo';
  if (c.enNetwork) return 'otro_estudio';
  const ajeno = c.estudiosComoAlumna.some(e => e.studioId !== c.estudio.studioId
    && (c.estudio.cadenaId === null || e.cadenaId !== c.estudio.cadenaId));
  if (ajeno) return 'otro_estudio';
  return null;
}

const FUERA_DE_ALCANCE = 'Su cuenta no se puede gestionar desde tu estudio, así que no se la puedes quitar desde aquí. Si ha perdido el acceso, que escriba a soporte de Tentare.';

export const MENSAJE_NO_QUITAR: Record<MotivoNoQuitar, string> = {
  sin_cuenta: 'Todavía no ha creado su cuenta en la app.',
  sin_verificacion: 'No tiene la verificación en dos pasos activada.',
  cuenta_de_equipo: FUERA_DE_ALCANCE,
  otro_estudio: FUERA_DE_ALCANCE,
};
