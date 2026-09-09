import Link from "next/link";
import { nav, site } from "@/lib/site";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { PaletteButton } from "@/components/search/PaletteButton";
import { NavLinks } from "./NavLinks";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="text-accent">
        <circle cx="5" cy="6" r="2.2" fill="currentColor" />
        <circle cx="19" cy="6" r="2.2" fill="currentColor" />
        <circle cx="12" cy="18" r="2.2" fill="currentColor" />
        <circle cx="12" cy="10" r="1.6" fill="currentColor" opacity=".6" />
        <path d="M5 6 12 10 19 6M12 10v8" stroke="currentColor" strokeWidth="1.5" opacity=".7" />
      </svg>
      <span className="font-semibold tracking-tight">{site.name}</span>
    </span>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="shrink-0 rounded-md text-fg" aria-label={`${site.name} home`}>
          <Logo />
        </Link>
        <nav aria-label="Primary" className="no-scrollbar hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex">
          <NavLinks items={nav} />
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <PaletteButton />
          <ThemeToggle />
        </div>
      </div>
      <nav aria-label="Primary mobile" className="no-scrollbar flex items-center gap-1 overflow-x-auto border-t border-border px-3 py-1.5 md:hidden">
        <NavLinks items={nav} />
      </nav>
    </header>
  );
}
