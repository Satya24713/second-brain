"use client";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { Task } from "@/lib/types";
export function Reminders({
  tasks,
  onOpen,
}: {
  tasks: Task[];
  onOpen: (task: Task) => void;
}) {
  const seen = useRef(new Set<string>());
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      for (const task of tasks) {
        if (task.done || !task.due_at) continue;
        const age = now - Date.parse(task.due_at);
        const key = `${task.id}:${task.due_at}`;
        if (age >= 0 && age < 120000 && !seen.current.has(key)) {
          seen.current.add(key);
          toast("A gentle reminder", {
            description: task.title,
            duration: 15000,
            action: { label: "Open task", onClick: () => onOpen(task) },
          });
        }
      }
    };
    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, [tasks, onOpen]);
  return null;
}
