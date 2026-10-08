'use client';

import { useCallback, useEffect, useState } from 'react';
import { authHeader } from '@/lib/api-client';
import { puedeMoverDinero, useRol } from '@/lib/permisos';
import { NOMBRE_ESTADO_REGALO, formatearEuros, type AjustesRegalo, type EstadoRegalo } from '@/lib/regalo/reglas';
import type { TarjetaRegaloVista } from '@/lib/regalo/servidor';

type Datos = { ajustes: AjustesRegalo; tarjetas: TarjetaRegaloVista[]; pasivoVivo: number; puedeEditarAjustes: boolean };

const fecha = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const campo = 'w-full px-3 py-2 rounded-xl border border-border bg-background text-sm';
const boton = 'px-3 py-1.5 rounded-lg text-xs font-bold border border-border hover:bg-muted transition-colors disabled:opacity-50';

async function llamar(url: string, metodo: 'GET' | 'PUT' | 'POST', cuerpo?: unknown): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  try {
    const r = await fetch(url, {
      method: metodo, headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });
    return { ok: r.ok, status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  } catch { return { ok: false, status: 0, json: { error: 'Sin conexión. Inténtalo de nuevo.' } }; }
}

// Pestaña «Tarjeta regalo» de Paquetes. Nada optimista: cada acción espera la respuesta del
// servidor y vuelve a leer la lista. El saldo que se enseña es el del libro, no uno calculado aquí.
export function PanelRegalo() {
  const rol = useRol();
  const mueveDinero = puedeMoverDinero(rol);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const r = await llamar('/api/regalo', 'GET');
    if (!r.ok) { setError((r.json.error as string) ?? 'No se han podido cargar las tarjetas regalo.'); return; }
    setError(null); setDatos(r.json as unknown as Datos);
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  if (error && !datos) return <div className="bg-card rounded-2xl border border-border p-6 text-sm" role="alert">{error} <button className={boton} onClick={() => void cargar()}>Reintentar</button></div>;
  if (!datos) return <div className="bg-card rounded-2xl border border-border p-6 text-sm">Cargando…</div>;

  async function accion(id: string, cuerpo: Record<string, unknown>, okMsg: string) {
    if (ocupado) return;
    setOcupado(true); setAviso(null); setError(null);
    const r = await llamar(`/api/regalo/${id}`, 'POST', cuerpo);
    setOcupado(false);
    if (!r.ok) { setError((r.json.error as string) ?? 'No se ha podido completar.'); return; }
    setAviso(okMsg); await cargar();
  }

  return (
    <div className="space-y-6" data-testid="panel-regalo">
      {aviso && <p role="status" className="text-sm font-semibold" style={{ color: 'var(--success)' }}>{aviso}</p>}
      {error && <p role="alert" className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="bg-card rounded-2xl border border-border p-5">
          <p className="text-xs font-bold uppercase text-muted-foreground">Saldo pendiente de usar</p>
          <p className="text-2xl font-extrabold mt-1" data-testid="pasivo-vivo">{formatearEuros(datos.pasivoVivo)}</p>
          <p className="text-xs text-muted-foreground mt-2">
            Es dinero cobrado por servicios que aún no has prestado: <b>no es ingreso</b> hasta que se gasta y no aparece en Cobros ni en Informes.
            Cómo declararlo (IVA y momento) lo confirma tu gestoría.
          </p>
        </div>
        <Ajustes datos={datos} onGuardado={async (m) => { setAviso(m); await cargar(); }} />
      </div>

      {mueveDinero && <VentaMostrador onVendida={async (m) => { setAviso(m); await cargar(); }} />}

      <div className="bg-card rounded-2xl border border-border overflow-x-auto">
        {datos.tarjetas.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">Todavía no se ha vendido ninguna tarjeta regalo.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground">
              <th className="px-4 py-3">Para</th><th className="px-4 py-3">De</th><th className="px-4 py-3">Importe</th>
              <th className="px-4 py-3">Saldo</th><th className="px-4 py-3">Caduca</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3" />
            </tr></thead>
            <tbody>
              {datos.tarjetas.map(t => {
                const estado = t.estado_efectivo as EstadoRegalo;
                return (
                  <tr key={t.id} className="border-t border-border" data-testid="fila-regalo">
                    <td className="px-4 py-3">{t.destinatario_nombre ?? '—'}</td>
                    <td className="px-4 py-3">{t.comprador_nombre ?? '—'}{t.origen === 'MANUAL' ? ' · mostrador' : ''}</td>
                    <td className="px-4 py-3">{formatearEuros(t.importe_inicial)}</td>
                    <td className="px-4 py-3 font-bold">{formatearEuros(t.saldo)}</td>
                    <td className="px-4 py-3">{fecha(t.caduca_en)}</td>
                    <td className="px-4 py-3" title={t.anulada_motivo ?? undefined}>{NOMBRE_ESTADO_REGALO[estado] ?? estado}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {mueveDinero && estado === 'ACTIVA' && (
                        <span className="flex gap-1.5">
                          <button className={boton} disabled={ocupado} onClick={() => {
                            const txt = window.prompt(`¿Cuánto se gasta? (saldo ${formatearEuros(t.saldo)})`);
                            const n = txt ? Number(txt.replace(',', '.')) : NaN;
                            if (!Number.isFinite(n) || n <= 0) return;
                            // Una clave por CLIC: un reintento por red caída no gasta dos veces.
                            void accion(t.id, { accion: 'usar', importeEur: n, idemKey: crypto.randomUUID() }, `Se han descontado ${formatearEuros(n)}.`);
                          }}>Gastar</button>
                          <button className={boton} disabled={ocupado || !t.destinatario_email} onClick={() => void accion(t.id, { accion: 'reenviar' }, 'Correo reenviado.')}>Reenviar</button>
                          <button className={boton} disabled={ocupado} onClick={() => {
                            const motivo = window.prompt('Motivo de la anulación (obligatorio). Se retira el saldo que quede; lo ya gastado no vuelve.');
                            if (motivo && motivo.trim().length >= 3) void accion(t.id, { accion: 'anular', motivo }, 'Tarjeta anulada.');
                          }}>Anular</button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Ajustes({ datos, onGuardado }: { datos: Datos; onGuardado: (m: string) => Promise<void> }) {
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

  async function guardar() {
    setGuardando(true); setError(null);
    const r = await llamar('/api/regalo', 'PUT', {
      activo, importesEur: importes.split(',').map(x => Number(x.trim())).filter(x => x > 0), permiteImporteLibre: libre,
      importeMinEur: Number(min), importeMaxEur: Number(max), caducidadMeses: Number(meses), terminos,
    });
    setGuardando(false);
    if (!r.ok) { setError((r.json.error as string) ?? 'No se han podido guardar los ajustes.'); return; }
    await onGuardado('Ajustes guardados.');
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <p className="text-xs font-bold uppercase text-muted-foreground">Producto «Tarjeta regalo»</p>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={activo} disabled={!editable} onChange={e => setActivo(e.target.checked)} />
        Vender tarjetas regalo en mi página de reservas
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-semibold col-span-2">Importes sugeridos (€, separados por comas)
          <input className={campo} value={importes} disabled={!editable} onChange={e => setImportes(e.target.value)} /></label>
        <label className="text-xs font-semibold col-span-2 flex items-center gap-2">
          <input type="checkbox" checked={libre} disabled={!editable} onChange={e => setLibre(e.target.checked)} /> Permitir otro importe</label>
        <label className="text-xs font-semibold">Mínimo (€)<input className={campo} inputMode="numeric" value={min} disabled={!editable} onChange={e => setMin(e.target.value)} /></label>
        <label className="text-xs font-semibold">Máximo (€)<input className={campo} inputMode="numeric" value={max} disabled={!editable} onChange={e => setMax(e.target.value)} /></label>
        <label className="text-xs font-semibold col-span-2">Caduca a los (meses)<input className={campo} inputMode="numeric" value={meses} disabled={!editable} onChange={e => setMeses(e.target.value)} /></label>
        <label className="text-xs font-semibold col-span-2">Condiciones que verá quien compra (opcional)
          <textarea className={campo} rows={2} maxLength={4000} value={terminos} disabled={!editable} onChange={e => setTerminos(e.target.value)} /></label>
      </div>
      {error && <p role="alert" className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>{error}</p>}
      {editable
        ? <button className={boton} disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar ajustes'}</button>
        : <p className="text-xs text-muted-foreground">Solo la propietaria cambia estos ajustes.</p>}
      <p className="text-xs text-muted-foreground">Las tarjetas ya vendidas conservan la caducidad con la que se vendieron.</p>
    </div>
  );
}

function VentaMostrador({ onVendida }: { onVendida: (m: string) => Promise<void> }) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ importeEur: '', metodo: 'EFECTIVO', compradorNombre: '', compradorEmail: '', destinatarioNombre: '', destinatarioEmail: '', mensaje: '' });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);

  async function vender(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setError(null);
    const r = await llamar('/api/regalo', 'POST', { accion: 'vender', ...f, importeEur: Number(f.importeEur) });
    setEnviando(false);
    if (!r.ok) { setError((r.json.error as string) ?? 'No se ha podido crear la tarjeta.'); return; }
    setCodigo(r.json.codigo as string);
    await onVendida('Tarjeta creada.');
  }

  if (!abierto) return <button className={boton} onClick={() => setAbierto(true)}>Vender una tarjeta en el mostrador</button>;
  return (
    <form onSubmit={vender} className="bg-card rounded-2xl border border-border p-5 space-y-3" data-testid="venta-mostrador">
      <p className="text-xs font-bold uppercase text-muted-foreground">Venta en el mostrador</p>
      <p className="text-xs text-muted-foreground">Registra una tarjeta que ya has cobrado fuera (esta versión no pasa por la Caja). Queda anotado quién la creó y cómo se cobró.</p>
      {codigo ? (
        <div className="rounded-xl p-4 bg-muted text-sm">
          <p className="font-semibold">Código de la tarjeta (solo se enseña ahora; luego se puede reenviar por correo):</p>
          <p className="text-lg font-extrabold tracking-wider mt-1" data-testid="codigo-nuevo">{codigo}</p>
          <button type="button" className={`${boton} mt-3`} onClick={() => { setCodigo(null); setAbierto(false); setF({ ...f, importeEur: '', destinatarioNombre: '', destinatarioEmail: '', mensaje: '' }); }}>Hecho</button>
        </div>
      ) : (<>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold">Importe (€)<input required className={campo} inputMode="numeric" value={f.importeEur} onChange={e => setF({ ...f, importeEur: e.target.value.replace(/\D/g, '') })} /></label>
          <label className="text-xs font-semibold">Cobrado con
            <select className={campo} value={f.metodo} onChange={e => setF({ ...f, metodo: e.target.value })}>
              <option value="EFECTIVO">Efectivo</option><option value="TARJETA">Tarjeta (datáfono)</option><option value="BIZUM">Bizum</option><option value="TRANSFERENCIA">Transferencia</option>
            </select></label>
          <label className="text-xs font-semibold">De (nombre)<input required className={campo} value={f.compradorNombre} onChange={e => setF({ ...f, compradorNombre: e.target.value })} /></label>
          <label className="text-xs font-semibold">Su email (opcional)<input type="email" className={campo} value={f.compradorEmail} onChange={e => setF({ ...f, compradorEmail: e.target.value })} /></label>
          <label className="text-xs font-semibold">Para (nombre)<input required className={campo} value={f.destinatarioNombre} onChange={e => setF({ ...f, destinatarioNombre: e.target.value })} /></label>
          <label className="text-xs font-semibold">Su email (opcional: se le envía)<input type="email" className={campo} value={f.destinatarioEmail} onChange={e => setF({ ...f, destinatarioEmail: e.target.value })} /></label>
          <label className="text-xs font-semibold col-span-2">Mensaje (opcional)<textarea className={campo} rows={2} maxLength={400} value={f.mensaje} onChange={e => setF({ ...f, mensaje: e.target.value })} /></label>
        </div>
        {error && <p role="alert" className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className={boton} disabled={enviando}>{enviando ? 'Creando…' : 'Crear tarjeta'}</button>
          <button type="button" className={boton} onClick={() => setAbierto(false)}>Cancelar</button>
        </div>
      </>)}
    </form>
  );
}
