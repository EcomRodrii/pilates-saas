import { useEffect, useState } from 'react';

// RLS-1: Helpers para obtener URLs firmadas de fotos de personas.

/**
 * Obtiene una URL firmada (60 segundos) para una foto guardada en el bucket privado.
 * Uso: const url = await obtenerUrlFoto(fotoPath, studioId);
 */
export async function obtenerUrlFoto(
  fotoPath: string | null,
  studioId: string,
): Promise<string | null> {
  if (!fotoPath) return null;

  try {
    const res = await fetch(`/api/foto/signed-url?path=${encodeURIComponent(fotoPath)}&studioId=${encodeURIComponent(studioId)}`);
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

export function useFotoUrl(fotoPath: string | null, studioId: string) {
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

      const resultado = await obtenerUrlFoto(fotoPath, studioId);
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
  }, [fotoPath, studioId]);

  return { url, loading, error };
}
