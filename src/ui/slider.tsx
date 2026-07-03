"use client";

import * as React from "react";
import { cn } from "./utils";

interface SliderProps {
  value: number[];
  onValueChange: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

export function Slider({ value, onValueChange, min = 0, max = 100, step = 1, className }: SliderProps) {
  const pct = ((value[0] - min) / (max - min)) * 100;

  return (
    <div className={cn("relative flex w-full touch-none select-none items-center", className)}>
      <div className="relative h-2 w-full grow overflow-hidden rounded-full bg-zinc-200">
        <div className="absolute h-full bg-zinc-900 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value[0]}
        onChange={e => onValueChange([parseFloat(e.target.value)])}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <div
        className="absolute h-5 w-5 rounded-full border-2 border-zinc-900 bg-white shadow-sm pointer-events-none"
        style={{ left: `calc(${pct}% - 10px)` }}
      />
    </div>
  );
}
