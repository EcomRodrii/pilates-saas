'use client';

// «API de desarrollador» (12-nov-2026, con el listón de la de Momence): tu
// acceso, tu dirección base y cada endpoint con su método, su ruta y el permiso
// que pide, agrupados por recurso y con un ejemplo que se copia.
//
// Es la API pública v1 de siempre (`docs/api-publica.md`), no una API nueva. Dos
// diferencias a propósito con la «Legacy API» de Momence:
//   · la clave va en la cabecera `Authorization: Bearer`, NUNCA en la URL
//     (un token en una URL acaba en logs, historiales y capturas);
//   · cada clave tiene permisos (scopes) y el dinero nunca se escribe desde
//     fuera: no existe ningún `pagos:escribir`.
// Claves: solo la propietaria las crea y las quita (el servidor lo exige). La
// gerencia ve la dirección y los endpoints, que son documentación.

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, Copy, ExternalLink, Search } from 'lucide-react';
import { useRol, puedeGestionarClavesApi } from '@/lib/permisos';
import { copiarAlPortapapeles, cn } from '@/lib/utils';
import { useToast, Toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/ui/page-header';
import { BASE_API, ORDEN_GRUPOS, endpointsDeLaApi, type EndpointApi } from '@/lib/apps/api-endpoints';
import { DESCRIPCION_SCOPE, type ScopeOAuth } from '@/lib/api-publica/catalogo-scopes';
import { DetalleApiPublica, useApiPublica } from '@/components/configuracion/api-publica';

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const EJEMPLO_BASE = `curl -H "Authorization: Bearer $TENTARE_CLAVE" \\
  "${BASE_API}/clientas?limite=50"`;

function ejemploDe(e: EndpointApi): string {
  const url = `${BASE_API}${e.ruta}`;
  if (e.metodo === 'GET') return `curl -H "Authorization: Bearer $TENTARE_CLAVE" \\\n  "${url}"`;
  return `curl -X POST "${url}" \\\n  -H "Authorization: Bearer $TENTARE_CLAVE" \\\n  -H "Idempotency-Key: $(uuidgen)" \\\n  -H "Content-Type: application/json" \\\n  -d '{ … }'`;
}

/** Copia y SOLO dice «Copiado» si el navegador lo ha copiado de verdad (en Safari puede negarse). */
function BotonCopiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [estado, setEstado] = useState<'idle' | 'ok' | 'no'>('idle');
  async function copiar() {
    const ok = await copiarAlPortapapeles(texto);
    setEstado(ok ? 'ok' : 'no');
    setTimeout(() => setEstado('idle'), 1800);
  }
  return (
    <button
      type="button"
      onClick={() => { void copiar(); }}
      aria-label={etiqueta}
      className="zona-tactil inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2 text-[12px] font-semibold text-foreground/80 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {estado === 'ok' ? <Check size={13} aria-hidden style={{ color: 'var(--success)' }} /> : <Copy size={13} aria-hidden />}
      {estado === 'ok' ? 'Copiado' : estado === 'no' ? 'No se pudo' : 'Copiar'}
    </button>
  );
}

function Metodo({ m }: { m: EndpointApi['metodo'] }) {
  const color = m === 'GET' ? 'var(--success)' : 'var(--t-blue-500)';
  return (
    <span
      className="inline-flex h-6 w-[3.25rem] shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-bold tracking-wide"
      style={{ color: m === 'GET' ? 'var(--success)' : 'var(--t-text-link)', backgroundColor: `color-mix(in srgb, ${color} 13%, var(--card))` }}
    >
      {m}
    </span>
  );
}

function FilaEndpoint({ e }: { e: EndpointApi }) {
  const [abierto, setAbierto] = useState(false);
  const ejemplo = ejemploDe(e);
  return (
    <li data-testid="endpoint" data-ruta={e.ruta} data-metodo={e.metodo} className="border-t border-border first:border-t-0">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto(v => !v)}
        className="zona-tactil flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        <Metodo m={e.metodo} />
        <span className="min-w-0 flex-1">
          <code className="block truncate text-[13px] font-medium text-foreground">{e.ruta}</code>
          <span className="block truncate text-[13px] text-muted-foreground">{e.resumen}</span>
        </span>
        {e.scope && <code className="hidden shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11.5px] text-muted-foreground sm:block">{e.scope}</code>}
        <ChevronDown size={16} aria-hidden className={cn('shrink-0 text-muted-foreground transition-transform', abierto && 'rotate-180')} />
      </button>
      {abierto && (
        <div className="space-y-2.5 border-t border-border bg-muted/30 px-4 py-3.5">
          <p className="text-[13px] text-muted-foreground">
            {e.scope
              ? <>Pide el permiso <code className="rounded bg-muted px-1 py-0.5">{e.scope}</code>: {DESCRIPCION_SCOPE[e.scope as ScopeOAuth] ?? 'ver el catálogo de permisos'}.</>
              : 'Basta con tener una clave válida.'}
          </p>
          <div className="relative">
            <pre className="overflow-x-auto rounded-xl border border-border bg-card p-3 pr-24 text-[12px] leading-relaxed text-foreground"><code>{ejemplo}</code></pre>
            <div className="absolute right-2 top-2"><BotonCopiar texto={ejemplo} etiqueta={`Copiar el ejemplo de ${e.metodo} ${e.ruta}`} /></div>
          </div>
        </div>
      )}
    </li>
  );
}

