'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStudio } from '@/lib/studio-context';
import type { Studio } from '@/lib/types';
import { Toggle, inputCls, labelCls } from '@/components/configuracion/estilos';
import { TarjetaAjuste } from '@/components/configuracion/shell/tarjeta-ajuste';
import { obtenerConfirmacionRiesgo, actualizarConfirmacionRiesgo } from '@/lib/api-client';
import { frasesPoliticaEstudio, type AjustePolitica } from '@/lib/politica-estudio-textos';
import { InterruptorAvisarAlumnas } from '@/components/sustituciones/interruptor-avisar-alumnas';

// «Cambiar» lleva al control que decide la frase. Algunos viven en «Opciones
// avanzadas», plegado por defecto: se abre antes de ir, o el enlace no llevaría
// a ningún sitio visible.
function irAAjuste(ajuste: AjustePolitica, avanzadas: HTMLDetailsElement | null) {
  const el = document.getElementById(`ajuste-${ajuste}`);
  if (!el) return;
  if (avanzadas?.contains(el)) avanzadas.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true });
}

// P2 (auditoría "Veredicto de Marta"): los 13 campos de este formulario iban
// todos con el mismo peso visual en una sola columna — fácil confundir un
// campo con otro configurando rápido, sobre todo los de dinero. Puramente
// visual: no cambia ningún campo ni su lógica.
const grupoCls = 'text-[11px] font-bold uppercase tracking-wide text-muted-foreground pt-2 first:pt-0';

type PoliticaForm = {
  cancelacionVentanaHoras: number;
  cancelacionDevolverBonoTardia: boolean;
  cancelacionClaseDevuelveBono: boolean;
  // Migr 0086: caducidad de las recuperaciones que concede el estudio. Las
  // columnas existían desde entonces pero no había forma de tocarlas sin SQL.
  recuperacionCaducidadTipo: 'DIAS' | 'FIN_MES' | 'FIN_MES_SIGUIENTE';
  recuperacionCaducidadDias: number | null;
  reservaExigirPlan: boolean;
  reservaMaxSimultaneas: number | null;
  compraPublicaModo: 'EXIGIR_REGISTRO' | 'CREAR_FICHA';
  // Fase 1 de reglas por tipo de clase (migr 20260730152516): estos son los
  // DEFAULTS de estudio; cada tipo de clase puede sobrescribirlos.
  reservaVentanaMinimaMinutos: number;
  reservaAntelacionMaximaDias: number | null;
  permiteListaEspera: boolean;
  // Fase 2a (migr 20260730192445): mismo criterio, default de estudio.
  requiereAprobacion: boolean;
  // Fase 2b (migr 20260731130000): minutos para aceptar una plaza liberada.
  // 0 = confirmación instantánea (comportamiento clásico).
  listaEsperaPlazoAceptacionMinutos: number;
  // Fase 2c (migr 20260731140000): nº mínimo de asistentes CONFIRMADA para
  // que la clase se mantenga. 0 = sin mínimo.
  minimoAsistentesPorClase: number;
  // Fase 3 (migr 20260730225253): importe fijo en € por cancelación tardía o
  // no-show. NULL/0 = regla desactivada.
  penalizacionImporteEur: number | null;
  penalizacionAplicaCancelacionTardia: boolean;
  penalizacionAplicaNoShow: boolean;
  penalizacionCobroAutomatico: boolean;
  // Migr 20260809020328: default true = comportamiento de siempre (pase/QR
  // obligatorio). false = confía en la reserva: se marca asistida sola.
  requiereCheckinQr: boolean;
  // Migr 20260905151515: impedir reservar con un recibo FALLIDO o DEVUELTO.
  // Opt-in: encenderlo por defecto dejaría fuera a socias que hoy reservan.
  bloquearReservaImpago: boolean;
  // Migr 20260906005059: recuperaciones solas al cerrar la semana.
  recuperacionAutoSemanal: boolean;
  // Migr 20260914104856: «la instructora crea sus clases / solo se le asignan».
  // Default true = lo de siempre (#550).
  instructorasCreanClases: boolean;
};

