// «Ponlo en tu web»: todo lo que depende de CON QUÉ está hecha su web.
//
// La dueña contesta una vez «¿Con qué está hecha tu web?» y a partir de ahí el
// constructor le recomienda la forma de ponerlo, le explica por qué, apaga lo
// que no funcionaría en su web y le da los pasos de SU plataforma. Se guarda en
// `studios.widget_builder._web`, que nada fuera del panel lee: no cambia ni una
// letra del código que se copia.
//
// ⚠️ Los pasos de Wix y Squarespace están escritos con los nombres genéricos de
// sus menús y no se han comprobado en una cuenta real de cada una. Si alguno
// no casa, se corrige aquí: un paso falso es peor que ninguno.
//
// Sin imports de React ni de Next: lo leen tests de `node --test`.

import type { MetodoIntegracion, WidgetDisponible } from './catalogo.ts';
import type { ConfigConstructor } from './config.ts';

export type PlataformaWeb = 'wordpress' | 'wix' | 'squarespace' | 'webflow' | 'otra' | 'agencia' | 'sinweb';

export const PLATAFORMAS_WEB: readonly { id: PlataformaWeb; nombre: string; detalle?: string }[] = [
  { id: 'wordpress', nombre: 'WordPress' },
  { id: 'wix', nombre: 'Wix' },
  { id: 'squarespace', nombre: 'Squarespace' },
  { id: 'webflow', nombre: 'Webflow' },
  { id: 'otra', nombre: 'Otra o hecha a mano', detalle: 'HTML u otro programa' },
  { id: 'agencia', nombre: 'Me la lleva una agencia', detalle: 'O alguien de confianza' },
  { id: 'sinweb', nombre: 'Aún no tengo web', detalle: 'Solo Instagram o WhatsApp' },
];

export function nombrePlataforma(p: PlataformaWeb): string {
  return PLATAFORMAS_WEB.find(x => x.id === p)?.nombre ?? p;
}

/** Lo que el constructor recuerda de su web (`widget_builder._web`). */
export interface EstadoWeb {
  plataforma: PlataformaWeb | null;
  /** Solo el dominio (`miestudio.com`), para dibujar su web en la vista previa. */
  direccion: string | null;
}

export const WEB_SIN_CONTESTAR: EstadoWeb = { plataforma: null, direccion: null };

/**
 * «https://www.MiEstudio.com/horarios?x=1» → «www.miestudio.com». `null` si no
 * parece una dirección: se usa para dibujar, no para autorizar nada.
 */
export function direccionLegible(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const host = valor.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split(/[/?#\s]/)[0];
  if (!host || host.length > 253 || !/^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{1,5})?$/.test(host)) return null;
  return host;
}

/** `widget_builder._web` → estado válido. La basura cae a «sin contestar». */
export function leerWeb(raw: Record<string, unknown> | null | undefined): EstadoWeb {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)._web : null;
  if (!o || typeof o !== 'object') return { ...WEB_SIN_CONTESTAR };
  const w = o as Record<string, unknown>;
  // `html` era la pestaña del generador antes de preguntar por la plataforma.
  const p = w.plataforma === 'html' ? 'otra' : w.plataforma;
  return {
    plataforma: PLATAFORMAS_WEB.some(x => x.id === p) ? (p as PlataformaWeb) : null,
    direccion: direccionLegible(w.direccion),
  };
}

// ── La forma recomendada ──────────────────────────────────────────────────────

export interface Receta {
  recomendado: MetodoIntegracion;
  /** Por qué, en una frase y con el nombre de su web. */
  motivo: string;
  /** Formas que no funcionarían en su web, con el motivo. */
  desactivados: Partial<Record<MetodoIntegracion, string>>;
  /** Formas que funcionan con un cuidado. */
  avisos: Partial<Record<MetodoIntegracion, string>>;
}

const MOTIVO_POR_FORMA: Record<MetodoIntegracion, string> = {
  iframe: 'Va dentro de la página y se adapta sola a su alto: tus alumnas no salen de tu web.',
  nativa: 'Va dentro de la página, sin marco.',
  popup: 'Funciona mejor con un botón que se abre encima: quien viene por primera vez no sale de tu web.',
  boton: 'Un botón que lleva a tu página de reservas funciona en cualquier web.',
  enlace: 'Va mejor en un enlace: para un post, una story o tu newsletter.',
};

