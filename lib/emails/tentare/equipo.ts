// Los correos de Tentare al EQUIPO de un estudio y a quien trabaja con él:
// invitaciones, peticiones de disponibilidad, sustituciones, el cierre para la
// gestoría y las referencias de Tentare Network. Los firma Tentare; el estudio
// aparece por su nombre, que es lo que reconoce quien lo recibe.

import { correoTentare, TENTARE } from './plantilla.ts';
import { nombreAppPorRol } from '../../permisos-reglas.ts';
import { lineaNetworkAgotada } from '../../sustituciones/mensajes.ts';
import { formatEuro } from '../../utils.ts';
import type { Rol } from '../../types';

const ROL_LABEL: Record<string, string> = {
  PROPIETARIO: 'propietaria',
  RECEPCION: 'recepción',
  INSTRUCTOR: 'instructora',
  MANAGER: 'responsable de sede',
};

export function correoInvitacionEquipo(p: {
  nombre: string;
  propietariaNombre: string;
  estudioNombre: string;
  rol: string;
  /** El enlace con el token que vincula su cuenta a esta ficha. */
  url: string;
}): string {
  const rolLabel = ROL_LABEL[p.rol] ?? 'miembro del equipo';
  const marca = nombreAppPorRol((p.rol as Rol) ?? 'INSTRUCTOR');
  // Desde el 15-sep-2026 la instructora trabaja en la app del estudio, no en el
  // panel: su enlace la lleva allí (`/invitacion` la reenvía).
  const esApp = p.rol === 'INSTRUCTOR';
  return correoTentare({
    preheader: `${p.propietariaNombre} te ha invitado a ${p.estudioNombre}`,
    antetitulo: p.estudioNombre,
    titular: 'Te han invitado al equipo',
    parrafos: [`Hola ${p.nombre}, ${p.propietariaNombre} te ha dado de alta como ${rolLabel} en el equipo de ${p.estudioNombre} en ${marca}.`],
    destacado: {
      titulo: 'Este enlace es tuyo',
      texto: esApp
        ? `Te lleva a la app de ${p.estudioNombre}. Entra con la cuenta que ya tengas o créala allí —con Google o con un enlace a tu correo— y elige «Como instructora».`
        : 'Al crear tu cuenta, o entrar con la que ya tienes, queda vinculada a tu ficha, uses el correo que uses. No hace falta ningún código.',
    },
    boton: { href: p.url, texto: esApp ? 'Aceptar invitación' : 'Crear mi cuenta o entrar' },
    nota: 'Si no esperabas esta invitación, puedes ignorar este correo.',
    motivo: `Te escribimos porque ${p.propietariaNombre} te ha añadido al equipo de ${p.estudioNombre}.`,
  });
}

export function correoSolicitudDisponibilidad(p: {
  nombre: string;
  propietariaNombre: string;
  estudioNombre: string;
  url: string;
}): string {
  return correoTentare({
    preheader: `${p.propietariaNombre} te pide tu disponibilidad`,
    antetitulo: p.estudioNombre,
    titular: '¿Cuándo puedes cubrir clases?',
    parrafos: [`Hola ${p.nombre}, ${p.propietariaNombre} necesita saber cuándo puedes cubrir una clase si hace falta una sustituta en ${p.estudioNombre}.`],
    agenda: { titulo: 'Cómo se hace', filas: [
      { cuando: 'Desde el móvil', que: 'Sin contraseña ni instalar nada.' },
      { cuando: 'Un toque por franja', que: 'Menos de un minuto.' },
      { cuando: 'Cuando quieras', que: 'Vuelve al mismo enlace para actualizarla.' },
    ] },
    boton: { href: p.url, texto: 'Marcar mi disponibilidad' },
    motivo: `Te escribimos porque formas parte del equipo de ${p.estudioNombre}.`,
  });
}

