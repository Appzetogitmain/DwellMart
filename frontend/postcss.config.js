import autoprefixer from "autoprefixer";
import { createRequire } from "module";
import { plugin } from "postcss";

const require = createRequire(import.meta.url);

export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
