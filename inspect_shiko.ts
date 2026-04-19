import { convertJsonToShiko } from "./apps/json-chizu/src/lib/json-to-shiko.ts";

const input = { editorial_content: { metadata: { author: "Agri-Science Journal", published_date: "2026-04-19T14:00:00Z", editor_version: "tiptap-v2" } } };
const { root } = convertJsonToShiko(input);

function printTree(node, indent = "") {
    console.log(`${indent}${node.label}`);
    if (node.children) {
        node.children.forEach(c => printTree(c, indent + "  "));
    }
}

printTree(root);
