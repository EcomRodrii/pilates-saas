'use client';

import Link from 'next/link';
import { useCallback, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { getBonos, getClasesFijas } from '@/lib/student/datos';
import { autoReservableDe, trasAnularla, trasDejarla, trasPedirla, type EstadoAutoReservable } from '@/lib/student/auto-reservable';
import { diasDeLaOferta } from '@/lib/student/clases-fijas';
import { bonoParaClase } from '@/lib/student/bono-cubre';
import { anularPeticionPlazaFija, pedirPlazaFija } from '@/lib/student/plaza-fija-peticion';
import { pedirClaseFija } from '@/lib/student/clases-fijas-datos';
import { TEXTOS_PLAZA_FIJA as T } from '@/lib/student/plaza-fija-textos';
import { TEXTOS_CLASES_FIJAS as TCF } from '@/lib/student/clases-fijas-textos';
import { DURACIONES_POR_DEFECTO } from '@/lib/clases-fijas-reglas';
import { hoyEnEstudio } from '@/lib/utils';
import { Button } from '@/components/student/ui/Button';
import { ConfirmationDialog } from '@/components/student/ui/ConfirmationDialog';
import { InterruptorAuto } from '@/components/student/ui/InterruptorAuto';
import { Sheet } from '@/components/student/ui/Sheet';
import { useToast } from '@/components/student/ui/Toast';
import { SelectorDuracion } from '@/components/student/domain/SelectorDuracion';
import { DialogoDejarClaseFija, type PlazaADejar } from '@/components/student/domain/DialogoDejarClaseFija';
import { ReservarProximas } from '@/components/student/domain/ReservarProximas';

// «Auto reservable», en la ficha de una clase normal: el interruptor que reserva esta clase cada semana sin volver a hacerlo.
// Es una clase fija —suelta, o la clase fija con nombre en la que va esta clase— o, con bono, las próximas N clases: no hay nada
// nuevo detrás, solo otra manera de llegar. Qué enseña y qué abre lo decide `autoReservableDe` (puro, con sus tests).
//
// ⚠️ El interruptor NO se mueve al tocarlo: un toque abre lo que toque (elegir cuánto tiempo, confirmar que la dejas, anular la
// petición) y solo se mueve con lo que CONTESTA el servidor. Reserva cada semana y puede cancelar clases: nada optimista.
// Solo aparece si la clase se repite y el estudio la ofrece como clase fija; sin eso, o si no se ha podido saber, no pinta nada
// —nunca un aviso de error por algo que no ha pedido— y no frena la reserva: el catálogo se pide aparte.
export function AutoReservable({ claseId, fecha, hora, salaId, tipoClaseId, ventanaCancelacionHoras, onCambio }: {
  claseId: string; fecha: string; hora: string; salaId: string; tipoClaseId: string; ventanaCancelacionHoras: number;
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
  const [hoja, setHoja] = useState<'pedir' | 'bono' | null>(null);
  const [meses, setMeses] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [anulando, setAnulando] = useState(false);
  const [dejando, setDejando] = useState<PlazaADejar | null>(null);
  const [buscando, setBuscando] = useState(false);
  const idCuerpo = useId();
  const e = local ?? data;
  if (!e) return null;

  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  const oferta = e.oferta;
  const accion = e.accion;
  const cuerpo = e.visual === 'encendido' ? (oferta ? T.autoTieneOferta(oferta.nombre) : T.autoTiene)
    : e.visual === 'pendiente' ? T.autoPedida
    : accion?.tipo === 'PEDIR_OFERTA' && oferta ? T.autoPuedeOferta(oferta.nombre)
    : accion?.tipo === 'SOLO_BONO' ? T.autoSoloConCuota
    : accion?.tipo === 'NO_DISPONIBLE' ? (accion.motivo === 'COMPLETA' && oferta ? T.autoCompleta(oferta.nombre) : T.autoSinClases)
    : T.autoPuede(dia, hora);

  function cambio(siguiente: EstadoAutoReservable) {
    setLocal(siguiente);
    onCambio?.();
  }

  async function activar() {
    if (enviando || !e || !accion) return;
    setEnviando(true);
    setError('');
    const r = accion.tipo === 'PEDIR_OFERTA'
      ? await pedirClaseFija(estudio.slug, estudio.id, accion.ofertaId, meses ?? 0)
      : await pedirPlazaFija(estudio.slug, estudio.id, e.sesionId, meses);
    setEnviando(false);
    if (!r.ok) {
      if (r.sesionCaducada) { router.push(href('/acceso/login')); return; }
      setError(r.error);
      return;
    }
    setHoja(null);
    // Aprobación automática: el servidor ya la ha dado (`resuelta`) y lo que se dice es SU texto. Una petición con id que no viene
    // `resuelta` sigue pendiente, aunque el estudio sea automático (algo no pasó sus reglas).
    const siguiente = trasPedirla(e, { solicitudId: r.solicitudId, resuelta: r.resuelta === true });
    toast(siguiente.visual === 'encendido' ? (r.mensaje || T.dada) : (oferta ? TCF.enviada : T.pedida));
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
    toast(oferta ? TCF.anulada : 'Petición anulada');
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
    if (accion?.tipo === 'SOLO_BONO') { setHoja('bono'); return; }
    if (accion?.tipo === 'PEDIR_SUELTA' || accion?.tipo === 'PEDIR_OFERTA') {
      // Por defecto, la segunda duración (3 meses en una suelta; en una oferta, la segunda que ofrece o la única).
      setMeses(accion.tipo === 'PEDIR_OFERTA'
        ? (oferta?.duraciones[1] ?? oferta?.duraciones[0])?.meses ?? null
        : DURACIONES_POR_DEFECTO[1] ?? null);
      setHoja('pedir');
    }
  }

  const pidiendoOferta = accion?.tipo === 'PEDIR_OFERTA' && !!oferta;

  return (
    <>
      <label data-testid="auto-reservable" className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: accion?.tipo === 'NO_DISPONIBLE' ? 'default' : 'pointer' }}>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 800, fontSize: 'var(--t-body)' }}>{T.autoTitulo}</span>
          <span id={idCuerpo} className="t-meta" style={{ display: 'block', marginTop: 1 }}>{cuerpo}</span>
        </span>
        <InterruptorAuto
          testId="auto-reservable-interruptor" estado={e.visual} label={T.autoTitulo} describedBy={idCuerpo}
          disabled={!online || accion?.tipo === 'NO_DISPONIBLE'} cargando={buscando} onClick={alTocar}
        />
      </label>

      {/* Activarlo: cuánto tiempo, y qué pasa después. Hasta que el servidor contesta, el interruptor sigue apagado. */}
      <Sheet open={hoja === 'pedir'} onClose={() => { if (!enviando) setHoja(null); }} label={T.autoTitulo}>
        <div data-testid="auto-reservable-hoja" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h3 className="t-h2" style={{ textAlign: 'center', margin: 0 }}>{T.autoTitulo}</h3>
          <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700, textAlign: 'center' }}>
            {pidiendoOferta && oferta ? T.autoOfertaIntro(oferta.nombre, diasDeLaOferta(oferta.franjas)) : T.ofrecer(dia, hora)}
          </p>
          {pidiendoOferta && oferta
            ? <SelectorDuracion meses={meses} onChange={setMeses} opciones={oferta.duraciones} />
            : <SelectorDuracion meses={meses} onChange={setMeses} />}
          <p style={{ margin: 0, fontSize: 'var(--t-small)', color: 'var(--muted-foreground)' }}>
            {pidiendoOferta ? TCF.comoFunciona : estudio.plazaFijaAutomatica ? T.quePasaAutomatica : T.quePasa}
          </p>
          {error && <p role="alert" style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--danger, #b00020)', textAlign: 'center' }}>{error}</p>}
          <Button
            full loading={enviando} disabled={!online || (pidiendoOferta && meses === null)} onClick={() => void activar()}
            style={{ height: 50, fontSize: 'var(--t-body)' }}
          >
            {T.autoActivar}
          </Button>
        </div>
      </Sheet>

      {/* Solo con bono: no hay clase fija, pero sí reservar las próximas semanas de una vez. */}
      <Sheet open={hoja === 'bono'} onClose={() => setHoja(null)} label={T.autoTitulo}>
        {hoja === 'bono' && (
          <ContenidoBono claseId={claseId} tipoClaseId={tipoClaseId} ventanaCancelacionHoras={ventanaCancelacionHoras} onReservadas={onCambio} />
        )}
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

function ContenidoBono({ claseId, tipoClaseId, ventanaCancelacionHoras, onReservadas }: {
  claseId: string; tipoClaseId: string; ventanaCancelacionHoras: number; onReservadas?: () => void;
}) {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const cargar = useCallback(() => getBonos(estudio.slug), [estudio.slug]);
  const { data } = useAsync(cargar, () => false);
  // El bono que de VERDAD cubre esta clase (la misma regla que el servidor), si le quedan al menos dos sesiones.
  const bono = data ? bonoParaClase(data, tipoClaseId) : null;
  const saldo = bono ? bono.creditosTotales - bono.creditosUsados : 0;
  const conBono = !!bono && saldo >= 2;
  return (
    <div data-testid="auto-reservable-bono" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 className="t-h2" style={{ textAlign: 'center', margin: 0 }}>{T.autoTitulo}</h3>
      <p data-testid="auto-reservable-bono-intro" style={{ margin: 0, textAlign: 'center', fontSize: 'var(--t-small)' }}>{conBono ? T.autoBonoIntro : T.soloConCuota}</p>
      {conBono && <ReservarProximas sesionId={claseId} saldo={saldo} ventanaCancelacionHoras={ventanaCancelacionHoras} onReservadas={onReservadas} />}
      <Link href={href('/comprar')} className="btn btn--secondary" style={{ height: 50, justifyContent: 'center' }}>Ver las cuotas</Link>
    </div>
  );
}
