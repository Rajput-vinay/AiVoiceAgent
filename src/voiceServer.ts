import * as crypto from "crypto";
import * as http from "http";
import { AddressInfo } from "net";
import * as vscode from "vscode";
import { Reply } from "./conversation";
import { VOICE_PAGE } from "./voicePage";

export class VoiceServer implements vscode.Disposable {
  private server?: http.Server;
  private port = 0;
  private readonly token = crypto.randomBytes(16).toString("hex");
  private clients = new Set<http.ServerResponse>();
  private heartbeat?: NodeJS.Timeout;

  constructor(
    private onAsk: (text: string) => Promise<Reply>,
    private log: vscode.OutputChannel,
  ) {}

  get connected(): boolean {
    return this.clients.size > 0;
  }

  async start(): Promise<string> {
    if (!this.server) {
      this.server = http.createServer((req, res) => {
        this.handle(req, res).catch((err) => {
          this.log.appendLine(`[voice] ${err}`);
          if (!res.headersSent)
            res.writeHead(500, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        });
      });
      // 127.0.0.1 only: never reachable from other machines.
      await new Promise<void>((resolve, reject) => {
        this.server!.once("error", reject);
        this.server!.listen(0, "127.0.0.1", () => resolve());
      });
      this.port = (this.server.address() as AddressInfo).port;
      this.heartbeat = setInterval(
        () => this.clients.forEach((c) => c.write(": ping\n\n")),
        15_000,
      );
      this.log.appendLine(`[voice] listening on 127.0.0.1:${this.port}`);
    }
    return `http://127.0.0.1:${this.port}/?t=${this.token}`;
  }

  /** Push text to the browser page so it gets spoken. Returns false if no page is open. */
  speak(text: string): boolean {
    if (!this.connected) return false;
    const msg = `data: ${JSON.stringify({ type: "speak", text })}\n\n`;
    this.clients.forEach((c) => c.write(msg));
    return true;
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    // Defence against DNS rebinding and other websites poking the port.
    if (req.headers.host !== `127.0.0.1:${this.port}`) return this.deny(res);
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.port}`);
    if (url.searchParams.get("t") !== this.token) return this.deny(res);

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy":
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
        "cache-control": "no-store",
      });
      return void res.end(VOICE_PAGE);
    }

    if (req.method === "GET" && url.pathname === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        connection: "keep-alive",
      });
      res.write(": connected\n\n");
      this.clients.add(res);
      req.on("close", () => this.clients.delete(res));
      return;
    }

    if (req.method === "POST" && url.pathname === "/ask") {
      const body = JSON.parse(await this.readBody(req)) as { text?: unknown };
      const text =
        typeof body.text === "string" ? body.text.trim().slice(0, 2000) : "";
      if (!text) {
        res.writeHead(400, { "content-type": "application/json" });
        return void res.end(JSON.stringify({ error: "empty question" }));
      }
      this.log.appendLine(`[voice] you: ${text}`);
      const reply = await this.onAsk(text);
      res.writeHead(200, { "content-type": "application/json" });
      return void res.end(JSON.stringify(reply));
    }

    res.writeHead(404);
    res.end();
  }

  private deny(res: http.ServerResponse) {
    res.writeHead(403);
    res.end("forbidden");
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > 20_000) {
          reject(new Error("request too large"));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
  }

  dispose() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.clients.forEach((c) => c.end());
    this.server?.close();
  }
}
