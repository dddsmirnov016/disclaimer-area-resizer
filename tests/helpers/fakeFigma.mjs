// A small, typed-by-convention fake of the parts of the Figma Plugin API that
// this plugin actually touches. It is deterministic, has no real rendering and
// never reaches the network, so it is safe to drive plugin-core logic in plain
// Node. Mirror only what the code under test uses.

let autoId = 0;

function nextId(prefix) {
  autoId += 1;
  return `${prefix}-${autoId}`;
}

/**
 * Create a fake scene node. Pass overrides for any field; sensible defaults are
 * provided for the capabilities the plugin reads/writes (size, layout, plugin
 * data, children, resize, clone, remove).
 */
export function makeFakeNode(overrides = {}) {
  const node = {
    id: overrides.id ?? overrides.name ?? nextId("node"),
    name: overrides.name ?? "Node",
    type: overrides.type ?? "FRAME",
    width: overrides.width ?? 100,
    height: overrides.height ?? 100,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    locked: overrides.locked ?? false,
    visible: overrides.visible ?? true,
    layoutMode: overrides.layoutMode ?? "NONE",
    paddingLeft: overrides.paddingLeft ?? 0,
    paddingRight: overrides.paddingRight ?? 0,
    paddingTop: overrides.paddingTop ?? 0,
    paddingBottom: overrides.paddingBottom ?? 0,
    parent: overrides.parent ?? null,
    children: overrides.children ?? [],
    removed: false,
    _pluginData: { ...(overrides.pluginData ?? {}) },
  };

  if ("fills" in overrides) node.fills = overrides.fills;
  if ("layoutSizingHorizontal" in overrides)
    node.layoutSizingHorizontal = overrides.layoutSizingHorizontal;
  if ("layoutSizingVertical" in overrides)
    node.layoutSizingVertical = overrides.layoutSizingVertical;
  if ("layoutPositioning" in overrides)
    node.layoutPositioning = overrides.layoutPositioning;
  if ("layoutAlign" in overrides) node.layoutAlign = overrides.layoutAlign;
  if ("layoutGrow" in overrides) node.layoutGrow = overrides.layoutGrow;
  if ("constraints" in overrides) node.constraints = overrides.constraints;
  if ("clipsContent" in overrides) node.clipsContent = overrides.clipsContent;
  if ("textAutoResize" in overrides)
    node.textAutoResize = overrides.textAutoResize;

  Object.defineProperty(node, "absoluteTransform", {
    get() {
      let absX = 0;
      let absY = 0;
      let current = node;
      while (current && typeof current.x === "number") {
        absX += current.x;
        absY += current.y;
        current = current.parent;
      }
      return [
        [1, 0, absX],
        [0, 1, absY],
      ];
    },
    configurable: true,
  });

  Object.defineProperty(node, "absoluteBoundingBox", {
    get() {
      const t = node.absoluteTransform;
      return { x: t[0][2], y: t[1][2], width: node.width, height: node.height };
    },
    configurable: true,
  });

  node.resize = (w, h) => {
    node.width = w;
    node.height = h;
  };
  node.resizeWithoutConstraints = (w, h) => {
    node.width = w;
    node.height = h;
  };

  node.getSharedPluginData = (namespace, key) =>
    node._pluginData[`${namespace}:${key}`] ?? "";
  node.setSharedPluginData = (namespace, key, value) => {
    node._pluginData[`${namespace}:${key}`] = value;
  };

  node.appendChild = (child) => {
    if (child.parent && Array.isArray(child.parent.children)) {
      child.parent.children = child.parent.children.filter((c) => c !== child);
    }
    child.parent = node;
    node.children.push(child);
  };
  node.insertChild = (index, child) => {
    if (child.parent && Array.isArray(child.parent.children)) {
      child.parent.children = child.parent.children.filter((c) => c !== child);
    }
    child.parent = node;
    node.children.splice(index, 0, child);
  };
  node.remove = () => {
    node.removed = true;
    if (node.parent && Array.isArray(node.parent.children)) {
      node.parent.children = node.parent.children.filter((c) => c !== node);
    }
    node.parent = null;
  };
  node.clone = () => cloneNode(node);

  // Apply explicit method removals (e.g. to simulate non-resizable nodes).
  if (overrides.removeResize) delete node.resize;
  if (overrides.removeResizeWithoutConstraints)
    delete node.resizeWithoutConstraints;

  return node;
}

