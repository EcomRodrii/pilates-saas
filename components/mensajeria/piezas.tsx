'use client';

// Las PIEZAS visuales de la bandeja del panel (Community & Messaging OS).
//
// Están separadas del contenedor (`conversaciones-tab.tsx`, que es quien tiene
// el estado, los fetch y la suscripción Realtime) por dos motivos, en este
// orden:
//
// 1. El contenedor solo funciona dentro de StudioProvider + AuthProvider +
//    sesión de staff. Con la vista aparte, el aspecto de esta pantalla se puede
//    MIRAR en un navegador de verdad —modo claro y oscuro, móvil y
//    escritorio— sin montar media aplicación. El rediseño anterior se dio por
//    bueno leyendo el JSX, y así salió.
// 2. Ninguna de estas piezas sabe de fetch ni de canales: entran props, sale
//    markup.
//
// `cuerpo` se pinta siempre como texto plano (React escapa por defecto).

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Check, CheckCheck, GraduationCap, Inbox, Loader2, MessageSquarePlus,
  RefreshCw, Search, Send, Store, Users, X,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import {
  agruparHilo, colorPersona, estadoEntrega, horaCorta, iniciales, selloLista, unaLinea,
} from '@/lib/mensajeria/presentacion';
import type { Socio, Instructor } from '@/lib/types';
import type { RowMensajes } from '@/lib/db-types';
import type { ConversacionStaff } from '@/lib/mensajeria/tipos';

export const LIMITE_CUERPO = 4000;

// Identidad visual por tipo de conversación: un canal de equipo NO puede verse
// igual que un 1:1 con una socia en la lista (lo era: el mismo icono gris para
// los tres). El color sale de la paleta SEMÁNTICA del panel, no de la de marca
// — aquí distingue, no marca.
export const TIPO_INFO: Record<string, { label: string; Icon: typeof Users; color: string }> = {
  EQUIPO: { label: 'Canal de equipo', Icon: Users, color: 'var(--info)' },
  ALUMNA_INSTRUCTORA: { label: 'Con instructora', Icon: GraduationCap, color: 'var(--brand)' },
  ALUMNA_MOSTRADOR: { label: 'Mostrador', Icon: Store, color: 'var(--warning)' },
};

export function infoDe(tipo: string) {
  return TIPO_INFO[tipo] ?? TIPO_INFO.EQUIPO;
}

// ── Quién hay al otro lado ──────────────────────────────────────────────────

export interface Identidad {
  nombre: string;
  contexto: string;
  socio: Socio | null;
  instructor: Instructor | null;
}

export function identidadDe(row: ConversacionStaff, socios: Socio[], instructores: Instructor[]): Identidad {
  if (row.tipo === 'EQUIPO') {
    return { nombre: row.titulo || 'Equipo', contexto: 'Canal de equipo', socio: null, instructor: null };
  }
  const socioId = row.conversacion_participantes.find(p => p.rol_en_conversacion === 'SOCIO')?.socio_id;
  const socio = socioId ? socios.find(s => s.id === socioId) ?? null : null;
  const nombre = socio ? `${socio.nombre} ${socio.apellidos}`.trim() : 'Socia';
  if (row.tipo === 'ALUMNA_MOSTRADOR') {
    return { nombre, contexto: 'Mostrador · dudas generales', socio, instructor: null };
  }
  const staffAuthId = row.conversacion_participantes.find(p => p.rol_en_conversacion === 'STAFF')?.auth_user_id;
  const instructor = staffAuthId ? instructores.find(i => i.authUserId === staffAuthId) ?? null : null;
  return { nombre, contexto: instructor ? `Con ${instructor.nombre}` : 'Con su instructora', socio, instructor };
}

// ── Avatar ──────────────────────────────────────────────────────────────────

