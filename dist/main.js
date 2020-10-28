"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.activate = activate;
exports.serialize = serialize;
exports.deactivate = deactivate;
exports.consumeCurrentWorkingDirectory = consumeCurrentWorkingDirectory;
exports.createAutocompleteProvider = createAutocompleteProvider;
exports.consumeConsole = consumeConsole;
exports.consumeTerminal = consumeTerminal;
exports.consumeRpcService = consumeRpcService;
exports.consumeRegisterExecutor = consumeRegisterExecutor;
exports.consumeDebuggerProvider = consumeDebuggerProvider;
exports.consumeDebuggerConfigurationProviders = consumeDebuggerConfigurationProviders;
exports.consumeToolBar = consumeToolBar;
exports.consumeNotifications = consumeNotifications;
exports.provideRemoteControlService = provideRemoteControlService;
exports.consumeDatatipService = consumeDatatipService;

var _idx = _interopRequireDefault(require("idx"));

var _projects = require("@atom-ide-community/nuclide-commons-atom/projects");

var _BreakpointManager = _interopRequireDefault(require("./BreakpointManager"));

var _constants = require("./constants");

var _BreakpointConfigComponent = _interopRequireDefault(require("./ui/BreakpointConfigComponent"));

var _utils = require("./utils");

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var _assert = _interopRequireDefault(require("assert"));

var _analytics = require("@atom-ide-community/nuclide-commons/analytics");

var _RemoteControlService = _interopRequireDefault(require("./RemoteControlService"));

var _DebuggerUiModel = _interopRequireDefault(require("./DebuggerUiModel"));

var _DebugService = _interopRequireDefault(require("./vsp/DebugService"));

var _DebuggerDatatip = require("./DebuggerDatatip");

var React = _interopRequireWildcard(require("react"));

var _reactDom = _interopRequireDefault(require("react-dom"));

var _DebuggerLaunchAttachUI = _interopRequireDefault(require("./ui/DebuggerLaunchAttachUI"));

var _renderReactRoot = require("@atom-ide-community/nuclide-commons-ui/renderReactRoot");

var _nuclideUri = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/nuclideUri"));

var _AtomServiceContainer = require("./AtomServiceContainer");

var _range = require("@atom-ide-community/nuclide-commons-atom/range");

var _DebuggerLayoutManager = _interopRequireDefault(require("./ui/DebuggerLayoutManager"));

var _DebuggerPaneViewModel = _interopRequireDefault(require("./ui/DebuggerPaneViewModel"));

var _DebuggerPaneContainerViewModel = _interopRequireDefault(require("./ui/DebuggerPaneContainerViewModel"));

var _os = _interopRequireDefault(require("os"));

var _nullthrows = _interopRequireDefault(require("nullthrows"));

var _ReactMountRootElement = _interopRequireDefault(require("@atom-ide-community/nuclide-commons-ui/ReactMountRootElement"));

var _menuUtils = require("@atom-ide-community/nuclide-commons/menuUtils");

var _passesGK = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/passesGK"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const DATATIP_PACKAGE_NAME = "debugger-datatip";

let _disposables;

let _uiModel;

let _breakpointManager;

let _service;

let _layoutManager;

let _selectedDebugConnection;

let _visibleLaunchAttachDialogMode;

let _lauchAttachDialogCloser;

let _connectionProviders;

function activate(state) {
  atom.views.addViewProvider(_DebuggerPaneViewModel.default, createDebuggerView);
  atom.views.addViewProvider(_DebuggerPaneContainerViewModel.default, createDebuggerView);
  _service = new _DebugService.default(state);
  _uiModel = new _DebuggerUiModel.default(_service);
  _breakpointManager = new _BreakpointManager.default(_service);
  _selectedDebugConnection = null;
  _visibleLaunchAttachDialogMode = null;
  _lauchAttachDialogCloser = null;
  _connectionProviders = new Map();
  _layoutManager = new _DebuggerLayoutManager.default(_service, state); // Manually manipulate the `Debugger` top level menu order.

  const insertIndex = atom.menu.template.findIndex(item => item.role === "window" || item.role === "help");

  if (insertIndex !== -1) {
    const deuggerIndex = atom.menu.template.findIndex(item => item.label === "Debugger");
    const menuItem = atom.menu.template.splice(deuggerIndex, 1)[0];
    const newIndex = insertIndex > deuggerIndex ? insertIndex - 1 : insertIndex;
    atom.menu.template.splice(newIndex, 0, menuItem);
    atom.menu.update();
  }

  const removedHostnames = (0, _projects.observeRemovedHostnames)();
  _disposables = new _UniversalDisposable.default(_layoutManager, _service, _uiModel, _breakpointManager, removedHostnames.subscribe(hostname => {
    _service.getModel().getProcesses().forEach(debuggerProcess => {
      const debuggeeTargetUri = debuggerProcess.configuration.targetUri;

      if (_nuclideUri.default.isLocal(debuggeeTargetUri)) {
        return; // Nothing to do if our debug session is local.
      }

      if (_nuclideUri.default.getHostname(debuggeeTargetUri) === hostname) {
        _service.stopProcess(debuggerProcess);
      }
    });
  }), _uiModel.onConnectionsUpdated(() => {
    const newConnections = _uiModel.getConnections();

    const keys = Array.from(_connectionProviders.keys());
    const removedConnections = keys.filter(connection => newConnections.find(item => item === connection) == null);
    const addedConnections = newConnections.filter(connection => keys.find(item => item === connection) == null);

    for (const key of removedConnections) {
      _connectionProviders.delete(key);
    }

    for (const connection of addedConnections) {
      _setProvidersForConnection(connection);
    }
  }), _uiModel.onProvidersUpdated(() => {
    const connections = _uiModel.getConnections();

    for (const connection of connections) {
      _setProvidersForConnection(connection);
    }
  }), // Commands.
  atom.commands.add("atom-workspace", {
    "debugger:show-attach-dialog": event => {
      const selectedTabName = (0, _idx.default)(event, _ => _.detail.selectedTabName);
      const config = (0, _idx.default)(event, _ => _.detail.config);

      _showLaunchAttachDialog({
        dialogMode: "attach",
        selectedTabName,
        config
      });
    }
  }), atom.commands.add("atom-workspace", {
    "debugger:show-launch-dialog": event => {
      var _event$detail, _event$detail2;

      const selectedTabName = event === null || event === void 0 ? void 0 : (_event$detail = event.detail) === null || _event$detail === void 0 ? void 0 : _event$detail.selectedTabName;
      const config = event === null || event === void 0 ? void 0 : (_event$detail2 = event.detail) === null || _event$detail2 === void 0 ? void 0 : _event$detail2.config;

      _showLaunchAttachDialog({
        dialogMode: "launch",
        selectedTabName,
        config
      });
    }
  }), atom.commands.add("atom-workspace", {
    "debugger:continue-debugging": _continue.bind(this)
  }), atom.commands.add("atom-workspace", {
    "debugger:stop-debugging": _stop.bind(this)
  }), atom.commands.add("atom-workspace", {
    "debugger:restart-debugging": _restart.bind(this)
  }), atom.commands.add("atom-workspace", {
    "debugger:step-over": _stepOver.bind(this)
  }), atom.commands.add("atom-workspace", {
    "debugger:step-into": _stepInto.bind(this)
  }), atom.commands.add("atom-workspace", {
    "debugger:step-out": _stepOut.bind(this)
  }), atom.commands.add("atom-workspace", {
    // eslint-disable-next-line nuclide-internal/atom-apis
    "debugger:add-breakpoint": _addBreakpoint.bind(this)
  }), atom.commands.add("atom-workspace", {
    "debugger:toggle-breakpoint": _toggleBreakpoint.bind(this)
  }), atom.commands.add("atom-workspace", {
    "debugger:toggle-breakpoint-enabled": _toggleBreakpointEnabled.bind(this)
  }), atom.commands.add("atom-workspace", {
    // eslint-disable-next-line nuclide-internal/atom-apis
    "debugger:edit-breakpoint": _configureBreakpoint.bind(this)
  }), atom.commands.add(".debugger-thread-list-item", {
    "debugger:terminate-thread": _terminateThread.bind(this)
  }), atom.commands.add("atom-workspace", {
    "debugger:remove-all-breakpoints": _deleteAllBreakpoints.bind(this)
  }), atom.commands.add("atom-workspace", {
    "debugger:enable-all-breakpoints": _enableAllBreakpoints.bind(this)
  }), atom.commands.add("atom-workspace", {
    "debugger:disable-all-breakpoints": _disableAllBreakpoints.bind(this)
  }), atom.commands.add("atom-workspace", {
    "debugger:remove-breakpoint": _deleteBreakpoint.bind(this)
  }), atom.commands.add("atom-workspace", {
    // eslint-disable-next-line nuclide-internal/atom-apis
    "debugger:add-to-watch": _addToWatch.bind(this)
  }), atom.commands.add("atom-workspace", {
    "debugger:run-to-location": _runToLocation.bind(this)
  }), atom.commands.add(".debugger-expression-value-list", {
    "debugger:copy-debugger-expression-value": _copyDebuggerExpressionValue.bind(this)
  }), atom.commands.add("atom-workspace", {
    "debugger:copy-debugger-callstack": _copyDebuggerCallstack.bind(this)
  }), // Context Menu Items.
  atom.contextMenu.add({
    ".debugger-breakpoint-list": [{
      label: "Enable All Breakpoints",
      command: "debugger:enable-all-breakpoints"
    }, {
      label: "Disable All Breakpoints",
      command: "debugger:disable-all-breakpoints"
    }, {
      label: "Remove All Breakpoints",
      command: "debugger:remove-all-breakpoints"
    }, {
      type: "separator"
    }],
    ".debugger-breakpoint": [{
      label: "Edit breakpoint...",
      command: "debugger:edit-breakpoint",
      shouldDisplay: event => {
        const bp = _getBreakpointFromEvent(event);

        return bp != null && _supportsConditionalBreakpoints();
      }
    }, {
      label: "Remove Breakpoint",
      command: "debugger:remove-breakpoint"
    }, {
      type: "separator"
    }],
    ".debugger-thread-list-item": [{
      label: "Terminate thread",
      command: "debugger:terminate-thread",
      shouldDisplay: event => {
        const target = event.target;

        if (target.dataset.threadid) {
          const threadId = parseInt(target.dataset.threadid, 10);

          if (!Number.isNaN(threadId)) {
            return _supportsTerminateThreadsRequest() && !_isReadOnlyTarget();
          }
        }

        return false;
      }
    }],
    ".debugger-callstack-table": [{
      label: "Copy Callstack",
      command: "debugger:copy-debugger-callstack"
    }],
    ".debugger-expression-value-list": [{
      label: "Copy",
      command: "debugger:copy-debugger-expression-value"
    }],
    "atom-text-editor": [{
      type: "separator"
    }, {
      label: "Debugger",
      submenu: [{
        label: "Toggle Breakpoint",
        command: "debugger:toggle-breakpoint"
      }, {
        label: "Toggle Breakpoint enabled/disabled",
        command: "debugger:toggle-breakpoint-enabled",
        shouldDisplay: event => _executeWithEditorPath(event, (filePath, line) => _service.getModel().getBreakpointAtLine(filePath, line) != null) || false
      }, {
        label: "Edit Breakpoint...",
        command: "debugger:edit-breakpoint",
        shouldDisplay: event => _executeWithEditorPath(event, (filePath, line) => {
          const bp = _service.getModel().getBreakpointAtLine(filePath, line);

          return bp != null && _supportsConditionalBreakpoints();
        }) || false
      }, {
        label: "Add to Watch",
        command: "debugger:add-to-watch",
        shouldDisplay: event => {
          const textEditor = atom.workspace.getActiveTextEditor();

          if (_service.getDebuggerMode() === _constants.DebuggerMode.STOPPED || textEditor == null) {
            return false;
          }

          return textEditor.getSelections().length === 1 && !textEditor.getSelectedBufferRange().isEmpty();
        }
      }, {
        label: "Run to Location",
        command: "debugger:run-to-location",
        shouldDisplay: event => _service.getDebuggerMode() === _constants.DebuggerMode.PAUSED && !_isReadOnlyTarget()
      }]
    }, {
      type: "separator"
    }]
  }), _registerCommandsContextMenuAndOpener());
  (0, _menuUtils.sortMenuGroups)(["Debugger"]);
}

function _supportsConditionalBreakpoints() {
  // If currently debugging, return whether or not the current debugger supports
  const {
    focusedProcess
  } = _service.viewModel;

  if (focusedProcess == null) {
    // If not currently debugging, return if any of the debuggers that support
    // the file extension this bp is in support conditions.
    // TODO(ericblue): have providers register their file extensions and filter correctly here.
    return true;
  } else {
    return Boolean(focusedProcess.session.capabilities.supportsConditionalBreakpoints);
  }
}

function _supportsTerminateThreadsRequest() {
  // If currently debugging, return whether or not the current debugger supports
  const {
    focusedProcess
  } = _service.viewModel;

  if (focusedProcess == null) {
    return false;
  } else {
    return Boolean(focusedProcess.session.capabilities.supportsTerminateThreadsRequest);
  }
}

function _setProvidersForConnection(connection) {
  const key = _nuclideUri.default.isRemote(connection) ? _nuclideUri.default.getHostname(connection) : "local";

  const availableProviders = _uiModel.getLaunchAttachProvidersForConnection(connection);

  _connectionProviders.set(key, availableProviders);
}

async function _getSuggestions(request) {
  let text = request.editor.getText();
  const lines = text.split("\n");
  const {
    row
  } = request.bufferPosition; // Only keep the lines up to and including the buffer position row.

  text = lines.slice(0, row + 1).join("\n");
  const {
    focusedStackFrame,
    focusedProcess
  } = _service.viewModel;

  if (focusedProcess == null || focusedStackFrame == null || !Boolean(focusedProcess.session.capabilities.supportsCompletionsRequest)) {
    return [];
  } else {
    const completions = await focusedProcess.completions(focusedStackFrame.frameId, text, request.bufferPosition, 0);
    return completions.map(item => ({
      displayText: item.label,
      text: item.text == null ? item.label : item.text,
      type: item.type
    }));
  }
}

function serialize() {
  const model = _service.getModel();

  const state = {
    sourceBreakpoints: model.getBreakpoints(),
    functionBreakpoints: model.getFunctionBreakpoints(),
    exceptionBreakpoints: model.getExceptionBreakpoints(),
    watchExpressions: model.getWatchExpressions().map(e => e.name),
    showDebugger: _layoutManager.isDebuggerVisible(),
    workspaceDocksVisibility: _layoutManager.getWorkspaceDocksVisibility()
  };
  return state;
}

function deactivate() {
  _disposables.dispose();
}

function _registerCommandsContextMenuAndOpener() {
  const disposable = new _UniversalDisposable.default(atom.workspace.addOpener(uri => {
    return _layoutManager.getModelForDebuggerUri(uri);
  }), () => {
    _layoutManager.hideDebuggerViews(false);
  }, atom.commands.add("atom-workspace", {
    "debugger:show": event => {
      const detail = event.detail;
      const show = detail == null || Boolean(detail.showOnlyIfHidden) === false || !_layoutManager.isDebuggerVisible();

      if (show) {
        _layoutManager.showDebuggerViews();
      }
    }
  }), atom.commands.add("atom-workspace", {
    "debugger:hide": () => {
      _layoutManager.hideDebuggerViews(false);

      for (const process of _service.getModel().getProcesses()) {
        _service.stopProcess(process);
      }
    }
  }), atom.commands.add("atom-workspace", "debugger:toggle", () => {
    if (_layoutManager.isDebuggerVisible() === true) {
      atom.commands.dispatch(atom.views.getView(atom.workspace), "debugger:hide");
    } else {
      atom.commands.dispatch(atom.views.getView(atom.workspace), "debugger:show");
    }
  }), _service.onDidChangeProcessMode(() => _layoutManager.debuggerModeChanged()), _service.viewModel.onDidChangeDebuggerFocus(() => _layoutManager.debuggerModeChanged()), atom.commands.add("atom-workspace", {
    "debugger:reset-layout": () => {
      _layoutManager.resetLayout();
    }
  }), atom.contextMenu.add({
    ".debugger-container": [{
      label: "Debugger Views",
      submenu: [{
        label: "Reset Layout",
        command: "debugger:reset-layout"
      }]
    }]
  }));
  return disposable;
}

function _isReadOnlyTarget() {
  const {
    focusedProcess
  } = _service.viewModel;
  return focusedProcess != null && Boolean(focusedProcess.configuration.isReadOnly);
}

function _continue() {
  if (_isReadOnlyTarget()) {
    return;
  }

  const {
    focusedThread
  } = _service.viewModel;

  if (focusedThread != null) {
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_STEP_CONTINUE);
    focusedThread.continue();
  }
}

