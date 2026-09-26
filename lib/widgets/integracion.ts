// Tentare Widgets — el código que se copia.
//
// Funciones puras: widget + config → el texto EXACTO que la propietaria pega en
// su web. Lo que genera aquí es lo que el motor lee de verdad:
//  - la URL del iframe/popup la lee app/reservar/[slug]/page.tsx con
//    `resolverConfigWidget` + `resolverApariencia` (mismo vocabulario de
//    siempre: un snippet ya pegado sigue funcionando igual);
//  - los `data-*` de la integración nativa los lee app/widget-bundle/main.tsx;
//  - `data-tentare-popup` lo lee app/widget-bundle/popup.ts.
//
// ⚠️ Un default NO se emite (contrato del constructor desde 2026-08-20): sin
// tocar nada, el código se comporta exactamente como el widget de siempre. La
// única excepción es la etiqueta de seguimiento (`ref`), que no cambia nada
// de lo que se ve y es lo que permite medir cada widget por separado.
//
// Las plataformas (HTML, WordPress, Webflow, React) solo existen donde la
// diferencia es real: en WordPress y Webflow el código es el MISMO que en HTML
// y lo que cambia son los pasos; en React sí cambia el código.

import { luminancia } from '../reservar/apariencia-widget.ts';
import { COLOR_VALIDO, fuenteValida } from '../reservar/config-widget.ts';
import { scriptSnippetIframe } from '../reservar/snippet-embed.ts';
import type { MetodoIntegracion, WidgetDisponible } from './catalogo.ts';
import {
  anchoPorDefecto, etiquetaEfectiva, textoBotonEfectivo, type ConfigConstructor,
} from './config.ts';

export type Plataforma = 'html' | 'wordpress' | 'webflow' | 'react';

export const PLATAFORMAS: Record<Plataforma, string> = {
  html: 'HTML', wordpress: 'WordPress', webflow: 'Webflow', react: 'React',
};

export interface EntradaIntegracion {
  widget: WidgetDisponible;
  config: ConfigConstructor;
  /** Origen de Tentare (el de `LEGAL.url` en producción). */
  origen: string;
  slug: string;
  /** El color de marca del estudio, para botones con su identidad. */
  colorEstudio?: string | null;
}

const COLOR_POR_DEFECTO = '#343825';

// ── Parámetros ────────────────────────────────────────────────────────────────

const color = (v: string | null) => (v && COLOR_VALIDO.test(v) ? v : null);
const familia = (v: string | null) => (v && fuenteValida(v) ? v.trim() : null);

/** Pares `[nombre, valor]` ya validados; `encodeURIComponent` se aplica al unir. */
type Par = [string, string];

function paresContenido(e: EntradaIntegracion, metodo: MetodoIntegracion): Par[] {
  const { widget: w, config: c } = e;
  const p: Par[] = [];
  if (w.contenido.includes('horario')) {
    if (c.vista === 'hoy') p.push(['vista', 'hoy']);
    if (c.tipos.length) p.push(['tipos', c.tipos.join(',')]);
    if (c.instructoras.length) p.push(['instructoras', c.instructoras.join(',')]);
    if (c.salas.length) p.push(['salas', c.salas.join(',')]);
    if (!c.mostrarPrecio) p.push(['ocultar-precio', '1']);
    if (!c.mostrarNivel) p.push(['ocultar-nivel', '1']);
    if (!c.mostrarSustituta) p.push(['ocultar-sustituta', '1']);
    // El default del iframe es 'completo'; el de la nativa, 'ligero'.
    const defecto = metodo === 'nativa' ? 'ligero' : 'completo';
    if (c.diseno && c.diseno !== defecto) p.push(['diseno', c.diseno]);
  }
  const tiposPlan = w.tiposPlanFijos ?? (w.contenido.includes('tiposPlan') ? c.tiposPlan : []);
  if (tiposPlan.length) p.push(['planes', tiposPlan.join(',')]);
  return p;
}

