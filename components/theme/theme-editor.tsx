'use client';

import { useEffect, useState } from 'react';
import { Check, AlertTriangle, Sparkles, Eye, EyeOff } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { WidgetPreview } from './widget-preview';
import { usePermisos } from '@/lib/permisos';
import {
  fetchThemeBorrador,
  guardarThemeBorrador,
  publicarThemeApi,
} from '@/lib/api-client';
import {
  subirLogoEstudio,
  eliminarLogoEstudio,
  subirFaviconEstudio,
  eliminarFaviconEstudio,
  subirImagenBienvenida,
  eliminarImagenBienvenida,
  subirImagenPortal,
} from '@/lib/portal-storage';
import {
  DEFAULT_THEME, FUENTES, RADIOS, ESTILOS_BOTON, ESTILOS_TARJETA, REDES_SOCIALES_IDS,
  type ThemeConfig, type RedSocialId, POSICION_FOTO,
  SEO_TITULO_MAX, SEO_DESCRIPCION_MAX,
  RESERVAR_TITULAR_MAX, RESERVAR_SUBTITULO_MAX, RESERVAR_CTA_MAX,
  RESERVAR_AVISO_QUIZ_MAX, RESERVAR_VACIO_TITULO_MAX, RESERVAR_VACIO_TEXTO_MAX,
  RESERVAR_CONFIRMACION_MAX, RESERVAR_LISTA_ESPERA_MAX, RESERVAR_AYUDA_MAX,
  RESERVAR_COMO_FUNCIONA_MAX,
  RESERVAR_SOBRE_TITULO_MAX, RESERVAR_SOBRE_TEXTO_MAX,
} from '@/lib/theme-schema';
import { metadatosPublicos, tituloAutomatico, descripcionAutomatica, IMAGEN_COMPARTIR_POR_DEFECTO } from '@/lib/theme/seo-publico';
import { PanelVisibilidad } from './panel-visibilidad';
import { validarContrasteTheme, themeToCssVars } from '@/lib/theme-runtime';
import { resolveVariantes } from '@/lib/theme-variantes';
import { crearHistorial, registrar, deshacer as deshacerHist, rehacer as rehacerHist } from '@/lib/theme/editor-historial';
import { CamposForm, FilaOpciones } from './inspector/campos-form';
import type { CampoSchema } from '@/lib/theme/campos';
import {
  CAMPOS_FORMA_PORTAL, CAMPOS_BARRA_PORTAL, CAMPOS_ACENTO, CAMPOS_RADIO, CAMPOS_ESCALA_TEXTO,
  valoresFormaDesdeTema, escrituraDeCampoForma,
} from '@/lib/theme/campos-forma';
import { type ThemeDefinition } from '@/lib/theme-definitions';
import { derivarPaleta } from '@/lib/color-utils';
import { NAV_DISPONIBLES, NAV_ICONOS_DISPONIBLES, navItemsVisibles, resolveNavConfig, type NavSegId, type NavIconoId } from '@/lib/portal-nav';
import { PortalNav } from '@/components/portal/portal-nav';
import { altura } from '@/lib/portal-design';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';
import { IMAGENES_POR_DEFECTO } from '@/lib/imagenes-por-defecto';
import { CampoImagen } from '@/components/ui/campo-imagen';

// "Ajustes" del workspace de Apariencia (theme-workspace.tsx) — color de
// marca, tipografía, radios, navegación del portal, redes sociales, logo/
// favicon. Es GLOBAL, no depende de la página que se esté mirando (mismo
// criterio que Shopify: Settings no es una página, es transversal a todo el
// tema). Separado en hook (estado/persistencia) + lista de categorías
// (columna izquierda) + panel por categoría (columna derecha) para montarse
// dentro del workspace único.

// "Tema" ya NO es una categoría de aquí: elegir tema pasó a ser su propia
// pantalla (components/theme/theme-library.tsx), donde cada uno se ve pintado
// antes de instalarlo. Este panel es solo el ajuste fino de lo ya instalado —
// tenerlo en dos sitios dejaba dos galerías distintas para lo mismo.
export const AJUSTES_CATEGORIAS = [
  { id: 'paleta', label: 'Empieza con una paleta' },
  { id: 'color-marca', label: 'Color de marca' },
  { id: 'tipografia', label: 'Tipografía' },
  { id: 'esquinas', label: 'Esquinas' },
  { id: 'boton', label: 'Botón principal' },
  { id: 'tarjetas', label: 'Tarjetas' },
  { id: 'forma-portal', label: 'Forma del portal' },
  { id: 'navegacion-portal', label: 'Navegación del portal' },
  { id: 'redes-sociales', label: 'Redes sociales' },
  // ⚠️ Se llamaba "Logo y favicon", y ese nombre escondía lo más buscado de
  // toda la categoría: la FOTO del portal. El feedback fue literal — «no se
  // puede poner imagen en la bienvenida ni en las tarjetas» — cuando sí se
  // podía desde el principio: esa misma foto es el fondo de la pantalla de
  // acceso, de la bienvenida Y de la tarjeta grande del Inicio
  // (`conFoto` en portal-home-view.tsx). No faltaba la función, faltaba
  // encontrarla. Nombrar la categoría por lo que la propietaria viene a hacer
  // —poner sus fotos— y no por los dos ficheros técnicos que también lleva.
  { id: 'logo-favicon', label: 'Imágenes de tu marca' },
  // Lo que se ve al pegar tu enlace en un grupo de WhatsApp o en Instagram, y
  // en el resultado de Google. Va al final porque no es aspecto, pero está
  // aquí y no en Configuración a propósito: se decide mirando la misma página
  // que se está editando, y se publica con ella.
  { id: 'compartir', label: 'Compartir y buscadores' },
  // La portada del WIDGET que el estudio incrusta en su web. Sus textos eran
  // constantes del código —el mismo titular servido a todos— hasta que se
  // hicieron editables; esta categoría es donde se escriben.
  { id: 'reservar-portada', label: 'Portada de tu página de reservas' },
  // Categoría aparte y no un campo más en la de arriba: la portada son los
  // textos que ADORNAN una página que ya existe, y esto es una SECCIÓN que no
  // existe hasta que se escribe. Mezclarlas escondería que escribir aquí hace
  // aparecer algo nuevo en la página.
  { id: 'reservar-sobre', label: 'Sobre nosotros' },
  // Los textos que le HABLAN a la clienta, separados de la portada porque no
  // adornan: aparecen en momentos concretos (no hay clases, te apuntas a la
  // lista de espera, se confirma tu reserva) y ahí la voz del estudio cambia
  // algo. Ver la nota de `theme-schema.ts` sobre por qué son SIETE y no los
  // ~132 literales del widget.
  { id: 'reservar-voz', label: 'Cómo le hablas a tu clienta' },
  // ⚠️ Categoría aparte del resto del tema, y es lo que la hace existir: todo
  // lo demás de esta columna describe el PORTAL de la socia. Esto describe cómo
  // encaja el widget en la web del ESTUDIO, que es otra superficie con otro
  // dueño. Mezclarlos obligaba a estropear una para arreglar la otra.
  { id: 'reservar-widget', label: 'Widget en tu web' },
  // El único ajuste de esta columna que NO pasa por Publicar — tiene efecto al
  // momento, y el panel lo dice. Está aquí y no en Configuración porque es
  // donde se busca: junto a lo demás de la cara pública del estudio.
  { id: 'visibilidad', label: 'Visibilidad de tu página' },
] as const;
export type AjustesCategoriaId = (typeof AJUSTES_CATEGORIAS)[number]['id'];

const CAMPOS_COLOR: { key: keyof ThemeConfig; label: string }[] = [
  { key: 'secondary', label: 'Secundario' },
  { key: 'accent', label: 'Acento (fondos suaves)' },
  { key: 'background', label: 'Fondo' },
  { key: 'text', label: 'Texto' },
];

