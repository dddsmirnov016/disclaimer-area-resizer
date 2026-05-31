/// <reference types="@figma/plugin-typings" />

// ─── Presets ───────────────────────────────────────────────────────────────

const ASSET_MEDICINE =
  "Есть противопоказания. Посоветуйтесь с врачом . Возможен вред здоровью и бесплодие.";
const ASSET_NOT_MEDICINE = "Не является лекарством";
const ASSET_CREDIT =
  "Изучите все условия кредита (займа) на сайте в соответствующем разделе. Оценивайте свои финансовые возможности и риски";
const ASSET_BANKRUPTCY =
  "Банкротство влечёт негативные последствия, в том числе ограничения на получение кредита и повторное банкротство в течение пяти лет";

interface DisclaimerPreset {
  label: string;
  percent: number | null;
  assetKey: string;
}

const DISCLAIMER_PRESETS: Record<string, DisclaimerPreset> = {
  medicine_video_7: {
    label: "Медицина — 7% / ТВ, видео или по ТЗ",
    percent: 7,
    assetKey: ASSET_MEDICINE,
  },
  medicine_static_5: {
    label: "Медицина — 5% / статичный баннер, прочие способы",
    percent: 5,
    assetKey: ASSET_MEDICINE,
  },
  bad_static_10: {
    label: "БАД — 10% / статичный баннер, прочие способы",
    percent: 10,
    assetKey: ASSET_NOT_MEDICINE,
  },
  bad_video_7: {
    label: "БАД — 7% / ТВ, видео",
    percent: 7,
    assetKey: ASSET_NOT_MEDICINE,
  },
  finance_credit_5: {
    label: "Финансы / кредит, займ — 5%",
    percent: 5,
    assetKey: ASSET_CREDIT,
  },
  finance_custom_10: {
    label: "Финансы — 10% / кастом по ТЗ клиента",
    percent: 10,
    assetKey: ASSET_BANKRUPTCY,
  },
  energy_7: {
    label: "Энергетические напитки — 7%",
    percent: 7,
    assetKey: ASSET_NOT_MEDICINE,
  },
  custom: {
    label: "Кастомный процент",
    percent: null,
    assetKey: ASSET_MEDICINE,
  },
};

// ─── Types for UI messages ─────────────────────────────────────────────────

type ResizeDirection = "height" | "width" | "proportional";
type AddTarget = "body" | "image";
type SelectionMode = "resize-existing" | "add-missing";

interface SelectionInfo {
  mode: SelectionMode;
  disclaimerName: string | null;
  disclaimerWidth: number | null;
  disclaimerHeight: number | null;
  bannerName: string;
  bannerWidth: number;
  bannerHeight: number;
  currentPercent: number | null;
  isText: boolean;
  hasAutoLayout: boolean;
}

interface PluginState {
  type: "no-selection" | "invalid" | "ready";
  error?: string;
  info?: SelectionInfo;
  presets: Record<string, DisclaimerPreset>;
}

interface ApplyResizeMessage {
  type: "apply-resize";
  presetKey: string;
  customPercent: number | null;
  direction: ResizeDirection;
  onlyEnlarge: boolean;
  addTarget: AddTarget;
}

interface RequestStateMessage {
  type: "request-state";
}

interface ResizeMessage {
  type: "resize";
  width: number;
  height: number;
}

type UiMessage = ApplyResizeMessage | RequestStateMessage | ResizeMessage;

// ─── Helpers ───────────────────────────────────────────────────────────────

const PLUGIN_DATA_NAMESPACE = "disclaimerAreaResizer";
const PLUGIN_DATA_ASSET_KEY = "assetKey";
const PLUGIN_DATA_PRESET_KEY = "presetKey";

type BannerFrame = FrameNode | ComponentNode | InstanceNode;
type AutoLayoutFrame = BannerFrame;
type ResizableNode = SceneNode & {
  width: number;
  height: number;
  resizeWithoutConstraints: (w: number, h: number) => void;
};
type NodeWithSize = SceneNode & { width: number; height: number };
type NodeWithChildren = BaseNode & { children: readonly SceneNode[] };
type NodeWithMutableChildren = NodeWithChildren & {
  appendChild: (child: SceneNode) => void;
  insertChild: (index: number, child: SceneNode) => void;
};
interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function isResizable(node: SceneNode): node is ResizableNode {
  return (
    "width" in node &&
    "height" in node &&
    "resizeWithoutConstraints" in node &&
    typeof (node as unknown as { resizeWithoutConstraints: unknown })
      .resizeWithoutConstraints === "function"
  );
}

