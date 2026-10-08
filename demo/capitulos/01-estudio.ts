import type { Capitulo } from './tipos.ts';
import { abrirCajon, abrirSeccion, cajon, esperarCajonCerrado, guardarYCerrar, volverDeHerramienta } from './ayudas.ts';

export const estudio: Capitulo = {
  id: 'estudio',
  titulo: 'Mi estudio',
  frase: 'Quién eres, dónde estás y cuándo abres: lo que ven tus alumnas y lo que usa la agenda.',
  async guion(g, pos) {
    const { page } = g;
    await abrirSeccion(g, pos, 'estudio', 'Mi estudio', 'Quién eres, dónde estás y cuándo abres.',
      'Empezamos por Mi estudio. Aquí decides quién eres, dónde estás y cuándo abres: es lo que ven tus alumnas y lo que usa la agenda. Lo vamos a configurar entero con un estudio de ejemplo, el Estudio Aurora.');

    await g.dice('Cada ajuste es una fila que te dice cómo está ahora mismo. Al tocarla se abre un cajón a la derecha con sus campos, y no se guarda nada hasta que pulsas Guardar.');

    // ── Nombre y dirección ──
    g.momento('nombre-y-direccion');
    await g.mientras('Primero, nombre y dirección. Salen en tu página de reservas y en tus correos, así que escríbelos tal y como quieres que te vean.', async () => {
      await abrirCajon(g, 'nombre-y-direccion');
    });
    await g.mientras('El nombre ya está puesto. Añadimos la dirección, la ciudad y el código postal.', async () => {
      await g.escribe(cajon(page).getByLabel('Dirección'), 'Calle Alameda 12');
      await g.escribe(cajon(page).getByLabel('Ciudad'), 'Sevilla');
      await g.escribe(cajon(page).getByLabel('Código postal'), '41001');
    });
    await g.mientras('La zona horaria ya viene bien, la de Madrid. Importa porque todas las horas de tus clases se calculan con ella. Guardamos.', async () => {
      await g.ir(cajon(page).getByLabel('Zona horaria'));
      await guardarYCerrar(g);
    });

    // ── Contacto ──
    g.momento('contacto');
    await g.mientras('Ahora el contacto: dónde te escriben o te llaman tus alumnas, y tu web. Ponemos un teléfono y la dirección de la web del estudio.', async () => {
      await abrirCajon(g, 'contacto');
      await g.escribe(cajon(page).getByLabel('Teléfono'), '600 000 000');
      await g.escribe(cajon(page).getByLabel('Web'), 'https://estudioaurora.example.com');
    });
    await g.mientras('El correo de contacto ya estaba. Guardamos.', async () => {
      await guardarYCerrar(g);
    });

    // ── Horario ──
    g.momento('horario');
    await g.mientras('El horario. Dice cuándo abres cada día, y la agenda lo usa para distinguir un día cerrado de un día abierto sin clases. Empezamos con el horario estándar, de ocho a diez de la noche.', async () => {
      await abrirCajon(g, 'horario');
      await g.clic(cajon(page).getByRole('button', { name: /Horario estándar/ }));
    });
    await g.mientras('Los sábados abrimos solo por la mañana, de nueve a dos, y los domingos cerramos. Cada día tiene su interruptor y sus horas, y un botón para copiar ese día a todos los demás.', async () => {
      await g.escribe(cajon(page).getByLabel('Abre el sábado'), '09:00');
      await g.escribe(cajon(page).getByLabel('Cierra el sábado'), '14:00');
      await g.clic(cajon(page).getByRole('switch', { name: 'Abierto el domingo' }));
    });
    await g.mientras('Guardamos el horario.', async () => {
      await guardarYCerrar(g);
    });

    // ── Cerrar el centro ──
    g.momento('cerrar-el-centro');
    await g.mientras('Cerrar el centro. Para vacaciones, un puente o una reforma: se cancelan las clases de esos días, y aquí ves y quitas los cierres que pusiste. Ponemos el de Navidad.', async () => {
      await abrirCajon(g, 'cerrar-el-centro');
      await g.escribe(cajon(page).getByLabel('Desde'), '2026-12-24');
      await g.escribe(cajon(page).getByLabel(/Hasta/), '2026-12-26');
      await g.escribe(cajon(page).getByLabel(/Motivo/), 'Navidad');
    });
    await g.mientras('Fíjate en el resumen: nadie podrá reservar esos días, se cancelan las clases avisando a quien tenía reserva, y los bonos de todas tus alumnas duran esos días más. Al guardar te pide confirmar, porque no se deshace solo.', async () => {
      await g.guarda();
      await g.pausa(1200);
    });
    await g.mientras('Confirmamos.', async () => {
      await g.clic(page.getByRole('button', { name: 'Sí, cerrar esos días' }));
      await esperarCajonCerrado(g);
    });
    await g.dice('La fila ya cuenta cuándo es el próximo cierre. Si cambias de idea, abres el cajón y lo quitas de la lista de cierres que vienen.');

    // ── Salas ──
    g.momento('salas');
    await g.mientras('Las salas. Cada sala tiene un aforo, y esa cifra es el tope de plazas de cada clase que se dé en ella. Sin al menos una sala no puedes programar clases. Entramos.', async () => {
      await g.clic(page.locator('#fila-herramienta-salas'));
      await page.getByRole('heading', { name: 'Salas', exact: true }).waitFor();
    });
    await g.mientras('Creamos la primera: la Sala Reformer, para ocho personas. El color distingue sus clases en el calendario.', async () => {
      await g.clic(page.getByRole('button', { name: 'Nueva sala' }));
      await g.escribe(page.getByLabel('Nombre de la sala'), 'Sala Reformer');
      await g.escribe(page.getByLabel('Capacidad (personas)'), '8');
      await g.clic(page.getByRole('button', { name: 'Crear sala' }));
    });
    await g.mientras('Y una segunda, la Sala Suelo, para doce personas.', async () => {
      await g.clic(page.getByRole('button', { name: 'Nueva sala' }));
      await g.escribe(page.getByLabel('Nombre de la sala'), 'Sala Suelo');
      await g.escribe(page.getByLabel('Capacidad (personas)'), '12');
      await g.clic(page.getByRole('button', { name: 'Crear sala' }));
    });
    await g.dice('Debajo está el registro de averías de máquina: si una máquina del Reformer se estropea, la marcas y el aforo real de las clases de esa sala baja mientras dure la avería. Volvemos a Mi estudio.');
    await volverDeHerramienta(g, 'Mi estudio');

    // ── Sedes y certificado ──
    await g.dice('Si tuvieras más de una sede, aquí aparecería una fila de Sedes para cambiarte de una a otra o añadir otra nueva. Como Estudio Aurora solo tiene una, no se muestra.');
    g.momento('certificado');
    await g.mientras('Por último, el certificado Tentare Verified Studio: un documento oficial y verificable de que tu estudio está al día con Tentare, para imprimir o compartir. Se genera con un botón desde aquí, cuando lo necesites.', async () => {
      await abrirCajon(g, 'certificado');
    });
    await g.mientras('Con esto, Mi estudio está listo. Cerramos el cajón y pasamos a lo que ofreces: tus clases.', async () => {
      await g.clic(cajon(page).getByRole('button', { name: 'Cerrar' }).first());
    });
  },
};
