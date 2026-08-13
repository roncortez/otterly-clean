import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Mis espacios: varias viviendas, cada una con su nombre.
 *
 * Lo que se prueba es lo que el cliente necesita poder hacer: reconocer cada
 * lugar sin abrirlo, cambiarle el nombre cuando quiera, y ver de un vistazo
 * cuál está sin describir. Nada de esto funcionaba con una pantalla llamada "Mi
 * hogar" en la que tres lugares aparecían como "Casa".
 */

const ADDRESSES = [
  {
    id: 1,
    label: 'Casa',
    street_line1: 'Av. Velasco Ibarra',
    neighborhood: 'Puengasí',
    city: 'Quito',
    cleaningProfile: {
      propertyType: 'APARTMENT',
      bedrooms: 1,
      bathrooms: 1,
      areaValue: null,
      hasPets: false,
      pets: [],
      accessMethod: 'DOOR_CODE',
      hasAccessSecret: true,
      complete: true,
    },
  },
  {
    id: 2,
    label: 'Casa',
    street_line1: 'Calle Los Arupos',
    neighborhood: 'Conocoto',
    city: 'Quito',
    cleaningProfile: null,
  },
];

const calls = vi.hoisted(() => ({ patches: [] }));

vi.mock('@/shared/api/client', () => {
  const get = () => Promise.resolve({ data: { addresses: ADDRESSES } });
  const patch = (path, body) => {
    calls.patches.push({ path, body });
    return Promise.resolve({ data: {} });
  };
  return {
    api: { get, patch, post: patch, put: patch, delete: get },
    default: { get, patch, post: patch, put: patch, delete: get },
    errorMessage: () => 'error',
    errorCode: () => null,
    tokenStore: { getAccess: () => null, setAccess: () => {}, getRefresh: () => null, setRefresh: () => {}, clear: () => {} },
    setSessionExpiredHandler: () => {},
  };
});

vi.mock('@/shared/config/ConfigContext', () => ({
  useConfig: () => ({
    config: { maps: { bias: null, regionCode: 'ec' } },
    region: { address: { labels: {}, required: [], postalCodeRequired: false } },
    areaUnit: 'm2',
    addressLabel: (field) => field,
    isAddressFieldRequired: () => false,
  }),
  ConfigProvider: ({ children }) => children,
}));

const { default: SpacesPage } = await import('./SpacesPage');

function renderPage(path = '/limpieza/espacios') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SpacesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  calls.patches = [];
});

describe('Mis espacios', () => {
  it('lista todas las viviendas, con su dirección para distinguirlas', async () => {
    renderPage();

    expect(await screen.findByText('Mis espacios')).toBeInTheDocument();
    // Dos lugares que hoy se llaman igual: la dirección es lo que los separa
    // mientras el cliente no los renombre.
    expect(screen.getAllByText('Casa')).toHaveLength(2);
    expect(screen.getByText(/Av. Velasco Ibarra/)).toBeInTheDocument();
    expect(screen.getByText(/Calle Los Arupos/)).toBeInTheDocument();
  });

  it('distingue el que ya está descrito del que falta por describir', async () => {
    renderPage();

    expect(await screen.findByText('1 habitación')).toBeInTheDocument();
    expect(screen.getByText('1 baño')).toBeInTheDocument();
    expect(screen.getByText('Código de puerta')).toBeInTheDocument();
    // Y el segundo lo dice y ofrece la acción que corresponde.
    expect(screen.getByText(/Sin datos todavía/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Completar datos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar datos' })).toBeInTheDocument();
  });

  it('avisa de los nombres repetidos, sin inventar uno nuevo', async () => {
    renderPage();

    // Los dos se llaman "Casa": se dice, y el aviso lleva a renombrarlos.
    const avisos = await screen.findAllByText(/Tienes otro espacio con este nombre/);
    expect(avisos).toHaveLength(2);

    fireEvent.click(avisos[0]);
    expect(screen.getByLabelText('Nombre del espacio')).toHaveValue('Casa');
    // Y nada se guardó por su cuenta.
    expect(calls.patches).toHaveLength(0);
  });

  it('cada espacio se puede renombrar desde su tarjeta', async () => {
    renderPage();

    fireEvent.click((await screen.findAllByLabelText(/Cambiar el nombre/))[0]);

    const input = screen.getByLabelText('Nombre del espacio');
    fireEvent.change(input, { target: { value: 'Mi departamento' } });
    fireEvent.click(screen.getByLabelText('Guardar el nombre'));

    // El nombre es el de la dirección: no hay un segundo nombre en paralelo.
    await waitFor(() => expect(calls.patches).toHaveLength(1));
    expect(calls.patches[0]).toEqual({
      path: '/customer/addresses/1',
      body: { label: 'Mi departamento' },
    });
  });

  it('llegar desde una dirección abre su ficha directamente', async () => {
    renderPage('/limpieza/espacios?espacio=2');

    // Sin buscar la tarjeta: la pregunta "¿qué limpiamos aquí?" ya está abierta.
    expect(await screen.findByLabelText(/Habitaciones/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
  });

  it('guardar la ficha la manda al espacio, con los campos del dominio', async () => {
    renderPage('/limpieza/espacios?espacio=2');

    fireEvent.change(await screen.findByLabelText(/Baños/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(calls.patches).toHaveLength(1));
    expect(calls.patches[0].path).toBe('/customer/addresses/2/cleaning-profile');
    expect(calls.patches[0].body).toMatchObject({ bathrooms: 2, areaUnit: 'm2' });
  });
});
