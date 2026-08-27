// ─── Core types ──────────────────────────────────────────────────────────────

import type { EspecialidadNetwork } from '@/lib/network/catalogo.ts';

export type Rol = 'PROPIETARIO' | 'INSTRUCTOR' | 'RECEPCION' | 'MANAGER';
export type EstadoSuscripcion = 'ACTIVA' | 'PAUSADA' | 'CANCELADA' | 'EXPIRADA';
export type TipoPlan = 'MENSUAL' | 'BONO' | 'PUNTUAL';
// FALLIDO (0041): estado terminal tras agotar los reintentos de dunning (+1/+3/+7).
export type EstadoRecibo = 'PENDIENTE' | 'COBRADO' | 'DEVUELTO' | 'EN_CURSO' | 'FALLIDO';
// Pagos España (0036): método recurrente preferido de la socia y método real de cada cobro.
export type MetodoPagoPreferido = 'TARJETA' | 'SEPA';
export type MetodoCobro = 'TARJETA' | 'SEPA' | 'BIZUM' | 'EFECTIVO' | 'TRANSFERENCIA';
// PENDIENTE_APROBACION (Fase 2a, migr 20260730192445): no ocupa aforo ni
// consume bono, mismo criterio que LISTA_ESPERA — se decide al aprobar.
export type EstadoReserva = 'CONFIRMADA' | 'LISTA_ESPERA' | 'ASISTIDA' | 'CANCELADA' | 'NO_ASISTIO' | 'PENDIENTE_APROBACION';
export type NivelClase = 'TODOS' | 'PRINCIPIANTE' | 'MEDIO' | 'AVANZADO';
export type TipoSpot = 'REFORMER' | 'MAT' | 'OTRO';

