import { render } from "ink";
import { App } from "./App.js";

// https://github.com/vadimdemedes/ink/issues/263#issuecomment-1796398357
const write = async (content: string) => {
  return new Promise<void>((resolve, reject) => {
    process.stdout.write(content, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
};

export const mount = async () => {
  await write("\u001b[?1049h");
  const instance = render(<App />);
  await instance.waitUntilExit();
  await write("\u001b[?1049l");
};
