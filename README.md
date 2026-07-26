# chrome-mru-tabs

A tiny local Chrome extension for switching tabs in most-recently-used order.

## What It Does

- `mru-older-tab`: moves backward through the recent-tab stack.
- `mru-newer-tab`: moves forward through that same stack.
- Tracks MRU order separately for each Chrome window.
- Keeps keyboard-driven MRU navigation from rewriting the stack, so repeated presses walk through recent tabs instead of only toggling two tabs.
- Shows a toolbar popup with the next older and newer MRU destinations before you switch.

## Install In Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the cloned `chrome-mru-tabs` repository folder.
5. Open `chrome://extensions/shortcuts`.
6. Confirm the shortcuts:
   - Previous recent tab: `Cmd+.`
   - Next recent tab: `Cmd+Shift+.`
7. Pin MRU Tabs from the extensions menu if you want quick access to the preview popup.

## Changing Shortcuts

You can change the assigned shortcuts any time from `chrome://extensions/shortcuts`.
