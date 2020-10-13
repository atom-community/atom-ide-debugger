/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 * @format
 */

import type {
  DebuggerConfigAction,
  DebuggerLaunchAttachProvider,
  NuclideDebuggerProvider,
  DebuggerConfigurationProvider,
} from '@atom-ide-community/nuclide-debugger-common';
import type {
  ConsoleService,
  DatatipProvider,
  DatatipService,
  RegisterExecutorFunction,
  TerminalApi,
} from 'atom-ide-ui';
import type {NuclideUri} from '@atom-ide-community/nuclide-commons/nuclideUri';
import type {SerializedState, IBreakpoint} from './types';

import idx from 'idx';
import {observeRemovedHostnames} from '@atom-ide-community/nuclide-commons-atom/projects';
import BreakpointManager from './BreakpointManager';
import {AnalyticsEvents, DebuggerMode} from './constants';
import BreakpointConfigComponent from './ui/BreakpointConfigComponent';
import {getLineForEvent} from './utils';
import UniversalDisposable from '@atom-ide-community/nuclide-commons/UniversalDisposable';
import invariant from 'assert';
import {track} from '@atom-ide-community/nuclide-commons/analytics';
import RemoteControlService from './RemoteControlService';
import DebuggerUiModel from './DebuggerUiModel';
import DebugService from './vsp/DebugService';
import {debuggerDatatip} from './DebuggerDatatip';
import * as React from 'react';
import ReactDOM from 'react-dom';
import DebuggerLaunchAttachUI from './ui/DebuggerLaunchAttachUI';
import {renderReactRoot} from '@atom-ide-community/nuclide-commons-ui/renderReactRoot';
import nuclideUri from '@atom-ide-community/nuclide-commons/nuclideUri';
import {
  setNotificationService,
  setConsoleService,
  setConsoleRegisterExecutor,
  setDatatipService,
  setTerminalService,
  setRpcService,
  addDebugConfigurationProvider,
} from './AtomServiceContainer';
import {wordAtPosition, trimRange} from '@atom-ide-community/nuclide-commons-atom/range';
import DebuggerLayoutManager from './ui/DebuggerLayoutManager';
import DebuggerPaneViewModel from './ui/DebuggerPaneViewModel';
import DebuggerPaneContainerViewModel from './ui/DebuggerPaneContainerViewModel';
import os from 'os';
import nullthrows from 'nullthrows';
import ReactMountRootElement from '@atom-ide-community/nuclide-commons-ui/ReactMountRootElement';
import {sortMenuGroups} from '@atom-ide-community/nuclide-commons/menuUtils';
import passesGK from '@atom-ide-community/nuclide-commons/passesGK';

const DATATIP_PACKAGE_NAME = 'debugger-datatip';

type LaunchAttachDialogArgs = {
  dialogMode: DebuggerConfigAction,
  selectedTabName?: string,
  config?: {[string]: mixed},
};

let _disposables: UniversalDisposable;
let _uiModel: DebuggerUiModel;
let _breakpointManager: BreakpointManager;
let _service: DebugService;
let _layoutManager: DebuggerLayoutManager;
let _selectedDebugConnection: ?string;
let _visibleLaunchAttachDialogMode: ?DebuggerConfigAction;
let _lauchAttachDialogCloser: ?() => void;
let _connectionProviders: Map<string, Array<DebuggerLaunchAttachProvider>>;

