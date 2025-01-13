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

import test, { expect as playExpect, type Locator, type Page } from '@playwright/test';
import { CreateClusterBasePage, fillTextbox } from '@podman-desktop/tests-playwright';
import { MinikubeClusterOptions } from '../core/types';

export class CreateMinikubeClusterPage extends CreateClusterBasePage {
  readonly clusterNameField: Locator;
  readonly driverCombobox: Locator;
  readonly containerRuntime: Locator; 
  readonly baseImage: Locator; 
  readonly mountDefinition: Locator;

  constructor(page: Page) {
    super(page);
    this.clusterNameField = this.clusterPropertiesInformation.getByRole('textbox', { name: 'Name', exact: true });
    this.driverCombobox = this.clusterPropertiesInformation.getByLabel('Driver');
    this.containerRuntime = this.clusterPropertiesInformation.getByLabel('Container Runtime');
    this.baseImage = this.clusterPropertiesInformation.locator('#input-standard-minikube\\.cluster\\.creation\\.base-image');
    this.mountDefinition = this.clusterPropertiesInformation.locator('#input-standard-minikube\\.cluster\\.creation\\.mount-string');
  }

  public async createMinikubeClusterDefault(clusterName: string = 'minikube', timeout?: number): Promise<void> {
    return test.step('Create default cluster', async () => {
      await fillTextbox(this.clusterNameField, clusterName);
      await playExpect(this.driverCombobox).toContainText('podman');
      await playExpect(this.containerRuntime).toContainText('cri-o');
      await playExpect(this.baseImage).toBeEmpty();
      await playExpect(this.mountDefinition).toBeEmpty();
      await this.createCluster(timeout);
    });
  }

  public async createMinikubeClusterParametrized(clusterName: string, {driver, containerRuntime, baseImage, mountDefinition}: MinikubeClusterOptions, timeout?: number): Promise<void> {
    return test.step('Create parametrized cluster', async () => {
      await fillTextbox(this.clusterNameField, clusterName);

      if (driver) {
        await playExpect(this.driverCombobox).toBeVisible();
        const providerTypeOptions = await this.driverCombobox.locator('option').allInnerTexts();
        if (providerTypeOptions.includes(driver)) {
          await this.driverCombobox.selectOption({ value: driver });
          await playExpect(this.driverCombobox).toHaveValue(driver);
        } else {
          throw new Error(`${driver} doesn't exist`);
        }
      }

      if (containerRuntime) {
        await playExpect(this.driverCombobox).toBeVisible();
        const providerTypeOptions = await this.driverCombobox.locator('option').allInnerTexts();
        if (providerTypeOptions.includes(containerRuntime)) {
          await this.driverCombobox.selectOption({ value: containerRuntime });
          await playExpect(this.driverCombobox).toHaveValue(containerRuntime);
        } else {
          throw new Error(`${containerRuntime} doesn't exist`);
        }
      }

      if (baseImage) {
        await fillTextbox(this.baseImage, baseImage);
      }

      if (mountDefinition) {
        await fillTextbox(this.mountDefinition, mountDefinition);
      }
      await this.createCluster(timeout);
    });
  }
}
