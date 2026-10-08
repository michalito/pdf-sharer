import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  Copy,
  HardDrive,
  ExternalLink,
  LayoutGrid,
  Lightbulb,
  Lock,
  Search,
  ShieldAlert,
  Timer,
  Trash2,
  Upload,
} from "lucide-react";
import SidePanel, { PanelSectionLabel } from "./SidePanel";

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
    title: "Upload & create",
    desc: "Files, folders, links, and notes. Drag and drop anywhere or pick manually.",
    iconBg: "bg-[var(--accent-soft)]",
    iconColor: "text-[var(--accent-strong)]",
  },
  {
    icon: ExternalLink,
    title: "Share instantly",
    desc: "Every item gets a share link. Files download, links redirect, notes render.",
    iconBg: "bg-[var(--accent-cool-soft)]",
    iconColor: "text-[var(--accent-cool)]",
  },
  {
    icon: Lock,
    title: "Password protect",
    desc: "Optional per-item passwords. Unlocking lasts for the browser session.",
    iconBg: "bg-[var(--accent-soft)]",
    iconColor: "text-[var(--accent-strong)]",
  },
  {
    icon: Timer,
    title: "Auto-delete",
    desc: "Set an expiry from 1 hour to 30 days. Expired items are removed permanently.",
    iconBg: "bg-[var(--accent-cool-soft)]",
    iconColor: "text-[var(--accent-cool)]",
  },
  {
    icon: LayoutGrid,
    title: "Spaces",
    desc: "Group items into named spaces, then filter, rename, or rearrange them.",
    iconBg: "bg-[var(--accent-soft)]",
    iconColor: "text-[var(--accent-strong)]",
  },
  {
    icon: ArrowRightLeft,
    title: "Lifecycle",
    desc: "Track status, pin key items, and delete in two safe steps.",
    iconBg: "bg-[var(--accent-cool-soft)]",
    iconColor: "text-[var(--accent-cool)]",
  },
  {
    icon: Search,
    title: "Search & sort",
    desc: "Search names and unprotected note text. Filter by kind, status, or space.",
    iconBg: "bg-[var(--app-hover)]",
    iconColor: "text-[var(--app-text)]",
  },
  {
    icon: Trash2,
    title: "Bulk delete",
    desc: "Filter to Ready to delete, then delete every matching item at once.",
    iconBg: "bg-rose-600/10",
    iconColor: "text-[var(--danger)]",
  },
  {
    icon: HardDrive,
    title: "Storage overview",
    desc: "Open Storage for disk usage, breakdowns by kind, status, and space, and the largest items.",
    iconBg: "bg-[var(--accent-soft)]",
    iconColor: "text-[var(--accent-strong)]",
  },
  {
    icon: Copy,
    title: "Duplicate check",
    desc: "Re-uploading identical content warns you first, so the library stays tidy.",
    iconBg: "bg-[var(--app-hover)]",
    iconColor: "text-[var(--app-text)]",
  },
];

const steps = [
  {
    title: "Create",
    desc: "Upload files or folders, or save a link or note. Add a password or expiry if needed.",
  },
  {
    title: "Share",
    desc: "Copy the share link and hand it off. Recipients open it directly.",
  },
  {
    title: "Manage",
    desc: "Track status, pin important items, filter your view, then clean up.",
  },
];

const privacyNotes = [
  "Signed-in members share one workspace. Anyone with a share link can open unprotected items.",
  "Share links are public convenience URLs, not secret tokens. Use a password for sensitive items.",
  "Password-protected items ask for the password once per browser session.",
  "Operators with server access can read stored files and metadata. Items stay until deleted or expired.",
];

const tips = [
  "Drop files or folders anywhere in the app to start an upload.",
  "Drops made while a dialog is open are queued until it closes.",
  "Right-click or long-press a space to rename, rearrange, or delete it.",
  "Choose Manual sort, then the grip button, to drag items into your own order.",
  "Filters only change your view \u2014 share links keep working regardless.",
];

export default function HowItWorksPanel(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props;

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="saíta"
      subtitle="Shared workspace"
      description="Share files, folders, links, and notes. Upload, copy the link, and hand it off. Recipients can open share links without signing in."
      icon={<img src="/logo.png" alt="" className="h-full w-full object-contain p-0.5" />}
      closeLabel="Close help panel"
      footerLabel="saíta · internal use"
      footerButtonLabel="Got it"
    >
      {/* Section 1: Features */}
      <section>
        <PanelSectionLabel>What you can do</PanelSectionLabel>
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
        <PanelSectionLabel>How it works</PanelSectionLabel>
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
          <ShieldAlert className="h-4 w-4 text-rose-700 dark:text-rose-300" aria-hidden="true" />
          <div className="font-mono text-[11px] uppercase tracking-[0.1em] text-rose-800 dark:text-rose-200">
            Privacy & access
          </div>
        </div>
        <ul className="mt-3 space-y-2.5">
          {privacyNotes.map((note) => (
            <li
              key={note}
              className="flex items-start gap-2.5 text-xs leading-relaxed text-rose-900/85 dark:text-rose-100/85"
            >
              <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-rose-600/50" />
              {note}
            </li>
          ))}
        </ul>
      </section>

      {/* Section 4: Tips */}
      <section className="rounded-lg border border-[var(--app-border)]/35 bg-[var(--app-panel)]/20 p-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-3.5 w-3.5 text-[var(--accent-cool)]" aria-hidden="true" />
          <PanelSectionLabel>Tips</PanelSectionLabel>
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
    </SidePanel>
  );
}
