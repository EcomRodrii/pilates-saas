'use client';

import { useEffect, useRef, useState, useId } from 'react';
import { Upload, Trash2, RotateCcw, Check, AlertTriangle, Sparkles, ChevronDown, Eye, EyeOff } from 'lucide-react';
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
import { THEME_DEFINITIONS, type ThemeDefinition } from '@/lib/theme-definitions';
import { derivarPaleta } from '@/lib/color-utils';
import { NAV_DISPONIBLES, NAV_ICONOS_DISPONIBLES, navItemsVisibles, resolveNavConfig, type NavSegId, type NavIconoId } from '@/lib/portal-nav';
import { PortalNav } from '@/components/portal/portal-nav';
import { altura } from '@/lib/portal-design';
import { ThemePreview } from './theme-preview';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';

const CAMPOS_COLOR: { key: keyof ThemeConfig; label: string }[] = [
  { key: 'primary', label: 'Color de marca' },
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

export function ThemeEditor() {
  const { studio, updateStudio } = useStudio();
  const { rol } = usePermisos();
  const [draft, setDraft] = useState<ThemeConfig>(DEFAULT_THEME);
  const [estado, setEstado] = useState<'cargando' | 'listo'>('cargando');
  const [guardando, setGuardando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [subiendo, setSubiendo] = useState<'logo' | 'favicon' | null>(null);
  const [mostrarAvanzado, setMostrarAvanzado] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);

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

  if (rol !== 'PROPIETARIO') {
    return <p className="text-sm text-muted-foreground">Solo la propietaria del estudio puede editar la marca.</p>;
  }

  const contraste = validarContrasteTheme(draft);
  // Igual que en los helpers de abajo: `draft.navPortal` puede faltar en un
  // tema que no pasó por resolveTheme (parcial/legado) — nunca se lee crudo.
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
  // `d.navPortal` puede faltar en un tema guardado ANTES de esta fase (o en
  // cualquier fuente que no pase por resolveTheme) — resolveNavConfig() nunca
  // lanza, mismo principio que el resto de este esquema (ver lib/theme-schema.ts).
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
  // de enlaces peligrosos vive en el render (resolverHrefBloque). `d.redesSociales`
  // puede faltar en un tema parcial/legado — mismo motivo que navPortal arriba.
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
    await updateStudio({ logoUrl: r.url });
  }

  async function handleQuitarLogo() {
    if (!studio) return;
    setSubiendo('logo');
    await eliminarLogoEstudio(studio.id);
    setSubiendo(null);
    await updateStudio({ logoUrl: null });
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

  if (estado === 'cargando') {
    return <p className="text-sm text-muted-foreground">Cargando tu marca…</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
      {/* Controles */}
      <div className="space-y-6 rounded-2xl border border-border bg-card p-5">
        {/* Tema — se elige primero, con nombre; "Personalizar" (debajo) afina */}
        <section className="space-y-3">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Tema</p>
          <div className="grid grid-cols-2 gap-2.5">
            {THEME_DEFINITIONS.map((def) => {
              const activo = draft.themeId === def.id;
              return (
                <button
                  key={def.id}
                  onClick={() => elegirTema(def)}
                  className={`text-left p-3 rounded-xl border-2 transition-colors ${
                    activo ? 'border-brand bg-brand/5' : 'border-border'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
                    {def.label}
                    {activo && draft.themeCustomized && (
                      <span className="text-[10.5px] font-medium text-muted-foreground">(personalizado)</span>
                    )}
                    {activo && <Check size={13} className="text-brand ml-auto" strokeWidth={3} />}
                  </span>
                  <span className="text-[11.5px] text-muted-foreground">{def.description}</span>
                </button>
              );
            })}
          </div>
        </section>

        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-t border-border pt-5">
          Personalizar
        </p>

        {/* Paletas de arranque */}
        <section className="space-y-3">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Empieza con una paleta</p>
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
        </section>

        {/* Color de marca + generar paleta */}
        <section className="space-y-3">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Color de marca</p>
          <ColorField label="Color de marca" value={draft.primary} onChange={(v) => setCampo('primary', v)} />
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
        </section>

        {/* Ajuste fino (plegable) */}
        <section className="space-y-3">
          <button
            onClick={() => setMostrarAvanzado((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-widest"
          >
            <ChevronDown size={14} className={`transition-transform ${mostrarAvanzado ? 'rotate-180' : ''}`} />
            Ajuste fino de colores
          </button>
          {mostrarAvanzado &&
            CAMPOS_COLOR.filter((c) => c.key !== 'primary').map(({ key, label }) => (
              <ColorField key={key} label={label} value={draft[key] as string} onChange={(v) => setCampo(key, v as ThemeConfig[typeof key])} />
            ))}
        </section>

        {/* Tipografía */}
        <section className="space-y-2">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Tipografía</p>
          <select
            value={draft.fontId}
            onChange={(e) => setCampo('fontId', e.target.value as ThemeConfig['fontId'])}
            className="w-full text-[13px] px-3 py-2 rounded-xl border border-border bg-background"
          >
            {FUENTES.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </section>

        {/* Esquinas */}
        <section className="space-y-2">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Esquinas</p>
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
        </section>

        {/* Botón */}
        <section className="space-y-2">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Botón principal</p>
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
        </section>

        {/* Tarjetas */}
        <section className="space-y-2">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Tarjetas</p>
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
        </section>

        {/* Navegación del portal (Fase 2 del Theme Builder): ocultar
            pestañas y sustituir etiqueta/icono. Sin reordenar a propósito —
            ver comentario en lib/portal-nav.ts. */}
        <section className="space-y-2">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Navegación del portal</p>
          <p className="text-[11.5px] text-muted-foreground -mt-1">
            Oculta las pestañas que no uses y cambia su nombre o icono. El orden es el mismo para todos los estudios.
          </p>
          <div className="space-y-1.5">
            {NAV_DISPONIBLES.map((item) => {
              const oculta = navPortalResuelto.ocultos.includes(item.seg);
              return (
                <div key={item.seg} className="flex items-center gap-2 rounded-xl border border-border p-2.5">
                  <button
                    type="button"
                    onClick={() => toggleNavOculto(item.seg)}
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
                    onChange={(e) => setNavEtiqueta(item.seg, e.target.value)}
                    placeholder={item.label}
                    aria-label={`Etiqueta de ${item.label}`}
                    className="min-w-0 flex-1 text-[12.5px] px-2.5 py-1.5 rounded-lg border border-border bg-background"
                  />
                  <select
                    value={navPortalResuelto.iconos[item.seg] ?? ''}
                    onChange={(e) => setNavIcono(item.seg, e.target.value)}
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
        </section>

        {/* Redes sociales del pie de página público (Fase 3 del Theme
            Builder) — se ven en el pie de app/reservar/[slug], la página de
            reservas pública. Vacío = no se muestra ese icono. */}
        <section className="space-y-2">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Redes sociales</p>
          <p className="text-[11.5px] text-muted-foreground -mt-1">
            Se ven en el pie de tu página pública de reservas. Deja en blanco la que no uses.
          </p>
          <div className="space-y-2">
            {REDES_SOCIALES_IDS.map((id) => (
              <label key={id} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-[12px] font-semibold text-foreground">{RED_SOCIAL_LABEL[id]}</span>
                <input
                  value={redesSocialesResueltas[id]}
                  onChange={(e) => setRedSocial(id, e.target.value)}
                  placeholder={RED_SOCIAL_PLACEHOLDER[id]}
                  aria-label={RED_SOCIAL_LABEL[id]}
                  className="min-w-0 flex-1 text-[12.5px] px-2.5 py-1.5 rounded-lg border border-border bg-background"
                />
              </label>
            ))}
          </div>
        </section>

        {/* Logo y favicon */}
        <section className="space-y-3">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Logo y favicon</p>
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
              <button onClick={handleQuitarLogo} disabled={subiendo === 'logo'} className="text-muted-foreground hover:text-destructive" aria-label="Quitar logo">
                <Trash2 size={16} />
              </button>
            )}
            <input ref={logoRef} type="file" accept="image/*" hidden onChange={handleLogo} />
          </div>
          {/* Este mismo logo sale también en el icono de tus notificaciones
              push a clientas (antes salía siempre el genérico de Tentare) y
              en el icono de tu app instalada — cuadrado y sin márgenes es lo
              que mejor se ve en los dos sitios. */}
          <p className="text-[11px] text-muted-foreground -mt-1.5">
            Recomendado: 512×512 px, cuadrado, fondo transparente o sólido (sin márgenes de sobra).
          </p>
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
              <button onClick={handleQuitarFavicon} disabled={subiendo === 'favicon'} className="text-muted-foreground hover:text-destructive" aria-label="Quitar favicon">
                <Trash2 size={16} />
              </button>
            )}
            <input ref={faviconRef} type="file" accept="image/*" hidden onChange={handleFavicon} />
          </div>
        </section>

        {/* Acciones */}
        <section className="space-y-3 border-t border-border pt-4">
          {aviso && (
            <div className={`flex items-center gap-2 text-[12.5px] font-medium ${aviso.tipo === 'ok' ? 'text-green-700' : 'text-destructive'}`}>
              {aviso.tipo === 'ok' ? <Check size={15} /> : <AlertTriangle size={15} />}
              <span>{aviso.texto}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => setDraft(DEFAULT_THEME)} className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-border text-muted-foreground">
              <RotateCcw size={14} /> Restaurar
            </button>
            <div className="flex-1" />
            <button onClick={handleGuardar} disabled={guardando} className="text-[13px] font-semibold px-4 py-2 rounded-xl border border-border">
              {guardando ? 'Guardando…' : 'Guardar borrador'}
            </button>
            <button
              onClick={handlePublicar}
              disabled={publicando || !contraste.ok}
              title={!contraste.ok ? 'Corrige el contraste antes de publicar' : undefined}
              className="text-[13px] font-bold px-4 py-2 rounded-xl bg-brand text-brand-foreground disabled:opacity-50"
            >
              {publicando ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
          <p className="text-[11.5px] text-muted-foreground">
            El borrador solo lo ves tú. Al publicar, el nuevo aspecto pasa a la app de clientas y a la página pública de reservas.
          </p>
        </section>
      </div>

      {/* Preview en vivo (iframe real del portal de reservas) */}
      <div className="lg:sticky lg:top-4 space-y-2">
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Vista previa en vivo</p>
        <ThemePreview config={draft} slug={studio?.slug} />
        <p className="text-[11px] text-muted-foreground">Es tu página de reservas real con el tema del borrador.</p>
      </div>
    </div>
  );
}
