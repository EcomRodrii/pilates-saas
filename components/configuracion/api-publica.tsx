'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { Check, Copy, ExternalLink, KeyRound } from 'lucide-react';
import { cn, copiarAlPortapapeles } from '@/lib/utils';
import { authHeader } from '@/lib/api-client';
import { cuando } from '@/lib/integraciones/salud';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { DESCRIPCION_SCOPE, SCOPES_CONTABILIDAD, type ScopeOAuth } from '@/lib/api-publica/catalogo-scopes';
import { CADUCIDADES_DIAS } from '@/lib/api-publica/gestion-reglas';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SOPORTE_WHATSAPP } from '@/components/layout/whatsapp-fab';
import { btnPrimary, btnSecondary, inputCls, labelCls } from '@/components/configuracion/estilos';
import { WebhooksApi } from '@/components/configuracion/api-webhooks';
import type { PropsFormularioCajon } from '@/components/configuracion/shell/cajon-ajuste';

// ─────────────────────────────────────────────────────────────────────────────
// «API para tu contabilidad» (Configuración → Conexiones). Claves de API del
// estudio: crearlas (se enseñan UNA vez), revocarlas, rotarlas y ver qué se ha
// pedido con ellas; y los webhooks (api-webhooks.tsx). Solo la propietaria (la sección entera ya lo es, y el
// servidor lo comprueba: /api/integrations/api-publica/*).
//
// La API se activa estudio a estudio (decisión del fundador, 1-oct-2026): sin
// activar, el cajón explica para qué sirve y cómo pedirla.
//
// A la dueña de una cadena se le ofrece además una clave para todas sus sedes
// (lib/api-publica/cadena.ts): cada petición dice la sede con la cabecera
// Tentare-Estudio, así que aquí se enseña el código de cada una.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClaveApi {
  id: string; nombre: string; prefijo: string; scopes: ScopeOAuth[]; creadaEn: string;
  expiraEn: string | null; ultimoUsoEn: string | null; revocadaEn: string | null;
  estado: 'activa' | 'caducada' | 'revocada';
  alcance: 'sede' | 'cadena';
}
interface SedeCadena { id: string; nombre: string; apiActivada: boolean; esEsta: boolean }
interface Llamada { id: number; en: string; metodo: string; ruta: string; status: number; claveId: string | null; appId: string | null }
/** `sedesCadena`: solo a la dueña de una cadena de varias sedes. */
type Datos = { activada: boolean; permitidos: ScopeOAuth[]; claves: ClaveApi[]; sedesCadena: SedeCadena[] | null };

export interface ApiPublica {
  datos: Datos | null;
  error: boolean;
  recargar: () => void;
}

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

export function useApiPublica(): ApiPublica {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    let vivo = true;
    void pedir<Partial<Datos>>('/api/integrations/api-publica/claves').then((r) => {
      if (!vivo) return;
      if (!r.ok) { setError(true); return; }
      // Sin dar por hecha la forma: una respuesta sin `claves` no puede tumbar
      // la sección entera de Conexiones.
      setDatos({
        activada: r.datos.activada === true,
        permitidos: Array.isArray(r.datos.permitidos) ? r.datos.permitidos : [],
        claves: Array.isArray(r.datos.claves) ? r.datos.claves : [],
        sedesCadena: Array.isArray(r.datos.sedesCadena) && r.datos.sedesCadena.length > 1 ? r.datos.sedesCadena : null,
      });
      setError(false);
    });
    return () => { vivo = false; };
  }, [vuelta]);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { datos, error, recargar };
}

/** La frase de la fila en Conexiones. `null` mientras carga. */
export function resumenApiPublica(a: ApiPublica): string | null {
  if (a.error) return 'No se ha podido cargar';
  if (!a.datos) return null;
  if (!a.datos.activada) return 'Sin activar';
  const activas = a.datos.claves.filter((c) => c.estado === 'activa');
  if (activas.length === 0) return 'Activada · ninguna clave todavía';
  const usos = activas.map((c) => c.ultimoUsoEn).filter((x): x is string => !!x).sort();
  const ultimo = usos.at(-1);
  return `${activas.length === 1 ? '1 clave activa' : `${activas.length} claves activas`}${ultimo ? ` · último uso ${cuando(ultimo)}` : ' · sin usar todavía'}`;
}

