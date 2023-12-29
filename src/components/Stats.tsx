import { Box, Text } from "ink";
import { memo } from "react";
import { theme } from "../config.js";

export type StatsProps = {
  fileCount: number;
  tokenCount: number;
};

export const Stats = memo(({ fileCount, tokenCount }: StatsProps) => {
  return (
    <Box flexDirection="row" borderStyle="round" borderColor={theme.border} borderBottom={false} paddingBottom={1}>
      <Text>
        Selected: <Text color={theme.selected}>{fileCount}</Text> files,
        <Text color={theme.selected}> {tokenCount}</Text> tokens
      </Text>
    </Box>
  );
});
