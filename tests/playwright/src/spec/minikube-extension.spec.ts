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

import { execSync } from 'node:child_process';

import type {
    ContainerInteractiveParams} from '@podman-desktop/tests-playwright';
import { 
    checkClusterResources,
    ContainerState,
    deleteCluster,
    deleteClusterFromDetails,
    deleteContainer,
    deployContainerToCluster,
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

const EXTENSION_IMAGE: string = process.env.EXTENSION_IMAGE ?? 'ghcr.io/podman-desktop/podman-desktop-extension-minikube:nightly';
const EXTENSION_NAME: string = 'minikube';
const EXTENSION_LABEL: string = 'podman-desktop.minikube';
const CLUSTER_NAME: string = 'minikube';
const MINIKUBE_CONTAINER: string = CLUSTER_NAME;
const KUBERNETES_CONTEXT: string = CLUSTER_NAME;
const CLUSTER_CREATION_TIMEOUT: number = 300_000;

const IMAGE_TO_PULL: string = 'ghcr.io/linuxcontainers/alpine';
const IMAGE_TAG: string = 'latest';
const CONTAINER_NAME: string = 'alpine-container';
const DEPLOYED_POD_NAME: string = CONTAINER_NAME;
const CONTAINER_START_PARAMS: ContainerInteractiveParams = {
  attachTerminal: false,
};

let extensionsPage: ExtensionsPage; 
let minikubeResourceCard: ResourceConnectionCardPage; 

const isGHActions = process.env.GITHUB_ACTIONS === 'true';
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

test.afterAll(async ({ page, runner }) => {
  try {
    await deleteContainer(page, CONTAINER_NAME);
    await deleteCluster(page, EXTENSION_NAME, MINIKUBE_CONTAINER, CLUSTER_NAME);
  } 
  finally {
    await terminateMinikube();
    await runner.close();
  }   
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
    test.setTimeout(60_000);

    await navigationBar.openExtensions();
    await playExpect(extensionsPage.header).toBeVisible();
    await playExpect.poll(async () => extensionsPage.extensionIsInstalled(EXTENSION_LABEL), {timeout: 60_000}).toBeTruthy();
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
        await createMinikubeCluster(page, CLUSTER_NAME, false, CLUSTER_CREATION_TIMEOUT, {driver: 'podman'});
      }
    });

    test('Check resources added with the Minikube cluster', async ({ page }) => {
      await checkClusterResources(page, MINIKUBE_CONTAINER);
    });

    test('Deploy a container to the Minikube cluster', async ({ page, navigationBar }) => {
      const imagesPage = await navigationBar.openImages();
      const pullImagePage = await imagesPage.openPullImage();
      await pullImagePage.pullImage(IMAGE_TO_PULL, IMAGE_TAG);
      await playExpect.poll(async () => imagesPage.waitForImageExists(IMAGE_TO_PULL, 10_000)).toBeTruthy();

      const containersPage = await imagesPage.startContainerWithImage(
        IMAGE_TO_PULL,
        CONTAINER_NAME,
        CONTAINER_START_PARAMS,
      );
      await playExpect
        .poll(async () => containersPage.containerExists(CONTAINER_NAME), { timeout: 15_000 })
        .toBeTruthy();

      const containerDetails = await containersPage.openContainersDetails(CONTAINER_NAME);
      await playExpect(containerDetails.heading).toBeVisible();
      await playExpect.poll(async () => containerDetails.getState()).toBe(ContainerState.Running);

      await deployContainerToCluster(page, CONTAINER_NAME, KUBERNETES_CONTEXT, DEPLOYED_POD_NAME);
    });

    test('Minikube cluster operations - STOP', async ({ page }) => {
      await resourceConnectionAction(page, minikubeResourceCard, ResourceElementActions.Stop, ResourceElementState.Off);
    });

    test('Minikube cluster operations - START', async ({ page }) => {
      await resourceConnectionAction(page, minikubeResourceCard, ResourceElementActions.Start, ResourceElementState.Running);
    });

    test.skip('Minikube cluster operations - RESTART', async ({ page }) => {
      // Skipping the test due to an issue with restarting the Minikube cluster.
      await resourceConnectionAction(page, minikubeResourceCard, ResourceElementActions.Restart, ResourceElementState.Running);
    });

    test('Minikube cluster operations - DELETE', async ({ page }) => {
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
      await resourceConnectionActionDetails(
        page,
        minikubeResourceCard,
        CLUSTER_NAME,
        ResourceElementActions.Stop,
        ResourceElementState.Off,
      );
    });

    test('Minikube cluster operations details - START', async ({ page }) => {
      await resourceConnectionActionDetails(
        page,
        minikubeResourceCard,
        CLUSTER_NAME,
        ResourceElementActions.Start,
        ResourceElementState.Running,
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
      await deleteClusterFromDetails(page, EXTENSION_NAME, MINIKUBE_CONTAINER, CLUSTER_NAME);
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
    const extensions = await navigationBar.openExtensions();
    const extensionCard = await extensions.getInstalledExtension(EXTENSION_NAME, EXTENSION_LABEL);
    await extensionCard.disableExtension();
    await extensionCard.removeExtension();
    await playExpect.poll(async () => await extensions.extensionIsInstalled(EXTENSION_LABEL), { timeout: 15000 }).toBeFalsy();
  });
});

async function terminateMinikube() {
  if(isGHActions && isLinux) {
    try{
      // eslint-disable-next-line
      execSync('pkill -o minikube');
    } catch (error: unknown) {
      console.log(`Error while killing the minikube: ${error}`);
    }
  }
}

  