export interface Studio {
  id: string;
  nombre: string;
  nif: string;
  razonSocial: string;
  direccion: string;
  ciudad: string;
  codigoPostal: string;
  /**
   * Web propia del estudio (migr 20260821101500). Canal de contacto, hermano de
   * `email`/`telefono`/`direccion` — las REDES sociales no viven aquí, viven en
   * el tema (`redesSociales`). Los dos lados se reúnen en
   * `canalesDelEstudio()` (lib/canales-estudio.ts). Null = no la ha puesto.
   */
  sitioWeb: string | null;
  /** Presentación del estudio en su página pública (migr 0134). Null = no se pinta. */
  descripcion: string | null;
  /** Año en que abrió. NO es `creadoEn`, que es el alta en Tentare (migr 0134). */
  anioFundacion: number | null;
  /**
   * Normas del centro que ve la socia en el portal (migr 20260813004723). Una
   * línea por norma. `null` = sin escribir, y entonces la pantalla no pinta la
   * sección en vez de un bloque vacío.
   *
   * ⚠️ El HORARIO no vive aquí: es `studio_horario` / `horarioSemana`, con
   * apertura y cierre por día. Dos fuentes del mismo dato es como se acaba con
   * el panel diciendo una cosa y el portal otra.
   */
  normasTexto: string | null;
  email: string;
  telefono: string;
  colorPrimario: string;
  temaPortal: string;
  /**
   * TEMPORAL (migr 20260807120000). `true` = las socias de este estudio ven el
   * portal en React (`components/portal-tema`), el kit de diseño, en vez del
   * portal actual.
   *
   * ⚠️ Tiene fecha de caducidad por decisión explícita: piloto en un estudio,
   * y si pasa una semana sin incidencias se enciende en el resto y se retira
   * el portal viejo EN EL MISMO PR que borra esta bandera. Un flag sin fecha
   * se queda para siempre y acabamos manteniendo dos portales.
   *
   * Opcional en el tipo porque hay decenas de fixtures que construyen `Studio`
   * a mano y ninguno tiene por qué saber de esto.
   */
  portalReact?: boolean;
  /**
   * Lista blanca de orígenes (https://ejemplo.com, sin ruta) autorizados a
   * incrustar el bundle embebible (Modo B, script+div sin iframe) — ver
   * lib/cors-widget.ts. `[]`/undefined = el bundle no funcionará en ningún
   * dominio todavía (el iframe sigue funcionando igual, no depende de esto).
   */
  widgetDominiosAutorizados?: string[];
  /**
   * Última config del Widget Builder (Configuración → API), por tipo de widget
   * ({ "clases": {...}, "embed-script": {...} }). Solo comodidad del panel para
   * no perderlo al recargar: la config EFECTIVA viaja congelada en el snippet
   * copiado (query params / data-*), nunca se lee de aquí en la página pública.
   * La forma concreta la valida quien lo lee (tab-api.tsx) — es jsonb libre.
   * ⚠️ Dato interno del panel: NUNCA añadirlo a studioPublico().
   */
  widgetBuilder?: Record<string, unknown>;
  logoUrl: string | null;
  // Tipo de IVA general del estudio (%). El precio del recibo es IVA incluido;
  // este tipo solo cambia el desglose base/cuota de la factura, no el total.
  ivaPorDefecto: number;
  // Umbrales de "riesgo de concentración por instructor" (% de facturación) y
  // ventana de análisis en días. Configurables por el estudio.
  depUmbralAlto: number;
  depUmbralMedio: number;
  depVentanaDias: number;
  plan: 'BASE' | 'ESTUDIO' | 'CADENA';
  // Feature #9 (ficha Lorari-vs-Tentare): FREELANCE = instructora sin equipo
  // detrás, único miembro y PROPIETARIO de su propia cuenta. Para apagar
  // features sin sentido con un solo miembro (p.ej. concentración por
  // instructor) — nunca para gatear RLS, que sigue siendo por studio_id/rol.
  tipoCuenta: 'ESTUDIO' | 'FREELANCE';
  avatarAdmin: string | null;
  fotoUrl: string | null;
  // Imagen de bienvenida/portada del PORTAL — la ven las alumnas al entrar
  // (BienvenidaPortal, PortadaAcceso, hero de inicio...). Deliberadamente
  // separada de `fotoUrl` (foto de perfil de la propietaria, solo panel):
  // compartir un campo hacía que subir una selfie para el sidebar la
  // enseñara de golpe a toda socia del estudio.
  imagenBienvenidaUrl: string | null;
  ownerAuthUserId: string | null;
  slug: string | null;
  // Opt-in al directorio público de Tentare Network (migr
  // 20260824230506). false (default) = el estudio solo lo encuentra quien
  // ya tiene su enlace directo (/reservar/[slug]); true = también aparece
  // en /network/estudios, donde puede encontrarlo alguien que no lo conocía
  // todavía. Sin RLS propia: hereda las políticas ya existentes de studios.
  visibleEnNetwork: boolean;
  creadoEn: string;
  stripeAccountId: string | null;
  googleCalendarEmail: string | null;
  gmailEmail: string | null;
  zoomEmail: string | null;
  klaviyoAccountName: string | null;
  gestoriaEmail: string | null;
  // 'trimestral' = el cron manda el Cierre del trimestre a gestoriaEmail el
  // día 1 del mes siguiente, sin que nadie pulse el botón manual.
  gestoriaEnvioAutomatico: 'desactivado' | 'trimestral';
  // Sede de una cadena multi-centro (plan CADENA). null = estudio independiente.
  cadenaId: string | null;
  // Suscripción de la plataforma (Stripe Billing — el SaaS cobra al estudio).
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  /** Fin de la prueba gratuita LOCAL de 7 días (sin tarjeta). null = sin prueba
   *  local. Lo fija un trigger de la BD al crear el estudio, nunca el cliente. */
  trialEndsAt: string | null;
  // Política de reservas y cancelaciones (auditoría C-2/C-4).
  cancelacionVentanaHoras: number;
  cancelacionDevolverBonoTardia: boolean;
  /** Cuando el ESTUDIO cancela una clase completa (no una reserva suelta):
   *  true = devuelve la sesión a cada socia con plaza confirmada. */
  cancelacionClaseDevuelveBono: boolean;
  reservaExigirPlan: boolean;
  /** Compra desde el enlace público sin ficha previa (migr 0110).
   *  EXIGIR_REGISTRO = se registra antes de pagar. CREAR_FICHA = se cobra y
   *  la ficha se crea con el email verificado por Stripe. */
  compraPublicaModo: 'EXIGIR_REGISTRO' | 'CREAR_FICHA';
  reservaMaxSimultaneas: number | null;
  // Fase 1 de reglas por tipo de clase (migr 20260730152516): estos son los
  // DEFAULTS de estudio; tipos_clase puede sobrescribirlos con NULL = hereda,
  // mismo patrón que cancelacionVentanaHoras/TipoClase.ventanaCancelacionHoras.
  reservaVentanaMinimaMinutos: number;
  reservaAntelacionMaximaDias: number | null;
  permiteListaEspera: boolean;
  // Rediseño del Calendario: eje de horas de la rejilla (antes hardcodeado
  // 08:00–22:00). 'HH:MM:SS' tal cual lo da Postgres para columnas `time`.
  horaApertura: string;
  horaCierre: string;
  // Fase 2a (migr 20260730192445): default de estudio, tipos_clase puede
  // sobrescribirlo con NULL = hereda (mismo patrón que el resto de arriba).
  requiereAprobacion: boolean;
  // Fase 2b (migr 20260731130000): minutos para aceptar una plaza liberada
  // de lista de espera antes de que se ofrezca a la siguiente. 0 =
  // confirmación instantánea (comportamiento clásico). tipos_clase puede
  // sobrescribirlo con NULL = hereda, mismo patrón que el resto de arriba —
  // pero OJO, este override se resuelve en SQL directo dentro de
  // cancelar_reserva_plaza, no con heredaOverride() en TS (ver comentario en
  // esa migración: la RPC es ejecutable directo por `authenticated` desde el
  // cliente, sin pasar por cargarPoliticaEstudio).
  listaEsperaPlazoAceptacionMinutos: number;
  // Fase 2c (migr 20260731140000): nº mínimo de reservas CONFIRMADA para que
  // la clase se mantenga. Si a 2h del inicio no se alcanza, se cancela
  // automáticamente y se devuelve el bono. 0 = sin mínimo. tipos_clase puede
  // sobrescribirlo con NULL = hereda — resuelto con heredaOverride() en TS
  // (el chequeo solo ocurre server-side dentro del cron, nunca en una RPC
  // invocable por `authenticated`).
  minimoAsistentesPorClase: number;
  // Fase 3 (migr 20260730225253): importe fijo en € a cobrar por cancelación
  // tardía o no-show. NULL/0 = regla desactivada. tipos_clase puede
  // sobrescribirlo con NULL = hereda — resuelto en SQL directo dentro de
  // `cancelar_reserva_plaza` (esa RPC es ejecutable directo por
  // `authenticated` desde el cliente, mismo criterio que Fase 2b).
  penalizacionImporteEur: number | null;
  penalizacionAplicaCancelacionTardia: boolean;
  penalizacionAplicaNoShow: boolean;
  // false (default) = cada cargo espera aprobación manual antes de tocar la
  // tarjeta guardada. true = se cobra solo, como el cron de dunning.
  penalizacionCobroAutomatico: boolean;
  // true (default) = comportamiento de siempre: la socia enseña su pase
  // (QR o código corto) y alguien del estudio lo escanea/teclea antes de que
  // la reserva cuente como asistida. false = el estudio confía en que quien
  // reserva viene: la reserva se marca ASISTIDA sola al terminar la clase
  // (cron `checkin-automatico`), sin pedir ningún gesto de check-in. El
  // bono/cobro no depende de esto — ya se descontó al reservar
  // (`consumirBonoServidor`) — así que desactivarlo es seguro para el dinero.
  // Sin override por tipo de clase a propósito: es un tema operativo de
  // "¿hay alguien en la puerta dispuesto a escanear?", no algo que varíe
  // clase a clase.
  requiereCheckinQr: boolean;
  // Devoluciones desde el panel (migr 20260811091725). Apagadas por defecto: un
  // botón que mueve dinero real no aparece solo, lo enciende la propietaria —
  // mismo criterio que `penalizacionImporteEur`. Sin override por tipo de clase
  // a propósito: se devuelve un RECIBO (un bono, un mensual, una cita), no una
  // clase, así que no hay nada de lo que heredar.
  // La regla vive en `lib/billing/politica-reembolso.ts`, compartida por el
  // servidor (que decide) y la pantalla (que enseña el botón).
  reembolsosActivos: boolean;
  /** Días desde el cobro en los que se admite devolver. 0 = sin límite. */
  reembolsoPlazoDias: number;
  /** No devolver un bono con sesiones ya gastadas. */
  reembolsoSoloSinUsar: boolean;
  // Stripe Terminal (datáfono físico) emparejado con el estudio.
  stripeTerminalReaderId: string | null;
  stripeTerminalLocationId: string | null;
  // Checklist de "Primeros pasos": cuándo se descartó (null = sigue siendo
  // relevante). Vive en el estudio, no en localStorage, para que lo vea igual
  // toda persona que trabaje ahí, en cualquier dispositivo.
  onboardingDescartadoEn: string | null;
  // F2 (B2.10) cuaderno 19.14: datos de acreedor SEPA para la remesa al banco.
  sepaAcreedorId: string | null;   // identificador de acreedor SEPA
  sepaIban: string | null;          // IBAN de la cuenta acreedora del estudio
  sepaTitular: string | null;       // titular de la cuenta acreedora
  // Pantalla de bienvenida a pantalla completa tras crear el estudio (intro +
  // wizard + resumen), mostrada UNA sola vez. NULL = estudio nuevo, aún no la
  // ha visto. Mismo patrón que onboardingDescartadoEn.
  bienvenidaVistaEn: string | null;
  onbCentros: string | null;
  onbSoftwareAnterior: string | null;
  onbAlumnosActivos: string | null;
  onbImportarDatos: string | null;
  onbPrioridad: string[] | null;
  onbAyudaAlta: string | null;
  // El Contrato del Decision OS (lib/decision/umbral.ts, componente
  // contrato-decision-os.tsx), mostrado UNA sola vez. NULL = aún no lo ha
  // visto. Mismo patrón que bienvenidaVistaEn/onboardingDescartadoEn.
  decisionContratoVistoEn: string | null;
  // Tour guiado interactivo (Fase 2 del rediseño de onboarding), registrado
  // UNA sola vez. NULL = aún no lo ha visto. No bloquea nada — el botón para
  // repetirlo sigue disponible siempre; mismo patrón que decisionContratoVistoEn.
  tourVistoEn: string | null;
  // Horario real por día de la semana (tabla studio_horario, migr
  // 20260804210500). horaApertura/horaCierre de arriba siguen siendo el
  // fallback si un estudio no tuviera ninguna fila aquí. undefined = aún no
  // cargado; [] nunca debería darse (el backfill garantiza 7 filas).
  horarioSemana?: DiaHorario[];
  // Review Boost (feedback interno + reseña honesta + recompensa desacoplada
  // del clic externo). Mismo patrón que bienvenidaVistaEn: flags "vistos una
  // vez" en el estudio, evaluados por el cron lib/inngest/review-boost.ts.
  reviewBoostElegibleEn: string | null;
  reviewBoostMostradoEn: string | null;
  reviewBoostPospuestoEn: string | null;
  reviewBoostVecesMostrado: number;
}

// Horario de un día de la semana (0=domingo..6=sábado, EXTRACT(DOW) — mismo
// criterio que lib/sustituciones/franjas.ts, DISTINTO del `dia` local de
// lib/calendario-columnas.ts donde 0=lunes).
export interface DiaHorario {
  diaSemana: number;
  abierto: boolean;
  horaApertura: string | null; // 'HH:MM:SS', null si abierto=false
  horaCierre: string | null;
}

// F2 (B2.10): mandato SEPA de domiciliación de una socia (independiente de Stripe;
// el sepa_mandate_id de socios es de Stripe). Una socia con mandato VIGENTE entra
// en la remesa del cuaderno 19.14.
export interface MandatoSEPA {
  id: string;
  studioId: string;
  socioId: string;
  iban: string;
  refMandato: string;
  fechaFirma: string;   // YYYY-MM-DD
  estado: 'VIGENTE' | 'CANCELADO';
  creadaEn: string;
}

// ─── Integraciones por negocio ───────────────────────────────────────────────
export type TipoIntegracion =
  | 'STRIPE' | 'RESEND' | 'GOOGLE_CALENDAR' | 'GMAIL' | 'WHATSAPP' | 'EXCEL'
  | 'ZOOM' | 'KISI' | 'MAILCHIMP' | 'KLAVIYO' | 'ZAPIER';

