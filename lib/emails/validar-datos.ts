// Validación de `body.data` en /api/emails/send.
//
// Cada rama del endpoint hace `const d = body.data as {...}`: un cast que
// TypeScript no comprueba en runtime. El agujero no es teórico — el cuerpo del
// mensaje de una automatización ES el email entero, y lo único que impedía
// enviarlo en blanco a una clienta era el `disabled` de un botón en el cliente.
//
// Sólo se exige lo que rompe el email de forma visible para quien lo recibe.
// Los campos con default o renderizado condicional en la plantilla se dejan
// pasar: inventar requisitos aquí rompería callers legítimos.
export const CAMPOS_REQUERIDOS: Record<string, readonly string[]> = {
  // `subject` es `Pago confirmado — ${d.concepto}` SIN asuntoCustom (recibo no
  // es plantilla editable), así que un concepto ausente sale como "undefined"
  // en el asunto de un justificante de pago. importe y fechaCobro van aparte
  // porque no basta con que existan (ver validarDatosEmail).
  recibo: ['concepto'],
  // Autodefensiva: todos sus campos tienen default o van con `{x && ...}`, y el
  // asunto ya usa `?? 'Tentare'`. Con data = {} el email sale íntegro.
  bienvenida: [],
  // El mensaje es el email entero; el título es el asunto.
  automatizacion: ['titulo', 'mensaje'],
  // Las cuatro de clase comparten plantilla y forma. claseNombre aparece en el
  // asunto Y en el `preview` (la línea que se lee en la bandeja): sin él queda
  // "undefined ha sido cancelada" como titular. fecha y hora se pintan como
  // hijos JSX, así que no dicen "undefined" — dejan la fila en blanco, que en
  // un recordatorio o una cancelación es igual de inútil.
  //
  // `sala` e `instructor` NO se exigen a propósito: el cron de recordatorios
  // manda cadena vacía cuando la sesión no las tiene asignadas
  // (lib/supabase-data.ts:1848-1849). Es un caso válido del dominio.
  reserva: ['claseNombre', 'fecha', 'hora'],
  promocion: ['claseNombre', 'fecha', 'hora'],
  cancelacion: ['claseNombre', 'fecha', 'hora'],
  recordatorio: ['claseNombre', 'fecha', 'hora'],
};

// `null` cuenta como ausente: los defaults de parámetro de las plantillas
// (`estudioNombre = 'Tentare'`) sólo se disparan con `undefined`, así que un
// null del JSON se cuela hasta el render.
function vacio(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

/** Devuelve un mensaje de error si los datos no sirven para enviar, o null si todo bien. */
export function validarDatosEmail(tipo: string, data: unknown): string | null {
  const d = (data ?? {}) as Record<string, unknown>;

  const faltan = (CAMPOS_REQUERIDOS[tipo] ?? []).filter(c => vacio(d[c]));
  if (faltan.length > 0) {
    return `Faltan datos para enviar el email de tipo "${tipo}": ${faltan.join(', ')}.`;
  }

  if (tipo === 'recibo') {
    // recibo-template hace importe.toFixed(2) en el preview: un string "12.50"
    // del JSON revienta igual que un undefined, y el endpoint no tiene try/catch
    // alrededor del render, así que sale un 500 opaco. Comprobar el TIPO, no la
    // presencia — `!d.importe` rechazaría un importe legítimo de 0.
    if (typeof d.importe !== 'number' || !Number.isFinite(d.importe)) {
      return 'El importe del recibo debe ser un número.';
    }
    // La plantilla hace new Date(fechaCobro).toLocaleDateString(): una fecha que
    // no parsea renderiza literalmente "Invalid Date" bajo la etiqueta "Fecha".
    if (vacio(d.fechaCobro) || Number.isNaN(new Date(d.fechaCobro as string).getTime())) {
      return 'La fecha de cobro del recibo no es válida.';
    }
  }

  return null;
}
