// The board page and the sidebar live side by side but don't share React
// state; they talk through these few window events.

const REFRESH = "postits:sidebar-refresh";
const CREATE = "postits:create-channel";

/** Something changed that the sidebar's unread counts should reflect. */
export const refreshSidebar = (): void => void window.dispatchEvent(new Event(REFRESH));
export const onRefreshSidebar = (fn: () => void) => listen(REFRESH, fn);

/** Open the new-channel form, optionally with an address already typed. */
export const openCreateChannel = (slug = ""): void => void window.dispatchEvent(new CustomEvent(CREATE, { detail: slug }));
export const onOpenCreateChannel = (fn: (slug: string) => void) => listen(CREATE, (e) => fn(String((e as CustomEvent).detail ?? "")));

function listen(type: string, fn: (e: Event) => void): () => void {
  window.addEventListener(type, fn);
  return () => window.removeEventListener(type, fn);
}