const RED_SOCIAL_LABEL: Record<RedSocialId, string> = {
  instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp',
};
const RED_SOCIAL_PLACEHOLDER: Record<RedSocialId, string> = {
  instagram: 'https://instagram.com/tu-estudio',
  facebook: 'https://facebook.com/tu-estudio',
  whatsapp: 'https://wa.me/34600000000',
};

// Paletas de arranque: el usuario elige un color de marca bonito y el resto de
// la paleta se deriva armónicamente (derivarPaleta). Después puede afinar.
const PALETAS: { label: string; primary: string }[] = [
  { label: 'Rosa', primary: '#FFC8E2' },
  { label: 'Terracota', primary: '#C2410C' },
  { label: 'Océano', primary: '#0F766E' },
  { label: 'Ciruela', primary: '#6D28D9' },
  { label: 'Índigo', primary: '#4F46E5' },
  { label: 'Esmeralda', primary: 'var(--success)' },
  { label: 'Burdeos', primary: '#7F1D1D' },
  { label: 'Arena', primary: '#B08968' },
  { label: 'Coral', primary: '#FF6F61' },
  { label: 'Grafito', primary: '#334155' },
];

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const hexValido = /^#([0-9a-fA-F]{6})$/.test(value);
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[13px] font-medium text-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 text-[12px] font-mono px-2 py-1.5 rounded-lg border border-border bg-background"
          aria-label={label}
        />
        <input
          type="color"
          value={hexValido ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded-lg border border-border cursor-pointer bg-transparent"
          aria-label={`Selector de ${label}`}
        />
      </span>
    </label>
  );
}

