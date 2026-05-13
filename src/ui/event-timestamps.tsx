"use client";

import React, { useState, useEffect } from "react";
import { Globe, Search, Calendar as CalendarIcon, Clock } from "lucide-react";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Calendar } from "./calendar";
import { cn } from "./utils";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";

interface EventTimestampsProps {
  startDate: Date | null;
  endDate: Date | null;
  startTime: string;
  endTime: string;
  timezone: string;
  onStartDateChange: (date: Date | null) => void;
  onEndDateChange: (date: Date | null) => void;
  onStartTimeChange: (time: string) => void;
  onEndTimeChange: (time: string) => void;
  onTimezoneChange: (timezone: string) => void;
  className?: string;
  disabled?: boolean;
  errors?: { startDate?: string; endDate?: string; startTime?: string; endTime?: string };
}

// 30-min time slots
const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    TIME_OPTIONS.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
  }
}

// Common timezones
const TIMEZONES = [
  { value: "Europe/Lisbon", label: "Lisbon", offset: "UTC+0/+1" },
  { value: "Europe/London", label: "London", offset: "UTC+0/+1" },
  { value: "Europe/Paris", label: "Paris", offset: "UTC+1/+2" },
  { value: "Europe/Berlin", label: "Berlin", offset: "UTC+1/+2" },
  { value: "Europe/Madrid", label: "Madrid", offset: "UTC+1/+2" },
  { value: "Europe/Rome", label: "Rome", offset: "UTC+1/+2" },
  { value: "America/New_York", label: "New York", offset: "UTC-5/-4" },
  { value: "America/Chicago", label: "Chicago", offset: "UTC-6/-5" },
  { value: "America/Denver", label: "Denver", offset: "UTC-7/-6" },
  { value: "America/Los_Angeles", label: "Los Angeles", offset: "UTC-8/-7" },
  { value: "America/Sao_Paulo", label: "São Paulo", offset: "UTC-3" },
  { value: "Asia/Tokyo", label: "Tokyo", offset: "UTC+9" },
  { value: "Asia/Shanghai", label: "Shanghai", offset: "UTC+8" },
  { value: "Asia/Dubai", label: "Dubai", offset: "UTC+4" },
  { value: "Asia/Singapore", label: "Singapore", offset: "UTC+8" },
  { value: "Asia/Kolkata", label: "Kolkata", offset: "UTC+5:30" },
  { value: "Australia/Sydney", label: "Sydney", offset: "UTC+10/+11" },
  { value: "Pacific/Auckland", label: "Auckland", offset: "UTC+12/+13" },
  { value: "Africa/Johannesburg", label: "Johannesburg", offset: "UTC+2" },
  { value: "Africa/Lagos", label: "Lagos", offset: "UTC+1" },
];

