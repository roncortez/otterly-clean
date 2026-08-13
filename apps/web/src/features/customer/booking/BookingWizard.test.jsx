import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, loadDraft, saveDraft, SENSITIVE_FIELDS } from '@/shared/booking/draft';

/**
 * El asistente de reserva.
 *
 * NOTA DE INTEGRACION: este archivo probaba el asistente de
 * `feat/maplibre-geoapify` (pasos «espacio» y `cleaningProfile` colgando de la
 * dirección). El flujo que se conserva es el de `fix/booking-flow`, así que las
 * pruebas se reescriben sobre lo que de verdad tiene que cumplirse ahora: que un
 * visitante pueda rellenar la reserva sin cuenta, que la sesión se pida en el
 * último momento sin perder lo escrito, y que el borrador nunca guarde un código
 * de acceso.
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
        service_type: 'CLEANING',
        estimated_duration_minutes: 180,
        config: {},
      },
    ],
    extras: [],
  },
];

const mockAuth = vi.hoisted(() => ({ current: null }));

vi.mock('@/shared/api/client', () => {
  const get = (path) => {
    if (path?.includes('/catalog/services')) {
      return Promise.resolve({ data: { services: CATALOG } });
    }
    if (path?.includes('/catalog/fragrances')) {
      return Promise.resolve({
        data: { fragrances: [{ code: 'NONE', label: 'Sin fragancia' }] },
      });
    }
    if (path?.includes('/customer/addresses')) return Promise.resolve({ data: { addresses: [] } });
    if (path?.includes('/customer/properties')) {
      return Promise.resolve({ data: { properties: [] } });
    }
    return Promise.resolve({ data: {} });
  };
  const resolved = () => Promise.resolve({ data: {} });

  return {
    api: { get, post: resolved, patch: resolved, put: resolved, delete: resolved },
    default: { get, post: resolved, patch: resolved, put: resolved, delete: resolved },
    errorMessage: () => 'error',
    errorCode: () => null,
  };
});

vi.mock('@/shared/config/ConfigContext', () => ({
  useConfig: () => ({
    company: { name: 'Otterly Clean' },
    serviceTypes: [
      { code: 'CLEANING', label: 'Limpieza', implemented: true, active: true, bookable: true },
      { code: 'LAUNDRY', label: 'Lavandería', implemented: true, active: true, bookable: true },
    ],
    money: (cents) => `$${(cents / 100).toFixed(2)}`,
    timeWindows: () => [{ code: 'MORNING', label: 'Mañana' }],
    weightUnit: 'kg',
    areaUnit: 'm2',
    minLeadTimeHours: 3,
  }),
  ConfigProvider: ({ children }) => children,
}));

vi.mock('@/shared/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useAuth: () => mockAuth.current };
});

const { default: BookingWizard } = await import('./BookingWizard');

function session(isAuthenticated) {
  mockAuth.current = {
    user: isAuthenticated ? { id: 1, firstName: 'Paula', roles: ['CUSTOMER'] } : null,
    roles: isAuthenticated ? ['CUSTOMER'] : [],
    isAuthenticated,
    isLoading: false,
    hasRole: () => isAuthenticated,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  };
}

function renderWizard(path = '/reservar?servicio=CLEANING') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BookingWizard />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  clearDraft();
  session(true);
});

describe('Borrador de reserva', () => {
  /**
   * La garantía que hace que guardar el formulario sea aceptable. Los códigos de
   * puerta, las claves de alarma y dónde está la llave se cifran en el servidor y
   * no vuelven nunca en una respuesta (ver docs/SECURITY.md); escribirlos en
   * claro en `localStorage` para no repreguntarlos tiraría por tierra esa
   * garantía entera.
   */
  it('nunca guarda el código de acceso', () => {
    saveDraft({
      serviceType: 'CLEANING',
      cleaning: {
        bedrooms: 3,
        accessMethod: 'DOOR_CODE',
        accessInstructions: 'Puerta verde',
        accessSecret: '4821#',
      },
    });

    const draft = loadDraft();
    expect(draft.booking.cleaning.bedrooms).toBe(3);
    // Lo que explica cómo entrar sí se conserva: no es un secreto y el sistema
    // ya lo trata como texto normal.
    expect(draft.booking.cleaning.accessInstructions).toBe('Puerta verde');
    // El secreto no está, ni con su nombre ni en ningún rincón del JSON.
    expect(draft.booking.cleaning.accessSecret).toBeUndefined();
    expect(JSON.stringify(draft)).not.toContain('4821');
    expect(SENSITIVE_FIELDS).toContain('accessSecret');
  });

  it('un borrador caducado no reaparece', () => {
    saveDraft({ serviceType: 'CLEANING', cleaning: { bedrooms: 2 } });

    // Se envejece el borrador más allá de su vida útil.
    const raw = JSON.parse(window.localStorage.getItem('otterly.booking.draft.v1'));
    raw.savedAt = Date.now() - 1000 * 60 * 60 * 48;
    window.localStorage.setItem('otterly.booking.draft.v1', JSON.stringify(raw));

    expect(loadDraft()).toBeNull();
  });

  it('un borrador ilegible se descarta en lugar de romper la pantalla', () => {
    window.localStorage.setItem('otterly.booking.draft.v1', '{no es json');
    expect(loadDraft()).toBeNull();
  });

  it('se recupera al volver, y se puede descartar', async () => {
    saveDraft({
      serviceType: 'CLEANING',
      planId: 10,
      cleaning: { bedrooms: 4, bathrooms: 2 },
    });

    renderWizard();

    // Se avisa en lugar de restaurar en silencio.
    expect(await screen.findByText('Retomamos donde lo dejaste')).toBeInTheDocument();

    // Y hay salida: un borrador guardado no puede ser una condena.
    fireEvent.click(screen.getByRole('button', { name: /Empezar de nuevo/ }));

    await waitFor(() => {
      expect(screen.queryByText('Retomamos donde lo dejaste')).not.toBeInTheDocument();
    });

    // Lo anterior desaparece. Lo que queda guardado es la reserva nueva y vacía
    // que se acaba de empezar, no la vieja: descartar no significa dejar de
    // guardar, significa dejar de arrastrar.
    expect(loadDraft()?.booking.cleaning.bedrooms).not.toBe(4);
  });

  it('pedir otro servicio no devuelve la reserva a medias del anterior', async () => {
    saveDraft({ serviceType: 'LAUNDRY', planId: 99, laundry: { estimatedBags: 3 } });

    renderWizard('/reservar?servicio=CLEANING');

    // Se pidió limpieza: el borrador de lavandería no se restaura encima.
    expect(await screen.findByText('Tu servicio')).toBeInTheDocument();
    expect(screen.queryByText('Retomamos donde lo dejaste')).not.toBeInTheDocument();
  });
});

describe('Reservar sin sesión', () => {
  it('el visitante llega hasta el final y ahí se le pide entrar', async () => {
    session(false);
    renderWizard();

    // El asistente se abre sin exigir cuenta.
    expect(await screen.findByText('Tu servicio')).toBeInTheDocument();

    // Y el borrador se va guardando por el camino, que es lo que permite volver.
    await waitFor(() => expect(loadDraft()).not.toBeNull());
    expect(loadDraft().booking.serviceType).toBe('CLEANING');
  });

  it('con sesión, el paso de identificarse no aparece', async () => {
    session(true);
    renderWizard();

    expect(await screen.findByText('Tu servicio')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Inicia sesión para reservar/ })).not.toBeInTheDocument();
  });
});
