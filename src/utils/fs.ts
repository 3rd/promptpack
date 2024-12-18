import { readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import chokidar from "chokidar";
import { ignoredDirectories } from "../config.js";

type TreeItemBase = {
  name: string;
  path: string;
  relativePath: string;
  level: number;
};

export type TreeFile = TreeItemBase & {
  type: "file";
  extension: string;
  size: number;
  selected: boolean;
};

export type TreeDirectory = TreeItemBase & {
  type: "directory";
  files: TreeFile[];
  directories: TreeDirectory[];
  expanded: boolean;
  selected: boolean;
  partialSelected?: boolean;
};

export const isTreeFile = (item: TreeDirectory | TreeFile): item is TreeFile => {
  return item.type === "file";
};

export const isTreeDirectory = (item: TreeDirectory | TreeFile): item is TreeDirectory => {
  return item.type === "directory";
};

export const getTree = (
  path: string,
  opts?: {
    level?: number;
    getIsSelected?: (path: string) => boolean;
    getIsExpanded?: (path: string) => boolean;
    rootPath?: string;
  }
) => {
  const result: TreeDirectory = {
    type: "directory",
    name: path.split("/").pop()!,
    path,
    relativePath: relative(opts?.rootPath ?? path, path),
    files: [],
    directories: [],
    level: opts?.level ?? 0,
    expanded: opts?.getIsExpanded?.(path) ?? false,
    selected: opts?.getIsSelected?.(path) ?? false,
  };

  const items = readdirSync(path);

  for (const item of items) {
    const itemPath = resolve(path, item);
    try {
      const stats = statSync(itemPath);
      const extension = item.includes(".") ? item.split(".").pop()! : "";

      if (stats.isSymbolicLink()) continue;

      if (stats.isDirectory()) {
        if (ignoredDirectories.includes(item)) continue;
        result.directories.push(
          getTree(itemPath, {
            level: result.level + 1,
            getIsSelected: opts?.getIsSelected,
            getIsExpanded: opts?.getIsExpanded,
            rootPath: opts?.rootPath ?? path,
          })
        );
      } else {
        result.files.push({
          type: "file",
          name: item,
          path: itemPath,
          relativePath: relative(opts?.rootPath ?? path, itemPath),
          extension,
          size: stats.size,
          level: result.level + 1,
          selected: opts?.getIsSelected?.(itemPath) ?? false,
        });
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
    ignored: ignoredDirectories.map((dir) => `**/${dir}/**`),
  });
  watcher.on("ready", () => {
    watcher.on("all", callback);
  });
  return watcher;
};