export function correoContactoSustituta(p: {
  toName: string;
  estudioNombre: string;
  claseNombre: string;
  cuando: string;
  /** La PÁGINA de respuesta. Nunca acepta por GET: los prefetchers de correo la aceptarían al abrir. */
  url: string;
  recordatorio?: boolean;
}): string {
  const intro = p.recordatorio
    ? 'Te escribimos hace un rato para cubrir una clase y aún no tenemos tu respuesta. Sigue disponible.'
    : `${p.estudioNombre} necesita cubrir una clase y has salido como la mejor opción.`;
  return correoTentare({
    preheader: intro,
    antetitulo: p.recordatorio ? 'Recordatorio' : p.estudioNombre,
    titular: `¿Puedes cubrir ${p.claseNombre}?`,
    parrafos: [`Hola ${p.toName}, ${intro.charAt(0).toLowerCase()}${intro.slice(1)}`],
    destacado: { titulo: p.claseNombre, texto: p.cuando },
    boton: { href: p.url, texto: 'Ver la clase y responder' },
    nota: 'Un solo toque, sin instalar nada. Si otra persona la coge antes, te avisamos.',
    motivo: `Te escribimos porque eres instructora de ${p.estudioNombre}.`,
  });
}

export type TipoAlertaSustitucion = 'baja' | 'sin_respuesta' | 'agotada' | 'sin_sustituta';

export function correoAlertaPropietaria(p: {
  estudioNombre: string;
  claseNombre: string;
  cuando: string;
  tipo: TipoAlertaSustitucion;
  candidataNombre?: string;
  urlPanel: string;
  /** 'baja': el motor ya está avisando a candidatas. */
  yaContactando?: boolean;
  /** 'agotada': cuántos profesionales de Network se le proponen. Solo el número. */
  nNetwork?: number;
}): string {
  const baja = p.tipo === 'baja';
  const agotada = p.tipo === 'agotada';
  const sinSustituta = p.tipo === 'sin_sustituta';
  const titular = baja
    ? `${p.candidataNombre ?? 'Una instructora'} no puede dar esta clase`
    : agotada
      ? 'Nadie ha podido cubrir esta clase'
      : sinSustituta
        ? 'Esta clase se ha quedado sin cubrir'
        : `${p.candidataNombre ?? 'La candidata'} aún no responde`;
  const cuerpo = baja
    ? (p.yaContactando
        ? 'Nos lo ha dicho desde su móvil y ya estamos avisando a las candidatas por ti. Te escribimos en cuanto alguna confirme: no tienes que hacer nada ahora mismo.'
        : 'Nos lo ha dicho desde su móvil. Ya tenemos las candidatas ordenadas y listas: solo falta tu visto bueno en el panel para que empecemos a avisarlas.')
    : agotada
      ? 'Hemos avisado a todas las candidatas disponibles y ninguna ha confirmado. La clase sigue sin sustituta y necesita tu decisión: avisar a alguien por tu cuenta o cancelarla (avisamos a las alumnas por ti).'
      : sinSustituta
        // Cierre por barrido, con la hora de clase ya pasada: aviso de qué ha
        // pasado, no una llamada a la acción antes de que sea tarde.
        ? 'Esta clase ya ha llegado a su hora sin que nadie confirmara cubrirla, y puede que nunca llegara a avisarse a ninguna candidata. Revisa el panel para ver qué pasó y avisar a las alumnas si hace falta.'
        : `Avisamos a ${p.candidataNombre ?? 'la candidata'} y aún no ha respondido. Puedes esperar, avisar a otra candidata o cancelar la clase desde el panel.`;
  return correoTentare({
    preheader: cuerpo.slice(0, 90),
    antetitulo: 'Sustituciones',
    titular,
    parrafos: [cuerpo, agotada ? lineaNetworkAgotada(p.nNetwork) : null],
    destacado: { titulo: p.claseNombre, texto: p.cuando },
    boton: { href: p.urlPanel, texto: 'Abrir sustituciones' },
    // Una baja recién avisada NO es una alarma: es «nos hemos enterado y ya
    // estamos en ello». El rojo se reserva para cuando tiene que actuar ya —
    // si todo pinta urgente, nada lo parece.
    acento: agotada || sinSustituta ? TENTARE.alerta : null,
    motivo: `Te escribimos porque eres la propietaria de ${p.estudioNombre}.`,
  });
}

