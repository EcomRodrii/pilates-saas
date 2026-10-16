'use client';

// TEMPORAL — página de maquetas de Clientas para capturas. No se commitea
// (app/zz-disenos/ está en .git/info/exclude).
import { ESTADOS, Marco, Nota, PastillaEstado, Senal, Tarjeta, type Estado } from './comun';
import { DisenoLista } from './lista';
import { DisenoMaestro } from './maestro';
import { DisenoFicha, DisenoHistoria } from './ficha';
import { DisenoInteresadas } from './interesadas';
import { DialogoBaja, DialogoBorrar, DialogoCambiarPlan, DialogoContacto, DialogoInteresada } from './dialogos';
import { DisenoMovil } from './movil';

function Estados() {
  const orden: Estado[] = ['activa', 'prueba', 'sin-renovar', 'pausada', 'inactiva', 'baja', 'interesada'];
  const senales: [string, string, boolean?][] = [
    ['Viene menos', 'Su ritmo ha bajado claramente respecto al suyo de siempre.'],
    ['Reserva y no viene', 'Varias ausencias seguidas sin cancelar.'],
    ['Paga y no viene', 'Tiene cuota y lleva semanas sin usarla.'],
    ['No consigue reservar', 'Lo intenta y se encuentra las clases llenas.'],
    ['Prueba sin comprar', 'Vino a su prueba y no ha comprado nada.'],
    ['Arranque flojo', 'Es nueva y casi no ha venido en su primer mes.'],
    ['Recibo sin cobrar', 'Solo lo ven quienes pueden cobrar.', true],
  ];
  return (
    <div className="grid grid-cols-2 gap-6" style={{ width: 1180 }}>
      <Tarjeta className="p-5">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Estado · uno por clienta, sale solo de sus datos</p>
        <h2 className="mt-1 text-[18px] font-semibold text-foreground">En qué punto está cada clienta</h2>
        <p className="mb-4 flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground text-pretty">El mismo número en la lista, en Resumen, en Campañas y en el tope de tu plan. Nadie lo cambia a mano salvo «De baja». <Nota n={1} /><Nota n={2} /></p>
        <ul className="space-y-3">
          {orden.map(e => (
            <li key={e} className="flex gap-3">
              <span className="w-[118px] shrink-0"><PastillaEstado estado={e} /></span>
              <span className="text-[13px] text-foreground text-pretty">{ESTADOS[e].define}</span>
            </li>
          ))}
        </ul>
      </Tarjeta>
      <Tarjeta className="p-5">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Aviso · como mucho uno, lo pone el Centro de Control</p>
        <h2 className="mt-1 text-[18px] font-semibold text-foreground">Si hay algo que hacer con ella</h2>
        <p className="mb-4 text-[13px] text-muted-foreground text-pretty">El mismo aviso, con las mismas palabras, que en el Centro de Control. Sin puntuaciones de 0 a 100: siempre el motivo. Sustituye al «En riesgo» que hoy se pone a mano y nadie actualiza.</p>
        <ul className="space-y-3">
          {senales.map(([n, d, dinero]) => (
            <li key={n} className="flex gap-3">
              <span className="w-[158px] shrink-0"><Senal dinero={dinero}>{n}</Senal></span>
              <span className="text-[13px] text-foreground text-pretty">{d}</span>
            </li>
          ))}
        </ul>
      </Tarjeta>
    </div>
  );
}

export default function DisenosClientas() {
  return (
    <div className="min-h-screen space-y-16 bg-background p-8">
      <div id="c0" className="w-fit"><Estados /></div>
      <div id="c1" className="w-fit"><Marco ancho={1280}><DisenoLista /></Marco></div>
      <div id="c2" className="w-fit"><Marco ancho={1440}><DisenoMaestro /></Marco></div>
      <div id="c3" className="w-fit"><Marco ancho={1280}><DisenoFicha /></Marco></div>
      <div id="c4" className="w-fit"><Marco ancho={1280}><DisenoHistoria /></Marco></div>
      <div id="c5" className="w-fit"><Marco ancho={1280}><DisenoInteresadas /></Marco></div>
      <div id="c6" className="w-fit">
        <div className="grid grid-cols-[auto_auto_auto] items-start gap-6 rounded-3xl bg-foreground/35 p-8">
          <DialogoContacto />
          <div className="space-y-6"><DialogoBaja /><DialogoCambiarPlan /></div>
          <div className="space-y-6"><DialogoBorrar /><DialogoInteresada /></div>
        </div>
      </div>
      <div id="c7" className="w-fit p-2"><DisenoMovil /></div>
    </div>
  );
}
