'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Banknote, Check, CircleDollarSign, Clock, Copy, Gift, Landmark, Mail, Plus, ScanLine, Search, Settings2, Smartphone, X,
} from 'lucide-react';
import { authHeader } from '@/lib/api-client';
import { puedeMoverDinero, useRol } from '@/lib/permisos';
import { hoyEnEstudio } from '@/lib/utils';
import {
  EMAIL_VALIDO, NOMBRE_ESTADO_REGALO, diasParaCaducar, formatearEuros, type AjustesRegalo, type EstadoRegalo,
} from '@/lib/regalo/reglas';
import type { TarjetaRegaloVista } from '@/lib/regalo/servidor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DashboardDrawer } from '@/components/ui/dashboard-drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Interruptor } from '@/components/ui/interruptor';
import { Toast } from '@/components/ui/toast';

type Datos = { ajustes: AjustesRegalo; tarjetas: TarjetaRegaloVista[]; pasivoVivo: number; puedeEditarAjustes: boolean };
type Vista = TarjetaRegaloVista;
type Hoja =
  | { t: 'gastar'; tarjeta: Vista }
  | { t: 'anular'; tarjeta: Vista }
  | { t: 'codigo' }
  | { t: 'vender' }
  | { t: 'ajustes' };
type Filtro = 'TODAS' | EstadoRegalo;

const AVISO_CADUCIDAD_DIAS = 30;
const fecha = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const campo = 'w-full h-11 px-3 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/70 transition-colors hover:border-muted-foreground/50 focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 aria-invalid:border-destructive';
const etiqueta = 'block text-[13px] font-semibold text-foreground mb-1.5';
const chip = 'inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-full border text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

const VARIANTE_ESTADO: Record<EstadoRegalo, 'success' | 'outline' | 'warning' | 'destructive'> = {
  ACTIVA: 'success', AGOTADA: 'outline', CADUCADA: 'warning', ANULADA: 'destructive',
};

async function llamar(url: string, metodo: 'GET' | 'PUT' | 'POST', cuerpo?: unknown): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  try {
    const r = await fetch(url, {
      method: metodo, headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });
    return { ok: r.ok, status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  } catch { return { ok: false, status: 0, json: { error: 'Sin conexión. Inténtalo de nuevo.' } }; }
}

/** «12», «12,5» o «12.50» → euros con 2 decimales; NaN si no es un importe. */
function leerImporte(texto: string): number {
  const t = texto.trim();
  if (!/^\d+([.,]\d{1,2})?$/.test(t)) return NaN;
  return Math.round(Number(t.replace(',', '.')) * 100) / 100;
}

