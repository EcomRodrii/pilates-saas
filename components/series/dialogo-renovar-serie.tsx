'use client';

// «Revisar antes de renovar» una clase que se repite, y renovarla.
//
// Al abrir pide al servidor una SIMULACIÓN (la misma función que renueva, que lo
// deshace): qué fechas crearía, cuáles no puede crear y por qué, con qué
// instructora y cuántas plazas fijas siguen. Renovar manda el período que se ha
// revisado: si alguien la ha renovado mientras tanto, el servidor lo dice en vez
// de crear otra tanda. Lo que se enseña al terminar sale de la respuesta, nunca
// de la simulación.
//
// Se monta al abrir y se desmonta al cerrar, como el resto de diálogos del panel.

import { useEffect, useId, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  fechaDMY, MAX_SEMANAS_RENOVACION, semanasValidas, textoTrasRenovar,
  type MotivoOmitida, type ResultadoRenovarSerie,
} from '@/lib/series-renovacion';
import { renovarSerie, simularRenovacion } from '@/lib/series-renovacion-cliente';

const inputCls = 'w-24 text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring';
const MOTIVO: Record<MotivoOmitida, string> = {
  sala_ocupada: 'la sala está ocupada a esa hora',
  ya_existe: 'ya hay una clase igual en el calendario',
};
const OMITIDAS_VISIBLES = 5;

export function DialogoRenovarSerie({ serieId, nombre, onClose, onHecho }: {
  serieId: string;
  /** «Reformer · Martes 18:00 · Sala 1». */
  nombre: string;
  onClose: () => void;
  /** `renovada`: la serie ya llega más lejos (la ha renovado esta persona u otra). */
  onHecho: (mensaje: string, renovada: boolean) => void;
}) {
  const uid = useId();
  const [simulacion, setSimulacion] = useState<ResultadoRenovarSerie | null>(null);
  const [semanas, setSemanas] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Solo vale la última simulación pedida: cambiar las semanas deprisa no puede
  // dejar en pantalla la respuesta de un número anterior.
  const turno = useRef(0);

  useEffect(() => {
    const miTurno = ++turno.current;
    void simularRenovacion(serieId, null).then(r => {
      if (miTurno !== turno.current) return;
      setCargando(false);
      if (!r.ok) { setError(r.error); return; }
      setSimulacion(r.resultado);
      setSemanas(String(r.resultado.semanas));
    });
  }, [serieId]);

  const n = Number(semanas);
  const valida = semanas !== '' && semanasValidas(n);

  useEffect(() => {
    if (!valida || !simulacion || n === simulacion.semanas) return;
    const t = setTimeout(() => {
      const miTurno = ++turno.current;
      setCargando(true);
      setError(null);
      void simularRenovacion(serieId, n).then(r => {
        if (miTurno !== turno.current) return;
        setCargando(false);
        if (!r.ok) { setError(r.error); return; }
        setSimulacion(r.resultado);
      });
    }, 400);
    return () => clearTimeout(t);
  }, [n, valida, simulacion, serieId]);

  const actualizada = !!simulacion && valida && simulacion.semanas === n && !cargando;
  const puedeRenovar = actualizada && simulacion.creadas > 0 && simulacion.periodoActual !== null && !guardando;

  async function renovar() {
    if (!puedeRenovar || !simulacion || simulacion.periodoActual === null) return;
    setGuardando(true);
    setError(null);
    const r = await renovarSerie(serieId, n, simulacion.periodoActual);
    setGuardando(false);
    if (!r.ok) { setError(r.error); return; }
    onHecho(textoTrasRenovar(r.resultado), r.resultado.estado === 'renovada' || r.resultado.estado === 'ya_renovada');
  }

  const omitidas = simulacion?.omitidas ?? [];

  return (
    <Dialog open onOpenChange={abierto => { if (!abierto && !guardando) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Renovar clase</DialogTitle>
        </DialogHeader>
        <p className="text-sm font-semibold text-foreground -mt-1">{nombre}</p>
        <p className="text-xs text-muted-foreground">
          Se alarga la misma serie con el horario, la sala, el tipo de clase, la instructora, el aforo y las notas de su
          última clase. Las clases que ya están en el calendario no se tocan.
        </p>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label htmlFor={`${uid}-semanas`} className="text-xs font-semibold text-muted-foreground">Semanas más</label>
            <input
              id={`${uid}-semanas`} type="number" inputMode="numeric" min={1} max={MAX_SEMANAS_RENOVACION}
              className={inputCls} value={semanas} onChange={e => setSemanas(e.target.value)} disabled={guardando}
            />
            {simulacion && actualizada && (
              <span className="text-xs text-muted-foreground">
                del {fechaDMY(simulacion.desde)} al {fechaDMY(simulacion.hasta)}
              </span>
            )}
          </div>
          {semanas !== '' && !valida && (
            <p role="alert" className="text-xs font-medium text-destructive">Elige entre 1 y {MAX_SEMANAS_RENOVACION} semanas.</p>
          )}

          {cargando && <p className="text-xs text-muted-foreground" role="status">Comprobando el calendario…</p>}

          {simulacion && actualizada && (
            <ul className="space-y-1.5 text-xs text-foreground" data-testid="renovar-resumen">
              <li>{simulacion.creadas === 1 ? 'Se crea 1 clase.' : `Se crean ${simulacion.creadas} clases.`}</li>
              {simulacion.plazasFijas > 0 && (
                <li>
                  {simulacion.plazasFijas === 1
                    ? 'La plaza fija de este horario sigue: se le reserva cada semana como hasta ahora.'
                    : `Las ${simulacion.plazasFijas} plazas fijas de este horario siguen: se les reserva cada semana como hasta ahora.`}
                </li>
              )}
              {simulacion.instructoraInactiva && (
                <li className="text-warning">La instructora de esta clase ya no está en el equipo: se renueva sin instructora.</li>
              )}
              {simulacion.sinInstructora.length > 0 && (
                <li className="text-warning">
                  {simulacion.sinInstructora.length === 1 ? '1 clase queda' : `${simulacion.sinInstructora.length} clases quedan`} sin
                  instructora porque la de siempre ya tiene otra clase a esa hora. Asígnalas en el calendario.
                </li>
              )}
              {omitidas.length > 0 && (
                <li className="text-warning">
                  {omitidas.length === 1 ? 'Una fecha no se crea:' : `${omitidas.length} fechas no se crean:`}
                  <ul className="mt-1 ml-3 list-disc space-y-0.5">
                    {omitidas.slice(0, OMITIDAS_VISIBLES).map(o => (
                      <li key={o.fecha}>{fechaDMY(o.fecha)}: {MOTIVO[o.motivo]}</li>
                    ))}
                    {omitidas.length > OMITIDAS_VISIBLES && <li>y {omitidas.length - OMITIDAS_VISIBLES} más</li>}
                  </ul>
                </li>
              )}
              {simulacion.creadas === 0 && (
                <li className="font-medium text-destructive">No se crearía ninguna clase, así que no hay nada que renovar.</li>
              )}
            </ul>
          )}

          {error && <p role="alert" className="text-xs font-medium text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} disabled={guardando} className="text-xs font-semibold px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={() => void renovar()}
            disabled={!puedeRenovar}
            className="text-xs font-bold px-4 py-2 rounded-lg text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {guardando ? 'Renovando…' : valida ? `Renovar ${n} ${n === 1 ? 'semana' : 'semanas'}` : 'Renovar'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
