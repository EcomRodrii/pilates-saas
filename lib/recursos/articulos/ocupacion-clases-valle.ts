import type { Articulo } from './tipos.ts';

// Rehecho el 7-oct-2026 a partir de la guía antigua del mismo nombre (TSX). La
// antigua decía que en ClassPass una clase valle cuesta «entre un 30 % y un 50 %
// menos en créditos» sin fuente que lo sostuviera; aquí solo va lo que ClassPass
// publica en su FAQ para estudios. Mantiene la URL y los enlaces que recibía
// (informes-y-rentabilidad la cita).
//
// Las cuentas usan los mismos números que precios-reformer-mat (escenario A de
// la calculadora de rentabilidad y la mediana de la cuota de una clase semanal
// en 32 estudios). Si cambian allí, cambian aquí.

const articulo: Articulo = {
  slug: 'ocupacion-clases-valle',
  titulo: 'Clases valle: cómo llenar las franjas flojas de tu estudio (y cuándo quitarlas)',
  tituloSeo: 'Clases valle: cómo llenar las franjas flojas de tu estudio',
  descripcion: 'Cuántas alumnas necesita una clase para no perder dinero, por qué fallan las franjas flojas y ocho formas de llenarlas antes de bajar el precio.',
  resumen: 'La cuenta para saber si una clase valle te cuesta dinero, cómo averiguar por qué no se llena y qué hacer con ella: cambiarla, avisar a quien puede venir, ponerle precio de franja o quitarla.',
  categoria: 'rentabilidad',
  seccion: 'Rentabilidad',
  publicado: '2026-08-06',
  actualizado: '2026-10-07',
  consultaPrincipal: 'clases valle',
  consultas: [
    'cómo llenar clases a media mañana',
    'subir la ocupación de un estudio de pilates',
    'clases con pocas alumnas qué hacer',
    'cuántas alumnas necesita una clase para ser rentable',
    'precio por franja horaria en clases',
  ],
  respuesta:
    'Una clase valle es una franja que se queda medio vacía casi todas las semanas, normalmente a media mañana o a primera hora de la tarde. Se llena antes cambiándola que bajándole el precio: primero averigua quién podría venir a esa hora, después prueba otro formato, otra hora o fusionarla con otra, y solo al final un precio distinto para esa franja. Con los costes de nuestro ejemplo, un reformer necesita 2 alumnas para pagar a la instructora y 4 para cubrir todo lo que cuesta.',
  entradilla:
    'Todo estudio tiene una clase que nunca se llena. La sala, la luz y la instructora cuestan lo mismo con dos alumnas que con seis, así que esa franja o se llena o se cambia. Aquí está la cuenta para saber cuánto te cuesta, cómo averiguar por qué falla y qué hacer con ella antes de tocar el precio.',
  secciones: [
    {
      id: 'cuanto-cuesta',
      titulo: 'Cuántas alumnas necesita una clase para no perder dinero',
      bloques: [
        {
          t: 'p',
          texto: 'Hay dos líneas, y conviene no mezclarlas. La primera es **lo que cuesta dar la clase**: lo que le pagas a la instructora por darla. Si quitas la clase, eso te lo ahorras; el alquiler lo pagas igual. La segunda es **todo lo que cuesta**: la instructora más la parte del local y del resto de gastos que le toca a esa hora.',
        },
        {
          t: 'tabla',
          cabecera: ['', 'Reformer (6 máquinas)', 'Suelo (12 esterillas)'],
          filas: [
            ['Precio por sesión (cuota de 1 clase a la semana)', '18,75 € (15,50 € sin IVA)', '13,75 € (11,36 € sin IVA)'],
            ['Alumnas para pagar a la instructora (25 €)', '2', '3'],
            ['Alumnas para cubrir todo su coste', '4 (48,11 €)', '4 (43,46 €)'],
            ['Ocupación para cubrir todo su coste', '67 %', '33 %'],
          ],
          nota: 'Costes del escenario A de la calculadora de rentabilidad (25 € de instructora por clase, 2.400 € de local, 30 clases a la semana) y mediana de la cuota de una clase semanal en 32 estudios españoles (25-sep-2026). Ingresos sin IVA, al 21 %. Cambia los números por los tuyos.',
        },
        {
          t: 'p',
          texto: 'Con esas dos líneas, cada clase cae en uno de tres grupos:',
        },
        {
          t: 'lista',
          items: [
            '**Por debajo de la primera línea**, la clase no paga ni a la instructora: cada semana que sigue igual te cuesta dinero. Cambiarla o quitarla.',
            '**Entre las dos líneas**, paga a la instructora y ayuda con el alquiler, aunque no lo cubra entero. Quitarla te haría perder ese poco. Es la que hay que llenar.',
            '**Por encima de la segunda**, deja beneficio. No es una clase valle, aunque no se llene.',
          ],
        },
        {
          t: 'p',
          texto: 'Un matiz importante: si quien llena la clase valle es una alumna con cuota que antes venía a las 19:00, no ingresas más, solo cambias su plaza de hora. Eso merece la pena si la de las 19:00 tiene lista de espera, porque liberas un sitio que otra va a pagar. Si no la tiene, has movido a una alumna sin ganar nada.',
        },
      ],
    },
    {
      id: 'por-que-falla',
      titulo: 'Antes de tocar nada: por qué esa franja no se llena',
      bloques: [
        {
          t: 'p',
          texto: 'Una franja floja casi nunca lo es por el precio. Suele ser una de estas cosas, y cada una se arregla de una forma:',
        },
        {
          t: 'tabla',
          cabecera: ['Lo que pasa', 'Cómo se nota', 'Qué probar'],
          filas: [
            ['A esa hora tu público trabaja', 'Las de mañana y las de tarde son siempre las mismas alumnas', 'Un formato para quien sí está libre a esa hora'],
            ['El formato no encaja', 'Llena en otro horario, pero no en este', 'Cambiar el tipo de clase, no la hora'],
            ['La hora es casi buena', 'Llegan justas o se van antes de acabar', 'Moverla media hora o acortarla'],
            ['Nadie sabe que existe', 'Solo reservan las de siempre', 'Avisar a quien puede venir'],
            ['Hay dos clases flojas seguidas', 'Cada una con tres alumnas', 'Fusionarlas en una'],
          ],
          nota: 'Situaciones habituales; para saber cuál es la tuya, mira quién reserva esa franja y quién reserva las de al lado.',
        },
        {
          t: 'p',
          texto: 'Los datos de fuera ayudan a no culparte de lo que es normal. En el informe de Xplor Mariana Tek sobre 236 estudios boutique del noreste de Estados Unidos y Canadá (junio de 2023 a mayo de 2025), las clases con más asistencia empiezan entre las 17:00 y las 18:00, después entre las 19:00 y las 20:00 y después entre las 6:00 y las 7:00. La hora con menos asistencia fue las 14:00. Y según ClassPass, el 85 % de las clases de fitness de los estudios que trabajan con ella no se llenan.',
        },
      ],
    },
    {
      id: 'ocho-formas',
      titulo: 'Ocho formas de llenar una clase valle, de menos a más riesgo',
      bloques: [
        {
          t: 'pasos',
          items: [
            {
              titulo: 'Avisa a quien puede venir',
              texto: 'No a toda tu base: a quien tiene cuota o bono que le sirve para esa clase y ya ha venido alguna vez a esa hora o al lado. Un aviso a diez personas que pueden reservar funciona mejor que uno a doscientas que no.',
            },
            {
              titulo: 'Cambia el formato para el público de esa hora',
              texto: 'A media mañana hay quien acaba de dejar a los niños en el colegio, quien trabaja por turnos, jubiladas o embarazadas. Una clase de espalda, de suelo para mayores o de embarazo y posparto encaja mejor que la misma clase de las 19:00.',
            },
            {
              titulo: 'Muévela media hora o una hora',
              texto: 'A veces la franja casi funciona: a las 9:30 en lugar de a las 9:00 llegan quienes antes llegaban tarde. Cambia una cosa cada vez, para saber qué funcionó.',
            },
            {
              titulo: 'Acórtala',
              texto: 'Una clase de 45 minutos a mediodía cabe en la pausa para comer; una de una hora, no.',
            },
            {
              titulo: 'Fusiona dos clases flojas',
              texto: 'Dos clases con tres alumnas cada una son una clase con seis y una instructora libre para otra cosa.',
            },
            {
              titulo: 'Ofrécela como clase de prueba',
              texto: 'Si das una primera clase gratis o con precio especial, que sea en la franja que tiene sitio. Quien prueba encuentra plaza y tú no quitas plazas en hora punta.',
            },
            {
              titulo: 'Ponle precio de franja',
              texto: 'Una cuota o un bono solo de mañanas, por ejemplo, de lunes a viernes antes de las 16:00. Mira la sección de abajo antes de hacerlo.',
            },
            {
              titulo: 'Plataformas como ClassPass',
              texto: 'Te traen alumnas nuevas a las plazas que sobran, pero suelen pagar por visita menos que tu precio directo, y quien viene por la plataforma no siempre se queda. Úsalas para las plazas que, si no, se quedarían vacías.',
            },
          ],
        },
      ],
    },
    {
      id: 'precio-de-franja',
      titulo: 'Bajar el precio: solo de la franja, y con suelo',
      bloques: [
        {
          t: 'p',
          texto: 'ClassPass lleva años haciendo precios por demanda. Según su propia FAQ para estudios, su herramienta SmartRate cambia cuántos créditos cuesta una clase según lo que ha pasado otras semanas y lo llena que va esa clase y lo que falta para que empiece, y cada estudio tiene un precio mínimo confidencial, que es un porcentaje de su precio directo. ClassPass dice que en 2024 los estudios de Estados Unidos que la usaban llenaron un 14 % más sus clases que los que no.',
        },
        {
          t: 'p',
          texto: 'De ahí salen dos reglas para tu estudio, sin necesidad de ninguna plataforma:',
        },
        {
          t: 'lista',
          items: [
            '**El descuento va en la franja, no en la marca.** Una cuota de mañanas más barata no rebaja tu precio: es otro producto, con sus horarios. Un descuento del 30 % en todo, sí.',
            '**Siempre con un precio mínimo.** El suelo es lo que te cuesta dar la clase dividido entre las alumnas que vienen de verdad: con 25 € de instructora y tres alumnas, 8,33 € por plaza sin IVA, unos 10,08 € con IVA. Por debajo, cada alumna más te cuesta dinero.',
          ],
        },
        {
          t: 'p',
          texto: 'Antes de lanzarla, comprueba que no le quita sitio a una cuota más cara: si la cuota de mañanas sirve también para la clase de las 15:30, que se llena, alguien dejará la cuota normal. Puedes comparar precios por sesión en la [calculadora de bonos](/recursos/bonos-de-pilates).',
        },
      ],
    },
    {
      id: 'medir',
      titulo: 'Cómo saber si ha funcionado (y cuándo quitar la clase)',
      bloques: [
        {
          t: 'pasos',
          items: [
            {
              titulo: 'Apunta cómo estaba',
              texto: 'La ocupación media de esa franja en las últimas seis u ocho semanas y quién venía.',
            },
            {
              titulo: 'Cambia una sola cosa',
              texto: 'El formato, la hora o el aviso, no todo a la vez. Si cambias tres, no sabrás cuál ha funcionado.',
            },
            {
              titulo: 'Dale de cuatro a seis semanas',
              texto: 'Una semana buena o mala no dice nada; un mes y medio, sí. Avisa a tus alumnas del cambio y dales tiempo a reorganizarse.',
            },
            {
              titulo: 'Mira de dónde viene la gente',
              texto: 'Si son alumnas nuevas o que antes no venían, ingresas más. Si son las de otra hora, solo has movido plazas.',
            },
            {
              titulo: 'Decide con la tabla de arriba',
              texto: 'Si tras dos cambios sigue por debajo de lo que cuesta darla, quítala o fusiónala. Mantener una clase que pierde dinero «por si acaso» le quita tiempo a la instructora para dar otra que sí se llena.',
            },
          ],
        },
      ],
    },
    {
      id: 'con-tentare',
      titulo: 'Cómo verlo en Tentare',
      bloques: [
        {
          t: 'p',
          texto: 'En los informes de Tentare tienes la ocupación por tipo de clase, que es donde se ven las franjas que salen medio vacías todas las semanas, y el margen de cada clase sobre lo que cobra la instructora, ordenado de peor a mejor: es la primera línea de la tabla de arriba, calculada con lo que paga de verdad cada alumna según su cuota o su bono. Lo explica [informes y rentabilidad](/funcionalidades/informes-y-rentabilidad).',
        },
        {
          t: 'p',
          texto: 'Y en la agenda del día, cada clase con plazas libres tiene un botón, «Rellenar hueco», que te enseña a quién tiene sentido avisar: primero la lista de espera y después las alumnas con bono o cuota para esa clase que ya han venido antes y aceptaron recibir avisos. Tú eliges a quién, y sale por WhatsApp si lo tienes conectado o por correo.',
        },
        {
          t: 'producto',
          titulo: 'Saber qué franja te cuesta dinero, sin hojas de cálculo',
          texto: 'Pon las tarifas de tu equipo y mira el margen de cada clase sobre lo que cobra la instructora, ordenado por la peor.',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Qué es una clase valle?',
      a: 'La que se queda medio vacía casi todas las semanas, normalmente a media mañana o a primera hora de la tarde. No es una clase mala: es una hora en la que tu público no está libre o un formato que no encaja con quien sí lo está.',
    },
    {
      q: '¿Cuántas alumnas necesita una clase de pilates para ser rentable?',
      a: 'Depende de tus costes y de tu precio. Con 25 € de instructora, 18,75 € por sesión y los gastos de nuestro ejemplo, una clase de reformer necesita 2 alumnas para pagar a la instructora y 4 para cubrir todo su coste. Pon tus números en la calculadora de rentabilidad.',
    },
    {
      q: '¿Bajar el precio de una clase valle devalúa el estudio?',
      a: 'Un descuento en todo, sí. Una cuota o un bono solo para esa franja, no: es otro producto, con sus horarios, y tu precio normal sigue siendo la referencia. Pon siempre un precio mínimo que cubra lo que cuesta dar la clase.',
    },
    {
      q: '¿Cuándo hay que quitar una clase?',
      a: 'Cuando, después de cambiar el formato o la hora y darle cuatro a seis semanas, sigue sin pagar a la instructora. Mientras pague a la instructora y ayude con el alquiler, quitarla te hace perder dinero.',
    },
    {
      q: '¿Sirve ClassPass para llenar las clases valle?',
      a: 'Puede traerte alumnas nuevas a plazas que se quedarían vacías, pero suele pagar por visita menos que tu precio directo. Úsalo para las plazas que sobran y cuida que no sustituya a alumnas que pagarían el precio normal.',
    },
    {
      q: '¿Qué horario funciona peor en un estudio?',
      a: 'En el informe de Xplor Mariana Tek sobre 236 estudios de Estados Unidos y Canadá, la hora con menos asistencia fue las 14:00, y las mejores, de 17:00 a 18:00. En tu estudio puede ser otra: míralo en tus reservas por franja.',
    },
  ],
  fuentes: [
    { titulo: 'ClassPass para estudios asociados: preguntas frecuentes (SmartRate, SmartSpot y ocupación)', url: 'https://classpass.com/partners/faqs', consultada: '2026-10-07' },
    { titulo: 'Xplor Mariana Tek: Trends in Boutique Fitness, Northeast Metro Region (236 estudios, junio de 2023 a mayo de 2025)', url: 'https://www.marianatek.com/resources/northeast-regional-data-report/', consultada: '2026-10-07' },
  ],
  relacionadas: [
    '/recursos/rentabilidad-estudio-de-pilates',
    '/recursos/precios-reformer-mat',
    '/funcionalidades/informes-y-rentabilidad',
    '/recursos/bonos-de-pilates',
  ],
  cta: {
    titulo: 'Mira el margen de cada clase antes de cambiar el horario',
    texto: 'Prueba Tentare 7 días sin tarjeta: pon las tarifas de tu equipo, mira la ocupación por franja y avisa solo a quien puede venir.',
  },
  revision: [
    'Costes y precios: escenario A de rentabilidad-estudio-de-pilates y mediana de cuotas de precio-clase-de-pilates (25-sep-2026); si cambian, rehacer la tabla de las dos líneas.',
    'Cifras de ClassPass (85 %, 14 %): su FAQ para estudios, 7-oct-2026; son datos suyos y de Estados Unidos.',
  ],
};

export default articulo;
