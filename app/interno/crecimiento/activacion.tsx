'use client';

// Activación y altas por mes: vivían en el antiguo «Resumen» de /interno. Con la
// portada «Hoy» (16-oct-2026) se mudan aquí, que es donde se mira el
// crecimiento. Mismas cifras, misma ruta (`/api/interno/kpis`, `studios.read`):
// sin permiso o con un fallo, la sección no aparece en vez de tumbar la pantalla.
//
// Encima, desde el 21-oct-2026, la activación de estudios NUEVOS (el embudo del
// alta y sus cohortes por semana, lib/alta/embudo.ts): `growth.read` y su propia
// ruta. Aquí un fallo NO esconde la sección: dice «Faltan datos», porque una
// tabla de cohortes que desaparece se lee como «no hay altas».

import { useEffect, useState, type CSSProperties } from 'react';
import { fetchActivacion, fetchKpis, SinAcceso, type Kpis } from '@/lib/interno/client';
import { diaCorto, horasConComa, type FilaCohorte, type PasoVista, type ResumenActivacion, type Tasa } from '@/lib/alta/embudo';

function Tarjeta({ titulo, valor, pie }: { titulo: string; valor: string; pie?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3.5 py-3 sm:px-4 sm:py-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-[22px] sm:text-[26px] font-bold tabular-nums leading-none text-foreground">{valor}</p>
      {pie && <p className="mt-1.5 text-[11.5px] text-muted-foreground leading-snug">{pie}</p>}
    </div>
  );
}

export function ActivacionYAltas() {
  const [k, setK] = useState<Kpis | null>(null);
  useEffect(() => {
    void fetchKpis().then(r => { if (r?.onboarding && Array.isArray(r.altasPorMes)) setK(r); }).catch(() => {});
  }, []);

  return (
    <>
      <ActivacionEstudiosNuevos />
      {k && <ActivacionGeneral k={k} />}
    </>
  );
}

