import { convertJsonToShiko } from "./apps/json-chizu/src/lib/json-to-shiko.ts";
import { estimateNodeSize } from "./packages/shiko-vue/src/utils/renderUtils.ts";

const input = { editorial_content: { metadata: { author: "Agri-Science Journal", published_date: "2026-04-19T14:00:00Z", editor_version: "tiptap-v2" } } };
const { root } = convertJsonToShiko(input);

function findMetadata(node) {
    if (node.label && node.label.includes("metadata")) return node;
    if (node.children) {
        for (const child of node.children) {
            const found = findMetadata(child);
            if (found) return found;
        }
    }
    return null;
}

const metadataNode = findMetadata(root);

if (!metadataNode) {
    console.error("Metadata node not found");
    process.exit(1);
}

const font = "500 13px Inter, Segoe UI, sans-serif";
const defaultSize = { width: 160, height: 70 };
const estimatedSize = estimateNodeSize(metadataNode, font, defaultSize);

console.log("Label lines count:", metadataNode.label.split("\n").length);
console.log("Estimated height:", estimatedSize.height);
