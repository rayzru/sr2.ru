import { type Metadata } from "next";

import { RulesContent } from "~/components/community/rules-content";

export const metadata: Metadata = {
  title: "Правила сообщества — СР2",
  description:
    "Общие правила для всех чатов и ресурсов сообщества ЖК «Сердце Ростова 2»: принципы общения, запрещённый контент и модерация.",
};

export default function RulesPage() {
  return <RulesContent />;
}