export function activate(state: ?SerializedState) {
    atom.views.addViewProvider(DebuggerPaneViewModel, createDebuggerView);
    atom.views.addViewProvider(
      DebuggerPaneContainerViewModel,
      createDebuggerView,
    );
    _service = new DebugService(state);
    _uiModel = new DebuggerUiModel(_service);
    _breakpointManager = new BreakpointManager(_service);
    _selectedDebugConnection = null;
    _visibleLaunchAttachDialogMode = null;
    _lauchAttachDialogCloser = null;
    _connectionProviders = new Map();
    _layoutManager = new DebuggerLayoutManager(_service, state);

    // Manually manipulate the `Debugger` top level menu order.
    const insertIndex = atom.menu.template.findIndex(
      item => item.role === 'window' || item.role === 'help',
    );
    if (insertIndex !== -1) {
      const deuggerIndex = atom.menu.template.findIndex(
        item => item.label === 'Debugger',
      );
      const menuItem = atom.menu.template.splice(deuggerIndex, 1)[0];
      const newIndex =
        insertIndex > deuggerIndex ? insertIndex - 1 : insertIndex;
      atom.menu.template.splice(newIndex, 0, menuItem);
      atom.menu.update();
    }

    const removedHostnames = observeRemovedHostnames();

    _disposables = new UniversalDisposable(
      _layoutManager,
      _service,
      _uiModel,
      _breakpointManager,
      removedHostnames.subscribe(hostname => {
        _service
          .getModel()
          .getProcesses()
          .forEach(debuggerProcess => {
            const debuggeeTargetUri = debuggerProcess.configuration.targetUri;
            if (nuclideUri.isLocal(debuggeeTargetUri)) {
              return; // Nothing to do if our debug session is local.
            }
            if (nuclideUri.getHostname(debuggeeTargetUri) === hostname) {
              _service.stopProcess(debuggerProcess);
            }
          });
      }),
      _uiModel.onConnectionsUpdated(() => {
        const newConnections = _uiModel.getConnections();
        const keys = Array.from(_connectionProviders.keys());

        const removedConnections = keys.filter(
          connection =>
            newConnections.find(item => item === connection) == null,
        );
        const addedConnections = newConnections.filter(
          connection => keys.find(item => item === connection) == null,
        );

        for (const key of removedConnections) {
          _connectionProviders.delete(key);
        }

        for (const connection of addedConnections) {
          _setProvidersForConnection(connection);
        }
      }),
      _uiModel.onProvidersUpdated(() => {
        const connections = _uiModel.getConnections();
        for (const connection of connections) {
          _setProvidersForConnection(connection);
        }
      }),
      // Commands.
      atom.commands.add('atom-workspace', {
        'debugger:show-attach-dialog': event => {
          const selectedTabName: any = idx(
            event,
            _ => _.detail.selectedTabName,
          );
          const config: any = idx(event, _ => _.detail.config);
          _showLaunchAttachDialog({
            dialogMode: 'attach',
            selectedTabName,
            config,
          });
        },
      }),
      atom.commands.add('atom-workspace', {
        'debugger:show-launch-dialog': event => {
          const selectedTabName: any = event?.detail?.selectedTabName;
          const config: any = event?.detail?.config;
          _showLaunchAttachDialog({
            dialogMode: 'launch',
            selectedTabName,
            config,
          });
        },
      }),
      atom.commands.add('atom-workspace', {
        'debugger:continue-debugging': _continue.bind(this),
      }),
      atom.commands.add('atom-workspace', {
        'debugger:stop-debugging': _stop.bind(this),
      }),
      atom.commands.add('atom-workspace', {
        'debugger:restart-debugging': _restart.bind(this),
      }),
      atom.commands.add('atom-workspace', {
        'debugger:step-over': _stepOver.bind(this),
      }),
      atom.commands.add('atom-workspace', {
        'debugger:step-into': _stepInto.bind(this),
      }),
      atom.commands.add('atom-workspace', {
        'debugger:step-out': _stepOut.bind(this),
      }),
      atom.commands.add('atom-workspace', {
        // eslint-disable-next-line nuclide-internal/atom-apis
        'debugger:add-breakpoint': _addBreakpoint.bind(this),
      }),
      atom.commands.add('atom-workspace', {
        'debugger:toggle-breakpoint': _toggleBreakpoint.bind(this),
      }),
      atom.commands.add('atom-workspace', {
        'debugger:toggle-breakpoint-enabled': _toggleBreakpointEnabled.bind(
          this,
        ),
      }),
      atom.commands.add('atom-workspace', {
        // eslint-disable-next-line nuclide-internal/atom-apis
        'debugger:edit-breakpoint': _configureBreakpoint.bind(this),
      }),
      atom.commands.add('.debugger-thread-list-item', {
        'debugger:terminate-thread': _terminateThread.bind(this),
      }),
      atom.commands.add('atom-workspace', {
        'debugger:remove-all-breakpoints': _deleteAllBreakpoints.bind(
          this,
        ),
      }),
      atom.commands.add('atom-workspace', {
        'debugger:enable-all-breakpoints': _enableAllBreakpoints.bind(
          this,
        ),
      }),
      atom.commands.add('atom-workspace', {
        'debugger:disable-all-breakpoints': _disableAllBreakpoints.bind(
          this,
        ),
      }),
      atom.commands.add('atom-workspace', {
        'debugger:remove-breakpoint': _deleteBreakpoint.bind(this),
      }),
      atom.commands.add('atom-workspace', {
        // eslint-disable-next-line nuclide-internal/atom-apis
        'debugger:add-to-watch': _addToWatch.bind(this),
      }),
      atom.commands.add('atom-workspace', {
        'debugger:run-to-location': _runToLocation.bind(this),
      }),
      atom.commands.add('.debugger-expression-value-list', {
        'debugger:copy-debugger-expression-value': _copyDebuggerExpressionValue.bind(
          this,
        ),
      }),
      atom.commands.add('atom-workspace', {
        'debugger:copy-debugger-callstack': _copyDebuggerCallstack.bind(
          this,
        ),
      }),
      // Context Menu Items.
      atom.contextMenu.add({
        '.debugger-breakpoint-list': [
          {
            label: 'Enable All Breakpoints',
            command: 'debugger:enable-all-breakpoints',
          },
          {
            label: 'Disable All Breakpoints',
            command: 'debugger:disable-all-breakpoints',
          },
          {
            label: 'Remove All Breakpoints',
            command: 'debugger:remove-all-breakpoints',
          },
          {type: 'separator'},
        ],
        '.debugger-breakpoint': [
          {
            label: 'Edit breakpoint...',
            command: 'debugger:edit-breakpoint',
            shouldDisplay: event => {
              const bp = _getBreakpointFromEvent(event);
              return bp != null && _supportsConditionalBreakpoints();
            },
          },
          {
            label: 'Remove Breakpoint',
            command: 'debugger:remove-breakpoint',
          },
          {type: 'separator'},
        ],
        '.debugger-thread-list-item': [
          {
            label: 'Terminate thread',
            command: 'debugger:terminate-thread',
            shouldDisplay: event => {
              const target: HTMLElement = event.target;
              if (target.dataset.threadid) {
                const threadId = parseInt(target.dataset.threadid, 10);
                if (!Number.isNaN(threadId)) {
                  return (
                    _supportsTerminateThreadsRequest() &&
                    !_isReadOnlyTarget()
                  );
                }
              }
              return false;
            },
          },
        ],
        '.debugger-callstack-table': [
          {
            label: 'Copy Callstack',
            command: 'debugger:copy-debugger-callstack',
          },
        ],
        '.debugger-expression-value-list': [
          {
            label: 'Copy',
            command: 'debugger:copy-debugger-expression-value',
          },
        ],
        'atom-text-editor': [
          {type: 'separator'},
          {
            label: 'Debugger',
            submenu: [
              {
                label: 'Toggle Breakpoint',
                command: 'debugger:toggle-breakpoint',
              },
              {
                label: 'Toggle Breakpoint enabled/disabled',
                command: 'debugger:toggle-breakpoint-enabled',
                shouldDisplay: event =>
                  _executeWithEditorPath(
                    event,
                    (filePath, line) =>
                      _service
                        .getModel()
                        .getBreakpointAtLine(filePath, line) != null,
                  ) || false,
              },
              {
                label: 'Edit Breakpoint...',
                command: 'debugger:edit-breakpoint',
                shouldDisplay: event =>
                  _executeWithEditorPath(event, (filePath, line) => {
                    const bp = _service
                      .getModel()
                      .getBreakpointAtLine(filePath, line);
                    return bp != null && _supportsConditionalBreakpoints();
                  }) || false,
              },
              {
                label: 'Add to Watch',
                command: 'debugger:add-to-watch',
                shouldDisplay: event => {
                  const textEditor = atom.workspace.getActiveTextEditor();
                  if (
                    _service.getDebuggerMode() === DebuggerMode.STOPPED ||
                    textEditor == null
                  ) {
                    return false;
                  }
                  return (
                    textEditor.getSelections().length === 1 &&
                    !textEditor.getSelectedBufferRange().isEmpty()
                  );
                },
              },
              {
                label: 'Run to Location',
                command: 'debugger:run-to-location',
                shouldDisplay: event =>
                  _service.getDebuggerMode() === DebuggerMode.PAUSED &&
                  !_isReadOnlyTarget(),
              },
            ],
          },
          {type: 'separator'},
        ],
      }),
      _registerCommandsContextMenuAndOpener(),
    );

    sortMenuGroups(['Debugger']);
}