function isFrameLike(node: SceneNode): node is BannerFrame {
  return (
    node.type === "FRAME" ||
    node.type === "COMPONENT" ||
    node.type === "INSTANCE"
  );
}

function hasChildren(node: BaseNode): node is NodeWithChildren {
  return "children" in node;
}

function canInsertChildren(node: BaseNode | null): node is NodeWithMutableChildren {
  return Boolean(node && "children" in node && "insertChild" in node);
}

function isTopLevelFrame(node: SceneNode): node is BannerFrame {
  return isFrameLike(node) && findBannerFrame(node) === null;
}

function nodeHasAutoLayout(node: SceneNode): boolean {
  let current: BaseNode = node;
  while (current.type !== "PAGE" && current.type !== "DOCUMENT") {
    if (
      (current.type === "FRAME" ||
        current.type === "COMPONENT" ||
        current.type === "INSTANCE") &&
      (current as FrameNode).layoutMode !== "NONE"
    ) {
      return true;
    }
    if (!current.parent) break;
    current = current.parent;
  }
  return false;
}

function findBannerFrame(
  node: SceneNode
): FrameNode | ComponentNode | InstanceNode | null {
  let result: FrameNode | ComponentNode | InstanceNode | null = null;
  let current: BaseNode | null = node.parent;

  while (current && current.type !== "PAGE" && current.type !== "DOCUMENT") {
    if (
      current.type === "FRAME" ||
      current.type === "COMPONENT" ||
      current.type === "INSTANCE"
    ) {
      const f = current as FrameNode | ComponentNode | InstanceNode;
      if (f.width > 0 && f.height > 0) {
        result = f;
      }
    }
    current = current.parent;
  }

  return result;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function calcNewDimensions(
  selW: number,
  selH: number,
  bannerW: number,
  bannerH: number,
  targetPercent: number,
  direction: ResizeDirection
): { newWidth: number; newHeight: number } {
  const bannerArea = bannerW * bannerH;
  const targetArea = (bannerArea * targetPercent) / 100;
  const MIN = 0.01;

  if (direction === "height") {
    const newHeight = Math.max(MIN, targetArea / selW);
    return { newWidth: selW, newHeight };
  } else if (direction === "width") {
    const newWidth = Math.max(MIN, targetArea / selH);
    return { newWidth, newHeight: selH };
  } else {
    const disclaimerArea = selW * selH;
    const scale = Math.sqrt(targetArea / disclaimerArea);
    return {
      newWidth: Math.max(MIN, selW * scale),
      newHeight: Math.max(MIN, selH * scale),
    };
  }
}

function calcAreaWithWidth(
  bannerW: number,
  bannerH: number,
  targetPercent: number,
  width: number
): { newWidth: number; newHeight: number } {
  const targetArea = (bannerW * bannerH * targetPercent) / 100;
  const newWidth = Math.max(0.01, width);
  const newHeight = Math.max(0.01, targetArea / newWidth);
  return { newWidth, newHeight };
}

function visitDescendants(
  root: BaseNode,
  visitor: (node: SceneNode) => void
): void {
  if (!hasChildren(root)) return;

  for (const child of root.children) {
    visitor(child);
    visitDescendants(child, visitor);
  }
}

function prepareSvgNodeForDeformation(node: SceneNode): void {
  if ("clipsContent" in node) {
    (node as SceneNode & { clipsContent: boolean }).clipsContent = true;
  }

  visitDescendants(node, (child) => {
    if ("constraints" in child) {
      (child as SceneNode & { constraints: Constraints }).constraints = {
        horizontal: "SCALE",
        vertical: "SCALE",
      };
    }
  });
}

function resizeSvgNodeToFrame(
  node: ResizableNode,
  width: number,
  height: number
): void {
  prepareSvgNodeForDeformation(node);

  if (!("resize" in node) || typeof node.resize !== "function") {
    throw new Error("SVG-дисклеймер не поддерживает деформацию содержимого");
  }

  (node as ResizableNode & { resize: (w: number, h: number) => void }).resize(
    width,
    height
  );
}

function countTextDescendants(node: BaseNode): number {
  let count = 0;
  visitDescendants(node, (child) => {
    if (child.type === "TEXT") count += 1;
  });
  return count;
}

function containsText(node: BaseNode): boolean {
  return countTextDescendants(node) > 0 || node.type === "TEXT";
}

function normalizedName(node: BaseNode): string {
  return node.name.toLowerCase();
}

function isLikelyBodyName(node: BaseNode): boolean {
  return /body|copy|text|content|текст|контент|описание|оффер/.test(
    normalizedName(node)
  );
}

function hasImageFill(node: SceneNode): boolean {
  if (!("fills" in node)) return false;
  const fills = (node as { fills: readonly Paint[] | PluginAPI["mixed"] })
    .fills;
  return Array.isArray(fills) && fills.some((paint) => paint.type === "IMAGE");
}

function isVisibleInHierarchy(node: SceneNode, root: BaseNode): boolean {
  let current: BaseNode | null = node;

  while (current) {
    if ("visible" in current && !(current as SceneNode).visible) {
      return false;
    }
    if (current === root) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

function getAbsoluteBounds(node: NodeWithSize): Bounds {
  const box = node.absoluteBoundingBox;

  if (box) {
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    };
  }

  return {
    x: node.absoluteTransform[0][2],
    y: node.absoluteTransform[1][2],
    width: node.width,
    height: node.height,
  };
}

function getIntersectionBounds(a: Bounds, b: Bounds): Bounds | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  if (x2 <= x1 || y2 <= y1) return null;

  return {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
  };
}

function intersectionArea(bounds: Bounds | null): number {
  return bounds ? bounds.width * bounds.height : 0;
}

function getAutoLayoutPadding(node: AutoLayoutFrame): {
  left: number;
  right: number;
  bottom: number;
} {
  return {
    left: Math.max(0, node.paddingLeft || 0),
    right: Math.max(0, node.paddingRight || 0),
    bottom: Math.max(0, node.paddingBottom || 0),
  };
}

function findBodyContainer(bannerFrame: BannerFrame): AutoLayoutFrame | null {
  let bestNode: AutoLayoutFrame | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  const consider = (node: SceneNode): void => {
    if (!isFrameLike(node) || node.layoutMode !== "VERTICAL") return;

    const textCount = countTextDescendants(node);
    if (textCount === 0) return;

    const areaRatio =
      bannerFrame.width > 0 && bannerFrame.height > 0
        ? (node.width * node.height) / (bannerFrame.width * bannerFrame.height)
        : 1;
    const score =
      textCount * 20 +
      (isLikelyBodyName(node) ? 100 : 0) -
      areaRatio * 10 -
      (node === bannerFrame ? 50 : 0);

    if (score > bestScore) {
      bestNode = node;
      bestScore = score;
    }
  };

  consider(bannerFrame);
  visitDescendants(bannerFrame, consider);

  return bestNode;
}

function findMainImageNode(
  bannerFrame: BannerFrame
): { node: ResizableNode; bounds: Bounds } | null {
  let best: { node: ResizableNode; bounds: Bounds } | null = null;
  let bestArea = 0;
  const bannerBounds = getAbsoluteBounds(bannerFrame);

  const consider = (node: SceneNode): void => {
    if (!isResizable(node)) return;
    if (!hasImageFill(node)) return;
    if (!isVisibleInHierarchy(node, bannerFrame)) return;

    const visibleBounds = getIntersectionBounds(
      getAbsoluteBounds(node),
      bannerBounds
    );
    const area = intersectionArea(visibleBounds);

    if (!visibleBounds || area <= 0) return;

    if (area > bestArea) {
      best = { node, bounds: visibleBounds };
      bestArea = area;
    }
  };

  consider(bannerFrame);
  visitDescendants(bannerFrame, consider);

  return best;
}

function getRelativeBoundsFromAbsolute(
  bounds: Bounds,
  ancestor: NodeWithSize
): Bounds {
  const ancestorBounds = getAbsoluteBounds(ancestor);

  return {
    x: bounds.x - ancestorBounds.x,
    y: bounds.y - ancestorBounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}

function setLayoutSizingFixed(
  node: SceneNode,
  direction: ResizeDirection
): void {
  if ("layoutSizingVertical" in node && "layoutSizingHorizontal" in node) {
    type AutoLayoutChild = SceneNode & {
      layoutSizingVertical: "FIXED" | "HUG" | "FILL";
      layoutSizingHorizontal: "FIXED" | "HUG" | "FILL";
    };
    const lNode = node as AutoLayoutChild;
    if (
      (direction === "height" || direction === "proportional") &&
      lNode.layoutSizingVertical === "HUG"
    ) {
      lNode.layoutSizingVertical = "FIXED";
    }
    if (
      (direction === "width" || direction === "proportional") &&
      lNode.layoutSizingHorizontal === "HUG"
    ) {
      lNode.layoutSizingHorizontal = "FIXED";
    }
  }
}

function setLayoutPositioning(
  node: SceneNode,
  value: "AUTO" | "ABSOLUTE"
): void {
  if ("layoutPositioning" in node) {
    (node as SceneNode & { layoutPositioning: "AUTO" | "ABSOLUTE" })
      .layoutPositioning = value;
  }
}

function setAbsolutePositioningIfParentHasAutoLayout(
  node: SceneNode,
  parent: BaseNode
): void {
  if (
    "layoutPositioning" in node &&
    (parent.type === "FRAME" ||
      parent.type === "COMPONENT" ||
      parent.type === "INSTANCE") &&
    (parent as FrameNode).layoutMode !== "NONE"
  ) {
    (node as SceneNode & { layoutPositioning: "AUTO" | "ABSOLUTE" })
      .layoutPositioning = "ABSOLUTE";
  }
}

function markDisclaimerNode(
  node: BaseNode,
  asset: DisclaimerAsset,
  presetKey: string
): void {
  node.setSharedPluginData(PLUGIN_DATA_NAMESPACE, PLUGIN_DATA_ASSET_KEY, asset.key);
  node.setSharedPluginData(
    PLUGIN_DATA_NAMESPACE,
    PLUGIN_DATA_PRESET_KEY,
    presetKey
  );
}

function isMatchingDisclaimer(node: SceneNode, assetKey: string): boolean {
  return (
    node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, PLUGIN_DATA_ASSET_KEY) ===
      assetKey || node.name.includes(assetKey)
  );
}

function isPluginGeneratedDisclaimer(node: SceneNode, assetKey: string): boolean {
  return (
    node.getSharedPluginData(PLUGIN_DATA_NAMESPACE, PLUGIN_DATA_ASSET_KEY) ===
      assetKey || node.name.startsWith("Disclaimer — ")
  );
}

function findMatchingDisclaimer(
  bannerFrame: BannerFrame,
  assetKey: string
): ResizableNode | null {
  let result: ResizableNode | null = null;

  visitDescendants(bannerFrame, (node) => {
    if (!result && isResizable(node) && isMatchingDisclaimer(node, assetKey)) {
      result = node;
    }
  });

  return result;
}

function getTargetPercent(msg: ApplyResizeMessage): number | null {
  if (msg.presetKey === "custom") {
    if (
      msg.customPercent === null ||
      msg.customPercent <= 0 ||
      msg.customPercent > 100
    ) {
      return null;
    }
    return msg.customPercent;
  }

  const preset = DISCLAIMER_PRESETS[msg.presetKey];
  return preset && preset.percent !== null ? preset.percent : null;
}

function getPresetAndAsset(msg: ApplyResizeMessage): {
  preset: DisclaimerPreset;
  asset: DisclaimerAsset;
} | null {
  const preset = DISCLAIMER_PRESETS[msg.presetKey];
  if (!preset) return null;

  const asset = DISCLAIMER_ASSETS[preset.assetKey];
  if (!asset) return null;

  return { preset, asset };
}

function createDisclaimerNode(
  asset: DisclaimerAsset,
  presetKey: string
): ResizableNode {
  const node = figma.createNodeFromSvg(asset.svg);
  node.name = "Disclaimer — " + asset.label;

  if (!isResizable(node)) {
    node.remove();
    throw new Error("SVG-дисклеймер не поддерживает изменение размера");
  }

  markDisclaimerNode(node, asset, presetKey);
  setLayoutSizingFixed(node, "proportional");
  prepareSvgNodeForDeformation(node);

  return node;
}

function copyLayoutChildSettings(source: SceneNode, target: SceneNode): void {
  if ("layoutSizingVertical" in source && "layoutSizingVertical" in target) {
    (
      target as SceneNode & { layoutSizingVertical: "FIXED" | "HUG" | "FILL" }
    ).layoutSizingVertical = (
      source as SceneNode & { layoutSizingVertical: "FIXED" | "HUG" | "FILL" }
    ).layoutSizingVertical;
  }

  if ("layoutSizingHorizontal" in source && "layoutSizingHorizontal" in target) {
    (
      target as SceneNode & { layoutSizingHorizontal: "FIXED" | "HUG" | "FILL" }
    ).layoutSizingHorizontal = (
      source as SceneNode & { layoutSizingHorizontal: "FIXED" | "HUG" | "FILL" }
    ).layoutSizingHorizontal;
  }

  if ("layoutGrow" in source && "layoutGrow" in target) {
    (target as SceneNode & { layoutGrow: number }).layoutGrow = (
      source as SceneNode & { layoutGrow: number }
    ).layoutGrow;
  }

  if ("layoutAlign" in source && "layoutAlign" in target) {
    type AutoLayoutAlign = "MIN" | "CENTER" | "MAX" | "STRETCH" | "INHERIT";
    (target as SceneNode & { layoutAlign: AutoLayoutAlign }).layoutAlign = (
      source as SceneNode & { layoutAlign: AutoLayoutAlign }
    ).layoutAlign;
  }

  if ("layoutPositioning" in source && "layoutPositioning" in target) {
    (target as SceneNode & { layoutPositioning: "AUTO" | "ABSOLUTE" })
      .layoutPositioning = (
      source as SceneNode & { layoutPositioning: "AUTO" | "ABSOLUTE" }
    ).layoutPositioning;
  }

  if ("constraints" in source && "constraints" in target) {
    (target as SceneNode & { constraints: Constraints }).constraints = (
      source as SceneNode & { constraints: Constraints }
    ).constraints;
  }
}

function shouldPreserveManualPosition(parent: BaseNode, child: SceneNode): boolean {
  const parentHasAutoLayout =
    (parent.type === "FRAME" ||
      parent.type === "COMPONENT" ||
      parent.type === "INSTANCE") &&
    (parent as FrameNode).layoutMode !== "NONE";
  const childIsAutoLayoutChild =
    "layoutPositioning" in child &&
    (child as SceneNode & { layoutPositioning: "AUTO" | "ABSOLUTE" })
      .layoutPositioning === "AUTO";

  return !parentHasAutoLayout || !childIsAutoLayoutChild;
}

function replaceGeneratedDisclaimerNode(params: {
  node: ResizableNode;
  asset: DisclaimerAsset;
  presetKey: string;
  newWidth: number;
  newHeight: number;
}): ResizableNode {
  const { node, asset, presetKey, newWidth, newHeight } = params;
  const parent = node.parent;

  if (!canInsertChildren(parent)) return node;

  const index = parent.children.indexOf(node);
  const replacement = createDisclaimerNode(asset, presetKey);

  try {
    copyLayoutChildSettings(node, replacement);
    resizeSvgNodeToFrame(replacement, newWidth, newHeight);
    parent.insertChild(index >= 0 ? index : parent.children.length, replacement);
    if (shouldPreserveManualPosition(parent, replacement)) {
      replacement.x = node.x;
      replacement.y = node.y;
    }
    node.remove();
  } catch (err) {
    replacement.remove();
    throw err;
  }

  return replacement;
}

function resizeExistingDisclaimer(params: {
  node: ResizableNode;
  bannerFrame: BannerFrame;
  targetPercent: number;
  direction: ResizeDirection;
  onlyEnlarge: boolean;
  asset: DisclaimerAsset;
  presetKey: string;
}): { node: ResizableNode; actualPercent: number } {
  const {
    node,
    bannerFrame,
    targetPercent,
    direction,
    onlyEnlarge,
    asset,
    presetKey,
  } = params;

  if (node.locked) {
    throw new Error("Слой заблокирован (locked). Разблокируйте и попробуйте снова");
  }

  const currentPercent =
    ((node.width * node.height) / (bannerFrame.width * bannerFrame.height)) *
    100;
  const shouldRefreshGeneratedSvg =
    node.type !== "TEXT" && isPluginGeneratedDisclaimer(node, asset.key);

  if (onlyEnlarge && currentPercent >= targetPercent && !shouldRefreshGeneratedSvg) {
    return { node, actualPercent: round2(currentPercent) };
  }

  if (node.type === "TEXT") {
    const textNode = node as TextNode;
    if (textNode.textAutoResize !== "NONE") {
      textNode.textAutoResize = "NONE";
    }
  }

  setLayoutSizingFixed(node, direction);

  const { newWidth, newHeight } = calcNewDimensions(
    node.width,
    node.height,
    bannerFrame.width,
    bannerFrame.height,
    targetPercent,
    direction
  );

  const resizedNode = shouldRefreshGeneratedSvg
    ? replaceGeneratedDisclaimerNode({
        node,
        asset,
        presetKey,
        newWidth,
        newHeight,
      })
    : node;

  if (!shouldRefreshGeneratedSvg) {
    if (node.type === "TEXT") {
      node.resizeWithoutConstraints(newWidth, newHeight);
    } else {
      resizeSvgNodeToFrame(node, newWidth, newHeight);
    }
    markDisclaimerNode(node, asset, presetKey);
  }

  const actualArea = resizedNode.width * resizedNode.height;
  const bannerArea = bannerFrame.width * bannerFrame.height;
  const actualPercent = round2((actualArea / bannerArea) * 100);

  return { node: resizedNode, actualPercent };
}

function addDisclaimerToBody(params: {
  bannerFrame: BannerFrame;
  asset: DisclaimerAsset;
  presetKey: string;
  targetPercent: number;
}): { node: ResizableNode; actualPercent: number } {
  const { bannerFrame, asset, presetKey, targetPercent } = params;
  const bodyContainer = findBodyContainer(bannerFrame);

  if (!bodyContainer) {
    throw new Error("Не удалось найти текстовый auto-layout контейнер в баннере");
  }

  const padding = getAutoLayoutPadding(bodyContainer);
  const contentWidth = bodyContainer.width - padding.left - padding.right;

  if (contentWidth <= 0) {
    throw new Error("В текстовом контейнере нет доступной ширины для дисклеймера");
  }

  const node = createDisclaimerNode(asset, presetKey);
  const { newWidth, newHeight } = calcAreaWithWidth(
    bannerFrame.width,
    bannerFrame.height,
    targetPercent,
    contentWidth
  );

  try {
    resizeSvgNodeToFrame(node, newWidth, newHeight);
    setLayoutPositioning(node, "AUTO");
    bodyContainer.appendChild(node);
  } catch (err) {
    node.remove();
    throw err;
  }

  const actualArea = node.width * node.height;
  const bannerArea = bannerFrame.width * bannerFrame.height;
  const actualPercent = round2((actualArea / bannerArea) * 100);

  return { node, actualPercent };
}

function addDisclaimerToImage(params: {
  bannerFrame: BannerFrame;
  asset: DisclaimerAsset;
  presetKey: string;
  targetPercent: number;
}): { node: ResizableNode; actualPercent: number } {
  const { bannerFrame, asset, presetKey, targetPercent } = params;
  const bodyContainer = findBodyContainer(bannerFrame);
  const mainImage = findMainImageNode(bannerFrame);

  if (!mainImage) {
    throw new Error("Не удалось найти картинку или медиа-область в баннере");
  }

  const padding = bodyContainer
    ? getAutoLayoutPadding(bodyContainer)
    : { left: 0, right: 0, bottom: 0 };
  const mediaBounds = getRelativeBoundsFromAbsolute(
    mainImage.bounds,
    bannerFrame
  );
  const contentWidth = mediaBounds.width - padding.left - padding.right;

  if (contentWidth <= 0) {
    throw new Error("В медиа-области нет доступной ширины для дисклеймера");
  }

  const node = createDisclaimerNode(asset, presetKey);
  const { newWidth, newHeight } = calcAreaWithWidth(
    bannerFrame.width,
    bannerFrame.height,
    targetPercent,
    contentWidth
  );

  try {
    bannerFrame.appendChild(node);
    setAbsolutePositioningIfParentHasAutoLayout(node, bannerFrame);
    resizeSvgNodeToFrame(node, newWidth, newHeight);
    node.x = mediaBounds.x + padding.left;
    node.y = mediaBounds.y + mediaBounds.height - padding.bottom - node.height;

    if ("constraints" in node) {
      (node as SceneNode & { constraints: Constraints }).constraints = {
        horizontal: "STRETCH",
        vertical: "MAX",
      };
    }
  } catch (err) {
    node.remove();
    throw err;
  }

  const actualArea = node.width * node.height;
  const bannerArea = bannerFrame.width * bannerFrame.height;
  const actualPercent = round2((actualArea / bannerArea) * 100);

  return { node, actualPercent };
}

function buildState(): PluginState {
  const sel = figma.currentPage.selection;

  if (sel.length !== 1) {
    return {
      type: sel.length === 0 ? "no-selection" : "invalid",
      error:
        sel.length === 0
          ? "Выберите один disclaimer-слой или баннерный фрейм"
          : "Выберите ровно один слой",
      presets: DISCLAIMER_PRESETS,
    };
  }

  const sceneNode = sel[0];

  if (isTopLevelFrame(sceneNode)) {
    if (sceneNode.locked) {
      return {
        type: "invalid",
        error: "Баннер заблокирован (locked). Разблокируйте и попробуйте снова",
        presets: DISCLAIMER_PRESETS,
      };
    }

    if (sceneNode.width <= 0 || sceneNode.height <= 0) {
      return {
        type: "invalid",
        error: `Некорректные размеры баннера: ${sceneNode.width}×${sceneNode.height}`,
        presets: DISCLAIMER_PRESETS,
      };
    }

    return {
      type: "ready",
      info: {
        mode: "add-missing",
        disclaimerName: null,
        disclaimerWidth: null,
        disclaimerHeight: null,
        bannerName: sceneNode.name,
        bannerWidth: round2(sceneNode.width),
        bannerHeight: round2(sceneNode.height),
        currentPercent: null,
        isText: false,
        hasAutoLayout: sceneNode.layoutMode !== "NONE",
      },
      presets: DISCLAIMER_PRESETS,
    };
  }

  if (!isResizable(sceneNode)) {
    return {
      type: "invalid",
      error: `Тип слоя "${sceneNode.type}" не поддерживает изменение размера`,
      presets: DISCLAIMER_PRESETS,
    };
  }

  if (sceneNode.locked) {
    return {
      type: "invalid",
      error: "Слой заблокирован (locked). Разблокируйте и попробуйте снова",
      presets: DISCLAIMER_PRESETS,
    };
  }

  if (sceneNode.width <= 0 || sceneNode.height <= 0) {
    return {
      type: "invalid",
      error: `Некорректные размеры disclaimer: ${sceneNode.width}×${sceneNode.height}`,
      presets: DISCLAIMER_PRESETS,
    };
  }

  const bannerFrame = findBannerFrame(sceneNode);

  if (!bannerFrame) {
    return {
      type: "invalid",
      error: "Выделите disclaimer внутри баннерного фрейма или сам баннер",
      presets: DISCLAIMER_PRESETS,
    };
  }

  if (bannerFrame.width <= 0 || bannerFrame.height <= 0) {
    return {
      type: "invalid",
      error: `Некорректные размеры баннера: ${bannerFrame.width}×${bannerFrame.height}`,
      presets: DISCLAIMER_PRESETS,
    };
  }

  const disclaimerArea = sceneNode.width * sceneNode.height;
  const bannerArea = bannerFrame.width * bannerFrame.height;
  const currentPercent = (disclaimerArea / bannerArea) * 100;

  return {
    type: "ready",
    info: {
      mode: "resize-existing",
      disclaimerName: sceneNode.name,
      disclaimerWidth: round2(sceneNode.width),
      disclaimerHeight: round2(sceneNode.height),
      bannerName: bannerFrame.name,
      bannerWidth: round2(bannerFrame.width),
      bannerHeight: round2(bannerFrame.height),
      currentPercent: round2(currentPercent),
      isText: sceneNode.type === "TEXT",
      hasAutoLayout: nodeHasAutoLayout(sceneNode),
    },
    presets: DISCLAIMER_PRESETS,
  };
}

function sendState(): void {
  figma.ui.postMessage(buildState());
}

// ─── Plugin entrypoint ─────────────────────────────────────────────────────

figma.showUI(__html__, { width: 432, height: 672 });

sendState();

figma.on("selectionchange", () => {
  sendState();
});

figma.ui.on("message", (msg: UiMessage) => {
  try {
    if (msg.type === "request-state") {
      sendState();
      return;
    }

    if (msg.type === "resize") {
      figma.ui.resize(msg.width, msg.height);
      return;
    }

    if (msg.type === "apply-resize") {
      const state = buildState();

      if (state.type !== "ready" || !state.info) {
        figma.ui.postMessage({
          type: "error",
          message: state.error !== undefined ? state.error : "Нет выбранного слоя",
        });
        return;
      }

      const presetAndAsset = getPresetAndAsset(msg);
      if (!presetAndAsset) {
        figma.ui.postMessage({
          type: "error",
          message: "Не найден SVG-ассет для выбранного пресета",
        });
        return;
      }

      const targetPercent = getTargetPercent(msg);
      if (targetPercent === null) {
        figma.ui.postMessage({
          type: "error",
          message: "Укажите корректный процент (0–100)",
        });
        return;
      }

      const { asset } = presetAndAsset;
      const sel = figma.currentPage.selection;

      if (sel.length !== 1) {
        figma.ui.postMessage({
          type: "error",
          message: "Выбор изменился. Повторите.",
        });
        return;
      }

      const selectedNode = sel[0];
      let result: { node: ResizableNode; actualPercent: number };
      let actionLabel = "Применено";

      if (state.info.mode === "add-missing") {
        if (!isFrameLike(selectedNode)) {
          figma.ui.postMessage({
            type: "error",
            message: "Выберите баннерный фрейм",
          });
          return;
        }

        const existingDisclaimer = findMatchingDisclaimer(selectedNode, asset.key);

        if (existingDisclaimer) {
          result = resizeExistingDisclaimer({
            node: existingDisclaimer,
            bannerFrame: selectedNode,
            targetPercent,
            direction: msg.direction,
            onlyEnlarge: msg.onlyEnlarge,
            asset,
            presetKey: msg.presetKey,
          });
        } else {
          result =
            msg.addTarget === "image"
              ? addDisclaimerToImage({
                  bannerFrame: selectedNode,
                  asset,
                  presetKey: msg.presetKey,
                  targetPercent,
                })
              : addDisclaimerToBody({
                  bannerFrame: selectedNode,
                  asset,
                  presetKey: msg.presetKey,
                  targetPercent,
                });
          actionLabel = "Добавлено";
        }
      } else {
        if (!isResizable(selectedNode)) {
          figma.ui.postMessage({
            type: "error",
            message: "Слой не поддерживает resize",
          });
          return;
        }

        const bannerFrame = findBannerFrame(selectedNode);

        if (!bannerFrame) {
          figma.ui.postMessage({
            type: "error",
            message: "Выделите disclaimer внутри баннерного фрейма",
          });
          return;
        }

        result = resizeExistingDisclaimer({
          node: selectedNode,
          bannerFrame,
          targetPercent,
          direction: msg.direction,
          onlyEnlarge: msg.onlyEnlarge,
          asset,
          presetKey: msg.presetKey,
        });
      }

      const resultMessage =
        actionLabel +
        ": " +
        round2(result.node.width) +
        "×" +
        round2(result.node.height) +
        " px — " +
        result.actualPercent +
        "% площади баннера";

      figma.currentPage.selection = [result.node];
      figma.notify(resultMessage, { timeout: 4000 });
      figma.ui.postMessage({ type: "success", message: resultMessage });
      sendState();
      return;
    }
  } catch (err) {
    figma.ui.postMessage({
      type: "error",
      message: "Ошибка: " + String(err instanceof Error ? err.message : err),
    });
  }
});
