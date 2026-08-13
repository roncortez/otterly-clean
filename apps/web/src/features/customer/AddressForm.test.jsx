import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * La dirección: mapa que propone, persona que dispone.
 *
 * No se prueba MapLibre ni Geoapify —son de otros y ya tienen sus pruebas—,
 * sino **nuestra integración**: que elegir un resultado mueva el punto, que
 * arrastrar el pin lo actualice, que una corrección escrita a mano no
 * desaparezca sola, y que cuando el proveedor falla o ni siquiera está
 * configurado, la dirección se siga pudiendo guardar. Esa última parte es la
 * que impide que un servicio externo se convierta en un punto único de fallo.
 *
 * El proveedor está simulado entero: ni una petición real sale de aquí.
 */

// --- MapLibre simulado ------------------------------------------------------
//
// Lo justo para poder disparar lo que hace una persona: el mapa termina de
// cargar, se toca un punto, se suelta el pin en otro.
const maplibre = vi.hoisted(() => ({
  map: null,
  marker: null,
  handlers: {},
  created: 0,
  removed: 0,
  easedTo: null,
}));

vi.mock('maplibre-gl', () => {
  class Marker {
    constructor(options) {
      this.options = options;
      this.handlers = {};
      maplibre.marker = this;
    }
    setLngLat(lngLat) {
      this.lngLat = Array.isArray(lngLat) ? { lng: lngLat[0], lat: lngLat[1] } : lngLat;
      return this;
    }
    getLngLat() {
      return this.lngLat;
    }
    addTo() {
      return this;
    }
    on(event, handler) {
      this.handlers[event] = handler;
      return this;
    }
    remove() {
      maplibre.marker = null;
    }
  }

  class Map {
    constructor(options) {
      this.options = options;
      maplibre.map = this;
      maplibre.handlers = {};
      maplibre.created += 1;
    }
    addControl() {}
    on(event, handler) {
      maplibre.handlers[event] = handler;
    }
    easeTo(options) {
      maplibre.easedTo = options;
    }
    getZoom() {
      return 12;
    }
    remove() {
      maplibre.removed += 1;
    }
  }

  class NavigationControl {}

  const api = { Map, Marker, NavigationControl };
  return { default: api, ...api };
});

// En el navegador este módulo le dice a MapLibre dónde quedó su worker. Aquí no
// hay worker que empaquetar y cargarlo solo haría las pruebas más lentas.
vi.mock('@/shared/maps/worker', () => ({}));

// --- Geoapify simulado ------------------------------------------------------
function feature(overrides = {}) {
  return {
    type: 'Feature',
    properties: {
      place_id: '51ejemplo',
      formatted: 'Av. Ilaló 123, Conocoto, Quito, Ecuador',
      address_line1: 'Av. Ilaló 123',
      address_line2: 'Conocoto, Quito, Ecuador',
      housenumber: '123',
      street: 'Av. Ilaló',
      suburb: 'Conocoto',
      city: 'Quito',
      state: 'Pichincha',
      postcode: '170157',
      country_code: 'ec',
      lat: -0.2969,
      lon: -78.4547,
      ...overrides,
    },
    geometry: { type: 'Point', coordinates: [overrides.lon ?? -78.4547, overrides.lat ?? -0.2969] },
  };
}

const provider = vi.hoisted(() => ({ calls: [] }));

/** Responde como Geoapify a autocomplete y reverse; `plan` decide el resultado. */
function mockProvider(plan = {}) {
  global.fetch = vi.fn((url) => {
    provider.calls.push(String(url));
    const operation = String(url).includes('/reverse') ? 'reverse' : 'autocomplete';
    const outcome = plan[operation];

    if (outcome === 'network') return Promise.reject(new TypeError('Failed to fetch'));
    if (outcome === 'error') {
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
    }

    const features =
      outcome === 'empty'
        ? []
        : operation === 'reverse'
          ? [feature(plan.reverseProperties ?? { street: 'Av. Los Shyris', housenumber: '45' })]
          : [feature(), feature({ place_id: '52ejemplo', address_line1: 'San Luis Shopping' })];

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ type: 'FeatureCollection', features }),
    });
  });
}

// --- Configuración regional simulada ---------------------------------------
vi.mock('@/shared/config/ConfigContext', () => ({
  useConfig: () => ({
    config: {
      maps: { regionCode: 'ec', bias: { center: { latitude: -0.18, longitude: -78.46 }, radiusMeters: 25000 } },
    },
    region: { address: { postalCodeRequired: false } },
    // Las etiquetas las pone la región, como en producción.
    addressLabel: (name) =>
      ({
        street_address: 'Calle y número',
        dependent_locality: 'Sector',
        locality: 'Ciudad',
        administrative_area: 'Provincia',
      })[name] ?? name,
    // Ningún campo obligatorio: así la prueba mide lo que le importa (qué
    // acaba en el formulario) y no la validación nativa del navegador.
    isAddressFieldRequired: () => false,
  }),
}));

