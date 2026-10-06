'use client';

import { useCallback, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { getBonos, getClasesFijas } from '@/lib/student/datos';
import { autoReservableDe, trasAnularla, trasDejarla, trasPedirla, type EstadoAutoReservable } from '@/lib/student/auto-reservable';
import { bonoParaClase } from '@/lib/student/bono-cubre';
import { saldoBono } from '@/lib/student/saldo-bono';
import { anularPeticionPlazaFija, pedirPlazaFija } from '@/lib/student/plaza-fija-peticion';
import { TEXTOS_PLAZA_FIJA as T } from '@/lib/student/plaza-fija-textos';
import { hoyEnEstudio } from '@/lib/utils';
import { Button } from '@/components/student/ui/Button';
import { ConfirmationDialog } from '@/components/student/ui/ConfirmationDialog';
import { InterruptorAuto } from '@/components/student/ui/InterruptorAuto';
import { Sheet } from '@/components/student/ui/Sheet';
import { useToast } from '@/components/student/ui/Toast';
import { SelectorDuracion } from '@/components/student/domain/SelectorDuracion';
import { DialogoDejarClaseFija, type PlazaADejar } from '@/components/student/domain/DialogoDejarClaseFija';
import { ReservarProximas } from '@/components/student/domain/ReservarProximas';

// «Clase fija», en la ficha de una clase que se repite: el interruptor que la reserva cada semana sin volver a hacerlo. Es el
// ÚNICO camino de la alumna para pedirla (4-oct-2026: antes había además una página «Clases fijas», una ficha aparte y clases
// fijas con nombre, y el estudio y sus alumnas se perdían). Qué enseña y qué abre lo decide `autoReservableDe` (puro, con tests).
//
// ⚠️ El interruptor NO se mueve al tocarlo: un toque abre lo que toque (elegir cuánto tiempo, confirmar que la dejas, anular la
// petición) y solo se mueve con lo que CONTESTA el servidor. Reserva cada semana y puede cancelar clases: nada optimista.
// Solo aparece si la clase se repite y el estudio deja pedirla desde la app; sin eso, o si no se ha podido saber, no pinta nada
// —nunca un aviso de error por algo que no ha pedido— y no frena la reserva: el catálogo se pide aparte.
//
// Sin cuota no hay clase fija (sus reservas no descuentan bono: `res-pf-`). Con bono, la ficha ofrece en su lugar «Reservar
// las próximas clases», que es RESERVAR (N reservas normales) y por eso no lleva el nombre ni el interruptor de la clase fija.
export function AutoReservable({ claseId, fecha, hora, salaId, tipoClaseId, ventanaCancelacionHoras, onCambio, embebido = false }: {
  claseId: string; fecha: string; hora: string; salaId: string; tipoClaseId: string; ventanaCancelacionHoras: number;
  /** Dentro de la tarjeta del bono de la ficha: «Reservar las próximas» sin tarjeta propia. */
  embebido?: boolean;
  /** Tras cualquier cambio que confirma el servidor: la ficha vuelve a leer sus reservas (puede haber reservado o cancelado esta). */
  onCambio?: () => void;
}) {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const { online } = useOnline();
  const { toast } = useToast();
  const cargar = useCallback(
    async () => autoReservableDe(await getClasesFijas(estudio.slug), { fecha, hora, salaId }, hoyEnEstudio()),
    [estudio.slug, fecha, hora, salaId],
  );
  const { data } = useAsync(cargar, (d) => !d);
  // Lo último que contestó el servidor: el catálogo cacheado aún no lo sabe, y lo que se enseña es lo que ha pasado de verdad.
  const [local, setLocal] = useState<EstadoAutoReservable | null>(null);
  const [hoja, setHoja] = useState(false);
  // Sin fin por defecto: la clase fija dura lo que dure su cuota, como la «reserva automática» de TIMP. Quien la quiera hasta
  // una fecha, la elige.
  const [meses, setMeses] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [anulando, setAnulando] = useState(false);
  const [dejando, setDejando] = useState<PlazaADejar | null>(null);
  const [buscando, setBuscando] = useState(false);
  const idCuerpo = useId();
  const e = local ?? data;
  if (!e) return null;

  // Sin cuota: no hay clase fija. Con bono, reservar las próximas clases (otra cosa, con su propio nombre); sin bono, una frase.
  if (e.accion?.tipo === 'SOLO_CON_CUOTA') {
    return <VariasSemanas claseId={claseId} tipoClaseId={tipoClaseId} ventanaCancelacionHoras={ventanaCancelacionHoras} onReservadas={onCambio} embebido={embebido} />;
  }

  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  const cuerpo = e.visual === 'encendido' ? T.autoTiene : e.visual === 'pendiente' ? T.autoPedida : T.autoPuede(dia, hora);

  function cambio(siguiente: EstadoAutoReservable) {
    setLocal(siguiente);
    onCambio?.();
  }

  async function activar() {
    if (enviando || !e || e.accion?.tipo !== 'PEDIR') return;
    setEnviando(true);
    setError('');
    const r = await pedirPlazaFija(estudio.slug, estudio.id, e.sesionId, meses);
    setEnviando(false);
    if (!r.ok) {
      if (r.sesionCaducada) { router.push(href('/acceso/login')); return; }
      setError(r.error);
      return;
    }
    setHoja(false);
    // Aprobación automática: el servidor ya la ha dado (`resuelta`) y lo que se dice es SU texto. Una petición con id que no viene
    // `resuelta` sigue pendiente, aunque el estudio sea automático (algo no pasó sus reglas).
    const siguiente = trasPedirla(e, { solicitudId: r.solicitudId, resuelta: r.resuelta === true });
    toast(siguiente.visual === 'encendido' ? (r.mensaje || T.dada) : T.pedida);
    cambio(siguiente);
  }

  async function anular() {
    if (enviando || !e?.peticionId) return;
    setEnviando(true);
    setError('');
    const r = await anularPeticionPlazaFija(estudio.slug, estudio.id, e.peticionId);
    setEnviando(false);
    if (!r.ok) {
      if (r.sesionCaducada) { router.push(href('/acceso/login')); return; }
      setError(r.error);
      return;
    }
    setAnulando(false);
    toast('Petición anulada');
    cambio(trasAnularla(e));
  }

  // Encendido: dejarla pide su confirmación, con SU plaza. Recién dada en esta pantalla aún no está en los datos: se vuelve a
  // leer (la caché ya se invalidó al pedirla). Si aun así no aparece, a «Mis clases», donde también se deja.
  async function pedirDejar() {
    if (buscando || !e) return;
    let plaza = e.plaza;
    if (!plaza) {
      setBuscando(true);
      plaza = (await cargar().catch(() => null))?.plaza ?? null;
      setBuscando(false);
    }
    if (!plaza) { router.push(href('/mis-reservas?tab=fijas')); return; }
    setDejando({
      id: plaza.id, diaSemana: dia, hora: hora.slice(0, 5), deClaseFija: plaza.deClaseFija,
      tipo: e.tipo, sala: e.sala,
    });
  }

  function alTocar() {
    if (!e) return;
    setError('');
    if (e.visual === 'encendido') { void pedirDejar(); return; }
    if (e.visual === 'pendiente') { setAnulando(true); return; }
    if (e.accion?.tipo === 'PEDIR') { setMeses(null); setHoja(true); }
  }

  return (
    <>
      <label
        data-testid="auto-reservable" className={embebido ? undefined : 'card'}
        style={embebido
          ? { display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', cursor: 'pointer' }
          : { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: 'pointer' }}
      >
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 800, fontSize: 'var(--t-body)' }}>{T.autoTitulo}</span>
          <span id={idCuerpo} className="t-meta" style={{ display: 'block', marginTop: 1 }}>{cuerpo}</span>
        </span>
        <InterruptorAuto
          testId="auto-reservable-interruptor" estado={e.visual} label={T.autoTitulo} describedBy={idCuerpo}
          disabled={!online} cargando={buscando} onClick={alTocar}
        />
      </label>

      {/* Activarla: cuánto tiempo, y qué pasa después. Hasta que el servidor contesta, el interruptor sigue apagado. */}
      <Sheet open={hoja} onClose={() => { if (!enviando) setHoja(false); }} label={T.autoTitulo}>
        <div data-testid="auto-reservable-hoja" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 className="t-h2" style={{ textAlign: 'center', margin: 0 }}>{T.autoTitulo}</h3>
          <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700, textAlign: 'center' }}>{T.ofrecer(dia, hora)}</p>
          <SelectorDuracion meses={meses} onChange={setMeses} />
          <p style={{ margin: 0, fontSize: 'var(--t-small)', color: 'var(--muted-foreground)' }}>
            {estudio.plazaFijaAutomatica ? T.quePasaAutomatica : T.quePasa}
          </p>
          {error && <p role="alert" style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--danger, #b00020)', textAlign: 'center' }}>{error}</p>}
          <Button full loading={enviando} disabled={!online} onClick={() => void activar()} style={{ height: 50, fontSize: 'var(--t-body)' }}>
            {T.autoActivar}
          </Button>
        </div>
      </Sheet>

      {/* Pendiente: anularla. */}
      <ConfirmationDialog
        open={anulando} onClose={() => { if (!enviando) { setAnulando(false); setError(''); } }}
        titulo="¿Anular la petición?" cuerpo={T.autoPedida}
        confirmar={T.botonAnular} cancelar="Mantenerla" loading={enviando}
        onConfirm={() => void anular()}
      >
        {error && <p role="alert" style={{ margin: '10px 0 0', fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--danger, #b00020)', textAlign: 'center' }}>{error}</p>}
      </ConfirmationDialog>

      {/* Encendido: dejarla. Solo se apaga cuando el servidor dice que la ha dejado. */}
      <DialogoDejarClaseFija
        plaza={dejando} onClose={() => setDejando(null)}
        onDejada={() => { if (e) cambio(trasDejarla(e)); }}
      />
    </>
  );
}

/**
 * Sin cuota que cubra la clase. Con un bono que la cubra y al menos dos sesiones: reservar varias semanas de una vez (N reservas
 * normales, cada una descontando su sesión). Sin eso, solo una frase: qué haría falta para tenerla fija.
 */
function VariasSemanas({ claseId, tipoClaseId, ventanaCancelacionHoras, onReservadas, embebido }: {
  claseId: string; tipoClaseId: string; ventanaCancelacionHoras: number; onReservadas?: () => void; embebido: boolean;
}) {
  const { estudio } = useEstudio();
  const cargar = useCallback(() => getBonos(estudio.slug), [estudio.slug]);
  const { data } = useAsync(cargar, () => false);
  // El bono que de VERDAD cubre esta clase (la misma regla que el servidor), si le quedan al menos dos sesiones.
  const bono = data ? bonoParaClase(data, tipoClaseId) : null;
  // El saldo de `saldoBono` (el mismo de Mi plan), no una resta suelta.
  const saldo = bono ? saldoBono(bono).quedan : 0;
  if (!data) return null;
  if (!bono || saldo < 2) {
    return <p data-testid="clase-fija-solo-cuota" className="t-meta" style={{ margin: embebido ? '10px 0 0' : 0 }}>{T.autoSoloConCuota}</p>;
  }
  return <ReservarProximas sesionId={claseId} saldo={saldo} ventanaCancelacionHoras={ventanaCancelacionHoras} onReservadas={onReservadas} embebido={embebido} />;
}
