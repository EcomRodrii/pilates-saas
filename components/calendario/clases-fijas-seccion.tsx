'use client';

// «Clases fijas» dentro de la vista «Horario»: el estudio arma una oferta con nombre
// —«Reformer · martes y jueves»— a partir de clases que YA se repiten, y sus clientas
// la piden desde la app eligiendo cuánto tiempo. Aprobar las peticiones se hace en
// la bandeja de Inicio (las de plaza fija de siempre); aquí solo se crea y se cuida
// la oferta: qué incluye, cuánto tiempo se ofrece, cuántas plazas hay y si sigue
// abierta.
//
// Las franjas se eligen entre las tarjetas del propio Horario (una tarjeta = una
// serie en un día), nunca tecleando día y hora: así la oferta sigue sola a «editar
// esta y las siguientes» y a la renovación de la serie.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { crearClaseFija, editarClaseFija, pedirClasesFijas, type DatosClaseFija } from '@/lib/clases-fijas-cliente';
import {
  DURACIONES_MESES, DURACIONES_POR_DEFECTO, MAX_DESCRIPCION, MAX_FRANJAS, MAX_NOMBRE, etiquetaDuracion, textoFranja,
  type OfertaStaff,
} from '@/lib/clases-fijas-reglas';
import { fechaDMY } from '@/lib/series-renovacion';
import type { HorarioFijo, TarjetaHorario } from '@/lib/horario-fijo';

export interface ClasesFijasSeccionProps {
  horario: HorarioFijo;
  nombreTipo: (id: string) => string | undefined;
  nombreSala: (id: string) => string | undefined;
  puedeGestionar: boolean;
}

const claveDe = (serieId: string, diaSemana: number) => `${serieId}|${diaSemana}`;

const ETIQUETA_ESTADO: Record<OfertaStaff['estado'], string> = {
  DISPONIBLE: 'Abierta',
  COMPLETA: 'Completa',
  SIN_CLASES: 'Sin clases programadas',
  CERRADA: 'Cerrada',
};

