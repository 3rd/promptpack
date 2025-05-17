import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Box, DOMElement, measureElement, Text } from "ink";
import { theme } from "../config.js";
import { GitCommit, GitCommitFile, GitCommitHunk, isGitCommit } from "../utils/git.js";

type GitTreeCommitLineProps = {
  commit: GitCommit;
  isCursor: boolean;
};

const GitTreeCommitLine = memo(({ commit, isCursor }: GitTreeCommitLineProps) => {
  let color;
  if (commit.selected && !commit.partiallySelected) {
    color = theme.selected;
  } else if (commit.partiallySelected) {
    color = theme.partiallySelected;
  }

  const prefix = commit.expanded ? "▼ " : "▶ ";
  const hash = commit.sha.slice(0, 7);
  const tokenDisplay = ` (${commit.tokenCount} tokens)`;
  const approximateFixedWidth = prefix.length + hash.length + tokenDisplay.length + 5;

  const terminalWidth = process.stdout.columns || 80;
  const maxSubjectLength = Math.max(0, terminalWidth - approximateFixedWidth);

  const subject =
    commit.subject.length > maxSubjectLength
      ? `${commit.subject.slice(0, Math.max(0, maxSubjectLength - 3))}...`
      : commit.subject;

  return (
    <Text backgroundColor={isCursor ? theme.cursor : undefined} color={color} wrap="truncate">
      <Text>{prefix}</Text>
      <Text color={theme.commitColor}>{hash} </Text>
      <Text>{subject} </Text>
      <Text color={theme.tokenCount.label}>
        (<Text color={theme.tokenCount.value}>{commit.tokenCount}</Text> tokens)
      </Text>
    </Text>
  );
});

type GitTreeFileLineProps = {
  file: GitCommitFile;
  isCursor: boolean;
};

const GitTreeFileLine = memo(({ file, isCursor }: GitTreeFileLineProps) => {
  let color;
  if (file.selected && !file.partiallySelected) {
    color = theme.selected;
  } else if (file.partiallySelected) {
    color = theme.partiallySelected;
  }

  const prefix = `  ${file.expanded ? "▼ " : "▶ "}`;
  const tokenDisplay = ` (${file.tokenCount} tokens)`;
  const approximateFixedWidth = prefix.length + tokenDisplay.length + 5;

  const terminalWidth = process.stdout.columns || 80;
  const maxFileNameLength = Math.max(0, terminalWidth - approximateFixedWidth);

  const fileName = file.path.split("/").pop() || "";
  const trimmedFileName =
    fileName.length > maxFileNameLength ? `${fileName.slice(0, Math.max(0, maxFileNameLength - 3))}...` : fileName;

  return (
    <Text backgroundColor={isCursor ? theme.cursor : undefined} color={color} wrap="truncate">
      {prefix}
      {trimmedFileName}{" "}
      <Text color={theme.tokenCount.label}>
        (<Text color={theme.tokenCount.value}>{file.tokenCount}</Text> tokens)
      </Text>
    </Text>
  );
});

export type GitTreeHunkLineProps = {
  hunk: GitCommitHunk;
  isCursor: boolean;
};

export const GitTreeHunkLine = memo(({ hunk, isCursor }: GitTreeHunkLineProps) => {
  const prefix = "    ";
  const tokenDisplay = ` (${hunk.tokenCount} tokens)`;
  const approximateFixedWidth = prefix.length + tokenDisplay.length + 5;

  const terminalWidth = process.stdout.columns || 80;
  const maxHunkNameLength = Math.max(0, terminalWidth - approximateFixedWidth);

  const hunkName =
    hunk.name.length > maxHunkNameLength ? `${hunk.name.slice(0, Math.max(0, maxHunkNameLength - 3))}...` : hunk.name;

  return (
    <Text
      backgroundColor={isCursor ? theme.cursor : undefined}
      color={hunk.selected ? theme.selected : undefined}
      wrap="truncate"
    >
      <Text>{prefix}</Text>
      <Text>{hunkName} </Text>
      <Text color={theme.tokenCount.label}>
        (<Text color={theme.tokenCount.value}>{hunk.tokenCount}</Text> tokens)
      </Text>
    </Text>
  );
});

const getScrollTop = (availableHeight: number, lineCount: number, cursorIndex: number) => {
  const maxScrollTop = Math.max(0, lineCount - availableHeight);
  const scrollTop = Math.max(0, Math.min(maxScrollTop, cursorIndex - availableHeight / 2));
  return scrollTop;
};