function cloneNode(source) {
  const copy = makeFakeNode({
    name: source.name,
    type: source.type,
    width: source.width,
    height: source.height,
    x: source.x,
    y: source.y,
    locked: source.locked,
    visible: source.visible,
    layoutMode: source.layoutMode,
    paddingLeft: source.paddingLeft,
    paddingRight: source.paddingRight,
    paddingTop: source.paddingTop,
    paddingBottom: source.paddingBottom,
    pluginData: { ...source._pluginData },
  });
  copy._pluginData = {};
  for (const k of Object.keys(source._pluginData)) {
    copy._pluginData[k] = source._pluginData[k];
  }
  if ("fills" in source) copy.fills = source.fills;
  copy.children = [];
  for (const child of source.children ?? []) {
    const childCopy = cloneNode(child);
    childCopy.parent = copy;
    copy.children.push(childCopy);
  }
  copy.parent = null;
  return copy;
}

/** Wire up a parent/children tree so every child's `.parent` points correctly. */
export function linkTree(node) {
  for (const child of node.children ?? []) {
    child.parent = node;
    linkTree(child);
  }
  return node;
}

/**
 * Build a fake `figma` global plus a `harness` object that records side
 * effects (posted messages, notifications, created nodes, close calls).
 */
export function makeFakeFigma(options = {}) {
  const harness = {
    postedMessages: [],
    notifications: [],
    createdNodes: [],
    closed: false,
    uiHandlers: {},
    documentHandlers: {},
    resizeCalls: [],
  };

  const page = {
    type: "PAGE",
    name: options.pageName ?? "Page 1",
    selection: options.selection ?? [],
  };

  const figma = {
    currentPage: page,
    showUI: () => {},
    notify: (message, opts) => {
      harness.notifications.push({ message, options: opts ?? null });
    },
    closePlugin: (message) => {
      harness.closed = true;
      harness.closeMessage = message ?? null;
    },
    on: (eventName, handler) => {
      harness.documentHandlers[eventName] = handler;
    },
    ui: {
      postMessage: (message) => {
        harness.postedMessages.push(message);
      },
      resize: (w, h) => {
        harness.resizeCalls.push({ width: w, height: h });
      },
      on: (eventName, handler) => {
        harness.uiHandlers[eventName] = handler;
      },
    },
    createNodeFromSvg: (svg) => {
      const node = makeFakeNode({
        name: "svg",
        type: "FRAME",
        width: options.svgWidth ?? 100,
        height: options.svgHeight ?? 20,
        layoutSizingHorizontal: "FIXED",
        layoutSizingVertical: "FIXED",
        clipsContent: false,
        constraints: { horizontal: "MIN", vertical: "MIN" },
      });
      node._svg = svg;
      harness.createdNodes.push(node);
      return node;
    },
  };

  if (options.failCreateNodeFromSvg) {
    figma.createNodeFromSvg = () => {
      throw new Error(options.failCreateNodeFromSvg);
    };
  }

  figma.__harness = harness;

  return { figma, harness, page };
}

/**
 * Install a fake `figma` (and empty `__html__`) on `globalThis`, run `fn`, then
 * restore the previous globals. Returns whatever `fn` returns.
 */
export async function withFakeFigma(figma, fn) {
  const prevFigma = globalThis.figma;
  const prevHtml = globalThis.__html__;
  globalThis.figma = figma;
  globalThis.__html__ = globalThis.__html__ ?? "<html></html>";
  try {
    return await fn();
  } finally {
    globalThis.figma = prevFigma;
    globalThis.__html__ = prevHtml;
  }
}
