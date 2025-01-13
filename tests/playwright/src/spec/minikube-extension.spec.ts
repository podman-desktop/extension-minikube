/**********************************************************************
 * Copyright (C) 2024 Red Hat, Inc.
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
    ensureCliInstalled,
    expect as playExpect, 
    ExtensionsPage,  
    isLinux,
    ResourcesPage,  
    RunnerOptions,
    test,
    checkClusterResources,
    resourceConnectionAction,
    deleteCluster,
    ResourceConnectionCardPage,
    ResourceElementActions,
    ResourceElementState,
    NavigationBar,
    StatusBar,
} from '@podman-desktop/tests-playwright';
import { CreateMinikubeClusterPage } from '../model/pages/minikube-cluster-creation-page';
import { Page } from '@playwright/test';
import { MinikubeClusterOptions } from '../model/core/types';

const EXTENSION_IMAGE: string = 'ghcr.io/podman-desktop/podman-desktop-extension-minikube:nightly';
const EXTENSION_NAME: string = 'minikube';
const EXTENSION_LABEL: string = 'podman-desktop.minikube';
const CLUSTER_NAME: string = 'minikube';
const MINIKUBE_CONTAINER: string = 'minikube'
const CLUSTER_CREATION_TIMEOUT: number = 300_000;

let extensionsPage: ExtensionsPage; 
let minikubeResourceCard: ResourceConnectionCardPage; 

const skipExtensionInstallation = process.env.SKIP_EXTENSION_INSTALL === 'true';


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
    await runner.close();   
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
        await playExpect(minikubeExtension.status).toHaveText('ACTIVE', {timeout: 40_000});
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

    test.describe('Minikube cluster e2e test', async () => {
        test('Create a Minikube cluster', async ({ page}) => {
            test.setTimeout(CLUSTER_CREATION_TIMEOUT);
            await createMinikubeCluster(page, CLUSTER_NAME, true, CLUSTER_CREATION_TIMEOUT);
          });
      
          test('Check resources added with the Minikube cluster', async ({ page }) => {
            await checkClusterResources(page, MINIKUBE_CONTAINER);
          });
      
          test('Minikube cluster operations - STOP', async ({ page }) => {
            await resourceConnectionAction(page, minikubeResourceCard, ResourceElementActions.Stop, ResourceElementState.Off);
          });
      
          test('Minikube cluster operations - START', async ({ page }) => {
            await resourceConnectionAction(
              page,
              minikubeResourceCard,
              ResourceElementActions.Start,
              ResourceElementState.Running,
            );
          });
      
          test('Minikube cluster operatioms - RESTART', async ({ page }) => {
            await resourceConnectionAction(
              page,
              minikubeResourceCard,
              ResourceElementActions.Restart,
              ResourceElementState.Running,
            );
          });
      
          test('Minikube cluster operations - DELETE', async ({ page }) => {
            await deleteCluster(page, EXTENSION_NAME, MINIKUBE_CONTAINER, CLUSTER_NAME);
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
});

async function createMinikubeCluster(page: Page, clusterName: string = 'minikube', usedefaultOptions: boolean = true, timeout: number = 300_000, { driver, containerRuntime, baseImage, mountDefinition }: MinikubeClusterOptions = {}) {
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

