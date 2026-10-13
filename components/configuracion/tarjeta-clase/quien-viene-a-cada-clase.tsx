'use client';

import { useId, useMemo, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { SEMAFORO_META } from '@/lib/ficha-clinica';
import {
  ALUMNA_DE_MUESTRA, DE_SERIE, esDeSerie, piezasDeTarjeta, saludVisible, tarjetaClaseDe,
  type SaludTarjeta, type TarjetaClase,
} from '@/lib/calendario/tarjeta-clienta';
import { Interruptor } from '@/components/ui/interruptor';
import { PiezasFila } from '@/components/calendario/piezas-fila';
import { btnPrimary, btnSecondary, cardCls } from '@/components/configuracion/estilos';

// ─────────────────────────────────────────────────────────────────────────────
// «Quién viene a cada clase» (P3.11, diseño 22): qué se ve de cada alumna en la
// lista de una clase del Calendario. Se monta en Configuración › Tu panel SOLO
// con `TARJETA_CLASE` encendido; si no, la sección es la de siempre.
//
// Lo guarda el servidor (PUT /api/estudio/tarjeta-clase, solo la propietaria):
// nada optimista, la pantalla pinta lo que el servidor contesta. La vista
// previa usa una alumna inventada (`ALUMNA_DE_MUESTRA`), nunca una real, y la
// MISMA pieza que la lista de verdad (`PiezasFila`).
//
// Lo de la salud se dice en la propia fila: «Qué adaptar» solo lo ve la
// propietaria. Gerencia y recepción ven como mucho el color, elija lo que elija.
// ─────────────────────────────────────────────────────────────────────────────

const INTERRUPTORES: { clave: Exclude<keyof TarjetaClase, 'salud'>; titulo: string; frase: string }[] = [
  { clave: 'conQueViene', titulo: 'Con qué viene', frase: 'Su bono y cuántas sesiones le quedan, o si viene con su cuota.' },
  { clave: 'confirmacion', titulo: 'Si ha confirmado', frase: 'Solo cuando se le pidió confirmar que viene.' },
  { clave: 'cumpleanos', titulo: 'Su cumpleaños', frase: 'Si cumple años el día de la clase.' },
  { clave: 'notaFijada', titulo: 'Su nota fijada', frase: 'La nota fijada arriba en su ficha que ve todo el equipo. Las privadas no salen aquí.' },
  { clave: 'primeraVez', titulo: 'Si es su primera vez', frase: 'No sale a quien trae historial de otra plataforma.' },
];

const SALUD: { valor: SaludTarjeta; titulo: string; frase: string }[] = [
  { valor: 'nada', titulo: 'Nada', frase: 'Sin el punto de color.' },
  { valor: 'color', titulo: 'El color', frase: 'El punto verde, ámbar o rojo, como hasta ahora.' },
  { valor: 'adaptar', titulo: 'Qué adaptar', frase: 'El color y qué adaptar en la clase. Esto solo lo ves tú.' },
];

const iguales = (a: TarjetaClase, b: TarjetaClase) =>
  (Object.keys(DE_SERIE) as (keyof TarjetaClase)[]).every(k => a[k] === b[k]);

export function QuienVieneACadaClase({ showToast }: { showToast: (m: string) => void }) {
  const { studio, reflejarStudioGuardado } = useStudio();
  const guardada = useMemo(() => tarjetaClaseDe(studio?.tarjetaClase), [studio?.tarjetaClase]);
  const [borrador, setBorrador] = useState<TarjetaClase>(guardada);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idTitulo = useId();
  const idSalud = useId();
  const idFrase = useId();
  const sucio = !iguales(borrador, guardada);

  const cambiar = (c: Partial<TarjetaClase>) => { setError(null); setBorrador(b => ({ ...b, ...c })); };

  async function guardar() {
    if (!sucio || guardando) return;
    setError(null);
    setGuardando(true);
    try {
      // Con el estudio que tiene delante: si cambió de sede en otra pestaña, el
      // servidor contesta 409 en vez de guardarlo en la otra.
      const res = await fetch(`/api/estudio/tarjeta-clase?estudio=${encodeURIComponent(studio?.id ?? '')}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(borrador),
      });
      const j = (await res.json().catch(() => null)) as { tarjeta?: unknown; error?: string } | null;
      if (!res.ok || !j?.tarjeta) {
        setError(j?.error ?? 'No se ha guardado. No ha cambiado nada en el Calendario.');
        return;
      }
      const t = tarjetaClaseDe(j.tarjeta);
      reflejarStudioGuardado({ tarjetaClase: esDeSerie(t) ? null : t });
      setBorrador(t);
      showToast('Guardado. En otros dispositivos se verá al recargar el Calendario');
    } catch {
      // Sin respuesta no se sabe si llegó a guardarse: decirlo, no adivinarlo.
      setError('No ha llegado la respuesta: no sabemos si se ha guardado. Recarga la página para comprobarlo.');
    } finally {
      setGuardando(false);
    }
  }

  // La vista previa, como la vería la propietaria (la que está aquí).
  const rol = { verSemaforo: true, verFichaClinica: true };
  const piezas = piezasDeTarjeta(borrador, ALUMNA_DE_MUESTRA.datos, rol);
  const conColor = saludVisible(borrador, rol).color;

  return (
    <section aria-labelledby={idTitulo} className="max-w-2xl space-y-2" data-testid="tarjeta-clase">
      <div className="space-y-1 px-1">
        <h3 id={idTitulo} className="text-sm font-semibold text-foreground">Quién viene a cada clase</h3>
        <p className="text-sm text-muted-foreground text-pretty">
          Lo que se ve en el panel debajo del nombre de cada alumna, en la lista de una clase del Calendario.
          {studio?.cadenaId ? ' Solo en esta sede.' : ''}
        </p>
      </div>

      <div className={cn(cardCls, 'divide-y divide-border overflow-hidden')}>
        <ul className="divide-y divide-border">
          {INTERRUPTORES.map(i => (
            <li key={i.clave} className="px-4 py-3">
              <label className="flex cursor-pointer items-start gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-foreground">{i.titulo}</span>
                  <span id={`${idFrase}-${i.clave}`} className="mt-0.5 block text-sm text-muted-foreground text-pretty">{i.frase}</span>
                </span>
                <Interruptor
                  on={borrador[i.clave]}
                  ariaLabel={i.titulo}
                  describedBy={`${idFrase}-${i.clave}`}
                  onChange={v => cambiar({ [i.clave]: v })}
                  disabled={guardando}
                  className="mt-0.5"
                />
              </label>
            </li>
          ))}
          <li className="px-4 py-3">
            <p id={idSalud} className="text-[15px] font-semibold text-foreground">Su salud</p>
            {/* Radios nativos: flechas, Tab y lectores de pantalla sin reinventarlos. */}
            <div role="radiogroup" aria-labelledby={idSalud} className="mt-2 grid gap-2 sm:grid-cols-3">
              {SALUD.map(o => (
                <label
                  key={o.valor}
                  className={cn(
                    'min-h-11 cursor-pointer rounded-lg border px-3 py-2 transition-colors',
                    'has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
                    borrador.salud === o.valor ? 'border-foreground bg-muted' : 'border-border bg-card hover:bg-muted',
                  )}
                >
                  <input
                    type="radio"
                    name={idSalud}
                    value={o.valor}
                    checked={borrador.salud === o.valor}
                    disabled={guardando}
                    onChange={() => cambiar({ salud: o.valor })}
                    className="sr-only"
                  />
                  <span className="block text-[13.5px] font-semibold text-foreground">{o.titulo}</span>
                  <span className="mt-0.5 block text-[12.5px] text-muted-foreground text-pretty">{o.frase}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-[12.5px] text-muted-foreground text-pretty">
              Gerencia y recepción ven como mucho el color: lo que hay que adaptar es de la ficha de salud, y esa solo la ves tú.
            </p>
          </li>
        </ul>

        <div className="space-y-2 bg-muted/40 px-4 py-3">
          <p className="text-[12.5px] font-medium text-foreground">Así se verá (con una alumna inventada)</p>
          <div role="group" className="rounded-lg border border-border bg-card px-3 py-2.5" data-testid="vista-previa-tarjeta" aria-label="Vista previa de una fila">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-[12.5px] font-semibold text-foreground" aria-hidden>
                LM
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1.5 text-[14px] font-medium text-foreground">
                  {conColor && <span className="size-2 shrink-0 rounded-full" title={SEMAFORO_META.AMBAR.label} style={{ background: SEMAFORO_META.AMBAR.color }} />}
                  <span className="truncate">{ALUMNA_DE_MUESTRA.nombre}</span>
                </p>
                <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{ALUMNA_DE_MUESTRA.sitio} · Reserva</p>
              </div>
            </div>
            {/* Igual que en la lista de verdad: debajo y alineado con el nombre. */}
            <PiezasFila piezas={piezas} className="pl-[52px]" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <button type="button" className={btnPrimary} disabled={!sucio || guardando} onClick={() => void guardar()}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          {sucio && (
            <button type="button" className={btnSecondary} disabled={guardando} onClick={() => { setError(null); setBorrador(guardada); }}>
              Descartar
            </button>
          )}
          {!sucio && !esDeSerie(guardada) && (
            <button type="button" className={btnSecondary} disabled={guardando} onClick={() => cambiar({ ...DE_SERIE })}>
              Volver a lo de siempre
            </button>
          )}
          {error && <p role="alert" className="basis-full text-sm font-medium text-destructive">{error}</p>}
        </div>
      </div>
    </section>
  );
}
