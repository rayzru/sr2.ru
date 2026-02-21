import { addons } from "storybook/manager-api";
import { create } from "storybook/theming";

const sr2Theme = create({
  base: "light",
  fontBase: '"Inter", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
  fontCode: 'ui-monospace, Monaco, "Cascadia Code", Consolas, "Courier New", monospace',

  brandTitle: "СР2 UI Kit",
  brandUrl: "https://sr2.ru",

  // Cyan primary (matches project primary color)
  colorPrimary: "#06b6d4",
  colorSecondary: "#0891b2",

  appBg: "#f9fafb",
  appContentBg: "#ffffff",
  appBorderColor: "#e5e7eb",
  appBorderRadius: 8,

  barTextColor: "#6b7280",
  barSelectedColor: "#06b6d4",
  barBg: "#ffffff",

  inputBg: "#ffffff",
  inputBorder: "#d1d5db",
  inputTextColor: "#111827",
  inputBorderRadius: 6,
});

addons.setConfig({
  theme: sr2Theme,
  panelPosition: "bottom",
  sidebar: {
    showRoots: false,
    collapsedRoots: [],
  },
});
