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

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkDeploymentReplicasInfo, checkKubernetesResourceState, createKubernetesResource, deleteCluster, deleteKubernetesResource, editDeploymentYamlFile, ensureCliInstalled, expect as playExpect, isLinux, KubernetesResources, KubernetesResourceState, minikubeExtension,PlayYamlRuntime,test} from '@podman-desktop/tests-playwright';

import { createMinikubeCluster} from '../utility/operations';

const CLUSTER_NAME: string = 'minikube';
const MINIKUBE_NODE: string = CLUSTER_NAME;
const CLUSTER_CREATION_TIMEOUT: number = 300_000;
const KUBERNETES_CONTEXT = 'minikube';
const KUBERNETES_NAMESPACE = 'default';
const DEPLOYMENT_NAME = 'test-deployment-resource';
const KUBERNETES_RUNTIME = {
  runtime: PlayYamlRuntime.Kubernetes,
  kubernetesContext: KUBERNETES_CONTEXT,
  kubernetesNamespace: KUBERNETES_NAMESPACE,
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEPLOYMENT_YAML_PATH = path.resolve(__dirname, '..', '..', 'resources', 'kubernetes', `${DEPLOYMENT_NAME}.yaml`);

const EXTENSION_IMAGE: string = process.env.EXTENSION_IMAGE ?? 'ghcr.io/podman-desktop/podman-desktop-extension-minikube:nightly';

const driverGha: string = process.env.MINIKUBE_DRIVER_GHA ?? '';
const useGhaDriver: boolean = !!process.env.GITHUB_ACTIONS && isLinux;

test.beforeAll(async ({ runner, welcomePage, page, navigationBar }) => {
  test.setTimeout(CLUSTER_CREATION_TIMEOUT);
  runner.setVideoAndTraceName('minikube-kubernetes-e2e');
  await welcomePage.handleWelcomePage(true);

  // Install minikube extension
  const extensionsPage = await navigationBar.openExtensions();
  await playExpect(extensionsPage.header).toBeVisible();
  await playExpect.poll(async () => extensionsPage.extensionIsInstalled(minikubeExtension.extensionFullLabel)).toBeFalsy();
  await extensionsPage.openCatalogTab();
  await extensionsPage.installExtensionFromOCIImage(EXTENSION_IMAGE);

  const settingsBar = await navigationBar.openSettings();
  await settingsBar.cliToolsTab.click();
  await ensureCliInstalled(page, 'Minikube');

  if (useGhaDriver) {
    await createMinikubeCluster(page, CLUSTER_NAME, false, CLUSTER_CREATION_TIMEOUT, {driver: driverGha});
  } else {
    await createMinikubeCluster(page, CLUSTER_NAME, true, CLUSTER_CREATION_TIMEOUT);
  }
});

test.afterAll(async ({ navigationBar, runner, page }) => {
  try {
    await deleteCluster(page, minikubeExtension.extensionName, MINIKUBE_NODE, CLUSTER_NAME);
    //Delete minikube extension
    const extensionsPage = await navigationBar.openExtensions();
    await playExpect(extensionsPage.header).toBeVisible();
    const minikubeExtensionCard = await extensionsPage.getInstalledExtension(minikubeExtension.extensionName, minikubeExtension.extensionFullLabel);
    await minikubeExtensionCard.removeExtension();
  } finally {
    await runner.close();
  }
});

test.describe.serial('Kubernetes resources End-to-End test', { tag: '@k8s_e2e' }, () => {
  test('Kubernetes Nodes test', async ({ page }) => {
    await checkKubernetesResourceState(page, KubernetesResources.Nodes, MINIKUBE_NODE, KubernetesResourceState.Running);
  });
  test.describe.serial('Kubernetes deployment resource E2E Test', () => {
    test('Kubernetes Pods page should be empty', async ({ navigationBar }) => {
      const kubernetesBar = await navigationBar.openKubernetes();
      const kubernetesPodsPage = await kubernetesBar.openTabPage(KubernetesResources.Pods);
  
      await playExpect.poll(async () => kubernetesPodsPage.content.textContent()).toContain('No pods');
    });
    test('Create a Kubernetes deployment resource', async ({ page }) => {
      test.setTimeout(80_000);
      await createKubernetesResource(
        page,
        KubernetesResources.Deployments,
        DEPLOYMENT_NAME,
        DEPLOYMENT_YAML_PATH,
        KUBERNETES_RUNTIME,
      );
      await checkDeploymentReplicasInfo(page, KubernetesResources.Deployments, DEPLOYMENT_NAME, 3);
      await checkKubernetesResourceState(
        page,
        KubernetesResources.Deployments,
        DEPLOYMENT_NAME,
        KubernetesResourceState.Running,
        80_000,
      );
    });
    test('Edit the Kubernetes deployment YAML file', async ({ page }) => {
      test.setTimeout(120_000);
      await editDeploymentYamlFile(page, KubernetesResources.Deployments, DEPLOYMENT_NAME);
      await checkDeploymentReplicasInfo(page, KubernetesResources.Deployments, DEPLOYMENT_NAME, 5);
      await checkKubernetesResourceState(
        page,
        KubernetesResources.Deployments,
        DEPLOYMENT_NAME,
        KubernetesResourceState.Running,
        80_000,
      );
    });
    test('Delete the Kubernetes deployment resource', async ({ page }) => {
      await deleteKubernetesResource(page, KubernetesResources.Deployments, DEPLOYMENT_NAME);
    });
  });
});
