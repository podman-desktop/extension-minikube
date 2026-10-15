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

import { expect as playExpect } from '@playwright/test';
import { checkDeploymentReplicasInfo, checkKubernetesResourceState, createKubernetesResource, deleteCluster, deleteKubernetesResource, deletePod,editDeploymentYamlFile, isLinux, KubernetesResourceDetailsPage, KubernetesResources, KubernetesResourceState, minikubeExtension,test} from '@podman-desktop/tests-playwright';

import { createMinikubeCluster, ensureMinikubeCliInstalled } from '../utility/operations';

const CLUSTER_NAME: string = 'minikube';
const MINIKUBE_NODE: string = CLUSTER_NAME;
const CLUSTER_CREATION_TIMEOUT: number = 300_000;
const DEPLOYMENT_NAME = 'test-deployment-resource';
const PVC_NAME = 'test-pvc-resource';
const PVC_POD_NAME = 'test-pod-pvcs';
const CONFIGMAP_NAME = 'test-configmap-resource';
const SECRET_NAME = 'test-secret-resource';
const SECRET_POD_NAME = 'test-pod-configmaps-secrets';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEPLOYMENT_YAML_PATH = path.resolve(__dirname, '..', '..', 'resources', 'kubernetes', `${DEPLOYMENT_NAME}.yaml`);
const PVC_YAML_PATH = path.resolve(__dirname, '..', '..', 'resources', 'kubernetes', `${PVC_NAME}.yaml`);
const PVC_POD_YAML_PATH = path.resolve(__dirname, '..', '..', 'resources', 'kubernetes', `${PVC_POD_NAME}.yaml`);
const CONFIGMAP_YAML_PATH = path.resolve(__dirname, '..', '..', 'resources', 'kubernetes', `${CONFIGMAP_NAME}.yaml`);
const SECRET_YAML_PATH = path.resolve(__dirname, '..', '..', 'resources', 'kubernetes', `${SECRET_NAME}.yaml`);
const SECRET_POD_YAML_PATH = path.resolve(__dirname, '..', '..', 'resources', 'kubernetes', `${SECRET_POD_NAME}.yaml`);

const EXTENSION_IMAGE: string = process.env.EXTENSION_IMAGE ?? 'ghcr.io/podman-desktop/podman-desktop-extension-minikube:nightly';

const driverGha: string = process.env.MINIKUBE_DRIVER_GHA ?? '';
const useGhaDriver: boolean = !!process.env.GITHUB_ACTIONS && isLinux;

test.setTimeout(90_000);