function _supportsConditionalBreakpoints(): boolean {
    // If currently debugging, return whether or not the current debugger supports
    const {focusedProcess} = _service.viewModel;
    if (focusedProcess == null) {
      // If not currently debugging, return if any of the debuggers that support
      // the file extension this bp is in support conditions.
      // TODO(ericblue): have providers register their file extensions and filter correctly here.
      return true;
    } else {
      return Boolean(
        focusedProcess.session.capabilities.supportsConditionalBreakpoints,
      );
    }
}

function _supportsTerminateThreadsRequest(): boolean {
    // If currently debugging, return whether or not the current debugger supports
    const {focusedProcess} = _service.viewModel;
    if (focusedProcess == null) {
      return false;
    } else {
      return Boolean(
        focusedProcess.session.capabilities.supportsTerminateThreadsRequest,
      );
    }
}

function _setProvidersForConnection(connection: NuclideUri): void {
    const key = nuclideUri.isRemote(connection)
      ? nuclideUri.getHostname(connection)
      : 'local';
    const availableProviders = _uiModel.getLaunchAttachProvidersForConnection(
      connection,
    );
    _connectionProviders.set(key, availableProviders);
}

async function _getSuggestions(
    request: atom$AutocompleteRequest,
  ): Promise<?Array<atom$AutocompleteSuggestion>> {
    let text = request.editor.getText();
    const lines = text.split('\n');
    const {row} = request.bufferPosition;
    // Only keep the lines up to and including the buffer position row.
    text = lines.slice(0, row + 1).join('\n');
    const {focusedStackFrame, focusedProcess} = _service.viewModel;
    if (
      focusedProcess == null ||
      focusedStackFrame == null ||
      !Boolean(focusedProcess.session.capabilities.supportsCompletionsRequest)
    ) {
      return [];
    } else {
      const completions = await focusedProcess.completions(
        focusedStackFrame.frameId,
        text,
        request.bufferPosition,
        0,
      );
      return completions.map(item => ({
        displayText: item.label,
        text: item.text == null ? item.label : item.text,
        type: item.type,
      }));
    }
}