/** Qué forma se le recomienda a SU web para este widget, y por qué. */
export function receta(plataforma: PlataformaWeb | null, w: WidgetDisponible): Receta {
  const desactivados: Receta['desactivados'] = {};
  const avisos: Receta['avisos'] = {};
  // La integración sin marco no se recomienda nunca: exige autorizar el dominio
  // y es cosa de quien hace la web.
  let recomendado: MetodoIntegracion = w.metodos.find(m => m !== 'nativa') ?? w.metodos[0];
  let motivo = MOTIVO_POR_FORMA[recomendado];

  switch (plataforma) {
    case 'wordpress':
      if (recomendado === 'iframe') motivo = 'En WordPress va dentro de la página, con un bloque «HTML personalizado». Tus alumnas no salen de tu web.';
      break;
    case 'wix':
      // El «Insertar HTML» de Wix es una caja de alto fijo en su propio marco:
      // la ventana del popup se quedaría atrapada dentro, el alto no se ajusta
      // solo y la integración sin marco no ve el dominio de la web.
      desactivados.popup = 'En Wix, el código va dentro de una caja de alto fijo y la ventana se abriría dentro de ella.';
      desactivados.nativa = 'En Wix, el código va dentro de una caja aparte y la integración sin marco no puede funcionar.';
      avisos.iframe = 'Si lo pones dentro de la página, estira la caja de Wix hasta que quepa entero: si no, se cortará.';
      if (w.metodos.includes('boton')) {
        recomendado = 'boton';
        motivo = 'En Wix te recomendamos un botón de tu propia web con tu enlace: Wix mete el código en una caja de alto fijo y lo de dentro se cortaría. Y así el botón es igual que el resto de tu web.';
      }
      break;
    case 'squarespace':
      avisos.iframe = avisos.popup = 'Si tu plan de Squarespace no te deja añadir un bloque «Código», usa el botón que lleva a tu página o el enlace.';
      if (recomendado === 'iframe') motivo = 'En Squarespace va dentro de la página, con un bloque «Código».';
      break;
    case 'webflow':
      if (recomendado === 'iframe') motivo = 'En Webflow va dentro de la página, con un elemento «Code Embed». Solo se ve en la web publicada, no en el editor.';
      break;
    case 'agencia':
      motivo = `${MOTIVO_POR_FORMA[recomendado]} Elige cómo lo quieres y se lo mandas con los pasos.`;
      break;
    case 'sinweb':
      for (const m of ['iframe', 'nativa', 'popup', 'boton'] as const) desactivados[m] = 'Sin web no hay dónde pegarlo.';
      recomendado = 'enlace';
      motivo = 'Sin web, lo tuyo es el enlace: para la bio de Instagram, WhatsApp o tu newsletter.';
      break;
    default:
      break;
  }

  if (desactivados[recomendado] || !w.metodos.includes(recomendado)) {
    const otro = w.metodos.find(m => m !== 'nativa' && !desactivados[m]) ?? 'enlace';
    recomendado = otro;
    motivo = MOTIVO_POR_FORMA[otro];
  }
  return { recomendado, motivo, desactivados, avisos };
}

/**
 * La forma que se usa de verdad: la que eligió, si su web la admite; si no (o
 * si no eligió), la recomendada. Sin plataforma contestada es exactamente la
 * de siempre (la primera del catálogo).
 */
export function metodoEnWeb(c: Pick<ConfigConstructor, 'metodo'>, w: WidgetDisponible, plataforma: PlataformaWeb | null): MetodoIntegracion {
  const r = receta(plataforma, w);
  if (c.metodo && w.metodos.includes(c.metodo) && !r.desactivados[c.metodo]) return c.metodo;
  return r.recomendado;
}

/**
 * En estas plataformas, «un botón que lleva a tu página» se hace con el botón
 * de la propia web y nuestro enlace: queda igual que el resto de sus botones y
 * no hay nada que pegar en el código.
 */
export function usaBotonPropio(plataforma: PlataformaWeb | null): boolean {
  return plataforma === 'wordpress' || plataforma === 'wix' || plataforma === 'squarespace' || plataforma === 'webflow';
}

const BOTON_DE: Partial<Record<PlataformaWeb, string>> = {
  wordpress: 'el bloque «Botones» de WordPress',
  wix: 'un «Botón» de Wix',
  squarespace: 'un bloque «Botón» de Squarespace',
  webflow: 'un elemento «Button» de Webflow',
};

/** «el bloque «Botones» de WordPress», para decirle con qué hará su botón. */
export function botonDeSuWeb(plataforma: PlataformaWeb | null): string | null {
  return plataforma ? BOTON_DE[plataforma] ?? null : null;
}

// ── Los pasos ─────────────────────────────────────────────────────────────────

