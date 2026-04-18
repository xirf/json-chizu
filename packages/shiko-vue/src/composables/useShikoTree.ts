import {
  ShikoTreeController,
  type ShikoNode,
} from "@shiko/core";
import {
  computed,
  onBeforeUnmount,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from "vue";

export interface UseShikoTreeOptions<T = unknown> {
  controller?: ShikoTreeController<T>;
  initialExpandedIds?: Iterable<string>;
}

export function useShikoTree<T = unknown>(
  root: MaybeRefOrGetter<ShikoNode<T>>,
  options: UseShikoTreeOptions<T> = {},
) {
  const initialRoot = toValue(root);

  const tree =
    options.controller ??
    new ShikoTreeController<T>({
      root: initialRoot,
      initialExpandedIds: options.initialExpandedIds ?? [initialRoot.id],
    });

  const revision = shallowRef(0);
  const unsubscribe = tree.subscribe(() => {
    revision.value += 1;
  });

  onBeforeUnmount(() => {
    unsubscribe();
  });

  watch(
    () => toValue(root),
    (nextRoot) => {
      tree.setRoot(nextRoot);
    },
  );

  const treeRoot = computed(() => {
    revision.value;
    return tree.root;
  });

  const expandedIds = computed(() => {
    revision.value;
    return new Set(tree.expandedIds);
  });

  const visibleNodes = computed(() => {
    revision.value;
    return tree.visibleNodes();
  });

  return {
    tree,
    treeRoot,
    expandedIds,
    visibleNodes,
    expand: (nodeId: string) => tree.expand(nodeId),
    collapse: (nodeId: string) => tree.collapse(nodeId),
    toggleExpansion: (nodeId: string) => tree.toggleExpansion(nodeId),
    expandAll: () => tree.expandAll(),
    collapseAll: () => tree.collapseAll(),
    expandToLevel: (level: number) => tree.expandToLevel(level),
  };
}
