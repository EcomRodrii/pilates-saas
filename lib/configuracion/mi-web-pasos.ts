// «Mi web» guiada (maqueta aprobada por el fundador el 21-oct-2026, «Mi web — maqueta guiada»,
// hermana de la de «Mi app»). Los cinco pasos de tu página de reservas y de tu web, en orden, y lo que
// la propietaria pregunta antes de tocar nada:
//   · qué va primero y qué es imprescindible o opcional (`orden`, `peso`);
//   · dónde lo ve quien llega (`donde`) y cuándo le llega el cambio (`cuando`, `lineas`);
//   · si un cambio toca lo que ya tiene pegado en su web (`lineas` del paso 3, `nota`);
//   · si ha terminado (`hecho`, `estado`, y el progreso de arriba).
//
// Cuentan para el progreso los pasos 1 a 3 (imprescindible y recomendados). Ocultar la página y
// Network son opcionales: apagados está bien. Nada se inventa: cada estado sale de un dato que la
// página de reservas o los widgets usan de verdad, y lo que no se ha podido leer se dice así.
//
// Puro, sin `@/`: se prueba con `node --test`.

export type PesoPasoWeb = 'imprescindible' | 'recomendado' | 'opcional';
export type TonoEstadoWeb = 'hecho' | 'falta' | 'nada';
export type IdPasoMiWeb = 'direccion' | 'presentacion' | 'widgets' | 'quien-la-ve' | 'network';

export interface DatosMiWeb {
  /** «tentare.app/reservar/mi-estudio». `null`: sin dirección. */
  direccion: string | null;
  /** Hay texto en «Cómo te presentas». */
  descripcion: boolean;
  /**
   * Lo copiado desde aquí para su web. `null`: aún no se sabe.
   * `aviso`: el único aviso de la primera fila que tiene uno (el mismo orden que la portada de widgets).
   */
  widgets: { nombres: readonly string[]; aviso: string | null } | null;
  /** `null`: no se ha podido leer (o aún no). */
  pagina: { oculta: boolean; tieneClave: boolean } | null;
  /** `null`: aún no se sabe. */
  network: boolean | null;
}

export interface LineaCuando { que: string; cuando: string }

export interface PasoMiWeb {
  id: IdPasoMiWeb;
  orden: number;
  titulo: string;
  peso: PesoPasoWeb;
  porque: string;
  donde: string;
  cuando: string;
  /** Cuándo llega cada clase de cambio (solo el paso de los widgets). */
  lineas?: readonly LineaCuando[];
  estado: string;
  tono: TonoEstadoWeb;
  hecho: boolean;
  /** Lo que conviene saber antes de tocarlo. */
  nota?: string;
}

export const ETIQUETA_PESO_WEB: Record<PesoPasoWeb, string> = {
  imprescindible: 'Imprescindible',
  recomendado: 'Recomendado',
  opcional: 'Opcional',
};

/** Cuándo llega a su web cada clase de cambio en un widget (lib/widgets/como-llegan.ts, en corto). */
export const CUANDO_LLEGA_A_TU_WEB: readonly LineaCuando[] = [
  { que: 'Clases, precios y plazas', cuando: 'Solos, siempre. No tienes que hacer nada.' },
  { que: 'El estilo y lo que enseña', cuando: 'Cuando pulsas «Publicar en mi web». No hay que volver a pegar nada.' },
  { que: 'Un código de antes', cuando: 'Hay que pegarlo otra vez, una sola vez. Te lo decimos en su fila, con su botón.' },
];

