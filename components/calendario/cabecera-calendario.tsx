'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CheckSquare, ChevronDown, ChevronLeft, ChevronRight, DoorOpen, ListFilter, Plus, QrCode, Upload, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';

// La cabecera del Calendario, en dos filas (aprobada el 1-oct-2026):
//   1. La pantalla y sus herramientas: título, ayuda, ventana flotante y ampliar
//      junto al título; Buscar, Escanear QR, Importar horario, Seleccionar
//      varias y Crear clase a la derecha, CON SU NOMBRE (antes, por debajo de
//      1536 px solo quedaban iconos).
//   2. Qué estás mirando: ‹ Hoy ›, la fecha (que se toca para elegir otro día),
//      Día · Semana · Horario, y las salas y las instructoras.
// Nada de lo que había se ha quitado; solo el Mes, que pasó a ser la fecha.
//
// En el móvil, tres filas como en la maqueta aprobada (k8): título con «+»
// redondo; herramientas y «Filtrar»; la fecha y Día · Semana · Horario. ‹ Hoy ›
// no cabe ahí: la tira de días lleva al día, y la fecha trae «Hoy» y «Semana
// que viene». Antes eran seis filas y la lista empezaba a media pantalla.

export type VistaCalendario = 'dia' | 'semana' | 'horario';

const VISTAS: { id: VistaCalendario; texto: string; titulo: string }[] = [
  { id: 'dia', texto: 'Día', titulo: 'Un día, sala por sala, a su hora' },
  { id: 'semana', texto: 'Semana', titulo: 'La semana entera, por franjas' },
  { id: 'horario', texto: 'Horario', titulo: 'Las clases que se repiten: hasta cuándo van, quién viene fija y las clases fijas que ofreces' },
];

function Herramienta({ icono: Icono, texto, compacta, activa, href, onClick, titulo }: {
  icono: LucideIcon;
  texto: string;
  compacta: boolean;
  activa?: boolean;
  href?: string;
  onClick?: () => void;
  titulo?: string;
}) {
  const clase = cn(
    'inline-flex min-h-11 items-center gap-1.5 rounded-lg border text-[13px] font-medium transition-colors md:min-h-9',
    compacta ? 'w-11 justify-center md:w-9' : 'px-3',
    activa ? 'border-brand bg-brand text-brand-foreground' : 'border-border bg-card text-foreground hover:bg-muted',
  );
  const contenido = (
    <>
      <Icono size={15} aria-hidden className={activa ? '' : 'text-muted-foreground'} />
      {!compacta && texto}
    </>
  );
  if (href) {
    return <Link href={href} className={clase} title={titulo ?? texto} aria-label={texto}>{contenido}</Link>;
  }
  return (
    <button type="button" onClick={onClick} className={clase} title={titulo ?? texto} aria-label={texto} aria-pressed={activa}>
      {contenido}
    </button>
  );
}