export function ApiDeDesarrollador() {
  const rol = useRol();
  const toast = useToast();
  const [filtro, setFiltro] = useState<'todos' | 'GET' | 'POST'>('todos');
  const [busqueda, setBusqueda] = useState('');
  const q = sinTildes(busqueda.trim());
  const todos = endpointsDeLaApi().filter(e => !e.obsoleto);
  const visibles = todos.filter(e => (filtro === 'todos' || e.metodo === filtro) && (!q || sinTildes(`${e.ruta} ${e.resumen} ${e.scope ?? ''}`).includes(q)));
  const grupos = ORDEN_GRUPOS.map(g => ({ g, items: visibles.filter(e => e.grupo === g) })).filter(x => x.items.length > 0);

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-7" data-testid="api-de-desarrollador">
      <PageHeader title="API de desarrollador" />

      <section aria-labelledby="acceso-api" className="rounded-[22px] border border-border bg-card p-5 sm:p-6">
        <h2 id="acceso-api" className="text-[18px] font-semibold tracking-[-0.01em] text-foreground">Tu acceso</h2>
        <p className="mt-1 max-w-2xl text-[14px] leading-[1.55] text-muted-foreground text-pretty">
          Con la API tu programa de contabilidad, tu web u otra herramienta lee (y en algunos casos crea) datos de tu estudio por su cuenta.
          Cada clave tiene sus permisos y puedes quitarla cuando quieras.
        </p>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-[9rem_1fr]">
          <dt className="font-semibold text-foreground">Dirección base</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded-lg bg-muted px-2 py-1 text-[13px]" data-testid="base-api">{BASE_API}</code>
            <BotonCopiar texto={BASE_API} etiqueta="Copiar la dirección base" />
          </dd>
          <dt className="font-semibold text-foreground">Autenticación</dt>
          <dd className="text-muted-foreground">Cabecera <code className="rounded bg-muted px-1.5 py-0.5 text-[12.5px]">Authorization: Bearer &lt;tu clave&gt;</code>. Nunca en la dirección.</dd>
        </dl>
        <div className="relative mt-4">
          <pre className="overflow-x-auto rounded-xl border border-border bg-muted/50 p-3.5 pr-24 text-[12.5px] leading-relaxed text-foreground"><code>{EJEMPLO_BASE}</code></pre>
          <div className="absolute right-2.5 top-2.5"><BotonCopiar texto={EJEMPLO_BASE} etiqueta="Copiar el ejemplo" /></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[13.5px]">
          <a href="/api/v1/openapi.json" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--t-text-link)' }}>
            Descargar la especificación (OpenAPI) <ExternalLink size={12} aria-hidden />
          </a>
          <Link href="/apps/integraciones?pestana=zapier" className="font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--t-text-link)' }}>
            ¿Usas Zapier? Se conecta desde su ficha
          </Link>
        </div>
      </section>

      <section aria-labelledby="claves-api" className="space-y-3">
        <h2 id="claves-api" className="px-1 text-[18px] font-semibold tracking-[-0.01em] text-foreground">Tus claves</h2>
        {puedeGestionarClavesApi(rol)
          ? <ClavesDePropietaria showToast={toast.show} />
          : (
            <p className="rounded-[22px] border border-dashed border-border bg-card px-5 py-5 text-[13.5px] text-muted-foreground" data-testid="claves-solo-propietaria">
              Crear y quitar claves es cosa de la propietaria. Tú puedes ver aquí cómo se usa cada endpoint.
            </p>
          )}
      </section>

      <section aria-labelledby="endpoints-api" className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="endpoints-api" className="mr-auto px-1 text-[18px] font-semibold tracking-[-0.01em] text-foreground">Endpoints</h2>
          <div role="tablist" aria-label="Tipo de petición" className="flex gap-1">
            {([['todos', 'Todos'], ['GET', 'Lectura'], ['POST', 'Escritura']] as const).map(([id, label]) => (
              <button
                key={id} role="tab" type="button" aria-selected={filtro === id} onClick={() => setFiltro(id)}
                className={cn(
                  'zona-tactil h-8 rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  filtro === id ? 'bg-[color:color-mix(in_srgb,var(--t-blue-500)_12%,var(--card))] text-[color:var(--t-text-link)]' : 'text-foreground/75 hover:bg-muted',
                )}
              >{label}</button>
            ))}
          </div>
          <label className="flex h-8 w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 focus-within:border-[color:var(--t-blue-500)] sm:w-56">
            <Search size={14} className="shrink-0 text-muted-foreground" aria-hidden />
            <span className="sr-only">Buscar un endpoint</span>
            <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar endpoint…" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground" />
          </label>
        </div>

        {grupos.length === 0 && (
          <p className="rounded-[22px] border border-dashed border-border bg-card px-4 py-10 text-center text-[14px] text-muted-foreground">Ningún endpoint coincide. Prueba con «clientes», «reservas» o «facturas».</p>
        )}
        <div className="space-y-5" data-testid="lista-endpoints">
          {grupos.map(({ g, items }) => (
            <div key={g}>
              <h3 className="px-1 pb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{g}</h3>
              <ul className="overflow-hidden rounded-[18px] border border-border bg-card">
                {items.map(e => <FilaEndpoint key={`${e.metodo} ${e.ruta}`} e={e} />)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {toast.message && <Toast message={toast.message} action={toast.action} variant={toast.variant} onDismiss={toast.dismiss} />}
    </div>
  );
}

function ClavesDePropietaria({ showToast }: { showToast: (m: string) => void }) {
  const api = useApiPublica();
  return (
    <div className="rounded-[22px] border border-border bg-card p-5">
      <DetalleApiPublica a={api} showToast={showToast} />
    </div>
  );
}