export interface Integracion {
  id: string;
  studioId: string;
  tipo: TipoIntegracion;
  activo: boolean;
  // ⚠️ `config` NO viaja al navegador. Las credenciales (token de WhatsApp,
  // clave de Kisi) solo llegan al abrir el modal de edición, vía
  // GET /api/integrations/config — no en cada carga del panel. Si necesitas
  // leerlas en cliente, pídelas ahí; que no estén en este tipo es a propósito,
  // para que el compilador lo impida en vez de que se cuele otra vez.
  actualizadoEn: string;
  // Salud real del servicio, no del formulario (ver lib/integraciones/salud.ts).
  // `activo` solo dice que el estudio la encendió; estas tres dicen si el
  // servicio de verdad respondió la última vez que se habló con él.
  ultimoOkEn: string | null;
  ultimoError: string | null;
  ultimoErrorEn: string | null;
}

export interface Usuario {
  id: string;
  studioId: string;
  rol: Rol;
  nombre: string;
  email: string;
  telefono: string | null;
  avatarUrl: string | null;
}

export interface AceptacionContrato {
  fecha: string;
  firma: string;
  versionTexto: string;
  /** PORTAL = la firmó la socia. MOSTRADOR = la introdujo el estudio por ella.
   *  undefined = aceptación anterior a la migración 0109: no consta. */
  origen?: 'PORTAL' | 'MOSTRADOR';
  /** Solo en MOSTRADOR: quién del estudio la introdujo. */
  introducidaPor?: string;
}

export interface Socio {
  id: string;
  studioId: string;
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string | null;
  nif: string | null;
  fechaAlta: string;
  activo: boolean;
  leadStage?: LeadStage;
  tags?: string[];
  aceptacionContrato?: AceptacionContrato;
  // Art. 9 RGPD: consentimiento específico para tratar datos de salud (aparte
  // del contrato general). undefined = no lo ha dado — condiciones_salud no
  // debe recibir ninguna fila para esta socia hasta que exista.
  consentimientoSalud?: { fecha: string; registradoPor: string };
  // Art. 7.4 RGPD: consentimiento específico para marketing por email (aparte
  // del contrato general y de `consentimientoSalud`). `texto` es el texto
  // COMPLETO aceptado (lib/legal-textos.ts textoConsentimientoMarketing),
  // igual que AceptacionContrato.versionTexto — se compara contra el texto
  // vigente para saber si sigue siendo válido. undefined = no lo ha dado,
  // ninguna campaña ni automatización de marketing debe alcanzarla.
  consentimientoMarketing?: { fecha: string; texto: string; registradoPor: string };
  avatar?: string | null;
  stripeCustomerId?: string | null;
  stripePaymentMethodId?: string | null;
  // Caducidad de la tarjeta guardada (migr 20260811090114). `null` = todavía no
  // se ha consultado a Stripe — NO significa "no caduca". Ver
  // lib/billing/caducidad-tarjeta.ts.
  tarjetaExpMes?: number | null;
  tarjetaExpAnio?: number | null;
  tarjetaMarca?: string | null;
  tarjetaUltimos4?: string | null;
  // Pagos España (0036): método recurrente preferido + mandato SEPA domiciliado.
  metodoPagoPreferido?: MetodoPagoPreferido;
  sepaMandateId?: string | null;
  sepaPaymentMethodId?: string | null;
  fechaNacimiento?: string | null;
  direccion?: string | null;
  fotoUrl?: string | null;
  referidoPor?: string | null; // id del socio que la invitó (programa de referidos)
  // P1 auditoría Momence-vs-Tentare: valor crudo de `?ref=` del widget
  // público cuando NO coincide con el id de una socia (referidoPor cubre ese
  // caso) — texto libre sin interpretar, mismo criterio que
  // studios.como_nos_conocio.
  origenLead?: string | null;
  // Valores de los campos personalizados del estudio: { [campoId]: valor }.
  camposExtra?: Record<string, string | number | boolean | null>;
}

// ─── Riesgo de concentración por instructor ─────────────────────────────────
export type NivelRiesgoDependencia = 'ALTO' | 'MEDIO' | 'BAJO';

export interface AlumnaCautiva {
  socioId: string;
  nombre: string;
  gasto: number;            // ingresos de esta socia en la ventana
  pctConInstructor: number; // % de sus asistencias con este instructor
}

export interface InstructorDependencySnapshot {
  id: string;
  studioId: string;
  instructorId: string;
  periodoInicio: string;
  periodoFin: string;
  ventanaDias: number;
  alumnasTotal: number;
  alumnasCautivasCount: number;
  ingresosCautivos: number;
  ingresosTotalEstudio: number;
  porcentajeFacturacion: number;
  nivelRiesgo: NivelRiesgoDependencia;
  detalle: AlumnaCautiva[];
  calculadoEn: string;
}

// ─── Plantillas de email transaccional (override por estudio) ────────────────
export type TipoPlantillaEmail = 'bienvenida' | 'reserva' | 'recordatorio' | 'cancelacion' | 'promocion' | 'impago';

// Fuentes seguras en correo. Lista cerrada aquí y con CHECK en la BD (migr
// 20260811005749): una familia que el cliente de correo no tenga se ve como un
// fallback cualquiera, así que no se deja escribir a mano.
export const FUENTES_EMAIL = ['Plus Jakarta Sans', 'Arial', 'Georgia', 'Verdana', 'Times New Roman', 'Courier New'] as const;
export type FuenteEmail = (typeof FUENTES_EMAIL)[number];

export interface PlantillaEmail {
  id: string;
  studioId: string;
  tipo: TipoPlantillaEmail;
  asunto: string | null;
  intro: string | null;
  activa: boolean;
  // Personalización total. `null` en cualquiera = se mantiene lo de siempre,
  // campo a campo. `cuerpo` es Markdown con los tokens {datos} y {boton}.
  cuerpo: string | null;
  botonTexto: string | null;
  colorCabecera: string | null;
  colorBoton: string | null;
  logoUrl: string | null;
  pie: string | null;
  fuente: FuenteEmail | null;
}

// Lo que el panel puede cambiar de una plantilla en un guardado. Todo parcial:
// el formulario manda solo lo que ha tocado, y `null` significa "vacío, vuelve
// al texto por defecto".
export type CambiosPlantillaEmail = Partial<Omit<PlantillaEmail, 'id' | 'studioId' | 'tipo'>>;

// ─── Campos personalizados de socia (definidos por el estudio) ───────────────
export type TipoCampoPersonalizado = 'texto' | 'numero' | 'fecha' | 'booleano' | 'seleccion';

export interface CampoPersonalizado {
  id: string;
  studioId: string;
  etiqueta: string;
  tipo: TipoCampoPersonalizado;
  opciones: string[]; // valores posibles cuando tipo === 'seleccion'
  requerido: boolean;
  orden: number;
  activo: boolean;
}

export interface NotaInterna {
  id: string;
  studioId: string;
  socioId: string;
  texto: string;
  tipo: 'NOTA' | 'SISTEMA';
  creadoEn: string;
}

// ─── Ficha clínica operativa (FICHA-CLINICA.md) ──────────────────────────────

export type CategoriaCondicion = 'LESION' | 'EMBARAZO' | 'POSTPARTO' | 'CRONICA' | 'PROTESIS' | 'OTRO';
export type ZonaCorporal = 'RODILLA' | 'COLUMNA' | 'HOMBRO' | 'CADERA' | 'CUELLO' | 'MUNECA' | 'TOBILLO' | 'GENERAL';
export type SeveridadCondicion = 'LEVE' | 'MEDIA' | 'ALTA';
export type EstadoCondicion = 'ACTIVA' | 'RESUELTA';
export type RespuestaSesion = 'MEJOR' | 'IGUAL' | 'MOLESTIAS' | 'DOLOR';
export type NivelSemaforo = 'VERDE' | 'AMBAR' | 'ROJO';
export type NivelRiesgo = 'BAJO' | 'MEDIO' | 'ALTO';

export interface CondicionSalud {
  id: string;
  studioId: string;
  socioId: string;
  categoria: CategoriaCondicion;
  etiqueta: string;
  zona: ZonaCorporal | null;
  restricciones: string[];        // códigos del catálogo de lib/ficha-clinica.ts
  severidad: SeveridadCondicion;
  estado: EstadoCondicion;
  inicio: string;                 // ISO date (YYYY-MM-DD)
  fin: string | null;             // alta médica / resolución
  revisarEn: string | null;
  notas: string | null;
  creadoPor: string | null;       // instructor_id
  creadoEn: string;
  actualizadoEn: string;
}

