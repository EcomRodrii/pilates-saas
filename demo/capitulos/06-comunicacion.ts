import type { Capitulo } from './tipos.ts';
import { abrirCajon, abrirSeccion, cajon, cerrarCajon, guardarYCerrar, volverDeHerramienta } from './ayudas.ts';

export const comunicacion: Capitulo = {
  id: 'comunicacion',
  titulo: 'Cómo me comunico',
  frase: 'Los correos que Tentare envía sola a tus alumnas y los canales para escribirles.',
  async guion(g, pos) {
    const { page } = g;
    await abrirSeccion(g, pos, 'comunicacion', 'Cómo me comunico', 'Los correos y avisos que Tentare envía por ti.',
      'Sexto capítulo: cómo te comunicas. Los correos que Tentare envía sola a tus alumnas y los canales para escribirles.');

    // ── Correos automáticos ──
    g.momento('correos-automaticos');
    await g.mientras('Correos automáticos: bienvenida, reserva confirmada, recordatorio, cancelación… Cada uno se puede apagar o cambiar. Entramos a verlos.', async () => {
      await g.clic(page.locator('#fila-herramienta-correos-automaticos'));
      await page.getByRole('heading', { name: 'Correos automáticos', exact: true }).waitFor();
    });
    await g.mientras('Cada correo dice cuándo se envía y si va como viene de fábrica. El interruptor de la derecha lo apaga, y entonces Tentare deja de enviarlo. Abrimos el de reserva confirmada para personalizarlo.', async () => {
      await g.clic(page.getByRole('button', { name: /^Reserva confirmada/ }));
    });
    await g.mientras('Puedes cambiar solo el saludo, y Tentare lo viste con tu marca y tus colores; o escribir el correo entero tú. Cambiamos el saludo.', async () => {
      await g.clic(page.getByRole('button', { name: /Cambiar solo el saludo/ }));
      await g.escribe(page.getByLabel('Saludo'), 'Hola, ya tienes tu plaza en Estudio Aurora.');
    });
    await g.mientras('A la derecha ves cómo lo recibe tu alumna, con datos de ejemplo. Debajo hay opciones de foto, colores, botón y pie, y siempre puedes volver a como viene de fábrica. También puedes enviarte una prueba. Guardamos.', async () => {
      await g.ir(page.getByRole('button', { name: 'Dejarlo como viene de fábrica' }));
      await g.clic(page.getByRole('button', { name: 'Guardar', exact: true }));
      await g.pausa(900);
    });
    await volverDeHerramienta(g, 'Cómo me comunico');

    // ── Avisos en el móvil ──
    g.momento('avisos-del-movil');
    await g.mientras('Avisos en el móvil. Son los avisos que le llegan a cada alumna a su móvil: cuándo recibe el recordatorio de su clase y qué dice cada aviso, con tus palabras.', async () => {
      await g.clic(page.locator('#fila-herramienta-avisos-del-movil'));
      await page.getByRole('heading', { name: 'Avisos en el móvil', exact: true }).waitFor();
    });
    await g.mientras('Arriba eliges con cuánta antelación llega el primer recordatorio y el segundo, el de justo antes de la clase. Debajo hay un aviso por cada situación: reserva confirmada, plaza libre en la lista de espera, bono a punto de caducar y muchos más.', async () => {
      await g.ir(page.getByLabel('Primer recordatorio'));
      await g.ir(page.getByLabel('Segundo recordatorio'));
    });
    await g.mientras('Abrimos uno, el de reserva confirmada. Puedes cambiar el título y el texto, e insertar datos como el nombre de la clase o el día y la hora, con un contador de caracteres.', async () => {
      await g.clic(page.getByRole('button', { name: 'Editar «Reserva confirmada»' }));
      await g.ir(page.getByLabel(/^Texto \(/));
    });
    await g.mientras('Guardamos. Tienes también un botón para enviarte una prueba al móvil.', async () => {
      await g.clic(page.getByRole('button', { name: 'Guardar', exact: true }));
      await g.pausa(900);
    });
    await volverDeHerramienta(g, 'Cómo me comunico');

    // ── Remitente ──
    g.momento('integracion-resend');
    await g.mientras('Nombre y respuesta de tus correos. El nombre que ven tus alumnas como remitente y la dirección donde llegan sus respuestas. Ponemos el nombre del estudio.', async () => {
      await abrirCajon(g, 'integracion-resend');
      await g.escribe(cajon(page).getByLabel('Nombre que verán tus alumnas'), 'Estudio Aurora');
      await g.escribe(cajon(page).getByLabel('Email para respuestas'), 'hola@example.com');
    });
    await g.mientras('Así, cuando una alumna contesta a un correo, te llega a ti. Guardamos.', async () => {
      await guardarYCerrar(g);
    });

    // ── WhatsApp ──
    g.momento('integracion-whatsapp');
    await g.mientras('WhatsApp: recordatorios y avisos desde tu número de WhatsApp Business. Se conecta con un token de acceso de Meta, el identificador del número y las plantillas que Meta te apruebe. Son datos privados de cada estudio, así que aquí no escribimos ninguno.', async () => {
      await abrirCajon(g, 'integracion-whatsapp');
    });
    await g.mientras('Cuando conectes el tuyo, esta pantalla te dirá si funciona, si está sin probar o si falla. Cerramos.', async () => {
      await cerrarCajon(g);
    });

    await g.dice('Y al final hay una fila que lleva a Automatizaciones: lo que Tentare hace sola y las reglas que enciendes tú. Tiene su propia pantalla.');
  },
};
