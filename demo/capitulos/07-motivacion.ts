import type { Capitulo } from './tipos.ts';
import { abrirCajon, abrirSeccion, cajon, guardarYCerrar, volverDeHerramienta } from './ayudas.ts';

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
    await g.mientras('Las recompensas, los logros, los niveles y los retos viven en una pantalla propia. Entramos.', async () => {
      await g.clic(page.locator('#fila-herramienta-recompensas-y-logros'));
      await page.getByRole('heading', { name: 'Recompensas, logros y retos', exact: true }).waitFor();
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
    await g.dice('Los canjes pendientes son las recompensas que tus alumnas han pedido y que tienes que entregar. Aparecen aquí y en tu Resumen, para que no se queden olvidadas.');

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
    await volverDeHerramienta(g, 'Motivación');

    // ── Códigos de descuento ──
    g.momento('codigos-descuento');
    await g.mientras('Códigos de descuento. Códigos que tus alumnas usan al pagar, o que canjeas tú en el mostrador. Entramos y creamos uno de bienvenida.', async () => {
      await g.clic(page.locator('#fila-herramienta-codigos-descuento'));
      await page.getByRole('heading', { name: 'Códigos de descuento', exact: true }).first().waitFor();
      await g.clic(page.getByRole('button', { name: 'Nuevo código' }));
    });
    await g.mientras('El código se escribe en mayúsculas, eliges si descuenta un porcentaje o una cantidad fija, el valor y cuántas veces se puede usar. Diez por ciento, cincuenta usos.', async () => {
      await g.escribe(page.getByPlaceholder('CÓDIGO'), 'BIENVENIDA10');
      await g.escribe(page.getByPlaceholder('Valor'), '10');
      await g.escribe(page.getByPlaceholder('Usos máx'), '50');
      await g.clic(page.getByRole('button', { name: 'Crear código' }));
      await g.pausa(900);
    });
  },
};
