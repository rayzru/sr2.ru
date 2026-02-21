import { CommunityNav } from "~/components/community-nav";

export default function WeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="container mx-auto max-w-4xl flex-col md:flex">
      <CommunityNav />
      {children}
    </div>
  );
}