function paresDiseno(c: ConfigConstructor): Par[] {
  if (c.identidad !== 'propia') return [];
  const p: Par[] = [];
  const marca = color(c.marca);
  if (marca) p.push(['marca', marca]);
  if (c.fondo === 'transparente') p.push(['fondo', 'transparente']);
  else if (color(c.fondo)) p.push(['fondo', c.fondo!]);
  const tinta = color(c.tinta);
  if (tinta) p.push(['tinta', tinta]);
  const superficie = color(c.superficie);
  if (superficie) p.push(['superficie', superficie]);
  const linea = color(c.linea);
  if (linea) p.push(['linea', linea]);
  // «Tema claro» = para una web clara = letra OSCURA. El parámetro del motor
  // se llama por el color del texto (`texto`), no por el del tema.
  if (c.tema === 'claro') p.push(['texto', 'oscuro']);
  if (c.tema === 'oscuro') p.push(['texto', 'claro']);
  if (c.forma) p.push(['forma', c.forma]);
  if (c.densidad) p.push(['densidad', c.densidad]);
  const fuente = familia(c.fuente);
  if (fuente) p.push(['fuente', fuente]);
  const fuenteDisplay = familia(c.fuenteDisplay);
  if (fuenteDisplay) p.push(['fuente-display', fuenteDisplay]);
  return p;
}

// Las listas de ids (`tipos=a,b`) se dejan con la coma a la vista: los ids ya
// vienen filtrados a letras/números/guiones y así el código se puede leer.
function unir(pares: Par[]): string {
  return pares
    .map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%2C/g, ',')}`)
    .join('&');
}

/** La pestaña del motor para este widget y esta config. */
function tabEmbebido(e: EntradaIntegracion): string {
  if (e.widget.contenido.includes('cuentaInicio')) return e.config.cuentaInicio === 'bonos' ? 'cuenta' : 'misreservas';
  return e.widget.embebido.tab;
}

/** La URL del widget incrustado (iframe y popup). */
export function urlEmbebido(e: EntradaIntegracion, metodo: MetodoIntegracion = 'iframe'): string {
  const { widget: w, config: c } = e;
  const pares: Par[] = [['embed', '1'], ['tab', tabEmbebido(e)]];
  for (const [k, v] of Object.entries(w.embebido.extra ?? {})) pares.push([k, v]);
  if (w.contenido.includes('sesion') && c.sesion) pares.push(['sesion', c.sesion]);
  pares.push(...paresContenido(e, metodo), ...paresDiseno(c));
  if (!c.mostrarPie) pares.push(['pie', '0']);
  const ref = etiquetaEfectiva(c, w);
  if (ref) pares.push(['ref', ref]);
  return `${e.origen}/reservar/${e.slug}?${unir(pares)}`;
}

/**
 * La página de reservas COMPLETA (enlace y botón). Los filtros y el diseño del
 * widget NO viajan aquí: la página completa es el portal del estudio con su
 * propia apariencia, y el motor solo los lee en modo incrustado.
 */
export function urlPagina(e: EntradaIntegracion): string {
  const { widget: w, config: c } = e;
  const pares: Par[] = [];
  const tab = w.contenido.includes('cuentaInicio')
    ? (c.cuentaInicio === 'bonos' ? 'cuenta' : 'misreservas')
    : w.pagina.tab;
  if (tab && tab !== 'clases') pares.push(['tab', tab]);
  for (const [k, v] of Object.entries(w.pagina.extra ?? {})) pares.push([k, v]);
  if (w.contenido.includes('sesion') && c.sesion) pares.push(['sesion', c.sesion]);
  const ref = etiquetaEfectiva(c, w);
  if (ref) pares.push(['ref', ref]);
  const query = pares.length ? `?${unir(pares)}` : '';
  const ancla = w.pagina.ancla ? `#${w.pagina.ancla}` : '';
  return `${e.origen}/reservar/${e.slug}${query}${ancla}`;
}

/**
 * La misma URL marcada como vista previa del panel (`vista-previa=1`): la
 * página no cuenta la visita (lib/reservar/eventos.ts). Solo para el panel —
 * nunca entra en el código que se copia.
 */
export function conVistaPrevia(url: string): string {
  const [sinAncla, ancla] = url.split('#');
  return `${sinAncla}${sinAncla.includes('?') ? '&' : '?'}vista-previa=1${ancla ? `#${ancla}` : ''}`;
}

