'use client';

import { useState } from 'react';
import { MessageCircle, Search, UserCheck } from 'lucide-react';
import { cn, horaEstudio } from '@/lib/utils';

// La caja de una clase sin cubrir en su ficha (maqueta aprobada del rediseño del
// Calendario, 1-oct-2026): «Buscar sustituta» pone a trabajar al motor de
// sustituciones —el mismo que cuando la instructora dice «No puedo asistir»— y
// dice ANTES de pulsar a quién se va a avisar; debajo, «¿Ya sabes quién la da?»
// para asignarla directamente.
//
// Lo que dice tiene que ser lo que el motor HACE, que depende del modo del
// estudio: en autónomo y vacaciones avisa solo, una tras otra; en asistido y
// manual, cada aviso espera el visto bueno, y si una candidata no contesta o
// dice que no, se le cuenta a la propietaria en vez de pasar sola a la
// siguiente (lib/inngest/sustituciones.ts, lib/sustituciones/responder.ts).
//
// Solo pinta: los datos (GET /api/sustituciones/clase) y las acciones los pone
// la página.

export interface CandidataEnFicha {
  instructorId: string;
  nombre: string | null;
  /** Un motivo del ranking, en lenguaje humano («ya ha dado esta clase 12 veces»). */
  motivo: string | null;
  /** Sin email no se la puede avisar: el motor se la salta. */
  sinEmail: boolean;
  avisada: boolean;
}

export interface ContactoEnFicha {
  instructorId: string;
  canal: string | null;
  estado: string | null;
  enviadoEn: string | null;
  respondidoEn: string | null;
}

export interface DatosSustitutaClase {
  modo: string;
  sustitucion: { id: string; estado: string; instructorOriginalId: string | null } | null;
  /** Quien mejor encaja, sin quien ya dijo que no para esta clase. */
  cola: CandidataEnFicha[];
  /** A quién se avisaría ahora. */
  siguienteId: string | null;
  contactos: ContactoEnFicha[];
}

export interface OpcionSustituta {
  id: string;
  nombre: string;
  telefono: string | null;
}

const MODO: Record<string, { nombre: string; texto: string; solo: boolean }> = {
  manual: { nombre: 'manual', texto: 'te proponemos candidatas y tú das cada paso.', solo: false },
  asistido: { nombre: 'asistido', texto: 'antes de avisar a nadie, te pedimos el visto bueno.', solo: false },
  autonomo: { nombre: 'autónomo', texto: 'avisamos solas y te lo contamos después.', solo: true },
  vacaciones: { nombre: 'vacaciones', texto: 'lo llevamos de principio a fin sin molestarte.', solo: true },
};

const CANAL: Record<string, string> = { email: 'por correo', whatsapp: 'por WhatsApp', sms: 'por SMS', push: 'por la app' };
const EN_JUEGO = new Set(['buscando', 'pendiente_aprobacion', 'contactando', 'agotada']);

