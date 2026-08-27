'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Building2, Calendar, CalendarCheck, Check, Clock, ClipboardCheck, Code2, Copy, Plug, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import { useRol, puedeGestionarAppsOAuth } from '@/lib/permisos';
import { authHeader } from '@/lib/api-client';
import { Field, ColorInput, Toggle, cardCls } from '@/app/(dashboard)/configuracion/page';
import { copiarAlPortapapeles } from '@/lib/utils';
import { TabCrecimientoWeb } from '@/components/configuracion/tab-crecimiento-web';
import { ReservaCalendario } from '@/components/reserva/reserva-calendario';
import { useDatosWidget } from '@/lib/widget/usar-datos-widget';
import { MODO_TOKENS } from '@/lib/portal-modo';
import { COLOR_VALIDO, fuenteValida, familiaCssDe, urlFuenteGoogle } from '@/lib/reservar/config-widget';
import { luminancia } from '@/lib/reservar/apariencia-widget';
import { SelectorFuente } from '@/components/ui/selector-fuente';
import { scriptSnippetIframe } from '@/lib/reservar/snippet-embed';
import type { FiltrosSlots } from '@/lib/reservar/construir-slots';

const COLOR_WIDGET_POR_DEFECTO = '#343825';

// Antes vivía escondido dentro de Estudio → Enlaces, una sub-pestaña que
// nadie mira buscando "cómo pongo Tentare en mi web". Movido a su propio
// tab de primer nivel porque es la única superficie de "API" que existe hoy
// — no hay claves ni endpoints públicos, solo estos widgets.
//
// Cada "widget" es la MISMA página pública de reservas de siempre
// (/reservar/[slug]), en modo compacto (?embed=1 esconde la cabecera/hero
// grandes) y abierta directamente en una de sus pestañas reales (?tab=…).
// Cero backend nuevo, cero maqueta: es la reserva, el calendario, "Mis
// reservas" y la ficha del estudio de siempre — solo cambia dónde se pintan.
// ⚠️ 1 widget = 1 propósito: en `?embed=1`, app/reservar/[slug]/page.tsx
// oculta SIEMPRE la barra de las otras cuatro pestañas y las salidas
// internas que saltaban de sección (antes eran opt-in vía `solo-pestana=1`,
// hoy es el comportamiento fijo) — quien incrusta "Mis reservas" no quiere
// que su visitante acabe en "El estudio" dentro del mismo recuadro.
// A propósito NO hay widget de vídeos ni de comunidad (ambos módulos están
// congelados, ver lib/frozen-features.ts) ni de tarjetas regalo (no existe
// esa función en el producto) — un widget que no hace nada de verdad es
// peor que no tenerlo.
//
// "Reserva esta clase" es el 5º widget: mismo `tabParam` que el calendario
// (`clases`), pero con `&sesion=<id>` añadido — reusa el deep-link que YA
// existe en app/reservar/[slug]/page.tsx (pensado para el retorno del magic
// link), sin backend nuevo. `id` distingue las entradas en la UI de aquí
// (dos widgets pueden compartir `tabParam` sin colisionar).
//
// El 6º, "Calendario embebido", es de otra naturaleza: no es un <iframe> de
// /reservar/[slug] — es el bundle compilado aparte (public/widget.js, ver
// scripts/build-widget-bundle.mjs) que se monta DENTRO de la web del estudio
// (Shadow DOM, mismo componente <ReservaCalendario> que usan los iframes).
// `modo: 'script'` lo distingue de los otros cinco, que siguen siendo
// `modo: 'iframe'` (implícito) — el código a copiar y la vista previa se
// generan distinto más abajo.
const WIDGETS = [
  { id: 'clases', tabParam: 'clases', nombre: 'Horario y reserva de clases', desc: 'El calendario en vivo. Reservan sin salir de tu web.', alto: 640, requiereSesion: false, modo: 'iframe' },
  { id: 'citas', tabParam: 'citas', nombre: 'Citas', desc: 'Para servicios con hora concreta (valoraciones, sesiones 1 a 1...). Usa los servicios de cita que ya tengas configurados.', alto: 640, requiereSesion: false, modo: 'iframe' },
  { id: 'misreservas', tabParam: 'misreservas', nombre: 'Mis reservas', desc: 'Para clientas ya dadas de alta: ven y cancelan sus reservas sin entrar en la app completa.', alto: 520, requiereSesion: false, modo: 'iframe' },
  { id: 'estudio', tabParam: 'estudio', nombre: 'El estudio', desc: 'Descripción, horario general y políticas — para tu página "Sobre nosotras".', alto: 480, requiereSesion: false, modo: 'iframe' },
  { id: 'clase-concreta', tabParam: 'clases', nombre: 'Reserva esta clase', desc: 'Apunta directo a una clase concreta — para un post, una story o un newsletter, en vez de al calendario entero.', alto: 640, requiereSesion: true, modo: 'iframe' },
  { id: 'embed-script', tabParam: 'clases', nombre: 'Calendario embebido (integración directa)', desc: 'El mismo calendario, pero integrado de verdad en tu web — sin marco ni recuadro, con tu tipografía alrededor. Requiere autorizar tu dominio en «Personaliza».', alto: 0, requiereSesion: false, modo: 'script' },
] as const;

// Un icono por tipo de widget — mismo criterio que ya usa
// tab-estudio-enlaces.tsx para sus filas de enlaces públicos, para que el
// selector no rompa el lenguaje visual del resto de Configuración.
const WIDGET_ICONOS: Record<(typeof WIDGETS)[number]['id'], LucideIcon> = {
  clases: Calendar,
  citas: Clock,
  misreservas: ClipboardCheck,
  estudio: Building2,
  'clase-concreta': CalendarCheck,
  'embed-script': Code2,
};

// ── Widget Builder ────────────────────────────────────────────────────────────
// La config del builder, POR TIPO de widget. Se guarda en
// studios.widget_builder (jsonb, migr 20260820103000) solo para no perderla al
// recargar la pantalla — la config EFECTIVA viaja CONGELADA en el snippet que
// se copia (lib/reservar/config-widget.ts es el vocabulario, y el único
// parser). `null` en diseño/colores = «default del widget», y un default NO se
// emite en el snippet (mismo criterio que Momence): un snippet sin tocar se
// comporta EXACTAMENTE igual que el widget de siempre.
interface ConfigBuilder {
  vista: 'todo' | 'hoy';
  tipos: string[];
  instructoras: string[];
  salas: string[];
  ocultarPrecio: boolean;
  ocultarNivel: boolean;
  ocultarSustituta: boolean;
  diseno: 'completo' | 'ligero' | null;
  fondo: string | null;
  marca: string | null;
  negro: string | null;
  // Google Fonts, por nombre — `null` = sin tocar (el iframe cae a la
  // tipografía del TEMA publicado; el bundle, a su base sin webfonts).
  fuente: string | null;
  fuenteDisplay: string | null;
  anchoCompleto: boolean;
}