function studioToPolitica(s: Studio | null): PoliticaForm {
  return {
    cancelacionVentanaHoras: s?.cancelacionVentanaHoras ?? 12,
    cancelacionDevolverBonoTardia: s?.cancelacionDevolverBonoTardia ?? false,
    cancelacionClaseDevuelveBono: s?.cancelacionClaseDevuelveBono ?? true,
    recuperacionCaducidadTipo: s?.recuperacionCaducidadTipo ?? 'FIN_MES_SIGUIENTE',
    recuperacionCaducidadDias: s?.recuperacionCaducidadDias ?? null,
    reservaExigirPlan: s?.reservaExigirPlan ?? true,
    reservaMaxSimultaneas: s?.reservaMaxSimultaneas ?? null,
    compraPublicaModo: s?.compraPublicaModo ?? 'EXIGIR_REGISTRO',
    reservaVentanaMinimaMinutos: s?.reservaVentanaMinimaMinutos ?? 0,
    reservaAntelacionMaximaDias: s?.reservaAntelacionMaximaDias ?? null,
    permiteListaEspera: s?.permiteListaEspera ?? true,
    requiereAprobacion: s?.requiereAprobacion ?? false,
    listaEsperaPlazoAceptacionMinutos: s?.listaEsperaPlazoAceptacionMinutos ?? 0,
    minimoAsistentesPorClase: s?.minimoAsistentesPorClase ?? 0,
    penalizacionImporteEur: s?.penalizacionImporteEur ?? null,
    penalizacionAplicaCancelacionTardia: s?.penalizacionAplicaCancelacionTardia ?? true,
    penalizacionAplicaNoShow: s?.penalizacionAplicaNoShow ?? true,
    penalizacionCobroAutomatico: s?.penalizacionCobroAutomatico ?? false,
    requiereCheckinQr: s?.requiereCheckinQr ?? true,
    bloquearReservaImpago: s?.bloquearReservaImpago ?? false,
    recuperacionAutoSemanal: s?.recuperacionAutoSemanal ?? false,
    instructorasCreanClases: s?.instructorasCreanClases ?? true,
  };
}