export interface CierreGestoriaProps {
  estudioNombre: string;
  anio: number;
  /** Presente = envío trimestral (modelo 303). Ausente = el año completo. */
  trimestre?: 1 | 2 | 3 | 4 | null;
  totales: { base: number; cuota: number; total: number; numFacturas: number; numManuales: number };
  trimestres: { trimestre: number; base: number; cuota: number; total: number }[];
  nombreAdjunto: string;
}

export function correoCierreGestoria(p: CierreGestoriaProps): string {
  const periodo = p.trimestre ? `T${p.trimestre} ${p.anio}` : `año ${p.anio}`;
  const filas = p.trimestre ? p.trimestres.filter(t => t.trimestre === p.trimestre) : p.trimestres;
  const manuales = p.totales.numManuales
    ? ` y ${p.totales.numManuales} ingreso(s) añadido(s) a mano (cobrados fuera de la plataforma)`
    : '';
  return correoTentare({
    preheader: `Resumen fiscal ${periodo} de ${p.estudioNombre} — ${formatEuro(p.totales.total)} facturado`,
    antetitulo: p.estudioNombre,
    titular: p.trimestre ? `Cierre T${p.trimestre} ${p.anio}` : `Cierre de año ${p.anio}`,
    parrafos: [
      `Hola, te comparto el cierre del ${periodo} de ${p.estudioNombre}: el resumen de ingresos y del IVA repercutido, con el libro de facturas emitidas adjunto en CSV (${p.nombreAdjunto}).`,
    ],
    cifras: [
      { valor: formatEuro(p.totales.base), etiqueta: 'Base imponible' },
      { valor: formatEuro(p.totales.cuota), etiqueta: 'IVA repercutido' },
      { valor: formatEuro(p.totales.total), etiqueta: 'Total facturado' },
    ],
    // Un cierre trimestral ya lo cuenta entero en las cifras: la agenda solo
    // aporta en el de año, donde desglosa los cuatro trimestres.
    agenda: p.trimestre ? null : {
      titulo: 'Resumen por trimestre',
      filas: filas.map(t => ({
        cuando: `T${t.trimestre}`,
        que: `Base ${formatEuro(t.base)} · IVA ${formatEuro(t.cuota)} · Total ${formatEuro(t.total)}`,
      })),
    },
    nota: `Incluye ${p.totales.numFacturas} factura(s) emitida(s) en Tentare Manager${manuales}. Este resumen recopila ingresos y el IVA repercutido a partir de las facturas del estudio. No incluye gastos ni IVA soportado, y no sustituye la presentación de impuestos. Puedes responder a este correo para contactar con el estudio.`,
    motivo: `Te lo envía ${p.estudioNombre} desde Tentare Manager.`,
  });
}

export function correoReferenciaSolicitud(p: {
  nombreReferente: string;
  profesionalNombre: string;
  relacion?: string | null;
  url: string;
}): string {
  const relacion = p.relacion?.trim() ? ` (${p.relacion.trim()})` : '';
  return correoTentare({
    preheader: `${p.profesionalNombre} te ha puesto como referencia en Tentare Network`,
    antetitulo: 'Tentare Network',
    titular: 'Te piden una referencia profesional',
    parrafos: [
      `Hola ${p.nombreReferente}, ${p.profesionalNombre} te ha puesto como referencia profesional${relacion} en su perfil de Tentare Network, la red de instructoras de Pilates y estudios que usan Tentare.`,
      'Solo te pedimos que confirmes que la conoces por haber trabajado con ella. No hace falta crear ninguna cuenta.',
    ],
    boton: { href: p.url, texto: 'Responder a la solicitud' },
    nota: `Este enlace caduca en 7 días. Si no reconoces a ${p.profesionalNombre}, puedes ignorar este correo o rechazar la solicitud.`,
    motivo: `Te escribimos porque ${p.profesionalNombre} te ha dado como referencia.`,
  });
}
