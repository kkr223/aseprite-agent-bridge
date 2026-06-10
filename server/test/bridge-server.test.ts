import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { WebSocket } from "ws";
import {
  AsepriteBridgeServer,
  BridgeError
} from "../src/bridge-server.js";

const openClient = async (
  bridge: AsepriteBridgeServer
): Promise<WebSocket> => {
  const client = new WebSocket(
    `ws://127.0.0.1:${bridge.getListeningPort()}`
  );
  await once(client, "open");
  return client;
};

const sendReady = (client: WebSocket, protocolVersion = "1.0"): void => {
  client.send(
    JSON.stringify({
      event: "bridge.ready",
      protocolVersion,
      apiVersion: 30,
      version: "1.3.15"
    })
  );
};

test("matches responses, attaches token, and exposes ready status", async () => {
  const bridge = new AsepriteBridgeServer(0, "secret", 500);
  await bridge.start();
  const client = await openClient(bridge);

  try {
    sendReady(client);
    await bridge.waitUntilReady(500);

    client.once("message", data => {
      const request = JSON.parse(data.toString()) as {
        id: string;
        command: string;
        token: string;
      };
      assert.equal(request.command, "get_state");
      assert.equal(request.token, "secret");
      client.send(
        JSON.stringify({
          id: request.id,
          ok: true,
          protocolVersion: "1.0",
          result: { hasSprite: false }
        })
      );
    });

    assert.deepEqual(await bridge.request("get_state"), {
      hasSprite: false
    });
    assert.deepEqual(bridge.getStatus(), {
      connected: true,
      ready: true,
      protocolVersion: "1.0",
      apiVersion: 30,
      asepriteVersion: "1.3.15",
      lastError: undefined
    });
  } finally {
    client.close();
    await once(client, "close");
    await bridge.stop();
  }
});

test("rejects a second Aseprite connection", async () => {
  const bridge = new AsepriteBridgeServer(0, "", 500);
  await bridge.start();
  const first = await openClient(bridge);
  sendReady(first);
  await bridge.waitUntilReady(500);
  const second = await openClient(bridge);

  try {
    const [code] = (await once(second, "close")) as [number, Buffer];
    assert.equal(code, 1013);
    assert.equal(bridge.getStatus().ready, true);
  } finally {
    first.close();
    await once(first, "close");
    await bridge.stop();
  }
});

test("rejects timed out and disconnected requests", async () => {
  const bridge = new AsepriteBridgeServer(0, "", 30);
  await bridge.start();
  const client = await openClient(bridge);
  sendReady(client);
  await bridge.waitUntilReady(500);

  await assert.rejects(
    bridge.request("ping"),
    (error: unknown) =>
      error instanceof BridgeError && error.code === "request_timeout"
  );

  const pending = bridge.request("get_state");
  client.close();
  await assert.rejects(
    pending,
    (error: unknown) =>
      error instanceof BridgeError && error.code === "connection_closed"
  );
  await bridge.stop();
});

test("preserves bridge error codes and rejects incompatible protocols", async () => {
  const bridge = new AsepriteBridgeServer(0, "", 500);
  await bridge.start();
  const client = await openClient(bridge);
  sendReady(client);
  await bridge.waitUntilReady(500);

  client.once("message", data => {
    const request = JSON.parse(data.toString()) as { id: string };
    client.send(
      JSON.stringify({
        id: request.id,
        ok: false,
        protocolVersion: "1.0",
        error: {
          code: "command_failed",
          message: "No active sprite"
        }
      })
    );
  });

  await assert.rejects(
    bridge.request("save"),
    (error: unknown) =>
      error instanceof BridgeError &&
      error.code === "command_failed" &&
      error.message === "No active sprite"
  );
  client.close();
  await once(client, "close");

  const incompatible = await openClient(bridge);
  const ready = bridge.waitUntilReady(500);
  sendReady(incompatible, "2.0");
  await assert.rejects(
    ready,
    (error: unknown) =>
      error instanceof BridgeError && error.code === "protocol_mismatch"
  );
  await once(incompatible, "close");
  assert.match(bridge.getStatus().lastError || "", /expected 1\.0/);
  await bridge.stop();
});