// ─── Cuestionario de salud configurable (Fase 1, ficha Lorari-vs-Tentare) ────
// Solo STAFF (PROPIETARIO/INSTRUCTOR) lo rellena en la ficha de la clienta —
// sin canal público ni de portal nuevo. Misma RLS que condiciones_salud
// (rol + tiene_consentimiento_salud en el INSERT de la respuesta).

export type TipoRespuestaCuestionarioSalud = 'texto' | 'booleano' | 'seleccion_unica' | 'seleccion_multiple';

// La DEFINICIÓN de cada pregunta, por estudio. Gestionarla (crear/editar/
// borrar) es solo PROPIETARIO; leerla también INSTRUCTOR, que es quien la
// rellena.
export interface PlantillaCuestionarioSalud {
  id: string;
  studioId: string;
  pregunta: string;
  tipoRespuesta: TipoRespuestaCuestionarioSalud;
  opciones: string[]; // valores posibles cuando tipoRespuesta es seleccion_*
  orden: number;
  activo: boolean;
}

// Las respuestas, por socia — una fila por (socioId, preguntaId).
export interface RespuestaCuestionarioSalud {
  id: string;
  studioId: string;
  socioId: string;
  preguntaId: string;
  respuesta: string | null;
  creadoPor: string | null; // instructor_id, mismo criterio que CondicionSalud.creadoPor
  creadoEn: string;
  actualizadoEn: string;
}

export interface RespuestaSesionRow {
  id: string;
  studioId: string;
  socioId: string;
  sesionId: string | null;
  respuesta: RespuestaSesion;
  nota: string | null;
  creadoPor: string | null;
  creadoEn: string;
}

export interface PlanTarifa {
  id: string;
  studioId: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  tipo: TipoPlan;
  sesiones: number | null;
  // F2 (B2.1): política de bono. La suscripción materializa las fechas al comprar.
  // Opcionales (como Instructor.avatar) para no romper literales sin la política;
  // las filas cargadas de BD siempre las traen vía mapPlanTarifa.
  validezDias?: number | null;   // BONO/PUNTUAL: caduca a los N días de la compra (null = sin caducidad)
  limiteSemanal?: number | null; // máx. sesiones/semana ISO (null = sin tope); se aplica en el canje
  // Tipos de clase que cubre este plan (tabla puente `plan_tipos_clase`, migr
  // 0111). Vacío o ausente = cubre TODAS, que es como se han comportado siempre.
  // Permite el "Bono 10 Reformer" que no sirve para Mat.
  tiposClaseIds?: string[];
  activo: boolean;
  // P2 (auditoría "Veredicto de Marta"): fecha de fin de una oferta temporal
  // sobre `precio` — PURAMENTE informativa, no cambia ningún cálculo de
  // dinero. La propietaria sigue fijando el precio rebajado a mano en
  // `precio`; esto solo pinta un aviso para que se acuerde de subirlo de
  // vuelta al pasar la fecha. null = sin oferta activa.
  ofertaHasta?: string | null;
}

export interface Suscripcion {
  id: string;
  studioId: string;
  socioId: string;
  planId: string;
  estado: EstadoSuscripcion;
  fechaInicio: string;
  fechaFin: string | null;
  sesionesRestantes: number | null;
  stripeSubscriptionId: string | null;
}

// F2 (B2.8): ventana de congelación de una suscripción. La pausa reutiliza
// estado='PAUSADA'; esto guarda la ventana y, al descongelar, los días que se
// empujaron a fecha_fin para que no consuman la validez del bono.
export interface Congelacion {
  id: string;
  studioId: string;
  suscripcionId: string;
  desde: string;               // YYYY-MM-DD
  hasta: string | null;        // null = congelación abierta (aún activa)
  diasAplicados: number | null;
  motivo: string | null;
  creadaEn: string;
}

// F2 (B2.7): máquina como recurso. Avería/mantenimiento de una máquina de una
// sala durante un rango; reduce el aforo efectivo (ver lib/aforo-logic.ts).
export interface BloqueoMaquina {
  id: string;
  studioId: string;
  salaId: string;
  spotId: string | null;       // opcional: reformer concreto (si hay mapa de spots)
  desde: string;               // ISO timestamptz
  hasta: string | null;        // null = avería abierta (sin fecha de arreglo)
  motivo: string | null;
  creadoEn: string;
}

// F2 (B2.2): plaza fija semanal. Anclada a un SLOT (día+hora local+sala); la
// materialización (pg_cron) crea reservas normales para las sesiones que encajan.
export interface PlazaFija {
  id: string;
  studioId: string;
  socioId: string;
  diaSemana: number;           // 0=domingo … 6=sábado (= extract(dow))
  horaInicio: string;          // 'HH:MM[:SS]' hora local
  salaId: string;
  tipoClaseId: string | null;  // opcional: acota a un tipo de clase
  spotId: string | null;       // "tu reformer" (opcional)
  vigenciaDesde: string;       // YYYY-MM-DD
  vigenciaHasta: string | null;// null = indefinida
  estado: 'ACTIVA' | 'PAUSADA' | 'BAJA';
  creadaEn: string;
}

// F2 (B2.3): recuperación caducable. Crédito de "clase a recuperar" que la dueña
// concede; viva si estado='DISPONIBLE' y caducaEl >= hoy.
export interface Recuperacion {
  id: string;
  studioId: string;
  socioId: string;
  origenReservaId: string | null;   // reserva de plaza fija que la generó (null = concesión manual)
  motivo: string | null;
  caducaEl: string;                 // YYYY-MM-DD
  estado: 'DISPONIBLE' | 'USADA' | 'CADUCADA' | 'ANULADA';
  usadaEnReservaId: string | null;
  creadaEn: string;
}

// F2 (B2.9): excepción por socia ("porque lo digo yo"). Una fila = una socia exenta
// de una automatización concreta (tipo). La leen todas las automatizaciones.
export interface SocioExcepcion {
  id: string;
  studioId: string;
  socioId: string;
  tipo: string;
  motivo: string | null;
  creadaEn: string;
}

export interface Sala {
  id: string;
  studioId: string;
  nombre: string;
  capacidad: number;
  color: string;
}

export interface Spot {
  id: string;
  salaId: string;
  studioId: string;
  numero: number;
  nombre: string;
  fila: number;
  columna: number;
  tipo: TipoSpot;
  activo: boolean;
}

// Plantilla de catálogo a nivel de cadena (primera pieza de configuración
// centralizada, ver .claude/tentare-os.md). Se COPIA a `tipos_clase` de una
// sede al crearla o al pulsar "Aplicar catálogo" — nunca es un vínculo vivo,
// y deliberadamente no lleva ninguna columna de política de reserva/
// cancelación/penalización: esas siguen siendo 100% decisión de cada sede.
export interface CadenaTipoClase {
  id: string;
  cadenaId: string;
  nombre: string;
  color: string;
  duracionMinutos: number;
  descripcion: string | null;
  nivel: NivelClase;
  fotoUrl: string | null;
  creadoEn: string;
  actualizadoEn: string;
}

export interface TipoClase {
  id: string;
  studioId: string;
  nombre: string;
  color: string;
  duracionMinutos: number;
  descripcion: string | null;
  nivel: NivelClase;
  fotoUrl: string | null;
  // Objetivos de la lista FIJA (lib/reservar/objetivos.ts) que cubre este tipo
  // de clase, para el asistente de la página pública.
  //
  // ⚠️ OPCIONAL a propósito: «ausente» y «vacío» significan lo mismo —sin
  // declarar— y `claseSirvePara` los trata igual: valen para TODOS. Siendo
  // opcional tampoco obliga a rellenarlo a `CadenaTipoClase`, que es otra
  // entidad (el menú de cadena) y no participa del asistente.
  objetivos?: string[];
  // Horas de antelación para cancelar sin perder la sesión, propias de este
  // tipo de clase. null = hereda la del estudio (Studio.cancelacionVentanaHoras).
  ventanaCancelacionHoras: number | null;
  // Fase 1 de reglas por tipo de clase (migr 20260730152516): mismo patrón de
  // override que ventanaCancelacionHoras — null = hereda el default del
  // estudio (Studio.reservaExigirPlan/reservaVentanaMinimaMinutos/
  // reservaAntelacionMaximaDias/permiteListaEspera).
  reservaExigirPlan: boolean | null;
  reservaVentanaMinimaMinutos: number | null;
  reservaAntelacionMaximaDias: number | null;
  permiteListaEspera: boolean | null;
  // Fase 2a (migr 20260730192445): mismo patrón de override.
  requiereAprobacion: boolean | null;
  // Fase 2b (migr 20260731130000): mismo patrón de override. Resuelto en SQL
  // directo, no con heredaOverride() — ver comentario en Studio.
  listaEsperaPlazoAceptacionMinutos: number | null;
  // Fase 2c (migr 20260731140000): mismo patrón de override, resuelto en TS
  // con heredaOverride().
  minimoAsistentesPorClase: number | null;
  // Fase 3 (migr 20260730225253): mismo patrón de override, resuelto en SQL
  // directo dentro de cancelar_reserva_plaza (ver comentario en Studio).
  penalizacionImporteEur: number | null;
  // Fase 11 de Network↔Sustituciones (migr 20260818010000): traduce este tipo
  // de clase al catálogo fijo de Tentare Network (lib/network/catalogo.ts).
  // null = sin mapear, no genera sugerencias de sustitutas de Network para
  // este tipo de clase — nunca un matching aproximado por texto.
  especialidadNetwork: EspecialidadNetwork | null;
  // Clase online con Zoom (migr 20260820150000): por TIPO de clase, no por
  // sesión suelta — una propietaria crea "Pilates Online" y todas sus
  // sesiones son online, mismo patrón operativo que el resto de reglas de
  // tipo de clase. Sin override en Sesion: híbridas puntuales quedan fuera
  // de esta primera entrega a propósito.
  esOnline: boolean;
}