/** Los pasos para ponerlo, en SU plataforma. */
export function pasosEnTuWeb(plataforma: PlataformaWeb | null, metodo: MetodoIntegracion): string[] {
  if (metodo === 'enlace') {
    return [
      'Pulsa «Copiar enlace».',
      plataforma === 'sinweb'
        ? 'Pégalo en la bio de Instagram, en WhatsApp o en tu newsletter.'
        : 'Pégalo en la bio de Instagram, en WhatsApp, en tu newsletter o en cualquier botón de tu web.',
    ];
  }
  if (metodo === 'boton' && usaBotonPropio(plataforma)) {
    switch (plataforma) {
      case 'wordpress':
        return [
          'Abre la página donde lo quieres y añade un bloque «Botones».',
          'Escribe el texto (por ejemplo «Reservar clase»), pulsa el icono del enlace y pega tu enlace.',
          'Pulsa «Actualizar».',
        ];
      case 'wix':
        return [
          'En el editor de Wix, añade un botón donde lo quieras.',
          'Escribe el texto y, en su enlace, elige «Dirección web» y pega tu enlace.',
          'Publica tu web.',
        ];
      case 'squarespace':
        return [
          'Edita la página y añade un bloque «Botón».',
          'Escribe el texto y pega tu enlace como destino.',
          'Guarda y publica.',
        ];
      default:
        return [
          'Arrastra un elemento «Button» donde lo quieras.',
          'En sus ajustes de enlace, elige «URL» y pega tu enlace.',
          'Publica el sitio.',
        ];
    }
  }
  // El popup y la integración sin marco cargan un <script> aparte.
  const conScript = metodo === 'popup' || metodo === 'nativa';
  switch (plataforma) {
    case 'wordpress':
      return [
        'Abre la página donde lo quieres y añade un bloque «HTML personalizado».',
        'Pega el código y pulsa «Actualizar».',
        conScript
          ? 'Si no aparece, pega la línea <script …> en el pie de tu tema: algunos constructores de páginas no ejecutan scripts dentro de un bloque.'
          : 'Ábrelo en tu web publicada: en el editor no siempre se ve.',
      ];
    case 'wix':
      return [
        'En el editor de Wix, añade un elemento para insertar código HTML donde lo quieras.',
        'Pega el código y guarda.',
        metodo === 'iframe' ? 'Estira la caja hasta que quepa entero y publica tu web.' : 'Publica tu web.',
      ];
    case 'squarespace':
      return [
        'Edita la página y añade un bloque «Código» (no el de «Insertar»).',
        'Pega el código y guarda.',
        'Con la sesión abierta puede no verse: compruébalo en una ventana privada.',
      ];
    case 'webflow':
      return [
        'Arrastra un elemento «Code Embed» donde lo quieras.',
        'Pega el código y pulsa «Save & Close».',
        'Publica el sitio: en el editor no se ve, solo en la web publicada.',
      ];
    default:
      return [
        'Pega el código en el HTML de tu página, donde quieras que aparezca.',
        'Sube el cambio a tu web. No hace falta nada más.',
      ];
  }
}

/** La guía de la ayuda que mejor le sirve, como ruta del sitio. */
export function guiaDe(plataforma: PlataformaWeb | null, metodo: MetodoIntegracion): string {
  if (metodo === 'enlace' || metodo === 'boton') return '/ayuda/widget/que-es-el-widget';
  if (plataforma === 'wordpress') return '/ayuda/widget/instalar-en-wordpress';
  return '/ayuda/widget/instalar-con-html';
}

/**
 * El mensaje para quien le lleva la web: qué es, el código (o el enlace), los
 * pasos y la guía. Texto plano: va por correo, por WhatsApp o copiado.
 */
export function mensajeParaTuWeb(d: {
  estudio: string;
  queEs: string;
  forma: string;
  codigo: string;
  esEnlace: boolean;
  pasos: readonly string[];
  guia: string;
}): { asunto: string; cuerpo: string } {
  const pasos = d.pasos.map((p, i) => `${i + 1}. ${p}`).join('\n');
  return {
    asunto: `Para la web de ${d.estudio}: ${d.queEs.toLowerCase()}`,
    cuerpo: [
      `Hola, ¿puedes poner esto en la web de ${d.estudio}? Es ${d.queEs.toLowerCase()} de Tentare (${d.forma.toLowerCase()}).`,
      `${d.esEnlace ? 'El enlace' : 'El código'}:\n${d.codigo}`,
      `Pasos:\n${pasos}`,
      `Guía: ${d.guia}`,
      'Gracias.',
    ].join('\n\n'),
  };
}

// ── Dominios de la integración sin marco ─────────────────────────────────────

/**
 * Una web se abre casi siempre con y sin «www»: se autorizan las dos a la vez,
 * o la integración sin marco falla en silencio en la mitad de las visitas.
 * Solo se añade la pareja cuando es inequívoca (`dominio.tld` ↔ `www.dominio.tld`).
 */
export function origenesConYSinWww(origen: string): string[] {
  let u: URL;
  try { u = new URL(origen); } catch { return [origen]; }
  if (u.protocol !== 'https:') return [origen];
  const host = u.hostname;
  const puerto = u.port ? `:${u.port}` : '';
  if (host.startsWith('www.') && host.split('.').length >= 3) return [origen, `https://${host.slice(4)}${puerto}`];
  if (host.split('.').length === 2) return [origen, `https://www.${host}${puerto}`];
  return [origen];
}