export function AvatarConversacion({ tipo, identidad, size = 'md' }: {
  tipo: string; identidad: Identidad; size?: 'sm' | 'md';
}) {
  const { Icon, color } = infoDe(tipo);
  const px = size === 'md' ? 44 : 36;
  const badge = size === 'md' ? 17 : 15;

  return (
    <span className="relative shrink-0 block" style={{ width: px, height: px }}>
      {tipo === 'EQUIPO' || !identidad.socio ? (
        <span
          className="w-full h-full rounded-full flex items-center justify-center"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 14%, var(--card))`, color }}
        >
          {tipo === 'EQUIPO'
            ? <Users size={size === 'md' ? 19 : 16} aria-hidden="true" />
            : <span className="font-bold" style={{ fontSize: size === 'md' ? 14 : 12 }}>{iniciales(identidad.nombre)}</span>}
        </span>
      ) : (
        <ProfileAvatar
          nombre={identidad.socio.nombre}
          apellidos={identidad.socio.apellidos}
          avatarId={identidad.socio.avatar}
          fotoUrl={identidad.socio.fotoUrl}
          color={colorPersona(identidad.socio.id)}
          size={size === 'md' ? 'md' : 'sm'}
          className="w-full h-full"
        />
      )}
      {/* Sello de tipo: distingue un canal de equipo de un 1:1 de un vistazo,
          sin gastar una línea de texto de la fila. */}
      <span
        className="absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center border-2"
        style={{
          width: badge, height: badge, backgroundColor: color,
          borderColor: 'var(--card)', color: 'var(--brand-foreground)',
        }}
        aria-hidden="true"
      >
        <Icon size={badge === 17 ? 9 : 8} strokeWidth={2.75} />
      </span>
    </span>
  );
}

// ── Fila de la lista ────────────────────────────────────────────────────────

export function FilaConversacion({ row, identidad, activa, sinLeer, esMio, onClick, indice }: {
  row: ConversacionStaff;
  identidad: Identidad;
  activa: boolean;
  sinLeer: boolean;
  esMio: boolean;
  onClick: () => void;
  indice: number;
}) {
  const info = infoDe(row.tipo);
  const preview = unaLinea(row.ultimo_cuerpo, 80);
  return (
    <button
      onClick={onClick}
      aria-current={activa ? 'true' : undefined}
      className="paso-anim relative w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 transition-colors"
      style={{
        animationDelay: `${Math.min(indice, 10) * 22}ms`,
        backgroundColor: activa ? 'color-mix(in srgb, var(--brand) 8%, var(--card))' : undefined,
      }}
    >
      {activa && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full"
          style={{ backgroundColor: 'var(--brand)' }}
        />
      )}
      <AvatarConversacion tipo={row.tipo} identidad={identidad} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={`text-[13.5px] truncate ${sinLeer ? 'font-bold' : 'font-semibold'} text-foreground`}>
            {identidad.nombre}
          </span>
          <span
            className={`text-[11px] shrink-0 ${sinLeer ? 'font-semibold' : ''}`}
            style={{ color: sinLeer ? 'var(--brand)' : 'var(--muted-foreground)' }}
          >
            {selloLista(row.ultimo_mensaje_en)}
          </span>
        </span>
        <span className="block text-[10.5px] font-bold uppercase tracking-[0.1em] truncate mt-0.5" style={{ color: info.color }}>
          {identidad.contexto}
        </span>
        <span className="flex items-center justify-between gap-2 mt-0.5">
          <span className={`text-[12px] truncate ${sinLeer ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
            {preview
              ? <>{esMio && <span className="text-muted-foreground">Tú: </span>}{preview}</>
              : <span className="italic text-muted-foreground">Sin mensajes todavía</span>}
          </span>
          {sinLeer && (
            <span aria-label="Sin leer" className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: 'var(--brand)' }} />
          )}
        </span>
      </span>
    </button>
  );
}

export function SkeletonLista() {
  return (
    <div aria-hidden="true">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="w-11 h-11 rounded-full bg-muted animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
            <div className="h-2.5 w-5/6 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** El panel derecho cuando todavía no se ha elegido ningún hilo. */
export function SinHiloElegido() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div
        className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4"
        style={{ backgroundColor: 'color-mix(in srgb, var(--brand) 10%, var(--card))' }}
      >
        <Inbox size={28} style={{ color: 'var(--brand)' }} aria-hidden="true" />
      </div>
      <p className="text-[15px] font-bold text-foreground">Elige una conversación</p>
      <p className="text-[13px] text-muted-foreground mt-1 max-w-xs">Se abre aquí mismo, sin salir de la bandeja.</p>
    </div>
  );
}

