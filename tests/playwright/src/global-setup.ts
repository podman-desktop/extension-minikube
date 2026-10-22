/**********************************************************************
 * Copyright (C) 2026 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/

import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { playwrightGlobalSetup } from '@podman-desktop/tests-playwright';

/**
 * Ensure the Electron binary is fully downloaded before tests run.
 *
 * The `electron` npm package downloads its platform binary at install
 * time, but a dependency update can cause the binary to be missing
 * (e.g. cache restored from a different platform, postinstall skipped).
 * The ElectronRunner's `electron.launch()` has a 45 s timeout — too
 * short for a fresh download — so the first test fails and the entire
 * serial suite is skipped.
 *
 * Running `electron --version` triggers the download when missing and
 * is a no-op when the binary is already present.
 */
function ensureElectronBinaryDownloaded(): void {
  const podmanDesktopDir = process.env.PODMAN_DESKTOP_ARGS;
  if (!podmanDesktopDir) {
    return;
  }

  const electronBin = path.join(podmanDesktopDir, 'node_modules', '.bin', 'electron');
  console.log(`Ensuring Electron binary is available at ${podmanDesktopDir} ...`);

  try {
    const version = execFileSync(electronBin, ['--version'], {
      cwd: podmanDesktopDir,
      timeout: 120_000,
      encoding: 'utf-8',
    }).trim();
    console.log(`Electron binary is ready (${version})`);
  } catch (error: unknown) {
    console.warn(`Electron binary pre-download check failed: ${error}`);
  }
}

export default async function globalSetup(): Promise<void> {
  ensureElectronBinaryDownloaded();
  await playwrightGlobalSetup();
}
