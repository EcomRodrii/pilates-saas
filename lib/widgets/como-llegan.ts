// «Tu web» v2 (decisión 2 del fundador, 15-oct-2026): en lugar de una etiqueta en
// cada tarjeta («Pegar el código otra vez / Con «Publicar en mi web» / Siempre al
// día») y del recuadro «Cómo llega cada cambio», UNA frase debajo de copiar, en
// «Ponlo en tu web». Lo que va dentro del código lo dicen además la línea del pie
// de «Dónde va» y la marca de «Ancho».
//
// Habla del código de AQUÍ, con las mismas reglas que el recuadro de siempre
// (`ComoLlegaCadaCambio`, components/widgets/paso-ponlo.tsx): lo que ya tenga
// pegado de antes lo dicen sus avisos.
//
// Sin imports de React ni de Next: lo leen tests de `node --test`.

import type { MetodoIntegracion } from './catalogo.ts';

export function fraseComoLlegan(x: {
  metodo: MetodoIntegracion;
  /** El código va por id (`codigoPorId`): lo que enseña llega al publicar. */
  porId: boolean;
  /** Le llega el estilo de tus widgets: sin un diseño propio en su código (`!tieneDisenoEnCodigo(c, metodo)`). */
  sigueElEstilo: boolean;
  /** El nombre del botón que publica, sin comillas. */
  boton: string;
}): string {
  // Un enlace o un botón a la página abren la página entera, que se ve como su app.
  if (x.metodo === 'enlace' || x.metodo === 'boton') {
    return 'Lo pegas una vez: tus clases, precios y plazas se actualizan solos, y tu página de reservas se ve siempre como tu app.';
  }
  const conPublicar: string[] = [];
  if (x.sigueElEstilo) conPublicar.push('el estilo');
  if (x.porId) conPublicar.push(x.sigueElEstilo ? 'lo que enseña' : 'lo que enseña y su diseño propio');
  const pegar = x.porId ? null : x.sigueElEstilo ? 'lo que enseña' : 'lo que enseña o su diseño propio';
  if (conPublicar.length === 0) {
    return `Lo pegas una vez: tus clases, precios y plazas se actualizan solos. Si cambias ${pegar}, tendrás que pegarlo otra vez.`;
  }
  const verbo = conPublicar.length > 1 || (x.porId && !x.sigueElEstilo) ? 'llegan' : 'llega';
  const publicar = `${conPublicar.join(' y ')} ${verbo} cuando pulsas «${x.boton}»`;
  return `Lo pegas una vez. Tus clases, precios y plazas se actualizan solos; ${publicar}.${pegar ? ` Si cambias ${pegar}, tendrás que pegarlo otra vez.` : ''}`;
}
