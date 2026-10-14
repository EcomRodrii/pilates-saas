'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Notificaciones en el panel nuevo (14-oct-2026): el registro de lo que el
// sistema ha enviado, con las cifras de color arriba (que filtran la lista), el
// canal en píldoras y cada entrega con su canal en una baldosa de color.
//
// Solo pinta lo que la pantalla ya carga de /api/notifications/admin: las
// cifras y los filtros salen de `lib/notifications/registro.ts`, y «Reintentar»
// es el mismo de siempre (lo recibe de la página).
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState, type ElementType } from 'react';
import { Bell, BellOff, Mail, MessageSquare, RotateCcw, Search, Send, Smartphone, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Baldosa, PantallaVacia, TarjetaCifra, type Tono } from '@/components/dashboard/vivo';
import { BOTON_BORDE, TarjetaCifraFiltro } from '@/components/dashboard/vivo-seccion';
import { CATEGORIA_ETIQUETA } from '@/lib/notifications/catalog';
import type { NotificationCategory } from '@/lib/notifications/types';
import {
  ESTADO_ENTREGA_TEXTO, TOPE_REGISTRO, cifrasRegistro, coincideBusqueda, entregasDelCanal, filtrarRegistro,
  type CanalRegistro, type EstadoRegistro,
} from '@/lib/notifications/registro';

export interface AvisoAdmin {
  id: string;
  recipientRole: string;
  recipientName?: string | null;
  eventType: string;
  category: NotificationCategory;
  priority: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  deliveries: { channel: string; status: string; error: string | null; detalle?: string | null; entregadaEn?: string | null }[];
}

const ROL_ETIQUETA: Record<string, string> = {
  PROPIETARIO: 'Propietaria', MANAGER: 'Gerencia', RECEPCION: 'Recepción', INSTRUCTOR: 'Instructora', SOCIA: 'Socia',
};

/** Cada canal, con su color: el mismo en la baldosa de la fila y en su píldora. */
const CANAL: Record<string, { etiqueta: string; tono: Tono; Icono: ElementType }> = {
  INAPP: { etiqueta: 'En la app', tono: 'azul', Icono: Bell },
  PUSH: { etiqueta: 'Push', tono: 'magenta', Icono: Smartphone },
  EMAIL: { etiqueta: 'Correo', tono: 'indigo', Icono: Mail },
};
// WhatsApp y SMS salieron del enum en 2026-09 sin haber entregado nada, pero la
// columna aún los admite: si apareciera uno, se pinta con su nombre tal cual.
const canalDe = (c: string) => CANAL[c] ?? { etiqueta: c, tono: 'verde' as Tono, Icono: MessageSquare };

/** «48 avisos … por correo»: lo que se cuenta con el canal elegido. */
const POR_CANAL: Record<Exclude<CanalRegistro, 'todos'>, string> = {
  INAPP: 'en la app', PUSH: 'por push', EMAIL: 'por correo',
};

const PILDORAS_CANAL: { valor: CanalRegistro; label: string }[] = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'INAPP', label: 'App' },
  { valor: 'PUSH', label: 'Push' },
  { valor: 'EMAIL', label: 'Correo' },
];

const PRIORIDAD: Record<string, { label: string; color: string }> = {
  CRITICA: { label: 'Crítica', color: 'var(--destructive)' },
  ALTA: { label: 'Alta', color: 'var(--warning)' },
  MEDIA: { label: 'Media', color: 'var(--muted-foreground)' },
  BAJA: { label: 'Baja', color: 'var(--muted-foreground)' },
  SILENCIOSA: { label: 'Silenciosa', color: 'var(--muted-foreground)' },
};

const COLOR_ESTADO: Record<string, string> = {
  SENT: 'text-success', DELIVERED: 'text-success', PENDING: 'text-muted-foreground',
  SKIPPED: 'text-muted-foreground', FAILED: 'text-destructive',
};

