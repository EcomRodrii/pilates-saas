// El recuento que la propietaria lee tras pulsar «Avisar» en «Rellenar hueco».
//
// Vive aquí y no dentro del panel por el mismo motivo que `topeAvisosHueco`
// (`booking-logic.ts`): el runner de tests solo mira `lib/**`, y este texto es
// justo donde el repo se ha equivocado antes —anunciar éxito con el servidor
// diciendo que no—. Una frase que decide si la propietaria cree que ha avisado
// a alguien tiene que poder fallar en un test.
//
// La regla: TODA socia que sale de la lista se cuenta con su motivo. Un
// «0 avisos enviados» a secas se lee como una avería, y un «4 avisos enviados»
// tras seleccionar a doce es verdad a medias, que es peor.
//
// ⚠️ Nada de esto puede dar por hecha la forma de la respuesta: el panel llega
// aquí con lo que venga de `res.json()`, que ante un error de red o un mock a
// medias es `{}`. Todos los campos son opcionales y se leen a la defensiva.

export interface RespuestaAvisoHueco {
  enviados?: number;
  porWhatsapp?: number;
  porEmail?: number;
  errores?: number;
  sinConsentimiento?: number;
  sinContacto?: number;
  /** Por NOMBRE: lo que hay que hacer es abrir SU ficha y corregir la dirección. */
  correoRoto?: unknown;
  saltadasPorDedup?: number;
  saltadasPorTope?: number;
  /** El tope real de esta clase, que depende del aforo EFECTIVO. */
  tope?: number;
  saltadasPorExcepcion?: number;
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

export function resumenAvisoHueco(r: RespuestaAvisoHueco): string {
  const enviados = n(r.enviados);

  // Por qué canal salió cada uno: el servidor elige WhatsApp o email por socia,
  // así que decir solo «5 avisos enviados» deja a la propietaria sin saber
  // dónde mirar si alguna dice que no le llegó.
  const canales = [
    n(r.porWhatsapp) ? `${n(r.porWhatsapp)} por WhatsApp` : null,
    n(r.porEmail) ? `${n(r.porEmail)} por email` : null,
  ].filter(Boolean).join(' y ');

  const partes = [
    `${enviados} aviso${enviados === 1 ? '' : 's'} enviado${enviados === 1 ? '' : 's'}${canales ? ` (${canales})` : ''}`,
  ];

  // El tope va PRIMERO de las razones: es la que explica que el número sea
  // menor que lo que se acaba de seleccionar, y la única que no depende de la
  // socia sino de cuántas plazas hay. `tope` se dice tal cual lo manda el
  // servidor —depende del aforo efectivo, que la pantalla no conoce—, y si no
  // viene se calla en vez de inventárselo.
  if (n(r.saltadasPorTope)) {
    // `tope: 0` es un valor legítimo (el aforo efectivo se quedó sin plazas),
    // así que la condición es «viene un número», no «viene un número > 0».
    const cual = typeof r.tope === 'number' && Number.isFinite(r.tope)
      ? `: el tope de esta clase es ${r.tope}`
      : '';
    partes.push(`${n(r.saltadasPorTope)} sin avisar${cual}`);
  }

  if (n(r.sinContacto)) partes.push(`${n(r.sinContacto)} sin teléfono ni email`);
  if (n(r.sinConsentimiento)) partes.push(`${n(r.sinConsentimiento)} sin consentimiento de marketing`);

  // La excepción de la ficha. Se nombra el interruptor TAL CUAL está escrito
  // ahí («No avisarle de clases con hueco», lib/excepciones.ts) para que no
  // haya que adivinar qué desactivar: es una decisión de la propietaria, no un
  // impedimento técnico, y puede querer revertirla.
  if (n(r.saltadasPorExcepcion)) {
    const c = n(r.saltadasPorExcepcion);
    partes.push(`${c} con «No avisarle de clases con hueco» en su ficha`);
  }

  // Con nombre: lo que hay que hacer es abrir SU ficha y corregir la dirección,
  // así que decir «1 con el correo mal» obligaría a adivinar cuál.
  const rotos = Array.isArray(r.correoRoto) ? r.correoRoto.filter((x): x is string => typeof x === 'string') : [];
  if (rotos.length) partes.push(`el correo de ${rotos.join(', ')} rebota — corrígelo en su ficha`);

  if (n(r.saltadasPorDedup)) {
    partes.push(`${n(r.saltadasPorDedup)} ya avisada${n(r.saltadasPorDedup) === 1 ? '' : 's'} en las últimas 24 h`);
  }
  if (n(r.errores)) partes.push(`${n(r.errores)} con error`);

  return partes.join(' · ');
}