// Pestaña «Tarjeta regalo» de Paquetes. Nada optimista: cada acción espera la respuesta del
// servidor y vuelve a leer la lista. El saldo que se enseña es el del libro, no uno calculado aquí.
export function PanelRegalo() {
  const rol = useRol();
  const mueveDinero = puedeMoverDinero(rol);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [avisoError, setAvisoError] = useState(false);
  const [hoja, setHoja] = useState<(Hoja & { clave: number }) | null>(null);
  const [abierta, setAbierta] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('TODAS');
  const [busqueda, setBusqueda] = useState('');
  const [reenviando, setReenviando] = useState<string | null>(null);
  const clave = useRef(0);

  const cargar = useCallback(async () => {
    const r = await llamar('/api/regalo', 'GET');
    if (!r.ok) { setError((r.json.error as string) ?? 'No se han podido cargar las tarjetas regalo.'); return; }
    setError(null); setDatos(r.json as unknown as Datos);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos del servidor; el estado se actualiza al llegar la respuesta
  useEffect(() => { void cargar(); }, [cargar]);

  const abrir = (h: Hoja) => { clave.current += 1; setHoja({ ...h, clave: clave.current }); setAbierta(true); };
  const cerrar = () => setAbierta(false);
  const avisar = async (m: string) => { setAvisoError(false); setAviso(m); await cargar(); };

  const hoy = hoyEnEstudio();
  const tarjetas = datos?.tarjetas;
  const cuentas = useMemo(() => {
    const c: Record<Filtro, number> = { TODAS: 0, ACTIVA: 0, AGOTADA: 0, CADUCADA: 0, ANULADA: 0 };
    for (const t of tarjetas ?? []) { c.TODAS += 1; c[t.estado_efectivo as EstadoRegalo] += 1; }
    return c;
  }, [tarjetas]);
  const porCaducar = useMemo(() => (tarjetas ?? []).filter(t => {
    if (t.estado_efectivo !== 'ACTIVA') return false;
    const d = diasParaCaducar(t.caduca_en, hoy);
    return d >= 0 && d <= AVISO_CADUCIDAD_DIAS;
  }), [tarjetas, hoy]);
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (tarjetas ?? []).filter(t => (filtro === 'TODAS' || t.estado_efectivo === filtro)
      && (!q || [t.destinatario_nombre, t.comprador_nombre, t.destinatario_email, t.comprador_email].some(x => x?.toLowerCase().includes(q))));
  }, [tarjetas, filtro, busqueda]);

  if (error && !datos) {
    return (
      <div className="bg-card rounded-2xl border border-border p-6 text-sm flex items-center justify-between gap-3" role="alert">
        <span>{error}</span><Button variant="outline" onClick={() => void cargar()}>Reintentar</Button>
      </div>
    );
  }
  if (!datos) {
    return (
      <div className="space-y-4" aria-busy aria-label="Cargando tarjetas regalo">
        <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />)}</div>
        <div className="h-64 rounded-2xl bg-muted animate-pulse" />
      </div>
    );
  }

  async function reenviar(t: Vista) {
    if (reenviando) return;
    setReenviando(t.id); setAviso(null);
    const r = await llamar(`/api/regalo/${t.id}`, 'POST', { accion: 'reenviar' });
    setReenviando(null);
    if (!r.ok) { setAvisoError(true); setAviso((r.json.error as string) ?? 'No se ha podido reenviar el correo.'); return; }
    setAvisoError(false); setAviso(`Correo reenviado a ${t.destinatario_nombre ?? 'quien lo recibe'}.`);
    await cargar();
  }

  const a = datos.ajustes;
  const sinTarjetas = datos.tarjetas.length === 0;
  const sumaPorCaducar = porCaducar.reduce((s, t) => s + t.saldo, 0);

  return (
    <div className="space-y-5" data-testid="panel-regalo">
      {aviso && <Toast message={aviso} variant={avisoError ? 'error' : 'exito'} onDismiss={() => setAviso(null)} />}
      {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}

      {/* Resumen. El saldo pendiente es un PASIVO (dinero cobrado por algo que aún no se ha prestado). */}
      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
        <section className="bg-card rounded-2xl border border-border p-5" aria-labelledby="rg-pasivo">
          <p id="rg-pasivo" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Saldo pendiente de usar</p>
          <p className="text-3xl font-extrabold mt-1 tabular-nums text-foreground" data-testid="pasivo-vivo">{formatearEuros(datos.pasivoVivo)}</p>
          <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
            Dinero cobrado por clases que aún no has dado: <b className="text-foreground">no es ingreso</b> hasta que se gasta y no sale en Cobros ni en Informes. Cómo declararlo lo decide tu gestoría.
          </p>
        </section>
        <section className="bg-card rounded-2xl border border-border p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Tarjetas activas</p>
          <p className="text-3xl font-extrabold mt-1 tabular-nums text-foreground">{cuentas.ACTIVA}</p>
          <p className="text-[13px] text-muted-foreground mt-2">de {cuentas.TODAS} {cuentas.TODAS === 1 ? 'vendida' : 'vendidas'}</p>
        </section>
        <section className="bg-card rounded-2xl border border-border p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Caducan en {AVISO_CADUCIDAD_DIAS} días</p>
          <p className="text-3xl font-extrabold mt-1 tabular-nums text-foreground">{porCaducar.length}</p>
          <p className="text-[13px] text-muted-foreground mt-2">
            {porCaducar.length === 0 ? 'Ninguna por ahora' : `${formatearEuros(sumaPorCaducar)} que aún no se han gastado`}
          </p>
        </section>
      </div>

      {/* Acciones: lo que hace recepción a diario, a un toque. */}
      <div className="flex flex-wrap items-center gap-2">
        {mueveDinero && (
          <>
            <Button size="lg" onClick={() => abrir({ t: 'codigo' })}><ScanLine aria-hidden /> Cobrar con un código</Button>
            <Button size="lg" variant="outline" onClick={() => abrir({ t: 'vender' })} data-testid="abrir-venta-mostrador"><Plus aria-hidden /> Vender en el mostrador</Button>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Badge variant={a.activo ? 'success' : 'outline'} className="h-6 px-2.5 text-[12px]">
            {a.activo ? 'Venta online activada' : 'Venta online desactivada'}
          </Badge>
          <Button size="lg" variant="outline" onClick={() => abrir({ t: 'ajustes' })}><Settings2 aria-hidden /> Ajustes de la tarjeta</Button>
        </div>
      </div>

      {sinTarjetas ? (
        <EmptyState
          icono={Gift}
          titulo="Aún no se ha vendido ninguna tarjeta regalo"
          descripcion={a.activo
            ? 'Tus clientas ya pueden regalarlas desde tu página de reservas. También puedes vender una en el mostrador cuando alguien pague en persona.'
            : 'Actívalas para vender saldo en euros que se regala por correo y se gasta en varias veces. Mientras tanto, puedes venderlas en el mostrador.'}
          cta={!a.activo && datos.puedeEditarAjustes
            ? { label: 'Activar tarjetas regalo', onClick: () => abrir({ t: 'ajustes' }), icono: Gift }
            : mueveDinero ? { label: 'Vender la primera', onClick: () => abrir({ t: 'vender' }), icono: Plus } : undefined}
        />
      ) : (
        <section className="bg-card rounded-2xl border border-border overflow-hidden" aria-label="Tarjetas vendidas">
          <div className="flex flex-col gap-3 p-4 border-b border-border md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
              {(['TODAS', 'ACTIVA', 'AGOTADA', 'CADUCADA', 'ANULADA'] as Filtro[]).map(f => (
                <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}
                  className={`${chip} ${filtro === f ? 'bg-foreground text-background border-foreground' : 'bg-background text-foreground border-border hover:bg-muted'}`}>
                  {f === 'TODAS' ? 'Todas' : f === 'ACTIVA' ? 'Activas' : f === 'AGOTADA' ? 'Gastadas' : f === 'CADUCADA' ? 'Caducadas' : 'Anuladas'}
                  <span className="tabular-nums opacity-70">{cuentas[f]}</span>
                </button>
              ))}
            </div>
            <label className="relative md:w-64">
              <span className="sr-only">Buscar por nombre o email</span>
              <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="search" className={`${campo} pl-9`} placeholder="Buscar por nombre o email" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            </label>
          </div>

          {visibles.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-semibold text-foreground">Ninguna tarjeta coincide</p>
              <button type="button" className="text-[13px] text-muted-foreground underline underline-offset-2 mt-1" onClick={() => { setFiltro('TODAS'); setBusqueda(''); }}>Quitar filtros</button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {visibles.map(t => {
                const estado = t.estado_efectivo as EstadoRegalo;
                const dias = diasParaCaducar(t.caduca_en, hoy);
                const pronto = estado === 'ACTIVA' && dias >= 0 && dias <= AVISO_CADUCIDAD_DIAS;
                return (
                  <li key={t.id} data-testid="fila-regalo" className="grid gap-3 p-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center md:gap-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[15px] font-bold text-foreground truncate">{t.destinatario_nombre ?? 'Sin destinatario'}</p>
                        <Badge variant={VARIANTE_ESTADO[estado] ?? 'outline'} title={t.anulada_motivo ?? undefined}>{NOMBRE_ESTADO_REGALO[estado] ?? estado}</Badge>
                      </div>
                      <p className="text-[13px] text-muted-foreground mt-0.5 truncate">
                        De {t.comprador_nombre ?? '—'} · {t.origen === 'MANUAL' ? 'mostrador' : 'online'}
                      </p>
                      {estado === 'ANULADA' && t.anulada_motivo && <p className="text-[12px] text-muted-foreground mt-0.5 truncate">Motivo: {t.anulada_motivo}</p>}
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm text-foreground tabular-nums">
                        <b className="text-[17px]">{formatearEuros(t.saldo)}</b>
                        <span className="text-muted-foreground"> de {formatearEuros(t.importe_inicial)}</span>
                      </p>
                      <Barra total={t.importe_inicial} saldo={t.saldo} apagada={estado !== 'ACTIVA'} className="mt-1.5" />
                      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
                        {pronto
                          ? <Badge variant="warning"><Clock aria-hidden /> {dias === 0 ? 'Caduca hoy' : `Caduca en ${dias} ${dias === 1 ? 'día' : 'días'}`}</Badge>
                          : <>{estado === 'CADUCADA' ? 'Caducó' : 'Caduca'} el {fecha(t.caduca_en)}</>}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                      {mueveDinero && estado === 'ACTIVA' && (
                        <>
                          <Button variant="brand" onClick={() => abrir({ t: 'gastar', tarjeta: t })}><CircleDollarSign aria-hidden /> Gastar</Button>
                          <Button variant="outline" disabled={!!reenviando || !t.destinatario_email} onClick={() => void reenviar(t)}
                            title={t.destinatario_email ? undefined : 'No tiene email guardado'}>
                            <Mail aria-hidden /> {reenviando === t.id ? 'Enviando…' : 'Reenviar'}
                          </Button>
                          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => abrir({ t: 'anular', tarjeta: t })}>Anular</Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {hoja?.t === 'gastar' && (
        <Lateral abierta={abierta} onCerrar={cerrar} titulo="Gastar saldo" sub="Descuenta de la tarjeta lo que la clienta usa hoy.">
          <FormGastar key={hoja.clave} t={hoja.tarjeta} onCerrar={cerrar} onHecho={avisar} />
        </Lateral>
      )}
      {hoja?.t === 'anular' && (
        <Lateral abierta={abierta} onCerrar={cerrar} titulo="Anular tarjeta" sub="Deja la tarjeta sin saldo para siempre.">
          <FormAnular key={hoja.clave} t={hoja.tarjeta} onCerrar={cerrar} onHecho={avisar} />
        </Lateral>
      )}
      {hoja?.t === 'codigo' && (
        <Lateral abierta={abierta} onCerrar={cerrar} titulo="Cobrar con un código" sub="Escribe el código del correo de la clienta.">
          <BuscarCodigo key={hoja.clave} onCerrar={cerrar} onElegida={(t) => abrir({ t: 'gastar', tarjeta: t })} />
        </Lateral>
      )}
      {hoja?.t === 'vender' && (
        <Lateral abierta={abierta} onCerrar={cerrar} titulo="Vender en el mostrador" sub="Para una tarjeta que ya has cobrado fuera de Tentare.">
          <FormVender key={hoja.clave} ajustes={a} onCerrar={cerrar} onVendida={avisar} />
        </Lateral>
      )}
      {hoja?.t === 'ajustes' && (
        <Lateral abierta={abierta} onCerrar={cerrar} titulo="Ajustes de la tarjeta" sub="Qué se vende, por cuánto y cuánto dura.">
          <FormAjustes key={hoja.clave} datos={datos} onCerrar={cerrar} onGuardado={avisar} />
        </Lateral>
      )}
    </div>
  );
}

// ── Piezas ───────────────────────────────────────────────────────────────────

/** Barra de lo que QUEDA por gastar (llena = tarjeta intacta). */
function Barra({ total, saldo, apagada, className = '' }: { total: number; saldo: number; apagada?: boolean; className?: string }) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (saldo / total) * 100)) : 0;
  return (
    <div role="img" aria-label={`Quedan ${formatearEuros(saldo)} de ${formatearEuros(total)}`} className={`h-2 rounded-full bg-muted overflow-hidden ${className}`}>
      <div className={`h-full rounded-full transition-[width] duration-500 ${apagada ? 'bg-muted-foreground/40' : 'bg-brand-medio'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Cajón lateral con cabecera y cierre; el contenido pone su cuerpo y su pie. */
function Lateral({ abierta, onCerrar, titulo, sub, children }: {
  abierta: boolean; onCerrar: () => void; titulo: string; sub?: string; children: React.ReactNode;
}) {
  return (
    <DashboardDrawer
      open={abierta} onClose={onCerrar} label={titulo}
      sheetClassName="relative w-full sm:w-[460px] bg-card h-full flex flex-col shadow-[-20px_0_60px_-20px_rgba(0,0,0,0.3)]"
    >
      <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-border">
        <div className="min-w-0">
          <h2 className="text-[18px] font-bold text-foreground">{titulo}</h2>
          {sub && <p className="text-[13px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar"
          className="size-10 -mr-2 -mt-1 shrink-0 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <X size={18} aria-hidden />
        </button>
      </header>
      {children}
    </DashboardDrawer>
  );
}

/** La tarjeta, en pequeño, para que se vea siempre sobre qué se está actuando. */
function ResumenTarjeta({ t }: { t: Vista }) {
  const estado = t.estado_efectivo as EstadoRegalo;
  return (
    <div className="rounded-2xl border border-border bg-muted/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Para</p>
          <p className="text-[15px] font-bold text-foreground truncate">{t.destinatario_nombre ?? '—'}</p>
          <p className="text-[12.5px] text-muted-foreground truncate">De {t.comprador_nombre ?? '—'} · caduca el {fecha(t.caduca_en)}</p>
        </div>
        <Badge variant={VARIANTE_ESTADO[estado] ?? 'outline'}>{NOMBRE_ESTADO_REGALO[estado] ?? estado}</Badge>
      </div>
      <p className="mt-3 text-sm text-muted-foreground tabular-nums">
        Saldo <b className="text-[26px] leading-none text-foreground ml-1">{formatearEuros(t.saldo)}</b> de {formatearEuros(t.importe_inicial)}
      </p>
      <Barra total={t.importe_inicial} saldo={t.saldo} apagada={estado !== 'ACTIVA'} className="mt-2.5" />
    </div>
  );
}

function ErrorLinea({ id, children }: { id: string; children: React.ReactNode }) {
  return <p id={id} role="alert" className="flex gap-1.5 items-start text-[13px] font-semibold text-destructive mt-2"><AlertTriangle size={15} aria-hidden className="shrink-0 mt-0.5" />{children}</p>;
}

const CUERPO = 'flex-1 overflow-y-auto px-5 py-5 space-y-5';
const PIE = 'border-t border-border px-5 py-4 flex gap-2 bg-card pb-[max(1rem,env(safe-area-inset-bottom))]';

// ── Gastar ───────────────────────────────────────────────────────────────────

function FormGastar({ t, onCerrar, onHecho }: { t: Vista; onCerrar: () => void; onHecho: (m: string) => Promise<void> }) {
  const [texto, setTexto] = useState('');
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Una clave por INTENTO: si la red cae y se reintenta lo mismo no se gasta dos veces; si cambia
  // el importe o la nota es otra operación y lleva clave nueva.
  const idem = useRef<{ firma: string; key: string } | null>(null);

  const importe = leerImporte(texto);
  const hayTexto = texto.trim() !== '';
  const excede = Number.isFinite(importe) && importe > t.saldo + 0.001;
  const invalido = hayTexto && (!Number.isFinite(importe) || importe <= 0);
  const valido = Number.isFinite(importe) && importe > 0 && !excede;
  const quedara = valido ? Math.round((t.saldo - importe) * 100) / 100 : null;
  const atajos = [10, 20, 50].filter(v => v < t.saldo);

  async function gastar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando || !valido) return;
    const firma = `${importe}|${nota.trim()}`;
    if (!idem.current || idem.current.firma !== firma) idem.current = { firma, key: crypto.randomUUID() };
    setEnviando(true); setError(null);
    const r = await llamar(`/api/regalo/${t.id}`, 'POST', { accion: 'usar', importeEur: importe, idemKey: idem.current.key, ...(nota.trim() ? { nota: nota.trim() } : {}) });
    setEnviando(false);
    if (!r.ok) { setError((r.json.error as string) ?? 'No se ha podido descontar el saldo.'); return; }
    const resto = typeof r.json.saldo === 'number' ? ` Quedan ${formatearEuros(r.json.saldo)}.` : '';
    onCerrar();
    await onHecho(`Se han descontado ${formatearEuros(importe)}.${resto}`);
  }

  return (
    <form onSubmit={gastar} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className={CUERPO}>
        <ResumenTarjeta t={t} />
        <div>
          <label htmlFor="rg-gastar-importe" className={etiqueta}>¿Cuánto se gasta? (€)</label>
          <input id="rg-gastar-importe" className={`${campo} text-lg font-bold tabular-nums`} inputMode="decimal" autoComplete="off" autoFocus
            value={texto} onChange={e => { setTexto(e.target.value); setError(null); }} placeholder="0"
            aria-invalid={invalido || excede || undefined} aria-describedby={invalido || excede ? 'rg-gastar-e' : undefined} />
          <div className="flex flex-wrap gap-2 mt-2.5">
            <button type="button" className={`${chip} bg-background border-border hover:bg-muted`} onClick={() => setTexto(String(t.saldo).replace('.', ','))}>
              Todo el saldo · {formatearEuros(t.saldo)}
            </button>
            {atajos.map(v => (
              <button key={v} type="button" className={`${chip} bg-background border-border hover:bg-muted tabular-nums`} onClick={() => setTexto(String(v))}>{formatearEuros(v)}</button>
            ))}
          </div>
          {invalido && <ErrorLinea id="rg-gastar-e">Escribe un importe en euros, por ejemplo 12 o 12,50.</ErrorLinea>}
          {excede && <ErrorLinea id="rg-gastar-e">Supera el saldo de la tarjeta ({formatearEuros(t.saldo)}).</ErrorLinea>}
        </div>

        <div>
          <label htmlFor="rg-gastar-nota" className={etiqueta}>Nota (opcional)</label>
          <input id="rg-gastar-nota" className={campo} maxLength={300} value={nota} onChange={e => setNota(e.target.value)} placeholder="Por ejemplo, bono de 10 clases" />
          <p className="text-[12px] text-muted-foreground mt-1.5">Queda en el historial de la tarjeta junto a tu nombre.</p>
        </div>

        <div className="rounded-xl border border-border px-4 py-3 text-sm" aria-live="polite">
          {quedara === null
            ? <span className="text-muted-foreground">Escribe un importe para ver cuánto quedará.</span>
            : quedara === 0
              ? <span className="text-foreground">La tarjeta quedará <b>gastada del todo</b>.</span>
              : <span className="text-foreground">Después de esto quedarán <b className="tabular-nums">{formatearEuros(quedara)}</b>.</span>}
        </div>
        <p className="text-[12px] text-muted-foreground">Esto solo descuenta saldo de la tarjeta. La compra se cobra por la Caja como siempre.</p>
        {error && <ErrorLinea id="rg-gastar-srv">{error}</ErrorLinea>}
      </div>
      <div className={PIE}>
        <Button type="button" variant="outline" size="lg" onClick={onCerrar}>Cancelar</Button>
        <Button type="submit" variant="brand" size="lg" className="flex-1" disabled={!valido || enviando}>
          {enviando ? 'Descontando…' : valido ? `Descontar ${formatearEuros(importe)}` : 'Descontar'}
        </Button>
      </div>
    </form>
  );
}

// ── Anular ───────────────────────────────────────────────────────────────────

function FormAnular({ t, onCerrar, onHecho }: { t: Vista; onCerrar: () => void; onHecho: (m: string) => Promise<void> }) {
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gastado = Math.max(0, Math.round((t.importe_inicial - t.saldo) * 100) / 100);
  const valido = motivo.trim().length >= 3;

  async function anular(e: React.FormEvent) {
    e.preventDefault();
    if (enviando || !valido) return;
    setEnviando(true); setError(null);
    const r = await llamar(`/api/regalo/${t.id}`, 'POST', { accion: 'anular', motivo: motivo.trim() });
    setEnviando(false);
    if (!r.ok) { setError((r.json.error as string) ?? 'No se ha podido anular la tarjeta.'); return; }
    onCerrar();
    await onHecho('Tarjeta anulada.');
  }

  return (
    <form onSubmit={anular} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className={CUERPO}>
        <ResumenTarjeta t={t} />
        <div className="rounded-xl border border-destructive/40 bg-t-error-bg px-4 py-3 text-[13.5px] leading-relaxed text-foreground flex gap-2.5">
          <AlertTriangle size={18} aria-hidden className="shrink-0 mt-0.5 text-destructive" />
          <p>
            Se retirarán los <b className="tabular-nums">{formatearEuros(t.saldo)}</b> que quedan.
            {gastado > 0 && <> Lo ya gastado (<span className="tabular-nums">{formatearEuros(gastado)}</span>) <b>no vuelve</b>.</>}{' '}
            Una tarjeta anulada no se puede reactivar.
          </p>
        </div>
        <div>
          <label htmlFor="rg-anular-motivo" className={etiqueta}>Motivo (obligatorio)</label>
          <textarea id="rg-anular-motivo" className={`${campo} h-auto min-h-24 py-2.5 resize-y`} rows={3} maxLength={300} autoFocus
            value={motivo} onChange={e => { setMotivo(e.target.value); setError(null); }}
            placeholder="Por ejemplo, la clienta pidió el reembolso" />
          <p className="text-[12px] text-muted-foreground mt-1.5">Queda anotado en el historial con tu nombre.</p>
        </div>
        {error && <ErrorLinea id="rg-anular-srv">{error}</ErrorLinea>}
      </div>
      <div className={PIE}>
        <Button type="button" variant="outline" size="lg" onClick={onCerrar}>Volver</Button>
        <Button type="submit" variant="destructive" size="lg" className="flex-1" disabled={!valido || enviando}>
          {enviando ? 'Anulando…' : 'Anular tarjeta'}
        </Button>
      </div>
    </form>
  );
}

// ── Cobrar con un código ─────────────────────────────────────────────────────

function BuscarCodigo({ onCerrar, onElegida }: { onCerrar: () => void; onElegida: (t: Vista) => void }) {
  const [codigo, setCodigo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hallada, setHallada] = useState<Vista | null>(null);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (buscando || !codigo.trim()) return;
    setBuscando(true); setError(null); setHallada(null);
    const r = await llamar('/api/regalo', 'POST', { accion: 'buscar', codigo });
    setBuscando(false);
    if (!r.ok) { setError((r.json.error as string) ?? 'No se ha podido buscar la tarjeta.'); return; }
    setHallada(r.json.tarjeta as Vista);
  }

  const estado = hallada?.estado_efectivo as EstadoRegalo | undefined;
  const MOTIVO: Record<string, string> = {
    AGOTADA: 'A esta tarjeta ya no le queda saldo.', CADUCADA: 'Esta tarjeta ha caducado.', ANULADA: 'Esta tarjeta está anulada.',
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form onSubmit={buscar} className={CUERPO} noValidate>
        <div>
          <label htmlFor="rg-codigo" className={etiqueta}>Código de la tarjeta</label>
          <input id="rg-codigo" className={`${campo} font-mono tracking-wider uppercase`} autoFocus autoComplete="off" spellCheck={false} autoCapitalize="characters"
            value={codigo} onChange={e => { setCodigo(e.target.value); setError(null); setHallada(null); }} placeholder="RG-XXXX-XXXX-XXXX-XXXX"
            aria-invalid={!!error || undefined} aria-describedby={error ? 'rg-codigo-e' : undefined} />
          <p className="text-[12px] text-muted-foreground mt-1.5">Lo tiene la clienta en el correo del regalo. Da igual si escribe guiones o minúsculas.</p>
          {error && <ErrorLinea id="rg-codigo-e">{error}</ErrorLinea>}
        </div>
        <Button type="submit" variant="outline" size="lg" className="w-full" disabled={buscando || !codigo.trim()}>
          <Search aria-hidden /> {buscando ? 'Buscando…' : 'Buscar tarjeta'}
        </Button>
        {hallada && (
          <div className="space-y-3" aria-live="polite">
            <ResumenTarjeta t={hallada} />
            {estado !== 'ACTIVA' && <p className="text-[13px] font-semibold text-destructive">{MOTIVO[estado ?? ''] ?? 'Esta tarjeta no se puede usar.'}</p>}
          </div>
        )}
      </form>
      <div className={PIE}>
        <Button type="button" variant="outline" size="lg" onClick={onCerrar}>Cerrar</Button>
        <Button type="button" variant="brand" size="lg" className="flex-1" disabled={!hallada || estado !== 'ACTIVA'} onClick={() => hallada && onElegida(hallada)}>
          Gastar saldo
        </Button>
      </div>
    </div>
  );
}

// ── Vender en el mostrador ───────────────────────────────────────────────────

const METODOS = [
  { v: 'EFECTIVO', n: 'Efectivo', Icono: Banknote },
  { v: 'TARJETA', n: 'Datáfono', Icono: CircleDollarSign },
  { v: 'BIZUM', n: 'Bizum', Icono: Smartphone },
  { v: 'TRANSFERENCIA', n: 'Transferencia', Icono: Landmark },
] as const;

function FormVender({ ajustes, onCerrar, onVendida }: { ajustes: AjustesRegalo; onCerrar: () => void; onVendida: (m: string) => Promise<void> }) {
  const [f, setF] = useState({ importeEur: '', metodo: 'EFECTIVO', compradorNombre: '', compradorEmail: '', destinatarioNombre: '', destinatarioEmail: '', mensaje: '' });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [hecha, setHecha] = useState<{ codigo: string; correoEnviado: boolean } | null>(null);
  const [copiado, setCopiado] = useState<'si' | 'no' | null>(null);

  const importe = Number(f.importeEur);
  const e = {
    importe: !f.importeEur || !Number.isInteger(importe) || importe < 1 ? 'Indica el importe en euros.'
      : importe < ajustes.importeMinEur || importe > ajustes.importeMaxEur
        ? `Tiene que estar entre ${ajustes.importeMinEur} € y ${ajustes.importeMaxEur} €.` : null,
    de: f.compradorNombre.trim() ? null : 'Escribe quién la compra.',
    para: f.destinatarioNombre.trim() ? null : 'Escribe para quién es.',
    emailC: f.compradorEmail && !EMAIL_VALIDO.test(f.compradorEmail.trim()) ? 'Ese email no parece válido.' : null,
    emailD: f.destinatarioEmail && !EMAIL_VALIDO.test(f.destinatarioEmail.trim()) ? 'Ese email no parece válido.' : null,
  };
  const hayErrores = Object.values(e).some(Boolean);
  const ver = (k: keyof typeof e) => (intentado ? e[k] : null);
  const set = (k: keyof typeof f) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: ev.target.value });

  async function vender(ev: React.FormEvent) {
    ev.preventDefault();
    if (enviando) return;
    setIntentado(true);
    if (hayErrores) return;
    setEnviando(true); setError(null);
    const r = await llamar('/api/regalo', 'POST', { accion: 'vender', ...f, importeEur: importe });
    setEnviando(false);
    if (!r.ok) { setError((r.json.error as string) ?? 'No se ha podido crear la tarjeta.'); return; }
    setHecha({ codigo: r.json.codigo as string, correoEnviado: r.json.correoEnviado === true });
    await onVendida('Tarjeta creada.');
  }

  async function copiar(codigo: string) {
    try { await navigator.clipboard.writeText(codigo); setCopiado('si'); }
    catch { setCopiado('no'); } // no se dice «copiado» si el navegador no lo ha hecho
  }

  if (hecha) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-testid="venta-mostrador">
        <div className={CUERPO}>
          <div className="flex items-center gap-2.5 text-foreground">
            <span className="size-8 rounded-full bg-t-success-bg text-t-success dark:bg-success/20 dark:text-success inline-flex items-center justify-center"><Check size={18} aria-hidden /></span>
            <p className="font-bold">Tarjeta creada: {formatearEuros(importe)} para {f.destinatarioNombre.trim()}</p>
          </div>
          <div className="rounded-2xl border border-border bg-muted/50 p-5 text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Código de la tarjeta</p>
            <p className="mt-2 font-mono text-[22px] font-extrabold tracking-wider text-foreground break-all select-all" data-testid="codigo-nuevo">{hecha.codigo}</p>
            <Button type="button" variant="outline" className="mt-3" onClick={() => void copiar(hecha.codigo)}><Copy aria-hidden /> Copiar código</Button>
            <p role="status" className="text-[12.5px] mt-2 min-h-5 text-muted-foreground">
              {copiado === 'si' && 'Código copiado.'}{copiado === 'no' && 'No se ha podido copiar: selecciónalo y cópialo a mano.'}
            </p>
          </div>
          <p className="text-[13.5px] text-foreground leading-relaxed">
            {f.destinatarioEmail.trim()
              ? hecha.correoEnviado
                ? <>Hemos enviado el regalo a <b>{f.destinatarioEmail.trim()}</b>.</>
                : <>No hemos podido enviar el correo a <b>{f.destinatarioEmail.trim()}</b>. Puedes reenviarlo desde la lista.</>
              : <>No has indicado email: dale el código en mano o apúntalo.</>}
            {' '}El código solo se enseña ahora.
          </p>
        </div>
        <div className={PIE}>
          <Button type="button" variant="outline" size="lg" onClick={() => { setHecha(null); setCopiado(null); setIntentado(false); setF({ ...f, importeEur: '', destinatarioNombre: '', destinatarioEmail: '', mensaje: '' }); }}>Vender otra</Button>
          <Button type="button" variant="brand" size="lg" className="flex-1" onClick={onCerrar}>Hecho</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={vender} className="flex min-h-0 flex-1 flex-col" noValidate data-testid="venta-mostrador">
      <div className={CUERPO}>
        <section aria-labelledby="rg-v-1" className="space-y-3">
          <h3 id="rg-v-1" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Importe y cobro</h3>
          <div>
            <label htmlFor="rg-v-importe" className={etiqueta}>Importe (€)</label>
            <input id="rg-v-importe" className={`${campo} text-lg font-bold tabular-nums`} inputMode="numeric" autoComplete="off" autoFocus
              value={f.importeEur} onChange={ev => setF({ ...f, importeEur: ev.target.value.replace(/\D/g, '').slice(0, 4) })}
              aria-invalid={!!ver('importe') || undefined} aria-describedby={ver('importe') ? 'rg-v-importe-e' : undefined} />
            <div className="flex flex-wrap gap-2 mt-2.5">
              {ajustes.importesEur.map(v => (
                <button key={v} type="button" aria-pressed={f.importeEur === String(v)} onClick={() => setF({ ...f, importeEur: String(v) })}
                  className={`${chip} tabular-nums ${f.importeEur === String(v) ? 'bg-foreground text-background border-foreground' : 'bg-background border-border hover:bg-muted'}`}>{formatearEuros(v)}</button>
              ))}
            </div>
            {ver('importe') && <ErrorLinea id="rg-v-importe-e">{ver('importe')}</ErrorLinea>}
          </div>
          <fieldset>
            <legend className={etiqueta}>Cobrada con</legend>
            <div className="grid grid-cols-2 gap-2">
              {METODOS.map(({ v, n, Icono }) => (
                <button key={v} type="button" aria-pressed={f.metodo === v} onClick={() => setF({ ...f, metodo: v })}
                  className={`flex items-center gap-2 h-11 px-3 rounded-xl border text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${f.metodo === v ? 'border-foreground bg-foreground text-background' : 'border-border bg-background text-foreground hover:bg-muted'}`}>
                  <Icono size={16} aria-hidden /> {n}
                </button>
              ))}
            </div>
          </fieldset>
        </section>

        <section aria-labelledby="rg-v-2" className="space-y-3">
          <h3 id="rg-v-2" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Para quién</h3>
          <div>
            <label htmlFor="rg-v-para" className={etiqueta}>Nombre</label>
            <input id="rg-v-para" className={campo} value={f.destinatarioNombre} onChange={set('destinatarioNombre')} autoComplete="off"
              aria-invalid={!!ver('para') || undefined} aria-describedby={ver('para') ? 'rg-v-para-e' : undefined} />
            {ver('para') && <ErrorLinea id="rg-v-para-e">{ver('para')}</ErrorLinea>}
          </div>
          <div>
            <label htmlFor="rg-v-para-mail" className={etiqueta}>Email (opcional)</label>
            <input id="rg-v-para-mail" type="email" className={campo} value={f.destinatarioEmail} onChange={set('destinatarioEmail')} autoComplete="off"
              aria-invalid={!!ver('emailD') || undefined} aria-describedby={ver('emailD') ? 'rg-v-para-mail-e' : 'rg-v-para-mail-h'} />
            {ver('emailD') ? <ErrorLinea id="rg-v-para-mail-e">{ver('emailD')}</ErrorLinea> : <p id="rg-v-para-mail-h" className="text-[12px] text-muted-foreground mt-1.5">Con email, se le envía el regalo ahora. Sin él, le das el código en mano.</p>}
          </div>
          <div>
            <label htmlFor="rg-v-msg" className={etiqueta}>Mensaje (opcional)</label>
            <textarea id="rg-v-msg" className={`${campo} h-auto min-h-20 py-2.5 resize-y`} rows={2} maxLength={400} value={f.mensaje} onChange={set('mensaje')} />
          </div>
        </section>

        <section aria-labelledby="rg-v-3" className="space-y-3">
          <h3 id="rg-v-3" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">De parte de</h3>
          <div>
            <label htmlFor="rg-v-de" className={etiqueta}>Nombre</label>
            <input id="rg-v-de" className={campo} value={f.compradorNombre} onChange={set('compradorNombre')} autoComplete="off"
              aria-invalid={!!ver('de') || undefined} aria-describedby={ver('de') ? 'rg-v-de-e' : undefined} />
            {ver('de') && <ErrorLinea id="rg-v-de-e">{ver('de')}</ErrorLinea>}
          </div>
          <div>
            <label htmlFor="rg-v-de-mail" className={etiqueta}>Email (opcional)</label>
            <input id="rg-v-de-mail" type="email" className={campo} value={f.compradorEmail} onChange={set('compradorEmail')} autoComplete="off"
              aria-invalid={!!ver('emailC') || undefined} aria-describedby={ver('emailC') ? 'rg-v-de-mail-e' : undefined} />
            {ver('emailC') && <ErrorLinea id="rg-v-de-mail-e">{ver('emailC')}</ErrorLinea>}
          </div>
        </section>
        <p className="text-[12px] text-muted-foreground">Registra una tarjeta que ya has cobrado fuera (esta versión no pasa por la Caja). Queda anotado quién la creó y cómo se cobró.</p>
        {error && <ErrorLinea id="rg-v-srv">{error}</ErrorLinea>}
      </div>
      <div className={PIE}>
        <Button type="button" variant="outline" size="lg" onClick={onCerrar}>Cancelar</Button>
        <Button type="submit" variant="brand" size="lg" className="flex-1" disabled={enviando}>
          {enviando ? 'Creando…' : f.importeEur && !e.importe ? `Crear tarjeta de ${formatearEuros(importe)}` : 'Crear tarjeta'}
        </Button>
      </div>
    </form>
  );
}

// ── Ajustes ──────────────────────────────────────────────────────────────────

function FormAjustes({ datos, onCerrar, onGuardado }: { datos: Datos; onCerrar: () => void; onGuardado: (m: string) => Promise<void> }) {
  const a = datos.ajustes;
  const [activo, setActivo] = useState(a.activo);
  const [importes, setImportes] = useState(a.importesEur.join(', '));
  const [libre, setLibre] = useState(a.permiteImporteLibre);
  const [min, setMin] = useState(String(a.importeMinEur));
  const [max, setMax] = useState(String(a.importeMaxEur));
  const [meses, setMeses] = useState(String(a.caducidadMeses));
  const [terminos, setTerminos] = useState(a.terminos ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = datos.puedeEditarAjustes;

  const lista = importes.split(',').map(x => Number(x.trim())).filter(x => Number.isInteger(x) && x > 0);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (guardando || !editable) return;
    setGuardando(true); setError(null);
    const r = await llamar('/api/regalo', 'PUT', {
      activo, importesEur: lista, permiteImporteLibre: libre,
      importeMinEur: Number(min), importeMaxEur: Number(max), caducidadMeses: Number(meses), terminos,
    });
    setGuardando(false);
    if (!r.ok) { setError((r.json.error as string) ?? 'No se han podido guardar los ajustes.'); return; }
    onCerrar();
    await onGuardado('Ajustes guardados.');
  }

  return (
    <form onSubmit={guardar} className="flex min-h-0 flex-1 flex-col" noValidate>
      <div className={CUERPO}>
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-border p-4">
          <div>
            <p className="text-[15px] font-bold text-foreground" id="rg-a-activo">Vender en mi página de reservas</p>
            <p className="text-[13px] text-muted-foreground mt-0.5">Aparece «Regala una tarjeta» al pie de tu web de reservas.</p>
          </div>
          <Interruptor on={activo} onChange={setActivo} ariaLabel="Vender tarjetas regalo en mi página de reservas" disabled={!editable} />
        </div>

        <div>
          <label htmlFor="rg-a-importes" className={etiqueta}>Importes sugeridos (€, separados por comas)</label>
          <input id="rg-a-importes" className={campo} value={importes} disabled={!editable} onChange={ev => setImportes(ev.target.value)} placeholder="25, 50, 100" />
          <div className="flex flex-wrap gap-1.5 mt-2" aria-label="Así los verá quien compra">
            {lista.length === 0 ? <span className="text-[12px] text-muted-foreground">Escribe al menos un importe.</span>
              : lista.map(v => <span key={v} className="px-2.5 h-7 inline-flex items-center rounded-full bg-muted text-[12.5px] font-semibold tabular-nums">{formatearEuros(v)}</span>)}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-[13.5px] font-semibold text-foreground">Permitir que elijan otro importe</span>
          <Interruptor on={libre} onChange={setLibre} ariaLabel="Permitir otro importe" disabled={!editable} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="rg-a-min" className={etiqueta}>Mínimo (€)</label><input id="rg-a-min" className={campo} inputMode="numeric" value={min} disabled={!editable || !libre} onChange={ev => setMin(ev.target.value)} /></div>
          <div><label htmlFor="rg-a-max" className={etiqueta}>Máximo (€)</label><input id="rg-a-max" className={campo} inputMode="numeric" value={max} disabled={!editable || !libre} onChange={ev => setMax(ev.target.value)} /></div>
        </div>
        <div>
          <label htmlFor="rg-a-meses" className={etiqueta}>Caduca a los (meses)</label>
          <input id="rg-a-meses" className={`${campo} max-w-32`} inputMode="numeric" value={meses} disabled={!editable} onChange={ev => setMeses(ev.target.value)} />
          <p className="text-[12px] text-muted-foreground mt-1.5">Las tarjetas ya vendidas conservan la caducidad con la que se vendieron.</p>
        </div>
        <div>
          <label htmlFor="rg-a-terminos" className={etiqueta}>Condiciones que verá quien compra (opcional)</label>
          <textarea id="rg-a-terminos" className={`${campo} h-auto min-h-24 py-2.5 resize-y`} rows={3} maxLength={4000} value={terminos} disabled={!editable} onChange={ev => setTerminos(ev.target.value)} />
        </div>
        {!editable && <p className="text-[13px] text-muted-foreground">Solo la propietaria cambia estos ajustes.</p>}
        {error && <ErrorLinea id="rg-a-srv">{error}</ErrorLinea>}
      </div>
      <div className={PIE}>
        <Button type="button" variant="outline" size="lg" onClick={onCerrar}>{editable ? 'Cancelar' : 'Cerrar'}</Button>
        {editable && <Button type="submit" variant="brand" size="lg" className="flex-1" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar ajustes'}</Button>}
      </div>
    </form>
  );
}
