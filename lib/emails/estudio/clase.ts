// Los dos correos de clase que más veces recibe una alumna: la confirmación de
// su reserva y el recordatorio del día antes. Aquí solo se decide QUÉ dice cada
// uno; cómo se ve lo pone `correoEstudio` (lib/emails/estudio/plantilla.ts).

import { correoEstudio, correoEstudioLibre, type MarcaCorreo, type FilaDetalle, type PersonalizacionCorreo } from './plantilla.ts';

export type { PersonalizacionCorreo };
import { ACENTO } from './paleta.ts';

export interface PropsClase {
  socioNombre: string;
  claseNombre: string;
  fecha: string;
  hora: string;
  sala: string;
  instructor: string;
  marca: MarcaCorreo;
  /** Primer párrafo escrito por la propietaria. Ausente = el de fábrica. */
  intro?: string | null;
  personalizacion?: PersonalizacionCorreo | null;
  /** Solo si el tipo de clase es online y ya hay reunión creada (lib/zoom-sync.ts). */
  zoomJoinUrl?: string | null;
  /**
   * A dónde lleva el botón: la app de la alumna en su estudio
   * (`urlAppSocia`). Ausente = el correo no lleva botón, que es mejor que uno
   * que no lleva a ninguna parte.
   */
  url?: string | null;
}

function filas(p: PropsClase): FilaDetalle[] {
  return [
    { label: 'Fecha', value: p.fecha },
    { label: 'Hora', value: p.hora },
    { label: 'Sala', value: p.sala },
    { label: 'Instructora', value: p.instructor },
    ...(p.zoomJoinUrl ? [{ label: 'Enlace de Zoom', value: p.zoomJoinUrl }] : []),
  ];
}

/**
 * La personalización manda sobre la marca del estudio, no al revés: si la
 * propietaria eligió un color para ESTA plantilla, es el que quiere ver aquí.
 * Y si eligió el de la cabecera pero no el del botón, el botón la sigue — quien
 * pone un color espera que el correo entero vaya de ese color.
 */
export function marcaConPersonalizacion(marca: MarcaCorreo, z?: PersonalizacionCorreo | null): MarcaCorreo {
  if (!z) return marca;
  return {
    ...marca,
    ...(z.logoUrl ? { logoUrl: z.logoUrl } : {}),
    ...(z.portadaUrl ? { portadaUrl: z.portadaUrl } : {}),
    ...(z.colorCabecera ? { colorPrimario: z.colorCabecera } : {}),
    // Al botón como elección explícita, no como «secundario»: un secundario
    // casi blanco se toma por fondo (paleta.ts), y aquí la propietaria ha dicho
    // que ese es el color de su botón.
    ...(z.colorBoton || z.colorCabecera ? { colorBoton: z.colorBoton || z.colorCabecera } : {}),
    ...(z.fuente ? { fuente: z.fuente } : {}),
  };
}

function comun(p: PropsClase, boton: { href: string; texto: string } | null) {
  return {
    marca: marcaConPersonalizacion(p.marca, p.personalizacion),
    detalle: { titulo: p.claseNombre, filas: filas(p) },
    boton: botonConPersonalizacion(boton, p.personalizacion),
    pie: p.personalizacion?.pie ?? null,
    conPortada: p.personalizacion?.mostrarPortada ?? true,
    firma: `Nos vemos en el estudio — ${p.marca.estudioNombre}`,
  };
}

/**
 * El botón, con lo que haya elegido la propietaria para ESTA plantilla.
 *
 * ⚠️ Un `botonUrl` suyo puede crear un botón donde la plantilla no tenía
 * ninguno —es justo lo que pide quien quiere mandar a su alumna a su web— pero
 * solo si además le pone texto: un botón sin texto es un rectángulo de color.
 */
export function botonConPersonalizacion(
  boton: { href: string; texto: string } | null,
  z?: PersonalizacionCorreo | null,
): { href: string; texto: string } | null {
  const href = z?.botonUrl?.trim() || boton?.href;
  const texto = z?.botonTexto?.trim() || boton?.texto;
  return href && texto ? { href, texto } : null;
}

