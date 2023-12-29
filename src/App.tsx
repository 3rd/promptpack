import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import clipboard from "copy-paste";
import { Screen } from "./components/Screen.js";
import { Stats } from "./components/Stats.js";
import { getTree, isTreeDirectory, watch } from "./utils/fs.js";
import { Tree } from "./components/Tree.js";
import { useAppReducer } from "./state.js";
import { buildPrompt } from "./prompt.js";
import { tokenize } from "./utils/tokenizer.js";
import { Header } from "./components/Header.js";

const cwd = process.cwd();
const initialRoot = getTree(cwd);

const MAX_LOG_LENGTH = 6;

export const App = () => {
  const app = useApp();
  const [state, dispatch] = useAppReducer(initialRoot);
  const [notifications, setNotifications] = useState<string[]>([]);

  const addNotification = (notification: string) => {
    const prefix = `${new Date().toLocaleTimeString("ja-JP")} `;
    setNotifications((prevNotifications) => [...prevNotifications, prefix + notification]);
  };

  useInput((input, key) => {
    if (input === "q") app.exit();
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
  }, []);

  const stats = useMemo(() => {
    const prompt = buildPrompt(state.selectedFiles);
    const tokens = tokenize(prompt);

    return {
      files: state.selectedFiles,
      tokens: tokens.length,
    };
  }, [state.selectedFiles]);

  return (
    <Screen>
      <Header>
        <Box flexDirection="column" flexGrow={0}>
          {notifications.slice(-MAX_LOG_LENGTH).map((notification, index) => (
            <Text color="gray" key={index}>
              <Text>{notification}</Text>
            </Text>
          ))}
        </Box>
      </Header>
      <Stats fileCount={stats.files.length} tokenCount={stats.tokens} />
      <Box flexGrow={1}>
        <Tree items={state.visibleItems} cursorItemPath={state.cursorItemPath} />
      </Box>
    </Screen>
  );
};
