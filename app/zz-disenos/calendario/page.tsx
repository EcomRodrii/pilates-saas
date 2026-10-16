'use client';

// TEMPORAL — página de maquetas del Calendario para capturas. No se commitea.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Marco, Nota, Tarjeta } from './comun';
import { DisenoSemana, RejillaFranjas } from './semana';
import { DisenoDia } from './dia';
import { DetalleSerie, DisenoHorario } from './horario';
import { MenuAlumna, MenuMas, PanelAnadir, PanelIA, PanelPasarLista, PanelPlazas, PanelSinCubrir, PanelSustituciones } from './panel';
import { DisenoMovil } from './movil';
import { DisenoSeleccion, DisenoVacio, DisenoVentana } from './extras';

const DECISIONES: [number, string, string][] = [
  [1, 'Tres vistas: Día, Semana y Horario', 'El Mes de hoy solo dice «N clases» y una barra: pasa a ser el selector de fecha, al tocar la fecha.'],
  [2, 'Un solo «Crear clase»', 'El formulario nuevo ya tiene «Se repite». Fuera la pregunta «¿Clase o clase fija?» y la ventana antigua, que deja crear series que chocan.'],
  [3, '«Buscar sustituta» pone en marcha el motor', 'Avisa por orden a quien mejor encaja y respeta tu modo (asistido o autónomo). «Ya sé quién» sigue: asigna y la avisa. Hoy asigna a mano y no avisa a nadie.'],
  [4, 'La semana por franjas', 'Una fila por hora con clase; los huecos y los días sin clases se pliegan, y dos salas a la vez se apilan. Cabe la semana entera sin desplazarse. Arrastrar a otro día mantiene la hora; la hora exacta se cambia en Día.'],
  [5, 'El panel, fijo al lado y sin tapar', 'En el día de hoy se abre solo con la clase en curso o la siguiente: el modo mostrador del iPad de recepción. Con ‹ › se pasa de una clase a otra sin cerrarlo.'],
];

