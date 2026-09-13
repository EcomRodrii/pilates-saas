import { authHeader } from '@/lib/api-client';

// Panel → rutas de consentimiento de salud. El servidor fija fecha, autor y
// texto; aquí solo viaja la firma tecleada.

export interface ConsentimientoSaludVigente { fecha: string; registradoPor: string }

export type ResultadoConsentimientoApi =
  | { ok: true; consentimiento: ConsentimientoSaludVigente | null }
  | { ok: false; error: string };

async function enviar(url: string, body: unknown): Promise<ResultadoConsentimientoApi> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body ?? {}),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean; error?: string; consentimiento?: ConsentimientoSaludVigente | null;
    };
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? 'No se ha podido guardar. Inténtalo de nuevo.' };
    return { ok: true, consentimiento: data.consentimiento ?? null };
  } catch {
    return { ok: false, error: 'Sin conexión. Inténtalo de nuevo.' };
  }
}

export function registrarConsentimientoSaludApi(socioId: string, firma: string): Promise<ResultadoConsentimientoApi> {
  return enviar(`/api/socios/${encodeURIComponent(socioId)}/consentimiento-salud`, { firma });
}

export function revocarConsentimientoSaludApi(socioId: string): Promise<ResultadoConsentimientoApi> {
  return enviar(`/api/socios/${encodeURIComponent(socioId)}/consentimiento-salud/revocar`, {});
}
