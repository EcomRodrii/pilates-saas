'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, Trash2, RotateCcw, Check, AlertTriangle, Sparkles, ChevronDown } from 'lucide-react';
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
import { DEFAULT_THEME, FUENTES, RADIOS, type ThemeConfig } from '@/lib/theme-schema';
import { validarContrasteTheme } from '@/lib/theme-runtime';
import { derivarPaleta } from '@/lib/color-utils';
import { ThemePreview } from './theme-preview';

const CAMPOS_COLOR: { key: keyof ThemeConfig; label: string }[] = [
  { key: 'primary', label: 'Color de marca' },
  { key: 'secondary', label: 'Secundario' },
  { key: 'accent', label: 'Acento (fondos suaves)' },
  { key: 'background', label: 'Fondo' },
  { key: 'text', label: 'Texto' },
];

// Paletas de arranque: el usuario elige un color de marca bonito y el resto de
// la paleta se deriva armónicamente (derivarPaleta). Después puede afinar.
const PALETAS: { label: string; primary: string }[] = [
  { label: 'Rosa', primary: '#FFC8E2' },
  { label: 'Terracota', primary: '#C2410C' },
  { label: 'Océano', primary: '#0F766E' },
  { label: 'Ciruela', primary: '#6D28D9' },
  { label: 'Índigo', primary: '#4F46E5' },
  { label: 'Esmeralda', primary: '#065F46' },
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

  function setCampo<K extends keyof ThemeConfig>(key: K, value: ThemeConfig[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setAviso(null);
  }

  // Aplica una paleta completa derivada de un color de marca (mantiene fuente,
  // radius y favicon actuales).
  function aplicarPaleta(primary: string) {
    const p = derivarPaleta(primary);
    setDraft((d) => ({ ...d, primary, secondary: p.secondary, accent: p.accent, background: p.background, text: p.text }));
    setAviso(null);
  }

  async function handleGuardar() {
    setGuardando(true);
    setAviso(null);
    try {
      await guardarThemeBorrador(draft);
      setAviso({ tipo: 'ok', texto: 'Borrador guardado. Aún no lo ven tus socias.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
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
        setAviso({ tipo: 'ok', texto: '¡Publicado! Ya lo ven tus socias.' });
      } else setAviso({ tipo: 'error', texto: r.errores.join(' ') });
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
      {/* Controles */}
      <div className="space-y-6">
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
            El borrador solo lo ves tú. Al publicar, el nuevo aspecto pasa a la app de socias y a la página pública de reservas.
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