const nombreScope = (s: ScopeOAuth) => DESCRIPCION_SCOPE[s] ?? s;

export function DetalleApiPublica({ a, showToast }: { a: ApiPublica } & Pick<PropsFormularioCajon, 'showToast'>) {
  if (a.error) return <p role="alert" className="pb-6 text-sm font-medium text-destructive text-pretty">No se ha podido cargar. Cierra y vuelve a intentarlo.</p>;
  if (!a.datos) return <p role="status" className="pb-6 text-sm text-muted-foreground">Cargando…</p>;
  if (!a.datos.activada) return <SinActivar />;
  return <Activada datos={a.datos} recargar={a.recargar} showToast={showToast} />;
}

function SinActivar() {
  const enlace = enlaceWhatsApp(SOPORTE_WHATSAPP, 'Hola, quiero activar la API de Tentare para mi estudio.');
  return (
    <div className="flex flex-col gap-4 pb-6">
      <p className="text-sm text-foreground text-pretty">
        La API permite que tu programa de contabilidad (u otra herramienta) lea por su cuenta tus cobros, facturas, devoluciones,
        ventas de la caja y alumnas, sin exportar nada a mano.
      </p>
      <p className="text-sm text-foreground text-pretty">Todavía no está activada para tu estudio. Pídenosla y te la activamos.</p>
      {enlace && (
        <a href={enlace} target="_blank" rel="noopener noreferrer" className={cn(btnPrimary, 'self-start no-underline')}>
          Pedir la API por WhatsApp <ExternalLink size={14} aria-hidden />
        </a>
      )}
    </div>
  );
}

function Activada({ datos, recargar, showToast }: { datos: Datos; recargar: () => void } & Pick<PropsFormularioCajon, 'showToast'>) {
  const [creando, setCreando] = useState(false);
  const [nueva, setNueva] = useState<{ clave: string; nombre: string; alcance: ClaveApi['alcance'] } | null>(null);
  const activas = datos.claves.filter((c) => c.estado === 'activa');
  const inactivas = datos.claves.filter((c) => c.estado !== 'activa');

  return (
    <div className="flex flex-col gap-6 pb-6">
      <p className="text-sm text-muted-foreground text-pretty">
        Cada clave da acceso de solo lectura a lo que elijas. Dásela a tu programa de contabilidad o a quien te lo configure, y revócala cuando ya no la necesite.
      </p>

      {nueva && <ClaveRecienCreada clave={nueva.clave} nombre={nueva.nombre} sedes={nueva.alcance === 'cadena' ? datos.sedesCadena : null} onCerrar={() => setNueva(null)} />}

      {!nueva && (creando
        ? <FormularioClave permitidos={datos.permitidos} sedesCadena={datos.sedesCadena} onCancelar={() => setCreando(false)}
            onCreada={(clave, nombre, alcance) => { setCreando(false); setNueva({ clave, nombre, alcance }); recargar(); }} />
        : <button type="button" onClick={() => setCreando(true)} className={cn(btnPrimary, 'self-start')}><KeyRound size={14} aria-hidden /> Crear una clave</button>)}

      <section aria-labelledby="claves-activas" className="flex flex-col gap-2">
        <h3 id="claves-activas" className="text-sm font-semibold text-foreground m-0">Claves activas</h3>
        {activas.length === 0
          ? <p className="text-sm text-muted-foreground m-0">Ninguna.</p>
          : <ul className="flex flex-col divide-y divide-border">{activas.map((c) => (
              <FilaClave key={c.id} c={c} sedesCadena={datos.sedesCadena}
                onCambio={(texto, clave) => { recargar(); if (clave) setNueva({ clave, nombre: c.nombre, alcance: c.alcance }); showToast(texto); }} />
            ))}</ul>}
      </section>

      {inactivas.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Revocadas y caducadas ({inactivas.length})</summary>
          <ul className="mt-2 flex flex-col gap-1">{inactivas.map((c) => (
            <li key={c.id} className="text-muted-foreground">
              <span className="text-foreground">{c.nombre}</span>{c.alcance === 'cadena' ? ' (todas las sedes)' : ''} · <code className="text-xs">{c.prefijo}…</code> · {c.estado === 'revocada' && c.revocadaEn ? `revocada el ${cuando(c.revocadaEn)}` : 'caducada'}
            </li>
          ))}</ul>
        </details>
      )}

      <WebhooksApi />

      <Actividad claves={datos.claves} />

      <p className="text-xs text-muted-foreground text-pretty m-0">
        Para quien conecte el programa: la especificación está en{' '}
        <a href="/api/v1/openapi.json" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">/api/v1/openapi.json</a>.
        Importes en céntimos; las cifras restan lo devuelto, igual que en Tentare.
      </p>
    </div>
  );
}

