import { Box, Newline, Text } from "ink";
import React from "react";
import { theme } from "../config.js";
import packageJson from "../../package.json";
import { Kbd } from "./Kbd.js";

export type HeaderProps = {
  children?: React.ReactNode;
};

export const Header = ({ children }: HeaderProps) => {
  return (
    <Box
      gap={2}
      flexDirection="row"
      // borderTop={false}
      // borderLeft={false}
      // borderRight={false}
      borderStyle="round"
      borderColor={theme.border}
    >
      <Box flexDirection="column" flexGrow={1}>
        <Text>
          <Text color="yellowBright">📦</Text>{" "}
          <Text color={theme.brand} bold>
            promptpack
          </Text>{" "}
          <Text color={theme.comment}>v{packageJson.version}</Text>
          <Newline />
        </Text>
        <Text>
          <Text>
            - <Kbd>Arrows</Kbd> or <Kbd>j</Kbd>/<Kbd>k</Kbd> for up/down movement
          </Text>
          <Newline />
          <Text>
            - <Kbd>Tab</Kbd> or <Kbd>Enter</Kbd> to expand/collapse directories
          </Text>
          <Newline />
          <Text>
            - <Kbd>Space</Kbd> to mark a file / directory for packing
          </Text>
          <Newline />
          <Text>
            - <Kbd>y</Kbd> to build and copy the prompt to the system clipboard
          </Text>
        </Text>
      </Box>
      {children}
    </Box>
  );
};
