import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Calendar, Newspaper } from "lucide-react";

import { SectionHeader } from "~/components/ui/section-header";

const meta: Meta<typeof SectionHeader> = {
  title: "Components/SectionHeader",
  component: SectionHeader,
  tags: ["stable"],
  parameters: {
    controls: { disable: false },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithIconAndLink: Story = {
  args: {
    icon: Calendar,
    title: "Календарь",
    href: "/events",
  },
};

export const WithCustomLabel: Story = {
  args: {
    icon: Newspaper,
    title: "Новости",
    href: "/news",
    linkLabel: "Все новости",
  },
};

export const WithoutLink: Story = {
  args: {
    title: "Без ссылки",
  },
};

export const WithoutIcon: Story = {
  args: {
    title: "Без иконки",
    href: "/path",
  },
};
