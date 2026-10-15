/**********************************************************************
 * Copyright (C) 2025 Red Hat, Inc.
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

import type { Page } from '@playwright/test';
import test, { expect as playExpect } from '@playwright/test';
import { NavigationBar, ResourceConnectionCardPage, ResourceElementState, ResourcesPage, StatusBar } from '@podman-desktop/tests-playwright';

import type { MinikubeClusterOptions } from '../model/core/types';
import { CreateMinikubeClusterPage } from '../model/pages/minikube-cluster-creation-page';

export async function ensureMinikubeCliInstalled(page: Page): Promise<void> {
  return test.step('Ensure Minikube CLI is installed', async () => {
    const minikubeRow = page.getByRole('row', { name: 'Minikube', exact: true });
    await playExpect(minikubeRow).toBeVisible();

    if (await minikubeRow.getByLabel('no-cli-version', { exact: true }).count()) {
      await minikubeRow.getByLabel('Install', { exact: true }).click();

      const versionPicker = page.getByRole('dialog', { name: 'drop-down-dialog' });
      await playExpect(versionPicker).toBeVisible({ timeout: 30_000 });
      await versionPicker.getByRole('button').first().click();

      // The binary stays available to the extension without a system-wide copy.
      const installMessage = page.getByRole('dialog', { name: 'Minikube' });
      await playExpect(installMessage).toBeVisible({ timeout: 180_000 });
      await installMessage.getByRole('button', { name: 'Cancel', exact: true }).click();
      await playExpect(installMessage).toBeHidden();
    }

    await playExpect(minikubeRow.getByLabel('cli-version', { exact: true })).toContainText(/\d{1,3}\.\d{1,3}\.\d{1,3}/, {
      timeout: 30_000,
    });
  });
}

export async function createMinikubeCluster(page: Page, clusterName: string = 'minikube', usedefaultOptions: boolean = true, timeout: number = 300_000, { driver, containerRuntime, baseImage, mountDefinition }: MinikubeClusterOptions = {}): Promise<void> {
  return test.step('Create Minikube cluster', async () => {
    const navigationBar = new NavigationBar(page);
    const statusBar = new StatusBar(page);
    const minikubeResourceCard = new ResourceConnectionCardPage(page, 'minikube', clusterName);
    const createMinikubeClusterPage = new CreateMinikubeClusterPage(page);

    const settingsPage = await navigationBar.openSettings();
    const resourcesPage = await settingsPage.openTabPage(ResourcesPage);
    await playExpect(resourcesPage.heading).toBeVisible({ timeout: 10_000 });
    await playExpect.poll(async () => resourcesPage.resourceCardIsVisible('kind')).toBeTruthy();
    await playExpect(minikubeResourceCard.createButton).toBeVisible();

    if (await minikubeResourceCard.doesResourceElementExist()) {
      console.log(`Minikube cluster [${clusterName}] already present, skipping creation.`);
      return;
    }

    await minikubeResourceCard.createButton.click();
    if (usedefaultOptions) {
      await createMinikubeClusterPage.createMinikubeClusterDefault(clusterName, timeout);
    } else {
      await createMinikubeClusterPage.createMinikubeClusterParametrized(
        clusterName,
        {
          driver: driver,
          containerRuntime: containerRuntime,
          baseImage: baseImage,
          mountDefinition: mountDefinition,
        },
        timeout,
      );
    }
    await playExpect(minikubeResourceCard.resourceElement).toBeVisible();
    await playExpect(minikubeResourceCard.resourceElementConnectionStatus).toHaveText(ResourceElementState.Running, {
      timeout: 15_000,
    });
    await statusBar.validateKubernetesContext(clusterName);
  });
}
