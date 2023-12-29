import React from "react";
import { Text } from "ink";
import { theme } from "../config.js";

export type KbdProps = {
  children?: React.ReactNode;
};

export const Kbd = ({ children }: KbdProps) => {
  return (
    <Text color={theme.kbd.bg}>
      {""}
      <Text backgroundColor={theme.kbd.bg} color={theme.kbd.fg}>
        {children}
      </Text>
      {""}
    </Text>
  );
};