function ActivacionGeneral({ k }: { k: Kpis }) {
  const maxAltas = Math.max(1, ...k.altasPorMes.map(a => a.altas));
  return (
    <>
      {/* Un cero se lee como un dato: si una lectura ha fallado hay que decirlo
          (ver `noLeidos` en app/api/interno/kpis/route.ts). */}
      {k.noLeidos && k.noLeidos.length > 0 && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-[13px] text-foreground">
          <strong className="font-semibold">Faltan datos, no son ceros.</strong>{' '}
          No se ha podido leer: {k.noLeidos.join(', ')}. La activación y las altas están incompletas.
        </p>
      )}
      <section>
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Activación (onboarding)</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <Tarjeta
            titulo="Estudios activados" valor={`${k.onboarding.activados}/${k.onboarding.totalConActividad}`}
            pie="De los que tienen actividad: ya han recibido su primera reserva." />
          <Tarjeta
            titulo="Paso donde más se atascan"
            valor={k.onboarding.pasoMasBloqueante ? String(k.onboarding.pasoMasBloqueante.pendientes) : '0'}
            pie={k.onboarding.pasoMasBloqueante
              ? `"${k.onboarding.pasoMasBloqueante.label}" — pendiente en ${k.onboarding.pasoMasBloqueante.pendientes} estudio(s).`
              : 'Ninguno: a los que aún no tienen reservas no les falta ningún paso.'} />
          <Tarjeta
            titulo="Altas (30 días)" valor={String(k.estudios.altasUltimos30d)}
            pie={`${k.estudios.total} estudios en total · ${k.estudios.vacios} sin ninguna socia ni clase.`} />
        </div>
      </section>

      <section>
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground mb-2.5">Altas por mes</h2>
        <div className="rounded-2xl border border-border bg-card p-4">
          {k.altasPorMes.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Todavía no hay altas que dibujar.</p>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {k.altasPorMes.map(a => (
                // `h-full` en la columna y un hueco `flex-1` para la barra: la
                // altura en % necesita un padre con altura REAL (si no, resuelve
                // a cero y el gráfico sale vacío).
                <div key={a.mes} className="flex-1 h-full flex flex-col items-center gap-1.5 min-w-0">
                  <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{a.altas}</span>
                  <div className="w-full flex-1 flex items-end">
                    <div className="w-full rounded-t bg-brand/80" style={{ height: `${(a.altas / maxAltas) * 100}%` }} />
                  </div>
                  <span className="text-[10.5px] text-muted-foreground truncate w-full text-center">{a.mes}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// ── Activación de estudios nuevos ───────────────────────────────────────────

type Carga =
  | { estado: 'cargando' }
  | { estado: 'sin-permiso' }
  | { estado: 'error' }
  | { estado: 'ok'; r: ResumenActivacion };

/** Sin dar por hecha la forma de la respuesta: un `{}` es «faltan datos», no ceros. */
function esResumen(x: unknown): x is ResumenActivacion {
  const r = x as Partial<ResumenActivacion> | null;
  return !!r && typeof r.tarjetas === 'object' && r.tarjetas !== null && typeof r.tarjetas.estudios === 'number'
    && Array.isArray(r.embudo?.altas) && Array.isArray(r.embudo?.estudios) && Array.isArray(r.cohortes);
}

const guion = '—';
const cifra = (n: number | null) => (n === null ? guion : String(n));
const tasa = (t: Tasa | null) => (t ? `${t.si}/${t.de}` : guion);

export function ActivacionEstudiosNuevos() {
  const [c, setC] = useState<Carga>({ estado: 'cargando' });
  useEffect(() => {
    let vivo = true;
    fetchActivacion()
      .then(r => { if (vivo) setC(esResumen(r) ? { estado: 'ok', r } : { estado: 'error' }); })
      // Sin permiso, la sección no es suya y no sale (como Review Boost). Cualquier
      // otro fallo, sí: con el aviso y sin una sola cifra.
      .catch(e => { if (vivo) setC(e instanceof SinAcceso ? { estado: 'sin-permiso' } : { estado: 'error' }); });
    return () => { vivo = false; };
  }, []);

  if (c.estado === 'sin-permiso') return null;

  return (
    <section data-testid="activacion-estudios-nuevos" aria-labelledby="activacion-nuevos-t" className="flex flex-col gap-3">
      <div>
        <h2 id="activacion-nuevos-t" className="text-[13px] font-bold text-foreground">Activación de estudios nuevos</h2>
        <p className="text-[12px] text-muted-foreground">
          Sin demos ni sedes de cadena. Sale de la base de datos, no del navegador: está aunque se bloquee la analítica.
        </p>
      </div>

      {c.estado === 'cargando' && <p className="text-[12.5px] text-muted-foreground">Cargando…</p>}

      {c.estado === 'error' && (
        <p role="alert" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-[13px] text-foreground">
          <strong className="font-semibold">Faltan datos, no son ceros.</strong>{' '}
          No se ha podido leer el embudo del alta: aquí no hay ninguna cifra en la que fiarse.
        </p>
      )}

      {c.estado === 'ok' && <ContenidoActivacion r={c.r} />}
    </section>
  );
}

function ContenidoActivacion({ r }: { r: ResumenActivacion }) {
  const t = r.tarjetas;
  const sinEstudios = t.estudios === 0;
  const panel = t.panelMedidoDesde;
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Tarjeta
          titulo="Con clase" valor={sinEstudios ? guion : `${t.conClase}/${t.estudios}`}
          pie="Estudios con al menos una clase. Objetivo: clase reservable en 7 días." />
        <Tarjeta
          titulo="Alta → 1.ª clase"
          valor={t.medianaHorasPrimeraClase === null ? guion : horasConComa(t.medianaHorasPrimeraClase)}
          pie={t.medianaHorasPrimeraClase === null
            ? (t.clasesSinHora > 0 ? 'Sus clases son de antes del 13-sep: no se sabe cuándo se programaron.' : 'Ningún estudio ha programado una clase todavía.')
            : `Mediana, n = ${t.nMediana}${t.clasesSinHora > 0 ? ` (${t.clasesSinHora} sin hora)` : ''}. Objetivo: el mismo día.`} />
        <Tarjeta
          titulo="Primera reserva" valor={sinEstudios ? guion : `${t.conReserva}/${t.estudios}`}
          pie={sinEstudios ? 'Sin estudios nuevos en estos días.' : `${t.reservaEn7Dias} en sus primeros 7 días.`} />
        <Tarjeta
          titulo="Vuelven el día 7" valor={tasa(t.vuelvenD7)}
          pie={!panel
            ? 'No se mide todavía.'
            : t.vuelvenD7
              ? `Entraron algún día del 7 al 13. Se mide desde el ${diaCorto(panel)}.`
              : `Se mide desde el ${diaCorto(panel)}: ningún estudio ha pasado aún su día 13.`} />
      </div>

      <div className="rounded-2xl border border-border bg-card px-3.5 py-3 sm:px-4 sm:py-3.5">
        <h3 className="text-[14px] font-bold text-foreground">Embudo del alta</h3>
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Últimos {r.ventanaDias} días · sin datos personales
        </p>
        <div className="mt-3 flex flex-col gap-2" data-testid="embudo-alta">
          {r.embudo.altas.map(p => <PasoDelEmbudo key={p.id} p={p} />)}
          <p className="mt-1.5 border-t border-dashed border-border pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Desde aquí, {r.embudo.nEstudios === 1 ? 'el estudio' : `los ${r.embudo.nEstudios} estudios`} (sin demos ni sedes de cadena)
          </p>
          {r.embudo.estudios.map(p => <PasoDelEmbudo key={p.id} p={p} />)}
        </div>
        <p className="mt-3 text-[11.5px] leading-snug text-muted-foreground">
          «Nuevo» se apunta desde este cambio y solo cuenta a los estudios nacidos desde que se mide. «Tipo de clase» y
          «Tarifa activa» son como están hoy: esas tablas no guardan cuándo se crearon.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card px-3.5 py-3 sm:px-4 sm:py-3.5">
        <h3 className="text-[14px] font-bold text-foreground">Cohortes por semana de alta</h3>
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Antes y después de cada cambio, en lugar de un test A/B
        </p>
        {/* La tabla se desplaza dentro de su caja: la página no ensancha en un móvil. */}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-[12.5px]" data-testid="cohortes-alta">
            <thead>
              <tr className="border-b border-border text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 pr-3 text-left">Cohorte</th>
                <th scope="col" className="px-2 py-2 text-right">Altas</th>
                <th scope="col" className="px-2 py-2 text-right">Con clase</th>
                <th scope="col" className="px-2 py-2 text-right">En 24 h</th>
                <th scope="col" className="px-2 py-2 text-right">Mediana</th>
                <th scope="col" className="px-2 py-2 text-right">Vuelven d1 · d7 · d30</th>
                <th scope="col" className="py-2 pl-2 text-right">1.ª reserva</th>
              </tr>
            </thead>
            <tbody>
              {r.cohortes.map(c => <FilaDeCohorte key={c.clave} c={c} />)}
            </tbody>
          </table>
        </div>
        <p className="mt-2.5 text-[11.5px] leading-snug text-muted-foreground">
          d1: entra el día siguiente al alta · d7: algún día del 7 al 13 · d30: del 30 al 36. «—» es que no se sabe
          todavía (no se medía, o la cohorte aún no ha llegado a ese día), nunca un cero.
        </p>
      </div>
    </>
  );
}

// Las barras rayadas son las de los pasos que todavía no tienen datos.
const RAYADO: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, var(--muted) 0 6px, transparent 6px 12px)',
};

function PasoDelEmbudo({ p }: { p: PasoVista }) {
  const sinDato = p.n === null;
  const ancho = !sinDato && p.de ? Math.round(((p.n ?? 0) / p.de) * 100) : 0;
  let detalle: string;
  if (p.fuente === 'nuevo') {
    detalle = !p.desde
      ? 'sin datos todavía'
      : sinDato
        ? `se mide desde el ${diaCorto(p.desde)}, sin estudios nuevos aún`
        : `de ${p.de} · desde el ${diaCorto(p.desde)}`;
  } else {
    detalle = [p.nota === 'hoy' ? 'cómo está hoy' : null, p.desde ? `desde el ${diaCorto(p.desde)}` : null]
      .filter(Boolean).join(' · ');
  }
  return (
    <div data-testid={`paso-${p.id}`} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_2.5rem] items-center gap-x-2.5 gap-y-0.5 text-[12.5px] sm:grid-cols-[11rem_minmax(0,1fr)_2.5rem_minmax(0,15rem)]">
      <span className="truncate text-foreground">{p.etiqueta}</span>
      <span
        className={`h-3 overflow-hidden rounded ${sinDato ? 'border border-border' : 'bg-muted'}`}
        style={sinDato ? RAYADO : undefined}
      >
        {!sinDato && <span className="block h-full rounded bg-brand-medio" style={{ width: `${ancho}%` }} />}
      </span>
      <span className="text-right font-semibold tabular-nums text-foreground">{cifra(p.n)}</span>
      <span className="col-span-3 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground sm:col-span-1">
        <span className={`shrink-0 rounded px-1.5 py-px text-[10.5px] font-bold ${
          p.fuente === 'nuevo' ? 'bg-sky-500/12 text-sky-700 dark:text-sky-400' : 'bg-muted text-muted-foreground'
        }`}>
          {p.fuente}
        </span>
        {detalle && <span className="truncate">{detalle}</span>}
      </span>
    </div>
  );
}

function FilaDeCohorte({ c }: { c: FilaCohorte }) {
  const td = 'px-2 py-2.5 text-right tabular-nums';
  const vacia = c.altas === null;
  return (
    <tr className={`border-b border-border/60 last:border-0 ${vacia ? 'text-muted-foreground' : 'text-foreground'}`}>
      <td className="py-2.5 pr-3 text-left">
        {c.etiqueta}
        {c.detalle && <span className="text-muted-foreground"> · {c.detalle}</span>}
      </td>
      <td className={td}>{cifra(c.altas)}</td>
      <td className={td}>{cifra(c.conClase)}</td>
      <td className={td}>{cifra(c.en24h)}</td>
      <td className={td} title={c.nMediana > 0 ? `n = ${c.nMediana}` : undefined}>
        {c.medianaHoras === null ? guion : horasConComa(c.medianaHoras)}
      </td>
      <td className={td}>{tasa(c.d1)} · {tasa(c.d7)} · {tasa(c.d30)}</td>
      <td className="py-2.5 pl-2 text-right tabular-nums">{cifra(c.primeraReserva)}</td>
    </tr>
  );
}
