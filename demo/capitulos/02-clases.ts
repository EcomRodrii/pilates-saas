import type { Capitulo } from './tipos.ts';
import { abrirSeccion, volverDeHerramienta } from './ayudas.ts';

export const clases: Capitulo = {
  id: 'clases',
  titulo: 'Mis clases y citas',
  frase: 'Lo que ofreces: los tipos de clase que programas en la agenda y las citas individuales.',
  async guion(g, pos) {
    const { page } = g;
    await abrirSeccion(g, pos, 'clases', 'Mis clases y citas', 'Lo que ofreces: tus tipos de clase y tus citas individuales.',
      'Segundo capítulo: Mis clases y citas. Aquí defines lo que ofreces: los tipos de clase que programas en la agenda y las citas individuales.');

    // ── Tipos de clase ──
    g.momento('tipos-de-clase');
    await g.mientras('Los tipos de clase son tus tipos de sesión: Reformer, Suelo, Embarazadas… Cada uno lleva su nombre, su duración, sus plazas y, si quieres, sus propias reglas de reserva. Entramos.', async () => {
      await g.clic(page.locator('#fila-herramienta-tipos-de-clase'));
      await page.getByRole('heading', { name: 'Tipos de clase', exact: true }).waitFor();
    });
    await g.mientras('Creamos el Reformer. Le ponemos nombre, elegimos cincuenta minutos de duración y ocho plazas por defecto, que es lo que caben en la Sala Reformer.', async () => {
      await g.clic(page.getByRole('button', { name: 'Nuevo tipo de clase' }));
      await g.escribe(page.getByLabel('Nombre de la clase'), 'Reformer');
      await g.clic(page.getByRole('button', { name: '50 min' }));
      await g.escribe(page.getByLabel('Plazas por defecto'), '8');
    });
    await g.mientras('Más abajo hay opciones avanzadas. Por ejemplo, las reservas: un tipo de clase puede cambiar las reglas del estudio solo para él. Lo normal es dejarlas como el resto del estudio, y eso es lo que haremos.', async () => {
      await g.clic(page.getByRole('button', { name: /^Reservas/ }));
      await g.pausa(1200);
      await g.clic(page.getByRole('button', { name: /^Reservas/ }).first());
    });
    await g.mientras('Guardamos el Reformer.', async () => {
      await g.clic(page.getByRole('button', { name: 'Crear tipo de clase' }));
      await g.pausa(900);
    });
    await g.mientras('Ahora el Suelo, de cincuenta minutos y doce plazas.', async () => {
      await g.clic(page.getByRole('button', { name: 'Nuevo tipo de clase' }));
      await g.escribe(page.getByLabel('Nombre de la clase'), 'Suelo');
      await g.clic(page.getByRole('button', { name: '50 min' }));
      await g.escribe(page.getByLabel('Plazas por defecto'), '12');
      await g.clic(page.getByRole('button', { name: 'Crear tipo de clase' }));
      await g.pausa(900);
    });
    await volverDeHerramienta(g, 'Mis clases y citas');

    // ── Servicios de cita ──
    g.momento('servicios-de-cita');
    await g.mientras('Los servicios de cita son sesiones individuales, como una clase privada o una valoración. Llevan precio, así que esta parte es solo de la propietaria. Creamos una clase privada de una hora.', async () => {
      await g.clic(page.getByRole('button', { name: 'Nuevo servicio' }));
      await g.escribe(page.getByLabel('Nombre del servicio'), 'Clase privada');
      await g.escribe(page.getByLabel('Precio (€, opcional)'), '45');
    });
    await g.mientras('Este interruptor, que viene encendido, hace que tus alumnas puedan reservarla solas: sale en tu página de reservas y en su app. Lo dejamos así y creamos el servicio.', async () => {
      await g.ir(page.getByRole('switch', { name: 'Tus alumnas pueden reservarla solas' }));
      await g.clic(page.getByRole('button', { name: 'Crear servicio' }));
      await g.pausa(900);
    });

    // ── Horario de citas ──
    g.momento('horario-de-citas');
    await g.mientras('El horario de citas dice en qué horas acepta citas cada instructora. Los huecos que se pueden reservar se calculan sobre estas franjas, restando las clases y las citas que ya tiene. Elegimos a Cloe y le damos de lunes a viernes por la mañana.', async () => {
      await g.clic(page.getByRole('button', { name: 'Franja' }).first());
      await g.escribe(page.getByLabel('Empieza, Lunes'), '09:00');
      await g.escribe(page.getByLabel('Termina, Lunes'), '13:00');
    });
    await g.mientras('Con el botón de copiar el lunes a lunes a viernes no hay que repetirlo cuatro veces. Guardamos el horario.', async () => {
      await g.clic(page.getByRole('button', { name: /Copiar lunes a L/ }));
      await g.clic(page.getByRole('button', { name: 'Guardar', exact: true }));
      await g.pausa(900);
    });
  },
};
