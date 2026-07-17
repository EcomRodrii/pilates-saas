'use client';

// Cliente de las rutas de IA del módulo de Contenido, con respaldo local.
// Si la IA falla (sin API key, error de red, respuesta inválida), cae a los
// generadores por plantilla para que el flujo nunca se rompa (modo demo).

import { authHeader } from '@/lib/api-client';
import { generarGuionLocal, generarCarruselLocal, type GuionGenerado, type SlideGenerada } from './generadores';
import type { Plataforma } from './types';

export interface ResultadoIA<T> { data: T; demo: boolean }

export async function generarGuion(tema: string, plataforma: Plataforma): Promise<ResultadoIA<GuionGenerado>> {
  try {
    const res = await fetch('/api/ai/guion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ tema, plataforma }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as GuionGenerado;
    if (!data?.gancho && !data?.desarrollo) throw new Error('vacío');
    return { data, demo: false };
  } catch {
    return { data: generarGuionLocal(tema, plataforma), demo: true };
  }
}

export async function generarCarrusel(tema: string, slides: number): Promise<ResultadoIA<SlideGenerada[]>> {
  try {
    const res = await fetch('/api/ai/carrusel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ tema, slides }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { slides: SlideGenerada[] };
    if (!Array.isArray(data?.slides) || data.slides.length === 0) throw new Error('vacío');
    return { data: data.slides, demo: false };
  } catch {
    return { data: generarCarruselLocal(tema, slides), demo: true };
  }
}
