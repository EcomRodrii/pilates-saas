'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStudio } from '@/lib/studio-context';
import { ConfirmarFechas } from '@/components/calendario/confirmar-fechas';
import { crearRepetirMes, proponerRepetirMes } from '@/lib/series/repetir-mes-cliente';
import {
  creables, diasDeLaPropuesta, diasMarcadosDeSerie, motivoDesmarcada, nombreMes, nombreSerieRepetir, planDeCreacion,
  seriesMarcadasDeSerie, seriesQueSeEnsenan, tituloRepetir, type PropuestaRepetir, type ResultadoRepetir,
} from '@/lib/series/repetir-mes';
import type { FechaParaConfirmar } from '@/lib/calendario/confirmar-fechas';

// «Repetir octubre en noviembre» (P1.7). Pide la propuesta al servidor (que
// simula cada serie con el motor de siempre), deja quitar clases y días, y crea
// solo lo marcado. Los festivos vienen sin marcar. Nada optimista: si falla,
// sigue abierto con el error; si sale a medias, lo dice el texto final.

const mayuscula = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

export function DialogoRepetirMes({ mes, onCerrar, onHecho }: {
  /** 'YYYY-MM': el mes que se repite. */
  mes: string;
  onCerrar: () => void;
  onHecho: (r: ResultadoRepetir, destino: string) => void;
}) {
  const { tiposClase, salas } = useStudio();
  const [propuesta, setPropuesta] = useState<PropuestaRepetir | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [series, setSeries] = useState<Set<string>>(() => new Set());
  const [dias, setDias] = useState<Set<string>>(() => new Set());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enviandoRef = useRef(false);

  useEffect(() => {
    let vivo = true;
    void proponerRepetirMes(mes).then(r => {
      if (!vivo) return;
      if (!r.ok) { setErrorCarga(r.error); return; }
      setPropuesta(r.propuesta);
      setSeries(seriesMarcadasDeSerie(r.propuesta));
      setDias(diasMarcadosDeSerie(r.propuesta));
    });
    return () => { vivo = false; };
  }, [mes]);

  const fechas: FechaParaConfirmar[] = useMemo(() => (propuesta
    ? diasDeLaPropuesta(propuesta, series).map(d => ({
        fecha: d.fecha,
        clases: d.clases,
        festivo: d.festivo ? `Festivo en ${propuesta.zona ?? 'tu comunidad'}: ${d.festivo}` : null,
        nota: d.festivo && d.abierto ? 'Dijiste que ese día abres' : null,
      }))
    : []), [propuesta, series]);

  async function crear() {
    if (!propuesta || enviandoRef.current) return;
    const plan = planDeCreacion(propuesta, series, dias);
    if (plan.length === 0) return;
    enviandoRef.current = true;
    setEnviando(true);
    setError(null);
    try {
      const r = await crearRepetirMes(mes, plan);
      if (!r.ok) { setError(r.error); return; }
      onHecho(r.resultado, propuesta.destino);
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  const destino = propuesta?.destino;
  const hayAlgoQueRepetir = !!propuesta?.series.some(s => !s.error && creables(s).length > 0);
  const vacio = !propuesta
    ? (errorCarga ? '' : `Comprobando las clases de ${nombreMes(mes)}…`)
    : propuesta.series.length === 0
      ? `En ${nombreMes(mes)} no hay clases que se repitan cada semana. Las clases sueltas no se copian.`
      : !hayAlgoQueRepetir
        ? `${mayuscula(nombreMes(destino!))} ya está creado: no queda ninguna clase que repetir.`
        : 'Marca alguna clase para ver sus días.';

  const { visibles, yaCubiertas } = propuesta ? seriesQueSeEnsenan(propuesta) : { visibles: [], yaCubiertas: 0 };
  const nombreTipo = (id: string) => tiposClase.find(t => t.id === id)?.nombre;
  const nombreSala = (id: string) => salas.find(s => s.id === id)?.nombre;

  return (
    <ConfirmarFechas
      titulo={tituloRepetir(mes)}
      descripcion="Se crean las clases que se repiten cada semana, con su sala, su instructora y su aforo. Las alumnas con clase fija siguen en ellas."
      fechas={fechas}
      marcadas={dias}
      onCambiar={setDias}
      onCrear={() => void crear()}
      onCerrar={onCerrar}
      enviando={enviando}
      error={error ?? errorCarga}
      vacio={vacio}
    >
      {propuesta && visibles.length > 0 && (
        <fieldset className="min-w-0 space-y-2" disabled={enviando}>
          <legend className="text-xs font-semibold text-muted-foreground">Clases</legend>
          <ul className="divide-y divide-border rounded-lg border border-border" data-testid="repetir-series">
            {visibles.map(s => {
              const motivo = motivoDesmarcada(s);
              const bloqueada = !!s.error || creables(s).length === 0;
              const n = creables(s).length;
              return (
                <li key={s.serieId}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm has-[:disabled]:cursor-default" data-testid="repetir-serie">
                    <input type="checkbox" className="size-4 shrink-0 accent-[var(--brand)]" disabled={bloqueada}
                      checked={series.has(s.serieId)}
                      onChange={e => setSeries(prev => {
                        const otra = new Set(prev);
                        if (e.target.checked) otra.add(s.serieId); else otra.delete(s.serieId);
                        return otra;
                      })} />
                    <span className="min-w-0 flex-1">
                      {/* Entero, sin recortar: dos clases pueden distinguirse solo por la sala. */}
                      <span className="block text-foreground text-pretty">{nombreSerieRepetir(s, nombreTipo, nombreSala)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {motivo ?? (n === 1 ? '1 clase' : `${n} clases`)}
                      </span>
                      {!motivo && (s.instructoraInactiva || (s.sinInstructora ?? 0) > 0) && (
                        <span className="block text-xs text-warning">
                          {s.instructoraInactiva
                            ? 'Su instructora ya no está en el equipo: se crean sin instructora'
                            : s.sinInstructora === 1
                              ? '1 queda sin instructora: la de siempre tiene otra clase a esa hora'
                              : `${s.sinInstructora} quedan sin instructora: la de siempre tiene otra clase a esa hora`}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            {yaCubiertas > 0 && (yaCubiertas === 1
              ? `1 clase que se repite ya llega a ${nombreMes(propuesta.destino)}. `
              : `${yaCubiertas} clases que se repiten ya llegan a ${nombreMes(propuesta.destino)}. `)}
            {propuesta.sueltas > 0
              ? `Las clases sueltas no se copian (en ${nombreMes(mes)} hay ${propuesta.sueltas}). `
              : 'Las clases sueltas no se copian. '}
            {propuesta.zona
              ? `Los festivos de ${propuesta.zona} vienen sin marcar.`
              : 'No sabemos tu comunidad por la dirección del estudio, así que no marcamos festivos.'}
            {propuesta.zona && (propuesta.aniosSinFestivos ?? []).length > 0 &&
              ` Aún no tenemos los festivos de ${(propuesta.aniosSinFestivos ?? []).join(' y ')}: revisa tú esos días.`}
          </p>
          {(propuesta.seriesFuera ?? 0) > 0 && (
            <p className="text-xs font-medium text-warning">
              {propuesta.seriesFuera === 1
                ? 'Hay 1 clase semanal más que no cabe en esta tanda: repite el mes otra vez cuando termines.'
                : `Hay ${propuesta.seriesFuera} clases semanales más que no caben en esta tanda: repite el mes otra vez cuando termines.`}
            </p>
          )}
        </fieldset>
      )}
    </ConfirmarFechas>
  );
}