function unirNombres(xs: readonly string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`;
}

function estadoWidgets(w: DatosMiWeb['widgets']): { estado: string; tono: TonoEstadoWeb; hecho: boolean } {
  if (!w) return { estado: 'Mirando lo que tienes en tu web…', tono: 'nada', hecho: false };
  if (w.nombres.length === 0) return { estado: 'Aún no has puesto nada en tu web', tono: 'falta', hecho: false };
  const que = `Lo que has puesto desde aquí: ${unirNombres(w.nombres)}`;
  return w.aviso
    ? { estado: `${que} · ${w.aviso}`, tono: 'falta', hecho: true }
    : { estado: que, tono: 'hecho', hecho: true };
}

function estadoPagina(p: DatosMiWeb['pagina']): { estado: string; tono: TonoEstadoWeb } {
  if (!p) return { estado: 'No hemos podido ver si está visible', tono: 'nada' };
  if (!p.oculta) return { estado: 'Visible para todo el mundo', tono: 'hecho' };
  return { estado: p.tieneClave ? 'Oculta: solo entra quien tenga la clave' : 'Oculta: no entra nadie', tono: 'falta' };
}

export function pasosMiWeb(d: DatosMiWeb): PasoMiWeb[] {
  const w = estadoWidgets(d.widgets);
  const pagina = estadoPagina(d.pagina);
  return [
    {
      id: 'direccion', orden: 1, titulo: 'Tu dirección y tus enlaces', peso: 'imprescindible',
      porque: 'Es la dirección de tu estudio en Tentare: la app de tus alumnas (lo que compartes en Instagram o en la puerta), tu página de reservas (la que se integra en tu web) y tus widgets cuelgan de ella. Aquí tienes también el enlace y el QR de tu web.',
      donde: 'La barra del navegador, el QR impreso y cada enlace que compartes o pegas en tu web',
      cuando: 'Al guardar. La de antes sigue llevando aquí',
      estado: d.direccion ? d.direccion : 'Tu estudio aún no tiene dirección de reservas',
      tono: d.direccion ? 'hecho' : 'falta',
      hecho: !!d.direccion,
      nota: 'Si la cambias, lo que ya imprimiste, compartiste o pegaste en tu web sigue funcionando: la dirección de antes lleva a la nueva.',
    },
    {
      id: 'presentacion', orden: 2, titulo: 'Cómo te presentas', peso: 'recomendado',
      porque: 'Dos o tres frases para quien aún no te conoce: qué tipo de estudio eres y para quién. Sin ellas, «El estudio» sale sin presentación.',
      donde: '«El estudio» en tu página de reservas y tu ficha en Tentare Network',
      cuando: 'Al momento, al guardar',
      estado: d.descripcion ? 'Ya te presentas' : 'Falta: aún no te has presentado',
      tono: d.descripcion ? 'hecho' : 'falta',
      hecho: d.descripcion,
      nota: 'No sale en la app de tus alumnas. Tu lema sigue en Mi app.',
    },
    {
      id: 'widgets', orden: 3, titulo: 'Ponla en tu web: tus widgets', peso: 'recomendado',
      porque: 'Tu horario, tus precios, tu clase de prueba o tu formulario de contacto dentro de tu propia web, para que reserven sin salir de ella. Cuatro pasos: qué pones, dónde va, cómo se ve y ponlo en tu web.',
      donde: 'Dentro de tu propia web',
      cuando: 'Depende de qué cambies:',
      lineas: CUANDO_LLEGA_A_TU_WEB,
      ...w,
    },
    {
      id: 'quien-la-ve', orden: 4, titulo: 'Quién ve tu página', peso: 'opcional',
      porque: 'Solo si aún la estás preparando: la escondes y enseña «Estamos preparando esta página». Nadie reserva, compra ni se da de alta desde fuera; con una clave, entra quien tú quieras.',
      donde: 'Tu página, la app de tus alumnas y los widgets que ya tienes pegados',
      cuando: 'Al momento, al guardar, también en lo que ya tienes pegado en tu web',
      ...pagina,
      // Visible es lo normal: no hay nada que hacer.
      hecho: d.pagina ? !d.pagina.oculta : false,
      nota: 'Al ocultarla, Google deja de enseñarla y en Tentare Network sigues saliendo, pero tu enlace lleva al aviso. Si cambias la clave, quien ya había entrado se queda fuera.',
    },
    {
      id: 'network', orden: 5, titulo: 'Aparecer en Tentare Network', peso: 'opcional',
      porque: 'Tu estudio sale en el buscador de estudios de Tentare, delante de gente que aún no te conoce. Apagado de serie.',
      donde: 'El buscador de estudios de Tentare',
      cuando: 'Al tocar el interruptor',
      estado: d.network === null ? 'Mirando si apareces…' : d.network ? 'Apareces' : 'No apareces',
      tono: d.network ? 'hecho' : 'nada',
      hecho: d.network === true,
      nota: 'Aunque ocultes tu página, seguirás saliendo en Tentare Network.',
    },
  ];
}

/** Lo que cuenta para «¿me falta algo?»: lo imprescindible y lo recomendado. */
const CUENTAN: readonly IdPasoMiWeb[] = ['direccion', 'presentacion', 'widgets'];

export function progresoMiWeb(pasos: readonly PasoMiWeb[], d: Pick<DatosMiWeb, 'direccion' | 'pagina'>): {
  hechos: number; total: number; titulo: string; frase: string;
} {
  const cuentan = pasos.filter(p => CUENTAN.includes(p.id));
  const hechos = cuentan.filter(p => p.hecho).length;
  const oculta = d.pagina?.oculta === true;
  const titulo = !d.direccion
    ? 'Tu página aún no tiene dirección'
    : oculta ? 'Tu página está oculta: nadie reserva desde fuera'
    : 'Tu página ya recibe reservas';
  const faltan = cuentan.filter(p => !p.hecho).map(p => p.titulo.toLowerCase());
  const conAviso = pasos.find(p => p.id === 'widgets' && p.hecho && p.tono === 'falta');
  const partes: string[] = [];
  if (!d.direccion) partes.push('Sin dirección no hay página de reservas ni widgets: empieza por el paso 1.');
  else if (faltan.length === 0 && !conAviso) partes.push('Está todo lo que hace falta. Lo demás es opcional.');
  else {
    if (faltan.length) partes.push(`Te falta: ${unirNombres(faltan)}.`);
    if (conAviso) partes.push('Tus widgets tienen un aviso: míralo en el paso 3.');
  }
  return { hechos, total: cuentan.length, titulo, frase: partes.join(' ') };
}
