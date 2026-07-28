import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { verificarSesionStaff } from '@/lib/auth-server';
import { puedeMoverDinero } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { fetchAllStudioData, dbUpdateAutomationRule } from '@/lib/supabase-data';
import { computeAutomationCandidatos } from '@/lib/engines/automation-engine';
import { procesarCandidato } from '@/lib/inngest/automatizaciones';
import { mapLimit } from '@/lib/concurrency';
import type { AutomationLog } from '@/lib/types';
import { errorInterno } from '@/lib/errores-servidor';

// Un estudio grande puede tener bastantes candidatos (email + redacción IA por
// cada uno); damos margen sobre el default de Vercel para que no corte a medias.
export const maxDuration = 60;

// R5 · "Ejecutar ahora" de /automatizaciones, AHORA en el servidor.
//
// Antes corría en el navegador (StudioContext.runAutomation): computaba los
// candidatos sobre los arrays EN MEMORIA del contexto —que pueden estar
// incompletos/capados (ver R3)— y enviaba los emails desde la pestaña. Eso
// significaba que el botón manual podía DIVERGIR del cron diario de Inngest
// (que usa fetchAllStudioData, datos completos): detectar de menos o de más.
//
// Ahora reutiliza EXACTAMENTE el núcleo del cron: fetchAllStudioData +
// computeAutomationCandidatos + procesarCandidato. Como procesarCandidato usa un
// id de log DETERMINISTA (estudio+regla+socia+día), si el cron ya corrió hoy el
// dbUpsert deduplica y Resend no reenvía (misma idempotency-key) → ejecutar a
// mano tras el cron es seguro. Solo el subconjunto de reglas (no las
// automatizaciones de marketing), igual que hacía el botón antes.
// Acepta `{ dry: true }` para una pasada en seco: calcula los mismos candidatos
// y devuelve los mismos logs, pero procesarCandidato no envía nada (ni email ni
// WhatsApp) y no persiste ningún log — el `if (!dry)` del final. Sirve para dos
// cosas: poder verificar un cambio del motor contra datos reales sin escribirle
// a nadie, y para que la UI pueda responder a "¿qué va a hacer si le doy?" antes
// de que la propietaria pulse un botón que manda mensajes en su nombre.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // Esta ruta corre con service-role, que SE SALTA la RLS: el rol hay que
  // mirarlo AQUÍ o no lo mira nadie. Y lo que ejecuta no es poca cosa —
  // manda emails y WhatsApps REALES a las clientas en nombre del estudio.
  // Sin esto, cualquiera con sesión de staff podía dispararlo desde la consola
  // del navegador, aunque el Centro de Control esté oculto en su menú.
  // Mismo criterio que /api/ingresos-manuales y las rutas de decisiones.
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json(
      { error: 'No tienes permiso para ejecutar automatizaciones.' },
      { status: 403 },
    );
  }

  const dry = await req
    .json()
    .then((b: unknown) => (b as { dry?: boolean } | null)?.dry === true)
    .catch(() => false); // sin body / body inválido → ejecución real, como antes

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const apiKey = process.env.RESEND_API_KEY;
  const resend = apiKey && !apiKey.startsWith('re_XXXX') ? new Resend(apiKey) : null;
  if (!resend) {
    return NextResponse.json({ error: 'Resend no configurado. Añade RESEND_API_KEY.' }, { status: 503 });
  }

  const nowISO = new Date().toISOString();

  try {
    const data = await fetchAllStudioData(sesion.studioId);
    const studioNombre = data.studio?.nombre ?? 'tu estudio';
    const studioColor = data.studio?.colorPrimario;
    const studioLogo = data.studio?.logoUrl;

    const candidatos = computeAutomationCandidatos(
      {
        automationRules: data.automationRules,
        automationLogs: data.automationLogs,
        socios: data.socios,
        reservas: data.reservas,
        recibos: data.recibos,
        sesiones: data.sesiones,
        tiposClase: data.tiposClase,
        suscripciones: data.suscripciones,
        planesTarifa: data.planesTarifa,
      },
      new Date(nowISO),
    );

    // Concurrencia acotada (como el botón anterior): procesarCandidato es
    // independiente por candidato, escribe su log (dbUpsert, id determinista) y
    // Resend deduplica por idempotency-key, así que paralelizar es seguro.
    const logs: AutomationLog[] = await mapLimit(
      candidatos,
      6,
      (c, i) => procesarCandidato(c, { studioId: sesion.studioId, studioNombre, studioColor, studioLogo, index: i, nowISO, dry, resend }),
    );

    // En seco no se toca el contador: no ha disparado nada.
    if (!dry) {
      // Contador de disparos por regla (determinista, como el cron).
      const firedPorRegla = new Map<string, number>();
      for (const c of candidatos) firedPorRegla.set(c.rule.id, (firedPorRegla.get(c.rule.id) ?? 0) + 1);
      for (const [ruleId, count] of firedPorRegla) {
        const base = data.automationRules.find((r) => r.id === ruleId)?.ejecutadaVeces ?? 0;
        await dbUpdateAutomationRule(ruleId, sesion.studioId, { ejecutadaVeces: base + count, ultimaEjecucion: nowISO });
      }
    }

    return NextResponse.json({ dry, logs });
  } catch (err) {
    return errorInterno('automatizaciones/run:POST', err, 'No se han podido ejecutar las automatizaciones. Inténtalo de nuevo.');
  }
}