export function serialize(): SerializedState {
    const model = _service.getModel();
    const state = {
      sourceBreakpoints: model.getBreakpoints(),
      functionBreakpoints: model.getFunctionBreakpoints(),
      exceptionBreakpoints: model.getExceptionBreakpoints(),
      watchExpressions: model.getWatchExpressions().map(e => e.name),
      showDebugger: _layoutManager.isDebuggerVisible(),
      workspaceDocksVisibility: _layoutManager.getWorkspaceDocksVisibility(),
    };
    return state;
}

export function deactivate() {
    _disposables.dispose();
}

function _registerCommandsContextMenuAndOpener(): UniversalDisposable {
    const disposable = new UniversalDisposable(
      atom.workspace.addOpener(uri => {
        return _layoutManager.getModelForDebuggerUri(uri);
      }),
      () => {
        _layoutManager.hideDebuggerViews(false);
      },
      atom.commands.add('atom-workspace', {
        'debugger:show': event => {
          const detail = event.detail;
          const show =
            detail == null ||
            Boolean(detail.showOnlyIfHidden) === false ||
            !_layoutManager.isDebuggerVisible();
          if (show) {
            _layoutManager.showDebuggerViews();
          }
        },
      }),
      atom.commands.add('atom-workspace', {
        'debugger:hide': () => {
          _layoutManager.hideDebuggerViews(false);
          for (const process of _service.getModel().getProcesses()) {
            _service.stopProcess(process);
          }
        },
      }),
      atom.commands.add('atom-workspace', 'debugger:toggle', () => {
        if (_layoutManager.isDebuggerVisible() === true) {
          atom.commands.dispatch(
            atom.views.getView(atom.workspace),
            'debugger:hide',
          );
        } else {
          atom.commands.dispatch(
            atom.views.getView(atom.workspace),
            'debugger:show',
          );
        }
      }),
      _service.onDidChangeProcessMode(() =>
        _layoutManager.debuggerModeChanged(),
      ),
      _service.viewModel.onDidChangeDebuggerFocus(() =>
        _layoutManager.debuggerModeChanged(),
      ),
      atom.commands.add('atom-workspace', {
        'debugger:reset-layout': () => {
          _layoutManager.resetLayout();
        },
      }),
      atom.contextMenu.add({
        '.debugger-container': [
          {
            label: 'Debugger Views',
            submenu: [
              {
                label: 'Reset Layout',
                command: 'debugger:reset-layout',
              },
            ],
          },
        ],
      }),
    );
    return disposable;
}

