import { useEffect, useState } from 'react';
import { getAdState, subscribeAds } from './AdManager';

export function useAdState() {
  const [s, setS] = useState(getAdState);
  useEffect(() => {
    const unsub = subscribeAds(setS);
    setS(getAdState());
    return () => {
      unsub();
    };
  }, []);
  return s;
}
