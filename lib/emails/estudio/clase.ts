// Los dos correos de clase que más veces recibe una alumna: la confirmación de
// su reserva y el recordatorio del día antes. Aquí solo se decide QUÉ dice cada
// uno; cómo se ve lo pone `correoEstudio` (lib/emails/estudio/plantilla.ts).

import { correoEstudio, correoEstudioLibre, type MarcaCorreo, type FilaDetalle } from './plantilla.ts';

/** Lo que la propietaria ha personalizado de esta plantilla (`plantillas_email`). */
export interface PersonalizacionCorreo {
  cuerpo?: string;
  botonTexto?: string;
  colorCabecera?: string;
  colorBoton?: string;
  logoUrl?: string;
  pie?: string;
  fuente?: string;
}

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
function marcaConPersonalizacion(p: PropsClase): MarcaCorreo {
  const z = p.personalizacion;
  if (!z) return p.marca;
  return {
    ...p.marca,
    ...(z.logoUrl ? { logoUrl: z.logoUrl } : {}),
    ...(z.colorCabecera ? { colorPrimario: z.colorCabecera } : {}),
    ...(z.colorBoton ? { colorSecundario: z.colorBoton } : z.colorCabecera ? { colorSecundario: z.colorCabecera } : {}),
    ...(z.fuente ? { fuente: z.fuente } : {}),
  };
}

function comun(p: PropsClase, boton: { href: string; texto: string } | null) {
  return {
    marca: marcaConPersonalizacion(p),
    detalle: { titulo: p.claseNombre, filas: filas(p) },
    boton: boton && { href: boton.href, texto: p.personalizacion?.botonTexto || boton.texto },
    pie: p.personalizacion?.pie ?? null,
    conPortada: true,
    firma: `Nos vemos en el estudio — ${p.marca.estudioNombre}`,
  };
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
