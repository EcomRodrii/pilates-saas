import type { Capitulo } from './tipos.ts';
import { abrirCajon, abrirSeccion, cajon, guardarYCerrar } from './ayudas.ts';

export const motivacion: Capitulo = {
  id: 'motivacion',
  titulo: 'Motivación',
  frase: 'Premia la constancia de tus alumnas con créditos, logros y retos que ven en su app.',
  async guion(g, pos) {
    const { page } = g;
    await abrirSeccion(g, pos, 'motivacion', 'Motivación', 'Créditos, recompensas, logros y retos.',
      'Séptimo capítulo: motivación. Es la forma de premiar la constancia de tus alumnas con créditos, logros y retos que ven en su app. Está disponible desde el plan Estudio.');

    g.momento('reglas');
    await g.mientras('Primero, cómo funcionan tus créditos. Les pones el nombre que quieras, decides cuánto duran y cuántas clases por semana mantienen la racha de una alumna. Les llamamos Soles.', async () => {
      await abrirCajon(g, 'reglas');
      await g.escribe(cajon(page).getByLabel('Nombre de tus créditos'), 'Soles');
    });
    await g.mientras('Duran doce meses, y para mantener la racha hay que ir dos veces por semana. Guardamos.', async () => {
      await g.escribe(cajon(page).getByLabel('Meses que duran'), '12');
      await g.escribe(cajon(page).getByLabel('Clases por semana para mantener la racha'), '2');
      await guardarYCerrar(g);
    });

    g.momento('creditos-por-accion');
    await g.mientras('Créditos por acción. Cuántos créditos gana una alumna con cada cosa: asistir a clase, renovar su plan, traer a un amigo, completar una semana, su primera reserva, cumplir su objetivo del mes o comprar en el estudio. Cada una se enciende o se apaga.', async () => {
      await abrirCajon(g, 'creditos-por-accion');
      await g.ir(cajon(page).getByRole('switch', { name: /Asistir a clase/ }));
    });
    await g.mientras('Encendemos asistir a clase, que da diez créditos, y renovar el plan, con cuarenta. Cuidado con regalar demasiado: si todo da créditos, ninguno vale nada.', async () => {
      await g.clic(cajon(page).getByRole('switch', { name: /Asistir a clase/ }));
      await g.clic(cajon(page).getByRole('switch', { name: /Renovar plan/ }));
    });
    await g.mientras('Guardamos.', async () => {
      await guardarYCerrar(g);
    });

    // ── Recompensas, logros, niveles y retos ──
    g.momento('recompensas');
    await g.mientras('Debajo, en el mismo orden en que se piensa: en qué se gastan, qué desbloquean, hasta dónde suben y los retos con fecha. A la derecha, lo que ve tu alumna en su app.', async () => {
      await g.ir(page.locator('#recompensas'));
    });
    await g.mientras('Las recompensas son lo que tus alumnas pueden canjear con sus créditos. Creamos una: una clase suelta gratis, por seiscientos créditos. Eliges qué pasa al canjearla: normalmente, te llega un aviso y la entregas tú.', async () => {
      await g.clic(page.getByRole('button', { name: 'Nueva recompensa' }));
      await g.escribe(page.getByLabel('Nombre', { exact: true }), 'Clase suelta gratis');
      await g.escribe(page.getByLabel('Coste en créditos'), '600');
    });
    await g.mientras('Se puede limitar el stock y el máximo por alumna, o dejarla disponible solo entre dos fechas. Guardamos.', async () => {
      await g.clic(page.getByRole('button', { name: 'Guardar', exact: true }));
      await g.pausa(900);
    });
    g.momento('canjes');
    await g.dice('Cuando una alumna canjea una recompensa, arriba de esta pantalla aparece un aviso con los canjes por entregar, que también ves en tu Resumen.');

    g.momento('logros');
    await g.mientras('Los logros se desbloquean al llegar a una cifra que eliges, como diez clases. Tentare te propone unos cuantos de ejemplo, que puedes cargar con un clic y luego editar, o crear los tuyos.', async () => {
      await g.clic(page.getByRole('button', { name: 'Cargar sugeridos' }).first());
      await g.pausa(900);
    });

    g.momento('niveles');
    await g.mientras('Los niveles suben con los créditos ganados en total. Canjear nunca hace bajar de nivel. Creamos el primero, Bronce, que se tiene desde el principio.', async () => {
      await g.clic(page.getByRole('button', { name: 'Nuevo nivel' }));
      await g.escribe(page.getByLabel('Nombre', { exact: true }), 'Bronce');
      await g.clic(page.getByRole('button', { name: 'Guardar', exact: true }));
      await g.pausa(900);
    });

    g.momento('retos');
    await g.mientras('Los retos son objetivos con fecha de inicio y fin, y solo cuenta lo que pasa dentro de ese periodo. Por ejemplo, ir tres veces esta semana.', async () => {
      await g.clic(page.getByRole('button', { name: 'Nuevo reto' }));
      await g.escribe(page.getByLabel('Nombre', { exact: true }), 'Tres clases esta semana');
      await g.clic(page.getByRole('button', { name: 'Guardar', exact: true }));
      await g.pausa(900);
    });
  },
};
