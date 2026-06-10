import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import type { AsepriteBridge } from "./bridge-server.js";

export interface LaunchDependencies {
  accessFile: (path: string) => Promise<void>;
  spawnProcess: (path: string) => ChildProcess;
}

const defaultDependencies: LaunchDependencies = {
  accessFile: path => access(path),
  spawnProcess: path => {
    const child = spawn(path, [], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();
    return child;
  }
};

export const launchAseprite = async (
  executablePath: string | undefined,
  bridge: AsepriteBridge,
  timeoutMs: number,
  dependencies: LaunchDependencies = defaultDependencies
): Promise<void> => {
  if (bridge.getStatus().ready) {
    return;
  }
  if (!executablePath) {
    throw new Error(
      "ASEPRITE_PATH is not configured. Set it to the Aseprite executable."
    );
  }

  try {
    await dependencies.accessFile(executablePath);
  } catch {
    throw new Error(`Aseprite executable was not found: ${executablePath}`);
  }

  const child = dependencies.spawnProcess(executablePath);
  await new Promise<void>((resolve, reject) => {
    const onSpawn = (): void => {
      child.off("error", onError);
      resolve();
    };
    const onError = (error: Error): void => {
      child.off("spawn", onSpawn);
      reject(new Error(`Failed to start Aseprite: ${error.message}`));
    };
    child.once("spawn", onSpawn);
    child.once("error", onError);
  });

  await bridge.waitUntilReady(timeoutMs);
};