function _stop() {
  const {
    focusedProcess
  } = _service.viewModel;

  if (focusedProcess) {
    _service.stopProcess(focusedProcess);
  }
}

function _restart() {
  if (_isReadOnlyTarget()) {
    return;
  }

  const {
    focusedProcess
  } = _service.viewModel;

  if (focusedProcess) {
    _service.restartProcess(focusedProcess);
  }
}

function _stepOver() {
  if (_isReadOnlyTarget()) {
    return;
  }

  const {
    focusedThread
  } = _service.viewModel;

  if (focusedThread != null) {
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_STEP_OVER);
    focusedThread.next();
  }
}

function _stepInto() {
  if (_isReadOnlyTarget()) {
    return;
  }

  const {
    focusedThread
  } = _service.viewModel;

  if (focusedThread != null) {
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_STEP_INTO);
    focusedThread.stepIn();
  }
}

function _stepOut() {
  if (_isReadOnlyTarget()) {
    return;
  }

  const {
    focusedThread
  } = _service.viewModel;

  if (focusedThread != null) {
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_STEP_OUT);
    focusedThread.stepOut();
  }
}

function _addBreakpoint(event) {
  return _executeWithEditorPath(event, (filePath, lineNumber) => {
    _service.addSourceBreakpoint(filePath, lineNumber);
  });
}

function _toggleBreakpoint(event) {
  return _executeWithEditorPath(event, (filePath, lineNumber) => {
    _service.toggleSourceBreakpoint(filePath, lineNumber);
  });
}

function _toggleBreakpointEnabled(event) {
  _executeWithEditorPath(event, (filePath, line) => {
    const bp = _service.getModel().getBreakpointAtLine(filePath, line);

    if (bp != null) {
      _service.enableOrDisableBreakpoints(!bp.enabled, bp);
    }
  });
}

function _getBreakpointFromEvent(event) {
  const target = event.target;
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

function _configureBreakpoint(event) {
  const bp = _getBreakpointFromEvent(event);

  if (bp != null && _supportsConditionalBreakpoints()) {
    // Open the configuration dialog.
    const container = new _ReactMountRootElement.default();

    _reactDom.default.render( /*#__PURE__*/React.createElement(_BreakpointConfigComponent.default, {
      breakpoint: bp,
      service: _service,
      onDismiss: () => {
        _reactDom.default.unmountComponentAtNode(container);
      },
      allowLogMessage: (0, _passesGK.default)("nuclide_debugger_logging_breakpoints")
    }), container);
  }
}

function _terminateThread(event) {
  if (_isReadOnlyTarget()) {
    return;
  }

  const target = event.target;

  if (target.dataset.threadid) {
    const threadId = parseInt(target.dataset.threadid, 10);

    if (!Number.isNaN(threadId) && _supportsTerminateThreadsRequest()) {
      _service.terminateThreads([threadId]);
    }
  }
}

function _executeWithEditorPath(event, fn) {
  const editor = atom.workspace.getActiveTextEditor();

  if (!editor || !editor.getPath()) {
    return null;
  }

  const line = (0, _utils.getLineForEvent)(editor, event) + 1;
  return fn((0, _nullthrows.default)(editor.getPath()), line);
}

function _deleteBreakpoint(event) {
  const breakpoint = _getBreakpointFromEvent(event);

  if (breakpoint != null) {
    _service.removeBreakpoints(breakpoint.getId());
  }
}

function _deleteAllBreakpoints() {
  _service.removeBreakpoints();
}

function _enableAllBreakpoints() {
  _service.enableOrDisableBreakpoints(true);
}

function _disableAllBreakpoints() {
  _service.enableOrDisableBreakpoints(false);
}

function _renderConfigDialog(panel, args, dialogCloser) {
  if (_selectedDebugConnection == null) {
    // If no connection is selected yet, default to the local connection.
    _selectedDebugConnection = "local";
  }

  (0, _assert.default)(_selectedDebugConnection != null);

  const options = _uiModel.getConnections().map(connection => {
    const displayName = _nuclideUri.default.isRemote(connection) ? _nuclideUri.default.getHostname(connection) : "localhost";
    return {
      value: connection,
      label: displayName
    };
  }).filter(item => item.value != null && item.value !== "").sort((a, b) => a.label.localeCompare(b.label)); // flowlint-next-line sketchy-null-string:off


  const connection = _selectedDebugConnection || "local";

  _reactDom.default.render( /*#__PURE__*/React.createElement(_DebuggerLaunchAttachUI.default, {
    dialogMode: args.dialogMode,
    initialSelectedTabName: args.selectedTabName,
    initialProviderConfig: args.config,
    connectionChanged: newValue => {
      _selectedDebugConnection = newValue;

      _renderConfigDialog(panel, {
        dialogMode: args.dialogMode
      }, dialogCloser);
    },
    connection: connection,
    connectionOptions: options,
    dialogCloser: dialogCloser,
    providers: _connectionProviders
  }), panel.getItem());
}

function _showLaunchAttachDialog(args) {
  const {
    dialogMode
  } = args;

  if (_visibleLaunchAttachDialogMode != null && _visibleLaunchAttachDialogMode !== dialogMode) {
    // If the dialog is already visible, but isn't the correct mode, close it before
    // re-opening the correct mode.
    (0, _assert.default)(_lauchAttachDialogCloser != null);

    _lauchAttachDialogCloser();
  }

  const disposables = new _UniversalDisposable.default();
  const hostEl = document.createElement("div");
  const pane = atom.workspace.addModalPanel({
    item: hostEl,
    className: "debugger-config-dialog"
  });
  const parentEl = hostEl.parentElement;
  parentEl.style.maxWidth = "100em"; // Function callback that closes the dialog and frees all of its resources.

  _renderConfigDialog(pane, args, () => disposables.dispose());

  _lauchAttachDialogCloser = () => disposables.dispose();

  disposables.add(pane.onDidChangeVisible(visible => {
    if (!visible) {
      disposables.dispose();
    }
  }));
  disposables.add(() => {
    _disposables.remove(disposables);

    _visibleLaunchAttachDialogMode = null;
    _lauchAttachDialogCloser = null;
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_TOGGLE_ATTACH_DIALOG, {
      visible: false,
      dialogMode
    });

    _reactDom.default.unmountComponentAtNode(hostEl);

    pane.destroy();
  });
  (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_TOGGLE_ATTACH_DIALOG, {
    visible: true,
    dialogMode
  });
  _visibleLaunchAttachDialogMode = dialogMode;

  _disposables.add(disposables);
}