const { default: AddressForm } = await import('./AddressForm');

/** El buscador espera a que la escritura se detenga: aquí se simula esa pausa. */
async function search(text) {
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: text } });
  return input;
}

/**
 * El motor del mapa se carga bajo demanda, así que primero se espera a que
 * monte y después se simula que terminó de cargar su estilo.
 */
async function mapReady() {
  await screen.findByRole('application');
  act(() => maplibre.handlers.load?.());
}

function clickMap(lat, lng) {
  act(() => maplibre.handlers.click?.({ lngLat: { lat, lng } }));
}

function dragMarkerTo(lat, lng) {
  act(() => {
    maplibre.marker.setLngLat({ lat, lng });
    maplibre.marker.handlers.dragend();
  });
}

function field(label) {
  return screen.getByLabelText(new RegExp(label, 'i'));
}

/**
 * Ponerle nombre al lugar. Es obligatorio y ya no viene puesto como "Casa": una
 * lista de direcciones llamadas todas igual no se puede usar cuando alguien
 * tiene su departamento, la casa de sus padres y una oficina.
 */
function nombrar(nombre = 'Mi casa') {
  fireEvent.change(field('¿Cómo llamas a este lugar'), { target: { value: nombre } });
}

/** jsdom no trae geolocalización: se añade solo para la prueba que la usa. */
function withGeolocation(getCurrentPosition) {
  Object.defineProperty(window.navigator, 'geolocation', {
    value: { getCurrentPosition },
    configurable: true,
  });
}

beforeEach(() => {
  vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'clave-de-prueba');
  maplibre.map = null;
  maplibre.marker = null;
  maplibre.handlers = {};
  maplibre.created = 0;
  maplibre.removed = 0;
  provider.calls = [];
  mockProvider();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete window.navigator.geolocation;
});

describe('Elegir la ubicación en el mapa', () => {
  it('elegir un resultado del buscador fija las coordenadas y propone la dirección', async () => {
    const onSubmit = vi.fn();
    render(<AddressForm onSubmit={onSubmit} />);
    await mapReady();

    await search('Conocoto');

    const option = await screen.findByText('Av. Ilaló 123');
    fireEvent.mouseDown(option);

    // La propuesta rellena el formulario, que sigue siendo editable.
    await waitFor(() => expect(field('Calle y número')).toHaveValue('Av. Ilaló 123'));
    expect(field('Ciudad')).toHaveValue('Quito');
    expect(field('Provincia')).toHaveValue('Pichincha');
    expect(field('Sector')).toHaveValue('Conocoto');

    // Y la coordenada queda guardada, que es el dato que importa de verdad.
    expect(screen.getByText(/-0\.29690, -78\.45470/)).toBeInTheDocument();

    nombrar();
    fireEvent.click(screen.getByRole('button', { name: /guardar dirección/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: -0.2969,
        longitude: -78.4547,
        providerPlaceId: '51ejemplo',
        geocodingProvider: 'GEOAPIFY',
      }),
    );
  });

  it('elegir un resultado no gasta una geocodificación inversa: ya trae los campos', async () => {
    render(<AddressForm onSubmit={vi.fn()} />);
    await mapReady();

    await search('Conocoto');
    fireEvent.mouseDown(await screen.findByText('Av. Ilaló 123'));

    await waitFor(() => expect(field('Ciudad')).toHaveValue('Quito'));
    expect(provider.calls.some((url) => url.includes('/reverse'))).toBe(false);
  });

  it('tocar el mapa mueve la ubicación y pide la dirección de ese punto', async () => {
    const onSubmit = vi.fn();
    render(<AddressForm onSubmit={onSubmit} />);
    await mapReady();

    clickMap(-0.19, -78.48);

    await waitFor(() => expect(field('Calle y número')).toHaveValue('Av. Los Shyris 45'));
    expect(screen.getByText(/-0\.19000, -78\.48000/)).toBeInTheDocument();

    nombrar();
    fireEvent.click(screen.getByRole('button', { name: /guardar dirección/i }));
    // La coordenada es la del punto tocado, no la que devolvió el proveedor.
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: -0.19, longitude: -78.48 }),
    );
  });

  it('arrastrar el pin actualiza las coordenadas al soltarlo, no antes', async () => {
    render(<AddressForm onSubmit={vi.fn()} />);
    await mapReady();

    clickMap(-0.19, -78.48);
    await waitFor(() => expect(maplibre.marker).not.toBeNull());

    const callsBeforeDrag = provider.calls.length;
    dragMarkerTo(-0.2, -78.49);

    await waitFor(() => expect(screen.getByText(/-0\.20000, -78\.49000/)).toBeInTheDocument());
    // Una sola petición por movimiento: al soltar. Ni una por píxel.
    expect(provider.calls.length).toBe(callsBeforeDrag + 1);
  });

  it('usar mi ubicación centra el punto en donde está la persona', async () => {
    withGeolocation((onSuccess) => onSuccess({ coords: { latitude: -0.3, longitude: -78.5 } }));

    render(<AddressForm onSubmit={vi.fn()} />);
    await mapReady();

    fireEvent.click(screen.getByRole('button', { name: /usar mi ubicación/i }));

    await waitFor(() => expect(screen.getByText(/-0\.30000, -78\.50000/)).toBeInTheDocument());
  });

  it('rechazar el permiso de ubicación no rompe nada: se avisa y se sigue', async () => {
    withGeolocation((_onSuccess, onError) => onError({ code: 1 }));

    render(<AddressForm onSubmit={vi.fn()} />);
    await mapReady();

    fireEvent.click(screen.getByRole('button', { name: /usar mi ubicación/i }));

    expect(await screen.findByText(/no pudimos obtener tu ubicación/i)).toBeInTheDocument();
    fireEvent.change(field('Calle y número'), { target: { value: 'Av. Ilaló' } });
    expect(field('Calle y número')).toHaveValue('Av. Ilaló');
  });
});

