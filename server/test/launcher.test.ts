import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { ChildProcess } from "node:child_process";
import type { AsepriteBridge } from "../src/bridge-server.js";
import {
  launchAseprite,
  type LaunchDependencies
} from "../src/launcher.js";

const makeBridge = (
  ready: boolean,
  waitUntilReady: () => Promise<void> = async () => {}
): AsepriteBridge => ({
  getStatus: () => ({ connected: ready, ready }),
  waitUntilReady,
  request: async () => ({})
});

const makeChild = (
  event: "spawn" | "error",
  error?: Error
): ChildProcess => {
  const child = new EventEmitter() as ChildProcess;
  queueMicrotask(() => child.emit(event, error));
  return child;
};

test("does not launch when Aseprite is already connected", async () => {
  let spawned = false;
  await launchAseprite("aseprite.exe", makeBridge(true), 100, {
    accessFile: async () => {
      throw new Error("should not check the path");
    },
    spawnProcess: () => {
      spawned = true;
      return makeChild("spawn");
    }
  });
  assert.equal(spawned, false);
});

test("validates the executable and waits for the bridge", async () => {
  let waited = false;
  const dependencies: LaunchDependencies = {
    accessFile: async path => assert.equal(path, "aseprite.exe"),
    spawnProcess: path => {
      assert.equal(path, "aseprite.exe");
      return makeChild("spawn");
    }
  };

  await launchAseprite(
    "aseprite.exe",
    makeBridge(false, async () => {
      waited = true;
    }),
    100,
    dependencies
  );
  assert.equal(waited, true);
});

test("reports missing configuration, missing files, and spawn failures", async () => {
  await assert.rejects(
    launchAseprite(undefined, makeBridge(false), 100),
    /ASEPRITE_PATH is not configured/
  );

  await assert.rejects(
    launchAseprite("missing.exe", makeBridge(false), 100, {
      accessFile: async () => {
        throw new Error("missing");
      },
      spawnProcess: () => makeChild("spawn")
    }),
    /was not found/
  );

  await assert.rejects(
    launchAseprite("bad.exe", makeBridge(false), 100, {
      accessFile: async () => {},
      spawnProcess: () => makeChild("error", new Error("denied"))
    }),
    /Failed to start Aseprite: denied/
  );
});

test("propagates a bridge connection timeout", async () => {
  await assert.rejects(
    launchAseprite(
      "aseprite.exe",
      makeBridge(false, async () => {
        throw new Error("connection timeout");
      }),
      100,
      {
        accessFile: async () => {},
        spawnProcess: () => makeChild("spawn")
      }
    ),
    /connection timeout/
  );
});
