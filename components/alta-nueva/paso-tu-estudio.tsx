'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Paso 3 del alta nueva, «Tu estudio», en dos pantallas (maqueta del 21-oct-2026,
// §03 «Configuración rápida»):
//
//   3 · 1 de 2  «Dónde está»: cómo te llamas, dirección, código postal (la
//               provincia sale sola), ciudad, la zona horaria a la vista y
//               «¿Tienes varias sedes?».
//   3 · 2 de 2  «Cuándo abre»: la franja de un toque (u «Otro horario») y los
//               días, con la semana dibujada al lado.
//
// Cada pantalla guarda al pulsar «Siguiente» y comprueba cada resultado: si algo
// falla, lo dice y NO avanza. Su nombre va a `auth.users` (user_metadata); lo
// demás, en UNA actualización de `studios` con columnas que el navegador ya
// puede escribir, más el horario por día de Configuración (`studio_horario`).
// La regla de qué se guarda y cómo vive en lib/alta/tu-estudio.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useRef, useState } from 'react';
import { FileText, MapPin, Store } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useStudio } from '@/lib/studio-context';
import { supabase } from '@/lib/db/supabase';
import type { Studio } from '@/lib/types';
import { capturarExcepcion } from '@/lib/sentry-cliente';
import { apuntarTuEstudio } from '@/lib/alta/embudo-cliente';
import {
  DIAS_ALTA, HORARIOS_ALTA, HORARIO_POR_DEFECTO, PRECIO_CADENA_MES, TOTALES_SEDES,
  aHoraCorta, diasDe, erroresCuando, erroresDonde, etiquetaCuando, etiquetaDonde, filasHorario, franjaDe, horarioGuardado,
  horarioIdDe, limpiarDonde, lineaDireccion, onbCentrosDe, otrasSedes, posicionEnLaSemana, restoDeSedes, textoProvincia,
  tituloDonde, aHoraBd,
  type DatosDonde, type HorarioId, type Sedes, type TotalSedes,
} from '@/lib/alta/tu-estudio';
import { cn } from '@/lib/utils';
import { ZonaHorariaFija } from './zona-horaria-fija';
import {
  AtajoPrimeraClase, CLASE_AYUDA, CLASE_CAMPO, CLASE_ERROR, CLASE_ETIQUETA, CabeceraPaso, ErrorGuardado, LineaDePasos, NavPaso,
} from './piezas';

const MENSAJE_RED = 'No hemos podido guardarlo. Revisa la conexión y vuelve a pulsar «Siguiente».';

function iniciales(nombre: string): string {
  const palabras = (nombre.trim() || 'Tu estudio').split(/\s+/).filter(w => !/^(de|del|la|el|los|las|y)$/i.test(w));
  return ((palabras[0]?.charAt(0) ?? 'T') + (palabras[1]?.charAt(0) ?? '')).toUpperCase();
}

// ── 3 · 1 de 2 · Dónde está ──────────────────────────────────────────────────