const findParentCommitSha = (
  item: GitCommit | GitCommitFile | GitCommitHunk,
  items: (GitCommit | GitCommitFile | GitCommitHunk)[]
): string => {
  if (isGitCommit(item)) {
    return item.sha;
  }

  const index = items.indexOf(item);
  for (let i = index - 1; i >= 0; i--) {
    const prev = items[i];
    if (isGitCommit(prev)) {
      return prev.sha;
    }
  }

  return "";
};

type GitTreeProps = {
  commits: GitCommit[] | null;
  currentItemPath: string | null;
};

export const GitTree = ({ commits, currentItemPath }: GitTreeProps) => {
  const wrapperRef = useRef<DOMElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!wrapperRef.current) return;
    setHeight(measureElement(wrapperRef.current).height);
  }, []);

  const visibleItems = useMemo(() => {
    const items: (GitCommit | GitCommitFile | GitCommitHunk)[] = [];

    for (const commit of commits ?? []) {
      items.push(commit);
      if (commit.expanded) {
        for (const file of commit.files) {
          items.push(file);
          if (file.expanded) {
            for (const hunk of file.hunks) {
              items.push(hunk);
            }
          }
        }
      }
    }

    return items;
  }, [commits]);

  const viewportItems = useMemo(() => {
    if (!wrapperRef.current) return [];
    const cursorIndex = visibleItems.findIndex((item) => {
      if (!currentItemPath) return false;

      const parentShaOfCurrentItem = findParentCommitSha(item, visibleItems);

      if (isGitCommit(item)) {
        return item.sha === currentItemPath;
      }

      if (!currentItemPath.includes(":")) return false;
      const [pathCommitSha, pathRest] = currentItemPath.split(":", 2);

      if (parentShaOfCurrentItem !== pathCommitSha) return false;

      if (!("hunkIndex" in item) && "path" in item) {
        const fileItem = item as GitCommitFile;
        return fileItem.path === pathRest;
      }

      if ("hunkIndex" in item && "filePath" in item) {
        const hunkItem = item as GitCommitHunk;
        if (!pathRest.includes("#")) return false;
        const [hunkFilePath, hunkIndexStr] = pathRest.split("#", 2);
        const hunkIndex = Number.parseInt(hunkIndexStr);

        return hunkItem.filePath === hunkFilePath && hunkItem.hunkIndex === hunkIndex;
      }

      return false;
    });
    const validCursorIndex = cursorIndex >= 0 ? cursorIndex : 0;
    const scrollTop = getScrollTop(height, visibleItems.length, validCursorIndex);
    return visibleItems.slice(scrollTop, scrollTop + height);
  }, [visibleItems, currentItemPath, height]);

  return (
    <Box
      ref={wrapperRef}
      borderColor={theme.border}
      borderStyle="round"
      borderTop={false}
      flexDirection="column"
      flexGrow={1}
      width="100%"
    >
      <Box width="100%" flexDirection="column" flexShrink={0}>
        {viewportItems.map((item) => {
          let itemPath = "";
          const parentSha = findParentCommitSha(item, visibleItems);

          if (isGitCommit(item)) {
            itemPath = item.sha;
          } else if (!("hunkIndex" in item) && "path" in item) {
            const fileItem = item as GitCommitFile;
            if (parentSha) {
              itemPath = `${parentSha}:${fileItem.path}`;
            }
          } else if ("hunkIndex" in item && "filePath" in item) {
            const hunkItem = item as GitCommitHunk;
            if (parentSha) {
              itemPath = `${parentSha}:${hunkItem.filePath}#${hunkItem.hunkIndex}`;
            }
          } else {
            return null;
          }

          const isCursor = Boolean(currentItemPath) && Boolean(itemPath) && itemPath === currentItemPath;

          if (isGitCommit(item)) {
            return <GitTreeCommitLine key={`commit-${item.sha}`} commit={item} isCursor={isCursor} />;
          } else if (!("hunkIndex" in item) && "path" in item) {
            const file = item as GitCommitFile;
            return <GitTreeFileLine key={`file-${parentSha}-${file.path}`} file={file} isCursor={isCursor} />;
          } else if ("hunkIndex" in item && "filePath" in item) {
            const hunk = item as GitCommitHunk;
            return (
              <GitTreeHunkLine
                key={`hunk-${parentSha}-${hunk.filePath}-${hunk.hunkIndex}`}
                hunk={hunk}
                isCursor={isCursor}
              />
            );
          }
          return null;
        })}
      </Box>
    </Box>
  );
};
