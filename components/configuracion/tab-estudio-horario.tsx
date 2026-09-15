'use client';

import { useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { authHeader } from '@/lib/api-client';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { accionCierre, lineaCierre, repartirCierres, type CierreGuardado } from '@/lib/cierres/quitar-cierre';
import { notaDiasYaProrrogados } from '@/lib/cierres/dias-de-cierre';
import { hayCambios as formularioCambiado, sincronizarFormulario } from '@/lib/configuracion/formulario-sincronizado';
import { rangoDeFechas } from '@/lib/configuracion/resumenes';
import { Toggle, btnSecondary, inputCls } from '@/components/configuracion/estilos';
import { BarraGuardar } from '@/components/configuracion/shell/barra-guardar';
import type { PropsFormularioCajon } from '@/components/configuracion/shell/cajon-ajuste';
import { Campo } from '@/components/configuracion/formulario-estudio';
import type { DiaHorario } from '@/lib/types';

// Los cajones «Horario» y «Cerrar el centro» de Mi estudio.
//
// El calendario decía "Cerrado" en cualquier día sin clases, aunque el estudio
// SÍ trabajara ese día — porque no había ningún dato de horario real por día que
// cruzar (ver lib/calendario-columnas.ts, campo `cerrado`). El horario es ese
// dato.
//
// Convención local de esta UI: 0=lunes..6=domingo (igual que vista-semana.tsx y
// lib/calendario-columnas.ts). `DiaHorario.diaSemana` de la BD usa EXTRACT(DOW),
// 0=domingo..6=sábado — la conversión vive solo aquí, en los bordes.
const NOMBRES_DIA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIA_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIAS = [0, 1, 2, 3, 4, 5, 6];

const diaSemanaALocal = (d: number) => (d + 6) % 7;
const localADiaSemana = (l: number) => (l + 1) % 7;

interface FilaHorario {
  abierto: boolean;
  horaApertura: string; // 'HH:MM', para <input type="time">
  horaCierre: string;
}

/** Un día por clave ('0' = lunes): así lo compara y lo sincroniza formulario-sincronizado.ts. */
type FormHorario = Record<string, FilaHorario>;

const FILA_DEFAULT: FilaHorario = { abierto: true, horaApertura: '08:00', horaCierre: '22:00' };

const aHHMM = (t: string | null) => (t ? t.slice(0, 5) : FILA_DEFAULT.horaApertura);

function horarioAForm(horario: DiaHorario[] | undefined): FormHorario {
  const porLocal = new Map(horario?.map(h => [diaSemanaALocal(h.diaSemana), h]));
  return Object.fromEntries(DIAS.map(local => {
    const h = porLocal.get(local);
    const fila = !h ? { ...FILA_DEFAULT }
      : h.abierto ? { abierto: true, horaApertura: aHHMM(h.horaApertura), horaCierre: aHHMM(h.horaCierre) }
      : { abierto: false, horaApertura: FILA_DEFAULT.horaApertura, horaCierre: FILA_DEFAULT.horaCierre };
    return [String(local), fila];
  }));
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// ⚠️ Las dos horas van en la MISMA línea que el día a cualquier anchura: hasta el
// 15-sep bajaban a la suya por debajo de `@lg/config` (32 rem), que es más ancho
// que la columna de Configuración a 1024 px, así que no subían nunca. En el móvil
// el día va abreviado para que quepan, y con el dedo sobra el relojito de Chrome
// (tocar el campo ya abre el selector): a 375 px dejaba «08:0».
const INPUT_HORA = 'min-h-11 min-w-0 flex-1 rounded-md border border-input bg-card px-1.5 py-1 text-base tabular-nums [@media(pointer:coarse)]:[&::-webkit-calendar-picker-indicator]:hidden [@media(pointer:fine)]:min-h-8 [@media(pointer:fine)]:px-2 [@media(pointer:fine)]:text-[13px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

export function FormHorario({ onGuardado }: PropsFormularioCajon) {
  const { studio, updateHorarioEstudio } = useStudio();
  const horario = studio?.horarioSemana;
  const [form, setForm] = useState(() => horarioAForm(horario));
  const [base, setBase] = useState(() => horarioAForm(horario));

  // Llega el horario del servidor: lo que no se ha tocado se pone al día, lo
  // tocado se queda (#2027).
  const [horarioAnterior, setHorarioAnterior] = useState(horario);
  if (horario !== horarioAnterior) {
    setHorarioAnterior(horario);
    const servidor = horarioAForm(horario);
    setForm(sincronizarFormulario(form, base, servidor));
    setBase(servidor);
  }

  const fila = (local: number) => form[String(local)];
  const cambiar = (local: number, cambios: Partial<FilaHorario>) =>
    setForm(f => ({ ...f, [local]: { ...f[String(local)], ...cambios } }));
  const copiar = (desde: number, a: readonly number[]) =>
    setForm(f => ({ ...f, ...Object.fromEntries(a.map(l => [String(l), { ...f[String(desde)] }])) }));

  const malo = DIAS.find(l => {
    const f = fila(l);
    return f.abierto && (!f.horaApertura || !f.horaCierre || minutos(f.horaApertura) >= minutos(f.horaCierre));
  });
  const bloqueo = malo === undefined ? null : `${NOMBRES_DIA[malo]}: la hora de cierre tiene que ser posterior a la de apertura.`;

  async function alGuardar() {
    const dias: DiaHorario[] = DIAS.map(local => {
      const f = fila(local);
      return {
        diaSemana: localADiaSemana(local),
        abierto: f.abierto,
        horaApertura: f.abierto ? `${f.horaApertura}:00` : null,
        horaCierre: f.abierto ? `${f.horaCierre}:00` : null,
      };
    });
    const res = await updateHorarioEstudio(dias);
    if (!res.ok) return res.error;
    onGuardado('Horario guardado');
    return null;
  }

  return (
    <>
      <div className="space-y-4 pb-6">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setForm(horarioAForm(undefined))} className={btnSecondary}>
            Horario estándar (8:00–22:00)
          </button>
          <button type="button" onClick={() => copiar(0, [1, 2, 3, 4])} className={btnSecondary}>
            Lunes a viernes igual
          </button>
          <button type="button" onClick={() => copiar(5, [6])} className={btnSecondary}>
            Fin de semana igual
          </button>
        </div>

        <ul className="divide-y divide-border rounded-lg border border-border">
          {DIAS.map(local => {
            const f = fila(local);
            const dia = NOMBRES_DIA[local].toLowerCase();
            return (
              <li key={local} className="flex min-h-14 items-center gap-2 py-1.5 pl-3 pr-1 @sm/config:gap-3">
                <Toggle on={f.abierto} onChange={v => cambiar(local, { abierto: v })} ariaLabel={`Abierto el ${dia}`} />
                <span className="w-8 shrink-0 text-sm font-medium text-foreground @sm/config:w-[4.5rem]">
                  <span aria-hidden className="@sm/config:hidden">{DIA_CORTO[local]}</span>
                  <span className="sr-only @sm/config:not-sr-only">{NOMBRES_DIA[local]}</span>
                </span>
                {f.abierto ? (
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    <input
                      type="time" aria-label={`Abre el ${dia}`} value={f.horaApertura}
                      onChange={e => cambiar(local, { horaApertura: e.target.value })} className={INPUT_HORA}
                    />
                    <span aria-hidden className="shrink-0 text-muted-foreground">–</span>
                    <input
                      type="time" aria-label={`Cierra el ${dia}`} value={f.horaCierre}
                      onChange={e => cambiar(local, { horaCierre: e.target.value })} className={INPUT_HORA}
                    />
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 text-sm text-muted-foreground">Cerrado</span>
                )}
                <button
                  type="button"
                  onClick={() => copiar(local, DIAS.filter(l => l !== local))}
                  title={`Copiar ${dia} a todos los días`}
                  aria-label={`Copiar ${dia} a todos los días`}
                  className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Copy size={16} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <BarraGuardar
        seccion="estudio"
        cambios={formularioCambiado(form, base) ? ['Horario'] : []}
        bloqueo={bloqueo}
        onGuardar={alGuardar}
        onDescartar={() => setForm(base)}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cerrar el centro: la semana de vacaciones, el puente, la reforma.
//
// Cancela clases y alarga la caducidad de TODOS los bonos del estudio: no es un
// guardado más, así que «Guardar» pregunta antes (`confirmar`). Encima del
// formulario va la lista de los cierres puestos (`ListaCierres`).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los cierres puestos: los que vienen, y los pasados plegados. Uno que viene se
 * quita y uno en curso se reabre (lib/cierres/quitar-cierre.ts dice qué NO se
 * deshace). Nada optimista: sale de la lista cuando el servidor lo ha borrado y
 * la lista se ha vuelto a leer; si falla, lo dice y la lista sigue igual.
 */
export function ListaCierres({ cierres, clases, hoy, showToast, onQuitado }: {
  /** `undefined` = cargando; `null` = no se han podido leer. */
  cierres: readonly CierreGuardado[] | null | undefined;
  /** Clases canceladas por cierre; sin entrada = no se sabe. */
  clases: Readonly<Record<string, number | null>>;
  hoy: string | null;
  showToast: (m: string) => void;
  /** Vuelve a leer los cierres (la lista y la fila de Mi estudio). */
  onQuitado: () => Promise<void>;
}) {
  const [pidiendo, setPidiendo] = useState<CierreGuardado | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Contra el doble toque: el `disabled` llega un render tarde.
  const enVuelo = useRef(false);

  if (cierres === undefined || !hoy) {
    return <p className="mb-5 border-b border-border pb-5 text-sm text-muted-foreground">Cargando tus cierres…</p>;
  }
  if (cierres === null) {
    return (
      <p role="alert" className="mb-5 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive text-pretty">
        No hemos podido leer tus cierres. Recarga la página para verlos.
      </p>
    );
  }

  const dia = hoy;
  const { proximos, pasados } = repartirCierres(cierres, dia);
  const accion = pidiendo ? accionCierre(pidiendo, dia) : null;

  async function quitar(c: CierreGuardado) {
    const a = accionCierre(c, dia);
    if (!a || enVuelo.current) return;
    enVuelo.current = true;
    setQuitando(c.id);
    setError(null);
    try {
      const res = await fetch('/api/cierres', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ id: c.id, desde: c.desde, hasta: c.hasta }),
      });
      const data = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) {
        const motivo = (data?.error ?? 'el servidor no ha respondido').replace(/[.\s]+$/, '');
        if (res.status === 409) {
          // Ya no estaba como se veía: se relee para enseñar lo que hay de verdad.
          setError(`No se ha quitado: ${motivo}. Te enseñamos cómo están ahora.`);
          await onQuitado();
        } else {
          setError(`No se ha quitado: ${motivo[0].toLowerCase()}${motivo.slice(1)}. El cierre sigue puesto.`);
        }
        return;
      }
      await onQuitado();
      showToast(a.hecho);
    } catch {
      setError('No se ha quitado: no hemos podido hablar con el servidor. El cierre sigue puesto.');
    } finally {
      enVuelo.current = false;
      setQuitando(null);
    }
  }

  const fila = (c: CierreGuardado) => {
    const { fechas, detalle } = lineaCierre(c, dia, clases[c.id] ?? null);
    const a = accionCierre(c, dia);
    return (
      <li key={c.id} data-cierre={c.id} className="flex items-center gap-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p id={`cierre-${c.id}`} className="text-sm font-medium text-foreground">
            {fechas}
            {a?.momento === 'en_curso' && <span className="font-normal text-muted-foreground"> · cerrado ahora</span>}
          </p>
          {detalle && <p className="mt-0.5 text-[13px] text-muted-foreground text-pretty">{detalle}</p>}
        </div>
        {a && (
          <button
            type="button"
            aria-describedby={`cierre-${c.id}`}
            disabled={quitando !== null}
            onClick={() => { setError(null); setPidiendo(c); }}
            className={`${btnSecondary} shrink-0`}
          >
            {quitando === c.id ? 'Quitando…' : a.boton}
          </button>
        )}
      </li>
    );
  };

  return (
    <>
      <section aria-labelledby="cierres-que-vienen" className="mb-5 border-b border-border pb-5">
        <h3 id="cierres-que-vienen" className="text-sm font-semibold text-foreground">Cierres que vienen</h3>
        {proximos.length === 0
          ? <p className="mt-1 text-sm text-muted-foreground">No tienes ningún cierre puesto.</p>
          : <ul className="mt-1 divide-y divide-border">{proximos.map(fila)}</ul>}
        {error && (
          <p role="alert" className="mt-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive text-pretty">{error}</p>
        )}
        {pasados.length > 0 && (
          <details className="mt-2">
            <summary className="flex cursor-pointer items-center text-sm font-medium text-foreground">
              Ver cierres pasados ({pasados.length})
            </summary>
            <ul className="divide-y divide-border">{pasados.map(fila)}</ul>
          </details>
        )}
      </section>
      <ConfirmDialog
        open={!!accion}
        onOpenChange={v => { if (!v) setPidiendo(null); }}
        titulo={accion?.titulo ?? ''}
        descripcion={accion?.descripcion}
        textoConfirmar={accion?.textoConfirmar}
        onConfirm={() => { if (pidiendo) void quitar(pidiendo); }}
      />
    </>
  );
}

export function FormCerrarElCentro({ onGuardado }: PropsFormularioCajon) {
  // Cerrar pasa por `cancelarSesionPorMinimoNoAlcanzado` → `devolverBonosPorCancelacionClase`,
  // que sigue «Devolver la sesión al cancelar una clase entera» como cualquier
  // otra clase cancelada entera (#1342). Decir «se les devuelve» a secas mentía
  // a quien lo tiene apagado.
  const { studio } = useStudio();
  const devuelveSesion = studio?.cancelacionClaseDevuelveBono ?? true;
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [motivo, setMotivo] = useState('');

  const hayCambios = desde !== '' || hasta !== '' || motivo.trim() !== '';
  const rangoInvalido = !!desde && !!hasta && hasta < desde;
  const listo = !!desde && !!hasta && !rangoInvalido;
  const bloqueo = rangoInvalido ? 'La fecha de fin no puede ser anterior a la de inicio.'
    : !listo ? 'Elige el primer y el último día que cierras.' : null;
  const dias = listo ? Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 1 : 0;
  const rango = listo ? rangoDeFechas(desde, hasta) : '';

  async function aplicar(): Promise<string | null> {
    // ⚠️ Con la sesión: la ruta la lee de la cabecera (verificarSesionStaff) y
    // sin ella respondía 401 siempre.
    const res = await fetch('/api/cierres', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ desde, hasta, motivo }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return data?.error ?? 'No se ha podido cerrar el centro';
    // Hecho, aunque la respuesta no se pueda leer: no se dice que falló.
    if (!data) { onGuardado('Centro cerrado esos días'); return null; }
    const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
    const partes = [`${plural(data.dias, 'día cerrado', 'días cerrados')}`];
    if (data.clasesCanceladas) partes.push(plural(data.clasesCanceladas, 'clase cancelada', 'clases canceladas'));
    if (data.bonosAmpliados) partes.push(plural(data.bonosAmpliados, 'bono prorrogado', 'bonos prorrogados'));
    const yaProrrogados = notaDiasYaProrrogados(data.dias, data.diasYaProrrogados);
    if (yaProrrogados) partes.push(yaProrrogados);
    // Las incidencias no se esconden detrás del mensaje de éxito.
    if (data.incidencias?.length) partes.push(`con avisos: ${data.incidencias[0]}`);
    onGuardado(partes.join(' · '));
    return null;
  }

  return (
    <>
      <div className="space-y-4 pb-6">
        <h3 className="text-sm font-semibold text-foreground">Poner un cierre nuevo</h3>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Desde">
            {id => <input id={id} type="date" value={desde} onChange={e => setDesde(e.target.value)} className={inputCls} />}
          </Campo>
          <Campo label="Hasta (incluido)">
            {id => <input id={id} type="date" value={hasta} onChange={e => setHasta(e.target.value)} className={inputCls} />}
          </Campo>
        </div>
        <Campo label="Motivo (opcional)">
          {id => <input id={id} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Vacaciones de agosto" className={inputCls} />}
        </Campo>
        {listo && (
          <p className="rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground text-pretty">
            Del {rango} nadie podrá reservar. Se cancelan sus clases avisando a quien tenía reserva
            {devuelveSesion ? ', que recupera la sesión del bono' : ', sin devolverle la sesión'}, y los bonos y
            recuperaciones de todas tus alumnas duran {dias === 1 ? '1 día' : `${dias} días`} más.
            Si alguno de esos días ya lo habías cerrado antes, no se suma dos veces.
          </p>
        )}
      </div>
      <BarraGuardar
        seccion="estudio"
        cambios={hayCambios ? ['Cerrar el centro'] : []}
        bloqueo={bloqueo}
        confirmar={{
          titulo: `¿Cerrar el centro del ${rango}?`,
          descripcion: 'Se cancelan las clases de esos días y se avisa a quien tenía reserva. Esto no se deshace solo.',
          textoConfirmar: 'Sí, cerrar esos días',
        }}
        onGuardar={aplicar}
        onDescartar={() => { setDesde(''); setHasta(''); setMotivo(''); }}
      />
    </>
  );
}
