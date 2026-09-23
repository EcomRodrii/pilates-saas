'use client';

// F2 (B2.2) — Plaza fija: sección de la ficha de la clienta con sus clases fijas.
//
// Asignar o cambiar se hace eligiendo una CLASE del horario en el mismo diálogo
// que usa «Hacer fija» del calendario (`DialogoPlazaFija`). Antes aquí se
// tecleaban día y hora, que tenían que coincidir al minuto con una clase.
//
// Pausar unas fechas (vacaciones, una lesión…) no la quita ni le cambia el
// estado: sigue activa con su sitio y el motor se salta esas semanas
// (`DialogoPausaPlazaFija`, lib/plazas-fijas-pausa.ts).
//
// La plaza se ancla por (día, hora, sala): cuando el estudio mueve la clase se
// queda apuntando a un horario sin clase y el motor no reserva nada. Por eso la
// fila avisa cuando no hay ninguna clase en su horario (mismo criterio que la
// bandeja «Para hoy», lib/plazas-fijas-slot.ts).

import { useEffect, useMemo, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Plus, Trash2, Pencil, CalendarClock, Pause } from 'lucide-react';
import { IconoAviso } from '@/lib/iconos';
import { plazasFijasSinSesion } from '@/lib/plazas-fijas-slot';
import { estadoPausa } from '@/lib/plazas-fijas-pausa';
import { fechaLimiteDecidirVuelta } from '@/lib/plazas-fijas-solicitudes';
import { cuotaParaPlazaFija } from '@/lib/plazas-fijas-reglas';
import { hoyEnEstudio } from '@/lib/utils';
import { DialogoPlazaFija, textoPlazaGuardada } from '@/components/plazas-fijas/dialogo-plaza-fija';
import { DialogoPausaPlazaFija } from '@/components/plazas-fijas/dialogo-pausa-plaza-fija';
import type { PlazaFija } from '@/lib/types';

// Lunes primero (UX); los valores son los de extract(dow) de Postgres (0=domingo).
const DIAS: { v: number; l: string }[] = [
  { v: 1, l: 'Lunes' }, { v: 2, l: 'Martes' }, { v: 3, l: 'Miércoles' },
  { v: 4, l: 'Jueves' }, { v: 5, l: 'Viernes' }, { v: 6, l: 'Sábado' }, { v: 0, l: 'Domingo' },
];
const diaLabel = (v: number) => DIAS.find(d => d.v === v)?.l ?? '—';

function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const AVISO_SIN_CLASE = 'No hay ninguna clase programada ese día a esa hora en esa sala en las próximas semanas. Si la clase se movió, cámbiala a la clase nueva.';

// Lo que ha pasado de verdad al quitar la plaza, con las cifras del servidor.
function textoPlazaQuitada(canceladas: number, mantenidas: number, fallidas: number): string {
  const partes = ['Plaza fija quitada'];
  if (canceladas > 0) partes.push(canceladas === 1 ? '1 clase cancelada' : `${canceladas} clases canceladas`);
  if (mantenidas > 0) {
    partes.push(mantenidas === 1
      ? '1 se mantiene por estar dentro del plazo de cancelación'
      : `${mantenidas} se mantienen por estar dentro del plazo de cancelación`);
  }
  if (fallidas > 0) {
    partes.push(fallidas === 1
      ? '1 no se pudo cancelar: revísala en el calendario'
      : `${fallidas} no se pudieron cancelar: revísalas en el calendario`);
  }
  return partes.join(' · ');
}

