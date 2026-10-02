'use client';

// «Quién me debe» (decisión 2 de las maquetas aprobadas el 2-oct-2026): una fila
// por clienta con todo lo que debe, la deuda más antigua primero, y su ficha al
// lado (desde 1180 px), en un cajón (tablet) o en una hoja (móvil). La suma de
// la lista es «Te deben» de arriba (`agruparDeudas`, con `situacion-recibo`).
//
// Lo que está en el banco va aparte («En el banco»): todavía no es deuda.

import { useCallback, useMemo, useState } from 'react';
import { CalendarClock, CheckSquare, ChevronDown, RefreshCw, Square, X } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import type { MetodoCobro, Recibo } from '@/lib/types';
import { cn, formatEuro } from '@/lib/utils';
import { colorDeAvatar, fechaCorta } from '@/lib/clientas/textos';
import { situacionRecibo } from '@/lib/billing/situacion-recibo';
import { entraEnCobroEnLote } from '@/lib/cobros/cobro-en-lote';
import {
  agruparDeudas, contarChips, diasDebiendo, grupoEnChip, TEXTO_ESTADO, type Chip, type GrupoDeDeuda,
} from '@/lib/cobros/deudas';
import { useEsAncho } from '@/lib/hooks/use-es-ancho';
import { useCoincideMedio } from '@/lib/hooks/use-coincide-medio';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { DashboardDrawer } from '@/components/ui/dashboard-drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { FichaDeudora } from './ficha-deudora';
import { EnElBanco } from './en-el-banco';
import { ProximasCuotas } from './proximas-cuotas';
import { DialogoCobroEnLote } from './dialogo-cobro-en-lote';
import { Buscador, ChipFiltro, PastillaEstado, normalizar } from './piezas';
import type { AccionesRecibo, AvisosCobros } from './use-acciones-recibo';
import type { DatosCobros } from './use-datos-cobros';

const POR_PAGINA = 50;
const METODOS: { metodo: MetodoCobro; texto: string }[] = [
  { metodo: 'EFECTIVO', texto: 'Efectivo' }, { metodo: 'TARJETA', texto: 'Tarjeta' },
  { metodo: 'BIZUM', texto: 'Bizum' }, { metodo: 'TRANSFERENCIA', texto: 'Transferencia' },
];

