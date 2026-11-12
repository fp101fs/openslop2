import * as THREE from 'three';

export interface ModuleMetric {
  id: string;
  name: string;
  color: string;
  timeMs: number;
  percentage: number;
  details?: string;
}

export interface ProfilerSnapshot {
  fps: number;
  frameTimeMs: number;
  cpuBudgetPercent: number;
  memoryMb: number | null;
  drawCalls: number;
  triangles: number;
  textures: number;
  geometries: number;
  modules: ModuleMetric[];
}

export class PerformanceProfiler {
  private static instance: PerformanceProfiler;
  public static get(): PerformanceProfiler {
    if (!this.instance) {
      this.instance = new PerformanceProfiler();
    }
    return this.instance;
  }

  // Rolling averages to prevent jitter
  private moduleTimes: Map<string, number[]> = new Map();
  private maxSamples = 20;

  // Timestamps for active measurements
  private activeTimers: Map<string, number> = new Map();

  // Frame timing
  private lastFrameTimestamp = 0;
  private warmupFrames = 0;
  private frameDeltas: number[] = [];
  public currentFps: number = 60;
  /** One FPS sample per second since the match started (drawn as the FPS-over-time graph). */
  public fpsHistory: number[] = [];
  private fpsSampleAt = 0;
  public resetFpsHistory() { this.fpsHistory = []; this.fpsSampleAt = 0; }

  // WebGL Renderer reference for draw calls & memory
  private renderer: THREE.WebGLRenderer | null = null;

  private moduleMeta: { [id: string]: { name: string; color: string; order: number } } = {
    'grass': { name: 'Animated 3D Grass & Wind', color: '#84cc16', order: 1 },
    'terrain': { name: 'Terrain & PBR Splatting', color: '#eab308', order: 2 },
    'units': { name: 'Unit AI & Flocking', color: '#38bdf8', order: 3 },
    'buildings': { name: 'Buildings & Multi-Stage', color: '#f97316', order: 4 },
    'fog': { name: 'Fog of War & Vision Grid', color: '#a855f7', order: 5 },
    'vfx': { name: 'Combat VFX & Sparks', color: '#ec4899', order: 6 },
    'gpu': { name: 'WebGL GPU Draw Pipeline', color: '#06b6d4', order: 7 }
  };

  public setRenderer(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
  }

  // Start timing a module
  public start(moduleId: string) {
    this.activeTimers.set(moduleId, performance.now());
  }

  // End timing a module and record duration
  public end(moduleId: string) {
    const startTime = this.activeTimers.get(moduleId);
    if (startTime === undefined) return;
    const duration = performance.now() - startTime;
    this.activeTimers.delete(moduleId);

    let samples = this.moduleTimes.get(moduleId);
    if (!samples) {
      samples = [];
      this.moduleTimes.set(moduleId, samples);
    }
    samples.push(duration);
    if (samples.length > this.maxSamples) {
      samples.shift();
    }
  }

  // Record a frame tick to compute accurate FPS
  public tick() {
    const now = performance.now();
    if (this.warmupFrames < 4) {
      this.warmupFrames++;
      this.lastFrameTimestamp = now;
      return;
    }
    const delta = now - this.lastFrameTimestamp;
    this.lastFrameTimestamp = now;

    if (delta > 0 && delta < 100) {
      this.frameDeltas.push(delta);
      if (this.frameDeltas.length > 25) {
        this.frameDeltas.shift();
      }
      const avgDelta = this.frameDeltas.reduce((a, b) => a + b, 0) / this.frameDeltas.length;
      this.currentFps = Math.round(1000 / avgDelta);
    }
    if (now - this.fpsSampleAt >= 1000) {
      if (this.fpsSampleAt && this.warmupFrames >= 0) this.fpsHistory.push(this.currentFps);
      this.fpsSampleAt = now;
      if (this.fpsHistory.length > 14400) this.fpsHistory.shift();
    }
  }

  // Get averaged duration for a module
  public getAverageTime(moduleId: string): number {
    const samples = this.moduleTimes.get(moduleId);
    if (!samples || samples.length === 0) return 0;
    return samples.reduce((a, b) => a + b, 0) / samples.length;
  }

  // Capture full performance snapshot for UI display
  public getSnapshot(): ProfilerSnapshot {
    // 60 FPS frame budget is 16.67ms
    const targetBudgetMs = 16.67;

    let totalRecordedMs = 0;
    const modules: ModuleMetric[] = [];

    for (const [id, meta] of Object.entries(this.moduleMeta)) {
      const avgMs = this.getAverageTime(id);
      totalRecordedMs += avgMs;
      const pct = Math.min(100, Math.round((avgMs / targetBudgetMs) * 100));

      modules.push({
        id,
        name: meta.name,
        color: meta.color,
        timeMs: Math.round(avgMs * 100) / 100,
        percentage: pct
      });
    }

    modules.sort((a, b) => {
      const orderA = this.moduleMeta[a.id]?.order ?? 99;
      const orderB = this.moduleMeta[b.id]?.order ?? 99;
      return orderA - orderB;
    });

    // Memory stats
    let memoryMb: number | null = null;
    if ((performance as any).memory && (performance as any).memory.usedJSHeapSize) {
      memoryMb = Math.round(((performance as any).memory.usedJSHeapSize / (1024 * 1024)) * 10) / 10;
    }

    // GPU render stats
    const drawCalls = this.renderer ? this.renderer.info.render.calls : 0;
    const triangles = this.renderer ? this.renderer.info.render.triangles : 0;
    const textures = this.renderer ? this.renderer.info.memory.textures : 0;
    const geometries = this.renderer ? this.renderer.info.memory.geometries : 0;

    const frameTimeMs = Math.round(totalRecordedMs * 100) / 100;
    const cpuBudgetPercent = Math.min(100, Math.round((totalRecordedMs / targetBudgetMs) * 100));

    return {
      fps: this.currentFps,
      frameTimeMs,
      cpuBudgetPercent,
      memoryMb,
      drawCalls,
      triangles,
      textures,
      geometries,
      modules
    };
  }
}
