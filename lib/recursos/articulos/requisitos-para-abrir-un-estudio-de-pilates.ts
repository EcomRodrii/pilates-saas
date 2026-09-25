import type { Articulo } from './tipos.ts';

const articulo: Articulo = {
  slug: 'requisitos-para-abrir-un-estudio-de-pilates',
  titulo: 'Requisitos para abrir un estudio de pilates: trámites, licencia, epígrafe y titulación',
  tituloSeo: 'Requisitos para abrir un estudio de pilates en España',
  descripcion: 'Modelo 036 y epígrafe IAE, CNAE, Seguridad Social, licencia o declaración responsable, seguro, datos de salud y titulación: cada requisito con su fuente.',
  resumen: 'Todos los trámites para abrir un estudio de pilates en España, en orden y con su norma: Hacienda, Seguridad Social, ayuntamiento, seguro, protección de datos y titulación de quien da clase.',
  categoria: 'abrir',
  seccion: 'Abrir un estudio',
  publicado: '2026-09-25',
  consultaPrincipal: 'requisitos para abrir un estudio de pilates',
  consultas: [
    'permisos para abrir un estudio de pilates',
    'licencia para un estudio de pilates',
    'epígrafe IAE centro de pilates',
    'CNAE estudio de pilates',
    'seguro para estudio de pilates',
    'titulación para dar clases de pilates',
  ],
  respuesta: 'Para abrir un estudio de pilates en España necesitas: alta en Hacienda con el modelo 036 en el epígrafe 967.2 del IAE; alta en la Seguridad Social, como autónoma o como sociedad; licencia de actividad o declaración responsable, según tu ayuntamiento; seguro de responsabilidad civil; cumplir el RGPD con los datos de salud de tus alumnas; hojas de reclamaciones de tu comunidad; y que quien dé las clases tenga la titulación que exija tu comunidad autónoma.',
  entradilla: 'Los requisitos para abrir un estudio de pilates no están en una sola ley: se los reparten Hacienda, la Seguridad Social, tu ayuntamiento y tu comunidad autónoma. Aquí los tienes en orden, con la norma o la fuente oficial de cada uno, y marcado lo que cambia según dónde abras.',
  secciones: [
    {
      id: 'lista-de-requisitos',
      titulo: 'Requisitos para abrir un estudio de pilates, en orden',
      bloques: [
        {
          t: 'p',
          texto: 'El orden importa: hay pasos que, hechos antes de tiempo, se pagan dos veces, como alquilar un local donde luego el ayuntamiento no admite la actividad. Esta es la parte legal; el recorrido completo, del concepto a la primera semana, está en [cómo abrir un estudio de pilates](/recursos/como-abrir-un-estudio-de-pilates).',
        },
        {
          t: 'tabla',
          cabecera: ['Requisito', 'Dónde', 'Cuándo', 'Depende de'],
          filas: [
            ['Uso permitido en el local', 'Ayuntamiento (urbanismo)', 'Antes de firmar el alquiler', 'Municipio'],
            ['Alta censal (modelo 036) con epígrafe del IAE', 'Agencia Tributaria', 'Antes de la primera compra, pago o cobro', 'Estado'],
            ['Alta en la Seguridad Social', 'Tesorería General de la Seguridad Social', 'Antes de empezar, como mucho 60 días antes', 'Estado'],
            ['Licencia de actividad o declaración responsable', 'Ayuntamiento', 'Antes de abrir al público', 'Municipio'],
            ['Seguro de responsabilidad civil', 'Aseguradora', 'Antes de la primera clase', 'Comunidad autónoma'],
            ['Datos de salud (RGPD)', 'Tú, como responsable', 'Antes de pedir la primera ficha', 'Unión Europea'],
            ['Hojas de reclamaciones', 'Comunidad autónoma', 'Antes de abrir', 'Comunidad autónoma'],
            ['Titulación de quien da clase', 'Dirección general de deportes', 'Antes de contratar', 'Comunidad autónoma'],
            ['Inscripción como empresa', 'Tesorería General de la Seguridad Social', 'Antes de la primera contratación', 'Estado'],
          ],
          nota: 'Resumen de las secciones siguientes, donde cada requisito lleva su fuente. Plazo de 60 días: Seguridad Social, Boletín RED 7/2017.',
        },
      ],
    },
    {
      id: 'alta-en-hacienda-y-epigrafe-iae',
      titulo: 'Alta en Hacienda y epígrafe IAE de un centro de pilates',
      bloques: [
        {
          t: 'p',
          texto: 'El alta se hace con el **modelo 036**; el 037 que aún citan muchas guías lo suprimió la Orden HAC/1526/2024 desde el 3 de febrero de 2025. El plazo llega antes de lo que parece: el alta va antes del inicio de la actividad, y para la Agencia Tributaria la actividad empieza con cualquier compra, pago o cobro del negocio. Date de alta antes de pagar las máquinas o la fianza, no el día que abres.',
        },
        {
          t: 'p',
          texto: 'En el 036 declaras el epígrafe del IAE. La Dirección General de Tributos distinguió dos casos en la consulta vinculante V2661-14, sobre una persona que iba a dar clases de pilates en un local alquilado:',
        },
        {
          t: 'lista',
          items: [
            '**Epígrafe 967.2 de la sección primera, «Escuelas y servicios de perfeccionamiento del deporte».** Cuando las clases se dan dentro de una organización: un estudio con su local, su equipo y sus alumnas. Es el epígrafe de tu estudio.',
            '**Grupo 826 de la sección segunda, «Personal docente de enseñanzas diversas, tales como educación física y deportes…».** Cuando una profesional enseña de forma personal e independiente: la instructora autónoma que factura a estudios.',
          ],
        },
        {
          t: 'p',
          texto: 'La rehabilitación con fin terapéutico a cargo de fisioterapeutas es otra actividad: en la consulta V1152-22, la DGT la llevó al epígrafe 942.9, «Otros servicios sanitarios sin internado», y dejó en el 967.2 lo que sea actividad deportiva.',
        },
        {
          t: 'nota',
          titulo: '¿Vas a pagar el IAE?',
          texto: 'Casi seguro que no: están exentas las personas físicas, las sociedades que facturan menos de 1.000.000 € y cualquiera en sus dos primeros años de actividad; a quien está exenta le basta con el 036, donde el epígrafe se declara igual. El IVA de las clases, en [IVA en las clases de pilates](/recursos/iva-clases-de-pilates).',
        },
      ],
    },
    {
      id: 'cnae-estudio-de-pilates',
      titulo: 'CNAE de un estudio de pilates (CNAE-2025)',
      bloques: [
        {
          t: 'p',
          texto: 'El CNAE es la clasificación estadística y no es lo mismo que el IAE: el 967.2 es un epígrafe del IAE; el 93.13, un código CNAE. Desde el 16 de enero de 2025 está en vigor la CNAE-2025 (Real Decreto 10/2025), que no deroga la CNAE-2009: conviven durante la transición. Las notas explicativas del INE (febrero de 2026) lo dejan escrito:',
        },
        {
          t: 'lista',
          items: [
            '**93.13, «Actividades de los centros deportivos».** Incluye expresamente «las actividades de estudios de pilates» y la instrucción que se imparte en ellos. Es el código de tu estudio.',
            '**85.51, «Educación deportiva y recreativa».** Incluye «las clases de yoga o pilates» y la actividad de instructores y entrenadores; el INE manda aquí la formación que dan profesoras individuales. Es el de la instructora que trabaja por su cuenta.',
          ],
        },
      ],
    },
    {
      id: 'autonoma-o-sociedad',
      titulo: 'Alta en la Seguridad Social: autónoma o sociedad',
      bloques: [
        {
          t: 'p',
          texto: 'Como persona física, te das de alta en el Régimen Especial de Trabajadores Autónomos **antes de empezar**, y nunca antes de los 60 días naturales previos al inicio, como recuerda la Seguridad Social al aplicar el Real Decreto 84/1996.',
        },
        {
          t: 'p',
          texto: 'Si es tu primera vez como autónoma, o no has estado de alta en los dos años anteriores (tres si ya tuviste la reducción), puedes pedir la **cuota reducida o tarifa plana**: 80 € al mes durante 12 meses, ampliable otros 12 si tus rendimientos netos previstos no llegan al salario mínimo interprofesional. Ojo: el Real Decreto-ley 13/2022 fijó esos 80 € para 2023-2025 y remite la cuantía de 2026 en adelante a los Presupuestos: confirma la vigente al darte de alta.',
        },
        {
          t: 'p',
          texto: 'Una sociedad limitada se puede constituir con 1 € de capital desde la Ley 18/2022. Por debajo de 3.000 € hay condiciones: destinar al menos el 20 % del beneficio a reserva legal hasta llegar a esa cifra y, si la sociedad se liquida sin bienes suficientes, responder las socias de la diferencia. Qué forma te conviene lo decides con tu gestoría y tus números.',
        },
        {
          t: 'p',
          texto: 'Si vas a contratar a instructoras por cuenta ajena, antes de la primera contratación te inscribes como empresaria en la Seguridad Social, que te asigna un código de cuenta de cotización. Lo que cobra una instructora, en [cuánto cobra una instructora de pilates](/recursos/cuanto-cobra-una-instructora-de-pilates).',
        },
      ],
    },
    {
      id: 'permisos-y-licencia',
      titulo: 'Permisos y licencia para un estudio de pilates: ¿licencia de actividad o declaración responsable?',
      bloques: [
        {
          t: 'p',
          texto: 'La regla general de la ley de régimen local (artículo 84 bis de la Ley 7/1985) es que una actividad **no** necesita licencia previa, salvo que lo justifiquen el orden público, la seguridad, la salud pública o el medio ambiente en ese lugar. Y la Ley 12/2012, la que quitó la licencia previa a muchos comercios y servicios de hasta 750 m², no incluye en su anexo el grupo 967 del IAE: no te ampara directamente.',
        },
        {
          t: 'p',
          texto: 'Así que decide tu ayuntamiento. Según el municipio y el local, bastará una **declaración responsable** (presentas la documentación, abres y la inspección llega después) o hará falta **licencia de actividad** con proyecto técnico, que suele incluir memoria de la actividad, planos a escala y la justificación de la normativa, firmados por una técnica. Antes de firmar el alquiler, comprueba:',
        },
        {
          t: 'lista',
          items: [
            'Que el planeamiento permite un uso deportivo en ese local.',
            'Qué vía te toca y qué documentación te pedirán.',
            'Si el local cumple el Código Técnico de la Edificación en accesibilidad y seguridad de utilización (DB-SUA) y en caso de incendio (DB-SI), o qué obra haría falta. Las obras llevan su propio permiso.',
            'Cuánto es la tasa, que fija la ordenanza fiscal: súmala a [lo que cuesta abrir un estudio de pilates](/recursos/cuanto-cuesta-abrir-un-estudio-de-pilates).',
          ],
        },
        {
          t: 'nota',
          titulo: 'Pilates de rehabilitación: otro régimen',
          texto: 'Si en el estudio hay fisioterapeutas que hacen tratamientos, esa parte es asistencia sanitaria y necesita la autorización sanitaria de funcionamiento de tu comunidad antes de empezar (Real Decreto 1277/2003, que recoge la fisioterapia entre sus unidades asistenciales).',
        },
      ],
    },
    {
      id: 'seguro-datos-y-reclamaciones',
      titulo: 'Seguro para un estudio de pilates, datos de salud, reclamaciones y música',
      bloques: [
        {
          t: 'p',
          texto: '**Seguro de responsabilidad civil.** Según el Consejo COLEF (mayo de 2024), la mayoría de las leyes autonómicas del deporte obligan a las profesionales a tenerlo: en su recuento, 13 comunidades, entre ellas Andalucía, Cataluña, Madrid y la Comunitat Valenciana. Aunque en la tuya no lo fuera, contrátalo: que cubra la responsabilidad profesional (una lesión en clase) y la del local (una caída en el vestuario), y que alcance a todas las instructoras.',
        },
        {
          t: 'p',
          texto: '**Datos de salud.** Un cuestionario de salud (lesiones, embarazo, patologías) contiene datos de categoría especial para el RGPD: su tratamiento está prohibido salvo que se dé una excepción del artículo 9, como el consentimiento explícito de la alumna (AEPD). Pide solo lo que vayas a usar, explica para qué y guárdalo bien. En Tentare, la ficha de cada alumna guarda su información de salud junto con el consentimiento que dio para tratarla; qué preguntas y para qué las usas lo decide el estudio, que es el responsable del tratamiento.',
        },
        {
          t: 'p',
          texto: '**Hojas de reclamaciones.** Las regula cada comunidad; el Ministerio de Consumo recopila las normas (en Andalucía, el Decreto 82/2022; en Cataluña, el Decreto 121/2013). En la Comunidad de Madrid, por ejemplo, las debe tener toda persona física o jurídica que preste servicios a consumidores finales, con un cartel visible que diga «Existen hojas de reclamaciones a disposición del consumidor».',
        },
        {
          t: 'p',
          texto: '**Música.** Si pones música grabada en clase, necesitas licencia: la SGAE tiene una para gimnasios y academias de baile, y los derechos de productores y artistas se licencian aparte con Somos Música (AGEDI y AIE), que incluye expresamente a los gimnasios.',
        },
      ],
    },
    {
      id: 'titulacion-para-dar-clases-de-pilates',
      titulo: 'Titulación para dar clases de pilates',
      bloques: [
        {
          t: 'p',
          texto: 'No hay un título estatal obligatorio para enseñar pilates. Desde 2023 existe una cualificación profesional oficial, «Instrucción en el método pilates» (AFD805_3, nivel 3), creada por el Real Decreto 546/2023 y actualizada por el Real Decreto 1021/2024. El propio decreto aclara que sus cualificaciones «no constituyen una regulación de profesión regulada alguna»: es una referencia oficial, no una licencia para ejercer.',
        },
        {
          t: 'p',
          texto: 'Lo que sí puede obligar es tu comunidad. Según el Consejo COLEF, diez tienen ley que ordena las profesiones del deporte: Cataluña (3/2008 y 7/2015), La Rioja (1/2015), Extremadura (15/2015), Andalucía (5/2016), Madrid (6/2016, modificada por la 1/2019), Murcia (3/2018), Castilla y León (3/2019), Navarra (Ley Foral 18/2019), País Vasco (8/2022) y Comunitat Valenciana (2/2022). Exigen titulación o habilitación para las profesiones que regulan; si el pilates entra y con qué títulos, depende de cada texto. Pregúntalo a la dirección general de deportes de tu comunidad antes de contratar.',
        },
        {
          t: 'nota',
          titulo: 'Si contratas instructoras',
          texto: 'Guarda copia de su titulación y de su seguro. Si te facturan como autónomas, revisa con tu gestoría que no sea un contrato laboral encubierto.',
        },
      ],
    },
    {
      id: 'facturas-y-verifactu',
      titulo: 'Después de abrir: facturas y Veri*Factu',
      bloques: [
        {
          t: 'p',
          texto: 'Con la primera clase cobrada empiezas a facturar, y tu programa de facturación tendrá que adaptarse al reglamento de sistemas informáticos de facturación (Veri*Factu). Tras el aplazamiento del Real Decreto-ley 15/2025, la Agencia Tributaria fija estos plazos: antes del 1 de enero de 2027 si tributas en el Impuesto sobre Sociedades (una SL) y antes del 1 de julio de 2027 para el resto, autónomas incluidas. El detalle, en [facturación electrónica y Veri*Factu](/recursos/facturacion-electronica-verifactu).',
        },
        {
          t: 'p',
          texto: 'Tentare emite facturas con numeración legal y huella encadenada; la firma y el envío automático a la AEAT están en desarrollo, y el QR de cotejo se imprime cuando la AEAT tiene el registro. Con otro programa, pregunta a tu proveedor cuándo se adapta.',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Qué epígrafe del IAE corresponde a un estudio de pilates?',
      a: 'El 967.2 de la sección primera, «Escuelas y servicios de perfeccionamiento del deporte», si las clases se dan en un estudio organizado como negocio. La instructora que enseña por su cuenta va al grupo 826 de la sección segunda (consulta V2661-14 de la DGT).',
    },
    {
      q: '¿Cuál es el CNAE de un estudio de pilates?',
      a: 'En la CNAE-2025, el 93.13, «Actividades de los centros deportivos», que según el INE incluye expresamente los estudios de pilates. La instructora que trabaja por su cuenta encaja en el 85.51, «Educación deportiva y recreativa».',
    },
    {
      q: '¿Hace falta licencia de apertura para un estudio de pilates?',
      a: 'Depende de tu ayuntamiento: según el municipio y el local, basta una declaración responsable o hace falta licencia de actividad con proyecto técnico. Pregúntalo en urbanismo antes de firmar el alquiler.',
    },
    {
      q: '¿Es obligatorio el seguro de responsabilidad civil para un estudio de pilates?',
      a: 'Para las profesionales del deporte, en la mayoría de comunidades con ley propia sí: el Consejo COLEF cuenta 13 que lo exigen, entre ellas Madrid y Cataluña. Aunque en la tuya no lo fuera, contrátalo: una reclamación por una lesión la pagarías tú.',
    },
    {
      q: '¿Qué titulación hace falta para dar clases de pilates?',
      a: 'No hay un título estatal obligatorio. Existe una cualificación profesional oficial, «Instrucción en el método pilates» (AFD805_3), que no regula la profesión. Lo que puede exigir titulación es la ley de profesiones del deporte de tu comunidad, que existe en diez.',
    },
    {
      q: '¿Tengo que darme de alta en Hacienda antes de abrir el estudio?',
      a: 'Sí: para la Agencia Tributaria la actividad empieza con la primera compra, pago o cobro del negocio, así que el 036 va antes de pagar las máquinas o la fianza. En la Seguridad Social, el alta se pide antes de empezar y nunca más de 60 días antes.',
    },
  ],
  fuentes: [
    { titulo: 'Agencia Tributaria: Orden HAC/1526/2024, que modifica el 036 y suprime el 037', url: 'https://sede.agenciatributaria.gob.es/Sede/todas-noticias/2025/enero/9/orden-ministerial-modificacion-declaraciones-censales.html', consultada: '2026-09-25' },
    { titulo: 'Agencia Tributaria: plazo del alta en el censo (modelo 036)', url: 'https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/guia-practica-cumplimentacion-modelo-censal-036/capitulo-01-cuestiones-generales/plazos-presentacion/declaracion-alta/alta-censo-empresarios-profesionales-retenedores-036.html', consultada: '2026-09-25' },
    { titulo: 'Agencia Tributaria: epígrafe IAE 967.2, Escuelas y servicios de perfeccionamiento del deporte', url: 'https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2021/apendice/epigrafe-iae-967_2-escuelas-servicios-deporte.html', consultada: '2026-09-25' },
    { titulo: 'Dirección General de Tributos, consulta vinculante V2661-14 (clases de pilates), texto en Iberley', url: 'https://www.iberley.es/resoluciones/resolucion-vinculante-dgt-v2661-14-08-10-2014-704921', consultada: '2026-09-25' },
    { titulo: 'Dirección General de Tributos, consulta vinculante V1152-22 (rehabilitación con pilates), texto en Iberley', url: 'https://www.iberley.es/resoluciones/resolucion-dgt-vinculante-v1152-22-26-05-2022-1539702', consultada: '2026-09-25' },
    { titulo: 'Consejo COLEF: epígrafes del IAE de las profesionales del deporte', url: 'https://www.consejo-colef.es/post/iae-autonomos-deporte', consultada: '2026-09-25' },
    { titulo: 'Agencia Tributaria: Impuesto sobre Actividades Económicas, exenciones', url: 'https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/folleto-actividades-economicas/2-impuesto-sobre-actividades-economicas.html', consultada: '2026-09-25' },
    { titulo: 'INE: CNAE-2025, notas explicativas (febrero de 2026)', url: 'https://www.ine.es/daco/daco42/clasificaciones/cnae25/notas_explicativas_CNAE_2025.pdf', consultada: '2026-09-25' },
    { titulo: 'BOE: Real Decreto 10/2025, por el que se aprueba la CNAE-2025', url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-587', consultada: '2026-09-25' },
    { titulo: 'Seguridad Social: Boletín RED 7/2017, altas previas en el RETA', url: 'https://www.seg-social.es/descarga/en/229649', consultada: '2026-09-25' },
    { titulo: 'Seguridad Social: sistema de cotización de autónomos y cuota reducida', url: 'https://www.seg-social.es/wps/portal/wss/internet/HerramientasWeb/9d2fd4f1-ab0f-42a6-8d10-2e74b378ee24?changeLanguage=es', consultada: '2026-09-25' },
    { titulo: 'BOE: Real Decreto-ley 13/2022, nuevo sistema de cotización de autónomos (cuota reducida de 2023 a 2025)', url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2022-12482', consultada: '2026-09-25' },
    { titulo: 'BOE: Ley 18/2022, de creación y crecimiento de empresas', url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2022-15818', consultada: '2026-09-25' },
    { titulo: 'Punto de Acceso General: alta como empresario en la Seguridad Social', url: 'https://administracion.gob.es/tu-espacio-europeo/derechos-obligaciones/empresas/empleados/seguridad-social/alta-empresario', consultada: '2026-09-25' },
    { titulo: 'Ley 7/1985, reguladora de las Bases del Régimen Local, artículo 84 bis (Iberley)', url: 'https://www.iberley.es/legislacion/articulo-84-bis-reguladora-bases-regimen-local', consultada: '2026-09-25' },
    { titulo: 'BOE: Ley 12/2012, de medidas urgentes de liberalización del comercio y de determinados servicios', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2012-15595', consultada: '2026-09-25' },
    { titulo: 'Ley 12/2012: anexo de actividades incluidas (Iberley)', url: 'https://www.iberley.es/legislacion/anexo-i-nico-medidas-urgentes-liberalizacion-comercio-determinados-servicios', consultada: '2026-09-25' },
    { titulo: 'Legálitas: cómo abrir un gimnasio, licencia y documentación', url: 'https://www.legalitas.com/actualidad/como-abrir-un-gimnasio', consultada: '2026-09-25' },
    { titulo: 'Código Técnico de la Edificación: DB-SUA, seguridad de utilización y accesibilidad', url: 'https://www.codigotecnico.org/DocumentosCTE/SeguridadUtilizacionAccesibilidad.html', consultada: '2026-09-25' },
    { titulo: 'BOE: Real Decreto 1277/2003, autorización de centros, servicios y establecimientos sanitarios', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2003-19572', consultada: '2026-09-25' },
    { titulo: 'Consejo COLEF: el seguro de responsabilidad civil de las profesionales del deporte', url: 'https://www.consejo-colef.es/post/src2024-2025', consultada: '2026-09-25' },
    { titulo: 'Comunidad de Madrid: Ley de profesiones del deporte', url: 'https://www.comunidad.madrid/cultura/deportes/ley-profesiones-deporte', consultada: '2026-09-25' },
    { titulo: 'AEPD: bases de legitimación para tratar categorías especiales de datos', url: 'https://www.aepd.es/preguntas-frecuentes/2-tus-obligaciones-como-responsable-del-tratamiento/5-bases-legitimadoras-del-tratamiento/FAQ-0215-cuales-son-las-bases-de-legitimacion-para-el-tratamiento-de-las-categorias-especiales-de-datos', consultada: '2026-09-25' },
    { titulo: 'Ministerio de Derechos Sociales, Consumo y Agenda 2030: legislación sobre hojas de reclamaciones por comunidades autónomas', url: 'https://www.dsca.gob.es/en/consumo/legislacion-hojas-reclamaciones-comunidades-autonomas', consultada: '2026-09-25' },
    { titulo: 'Comunidad de Madrid: hojas de reclamaciones para establecimientos y empresarios', url: 'https://www.comunidad.madrid/consumo/solicitud-hojas-reclamaciones-sistema-unificado-reclamaciones-establecimientos-empresarios', consultada: '2026-09-25' },
    { titulo: 'SGAE: licencia de gimnasios y academias de baile', url: 'https://www.sgae.es/licencia-de-gimnasios-y-academias-de-baile/', consultada: '2026-09-25' },
    { titulo: 'Somos Música (AGEDI y AIE): licencias de música para negocios', url: 'https://somos-musica.es/', consultada: '2026-09-25' },
    { titulo: 'BOE: Real Decreto 546/2023, que establece la cualificación Instrucción en el método pilates', url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2023-17386', consultada: '2026-09-25' },
    { titulo: 'BOE: Real Decreto 1021/2024, que actualiza la cualificación AFD805_3', url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-23541', consultada: '2026-09-25' },
    { titulo: 'Consejo COLEF: regulaciones autonómicas del ejercicio profesional del deporte', url: 'https://www.consejo-colef.es/regulacion-autonomica', consultada: '2026-09-25' },
    { titulo: 'Agencia Tributaria: ampliación del plazo de adaptación de los sistemas informáticos de facturación', url: 'https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/nota-informativa-ampliacion-plazo-adaptacion-facturacion.html', consultada: '2026-09-25' },
  ],
  relacionadas: [
    '/recursos/como-abrir-un-estudio-de-pilates',
    '/recursos/cuanto-cuesta-abrir-un-estudio-de-pilates',
    '/recursos/facturacion-electronica-verifactu',
    '/funcionalidades/ficha-de-clienta',
    '/funcionalidades/facturacion',
  ],
  cta: {
    titulo: 'Con los papeles en regla, que la gestión no te quite horas',
    texto: 'Tentare lleva las reservas, los bonos, los cobros y las facturas de tu estudio desde el primer día, con la ficha de salud de cada alumna. Pruébalo 7 días gratis, sin tarjeta, con el plan que elijas.',
  },
  revision: [
    'La DGT publicó en mayo de 2026 la consulta V1288-26 (967.2 frente a actividad profesional, en entrenamiento personal); no se pudo leer el texto oficial porque la base de datos de la DGT no respondía. Revisar si matiza el criterio de V2661-14.',
    'Tarifa plana: la Seguridad Social y el RDL 13/2022 fijan 80 €/mes para 2023-2025 y remiten la cuantía de 2026 a los Presupuestos; guías privadas la dan en 80 € también en 2026, pero no se encontró la norma que la fije para 2026. Confirmar antes de publicar y, si hay norma, citarla.',
    'Plazos de Veri*Factu (1-ene-2027 y 1-jul-2027): confirmar que no ha habido otro aplazamiento antes de publicar.',
  ],
};

export default articulo;
