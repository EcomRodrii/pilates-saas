'use client';

// TEMPORAL — maquetas: seleccionar varias, ventana flotante y calendario vacío. No se commitea.
import {
  CalendarPlus, Check, ChevronDown, ChevronLeft, ChevronRight, FileSpreadsheet, GripHorizontal,
  Maximize2, Minus, Plus, Sparkles, UserX, Users, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SEMANA, TIPOS } from './datos';
import { BotonC, Cabecera, Marco, Resumen, RESUMEN_SEMANA, Tarjeta } from './comun';
import { RejillaFranjas } from './semana';

// ─── Seleccionar varias: lo mismo que hoy (cambiar la instructora de golpe) ──
export function DisenoSeleccion() {
  const marcadas = new Set(['lun-1800', 'mar-1800', 'mie-1800']);
  return (
    <div className="relative">
      <Cabecera vista="Semana" fecha="1 – 7 oct" seleccionando />
      <Resumen texto="54 clases · 61 % de ocupación" items={RESUMEN_SEMANA} />
      <div className="mt-3"><RejillaFranjas seleccion={marcadas} /></div>
      <div className="absolute inset-x-0 bottom-4 flex justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-xl">
          <span className="flex size-7 items-center justify-center rounded-full bg-brand text-[13px] font-bold text-brand-foreground">3</span>
          <span className="text-[14px] font-medium text-foreground">clases marcadas</span>
          <span className="mx-1 h-6 w-px bg-border" />
          <span className="text-[13.5px] text-muted-foreground">Pasarlas a</span>
          <span className="flex min-h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-[13.5px] text-foreground"><Users size={14} className="text-muted-foreground" />Irene Sanz<ChevronDown size={14} className="text-muted-foreground" /></span>
          <BotonC primario>Cambiar las 3</BotonC>
          <span className="text-[13px] font-medium text-muted-foreground">Salir</span>
        </div>
      </div>
    </div>
  );
}

// ─── Ventana flotante: la agenda del día mientras usas otra pantalla ─────────
function FilaVentana({ hora, tipo, oc, estado, tono }: { hora: string; tipo: keyof typeof TIPOS; oc: string; estado?: string; tono?: 'ok' | 'aviso' | 'curso' | 'pasada' }) {
  return (
    <div className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1.5', tono === 'curso' && 'bg-success/8', tono === 'pasada' && 'opacity-60')}>
      <span className="h-8 w-1 rounded-full" style={{ background: TIPOS[tipo].color }} />
      <span className="w-11 text-[13px] font-semibold tabular-nums text-foreground">{hora}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-foreground">{TIPOS[tipo].nombre}</span>
        {estado && <span className={cn('block text-[11.5px]', tono === 'aviso' ? 'font-semibold text-warning' : tono === 'curso' ? 'font-semibold text-success' : 'text-muted-foreground')}>{estado}</span>}
      </span>
      <span className="text-[12.5px] font-semibold tabular-nums text-foreground">{oc}</span>
    </div>
  );
}

function Ventana({ ancha }: { ancha?: boolean }) {
  const filas = (
    <div className="space-y-0.5">
      <FilaVentana hora="09:00" tipo="mat" oc="6/12" estado="Falta pasar lista" tono="aviso" />
      <FilaVentana hora="09:15" tipo="reformer" oc="3/6" estado="Falta pasar lista" tono="aviso" />
      <FilaVentana hora="10:30" tipo="reformer" oc="6/6" estado="En curso · 4 de 6 han venido" tono="curso" />
      <FilaVentana hora="11:00" tipo="prenatal" oc="9/12" estado="En 20 min" />
      <FilaVentana hora="18:00" tipo="reformer" oc="5/6" />
      <FilaVentana hora="18:30" tipo="barre" oc="3/12" estado="Floja" tono="aviso" />
    </div>
  );
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-border bg-card shadow-2xl', ancha ? 'w-[760px]' : 'w-[320px]')}>
      <div className="flex items-center gap-1 border-b border-border px-2.5 py-2">
        <GripHorizontal size={15} className="text-muted-foreground" aria-label="Arrastra para moverla" />
        <ChevronLeft size={16} className="text-muted-foreground" />
        <span className="flex-1 text-center text-[13.5px] font-semibold text-foreground">{ancha ? 'Jue 1 – Sáb 3 oct' : 'Hoy · jueves 1'}</span>
        <ChevronRight size={16} className="text-muted-foreground" />
        <span className="ml-1 flex size-7 items-center justify-center rounded-md text-muted-foreground" title={ancha ? 'Ver solo hoy' : 'Agrandar: tres días'}><Maximize2 size={13} /></span>
        <span className="flex size-7 items-center justify-center rounded-md text-muted-foreground" title="Plegar"><Minus size={14} /></span>
        <span className="flex size-7 items-center justify-center rounded-md text-muted-foreground" title="Cerrar la ventana"><X size={14} /></span>
      </div>
      {ancha ? (
        <div className="grid grid-cols-3 divide-x divide-border">
          {SEMANA.slice(0, 3).map(d => (
            <div key={d.num} className="p-2">
              <p className="px-2 pb-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{d.corto} {d.num}{d.hoy && ' · hoy'}</p>
              {d.clases.slice(0, 6).map(c => (
                <FilaVentana key={c.id} hora={c.hora} tipo={c.tipo} oc={`${c.apuntadas}/${c.aforo}`} tono={c.pasada ? 'pasada' : c.marca?.tipo === 'en-curso' ? 'curso' : undefined} />
              ))}
            </div>
          ))}
        </div>
      ) : <div className="p-2">{filas}</div>}
      <p className="border-t border-border px-3 py-2 text-center text-[12.5px] font-medium text-foreground">Abrir el calendario</p>
    </div>
  );
}