export function useThemeEditor() {
  const { studio, updateStudio } = useStudio();
  const { rol } = usePermisos();
  // El borrador del tema vive DENTRO de un historial, igual que los bloques.
  // Antes el botón "Deshacer" de la barra decía en su propio tooltip que "los
  // ajustes del tema todavía no entran": cambiar un color no se podía
  // deshacer, y quien probaba cinco paletas seguidas no tenía vuelta atrás.
  const [hist, setHist] = useState(() => crearHistorial(DEFAULT_THEME));
  const draft = hist.presente;
  /**
   * Todas las ediciones del tema pasan por aquí, así que hay UN solo punto
   * donde registrar un paso. `clave` funde pulsaciones seguidas sobre el mismo
   * campo: teclear un hex es un paso, no seis.
   */
  function setDraft(f: (d: ThemeConfig) => ThemeConfig, clave?: string) {
    setHist((h) => registrar(h, f(h.presente), { clave }));
  }
  /**
   * Reemplaza la BASE del historial en vez de apilar un paso. Para la carga
   * inicial y para "restaurar": ninguna de las dos es una edición, y apilarlas
   * haría que el primer deshacer devolviera al tema de fábrica en vez de a lo
   * que la propietaria tenía. Mismo criterio que `useBloquesEditor`.
   */
  function rebasar(t: ThemeConfig) {
    setHist(crearHistorial(t));
  }
  const [estado, setEstado] = useState<'cargando' | 'listo'>('cargando');
  const [guardando, setGuardando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [subiendo, setSubiendo] = useState<'logo' | 'favicon' | 'bienvenida' | 'compartir' | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchThemeBorrador()
      .then((t) => {
        if (vivo) rebasar(t);
      })
      .catch(() => {})
      .finally(() => {
        if (vivo) setEstado('listo');
      });
    return () => {
      vivo = false;
    };
  }, []);

  const contraste = validarContrasteTheme(draft);
  // `draft.navPortal`/`draft.redesSociales` pueden faltar en un tema que no
  // pasó por resolveTheme (parcial/legado) — nunca se leen crudos.
  const navPortalResuelto = resolveNavConfig(draft.navPortal);
  const redesSocialesResueltas = { instagram: '', facebook: '', whatsapp: '', ...(draft.redesSociales as Partial<Record<RedSocialId, string>> | undefined) };

  // Cualquier edición manual ("Personalizar") marca el tema como
  // personalizado: la tarjeta del tema elegido en "Tema" deja de decir solo
  // "Geométrico" para decir "Geométrico (personalizado)" — es el estado de
  // deriva que permitirá en el futuro avisar de actualizaciones sin pisar lo
  // que el estudio ya tocó a mano.
  function setCampo<K extends keyof ThemeConfig>(key: K, value: ThemeConfig[K]) {
    // La clave es el campo: teclear un hex letra a letra es UN paso.
    setDraft((d) => ({ ...d, [key]: value, themeCustomized: true }), String(key));
    setAviso(null);
  }

  // Aplica una paleta completa derivada de un color de marca (mantiene fuente,
  // radius y favicon actuales).
  function aplicarPaleta(primary: string) {
    const p = derivarPaleta(primary);
    setDraft((d) => ({ ...d, primary, secondary: p.secondary, accent: p.accent, background: p.background, text: p.text, themeCustomized: true }));
    setAviso(null);
  }

  // Elegir una tarjeta de "Tema": aplica sus defaults de golpe (no campo a
  // campo con setCampo, que marcaría themeCustomized) y fija de qué tema/
  // versión parte el borrador — el tema "puro", hasta que el estudio toque
  // algo en "Personalizar".
  function elegirTema(def: ThemeDefinition) {
    setDraft((d) => ({ ...d, ...def.defaults, themeId: def.id, themeVersion: def.version, themeCustomized: false }));
    setAviso(null);
  }

  // Navegación del portal (Fase 2 del Theme Builder): ocultar/renombrar/
  // cambiar icono de una pestaña. `home` nunca se puede ocultar — es el
  // destino de login del portal (ver resolveNavConfig en lib/portal-nav.ts,
  // que también lo protege server-side si algo se cuela por aquí).
  function toggleNavOculto(seg: NavSegId) {
    if (seg === 'home') return;
    setDraft((d) => {
      const actual = resolveNavConfig(d.navPortal);
      const ocultos = actual.ocultos.includes(seg)
        ? actual.ocultos.filter((s) => s !== seg)
        : [...actual.ocultos, seg];
      return { ...d, navPortal: { ...actual, ocultos }, themeCustomized: true };
    });
    setAviso(null);
  }

  function setNavEtiqueta(seg: NavSegId, valor: string) {
    setDraft((d) => {
      const actual = resolveNavConfig(d.navPortal);
      const etiquetas = { ...actual.etiquetas };
      if (valor.trim()) etiquetas[seg] = valor;
      else delete etiquetas[seg];
      return { ...d, navPortal: { ...actual, etiquetas }, themeCustomized: true };
    });
    setAviso(null);
  }

  function setNavIcono(seg: NavSegId, valor: string) {
    setDraft((d) => {
      const actual = resolveNavConfig(d.navPortal);
      const iconos = { ...actual.iconos };
      if (valor) iconos[seg] = valor as NavIconoId;
      else delete iconos[seg];
      return { ...d, navPortal: { ...actual, iconos }, themeCustomized: true };
    });
    setAviso(null);
  }

  // Redes sociales del pie de página público (Fase 3). Igual que arriba: el
  // dato se guarda tal cual, sin validar como URL estricta aquí — el filtro
  // de enlaces peligrosos vive en el render (resolverHrefBloque).
  function setRedSocial(id: RedSocialId, valor: string) {
    setDraft((d) => ({
      ...d,
      redesSociales: {
        instagram: '', facebook: '', whatsapp: '',
        ...(d.redesSociales as Partial<Record<RedSocialId, string>> | undefined),
        [id]: valor,
      },
      themeCustomized: true,
    }));
    setAviso(null);
  }

  async function handleGuardar() {
    setGuardando(true);
    setAviso(null);
    try {
      await guardarThemeBorrador(draft);
      setAviso({ tipo: 'ok', texto: 'Borrador guardado. Aún no lo ven tus clientas.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeSeguro((e as Error).message, ERROR_RED) });
    } finally {
      setGuardando(false);
    }
  }

  async function handlePublicar() {
    setPublicando(true);
    setAviso(null);
    try {
      await guardarThemeBorrador(draft); // incluye los cambios locales
      const r = await publicarThemeApi();
      if (r.ok) {
        window.dispatchEvent(new CustomEvent('tentare-theme-changed'));
        setAviso({ tipo: 'ok', texto: '¡Publicado! Ya lo ven tus clientas.' });
      } else setAviso({ tipo: 'error', texto: r.errores.join(' ') });
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeSeguro((e as Error).message, ERROR_RED) });
    } finally {
      setPublicando(false);
    }
  }

  // Subir y guardar van SEPARADOS a propósito: `CampoImagen` ofrece dos vías
  // —archivo o enlace pegado— y solo la primera pasa por Storage. Un handler
  // único de `<input type="file">` no podía servir a las dos.
  async function subirLogo(file: File) {
    if (!studio) return { error: 'Todavía no se ha cargado el estudio.' };
    setSubiendo('logo');
    const r = await subirLogoEstudio(studio.id, file);
    setSubiendo(null);
    return r;
  }

  async function guardarLogo(url: string | null) {
    if (!studio) return;
    // Quitar el logo borra TAMBIÉN el archivo del bucket. Si lo que había era
    // un enlace pegado, `eliminarLogoEstudio` no encuentra nada y no pasa nada.
    if (url === null) {
      setSubiendo('logo');
      await eliminarLogoEstudio(studio.id);
      setSubiendo(null);
    }
    const res = await updateStudio({ logoUrl: url });
    if (!res.ok) setAviso({ tipo: 'error', texto: res.error });
  }

  async function subirFavicon(file: File) {
    if (!studio) return { error: 'Todavía no se ha cargado el estudio.' };
    setSubiendo('favicon');
    const r = await subirFaviconEstudio(studio.id, file);
    setSubiendo(null);
    return r;
  }

  async function guardarFavicon(url: string | null) {
    if (!studio) return;
    if (url === null) {
      setSubiendo('favicon');
      await eliminarFaviconEstudio(studio.id);
      setSubiendo(null);
    }
    setCampo('faviconUrl', url);
  }

  // Imagen de bienvenida/portada del portal — NO es `studio.fotoUrl` (esa es
  // la foto de perfil de la propietaria, solo panel). Se persiste directo con
  // `updateStudio`, igual que el logo: sin borrador, no forma parte del JSON
  // de tema.
  async function subirImagenBienvenidaArchivo(file: File) {
    if (!studio) return { error: 'Todavía no se ha cargado el estudio.' };
    setSubiendo('bienvenida');
    const r = await subirImagenBienvenida(studio.id, file);
    setSubiendo(null);
    return r;
  }

  async function guardarImagenBienvenida(url: string | null) {
    if (!studio) return;
    if (url === null) {
      setSubiendo('bienvenida');
      await eliminarImagenBienvenida(studio.id);
      setSubiendo(null);
    }
    const res = await updateStudio({ imagenBienvenidaUrl: url });
    if (!res.ok) setAviso({ tipo: 'error', texto: res.error });
  }

  // Imagen para compartir (Open Graph). Es campo del TEMA —como el favicon, y
  // no como el logo— porque se publica junto al resto: hasta que no pulsas
  // Publicar, lo que ve WhatsApp sigue siendo lo de antes.
  //
  // Reutiliza `subirImagenPortal`, que ya redimensiona y sanea la clave del
  // fichero; no hace falta un subidor propio para esto.
  async function subirImagenCompartir(file: File) {
    if (!studio) return { error: 'Todavía no se ha cargado el estudio.' };
    setSubiendo('compartir');
    const r = await subirImagenPortal(studio.id, 'compartir', file);
    setSubiendo(null);
    return r;
  }

  // Sin borrar del bucket: la imagen ANTERIOR sigue siendo la publicada hasta
  // que se pulse Publicar. Borrarla aquí dejaría el enlace real enseñando un
  // hueco roto por haber tocado un borrador.
  function guardarImagenCompartir(url: string | null) {
    setCampo('seoImagenUrl', url);
  }

  function restaurar() {
    rebasar(DEFAULT_THEME);
    setAviso(null);
  }

  // "Deshacer" del editor a pantalla completa: descarta ediciones locales sin
  // guardar releyendo el borrador tal como está en el servidor — distinto de
  // `restaurar()`, que resetea al tema del SISTEMA (DEFAULT_THEME), no al
  // último guardado.
  function recargar() {
    // `rebasar`, no `setDraft`: releer el servidor descarta las ediciones
    // locales, así que es una base nueva. Apilarlo como paso dejaría un
    // "deshacer" que resucita lo que la propietaria acaba de descartar.
    fetchThemeBorrador().then(rebasar).catch(() => {});
    setAviso(null);
  }

  return {
    rol, studio, draft, estado, guardando, publicando, aviso, subiendo, contraste,
    navPortalResuelto, redesSocialesResueltas,
    setCampo, aplicarPaleta, elegirTema, toggleNavOculto, setNavEtiqueta, setNavIcono, setRedSocial,
    handleGuardar, handlePublicar,
    subirLogo, guardarLogo, subirFavicon, guardarFavicon,
    subirImagenBienvenidaArchivo, guardarImagenBienvenida,
    subirImagenCompartir, guardarImagenCompartir, restaurar, recargar,
    // Deshacer/rehacer de los AJUSTES. `instanteUltimo` es lo que permite a la
    // barra superior decidir qué pila deshacer cuando hay dos (bloques y
    // ajustes): la del paso más reciente, que es lo que la propietaria
    // entiende por "lo último que hice".
    deshacer: () => setHist(deshacerHist),
    rehacer: () => setHist(rehacerHist),
    puedeDeshacer: hist.pasado.length > 0,
    puedeRehacer: hist.futuro.length > 0,
    instanteUltimo: hist.instanteUltima,
  };
}


/**
 * Puente entre el Inspector genérico y el editor de temas.
 *
 * Los campos de forma se DECLARAN (lib/theme/campos-forma.ts) y se pintan
 * solos; lo único que hace falta aquí es traducir "se tocó este campo" al
 * `setCampo(clave, valor)` del hook. Un eje de `variantes` no se puede
 * escribir suelto —hay que reenviar el objeto entero— y esa regla vive en el
 * módulo puro, con tests, no repartida por el JSX.
 */
function CamposDelTema({
  campos, hook,
}: {
  campos: readonly CampoSchema[];
  hook: ReturnType<typeof useThemeEditor>;
}) {
  const { draft, setCampo } = hook;
  return (
    <CamposForm
      campos={campos}
      valores={valoresFormaDesdeTema(draft)}
      onChange={(_valores, campoId) => {
        const w = escrituraDeCampoForma(draft, campoId, _valores[campoId]);
        if (!w) return;
        setCampo(w.clave as keyof ThemeConfig, w.valor as ThemeConfig[keyof ThemeConfig]);
      }}
    />
  );
}

