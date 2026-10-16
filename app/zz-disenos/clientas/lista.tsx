'use client';

// TEMPORAL — maqueta de la lista de Clientas. No se commitea.
import {
  ArrowUpDown, Bookmark, ChevronDown, ChevronRight, CreditCard, Download, MessageCircle, Plus, Search, SlidersHorizontal, Tag, Upload, UserPlus, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, Boton, ESTADOS, Nota, PastillaEstado, Senal, Tarjeta, type Estado } from './comun';
import { CLIENTAS, CONTEOS, type FilaClienta } from './datos';

export function CabeceraClientas({ pestana = 'clientas' }: { pestana?: 'clientas' | 'interesadas' }) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight text-foreground">Clientas</h1>
          <p className="text-[14px] text-muted-foreground">142 activas · 4 de prueba · 5 interesadas esperan respuesta</p>
        </div>
        <div className="flex gap-2">
          <Boton icono={Upload}>Importar</Boton>
          <Boton icono={UserPlus}>Apuntar interesada</Boton>
          <Boton icono={Plus} primario>Nueva clienta</Boton>
        </div>
      </div>
      <div className="mb-4 flex gap-1 border-b border-border" role="tablist">
        {([['clientas', 'Clientas', '246'], ['interesadas', 'Interesadas y pruebas', '9']] as const).map(([id, n, c]) => (
          <span key={id} role="tab" aria-selected={pestana === id} className={cn(
            '-mb-px flex items-center gap-2 border-b-2 px-3 pb-2.5 text-[14px] font-medium',
            pestana === id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground',
          )}>
            {n}<span className={cn('rounded-full px-1.5 text-[11.5px]', pestana === id ? 'bg-foreground text-background' : 'bg-muted text-foreground')}>{c}</span>
          </span>
        ))}
      </div>
    </>
  );
}

