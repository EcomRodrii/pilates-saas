'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Bell, Check, Copy } from 'lucide-react';
import { cn, copiarAlPortapapeles } from '@/lib/utils';
import { authHeader } from '@/lib/api-client';
import { cuando } from '@/lib/integraciones/salud';
import {
  NOMBRE_RECURSO, RECURSOS_EVENTO, TIPOS_CONTABILIDAD, type RecursoEvento, type TipoEvento,
} from '@/lib/api-publica/webhooks/catalogo';
import { textoMotivoDesactivado } from '@/lib/api-publica/webhooks/textos';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { btnPrimary, btnSecondary, inputCls, labelCls } from '@/components/configuracion/estilos';

// ─────────────────────────────────────────────────────────────────────────────
// «Avisos automáticos (webhooks)», dentro de «API para tu contabilidad». En vez
// de que el programa pregunte cada noche, Tentare le avisa en cuanto entra un
// cobro, se devuelve algo o se emite una factura. Solo la propietaria (lo
// comprueba el servidor: /api/integrations/api-publica/webhooks/*).
// ─────────────────────────────────────────────────────────────────────────────

interface Webhook {
  id: string; url: string; descripcion: string | null; tipos: TipoEvento[]; creadoEn: string;
  estado: 'activo' | 'fallando' | 'desactivado';
  desactivadoEn: string | null; motivoDesactivado: string | null; fallandoDesde: string | null;
  ultimoExitoEn: string | null; ultimoIntentoEn: string | null; ultimoEstadoHttp: number | null;
  ultimoError: string | null; secretoAnteriorHasta: string | null;
}
interface Entrega {
  id: string; tipo: string | null; recursoId: string | null; estado: 'PENDIENTE' | 'ENTREGADA' | 'FALLIDA' | 'DESCARTADA';
  intentos: number; proximoIntentoEn: string | null; ultimoIntentoEn: string | null;
  ultimoEstadoHttp: number | null; ultimoError: string | null; creadaEn: string;
}
type Datos = { tipos: TipoEvento[]; webhooks: Webhook[] };

async function pedir<T>(ruta: string, init: RequestInit = {}): Promise<{ ok: true; datos: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(ruta, { ...init, headers: { 'Content-Type': 'application/json', ...(await authHeader()), ...(init.headers ?? {}) } });
    const cuerpo = await res.json().catch(() => ({})) as T & { error?: string };
    if (!res.ok) return { ok: false, error: cuerpo.error ?? 'No se ha podido hacer.' };
    return { ok: true, datos: cuerpo };
  } catch {
    return { ok: false, error: 'No hemos podido hablar con el servidor.' };
  }
}

const BASE = '/api/integrations/api-publica/webhooks';
const ACCION: Record<string, string> = { creado: 'nuevo', creada: 'nueva', actualizado: 'cambia', actualizada: 'cambia', eliminado: 'se borra', eliminada: 'se borra' };
const accionDe = (t: string) => ACCION[t.split('.')[1]] ?? t;
const hostDe = (url: string) => { try { return new URL(url).hostname; } catch { return url; } };
const nombreTipo = (t: string) => `${NOMBRE_RECURSO[t.split('.')[0] as RecursoEvento] ?? t.split('.')[0]}: ${accionDe(t)}`;
/** «Recibos (cobros): nuevo, cambia · Facturas: nueva», en el orden del catálogo. */
const resumenTipos = (tipos: string[]) => RECURSOS_EVENTO
  .map((r) => ({ r, acciones: tipos.filter((t) => t.startsWith(`${r}.`)).map(accionDe) }))
  .filter((x) => x.acciones.length > 0)
  .map((x) => `${NOMBRE_RECURSO[x.r]}: ${x.acciones.join(', ')}`)
  .join(' · ');
const enlace = 'text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground min-h-9 [@media(pointer:fine)]:min-h-0';