export function AjustesCategoriaPanel({
  hook, categoriaId,
}: {
  hook: ReturnType<typeof useThemeEditor>;
  categoriaId: AjustesCategoriaId;
}) {
  const { draft, setCampo, aplicarPaleta, contraste, studio, subiendo, navPortalResuelto, redesSocialesResueltas } = hook;
  // Los <input type="file"> ocultos necesitan un ref por instancia del panel
  // — declarados aquí arriba (nunca tras un `return` condicional) para no
  // romper las reglas de hooks, aunque solo se usen en la rama 'logo-favicon'.

  if (categoriaId === 'compartir') {
    return <PanelCompartir hook={hook} />;
  }

  if (categoriaId === 'reservar-portada') {
    return (
      <div className="space-y-4">
        <p className="text-[12px] text-muted-foreground leading-snug">
          La portada de <strong className="font-semibold text-foreground">tu página de reservas</strong> — la que incrustas en tu web.
          Si los dejas vacíos se usan los textos por defecto.
        </p>
        <label className="block space-y-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-foreground">Titular</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{(draft.reservarTitular ?? '').length}/{RESERVAR_TITULAR_MAX}</span>
          </span>
          <textarea
            rows={2}
            value={draft.reservarTitular ?? ''}
            maxLength={RESERVAR_TITULAR_MAX}
            onChange={(e) => setCampo('reservarTitular', e.target.value)}
            placeholder="Encuentra tu próxima clase"
            className="w-full text-[13px] px-2.5 py-2 rounded-lg border border-border bg-background resize-none"
          />
        </label>
        <label className="block space-y-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-foreground">Debajo del titular</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{(draft.reservarSubtitulo ?? '').length}/{RESERVAR_SUBTITULO_MAX}</span>
          </span>
          <textarea
            rows={3}
            value={draft.reservarSubtitulo ?? ''}
            maxLength={RESERVAR_SUBTITULO_MAX}
            onChange={(e) => setCampo('reservarSubtitulo', e.target.value)}
            placeholder="Si lo dejas vacío, se usa la descripción de tu estudio."
            className="w-full text-[13px] px-2.5 py-2 rounded-lg border border-border bg-background resize-none"
          />
        </label>
        <label className="block space-y-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-foreground">Texto del botón</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{(draft.reservarCta ?? '').length}/{RESERVAR_CTA_MAX}</span>
          </span>
          <input
            type="text"
            value={draft.reservarCta ?? ''}
            maxLength={RESERVAR_CTA_MAX}
            onChange={(e) => setCampo('reservarCta', e.target.value)}
            placeholder="Ver el horario"
            className="w-full text-[13px] px-2.5 py-2 rounded-lg border border-border bg-background"
          />
        </label>
      </div>
    );
  }

  if (categoriaId === 'reservar-voz') {
    return (
      <div className="space-y-4">
        <p className="text-[12px] text-muted-foreground leading-snug">
          Lo que tu página le dice a la clienta en los momentos que deciden si reserva o se va.
          Vacío = se usa el texto de siempre, nunca se queda en blanco.
        </p>
        <label className="block space-y-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-foreground">Primera visita</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{(draft.reservarAvisoQuiz ?? '').length}/{RESERVAR_AVISO_QUIZ_MAX}</span>
          </span>
          <textarea
            rows={2}
            value={draft.reservarAvisoQuiz ?? ''}
            maxLength={RESERVAR_AVISO_QUIZ_MAX}
            onChange={(e) => setCampo('reservarAvisoQuiz', e.target.value)}
            placeholder="¿Primera vez en el estudio? Te ayudamos a encontrar tu clase."
            className="w-full text-[13px] px-2.5 py-2 rounded-lg border border-border bg-background resize-none"
          />
          <span className="block text-[11px] text-muted-foreground">Encima del horario, para quien no te conoce.</span>
        </label>
        <label className="block space-y-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-foreground">No hay clases — título</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{(draft.reservarVacioTitulo ?? '').length}/{RESERVAR_VACIO_TITULO_MAX}</span>
          </span>
          <input
            type="text"
            value={draft.reservarVacioTitulo ?? ''}
            maxLength={RESERVAR_VACIO_TITULO_MAX}
            onChange={(e) => setCampo('reservarVacioTitulo', e.target.value)}
            placeholder="Sin clases disponibles"
            className="w-full text-[13px] px-2.5 py-2 rounded-lg border border-border bg-background "
          />
        </label>
        <label className="block space-y-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-foreground">No hay clases — debajo</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{(draft.reservarVacioTexto ?? '').length}/{RESERVAR_VACIO_TEXTO_MAX}</span>
          </span>
          <textarea
            rows={2}
            value={draft.reservarVacioTexto ?? ''}
            maxLength={RESERVAR_VACIO_TEXTO_MAX}
            onChange={(e) => setCampo('reservarVacioTexto', e.target.value)}
            placeholder="Prueba con otra semana o cambia el filtro"
            className="w-full text-[13px] px-2.5 py-2 rounded-lg border border-border bg-background resize-none"
          />
          <span className="block text-[11px] text-muted-foreground">El momento en que una clienta se va sin reservar.</span>
        </label>
        <label className="block space-y-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-foreground">Lista de espera</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{(draft.reservarListaEspera ?? '').length}/{RESERVAR_LISTA_ESPERA_MAX}</span>
          </span>
          <textarea
            rows={2}
            value={draft.reservarListaEspera ?? ''}
            maxLength={RESERVAR_LISTA_ESPERA_MAX}
            onChange={(e) => setCampo('reservarListaEspera', e.target.value)}
            placeholder="Si se libera una plaza, te avisaremos por email."
            className="w-full text-[13px] px-2.5 py-2 rounded-lg border border-border bg-background resize-none"
          />
          <span className="block text-[11px] text-muted-foreground">Lo que pasa después de apuntarse. Si no lo dices, se queda sin saberlo.</span>
        </label>
        <label className="block space-y-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-foreground">Reserva confirmada</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{(draft.reservarConfirmacion ?? '').length}/{RESERVAR_CONFIRMACION_MAX}</span>
          </span>
          <input
            type="text"
            value={draft.reservarConfirmacion ?? ''}
            maxLength={RESERVAR_CONFIRMACION_MAX}
            onChange={(e) => setCampo('reservarConfirmacion', e.target.value)}
            placeholder="¡Reserva confirmada!"
            className="w-full text-[13px] px-2.5 py-2 rounded-lg border border-border bg-background "
          />
        </label>
        <label className="block space-y-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-foreground">Rótulo «cómo funciona»</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{(draft.reservarComoFunciona ?? '').length}/{RESERVAR_COMO_FUNCIONA_MAX}</span>
          </span>
          <input
            type="text"
            value={draft.reservarComoFunciona ?? ''}
            maxLength={RESERVAR_COMO_FUNCIONA_MAX}
            onChange={(e) => setCampo('reservarComoFunciona', e.target.value)}
            placeholder="CÓMO FUNCIONA"
            className="w-full text-[13px] px-2.5 py-2 rounded-lg border border-border bg-background "
          />
        </label>
        <label className="block space-y-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-foreground">Ayuda del pie</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{(draft.reservarAyuda ?? '').length}/{RESERVAR_AYUDA_MAX}</span>
          </span>
          <input
            type="text"
            value={draft.reservarAyuda ?? ''}
            maxLength={RESERVAR_AYUDA_MAX}
            onChange={(e) => setCampo('reservarAyuda', e.target.value)}
            placeholder="¿Dudas? Estamos aquí para ayudarte:"
            className="w-full text-[13px] px-2.5 py-2 rounded-lg border border-border bg-background "
          />
        </label>
      </div>
    );
  }

  if (categoriaId === 'reservar-sobre') {
    return (
      <div className="space-y-4">
        <p className="text-[12px] text-muted-foreground leading-snug">
          Lo que cuentas de tu estudio en <strong className="font-semibold text-foreground">tu página de reservas</strong>.
          Es la única sección que escribes entera tú — <strong className="font-semibold text-foreground">si dejas el texto vacío, no se ve</strong>.
          No hay un texto por defecto a propósito: preferimos que no haya sección a que haya una que no habla de ti.
        </p>
        <label className="block space-y-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-foreground">Título</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{(draft.reservarSobreTitulo ?? '').length}/{RESERVAR_SOBRE_TITULO_MAX}</span>
          </span>
          <input
            type="text"
            value={draft.reservarSobreTitulo ?? ''}
            maxLength={RESERVAR_SOBRE_TITULO_MAX}
            onChange={(e) => setCampo('reservarSobreTitulo', e.target.value)}
            placeholder="Un estudio pequeño, de verdad"
            className="w-full text-[13px] px-2.5 py-2 rounded-lg border border-border bg-background"
          />
        </label>
        <label className="block space-y-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-foreground">Texto</span>
            <span className="text-[11px] tabular-nums text-muted-foreground">{(draft.reservarSobreTexto ?? '').length}/{RESERVAR_SOBRE_TEXTO_MAX}</span>
          </span>
          <textarea
            rows={8}
            value={draft.reservarSobreTexto ?? ''}
            maxLength={RESERVAR_SOBRE_TEXTO_MAX}
            onChange={(e) => setCampo('reservarSobreTexto', e.target.value)}
            placeholder="Cuenta quién sois, cómo trabajáis, qué se va a encontrar quien venga por primera vez."
            className="w-full text-[13px] px-2.5 py-2 rounded-lg border border-border bg-background resize-none"
          />
          <span className="block text-[11px] text-muted-foreground">Los saltos de línea se respetan tal cual.</span>
        </label>
      </div>
    );
  }

  if (categoriaId === 'reservar-widget') {
    const fondo = draft.widgetFondo ?? null;
    return (
      <div className="space-y-4">
        <p className="text-[12px] text-muted-foreground leading-snug">
          Cómo se ve el widget <strong className="font-semibold text-foreground">dentro de tu web</strong>, cuando lo
          incrustas. No toca el portal de tus clientas.
        </p>

        <div className="space-y-1.5">
          <span className="text-[13px] font-medium text-foreground">Fondo</span>
          <div className="flex gap-1.5">
            {([
              { id: null, label: 'El de Tentare' },
              { id: 'transparente', label: 'Transparente' },
              { id: 'color', label: 'Un color' },
            ] as const).map((o) => {
              const activo = o.id === 'color'
                ? typeof fondo === 'string' && fondo !== 'transparente'
                : fondo === o.id;
              return (
                <button
                  key={String(o.id)} type="button"
                  onClick={() => setCampo('widgetFondo', o.id === 'color' ? '#FFFFFF' : o.id)}
                  aria-pressed={activo}
                  className={`flex-1 text-[12px] px-2 py-2 rounded-lg border ${activo ? 'border-brand bg-brand/10 text-foreground font-semibold' : 'border-border text-muted-foreground'}`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          {typeof fondo === 'string' && fondo !== 'transparente' && (
            <input
              type="color" value={fondo}
              onChange={(e) => setCampo('widgetFondo', e.target.value)}
              className="w-full h-9 rounded-lg border border-border bg-background"
              aria-label="Color de fondo del widget"
            />
          )}
          <p className="text-[11px] text-muted-foreground">
            <strong className="font-semibold text-foreground">Transparente</strong> es lo que suele encajar: deja ver
            el fondo de tu web, sea claro u oscuro.
          </p>
        </div>

        <div className="space-y-1.5">
          <span className="text-[13px] font-medium text-foreground">Color del texto</span>
          <div className="flex gap-1.5">
            {([
              { id: 'auto' as const, label: 'Automático' },
              { id: 'oscuro' as const, label: 'Oscuro' },
              { id: 'claro' as const, label: 'Claro' },
            ]).map((o) => (
              <button
                key={o.id} type="button"
                onClick={() => setCampo('widgetTexto', o.id)}
                aria-pressed={(draft.widgetTexto ?? 'auto') === o.id}
                className={`flex-1 text-[12px] px-2 py-2 rounded-lg border ${(draft.widgetTexto ?? 'auto') === o.id ? 'border-brand bg-brand/10 text-foreground font-semibold' : 'border-border text-muted-foreground'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {/* ⚠️ Aquí es donde «automático» deja de poder ayudar, y se dice. Con
              el fondo transparente no hay nada de lo que deducirlo: el widget
              vive en un marco aparte y no ve el fondo de la web que lo contiene.
              Sin este aviso, quien tenga la web oscura publicaba texto oscuro
              sobre oscuro — que es justo lo que destapó la vista previa. */}
          <p className="text-[11px] text-muted-foreground">
            {draft.widgetFondo === 'transparente'
              ? 'Con el fondo transparente, «automático» no puede adivinarlo: no vemos el fondo de tu web. Si es oscura, elige «Claro».'
              : 'Automático lo saca del fondo que elijas aquí.'}
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-[13px] font-medium text-foreground">Tipografía</span>
          <input
            type="text"
            value={draft.widgetFuente ?? ''}
            maxLength={40}
            onChange={(e) => setCampo('widgetFuente', e.target.value.trim() === '' ? null : e.target.value)}
            placeholder="Space Grotesk"
            className="w-full text-[13px] px-2.5 py-2 rounded-lg border border-border bg-background"
          />
          {/* ⚠️ Se dice la verdad en vez de prometer una herencia que no existe:
              un iframe es otro documento y NO puede heredar la fuente de la web
              que lo contiene. Escribir el nombre es lo que sí funciona. */}
          <span className="block text-[11px] text-muted-foreground">
            Escribe el nombre de la fuente de tu web, tal cual (la buscamos en Google Fonts).
            No podemos heredarla sola: el widget vive en un marco aparte.
          </span>
        </label>

        <div className="space-y-1.5">
          <span className="text-[13px] font-medium text-foreground">Al incrustarlo</span>
          {([
            { k: 'widgetOcultarPie' as const, label: 'Ocultar el pie', ayuda: 'Tu web ya tiene el suyo, con la misma dirección.' },
            { k: 'widgetSoloPestana' as const, label: 'Enseñar solo la pestaña que elijas', ayuda: 'Si no, quien mira puede irse a «El estudio» dentro de tu página.' },
          ]).map((o) => (
            <label key={o.k} className="flex items-start gap-2.5 text-[12.5px] text-foreground">
              <input
                type="checkbox" checked={draft[o.k] === true}
                onChange={(e) => setCampo(o.k, e.target.checked)}
                className="mt-0.5"
              />
              <span>
                {o.label}
                <span className="block text-[11px] text-muted-foreground">{o.ayuda}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="space-y-1.5 pt-1 border-t border-border">
          <span className="text-[13px] font-medium text-foreground">Colores del widget</span>
          <p className="text-[11px] text-muted-foreground">
            Sin tocar nada, el widget usa los colores de siempre. Solo cambia lo que necesites — el
            resto sigue igual.
          </p>
          {([
            { k: 'widgetSuperficie' as const, label: 'Superficie (tarjetas/inputs)' },
            { k: 'widgetTinta' as const, label: 'Texto principal' },
            { k: 'widgetTextoSecundario' as const, label: 'Texto secundario' },
            { k: 'widgetLinea' as const, label: 'Bordes y separadores' },
            { k: 'widgetRelleno' as const, label: 'Relleno suave (chips)' },
          ]).map((o) => {
            const valor = draft[o.k];
            const activo = typeof valor === 'string';
            return (
              <div key={o.k} className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] text-foreground">{o.label}</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={activo ? valor : '#FFFFFF'}
                    onChange={(e) => setCampo(o.k, e.target.value)}
                    className="w-8 h-8 rounded-md border border-border bg-background"
                    aria-label={o.label}
                  />
                  {activo && (
                    <button type="button" onClick={() => setCampo(o.k, null)}
                      className="text-[11px] text-muted-foreground underline">
                      Quitar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {contraste.errores.some((e) => e.includes('widget')) && (
            <p className="text-[11px] text-destructive">
              {contraste.errores.find((e) => e.includes('widget'))}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border">
          <label className="block space-y-1">
            <span className="text-[13px] font-medium text-foreground">Radio de botones</span>
            <input
              type="number" min={0} max={32}
              value={draft.widgetRadioBoton ?? ''}
              placeholder="píldora"
              onChange={(e) => setCampo('widgetRadioBoton', e.target.value.trim() === '' ? null : Number(e.target.value))}
              className="w-full text-[13px] px-2.5 py-2 rounded-lg border border-border bg-background"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[13px] font-medium text-foreground">Radio de inputs</span>
            <input
              type="number" min={0} max={32}
              value={draft.widgetRadioInput ?? ''}
              placeholder="el de tarjetas"
              onChange={(e) => setCampo('widgetRadioInput', e.target.value.trim() === '' ? null : Number(e.target.value))}
              className="w-full text-[13px] px-2.5 py-2 rounded-lg border border-border bg-background"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-[13px] font-medium text-foreground">Tipografía de titulares</span>
          <input
            type="text"
            value={draft.widgetFuenteDisplay ?? ''}
            maxLength={40}
            onChange={(e) => setCampo('widgetFuenteDisplay', e.target.value.trim() === '' ? null : e.target.value)}
            placeholder="Igual que la tipografía de arriba"
            className="w-full text-[13px] px-2.5 py-2 rounded-lg border border-border bg-background"
          />
          <span className="block text-[11px] text-muted-foreground">
            Para titulares, horas y precios — el resto del texto sigue usando la tipografía de arriba.
          </span>
        </label>

        <WidgetPreview
          slug={studio?.slug}
          fondo={typeof draft.widgetFondo === 'string' ? draft.widgetFondo : null}
          fuente={draft.widgetFuente ?? null}
          ocultarPie={draft.widgetOcultarPie === true}
          soloPestana={draft.widgetSoloPestana === true}
          fuenteDisplay={draft.widgetFuenteDisplay ?? null}
          radioBoton={draft.widgetRadioBoton ?? null}
          radioInput={draft.widgetRadioInput ?? null}
          superficie={typeof draft.widgetSuperficie === 'string' ? draft.widgetSuperficie : null}
          tinta={typeof draft.widgetTinta === 'string' ? draft.widgetTinta : null}
          textoSecundario={typeof draft.widgetTextoSecundario === 'string' ? draft.widgetTextoSecundario : null}
          linea={typeof draft.widgetLinea === 'string' ? draft.widgetLinea : null}
          relleno={typeof draft.widgetRelleno === 'string' ? draft.widgetRelleno : null}
        />
      </div>
    );
  }

  if (categoriaId === 'visibilidad') return <PanelVisibilidad />;

  if (categoriaId === 'paleta') {
    return (
      <div className="flex flex-wrap gap-2.5">
        {PALETAS.map((pal) => {
          const d = derivarPaleta(pal.primary);
          const activa = draft.primary.toUpperCase() === pal.primary.toUpperCase();
          return (
            <button
              key={pal.label}
              onClick={() => aplicarPaleta(pal.primary)}
              title={pal.label}
              aria-label={`Paleta ${pal.label}`}
              className={`w-10 h-10 rounded-full ring-2 ring-offset-2 transition-all ${activa ? '' : 'ring-transparent'}`}
              style={{
                background: `conic-gradient(${pal.primary} 0 55%, ${d.secondary} 55% 80%, ${d.accent} 80% 100%)`,
                ['--tw-ring-color' as string]: activa ? pal.primary : 'transparent',
              }}
            >
              {activa && <Check size={14} className="mx-auto text-white drop-shadow" strokeWidth={3} />}
            </button>
          );
        })}
      </div>
    );
  }

  if (categoriaId === 'color-marca') {
    return (
      <div className="space-y-3">
        <ColorField label="Color de marca" value={draft.primary} onChange={(v) => hook.setCampo('primary', v)} />
        <CamposDelTema campos={CAMPOS_ACENTO} hook={hook} />
        <button
          onClick={() => aplicarPaleta(draft.primary)}
          className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-border"
        >
          <Sparkles size={14} /> Generar paleta desde este color
        </button>
        {!contraste.ok && (
          <div className="flex items-start gap-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{contraste.errores.join(' ')}</span>
          </div>
        )}
        <div className="border-t border-border pt-3 space-y-3">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Ajuste fino de colores</p>
          {CAMPOS_COLOR.map(({ key, label }) => (
            <ColorField key={key} label={label} value={draft[key] as string} onChange={(v) => setCampo(key, v as ThemeConfig[typeof key])} />
          ))}
        </div>
      </div>
    );
  }

  if (categoriaId === 'tipografia') {
    return (
      <div className="space-y-3">
        <select
          value={draft.fontId}
          onChange={(e) => setCampo('fontId', e.target.value as ThemeConfig['fontId'])}
          aria-label="Fuente del portal"
          className="w-full text-[13px] px-3 py-2 rounded-xl border border-border bg-background"
        >
          {FUENTES.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>

        {/* El tamaño va DEBAJO de la fuente y no en una categoría propia: es
            donde la propietaria lo busca. Y en una sección plegada, porque son
            seis casillas que casi nadie toca — quien no las abra ve la
            tipografía tal cual estaba. */}
        <div className="pt-1 border-t border-border">
          <p className="text-[11.5px] text-muted-foreground mb-2">
            Tamaño de cada texto, en píxeles. Déjalo vacío para usar el del tema.
          </p>
          <CamposDelTema campos={CAMPOS_ESCALA_TEXTO} hook={hook} />
        </div>
      </div>
    );
  }

  if (categoriaId === 'esquinas') {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          {RADIOS.map((r) => (
            <button
              key={r.id}
              onClick={() => setCampo('radius', r.id)}
              aria-pressed={draft.radius === r.id}
              className={`flex-1 text-[13px] font-semibold py-2 rounded-xl border transition-colors ${
                draft.radius === r.id ? 'border-brand bg-brand text-brand-foreground' : 'border-border text-foreground'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="pt-1 border-t border-border space-y-2">
          <p className="text-[11.5px] text-muted-foreground">
            Y si quieres afinar una pieza concreta, en píxeles. Deja la casilla
            vacía para que siga el tema.
          </p>
          <CamposDelTema campos={CAMPOS_RADIO} hook={hook} />
        </div>
      </div>
    );
  }

  if (categoriaId === 'boton') {
    return (
      <div className="flex gap-2">
        {ESTILOS_BOTON.map((b) => (
          <button
            key={b.id}
            onClick={() => setCampo('buttonStyle', b.id)}
            className={`flex-1 text-[13px] font-semibold py-2 rounded-xl border transition-colors ${
              draft.buttonStyle === b.id ? 'border-brand bg-brand text-brand-foreground' : 'border-border text-foreground'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
    );
  }

  if (categoriaId === 'tarjetas') {
    return (
      <div className="flex gap-2">
        {ESTILOS_TARJETA.map((c) => (
          <button
            key={c.id}
            onClick={() => setCampo('cardStyle', c.id)}
            className={`flex-1 text-[13px] font-semibold py-2 rounded-xl border transition-colors ${
              draft.cardStyle === c.id ? 'border-brand bg-brand text-brand-foreground' : 'border-border text-foreground'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
    );
  }

  if (categoriaId === 'forma-portal') {
    return (
      <div className="space-y-3">
        <p className="text-[11.5px] text-muted-foreground">
          La FORMA de cada pieza del portal, no su color. Antes esto solo se
          podía cambiar instalando un tema entero de la biblioteca.
        </p>
        <CamposDelTema campos={CAMPOS_FORMA_PORTAL} hook={hook} />
      </div>
    );
  }

  if (categoriaId === 'navegacion-portal') {
    return (
      <div className="space-y-3">
        <p className="text-[11.5px] text-muted-foreground">
          Oculta las pestañas que no uses y cambia su nombre o icono. El orden es el mismo para todos los estudios.
        </p>
        <div className="space-y-1.5">
          {NAV_DISPONIBLES.map((item) => {
            const oculta = navPortalResuelto.ocultos.includes(item.seg);
            return (
              <div key={item.seg} className="flex items-center gap-2 rounded-xl border border-border p-2.5">
                <button
                  type="button"
                  onClick={() => hook.toggleNavOculto(item.seg)}
                  disabled={item.seg === 'home'}
                  title={item.seg === 'home' ? 'Inicio no se puede ocultar' : oculta ? 'Mostrar' : 'Ocultar'}
                  aria-label={item.seg === 'home' ? 'Inicio no se puede ocultar' : oculta ? `Mostrar ${item.label}` : `Ocultar ${item.label}`}
                  className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:hover:text-muted-foreground"
                >
                  {oculta ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <span className={`w-14 shrink-0 text-[12px] font-semibold ${oculta ? 'text-muted-foreground/50 line-through' : 'text-foreground'}`}>
                  {item.label}
                </span>
                <input
                  value={navPortalResuelto.etiquetas[item.seg] ?? ''}
                  onChange={(e) => hook.setNavEtiqueta(item.seg, e.target.value)}
                  placeholder={item.label}
                  aria-label={`Etiqueta de ${item.label}`}
                  className="min-w-0 flex-1 text-[12.5px] px-2.5 py-1.5 rounded-lg border border-border bg-background"
                />
                <select
                  value={navPortalResuelto.iconos[item.seg] ?? ''}
                  onChange={(e) => hook.setNavIcono(item.seg, e.target.value)}
                  aria-label={`Icono de ${item.label}`}
                  className="shrink-0 text-[12.5px] px-2 py-1.5 rounded-lg border border-border bg-background"
                >
                  <option value="">Icono de siempre</option>
                  {NAV_ICONOS_DISPONIBLES.map((i) => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        <div className="pt-1 border-t border-border">
          <CamposDelTema campos={CAMPOS_BARRA_PORTAL} hook={hook} />
        </div>

        {/* Preview en vivo (sin iframe: el widget de verdad, con las CSS
            vars del borrador aplicadas directamente — mismo componente que
            usa portal-shell.tsx, así que lo que se ve aquí es exacto). */}
        <div style={themeToCssVars(draft)} className="rounded-2xl border border-border bg-muted/40 p-4">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Así se ve</p>
          {/* Alto de la MISMA variable que la barra: con la altura fija de
              antes, un tema que la sube (Bloom, 66px) se salía de su caja en
              esta previsualización — y esta caja es justo donde la propietaria
              comprueba cómo queda. */}
          <div style={{ position: 'relative', height: `var(--portal-tabbar-height, ${altura.tabbar}px)` }}>
            <PortalNav
              items={navItemsVisibles(navPortalResuelto, NAV_DISPONIBLES)}
              activeIndex={0}
              slug={studio?.slug ?? ''}
              interactive={false}
              flotante={!draft.barraClasica}
              etiquetas={resolveVariantes(draft.variantes).barra}
            />
          </div>
        </div>
      </div>
    );
  }

  if (categoriaId === 'redes-sociales') {
    return (
      <div className="space-y-3">
        <p className="text-[11.5px] text-muted-foreground">
          Se ven en el pie de tu página pública de reservas. Deja en blanco la que no uses.
        </p>
        <div className="space-y-2">
          {REDES_SOCIALES_IDS.map((id) => (
            <label key={id} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-[12px] font-semibold text-foreground">{RED_SOCIAL_LABEL[id]}</span>
              <input
                value={redesSocialesResueltas[id]}
                onChange={(e) => hook.setRedSocial(id, e.target.value)}
                placeholder={RED_SOCIAL_PLACEHOLDER[id]}
                aria-label={RED_SOCIAL_LABEL[id]}
                className="min-w-0 flex-1 text-[12.5px] px-2.5 py-1.5 rounded-lg border border-border bg-background"
              />
            </label>
          ))}
        </div>
      </div>
    );
  }

  // 'logo-favicon'
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {/* Rótulos por bloque: sin ellos esta categoría eran tres pares de
            "miniatura + botón Subir" seguidos, indistinguibles de un vistazo.
            Quien buscaba dónde poner su foto no lo encontraba. */}
        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Logo</p>
        {/* Sin `respaldo`: el logo es la marca del estudio y no tiene foto por
            defecto que valga — una genérica sería la marca de otro. Sin logo,
            la miniatura enseña «Sin imagen», que aquí es la verdad. */}
        <CampoImagen
          etiqueta="logo"
          valor={studio?.logoUrl}
          onSubir={hook.subirLogo}
          onCambiar={hook.guardarLogo}
          ocupado={subiendo === 'logo'}
          ajuste="contain"
          clasePreview="w-12 h-12"
          textoSubir="Subir logo"
          textoCambiar="Cambiar logo"
          ayuda={
            // Este mismo logo sale también en el icono de tus notificaciones
            // push a clientas (antes salía siempre el genérico de Tentare) y
            // en el icono de tu app instalada — cuadrado y sin márgenes es lo
            // que mejor se ve en los dos sitios.
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Recomendado: 512×512 px, cuadrado, fondo transparente o sólido (sin márgenes de sobra).
            </p>
          }
        />
      </div>

      {/* Imagen de bienvenida/portada del portal.
          ─────────────────────────────────────────────────────────────────
          NO es la foto de perfil de la propietaria (esa vive en Configuración
          → Perfil y solo sale en el panel, nunca aquí): esta es la que ven
          las alumnas al entrar al portal — pantalla de bienvenida, cabecera
          de acceso, hero de inicio. Compartir un solo campo para las dos
          cosas era el bug: subir una selfie para el sidebar la enseñaba de
          golpe a toda socia del estudio. */}
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Foto del portal</p>
        <CampoImagen
          etiqueta="imagen de bienvenida"
          valor={studio?.imagenBienvenidaUrl}
          respaldo={IMAGENES_POR_DEFECTO.vertical[0]}
          onSubir={hook.subirImagenBienvenidaArchivo}
          onCambiar={hook.guardarImagenBienvenida}
          ocupado={subiendo === 'bienvenida'}
          ayuda={
            // Decir DÓNDE sale, y no solo que «la ven tus alumnas». El feedback
            // fue «no se puede poner imagen en la bienvenida ni en las tarjetas»
            // — cuando esta misma foto es las tres cosas. Enumerarlas es la
            // diferencia entre una función que existe y una que se encuentra.
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Es la foto de tu estudio, no tu foto de perfil. Con una sola se visten tres sitios:
              la <strong>pantalla de acceso</strong>, la <strong>bienvenida</strong> y el fondo de la
              <strong> tarjeta grande del Inicio</strong>. Mientras no subas la tuya, esos tres usan
              una foto de Tentare — la que ves aquí al lado. Lo ideal es 1200 × 1600 px, vertical.
            </p>
          }
        />
      </div>

      {/* Encuadre de la imagen de bienvenida.
          ─────────────────────────────────────────────────────────────────
          Solo aparece si hay imagen: sin ella el control no tiene nada que
          encuadrar y sería un ajuste que no hace nada visible.

          La miniatura no es decorativa — es el control. El recorte se juzga
          a ojo, así que hay que enseñar el resultado, no describirlo: la
          proporción imita la portada del portal y el punto blanco marca
          dónde caería el logo, que es justo lo que se estaba tapando. */}
      {studio?.imagenBienvenidaUrl?.trim() && (
        <div className="space-y-2 border-t border-border pt-4">
          <div
            className="relative w-full rounded-xl overflow-hidden border border-border"
            style={{
              aspectRatio: '390 / 200',
              backgroundImage: `url(${JSON.stringify(studio.imagenBienvenidaUrl)})`,
              backgroundSize: 'cover',
              backgroundPosition: POSICION_FOTO[draft.fotoEncuadre] ?? POSICION_FOTO.centro,
              transition: 'background-position 250ms ease',
            }}
          >
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.28) 0%, rgba(0,0,0,.10) 40%, rgba(0,0,0,.45) 100%)' }} />
            <div className="absolute left-1/2 -translate-x-1/2 bottom-3 w-8 h-8 rounded-full bg-white/90 border-2 border-white" aria-hidden />
          </div>
          <FilaOpciones
            etiqueta="Encuadre de la foto"
            opciones={[
              { id: 'arriba', label: 'Arriba' },
              { id: 'centro', label: 'Centro' },
              { id: 'abajo', label: 'Abajo' },
            ]}
            activa={draft.fotoEncuadre}
            onElegir={(v) => hook.setCampo('fotoEncuadre', v as ThemeConfig['fotoEncuadre'])}
          />
          <p className="text-[11px] text-muted-foreground">
            Qué parte de la foto se ve en la portada del portal. Con una foto vertical
            —un retrato, por ejemplo— «Centro» suele dejar la cara justo detrás del logo.
          </p>
        </div>
      )}
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">Favicon</p>
      </div>
      {/* Tampoco lleva `respaldo`: el favicon es marca, como el logo. Sin él,
          la pestaña enseña el de Tentare — poner ahí una imagen genérica de
          Pilates sería peor, no mejor. */}
      <CampoImagen
        etiqueta="favicon"
        valor={draft.faviconUrl}
        onSubir={hook.subirFavicon}
        onCambiar={hook.guardarFavicon}
        ocupado={subiendo === 'favicon'}
        ajuste="contain"
        clasePreview="w-12 h-12"
        textoSubir="Subir favicon"
        textoCambiar="Cambiar favicon"
      />
    </div>
  );
}

/**
 * Cómo se ve el enlace del estudio al compartirlo.
 *
 * La previsualización va DENTRO del panel, y no en el lienzo, porque lo que
 * se está editando no se ve en ninguna página: son etiquetas `<meta>`. Sin
 * esto, la propietaria escribiría a ciegas y solo descubriría el resultado
 * pegando su enlace en un chat de verdad — que además queda cacheado por
 * WhatsApp durante días, así que el error tarda en poder corregirse.
 */
function PanelCompartir({ hook }: { hook: ReturnType<typeof useThemeEditor> }) {
  const { draft, setCampo, studio, subiendo } = hook;
  // ⚠️ `?? ''` y no `draft.seoTitulo` a secas, aunque el tipo diga que es un
  // string. `fetchThemeBorrador` hace `res.json() as Promise<ThemeConfig>`:
  // un CAST, no una validación. Hoy el servidor resuelve el tema antes de
  // devolverlo, así que en producción viene completo — pero el tipo está
  // afirmando algo que la red no garantiza, y aquí se llama a `.length`, que
  // sobre `undefined` no degrada: tumba la pantalla entera con «Algo se ha
  // roto». Encontrado así, mirándolo, no leyéndolo.
  const titulo = draft.seoTitulo ?? '';
  const descripcion = draft.seoDescripcion ?? '';
  // El MISMO cálculo que hace el servidor al pintar las etiquetas: si aquí se
  // reprodujera la herencia a mano, la previsualización podría mentir sobre
  // lo que se va a publicar. Ver lib/theme/seo-publico.ts.
  const vista = metadatosPublicos(
    { nombre: studio?.nombre ?? 'Tu estudio', ciudad: studio?.ciudad ?? '' },
    draft,
  );
  const dominio = typeof window === 'undefined' ? '' : window.location.host;
  // `39/60` y no `21`: un número suelto al lado de una etiqueta no dice si
  // es lo escrito, lo que queda o el mínimo. Con la barra se lee sin pensar.
  const cercaDelLimite = (usado: number, max: number) => max - usado <= max * 0.12;

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-muted-foreground leading-snug">
        Lo que se ve al pegar el enlace de tu estudio en WhatsApp o Instagram, y en Google.
        Se publica junto al resto del tema.
      </p>

      {/* La tarjeta, tal cual la pinta un chat.
          Antes había aquí un cartel de «Sin imagen» para el caso de no tener
          ninguna: el enlace salía como un recuadro de texto. Ya no puede
          pasar —`vista.imagen` nunca viene vacía— así que la previsualización
          enseña lo que se va a publicar de verdad, que es de lo que va esta
          pantalla. */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={vista.imagen} alt="" className="w-full aspect-[1.91/1] object-cover" />
        <div className="p-2.5 space-y-0.5">
          {dominio && <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{dominio}</p>}
          <p className="text-[12.5px] font-semibold text-foreground leading-snug">{vista.titulo}</p>
          <p className="text-[11.5px] text-muted-foreground leading-snug">{vista.descripcion}</p>
        </div>
      </div>

      {/* La tarjeta de arriba ya enseña la imagen GUARDADA. La miniatura de
          aquí sirve para lo otro: ver un enlace recién pegado antes de
          guardarlo, que la tarjeta todavía no refleja. */}
      <CampoImagen
        etiqueta="imagen para compartir"
        valor={draft.seoImagenUrl}
        respaldo={IMAGEN_COMPARTIR_POR_DEFECTO}
        onSubir={hook.subirImagenCompartir}
        onCambiar={hook.guardarImagenCompartir}
        ocupado={subiendo === 'compartir'}
        ayuda={<p className="text-[11px] text-muted-foreground mt-1.5">Apaisada, 1200 × 630 va perfecta.</p>}
      />

      {/* ⚠️ Los `maxLength` no son decoración: el schema rechaza por encima de
          esos límites, así que sin ellos se podría escribir un título que
          luego impide publicar sin decir por qué. El contador explica el
          límite antes de chocar con él. */}
      <label className="block space-y-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium text-foreground">Título</span>
          <span className={`text-[11px] tabular-nums ${cercaDelLimite(titulo.length, SEO_TITULO_MAX) ? 'text-amber-700' : 'text-muted-foreground'}`}>
            {titulo.length}/{SEO_TITULO_MAX}
          </span>
        </span>
        <input
          type="text"
          value={titulo}
          maxLength={SEO_TITULO_MAX}
          onChange={(e) => setCampo('seoTitulo', e.target.value)}
          placeholder={tituloAutomatico({ nombre: studio?.nombre ?? 'Tu estudio', ciudad: studio?.ciudad ?? '' })}
          className="w-full text-[13px] px-2.5 py-2 rounded-lg border border-border bg-background"
        />
      </label>

      <label className="block space-y-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium text-foreground">Descripción</span>
          <span className={`text-[11px] tabular-nums ${cercaDelLimite(descripcion.length, SEO_DESCRIPCION_MAX) ? 'text-amber-700' : 'text-muted-foreground'}`}>
            {descripcion.length}/{SEO_DESCRIPCION_MAX}
          </span>
        </span>
        <textarea
          rows={3}
          value={descripcion}
          maxLength={SEO_DESCRIPCION_MAX}
          onChange={(e) => setCampo('seoDescripcion', e.target.value)}
          placeholder={descripcionAutomatica({ nombre: studio?.nombre ?? 'Tu estudio', ciudad: studio?.ciudad ?? '' })}
          className="w-full text-[13px] px-2.5 py-2 rounded-lg border border-border bg-background resize-none"
        />
      </label>

      {/* Dejarlos en blanco no es un descuido que haya que avisar: es la
          opción por defecto y funciona bien. Se dice, y ya. */}
      <p className="text-[11px] text-muted-foreground leading-snug">
        Si los dejas vacíos se escriben solos con el nombre y la ciudad de tu estudio.
      </p>
    </div>
  );
}