const CONFIG_BUILDER_DEFECTO: ConfigBuilder = {
  vista: 'todo', tipos: [], instructoras: [], salas: [],
  ocultarPrecio: false, ocultarNivel: false, ocultarSustituta: false,
  diseno: null, fondo: null, marca: null, negro: null,
  fuente: null, fuenteDisplay: null, anchoCompleto: false,
};

// Solo estos dos honran filtros/vista/toggles/diseño DE VERDAD (son el
// calendario, en iframe o en bundle — ver e2e/widget-config-params.spec.ts).
// Pintar esos controles en «Citas» o «El estudio» sería un control que no hace
// nada, que es exactamente lo que el encargo prohíbe. Los COLORES sí aplican a
// todos: en Modo A `fondo`/`tinta`/`marca` pintan la página embebida entera
// (resolverApariencia + varsMarca), sea cual sea la pestaña.
const WIDGETS_CON_FILTROS = new Set<(typeof WIDGETS)[number]['id']>(['clases', 'embed-script']);

// Lo guardado en jsonb es texto libre para la BD: se valida campo a campo al
// leer, y cualquier basura cae al default en silencio — mismo criterio que
// resolverConfigWidget con los params del snippet.
function leerConfigGuardada(raw: unknown): ConfigBuilder {
  const c = { ...CONFIG_BUILDER_DEFECTO };
  if (!raw || typeof raw !== 'object') return c;
  const o = raw as Record<string, unknown>;
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const color = (v: unknown) => (typeof v === 'string' && COLOR_VALIDO.test(v) ? v : null);
  if (o.vista === 'hoy') c.vista = 'hoy';
  c.tipos = lista(o.tipos);
  c.instructoras = lista(o.instructoras);
  c.salas = lista(o.salas);
  c.ocultarPrecio = o.ocultarPrecio === true;
  c.ocultarNivel = o.ocultarNivel === true;
  c.ocultarSustituta = o.ocultarSustituta === true;
  if (o.diseno === 'completo' || o.diseno === 'ligero') c.diseno = o.diseno;
  c.fondo = color(o.fondo);
  c.marca = color(o.marca);
  c.negro = color(o.negro);
  const fuente = (v: unknown) => (typeof v === 'string' && fuenteValida(v) ? v.trim() : null);
  c.fuente = fuente(o.fuente);
  c.fuenteDisplay = fuente(o.fuenteDisplay);
  c.anchoCompleto = o.anchoCompleto === true;
  return c;
}

function leerConfigsGuardadas(raw: Record<string, unknown> | undefined): Record<string, ConfigBuilder> {
  const out: Record<string, ConfigBuilder> = {};
  if (!raw) return out;
  for (const w of WIDGETS) if (w.id in raw) out[w.id] = leerConfigGuardada(raw[w.id]);
  return out;
}

// El hex de un ColorInput puede estar a medio teclear — solo un color completo
// entra en el snippet (misma puerta anti-basura que valida el parser al leer).
const colorSnippet = (v: string | null) => (v && COLOR_VALIDO.test(v) ? v : null);
// Igual para una fuente a medio teclear: solo un nombre válido entra en el
// snippet — la misma puerta (fuenteValida) que aplicará el parser al leerlo.
const fuenteSnippet = (v: string | null) => (v && fuenteValida(v) ? v.trim() : null);

// Query params del snippet iframe (Modo A) — SOLO lo que difiere del default.
// `fondo`/`tinta` son los params de resolverApariencia de siempre; el resto es
// el vocabulario nuevo de config-widget.ts.
function paramsSnippetIframe(c: ConfigBuilder, conFiltros: boolean): string {
  const p: string[] = [];
  if (conFiltros) {
    if (c.vista === 'hoy') p.push('vista=hoy');
    if (c.tipos.length) p.push(`tipos=${c.tipos.join(',')}`);
    if (c.instructoras.length) p.push(`instructoras=${c.instructoras.join(',')}`);
    if (c.salas.length) p.push(`salas=${c.salas.join(',')}`);
    if (c.ocultarPrecio) p.push('ocultar-precio=1');
    if (c.ocultarNivel) p.push('ocultar-nivel=1');
    if (c.ocultarSustituta) p.push('ocultar-sustituta=1');
    // El default del iframe es 'completo' (la tira de días de Modo A).
    if (c.diseno === 'ligero') p.push('diseno=ligero');
  }
  const marca = colorSnippet(c.marca);
  const fondo = colorSnippet(c.fondo);
  const tinta = colorSnippet(c.negro);
  if (marca) p.push(`marca=${encodeURIComponent(marca)}`);
  if (fondo) p.push(`fondo=${encodeURIComponent(fondo)}`);
  if (tinta) p.push(`tinta=${encodeURIComponent(tinta)}`);
  // Tipografía, misma regla que los colores: CONGELADA en el snippet solo si
  // se toca aquí. Sin tocar no se emite nada y el iframe sigue con la del TEMA
  // publicado (resolverApariencia pone la URL por encima de lo guardado).
  const fuente = fuenteSnippet(c.fuente);
  const fuenteDisplay = fuenteSnippet(c.fuenteDisplay);
  if (fuente) p.push(`fuente=${encodeURIComponent(fuente)}`);
  if (fuenteDisplay) p.push(`fuente-display=${encodeURIComponent(fuenteDisplay)}`);
  return p.length ? `&${p.join('&')}` : '';
}

// Atributos data-* del snippet script (Modo B) — mismo criterio: solo lo que
// difiere. Un toggle activo va como atributo booleano a pelo
// (`data-ocultar-precio`), que el parser ya cuenta como «sí».
function atributosSnippetScript(c: ConfigBuilder): string {
  const a: string[] = [];
  if (c.vista === 'hoy') a.push('data-vista="hoy"');
  if (c.tipos.length) a.push(`data-tipos="${c.tipos.join(',')}"`);
  if (c.instructoras.length) a.push(`data-instructoras="${c.instructoras.join(',')}"`);
  if (c.salas.length) a.push(`data-salas="${c.salas.join(',')}"`);
  if (c.ocultarPrecio) a.push('data-ocultar-precio');
  if (c.ocultarNivel) a.push('data-ocultar-nivel');
  if (c.ocultarSustituta) a.push('data-ocultar-sustituta');
  // El default del bundle es 'ligero' (la rejilla compacta de siempre).
  if (c.diseno === 'completo') a.push('data-diseno="completo"');
  const marca = colorSnippet(c.marca);
  const fondo = colorSnippet(c.fondo);
  const negro = colorSnippet(c.negro);
  if (marca) a.push(`data-marca="${marca}"`);
  if (fondo) a.push(`data-fondo="${fondo}"`);
  if (negro) a.push(`data-negro="${negro}"`);
  const fuente = fuenteSnippet(c.fuente);
  const fuenteDisplay = fuenteSnippet(c.fuenteDisplay);
  if (fuente) a.push(`data-fuente="${fuente}"`);
  if (fuenteDisplay) a.push(`data-fuente-display="${fuenteDisplay}"`);
  return a.map(x => ` ${x}`).join('');
}

