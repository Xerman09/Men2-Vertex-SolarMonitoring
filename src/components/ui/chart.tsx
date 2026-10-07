"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";
import { cn } from "@/lib/utils";

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
    color?: string;
  };
};

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

export function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }
  return context;
}

export const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig;
    children: React.ComponentProps<
      typeof RechartsPrimitive.ResponsiveContainer
    >["children"];
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        ref={ref}
        className={cn(
          "flex aspect-auto justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/40 [&_.recharts-polar-grid_path]:stroke-border/50 [&_.recharts-tooltip-cursor]:stroke-border",
          className
        )}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer width="100%" height="100%">
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = "ChartContainer";

export interface ChartTooltipPayloadItem {
  name?: string;
  dataKey?: string | number;
  value?: string | number;
  color?: string;
  fill?: string;
  stroke?: string;
  payload?: Record<string, unknown>;
}

export interface ChartTooltipContentProps {
  active?: boolean;
  payload?: ChartTooltipPayloadItem[];
  label?: string | number;
  formatter?: (value: unknown, name?: string | number, item?: ChartTooltipPayloadItem) => React.ReactNode;
  hideLabel?: boolean;
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  formatter,
  hideLabel = false,
}: ChartTooltipContentProps) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border/70 bg-popover/95 p-2.5 text-xs text-popover-foreground shadow-xl backdrop-blur-md min-w-[140px]">
      {!hideLabel && (
        <div className="font-semibold text-foreground mb-1.5 pb-1 border-b border-border/50">
          {label}
        </div>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((item: ChartTooltipPayloadItem, index: number) => {
          const name = item.name || item.dataKey;
          const val = formatter ? formatter(item.value, name, item) : item.value;
          return (
            <div key={`item-${index}`} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: item.color || item.fill || item.stroke }}
                />
                <span className="text-muted-foreground">{name}:</span>
              </div>
              <span className="font-mono font-bold text-foreground">{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
