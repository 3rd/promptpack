import { memo } from "react";
import { Text } from "ink";
import { relative } from "node:path";
import { theme } from "../../../config.js";
import { FileTreeDirectoryItem, FileTreeFileItem, isFileTreeDirectoryItem } from "../../../utils/fs.js";

export const FileModeSearchResult = memo(
  ({
    result,
    isSelected,
    root,
  }: {
    result: {
      path: string;
      name: string;
      isDirectory: boolean;
      tokenCount: number;
    };
    isSelected: boolean;
    root: FileTreeDirectoryItem;
  }) => {
    const findInTree = (
      dir: FileTreeDirectoryItem,
      path: string
    ): FileTreeDirectoryItem | FileTreeFileItem | undefined => {
      if (dir.path === path) return dir;
      for (const subDir of dir.directories) {
        const found = findInTree(subDir, path);
        if (found) return found;
      }
      return dir.files.find((f) => f.path === path);
    };
    const item = findInTree(root, result.path);
    const relativePath = relative(root.path, result.path);

    let color;
    if (item && isFileTreeDirectoryItem(item)) {
      if (item.selected && !item.partialSelected) {
        color = theme.selected;
      } else if (item.partialSelected) {
        color = theme.partiallySelected;
      }
    } else if (isSelected) {
      color = theme.selected;
    }

    return (
      <Text color={color}>
        {result.isDirectory ? "📁 " : "📄 "}
        {relativePath}
        <Text color={theme.tokenCount.label}>
          {" "}
          (<Text color={theme.tokenCount.value}>{result.tokenCount}</Text> tokens)
        </Text>
      </Text>
    );
  }
);