export function PasoDonde({ studio, sedes, onSedes, onListo, onSaltar, saliendo }: {
  studio: Studio;
  sedes: Sedes;
  onSedes: (s: Sedes) => void;
  onListo: () => void;
  onSaltar: () => void;
  saliendo: boolean;
}) {
  const { user } = useAuth();
  const { updateStudio } = useStudio();
  const nombreGuardado = ((user?.user_metadata?.nombre as string | undefined) ?? '').trim();
  const [datos, setDatos] = useState<DatosDonde>(() => ({
    nombre: nombreGuardado, direccion: studio.direccion ?? '', codigoPostal: studio.codigoPostal ?? '', ciudad: studio.ciudad ?? '',
  }));
  const [tocado, setTocado] = useState<Partial<Record<keyof DatosDonde, boolean>>>({});
  const [intentado, setIntentado] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => { titulo.current?.focus(); }, []);

  // El nombre llega con la sesión: si aún no estaba al montar, se rellena sin pisar lo escrito.
  const [nombreVisto, setNombreVisto] = useState(nombreGuardado);
  if (nombreGuardado !== nombreVisto) {
    setNombreVisto(nombreGuardado);
    if (!datos.nombre) setDatos(d => ({ ...d, nombre: nombreGuardado }));
  }

  const errores = erroresDonde(datos);
  const ver = (k: keyof DatosDonde) => (intentado || tocado[k] ? errores[k] : undefined);
  const campo = (k: keyof DatosDonde) => ({
    value: datos[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDatos(d => ({ ...d, [k]: e.target.value })),
    onBlur: () => setTocado(t => ({ ...t, [k]: true })),
    'aria-invalid': !!ver(k),
    'aria-describedby': ver(k) ? `${id}-${k}-e` : undefined,
  });

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (trabajando || saliendo) return;
    setIntentado(true);
    const limpio = limpiarDonde(datos);
    const faltan = erroresDonde(limpio);
    const primero = (['nombre', 'direccion', 'codigoPostal', 'ciudad'] as const).find(k => faltan[k]);
    if (primero) { document.getElementById(`${id}-${primero}`)?.focus(); return; }
    setTrabajando(true);
    setError(null);
    try {
      // Su nombre: en su cuenta (user_metadata), que es de donde lo leen el saludo y Mi perfil.
      if (limpio.nombre !== nombreGuardado) {
        const { error: e1 } = await supabase.auth.updateUser({ data: { nombre: limpio.nombre } });
        if (e1) {
          capturarExcepcion(new Error(`[alta-nueva] nombre: ${e1.message}`), { tags: { area: 'onboarding' } });
          setError('No hemos podido guardar tu nombre. Vuelve a pulsar «Siguiente».');
          return;
        }
      }
      // Dirección y sedes: una sola actualización de `studios`, con su fila contada.
      const res = await updateStudio({
        direccion: limpio.direccion, codigoPostal: limpio.codigoPostal, ciudad: limpio.ciudad, onbCentros: onbCentrosDe(sedes),
      });
      if (!res.ok) {
        setError(`No hemos podido guardar la dirección. ${res.error}`);
        return;
      }
      setDatos(limpio);
      onListo();
    } catch (err) {
      capturarExcepcion(err instanceof Error ? err : new Error(String(err)), { tags: { area: 'onboarding' } });
      setError(MENSAJE_RED);
    } finally {
      setTrabajando(false);
    }
  }

  const vista = lineaDireccion(datos.ciudad, datos.direccion);
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,500px)_minmax(0,1fr)] lg:gap-14">
      <form noValidate onSubmit={guardar} className="min-w-0">
        <LineaDePasos actual={3} />
        <CabeceraPaso
          etiqueta={etiquetaDonde(sedes)}
          titulo={tituloDonde(sedes)}
          sub="Lo verán tus alumnas en tu página de reservas. Lo demás ya viene puesto."
          tituloRef={titulo}
        />

        <div className="mt-6 flex flex-col gap-5">
          <div>
            <label htmlFor={`${id}-nombre`} className={CLASE_ETIQUETA}>Cómo te llamas</label>
            <input id={`${id}-nombre`} className={cn(CLASE_CAMPO, 'mt-1.5')} autoComplete="given-name" placeholder="Tu nombre" maxLength={80} {...campo('nombre')} />
            {ver('nombre')
              ? <p id={`${id}-nombre-e`} className={CLASE_ERROR}>{ver('nombre')}</p>
              : <p className={CLASE_AYUDA}>Para saludarte y para tu perfil.</p>}
          </div>
          <div>
            <label htmlFor={`${id}-direccion`} className={CLASE_ETIQUETA}>Dirección</label>
            <input id={`${id}-direccion`} className={cn(CLASE_CAMPO, 'mt-1.5')} autoComplete="address-line1" placeholder="Calle y número" maxLength={200} {...campo('direccion')} />
            {ver('direccion') && <p id={`${id}-direccion-e`} className={CLASE_ERROR}>{ver('direccion')}</p>}
          </div>
          <div className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-3">
            <div>
              <label htmlFor={`${id}-codigoPostal`} className={CLASE_ETIQUETA}>Código postal</label>
              <input id={`${id}-codigoPostal`} className={cn(CLASE_CAMPO, 'mt-1.5 font-mono')} autoComplete="postal-code" inputMode="numeric" maxLength={5} placeholder="28003" {...campo('codigoPostal')} />
            </div>
            <div>
              <label htmlFor={`${id}-ciudad`} className={CLASE_ETIQUETA}>Ciudad</label>
              <input id={`${id}-ciudad`} className={cn(CLASE_CAMPO, 'mt-1.5')} autoComplete="address-level2" placeholder="Madrid" maxLength={100} {...campo('ciudad')} />
            </div>
          </div>
          <div className="-mt-3">
            {ver('codigoPostal') && <p id={`${id}-codigoPostal-e`} className={CLASE_ERROR}>{ver('codigoPostal')}</p>}
            {ver('ciudad') && <p id={`${id}-ciudad-e`} className={CLASE_ERROR}>{ver('ciudad')}</p>}
            <p className={cn(CLASE_AYUDA, 'flex items-center gap-1.5')} data-testid="provincia">
              <MapPin size={14} aria-hidden /> {textoProvincia(datos.codigoPostal)}
            </p>
          </div>
          <ZonaHorariaFija codigoPostal={datos.codigoPostal} />

          <PreguntaSedes sedes={sedes} onSedes={onSedes} />

          <p className="flex items-center gap-2 text-[13px] leading-[18px] text-muted-foreground">
            <FileText size={14} aria-hidden /> Razón social y NIF, más tarde: no hacen falta para recibir reservas.
          </p>
        </div>

        <ErrorGuardado mensaje={error} />
        <NavPaso trabajando={trabajando || saliendo} />
        <AtajoPrimeraClase onSaltar={onSaltar} disabled={trabajando || saliendo} />
      </form>

      <aside aria-label="Así te verán tus alumnas" className="flex min-w-0 flex-col items-center gap-5 self-start rounded-3xl bg-muted/70 p-6 text-center lg:min-h-[560px] lg:justify-center lg:p-8">
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Así te verán tus alumnas</p>
        <div className="w-full max-w-[300px] rounded-2xl border border-border bg-card p-4 text-left shadow-xs" aria-hidden>
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground text-[14px] font-bold text-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {studio.logoUrl ? <img src={studio.logoUrl} alt="" className="size-full bg-card object-contain" /> : iniciales(studio.nombre)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-foreground">{studio.nombre || 'Tu estudio'}</p>
              <p className="truncate text-[12px] text-muted-foreground">{vista || 'Tu dirección'}</p>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-dashed border-border px-3 py-6 text-center text-[12.5px] text-muted-foreground">
            Aquí saldrán tus clases
          </div>
        </div>
        <p className="max-w-[300px] text-[12.5px] leading-[18px] text-muted-foreground">Tu página de reservas pone «ciudad · dirección» bajo tu nombre.</p>
        {sedes.tipo === 'varias' && <DibujoSedes total={sedes.total} />}
      </aside>
    </div>
  );
}

