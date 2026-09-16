// Los avisos sobre una clase que YA tenía reservada: que cambia algo, que hay
// una sustitución, o que hace falta su confirmación para no perder la plaza.
//
// Ninguno lleva foto de portada: los seis llegan a mitad de semana para decirle
// algo concreto sobre un día concreto, y una portada delante retrasa el dato.
// El filete de color es lo que distingue una buena noticia de una mala.

import { correoEstudio, type MarcaCorreo, type FilaDetalle } from './plantilla.ts';
import { ACENTO } from './paleta.ts';

export interface PropsCambioClase {
  socioNombre: string;
  claseNombre: string;
  fecha: string;
  hora: string;
  sala: string;
  instructor: string;
  /** Quién la daba antes. Es el dato que la alumna busca al abrir el correo. */
  instructorAnterior?: string | null;
  cambioHora?: boolean;
  cambioSala?: boolean;
  /** La edición era de toda la serie: se manda UN correo y esta línea lo dice. */
  masClasesDeLaSerie?: boolean;
  marca: MarcaCorreo;
  intro?: string | null;
}

function queCambio(p: PropsCambioClase): string[] {
  return [
    p.cambioHora ? 'la hora' : null,
    p.cambioSala ? 'la sala' : null,
    p.instructorAnterior ? 'la instructora' : null,
  ].filter((x): x is string => x !== null);
}

export function correoCambioClase(p: PropsCambioClase): string {
  const cambios = queCambio(p);
  const lista = cambios.length === 0
    ? 'la instructora'
    : cambios.length === 1
      ? cambios[0]
      : `${cambios.slice(0, -1).join(', ')} y ${cambios[cambios.length - 1]}`;
  const filas: FilaDetalle[] = [
    { label: 'Fecha', value: p.fecha },
    { label: 'Hora', value: p.hora },
    { label: 'Sala', value: p.sala },
    ...(p.instructorAnterior ? [{ label: 'Antes la daba', value: p.instructorAnterior, tachado: true }] : []),
    { label: p.instructorAnterior ? 'Ahora la da' : 'Instructora', value: p.instructor },
  ];
  return correoEstudio({
    marca: p.marca,
    preheader: `${p.claseNombre}: ha cambiado ${lista}`,
    titular: 'Un cambio en tu clase',
    parrafos: [
      p.intro?.trim() || (cambios.length === 0
        ? `Hola ${p.socioNombre}, tu clase sigue en pie a la misma hora y en la misma sala, pero la dará otra instructora. Te lo contamos para que no te pille de sorpresa.`
        : `Hola ${p.socioNombre}, ha cambiado ${lista} de tu clase. Te lo contamos para que no te pille de sorpresa.`),
      p.masClasesDeLaSerie
        ? `El cambio es para toda la serie: tus próximas clases de ${p.claseNombre} cambian igual. Te mandamos un solo aviso para no llenarte el correo.`
        : null,
    ],
    detalle: { titulo: p.claseNombre, filas },
    conPortada: false,
    acento: ACENTO.aviso,
    nota: 'No tienes que hacer nada: tu plaza sigue reservada. Si no te viene bien, puedes cancelar desde tu app.',
  });
}

// ── Sustituciones ────────────────────────────────────────────────────────────

/**
 * Las tres cosas que le pueden pasar a su clase cuando la instructora no puede
 * darla. El discriminante viaja intacto desde `avisarAlumnas`
 * (lib/sustituciones/avisos.ts) y se ramifica UNA vez, aquí, donde vive la copy.
 */
export type AvisoAlumna =
  | { tipo: 'cubierta'; sustituta: string }
  | { tipo: 'reprogramada'; cuandoNuevo: string }
  | { tipo: 'cancelada' };

/** El asunto vive junto al cuerpo: son la misma pieza de copy. */
export function asuntoAvisoAlumna(aviso: AvisoAlumna, claseNombre: string): string {
  switch (aviso.tipo) {
    case 'cubierta': return `Tu clase sigue en pie — ${claseNombre}`;
    case 'reprogramada': return `Cambio de horario — ${claseNombre}`;
    case 'cancelada': return `Clase cancelada — ${claseNombre}`;
  }
}

export interface PropsAvisoSustitucion {
  toName: string;
  claseNombre: string;
  cuando: string;
  aviso: AvisoAlumna;
  marca: MarcaCorreo;
}

