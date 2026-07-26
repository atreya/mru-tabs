# MRU Tabs

A tiny local Chrome extension for switching tabs in most-recently-used order.

## What It Does

- `mru-older-tab`: moves backward through the recent-tab stack.
- `mru-newer-tab`: moves forward through that same stack.
- Tracks MRU order separately for each Chrome window.
- Keeps keyboard-driven MRU navigation from rewriting the stack, so repeated presses walk through recent tabs instead of only toggling two tabs.

## Install In Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the cloned `mru-tabs` repository folder.
5. Open `chrome://extensions/shortcuts`.
6. Confirm the shortcuts:
   - Previous recent tab: `Ctrl+.`
   - Next recent tab: `Ctrl+Shift+.`

Chrome calls the real macOS Control key `MacCtrl` in extension manifests, but the shortcut UI should display it as Control.

## Changing Shortcuts

You can change the assigned shortcuts any time from `chrome://extensions/shortcuts`.
