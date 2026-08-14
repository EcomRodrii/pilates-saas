// Enlaza datos REALES de Tentare en un tema importado — punto 12 del encargo:
// «TEMA ORIGINAL + TENTARE DATA → THEME RENDERER», nunca reconstruir el tema
// para meter el dato.
//
// ⚠️ Dos mecanismos, y los dos DEJAN el HTML/JS intactos salvo por el valor
// exacto que enlazan — ninguno reescribe estructura ni interpreta nada del
// tema:
//
//  1. `enlazarPropsDeclarados` — el propio export declara un esquema público
//     de props editables en `<script data-dc-script data-props="...">`
//     (`{"studioName": {"editor":"text","default":"..."}, "brand": {...}}`).
//     Es un contrato DOCUMENTADO del propio formato, no algo que adivinamos:
//     el runtime (`support.js`) lee ese `default` como valor inicial. Aquí
//     solo se sustituye el `default` de los nombres que reconocemos con
//     certeza (`studioName`, `brand` — conceptos genéricos de cualquier
//     marca, no específicos de este tema) por el dato real del estudio. Un
//     nombre que no reconocemos se deja tal cual — "no reconocido" nunca
//     significa "adivinar".
//
//  2. `enlazarFotosDeSlots` — el componente `<image-slot id="...">` (parte
//     documentada del kit de Design, no de este tema en concreto: ver el
//     comentario de cabecera del propio `image-slot.js`) lee su atributo
//     `src` "tal cual, sin comprobar" — es "author-controlled". Se enlazan
//     los slots cuyo `id` es una convención estable de nombre (no un id
//     plantillado con `{{ }}`, que depende de datos que el runtime resuelve
//     él mismo) con la foto real correspondiente.
//
// ⚠️ Límite conocido y documentado, NO resuelto aquí: la lista de clases
// (`CLS` en el fixture del propio tema) no está en `data-props` — el autor
// del tema no la declaró como prop editable — así que no hay ningún gancho
// genérico para enlazarla sin adivinar la forma interna de ESTE fichero en
// concreto. El runtime SÍ expone `window.__dcSetProps(...)` para eso, pero
// llamarlo desde fuera exige que el iframe sea `allow-same-origin` — la
// propiedad de sandboxing que se descartó a propósito (decisión explícita del
// usuario) porque abre la cookie de sesión al código del ZIP. Enlazar la
// lista de clases sin reabrir esa decisión necesitaría que Design declarara
// las clases como prop editable (como ya hace con `studioName`/`brand`), que
// no es algo que este importador pueda forzar.

export interface DatosTentareParaEnlazar {
  studioName?: string;
  brand?: string;
  fotos?: {
    welcomeHero?: string;
    homeHero?: string;
    centroFachada?: string;
    avatarPerfil?: string;
  };
}

/** Los nombres de prop que reconocemos con certeza — conceptos genéricos de
 *  cualquier marca, no de este tema. Todo lo demás se deja intacto. */
const PROPS_RECONOCIDOS: Record<string, keyof DatosTentareParaEnlazar> = {
  studioName: 'studioName',
  brand: 'brand',
};

/** Los ids de `<image-slot>` que son una convención estable (no plantillada)
 *  y su dato correspondiente. `clase-{{ detId }}` no entra aquí a propósito:
 *  su id lo resuelve el propio runtime al pintar la lista de clases. */
const SLOTS_RECONOCIDOS: Record<string, keyof NonNullable<DatosTentareParaEnlazar['fotos']>> = {
  'welcome-hero': 'welcomeHero',
  'home-hero': 'homeHero',
  'centro-fachada': 'centroFachada',
  'avatar-perfil': 'avatarPerfil',
};

function decodificarEntidadesHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function codificarEntidadesHtml(s: string): string {
  // Mismo conjunto que decodifica arriba, y `&` PRIMERO — si no, re-escapa
  // los `&` que acaba de meter `&quot;`.
  return s
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Sustituye, dentro de `data-props="..."`, el `default` de los nombres de
 * prop que reconocemos por el dato real del estudio. Si el HTML no trae
 * `data-props`, o el JSON no parsea, devuelve el HTML sin tocar — nunca
 * lanza, nunca inventa una prop que el tema no declaró.
 */
export function enlazarPropsDeclarados(html: string, datos: DatosTentareParaEnlazar): string {
  const m = /(<script[^>]*\bdata-dc-script\b[^>]*\bdata-props=")([^"]*)("[^>]*>)/.exec(html);
  if (!m) return html;

  let props: Record<string, { default?: unknown; editor?: string }>;
  try {
    props = JSON.parse(decodificarEntidadesHtml(m[2]));
  } catch {
    return html;
  }
  if (!props || typeof props !== 'object') return html;

  let tocado = false;
  for (const [nombre, entrada] of Object.entries(props)) {
    const clave = PROPS_RECONOCIDOS[nombre];
    if (!clave) continue;
    const valor = datos[clave];
    if (typeof valor !== 'string' || !valor) continue;
    if (!entrada || typeof entrada !== 'object') continue;
    entrada.default = valor;
    tocado = true;
  }
  if (!tocado) return html;

  const nuevoAtributo = codificarEntidadesHtml(JSON.stringify(props));
  return html.slice(0, m.index) + m[1] + nuevoAtributo + m[3] + html.slice(m.index + m[0].length);
}

/**
 * Pone (o sustituye) el `src` de cada `<image-slot id="...">` cuyo id es una
 * convención estable, con la foto real correspondiente. Los ids plantillados
 * (`{{ … }}` dentro del id) se dejan intactos: ese id no existe todavía en
 * este HTML, lo completa el propio runtime.
 */
export function enlazarFotosDeSlots(html: string, fotos: NonNullable<DatosTentareParaEnlazar['fotos']>): string {
  return html.replace(/<image-slot\b[^>]*>/g, (etiqueta) => {
    const idMatch = /\bid="([^"]*)"/.exec(etiqueta);
    const id = idMatch?.[1];
    if (!id || id.includes('{{')) return etiqueta;
    const clave = SLOTS_RECONOCIDOS[id];
    if (!clave) return etiqueta;
    const url = fotos[clave];
    if (!url) return etiqueta;

    if (/\bsrc="[^"]*"/.test(etiqueta)) {
      return etiqueta.replace(/\bsrc="[^"]*"/, `src="${url}"`);
    }
    return etiqueta.replace(/^<image-slot\b/, `<image-slot src="${url}"`);
  });
}