export function correoAvisoSustitucion(p: PropsAvisoSustitucion): string {
  const comun = {
    marca: p.marca,
    detalle: { titulo: p.claseNombre, filas: [{ label: 'Cuándo', value: p.cuando }] },
    conPortada: false,
  };
  switch (p.aviso.tipo) {
    case 'cubierta':
      // Buena noticia: sin acento, va del color del estudio.
      return correoEstudio({
        ...comun,
        preheader: `${p.claseNombre} la dará ${p.aviso.sustituta}`,
        titular: 'Tu clase sigue en pie',
        parrafos: [`Hola ${p.toName}, tu clase del ${p.cuando} sigue en pie. La dará ${p.aviso.sustituta}. No tienes que hacer nada.`],
      });
    case 'reprogramada':
      return correoEstudio({
        ...comun,
        acento: ACENTO.aviso,
        preheader: `${p.claseNombre} pasa al ${p.aviso.cuandoNuevo}`,
        titular: 'Tu clase cambia de horario',
        detalle: { titulo: p.claseNombre, filas: [
          { label: 'Antes', value: p.cuando, tachado: true },
          { label: 'Ahora', value: p.aviso.cuandoNuevo },
        ] },
        parrafos: [`Hola ${p.toName}, tu clase cambia de horario. Tu plaza se mantiene — si el nuevo horario no te viene bien, puedes cancelarla desde tu app como siempre.`],
      });
    case 'cancelada':
      return correoEstudio({
        ...comun,
        acento: ACENTO.alerta,
        preheader: `${p.claseNombre} se cancela`,
        titular: 'Clase cancelada',
        detalle: { titulo: p.claseNombre, filas: [{ label: 'Cuándo', value: p.cuando, tachado: true }] },
        parrafos: [`Hola ${p.toName}, sentimos avisarte de que tu clase del ${p.cuando} se cancela. Disculpa las molestias — te esperamos en la próxima.`],
      });
  }
}

// ── Confirmación de asistencia (riesgo de plantón) ───────────────────────────

export interface PropsConfirmacion {
  toName: string;
  claseNombre: string;
  cuando: string;
  marca: MarcaCorreo;
  /** La página de confirmación (enlace firmado, sin login). */
  url?: string;
}

const NOTA_CORTE = 'Si no confirmas, liberaremos tu plaza para que otra persona pueda venir.';

function confirmacion(p: PropsConfirmacion, titular: string, preheader: string, parrafo: string): string {
  return correoEstudio({
    marca: p.marca,
    preheader,
    titular,
    parrafos: [`Hola ${p.toName}, ${parrafo}`],
    detalle: { titulo: p.claseNombre, filas: [{ label: 'Cuándo', value: p.cuando }] },
    boton: p.url ? { href: p.url, texto: 'Sí, voy a venir' } : null,
    conPortada: false,
    nota: NOTA_CORTE,
  });
}

export function correoPedirConfirmacion(p: PropsConfirmacion): string {
  // Un solo botón, sin vueltas: lo validado en las entrevistas del módulo es
  // que sea un toque, no un formulario.
  return confirmacion(p, '¿Sigues viniendo a tu clase?', `Confírmanos tu clase de ${p.claseNombre}`,
    '¿sigues viniendo a tu clase? Confírmanoslo en un toque.');
}

export function correoRecordatorioConfirmacion(p: PropsConfirmacion): string {
  // Reconoce que ya se avisó antes: repetir el mensaje como si fuera la primera
  // vez es lo que hace que el segundo correo se ignore igual que el primero.
  return confirmacion(p, '¿Nos falta tu confirmación?', `Todavía no hemos sabido de ti para ${p.claseNombre}`,
    'te escribimos ayer y todavía no hemos sabido de ti — por si se te pasó. ¿Sigues viniendo?');
}

export function correoPlazaLiberadaSinConfirmar(p: PropsConfirmacion): string {
  // Sin acento a propósito: el objetivo es que le sea fácil volver a reservar,
  // no que se sienta castigada. Un filete rojo aquí diría lo contrario.
  return correoEstudio({
    marca: p.marca,
    preheader: `Tu plaza en ${p.claseNombre} se ha liberado`,
    titular: 'Hemos liberado tu plaza',
    parrafos: [
      `Hola ${p.toName}, no hemos tenido confirmación para tu clase, así que hemos liberado tu plaza para que otra persona en lista de espera pueda venir.`,
      '¿Te apetece reservar otra clase? Estaremos encantadas de tenerte.',
    ],
    detalle: { titulo: p.claseNombre, filas: [{ label: 'Cuándo', value: p.cuando, tachado: true }] },
    boton: p.url ? { href: p.url, texto: 'Ver el horario' } : null,
    conPortada: false,
  });
}
