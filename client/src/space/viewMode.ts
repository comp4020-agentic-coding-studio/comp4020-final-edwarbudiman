// Which view a board opens in: the flat board, or the 3D space with the board
// on its wall. Kept out of the 3D code so deciding never loads three.js.

export type ViewMode = "board" | "3d";

const LAST_KEY = "postits:view";
const SIMPLE_KEY = "postits:simple";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode: the preference just isn't remembered */
  }
}

let webgl: boolean | undefined;
/** Phones, and browsers without WebGL, only get the board. */
export function can3D(): boolean {
  if (matchMedia("(hover: none) and (pointer: coarse)").matches) return false;
  if (webgl === undefined) {
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") ?? c.getContext("webgl");
      webgl = !!gl;
      (gl as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

/** Simple mode: always open on the board. */
export const isSimple = () => read(SIMPLE_KEY) === "1";
export const setSimple = (on: boolean) => write(SIMPLE_KEY, on ? "1" : null);

/** `?view=3d` (or `?view=board`) wins, then simple mode, then the last view used. */
export function initialMode(): ViewMode {
  if (!can3D()) return "board";
  const asked = new URLSearchParams(location.search).get("view");
  if (asked === "3d" || asked === "board") return asked;
  if (isSimple()) return "board";
  return read(LAST_KEY) === "3d" ? "3d" : "board";
}

/** Remember the view and put it in the address, so the link opens where you are. */
export function rememberMode(mode: ViewMode): void {
  write(LAST_KEY, mode);
  const url = new URL(location.href);
  if (mode === "3d") url.searchParams.set("view", "3d");
  else url.searchParams.delete("view");
  if (url.href !== location.href) history.replaceState(history.state, "", url);
}
