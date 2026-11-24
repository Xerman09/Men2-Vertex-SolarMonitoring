"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ModeToggle() {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon-sm" className="rounded-xl h-8 w-8">
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          className="rounded-xl h-8 w-8 cursor-pointer border-border/60 hover:bg-accent/60 relative"
          title="Toggle Color Theme"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-amber-500" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-sky-400" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-xl min-w-[120px] p-1 border-border/70">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className="rounded-lg gap-2 cursor-pointer py-1.5 px-2.5"
        >
          <Sun className="h-3.5 w-3.5 text-amber-500" />
          <span className="font-medium text-xs">Light Mode</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className="rounded-lg gap-2 cursor-pointer py-1.5 px-2.5"
        >
          <Moon className="h-3.5 w-3.5 text-sky-400" />
          <span className="font-medium text-xs">Dark Mode</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className="rounded-lg gap-2 cursor-pointer py-1.5 px-2.5"
        >
          <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium text-xs">System Auto</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
