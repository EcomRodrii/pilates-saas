// Cómo está cada sección de Configuración, dicho con los valores GUARDADOS.
//
// La lista de secciones decía lo que hay DENTRO («Reservar, cancelar, lista de
// espera y faltas») y nunca cómo está. Aquí sale el valor —«Cancelar 12 h ·
// lista de espera al momento»— y lo que hay que revisar, a partir de lo que el
// panel ya tiene cargado al arrancar: no se pide nada nuevo al servidor.
//
// Reglas:
//   · ninguna frase sin un valor detrás. Lo que no se sabe (sin cargar, o en una
//     tabla que el panel no pide al arrancar, como la motivación) NO se resume:
//     la fila vuelve a su descripción. Mejor callar que adivinar;
//   · corto: cabe en una línea del móvil (`MAX_RESUMEN`). La parte que no cabe
//     se salta entera, nunca se corta a medias;
//   · «Revisa esto» lleva solo lo que está roto o sin hacer y se puede calcular,
//     como mucho `MAX_REVISA`. Nunca «todo bien»: sin nada que revisar no hay
//     bloque. Y no es la bandeja de «lo que espera tu visto bueno»
//     (lib/estado-estudio.ts): aquí van ajustes, no decisiones.
//
// Pura: la ejecuta `node --test` directamente.

import type { DiaHorario, Studio, TipoIntegracion } from '../types.ts';
import { avisoVentaOnline } from '../onboarding.ts';
import { cuando, saludIntegracion, type FilaSalud, type SaludIntegracion } from '../integraciones/salud.ts';
import type { ReglasReserva, TarjetaReglasId } from './reglas-reserva.ts';
import { nifEmisorValido, nifValido } from '../nif.ts';
import { PLAN_INFO, type Plan } from '../billing/entitlements.ts';
import type { FaseTrial } from '../billing/trial.ts';
import { SECCIONES, esTarjetaId, seccionDeTarjeta, type HerramientaId, type SeccionId, type TarjetaId } from './secciones.ts';

export const MAX_RESUMEN = 44;
export const MAX_REVISA = 3;

export type TonoAviso = 'problema' | 'pendiente';

export interface AvisoConfiguracion {
  id: string;
  /** Una línea: qué pasa. */
  texto: string;
  /** La pastilla de su fila en el inicio: dos o tres palabras. */
  etiqueta: string;
  tono: TonoAviso;
  seccion: SeccionId;
  /** La tarjeta donde se arregla. */
  ancla: TarjetaId;
}

export interface ResumenSeccion {
  /** El valor de hoy, o `null` si no se sabe. */
  valor: string | null;
  /** Solo si hay algo que revisar en esta sección: el primero de sus avisos. */
  estado: Pick<AvisoConfiguracion, 'tono' | 'etiqueta'> | null;
}

/** Lo que se sabe del estudio. Un campo AUSENTE es «no se sabe», no su valor por defecto. */
export type EstudioResumible = Partial<Pick<Studio,
  | 'nombre' | 'nif' | 'ivaPorDefecto' | 'stripeAccountId' | 'horarioSemana'
  | 'cancelacionVentanaHoras' | 'permiteListaEspera' | 'listaEsperaPlazoAceptacionMinutos'
  | 'reservaExigirPlan' | 'logoUrl' | 'visibleEnNetwork' | 'instructorasCreanClases'
  | 'compraPublicaModo' | 'valoracionInicialActiva' | 'gmailEmail'
  | 'googleCalendarEmail' | 'zoomEmail' | 'klaviyoAccountName'
>>;

export type IntegracionResumible = { tipo: TipoIntegracion } & Partial<FilaSalud>;

export interface DatosConfiguracion {
  studio: EstudioResumible;
  /** `null` = sin cargar todavía. */
  numSalas: number | null;
  numTiposClase: number | null;
  /** Tarifas ACTIVAS, con precio o sin él: lo que mira la reserva pública. */
  numPlanesActivos: number | null;
  integraciones: readonly IntegracionResumible[] | null;
  /**
   * ¿Tentare tiene puesta la conexión con Stripe? Sin ella no hay nada que la
   * propietaria pueda conectar (`NEXT_PUBLIC_STRIPE_CONNECT_CLIENT_ID`, el mismo
   * criterio que la tarjeta de Stripe).
   */
  stripeDisponible: boolean;
  /**
   * ¿El color PUBLICADO de la marca es otro que el de fábrica? Sale del tema
   * (/api/theme), no de `studios.color_primario`, que publicar no toca. Ausente
   * o `null` = no se sabe.
   */
  colorPropio?: boolean | null;
  /** Cómo tiene montado el panel quien mira. Ausente o `null` = no se sabe. */
  panel?: { menuPosition: 'lateral' | 'superior'; oscuro: boolean } | null;
}

/** Lo que dice /api/billing/status, que es lo mismo que pinta la píldora de la prueba. */
export interface EstadoPlanResumible {
  plan?: string | null;
  subscriptionStatus?: string | null;
  /** Derivado EN SERVIDOR. Sin él (un servidor sin desplegar) no se adivina nada. */
  trial?: { fase: FaseTrial; diasRestantes: number } | null;
}

// ─── Piezas ───────────────────────────────────────────────────────────────────

/** Junta partes con « · » mientras quepan. La que no cabe se salta entera. */
export function unir(partes: readonly (string | null | undefined)[], max = MAX_RESUMEN): string | null {
  let texto = '';
  for (const parte of partes) {
    if (!parte) continue;
    const candidato = texto ? `${texto} · ${parte}` : parte;
    if (candidato.length <= max) texto = candidato;
  }
  return texto ? texto[0].toUpperCase() + texto.slice(1) : null;
}

