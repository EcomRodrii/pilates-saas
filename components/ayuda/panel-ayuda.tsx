'use client';

// ─────────────────────────────────────────────────────────────────────────────
// El panel del botón de ayuda de la esquina: cinco pestañas (Inicio, Tentare, Novedades,
// Mensajes, Ayuda), como el de Momence pero con lo que Tentare ya tiene. «Tentare» es el
// asistente, con su chat dentro, y solo sale si el estudio y el rol lo tienen. No hay
// contenido nuevo: guías del centro de ayuda, el registro de actualizaciones,
// `soporte_solicitudes` y el WhatsApp de soporte (la maqueta aprobada el
// 10-nov-2026).
//
// Llega con `dynamic()` desde `ayuda-del-panel.tsx`: nada de esto viaja en el
// chunk de cada pantalla hasta que alguien abre la ayuda.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  ArrowUp, ArrowUpRight, BookOpen, ChevronRight, CircleHelp, Home, Megaphone, MessageSquare, Search, Send, X,
} from 'lucide-react';
import { supabase } from '@/lib/db/supabase';
import { useCore } from '@/lib/core-context';
import { useRol } from '@/lib/permisos';
import { puedeVerSolicitudesSoporte } from '@/lib/permisos-reglas';
import { useAuth } from '@/lib/auth-context';
import { TentiIcono } from '@/components/tenti/tenti-icono';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { SOPORTE_WHATSAPP } from '@/lib/soporte';
import { cn } from '@/lib/utils';
import { WhatsAppIcon } from '@/components/icons/brand-icons';
import { CATEGORIAS, articulosPublicadosDe, urlArticulo } from '@/lib/ayuda/registro';
import { buscarArticulos } from '@/lib/ayuda/busqueda';
import { enviarMensajeSoporte } from '@/lib/ayuda/enviar-soporte';
import { filtroDeEtiqueta, type CambioVersion } from '@/lib/actualizaciones/version';
import type { TipoSoporte } from '@/lib/types';
import {
  ETIQUETA_TIPO_SOPORTE, PREGUNTAS_DE_EJEMPLO, etiquetaTipoSoporte, extractoMensaje, guiasParaInicio,
  ordenarVersiones, pestanasVisibles, type PestanaAyuda, type VersionResumen,
} from '@/lib/ayuda/panel-ayuda';

// El chat llega con su propio chunk, al abrir la pestaña.
const PestanaTentare = dynamic(() => import('./pestana-tentare').then(m => m.PestanaTentare), {
  ssr: false,
  loading: () => <div aria-hidden className="m-4 h-40 animate-pulse rounded-2xl bg-muted" />,
});

