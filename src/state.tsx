import { useReducer } from "react";
import { isTreeDirectory, TreeDirectory, TreeFile } from "./utils/fs.js";

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
  | { type: "select-file"; payload: string }
  | { type: "select" }
  | { type: "update-root"; payload: TreeDirectory };

export const getVisibleItems = (root: TreeDirectory): (TreeDirectory | TreeFile)[] => {
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

export const getSelectedFiles = (root: TreeDirectory): TreeFile[] => {
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
};

export const toggleDirectoryExpanded = (directory: TreeDirectory, path: string): TreeDirectory => {
  if (directory.path === path) return { ...directory, expanded: !directory.expanded };
  return {
    ...directory,
    directories: directory.directories.map((subDir) => toggleDirectoryExpanded(subDir, path)),
  };
};

const updateDirectorySelectionState = (directory: TreeDirectory): TreeDirectory => {
  let allSelected = true;
  let anySelected = false;

  const newDirs = directory.directories.map(updateDirectorySelectionState);
  const allDirsSelected = newDirs.length > 0 && newDirs.every((d) => d.selected && !d.partialSelected);
  const anyDirSelected = newDirs.some((d) => d.selected || d.partialSelected);

  const allFilesSelected = directory.files.length > 0 && directory.files.every((f) => f.selected);
  const anyFileSelected = directory.files.some((f) => f.selected);

  if (directory.directories.length === 0 && directory.files.length === 0) {
    allSelected = false;
    anySelected = false;
  } else {
    allSelected =
      (directory.directories.length === 0 || allDirsSelected) && (directory.files.length === 0 || allFilesSelected);
    anySelected = anyDirSelected || anyFileSelected;
  }

  let selected = false;
  let partialSelected = false;
  if (allSelected) {
    selected = true;
    partialSelected = false;
  } else if (anySelected) {
    selected = false;
    partialSelected = true;
  } else {
    selected = false;
    partialSelected = false;
  }

  return {
    ...directory,
    directories: newDirs,
    selected,
    partialSelected,
    files: directory.files,
  };
};

export const toggleAllSelected = (directory: TreeDirectory, selected: boolean): TreeDirectory => {
  const newDir = {
    ...directory,
    selected,
    directories: directory.directories.map((subDir) => toggleAllSelected(subDir, selected)),
    files: directory.files.map((file) => ({ ...file, selected })),
  };
  return updateDirectorySelectionState(newDir);
};

export const toggleItemSelected = (node: TreeDirectory | TreeFile, path: string): TreeDirectory | TreeFile => {
  if (isTreeDirectory(node)) {
    const newNode = { ...node };
    if (node.path === path) {
      const newSelected = !node.selected;
      newNode.directories = newNode.directories.map((subDir) => toggleAllSelected(subDir, newSelected));
      newNode.files = newNode.files.map((file) => ({ ...file, selected: newSelected }));
      newNode.selected = newSelected;
    } else {
      newNode.directories = newNode.directories.map((subDir) => toggleItemSelected(subDir, path) as TreeDirectory);
      newNode.files = newNode.files.map((file) => (file.path === path ? { ...file, selected: !file.selected } : file));
    }
    return updateDirectorySelectionState(newNode);
  }
  const newNode = { ...node };
  if (node.path === path) newNode.selected = !node.selected;
  return newNode;
};

export const expandToFile = (directory: TreeDirectory, filePath: string): TreeDirectory => {
  if (!filePath.startsWith(directory.path)) return directory;

  let changed = false;
  const newDirs = directory.directories.map((d) => {
    const res = expandToFile(d, filePath);
    if (res !== d) changed = true;
    return res;
  });

  const containsFile =
    directory.files.some((f) => f.path === filePath) || newDirs.some((d) => filePath.startsWith(d.path));

  let expanded = directory.expanded;
  if (containsFile && directory.path !== filePath) {
    expanded = true;
    changed = true;
  }

  if (!changed && expanded === directory.expanded) return directory;

  return {
    ...directory,
    directories: newDirs,
    expanded,
  };
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
      nextState.root = updateDirectorySelectionState(nextState.root);
      nextState.selectedFiles = getSelectedFiles(nextState.root);
      nextState.visibleItems = getVisibleItems(nextState.root);
      return nextState;
    }
    case "select-file": {
      nextState.root = toggleItemSelected(root, action.payload) as TreeDirectory;
      nextState.root = updateDirectorySelectionState(nextState.root);
      nextState.selectedFiles = getSelectedFiles(nextState.root);
      nextState.visibleItems = getVisibleItems(nextState.root);
      return nextState;
    }
    case "update-root": {
      const updatedRoot = updateDirectorySelectionState(action.payload);
      nextState.root = updatedRoot;
      nextState.visibleItems = getVisibleItems(nextState.root);
      nextState.selectedFiles = getSelectedFiles(nextState.root);
      nextState.cursorItemPath =
        nextState.root.directories.length > 0
          ? nextState.root.directories[0].path
          : nextState.root.files[0]?.path ?? nextState.root.path;
      return nextState;
    }
    default: {
      return state;
    }
  }
};

const bootstrapState = (root: TreeDirectory) => {
  const updatedRoot = updateDirectorySelectionState(root);
  return {
    root: updatedRoot,
    cursorItemPath:
      updatedRoot.directories.length > 0
        ? updatedRoot.directories[0].path
        : updatedRoot.files[0]?.path ?? updatedRoot.path,
    visibleItems: getVisibleItems(updatedRoot),
    selectedFiles: getSelectedFiles(updatedRoot),
  };
};

export const useAppReducer = (root: TreeDirectory) => useReducer(appStateReducer, bootstrapState(root));
