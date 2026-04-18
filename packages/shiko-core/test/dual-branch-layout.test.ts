import { describe, expect, it } from "bun:test";
import {
  createBranchNode,
  createLeafNode,
  flatten,
  type ShikoNode,
} from "../src/index";
import { DualBranchLayout } from "../src/layout/dual-branch-layout";

interface LayoutInputBundle {
  root: ShikoNode<unknown>;
  leftRootIds: readonly string[];
  rightRootIds: readonly string[];
  childSizes: ReadonlyMap<string, { width: number; height: number }>;
  expandedIds: ReadonlySet<string>;
  horizontalGap: number;
}

function buildFixture(): LayoutInputBundle {
  const leftDeepLeafA = createLeafNode("left-deep-leaf-a", { label: "left deep leaf a" });
  const leftDeepLeafB = createLeafNode("left-deep-leaf-b", { label: "left deep leaf b" });
  const leftDeepMid = createBranchNode("left-deep-mid", [leftDeepLeafA, leftDeepLeafB], {
    label: "left deep mid",
  });
  const leftA = createBranchNode("left-a", [leftDeepMid], { label: "left a" });
  const leftB = createBranchNode("left-b", [createLeafNode("left-b-leaf", { label: "left b leaf" })], {
    label: "left b",
  });

  const rightDeepLeafA = createLeafNode("right-deep-leaf-a", { label: "right deep leaf a" });
  const rightDeepMid = createBranchNode("right-deep-mid", [rightDeepLeafA], { label: "right deep mid" });
  const rightA = createBranchNode("right-a", [rightDeepMid], { label: "right a" });
  const rightB = createBranchNode("right-b", [createLeafNode("right-b-leaf", { label: "right b leaf" })], {
    label: "right b",
  });

  const root = createBranchNode("root", [leftA, leftB, rightA, rightB], { label: "root" });
  const allNodes = flatten(root);

  const childSizes = new Map<string, { width: number; height: number }>();
  for (const node of allNodes) {
    if (node.id === "root") {
      childSizes.set(node.id, { width: 220, height: 64 });
      continue;
    }

    if (node.id.includes("deep")) {
      childSizes.set(node.id, { width: 156, height: 56 });
      continue;
    }

    childSizes.set(node.id, { width: 168, height: 56 });
  }

  return {
    root,
    leftRootIds: ["left-a", "left-b"],
    rightRootIds: ["right-a", "right-b"],
    childSizes,
    expandedIds: new Set(allNodes.map((node) => node.id)),
    horizontalGap: 72,
  };
}

function collectSubtreeIds(root: ShikoNode<unknown>, startIds: readonly string[]): Set<string> {
  const targets = new Set(startIds);
  const result = new Set<string>();
  const stack: ShikoNode<unknown>[] = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (targets.has(current.id)) {
      const branchStack: ShikoNode<unknown>[] = [current];
      while (branchStack.length > 0) {
        const branchNode = branchStack.pop();
        if (!branchNode) {
          continue;
        }

        result.add(branchNode.id);
        for (let i = branchNode.children.length - 1; i >= 0; i -= 1) {
          branchStack.push(branchNode.children[i]!);
        }
      }
      continue;
    }

    for (let i = current.children.length - 1; i >= 0; i -= 1) {
      stack.push(current.children[i]!);
    }
  }

  return result;
}

describe("DualBranchLayout mirror constraints", () => {
  it("keeps all left-subtree nodes strictly left of root by at least horizontal gap", () => {
    const fixture = buildFixture();
    const layout = new DualBranchLayout<unknown>();

    const result = layout.computeLayout({
      root: fixture.root,
      childSizes: fixture.childSizes,
      expandedIds: fixture.expandedIds,
      config: {
        orientation: "horizontal",
        horizontalGap: fixture.horizontalGap,
        verticalGap: 22,
      },
    });

    const rootPosition = result.positions.get("root");
    const rootSize = fixture.childSizes.get("root");
    if (!rootPosition || !rootSize) {
      throw new Error("Root must be present in layout result.");
    }

    const leftIds = collectSubtreeIds(fixture.root, fixture.leftRootIds);
    for (const nodeId of leftIds) {
      const point = result.positions.get(nodeId);
      const size = fixture.childSizes.get(nodeId);
      if (!point || !size) {
        throw new Error(`Expected node ${nodeId} to have position and size.`);
      }

      const nodeRight = point.x + size.width;
      const rootLeftWithGap = rootPosition.x - fixture.horizontalGap;

      expect(nodeRight).toBeLessThanOrEqual(rootLeftWithGap);
    }

    const rightIds = collectSubtreeIds(fixture.root, fixture.rightRootIds);
    for (const nodeId of rightIds) {
      const point = result.positions.get(nodeId);
      if (!point) {
        throw new Error(`Expected node ${nodeId} to have a position.`);
      }

      const rootRightWithGap = rootPosition.x + rootSize.width + fixture.horizontalGap;
      expect(point.x).toBeGreaterThanOrEqual(rootRightWithGap);
    }
  });

  it("produces the same result for chunked and synchronous layouts", async () => {
    const fixture = buildFixture();
    const layout = new DualBranchLayout<unknown>();

    const syncResult = layout.computeLayout({
      root: fixture.root,
      childSizes: fixture.childSizes,
      expandedIds: fixture.expandedIds,
      config: {
        orientation: "horizontal",
        horizontalGap: fixture.horizontalGap,
        verticalGap: 22,
      },
    });

    const chunkedResult = await layout.computeLayoutChunked(
      {
        root: fixture.root,
        childSizes: fixture.childSizes,
        expandedIds: fixture.expandedIds,
        config: {
          orientation: "horizontal",
          horizontalGap: fixture.horizontalGap,
          verticalGap: 22,
        },
      },
      {
        chunkSize: 2,
      },
    );

    expect(chunkedResult.totalSize).toEqual(syncResult.totalSize);
    expect(Array.from(chunkedResult.positions.entries())).toEqual(
      Array.from(syncResult.positions.entries()),
    );
  });
});