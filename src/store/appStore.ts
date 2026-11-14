/** Global UI state (zustand). The AI key is deliberately NOT stored here -
 *  see services/ai/keyStore.ts (module-scope memory only). */

import { create } from "zustand";
import { EPH_WINDOW } from "../services/data/window";

export type RightPanel = "none" | "detail" | "compare" | "assistant";

interface AppState {
  utcMs: number;
  live: boolean;
  selectedSiteId: string | null;
  hoveredSiteId: string | null;
  compareIds: string[];
  rightPanel: RightPanel;
  drawerOpen: boolean;
  aboutOpen: boolean;
  showEarthDir: boolean;
  /** Anchor time for the scrubber (re-anchored on release). */
  scrubAnchorMs: number;
  rangeError: string | null;
  cameraTarget: { latDeg: number; lonDeg: number; nonce: number; dist?: number } | null;

  setUtc(ms: number, opts?: { keepLive?: boolean }): void;
  goLive(): void;
  tickLive(): void;
  selectSite(id: string | null): void;
  setHover(id: string | null): void;
  toggleCompare(id: string): void;
  setPanel(p: RightPanel): void;
  setDrawer(open: boolean): void;
  setAbout(open: boolean): void;
  setShowEarthDir(v: boolean): void;
  reanchorScrub(): void;
  setRangeError(msg: string | null): void;
  requestFocus(latDeg: number, lonDeg: number, dist?: number): void;
}

const clampToWindow = (ms: number): { ms: number; clamped: boolean } => {
  if (ms < EPH_WINDOW.startMs) return { ms: EPH_WINDOW.startMs, clamped: true };
  if (ms > EPH_WINDOW.endMs) return { ms: EPH_WINDOW.endMs, clamped: true };
  return { ms, clamped: false };
};

const initialNow = clampToWindow(Date.now());

export const useApp = create<AppState>((set, get) => ({
  utcMs: Math.round(initialNow.ms / 60000) * 60000,
  live: !initialNow.clamped,
  selectedSiteId: null,
  hoveredSiteId: null,
  compareIds: [],
  rightPanel: "none",
  drawerOpen: false,
  aboutOpen: false,
  showEarthDir: true,
  scrubAnchorMs: Math.round(initialNow.ms / 60000) * 60000,
  rangeError: null,
  cameraTarget: null,

  setUtc(ms, opts) {
    const { ms: v, clamped } = clampToWindow(ms);
    set({
      utcMs: v,
      live: opts?.keepLive ? get().live : false,
      rangeError: clamped
        ? `Data covers ${EPH_WINDOW.startLabel} to ${EPH_WINDOW.endLabel} UTC - time was clamped.`
        : null,
    });
  },
  goLive() {
    const { ms, clamped } = clampToWindow(Date.now());
    set({
      utcMs: ms,
      scrubAnchorMs: ms,
      live: !clamped,
      rangeError: clamped ? `"Now" is outside the data window (${EPH_WINDOW.startLabel} to ${EPH_WINDOW.endLabel} UTC).` : null,
    });
  },
  tickLive() {
    if (!get().live) return;
    const { ms, clamped } = clampToWindow(Date.now());
    if (clamped) set({ live: false });
    else set({ utcMs: ms, scrubAnchorMs: ms });
  },
  selectSite(id) {
    set({ selectedSiteId: id });
    if (id === null && get().rightPanel === "detail") set({ rightPanel: "none" });
  },
  setHover(id) {
    set({ hoveredSiteId: id });
  },
  toggleCompare(id) {
    const cur = get().compareIds;
    if (cur.includes(id)) set({ compareIds: cur.filter((x) => x !== id) });
    else if (cur.length < 2) set({ compareIds: [...cur, id], rightPanel: "compare" });
    else set({ compareIds: [cur[1], id], rightPanel: "compare" });
  },
  setPanel(p) {
    set({ rightPanel: p });
  },
  setDrawer(open) {
    set({ drawerOpen: open });
  },
  setAbout(open) {
    set({ aboutOpen: open });
  },
  setShowEarthDir(v) {
    set({ showEarthDir: v });
  },
  reanchorScrub() {
    set({ scrubAnchorMs: get().utcMs });
  },
  setRangeError(msg) {
    set({ rangeError: msg });
  },
  requestFocus(latDeg, lonDeg, dist) {
    set({ cameraTarget: { latDeg, lonDeg, nonce: Date.now(), dist } });
  },
}));
