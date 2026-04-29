import React, { ReactNode, useEffect, useState } from 'react';

import { AUTH_EXPIRED_EVENT, clearAuthToken, getAuthToken } from '../api/client';
import { AuthContext } from './auth-context';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => getAuthToken());

  useEffect(() => {
    if (!token) {
      return;
    }

    // We do not rely on local Date.now() check for token expiration
    // because client clock might drift significantly from the backend clock
    // (e.g. Docker on Windows sleep bug). 
    // If the token is invalid or expired, the backend will return a 401,
    // which will trigger AUTH_EXPIRED_EVENT and clear the token below.
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
    localStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const logout = () => {
    clearAuthToken();
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
};
