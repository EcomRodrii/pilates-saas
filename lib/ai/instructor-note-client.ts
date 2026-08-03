import { authHeader } from '@/lib/api-client';

export interface NotaIAEstructurada {
  progreso: string | null;
  alertas: string | null;
  planProximaSesion: string | null;
  ejerciciosCasa: string | null;
}

export async function estructurarNotaIA(params: {
  texto: string;
  socioId: string;
  instructorId: string;
  sesionId?: string | null;
}): Promise<NotaIAEstructurada> {
  const res = await fetch('/api/ai/instructor-note', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Error al procesar con IA');
  return {
    progreso: data.progreso ?? null,
    alertas: data.alertas ?? null,
    planProximaSesion: data.planProximaSesion ?? null,
    ejerciciosCasa: data.ejerciciosCasa ?? null,
  };
}
