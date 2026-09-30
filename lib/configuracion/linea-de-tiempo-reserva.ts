// «Así lo vive tu alumna»: las reglas de reserva contadas sobre UNA clase de
// verdad, con fechas y horas, en el orden en que le pasan las cosas a ella.
//
// Existe porque un ajuste suelto («12 h», «30 min», «2 días») no dice lo que
// vive nadie: la propietaria tenía que hacer la cuenta de cabeza para saber si
// Marta podía cancelar el jueves a las 7. Aquí se hace la cuenta.
//
// Dos reglas de la casa:
//  · Cada regla se resuelve como al reservar (`heredaOverride`: el tipo de
//    clase manda si tiene valor propio; NULL = hereda del estudio).
//  · Las frases de cancelar y de la lista de espera son las MISMAS que lee la
//    alumna en su app (`frasesPoliticaEstudio`): el panel no puede contarle a
//    la propietaria algo distinto de lo que le cuenta a su alumna.
//
// Puro: se prueba con `node --test`.

import { heredaOverride } from '../booking-logic.ts';
import { frasesPoliticaEstudio } from '../politica-estudio-textos.ts';
import type { ReglasReserva, TipoConReglas } from './reglas-reserva.ts';

const ZONA = 'Europe/Madrid';

/** Las reglas que se le aplican a una clase de ese tipo (sin tipo: las del estudio). */
export function reglasEfectivasDeTipo(e: ReglasReserva, t: TipoConReglas | null | undefined): ReglasReserva {
  if (!t) return e;
  return {
    ...e,
    reservaExigirPlan: heredaOverride(t.reservaExigirPlan, e.reservaExigirPlan),
    reservaVentanaMinimaMinutos: heredaOverride(t.reservaVentanaMinimaMinutos, e.reservaVentanaMinimaMinutos),
    reservaAntelacionMaximaDias: heredaOverride(t.reservaAntelacionMaximaDias, e.reservaAntelacionMaximaDias),
    requiereAprobacion: heredaOverride(t.requiereAprobacion, e.requiereAprobacion),
    cancelacionVentanaHoras: heredaOverride(t.ventanaCancelacionHoras, e.cancelacionVentanaHoras),
    minimoAsistentesPorClase: heredaOverride(t.minimoAsistentesPorClase, e.minimoAsistentesPorClase),
    permiteListaEspera: heredaOverride(t.permiteListaEspera, e.permiteListaEspera),
    listaEsperaPlazoAceptacionMinutos: heredaOverride(t.listaEsperaPlazoAceptacionMinutos, e.listaEsperaPlazoAceptacionMinutos),
    requiereCheckinQr: heredaOverride(t.requiereCheckinQr, e.requiereCheckinQr),
    // `coalesce(tc.penalizacion_importe_eur, st.penalizacion_importe_eur)`: un 0 propio
    // apaga el cargo. Y un importe propio DISTINTO del del estudio tampoco se cobra:
    // el consentimiento de la alumna es sobre el importe del estudio (ver
    // `resumenRegla`, «su cargo no se cobra»). La línea de tiempo no lo promete.
    penalizacionImporteEur: t.penalizacionImporteEur == null ? e.penalizacionImporteEur
      : cifra(t.penalizacionImporteEur) === cifra(e.penalizacionImporteEur) ? e.penalizacionImporteEur : 0,
  };
}

export interface PasoReserva {
  id: 'abre' | 'cierra' | 'cancela-a-tiempo' | 'cancela-tarde' | 'llena' | 'dia';
  /** Cuándo, con fecha y hora de la clase de ejemplo («Hasta el jue 2 · 06:00»). */
  cuando: string;
  /** Qué le pasa, en pocas palabras («Cancela gratis»). */
  que: string;
  detalle: string;
  tono?: 'bien' | 'aviso';
}

const partes = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat('es-ES', {
  timeZone: ZONA, weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
}).formatToParts(d).map(p => [p.type, p.value]));

/** «jue 2 · 06:00», en la hora del estudio. */
export function instante(d: Date): string {
  const p = partes(d);
  return `${String(p.weekday).replace('.', '')} ${p.day} · ${p.hour}:${p.minute}`;
}

