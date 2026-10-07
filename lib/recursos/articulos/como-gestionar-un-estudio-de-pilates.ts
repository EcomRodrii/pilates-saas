import type { Articulo } from './tipos.ts';

// Pilar del clúster «gestión» (7-oct-2026). Las cifras salen de los artículos de
// /recursos que ya las publican con su fuente (precios y bonos de 32 estudios,
// rentabilidad, instructoras, IVA, política de cancelación), y se repiten aquí
// con la misma fuente. Responde a «cómo gestionar un estudio de pilates»; la
// búsqueda comercial («software de gestión…») es de la home.

const articulo: Articulo = {
  slug: 'como-gestionar-un-estudio-de-pilates',
  titulo: 'Cómo gestionar un estudio de Pilates: los cinco sistemas y la rutina semanal que lo sostienen',
  tituloSeo: 'Cómo gestionar un estudio de Pilates: el sistema completo',
  descripcion: 'Cómo gestionar un estudio de Pilates sin vivir pegada al móvil: horario y aforo, reservas, bonos y cobros, equipo y los números que miras cada semana.',
  resumen: 'Los cinco sistemas que mantienen un estudio de Pilates en marcha (horario, reservas, cobros, equipo y números), con cifras de estudios españoles y una rutina semanal de media hora.',
  categoria: 'operacion',
  seccion: 'Operación',
  publicado: '2026-10-07',
  consultaPrincipal: 'cómo gestionar un estudio de pilates',
  consultas: [
    'gestión de un estudio de pilates',
    'cómo organizar un estudio de pilates',
    'cómo administrar un centro de pilates',
    'gestión de centros de pilates',
    'cómo llevar las reservas de un estudio de pilates',
    'qué hay que controlar en un estudio de pilates',
  ],
  respuesta:
    'Gestionar un estudio de Pilates es mantener cinco sistemas en marcha a la vez: el horario y el aforo de cada clase, las reservas con su política de cancelación y su lista de espera, la venta y el cobro de bonos y cuotas, el equipo de instructoras con un plan para las bajas, y unos pocos números que miras cada semana: ocupación, cobros pendientes y margen por clase. Lo que se repite cada día conviene automatizarlo; tu criterio, para lo que no se repite.',
  entradilla:
    'Un estudio de Pilates rara vez se complica por las clases. Se complica por todo lo que pasa alrededor: el mensaje de las once de la noche para cambiar una reserva, el bono que caducó sin que nadie avisara, la instructora que se pone mala a primera hora o el recibo que no entró. Aquí tienes la gestión ordenada en cinco sistemas y una rutina semanal, con cifras de estudios españoles.',
  secciones: [
    {
      id: 'cinco-sistemas',
      titulo: 'Los cinco sistemas de un estudio de Pilates',
      bloques: [
        {
          t: 'p',
          texto: 'Cada uno responde a una pregunta que te harás todas las semanas. Si alguno vive solo en tu cabeza o en un grupo de WhatsApp, es ese el que te va a quitar las noches.',
        },
        {
          t: 'pasos',
          items: [
            { titulo: 'Horario y aforo', texto: '¿Qué clases doy, a qué hora, en qué sala, con cuántas plazas y quién las da? Es la base de todo lo demás.' },
            { titulo: 'Reservas y cancelaciones', texto: '¿Quién viene a cada clase, hasta cuándo puede cancelar sin perder la sesión y qué pasa con la plaza que se libera?' },
            { titulo: 'Bonos, cuotas y cobros', texto: '¿Qué vendes, cuánto cuesta cada sesión, cuándo caduca y cómo entra el dinero sin perseguir a nadie?' },
            { titulo: 'Equipo', texto: '¿Quién puede dar cada clase, cuánto te cuesta y qué haces cuando alguien no puede venir?' },
            { titulo: 'Números', texto: '¿Qué clases se llenan, cuáles no, qué te deben y cuánto deja cada clase después de pagar a la instructora?' },
          ],
        },
      ],
    },
    {
      id: 'horario-y-aforo',
      titulo: 'Horario y aforo: el aforo sale de la sala, no de una cifra',
      bloques: [
        {
          t: 'p',
          texto: 'En un estudio de reformer el aforo de una clase es el número de máquinas que tiene la sala, y una máquina averiada lo baja. En suelo depende del espacio por esterilla. Por eso conviene definir primero las salas y su capacidad, y después colgar de ellas las clases. Si mezclas reformer y suelo, son dos tipos de clase con sus propias reglas y su propio precio.',
        },
        {
          t: 'lista',
          items: [
            '**Monta el horario como una serie**, la semana tipo que se repite, y revísalo por trimestre: no clase a clase.',
            '**Separa las franjas que se llenan de las que no.** La primera hora de la mañana y la tarde suelen llenarse; las de media mañana, menos. Qué hacer con estas, en [cómo llenar las clases valle](/recursos/ocupacion-clases-valle).',
            '**Decide quién da cada clase** con la disponibilidad real de tu equipo delante, no de memoria.',
            '**Deja hueco para lo excepcional**: festivos, el cierre de agosto, un taller. Mejor marcarlo en el calendario que avisar clase a clase.',
          ],
        },
        {
          t: 'p',
          texto: 'Cómo lo hace un estudio de máquinas, plaza por plaza, en [software para estudios de Pilates reformer](/soluciones/estudio-de-pilates-reformer).',
        },
      ],
    },
    {
      id: 'reservas-y-cancelaciones',
      titulo: 'Reservas, cancelaciones y lista de espera',
      bloques: [
        {
          t: 'p',
          texto: 'La reserva es el momento en que la alumna se compromete, y la cancelación es donde se pierde el dinero. Una plaza cancelada a última hora es peor que una que nunca se reservó: ya no hay tiempo de dársela a otra. Tres decisiones lo resuelven casi todo:',
        },
        {
          t: 'tabla',
          cabecera: ['Decisión', 'Qué fijar', 'Referencia'],
          filas: [
            ['Ventana de cancelación', 'Con cuántas horas se cancela sin perder la sesión', 'Entre 2 y 24 horas en los estudios españoles revisados'],
            ['Lista de espera', 'Si la plaza se da sola a la siguiente y con qué plazo para aceptarla', 'Más estricta donde hay cola; más flexible donde sobra sitio'],
            ['Faltas sin avisar', 'Si se pierde la sesión y si cobras algo más', 'Perder la sesión es lo habitual; una penalización tiene que ser moderada'],
          ],
          nota: 'Ventanas publicadas por seis estudios de pilates y yoga, consultadas el 25-sep-2026: ver nuestra guía de la política de cancelación de clases.',
        },
        {
          t: 'p',
          texto: 'La política tiene que estar por escrito y aceptarla la alumna antes de pagar: lo que dice la ley y una plantilla, en [política de cancelación de clases](/recursos/politica-de-cancelacion-de-clases). Y para que se cancele menos, en [cómo reducir las cancelaciones y los no-shows](/recursos/reducir-cancelaciones-ultima-hora).',
        },
      ],
    },
    {
      id: 'bonos-cuotas-y-cobros',
      titulo: 'Bonos, cuotas y cobros: que el dinero entre solo',
      bloques: [
        {
          t: 'p',
          texto: 'Un catálogo corto vende mejor que uno largo: clase suelta, bono de 5, bono de 10 y cuota mensual cubren casi todo. Lo importante es que cada escalón salga más barato por sesión que el anterior y que la caducidad esté por escrito antes de vender.',
        },
        {
          t: 'cifras',
          titulo: 'Lo que cobran los estudios españoles por el reformer',
          cifras: [
            { valor: '25 €', etiqueta: 'clase suelta de reformer en grupo (mediana)' },
            { valor: '18,75 €', etiqueta: 'cada sesión con cuota de una clase a la semana' },
            { valor: '21 %', etiqueta: 'ahorro mediano del bono de 10 frente a la suelta' },
          ],
          nota: 'Tarifas publicadas por 32 estudios de 8 ciudades, consultadas el 25-sep-2026: ver precio de una clase de pilates y bonos de pilates.',
        },
        {
          t: 'lista',
          items: [
            '**Cobra con tarjeta guardada o por domiciliación.** Lo que se cobra solo y se reintenta solo no hay que perseguirlo.',
            '**Las clases llevan un 21 % de IVA** salvo casos concretos: cuáles, en [¿las clases de pilates llevan IVA?](/recursos/iva-clases-de-pilates).',
            '**Factura desde el primer cobro.** El programa de facturación tiene que estar adaptado a Veri*Factu antes del 1 de enero de 2027 si eres sociedad, y del 1 de julio de 2027 si eres autónoma: [qué cambia](/recursos/facturacion-electronica-verifactu).',
          ],
        },
        {
          t: 'p',
          texto: 'Cómo diseñar la escalera de precios paso a paso, en [bonos de pilates](/recursos/bonos-de-pilates).',
        },
        {
          t: 'llamada',
          texto: 'Tentare cobra bonos y cuotas con tarjeta o domiciliación, reintenta lo que falla y te avisa de lo que queda pendiente.',
        },
      ],
    },
    {
      id: 'equipo',
      titulo: 'Equipo: disponibilidad, tarifas y un plan para las bajas',
      bloques: [
        {
          t: 'p',
          texto: 'El equipo es el coste más grande después del local, y el que más imprevistos genera. Contratada, una monitora de una sola disciplina cobra como mínimo lo que marca el convenio estatal de instalaciones deportivas y gimnasios (16.279,89 € brutos al año en las tablas de 2025), y en 2026 manda el salario mínimo, 17.094 € al año a jornada completa, porque es más alto. Por horas, las ofertas activas en septiembre de 2026 iban de 8 a 30 € la hora, con 20 € como cifra más repetida.',
        },
        {
          t: 'lista',
          items: [
            '**Ten la disponibilidad de cada instructora por escrito**, con sus vacaciones y bajas marcadas, antes de montar el horario.',
            '**Cuidado con depender de una sola persona.** Si una instructora da la mitad de tus clases, su baja te deja media semana en el aire.',
            '**Decide el orden de sustitutas antes de necesitarlo**: quién sabe dar esa clase, quién suele estar libre a esa hora, a quién se avisa primero.',
            '**Paga por lo que se da**: lleva las horas de cada una por clase dada, no de memoria a fin de mes.',
          ],
        },
        {
          t: 'p',
          texto: 'Los números completos, en [cuánto cobra una instructora de pilates](/recursos/cuanto-cobra-una-instructora-de-pilates), y el protocolo para una baja, en [cómo cubrir la baja de una instructora](/recursos/cubrir-baja-instructora).',
        },
      ],
    },
    {
      id: 'numeros',
      titulo: 'Los números que hay que mirar cada semana',
      bloques: [
        {
          t: 'p',
          texto: 'No hacen falta veinte indicadores. Con cinco ves venir casi todos los problemas, y todos se calculan con lo que ya apuntas al reservar y al cobrar:',
        },
        {
          t: 'tabla',
          cabecera: ['Indicador', 'Cómo se calcula', 'Qué te dice'],
          filas: [
            ['Ocupación', 'Plazas reservadas entre plazas ofrecidas, por clase y por franja', 'Qué horario sobra y qué clase pide otra igual'],
            ['Cobros pendientes', 'Recibos sin cobrar y su antigüedad', 'A quién hay que escribir antes de que sea una baja'],
            ['Altas y bajas', 'Alumnas que empiezan y que dejan de venir en el mes', 'Si el estudio crece o solo rota'],
            ['Cancelaciones tardías y faltas', 'Las que llegan fuera de plazo y las que no avisan', 'Si tu política funciona o hay que tocarla'],
            ['Margen por clase', 'Lo que pagaron sus asistentes menos lo que cuesta la instructora', 'Qué clases sostienen el estudio y cuáles no'],
          ],
        },
        {
          t: 'p',
          texto: 'Para saber a partir de qué ocupación ganas dinero, haz la cuenta con tus números en la calculadora de [¿es rentable un estudio de pilates?](/recursos/rentabilidad-estudio-de-pilates). En su ejemplo, seis reformers con 30 clases a la semana a 18,75 € la sesión cubren gastos hacia el 53 % de ocupación y necesitan cerca del 70 % para dejarte además un sueldo de 2.000 € al mes.',
        },
      ],
    },
    {
      id: 'rutina-semanal',
      titulo: 'Una rutina de media hora a la semana',
      bloques: [
        {
          t: 'p',
          texto: 'Con los cinco sistemas en marcha, la gestión cabe en tres ratos cortos a la semana y un cierre al mes:',
        },
        {
          t: 'pasos',
          items: [
            { titulo: 'Lunes: la semana que empieza', texto: 'Clases con poca ocupación, bajas previstas del equipo y avisos que haya que mandar. Si una clase va casi vacía, decide hoy si la mueves, la anuncias o la juntas con otra.' },
            { titulo: 'Miércoles: el dinero', texto: 'Recibos que han fallado, bonos que caducan este mes y alumnas a las que les queda una sesión. Es el mejor momento para ofrecer la renovación.' },
            { titulo: 'Viernes: la semana que viene', texto: 'Lista de espera de las clases llenas, horario de la semana siguiente y cualquier cambio de instructora ya cerrado y avisado.' },
            { titulo: 'Fin de mes: el cierre', texto: 'Ingresos, altas y bajas, ocupación por franja y margen por clase. Las facturas, a tu gestoría. Y una sola decisión para el mes siguiente.' },
          ],
        },
      ],
    },
    {
      id: 'que-automatizar',
      titulo: 'Qué automatizar y qué dejar a tu criterio',
      bloques: [
        {
          t: 'p',
          texto: 'La regla es sencilla: lo que se repite igual cada vez, que lo haga el sistema; lo que depende de la persona o del momento, tú.',
        },
        {
          t: 'tabla',
          cabecera: ['Que lo haga el sistema', 'Que lo decidas tú'],
          filas: [
            ['Reservar y cancelar con tus reglas', 'El horario y los precios'],
            ['Dar la plaza libre a la lista de espera', 'Las excepciones a tu política'],
            ['Recordar la clase del día siguiente', 'Quién entra en tu equipo'],
            ['Cobrar y reintentar lo que falla', 'Cómo hablas con una alumna que deja de venir'],
            ['Avisar del bono que se acaba', 'Qué clase abres o cierras'],
          ],
        },
        {
          t: 'producto',
          titulo: 'Tentare lleva los cinco sistemas en un solo panel',
          texto: 'El horario con aforo por sala y por reformer, las reservas con lista de espera, los bonos y cuotas con cobro automático, el equipo con sus sustituciones y los informes de ocupación y margen por clase. Desde 29 €/mes con IVA, sin permanencia y con 7 días de prueba sin tarjeta.',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Qué programa necesito para gestionar un estudio de Pilates?',
      a: 'Uno que reserve con el aforo de cada clase o de cada máquina, que cobre bonos y cuotas solo (con tarjeta o domiciliación), que dé a tus alumnas una app para reservar y cancelar, y que lleve el horario de tu equipo. Comprueba también que publique su precio y si tiene permanencia.',
    },
    {
      q: '¿A partir de qué ocupación es rentable un estudio de Pilates?',
      a: 'Depende de tus costes y tus precios. En el ejemplo de nuestra calculadora (seis reformers, 30 clases a la semana y 18,75 € por sesión), el estudio cubre gastos hacia el 53 % de ocupación y necesita cerca del 70 % para dejar además un sueldo de 2.000 € al mes.',
    },
    {
      q: '¿Con cuántas horas se puede cancelar una clase?',
      a: 'Lo decide cada estudio. En los estudios españoles que revisamos, la ventana va de 2 a 24 horas, a veces distinta para el reformer y para el suelo. Lo importante es que esté por escrito y que la alumna la acepte antes de pagar.',
    },
    {
      q: '¿Cuánto cuesta una instructora de Pilates?',
      a: 'Contratada, el mínimo del convenio estatal de gimnasios para una monitora de una disciplina era de 16.279,89 € brutos al año en 2025, y en 2026 manda el salario mínimo, 17.094 €. Por horas, las ofertas de septiembre de 2026 iban de 8 a 30 €, con 20 € como cifra más repetida.',
    },
    {
      q: '¿Qué IVA llevan las clases de Pilates?',
      a: 'En un estudio privado, el 21 %. Solo están exentas en casos concretos, como las de entidades deportivas sin ánimo de lucro de carácter social o cuando una fisioterapeuta las usa para tratar o prevenir una enfermedad. En Canarias se aplica el IGIC.',
    },
    {
      q: '¿Tengo que adaptar la facturación a Veri*Factu?',
      a: 'Si facturas con un programa, sí. Tiene que estar adaptado antes del 1 de enero de 2027 si eres una sociedad y antes del 1 de julio de 2027 si eres autónoma. Quien tributa por módulos y en el régimen simplificado del IVA, con carácter general, no.',
    },
  ],
  fuentes: [
    { titulo: 'Resolución de 16 de enero de 2024: V Convenio colectivo estatal de instalaciones deportivas y gimnasios (BOE)', url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-1506', consultada: '2026-09-25' },
    { titulo: 'Real Decreto 126/2026, por el que se fija el salario mínimo interprofesional para 2026 (BOE)', url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2026-3815', consultada: '2026-09-25' },
    { titulo: 'Ley 37/1992, del Impuesto sobre el Valor Añadido (texto consolidado, BOE)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740', consultada: '2026-09-25' },
    { titulo: 'Real Decreto 1007/2023, sistemas informáticos de facturación: plazos en la disposición final cuarta (BOE)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840', consultada: '2026-09-25' },
    { titulo: 'Real Decreto Legislativo 1/2007, Ley General para la Defensa de los Consumidores y Usuarios (BOE)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555', consultada: '2026-09-25' },
  ],
  relacionadas: [
    '/recursos/rentabilidad-estudio-de-pilates',
    '/recursos/bonos-de-pilates',
    '/recursos/politica-de-cancelacion-de-clases',
    '/funcionalidades',
  ],
  cta: {
    titulo: 'Los cinco sistemas, en un solo sitio.',
    texto: 'Horario, reservas, cobros, equipo y números en un panel, con una app con tu marca para tus alumnas. 7 días gratis, sin tarjeta y sin permanencia.',
  },
  revision: [
    'Cifras de precios y bonos: de los artículos de precio y bonos (25-sep-2026); si se actualizan, cambiar aquí.',
    'Salarios: tablas del convenio de 2025 y SMI 2026; revisar cuando se publique el VI convenio.',
  ],
};

export default articulo;
