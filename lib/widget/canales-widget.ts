// Realtime para el bundle embebible (`public/widget.js`), sin cliente completo.
//
// ⚠️ NO se importa `lib/db/supabase` aquí. Ese `SupabaseClient` instancia
// Postgrest, Storage y Functions en su constructor aunque no se usen, y este
// bundle se sirve desde la web del propio estudio: es el mismo motivo por el
// que `supabasePortal` es solo `.auth`. Un `RealtimeClient` pelado cuesta
// +16,2 KB comprimidos (118,8 → 135,0 KB, medido con el build real), frente a
// los ~110 KB sin comprimir del cliente entero.
//
// La identidad la sigue poniendo `supabasePortal`: si la visitante ha entrado
// con su cuenta va con su token, y si no, con la clave anónima — que desde
// 20260907042134 basta para escuchar `aforo:{studioId}`.

import { RealtimeClient } from '@supabase/realtime-js';
import { supabasePortal } from '@/lib/db/supabase-portal';
import type { FuenteCanales } from '@/lib/realtime/aforo-en-vivo';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Perezoso: montarlo al importar abriría el socket en cuanto el estudio cargue
// la página, mire alguien el widget o no.
let rt: RealtimeClient | null = null;
function realtime(): RealtimeClient {
  rt ??= new RealtimeClient(`${url.replace(/^http/, 'ws')}/realtime/v1`, {
    params: { apikey: anon },
  });
  return rt;
}

export const canalesWidget: FuenteCanales = {
  realtime: { setAuth: (token) => realtime().setAuth(token) },
  channel: ((nombre: string, opts?: unknown) =>
    realtime().channel(nombre, opts as never)) as FuenteCanales['channel'],
  removeChannel: ((canal: unknown) =>
    realtime().removeChannel(canal as never)) as FuenteCanales['removeChannel'],
  auth: supabasePortal.auth,
};
