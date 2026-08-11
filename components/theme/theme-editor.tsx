'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, Trash2, Check, AlertTriangle, Sparkles, Eye, EyeOff } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
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
} from '@/lib/theme-schema';
import { metadatosPublicos, tituloAutomatico, descripcionAutomatica } from '@/lib/theme/seo-publico';
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

  async function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !studio) return;
    setSubiendo('logo');
    const r = await subirLogoEstudio(studio.id, file);
    setSubiendo(null);
    if ('error' in r) return setAviso({ tipo: 'error', texto: r.error });
    const res = await updateStudio({ logoUrl: r.url });
    if (!res.ok) setAviso({ tipo: 'error', texto: res.error });
  }

  async function handleQuitarLogo() {
    if (!studio) return;
    setSubiendo('logo');
    await eliminarLogoEstudio(studio.id);
    setSubiendo(null);
    const res = await updateStudio({ logoUrl: null });
    if (!res.ok) setAviso({ tipo: 'error', texto: res.error });
  }

  async function handleFavicon(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !studio) return;
    setSubiendo('favicon');
    const r = await subirFaviconEstudio(studio.id, file);
    setSubiendo(null);
    if ('error' in r) return setAviso({ tipo: 'error', texto: r.error });
    setCampo('faviconUrl', r.url);
  }

  async function handleQuitarFavicon() {
    if (!studio) return;
    setSubiendo('favicon');
    await eliminarFaviconEstudio(studio.id);
    setSubiendo(null);
    setCampo('faviconUrl', null);
  }

  // Imagen de bienvenida/portada del portal — NO es `studio.fotoUrl` (esa es
  // la foto de perfil de la propietaria, solo panel). Se persiste directo con
  // `updateStudio`, igual que el logo: sin borrador, no forma parte del JSON
  // de tema.
  async function handleImagenBienvenida(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !studio) return;
    setSubiendo('bienvenida');
    const r = await subirImagenBienvenida(studio.id, file);
    setSubiendo(null);
    if ('error' in r) return setAviso({ tipo: 'error', texto: r.error });
    const res = await updateStudio({ imagenBienvenidaUrl: r.url });
    if (!res.ok) setAviso({ tipo: 'error', texto: res.error });
  }

  async function handleQuitarImagenBienvenida() {
    if (!studio) return;
    setSubiendo('bienvenida');
    await eliminarImagenBienvenida(studio.id);
    setSubiendo(null);
    const res = await updateStudio({ imagenBienvenidaUrl: null });
    if (!res.ok) setAviso({ tipo: 'error', texto: res.error });
  }

  // Imagen para compartir (Open Graph). Es campo del TEMA —como el favicon, y
  // no como el logo— porque se publica junto al resto: hasta que no pulsas
  // Publicar, lo que ve WhatsApp sigue siendo lo de antes.
  //
  // Reutiliza `subirImagenPortal`, que ya redimensiona y sanea la clave del
  // fichero; no hace falta un subidor propio para esto.
  async function handleImagenCompartir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !studio) return;
    setSubiendo('compartir');
    const r = await subirImagenPortal(studio.id, 'compartir', file);
    setSubiendo(null);
    if ('error' in r) return setAviso({ tipo: 'error', texto: r.error });
    setCampo('seoImagenUrl', r.url);
  }

  // Sin borrar del bucket: la imagen ANTERIOR sigue siendo la publicada hasta
  // que se pulse Publicar. Borrarla aquí dejaría el enlace real enseñando un
  // hueco roto por haber tocado un borrador.
  function handleQuitarImagenCompartir() {
    setCampo('seoImagenUrl', null);
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
    handleGuardar, handlePublicar, handleLogo, handleQuitarLogo, handleFavicon, handleQuitarFavicon,
    handleImagenBienvenida, handleQuitarImagenBienvenida,
    handleImagenCompartir, handleQuitarImagenCompartir, restaurar, recargar,
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
  const logoRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);
  const bienvenidaRef = useRef<HTMLInputElement>(null);
  const compartirRef = useRef<HTMLInputElement>(null);

  if (categoriaId === 'compartir') {
    return <PanelCompartir hook={hook} fileRef={compartirRef} />;
  }

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
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl border border-border bg-muted flex items-center justify-center overflow-hidden">
            {studio?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={studio.logoUrl} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <span className="text-[10px] text-muted-foreground">Sin logo</span>
            )}
          </div>
          <button onClick={() => logoRef.current?.click()} disabled={subiendo === 'logo'} className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-border">
            <Upload size={14} /> {studio?.logoUrl ? 'Cambiar logo' : 'Subir logo'}
          </button>
          {studio?.logoUrl && (
            <button onClick={hook.handleQuitarLogo} disabled={subiendo === 'logo'} className="text-muted-foreground hover:text-destructive" aria-label="Quitar logo">
              <Trash2 size={16} />
            </button>
          )}
          <input ref={logoRef} type="file" accept="image/*" hidden onChange={hook.handleLogo} />
        </div>
        {/* Este mismo logo sale también en el icono de tus notificaciones
            push a clientas (antes salía siempre el genérico de Tentare) y
            en el icono de tu app instalada — cuadrado y sin márgenes es lo
            que mejor se ve en los dos sitios. */}
        <p className="text-[11px] text-muted-foreground">
          Recomendado: 512×512 px, cuadrado, fondo transparente o sólido (sin márgenes de sobra).
        </p>
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
        <div className="flex items-center gap-3">
          <div className="w-16 h-10 rounded-lg border border-border bg-muted flex items-center justify-center overflow-hidden shrink-0">
            {studio?.imagenBienvenidaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={studio.imagenBienvenidaUrl} alt="Imagen de bienvenida" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[9px] text-muted-foreground text-center px-1">Sin imagen</span>
            )}
          </div>
          <button onClick={() => bienvenidaRef.current?.click()} disabled={subiendo === 'bienvenida'} className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-border">
            <Upload size={14} /> {studio?.imagenBienvenidaUrl ? 'Cambiar imagen' : 'Subir imagen'}
          </button>
          {studio?.imagenBienvenidaUrl && (
            <button onClick={hook.handleQuitarImagenBienvenida} disabled={subiendo === 'bienvenida'} className="text-muted-foreground hover:text-destructive" aria-label="Quitar imagen de bienvenida">
              <Trash2 size={16} />
            </button>
          )}
          <input ref={bienvenidaRef} type="file" accept="image/*" hidden onChange={hook.handleImagenBienvenida} />
        </div>
        {/* Decir DÓNDE sale, y no solo que «la ven tus alumnas». El feedback
            fue «no se puede poner imagen en la bienvenida ni en las tarjetas»
            — cuando esta misma foto es las tres cosas. Enumerarlas es la
            diferencia entre una función que existe y una que se encuentra. */}
        <p className="text-[11px] text-muted-foreground">
          Es la foto de tu estudio, no tu foto de perfil. Con una sola se visten tres sitios:
          la <strong>pantalla de acceso</strong>, la <strong>bienvenida</strong> y el fondo de la
          <strong> tarjeta grande del Inicio</strong>. Sin ella, esos tres usan un fondo liso del color de tu marca.
        </p>
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
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl border border-border bg-muted flex items-center justify-center overflow-hidden">
          {draft.faviconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.faviconUrl} alt="Favicon" className="w-6 h-6 object-contain" />
          ) : (
            <span className="text-[10px] text-muted-foreground">Sin favicon</span>
          )}
        </div>
        <button onClick={() => faviconRef.current?.click()} disabled={subiendo === 'favicon'} className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-border">
          <Upload size={14} /> {draft.faviconUrl ? 'Cambiar favicon' : 'Subir favicon'}
        </button>
        {draft.faviconUrl && (
          <button onClick={hook.handleQuitarFavicon} disabled={subiendo === 'favicon'} className="text-muted-foreground hover:text-destructive" aria-label="Quitar favicon">
            <Trash2 size={16} />
          </button>
        )}
        <input ref={faviconRef} type="file" accept="image/*" hidden onChange={hook.handleFavicon} />
      </div>
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
function PanelCompartir({ hook, fileRef }: {
  hook: ReturnType<typeof useThemeEditor>;
  fileRef: React.RefObject<HTMLInputElement | null>;
}) {
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

      {/* La tarjeta, tal cual la pinta un chat. */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        {vista.imagen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vista.imagen} alt="" className="w-full aspect-[1.91/1] object-cover" />
        ) : (
          <div className="w-full aspect-[1.91/1] bg-muted flex items-center justify-center px-4 text-center">
            <p className="text-[11px] text-muted-foreground">Sin imagen, el enlace sale como un recuadro de texto.</p>
          </div>
        )}
        <div className="p-2.5 space-y-0.5">
          {dominio && <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{dominio}</p>}
          <p className="text-[12.5px] font-semibold text-foreground leading-snug">{vista.titulo}</p>
          <p className="text-[11.5px] text-muted-foreground leading-snug">{vista.descripcion}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={subiendo === 'compartir'}
            className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-border"
          >
            <Upload size={14} /> {draft.seoImagenUrl ? 'Cambiar imagen' : 'Subir imagen'}
          </button>
          {draft.seoImagenUrl && (
            <button onClick={hook.handleQuitarImagenCompartir} className="text-muted-foreground hover:text-destructive" aria-label="Quitar imagen para compartir">
              <Trash2 size={16} />
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={hook.handleImagenCompartir} />
        </div>
        <p className="text-[11px] text-muted-foreground">Apaisada, 1200 × 630 va perfecta.</p>
      </div>

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
