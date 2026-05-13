"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { cn } from "./utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-4", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-3 relative",
        month_caption: "flex justify-center items-center h-9",
        caption_label: "text-sm font-semibold text-zinc-900",
        nav: "absolute top-0 inset-x-0 flex items-center justify-between h-9 z-10",
        button_previous: "inline-flex items-center justify-center h-7 w-7 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer transition-colors",
        button_next: "inline-flex items-center justify-center h-7 w-7 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer transition-colors",
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday: "text-zinc-400 rounded-md w-9 font-medium text-[0.75rem] uppercase",
        week: "flex w-full mt-1",
        day: "h-9 w-9 text-center text-sm p-0 relative",
        day_button: "inline-flex items-center justify-center h-9 w-9 p-0 text-sm font-normal text-zinc-700 hover:bg-zinc-100 rounded-lg cursor-pointer transition-colors aria-selected:bg-zinc-900 aria-selected:text-white aria-selected:hover:bg-zinc-800 aria-selected:font-medium",
        selected: "rounded-lg",
        today: "bg-blue-50 text-blue-600 font-semibold rounded-lg",
        outside: "text-zinc-300 aria-selected:bg-zinc-100/50 aria-selected:text-zinc-400",
        disabled: "text-zinc-300 opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
