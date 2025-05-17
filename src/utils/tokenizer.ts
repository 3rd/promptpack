import { getEncoding } from "js-tiktoken";

const enc = getEncoding("cl100k_base", {
  "<|im_start|>": 100_264,
  "<|im_end|>": 100_265,
  "<|im_sep|>": 100_266,
});

export const tokenize = (input: string) => {
  return enc.encode(input, "all");
};
