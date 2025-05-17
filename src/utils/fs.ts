import chokidar from "chokidar";
import ignore from "ignore";
import { isText } from "istextorbinary";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { ignoredDirectories } from "../config.js";
import { tokenize } from "./tokenizer.js";

const tokenCountCache = new Map<string, { mtime: number; count: number }>();

const builtinIgnores = [
  // lock files
  "package-lock.json",
  "pnpm-lock.yaml",
  "*.lock",
  // dependencies
  "node_modules",
  // git
  ".git",
];

// gitignore filter
const gitignorePath = resolve(process.cwd(), ".gitignore");
const gitignoreContent = existsSync(gitignorePath)
  ? readFileSync(gitignorePath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .map((line) => line.replace(/^\//, ""))
      .join("\n")
  : "";
const gitignoreFilter = ignore.default().add(ignoredDirectories).add(builtinIgnores).add(gitignoreContent);

type FileTreeItemBase = {
  name: string;
  path: string;
  relativePath: string;
  level: number;
  tokenCount: number;
};

export type FileTreeFileItem = FileTreeItemBase & {
  type: "file";
  extension: string;
  size: number;
  selected: boolean;
};

export type FileTreeDirectoryItem = FileTreeItemBase & {
  type: "directory";
  files: FileTreeFileItem[];
  directories: FileTreeDirectoryItem[];
  expanded: boolean;
  selected: boolean;
  partialSelected?: boolean;
};

export const isFileTreeFileItem = (item: FileTreeDirectoryItem | FileTreeFileItem): item is FileTreeFileItem => {
  return item.type === "file";
};

export const isFileTreeDirectoryItem = (
  item: FileTreeDirectoryItem | FileTreeFileItem
): item is FileTreeDirectoryItem => {
  return item.type === "directory";
};

export const getFileTree = (
  path: string,
  opts?: {
    level?: number;
    getIsSelected?: (path: string) => boolean;
    getIsExpanded?: (path: string) => boolean;
    rootPath?: string;
  }
) => {
  const result: FileTreeDirectoryItem = {
    type: "directory",
    name: path.split("/").pop()!,
    path,
    relativePath: relative(opts?.rootPath ?? path, path),
    files: [],
    directories: [],
    level: opts?.level ?? 0,
    expanded: opts?.getIsExpanded?.(path) ?? false,
    selected: opts?.getIsSelected?.(path) ?? false,
    tokenCount: 0,
  };

  const items = readdirSync(path);

  for (const item of items) {
    const itemPath = resolve(path, item);
    const relativePath = relative(process.cwd(), itemPath);

    try {
      const stats = statSync(itemPath);
      const extension = item.includes(".") ? item.split(".").pop()! : "";

      if (stats.isSymbolicLink()) continue;

      const pathToCheck = stats.isDirectory() ? `${relativePath}/` : relativePath;
      if (relativePath && gitignoreFilter.ignores(pathToCheck)) continue;

      if (stats.isDirectory()) {
        const subDir = getFileTree(itemPath, {
          level: result.level + 1,
          getIsSelected: opts?.getIsSelected,
          getIsExpanded: opts?.getIsExpanded,
          rootPath: opts?.rootPath ?? path,
        });
        if (subDir.tokenCount > 0) {
          result.directories.push(subDir);
          result.tokenCount += subDir.tokenCount;
        }
      } else {
        // skip files larger than 512KB
        if (stats.size > 512 * 1024) continue;

        try {
          // If isText(itemPath) fails, try checking the file buffer directly as fallback for files without a recognized extension
          let isTextFile = isText(itemPath);
          if (!isTextFile) {
            try {
              const buffer = readFileSync(itemPath);
              isTextFile = isText(undefined, buffer);
            } catch {}
          }
          if (!isTextFile) continue;

          let fileTokenCount: number;
          const cached = tokenCountCache.get(itemPath);

          if (cached && cached.mtime === stats.mtimeMs) {
            fileTokenCount = cached.count;
          } else {
            const content = readFileSync(itemPath, "utf8");
            fileTokenCount = tokenize(content).length;
            tokenCountCache.set(itemPath, {
              mtime: stats.mtimeMs,
              count: fileTokenCount,
            });
          }

          if (fileTokenCount > 0) {
            result.tokenCount += fileTokenCount;
            result.files.push({
              type: "file",
              name: item,
              path: itemPath,
              relativePath: relative(opts?.rootPath ?? path, itemPath),
              extension,
              size: stats.size,
              level: result.level + 1,
              selected: opts?.getIsSelected?.(itemPath) ?? false,
              tokenCount: fileTokenCount,
            });
          }
        } catch {
          continue;
        }
      }
    } catch {}
  }

  return result;
};

export const watch = (path: string, callback: () => void) => {
  const watcher = chokidar.watch(path, {
    persistent: true,
    followSymlinks: false,
    ignoreInitial: true,
    ignored: (currentPath: string) => {
      const relativePath = relative(process.cwd(), currentPath);
      try {
        const stats = statSync(currentPath);
        const pathToCheck = stats.isDirectory() ? `${relativePath}/` : relativePath;
        return Boolean(relativePath && gitignoreFilter.ignores(pathToCheck));
      } catch {
        return false;
      }
    },
  });
  watcher.on("ready", () => {
    watcher.on("all", callback);
  });
  return watcher;
};
