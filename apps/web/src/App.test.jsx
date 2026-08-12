import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Enrutado por roles.
 *
 * El backend es quien decide de verdad; estas pruebas cubren la otra mitad: que
 * nadie vea una consola que no le corresponde y que quien tiene dos roles pueda
 * usar las dos sin cerrar sesión.
 */

// Sin red en las pruebas: cualquier pantalla que pida datos recibe una respuesta
// vacía y renderiza su estado por defecto.
vi.mock('@/shared/api/client', () => {
  const resolved = () => Promise.resolve({ data: {} });
  return {
    api: { get: resolved, post: resolved, patch: resolved, put: resolved, delete: resolved },
    default: { get: resolved, post: resolved, patch: resolved, put: resolved, delete: resolved },
    tokenStore: { getAccess: () => null, setAccess: () => {}, getRefresh: () => null, setRefresh: () => {}, clear: () => {} },
    setSessionExpiredHandler: () => {},
    errorMessage: () => 'error',
    errorCode: () => null,
  };
});

vi.mock('@/shared/config/ConfigContext', () => ({
  useConfig: () => ({
    company: { name: 'Otterly Clean', logoUrl: '', whatsapp: '', phone: '', email: '' },
    serviceTypes: [],
    region: null,
    isLoading: false,
    money: (cents) => String(cents),
    timeWindows: () => [],
    minLeadTimeHours: 3,
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

function signedInAs(roles) {
  mockAuth.current = {
    user: { id: 1, firstName: 'Paula', roles },
    roles,
    status: 'authenticated',
    isAuthenticated: true,
    isLoading: false,
    hasRole: (role) => roles.includes(role),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  };
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
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
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    };

    renderAt('/operaciones');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });
});
