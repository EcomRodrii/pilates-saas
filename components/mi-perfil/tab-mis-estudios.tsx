'use client';

import { useEffect, useState } from 'react';
import { fetchMisEstudios, type SedeSeleccionable } from '@/lib/supabase-data';

// Vista informativa de "en qué estudios trabajo" — para la instructora
// freelance que reparte su semana entre varios. Reutiliza mis_estudios()
// (RPC ya existente, migración 0066), que ya devuelve solo columnas no
// sensibles (id/nombre/slug/ciudad). De solo lectura a propósito: cambiar
// de sede activa sigue viviendo únicamente en el selector del menú de
// perfil (components/layout/profile-menu.tsx), sin duplicar esa lógica aquí.
export function TabMisEstudios() {
  const [estudios, setEstudios] = useState<SedeSeleccionable[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    fetchMisEstudios().then(r => { if (vivo) { setEstudios(r); setCargando(false); } });
    return () => { vivo = false; };
  }, []);

  if (cargando) return null; // evita parpadeo; no hay nada que mostrar mientras carga
  if (estudios.length <= 1) return null; // un solo estudio no aporta nada aquí

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-[14px] font-semibold text-foreground">Tus estudios</h2>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Los estudios donde trabajas. Para cambiar de sede activa, usa el menú de tu perfil (arriba a la derecha).
      </p>
      <ul className="mt-3 space-y-2">
        {estudios.map(e => (
          <li key={e.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <span className="text-[13px] font-medium text-foreground">{e.nombre}</span>
            {e.ciudad && <span className="text-[12px] text-muted-foreground">{e.ciudad}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