const contar = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const duracion = (min: number) => (min >= 60 && min % 60 === 0 ? `${min / 60} h` : `${min} min`);
const numero = (n: number) => String(n).replace('.', ',');

// `diaSemana` va de 0 = domingo a 6 = sábado; la semana se lee de lunes a domingo.
const LETRA_DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const SEMANA = [1, 2, 3, 4, 5, 6, 0];

/** «08:00:00» → «8»; «08:30:00» → «8:30». */
function hora(h: string | null): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(h ?? '');
  if (!m) return null;
  const hh = String(Number(m[1]));
  return m[2] === '00' ? hh : `${hh}:${m[2]}`;
}

/**
 * «L-V 8-21, S 9-14». Si no cabe en una línea corta, cuántos días abre. `null`
 * si el horario no está completo: con un día sin fila o sin horas no se sabe.
 */
export function resumenHorario(dias: readonly DiaHorario[] | undefined): string | null {
  if (!dias) return null;
  const porDia = new Map(dias.map(d => [d.diaSemana, d]));
  if (SEMANA.some(d => !porDia.has(d))) return null;

  const tramos: { desde: number; hasta: number; franja: string }[] = [];
  for (let i = 0; i < SEMANA.length; i++) {
    const dia = porDia.get(SEMANA[i])!;
    if (!dia.abierto) continue;
    const abre = hora(dia.horaApertura);
    const cierra = hora(dia.horaCierre);
    if (!abre || !cierra) return null;
    const franja = `${abre}-${cierra}`;
    const ultimo = tramos.at(-1);
    if (ultimo && ultimo.franja === franja && ultimo.hasta === i - 1) ultimo.hasta = i;
    else tramos.push({ desde: i, hasta: i, franja });
  }
  if (tramos.length === 0) return 'cerrado toda la semana';

  const texto = tramos
    .map(t => {
      const desde = LETRA_DIA[SEMANA[t.desde]];
      return `${t.desde === t.hasta ? desde : `${desde}-${LETRA_DIA[SEMANA[t.hasta]]}`} ${t.franja}`;
    })
    .join(', ');
  if (texto.length <= 24) return texto;
  const abiertos = tramos.reduce((n, t) => n + t.hasta - t.desde + 1, 0);
  return `abre ${contar(abiertos, 'día', 'días')} a la semana`;
}

function salud(i: IntegracionResumible | undefined): SaludIntegracion {
  return saludIntegracion(i && {
    activo: i.activo === true,
    ultimoOkEn: i.ultimoOkEn ?? null,
    ultimoError: i.ultimoError ?? null,
    ultimoErrorEn: i.ultimoErrorEn ?? null,
  });
}

const NOMBRE_INTEGRACION: Record<TipoIntegracion, string> = {
  STRIPE: 'Stripe',
  RESEND: 'El envío de tus correos',
  GOOGLE_CALENDAR: 'Google Calendar',
  GMAIL: 'Gmail',
  WHATSAPP: 'WhatsApp',
  ZOOM: 'Zoom',
  KISI: 'Kisi',
  MAILCHIMP: 'Mailchimp',
  KLAVIYO: 'Klaviyo',
  ZAPIER: 'Zapier',
};

// ─── Lo que hay que revisar ──────────────────────────────────────────────────

const en = (ancla: TarjetaId) => ({ ancla, seccion: seccionDeTarjeta(ancla) });

/** Qué le pasa al NIF guardado, o `null` si está bien. El mismo aviso en «Revisa esto» y en su fila. */
export function avisoNif(guardado: string | null): Pick<AvisoConfiguracion, 'texto' | 'etiqueta' | 'tono'> | null {
  const nif = (guardado ?? '').trim();
  if (!nif) return { texto: 'Falta tu NIF: tus cobros se quedan sin factura', etiqueta: 'Falta el NIF', tono: 'problema' };
  if (!nifEmisorValido(nif)) return { texto: 'Tu NIF no es válido: tus cobros se quedan sin factura', etiqueta: 'NIF no válido', tono: 'problema' };
  // Con formato de NIF pero la letra o el dígito de control no cuadran: la
  // factura sale, con un NIF que Hacienda no reconoce.
  if (!nifValido(nif)) return { texto: 'Revisa tu NIF: la letra o el dígito de control no cuadran', etiqueta: 'Revisa el NIF', tono: 'pendiente' };
  return null;
}

/**
 * Todo lo que está roto o sin hacer, en orden de prioridad: lo que ya tiene
 * consecuencias (facturas que no salen, una conexión que falla) antes que lo
 * que falta por completar.
 */