function _isReadOnlyTarget(): boolean {
    const {focusedProcess} = _service.viewModel;
    return (
      focusedProcess != null && Boolean(focusedProcess.configuration.isReadOnly)
    );
}

function _continue() {
    if (_isReadOnlyTarget()) {
      return;
    }
    const {focusedThread} = _service.viewModel;
    if (focusedThread != null) {
      track(AnalyticsEvents.DEBUGGER_STEP_CONTINUE);
      focusedThread.continue();
    }
}

function _stop() {
    const {focusedProcess} = _service.viewModel;
    if (focusedProcess) {
      _service.stopProcess(focusedProcess);
    }
}

function _restart() {
    if (_isReadOnlyTarget()) {
      return;
    }
    const {focusedProcess} = _service.viewModel;
    if (focusedProcess) {
      _service.restartProcess(focusedProcess);
    }
}

function _stepOver() {
    if (_isReadOnlyTarget()) {
      return;
    }
    const {focusedThread} = _service.viewModel;
    if (focusedThread != null) {
      track(AnalyticsEvents.DEBUGGER_STEP_OVER);
      focusedThread.next();
    }
}

function _stepInto() {
    if (_isReadOnlyTarget()) {
      return;
    }
    const {focusedThread} = _service.viewModel;
    if (focusedThread != null) {
      track(AnalyticsEvents.DEBUGGER_STEP_INTO);
      focusedThread.stepIn();
    }
}

function _stepOut() {
    if (_isReadOnlyTarget()) {
      return;
    }
    const {focusedThread} = _service.viewModel;
    if (focusedThread != null) {
      track(AnalyticsEvents.DEBUGGER_STEP_OUT);
      focusedThread.stepOut();
    }
}

function _addBreakpoint(event: any) {
    return _executeWithEditorPath(event, (filePath, lineNumber) => {
      _service.addSourceBreakpoint(filePath, lineNumber);
    });
}

function _toggleBreakpoint(event: any) {
    return _executeWithEditorPath(event, (filePath, lineNumber) => {
      _service.toggleSourceBreakpoint(filePath, lineNumber);
    });
}

