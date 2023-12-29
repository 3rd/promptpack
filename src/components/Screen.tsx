import React, { useEffect, useMemo } from "react";
import { Box, useInput, useStdout } from "ink";
import { useScreenSize } from "../hooks/useScreenSize.js";

export const Screen = ({ children }: { children: React.ReactNode }) => {
  const { height, width } = useScreenSize();
  const { stdout } = useStdout();

  useMemo(() => stdout.write("\u001b[?1049h"), [stdout]);
  useEffect(
    () => () => {
      stdout.write("\u001b[?1049l");
    },
    [stdout]
  );
  useInput(() => {});

  return (
    <Box flexDirection="column" height={height} width={width}>
      {children}
    </Box>
  );
};
