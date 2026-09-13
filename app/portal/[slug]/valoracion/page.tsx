'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import { Button } from '@/components/student/ui/Button';
import { Sello } from '@/components/student/ui/Sello';
import { Opcion } from '@/components/student/valoracion/Opcion';
import { Progreso } from '@/components/student/valoracion/Progreso';
import { ErrorState, Skeleton } from '@/components/student/ui/States';
import {
  getValoracion, guardarBorrador, completarValoracion, consentirSalud,
} from '@/lib/student/valoracion';
import {
  VALORACION_VACIA, OBJETIVOS, EXPERIENCIAS, NIVELES, ESTADOS_CUERPO, ZONAS, FRECUENCIAS,
  pasosVisibles, loQueFalta, normalizar, pasoInicial, difiereDe,
  type Valoracion, type IdPaso, type Objetivo, type Zona,
} from '@/lib/valoracion-inicial';
import {
  TITULO, PASO_COPY, BLOQUE_TITULO, OBJETIVO_TEXTO, OBJETIVO_CHIP, EXPERIENCIA_TEXTO,
  NIVEL_TEXTO, CUERPO_TEXTO, ZONA_TEXTO, FRECUENCIA_TEXTO,
  CONSENTIMIENTO_SALUD_TITULO, textoConsentimientoSalud,
} from '@/lib/student/valoracion-copy';

/**
 * VALORACIÓN INICIAL — una pregunta por pantalla.
 *
 * Lo que NO es: un formulario. El encargo lo dice y la diferencia es real —
 * veinte campos en una pantalla se leen como un trámite, y lo que se busca aquí
 * es que se lea como «el estudio quiere conocerte». De ahí que cada paso tenga
 * una decisión, mucho aire, y que se pueda salir sin perder nada.
 *
 * ⚠️ Se guarda el borrador EN EL SERVIDOR, no en `localStorage`. «Salir y
 * seguir luego» tiene que funcionar entre el móvil del estudio y el de casa, y
 * un borrador que solo vive en el navegador donde empezó no es retomar: es
 * volver a empezar en cuanto cambias de aparato. (`borrador-wizard.ts`, del
 * alta del estudio, sí usa localStorage — pero allí todavía no hay identidad
 * contra la que escribir; aquí la hay desde el primer paso.)
 *
 * ⚠️ Sin barra inferior (`sinNav`): mientras contesta, la app tiene una sola
 * salida y es hacia delante o hacia atrás. Dejar las cinco pestañas debajo
 * invita a irse a mitad de una pregunta y convierte el progreso en decorado.
 */
