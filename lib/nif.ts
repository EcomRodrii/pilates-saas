// Validación ligera del NIF/CIF/NIE del EMISOR para el sellado Veri*Factu.
// No valida el dígito de control (eso corresponde a la AEAT): su único objetivo es
// impedir emitir/sellar facturas con un NIF VACÍO o de RELLENO (p. ej. el
// `B12345678` del estudio demo), que crearía una cadena Veri*Factu con identidad
// fiscal falsa. Puro y testeable.

// Formato: DNI (8 dígitos + letra) · NIE ([XYZ] + 7 dígitos + letra) ·
// CIF (letra de tipo + 7 dígitos + control dígito/letra A-J).
const FORMATO = /^([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z]|[A-HJNPQRSUVW][0-9]{7}[0-9A-J])$/;

// Secuencias/repeticiones obvias en la parte numérica = relleno. Cazan el
// `B12345678` del demo (dígitos "12345678") sin depender de la letra concreta.
const DIGITOS_RELLENO = new Set(['12345678', '00000000', '11111111', '99999999', '23456789', '87654321']);

export function nifEmisorValido(nif: string | null | undefined): boolean {
  const n = (nif ?? '').trim().toUpperCase();
  if (!FORMATO.test(n)) return false;
  const digitos = n.replace(/\D/g, '');
  return !DIGITOS_RELLENO.has(digitos);
}
