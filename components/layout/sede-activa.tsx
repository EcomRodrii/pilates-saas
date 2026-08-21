'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Qué sede estás mirando. SIEMPRE a la vista.
//
// El nombre de la sede activa no aparecía en ninguna pantalla del panel y el
// selector vivía dentro del menú del avatar. En una cadena eso es un riesgo
// real: cancelar una clase, cobrar o borrar una socia creyendo que estás en
// otro centro. Y al cambiar de sede la app hace un hard-nav a /dashboard, que
// se ve idéntico salvo por los datos — sin nada que avise del cambio.
//
// Con una sola sede no se pinta nada: no hay ambigüedad que resolver y una
// etiqueta permanente de más solo es ruido.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from 'react';
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCore } from '@/lib/core-context';
import { cn } from '@/lib/utils';
import { ETIQUETA_ROL } from '@/lib/permisos-reglas';
import type { Rol } from '@/lib/types';
import { fetchMisEstudios, cambiarSedeActiva, type SedeSeleccionable } from '@/lib/supabase-data';

/** Marca la sede recién elegida para poder confirmarlo al aterrizar. Exportada:
 *  el listado de sedes de Configuración > Estudio (P2-14) cambia de sede con
 *  el mismo mecanismo y debe enseñar el mismo aviso al aterrizar. */
export const CLAVE_CAMBIO_SEDE = 'tentare:sede-cambiada';
const CLAVE_CAMBIO = CLAVE_CAMBIO_SEDE;

// P2-14: rol legible por sede — instructoras multi-sede pueden ser
// PROPIETARIO/MANAGER en una y solo INSTRUCTOR en otra, y conviene que no
// les sorprenda el cambio de permisos al cambiar de sede en este menú.
// `ETIQUETA_ROL` viene de lib/permisos-reglas.ts — fuente única (auditoría
// integral 2026-08-21: este archivo tenía su propio catálogo, con MANAGER
// llamado "Gerencia" mientras otros sitios lo llamaban "Responsable de sede").

export function SedeActiva({ variante = 'sidebar' }: { variante?: 'sidebar' | 'topbar' }) {
  const { user } = useAuth();
  const { studio } = useCore();
  const [sedes, setSedes] = useState<SedeSeleccionable[]>([]);
  const [open, setOpen] = useState(false);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    fetchMisEstudios().then(r => { if (vivo) setSedes(r); });
    return () => { vivo = false; };
  }, [user]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function elegir(studioId: string) {
    if (!user || studioId === studio?.id || cambiando) return;
    setCambiando(studioId);
    // Hard-nav tras guardar: StudioProvider tiene que remontar limpio contra la
    // nueva sede (mismo patrón que el menú de perfil). El nombre se deja en
    // sessionStorage para poder confirmar el cambio al otro lado del salto.
    cambiarSedeActiva(user.id, studioId).then(ok => {
      if (!ok) { setCambiando(null); return; }
      const destino = sedes.find(s => s.id === studioId);
      try { sessionStorage.setItem(CLAVE_CAMBIO, destino?.nombre ?? ''); } catch { /* modo privado */ }
      window.location.href = '/dashboard';
    });
  }

  // Una sola sede (el caso de la mayoría): nada que desambiguar.
  if (sedes.length < 2) return null;

  const enSidebar = variante === 'sidebar';

  return (
    <div className={cn('relative', enSidebar ? 'px-3 pt-3 pb-1' : '')} ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={`Sede activa: ${studio?.nombre ?? ''}. Pulsa para cambiar de sede`}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'flex items-center gap-2 w-full rounded-xl transition-colors text-left',
          enSidebar
            // `text-white` a propósito, no `text-card`: el sidebar es SIEMPRE
            // oscuro (--sidebar no cambia con el tema, ver app/globals.css),
            // pero `--card` sí — en modo oscuro pasa a ser gris oscuro
            // (#1E1E22), casi ilegible sobre el fondo del sidebar (#0F0F0F).
            // Mismo criterio que ya usa el resto del sidebar (sidebar.tsx),
            // que nunca usa `text-card`/`text-muted-foreground` por este
            // motivo (#853).
            ? 'px-2.5 py-2 bg-card/10 hover:bg-card/15 text-white'
            : 'px-2.5 py-1.5 border border-border hover:bg-muted text-foreground max-w-[240px]',
        )}
      >
        <Building2 size={14} className={cn('shrink-0', enSidebar ? 'opacity-70' : 'text-muted-foreground')} />
        <span className="min-w-0 flex-1">
          <span className={cn('block text-[10px] font-bold uppercase tracking-wide leading-none mb-0.5', enSidebar ? 'opacity-60' : 'text-muted-foreground')}>
            Sede
          </span>
          <span className="block text-[13px] font-semibold truncate leading-tight">{studio?.nombre ?? '—'}</span>
        </span>
        <ChevronDown size={14} className={cn('shrink-0', enSidebar ? 'opacity-60' : 'text-muted-foreground')} />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-30 bg-card rounded-2xl shadow-xl border border-border py-1.5',
            enSidebar ? 'left-3 right-3 top-full mt-1' : 'left-0 top-full mt-2 w-64',
          )}
        >
          <p className="px-3.5 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Cambiar de sede
          </p>
          {sedes.map(s => (
            <button
              key={s.id}
              role="menuitem"
              onClick={() => elegir(s.id)}
              disabled={cambiando !== null}
              className={cn(
                'w-full flex items-center justify-between gap-2 px-3.5 py-2 text-[13px] text-left text-foreground hover:bg-muted transition-colors',
                cambiando !== null && 'opacity-50',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{s.nombre}</span>
                {s.rol && ETIQUETA_ROL[s.rol as Rol] && (
                  <span className="block text-[11px] text-muted-foreground truncate">{ETIQUETA_ROL[s.rol as Rol].label}</span>
                )}
              </span>
              {cambiando === s.id
                ? <Loader2 size={14} className="animate-spin shrink-0 text-muted-foreground" />
                : s.id === studio?.id && <Check size={14} className="text-success shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Confirmación tras el salto: al cambiar de sede la app recarga y el panel se ve
 * igual salvo por los datos. Este aviso es lo único que dice que has cambiado.
 */
export function AvisoCambioDeSede() {
  const [nombre, setNombre] = useState<string | null>(null);

  useEffect(() => {
    try {
      const n = sessionStorage.getItem(CLAVE_CAMBIO);
      if (n === null) return;
      sessionStorage.removeItem(CLAVE_CAMBIO); // se enseña una vez, no en cada recarga
      // sessionStorage no existe en el render del servidor, así que leerlo en un
      // efecto es la única vía (mismo caso que el `ahoraMs` del resto del panel).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNombre(n);
      const t = setTimeout(() => setNombre(null), 5000);
      return () => clearTimeout(t);
    } catch { /* modo privado: sin aviso, pero sin romper */ }
  }, []);

  if (!nombre) return null;

  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-foreground text-background shadow-xl text-[13px] font-semibold"
    >
      <Building2 size={14} /> Ahora estás en {nombre}
    </div>
  );
}
