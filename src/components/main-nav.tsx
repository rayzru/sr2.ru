import { Info, ParkingCircle, Users } from "lucide-react";

import { cn } from "~/lib/utils";

import { MainNavItem } from "./main-nav-item";

export function MainNav({ className, ...props }: Readonly<React.HTMLAttributes<HTMLElement>>) {
  return (
    <nav className={cn("flex items-center gap-5", className)} {...props}>
      <MainNavItem title="Справочная" link="/info" icon={<Info />} />
      <MainNavItem title="Паркинг" link="/parking" icon={<ParkingCircle />} />
      <MainNavItem title="ЖК" link="/larina-45" icon={<Users />} />
      {/* <MainNavItem title="Admin" link="/admin" icon={<Wrench />} /> */}
    </nav>
  );
}
