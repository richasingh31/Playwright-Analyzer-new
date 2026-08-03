import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Environment } from '../types';

export const ENVIRONMENTS: Environment[] = ['QA', 'SIT', 'PPE'];

const STORAGE_KEY = 'environment';

function readStored(): Environment {
  const stored = localStorage.getItem(STORAGE_KEY);
  return ENVIRONMENTS.includes(stored as Environment) ? (stored as Environment) : 'QA';
}

interface EnvironmentContextValue {
  environment: Environment;
  setEnvironment: (env: Environment) => void;
}

const EnvironmentContext = createContext<EnvironmentContextValue | undefined>(undefined);

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [environment, setEnvironment] = useState<Environment>(readStored);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, environment);
  }, [environment]);

  return (
    <EnvironmentContext.Provider value={{ environment, setEnvironment }}>
      {children}
    </EnvironmentContext.Provider>
  );
}

export function useEnvironment(): EnvironmentContextValue {
  const ctx = useContext(EnvironmentContext);
  if (!ctx) throw new Error('useEnvironment must be used within an EnvironmentProvider');
  return ctx;
}
