// apps/mobile/src/data/localitiesCordoba.ts

// 🔹 Lista base sin modificar
export const LOCALITIES_CORDOBA_RAW = [
  // ✅ Capital / Gran Córdoba
  'Córdoba',
  'Villa Allende',
  'Unquillo',
  'Mendiolaza',
  'Saldán',
  'La Calera',
  'Malagueño',
  'Carlos Paz',
  'Bialet Massé',
  'Tanti',
  'Cosquín',
  'Santa María de Punilla',
  'Villa Santa Cruz del Lago',
  'Icho Cruz',
  'San Antonio de Arredondo',
  'Mayu Sumaj',

  // ✅ Sierras Chicas
  'Río Ceballos',
  'Salsipuedes',
  'Agua de Oro',
  'La Granja',
  'Ascochinga',
  'Jesús María',
  'Colonia Caroya',
  'Sinsacate',

  // ✅ Punilla / Valle de Punilla
  'La Falda',
  'Huerta Grande',
  'Villa Giardino',
  'Capilla del Monte',
  'San Marcos Sierras',
  'Cruz del Eje',
  'Villa de Soto',

  // ✅ Traslasierra
  'Villa Dolores',
  'Mina Clavero',
  'Nono',
  'Villa Cura Brochero',
  'Los Hornillos',
  'Las Rabonas',
  'San Javier y Yacanto',
  'San Pedro',
  'La Paz (Córdoba)',
  'Salsacate',
  'Taninga',
  'Villa de las Rosas',

  // ✅ Calamuchita
  'Santa Rosa de Calamuchita',
  'Villa General Belgrano',
  'La Cumbrecita',
  'Embalse',
  'Almafuerte',
  'Los Reartes',
  'Villa Rumipal',
  'Villa del Dique',
  'Yacanto',
  'Los Cóndores',

  // ✅ Río Tercero / Tancacha / zona
  'Río Tercero',
  'Tancacha',
  'Hernando',
  'General Fotheringham',

  // ✅ Centro / Villa María
  'Villa María',
  'Villa Nueva',
  'Bell Ville',
  'Justiniano Posse',
  'Marcos Juárez',
  'Leones',
  'Morrison',
  'Noetinger',
  'Oliva',
  'Oncativo',
  'Río Segundo',
  'Pilar (Córdoba)',

  // ✅ San Francisco / Este
  'San Francisco',
  'Arroyito',
  'Morteros',
  'Brinkmann',
  'Devoto',
  'Freyre',
  'La Francia',
  'Balnearia',
  'Miramar de Ansenuza',

  // ✅ Norte
  'Dean Funes',
  'Villa del Totoral',
  'Río Primero',
  'Quilino',
  'San José de la Dormida',

  // ✅ Sur / Río Cuarto
  'Río Cuarto',
  'Las Higueras',
  'Santa Catalina Holmberg',
  'Sampacho',
  'Bulnes',
  'Coronel Moldes',
  'Chaján',
  'Achiras',
  'San Basilio',
  'La Cautiva',
  'Alcira Gigena',
  'Berrotarán',
  'Elena',
  'La Carlota',
  'Reducción',
  'General Cabrera',
  'Carnerillo',
  'General Deheza',
  'Vicuña Mackenna',
  'Washington',
  'Adelia María',

  // ✅ Laboulaye
  'Laboulaye',
  'General Levalle',
  'Serrano',
  'Jovita',
  'Villa Huidobro',

  // ✅ Villa de María / Noroeste
  'Villa de María del Río Seco',
  'Sebastián Elcano',
] as const;

// ✅ versión ya dedupeada + ordenada
export const LOCALITIES_CORDOBA = Array.from(new Set(LOCALITIES_CORDOBA_RAW)).sort((a, b) =>
  a.localeCompare(b, 'es'),
);

export type LocalityCordoba = (typeof LOCALITIES_CORDOBA)[number];
