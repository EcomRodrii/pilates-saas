// Exports de EJEMPLO por plataforma, para la demo "pruébalo sin tus datos" de
// la landing. El objetivo: que una propietaria vea un archivo con el formato
// EXACTO de su software actual reconocerse solo, sin subir nada suyo.
//
// Fidelidad de cabeceras (verificado jul-2026 contra docs oficiales donde
// existen): Eversports y Momence usan los nombres de columna REALES de sus
// exports (helpcenter.eversportsmanager.com, api.docs.momence.com). Timp y
// Nubapp son software español sin cabeceras publicadas → se usan las
// convenciones del sector (ES, "Nombre"/"Apellidos", DD/MM/YYYY, ";"). Los
// datos de personas son inventados. Se corren por el MISMO clasificador
// determinista que la migración real.

export interface EjemploPlataforma {
  id: string;
  label: string;
  // Nota honesta sobre la fidelidad del formato.
  nota: string;
  archivos: { nombre: string; contenido: string }[];
}

export const EJEMPLOS: EjemploPlataforma[] = [
  {
    id: 'eversports',
    label: 'Eversports',
    nota: 'Columnas reales del export de Eversports Manager (apellido y nombre separados, en inglés).',
    archivos: [
      {
        nombre: 'eversports_customers.csv',
        contenido:
          'Surname,First name,Customer number,Telephone,Email address,Street,City,Group,Tags,Status,Member since\n' +
          'Soler,María,10234,+34 600 111 222,maria.soler@gmail.com,Calle Mayor 12,Málaga,Reformer,VIP,Active,2023-03-14\n' +
          'Ruiz,Nora,10235,+34 611 333 444,nora.ruiz@hotmail.com,Av. Andalucía 4,Málaga,Mat,,Active,2023-05-02\n' +
          'García,Lucía,10236,+34 622 555 666,lucia.g@gmail.com,Plaza Uncibay 7,Málaga,Reformer,,Active,2024-01-20\n' +
          'Fernández,Ana,10237,+34 633 777 888,ana.fernandez@gmail.com,Calle Larios 3,Málaga,Barre,Embarazo,Active,2024-06-11\n' +
          'Moreno,Berta,10238,,berta.moreno@gmail.com,Calle Nueva 22,Málaga,Mat,,Inactive,2022-11-30\n',
      },
      {
        nombre: 'eversports_memberships.csv',
        contenido:
          'Email address,Membership Name,Sessions left,Validity end,Status\n' +
          'maria.soler@gmail.com,Bono 10 Reformer,4,2026-09-14,Active\n' +
          'nora.ruiz@hotmail.com,Cuota Mensual Mat,,2026-08-01,Active\n' +
          'lucia.g@gmail.com,Bono 10 Reformer,9,2026-10-20,Active\n' +
          'ana.fernandez@gmail.com,Bono 5 Barre,1,2026-08-30,Active\n',
      },
    ],
  },
  {
    id: 'momence',
    label: 'Momence',
    nota: 'Nombres de campo reales de la API de Momence (camelCase, fechas ISO).',
    archivos: [
      {
        nombre: 'momence_customers.csv',
        contenido:
          'firstName,lastName,email,phoneNumber,memberId,createdAt\n' +
          'María,Soler,maria.soler@gmail.com,+34600111222,M-10234,2023-03-14T09:12:00.000Z\n' +
          'Nora,Ruiz,nora.ruiz@hotmail.com,+34611333444,M-10235,2023-05-02T18:30:00.000Z\n' +
          'Lucía,García,lucia.g@gmail.com,+34622555666,M-10236,2024-01-20T11:05:00.000Z\n' +
          'Ana,Fernández,ana.fernandez@gmail.com,+34633777888,M-10237,2024-06-11T08:00:00.000Z\n' +
          'Berta,Moreno,berta.moreno@gmail.com,,M-10238,2022-11-30T16:45:00.000Z\n',
      },
      {
        nombre: 'momence_memberships.csv',
        contenido:
          'email,membershipName,sessionsRemaining,endDate,status\n' +
          'maria.soler@gmail.com,10 Class Pack,4,2026-09-14,active\n' +
          'nora.ruiz@hotmail.com,Monthly Unlimited,,2026-08-01,active\n' +
          'lucia.g@gmail.com,10 Class Pack,9,2026-10-20,active\n' +
          'ana.fernandez@gmail.com,5 Class Pack,1,2026-08-30,frozen\n',
      },
    ],
  },
  {
    id: 'timp',
    label: 'Timp',
    nota: 'Formato típico del sector español (cabeceras en español, fechas DD/MM/AAAA, separador «;»).',
    archivos: [
      {
        nombre: 'timp_clientes.csv',
        contenido:
          'Nombre;Apellidos;Email;Teléfono;Fecha de alta;Estado\n' +
          'María;Soler;maria.soler@gmail.com;600 111 222;14/03/2023;Suscrito\n' +
          'Nora;Ruiz;nora.ruiz@hotmail.com;611 333 444;02/05/2023;Suscrito\n' +
          'Lucía;García;lucia.g@gmail.com;622 555 666;20/01/2024;Suscrito\n' +
          'Ana;Fernández;ana.fernandez@gmail.com;633 777 888;11/06/2024;Suscrito\n' +
          'Berta;Moreno;berta.moreno@gmail.com;;30/11/2022;Baja\n',
      },
      {
        nombre: 'timp_bonos.csv',
        contenido:
          'Email;Bono;Sesiones restantes;Caducidad;Estado\n' +
          'maria.soler@gmail.com;Bono 10 sesiones;4;14/09/2026;Activo\n' +
          'lucia.g@gmail.com;Bono 10 sesiones;9;20/10/2026;Activo\n' +
          'ana.fernandez@gmail.com;Bono 5 sesiones;1;30/08/2026;Activo\n',
      },
    ],
  },
  {
    id: 'nubapp',
    label: 'Nubapp / Resasports',
    nota: 'Formato típico del sector español (cabeceras en español, fechas DD/MM/AAAA, separador «;»).',
    archivos: [
      {
        nombre: 'nubapp_socios.csv',
        contenido:
          'Nombre;Apellidos;Correo electrónico;Móvil;Fecha alta\n' +
          'María;Soler;maria.soler@gmail.com;600111222;14/03/2023\n' +
          'Nora;Ruiz;nora.ruiz@hotmail.com;611333444;02/05/2023\n' +
          'Lucía;García;lucia.g@gmail.com;622555666;20/01/2024\n' +
          'Ana;Fernández;ana.fernandez@gmail.com;633777888;11/06/2024\n' +
          'Berta;Moreno;berta.moreno@gmail.com;;30/11/2022\n',
      },
      {
        nombre: 'nubapp_abonos.csv',
        contenido:
          'Email;Abono;Sesiones;Fecha fin;Activo\n' +
          'maria.soler@gmail.com;Bono 10;4;14/09/2026;Sí\n' +
          'nora.ruiz@hotmail.com;Cuota mensual;;01/08/2026;Sí\n' +
          'lucia.g@gmail.com;Bono 10;9;20/10/2026;Sí\n',
      },
    ],
  },
  {
    id: 'excel',
    label: 'Un Excel casero',
    nota: 'La hoja de cálculo de toda la vida: columnas puestas a mano, un poco desordenadas.',
    archivos: [
      {
        nombre: 'mis_clientas.csv',
        contenido:
          'Nombre y apellidos,Whatsapp,Correo,Alta,Bono\n' +
          'María Soler,600111222,maria.soler@gmail.com,14/3/23,Bono 10\n' +
          'Nora Ruiz,611333444,nora.ruiz@hotmail.com,2/5/23,Mensual\n' +
          'Lucía García,622555666,lucia.g@gmail.com,20/1/24,Bono 10\n' +
          'Ana,633777888,ana.fernandez@gmail.com,11/6/24,Bono 5\n' +
          'Sin Email,644000000,,1/2/24,Bono 10\n',
      },
    ],
  },
];