// Tokenizador manual, no un parser general (no hay shiki/prism/highlight.js
// en package.json — grepeado antes de escribir esto, y añadir una
// dependencia para pintar 2 líneas de HTML fijo sería sobre-ingeniería).
// Cubre justo las formas que generan codigoScript/codigoIframe: etiquetas,
// nombres de atributo, valores entre comillas y el resto de texto (incluido
// el cuerpo del <script>, que se pinta como texto plano — no hace falta
// tokenizar JS para que se lea bien).
// ⚠️ Solo decide CÓMO se pinta — el string que se copia al portapapeles
// sigue siendo `codigo` tal cual, nunca los tokens de aquí.
type TokenCodigo = { texto: string; clase: string };
// El espacio va en su propio grupo, separado del texto genérico: sin eso, un
// atributo booleano sin valor (`data-tentare-booking`, sin espacio detrás
// hasta el siguiente `data-studio="..."`) se fundía con el atributo real
// siguiente en un solo token de texto plano y ese SÍ perdía su color de
// atributo — el espacio de por medio es lo que deja que el atributo
// siguiente vuelva a evaluarse desde su propio inicio.
const PATRON_TOKEN_CODIGO = /(<!--[\s\S]*?-->)|(<\/?[a-zA-Z][\w-]*)|([a-zA-Z-]+(?=\s*=))|("[^"]*"|'[^']*')|([<>=/])|(\s+)|([^<>="'\s]+)/g;

function tokenizarCodigo(codigo: string): TokenCodigo[] {
  const tokens: TokenCodigo[] = [];
  for (const m of codigo.matchAll(PATRON_TOKEN_CODIGO)) {
    const [, comentario, etiqueta, atributo, cadena, puntuacion, espacio, resto] = m;
    if (comentario) tokens.push({ texto: comentario, clase: 'text-muted-foreground' });
    else if (etiqueta) tokens.push({ texto: etiqueta, clase: 'text-brand font-semibold' });
    else if (atributo) tokens.push({ texto: atributo, clase: 'text-info' });
    else if (cadena) tokens.push({ texto: cadena, clase: 'text-success' });
    else if (puntuacion) tokens.push({ texto: puntuacion, clase: 'text-muted-foreground' });
    else if (espacio) tokens.push({ texto: espacio, clase: 'text-foreground' });
    else if (resto) tokens.push({ texto: resto, clase: 'text-foreground' });
  }
  return tokens;
}

function CodigoResaltado({ codigo }: { codigo: string }) {
  const tokens = useMemo(() => tokenizarCodigo(codigo), [codigo]);
  return (
    <pre className="text-[11.5px] leading-relaxed font-mono bg-muted rounded-lg p-3.5 overflow-x-auto whitespace-pre-wrap break-words text-foreground">
      {tokens.map((t, i) => (
        <span key={i} className={t.clase}>{t.texto}</span>
      ))}
    </pre>
  );
}

// Header + acción opcional (el botón "Copiar código" va aquí, no suelto
// debajo del bloque) para las secciones de "Widgets para tu web". Sin frase
// de ayuda propia: cada tarjeta del selector y cada <Field> de "Personaliza"
// ya trae la suya, y repetirla a nivel de sección no aportaba nada.
function BloqueSeccion({ titulo, descripcion, accion, children }: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center flex-wrap justify-between gap-x-3 gap-y-1.5 mb-2">
        <h4 className="text-[13px] font-semibold text-foreground">{titulo}</h4>
        {accion}
      </div>
      {descripcion && <p className="text-[12px] text-muted-foreground mb-2">{descripcion}</p>}
      {children}
    </div>
  );
}

// Fila de configuración estilo Momence: etiqueta en negrita + descripción gris
// debajo + el control. Es el esqueleto común de todo el rail izquierdo del
// builder — pills, multi-selectores y toggles comparten esta jerarquía.
function FilaAjuste({ etiqueta, descripcion, children }: {
  etiqueta: string;
  descripcion: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-foreground">{etiqueta}</p>
      <p className="text-[12px] text-muted-foreground mt-0.5 mb-2 leading-relaxed">{descripcion}</p>
      {children}
    </div>
  );
}

// Grupo de pills excluyentes (una sola opción activa) — mismo lenguaje visual
// que la sub-navegación Widgets/Crecimiento de arriba.
function Pills<T extends string>({ label, opciones, valor, onChange }: {
  label: string;
  opciones: readonly { valor: T; nombre: string }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {opciones.map(o => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onChange(o.valor)}
          aria-pressed={valor === o.valor}
          className={cn(
            'px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-colors',
            valor === o.valor ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          {o.nombre}
        </button>
      ))}
    </div>
  );
}

// Multi-selección por chips: nada marcado = «todo» (mismo contrato que el
// vocabulario del snippet, donde lista vacía = sin filtro y el param no se
// emite). Por eso no hay chip «Todas» que gestionar: desmarcarlo todo ES todas.
function MultiSelector({ etiqueta, descripcion, opciones, seleccion, onChange }: {
  etiqueta: string;
  descripcion: string;
  opciones: { id: string; nombre: string }[];
  seleccion: string[];
  onChange: (ids: string[]) => void;
}) {
  function alternar(id: string) {
    onChange(seleccion.includes(id) ? seleccion.filter(x => x !== id) : [...seleccion, id]);
  }
  return (
    <FilaAjuste etiqueta={etiqueta} descripcion={descripcion}>
      {opciones.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Todavía no hay ninguna configurada.</p>
      ) : (
        <div role="group" aria-label={etiqueta} className="flex flex-wrap gap-1.5">
          {opciones.map(o => {
            const marcada = seleccion.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => alternar(o.id)}
                aria-pressed={marcada}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium border transition-colors',
                  marcada ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                {marcada && <Check size={11} className="text-brand" />}
                {o.nombre}
              </button>
            );
          })}
        </div>
      )}
    </FilaAjuste>
  );
}

// Toggle con etiqueta en negrita + descripción gris debajo (patrón Momence) —
// el interruptor va alineado arriba a la derecha, junto a la etiqueta.
function FilaToggle({ etiqueta, descripcion, on, onChange }: {
  etiqueta: string;
  descripcion: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground">{etiqueta}</p>
        <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{descripcion}</p>
      </div>
      <div className="shrink-0 pt-0.5">
        <Toggle on={on} onChange={onChange} ariaLabel={etiqueta} />
      </div>
    </div>
  );
}

