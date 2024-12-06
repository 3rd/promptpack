import { readFileSync } from "node:fs";
import { TreeFile } from "./utils/fs.js";

type FileTreeNode = {
  [key: string]: FileTreeNode;
};

const buildFileTreeList = (files: TreeFile[]): string => {
  const tree: FileTreeNode = {};
  for (const file of files) {
    const parts = file.relativePath.split("/");
    let current: FileTreeNode = tree;
    for (const part of parts) {
      if (!Object.hasOwn(current, part)) current[part] = {};
      current = current[part];
    }
  }

  const renderTree = (node: FileTreeNode, prefix = "  "): string => {
    const entries = Object.keys(node).sort();
    let result = "";
    for (let i = 0; i < entries.length; i++) {
      const key = entries[i];
      const isLast = i === entries.length - 1;
      const branch = isLast ? "└─ " : "├─ ";
      result += `${prefix}${branch}${key}\n`;
      const subtree = node[key];
      if (Object.keys(subtree).length > 0) {
        const nextPrefix = prefix + (isLast ? "   " : "│  ");
        result += renderTree(subtree, nextPrefix);
      }
    }
    return result;
  };

  const treeText = renderTree(tree).trimEnd();
  return treeText.length > 0 ? treeText : "No files selected";
};

export const buildPrompt = (files: TreeFile[]) => {
  const fileTreeList = buildFileTreeList(files);
  let result = "<context>\n";
  if (fileTreeList !== "No files selected") {
    result += "  <tree>\n";
    result += fileTreeList
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n");
    result += "\n  </tree>\n";
  }

  for (const file of files) {
    const content = readFileSync(file.path, "utf8").trimEnd();
    result += `  <file path="${file.relativePath}">\n`;
    result += content
      .split("\n")
      .map((line) => `    ${line}`)
      .join("\n");
    result += "\n  </file>\n";
  }

  result += "</context>";
  return result;
};
