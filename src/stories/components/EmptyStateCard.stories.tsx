import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Search } from "lucide-react";

import { EmptyStateCard } from "~/components/ui/empty-state-card";

const meta: Meta<typeof EmptyStateCard> = {
  title: "Components/EmptyStateCard",
  component: EmptyStateCard,
  tags: ["stable"],
  parameters: {
    controls: { disable: false },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: Search,
    title: "Ничего не найдено",
    description: "Попробуйте изменить параметры поиска",
  },
};

export const WithAction: Story = {
  args: {
    icon: Search,
    title: "Нет данных",
    description: "Создайте первую запись",
    action: { label: "Создать", href: "#" },
  },
};

export const Warning: Story = {
  args: {
    icon: Search,
    title: "Внимание",
    description: "Требуется ваше действие",
    variant: "warning",
  },
};
