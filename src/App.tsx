import { useCallback, useState } from "react";
import { useApp } from "ink";
import { nanoid } from "nanoid";
import { Screen } from "./components/Screen.js";
import { FileMode } from "./modes/file-mode/FileMode.js";
import { GitMode } from "./modes/git-mode.js";

export const App = () => {
  const app = useApp();
  const [mode, setMode] = useState<"file" | "git">("file");
  const [notifications, setNotifications] = useState<{ id: string; message: string }[]>([]);

  const handleToggleMode = () => {
    setMode((prevMode) => (prevMode === "file" ? "git" : "file"));
  };

  const handleAddNotification = useCallback((message: string) => {
    const newNotification = { id: nanoid(), message };
    setNotifications((prev) => [...prev, newNotification]);
  }, []);

  const handleExit = () => {
    app.exit();
    // eslint-disable-next-line node/no-process-exit
    process.exit(0);
  };

  return (
    <Screen>
      {mode === "file" ? (
        <FileMode
          notifications={notifications}
          onAddNotification={handleAddNotification}
          onExit={handleExit}
          onToggleMode={handleToggleMode}
        />
      ) : (
        <GitMode
          notifications={notifications}
          addNotification={handleAddNotification}
          onExit={handleExit}
          onToggleMode={handleToggleMode}
        />
      )}
    </Screen>
  );
};
