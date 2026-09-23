import { useEffect, useState } from 'react';
import { authHeader, portalAuthHeader } from '@/lib/api-client';

// RLS-1: Helpers para obtener URLs firmadas de fotos de personas.
//
// ⚠️ SEC-01 (auditoría 23-sep): esto llevaba desde su creación sin mandar
// NINGUNA cabecera `Authorization` — un `fetch` a pelo contra una ruta que
// exige `verificarUsuarioSupabase` (lee el bearer token). Habría devuelto
// 401 SIEMPRE, para cualquier llamador; por eso nunca tuvo consumidores: el
// primer sitio que lo intentara habría visto la foto fallar y habría vuelto
// a las iniciales sin más pista. El repo separa a propósito la sesión de
// STAFF (`authHeader`, lib/api-client.ts) de la de la SOCIA en el portal
// (`portalAuthHeader`) — nunca se mezclan (ver el comentario de
// `lib/db/supabase.ts` sobre el hallazgo #9) — así que quien llama tiene que
// decir de cuál de las dos es.
export type AmbitoFoto = 'staff' | 'portal';

/**
 * Obtiene una URL firmada (1 hora) para una foto guardada en Storage.
 * Uso: const url = await obtenerUrlFoto(fotoPath, studioId, 'staff');
 */
export async function obtenerUrlFoto(
  fotoPath: string | null,
  studioId: string,
  ambito: AmbitoFoto,
): Promise<string | null> {
  if (!fotoPath) return null;

  try {
    const headers = await (ambito === 'portal' ? portalAuthHeader() : authHeader());
    const res = await fetch(
      `/api/foto/signed-url?path=${encodeURIComponent(fotoPath)}&studioId=${encodeURIComponent(studioId)}`,
      { headers },
    );
    if (!res.ok) return null;

    const { url } = (await res.json()) as { url: string; expiresIn: number };
    return url;
  } catch {
    return null;
  }
}

/**
 * Hook para componentes React que necesitan una foto.
 * Maneja carga y errores automáticamente.
 */

export function useFotoUrl(fotoPath: string | null, studioId: string, ambito: AmbitoFoto) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fotoPath) {
      return;
    }

    let isMounted = true;

    (async () => {
      setLoading(true);
      setError(null);

      const resultado = await obtenerUrlFoto(fotoPath, studioId, ambito);
      if (isMounted) {
        setUrl(resultado);
        if (!resultado) setError('No se pudo cargar la foto');
        setLoading(false);
      }
    })().catch(err => {
      if (isMounted) {
        setError(err?.message || 'Error al cargar la foto');
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [fotoPath, studioId, ambito]);

  return { url, loading, error };
}
