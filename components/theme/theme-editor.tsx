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
} from '@/lib/portal-storage';
import {
  DEFAULT_THEME, FUENTES, RADIOS, ESTILOS_BOTON, ESTILOS_TARJETA, REDES_SOCIALES_IDS,
  type ThemeConfig, type RedSocialId,
} from '@/lib/theme-schema';
import { validarContrasteTheme, themeToCssVars } from '@/lib/theme-runtime';
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
  { id: 'navegacion-portal', label: 'Navegación del portal' },
  { id: 'redes-sociales', label: 'Redes sociales' },
  { id: 'logo-favicon', label: 'Logo y favicon' },
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
  const [draft, setDraft] = useState<ThemeConfig>(DEFAULT_THEME);
  const [estado, setEstado] = useState<'cargando' | 'listo'>('cargando');
  const [guardando, setGuardando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [subiendo, setSubiendo] = useState<'logo' | 'favicon' | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchThemeBorrador()
      .then((t) => {
        if (vivo) setDraft(t);
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
    setDraft((d) => ({ ...d, [key]: value, themeCustomized: true }));
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

  function restaurar() {
    setDraft(DEFAULT_THEME);
    setAviso(null);
  }

  return {
    rol, studio, draft, estado, guardando, publicando, aviso, subiendo, contraste,
    navPortalResuelto, redesSocialesResueltas,
    setCampo, aplicarPaleta, elegirTema, toggleNavOculto, setNavEtiqueta, setNavIcono, setRedSocial,
    handleGuardar, handlePublicar, handleLogo, handleQuitarLogo, handleFavicon, handleQuitarFavicon, restaurar,
  };
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
      <select
        value={draft.fontId}
        onChange={(e) => setCampo('fontId', e.target.value as ThemeConfig['fontId'])}
        className="w-full text-[13px] px-3 py-2 rounded-xl border border-border bg-background"
      >
        {FUENTES.map((f) => (
          <option key={f.id} value={f.id}>{f.label}</option>
        ))}
      </select>
    );
  }

  if (categoriaId === 'esquinas') {
    return (
      <div className="flex gap-2">
        {RADIOS.map((r) => (
          <button
            key={r.id}
            onClick={() => setCampo('radius', r.id)}
            className={`flex-1 text-[13px] font-semibold py-2 rounded-xl border transition-colors ${
              draft.radius === r.id ? 'border-brand bg-brand text-brand-foreground' : 'border-border text-foreground'
            }`}
          >
            {r.label}
          </button>
        ))}
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

        {/* Preview en vivo (sin iframe: el widget de verdad, con las CSS
            vars del borrador aplicadas directamente — mismo componente que
            usa portal-shell.tsx, así que lo que se ve aquí es exacto). */}
        <div style={themeToCssVars(draft)} className="rounded-2xl border border-border bg-muted/40 p-4">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Así se ve</p>
          <div style={{ position: 'relative', height: altura.tabbar }}>
            <PortalNav
              items={navItemsVisibles(navPortalResuelto, NAV_DISPONIBLES)}
              activeIndex={0}
              slug={studio?.slug ?? ''}
              interactive={false}
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
