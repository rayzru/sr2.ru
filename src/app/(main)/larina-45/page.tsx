import { type Metadata } from "next";

import { AboutContent } from "~/components/community/about-content";

export const metadata: Metadata = {
  title: "О проекте — Сообщество СР2",
  description:
    "Информационная платформа жителей ЖК «Сердце Ростова 2»: цели, история и команда сообщества.",
};

export default function CommunityPage() {
  return <AboutContent />;
}
