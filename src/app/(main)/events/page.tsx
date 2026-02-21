import { PageHeader } from "~/components/page-header";
import { EventsCalendar } from "~/components/events-calendar";

export const metadata = {
  title: "События | SR2",
  description: "Мероприятия, собрания и ежемесячные события ЖК SR2",
};

export default function EventsPage() {
  return (
    <div className="container py-8">
      <PageHeader title="События" description="Мероприятия, собрания и ежемесячные события нашего ЖК" />
      <EventsCalendar />
    </div>
  );
}
