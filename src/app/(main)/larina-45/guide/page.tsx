import { type Metadata } from "next";

import { GuideContent } from "~/components/community/guide-content";

export const metadata: Metadata = {
  title: "Как пользоваться — Сообщество СР2",
  description:
    "Подробное руководство по использованию сервиса: регистрация, подтверждение собственности, подача объявлений.",
};

export default function GuidePage() {
  return <GuideContent />;
}