export function WebhooksApi() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const [creando, setCreando] = useState(false);
  const [secreto, setSecreto] = useState<{ valor: string; titulo: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void pedir<Partial<Datos>>(BASE).then((r) => {
      if (!vivo) return;
      if (!r.ok) { setError(true); return; }
      setDatos({
        tipos: Array.isArray(r.datos.tipos) ? r.datos.tipos : [],
        webhooks: Array.isArray(r.datos.webhooks) ? r.datos.webhooks : [],
      });
      setError(false);
    });
    return () => { vivo = false; };
  }, [vuelta]);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);

  return (
    <section aria-labelledby="webhooks-api" className="flex flex-col gap-3">
      <h3 id="webhooks-api" className="text-sm font-semibold text-foreground m-0">Avisos automáticos (webhooks)</h3>
      <p className="text-sm text-muted-foreground text-pretty m-0">
        Tentare avisa a tu programa en cuanto entra un cobro, se devuelve algo o se emite una factura, sin que tenga que preguntar.
        Cada aviso va firmado con un secreto para que tu programa sepa que viene de Tentare.
      </p>
      {aviso && <p role="status" className="text-sm text-foreground m-0">{aviso}</p>}
      {error && <p role="alert" className="text-sm text-destructive m-0">No se han podido cargar los webhooks.</p>}
      {!error && !datos && <p role="status" className="text-sm text-muted-foreground m-0">Cargando…</p>}

      {secreto && <SecretoRecienCreado valor={secreto.valor} titulo={secreto.titulo} onCerrar={() => setSecreto(null)} />}

      {datos && !secreto && (creando
        ? <FormularioWebhook permitidos={datos.tipos} onCancelar={() => setCreando(false)}
            onGuardado={(valor) => { setCreando(false); if (valor) setSecreto({ valor, titulo: 'Webhook creado.' }); recargar(); }} />
        : <button type="button" onClick={() => { setCreando(true); setAviso(null); }} className={cn(btnSecondary, 'self-start inline-flex items-center gap-1.5')}><Bell size={14} aria-hidden /> Añadir un webhook</button>)}

      {datos && datos.webhooks.length > 0 && (
        <ul className="flex flex-col divide-y divide-border">
          {datos.webhooks.map((w) => (
            <FilaWebhook key={w.id} w={w} permitidos={datos.tipos}
              onCambio={(texto, nuevoSecreto) => { recargar(); setAviso(texto); if (nuevoSecreto) setSecreto({ valor: nuevoSecreto, titulo: 'Secreto nuevo.' }); }} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FormularioWebhook({ permitidos, inicial, onCancelar, onGuardado }: {
  permitidos: TipoEvento[];
  inicial?: Webhook;
  onCancelar: () => void;
  /** Al crear, el secreto (se enseña una vez); al editar, `null`. */
  onGuardado: (secreto: string | null) => void;
}) {
  const id = useId();
  const [url, setUrl] = useState(inicial?.url ?? '');
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? '');
  const [tipos, setTipos] = useState<TipoEvento[]>(inicial?.tipos ?? TIPOS_CONTABILIDAD.filter((t) => permitidos.includes(t)));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recursos = RECURSOS_EVENTO.filter((r) => permitidos.some((t) => t.startsWith(`${r}.`)));

  async function guardar() {
    setEnviando(true);
    setError(null);
    const cuerpo = JSON.stringify({ url: url.trim(), descripcion: descripcion.trim() || null, tipos });
    const r = inicial
      ? await pedir(`${BASE}/${encodeURIComponent(inicial.id)}`, { method: 'PATCH', body: cuerpo })
      : await pedir<{ secreto: string }>(BASE, { method: 'POST', body: cuerpo });
    setEnviando(false);
    if (!r.ok) setError(r.error);
    else onGuardado(inicial ? null : (r.datos as { secreto: string }).secreto);
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void guardar(); }} className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <div>
        <label htmlFor={`${id}-url`} className={labelCls}>Dirección de tu programa (https)</label>
        <input id={`${id}-url`} type="url" inputMode="url" autoComplete="off" required className={inputCls} value={url} maxLength={500}
          placeholder="https://…" onChange={(e) => setUrl(e.target.value)} />
        <p className="text-xs text-muted-foreground mt-1 m-0">Te la da tu programa de contabilidad o quien te lo configure.</p>
      </div>
      <div>
        <label htmlFor={`${id}-desc`} className={labelCls}>Para qué es (opcional)</label>
        <input id={`${id}-desc`} className={inputCls} value={descripcion} maxLength={120} placeholder="Contabilidad" onChange={(e) => setDescripcion(e.target.value)} />
      </div>
      <fieldset className="flex flex-col gap-3 border-0 p-0 m-0">
        <legend className={labelCls}>Qué avisos manda</legend>
        {recursos.map((r) => (
          <div key={r} className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">{NOMBRE_RECURSO[r]}</span>
            <span className="flex flex-wrap gap-x-4">
              {permitidos.filter((t) => t.startsWith(`${r}.`)).map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm text-foreground min-h-9">
                  <input type="checkbox" checked={tipos.includes(t)}
                    onChange={(e) => setTipos((prev) => e.target.checked ? [...prev, t] : prev.filter((x) => x !== t))} />
                  <span>{accionDe(t)}</span>
                </label>
              ))}
            </span>
          </div>
        ))}
      </fieldset>
      {error && <p role="alert" className="text-sm font-medium text-destructive text-pretty m-0">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={enviando || tipos.length === 0 || !url.trim()} className={btnPrimary}>
          {enviando ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Crear el webhook'}
        </button>
        <button type="button" onClick={onCancelar} className={btnSecondary}>Cancelar</button>
      </div>
    </form>
  );
}

function SecretoRecienCreado({ valor, titulo, onCerrar }: { valor: string; titulo: string; onCerrar: () => void }) {
  const id = useId();
  const [copiado, setCopiado] = useState<'si' | 'no' | null>(null);
  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
      <p className="text-sm font-semibold text-foreground m-0">{titulo} Copia el secreto de firma ahora: no lo volverás a ver.</p>
      <p className="text-sm text-foreground text-pretty m-0">Tu programa lo usa para comprobar que cada aviso viene de Tentare (cabecera <code>Tentare-Firma</code>).</p>
      <label htmlFor={`${id}-secreto`} className="sr-only">Secreto de firma</label>
      <input id={`${id}-secreto`} readOnly value={valor} onFocus={(e) => e.currentTarget.select()} className={cn(inputCls, 'font-mono text-xs')} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnPrimary} onClick={async () => setCopiado((await copiarAlPortapapeles(valor)) ? 'si' : 'no')}>
          {copiado === 'si' ? <><Check size={14} aria-hidden /> Copiado</> : <><Copy size={14} aria-hidden /> Copiar</>}
        </button>
        <button type="button" className={btnSecondary} onClick={onCerrar}>Ya lo he guardado</button>
      </div>
      {copiado === 'no' && <p role="alert" className="text-sm text-foreground m-0">Tu navegador no deja copiarlo: selecciónalo en el recuadro y cópialo a mano.</p>}
    </div>
  );
}

function estadoTexto(w: Webhook): { texto: string; tono: 'ok' | 'aviso' | 'apagado' } {
  if (w.estado === 'desactivado') return { texto: textoMotivoDesactivado(w.motivoDesactivado), tono: 'apagado' };
  if (w.estado === 'fallando' && w.fallandoDesde) {
    return { texto: `No consigue entregar desde ${cuando(w.fallandoDesde)}${w.ultimoError ? ` · ${w.ultimoError}` : ''}`, tono: 'aviso' };
  }
  if (w.ultimoExitoEn) return { texto: `Último aviso entregado ${cuando(w.ultimoExitoEn)}`, tono: 'ok' };
  return { texto: 'Activo · todavía no ha mandado ningún aviso', tono: 'ok' };
}

function FilaWebhook({ w, permitidos, onCambio }: { w: Webhook; permitidos: TipoEvento[]; onCambio: (texto: string, nuevoSecreto?: string) => void }) {
  const [pregunta, setPregunta] = useState<'borrar' | 'rotar' | 'desactivar' | null>(null);
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prueba, setPrueba] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);
  const [verEntregas, setVerEntregas] = useState(false);
  const estado = estadoTexto(w);
  const nombre = w.descripcion || hostDe(w.url);

  async function accion<T>(ruta: string, init: RequestInit, alAcabar: (d: T) => void) {
    setError(null);
    const r = await pedir<T>(ruta, init);
    if (!r.ok) setError(r.error); else alAcabar(r.datos);
  }
  async function probar() {
    setProbando(true);
    setPrueba(null);
    setError(null);
    const r = await pedir<{ ok: boolean; estadoHttp: number | null; error: string | null; duracionMs: number }>(`${BASE}/${encodeURIComponent(w.id)}/probar`, { method: 'POST' });
    setProbando(false);
    if (!r.ok) { setError(r.error); return; }
    setPrueba(r.datos.ok
      ? `Entregado: tu programa respondió ${r.datos.estadoHttp} en ${r.datos.duracionMs} ms.`
      : `No se pudo entregar: ${r.datos.error ?? 'sin respuesta'}.`);
  }

  if (editando) {
    return (
      <li className="py-3 first:pt-0">
        <FormularioWebhook permitidos={permitidos} inicial={w} onCancelar={() => setEditando(false)}
          onGuardado={() => { setEditando(false); onCambio('Webhook guardado.'); }} />
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0">
      <span>
        <span className="block text-sm font-semibold text-foreground break-all">{nombre}</span>
        <span className="block text-xs text-muted-foreground break-all">{w.url}</span>
        <span className={cn('block text-sm mt-0.5 text-pretty', estado.tono === 'aviso' ? 'text-destructive font-medium' : 'text-muted-foreground')}>{estado.texto}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">{resumenTipos(w.tipos)}</span>
        {w.secretoAnteriorHasta && (
          <span className="block text-xs text-muted-foreground mt-0.5">
            El secreto anterior sigue firmando hasta {cuando(w.secretoAnteriorHasta)}.{' '}
            <button type="button" className="underline underline-offset-2 hover:text-foreground"
              onClick={() => void accion(`${BASE}/${encodeURIComponent(w.id)}`, { method: 'PATCH', body: JSON.stringify({ retirarSecretoAnterior: true }) }, () => onCambio('El secreto anterior ya no firma.'))}>
              Que deje de firmar ya
            </button>
          </span>
        )}
      </span>
      <span className="flex flex-wrap gap-2">
        {w.estado !== 'desactivado' && (
          <button type="button" className={btnSecondary} disabled={probando} onClick={() => void probar()}>{probando ? 'Probando…' : 'Mandar un aviso de prueba'}</button>
        )}
        {w.estado === 'desactivado' && (
          <button type="button" className={btnSecondary} onClick={() => void accion(`${BASE}/${encodeURIComponent(w.id)}`, { method: 'PATCH', body: JSON.stringify({ activo: true }) }, () => onCambio(`«${nombre}» reactivado.`))}>Reactivar</button>
        )}
        <button type="button" className={btnSecondary} aria-expanded={verEntregas} onClick={() => setVerEntregas((v) => !v)}>{verEntregas ? 'Ocultar entregas' : 'Ver entregas'}</button>
      </span>
      {/* Lo de mantenimiento, con menos peso: se usa poco y no debe competir con probar. */}
      <span className="flex flex-wrap gap-x-4 gap-y-1">
        <button type="button" className={enlace} onClick={() => setEditando(true)}>Editar</button>
        <button type="button" className={enlace} onClick={() => setPregunta('rotar')}>Cambiar el secreto</button>
        {w.estado !== 'desactivado' && <button type="button" className={enlace} onClick={() => setPregunta('desactivar')}>Desactivar</button>}
        <button type="button" className={cn(enlace, 'text-destructive hover:text-destructive')} onClick={() => setPregunta('borrar')}>Borrar</button>
      </span>
      {prueba && <p role="status" className="text-sm text-foreground m-0">{prueba}</p>}
      {error && <p role="alert" className="text-sm font-medium text-destructive m-0">{error}</p>}
      {verEntregas && <Entregas webhookId={w.id} activo={w.estado !== 'desactivado'} />}
      <ConfirmDialog
        open={pregunta === 'borrar'} onOpenChange={(o) => !o && setPregunta(null)}
        titulo={`¿Borrar «${nombre}»?`}
        descripcion="Deja de mandar avisos al momento y desaparece de esta lista."
        textoConfirmar="Sí, borrarlo" destructivo
        onConfirm={() => { setPregunta(null); void accion(`${BASE}/${encodeURIComponent(w.id)}`, { method: 'DELETE' }, () => onCambio(`«${nombre}» borrado.`)); }}
      />
      <ConfirmDialog
        open={pregunta === 'desactivar'} onOpenChange={(o) => !o && setPregunta(null)}
        titulo={`¿Desactivar «${nombre}»?`}
        descripcion="Deja de mandar avisos y lo que quedaba por mandar no se manda. Puedes reactivarlo cuando quieras; lo que pase mientras tanto no se le avisa."
        textoConfirmar="Desactivar"
        onConfirm={() => { setPregunta(null); void accion(`${BASE}/${encodeURIComponent(w.id)}`, { method: 'PATCH', body: JSON.stringify({ activo: false }) }, () => onCambio(`«${nombre}» desactivado.`)); }}
      />
      <ConfirmDialog
        open={pregunta === 'rotar'} onOpenChange={(o) => !o && setPregunta(null)}
        titulo="¿Cambiar el secreto de firma?"
        descripcion="Se crea uno nuevo. El de ahora sigue firmando también durante 24 horas, para que te dé tiempo a cambiarlo en tu programa sin perder avisos."
        textoConfirmar="Crear el nuevo"
        onConfirm={() => { setPregunta(null); void accion<{ secreto: string }>(`${BASE}/${encodeURIComponent(w.id)}/rotar`, { method: 'POST' }, (d) => onCambio('Secreto cambiado.', d.secreto)); }}
      />
    </li>
  );
}