export function EventTimestamps({
  startDate, endDate, startTime, endTime, timezone,
  onStartDateChange, onEndDateChange, onStartTimeChange, onEndTimeChange, onTimezoneChange,
  className, disabled = false, errors,
}: EventTimestampsProps) {
  const [isStartDateOpen, setIsStartDateOpen] = useState(false);
  const [isEndDateOpen, setIsEndDateOpen] = useState(false);
  const [isStartTimeOpen, setIsStartTimeOpen] = useState(false);
  const [isEndTimeOpen, setIsEndTimeOpen] = useState(false);
  const [isTimezoneOpen, setIsTimezoneOpen] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState("");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Auto-update end date when start date changes
  useEffect(() => {
    if (startDate && endDate && endDate < startDate) onEndDateChange(startDate);
  }, [startDate, endDate, onEndDateChange]);

  // Auto-update end time when same day
  useEffect(() => {
    if (startDate && endDate && startTime && endTime && startDate.getTime() === endDate.getTime()) {
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      if (endMin <= startMin + 30) {
        const newEnd = startMin + 30;
        if (newEnd >= 1440) {
          const nextDay = new Date(startDate);
          nextDay.setDate(nextDay.getDate() + 1);
          onEndDateChange(nextDay);
          onEndTimeChange("00:00");
        } else {
          onEndTimeChange(`${Math.floor(newEnd / 60).toString().padStart(2, "0")}:${(newEnd % 60).toString().padStart(2, "0")}`);
        }
      }
    }
  }, [startDate, endDate, startTime, endTime, onEndDateChange, onEndTimeChange]);

  const formatDateDisplay = (date: Date | null) => {
    if (!date) return "Select date";
    return format(date, "EEE, d MMM", { locale: enUS });
  };

  const getAvailableTimeOptions = (selectedDate: Date | null, isEnd: boolean = false) => {
    let minTime = 0;
    if (isEnd && startDate && startTime && selectedDate && selectedDate.getTime() === startDate.getTime()) {
      const [sh, sm] = startTime.split(":").map(Number);
      minTime = sh * 60 + sm + 30;
    }
    return TIME_OPTIONS.filter(t => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m > minTime;
    });
  };

  const selectedTz = TIMEZONES.find(tz => tz.value === timezone) || { label: timezone.split("/").pop()?.replace(/_/g, " ") || timezone, offset: "" };
  const filteredTimezones = timezoneSearch
    ? TIMEZONES.filter(tz => tz.label.toLowerCase().includes(timezoneSearch.toLowerCase()) || tz.value.toLowerCase().includes(timezoneSearch.toLowerCase()))
    : TIMEZONES;

  return (
    <div className={cn("bg-zinc-50/30 rounded-lg px-4 py-3", className)}>
      <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-3">
        {/* Date/Time Inputs */}
        <div className="flex flex-col gap-2 flex-grow w-full sm:w-auto">
          {/* Start */}
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-zinc-700 w-12">Start</span>
              <Popover open={isStartDateOpen} onOpenChange={setIsStartDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" disabled={disabled}
                    className={cn("w-[160px] h-10 justify-start text-left font-normal", errors?.startDate && "border-red-300")}>
                    <CalendarIcon className="h-5 w-5 mr-2 text-zinc-400" />
                    {formatDateDisplay(startDate)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate || undefined}
                    onSelect={(date) => { onStartDateChange(date || null); setIsStartDateOpen(false); }}
                    disabled={(date) => date < today} />
                </PopoverContent>
              </Popover>
              <Popover open={isStartTimeOpen} onOpenChange={setIsStartTimeOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" disabled={disabled} className="w-[110px] h-10 justify-start text-left font-normal">
                    <Clock className="h-5 w-5 mr-2 text-zinc-400" />
                    {startTime || "15:00"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-32 p-0">
                  <div className="max-h-60 overflow-y-auto">
                    {getAvailableTimeOptions(startDate).map(t => (
                      <Button key={t} variant="ghost" className="w-full justify-start text-left font-normal h-8"
                        onClick={() => { onStartTimeChange(t); setIsStartTimeOpen(false); }}>
                        {t}
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {(errors?.startDate || errors?.startTime) && (
              <p className="text-xs text-red-500 ml-[60px]">{errors.startDate || errors.startTime}</p>
            )}
          </div>

          {/* End */}
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-zinc-700 w-12">End</span>
              <Popover open={isEndDateOpen} onOpenChange={setIsEndDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" disabled={disabled}
                    className={cn("w-[160px] h-10 justify-start text-left font-normal", errors?.endDate && "border-red-300")}>
                    <CalendarIcon className="h-5 w-5 mr-2 text-zinc-400" />
                    {formatDateDisplay(endDate)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate || undefined}
                    onSelect={(date) => { onEndDateChange(date || null); setIsEndDateOpen(false); }}
                    disabled={(date) => date < (startDate || today)} />
                </PopoverContent>
              </Popover>
              <Popover open={isEndTimeOpen} onOpenChange={setIsEndTimeOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" disabled={disabled} className="w-[110px] h-10 justify-start text-left font-normal">
                    <Clock className="h-5 w-5 mr-2 text-zinc-400" />
                    {endTime || "16:00"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-32 p-0">
                  <div className="max-h-60 overflow-y-auto">
                    {getAvailableTimeOptions(endDate, true).map(t => (
                      <Button key={t} variant="ghost" className="w-full justify-start text-left font-normal h-8"
                        onClick={() => { onEndTimeChange(t); setIsEndTimeOpen(false); }}>
                        {t}
                      </Button>
                    ))}
                    {getAvailableTimeOptions(endDate, true).length === 0 && (
                      <div className="p-2 text-sm text-zinc-400 text-center">No times available</div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {(errors?.endDate || errors?.endTime) && (
              <p className="text-xs text-red-500 ml-[60px]">{errors.endDate || errors.endTime}</p>
            )}
          </div>
        </div>

        {/* Timezone */}
        <Popover open={isTimezoneOpen} onOpenChange={(open) => { setIsTimezoneOpen(open); if (!open) setTimezoneSearch(""); }}>
          <PopoverTrigger asChild>
            <div className={cn(
              "w-[80px] self-stretch border border-zinc-200 rounded-lg bg-white hover:bg-zinc-50 cursor-pointer flex flex-col items-center justify-center",
              disabled && "opacity-50 cursor-not-allowed pointer-events-none"
            )}>
              <Globe className="h-3.5 w-3.5 mb-0.5 text-zinc-400" />
              <div className="text-[11px] text-zinc-800 font-medium leading-tight">{selectedTz.offset}</div>
              <div className="text-[10px] text-zinc-400 leading-tight">{selectedTz.label}</div>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <div className="p-3 border-b border-zinc-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input type="text" placeholder="Search timezone..." value={timezoneSearch} onChange={e => setTimezoneSearch(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-transparent border border-zinc-200 rounded-md focus:outline-none focus:border-zinc-400 text-sm" />
              </div>
            </div>
            <div className="p-2">
              <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                {timezoneSearch ? "Search Results" : "All Timezones"}
              </div>
              <div className="max-h-60 overflow-y-auto">
                {filteredTimezones.map(tz => (
                  <Button key={tz.value} variant="ghost"
                    className={cn("w-full justify-start text-left font-normal h-auto p-3", timezone === tz.value && "bg-zinc-900 text-white hover:bg-zinc-900 hover:text-white")}
                    onClick={() => { onTimezoneChange(tz.value); setIsTimezoneOpen(false); setTimezoneSearch(""); }}>
                    <div className="flex flex-col items-start">
                      <span className="text-sm">{tz.label}</span>
                      <span className={cn("text-xs", timezone === tz.value ? "text-zinc-300" : "text-zinc-400")}>{tz.offset}</span>
                    </div>
                  </Button>
                ))}
                {filteredTimezones.length === 0 && (
                  <div className="text-center py-4 text-zinc-400 text-sm">No timezones found</div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