export function avisosDeConfiguracion(d: DatosConfiguracion): AvisoConfiguracion[] {
  const s = d.studio;
  const avisos: AvisoConfiguracion[] = [];

  // 1. El NIF. Con uno vacío o de relleno no se emite ninguna factura: es el
  //    mismo criterio que el aviso de Cobros → Facturas (`nifEmisorValido`).
  const nif = s.nif === undefined ? null : avisoNif(s.nif);
  if (nif) avisos.push({ id: 'nif', ...nif, ...en('datos-fiscales') });

  // 2. Una conexión que falló la última vez que se usó (lib/integraciones/salud.ts).
  for (const i of d.integraciones ?? []) {
    if (salud(i).estado !== 'FALLANDO') continue;
    const propia = `integracion-${i.tipo.toLowerCase()}`;
    const ancla: TarjetaId = esTarjetaId(propia) ? propia : 'mas-integraciones';
    avisos.push({
      id: `integracion-${i.tipo.toLowerCase()}`,
      texto: `${NOMBRE_INTEGRACION[i.tipo] ?? i.tipo}: falló la última vez que se usó`,
      etiqueta: 'Con problemas',
      tono: 'problema',
      ...en(ancla),
    });
  }

  // 3. Pide bono para reservar, tiene tarifas y no hay Stripe: una alumna nueva
  //    no puede comprarlo online. La misma señal que el aviso de Primeros pasos.
  //    Si Tentare aún no puede conectar Stripe, lo que sí puede tocar ella es la
  //    regla de pedir bono.
  if (s.stripeAccountId !== undefined && s.reservaExigirPlan !== undefined && d.numPlanesActivos !== null
    && avisoVentaOnline({ stripeAccountId: s.stripeAccountId, reservaExigirPlan: s.reservaExigirPlan, numPlanesActivos: d.numPlanesActivos })) {
    avisos.push({
      id: 'venta-online',
      texto: 'Una alumna nueva no puede comprar online el bono que pides para reservar',
      etiqueta: 'Sin venta online',
      tono: 'pendiente',
      ...en(d.stripeDisponible ? 'integracion-stripe' : 'reservar'),
    });
  }

  // 4. Un horario sin ningún día abierto: la agenda y la página de reservas no
  //    saben cuándo abres.
  if (s.horarioSemana && s.horarioSemana.length > 0 && !s.horarioSemana.some(dia => dia.abierto)) {
    avisos.push({ id: 'horario', texto: 'Tu horario no tiene ningún día abierto', etiqueta: 'Sin horario', tono: 'pendiente', ...en('horario') });
  }

  return avisos;
}

/** «Revisa esto»: los primeros `MAX_REVISA`. Vacío = no se pinta el bloque. */
export function revisaEsto(d: DatosConfiguracion): AvisoConfiguracion[] {
  return avisosDeConfiguracion(d).slice(0, MAX_REVISA);
}

// ─── El valor de cada sección ────────────────────────────────────────────────