export interface FavoritoClase {
  id: string;
  studioId: string;
  socioId: string;
  tipoClaseId: string;
  creadoEn: string;
}

// Participación de una socia en un reto del carrusel de Inicio (tema Bloom,
// lib/retos-portal.ts) — el reto en sí es contenido fijo de código, solo la
// participación necesita persistencia real.
export interface RetoParticipacion {
  id: string;
  studioId: string;
  socioId: string;
  retoKey: string;
  creadoEn: string;
}

// Valores cerrados a propósito: evita que aparezcan variantes libres tipo
// "inicio"/"Home"/"homepage" en la BD. Solo 'home' se usa por ahora — el resto
// deja el editor preparado para reutilizarse en otras pantallas sin migrar.
export type UbicacionBannerPortal = 'home' | 'clases' | 'perfil' | 'reservas' | 'checkin' | 'bonos' | 'progreso' | 'eventos';

export interface ContenidoPortal {
  studioId: string;
  mensajeDestacado: string | null;
}

export interface BannerPortal {
  id: string;
  studioId: string;
  imagenUrl: string;
  titulo: string | null;
  texto: string | null;
  linkTipo: 'interno' | 'externo';
  linkValor: string;
  ubicacion: UbicacionBannerPortal[];
  activo: boolean;
  orden: number;
  fechaInicio: string | null;
  fechaFin: string | null;
}

/**
 * Un aviso del "Tablón" del portal — texto libre que PROPIETARIO/MANAGER
 * escriben para las alumnas (horario de verano, un taller, cierre puntual).
 * A diferencia de `BannerPortal`, no exige imagen ni enlace: es contenido de
 * texto, no promocional (`supabase/migrations/*_novedades_estudio.sql`).
 */
export interface NovedadEstudio {
  id: string;
  studioId: string;
  titulo: string;
  texto: string | null;
  emoji: string | null;
  activo: boolean;
  fechaInicio: string | null;
  fechaFin: string | null;
}

export interface Instructor {
  id: string;
  studioId: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  color: string;
  activo: boolean;
  avatar?: string | null;
  fotoUrl?: string | null;
  rol: Rol;
  authUserId: string | null;
  // Bio pública (P1 auditoría Momence-vs-Tentare) — null = sin bio, no se
  // muestra nada. Pasa a mapInstructorPublico() sin filtrar: es un dato
  // pensado para mostrarse a visitantes anónimos.
  bio?: string | null;
  /**
   * Su nota, agregada de `valoraciones`. Ausente = nadie la ha valorado.
   *
   * ⚠️ Va la MEDIA y el TOTAL, nunca la media sola: quien la pinte necesita el
   * total para decidir si se puede enseñar. Con dos valoraciones un «5,0» dice
   * que es perfecta cuando lo que pasa es que la han puntuado dos veces. Ver
   * `lib/portal-tema/valoracion.ts`.
   */
  valoracion?: { media: number; total: number };
}

// P1 auditoría Momence-vs-Tentare: una sustitución YA confirmada para una
// sesión concreta, expuesta al widget público. Solo lo mínimo para resolver
// "quién daba originalmente esta clase" — nunca motivo/origen/candidatas.
export interface SustitucionConfirmadaPublica {
  sesionId: string;
  instructorOriginalId: string;
}

export interface Sesion {
  id: string;
  studioId: string;
  tipoClaseId: string;
  salaId: string;
  instructorId: string;
  inicio: string;
  fin: string;
  aforoMaximo: number;
  cancelada: boolean;
  notas: string | null;
  precioPuntual: number | null;
  googleEventId?: string | null;
  // Serie de clases recurrentes (I-3): sesiones creadas juntas comparten id de
  // serie, para editar/cancelar "esta y las siguientes". null = clase suelta.
  serieId?: string | null;
  // Rediseño del Calendario: texto libre, sin categorías ni histórico propio.
  // null/undefined = sin incidencia abierta. "Resolver" la pone a null.
  // Opcional (no obligatorio en cada fixture/factory de Sesion del repo, que
  // son muchos): quien lo necesite lee `sesion.incidenciaTexto ?? null`.
  incidenciaTexto?: string | null;
  // Reunión de Zoom (migr 20260820150000), rellenada por el cron
  // lib/zoom-sync.ts cuando tipos_clase.esOnline=true. Mismo patrón opcional
  // que googleEventId: null/undefined = todavía sin crear (o no aplica).
  zoomMeetingId?: number | null;
  zoomJoinUrl?: string | null;
}

export interface Reserva {
  id: string;
  studioId: string;
  sesionId: string;
  socioId: string;
  estado: EstadoReserva;
  spotId: string | null;
  posicionEspera: number | null;
  // Fase 2b (migr 20260731130000): si no es null y estado='LISTA_ESPERA', hay
  // una oferta de plaza viva hasta esta hora — debe aceptarla o pierde el
  // sitio (cron lib/lista-espera/expirar-ofertas.ts).
  ofertaExpiraEn: string | null;
  checkInEn: string | null;
  creadoEn: string;
}

export interface Recibo {
  id: string;
  studioId: string;
  socioId: string | null; // null = venta de mostrador sin socia (factura simplificada)
  suscripcionId: string | null;
  concepto: string;
  importe: number;
  estado: EstadoRecibo;
  fechaVencimiento: string;
  fechaCobro: string | null;
  fechaDevolucion: string | null;
  intentosReintento: number;
  // Pagos España (0036): método real del cobro + estado asíncrono del adeudo SEPA.
  metodoCobro?: MetodoCobro | null;
  sepaEstado?: string | null;
  // Dunning (0041): cuándo el barrido diario debe reintentar el cobro (null = sin reintento).
  proximoReintento?: string | null;
  // Qué entregó este cobro, guardado al entregarlo. Sirve para poder OFRECER
  // deshacerlo si se devuelve el dinero: `suscripciones` no guarda histórico, así
  // que sin esto se pierde. `entregaAplicada` distingue tres cosas que no se
  // infieren entre sí — true (cambió algo), false (se evaluó y no cambió nada),
  // undefined/null (no se sabe: cobro anterior a esta instrumentación).
  entregaTipo?: 'BONO' | 'MENSUAL' | 'ALTA_WEB' | 'NINGUNA' | null;
  entregaAplicada?: boolean | null;
  entregaAplicadaEn?: string | null;
  entregaSesionesAntes?: number | null;
  entregaSesionesDespues?: number | null;
  entregaFechaFinAntes?: string | null;
  entregaFechaFinDespues?: string | null;
  entregaEstadoAntes?: string | null;
  /** Acumulado devuelto, en euros. Incluye reembolsos parciales. */
  importeDevuelto?: number | null;
  // Cuándo Tentare PIDIÓ la devolución a Stripe (migr 20260811100957). Es un
  // hecho distinto de `fechaDevolucion`, que la escribe el webhook cuando
  // Stripe confirma: con esta puesta y `estado` todavía COBRADO, la devolución
  // está en vuelo. Sin esto, entre pulsar y confirmar no se veía nada, y una
  // que se quedara a medias parecía que no había pasado.
  reembolsoSolicitadoEn?: string | null;
  /** Id del refund de Stripe (`re_…`), para seguir una que se atasque. */
  reembolsoStripeId?: string | null;
  /** D-8: cuándo FALLÓ la devolución (la clienta NO recibió el dinero). */
  reembolsoFallidoEn?: string | null;
  reembolsoFalloMotivo?: string | null;
}

