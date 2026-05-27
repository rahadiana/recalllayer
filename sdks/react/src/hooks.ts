import { useMemoryClientContext } from "./provider.js";
import type { UseMemoryClientReturn } from "./types.js";

export function useMemoryClient(): UseMemoryClientReturn {
  const client = useMemoryClientContext();
  return { client };
}
