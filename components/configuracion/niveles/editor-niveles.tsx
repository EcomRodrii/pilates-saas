'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import { nombreCreditos } from '@/lib/creditos-nombre';
import { cn } from '@/lib/utils';
import { btnPrimary, btnSecondary, cardCls, inputCls } from '@/components/configuracion/estilos';
import type { MostrarToast } from '@/components/ui/toast';
import type { LevelDefinition } from '@/lib/types';
import {
  CLASES_POR_SEMANA_SUPUESTAS, COLOR_NIVEL_NUEVO, MAX_NIVELES, NOMBRES_SUGERIDOS, RITMOS, UMBRAL_AVISO_SIN_LISTA,
  bajadasPorNivel, clasesDeUmbral, creditosPorClase, escalaDeRitmo, repartoPorNivel, ritmoDe, umbralAlEditarClases,
  type Ritmo,
} from '@/lib/gamificacion/ritmo-niveles';

// P3.8 — los niveles con ritmo y equivalencias en clases (apagado tras
// `GAMIFICACION_NIVELES_RITMO`; diseño 23). Sustituye al editor de uno en uno:
// la escala entera se edita en filas y se guarda con un solo botón, y el
// servidor no deja guardar nada que baje de nivel a una alumna que ya ha ganado algo.

interface Fila {
  /** Clave de React (estable aunque el nivel aún no tenga id). */
  clave: string;
  id?: string;
  nombre: string;
  umbral: number;
  color: string;
  icono: string;
  beneficios: string;
  activo: boolean;
  /** Lo que se está escribiendo en «clases» (sin convertir hasta que cambia de verdad). */
  clasesTexto?: string;
}

type Datos = { estado: 'cargando' } | { estado: 'error' } | { estado: 'ok'; totales: number[]; sinLista: { clases: number; sinNadie: number } | null };

let contador = 0;
const nuevaClave = () => `n-${++contador}`;

function filasDe(niveles: LevelDefinition[]): Fila[] {
  return [...niveles]
    .sort((a, b) => Number(b.activo) - Number(a.activo) || a.umbralCreditos - b.umbralCreditos || a.orden - b.orden)
    .map((n) => ({ clave: n.id, id: n.id, nombre: n.nombre, umbral: n.umbralCreditos, color: n.color, icono: n.icono, beneficios: n.beneficios ?? '', activo: n.activo }));
}

