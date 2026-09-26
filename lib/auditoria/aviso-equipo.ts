// Cuánto se guarda el libro de auditoría y qué se le dice al equipo sobre él.
//
// Decisión del fundador (25-sep-2026): el libro `auditoria_estudio` se conserva
// 6 AÑOS, el plazo mercantil de libros y justificantes, coherente con los recibos y
// facturas que audita. Pasado ese plazo lo borra solo `purgar_datos_caducados()`
// (migración 20260925215204): un libro que no se puede purgar nunca es justo lo que
// el RGPD no admite. El plazo vive AQUÍ y en esa migración; un test ata los dos.
//
// ⚠️ LEGAL: el plazo y estos textos son la propuesta técnica que el fundador eligió;
// la redacción para el contrato o los términos la valida un abogado. El aviso lo da
// el estudio (responsable del tratamiento); Tentare pone el sitio y el texto.
//
// Puro, sin I/O ni alias `@/`: lo usan la pantalla, el correo de invitación y la
// ayuda, y se prueba con `node --test`.

/** Años que se guarda una entrada del libro antes de borrarse sola. */
export const PLAZO_CONSERVACION_ANIOS = 6;

/**
 * Roles cuyos cambios de dinero en el panel quedan anotados. Una instructora
 * trabaja en la app del estudio, no toca esas tablas (la RLS se lo impide) y no
 * aparece en el libro: avisarle de lo que no ocurre sería ruido.
 */
const ROLES_CUYOS_CAMBIOS_SE_ANOTAN: readonly string[] = ['PROPIETARIO', 'MANAGER', 'RECEPCION'];

/** ¿Lo que esta persona haga con el dinero en el panel queda en el libro? Un rol desconocido, no: no se avisa de lo que no se sabe. */
export function seAnotanSusCambios(rol: string | null | undefined): boolean {
  return typeof rol === 'string' && ROLES_CUYOS_CAMBIOS_SE_ANOTAN.includes(rol);
}

const PLAZO = `${PLAZO_CONSERVACION_ANIOS} años`;

/**
 * Lo que se le dice A LA PERSONA cuyo trabajo se anota (correo de invitación).
 * Qué se guarda, quién lo ve y cuánto: transparencia, sin jerga.
 */
export const AVISO_PARA_LA_PERSONA =
  'Cuando trabajes con el dinero del estudio en el panel (recibos, cuotas, planes, reembolsos, ingresos), '
  + 'Tentare anota quién lo hizo, cuándo y qué valor había antes. Solo lo ve la propietaria y se guarda '
  + `${PLAZO}; después se borra solo.`;

/** Lo que se le dice A LA PROPIETARIA al dar de alta a alguien (el aviso es del estudio, no de Tentare). */
export const AVISO_AL_DAR_DE_ALTA =
  'Lo que esta persona haga con el dinero en el panel (recibos, cuotas, planes, reembolsos, ingresos) quedará '
  + `anotado: quién, cuándo y qué valor había antes. Solo lo ve la propietaria y se guarda ${PLAZO}. `
  + 'El correo de invitación se lo cuenta; si no se lo envías, díselo tú.';

/** La nota fija de la pantalla de Equipo, para la propietaria. */
export const AVISO_EN_LA_PANTALLA_DE_EQUIPO =
  'Los cambios de dinero de quien trabaja en el panel se anotan en Cobros → Cambios del equipo: quién, cuándo y '
  + `qué valor había antes. Solo lo ves tú y se guarda ${PLAZO}. Quien invitas lo lee en su correo de invitación; `
  + 'a quien ya trabaja contigo, avísale tú.';

/** La frase de conservación que acompaña al propio historial. */
export const AVISO_DE_CONSERVACION = `Cada entrada se guarda ${PLAZO} y después se borra sola.`;
