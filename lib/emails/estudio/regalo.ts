// Tarjeta regalo: el correo a quien la recibe y el justificante de quien la compra.
// Marca del ESTUDIO (nunca la de Tentare) y sin Tenti. Todo texto de persona va por
// `correoEstudio`, que lo escapa.
import { correoEstudio, type MarcaCorreo } from './plantilla.ts';

export interface DatosCorreoRegalo {
  marca: MarcaCorreo;
  codigo: string;
  importeTexto: string;
  caducaTexto: string;
  compradorNombre: string;
  destinatarioNombre: string;
  mensaje?: string | null;
  /** Enlace a la app del estudio donde se canjea. */
  urlCanje?: string | null;
  terminos?: string | null;
}

/** Para quien recibe el regalo. */
export function correoRegaloDestinataria(p: DatosCorreoRegalo): string {
  const estudio = p.marca.estudioNombre;
  return correoEstudio({
    marca: p.marca,
    preheader: `${p.compradorNombre} te regala una tarjeta de ${p.importeTexto} para ${estudio}.`,
    titular: `${p.compradorNombre} te ha hecho un regalo`,
    parrafos: [
      `Hola ${p.destinatarioNombre}, ${p.compradorNombre} te regala una tarjeta de ${p.importeTexto} para usar en ${estudio}.`,
      p.mensaje ? `«${p.mensaje}»` : null,
      'Para canjearla, entra en la app del estudio, abre tu perfil y escribe el código. También puedes dárselo al equipo en recepción. El saldo se puede gastar en varias veces.',
    ],
    detalle: { filas: [
      { label: 'Código', value: p.codigo, destacado: true },
      { label: 'Saldo', value: p.importeTexto },
      { label: 'Válida hasta', value: p.caducaTexto },
    ] },
    boton: p.urlCanje ? { href: p.urlCanje, texto: 'Canjear mi regalo' } : null,
    nota: p.terminos ?? 'Guarda este correo: el código es la llave de la tarjeta y quien lo tenga puede usarla.',
    conPortada: false,
    firma: `El equipo de ${estudio}`,
  });
}

/** Justificante para quien compra (no lleva el código si el regalo se envía directamente a otra persona). */
export function correoRegaloJustificante(p: Omit<DatosCorreoRegalo, 'mensaje' | 'urlCanje'> & { destinatarioEmail: string }): string {
  const estudio = p.marca.estudioNombre;
  return correoEstudio({
    marca: p.marca,
    preheader: `Hemos enviado tu regalo a ${p.destinatarioNombre}.`,
    titular: 'Tu regalo está en camino',
    parrafos: [
      `Gracias por tu compra. Hemos enviado la tarjeta regalo de ${p.importeTexto} a ${p.destinatarioNombre} (${p.destinatarioEmail}).`,
      'Te dejamos aquí el código por si prefieres dárselo en mano o imprimir este correo.',
    ],
    detalle: { filas: [
      { label: 'Código', value: p.codigo, destacado: true },
      { label: 'Importe', value: p.importeTexto },
      { label: 'Válida hasta', value: p.caducaTexto },
    ] },
    nota: p.terminos ?? 'Este correo no es una factura. Si necesitas una, pídesela al estudio.',
    conPortada: false,
    firma: `El equipo de ${estudio}`,
  });
}
