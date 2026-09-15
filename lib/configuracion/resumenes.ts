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
import { saludIntegracion, type FilaSalud, type SaludIntegracion } from '../integraciones/salud.ts';
import { nifEmisorValido, nifValido } from '../nif.ts';
import { SECCIONES, esTarjetaId, seccionDeTarjeta, type SeccionId, type TarjetaId } from './secciones.ts';

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
  if (s.nif !== undefined) {
    const nif = (s.nif ?? '').trim();
    if (!nif) {
      avisos.push({ id: 'nif', texto: 'Falta tu NIF: tus cobros se quedan sin factura', etiqueta: 'Falta el NIF', tono: 'problema', ...en('datos-fiscales') });
    } else if (!nifEmisorValido(nif)) {
      avisos.push({ id: 'nif', texto: 'Tu NIF no es válido: tus cobros se quedan sin factura', etiqueta: 'NIF no válido', tono: 'problema', ...en('datos-fiscales') });
    } else if (!nifValido(nif)) {
      // Con formato de NIF pero la letra o el dígito de control no cuadran: la
      // factura sale, con un NIF que Hacienda no reconoce.
      avisos.push({ id: 'nif', texto: 'Revisa tu NIF: la letra o el dígito de control no cuadran', etiqueta: 'Revisa el NIF', tono: 'pendiente', ...en('datos-fiscales') });
    }
  }

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
    avisos.push({ id: 'horario', texto: 'Tu horario no tiene ningún día abierto', etiqueta: 'Sin horario', tono: 'pendiente', ...en('horario-y-cierres') });
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
        s.compraPublicaModo === 'EXIGIR_REGISTRO' ? 'se registra antes de pagar'
          : s.compraPublicaModo === 'CREAR_FICHA' ? 'paga sin registrarse antes' : null,
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

    case 'web':
      return unir([
        s.logoUrl === undefined ? null : s.logoUrl ? 'con logo' : 'sin logo',
        s.visibleEnNetwork === undefined ? null : s.visibleEnNetwork ? 'en Tentare Network' : 'fuera de Tentare Network',
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

    // La motivación se carga al abrir su sección, y exportar no tiene un estado.
    case 'motivacion':
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
