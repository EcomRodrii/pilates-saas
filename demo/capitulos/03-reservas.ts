import type { Capitulo } from './tipos.ts';
import { abrirCajon, abrirSeccion, cajon, cerrarCajon, guardarYCerrar, interruptor } from './ayudas.ts';

export const reservas: Capitulo = {
  id: 'reservas',
  titulo: 'Cómo reservan mis alumnas',
  frase: 'Las reglas del estudio para reservar y cancelar; cada tipo de clase puede cambiar algunas.',
  async guion(g, pos) {
    const { page } = g;
    await abrirSeccion(g, pos, 'reservas', 'Cómo reservan mis alumnas', 'Las reglas para reservar, cancelar y faltar.',
      'Tercer capítulo: cómo reservan tus alumnas. Aquí están las reglas del estudio para reservar y cancelar, y cada tipo de clase puede cambiar algunas. Es la parte que más conviene pensar con calma.');

    await g.dice('Arriba está la vista Así lo vive tu alumna. Con tu próxima clase, te enseña qué le pasa a una alumna según tus reglas: cuándo se abre la reserva, hasta cuándo reserva y cuándo cancela gratis. Se actualiza al cambiar una regla.');

    // ── Reservar ──
    g.momento('reservar');
    await g.mientras('Reservar: quién puede reservar, con cuánta antelación y cuántas reservas a la vez. Exigir un plan o un bono activo está encendido: sin suscripción ni bono con sesiones, no puede reservar.', async () => {
      await abrirCajon(g, 'reservar');
    });
    await g.mientras('Después eliges cuándo se abre la reserva. Siempre abierta es lo más sencillo: en cuanto la clase está en tu horario, se puede reservar. También puedes abrirla unos días antes, a la hora de la clase o a una hora fija para todas.', async () => {
      await g.ir(cajon(page).getByRole('radio', { name: /Siempre abierta/ }));
    });
    await g.mientras('Y hasta cuándo se puede reservar. Cero minutos significa hasta que empieza. Aquí lo cerramos diez minutos antes, para tener la lista cerrada cuando llega la instructora.', async () => {
      await g.escribe(cajon(page).getByLabel('Minutos antes de empezar en que se cierra la reserva'), '10');
    });
    await g.mientras('Limitamos a cuatro las reservas a la vez por alumna, para que nadie acapare el calendario.', async () => {
      await g.escribe(cajon(page).getByLabel('Reservas a la vez por alumna'), '4');
    });
    await g.mientras('Más abajo hay dos interruptores importantes. No dejar reservar con un pago fallido, que solo mira un cobro rechazado o devuelto. Y aprobar cada reserva a mano, para estudios que quieren decidir quién entra. Activamos el primero.', async () => {
      await g.clic(cajon(page).getByRole('switch', { name: /No dejar reservar con un pago fallido/ }));
      await g.ir(cajon(page).getByRole('switch', { name: /Aprobar cada reserva a mano/ }));
    });
    await guardarYCerrar(g);

    // ── Lista de espera ──
    g.momento('lista-de-espera');
    await g.mientras('La lista de espera decide qué pasa cuando una clase está llena. Puede no haberla, dar la plaza a la primera al momento, o ofrecérsela durante unos minutos: si no la acepta a tiempo, la plaza pasa a la siguiente.', async () => {
      await abrirCajon(g, 'lista-de-espera');
      await g.clic(cajon(page).getByRole('radio', { name: /Se le ofrece durante unos minutos/ }));
    });
    await g.mientras('Elegimos la oferta con plazo, que es la más justa: nadie pierde una plaza sin enterarse, y nadie la bloquea sin usarla.', async () => {
      await g.pausa(900);
      await guardarYCerrar(g);
    });

    // ── Cancelar y recuperar ──
    g.momento('cancelar-y-recuperar');
    await g.mientras('Cancelar y recuperar. Pones hasta cuántas horas antes puede cancelar una alumna sin perder la sesión. Doce horas es lo más habitual.', async () => {
      await abrirCajon(g, 'cancelar-y-recuperar');
      await g.escribe(cajon(page).getByLabel(/Plazo para cancelar/), '12');
    });
    await g.mientras('Debajo decides si, cuando cancela tarde, se le devuelve la sesión del bono o la recuperación. Lo dejamos como viene: si cancela tarde, la pierde. Cada interruptor te cuenta qué pasa encendido y apagado. Doce horas ya es lo que había, así que cerramos sin cambios.', async () => {
      await g.ir(cajon(page).getByRole('switch', { name: /Devolver la sesión del bono/ }));
      await g.pausa(1500);
      await cerrarCajon(g);
    });

    // ── Recuperaciones ──
    g.momento('recuperaciones');
    await g.mientras('Recuperaciones: cuántas guarda sin usar cada alumna a la vez, y cuándo caducan. Por ejemplo, cuatro, que caducan a final del mes siguiente.', async () => {
      await abrirCajon(g, 'recuperaciones');
      await g.escribe(cajon(page).getByLabel(/Recuperaciones sin usar/), '4');
      await g.ir(cajon(page).getByLabel('Cuándo caduca una recuperación'));
    });
    await g.mientras('Hay además un interruptor para dar recuperaciones solas cada lunes, a quien canceló a tiempo la semana anterior. Lo dejamos apagado. Cerramos sin cambiar nada más.', async () => {
      await g.ir(cajon(page).getByRole('switch', { name: /Dar recuperaciones solas/ }));
      await cerrarCajon(g);
    });

    // ── Si cancela tarde o no viene ──
    g.momento('si-cancela-tarde-o-no-viene');
    await g.mientras('Si cancela tarde o no viene: un cargo fijo a la tarjeta guardada de la alumna, si tiene una. Esto mueve dinero de verdad, así que solo funciona con el cobro con tarjeta conectado y con la alumna habiendo aceptado esa condición. En esta demo lo explicamos sin activarlo.', async () => {
      await abrirCajon(g, 'si-cancela-tarde-o-no-viene');
    });
    await g.mientras('Se pone la cantidad en euros. Vacío o cero significa sin cargo, y es lo que viene de serie. Cerramos.', async () => {
      await g.ir(cajon(page).getByLabel(/Cargo por cancelar tarde/));
      await cerrarCajon(g);
    });

    // ── Asistencia y acceso ──
    g.momento('asistencia');
    await g.mientras('Asistencia y acceso. Pasar lista te deja marcar quién vino. Si lo apagas, toda reserva confirmada cuenta como asistida. El control de acceso con QR da a cada alumna un QR en su app para escanear al llegar, y confirmar asistencia pide un sí a quien suele faltar.', async () => {
      await abrirCajon(g, 'asistencia');
      await g.ir(cajon(page).getByRole('switch', { name: /Pasar lista/ }));
    });
    await g.mientras('Dejamos pasar lista encendido y cerramos.', async () => {
      await cerrarCajon(g);
    });

    // ── Si se cancela una clase entera ──
    g.momento('si-se-cancela-una-clase');
    await g.mientras('Si se cancela una clase entera: si tus alumnas recuperan la sesión cuando una clase no sale, y cuántas hacen falta para que salga. Ponemos un mínimo de tres alumnas: si dos horas antes no hay tres, la clase se cancela sola y avisa a quien estuviera apuntada.', async () => {
      await abrirCajon(g, 'si-se-cancela-una-clase');
      await g.escribe(cajon(page).getByLabel(/Mínimo de alumnas/), '3');
    });
    await guardarYCerrar(g);

    // ── Clases fijas ──
    g.momento('si-se-queda-sin-cuota');
    await g.mientras('Ahora las clases fijas, que son las que una alumna tiene reservadas cada semana. Si se queda sin cuota, puedes dejarle sus clases como hasta ahora, mantenerlas sin penalización, o liberarlas todas. Dejamos la primera.', async () => {
      await abrirCajon(g, 'si-se-queda-sin-cuota');
      await g.ir(cajon(page).getByRole('radio', { name: /Como hasta ahora/ }));
    });
    await g.mientras('Cerramos sin cambios.', async () => {
      await cerrarCajon(g);
    });

    g.momento('plaza-fija-desde-la-app');
    await g.mientras('Peticiones desde su app. Tus alumnas pueden pedir una clase fija o una pausa desde su app. Tú decides si las apruebas a mano, con un aviso, o si se dan solas cuando cumplen tus reglas.', async () => {
      await abrirCajon(g, 'plaza-fija-desde-la-app');
      await g.ir(cajon(page).getByRole('radio', { name: /La apruebo yo/ }));
    });
    await g.mientras('Dejamos que las apruebes tú. Así nadie se queda con un sitio fijo sin que lo sepas.', async () => {
      await cerrarCajon(g);
    });

    g.momento('si-pausa-su-plaza-fija');
    await g.mientras('Si pausa su clase fija: durante la pausa, su sitio puede quedar libre para otra alumna o conservarse para ella. Es una decisión de cada estudio, y se cuenta en la pantalla con sus consecuencias.', async () => {
      await abrirCajon(g, 'si-pausa-su-plaza-fija');
      await g.ir(cajon(page).getByRole('switch', { name: /Su sitio queda libre/ }));
    });
    await g.mientras('Lo dejamos como está y cerramos.', async () => {
      await cerrarCajon(g);
    });

    // ── Avisos a las alumnas ──
    g.momento('ajuste-avisar-alumnas');
    await g.mientras('Por último, avisos a las alumnas. Si por una baja una clase cambia de instructora, se mueve o se cancela, Tentare avisa a sus alumnas por email y en su app. Este interruptor se guarda al tocarlo, sin botón de guardar.', async () => {
      await g.clic(interruptor(page, 'Avisos a las alumnas'));
    });
    await g.dice('Quedan dos filas más en esta pantalla que llevan a otros sitios: las clases por semana, que se ponen en cada plan desde Paquetes, y los recordatorios, que se cambian en Avisos en el móvil, en el capítulo de comunicación.');
  },
};
