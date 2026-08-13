import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Reservar una limpieza cuando ya tienes espacios registrados.
 *
 * Esta es la promesa que se venía incumpliendo: el cliente describía su casa y al
 * reservar el asistente le volvía a pedir habitaciones, baños, cómo se entra y
 * qué mascotas hay. Lo que se prueba aquí es el comportamiento, no la
 * maquetación: que el espacio se elija, que sus datos no se vuelvan a preguntar,
 * que lo de la visita siga preguntándose, y que la reserva que sale hacia el
 * backend no arrastre los datos del lugar.
 */

const CATALOG = [
  {
    code: 'CLEANING',
    label: 'Limpieza',
    description: 'Limpieza a domicilio',
    plans: [
      {
        id: 10,
        name: 'Limpieza estándar',
        description: 'Por horas',
        base_amount: 1200,
        pricing_model: 'PER_HOUR',
        config: {},
      },
    ],
    extras: [],
  },
];

/** Dos viviendas del mismo cliente, cada una con su nombre y su ficha. */
const ADDRESSES = [
  {
    id: 1,
    label: 'Mi departamento',
    street_line1: 'Av. Velasco Ibarra',
    neighborhood: 'Puengasí',
    city: 'Quito',
    is_default: true,
    cleaningProfile: {
      propertyType: 'APARTMENT',
      bedrooms: 1,
      bathrooms: 1,
      areaValue: null,
      areaUnit: 'm2',
      hasPets: false,
      pets: [],
      petInstructions: null,
      accessMethod: 'DOOR_CODE',
      accessInstructions: 'Timbre 5B',
      parkingInstructions: null,
      notes: null,
      hasAccessSecret: true,
      complete: true,
    },
  },
  {
    id: 2,
    label: 'Casa del Valle',
    street_line1: 'Calle Los Arupos',
    neighborhood: 'Conocoto',
    city: 'Quito',
    is_default: false,
    cleaningProfile: {
      propertyType: 'HOUSE',
      bedrooms: 3,
      bathrooms: 2,
      areaValue: 120,
      areaUnit: 'm2',
      hasPets: true,
      pets: [{ type: 'perro', count: 1 }],
      petInstructions: null,
      accessMethod: 'CUSTOMER_OPENS',
      accessInstructions: null,
      parkingInstructions: null,
      notes: null,
      hasAccessSecret: false,
      complete: true,
    },
  },
];

const requests = vi.hoisted(() => ({ posts: [], patches: [], addresses: null }));

vi.mock('@/shared/api/client', () => {
  const get = (path) => {
    if (path === '/catalog/services') return Promise.resolve({ data: { services: CATALOG } });
    if (path === '/customer/addresses') {
      return Promise.resolve({ data: { addresses: requests.addresses } });
    }
    return Promise.resolve({ data: {} });
  };

  const post = (path, body) => {
    requests.posts.push({ path, body });
    if (path === '/customer/quote') {
      return Promise.resolve({
        data: { pricing: { lines: [], subtotal: 3600, discount: 0, tax: 0, taxRate: 0, total: 3600 } },
      });
    }
    if (path === '/customer/addresses') {
      const address = { id: 9, label: body.label, street_line1: body.streetLine1, city: body.city };
      return Promise.resolve({ data: { address } });
    }
    return Promise.resolve({ data: { order: { id: 77 } } });
  };

  const patch = (path, body) => {
    requests.patches.push({ path, body });
    return Promise.resolve({ data: {} });
  };

  return {
    api: { get, post, patch, put: post, delete: get },
    default: { get, post, patch, put: post, delete: get },
    errorMessage: () => 'error',
    errorCode: () => null,
    tokenStore: { getAccess: () => null, setAccess: () => {}, getRefresh: () => null, setRefresh: () => {}, clear: () => {} },
    setSessionExpiredHandler: () => {},
  };
});

vi.mock('@/shared/config/ConfigContext', () => ({
  useConfig: () => ({
    config: { maps: { bias: null, regionCode: 'ec' } },
    region: { name: 'Ecuador', address: { labels: {}, required: [], postalCodeRequired: false } },
    money: (cents) => `$${(cents / 100).toFixed(2)}`,
    timeWindows: () => [{ code: 'MORNING', startTime: '08:00', endTime: '12:00' }],
    areaUnit: 'm2',
    weightUnit: 'kg',
    taxLabel: 'IVA',
    freeCancellationHours: 12,
    addressLabel: (field) => field,
    isAddressFieldRequired: () => false,
  }),
  ConfigProvider: ({ children }) => children,
}));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigate };
});

const { default: BookingWizard } = await import('./BookingWizard');

function renderWizard() {
  return render(
    <MemoryRouter>
      <BookingWizard serviceType="CLEANING" />
    </MemoryRouter>,
  );
}

/** Avanza al paso siguiente, esperando a que el asistente esté listo. */
async function continuar() {
  fireEvent.click(await screen.findByRole('button', { name: /Continuar/ }));
}

