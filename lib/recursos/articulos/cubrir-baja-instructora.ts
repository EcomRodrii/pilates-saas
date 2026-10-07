import type { Articulo } from './tipos.ts';

// Rehecho el 7-oct-2026 a partir de la guía antigua del mismo nombre (TSX), que
// contaba el proceso con Tentare pero no decía nada de lo que pregunta quien
// busca esto: qué hacer esta noche, cuánto esperar a cada compañera, quién paga
// la baja médica y si se puede contratar a alguien. Mantiene la URL.
//
// La regla del margen por candidata (un tercio de lo que falta, entre 2 y 45
// minutos, recordatorio y después la siguiente) es la del motor de Tentare
// (lib/sustituciones/ventanas.ts): si cambia allí, cambia aquí.

const articulo: Articulo = {
  slug: 'cubrir-baja-instructora',
  titulo: 'Cómo cubrir la baja de una instructora: protocolo, plazos y lo que dice la ley',
  tituloSeo: 'Cómo cubrir la baja de una instructora de pilates',
  descripcion: 'Qué preparar antes de la primera baja, cuánto esperar a cada sustituta, qué decir a las alumnas y quién paga una baja médica en España.',
  resumen: 'El protocolo para cubrir una clase cuando una instructora no puede darla: lo que hay que tener preparado, el orden para avisar, cuánto esperar y lo que dice la Seguridad Social.',
  categoria: 'sustituciones',
  seccion: 'Sustituciones y equipo',
  publicado: '2026-07-01',
  actualizado: '2026-10-07',
  consultaPrincipal: 'cubrir baja instructora',
  consultas: [
    'sustituir a una instructora de pilates',
    'qué hacer si una profesora no puede dar la clase',
    'quién paga la baja de una monitora',
    'contrato de sustitución por baja',
    'buscar sustituta para una clase',
  ],
  respuesta:
    'Para cubrir la baja de una instructora sin pasar la noche al teléfono necesitas tres cosas preparadas antes de que pase: quién puede dar cada formato y a qué horas, en qué orden avisarlas y cuánto esperar a cada una antes de pasar a la siguiente. Si la baja es médica y la instructora es tu empleada, del día 4 al 15 le pagas tú el 60 % de su base reguladora, y puedes contratar a alguien con un contrato de sustitución.',
  entradilla:
    'Son las once de la noche y una instructora te escribe que mañana no puede dar la clase de las nueve. Cubrirla no debería depender de cuántas compañeras te contesten al WhatsApp. Este es el protocolo, desde lo que conviene tener preparado hasta lo que dice la Seguridad Social si la baja es médica.',
  secciones: [
    {
      id: 'el-problema',
      titulo: 'Por qué una baja se come la noche',
      bloques: [
        {
          t: 'p',
          texto: 'Cubrir una clase parece cosa de cinco minutos, pero casi nunca lo es. Lo difícil no es la baja, es todo lo que va detrás: saber quién puede dar esa clase en concreto, escribir a una, esperar, escribir a otra, cambiar el horario y avisar a las alumnas antes de que se presenten.',
        },
        {
          t: 'p',
          texto: 'Cada paso depende de ti y llega a la peor hora. Por eso lo que más tiempo ahorra no es avisar más rápido, sino tener decidido de antemano lo que siempre acabas improvisando.',
        },
      ],
    },
    {
      id: 'preparar-antes',
      titulo: 'Lo que tienes que tener preparado antes de la primera baja',
      bloques: [
        {
          t: 'lista',
          items: [
            '**Quién da cada formato.** No todas pueden dar reformer, suelo, prenatal o barre. Una tabla sencilla, instructora por formato, evita escribir a quien no puede.',
            '**Cuándo puede cada una.** Su disponibilidad semanal, sus vacaciones y las clases que ya tiene. Así no se le ofrece una clase que se pisa con otra suya.',
            '**El orden.** A quién avisar primero: quien mejor conoce a ese grupo, quien vive más cerca o quien menos horas lleva ese mes.',
            '**Un solo canal para avisar de la baja.** Si una avisa por WhatsApp, otra llama y otra lo dice en el grupo, alguna se pierde.',
            '**Lo que se le paga a la sustituta.** Que lo sepa antes de aceptar: si lo cobra como una clase suya o con un extra por avisar tarde.',
            '**El mensaje a las alumnas.** Escrito de antemano, en dos versiones: cambia la instructora o se cancela la clase.',
          ],
        },
      ],
    },
    {
      id: 'protocolo',
      titulo: 'El protocolo, paso a paso',
      bloques: [
        {
          t: 'pasos',
          items: [
            {
              titulo: 'Que avise cuanto antes y por el canal acordado',
              texto: 'Cada hora de margen cuenta. Pídele que avise en cuanto sepa que no puede, aunque sea de noche, y siempre por el mismo sitio.',
            },
            {
              titulo: 'Mira quién puede de verdad',
              texto: 'Las que dan ese formato, están libres a esa hora y no tienen otra clase que se pise. Ese es tu listado, en el orden que decidiste.',
            },
            {
              titulo: 'Avisa de una en una, con un plazo para contestar',
              texto: 'Escribir a todas a la vez parece más rápido, pero acaba con dos que dicen que sí y una que se queda mal. Una cada vez, con un plazo claro, y si no contesta, se lo recuerdas y pasas a la siguiente.',
            },
            {
              titulo: 'Si nadie puede, decide pronto',
              texto: 'Fija una hora límite para decidir: cambiar el formato con la instructora que haya, darla tú o cancelarla. Cancelar con tiempo molesta menos que una clase cancelada en la puerta.',
            },
            {
              titulo: 'Confírmalo por escrito y cambia el horario',
              texto: 'La sustituta tiene que saber la hora, la sala y cuántas alumnas hay apuntadas, y el horario tiene que decir quién da la clase.',
            },
            {
              titulo: 'Avisa a las alumnas apuntadas',
              texto: 'Que sepan quién da la clase o que se ha cancelado antes de salir de casa. Es el paso que más caro sale cuando falla.',
            },
            {
              titulo: 'Apunta las horas',
              texto: 'Para la nómina o para la factura de la sustituta, y para saber a fin de mes quién cubre más.',
            },
          ],
        },
      ],
    },
    {
      id: 'cuanto-esperar',
      titulo: 'Cuánto esperar a que conteste cada sustituta',
      bloques: [
        {
          t: 'p',
          texto: 'Un plazo fijo no sirve: media hora es muy poco para una clase de pasado mañana y demasiado para una que empieza dentro de una hora. La regla que seguimos en el motor de sustituciones de Tentare es dar a cada candidata **un tercio del tiempo que falta para la clase, con un mínimo de 2 minutos y un máximo de 45**. Si no contesta en ese plazo, se le recuerda; si en otro plazo igual sigue sin contestar, se pasa a la siguiente.',
        },
        {
          t: 'tabla',
          cabecera: ['Falta para la clase', 'Plazo para contestar', 'Hasta pasar a la siguiente'],
          filas: [
            ['24 horas', '45 min', '1 h 30 min'],
            ['6 horas', '45 min', '1 h 30 min'],
            ['2 horas', '40 min', '1 h 20 min'],
            ['1 hora', '20 min', '40 min'],
            ['30 minutos', '10 min', '20 min'],
          ],
          nota: 'El plazo es un tercio de lo que falta, con un mínimo de 2 y un máximo de 45 minutos; se vuelve a calcular con cada candidata. Así siempre queda margen para avisar a las alumnas.',
        },
      ],
    },
    {
      id: 'baja-medica',
      titulo: 'Si la baja es médica: quién paga y si puedes contratar a alguien',
      bloques: [
        {
          t: 'p',
          texto: 'Depende de si la instructora es tu empleada o trabaja como autónoma. Para una baja por enfermedad común, esto es lo que dice la Seguridad Social:',
        },
        {
          t: 'tabla',
          cabecera: ['Días de baja', 'Empleada del estudio', 'Instructora autónoma'],
          filas: [
            ['Del 1 al 3', 'Sin subsidio', 'Sin subsidio'],
            ['Del 4 al 15', '60 % de la base reguladora, que paga el estudio', '60 % de la base reguladora, que paga su mutua'],
            ['Del 16 al 20', '60 %, que paga el INSS o la mutua', '60 %, su mutua'],
            ['Del 21 en adelante', '75 %, que paga el INSS o la mutua', '75 %, su mutua'],
          ],
          nota: 'Seguridad Social, incapacidad temporal por enfermedad común (régimen general y autónomos), consultado el 7-oct-2026. La base reguladora es la base de cotización del mes anterior dividida entre sus días. Dura como máximo 365 días, prorrogables 180.',
        },
        {
          t: 'p',
          texto: 'Revisa también el convenio que aplicas y el contrato: si prevén un complemento sobre esas cifras, lo pagas tú. Una autónoma solo cobra si está al corriente de sus cuotas; el estudio no le paga nada por su baja, pero tampoco tiene un puesto que guardarle.',
        },
        {
          t: 'p',
          texto: 'Si la que se va de baja es tu empleada, puedes contratar a otra persona mientras dure con un **contrato de sustitución** (artículo 15.3 del Estatuto de los Trabajadores). No es obligatorio, pero si lo haces, el contrato tiene que decir el nombre de la persona a la que sustituye y el motivo, y puede empezar hasta 15 días antes para que se pasen el trabajo. Para clases sueltas, lo habitual es que las cubran las compañeras o una instructora autónoma que factura por clase. Para tu caso concreto, pregunta a tu gestoría.',
        },
        {
          t: 'p',
          texto: 'Cuánto se paga por hora a una instructora, contratada o autónoma, está en [cuánto cobra una instructora de pilates](/recursos/cuanto-cobra-una-instructora-de-pilates).',
        },
      ],
    },
    {
      id: 'avisar-alumnas',
      titulo: 'Qué decir a las alumnas',
      bloques: [
        {
          t: 'p',
          texto: 'Corto, pronto y con la decisión ya tomada. Dos mensajes que sirven tal cual:',
        },
        {
          t: 'nota',
          titulo: 'Si cambia la instructora',
          texto: 'Hola, mañana a las 9:00 la clase de reformer la da Lucía en lugar de Ana. Todo lo demás sigue igual. Si prefieres cancelar, puedes hacerlo sin perder la sesión hasta las 7:00.',
        },
        {
          t: 'nota',
          titulo: 'Si se cancela la clase',
          texto: 'Hola, sentimos tener que cancelar la clase de mañana a las 9:00. Te hemos devuelto la sesión y tienes plaza en la de las 19:00 si te viene bien.',
        },
        {
          t: 'p',
          texto: 'Lo de dejar cancelar sin perder la sesión cuando cambia la instructora es una decisión tuya, pero cuesta poco y evita la queja de quien venía por ella.',
        },
      ],
    },
    {
      id: 'no-depender',
      titulo: 'Que una baja no pare el estudio',
      bloques: [
        {
          t: 'p',
          texto: 'El mejor protocolo no salva un horario en el que una sola instructora da todo el reformer de la mañana. Si una baja te deja sin nadie que pueda dar un formato, el problema no es la noche de la baja: es que ese formato depende de una persona.',
        },
        {
          t: 'lista',
          items: [
            '**Al menos dos instructoras por formato.** Aunque la segunda dé solo una clase a la semana, ya conoce la sala y al grupo.',
            '**Que se roten las franjas.** Un grupo que solo ha tenido una instructora se va con ella.',
            '**Disponibilidad al día.** Una lista de quién puede cubrir que tiene seis meses no sirve de mucho.',
          ],
        },
      ],
    },
    {
      id: 'con-tentare',
      titulo: 'Cómo lo hace Tentare',
      bloques: [
        {
          t: 'p',
          texto: 'En Tentare, la instructora avisa desde la app del estudio o desde un enlace en el móvil, sin instalar nada. El sistema mira quién da ese formato, su disponibilidad, sus vacaciones y bajas y las clases que ya tiene, y te propone la candidata. En el modo asistido, el que viene puesto, no escribe a nadie hasta que das el visto bueno; después la avisa por correo, con un enlace para aceptar o rechazar, se lo recuerda con los plazos de arriba (también por WhatsApp si lo conectaste) y pasa a la siguiente si no contesta. En el modo autónomo (planes Estudio y Cadena) lo hace todo solo.',
        },
        {
          t: 'p',
          texto: 'Cuando una acepta, la clase se reasigna y las alumnas reciben el aviso por correo y en su app (viene encendido y se puede apagar). Si se acaban las candidatas, te avisa con las opciones: buscar otra vez, cambiar la clase o cancelarla avisando a las alumnas. Lo que no hace es reorganizar solas las clases ya programadas cuando apuntas unas vacaciones: te avisa de las que se quedan sin quien las dé. Todo está en [sustituciones](/funcionalidades/sustituciones).',
        },
        {
          t: 'producto',
          titulo: 'Que una baja no te cueste la noche',
          texto: 'Da de alta a tu equipo con lo que da y cuándo puede, y la próxima baja empieza con la candidata ya propuesta.',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Quién paga la baja médica de una instructora?',
      a: 'Si es empleada y la baja es por enfermedad común, los tres primeros días no hay subsidio; del 4 al 15 el estudio le paga el 60 % de su base reguladora, y desde el 16 lo paga el INSS o la mutua. Si es autónoma, cobra de su mutua desde el día 4 y el estudio no paga nada.',
    },
    {
      q: '¿Puedo contratar a alguien mientras una instructora está de baja?',
      a: 'Sí, con un contrato de sustitución que diga el nombre de la persona sustituida y el motivo (artículo 15.3 del Estatuto de los Trabajadores). Para clases sueltas, lo habitual es que las cubra una compañera o una instructora autónoma.',
    },
    {
      q: '¿Cuánto hay que esperar a que conteste una sustituta?',
      a: 'Depende de lo que falte para la clase. Una regla que funciona: un tercio del tiempo que queda, entre 2 y 45 minutos. Si no contesta, se le recuerda, y si sigue sin contestar en otro plazo igual, se pasa a la siguiente.',
    },
    {
      q: '¿Es mejor escribir a todas las instructoras a la vez?',
      a: 'Suele salir peor: dos dicen que sí y hay que decirle a una que ya no, o nadie contesta porque cada una cree que lo hará otra. Una a una, en un orden decidido de antemano y con un plazo, cubre la clase igual de rápido y sin malentendidos.',
    },
    {
      q: '¿Qué pasa si nadie puede cubrir la clase?',
      a: 'Decide pronto entre cambiar el formato, darla tú o cancelarla. Si la cancelas, devuelve la sesión a las alumnas apuntadas y ofréceles otra clase; cuanto antes lo sepan, menos molesta.',
    },
    {
      q: '¿Hay que pagar más a la sustituta por avisar tarde?',
      a: 'No hay una regla: lo decides tú. Lo importante es que lo sepa antes de aceptar. Un pequeño extra en las sustituciones de última hora hace que quieran cubrirlas.',
    },
  ],
  fuentes: [
    { titulo: 'Seguridad Social: incapacidad temporal por enfermedad común, cuantía', url: 'https://www.seg-social.es/wps/portal/wss/internet/Trabajadores/PrestacionesPensionesTrabajadores/10952/28362/28365', consultada: '2026-10-07' },
    { titulo: 'Seguridad Social: incapacidad temporal por enfermedad común, nacimiento y duración', url: 'https://www.seg-social.es/wps/portal/wss/internet/Trabajadores/PrestacionesPensionesTrabajadores/10952/28362/28368', consultada: '2026-10-07' },
    { titulo: 'Seguridad Social: incapacidad temporal por enfermedad común, pago', url: 'https://www.seg-social.es/wps/portal/wss/internet/Trabajadores/PrestacionesPensionesTrabajadores/10952/28362/28370', consultada: '2026-10-07' },
    { titulo: 'Seguridad Social: incapacidad temporal de los trabajadores autónomos', url: 'https://www.seg-social.es/wps/portal/wss/internet/Trabajadores/PrestacionesPensionesTrabajadores/10952/6109', consultada: '2026-10-07' },
    { titulo: 'BOE: Real Decreto Legislativo 2/2015, texto refundido de la Ley del Estatuto de los Trabajadores (art. 15)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-11430#a15', consultada: '2026-10-07' },
  ],
  relacionadas: [
    '/funcionalidades/sustituciones',
    '/recursos/cuanto-cobra-una-instructora-de-pilates',
    '/funcionalidades/gestion-de-instructoras',
    '/recursos/como-gestionar-un-estudio-de-pilates',
  ],
  cta: {
    titulo: 'La próxima baja, con la sustituta ya propuesta',
    texto: 'Prueba Tentare 7 días sin tarjeta: da de alta a tu equipo con sus formatos y su disponibilidad, y empieza en modo asistido, aprobando cada aviso.',
  },
  revision: [
    'Incapacidad temporal: páginas de la Seguridad Social, 7-oct-2026; hay una reforma de la «baja flexible» en negociación sin texto en el BOE: revisar cuando se publique.',
    'Plazo por candidata: lib/sustituciones/ventanas.ts (un tercio, entre 2 y 45 minutos); si cambia, cambiar la tabla.',
  ],
};

export default articulo;
