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
import { useEffect, useState } from 'react';

export function useFotoUrl(fotoPath: string | null, studioId: string) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fotoPath) {
      setUrl(null);
      return;
    }

    setLoading(true);
    setError(null);

    obtenerUrlFoto(fotoPath, studioId)
      .then(resultado => {
        setUrl(resultado);
        if (!resultado) setError('No se pudo cargar la foto');
      })
      .catch(err => {
        setError(err?.message || 'Error al cargar la foto');
      })
      .finally(() => setLoading(false));
  }, [fotoPath, studioId]);

  return { url, loading, error };
}
