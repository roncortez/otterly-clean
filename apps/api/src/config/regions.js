'use strict';

const REGIONS = {
  EC: {
    code: 'EC',
    name: 'Ecuador (Quito)',
    locale: 'es-EC',
    timezone: 'America/Guayaquil',
    currency: {
      code: 'USD',
      symbol: '$',
    },
    tax: {
      code: 'IVA',
      label: 'IVA',
      rate: 0.15,
      includedInDisplayedPrice: false,
    },
    phone: {
      countryCallingCode: '+593',
      mask: '0999999999',
    },
    address: {
      labels: {
        administrative_area: 'Provincia',
        locality: 'Ciudad',
        dependent_locality: 'Sector',
        street_address: 'Calle principal y secundaria',
      },
      postalCodeRequired: false,
      required: ['street_address', 'locality', 'administrative_area'],
    },
    units: {
      weight: 'kg',
      area: 'm2',
    },
    taxIdTypes: [
      { code: 'RUC', label: 'RUC' },
      { code: 'CEDULA', label: 'Cédula' },
    ],
    booking: {
      minLeadTimeHours: 3,
      freeCancellationHours: 24,
      windowDurationMinutes: 240,
      timeWindows: [
        { code: 'MORNING', label: 'Mañana (08:00 - 12:00)', startTime: '08:00', endTime: '12:00', start: '08:00', end: '12:00' },
        { code: 'AFTERNOON', label: 'Tarde (13:00 - 17:00)', startTime: '13:00', endTime: '17:00', start: '13:00', end: '17:00' },
        { code: 'EVENING', label: 'Noche (17:00 - 20:00)', startTime: '17:00', endTime: '20:00', start: '17:00', end: '20:00' },
      ],
    },
  },
  US: {
    code: 'US',
    name: 'Estados Unidos',
    locale: 'en-US',
    timezone: 'America/New_York',
    currency: {
      code: 'USD',
      symbol: '$',
    },
    tax: {
      code: 'SALES_TAX',
      label: 'Sales Tax',
      rate: 0.0,
      includedInDisplayedPrice: false,
    },
    phone: {
      countryCallingCode: '+1',
      mask: '(555) 555-5555',
    },
    address: {
      labels: {
        administrative_area: 'State',
        locality: 'City',
        dependent_locality: 'Neighborhood',
        street_address: 'Street address',
      },
      postalCodeRequired: true,
      required: ['street_address', 'locality', 'administrative_area', 'postal_code'],
    },
    units: {
      weight: 'lb',
      area: 'sqft',
    },
    taxIdTypes: [
      { code: 'SSN', label: 'SSN' },
      { code: 'EIN', label: 'EIN' },
    ],
    booking: {
      minLeadTimeHours: 6,
      freeCancellationHours: 48,
      windowDurationMinutes: 240,
      timeWindows: [
        { code: 'MORNING', label: 'Morning (08:00 - 12:00)', startTime: '08:00', endTime: '12:00', start: '08:00', end: '12:00' },
        { code: 'AFTERNOON', label: 'Afternoon (13:00 - 17:00)', startTime: '13:00', endTime: '17:00', start: '13:00', end: '17:00' },
        { code: 'EVENING', label: 'Evening (17:00 - 20:00)', startTime: '17:00', endTime: '20:00', start: '17:00', end: '20:00' },
      ],
    },
  },
};

function getRegion(code = 'EC') {
  const upper = String(code).toUpperCase();
  return REGIONS[upper] ?? REGIONS.EC;
}

function listRegions() {
  return Object.values(REGIONS);
}

module.exports = { getRegion, listRegions, REGIONS };
