import Image from "next/image";
import Link from "next/link";

export function NavLogo() {
  return (
    <Link href="/" data-testid="nav-logo" className="flex h-9 shrink-0 items-center">
      <Image
        src="/sr2-logo.svg"
        alt="СР2"
        width={88}
        height={32}
        priority
        className="h-8 w-auto dark:invert"
      />
    </Link>
  );
}
