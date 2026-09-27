'use client';

// Consultas que llegan desde la web del estudio (widget «Formulario de
// contacto»), arriba de Clientas. Sin entrada de menú propia: vive donde se da
// de alta a una clienta, que es lo que suele venir después.
//
// - Sin consultas nuevas no ocupa sitio: como mucho, una línea para ver las ya
//   atendidas (hacen falta para borrar una si esa persona lo pide).
// - Responder abre el correo de quien opera; NO marca la consulta como
//   atendida sola, porque no sabemos si el correo llegó a salir.
// - «Dar de alta» abre el alta de siempre con sus datos puestos. Nada se crea
//   solo: una ficha ocupa plaza del plan y le manda la bienvenida del portal.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Inbox, Mail, Phone, Check, Trash2, UserPlus } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useAuth } from '@/lib/auth-context';
import { TZ_ESTUDIO } from '@/lib/utils';
import { enlaceRespuesta } from '@/lib/contacto/consulta';
import {
  contarAtendidas, eliminarConsulta, listarConsultas, marcarAtendida, type ConsultaContacto,
} from '@/lib/contacto/consultas-cliente';

const cuando = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ_ESTUDIO });

export function ConsultasContacto({ recarga, onDarDeAlta }: {
  /** Sube cuando la página ha hecho algo que cambia la lista (un alta desde aquí). */
  recarga: number;
  onDarDeAlta: (c: ConsultaContacto) => void;
}) {
  const { studio, socios } = useStudio();
  const { user } = useAuth();
  const studioId = studio?.id ?? null;
  const [nuevas, setNuevas] = useState<ConsultaContacto[] | null>(null);
  const [nAtendidas, setNAtendidas] = useState<number | null>(null);
  const [atendidas, setAtendidas] = useState<ConsultaContacto[] | null>(null);
  const [verAtendidas, setVerAtendidas] = useState(false);
  const [error, setError] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [confirmarBorrar, setConfirmarBorrar] = useState<string | null>(null);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    if (!studioId) return;
    const [n, cuenta] = await Promise.all([listarConsultas(studioId, 'nueva'), contarAtendidas(studioId)]);
    if (n === null) { setError(true); return; }
    setError(false);
    setNuevas(n);
    setNAtendidas(cuenta);
  }, [studioId]);

  const cargarAtendidas = useCallback(async () => {
    if (!studioId) return;
    const a = await listarConsultas(studioId, 'atendida');
    if (a === null) { setErrorAccion('No se han podido cargar las consultas atendidas.'); return; }
    setAtendidas(a);
  }, [studioId]);

  // setState tras await, no en cascada — falso positivo del lint (mismo patrón que solicitudes-derechos-pendientes).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar, recarga]);

  async function atender(c: ConsultaContacto) {
    if (ocupada || !user?.id) return;
    setOcupada(c.id);
    setErrorAccion(null);
    const r = await marcarAtendida(c.id, user.id);
    setOcupada(null);
    if (!r.ok) { setErrorAccion(r.error); return; }
    await cargar();
    if (verAtendidas) await cargarAtendidas();
  }

  async function borrar(c: ConsultaContacto) {
    if (ocupada) return;
    setOcupada(c.id);
    setErrorAccion(null);
    const r = await eliminarConsulta(c.id);
    setOcupada(null);
    setConfirmarBorrar(null);
    if (!r.ok) { setErrorAccion(r.error); return; }
    await cargar();
    if (verAtendidas) await cargarAtendidas();
  }

  async function alternarAtendidas() {
    const ver = !verAtendidas;
    setVerAtendidas(ver);
    if (ver) await cargarAtendidas();
  }

  // La que ya tiene ficha (mismo email) no se ofrece para dar de alta: se
  // enlaza a su ficha y así no se duplica.
  const fichaDe = (email: string) => {
    const e = email.trim().toLowerCase();
    return socios.find(s => (s.email ?? '').trim().toLowerCase() === e)?.id ?? null;
  };

  if (error) {
    return <p className="text-[12px] text-destructive">No se han podido cargar las consultas de tu web.</p>;
  }
  if (!nuevas) return null;
  if (nuevas.length === 0 && !nAtendidas) return null;

  const fila = (c: ConsultaContacto) => {
    const ficha = fichaDe(c.email);
    const abierta = abiertas.has(c.id);
    const larga = c.mensaje.length > 220;
    const deOtraWeb = c.origen && c.origen !== 'web-contacto';
    return (
      <li key={c.id} className="bg-card border border-border rounded-lg px-3 py-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-[13px] font-semibold text-foreground truncate min-w-0">{c.nombre || 'Sin nombre'}</p>
          <p className="text-[11px] text-muted-foreground">
            {c.creadaEn ? cuando.format(new Date(c.creadaEn)) : ''}
            {deOtraWeb && <> · desde «{c.origen}»</>}
          </p>
        </div>
        <p className="text-[12px] text-muted-foreground break-all">
          {c.email}{c.telefono ? ` · ${c.telefono}` : ''}
        </p>
        <p className={`mt-1.5 text-[13px] text-foreground whitespace-pre-line break-words ${larga && !abierta ? 'line-clamp-3' : ''}`}>
          {c.mensaje}
        </p>
        {larga && (
          <button
            type="button"
            onClick={() => setAbiertas(prev => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
            className="mt-0.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
          >
            {abierta ? 'Ver menos' : 'Ver entero'}
          </button>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <a href={enlaceRespuesta(c.email, studio?.nombre ?? '')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border border-border hover:bg-muted">
            <Mail size={13} /> Responder
          </a>
          {c.telefono && (
            <a href={`tel:${c.telefono.replace(/[^0-9+]/g, '')}`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border border-border hover:bg-muted">
              <Phone size={13} /> Llamar
            </a>
          )}
          {ficha ? (
            <Link href={`/clientas/${ficha}`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border border-border hover:bg-muted">
              Ya es clienta: ver ficha
            </Link>
          ) : c.estado === 'nueva' && (
            <button type="button" onClick={() => onDarDeAlta(c)} disabled={ocupada !== null}
              title="Abre el alta con sus datos. Le llegará el correo de bienvenida."
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border border-border hover:bg-muted disabled:opacity-50">
              <UserPlus size={13} /> Dar de alta
            </button>
          )}
          {c.estado === 'nueva' && (
            <button type="button" onClick={() => void atender(c)} disabled={ocupada !== null}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold border border-border hover:bg-muted disabled:opacity-50">
              <Check size={13} /> {ocupada === c.id ? 'Guardando…' : 'Marcar como atendida'}
            </button>
          )}
          {confirmarBorrar === c.id ? (
            <span className="inline-flex items-center gap-1.5 text-[12px]">
              <span className="text-muted-foreground">¿Eliminarla del todo?</span>
              <button type="button" onClick={() => void borrar(c)} disabled={ocupada !== null}
                className="px-2 py-1 rounded-lg font-semibold text-destructive border border-border hover:bg-muted disabled:opacity-50">
                {ocupada === c.id ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
              <button type="button" onClick={() => setConfirmarBorrar(null)} className="px-2 py-1 rounded-lg font-semibold border border-border hover:bg-muted">
                No
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmarBorrar(c.id)} disabled={ocupada !== null}
              aria-label={`Eliminar la consulta de ${c.nombre || 'esta persona'}`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold text-muted-foreground border border-border hover:bg-muted disabled:opacity-50">
              <Trash2 size={13} /> Eliminar
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <section aria-labelledby="consultas-web-t" className="rounded-xl p-4 bg-card border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Inbox size={15} className="text-primary" />
          <h2 id="consultas-web-t" className="text-[13px] font-bold text-foreground">
            {nuevas.length === 0 ? 'Consultas de tu web' : nuevas.length === 1 ? '1 consulta nueva de tu web' : `${nuevas.length} consultas nuevas de tu web`}
          </h2>
        </div>
        {!!nAtendidas && (
          <button type="button" onClick={() => void alternarAtendidas()} aria-expanded={verAtendidas}
            className="text-[12px] font-semibold text-muted-foreground hover:text-foreground">
            {verAtendidas ? 'Ocultar atendidas' : `Ver atendidas (${nAtendidas})`}
          </button>
        )}
      </div>
      {nuevas.length > 0 && (
        <p className="text-[12px] text-muted-foreground mt-1 mb-3">
          Las envían desde el formulario de contacto de tu web. Aún no son clientas.
        </p>
      )}
      {errorAccion && <p role="alert" className="text-[12px] text-destructive mb-2">{errorAccion}</p>}
      {nuevas.length > 0 && <ul className="space-y-2">{nuevas.map(fila)}</ul>}
      {verAtendidas && atendidas && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Atendidas · se borran solas a los 90 días</p>
          {atendidas.length > 0
            ? <ul className="space-y-2">{atendidas.map(fila)}</ul>
            : <p className="text-[12px] text-muted-foreground">No queda ninguna.</p>}
        </div>
      )}
    </section>
  );
}