export default function ValoracionPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const { online } = useOnline();
  const { toast } = useToast();

  const cargar = useCallback(() => getValoracion(estudio.id), [estudio.id]);
  const { data, estado, reintentar } = useAsync(cargar, (d) => !d);

  const [v, setV] = useState<Valoracion>(VALORACION_VACIA);
  const [conSalud, setConSalud] = useState(false);
  const [i, setI] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [hidratadoDe, setHidratadoDe] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  // ⚠️ Editar un bloque desde el resumen y quedarse dentro del cuestionario es
  // el mismo problema en pequeño: cambias el nivel y te toca recorrer las seis
  // pantallas siguientes para volver a guardar. Con esto, «Editar» va y vuelve.
  const [volviendoAlResumen, setVolviendoAlResumen] = useState(false);

  // Se rellena con lo que ya había —el borrador si lo hay, y si no la última
  // completada, porque «actualizar mi valoración» parte de lo que dijo, no de
  // una pantalla en blanco. Durante el render y no en un efecto: es el patrón
  // de estado derivado que este repo ya usa en `perfil/datos`, y el efecto
  // equivalente lo rechaza el lint por provocar un render en cascada.
  const clave = data ? `${data.historial?.borrador?.id ?? data.historial?.actual?.id ?? 'nueva'}:${data.conSalud}` : null;
  if (data && clave && clave !== hidratadoDe) {
    setHidratadoDe(clave);
    setConSalud(data.conSalud);
    const previa = data.historial?.borrador ?? data.historial?.actual;
    if (previa) setV(previa.valoracion);
    // ⚠️ Y se entra por donde toca, que es la mitad que faltaba. Rellenar las
    // respuestas no basta: abriendo siempre en la pregunta 1, quien ya la había
    // terminado tenía que pulsar «Continuar» diez veces —con todo ya marcado—
    // para volver a llegar al botón de guardar. Se veía, con razón, como tener
    // que repetirlo todo.
    if (data.historial) {
      const destino = pasoInicial(data.historial, previa?.valoracion ?? VALORACION_VACIA, data.conSalud);
      const lista = pasosVisibles(previa?.valoracion ?? VALORACION_VACIA, data.conSalud);
      const idx = lista.findIndex((p) => p.id === destino);
      if (idx > 0) setI(idx);
    }
  }

  const pasos = pasosVisibles(v, conSalud);
  // Ir y volver puede dejar el índice fuera de rango: contestar «no tengo
  // molestias» estando en el paso de zonas quita dos pasos de debajo de los
  // pies. Se acota en vez de dejar `pasos[i]` en `undefined`.
  const indice = Math.min(i, pasos.length - 1);
  const paso = pasos[indice];
  const copy = paso ? PASO_COPY[paso.id] : null;

  // Un aviso antes de cerrar la pestaña con cosas sin guardar. Solo si de
  // verdad hay algo que perder.
  const hayCambios = JSON.stringify(normalizar(v)) !== JSON.stringify(VALORACION_VACIA);
  useEffect(() => {
    if (!hayCambios || listo) return;
    const antes = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', antes);
    return () => window.removeEventListener('beforeunload', antes);
  }, [hayCambios, listo]);

  const set = (parcial: Partial<Valoracion>) => { setError(''); setV((x) => normalizar({ ...x, ...parcial })); };

  const alternar = <T,>(lista: T[], valor: T): T[] =>
    lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor];

  /** Guarda por detrás al avanzar. Si falla, se dice — no se avanza en falso. */
  const irAlResumen = () => {
    const idx = pasos.findIndex((p) => p.id === 'resumen');
    if (idx >= 0) setI(idx);
    setVolviendoAlResumen(false);
  };

  const avanzar = async () => {
    if (indice >= pasos.length - 1) return;
    // Si vino a cambiar UNA cosa desde el resumen, vuelve al resumen — no la
    // arrastramos por el resto del cuestionario que ya tenía contestado.
    if (volviendoAlResumen) irAlResumen();
    else setI(indice + 1);
    // El guardado va en segundo plano: bloquear el paso siguiente por una
    // petición de red convertiría nueve pasos en nueve esperas.
    const r = await guardarBorrador(estudio.id, v);
    if ('error' in r) toast('No hemos podido guardar este paso. Lo reintentaremos al continuar.');
  };

  const retroceder = () => {
    if (volviendoAlResumen) { irAlResumen(); return; }
    if (indice === 0) { router.push(href()); return; }
    setI(indice - 1);
  };

  const terminar = async () => {
    // ⚠️ Sin cambios NO se escribe nada. Es append-only: guardar sin haber
    // tocado nada crearía una COMPLETADA idéntica a la anterior, y el
    // historial —que existe para que la instructora vea qué cambió— se
    // llenaría de versiones que no dicen nada. Salir sin escribir no es un
    // fallo: es que no había nada que contar.
    if (!difiereDe(v, data?.historial?.actual?.valoracion)) {
      setListo(true);
      setTimeout(() => router.replace(href()), 900);
      return;
    }
    setError(''); setGuardando(true);
    const r = await completarValoracion(estudio.id, v);
    setGuardando(false);
    if ('error' in r) {
      setError(r.error);
      // Llevarla AL paso que le falta, no dejarla mirando un botón apagado.
      const primerHueco = r.falta?.[0] ?? loQueFalta(v, conSalud)[0];
      if (primerHueco) {
        const idx = pasos.findIndex((p) => p.id === primerHueco);
        if (idx >= 0) setI(idx);
      }
      return;
    }
    setListo(true);
    setTimeout(() => router.replace(href()), 1400);
  };

  const aceptarSalud = async () => {
    setGuardando(true);
    const r = await consentirSalud(estudio.id);
    setGuardando(false);
    if ('error' in r) { setError(r.error); return; }
    // ⚠️ Al aceptar, la puerta SALE de la lista y todo lo que venía detrás se
    // corre un sitio. Quedarse en el índice de antes la mandaría a la pantalla
    // equivocada, así que se salta a la primera pregunta que acaba de
    // desbloquear, por NOMBRE y no por número.
    setConSalud(true);
    setI(pasosVisibles({ ...v }, true).findIndex((p) => p.id === 'molestias'));
  };

  // ── Estados de pantalla ──────────────────────────────────────────────────

  if (estado === 'loading') {
    return (
      <StudentShell sinNav>
        <div className="px stack" style={{ marginTop: 20 }}>
          <Skeleton h={16} r={8} />
          <Skeleton h={60} r={12} />
          <Skeleton h={64} r={16} />
          <Skeleton h={64} r={16} />
          <Skeleton h={64} r={16} />
        </div>
      </StudentShell>
    );
  }

  if (estado === 'error' || !data) {
    return (
      <StudentShell sinNav>
        <PageHeader titulo={TITULO} back />
        <div className="px" style={{ marginTop: 20 }}><ErrorState onRetry={reintentar} /></div>
      </StudentShell>
    );
  }

  // El estudio no la tiene activada. Se dice en vez de enseñar un wizard vacío.
  if (!data.activa) {
    return (
      <StudentShell sinNav>
        <PageHeader titulo={TITULO} back />
        <div className="px stack" style={{ marginTop: 24, textAlign: 'center' }}>
          <p className="t-title">Todavía no está disponible</p>
          <p className="t-body t-dim">{estudio.nombre} aún no ha activado la valoración inicial.</p>
          <Button variant="secondary" full onClick={() => router.push(href())}>Volver a inicio</Button>
        </div>
      </StudentShell>
    );
  }

  if (listo) {
    return (
      <StudentShell sinNav>
        <div className="px a-pop" style={{ marginTop: '22vh', textAlign: 'center' }}>
          <Sello />
          <h2 className="t-h1" style={{ marginTop: 18 }}>Gracias</h2>
          <p className="t-body t-dim" style={{ marginTop: 8 }}>
            {estudio.nombre} ya sabe por dónde empezar contigo.
          </p>
        </div>
      </StudentShell>
    );
  }

  // ── El paso de consentimiento, antes de la parte de salud ────────────────
  // No es un paso más del wizard: es una puerta, y tiene que verse como tal.
  if (paso?.id === 'consentimiento') {
    return (
      <StudentShell sinNav>
        <PageHeader titulo={TITULO} back />
        <div className="px stack" style={{ ['--gap' as string]: 'var(--s-4)', marginTop: 18, maxWidth: 520 }}>
          <h1 className="t-h1">{CONSENTIMIENTO_SALUD_TITULO}</h1>
          {textoConsentimientoSalud(estudio.nombre).split('\n\n').map((p, n) => (
            <p key={n} className="t-body t-dim">{p}</p>
          ))}
          {error && <p role="alert" className="note note--danger">{error}</p>}
          <Button full loading={guardando} disabled={!online} onClick={() => void aceptarSalud()}>
            Sí, podéis guardarlo
          </Button>
          {/* Saltar NO es una salida de emergencia: es una opción legítima con
              el mismo peso visual que un secundario cualquiera. Presentarla
              como un enlace pequeño y gris sería empujar hacia el sí. */}
          <Button
            variant="secondary" full
            onClick={() => { setV((x) => normalizar({ ...x, tieneMolestias: null, zonas: [], detalle: '', estadoCuerpo: null })); setI(indice + 1); }}
          >
            Prefiero no contarlo
          </Button>
        </div>
      </StudentShell>
    );
  }

  // ── El paso actual ───────────────────────────────────────────────────────

  const faltan = loQueFalta(v, conSalud);
  const enResumen = paso?.id === 'resumen';

  return (
    <StudentShell sinNav>
      <PageHeader titulo={TITULO} back />
      <div className="px stack" style={{ ['--gap' as string]: 'var(--s-5)', marginTop: 14, maxWidth: 560 }}>
        <Progreso indice={indice} total={pasos.length} />

        <div key={paso?.id} className="stack a-up" style={{ ['--gap' as string]: 'var(--s-4)' }}>
          <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
            <h1 className="t-h1">{copy?.titulo}</h1>
            {copy?.ayuda && <p className="t-body t-dim">{copy.ayuda}</p>}
          </div>

          {paso?.id === 'objetivos' && (
            <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
              {OBJETIVOS.map((o) => (
                <Opcion key={o} seleccionada={v.objetivos.includes(o)} onClick={() => set({ objetivos: alternar<Objetivo>(v.objetivos, o) })}>
                  {OBJETIVO_TEXTO[o]}
                </Opcion>
              ))}
            </div>
          )}

          {paso?.id === 'principal' && (
            <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
              {v.objetivos.map((o) => (
                <Opcion key={o} seleccionada={v.objetivoPrincipal === o} onClick={() => set({ objetivoPrincipal: o })}>
                  {OBJETIVO_TEXTO[o]}
                </Opcion>
              ))}
            </div>
          )}

          {paso?.id === 'experiencia' && (
            <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
              {EXPERIENCIAS.map((e) => (
                <Opcion key={e} seleccionada={v.experiencia === e} onClick={() => set({ experiencia: e })}>
                  {EXPERIENCIA_TEXTO[e]}
                </Opcion>
              ))}
            </div>
          )}

          {paso?.id === 'nivel' && (
            <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
              {NIVELES.map((n) => (
                <Opcion key={n} seleccionada={v.nivel === n} onClick={() => set({ nivel: n })}>
                  {NIVEL_TEXTO[n]}
                </Opcion>
              ))}
            </div>
          )}

          {paso?.id === 'cuerpo' && (
            <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
              {ESTADOS_CUERPO.map((c) => (
                <Opcion key={c} seleccionada={v.estadoCuerpo === c} onClick={() => set({ estadoCuerpo: c })}>
                  {CUERPO_TEXTO[c]}
                </Opcion>
              ))}
            </div>
          )}

          {paso?.id === 'molestias' && (
            <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
              <Opcion seleccionada={v.tieneMolestias === false} onClick={() => set({ tieneMolestias: false })}>
                No, nada que destacar
              </Opcion>
              <Opcion seleccionada={v.tieneMolestias === true} onClick={() => set({ tieneMolestias: true })}>
                Sí, hay algo
              </Opcion>
              {/* Lo que se hace con esto, dicho donde se pregunta. Sin esta
                  línea, contar una lesión aquí se parece demasiado a rellenar
                  un parte médico. */}
              <p className="note note--info" style={{ marginTop: 'var(--s-2)' }}>
                Esto no es un historial médico ni un diagnóstico: es para que quien te dé
                la clase sepa qué evitar contigo.
              </p>
            </div>
          )}

          {paso?.id === 'zonas' && (
            <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
              {ZONAS.map((z) => (
                <Opcion key={z} seleccionada={v.zonas.includes(z)} onClick={() => set({ zonas: alternar<Zona>(v.zonas, z) })}>
                  {ZONA_TEXTO[z]}
                </Opcion>
              ))}
            </div>
          )}

          {paso?.id === 'detalle' && (
            <textarea
              className="input"
              value={v.detalle}
              onChange={(e) => set({ detalle: e.target.value })}
              placeholder="Por ejemplo: me molesta la lumbar al girar, sobre todo por la mañana."
              rows={4}
              style={{ height: 'auto', padding: 'var(--s-3) var(--s-4)', lineHeight: 1.55, resize: 'none' }}
            />
          )}

          {paso?.id === 'habitos' && (
            <div className="stack" style={{ ['--gap' as string]: 'var(--s-4)' }}>
              <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
                <p className="t-label">¿Con qué frecuencia?</p>
                {FRECUENCIAS.map((f) => (
                  <Opcion key={f} seleccionada={v.frecuencia === f} onClick={() => set({ frecuencia: f })}>
                    {FRECUENCIA_TEXTO[f]}
                  </Opcion>
                ))}
              </div>
              <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
                <p className="t-label">¿Qué haces?</p>
                <input
                  className="input"
                  value={v.actividadHabitual}
                  onChange={(e) => set({ actividadHabitual: e.target.value })}
                  placeholder="Correr, natación, caminar…"
                />
              </div>
            </div>
          )}

          {paso?.id === 'expectativas' && (
            <textarea
              className="input"
              value={v.expectativas}
              onChange={(e) => set({ expectativas: e.target.value })}
              placeholder="Cuéntanos qué te gustaría mejorar o cómo te gustaría sentirte dentro de unas semanas."
              rows={4}
              style={{ height: 'auto', padding: 'var(--s-3) var(--s-4)', lineHeight: 1.55, resize: 'none' }}
            />
          )}

          {enResumen && (
            <Resumen
              v={v}
              conSalud={conSalud}
              yaCompletada={Boolean(data?.historial?.actual)}
              fechaPrevia={data?.historial?.actual?.creadoEn}
              irA={(id) => {
                const idx = pasos.findIndex((p) => p.id === id);
                if (idx >= 0) { setVolviendoAlResumen(true); setI(idx); }
              }}
            />
          )}
        </div>

        {error && <p role="alert" className="note note--danger" data-testid="valoracion-error">{error}</p>}

        {/* Acciones. `flex-direction: column-reverse` para que la principal
            quede ABAJO —al alcance del pulgar— y aun así sea la primera en
            orden de tabulación. */}
        <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 'var(--s-2)', paddingBottom: 'var(--s-6)' }}>
          {enResumen ? (
            <Button full loading={guardando} disabled={!online || faltan.length > 0} onClick={() => void terminar()} data-testid="guardar-valoracion">
              {!online
                ? 'Sin conexión'
                : !data?.historial?.actual
                  ? 'Guardar mi valoración'
                  : difiereDe(v, data.historial.actual.valoracion)
                    ? 'Guardar los cambios'
                    : 'Todo correcto'}
            </Button>
          ) : (
            <Button full onClick={() => void avanzar()} disabled={!paso?.opcional && faltaEsteePaso(paso?.id, v)} data-testid="continuar">
              {volviendoAlResumen ? 'Listo' : 'Continuar'}
            </Button>
          )}
          <Button variant="ghost" full onClick={retroceder}>
            {volviendoAlResumen ? 'Cancelar' : indice === 0 ? 'Salir' : 'Atrás'}
          </Button>
        </div>

        {/* La promesa de que salir no cuesta nada. Es lo que hace que no se
            abandone: quien cree que va a perderlo todo, no empieza. */}
        <p className="t-meta" style={{ textAlign: 'center', marginTop: -8, paddingBottom: 'var(--s-6)' }}>
          Se guarda solo. Puedes salir y seguir cuando quieras.
        </p>
      </div>
    </StudentShell>
  );
}

