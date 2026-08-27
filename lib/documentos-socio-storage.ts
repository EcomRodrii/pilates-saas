import { supabase } from '@/lib/db/supabase';

// Buzón de documentos (Community & Messaging OS, P2) — lado STAFF, subida del
// binario en sí. Mismo patrón que `lib/network/portfolio-storage.ts`: el
// cliente sube DIRECTO al bucket privado con su propia sesión `authenticated`
// (la RLS de storage, migración 20260826200010, exige
// `puede_gestionar_clientas()` + que el primer segmento del path sea
// `current_studio_id()`), y solo después `POST /api/documentos-socio` inserta
// la fila de metadatos — ver el comentario de esa ruta para el porqué de las
// dos llamadas.
const BUCKET = 'documentos-socio';

const MIME_ADMITIDOS = ['application/pdf', 'image/png', 'image/jpeg'];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — igual que el límite del bucket.

export function validarDocumentoSocio(file: File): string | null {
  if (!MIME_ADMITIDOS.includes(file.type)) return 'Formato no admitido. Usa PDF, PNG o JPG.';
  if (file.size > MAX_BYTES) return 'El archivo pesa demasiado (máximo 10 MB).';
  return null;
}

export async function subirDocumentoSocioArchivo(
  studioId: string, file: File,
): Promise<{ path: string } | { error: string }> {
  const invalido = validarDocumentoSocio(file);
  if (invalido) return { error: invalido };

  const extension = file.name.includes('.') ? file.name.split('.').pop() : null;
  const path = `${studioId}/${Date.now()}-${crypto.randomUUID()}${extension ? `.${extension}` : ''}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) return { error: error.message };

  return { path };
}
