// Mandar un mensaje a soporte desde el panel (Duda / Mejora / Problema).
//
// Vivía dentro de `components/layout/help-widget.tsx`; ahora lo usa el panel de
// ayuda y se queda aquí, sin React, para que la regla de abajo no dependa de una
// pantalla.
//
// ⚠️ Esto decía «¡Enviado!» PASARA LO QUE PASARA. El insert se tragaba su propio
// error y `fetch` no lanza con un 4xx/5xx —solo con la red caída—, así que nadie
// veía un 502 de Resend ni un 429 del rate-limit. Alguien escribiendo «no me
// funciona el cobro» se quedaba convencido de que le habíamos leído, y aquí no
// había llegado nada: es el peor sitio del panel para mentir, porque quien escribe
// ya está atascado.
//
// Ahora basta con que UNA de las dos vías llegue —el registro en BD y el correo
// son dos formas de enterarnos, no una cadena—. Solo si fallan las dos se dice que
// no, y quien llama conserva lo escrito.

import { dbInsertSoporteSolicitud } from '@/lib/supabase-data';
import { authHeader } from '@/lib/api-client';
import type { TipoSoporte } from '@/lib/types';

export interface MensajeSoporte {
  tipo: TipoSoporte;
  mensaje: string;
  contacto?: string | null;
}

export async function enviarMensajeSoporte(m: MensajeSoporte): Promise<{ ok: boolean }> {
  const texto = m.mensaje.trim();
  if (!texto) return { ok: false };
  const solicitud = {
    id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tipo: m.tipo,
    mensaje: texto,
    contacto: m.contacto?.trim() || null,
    creadoEn: new Date().toISOString(),
  };
  const guardado = await dbInsertSoporteSolicitud(solicitud);
  let correo = false;
  try {
    // Con la sesión: el servidor saca de ella quién escribe, el estudio y a dónde
    // contestar. Sin cabecera, 401.
    const r = await fetch('/api/soporte', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ tipo: solicitud.tipo, mensaje: solicitud.mensaje, contacto: solicitud.contacto }),
    });
    // `skipped: true` = Resend sin configurar. Eso NO es un envío: si además el
    // registro falló, no se ha enterado nadie.
    correo = r.ok && !(await r.json().catch(() => ({}))).skipped;
  } catch { /* red caída: queda el registro en BD, si entró */ }
  return { ok: guardado.ok || correo };
}