// Color con «Restablecer»: `valor === null` significa «el default del widget»
// (y entonces NO se emite nada en el snippet); `porDefecto` es solo lo que se
// pinta en el swatch mientras no se toca.
function CampoColor({ etiqueta, descripcion, valor, porDefecto, onChange }: {
  etiqueta: string;
  descripcion: string;
  valor: string | null;
  porDefecto: string;
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <Field label={etiqueta} description={descripcion}>
        <ColorInput value={valor ?? porDefecto} onChange={onChange} />
      </Field>
      {valor !== null && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-1.5 text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Restablecer al color de marca
        </button>
      )}
    </div>
  );
}

// "Crecimiento web" vivía como pestaña propia de primer nivel (Fase 8) — se
// mueve aquí dentro porque es la misma superficie de negocio que "API": el
// widget público es el canal, esto es su cuadro de mando. Sub-navegación
// local (no el `sub` de page.tsx, que reconstruye la URL con `?tab=`): esta
// pantalla no tenía deep-link propio antes y no hace falta inventarlo ahora.
type Seccion = 'widgets' | 'crecimiento';

export function TabApi({ showToast }: { showToast: (m: string) => void }) {
  const { studio } = useStudio();
  const rol = useRol();
  const [seccion, setSeccion] = useState<Seccion>('widgets');

  if (!studio?.slug) return null;

  return (
    // max-w-5xl (no el max-w-2xl del resto de pestañas de una columna): el
    // builder es un layout de dos columnas config + preview/código, y a 2xl la
    // vista previa quedaba aplastada en ~250px.
    <div className="space-y-5 max-w-5xl">
      <div>
        <h2 className="text-[16px] font-semibold text-foreground">API</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Pon Tentare en tu propia web: seis widgets, uno por cada cosa que
          hace tu estudio, y qué tal les está yendo.
        </p>
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={() => setSeccion('widgets')}
          className={cn(
            'px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors',
            seccion === 'widgets' ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          Widgets
        </button>
        <button
          onClick={() => setSeccion('crecimiento')}
          className={cn(
            'px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors',
            seccion === 'crecimiento' ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          Crecimiento web
        </button>
      </div>
      {seccion === 'widgets' ? (
        <>
          <WidgetEmbebible slug={studio.slug} showToast={showToast} />
          {puedeGestionarAppsOAuth(rol) && <AppsConectadas showToast={showToast} />}
        </>
      ) : (
        <TabCrecimientoWeb showToast={showToast} />
      )}
    </div>
  );
}

// Apps de terceros con acceso OAuth al estudio (Zapier, y quien se registre
// después). Solo PROPIETARIO/MANAGER — mismo criterio que quién puede
// autorizar la conexión (puedeGestionarAppsOAuth, ver lib/permisos-reglas.ts).
interface AppConectada {
  clienteId: string;
  nombre: string;
  descripcion: string | null;
  logoUrl: string | null;
  scopes: string[];
  otorgadoEn: string;
}

function AppsConectadas({ showToast }: { showToast: (m: string) => void }) {
  const [apps, setApps] = useState<AppConectada[] | null>(null);
  const [revocando, setRevocando] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const headers = await authHeader();
      const res = await fetch('/api/oauth/consentimientos', { headers });
      if (!res.ok || cancelado) return;
      const data = await res.json();
      if (!cancelado) setApps(data.apps);
    })();
    return () => { cancelado = true; };
  }, []);

  async function revocar(clienteId: string) {
    setRevocando(clienteId);
    const headers = await authHeader();
    const res = await fetch('/api/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ clienteId }),
    });
    setRevocando(null);
    if (!res.ok) { showToast('No se pudo revocar el acceso'); return; }
    setApps(prev => (prev ?? []).filter(a => a.clienteId !== clienteId));
    showToast('Acceso revocado');
  }

  if (apps === null) return null;

  return (
    <div className={cn(cardCls, 'p-6')}>
      <div className="flex items-center gap-2 mb-1">
        <Plug size={15} className="text-muted-foreground" />
        <h3 className="text-[14px] font-semibold text-foreground">Aplicaciones conectadas</h3>
      </div>
      <p className="text-[12px] text-muted-foreground mb-4">
        Apps de terceros — como Zapier (conecta Tentare con miles de otras apps sin programar) — con permiso para acceder a los datos de tu estudio.
      </p>
      {apps.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">Ninguna aplicación conectada todavía.</p>
      ) : (
        <div className="space-y-2">
          {apps.map(a => (
            <div key={a.clienteId} className="flex items-center justify-between border border-border rounded-lg px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground truncate">{a.nombre}</p>
                <p className="text-[11px] text-muted-foreground truncate">{a.scopes.join(', ')}</p>
              </div>
              <button
                onClick={() => revocar(a.clienteId)}
                disabled={revocando === a.clienteId}
                className="shrink-0 px-3 py-1.5 rounded-lg border border-border text-[12px] text-foreground hover:bg-muted transition-colors disabled:opacity-40"
              >
                {revocando === a.clienteId ? 'Revocando…' : 'Revocar acceso'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WidgetEmbebible({ slug, showToast }: { slug: string; showToast: (m: string) => void }) {
  const { sesiones, tiposClase, salas, instructores, studio, updateStudio } = useStudio();
  const [activo, setActivo] = useState<(typeof WIDGETS)[number]['id']>('clases');
  const [copiado, setCopiado] = useState(false);
  const [sesionElegida, setSesionElegida] = useState('');
  // La config del builder, por tipo de widget. Arranca desde lo guardado en
  // studios.widget_builder (validado campo a campo) para que al volver a
  // entrar esté todo como se dejó — la ventaja sobre Momence, que lo pierde
  // todo al recargar.
  const [configs, setConfigs] = useState<Record<string, ConfigBuilder>>(
    () => leerConfigsGuardadas(studio?.widgetBuilder),
  );
  const config = configs[activo] ?? CONFIG_BUILDER_DEFECTO;
  // Guardado con debounce y SOLO tras una edición de la usuaria — nunca al
  // cargar/montar (la lección de [[autoguardado-linea-base-al-cargar]]: fijar
  // línea base al montar escribe datos que nadie tocó). Sin toast de error a
  // propósito: perder esta comodidad no rompe nada (el snippet copiado sigue
  // siendo válido), y un toast por cada tecleo de hex sería ruido.
  const guardarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (guardarTimer.current) clearTimeout(guardarTimer.current); }, []);
  function cambiar(parcial: Partial<ConfigBuilder>) {
    const siguientes = { ...configs, [activo]: { ...config, ...parcial } };
    setConfigs(siguientes);
    if (guardarTimer.current) clearTimeout(guardarTimer.current);
    guardarTimer.current = setTimeout(() => {
      void updateStudio({ widgetBuilder: siguientes as unknown as Record<string, unknown> });
    }, 1200);
  }
  const widget = WIDGETS.find(w => w.id === activo)!;
  const conFiltros = WIDGETS_CON_FILTROS.has(activo);
  // El default de diseño depende del modo (iframe abre en tira completa, el
  // bundle en rejilla ligera) — por eso `diseno: null` en la config significa
  // «el de este widget» y las pills lo traducen aquí.
  const disenoDefecto: 'completo' | 'ligero' = widget.modo === 'script' ? 'ligero' : 'completo';
  const origen = typeof window !== 'undefined' ? window.location.origin : '';

  // `Date.now()` no puede llamarse durante el render (regla de pureza del
  // React Compiler) — se fija tras montar, mismo patrón que `now` en
  // app/reservar/[slug]/page.tsx. No hace falta que se actualice sola: es
  // una pantalla de configuración, no el propio calendario en vivo.
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda de hidratación: `Date.now()` no puede llamarse en render, así que se fija tras montar. El segundo render es el OBJETIVO.
    setAhora(Date.now());
  }, []);

  // Próximas sesiones del estudio, para el widget "Reserva esta clase" — mismo
  // dato que ya carga el resto del panel (useStudio), sin fetch nuevo.
  const tiposClasePorId = useMemo(() => new Map(tiposClase.map(t => [t.id, t])), [tiposClase]);
  const proximasSesiones = useMemo(() => {
    if (ahora === null) return [];
    return sesiones
      .filter(s => !s.cancelada && new Date(s.inicio).getTime() > ahora)
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
      .slice(0, 50);
  }, [sesiones, ahora]);

  // Un tipo/instructora/sala borrados después de guardarse en el builder no
  // deben colarse en el snippet: un filtro por un id que ya no existe dejaría
  // el calendario vacío sin que nadie entienda por qué.
  const instructorasActivas = useMemo(() => instructores.filter(i => i.activo), [instructores]);
  const configEfectiva = useMemo<ConfigBuilder>(() => {
    const idsTipos = new Set(tiposClase.map(t => t.id));
    const idsInstructoras = new Set(instructorasActivas.map(i => i.id));
    const idsSalas = new Set(salas.map(s => s.id));
    return {
      ...config,
      tipos: config.tipos.filter(id => idsTipos.has(id)),
      instructoras: config.instructoras.filter(id => idsInstructoras.has(id)),
      salas: config.salas.filter(id => idsSalas.has(id)),
    };
  }, [config, tiposClase, instructorasActivas, salas]);

  const maxWidth = config.anchoCompleto ? '100%' : '480px';
  const sesionQuery = widget.requiereSesion && sesionElegida ? `&sesion=${encodeURIComponent(sesionElegida)}` : '';
  const src = `${origen}/reservar/${slug}?embed=1&tab=${widget.tabParam}${sesionQuery}${paramsSnippetIframe(configEfectiva, conFiltros)}`;
  // La vista previa del iframe se recarga entera con cada cambio de src — un
  // hex a medio teclear la remontaría en cada pulsación. El SNIPPET sí cambia
  // en vivo sin debounce: es texto, no cuesta nada.
  const [srcPreview, setSrcPreview] = useState(src);
  useEffect(() => {
    const t = setTimeout(() => setSrcPreview(src), 300);
    return () => clearTimeout(t);
  }, [src]);
  // Id único por widget (no solo por estudio): una web puede embeber varios
  // widgets del mismo estudio a la vez (clases + citas), y el listener de
  // abajo necesita distinguir qué iframe redimensionar. Para "Reserva esta
  // clase" hace falta ir un paso más allá: la propietaria puede embeber DOS
  // widgets de este tipo en la misma página (p. ej. un newsletter con 3
  // clases distintas) — sin la sesión en el id, ambos <iframe> compartirían
  // el mismo id y el auto-resize solo funcionaría para el primero.
  const iframeId = widget.requiereSesion
    ? `tentare-widget-${slug}-${widget.id}-${sesionElegida}`
    : `tentare-widget-${slug}-${widget.id}`;
  // Sin sesión elegida, "Reserva esta clase" no genera código — un widget
  // roto (calendario entero en vez de la clase concreta que se quería) es
  // peor que no ofrecer nada todavía, mismo criterio que ya usa este fichero
  // para no ofrecer vídeos/comunidad/tarjetas regalo. Igual con el embebido
  // sin iframe: sin al menos un dominio autorizado, CORS lo bloqueará en
  // silencio en cuanto lo peguen — mejor no dar el código todavía.
  const dominiosAutorizados = studio?.widgetDominiosAutorizados ?? [];
  const listo = widget.modo === 'script'
    ? dominiosAutorizados.length > 0
    : !widget.requiereSesion || sesionElegida !== '';
  // Auto-resize (audit de rendimiento): la página embebida avisa su altura
  // real por postMessage (ver useEffect de embedMode en
  // app/reservar/[slug]/page.tsx) — este script la escucha y ajusta el
  // iframe, así el contenido nunca queda cortado ni con hueco muerto. Se
  // incluye en el propio código a copiar porque un <iframe> suelto no puede
  // ejecutar nada en la página anfitriona.
  // El bundle embebible (public/widget.js) NO usa iframe/postMessage — se
  // monta en Shadow DOM dentro de la propia página del estudio, así que su
  // código a copiar es un `<div>`+`<script>` sueltos, sin el listener de
  // auto-resize (no hace falta: es contenido normal de la página, no un
  // documento aparte con su propia altura que comunicar).
  const codigoScript = `<div data-tentare-booking data-studio="${slug}"${atributosSnippetScript(configEfectiva)}></div>
<script src="${origen}/widget.js" async></script>`;
  // `allow="payment"` es lo que delega el Feature-Policy de pago al iframe:
  // sin él, el checkout embebido de Stripe (Payment Request API/Apple Pay)
  // sondea el soporte de wallet al montar y Safari lo rechaza con
  // `SecurityError: Third-party iframes are not allowed to request
  // payments...` (Sentry JAVASCRIPT-NEXTJS-1R) — nunca llega a pintarse el
  // botón de pago con tarjeta normal, pero la promesa interna de Stripe
  // revienta sin capturar. No cambia nada más: solo habilita la Payment
  // Request API dentro de este iframe concreto.
  // P0-3 (mobile UX): además del auto-resize, el snippet informa al iframe de
  // qué franja de él está visible en la pantalla real (`tentareHostViewport`)
  // y atiende `tentareScrollTo` — el script vive en lib/reservar/snippet-embed
  // (función pura) para que el e2e monte una página anfitriona con EL MISMO
  // código que se copia de verdad. Ver el comentario largo allí.
  const codigoIframe = `<iframe id="${iframeId}" src="${src}" style="width:100%;max-width:${maxWidth};height:${widget.alto}px;border:0;border-radius:12px;" title="${widget.nombre}" allow="payment"></iframe>
${scriptSnippetIframe({ origen, slug, iframeId })}`;
  const codigo = widget.modo === 'script' ? codigoScript : codigoIframe;

  async function copiar() {
    if (!(await copiarAlPortapapeles(codigo))) {
      // Decir «copiado» y que no lo esté es peor que decir que no: se iría a su
      // web a pegar nada y daría por roto el widget.
      showToast('No se pudo copiar. Selecciona el código y cópialo a mano.');
      return;
    }
    setCopiado(true);
    showToast('Código copiado');
    setTimeout(() => setCopiado(false), 2000);
  }

  // Misma auto-resize para la vista previa DENTRO del panel — el listener de
  // arriba solo se activa en la web anfitriona una vez pegado el código.
  //
  // P2 de la auditoría del checkout, punto 1 — este listener no validaba
  // `e.origin`. A diferencia del snippet público (ver el comentario largo en
  // lib/reservar/snippet-embed.ts), esto vive DETRÁS de login en el panel: el
  // peor caso real es que otra pestaña ya autenticada en el panel le cambie el
  // alto a un iframe de mentira — higiene, no un agujero — pero validar cuesta
  // lo mismo que no hacerlo. `origen` ya está calculado arriba en este mismo
  // componente para construir `src`/`codigoIframe` — se reutiliza, no se
  // recalcula. `e.source` se compara contra `previewRef.current.contentWindow`
  // en vez de contra el iframe del snippet copiado (ese vive en otra página);
  // aquí la única fuente legítima es la vista previa que este propio
  // componente monta.
  const previewRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (
        e.origin !== origen
        || e.source !== previewRef.current?.contentWindow
        || !e.data?.tentareEmbedAltura
        || e.data?.tentareSlug !== slug
      ) return;
      if (previewRef.current) previewRef.current.style.height = `${Math.min(e.data.tentareEmbedAltura, 900)}px`;
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [slug, origen]);

  return (
    <div className={cn(cardCls, 'p-6')}>
      <h3 className="text-[14px] font-semibold text-foreground mb-1">Widgets para tu web</h3>
      <p className="text-[12px] text-muted-foreground mb-5">
        Elige cuál quieres y pega su código en WordPress, Squarespace, Wix o
        en el HTML de tu web si la has hecho con código propio.
      </p>

      <BloqueSeccion titulo="Elige tu widget">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {WIDGETS.map(w => {
            const Icono = WIDGET_ICONOS[w.id];
            const seleccionado = activo === w.id;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => setActivo(w.id)}
                aria-pressed={seleccionado}
                className={cn(
                  'flex items-start gap-3 text-left rounded-xl border px-3.5 py-3 transition-colors',
                  seleccionado ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted',
                )}
              >
                <span
                  className={cn(
                    'shrink-0 flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
                    seleccionado ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icono size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-foreground">{w.nombre}</span>
                  <span className="block text-[11px] text-muted-foreground mt-0.5 leading-snug">{w.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </BloqueSeccion>

      <div className="h-px bg-border my-6" />

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-x-8 gap-y-6">
        <div className="space-y-7 min-w-0">
          {(conFiltros || widget.requiereSesion) && (
            <BloqueSeccion titulo="Elige qué mostrar">
              <div className="space-y-5">
                {widget.requiereSesion && (
                  <>
                    <Field label="Qué clase" description="A qué sesión concreta apunta este widget.">
                      <select
                        value={sesionElegida}
                        onChange={e => setSesionElegida(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground"
                      >
                        <option value="">Elige una clase próxima…</option>
                        {proximasSesiones.map(s => {
                          const tipo = tiposClasePorId.get(s.tipoClaseId);
                          const fecha = new Date(s.inicio).toLocaleString('es-ES', {
                            weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          });
                          return (
                            <option key={s.id} value={s.id}>
                              {tipo?.nombre ?? 'Clase'} — {fecha}
                            </option>
                          );
                        })}
                      </select>
                    </Field>
                    {proximasSesiones.length === 0 && (
                      <p className="text-[11px] text-muted-foreground -mt-3.5">
                        No hay clases próximas todavía — crea alguna en el calendario primero.
                      </p>
                    )}
                  </>
                )}
                {conFiltros && (
                  <>
                    <FilaAjuste
                      etiqueta="Filtro de tiempo inicial"
                      descripcion="Con qué ventana de días abre el calendario en tu web."
                    >
                      <Pills
                        label="Filtro de tiempo inicial"
                        opciones={[{ valor: 'todo', nombre: 'Mostrar todo' }, { valor: 'hoy', nombre: 'Hoy' }] as const}
                        valor={config.vista}
                        onChange={v => cambiar({ vista: v })}
                      />
                    </FilaAjuste>
                    <MultiSelector
                      etiqueta="Tipos de clase"
                      descripcion="Marca solo los que quieras enseñar. Sin nada marcado, se enseñan todos."
                      opciones={tiposClase}
                      seleccion={config.tipos}
                      onChange={ids => cambiar({ tipos: ids })}
                    />
                    <MultiSelector
                      etiqueta="Instructoras"
                      descripcion="Solo las clases de las que marques. Sin nada marcado, todas."
                      opciones={instructorasActivas}
                      seleccion={config.instructoras}
                      onChange={ids => cambiar({ instructoras: ids })}
                    />
                    <MultiSelector
                      etiqueta="Salas"
                      descripcion="Solo las clases de las salas que marques. Sin nada marcado, todas."
                      opciones={salas}
                      seleccion={config.salas}
                      onChange={ids => cambiar({ salas: ids })}
                    />
                    <div className="space-y-4 pt-1">
                      <FilaToggle
                        etiqueta="Ocultar precio"
                        descripcion="Las clases se enseñan y se reservan sin el precio a la vista."
                        on={config.ocultarPrecio}
                        onChange={v => cambiar({ ocultarPrecio: v })}
                      />
                      <FilaToggle
                        etiqueta="Ocultar nivel"
                        descripcion="Quita la etiqueta de nivel (principiante, medio…) de cada clase."
                        on={config.ocultarNivel}
                        onChange={v => cambiar({ ocultarNivel: v })}
                      />
                      <FilaToggle
                        etiqueta="Ocultar sustituta"
                        descripcion="No avisa de que una clase la da una sustituta ese día."
                        on={config.ocultarSustituta}
                        onChange={v => cambiar({ ocultarSustituta: v })}
                      />
                    </div>
                  </>
                )}
              </div>
            </BloqueSeccion>
          )}

          <BloqueSeccion titulo="Personaliza apariencia y colores">
            <div className="space-y-5">
              {conFiltros && (
                <FilaAjuste
                  etiqueta="Tipo de diseño"
                  descripcion="Completo: tira de días con el día abierto. Ligero: rejilla compacta de la semana."
                >
                  <Pills
                    label="Tipo de diseño"
                    opciones={[{ valor: 'completo', nombre: 'Completo' }, { valor: 'ligero', nombre: 'Ligero' }] as const}
                    valor={config.diseno ?? disenoDefecto}
                    onChange={v => cambiar({ diseno: v === disenoDefecto ? null : v })}
                  />
                </FilaAjuste>
              )}
              <CampoColor
                etiqueta="Color de fondo"
                descripcion="El lienzo detrás del widget. Sin tocar, se queda el de siempre."
                valor={config.fondo}
                porDefecto={MODO_TOKENS.dia.bg}
                onChange={v => cambiar({ fondo: v })}
              />
              <CampoColor
                etiqueta="Color primario"
                descripcion="El botón de reservar y los acentos del calendario."
                valor={config.marca}
                porDefecto={widget.modo === 'script' ? COLOR_WIDGET_POR_DEFECTO : (studio?.colorPrimario ?? COLOR_WIDGET_POR_DEFECTO)}
                onChange={v => cambiar({ marca: v })}
              />
              <CampoColor
                etiqueta="Color negro"
                descripcion="El color del texto principal — para una web oscura, uno claro."
                valor={config.negro}
                porDefecto={MODO_TOKENS.dia.ink}
                onChange={v => cambiar({ negro: v })}
              />
              <SelectorFuente
                etiqueta="Tipografía"
                ayuda={widget.modo === 'script'
                  ? 'La cargamos nosotros en tu web. Sin tocar, la del sistema.'
                  : 'Sin tocar, la del tema publicado (Apariencia).'}
                valor={config.fuente}
                onChange={v => cambiar({ fuente: v })}
                etiquetaPorDefecto={widget.modo === 'script' ? 'La del sistema' : 'La del tema publicado'}
              />
              <SelectorFuente
                etiqueta="Tipografía de titulares"
                ayuda="Solo el nombre de la clase, la fecha/hora grande y el precio — el resto del texto (etiquetas, botones) usa la de arriba."
                valor={config.fuenteDisplay}
                onChange={v => cambiar({ fuenteDisplay: v })}
                etiquetaPorDefecto="Igual que la de arriba"
              />
              {widget.modo !== 'script' && (
                <FilaAjuste etiqueta="Ancho" descripcion="Cómo se comporta el recuadro embebido (técnicamente, un iframe) dentro de tu web.">
                  <Pills
                    label="Ancho del widget"
                    opciones={[{ valor: 'compacto', nombre: 'Compacto (480px)' }, { valor: 'completo', nombre: 'Ancho completo' }] as const}
                    valor={config.anchoCompleto ? 'completo' : 'compacto'}
                    onChange={v => cambiar({ anchoCompleto: v === 'completo' })}
                  />
                </FilaAjuste>
              )}
              {widget.modo === 'script' && (
                <GestionDominios
                  dominios={dominiosAutorizados}
                  onGuardar={dominios => updateStudio({ widgetDominiosAutorizados: dominios })}
                  showToast={showToast}
                />
              )}
            </div>
          </BloqueSeccion>
        </div>

        <div className="space-y-6 min-w-0">
          <BloqueSeccion titulo="Vista previa">
            <div className="rounded-xl border border-border bg-background overflow-y-auto" style={{ maxHeight: 640 }}>
              {widget.modo === 'script' ? (
                <PreviewWidgetScript slug={slug} config={configEfectiva} />
              ) : listo ? (
                <iframe ref={previewRef} key={`${activo}-${sesionElegida}`} src={srcPreview} title={`Vista previa: ${widget.nombre}`} className="w-full" style={{ border: 0, height: widget.alto }} allow="payment" />
              ) : (
                <div className="flex items-center justify-center h-40 text-[12px] text-muted-foreground text-center px-4">
                  Elige una clase en «Elige qué mostrar» para generar la vista previa.
                </div>
              )}
            </div>
          </BloqueSeccion>

          <BloqueSeccion
            titulo="Código para pegar en tu web"
            descripcion="Esto es más técnico — si no lo entiendes, pásaselo a quien lleve tu web."
            accion={listo ? (
              <button
                onClick={copiar}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-medium text-foreground hover:bg-muted transition-colors"
              >
                {copiado ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                {copiado ? 'Copiado' : 'Copiar código'}
              </button>
            ) : undefined}
          >
            {listo ? (
              <>
                <CodigoResaltado codigo={codigo} />
                <p className="text-[11px] text-muted-foreground mt-2">
                  El código ya lleva toda la configuración de esta pantalla. Si
                  ya lo pegaste en tu web, reemplázalo después de cambiar algo
                  aquí — el widget instalado no se actualiza solo.
                </p>
              </>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                {widget.modo === 'script'
                  ? 'Autoriza al menos un dominio en «Personaliza apariencia y colores» para generar el código.'
                  : 'Elige una clase en «Elige qué mostrar» para generar el código.'}
              </p>
            )}
          </BloqueSeccion>
        </div>
      </div>
    </div>
  );
}

// Vista previa en vivo del widget "Calendario embebido" — mismo componente y
// mismo hook de datos que monta app/widget-bundle/main.tsx, así que lo que se
// ve aquí es EXACTAMENTE lo que verá la visitante, no una maqueta aparte.
// Componente separado (no un `if` dentro de WidgetEmbebible) para que
// useDatosWidget solo pida datos públicos cuando esta pestaña está activa —
// las reglas de los hooks no permiten llamarlo condicionalmente en el padre.
function PreviewWidgetScript({ slug, config }: { slug: string; config: ConfigBuilder }) {
  // Referencia estable para el useMemo de `slots` en useDatosWidget — los
  // arrays de la config solo cambian de identidad cuando la usuaria toca un
  // filtro, así que esto solo recalcula entonces.
  const filtros = useMemo<FiltrosSlots>(
    () => ({ tipos: config.tipos, instructoras: config.instructoras, salas: config.salas }),
    [config.tipos, config.instructoras, config.salas],
  );
  const { slots, cargando, error, recargar } = useDatosWidget(slug, '', filtros);
  // Mismo tema derivado que construye app/widget-bundle/main.tsx con
  // data-fondo/data-negro: tokens pisados sobre MODO_TOKENS.dia, nunca un
  // filtro CSS por encima — lo que se ve aquí es lo que montará el bundle.
  const t = useMemo(() => ({
    ...MODO_TOKENS.dia,
    ...(config.negro ? { ink: config.negro } : {}),
    ...(config.fondo ? { bg: config.fondo } : {}),
  }), [config.negro, config.fondo]);
  // Tipografía: mismo par de pasos que hará montarUno en la web real —
  // <link> de Google Fonts en el documento (aquí, el del panel) + las vars en
  // el contenedor. Solo nombres YA válidos (fuenteSnippet): uno a medio
  // teclear no pide nada. Los <link> se quedan hasta salir de la pantalla —
  // limpiarlos a mitad de tecleo haría parpadear la previa, y son hojas de
  // fuentes deduplicadas, no una fuga.
  const fuentePrevia = fuenteSnippet(config.fuente);
  const fuenteDisplayPrevia = fuenteSnippet(config.fuenteDisplay);
  useEffect(() => {
    for (const nombre of [fuentePrevia, fuenteDisplayPrevia]) {
      const url = urlFuenteGoogle(nombre);
      if (!url || document.head.querySelector(`link[href="${url}"]`)) continue;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      document.head.appendChild(link);
    }
  }, [fuentePrevia, fuenteDisplayPrevia]);
  const fuenteUiPrevia = fuentePrevia ? familiaCssDe(fuentePrevia) : "'Instrument Sans', system-ui, sans-serif";
  const displayPrevia = fuenteDisplayPrevia ? familiaCssDe(fuenteDisplayPrevia)
    : fuentePrevia ? familiaCssDe(fuentePrevia) : "'Instrument Serif', Georgia, serif";
  // Mismo cálculo que app/widget-bundle/main.tsx (el mismo componente pinta
  // el bundle real) — sin esto la vista previa mentía: un estudio con marca
  // clara veía aquí un texto legible mientras el bundle real, con el
  // beige fijo de antes, se lo dejaba invisible (bug real en producción,
  // 2026-08-26).
  const marcaPrevia = config.marca ?? COLOR_WIDGET_POR_DEFECTO;
  const lPrevia = luminancia(marcaPrevia);
  return (
    <div
      style={{
        // Mismas CSS vars que fija app/widget-bundle/main.tsx al montar el
        // bundle real — el resto de tokens de color salen de `--portal-*`,
        // ninguno hardcodeado aquí.
        '--portal-brand': marcaPrevia,
        '--portal-brand-foreground': lPrevia != null && lPrevia < 0.45 ? '#FFFFFF' : '#22261F',
        '--success': '#2F6B4F',
        '--warning': '#8F6215',
        '--destructive': '#A8442A',
        '--font-ui': fuenteUiPrevia,
        '--font-display': displayPrevia,
        '--portal-heading-font': displayPrevia,
        fontFamily: fuenteUiPrevia,
        ...(config.fondo ? { background: config.fondo } : {}),
      } as CSSProperties}
      className="p-4"
    >
      <ReservaCalendario
        t={t}
        slots={slots}
        onReservar={() => {}}
        onCancelar={() => {}}
        vacio={{ titulo: 'No hay clases disponibles', cuerpo: 'Vuelve a mirar más tarde.' }}
        estiloDias={config.diseno === 'completo' ? 'dias' : 'grid'}
        vistaInicial={config.vista}
        ocultarPrecio={config.ocultarPrecio}
        ocultarNivel={config.ocultarNivel}
        ocultarSustituta={config.ocultarSustituta}
        loading={cargando}
        error={error ? { onReintentar: recargar, titulo: 'No hemos podido cargar el horario' } : undefined}
        // Mismo motivo que app/widget-bundle/main.tsx: esta vista previa es
        // literalmente el mismo componente que monta el bundle real, así que
        // tiene que llevar la misma prop o dejaría de ser fiel.
        estiloFicha="inline"
      />
    </div>
  );
}

// Lista blanca de orígenes para el bundle embebible (studios.widget_dominios_autorizados,
// lib/cors-widget.ts) — sin esto configurado, el navegador de cualquier
// visitante bloquea las peticiones del widget por CORS, en silencio (la
// consola del NAVEGADOR de la visitante, no algo que la propietaria vea).
function GestionDominios({ dominios, onGuardar, showToast }: {
  dominios: string[];
  onGuardar: (dominios: string[]) => Promise<{ ok: boolean; error?: string }>;
  showToast: (m: string) => void;
}) {
  const [nuevo, setNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);

  function normalizar(valor: string): string | null {
    const v = valor.trim().replace(/\/+$/, '');
    if (!v) return null;
    try {
      const u = new URL(v.includes('://') ? v : `https://${v}`);
      return u.origin;
    } catch {
      return null;
    }
  }

  async function anadir() {
    const origenNuevo = normalizar(nuevo);
    if (!origenNuevo) { showToast('Escribe un dominio válido, p. ej. midominio.com'); return; }
    if (dominios.includes(origenNuevo)) { setNuevo(''); return; }
    setGuardando(true);
    const r = await onGuardar([...dominios, origenNuevo]);
    setGuardando(false);
    if (!r.ok) { showToast(r.error ?? 'No se pudo guardar el dominio'); return; }
    setNuevo('');
    // Fire-and-forget: registra el dominio recién autorizado como dominio de
    // wallets (Apple Pay/Google Pay) sobre la cuenta conectada del estudio.
    // Sin esto, Apple Pay nunca aparece en el checkout embebido en la web del
    // estudio (Modo B). El endpoint lee de la BD lo que se acaba de guardar y
    // es no-op si el estudio no tiene Stripe conectado; su fallo no afecta al
    // guardado, que ya está hecho.
    void (async () => {
      const headers = await authHeader();
      await fetch('/api/widget/dominios-wallet', { method: 'POST', headers });
    })().catch(() => { /* mejora, no requisito: el registro se reintenta al volver a guardar */ });
  }

  async function quitar(origenAQuitar: string) {
    setGuardando(true);
    const r = await onGuardar(dominios.filter(d => d !== origenAQuitar));
    setGuardando(false);
    if (!r.ok) showToast(r.error ?? 'No se pudo quitar el dominio');
  }

  return (
    <div>
      <p className="text-[13px] font-semibold text-foreground">Dominios autorizados</p>
      <p className="text-[12px] text-muted-foreground mt-0.5 mb-2 leading-relaxed">
        Solo estas webs podrán cargar el widget — protege contra que otro sitio lo copie sin permiso.
      </p>
      {dominios.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {dominios.map(d => (
            <span key={d} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[11px] text-foreground bg-muted/40">
              {d}
              <button onClick={() => quitar(d)} disabled={guardando} className="text-muted-foreground hover:text-destructive" aria-label={`Quitar ${d}`}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={nuevo}
          onChange={e => setNuevo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); anadir(); } }}
          placeholder="midominio.com"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground"
        />
        <button
          onClick={anadir}
          disabled={guardando}
          className="px-3 py-2 rounded-lg border border-border text-[12px] font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-40"
        >
          Añadir
        </button>
      </div>
    </div>
  );
}
