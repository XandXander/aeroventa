export const SITE = {
  origin: 'https://aeroventa.ru',
  name: 'AEROVENTA',
  primaryBusiness: 'Монтаж вентиляции',
  phone: '+7 922 640 99 22',
  email: 'aeroventaspb@yandex.ru',
  primaryServiceArea: 'Санкт-Петербург и Ленинградская область',
  additionalServiceAreas: ['Москва', 'Республика Карелия'],
  schemaServiceAreas: [
    { '@type': 'AdministrativeArea', name: 'Санкт-Петербург' },
    { '@type': 'AdministrativeArea', name: 'Ленинградская область' },
    { '@type': 'AdministrativeArea', name: 'Москва' },
    { '@type': 'AdministrativeArea', name: 'Республика Карелия' },
  ],
} as const;
