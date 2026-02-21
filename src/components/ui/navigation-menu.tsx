import * as React from "react";

import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import { cva } from "class-variance-authority";
import { ChevronDown } from "lucide-react";

import { cn } from "~/lib/utils";

interface NavigationItemPositionContext {
  leftPosition: number;
  setLeftPosition?: (leftPosition: number) => void;
  onLeftPositionChange?: (leftPosition: number) => void;
}

class NavigationItemPositionDefaultContext implements NavigationItemPositionContext {
  public setLeftPosition?: (leftPosition: number) => void;
  public onLeftPositionChange?: (leftPosition: number) => void;

  constructor(public leftPosition = 0) {
    this.setLeftPosition = (leftPosition: number) => {
      this.leftPosition = leftPosition;
      if (this.onLeftPositionChange) {
        this.onLeftPositionChange(leftPosition);
      }
    };
  }
}
const CurrentNavigationItemPositionContext =
  React.createContext<NavigationItemPositionContext | null>(null);

const NavigationMenuItemProvider: React.FC<{
  navigationItemPosition: NavigationItemPositionContext | null;
  children: React.ReactNode;
}> = ({ navigationItemPosition, children }) => {
  return (
    <CurrentNavigationItemPositionContext.Provider value={navigationItemPosition}>
      {children}
    </CurrentNavigationItemPositionContext.Provider>
  );
};

const NavigationMenu = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Root>
>(({ className, children, ...props }, ref) => {
  const navigationItemPosition = new NavigationItemPositionDefaultContext();

  return (
    <NavigationMenuPrimitive.Root
      ref={ref}
      className={cn("relative z-10 flex max-w-max flex-1 items-center justify-center", className)}
      {...props}
    >
      <NavigationMenuItemProvider navigationItemPosition={navigationItemPosition}>
        {children}
        <NavigationMenuViewport />
      </NavigationMenuItemProvider>
    </NavigationMenuPrimitive.Root>
  );
});
NavigationMenu.displayName = NavigationMenuPrimitive.Root.displayName;

const NavigationMenuList = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.List>
>(({ className, ...props }, ref) => (
  <NavigationMenuPrimitive.List
    ref={ref}
    className={cn("group flex flex-1 list-none items-center justify-center space-x-1", className)}
    {...props}
  />
));
NavigationMenuList.displayName = NavigationMenuPrimitive.List.displayName;

interface NavigationMenuItemProps extends React.ComponentPropsWithoutRef<
  typeof NavigationMenuPrimitive.Item
> {
  hasSubmenu?: boolean;
}

const NavigationMenuItem = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Item>,
  NavigationMenuItemProps
>(({ className, children, hasSubmenu = false, ...props }, ref) => {
  const currentNavigationItemPositionContext = React.useContext(
    CurrentNavigationItemPositionContext
  );
  const itemRef = React.useRef<HTMLLIElement>(null);

  React.useEffect(() => {
    const handlePointerEnter = () => {
      if (itemRef.current && currentNavigationItemPositionContext != null && hasSubmenu) {
        const parentRect = itemRef.current.parentElement?.getBoundingClientRect();
        const rect = itemRef.current.getBoundingClientRect();

        if (parentRect && currentNavigationItemPositionContext?.setLeftPosition) {
          currentNavigationItemPositionContext.setLeftPosition(rect.left - parentRect.left);
        }
      }
    };

    const hoverTrigger = itemRef.current;
    hoverTrigger?.addEventListener("mouseenter", handlePointerEnter);

    return () => {
      hoverTrigger?.removeEventListener("mouseenter", handlePointerEnter);
    };
  }, [itemRef, currentNavigationItemPositionContext, hasSubmenu]);

  return (
    <NavigationMenuPrimitive.Item
      ref={(node) => {
        itemRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      }}
      className={cn(className)}
      {...props}
    >
      {children}
    </NavigationMenuPrimitive.Item>
  );
});
NavigationMenuItem.displayName = NavigationMenuPrimitive.Item.displayName;

const navigationMenuTriggerStyle = cva(
  "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[active]:bg-accent/50 data-[state=open]:bg-accent/50 group inline-flex h-10 w-max items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none disabled:pointer-events-none disabled:opacity-50 lg:h-11 lg:px-5 lg:text-base"
);

const NavigationMenuTrigger = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <NavigationMenuPrimitive.Trigger
    ref={ref}
    className={cn(navigationMenuTriggerStyle(), "group", className)}
    {...props}
  >
    {children}{" "}
    <ChevronDown
      className="relative top-[1px] ml-1 h-3 w-3 transition duration-200 group-data-[state=open]:rotate-180"
      aria-hidden="true"
    />
  </NavigationMenuPrimitive.Trigger>
));
NavigationMenuTrigger.displayName = NavigationMenuPrimitive.Trigger.displayName;

const NavigationMenuContent = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <NavigationMenuPrimitive.Content
    ref={ref}
    className={cn(
      "data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 left-0 top-0 w-full md:absolute md:w-auto",
      className
    )}
    {...props}
  />
));
NavigationMenuContent.displayName = NavigationMenuPrimitive.Content.displayName;

const NavigationMenuLink = NavigationMenuPrimitive.Link;

const NavigationMenuViewport = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Viewport>
>(({ className, ...props }, ref) => {
  const currentNavigationItemPositionContext = React.useContext(
    CurrentNavigationItemPositionContext
  );
  if (!currentNavigationItemPositionContext) {
    throw new Error("Cannot use NavigationMenuViewport outside of NavigationMenu");
  }
  const [leftPosition, setLeftPosition] = React.useState<number>(
    currentNavigationItemPositionContext?.leftPosition ?? 0
  );
  currentNavigationItemPositionContext.onLeftPositionChange = (leftPosition: number) => {
    setLeftPosition(leftPosition);
  };

  return (
    <div
      style={{ left: leftPosition }}
      className={cn("absolute left-0 top-full flex justify-center")}
    >
      <NavigationMenuPrimitive.Viewport
        className={cn(
          "origin-top-center bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-90 relative mt-1.5 h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden rounded-md border shadow-lg md:w-[var(--radix-navigation-menu-viewport-width)]",
          className
        )}
        ref={ref}
        {...props}
      />
    </div>
  );
});
NavigationMenuViewport.displayName = NavigationMenuPrimitive.Viewport.displayName;

const NavigationMenuIndicator = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Indicator>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Indicator>
>(({ className, ...props }, ref) => (
  <NavigationMenuPrimitive.Indicator
    ref={ref}
    className={cn(
      "data-[state=visible]:animate-in data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:fade-in top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden",
      className
    )}
    {...props}
  >
    <div className="bg-border relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm shadow-md" />
  </NavigationMenuPrimitive.Indicator>
));
NavigationMenuIndicator.displayName = NavigationMenuPrimitive.Indicator.displayName;

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
  NavigationMenuViewport,
};
