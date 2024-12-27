import { memo, useEffect, useMemo, useRef, useState } from "react";
import clipboard from "copy-paste";
import Fuse from "fuse.js";
import { Box, Text, useApp, useInput } from "ink";
import { nanoid } from "nanoid";
import { relative } from "node:path";
import { Header } from "./components/Header.js";
import { Screen } from "./components/Screen.js";
import { Stats } from "./components/Stats.js";
import { Tree } from "./components/Tree.js";
import { theme } from "./config.js";
import { useScreenSize } from "./hooks/useScreenSize.js";
import { buildPrompt } from "./prompt.js";
import { expandToFile, useAppReducer } from "./state.js";
import { getTree, isTreeDirectory, TreeDirectory, TreeFile, watch } from "./utils/fs.js";
import { tokenize } from "./utils/tokenizer.js";

const cwd = process.cwd();
const initialRoot = getTree(cwd);

const gatherAllFilesFromRoot = (root: ReturnType<typeof getTree>) => {
  const result: { path: string; name: string; isDirectory: boolean; tokenCount: number; relativePath: string }[] = [];
  function traverse(dir: TreeDirectory) {
    if (dir.path !== cwd) {
      result.push({
        path: dir.path,
        relativePath: relative(cwd, dir.path),
        name: dir.name,
        isDirectory: true,
        tokenCount: dir.tokenCount,
      });
    }
    for (const d of dir.directories) traverse(d);
    for (const f of dir.files) {
      result.push({
        path: f.path,
        relativePath: relative(cwd, f.path),
        name: f.name,
        isDirectory: false,
        tokenCount: f.tokenCount,
      });
    }
  }
  traverse(root);
  return result;
};

const MAX_LOG_LENGTH = 6;

const SearchResult = memo(
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
    root: TreeDirectory;
  }) => {
    const findInTree = (dir: TreeDirectory, path: string): TreeDirectory | TreeFile | undefined => {
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
    if (item && isTreeDirectory(item)) {
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

export const App = () => {
  const { width, height } = useScreenSize();
  const app = useApp();
  const [state, dispatch] = useAppReducer(initialRoot);
  const [notifications, setNotifications] = useState<{ id: string; message: string }[]>([]);
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

  const addNotification = (notification: string) => {
    const prefix = `${new Date().toLocaleTimeString("ja-JP")} `;
    setNotifications((prevNotifications) => [
      ...prevNotifications,
      {
        id: nanoid(),
        message: prefix + notification,
      },
    ]);
  };

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
      return isTreeDirectory(item) ? item.expanded : false;
    };
    const watcher = watch(cwd, () => {
      const root = getTree(cwd, {
        level: 0,
        getIsSelected,
        getIsExpanded,
        rootPath: cwd,
      });
      dispatch({ type: "update-root", payload: root });
      addNotification("Processed file system changes.");
    });

    return () => {
      watcher.close();
    };
  }, [dispatch]);

  const stats = useMemo(() => {
    const prompt = buildPrompt(state.selectedFiles);
    const sanitizedPrompt = prompt
      .replaceAll("<|im_start|>", "")
      .replaceAll("<|im_end|>", "")
      .replaceAll("<|im_sep|>", "");
    const tokens = tokenize(sanitizedPrompt);
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

  // eslint-disable-next-line sonarjs/cognitive-complexity
  useInput((input, key) => {
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

    if (input === "q") {
      app.exit();
      process.exit(0);
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
      if (files.length === 0) return addNotification("No files selected!");
      const prompt = buildPrompt(state.selectedFiles);
      clipboard.copy(prompt);
      addNotification("Copied to clipboard!");
    }
  });

  const renderMainContent = (
    <>
      <Header>
        <Box flexDirection="column" flexGrow={0}>
          {notifications.slice(-MAX_LOG_LENGTH).map((notification) => (
            <Text key={notification.id} color="gray">
              <Text>{notification.message}</Text>
            </Text>
          ))}
        </Box>
      </Header>
      <Stats fileCount={stats.files.length} tokenCount={stats.tokens} />
      <Box flexDirection="row" flexGrow={1}>
        <Tree cursorItemPath={state.cursorItemPath} items={state.visibleItems} />
      </Box>
    </>
  );

  const visibleCount = Math.max(0, Math.floor(height * 0.8) - 4);
  const renderSearchOverlay = (
    <Box alignItems="center" flexDirection="column" height={height} justifyContent="center" width={width}>
      <Box
        alignItems="stretch"
        borderColor="cyan"
        borderStyle="round"
        flexDirection="column"
        height={Math.floor(height * 0.8)}
        justifyContent="flex-start"
        width={Math.floor(width * 0.8)}
      >
        <Box borderColor={theme.border} borderStyle="round" paddingX={1} width="100%">
          <Text>Search: {searchQuery}</Text>
        </Box>

        <Box
          alignItems="stretch"
          borderColor={theme.border}
          borderStyle="round"
          flexDirection="column"
          flexGrow={1}
          justifyContent="flex-start"
          paddingX={1}
        >
          {searchResults.slice(0, visibleCount).map((item, i) => {
            const isSelected = state.selectedFiles.some((f) => f.path === item.path);
            const isCurrent = i === searchIndex;
            return (
              <Box key={item.path}>
                <Text backgroundColor={isCurrent ? theme.cursor : undefined}>
                  <SearchResult isSelected={isSelected} result={item} root={state.root} />
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );

  return <Screen>{isSearchMode ? renderSearchOverlay : renderMainContent}</Screen>;
};
