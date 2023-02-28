import { useCallback } from "react";

export const useDelay = () => {
  return useCallback(async (time = 3000) => {
    await new Promise<void>((resolve) => setTimeout(resolve, time));
  }, []);
};