function FormularioClave({ permitidos, sedesCadena, onCancelar, onCreada }: {
  permitidos: ScopeOAuth[]; sedesCadena: SedeCadena[] | null; onCancelar: () => void;
  onCreada: (clave: string, nombre: string, alcance: ClaveApi['alcance']) => void;
}) {
  const id = useId();
  const [nombre, setNombre] = useState('Contabilidad');
  const [alcance, setAlcance] = useState<ClaveApi['alcance']>('sede');
  const [scopes, setScopes] = useState<ScopeOAuth[]>(SCOPES_CONTABILIDAD.filter((s) => permitidos.includes(s)));
  const [caduca, setCaduca] = useState<string>('365');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Solo lectura en esta pantalla: escribir desde fuera (crear clientas o
  // reservas) es cosa de Zapier, con su consentimiento por app.
  const deLectura = permitidos.filter((s) => s.endsWith(':leer') || s === 'clientas:datos_fiscales');

  async function crear() {
    setEnviando(true);
    setError(null);
    const r = await pedir<{ clave: string }>('/api/integrations/api-publica/claves', {
      method: 'POST', body: JSON.stringify({ nombre, scopes, caducaEnDias: caduca === 'nunca' ? null : Number(caduca), alcance }),
    });
    setEnviando(false);
    if (!r.ok) setError(r.error);
    else onCreada(r.datos.clave, nombre.trim(), alcance);
  }
  const estaSede = sedesCadena?.find((s) => s.esEsta)?.nombre;

  return (
    <form onSubmit={(e) => { e.preventDefault(); void crear(); }} className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <div>
        <label htmlFor={`${id}-nombre`} className={labelCls}>Para qué es</label>
        <input id={`${id}-nombre`} className={inputCls} value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} />
      </div>
      {sedesCadena && (
        <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
          <legend className={labelCls}>Para qué sedes</legend>
          <label className="flex items-start gap-2 text-sm text-foreground min-h-9">
            <input type="radio" className="mt-1" name={`${id}-alcance`} checked={alcance === 'sede'} onChange={() => setAlcance('sede')} />
            <span>Solo esta sede{estaSede ? ` (${estaSede})` : ''}</span>
          </label>
          <label className="flex items-start gap-2 text-sm text-foreground min-h-9">
            <input type="radio" className="mt-1" name={`${id}-alcance`} checked={alcance === 'cadena'} onChange={() => setAlcance('cadena')} />
            <span>
              Todas tus sedes ({sedesCadena.length})
              <span className="block text-xs text-muted-foreground text-pretty">Una sola clave para la contabilidad de toda la cadena. Tu programa dice en cada petición de qué sede la quiere.</span>
            </span>
          </label>
        </fieldset>
      )}
      <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
        <legend className={labelCls}>Qué puede leer</legend>
        {deLectura.map((s) => (
          <label key={s} className="flex items-start gap-2 text-sm text-foreground min-h-9">
            <input type="checkbox" className="mt-1" checked={scopes.includes(s)}
              onChange={(e) => setScopes((prev) => e.target.checked ? [...prev, s] : prev.filter((x) => x !== s))} />
            <span>{nombreScope(s)}</span>
          </label>
        ))}
      </fieldset>
      <div>
        <label htmlFor={`${id}-caduca`} className={labelCls}>Caduca</label>
        <select id={`${id}-caduca`} className={inputCls} value={caduca} onChange={(e) => setCaduca(e.target.value)}>
          {CADUCIDADES_DIAS.map((d) => <option key={d} value={String(d)}>{d === 365 ? 'En un año' : `En ${d} días`}</option>)}
          <option value="nunca">No caduca</option>
        </select>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-destructive text-pretty m-0">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={enviando || scopes.length === 0 || !nombre.trim()} className={btnPrimary}>{enviando ? 'Creando…' : 'Crear la clave'}</button>
        <button type="button" onClick={onCancelar} className={btnSecondary}>Cancelar</button>
      </div>
    </form>
  );
}

