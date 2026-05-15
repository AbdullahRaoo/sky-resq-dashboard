/**
 * Link Store — mirrors the 4G/SiK MAVLink failover snapshot from the
 * Electron main process. The actual failover logic lives in
 * `electron/link_router.js`; this store is read-only state for the UI.
 */

import { create } from "zustand";
import type { LinkStatusEvent, ActiveLinkName } from "@/types/electron";

interface LinkStore extends LinkStatusEvent {
    update: (data: LinkStatusEvent) => void;
}

const defaultStatus: LinkStatusEvent = {
    active: "none",
    forced: "auto",
    sik: { connected: false, lastHbMs: 0, freshMs: Infinity },
    udp: { connected: false, lastHbMs: 0, freshMs: Infinity },
};

export const useLinkStore = create<LinkStore>((set) => ({
    ...defaultStatus,
    update: (data) => set(data),
}));

export type { ActiveLinkName };
