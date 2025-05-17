import { Box, Newline, Text } from "ink";
import packageJson from "../../package.json";
import { theme } from "../config.js";
import { Kbd } from "./Kbd.js";

const MAX_LOG_LENGTH = 6;

type HeaderProps = {
  mode?: "file" | "git";
  notifications: { id: string; message: string }[];
};

export const Header = ({ notifications, mode = "file" }: HeaderProps) => {
  return (
    <Box
      borderColor={theme.border}
      borderStyle="round"
      flexDirection="row"
      gap={2}
      flexShrink={0}
      // borderTop={false}
      // borderLeft={false}
      // borderRight={false}
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
            - <Kbd>Tab</Kbd> or <Kbd>Enter</Kbd> to expand/collapse items
          </Text>
          <Newline />
          {mode === "file" && (
            <>
              <Text>
                - <Kbd>f</Kbd> to open fuzzy finder
              </Text>
              <Newline />
            </>
          )}
          <Text>
            - <Kbd>Space</Kbd> to mark a file / directory for packing
          </Text>
          <Newline />
          <Text>
            - <Kbd>y</Kbd> to build and copy the prompt to the system clipboard
          </Text>
          <Newline />
          <Text>
            - <Kbd>g</Kbd> to switch between file and git mode
          </Text>
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {notifications.slice(-MAX_LOG_LENGTH).map((n) => (
          <Text key={n.id} color="gray">
            {n.message}
          </Text>
        ))}
      </Box>
    </Box>
  );
};
