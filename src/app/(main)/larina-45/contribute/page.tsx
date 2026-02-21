import { type Metadata } from "next";

import { ContributeContent } from "~/components/community/contribute-content";

export const metadata: Metadata = {
  title: "Как помочь проекту — Сообщество СР2",
  description:
    "Узнайте, как вы можете помочь развитию информационной платформы жителей ЖК «Сердце Ростова 2».",
};

export default function ContributePage() {
  return <ContributeContent />;
}
