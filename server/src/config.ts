export interface ServerConfig {
  wsPort: number;
  token: string;
  asepritePath?: string;
  requestTimeoutMs: number;
  launchTimeoutMs: number;
}

const readPositiveInteger = (
  value: string | undefined,
  fallback: number,
  name: string
): number => {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
};

export const loadConfig = (
  environment: NodeJS.ProcessEnv = process.env
): ServerConfig => ({
  wsPort: readPositiveInteger(
    environment.ASEPRITE_WS_PORT,
    32123,
    "ASEPRITE_WS_PORT"
  ),
  token: environment.ASEPRITE_TOKEN ?? "",
  asepritePath: environment.ASEPRITE_PATH || undefined,
  requestTimeoutMs: readPositiveInteger(
    environment.ASEPRITE_REQUEST_TIMEOUT_MS,
    10000,
    "ASEPRITE_REQUEST_TIMEOUT_MS"
  ),
  launchTimeoutMs: readPositiveInteger(
    environment.ASEPRITE_LAUNCH_TIMEOUT_MS,
    15000,
    "ASEPRITE_LAUNCH_TIMEOUT_MS"
  )
});