/** Atributos `data-*` de la integración nativa (sin el `data-studio`). */
export function atributosNativa(e: EntradaIntegracion): string[] {
  const { widget: w, config: c } = e;
  const a: string[] = [];
  for (const [k, v] of paresContenido(e, 'nativa')) {
    // Un booleano va a pelo (`data-ocultar-precio`): el parser lo cuenta como «sí».
    a.push(v === '1' && k.startsWith('ocultar-') ? `data-${k}` : `data-${k}="${escaparAtributo(v)}"`);
  }
  if (c.identidad === 'propia') {
    // La nativa solo entiende marca, fondo, tinta (`negro`) y tipografías: el
    // resto de ajustes de diseño no se ofrecen con este método.
    const marca = color(c.marca);
    const fondo = color(c.fondo);
    const tinta = color(c.tinta);
    const fuente = familia(c.fuente);
    const fuenteDisplay = familia(c.fuenteDisplay);
    if (marca) a.push(`data-marca="${marca}"`);
    if (fondo) a.push(`data-fondo="${fondo}"`);
    if (tinta) a.push(`data-negro="${tinta}"`);
    if (fuente) a.push(`data-fuente="${fuente}"`);
    if (fuenteDisplay) a.push(`data-fuente-display="${fuenteDisplay}"`);
  } else {
    // Con la identidad del estudio, el propio widget toma el color de la marca
    // y la letra de la web donde vive (app/widget-bundle/main.tsx).
    a.push('data-identidad="estudio"');
  }
  const ref = etiquetaEfectiva(c, w);
  if (ref) a.push(`data-ref="${ref}"`);
  return a;
}

// ── Utilidades de texto ───────────────────────────────────────────────────────

/**
 * Una URL dentro de un atributo HTML. Se deja el `&` a la vista (válido en
 * HTML5 y legible para quien lo pega); lo único que podría cerrar el atributo
 * es una comilla, y ninguno de los valores validados la lleva — aun así se
 * codifica por si acaso.
 */
function urlEnAtributo(url: string): string {
  return url.replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E');
}

