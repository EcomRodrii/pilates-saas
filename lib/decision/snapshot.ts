// Adaptador de lectura (DECISION-OS-ARQUITECTURA.md §5): única frontera entre
// el núcleo puro y `fetchAllStudioData`. Recorta ventanas temporales aquí —
// el núcleo nunca sabe de dónde vinieron los datos ni cuánto abarcan.
// NO se importa desde ningún archivo de lib/decision cubierto por node --test:
// usa imports de valor (`@/lib/supabase-data`) que solo resuelven bajo el
// bundler de Next.js, nunca bajo el runner de tests bare-node.
import { fetchAllStudioData, fetchSustitucionesRecientes, contarSedesCadena, fetchInstructorTarifas, fetchIntentosFallidosRecientes, fetchBloqueosAgendaFuturos, fetchAbandonoCheckoutReciente } from '@/lib/supabase-data';
import type { SnapshotEstudio } from './tipos.ts';

const MS_DIA = 86400000;

export async function construirSnapshot(studioId: string, now: Date): Promise<SnapshotEstudio> {
  const data = await fetchAllStudioData(studioId);

  const desde180 = now.getTime() - 180 * MS_DIA;
  const desde90 = now.getTime() - 90 * MS_DIA;
  // Captación C3: 60d cubre la ventana reciente (14d) más la ventana base de
  // comparación (14-60d) — ver tasaAbandonoCheckout en senales.ts.
  const desde60 = now.getTime() - 60 * MS_DIA;
  const desdeSesiones = now.getTime() - 90 * MS_DIA;
  const hastaSesiones = now.getTime() + 90 * MS_DIA;

  const cadenaId = data.studio?.cadenaId ?? null;
  // Los bloqueos van por DÍA (columna `date`), no por instante: se acota con la
  // misma ventana futura que las sesiones para no traerse el histórico entero.
  const diaDe = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const [sustituciones, nSedesCadena, instructorTarifas, intentosFallidos, bloqueosAgenda, widgetEventosCheckout] = await Promise.all([
    fetchSustitucionesRecientes(studioId, new Date(desde90).toISOString()),
    cadenaId ? contarSedesCadena(cadenaId) : Promise.resolve(1),
    fetchInstructorTarifas(studioId),
    fetchIntentosFallidosRecientes(studioId, new Date(desde90).toISOString()),
    fetchBloqueosAgendaFuturos(studioId, diaDe(now.getTime()), diaDe(hastaSesiones)),
    fetchAbandonoCheckoutReciente(studioId, new Date(desde60).toISOString()),
  ]);
  const antiguedadDatosDias = data.studio?.creadoEn
    ? Math.max(0, Math.floor((now.getTime() - new Date(data.studio.creadoEn).getTime()) / MS_DIA))
    : 0;

  return {
    studioId,
    socios: data.socios,
    reservas: data.reservas.filter(r => new Date(r.creadoEn).getTime() >= desde180),
    sesiones: data.sesiones.filter(s => {
      const t = new Date(s.inicio).getTime();
      return t >= desdeSesiones && t <= hastaSesiones;
    }),
    salas: data.salas,
    // Un recibo entra si venció o se cobró dentro de la ventana — filtrar solo
    // por vencimiento excluiría deudas viejas cobradas recientemente, que
    // valorMensual() necesita para su fallback (Núcleo §1).
    recibos: data.recibos.filter(r => {
      const venc = new Date(r.fechaVencimiento).getTime();
      const cobro = r.fechaCobro ? new Date(r.fechaCobro).getTime() : null;
      return venc >= desde180 || (cobro !== null && cobro >= desde180);
    }),
    suscripciones: data.suscripciones,
    planesTarifa: data.planesTarifa,
    tiposClase: data.tiposClase,
    instructores: data.instructores,
    automationLogs: data.automationLogs.filter(l => new Date(l.ejecutadoEn).getTime() >= desde90),
    campanas: data.campanas,
    sustituciones,
    instructorTarifas,
    intentosFallidos,
    bloqueosAgenda,
    widgetEventosCheckout,
    contexto: {
      nSociasActivas: data.socios.filter(s => s.activo).length,
      antiguedadDatosDias,
      cadenaId,
      nSedesCadena,
    },
  };
}
