// One WebSocket per open board. It reconnects on its own with backoff, and
// tells the page each time it (re)joins so the page can resync from the
// server (F-04: a dropped connection or a laptop lid never leaves a stale board).

export type ServerMsg = { type: string; [k: string]: unknown };
export type Status = "connecting" | "open" | "closed";

export class LiveSocket {
  private ws: WebSocket | null = null;
  private boardId: number;
  private onMsg: (m: ServerMsg) => void;
  private onStatus: (s: Status) => void;
  private retry = 0;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastHeard = 0;

  constructor(boardId: number, onMsg: (m: ServerMsg) => void, onStatus: (s: Status) => void) {
    this.boardId = boardId;
    this.onMsg = onMsg;
    this.onStatus = onStatus;
    this.connect();
    window.addEventListener("online", this.kick);
    document.addEventListener("visibilitychange", this.kick);
  }

  /** Back online, or the tab came back: if the socket died meanwhile, reconnect now. */
  private kick = (): void => {
    if (this.stopped || document.visibilityState === "hidden") return;
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      if (this.timer) clearTimeout(this.timer);
      this.retry = 0;
      this.connect();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: "ping" });
    }
  };

  private connect(): void {
    if (this.stopped) return;
    this.onStatus("connecting");
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.lastHeard = Date.now();
      ws.send(JSON.stringify({ type: "join", board: this.boardId }));
      this.onStatus("open");
    };
    ws.onmessage = (e) => {
      this.lastHeard = Date.now();
      try {
        this.onMsg(JSON.parse(String(e.data)) as ServerMsg);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.onStatus("closed");
      if (this.stopped) return;
      // 0.5 s, 1 s, 2 s ... up to 10 s, with jitter so a server restart
      // isn't met by every client at once
      const delay = Math.min(10_000, 500 * 2 ** this.retry++) * (0.75 + Math.random() * 0.5);
      this.timer = setTimeout(() => this.connect(), delay);
    };
    if (this.heartbeat) clearInterval(this.heartbeat);
    // a half-open connection (slow or flaky network) looks open forever;
    // ping, and if nothing comes back for a while, start over
    this.heartbeat = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      if (Date.now() - this.lastHeard > 45_000) this.ws.close();
      else this.send({ type: "ping" });
    }, 20_000);
  }

  get open(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    window.removeEventListener("online", this.kick);
    document.removeEventListener("visibilitychange", this.kick);
    this.ws?.close();
  }
}
