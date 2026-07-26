// ─────────────────────────────────────────────────────────────────────────────
// Los textos legales que firma la clienta, con los datos REALES del estudio.
//
// El texto por defecto decía "El responsable del tratamiento de sus datos es el
// estudio de pilates (en adelante, «el Estudio»)" — sin nombre, sin NIF y sin
// dirección, aunque el estudio los tuviera rellenos en Configuración. El RGPD
// (art. 13.1.a) exige identificar al responsable: sin eso, lo que firma la
// clienta no informa de nada y no protege a nadie.
//
// La cláusula de cancelación también estaba clavada a "12 horas" mientras
// `studios.cancelacion_ventana_horas` es configurable — el contrato decía una
// cosa y el software hacía otra.
//
// Puro y sin dependencias: es lo que se enseña en el alta, en el portal y en
// Configuración, y lo que se guarda como evidencia de lo aceptado.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que hace falta para redactar. Todo opcional: un estudio recién creado aún
 *  no tiene los datos fiscales y el texto debe seguir siendo válido. */
export interface DatosEstudioLegal {
  nombre?: string | null;
  razonSocial?: string | null;
  nif?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  codigoPostal?: string | null;
  email?: string | null;
  cancelacionVentanaHoras?: number | null;
}

const vacio = (s?: string | null) => !s || s.trim() === '';

/**
 * Identifica al responsable del tratamiento. Usa la razón social si existe (es
 * la que factura) y cae al nombre comercial. Si no hay NINGÚN dato fiscal
 * devuelve null: entonces el texto lo dice abiertamente en vez de fingir.
 */
export function identificacionResponsable(e: DatosEstudioLegal): string | null {
  const titular = !vacio(e.razonSocial) ? e.razonSocial!.trim() : (!vacio(e.nombre) ? e.nombre!.trim() : '');
  if (!titular) return null;

  const lineas = [titular];
  if (!vacio(e.nif)) lineas.push(`NIF/CIF: ${e.nif!.trim()}`);

  const domicilio = [
    !vacio(e.direccion) ? e.direccion!.trim() : '',
    [!vacio(e.codigoPostal) ? e.codigoPostal!.trim() : '', !vacio(e.ciudad) ? e.ciudad!.trim() : ''].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
  if (domicilio) lineas.push(`Domicilio: ${domicilio}`);
  if (!vacio(e.email)) lineas.push(`Contacto: ${e.email!.trim()}`);

  return lineas.join('\n');
}

/** Aviso honesto cuando faltan los datos: mejor decirlo que dar por bueno un
 *  documento que no identifica a nadie. Se ve en el propio texto que firma la
 *  clienta, así que la propietaria lo descubre la primera vez que da un alta. */
const SIN_DATOS_FISCALES =
  '⚠️ El estudio todavía no ha completado sus datos fiscales (razón social, NIF y domicilio).\n' +
  'Complétalos en Configuración → Estudio: sin ellos este documento no identifica al responsable\n' +
  'del tratamiento y no cumple el artículo 13 del RGPD.';

export function politicaPrivacidadPorDefecto(e: DatosEstudioLegal = {}): string {
  const responsable = identificacionResponsable(e);
  const nombreEstudio = !vacio(e.nombre) ? e.nombre!.trim() : 'el Estudio';
  const paraEjercer = !vacio(e.email)
    ? `enviando un escrito a ${e.email!.trim()}`
    : 'enviando un escrito a la dirección del estudio';

  return `POLÍTICA DE PRIVACIDAD

En cumplimiento del Reglamento (UE) 2016/679 del Parlamento Europeo (RGPD), le informamos que sus datos personales serán incorporados a nuestros ficheros con la finalidad de gestionar su inscripción y la prestación de los servicios contratados.

RESPONSABLE DEL TRATAMIENTO
${responsable ?? SIN_DATOS_FISCALES}

FINALIDAD Y LEGITIMACIÓN
Sus datos serán tratados para la gestión de membresías, facturación y comunicaciones relacionadas con los servicios contratados por usted en ${nombreEstudio}. La base legal es la ejecución del contrato y el cumplimiento de obligaciones legales.

CONSERVACIÓN
Sus datos se conservarán durante la vigencia de la relación contractual y, una vez finalizada, durante los plazos legalmente establecidos.

DERECHOS
Puede ejercer sus derechos de acceso, rectificación, supresión, limitación, portabilidad y oposición ${paraEjercer}. También puede reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).`;
}

export function terminosServicioPorDefecto(e: DatosEstudioLegal = {}): string {
  const responsable = identificacionResponsable(e);
  const nombreEstudio = !vacio(e.nombre) ? e.nombre!.trim() : 'el Estudio';
  // La ventana real configurada en el estudio, no un 12 clavado en el texto.
  const horas = typeof e.cancelacionVentanaHoras === 'number' && e.cancelacionVentanaHoras > 0
    ? e.cancelacionVentanaHoras
    : 12;

  return `TÉRMINOS Y CONDICIONES DE SERVICIO

PRESTADOR DEL SERVICIO
${responsable ?? SIN_DATOS_FISCALES}

1. OBJETO
El presente contrato regula las condiciones de acceso y uso de los servicios ofrecidos por ${nombreEstudio} (en adelante, "el Estudio").

2. PLANES Y TARIFAS
El socio abona la tarifa correspondiente al plan seleccionado. Los precios incluyen IVA. El Estudio se reserva el derecho de modificar tarifas con un preaviso mínimo de 30 días.

3. RESERVAS Y CANCELACIONES
Las reservas deben realizarse con antelación a través de los canales habilitados. Las cancelaciones efectuadas con menos de ${horas} ${horas === 1 ? 'hora' : 'horas'} de antelación serán descontadas del bono.

4. RESPONSABILIDAD
El socio declara estar en condiciones físicas adecuadas para la práctica de la actividad. El Estudio no se responsabiliza de lesiones derivadas del incumplimiento de las indicaciones del instructor.

5. VIGENCIA
El contrato estará vigente mientras se mantenga la suscripción activa. Cualquiera de las partes podrá resolver el contrato con un preaviso de 15 días.

6. ACEPTACIÓN
La firma de este documento supone la aceptación íntegra de las presentes condiciones.`;
}

/** ¿Se puede firmar un documento que identifique al responsable? Se usa para
 *  avisar a la propietaria ANTES de que su primera clienta firme algo inservible. */
export function faltanDatosFiscales(e: DatosEstudioLegal): boolean {
  return identificacionResponsable(e) === null;
}
