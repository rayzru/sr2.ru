import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Separator } from "~/components/ui/separator";

const meta: Meta<typeof Separator> = {
  title: "Components/Separator",
  component: Separator,
  tags: ["stable"],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-64">
      <p className="text-sm">Выше разделителя</p>
      <Separator className="my-4" />
      <p className="text-sm">Ниже разделителя</p>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-8 items-center gap-4">
      <span className="text-sm">Левое</span>
      <Separator orientation="vertical" />
      <span className="text-sm">Правое</span>
    </div>
  ),
};
