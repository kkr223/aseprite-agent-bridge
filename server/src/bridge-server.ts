import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";

const PROTOCOL_VERSION = "1.0";
const NOT_CONNECTED_MESSAGE =
  "Aseprite is not connected. Start Aseprite and enable the WebSocket bridge extension.";

interface BridgeReadyEvent {
  event: "bridge.ready";
  protocolVersion: string;
  apiVersion?: number;
  version?: string;
}

interface BridgeResponse {
  id: string;
  ok: boolean;
  protocolVersion: string;
  result?: unknown;
  error?: {
    code?: string;
    message?: string;
  };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface ReadyWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface BridgeStatus {
  connected: boolean;
  ready: boolean;
  protocolVersion?: string;
  apiVersion?: number;
  asepriteVersion?: string;
  lastError?: string;
}

export interface AsepriteBridge {
  getStatus(): BridgeStatus;
  waitUntilReady(timeoutMs: number): Promise<void>;
  request(command: string, args?: unknown): Promise<unknown>;
}

export class BridgeError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "BridgeError";
  }
}

export class AsepriteBridgeServer {
  private server?: WebSocketServer;
  private socket?: WebSocket;
  private readyEvent?: BridgeReadyEvent;
  private lastError?: string;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly readyWaiters = new Set<ReadyWaiter>();

  constructor(
    private readonly port: number,
    private readonly token: string,
    private readonly requestTimeoutMs: number
  ) {}

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    const server = new WebSocketServer({
      host: "127.0.0.1",
      port: this.port
    });
    this.server = server;
    server.on("connection", socket => this.acceptConnection(socket));

    await new Promise<void>((resolve, reject) => {
      const onListening = (): void => {
        server.off("error", onError);
        resolve();
      };
      const onError = (error: Error): void => {
        server.off("listening", onListening);
        this.server = undefined;
        reject(error);
      };
      server.once("listening", onListening);
      server.once("error", onError);
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    this.disconnect(new BridgeError("server_stopped", "Bridge server stopped"));

    if (!server) {
      return;
    }

    await new Promise<void>(resolve => {
      server.close(() => resolve());
    });
  }

  getStatus(): BridgeStatus {
    return {
      connected: this.socket?.readyState === WebSocket.OPEN,
      ready: this.readyEvent !== undefined,
      protocolVersion: this.readyEvent?.protocolVersion,
      apiVersion: this.readyEvent?.apiVersion,
      asepriteVersion: this.readyEvent?.version,
      lastError: this.lastError
    };
  }

  getListeningPort(): number {
    const address = this.server?.address();
    if (!address || typeof address === "string") {
      return this.port;
    }
    return address.port;
  }

  async waitUntilReady(timeoutMs: number): Promise<void> {
    if (this.readyEvent) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const waiter: ReadyWaiter = {
        resolve: () => {
          clearTimeout(waiter.timer);
          this.readyWaiters.delete(waiter);
          resolve();
        },
        reject: error => {
          clearTimeout(waiter.timer);
          this.readyWaiters.delete(waiter);
          reject(error);
        },
        timer: setTimeout(() => {
          waiter.reject(
            new BridgeError(
              "connection_timeout",
              "Timed out waiting for the Aseprite bridge to connect"
            )
          );
        }, timeoutMs)
      };
      this.readyWaiters.add(waiter);
    });
  }

  async request(command: string, args: unknown = {}): Promise<unknown> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || !this.readyEvent) {
      throw new BridgeError("not_connected", NOT_CONNECTED_MESSAGE);
    }

    const id = randomUUID();
    const response = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new BridgeError(
            "request_timeout",
            `Aseprite command timed out: ${command}`
          )
        );
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });

    try {
      socket.send(
        JSON.stringify({
          id,
          command,
          token: this.token,
          args
        })
      );
    } catch (error) {
      const pending = this.pending.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.reject(
          new BridgeError("send_failed", this.errorMessage(error))
        );
      }
    }

    return response;
  }

  private acceptConnection(socket: WebSocket): void {
    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      socket.close(1013, "An Aseprite instance is already connected");
      return;
    }

    this.socket = socket;
    this.readyEvent = undefined;
    this.lastError = undefined;

    socket.on("message", data => {
      if (this.socket === socket) {
        this.handleMessage(data.toString());
      }
    });
    socket.on("error", error => {
      if (this.socket === socket) {
        this.lastError = error.message;
      }
    });
    socket.on("close", () => {
      if (this.socket === socket) {
        this.disconnect(
          new BridgeError("connection_closed", "Aseprite bridge disconnected")
        );
      }
    });
  }

  private handleMessage(data: string): void {
    let message: unknown;
    try {
      message = JSON.parse(data);
    } catch {
      this.lastError = "Aseprite sent invalid JSON";
      return;
    }

    if (!message || typeof message !== "object") {
      return;
    }

    const record = message as Record<string, unknown>;
    if (record.event === "bridge.ready") {
      this.handleReady(record as unknown as BridgeReadyEvent);
      return;
    }

    if (typeof record.id === "string") {
      this.handleResponse(record as unknown as BridgeResponse);
    }
  }

  private handleReady(event: BridgeReadyEvent): void {
    if (event.protocolVersion !== PROTOCOL_VERSION) {
      const error = new BridgeError(
        "protocol_mismatch",
        `Unsupported bridge protocol ${event.protocolVersion}; expected ${PROTOCOL_VERSION}`
      );
      this.lastError = error.message;
      this.rejectReadyWaiters(error);
      this.socket?.close(1002, "Unsupported bridge protocol");
      return;
    }

    this.readyEvent = event;
    for (const waiter of [...this.readyWaiters]) {
      waiter.resolve();
    }
  }

  private handleResponse(response: BridgeResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(response.id);

    if (response.protocolVersion !== PROTOCOL_VERSION) {
      pending.reject(
        new BridgeError(
          "protocol_mismatch",
          `Unsupported response protocol ${response.protocolVersion}`
        )
      );
      return;
    }

    if (!response.ok) {
      pending.reject(
        new BridgeError(
          response.error?.code || "command_failed",
          response.error?.message || "Aseprite command failed"
        )
      );
      return;
    }

    pending.resolve(response.result);
  }

  private disconnect(error: BridgeError): void {
    const socket = this.socket;
    this.socket = undefined;
    this.readyEvent = undefined;
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close();
    }

    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
    this.rejectReadyWaiters(error);
  }

  private rejectReadyWaiters(error: Error): void {
    for (const waiter of [...this.readyWaiters]) {
      waiter.reject(error);
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