export function BandejaVacia({ onNueva }: { onNueva: () => void }) {
  return (
    <EmptyState
      icono={Inbox}
      titulo="Aquí aparecerán tus conversaciones"
      descripcion="Escribe a una clienta desde el mostrador o deja que ella empiece desde su portal — todo llega a esta bandeja."
      cta={{ label: 'Nueva conversación', icono: MessageSquarePlus, onClick: onNueva }}
      className="border-0 py-14"
    />
  );
}

// ── Escribiendo… ─────────────────────────────────────────────────────────────
// Misma burbuja de puntos que ya existe en el portal (IndicadorEscribiendo,
// components/portal/mensajeria-piezas.tsx) — construida aquí porque este
// lado usa tokens de Tailwind/CSS vars propios del panel, no los de
// lib/portal-design.ts.

function BurbujaEscribiendo() {
  return (
    <div className="flex justify-start paso-anim">
      <div
        className="flex items-center gap-1 rounded-2xl px-4 py-3"
        style={{ backgroundColor: 'var(--muted)', borderBottomLeftRadius: 5 }}
      >
        <span className="sr-only">Escribiendo…</span>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            aria-hidden
            className="size-1.5 rounded-full animate-bounce"
            style={{ backgroundColor: 'var(--muted-foreground)', animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Burbuja ─────────────────────────────────────────────────────────────────

function Burbuja({ texto, mio, ultimaDelBloque, pie }: {
  texto: string; mio: boolean; ultimaDelBloque: boolean; pie?: React.ReactNode;
}) {
  const fondo = mio ? 'var(--brand)' : 'var(--muted)';
  return (
    <div className={`flex ${mio ? 'justify-end' : 'justify-start'}`}>
      <div className="relative max-w-[82%]">
        <div
          className="rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words"
          style={{
            backgroundColor: fondo,
            color: mio ? 'var(--brand-foreground)' : 'var(--foreground)',
            // La esquina del lado de quien habla se cierra solo en el ÚLTIMO
            // mensaje del bloque: es donde va la cola, y donde el ojo entiende
            // que ahí termina el turno de esa persona.
            borderBottomRightRadius: mio && ultimaDelBloque ? 5 : undefined,
            borderBottomLeftRadius: !mio && ultimaDelBloque ? 5 : undefined,
          }}
        >
          {texto}
        </div>
        {/* Cola: triángulo con `border`, no `clip-path` — se pinta igual en
            cualquier navegador, sin depender del soporte de path(). */}
        {ultimaDelBloque && (
          <span
            aria-hidden="true"
            className="absolute bottom-0"
            style={mio
              ? { right: -5, width: 0, height: 0, borderLeft: `7px solid ${fondo}`, borderBottom: '7px solid transparent' }
              : { left: -5, width: 0, height: 0, borderRight: `7px solid ${fondo}`, borderBottom: '7px solid transparent' }}
          />
        )}
        {pie && (
          <div className={`flex items-center gap-1 mt-1 text-[10px] text-muted-foreground ${mio ? 'justify-end' : 'justify-start'}`}>
            {pie}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Vista del hilo ──────────────────────────────────────────────────────────

export interface ContextoAncla { titulo: string; detalle: string }

export function HiloVista({
  conversacion, identidad, mensajes, authUserId, error, ancla,
  cuerpo, enviando, onCuerpo, onEnviar, onVolver, onReintentar, escribiendoOtros,
}: {
  conversacion: ConversacionStaff;
  identidad: Identidad;
  mensajes: RowMensajes[] | null;
  authUserId: string | null;
  error: string | null;
  ancla: ContextoAncla | null;
  cuerpo: string;
  enviando: boolean;
  onCuerpo: (v: string) => void;
  onEnviar: () => void;
  onVolver: () => void;
  onReintentar: () => void;
  escribiendoOtros?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const info = infoDe(conversacion.tipo);
  const dias = useMemo(() => agruparHilo(mensajes ?? []), [mensajes]);

  useEffect(() => {
    if (!mensajes) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes, escribiendoOtros]);

  // El compositor crece con el texto en vez de dejar un renglón con scroll
  // interno: escribir tres frases sin ver lo que llevas escrito es de las
  // cosas que más "sin terminar" hacen sentir una mensajería.
  //
  // ⚠️ Con el campo VACÍO se deja `height:auto` y NO se mide: visto en el
  // navegador, la primera medición al montar devolvía un `scrollHeight` que no
  // se correspondía con una línea (el texto aún no había asentado), y el
  // compositor arrancaba con la altura máxima —una caja enorme y vacía— hasta
  // que se pulsaba la primera tecla. Vacío = una fila, sin medir nada.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    if (!cuerpo) return;
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [cuerpo]);

  // El último mensaje MÍO es el único que lleva ✓/✓✓: repetirlo en todos
  // convierte el hilo en un tablero de checks.
  const idUltimoMio = [...(mensajes ?? [])].reverse()
    .find(m => m.remitente_auth_user_id === authUserId)?.id ?? null;
  const puedeEnviar = Boolean(cuerpo.trim()) && !enviando;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <button
          onClick={onVolver}
          aria-label="Volver a la lista de conversaciones"
          className="md:hidden p-1.5 -ml-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <AvatarConversacion tipo={conversacion.tipo} identidad={identidad} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground truncate">{identidad.nombre}</p>
          <p className="text-[11px] truncate" style={{ color: info.color }}>{identidad.contexto}</p>
        </div>
      </div>

      {/* Fase 7 — la conversación no flota en el vacío: si nació de una clase
          concreta, se dice cuál. Sin ancla no se inventa nada. */}
      {ancla && (
        <div className="px-4 py-2 border-b border-border shrink-0 bg-muted/40">
          <p className="text-[11px] text-muted-foreground truncate">
            Sobre la clase <span className="font-semibold text-foreground">{ancla.titulo}</span> · {ancla.detalle}
          </p>
        </div>
      )}

      <div
        ref={scrollRef}
        role="log" aria-live="polite" aria-label="Mensajes de la conversación"
        className="flex-1 min-h-0 overflow-y-auto px-4 py-4"
      >
        {mensajes === null ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={18} className="animate-spin text-muted-foreground" aria-label="Cargando mensajes" />
          </div>
        ) : mensajes.length === 0 ? (
          <EmptyState
            compacto
            icono={info.Icon}
            titulo={`Todavía no has escrito a ${identidad.nombre}`}
            descripcion="El primer mensaje lo ve al instante en su portal."
          />
        ) : (
          dias.map(dia => (
            <div key={dia.etiqueta}>
              <div className="flex justify-center my-3">
                <span className="px-2.5 py-1 rounded-full bg-muted text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  {dia.etiqueta}
                </span>
              </div>
              {dia.bloques.map(bloque => {
                const mio = bloque.remitenteAuthUserId === authUserId;
                const ultimo = bloque.items[bloque.items.length - 1];
                return (
                  <div key={bloque.items[0].id} className="mb-2.5 space-y-0.5">
                    {/* En un canal de EQUIPO hablan varias personas: sin el
                        nombre encima del bloque no se sabe quién dice qué. En
                        un 1:1 sobra, y no se pinta. */}
                    {!mio && conversacion.tipo === 'EQUIPO' && (
                      <p className="text-[11px] font-semibold text-muted-foreground pl-1 pb-0.5">
                        {identidad.nombre}
                      </p>
                    )}
                    {bloque.items.map(m => (
                      <div key={m.id} className="paso-anim">
                        <Burbuja
                          texto={m.cuerpo}
                          mio={mio}
                          ultimaDelBloque={m.id === ultimo.id}
                          pie={m.id === ultimo.id ? (
                            <>
                              <span>{horaCorta(m.creado_en)}</span>
                              {m.id === idUltimoMio && (
                                estadoEntrega(m.creado_en, conversacion.leido_hasta_otros) === 'leido'
                                  ? <CheckCheck size={12} style={{ color: 'var(--brand)' }} aria-label="Leído" />
                                  : <Check size={12} aria-label="Enviado" />
                              )}
                            </>
                          ) : undefined}
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))
        )}
        {!error && escribiendoOtros && <BurbujaEscribiendo />}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-border shrink-0">
          <p role="alert" className="text-xs text-destructive">{error}</p>
          <button
            onClick={onReintentar}
            className="flex items-center gap-1 text-[11px] font-semibold text-brand-medio hover:underline shrink-0"
          >
            <RefreshCw size={11} /> Reintentar
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 px-3 py-3 border-t border-border shrink-0">
        <div className="flex-1 min-w-0 rounded-2xl border border-border bg-card focus-within:border-brand transition-colors">
          <textarea
            ref={areaRef}
            value={cuerpo}
            onChange={e => onCuerpo(e.target.value.slice(0, LIMITE_CUERPO))}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEnviar(); }
            }}
            rows={1}
            placeholder={`Escribe a ${identidad.nombre.split(' ')[0]}…`}
            aria-label="Mensaje"
            className="w-full resize-none bg-transparent px-3.5 py-2.5 text-sm text-foreground outline-none max-h-36"
          />
          {cuerpo.length > LIMITE_CUERPO - 400 && (
            <p className="px-3.5 pb-1.5 text-[10px] text-muted-foreground text-right">
              {LIMITE_CUERPO - cuerpo.length} caracteres
            </p>
          )}
        </div>
        <button
          onClick={onEnviar}
          disabled={!puedeEnviar}
          aria-label="Enviar mensaje"
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mb-0.5"
          style={{
            backgroundColor: puedeEnviar ? 'var(--brand)' : 'var(--muted)',
            color: puedeEnviar ? 'var(--brand-foreground)' : 'var(--muted-foreground)',
            transform: puedeEnviar ? 'scale(1)' : 'scale(.92)',
            cursor: puedeEnviar ? 'pointer' : 'default',
            transition: 'background-color .2s cubic-bezier(.16,1,.3,1), transform .2s cubic-bezier(.16,1,.3,1), color .2s ease',
          }}
        >
          {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

// ── Nueva conversación ─────────────────────────────────────────────────────
//
// Antes: tres <select> nativos ("Tipo", "Socia", "Instructora"). Con 200 socias
// eso es un desplegable de 200 líneas sin buscar. Ahora es lo que se espera de
// cualquier app: escribes un nombre, ves caras, eliges.

export function NuevaConversacion({
  socios, instructores, puedeMostrador, onAbrir, onCerrar, error,
}: {
  socios: Socio[];
  instructores: Instructor[];
  puedeMostrador: boolean;
  /** Devuelve el id de la conversación, o null si falló (el error lo pinta el
   *  contenedor vía `error`). */
  onAbrir: (tipo: 'ALUMNA_INSTRUCTORA' | 'ALUMNA_MOSTRADOR', socioId: string, instructorId?: string) => Promise<void>;
  onCerrar: () => void;
  error: string | null;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [socio, setSocio] = useState<Socio | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);

  const instructoresActivos = instructores.filter(i => i.activo);

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const activos = socios.filter(s => s.activo !== false);
    return (q
      ? activos.filter(s => `${s.nombre} ${s.apellidos} ${s.email}`.toLowerCase().includes(q))
      : activos).slice(0, 40);
  }, [socios, busqueda]);

  async function abrir(tipo: 'ALUMNA_INSTRUCTORA' | 'ALUMNA_MOSTRADOR', instructorId?: string) {
    if (!socio) return;
    setEnviando(instructorId ?? 'mostrador');
    await onAbrir(tipo, socio.id, instructorId);
    setEnviando(null);
  }

  return (
    <div className="border-b border-border bg-muted/40 shrink-0">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <p className="text-[13px] font-bold text-foreground">
          {socio ? 'Y ahora, ¿con quién habla?' : 'Elige una clienta'}
        </p>
        <button
          onClick={onCerrar}
          aria-label="Cerrar nueva conversación"
          className="p-1 -mr-1 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {!socio ? (
        <div className="px-4 pb-3.5 space-y-2">
          <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 focus-within:border-brand transition-colors">
            <Search size={14} className="text-muted-foreground shrink-0" aria-hidden="true" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Busca por nombre o email…"
              aria-label="Buscar clienta"
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1 min-w-0"
            />
          </div>
          <div className="max-h-56 overflow-y-auto -mx-1 px-1">
            {resultados.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Ninguna clienta coincide con «{busqueda.trim()}».
              </p>
            ) : (
              <ul className="space-y-0.5">
                {resultados.map((s, i) => (
                  <li key={s.id}>
                    <button
                      onClick={() => { setSocio(s); setBusqueda(''); }}
                      className="paso-anim w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-left hover:bg-card transition-colors"
                      style={{ animationDelay: `${Math.min(i, 8) * 18}ms` }}
                    >
                      <ProfileAvatar
                        nombre={s.nombre} apellidos={s.apellidos} avatarId={s.avatar}
                        fotoUrl={s.fotoUrl} color={colorPersona(s.id)} size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-foreground truncate">
                          {s.nombre} {s.apellidos}
                        </span>
                        <span className="block text-[11px] text-muted-foreground truncate">{s.email}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="px-4 pb-3.5 space-y-2.5">
          <div className="flex items-center gap-2.5 bg-card border border-border rounded-xl px-2.5 py-2">
            <ProfileAvatar
              nombre={socio.nombre} apellidos={socio.apellidos} avatarId={socio.avatar}
              fotoUrl={socio.fotoUrl} color={colorPersona(socio.id)} size="sm"
            />
            <p className="text-[13px] font-semibold text-foreground truncate flex-1">
              {socio.nombre} {socio.apellidos}
            </p>
            <button onClick={() => setSocio(null)} className="text-[11px] font-semibold text-brand-medio hover:underline shrink-0">
              Cambiar
            </button>
          </div>

          {puedeMostrador && (
            <button
              onClick={() => void abrir('ALUMNA_MOSTRADOR')}
              disabled={enviando !== null}
              className="paso-anim w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl border border-border bg-card text-left hover:border-brand transition-colors disabled:opacity-50"
            >
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'color-mix(in srgb, var(--warning) 14%, var(--card))', color: 'var(--warning)' }}
              >
                <Store size={15} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-foreground">Desde el mostrador</span>
                <span className="block text-[11px] text-muted-foreground">Responde cualquiera del equipo</span>
              </span>
              {enviando === 'mostrador' && <Loader2 size={14} className="animate-spin text-muted-foreground shrink-0" />}
            </button>
          )}

          {puedeMostrador && instructoresActivos.length > 0 && (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground pt-0.5">
                O con una instructora
              </p>
              <div className="flex flex-wrap gap-1.5">
                {instructoresActivos.map(i => (
                  <button
                    key={i.id}
                    onClick={() => void abrir('ALUMNA_INSTRUCTORA', i.id)}
                    disabled={enviando !== null}
                    className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border border-border bg-card hover:border-brand transition-colors disabled:opacity-50"
                  >
                    <ProfileAvatar nombre={i.nombre} avatarId={i.avatar} fotoUrl={i.fotoUrl} color={i.color} size="xs" />
                    <span className="text-[12px] font-semibold text-foreground">{i.nombre}</span>
                    {enviando === i.id && <Loader2 size={11} className="animate-spin text-muted-foreground" />}
                  </button>
                ))}
              </div>
            </>
          )}

          {!puedeMostrador && (
            <button
              onClick={() => void abrir('ALUMNA_INSTRUCTORA')}
              disabled={enviando !== null}
              className="w-full px-3.5 py-2.5 rounded-xl text-[13px] font-bold text-brand-foreground disabled:opacity-40 transition-opacity"
              style={{ backgroundColor: 'var(--brand)' }}
            >
              {enviando ? 'Abriendo…' : 'Abrir conversación'}
            </button>
          )}
        </div>
      )}

      {error && <p role="alert" className="px-4 pb-3 text-xs text-destructive">{error}</p>}
    </div>
  );
}