function PreguntaSedes({ sedes, onSedes }: { sedes: Sedes; onSedes: (s: Sedes) => void }) {
  const id = useId();
  const total: TotalSedes = sedes.tipo === 'varias' ? sedes.total : 3;
  return (
    <fieldset className="min-w-0">
      <legend className={CLASE_ETIQUETA}>¿Tienes varias sedes?</legend>
      <div role="radiogroup" aria-label="¿Tienes varias sedes?" className="mt-2 inline-flex flex-wrap gap-0.5 rounded-full bg-muted p-1">
        {([['una', 'Solo esta'], ['varias', 'Varias']] as const).map(([tipo, texto]) => {
          const activo = sedes.tipo === tipo;
          return (
            <button
              key={tipo}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => onSedes(tipo === 'una' ? { tipo: 'una' } : { tipo: 'varias', total })}
              className={cn('min-h-9 rounded-full px-4 text-[14px] font-medium transition-colors', activo ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {texto}
            </button>
          );
        })}
      </div>
      {sedes.tipo === 'varias' && (
        <div className="mt-3.5 grid gap-3 rounded-2xl border border-border bg-card p-4" data-testid="bloque-sedes">
          <div>
            <p id={`${id}-n`} className="text-[13px] font-semibold text-foreground">¿Cuántas en total?</p>
            <div role="radiogroup" aria-labelledby={`${id}-n`} className="mt-2 flex flex-wrap gap-2">
              {TOTALES_SEDES.map(n => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={sedes.total === n}
                  onClick={() => onSedes({ tipo: 'varias', total: n })}
                  className={cn(
                    'min-h-9 rounded-full px-4 text-[14px] font-medium transition-colors',
                    sedes.total === n ? 'bg-foreground text-background' : 'border border-input text-foreground hover:bg-muted',
                  )}
                >
                  {n >= 5 ? '5 o más' : n}
                </button>
              ))}
            </div>
          </div>
          <ul className="grid gap-2.5 text-[13.5px] leading-5 text-muted-foreground">
            <li><b className="font-semibold text-foreground">Ahora montamos la primera</b>, entera y gratis, como cualquier estudio.</li>
            <li>
              <b className="font-semibold text-foreground">Las otras {otrasSedes(sedes.total)}</b> se abren desde este mismo panel con el plan
              Cadena: {PRECIO_CADENA_MES}{'\u00a0'}€/mes, una sola suscripción para toda la cadena. No hace falta decidirlo hoy.
            </li>
            <li>
              <b className="font-semibold text-foreground">El menú es el de toda la cadena</b>; el horario y las reglas de reserva, los de
              cada sede. Cambias de sede arriba del todo del menú.
            </li>
          </ul>
        </div>
      )}
    </fieldset>
  );
}