function _toggleBreakpointEnabled(event: any) {
    _executeWithEditorPath(event, (filePath, line) => {
      const bp = _service.getModel().getBreakpointAtLine(filePath, line);

      if (bp != null) {
        _service.enableOrDisableBreakpoints(!bp.enabled, bp);
      }
    });
}

function _getBreakpointFromEvent(event: any): ?IBreakpoint {
    const target: HTMLElement = event.target;
    let bp = null;
    if (target != null && target.dataset != null) {
      if (target.dataset.bpId != null) {
        const bpId = target.dataset.bpId;
        bp = _service.getModel().getBreakpointById(bpId);
      }

      if (bp == null) {
        const path = target.dataset.path;
        const line = parseInt(target.dataset.line, 10);
        if (path != null && line != null) {
          bp = _service.getModel().getBreakpointAtLine(path, line);
        }
      }
    }

    return bp;
}

function _configureBreakpoint(event: any) {
    const bp = _getBreakpointFromEvent(event);
    if (bp != null && _supportsConditionalBreakpoints()) {
      // Open the configuration dialog.
      const container = new ReactMountRootElement();
      ReactDOM.render(
        <BreakpointConfigComponent
          breakpoint={bp}
          service={_service}
          onDismiss={() => {
            ReactDOM.unmountComponentAtNode(container);
          }}
          allowLogMessage={passesGK('nuclide_debugger_logging_breakpoints')}
        />,
        container,
      );
    }
}

function _terminateThread(event: any) {
    if (_isReadOnlyTarget()) {
      return;
    }
    const target: HTMLElement = event.target;
    if (target.dataset.threadid) {
      const threadId = parseInt(target.dataset.threadid, 10);
      if (!Number.isNaN(threadId) && _supportsTerminateThreadsRequest()) {
        _service.terminateThreads([threadId]);
      }
    }
}

function _executeWithEditorPath<T>(
    event: any,
    fn: (filePath: string, line: number) => T,
  ): ?T {
    const editor = atom.workspace.getActiveTextEditor();
    if (!editor || !editor.getPath()) {
      return null;
    }

    const line = getLineForEvent(editor, event) + 1;
    return fn(nullthrows(editor.getPath()), line);
}

function _deleteBreakpoint(event: any): void {
    const breakpoint = _getBreakpointFromEvent(event);
    if (breakpoint != null) {
      _service.removeBreakpoints(breakpoint.getId());
    }
}

function _deleteAllBreakpoints(): void {
    _service.removeBreakpoints();
}

function _enableAllBreakpoints(): void {
    _service.enableOrDisableBreakpoints(true);
}

function _disableAllBreakpoints(): void {
    _service.enableOrDisableBreakpoints(false);
}

function _renderConfigDialog(
    panel: atom$Panel,
    args: LaunchAttachDialogArgs,
    dialogCloser: () => void,
  ): void {
    if (_selectedDebugConnection == null) {
      // If no connection is selected yet, default to the local connection.
      _selectedDebugConnection = 'local';
    }

    invariant(_selectedDebugConnection != null);

    const options = _uiModel
      .getConnections()
      .map(connection => {
        const displayName = nuclideUri.isRemote(connection)
          ? nuclideUri.getHostname(connection)
          : 'localhost';
        return {
          value: connection,
          label: displayName,
        };
      })
      .filter(item => item.value != null && item.value !== '')
      .sort((a, b) => a.label.localeCompare(b.label));

    // flowlint-next-line sketchy-null-string:off
    const connection = _selectedDebugConnection || 'local';

    ReactDOM.render(
      <DebuggerLaunchAttachUI
        dialogMode={args.dialogMode}
        initialSelectedTabName={args.selectedTabName}
        initialProviderConfig={args.config}
        connectionChanged={(newValue: ?string) => {
          _selectedDebugConnection = newValue;
          _renderConfigDialog(
            panel,
            {dialogMode: args.dialogMode},
            dialogCloser,
          );
        }}
        connection={connection}
        connectionOptions={options}
        dialogCloser={dialogCloser}
        providers={_connectionProviders}
      />,
      panel.getItem(),
    );
}

