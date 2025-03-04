/**********************************************************************
 * Copyright (C) 2023 Red Hat, Inc.
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
import type { CancellationToken, Logger, TelemetryLogger } from '@podman-desktop/api';
import { process as processApi } from '@podman-desktop/api';

import { getMinikubeAdditionalEnvs } from './util';

export async function createCluster(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: { [key: string]: any },
  logger: Logger | undefined,
  minikubeCli: string,
  telemetryLogger: TelemetryLogger,
  token?: CancellationToken,
): Promise<void> {
  const clusterName = params['minikube.cluster.creation.name'] ?? 'minikube';
  const driver = params['minikube.cluster.creation.driver'] ?? 'docker';
  const runtime = params['minikube.cluster.creation.runtime'] ?? 'docker';
  const nodes = params['minikube.cluster.creation.nodes'];
  const baseImage = params['minikube.cluster.creation.base-image'];
  const mountString = params['minikube.cluster.creation.mount-string'];
  const addons = params['minikube.cluster.creation.addons'];

  const startArgs = ['start', '--profile', clusterName, '--driver', driver, '--container-runtime', runtime];

  // add base image parameter
  if (baseImage) {
    startArgs.push('--base-image', baseImage);
  }
  if (mountString) {
    // need to add also the mount option
    startArgs.push('--mount');
    startArgs.push('--mount-string', mountString);
  }
  if (nodes) {
    startArgs.push('--nodes', nodes);
  }
  if (addons) {
    startArgs.push('--install-addons');
    startArgs.push('--addons', addons);
  }

  // now execute the command to create the cluster
  try {
    await processApi.exec(minikubeCli, startArgs, { env: getMinikubeAdditionalEnvs(), logger, token });
    telemetryLogger.logUsage('createCluster', { driver, runtime });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : error;
    telemetryLogger.logError('createCluster', {
      driver,
      runtime,
      error: errorMessage,
      stdErr: errorMessage,
    });
    throw new Error(`Failed to create minikube cluster. ${errorMessage}`);
  }
}