function DibujoSedes({ total }: { total: TotalSedes }) {
  const resto = restoDeSedes(total);
  const fila = (texto: React.ReactNode, precio: string, luego: boolean) => (
    <div className={cn('flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2 text-[13px]', luego ? 'border-dashed border-border text-muted-foreground' : 'border-border text-foreground')}>
      <Store size={15} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{texto}</span>
      <span className="font-mono text-[11.5px] text-muted-foreground">{precio}</span>
    </div>
  );
  return (
    <div className="grid w-full max-w-[300px] gap-2 text-left" aria-label="Tus sedes" data-testid="dibujo-sedes">
      {fila(<><b className="font-semibold">Sede 1</b> · la que montas ahora</>, 'Gratis', false)}
      {fila('Sede 2', 'Con Cadena', true)}
      {resto && fila(resto, 'Con Cadena', true)}
    </div>
  );
}

// ── 3 · 2 de 2 · Cuándo abre ─────────────────────────────────────────────────

export function PasoCuando({ studio, sedes, onAtras, onListo, onSaltar, saliendo }: {
  studio: Studio;
  sedes: Sedes;
  onAtras: () => void;
  onListo: () => void;
  onSaltar: () => void;
  saliendo: boolean;
}) {
  const { updateStudio, updateHorarioEstudio } = useStudio();
  const yaGuardado = horarioGuardado(studio.horarioSemana);
  // Sin horario por día guardado, las horas de `studios` son las de serie de la
  // columna (08:00-22:00), no una elección suya: se propone «Mañana y tarde».
  const [horario, setHorario] = useState<HorarioId>(() => (yaGuardado ? horarioIdDe(studio.horaApertura, studio.horaCierre) : HORARIO_POR_DEFECTO));
  const [otro, setOtro] = useState(() => ({
    apertura: aHoraCorta(studio.horaApertura) || '08:00', cierre: aHoraCorta(studio.horaCierre) || '21:00',
  }));
  const [dias, setDias] = useState<boolean[]>(() => diasDe(studio.horarioSemana));
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => { titulo.current?.focus(); }, []);

  const errores = erroresCuando(horario, otro, dias);
  const franja = franjaDe(horario, otro);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (trabajando || saliendo || !franja || errores.dias) return;
    setTrabajando(true);
    setError(null);
    try {
      const res = await updateStudio({ horaApertura: aHoraBd(franja.apertura), horaCierre: aHoraBd(franja.cierre) });
      if (!res.ok) { setError(`No hemos podido guardar el horario. ${res.error}`); return; }
      const porDia = await updateHorarioEstudio(filasHorario(dias, franja.apertura, franja.cierre));
      if (!porDia.ok) { setError(`No hemos podido guardar los días que abres. ${porDia.error}`); return; }
      // «Tu estudio» está guardado: que lo apunte el embudo (el servidor lo comprueba).
      apuntarTuEstudio();
      onListo();
    } catch (err) {
      capturarExcepcion(err instanceof Error ? err : new Error(String(err)), { tags: { area: 'onboarding' } });
      setError(MENSAJE_RED);
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,500px)_minmax(0,1fr)] lg:gap-14">
      <form noValidate onSubmit={guardar} className="min-w-0">
        <LineaDePasos actual={3} />
        <CabeceraPaso
          etiqueta={etiquetaCuando(sedes)}
          titulo="Cuándo abre tu estudio"
          sub="Es la franja que enseña tu calendario. La afinas por día cuando quieras, en Configuración."
          tituloRef={titulo}
        />

        <div className="mt-6 flex flex-col gap-6">
          <fieldset className="min-w-0">
            <legend className={CLASE_ETIQUETA}>Horario</legend>
            <div role="radiogroup" aria-label="Horario" className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {[...HORARIOS_ALTA.map(h => ({ id: h.id as HorarioId, nombre: h.nombre, detalle: `${h.apertura} – ${h.cierre}` })),
                { id: 'otro' as HorarioId, nombre: 'Otro horario', detalle: 'Lo eliges tú' }].map(o => {
                const activo = horario === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    onClick={() => setHorario(o.id)}
                    className={cn(
                      'grid gap-0.5 rounded-2xl px-3.5 py-3 text-left transition-colors',
                      activo ? 'bg-card ring-2 ring-inset ring-foreground' : 'ring-1 ring-inset ring-input hover:bg-muted',
                    )}
                  >
                    <b className="text-[14px] font-semibold leading-5 text-foreground">{o.nombre}</b>
                    <span className="font-mono text-[13px] leading-[18px] text-muted-foreground">{o.detalle}</span>
                  </button>
                );
              })}
            </div>
            {horario === 'otro' && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${id}-ap`} className={CLASE_ETIQUETA}>Abre a las</label>
                  <input id={`${id}-ap`} type="time" step={900} className={cn(CLASE_CAMPO, 'mt-1.5 font-mono')} value={otro.apertura}
                    onChange={e => setOtro(o => ({ ...o, apertura: e.target.value }))} />
                </div>
                <div>
                  <label htmlFor={`${id}-ci`} className={CLASE_ETIQUETA}>Cierra a las</label>
                  <input id={`${id}-ci`} type="time" step={900} className={cn(CLASE_CAMPO, 'mt-1.5 font-mono')} value={otro.cierre}
                    onChange={e => setOtro(o => ({ ...o, cierre: e.target.value }))} />
                </div>
              </div>
            )}
            {errores.horario && <p role="alert" className={cn(CLASE_ERROR, 'mt-2')}>{errores.horario}</p>}
          </fieldset>

          <fieldset className="min-w-0">
            <legend className={CLASE_ETIQUETA}>Días que abres</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {DIAS_ALTA.map((d, i) => (
                <button
                  key={d.letra}
                  type="button"
                  aria-pressed={dias[i]}
                  aria-label={d.nombre}
                  onClick={() => setDias(prev => prev.map((v, j) => (j === i ? !v : v)))}
                  className={cn(
                    'grid size-10 place-items-center rounded-full font-mono text-[14px] font-medium transition-colors',
                    dias[i] ? 'bg-foreground text-background' : 'ring-1 ring-inset ring-input text-foreground hover:bg-muted',
                  )}
                >
                  {d.letra}
                </button>
              ))}
            </div>
            {errores.dias && <p role="alert" className={cn(CLASE_ERROR, 'mt-2')}>{errores.dias}</p>}
          </fieldset>

          {/* En el móvil la semana va aquí; en escritorio, a la derecha. */}
          <div className="grid justify-items-center gap-2 lg:hidden">
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Así se verá tu semana</p>
            <SemanaDibujada franja={franja} dias={dias} />
          </div>
        </div>

        <ErrorGuardado mensaje={error} />
        <NavPaso onAtras={onAtras} trabajando={trabajando || saliendo} />
        <AtajoPrimeraClase onSaltar={onSaltar} disabled={trabajando || saliendo} />
      </form>

      <aside aria-label="Así se verá tu semana" className="hidden min-w-0 flex-col items-center justify-center gap-5 self-start rounded-3xl bg-muted/70 p-8 text-center lg:flex lg:min-h-[560px]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Así se verá tu semana</p>
        <SemanaDibujada franja={franja} dias={dias} />
        <p className="max-w-[340px] text-[12.5px] leading-[18px] text-muted-foreground">Las líneas punteadas son huecos libres. La primera clase la creas en el paso 6.</p>
      </aside>
    </div>
  );
}

/** La semana: un tramo punteado de la apertura al cierre en cada día que abre. */
function SemanaDibujada({ franja, dias }: { franja: { apertura: string; cierre: string } | null; dias: readonly boolean[] }) {
  const n = dias.filter(Boolean).length;
  const ejes = ['06:00', '12:00', '18:00', '23:00'];
  return (
    <div className="w-full max-w-[440px] rounded-[20px] border border-border bg-card px-[18px] pb-3 pt-[18px] text-left shadow-xs" aria-hidden data-testid="semana-dibujada">
      <div className="mb-1.5 grid grid-cols-[44px_1fr]">
        <span />
        <div className="relative h-3.5">
          {ejes.map((h, i) => (
            <span
              key={h}
              className="absolute whitespace-nowrap font-mono text-[10.5px] leading-[14px] text-muted-foreground"
              style={{ left: `${posicionEnLaSemana(h)}%`, transform: i === 0 ? 'none' : i === ejes.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}
            >
              {h}
            </span>
          ))}
        </div>
      </div>
      {DIAS_ALTA.map((d, i) => (
        <div key={d.corto} className="grid h-[30px] grid-cols-[44px_1fr] items-center">
          <span className={cn('font-mono text-[11px] font-medium tracking-wider', dias[i] && franja ? 'text-muted-foreground' : 'text-muted-foreground/50')}>{d.corto}</span>
          {dias[i] && franja ? (
            <div className="relative h-[30px]">
              <span
                className="absolute top-[14px] border-t-[1.5px] border-dashed border-muted-foreground transition-[left,width] duration-300"
                style={{ left: `${posicionEnLaSemana(franja.apertura)}%`, width: `${posicionEnLaSemana(franja.cierre) - posicionEnLaSemana(franja.apertura)}%` }}
              >
                <span className="absolute -left-[3px] -top-[4.5px] size-[7px] rounded-full bg-foreground" />
                <span className="absolute -right-[3px] -top-[4.5px] size-[7px] rounded-full bg-foreground" />
              </span>
            </div>
          ) : (
            <span className="font-mono text-[12px] text-muted-foreground">{dias[i] ? '—' : 'Cerrado'}</span>
          )}
        </div>
      ))}
      <div className="mt-2 flex justify-between border-t border-border pt-2.5 font-mono text-[12px] leading-4 text-muted-foreground">
        <span>{franja ? `${franja.apertura} – ${franja.cierre}` : 'Revisa las horas'}</span>
        <span>{n} {n === 1 ? 'día abierto' : 'días abiertos'}</span>
      </div>
    </div>
  );
}