function ClaveRecienCreada({ clave, nombre, sedes, onCerrar }: { clave: string; nombre: string; sedes: SedeCadena[] | null; onCerrar: () => void }) {
  const id = useId();
  const [copiada, setCopiada] = useState<'si' | 'no' | null>(null);
  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl border border-success/40 bg-success/10 p-4">
      <p className="text-sm font-semibold text-foreground m-0">Clave «{nombre}» creada. Cópiala ahora: no la volverás a ver.</p>
      <label htmlFor={`${id}-clave`} className="sr-only">Clave de API</label>
      {/* Seleccionable a mano: en algunos navegadores (Safari) copiar puede no
          funcionar, y el texto tiene que poder llevarse igual. */}
      <input id={`${id}-clave`} readOnly value={clave} onFocus={(e) => e.currentTarget.select()} className={cn(inputCls, 'font-mono text-xs')} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnPrimary} onClick={async () => setCopiada((await copiarAlPortapapeles(clave)) ? 'si' : 'no')}>
          {copiada === 'si' ? <><Check size={14} aria-hidden /> Copiada</> : <><Copy size={14} aria-hidden /> Copiar</>}
        </button>
        <button type="button" className={btnSecondary} onClick={onCerrar}>Ya la he guardado</button>
      </div>
      {copiada === 'no' && <p role="alert" className="text-sm text-foreground m-0">Tu navegador no deja copiarla: selecciónala en el recuadro y cópiala a mano.</p>}
      {sedes && <SedesDeLaClave sedes={sedes} abierto />}
    </div>
  );
}

/**
 * Lo que necesita quien conecte una clave de cadena: el código de cada sede,
 * que va en la cabecera Tentare-Estudio. Las sedes sin la API activada se
 * enseñan igual, avisando de que la clave aún no llega a ellas.
 */