function _showLaunchAttachDialog(args: LaunchAttachDialogArgs): void {
    const {dialogMode} = args;
    if (
      _visibleLaunchAttachDialogMode != null &&
      _visibleLaunchAttachDialogMode !== dialogMode
    ) {
      // If the dialog is already visible, but isn't the correct mode, close it before
      // re-opening the correct mode.
      invariant(_lauchAttachDialogCloser != null);
      _lauchAttachDialogCloser();
    }

    const disposables = new UniversalDisposable();
    const hostEl = document.createElement('div');
    const pane = atom.workspace.addModalPanel({
      item: hostEl,
      className: 'debugger-config-dialog',
    });

    const parentEl: HTMLElement = (hostEl.parentElement: any);
    parentEl.style.maxWidth = '100em';

    // Function callback that closes the dialog and frees all of its resources.
    _renderConfigDialog(pane, args, () => disposables.dispose());
    _lauchAttachDialogCloser = () => disposables.dispose();
    disposables.add(
      pane.onDidChangeVisible(visible => {
        if (!visible) {
          disposables.dispose();
        }
      }),
    );
    disposables.add(() => {
      _disposables.remove(disposables);
      _visibleLaunchAttachDialogMode = null;
      _lauchAttachDialogCloser = null;
      track(AnalyticsEvents.DEBUGGER_TOGGLE_ATTACH_DIALOG, {
        visible: false,
        dialogMode,
      });
      ReactDOM.unmountComponentAtNode(hostEl);
      pane.destroy();
    });

    track(AnalyticsEvents.DEBUGGER_TOGGLE_ATTACH_DIALOG, {
      visible: true,
      dialogMode,
    });
    _visibleLaunchAttachDialogMode = dialogMode;
    _disposables.add(disposables);
}

function _addToWatch() {
    const editor = atom.workspace.getActiveTextEditor();
    if (!editor) {
      return;
    }
    const selectedText = editor.getTextInBufferRange(
      trimRange(editor, editor.getSelectedBufferRange()),
    );
    const expr = wordAtPosition(editor, editor.getCursorBufferPosition());

    const watchExpression = selectedText || (expr && expr.wordMatch[0]);
    if (watchExpression != null && watchExpression.length > 0) {
      _service.addWatchExpression(watchExpression);
    }
}

function _runToLocation(event) {
    if (_isReadOnlyTarget()) {
      return;
    }
    _executeWithEditorPath(event, (path, line) => {
      _service.runToLocation(path, line);
    });
}

function _copyDebuggerExpressionValue(event: Event) {
    const selection = window.getSelection();
    const clickedElement: HTMLElement = (event.target: any);
    const targetClass = '.nuclide-ui-expression-tree-value';
    const copyElement = clickedElement.closest(targetClass);

    if (copyElement != null) {
      // If the user has text in the target node selected, copy only the selection
      // instead of the entire node value.
      if (
        selection != null &&
        selection.toString() !== '' &&
        (copyElement.contains(selection?.anchorNode?.parentElement) ||
          copyElement === selection?.anchorNode?.parentElement)
      ) {
        atom.clipboard.write(selection.toString());
      } else {
        atom.clipboard.write(copyElement.textContent);
      }
    }
}

function _copyDebuggerCallstack(event: Event) {
    const {focusedThread} = _service.viewModel;
    if (focusedThread != null) {
      let callstackText = '';
      // eslint-disable-next-line nuclide-internal/unused-subscription
      focusedThread
        .getFullCallStack()
        .filter(expectedStack => !expectedStack.isPending)
        .take(1)
        .subscribe(expectedStack => {
          expectedStack.getOrDefault([]).forEach((item, i) => {
            const path = nuclideUri.basename(item.source.uri);
            callstackText += `${i}\t${item.name}\t${path}:${
              item.range.start.row
            }${os.EOL}`;
          });
          atom.clipboard.write(callstackText.trim());
        });
    }
}

