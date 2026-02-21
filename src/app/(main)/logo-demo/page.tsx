import { AnimatedLogo } from "~/components/animated-logo";

export default function LogoDemoPage() {
  return (
    <div className="container mx-auto min-h-screen space-y-12 p-8">
      {/* Banner */}
      <div className="flex min-h-64 flex-col items-center justify-center gap-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 px-8 py-16 dark:from-slate-800 dark:to-slate-900">
        <AnimatedLogo className="w-full max-w-lg" />
        <p className="text-muted-foreground text-center text-sm">
          Наведите курсор на логотип — СР2 раскрывается в СЕРДЦЕ РОСТОВА 2
        </p>
      </div>

      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Animated Logo Demo</h1>
        <p className="text-muted-foreground">
          Демонстрация hover анимации логотипа от СР2 до полной версии СЕРДЦЕ РОСТОВА 2
        </p>
      </div>

      <div className="space-y-8">
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Default Speed (400ms)</h2>
          <p className="text-muted-foreground text-sm">
            Hover to expand from СР2 to full logo with sequential letter reveal
          </p>
          <div className="bg-background flex items-center justify-center rounded-lg border p-8">
            <AnimatedLogo className="w-full max-w-md" />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Fast Animation (300ms)</h2>
          <p className="text-muted-foreground text-sm">Quick expansion</p>
          <div className="bg-background flex items-center justify-center rounded-lg border p-8">
            <AnimatedLogo duration={300} className="w-full max-w-md" />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Slow Animation (1000ms)</h2>
          <p className="text-muted-foreground text-sm">Smooth expansion</p>
          <div className="bg-background flex items-center justify-center rounded-lg border p-8">
            <AnimatedLogo duration={1000} className="w-full max-w-md" />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Dark Background</h2>
          <p className="text-muted-foreground text-sm">Shows color adaptation on hover</p>
          <div className="flex items-center justify-center rounded-lg border bg-slate-900 p-8">
            <AnimatedLogo duration={600} className="w-full max-w-md" />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Small Size</h2>
          <p className="text-muted-foreground text-sm">Responsive sizing</p>
          <div className="bg-background flex items-center justify-center rounded-lg border p-8">
            <AnimatedLogo duration={600} className="w-48" />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Large Size</h2>
          <p className="text-muted-foreground text-sm">Works at any size</p>
          <div className="bg-background flex items-center justify-center rounded-lg border p-8">
            <AnimatedLogo duration={600} className="w-full" />
          </div>
        </section>
      </div>

      <div className="space-y-4 border-t pt-8">
        <h2 className="text-2xl font-semibold">Usage</h2>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-sm text-slate-50">
          <code>{`import { AnimatedLogo } from "~/components/animated-logo";

// Basic usage (400ms duration, sequential letter reveal)
<AnimatedLogo />

// Custom duration (in milliseconds)
<AnimatedLogo duration={300} />  // Fast
<AnimatedLogo duration={1000} /> // Slow

// Custom styling
<AnimatedLogo className="w-64" />
<AnimatedLogo className="w-full max-w-2xl" />

// Hover to expand from СР2 to full "СЕРДЦЕ РОСТОВА 2"
// Letters appear sequentially with staggered delays
`}</code>
        </pre>
      </div>
    </div>
  );
}