const ETIQUETA_ENTREGA: Record<Entrega['estado'], string> = {
  PENDIENTE: 'En cola', ENTREGADA: 'Entregado', FALLIDA: 'No se pudo entregar', DESCARTADA: 'No se mandó',
};

function Entregas({ webhookId, activo }: { webhookId: string; activo: boolean }) {
  const [entregas, setEntregas] = useState<Entrega[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    let vivo = true;
    void pedir<{ entregas: Entrega[] }>(`${BASE}/${encodeURIComponent(webhookId)}/entregas`).then((r) => {
      if (!vivo) return;
      if (r.ok) setEntregas(Array.isArray(r.datos.entregas) ? r.datos.entregas : []); else setError(r.error);
    });
    return () => { vivo = false; };
  }, [webhookId, vuelta]);

  async function reenviar(id: string) {
    const r = await pedir(`${BASE}/entregas/${encodeURIComponent(id)}/reenviar`, { method: 'POST' });
    if (!r.ok) setError(r.error); else { setError(null); setVuelta((v) => v + 1); }
  }

  const caja = 'mt-1 rounded-lg border border-border/60 p-3';
  if (error) return <p role="alert" className={cn(caja, 'text-sm text-destructive m-0')}>{error}</p>;
  if (!entregas) return <p role="status" className={cn(caja, 'text-sm text-muted-foreground m-0')}>Cargando…</p>;
  if (entregas.length === 0) return <p className={cn(caja, 'text-sm text-muted-foreground m-0')}>Todavía no ha mandado ningún aviso.</p>;
  return (
    <ul className={cn(caja, 'flex flex-col gap-2 text-xs')} aria-label="Últimas entregas">
      {entregas.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
          <span className="tabular-nums">{cuando(e.creadaEn)}</span>
          <span className="text-foreground">{e.tipo ? nombreTipo(e.tipo) : '—'}</span>
          <span className={cn(e.estado === 'FALLIDA' ? 'text-destructive font-semibold' : e.estado === 'ENTREGADA' ? 'text-foreground' : '')}>
            {ETIQUETA_ENTREGA[e.estado]}{e.ultimoEstadoHttp ? ` (${e.ultimoEstadoHttp})` : ''}{e.intentos > 1 ? ` · ${e.intentos} intentos` : ''}
          </span>
          {e.estado === 'PENDIENTE' && e.proximoIntentoEn && e.intentos > 0 && <span>· reintenta {cuando(e.proximoIntentoEn)}</span>}
          {e.ultimoError && e.estado !== 'ENTREGADA' && <span className="basis-full text-pretty">{e.ultimoError}</span>}
          {activo && e.estado !== 'PENDIENTE' && (
            <button type="button" className="underline underline-offset-2 text-foreground" onClick={() => void reenviar(e.id)}>Reenviar</button>
          )}
        </li>
      ))}
    </ul>
  );
}
