import { Box, Text } from "ink";
import { theme } from "../../../config.js";
import { FileTreeDirectoryItem, FileTreeFileItem } from "../../../utils/fs.js";
import { FileModeSearchResult } from "./FileSearchResult.js";

type FileModeSearchOverlayProps = {
  height: number;
  width: number;
  searchQuery: string;
  searchResults: { path: string; name: string; isDirectory: boolean; tokenCount: number }[];
  visibleCount: number;
  state: { root: FileTreeDirectoryItem; cursorItemPath: string } & {
    visibleItems: (FileTreeDirectoryItem | FileTreeFileItem)[];
    selectedFiles: FileTreeFileItem[];
  };
  searchIndex: number;
};

export const FileModeSearchOverlay = ({
  height,
  width,
  searchQuery,
  searchResults,
  visibleCount,
  state,
  searchIndex,
}: FileModeSearchOverlayProps) => {
  const containerWidth = Math.floor(width * 0.9);
  const containerHeight = Math.floor(height * 0.9);

  return (
    // overlay wrapper
    <Box alignItems="center" flexDirection="column" height={height} justifyContent="center" width={width}>
      {/* search container */}
      <Box
        alignItems="stretch"
        borderColor="cyan"
        borderStyle="round"
        flexDirection="column"
        height={containerHeight}
        justifyContent="flex-start"
        width={containerWidth}
      >
        {/* search box */}
        <Box borderColor={theme.border} borderStyle="round" paddingX={1} width="100%">
          <Text>Search: {searchQuery}</Text>
        </Box>

        {/* search results */}
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
                  <FileModeSearchResult isSelected={isSelected} result={item} root={state.root} />
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};
