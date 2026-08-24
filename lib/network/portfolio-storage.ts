import { supabase } from '@/lib/db/supabase';
import { validarFotoPerfil } from '@/lib/portal-storage';

// Portfolio de fotos (F1, red_perfil_media) — subida de la foto en sí.
//
// ⚠️ NO usa el bucket público `avatars` (a diferencia de
// subirFotoPerfilNetwork, la foto de perfil ÚNICA): su función de
// autorización (avatars_path_autorizado, migr
// 20260813111737_avatars_path_autorizado_network.sql) exige que el path
// para el prefijo `network-` sea EXACTAMENTE `network-<perfilId>` — una
// igualdad completa, no un prefijo — porque solo tenía que servir para UNA
// foto por perfil con `upsert: true`. Un portfolio de varias fotos con paths
// distintos por foto no encaja ahí sin ampliar esa RLS, y esta tarea es
// explícitamente sin migraciones nuevas (el esquema de F1 ya está aplicado).
// Verificado leyendo la función antes de asumir que el bucket servía.
//
// En su lugar se reutiliza el bucket PRIVADO `red-documentos-identidad`
// (migr 20260813222528) con el MISMO mecanismo que ya usa
// subirDocumentoIdentidad para las certificaciones
// (lib/network/documentos-identidad.ts): su policy de INSERT solo exige que
// el primer segmento del path sea el propio `auth.uid()` — no le importa qué
// prefijo va después de la carpeta, así que "portfolio-<timestamp>" encaja
// igual que "certificacion-<...>".
//
// Al ser un bucket privado (sin policy de SELECT para authenticated/anon), la
// foto NUNCA se sirve por URL pública: toda lectura pasa por una URL firmada
// generada con service_role — ver GET /api/network/portfolio (vista propia)
// y lib/network/publico.ts (perfil público). El campo `path` es lo único que
// se guarda en `red_perfil_media`, nunca una URL.
const BUCKET = 'red-documentos-identidad';

export async function subirFotoPortfolioNetwork(
  authUserId: string, file: File,
): Promise<{ path: string } | { error: string }> {
  const invalido = validarFotoPerfil(file);
  if (invalido) return { error: invalido };

  const extension = file.name.includes('.') ? file.name.split('.').pop() : null;
  const path = `${authUserId}/portfolio-${Date.now()}${extension ? `.${extension}` : ''}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) return { error: error.message };

  return { path };
}
