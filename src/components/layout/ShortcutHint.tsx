"use client";

import { openShortcutHelp } from "./ShortcutHelp";

/**
 * The one visible way in. `?` opens the shortcut list, and a shortcut that can
 * only be found by already knowing it is not a shortcut anybody has.
 */
export function ShortcutHint() {
  return (
    <button onClick={openShortcutHelp} className="inline-flex items-center gap-1 rounded px-1 py-1.5 hover:text-fg">
      <kbd>?</kbd>
      <span className="ml-1">for shortcuts</span>
    </button>
  );
}
