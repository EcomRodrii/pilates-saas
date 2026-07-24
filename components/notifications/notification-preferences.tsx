'use client';

// Preferencias de notificación: por CATEGORÍA (según el rol) y CANAL (en la app
// / push). Ausencia de fila = todo ON por defecto. Guarda al vuelo vía
// /api/notifications/preferences. Comparte código para los 3 roles; solo cambia
// la función que aporta la cabecera Authorization (panel vs portal).

import { useCallback, useEffect, useState } from 'react';
import { CATEGORIAS_POR_ROL, CATEGORIA_ETIQUETA } from '@/lib/notifications/catalog';
import type { NotificationRole } from '@/lib/notifications/types';
import { fetchPreferencias, guardarPreferencia } from '@/lib/notifications/client';

type Headers = () => Promise<Record<string, string>>;
interface Pref { inapp: boolean; push: boolean }
const DEFECTO: Pref = { inapp: true, push: true };

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative w-10 h-6 rounded-full transition-colors ${on ? 'bg-brand' : 'bg-muted-foreground/25'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
    </button>
  );
}

export function NotificationPreferences({ role, studioId, getHeaders }: {
  role: NotificationRole; studioId: string; getHeaders: Headers;
}) {
  const categorias = CATEGORIAS_POR_ROL[role];
  const [prefs, setPrefs] = useState<Record<string, Pref>>({});
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    const p = await fetchPreferencias(getHeaders);
    setPrefs(p as Record<string, Pref>);
    setCargando(false);
  }, [getHeaders]);

  // setState tras await (asíncrono), no en cascada — falso positivo del lint.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  async function toggle(cat: string, canal: keyof Pref) {
    const actual = prefs[cat] ?? DEFECTO;
    const siguiente = { ...actual, [canal]: !actual[canal] };
    setPrefs(p => ({ ...p, [cat]: siguiente }));
    await guardarPreferencia(getHeaders, studioId, cat, siguiente);
  }

  if (cargando) return <p className="text-[13px] text-muted-foreground">Cargando preferencias…</p>;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 px-4 py-2.5 border-b border-border text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <span>Tipo</span><span className="text-center">En la app</span><span className="text-center">Push</span>
      </div>
      {categorias.map(cat => {
        const p = prefs[cat] ?? DEFECTO;
        return (
          <div key={cat} className="grid grid-cols-[1fr_auto_auto] gap-x-6 items-center px-4 py-3 border-b border-border/60 last:border-0">
            <span className="text-[13.5px] font-semibold text-foreground">{CATEGORIA_ETIQUETA[cat]}</span>
            <span className="flex justify-center"><Toggle on={p.inapp} onChange={() => toggle(cat, 'inapp')} label={`${CATEGORIA_ETIQUETA[cat]} en la app`} /></span>
            <span className="flex justify-center"><Toggle on={p.push} onChange={() => toggle(cat, 'push')} label={`${CATEGORIA_ETIQUETA[cat]} push`} /></span>
          </div>
        );
      })}
      <p className="px-4 py-2.5 text-[11.5px] text-muted-foreground bg-muted/30">Los avisos críticos (p. ej. un problema de cobro) se envían siempre.</p>
    </div>
  );
}