/** ¿Le falta a ESTE paso su respuesta? Decide si «Continuar» está disponible. */
function faltaEsteePaso(id: IdPaso | undefined, v: Valoracion): boolean {
  switch (id) {
    case 'objetivos': return v.objetivos.length === 0;
    case 'principal': return !v.objetivoPrincipal;
    case 'experiencia': return !v.experiencia;
    case 'nivel': return !v.nivel;
    case 'molestias': return v.tieneMolestias === null;
    case 'zonas': return v.zonas.length === 0;
    default: return false;
  }
}

/**
 * El repaso antes de guardar. Cada bloque se puede editar sin perder el sitio:
 * lleva a su paso y se vuelve aquí.
 */
function Resumen({ v, conSalud, irA, yaCompletada, fechaPrevia }: {
  v: Valoracion; conSalud: boolean; irA: (id: IdPaso) => void;
  /** ¿Vuelve a mirar una valoración que ya entregó? Cambia lo que significa esta pantalla. */
  yaCompletada?: boolean;
  fechaPrevia?: string;
}) {
  const filas: { id: IdPaso; titulo: string; valor: string }[] = [
    { id: 'objetivos', titulo: BLOQUE_TITULO.objetivos!, valor: v.objetivos.map((o) => OBJETIVO_CHIP[o]).join(' · ') || '—' },
    { id: 'experiencia', titulo: BLOQUE_TITULO.experiencia!, valor: v.experiencia ? EXPERIENCIA_TEXTO[v.experiencia] : '—' },
    { id: 'nivel', titulo: BLOQUE_TITULO.nivel!, valor: v.nivel ? NIVEL_TEXTO[v.nivel] : '—' },
  ];
  if (conSalud) {
    if (v.estadoCuerpo) filas.push({ id: 'cuerpo', titulo: BLOQUE_TITULO.cuerpo!, valor: CUERPO_TEXTO[v.estadoCuerpo] });
    filas.push({
      id: 'molestias',
      titulo: BLOQUE_TITULO.molestias!,
      valor: v.tieneMolestias
        ? [v.zonas.map((z) => ZONA_TEXTO[z]).join(' · '), v.detalle].filter(Boolean).join(' — ')
        : 'Nada que destacar',
    });
  }
  if (v.frecuencia || v.actividadHabitual) {
    filas.push({
      id: 'habitos', titulo: BLOQUE_TITULO.habitos!,
      valor: [v.actividadHabitual, v.frecuencia ? FRECUENCIA_TEXTO[v.frecuencia] : ''].filter(Boolean).join(' · '),
    });
  }
  if (v.expectativas) filas.push({ id: 'expectativas', titulo: BLOQUE_TITULO.expectativas!, valor: v.expectativas });

  return (
    <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
      {/* Quien vuelve no está «repasando antes de guardar»: está mirando lo que
          ya entregó. Decirlo cambia lo que la pantalla le pide — nada, salvo
          que quiera cambiar algo. */}
      {yaCompletada && (
        <p className="note note--ok" style={{ marginBottom: 'var(--s-2)' }}>
          Esto es lo que nos contaste
          {fechaPrevia ? ` el ${new Date(fechaPrevia).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}` : ''}.
          Cambia lo que quieras; si está todo bien, no tienes que hacer nada.
        </p>
      )}
      {filas.map((f) => (
        <div key={f.id} className="card card--pad-lg row row--top" style={{ gap: 'var(--s-3)' }}>
          <div className="stack trunc" style={{ ['--gap' as string]: '3px', flex: 1 }}>
            <p className="t-label">{f.titulo}</p>
            <p className="t-body" style={{ whiteSpace: 'pre-wrap' }}>{f.valor}</p>
          </div>
          <button
            type="button"
            onClick={() => irA(f.id)}
            className="btn btn--sm btn--ghost no-shrink"
            aria-label={`Editar ${f.titulo.toLowerCase()}`}
          >
            Editar
          </button>
        </div>
      ))}
    </div>
  );
}
