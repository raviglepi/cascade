import {mergeConfig} from "vite";

import config from "../vite.config.ts";

export default mergeConfig(config, {test: {environment: "happy-dom"}});