export function TabEstudioReservas({ showToast }: { showToast: (m: string) => void }) {
  const { studio, updateStudio, reflejarStudioGuardado } = useStudio();
  const [pol, setPol] = useState(() => studioToPolitica(studio));
  const idCampo = useId();

  const [studioAnterior, setStudioAnterior] = useState(studio);
  if (studio !== studioAnterior) {
    setStudioAnterior(studio);
    // Solo si cambió lo que ESTE formulario edita. Guardar el aviso a las alumnas
    // (que va por su endpoint y se refleja en `studio`) no puede tirar cambios de
    // la política que estén a medio escribir.
    if (JSON.stringify(studioToPolitica(studio)) !== JSON.stringify(studioToPolitica(studioAnterior))) {
      setPol(studioToPolitica(studio));
    }
  }
  const avanzadasRef = useRef<HTMLDetailsElement>(null);

  // Sin límite máximo (null) no hay conflicto posible; con límite, mismo
  // criterio que el override por tipo de clase (#867): comparar en minutos.
  const ventanaImposible = pol.reservaAntelacionMaximaDias != null
    && pol.reservaVentanaMinimaMinutos > pol.reservaAntelacionMaximaDias * 24 * 60;

  // ⚠️ «Pedir confirmación de asistencia» NO viaja en `pol`, y no es un
  // descuido.
  //
  // Vivía sola en Centro de Control, debajo de un desplegable cerrado por
  // defecto, y por eso una propietaria veía cancelarse reservas sin encontrar
  // nunca dónde se decidía eso. Su sitio son estas reglas. Pero su columna solo
  // la escribe `/api/decisiones/confirmacion-riesgo`, que además de comprobar
  // el rol exige plan con Centro de Control (el riesgo lo calcula el motor de
  // decisiones). Meterla en `updateStudio` —un UPDATE del cliente contra la
  // RLS— la habría regalado a cualquier plan sin que se notara. Se queda con su
  // endpoint: al pulsar «Guardar» se llama a él, nunca a `updateStudio`.
  //
  // Desde el 13-sep también espera al botón, como todo lo demás. Guardaba al
  // pulsar, y con dos modelos en la misma tarjeta nadie sabía qué se había
  // guardado (evaluación del 13-sep). Por eso lo guardado y lo elegido en
  // pantalla van por separado.
  const [confirmacionGuardada, setConfirmacionGuardada] = useState<boolean | null>(null); // null = cargando
  const [confirmacion, setConfirmacion] = useState<boolean | null>(null);
  const [sinPlanConfirmacion, setSinPlanConfirmacion] = useState(false);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    let vivo = true;
    obtenerConfirmacionRiesgo().then(r => {
      if (!vivo) return;
      if ('activo' in r) { setConfirmacionGuardada(r.activo); setConfirmacion(r.activo); return; }
      // Fallar en CERRADO para lo que se pinta: sin poder leerlo, se enseña
      // apagado y sin permitir tocarlo, nunca encendido por defecto.
      setConfirmacionGuardada(false);
      setConfirmacion(false);
      setSinPlanConfirmacion(true);
    });
    return () => { vivo = false; };
  }, []);

  // ⚠️ «Avisar a las alumnas» TAMPOCO viaja en `pol`, y este sí guarda al pulsar.
  //
  // Su único escritor es `/api/sustituciones` (action `config_avisar`). Aquí se
  // enseña con el resto de lo que le pasa a una alumna cuando su clase cambia,
  // con el MISMO componente que en Sustituciones (donde lo sigue cambiando la
  // gerencia, que no entra en Configuración). NO espera al botón «Guardar»:
  // meterlo ahí mezclaría dos endpoints en un solo «guardado», la trampa de
  // «Guardado sin guardar» de #1971. Por eso va en su propia tarjeta.
  const avisarGuardado = studio?.avisarAlumnas ?? null;

  // Las frases cuentan lo GUARDADO, nunca lo que hay a medio editar en `pol`: si
  // «Guardar» falla, la frase no puede haber cambiado.
  const politicaGuardada = studioToPolitica(studio);
  const frases = studio ? frasesPoliticaEstudio({ ...politicaGuardada, avisarAlumnas: avisarGuardado }) : [];

  // Llegar con un ancla (`#ajuste-avisar-alumnas` desde Sustituciones,
  // `#compra-desde-tu-enlace` desde Alta de alumnas) lo resuelve el shell de
  // Configuración para todas las secciones: abre «Opciones avanzadas» si el
  // ajuste está dentro y le da el foco a su control (shell/config-shell.tsx).

  // Un solo botón para toda la tarjeta, pegado abajo, que dice si queda algo
  // pendiente — incluido el interruptor de confirmación.
  const cambiaPolitica = JSON.stringify(pol) !== JSON.stringify(politicaGuardada);
  const cambiaConfirmacion = confirmacion !== null && confirmacion !== confirmacionGuardada;
  const hayCambios = cambiaPolitica || cambiaConfirmacion;

  async function guardarPolitica() {
    if (ventanaImposible || guardando) return;
    setGuardando(true);
    const errores: string[] = [];
    if (cambiaPolitica) {
      const res = await updateStudio(pol);
      if (!res.ok) errores.push(res.error);
    }
    if (cambiaConfirmacion && confirmacion !== null) {
      const r = await actualizarConfirmacionRiesgo(confirmacion);
      // Si su endpoint dice que no, la pantalla se queda con «cambios sin
      // guardar»: lo elegido no se da por guardado.
      if ('error' in r) errores.push(r.error);
      else setConfirmacionGuardada(confirmacion);
    }
    setGuardando(false);
    showToast(errores.length ? errores.join(' · ') : 'Política de reservas guardada');
  }

  return (
    <>
      {studio && (
        <TarjetaAjuste id="politica-explicada">
          <ul aria-labelledby="politica-explicada-titulo" className="divide-y divide-border">
            {frases.map(f => (
              <li key={f.id} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                <span className="text-[13px] text-foreground">{f.texto}</span>
                <a
                  href={`#ajuste-${f.ajuste}`}
                  onClick={e => { e.preventDefault(); irAAjuste(f.ajuste, avanzadasRef.current); }}
                  className="shrink-0 text-[12px] font-medium text-foreground underline underline-offset-2 hover:no-underline"
                >
                  Cambiar
                </a>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground mt-3">
            Son los valores de todo el estudio. Cada tipo de clase puede tener su propio plazo de cancelación, lista de
            espera y plazo para aceptar una plaza, desde Configuración → Mis clases y citas → Tipos de clase.
          </p>
        </TarjetaAjuste>
      )}
      <TarjetaAjuste id="reglas-de-reserva">
        <div className="space-y-4">
          <p className={grupoCls}>General</p>
          <div id="ajuste-ventana-cancelacion">
            <label htmlFor={`${idCampo}-ventana`} className={labelCls}>Plazo para cancelar sin perder la sesión (horas antes)</label>
            <input
              type="number" min={0} max={168} className={inputCls}
              id={`${idCampo}-ventana`} value={pol.cancelacionVentanaHoras}
              onChange={e => setPol(p => ({ ...p, cancelacionVentanaHoras: Math.max(0, Number(e.target.value)) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Cancelar con menos antelación se considera tardío. 0 = puede cancelar hasta el último momento.
            </p>
          </div>
          <label id="ajuste-devolver-tardia" className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Devolver la sesión del bono en cancelaciones tardías
              <span className="block text-[11px] text-muted-foreground">Desactivado: una cancelación tardía pierde la sesión (recomendado). La plaza se libera igual.</span>
            </span>
            <Toggle on={pol.cancelacionDevolverBonoTardia} onChange={v => setPol(p => ({ ...p, cancelacionDevolverBonoTardia: v }))} />
          </label>
          {/* Desde #1342 este interruptor lo leen TODAS las cancelaciones de clase
              entera, no solo las del panel: `devolverBonosPorCancelacionClase` es
              también el camino del mínimo de asistentes y del cierre del centro.
              La etiqueta decía «al cancelar tú», y eso dejaba fuera dos de tres. */}
          <label id="ajuste-clase-devuelve-bono" className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Devolver la sesión al cancelar una clase entera
              <span className="block text-[11px] text-muted-foreground">
                Las alumnas apuntadas recuperan la sesión en su bono. Vale para las clases que cancelas tú
                (avería, baja de la instructora, mal tiempo...) y también para las que se cancelan solas por no
                llegar al mínimo de asistentes o por un cierre del centro. Desactívalo si prefieres que se les
                agote igual.
              </span>
            </span>
            <Toggle on={pol.cancelacionClaseDevuelveBono} onChange={v => setPol(p => ({ ...p, cancelacionClaseDevuelveBono: v }))} />
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Exigir plan o bono activo para reservar
              <span className="block text-[11px] text-muted-foreground">La alumna necesita una suscripción activa o bono con sesiones para reservar.</span>
            </span>
            <Toggle on={pol.reservaExigirPlan} onChange={v => setPol(p => ({ ...p, reservaExigirPlan: v }))} />
          </label>
          {/* `ajuste-instructoras-crean-clases`: su sitio es «Mi equipo», que
              enlaza aquí mientras este formulario no se parta. */}
          <label id="ajuste-instructoras-crean-clases" className="flex scroll-mt-32 items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Las instructoras pueden crear sus clases
              <span className="block text-[11px] text-muted-foreground">
                Desactivado: solo tienen las clases que les asignas. Pueden seguir moviendo o editando las suyas.
              </span>
            </span>
            <Toggle on={pol.instructorasCreanClases} onChange={v => setPol(p => ({ ...p, instructorasCreanClases: v }))} />
          </label>
          {/* ── Opciones avanzadas ────────────────────────────────────────────
              Arriba solo lo que decide todo estudio (cancelación, devolución,
              exigir bono). El resto —unas quince reglas— se pliega: la tarjeta
              enseñaba veinte opciones seguidas y lo básico se perdía entre
              penalizaciones y plazos (evaluación del 13-sep). Plegado no es
              escondido: todo sigue guardándose con el mismo botón. */}
          <details ref={avanzadasRef} className="group rounded-xl border border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block text-[13px] font-semibold text-foreground">Opciones avanzadas</span>
                <span className="block text-[11px] text-muted-foreground">
                  Compra desde el enlace, recuperaciones, antelación, lista de espera, confirmación, mínimo de asistentes y penalizaciones.
                </span>
              </span>
              <ChevronDown size={16} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-4 border-t border-border px-4 py-4">
          {/* Quién puede comprar desde el enlace público sin tener ficha. Antes
              no había ajuste: se cobraba y no se entregaba nada (el webhook
              ignoraba el plan comprado). */}
          {/* `compra-desde-tu-enlace`: su sitio es «Alta de alumnas», que enlaza
              aquí mientras este formulario no se parta. */}
          <div id="compra-desde-tu-enlace" className="scroll-mt-32">
            <p id={`${idCampo}-compra`} className={labelCls}>Si alguien compra un bono desde tu enlace público y aún no es alumna</p>
            <div role="radiogroup" aria-labelledby={`${idCampo}-compra`} className="space-y-2 mt-1.5">
              {([
                ['EXIGIR_REGISTRO', 'Que se registre antes de pagar',
                 'Le pedimos su email y que acepte tus condiciones, y luego paga. Es lo más limpio: nadie paga sin haber aceptado el contrato.'],
                ['CREAR_FICHA', 'Que pague directamente',
                 'Cobras primero y le creamos la ficha con el email de su tarjeta. Vendes con menos pasos; a cambio entra sin contrato aceptado y se lo pediremos cuando entre a reservar.'],
              ] as const).map(([valor, titulo, detalle]) => (
                <label
                  key={valor}
                  className={cn(
                    'flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors',
                    pol.compraPublicaModo === valor ? 'border-brand bg-brand/5' : 'border-border hover:bg-muted',
                  )}
                >
                  <input
                    type="radio"
                    name="compra-publica-modo"
                    className="mt-0.5 accent-[var(--brand)]"
                    checked={pol.compraPublicaModo === valor}
                    onChange={() => setPol(p => ({ ...p, compraPublicaModo: valor }))}
                  />
                  <span>
                    <span className="block text-[13px] font-medium text-foreground">{titulo}</span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5">{detalle}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor={`${idCampo}-a-la-vez`} className={labelCls}>Reservas a la vez por alumna</label>
            <input
              type="number" min={0} max={99} className={inputCls}
              placeholder="Sin límite"
              id={`${idCampo}-a-la-vez`} value={pol.reservaMaxSimultaneas ?? ''}
              onChange={e => setPol(p => ({ ...p, reservaMaxSimultaneas: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Reservas activas en clases futuras. Vacío = sin límite.
            </p>
          </div>
          {/* Migr 0086: la política ya existía en la BD y la aplica
              `calcular_caduca_recuperacion` dentro de `crear_recuperacion`,
              pero no había forma de cambiarla sin entrar a SQL. */}
          <p className={grupoCls}>Recuperaciones</p>
          <div>
            <label htmlFor={`${idCampo}-caducidad`} className={labelCls}>Cuándo caduca una recuperación</label>
            <select
              className={inputCls}
              id={`${idCampo}-caducidad`} value={pol.recuperacionCaducidadTipo}
              onChange={e => setPol(p => ({ ...p, recuperacionCaducidadTipo: e.target.value as PoliticaForm['recuperacionCaducidadTipo'] }))}
            >
              <option value="FIN_MES_SIGUIENTE">Al final del mes siguiente</option>
              <option value="FIN_MES">Al final del mes en curso</option>
              <option value="DIAS">Pasados unos días</option>
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Se calcula al conceder la recuperación, no desde la clase perdida.
            </p>
          </div>
          {pol.recuperacionCaducidadTipo === 'DIAS' && (
            <div>
              <label htmlFor={`${idCampo}-dias`} className={labelCls}>Días de validez</label>
              <input
                type="number" min={1} max={365} className={inputCls}
                placeholder="30"
                id={`${idCampo}-dias`} value={pol.recuperacionCaducidadDias ?? ''}
                onChange={e => setPol(p => ({ ...p, recuperacionCaducidadDias: e.target.value === '' ? null : Math.max(1, Number(e.target.value)) }))}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Vacío = 30 días.
              </p>
            </div>
          )}
          {/* Fase 1 de reglas por tipo de clase (migr 20260730152516): estos son
              los defaults del estudio; cada tipo de clase los puede sobrescribir
              desde Clases → editar tipo de clase. */}
          <p className={grupoCls}>Antelación</p>
          <div>
            <label htmlFor={`${idCampo}-antelacion-minima`} className={labelCls}>Antelación mínima para reservar (minutos)</label>
            <input
              type="number" min={0} className={inputCls}
              id={`${idCampo}-antelacion-minima`} value={pol.reservaVentanaMinimaMinutos}
              onChange={e => setPol(p => ({ ...p, reservaVentanaMinimaMinutos: Math.max(0, Number(e.target.value)) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Se cierra la reserva con esta antelación. 0 = se puede reservar hasta el mismo inicio de la clase.
            </p>
          </div>
          <div>
            <label htmlFor={`${idCampo}-antelacion-maxima`} className={labelCls}>Antelación máxima para reservar (días)</label>
            <input
              type="number" min={0} className={inputCls}
              placeholder="Sin límite"
              id={`${idCampo}-antelacion-maxima`} value={pol.reservaAntelacionMaximaDias ?? ''}
              onChange={e => setPol(p => ({ ...p, reservaAntelacionMaximaDias: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              No se puede reservar con más antelación que esta. Vacío = sin límite.
            </p>
            {ventanaImposible && (
              <p role="alert" className="text-[11px] text-destructive mt-1">
                La antelación mínima ({pol.reservaVentanaMinimaMinutos} min) es mayor que la máxima
                ({pol.reservaAntelacionMaximaDias} días) — nunca habría un momento válido para reservar.
              </p>
            )}
          </div>
          <p className={grupoCls}>Lista de espera y confirmación</p>
          <label id="ajuste-lista-espera" className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Permitir lista de espera
              <span className="block text-[11px] text-muted-foreground">
                Con la clase llena, la alumna puede apuntarse a la lista de espera. Vale para todo el estudio; cada
                tipo de clase puede cambiarlo desde Configuración → Mis clases y citas → Tipos de clase.
              </span>
            </span>
            <Toggle on={pol.permiteListaEspera} onChange={v => setPol(p => ({ ...p, permiteListaEspera: v }))} />
          </label>
          <div>
            <label htmlFor={`${idCampo}-plazo-espera`} className={labelCls}>Tiempo para aceptar una plaza que se libera (minutos)</label>
            <input
              type="number" min={0} className={inputCls}
              placeholder="Sin plazo (confirmación instantánea)"
              id={`${idCampo}-plazo-espera`} value={pol.listaEsperaPlazoAceptacionMinutos || ''}
              onChange={e => setPol(p => ({ ...p, listaEsperaPlazoAceptacionMinutos: Math.max(0, Number(e.target.value) || 0) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Sin plazo, al liberarse una plaza se confirma sola a la primera de la lista aunque no esté mirando el móvil en ese momento — y si no aparece, la plaza se pierde. Con un plazo (p.ej. 15 min), le das tiempo a confirmar que la quiere antes de dársela; si no contesta, pasa a la siguiente. Vacío o 0 = sin plazo.
            </p>
          </div>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Dar recuperaciones solas al cerrar la semana
              <span className="block text-[11px] text-muted-foreground">
                Cada lunes, a quien canceló a tiempo y no le dio tiempo a recuperar el hueco esa semana, le aparece una recuperación sin que tenga que pedírtela. Solo afecta a planes con límite semanal —con bono ya se devuelve la sesión sola— y respeta tu tope de 4 y tu política de caducidad.
              </span>
            </span>
            <Toggle on={pol.recuperacionAutoSemanal} onChange={v => setPol(p => ({ ...p, recuperacionAutoSemanal: v }))} />
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              No dejar reservar con un pago fallido
              <span className="block text-[11px] text-muted-foreground">
                Solo cuenta un cobro que se intentó y no salió (tarjeta rechazada o recibo devuelto), no una cuota emitida que aún está en plazo. Nunca bloquea desde mostrador —ahí decides tú— ni a quien acaba de pagar esa misma clase.
              </span>
            </span>
            <Toggle on={pol.bloquearReservaImpago} onChange={v => setPol(p => ({ ...p, bloquearReservaImpago: v }))} />
          </label>
          <label className={cn('flex items-center justify-between gap-4', sinPlanConfirmacion ? 'cursor-default' : 'cursor-pointer')}>
            <span className="text-[13px] text-foreground">
              Pedir confirmación a quien suele no venir
              <span className="block text-[11px] text-muted-foreground">
                La víspera se le manda un email para que confirme que viene. Si no
                confirma antes de la clase, se cancela su reserva y la plaza pasa a
                la lista de espera. <strong className="font-semibold">No se le pide a todo el mundo</strong>: solo a
                quien acumula faltas recientes, no a quien reserva y viene.
              </span>
              {sinPlanConfirmacion && (
                <span className="block text-[11px] text-muted-foreground mt-1">
                  Esta regla va con el Centro de Control: quien decide a quién pedírselo
                  es el motor de decisiones, y tu plan no lo incluye.
                </span>
              )}
            </span>
            <Toggle
              on={!!confirmacion}
              onChange={v => { if (!sinPlanConfirmacion) setConfirmacion(v); }}
              disabled={confirmacion === null || sinPlanConfirmacion}
            />
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Aprobar cada reserva a mano
              <span className="block text-[11px] text-muted-foreground">La reserva no se confirma sola: queda pendiente hasta que la apruebes o la rechaces desde Inicio (Lo que espera tu visto bueno) o desde la clase en el calendario.</span>
            </span>
            <Toggle on={pol.requiereAprobacion} onChange={v => setPol(p => ({ ...p, requiereAprobacion: v }))} />
          </label>
          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-[13px] text-foreground">
              Pasar lista
              <span className="block text-[11px] text-muted-foreground">
                Desactívalo si confías en que quien reserva viene: toda reserva confirmada se da por asistida sola al terminar la clase, sin que nadie tenga que escanear nada ni marcarla a mano.
              </span>
              <span className="block text-[11px] text-muted-foreground mt-1">
                Es el valor por defecto: cada tipo de clase puede llevarte la contraria desde Configuración → Mis clases y citas → Tipos de clase.
              </span>
              {!pol.requiereCheckinQr && !!pol.penalizacionImporteEur && pol.penalizacionAplicaNoShow && (
                <span className="block text-[11px] text-amber-600 mt-1">
                  Con esto desactivado y el cargo por no venir sin avisar activo, nunca vas a poder cobrarlo: toda reserva se da por asistida antes de que exista un &quot;no vino&quot; que cobrar. Puedes seguir marcando &quot;No asistió&quot; a mano desde Asistentes si lo ves en el momento.
                </span>
              )}
            </span>
            <Toggle on={pol.requiereCheckinQr} onChange={v => setPol(p => ({ ...p, requiereCheckinQr: v }))} />
          </label>
          <div>
            <label htmlFor={`${idCampo}-minimo`} className={labelCls}>Mínimo de asistentes para mantener la clase</label>
            <input
              type="number" min={0} className={inputCls}
              placeholder="Sin mínimo"
              id={`${idCampo}-minimo`} value={pol.minimoAsistentesPorClase || ''}
              onChange={e => setPol(p => ({ ...p, minimoAsistentesPorClase: Math.max(0, Number(e.target.value) || 0) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Si a 2h del inicio no se alcanza, la clase se cancela automáticamente{pol.cancelacionClaseDevuelveBono
                ? ' y se devuelve la sesión a las apuntadas'
                : ' sin devolver la sesión a las apuntadas: tienes desactivado «Devolver la sesión al cancelar una clase entera»'}. Vacío o 0 = sin mínimo.
            </p>
          </div>
          <p className={grupoCls}>Si cancela tarde o no viene</p>
          <div>
            <label htmlFor={`${idCampo}-cargo`} className={labelCls}>Cargo por cancelar tarde o no venir sin avisar (€)</label>
            <input
              type="number" min={0} step="0.01" className={inputCls}
              placeholder="Sin cargo"
              id={`${idCampo}-cargo`} value={pol.penalizacionImporteEur || ''}
              onChange={e => setPol(p => ({ ...p, penalizacionImporteEur: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Se cobra a la tarjeta guardada de la alumna (si tiene una) cuando cancela dentro del plazo para cancelar o no se presenta. Vacío o 0 = sin cargo.
            </p>
          </div>
          {!!pol.penalizacionImporteEur && (
            <>
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <span className="text-[13px] text-foreground">
                  Cobrar si cancela tarde
                </span>
                <Toggle on={pol.penalizacionAplicaCancelacionTardia} onChange={v => setPol(p => ({ ...p, penalizacionAplicaCancelacionTardia: v }))} />
              </label>
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <span className="text-[13px] text-foreground">
                  Cobrar también si no viene sin avisar
                </span>
                <Toggle on={pol.penalizacionAplicaNoShow} onChange={v => setPol(p => ({ ...p, penalizacionAplicaNoShow: v }))} />
              </label>
              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <span className="text-[13px] text-foreground">
                  Cobrar automáticamente
                  <span className="block text-[11px] text-muted-foreground">Cuando esté desactivado, cada cargo esperará tu aprobación antes de tocar la tarjeta de la alumna.</span>
                </span>
                <Toggle on={pol.penalizacionCobroAutomatico} onChange={v => setPol(p => ({ ...p, penalizacionCobroAutomatico: v }))} />
              </label>
            </>
          )}
            </div>
          </details>
        </div>
        {/* Negativos iguales al padding de la tarjeta (p-4, y p-6 con sitio): la
            barra ocupa el ancho entero y queda pegada al borde de abajo.
            `data-barra-guardar`: esta barra está siempre, así que en el móvil y
            el iPad la burbuja de WhatsApp no se pinta en esta sección (caía
            encima de ella; globals.css). */}
        <div data-barra-guardar="" className="sticky z-10 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+0.5rem)] lg:bottom-4 -mx-4 -mb-4 mt-4 flex flex-wrap items-center gap-3 rounded-b-xl border-t border-border bg-card px-4 py-3 @md/config:-mx-6 @md/config:-mb-6 @md/config:px-6">
          <button
            onClick={guardarPolitica}
            disabled={ventanaImposible || !hayCambios || guardando}
            className="px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Guardar política de reservas
          </button>
          <p role="status" className={cn('text-[11px]', hayCambios ? 'font-medium text-foreground' : 'text-muted-foreground')}>
            {/* La alerta de antelación imposible vive en «Opciones avanzadas», que
                puede estar plegado: sin esto el botón aparecería apagado sin
                decir por qué. */}
            {ventanaImposible
              ? 'Revisa la antelación en «Opciones avanzadas»: la mínima es mayor que la máxima.'
              : hayCambios ? 'Tienes cambios sin guardar.' : 'Sin cambios pendientes.'}
          </p>
        </div>
      </TarjetaAjuste>
      {/* Guarda al pulsar y por su propio endpoint: tarjeta propia, y la marca
          «Se guarda al momento» lo dice antes de tocarlo. */}
      <TarjetaAjuste id="ajuste-avisar-alumnas">
        <InterruptorAvisarAlumnas
          guardado={avisarGuardado}
          onGuardado={v => reflejarStudioGuardado({ avisarAlumnas: v })}
        />
      </TarjetaAjuste>
    </>
  );
}