export function FichaPlazaFija({ socioId, onToast }: { socioId: string; onToast: (mensaje: string) => void }) {
  const { plazasFijas, quitarPlazaFija, salas, tiposClase, spots, sesiones, suscripciones, planesTarifa } = useStudio();
  // null = cerrado; { plaza: null } = asignando una nueva; { plaza } = cambiando esa.
  const [dialogo, setDialogo] = useState<{ plaza: PlazaFija | null } | null>(null);
  const [aPausar, setAPausar] = useState<PlazaFija | null>(null);
  const [aBorrar, setABorrar] = useState<PlazaFija | null>(null);

  // La hora entra por estado (no `Date.now()` dentro de un memo) — mismo patrón
  // y mismo motivo que bandeja-hoy.tsx: la lógica pura la recibe inyectada.
  const [ahoraMs, setAhoraMs] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reloj: sincroniza con el paso del TIEMPO, un sistema externo.
    setAhoraMs(Date.now());
  }, []);
  const hoy = ahoraMs ? hoyEnEstudio(new Date(ahoraMs)) : null;

  const mias = useMemo(
    () => plazasFijas
      .filter(p => p.socioId === socioId && p.estado !== 'BAJA')
      .sort((a, b) => ((a.diaSemana + 6) % 7) - ((b.diaSemana + 6) % 7) || a.horaInicio.localeCompare(b.horaInicio)),
    [plazasFijas, socioId],
  );

  // Plazas de esta clienta que apuntan a un horario donde ya no hay clase.
  const huerfanas = useMemo(
    () => new Set(ahoraMs ? plazasFijasSinSesion(mias, sesiones, ahoraMs).map(p => p.id) : []),
    [mias, sesiones, ahoraMs],
  );

  return (
    <div className="border border-border rounded-xl p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <CalendarClock size={15} className="shrink-0 text-muted-foreground" aria-hidden />
            Plaza fija
          </p>
          <p className="text-xs text-muted-foreground">Viene siempre a la misma clase: se le reserva sola cada semana, sin que tengas que apuntarla clase a clase.</p>
        </div>
        <button
          onClick={() => setDialogo({ plaza: null })}
          aria-label="Añadir plaza fija"
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-primary-foreground bg-primary hover:brightness-95 transition-colors shrink-0"
        >
          <Plus size={14} /> Añadir
        </button>
      </div>

      {mias.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Aún no tiene plaza fija. Elige la clase a la que viene cada semana.</p>
      ) : (
        <div className="space-y-2">
          {mias.map(p => {
            const sala = salas.find(s => s.id === p.salaId);
            const spot = p.spotId ? spots.find(s => s.id === p.spotId) : null;
            const tipo = p.tipoClaseId ? tiposClase.find(t => t.id === p.tipoClaseId) : null;
            const sinClase = huerfanas.has(p.id);
            const hora = p.horaInicio.slice(0, 5);
            const pausa = hoy ? estadoPausa(p, hoy) : 'sin_pausa';
            // Una pausa que soltó su sitio sigue PAUSADA hasta que se decide su vuelta,
            // también cuando sus fechas ya acabaron.
            const conSitioLibre = p.estado === 'PAUSADA' && p.pausaLiberaSitio === true;
            const vueltaPorDecidir = conSitioLibre && pausa === 'sin_pausa';
            // Mismo corte que el servidor: solo suelta el sitio si dura más de una semana.
            const soltaraSitio = p.pausaLiberaSitio === true && !!p.pausaDesde && !!p.pausaHasta
              && p.pausaHasta > fechaLimiteDecidirVuelta(p.pausaDesde);
            // Sin una cuota que incluya la clase, el motor no le reserva nada: la
            // plaza sigue ahí, pero en silencio. Visto en producción con una
            // clienta de bono agotado y plaza fija, sin ningún aviso.
            const sinCuota = hoy !== null && p.estado === 'ACTIVA'
              && !cuotaParaPlazaFija(socioId, suscripciones, planesTarifa, hoy, p.tipoClaseId);
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <CalendarClock size={14} className="text-muted-foreground shrink-0" />
                    {diaLabel(p.diaSemana)} · {hora}
                    {p.estado === 'PAUSADA' && !conSitioLibre && <span className="text-[11px] font-medium text-muted-foreground">· en pausa</span>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {sala?.nombre ?? 'Sala'}{spot ? ` · ${spot.nombre}` : ''}{tipo ? ` · ${tipo.nombre}` : ''}
                    {' · desde '}{fechaCorta(p.vigenciaDesde)}{p.vigenciaHasta ? ` hasta ${fechaCorta(p.vigenciaHasta)}` : ''}
                  </p>
                  {pausa !== 'sin_pausa' && (
                    <p className="text-[11px] font-semibold text-foreground mt-1 flex items-center gap-1">
                      <Pause size={11} className="shrink-0 text-muted-foreground" aria-hidden />
                      {pausa === 'en_curso'
                        ? `En pausa hasta el ${fechaCorta(p.pausaHasta)}${conSitioLibre ? ' · su sitio está libre' : ''}`
                        : `Pausa programada del ${fechaCorta(p.pausaDesde)} al ${fechaCorta(p.pausaHasta)}${soltaraSitio ? ' · su sitio quedará libre' : ''}`}
                    </p>
                  )}
                  {vueltaPorDecidir && (
                    <p role="status" className="text-[11px] font-medium text-warning mt-1 flex items-center gap-1">
                      <IconoAviso size={12} className="shrink-0" aria-hidden />
                      Su pausa acabó el {fechaCorta(p.pausaHasta)} y su sitio está libre: decide su vuelta en Resumen
                    </p>
                  )}
                  {sinClase && (
                    <p role="status" title={AVISO_SIN_CLASE} className="text-[11px] font-medium text-warning mt-1 flex items-center gap-1">
                      <IconoAviso size={12} className="shrink-0" aria-hidden />
                      Sin clase en este horario — cámbiala a la clase nueva
                    </p>
                  )}
                  {sinCuota && (
                    <p role="status" className="text-[11px] font-medium text-warning mt-1 flex items-center gap-1">
                      <IconoAviso size={12} className="shrink-0" aria-hidden />
                      Sin cuota que incluya esta clase: no se le reserva nada hasta que tenga una
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {(p.estado === 'ACTIVA' || conSitioLibre) && (
                    <button
                      onClick={() => setAPausar(p)}
                      title={pausa === 'sin_pausa' ? 'Pausar unas fechas (vacaciones, lesión…)' : 'Cambiar o quitar la pausa'}
                      aria-label={`${pausa === 'sin_pausa' ? 'Pausar' : 'Cambiar la pausa de'} la plaza fija del ${diaLabel(p.diaSemana)} ${hora}`}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      <Pause size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => setDialogo({ plaza: p })}
                    title="Cambiar de clase, sitio o fechas"
                    aria-label={`Editar la plaza fija del ${diaLabel(p.diaSemana)} ${hora}`}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setABorrar(p)}
                    title="Quitar plaza fija"
                    aria-label={`Quitar la plaza fija del ${diaLabel(p.diaSemana)} ${hora}`}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialogo && (
        <DialogoPlazaFija
          socioId={socioId}
          plaza={dialogo.plaza}
          onClose={() => setDialogo(null)}
          onGuardada={(r, movida) => {
            setDialogo(null);
            onToast(textoPlazaGuardada(r, movida));
          }}
        />
      )}

      {aPausar && (
        <DialogoPausaPlazaFija
          plaza={aPausar}
          nombre={`${diaLabel(aPausar.diaSemana)} ${aPausar.horaInicio.slice(0, 5)}`}
          onClose={() => setAPausar(null)}
          onHecho={mensaje => {
            setAPausar(null);
            onToast(mensaje);
          }}
        />
      )}

      <ConfirmDialog
        open={aBorrar !== null}
        onOpenChange={a => { if (!a) setABorrar(null); }}
        titulo={aBorrar ? `¿Quitar la plaza fija del ${diaLabel(aBorrar.diaSemana)} ${aBorrar.horaInicio.slice(0, 5)}?` : ''}
        descripcion="Deja de reservarle esa clase cada semana y cancela las que ya tenía apuntadas en ese horario, sin penalización; si hay alguien en lista de espera, entra en su lugar. Las que empiezan dentro del plazo de cancelación se mantienen."
        textoConfirmar="Quitar"
        destructivo
        onConfirm={async () => {
          if (aBorrar) {
            const res = await quitarPlazaFija(aBorrar.id);
            if (!res.ok) { onToast(res.error); return; }
            onToast(textoPlazaQuitada(res.canceladas ?? 0, res.mantenidas ?? 0, res.fallidas ?? 0));
          }
          setABorrar(null);
        }}
      />
    </div>
  );
}
