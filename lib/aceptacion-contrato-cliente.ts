import { authHeader } from '@/lib/api-client';

// Panel → sello en servidor de la aceptación del contrato recogida en mostrador
// (`/api/socios/[id]/aceptacion-contrato`). Solo viaja la firma y el texto que
// había en pantalla (para anotar si coincidía); fecha, texto guardado, autor,
// IP y user-agent los pone el servidor.

export async function sellarAceptacionMostrador(
  socioId: string, firma: string, versionTexto: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/socios/${encodeURIComponent(socioId)}/aceptacion-contrato`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ firma, versionTexto }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? 'No se ha podido registrar la firma.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Sin conexión.' };
  }
}
