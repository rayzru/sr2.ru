import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Input } from "~/components/ui/input";

const meta: Meta<typeof Input> = {
  title: "Components/Input",
  component: Input,
  tags: ["stable"],
  parameters: {
    controls: { disable: false },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { placeholder: "Введите текст..." } };
export const Disabled: Story = { args: { placeholder: "Недоступно", disabled: true } };
export const WithValue: Story = { args: { defaultValue: "Пример значения" } };
export const Password: Story = { args: { type: "password", placeholder: "Пароль" } };
