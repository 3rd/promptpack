import { useCallback, useEffect, useState } from "react";
import clipboardy from "clipboardy";
import { Box, useInput } from "ink";
import { GitTree } from "../components/GitTree.js";
import { Header } from "../components/Header.js";
import { HunkPreview } from "../components/HunkPreview.js";
import { Stats } from "../components/Stats.js";
import { theme, UNCOMMITTED_SHA } from "../config.js";
import { buildGitPrompt } from "../prompts.js";
import { getGitTree, GitCommit, GitCommitFile, GitCommitHunk, isGitCommit } from "../utils/git.js";

const LOAD_MORE_PAGE_SIZE = 20;
const LOAD_MORE_OFFSET = LOAD_MORE_PAGE_SIZE / 2;

const findParentShaInFlatList = (
  itemIndex: number, // index of the file or hunk in the flat list
  flatItemList: readonly (GitCommit | GitCommitFile | GitCommitHunk)[]
): string => {
  if (itemIndex < 0 || itemIndex >= flatItemList.length) return "";
  for (let i = itemIndex - 1; i >= 0; i--) {
    const prevItem = flatItemList[i];
    if (isGitCommit(prevItem)) {
      return prevItem.sha;
    }
  }
  return "";
};

const getGitItemCanonicalPath = (
  item: GitCommit | GitCommitFile | GitCommitHunk,
  itemIndexInFlatList: number, // needed to find parent for files/hunks
  flatItemList: readonly (GitCommit | GitCommitFile | GitCommitHunk)[]
): string => {
  // GitCommit
  if (isGitCommit(item)) return item.sha;

  const parentSha = findParentShaInFlatList(itemIndexInFlatList, flatItemList);
  if (!parentSha) return "";

  // GitCommitFile
  if ("path" in item && !("hunkIndex" in item) && typeof (item as GitCommitFile).path === "string") {
    return `${parentSha}:${(item as GitCommitFile).path}`;
  }

  // GitCommitHunk
  if (typeof (item as GitCommitHunk).filePath === "string" && typeof (item as GitCommitHunk).hunkIndex === "number") {
    const hunk = item as GitCommitHunk;
    return `${parentSha}:${hunk.filePath}#${hunk.hunkIndex}`;
  }
  return "";
};

const findGitItemByPath = (
  path: string,
  commits: readonly GitCommit[]
): GitCommit | GitCommitFile | GitCommitHunk | null => {
  if (!path) return null;
  if (path.includes(":")) {
    const parts = path.split(":", 2);
    if (parts.length < 2) return null;
    const commitSha = parts[0];
    const restOfPath = parts[1];
    const commit = commits.find((c) => c.sha === commitSha);
    if (!commit) return null;
    if (restOfPath.includes("#")) {
      // hunk path: commitSha:filePath#hunkIndex
      const hunkParts = restOfPath.split("#", 2);
      if (hunkParts.length < 2) return null;
      const filePath = hunkParts[0];
      const hunkIndexStr = hunkParts[1];
      const hunkIndex = Number.parseInt(hunkIndexStr);
      if (Number.isNaN(hunkIndex)) return null;

      const file = commit.files.find((f) => f.path === filePath);
      if (!file) return null;

      // access hunk by index
      if (hunkIndex >= 0 && hunkIndex < file.hunks.length) {
        return file.hunks[hunkIndex];
      }
      return null;
    }
    // file path: commitSha:filePath
    const filePath = restOfPath;
    return commit.files.find((f) => f.path === filePath) ?? null;
  }
  // commit path: commitSha
  return commits.find((c) => c.sha === path) ?? null;
};