function valorDe(id: SeccionId, d: DatosConfiguracion): string | null {
  const s = d.studio;
  switch (id) {
    case 'estudio':
      return unir([
        s.nombre?.trim(),
        resumenHorario(s.horarioSemana),
        d.numSalas === null ? null : d.numSalas === 0 ? 'sin salas' : contar(d.numSalas, 'sala', 'salas'),
      ]);

    case 'clases':
      if (d.numTiposClase === null) return null;
      return d.numTiposClase === 0 ? 'Sin tipos de clase' : contar(d.numTiposClase, 'tipo de clase', 'tipos de clase');

    case 'reservas': {
      const v = s.cancelacionVentanaHoras;
      const cancelar = v === undefined ? null : v > 0 ? `cancelar ${numero(v)} h` : 'cancelar sin plazo';
      let espera: string | null = null;
      if (s.permiteListaEspera === false) espera = 'sin lista de espera';
      else if (s.permiteListaEspera === true && s.listaEsperaPlazoAceptacionMinutos !== undefined) {
        const plazo = s.listaEsperaPlazoAceptacionMinutos;
        espera = plazo > 0 ? `${duracion(plazo)} para aceptar la plaza` : 'lista de espera al momento';
      }
      return unir([cancelar, espera]);
    }

    case 'cobros': {
      const stripe = s.stripeAccountId === undefined ? null
        : s.stripeAccountId ? 'Stripe conectado'
        : d.stripeDisponible ? 'Stripe sin conectar' : 'Stripe no disponible todavía';
      const iva = typeof s.ivaPorDefecto === 'number' ? `IVA ${numero(s.ivaPorDefecto)} %` : null;
      return unir([stripe, iva]);
    }

    case 'altas':
      return unir([
        resumenCompraPublica(s.compraPublicaModo),
        s.valoracionInicialActiva === true ? 'valoración inicial activa'
          : s.valoracionInicialActiva === false ? 'sin valoración inicial' : null,
      ]);

    case 'comunicacion': {
      let whatsapp: string | null = null;
      if (d.integraciones) {
        const estado = salud(d.integraciones.find(i => i.tipo === 'WHATSAPP')).estado;
        whatsapp = estado === 'FUNCIONA' ? 'WhatsApp funcionando'
          : estado === 'SIN_PROBAR' ? 'WhatsApp sin probar'
          : estado === 'FALLANDO' ? 'WhatsApp con problemas' : 'WhatsApp sin conectar';
      }
      return unir([whatsapp, s.gmailEmail ? 'Gmail conectado' : null]);
    }

    case 'equipo':
      if (s.instructorasCreanClases === undefined) return null;
      return s.instructorasCreanClases ? 'Las instructoras crean sus clases' : 'Las instructoras no crean clases';

    case 'marca':
      return unir([
        s.logoUrl === undefined ? null : s.logoUrl ? 'con logo' : 'sin logo',
        d.colorPropio == null ? null : d.colorPropio ? 'tu color' : 'color de Tentare',
      ]);

    case 'web':
      return unir([
        s.visibleEnNetwork === undefined ? null : s.visibleEnNetwork ? 'en Tentare Network' : 'fuera de Tentare Network',
      ]);

    case 'panel':
      if (!d.panel) return null;
      return unir([
        d.panel.menuPosition === 'superior' ? 'menú arriba' : 'menú a la izquierda',
        d.panel.oscuro ? 'modo oscuro' : 'modo claro',
      ]);

    case 'conexiones': {
      // Solo lo que se SABE conectado. Zapier se pide aparte al abrir la sección:
      // por eso nunca se dice «nada conectado» ni se da un total.
      const nombres: string[] = [];
      if (s.googleCalendarEmail) nombres.push('Google Calendar');
      if (s.zoomEmail) nombres.push('Zoom');
      if (s.klaviyoAccountName) nombres.push('Klaviyo');
      for (const i of d.integraciones ?? []) {
        if ((i.tipo === 'KISI' || i.tipo === 'MAILCHIMP') && i.activo) nombres.push(NOMBRE_INTEGRACION[i.tipo]);
      }
      if (nombres.length === 0) return null;
      const lista = nombres.length === 1
        ? `${nombres[0]} conectado`
        : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)} conectados`;
      return lista.length <= MAX_RESUMEN ? lista : `${nombres[0]} y más, conectados`;
    }

    // La motivación y tus avisos se cargan al abrir su sección, y exportar no
    // tiene un estado.
    case 'motivacion':
    case 'avisos':
    case 'datos':
      return null;
  }
}

/** Valor y estado de cada sección. */
export function resumenesDeConfiguracion(d: DatosConfiguracion): Record<SeccionId, ResumenSeccion> {
  const avisos = avisosDeConfiguracion(d);
  return Object.fromEntries(SECCIONES.map(({ id }) => {
    const aviso = avisos.find(a => a.seccion === id);
    return [id, { valor: valorDe(id, d), estado: aviso ? { tono: aviso.tono, etiqueta: aviso.etiqueta } : null }];
  })) as Record<SeccionId, ResumenSeccion>;
}

// ─── Las herramientas ────────────────────────────────────────────────────────
//
// Cada herramienta grande tiene su pantalla y, en su sección, una fila con cómo
// está («2 salas · 1 máquina en avería»). Las mismas reglas que las secciones:
// un campo `null` o ausente es «no se sabe», y entonces la fila enseña su
// descripción.

/** Los correos automáticos que se pueden apagar y editar, en el orden de su lista. */
export const CORREOS_AUTOMATICOS = ['bienvenida', 'reserva', 'recordatorio', 'cancelacion', 'promocion', 'impago'] as const;

/** Algo que se ve entre dos fechas, o siempre si no las tiene. */
type ConVigencia = { activo: boolean; fechaInicio?: string | null; fechaFin?: string | null };

export interface DatosHerramientas {
  numTiposClase?: number | null;
  salas?: {
    numSalas: number;
    /** Averías de máquina: `hasta: null` = sin fecha de arreglo. */
    averias: readonly { hasta: string | null }[];
    ahoraMs: number;
  } | null;
  /** Las filas de `plantillas_email`. Sin fila, el correo se envía. */
  correos?: readonly { tipo: string; enviar?: boolean | null }[] | null;
  contenido?: {
    mensajeDestacado: string | null;
    tarjetas: readonly ConVigencia[];
    avisos: readonly ConVigencia[];
    ahoraMs: number;
  } | null;
  /** Las webs donde está autorizado el calendario embebido. */
  widgetDominios?: readonly string[] | null;
  motivacion?: { recompensas: number; logros: number; niveles: number; retos: number } | null;
}

function enVigor(x: ConVigencia, ahoraMs: number): boolean {
  if (!x.activo) return false;
  if (x.fechaInicio && Date.parse(x.fechaInicio) > ahoraMs) return false;
  if (x.fechaFin && Date.parse(x.fechaFin) < ahoraMs) return false;
  return true;
}

/** La línea de la fila de una herramienta, o `null` si no se sabe cómo está. */
export function resumenHerramienta(id: HerramientaId, d: DatosHerramientas): string | null {
  switch (id) {
    case 'tipos-de-clase': {
      const n = d.numTiposClase;
      if (n == null) return null;
      return n === 0 ? 'Sin tipos de clase' : contar(n, 'tipo de clase', 'tipos de clase');
    }

    case 'salas': {
      if (!d.salas) return null;
      const { numSalas, averias, ahoraMs } = d.salas;
      if (numSalas === 0) return 'Sin salas';
      // El mismo criterio que la lista de averías: sin arreglo, o con arreglo aún por llegar.
      const rotas = averias.filter(a => !a.hasta || Date.parse(a.hasta) > ahoraMs).length;
      return unir([
        contar(numSalas, 'sala', 'salas'),
        rotas > 0 ? contar(rotas, 'máquina en avería', 'máquinas en avería') : null,
      ]);
    }

    case 'correos-automaticos': {
      if (!d.correos) return null;
      const total = CORREOS_AUTOMATICOS.length;
      const apagados = new Set(d.correos.filter(c => c.enviar === false).map(c => c.tipo));
      const salen = CORREOS_AUTOMATICOS.filter(t => !apagados.has(t)).length;
      if (salen === total) return `Los ${total} correos se envían`;
      if (salen === 0) return 'Ningún correo se envía';
      return `${salen} de ${total} correos se envían`;
    }

    case 'contenido-de-tu-app': {
      if (!d.contenido) return null;
      const { mensajeDestacado, tarjetas, avisos, ahoraMs } = d.contenido;
      const nTarjetas = tarjetas.filter(t => enVigor(t, ahoraMs)).length;
      const nAvisos = avisos.filter(a => enVigor(a, ahoraMs)).length;
      return unir([
        mensajeDestacado?.trim() ? 'con mensaje destacado' : 'sin mensaje destacado',
        // Solo las que se ven hoy: publicadas y dentro de sus fechas.
        nTarjetas > 0 ? contar(nTarjetas, 'tarjeta', 'tarjetas') : null,
        nAvisos > 0 ? contar(nAvisos, 'aviso', 'avisos') : null,
      ]);
    }

    case 'widgets': {
      // No se sabe qué widgets tiene pegados en su web: solo dónde autorizó el
      // calendario embebido. Sin ninguna, la fila cuenta qué hay dentro.
      const n = d.widgetDominios?.length ?? 0;
      return n > 0 ? `${contar(n, 'web autorizada', 'webs autorizadas')} para el calendario` : null;
    }

    case 'recompensas-y-logros': {
      if (!d.motivacion) return null;
      const { recompensas, logros, niveles, retos } = d.motivacion;
      if (recompensas + logros + niveles + retos === 0) return 'Sin recompensas ni logros todavía';
      return unir([
        recompensas > 0 ? contar(recompensas, 'recompensa', 'recompensas') : 'sin recompensas',
        logros > 0 ? contar(logros, 'logro', 'logros') : null,
        retos > 0 ? contar(retos, 'reto', 'retos') : null,
        niveles > 0 ? contar(niveles, 'nivel', 'niveles') : null,
      ]);
    }
  }
}

// ─── Las filas de «Mi estudio» ───────────────────────────────────────────────
//
// Cada fila dice su valor de hoy y abre un cajón para cambiarlo. Mismas reglas:
// `undefined` = sin cargar y la fila enseña su descripción; lo vacío se dice
// como vacío («Sin teléfono, email ni web»), nunca se rellena.

type DatosNombreYDireccion = Partial<Pick<Studio, 'nombre' | 'direccion' | 'ciudad'>>;
type DatosContacto = Partial<Pick<Studio, 'telefono' | 'email' | 'sitioWeb'>>;

const limpio = (v: string | null | undefined) => v?.trim() || null;

/** «Pilates Centro · Calle Mayor 4 · Almería». */
export function resumenNombreYDireccion(s: DatosNombreYDireccion): string | null {
  if (s.nombre === undefined) return null;
  const nombre = limpio(s.nombre);
  const direccion = limpio(s.direccion);
  const ciudad = limpio(s.ciudad);
  return unir([nombre ?? 'sin nombre', direccion, ciudad, direccion || ciudad ? null : 'sin dirección']);
}

/** «600 111 222 · hola@example.com». La web, sin `https://` ni barra final. */
export function resumenContacto(s: DatosContacto): string | null {
  if (s.telefono === undefined && s.email === undefined && s.sitioWeb === undefined) return null;
  const web = limpio(s.sitioWeb)?.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '') ?? null;
  return unir([limpio(s.telefono), limpio(s.email), web]) ?? 'Sin teléfono, email ni web';
}