const BOTON_PRINCIPAL = 'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[14px] font-semibold text-brand-foreground transition-[filter] hover:brightness-95 disabled:opacity-50';
const BOTON_SECUNDARIO = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 text-[14px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50';

/** «Irene Sanz», «Irene Sanz y Marta Ruiz», «Irene Sanz, Marta Ruiz y Cloe». */
function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? '';
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

export function SustitutaDeClase({
  datos, cargando, error, opciones, apuntadas, avisoClientasApagado, mensajeWhatsApp, ocupado, nombreDe,
  onBuscar, onAvisar, onVolverABuscar, onDescartar, onAsignar,
}: {
  datos: DatosSustitutaClase | null;
  cargando: boolean;
  error: string | null;
  /** Del equipo, las que podrían darla: imparten, no están ausentes y no tienen otra clase a esa hora. */
  opciones: OpcionSustituta[];
  /** Clientas apuntadas: si hay, se pregunta si avisarlas del cambio. */
  apuntadas: number;
  /**
   * El estudio tiene apagado el aviso a las clientas (`avisar_alumnas`): el
   * servidor no las avisa aunque se marque la casilla, así que se dice en vez
   * de ofrecerla.
   */
  avisoClientasApagado: boolean;
  /** Lo que se le escribe por WhatsApp a una instructora antes de asignársela. */
  mensajeWhatsApp: (opcion: OpcionSustituta) => string | null;
  /** Una acción en vuelo: los botones esperan. */
  ocupado: boolean;
  nombreDe: (instructorId: string) => string;
  onBuscar: () => void;
  onAvisar: (instructorId: string) => void;
  onVolverABuscar: () => void;
  onDescartar: () => void;
  onAsignar: (instructorId: string, avisarClientas: boolean) => void;
}) {
  const [elegida, setElegida] = useState('');
  const [avisarClientas, setAvisarClientas] = useState(true);
  const sust = datos?.sustitucion ?? null;
  const abierta = !!sust && EN_JUEGO.has(sust.estado);
  const cola = datos?.cola ?? [];
  const nombre = (c: CandidataEnFicha) => c.nombre ?? nombreDe(c.instructorId);
  const modo = MODO[datos?.modo ?? 'asistido'] ?? MODO.asistido;
  const siguiente = cola.find(c => c.instructorId === datos?.siguienteId) ?? null;
  const resto = cola.filter(c => c !== siguiente && !c.avisada && !c.sinEmail).map(nombre);
  const ultimoContacto = datos?.contactos.length ? datos.contactos[datos.contactos.length - 1] : null;
  const opcionElegida = opciones.find(o => o.id === elegida) ?? null;
  const whatsapp = opcionElegida ? mensajeWhatsApp(opcionElegida) : null;

  // Una sustitución ya cubierta ocupa el sitio de la clase: el motor no puede
  // abrirle otra búsqueda (índice único de la 0037), y asignar desde aquí
  // tampoco. Se dice en vez de enseñar botones que no harían nada.
  if (sust && sust.estado === 'confirmada') {
    return (
      <div className="rounded-xl border border-border bg-card p-3.5 text-pretty text-[13px] text-foreground">
        A esta clase ya la cubrió una sustituta. Para cambiar quién la da, en su «⋯», «Editar esta clase».
      </div>
    );
  }

  return (
    <div className="grid gap-2.5">
      <div className="rounded-xl border border-border bg-card p-3.5">
        {cargando && !datos ? (
          <p className="text-[13px] text-muted-foreground">Mirando quién puede darla…</p>
        ) : error && !datos ? (
          <p className="text-[13px] text-destructive">{error}</p>
        ) : !abierta ? (
          <>
            <button type="button" className={BOTON_PRINCIPAL} disabled={ocupado} onClick={onBuscar}>
              <Search size={16} aria-hidden />Buscar sustituta
            </button>
            <p className="mt-2.5 text-pretty text-[13px] leading-relaxed text-foreground">
              {siguiente ? (
                <>
                  {modo.solo ? 'Avisamos por orden a quien mejor encaja: ' : 'Las que mejor encajan: '}
                  <b className="font-semibold">{nombre(siguiente)}</b>{siguiente.motivo ? ` (${siguiente.motivo})` : ''}
                  {resto.length > 0 ? `, ${enumerar(resto.slice(0, 3))}` : ''}.{' '}
                  {modo.solo ? 'La primera que acepte se queda la clase.' : 'Tú das el visto bueno antes de avisar a cada una, y la primera que acepte se queda la clase.'}
                </>
              ) : (
                'Ahora mismo nadie del equipo tiene puesta su disponibilidad a esa hora: el motor no tendría a quién avisar. Asígnala tú aquí abajo, o pide al equipo que ponga sus horas.'
              )}
            </p>
            <p className="mt-1.5 text-[12.5px] text-muted-foreground">
              Tu modo es <b className="font-semibold text-foreground">{modo.nombre}</b>: {modo.texto}
            </p>
          </>
        ) : sust!.estado === 'pendiente_aprobacion' ? (
          <>
            {siguiente && (
              <button type="button" className={BOTON_PRINCIPAL} disabled={ocupado} onClick={() => onAvisar(siguiente.instructorId)}>
                <UserCheck size={16} aria-hidden />Avisar a {nombre(siguiente)}
              </button>
            )}
            <p className="mt-2.5 text-pretty text-[13px] leading-relaxed text-foreground">
              {siguiente ? (
                <>
                  Esperamos tu visto bueno para avisar a <b className="font-semibold">{nombre(siguiente)}</b>
                  {siguiente.motivo ? ` (${siguiente.motivo})` : ''}.{' '}
                  {modo.solo
                    ? (resto.length > 0 ? `Si no puede, seguimos con ${enumerar(resto.slice(0, 3))}.` : '')
                    : 'Si no puede o no contesta, te lo contamos para que elijas a la siguiente.'}
                </>
              ) : 'No queda nadie a quien avisar: asígnala tú aquí abajo.'}
            </p>
          </>
        ) : sust!.estado === 'agotada' ? (
          <>
            <button type="button" className={BOTON_PRINCIPAL} disabled={ocupado} onClick={onVolverABuscar}>
              <Search size={16} aria-hidden />Volver a buscar
            </button>
            <p className="mt-2.5 text-pretty text-[13px] leading-relaxed text-foreground">
              Nadie ha aceptado todavía. «Volver a buscar» recalcula con la disponibilidad de ahora: si alguien la ha cambiado, entra.
            </p>
          </>
        ) : (
          <p className="text-pretty text-[13px] leading-relaxed text-foreground">
            {ultimoContacto ? (
              <>
                Avisada <b className="font-semibold">{nombreDe(ultimoContacto.instructorId)}</b>
                {ultimoContacto.enviadoEn ? ` a las ${horaEstudio(ultimoContacto.enviadoEn)}` : ''}
                {ultimoContacto.canal && CANAL[ultimoContacto.canal] ? ` ${CANAL[ultimoContacto.canal]}` : ''}.{' '}
                {modo.solo
                  ? (resto.length > 0 ? `Si no contesta, seguimos con ${enumerar(resto.slice(0, 3))}.` : 'Es la última de la lista.')
                  : 'Si no contesta, te lo contamos para que decidas.'}
              </>
            ) : 'Buscando sustituta: avisamos a quien mejor encaja.'}
          </p>
        )}
        {abierta && (
          <button type="button" disabled={ocupado} onClick={onDescartar}
            className="mt-2 text-[12.5px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50">
            Ya no hace falta buscar
          </button>
        )}
      </div>

      {/* Asignarla directamente: queda registrado como sustitución (historial,
          aviso a la sustituta en la app y, si quieres, a las clientas). */}
      <div className="rounded-xl border border-dashed border-border p-3.5">
        <p className="text-[13.5px] font-semibold text-foreground">¿Ya sabes quién la da?</p>
        {opciones.length === 0 ? (
          <p className="mt-1.5 text-[12.5px] text-muted-foreground">Nadie más del equipo está libre a esa hora.</p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Instructora que la da</span>
                <select
                  value={elegida}
                  onChange={e => setElegida(e.target.value)}
                  className="min-h-11 w-full min-w-[10rem] cursor-pointer appearance-none truncate rounded-xl border border-border bg-background px-3 text-base text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-fine:text-[13.5px]"
                >
                  <option value="">Elige una instructora</option>
                  {opciones.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                </select>
              </label>
              <button
                type="button"
                className={cn(BOTON_SECUNDARIO, 'shrink-0')}
                disabled={!elegida || ocupado}
                onClick={() => onAsignar(elegida, avisarClientas)}
              >
                Asignar y avisarla
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              {apuntadas > 0 && (avisoClientasApagado ? (
                <p className="text-pretty text-[12.5px] text-muted-foreground">
                  A las clientas no se les avisa del cambio: ese aviso está apagado en Sustituciones.
                </p>
              ) : (
                <label className="flex items-center gap-2 text-[12.5px] text-foreground">
                  <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={avisarClientas} onChange={e => setAvisarClientas(e.target.checked)} />
                  Avisar a {apuntadas === 1 ? 'la clienta apuntada' : `las ${apuntadas} clientas apuntadas`}
                </label>
              ))}
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[12.5px] font-medium text-foreground underline-offset-2 hover:underline">
                  <MessageCircle size={13} className="text-[#25D366]" aria-hidden />Preguntarle antes por WhatsApp
                </a>
              )}
            </div>
            <p className="mt-1.5 text-[12px] text-muted-foreground">El aviso le llega en la app del estudio.</p>
          </>
        )}
      </div>
    </div>
  );
}
