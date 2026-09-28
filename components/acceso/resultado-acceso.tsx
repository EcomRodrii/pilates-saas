'use client';

// La tarjeta del resultado de un escaneo en el panel: 🟢 / 🟠 / 🔴 a tamaño de
// puerta. Se lee de un vistazo desde el mostrador —el color y el título— y
// debajo va el porqué: alumna, clase, hora, estado y tipo de acceso.
//
// Los textos salen de lib/acceso/textos-acceso.ts (los mismos que verá la
// instructora en su app).

import { CheckCircle2, XCircle, AlertTriangle, DoorOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { capitalizarPrimera, cn } from '@/lib/utils';
import type { AccionAcceso, ClaseDetalle, RespuestaEscaneo } from '@/lib/acceso/escanear-servidor';
import {
  TITULO_VEREDICTO, ETIQUETA_TIPO_ACCESO, detallesAcceso, etiquetaEstadoReserva, explicacionAcceso, fechaAcceso, horaAcceso,
} from '@/lib/acceso/textos-acceso';

const ESTILO = {
  PERMITIDO: { banda: 'bg-success text-success-foreground', borde: 'border-success/40', Icono: CheckCircle2 },
  REVISAR: { banda: 'bg-warning text-warning-foreground', borde: 'border-warning/50', Icono: AlertTriangle },
  DENEGADO: { banda: 'bg-destructive text-destructive-foreground', borde: 'border-destructive/40', Icono: XCircle },
} as const;

const ETIQUETA_ACCION: Record<AccionAcceso, string> = {
  APROBAR: 'Aprobar y dejar pasar',
  DEJAR_PASAR: 'Dejar pasar',
  NO_PERMITIR: 'No permitir acceso',
};

function Iniciales({ nombre }: { nombre: string }) {
  const ini = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('');
  return (
    <div className="size-16 shrink-0 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xl font-bold" aria-hidden>
      {ini || '?'}
    </div>
  );
}

function Dato({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-foreground text-pretty">{v}</dd>
    </div>
  );
}

const lugar = (c: ClaseDetalle) => [horaAcceso(c.inicio), c.sala].filter(Boolean).join(' · ');

export function ResultadoAcceso({
  r, decidiendo, errorDecision, onDecidir, onElegirClase, onDeshacer, onCerrar, onAbrirPuerta, abriendoPuerta, ref,
}: {
  ref?: React.Ref<HTMLElement>;
  onAbrirPuerta?: () => void;
  abriendoPuerta?: boolean;
  r: RespuestaEscaneo;
  decidiendo: AccionAcceso | null;
  errorDecision: string | null;
  onDecidir: (a: AccionAcceso) => void;
  onElegirClase: (sesionId: string) => void;
  onDeshacer?: () => void;
  onCerrar: () => void;
}) {
  // «Ya había entrado» sigue siendo acceso permitido, pero se pinta en ámbar: un
  // segundo escaneo de OTRA persona es la pista de un QR prestado, y en verde
  // pasaría desapercibido.
  const yaEntro = r.motivo === 'YA_ENTRO';
  const e = ESTILO[yaEntro ? 'REVISAR' : r.veredicto];
  const datosTexto = { clase: r.clase, otraClase: r.otraClase, plazaFija: r.plazaFija, yaEntroEn: r.yaEntroEn, avisos: r.avisos, claseEmpezada: r.claseEmpezada };
  const explicacion = explicacionAcceso(r.motivo, datosTexto);
  const detalles = detallesAcceso(r.motivo, datosTexto);
  const titulo = r.motivo === 'VARIAS_CLASES' ? 'Elige la clase' : yaEntro ? 'Ya había entrado' : TITULO_VEREDICTO[r.veredicto];

  return (
    <section
      ref={ref}
      role="status"
      aria-live="assertive"
      data-testid="resultado-acceso"
      data-veredicto={r.veredicto}
      // `scroll-mt-20`: al traerla a la vista, que la banda no quede bajo la cabecera fija del panel.
      className={cn('scroll-mt-20 rounded-2xl border-2 bg-card overflow-hidden shadow-sm', e.borde)}
    >
      <div className={cn('flex items-center gap-3 px-5 py-4', e.banda)}>
        <e.Icono className="size-8 shrink-0" aria-hidden />
        <p className="text-xl sm:text-2xl font-extrabold uppercase tracking-wide">{titulo}</p>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-4">
          {r.alumna?.foto
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada y corta de un bucket privado: next/image no aporta nada aquí.
            ? <img src={r.alumna.foto} alt="" className="size-16 shrink-0 rounded-full object-cover" />
            : r.alumna && <Iniciales nombre={r.alumna.nombre} />}
          <div className="min-w-0">
            {r.alumna && <p className="text-2xl font-bold leading-tight text-foreground text-balance">{r.alumna.nombre}</p>}
            <p className={cn('text-base text-pretty', r.alumna ? 'mt-1 text-muted-foreground' : 'font-semibold text-foreground')}>{explicacion}</p>
          </div>
        </div>

        {r.clase && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-muted/60 p-4">
            <Dato k="Clase" v={r.clase.nombre} />
            <Dato k="Fecha" v={capitalizarPrimera(fechaAcceso(r.clase.inicio))} />
            <Dato k="Hora" v={lugar(r.clase)} />
            <Dato k="Estado" v={etiquetaEstadoReserva(r.estadoReserva)} />
            {r.tipoAcceso && <Dato k="Tipo de acceso" v={ETIQUETA_TIPO_ACCESO[r.tipoAcceso]} />}
            {r.clase.instructora && <Dato k="Instructora" v={r.clase.instructora} />}
          </dl>
        )}

        {detalles.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm font-medium text-foreground">
            {detalles.map(d => <li key={d}>{d}</li>)}
          </ul>
        )}

        {r.candidatas.length > 0 && (
          <div className="flex flex-col gap-2">
            {r.candidatas.map(c => (
              <Button key={c.id} variant="outline" size="lg" className="justify-between rounded-xl" onClick={() => onElegirClase(c.id)}>
                <span className="font-semibold">{c.nombre}</span>
                <span className="text-muted-foreground">{lugar(c)}</span>
              </Button>
            ))}
          </div>
        )}

        {r.acciones.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2">
            {r.acciones.map(a => (
              <Button
                key={a}
                size="lg"
                variant={a === 'NO_PERMITIR' ? 'outline' : 'default'}
                className="flex-1 rounded-xl"
                disabled={decidiendo !== null}
                onClick={() => onDecidir(a)}
              >
                {decidiendo === a && <Loader2 className="animate-spin" aria-hidden />}
                {ETIQUETA_ACCION[a]}
              </Button>
            ))}
          </div>
        )}
        {/* La puerta de Kisi no se abre sola: la abre quien mira, cuando ha visto a la alumna. */}
        {r.puerta === 'disponible' && onAbrirPuerta && (
          <Button size="lg" className="rounded-xl" disabled={abriendoPuerta} onClick={onAbrirPuerta}>
            {abriendoPuerta ? <Loader2 className="animate-spin" aria-hidden /> : <DoorOpen aria-hidden />}
            Abrir la puerta
          </Button>
        )}
        {errorDecision && <p role="alert" className="text-sm font-semibold text-destructive">{errorDecision}</p>}

        {(r.asistenciaMarcada || r.asistenciaAlTerminar || r.errorAsistencia || r.puerta === 'abierta' || r.puerta === 'fallo') && (
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            {r.asistenciaMarcada && <p>Asistencia registrada.</p>}
            {r.asistenciaAlTerminar && <p>Esta clase no pasa lista: la asistencia se marcará sola al terminar.</p>}
            {r.errorAsistencia && <p className="text-warning font-semibold">No se ha podido registrar la asistencia: {r.errorAsistencia} Márcala en la lista de la clase.</p>}
            {r.puerta === 'abierta' && <p className="inline-flex items-center gap-1.5"><DoorOpen className="size-4" aria-hidden />Puerta abierta</p>}
            {r.puerta === 'fallo' && <p className="text-warning font-semibold">La puerta no ha respondido. Ábrela a mano.</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="lg" variant={r.acciones.length ? 'ghost' : 'default'} className="rounded-xl" onClick={onCerrar}>
            Escanear otra
          </Button>
          {onDeshacer && r.asistenciaMarcada && (
            <Button size="lg" variant="ghost" className="rounded-xl" onClick={onDeshacer}>
              Deshacer asistencia
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