function _addToWatch() {
  const editor = atom.workspace.getActiveTextEditor();

  if (!editor) {
    return;
  }

  const selectedText = editor.getTextInBufferRange((0, _range.trimRange)(editor, editor.getSelectedBufferRange()));
  const expr = (0, _range.wordAtPosition)(editor, editor.getCursorBufferPosition());
  const watchExpression = selectedText || expr && expr.wordMatch[0];

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

function _copyDebuggerExpressionValue(event) {
  const selection = window.getSelection();
  const clickedElement = event.target;
  const targetClass = ".nuclide-ui-expression-tree-value";
  const copyElement = clickedElement.closest(targetClass);

  if (copyElement != null) {
    var _selection$anchorNode, _selection$anchorNode2;

    // If the user has text in the target node selected, copy only the selection
    // instead of the entire node value.
    if (selection != null && selection.toString() !== "" && (copyElement.contains(selection === null || selection === void 0 ? void 0 : (_selection$anchorNode = selection.anchorNode) === null || _selection$anchorNode === void 0 ? void 0 : _selection$anchorNode.parentElement) || copyElement === (selection === null || selection === void 0 ? void 0 : (_selection$anchorNode2 = selection.anchorNode) === null || _selection$anchorNode2 === void 0 ? void 0 : _selection$anchorNode2.parentElement))) {
      atom.clipboard.write(selection.toString());
    } else {
      atom.clipboard.write(copyElement.textContent);
    }
  }
}

function _copyDebuggerCallstack(event) {
  const {
    focusedThread
  } = _service.viewModel;

  if (focusedThread != null) {
    let callstackText = ""; // eslint-disable-next-line nuclide-internal/unused-subscription

    focusedThread.getFullCallStack().filter(expectedStack => !expectedStack.isPending).take(1).subscribe(expectedStack => {
      expectedStack.getOrDefault([]).forEach((item, i) => {
        const path = _nuclideUri.default.basename(item.source.uri);

        callstackText += `${i}\t${item.name}\t${path}:${item.range.start.row}${_os.default.EOL}`;
      });
      atom.clipboard.write(callstackText.trim());
    });
  }
}

function consumeCurrentWorkingDirectory(cwdApi) {
  const updateSelectedConnection = directory => {
    _selectedDebugConnection = directory;

    if (_selectedDebugConnection != null) {
      const conn = _selectedDebugConnection;

      if (_nuclideUri.default.isRemote(conn)) {
        // Use root instead of current directory as launch point for debugger.
        _selectedDebugConnection = _nuclideUri.default.createRemoteUri(_nuclideUri.default.getHostname(conn), "/");
      } else {
        // Use null instead of local path to use local debugger downstream.
        _selectedDebugConnection = null;
      }
    }
  };

  const disposable = cwdApi.observeCwd(updateSelectedConnection);

  _disposables.add(disposable);

  return new _UniversalDisposable.default(() => {
    disposable.dispose();

    _disposables.remove(disposable);
  });
}

function createAutocompleteProvider() {
  return {
    labels: ["nuclide-console"],
    selector: "*",
    filterSuggestions: true,
    getSuggestions: _getSuggestions.bind(this)
  };
}

function consumeConsole(createConsole) {
  return (0, _AtomServiceContainer.setConsoleService)(createConsole);
}

function consumeTerminal(terminalApi) {
  return (0, _AtomServiceContainer.setTerminalService)(terminalApi);
}

function consumeRpcService(rpcService) {
  return (0, _AtomServiceContainer.setRpcService)(rpcService);
}

function consumeRegisterExecutor(registerExecutor) {
  return (0, _AtomServiceContainer.setConsoleRegisterExecutor)(registerExecutor);
}

function consumeDebuggerProvider(provider) {
  _uiModel.addDebuggerProvider(provider);

  return new _UniversalDisposable.default(() => {
    _uiModel.removeDebuggerProvider(provider);
  });
}

function consumeDebuggerConfigurationProviders(providers) {
  (0, _assert.default)(Array.isArray(providers));
  const disposable = new _UniversalDisposable.default();
  providers.forEach(provider => disposable.add((0, _AtomServiceContainer.addDebugConfigurationProvider)(provider)));
  return disposable;
}

function consumeToolBar(getToolBar) {
  const toolBar = getToolBar("debugger");
  toolBar.addButton({
    iconset: "icon-nuclicon",
    icon: "debugger",
    callback: "debugger:show-attach-dialog",
    tooltip: "Attach Debugger",
    priority: 500
  }).element;
  const disposable = new _UniversalDisposable.default(() => {
    toolBar.removeItems();
  });

  _disposables.add(disposable);

  return disposable;
}

function consumeNotifications(raiseNativeNotification) {
  (0, _AtomServiceContainer.setNotificationService)(raiseNativeNotification);
}

function provideRemoteControlService() {
  return new _RemoteControlService.default(_service);
}

function consumeDatatipService(service) {
  const disposable = new _UniversalDisposable.default(service.addProvider(_createDatatipProvider()), (0, _AtomServiceContainer.setDatatipService)(service));

  _disposables.add(disposable);

  return disposable;
}

function _createDatatipProvider() {
  return {
    // Eligibility is determined online, based on registered EvaluationExpression providers.
    providerName: DATATIP_PACKAGE_NAME,
    priority: 1,
    datatip: (editor, position) => {
      return (0, _DebuggerDatatip.debuggerDatatip)(_service, editor, position);
    }
  };
}

function createDebuggerView(model) {
  let view = null;

  if (model instanceof _DebuggerPaneViewModel.default || model instanceof _DebuggerPaneContainerViewModel.default) {
    view = model.createView();
  }

  if (view != null) {
    const elem = (0, _renderReactRoot.renderReactRoot)(view);
    elem.className = "debugger-container";
    return elem;
  }

  return null;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1haW4uanMiXSwibmFtZXMiOlsiREFUQVRJUF9QQUNLQUdFX05BTUUiLCJfZGlzcG9zYWJsZXMiLCJfdWlNb2RlbCIsIl9icmVha3BvaW50TWFuYWdlciIsIl9zZXJ2aWNlIiwiX2xheW91dE1hbmFnZXIiLCJfc2VsZWN0ZWREZWJ1Z0Nvbm5lY3Rpb24iLCJfdmlzaWJsZUxhdW5jaEF0dGFjaERpYWxvZ01vZGUiLCJfbGF1Y2hBdHRhY2hEaWFsb2dDbG9zZXIiLCJfY29ubmVjdGlvblByb3ZpZGVycyIsImFjdGl2YXRlIiwic3RhdGUiLCJhdG9tIiwidmlld3MiLCJhZGRWaWV3UHJvdmlkZXIiLCJEZWJ1Z2dlclBhbmVWaWV3TW9kZWwiLCJjcmVhdGVEZWJ1Z2dlclZpZXciLCJEZWJ1Z2dlclBhbmVDb250YWluZXJWaWV3TW9kZWwiLCJEZWJ1Z1NlcnZpY2UiLCJEZWJ1Z2dlclVpTW9kZWwiLCJCcmVha3BvaW50TWFuYWdlciIsIk1hcCIsIkRlYnVnZ2VyTGF5b3V0TWFuYWdlciIsImluc2VydEluZGV4IiwibWVudSIsInRlbXBsYXRlIiwiZmluZEluZGV4IiwiaXRlbSIsInJvbGUiLCJkZXVnZ2VySW5kZXgiLCJsYWJlbCIsIm1lbnVJdGVtIiwic3BsaWNlIiwibmV3SW5kZXgiLCJ1cGRhdGUiLCJyZW1vdmVkSG9zdG5hbWVzIiwiVW5pdmVyc2FsRGlzcG9zYWJsZSIsInN1YnNjcmliZSIsImhvc3RuYW1lIiwiZ2V0TW9kZWwiLCJnZXRQcm9jZXNzZXMiLCJmb3JFYWNoIiwiZGVidWdnZXJQcm9jZXNzIiwiZGVidWdnZWVUYXJnZXRVcmkiLCJjb25maWd1cmF0aW9uIiwidGFyZ2V0VXJpIiwibnVjbGlkZVVyaSIsImlzTG9jYWwiLCJnZXRIb3N0bmFtZSIsInN0b3BQcm9jZXNzIiwib25Db25uZWN0aW9uc1VwZGF0ZWQiLCJuZXdDb25uZWN0aW9ucyIsImdldENvbm5lY3Rpb25zIiwia2V5cyIsIkFycmF5IiwiZnJvbSIsInJlbW92ZWRDb25uZWN0aW9ucyIsImZpbHRlciIsImNvbm5lY3Rpb24iLCJmaW5kIiwiYWRkZWRDb25uZWN0aW9ucyIsImtleSIsImRlbGV0ZSIsIl9zZXRQcm92aWRlcnNGb3JDb25uZWN0aW9uIiwib25Qcm92aWRlcnNVcGRhdGVkIiwiY29ubmVjdGlvbnMiLCJjb21tYW5kcyIsImFkZCIsImV2ZW50Iiwic2VsZWN0ZWRUYWJOYW1lIiwiXyIsImRldGFpbCIsImNvbmZpZyIsIl9zaG93TGF1bmNoQXR0YWNoRGlhbG9nIiwiZGlhbG9nTW9kZSIsIl9jb250aW51ZSIsImJpbmQiLCJfc3RvcCIsIl9yZXN0YXJ0IiwiX3N0ZXBPdmVyIiwiX3N0ZXBJbnRvIiwiX3N0ZXBPdXQiLCJfYWRkQnJlYWtwb2ludCIsIl90b2dnbGVCcmVha3BvaW50IiwiX3RvZ2dsZUJyZWFrcG9pbnRFbmFibGVkIiwiX2NvbmZpZ3VyZUJyZWFrcG9pbnQiLCJfdGVybWluYXRlVGhyZWFkIiwiX2RlbGV0ZUFsbEJyZWFrcG9pbnRzIiwiX2VuYWJsZUFsbEJyZWFrcG9pbnRzIiwiX2Rpc2FibGVBbGxCcmVha3BvaW50cyIsIl9kZWxldGVCcmVha3BvaW50IiwiX2FkZFRvV2F0Y2giLCJfcnVuVG9Mb2NhdGlvbiIsIl9jb3B5RGVidWdnZXJFeHByZXNzaW9uVmFsdWUiLCJfY29weURlYnVnZ2VyQ2FsbHN0YWNrIiwiY29udGV4dE1lbnUiLCJjb21tYW5kIiwidHlwZSIsInNob3VsZERpc3BsYXkiLCJicCIsIl9nZXRCcmVha3BvaW50RnJvbUV2ZW50IiwiX3N1cHBvcnRzQ29uZGl0aW9uYWxCcmVha3BvaW50cyIsInRhcmdldCIsImRhdGFzZXQiLCJ0aHJlYWRpZCIsInRocmVhZElkIiwicGFyc2VJbnQiLCJOdW1iZXIiLCJpc05hTiIsIl9zdXBwb3J0c1Rlcm1pbmF0ZVRocmVhZHNSZXF1ZXN0IiwiX2lzUmVhZE9ubHlUYXJnZXQiLCJzdWJtZW51IiwiX2V4ZWN1dGVXaXRoRWRpdG9yUGF0aCIsImZpbGVQYXRoIiwibGluZSIsImdldEJyZWFrcG9pbnRBdExpbmUiLCJ0ZXh0RWRpdG9yIiwid29ya3NwYWNlIiwiZ2V0QWN0aXZlVGV4dEVkaXRvciIsImdldERlYnVnZ2VyTW9kZSIsIkRlYnVnZ2VyTW9kZSIsIlNUT1BQRUQiLCJnZXRTZWxlY3Rpb25zIiwibGVuZ3RoIiwiZ2V0U2VsZWN0ZWRCdWZmZXJSYW5nZSIsImlzRW1wdHkiLCJQQVVTRUQiLCJfcmVnaXN0ZXJDb21tYW5kc0NvbnRleHRNZW51QW5kT3BlbmVyIiwiZm9jdXNlZFByb2Nlc3MiLCJ2aWV3TW9kZWwiLCJCb29sZWFuIiwic2Vzc2lvbiIsImNhcGFiaWxpdGllcyIsInN1cHBvcnRzQ29uZGl0aW9uYWxCcmVha3BvaW50cyIsInN1cHBvcnRzVGVybWluYXRlVGhyZWFkc1JlcXVlc3QiLCJpc1JlbW90ZSIsImF2YWlsYWJsZVByb3ZpZGVycyIsImdldExhdW5jaEF0dGFjaFByb3ZpZGVyc0ZvckNvbm5lY3Rpb24iLCJzZXQiLCJfZ2V0U3VnZ2VzdGlvbnMiLCJyZXF1ZXN0IiwidGV4dCIsImVkaXRvciIsImdldFRleHQiLCJsaW5lcyIsInNwbGl0Iiwicm93IiwiYnVmZmVyUG9zaXRpb24iLCJzbGljZSIsImpvaW4iLCJmb2N1c2VkU3RhY2tGcmFtZSIsInN1cHBvcnRzQ29tcGxldGlvbnNSZXF1ZXN0IiwiY29tcGxldGlvbnMiLCJmcmFtZUlkIiwibWFwIiwiZGlzcGxheVRleHQiLCJzZXJpYWxpemUiLCJtb2RlbCIsInNvdXJjZUJyZWFrcG9pbnRzIiwiZ2V0QnJlYWtwb2ludHMiLCJmdW5jdGlvbkJyZWFrcG9pbnRzIiwiZ2V0RnVuY3Rpb25CcmVha3BvaW50cyIsImV4Y2VwdGlvbkJyZWFrcG9pbnRzIiwiZ2V0RXhjZXB0aW9uQnJlYWtwb2ludHMiLCJ3YXRjaEV4cHJlc3Npb25zIiwiZ2V0V2F0Y2hFeHByZXNzaW9ucyIsImUiLCJuYW1lIiwic2hvd0RlYnVnZ2VyIiwiaXNEZWJ1Z2dlclZpc2libGUiLCJ3b3Jrc3BhY2VEb2Nrc1Zpc2liaWxpdHkiLCJnZXRXb3Jrc3BhY2VEb2Nrc1Zpc2liaWxpdHkiLCJkZWFjdGl2YXRlIiwiZGlzcG9zZSIsImRpc3Bvc2FibGUiLCJhZGRPcGVuZXIiLCJ1cmkiLCJnZXRNb2RlbEZvckRlYnVnZ2VyVXJpIiwiaGlkZURlYnVnZ2VyVmlld3MiLCJzaG93Iiwic2hvd09ubHlJZkhpZGRlbiIsInNob3dEZWJ1Z2dlclZpZXdzIiwicHJvY2VzcyIsImRpc3BhdGNoIiwiZ2V0VmlldyIsIm9uRGlkQ2hhbmdlUHJvY2Vzc01vZGUiLCJkZWJ1Z2dlck1vZGVDaGFuZ2VkIiwib25EaWRDaGFuZ2VEZWJ1Z2dlckZvY3VzIiwicmVzZXRMYXlvdXQiLCJpc1JlYWRPbmx5IiwiZm9jdXNlZFRocmVhZCIsIkFuYWx5dGljc0V2ZW50cyIsIkRFQlVHR0VSX1NURVBfQ09OVElOVUUiLCJjb250aW51ZSIsInJlc3RhcnRQcm9jZXNzIiwiREVCVUdHRVJfU1RFUF9PVkVSIiwibmV4dCIsIkRFQlVHR0VSX1NURVBfSU5UTyIsInN0ZXBJbiIsIkRFQlVHR0VSX1NURVBfT1VUIiwic3RlcE91dCIsImxpbmVOdW1iZXIiLCJhZGRTb3VyY2VCcmVha3BvaW50IiwidG9nZ2xlU291cmNlQnJlYWtwb2ludCIsImVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzIiwiZW5hYmxlZCIsImJwSWQiLCJnZXRCcmVha3BvaW50QnlJZCIsInBhdGgiLCJjb250YWluZXIiLCJSZWFjdE1vdW50Um9vdEVsZW1lbnQiLCJSZWFjdERPTSIsInJlbmRlciIsInVubW91bnRDb21wb25lbnRBdE5vZGUiLCJ0ZXJtaW5hdGVUaHJlYWRzIiwiZm4iLCJnZXRQYXRoIiwiYnJlYWtwb2ludCIsInJlbW92ZUJyZWFrcG9pbnRzIiwiZ2V0SWQiLCJfcmVuZGVyQ29uZmlnRGlhbG9nIiwicGFuZWwiLCJhcmdzIiwiZGlhbG9nQ2xvc2VyIiwib3B0aW9ucyIsImRpc3BsYXlOYW1lIiwidmFsdWUiLCJzb3J0IiwiYSIsImIiLCJsb2NhbGVDb21wYXJlIiwibmV3VmFsdWUiLCJnZXRJdGVtIiwiZGlzcG9zYWJsZXMiLCJob3N0RWwiLCJkb2N1bWVudCIsImNyZWF0ZUVsZW1lbnQiLCJwYW5lIiwiYWRkTW9kYWxQYW5lbCIsImNsYXNzTmFtZSIsInBhcmVudEVsIiwicGFyZW50RWxlbWVudCIsInN0eWxlIiwibWF4V2lkdGgiLCJvbkRpZENoYW5nZVZpc2libGUiLCJ2aXNpYmxlIiwicmVtb3ZlIiwiREVCVUdHRVJfVE9HR0xFX0FUVEFDSF9ESUFMT0ciLCJkZXN0cm95Iiwic2VsZWN0ZWRUZXh0IiwiZ2V0VGV4dEluQnVmZmVyUmFuZ2UiLCJleHByIiwiZ2V0Q3Vyc29yQnVmZmVyUG9zaXRpb24iLCJ3YXRjaEV4cHJlc3Npb24iLCJ3b3JkTWF0Y2giLCJhZGRXYXRjaEV4cHJlc3Npb24iLCJydW5Ub0xvY2F0aW9uIiwic2VsZWN0aW9uIiwid2luZG93IiwiZ2V0U2VsZWN0aW9uIiwiY2xpY2tlZEVsZW1lbnQiLCJ0YXJnZXRDbGFzcyIsImNvcHlFbGVtZW50IiwiY2xvc2VzdCIsInRvU3RyaW5nIiwiY29udGFpbnMiLCJhbmNob3JOb2RlIiwiY2xpcGJvYXJkIiwid3JpdGUiLCJ0ZXh0Q29udGVudCIsImNhbGxzdGFja1RleHQiLCJnZXRGdWxsQ2FsbFN0YWNrIiwiZXhwZWN0ZWRTdGFjayIsImlzUGVuZGluZyIsInRha2UiLCJnZXRPckRlZmF1bHQiLCJpIiwiYmFzZW5hbWUiLCJzb3VyY2UiLCJyYW5nZSIsInN0YXJ0Iiwib3MiLCJFT0wiLCJ0cmltIiwiY29uc3VtZUN1cnJlbnRXb3JraW5nRGlyZWN0b3J5IiwiY3dkQXBpIiwidXBkYXRlU2VsZWN0ZWRDb25uZWN0aW9uIiwiZGlyZWN0b3J5IiwiY29ubiIsImNyZWF0ZVJlbW90ZVVyaSIsIm9ic2VydmVDd2QiLCJjcmVhdGVBdXRvY29tcGxldGVQcm92aWRlciIsImxhYmVscyIsInNlbGVjdG9yIiwiZmlsdGVyU3VnZ2VzdGlvbnMiLCJnZXRTdWdnZXN0aW9ucyIsImNvbnN1bWVDb25zb2xlIiwiY3JlYXRlQ29uc29sZSIsImNvbnN1bWVUZXJtaW5hbCIsInRlcm1pbmFsQXBpIiwiY29uc3VtZVJwY1NlcnZpY2UiLCJycGNTZXJ2aWNlIiwiY29uc3VtZVJlZ2lzdGVyRXhlY3V0b3IiLCJyZWdpc3RlckV4ZWN1dG9yIiwiY29uc3VtZURlYnVnZ2VyUHJvdmlkZXIiLCJwcm92aWRlciIsImFkZERlYnVnZ2VyUHJvdmlkZXIiLCJyZW1vdmVEZWJ1Z2dlclByb3ZpZGVyIiwiY29uc3VtZURlYnVnZ2VyQ29uZmlndXJhdGlvblByb3ZpZGVycyIsInByb3ZpZGVycyIsImlzQXJyYXkiLCJjb25zdW1lVG9vbEJhciIsImdldFRvb2xCYXIiLCJ0b29sQmFyIiwiYWRkQnV0dG9uIiwiaWNvbnNldCIsImljb24iLCJjYWxsYmFjayIsInRvb2x0aXAiLCJwcmlvcml0eSIsImVsZW1lbnQiLCJyZW1vdmVJdGVtcyIsImNvbnN1bWVOb3RpZmljYXRpb25zIiwicmFpc2VOYXRpdmVOb3RpZmljYXRpb24iLCJwcm92aWRlUmVtb3RlQ29udHJvbFNlcnZpY2UiLCJSZW1vdGVDb250cm9sU2VydmljZSIsImNvbnN1bWVEYXRhdGlwU2VydmljZSIsInNlcnZpY2UiLCJhZGRQcm92aWRlciIsIl9jcmVhdGVEYXRhdGlwUHJvdmlkZXIiLCJwcm92aWRlck5hbWUiLCJkYXRhdGlwIiwicG9zaXRpb24iLCJ2aWV3IiwiY3JlYXRlVmlldyIsImVsZW0iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQWdCQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFTQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSxvQkFBb0IsR0FBRyxrQkFBN0I7O0FBUUEsSUFBSUMsWUFBSjs7QUFDQSxJQUFJQyxRQUFKOztBQUNBLElBQUlDLGtCQUFKOztBQUNBLElBQUlD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RUFBdUUsNkNBQWtCRixPQUFsQixDQUF2RSxDQUFuQjs7QUFDQXRVLEVBQUFBLFlBQVksQ0FBQ2tFLEdBQWIsQ0FBaUIyRyxVQUFqQjs7QUFDQSxTQUFPQSxVQUFQO0FBQ0Q7O0FBRUQsU0FBUzJKLHNCQUFULEdBQW1EO0FBQ2pELFNBQU87QUFDTDtBQUNBQyxJQUFBQSxZQUFZLEVBQUUxVSxvQkFGVDtBQUdMK1QsSUFBQUEsUUFBUSxFQUFFLENBSEw7QUFJTFksSUFBQUEsT0FBTyxFQUFFLENBQUM3TCxNQUFELEVBQXFCOEwsUUFBckIsS0FBOEM7QUFDckQsYUFBTyxzQ0FBZ0J4VSxRQUFoQixFQUEwQjBJLE1BQTFCLEVBQWtDOEwsUUFBbEMsQ0FBUDtBQUNEO0FBTkksR0FBUDtBQVFEOztBQUVELFNBQVM1VCxrQkFBVCxDQUE0QjZJLEtBQTVCLEVBQXdEO0FBQ3RELE1BQUlnTCxJQUFJLEdBQUcsSUFBWDs7QUFDQSxNQUFJaEwsS0FBSyxZQUFZOUksOEJBQWpCLElBQTBDOEksS0FBSyxZQUFZNUksdUNBQS9ELEVBQStGO0FBQzdGNFQsSUFBQUEsSUFBSSxHQUFHaEwsS0FBSyxDQUFDaUwsVUFBTixFQUFQO0FBQ0Q7O0FBRUQsTUFBSUQsSUFBSSxJQUFJLElBQVosRUFBa0I7QUFDaEIsVUFBTUUsSUFBSSxHQUFHLHNDQUFnQkYsSUFBaEIsQ0FBYjtBQUNBRSxJQUFBQSxJQUFJLENBQUNoRyxTQUFMLEdBQWlCLG9CQUFqQjtBQUNBLFdBQU9nRyxJQUFQO0FBQ0Q7O0FBRUQsU0FBTyxJQUFQO0FBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7XHJcbiAgRGVidWdnZXJDb25maWdBY3Rpb24sXHJcbiAgRGVidWdnZXJMYXVuY2hBdHRhY2hQcm92aWRlcixcclxuICBOdWNsaWRlRGVidWdnZXJQcm92aWRlcixcclxuICBEZWJ1Z2dlckNvbmZpZ3VyYXRpb25Qcm92aWRlcixcclxufSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWRlYnVnZ2VyLWNvbW1vblwiXHJcbmltcG9ydCB0eXBlIHtcclxuICBDb25zb2xlU2VydmljZSxcclxuICBEYXRhdGlwUHJvdmlkZXIsXHJcbiAgRGF0YXRpcFNlcnZpY2UsXHJcbiAgUmVnaXN0ZXJFeGVjdXRvckZ1bmN0aW9uLFxyXG4gIFRlcm1pbmFsQXBpLFxyXG59IGZyb20gXCJhdG9tLWlkZS11aVwiXHJcbmltcG9ydCB0eXBlIHsgTnVjbGlkZVVyaSB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9udWNsaWRlVXJpXCJcclxuaW1wb3J0IHR5cGUgeyBTZXJpYWxpemVkU3RhdGUsIElCcmVha3BvaW50IH0gZnJvbSBcIi4vdHlwZXNcIlxyXG5cclxuaW1wb3J0IGlkeCBmcm9tIFwiaWR4XCJcclxuaW1wb3J0IHsgb2JzZXJ2ZVJlbW92ZWRIb3N0bmFtZXMgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtYXRvbS9wcm9qZWN0c1wiXHJcbmltcG9ydCBCcmVha3BvaW50TWFuYWdlciBmcm9tIFwiLi9CcmVha3BvaW50TWFuYWdlclwiXHJcbmltcG9ydCB7IEFuYWx5dGljc0V2ZW50cywgRGVidWdnZXJNb2RlIH0gZnJvbSBcIi4vY29uc3RhbnRzXCJcclxuaW1wb3J0IEJyZWFrcG9pbnRDb25maWdDb21wb25lbnQgZnJvbSBcIi4vdWkvQnJlYWtwb2ludENvbmZpZ0NvbXBvbmVudFwiXHJcbmltcG9ydCB7IGdldExpbmVGb3JFdmVudCB9IGZyb20gXCIuL3V0aWxzXCJcclxuaW1wb3J0IFVuaXZlcnNhbERpc3Bvc2FibGUgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL1VuaXZlcnNhbERpc3Bvc2FibGVcIlxyXG5pbXBvcnQgaW52YXJpYW50IGZyb20gXCJhc3NlcnRcIlxyXG5pbXBvcnQgeyB0cmFjayB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9hbmFseXRpY3NcIlxyXG5pbXBvcnQgUmVtb3RlQ29udHJvbFNlcnZpY2UgZnJvbSBcIi4vUmVtb3RlQ29udHJvbFNlcnZpY2VcIlxyXG5pbXBvcnQgRGVidWdnZXJVaU1vZGVsIGZyb20gXCIuL0RlYnVnZ2VyVWlNb2RlbFwiXHJcbmltcG9ydCBEZWJ1Z1NlcnZpY2UgZnJvbSBcIi4vdnNwL0RlYnVnU2VydmljZVwiXHJcbmltcG9ydCB7IGRlYnVnZ2VyRGF0YXRpcCB9IGZyb20gXCIuL0RlYnVnZ2VyRGF0YXRpcFwiXHJcbmltcG9ydCAqIGFzIFJlYWN0IGZyb20gXCJyZWFjdFwiXHJcbmltcG9ydCBSZWFjdERPTSBmcm9tIFwicmVhY3QtZG9tXCJcclxuaW1wb3J0IERlYnVnZ2VyTGF1bmNoQXR0YWNoVUkgZnJvbSBcIi4vdWkvRGVidWdnZXJMYXVuY2hBdHRhY2hVSVwiXHJcbmltcG9ydCB7IHJlbmRlclJlYWN0Um9vdCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9yZW5kZXJSZWFjdFJvb3RcIlxyXG5pbXBvcnQgbnVjbGlkZVVyaSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvbnVjbGlkZVVyaVwiXHJcbmltcG9ydCB7XHJcbiAgc2V0Tm90aWZpY2F0aW9uU2VydmljZSxcclxuICBzZXRDb25zb2xlU2VydmljZSxcclxuICBzZXRDb25zb2xlUmVnaXN0ZXJFeGVjdXRvcixcclxuICBzZXREYXRhdGlwU2VydmljZSxcclxuICBzZXRUZXJtaW5hbFNlcnZpY2UsXHJcbiAgc2V0UnBjU2VydmljZSxcclxuICBhZGREZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcixcclxufSBmcm9tIFwiLi9BdG9tU2VydmljZUNvbnRhaW5lclwiXHJcbmltcG9ydCB7IHdvcmRBdFBvc2l0aW9uLCB0cmltUmFuZ2UgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtYXRvbS9yYW5nZVwiXHJcbmltcG9ydCBEZWJ1Z2dlckxheW91dE1hbmFnZXIgZnJvbSBcIi4vdWkvRGVidWdnZXJMYXlvdXRNYW5hZ2VyXCJcclxuaW1wb3J0IERlYnVnZ2VyUGFuZVZpZXdNb2RlbCBmcm9tIFwiLi91aS9EZWJ1Z2dlclBhbmVWaWV3TW9kZWxcIlxyXG5pbXBvcnQgRGVidWdnZXJQYW5lQ29udGFpbmVyVmlld01vZGVsIGZyb20gXCIuL3VpL0RlYnVnZ2VyUGFuZUNvbnRhaW5lclZpZXdNb2RlbFwiXHJcbmltcG9ydCBvcyBmcm9tIFwib3NcIlxyXG5pbXBvcnQgbnVsbHRocm93cyBmcm9tIFwibnVsbHRocm93c1wiXHJcbmltcG9ydCBSZWFjdE1vdW50Um9vdEVsZW1lbnQgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL1JlYWN0TW91bnRSb290RWxlbWVudFwiXHJcbmltcG9ydCB7IHNvcnRNZW51R3JvdXBzIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL21lbnVVdGlsc1wiXHJcbmltcG9ydCBwYXNzZXNHSyBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvcGFzc2VzR0tcIlxyXG5cclxuY29uc3QgREFUQVRJUF9QQUNLQUdFX05BTUUgPSBcImRlYnVnZ2VyLWRhdGF0aXBcIlxyXG5cclxudHlwZSBMYXVuY2hBdHRhY2hEaWFsb2dBcmdzID0ge1xyXG4gIGRpYWxvZ01vZGU6IERlYnVnZ2VyQ29uZmlnQWN0aW9uLFxyXG4gIHNlbGVjdGVkVGFiTmFtZT86IHN0cmluZyxcclxuICBjb25maWc/OiB7IFtzdHJpbmddOiBtaXhlZCB9LFxyXG59XHJcblxyXG5sZXQgX2Rpc3Bvc2FibGVzOiBVbml2ZXJzYWxEaXNwb3NhYmxlXHJcbmxldCBfdWlNb2RlbDogRGVidWdnZXJVaU1vZGVsXHJcbmxldCBfYnJlYWtwb2ludE1hbmFnZXI6IEJyZWFrcG9pbnRNYW5hZ2VyXHJcbmxldCBfc2VydmljZTogRGVidWdTZXJ2aWNlXHJcbmxldCBfbGF5b3V0TWFuYWdlcjogRGVidWdnZXJMYXlvdXRNYW5hZ2VyXHJcbmxldCBfc2VsZWN0ZWREZWJ1Z0Nvbm5lY3Rpb246ID9zdHJpbmdcclxubGV0IF92aXNpYmxlTGF1bmNoQXR0YWNoRGlhbG9nTW9kZTogP0RlYnVnZ2VyQ29uZmlnQWN0aW9uXHJcbmxldCBfbGF1Y2hBdHRhY2hEaWFsb2dDbG9zZXI6ID8oKSA9PiB2b2lkXHJcbmxldCBfY29ubmVjdGlvblByb3ZpZGVyczogTWFwPHN0cmluZywgQXJyYXk8RGVidWdnZXJMYXVuY2hBdHRhY2hQcm92aWRlcj4+XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYWN0aXZhdGUoc3RhdGU6ID9TZXJpYWxpemVkU3RhdGUpIHtcclxuICBhdG9tLnZpZXdzLmFkZFZpZXdQcm92aWRlcihEZWJ1Z2dlclBhbmVWaWV3TW9kZWwsIGNyZWF0ZURlYnVnZ2VyVmlldylcclxuICBhdG9tLnZpZXdzLmFkZFZpZXdQcm92aWRlcihEZWJ1Z2dlclBhbmVDb250YWluZXJWaWV3TW9kZWwsIGNyZWF0ZURlYnVnZ2VyVmlldylcclxuICBfc2VydmljZSA9IG5ldyBEZWJ1Z1NlcnZpY2Uoc3RhdGUpXHJcbiAgX3VpTW9kZWwgPSBuZXcgRGVidWdnZXJVaU1vZGVsKF9zZXJ2aWNlKVxyXG4gIF9icmVha3BvaW50TWFuYWdlciA9IG5ldyBCcmVha3BvaW50TWFuYWdlcihfc2VydmljZSlcclxuICBfc2VsZWN0ZWREZWJ1Z0Nvbm5lY3Rpb24gPSBudWxsXHJcbiAgX3Zpc2libGVMYXVuY2hBdHRhY2hEaWFsb2dNb2RlID0gbnVsbFxyXG4gIF9sYXVjaEF0dGFjaERpYWxvZ0Nsb3NlciA9IG51bGxcclxuICBfY29ubmVjdGlvblByb3ZpZGVycyA9IG5ldyBNYXAoKVxyXG4gIF9sYXlvdXRNYW5hZ2VyID0gbmV3IERlYnVnZ2VyTGF5b3V0TWFuYWdlcihfc2VydmljZSwgc3RhdGUpXHJcblxyXG4gIC8vIE1hbnVhbGx5IG1hbmlwdWxhdGUgdGhlIGBEZWJ1Z2dlcmAgdG9wIGxldmVsIG1lbnUgb3JkZXIuXHJcbiAgY29uc3QgaW5zZXJ0SW5kZXggPSBhdG9tLm1lbnUudGVtcGxhdGUuZmluZEluZGV4KChpdGVtKSA9PiBpdGVtLnJvbGUgPT09IFwid2luZG93XCIgfHwgaXRlbS5yb2xlID09PSBcImhlbHBcIilcclxuICBpZiAoaW5zZXJ0SW5kZXggIT09IC0xKSB7XHJcbiAgICBjb25zdCBkZXVnZ2VySW5kZXggPSBhdG9tLm1lbnUudGVtcGxhdGUuZmluZEluZGV4KChpdGVtKSA9PiBpdGVtLmxhYmVsID09PSBcIkRlYnVnZ2VyXCIpXHJcbiAgICBjb25zdCBtZW51SXRlbSA9IGF0b20ubWVudS50ZW1wbGF0ZS5zcGxpY2UoZGV1Z2dlckluZGV4LCAxKVswXVxyXG4gICAgY29uc3QgbmV3SW5kZXggPSBpbnNlcnRJbmRleCA+IGRldWdnZXJJbmRleCA/IGluc2VydEluZGV4IC0gMSA6IGluc2VydEluZGV4XHJcbiAgICBhdG9tLm1lbnUudGVtcGxhdGUuc3BsaWNlKG5ld0luZGV4LCAwLCBtZW51SXRlbSlcclxuICAgIGF0b20ubWVudS51cGRhdGUoKVxyXG4gIH1cclxuXHJcbiAgY29uc3QgcmVtb3ZlZEhvc3RuYW1lcyA9IG9ic2VydmVSZW1vdmVkSG9zdG5hbWVzKClcclxuXHJcbiAgX2Rpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoXHJcbiAgICBfbGF5b3V0TWFuYWdlcixcclxuICAgIF9zZXJ2aWNlLFxyXG4gICAgX3VpTW9kZWwsXHJcbiAgICBfYnJlYWtwb2ludE1hbmFnZXIsXHJcbiAgICByZW1vdmVkSG9zdG5hbWVzLnN1YnNjcmliZSgoaG9zdG5hbWUpID0+IHtcclxuICAgICAgX3NlcnZpY2VcclxuICAgICAgICAuZ2V0TW9kZWwoKVxyXG4gICAgICAgIC5nZXRQcm9jZXNzZXMoKVxyXG4gICAgICAgIC5mb3JFYWNoKChkZWJ1Z2dlclByb2Nlc3MpID0+IHtcclxuICAgICAgICAgIGNvbnN0IGRlYnVnZ2VlVGFyZ2V0VXJpID0gZGVidWdnZXJQcm9jZXNzLmNvbmZpZ3VyYXRpb24udGFyZ2V0VXJpXHJcbiAgICAgICAgICBpZiAobnVjbGlkZVVyaS5pc0xvY2FsKGRlYnVnZ2VlVGFyZ2V0VXJpKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gLy8gTm90aGluZyB0byBkbyBpZiBvdXIgZGVidWcgc2Vzc2lvbiBpcyBsb2NhbC5cclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGlmIChudWNsaWRlVXJpLmdldEhvc3RuYW1lKGRlYnVnZ2VlVGFyZ2V0VXJpKSA9PT0gaG9zdG5hbWUpIHtcclxuICAgICAgICAgICAgX3NlcnZpY2Uuc3RvcFByb2Nlc3MoZGVidWdnZXJQcm9jZXNzKVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pXHJcbiAgICB9KSxcclxuICAgIF91aU1vZGVsLm9uQ29ubmVjdGlvbnNVcGRhdGVkKCgpID0+IHtcclxuICAgICAgY29uc3QgbmV3Q29ubmVjdGlvbnMgPSBfdWlNb2RlbC5nZXRDb25uZWN0aW9ucygpXHJcbiAgICAgIGNvbnN0IGtleXMgPSBBcnJheS5mcm9tKF9jb25uZWN0aW9uUHJvdmlkZXJzLmtleXMoKSlcclxuXHJcbiAgICAgIGNvbnN0IHJlbW92ZWRDb25uZWN0aW9ucyA9IGtleXMuZmlsdGVyKChjb25uZWN0aW9uKSA9PiBuZXdDb25uZWN0aW9ucy5maW5kKChpdGVtKSA9PiBpdGVtID09PSBjb25uZWN0aW9uKSA9PSBudWxsKVxyXG4gICAgICBjb25zdCBhZGRlZENvbm5lY3Rpb25zID0gbmV3Q29ubmVjdGlvbnMuZmlsdGVyKChjb25uZWN0aW9uKSA9PiBrZXlzLmZpbmQoKGl0ZW0pID0+IGl0ZW0gPT09IGNvbm5lY3Rpb24pID09IG51bGwpXHJcblxyXG4gICAgICBmb3IgKGNvbnN0IGtleSBvZiByZW1vdmVkQ29ubmVjdGlvbnMpIHtcclxuICAgICAgICBfY29ubmVjdGlvblByb3ZpZGVycy5kZWxldGUoa2V5KVxyXG4gICAgICB9XHJcblxyXG4gICAgICBmb3IgKGNvbnN0IGNvbm5lY3Rpb24gb2YgYWRkZWRDb25uZWN0aW9ucykge1xyXG4gICAgICAgIF9zZXRQcm92aWRlcnNGb3JDb25uZWN0aW9uKGNvbm5lY3Rpb24pXHJcbiAgICAgIH1cclxuICAgIH0pLFxyXG4gICAgX3VpTW9kZWwub25Qcm92aWRlcnNVcGRhdGVkKCgpID0+IHtcclxuICAgICAgY29uc3QgY29ubmVjdGlvbnMgPSBfdWlNb2RlbC5nZXRDb25uZWN0aW9ucygpXHJcbiAgICAgIGZvciAoY29uc3QgY29ubmVjdGlvbiBvZiBjb25uZWN0aW9ucykge1xyXG4gICAgICAgIF9zZXRQcm92aWRlcnNGb3JDb25uZWN0aW9uKGNvbm5lY3Rpb24pXHJcbiAgICAgIH1cclxuICAgIH0pLFxyXG4gICAgLy8gQ29tbWFuZHMuXHJcbiAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIHtcclxuICAgICAgXCJkZWJ1Z2dlcjpzaG93LWF0dGFjaC1kaWFsb2dcIjogKGV2ZW50KSA9PiB7XHJcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWRUYWJOYW1lOiBhbnkgPSBpZHgoZXZlbnQsIChfKSA9PiBfLmRldGFpbC5zZWxlY3RlZFRhYk5hbWUpXHJcbiAgICAgICAgY29uc3QgY29uZmlnOiBhbnkgPSBpZHgoZXZlbnQsIChfKSA9PiBfLmRldGFpbC5jb25maWcpXHJcbiAgICAgICAgX3Nob3dMYXVuY2hBdHRhY2hEaWFsb2coe1xyXG4gICAgICAgICAgZGlhbG9nTW9kZTogXCJhdHRhY2hcIixcclxuICAgICAgICAgIHNlbGVjdGVkVGFiTmFtZSxcclxuICAgICAgICAgIGNvbmZpZyxcclxuICAgICAgICB9KVxyXG4gICAgICB9LFxyXG4gICAgfSksXHJcbiAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIHtcclxuICAgICAgXCJkZWJ1Z2dlcjpzaG93LWxhdW5jaC1kaWFsb2dcIjogKGV2ZW50KSA9PiB7XHJcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWRUYWJOYW1lOiBhbnkgPSBldmVudD8uZGV0YWlsPy5zZWxlY3RlZFRhYk5hbWVcclxuICAgICAgICBjb25zdCBjb25maWc6IGFueSA9IGV2ZW50Py5kZXRhaWw/LmNvbmZpZ1xyXG4gICAgICAgIF9zaG93TGF1bmNoQXR0YWNoRGlhbG9nKHtcclxuICAgICAgICAgIGRpYWxvZ01vZGU6IFwibGF1bmNoXCIsXHJcbiAgICAgICAgICBzZWxlY3RlZFRhYk5hbWUsXHJcbiAgICAgICAgICBjb25maWcsXHJcbiAgICAgICAgfSlcclxuICAgICAgfSxcclxuICAgIH0pLFxyXG4gICAgYXRvbS5jb21tYW5kcy5hZGQoXCJhdG9tLXdvcmtzcGFjZVwiLCB7XHJcbiAgICAgIFwiZGVidWdnZXI6Y29udGludWUtZGVidWdnaW5nXCI6IF9jb250aW51ZS5iaW5kKHRoaXMpLFxyXG4gICAgfSksXHJcbiAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIHtcclxuICAgICAgXCJkZWJ1Z2dlcjpzdG9wLWRlYnVnZ2luZ1wiOiBfc3RvcC5iaW5kKHRoaXMpLFxyXG4gICAgfSksXHJcbiAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIHtcclxuICAgICAgXCJkZWJ1Z2dlcjpyZXN0YXJ0LWRlYnVnZ2luZ1wiOiBfcmVzdGFydC5iaW5kKHRoaXMpLFxyXG4gICAgfSksXHJcbiAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIHtcclxuICAgICAgXCJkZWJ1Z2dlcjpzdGVwLW92ZXJcIjogX3N0ZXBPdmVyLmJpbmQodGhpcyksXHJcbiAgICB9KSxcclxuICAgIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwge1xyXG4gICAgICBcImRlYnVnZ2VyOnN0ZXAtaW50b1wiOiBfc3RlcEludG8uYmluZCh0aGlzKSxcclxuICAgIH0pLFxyXG4gICAgYXRvbS5jb21tYW5kcy5hZGQoXCJhdG9tLXdvcmtzcGFjZVwiLCB7XHJcbiAgICAgIFwiZGVidWdnZXI6c3RlcC1vdXRcIjogX3N0ZXBPdXQuYmluZCh0aGlzKSxcclxuICAgIH0pLFxyXG4gICAgYXRvbS5jb21tYW5kcy5hZGQoXCJhdG9tLXdvcmtzcGFjZVwiLCB7XHJcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBudWNsaWRlLWludGVybmFsL2F0b20tYXBpc1xyXG4gICAgICBcImRlYnVnZ2VyOmFkZC1icmVha3BvaW50XCI6IF9hZGRCcmVha3BvaW50LmJpbmQodGhpcyksXHJcbiAgICB9KSxcclxuICAgIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwge1xyXG4gICAgICBcImRlYnVnZ2VyOnRvZ2dsZS1icmVha3BvaW50XCI6IF90b2dnbGVCcmVha3BvaW50LmJpbmQodGhpcyksXHJcbiAgICB9KSxcclxuICAgIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwge1xyXG4gICAgICBcImRlYnVnZ2VyOnRvZ2dsZS1icmVha3BvaW50LWVuYWJsZWRcIjogX3RvZ2dsZUJyZWFrcG9pbnRFbmFibGVkLmJpbmQodGhpcyksXHJcbiAgICB9KSxcclxuICAgIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwge1xyXG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbnVjbGlkZS1pbnRlcm5hbC9hdG9tLWFwaXNcclxuICAgICAgXCJkZWJ1Z2dlcjplZGl0LWJyZWFrcG9pbnRcIjogX2NvbmZpZ3VyZUJyZWFrcG9pbnQuYmluZCh0aGlzKSxcclxuICAgIH0pLFxyXG4gICAgYXRvbS5jb21tYW5kcy5hZGQoXCIuZGVidWdnZXItdGhyZWFkLWxpc3QtaXRlbVwiLCB7XHJcbiAgICAgIFwiZGVidWdnZXI6dGVybWluYXRlLXRocmVhZFwiOiBfdGVybWluYXRlVGhyZWFkLmJpbmQodGhpcyksXHJcbiAgICB9KSxcclxuICAgIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwge1xyXG4gICAgICBcImRlYnVnZ2VyOnJlbW92ZS1hbGwtYnJlYWtwb2ludHNcIjogX2RlbGV0ZUFsbEJyZWFrcG9pbnRzLmJpbmQodGhpcyksXHJcbiAgICB9KSxcclxuICAgIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwge1xyXG4gICAgICBcImRlYnVnZ2VyOmVuYWJsZS1hbGwtYnJlYWtwb2ludHNcIjogX2VuYWJsZUFsbEJyZWFrcG9pbnRzLmJpbmQodGhpcyksXHJcbiAgICB9KSxcclxuICAgIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwge1xyXG4gICAgICBcImRlYnVnZ2VyOmRpc2FibGUtYWxsLWJyZWFrcG9pbnRzXCI6IF9kaXNhYmxlQWxsQnJlYWtwb2ludHMuYmluZCh0aGlzKSxcclxuICAgIH0pLFxyXG4gICAgYXRvbS5jb21tYW5kcy5hZGQoXCJhdG9tLXdvcmtzcGFjZVwiLCB7XHJcbiAgICAgIFwiZGVidWdnZXI6cmVtb3ZlLWJyZWFrcG9pbnRcIjogX2RlbGV0ZUJyZWFrcG9pbnQuYmluZCh0aGlzKSxcclxuICAgIH0pLFxyXG4gICAgYXRvbS5jb21tYW5kcy5hZGQoXCJhdG9tLXdvcmtzcGFjZVwiLCB7XHJcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBudWNsaWRlLWludGVybmFsL2F0b20tYXBpc1xyXG4gICAgICBcImRlYnVnZ2VyOmFkZC10by13YXRjaFwiOiBfYWRkVG9XYXRjaC5iaW5kKHRoaXMpLFxyXG4gICAgfSksXHJcbiAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIHtcclxuICAgICAgXCJkZWJ1Z2dlcjpydW4tdG8tbG9jYXRpb25cIjogX3J1blRvTG9jYXRpb24uYmluZCh0aGlzKSxcclxuICAgIH0pLFxyXG4gICAgYXRvbS5jb21tYW5kcy5hZGQoXCIuZGVidWdnZXItZXhwcmVzc2lvbi12YWx1ZS1saXN0XCIsIHtcclxuICAgICAgXCJkZWJ1Z2dlcjpjb3B5LWRlYnVnZ2VyLWV4cHJlc3Npb24tdmFsdWVcIjogX2NvcHlEZWJ1Z2dlckV4cHJlc3Npb25WYWx1ZS5iaW5kKHRoaXMpLFxyXG4gICAgfSksXHJcbiAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIHtcclxuICAgICAgXCJkZWJ1Z2dlcjpjb3B5LWRlYnVnZ2VyLWNhbGxzdGFja1wiOiBfY29weURlYnVnZ2VyQ2FsbHN0YWNrLmJpbmQodGhpcyksXHJcbiAgICB9KSxcclxuICAgIC8vIENvbnRleHQgTWVudSBJdGVtcy5cclxuICAgIGF0b20uY29udGV4dE1lbnUuYWRkKHtcclxuICAgICAgXCIuZGVidWdnZXItYnJlYWtwb2ludC1saXN0XCI6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBsYWJlbDogXCJFbmFibGUgQWxsIEJyZWFrcG9pbnRzXCIsXHJcbiAgICAgICAgICBjb21tYW5kOiBcImRlYnVnZ2VyOmVuYWJsZS1hbGwtYnJlYWtwb2ludHNcIixcclxuICAgICAgICB9LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgIGxhYmVsOiBcIkRpc2FibGUgQWxsIEJyZWFrcG9pbnRzXCIsXHJcbiAgICAgICAgICBjb21tYW5kOiBcImRlYnVnZ2VyOmRpc2FibGUtYWxsLWJyZWFrcG9pbnRzXCIsXHJcbiAgICAgICAgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBsYWJlbDogXCJSZW1vdmUgQWxsIEJyZWFrcG9pbnRzXCIsXHJcbiAgICAgICAgICBjb21tYW5kOiBcImRlYnVnZ2VyOnJlbW92ZS1hbGwtYnJlYWtwb2ludHNcIixcclxuICAgICAgICB9LFxyXG4gICAgICAgIHsgdHlwZTogXCJzZXBhcmF0b3JcIiB9LFxyXG4gICAgICBdLFxyXG4gICAgICBcIi5kZWJ1Z2dlci1icmVha3BvaW50XCI6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBsYWJlbDogXCJFZGl0IGJyZWFrcG9pbnQuLi5cIixcclxuICAgICAgICAgIGNvbW1hbmQ6IFwiZGVidWdnZXI6ZWRpdC1icmVha3BvaW50XCIsXHJcbiAgICAgICAgICBzaG91bGREaXNwbGF5OiAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgYnAgPSBfZ2V0QnJlYWtwb2ludEZyb21FdmVudChldmVudClcclxuICAgICAgICAgICAgcmV0dXJuIGJwICE9IG51bGwgJiYgX3N1cHBvcnRzQ29uZGl0aW9uYWxCcmVha3BvaW50cygpXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgbGFiZWw6IFwiUmVtb3ZlIEJyZWFrcG9pbnRcIixcclxuICAgICAgICAgIGNvbW1hbmQ6IFwiZGVidWdnZXI6cmVtb3ZlLWJyZWFrcG9pbnRcIixcclxuICAgICAgICB9LFxyXG4gICAgICAgIHsgdHlwZTogXCJzZXBhcmF0b3JcIiB9LFxyXG4gICAgICBdLFxyXG4gICAgICBcIi5kZWJ1Z2dlci10aHJlYWQtbGlzdC1pdGVtXCI6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBsYWJlbDogXCJUZXJtaW5hdGUgdGhyZWFkXCIsXHJcbiAgICAgICAgICBjb21tYW5kOiBcImRlYnVnZ2VyOnRlcm1pbmF0ZS10aHJlYWRcIixcclxuICAgICAgICAgIHNob3VsZERpc3BsYXk6IChldmVudCkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB0YXJnZXQ6IEhUTUxFbGVtZW50ID0gZXZlbnQudGFyZ2V0XHJcbiAgICAgICAgICAgIGlmICh0YXJnZXQuZGF0YXNldC50aHJlYWRpZCkge1xyXG4gICAgICAgICAgICAgIGNvbnN0IHRocmVhZElkID0gcGFyc2VJbnQodGFyZ2V0LmRhdGFzZXQudGhyZWFkaWQsIDEwKVxyXG4gICAgICAgICAgICAgIGlmICghTnVtYmVyLmlzTmFOKHRocmVhZElkKSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIF9zdXBwb3J0c1Rlcm1pbmF0ZVRocmVhZHNSZXF1ZXN0KCkgJiYgIV9pc1JlYWRPbmx5VGFyZ2V0KClcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICAgIFwiLmRlYnVnZ2VyLWNhbGxzdGFjay10YWJsZVwiOiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgbGFiZWw6IFwiQ29weSBDYWxsc3RhY2tcIixcclxuICAgICAgICAgIGNvbW1hbmQ6IFwiZGVidWdnZXI6Y29weS1kZWJ1Z2dlci1jYWxsc3RhY2tcIixcclxuICAgICAgICB9LFxyXG4gICAgICBdLFxyXG4gICAgICBcIi5kZWJ1Z2dlci1leHByZXNzaW9uLXZhbHVlLWxpc3RcIjogW1xyXG4gICAgICAgIHtcclxuICAgICAgICAgIGxhYmVsOiBcIkNvcHlcIixcclxuICAgICAgICAgIGNvbW1hbmQ6IFwiZGVidWdnZXI6Y29weS1kZWJ1Z2dlci1leHByZXNzaW9uLXZhbHVlXCIsXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgICAgXCJhdG9tLXRleHQtZWRpdG9yXCI6IFtcclxuICAgICAgICB7IHR5cGU6IFwic2VwYXJhdG9yXCIgfSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICBsYWJlbDogXCJEZWJ1Z2dlclwiLFxyXG4gICAgICAgICAgc3VibWVudTogW1xyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgbGFiZWw6IFwiVG9nZ2xlIEJyZWFrcG9pbnRcIixcclxuICAgICAgICAgICAgICBjb21tYW5kOiBcImRlYnVnZ2VyOnRvZ2dsZS1icmVha3BvaW50XCIsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICBsYWJlbDogXCJUb2dnbGUgQnJlYWtwb2ludCBlbmFibGVkL2Rpc2FibGVkXCIsXHJcbiAgICAgICAgICAgICAgY29tbWFuZDogXCJkZWJ1Z2dlcjp0b2dnbGUtYnJlYWtwb2ludC1lbmFibGVkXCIsXHJcbiAgICAgICAgICAgICAgc2hvdWxkRGlzcGxheTogKGV2ZW50KSA9PlxyXG4gICAgICAgICAgICAgICAgX2V4ZWN1dGVXaXRoRWRpdG9yUGF0aChcclxuICAgICAgICAgICAgICAgICAgZXZlbnQsXHJcbiAgICAgICAgICAgICAgICAgIChmaWxlUGF0aCwgbGluZSkgPT4gX3NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50QXRMaW5lKGZpbGVQYXRoLCBsaW5lKSAhPSBudWxsXHJcbiAgICAgICAgICAgICAgICApIHx8IGZhbHNlLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgbGFiZWw6IFwiRWRpdCBCcmVha3BvaW50Li4uXCIsXHJcbiAgICAgICAgICAgICAgY29tbWFuZDogXCJkZWJ1Z2dlcjplZGl0LWJyZWFrcG9pbnRcIixcclxuICAgICAgICAgICAgICBzaG91bGREaXNwbGF5OiAoZXZlbnQpID0+XHJcbiAgICAgICAgICAgICAgICBfZXhlY3V0ZVdpdGhFZGl0b3JQYXRoKGV2ZW50LCAoZmlsZVBhdGgsIGxpbmUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgY29uc3QgYnAgPSBfc2VydmljZS5nZXRNb2RlbCgpLmdldEJyZWFrcG9pbnRBdExpbmUoZmlsZVBhdGgsIGxpbmUpXHJcbiAgICAgICAgICAgICAgICAgIHJldHVybiBicCAhPSBudWxsICYmIF9zdXBwb3J0c0NvbmRpdGlvbmFsQnJlYWtwb2ludHMoKVxyXG4gICAgICAgICAgICAgICAgfSkgfHwgZmFsc2UsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICBsYWJlbDogXCJBZGQgdG8gV2F0Y2hcIixcclxuICAgICAgICAgICAgICBjb21tYW5kOiBcImRlYnVnZ2VyOmFkZC10by13YXRjaFwiLFxyXG4gICAgICAgICAgICAgIHNob3VsZERpc3BsYXk6IChldmVudCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dEVkaXRvciA9IGF0b20ud29ya3NwYWNlLmdldEFjdGl2ZVRleHRFZGl0b3IoKVxyXG4gICAgICAgICAgICAgICAgaWYgKF9zZXJ2aWNlLmdldERlYnVnZ2VyTW9kZSgpID09PSBEZWJ1Z2dlck1vZGUuU1RPUFBFRCB8fCB0ZXh0RWRpdG9yID09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGV4dEVkaXRvci5nZXRTZWxlY3Rpb25zKCkubGVuZ3RoID09PSAxICYmICF0ZXh0RWRpdG9yLmdldFNlbGVjdGVkQnVmZmVyUmFuZ2UoKS5pc0VtcHR5KClcclxuICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgbGFiZWw6IFwiUnVuIHRvIExvY2F0aW9uXCIsXHJcbiAgICAgICAgICAgICAgY29tbWFuZDogXCJkZWJ1Z2dlcjpydW4tdG8tbG9jYXRpb25cIixcclxuICAgICAgICAgICAgICBzaG91bGREaXNwbGF5OiAoZXZlbnQpID0+IF9zZXJ2aWNlLmdldERlYnVnZ2VyTW9kZSgpID09PSBEZWJ1Z2dlck1vZGUuUEFVU0VEICYmICFfaXNSZWFkT25seVRhcmdldCgpLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgXSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIHsgdHlwZTogXCJzZXBhcmF0b3JcIiB9LFxyXG4gICAgICBdLFxyXG4gICAgfSksXHJcbiAgICBfcmVnaXN0ZXJDb21tYW5kc0NvbnRleHRNZW51QW5kT3BlbmVyKClcclxuICApXHJcblxyXG4gIHNvcnRNZW51R3JvdXBzKFtcIkRlYnVnZ2VyXCJdKVxyXG59XHJcblxyXG5mdW5jdGlvbiBfc3VwcG9ydHNDb25kaXRpb25hbEJyZWFrcG9pbnRzKCk6IGJvb2xlYW4ge1xyXG4gIC8vIElmIGN1cnJlbnRseSBkZWJ1Z2dpbmcsIHJldHVybiB3aGV0aGVyIG9yIG5vdCB0aGUgY3VycmVudCBkZWJ1Z2dlciBzdXBwb3J0c1xyXG4gIGNvbnN0IHsgZm9jdXNlZFByb2Nlc3MgfSA9IF9zZXJ2aWNlLnZpZXdNb2RlbFxyXG4gIGlmIChmb2N1c2VkUHJvY2VzcyA9PSBudWxsKSB7XHJcbiAgICAvLyBJZiBub3QgY3VycmVudGx5IGRlYnVnZ2luZywgcmV0dXJuIGlmIGFueSBvZiB0aGUgZGVidWdnZXJzIHRoYXQgc3VwcG9ydFxyXG4gICAgLy8gdGhlIGZpbGUgZXh0ZW5zaW9uIHRoaXMgYnAgaXMgaW4gc3VwcG9ydCBjb25kaXRpb25zLlxyXG4gICAgLy8gVE9ETyhlcmljYmx1ZSk6IGhhdmUgcHJvdmlkZXJzIHJlZ2lzdGVyIHRoZWlyIGZpbGUgZXh0ZW5zaW9ucyBhbmQgZmlsdGVyIGNvcnJlY3RseSBoZXJlLlxyXG4gICAgcmV0dXJuIHRydWVcclxuICB9IGVsc2Uge1xyXG4gICAgcmV0dXJuIEJvb2xlYW4oZm9jdXNlZFByb2Nlc3Muc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNDb25kaXRpb25hbEJyZWFrcG9pbnRzKVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gX3N1cHBvcnRzVGVybWluYXRlVGhyZWFkc1JlcXVlc3QoKTogYm9vbGVhbiB7XHJcbiAgLy8gSWYgY3VycmVudGx5IGRlYnVnZ2luZywgcmV0dXJuIHdoZXRoZXIgb3Igbm90IHRoZSBjdXJyZW50IGRlYnVnZ2VyIHN1cHBvcnRzXHJcbiAgY29uc3QgeyBmb2N1c2VkUHJvY2VzcyB9ID0gX3NlcnZpY2Uudmlld01vZGVsXHJcbiAgaWYgKGZvY3VzZWRQcm9jZXNzID09IG51bGwpIHtcclxuICAgIHJldHVybiBmYWxzZVxyXG4gIH0gZWxzZSB7XHJcbiAgICByZXR1cm4gQm9vbGVhbihmb2N1c2VkUHJvY2Vzcy5zZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c1Rlcm1pbmF0ZVRocmVhZHNSZXF1ZXN0KVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gX3NldFByb3ZpZGVyc0ZvckNvbm5lY3Rpb24oY29ubmVjdGlvbjogTnVjbGlkZVVyaSk6IHZvaWQge1xyXG4gIGNvbnN0IGtleSA9IG51Y2xpZGVVcmkuaXNSZW1vdGUoY29ubmVjdGlvbikgPyBudWNsaWRlVXJpLmdldEhvc3RuYW1lKGNvbm5lY3Rpb24pIDogXCJsb2NhbFwiXHJcbiAgY29uc3QgYXZhaWxhYmxlUHJvdmlkZXJzID0gX3VpTW9kZWwuZ2V0TGF1bmNoQXR0YWNoUHJvdmlkZXJzRm9yQ29ubmVjdGlvbihjb25uZWN0aW9uKVxyXG4gIF9jb25uZWN0aW9uUHJvdmlkZXJzLnNldChrZXksIGF2YWlsYWJsZVByb3ZpZGVycylcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gX2dldFN1Z2dlc3Rpb25zKHJlcXVlc3Q6IGF0b20kQXV0b2NvbXBsZXRlUmVxdWVzdCk6IFByb21pc2U8P0FycmF5PGF0b20kQXV0b2NvbXBsZXRlU3VnZ2VzdGlvbj4+IHtcclxuICBsZXQgdGV4dCA9IHJlcXVlc3QuZWRpdG9yLmdldFRleHQoKVxyXG4gIGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdChcIlxcblwiKVxyXG4gIGNvbnN0IHsgcm93IH0gPSByZXF1ZXN0LmJ1ZmZlclBvc2l0aW9uXHJcbiAgLy8gT25seSBrZWVwIHRoZSBsaW5lcyB1cCB0byBhbmQgaW5jbHVkaW5nIHRoZSBidWZmZXIgcG9zaXRpb24gcm93LlxyXG4gIHRleHQgPSBsaW5lcy5zbGljZSgwLCByb3cgKyAxKS5qb2luKFwiXFxuXCIpXHJcbiAgY29uc3QgeyBmb2N1c2VkU3RhY2tGcmFtZSwgZm9jdXNlZFByb2Nlc3MgfSA9IF9zZXJ2aWNlLnZpZXdNb2RlbFxyXG4gIGlmIChcclxuICAgIGZvY3VzZWRQcm9jZXNzID09IG51bGwgfHxcclxuICAgIGZvY3VzZWRTdGFja0ZyYW1lID09IG51bGwgfHxcclxuICAgICFCb29sZWFuKGZvY3VzZWRQcm9jZXNzLnNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzQ29tcGxldGlvbnNSZXF1ZXN0KVxyXG4gICkge1xyXG4gICAgcmV0dXJuIFtdXHJcbiAgfSBlbHNlIHtcclxuICAgIGNvbnN0IGNvbXBsZXRpb25zID0gYXdhaXQgZm9jdXNlZFByb2Nlc3MuY29tcGxldGlvbnMoZm9jdXNlZFN0YWNrRnJhbWUuZnJhbWVJZCwgdGV4dCwgcmVxdWVzdC5idWZmZXJQb3NpdGlvbiwgMClcclxuICAgIHJldHVybiBjb21wbGV0aW9ucy5tYXAoKGl0ZW0pID0+ICh7XHJcbiAgICAgIGRpc3BsYXlUZXh0OiBpdGVtLmxhYmVsLFxyXG4gICAgICB0ZXh0OiBpdGVtLnRleHQgPT0gbnVsbCA/IGl0ZW0ubGFiZWwgOiBpdGVtLnRleHQsXHJcbiAgICAgIHR5cGU6IGl0ZW0udHlwZSxcclxuICAgIH0pKVxyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHNlcmlhbGl6ZSgpOiBTZXJpYWxpemVkU3RhdGUge1xyXG4gIGNvbnN0IG1vZGVsID0gX3NlcnZpY2UuZ2V0TW9kZWwoKVxyXG4gIGNvbnN0IHN0YXRlID0ge1xyXG4gICAgc291cmNlQnJlYWtwb2ludHM6IG1vZGVsLmdldEJyZWFrcG9pbnRzKCksXHJcbiAgICBmdW5jdGlvbkJyZWFrcG9pbnRzOiBtb2RlbC5nZXRGdW5jdGlvbkJyZWFrcG9pbnRzKCksXHJcbiAgICBleGNlcHRpb25CcmVha3BvaW50czogbW9kZWwuZ2V0RXhjZXB0aW9uQnJlYWtwb2ludHMoKSxcclxuICAgIHdhdGNoRXhwcmVzc2lvbnM6IG1vZGVsLmdldFdhdGNoRXhwcmVzc2lvbnMoKS5tYXAoKGUpID0+IGUubmFtZSksXHJcbiAgICBzaG93RGVidWdnZXI6IF9sYXlvdXRNYW5hZ2VyLmlzRGVidWdnZXJWaXNpYmxlKCksXHJcbiAgICB3b3Jrc3BhY2VEb2Nrc1Zpc2liaWxpdHk6IF9sYXlvdXRNYW5hZ2VyLmdldFdvcmtzcGFjZURvY2tzVmlzaWJpbGl0eSgpLFxyXG4gIH1cclxuICByZXR1cm4gc3RhdGVcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGRlYWN0aXZhdGUoKSB7XHJcbiAgX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKVxyXG59XHJcblxyXG5mdW5jdGlvbiBfcmVnaXN0ZXJDb21tYW5kc0NvbnRleHRNZW51QW5kT3BlbmVyKCk6IFVuaXZlcnNhbERpc3Bvc2FibGUge1xyXG4gIGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZShcclxuICAgIGF0b20ud29ya3NwYWNlLmFkZE9wZW5lcigodXJpKSA9PiB7XHJcbiAgICAgIHJldHVybiBfbGF5b3V0TWFuYWdlci5nZXRNb2RlbEZvckRlYnVnZ2VyVXJpKHVyaSlcclxuICAgIH0pLFxyXG4gICAgKCkgPT4ge1xyXG4gICAgICBfbGF5b3V0TWFuYWdlci5oaWRlRGVidWdnZXJWaWV3cyhmYWxzZSlcclxuICAgIH0sXHJcbiAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIHtcclxuICAgICAgXCJkZWJ1Z2dlcjpzaG93XCI6IChldmVudCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGRldGFpbCA9IGV2ZW50LmRldGFpbFxyXG4gICAgICAgIGNvbnN0IHNob3cgPSBkZXRhaWwgPT0gbnVsbCB8fCBCb29sZWFuKGRldGFpbC5zaG93T25seUlmSGlkZGVuKSA9PT0gZmFsc2UgfHwgIV9sYXlvdXRNYW5hZ2VyLmlzRGVidWdnZXJWaXNpYmxlKClcclxuICAgICAgICBpZiAoc2hvdykge1xyXG4gICAgICAgICAgX2xheW91dE1hbmFnZXIuc2hvd0RlYnVnZ2VyVmlld3MoKVxyXG4gICAgICAgIH1cclxuICAgICAgfSxcclxuICAgIH0pLFxyXG4gICAgYXRvbS5jb21tYW5kcy5hZGQoXCJhdG9tLXdvcmtzcGFjZVwiLCB7XHJcbiAgICAgIFwiZGVidWdnZXI6aGlkZVwiOiAoKSA9PiB7XHJcbiAgICAgICAgX2xheW91dE1hbmFnZXIuaGlkZURlYnVnZ2VyVmlld3MoZmFsc2UpXHJcbiAgICAgICAgZm9yIChjb25zdCBwcm9jZXNzIG9mIF9zZXJ2aWNlLmdldE1vZGVsKCkuZ2V0UHJvY2Vzc2VzKCkpIHtcclxuICAgICAgICAgIF9zZXJ2aWNlLnN0b3BQcm9jZXNzKHByb2Nlc3MpXHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgfSksXHJcbiAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIFwiZGVidWdnZXI6dG9nZ2xlXCIsICgpID0+IHtcclxuICAgICAgaWYgKF9sYXlvdXRNYW5hZ2VyLmlzRGVidWdnZXJWaXNpYmxlKCkgPT09IHRydWUpIHtcclxuICAgICAgICBhdG9tLmNvbW1hbmRzLmRpc3BhdGNoKGF0b20udmlld3MuZ2V0VmlldyhhdG9tLndvcmtzcGFjZSksIFwiZGVidWdnZXI6aGlkZVwiKVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGF0b20uY29tbWFuZHMuZGlzcGF0Y2goYXRvbS52aWV3cy5nZXRWaWV3KGF0b20ud29ya3NwYWNlKSwgXCJkZWJ1Z2dlcjpzaG93XCIpXHJcbiAgICAgIH1cclxuICAgIH0pLFxyXG4gICAgX3NlcnZpY2Uub25EaWRDaGFuZ2VQcm9jZXNzTW9kZSgoKSA9PiBfbGF5b3V0TWFuYWdlci5kZWJ1Z2dlck1vZGVDaGFuZ2VkKCkpLFxyXG4gICAgX3NlcnZpY2Uudmlld01vZGVsLm9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cygoKSA9PiBfbGF5b3V0TWFuYWdlci5kZWJ1Z2dlck1vZGVDaGFuZ2VkKCkpLFxyXG4gICAgYXRvbS5jb21tYW5kcy5hZGQoXCJhdG9tLXdvcmtzcGFjZVwiLCB7XHJcbiAgICAgIFwiZGVidWdnZXI6cmVzZXQtbGF5b3V0XCI6ICgpID0+IHtcclxuICAgICAgICBfbGF5b3V0TWFuYWdlci5yZXNldExheW91dCgpXHJcbiAgICAgIH0sXHJcbiAgICB9KSxcclxuICAgIGF0b20uY29udGV4dE1lbnUuYWRkKHtcclxuICAgICAgXCIuZGVidWdnZXItY29udGFpbmVyXCI6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBsYWJlbDogXCJEZWJ1Z2dlciBWaWV3c1wiLFxyXG4gICAgICAgICAgc3VibWVudTogW1xyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgbGFiZWw6IFwiUmVzZXQgTGF5b3V0XCIsXHJcbiAgICAgICAgICAgICAgY29tbWFuZDogXCJkZWJ1Z2dlcjpyZXNldC1sYXlvdXRcIixcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgIF0sXHJcbiAgICAgICAgfSxcclxuICAgICAgXSxcclxuICAgIH0pXHJcbiAgKVxyXG4gIHJldHVybiBkaXNwb3NhYmxlXHJcbn1cclxuXHJcbmZ1bmN0aW9uIF9pc1JlYWRPbmx5VGFyZ2V0KCk6IGJvb2xlYW4ge1xyXG4gIGNvbnN0IHsgZm9jdXNlZFByb2Nlc3MgfSA9IF9zZXJ2aWNlLnZpZXdNb2RlbFxyXG4gIHJldHVybiBmb2N1c2VkUHJvY2VzcyAhPSBudWxsICYmIEJvb2xlYW4oZm9jdXNlZFByb2Nlc3MuY29uZmlndXJhdGlvbi5pc1JlYWRPbmx5KVxyXG59XHJcblxyXG5mdW5jdGlvbiBfY29udGludWUoKSB7XHJcbiAgaWYgKF9pc1JlYWRPbmx5VGFyZ2V0KCkpIHtcclxuICAgIHJldHVyblxyXG4gIH1cclxuICBjb25zdCB7IGZvY3VzZWRUaHJlYWQgfSA9IF9zZXJ2aWNlLnZpZXdNb2RlbFxyXG4gIGlmIChmb2N1c2VkVGhyZWFkICE9IG51bGwpIHtcclxuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9TVEVQX0NPTlRJTlVFKVxyXG4gICAgZm9jdXNlZFRocmVhZC5jb250aW51ZSgpXHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBfc3RvcCgpIHtcclxuICBjb25zdCB7IGZvY3VzZWRQcm9jZXNzIH0gPSBfc2VydmljZS52aWV3TW9kZWxcclxuICBpZiAoZm9jdXNlZFByb2Nlc3MpIHtcclxuICAgIF9zZXJ2aWNlLnN0b3BQcm9jZXNzKGZvY3VzZWRQcm9jZXNzKVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gX3Jlc3RhcnQoKSB7XHJcbiAgaWYgKF9pc1JlYWRPbmx5VGFyZ2V0KCkpIHtcclxuICAgIHJldHVyblxyXG4gIH1cclxuICBjb25zdCB7IGZvY3VzZWRQcm9jZXNzIH0gPSBfc2VydmljZS52aWV3TW9kZWxcclxuICBpZiAoZm9jdXNlZFByb2Nlc3MpIHtcclxuICAgIF9zZXJ2aWNlLnJlc3RhcnRQcm9jZXNzKGZvY3VzZWRQcm9jZXNzKVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gX3N0ZXBPdmVyKCkge1xyXG4gIGlmIChfaXNSZWFkT25seVRhcmdldCgpKSB7XHJcbiAgICByZXR1cm5cclxuICB9XHJcbiAgY29uc3QgeyBmb2N1c2VkVGhyZWFkIH0gPSBfc2VydmljZS52aWV3TW9kZWxcclxuICBpZiAoZm9jdXNlZFRocmVhZCAhPSBudWxsKSB7XHJcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfU1RFUF9PVkVSKVxyXG4gICAgZm9jdXNlZFRocmVhZC5uZXh0KClcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIF9zdGVwSW50bygpIHtcclxuICBpZiAoX2lzUmVhZE9ubHlUYXJnZXQoKSkge1xyXG4gICAgcmV0dXJuXHJcbiAgfVxyXG4gIGNvbnN0IHsgZm9jdXNlZFRocmVhZCB9ID0gX3NlcnZpY2Uudmlld01vZGVsXHJcbiAgaWYgKGZvY3VzZWRUaHJlYWQgIT0gbnVsbCkge1xyXG4gICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX1NURVBfSU5UTylcclxuICAgIGZvY3VzZWRUaHJlYWQuc3RlcEluKClcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIF9zdGVwT3V0KCkge1xyXG4gIGlmIChfaXNSZWFkT25seVRhcmdldCgpKSB7XHJcbiAgICByZXR1cm5cclxuICB9XHJcbiAgY29uc3QgeyBmb2N1c2VkVGhyZWFkIH0gPSBfc2VydmljZS52aWV3TW9kZWxcclxuICBpZiAoZm9jdXNlZFRocmVhZCAhPSBudWxsKSB7XHJcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfU1RFUF9PVVQpXHJcbiAgICBmb2N1c2VkVGhyZWFkLnN0ZXBPdXQoKVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gX2FkZEJyZWFrcG9pbnQoZXZlbnQ6IGFueSkge1xyXG4gIHJldHVybiBfZXhlY3V0ZVdpdGhFZGl0b3JQYXRoKGV2ZW50LCAoZmlsZVBhdGgsIGxpbmVOdW1iZXIpID0+IHtcclxuICAgIF9zZXJ2aWNlLmFkZFNvdXJjZUJyZWFrcG9pbnQoZmlsZVBhdGgsIGxpbmVOdW1iZXIpXHJcbiAgfSlcclxufVxyXG5cclxuZnVuY3Rpb24gX3RvZ2dsZUJyZWFrcG9pbnQoZXZlbnQ6IGFueSkge1xyXG4gIHJldHVybiBfZXhlY3V0ZVdpdGhFZGl0b3JQYXRoKGV2ZW50LCAoZmlsZVBhdGgsIGxpbmVOdW1iZXIpID0+IHtcclxuICAgIF9zZXJ2aWNlLnRvZ2dsZVNvdXJjZUJyZWFrcG9pbnQoZmlsZVBhdGgsIGxpbmVOdW1iZXIpXHJcbiAgfSlcclxufVxyXG5cclxuZnVuY3Rpb24gX3RvZ2dsZUJyZWFrcG9pbnRFbmFibGVkKGV2ZW50OiBhbnkpIHtcclxuICBfZXhlY3V0ZVdpdGhFZGl0b3JQYXRoKGV2ZW50LCAoZmlsZVBhdGgsIGxpbmUpID0+IHtcclxuICAgIGNvbnN0IGJwID0gX3NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50QXRMaW5lKGZpbGVQYXRoLCBsaW5lKVxyXG5cclxuICAgIGlmIChicCAhPSBudWxsKSB7XHJcbiAgICAgIF9zZXJ2aWNlLmVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzKCFicC5lbmFibGVkLCBicClcclxuICAgIH1cclxuICB9KVxyXG59XHJcblxyXG5mdW5jdGlvbiBfZ2V0QnJlYWtwb2ludEZyb21FdmVudChldmVudDogYW55KTogP0lCcmVha3BvaW50IHtcclxuICBjb25zdCB0YXJnZXQ6IEhUTUxFbGVtZW50ID0gZXZlbnQudGFyZ2V0XHJcbiAgbGV0IGJwID0gbnVsbFxyXG4gIGlmICh0YXJnZXQgIT0gbnVsbCAmJiB0YXJnZXQuZGF0YXNldCAhPSBudWxsKSB7XHJcbiAgICBpZiAodGFyZ2V0LmRhdGFzZXQuYnBJZCAhPSBudWxsKSB7XHJcbiAgICAgIGNvbnN0IGJwSWQgPSB0YXJnZXQuZGF0YXNldC5icElkXHJcbiAgICAgIGJwID0gX3NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50QnlJZChicElkKVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChicCA9PSBudWxsKSB7XHJcbiAgICAgIGNvbnN0IHBhdGggPSB0YXJnZXQuZGF0YXNldC5wYXRoXHJcbiAgICAgIGNvbnN0IGxpbmUgPSBwYXJzZUludCh0YXJnZXQuZGF0YXNldC5saW5lLCAxMClcclxuICAgICAgaWYgKHBhdGggIT0gbnVsbCAmJiBsaW5lICE9IG51bGwpIHtcclxuICAgICAgICBicCA9IF9zZXJ2aWNlLmdldE1vZGVsKCkuZ2V0QnJlYWtwb2ludEF0TGluZShwYXRoLCBsaW5lKVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gYnBcclxufVxyXG5cclxuZnVuY3Rpb24gX2NvbmZpZ3VyZUJyZWFrcG9pbnQoZXZlbnQ6IGFueSkge1xyXG4gIGNvbnN0IGJwID0gX2dldEJyZWFrcG9pbnRGcm9tRXZlbnQoZXZlbnQpXHJcbiAgaWYgKGJwICE9IG51bGwgJiYgX3N1cHBvcnRzQ29uZGl0aW9uYWxCcmVha3BvaW50cygpKSB7XHJcbiAgICAvLyBPcGVuIHRoZSBjb25maWd1cmF0aW9uIGRpYWxvZy5cclxuICAgIGNvbnN0IGNvbnRhaW5lciA9IG5ldyBSZWFjdE1vdW50Um9vdEVsZW1lbnQoKVxyXG4gICAgUmVhY3RET00ucmVuZGVyKFxyXG4gICAgICA8QnJlYWtwb2ludENvbmZpZ0NvbXBvbmVudFxyXG4gICAgICAgIGJyZWFrcG9pbnQ9e2JwfVxyXG4gICAgICAgIHNlcnZpY2U9e19zZXJ2aWNlfVxyXG4gICAgICAgIG9uRGlzbWlzcz17KCkgPT4ge1xyXG4gICAgICAgICAgUmVhY3RET00udW5tb3VudENvbXBvbmVudEF0Tm9kZShjb250YWluZXIpXHJcbiAgICAgICAgfX1cclxuICAgICAgICBhbGxvd0xvZ01lc3NhZ2U9e3Bhc3Nlc0dLKFwibnVjbGlkZV9kZWJ1Z2dlcl9sb2dnaW5nX2JyZWFrcG9pbnRzXCIpfVxyXG4gICAgICAvPixcclxuICAgICAgY29udGFpbmVyXHJcbiAgICApXHJcbiAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBfdGVybWluYXRlVGhyZWFkKGV2ZW50OiBhbnkpIHtcclxuICBpZiAoX2lzUmVhZE9ubHlUYXJnZXQoKSkge1xyXG4gICAgcmV0dXJuXHJcbiAgfVxyXG4gIGNvbnN0IHRhcmdldDogSFRNTEVsZW1lbnQgPSBldmVudC50YXJnZXRcclxuICBpZiAodGFyZ2V0LmRhdGFzZXQudGhyZWFkaWQpIHtcclxuICAgIGNvbnN0IHRocmVhZElkID0gcGFyc2VJbnQodGFyZ2V0LmRhdGFzZXQudGhyZWFkaWQsIDEwKVxyXG4gICAgaWYgKCFOdW1iZXIuaXNOYU4odGhyZWFkSWQpICYmIF9zdXBwb3J0c1Rlcm1pbmF0ZVRocmVhZHNSZXF1ZXN0KCkpIHtcclxuICAgICAgX3NlcnZpY2UudGVybWluYXRlVGhyZWFkcyhbdGhyZWFkSWRdKVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gX2V4ZWN1dGVXaXRoRWRpdG9yUGF0aDxUPihldmVudDogYW55LCBmbjogKGZpbGVQYXRoOiBzdHJpbmcsIGxpbmU6IG51bWJlcikgPT4gVCk6ID9UIHtcclxuICBjb25zdCBlZGl0b3IgPSBhdG9tLndvcmtzcGFjZS5nZXRBY3RpdmVUZXh0RWRpdG9yKClcclxuICBpZiAoIWVkaXRvciB8fCAhZWRpdG9yLmdldFBhdGgoKSkge1xyXG4gICAgcmV0dXJuIG51bGxcclxuICB9XHJcblxyXG4gIGNvbnN0IGxpbmUgPSBnZXRMaW5lRm9yRXZlbnQoZWRpdG9yLCBldmVudCkgKyAxXHJcbiAgcmV0dXJuIGZuKG51bGx0aHJvd3MoZWRpdG9yLmdldFBhdGgoKSksIGxpbmUpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIF9kZWxldGVCcmVha3BvaW50KGV2ZW50OiBhbnkpOiB2b2lkIHtcclxuICBjb25zdCBicmVha3BvaW50ID0gX2dldEJyZWFrcG9pbnRGcm9tRXZlbnQoZXZlbnQpXHJcbiAgaWYgKGJyZWFrcG9pbnQgIT0gbnVsbCkge1xyXG4gICAgX3NlcnZpY2UucmVtb3ZlQnJlYWtwb2ludHMoYnJlYWtwb2ludC5nZXRJZCgpKVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gX2RlbGV0ZUFsbEJyZWFrcG9pbnRzKCk6IHZvaWQge1xyXG4gIF9zZXJ2aWNlLnJlbW92ZUJyZWFrcG9pbnRzKClcclxufVxyXG5cclxuZnVuY3Rpb24gX2VuYWJsZUFsbEJyZWFrcG9pbnRzKCk6IHZvaWQge1xyXG4gIF9zZXJ2aWNlLmVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzKHRydWUpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIF9kaXNhYmxlQWxsQnJlYWtwb2ludHMoKTogdm9pZCB7XHJcbiAgX3NlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoZmFsc2UpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIF9yZW5kZXJDb25maWdEaWFsb2cocGFuZWw6IGF0b20kUGFuZWwsIGFyZ3M6IExhdW5jaEF0dGFjaERpYWxvZ0FyZ3MsIGRpYWxvZ0Nsb3NlcjogKCkgPT4gdm9pZCk6IHZvaWQge1xyXG4gIGlmIChfc2VsZWN0ZWREZWJ1Z0Nvbm5lY3Rpb24gPT0gbnVsbCkge1xyXG4gICAgLy8gSWYgbm8gY29ubmVjdGlvbiBpcyBzZWxlY3RlZCB5ZXQsIGRlZmF1bHQgdG8gdGhlIGxvY2FsIGNvbm5lY3Rpb24uXHJcbiAgICBfc2VsZWN0ZWREZWJ1Z0Nvbm5lY3Rpb24gPSBcImxvY2FsXCJcclxuICB9XHJcblxyXG4gIGludmFyaWFudChfc2VsZWN0ZWREZWJ1Z0Nvbm5lY3Rpb24gIT0gbnVsbClcclxuXHJcbiAgY29uc3Qgb3B0aW9ucyA9IF91aU1vZGVsXHJcbiAgICAuZ2V0Q29ubmVjdGlvbnMoKVxyXG4gICAgLm1hcCgoY29ubmVjdGlvbikgPT4ge1xyXG4gICAgICBjb25zdCBkaXNwbGF5TmFtZSA9IG51Y2xpZGVVcmkuaXNSZW1vdGUoY29ubmVjdGlvbikgPyBudWNsaWRlVXJpLmdldEhvc3RuYW1lKGNvbm5lY3Rpb24pIDogXCJsb2NhbGhvc3RcIlxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHZhbHVlOiBjb25uZWN0aW9uLFxyXG4gICAgICAgIGxhYmVsOiBkaXNwbGF5TmFtZSxcclxuICAgICAgfVxyXG4gICAgfSlcclxuICAgIC5maWx0ZXIoKGl0ZW0pID0+IGl0ZW0udmFsdWUgIT0gbnVsbCAmJiBpdGVtLnZhbHVlICE9PSBcIlwiKVxyXG4gICAgLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSlcclxuXHJcbiAgLy8gZmxvd2xpbnQtbmV4dC1saW5lIHNrZXRjaHktbnVsbC1zdHJpbmc6b2ZmXHJcbiAgY29uc3QgY29ubmVjdGlvbiA9IF9zZWxlY3RlZERlYnVnQ29ubmVjdGlvbiB8fCBcImxvY2FsXCJcclxuXHJcbiAgUmVhY3RET00ucmVuZGVyKFxyXG4gICAgPERlYnVnZ2VyTGF1bmNoQXR0YWNoVUlcclxuICAgICAgZGlhbG9nTW9kZT17YXJncy5kaWFsb2dNb2RlfVxyXG4gICAgICBpbml0aWFsU2VsZWN0ZWRUYWJOYW1lPXthcmdzLnNlbGVjdGVkVGFiTmFtZX1cclxuICAgICAgaW5pdGlhbFByb3ZpZGVyQ29uZmlnPXthcmdzLmNvbmZpZ31cclxuICAgICAgY29ubmVjdGlvbkNoYW5nZWQ9eyhuZXdWYWx1ZTogP3N0cmluZykgPT4ge1xyXG4gICAgICAgIF9zZWxlY3RlZERlYnVnQ29ubmVjdGlvbiA9IG5ld1ZhbHVlXHJcbiAgICAgICAgX3JlbmRlckNvbmZpZ0RpYWxvZyhwYW5lbCwgeyBkaWFsb2dNb2RlOiBhcmdzLmRpYWxvZ01vZGUgfSwgZGlhbG9nQ2xvc2VyKVxyXG4gICAgICB9fVxyXG4gICAgICBjb25uZWN0aW9uPXtjb25uZWN0aW9ufVxyXG4gICAgICBjb25uZWN0aW9uT3B0aW9ucz17b3B0aW9uc31cclxuICAgICAgZGlhbG9nQ2xvc2VyPXtkaWFsb2dDbG9zZXJ9XHJcbiAgICAgIHByb3ZpZGVycz17X2Nvbm5lY3Rpb25Qcm92aWRlcnN9XHJcbiAgICAvPixcclxuICAgIHBhbmVsLmdldEl0ZW0oKVxyXG4gIClcclxufVxyXG5cclxuZnVuY3Rpb24gX3Nob3dMYXVuY2hBdHRhY2hEaWFsb2coYXJnczogTGF1bmNoQXR0YWNoRGlhbG9nQXJncyk6IHZvaWQge1xyXG4gIGNvbnN0IHsgZGlhbG9nTW9kZSB9ID0gYXJnc1xyXG4gIGlmIChfdmlzaWJsZUxhdW5jaEF0dGFjaERpYWxvZ01vZGUgIT0gbnVsbCAmJiBfdmlzaWJsZUxhdW5jaEF0dGFjaERpYWxvZ01vZGUgIT09IGRpYWxvZ01vZGUpIHtcclxuICAgIC8vIElmIHRoZSBkaWFsb2cgaXMgYWxyZWFkeSB2aXNpYmxlLCBidXQgaXNuJ3QgdGhlIGNvcnJlY3QgbW9kZSwgY2xvc2UgaXQgYmVmb3JlXHJcbiAgICAvLyByZS1vcGVuaW5nIHRoZSBjb3JyZWN0IG1vZGUuXHJcbiAgICBpbnZhcmlhbnQoX2xhdWNoQXR0YWNoRGlhbG9nQ2xvc2VyICE9IG51bGwpXHJcbiAgICBfbGF1Y2hBdHRhY2hEaWFsb2dDbG9zZXIoKVxyXG4gIH1cclxuXHJcbiAgY29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSgpXHJcbiAgY29uc3QgaG9zdEVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKVxyXG4gIGNvbnN0IHBhbmUgPSBhdG9tLndvcmtzcGFjZS5hZGRNb2RhbFBhbmVsKHtcclxuICAgIGl0ZW06IGhvc3RFbCxcclxuICAgIGNsYXNzTmFtZTogXCJkZWJ1Z2dlci1jb25maWctZGlhbG9nXCIsXHJcbiAgfSlcclxuXHJcbiAgY29uc3QgcGFyZW50RWw6IEhUTUxFbGVtZW50ID0gKGhvc3RFbC5wYXJlbnRFbGVtZW50OiBhbnkpXHJcbiAgcGFyZW50RWwuc3R5bGUubWF4V2lkdGggPSBcIjEwMGVtXCJcclxuXHJcbiAgLy8gRnVuY3Rpb24gY2FsbGJhY2sgdGhhdCBjbG9zZXMgdGhlIGRpYWxvZyBhbmQgZnJlZXMgYWxsIG9mIGl0cyByZXNvdXJjZXMuXHJcbiAgX3JlbmRlckNvbmZpZ0RpYWxvZyhwYW5lLCBhcmdzLCAoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpXHJcbiAgX2xhdWNoQXR0YWNoRGlhbG9nQ2xvc2VyID0gKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpXHJcbiAgZGlzcG9zYWJsZXMuYWRkKFxyXG4gICAgcGFuZS5vbkRpZENoYW5nZVZpc2libGUoKHZpc2libGUpID0+IHtcclxuICAgICAgaWYgKCF2aXNpYmxlKSB7XHJcbiAgICAgICAgZGlzcG9zYWJsZXMuZGlzcG9zZSgpXHJcbiAgICAgIH1cclxuICAgIH0pXHJcbiAgKVxyXG4gIGRpc3Bvc2FibGVzLmFkZCgoKSA9PiB7XHJcbiAgICBfZGlzcG9zYWJsZXMucmVtb3ZlKGRpc3Bvc2FibGVzKVxyXG4gICAgX3Zpc2libGVMYXVuY2hBdHRhY2hEaWFsb2dNb2RlID0gbnVsbFxyXG4gICAgX2xhdWNoQXR0YWNoRGlhbG9nQ2xvc2VyID0gbnVsbFxyXG4gICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX1RPR0dMRV9BVFRBQ0hfRElBTE9HLCB7XHJcbiAgICAgIHZpc2libGU6IGZhbHNlLFxyXG4gICAgICBkaWFsb2dNb2RlLFxyXG4gICAgfSlcclxuICAgIFJlYWN0RE9NLnVubW91bnRDb21wb25lbnRBdE5vZGUoaG9zdEVsKVxyXG4gICAgcGFuZS5kZXN0cm95KClcclxuICB9KVxyXG5cclxuICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfVE9HR0xFX0FUVEFDSF9ESUFMT0csIHtcclxuICAgIHZpc2libGU6IHRydWUsXHJcbiAgICBkaWFsb2dNb2RlLFxyXG4gIH0pXHJcbiAgX3Zpc2libGVMYXVuY2hBdHRhY2hEaWFsb2dNb2RlID0gZGlhbG9nTW9kZVxyXG4gIF9kaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZXMpXHJcbn1cclxuXHJcbmZ1bmN0aW9uIF9hZGRUb1dhdGNoKCkge1xyXG4gIGNvbnN0IGVkaXRvciA9IGF0b20ud29ya3NwYWNlLmdldEFjdGl2ZVRleHRFZGl0b3IoKVxyXG4gIGlmICghZWRpdG9yKSB7XHJcbiAgICByZXR1cm5cclxuICB9XHJcbiAgY29uc3Qgc2VsZWN0ZWRUZXh0ID0gZWRpdG9yLmdldFRleHRJbkJ1ZmZlclJhbmdlKHRyaW1SYW5nZShlZGl0b3IsIGVkaXRvci5nZXRTZWxlY3RlZEJ1ZmZlclJhbmdlKCkpKVxyXG4gIGNvbnN0IGV4cHIgPSB3b3JkQXRQb3NpdGlvbihlZGl0b3IsIGVkaXRvci5nZXRDdXJzb3JCdWZmZXJQb3NpdGlvbigpKVxyXG5cclxuICBjb25zdCB3YXRjaEV4cHJlc3Npb24gPSBzZWxlY3RlZFRleHQgfHwgKGV4cHIgJiYgZXhwci53b3JkTWF0Y2hbMF0pXHJcbiAgaWYgKHdhdGNoRXhwcmVzc2lvbiAhPSBudWxsICYmIHdhdGNoRXhwcmVzc2lvbi5sZW5ndGggPiAwKSB7XHJcbiAgICBfc2VydmljZS5hZGRXYXRjaEV4cHJlc3Npb24od2F0Y2hFeHByZXNzaW9uKVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gX3J1blRvTG9jYXRpb24oZXZlbnQpIHtcclxuICBpZiAoX2lzUmVhZE9ubHlUYXJnZXQoKSkge1xyXG4gICAgcmV0dXJuXHJcbiAgfVxyXG4gIF9leGVjdXRlV2l0aEVkaXRvclBhdGgoZXZlbnQsIChwYXRoLCBsaW5lKSA9PiB7XHJcbiAgICBfc2VydmljZS5ydW5Ub0xvY2F0aW9uKHBhdGgsIGxpbmUpXHJcbiAgfSlcclxufVxyXG5cclxuZnVuY3Rpb24gX2NvcHlEZWJ1Z2dlckV4cHJlc3Npb25WYWx1ZShldmVudDogRXZlbnQpIHtcclxuICBjb25zdCBzZWxlY3Rpb24gPSB3aW5kb3cuZ2V0U2VsZWN0aW9uKClcclxuICBjb25zdCBjbGlja2VkRWxlbWVudDogSFRNTEVsZW1lbnQgPSAoZXZlbnQudGFyZ2V0OiBhbnkpXHJcbiAgY29uc3QgdGFyZ2V0Q2xhc3MgPSBcIi5udWNsaWRlLXVpLWV4cHJlc3Npb24tdHJlZS12YWx1ZVwiXHJcbiAgY29uc3QgY29weUVsZW1lbnQgPSBjbGlja2VkRWxlbWVudC5jbG9zZXN0KHRhcmdldENsYXNzKVxyXG5cclxuICBpZiAoY29weUVsZW1lbnQgIT0gbnVsbCkge1xyXG4gICAgLy8gSWYgdGhlIHVzZXIgaGFzIHRleHQgaW4gdGhlIHRhcmdldCBub2RlIHNlbGVjdGVkLCBjb3B5IG9ubHkgdGhlIHNlbGVjdGlvblxyXG4gICAgLy8gaW5zdGVhZCBvZiB0aGUgZW50aXJlIG5vZGUgdmFsdWUuXHJcbiAgICBpZiAoXHJcbiAgICAgIHNlbGVjdGlvbiAhPSBudWxsICYmXHJcbiAgICAgIHNlbGVjdGlvbi50b1N0cmluZygpICE9PSBcIlwiICYmXHJcbiAgICAgIChjb3B5RWxlbWVudC5jb250YWlucyhzZWxlY3Rpb24/LmFuY2hvck5vZGU/LnBhcmVudEVsZW1lbnQpIHx8XHJcbiAgICAgICAgY29weUVsZW1lbnQgPT09IHNlbGVjdGlvbj8uYW5jaG9yTm9kZT8ucGFyZW50RWxlbWVudClcclxuICAgICkge1xyXG4gICAgICBhdG9tLmNsaXBib2FyZC53cml0ZShzZWxlY3Rpb24udG9TdHJpbmcoKSlcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGF0b20uY2xpcGJvYXJkLndyaXRlKGNvcHlFbGVtZW50LnRleHRDb250ZW50KVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gX2NvcHlEZWJ1Z2dlckNhbGxzdGFjayhldmVudDogRXZlbnQpIHtcclxuICBjb25zdCB7IGZvY3VzZWRUaHJlYWQgfSA9IF9zZXJ2aWNlLnZpZXdNb2RlbFxyXG4gIGlmIChmb2N1c2VkVGhyZWFkICE9IG51bGwpIHtcclxuICAgIGxldCBjYWxsc3RhY2tUZXh0ID0gXCJcIlxyXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG51Y2xpZGUtaW50ZXJuYWwvdW51c2VkLXN1YnNjcmlwdGlvblxyXG4gICAgZm9jdXNlZFRocmVhZFxyXG4gICAgICAuZ2V0RnVsbENhbGxTdGFjaygpXHJcbiAgICAgIC5maWx0ZXIoKGV4cGVjdGVkU3RhY2spID0+ICFleHBlY3RlZFN0YWNrLmlzUGVuZGluZylcclxuICAgICAgLnRha2UoMSlcclxuICAgICAgLnN1YnNjcmliZSgoZXhwZWN0ZWRTdGFjaykgPT4ge1xyXG4gICAgICAgIGV4cGVjdGVkU3RhY2suZ2V0T3JEZWZhdWx0KFtdKS5mb3JFYWNoKChpdGVtLCBpKSA9PiB7XHJcbiAgICAgICAgICBjb25zdCBwYXRoID0gbnVjbGlkZVVyaS5iYXNlbmFtZShpdGVtLnNvdXJjZS51cmkpXHJcbiAgICAgICAgICBjYWxsc3RhY2tUZXh0ICs9IGAke2l9XFx0JHtpdGVtLm5hbWV9XFx0JHtwYXRofToke2l0ZW0ucmFuZ2Uuc3RhcnQucm93fSR7b3MuRU9MfWBcclxuICAgICAgICB9KVxyXG4gICAgICAgIGF0b20uY2xpcGJvYXJkLndyaXRlKGNhbGxzdGFja1RleHQudHJpbSgpKVxyXG4gICAgICB9KVxyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNvbnN1bWVDdXJyZW50V29ya2luZ0RpcmVjdG9yeShjd2RBcGk6IG51Y2xpZGUkQ3dkQXBpKTogSURpc3Bvc2FibGUge1xyXG4gIGNvbnN0IHVwZGF0ZVNlbGVjdGVkQ29ubmVjdGlvbiA9IChkaXJlY3RvcnkpID0+IHtcclxuICAgIF9zZWxlY3RlZERlYnVnQ29ubmVjdGlvbiA9IGRpcmVjdG9yeVxyXG4gICAgaWYgKF9zZWxlY3RlZERlYnVnQ29ubmVjdGlvbiAhPSBudWxsKSB7XHJcbiAgICAgIGNvbnN0IGNvbm4gPSBfc2VsZWN0ZWREZWJ1Z0Nvbm5lY3Rpb25cclxuICAgICAgaWYgKG51Y2xpZGVVcmkuaXNSZW1vdGUoY29ubikpIHtcclxuICAgICAgICAvLyBVc2Ugcm9vdCBpbnN0ZWFkIG9mIGN1cnJlbnQgZGlyZWN0b3J5IGFzIGxhdW5jaCBwb2ludCBmb3IgZGVidWdnZXIuXHJcbiAgICAgICAgX3NlbGVjdGVkRGVidWdDb25uZWN0aW9uID0gbnVjbGlkZVVyaS5jcmVhdGVSZW1vdGVVcmkobnVjbGlkZVVyaS5nZXRIb3N0bmFtZShjb25uKSwgXCIvXCIpXHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gVXNlIG51bGwgaW5zdGVhZCBvZiBsb2NhbCBwYXRoIHRvIHVzZSBsb2NhbCBkZWJ1Z2dlciBkb3duc3RyZWFtLlxyXG4gICAgICAgIF9zZWxlY3RlZERlYnVnQ29ubmVjdGlvbiA9IG51bGxcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuICBjb25zdCBkaXNwb3NhYmxlID0gY3dkQXBpLm9ic2VydmVDd2QodXBkYXRlU2VsZWN0ZWRDb25uZWN0aW9uKVxyXG4gIF9kaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZSlcclxuICByZXR1cm4gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoKCkgPT4ge1xyXG4gICAgZGlzcG9zYWJsZS5kaXNwb3NlKClcclxuICAgIF9kaXNwb3NhYmxlcy5yZW1vdmUoZGlzcG9zYWJsZSlcclxuICB9KVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQXV0b2NvbXBsZXRlUHJvdmlkZXIoKTogYXRvbSRBdXRvY29tcGxldGVQcm92aWRlciB7XHJcbiAgcmV0dXJuIHtcclxuICAgIGxhYmVsczogW1wibnVjbGlkZS1jb25zb2xlXCJdLFxyXG4gICAgc2VsZWN0b3I6IFwiKlwiLFxyXG4gICAgZmlsdGVyU3VnZ2VzdGlvbnM6IHRydWUsXHJcbiAgICBnZXRTdWdnZXN0aW9uczogX2dldFN1Z2dlc3Rpb25zLmJpbmQodGhpcyksXHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY29uc3VtZUNvbnNvbGUoY3JlYXRlQ29uc29sZTogQ29uc29sZVNlcnZpY2UpOiBJRGlzcG9zYWJsZSB7XHJcbiAgcmV0dXJuIHNldENvbnNvbGVTZXJ2aWNlKGNyZWF0ZUNvbnNvbGUpXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjb25zdW1lVGVybWluYWwodGVybWluYWxBcGk6IFRlcm1pbmFsQXBpKTogSURpc3Bvc2FibGUge1xyXG4gIHJldHVybiBzZXRUZXJtaW5hbFNlcnZpY2UodGVybWluYWxBcGkpXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjb25zdW1lUnBjU2VydmljZShycGNTZXJ2aWNlOiBudWNsaWRlJFJwY1NlcnZpY2UpOiBJRGlzcG9zYWJsZSB7XHJcbiAgcmV0dXJuIHNldFJwY1NlcnZpY2UocnBjU2VydmljZSlcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNvbnN1bWVSZWdpc3RlckV4ZWN1dG9yKHJlZ2lzdGVyRXhlY3V0b3I6IFJlZ2lzdGVyRXhlY3V0b3JGdW5jdGlvbik6IElEaXNwb3NhYmxlIHtcclxuICByZXR1cm4gc2V0Q29uc29sZVJlZ2lzdGVyRXhlY3V0b3IocmVnaXN0ZXJFeGVjdXRvcilcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNvbnN1bWVEZWJ1Z2dlclByb3ZpZGVyKHByb3ZpZGVyOiBOdWNsaWRlRGVidWdnZXJQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcclxuICBfdWlNb2RlbC5hZGREZWJ1Z2dlclByb3ZpZGVyKHByb3ZpZGVyKVxyXG4gIHJldHVybiBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSgoKSA9PiB7XHJcbiAgICBfdWlNb2RlbC5yZW1vdmVEZWJ1Z2dlclByb3ZpZGVyKHByb3ZpZGVyKVxyXG4gIH0pXHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjb25zdW1lRGVidWdnZXJDb25maWd1cmF0aW9uUHJvdmlkZXJzKHByb3ZpZGVyczogQXJyYXk8RGVidWdnZXJDb25maWd1cmF0aW9uUHJvdmlkZXI+KTogSURpc3Bvc2FibGUge1xyXG4gIGludmFyaWFudChBcnJheS5pc0FycmF5KHByb3ZpZGVycykpXHJcbiAgY29uc3QgZGlzcG9zYWJsZSA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKClcclxuICBwcm92aWRlcnMuZm9yRWFjaCgocHJvdmlkZXIpID0+IGRpc3Bvc2FibGUuYWRkKGFkZERlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyKHByb3ZpZGVyKSkpXHJcbiAgcmV0dXJuIGRpc3Bvc2FibGVcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNvbnN1bWVUb29sQmFyKGdldFRvb2xCYXI6IHRvb2xiYXIkR2V0VG9vbGJhcik6IElEaXNwb3NhYmxlIHtcclxuICBjb25zdCB0b29sQmFyID0gZ2V0VG9vbEJhcihcImRlYnVnZ2VyXCIpXHJcbiAgdG9vbEJhci5hZGRCdXR0b24oe1xyXG4gICAgaWNvbnNldDogXCJpY29uLW51Y2xpY29uXCIsXHJcbiAgICBpY29uOiBcImRlYnVnZ2VyXCIsXHJcbiAgICBjYWxsYmFjazogXCJkZWJ1Z2dlcjpzaG93LWF0dGFjaC1kaWFsb2dcIixcclxuICAgIHRvb2x0aXA6IFwiQXR0YWNoIERlYnVnZ2VyXCIsXHJcbiAgICBwcmlvcml0eTogNTAwLFxyXG4gIH0pLmVsZW1lbnRcclxuICBjb25zdCBkaXNwb3NhYmxlID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoKCkgPT4ge1xyXG4gICAgdG9vbEJhci5yZW1vdmVJdGVtcygpXHJcbiAgfSlcclxuICBfZGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGUpXHJcbiAgcmV0dXJuIGRpc3Bvc2FibGVcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGNvbnN1bWVOb3RpZmljYXRpb25zKFxyXG4gIHJhaXNlTmF0aXZlTm90aWZpY2F0aW9uOiAodGl0bGU6IHN0cmluZywgYm9keTogc3RyaW5nLCB0aW1lb3V0OiBudW1iZXIsIHJhaXNlSWZBdG9tSGFzRm9jdXM6IGJvb2xlYW4pID0+ID9JRGlzcG9zYWJsZVxyXG4pOiB2b2lkIHtcclxuICBzZXROb3RpZmljYXRpb25TZXJ2aWNlKHJhaXNlTmF0aXZlTm90aWZpY2F0aW9uKVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcHJvdmlkZVJlbW90ZUNvbnRyb2xTZXJ2aWNlKCk6IFJlbW90ZUNvbnRyb2xTZXJ2aWNlIHtcclxuICByZXR1cm4gbmV3IFJlbW90ZUNvbnRyb2xTZXJ2aWNlKF9zZXJ2aWNlKVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY29uc3VtZURhdGF0aXBTZXJ2aWNlKHNlcnZpY2U6IERhdGF0aXBTZXJ2aWNlKTogSURpc3Bvc2FibGUge1xyXG4gIGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZShzZXJ2aWNlLmFkZFByb3ZpZGVyKF9jcmVhdGVEYXRhdGlwUHJvdmlkZXIoKSksIHNldERhdGF0aXBTZXJ2aWNlKHNlcnZpY2UpKVxyXG4gIF9kaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZSlcclxuICByZXR1cm4gZGlzcG9zYWJsZVxyXG59XHJcblxyXG5mdW5jdGlvbiBfY3JlYXRlRGF0YXRpcFByb3ZpZGVyKCk6IERhdGF0aXBQcm92aWRlciB7XHJcbiAgcmV0dXJuIHtcclxuICAgIC8vIEVsaWdpYmlsaXR5IGlzIGRldGVybWluZWQgb25saW5lLCBiYXNlZCBvbiByZWdpc3RlcmVkIEV2YWx1YXRpb25FeHByZXNzaW9uIHByb3ZpZGVycy5cclxuICAgIHByb3ZpZGVyTmFtZTogREFUQVRJUF9QQUNLQUdFX05BTUUsXHJcbiAgICBwcmlvcml0eTogMSxcclxuICAgIGRhdGF0aXA6IChlZGl0b3I6IFRleHRFZGl0b3IsIHBvc2l0aW9uOiBhdG9tJFBvaW50KSA9PiB7XHJcbiAgICAgIHJldHVybiBkZWJ1Z2dlckRhdGF0aXAoX3NlcnZpY2UsIGVkaXRvciwgcG9zaXRpb24pXHJcbiAgICB9LFxyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gY3JlYXRlRGVidWdnZXJWaWV3KG1vZGVsOiBtaXhlZCk6ID9IVE1MRWxlbWVudCB7XHJcbiAgbGV0IHZpZXcgPSBudWxsXHJcbiAgaWYgKG1vZGVsIGluc3RhbmNlb2YgRGVidWdnZXJQYW5lVmlld01vZGVsIHx8IG1vZGVsIGluc3RhbmNlb2YgRGVidWdnZXJQYW5lQ29udGFpbmVyVmlld01vZGVsKSB7XHJcbiAgICB2aWV3ID0gbW9kZWwuY3JlYXRlVmlldygpXHJcbiAgfVxyXG5cclxuICBpZiAodmlldyAhPSBudWxsKSB7XHJcbiAgICBjb25zdCBlbGVtID0gcmVuZGVyUmVhY3RSb290KHZpZXcpXHJcbiAgICBlbGVtLmNsYXNzTmFtZSA9IFwiZGVidWdnZXItY29udGFpbmVyXCJcclxuICAgIHJldHVybiBlbGVtXHJcbiAgfVxyXG5cclxuICByZXR1cm4gbnVsbFxyXG59XHJcbiJdfQ==