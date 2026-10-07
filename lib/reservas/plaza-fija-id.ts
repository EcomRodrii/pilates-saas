// El id de una reserva de clase fija empieza por `res-pf-`: ese prefijo es un CONTRATO, no un nombre.
// Doce sitios lo leen como «la paga la cuota, no consume bono y no se rastrea» (cancelar sin devolver
// bono, `reservas_plaza_fija_sin_cuota`, `liberar_derecho`, acceso por QR, penalizaciones, devolver-bonos,
// los rechazos de mostrador y de plataformas externas…). Una reserva pagada con bono NUNCA lleva este
// prefijo: el barrido nocturno la cancelaría como «sin cuota» y no devolvería la sesión.
//
// Sin imports a propósito (corre bajo `node --test` y en el navegador). La gemela en SQL es el
// `like 'res-pf-%'` de las funciones de reservas: si cambia una, cambia la otra.

export const PREFIJO_RESERVA_PLAZA_FIJA = 'res-pf-';

export function esReservaPlazaFija(reservaId: string | null | undefined): boolean {
  return typeof reservaId === 'string' && reservaId.startsWith(PREFIJO_RESERVA_PLAZA_FIJA);
}
