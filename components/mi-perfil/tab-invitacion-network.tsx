'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { fetchMiPerfilNetwork } from '@/lib/api-client';

// Empujón hacia Tentare Network desde el panel de la instructora — hoy no
// existía ningún camino desde aquí (P0 de liquidez, auditoría 2026-08-25):
// el único enlace a /network/crear-perfil vivía en /login y en la propia
// nav pública de Network, nunca dentro de (dashboard). El contenido del
// perfil lo rellena la instructora en el wizard ya existente — esta tarjeta
// nunca inventa ni promete nada sobre lo que aparecerá ahí, solo invita.
//
// 'en_revision'/'published'/'hidden'/'suspended' no muestran nada: ya se
// comprometió con Network o está en manos del equipo de Tentare — insistir
// ahí sería ruido, no un empujón útil.
export function TabInvitacionNetwork() {
  const [estado, setEstado] = useState<'draft' | 'ninguno' | 'oculto' | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchMiPerfilNetwork().then(perfil => {
      if (!vivo) return;
      if (!perfil) { setEstado('ninguno'); return; }
      if (perfil.estado === 'draft') { setEstado('draft'); return; }
      setEstado('oculto');
    });
    return () => { vivo = false; };
  }, []);

  if (estado === null || estado === 'oculto') return null;

  const esDraft = estado === 'draft';

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 text-[var(--brand)]">
          <Sparkles size={16} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-foreground">
            {esDraft ? 'Termina tu perfil de Tentare Network' : 'Publica tu perfil en Tentare Network'}
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {esDraft
              ? 'Ya empezaste tu perfil. Complétalo para que estudios y alumnas puedan encontrarte y contactarte, sin comisiones.'
              : 'Estudios y alumnas te encuentran y te contactan directamente, sin comisiones ni intermediarios. Tú decides qué mostrar.'}
          </p>
          <a
            href="/network/crear-perfil"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center rounded-full bg-[var(--brand)] px-4 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            {esDraft ? 'Continuar mi perfil' : 'Crear mi perfil'}
          </a>
        </div>
      </div>
    </div>
  );
}
