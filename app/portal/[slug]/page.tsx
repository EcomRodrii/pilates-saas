'use client';

import { useCallback, useEffect } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionStudent } from '@/lib/student/sesion';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { loQueTengo, tieneAlgo } from '@/lib/student/lo-que-tengo';
import { useAsync } from '@/lib/student/useAsync';
import { useAforoEnVivoPortal } from '@/lib/student/use-aforo-portal';
import { getAlumna, getBonos, getClases, getHayAlgoALaVenta, getHuella, getInstructoras, getMinimoRacha, getPagos, getPlazaFija, getRenovacionPorPagar, getReservas } from '@/lib/student/datos';
import { deudaDeLaCuota, porPagarEnLaApp } from '@/lib/student/mi-plan-vista';
import { getGamificacion } from '@/lib/student/gamificacion-datos';
import { disponibilidad } from '@/lib/student/maquina-reserva';
import { hoyISO } from '@/lib/student/formato';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { estaEnCurso, yaTermino } from '@/lib/student/estado-clase';
import { ErrorState, OfflineState, Skeleton } from '@/components/student/ui/States';
import { LoTuyo } from '@/components/student/domain/LoTuyo';
import { TarjetaProximaClase } from '@/components/student/domain/TarjetaProximaClase';
import { BaldosasInicio } from '@/components/student/domain/BaldosasInicio';
import { CitaManuscrita } from '@/components/student/domain/CitaManuscrita';
import { Descubre } from '@/components/student/domain/Descubre';
import { ProximaClaseVacia } from '@/components/student/domain/ProximaClaseVacia';
import { ActivarAvisos } from '@/components/student/domain/ActivarAvisos';
import { MensajeDestacado } from '@/components/student/domain/MensajeDestacado';
import { ValoracionCard } from '@/components/student/domain/ValoracionCard';
import { TuProgreso } from '@/components/student/domain/TuProgreso';
import { RetoDeAhora } from '@/components/student/domain/RetoDeAhora';
import { useRouter } from 'next/navigation';
import { enVistaPreviaDelPanel, useEnVistaPreviaDelPanel } from '@/lib/student/vista-previa-panel';
import { invalidarCatalogo } from '@/lib/student/catalogo';
import { TirarParaActualizar } from '@/components/student/ui/TirarParaActualizar';
import { clasesConPlazaProximas, esRecienLlegada } from '@/lib/student/momento-inicio';
import { PrimeraClaseCard } from '@/components/student/domain/PrimeraClaseCard';
import { QueTalLaClase } from '@/components/student/domain/QueTalLaClase';

