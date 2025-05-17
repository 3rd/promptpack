import { memo } from "react";
import { Box, Text } from "ink";
import { theme } from "../config.js";

export type StatsProps = {
  tokenCount: number;
  fileCount?: number;
  hunkCount?: number;
};

export const Stats = memo(({ tokenCount, fileCount = 0, hunkCount = 0 }: StatsProps) => {
  return (
    <Box
      flexDirection="row"
      borderStyle="round"
      borderColor={theme.border}
      borderBottom={false}
      paddingBottom={1}
      flexShrink={0}
    >
      <Text>Selected:</Text>
      {fileCount > 0 ? (
        <>
          <Text color={theme.selected}> {fileCount}</Text>
          <Text> files,</Text>
        </>
      ) : null}
      {hunkCount > 0 ? (
        <>
          <Text color={theme.selected}>{hunkCount}</Text>
          <Text> hunks,</Text>
        </>
      ) : null}
      <Text>
        <Text color={theme.selected}> {tokenCount}</Text> tokens
      </Text>
    </Box>
  );
});
