import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BoardShot, Space, Where } from "./engine.ts";
import type { ServerMsg } from "../socket.ts";

/** board: flat board only · to3d: pulling back into the room · 3d: walking · toBoard: dollying into the board */
export type Phase = "board" | "to3d" | "3d" | "toBoard";

type Engine = typeof import("./engine.ts");
let engine: Promise<Engine> | null = null;
// three.js is its own chunk, fetched the first time 3D opens (later from the browser cache)
const loadEngine = () => (engine ??= import("./engine.ts").catch((err) => ((engine = null), Promise.reject(err))));

/** The board's live connection, as far as the room needs it. */
export interface RoomLink {
  send: (msg: Record<string, unknown>) => void;
  /** Hands the room the avatar messages (and "joined", after a reconnect). */
  register: (handler: (m: ServerMsg) => void) => void;
  colorOf: (sid: string) => string;
  mySid: string | null;
}

interface Props {
  phase: Phase;
  shot: BoardShot;
  link: RoomLink;
  onEntered: () => void;
  onLeft: () => void;
  onFailed: () => void;
  onFocusBoard: () => void;
}

/**
 * The 3D view, laid over the board's viewport at exactly its size. The flat
 * board stays underneath the whole time, so arriving back on it is just this
 * layer fading away.
 */
export function SpaceLayer({ phase, shot, link, ...props }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const spaceRef = useRef<Space | null>(null);
  const [shown, setShown] = useState(false);
  const [near, setNear] = useState(false);
  const [locked, setLocked] = useState(false);
  const shotRef = useRef(shot);
  shotRef.current = shot;
  const cb = useRef(props);
  cb.current = props;
  const linkRef = useRef(link);
  linkRef.current = link;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  // everyone standing in this board's room, kept even while 3D is paused or freed
  const peers = useRef(new Map<string, { name: string; where: Where }>());

  useEffect(() => {
    link.register((m) => {
      const space = spaceRef.current;
      const live = phaseRef.current !== "board";
      if (m.type === "avatar" && typeof m.sid === "string") {
        const p = { name: typeof m.name === "string" ? m.name : "Someone", where: { x: m.x as number, y: m.y as number, z: m.z as number, yaw: m.yaw as number } };
        peers.current.set(m.sid, p);
        if (live) space?.setPeer(m.sid, p.name, linkRef.current.colorOf(m.sid), p.where);
      } else if (m.type === "avatar:leave" && typeof m.sid === "string") {
        peers.current.delete(m.sid);
        space?.removePeer(m.sid);
      } else if (m.type === "joined") {
        // a fresh connection: the server sends whoever is in the room again, and needs to hear where we are
        peers.current.clear();
        space?.clearPeers();
        if (phaseRef.current === "3d") space?.announce();
      }
    });
  }, [link.register]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlers = () => ({
    focusBoard: () => cb.current.onFocusBoard(),
    near: setNear,
    locked: setLocked,
    move: (w: Where) => linkRef.current.send({ type: "avatar", ...w }),
  });
  const showPeers = (space: Space) => {
    for (const [sid, p] of peers.current) space.setPeer(sid, p.name, linkRef.current.colorOf(sid), p.where);
  };

  useEffect(() => {
    let cancelled = false;
    if (phase === "to3d") {
      loadEngine()
        .then((mod) => {
          if (cancelled || !hostRef.current) return;
          const space = mod.getSpace();
          spaceRef.current = space;
          space.attach(hostRef.current, handlers(), linkRef.current.colorOf(linkRef.current.mySid ?? "me"));
          showPeers(space);
          space.setBoard(shotRef.current);
          return space.enter(() => setShown(true)).then(() => !cancelled && cb.current.onEntered());
        })
        .catch((err: unknown) => {
          console.error("3D failed to start", err);
          if (!cancelled) {
            setShown(false);
            cb.current.onFailed();
          }
        });
    } else if (phase === "toBoard") {
      const space = spaceRef.current;
      if (!space) {
        cb.current.onLeft();
        return;
      }
      linkRef.current.send({ type: "avatar:leave" });
      space.setBoard(shotRef.current);
      void space.leave().then(() => {
        if (cancelled) return;
        setShown(false); // fades out over the identical flat board
        window.setTimeout(() => !cancelled && cb.current.onLeft(), 160);
      });
    } else if (phase === "board" && spaceRef.current) {
      // paused straight away; disposed after a minute on the board
      setNear(false);
      setLocked(false);
      spaceRef.current.clearPeers();
      void loadEngine().then((mod) => mod.releaseSpace());
    }
    return () => {
      cancelled = true;
    };
  }, [phase]);

  // leaving the page (travelling to another board, say) pauses too
  useEffect(() => {
    const host = hostRef.current;
    return () => {
      if (!spaceRef.current || !host) return;
      spaceRef.current.detach(host);
      void loadEngine().then((mod) => mod.releaseSpace());
    };
  }, []);

  // notes changing while you're in the room show up on the wall
  useEffect(() => {
    if (phase === "3d") spaceRef.current?.setBoard(shot);
  }, [shot, phase]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => spaceRef.current?.resize(host.clientWidth, host.clientHeight));
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <div
        ref={hostRef}
        className={`space-layer${shown ? " shown" : ""}`}
        style={{ width: shot.width, height: shot.height, display: phase === "board" ? "none" : undefined }}
        aria-label="Your home in 3D. Click to capture the mouse and look around, W A S D or arrow keys walk, V switches first and third person, E at the board opens it, M goes back to the board."
        role="application"
      />
      {phase === "3d" && locked && <div className="crosshair" aria-hidden style={{ left: shot.width / 2, top: shot.height / 2 }} />}
      {phase === "3d" && (
        <div className={`island space-hint${near ? " near" : ""}`} role="status">
          {near ? (
            <span>
              Press <kbd>E</kbd> to open the board
            </span>
          ) : locked ? (
            <span>
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd> walk · mouse looks · <kbd>V</kbd> first/third person · <kbd>E</kbd> at the board · <kbd>Esc</kbd> frees the mouse
            </span>
          ) : (
            <span>
              <strong>Click to look around</strong> · <kbd>V</kbd> first/third person · <kbd>M</kbd> board view
            </span>
          )}
        </div>
      )}
    </>
  );
}