function Leyenda() {
  return (
    <Tarjeta className="w-[1180px] p-6">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Lo que decides tú · cada número sale en las capturas</p>
      <ul className="mt-3 grid grid-cols-2 gap-x-8 gap-y-4">
        {DECISIONES.map(([n, t, d]) => (
          <li key={n} className="flex gap-3">
            <Nota n={n} />
            <div>
              <p className="text-[14.5px] font-semibold text-foreground">{t}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground text-pretty">{d}</p>
            </div>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

// «Te falta agregar estas cosas»: nada de lo que hay hoy desaparece.
const MAPA: [string, string][] = [
  ['ⓘ Ayuda · ventana flotante · ampliar a pantalla completa', 'Igual, junto al título.'],
  ['Buscar · Escanear QR · Importar horario · Seleccionar varias', 'Arriba a la derecha y con su nombre (hoy, sin texto por debajo de 1536 px). En el iPad, iconos con su nombre al pasar.'],
  ['Crear clase', 'Igual. Un solo formulario, el nuevo, con «Se repite» (2).'],
  ['Día · Semana · Mes · Horario', 'Día · Semana · Horario; el mes, al tocar la fecha (1).'],
  ['Todas las salas · Todas las instructoras', 'Igual, en la segunda fila.'],
  ['Tarjetas de cifras y franja roja «N necesitan una decisión»', 'Una línea de cifras que se tocan y resaltan sus clases; sin una segunda cuenta de lo que ya espera en tu bandeja.'],
  ['Arrastrar clases · crear tocando un hueco', 'Igual. En Semana, a otro día; la hora exacta, en Día (4).'],
  ['Panel: Editar · Duplicar · Serie · Buscar sustituta · Incidencia · Cancelar · Eliminar', 'Lo principal del momento, arriba; todo lo demás, en ⋯. Cancelar y eliminar, solo en clases que no se han dado.'],
  ['Pestañas Clientas · Plazas · Sustituciones', 'Igual: Alumnas · Plazas · Sustituciones.'],
  ['Añadir clienta (ClassPass, USC) · Escanear QR · Cortesía · Cobrar clase suelta', 'Igual en «Añadir alumna», y la clase suelta se cobra de verdad (efectivo, tarjeta o Bizum).'],
  ['Por alumna: Check-in · No vino · Repetir · Hacer fija · Quitar · Nota de voz', 'Check-in grande (44 px) y lo demás en su ⋯.'],
  ['Adaptaciones · Preparar clase con IA', 'Igual, plegado encima de la lista.'],
  ['Horario: Renovar · Plaza fija · Clases fijas con nombre · Peticiones', 'Igual, más el detalle de cada serie con cómo ha ido.'],
  ['Primer horario guiado · Importar desde Excel', 'Igual, en el calendario vacío.'],
];

function Mapa() {
  return (
    <Tarjeta className="w-[1180px] p-6">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Dónde queda cada cosa de hoy · no se quita nada</p>
      <div className="mt-3 divide-y divide-border">
        {MAPA.map(([hoy, nuevo]) => (
          <div key={hoy} className="grid grid-cols-[1fr_1fr] gap-6 py-2.5">
            <p className="text-[13.5px] font-medium text-foreground">{hoy}</p>
            <p className="text-[13.5px] text-muted-foreground text-pretty">{nuevo}</p>
          </div>
        ))}
      </div>
    </Tarjeta>
  );
}

function SelectorFecha() {
  const dias = Array.from({ length: 35 }, (_, i) => i - 2); // lunes 28 sep … domingo 1 nov
  const conClases = (d: number) => d >= 1 && d <= 31 && new Date(2026, 9, d).getDay() !== 0;
  return (
    <div className="w-[340px] rounded-xl border border-border bg-card p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold text-foreground">Octubre 2026</p>
        <span className="flex text-muted-foreground"><ChevronLeft size={18} /><ChevronRight size={18} /></span>
      </div>
      <div className="mt-3 grid grid-cols-7 text-center text-[11.5px] font-medium text-muted-foreground">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => <span key={d}>{d}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-1 text-center">
        {dias.map(d => {
          const fuera = d < 1 || d > 31;
          const num = d < 1 ? 30 + d : d > 31 ? d - 31 : d;
          const enSemana = d >= 1 && d <= 7;
          return (
            <span key={d} className={cn('mx-auto flex size-9 flex-col items-center justify-center rounded-lg text-[13.5px] tabular-nums',
              fuera ? 'text-muted-foreground/50' : 'text-foreground', enSemana && 'bg-brand/10', d === 1 && 'bg-brand font-semibold text-brand-foreground')}>
              {num}
              <span className={cn('mt-0.5 h-1 w-1 rounded-full', !fuera && conClases(d) ? (d === 1 ? 'bg-brand-foreground' : 'bg-foreground/40') : 'bg-transparent')} />
            </span>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2 border-t border-border pt-3 text-[12.5px] font-medium">
        <span className="rounded-lg border border-border px-2.5 py-1.5 text-foreground">Hoy</span>
        <span className="rounded-lg border border-border px-2.5 py-1.5 text-foreground">Semana que viene</span>
      </div>
    </div>
  );
}

export default function DisenosCalendario() {
  return (
    <div className="min-h-screen space-y-16 bg-background p-8">
      <div id="k0" className="w-fit"><Leyenda /></div>
      <div id="k0b" className="w-fit"><Mapa /></div>
      <div id="k1" className="w-fit"><Marco ancho={1440} activo="Calendario" sinRelleno><DisenoSemana /></Marco></div>
      <div id="k2" className="w-fit"><Marco ancho={1180} activo="Calendario" sinRelleno><DisenoDia /></Marco></div>
      <div id="k3" className="w-fit">
        <div className="flex items-start gap-8 rounded-3xl bg-foreground/[0.06] p-8">
          <PanelPasarLista />
          <PanelSinCubrir />
          <div className="space-y-6"><MenuMas /><MenuMas pasada /></div>
          <div className="space-y-6"><MenuAlumna /><SelectorFecha /></div>
        </div>
      </div>
      <div id="k3b" className="w-fit">
        <div className="flex items-start gap-8 rounded-3xl bg-foreground/[0.06] p-8">
          <PanelAnadir />
          <div className="space-y-6"><PanelPlazas /><PanelSustituciones /></div>
          <PanelIA />
          <DetalleSerie />
        </div>
      </div>
      <div id="k4" className="w-fit"><Marco ancho={1440} activo="Calendario" sinRelleno><DisenoHorario /></Marco></div>
      <div id="k5" className="w-fit"><Marco ancho={1440} activo="Calendario" sinRelleno><DisenoSeleccion /></Marco></div>
      <div id="k6" className="w-fit p-2"><DisenoVentana /></div>
      <div id="k7" className="w-fit"><Marco ancho={1440} activo="Calendario" sinRelleno><DisenoVacio /></Marco></div>
      <div id="k8" className="w-fit p-2"><DisenoMovil /></div>
      <div id="k9" className="w-fit">
        <div className="w-[820px] rounded-3xl bg-background p-5">
          <p className="mb-3 text-[13px] text-muted-foreground">iPad en vertical (820 px): la semana entera cabe sin desplazarse a los lados.</p>
          <RejillaFranjas compacta />
        </div>
      </div>
    </div>
  );
}
