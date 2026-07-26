const count = document.getElementById("count");
const olderTitle = document.getElementById("older-title");
const newerTitle = document.getElementById("newer-title");
const stack = document.getElementById("stack");
const message = document.getElementById("message");

function setTitle(element, tab, fallback) {
  element.textContent = tab?.title || fallback;
}

function renderStack(items, currentId) {
  stack.replaceChildren();

  for (const [index, tab] of items.entries()) {
    const item = document.createElement("li");
    const rank = document.createElement("span");
    const title = document.createElement("span");

    item.className = tab.id === currentId ? "current" : "";
    rank.className = "rank";
    title.className = "stack-title";
    rank.textContent = String(index + 1);
    title.textContent = tab.title;

    item.append(rank, title);
    stack.append(item);
  }
}

function showMessage(value) {
  message.hidden = false;
  message.textContent = value;
}

async function loadPreview() {
  const response = await chrome.runtime.sendMessage({ type: "get-mru-preview" });

  if (!response?.ok) {
    throw new Error(response?.error || "Unable to load MRU preview.");
  }

  const preview = response.preview;
  const stackItems = preview.stack || [];

  count.textContent =
    stackItems.length === 1 ? "1 tracked tab" : `${stackItems.length} tracked tabs`;

  setTitle(olderTitle, preview.older, "No older tab yet");
  setTitle(newerTitle, preview.newer, "No newer tab yet");
  renderStack(stackItems, preview.current?.id);

  if (stackItems.length < 2) {
    showMessage("Open and visit a few tabs to build a recent-tab order.");
  }
}

loadPreview().catch((error) => {
  count.textContent = "Preview unavailable";
  setTitle(olderTitle, null, "No preview");
  setTitle(newerTitle, null, "No preview");
  showMessage(error.message);
});
