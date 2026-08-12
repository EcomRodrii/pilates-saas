import { authHeader } from '@/lib/api-client';
import type { CondicionSalud } from '@/lib/types';

export interface AdaptacionSocioIA {
  resumen: string;
  evitar: string[];
  variantes: string[];
}

export async function sugerirAdaptacionesSocio(condiciones: CondicionSalud[]): Promise<AdaptacionSocioIA> {
  const res = await fetch('/api/ai/ficha-clinica-socio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ condiciones }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Error al procesar con IA');
  return {
    resumen: data.resumen ?? '',
    evitar: Array.isArray(data.evitar) ? data.evitar : [],
    variantes: Array.isArray(data.variantes) ? data.variantes : [],
  };
}
