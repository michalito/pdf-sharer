import { useEffect, useId } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  Check,
  ExternalLink,
  HardDrive,
  LayoutGrid,
  Lightbulb,
  Lock,
  Search,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from "lucide-react";

type FeatureCard = {
  icon: LucideIcon;
  title: string;
  desc: string;
  iconBg: string;
  iconColor: string;
};

const features: FeatureCard[] = [
  {
    icon: Upload,
    title: "Upload & Create",
    desc: "Files, folders, links, and notes. Drag and drop or pick manually.",
    iconBg: "bg-[var(--accent-soft)]",
    iconColor: "text-[var(--accent-strong)]",
  },
  {
    icon: ExternalLink,
    title: "Share Instantly",
    desc: "Every item gets a share link. Files download, links redirect, notes render.",
    iconBg: "bg-[var(--accent-cool-soft)]",
    iconColor: "text-[var(--accent-cool)]",
  },
  {
    icon: Lock,
    title: "Password Protect",
    desc: "Optional per-item passwords. Session-based unlock keeps things flowing.",
    iconBg: "bg-[var(--accent-soft)]",
    iconColor: "text-[var(--accent-strong)]",
  },
  {
    icon: LayoutGrid,
    title: "Spaces",
    desc: "Organize items into named collections. Create, rename, and filter by space.",
    iconBg: "bg-[var(--accent-cool-soft)]",
    iconColor: "text-[var(--accent-cool)]",
  },
  {
    icon: ArrowRightLeft,
    title: "Lifecycle",
    desc: "Track status, pin key items, and use two-step safe delete.",
    iconBg: "bg-[var(--app-hover)]",
    iconColor: "text-[var(--app-text)]",
  },
  {
    icon: Search,
    title: "Search & Filter",
    desc: "Search names and unprotected note text. Filter by kind/status/space and sort by created, modified, name, or size.",
    iconBg: "bg-[var(--app-hover)]",
    iconColor: "text-[var(--app-text)]",
  },
  {
    icon: Trash2,
    title: "Bulk Delete",
    desc: "Delete all ready-to-delete items at once from the filter view.",
    iconBg: "bg-rose-600/10",
    iconColor: "text-[var(--danger)]",
  },
  {
    icon: HardDrive,
    title: "Storage Overview",
    desc: "Open Storage for disk usage, item breakdown by kind/status, and largest items.",
    iconBg: "bg-[var(--accent-soft)]",
    iconColor: "text-[var(--accent-strong)]",
  },
];

const steps = [
  {
    title: "Create",
    desc: "Upload files or folders, save a link or note. Set a password if needed.",
  },
  {
    title: "Share",
    desc: "Copy the share link and hand it off. Recipients open it directly.",
  },
  {
    title: "Manage",
    desc: "Track status, pin important items, sort and filter views, then clean up.",
  },
];

const tips = [
  "Drop files or folders anywhere in the app to start upload flow instantly.",
  "If a dialog is already open when you drop files, the upload is queued and opens after that dialog closes.",
  "Long-press or right-click a space chip to rename or delete it.",
  "Filters only change your view \u2014 shared links keep working regardless.",
];

export default function HowItWorksPanel(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props;
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close help panel"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="dialog-pop absolute right-0 top-0 h-full w-full max-w-md border-l border-[var(--app-border)]/55 bg-[var(--app-panel-strong)] shadow-2xl"
      >
        <div className="flex h-full flex-col">
          {/* ── Header ── */}
          <div className="border-b border-[var(--app-border)]/55 p-5 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-0.5">
                  <img src="/logo.png" alt="saíta logo" className="h-full w-full object-contain" />
                </div>
                <div>
                  <h2 id={titleId} className="font-display text-xl font-semibold">
                    saíta
                  </h2>
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--app-muted)]">
                    Internal exchange, zero login
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="pressable inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
                aria-label="Close help panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p id={descriptionId} className="mt-3 text-sm leading-relaxed text-[var(--app-muted)]">
              Share files, folders, links, and notes with your team. No accounts needed &mdash;
              upload, get a link, hand it off.
            </p>
          </div>

          {/* ── Scrollable body ── */}
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {/* Section 1: Features */}
            <section>
              <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--app-muted)]">
                What you can do
              </div>
              <div className="stagger-list mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {features.map((f) => (
                  <div
                    key={f.title}
                    className="rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ${f.iconBg} ${f.iconColor}`}
                      >
                        <f.icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold leading-tight">{f.title}</div>
                        <p className="mt-1 text-[11px] leading-relaxed text-[var(--app-muted)]">
                          {f.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 2: How it works */}
            <section className="rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-4">
              <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--app-muted)]">
                How it works
              </div>
              <ol className="mt-3 space-y-3">
                {steps.map((step, i) => (
                  <li key={step.title} className="flex items-start gap-3">
                    <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{step.title}</div>
                      <p className="mt-0.5 text-xs leading-relaxed text-[var(--app-muted)]">
                        {step.desc}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {/* Section 3: Privacy & access */}
            <section className="rounded-lg border border-rose-600/20 border-l-[3px] border-l-rose-600/45 bg-rose-600/5 p-4">
              <div className="flex items-center gap-2">
                <ShieldAlert
                  className="h-4 w-4 text-rose-700 dark:text-rose-300"
                  aria-hidden="true"
                />
                <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-rose-800 dark:text-rose-200">
                  Privacy & access
                </div>
              </div>
              <ul className="mt-3 space-y-2.5">
                <li className="flex items-start gap-2.5 text-xs leading-relaxed text-rose-900/85 dark:text-rose-100/85">
                  <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-rose-600/50" />
                  No user accounts or ACLs. Anyone with a valid share link can access unprotected
                  items.
                </li>
                <li className="flex items-start gap-2.5 text-xs leading-relaxed text-rose-900/85 dark:text-rose-100/85">
                  <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-rose-600/50" />
                  This app is designed for a trusted internal network. Share links are convenience
                  URLs, not signed secret tokens.
                </li>
                <li className="flex items-start gap-2.5 text-xs leading-relaxed text-rose-900/85 dark:text-rose-100/85">
                  <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-rose-600/50" />
                  Password-protected items require entry before opening and stay unlocked for the
                  browser session.
                </li>
                <li className="flex items-start gap-2.5 text-xs leading-relaxed text-rose-900/85 dark:text-rose-100/85">
                  <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-rose-600/50" />
                  Admins or operators with server storage access can read files and metadata. Items
                  persist until explicitly deleted.
                </li>
              </ul>
            </section>

            {/* Section 4: Tips */}
            <section className="rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-4">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-3.5 w-3.5 text-[var(--accent-cool)]" aria-hidden="true" />
                <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--app-muted)]">
                  Tips
                </div>
              </div>
              <ul className="mt-2.5 space-y-2">
                {tips.map((tip) => (
                  <li
                    key={tip}
                    className="flex items-start gap-2.5 text-xs leading-relaxed text-[var(--app-muted)]"
                  >
                    <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-[var(--accent-cool)]/40" />
                    {tip}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center justify-between border-t border-[var(--app-border)]/55 px-5 py-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--app-muted)]">
              saíta &middot; internal use
            </div>
            <button
              type="button"
              onClick={onClose}
              className="pressable inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 text-sm font-medium text-[var(--app-text)] transition-colors hover:bg-[var(--app-hover)]"
            >
              <Check className="h-3.5 w-3.5" />
              Got it
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
