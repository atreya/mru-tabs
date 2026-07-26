const STATE_KEY = "mruTabsState";
const SWITCH_GRACE_MS = 1500;

let statePromise = null;

function blankState() {
  return {
    windows: {},
    commandSwitches: {}
  };
}

async function loadState() {
  if (!statePromise) {
    statePromise = chrome.storage.session
      .get(STATE_KEY)
      .then((result) => result[STATE_KEY] || blankState());
  }

  return statePromise;
}

async function saveState(state) {
  statePromise = Promise.resolve(state);
  await chrome.storage.session.set({ [STATE_KEY]: state });
}

function getWindowState(state, windowId) {
  const key = String(windowId);

  if (!state.windows[key]) {
    state.windows[key] = {
      stack: [],
      cursor: 0
    };
  }

  return state.windows[key];
}

function normalizeWindowState(windowState) {
  const seen = new Set();
  windowState.stack = windowState.stack.filter((tabId) => {
    if (typeof tabId !== "number" || seen.has(tabId)) {
      return false;
    }

    seen.add(tabId);
    return true;
  });

  if (windowState.stack.length === 0) {
    windowState.cursor = 0;
    return;
  }

  windowState.cursor = Math.max(
    0,
    Math.min(windowState.cursor || 0, windowState.stack.length - 1)
  );
}

function promoteTab(windowState, tabId) {
  windowState.stack = [
    tabId,
    ...windowState.stack.filter((existingTabId) => existingTabId !== tabId)
  ];
  windowState.cursor = 0;
  normalizeWindowState(windowState);
}

function markCommandSwitch(state, windowId, tabId) {
  state.commandSwitches[String(windowId)] = {
    tabId,
    expiresAt: Date.now() + SWITCH_GRACE_MS
  };
}

function consumeCommandSwitch(state, windowId, tabId) {
  const key = String(windowId);
  const commandSwitch = state.commandSwitches[key];

  if (!commandSwitch) {
    return false;
  }

  delete state.commandSwitches[key];

  return commandSwitch.tabId === tabId && commandSwitch.expiresAt >= Date.now();
}

async function seedWindowState(state, windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const activeTab = tabs.find((tab) => tab.active);
  const windowState = getWindowState(state, windowId);
  const knownTabIds = new Set(tabs.map((tab) => tab.id));

  windowState.stack = windowState.stack.filter((tabId) => knownTabIds.has(tabId));

  const orderedTabs = [...tabs].sort((a, b) => {
    if (a.active) {
      return -1;
    }
    if (b.active) {
      return 1;
    }

    return (b.lastAccessed || 0) - (a.lastAccessed || 0);
  });

  for (const tab of orderedTabs) {
    if (!windowState.stack.includes(tab.id)) {
      windowState.stack.push(tab.id);
    }
  }

  if (activeTab) {
    const activeIndex = windowState.stack.indexOf(activeTab.id);
    windowState.cursor = activeIndex === -1 ? 0 : activeIndex;
  }

  normalizeWindowState(windowState);
}

async function activateTabByMruOffset(offset) {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!activeTab || typeof activeTab.windowId !== "number") {
    return;
  }

  const state = await loadState();
  await seedWindowState(state, activeTab.windowId);

  const windowState = getWindowState(state, activeTab.windowId);
  const activeIndex = windowState.stack.indexOf(activeTab.id);

  if (activeIndex !== -1) {
    windowState.cursor = activeIndex;
  }

  normalizeWindowState(windowState);

  if (windowState.stack.length < 2) {
    await saveState(state);
    return;
  }

  const nextCursor =
    (windowState.cursor + offset + windowState.stack.length) %
    windowState.stack.length;
  const targetTabId = windowState.stack[nextCursor];

  windowState.cursor = nextCursor;
  markCommandSwitch(state, activeTab.windowId, targetTabId);
  await saveState(state);

  try {
    await chrome.tabs.update(targetTabId, { active: true });
  } catch (_error) {
    windowState.stack = windowState.stack.filter((tabId) => tabId !== targetTabId);
    normalizeWindowState(windowState);
    await saveState(state);
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "mru-older-tab") {
    void activateTabByMruOffset(1);
  }

  if (command === "mru-newer-tab") {
    void activateTabByMruOffset(-1);
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  const state = await loadState();
  const windowState = getWindowState(state, windowId);

  if (consumeCommandSwitch(state, windowId, tabId)) {
    const cursor = windowState.stack.indexOf(tabId);
    windowState.cursor = cursor === -1 ? 0 : cursor;
    normalizeWindowState(windowState);
    await saveState(state);
    return;
  }

  promoteTab(windowState, tabId);
  await saveState(state);
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const state = await loadState();

  if (removeInfo.isWindowClosing) {
    delete state.windows[String(removeInfo.windowId)];
    delete state.commandSwitches[String(removeInfo.windowId)];
    await saveState(state);
    return;
  }

  for (const windowState of Object.values(state.windows)) {
    windowState.stack = windowState.stack.filter((existingTabId) => existingTabId !== tabId);
    normalizeWindowState(windowState);
  }

  await saveState(state);
});

chrome.tabs.onAttached.addListener(async (tabId, attachInfo) => {
  const state = await loadState();
  const windowState = getWindowState(state, attachInfo.newWindowId);
  promoteTab(windowState, tabId);
  await saveState(state);
});

chrome.tabs.onDetached.addListener(async (tabId, detachInfo) => {
  const state = await loadState();
  const windowState = getWindowState(state, detachInfo.oldWindowId);
  windowState.stack = windowState.stack.filter((existingTabId) => existingTabId !== tabId);
  normalizeWindowState(windowState);
  await saveState(state);
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const state = await loadState();
  delete state.windows[String(windowId)];
  delete state.commandSwitches[String(windowId)];
  await saveState(state);
});