function SedesDeLaClave({ sedes, abierto = false }: { sedes: SedeCadena[]; abierto?: boolean }) {
  return (
    <details className="text-sm" open={abierto}>
      <summary className="cursor-pointer text-muted-foreground">Códigos de las sedes, para quien la conecte</summary>
      <p className="mt-2 mb-1 text-xs text-muted-foreground text-pretty">
        Cada petición lleva la cabecera <code>Tentare-Estudio</code> con el código de la sede.
      </p>
      <ul className="flex flex-col gap-1 m-0 p-0 list-none">
        {sedes.map((s) => (
          <li key={s.id} className="flex flex-wrap gap-x-2 text-foreground">
            <span>{s.nombre}</span>
            <code className="text-xs text-muted-foreground">{s.id}</code>
            {!s.apiActivada && <span className="text-xs text-muted-foreground">· la API no está activada aquí: la clave no llegará hasta que la activemos</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

function FilaClave({ c, sedesCadena, onCambio }: { c: ClaveApi; sedesCadena: SedeCadena[] | null; onCambio: (texto: string, claveNueva?: string) => void }) {
  const [pregunta, setPregunta] = useState<'revocar' | 'rotar' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function revocar() {
    const r = await pedir(`/api/integrations/api-publica/claves/${encodeURIComponent(c.id)}`, { method: 'DELETE' });
    if (!r.ok) setError(r.error); else onCambio(`Clave «${c.nombre}» revocada`);
  }
  async function rotar() {
    const r = await pedir<{ clave: string; viejaCaducaEnHoras: number }>(`/api/integrations/api-publica/claves/${encodeURIComponent(c.id)}/rotar`, { method: 'POST' });
    if (!r.ok) setError(r.error); else onCambio(`Clave nueva creada. La anterior deja de valer en ${r.datos.viejaCaducaEnHoras} h`, r.datos.clave);
  }

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0">
      <span>
        <span className="block text-sm font-semibold text-foreground">{c.nombre} <code className="ml-1 text-xs font-normal text-muted-foreground">{c.prefijo}…</code></span>
        <span className="block text-sm text-muted-foreground">
          {c.ultimoUsoEn ? `Último uso ${cuando(c.ultimoUsoEn)}` : 'Sin usar todavía'}
          {c.expiraEn ? ` · caduca ${cuando(c.expiraEn)}` : ''}
        </span>
        <span className="block text-xs text-muted-foreground mt-0.5">{c.alcance === 'cadena' ? 'Todas tus sedes · ' : ''}{c.scopes.map(nombreScope).join(' · ')}</span>
      </span>
      {c.alcance === 'cadena' && sedesCadena && <SedesDeLaClave sedes={sedesCadena} />}
      <span className="flex flex-wrap gap-2">
        <button type="button" className={btnSecondary} onClick={() => setPregunta('rotar')}>Cambiar por una nueva</button>
        <button type="button" className={cn(btnSecondary, 'text-destructive')} onClick={() => setPregunta('revocar')}>Revocar</button>
      </span>
      {error && <p role="alert" className="text-sm font-medium text-destructive m-0">{error}</p>}
      <ConfirmDialog
        open={pregunta === 'revocar'} onOpenChange={(o) => !o && setPregunta(null)}
        titulo={`¿Revocar «${c.nombre}»?`}
        descripcion={c.alcance === 'cadena'
          ? 'Deja de funcionar en el momento, en todas tus sedes: lo que esté conectado con ella dejará de leer tus datos.'
          : 'Deja de funcionar en el momento: lo que esté conectado con ella dejará de leer tus datos.'}
        textoConfirmar="Sí, revocarla" destructivo onConfirm={() => { setPregunta(null); void revocar(); }}
      />
      <ConfirmDialog
        open={pregunta === 'rotar'} onOpenChange={(o) => !o && setPregunta(null)}
        titulo={`¿Cambiar «${c.nombre}» por una nueva?`}
        descripcion="Se crea una clave nueva con los mismos permisos. La de ahora sigue valiendo 24 horas, para que te dé tiempo a cambiarla en tu programa. Si crees que alguien más la tiene, mejor revócala: así deja de valer al momento."
        textoConfirmar="Crear la nueva" onConfirm={() => { setPregunta(null); void rotar(); }}
      />
    </li>
  );
}

function Actividad({ claves }: { claves: ClaveApi[] }) {
  const [llamadas, setLlamadas] = useState<Llamada[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vivo = true;
    void pedir<{ llamadas: Llamada[] }>('/api/integrations/api-publica/actividad').then((r) => {
      if (!vivo) return;
      if (r.ok) setLlamadas(r.datos.llamadas); else setError(true);
    });
    return () => { vivo = false; };
  }, []);
  const nombre = (l: Llamada) => l.claveId ? (claves.find((c) => c.id === l.claveId)?.nombre ?? 'Clave') : (l.appId === 'zapier' ? 'Zapier' : (l.appId ?? '—'));
  const fallidas = (llamadas ?? []).filter((l) => l.status >= 400).length;

  return (
    <section aria-labelledby="actividad-api" className="flex flex-col gap-2">
      <h3 id="actividad-api" className="text-sm font-semibold text-foreground m-0">Últimas llamadas</h3>
      {error && <p role="alert" className="text-sm text-destructive m-0">No se ha podido cargar la actividad.</p>}
      {!error && !llamadas && <p role="status" className="text-sm text-muted-foreground m-0">Cargando…</p>}
      {llamadas && llamadas.length === 0 && <p className="text-sm text-muted-foreground m-0">Ninguna todavía.</p>}
      {llamadas && llamadas.length > 0 && (
        <>
          {fallidas > 0 && <p className="text-sm text-foreground m-0">{fallidas === 1 ? '1 llamada' : `${fallidas} llamadas`} con error en las últimas {llamadas.length}.</p>}
          <ul className="flex flex-col gap-1 text-xs">
            {llamadas.slice(0, 20).map((l) => (
              <li key={l.id} className="flex flex-wrap gap-x-2 text-muted-foreground">
                <span className="tabular-nums">{cuando(l.en)}</span>
                <span className="text-foreground">{nombre(l)}</span>
                <code>{l.metodo} {l.ruta}</code>
                <span className={cn('tabular-nums', l.status >= 400 ? 'text-destructive font-semibold' : '')}>{l.status}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
