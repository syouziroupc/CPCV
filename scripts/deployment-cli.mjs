import { resolve } from "node:path";

export function parseDeploymentOptions(argv, {
  defaultDatabase = "",
  defaultConfigPath = "",
  allowOrigin = false
} = {}) {
  const options = {
    database: defaultDatabase,
    configPath: defaultConfigPath ? resolve(defaultConfigPath) : "",
    origin: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index] || "");
    const [name, inlineValue] = argument.includes("=") ? argument.split(/=(.*)/s, 2) : [argument, ""];
    if (name === "--database") {
      options.database = requireValue(name, inlineValue || argv[++index]);
      continue;
    }
    if (name === "--config") {
      options.configPath = resolve(requireValue(name, inlineValue || argv[++index]));
      continue;
    }
    if (allowOrigin && name === "--origin") {
      options.origin = requireValue(name, inlineValue || argv[++index]).replace(/\/$/, "");
      continue;
    }
    throw new Error(`Unknown deployment option: ${argument || "<empty>"}`);
  }
  if (options.database && !/^[A-Za-z0-9_-]{1,128}$/.test(options.database)) {
    throw new Error("Database name or binding contains unsupported characters.");
  }
  if (options.origin && !/^https:\/\//.test(options.origin)) {
    throw new Error("--origin must be an HTTPS origin.");
  }
  return options;
}

export function withWranglerConfig(args, configPath) {
  return configPath ? [...args, "--config", configPath] : [...args];
}

function requireValue(name, value) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.startsWith("--") || /[\r\n\0]/.test(normalized)) {
    throw new Error(`${name} requires a single-line value.`);
  }
  return normalized;
}