export function PorAtender() {
  const filas: [string, string, number, string, string, boolean?][] = [
    ['María García', 'MG', 1, 'Vino a su prueba el viernes y no ha comprado nada.', 'Escribir'],
    ['Carmen Del Río', 'CR', 0, 'Venía 2 veces por semana desde marzo. Lleva 3 semanas sin venir.', 'Escribir'],
    ['Elena Ruiz', 'ER', 3, 'Es nueva: 1 clase en sus primeros 9 días, y no tiene ninguna reservada.', 'Escribir'],
    ['Ana Torres', 'AT', 4, 'El recibo de octubre (59 €) no se ha podido cobrar: tarjeta rechazada.', 'Cobrar', true],
    ['Lucía Fernández', 'LF', 2, 'Se le acabó el bono hace 12 días y no ha comprado otro.', 'Escribir'],
  ];
  return (
    <Tarjeta className="mb-4 overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-foreground">Por atender hoy <span className="font-normal text-muted-foreground">· 5</span> <Nota n={3} /></h2>
          <p className="text-[12.5px] text-muted-foreground">Las que más se juegan, en el orden del Centro de Control. Cuando le escribes queda apuntado; si vuelve, sale sola de aquí.</p>
        </div>
        <span className="text-[12.5px] font-medium text-foreground underline underline-offset-2">Ver en Centro de Control</span>
      </div>
      <ul className="divide-y divide-border">
        {filas.map(([n, ini, tono, motivo, accion, dinero]) => (
          <li key={n} className="flex items-center gap-3 px-4 py-2.5">
            <Avatar ini={ini} tono={tono} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-foreground">{n}</p>
              <p className="text-[13px] text-muted-foreground text-pretty">{motivo}</p>
            </div>
            <Boton peque icono={dinero ? CreditCard : MessageCircle}>{accion}</Boton>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

export function FiltrosEstado({ activo = 'activa', definicion = true }: { activo?: Estado | 'todas'; definicion?: boolean }) {
  return (
    <div className="mb-3">
      <div className="flex flex-wrap gap-1.5">
        {CONTEOS.map(([e, c]) => (
          <span key={e} className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium',
            activo === e ? 'border-transparent bg-foreground text-background' : 'border-border bg-card text-foreground',
          )}>
            {e !== 'todas' && <span className={cn('size-2 rounded-full', ESTADOS[e].punto)} />}
            {e === 'todas' ? 'Todas' : ESTADOS[e].nombre}
            <span className={cn('tabular-nums', activo === e ? 'text-background/70' : 'text-muted-foreground')}>{c}</span>
          </span>
        ))}
      </div>
      {definicion && activo !== 'todas' && (
        <p className="mt-2 text-[12.5px] text-muted-foreground"><strong className="font-semibold text-foreground">{ESTADOS[activo].nombre}:</strong> {ESTADOS[activo].define} Es el mismo número que ves en Resumen y en Campañas.</p>
      )}
    </div>
  );
}

export function BarraBusqueda() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex h-10 min-w-[260px] flex-1 items-center gap-2 rounded-lg border border-input bg-card px-3 text-[13.5px] text-muted-foreground">
        <Search size={16} aria-hidden /> Buscar por nombre, email o teléfono
        <span className="ml-auto rounded border border-border px-1.5 text-[11px]">/</span>
      </div>
      <Boton icono={SlidersHorizontal}>Plan <ChevronDown size={14} /></Boton>
      <Boton icono={Tag}>Etiqueta <ChevronDown size={14} /></Boton>
      <Boton icono={Bookmark}>Mis vistas <ChevronDown size={14} /></Boton>
      <Boton icono={ArrowUpDown}>Última clase</Boton>
    </div>
  );
}

function Fila({ c, sel, i }: { c: FilaClienta; sel?: boolean; i: number }) {
  return (
    <tr className={cn('border-t border-border', sel && 'bg-accent')}>
      <td className="w-10 py-3 pl-4"><span className={cn('flex size-4 items-center justify-center rounded border text-[10px]', sel ? 'border-foreground bg-foreground text-background' : 'border-input')}>{sel && '✓'}</span></td>
      <td className="py-3 pr-3">
        <span className="flex items-center gap-3">
          <Avatar ini={c.ini} tono={i} />
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold text-foreground">{c.nombre}</span>
            <span className="block text-[12.5px] text-muted-foreground">{c.tel}</span>
          </span>
        </span>
      </td>
      <td className="py-3 pr-3"><PastillaEstado estado={c.estado} /><span className="mt-0.5 block text-[12px] text-muted-foreground">{c.desde}</span></td>
      <td className="py-3 pr-3"><span className="block text-[13.5px] text-foreground">{c.plan}</span>{c.saldo && <span className={cn('block text-[12.5px]', c.dinero ? 'text-destructive' : 'text-muted-foreground')}>{c.saldo}</span>}</td>
      <td className="py-3 pr-3 text-[13px] text-foreground">{c.ultima}{c.proxima && <span className="block text-[12.5px] text-muted-foreground">Próxima: {c.proxima}</span>}</td>
      <td className="py-3 pr-4">{c.senal && <Senal dinero={c.dinero}>{c.senal}</Senal>}</td>
    </tr>
  );
}

export function TablaClientas({ seleccion }: { seleccion?: boolean }) {
  return (
    <Tarjeta className="relative overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="py-2.5 pl-4"><span className="flex size-4 rounded border border-input" /></th>
            <th className="py-2.5">Clienta</th>
            <th className="py-2.5">Estado</th>
            <th className="py-2.5">Plan y saldo</th>
            <th className="py-2.5">Última clase</th>
            <th className="py-2.5">Aviso</th>
          </tr>
        </thead>
        <tbody>
          {CLIENTAS.map((c, i) => <Fila key={c.id} c={c} i={i} sel={seleccion && (i === 0 || i === 3)} />)}
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[12.5px] text-muted-foreground">
        <span>10 de 246 · al volver de una ficha sigues aquí, con tus filtros</span>
        <span className="flex items-center gap-1 text-foreground">Más <ChevronRight size={14} /></span>
      </div>
      {seleccion && (
        <div className="absolute inset-x-4 bottom-14 flex items-center gap-4 rounded-xl bg-sidebar px-4 py-2.5 text-[13px] text-sidebar-foreground shadow-lg">
          <strong className="font-semibold">2 seleccionadas</strong>
          <span className="h-4 w-px bg-sidebar-foreground/30" />
          <span className="flex items-center gap-1.5"><Tag size={14} />Etiqueta</span>
          <span className="flex items-center gap-1.5"><MessageCircle size={14} />Mensaje</span>
          <span className="flex items-center gap-1.5"><CreditCard size={14} />Cambiar plan</span>
          <span className="flex items-center gap-1.5"><Download size={14} />Exportar</span>
          <X size={16} className="ml-auto" />
        </div>
      )}
    </Tarjeta>
  );
}

export function DisenoLista() {
  return (
    <>
      <CabeceraClientas />
      <PorAtender />
      <FiltrosEstado activo="todas" definicion={false} />
      <BarraBusqueda />
      <TablaClientas seleccion />
    </>
  );
}
