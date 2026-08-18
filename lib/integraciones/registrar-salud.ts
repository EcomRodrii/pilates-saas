import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// Deja constancia de cómo fue la última conversación con un servicio externo.
//
// UNA escritura por tanda, no una por mensaje: el cron de recordatorios manda
// decenas de WhatsApps por ejecución, y guardar el resultado de cada uno sería
// convertir un aviso en carga de base de datos. Lo que importa para la pantalla
// es el ÚLTIMO resultado, así que el llamador acumula durante su bucle y llama
// aquí una vez al final.
//
// No crea la fila si no existe: si el estudio nunca configuró la integración,
// no hay nada de lo que informar y fabricar una fila vacía ensuciaría la
// pantalla con una integración que nadie pidió.
export async function registrarSaludIntegracion(
  admin: SupabaseClient,
  studioId: string,
  tipo: string,
  resultado: { ok: true } | { ok: false; error: string },
  ahoraISO: string = new Date().toISOString(),
): Promise<void> {
  const cambios = resultado.ok
    ? { ultimo_ok_en: ahoraISO }
    // El error anterior NO se borra al fallar: se sustituye por el nuevo, que
    // es el que la propietaria tiene delante.
    : { ultimo_error: resultado.error.slice(0, 500), ultimo_error_en: ahoraISO };

  // Sin `await` esto sería justo el patrón de escritura optimista que este repo
  // ya ha pagado varias veces; y un fallo al anotar la salud no puede tumbar el
  // envío que sí funcionó, así que se traga el error y se sigue.
  const { error } = await admin
    .from('integraciones').update(cambios)
    .eq('studio_id', studioId).eq('tipo', tipo);
  if (error) console.error('[integraciones] no se pudo anotar la salud', tipo, error.message);
}