// Fase 3: penalización por cancelación tardía/no-show — detección + ciclo de
// cobro. Tabla aparte de `reservas` (no una columna) para tener histórico de
// por qué NO se cobró (sin tarjeta, sin consentimiento, compensada) auditable
// sin leer logs.
export type EstadoPenalizacion =
  | 'DETECTADA' | 'OMITIDA_SIN_TARJETA' | 'OMITIDA_SIN_CONSENTIMIENTO'
  | 'OMITIDA_COMPENSADA' | 'OMITIDA_REVERTIDA'
  | 'PENDIENTE_APROBACION' | 'RECIBO_CREADO' | 'COBRADA' | 'FALLIDA';

export interface Penalizacion {
  id: string;
  studioId: string;
  socioId: string;
  reservaId: string;
  tipo: 'CANCELACION_TARDIA' | 'NO_SHOW';
  importe: number;
  estado: EstadoPenalizacion;
  reciboId: string | null;
  detectadaEn: string;
  procesadaEn: string | null;
}

export interface Factura {
  id: string;
  studioId: string;
  reciboId: string;
  numeroCompleto: string;
  fechaEmision: string;
  receptorNombre: string;
  receptorNIF: string | null;
  baseImponible: number;
  tipoIVA: number;
  cuotaIVA: number;
  total: number;
  verifactuHash: string | null;
  verifactuPrevHash: string | null;
  verifactuTs: string | null;
  verifactuSeq: number | null;
  // Rectificativas (issue #769). Opcionales: los construidos a mano en tests/
  // otros mappers (factura-pdf, cierre-engine) no las conocen todavía, y
  // ausentes equivale a "sin rectificativa" en toda la UI que las consulte.
  serie?: string;
  tipo?: string;
  rectificaA?: string | null;
  tipoRectificativa?: 'S' | 'I' | null;
  importeRectificacion?: number | null;
}

// Ingreso cobrado FUERA de Tentare (efectivo, transferencia, otra plataforma…)
// que el estudio añade a mano al cierre de año para completar lo que entrega a
// su gestoría. NO es una factura de Tentare: sin sello Verifactu ni numeración
// correlativa. Se suma a los totales anuales, marcado como manual.
export interface IngresoManual {
  id: string;
  studioId: string;
  fecha: string;            // ISO date (YYYY-MM-DD)
  concepto: string;
  cliente: string | null;
  nif: string | null;
  baseImponible: number;
  tipoIVA: number;
  cuotaIVA: number;
  total: number;            // IVA incluido
  nota: string | null;
  creadoEn: string;
}

// ─── Enriched (joined) types ──────────────────────────────────────────────────

export interface SesionEnriquecida extends Sesion {
  tipoClase: TipoClase;
  sala: Sala;
  instructor: Instructor;
  reservas: Reserva[];
  reservasConfirmadas: number;
  plazasLibres: number;
  spots: Spot[];
}

export interface ReservaEnriquecida extends Reserva {
  socio: Socio;
  spot: Spot | null;
}

// ─── New Feature Types ────────────────────────────────────────────────────────

export type LeadStage = 'LEAD' | 'INTERESADA' | 'PRUEBA' | 'ACTIVA' | 'EN_RIESGO' | 'PERDIDA';

export type EstadoCita = 'PENDIENTE' | 'CONFIRMADA' | 'COMPLETADA' | 'CANCELADA' | 'NO_ASISTIO';
export type TipoCita = 'PRIVADA' | 'EVALUACION' | 'FISIOTERAPIA' | 'ONLINE';

export interface Cita {
  id: string;
  studioId: string;
  socioId: string;
  instructorId: string;
  tipo: TipoCita;
  inicio: string;
  fin: string;
  notas: string | null;
  estado: EstadoCita;
  precio: number | null;
  pagada: boolean;
  creadoEn: string;
  servicioId?: string | null; // servicio de cita reservado (0046), si aplica
}

// Catálogo de servicios de cita 1:1 por estudio (0046). Define duración/precio y
// si la socia puede reservarlo ella misma (auto-reservable) desde la reserva pública.
export interface ServicioCita {
  id: string;
  studioId: string;
  nombre: string;
  tipo: TipoCita;
  duracionMin: number;
  precio: number | null;
  autoReservable: boolean;
  color: string | null;
  descripcion: string | null;
  activo: boolean;
  orden: number;
  creadoEn: string;
}

// Franja de horario fino por instructora (0046). Varias por día de la semana.
// diaSemana usa la convención Postgres DOW: 0=domingo..6=sábado.
export interface DisponibilidadCita {
  id: string;
  studioId: string;
  instructorId: string;
  diaSemana: number;
  horaInicio: string; // 'HH:MM'
  horaFin: string;    // 'HH:MM'
  creadoEn: string;
}

export type CategoriaPOS = 'SESION' | 'PACK' | 'PRODUCTO' | 'OTRO';
export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'BIZUM' | 'TRANSFERENCIA' | 'DATAFONO';

export interface ProductoPOS {
  id: string;
  studioId: string;
  nombre: string;
  categoria: CategoriaPOS;
  precio: number;
  activo: boolean;
}

export interface ItemVentaPOS {
  productoId: string | null;
  nombre: string;
  precio: number;
  cantidad: number;
}

export interface VentaPOS {
  id: string;
  studioId: string;
  socioId: string | null;
  items: ItemVentaPOS[];
  subtotal: number;
  descuento: number;
  total: number;
  metodoPago: MetodoPago;
  notas: string | null;
  realizadaEn: string;
}

export type EstadoCampana = 'BORRADOR' | 'PROGRAMADA' | 'ENVIANDO' | 'ENVIADA' | 'ACTIVA' | 'PAUSADA';
export type TipoCampana = 'EMAIL' | 'WHATSAPP' | 'SMS';
export type DestinatariosCampana =
  | 'TODAS' | 'ACTIVAS' | 'INACTIVAS' | 'SIN_PLAN' | 'BONO' | 'VIP'
  // Paso 6 de docs/marketing-integrations-arquitectura.md §8/§4: señales ya
  // existentes en el repo (Decision OS F3, recibos, cumpleaños), no un
  // segment builder genérico — ver el archivo para el porqué de ese corte.
  | 'BONO_CADUCA_PRONTO' | 'PAGO_FALLIDO' | 'CUMPLE_ESTE_MES';

export interface Campana {
  id: string;
  studioId: string;
  nombre: string;
  tipo: TipoCampana;
  asunto: string;
  contenido: string;
  estado: EstadoCampana;
  destinatarios: DestinatariosCampana;
  enviados: number;
  abiertos: number;
  clics: number;
  creadaEn: string;
  enviadaEn: string | null;
  programadaEn: string | null;
  objetivo?: string | null;
  presupuesto?: number | null;
  // Publicaciones del módulo Contenido asociadas a la campaña (snapshot).
  publicaciones?: PublicacionAsociada[] | null;
}

export interface PublicacionAsociada {
  id: string;
  titulo: string;
  plataformas?: string[];
}

export type TriggerAutomatizacion =
  | 'SUSCRIPCION_EXPIRA_7D'
  | 'SUSCRIPCION_EXPIRA_1D'
  | 'SUSCRIPCION_CANCELADA'
  | 'CUMPLEANOS'
  | 'PRIMERA_CLASE'
  | 'INACTIVIDAD_30D'
  | 'BONO_AGOTADO'
  | 'BONO_QUEDA_1'
  | 'NUEVA_ALTA'
  | 'CITA_RECORDATORIO';

export interface Automatizacion {
  id: string;
  studioId: string;
  nombre: string;
  trigger: TriggerAutomatizacion;
  accion: 'EMAIL' | 'WHATSAPP' | 'NOTIFICACION';
  asunto: string;
  mensaje: string;
  activa: boolean;
  ejecutadas: number;
  creadaEn: string;
  // Constructor visual de flujos (Fase 7): cadena de acciones. Si está vacío,
  // la automatización usa el modo simple (campos accion/asunto/mensaje).
  pasos?: PasoFlujo[] | null;
}

