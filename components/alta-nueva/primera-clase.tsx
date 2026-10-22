'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Paso 6 del alta nueva: «Tu primera clase» (obligatorio, maqueta aprobada
// «06 · Primera clase · activación»). Un formulario deja la clase en el
// calendario y su precio a la venta, TODO A LA VEZ (`/api/alta/primera-clase`
// → RPC `alta_primera_clase`): tipo, sala, ficha de quien la da, la clase (o
// la clase semanal, sin fin) y la tarifa activa.
//
// Vive dentro de la bienvenida nueva (components/alta-nueva/bienvenida-nueva.tsx)
// y, para quien entró al panel sin crearla, sobre el Calendario
// (`/calendario?primera=1`, primera-clase-en-calendario.tsx).
//
// Lo que manda en esta pantalla:
//   · Todo viene puesto menos el precio (los valores de serie del asistente).
//     Lo que se valida y lo que se crea lo decide lib/alta/primera-clase.ts.
//   · «Esta clase es gratis» (decisión del fundador): sin tarifa y sin pagar.
//     Sin la casilla, un 0 es un error que dice qué hacer.
//   · Un precio raro AVISA y deja publicar.
//   · «Online, con tarjeta» sin Stripe lo dice ANTES de publicar (el mismo caso
//     que `avisoVentaOnline`, lib/onboarding.ts); «En el estudio» deja reservar
//     sin pagar online.
//   · Publicar enciende la carga ANTES de llamar, no deja pulsar dos veces, y
//     cualquier fallo del servidor dice qué pasó y NO avanza. El `intentoId` es
//     el mismo mientras el formulario no cambie: reintentar tras un fallo de red
//     no crea nada dos veces.
//   · Sin Tenti: la bienvenida nueva no lo lleva. Celebra en el paso 7
//     (`ListoParaReservar`), como siempre.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, Eye, Loader2, Minus, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useStudio } from '@/lib/studio-context';
import { supabase } from '@/lib/db/supabase';
import type { Studio } from '@/lib/types';
import { authHeader } from '@/lib/api-client';
import { capturarExcepcion } from '@/lib/sentry-cliente';
import { mensajeHttp } from '@/lib/errores';
import { avisoVentaOnline } from '@/lib/onboarding';
import { leerRespuestaPuedeReservar, type RespuestaPuedeReservar } from '@/lib/onboarding/puede-reservar';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { SOPORTE_WHATSAPP } from '@/lib/soporte';
import {
  DURACIONES_PRIMERA_CLASE, MAX_PLAZAS, TIPOS_PRIMERA_CLASE,
  conTipo, diasParaElegir, formInicial, infoPrecio, nombreDelDia, primerError, resumenPrimeraClase, validarPrimeraClase,
  type CampoPrimeraClase, type ContextoChoques, type FormPrimeraClase, type Venta, type YaExiste,
} from '@/lib/alta/primera-clase';
import { hoyEnEstudio, cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/tooltip';
import { DashboardSheet } from '@/components/ui/dashboard-sheet';
import { BOTON_VIVO } from '@/components/dashboard/vivo';
import { BOTON_BORDE } from '@/components/dashboard/vivo-seccion';
import { CLASE_AYUDA, CLASE_CAMPO, CLASE_ERROR, CLASE_ETIQUETA, CabeceraPaso, ErrorGuardado, LineaDePasos } from './piezas';
import { VistaPreviaClase } from './vista-previa-clase';

export interface PrimeraClasePublicada {
  clase: { nombre: string; cuando: string };
  /**
   * ¿Puede reservar ya una alumna nueva?, tal y como lo contestó el servidor al
   * publicar. `undefined` si no pudo ni preguntarlo: entonces lo vuelve a
   * preguntar el paso 7, en vez de quedarse con un «sin comprobar» mudo.
   */
  veredicto?: RespuestaPuedeReservar;
  /** El servidor ha mandado «Ya puedes recibir reservas» (sale una vez). */
  correo: boolean;
  sesiones: number;
}

/** El campo del nombre de «Yo», si su cuenta aún no lo tiene. */
type Campo = CampoPrimeraClase | 'nombrePropio';

const VENTAS: readonly { id: Venta; texto: string; etiquetaPrecio: string }[] = [
  { id: 'suelta', texto: 'Clase suelta', etiquetaPrecio: 'Precio por clase' },
  { id: 'bono', texto: 'Bono', etiquetaPrecio: 'Precio del bono' },
  { id: 'cuota', texto: 'Cuota mensual', etiquetaPrecio: 'Precio al mes' },
];

const AVISO_ONLINE_SIN_STRIPE = 'Hasta que conectes Stripe, una alumna nueva no podrá pagar online ni reservar. Te pide tus datos y una cuenta bancaria; puedes hacerlo justo después de publicar.';

/** Un id por intento de publicar. `randomUUID` solo existe en contextos seguros. */
function nuevoIntento(): string {
  try { if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID(); } catch { /* abajo */ }
  return `i-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Un grupo de opciones de un toque, como los del paso 3. */
function Segmento<T extends string | number>({ etiqueta, opciones, valor, onCambio, nombre }: {
  etiqueta: string;
  opciones: readonly { valor: T; texto: string }[];
  valor: T;
  onCambio: (v: T) => void;
  nombre?: string;
}) {
  return (
    <div role="radiogroup" aria-label={nombre ?? etiqueta} className="mt-2 inline-flex max-w-full flex-wrap gap-0.5 rounded-full bg-muted p-1">
      {opciones.map(o => {
        const activo = o.valor === valor;
        return (
          <button
            key={String(o.valor)}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onCambio(o.valor)}
            className={cn('min-h-9 rounded-full px-4 text-[14px] font-medium transition-colors', activo ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
          >
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}

function Bloque({ num, titulo, children }: { num: string; titulo: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="rounded-3xl border border-border bg-card p-4 sm:p-5">
      <h2 id={id} className="flex items-baseline gap-2.5 text-[17px] font-semibold text-foreground">
        <span className="font-mono text-[12px] text-muted-foreground">{num}</span>{titulo}
      </h2>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function PrimeraClase({ studio, onAtras, onPublicada, saliendo = false, enCalendario = false }: {
  studio: Studio;
  /** «Atrás» (en la bienvenida, a la marca; sobre el Calendario, cerrar). */
  onAtras?: () => void;
  onPublicada: (r: PrimeraClasePublicada) => void;
  saliendo?: boolean;
  /** Sobre el Calendario: sin la línea de los siete pasos. */
  enCalendario?: boolean;
}) {
  const { salas, tiposClase, instructores, sesiones, resetDatosPilates } = useStudio();
  const { user } = useAuth();
  const id = useId();
  const titulo = useRef<HTMLHeadingElement>(null);
  const hoy = useMemo(() => hoyEnEstudio(), []);
  const dias = useMemo(() => diasParaElegir(hoy), [hoy]);
  const [form, setForm] = useState<FormPrimeraClase>(() => formInicial({
    hoy, sala: salas[0]?.nombre ?? null, apertura: studio.horaApertura, cierre: studio.horaCierre,
  }));
  const nombreCuenta = ((user?.user_metadata?.nombre as string | undefined) ?? '').trim();
  const userId = user?.id ?? null;
  const fichaPropia = useMemo(() => (userId ? instructores.find(i => i.authUserId === userId) ?? null : null), [instructores, userId]);
  const [nombrePropio, setNombrePropio] = useState('');
  // «Yo» necesita un nombre para su ficha solo si no tiene ficha ni nombre en la cuenta.
  const pideNombre = form.quien === 'yo' && !fichaPropia && !nombreCuenta;
  const yo = fichaPropia?.nombre?.trim() || nombreCuenta || nombrePropio.trim();

  const [tocados, setTocados] = useState<ReadonlySet<Campo>>(new Set());
  const [intentado, setIntentado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const enviandoRef = useRef(false);
  const intento = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verVista, setVerVista] = useState(false);
  const campos = useRef<Partial<Record<Campo, HTMLElement | null>>>({});

  useEffect(() => { titulo.current?.focus(); }, []);

  // Lo que ya tiene el estudio: para decir «que ya tienes» y no «se crea», y
  // para buscar choques con sus clases antes de publicar.
  const clave = (s: string) => s.trim().toLowerCase();
  const ya: YaExiste = useMemo(() => ({
    tipos: new Set(tiposClase.filter(t => !t.archivadoEn).map(t => clave(t.nombre))),
    salas: new Set(salas.map(s => clave(s.nombre))),
    fichaPropia: !!fichaPropia,
    instructoras: new Set(instructores.filter(i => i.activo !== false).map(i => clave(i.nombre))),
  }), [tiposClase, salas, instructores, fichaPropia]);
  const choques: ContextoChoques = useMemo(() => ({
    existentes: sesiones,
    salaId: salas.find(s => clave(s.nombre) === clave(form.sala))?.id ?? null,
    instructorId: form.quien === 'yo'
      ? fichaPropia?.id ?? null
      : instructores.find(i => i.activo !== false && clave(i.nombre) === clave(form.otraPersona))?.id ?? null,
  }), [sesiones, salas, instructores, fichaPropia, form.sala, form.quien, form.otraPersona]);

  const errores = useMemo(() => validarPrimeraClase(form, new Date(), choques), [form, choques]);
  const errorNombrePropio = pideNombre && !nombrePropio.trim() ? 'Escribe tu nombre: así sale en tu ficha y en tu app.' : null;
  const ver = (c: Campo) => (intentado || tocados.has(c)
    ? (c === 'nombrePropio' ? errorNombrePropio : errores[c as CampoPrimeraClase]) ?? null
    : null);
  const precio = infoPrecio(form);
  const resumen = resumenPrimeraClase(form, yo, ya);
  const sinStripe = avisoVentaOnline({ stripeAccountId: studio.stripeAccountId, reservaExigirPlan: true, numPlanesActivos: 1 }) !== null;
  const ocupado = enviando || saliendo;
  const whatsapp = enlaceWhatsApp(SOPORTE_WHATSAPP, `Hola, soy de ${studio.nombre || 'mi estudio'} y estoy creando mi primera clase en Tentare:`);

  /** Cualquier cambio del formulario es otro intento: el que falló no se reutiliza para otra cosa. */
  function cambiar(c: Partial<FormPrimeraClase>) {
    intento.current = null;
    setError(null);
    setForm(f => ({ ...f, ...c }));
  }
  const tocar = (c: Campo) => setTocados(t => (t.has(c) ? t : new Set(t).add(c)));
  const enfocar = (c: Campo) => {
    const el = campos.current[c];
    el?.focus();
    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };

  async function publicar(e: React.FormEvent) {
    e.preventDefault();
    // El cerrojo antes que nada: un doble toque no manda dos peticiones.
    if (enviandoRef.current || saliendo) return;
    setIntentado(true);
    const primero: Campo | null = primerError(validarPrimeraClase(form, new Date(), choques)) ?? (errorNombrePropio ? 'nombrePropio' : null);
    if (primero) { enfocar(primero); return; }
    enviandoRef.current = true;
    setEnviando(true);
    setError(null);
    try {
      // Su nombre va a su CUENTA, que es de donde lo lee el servidor para su ficha.
      if (pideNombre) {
        const { error: e1 } = await supabase.auth.updateUser({ data: { nombre: nombrePropio.replace(/\s+/g, ' ').trim() } });
        if (e1) {
          capturarExcepcion(new Error(`[alta-nueva] nombre: ${e1.message}`), { tags: { area: 'onboarding' } });
          setError('No hemos podido guardar tu nombre. Vuelve a pulsar «Publicar mi primera clase».');
          return;
        }
      }
      intento.current ??= nuevoIntento();
      const res = await fetch('/api/alta/primera-clase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ intentoId: intento.current, form }),
      });
      const cuerpo = await res.json().catch(() => null) as {
        ok?: boolean; error?: string; campo?: Campo; clase?: { nombre?: string; cuando?: string }; veredicto?: unknown; correo?: boolean; sesiones?: number;
      } | null;
      if (!res.ok || !cuerpo?.ok) {
        // Todo o nada: no se ha creado nada, y se dice qué pasó. No avanza.
        setError(typeof cuerpo?.error === 'string' && cuerpo.error ? cuerpo.error : `${mensajeHttp(res.status)} No se ha creado nada.`);
        if (cuerpo?.campo && campos.current[cuerpo.campo]) enfocar(cuerpo.campo);
        return;
      }
      // Lo creó el servidor: el panel lo vuelve a leer.
      resetDatosPilates();
      const veredicto = leerRespuestaPuedeReservar(cuerpo.veredicto);
      onPublicada({
        clase: { nombre: cuerpo.clase?.nombre ?? form.nombre.trim(), cuando: cuerpo.clase?.cuando ?? '' },
        veredicto: veredicto.estado === 'SIN_COMPROBAR' && veredicto.motivo === undefined ? undefined : veredicto,
        correo: cuerpo.correo === true,
        sesiones: typeof cuerpo.sesiones === 'number' ? cuerpo.sesiones : 1,
      });
    } catch (err) {
      capturarExcepcion(err instanceof Error ? err : new Error(String(err)), { tags: { area: 'onboarding' } });
      // No se sabe si llegó: el mismo intento no crea nada dos veces.
      setError('No hemos podido hablar con el servidor. Revisa la conexión y vuelve a pulsar «Publicar mi primera clase»: si ya se había creado, no se crea dos veces.');
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }

  const etiquetaPrecio = VENTAS.find(v => v.id === form.venta)?.etiquetaPrecio ?? 'Precio';
  const textoPrecio = precio.estado === 'falta' && !intentado && !tocados.has('precio')
    ? { clase: CLASE_AYUDA, texto: 'Lo que paga la alumna. Es lo único que no ponemos por ti.' }
    : precio.estado === 'ok' || precio.estado === 'gratis'
      ? { clase: CLASE_AYUDA, texto: precio.texto }
      : precio.estado === 'raro'
        // Avisa y deja publicar: ni rojo ni bloqueo (decisión del fundador).
        ? { clase: 'mt-1 flex items-start gap-1.5 text-[13px] font-medium leading-[18px] text-foreground', texto: precio.texto, aviso: true }
        : { clase: CLASE_ERROR, texto: precio.texto };
  const falta = precio.bloquea ? (precio.estado === 'falta' ? 'Falta el precio' : 'Revisa el precio') : null;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:gap-14">
      <form noValidate onSubmit={publicar} className="min-w-0" aria-busy={enviando}>
        {!enCalendario && <LineaDePasos actual={6} />}
        <CabeceraPaso
          etiqueta={enCalendario ? 'Unos 5 minutos' : 'Paso 6 de 7 · obligatorio · unos 5 minutos'}
          titulo="Tu primera clase"
          sub="Con una clase y su precio, tus alumnas ya pueden reservar. Todo viene puesto menos el precio: eso solo lo sabes tú."
          tituloRef={titulo}
        />
        {whatsapp && (
          <p className="mt-4 rounded-2xl bg-muted px-3.5 py-2.5 text-[13.5px] leading-5 text-muted-foreground">
            ¿Te atascas? <a href={whatsapp} target="_blank" rel="noreferrer" className="font-semibold text-foreground underline underline-offset-2">Escríbenos por WhatsApp</a> y te ayuda una persona, paso a paso.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-4">
          <Bloque num="01" titulo="Qué clase">
            <Segmento
              etiqueta="Tipo de clase"
              opciones={TIPOS_PRIMERA_CLASE.map(t => ({ valor: t, texto: t }))}
              valor={form.tipo}
              onCambio={t => { intento.current = null; setError(null); setForm(f => conTipo(f, t)); }}
            />
            <div>
              <label htmlFor={`${id}-nombre`} className={CLASE_ETIQUETA}>Nombre de la clase</label>
              <input
                id={`${id}-nombre`}
                ref={el => { campos.current.nombre = el; }}
                className={cn(CLASE_CAMPO, 'mt-1.5', ver('nombre') && 'border-destructive')}
                value={form.nombre}
                maxLength={60}
                placeholder="Ej. Reformer iniciación"
                onChange={e => cambiar({ nombre: e.target.value })}
                onBlur={() => tocar('nombre')}
                aria-invalid={!!ver('nombre')}
                aria-describedby={`${id}-nombre-a`}
              />
              <p id={`${id}-nombre-a`} className={ver('nombre') ? CLASE_ERROR : CLASE_AYUDA}>
                {ver('nombre') ?? 'Así sale en tu app. Puedes añadir el nivel: «para principiantes», «intermedio».'}
              </p>
            </div>
            <div>
              <p className={CLASE_ETIQUETA} id={`${id}-dur`}>Duración</p>
              <Segmento
                etiqueta="Duración"
                opciones={DURACIONES_PRIMERA_CLASE.map(d => ({ valor: d as number, texto: `${d} min` }))}
                valor={form.duracion}
                onCambio={d => cambiar({ duracion: d })}
              />
            </div>
          </Bloque>

          <Bloque num="02" titulo="Cuándo">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={`${id}-dia`} className={CLASE_ETIQUETA}>Día</label>
                <select
                  id={`${id}-dia`}
                  ref={el => { campos.current.fecha = el; }}
                  className={cn(CLASE_CAMPO, 'mt-1.5')}
                  value={form.fecha}
                  onChange={e => cambiar({ fecha: e.target.value })}
                  aria-invalid={!!ver('fecha')}
                >
                  {dias.map(d => <option key={d.fecha} value={d.fecha}>{d.etiqueta}</option>)}
                </select>
                {ver('fecha') && <p role="alert" className={CLASE_ERROR}>{ver('fecha')}</p>}
              </div>
              <div>
                <label htmlFor={`${id}-hora`} className={CLASE_ETIQUETA}>Hora</label>
                <input
                  id={`${id}-hora`}
                  ref={el => { campos.current.hora = el; }}
                  type="time"
                  step={300}
                  className={cn(CLASE_CAMPO, 'mt-1.5 font-mono', ver('hora') && 'border-destructive')}
                  value={form.hora}
                  onChange={e => cambiar({ hora: e.target.value })}
                  onBlur={() => tocar('hora')}
                  aria-invalid={!!ver('hora')}
                />
                {ver('hora') && <p role="alert" className={CLASE_ERROR}>{ver('hora')}</p>}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.semanal}
              onClick={() => cambiar({ semanal: !form.semanal })}
              className="flex items-start gap-3 rounded-2xl px-1 py-1 text-left"
            >
              <span aria-hidden className={cn('relative mt-0.5 inline-flex h-6 w-10 shrink-0 rounded-full transition-colors', form.semanal ? 'bg-primary' : 'bg-muted-foreground/30')}>
                <span className={cn('absolute top-0.5 size-5 rounded-full bg-background shadow-sm transition-[left]', form.semanal ? 'left-[18px]' : 'left-0.5')} />
              </span>
              <span>
                <b className="block text-[14px] font-semibold text-foreground">Repetir cada semana</b>
                <span className="block text-[13px] leading-[18px] text-muted-foreground">
                  Clase semanal: cada {/^\d{4}-\d{2}-\d{2}$/.test(form.fecha) ? nombreDelDia(form.fecha) : 'semana'} a esta hora. La paras desde el calendario.
                </span>
              </span>
            </button>
          </Bloque>

          <Bloque num="03" titulo="Quién y dónde">
            <div>
              <p className={CLASE_ETIQUETA}>Quién la da</p>
              <Segmento
                etiqueta="Quién la da"
                opciones={[{ valor: 'yo', texto: yo ? `Yo (${yo})` : 'Yo' }, { valor: 'otra', texto: 'Otra persona' }] as const}
                valor={form.quien}
                onCambio={q => cambiar({ quien: q })}
              />
            </div>
            {pideNombre && (
              <div>
                <label htmlFor={`${id}-yo`} className={CLASE_ETIQUETA}>Cómo te llamas</label>
                <input
                  id={`${id}-yo`}
                  ref={el => { campos.current.nombrePropio = el; }}
                  className={cn(CLASE_CAMPO, 'mt-1.5', ver('nombrePropio') && 'border-destructive')}
                  value={nombrePropio}
                  maxLength={80}
                  autoComplete="given-name"
                  placeholder="Tu nombre"
                  onChange={e => { setError(null); setNombrePropio(e.target.value); }}
                  onBlur={() => tocar('nombrePropio')}
                  aria-invalid={!!ver('nombrePropio')}
                />
                <p className={ver('nombrePropio') ? CLASE_ERROR : CLASE_AYUDA}>{ver('nombrePropio') ?? 'Para tu ficha de instructora: así sale en tu app.'}</p>
              </div>
            )}
            {form.quien === 'otra' && (
              <div>
                <label htmlFor={`${id}-otra`} className={CLASE_ETIQUETA}>Nombre de quien la da</label>
                <input
                  id={`${id}-otra`}
                  ref={el => { campos.current.otraPersona = el; }}
                  className={cn(CLASE_CAMPO, 'mt-1.5', ver('otraPersona') && 'border-destructive')}
                  value={form.otraPersona}
                  maxLength={80}
                  placeholder="Ej. Marta"
                  onChange={e => cambiar({ otraPersona: e.target.value })}
                  onBlur={() => tocar('otraPersona')}
                  aria-invalid={!!ver('otraPersona')}
                />
                <p className={ver('otraPersona') ? CLASE_ERROR : CLASE_AYUDA}>
                  {ver('otraPersona') ?? 'Desde Equipo le pones su email y le mandas la invitación cuando quieras.'}
                </p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="flex items-center gap-1.5">
                  <label htmlFor={`${id}-sala`} className={CLASE_ETIQUETA}>Sala</label>
                  <InfoTip label="Qué es la sala">El espacio donde se da la clase. Si solo tienes uno, déjalo así.</InfoTip>
                </span>
                <input
                  id={`${id}-sala`}
                  ref={el => { campos.current.sala = el; }}
                  className={cn(CLASE_CAMPO, 'mt-1.5', ver('sala') && 'border-destructive')}
                  value={form.sala}
                  maxLength={60}
                  onChange={e => cambiar({ sala: e.target.value })}
                  onBlur={() => tocar('sala')}
                  aria-invalid={!!ver('sala')}
                />
                {ver('sala') && <p role="alert" className={CLASE_ERROR}>{ver('sala')}</p>}
              </div>
              <div>
                <span className="flex items-center gap-1.5">
                  <span className={CLASE_ETIQUETA} id={`${id}-plazas`}>Plazas</span>
                  <InfoTip label="Qué son las plazas">Cuántas alumnas caben: las máquinas o esterillas que tienes en esa sala.</InfoTip>
                </span>
                <div role="group" aria-labelledby={`${id}-plazas`} className="mt-1.5 inline-flex h-11 items-center gap-1 rounded-xl border border-input bg-card p-1">
                  <button type="button" aria-label="Una plaza menos" disabled={form.plazas <= 1} onClick={() => cambiar({ plazas: Math.max(1, form.plazas - 1) })} className="grid size-9 place-items-center rounded-lg text-foreground hover:bg-muted disabled:opacity-40">
                    <Minus size={16} aria-hidden />
                  </button>
                  <output
                    ref={el => { campos.current.plazas = el; }}
                    tabIndex={-1}
                    aria-live="polite"
                    className="min-w-10 text-center font-mono text-[15px] font-semibold text-foreground"
                    data-testid="plazas"
                  >
                    {form.plazas}
                  </output>
                  <button type="button" aria-label="Una plaza más" disabled={form.plazas >= MAX_PLAZAS} onClick={() => cambiar({ plazas: Math.min(MAX_PLAZAS, form.plazas + 1) })} className="grid size-9 place-items-center rounded-lg text-foreground hover:bg-muted disabled:opacity-40">
                    <Plus size={16} aria-hidden />
                  </button>
                </div>
                {ver('plazas') && <p role="alert" className={CLASE_ERROR}>{ver('plazas')}</p>}
              </div>
            </div>
          </Bloque>

          <Bloque num="04" titulo="Precio">
            <label className="flex items-start gap-3 text-left">
              <input
                type="checkbox"
                checked={form.gratis}
                onChange={e => cambiar({ gratis: e.target.checked })}
                className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
              />
              <span>
                <b className="block text-[14px] font-semibold text-foreground">Esta clase es gratis</b>
                <span className="block text-[13px] leading-[18px] text-muted-foreground">Tus alumnas la reservan sin pagar nada.</span>
              </span>
            </label>
            {form.gratis ? (
              <p className={CLASE_AYUDA} data-testid="mensaje-precio">{precio.texto}</p>
            ) : (
              <>
                <div>
                  <span className="flex items-center gap-1.5">
                    <span className={CLASE_ETIQUETA}>Cómo la vendes</span>
                    <InfoTip label="Cómo se vende una clase">Clase suelta: paga una clase. Bono: varias clases por adelantado. Cuota: un precio al mes.</InfoTip>
                  </span>
                  <Segmento
                    etiqueta="Cómo la vendes"
                    opciones={VENTAS.map(v => ({ valor: v.id, texto: v.texto }))}
                    valor={form.venta}
                    onCambio={v => cambiar({ venta: v })}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`${id}-precio`} className={CLASE_ETIQUETA}>{etiquetaPrecio}</label>
                    <div className="relative mt-1.5">
                      <input
                        id={`${id}-precio`}
                        ref={el => { campos.current.precio = el; }}
                        inputMode="decimal"
                        className={cn(CLASE_CAMPO, 'pr-9 text-right font-mono', precio.bloquea && (intentado || tocados.has('precio')) && 'border-destructive')}
                        value={form.precio}
                        placeholder="Ej. 20,00"
                        onChange={e => cambiar({ precio: e.target.value })}
                        onBlur={() => tocar('precio')}
                        aria-invalid={precio.bloquea && (intentado || tocados.has('precio'))}
                        aria-describedby={`${id}-precio-m`}
                      />
                      <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[15px] text-muted-foreground">€</span>
                    </div>
                  </div>
                  {form.venta === 'bono' && (
                    <div>
                      <label htmlFor={`${id}-bono`} className={CLASE_ETIQUETA}>Clases del bono</label>
                      <input
                        id={`${id}-bono`}
                        ref={el => { campos.current.bonoClases = el; }}
                        inputMode="numeric"
                        maxLength={3}
                        className={cn(CLASE_CAMPO, 'mt-1.5 font-mono', ver('bonoClases') && 'border-destructive')}
                        value={form.bonoClases}
                        onChange={e => cambiar({ bonoClases: e.target.value })}
                        onBlur={() => tocar('bonoClases')}
                        aria-invalid={!!ver('bonoClases')}
                      />
                      {ver('bonoClases') && <p role="alert" className={CLASE_ERROR}>{ver('bonoClases')}</p>}
                    </div>
                  )}
                </div>
                <p id={`${id}-precio-m`} className={textoPrecio.clase} aria-live="polite" data-testid="mensaje-precio" data-estado={precio.estado}>
                  {'aviso' in textoPrecio && <AlertTriangle size={14} className="mt-[2px] shrink-0 text-warning" aria-hidden />}
                  {textoPrecio.texto}
                </p>

                <div>
                  <p className={CLASE_ETIQUETA} id={`${id}-cobro`}>¿Cómo te pagan?</p>
                  <div role="radiogroup" aria-labelledby={`${id}-cobro`} className="mt-2 grid gap-2 sm:grid-cols-2">
                    {([
                      ['estudio', 'En el estudio', 'Reservan desde tu app y te pagan al llegar: efectivo, Bizum o datáfono.'],
                      ['online', 'Online, con tarjeta', 'Pagan al reservar. Necesita conectar Stripe.'],
                    ] as const).map(([valor, texto, d]) => {
                      const activo = form.cobro === valor;
                      return (
                        <button
                          key={valor}
                          type="button"
                          role="radio"
                          aria-checked={activo}
                          onClick={() => cambiar({ cobro: valor })}
                          className={cn('grid gap-0.5 rounded-2xl px-3.5 py-3 text-left transition-colors', activo ? 'bg-card ring-2 ring-inset ring-foreground' : 'ring-1 ring-inset ring-input hover:bg-muted')}
                        >
                          <b className="text-[14px] font-semibold leading-5 text-foreground">{texto}</b>
                          <span className="text-[13px] leading-[18px] text-muted-foreground">{d}</span>
                        </button>
                      );
                    })}
                  </div>
                  {form.cobro === 'online' && sinStripe && (
                    <p role="note" className="mt-3 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-[13px] leading-snug text-foreground" data-testid="aviso-online-sin-stripe">
                      <AlertTriangle size={15} className="mt-[1px] shrink-0 text-warning" aria-hidden />
                      <span>{AVISO_ONLINE_SIN_STRIPE}</span>
                    </p>
                  )}
                </div>
              </>
            )}
          </Bloque>
        </div>

        <div className="mt-5 rounded-3xl bg-muted/70 p-4 sm:p-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Al publicar se crea, todo a la vez</p>
          <ul className="mt-2.5 grid gap-1.5" data-testid="resumen-primera-clase">
            {resumen.map(l => (
              <li key={l} className="flex items-start gap-2 text-[13.5px] leading-5 text-foreground">
                <Check size={15} className="mt-[2px] shrink-0 text-success" aria-hidden />{l}
              </li>
            ))}
          </ul>
        </div>

        <ErrorGuardado mensaje={error} />

        {/* Abajo, y fija en el móvil: Atrás · Vista previa · Publicar. */}
        <div className="sticky bottom-0 z-10 -mx-5 mt-8 flex items-center gap-2 border-t border-border bg-background/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-5 sm:backdrop-blur-none">
          {onAtras && (
            <button type="button" onClick={onAtras} disabled={ocupado} className="hidden min-h-11 items-center gap-1.5 rounded-full px-2.5 text-[14px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50 sm:inline-flex">
              <ArrowLeft size={16} aria-hidden /> {enCalendario ? 'Cerrar' : 'Atrás'}
            </button>
          )}
          <button type="button" onClick={() => setVerVista(true)} className={cn(BOTON_BORDE, 'h-11 shrink-0 px-3.5 lg:hidden')}>
            <Eye size={15} aria-hidden /> Vista previa
          </button>
          <div className="ml-auto flex min-w-0 items-center gap-2.5">
            {falta && <span className="hidden text-[13px] font-medium text-muted-foreground sm:inline">{falta}</span>}
            <button type="submit" disabled={ocupado} className={cn(BOTON_VIVO, 'h-11 min-w-0 px-5 text-[15px] disabled:opacity-70')}>
              {enviando
                ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Publicando…</>
                : 'Publicar mi primera clase'}
            </button>
          </div>
        </div>
      </form>

      <aside aria-label="Así la verá tu alumna" className="hidden min-w-0 flex-col gap-4 self-start rounded-3xl bg-muted/70 p-8 lg:sticky lg:top-6 lg:flex">
        <p className="text-center text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Así la verá tu alumna · en vivo</p>
        <VistaPreviaClase studio={studio} form={form} instructora={form.quien === 'yo' ? yo : form.otraPersona} />
        <p className="text-center text-[12.5px] text-muted-foreground">Tu clase antes de publicarla: nombre, hora, plazas y precio como los verá tu alumna en la app.</p>
      </aside>

      <DashboardSheet
        open={verVista}
        onClose={() => setVerVista(false)}
        label="Así la verá tu alumna"
        sheetClassName="flex max-h-[96dvh] w-full max-w-sm flex-col gap-3 overflow-y-auto rounded-3xl bg-card p-4"
      >
        <div className="flex w-full items-center justify-between">
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Así la verá tu alumna</p>
          <button type="button" onClick={() => setVerVista(false)} className={cn(BOTON_BORDE, 'h-9 px-3')}>Cerrar</button>
        </div>
        <VistaPreviaClase studio={studio} form={form} instructora={form.quien === 'yo' ? yo : form.otraPersona} />
      </DashboardSheet>
    </div>
  );
}
