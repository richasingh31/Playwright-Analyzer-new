import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
  isSwitching: boolean;
}

const EnvironmentContext = createContext<EnvironmentContextValue | undefined>(undefined);

// How long the "switching environment" overlay stays visible. The underlying data is
// already loaded client-side and re-filtering is instant, so this is a deliberate,
// minimum-visible-duration UX cue rather than a reflection of real network latency.
const SWITCH_OVERLAY_MS = 500;

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [environment, setEnvironmentState] = useState<Environment>(readStored);
  const [isSwitching, setIsSwitching] = useState(false);
  const switchTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, environment);
  }, [environment]);

  const setEnvironment = (env: Environment) => {
    setEnvironmentState((prev) => {
      if (prev === env) return prev;
      setIsSwitching(true);
      window.clearTimeout(switchTimeoutRef.current);
      switchTimeoutRef.current = window.setTimeout(() => setIsSwitching(false), SWITCH_OVERLAY_MS);
      return env;
    });
  };

  return (
    <EnvironmentContext.Provider value={{ environment, setEnvironment, isSwitching }}>
      {children}
    </EnvironmentContext.Provider>
  );
}

export function useEnvironment(): EnvironmentContextValue {
  const ctx = useContext(EnvironmentContext);
  if (!ctx) throw new Error('useEnvironment must be used within an EnvironmentProvider');
  return ctx;
}
