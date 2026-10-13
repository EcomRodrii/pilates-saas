import type { Capitulo } from './tipos.ts';
import { abrirCajon, abrirSeccion, cajon, cerrarCajon, interruptor } from './ayudas.ts';

export const altas: Capitulo = {
  id: 'altas',
  titulo: 'Alta de alumnas',
  frase: 'Lo que acepta y rellena una alumna nueva, y qué datos guardas de cada una.',
  async guion(g, pos) {
    const { page } = g;
    await abrirSeccion(g, pos, 'altas', 'Alta de alumnas', 'Lo que acepta y rellena una alumna nueva.',
      'Quinto capítulo: el alta de alumnas. Qué acepta y qué rellena una alumna nueva, y qué datos guardas de cada una.');

    g.momento('contrato-y-privacidad');
    await g.mientras('Contrato y privacidad. Son los textos que acepta cada alumna al darse de alta. Se guarda qué aceptó, cuándo y con qué nombre. Vienen con los textos de Tentare, que cubren lo habitual.', async () => {
      await abrirCajon(g, 'contrato-y-privacidad');
      await g.ir(cajon(page).getByLabel('Política de privacidad'));
    });
    await g.mientras('Puedes dejarlos así o escribir los tuyos. Los dejamos como están y cerramos.', async () => {
      await g.ir(cajon(page).getByLabel('Términos y condiciones'));
      await cerrarCajon(g);
    });

    g.momento('compra-desde-tu-enlace');
    await g.mientras('Compra desde tu enlace. Si alguien que aún no es alumna compra un bono en tu página: ¿que se registre antes de pagar, o que pague directamente? Si se registra antes, acepta tus condiciones; si paga primero, se le piden después.', async () => {
      await abrirCajon(g, 'compra-desde-tu-enlace');
      await g.ir(cajon(page).getByRole('radio', { name: /Que se registre antes de pagar/ }));
    });
    await g.mientras('Elegimos que se registre antes de pagar: así el contrato ya está aceptado cuando entra el dinero.', async () => {
      await g.clic(cajon(page).getByRole('radio', { name: /Que se registre antes de pagar/ }));
      await cerrarCajon(g);
    });

    g.momento('datos-extra-de-la-ficha');
    await g.mientras('Datos extra de la ficha. Son preguntas tuyas, como su objetivo o cómo te conoció. Salen en el alta, en su ficha y, si quieres, en su app. Añadimos una: cómo nos ha conocido.', async () => {
      await abrirCajon(g, 'datos-extra-de-la-ficha');
      await g.escribe(cajon(page).getByLabel('Qué preguntas'), 'Cómo nos has conocido');
    });
    await g.mientras('El tipo de respuesta es texto, y puedes marcarla como obligatoria al dar de alta. Pulsamos añadir dato.', async () => {
      await g.clic(cajon(page).getByRole('button', { name: 'Añadir dato' }));
      await g.pausa(700);
    });
    await g.mientras('Ya está en la lista. Cerramos.', async () => {
      await cerrarCajon(g);
    });

    g.momento('preguntas-en-su-app');
    await g.mientras('Preguntar los datos extra en su app. Si lo enciendes, la alumna contesta tus preguntas en su app antes de reservar o comprar. Las obligatorias no se saltan. Se guarda al tocarlo.', async () => {
      await g.clic(interruptor(page, /Preguntar los datos extra/));
    });

    g.momento('valoracion-inicial');
    await g.mientras('Valoración inicial. Tus alumnas te cuentan qué buscan antes de sus primeras clases, y así llegas a la primera sesión sabiendo para qué vienen. También se guarda al tocarlo.', async () => {
      await g.clic(interruptor(page, /Valoración inicial/));
    });

    g.momento('cuestionario-de-salud');
    await g.mientras('Cuestionario de salud. Son preguntas de salud, como lesiones, que rellenáis tú o tus instructoras en la ficha de cada alumna. Ella no lo rellena. Añadimos una pregunta.', async () => {
      await abrirCajon(g, 'cuestionario-de-salud');
      await g.escribe(cajon(page).getByRole('textbox', { name: 'Pregunta', exact: true }), '¿Tienes alguna lesión o molestia?');
      await g.clic(cajon(page).getByRole('button', { name: 'Añadir pregunta' }));
      await g.pausa(700);
    });
    await g.mientras('Ya forma parte del cuestionario de todas tus alumnas. Cerramos.', async () => {
      await cerrarCajon(g);
    });
  },
};