const firma = (fs: Fila[]) => JSON.stringify(fs.map(({ clave: _c, clasesTexto: _t, ...f }) => f));
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function EditorNiveles({ showToast }: { showToast: MostrarToast }) {
  const { levelDefinitions, rewardRules, studio, reemplazarNiveles, gamificacionCargada } = useStudio();
  const porClase = creditosPorClase(rewardRules);
  const moneda = nombreCreditos(studio?.creditosNombre);
  const [filas, setFilas] = useState<Fila[]>(() => filasDe(levelDefinitions));
  const [base, setBase] = useState(() => firma(filasDe(levelDefinitions)));
  const [datos, setDatos] = useState<Datos>({ estado: 'cargando' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);

  // Las tablas de gamificación llegan después del arranque: cuando llegan (o
  // cambian por otra vía), la tabla se rehace si no había nada sin guardar.
  const firmaServidor = firma(filasDe(levelDefinitions));
  useEffect(() => {
    if (firma(filas) === base && firmaServidor !== base) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFilas(filasDe(levelDefinitions));
      setBase(firmaServidor);
    }
  }, [firmaServidor, gamificacionCargada]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch('/api/estudio/niveles', { headers: await authHeader() });
        const j = (await res.json().catch(() => null)) as { totales?: unknown; sinLista?: { clases: number; sinNadie: number } | null } | null;
        if (!vivo) return;
        if (!res.ok || !j || !Array.isArray(j.totales)) { setDatos({ estado: 'error' }); return; }
        setDatos({ estado: 'ok', totales: j.totales.filter((t): t is number => typeof t === 'number'), sinLista: j.sinLista ?? null });
      } catch {
        if (vivo) setDatos({ estado: 'error' });
      }
    })();
    return () => { vivo = false; };
  }, []);

  const comparables = useMemo(() => filas.map((f, i) => ({ id: f.id ?? f.clave, umbralCreditos: f.umbral, activo: f.activo, orden: i })), [filas]);

  // Mientras llegan las tablas, ni textos ni botones: sin reglas parecería que el
  // estudio no da créditos, y «empezar» encima de los niveles reales los pisaría.
  if (!gamificacionCargada) {
    return (
      <TarjetaAjuste id="niveles" marco={false}>
        <p className="text-[13px] text-muted-foreground" role="status">Cargando tus niveles…</p>
      </TarjetaAjuste>
    );
  }

  const activas = filas.filter((f) => f.activo);
  const ritmo = ritmoDe(activas.map((f) => f.umbral), porClase);
  const reparto = datos.estado === 'ok' ? repartoPorNivel(datos.totales, comparables) : null;
  const bajadas = datos.estado === 'ok' ? bajadasPorNivel(datos.totales, levelDefinitions, comparables) : new Map<string, number>();
  let bajarian = 0;
  for (const c of bajadas.values()) bajarian += c;
  const nombreDeNivel = (id: string) => levelDefinitions.find((l) => l.id === id)?.nombre ?? 'un nivel';
  const cambiado = firma(filas) !== base;
  const umbralesRepetidos = new Set(activas.map((f) => f.umbral)).size !== activas.length;
  const nombresRepetidos = new Set(activas.map((f) => f.nombre.trim().toLocaleLowerCase('es'))).size !== activas.length;
  const nombreVacio = filas.some((f) => !f.nombre.trim());
  const puedeGuardar = cambiado && !guardando && bajarian === 0 && !umbralesRepetidos && !nombresRepetidos && !nombreVacio && datos.estado === 'ok';

  function aplicarRitmo(r: Ritmo) {
    if (!porClase) return;
    const escala = escalaDeRitmo(r, porClase);
    setError(null);
    setNota(null);
    const fs = filas;
    const act = fs.filter((f) => f.activo).sort((a, b) => a.umbral - b.umbral);
    const resto = fs.filter((f) => !f.activo);
    const usados = new Set(fs.map((x) => x.nombre.trim().toLocaleLowerCase('es')));
    const nuevas = escala.map((umbral, i) => {
      const f = act[i];
      if (f) return { ...f, umbral, clasesTexto: undefined };
      const nombre = NOMBRES_SUGERIDOS.find((x) => !usados.has(x.toLocaleLowerCase('es'))) ?? `Nivel ${i + 1}`;
      usados.add(nombre.toLocaleLowerCase('es'));
      return { clave: nuevaClave(), nombre, umbral, color: COLOR_NIVEL_NUEVO, icono: String(i + 1), beneficios: '', activo: true };
    });
    // Los de más de cinco, por encima del último y en el mismo orden: nunca por debajo ni repetidos.
    const paso = Math.max(10, escala[escala.length - 1] - escala[escala.length - 2]);
    const sobrantes = act.slice(escala.length).map((f, i) => ({ ...f, umbral: escala[escala.length - 1] + paso * (i + 1), clasesTexto: undefined }));
    if (sobrantes.length > 0) setNota(`Tienes más de cinco niveles: ${plural(sobrantes.length, 'el de más queda', 'los de más quedan')} por encima del último, y la escala cuenta como «a medida».`);
    setFilas([...nuevas, ...sobrantes, ...resto]);
  }

  const cambiar = (clave: string, c: Partial<Fila>) => {
    setError(null);
    setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...c } : f)));
  };

  async function guardar() {
    if (!puedeGuardar) return;
    setError(null);
    setGuardando(true);
    try {
      const res = await fetch('/api/estudio/niveles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({
          niveles: filas.map((f) => ({ id: f.id, nombre: f.nombre.trim(), umbralCreditos: f.umbral, color: f.color, icono: f.icono, beneficios: f.beneficios.trim() || null, activo: f.activo })),
        }),
      });
      const j = (await res.json().catch(() => null)) as { niveles?: LevelDefinition[]; error?: string } | null;
      if (!res.ok || !j?.niveles) {
        setError(j?.error ?? 'No se han podido guardar los niveles. No se ha cambiado nada.');
        return;
      }
      reemplazarNiveles(j.niveles);
      const nuevas = filasDe(j.niveles);
      setFilas(nuevas);
      setBase(firma(nuevas));
      setNota(null);
      showToast('Niveles guardados');
    } catch {
      // Sin respuesta no se sabe si llegó a guardarse: decirlo, no adivinarlo.
      setError('No ha llegado la respuesta: no sabemos si se ha guardado. Recarga la página para comprobarlo.');
    } finally {
      setGuardando(false);
    }
  }

  const sinLista = datos.estado === 'ok' ? datos.sinLista : null;
  const avisoLista = studio?.requiereCheckinQr === false
    ? 'En tu estudio no se pasa lista: cuenta toda reserva, venga o no, así que los niveles suben aunque no venga.'
    : sinLista && sinLista.clases > 0 && sinLista.sinNadie / sinLista.clases >= UMBRAL_AVISO_SIN_LISTA
      ? `En los últimos 90 días, en ${sinLista.sinNadie} de ${sinLista.clases} clases nadie quedó como «vino». Si no se pasa lista, nadie suma ${moneda} por asistir y los niveles no se mueven.`
      : null;
  const numeroDe = (f: Fila) => [...activas].sort((a, b) => a.umbral - b.umbral).findIndex((x) => x.clave === f.clave);

  return (
    <TarjetaAjuste id="niveles" marco={false}>
      <div className="space-y-4" data-testid="editor-niveles">
        <p className="text-[12.5px] text-muted-foreground">
          El nivel sale del total de {moneda} que ha ganado cada alumna (no de su saldo: canjear no la baja).
          {porClase
            ? ` En tu estudio una clase da unos ${Math.round(porClase)} ${moneda}: lo de «Asistir a clase» más «Completar una semana» repartido entre ${CLASES_POR_SEMANA_SUPUESTAS} clases a la semana (lo suponemos). Las compras, las amigas y el objetivo del mes lo adelantan.`
            : ` Tu estudio no da ${moneda} por venir a clase, así que los niveles no se pueden contar en clases: enciende «Asistir a clase» en Créditos por acción, o fija los niveles en ${moneda}.`}
        </p>

        <div className="space-y-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Ritmo de la escala">
            {(Object.keys(RITMOS) as Ritmo[]).map((r) => (
              <button key={r} type="button" aria-pressed={ritmo === r} disabled={!porClase}
                onClick={() => aplicarRitmo(r)}
                className={cn('min-h-11 rounded-xl border px-3 py-2 text-left text-[12.5px] transition-colors disabled:opacity-40',
                  ritmo === r ? 'border-foreground bg-muted font-semibold text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
                <span className="block">{RITMOS[r].nombre}</span>
                {porClase && <span className="block text-[11.5px] font-normal">el último, ≈ {RITMOS[r].clases[RITMOS[r].clases.length - 1]} clases</span>}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-muted-foreground" role="status">
            Ahora: {ritmo === 'a_medida' ? 'a medida' : RITMOS[ritmo].nombre.toLowerCase()}.
          </p>
        </div>

        {filas.length === 0 ? (
          <div className={cn(cardCls, 'p-6 text-center text-[13px] text-muted-foreground')}>
            Aún no hay niveles. {porClase ? 'Elige un ritmo arriba para empezar con cinco.' : ''}
            {!porClase && (
              <button type="button" className={cn(btnSecondary, 'ml-2')}
                onClick={() => setFilas(NOMBRES_SUGERIDOS.map((nombre, i) => ({ clave: nuevaClave(), nombre, umbral: [0, 200, 500, 1000, 2000][i], color: COLOR_NIVEL_NUEVO, icono: String(i + 1), beneficios: '', activo: true })))}>
                Empezar con cinco
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-2" data-testid="filas-niveles">
            {filas.map((f) => {
              const pos = numeroDe(f);
              const etiqueta = f.nombre.trim() || `el nivel ${pos >= 0 ? pos + 1 : ''}`.trim();
              const n = reparto?.porNivel.get(f.id ?? f.clave);
              const clasesMostradas = porClase ? clasesDeUmbral(f.umbral, porClase) : 0;
              return (
                <li key={f.clave} className={cn(cardCls, 'space-y-2 p-3', !f.activo && 'opacity-60')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-foreground" style={{ backgroundColor: `${f.color}33` }} aria-hidden>
                      {f.activo && pos >= 0 ? pos + 1 : '–'}
                    </span>
                    <input aria-label={`Icono de ${etiqueta}`} value={f.icono} maxLength={8} onChange={(e) => cambiar(f.clave, { icono: e.target.value })}
                      className={cn(inputCls, 'w-14 text-center')} title="Lo que ve la alumna junto al nombre" />
                    <input aria-label={pos >= 0 ? `Nombre del nivel ${pos + 1}` : `Nombre de ${etiqueta}`} value={f.nombre} maxLength={60}
                      onChange={(e) => cambiar(f.clave, { nombre: e.target.value })}
                      className={cn(inputCls, 'min-w-[8rem] flex-1')} aria-invalid={!f.nombre.trim()} />
                    {porClase && (
                      <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                        desde
                        <input aria-label={`Clases para ${f.nombre || 'el nivel'}`} type="number" inputMode="numeric" min={0} max={5000} className={cn(inputCls, 'w-20')}
                          value={f.clasesTexto ?? String(clasesMostradas)}
                          onChange={(e) => {
                            const texto = e.target.value;
                            const nClases = Number(texto);
                            cambiar(f.clave, texto === '' || !Number.isFinite(nClases)
                              ? { clasesTexto: texto }
                              : { clasesTexto: texto, umbral: umbralAlEditarClases(Math.max(0, Math.trunc(nClases)), f.umbral, porClase) });
                          }}
                          onBlur={() => cambiar(f.clave, { clasesTexto: undefined })} />
                        {(Number(f.clasesTexto ?? clasesMostradas) === 1) ? 'clase' : 'clases'}
                      </label>
                    )}
                    <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                      {porClase ? '=' : 'desde'}
                      <input aria-label={`${moneda} para ${f.nombre || 'el nivel'}`} type="number" inputMode="numeric" min={0} max={1000000} className={cn(inputCls, 'w-24')}
                        value={f.umbral} onChange={(e) => cambiar(f.clave, { umbral: Math.max(0, Math.trunc(Number(e.target.value) || 0)), clasesTexto: undefined })} />
                      {moneda}
                    </label>
                    <label className="flex min-h-11 items-center gap-1.5 text-[12.5px] text-muted-foreground">
                      <input type="checkbox" checked={f.activo} onChange={(e) => cambiar(f.clave, { activo: e.target.checked })} aria-label={`${etiqueta} activo`} />
                      Activo
                    </label>
                    <span className="ml-auto text-[12.5px] tabular-nums text-muted-foreground">
                      {f.activo && n !== undefined ? plural(n, 'alumna', 'alumnas') : ''}
                    </span>
                    <button type="button" aria-label={`Quitar ${etiqueta}`} onClick={() => { setError(null); setFilas((fs) => fs.filter((x) => x.clave !== f.clave)); }}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <input aria-label={`Beneficios de ${etiqueta}`} value={f.beneficios} maxLength={200} placeholder="Beneficios (opcional, solo texto: no se aplican solos)"
                    onChange={(e) => cambiar(f.clave, { beneficios: e.target.value })} className={cn(inputCls, 'w-full text-[12.5px]')} />
                </li>
              );
            })}
          </ul>
        )}

        {filas.length < MAX_NIVELES && filas.length > 0 && (
          <button type="button" className={btnSecondary}
            onClick={() => setFilas((fs) => {
              const ultimo = Math.max(0, ...fs.filter((x) => x.activo).map((x) => x.umbral));
              const numero = fs.filter((x) => x.activo).length + 1;
              return [...fs, { clave: nuevaClave(), nombre: '', umbral: ultimo + (porClase ? Math.max(10, Math.round(10 * porClase)) : 100), color: COLOR_NIVEL_NUEVO, icono: String(numero), beneficios: '', activo: true }];
            })}>
            <Plus size={14} className="mr-1 inline" aria-hidden />Añadir un nivel
          </button>
        )}

        <div className={cn(cardCls, 'p-4 text-[12.5px]')} data-testid="vista-previa-niveles">
          <p className="font-semibold text-foreground">Así quedarían las alumnas con {moneda}</p>
          {datos.estado === 'cargando' && <p className="mt-1 text-muted-foreground">Calculando…</p>}
          {datos.estado === 'error' && <p role="alert" className="mt-1 font-medium text-destructive">No se han podido leer los {moneda} de tus alumnas, así que ahora no se puede guardar. Vuelve a intentarlo en un rato.</p>}
          {reparto && (
            <p className="mt-1 text-muted-foreground">
              {[...activas].sort((a, b) => a.umbral - b.umbral).map((f) => `${f.nombre || 'Sin nombre'}: ${reparto.porNivel.get(f.id ?? f.clave) ?? 0}`).join(' · ')}
              {reparto.sinNivel > 0 && ` · Sin nivel todavía: ${reparto.sinNivel}`}
            </p>
          )}
          <p className="mt-2 text-muted-foreground">Cambiar la escala no baja a nadie que ya haya ganado algo: si un cambio dejara a alguna alumna en un nivel más bajo del que tiene, no se guarda.</p>
        </div>

        {nota && <p className="text-[12.5px] text-muted-foreground" role="status">{nota}</p>}
        {avisoLista && (
          <p className="flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-[12.5px] text-foreground">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden />{avisoLista}
          </p>
        )}
        {bajarian > 0 && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Con estos cambios bajarían de nivel: {[...bajadas.entries()].map(([id, c]) => `${plural(c, 'alumna', 'alumnas')} de «${nombreDeNivel(id)}»`).join(', ')}.
              {' '}Lo que ya tienen no se toca: baja ese umbral o deja ese nivel para poder guardar.
            </span>
          </p>
        )}
        {nombreVacio && <p role="alert" className="text-[12.5px] font-medium text-destructive">Ponle nombre a cada nivel para poder guardar.</p>}
        {nombresRepetidos && <p role="alert" className="text-[12.5px] font-medium text-destructive">Dos niveles activos se llaman igual: cambia uno.</p>}
        {umbralesRepetidos && <p role="alert" className="text-[12.5px] font-medium text-destructive">Dos niveles activos empiezan en el mismo punto: cambia uno.</p>}
        {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} disabled={!puedeGuardar} onClick={() => void guardar()}>
            {guardando ? 'Guardando…' : 'Guardar niveles'}
          </button>
          {cambiado && (
            <button type="button" className={btnSecondary} disabled={guardando}
              onClick={() => { setFilas(filasDe(levelDefinitions)); setBase(firmaServidor); setError(null); setNota(null); }}>
              Deshacer cambios
            </button>
          )}
        </div>
      </div>
    </TarjetaAjuste>
  );
}
