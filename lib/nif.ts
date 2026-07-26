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

// ─── Validación COMPLETA con dígito/letra de control (para formularios) ───────
// A diferencia de nifEmisorValido (guarda ligera del sellado, que NO mira el
// control), esta comprueba el dígito de control de DNI/NIE/CIF. Se usa al
// capturar el NIF del estudio: rechaza uno con la letra/control equivocados
// antes de guardarlo, en vez de aceptar cualquier cosa con el formato correcto.
const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';

export function nifValido(nif: string | null | undefined): boolean {
  const n = (nif ?? '').trim().toUpperCase().replace(/[\s.-]/g, '');

  // DNI: 8 dígitos + letra de control.
  if (/^[0-9]{8}[A-Z]$/.test(n)) {
    return n[8] === LETRAS_DNI[parseInt(n.slice(0, 8), 10) % 23];
  }
  // NIE: [XYZ] + 7 dígitos + letra. La inicial cuenta como 0/1/2.
  if (/^[XYZ][0-9]{7}[A-Z]$/.test(n)) {
    const prefijo = { X: '0', Y: '1', Z: '2' }[n[0] as 'X' | 'Y' | 'Z'];
    return n[8] === LETRAS_DNI[parseInt(prefijo + n.slice(1, 8), 10) % 23];
  }
  // CIF: letra de tipo + 7 dígitos + control (dígito o letra según forma jurídica;
  // aceptamos el que cuadre).
  if (/^[A-HJNPQRSUVW][0-9]{7}[0-9A-J]$/.test(n)) {
    const centrales = n.slice(1, 8);
    let suma = 0;
    for (let i = 0; i < 7; i++) {
      const d = parseInt(centrales[i], 10);
      if (i % 2 === 0) { const x = d * 2; suma += Math.floor(x / 10) + (x % 10); }
      else { suma += d; }
    }
    const control = (10 - (suma % 10)) % 10;
    return n[8] === String(control) || n[8] === 'JABCDEFGHI'[control];
  }
  return false;
}