export function ClasesFijasSeccion(p: ClasesFijasSeccionProps) {
  const [ofertas, setOfertas] = useState<OfertaStaff[] | null>(null);
  const [error, setError] = useState(false);
  const [dialogo, setDialogo] = useState<{ oferta: OfertaStaff | null } | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const tarjetas = useMemo(() => p.horario.dias.flatMap(d => d.tarjetas), [p.horario]);

  const cargar = useCallback(async () => {
    const r = await pedirClasesFijas();
    setError(r === null);
    if (r) setOfertas(r);
  }, []);

  useEffect(() => {
    let vivo = true;
    void pedirClasesFijas().then(r => { if (!vivo) return; setError(r === null); if (r) setOfertas(r); });
    return () => { vivo = false; };
  }, []);

  const tarjetaDe = (serieId: string, dia: number) => tarjetas.find(t => t.serieId === serieId && t.diaSemana === dia);
  const nombreFranja = (serieId: string, dia: number) => {
    const t = tarjetaDe(serieId, dia);
    return t ? `${textoFranja(dia, t.hora)} · ${p.nombreTipo(t.tipoClaseId) ?? 'Clase'}` : 'Clase que ya no está en el horario';
  };

  async function cambiarActiva(o: OfertaStaff) {
    if (cambiando) return;
    setCambiando(o.id);
    setAviso(null);
    const r = await editarClaseFija(o.id, { activa: !o.activa });
    setCambiando(null);
    if (!r.ok) { setAviso(r.error); return; }
    await cargar();
  }

  // Sin ninguna clase que se repita no hay con qué armarla: el resto de la vista ya lo explica.
  if (tarjetas.length === 0 && (ofertas?.length ?? 0) === 0) return null;
  if (!p.puedeGestionar && (ofertas?.length ?? 0) === 0) return null;

  return (
    <section aria-label="Clases fijas" data-testid="clases-fijas-seccion" className="mb-5 rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <Layers size={15} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">Clases fijas</h3>
          <p className="text-xs text-muted-foreground text-pretty">
            Ofrece a tus clientas una clase fija con nombre: eligen cuánto tiempo la quieren y tú apruebas cada petición.
            Solo la piden quienes tienen una cuota activa que incluya esas clases.
          </p>
        </div>
        {p.puedeGestionar && tarjetas.length > 0 && (
          <Button size="sm" onClick={() => setDialogo({ oferta: null })}>
            <Plus size={13} className="mr-1" aria-hidden />Crear clase fija
          </Button>
        )}
      </div>

      {error && ofertas === null && (
        <p role="alert" className="mt-3 text-xs text-muted-foreground">
          No se han podido cargar las clases fijas.{' '}
          <button type="button" className="font-medium underline underline-offset-2" onClick={() => void cargar()}>Reintentar</button>
        </p>
      )}
      {aviso && <p role="alert" className="mt-2 text-xs text-destructive">{aviso}</p>}

      {ofertas && ofertas.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground" data-testid="clases-fijas-vacio">
          Todavía no has creado ninguna. Por ejemplo: «Reformer · martes y jueves», que incluye tus dos clases de reformer de esos días.
        </p>
      )}

      {ofertas && ofertas.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {ofertas.map(o => (
            <li key={o.id} data-testid="clase-fija" aria-label={o.nombre}
              className={cn('rounded-lg border border-border bg-background p-2.5', !o.activa && 'opacity-70')}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm font-semibold text-foreground">{o.nombre}</p>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium',
                  o.estado === 'DISPONIBLE' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                  {ETIQUETA_ESTADO[o.estado]}
                </span>
                {o.pendientes > 0 && (
                  <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
                    {o.pendientes === 1 ? '1 petición por decidir' : `${o.pendientes} peticiones por decidir`}
                  </span>
                )}
              </div>
              {o.descripcion && <p className="mt-0.5 text-xs text-muted-foreground text-pretty">{o.descripcion}</p>}
              <ul className="mt-1.5 flex flex-col gap-0.5">
                {o.franjas.map(f => (
                  <li key={claveDe(f.serieId, f.diaSemana)} className={cn('text-xs', f.resuelta ? 'text-foreground' : 'text-warning')}>
                    {nombreFranja(f.serieId, f.diaSemana)}{f.resuelta ? '' : ' — ya no tiene clases programadas'}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {o.plazasLibres !== null && `${Math.max(0, o.plazasLibres)} ${Math.max(0, o.plazasLibres) === 1 ? 'plaza libre' : 'plazas libres'} · `}
                se ofrece {o.duracionesMeses.map(etiquetaDuracion).join(', ')}
                {o.programadaHasta ? ` · hay clases hasta el ${fechaDMY(o.programadaHasta)}` : ''}
              </p>
              {p.puedeGestionar && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setDialogo({ oferta: o })} aria-label={`Editar ${o.nombre}`}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-foreground hover:bg-muted transition-colors">
                    Editar
                  </button>
                  <button type="button" disabled={cambiando === o.id} onClick={() => void cambiarActiva(o)}
                    aria-label={`${o.activa ? 'Cerrar' : 'Reabrir'} ${o.nombre}`}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-60">
                    {o.activa ? 'Cerrar' : 'Reabrir'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {ofertas && ofertas.some(o => o.activa) && (
        <p className="mt-2 text-[11px] text-muted-foreground text-pretty">
          Cerrar una clase fija la deja de ofrecer: las plazas que ya diste no se tocan.
        </p>
      )}

      {dialogo && (
        <DialogoClaseFija
          oferta={dialogo.oferta}
          tarjetas={tarjetas}
          nombreTipo={p.nombreTipo}
          nombreSala={p.nombreSala}
          onClose={() => setDialogo(null)}
          onGuardada={async () => { setDialogo(null); await cargar(); }}
        />
      )}
    </section>
  );
}

function DialogoClaseFija({ oferta, tarjetas, nombreTipo, nombreSala, onClose, onGuardada }: {
  oferta: OfertaStaff | null;
  tarjetas: TarjetaHorario[];
  nombreTipo: (id: string) => string | undefined;
  nombreSala: (id: string) => string | undefined;
  onClose: () => void;
  onGuardada: () => void | Promise<void>;
}) {
  const [nombre, setNombre] = useState(oferta?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(oferta?.descripcion ?? '');
  const [duraciones, setDuraciones] = useState<number[]>(oferta?.duracionesMeses ?? DURACIONES_POR_DEFECTO);
  const [plazas, setPlazas] = useState(oferta?.plazas != null ? String(oferta.plazas) : '');
  const [elegidas, setElegidas] = useState<Set<string>>(
    () => new Set((oferta?.franjas ?? []).map(f => claveDe(f.serieId, f.diaSemana))),
  );
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const alternar = <T,>(lista: Set<T>, v: T) => { const n = new Set(lista); if (n.has(v)) n.delete(v); else n.add(v); return n; };
  const numPlazas = plazas.trim() === '' ? null : Number(plazas);
  const plazasValidas = numPlazas === null || (Number.isInteger(numPlazas) && numPlazas >= 1 && numPlazas <= 200);
  const puedeGuardar = nombre.trim().length > 0 && elegidas.size >= 1 && elegidas.size <= MAX_FRANJAS
    && duraciones.length >= 1 && plazasValidas && !guardando;

  async function guardar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError(null);
    const datos: DatosClaseFija = {
      nombre: nombre.trim(), descripcion: descripcion.trim(), duracionesMeses: [...duraciones].sort((a, b) => a - b),
      plazas: numPlazas,
      franjas: [...elegidas].map(k => { const [serieId, dia] = k.split('|'); return { serieId, diaSemana: Number(dia) }; }),
    };
    const r = oferta ? await editarClaseFija(oferta.id, datos) : await crearClaseFija(datos);
    setGuardando(false);
    if (!r.ok) { setError(r.error); return; }
    await onGuardada();
  }

  // Las tarjetas del Horario, más las franjas ya guardadas que hoy no tienen clase (para poder quitarlas).
  const huerfanas = (oferta?.franjas ?? []).filter(f => !tarjetas.some(t => t.serieId === f.serieId && t.diaSemana === f.diaSemana));

  return (
    <Dialog open onOpenChange={abierto => { if (!abierto && !guardando) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{oferta ? 'Editar clase fija' : 'Crear clase fija'}</DialogTitle>
        </DialogHeader>

        <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
          Nombre
          <input value={nombre} onChange={e => setNombre(e.target.value)} maxLength={MAX_NOMBRE} placeholder="Reformer · martes y jueves"
            className="h-9 rounded-lg border border-border bg-background px-3 text-[13px] font-normal placeholder:text-muted-foreground" />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
          Descripción <span className="font-normal text-muted-foreground">(opcional, la ven tus clientas)</span>
          <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} maxLength={MAX_DESCRIPCION} rows={2}
            placeholder="Dos días a la semana con Marta, para trabajar fuerza y control."
            className="rounded-lg border border-border bg-background px-3 py-2 text-[13px] font-normal placeholder:text-muted-foreground" />
        </label>

        <fieldset className="flex flex-col gap-1">
          <legend className="text-xs font-medium text-foreground">Clases que incluye</legend>
          <p className="text-[11px] text-muted-foreground">Elige entre las clases que ya se repiten. Recibirá una plaza fija en cada una.</p>
          <ul className="mt-1 flex max-h-56 flex-col gap-1 overflow-y-auto">
            {tarjetas.map(t => {
              const k = claveDe(t.serieId, t.diaSemana);
              return (
                <li key={k}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted">
                    <input type="checkbox" checked={elegidas.has(k)} onChange={() => setElegidas(alternar(elegidas, k))} />
                    <span className="tabular-nums font-medium">{textoFranja(t.diaSemana, t.hora)}</span>
                    <span className="truncate">{nombreTipo(t.tipoClaseId) ?? 'Clase'} · {nombreSala(t.salaId) ?? 'Sala'}</span>
                  </label>
                </li>
              );
            })}
            {huerfanas.map(f => {
              const k = claveDe(f.serieId, f.diaSemana);
              return (
                <li key={k}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-warning/40 px-2.5 py-1.5 text-xs">
                    <input type="checkbox" checked={elegidas.has(k)} onChange={() => setElegidas(alternar(elegidas, k))} />
                    <span className="text-warning">Una clase que ya no está en el horario (quítala)</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <fieldset className="flex flex-col gap-1">
          <legend className="text-xs font-medium text-foreground">Cuánto tiempo puede pedirla</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {DURACIONES_MESES.map(m => {
              const on = duraciones.includes(m);
              return (
                <button key={m} type="button" aria-pressed={on}
                  onClick={() => setDuraciones(on ? duraciones.filter(x => x !== m) : [...duraciones, m])}
                  className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground hover:bg-muted')}>
                  {etiquetaDuracion(m)}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">Elige hasta 6. Ella verá hasta qué fecha llega cada una.</p>
        </fieldset>

        <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
          Tope de clientas por clase <span className="font-normal text-muted-foreground">(vacío = el aforo de cada clase)</span>
          <input value={plazas} onChange={e => setPlazas(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" placeholder="Aforo de la clase"
            className="h-9 w-40 rounded-lg border border-border bg-background px-3 text-[13px] font-normal placeholder:text-muted-foreground" />
        </label>

        {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={guardando} onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={!puedeGuardar} onClick={() => void guardar()}>
            {guardando ? 'Guardando…' : oferta ? 'Guardar cambios' : 'Crear clase fija'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
