import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizarEmail } from './rebotes.ts';

// I-8 (auditoría 58ª pasada). Un buzón marcado como roto en `email_rebotes` NO
// se podía desmarcar nunca: la única salida automática es un evento
// `email.delivered`, y Resend no vuelve a intentar una dirección que YA
// suprimió — no hay entrega que lo dispare. Pasó de verdad con 9 socias
// reales de 2 estudios: alguien corregía el typo, o confirmaba con la propia
// clienta que su buzón funcionaba bien, y el aviso seguía diciendo "no le
// llega el correo" para siempre.
//
// La supresión vive en DOS sitios y hay que soltarla en los dos, en este
// orden: primero Resend (si falla, no se toca `email_rebotes` y el aviso
// se queda -correcto- diciendo que sigue rota); si Resend confirma, se borra
// la fila. Al revés (borrar primero) dejaría el panel diciendo "todo bien"
// mientras Resend seguía descartando el envío en silencio -exactamente el
// bug que esta tabla existe para no repetir.
export async function reactivarBuzon(admin: SupabaseClient, email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalizado = normalizarEmail(email);
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) {
    return { ok: false, error: 'Resend no está configurado' };
  }

  try {
    const res = await fetch(`https://api.resend.com/suppressions/${encodeURIComponent(normalizado)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    // 404: Resend ya no tenía esta dirección suprimida (p.ej. una QUEJA o un
    // REBOTE que solo dejó rastro aquí, nunca en su lista) -- no es un fallo,
    // es que no había nada que quitar allí. Se sigue igual: lo que de verdad
    // importa es que `email_rebotes` deje de avisar.
    if (!res.ok && res.status !== 404) {
      const texto = await res.text().catch(() => '');
      return { ok: false, error: `Resend: ${res.status} ${texto}`.trim() };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo contactar con Resend' };
  }

  const { error } = await admin.from('email_rebotes').delete().eq('email', normalizado);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
