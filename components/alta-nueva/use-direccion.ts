'use client';

// ¿Qué dirección le tocaría al estudio con este nombre? Pregunta a
// /api/public/direccion-disponible cuando el nombre se queda quieto (400 ms), y
// solo da por buena la respuesta de LO ÚLTIMO escrito: una respuesta vieja nunca
// pisa a una nueva. Cualquier fallo es «sin respuesta» (null): el alta vuelve a
// su aviso de siempre y no promete nada.

import { useEffect, useState } from 'react';
import { baseDeDireccion, type DireccionResuelta } from '@/lib/alta/direccion';

const ESPERA_MS = 400;
// Una comprobación que no contesta no puede dejar «Comprobando…» para siempre.
const TOPE_MS = 4_000;

export function useDireccion(nombre: string): { resuelta: DireccionResuelta | null; comprobando: boolean } {
  const [guardada, setGuardada] = useState<DireccionResuelta | null>(null);
  // Para qué nombre ya hubo respuesta (o fallo): «comprobando» se deduce de aquí, sin setState síncrono en el efecto.
  const [respondidoPara, setRespondidoPara] = useState<string | null>(null);
  const limpio = nombre.trim();
  const base = limpio ? baseDeDireccion(limpio) : '';

  useEffect(() => {
    if (!limpio) return;
    const control = new AbortController();
    let vigente = true; // false cuando el nombre cambia: lo que llegue de esta vuelta ya no cuenta
    const t = setTimeout(() => {
      const tope = setTimeout(() => control.abort(), TOPE_MS);
      fetch(`/api/public/direccion-disponible?nombre=${encodeURIComponent(limpio)}`, { signal: control.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: DireccionResuelta | null) => {
          clearTimeout(tope);
          if (!vigente) return;
          setGuardada(d && typeof d.base === 'string' && typeof d.estado === 'string' ? d : null);
          setRespondidoPara(limpio);
        })
        .catch(() => { clearTimeout(tope); if (vigente) { setGuardada(null); setRespondidoPara(limpio); } });
    }, ESPERA_MS);
    return () => { vigente = false; clearTimeout(t); control.abort(); };
  }, [limpio]);

  // Solo vale lo contestado para ESTA base: si el nombre cambió y aún no ha vuelto
  // la respuesta, no se enseña la de antes.
  const comprobando = limpio !== '' && respondidoPara !== limpio;
  return { resuelta: guardada && guardada.base === base ? guardada : null, comprobando };
}
