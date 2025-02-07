/**********************************************************************
 * Copyright (C) 2024-2025 Red Hat, Inc.
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

import {
  checkClusterResources,
  deleteCluster,
  deleteClusterFromDetails,
  ensureCliInstalled,
  expect as playExpect,
  ExtensionsPage,
  isLinux,
  resourceConnectionAction,
  resourceConnectionActionDetails,
  ResourceConnectionCardPage,
  ResourceElementActions,
  ResourceElementState,
  ResourcesPage,
  RunnerOptions,
  test,
} from '@podman-desktop/tests-playwright';

import { createMinikubeCluster } from '../utility/operations';

const EXTENSION_IMAGE: string = 'ghcr.io/podman-desktop/podman-desktop-extension-minikube:nightly';
const EXTENSION_NAME: string = 'minikube';
const EXTENSION_LABEL: string = 'podman-desktop.minikube';
const CLUSTER_NAME: string = 'minikube';
const MINIKUBE_CONTAINER: string = 'minikube';
const CLUSTER_CREATION_TIMEOUT: number = 300_000;

let extensionsPage: ExtensionsPage;
let minikubeResourceCard: ResourceConnectionCardPage;

const skipExtensionInstallation = process.env.SKIP_EXTENSION_INSTALL === 'true';
const driverGHA = process.env.MINIKUBE_DRIVER_GHA ?? '';

test.beforeAll(async ({ runner, page, welcomePage }) => {
  runner.setVideoAndTraceName('minikube-extension-e2e');
  await welcomePage.handleWelcomePage(true);
  extensionsPage = new ExtensionsPage(page);
  minikubeResourceCard = new ResourceConnectionCardPage(page, 'minikube');
});

test.use({
  runnerOptions: new RunnerOptions({
    customFolder: 'minikube-tests-pd',
    customOutputFolder: 'tests/output',
    autoUpdate: false,
    autoCheckUpdates: false,
  }),
});

test.afterAll(async ({ runner }) => {
  test.setTimeout(120_000);
  await runner.close();
  console.log('Runner closed');
});

test.describe.serial('Podman Desktop Minikube Extension Tests', () => {
  test('Install Minikube extension from OCI image', async ({ navigationBar }) => {
    test.skip(!!skipExtensionInstallation, 'Skipping extension installation');

    await navigationBar.openExtensions();
    await playExpect(extensionsPage.header).toBeVisible();
    await playExpect.poll(async () => extensionsPage.extensionIsInstalled(EXTENSION_LABEL)).toBeFalsy();
    await extensionsPage.openCatalogTab();
    await extensionsPage.installExtensionFromOCIImage(EXTENSION_IMAGE);
  });

  test('Verify Minikube extension is installed and active', async ({ navigationBar }) => {
    await navigationBar.openExtensions();
    await playExpect(extensionsPage.header).toBeVisible();
    await playExpect.poll(async () => extensionsPage.extensionIsInstalled(EXTENSION_LABEL)).toBeTruthy();
    const minikubeExtension = await extensionsPage.getInstalledExtension(EXTENSION_NAME, EXTENSION_LABEL);
    await playExpect(minikubeExtension.status).toHaveText('ACTIVE', { timeout: 40_000 });
  });

  test('Ensure Minikube extension details page is correctly displayed', async () => {
    const minikubeExtension = await extensionsPage.getInstalledExtension(EXTENSION_NAME, EXTENSION_LABEL);
    const minikubeDetails = await minikubeExtension.openExtensionDetails('Minikube extension');
    await playExpect(minikubeDetails.heading).toBeVisible();
    await playExpect(minikubeDetails.status).toHaveText('ACTIVE');
    await playExpect(minikubeDetails.tabContent).toBeVisible();
  });

  test('Install Minikube CLI', async ({ navigationBar, page }) => {
    test.skip(isLinux && !!process.env.GITHUB_ACTIONS);
    const settingsBar = await navigationBar.openSettings();
    await settingsBar.cliToolsTab.click();
    await ensureCliInstalled(page, 'Minikube');
  });

  test.describe.serial('Minikube cluster e2e test', () => {
    test('Create a Minikube cluster', async ({ page }) => {
      test.setTimeout(CLUSTER_CREATION_TIMEOUT);
      if (process.env.GITHUB_ACTIONS && process.env.RUNNER_OS === 'Linux') {
        await createMinikubeCluster(page, CLUSTER_NAME, false, CLUSTER_CREATION_TIMEOUT, { driver: driverGHA });
      } else {
        await createMinikubeCluster(page, CLUSTER_NAME, true, CLUSTER_CREATION_TIMEOUT);
      }
    });

    test('Check resources added with the Minikube cluster', async ({ page }) => {
      await checkClusterResources(page, MINIKUBE_CONTAINER);
    });

    test('Minikube cluster operations - STOP', async ({ page }) => {
      test.setTimeout(70_000);
      await resourceConnectionAction(
        page,
        minikubeResourceCard,
        ResourceElementActions.Stop,
        ResourceElementState.Off,
        60_000,
      );
    });

    test('Minikube cluster operations - START', async ({ page }) => {
      test.setTimeout(70_000);
      await resourceConnectionAction(
        page,
        minikubeResourceCard,
        ResourceElementActions.Start,
        ResourceElementState.Running,
        60_000,
      );
    });

    test.skip('Minikube cluster operatioms - RESTART', async ({ page }) => {
      // Skipping the test due to an issue with restarting the Minikube cluster.
      await resourceConnectionAction(
        page,
        minikubeResourceCard,
        ResourceElementActions.Restart,
        ResourceElementState.Running,
      );
    });

    test('Minikube cluster operations - DELETE', async ({ page }) => {
      test.setTimeout(120_000);
      await deleteCluster(page, EXTENSION_NAME, MINIKUBE_CONTAINER, CLUSTER_NAME);
    });
  });

  test.describe.serial('Minikube cluster operations - Details', () => {
    test('Create a Minikube cluster', async ({ page }) => {
      test.setTimeout(CLUSTER_CREATION_TIMEOUT);
      if (process.env.GITHUB_ACTIONS && process.env.RUNNER_OS === 'Linux') {
        await createMinikubeCluster(page, CLUSTER_NAME, false, CLUSTER_CREATION_TIMEOUT, { driver: driverGHA });
      } else {
        await createMinikubeCluster(page, CLUSTER_NAME, true, CLUSTER_CREATION_TIMEOUT);
      }
    });

    test('Minikube cluster operations details - STOP', async ({ page }) => {
      test.setTimeout(70_000);
      await resourceConnectionActionDetails(
        page,
        minikubeResourceCard,
        CLUSTER_NAME,
        ResourceElementActions.Stop,
        ResourceElementState.Off,
        60_000,
      );
    });

    test('Minikube cluster operations details - START', async ({ page }) => {
      test.setTimeout(70_000);
      await resourceConnectionActionDetails(
        page,
        minikubeResourceCard,
        CLUSTER_NAME,
        ResourceElementActions.Start,
        ResourceElementState.Running,
        60_000,
      );
    });

    test.skip('Minikube cluster operations details - RESTART', async ({ page }) => {
      // Skipping the test due to an issue with restarting the Minikube cluster.
      await resourceConnectionActionDetails(
        page,
        minikubeResourceCard,
        CLUSTER_NAME,
        ResourceElementActions.Restart,
        ResourceElementState.Running,
      );
    });

    test('Minikube cluster operations details - DELETE', async ({ page }) => {
      test.setTimeout(120_000);
      await deleteClusterFromDetails(page, EXTENSION_NAME, MINIKUBE_CONTAINER, CLUSTER_NAME);
    });
  });
});

test('Ensure Minikube extension can be disabled and enabled', async ({ navigationBar, page }) => {
  await navigationBar.openExtensions();
  await playExpect(extensionsPage.header).toBeVisible();

  const minikubeExtension = await extensionsPage.getInstalledExtension(EXTENSION_NAME, EXTENSION_LABEL);
  await minikubeExtension.disableExtension();
  await playExpect(minikubeExtension.enableButton).toBeEnabled();
  await navigationBar.openSettings();
  const resourcesPage = new ResourcesPage(page);
  await playExpect.poll(async () => resourcesPage.resourceCardIsVisible(EXTENSION_NAME)).toBeFalsy();

  await navigationBar.openExtensions();
  await minikubeExtension.enableExtension();
  await playExpect(minikubeExtension.disableButton).toBeEnabled();
  await navigationBar.openSettings();
  await playExpect.poll(async () => resourcesPage.resourceCardIsVisible(EXTENSION_NAME)).toBeTruthy();
});
test('Uninstall Minikube extension', async ({ navigationBar }) => {
  await navigationBar.openExtensions();
  await playExpect(extensionsPage.header).toBeVisible();
  const minikubeExtension = await extensionsPage.getInstalledExtension(EXTENSION_NAME, EXTENSION_LABEL);
  await minikubeExtension.removeExtension();
});
