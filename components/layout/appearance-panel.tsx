'use client';

import Link from 'next/link';
import { createPortal } from 'react-dom';
import { X, Moon, Sun, Palette, ChevronRight } from 'lucide-react';
import { usePermisos } from '@/lib/permisos';
import { usePanelTheme } from '@/lib/panel-theme';

export function AppearancePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { rol } = usePermisos();
  const { dark, setDark } = usePanelTheme();

  if (!open) return null;

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
          <button onClick={onClose} aria-label="Cerrar apariencia" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6">
          {/* Tu panel — solo la preferencia personal de modo claro/oscuro. La
              MARCA la define el estudio (tema publicado), no cada usuario. */}
          <div>
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Tu panel</p>
            <button
              onClick={() => setDark(!dark)}
              className="w-full flex items-center justify-between px-3.5 py-3 rounded-2xl bg-muted"
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
            <p className="text-[11.5px] text-muted-foreground mt-3">Solo lo ves tú — se guarda en este navegador.</p>
          </div>

          {/* Marca del estudio — solo propietaria. Lleva al editor completo. */}
          {rol === 'PROPIETARIO' && (
            <div className="border-t border-muted pt-5">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Marca del estudio</p>
              <Link
                href="/configuracion/apariencia"
                onClick={onClose}
                className="w-full flex items-center justify-between px-3.5 py-3 rounded-2xl bg-muted hover:bg-muted/70 transition-colors"
              >
                <span className="flex items-center gap-2.5 text-[13px] font-semibold text-foreground">
                  <Palette size={16} />
                  Editar marca y apariencia
                </span>
                <ChevronRight size={16} className="text-muted-foreground" />
              </Link>
              <p className="text-[11.5px] text-muted-foreground mt-3">
                Colores, tipografía, logo y favicon de la app de clientas y la página de reservas.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
