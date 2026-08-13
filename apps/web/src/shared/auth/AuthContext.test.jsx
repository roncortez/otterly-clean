import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * La sesión sobrevive a una recarga.
 *
 * El servidor rota el refresh token en cada uso, así que dos llamadas con el
 * mismo token no pueden ganar las dos. El efecto de arranque de React se
 * ejecuta dos veces en modo estricto, que es justo lo que pasaba al recargar en
 * desarrollo: la segunda llamada presentaba un token ya gastado, recibía 401 y
 * cerraba la sesión de alguien que solo pulsó F5.
 *
 * El servidor simulado aquí se comporta como el real —rota y revoca— para que
 * la prueba falle si el cliente vuelve a pedir dos veces.
 */

const server = vi.hoisted(() => ({
  /** Tokens que todavía sirven. Usar uno lo consume, como en la base. */
  valid: new Set(),
  calls: [],
  issued: 0,
  /** Si el servidor está caído, `refresh` falla sin decir nada de la sesión. */
  down: false,
}));

const axiosPost = vi.hoisted(() =>
  vi.fn(async (url, body) => {
    server.calls.push({ url, body });

    if (server.down) {
      const error = new Error('Network Error');
      error.request = {};
      throw error;
    }

    if (!server.valid.has(body.refreshToken)) {
      const error = new Error('Unauthorized');
      error.response = { status: 401, data: { error: { code: 'UNAUTHORIZED' } } };
      throw error;
    }

    // Rotación: el que se usa deja de valer y se emite otro.
    server.valid.delete(body.refreshToken);
    server.issued += 1;
    const next = `refresh-${server.issued}`;
    server.valid.add(next);

    return {
      data: {
        accessToken: `access-${server.issued}`,
        refreshToken: next,
        user: { id: 7, firstName: 'Ana', roles: ['CUSTOMER'], onboarding: { pending: false } },
      },
    };
  }),
);

vi.mock('axios', () => {
  const instance = {
    defaults: { baseURL: '/api' },
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    get: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
  };
  return { default: { create: () => instance, post: axiosPost } };
});

const { AuthProvider, useAuth } = await import('@/shared/auth/AuthContext');
const { tokenStore } = await import('@/shared/api/client');

function SessionProbe() {
  const { status, user } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.firstName ?? '—'}</span>
    </div>
  );
}

function renderApp() {
  return render(
    <StrictMode>
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>
    </StrictMode>,
  );
}

beforeEach(() => {
  server.valid.clear();
  server.calls.length = 0;
  server.issued = 0;
  server.down = false;
  axiosPost.mockClear();
  localStorage.clear();
  tokenStore.clear();
});

describe('Recuperar la sesión al cargar', () => {
  it('una sesión válida sobrevive a la recarga', async () => {
    server.valid.add('refresh-guardado');
    tokenStore.setRefresh('refresh-guardado');

    renderApp();

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('user').textContent).toBe('Ana');
    // Y el token rotado queda guardado para la siguiente recarga.
    expect(tokenStore.getRefresh()).toBe('refresh-1');
  });

  it('no gasta el token dos veces aunque el efecto se ejecute dos veces', async () => {
    server.valid.add('refresh-guardado');
    tokenStore.setRefresh('refresh-guardado');

    renderApp();

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    // Una sola llamada: si se hicieran dos, la segunda llegaría con un token ya
    // rotado y el servidor la rechazaría.
    expect(axiosPost).toHaveBeenCalledTimes(1);
  });

  it('sin token guardado no se llama a nadie: simplemente no hay sesión', async () => {
    renderApp();

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it('una sesión revocada termina de verdad y borra lo guardado', async () => {
    tokenStore.setRefresh('token-revocado');

    renderApp();

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    expect(tokenStore.getRefresh()).toBeNull();
  });

  it('si el servidor no responde, no se borra la sesión guardada', async () => {
    server.down = true;
    tokenStore.setRefresh('refresh-guardado');

    renderApp();

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'));
    // Un fallo de red no es una sesión caducada: al volver la conexión, recargar
    // tiene que bastar para entrar.
    expect(tokenStore.getRefresh()).toBe('refresh-guardado');
  });
});
