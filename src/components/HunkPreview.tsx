import { useMemo } from "react";
import { Box, Text } from "ink";
import { UNCOMMITTED_SHA } from "../config.js";
import { GitCommit, GitCommitFile, GitCommitHunk, isGitCommit } from "../utils/git.js";

export type HunkPreviewProps = {
  currentItem: GitCommit | GitCommitFile | GitCommitHunk | null;
};

export const HunkPreview = ({ currentItem }: HunkPreviewProps) => {
  const previewContent = useMemo(() => {
    if (!currentItem) return "No item selected for preview.";

    const lines: string[] = [];

    // commit
    if (isGitCommit(currentItem)) {
      const commit = currentItem;
      const title = commit.sha === UNCOMMITTED_SHA ? "Uncommitted Changes" : commit.subject;
      lines.push(title);
      lines.push("=".repeat(title.length));
      lines.push("");

      if (commit.files.length === 0) {
        lines.push("(No changes)");
      } else {
        for (const file of commit.files) {
          lines.push(`File: ${file.path}`);
          for (const hunk of file.hunks) {
            lines.push(`  Hunk #${hunk.hunkIndex} (Header: ${hunk.header.trim()})`);
            lines.push(...hunk.content.split("\n").map((line) => `    ${line}`), "");
          }
          lines.push("");
        }
      }
    } else if ("hunks" in currentItem && "path" in currentItem && !("hunkIndex" in currentItem)) {
      // file
      const file = currentItem as GitCommitFile;
      const title = `File: ${file.path}`;
      lines.push(title);
      lines.push("-".repeat(title.length));
      lines.push("");

      if (file.hunks.length === 0) {
        lines.push("(No hunks in this file)");
      } else {
        for (const hunk of file.hunks) {
          lines.push(`Hunk #${hunk.hunkIndex} (Header: ${hunk.header.trim()})`);
          lines.push(...hunk.content.split("\n").map((line) => `  ${line}`), "");
        }
      }
    } else if ("hunkIndex" in currentItem && "filePath" in currentItem) {
      // hunk
      const hunk = currentItem as GitCommitHunk;
      const title = `Hunk #${hunk.hunkIndex} from ${hunk.filePath} (Header: ${hunk.header.trim()})`;
      lines.push(title);
      lines.push("-".repeat(title.length));
      lines.push("");
      lines.push(...hunk.content.split("\n"));
    } else {
      return "Unsupported item type for preview.";
    }

    return lines.join("\n");
  }, [currentItem]);

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
      <Text>{previewContent}</Text>
    </Box>
  );
};
