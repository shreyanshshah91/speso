import { useState } from 'react';

/**
 * Runs `onOpen` during render whenever `visible` flips to true — React's recommended way to
 * reset derived form state when a prop changes, without a setState-in-effect cascade.
 */
export function useOnOpen(visible: boolean, onOpen: () => void) {
  const [prev, setPrev] = useState(visible);
  if (visible !== prev) {
    setPrev(visible);
    if (visible) onOpen();
  }
}