/** Escribe en un campo, como lo haría una persona. */
function escribir(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  requests.posts = [];
  requests.patches = [];
  requests.addresses = ADDRESSES;
  navigate.mockClear();
});

describe('Reservar limpieza con espacios ya registrados', () => {
  it('ofrece elegir el espacio, con lo que ya sabemos de cada uno', async () => {
    renderWizard();

    await continuar();
    expect(await screen.findByText('¿Dónde vamos a limpiar?')).toBeInTheDocument();

    // Cada espacio se reconoce por su nombre, no por "Casa".
    expect(screen.getByText('Mi departamento')).toBeInTheDocument();
    expect(screen.getByText('Casa del Valle')).toBeInTheDocument();
    // Y trae su resumen, para elegir sin abrir nada.
    expect(screen.getByText(/3 habitaciones · 2 baños/)).toBeInTheDocument();
  });

  it('no vuelve a pedir los datos de la vivienda', async () => {
    renderWizard();

    await continuar(); // tipo → espacio
    await screen.findByText('¿Dónde vamos a limpiar?');
    await continuar(); // espacio → detalles

    // El paso de detalles pregunta por la visita, no por la casa.
    expect(await screen.findByText('¿Cómo la quieres esta vez?')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Habitaciones/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Baños/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Tipo de lugar/)).not.toBeInTheDocument();
    // Lo que sí hace es recordar de qué espacio se trata.
    expect(screen.getByText(/1 habitación · 1 baño/)).toBeInTheDocument();

    await continuar(); // detalles → fecha
    await continuar(); // fecha → el día

    // Tampoco se pregunta cómo se entra: es del espacio y ya está guardado.
    expect(await screen.findByText('El día del servicio')).toBeInTheDocument();
    expect(screen.queryByLabelText(/¿Cómo entra el profesional\?/)).not.toBeInTheDocument();
    expect(screen.getByText('Código de puerta')).toBeInTheDocument();
    expect(screen.getByText(/con la clave que guardaste/)).toBeInTheDocument();
  });

  it('la reserva que se envía no arrastra los datos del lugar', async () => {
    renderWizard();

    await continuar();
    await screen.findByText('¿Dónde vamos a limpiar?');
    await continuar();
    await screen.findByText('¿Cómo la quieres esta vez?');
    await continuar();
    await continuar();
    await screen.findByText('El día del servicio');
    await continuar();

    fireEvent.click(await screen.findByRole('button', { name: /Confirmar reserva/ }));

    const order = await waitFor(() => {
      const found = requests.posts.find((entry) => entry.path === '/customer/orders/cleaning');
      expect(found).toBeTruthy();
      return found;
    });

    // El lugar viaja como referencia, no como copia de sus datos.
    expect(order.body.addressId).toBe(1);
    expect(order.body.cleaning.bedrooms).toBeUndefined();
    expect(order.body.cleaning.bathrooms).toBeUndefined();
    expect(order.body.cleaning.propertyType).toBeUndefined();
    expect(order.body.cleaning.accessMethod).toBeUndefined();
    expect(order.body.cleaning.accessSecret).toBeUndefined();
    expect(order.body.cleaning.pets).toBeUndefined();
    // Y lo de la visita sí va.
    expect(order.body.cleaning.cleaningType).toBe('STANDARD');
    expect(order.body.cleaning.customerPresent).toBe(true);
  });

  it('un espacio sin datos se completa en el propio asistente', async () => {
    requests.addresses = [
      { ...ADDRESSES[0], cleaningProfile: null },
    ];

    renderWizard();

    await continuar();
    expect(await screen.findByText(/¿Qué limpiamos en Mi departamento\?/)).toBeInTheDocument();

    // No se puede seguir hasta describirlo: reservar sin saber qué se limpia no
    // es una reserva.
    expect(screen.getByRole('button', { name: /Continuar/ })).toBeDisabled();

    escribir(/Baños/, '2');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y seguir' }));

    // Se guarda en el espacio, no solo en esta reserva.
    await waitFor(() => {
      expect(requests.patches[0].path).toBe('/customer/addresses/1/cleaning-profile');
    });
    expect(requests.patches[0].body.bathrooms).toBe(2);
  });

  it('sin ningún espacio, se crea sin salir del asistente', async () => {
    requests.addresses = [];

    renderWizard();

    await continuar();

    // Primero dónde queda, después qué limpiamos ahí: una secuencia, no dos
    // acciones paralelas.
    expect(await screen.findByText('¿Dónde queda?')).toBeInTheDocument();
    expect(screen.getByText('¿Qué limpiamos ahí?')).toBeInTheDocument();
    expect(screen.getByLabelText(/¿Cómo llamas a este lugar\?/)).toBeInTheDocument();
    // Y no hay ningún enlace que eche a la persona a otra pantalla.
    expect(screen.queryByRole('link', { name: /dirección/i })).not.toBeInTheDocument();
  });
});