function duracion(minutos: number): string {
  if (minutos >= 60 && minutos % 60 === 0) return `${minutos / 60} h`;
  return `${minutos} min`;
}
const cifra = (v: number | null | undefined) => (typeof v === 'number' && v > 0 ? v : 0);
const euros = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')} €`;
const menos = (d: Date, minutos: number) => new Date(d.getTime() - minutos * 60_000);

/**
 * Lo que vive una alumna en una clase que empieza en `inicio`, con las reglas
 * ya resueltas para su tipo (`reglasEfectivasDeTipo`).
 */
export function lineaDeTiempoReserva(r: ReglasReserva, inicio: Date): PasoReserva[] {
  const pasos: PasoReserva[] = [];
  const politica = frasesPoliticaEstudio({ ...r, avisarAlumnas: null });
  const frase = (id: string) => politica.find(f => f.id === id)?.texto ?? '';

  // 1 · Se abre.
  const dias = r.reservaAntelacionMaximaDias;
  pasos.push(dias == null
    ? { id: 'abre', cuando: 'Desde que está en tu horario', que: 'Se abre la reserva', detalle: 'Sin límite de antelación' }
    : dias === 0
      ? { id: 'abre', cuando: `Desde el ${instante(inicio)}`, que: 'Se abre la reserva', detalle: 'No se abre hasta que empieza la clase', tono: 'aviso' }
      : { id: 'abre', cuando: `Desde el ${instante(menos(inicio, dias * 24 * 60))}`, que: 'Se abre la reserva', detalle: `${dias === 1 ? '1 día' : `${dias} días`} antes, a la hora de la clase` });

  // 2 · Puede reservar hasta.
  const cierre = cifra(r.reservaVentanaMinimaMinutos);
  const condiciones = [
    cierre > 0 ? `Se cierra ${duracion(cierre)} antes` : 'Hasta que empieza',
    cifra(r.reservaMaxSimultaneas) > 0 ? `como mucho ${r.reservaMaxSimultaneas} a la vez` : null,
    r.reservaExigirPlan ? 'con un plan o bono que la cubra' : 'sin plan ni bono',
    r.requiereAprobacion ? 'la apruebas tú' : null,
    r.bloquearReservaImpago ? 'nunca con un pago fallido' : null,
  ].filter(Boolean);
  pasos.push({ id: 'cierra', cuando: `Hasta el ${instante(menos(inicio, cierre))}`, que: 'Puede reservar', detalle: condiciones.join(' · ') });

  // 3 y 4 · Cancelar: las frases de su app.
  const ventana = cifra(r.cancelacionVentanaHoras);
  if (ventana > 0) {
    pasos.push({ id: 'cancela-a-tiempo', cuando: `Hasta el ${instante(menos(inicio, ventana * 60))}`, que: 'Cancela gratis', detalle: frase('cancela-a-tiempo'), tono: 'bien' });
    const importe = cifra(r.penalizacionImporteEur);
    const cargo = importe > 0 && r.penalizacionAplicaCancelacionTardia
      ? ` Además se le cobran ${euros(importe)}${r.penalizacionCobroAutomatico ? '' : ' si lo apruebas'}.`
      : '';
    pasos.push({ id: 'cancela-tarde', cuando: `Después del ${instante(menos(inicio, ventana * 60))}`, que: 'Si cancela tarde', detalle: `${frase('cancela-tarde')}${cargo}`, tono: r.cancelacionDevolverBonoTardia && !cargo ? undefined : 'aviso' });
  } else {
    pasos.push({ id: 'cancela-a-tiempo', cuando: 'Hasta que empieza', que: 'Cancela gratis', detalle: frase('cancela-a-tiempo'), tono: 'bien' });
  }

  // 5 · Si está llena.
  pasos.push({
    id: 'llena', cuando: 'Si está llena', que: r.permiteListaEspera ? 'Entra en la lista de espera' : 'No puede apuntarse',
    detalle: frase('plaza-liberada'), tono: r.permiteListaEspera ? undefined : 'aviso',
  });

  // 6 · El día de la clase.
  const importe = cifra(r.penalizacionImporteEur);
  const noViene = importe > 0 && r.penalizacionAplicaNoShow ? ` Si no viene, se le cobran ${euros(importe)}${r.penalizacionCobroAutomatico ? '' : ' si lo apruebas'}.` : '';
  pasos.push({
    id: 'dia', cuando: instante(inicio), que: 'El día de la clase',
    detalle: `${r.requiereCheckinQr ? 'Cuenta como asistida si la marcas al pasar lista.' : 'Sin pasar lista: cuenta como asistida al terminar.'}${noViene}`,
  });

  return pasos;
}

