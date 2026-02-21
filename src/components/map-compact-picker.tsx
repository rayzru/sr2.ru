import { type SVGProps, useEffect, useState } from "react";

import { logger } from "~/lib/logger";
import { cn } from "~/lib/utils";

interface MapCompactPickerProps {
  onSelect: (selected: number) => void;
  selected: number | undefined;
  className?: string;
  readOnly?: boolean;
}

type RectProps = Partial<SVGProps<SVGRectElement>>;

export function MapCompactPicker({
  onSelect,
  readOnly,
  selected: initialSelected,
  className,
}: Readonly<MapCompactPickerProps>) {
  const [selected, setSelected] = useState<number | undefined>(initialSelected);
  logger.debug("MapCompactPicker selected:", selected);
  const handleClick = (value: number) => {
    if (readOnly) return;
    setSelected(value);
    onSelect(value);
  };

  useEffect(() => {
    setSelected(initialSelected);
  }, [initialSelected]);

  const commonProps: RectProps = {
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinejoin: "round",
  };

  const defaultDisabledProps = (value: number): RectProps => ({
    ...commonProps,
    opacity: "0.2",
    className: selected === value ? "fill-current" : "fill-transparent",
  });

  const defaultProps = (value: number): RectProps => ({
    ...commonProps,
    className: selected === value ? "fill-current" : "fill-transparent",
    onClick: () => handleClick(value),
  });

  return (
    <div className={cn("", className)}>
      <svg viewBox="0 0 639 587" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect
          key={`building-7`}
          x="518.077"
          y="43.0754"
          width="75.0724"
          height="145.609"
          transform="rotate(1.45837 518.077 43.0754)"
          {...defaultProps(7)}
        />
        <rect
          key={`building-6`}
          x="385.763"
          y="65.7647"
          width="75.0724"
          height="161.621"
          transform="rotate(1.45837 385.763 65.7647)"
          {...defaultProps(6)}
        />
        <rect
          key={`building-5`}
          x="240.156"
          y="136.363"
          width="80.8252"
          height="212.189"
          transform="rotate(1.45837 240.156 136.363)"
          {...defaultDisabledProps(5)}
        />
        <rect
          key={`building-4`}
          x="124.792"
          y="190.093"
          width="80.8252"
          height="77.9013"
          transform="rotate(1.45837 124.792 190.093)"
          {...defaultDisabledProps(4)}
        />
        <rect
          key={`building-2`}
          x="160.629"
          y="469.356"
          width="244.367"
          height="81.9809"
          transform="rotate(-24.7213 160.629 469.356)"
          {...defaultProps(2)}
        />
        <rect
          x="81.9117"
          y="294.526"
          width="229.893"
          height="45.0426"
          transform="rotate(73.4757 81.9117 294.526)"
          {...defaultDisabledProps(3)}
        />
        <rect
          key={`building-1`}
          x="383.312"
          y="366.915"
          width="199.903"
          height="81.9809"
          transform="rotate(-24.7213 383.312 366.915)"
          {...defaultProps(1)}
        />
      </svg>
    </div>
  );
}
