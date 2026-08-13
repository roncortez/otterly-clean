import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { I18nProvider } from '@/shared/i18n/I18nContext';

/**
 * Enrutado por roles y por estado del perfil.
 *
 * El backend es quien decide de verdad; estas pruebas cubren la otra mitad: que
 * nadie vea una consola que no le corresponde, que quien tiene dos roles pueda
 * usar las dos sin cerrar sesión, y que quien tiene el perfil a medias acabe en
 * el onboarding escriba la URL que escriba.
 */

// Sin red en las pruebas: cualquier pantalla que pida datos recibe una respuesta
// vacía y renderiza su estado por defecto.
vi.mock('@/shared/api/client', () => {
  const resolved = () => Promise.resolve({ data: {} });

  /**
   * El onboarding lee su estado del backend. Aquí se devuelve el mismo que
   * declara la sesión simulada, para que la pantalla y la guarda no puedan
   * contarse cosas distintas.
   */
  const get = (path) => {
    if (!path?.includes('/me/onboarding')) return resolved();
    const onboarding = mockAuth.current?.user?.onboarding ?? { pending: false, scope: null };
    return Promise.resolve({
      data: {
        onboarding: {
          ...onboarding,
          steps: onboarding.pending
            ? [
                {
                  code: 'PERSONAL',
                  title: 'Tu información',
                  pending: true,
                  fields: [
                    { key: 'phone', label: 'Teléfono', type: 'phone', required: true, pending: true },
                  ],
                },
              ]
            : [],
          values: {},
          missing: onboarding.pending ? ['phone'] : [],
        },
      },
    });
  };

  return {
    api: { get, post: resolved, patch: resolved, put: resolved, delete: resolved },
    default: { get, post: resolved, patch: resolved, put: resolved, delete: resolved },
    tokenStore: { getAccess: () => null, setAccess: () => {}, getRefresh: () => null, setRefresh: () => {}, clear: () => {} },
    setSessionExpiredHandler: () => {},
    errorMessage: () => 'error',
    errorCode: () => null,
  };
});

/**
 * Catálogo tal como lo sirve el backend: limpieza y lavandería reservables,
 * arreglo de prendas declarado pero sin flujo (`implemented: false`). Es la
 * diferencia que la interfaz tiene que respetar.
 */
const SERVICE_TYPES = [
  {
    code: 'CLEANING',
    label: 'Limpieza',
    description: 'Limpieza a domicilio',
    implemented: true,
    active: true,
    bookable: true,
    displayOrder: 1,
  },
  {
    code: 'LAUNDRY',
    label: 'Lavandería',
    description: 'Recogida y entrega',
    implemented: true,
    active: true,
    bookable: true,
    displayOrder: 2,
  },
  {
    code: 'ALTERATION',
    label: 'Arreglos',
    description: 'Ajustes y costura',
    implemented: false,
    active: true,
    bookable: false,
    displayOrder: 3,
  },
];

vi.mock('@/shared/config/ConfigContext', () => ({
  useConfig: () => ({
    company: { name: 'Otterly Clean', logoUrl: '', whatsapp: '', phone: '', email: '' },
    serviceTypes: SERVICE_TYPES,
    region: null,
    isLoading: false,
    money: (cents) => String(cents),
    timeWindows: () => [],
    minLeadTimeHours: 3,
    areaUnit: 'm2',
  }),
  ConfigProvider: ({ children }) => children,
}));

const mockAuth = vi.hoisted(() => ({ current: null }));

vi.mock('@/shared/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAuth: () => mockAuth.current,
  };
});

const { default: App } = await import('@/App');

function signedInAs(roles, onboarding = null) {
  mockAuth.current = {
    user: { id: 1, firstName: 'Paula', roles, onboarding },
    roles,
    status: 'authenticated',
    isAuthenticated: true,
    isLoading: false,
    hasRole: (role) => roles.includes(role),
    needsOnboarding: Boolean(onboarding?.pending),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    applyExternalSession: vi.fn(),
  };
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <I18nProvider>
        <App />
      </I18nProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockAuth.current = null;
  // El borrador de reserva vive en localStorage y sobrevive entre pruebas: sin
  // esto, una que empieza una reserva deja a la siguiente con el asistente ya
  // relleno en vez de con el selector.
  window.localStorage.clear();
});

