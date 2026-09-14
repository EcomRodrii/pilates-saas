// ─────────────────────────────────────────────────────────────────────────────
// Recordatorios de clase — barrido global cada 15 min (pg_cron
// `notif-recordatorios` → /api/cron/notif-recordatorios).
//
// Es el ÚNICO que llama a `enviarRecordatorioClase`: 24 h antes, aviso en su app
// + email + WhatsApp (si el estudio lo conectó); 1 h antes, solo el aviso en su
// app. La lógica vive en `recordatorio-clase.ts` (probada con `node --test`);
// aquí solo se enchufan las piezas que necesitan `@/`.
//
// ⚠️ Transición: `lib/inngest/recordatorios.ts` (email/WhatsApp diario a las
// 08:00 UTC) sigue registrado hasta retirarlo en su propio PR. No duplica nada
// porque reclama la misma fila de `recordatorio_envios` antes de mandar.
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-data';
import { publish } from '@/lib/notifications/engine';
import { enviarEmailTransaccional } from '@/lib/emails/send-server';
import { registrarSaludIntegracion } from '@/lib/integraciones/registrar-salud';
import { capturarMensaje } from '@/lib/sentry-cliente';
import { barrerRecordatoriosClase, type ResumenBarrido } from '@/lib/notificaciones/recordatorio-clase';

export async function recordatoriosClaseGlobal(): Promise<ResumenBarrido | { skipped: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { skipped: 'sin service-role' };
  const resumen = await barrerRecordatoriosClase(admin, {
    publicar: publish,
    enviarEmail: enviarEmailTransaccional,
    leerTodas: fetchAllRows,
    registrarSalud: registrarSaludIntegracion,
  });
  // Una lectura de adorno o de contacto que falla no tumba el barrido (el push
  // tiene que salir), pero tampoco puede quedar solo en un log.
  if (resumen.lecturasDegradadas.length) {
    capturarMensaje('[recordatorios] barrido con lecturas degradadas', 'warning', {
      tags: { area: 'recordatorios', tipo: 'lectura-degradada' },
      extra: { lecturas: resumen.lecturasDegradadas },
    });
  }
  if (resumen.whatsapp.fallidos > 0) {
    capturarMensaje('[recordatorios] fallo al enviar recordatorio por WhatsApp', 'warning', {
      tags: { area: 'recordatorios', tipo: 'whatsapp-fallido' },
      extra: { enviados: resumen.whatsapp.enviados, fallidos: resumen.whatsapp.fallidos },
    });
  }
  return resumen;
}
