import { readFileSync } from "node:fs";
import { FileTreeFileItem } from "./utils/fs.js";
import { GitCommitHunk } from "./utils/git.js";

type FileTreeNode = {
  [key: string]: FileTreeNode;
};

const buildFileTreeList = (files: FileTreeFileItem[]): string => {
  const tree: FileTreeNode = {};
  for (const file of files) {
    const parts = file.relativePath.split(/[/\\]/);
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

export const buildFilePrompt = (files: FileTreeFileItem[]) => {
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

export const buildGitPrompt = (hunks: GitCommitHunk[]) => {
  const commitsMap = new Map<string, { subject: string; files: Map<string, GitCommitHunk[]> }>();

  for (const hunk of hunks) {
    if (!hunk.commitSha || !hunk.filePath) continue;

    let commitEntry = commitsMap.get(hunk.commitSha);
    if (!commitEntry) {
      commitEntry = { subject: hunk.commitSubject, files: new Map<string, GitCommitHunk[]>() };
      commitsMap.set(hunk.commitSha, commitEntry);
    }

    let fileHunks = commitEntry.files.get(hunk.filePath);
    if (!fileHunks) {
      fileHunks = [];
      commitEntry.files.set(hunk.filePath, fileHunks);
    }
    fileHunks.push(hunk);
  }

  let out = "<context>\n";
  if (commitsMap.size === 0 && hunks.length > 0) {
    const fileBasedGrouping = new Map<string, GitCommitHunk[]>();
    for (const hunk of hunks) {
      if (!hunk.filePath) continue;
      const fh = fileBasedGrouping.get(hunk.filePath) ?? [];
      fh.push(hunk);
      fileBasedGrouping.set(hunk.filePath, fh);
    }
    for (const [filePath, fileHunksList] of fileBasedGrouping.entries()) {
      out += `  <uncommitted path="${filePath}">\n`;
      for (const fh of fileHunksList) {
        out += `    <patch path="${fh.filePath}">\n`;
        out += `${fh.header
          .split("\n")
          .map((l) => `      ${l}`)
          .join("\n")}\n`;
        out += `${fh.content
          .split("\n")
          .map((l) => `      ${l}`)
          .join("\n")}\n`;
        out += "    </patch>\n";
      }
      out += "  </uncommitted>\n";
    }
  } else {
    for (const [sha, commitData] of commitsMap.entries()) {
      out += `  <commit sha="${sha}" message="${commitData.subject}">\n`;
      for (const [filePath, fileHunksList] of commitData.files.entries()) {
        out += `    <patch path="${filePath}">\n`;
        for (const hunk of fileHunksList) {
          out += `${hunk.header
            .split("\n")
            .map((l) => `      ${l}`)
            .join("\n")}\n`;
          out += `${hunk.content
            .split("\n")
            .map((l) => `      ${l}`)
            .join("\n")}\n`;
        }
        out += "    </patch>\n";
      }
      out += "  </commit>\n";
    }
  }
  out += "</context>";
  return out;
};
