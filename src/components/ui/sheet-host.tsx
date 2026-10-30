import { Fragment, createContext, useContext, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { DialogLayer } from '@/components/ui/dialog-layer';
import { topHostId, useDialogStore } from '@/store/dialog';

interface SheetHostApi {
  mount: (id: string, node: ReactNode) => void;
  unmount: (id: string) => void;
  depth: number;
}

const SheetHostContext = createContext<SheetHostApi | null>(null);

export function useSheetHost() {
  return useContext(SheetHostContext);
}

/**
 * Renders bottom sheets as overlays inside the current screen instead of in a separate native
 * Modal window. Stacking RN Modals on top of native modal screens (the add-transaction and
 * settings screens) can leave an invisible layer that swallows taps after a sheet closes; an
 * in-tree overlay avoids that class of bug entirely. Place one host per top-level container.
 */
export function SheetHost({ children }: { children: ReactNode }) {
  const [layers, setLayers] = useState<Map<string, ReactNode>>(() => new Map());
  const hostId = useId();
  const parent = useContext(SheetHostContext);
  const depth = (parent?.depth ?? 0) + 1;
  // Dialogs render only in the deepest, most recently mounted host, i.e. the screen on top.
  const isTop = useDialogStore((s) => topHostId(s.hosts) === hostId);
  useEffect(() => {
    const { registerHost, unregisterHost } = useDialogStore.getState();
    registerHost(hostId, depth);
    return () => unregisterHost(hostId);
  }, [hostId, depth]);

  const api = useMemo<SheetHostApi>(
    () => ({
      mount: (id, node) =>
        setLayers((prev) => {
          if (prev.get(id) === node) return prev;
          const next = new Map(prev);
          next.set(id, node);
          return next;
        }),
      unmount: (id) =>
        setLayers((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        }),
      depth,
    }),
    [depth]
  );

  return (
    <SheetHostContext.Provider value={api}>
      <View style={styles.flex}>
        {children}
        {layers.size > 0 ? (
          <View style={styles.overlay} pointerEvents="box-none">
            {[...layers].map(([id, node]) => (
              <Fragment key={id}>{node}</Fragment>
            ))}
          </View>
        ) : null}
        {isTop ? <DialogLayer /> : null}
      </View>
    </SheetHostContext.Provider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Last child, so it draws on top natively; zIndex only matters for web stacking.
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...(Platform.OS === 'web' ? { zIndex: 1000 } : { elevation: 1000 }) },
});
