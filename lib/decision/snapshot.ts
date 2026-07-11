// Adaptador de lectura (DECISION-OS-ARQUITECTURA.md §5): única frontera entre
// el núcleo puro y `fetchAllStudioData`. Recorta ventanas temporales aquí —
// el núcleo nunca sabe de dónde vinieron los datos ni cuánto abarcan.
// NO se importa desde ningún archivo de lib/decision cubierto por node --test:
// usa imports de valor (`@/lib/supabase-data`) que solo resuelven bajo el
// bundler de Next.js, nunca bajo el runner de tests bare-node.
import { fetchAllStudioData } from '@/lib/supabase-data';
import type { SnapshotEstudio } from './tipos.ts';

const MS_DIA = 86400000;

export async function construirSnapshot(studioId: string, now: Date): Promise<SnapshotEstudio> {
  const data = await fetchAllStudioData(studioId);

  const desde180 = now.getTime() - 180 * MS_DIA;
  const desde90 = now.getTime() - 90 * MS_DIA;
  const desdeSesiones = now.getTime() - 90 * MS_DIA;
  const hastaSesiones = now.getTime() + 90 * MS_DIA;

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
  };
}