export function escaparAtributo(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escaparTexto(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/** Para un literal de JS/JSX entre comillas simples. */
function jsString(v: string): string {
  return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function idIframe(e: EntradaIntegracion): string {
  const base = `tentare-widget-${e.slug}-${e.widget.id}`;
  return e.widget.contenido.includes('sesion') && e.config.sesion ? `${base}-${e.config.sesion}` : base;
}

function anchoMaximoPx(e: EntradaIntegracion): number | null {
  const ancho = e.config.ancho ?? anchoPorDefecto(e.widget);
  return ancho === 'compacto' ? 480 : null;
}

/** El color del botón: la marca propia si la hay, si no la del estudio. */
export function colorBoton(e: EntradaIntegracion): string {
  return (e.config.identidad === 'propia' ? color(e.config.marca) : null)
    ?? color(e.colorEstudio ?? null) ?? COLOR_POR_DEFECTO;
}

export interface EstiloBoton {
  background: string;
  color: string;
  border: string;
  borderRadius: string;
}

export function estiloBoton(e: EntradaIntegracion): EstiloBoton {
  const marca = colorBoton(e);
  const l = luminancia(marca);
  const sobreMarca = l != null && l < 0.45 ? '#FFFFFF' : '#22261F';
  const radio = e.config.forma === 'recto' ? '6px' : e.config.forma === 'redondeado' ? '12px' : '999px';
  return e.config.estiloBoton === 'contorno'
    ? { background: 'transparent', color: marca, border: `1.5px solid ${marca}`, borderRadius: radio }
    : { background: marca, color: sobreMarca, border: `1.5px solid ${marca}`, borderRadius: radio };
}

// `font:inherit` a propósito: el botón toma la letra de la web donde vive.
// 44 px de alto mínimo: es un objetivo táctil.
function cssBoton(e: EntradaIntegracion): string {
  const s = estiloBoton(e);
  return [
    'display:inline-flex', 'align-items:center', 'justify-content:center', 'min-height:44px',
    'padding:10px 22px', 'font:inherit', 'font-weight:600', 'font-size:15px', 'line-height:1.2',
    'text-decoration:none', 'cursor:pointer', `background:${s.background}`, `color:${s.color}`,
    `border:${s.border}`, `border-radius:${s.borderRadius}`,
  ].join(';') + ';';
}

function objetoEstiloReact(e: EntradaIntegracion): string {
  const s = estiloBoton(e);
  return `{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '10px 22px', font: 'inherit', fontWeight: 600, fontSize: 15, lineHeight: 1.2, textDecoration: 'none', cursor: 'pointer', background: ${jsString(s.background)}, color: ${jsString(s.color)}, border: ${jsString(s.border)}, borderRadius: ${jsString(s.borderRadius)} }`;
}

/** Nombre de componente React para el widget: `TentareHorarioYReservas`. */
function nombreComponente(w: WidgetDisponible): string {
  const limpio = w.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ');
  return `Tentare${limpio.split(/\s+/).filter(Boolean).map(p => p[0].toUpperCase() + p.slice(1)).join('')}`;
}

// ── Generación ────────────────────────────────────────────────────────────────

export type Lenguaje = 'html' | 'jsx' | 'url';

export interface CodigoGenerado {
  codigo: string;
  lenguaje: Lenguaje;
}

/** Qué plataformas tienen sentido para un método (el enlace no se «instala»). */
export function plataformasDe(metodo: MetodoIntegracion): Plataforma[] {
  return metodo === 'enlace' ? [] : ['html', 'wordpress', 'webflow', 'react'];
}

/**
 * Lo que falta para poder dar un código que funcione, o `null` si nada.
 * Dar un código que no va a funcionar es peor que no darlo todavía.
 */
export function faltaParaGenerar(
  e: EntradaIntegracion,
  metodo: MetodoIntegracion,
  opts: { dominiosAutorizados: readonly string[] },
): string | null {
  if (e.widget.contenido.includes('sesion') && !e.config.sesion) {
    return 'Elige la clase en «Contenido» para generar el código.';
  }
  if (metodo === 'nativa' && opts.dominiosAutorizados.length === 0) {
    return 'Autoriza el dominio de tu web en «Avanzado» para usar la integración nativa.';
  }
  return null;
}

export function generarCodigo(e: EntradaIntegracion, metodo: MetodoIntegracion, plataforma: Plataforma = 'html'): CodigoGenerado {
  const w = e.widget;
  const react = plataforma === 'react';
  switch (metodo) {
    case 'enlace':
      return { codigo: urlPagina(e), lenguaje: 'url' };

    case 'boton': {
      const url = urlPagina(e);
      const texto = textoBotonEfectivo(e.config, w);
      const nueva = e.config.abrirEn === 'nueva';
      if (react) {
        return {
          lenguaje: 'jsx',
          codigo: `// ${w.nombre} — botón de Tentare. Pégalo donde quieras que aparezca.
export function ${nombreComponente(w)}Boton() {
  return (
    <a href=${jsString(url)}${nueva ? ` target="_blank" rel="noopener"` : ''} style={${objetoEstiloReact(e)}}>
      {${jsString(texto)}}
    </a>
  );
}`,
        };
      }
      return {
        lenguaje: 'html',
        codigo: `<a href="${urlEnAtributo(url)}"${nueva ? ' target="_blank" rel="noopener"' : ''} style="${cssBoton(e)}">${escaparTexto(texto)}</a>`,
      };
    }

    case 'popup': {
      const url = urlEmbebido(e, 'popup');
      const texto = textoBotonEfectivo(e.config, w);
      const script = `${e.origen}/widget-popup.js`;
      if (react) {
        return {
          lenguaje: 'jsx',
          codigo: `import { useEffect } from 'react';

// ${w.nombre} — abre el widget de Tentare en una ventana encima de tu web.
export function ${nombreComponente(w)}Popup() {
  useEffect(() => {
    if (document.querySelector('script[src=${jsString(script).replace(/'/g, '"')}]')) return;
    const s = document.createElement('script');
    s.src = ${jsString(script)};
    s.async = true;
    document.body.appendChild(s);
  }, []);
  return (
    <button
      type="button"
      data-tentare-popup=${jsString(url)}
      data-tentare-titulo=${jsString(w.nombre)}
      data-tentare-ancho="${w.anchoPopup}"
      style={${objetoEstiloReact(e)}}
    >
      {${jsString(texto)}}
    </button>
  );
}`,
        };
      }
      return {
        lenguaje: 'html',
        codigo: `<button type="button" data-tentare-popup="${urlEnAtributo(url)}" data-tentare-titulo="${escaparAtributo(w.nombre)}" data-tentare-ancho="${w.anchoPopup}" style="${cssBoton(e)}">${escaparTexto(texto)}</button>
<script src="${script}" async></script>`,
      };
    }

    case 'nativa': {
      const attrs = atributosNativa(e);
      const script = `${e.origen}/widget.js`;
      if (react) {
        const jsx = attrs.map(a => (a.includes('=') ? a : `${a}=""`)).map(a => `\n      ${a}`).join('');
        return {
          lenguaje: 'jsx',
          codigo: `import { useEffect } from 'react';

// ${w.nombre} — integración nativa de Tentare (sin marco).
export function ${nombreComponente(w)}() {
  useEffect(() => {
    if (document.querySelector('script[src=${jsString(script).replace(/'/g, '"')}]')) return;
    const s = document.createElement('script');
    s.src = ${jsString(script)};
    s.async = true;
    document.body.appendChild(s);
  }, []);
  return (
    <div
      data-tentare-booking=""
      data-studio=${jsString(e.slug)}${jsx}
    />
  );
}`,
        };
      }
      return {
        lenguaje: 'html',
        codigo: `<div data-tentare-booking data-studio="${e.slug}"${attrs.map(a => ` ${a}`).join('')}></div>
<script src="${script}" async></script>`,
      };
    }

    case 'iframe':
    default: {
      const url = urlEmbebido(e, 'iframe');
      const id = idIframe(e);
      const max = anchoMaximoPx(e);
      const lazy = e.config.cargaDiferida;
      if (react) {
        return {
          lenguaje: 'jsx',
          codigo: `import { useEffect, useRef } from 'react';

// ${w.nombre} — widget de Tentare. Se ajusta solo a la altura de su contenido.
const ORIGEN = ${jsString(e.origen)};

export function ${nombreComponente(w)}() {
  const ref = useRef(null);
  useEffect(() => {
    let raf = 0;
    const avisarVista = () => {
      raf = 0;
      const f = ref.current;
      if (!f || !f.contentWindow) return;
      const r = f.getBoundingClientRect();
      const alto = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      f.contentWindow.postMessage({ tentareHostViewport: { top: Math.max(0, -r.top), height: Math.max(0, alto) } }, ORIGEN);
    };
    const pedirVista = () => { if (!raf) raf = requestAnimationFrame(avisarVista); };
    const onMessage = (e) => {
      const f = ref.current;
      if (!f || e.origin !== ORIGEN || e.source !== f.contentWindow || e.data?.tentareSlug !== ${jsString(e.slug)}) return;
      if (e.data.tentareEmbedAltura) { f.style.height = e.data.tentareEmbedAltura + 'px'; pedirVista(); }
      if (e.data.tentareScrollTo) f.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('scroll', pedirVista, true);
    window.addEventListener('resize', pedirVista);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('scroll', pedirVista, true);
      window.removeEventListener('resize', pedirVista);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <iframe
      ref={ref}
      src=${jsString(url)}
      title=${jsString(w.nombre)}${lazy ? '\n      loading="lazy"' : ''}
      allow="payment"
      style={{ width: '100%',${max ? ` maxWidth: ${max},` : ''} height: ${w.alto}, border: 0, borderRadius: 12 }}
    />
  );
}`,
        };
      }
      return {
        lenguaje: 'html',
        codigo: `<iframe id="${id}" src="${urlEnAtributo(url)}" style="width:100%;${max ? `max-width:${max}px;` : ''}height:${w.alto}px;border:0;border-radius:12px;" title="${escaparAtributo(w.nombre)}"${lazy ? ' loading="lazy"' : ''} allow="payment"></iframe>
${scriptSnippetIframe({ origen: e.origen, slug: e.slug, iframeId: id })}`,
      };
    }
  }
}

// ── Guía por plataforma ───────────────────────────────────────────────────────

/** Los pasos para pegar el código, en la plataforma elegida. */
export function pasosInstalacion(metodo: MetodoIntegracion, plataforma: Plataforma): string[] {
  if (metodo === 'enlace') {
    return [
      'Copia el enlace.',
      'Pégalo en la bio de Instagram, en un newsletter, en WhatsApp o en cualquier botón de tu web.',
    ];
  }
  const cabeceraGlobal = metodo === 'nativa' || metodo === 'popup';
  switch (plataforma) {
    case 'wordpress':
      return [
        'En la página donde lo quieras, añade un bloque «HTML personalizado».',
        'Pega el código dentro y guarda.',
        ...(cabeceraGlobal
          ? ['Si no aparece, pega la línea <script …> en el pie GLOBAL de tu tema (Apariencia → Editor o tu plugin de cabecera y pie): algunos constructores de página no ejecutan scripts dentro de un bloque.']
          : []),
      ];
    case 'webflow':
      return [
        'Arrastra un elemento «Embed» (Code Embed) donde lo quieras.',
        'Pega el código y pulsa «Save & Close».',
        'Publica el sitio: en el editor de Webflow los scripts no se ejecutan, solo en la web publicada.',
      ];
    case 'react':
      return [
        'Crea un archivo con este componente (JavaScript/JSX).',
        'Impórtalo y ponlo donde quieras que aparezca.',
      ];
    case 'html':
    default:
      return [
        'Pega el código en el HTML de tu página, donde quieras que aparezca.',
        'Sube el cambio a tu web. No hace falta nada más.',
      ];
  }
}
