import { Injectable, signal } from '@angular/core';
import {
  DEFAULT_SCENE_ENVIRONMENT,
  deriveSceneEnvironment,
  EnvironmentSettings,
} from './scene-environment';

/** One immutable presentation snapshot for the editor's Local/Remote views. */
@Injectable({ providedIn: 'root' })
export class SceneEnvironmentService {
  private readonly current = signal(DEFAULT_SCENE_ENVIRONMENT);
  readonly snapshot = this.current.asReadonly();

  set(settings: EnvironmentSettings): void {
    const next = deriveSceneEnvironment(settings),
      previous = this.current().settings;
    if (
      Object.keys(previous).every(
        (k) =>
          previous[k as keyof EnvironmentSettings] ===
          next.settings[k as keyof EnvironmentSettings],
      )
    )
      return;
    this.current.set(next);
  }
}
