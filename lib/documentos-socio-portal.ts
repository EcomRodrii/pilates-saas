// Buzón de documentos (Community & Messaging OS, P2) — cliente del PORTAL de
// la clienta. El backend (esquema/RLS/`/api/public/documentos-socio`, URL
// firmada de 60s) ya está en producción; este módulo solo envuelve el fetch,
// mismo criterio que `lib/mensajeria-portal.ts`.

import { mensajeSeguro } from './errores.ts';

export interface DocumentoSociaPortal {
  id: string;
  categoria: 'PLAN' | 'FACTURA' | 'CONTRATO' | 'OTRO';
  titulo: string;
  creadoEn: string;
  url: string;
}

async function leerError(res: Response, respaldo: string): Promise<string> {
  const body = await res.json().catch(() => null) as { error?: string } | null;
  return body?.error ? mensajeSeguro(body.error, respaldo) : respaldo;
}

export async function fetchDocumentosSocia(
  headers: Record<string, string>, studioId: string,
): Promise<{ documentos: DocumentoSociaPortal[] } | { error: string }> {
  try {
    const res = await fetch(`/api/public/documentos-socio?studioId=${encodeURIComponent(studioId)}`, { headers });
    if (!res.ok) return { error: await leerError(res, 'No se han podido cargar tus documentos.') };
    return await res.json() as { documentos: DocumentoSociaPortal[] };
  } catch {
    return { error: 'No hay conexión con el servidor. Comprueba tu conexión e inténtalo de nuevo.' };
  }
}
