import { useEffect, useMemo, useRef, useState } from "react";
import clipboardy from "clipboardy";
import Fuse from "fuse.js";
import { Box, useInput } from "ink";
import { relative } from "node:path";
import { Header } from "../../components/Header.js";
import { Screen } from "../../components/Screen.js";
import { Stats } from "../../components/Stats.js";
import { useScreenSize } from "../../hooks/useScreenSize.js";
import { buildFilePrompt } from "../../prompts.js";
import { FileTreeDirectoryItem, getFileTree, isFileTreeDirectoryItem, watch } from "../../utils/fs.js";
import { tokenize } from "../../utils/tokenizer.js";
import { FileModeSearchOverlay } from "./components/FileModeSearchOverlay.js";
import { FileModeTree } from "./components/FileModeTree.js";
import { expandToFile, useFileModeReducer } from "./file-mode-state.js";

const cwd = process.cwd();
const initialRoot = getFileTree(cwd);

const gatherAllFilesFromRoot = (root: ReturnType<typeof getFileTree>) => {
  const result: { path: string; name: string; isDirectory: boolean; tokenCount: number; relativePath: string }[] = [];
  function traverse(currentRoot: FileTreeDirectoryItem) {
    if (currentRoot.path !== cwd) {
      result.push({
        path: currentRoot.path,
        relativePath: relative(cwd, currentRoot.path),
        name: currentRoot.name,
        isDirectory: true,
        tokenCount: currentRoot.tokenCount,
      });
    }
    for (const dir of currentRoot.directories) {
      traverse(dir);
    }
    for (const file of currentRoot.files) {
      result.push({
        path: file.path,
        relativePath: relative(cwd, file.path),
        name: file.name,
        isDirectory: false,
        tokenCount: file.tokenCount,
      });
    }
  }
  traverse(root);
  return result;
};

type Notification = { id: string; message: string };

export interface FileModeStats {
  fileCount: number;
  tokenCount: number;
}

export interface FileModeProps {
  notifications: Notification[];
  onAddNotification: (message: string) => void;
  onExit: () => void;
  onToggleMode: () => void;
}

