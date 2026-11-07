import { useSyncExternalStore } from 'react';
import { loadEntries, subscribe } from './history';

export function useHistory() {
  return useSyncExternalStore(subscribe, loadEntries, loadEntries);
}