const flattenGitItems = (commitsToFlatten: GitCommit[]): (GitCommit | GitCommitFile | GitCommitHunk)[] => {
  const items: (GitCommit | GitCommitFile | GitCommitHunk)[] = [];
  for (const commit of commitsToFlatten) {
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
};

interface GitModeProps {
  notifications: { id: string; message: string }[];
  addNotification: (message: string) => void;
  onExit: () => void;
  onToggleMode: () => void;
}

export interface GitModeStats {
  hunkCount: number;
  tokenCount: number;
}

export const GitMode = ({ notifications, addNotification, onExit, onToggleMode }: GitModeProps) => {
  const [gitCommits, setGitCommits] = useState<GitCommit[]>([]);
  const [gitCursorItemPath, setGitCursorItemPath] = useState<string>("");
  const [selectedHunks, setSelectedHunks] = useState<GitCommitHunk[]>([]);
  const [gitCurrentItem, setGitCurrentItem] = useState<GitCommit | GitCommitFile | GitCommitHunk | null>(null);
  const [currentGitStats, setCurrentGitStats] = useState<GitModeStats>({ hunkCount: 0, tokenCount: 0 });
  const [loadedCount, setLoadedCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const loadMoreCommits = useCallback(async () => {
    try {
      const commits = await getGitTree(
        LOAD_MORE_PAGE_SIZE,
        (path: string) => selectedHunks.some((h) => h.filePath + h.header === path),
        (path: string): boolean => {
          const commit = gitCommits.find((c) => c.sha === path);
          if (commit) return Boolean(commit.expanded);
          for (const c of gitCommits) {
            const file = c.files.find((f) => f.path === path);
            if (file) return Boolean(file.expanded);
          }
          return false;
        },
        loadedCount,
        loadedCount === 0
      );

      const filtered = loadedCount === 0 ? commits : commits.filter((c) => c.sha !== UNCOMMITTED_SHA);

      if (filtered.length === 0) {
        setHasMore(false);
        return;
      }

      setGitCommits((prev) => [...prev, ...filtered]);
      setLoadedCount((prev) => prev + filtered.length);

      const currentItemExists = commits.some((c) => {
        if (c.sha === gitCursorItemPath) return true;
        return c.files.some((f) => {
          if (f.path === gitCursorItemPath) return true;
          const parentSha = c.sha;
          return f.hunks.some((h) => `${parentSha}:${f.path}#${h.header}` === gitCursorItemPath);
        });
      });

      if (!gitCursorItemPath || !currentItemExists) {
        if (commits.length > 0) {
          const initialItem = commits[0];
          setGitCursorItemPath(initialItem.sha);
          setGitCurrentItem(initialItem);
        } else {
          setGitCursorItemPath("");
          setGitCurrentItem(null);
        }
      } else {
        const refreshedItem = findGitItemByPath(gitCursorItemPath, commits);
        if (refreshedItem) {
          setGitCurrentItem(refreshedItem);
        }
      }
    } catch (error) {
      addNotification(`Failed to load git data: ${String(error)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addNotification, gitCommits, gitCursorItemPath, selectedHunks, loadedCount]);

  useEffect(() => {
    loadMoreCommits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let totalHunkCount = 0;
    let totalTokenCount = 0;
    for (const hunk of selectedHunks) {
      totalHunkCount++;
      totalTokenCount += hunk.tokenCount;
    }
    setCurrentGitStats({ hunkCount: totalHunkCount, tokenCount: totalTokenCount });
  }, [selectedHunks, gitCommits]);

  const toggleCommitExpanded = (currentCommits: GitCommit[], sha: string): GitCommit[] => {
    return currentCommits.map((commit) => (commit.sha === sha ? { ...commit, expanded: !commit.expanded } : commit));
  };

  const toggleFileExpanded = (currentCommits: GitCommit[], filePath: string, commitSha?: string): GitCommit[] => {
    return currentCommits.map((commit) => {
      if (commitSha && commit.sha !== commitSha) return commit;
      const fileIndex = commit.files.findIndex((file) => file.path === filePath);
      if (fileIndex >= 0) {
        const newFiles = [...commit.files];
        newFiles[fileIndex] = { ...newFiles[fileIndex], expanded: !newFiles[fileIndex].expanded };
        return { ...commit, files: newFiles };
      }
      return commit;
    });
  };

  const updatePartialSelectionStates = (commitsToUpdate: GitCommit[]): GitCommit[] => {
    return commitsToUpdate.map((commit) => {
      let allFilesSelectedInCommit = commit.files.length > 0;
      let anyFileSelectedInCommit = false;
      let anyFilePartiallySelectedInCommit = false;

      const updatedFiles = commit.files.map((file) => {
        const hasSelectedHunks = file.hunks.some((h) => h.selected);
        const allHunksSelected = file.hunks.length > 0 && file.hunks.every((h) => h.selected);

        const updatedFile = {
          ...file,
          selected: allHunksSelected,
          partiallySelected: hasSelectedHunks && !allHunksSelected,
        };

        if (!updatedFile.selected) allFilesSelectedInCommit = false;
        if (updatedFile.selected) anyFileSelectedInCommit = true;
        if (updatedFile.partiallySelected) anyFilePartiallySelectedInCommit = true;

        return updatedFile;
      });

      return {
        ...commit,
        selected: allFilesSelectedInCommit,
        partiallySelected: (anyFileSelectedInCommit || anyFilePartiallySelectedInCommit) && !allFilesSelectedInCommit,
        files: updatedFiles,
      };
    });
  };

  const toggleCommitSelected = (currentCommits: GitCommit[], sha: string): GitCommit[] => {
    const updatedCommits = currentCommits.map((commit) => {
      if (commit.sha === sha) {
        const newSelectedState = !commit.selected;
        const newFiles = commit.files.map((file) => {
          const newHunks = file.hunks.map((hunk) => ({ ...hunk, selected: newSelectedState }));
          return { ...file, selected: newSelectedState, partiallySelected: false, hunks: newHunks };
        });
        return { ...commit, selected: newSelectedState, partiallySelected: false, files: newFiles };
      }
      return commit;
    });
    return updatePartialSelectionStates(updatedCommits);
  };

  const toggleFileSelected = (currentCommits: GitCommit[], filePath: string, commitSha: string): GitCommit[] => {
    const updatedCommits = currentCommits.map((commit) => {
      if (commit.sha === commitSha) {
        const fileIndex = commit.files.findIndex((f) => f.path === filePath);
        if (fileIndex > -1) {
          const file = commit.files[fileIndex];
          const newSelectedState = !file.selected; // Toggle based on current file selected state
          const newHunks = file.hunks.map((hunk) => ({ ...hunk, selected: newSelectedState }));
          const newFiles = [...commit.files];
          newFiles[fileIndex] = { ...file, selected: newSelectedState, partiallySelected: false, hunks: newHunks };
          return { ...commit, files: newFiles };
        }
      }
      return commit;
    });
    return updatePartialSelectionStates(updatedCommits);
  };

  // sync selectedHunks when gitCommits changes
  useEffect(() => {
    const newSelectedHunksList = gitCommits.flatMap((commit) =>
      commit.files.flatMap((file) => file.hunks.filter((hunk) => hunk.selected))
    );
    setSelectedHunks(newSelectedHunksList);
  }, [gitCommits]);

  useInput((input, key) => {
    const items = flattenGitItems(gitCommits);
    const currentIndex = items.findIndex((item, idx) => {
      if (!gitCursorItemPath) return false;
      const canonicalPathForCurrentItemInLoop = getGitItemCanonicalPath(item, idx, items);
      return canonicalPathForCurrentItemInLoop === gitCursorItemPath && canonicalPathForCurrentItemInLoop !== "";
    });

    if (input === "j" || key.downArrow) {
      let targetIndex = currentIndex + 1;
      if (currentIndex === -1 && items.length > 0) targetIndex = 0;
      if (targetIndex >= 0 && targetIndex < items.length) {
        const nextItem = items[targetIndex];
        const nextPath = getGitItemCanonicalPath(nextItem, targetIndex, items);
        if (nextPath) {
          setGitCursorItemPath(nextPath);
          setGitCurrentItem(nextItem);
        }
      } else if (targetIndex >= items.length - LOAD_MORE_OFFSET && hasMore) {
        loadMoreCommits();
      }
      return;
    }

    if (input === "k" || key.upArrow) {
      const targetIndex = currentIndex - 1;
      if (targetIndex >= 0) {
        const prevItem = items[targetIndex];
        const prevPath = getGitItemCanonicalPath(prevItem, targetIndex, items);
        if (prevPath) {
          setGitCursorItemPath(prevPath);
          setGitCurrentItem(prevItem);
        }
      }
      return;
    }

    if (key.return || key.tab || input === "l" || key.rightArrow) {
      const currentItem = findGitItemByPath(gitCursorItemPath, gitCommits);
      if (currentItem) {
        if (isGitCommit(currentItem)) {
          setGitCommits(toggleCommitExpanded(gitCommits, currentItem.sha));
        } else if ("path" in currentItem && currentItem.path !== undefined) {
          const fileItem = currentItem as GitCommitFile;
          const pathParts = gitCursorItemPath.split(":", 2);
          if (pathParts.length === 2) {
            const parentSha = pathParts[0];
            setGitCommits(toggleFileExpanded(gitCommits, fileItem.path, parentSha));
          }
        }
      }
      return;
    }

    if (input === "h" || key.leftArrow) {
      const currentFlatItems = flattenGitItems(gitCommits);
      const currentItemIndex = currentFlatItems.findIndex((item, idx) => {
        const p = getGitItemCanonicalPath(item, idx, currentFlatItems);
        return p === gitCursorItemPath && p !== "";
      });
      if (currentItemIndex === -1) return;
      const currentItem = currentFlatItems[currentItemIndex];

      if (currentItem) {
        // hunk
        if ("header" in currentItem && "filePath" in currentItem) {
          const hunkItem = currentItem as GitCommitHunk;
          const parentShaOfHunk = findParentShaInFlatList(currentItemIndex, currentFlatItems);
          const parentFileIndex = currentFlatItems.findIndex((it, idx) => {
            if (!("path" in it) || "header" in it) return false;
            const fileIt = it as GitCommitFile;
            const parentShaOfFileIt = findParentShaInFlatList(idx, currentFlatItems);
            return fileIt.path === hunkItem.filePath && parentShaOfFileIt === parentShaOfHunk;
          });
          if (parentFileIndex !== -1) {
            const parentFile = currentFlatItems[parentFileIndex] as GitCommitFile;
            const canonicalParentFilePath = getGitItemCanonicalPath(parentFile, parentFileIndex, currentFlatItems);
            if (canonicalParentFilePath) {
              setGitCursorItemPath(canonicalParentFilePath);
              setGitCurrentItem(parentFile);
            }
          }
        } else if ("path" in currentItem) {
          // file
          const fileItem = currentItem as GitCommitFile;
          const parentShaOfFile = findParentShaInFlatList(currentItemIndex, currentFlatItems);
          if (fileItem.expanded && parentShaOfFile) {
            setGitCommits(toggleFileExpanded(gitCommits, fileItem.path, parentShaOfFile));
          } else if (parentShaOfFile) {
            const parentCommit = gitCommits.find((c) => c.sha === parentShaOfFile);
            if (parentCommit) {
              setGitCursorItemPath(parentCommit.sha);
              setGitCurrentItem(parentCommit);
            }
          }
        } else if (isGitCommit(currentItem) && currentItem.expanded) {
          // commit
          setGitCommits(toggleCommitExpanded(gitCommits, currentItem.sha));
        }
      }
      return;
    }

    if (input === " ") {
      const itemAtCursor = findGitItemByPath(gitCursorItemPath, gitCommits);
      if (!itemAtCursor) return;

      let finalUpdatedCommits: GitCommit[];

      // commit
      if (isGitCommit(itemAtCursor)) {
        finalUpdatedCommits = toggleCommitSelected(gitCommits, itemAtCursor.sha);
      } else if ("path" in itemAtCursor && "hunks" in itemAtCursor && !("hunkIndex" in itemAtCursor)) {
        // file
        const fileItem = itemAtCursor as GitCommitFile;
        const [commitShaForFile] = gitCursorItemPath.split(":", 1); // commitSha:filePath
        finalUpdatedCommits = toggleFileSelected(gitCommits, fileItem.path, commitShaForFile!);
      } else if ("filePath" in itemAtCursor && typeof (itemAtCursor as GitCommitHunk).hunkIndex === "number") {
        // hunk
        const hunkItemToToggle = itemAtCursor as GitCommitHunk;
        const newSelectedState = !hunkItemToToggle.selected;

        const [commitShaOfTargetCommit, fileAndHunkPath] = gitCursorItemPath.split(":", 2);
        const [filePathOfTargetHunk, hunkIndexStr] = fileAndHunkPath!.split("#", 2);
        const targetHunkIndex = Number.parseInt(hunkIndexStr);

        if (Number.isNaN(targetHunkIndex)) return;

        const tempCommits = gitCommits.map((commit) => {
          if (commit.sha === commitShaOfTargetCommit) {
            return {
              ...commit,
              files: commit.files.map((file) => {
                if (file.path === filePathOfTargetHunk) {
                  const updatedHunksInFile = file.hunks.map((h, currentHunkIdx) => {
                    if (currentHunkIdx === targetHunkIndex) {
                      return { ...h, selected: newSelectedState };
                    }
                    return h;
                  });
                  return { ...file, hunks: updatedHunksInFile };
                }
                return file;
              }),
            };
          }
          return commit;
        });
        finalUpdatedCommits = updatePartialSelectionStates(tempCommits);
      } else {
        return; // unknown
      }

      setGitCommits(finalUpdatedCommits);
      const refreshedItem = findGitItemByPath(gitCursorItemPath, finalUpdatedCommits);
      if (refreshedItem) {
        setGitCurrentItem(refreshedItem);
      }
      return;
    }

    if (input === "y") {
      if (selectedHunks.length === 0) {
        addNotification("No hunks selected!");
        return;
      }
      const prompt = buildGitPrompt(selectedHunks);
      clipboardy.writeSync(prompt);
      addNotification(`Copied ${selectedHunks.length} hunks to clipboard!`);
      return;
    }

    if (input === "q") {
      onExit();
    }

    if (input === "g") {
      onToggleMode();
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1} width="100%">
      <Header mode="git" notifications={notifications} />
      <Stats fileCount={0} hunkCount={currentGitStats.hunkCount} tokenCount={currentGitStats.tokenCount} />
      <Box flexDirection="row" flexGrow={1} width="100%">
        <Box width="50%" flexDirection="column" flexShrink={0} overflow="hidden">
          <GitTree commits={gitCommits} currentItemPath={gitCursorItemPath} />
        </Box>
        <Box width="50%" flexDirection="column" flexGrow={1} borderLeft={true} borderColor={theme.border}>
          <HunkPreview currentItem={gitCurrentItem} />
        </Box>
      </Box>
    </Box>
  );
};
