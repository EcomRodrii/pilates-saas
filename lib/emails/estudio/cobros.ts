// Los dos correos de dinero que recibe una alumna: el justificante de un pago
// que ha salido bien y el aviso de uno que no.
//
// Ninguno lleva foto de portada, a propósito: una foto grande y luminosa encima
// de «no hemos podido cobrar tu cuota» se lee como una broma, y un justificante
// de pago es un documento, no una postal. El filete de color hace el aviso.

import { correoEstudio, correoEstudioLibre, type MarcaCorreo } from './plantilla.ts';
import { ACENTO } from './paleta.ts';
import { marcaConPersonalizacion, botonConPersonalizacion, type PersonalizacionCorreo } from './clase.ts';
import { formatEuro } from '../../utils.ts';

export interface PropsImpago {
  socioNombre: string;
  concepto: string;
  importe: number;
  /**
   * `true` = ya se han agotado los reintentos y hace falta que haga algo;
   * `false` = primer fallo, se reintenta solo. Cambia el tono, el titular y el
   * color del filete: decirle «no hagas nada» cuando ya no hay más intentos es
   * como no avisarla.
   */
  definitivo: boolean;
  marca: MarcaCorreo;
  intro?: string | null;
  personalizacion?: PersonalizacionCorreo | null;
}

export function correoImpago(p: PropsImpago): string {
  const base = {
    marca: marcaConPersonalizacion(p.marca, p.personalizacion),
    detalle: { filas: [
      { label: 'Concepto', value: p.concepto },
      { label: 'Importe', value: formatEuro(p.importe), destacado: true },
    ] },
    boton: botonConPersonalizacion(null, p.personalizacion),
    pie: p.personalizacion?.pie ?? null,
    conPortada: p.personalizacion?.mostrarPortada ?? false,
    acento: p.definitivo ? ACENTO.alerta : ACENTO.aviso,
  };
  const cuerpo = p.definitivo
    ? 'hemos intentado cobrar tu cuota varias veces y no ha sido posible. Ponte en contacto con el estudio para regularizar el pago y no perder tu plaza.'
    : 'hemos intentado cobrar tu cuota y el pago no se ha completado. Lo volveremos a intentar automáticamente en los próximos días — no tienes que hacer nada, pero revisa que tu método de pago esté al día.';
  const preheader = (p.intro?.trim() || cuerpo).slice(0, 90);
  if (p.personalizacion?.cuerpo) {
    return correoEstudioLibre({ ...base, preheader, titular: '', cuerpo: p.personalizacion.cuerpo });
  }
  return correoEstudio({
    ...base,
    preheader,
    titular: p.definitivo ? 'No hemos podido cobrar tu cuota' : 'Problema con tu pago',
    parrafos: [p.intro?.trim() || `Hola ${p.socioNombre}, ${cuerpo}`],
    nota: p.definitivo
      ? 'Si ya lo has resuelto o crees que es un error, avísanos y lo revisamos.'
      : 'Si tu tarjeta o cuenta bancaria ha cambiado, actualízala con el estudio para evitar más incidencias.',
  });
}

export interface PropsRecibo {
  socioNombre: string;
  concepto: string;
  importe: number;
  /** ISO. Se formatea aquí para que el emisor no tenga que saber el formato. */
  fechaCobro: string;
  numeroFactura?: string | null;
  marca: MarcaCorreo;
  /** «Mis compras» en su app, donde puede ver y descargar la factura. */
  url?: string | null;
}

/**
 * ⚠️ El justificante de pago NO es personalizable, igual que antes: su contenido
 * es fiscal. Lo que sí cambia es que ahora se ve como el resto de los correos
 * del estudio.
 */
export function correoRecibo(p: PropsRecibo): string {
  const fecha = new Date(p.fechaCobro).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  return correoEstudio({
    marca: p.marca,
    preheader: `Hemos recibido tu pago de ${formatEuro(p.importe)}`,
    titular: 'Pago confirmado',
    parrafos: [`Hola ${p.socioNombre}, hemos recibido tu pago correctamente.`],
    detalle: {
      filas: [
        { label: 'Concepto', value: p.concepto },
        { label: 'Importe', value: formatEuro(p.importe), destacado: true },
        { label: 'Fecha', value: fecha },
        ...(p.numeroFactura ? [{ label: 'Nº factura', value: p.numeroFactura }] : []),
      ],
    },
    boton: p.url ? { href: p.url, texto: 'Ver mi factura' } : null,
    conPortada: false,
    acento: ACENTO.bien,
  });
}