export function FiltroCabecera({ icono: Icono, valor, onCambio, opciones, etiqueta }: {
  icono: LucideIcon;
  valor: string;
  onCambio: (v: string) => void;
  opciones: { valor: string; texto: string }[];
  etiqueta: string;
}) {
  const activo = valor !== opciones[0]?.valor;
  return (
    <label className={cn(
      'relative inline-flex min-h-11 min-w-0 items-center rounded-lg border bg-card text-[13px] text-foreground md:min-h-9',
      activo ? 'border-foreground/40 font-medium' : 'border-border',
    )}>
      <Icono size={14} className="pointer-events-none absolute left-2.5 text-muted-foreground" aria-hidden />
      <select
        aria-label={etiqueta}
        value={valor}
        onChange={e => onCambio(e.target.value)}
        className="min-h-11 w-full min-w-0 max-w-[13rem] cursor-pointer appearance-none truncate bg-transparent pl-8 pr-8 text-base focus:outline-none md:min-h-9 pointer-fine:text-[13px]"
      >
        {opciones.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 text-muted-foreground" aria-hidden />
    </label>
  );
}

export interface CabeceraCalendarioProps {
  vista: VistaCalendario;
  onVista: (v: VistaCalendario) => void;
  /** La instructora no tiene Horario. */
  conHorario: boolean;
  /** Herramientas solo con icono (no caben con su nombre). */
  compacta: boolean;
  /** El botón de la ventana flotante, junto al título (solo en un ordenador). */
  ventana?: ReactNode;
  buscador: ReactNode;
  hrefEscanear: string | null;
  hrefImportar: string | null;
  seleccion: { activa: boolean; onAlternar: () => void } | null;
  onCrear: (() => void) | null;
  /** ‹ Hoy › y la fecha; null en Horario, que no es un rango de fechas. */
  navegacion: {
    onAnterior: () => void;
    onSiguiente: () => void;
    onHoy: () => void;
    textoAnterior: string;
    textoSiguiente: string;
    fecha: ReactNode;
  } | null;
  salas: { id: string; nombre: string }[];
  instructoras: { id: string; nombre: string }[];
  filtroSala: string;
  filtroInstructora: string;
  onSala: (v: string) => void;
  onInstructora: (v: string) => void;
}

export function CabeceraCalendario(p: CabeceraCalendarioProps) {
  // En el móvil las salas y las instructoras van detrás de «Filtrar»: dos
  // desplegables recortados («Todas las sa…») se comían una fila entera.
  const [verFiltros, setVerFiltros] = useState(false);
  const hayFiltros = p.salas.length > 1 || p.instructoras.length > 1;
  const filtrando = p.filtroSala !== 'todas' || p.filtroInstructora !== '';
  return (
    <div className="relative space-y-2.5 escritorio-bajo:space-y-2">
      <PageHeader
        title="Calendario"
        badge={p.ventana}
        className="sm:items-center"
        actions={
          <>
            {p.buscador}
            {p.hrefEscanear && <Herramienta icono={QrCode} texto="Escanear QR" titulo="Escanear el QR de una clienta en la puerta" href={p.hrefEscanear} compacta={p.compacta} />}
            {p.hrefImportar && <Herramienta icono={Upload} texto="Importar horario" titulo="Traer tu horario de un Excel o de otra plataforma" href={p.hrefImportar} compacta={p.compacta} />}
            {p.seleccion && (
              <Herramienta
                icono={CheckSquare}
                texto={p.seleccion.activa ? 'Salir de selección' : 'Seleccionar varias'}
                titulo="Marcar varias clases para cambiarles la instructora de una vez"
                activa={p.seleccion.activa}
                onClick={p.seleccion.onAlternar}
                compacta={p.compacta && !p.seleccion.activa}
              />
            )}
            {hayFiltros && p.vista !== 'horario' && (
              <button
                type="button"
                onClick={() => setVerFiltros(v => !v)}
                aria-expanded={verFiltros}
                aria-label={filtrando ? 'Filtrar (hay un filtro puesto)' : 'Filtrar por sala o instructora'}
                className={cn(
                  'relative ml-auto flex size-11 items-center justify-center rounded-lg border bg-card text-muted-foreground md:hidden',
                  verFiltros || filtrando ? 'border-foreground/40 text-foreground' : 'border-border',
                )}
              >
                <ListFilter size={16} />
                {filtrando && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-brand-medio" aria-hidden />}
              </button>
            )}
            {p.onCrear && (
              // En el móvil, «+» redondo arriba a la derecha, a la altura del
              // título (la fila de herramientas queda libre); el nombre sigue ahí
              // para el lector de pantalla.
              <button
                type="button"
                onClick={p.onCrear}
                title="Crear clase"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13.5px] font-semibold text-brand-foreground transition-[filter] hover:brightness-95 max-md:absolute max-md:-top-1.5 max-md:right-0 max-md:size-11 max-md:justify-center max-md:rounded-full max-md:px-0 md:min-h-9"
              >
                <Plus size={16} aria-hidden className="max-md:size-5" /><span className="max-md:sr-only">Crear clase</span>
              </button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 md:gap-2.5">
        {p.navegacion && (
          <>
            <span className="inline-flex items-center rounded-lg border border-border bg-card max-md:hidden">
              <button type="button" onClick={p.navegacion.onAnterior} aria-label={p.navegacion.textoAnterior} title={p.navegacion.textoAnterior}
                className="flex size-11 items-center justify-center rounded-l-lg text-muted-foreground hover:bg-muted hover:text-foreground md:size-9">
                <ChevronLeft size={16} />
              </button>
              <button type="button" onClick={p.navegacion.onHoy}
                className="min-h-11 border-x border-border px-3 text-[13px] font-medium text-foreground hover:bg-muted md:min-h-9">
                Hoy
              </button>
              <button type="button" onClick={p.navegacion.onSiguiente} aria-label={p.navegacion.textoSiguiente} title={p.navegacion.textoSiguiente}
                className="flex size-11 items-center justify-center rounded-r-lg text-muted-foreground hover:bg-muted hover:text-foreground md:size-9">
                <ChevronRight size={16} />
              </button>
            </span>
            {p.navegacion.fecha}
          </>
        )}
        <span className="inline-flex items-center gap-0.5 rounded-xl bg-muted p-1 max-md:ml-auto" role="group" aria-label="Vista">
          {VISTAS.filter(v => v.id !== 'horario' || p.conHorario).map(v => (
            <button
              key={v.id}
              type="button"
              onClick={() => p.onVista(v.id)}
              aria-pressed={p.vista === v.id}
              title={v.titulo}
              className={cn(
                'min-h-11 min-w-11 rounded-lg px-2.5 text-[13px] font-medium transition-colors md:min-h-8 md:min-w-0 md:px-3.5',
                p.vista === v.id ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v.texto}
            </button>
          ))}
        </span>
        {p.vista !== 'horario' && (
          <span className={cn('min-w-0 items-center gap-2 max-md:w-full max-md:[&>label]:flex-1 md:ml-auto md:flex', verFiltros || filtrando ? 'flex' : 'hidden')}>
            {p.salas.length > 1 && (
              <FiltroCabecera
                icono={DoorOpen}
                etiqueta="Filtrar por sala"
                valor={p.filtroSala}
                onCambio={p.onSala}
                opciones={[{ valor: 'todas', texto: 'Todas las salas' }, ...p.salas.map(s => ({ valor: s.id, texto: s.nombre }))]}
              />
            )}
            {p.instructoras.length > 1 && (
              <FiltroCabecera
                icono={Users}
                etiqueta="Filtrar por instructora"
                valor={p.filtroInstructora}
                onCambio={p.onInstructora}
                opciones={[{ valor: '', texto: 'Todas las instructoras' }, ...p.instructoras.map(i => ({ valor: i.id, texto: i.nombre }))]}
              />
            )}
          </span>
        )}
      </div>
    </div>
  );
}
