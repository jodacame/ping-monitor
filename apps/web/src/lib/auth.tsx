import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, clearTokens, isAuthenticated } from './api';
import type { AuthUser, Workspace } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  ready: boolean;
  selectWorkspace: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { email: string; password: string; name?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const WORKSPACE_KEY = 'pm.workspace';
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(
    () => localStorage.getItem(WORKSPACE_KEY),
  );
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const { user: me, workspaces: ws } = await api.me();
    setUser(me);
    setWorkspaces(ws);
    setCurrentId((prev) => (prev && ws.some((w) => w.id === prev) ? prev : (ws[0]?.id ?? null)));
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (isAuthenticated()) {
        try {
          await load();
        } catch {
          clearTokens();
        }
      }
      if (active) setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    if (currentId) localStorage.setItem(WORKSPACE_KEY, currentId);
  }, [currentId]);

  const login = useCallback(
    async (email: string, password: string) => {
      await api.login({ email, password });
      await load();
    },
    [load],
  );

  const register = useCallback(
    async (input: { email: string; password: string; name?: string }) => {
      await api.register(input);
      await load();
    },
    [load],
  );

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setWorkspaces([]);
    setCurrentId(null);
    localStorage.removeItem(WORKSPACE_KEY);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      workspaces,
      currentWorkspace: workspaces.find((w) => w.id === currentId) ?? null,
      ready,
      selectWorkspace: setCurrentId,
      login,
      register,
      logout,
    }),
    [user, workspaces, currentId, ready, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