// Acciones disponibles en el constructor visual de flujos. Antes incluía
// TAREA y PUBLICAR_RED, pero el motor (marketing-automation-engine.ts) nunca
// las ejecutó — no hay tabla de tareas ni integración de publicación en
// redes que las respalde. Se quitaron para no prometer algo que no pasa
// nunca de la vista previa. Solo EMAIL/NOTIFICAR_EQUIPO, que el motor sí
// procesa (columna `accion` de Automatizacion, un único canal por flujo).
export type AccionFlujo = 'EMAIL' | 'NOTIFICAR_EQUIPO';

export interface PasoFlujo {
  id: string;
  accion: AccionFlujo;
  // Config específica por acción (claves libres):
  //  EMAIL: { asunto, mensaje }
  //  NOTIFICAR_EQUIPO: { mensaje }
  config: Record<string, string>;
}

// ─── Motor de automatización avanzado ────────────────────────────────────────

// SUSCRIPCION_EXPIRA_DIAS existió declarado pero nunca implementado — se quitó
// porque duplicaba SUSCRIPCION_EXPIRA_7D/1D del motor de marketing
// (TriggerAutomatizacion), que además deja escribir el texto al propio
// estudio en vez de depender de una redacción genérica.
export type TriggerRule =
  | 'AUSENCIA_DIAS'
  | 'PAGO_PENDIENTE_DIAS'
  | 'BONO_SESIONES_BAJAS'
  | 'NUEVA_SOCIA'
  | 'CLASE_MANANA'
  | 'RENOVACION_COBRADA'
  | 'CLASE_LLENA_RECURRENTE';

export type AccionAutomatica =
  | 'ENVIAR_EMAIL'
  | 'ENVIAR_WHATSAPP'
  | 'COBRAR_RECIBO'
  | 'CREAR_NOTA'
  | 'NOTIFICAR_ADMIN'
  | 'OFRECER_CLASE_GRATIS'
  | 'PROPONER_PLAN'
  | 'ENVIAR_EJERCICIOS'
  | 'OFRECER_DESCUENTO';

export interface AutomationStep {
  accion: AccionAutomatica;
  parametros: Record<string, string | number | boolean>;
  esperarHoras?: number;
  condicion?: 'SIN_RESPUESTA' | 'CON_RESPUESTA' | 'SIEMPRE';
}

export interface AutomationRule {
  id: string;
  studioId: string;
  nombre: string;
  descripcion: string;
  icono: string;
  trigger: TriggerRule;
  condicion: Record<string, number | string | boolean>;
  pasos: AutomationStep[];
  activa: boolean;
  ejecutadaVeces: number;
  ultimaEjecucion: string | null;
  creadaEn: string;
}

export type ResultadoLog = 'EJECUTADO' | 'ESPERANDO' | 'FALLIDO' | 'PENDIENTE_ADMIN';

export interface AutomationLog {
  id: string;
  studioId: string;
  // S-2: el log tiene DOS orígenes posibles y va exactamente uno informado
  // (lo garantiza el CHECK de la BD, migración 0053). Antes ambos se metían en
  // `ruleId`, que además tenía FK a automation_rules: los de marketing violaban
  // esa FK y no se persistían nunca, dejando el dedup sin datos.
  ruleId: string | null;          // origen: automation_rules
  automatizacionId: string | null; // origen: automatizaciones (marketing)
  ruleName: string;
  socioId: string | null;
  socioNombre: string | null;
  pasoIndex: number;
  accion: AccionAutomatica;
  resultado: ResultadoLog;
  // Nota INTERNA para la propietaria (nunca contenido enviable a un cliente).
  detalle: string;
  // Texto que recibió (o recibiría, si está pendiente de aprobación) la
  // clienta — null cuando la acción no implica ningún envío a cliente
  // (COBRAR_RECIBO, NOTIFICAR_ADMIN) o cuando aún no se ha podido redactar.
  // Separado de `detalle` a propósito: mezclarlos fue el bug que mandaba la
  // nota interna tal cual a la socia.
  mensajeCliente?: string | null;
  ejecutadoEn: string;
  proximaAccionEn: string | null;
  reciboId?: string | null;
}

export interface NotaProgreso {
  id: string;
  studioId: string;
  socioId: string;
  instructorId: string;
  sesionId: string | null;
  textoLibre: string;
  progreso: string | null;
  alertas: string | null;
  planProximaSesion: string | null;
  ejerciciosCasa: string | null;
  creadaEn: string;
}

export interface CodigoDescuento {
  id: string;
  studioId: string;
  codigo: string;
  descripcion: string;
  tipo: 'PORCENTAJE' | 'IMPORTE_FIJO';
  valor: number;
  usos: number;
  usosMax: number | null;
  expira: string | null;
  activo: boolean;
  creadoEn: string;
  minImporte?: number | null;
  soloNuevas?: boolean;
}

export type TipoActividad =
  | 'NUEVA_SOCIA'
  | 'NUEVA_RESERVA'
  | 'CANCELACION'
  | 'PAGO_COBRADO'
  | 'PAGO_PENDIENTE'
  | 'NUEVA_SUSCRIPCION'
  | 'SUSCRIPCION_PAUSADA'
  | 'CITA_CREADA'
  | 'CITA_COMPLETADA'
  | 'VENTA_POS'
  | 'MENSAJE_ENVIADO'
  | 'SOCIA_EDITADA'
  | 'SOCIA_ELIMINADA'
  | 'PLAN_CREADO'
  | 'PLAN_EDITADO'
  | 'PLAN_ELIMINADO'
  | 'PLAN_ASIGNADO'
  | 'COBRO_MANUAL'
  | 'EQUIPO_ALTA'
  | 'EQUIPO_EDITADO'
  | 'EQUIPO_BAJA'
  | 'AUTOMATIZACION_CAMBIO'
  | 'DECISION_GESTIONADA'
  | 'SESION_REASIGNADA';

export interface ActividadReciente {
  id: string;
  studioId: string;
  tipo: TipoActividad;
  texto: string;
  socioId: string | null;
  enlace: string | null;
  creadoEn: string;
  // Quién hizo la acción — para el registro de auditoría del propietario.
  actorNombre: string | null;
}

// ─── Chat de equipo (canal único compartido del negocio) ─────────────────────

export interface CanalEquipo {
  id: string;
  studioId: string;
  nombre: string;
  creadoEn: string;
}

export interface MensajeEquipo {
  id: string;
  studioId: string;
  canalId: string;
  autorInstructorId: string | null;
  autorNombre: string;
  texto: string;
  creadoEn: string;
}

// Buzón de soporte: dudas/mejoras/bugs que un estudio deja desde el widget
// de ayuda del dashboard, dirigidos al equipo de Tentare (no visibles para
// otros estudios).
export type TipoSoporte = 'DUDA' | 'MEJORA' | 'BUG';

export interface SoporteSolicitud {
  id: string;
  studioId: string;
  tipo: TipoSoporte;
  mensaje: string;
  contacto: string | null;
  creadoEn: string;
}

export type CategoriaVideo = 'REFORMER' | 'MAT' | 'BARRE' | 'CARDIO' | 'MEDITACION' | 'ESTIRAMIENTO';

export interface VideoOnDemand {
  id: string;
  studioId: string;
  titulo: string;
  descripcion: string | null;
  categoria: CategoriaVideo;
  duracionMinutos: number;
  nivel: NivelClase;
  instructorId: string;
  vistas: number;
  likes: number;
  activo: boolean;
  creadoEn: string;
  // UID del asset en Cloudflare Stream. null = fila antigua sin vídeo alojado
  // (se muestra el placeholder); presente = se embebe el reproductor de Stream.
  streamUid: string | null;
}

export interface PostComunidad {
  id: string;
  studioId: string;
  autorId: string | null;
  autorNombre: string;
  autorInicial: string;
  texto: string;
  // P1 Community & Messaging OS: quién ve este post en el feed de la socia
  // (portal), reutilizando el mismo segmento que ya resuelve una campaña de
  // marketing (`resolverDestinatariasCampana`) — sin motor de audiencias
  // paralelo. 'TODAS' si no se especifica (comportamiento previo intacto).
  audiencia: DestinatariosCampana;
  // URL pública de Storage (bucket `comunidad-media`), o null si el post es
  // solo texto.
  imagenUrl: string | null;
  likes: number;
  comentariosCount: number;
  fijado: boolean;
  creadoEn: string;
  // Eventos como entidad propia dentro del Feed (P2 Community & Messaging
  // OS). 'TEXTO' (default) o 'EVENTO'; los campos evento* solo tienen
  // sentido cuando tipo === 'EVENTO'. SUPUESTO sobre el esquema de BD: a
  // confirmar contra la migración real del otro agente.
  tipo: 'TEXTO' | 'EVENTO';
  eventoFecha?: string | null;
  eventoAforo?: number | null;
  eventoLugar?: string | null;
}