/**
 * El nombre del lugar.
 *
 * Es lo que la persona verá al reservar ("Mi departamento", "Casa de mis
 * padres"), así que lo escribe ella. Antes venía puesto como "Casa" y quien
 * tenía tres lugares acababa con tres "Casa" indistinguibles.
 */
describe('Ponerle nombre al lugar', () => {
  it('no viene puesto ninguno, y hay sugerencias para no tener que pensarlo', async () => {
    render(<AddressForm onSubmit={vi.fn()} />);
    await mapReady();

    expect(field('¿Cómo llamas a este lugar')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Casa de mis padres' }));
    expect(field('¿Cómo llamas a este lugar')).toHaveValue('Casa de mis padres');
  });

  it('sin nombre no se guarda: no se inventa uno por la persona', async () => {
    const onSubmit = vi.fn();
    render(<AddressForm onSubmit={onSubmit} />);
    await mapReady();

    fireEvent.change(field('Calle y número'), { target: { value: 'Av. Ilaló' } });
    fireEvent.change(field('Ciudad'), { target: { value: 'Quito' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar dirección/i }));

    expect(onSubmit).not.toHaveBeenCalled();

    nombrar('Casa del Valle');
    fireEvent.click(screen.getByRole('button', { name: /guardar dirección/i }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ label: 'Casa del Valle' }));
  });
});

describe('El mapa propone, la persona dispone', () => {
  it('mover el pin no pisa lo que se corrigió a mano', async () => {
    render(<AddressForm onSubmit={vi.fn()} />);
    await mapReady();

    await search('Conocoto');
    fireEvent.mouseDown(await screen.findByText('Av. Ilaló 123'));
    await waitFor(() => expect(field('Calle y número')).toHaveValue('Av. Ilaló 123'));

    // La persona corrige lo que el proveedor no puede saber.
    fireEvent.change(field('Calle y número'), {
      target: { value: 'Av. Ilaló, Conjunto Los Arrayanes, casa 18' },
    });

    // Afinar la posición de la misma casa no puede borrar esa corrección.
    clickMap(-0.2, -78.49);
    await waitFor(() => expect(screen.getByText(/-0\.20000, -78\.49000/)).toBeInTheDocument());

    expect(field('Calle y número')).toHaveValue('Av. Ilaló, Conjunto Los Arrayanes, casa 18');
    // Lo que no se tocó sí se actualiza con la propuesta nueva.
    expect(field('Ciudad')).toHaveValue('Quito');
  });

  it('un rerender del formulario no destruye lo escrito', async () => {
    const { rerender } = render(<AddressForm onSubmit={vi.fn()} />);
    await mapReady();

    fireEvent.change(field('Calle y número'), { target: { value: 'Escrito a mano' } });
    rerender(<AddressForm onSubmit={vi.fn()} submitting={false} error={null} />);

    expect(field('Calle y número')).toHaveValue('Escrito a mano');
  });

  it('"usar la dirección del mapa" es la acción explícita que sí sobrescribe', async () => {
    render(<AddressForm onSubmit={vi.fn()} />);
    await mapReady();

    clickMap(-0.19, -78.48);
    await waitFor(() => expect(field('Calle y número')).toHaveValue('Av. Los Shyris 45'));

    fireEvent.change(field('Calle y número'), { target: { value: 'Algo mío' } });
    fireEvent.click(screen.getByRole('button', { name: /usar la dirección del mapa/i }));

    expect(field('Calle y número')).toHaveValue('Av. Los Shyris 45');
  });
});