// Inicio: copia de la maqueta de los cuatro iPhones (fundador, 19-oct-2026). Ver el comentario del `return`.
//
// ⚠️ «Huecos de hoy» (la cuenta que usa `ProximaClaseVacia`) no promete plaza. El paquete filtra por `plazasLibres > 0`
// con el aforo que el cliente cree tener, y ese número es ORIENTATIVO: no resta
// las máquinas averiadas, que no viajan en ningún payload público. Se enseña
// igual —es un atajo útil al horario— pero quien decide es el servidor al
// reservar, y por eso su rechazo tiene pantalla propia (`full`).
export default function InicioPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const { socia, autenticado } = useSesionStudent(estudio.slug);
  // La app es también la de la instructora (14-sep-2026): quien entra con su
  // cuenta de instructora de este estudio va directa a su parte, aunque además
  // sea alumna — allí tiene la agenda única con lo que da y lo que reserva.
  const { instructora } = useSesionInstructora(estudio.slug, autenticado);
  const destinoEquipo = href('/equipo');
  useEffect(() => {
    // En la vista previa de «Apariencia de tu app» (iframe del panel) se queda
    // en el Inicio de la alumna aunque la propietaria también dé clase aquí:
    // es la pantalla que ha venido a ver.
    if (instructora && !enVistaPreviaDelPanel()) router.replace(destinoEquipo);
  }, [instructora, destinoEquipo, router]);
  const hoy = hoyISO();
  // `null` hasta que hidrata; los filtros que lo usan lo tratan como «todavía no».
  const ahoraMs = useAhoraMs();

  const cargar = useCallback(async () => {
    // `getMinimoRacha` (el mínimo semanal del estudio, el denominador de «Tu progreso esta semana»), `getAlumna`, `getHuella` y `getHayAlgoALaVenta` (la bienvenida de la recién llegada) salen del mismo payload:
    // ninguna petición de más.
    const [clases, reservas, bonos, instructoras, plazaFija, gamificacion, minimoRacha, alumna, huella, hayAlgoALaVenta, pagos, renovacion] = await Promise.all([
      getClases(estudio.slug), getReservas(estudio.slug), getBonos(estudio.slug), getInstructoras(estudio.slug), getPlazaFija(estudio.slug), getGamificacion(estudio.slug), getMinimoRacha(estudio.slug),
      getAlumna(estudio.slug), getHuella(estudio.slug), getHayAlgoALaVenta(estudio.slug), getPagos(estudio.slug), getRenovacionPorPagar(estudio.slug),
    ]);
    return { clases, reservas, bonos, instructoras, plazaFija, gamificacion, minimoRacha, alumna, huella, hayAlgoALaVenta, pagos, renovacion };
  }, [estudio.slug]);

  // Con `clave`: al volver a Inicio desde otra pestaña se ve al momento lo de
  // antes y se refresca por detrás (ver `useAsync`).
  const { data, estado, reintentar, refrescar } = useAsync(cargar, () => false, `alumna:${estudio.slug}:inicio`);
  // Aforo en vivo: si alguien reserva, cancela o el estudio quita a una
  // alumna, esta pantalla se entera sola. Sin sondeo: si nadie toca nada,
  // no se pide nada.
  useAforoEnVivoPortal(estudio.slug, estudio.id, refrescar);
  // Tirar para actualizar: el catálogo se cachea 60 s, así que sin tirarlo
  // `refrescar` devolvería lo mismo. Las demás pestañas conservan su memoria.
  const actualizar = useCallback(async () => {
    invalidarCatalogo(estudio.slug, { conservarVistas: true });
    await refrescar();
  }, [estudio.slug, refrescar]);
  const gamificacion = data?.gamificacion ?? null;

  // Lo que tiene (cuota, bono, clase fija, recuperaciones), del MISMO selector que Mi plan y Perfil (`loQueTengo`): «la
  // mensual gana» y el bono que el servidor gastaría primero, con su saldo de `saldoBono`.
  const loTengo = data ? loQueTengo({ bonos: data.bonos, plazas: data.plazaFija.plazas, recuperaciones: data.plazaFija.recuperaciones }) : null;

  // La próxima: de sus reservas confirmadas, la primera que aún no ha pasado.
  // El paquete no filtra por fecha porque sus datos de ejemplo son siempre
  // futuros; con datos reales, sin ese filtro «tu próxima clase» sería la
  // primera de su historial.
  //
  // ⚠️ El filtro por DÍA (`fecha >= hoy`) no bastaba, y era un bug visible: a las
  // 16:30 seguía anunciando como «tu próxima clase» la de las 09:00 que ya había
  // terminado, porque las dos son de hoy. Con el instante de fin a mano
  // (`Clase.fin`) se descarta la terminada — y la que se está DANDO se queda, que
  // es justo la que hay que enseñar, con su etiqueta de «en curso».
  //
  // El filtro por día se mantiene delante: es barato y descarta el historial sin
  // mirar el reloj, así que antes de hidratar (`ahoraMs === null`) la tarjeta
  // sigue saliendo igual que siempre en vez de desaparecer.
  const proxima = data?.reservas
    .filter((r) => r.estado === 'confirmada')
    .map((r) => ({ r, c: data.clases.find((c) => c.id === r.claseId) }))
    .filter((x): x is { r: (typeof x)['r']; c: NonNullable<(typeof x)['c']> } => Boolean(x.c))
    .filter((x) => x.c.fecha >= hoy)
    .filter((x) => !yaTermino(x.c, ahoraMs))
    .sort((a, b) => (a.c.fecha + a.c.hora).localeCompare(b.c.fecha + b.c.hora))[0];

  // «Huecos de hoy» es un atajo para RESERVAR, así que una clase ya empezada no
  // es un hueco: el servidor la rechaza (`sesionYaEmpezada`). Antes salía toda la
  // mañana ofreciendo plazas de clases que ya se estaban dando o que habían
  // acabado, porque el filtro era del día entero.
  //
  // ⚠️ El recorte a 3 es de la LISTA, no del recuento: `ProximaClaseVacia` dice
  // «Hay N clases hoy con plaza libre» y con esta misma variable topada decía 3
  // habiendo 8. La frase tenía cálculo detrás, pero no el que decía.
  const libresHoy = (data?.clases ?? [])
    .filter((c) => c.fecha === hoy)
    .filter((c) => !estaEnCurso(c, ahoraMs) && !yaTermino(c, ahoraMs))
    .filter((c) => disponibilidad(c, data?.reservas ?? [], estudio.soportaListaEspera) !== 'reservada')
    .filter((c) => c.plazasLibres > 0);

  // «¿Qué tal la clase?»: la clase recién terminada a la que asistió la pide
  // la propia tarjeta al servidor (el catálogo no trae clases terminadas). Sin
  // nada que valorar, no pinta nada.
  const tarjetaValorar = <QueTalLaClase studioId={estudio.id} />;

  // ── La recién llegada (P03) ───────────────────────────────────────────────
  // Sin nada todavía en el estudio (`esRecienLlegada`, la MISMA regla que Perfil), «No tienes clases próximas» y «Tu ritmo»
  // a cero se cambian por la bienvenida y su primera clase. Con la huella desconocida (sin ficha, o el payload incompleto
  // por un fallo de lectura) NO: con la duda, Inicio queda como siempre. La vista previa del panel enseña a propósito
  // la de una recién llegada, que es como la vería una alumna nueva.
  const vistaPrevia = useEnVistaPreviaDelPanel();
  const recienLlegada = !!data && (vistaPrevia || esRecienLlegada(data.huella, hoy));
  const primera = data && recienLlegada ? clasesConPlazaProximas(data.clases, data.reservas, hoy, ahoraMs) : null;
  // «Lo tuyo»: con algo que contar (cuota, bono, clase fija o recuperaciones). Sin nada de eso, la línea «Sin cuota ni
  // bono» solo a quien ya ha venido y solo si su estudio vende algo: a la recién llegada ya le habla su bienvenida.
  const yaVino = !!data && data.reservas.some((r) => r.estado === 'asistida');
  // El recibo de su cuota lo dice la línea de la cuota, con la regla del servidor (`deudaDeLaCuota`): «Pago pendiente» si
  // lo paga ella, y si lo cobra su banco o su tarjeta, la frase de Recibos («No tienes que hacer nada»).
  const debeCuota = data && loTengo?.cuota ? deudaDeLaCuota(data.pagos, loTengo.cuota.id, hoy) : null;
  // Lo demás que puede pagar ELLA desde la app (`cobro-recibo-alumna`, la misma regla que Mi plan y Recibos): lo que
  // cobrará su banco o su estudio no se le pide aquí.
  const porPagar = data ? porPagarEnLaApp(data.pagos, data.renovacion).filter((p) => !(debeCuota?.pagaElla && p.reciboId === debeCuota.reciboId)) : [];
  const loTuyo = data && loTengo && (tieneAlgo(loTengo) || porPagar.length > 0 || (yaVino && data.hayAlgoALaVenta)) ? (
    <LoTuyo
      // Sin racha (19-oct-2026): se calculaba sobre el catálogo, que no trae clases pasadas, así que casi nunca pasaba de
      // la semana actual. El fundador: «rachas solo si se calculan correctamente». Vuelve cuando salga del historial.
      slug={estudio.slug} t={loTengo} hoy={hoy} racha={0}
      hrefMiPlan={href('/bonos')} hrefClaseFija={`${href('/mis-reservas')}?tab=fija`}
      hrefTienda={data.hayAlgoALaVenta ? href('/comprar') : null}
      debe={debeCuota}
      porPagar={porPagar} hrefRecibos={href('/pagos')}
    />
  ) : null;

  // El nombre de pila, como en la maqueta («Hola, Andrea»): el apellido sobra para saludar.
  const nombrePila = (socia?.nombre ?? '').trim().split(/\s+/)[0] ?? '';
  // Lo que tiene que pagar ELLA: lo único de «Lo tuyo» que no puede esperar a Mi plan. Sin nada pendiente, Inicio es la
  // maqueta tal cual; lo que tiene (bono, cuota, clase fija) vive en Mi plan.
  const hayQuePagar = porPagar.length > 0 || !!debeCuota?.pagaElla;
  // La recién llegada sin clase reservada ve su primera clase: la valoración inicial va delante (P03).
  const valoracionDelante = !proxima && recienLlegada && !!primera;

  return (
    // Inicio copia la maqueta de los cuatro iPhones (fundador, 19-oct-2026: «copia exacta»): cabecera sobre crema con el
    // logo, el nombre y la ciudad; «Hola, Andrea»; la próxima clase con su foto; cuatro baldosas; el progreso de la
    // semana y su reto. Sin portada, ni buscador, ni frases del estudio: la maqueta no las tiene.
    // `vistaPrevia`: en la vista previa del panel se ve SIN sesión de alumna, como la vería una recién llegada.
    <StudentShell conLema vistaPrevia>
      <TirarParaActualizar onRefrescar={actualizar} />
      <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 6, paddingBottom: 8 }}>
        <h1 className="saludo-inicio a-up" suppressHydrationWarning>{nombrePila ? `Hola, ${nombrePila}` : 'Hola'}</h1>

        {estado === 'loading' && (
          <>
            <Skeleton h={236} r={26} />
            <Skeleton h={96} r={18} />
            <Skeleton h={120} r={18} />
          </>
        )}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && !data && <OfflineState />}

        {data && estado !== 'loading' && estado !== 'error' && (
          <>
            {/* La clase recién terminada que puede valorar y lo que el estudio le espera: solo cuando los hay. */}
            {tarjetaValorar}
            {/* La recién llegada (P03): la valoración inicial va DELANTE de su primera clase; es lo que el estudio espera de
                ella. A las demás, debajo de las baldosas. */}
            {valoracionDelante && <ValoracionCard studioId={estudio.id} href={href('/valoracion')} />}
            {proxima ? (
              <TarjetaProximaClase
                reserva={proxima.r} clase={proxima.c} hoy={hoy} href={href}
                instructora={data.instructoras.find((i) => i.id === proxima.c.instructoraId)}
              />
            ) : recienLlegada && primera ? (
              <PrimeraClaseCard
                estudio={estudio.nombre}
                genero={data.alumna?.genero}
                clasesConPlaza={primera.total}
                soloConBono={primera.soloConBono}
                hrefReservar={href('/reservar')}
                hrefPrecios={data.hayAlgoALaVenta ? href('/comprar') : null}
              />
            ) : (
              <ProximaClaseVacia huecosHoy={libresHoy.length} hrefReservar={href('/reservar')} />
            )}

            {/* El mensaje que el estudio destaca (decisión 11A): solo si lo ha escrito. */}
            <MensajeDestacado slug={estudio.slug} />

            <BaldosasInicio
              hrefReservar={href('/reservar')}
              hrefMiPlan={href('/bonos')}
              hrefComunidad={href('/comunidad')}
              hrefFavoritas={`${href('/reservar')}?filtro=Favoritas`}
            />

            {hayQuePagar && loTuyo}
            {!valoracionDelante && <ValoracionCard studioId={estudio.id} href={href('/valoracion')} />}
            <ActivarAvisos estudioId={estudio.id} slug={estudio.slug} />

            <TuProgreso studioId={estudio.id} minimoSemanal={data.minimoRacha ?? 1} hrefMas={href('/bonos') + '#estadisticas'} />
            {gamificacion && <RetoDeAhora retos={gamificacion.retos} href={href('/logros')} fotoUrl={estudio.fotoPortada} />}

            {/* Debajo de la maqueta, y SOLO si el estudio los ha escrito o publicado (de serie, nada): su frase a mano y
                sus tarjetas «Descubre» («Contenido de tu app» en el panel). Un Inicio sin contenido propio es la maqueta
                exacta; lo que un estudio publicó para sus alumnas no desaparece sin avisar. */}
            <CitaManuscrita frase={estudio.fraseManuscrita} enLinea />
            <Descubre slug={estudio.slug} href={href} />
          </>
        )}
      </div>
    </StudentShell>
  );
}