export function DisenoVentana() {
  return (
    <div className="flex items-end gap-8">
      <div className="relative">
        <Marco ancho={1180} activo="Clientas" sinRelleno>
          <div className="space-y-3 opacity-50">
            <div className="h-9 w-56 rounded-lg bg-foreground/10" />
            {Array.from({ length: 9 }, (_, i) => <div key={i} className="h-14 rounded-xl border border-border bg-card" />)}
          </div>
        </Marco>
        <div className="absolute right-8 bottom-8"><Ventana /></div>
        <p className="absolute left-[280px] top-[70px] rounded-lg bg-foreground px-3 py-1.5 text-[12.5px] font-medium text-background">Estás en Clientas: la agenda de hoy sigue a mano</p>
      </div>
      <Ventana ancha />
    </div>
  );
}

// ─── El calendario vacío: el primer horario ──────────────────────────────────
export function DisenoVacio() {
  return (
    <div>
      <Cabecera vista="Semana" fecha="1 – 7 oct" />
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_340px] gap-4">
        <Tarjeta className="p-7">
          <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-brand/10 text-brand"><CalendarPlus size={22} /></span>
          <h2 className="text-[22px] font-semibold tracking-tight text-foreground">Tu horario todavía está vacío</h2>
          <p className="mt-1.5 max-w-[560px] text-[14px] text-muted-foreground text-pretty">Es lo último que te falta: en cuanto haya clases aquí, tus alumnas podrán reservarlas desde tu página.</p>
          <div className="mt-6 rounded-2xl border border-border p-5">
            <p className="flex items-center gap-2 text-[15px] font-semibold text-foreground"><Sparkles size={16} />Te lo montamos nosotros</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Contesta lo justo y te enseñamos el horario antes de crear nada.</p>
            <div className="mt-4 grid gap-4">
              <Pregunta titulo="¿Qué días abres?" opciones={['L', 'M', 'X', 'J', 'V', 'S', 'D']} activas={['L', 'M', 'X', 'J', 'V', 'S']} />
              <Pregunta titulo="¿Qué clases das?" opciones={['Reformer', 'Mat', 'Barre', 'Prenatal', 'Suelo pélvico']} activas={['Reformer', 'Mat']} />
              <Pregunta titulo="¿Quién da las clases?" opciones={['Las doy yo', 'Otra persona', 'Varias (las añado en Equipo)']} activas={['Las doy yo']} />
            </div>
            <div className="mt-5 flex gap-2"><BotonC primario grande>Ver mi horario propuesto</BotonC></div>
          </div>
        </Tarjeta>
        <div className="space-y-3">
          <Tarjeta className="p-5">
            <p className="flex items-center gap-2 text-[14.5px] font-semibold text-foreground"><FileSpreadsheet size={16} />Ya lo tengo en un Excel</p>
            <p className="mt-1 text-[13px] text-muted-foreground">O en otra plataforma: lo importamos con sus clases fijas.</p>
            <div className="mt-3"><BotonC>Importar horario</BotonC></div>
          </Tarjeta>
          <Tarjeta className="p-5">
            <p className="flex items-center gap-2 text-[14.5px] font-semibold text-foreground"><Plus size={16} />Una clase suelta</p>
            <p className="mt-1 text-[13px] text-muted-foreground">Para empezar con una y probar cómo reservan.</p>
            <div className="mt-3"><BotonC>Crear clase</BotonC></div>
          </Tarjeta>
          <Tarjeta className="p-5">
            <p className="text-[13px] font-semibold text-foreground">Lo que ya tienes</p>
            <ul className="mt-2 space-y-1.5 text-[13px]">
              <li className="flex items-center gap-2 text-foreground"><Check size={14} className="text-success" />2 salas</li>
              <li className="flex items-center gap-2 text-foreground"><Check size={14} className="text-success" />4 tipos de clase</li>
              <li className="flex items-center gap-2 text-foreground"><UserX size={14} className="text-warning" />Ninguna instructora: te preguntamos arriba quién da las clases</li>
            </ul>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}

function Pregunta({ titulo, opciones, activas }: { titulo: string; opciones: string[]; activas: string[] }) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-foreground">{titulo}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {opciones.map(o => (
          <span key={o} className={cn('min-h-9 rounded-lg border px-3 py-1.5 text-[13px] font-medium', activas.includes(o) ? 'border-brand bg-brand/10 text-brand' : 'border-border bg-card text-muted-foreground')}>{o}</span>
        ))}
      </div>
    </div>
  );
}

