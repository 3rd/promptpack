import { cli as cleye } from "cleye";
import packageJson from "../package.json";
import { mount } from "./mount.js";

const argv = cleye({
  name: "promptpack",
  version: packageJson.version,
  parameters: ["[paths]"],
});

const args = [argv._.paths];
const afterSeparator = argv._["--"];
if (afterSeparator.length > 0) {
  args.splice(args.length - afterSeparator.length, 0, "--");
}

mount();