function fecha(iso: string) {
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function RegistroNuevo({ items, cargando, reintentando, errorReintento, onReintentar }: {
  items: AvisoAdmin[];
  cargando: boolean;
  reintentando: string | null;
  errorReintento: string | null;
  onReintentar: (id: string) => void;
}) {
  const [buscar, setBuscar] = useState('');
  const [canal, setCanal] = useState<CanalRegistro>('todos');
  const [estado, setEstado] = useState<EstadoRegistro>('todos');

  const cifras = useMemo(() => cifrasRegistro(items, canal), [items, canal]);
  const visibles = useMemo(
    () => filtrarRegistro(items, canal, estado).filter(n => coincideBusqueda(n, buscar)),
    [items, canal, estado, buscar],
  );
  const hayFiltro = canal !== 'todos' || estado !== 'todos' || buscar.trim() !== '';
  const conmutar = (e: EstadoRegistro) => setEstado(actual => (actual === e ? 'todos' : e));
  const quitarFiltros = () => { setCanal('todos'); setEstado('todos'); setBuscar(''); };

  const v = (n: number) => (cargando ? '—' : String(n));
  const porCanal = canal === 'todos' ? null : POR_CANAL[canal];

  // Sin un solo aviso todavía: el vacío que enseña qué aparecerá aquí.
  if (!cargando && items.length === 0) {
    return (
      <PantallaVacia
        className="mt-5"
        tono="azul"
        Icono={Bell}
        titulo="Aquí verás cada aviso que sale"
        texto="Cada vez que Tentare avisa a alguien del estudio o a una alumna, queda apuntado: a quién, por qué canal y con qué resultado."
        ejemplos={[
          { accion: 'Reserva confirmada', cuando: 'a la alumna, en su app y por push' },
          { accion: 'Recordatorio de clase', cuando: 'a la alumna, antes de su clase' },
          { accion: 'Pago fallido', cuando: 'al estudio y a la alumna' },
        ]}
      />
    );
  }

  return (
    <div className="mt-5 space-y-5">
      {/* 2 × 2 hasta que caben cuatro con aire, como en la home. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
        <TarjetaCifra
          etiqueta="Avisos"
          tono="azul"
          Icono={Bell}
          href={null}
          valor={v(cifras.avisos)}
          abajo={porCanal ?? (items.length >= TOPE_REGISTRO ? `los ${TOPE_REGISTRO} más recientes` : 'en el registro')}
        />
        <TarjetaCifraFiltro
          etiqueta="Enviados"
          tono="verde"
          Icono={Send}
          valor={v(cifras.enviados)}
          arriba={!cargando && cifras.mostrados > 0 ? `${cifras.mostrados} en pantalla` : undefined}
          abajo={porCanal ? `aceptados ${porCanal}` : 'aceptados por su canal'}
          activo={estado === 'enviados'}
          onClick={() => conmutar('enviados')}
          accion="Ver solo los enviados"
        />
        <TarjetaCifraFiltro
          etiqueta="Con fallo"
          tono="magenta"
          Icono={TriangleAlert}
          valor={v(cifras.conFallo)}
          abajo={cifras.conFallo > 0 ? 'se pueden reintentar' : 'ninguno ha fallado'}
          activo={estado === 'fallo'}
          onClick={() => conmutar('fallo')}
          accion="Ver solo los que fallaron"
        />
        <TarjetaCifraFiltro
          etiqueta="Sin enviar"
          tono="indigo"
          Icono={BellOff}
          valor={v(cifras.sinEnviar)}
          abajo={porCanal ? `no salieron ${porCanal}` : 'no salieron por ningún canal'}
          activo={estado === 'sin_enviar'}
          onClick={() => conmutar('sin_enviar')}
          accion="Ver solo los que no salieron"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-h-10 w-full items-center gap-2 rounded-full border border-border bg-card px-4 sm:max-w-md">
          <Search size={15} className="shrink-0 text-muted-foreground" aria-hidden />
          <input
            type="search" value={buscar} onChange={e => setBuscar(e.target.value)}
            placeholder="Buscar por destinatario, aviso o error…"
            aria-label="Buscar notificaciones"
            className="min-w-0 flex-1 bg-transparent py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <PildorasCanal valor={canal} onCambio={setCanal} />
      </div>

      {errorReintento && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2.5 text-[12px] font-semibold text-destructive">
          {errorReintento}
        </p>
      )}

      {hayFiltro && !cargando && (
        <p className="text-[12.5px] text-muted-foreground" aria-live="polite">
          {visibles.length === 1 ? 'Se ve 1 aviso' : `Se ven ${visibles.length} avisos`} de {items.length}.{' '}
          <button type="button" onClick={quitarFiltros} className="font-semibold" style={{ color: 'var(--t-text-link)' }}>Quitar filtros</button>
        </p>
      )}

      <section aria-label="Avisos enviados" className="overflow-hidden rounded-t-card border border-border bg-card shadow-t-card">
        {cargando ? (
          <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">Cargando…</p>
        ) : visibles.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[14px] font-semibold text-foreground">Ningún aviso con estos filtros</p>
            <button type="button" onClick={quitarFiltros} className="mt-1.5 text-[13px] font-semibold" style={{ color: 'var(--t-text-link)' }}>Quitar filtros</button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visibles.map(n => (
              <FilaAviso
                key={n.id}
                aviso={n}
                // Con un canal elegido, solo sus entregas: las demás despistan.
                entregas={entregasDelCanal(n.deliveries, canal)}
                reintentando={reintentando === n.id}
                onReintentar={() => onReintentar(n.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FilaAviso({ aviso: n, entregas, reintentando, onReintentar }: {
  aviso: AvisoAdmin;
  entregas: AvisoAdmin['deliveries'];
  reintentando: boolean;
  onReintentar: () => void;
}) {
  const prio = PRIORIDAD[n.priority];
  const rol = ROL_ETIQUETA[n.recipientRole] ?? n.recipientRole;
  // «Reintentar» mira TODAS sus entregas, como en la tabla de siempre: con un
  // canal elegido, el fallo de otro canal también se reintenta desde aquí.
  const fallo = n.deliveries.some(d => d.status === 'FAILED');
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:px-5 lg:flex-row lg:items-start lg:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-[14px] font-semibold leading-snug text-foreground">{n.title}</p>
          <span className="shrink-0 whitespace-nowrap pt-0.5 text-[12px] text-muted-foreground tabular-nums">{fecha(n.createdAt)}</span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-muted-foreground">{n.body}</p>
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-muted-foreground">
          <span className="font-semibold text-foreground">{n.recipientName || rol}</span>
          {n.recipientName && <span>· {rol}</span>}
          <span>· {CATEGORIA_ETIQUETA[n.category] ?? n.category}</span>
          <span
            className="ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ color: prio?.color ?? 'var(--muted-foreground)', backgroundColor: `color-mix(in srgb, ${prio?.color ?? 'var(--muted-foreground)'} 12%, transparent)` }}
            title="Prioridad"
          >
            {prio?.label ?? n.priority}
          </span>
        </p>
      </div>

      <div className="flex flex-col gap-2.5 lg:w-[300px] lg:shrink-0">
        {entregas.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">Sin envíos por ningún canal.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {entregas.map((d, i) => {
              const c = canalDe(d.channel);
              return (
                <li key={`${d.channel}-${i}`} className="flex items-start gap-2.5">
                  <Baldosa tono={c.tono} Icono={c.Icono} tamano="sm" />
                  <div className="min-w-0 text-[12.5px] leading-snug">
                    <p>
                      <span className="font-semibold text-foreground">{c.etiqueta}</span>
                      <span className="text-muted-foreground"> · </span>
                      <span className={cn('font-semibold', COLOR_ESTADO[d.status])} title={d.status}>{ESTADO_ENTREGA_TEXTO[d.status] ?? d.status}</span>
                      {d.entregadaEn && <span className="text-muted-foreground"> · {fecha(d.entregadaEn)}</span>}
                    </p>
                    {/* El motivo: rojo si falló; si no se envió, es la explicación. */}
                    {d.error && <p className={cn('mt-0.5 break-words text-[11.5px]', d.status === 'FAILED' ? 'text-destructive' : 'text-muted-foreground')}>{d.error}</p>}
                    {d.detalle && d.channel === 'PUSH' && <p className="mt-0.5 break-words text-[11px] text-muted-foreground/80">{d.detalle}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {fallo && (
          <button
            type="button"
            onClick={onReintentar}
            disabled={reintentando}
            className={cn(BOTON_BORDE, 'h-8 self-start px-3 text-[12px] disabled:opacity-50')}
          >
            <RotateCcw size={13} aria-hidden /> {reintentando ? 'Reintentando…' : 'Reintentar'}
          </button>
        )}
      </div>
    </li>
  );
}

/** El canal en píldoras, como el periodo de las gráficas, con su nombre de grupo. */
function PildorasCanal({ valor, onCambio }: { valor: CanalRegistro; onCambio: (v: CanalRegistro) => void }) {
  return (
    <div className="inline-flex shrink-0 self-start rounded-full bg-muted p-1 sm:self-auto" role="group" aria-label="Canal">
      {PILDORAS_CANAL.map(o => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onCambio(o.valor)}
          aria-pressed={valor === o.valor}
          className={cn(
            'rounded-full px-3 py-1 text-[12.5px] font-semibold transition-colors',
            valor === o.valor ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