describe('Acceso por roles', () => {
  it('ADMIN entra a Operaciones', () => {
    signedInAs(['ADMIN']);
    renderAt('/operaciones');

    expect(screen.getAllByText('Solicitudes').length).toBeGreaterThan(0);
  });

  it('STAFF entra a Trabajo', () => {
    signedInAs(['STAFF']);
    renderAt('/trabajo');

    expect(screen.getByText('Paula')).toBeInTheDocument();
  });

  it('CUSTOMER no entra a Operaciones: lo devuelve a su inicio', () => {
    signedInAs(['CUSTOMER']);
    renderAt('/operaciones');

    expect(screen.queryByText('Solicitudes')).not.toBeInTheDocument();
    expect(screen.getAllByText('Servicios').length).toBeGreaterThan(0);
  });

  it('CUSTOMER tampoco entra a Trabajo', () => {
    signedInAs(['CUSTOMER']);
    renderAt('/trabajo');

    expect(screen.getAllByText('Servicios').length).toBeGreaterThan(0);
  });

  it('STAFF no entra a Operaciones', () => {
    signedInAs(['STAFF']);
    renderAt('/operaciones');

    expect(screen.queryByText('Solicitudes')).not.toBeInTheDocument();
  });

  it('ADMIN + STAFF entra a las dos consolas', () => {
    signedInAs(['ADMIN', 'STAFF']);

    const operaciones = renderAt('/operaciones');
    expect(screen.getAllByText('Solicitudes').length).toBeGreaterThan(0);
    // Y puede saltar a la otra consola sin cerrar sesión.
    expect(screen.getByText('Ir a mis trabajos')).toBeInTheDocument();
    operaciones.unmount();

    renderAt('/trabajo');
    expect(screen.getByLabelText('Ir a Operaciones')).toBeInTheDocument();
  });

  it('un STAFF sin ADMIN no ve el atajo a Operaciones', () => {
    signedInAs(['STAFF']);
    renderAt('/trabajo');

    expect(screen.queryByLabelText('Ir a Operaciones')).not.toBeInTheDocument();
  });

  it('sin sesión, las rutas privadas llevan a entrar', () => {
    mockAuth.current = {
      user: null,
      roles: [],
      status: 'anonymous',
      isAuthenticated: false,
      isLoading: false,
      hasRole: () => false,
      needsOnboarding: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      applyExternalSession: vi.fn(),
    };

    renderAt('/operaciones');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('el acceso se abre como panel, con la página detrás', () => {
    mockAuth.current = {
      user: null,
      roles: [],
      status: 'anonymous',
      isAuthenticated: false,
      isLoading: false,
      hasRole: () => false,
      needsOnboarding: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      applyExternalSession: vi.fn(),
    };

    renderAt('/entrar');

    // Es un diálogo sobre la portada, no una pantalla completa aparte.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
    // Y la portada sigue montada detrás.
    expect(screen.getAllByRole('banner').length).toBeGreaterThan(0);
  });
});

/**
 * Navegación del cliente.
 *
 * NOTA DE INTEGRACION: `feat/maplibre-geoapify` separaba la aplicación en cuatro
 * contextos con navegación propia por servicio (`/limpieza`, `/lavanderia`...).
 * La integración conserva la barra de `fix/booking-flow`, con un cambio:
 * Direcciones y Lugares salen de la navegación principal y pasan a Perfil,
 * porque son configuración de la cuenta y ocupaban dos de los cuatro huecos de
 * la barra inferior. Lo que se comprueba aquí es esa frontera —qué se ve a
 * diario y qué se configura una vez— y que los enlaces antiguos sigan llevando
 * a donde ahora vive cada cosa.
 */
describe('Navegación del cliente', () => {
  it('la barra principal es lo de cada día, sin configuración de la cuenta', async () => {
    signedInAs(['CUSTOMER']);
    renderAt('/inicio');

    for (const label of ['Inicio', 'Servicios', 'Productos']) {
      expect((await screen.findAllByRole('link', { name: label })).length).toBeGreaterThan(0);
    }
    // Direcciones y Lugares ya no compiten con lo que se usa a diario.
    expect(screen.queryByRole('link', { name: 'Direcciones' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Lugares/ })).not.toBeInTheDocument();
  });

  /**
   * El botón principal abre el selector ahí mismo. Antes navegaba a una
   * pantalla intermedia cuyo único contenido era otro botón para abrir este
   * mismo modal.
   */
  it('«¿Qué necesitas?» abre el selector sin cambiar de pantalla', async () => {
    signedInAs(['CUSTOMER']);
    renderAt('/inicio');

    fireEvent.click((await screen.findAllByRole('button', { name: /¿Qué necesitas\?/ }))[0]);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Limpieza')).toBeInTheDocument();
    expect(within(dialog).getByText('Lavandería')).toBeInTheDocument();
    // Kits se llamaba así y llevaba al asistente de reserva de otro servicio.
    expect(within(dialog).getByText('Productos')).toBeInTheDocument();
    expect(within(dialog).queryByText('Kits')).not.toBeInTheDocument();
    // Arreglos no se ofrece: el dominio no sabe crear esa orden todavía.
    expect(within(dialog).queryByText('Arreglos')).not.toBeInTheDocument();
  });

  it('el perfil tiene su propia navegación, en el orden en que se usa', async () => {
    signedInAs(['CUSTOMER']);
    renderAt('/mi-perfil');

    const nav = await screen.findByRole('navigation', { name: 'Secciones del perfil' });
    const links = within(nav).getAllByRole('link');

    // Primero existe una dirección; después el lugar que hay en ella.
    expect(links.map((link) => link.textContent)).toEqual([
      'Datos personales',
      'Direcciones',
      'Lugares para limpieza',
    ]);
  });

  it('quien no es cliente no ve pestañas que no le corresponden', async () => {
    signedInAs(['STAFF']);
    renderAt('/mi-perfil');

    expect(screen.queryByRole('link', { name: 'Direcciones' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Lugares para limpieza' })).not.toBeInTheDocument();
  });

  it('las rutas antiguas siguen llevando a donde ahora vive cada cosa', async () => {
    signedInAs(['CUSTOMER']);

    const direcciones = renderAt('/direcciones');
    expect(await screen.findByRole('navigation', { name: 'Secciones del perfil' })).toBeInTheDocument();
    expect(screen.getAllByText('Tus direcciones').length).toBeGreaterThan(0);
    direcciones.unmount();

    // `/inmuebles` y la ruta de espacios de la otra rama acaban en la misma
    // pantalla: un cliente tiene lugares, y son los mismos se llegue por donde
    // se llegue.
    const inmuebles = renderAt('/inmuebles');
    expect(await screen.findByRole('navigation', { name: 'Secciones del perfil' })).toBeInTheDocument();
    inmuebles.unmount();

    renderAt('/limpieza/espacios');
    expect(await screen.findByRole('navigation', { name: 'Secciones del perfil' })).toBeInTheDocument();
  });
});

/**
 * Reservar no exige cuenta hasta el final.
 *
 * Un visitante de la portada puede elegir servicio y rellenar la reserva; la
 * sesión se pide justo antes de confirmar. El backend sigue exigiendo CUSTOMER
 * autenticado para crear la orden: esto abre el formulario, no la API.
 */
describe('Reservar sin sesión', () => {
  function anonymous() {
    mockAuth.current = {
      user: null,
      roles: [],
      status: 'anonymous',
      isAuthenticated: false,
      isLoading: false,
      hasRole: () => false,
      needsOnboarding: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      applyExternalSession: vi.fn(),
    };
  }

  it('un visitante entra al asistente sin que lo manden a iniciar sesión', async () => {
    anonymous();
    renderAt('/reservar?servicio=CLEANING');

    // No hay panel de acceso: hay asistente.
    expect(screen.queryByRole('dialog', { name: 'Entra a tu cuenta' })).not.toBeInTheDocument();
    expect(await screen.findByText('Tu servicio')).toBeInTheDocument();
    // Y se le ofrece entrar, sin obligarle.
    expect(screen.getAllByRole('link', { name: 'Entrar' }).length).toBeGreaterThan(0);
  });

  it('el catálogo de productos también es público', async () => {
    anonymous();
    renderAt('/productos');

    expect(await screen.findByText('Los productos que usamos')).toBeInTheDocument();
  });

  it('sin servicio elegido, /reservar pregunta cuál en lugar de una pantalla intermedia', async () => {
    anonymous();
    renderAt('/reservar');

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Limpieza')).toBeInTheDocument();
    // El paso que se elimina: ya no hay un botón "Comenzar reserva" que abra
    // este mismo modal desde otra pantalla.
    expect(screen.queryByRole('button', { name: 'Comenzar reserva' })).not.toBeInTheDocument();
  });
});

describe('Guarda de onboarding', () => {
  it('con el perfil a medias, cualquier ruta lleva al onboarding', async () => {
    signedInAs(['STAFF'], { pending: true, scope: 'STAFF' });
    renderAt('/trabajo');

    // Acaba en el asistente, no en su panel de trabajos.
    expect(await screen.findByText('Tu información')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ir a Operaciones')).not.toBeInTheDocument();
  });

  it('tampoco puede saltárselo escribiendo otra URL', async () => {
    signedInAs(['ADMIN', 'STAFF'], { pending: true, scope: 'STAFF' });
    renderAt('/operaciones');

    expect(await screen.findByText('Tu información')).toBeInTheDocument();
    expect(screen.queryByText('Solicitudes')).not.toBeInTheDocument();
  });

  it('con el perfil completo entra con normalidad y no vuelve al onboarding', () => {
    signedInAs(['STAFF'], { pending: false, scope: null });
    renderAt('/trabajo');

    expect(screen.getByText('Paula')).toBeInTheDocument();
  });

  it('quien no tiene nada pendiente y abre /onboarding vuelve a su panel', async () => {
    signedInAs(['CUSTOMER'], { pending: false, scope: null });
    renderAt('/onboarding');

    expect((await screen.findAllByText('Servicios')).length).toBeGreaterThan(0);
  });
});
