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
  // Fase 3: importe fijo en € de la penalización por cancelación tardía/no-show.
  // NULL/0 = el estudio no tiene la regla activa, no se añade la cláusula.
  penalizacionImporteEur?: number | null;
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
  // Fase 3: solo aparece si el estudio tiene la regla activa (importe > 0) —
  // un estudio sin ella no debe mostrar (ni pedir aceptar) una cláusula que
  // no le aplica. Condicionar el TEXTO es también lo que hace que el guard de
  // consentimiento (comparar versionTexto contra el actual) se dispare solo
  // para quien de verdad necesita re-aceptar.
  const clausulaPenalizacion = typeof e.penalizacionImporteEur === 'number' && e.penalizacionImporteEur > 0
    ? ` Adicionalmente, las cancelaciones dentro de dicha ventana y las inasistencias sin cancelación previa ("no-show") podrán conllevar un cargo de ${e.penalizacionImporteEur.toFixed(2)} € a la tarjeta u otro método de pago guardado, siempre que exista uno asociado a la cuenta. Este cargo se notificará por correo electrónico en el momento en que se produzca.`
    : '';

  return `TÉRMINOS Y CONDICIONES DE SERVICIO

PRESTADOR DEL SERVICIO
${responsable ?? SIN_DATOS_FISCALES}

1. OBJETO
El presente contrato regula las condiciones de acceso y uso de los servicios ofrecidos por ${nombreEstudio} (en adelante, "el Estudio").

2. PLANES Y TARIFAS
El socio abona la tarifa correspondiente al plan seleccionado. Los precios incluyen IVA. El Estudio se reserva el derecho de modificar tarifas con un preaviso mínimo de 30 días.

3. RESERVAS Y CANCELACIONES
Las reservas deben realizarse con antelación a través de los canales habilitados. Las cancelaciones efectuadas con menos de ${horas} ${horas === 1 ? 'hora' : 'horas'} de antelación serán descontadas del bono.${clausulaPenalizacion}

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

const SEPARADOR_LEGAL = '\n\n─────────────────────────────────────\n\n';

/**
 * Los dos documentos que acepta la clienta, en un solo texto.
 *
 * Sirve para lo que se ENSEÑA y para lo que se GUARDA como evidencia, y por eso
 * vive aquí: el panel y el portal lo componían por su cuenta y habían divergido.
 * El portal llegó a mostrar solo los términos mientras su casilla decía "y la
 * política de privacidad", y guardaba la cadena fija 'v1.1' como versión
 * aceptada — con eso no se puede saber qué aceptó nadie.
 */
export function textoLegalCompleto(c: { politicaPrivacidad: string; terminosServicio: string }): string {
  return [c.politicaPrivacidad, c.terminosServicio].join(SEPARADOR_LEGAL);
}

/**
 * Consentimiento de marketing por email — DELIBERADAMENTE aparte de
 * `textoLegalCompleto` (política de privacidad + términos). El RGPD (art. 7.4
 * y considerando 43) exige que el consentimiento para marketing sea
 * específico y no vaya empaquetado con la aceptación del contrato general —
 * mezclarlo sería inválido aunque la clienta lo marque. Ver
 * docs/marketing-integrations-arquitectura.md §7.
 *
 * Igual que `terminosServicioPorDefecto`, el texto SÍ es la clave de vigencia
 * (`Socio.consentimientoMarketing.texto` se compara contra el texto actual —
 * mismo patrón que `AceptacionContrato.versionTexto`): si este texto cambia,
 * toda socia con un consentimiento anterior deja de contar como consentida
 * hasta que vuelva a decir que sí.
 */
export function textoConsentimientoMarketing(e: DatosEstudioLegal = {}): string {
  const nombreEstudio = !vacio(e.nombre) ? e.nombre!.trim() : 'el Estudio';
  return `Acepto recibir por email novedades, promociones y ofertas de ${nombreEstudio}. Puedo retirar este consentimiento en cualquier momento, sin coste ni justificación, desde el enlace de baja de cualquier email o pidiéndolo directamente al estudio. Esta comunicación es independiente de los avisos necesarios para la prestación del servicio (reservas, pagos, cambios de horario), que seguiré recibiendo aunque retire este consentimiento.`;
}

// ─── Textos legales efectivos de un estudio ─────────────────────────────────
//
// Vivían en `lib/studio-context.tsx`, que es `'use client'`. Se mueven aquí
// para que el SERVIDOR pueda componer el mismo texto que firma la clienta —lo
// necesita el sellado de la aceptación por compra— sin arrastrar React ni
// mantener dos versiones de la misma regla.

export interface StudioConfig {
  politicaPrivacidad: string;
  terminosServicio: string;
}

/**
 * Textos legales efectivos de un estudio: los suyos si los ha reescrito a mano,
 * y si no, los de por defecto REDACTADOS CON SUS DATOS fiscales.
 *
 * Antes el fallback era un texto fijo que decía "el responsable es el estudio de
 * pilates" — sin nombre ni NIF, aunque el estudio los tuviera rellenos. Lo que
 * firmaba la clienta no identificaba a nadie.
 */
/**
 * Traduce la fila de `studios` (snake_case) a `DatosEstudioLegal` (camelCase).
 *
 * Exportada A PROPÓSITO para poder anclarla en un test: como todos los campos
 * de `DatosEstudioLegal` son opcionales, pasar la fila cruda COMPILA y se traga
 * media identidad fiscal en silencio. Lo que hay que probar es la FORMA, no que
 * servidor y portal llamen a la misma función — eso ya se cumplía cuando el
 * sello certificaba un texto que la compradora nunca vio.
 */
export function datosLegalesDeFila(fila: Record<string, unknown>): DatosEstudioLegal {
  const t = (k: string) => (fila[k] as string | null) ?? null;
  const n = (k: string) => (fila[k] === null || fila[k] === undefined ? null : Number(fila[k]));
  return {
    nombre: t('nombre'),
    razonSocial: t('razon_social'),
    nif: t('nif'),
    direccion: t('direccion'),
    ciudad: t('ciudad'),
    codigoPostal: t('codigo_postal'),
    email: t('email'),
    cancelacionVentanaHoras: n('cancelacion_ventana_horas'),
    penalizacionImporteEur: n('penalizacion_importe_eur'),
  };
}

export function configLegalDe(
  studio: DatosEstudioLegal | null | undefined,
  guardados: { politicaPrivacidad?: string | null; terminosServicio?: string | null } | null | undefined,
): StudioConfig {
  const e = studio ?? {};
  // `??` dejaba pasar la cadena vacía: un estudio que borrara el contenido del
  // editor y guardara '' sellaba —y enseñaba— un documento EN BLANCO en vez del
  // de por defecto. Vacío es "no lo he reescrito", no "mis condiciones son
  // ninguna".
  return {
    politicaPrivacidad: vacio(guardados?.politicaPrivacidad) ? politicaPrivacidadPorDefecto(e) : guardados!.politicaPrivacidad!,
    terminosServicio: vacio(guardados?.terminosServicio) ? terminosServicioPorDefecto(e) : guardados!.terminosServicio!,
  };
}

/**
 * Solo como estado inicial, antes de saber de qué estudio hablamos. En cuanto
 * carga, `configLegalDe` lo sustituye por el texto con los datos reales; si
 * alguien llegara a firmar esto, el propio documento avisa de que faltan.
 */
export const defaultStudioConfig: StudioConfig = {
  politicaPrivacidad: politicaPrivacidadPorDefecto(),
  terminosServicio: terminosServicioPorDefecto(),
};