export function consumeCurrentWorkingDirectory(cwdApi: nuclide$CwdApi): IDisposable {
    const updateSelectedConnection = directory => {
      _selectedDebugConnection = directory;
      if (_selectedDebugConnection != null) {
        const conn = _selectedDebugConnection;
        if (nuclideUri.isRemote(conn)) {
          // Use root instead of current directory as launch point for debugger.
          _selectedDebugConnection = nuclideUri.createRemoteUri(
            nuclideUri.getHostname(conn),
            '/',
          );
        } else {
          // Use null instead of local path to use local debugger downstream.
          _selectedDebugConnection = null;
        }
      }
    };
    const disposable = cwdApi.observeCwd(updateSelectedConnection);
    _disposables.add(disposable);
    return new UniversalDisposable(() => {
      disposable.dispose();
      _disposables.remove(disposable);
    });
}

export function createAutocompleteProvider(): atom$AutocompleteProvider {
    return {
      labels: ['nuclide-console'],
      selector: '*',
      filterSuggestions: true,
      getSuggestions: _getSuggestions.bind(this),
    };
}

export function consumeConsole(createConsole: ConsoleService): IDisposable {
    return setConsoleService(createConsole);
}

export function consumeTerminal(terminalApi: TerminalApi): IDisposable {
    return setTerminalService(terminalApi);
}

export function consumeRpcService(rpcService: nuclide$RpcService): IDisposable {
    return setRpcService(rpcService);
}

export function consumeRegisterExecutor(
    registerExecutor: RegisterExecutorFunction,
  ): IDisposable {
    return setConsoleRegisterExecutor(registerExecutor);
}

export function consumeDebuggerProvider(provider: NuclideDebuggerProvider): IDisposable {
    _uiModel.addDebuggerProvider(provider);
    return new UniversalDisposable(() => {
      _uiModel.removeDebuggerProvider(provider);
    });
}

export function consumeDebuggerConfigurationProviders(
    providers: Array<DebuggerConfigurationProvider>,
  ): IDisposable {
    invariant(Array.isArray(providers));
    const disposable = new UniversalDisposable();
    providers.forEach(provider =>
      disposable.add(addDebugConfigurationProvider(provider)),
    );
    return disposable;
}

export function consumeToolBar(getToolBar: toolbar$GetToolbar): IDisposable {
    const toolBar = getToolBar('debugger');
    toolBar.addButton({
      iconset: 'icon-nuclicon',
      icon: 'debugger',
      callback: 'debugger:show-attach-dialog',
      tooltip: 'Attach Debugger',
      priority: 500,
    }).element;
    const disposable = new UniversalDisposable(() => {
      toolBar.removeItems();
    });
    _disposables.add(disposable);
    return disposable;
}

export function consumeNotifications(
    raiseNativeNotification: (
      title: string,
      body: string,
      timeout: number,
      raiseIfAtomHasFocus: boolean,
    ) => ?IDisposable,
  ): void {
    setNotificationService(raiseNativeNotification);
}

export function provideRemoteControlService(): RemoteControlService {
    return new RemoteControlService(_service);
}

export function consumeDatatipService(service: DatatipService): IDisposable {
    const disposable = new UniversalDisposable(
      service.addProvider(_createDatatipProvider()),
      setDatatipService(service),
    );
    _disposables.add(disposable);
    return disposable;
}

function _createDatatipProvider(): DatatipProvider {
    return {
      // Eligibility is determined online, based on registered EvaluationExpression providers.
      providerName: DATATIP_PACKAGE_NAME,
      priority: 1,
      datatip: (editor: TextEditor, position: atom$Point) => {
        return debuggerDatatip(_service, editor, position);
      },
    };
}

function createDebuggerView(model: mixed): ?HTMLElement {
  let view = null;
  if (
    model instanceof DebuggerPaneViewModel ||
    model instanceof DebuggerPaneContainerViewModel
  ) {
    view = model.createView();
  }

  if (view != null) {
    const elem = renderReactRoot(view);
    elem.className = 'debugger-container';
    return elem;
  }

  return null;
}