/** La clase sobre la que se cuenta: la próxima de verdad o, si no hay, una de ejemplo. */
export interface ClaseDeEjemplo {
  inicio: Date;
  /** Nombre del tipo, o `null` en la de ejemplo. */
  nombre: string | null;
  tipoId: string | null;
  deEjemplo: boolean;
}

/**
 * La próxima clase NO cancelada que cumpla `vale` (p. ej. «de este tipo»), o un
 * jueves a las 18:00 de ejemplo —dentro de la semana que viene— si no hay
 * ninguna. `ahora` se pasa para poder probarlo.
 */
export function claseDeEjemplo(
  sesiones: readonly { inicio: string; cancelada: boolean; tipoClaseId: string }[],
  nombreDeTipo: (id: string) => string | null,
  ahora: Date,
  vale: (tipoId: string) => boolean = () => true,
): ClaseDeEjemplo {
  let mejor: { inicio: Date; tipoId: string } | null = null;
  for (const s of sesiones) {
    if (s.cancelada || !vale(s.tipoClaseId)) continue;
    const inicio = new Date(s.inicio);
    if (!(inicio.getTime() > ahora.getTime())) continue;
    if (!mejor || inicio < mejor.inicio) mejor = { inicio, tipoId: s.tipoClaseId };
  }
  if (mejor) return { inicio: mejor.inicio, nombre: nombreDeTipo(mejor.tipoId), tipoId: mejor.tipoId, deEjemplo: false };
  return { inicio: juevesALas18(ahora), nombre: null, tipoId: null, deEjemplo: true };
}

/** El próximo jueves a las 18:00 en Madrid (si hoy es jueves, el de la semana que viene). */
function juevesALas18(ahora: Date): Date {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(ahora); // AAAA-MM-DD
  const [y, m, d] = hoy.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12));
  const dia = base.getUTCDay(); // 4 = jueves
  const faltan = ((4 - dia + 7) % 7) || 7;
  const jueves = new Date(base.getTime() + faltan * 86_400_000);
  // 18:00 en Madrid: se prueba con +02:00 y se corrige si ese día es horario de invierno.
  const iso = jueves.toISOString().slice(0, 10);
  for (const desfase of ['+02:00', '+01:00']) {
    const t = new Date(`${iso}T18:00:00${desfase}`);
    if (new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, hour: '2-digit', hour12: false }).format(t) === '18') return t;
  }
  return new Date(`${iso}T16:00:00Z`);
}

/**
 * «Mensual 2×/semana · Bono 10 sin límite»: lo que decide cuántas clases a la
 * semana puede hacer cada alumna, que vive en cada plan (Paquetes). Solo planes
 * activos; `null` si no hay ninguno.
 */
export function resumenClasesPorSemana(
  planes: readonly { nombre: string; activo?: boolean | null; limiteSemanal?: number | null }[],
  max = 88,
): string | null {
  const activos = planes.filter(p => p.activo !== false);
  if (activos.length === 0) return null;
  const conTope = activos.filter(p => cifra(p.limiteSemanal) > 0).map(p => `${p.nombre} ${p.limiteSemanal}×/semana`);
  const sinTope = activos.length - conTope.length;
  const partes = [...conTope, sinTope > 0 ? (sinTope === activos.length ? 'Ningún plan pone tope' : `${sinTope === 1 ? '1 plan más' : `${sinTope} planes más`} sin tope`) : null].filter(Boolean) as string[];
  let texto = '';
  for (const parte of partes) {
    const candidato = texto ? `${texto} · ${parte}` : parte;
    if (candidato.length > max) break;
    texto = candidato;
  }
  return texto || null;
}