test.beforeAll(async ({ runner, welcomePage, page, navigationBar }) => {
  test.setTimeout(CLUSTER_CREATION_TIMEOUT * 2);
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
  await ensureMinikubeCliInstalled(page);

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

test.describe('Kubernetes resources End-to-End test', { tag: '@k8s_e2e' }, () => {
  test('Kubernetes Nodes test', async ({ page }) => {
    await checkKubernetesResourceState(page, KubernetesResources.Nodes, MINIKUBE_NODE, KubernetesResourceState.Running);
    await playExpect.poll(async () => new KubernetesResourceDetailsPage(page, MINIKUBE_NODE).getState()).toBe(KubernetesResourceState.Running);
  });
  test.describe.serial('Kubernetes deployment resource E2E Test', () => {
    test('Kubernetes Pods page should be empty', async ({ navigationBar }) => {
      const kubernetesBar = await navigationBar.openKubernetes();
      const kubernetesPodsPage = await kubernetesBar.openTabPage(KubernetesResources.Pods);
  
      await playExpect.poll(async () => kubernetesPodsPage.content.textContent()).toContain('No pods');
    });
    test('Create a Kubernetes deployment resource', async ({ page }) => {
      await createKubernetesResource(
        page,
        KubernetesResources.Deployments,
        DEPLOYMENT_NAME,
        DEPLOYMENT_YAML_PATH,
      );
      await checkKubernetesResourceState(
        page,
        KubernetesResources.Deployments,
        DEPLOYMENT_NAME,
        KubernetesResourceState.Running,
      );
      await checkDeploymentReplicasInfo(page, KubernetesResources.Deployments, DEPLOYMENT_NAME, 3);
      await playExpect(new KubernetesResourceDetailsPage(page, DEPLOYMENT_NAME).heading).toBeVisible();
    });
    test('Edit the Kubernetes deployment YAML file', async ({ page }) => {
      await editDeploymentYamlFile(page, KubernetesResources.Deployments, DEPLOYMENT_NAME);
      await checkKubernetesResourceState(
        page,
        KubernetesResources.Deployments,
        DEPLOYMENT_NAME,
        KubernetesResourceState.Running,
      );
      await checkDeploymentReplicasInfo(page, KubernetesResources.Deployments, DEPLOYMENT_NAME, 5);
      await playExpect(new KubernetesResourceDetailsPage(page, DEPLOYMENT_NAME).heading).toBeVisible();
    });
    test('Delete the Kubernetes deployment resource', async ({ page, navigationBar }) => {
      await deleteKubernetesResource(page, KubernetesResources.Deployments, DEPLOYMENT_NAME);
      const deploymentsPage = await (await navigationBar.openKubernetes()).openTabPage(KubernetesResources.Deployments);
      await playExpect.poll(async () => deploymentsPage.getRowByName(DEPLOYMENT_NAME)).toBeFalsy();
    });
  });
  test.describe
  .serial('PVC lifecycle test', () => {
    test('Create a pod bound to a PVC and verify its in Unknown state', async({page}) => {
      await createKubernetesResource(page, KubernetesResources.Pods, PVC_POD_NAME, PVC_POD_YAML_PATH);
      await checkKubernetesResourceState(
        page,
        KubernetesResources.Pods,
        PVC_POD_NAME,
        KubernetesResourceState.Unknown,
      );
      await playExpect.poll(async () => new KubernetesResourceDetailsPage(page, PVC_POD_NAME).getState()).toBe(KubernetesResourceState.Unknown);
    }); 
    test('Create a PVC and verify the bound pod is in running state', async ({ page }) => {
      await createKubernetesResource(page, KubernetesResources.PVCs, PVC_NAME, PVC_YAML_PATH);
      await checkKubernetesResourceState(page, KubernetesResources.PVCs, PVC_NAME, KubernetesResourceState.Running, 80_000);
      await checkKubernetesResourceState(
        page,
        KubernetesResources.Pods,
        PVC_POD_NAME,
        KubernetesResourceState.Running,
      );
      await playExpect.poll(async () => new KubernetesResourceDetailsPage(page, PVC_POD_NAME).getState()).toBe(KubernetesResourceState.Running);
    });
    test('Delete the PVC resource', async ({ page, navigationBar }) => {
      await deleteKubernetesResource(page, KubernetesResources.Pods, PVC_POD_NAME);
      await deleteKubernetesResource(page, KubernetesResources.PVCs, PVC_NAME);
      const pvcsPage = await (await navigationBar.openKubernetes()).openTabPage(KubernetesResources.PVCs);
      await playExpect.poll(async () => pvcsPage.getRowByName(PVC_NAME)).toBeFalsy();
    });
  });
test.describe
  .serial('ConfigMaps and Secrets lifecycle test', () => {
    test('Create ConfigMap resource', async ({ page }) => {
      await createKubernetesResource(
        page,
        KubernetesResources.ConfigMapsSecrets,
        CONFIGMAP_NAME,
        CONFIGMAP_YAML_PATH,
      );
      await checkKubernetesResourceState(
        page,
        KubernetesResources.ConfigMapsSecrets,
        CONFIGMAP_NAME,
        KubernetesResourceState.Running,
      );
      await playExpect.poll(async () => new KubernetesResourceDetailsPage(page, CONFIGMAP_NAME).getState()).toBe(KubernetesResourceState.Running);
    });
    test('Create Secret resource', async ({ page }) => {
      await createKubernetesResource(page, KubernetesResources.ConfigMapsSecrets, SECRET_NAME, SECRET_YAML_PATH);
      await checkKubernetesResourceState(
        page,
        KubernetesResources.ConfigMapsSecrets,
        SECRET_NAME,
        KubernetesResourceState.Running,
      );
      await playExpect.poll(async () => new KubernetesResourceDetailsPage(page, SECRET_NAME).getState()).toBe(KubernetesResourceState.Running);
    });
    test('Can load config and secrets via env. var in pod', async ({ page }) => {
      await createKubernetesResource(page, KubernetesResources.Pods, SECRET_POD_NAME, SECRET_POD_YAML_PATH);
      await checkKubernetesResourceState(
        page,
        KubernetesResources.Pods,
        SECRET_POD_NAME,
        KubernetesResourceState.Running,
      );
      await playExpect.poll(async () => new KubernetesResourceDetailsPage(page, SECRET_POD_NAME).getState()).toBe(KubernetesResourceState.Running);
    });
    test('Delete the ConfigMap and Secret resources', async ({ page, navigationBar }) => {
      await deletePod(page, SECRET_POD_NAME);
      await deleteKubernetesResource(page, KubernetesResources.ConfigMapsSecrets, SECRET_NAME);
      await deleteKubernetesResource(page, KubernetesResources.ConfigMapsSecrets, CONFIGMAP_NAME);
      const configMapsPage = await (await navigationBar.openKubernetes()).openTabPage(KubernetesResources.ConfigMapsSecrets);
      await playExpect.poll(async () => configMapsPage.getRowByName(CONFIGMAP_NAME)).toBeFalsy();
    });
  });
});
