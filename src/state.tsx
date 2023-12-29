import { useReducer } from "react";
import { TreeDirectory, TreeFile, isTreeDirectory } from "./utils/fs.js";

type AppState = {
  root: TreeDirectory;
  cursorItemPath: string;
};

type DerivedAppState = AppState & {
  visibleItems: (TreeDirectory | TreeFile)[];
  selectedFiles: TreeFile[];
};

type AppAction =
  | { type: "nav:down" }
  | { type: "nav:tab" }
  | { type: "nav:up" }
  | { type: "select" }
  | { type: "update-root"; payload: TreeDirectory };

const getVisibleItems = (root: TreeDirectory): (TreeDirectory | TreeFile)[] => {
  let flattenedItems: (TreeDirectory | TreeFile)[] = [];

  const flattenDirectory = (directory: TreeDirectory) => {
    flattenedItems.push(directory);

    if (directory.level === 0 || directory.expanded) {
      for (const subDirectory of directory.directories) {
        flattenDirectory(subDirectory);
      }
      flattenedItems = flattenedItems.concat(directory.files);
    }
  };

  flattenDirectory(root);

  return flattenedItems.slice(1);
};

function getSelectedFiles(root: TreeDirectory): TreeFile[] {
  const selectedFiles: TreeFile[] = [];

  function traverse(directory: TreeDirectory) {
    for (const file of directory.files) {
      if (file.selected) selectedFiles.push(file);
    }
    for (const subDirectory of directory.directories) {
      traverse(subDirectory);
    }
  }

  traverse(root);
  return selectedFiles;
}

const toggleDirectoryExpanded = (directory: TreeDirectory, path: string): TreeDirectory => {
  if (directory.path === path) return { ...directory, expanded: !directory.expanded };

  return {
    ...directory,
    directories: directory.directories.map((subDir) => toggleDirectoryExpanded(subDir, path)),
  };
};

const toggleAllSelected = (directory: TreeDirectory, selected: boolean): TreeDirectory => {
  return {
    ...directory,
    selected,
    directories: directory.directories.map((subDir) => toggleAllSelected(subDir, selected)),
    files: directory.files.map((file) => ({ ...file, selected })),
  };
};

const toggleItemSelected = (node: TreeDirectory | TreeFile, path: string): TreeDirectory | TreeFile => {
  if (isTreeDirectory(node)) {
    const newNode = { ...node };
    if (node.path === path) {
      // Toggle the selected state of the current node
      newNode.selected = !node.selected;

      // If it's a directory, recursively update all children
      newNode.directories = node.directories.map(
        (subDir) => toggleAllSelected(subDir, newNode.selected) as TreeDirectory
      );
      newNode.files = node.files.map((file) => ({ ...file, selected: newNode.selected }));
    } else {
      // Update directories and files within this directory
      newNode.directories = node.directories.map((subDir) => toggleItemSelected(subDir, path) as TreeDirectory);
      newNode.files = node.files.map((file) => (file.path === path ? { ...file, selected: !file.selected } : file));

      // Update the directory's selected state based on its children
      newNode.selected =
        newNode.directories.every((subDir) => subDir.selected) && newNode.files.every((file) => file.selected);
    }
    if (node.path === path) newNode.selected = !node.selected;
    return newNode;
  }
  const newNode = { ...node };
  if (node.path === path) newNode.selected = !node.selected;
  return newNode;
};

const appStateReducer = (state: DerivedAppState, action: AppAction): DerivedAppState => {
  const nextState = { ...state };
  const { cursorItemPath, root, visibleItems } = state;

  switch (action.type) {
    case "nav:down":
    case "nav:up": {
      const currentIndex = visibleItems.findIndex((item) => item.path === cursorItemPath);
      const nextIndex = currentIndex + (action.type === "nav:down" ? 1 : -1);
      if (nextIndex >= 0 && nextIndex < visibleItems.length) {
        nextState.cursorItemPath = visibleItems[nextIndex].path;
        return nextState;
      }
      return state;
    }
    case "nav:tab": {
      const currentItem = visibleItems.find((item) => item.path === cursorItemPath);
      if (currentItem?.type === "directory") {
        nextState.root = toggleDirectoryExpanded(root, currentItem.path);
        nextState.visibleItems = getVisibleItems(nextState.root);
        return nextState;
      }
      return state;
    }
    case "select": {
      nextState.root = toggleItemSelected(root, cursorItemPath) as TreeDirectory;
      nextState.selectedFiles = getSelectedFiles(nextState.root);
      nextState.visibleItems = getVisibleItems(nextState.root);
      return nextState;
    }
    case "update-root": {
      nextState.root = action.payload;
      nextState.visibleItems = getVisibleItems(nextState.root);
      nextState.selectedFiles = getSelectedFiles(nextState.root);
      nextState.cursorItemPath = nextState.root.directories.length > 0 ? nextState.root.directories[0].path : "";
      return nextState;
    }
    default: {
      break;
    }
  }

  return state;
};

const bootstrapState = (root: TreeDirectory) => {
  return {
    root,
    cursorItemPath: root.directories.length > 0 ? root.directories[0].path : root.files[0].path ?? root.path,
    visibleItems: getVisibleItems(root),
    selectedFiles: getSelectedFiles(root),
  };
};

export const useAppReducer = (root: TreeDirectory) => useReducer(appStateReducer, bootstrapState(root));