describe('Cuando el proveedor no está', () => {
  it('sin clave configurada, la dirección se escribe a mano y se guarda igual', async () => {
    vi.stubEnv('VITE_GEOAPIFY_API_KEY', '');
    const onSubmit = vi.fn();

    render(<AddressForm onSubmit={onSubmit} />);

    // Ni mapa ni buscador, pero el formulario está entero.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(maplibre.created).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/mapa no disponible/i)).toBeInTheDocument();

    fireEvent.change(field('Calle y número'), { target: { value: 'Av. Ilaló y Los Cipreses' } });
    fireEvent.change(field('Ciudad'), { target: { value: 'Quito' } });
    nombrar();
    fireEvent.click(screen.getByRole('button', { name: /guardar dirección/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        streetLine1: 'Av. Ilaló y Los Cipreses',
        city: 'Quito',
        latitude: null,
        longitude: null,
        providerPlaceId: null,
      }),
    );
  });

  it('si la geocodificación inversa falla, se conserva el punto y lo escrito', async () => {
    mockProvider({ reverse: 'network' });
    const onSubmit = vi.fn();

    render(<AddressForm onSubmit={onSubmit} />);
    await mapReady();

    fireEvent.change(field('Calle y número'), { target: { value: 'Mi calle de siempre' } });
    clickMap(-0.19, -78.48);

    expect(await screen.findByText(/no pudimos leer la dirección/i)).toBeInTheDocument();
    // Ni el punto ni el texto se pierden por un fallo de red.
    expect(field('Calle y número')).toHaveValue('Mi calle de siempre');
    expect(screen.getByText(/-0\.19000, -78\.48000/)).toBeInTheDocument();

    nombrar();
    fireEvent.click(screen.getByRole('button', { name: /guardar dirección/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: -0.19,
        longitude: -78.48,
        streetLine1: 'Mi calle de siempre',
        providerPlaceId: null,
      }),
    );
  });

  it('si la búsqueda falla, se puede reintentar sin perder nada', async () => {
    mockProvider({ autocomplete: 'network' });
    render(<AddressForm onSubmit={vi.fn()} />);
    await mapReady();

    await search('Conocoto');

    expect(await screen.findByText(/no pudimos buscar ahora mismo/i)).toBeInTheDocument();

    // Y con el proveedor de vuelta, el reintento funciona.
    mockProvider();
    fireEvent.mouseDown(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByText('Av. Ilaló 123')).toBeInTheDocument();
  });

  it('si el mapa no carga, quedan el buscador y el formulario', async () => {
    render(<AddressForm onSubmit={vi.fn()} />);
    await screen.findByRole('application');
    // El estilo nunca llega a cargar: MapLibre avisa antes del `load`.
    act(() => maplibre.handlers.error?.({ error: new Error('style') }));

    expect(await screen.findByText(/el mapa no cargó/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(field('Calle y número')).toBeInTheDocument();
  });
});

describe('Cuidar la cuota del proveedor', () => {
  it('no busca con textos demasiado cortos', async () => {
    render(<AddressForm onSubmit={vi.fn()} />);
    await mapReady();

    await search('av');
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(provider.calls.filter((url) => url.includes('/autocomplete'))).toHaveLength(0);
  });

  it('no lanza una petición por tecla: espera a que la escritura se detenga', async () => {
    render(<AddressForm onSubmit={vi.fn()} />);
    await mapReady();

    const input = screen.getByRole('combobox');
    for (const text of ['Con', 'Cono', 'Conoc', 'Conoco', 'Conocoto']) {
      fireEvent.change(input, { target: { value: text } });
    }

    await screen.findByText('Av. Ilaló 123');
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(provider.calls.filter((url) => url.includes('/autocomplete'))).toHaveLength(1);
  });

  it('orienta la búsqueda con las zonas de servicio, sin encerrarla en ellas', async () => {
    render(<AddressForm onSubmit={vi.fn()} />);
    await mapReady();

    await search('Conocoto');
    await screen.findByText('Av. Ilaló 123');

    const url = provider.calls.find((call) => call.includes('/autocomplete'));
    // Sesgo hacia donde opera la empresa (sale de service_zones, no de una
    // constante) y filtro por el país de la región.
    expect(url).toContain(encodeURIComponent('proximity:-78.46,-0.18'));
    expect(url).toContain(encodeURIComponent('countrycode:ec'));
    // Y ningún filtro que impida buscar fuera de esa zona.
    expect(url).not.toContain('circle%3A');
  });
});
