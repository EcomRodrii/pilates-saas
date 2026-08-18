"use client";

import { IMAGENES_CLASE } from "@/lib/imagenes-por-defecto";
import { useMemo } from "react";
import { ICON_PATHS, type IconName } from "@/components/portal-tema/components/ui/Icon";
import {
  CHALLENGES, EXERCISES, NOTIFICATIONS, QUICK_LINKS, TABS, TABS_AGENDA, TABS_CON_CENTRO, WEEK_BARS,
  buscarClase, etiquetaDia, plural,
} from "@/components/portal-tema/data/studio";
import { fechaLarga, rejillaMesPortal } from "@/lib/portal-tema/datos";
// La MISMA regla que ejecuta la RPC al cancelar (`cancelar_reserva_plaza`:
// `v_devolver := v_devolver_tardia or not v_tardia`), no una segunda copia.
import { debeDevolverBono } from "@/lib/booking-logic";
import { usePortal, useDatos } from "./PortalStore";
import { useTema } from "./TemaContext";

const money = (n: number) => n.toFixed(2).replace(".", ",") + " €";

/**
 * Traduce el estado a lo que pinta cada pantalla. Toda la lógica de
 * presentación vive aquí; los componentes solo colocan.
 *
 * Es también el ÚNICO sitio que lee el tema del contexto: lo expone en
 * `theme`/`features` y todos los demás componentes tiran de ahí. Dos lecturas
 * del mismo dato por caminos distintos es el patrón de bug que más veces ha
 * mordido en este repo.
 */
