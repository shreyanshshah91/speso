import { create } from 'zustand';

export interface DialogRequest {
  id: number;
  title: string;
  message?: string;
  /** 'confirm' shows Cancel + a confirm button; 'alert' shows a single OK. */
  kind: 'confirm' | 'alert';
  confirmLabel: string;
  destructive: boolean;
  onConfirm?: () => void;
}

interface HostInfo {
  id: string;
  /** Nesting depth (root host = 1). */
  depth: number;
  /** Registration order; later = mounted more recently. */
  order: number;
}

interface DialogState {
  queue: DialogRequest[];
  hosts: HostInfo[];
  open: (req: Omit<DialogRequest, 'id'>) => void;
  close: (id: number) => void;
  registerHost: (id: string, depth: number) => void;
  unregisterHost: (id: string) => void;
}

let nextId = 1;
let nextOrder = 1;

/** The host dialogs should render in: the deepest, most recently mounted one (the screen on top). */
export function topHostId(hosts: HostInfo[]): string | null {
  let best: HostInfo | null = null;
  for (const h of hosts) {
    if (!best || h.depth > best.depth || (h.depth === best.depth && h.order > best.order)) best = h;
  }
  return best?.id ?? null;
}

export const useDialogStore = create<DialogState>((set) => ({
  queue: [],
  hosts: [],
  open: (req) => set((s) => ({ queue: [...s.queue, { ...req, id: nextId++ }] })),
  close: (id) => set((s) => ({ queue: s.queue.filter((d) => d.id !== id) })),
  registerHost: (id, depth) => set((s) => ({ hosts: [...s.hosts.filter((h) => h.id !== id), { id, depth, order: nextOrder++ }] })),
  unregisterHost: (id) => set((s) => ({ hosts: s.hosts.filter((h) => h.id !== id) })),
}));