export interface ComentarioComunidad {
  id: string;
  studioId: string;
  postId: string;
  autorId: string | null;
  autorNombre: string;
  autorInicial: string | null;
  texto: string;
  creadoEn: string;
}

// ─── Gamificación: créditos y recompensas ─────────────────────────────────────
// El estudio configura CUÁNTO vale cada acción (RewardRule) — el motor
// (lib/engines/reward-engine.ts) nunca usa números fijos, siempre lee la regla.

export type RewardTrigger =
  | 'ASISTENCIA_CLASE'
  | 'RENOVACION_PLAN'
  | 'REFERIDO_AMIGO'
  | 'SEMANA_COMPLETA'
  | 'PRIMERA_RESERVA'
  | 'OBJETIVO_MENSUAL';

// Catálogo (fijo en código: solo la app puede "detectar" estos disparadores;
// lo configurable es cuánto vale cada uno, vía RewardRule) de qué es cada uno.
export interface RewardTriggerDef {
  trigger: RewardTrigger;
  nombre: string;
  descripcion: string;
}

export interface RewardRule {
  id: string;
  studioId: string;
  trigger: RewardTrigger;
  nombre: string;
  descripcion: string | null;
  creditos: number;
  activa: boolean;
  // Máximo de veces al mes que esta regla puede premiar (por socia que invita).
  // null = sin tope. Usado sobre todo por REFERIDO_AMIGO para acotar el fraude.
  topeMensual: number | null;
  creadoEn: string;
}

// Hecho en bruto: "este disparador ocurrió para esta socia" — existe sobre
// todo para poder comprobar idempotencia (refId) y no premiar dos veces la
// misma reserva/recibo si el evento se reintenta.
export interface RewardAction {
  id: string;
  studioId: string;
  socioId: string;
  trigger: RewardTrigger;
  refId: string | null;
  creadoEn: string;
}

// Línea de historial legible para la socia ("Wallet" → Historial).
export interface RewardHistory {
  id: string;
  studioId: string;
  socioId: string;
  ruleId: string;
  actionId: string;
  creditos: number;
  descripcion: string;
  creadoEn: string;
}

export type TipoTransaccion = 'GANANCIA' | 'CANJE';

// Libro mayor completo (ganancias + canjes) — es la fuente de verdad real
// del saldo; MemberCredits es solo una caché para no recalcular sumando.
export interface CreditTransaction {
  id: string;
  studioId: string;
  socioId: string;
  tipo: TipoTransaccion;
  creditos: number; // positivo en GANANCIA, negativo en CANJE
  descripcion: string;
  refId: string | null;
  creadoEn: string;
}

export interface MemberCredits {
  socioId: string;
  studioId: string;
  saldo: number;
  totalGanado: number;
  totalCanjeado: number;
  actualizadoEn: string;
}

export type EstadoRecompensaCanjeable = 'DISPONIBLE' | 'BLOQUEADA' | 'CANJEADA';

export interface RewardCatalogItem {
  id: string;
  studioId: string;
  nombre: string;
  descripcion: string | null;
  costeCreditos: number;
  icono: string;
  activo: boolean;
  stock: number | null; // null = ilimitado
  creadoEn: string;
}

export type EstadoCanje = 'PENDIENTE' | 'ENTREGADO' | 'CANCELADO';

export interface RewardRedemption {
  id: string;
  studioId: string;
  socioId: string;
  catalogItemId: string;
  creditosGastados: number;
  estado: EstadoCanje;
  creadoEn: string;
}

// ─── Gamificación: logros ─────────────────────────────────────────────────────
// Igual que con los créditos: el ESTUDIO decide el umbral de cada logro
// (5 clases, 10 clases...) — el motor nunca hardcodea el número.

export type AchievementMetric =
  | 'CLASES_ASISTIDAS'
  | 'RESERVAS_TOTALES'
  | 'SEMANAS_CONSECUTIVAS'
  | 'ASISTENCIA_MENSUAL_COMPLETA'
  | 'AMIGOS_INVITADOS'
  | 'ASISTENCIA_CUMPLEANOS';

export interface AchievementMetricDef {
  metric: AchievementMetric;
  nombre: string;
  descripcion: string;
  // Métricas "booleanas" (ocurre o no ocurre, ej. asistir el día de tu
  // cumpleaños) no acumulan progreso — se cumplen o no en cada evaluación.
  acumulable: boolean;
}

export interface AchievementDefinition {
  id: string;
  studioId: string;
  metric: AchievementMetric;
  nombre: string;
  descripcion: string | null;
  umbral: number;
  icono: string;
  creditosRecompensa: number;
  activo: boolean;
  creadoEn: string;
}

export interface AchievementProgress {
  id: string;
  studioId: string;
  socioId: string;
  achievementId: string;
  progresoActual: number;
  completado: boolean;
  completadoEn: string | null;
}

export interface AchievementHistory {
  id: string;
  studioId: string;
  socioId: string;
  achievementId: string;
  nombre: string;
  icono: string;
  creadoEn: string;
}

// ─── Gamificación: niveles ─────────────────────────────────────────────────
// Progresión (Bronce → Diamante, o los nombres que quiera el estudio) según
// el total histórico de créditos ganados (MemberCredits.totalGanado, no el
// saldo — así canjear recompensas nunca hace "bajar de nivel" a una socia).

export interface LevelDefinition {
  id: string;
  studioId: string;
  nombre: string;
  orden: number;
  umbralCreditos: number;
  color: string;
  icono: string;
  beneficios: string | null;
  activo: boolean;
  creadoEn: string;
}

// ─── Gamificación: retos ────────────────────────────────────────────────────
// A diferencia de un logro (permanente, sin fecha), un reto vive entre
// fechaInicio y fechaFin — reutiliza el mismo catálogo de métricas que los
// logros (AchievementMetric) pero el progreso solo cuenta lo ocurrido dentro
// de esa ventana de tiempo.

export interface ChallengeDefinition {
  id: string;
  studioId: string;
  nombre: string;
  descripcion: string | null;
  icono: string;
  metric: AchievementMetric;
  objetivo: number;
  fechaInicio: string;
  fechaFin: string;
  creditosRecompensa: number;
  activo: boolean;
  creadoEn: string;
}

export interface ChallengeProgress {
  id: string;
  studioId: string;
  socioId: string;
  challengeId: string;
  progresoActual: number;
  completado: boolean;
  completadoEn: string | null;
}

export interface ChallengeHistory {
  id: string;
  studioId: string;
  socioId: string;
  challengeId: string;
  nombre: string;
  icono: string;
  creadoEn: string;
}

export type EstadoReto = 'ACTIVO' | 'COMPLETADO' | 'CADUCADO';

// ─── Dashboard: gráficos personalizados ────────────────────────────────────
// El estudio arma su propio panel eligiendo qué métrica graficar y cómo — el
// motor (lib/engines/dashboard-chart-engine.ts) solo sabe calcular las métricas del
// catálogo fijo, todo lo demás (nombre, tipo, rango, color) es su elección.

export type TipoGraficoDashboard = 'LINEA' | 'BARRAS';
export type MetricaGraficoDashboard =
  | 'INGRESOS_COBRADOS' | 'NUEVAS_SOCIAS' | 'RESERVAS' | 'CLASES_ASISTIDAS' | 'CREDITOS_OTORGADOS';
export type AgrupacionGraficoDashboard = 'DIA' | 'SEMANA' | 'MES';

export interface DashboardChart {
  id: string;
  studioId: string;
  nombre: string;
  tipo: TipoGraficoDashboard;
  metrica: MetricaGraficoDashboard;
  agrupacion: AgrupacionGraficoDashboard;
  rango: number;
  color: string;
  creadoEn: string;
}

// ─── Copias de seguridad ────────────────────────────────────────────────────
// El contenido real (jsonb con todas las tablas) nunca llega al cliente —
// solo se lee/escribe desde rutas de servidor con la service role key (ver
// lib/engines/backup-engine.ts). El panel solo ve estos metadatos.

export type TipoBackup = 'DIARIO' | 'SEMANAL' | 'MENSUAL' | 'MANUAL';

export interface BackupMeta {
  id: string;
  studioId: string;
  tipo: TipoBackup;
  creadoEn: string;
}