export function useViewModel() {
  const state = usePortal();
  const cfg = useTema();
  const datos = useDatos();

  return useMemo(() => {
    const f = cfg.features;
    // §6 — El evento de calendario de una clase, en la forma que consumen
    // `eventoIcs` y `urlGoogleCalendar` (lib/calendario-ics.ts).
    //
    // Se extrae porque ahora lo piden DOS sitios: la pantalla de confirmación
    // (que ya lo tenía) y cada fila de "Mis reservas" (que no). Construirlo dos
    // veces es como se acaba con una alumna a la que el .ics de la confirmación
    // le pone la dirección y el de su lista de reservas no.
    //
    // ⚠️ Instante real (`startsAt`/`endsAt`), nunca la hora de pared: un evento
    // sin zona se corre de hora en un móvil configurado en otra.
    const eventoDeClase = (c: { id: string; startsAt: string; endsAt: string; name: string; teacher: string; room: string }) => ({
      id: c.id, inicio: c.startsAt, fin: c.endsAt, titulo: c.name,
      instructora: c.teacher, sala: c.room,
      estudioNombre: datos.estudio.nombre || cfg.studio,
      estudioDireccion: [datos.estudio.direccion, datos.estudio.ciudad].filter(Boolean).join(", "),
    });
    const cls = buscarClase(datos, state.classId);
    // ⚠️ Las reservas de verdad mandan sobre las de la demo. `state.booked` es
    // la lista de mentira del kit (la llena un `setTimeout`, no el servidor):
    // mientras fue la única fuente, la pantalla de Reservas del portal real
    // salía SIEMPRE vacía —arranca en `[]`— con las reservas de la socia
    // guardadas en la base de datos. `undefined` = nadie identificado.
    const reservadas = datos.reservadas;
    const idsReservados = reservadas ? reservadas.map((r) => r.classId) : state.booked;
    const reservaPorClase = new Map((reservadas ?? []).map((r) => [r.classId, r.reservaId]));
    // ⚠️ Tener plaza y estar en la cola no son lo mismo. Sin esto el portal
    // pintaba «Reservada» en las dos, y el detalle ofrecía «Cancelar reserva»
    // a quien solo estaba apuntada a la lista.
    const porClase = new Map((reservadas ?? []).map((r) => [r.classId, r]));
    const enCola = (id: string) => porClase.get(id)?.estado === "LISTA_ESPERA";
    const booked = idsReservados.includes(state.classId);
    const fav = state.favourites.includes(state.classId);
    const next = idsReservados.length ? buscarClase(datos, idsReservados[0]) : null;
    // Ordenadas por hora. `clasesDeLaSemana` ya las devuelve así, pero la lista
    // tiene que salir en orden venga de donde venga — con los datos de muestra
    // salía 18:00 antes que 10:00, igual que pasó en el horario del Inicio.
    const dayList = datos.clases
      .filter((c) => c.day === state.day && (state.filter === "todas" || c.type === state.filter))
      .sort((a, b) => a.time.localeCompare(b.time));
    const done = idsReservados.length;
    const goal = 4;
    const exercise = EXERCISES[state.exercise];
    const passLeft = Math.max(0, datos.bono.total - idsReservados.length);
    // ⚠️ `planes` puede venir vacío (un estudio que aún no ha creado tarifas),
    // así que `plan` es nullable. Con los datos de muestra siempre había uno y
    // `PLANS[0]` parecía seguro.
    const plan = datos.planes.find((p) => p.key === state.plan) ?? datos.planes[0] ?? null;
    const vat = plan ? Math.round(plan.price * 0.21 * 100) / 100 : 0;

    return {
      theme: cfg,
      features: f,
      state,
      screen: state.screen,
      tab: state.tab,

      greeting: {
        // El nombre sale de la socia real; el tema solo decide la jerarquía.
        // `member_name`/`member_initial` de `config.ts` quedan de respaldo para
        // la previsualización, donde no hay sesión de nadie.
        micro: f.greeting_style === "display-first" ? `Hola, ${datos.socia.short || cfg.member_name}` : "Buenos días",
        name: f.greeting_style === "display-first" ? "¿Lista para tu sesión de hoy?" : (datos.socia.name || cfg.member_name),
        initial: datos.socia.initial || cfg.member_initial,
        headline: cfg.headline,
        hasAlert: !state.alertsSeen,
        // La cabecera con foto de Tentada: nombre a secas ("Hola, Laura"),
        // la fecha de hoy y la nota del tema. Sin nombre de socia (la
        // previsualización) cae al del tema, igual que `micro`/`name`.
        hola: `Hola, ${datos.socia.short || cfg.member_name}`,
        today: datos.hoy.largo,
        note: cfg.greeting_note,
      },

      // El horario de HOY, aunque la socia esté mirando otro día en la tira de
      // la semana: es la fila «Hoy en el estudio», no «el día seleccionado».
      today: datos.clases
        .filter((c) => c.day === datos.hoy.num)
        // Por hora, y aquí y no en el adaptador: es una lista de RELOJ («qué
        // pasa hoy en la sala»), no la del horario. `clasesDeLaSemana` ya
        // ordena, pero esta lista tiene que salir en orden venga de donde
        // venga — con los datos de muestra salía 18:00 antes que 10:00.
        .sort((a, b) => a.time.localeCompare(b.time))
        .map((c) => {
          const mine = idsReservados.includes(c.id);
          const full = !mine && c.seats === 0;
          return {
            id: c.id, time: c.time, name: c.name,
            meta: "con " + c.teacher + " · " + c.room,
            // Tres estados y no un booleano: "mía", "completa" y "libre" se
            // pintan distinto y el orden de precedencia importa — una clase
            // completa que YA es mía se lee como mía.
            tone: (mine ? "mine" : full ? "full" : "free") as "mine" | "full" | "free",
            tag: mine ? "TU CLASE ✓" : full ? "COMPLETA" : "RESERVAR",
          };
        }),

      // ⚠️ `meta` decía literalmente "Mañana, 18:00 · Sala 2" fuera cuando
      // fuera la clase: venía así del kit de diseño, donde la próxima clase
      // siempre era mañana. Con datos reales puede ser hoy o el sábado, así
      // que el día sale de `etiquetaDia` y "Hoy" de la fecha del estudio.
      fotos: datos.fotos,
      bloquesInicio: datos.bloquesInicio,
      next: next && {
        id: next.id, name: next.name, teacher: next.teacher, foto: next.fotoUrl,
        time: next.time, room: next.room, duration: next.duration,
        isToday: next.day === datos.hoy.num,
        day: next.day === datos.hoy.num ? "Hoy" : etiquetaDia(datos, next.day),
        meta: (next.day === datos.hoy.num ? "Hoy" : etiquetaDia(datos, next.day)) + ", " + next.time + " · " + next.room,
        // El chip que va SOBRE la foto: cuándo, y nada más. La sala y la
        // instructora ya están en la fila de debajo, y repetirlas ahí llenaba
        // el chip de texto hasta partirlo en dos líneas.
        chip: (next.day === datos.hoy.num ? "Hoy" : etiquetaDia(datos, next.day)) + " · " + next.time,
        // Para el círculo de la fila «Con Marta». `inicialDe` es la misma que
        // usa el adaptador para el resto de avatares — no un `[0]` suelto, que
        // con un nombre vacío devuelve `undefined`.
        teacherInitial: next.initial,
        // «Con Marta · Sala 2»: quién primero, que es lo que se busca de un
        // vistazo; el cuándo ya lo dice el chip de la foto.
        // Nombre CORTO: «Con Marta», no «Con Marta Gómez». Es la fila de un
        // vistazo y el apellido no ayuda a reconocerla; la ficha del detalle sí
        // lo lleva entero.
        quien: "Con " + next.teacher.split(" ")[0] + " · " + next.room,
      },
      // ⚠️ El rótulo lo pone el TEMA (`next_class_label`), no una lista de ids
      // escrita aquí. En Tentada no es un matiz: es el rótulo impreso en el
      // billete, y el diseño lo escribe entero.
      //
      // Sin próxima clase el rótulo NO es el del tema: la tarjeta ya no habla
      // de una clase concreta, así que se titula por lo que sí enseña.
      nextHeading: next ? (cfg.next_class_label ?? "Próxima clase") : "Tu semana",

      progress: {
        done, goal,
        percent: Math.round((done / goal) * 100),
        turn: (done / goal).toFixed(3),
        summary: done + " de " + goal + " clases",
        note: done >= goal ? "Semana completa" : done ? "Vas muy bien" : "Aún sin reservas",
        bars: WEEK_BARS.map((b, i) => ({
          label: b.label,
          height: b.height,
          tone: i < done + 1 ? (i === 2 ? "brand" : "support") : "empty",
        })),
      },

      challenges: CHALLENGES.map((c) => ({
        ...c,
        joined: state.challenges.includes(c.key),
        cta: state.challenges.includes(c.key) ? "Apuntada ✓" : "Apuntarme",
      })),

      // La racha real, de `calcularRacha`. `null` o menos de dos semanas = no
      // hay ninguna que enseñar, y el bloque no se pinta en vez de anunciar
      // «0 semanas»: una semana suelta no es una racha.
      streak: datos.racha && datos.racha.semanas >= 2 ? datos.racha : null,
      weekMonth: datos.hoy.mes,

      // El acceso a los vídeos para casa. El texto es del producto, no del
      // estudio: no hay campo donde la propietaria lo escriba, así que no se
      // finge que lo haya.
      videosCta: { title: "Pilates en casa", text: "Sesiones cortas para los días sin estudio" },

      // El cierre firmado. Sin cita del tema no hay bloque, y sin año de
      // apertura la firma va sin año — nunca con uno inventado.
      closing: cfg.closing_quote
        ? {
            quote: cfg.closing_quote,
            sign: [datos.estudio.nombre || cfg.studio, datos.estudio.anioFundacion ? `desde ${datos.estudio.anioFundacion}` : null]
              .filter(Boolean).join(" · "),
          }
        : null,

      quickLinks: QUICK_LINKS.map((q) => ({ label: q.label, action: q.action, icon: q.icon as IconName })),
      quickLinksHeading: cfg.quick_links_heading ?? "Accesos rápidos",

      week: datos.dias.map((d) => ({
        label: d.label, num: d.num,
        active: state.day === d.num,
        hasClass: datos.clases.some((c) => c.day === d.num),
      })),

      filters: datos.filtros.map((x) => ({ key: x.key, label: x.label, active: state.filter === x.key })),
      // «Hoy · 3 clases»: el día elegido y cuántas hay. Va bajo los filtros en
      // Sereno, donde el contador de la cabecera no existe.
      diaFrase: (state.day === datos.hoy.num ? "Hoy" : etiquetaDia(datos, state.day))
        + " · " + plural(dayList.length, "clase", "clases"),
      classes: dayList.map((c) => {
        const isBooked = idsReservados.includes(c.id);
        return {
          id: c.id, name: c.name, time: c.time, duration: c.duration, initial: c.initial, teacher: c.teacher,
          teacherFoto: c.teacherFoto,
          meta: c.room + " · " + c.level,
          // «Emma · Sala A · Todos» — quién primero, que es lo que se busca al
          // elegir clase. La fila de siempre lleva la instructora abajo con su
          // avatar; esta la sube a la línea de metadatos.
          metaLarga: [c.teacher.split(" ")[0], c.room, c.level].filter(Boolean).join(" · "),
          // «4 plazas» junto al badge. Vacío cuando no quedan o ya es suya: ahí
          // el badge («Completa», «Reservada») ya lo dice todo y repetirlo
          // sobra.
          plazas: !isBooked && !enCola(c.id) && c.seats > 0
            ? c.seats + (c.seats === 1 ? " plaza" : " plazas")
            : "",
          // Sin el nivel: la fila de Tentada ya escribe «con {teacher} · {room}»
          // y repetir «Intermedio» ahí la parte en tres líneas.
          room: c.room,
          booked: isBooked && !enCola(c.id),
          waiting: enCola(c.id),
          position: porClase.get(c.id)?.posicion ?? null,
          full: !isBooked && c.seats === 0,
          // ⚠️ En un estudio que asigna sitio, el atajo «Reservar» de la fila
          // reservaría SIN plaza: no hay dónde elegirla ahí. Con esto lleva al
          // detalle, que es donde está la rejilla — un toque más, pero sin
          // perder la máquina, que es justo lo que la fila vieja no perdía.
          eligeSitio: c.plazas.length > 0,
          status: enCola(c.id)
            ? (porClase.get(c.id)?.posicion ? porClase.get(c.id)!.posicion + "ª en lista" : "En lista de espera")
            : isBooked ? "Reservada" : c.seats ? c.seats + " libres" : "Completa",
          statusTone: (isBooked ? "booked" : c.seats ? "free" : "full") as "booked" | "free" | "full",
          // El badge de la fila de Sereno dice el ESTADO y nada más
          // («Disponible»), porque las plazas van detrás en su propia línea.
          // El de siempre mete el número dentro («3 libres») y ahí sí es lo
          // único que hay, así que se conservan los dos.
          estadoCorto: enCola(c.id) ? "En lista"
            : isBooked ? "Reservada" : c.seats ? "Disponible" : "Completa",
        };
      }),
      classCount: plural(dayList.length, "clase", "clases"),

      // La cola de la socia, para la pestaña «Lista de espera». Sale de sus
      // reservas reales (`estado === 'LISTA_ESPERA'`), no de una lista aparte.
      waitlist: (reservadas ?? []).flatMap((r) => {
        if (r.estado !== "LISTA_ESPERA") return [];
        const c = buscarClase(datos, r.classId);
        if (!c) return [];
        return [{
          id: c.id, name: c.name, time: c.time,
          reservaId: r.reservaId,
          dateLine: (c.day === datos.hoy.num ? "Hoy" : etiquetaDia(datos, c.day)) + " · " + c.time,
          meta: "con " + c.teacher + " · " + c.room,
          position: r.posicion,
          positionLabel: r.posicion ? r.posicion + "ª posición" : "En la cola",
        }];
      }),

      // Una reserva cuya clase ya no está (cancelada, o de otra semana) se cae
      // de la lista en vez de pintarse a medias.
      // ⚠️ Por FECHA y hora, no en el orden en que se reservaron. `bookings` sale
      // de `idsReservados`, que viene del orden de la tabla: en la agenda eso
      // dejaba la clase de las 18:00 encima de la de las 10:00 del mismo día.
      // Una agenda que no va en orden no es una agenda.
      bookings: [...idsReservados]
        .sort((a, b) => {
          const ca = buscarClase(datos, a); const cb = buscarClase(datos, b);
          if (!ca || !cb) return 0;
          return (ca.fecha + ca.time).localeCompare(cb.fecha + cb.time);
        })
        .flatMap((id) => {
        const c = buscarClase(datos, id);
        if (!c) return [];
        return [{
          id: c.id, name: c.name, time: c.time, day: etiquetaDia(datos, c.day),
          // El número del mes, para el bloque que pinta la fecha en grande.
          // Va aparte de `day` (la etiqueta "MAR") y no concatenado: quien
          // pinta decide si enseña una, la otra o las dos.
          dayNum: c.day,
          meta: c.room + " · " + c.teacher,
          // El id que hay que mandar para cancelar NO es el de la clase.
          // `undefined` en la demo, donde no hay reserva que cancelar.
          reservaId: reservaPorClase.get(c.id),
          // §6 — Para poder añadirla al calendario DESPUÉS de reservar. Antes
          // solo se ofrecía en la pantalla de confirmación: quien la cerraba, o
          // reservaba desde otro sitio, se quedaba sin ello para siempre.
          ics: eventoDeClase(c),
          // ── Lo que pide la agenda de Sereno ──────────────────────────────
          // El tramo entero («11:00 – 11:50»): en la agenda la pregunta es
          // cuánto ocupa el día, no solo a qué hora empieza.
          tramo: c.time + " – " + c.end,
          // Nombre corto, como en el hero: el apellido no ayuda a reconocerla.
          profe: c.teacher.split(" ")[0],
          dayNumero: c.day,
          esHoy: c.day === datos.hoy.num,
          // Estar en la cola y tener plaza NO son lo mismo, y la píldora de la
          // agenda es lo único que los distingue de un vistazo.
          enEspera: porClase.get(c.id)?.estado === "LISTA_ESPERA",
          estado: porClase.get(c.id)?.estado === "LISTA_ESPERA" ? "En lista de espera" : "Reservada",
        }];
      }),

      // ── La Agenda: semana, mes y lista ──────────────────────────────────
      //
      // ⚠️ Los puntos marcan SUS reservas, no el horario del estudio. Es la
      // diferencia entre las dos pantallas: `week`/`calendar` (arriba) marcan
      // los días en que HAY clase, porque sirven para ir a reservar; aquí un
      // punto significa «ese día tienes algo». Se consigue pasándole a
      // `rejillaMesPortal` sus clases en vez de todas — misma función, otra
      // entrada, cero código nuevo de rejilla.
      //
      // ⚠️ `vista` la usa solo el tema que la pide; los demás siguen viendo la
      // lista de siempre y ni pintan el segmentado.
      /**
       * El historial de verdad: lo que ya pasó, asistido o cancelado.
       *
       * ⚠️ «Historial de clases» del perfil llamaba a `goBookings`, o sea que
       * llevaba a la AGENDA. La agenda mira hacia delante y el historial hacia
       * atrás: son cosas distintas, y la socia que entra ahí busca lo segundo.
       */
      historial: {
        cargando: state.historialCargando,
        // `null` = todavía no se ha pedido. No es lo mismo que `[]`, que sí
        // significa «no tienes nada»: con `null` se pinta el esqueleto, no el
        // vacío.
        filas: state.historial?.map((h) => ({
          id: h.reservaId,
          nombre: h.nombre,
          cuando: fechaLarga(h.inicio),
          instructora: h.instructora,
          cancelada: h.estado !== 'ASISTIDA',
          // Se distingue cancelar de no aparecer: si el estudio cobra el
          // plantón, la socia tiene que poder ver cuál fue cuál.
          etiqueta: h.estado === 'ASISTIDA' ? 'Asistida'
            : h.estado === 'CANCELADA' ? 'Cancelada' : 'No asistida',
        })) ?? null,
      },

      agenda: (() => {
        const suyas = idsReservados
          .map((id) => buscarClase(datos, id))
          .filter((c): c is NonNullable<typeof c> => !!c);
        const conReserva = new Set(suyas.map((c) => c.fecha));
        const mes = rejillaMesPortal(new Date(datos.ahoraISO), suyas, state.day);
        // ⚠️ El día elegido se resuelve a FECHA antes de filtrar, y no es
        // ceremonia: `state.day` es un número de día y la rejilla del mes trae
        // celdas de los meses vecinos, así que «4» puede ser el 4 de este mes o
        // el del siguiente. Con el número a secas, seleccionar el 4 de agosto
        // sacaba una clase del 4 de septiembre — visto en pantalla. La celda
        // seleccionada ya sabe su fecha; la tira de la semana también.
        //
        // Esto NO resuelve la limitación de fondo (`state.day` sigue siendo un
        // número, así que la rejilla no puede navegar a otro mes — ver
        // `Calendar.tsx`); solo impide que esta pantalla mienta con ella.
        const fechaElegida = mes.cells.find((c) => c.selected)?.fecha
          ?? datos.dias.find((d) => d.num === state.day)?.fecha
          ?? null;
        return {
          vista: state.agendaVista,
          semana: datos.dias.map((d) => ({
            label: d.label, num: d.num,
            active: state.day === d.num,
            hasClass: conReserva.has(d.fecha),
          })),
          mes,
          /** Las del día elegido, para la vista de semana y la de mes. */
          delDia: fechaElegida ? suyas.filter((c) => c.fecha === fechaElegida).map((c) => c.id) : [],
          /**
           * Las que ya asistió, para «Completadas». `null` = todavía no se han
           * pedido, y entonces la sección NO se pinta; `[]` = no ha asistido a
           * ninguna, y ahí sí se dice. Son cosas distintas.
           */
          // ⚠️ SOLO las asistidas. Desde que el historial trae también las
          // canceladas, sin este filtro una clase que la socia canceló
          // aparecería en «Completadas» — que es exactamente lo contrario de lo
          // que pasó, y encima le cuadraría mal el bono.
          completadas: state.historial?.filter((h) => h.estado === 'ASISTIDA').map((h) => ({
            id: h.reservaId,
            nombre: h.nombre,
            // La fecha en palabras, en la zona del ESTUDIO — `fechaLarga` es la
            // misma que ya usa la caducidad del bono, no un formato nuevo.
            cuando: fechaLarga(h.inicio),
            instructora: h.instructora,
          })) ?? null,
          cargandoCompletadas: state.historialCargando,
        };
      })(),

      pass: {
        name: datos.bono.name, left: passLeft, total: datos.bono.total, expires: datos.bono.expires,
        // Sin bono no hay porcentaje que enseñar, y dividir por cero daría NaN.
        percent: datos.bono.total ? Math.round((passLeft / datos.bono.total) * 100) : 0,
        // Una semilla por sesión del bono, encendidas las que quedan. Se topan
        // a 12: con un bono de 50 la fila se convierte en una raya gris y deja
        // de contarse de un vistazo, que es lo único que aporta frente a la
        // barra. Por encima del tope el bloque enseña la barra y no las
        // semillas — ver `seedsFit`.
        seeds: Array.from({ length: Math.min(datos.bono.total, 12) }, (_, i) => i < passLeft),
        seedsFit: datos.bono.total > 0 && datos.bono.total <= 12,
      },
      teachers: datos.profesores,

      // El aviso de la hoja de cancelar, redactado con la ventana REAL de esta
      // clase. El prototipo escribe «Es gratis hasta 6 horas antes»; ese 6 es
      // suyo. Si el estudio no fija ninguna ventana no se promete nada — y
      // «gratis» solo se dice cuando de verdad lo es.
      //
      // ⚠️ Y `devuelve` no es cosmético. Esta hoja escribía «La clase vuelve a
      // tu bono» siempre que la socia tuviera bono, sin mirar la hora: quien
      // cancelaba dentro de la ventana se iba creyendo que recuperaba la
      // sesión y no la recuperaba. Se predice con el MISMO helper puro que usa
      // el servidor (`debeDevolverBono`, lib/booking-logic.ts) y con las dos
      // mitades de la política —la ventana de ESTA clase y la bandera del
      // estudio—, así que dice lo que la RPC va a decidir, no una suposición.
      //
      // ⚠️ Y se resuelve por el classId que trae LA HOJA, no por `state.classId`.
      // Desde «Mis reservas» (`Bookings`) la hoja se abre con el id de esa fila
      // y no toca `state.classId`, así que hasta ahora la política que se leía
      // era la de la última clase abierta en el detalle —o la de la demo, si no
      // se había abierto ninguna—. Con una ventana por tipo de clase eso es
      // decirle a la socia la de otra clase; con `devuelve` de por medio, es
      // decirle que recupera un crédito que va a perder.
      cancelSheetDe: (classId: string) => {
        const c = buscarClase(datos, classId);
        return {
          aviso: c?.cancelHoras
            ? `Es gratis hasta ${c.cancelHoras} ${c.cancelHoras === 1 ? "hora" : "horas"} antes de la clase.`
            : "Consulta con el estudio su política de cancelación.",
          devuelve: c
            ? debeDevolverBono(c.startsAt, new Date(datos.ahoraISO), c.cancelHoras ?? 0, datos.devolverBonoTardia)
            : true,
        };
      },

      // Su perfil. Los SEIS campos que edita, no los tres del prototipo: los
      // otros tres ya existen en el perfil que usa hoy y quitárselos sería que
      // el rediseño le costara dónde escribir su dirección.
      profile: {
        ...datos.socia,
        name: datos.socia.name || cfg.member_name,
        initial: datos.socia.initial || cfg.member_initial,
        estudio: datos.estudio.nombre || cfg.studio,
        // El estado SEPA que ya enseña el perfil de siempre. `null` = no está
        // domiciliada, y entonces la fila va sin coletilla en vez de con un
        // «No domiciliado» que nadie ha pedido saber.
        metodoPago: datos.socia.domiciliado ? "Domiciliado" : null,
      },

      // Las cuatro secciones de «Información del centro», ya resueltas: la
      // pantalla solo coloca. Cada una se calla si su fuente está vacía —
      // horario sin configurar, normas sin escribir— en vez de pintar un
      // bloque en blanco.
      info: (() => {
        const e = datos.estudio;
        const vacio = { filas: [] as { clave: string; valor: string }[], lista: [] as string[], parrafos: [] as string[] };
        if (state.infoKey === "horario") {
          return {
            ...vacio, titulo: "Horario del centro",
            filas: e.horario.map((h) => ({ clave: h.dia, valor: h.cuando })),
            vacio: "El estudio todavía no ha publicado su horario de apertura.",
          };
        }
        if (state.infoKey === "normas") {
          return { ...vacio, titulo: "Normas del centro", lista: e.normas,
            vacio: "El estudio todavía no ha escrito sus normas." };
        }
        if (state.infoKey === "contacto") {
          return {
            ...vacio, titulo: "Contacto",
            filas: [
              e.telefono ? { clave: "Teléfono", valor: e.telefono } : null,
              e.email ? { clave: "Email", valor: e.email } : null,
              e.direccion ? { clave: "Dirección", valor: [e.direccion, e.codigoPostal, e.ciudad].filter(Boolean).join(", ") } : null,
            ].filter((x): x is { clave: string; valor: string } => x !== null),
            vacio: "El estudio todavía no ha publicado sus datos de contacto.",
          };
        }
        return {
          ...vacio, titulo: "Privacidad",
          // Un texto largo: se parte por párrafos en blanco, como está escrito.
          parrafos: (e.privacidad ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
          vacio: "El estudio todavía no ha publicado su política de privacidad.",
        };
      })(),

      // Toda su cartera, no solo el bono que se está gastando: `bonoDe` deja
      // fuera los ilimitados y una socia con plan mensual no veía ninguno.
      wallet: datos.bonos,
      // Las iniciales del estudio para el monograma de la tarjeta de bono
      // («AP» de Aura Pilates). Salen del nombre REAL; sin nombre no se pinta
      // el círculo en vez de enseñar dos letras inventadas.
      monograma: (datos.estudio.nombre || cfg.studio)
        .split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join(""),
      purchases: datos.compras,

      notifications: NOTIFICATIONS.map((n) => ({ ...n, on: !!state.notifications[n.key] })),

      // La bandeja. `items: null` = todavía no ha llegado; la pantalla no dice
      // «no tienes avisos» mientras tanto.
      avisos: { items: state.avisos, cargando: state.avisosCargando },

      // Las tres cifras de la cabecera del perfil de Sereno.
      //
      // ⚠️ NINGUNA sale de `metrics` (justo debajo), que tiene un `18` escrito
      // a mano desde el kit de diseño: es el patrón que este repo lleva
      // quitando —una cifra en pantalla que nadie calcula—. Aquí las tres son
      // reales o no se pintan:
      //  · créditos → el saldo del bono;
      //  · clases este mes → se CUENTAN del historial de asistidas, y por eso
      //    `null` mientras no haya llegado (se pide en diferido);
      //  · racha → `calcularRacha`, que ya es la fuente de sus logros, y `null`
      //    por debajo de dos semanas: una semana suelta no es una racha.
      cifrasPerfil: (() => {
        const mes = (datos.ahoraISO ?? "").slice(0, 7);
        const esteMes = state.historial?.filter((h) => h.inicio.slice(0, 7) === mes).length ?? null;
        return [
          { valor: String(passLeft), label: passLeft === 1 ? "crédito" : "créditos" },
          esteMes === null ? null : { valor: String(esteMes), label: "clases este mes" },
          datos.racha && datos.racha.semanas >= 2
            ? { valor: String(datos.racha.semanas), label: "semanas seguidas" }
            : null,
        ].filter(Boolean) as { valor: string; label: string }[];
      })(),
      metrics: [
        { value: idsReservados.length, label: "reservas" },
        { value: 18, label: "clases" },
        { value: state.favourites.length, label: "favoritas" },
      ],

      // ⚠️ `null` cuando la clase no existe. Con los datos de muestra siempre
      // había una, así que la pantalla de detalle podía darla por hecha; con un
      // estudio real la semana puede venir vacía o la clase estar cancelada.
      detail: !cls ? null : {
        id: cls.id, name: cls.name, teacher: cls.teacher, initial: cls.initial, foto: cls.fotoUrl,
        teacherFoto: cls.teacherFoto,
        // Las plazas de la sala. Vacío = este estudio NO asigna sitio (la
        // mayoría), y entonces el detalle no pinta ninguna rejilla — que no es
        // lo mismo que «la sala está llena».
        plazas: cls.plazas,
        plazaElegida: state.spotElegido,
        description: cls.description,
        pill: cls.level + " · " + cls.duration,
        // El estado que va sobre la foto cuando el título baja al lienzo.
        // Reusa las mismas palabras que la fila del horario para que la socia
        // lea lo mismo en las dos pantallas.
        estado: enCola(state.classId) ? "En lista"
          : (booked && !enCola(state.classId)) ? "Reservada"
          : cls.seats ? "Disponible" : "Completa",
        // Los tres datos de la clase como chips de dos líneas. El nivel puede
        // venir vacío (un tipo sin nivel marcado) y entonces su chip no se
        // pinta, en vez de dejar uno con el rótulo y el hueco.
        chips: [
          cls.level ? { label: "Nivel", valor: cls.level } : null,
          { label: "Duración", valor: cls.duration },
          cls.room ? { label: "Sala", valor: cls.room } : null,
        ].filter(Boolean) as { label: string; valor: string }[],
        booked: booked && !enCola(state.classId),
        // El id que hay que mandar para cancelar NO es el de la clase.
        reservaId: reservaPorClase.get(state.classId),
        waiting: enCola(state.classId),
        // Sin plazas y sin reserva propia: el botón no reserva, apunta a la
        // cola — y eso pasa por la hoja, como cancelar.
        full: !booked && !enCola(state.classId) && !cls.seats,
        waitingLabel: porClase.get(state.classId)?.posicion
          ? "Estás en la lista de espera · " + porClase.get(state.classId)!.posicion + "ª posición. Te avisaremos si se libera una plaza."
          : "Estás en la lista de espera. Te avisaremos si se libera una plaza.",
        // De `tipos_clase.objetivos`, resueltos a etiquetas por el adaptador.
        // Vacío = el estudio no marcó ninguno y la sección no se pinta.
        benefits: cls.benefits,
        fav,
        cta: state.loading ? "Reservando…" : booked ? "Reservada" : cls.seats ? "Reservar mi plaza" : "Apuntarme a la espera",
        seats: booked ? "Tienes tu plaza guardada" : cls.seats ? "Quedan " + cls.seats + " plazas" : "Sin plazas · lista de espera abierta",
        loading: state.loading,
        confirmed: booked && !state.loading,
        meta: [
          { label: cls.time + " – " + cls.end, icon: "clock" as IconName },
          { label: cls.teacher, icon: "person" as IconName },
          { label: cls.room, icon: "pin" as IconName },
          { label: "Nivel " + cls.level.toLowerCase(), icon: "compass" as IconName },
        ],
        facts: [
          { key: "Nivel", value: cls.level },
          { key: "Duración", value: cls.duration },
          { key: "Sala", value: cls.room },
        ],
      },

      session: {
        name: exercise.name,
        // Los ejercicios son del kit, no del estudio: no hay foto suya que
        // enseñar. La genérica de clase es lo más cercano a la verdad.
        foto: IMAGENES_CLASE.generica,
        step: "Ejercicio " + (state.exercise + 1) + " de " + EXERCISES.length,
        status: state.seconds === 0 ? "Completada" : state.running ? "En marcha" : "En pausa",
        clock: "00:" + String(state.seconds).padStart(2, "0"),
        percent: Math.round(100 - (state.seconds / exercise.seconds) * 100),
        running: state.running,
      },

      // La pantalla «Mi centro». `postal` junta CP y ciudad porque se pintan
      // en la misma línea; si falta uno, sale el otro y no un guion suelto.
      centro: {
        nombre: datos.estudio.nombre || cfg.studio,
        direccion: datos.estudio.direccion,
        postal: [datos.estudio.codigoPostal, datos.estudio.ciudad].filter(Boolean).join(" "),
        telefono: datos.estudio.telefono,
        email: datos.estudio.email,
        normas: datos.estudio.normas,
      },

      tabs: (f.tab_set === "centro" ? TABS_CON_CENTRO : f.tab_set === "agenda" ? TABS_AGENDA : TABS).map((t) => ({
        key: t.key, label: t.label, icon: t.icon as IconName,
        active: state.tab === t.key,
        fill: state.tab === t.key && f.tab_icon_fill ? "currentColor" : "none",
        stroke: state.tab === t.key ? 2.2 : 1.7,
        // La cápsula flotante enseñaba la etiqueta SOLO en la activa, que es la
        // regla de Bloom escrita como si fuera la de todas las barras
        // flotantes. Sereno flota y sí las lleva las cuatro (README del tema,
        // §3: «icono+etiqueta, activa con pastilla»). Ausente = como siempre.
        showLabel: f.tab_bar_style !== "floating" || f.tab_labels === "todas" || state.tab === t.key,
      })),
      // `confirmada` lleva barra, como en el diseño: sin ella la socia se queda
      // sin más salida que el botón, y el detalle (que sí es una pantalla
      // "dentro de") tiene su propia flecha de atrás.
      showTabBar: (["inicio", "clases", "calendario", "reservas", "perfil", "bonos", "centro", "confirmada"] as string[]).includes(state.screen),
      tabBarFloating: f.tab_bar_style === "floating",

      welcome: cfg.welcome,

      plans: datos.planes.map((p) => ({ ...p, selected: state.plan === p.key })),
      checkout: {
        plan: plan?.name ?? "",
        price: money(plan?.price ?? 0),
        vat: money(vat),
        total: money((plan?.price ?? 0) + vat),
        paying: state.paying,
        cta: state.paying ? "Procesando pago…" : "Pagar " + money((plan?.price ?? 0) + vat),
      },

      // ⚠️ El desenlace REAL de la última reserva. El prototipo daba por hecho
      // que reservar sale bien; el servidor devuelve tres finales distintos, y
      // decirle «¡confirmada!» a quien quedó tercera en la cola es el bug #500
      // otra vez.
      confirmation: (() => {
        const u = state.ultimaReserva;
        if (!u) return null;
        const c = buscarClase(datos, u.classId);
        if (!c) return null;
        const copia = {
          CONFIRMADA: { title: "¡Reserva confirmada!", text: "Te esperamos en tu clase.", icon: "check" as IconName },
          LISTA_ESPERA: { title: "Estás en la lista de espera", text: "Te avisamos en cuanto se libere una plaza.", icon: "clock" as IconName },
          PENDIENTE_APROBACION: { title: "Reserva enviada", text: "El estudio tiene que aprobarla. Te avisamos en cuanto lo haga.", icon: "info" as IconName },
        }[u.estado];
        return {
          ...copia,
          estado: u.estado,
          kicker: u.estado === "CONFIRMADA" ? "Reserva confirmada" : "Tu solicitud",
          name: c.name, teacher: c.teacher, room: c.room, duration: c.duration,
          when: (c.day === datos.hoy.num ? "Hoy" : etiquetaDia(datos, c.day)) + " · " + c.time,
          ics: eventoDeClase(c),
        };
      })(),

      auth: { working: state.authWorking },
      // La rejilla sale de la capa de datos (probada), no de aquí: es lógica
      // de fechas y zona horaria. `ahoraISO` viaja con los datos para que la
      // vista previa siga siendo determinista.
      calendar: rejillaMesPortal(new Date(datos.ahoraISO), datos.clases, state.day),
      icons: ICON_PATHS,
      toast: state.toast,
      toastId: state.toastId,
    };
  }, [state, cfg, datos]);
}

export type ViewModel = ReturnType<typeof useViewModel>;
