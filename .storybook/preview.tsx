import React from "react";

import type { Preview } from "@storybook/nextjs-vite";
import { ThemeProvider } from "next-themes";

import "../src/styles/globals.css";
import "./storybook.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    actions: { disable: true },
    a11y: {
      disable: true,
      test: "todo",
    },
    design: { disable: true },
    options: {
      showRoots: true,
      storySort: {
        order: [
          "Introduction",
          "Foundations",
          ["Colors", "Typography"],
          "Components",
          ["Button", "Avatar", "Badge", "Input", "Card", "Dialog", "Sheet", "Skeleton", "*"],
          "*",
        ],
      },
    },
    docs: {
      autodocs: false,
    },
  },
  decorators: [
    (Story) => (
      <ThemeProvider attribute="class" defaultTheme="light">
        <div className="p-4">
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
};

export default preview;