export const FileMode = ({ notifications, onAddNotification, onExit, onToggleMode }: FileModeProps) => {
  const [state, dispatch] = useFileModeReducer(initialRoot);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { path: string; name: string; isDirectory: boolean; tokenCount: number }[]
  >([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const prevSelectedFilesRef = useRef<string[]>(state.selectedFiles.map((f) => f.path));

  const allFilesRef = useRef<
    {
      path: string;
      name: string;
      isDirectory: boolean;
      tokenCount: number;
    }[]
  >([]);
  const fuseRef = useRef<Fuse<{ path: string; name: string; isDirectory: boolean; tokenCount: number }>>();
  const rootRef = useRef(state.root);

  const toggleFileSelection = (filePath: string) => {
    dispatch({ type: "select-file", payload: filePath });
  };

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const getIsSelected = (path: string): boolean => {
      const item = stateRef.current.visibleItems.find((curr) => curr.path === path);
      return item?.selected ?? false;
    };
    const getIsExpanded = (path: string): boolean => {
      const item = stateRef.current.visibleItems.find((curr) => curr.path === path);
      if (!item) return false;
      return isFileTreeDirectoryItem(item) ? item.expanded : false;
    };
    const watcher = watch(cwd, () => {
      const root = getFileTree(cwd, {
        level: 0,
        getIsSelected,
        getIsExpanded,
        rootPath: cwd,
      });
      dispatch({ type: "update-root", payload: root });
      onAddNotification("Processed file system changes.");
    });

    return () => {
      watcher.close();
    };
  }, [dispatch, onAddNotification]);

  const stats = useMemo(() => {
    const prompt = buildFilePrompt(state.selectedFiles);
    const tokens = tokenize(prompt);
    return {
      files: state.selectedFiles,
      tokens: tokens.length,
    };
  }, [state.selectedFiles]);

  useEffect(() => {
    if (isSearchMode) {
      rootRef.current = state.root;
      const files = gatherAllFilesFromRoot(rootRef.current);
      allFilesRef.current = files;
      fuseRef.current = new Fuse(files, {
        keys: ["relativePath"],
        threshold: 0.5,
        includeScore: true,
        ignoreLocation: true,
        findAllMatches: true,
        minMatchCharLength: 1,
        shouldSort: true,
        ignoreFieldNorm: true,
      });
      setSearchQuery("");
      setSearchResults(files);
      setSearchIndex(0);
    } else {
      allFilesRef.current = [];
      fuseRef.current = undefined;
      setSearchResults([]);
      setSearchIndex(0);
      setSearchQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearchMode]);

  useEffect(() => {
    if (!isSearchMode || !fuseRef.current) return;
    setSearchIndex(0);
    if (searchQuery.trim() === "") {
      setSearchResults(allFilesRef.current);
    } else {
      const rawResults = fuseRef.current.search(searchQuery).map((r) => r.item);
      setSearchResults(rawResults);
      setSearchIndex((prev) => Math.min(rawResults.length - 1, prev));
    }
  }, [isSearchMode, searchQuery]);

  useEffect(() => {
    if (isSearchMode) {
      // entering search mode
      prevSelectedFilesRef.current = state.selectedFiles.map((f) => f.path);
    } else {
      // exiting search mode
      const oldSet = new Set(prevSelectedFilesRef.current);
      const newSet = new Set(state.selectedFiles.map((f) => f.path));
      const newlySelected = [...newSet].filter((p) => !oldSet.has(p));

      if (newlySelected.length > 0) {
        let updatedRoot = state.root;
        for (const fp of newlySelected) {
          updatedRoot = expandToFile(updatedRoot, fp);
        }
        dispatch({ type: "update-root", payload: updatedRoot });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearchMode]);

  useInput((input, key) => {
    if (input === "q") {
      onExit();
      return;
    }

    if (input === "g" && !isSearchMode) {
      onToggleMode();
      return;
    }

    if (isSearchMode) {
      if (key.escape) {
        setIsSearchMode(false);
        return;
      }

      if (key.return) {
        if (searchResults.length > 0 && searchIndex < searchResults.length) {
          toggleFileSelection(searchResults[searchIndex].path);
        }
        setIsSearchMode(false);
        return;
      }

      if (key.backspace || key.delete) {
        setSearchQuery((q) => q.slice(0, -1));
        return;
      }

      const navigateDown = () => {
        if (searchResults.length > 0) {
          setSearchIndex((prev) => Math.min(searchResults.length - 1, prev + 1));
        }
      };
      const navigateUp = () => {
        if (searchResults.length > 0) {
          setSearchIndex((prev) => Math.max(0, prev - 1));
        }
      };

      if (key.ctrl && input === "j") {
        navigateDown();
        return;
      }
      if (key.ctrl && input === "k") {
        navigateUp();
        return;
      }

      if (key.downArrow) {
        navigateDown();
        return;
      }
      if (key.upArrow) {
        navigateUp();
        return;
      }

      if (key.tab && !key.shift) {
        navigateDown();
        return;
      }
      if (key.tab && key.shift) {
        navigateUp();
        return;
      }

      if (input === " ") {
        if (searchResults.length > 0 && searchIndex < searchResults.length) {
          toggleFileSelection(searchResults[searchIndex].path);
        }
        return;
      }

      if (!key.ctrl && (input === "j" || input === "k")) {
        setSearchQuery((q) => q + input);
        return;
      }

      if (
        !key.ctrl &&
        !key.meta &&
        input.length === 1 &&
        input !== "\t" &&
        input !== " " &&
        input !== "j" &&
        input !== "k"
      ) {
        setSearchQuery((q) => q + input);
      }

      return;
    }

    if (input === "f") {
      setIsSearchMode(true);
      return;
    }
    if (input === "j" || key.downArrow) dispatch({ type: "nav:down" });
    if (input === "k" || key.upArrow) dispatch({ type: "nav:up" });
    if (key.return || key.tab) dispatch({ type: "nav:tab" });
    if (input === " ") dispatch({ type: "select" });

    if (input === "y") {
      const files = state.selectedFiles;
      if (files.length === 0) return onAddNotification("No files selected!");
      const prompt = buildFilePrompt(state.selectedFiles);
      clipboardy.writeSync(prompt);
      onAddNotification("Copied to clipboard!");
    }
  });

  const { width, height } = useScreenSize();
  const visibleItemCount = Math.max(0, Math.floor(height * 0.8) - 4);

  return (
    <Screen>
      {/* file tree */}
      {!isSearchMode && (
        <>
          <Header mode="file" notifications={notifications} />
          <Stats fileCount={stats.files.length} tokenCount={stats.tokens} />
          <Box flexDirection="row" flexGrow={1}>
            <FileModeTree cursorItemPath={state.cursorItemPath} items={state.visibleItems} />
          </Box>
        </>
      )}

      {/* search */}
      {isSearchMode && (
        <FileModeSearchOverlay
          height={height}
          width={width}
          searchQuery={searchQuery}
          searchResults={searchResults}
          visibleCount={visibleItemCount}
          state={state}
          searchIndex={searchIndex}
        />
      )}
    </Screen>
  );
};
