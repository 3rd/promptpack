import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Box, DOMElement, measureElement, Newline, Text } from "ink";
import { theme } from "../config.js";
import { isTreeDirectory, TreeDirectory, TreeFile } from "../utils/fs.js";

export type TreeFileLineProps = {
  file: TreeFile;
  isCursor: boolean;
};
export const TreeFileLine = memo(({ file, isCursor }: TreeFileLineProps) => {
  const indent = " ".repeat(Math.max(0, (file.level - 1) * 2));

  return (
    <>
      <Text backgroundColor={isCursor ? theme.cursor : undefined} color={file.selected ? theme.selected : undefined}>
        {indent}
        {file.name}{" "}
        <Text color={theme.tokenCount.label}>
          (<Text color={theme.tokenCount.value}>{file.tokenCount}</Text> tokens)
        </Text>
      </Text>
      <Newline />
    </>
  );
});

export type TreeDirectoryLineProps = {
  directory: TreeDirectory;
  isCursor: boolean;
};
export const TreeDirectoryLine = memo(({ directory, isCursor }: TreeDirectoryLineProps) => {
  const indent = " ".repeat(Math.max(0, (directory.level - 1) * 2));

  let color;
  if (directory.selected && !directory.partialSelected) {
    color = theme.selected;
  } else if (directory.partialSelected) {
    color = theme.partiallySelected;
  }

  return (
    <>
      <Text backgroundColor={isCursor ? theme.cursor : undefined} color={color}>
        {indent}
        {directory.expanded ? "▼ " : "▶ "}
        {directory.name}{" "}
        <Text color={theme.tokenCount.label}>
          (<Text color={theme.tokenCount.value}>{directory.tokenCount}</Text> tokens)
        </Text>
      </Text>
      <Newline />
    </>
  );
});

const getScrollTop = (availableHeight: number, lineCount: number, cursorIndex: number) => {
  const maxScrollTop = Math.max(0, lineCount - availableHeight);
  const scrollTop = Math.max(0, Math.min(maxScrollTop, cursorIndex - availableHeight / 2));
  return scrollTop;
};

type TreeProps = {
  items: (TreeDirectory | TreeFile)[];
  cursorItemPath: string;
};
export const Tree = ({ items, cursorItemPath }: TreeProps) => {
  const wrapperRef = useRef<DOMElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!wrapperRef.current) return;
    setHeight(measureElement(wrapperRef.current).height);
  }, []);

  const viewportItems = useMemo(() => {
    if (!wrapperRef.current) return [];
    const cursorIndex = items.findIndex((item) => item.path === cursorItemPath) ?? 0;
    const scrollTop = getScrollTop(height, items.length, cursorIndex);
    return items.slice(scrollTop, scrollTop + height);
  }, [items, cursorItemPath, height]);

  return (
    <Box
      ref={wrapperRef}
      borderColor={theme.border}
      borderStyle="round"
      borderTop={false}
      flexDirection="column"
      flexGrow={1}
    >
      <Text>
        {viewportItems.map((item) => {
          const isCursor = item.path === cursorItemPath;

          if (isTreeDirectory(item)) {
            return <TreeDirectoryLine key={item.path} directory={item} isCursor={isCursor} />;
          }
          return <TreeFileLine key={item.path} file={item} isCursor={isCursor} />;
        })}
      </Text>
    </Box>
  );
};
