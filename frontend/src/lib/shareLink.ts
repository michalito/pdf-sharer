import toast from "react-hot-toast";

export function shareUrl(id: number): string {
  return `${window.location.origin}/d/${id}`;
}

/** Copy an item's share link, falling back to a prompt where the clipboard API is unavailable. */
export async function copyShareLink(id: number): Promise<void> {
  const url = shareUrl(id);
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  } catch {
    window.prompt("Copy link:", url);
  }
}
