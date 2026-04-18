import React, { ReactNode, useEffect, useState } from 'react';

import { AUTH_EXPIRED_EVENT, clearAuthToken, getAuthToken, getTokenExpirationTime, isTokenExpired } from '../api/client';
import { AuthContext } from './auth-context';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => getAuthToken());

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      clearAuthToken();
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    if (isTokenExpired(token)) {
      setToken(null);
      return;
    }

    const expirationTime = getTokenExpirationTime(token);
    if (!expirationTime) {
      setToken(null);
      return;
    }

    const timerId = window.setTimeout(() => {
      setToken(null);
    }, Math.max(expirationTime - Date.now(), 0));

    return () => {
      window.clearTimeout(timerId);
    };
  }, [token]);

  useEffect(() => {
    const handleAuthExpired = () => {
      setToken(null);
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, []);

  const login = (newToken: string) => {
    setToken(newToken);
  };

  const logout = () => {
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
};
