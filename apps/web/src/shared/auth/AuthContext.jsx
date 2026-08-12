import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore, setSessionExpiredHandler } from '@/shared/api/client';

const AuthContext = createContext(null);

/**
 * Sesión del usuario.
 *
 * Al arrancar intenta recuperar la sesión con el refresh token guardado, para
 * que recargar la página no obligue a iniciar sesión otra vez.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authenticated | anonymous

  const applySession = useCallback((session) => {
    tokenStore.setAccess(session.accessToken);
    tokenStore.setRefresh(session.refreshToken);
    setUser(session.user);
    setStatus('authenticated');
  }, []);

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus('anonymous');
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      setStatus('anonymous');
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const refreshToken = tokenStore.getRefresh();
      if (!refreshToken) {
        setStatus('anonymous');
        return;
      }

      try {
        const { data } = await api.post('/auth/refresh', { refreshToken });
        if (cancelled) return;
        applySession(data);
      } catch {
        if (!cancelled) clearSession();
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
  }, [applySession, clearSession]);

  const login = useCallback(
    async (credentials) => {
      const { data } = await api.post('/auth/login', credentials);
      applySession(data);
      return data.user;
    },
    [applySession],
  );

  const register = useCallback(
    async (payload) => {
      const { data } = await api.post('/auth/register', payload);
      applySession(data);
      return data.user;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    const refreshToken = tokenStore.getRefresh();
    try {
      await api.post('/auth/logout', { refreshToken });
    } catch {
      // Cerrar sesión local aunque el servidor no responda.
    }
    clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      // Lista completa de roles. Una persona puede ser ADMIN y STAFF a la vez.
      roles: user?.roles ?? [],
      status,
      isAuthenticated: status === 'authenticated',
      isLoading: status === 'loading',
      hasRole: (role) => Boolean(user?.roles?.includes(role)),
      login,
      register,
      logout,
    }),
    [user, status, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}

/**
 * Ruta de inicio segun los roles.
 *
 * Con varios roles hace falta un desempate: se entra por la consola de mayor
 * responsabilidad y desde ahí se puede saltar a las demas. El orden es el mismo
 * que usa el backend en `domain/shared/roles.js`.
 */
export function homePathForRoles(roles = []) {
  if (roles.includes('ADMIN')) return '/operaciones';
  if (roles.includes('STAFF')) return '/trabajo';
  return '/inicio';
}
