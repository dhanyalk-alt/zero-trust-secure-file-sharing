import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api/client';

const AuthContext = createContext(null);

const parseKeys = (saved) => {
  if (!saved) return {};
  try { return JSON.parse(saved) || {}; } catch { return {}; }
};

const loadKeysForUser = (user) => {
  if (!user) return null;
  const saved = localStorage.getItem('user_private_keys_by_username');
  if (!saved) return null;
  const keysByIdentity = parseKeys(saved);
  const idKey = user.id == null ? null : `id:${user.id}`;
  if (idKey && keysByIdentity[idKey]) return keysByIdentity[idKey];

  // Migrate keys written by older versions, which were indexed by mutable username.
  const usernameKey = user.username?.toLowerCase();
  const legacyKeys = usernameKey ? keysByIdentity[usernameKey] : null;
  if (!legacyKeys) return null;
  if (idKey) {
    keysByIdentity[idKey] = legacyKeys;
    localStorage.setItem('user_private_keys_by_username', JSON.stringify(keysByIdentity));
  }
  return legacyKeys;
};

const migrateLegacyKeysForUser = (username) => {
  const savedUser = localStorage.getItem('user');
  if (!username || !savedUser) return null;

  const previousUser = JSON.parse(savedUser);
  if (previousUser.username?.toLowerCase() !== username.toLowerCase()) return null;

  const legacyKeys = localStorage.getItem('user_private_keys');
  if (!legacyKeys) return null;

  const keys = JSON.parse(legacyKeys);
  const storageKey = 'user_private_keys_by_username';
  const keysByUsername = parseKeys(localStorage.getItem(storageKey));
  keysByUsername[username.toLowerCase()] = keys;
  localStorage.setItem(storageKey, JSON.stringify(keysByUsername));
  localStorage.removeItem('user_private_keys');
  return keys;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [privateKeys, setPrivateKeys] = useState(() => loadKeysForUser(user));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      authAPI.getMe()
        .then((res) => {
          const userKeys = loadKeysForUser(res.data) || migrateLegacyKeysForUser(res.data.username);
          setUser(res.data);
          setPrivateKeys(userKeys);
          localStorage.setItem('user', JSON.stringify(res.data));
        })
        .catch(() => {
          logout();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (username, password) => {
    const res = await authAPI.login({ username, password });
    const { access_token, user: loggedUser } = res.data;
    const userKeys = loadKeysForUser(loggedUser) || migrateLegacyKeysForUser(loggedUser.username);
    localStorage.setItem('token', access_token);
    localStorage.setItem('user', JSON.stringify(loggedUser));
    setToken(access_token);
    setUser(loggedUser);
    setPrivateKeys(userKeys);
    return res.data;
  };

  const register = async (regData) => {
    const res = await authAPI.register(regData);
    if (res.data.generated_keypairs) {
      // Store provisioned keys locally for this user
      const keys = {
        encryption_private_key: res.data.generated_keypairs.encryption_private_key,
        signing_private_key: res.data.generated_keypairs.signing_private_key
      };
      savePrivateKeys(keys, res.data.user);
    }
    return res.data;
  };

  const logout = async () => {
    try {
      if (token) {
        await authAPI.logout();
      }
    } catch (e) {
      // Ignore logout API failure and proceed with local clearing
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setUser(null);
      setToken(null);
      setPrivateKeys(null);
    }
  };

  const savePrivateKeys = (keys, identity = user) => {
    const resolvedUser = typeof identity === 'string' ? { username: identity } : identity;
    if (!resolvedUser?.id && !resolvedUser?.username) {
      throw new Error('A user identity is required to save private keys.');
    }
    const storageKey = 'user_private_keys_by_username';
    const keysByUsername = parseKeys(localStorage.getItem(storageKey));
    if (resolvedUser.id != null) keysByUsername[`id:${resolvedUser.id}`] = keys;
    if (resolvedUser.username) keysByUsername[resolvedUser.username.toLowerCase()] = keys;
    localStorage.setItem(storageKey, JSON.stringify(keysByUsername));
    if (!user || (resolvedUser.id != null && user.id === resolvedUser.id) || user.username?.toLowerCase() === resolvedUser.username?.toLowerCase()) {
      setPrivateKeys(keys);
    }
  };

  const updateUser = (updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      privateKeys,
      savePrivateKeys,
      updateUser,
      login,
      register,
      logout,
      loading
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
