import { render, screen } from '@testing-library/react';
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
    expect(screen.getAllByText('Direcciones').length).toBeGreaterThan(0);
  });

  it('CUSTOMER tampoco entra a Trabajo', () => {
    signedInAs(['CUSTOMER']);
    renderAt('/trabajo');

    expect(screen.getAllByText('Direcciones').length).toBeGreaterThan(0);
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
 * Tres experiencias, una sola aplicación.
 *
 * Lo que se comprueba aquí es que cada servicio tenga su sitio y su navegación,
 * que lo común siga siendo común, y —lo más importante— que un servicio sin
 * flujo de reserva no ofrezca reservar.
 */
describe('Experiencias por servicio', () => {
  it('cada servicio tiene su pantalla con su navegación', async () => {
    signedInAs(['CUSTOMER']);
    const limpieza = renderAt('/limpieza');

    // Aparece en la barra de escritorio y en la de móvil: las dos son la misma
    // lista, pintada donde el pulgar la alcanza.
    expect((await screen.findAllByRole('link', { name: 'Mi hogar' })).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reservar').length).toBeGreaterThan(0);
    limpieza.unmount();

    renderAt('/lavanderia');
    expect((await screen.findAllByRole('link', { name: 'Mis pedidos' })).length).toBeGreaterThan(0);
    // La navegación es la del servicio en el que estás, no una lista común.
    expect(screen.queryAllByRole('link', { name: 'Mi hogar' })).toHaveLength(0);
  });

  it('se puede cambiar de servicio desde cualquier pantalla', async () => {
    signedInAs(['CUSTOMER']);
    renderAt('/limpieza');

    // El conmutador lleva a los tres, estés donde estés.
    for (const label of ['Limpieza', 'Lavandería', 'Arreglos']) {
      expect((await screen.findAllByRole('link', { name: label })).length).toBeGreaterThan(0);
    }
  });

  it('arreglo de prendas se presenta, pero no ofrece reservar', async () => {
    signedInAs(['CUSTOMER']);
    renderAt('/arreglos');

    expect(await screen.findByText(/Todavía no se puede reservar aquí/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Reservar/ })).not.toBeInTheDocument();
  });

  it('las rutas antiguas siguen llevando a donde ahora vive cada cosa', async () => {
    signedInAs(['CUSTOMER']);

    const reservar = renderAt('/reservar?servicio=LAUNDRY');
    // El asistente de lavandería, con el servicio ya fijado.
    expect((await screen.findAllByRole('link', { name: 'Mis pedidos' })).length).toBeGreaterThan(0);
    reservar.unmount();

    renderAt('/inmuebles');
    expect((await screen.findAllByText('Mi hogar')).length).toBeGreaterThan(0);
  });

  it('el inicio ofrece los tres servicios y solo deja reservar los que existen', async () => {
    signedInAs(['CUSTOMER']);
    renderAt('/inicio');

    expect(await screen.findByText('Nuestros servicios')).toBeInTheDocument();
    // Dos reservables, uno todavía no.
    expect(screen.getAllByRole('link', { name: 'Reservar' })).toHaveLength(2);
    expect(screen.getByText('Muy pronto')).toBeInTheDocument();
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

    expect((await screen.findAllByText('Direcciones')).length).toBeGreaterThan(0);
  });
});
