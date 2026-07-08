'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Moon, Sun, Check } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { usePermisos } from '@/lib/permisos';
import { usePanelTheme } from '@/lib/panel-theme';
import { THEME_PRESETS, type ThemePresetId } from '@/lib/theme-presets';

function PresetSwatch({
  preset,
  selected,
  onClick,
}: {
  preset: (typeof THEME_PRESETS)[number];
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={preset.label}
      className="flex flex-col items-center gap-1.5 group"
    >
      <span
        className="w-10 h-10 rounded-full flex items-center justify-center ring-2 ring-offset-2 transition-all"
        style={{
          background: `linear-gradient(135deg, ${preset.primary} 50%, ${preset.secondary} 50%)`,
          ['--tw-ring-color' as string]: selected ? preset.primary : 'transparent',
        }}
      >
        {selected && (
          <Check size={15} style={{ color: preset.foreground }} strokeWidth={3} />
        )}
      </span>
      <span className="text-[10px] font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
        {preset.label}
      </span>
    </button>
  );
}

export function AppearancePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { studio, updateStudio } = useStudio();
  const { rol } = usePermisos();
  const { presetId, setPreset, dark, setDark } = usePanelTheme();
  const [portalSaving, setPortalSaving] = useState<'idle' | 'guardando' | 'guardado'>('idle');

  if (!open) return null;

  const portalPresetId = (studio?.temaPortal as ThemePresetId) ?? 'original';

  async function handlePortalPreset(id: ThemePresetId) {
    setPortalSaving('guardando');
    await updateStudio({ temaPortal: id });
    setPortalSaving('guardado');
    setTimeout(() => setPortalSaving('idle'), 1500);
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center px-0 lg:px-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative w-full lg:w-[440px] bg-card rounded-t-3xl lg:rounded-3xl shadow-2xl flex flex-col"
        style={{ maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <p className="text-[15px] font-extrabold text-foreground">Apariencia</p>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6">
          {/* Tu panel */}
          <div>
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Tu panel</p>

            <button
              onClick={() => setDark(!dark)}
              className="w-full flex items-center justify-between px-3.5 py-3 rounded-2xl bg-muted mb-4"
            >
              <span className="flex items-center gap-2.5 text-[13px] font-semibold text-foreground">
                {dark ? <Moon size={16} /> : <Sun size={16} />}
                Modo oscuro
              </span>
              <span
                className="w-10 h-6 rounded-full flex items-center px-0.5 transition-colors"
                style={{ backgroundColor: dark ? 'var(--brand)' : 'var(--muted-foreground)' }}
              >
                <span
                  className="w-5 h-5 bg-card rounded-full shadow transition-transform"
                  style={{ transform: dark ? 'translateX(16px)' : 'translateX(0)' }}
                />
              </span>
            </button>

            <div className="grid grid-cols-3 gap-3">
              {THEME_PRESETS.map(preset => (
                <PresetSwatch
                  key={preset.id}
                  preset={preset}
                  selected={presetId === preset.id}
                  onClick={() => setPreset(preset.id)}
                />
              ))}
            </div>
            <p className="text-[11.5px] text-muted-foreground mt-3">Solo lo ves tú — se guarda en este navegador.</p>
          </div>

          {/* App de socias — solo propietaria */}
          {rol === 'PROPIETARIO' && (
            <div className="border-t border-muted pt-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Tema de la app de socias</p>
                {portalSaving === 'guardando' && <span className="text-[11px] text-muted-foreground">Guardando…</span>}
                {portalSaving === 'guardado' && <span className="text-[11px] text-green-600 font-semibold">Guardado ✓</span>}
              </div>

              <div className="grid grid-cols-3 gap-3">
                {THEME_PRESETS.map(preset => (
                  <PresetSwatch
                    key={preset.id}
                    preset={preset}
                    selected={portalPresetId === preset.id}
                    onClick={() => handlePortalPreset(preset.id)}
                  />
                ))}
              </div>
              <p className="text-[11.5px] text-muted-foreground mt-3">Lo verán todas tus socias en su app.</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