export function QuienMeDebe({ datos, acciones, avisos }: { datos: DatosCobros; acciones: AccionesRecibo; avisos: AvisosCobros }) {
  const { recibos } = useStudio();
  const esAncho = useEsAncho();
  const enMovil = useCoincideMedio('(max-width: 767.98px)');

  const [chip, setChip] = useState<Chip | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [cuantas, setCuantas] = useState(POR_PAGINA);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [verCuotas, setVerCuotas] = useState(false);
  // «Seleccionar varias»: se marca la clienta y entran sus recibos que se pueden
  // cobrar en lote (sin lo que el cobro automático ya tiene programado).
  const [seleccionando, setSeleccionando] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [metodoLote, setMetodoLote] = useState<MetodoCobro | null>(null);
  const [cobrandoLote, setCobrandoLote] = useState(false);

  const grupos = useMemo(() => agruparDeudas(recibos, id => !!datos.socioDe(id)), [recibos, datos]);
  const seReintentaSolo = useCallback((r: Recibo) => datos.reintentoDe(r)?.tipo === 'SE_COBRA_SOLO', [datos]);
  const chips = useMemo(() => contarChips(grupos, seReintentaSolo), [grupos, seReintentaSolo]);
  const enElBanco = useMemo(() => recibos.filter(r => situacionRecibo(r) === 'EN_CURSO'), [recibos]);

  const q = normalizar(busqueda.trim());
  const filtrados = useMemo(() => grupos.filter(g => grupoEnChip(g, chip, seReintentaSolo)
    && (!q || normalizar(datos.nombreDe(g.socioId)).includes(q) || g.recibos.some(r => normalizar(r.concepto).includes(q)))),
  [grupos, chip, seReintentaSolo, q, datos]);
  const visibles = filtrados.slice(0, cuantas);
  const total = filtrados.reduce((t, g) => t + g.total, 0);
  const nRecibos = filtrados.reduce((t, g) => t + g.recibos.length, 0);

  const grupoAbierto = abierta ? grupos.find(g => g.clave === abierta) ?? null : null;
  const lateral = esAncho && !!grupoAbierto;

  const loteDe = (g: GrupoDeDeuda<Recibo>) => g.recibos.filter(r => entraEnCobroEnLote(r));
  const idsLote = useMemo(
    () => grupos.filter(g => marcadas.has(g.clave)).flatMap(g => loteDe(g).map(r => r.id)),
    [grupos, marcadas],
  );
  const importeLote = recibos.filter(r => idsLote.includes(r.id)).reduce((t, r) => t + r.importe, 0);
  const marcables = filtrados.filter(g => loteDe(g).length > 0);

  function alternar(clave: string) {
    setMarcadas(prev => {
      const s = new Set(prev);
      if (s.has(clave)) s.delete(clave); else s.add(clave);
      return s;
    });
  }
  function salirDeSeleccion() {
    setSeleccionando(false);
    setMarcadas(new Set());
    setMetodoLote(null);
  }

  return (
    <div className={cn('flex items-start gap-5', lateral && 'min-h-[60vh]')}>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ChipFiltro activo={chip === null} n={grupos.length} onClick={() => setChip(null)}>Todas</ChipFiltro>
          {(['DEVUELTO_BANCO', 'NO_SE_PUDO', 'SIN_COBRAR'] as const).map(e => chips[e] > 0 && (
            <ChipFiltro key={e} activo={chip === e} n={chips[e]} onClick={() => setChip(chip === e ? null : e)}>{TEXTO_ESTADO[e]}</ChipFiltro>
          ))}
          {chips.SE_REINTENTA_SOLO > 0 && (
            <ChipFiltro activo={chip === 'SE_REINTENTA_SOLO'} n={chips.SE_REINTENTA_SOLO} onClick={() => setChip(chip === 'SE_REINTENTA_SOLO' ? null : 'SE_REINTENTA_SOLO')}>
              <RefreshCw size={12} aria-hidden />Se reintenta solo
            </ChipFiltro>
          )}
          <span className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <Buscador valor={busqueda} onCambio={v => { setBusqueda(v); setCuantas(POR_PAGINA); }} texto="Buscar clienta o concepto" className="flex-1 sm:w-[220px] sm:flex-none" />
            {grupos.length > 0 && (
              <button
                type="button"
                onClick={() => (seleccionando ? salirDeSeleccion() : setSeleccionando(true))}
                aria-pressed={seleccionando}
                className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                {seleccionando ? <X size={15} aria-hidden /> : <CheckSquare size={15} aria-hidden />}
                {seleccionando ? 'Dejar de seleccionar' : 'Seleccionar varias'}
              </button>
            )}
          </span>
        </div>

        {grupos.length === 0 ? (
          <EmptyState titulo="Nadie te debe nada" descripcion="Cuando una clienta tenga un recibo sin cobrar, aparecerá aquí con lo que debe y cómo se le puede cobrar." />
        ) : filtrados.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card px-4 py-6 text-center text-[13px] text-muted-foreground">Nadie coincide con «{busqueda || (chip ? TEXTO_ESTADO[chip as keyof typeof TEXTO_ESTADO] ?? 'Se reintenta solo' : '')}».</p>
        ) : (
          <section aria-label="Quién me debe" className="overflow-hidden rounded-2xl border border-border bg-card">
            {seleccionando && (
              <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-2 text-[12.5px]">
                <button
                  type="button"
                  onClick={() => setMarcadas(marcadas.size === marcables.length ? new Set() : new Set(marcables.map(g => g.clave)))}
                  className="font-medium text-brand-medio hover:underline"
                >
                  {marcadas.size === marcables.length ? 'Desmarcar todas' : `Marcar todas (${marcables.length})`}
                </button>
                <span className="text-muted-foreground">Lo que se reintenta solo no entra: ya lo cobra el sistema.</span>
              </div>
            )}
            <ul className="divide-y divide-border">
              {visibles.map(g => (
                <FilaDeudora
                  key={g.clave}
                  grupo={g}
                  datos={datos}
                  activa={g.clave === abierta}
                  seleccionando={seleccionando}
                  marcada={marcadas.has(g.clave)}
                  sinLote={loteDe(g).length === 0}
                  compacta={lateral || enMovil}
                  onAbrir={() => (seleccionando ? (loteDe(g).length > 0 && alternar(g.clave)) : setAbierta(g.clave === abierta ? null : g.clave))}
                  onCobrar={() => setAbierta(g.clave)}
                />
              ))}
            </ul>
            {filtrados.length > visibles.length && (
              <button type="button" onClick={() => setCuantas(c => c + POR_PAGINA)} className="w-full border-t border-border px-4 py-2.5 text-[13px] font-medium text-brand-medio hover:bg-muted/40">
                Ver {Math.min(POR_PAGINA, filtrados.length - visibles.length)} más
              </button>
            )}
            <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2.5 text-[12.5px] text-muted-foreground">
              <span>{filtrados.length} {filtrados.length === 1 ? 'clienta' : 'clientas'} · {nRecibos} {nRecibos === 1 ? 'recibo' : 'recibos'} · la deuda más antigua primero</span>
              <span className="font-semibold tabular-nums text-foreground"><CifraPrivada>{formatEuro(total)}</CifraPrivada></span>
            </div>
          </section>
        )}

        <EnElBanco recibos={enElBanco} datos={datos} acciones={acciones} />

        <div>
          <button
            type="button"
            onClick={() => setVerCuotas(v => !v)}
            aria-expanded={verCuotas}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-medio hover:underline"
          >
            <CalendarClock size={14} aria-hidden />Próximas cuotas
            <ChevronDown size={14} className={cn('transition-transform', verCuotas && 'rotate-180')} aria-hidden />
          </button>
          {verCuotas && <div className="mt-2"><ProximasCuotas datos={datos} /></div>}
        </div>
      </div>

      {lateral && grupoAbierto && (
        <aside aria-label={`Ficha de ${datos.nombreDe(grupoAbierto.socioId)}`} className="sticky top-4 flex max-h-[calc(100dvh-2rem)] w-[400px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <FichaDeudora key={grupoAbierto.clave} grupo={grupoAbierto} datos={datos} acciones={acciones} avisos={avisos} onCerrar={() => setAbierta(null)} />
        </aside>
      )}
      {!esAncho && (
        <DashboardDrawer
          open={!!grupoAbierto}
          onClose={() => setAbierta(null)}
          label={grupoAbierto ? `Ficha de ${datos.nombreDe(grupoAbierto.socioId)}` : 'Ficha'}
          desdeAbajo={enMovil}
          backdropClassName={enMovil ? 'fixed inset-0 z-50 flex flex-col justify-end bg-foreground/20' : undefined}
          sheetClassName={enMovil
            ? 'relative flex h-[calc(100dvh-4.5rem)] w-full flex-col overflow-hidden rounded-t-[28px] bg-card shadow-[0_-12px_40px_rgba(0,0,0,0.18)]'
            : 'relative flex h-full w-full flex-col bg-card shadow-[-20px_0_60px_-20px_rgba(0,0,0,0.3)] md:w-[440px]'}
        >
          {grupoAbierto && <FichaDeudora key={grupoAbierto.clave} grupo={grupoAbierto} datos={datos} acciones={acciones} avisos={avisos} onCerrar={() => setAbierta(null)} />}
        </DashboardDrawer>
      )}

      {seleccionando && marcadas.size > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom,0px)+64px)] lg:pb-[calc(env(safe-area-inset-bottom,0px)+12px)] lg:pl-[var(--sidebar-w)]">
          {/* `data-barra-seleccion`: la burbuja de ayuda del panel se aparta (globals.css). */}
          <div data-barra-seleccion role="toolbar" aria-label="Cobrar las seleccionadas" className="pointer-events-auto flex w-full max-w-2xl flex-wrap items-center gap-2 rounded-2xl bg-sidebar px-3 py-2.5 text-sidebar-foreground shadow-xl md:w-auto">
            <strong className="px-1 text-[13px] font-semibold">
              {marcadas.size} {marcadas.size === 1 ? 'seleccionada' : 'seleccionadas'} · <CifraPrivada>{formatEuro(importeLote)}</CifraPrivada>
            </strong>
            <span className="text-[12.5px] text-sidebar-foreground/70">Cómo pagan:</span>
            {METODOS.map(m => (
              <button
                key={m.metodo} type="button" onClick={() => setMetodoLote(m.metodo)} aria-pressed={metodoLote === m.metodo}
                className={cn('rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium', metodoLote === m.metodo ? 'bg-sidebar-foreground text-sidebar' : 'border border-sidebar-foreground/30')}
              >
                {m.texto}
              </button>
            ))}
            <button
              type="button"
              disabled={!metodoLote || idsLote.length === 0}
              onClick={() => setCobrandoLote(true)}
              className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-semibold text-brand-foreground disabled:opacity-50"
            >
              Cobrar {marcadas.size === 1 ? 'la seleccionada' : `las ${marcadas.size}`}
            </button>
          </div>
        </div>
      )}
      {metodoLote && (
        <DialogoCobroEnLote
          ids={idsLote}
          metodo={metodoLote}
          abierto={cobrandoLote}
          avisos={avisos}
          onCerrar={cobrado => { setCobrandoLote(false); if (cobrado) salirDeSeleccion(); }}
        />
      )}
    </div>
  );
}

