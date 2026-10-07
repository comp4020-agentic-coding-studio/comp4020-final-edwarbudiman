import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BoardShot, Space } from "./engine.ts";

/** board: flat board only · to3d: pulling back into the room · 3d: walking · toBoard: dollying into the board */
export type Phase = "board" | "to3d" | "3d" | "toBoard";

type Engine = typeof import("./engine.ts");
let engine: Promise<Engine> | null = null;
// three.js is its own chunk, fetched the first time 3D opens (later from the browser cache)
const loadEngine = () => (engine ??= import("./engine.ts").catch((err) => ((engine = null), Promise.reject(err))));

interface Props {
  phase: Phase;
  shot: BoardShot;
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
export function SpaceLayer({ phase, shot, ...props }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const spaceRef = useRef<Space | null>(null);
  const [shown, setShown] = useState(false);
  const [near, setNear] = useState(false);
  const shotRef = useRef(shot);
  shotRef.current = shot;
  const cb = useRef(props);
  cb.current = props;

  useEffect(() => {
    let cancelled = false;
    if (phase === "to3d") {
      loadEngine()
        .then((mod) => {
          if (cancelled || !hostRef.current) return;
          const space = mod.getSpace();
          spaceRef.current = space;
          space.attach(hostRef.current, { focusBoard: () => cb.current.onFocusBoard(), near: setNear });
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
      space.setBoard(shotRef.current);
      void space.leave().then(() => {
        if (cancelled) return;
        setShown(false); // fades out over the identical flat board
        window.setTimeout(() => !cancelled && cb.current.onLeft(), 160);
      });
    } else if (phase === "board" && spaceRef.current) {
      // paused straight away; disposed after a minute on the board
      setNear(false);
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
        aria-label="Your home in 3D. W A S D or arrow keys walk, drag to look around, E at the board opens it, M goes back to the board."
        role="application"
      />
      {phase === "3d" && (
        <div className={`island space-hint${near ? " near" : ""}`} role="status">
          {near ? (
            <span>
              Press <kbd>E</kbd> to open the board
            </span>
          ) : (
            <span>
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd> walk · drag to look · <kbd>E</kbd> at the board · <kbd>M</kbd> board view
            </span>
          )}
        </div>
      )}
    </>
  );
}
