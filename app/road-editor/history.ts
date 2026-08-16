"use client";

import { useCallback, useRef, useState } from "react";
import { cloneProject, RoadProject } from "./model";

export function useRoadHistory(initial: RoadProject) {
  const [project, setProject] = useState(initial);
  const past = useRef<RoadProject[]>([]);
  const future = useRef<RoadProject[]>([]);
  const transientStart = useRef<RoadProject | null>(null);
  const [availability, setAvailability] = useState({ canUndo: false, canRedo: false });

  const refreshAvailability = useCallback(() => {
    queueMicrotask(() => setAvailability({ canUndo: past.current.length > 0, canRedo: future.current.length > 0 }));
  }, []);

  const commit = useCallback((recipe: (draft: RoadProject) => RoadProject | void) => {
    setProject((current) => {
      const draft = cloneProject(current);
      const result = recipe(draft) ?? draft;
      result.updatedAt = new Date().toISOString();
      past.current.push(cloneProject(current));
      if (past.current.length > 80) past.current.shift();
      future.current = [];
      return result;
    });
    refreshAvailability();
  }, [refreshAvailability]);

  const transient = useCallback((recipe: (draft: RoadProject) => RoadProject | void) => {
    setProject((current) => {
      if (!transientStart.current) transientStart.current = cloneProject(current);
      const draft = cloneProject(current);
      return recipe(draft) ?? draft;
    });
  }, []);

  const finishTransient = useCallback(() => {
    if (!transientStart.current) return;
    past.current.push(transientStart.current);
    if (past.current.length > 80) past.current.shift();
    transientStart.current = null;
    future.current = [];
    setProject((current) => ({ ...current, updatedAt: new Date().toISOString() }));
    refreshAvailability();
  }, [refreshAvailability]);

  const undo = useCallback(() => {
    setProject((current) => {
      const previous = past.current.pop();
      if (!previous) return current;
      future.current.push(cloneProject(current));
      return previous;
    });
    refreshAvailability();
  }, [refreshAvailability]);

  const redo = useCallback(() => {
    setProject((current) => {
      const next = future.current.pop();
      if (!next) return current;
      past.current.push(cloneProject(current));
      return next;
    });
    refreshAvailability();
  }, [refreshAvailability]);

  const reset = useCallback((next: RoadProject) => {
    past.current = [];
    future.current = [];
    transientStart.current = null;
    setProject(cloneProject(next));
    setAvailability({ canUndo: false, canRedo: false });
  }, []);

  return {
    project,
    commit,
    transient,
    finishTransient,
    undo,
    redo,
    reset,
    canUndo: availability.canUndo,
    canRedo: availability.canRedo,
  };
}