function FilaDeudora({ grupo, datos, activa, seleccionando, marcada, sinLote, compacta, onAbrir, onCobrar }: {
  grupo: GrupoDeDeuda<Recibo>;
  datos: DatosCobros;
  activa: boolean;
  seleccionando: boolean;
  marcada: boolean;
  sinLote: boolean;
  compacta: boolean;
  onAbrir: () => void;
  onCobrar: () => void;
}) {
  const socio = datos.socioDe(grupo.socioId);
  const dias = diasDebiendo(grupo, datos.hoy);
  const medio = socio ? datos.medioDe(socio.id) : null;
  const solo = grupo.recibos.map(r => datos.seCobraSoloEl(r)).find(Boolean);
  const textoMedio = medio?.estado === 'LISTO'
    ? (medio.aviso ?? (medio.domiciliacionRemesa || medio.domiciliacionStripe ? 'Domiciliada' : medio.tarjeta ? medio.tarjeta.nombre : 'Sin tarjeta'))
    : null;
  return (
    <li data-deudora={grupo.clave} className={cn('flex items-center gap-3 px-4 py-3 transition-colors', activa && 'bg-brand/8', seleccionando && sinLote && 'opacity-60')}>
      {seleccionando && (
        <span className="shrink-0 text-foreground" aria-hidden>{marcada ? <CheckSquare size={18} /> : <Square size={18} className="text-muted-foreground" />}</span>
      )}
      <button type="button" onClick={onAbrir} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={seleccionando ? `${marcada ? 'Desmarcar' : 'Marcar'} a ${datos.nombreDe(grupo.socioId)}` : `Abrir la ficha de ${datos.nombreDe(grupo.socioId)}`} disabled={seleccionando && sinLote}>
        {socio
          ? <ProfileAvatar avatarId={socio.avatar} nombre={socio.nombre} apellidos={socio.apellidos} color={colorDeAvatar(`${socio.nombre}${socio.apellidos}`)} size="sm" />
          : <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">{grupo.tipo === 'VENTA_MOSTRADOR' ? 'VM' : '?'}</span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-foreground">{datos.nombreDe(grupo.socioId)}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-muted-foreground">
            <span className="truncate">{grupo.recibos.length === 1 ? grupo.recibos[0].concepto : `${grupo.recibos.length} recibos`}</span>
            <span>· desde el {fechaCorta(grupo.desde, datos.hoy)}{dias >= 30 && <b className="font-semibold text-destructive"> · {dias} días</b>}</span>
            {!compacta && textoMedio && <span className={cn(medio?.estado === 'LISTO' && medio.aviso && 'text-destructive')}>· {textoMedio}</span>}
          </span>
          {seleccionando && sinLote
            ? <span className="mt-0.5 block text-[12px] text-muted-foreground">Se cobra solo: no entra en el cobro de varias</span>
            : solo && <span className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground"><CalendarClock size={12} aria-hidden />Se reintenta sola {solo}</span>}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-[14.5px] font-semibold tabular-nums text-foreground"><CifraPrivada>{formatEuro(grupo.total)}</CifraPrivada></span>
          <PastillaEstado estado={grupo.peor} />
        </span>
      </button>
      {!compacta && !seleccionando && (
        <button type="button" onClick={onCobrar} className="ml-1 hidden min-h-9 w-[92px] items-center justify-center rounded-lg border border-border bg-card text-[13px] font-medium text-foreground transition-colors hover:bg-muted md:inline-flex">
          Cobrar
        </button>
      )}
    </li>
  );
}
