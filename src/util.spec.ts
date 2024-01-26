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

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as extensionApi from '@podman-desktop/api';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { detectMinikube, getMinikubePath, runCliCommand } from './util';
import * as childProcess from 'node:child_process';
import type { MinikubeInstaller } from './minikube-installer';

vi.mock('node:child_process');

vi.mock('@podman-desktop/api', async () => {
  return {
    window: {
      showInformationMessage: vi.fn().mockReturnValue(Promise.resolve('Yes')),
      showErrorMessage: vi.fn(),
      withProgress: vi.fn(),
      showNotification: vi.fn(),
    },
    env: {
      isMac: vi.fn(),
      isWindows: vi.fn(),
      isLinux: vi.fn(),
    },
    ProgressLocation: {
      APP_ICON: 1,
    },
    Disposable: {
      from: vi.fn(),
    },
  };
});

const originalProcessEnv = process.env;
beforeEach(() => {
  vi.clearAllMocks();
  process.env = {};
});

afterEach(() => {
  process.env = originalProcessEnv;
});

test('getMinikubePath on macOS', async () => {
  vi.mocked(extensionApi.env).isMac = true;

  const computedPath = getMinikubePath();
  expect(computedPath).toEqual('/usr/local/bin:/opt/homebrew/bin:/opt/local/bin:/opt/podman/bin');
});

test('getMinikubePath on macOS with existing PATH', async () => {
  const existingPATH = '/my-existing-path';
  process.env.PATH = existingPATH;
  vi.mocked(extensionApi.env).isMac = true;

  const computedPath = getMinikubePath();
  expect(computedPath).toEqual(`${existingPATH}:/usr/local/bin:/opt/homebrew/bin:/opt/local/bin:/opt/podman/bin`);
});

test.each([
  ['macOS', true, false],
  ['windows', false, true],
])('detectMinikube on %s', async (operatingSystem, isMac, isWindows) => {
  vi.mocked(extensionApi.env).isMac = isMac;
  vi.mocked(extensionApi.env).isWindows = isWindows;

  // spy on runCliCommand
  const spawnSpy = vi.spyOn(childProcess, 'spawn');

  const onEventMock = vi.fn();

  onEventMock.mockImplementation((event: string, callback: (data: string) => void) => {
    // delay execution
    if (event === 'close') {
      setTimeout(() => {
        callback(0 as unknown as string);
      }, 500);
    }
  });

  spawnSpy.mockReturnValue({
    on: onEventMock,
    stdout: { setEncoding: vi.fn(), on: vi.fn() },
    stderr: { setEncoding: vi.fn(), on: vi.fn() },
  } as unknown as childProcess.ChildProcessWithoutNullStreams);

  const fakeMinikubeInstaller = {
    getAssetInfo: vi.fn(),
  } as unknown as MinikubeInstaller;

  const result = await detectMinikube('', fakeMinikubeInstaller);
  expect(result).toEqual('minikube');

  // expect not called getAssetInfo
  expect(fakeMinikubeInstaller.getAssetInfo).not.toBeCalled();

  expect(spawnSpy).toBeCalled();
  // expect right parameters
  if (isMac) {
    expect(spawnSpy.mock.calls[0][0]).toEqual('minikube');
  } else if (isWindows) {
    expect(spawnSpy.mock.calls[0][0]).toEqual('"minikube"');
  }
  expect(spawnSpy.mock.calls[0][1]).toEqual(['version']);
});

test('runCliCommand/killProcess on macOS', async () => {
  vi.mocked(extensionApi.env).isMac = true;
  vi.mocked(extensionApi.env).isWindows = false;

  // spy on runCliCommand
  const spawnSpy = vi.spyOn(childProcess, 'spawn');

  const killMock = vi.fn();

  spawnSpy.mockReturnValue({
    kill: killMock,
    on: vi.fn(),
    stdout: { setEncoding: vi.fn(), on: vi.fn() },
    stderr: { setEncoding: vi.fn(), on: vi.fn() },
  } as unknown as childProcess.ChildProcessWithoutNullStreams);

  const fakeToken = {
    onCancellationRequested: vi.fn(),
  } as unknown as extensionApi.CancellationToken;

  vi.mocked(fakeToken.onCancellationRequested).mockImplementation((callback: any): extensionApi.Disposable => {
    // abort execution after 500ms
    setTimeout(() => {
      callback();
    }, 500);

    return extensionApi.Disposable.from({ dispose: vi.fn() });
  });

  await expect(runCliCommand('fooCommand', [], undefined, fakeToken)).rejects.toThrow('Execution cancelled');

  expect(spawnSpy.mock.calls[0][0]).toEqual('fooCommand');

  expect(killMock).toBeCalled();
});

test.only('runCliCommand/killProcess on Windows', async () => {
  vi.mocked(extensionApi.env).isMac = false;
  vi.mocked(extensionApi.env).isWindows = true;

  // spy on runCliCommand
  const spawnSpy = vi.spyOn(childProcess, 'spawn');

  const killMock = vi.fn();

  spawnSpy.mockReturnValue({
    kill: killMock,
    pid: 'pid123',
    on: vi.fn(),
    stdout: { setEncoding: vi.fn(), on: vi.fn() },
    stderr: { setEncoding: vi.fn(), on: vi.fn() },
  } as unknown as childProcess.ChildProcessWithoutNullStreams);

  const fakeToken = {
    onCancellationRequested: vi.fn(),
  } as unknown as extensionApi.CancellationToken;

  vi.mocked(fakeToken.onCancellationRequested).mockImplementation((callback: any): extensionApi.Disposable => {
    // abort execution after 500ms
    setTimeout(() => {
      callback();
    }, 500);

    return extensionApi.Disposable.from({ dispose: vi.fn() });
  });

  await expect(runCliCommand('fooCommand', [], undefined, fakeToken)).rejects.toThrow('Execution cancelled');

  expect(spawnSpy.mock.calls[0][0]).toEqual('"fooCommand"');
  // on windows we don't use killProcess but run taskkill
  expect(killMock).not.toBeCalled();

  expect(spawnSpy.mock.calls[1]).toEqual(['taskkill', ['/pid', 'pid123', '/f', '/t']]);
});
