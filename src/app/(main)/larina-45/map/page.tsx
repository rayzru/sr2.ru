import { BuildingsMap } from "~/components/buildings-map";
import { HydrateClient } from "~/trpc/server";

export const metadata = {
  title: "Карта | SR2",
  description: "Интерактивная карта зданий ЖК",
};

export default async function MapPage() {
  return (
    <HydrateClient>
      <BuildingsMap />
    </HydrateClient>
  );
}