const PESTANA: Record<PestanaAyuda, { titulo: string; Icono: typeof Home }> = {
  inicio: { titulo: 'Inicio', Icono: Home },
  tentare: { titulo: 'Tentare', Icono: Home }, // el icono es Tenti: se pinta aparte
  novedades: { titulo: 'Novedades', Icono: Megaphone },
  mensajes: { titulo: 'Mensajes', Icono: MessageSquare },
  ayuda: { titulo: 'Ayuda', Icono: CircleHelp },
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fecha(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${Number(d)} ${MESES[Number(m) - 1] ?? ''} ${a}`;
}

const FILA = 'flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:bg-muted';
const TARJETA = 'overflow-hidden rounded-2xl border border-border bg-card';
const ETIQUETA = 'px-1 text-[11.5px] font-bold uppercase tracking-[0.07em] text-muted-foreground';

export function PanelAyuda({ ruta, pestana, conTentare, onPestana, onCerrar, onNovedadVista }: {
  ruta: string;
  pestana: PestanaAyuda;
  /** El asistente está disponible para este estudio y este rol: sale la pestaña «Tentare». */
  conTentare: boolean;
  onPestana: (p: PestanaAyuda) => void;
  onCerrar: () => void;
  /** La última versión que se acaba de enseñar: el botón apaga su punto. */
  onNovedadVista: (version: string) => void;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => { raiz.current?.focus(); }, []);
  // La pregunta escrita en Inicio viaja al chat y se consume al montarlo.
  const [pregunta, setPregunta] = useState<string | null>(null);
  const consumida = useCallback(() => setPregunta(null), []);
  const preguntar = (texto: string) => { setPregunta(texto); onPestana('tentare'); };
  const pestanas = pestanasVisibles(conTentare);
  // Sin asistente, un enlace a la pestaña «Tentare» cae en Inicio.
  const actual: PestanaAyuda = pestanas.includes(pestana) ? pestana : 'inicio';

  return (
    <div
      ref={raiz}
      role="dialog"
      aria-label="Ayuda de Tentare"
      tabIndex={-1}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onCerrar(); } }}
      data-panel-ayuda=""
      className="fixed inset-x-3 bottom-[calc(8.5rem+env(safe-area-inset-bottom,0px))] z-50 flex h-[min(640px,calc(100dvh-11rem))] flex-col overflow-hidden rounded-[24px] border border-border bg-card text-foreground shadow-2xl outline-none sm:inset-x-auto sm:right-4 sm:w-[400px] lg:bottom-[6rem] lg:right-6"
    >
      <button
        type="button"
        onClick={onCerrar}
        aria-label="Cerrar la ayuda"
        className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X size={16} aria-hidden />
      </button>

      <div role="tabpanel" id="ayuda-panel" aria-labelledby={`ayuda-pestana-${actual}`} className={cn('min-h-0 flex-1', actual === 'tentare' ? 'overflow-hidden' : 'overflow-y-auto')}>
        {actual === 'inicio' && <Inicio ruta={ruta} conTentare={conTentare} onPestana={onPestana} onPreguntar={preguntar} />}
        {actual === 'tentare' && <PestanaTentare pregunta={pregunta} onConsumida={consumida} onCerrar={onCerrar} />}
        {actual === 'novedades' && <Novedades onCerrar={onCerrar} onNovedadVista={onNovedadVista} />}
        {actual === 'mensajes' && <Mensajes />}
        {actual === 'ayuda' && <Categorias />}
      </div>

      <div role="tablist" aria-label="Secciones de la ayuda" className="flex border-t border-border bg-card">
        {pestanas.map(p => {
          const { titulo, Icono } = PESTANA[p];
          const activa = p === actual;
          return (
            <button
              key={p}
              id={`ayuda-pestana-${p}`}
              role="tab"
              type="button"
              aria-selected={activa}
              aria-controls="ayuda-panel"
              onClick={() => onPestana(p)}
              className={cn(
                'relative flex flex-1 flex-col items-center gap-0.5 pb-2.5 pt-2 text-[11.5px] transition-colors',
                activa ? 'font-bold text-foreground' : 'font-medium text-muted-foreground hover:text-foreground',
              )}
            >
              {activa && <span aria-hidden className="absolute inset-x-[28%] -top-px h-0.5 rounded-full" style={{ backgroundColor: 'var(--t-magenta-500)' }} />}
              {p === 'tentare' ? <TentiIcono ancho={22} /> : <Icono size={21} aria-hidden />}
              {titulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Inicio ──────────────────────────────────────────────────────────────────

function Buscador({ valor, onCambio, placeholder = 'Buscar en la ayuda' }: { valor: string; onCambio: (v: string) => void; placeholder?: string }) {
  return (
    <label className="mx-4 flex items-center gap-2 rounded-full border border-border bg-muted px-3.5 py-2.5 text-muted-foreground focus-within:border-foreground/40">
      <Search size={15} aria-hidden className="shrink-0" />
      <input
        value={valor}
        onChange={e => onCambio(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}

function Resultados({ consulta }: { consulta: string }) {
  const res = buscarArticulos(consulta).slice(0, 8);
  if (res.length === 0) {
    return <p className="px-5 py-8 text-center text-[13.5px] text-muted-foreground text-pretty">No hay guías para «{consulta.trim()}». Prueba con otra palabra o escríbenos desde Mensajes.</p>;
  }
  return (
    <div className="px-4 pb-4 pt-3">
      <div className={TARJETA}>
        {res.map(r => (
          <a key={r.href} href={r.href} target="_blank" rel="noopener noreferrer" className={cn(FILA, 'border-b border-border last:border-b-0')}>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">{r.articulo.titulo}</span>
              <span className="block truncate text-[12.5px] text-muted-foreground">{r.categoriaTitulo}</span>
            </span>
            <ArrowUpRight size={15} aria-hidden className="shrink-0 text-muted-foreground" />
          </a>
        ))}
      </div>
    </div>
  );
}

function Inicio({ ruta, conTentare, onPestana, onPreguntar }: {
  ruta: string;
  conTentare: boolean;
  onPestana: (p: PestanaAyuda) => void;
  onPreguntar: (texto: string) => void;
}) {
  const [consulta, setConsulta] = useState('');
  const [texto, setTexto] = useState('');
  const { user } = useAuth();
  const { instructores } = useCore();
  const nombre = instructores.find(i => i.authUserId === user?.id)?.nombre?.trim().split(/\s+/)[0] ?? null;
  const { titulo, guias } = guiasParaInicio(ruta);
  const buscando = consulta.trim() !== '';
  const enviar = (e: React.FormEvent) => { e.preventDefault(); if (texto.trim()) onPreguntar(texto.trim()); };

  return (
    <div className="pb-4">
      <div className="px-5 pb-5 pt-6" style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--t-blue-500) 18%, var(--card)), var(--card))' }}>
        {conTentare ? (
          <div className="flex items-center gap-3.5 pr-8">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-foreground text-background shadow-sm"><TentiIcono ancho={28} sobre="invertida" /></span>
            <h2 className="text-[22px] font-bold leading-tight tracking-tight text-balance">
              {nombre ? `Hola, ${nombre}.` : 'Hola.'}<br />¿En qué te ayudo hoy?
            </h2>
          </div>
        ) : (
          <>
            <p className="text-[13px] font-semibold text-muted-foreground">Tentare</p>
            <h2 className="mt-3 text-[24px] font-bold leading-tight tracking-tight text-balance">Hola.<br />¿En qué te ayudamos?</h2>
          </>
        )}
      </div>

      {conTentare ? (
        <form onSubmit={enviar} className="mx-4 flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-4 pr-1.5 shadow-sm focus-within:border-foreground/40">
          <input
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Pregúntale a Tentare…"
            aria-label="Pregúntale a Tentare"
            className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-muted-foreground"
          />
          <button type="submit" disabled={!texto.trim()} aria-label="Preguntar" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30">
            <ArrowUp size={17} aria-hidden />
          </button>
        </form>
      ) : (
        <Buscador valor={consulta} onCambio={setConsulta} />
      )}

      {buscando ? <Resultados consulta={consulta} /> : (
        <div className="space-y-3 px-4 pt-4">
          {conTentare && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Preguntas de ejemplo">
              {PREGUNTAS_DE_EJEMPLO.slice(0, 3).map(q => (
                <button key={q} type="button" onClick={() => onPreguntar(q)} className="rounded-full border border-border px-3 py-1.5 text-left text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted">
                  {q}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <p className={ETIQUETA}>{titulo}</p>
            <div className={TARJETA}>
              {guias.map(g => (
                <a key={`${g.categoria}/${g.slug}`} href={urlArticulo(g)} target="_blank" rel="noopener noreferrer" className={cn(FILA, 'border-b border-border last:border-b-0')}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-muted"><BookOpen size={16} aria-hidden /></span>
                  <span className="min-w-0 flex-1 text-[14px] font-semibold">{g.titulo}</span>
                  <ArrowUpRight size={15} aria-hidden className="shrink-0 text-muted-foreground" />
                </a>
              ))}
            </div>
          </div>

          <div className={TARJETA}>
            <button type="button" onClick={() => onPestana('mensajes')} className={FILA}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px]" style={{ backgroundColor: 'rgba(37,211,102,.14)' }}><WhatsAppIcon size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">Escríbenos</span>
                <span className="block text-[12.5px] text-muted-foreground">Te responde una persona, no una IA</span>
              </span>
              <ChevronRight size={16} aria-hidden className="shrink-0 text-muted-foreground" />
            </button>
            <button type="button" onClick={() => onPestana('novedades')} className={cn(FILA, 'border-t border-border')}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-muted"><Megaphone size={18} aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">Novedades de Tentare</span>
                <span className="block text-[12.5px] text-muted-foreground">Lo último que hemos sacado</span>
              </span>
              <ChevronRight size={16} aria-hidden className="shrink-0 text-muted-foreground" />
            </button>
            <button type="button" onClick={() => onPestana('ayuda')} className={cn(FILA, 'border-t border-border')}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-muted"><Search size={18} aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">Buscar en la ayuda</span>
                <span className="block text-[12.5px] text-muted-foreground">Todas las guías, por categorías</span>
              </span>
              <ChevronRight size={16} aria-hidden className="shrink-0 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Novedades ───────────────────────────────────────────────────────────────

type Version = VersionResumen & { changelog_cambios: CambioVersion[] | null };

const CHIP: Record<'nuevas' | 'mejoras' | 'correcciones', { label: string; clase: string }> = {
  nuevas: { label: 'Nueva función', clase: 'bg-success/10 text-success' },
  mejoras: { label: 'Mejora', clase: 'bg-info/10 text-info' },
  correcciones: { label: 'Corrección', clase: 'bg-brand-medio/12 text-brand-medio' },
};

function Cabecera({ titulo }: { titulo: string }) {
  return <p className="border-b border-border px-12 py-4 text-center text-[17px] font-bold">{titulo}</p>;
}

function Novedades({ onCerrar, onNovedadVista }: { onCerrar: () => void; onNovedadVista: (v: string) => void }) {
  const [versiones, setVersiones] = useState<Version[] | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vivo = true;
    // Las 5 últimas: la pantalla de Actualizaciones tiene el resto.
    supabase
      .from('changelog_versiones')
      .select('id, version, titulo, fecha_publicacion, changelog_cambios(texto, etiqueta, orden)')
      .eq('estado', 'publicado')
      .order('fecha_publicacion', { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) { setFallo(true); return; }
        const orden = ordenarVersiones((data ?? []) as unknown as Version[]);
        setVersiones(orden);
        if (orden[0]) onNovedadVista(orden[0].version);
      });
    return () => { vivo = false; };
  }, [onNovedadVista]);

  return (
    <div className="pb-4">
      <Cabecera titulo="Novedades" />
      <div className="space-y-3 px-4 pt-4">
        {fallo && <p role="alert" className="py-8 text-center text-[13.5px] text-muted-foreground">No hemos podido cargar las novedades. Vuelve a abrirlas en un momento.</p>}
        {!fallo && versiones === null && [0, 1].map(i => <div key={i} aria-hidden className="h-28 animate-pulse rounded-2xl bg-muted" />)}
        {versiones?.length === 0 && <p className="py-8 text-center text-[13.5px] text-muted-foreground">Todavía no hemos publicado ninguna versión.</p>}
        {versiones?.map(v => {
          const cambios = [...(v.changelog_cambios ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
          return (
            <article key={v.id} className={cn(TARJETA, 'p-4')}>
              <p className="text-[12px] text-muted-foreground">Versión {v.version} · {fecha(v.fecha_publicacion)}</p>
              <h3 className="mt-1 text-[15px] font-bold leading-snug text-balance">{v.titulo}</h3>
              <ul className="mt-3 space-y-2">
                {cambios.slice(0, 3).map((c, i) => {
                  const chip = CHIP[filtroDeEtiqueta(c.etiqueta)];
                  return (
                    <li key={i} className="flex items-start gap-2 text-[13px] leading-snug">
                      <span className={cn('mt-px shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold', chip.clase)}>{chip.label}</span>
                      <span className="min-w-0 text-pretty">{c.texto}</span>
                    </li>
                  );
                })}
              </ul>
              {cambios.length > 3 && <p className="mt-2 text-[12px] text-muted-foreground">y {cambios.length - 3} más</p>}
            </article>
          );
        })}
        <Link href="/actualizaciones" onClick={onCerrar} className="flex items-center justify-center gap-1.5 py-2 text-[13px] font-semibold text-brand-medio hover:underline">
          Ver todas las actualizaciones <ArrowUpRight size={14} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

// ─── Mensajes ────────────────────────────────────────────────────────────────

interface SolicitudFila { id: string; tipo: string; mensaje: string; creado_en: string }

function Mensajes() {
  const { studio } = useCore();
  const rol = useRol();
  const veHistorial = puedeVerSolicitudesSoporte(rol);
  const [tipo, setTipo] = useState<TipoSoporte>('DUDA');
  const [mensaje, setMensaje] = useState('');
  const [contacto, setContacto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [historial, setHistorial] = useState<SolicitudFila[] | null>(null);

  const href = enlaceWhatsApp(SOPORTE_WHATSAPP, `Hola, soy de ${studio?.nombre ?? 'mi estudio'} y tengo una duda con Tentare:`) ?? '#';

  // Solo la propietaria las lee (RLS `soporte_leer_propietaria`): para el resto
  // del equipo ni se pide. `recarga` vuelve a pedirlas tras enviar uno.
  const [recarga, setRecarga] = useState(0);
  useEffect(() => {
    if (!veHistorial) return;
    let vivo = true;
    supabase
      .from('soporte_solicitudes')
      .select('id, tipo, mensaje, creado_en')
      .order('creado_en', { ascending: false })
      .limit(10)
      .then(({ data, error: err }) => { if (vivo && !err) setHistorial((data ?? []) as SolicitudFila[]); });
    return () => { vivo = false; };
  }, [veHistorial, recarga]);

  async function enviar() {
    if (!mensaje.trim() || enviando) return;
    setEnviando(true);
    setError(null);
    const r = await enviarMensajeSoporte({ tipo, mensaje, contacto });
    setEnviando(false);
    if (!r.ok) {
      // Se conserva lo escrito: es lo que costaría volver a teclear.
      setError('No hemos podido enviar tu mensaje. Revisa la conexión y vuelve a intentarlo: no se ha borrado lo que has escrito.');
      return;
    }
    setMensaje('');
    setContacto('');
    setEnviado(true);
    setRecarga(n => n + 1);
  }

  return (
    <div className="pb-5">
      <Cabecera titulo="Mensajes" />
      <div className="space-y-3 px-4 pt-4">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-[#1EBE5A]"
        >
          <WhatsAppIcon size={18} className="[&_path]:fill-white" />
          Escribir por WhatsApp
        </a>
        <p className="text-center text-[12px] text-muted-foreground">Te responde una persona, no una IA.</p>

        <p className={ETIQUETA}>O déjanos un mensaje</p>
        <div className={cn(TARJETA, 'space-y-2.5 p-3.5')}>
          {enviado ? (
            <div role="status" className="space-y-2.5 py-2 text-center">
              <p className="text-[14px] font-semibold">Enviado. Gracias.</p>
              <p className="text-[12.5px] text-muted-foreground">Lo leemos y te contestamos por correo.</p>
              <button type="button" onClick={() => setEnviado(false)} className="text-[13px] font-semibold text-brand-medio hover:underline">Escribir otro</button>
            </div>
          ) : (
            <>
              <div role="radiogroup" aria-label="Tipo de mensaje" className="flex gap-1.5">
                {(Object.keys(ETIQUETA_TIPO_SOPORTE) as TipoSoporte[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={tipo === t}
                    onClick={() => setTipo(t)}
                    className={cn('rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors', tipo === t ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}
                  >
                    {ETIQUETA_TIPO_SOPORTE[t]}
                  </button>
                ))}
              </div>
              <textarea
                value={mensaje}
                onChange={e => setMensaje(e.target.value)}
                placeholder="Cuéntanos qué necesitas"
                aria-label="Mensaje"
                rows={4}
                className="w-full resize-none rounded-[14px] border border-border bg-muted px-3 py-2.5 text-[14px] outline-none focus:border-foreground/40"
              />
              <input
                value={contacto}
                onChange={e => setContacto(e.target.value)}
                placeholder="Email de contacto (opcional)"
                aria-label="Email de contacto (opcional)"
                className="w-full rounded-[14px] border border-border bg-muted px-3 py-2.5 text-[14px] outline-none focus:border-foreground/40"
              />
              {error && <p role="alert" className="rounded-[12px] bg-destructive/10 px-3 py-2 text-[12.5px] font-semibold text-destructive">{error}</p>}
              <button
                type="button"
                onClick={enviar}
                disabled={!mensaje.trim() || enviando}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-[14px] font-semibold text-background disabled:opacity-40"
              >
                <Send size={14} aria-hidden />
                {enviando ? 'Enviando…' : error ? 'Reintentar' : 'Enviar'}
              </button>
            </>
          )}
        </div>

        {veHistorial && historial && historial.length > 0 && (
          <>
            <p className={ETIQUETA}>Los mensajes de tu estudio</p>
            <ul className={TARJETA}>
              {historial.map(s => (
                <li key={s.id} className="border-b border-border px-3.5 py-3 last:border-b-0">
                  <p className="text-[13.5px] font-semibold text-pretty">{extractoMensaje(s.mensaje)}</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">{etiquetaTipoSoporte(s.tipo)} · {fecha(s.creado_en.slice(0, 10))}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Ayuda ───────────────────────────────────────────────────────────────────

function Categorias() {
  const [consulta, setConsulta] = useState('');
  const buscando = consulta.trim() !== '';
  const cuentas = CATEGORIAS.map(c => ({ c, n: articulosPublicadosDe(c.slug).length })).filter(x => x.n > 0);
  return (
    <div className="pb-4">
      <Cabecera titulo="Ayuda" />
      <div className="pt-4"><Buscador valor={consulta} onCambio={setConsulta} /></div>
      {buscando ? <Resultados consulta={consulta} /> : (
        <div className="space-y-2.5 px-4 pt-4">
          <p className={ETIQUETA}>{cuentas.length} categorías</p>
          <div className={TARJETA}>
            {cuentas.map(({ c, n }) => (
              <a key={c.slug} href={`/ayuda/${c.slug}`} target="_blank" rel="noopener noreferrer" className={cn(FILA, 'border-b border-border last:border-b-0')}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold">{c.titulo}</span>
                  <span className="block text-[12.5px] text-muted-foreground">{n === 1 ? '1 guía' : `${n} guías`}</span>
                </span>
                <ChevronRight size={16} aria-hidden className="shrink-0 text-muted-foreground" />
              </a>
            ))}
          </div>
          <a href="/ayuda" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 py-2 text-[13px] font-semibold text-brand-medio hover:underline">
            <BookOpen size={14} aria-hidden /> Abrir el Centro de ayuda <ArrowUpRight size={14} aria-hidden />
          </a>
        </div>
      )}
    </div>
  );
}