export function correoReserva(p: PropsClase): string {
  const base = comun(p, p.url ? { href: p.url, texto: 'Ver mis clases' } : null);
  const preheader = `Tu plaza en ${p.claseNombre} está confirmada`;
  if (p.personalizacion?.cuerpo) {
    return correoEstudioLibre({ ...base, preheader, titular: '', cuerpo: p.personalizacion.cuerpo });
  }
  return correoEstudio({
    ...base,
    preheader,
    titular: 'Tu plaza está reservada',
    parrafos: [p.intro?.trim() || `Hola ${p.socioNombre}, ya tienes sitio en ${p.claseNombre}. Aquí tienes los detalles.`],
    nota: 'Si al final no puedes venir, cancela tu plaza con antelación para que otra persona pueda aprovecharla.',
  });
}

export function correoRecordatorio(p: PropsClase): string {
  const base = comun(p, p.url ? { href: p.url, texto: 'Ver mis clases' } : null);
  const preheader = `Te esperamos en ${p.claseNombre}`;
  if (p.personalizacion?.cuerpo) {
    return correoEstudioLibre({ ...base, preheader, titular: '', cuerpo: p.personalizacion.cuerpo });
  }
  return correoEstudio({
    ...base,
    preheader,
    titular: 'Te esperamos mañana',
    parrafos: [p.intro?.trim() || `Hola ${p.socioNombre}, un recordatorio de tu próxima clase.`],
    nota: 'Si no puedes asistir, cancela tu plaza con antelación para que otra persona pueda aprovecharla.',
  });
}

export function correoCancelacionClase(p: PropsClase & { bonoDevuelto?: boolean }): string {
  // Sin portada a propósito: una foto grande y luminosa encima de «tu clase se
  // ha cancelado» se lee como una broma. El filete rojo hace el aviso.
  const base = { ...comun(p, null), conPortada: p.personalizacion?.mostrarPortada ?? false, acento: ACENTO.alerta };
  const preheader = `${p.claseNombre} se ha cancelado`;
  if (p.personalizacion?.cuerpo) {
    return correoEstudioLibre({ ...base, preheader, titular: '', cuerpo: p.personalizacion.cuerpo });
  }
  return correoEstudio({
    ...base,
    preheader,
    titular: 'Tu clase se ha cancelado',
    parrafos: [
      p.intro?.trim() || `Hola ${p.socioNombre}, lamentamos avisarte de que esta clase se ha cancelado. No hace falta que te presentes.`,
      p.bonoDevuelto ? 'Te hemos devuelto la sesión a tu bono: puedes reservar otra clase cuando quieras.' : null,
    ],
    // Fecha y hora tachadas: es lo que de un vistazo dice «esto ya no existe».
    detalle: { titulo: p.claseNombre, filas: filas(p).map(f => (f.label === 'Fecha' || f.label === 'Hora' ? { ...f, tachado: true } : f)) },
    nota: 'Disculpa las molestias. Reserva otra clase desde tu app cuando te venga bien.',
  });
}

export function correoPlazaLiberada(p: PropsClase & { bonoConsumido?: boolean }): string {
  const base = { ...comun(p, p.url ? { href: p.url, texto: 'Ver mis clases' } : null), acento: ACENTO.bien };
  const preheader = `Tu plaza en ${p.claseNombre} ya está confirmada`;
  if (p.personalizacion?.cuerpo) {
    return correoEstudioLibre({ ...base, preheader, titular: '', cuerpo: p.personalizacion.cuerpo });
  }
  return correoEstudio({
    ...base,
    preheader,
    titular: 'Se ha liberado tu plaza',
    parrafos: [
      p.intro?.trim() || `Hola ${p.socioNombre}, estabas en lista de espera y ha quedado un sitio libre. Tu reserva ya está confirmada.`,
      // Nunca se le descuenta una sesión sin decírselo.
      p.bonoConsumido ? 'Se ha descontado una sesión de tu bono para confirmar esta plaza.' : null,
    ],
    nota: 'Si ya no puedes asistir, cancela tu plaza cuanto antes para dejársela a otra persona.',
  });
}