/** «8:00», «21:30». */
function horaLarga(h: string | null): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(h ?? '');
  return m ? `${Number(m[1])}:${m[2]}` : null;
}

/**
 * La semana de lunes a domingo, con los días seguidos iguales juntos:
 * «L-V 8:00–22:00 · S 9:00–14:00 · D cerrado». Si no cabe en una línea, cuántos
 * días abre. `null` si falta algún día o alguna hora: no se adivina.
 */
export function resumenHorarioSemana(dias: readonly DiaHorario[] | undefined): string | null {
  if (!dias) return null;
  const porDia = new Map(dias.map(d => [d.diaSemana, d]));
  const tramos: { desde: number; hasta: number; franja: string }[] = [];
  for (let i = 0; i < SEMANA.length; i++) {
    const dia = porDia.get(SEMANA[i]);
    if (!dia) return null;
    let franja = 'cerrado';
    if (dia.abierto) {
      const abre = horaLarga(dia.horaApertura);
      const cierra = horaLarga(dia.horaCierre);
      if (!abre || !cierra) return null;
      franja = `${abre}–${cierra}`;
    }
    const ultimo = tramos.at(-1);
    if (ultimo && ultimo.franja === franja) ultimo.hasta = i;
    else tramos.push({ desde: i, hasta: i, franja });
  }
  if (tramos.length === 1) return tramos[0].franja === 'cerrado' ? 'Cerrado toda la semana' : `Todos los días ${tramos[0].franja}`;
  const letra = (i: number) => LETRA_DIA[SEMANA[i]];
  const texto = tramos
    .map(t => `${t.desde === t.hasta ? letra(t.desde) : `${letra(t.desde)}-${letra(t.hasta)}`} ${t.franja}`)
    .join(' · ');
  if (texto.length <= MAX_RESUMEN) return texto;
  const abiertos = tramos.filter(t => t.franja !== 'cerrado').reduce((n, t) => n + t.hasta - t.desde + 1, 0);
  return `Abre ${contar(abiertos, 'día', 'días')} a la semana`;
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «2026-12-24» → { dia: 24, mes: 'dic' }. */
function fechaCorta(iso: string): { dia: number; mes: string } {
  const [, m, d] = iso.split('-').map(Number);
  return { dia: d, mes: MES_CORTO[m - 1] };
}

/** «24–26 dic», «30 dic–2 ene», «8 dic». */
export function rangoDeFechas(desde: string, hasta: string): string {
  const a = fechaCorta(desde);
  const b = fechaCorta(hasta);
  if (desde === hasta) return `${a.dia} ${a.mes}`;
  return a.mes === b.mes && desde.slice(0, 4) === hasta.slice(0, 4)
    ? `${a.dia}–${b.dia} ${a.mes}`
    : `${a.dia} ${a.mes}–${b.dia} ${b.mes}`;
}

/**
 * El cierre que viene (o el que está en curso) y cuántos más hay. `hoy`, en la
 * fecha del estudio (`YYYY-MM-DD`). `null` = no se han podido leer.
 */
export function resumenCierres(cierres: readonly { desde: string; hasta: string }[] | null, hoy: string): string | null {
  if (!cierres) return null;
  const proximos = cierres.filter(c => c.hasta >= hoy).sort((a, b) => a.desde.localeCompare(b.desde));
  if (proximos.length === 0) return 'Sin cierres próximos';
  const [primero, ...resto] = proximos;
  const cuando = primero.desde <= hoy
    ? (primero.hasta === hoy ? 'cerrado hoy' : `cerrado hasta el ${rangoDeFechas(primero.hasta, primero.hasta)}`)
    : `cerrado ${rangoDeFechas(primero.desde, primero.hasta)}`;
  return unir([cuando, resto.length > 0 ? `${contar(resto.length, 'cierre más', 'cierres más')}` : null]);
}

/** «2 sedes · estás en Pilates Centro». `null` = sin cargar. */
export function resumenSedes(sedes: readonly { id: string; nombre: string }[] | null, actual: string | null | undefined): string | null {
  if (!sedes) return null;
  if (sedes.length <= 1) return 'Solo esta sede';
  const aqui = sedes.find(s => s.id === actual)?.nombre;
  return unir([contar(sedes.length, 'sede', 'sedes'), aqui ? `estás en ${aqui}` : null]);
}

// ─── Las filas de «Cobros y facturas» y «Alta de alumnas» ───────────────────
//
// Mismas reglas que las de Mi estudio. Algunas filas llevan además UN estado
// (la pastilla): Stripe siempre, porque es lo primero que se pregunta —¿lo
// tengo conectado?—, y el resto solo si hay algo que revisar.

/** El tono de la pastilla de una fila: los de `EstadoAjuste` (shell/estado-ajuste.tsx). */
export type TonoFila = 'activo' | 'pendiente' | 'problema' | 'neutro';

export interface ResumenFila {
  /** Lo que se ve bajo el título; `null` = no se sabe, y va la descripción. */
  valor: string | null;
  estado: { tono: TonoFila; etiqueta: string } | null;
}

const NADA: ResumenFila = { valor: null, estado: null };

/**
 * «Pilates Centro SL · B12345674 · IVA 21 %». Con el NIF mal, lo que pasa con
 * tus facturas y la misma pastilla que en «Revisa esto».
 */
export function resumenDatosFiscales(s: Partial<Pick<Studio, 'razonSocial' | 'nif' | 'ivaPorDefecto'>>): ResumenFila {
  if (s.nif === undefined) return NADA;
  const aviso = avisoNif(s.nif);
  if (aviso) {
    return {
      valor: aviso.tono === 'pendiente' ? 'Revisa el NIF: tus facturas salen con uno que Hacienda no reconoce' : aviso.texto,
      estado: { tono: aviso.tono, etiqueta: aviso.etiqueta },
    };
  }
  return {
    valor: unir([
      limpio(s.razonSocial),
      s.nif!.trim().toUpperCase(),
      typeof s.ivaPorDefecto === 'number' ? `IVA ${numero(s.ivaPorDefecto)} %` : null,
    ]),
    estado: null,
  };
}

/**
 * «Cobro con tarjeta (Stripe)»: UN estado, sin una frase debajo que lo
 * contradiga (decía «No conectado» y «Todavía no disponible» a la vez).
 * `bizum`: la capacidad de la cuenta conectada; `null` = no se sabe.
 */
export function resumenStripe(e: {
  conectado: boolean;
  /** ¿Tentare tiene puesta la conexión? Sin ella no hay nada que conectar. */
  disponible: boolean;
  fallando: boolean;
  bizum: 'active' | 'pending' | 'inactive' | null;
}): ResumenFila {
  if (e.conectado && e.fallando) return { valor: 'Falló la última vez que se usó', estado: { tono: 'problema', etiqueta: 'Con problemas' } };
  if (e.conectado) {
    const valor = e.bizum === 'active' ? 'Tarjeta y Bizum' : e.bizum ? 'Tarjeta · Bizum sin activar' : 'Cuenta de Stripe conectada';
    return { valor, estado: { tono: 'activo', etiqueta: 'Conectado' } };
  }
  if (e.disponible) return { valor: 'Conéctalo para cobrar con tarjeta', estado: { tono: 'neutro', etiqueta: 'Sin conectar' } };
  return { valor: 'Lo estamos terminando de conectar por nuestro lado', estado: { tono: 'neutro', etiqueta: 'No disponible todavía' } };
}

/** «Listas para remesas», «Sin configurar» o lo que falta. `null` = sin cargar. */
export function resumenDomiciliaciones(s: Partial<Pick<Studio, 'sepaAcreedorId' | 'sepaIban' | 'sepaTitular'>>): string | null {
  if (s.sepaAcreedorId === undefined && s.sepaIban === undefined && s.sepaTitular === undefined) return null;
  const faltan = ([['el identificador', s.sepaAcreedorId], ['el IBAN', s.sepaIban], ['el titular', s.sepaTitular]] as const)
    .filter(([, v]) => !limpio(v))
    .map(([nombre]) => nombre);
  if (faltan.length === 0) return 'Listas para remesas';
  if (faltan.length === 3) return 'Sin configurar';
  return `Falta ${faltan.join(' y ')}`;
}

/** «Hasta 14 días · bonos, solo sin empezar», o que se devuelve desde Stripe. */
export function resumenDevoluciones(s: Partial<Pick<Studio, 'reembolsosActivos' | 'reembolsoPlazoDias' | 'reembolsoSoloSinUsar'>>): string | null {
  if (s.reembolsosActivos === undefined) return null;
  if (!s.reembolsosActivos) return 'Apagadas: devuelves desde Stripe';
  // Los mismos valores por defecto que lee el servidor (app/api/reembolsos).
  const plazo = s.reembolsoPlazoDias ?? 14;
  return unir([
    plazo > 0 ? `hasta ${contar(plazo, 'día', 'días')}` : 'sin plazo',
    (s.reembolsoSoloSinUsar ?? true) ? 'bonos, solo sin empezar' : null,
  ]);
}

/**
 * De quién son los textos que acepta la alumna. Con unos términos PROPIOS no se
 * cobra ninguna penalización (`consentimientoCubrePenalizacion`: la cláusula del
 * cargo solo va en los de Tentare), así que si hay una configurada, se dice.
 */
export function resumenContrato(e: {
  propios: { politicaPrivacidad: boolean; terminosServicio: boolean } | null;
  hayPenalizacion: boolean;
}): ResumenFila {
  if (!e.propios) return NADA;
  const { terminosServicio: terminos, politicaPrivacidad: privacidad } = e.propios;
  if (terminos && e.hayPenalizacion) {
    return { valor: 'Con términos propios no se cobran penalizaciones', estado: { tono: 'problema', etiqueta: 'Con problemas' } };
  }
  const valor = terminos && privacidad ? 'Tus términos y tu privacidad'
    : terminos ? 'Tus términos · privacidad de Tentare'
    : privacidad ? 'Términos de Tentare · tu privacidad'
    : 'Los textos de Tentare';
  return { valor, estado: null };
}

/** El modo de «Compra desde tu enlace». */
export function resumenCompraPublica(modo: Studio['compraPublicaModo'] | undefined): string | null {
  if (modo === 'EXIGIR_REGISTRO') return 'Se registra antes de pagar';
  if (modo === 'CREAR_FICHA') return 'Paga sin registrarse antes';
  return null;
}

/** Los datos extra que se piden hoy (los apagados no salen en el alta). `null` = sin cargar. */
export function resumenDatosExtra(campos: readonly { activo: boolean; requerido: boolean }[] | null): string | null {
  if (!campos) return null;
  const activos = campos.filter(c => c.activo);
  if (activos.length === 0) return 'Ninguno';
  const obligatorios = activos.filter(c => c.requerido).length;
  return unir([
    contar(activos.length, 'dato extra', 'datos extra'),
    obligatorios > 0 ? contar(obligatorios, 'obligatorio', 'obligatorios') : null,
  ]);
}

/** Las preguntas activas del cuestionario de salud. `null` = sin cargar. */
export function resumenCuestionarioSalud(preguntas: readonly { activo: boolean }[] | null): string | null {
  if (!preguntas) return null;
  const n = preguntas.filter(p => p.activo).length;
  return n === 0 ? 'Sin preguntas' : contar(n, 'pregunta', 'preguntas');
}

/** Los planes a la venta, para la fila que lleva a Paquetes. `null` = sin cargar. */
export function resumenPlanesActivos(planes: readonly { activo: boolean }[] | null): string | null {
  if (!planes) return null;
  const n = planes.filter(p => p.activo).length;
  return n === 0 ? 'Ningún plan a la venta' : contar(n, 'plan a la venta', 'planes a la venta');
}

// ─── Las filas de «Cómo reservan mis alumnas» ───────────────────────────────
//
// Cada regla dice cómo está hoy, con lo principal delante: «Hasta 12 h antes»,
// «Plaza al momento», «5 € · lo apruebas tú». Si algún tipo de clase la cambia,
// va justo detrás («· 2 tipos lo cambian»), antes que el detalle: `unir` salta
// lo que no cabe y eso es lo que no se puede perder.

const tiposQueLaCambian = (n: number) => (n > 0 ? contar(n, 'tipo lo cambia', 'tipos lo cambian') : null);
const euros = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')} €`;

/**
 * `r`: las reglas GUARDADAS (reglas-reserva.ts). `excepciones`: cuántos tipos de
 * clase la cambian. `pideConfirmacion`: la confirmación de asistencia, que vive
 * en otro endpoint; `null` = sin leer, y no se dice nada de ella.
 */
export function resumenRegla(
  tarjeta: TarjetaReglasId,
  r: ReglasReserva,
  e: { excepciones: number; pideConfirmacion?: boolean | null },
): string | null {
  const excepciones = tiposQueLaCambian(e.excepciones);
  switch (tarjeta) {
    case 'reservar': {
      const dias = r.reservaAntelacionMaximaDias;
      return unir([
        dias == null ? 'cualquier antelación' : dias === 0 ? 'se abre al empezar' : `hasta ${contar(dias, 'día', 'días')} antes`,
        excepciones,
        // Aprobar a mano cambia más la vida de la alumna que pedir bono: va antes.
        r.requiereAprobacion ? 'la apruebas tú' : null,
        r.reservaExigirPlan ? 'con plan o bono' : 'sin plan ni bono',
      ]);
    }
    case 'cancelar-y-recuperar': {
      const v = r.cancelacionVentanaHoras;
      return unir([
        v > 0 ? `hasta ${numero(v)} h antes` : 'sin plazo para cancelar',
        excepciones,
        v > 0 ? (r.cancelacionDevolverBonoTardia ? 'después también recupera' : 'después pierde la sesión') : null,
      ]);
    }
    case 'si-se-cancela-una-clase':
      return unir([
        r.cancelacionClaseDevuelveBono ? 'devuelve la sesión' : 'no devuelve la sesión',
        excepciones,
        r.minimoAsistentesPorClase > 0 ? `mínimo ${contar(r.minimoAsistentesPorClase, 'alumna', 'alumnas')}` : 'sin mínimo',
      ]);
    case 'lista-de-espera': {
      const plazo = r.listaEsperaPlazoAceptacionMinutos;
      return unir([
        !r.permiteListaEspera ? 'sin lista de espera' : plazo > 0 ? `oferta de ${duracion(plazo)}` : 'plaza al momento',
        excepciones,
      ]);
    }
    case 'asistencia':
      return unir([
        r.requiereCheckinQr ? 'se pasa lista' : 'sin pasar lista',
        excepciones,
        e.pideConfirmacion === true ? 'pide confirmar a quien falta' : null,
      ]);
    case 'si-cancela-tarde-o-no-viene': {
      const importe = r.penalizacionImporteEur ?? 0;
      if (importe <= 0) return unir(['sin cargo', excepciones]);
      const tarde = r.penalizacionAplicaCancelacionTardia;
      const falta = r.penalizacionAplicaNoShow;
      return unir([
        euros(importe),
        excepciones,
        r.penalizacionCobroAutomatico ? 'se cobra solo' : 'lo apruebas tú',
        tarde && falta ? null : tarde ? 'solo si cancela tarde' : falta ? 'solo si no viene' : 'sin aplicar a nada',
      ]);
    }
  }
}

// ─── Las filas de «Cómo me comunico» ─────────────────────────────────────────
//
// WhatsApp y Gmail, con UN estado cada uno (como Stripe): la pastilla y la línea
// de debajo nunca se contradicen.

/**
 * WhatsApp según su salud (lib/integraciones/salud.ts). Recién guardado y sin
 * usar NO es «Conectado»: es justo la mentira que la salud vino a quitar.
 */
export function resumenWhatsapp(s: SaludIntegracion): ResumenFila {
  switch (s.estado) {
    case 'APAGADA':
      return { valor: 'Conéctalo para mandar recordatorios por WhatsApp', estado: { tono: 'neutro', etiqueta: 'Sin conectar' } };
    case 'SIN_PROBAR':
      return { valor: 'Guardado, pero aún sin usar: pruébalo', estado: { tono: 'pendiente', etiqueta: 'Sin probar' } };
    case 'FUNCIONA':
      return { valor: `Funciona · última vez el ${cuando(s.desde)}`, estado: { tono: 'activo', etiqueta: 'Conectado' } };
    case 'FALLANDO':
      return { valor: `Falló el ${cuando(s.desde)}: ${s.error}`, estado: { tono: 'problema', etiqueta: 'Con problemas' } };
  }
}

/** «Contactos de Gmail»: conectado (con qué cuenta), sin conectar, o nada que conectar todavía. */
export function resumenGmail(e: { email: string | null | undefined; disponible: boolean }): ResumenFila {
  const email = limpio(e.email);
  if (email) return { valor: email, estado: { tono: 'activo', etiqueta: 'Conectado' } };
  if (e.disponible) return { valor: 'Conéctalo para traer tus contactos', estado: { tono: 'neutro', etiqueta: 'Sin conectar' } };
  return { valor: 'Lo estamos terminando de conectar por nuestro lado', estado: { tono: 'neutro', etiqueta: 'No disponible todavía' } };
}

const EMAIL_VALIDO = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

/**
 * «Pilates Centro · responde a hola@example.com». Lo mismo que aplica al enviar
 * (`resolverRemitenteResend` + `marcaDesdeFila`): lo tuyo solo si está activo, un
 * email a medio escribir no cuenta, y lo que no pones sale del estudio.
 * `propio: null` = no se ha podido leer.
 */
export function resumenRemitente(e: {
  propio: { activo: boolean; fromName?: string | null; fromEmail?: string | null } | null;
  nombreEstudio: string | null | undefined;
  emailEstudio: string | null | undefined;
}): string | null {
  if (!e.propio) return null;
  const nombre = (e.propio.activo ? limpio(e.propio.fromName) : null) ?? limpio(e.nombreEstudio);
  const propio = e.propio.activo ? limpio(e.propio.fromEmail) : null;
  const email = (propio && EMAIL_VALIDO.test(propio) ? propio : null) ?? limpio(e.emailEstudio);
  // Más largo que una línea del móvil a propósito: se corta con «…» y está entero en su cajón.
  return unir([nombre ?? 'sin nombre', email ? `responde a ${email}` : 'sin email de respuesta'], 90);
}

// ─── Plan de Tentare ─────────────────────────────────────────────────────────

const NOMBRE_PLAN: Record<string, string> = Object.fromEntries(
  (Object.keys(PLAN_INFO) as Plan[]).map(p => [p, PLAN_INFO[p].nombre]),
);

/**
 * La fila «Plan de Tentare»: el plan, cómo está y, si hay que hacer algo, qué.
 * Lo que no encaja en ninguno de esos casos no se resume: sin prueba local y
 * sin una suscripción viva no se sabe qué decir, y se calla.
 */
export function resumenPlan(e: EstadoPlanResumible | null | undefined): ResumenSeccion {
  const nada: ResumenSeccion = { valor: null, estado: null };
  if (!e?.trial) return nada;
  const nombre = e.plan ? NOMBRE_PLAN[e.plan] ?? null : null;
  const { fase, diasRestantes } = e.trial;

  switch (fase) {
    case 'PLENA':
    case 'HOLGADA':
    case 'AVISO':
    case 'ULTIMO_DIA': {
      const quedan = diasRestantes === 1 ? 'queda 1 día' : `quedan ${diasRestantes} días`;
      return {
        valor: unir([nombre ? `prueba del plan ${nombre}` : 'en prueba', quedan]),
        // Solo el último día: antes la píldora de la barra ya lo cuenta sin alarmar.
        estado: fase === 'ULTIMO_DIA' ? { tono: 'pendiente', etiqueta: 'Elige tu plan' } : null,
      };
    }
    case 'EXPIRADA':
      return { valor: 'Prueba terminada', estado: { tono: 'problema', etiqueta: 'Elige un plan' } };
    case 'SUSCRITO': {
      if (!nombre) return nada;
      if (e.subscriptionStatus === 'active') return { valor: `Plan ${nombre} · activo`, estado: null };
      if (e.subscriptionStatus === 'trialing') return { valor: `Plan ${nombre} · en prueba`, estado: null };
      // Stripe no pudo cobrar la cuota y lo está reintentando.
      if (e.subscriptionStatus === 'past_due') {
        return { valor: `Plan ${nombre} · falló el último cobro`, estado: { tono: 'problema', etiqueta: 'Revisa el pago' } };
      }
      return nada;
    }
    case 'SIN_PRUEBA':
      return nada;
  }
}
