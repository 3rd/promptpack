import { readFileSync } from "node:fs";
import { TreeFile } from "./utils/fs.js";

export const buildPrompt = (files: TreeFile[]) => {
  const sections: string[] = [];

  for (const file of files) {
    const content = readFileSync(file.path, "utf8").trimEnd();
    sections.push(`${file.relativePath}:\n\`\`\`${file.extension}\n${content}\n\`\`\``);
  }

  return sections.join("\n\n");
};
