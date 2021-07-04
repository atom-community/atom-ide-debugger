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

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm1haW4uanMiXSwibmFtZXMiOlsiREFUQVRJUF9QQUNLQUdFX05BTUUiLCJfZGlzcG9zYWJsZXMiLCJfdWlNb2RlbCIsIl9icmVha3BvaW50TWFuYWdlciIsIl9zZXJ2aWNlIiwiX2xheW91dE1hbmFnZXIiLCJfc2VsZWN0ZWREZWJ1Z0Nvbm5lY3Rpb24iLCJfdmlzaWJsZUxhdW5jaEF0dGFjaERpYWxvZ01vZGUiLCJfbGF1Y2hBdHRhY2hEaWFsb2dDbG9zZXIiLCJfY29ubmVjdGlvblByb3ZpZGVycyIsImFjdGl2YXRlIiwic3RhdGUiLCJhdG9tIiwidmlld3MiLCJhZGRWaWV3UHJvdmlkZXIiLCJEZWJ1Z2dlclBhbmVWaWV3TW9kZWwiLCJjcmVhdGVEZWJ1Z2dlclZpZXciLCJEZWJ1Z2dlclBhbmVDb250YWluZXJWaWV3TW9kZWwiLCJEZWJ1Z1NlcnZpY2UiLCJEZWJ1Z2dlclVpTW9kZWwiLCJCcmVha3BvaW50TWFuYWdlciIsIk1hcCIsIkRlYnVnZ2VyTGF5b3V0TWFuYWdlciIsImluc2VydEluZGV4IiwibWVudSIsInRlbXBsYXRlIiwiZmluZEluZGV4IiwiaXRlbSIsInJvbGUiLCJkZXVnZ2VySW5kZXgiLCJsYWJlbCIsIm1lbnVJdGVtIiwic3BsaWNlIiwibmV3SW5kZXgiLCJ1cGRhdGUiLCJyZW1vdmVkSG9zdG5hbWVzIiwiVW5pdmVyc2FsRGlzcG9zYWJsZSIsInN1YnNjcmliZSIsImhvc3RuYW1lIiwiZ2V0TW9kZWwiLCJnZXRQcm9jZXNzZXMiLCJmb3JFYWNoIiwiZGVidWdnZXJQcm9jZXNzIiwiZGVidWdnZWVUYXJnZXRVcmkiLCJjb25maWd1cmF0aW9uIiwidGFyZ2V0VXJpIiwibnVjbGlkZVVyaSIsImlzTG9jYWwiLCJnZXRIb3N0bmFtZSIsInN0b3BQcm9jZXNzIiwib25Db25uZWN0aW9uc1VwZGF0ZWQiLCJuZXdDb25uZWN0aW9ucyIsImdldENvbm5lY3Rpb25zIiwia2V5cyIsIkFycmF5IiwiZnJvbSIsInJlbW92ZWRDb25uZWN0aW9ucyIsImZpbHRlciIsImNvbm5lY3Rpb24iLCJmaW5kIiwiYWRkZWRDb25uZWN0aW9ucyIsImtleSIsImRlbGV0ZSIsIl9zZXRQcm92aWRlcnNGb3JDb25uZWN0aW9uIiwib25Qcm92aWRlcnNVcGRhdGVkIiwiY29ubmVjdGlvbnMiLCJjb21tYW5kcyIsImFkZCIsImV2ZW50Iiwic2VsZWN0ZWRUYWJOYW1lIiwiXyIsImRldGFpbCIsImNvbmZpZyIsIl9zaG93TGF1bmNoQXR0YWNoRGlhbG9nIiwiZGlhbG9nTW9kZSIsIl9jb250aW51ZSIsImJpbmQiLCJfc3RvcCIsIl9yZXN0YXJ0IiwiX3N0ZXBPdmVyIiwiX3N0ZXBJbnRvIiwiX3N0ZXBPdXQiLCJfYWRkQnJlYWtwb2ludCIsIl90b2dnbGVCcmVha3BvaW50IiwiX3RvZ2dsZUJyZWFrcG9pbnRFbmFibGVkIiwiX2NvbmZpZ3VyZUJyZWFrcG9pbnQiLCJfdGVybWluYXRlVGhyZWFkIiwiX2RlbGV0ZUFsbEJyZWFrcG9pbnRzIiwiX2VuYWJsZUFsbEJyZWFrcG9pbnRzIiwiX2Rpc2FibGVBbGxCcmVha3BvaW50cyIsIl9kZWxldGVCcmVha3BvaW50IiwiX2FkZFRvV2F0Y2giLCJfcnVuVG9Mb2NhdGlvbiIsIl9jb3B5RGVidWdnZXJFeHByZXNzaW9uVmFsdWUiLCJfY29weURlYnVnZ2VyQ2FsbHN0YWNrIiwiY29udGV4dE1lbnUiLCJjb21tYW5kIiwidHlwZSIsInNob3VsZERpc3BsYXkiLCJicCIsIl9nZXRCcmVha3BvaW50RnJvbUV2ZW50IiwiX3N1cHBvcnRzQ29uZGl0aW9uYWxCcmVha3BvaW50cyIsInRhcmdldCIsImRhdGFzZXQiLCJ0aHJlYWRpZCIsInRocmVhZElkIiwicGFyc2VJbnQiLCJOdW1iZXIiLCJpc05hTiIsIl9zdXBwb3J0c1Rlcm1pbmF0ZVRocmVhZHNSZXF1ZXN0IiwiX2lzUmVhZE9ubHlUYXJnZXQiLCJzdWJtZW51IiwiX2V4ZWN1dGVXaXRoRWRpdG9yUGF0aCIsImZpbGVQYXRoIiwibGluZSIsImdldEJyZWFrcG9pbnRBdExpbmUiLCJ0ZXh0RWRpdG9yIiwid29ya3NwYWNlIiwiZ2V0QWN0aXZlVGV4dEVkaXRvciIsImdldERlYnVnZ2VyTW9kZSIsIkRlYnVnZ2VyTW9kZSIsIlNUT1BQRUQiLCJnZXRTZWxlY3Rpb25zIiwibGVuZ3RoIiwiZ2V0U2VsZWN0ZWRCdWZmZXJSYW5nZSIsImlzRW1wdHkiLCJQQVVTRUQiLCJfcmVnaXN0ZXJDb21tYW5kc0NvbnRleHRNZW51QW5kT3BlbmVyIiwiZm9jdXNlZFByb2Nlc3MiLCJ2aWV3TW9kZWwiLCJCb29sZWFuIiwic2Vzc2lvbiIsImNhcGFiaWxpdGllcyIsInN1cHBvcnRzQ29uZGl0aW9uYWxCcmVha3BvaW50cyIsInN1cHBvcnRzVGVybWluYXRlVGhyZWFkc1JlcXVlc3QiLCJpc1JlbW90ZSIsImF2YWlsYWJsZVByb3ZpZGVycyIsImdldExhdW5jaEF0dGFjaFByb3ZpZGVyc0ZvckNvbm5lY3Rpb24iLCJzZXQiLCJfZ2V0U3VnZ2VzdGlvbnMiLCJyZXF1ZXN0IiwidGV4dCIsImVkaXRvciIsImdldFRleHQiLCJsaW5lcyIsInNwbGl0Iiwicm93IiwiYnVmZmVyUG9zaXRpb24iLCJzbGljZSIsImpvaW4iLCJmb2N1c2VkU3RhY2tGcmFtZSIsInN1cHBvcnRzQ29tcGxldGlvbnNSZXF1ZXN0IiwiY29tcGxldGlvbnMiLCJmcmFtZUlkIiwibWFwIiwiZGlzcGxheVRleHQiLCJzZXJpYWxpemUiLCJtb2RlbCIsInNvdXJjZUJyZWFrcG9pbnRzIiwiZ2V0QnJlYWtwb2ludHMiLCJmdW5jdGlvbkJyZWFrcG9pbnRzIiwiZ2V0RnVuY3Rpb25CcmVha3BvaW50cyIsImV4Y2VwdGlvbkJyZWFrcG9pbnRzIiwiZ2V0RXhjZXB0aW9uQnJlYWtwb2ludHMiLCJ3YXRjaEV4cHJlc3Npb25zIiwiZ2V0V2F0Y2hFeHByZXNzaW9ucyIsImUiLCJuYW1lIiwic2hvd0RlYnVnZ2VyIiwiaXNEZWJ1Z2dlclZpc2libGUiLCJ3b3Jrc3BhY2VEb2Nrc1Zpc2liaWxpdHkiLCJnZXRXb3Jrc3BhY2VEb2Nrc1Zpc2liaWxpdHkiLCJkZWFjdGl2YXRlIiwiZGlzcG9zZSIsImRpc3Bvc2FibGUiLCJhZGRPcGVuZXIiLCJ1cmkiLCJnZXRNb2RlbEZvckRlYnVnZ2VyVXJpIiwiaGlkZURlYnVnZ2VyVmlld3MiLCJzaG93Iiwic2hvd09ubHlJZkhpZGRlbiIsInNob3dEZWJ1Z2dlclZpZXdzIiwicHJvY2VzcyIsImRpc3BhdGNoIiwiZ2V0VmlldyIsIm9uRGlkQ2hhbmdlUHJvY2Vzc01vZGUiLCJkZWJ1Z2dlck1vZGVDaGFuZ2VkIiwib25EaWRDaGFuZ2VEZWJ1Z2dlckZvY3VzIiwicmVzZXRMYXlvdXQiLCJpc1JlYWRPbmx5IiwiZm9jdXNlZFRocmVhZCIsIkFuYWx5dGljc0V2ZW50cyIsIkRFQlVHR0VSX1NURVBfQ09OVElOVUUiLCJjb250aW51ZSIsInJlc3RhcnRQcm9jZXNzIiwiREVCVUdHRVJfU1RFUF9PVkVSIiwibmV4dCIsIkRFQlVHR0VSX1NURVBfSU5UTyIsInN0ZXBJbiIsIkRFQlVHR0VSX1NURVBfT1VUIiwic3RlcE91dCIsImxpbmVOdW1iZXIiLCJhZGRTb3VyY2VCcmVha3BvaW50IiwidG9nZ2xlU291cmNlQnJlYWtwb2ludCIsImVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzIiwiZW5hYmxlZCIsImJwSWQiLCJnZXRCcmVha3BvaW50QnlJZCIsInBhdGgiLCJjb250YWluZXIiLCJSZWFjdE1vdW50Um9vdEVsZW1lbnQiLCJSZWFjdERPTSIsInJlbmRlciIsInVubW91bnRDb21wb25lbnRBdE5vZGUiLCJ0ZXJtaW5hdGVUaHJlYWRzIiwiZm4iLCJnZXRQYXRoIiwiYnJlYWtwb2ludCIsInJlbW92ZUJyZWFrcG9pbnRzIiwiZ2V0SWQiLCJfcmVuZGVyQ29uZmlnRGlhbG9nIiwicGFuZWwiLCJhcmdzIiwiZGlhbG9nQ2xvc2VyIiwib3B0aW9ucyIsImRpc3BsYXlOYW1lIiwidmFsdWUiLCJzb3J0IiwiYSIsImIiLCJsb2NhbGVDb21wYXJlIiwibmV3VmFsdWUiLCJnZXRJdGVtIiwiZGlzcG9zYWJsZXMiLCJob3N0RWwiLCJkb2N1bWVudCIsImNyZWF0ZUVsZW1lbnQiLCJwYW5lIiwiYWRkTW9kYWxQYW5lbCIsImNsYXNzTmFtZSIsInBhcmVudEVsIiwicGFyZW50RWxlbWVudCIsInN0eWxlIiwibWF4V2lkdGgiLCJvbkRpZENoYW5nZVZpc2libGUiLCJ2aXNpYmxlIiwicmVtb3ZlIiwiREVCVUdHRVJfVE9HR0xFX0FUVEFDSF9ESUFMT0ciLCJkZXN0cm95Iiwic2VsZWN0ZWRUZXh0IiwiZ2V0VGV4dEluQnVmZmVyUmFuZ2UiLCJleHByIiwiZ2V0Q3Vyc29yQnVmZmVyUG9zaXRpb24iLCJ3YXRjaEV4cHJlc3Npb24iLCJ3b3JkTWF0Y2giLCJhZGRXYXRjaEV4cHJlc3Npb24iLCJydW5Ub0xvY2F0aW9uIiwic2VsZWN0aW9uIiwid2luZG93IiwiZ2V0U2VsZWN0aW9uIiwiY2xpY2tlZEVsZW1lbnQiLCJ0YXJnZXRDbGFzcyIsImNvcHlFbGVtZW50IiwiY2xvc2VzdCIsInRvU3RyaW5nIiwiY29udGFpbnMiLCJhbmNob3JOb2RlIiwiY2xpcGJvYXJkIiwid3JpdGUiLCJ0ZXh0Q29udGVudCIsImNhbGxzdGFja1RleHQiLCJnZXRGdWxsQ2FsbFN0YWNrIiwiZXhwZWN0ZWRTdGFjayIsImlzUGVuZGluZyIsInRha2UiLCJnZXRPckRlZmF1bHQiLCJpIiwiYmFzZW5hbWUiLCJzb3VyY2UiLCJyYW5nZSIsInN0YXJ0Iiwib3MiLCJFT0wiLCJ0cmltIiwiY29uc3VtZUN1cnJlbnRXb3JraW5nRGlyZWN0b3J5IiwiY3dkQXBpIiwidXBkYXRlU2VsZWN0ZWRDb25uZWN0aW9uIiwiZGlyZWN0b3J5IiwiY29ubiIsImNyZWF0ZVJlbW90ZVVyaSIsIm9ic2VydmVDd2QiLCJjcmVhdGVBdXRvY29tcGxldGVQcm92aWRlciIsImxhYmVscyIsInNlbGVjdG9yIiwiZmlsdGVyU3VnZ2VzdGlvbnMiLCJnZXRTdWdnZXN0aW9ucyIsImNvbnN1bWVDb25zb2xlIiwiY3JlYXRlQ29uc29sZSIsImNvbnN1bWVUZXJtaW5hbCIsInRlcm1pbmFsQXBpIiwiY29uc3VtZVJwY1NlcnZpY2UiLCJycGNTZXJ2aWNlIiwiY29uc3VtZVJlZ2lzdGVyRXhlY3V0b3IiLCJyZWdpc3RlckV4ZWN1dG9yIiwiY29uc3VtZURlYnVnZ2VyUHJvdmlkZXIiLCJwcm92aWRlciIsImFkZERlYnVnZ2VyUHJvdmlkZXIiLCJyZW1vdmVEZWJ1Z2dlclByb3ZpZGVyIiwiY29uc3VtZURlYnVnZ2VyQ29uZmlndXJhdGlvblByb3ZpZGVycyIsInByb3ZpZGVycyIsImlzQXJyYXkiLCJjb25zdW1lVG9vbEJhciIsImdldFRvb2xCYXIiLCJ0b29sQmFyIiwiYWRkQnV0dG9uIiwiaWNvbnNldCIsImljb24iLCJjYWxsYmFjayIsInRvb2x0aXAiLCJwcmlvcml0eSIsImVsZW1lbnQiLCJyZW1vdmVJdGVtcyIsImNvbnN1bWVOb3RpZmljYXRpb25zIiwicmFpc2VOYXRpdmVOb3RpZmljYXRpb24iLCJwcm92aWRlUmVtb3RlQ29udHJvbFNlcnZpY2UiLCJSZW1vdGVDb250cm9sU2VydmljZSIsImNvbnN1bWVEYXRhdGlwU2VydmljZSIsInNlcnZpY2UiLCJhZGRQcm92aWRlciIsIl9jcmVhdGVEYXRhdGlwUHJvdmlkZXIiLCJwcm92aWRlck5hbWUiLCJkYXRhdGlwIiwicG9zaXRpb24iLCJ2aWV3IiwiY3JlYXRlVmlldyIsImVsZW0iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQWdCQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFTQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSxvQkFBb0IsR0FBRyxrQkFBN0I7O0FBUUEsSUFBSUMsWUFBSjs7QUFDQSxJQUFJQyxRQUFKOztBQUNBLElBQUlDLGtCQUFKOztBQUNBLElBQUlD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RUFBdUUsNkNBQWtCRixPQUFsQixDQUF2RSxDQUFuQjs7QUFDQXRVLEVBQUFBLFlBQVksQ0FBQ2tFLEdBQWIsQ0FBaUIyRyxVQUFqQjs7QUFDQSxTQUFPQSxVQUFQO0FBQ0Q7O0FBRUQsU0FBUzJKLHNCQUFULEdBQW1EO0FBQ2pELFNBQU87QUFDTDtBQUNBQyxJQUFBQSxZQUFZLEVBQUUxVSxvQkFGVDtBQUdMK1QsSUFBQUEsUUFBUSxFQUFFLENBSEw7QUFJTFksSUFBQUEsT0FBTyxFQUFFLENBQUM3TCxNQUFELEVBQXFCOEwsUUFBckIsS0FBOEM7QUFDckQsYUFBTyxzQ0FBZ0J4VSxRQUFoQixFQUEwQjBJLE1BQTFCLEVBQWtDOEwsUUFBbEMsQ0FBUDtBQUNEO0FBTkksR0FBUDtBQVFEOztBQUVELFNBQVM1VCxrQkFBVCxDQUE0QjZJLEtBQTVCLEVBQXdEO0FBQ3RELE1BQUlnTCxJQUFJLEdBQUcsSUFBWDs7QUFDQSxNQUFJaEwsS0FBSyxZQUFZOUksOEJBQWpCLElBQTBDOEksS0FBSyxZQUFZNUksdUNBQS9ELEVBQStGO0FBQzdGNFQsSUFBQUEsSUFBSSxHQUFHaEwsS0FBSyxDQUFDaUwsVUFBTixFQUFQO0FBQ0Q7O0FBRUQsTUFBSUQsSUFBSSxJQUFJLElBQVosRUFBa0I7QUFDaEIsVUFBTUUsSUFBSSxHQUFHLHNDQUFnQkYsSUFBaEIsQ0FBYjtBQUNBRSxJQUFBQSxJQUFJLENBQUNoRyxTQUFMLEdBQWlCLG9CQUFqQjtBQUNBLFdBQU9nRyxJQUFQO0FBQ0Q7O0FBRUQsU0FBTyxJQUFQO0FBQ0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7XG4gIERlYnVnZ2VyQ29uZmlnQWN0aW9uLFxuICBEZWJ1Z2dlckxhdW5jaEF0dGFjaFByb3ZpZGVyLFxuICBOdWNsaWRlRGVidWdnZXJQcm92aWRlcixcbiAgRGVidWdnZXJDb25maWd1cmF0aW9uUHJvdmlkZXIsXG59IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtZGVidWdnZXItY29tbW9uXCJcbmltcG9ydCB0eXBlIHtcbiAgQ29uc29sZVNlcnZpY2UsXG4gIERhdGF0aXBQcm92aWRlcixcbiAgRGF0YXRpcFNlcnZpY2UsXG4gIFJlZ2lzdGVyRXhlY3V0b3JGdW5jdGlvbixcbiAgVGVybWluYWxBcGksXG59IGZyb20gXCJhdG9tLWlkZS11aVwiXG5pbXBvcnQgdHlwZSB7IE51Y2xpZGVVcmkgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvbnVjbGlkZVVyaVwiXG5pbXBvcnQgdHlwZSB7IFNlcmlhbGl6ZWRTdGF0ZSwgSUJyZWFrcG9pbnQgfSBmcm9tIFwiLi90eXBlc1wiXG5cbmltcG9ydCBpZHggZnJvbSBcImlkeFwiXG5pbXBvcnQgeyBvYnNlcnZlUmVtb3ZlZEhvc3RuYW1lcyB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy1hdG9tL3Byb2plY3RzXCJcbmltcG9ydCBCcmVha3BvaW50TWFuYWdlciBmcm9tIFwiLi9CcmVha3BvaW50TWFuYWdlclwiXG5pbXBvcnQgeyBBbmFseXRpY3NFdmVudHMsIERlYnVnZ2VyTW9kZSB9IGZyb20gXCIuL2NvbnN0YW50c1wiXG5pbXBvcnQgQnJlYWtwb2ludENvbmZpZ0NvbXBvbmVudCBmcm9tIFwiLi91aS9CcmVha3BvaW50Q29uZmlnQ29tcG9uZW50XCJcbmltcG9ydCB7IGdldExpbmVGb3JFdmVudCB9IGZyb20gXCIuL3V0aWxzXCJcbmltcG9ydCBVbml2ZXJzYWxEaXNwb3NhYmxlIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9Vbml2ZXJzYWxEaXNwb3NhYmxlXCJcbmltcG9ydCBpbnZhcmlhbnQgZnJvbSBcImFzc2VydFwiXG5pbXBvcnQgeyB0cmFjayB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9hbmFseXRpY3NcIlxuaW1wb3J0IFJlbW90ZUNvbnRyb2xTZXJ2aWNlIGZyb20gXCIuL1JlbW90ZUNvbnRyb2xTZXJ2aWNlXCJcbmltcG9ydCBEZWJ1Z2dlclVpTW9kZWwgZnJvbSBcIi4vRGVidWdnZXJVaU1vZGVsXCJcbmltcG9ydCBEZWJ1Z1NlcnZpY2UgZnJvbSBcIi4vdnNwL0RlYnVnU2VydmljZVwiXG5pbXBvcnQgeyBkZWJ1Z2dlckRhdGF0aXAgfSBmcm9tIFwiLi9EZWJ1Z2dlckRhdGF0aXBcIlxuaW1wb3J0ICogYXMgUmVhY3QgZnJvbSBcInJlYWN0XCJcbmltcG9ydCBSZWFjdERPTSBmcm9tIFwicmVhY3QtZG9tXCJcbmltcG9ydCBEZWJ1Z2dlckxhdW5jaEF0dGFjaFVJIGZyb20gXCIuL3VpL0RlYnVnZ2VyTGF1bmNoQXR0YWNoVUlcIlxuaW1wb3J0IHsgcmVuZGVyUmVhY3RSb290IH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL3JlbmRlclJlYWN0Um9vdFwiXG5pbXBvcnQgbnVjbGlkZVVyaSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvbnVjbGlkZVVyaVwiXG5pbXBvcnQge1xuICBzZXROb3RpZmljYXRpb25TZXJ2aWNlLFxuICBzZXRDb25zb2xlU2VydmljZSxcbiAgc2V0Q29uc29sZVJlZ2lzdGVyRXhlY3V0b3IsXG4gIHNldERhdGF0aXBTZXJ2aWNlLFxuICBzZXRUZXJtaW5hbFNlcnZpY2UsXG4gIHNldFJwY1NlcnZpY2UsXG4gIGFkZERlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyLFxufSBmcm9tIFwiLi9BdG9tU2VydmljZUNvbnRhaW5lclwiXG5pbXBvcnQgeyB3b3JkQXRQb3NpdGlvbiwgdHJpbVJhbmdlIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLWF0b20vcmFuZ2VcIlxuaW1wb3J0IERlYnVnZ2VyTGF5b3V0TWFuYWdlciBmcm9tIFwiLi91aS9EZWJ1Z2dlckxheW91dE1hbmFnZXJcIlxuaW1wb3J0IERlYnVnZ2VyUGFuZVZpZXdNb2RlbCBmcm9tIFwiLi91aS9EZWJ1Z2dlclBhbmVWaWV3TW9kZWxcIlxuaW1wb3J0IERlYnVnZ2VyUGFuZUNvbnRhaW5lclZpZXdNb2RlbCBmcm9tIFwiLi91aS9EZWJ1Z2dlclBhbmVDb250YWluZXJWaWV3TW9kZWxcIlxuaW1wb3J0IG9zIGZyb20gXCJvc1wiXG5pbXBvcnQgbnVsbHRocm93cyBmcm9tIFwibnVsbHRocm93c1wiXG5pbXBvcnQgUmVhY3RNb3VudFJvb3RFbGVtZW50IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9SZWFjdE1vdW50Um9vdEVsZW1lbnRcIlxuaW1wb3J0IHsgc29ydE1lbnVHcm91cHMgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvbWVudVV0aWxzXCJcbmltcG9ydCBwYXNzZXNHSyBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvcGFzc2VzR0tcIlxuXG5jb25zdCBEQVRBVElQX1BBQ0tBR0VfTkFNRSA9IFwiZGVidWdnZXItZGF0YXRpcFwiXG5cbnR5cGUgTGF1bmNoQXR0YWNoRGlhbG9nQXJncyA9IHtcbiAgZGlhbG9nTW9kZTogRGVidWdnZXJDb25maWdBY3Rpb24sXG4gIHNlbGVjdGVkVGFiTmFtZT86IHN0cmluZyxcbiAgY29uZmlnPzogeyBbc3RyaW5nXTogbWl4ZWQgfSxcbn1cblxubGV0IF9kaXNwb3NhYmxlczogVW5pdmVyc2FsRGlzcG9zYWJsZVxubGV0IF91aU1vZGVsOiBEZWJ1Z2dlclVpTW9kZWxcbmxldCBfYnJlYWtwb2ludE1hbmFnZXI6IEJyZWFrcG9pbnRNYW5hZ2VyXG5sZXQgX3NlcnZpY2U6IERlYnVnU2VydmljZVxubGV0IF9sYXlvdXRNYW5hZ2VyOiBEZWJ1Z2dlckxheW91dE1hbmFnZXJcbmxldCBfc2VsZWN0ZWREZWJ1Z0Nvbm5lY3Rpb246ID9zdHJpbmdcbmxldCBfdmlzaWJsZUxhdW5jaEF0dGFjaERpYWxvZ01vZGU6ID9EZWJ1Z2dlckNvbmZpZ0FjdGlvblxubGV0IF9sYXVjaEF0dGFjaERpYWxvZ0Nsb3NlcjogPygpID0+IHZvaWRcbmxldCBfY29ubmVjdGlvblByb3ZpZGVyczogTWFwPHN0cmluZywgQXJyYXk8RGVidWdnZXJMYXVuY2hBdHRhY2hQcm92aWRlcj4+XG5cbmV4cG9ydCBmdW5jdGlvbiBhY3RpdmF0ZShzdGF0ZTogP1NlcmlhbGl6ZWRTdGF0ZSkge1xuICBhdG9tLnZpZXdzLmFkZFZpZXdQcm92aWRlcihEZWJ1Z2dlclBhbmVWaWV3TW9kZWwsIGNyZWF0ZURlYnVnZ2VyVmlldylcbiAgYXRvbS52aWV3cy5hZGRWaWV3UHJvdmlkZXIoRGVidWdnZXJQYW5lQ29udGFpbmVyVmlld01vZGVsLCBjcmVhdGVEZWJ1Z2dlclZpZXcpXG4gIF9zZXJ2aWNlID0gbmV3IERlYnVnU2VydmljZShzdGF0ZSlcbiAgX3VpTW9kZWwgPSBuZXcgRGVidWdnZXJVaU1vZGVsKF9zZXJ2aWNlKVxuICBfYnJlYWtwb2ludE1hbmFnZXIgPSBuZXcgQnJlYWtwb2ludE1hbmFnZXIoX3NlcnZpY2UpXG4gIF9zZWxlY3RlZERlYnVnQ29ubmVjdGlvbiA9IG51bGxcbiAgX3Zpc2libGVMYXVuY2hBdHRhY2hEaWFsb2dNb2RlID0gbnVsbFxuICBfbGF1Y2hBdHRhY2hEaWFsb2dDbG9zZXIgPSBudWxsXG4gIF9jb25uZWN0aW9uUHJvdmlkZXJzID0gbmV3IE1hcCgpXG4gIF9sYXlvdXRNYW5hZ2VyID0gbmV3IERlYnVnZ2VyTGF5b3V0TWFuYWdlcihfc2VydmljZSwgc3RhdGUpXG5cbiAgLy8gTWFudWFsbHkgbWFuaXB1bGF0ZSB0aGUgYERlYnVnZ2VyYCB0b3AgbGV2ZWwgbWVudSBvcmRlci5cbiAgY29uc3QgaW5zZXJ0SW5kZXggPSBhdG9tLm1lbnUudGVtcGxhdGUuZmluZEluZGV4KChpdGVtKSA9PiBpdGVtLnJvbGUgPT09IFwid2luZG93XCIgfHwgaXRlbS5yb2xlID09PSBcImhlbHBcIilcbiAgaWYgKGluc2VydEluZGV4ICE9PSAtMSkge1xuICAgIGNvbnN0IGRldWdnZXJJbmRleCA9IGF0b20ubWVudS50ZW1wbGF0ZS5maW5kSW5kZXgoKGl0ZW0pID0+IGl0ZW0ubGFiZWwgPT09IFwiRGVidWdnZXJcIilcbiAgICBjb25zdCBtZW51SXRlbSA9IGF0b20ubWVudS50ZW1wbGF0ZS5zcGxpY2UoZGV1Z2dlckluZGV4LCAxKVswXVxuICAgIGNvbnN0IG5ld0luZGV4ID0gaW5zZXJ0SW5kZXggPiBkZXVnZ2VySW5kZXggPyBpbnNlcnRJbmRleCAtIDEgOiBpbnNlcnRJbmRleFxuICAgIGF0b20ubWVudS50ZW1wbGF0ZS5zcGxpY2UobmV3SW5kZXgsIDAsIG1lbnVJdGVtKVxuICAgIGF0b20ubWVudS51cGRhdGUoKVxuICB9XG5cbiAgY29uc3QgcmVtb3ZlZEhvc3RuYW1lcyA9IG9ic2VydmVSZW1vdmVkSG9zdG5hbWVzKClcblxuICBfZGlzcG9zYWJsZXMgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZShcbiAgICBfbGF5b3V0TWFuYWdlcixcbiAgICBfc2VydmljZSxcbiAgICBfdWlNb2RlbCxcbiAgICBfYnJlYWtwb2ludE1hbmFnZXIsXG4gICAgcmVtb3ZlZEhvc3RuYW1lcy5zdWJzY3JpYmUoKGhvc3RuYW1lKSA9PiB7XG4gICAgICBfc2VydmljZVxuICAgICAgICAuZ2V0TW9kZWwoKVxuICAgICAgICAuZ2V0UHJvY2Vzc2VzKClcbiAgICAgICAgLmZvckVhY2goKGRlYnVnZ2VyUHJvY2VzcykgPT4ge1xuICAgICAgICAgIGNvbnN0IGRlYnVnZ2VlVGFyZ2V0VXJpID0gZGVidWdnZXJQcm9jZXNzLmNvbmZpZ3VyYXRpb24udGFyZ2V0VXJpXG4gICAgICAgICAgaWYgKG51Y2xpZGVVcmkuaXNMb2NhbChkZWJ1Z2dlZVRhcmdldFVyaSkpIHtcbiAgICAgICAgICAgIHJldHVybiAvLyBOb3RoaW5nIHRvIGRvIGlmIG91ciBkZWJ1ZyBzZXNzaW9uIGlzIGxvY2FsLlxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAobnVjbGlkZVVyaS5nZXRIb3N0bmFtZShkZWJ1Z2dlZVRhcmdldFVyaSkgPT09IGhvc3RuYW1lKSB7XG4gICAgICAgICAgICBfc2VydmljZS5zdG9wUHJvY2VzcyhkZWJ1Z2dlclByb2Nlc3MpXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIH0pLFxuICAgIF91aU1vZGVsLm9uQ29ubmVjdGlvbnNVcGRhdGVkKCgpID0+IHtcbiAgICAgIGNvbnN0IG5ld0Nvbm5lY3Rpb25zID0gX3VpTW9kZWwuZ2V0Q29ubmVjdGlvbnMoKVxuICAgICAgY29uc3Qga2V5cyA9IEFycmF5LmZyb20oX2Nvbm5lY3Rpb25Qcm92aWRlcnMua2V5cygpKVxuXG4gICAgICBjb25zdCByZW1vdmVkQ29ubmVjdGlvbnMgPSBrZXlzLmZpbHRlcigoY29ubmVjdGlvbikgPT4gbmV3Q29ubmVjdGlvbnMuZmluZCgoaXRlbSkgPT4gaXRlbSA9PT0gY29ubmVjdGlvbikgPT0gbnVsbClcbiAgICAgIGNvbnN0IGFkZGVkQ29ubmVjdGlvbnMgPSBuZXdDb25uZWN0aW9ucy5maWx0ZXIoKGNvbm5lY3Rpb24pID0+IGtleXMuZmluZCgoaXRlbSkgPT4gaXRlbSA9PT0gY29ubmVjdGlvbikgPT0gbnVsbClcblxuICAgICAgZm9yIChjb25zdCBrZXkgb2YgcmVtb3ZlZENvbm5lY3Rpb25zKSB7XG4gICAgICAgIF9jb25uZWN0aW9uUHJvdmlkZXJzLmRlbGV0ZShrZXkpXG4gICAgICB9XG5cbiAgICAgIGZvciAoY29uc3QgY29ubmVjdGlvbiBvZiBhZGRlZENvbm5lY3Rpb25zKSB7XG4gICAgICAgIF9zZXRQcm92aWRlcnNGb3JDb25uZWN0aW9uKGNvbm5lY3Rpb24pXG4gICAgICB9XG4gICAgfSksXG4gICAgX3VpTW9kZWwub25Qcm92aWRlcnNVcGRhdGVkKCgpID0+IHtcbiAgICAgIGNvbnN0IGNvbm5lY3Rpb25zID0gX3VpTW9kZWwuZ2V0Q29ubmVjdGlvbnMoKVxuICAgICAgZm9yIChjb25zdCBjb25uZWN0aW9uIG9mIGNvbm5lY3Rpb25zKSB7XG4gICAgICAgIF9zZXRQcm92aWRlcnNGb3JDb25uZWN0aW9uKGNvbm5lY3Rpb24pXG4gICAgICB9XG4gICAgfSksXG4gICAgLy8gQ29tbWFuZHMuXG4gICAgYXRvbS5jb21tYW5kcy5hZGQoXCJhdG9tLXdvcmtzcGFjZVwiLCB7XG4gICAgICBcImRlYnVnZ2VyOnNob3ctYXR0YWNoLWRpYWxvZ1wiOiAoZXZlbnQpID0+IHtcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWRUYWJOYW1lOiBhbnkgPSBpZHgoZXZlbnQsIChfKSA9PiBfLmRldGFpbC5zZWxlY3RlZFRhYk5hbWUpXG4gICAgICAgIGNvbnN0IGNvbmZpZzogYW55ID0gaWR4KGV2ZW50LCAoXykgPT4gXy5kZXRhaWwuY29uZmlnKVxuICAgICAgICBfc2hvd0xhdW5jaEF0dGFjaERpYWxvZyh7XG4gICAgICAgICAgZGlhbG9nTW9kZTogXCJhdHRhY2hcIixcbiAgICAgICAgICBzZWxlY3RlZFRhYk5hbWUsXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICB9KSxcbiAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIHtcbiAgICAgIFwiZGVidWdnZXI6c2hvdy1sYXVuY2gtZGlhbG9nXCI6IChldmVudCkgPT4ge1xuICAgICAgICBjb25zdCBzZWxlY3RlZFRhYk5hbWU6IGFueSA9IGV2ZW50Py5kZXRhaWw/LnNlbGVjdGVkVGFiTmFtZVxuICAgICAgICBjb25zdCBjb25maWc6IGFueSA9IGV2ZW50Py5kZXRhaWw/LmNvbmZpZ1xuICAgICAgICBfc2hvd0xhdW5jaEF0dGFjaERpYWxvZyh7XG4gICAgICAgICAgZGlhbG9nTW9kZTogXCJsYXVuY2hcIixcbiAgICAgICAgICBzZWxlY3RlZFRhYk5hbWUsXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICB9KVxuICAgICAgfSxcbiAgICB9KSxcbiAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIHtcbiAgICAgIFwiZGVidWdnZXI6Y29udGludWUtZGVidWdnaW5nXCI6IF9jb250aW51ZS5iaW5kKHRoaXMpLFxuICAgIH0pLFxuICAgIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwge1xuICAgICAgXCJkZWJ1Z2dlcjpzdG9wLWRlYnVnZ2luZ1wiOiBfc3RvcC5iaW5kKHRoaXMpLFxuICAgIH0pLFxuICAgIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwge1xuICAgICAgXCJkZWJ1Z2dlcjpyZXN0YXJ0LWRlYnVnZ2luZ1wiOiBfcmVzdGFydC5iaW5kKHRoaXMpLFxuICAgIH0pLFxuICAgIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwge1xuICAgICAgXCJkZWJ1Z2dlcjpzdGVwLW92ZXJcIjogX3N0ZXBPdmVyLmJpbmQodGhpcyksXG4gICAgfSksXG4gICAgYXRvbS5jb21tYW5kcy5hZGQoXCJhdG9tLXdvcmtzcGFjZVwiLCB7XG4gICAgICBcImRlYnVnZ2VyOnN0ZXAtaW50b1wiOiBfc3RlcEludG8uYmluZCh0aGlzKSxcbiAgICB9KSxcbiAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIHtcbiAgICAgIFwiZGVidWdnZXI6c3RlcC1vdXRcIjogX3N0ZXBPdXQuYmluZCh0aGlzKSxcbiAgICB9KSxcbiAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIHtcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBudWNsaWRlLWludGVybmFsL2F0b20tYXBpc1xuICAgICAgXCJkZWJ1Z2dlcjphZGQtYnJlYWtwb2ludFwiOiBfYWRkQnJlYWtwb2ludC5iaW5kKHRoaXMpLFxuICAgIH0pLFxuICAgIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwge1xuICAgICAgXCJkZWJ1Z2dlcjp0b2dnbGUtYnJlYWtwb2ludFwiOiBfdG9nZ2xlQnJlYWtwb2ludC5iaW5kKHRoaXMpLFxuICAgIH0pLFxuICAgIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwge1xuICAgICAgXCJkZWJ1Z2dlcjp0b2dnbGUtYnJlYWtwb2ludC1lbmFibGVkXCI6IF90b2dnbGVCcmVha3BvaW50RW5hYmxlZC5iaW5kKHRoaXMpLFxuICAgIH0pLFxuICAgIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwge1xuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG51Y2xpZGUtaW50ZXJuYWwvYXRvbS1hcGlzXG4gICAgICBcImRlYnVnZ2VyOmVkaXQtYnJlYWtwb2ludFwiOiBfY29uZmlndXJlQnJlYWtwb2ludC5iaW5kKHRoaXMpLFxuICAgIH0pLFxuICAgIGF0b20uY29tbWFuZHMuYWRkKFwiLmRlYnVnZ2VyLXRocmVhZC1saXN0LWl0ZW1cIiwge1xuICAgICAgXCJkZWJ1Z2dlcjp0ZXJtaW5hdGUtdGhyZWFkXCI6IF90ZXJtaW5hdGVUaHJlYWQuYmluZCh0aGlzKSxcbiAgICB9KSxcbiAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIHtcbiAgICAgIFwiZGVidWdnZXI6cmVtb3ZlLWFsbC1icmVha3BvaW50c1wiOiBfZGVsZXRlQWxsQnJlYWtwb2ludHMuYmluZCh0aGlzKSxcbiAgICB9KSxcbiAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIHtcbiAgICAgIFwiZGVidWdnZXI6ZW5hYmxlLWFsbC1icmVha3BvaW50c1wiOiBfZW5hYmxlQWxsQnJlYWtwb2ludHMuYmluZCh0aGlzKSxcbiAgICB9KSxcbiAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIHtcbiAgICAgIFwiZGVidWdnZXI6ZGlzYWJsZS1hbGwtYnJlYWtwb2ludHNcIjogX2Rpc2FibGVBbGxCcmVha3BvaW50cy5iaW5kKHRoaXMpLFxuICAgIH0pLFxuICAgIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwge1xuICAgICAgXCJkZWJ1Z2dlcjpyZW1vdmUtYnJlYWtwb2ludFwiOiBfZGVsZXRlQnJlYWtwb2ludC5iaW5kKHRoaXMpLFxuICAgIH0pLFxuICAgIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwge1xuICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG51Y2xpZGUtaW50ZXJuYWwvYXRvbS1hcGlzXG4gICAgICBcImRlYnVnZ2VyOmFkZC10by13YXRjaFwiOiBfYWRkVG9XYXRjaC5iaW5kKHRoaXMpLFxuICAgIH0pLFxuICAgIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwge1xuICAgICAgXCJkZWJ1Z2dlcjpydW4tdG8tbG9jYXRpb25cIjogX3J1blRvTG9jYXRpb24uYmluZCh0aGlzKSxcbiAgICB9KSxcbiAgICBhdG9tLmNvbW1hbmRzLmFkZChcIi5kZWJ1Z2dlci1leHByZXNzaW9uLXZhbHVlLWxpc3RcIiwge1xuICAgICAgXCJkZWJ1Z2dlcjpjb3B5LWRlYnVnZ2VyLWV4cHJlc3Npb24tdmFsdWVcIjogX2NvcHlEZWJ1Z2dlckV4cHJlc3Npb25WYWx1ZS5iaW5kKHRoaXMpLFxuICAgIH0pLFxuICAgIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwge1xuICAgICAgXCJkZWJ1Z2dlcjpjb3B5LWRlYnVnZ2VyLWNhbGxzdGFja1wiOiBfY29weURlYnVnZ2VyQ2FsbHN0YWNrLmJpbmQodGhpcyksXG4gICAgfSksXG4gICAgLy8gQ29udGV4dCBNZW51IEl0ZW1zLlxuICAgIGF0b20uY29udGV4dE1lbnUuYWRkKHtcbiAgICAgIFwiLmRlYnVnZ2VyLWJyZWFrcG9pbnQtbGlzdFwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBsYWJlbDogXCJFbmFibGUgQWxsIEJyZWFrcG9pbnRzXCIsXG4gICAgICAgICAgY29tbWFuZDogXCJkZWJ1Z2dlcjplbmFibGUtYWxsLWJyZWFrcG9pbnRzXCIsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBsYWJlbDogXCJEaXNhYmxlIEFsbCBCcmVha3BvaW50c1wiLFxuICAgICAgICAgIGNvbW1hbmQ6IFwiZGVidWdnZXI6ZGlzYWJsZS1hbGwtYnJlYWtwb2ludHNcIixcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIGxhYmVsOiBcIlJlbW92ZSBBbGwgQnJlYWtwb2ludHNcIixcbiAgICAgICAgICBjb21tYW5kOiBcImRlYnVnZ2VyOnJlbW92ZS1hbGwtYnJlYWtwb2ludHNcIixcbiAgICAgICAgfSxcbiAgICAgICAgeyB0eXBlOiBcInNlcGFyYXRvclwiIH0sXG4gICAgICBdLFxuICAgICAgXCIuZGVidWdnZXItYnJlYWtwb2ludFwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBsYWJlbDogXCJFZGl0IGJyZWFrcG9pbnQuLi5cIixcbiAgICAgICAgICBjb21tYW5kOiBcImRlYnVnZ2VyOmVkaXQtYnJlYWtwb2ludFwiLFxuICAgICAgICAgIHNob3VsZERpc3BsYXk6IChldmVudCkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYnAgPSBfZ2V0QnJlYWtwb2ludEZyb21FdmVudChldmVudClcbiAgICAgICAgICAgIHJldHVybiBicCAhPSBudWxsICYmIF9zdXBwb3J0c0NvbmRpdGlvbmFsQnJlYWtwb2ludHMoKVxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBsYWJlbDogXCJSZW1vdmUgQnJlYWtwb2ludFwiLFxuICAgICAgICAgIGNvbW1hbmQ6IFwiZGVidWdnZXI6cmVtb3ZlLWJyZWFrcG9pbnRcIixcbiAgICAgICAgfSxcbiAgICAgICAgeyB0eXBlOiBcInNlcGFyYXRvclwiIH0sXG4gICAgICBdLFxuICAgICAgXCIuZGVidWdnZXItdGhyZWFkLWxpc3QtaXRlbVwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBsYWJlbDogXCJUZXJtaW5hdGUgdGhyZWFkXCIsXG4gICAgICAgICAgY29tbWFuZDogXCJkZWJ1Z2dlcjp0ZXJtaW5hdGUtdGhyZWFkXCIsXG4gICAgICAgICAgc2hvdWxkRGlzcGxheTogKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICBjb25zdCB0YXJnZXQ6IEhUTUxFbGVtZW50ID0gZXZlbnQudGFyZ2V0XG4gICAgICAgICAgICBpZiAodGFyZ2V0LmRhdGFzZXQudGhyZWFkaWQpIHtcbiAgICAgICAgICAgICAgY29uc3QgdGhyZWFkSWQgPSBwYXJzZUludCh0YXJnZXQuZGF0YXNldC50aHJlYWRpZCwgMTApXG4gICAgICAgICAgICAgIGlmICghTnVtYmVyLmlzTmFOKHRocmVhZElkKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBfc3VwcG9ydHNUZXJtaW5hdGVUaHJlYWRzUmVxdWVzdCgpICYmICFfaXNSZWFkT25seVRhcmdldCgpXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgXCIuZGVidWdnZXItY2FsbHN0YWNrLXRhYmxlXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIGxhYmVsOiBcIkNvcHkgQ2FsbHN0YWNrXCIsXG4gICAgICAgICAgY29tbWFuZDogXCJkZWJ1Z2dlcjpjb3B5LWRlYnVnZ2VyLWNhbGxzdGFja1wiLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIFwiLmRlYnVnZ2VyLWV4cHJlc3Npb24tdmFsdWUtbGlzdFwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBsYWJlbDogXCJDb3B5XCIsXG4gICAgICAgICAgY29tbWFuZDogXCJkZWJ1Z2dlcjpjb3B5LWRlYnVnZ2VyLWV4cHJlc3Npb24tdmFsdWVcIixcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICBcImF0b20tdGV4dC1lZGl0b3JcIjogW1xuICAgICAgICB7IHR5cGU6IFwic2VwYXJhdG9yXCIgfSxcbiAgICAgICAge1xuICAgICAgICAgIGxhYmVsOiBcIkRlYnVnZ2VyXCIsXG4gICAgICAgICAgc3VibWVudTogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBsYWJlbDogXCJUb2dnbGUgQnJlYWtwb2ludFwiLFxuICAgICAgICAgICAgICBjb21tYW5kOiBcImRlYnVnZ2VyOnRvZ2dsZS1icmVha3BvaW50XCIsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBsYWJlbDogXCJUb2dnbGUgQnJlYWtwb2ludCBlbmFibGVkL2Rpc2FibGVkXCIsXG4gICAgICAgICAgICAgIGNvbW1hbmQ6IFwiZGVidWdnZXI6dG9nZ2xlLWJyZWFrcG9pbnQtZW5hYmxlZFwiLFxuICAgICAgICAgICAgICBzaG91bGREaXNwbGF5OiAoZXZlbnQpID0+XG4gICAgICAgICAgICAgICAgX2V4ZWN1dGVXaXRoRWRpdG9yUGF0aChcbiAgICAgICAgICAgICAgICAgIGV2ZW50LFxuICAgICAgICAgICAgICAgICAgKGZpbGVQYXRoLCBsaW5lKSA9PiBfc2VydmljZS5nZXRNb2RlbCgpLmdldEJyZWFrcG9pbnRBdExpbmUoZmlsZVBhdGgsIGxpbmUpICE9IG51bGxcbiAgICAgICAgICAgICAgICApIHx8IGZhbHNlLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgbGFiZWw6IFwiRWRpdCBCcmVha3BvaW50Li4uXCIsXG4gICAgICAgICAgICAgIGNvbW1hbmQ6IFwiZGVidWdnZXI6ZWRpdC1icmVha3BvaW50XCIsXG4gICAgICAgICAgICAgIHNob3VsZERpc3BsYXk6IChldmVudCkgPT5cbiAgICAgICAgICAgICAgICBfZXhlY3V0ZVdpdGhFZGl0b3JQYXRoKGV2ZW50LCAoZmlsZVBhdGgsIGxpbmUpID0+IHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IGJwID0gX3NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50QXRMaW5lKGZpbGVQYXRoLCBsaW5lKVxuICAgICAgICAgICAgICAgICAgcmV0dXJuIGJwICE9IG51bGwgJiYgX3N1cHBvcnRzQ29uZGl0aW9uYWxCcmVha3BvaW50cygpXG4gICAgICAgICAgICAgICAgfSkgfHwgZmFsc2UsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBsYWJlbDogXCJBZGQgdG8gV2F0Y2hcIixcbiAgICAgICAgICAgICAgY29tbWFuZDogXCJkZWJ1Z2dlcjphZGQtdG8td2F0Y2hcIixcbiAgICAgICAgICAgICAgc2hvdWxkRGlzcGxheTogKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dEVkaXRvciA9IGF0b20ud29ya3NwYWNlLmdldEFjdGl2ZVRleHRFZGl0b3IoKVxuICAgICAgICAgICAgICAgIGlmIChfc2VydmljZS5nZXREZWJ1Z2dlck1vZGUoKSA9PT0gRGVidWdnZXJNb2RlLlNUT1BQRUQgfHwgdGV4dEVkaXRvciA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRleHRFZGl0b3IuZ2V0U2VsZWN0aW9ucygpLmxlbmd0aCA9PT0gMSAmJiAhdGV4dEVkaXRvci5nZXRTZWxlY3RlZEJ1ZmZlclJhbmdlKCkuaXNFbXB0eSgpXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBsYWJlbDogXCJSdW4gdG8gTG9jYXRpb25cIixcbiAgICAgICAgICAgICAgY29tbWFuZDogXCJkZWJ1Z2dlcjpydW4tdG8tbG9jYXRpb25cIixcbiAgICAgICAgICAgICAgc2hvdWxkRGlzcGxheTogKGV2ZW50KSA9PiBfc2VydmljZS5nZXREZWJ1Z2dlck1vZGUoKSA9PT0gRGVidWdnZXJNb2RlLlBBVVNFRCAmJiAhX2lzUmVhZE9ubHlUYXJnZXQoKSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgICAgeyB0eXBlOiBcInNlcGFyYXRvclwiIH0sXG4gICAgICBdLFxuICAgIH0pLFxuICAgIF9yZWdpc3RlckNvbW1hbmRzQ29udGV4dE1lbnVBbmRPcGVuZXIoKVxuICApXG5cbiAgc29ydE1lbnVHcm91cHMoW1wiRGVidWdnZXJcIl0pXG59XG5cbmZ1bmN0aW9uIF9zdXBwb3J0c0NvbmRpdGlvbmFsQnJlYWtwb2ludHMoKTogYm9vbGVhbiB7XG4gIC8vIElmIGN1cnJlbnRseSBkZWJ1Z2dpbmcsIHJldHVybiB3aGV0aGVyIG9yIG5vdCB0aGUgY3VycmVudCBkZWJ1Z2dlciBzdXBwb3J0c1xuICBjb25zdCB7IGZvY3VzZWRQcm9jZXNzIH0gPSBfc2VydmljZS52aWV3TW9kZWxcbiAgaWYgKGZvY3VzZWRQcm9jZXNzID09IG51bGwpIHtcbiAgICAvLyBJZiBub3QgY3VycmVudGx5IGRlYnVnZ2luZywgcmV0dXJuIGlmIGFueSBvZiB0aGUgZGVidWdnZXJzIHRoYXQgc3VwcG9ydFxuICAgIC8vIHRoZSBmaWxlIGV4dGVuc2lvbiB0aGlzIGJwIGlzIGluIHN1cHBvcnQgY29uZGl0aW9ucy5cbiAgICAvLyBUT0RPKGVyaWNibHVlKTogaGF2ZSBwcm92aWRlcnMgcmVnaXN0ZXIgdGhlaXIgZmlsZSBleHRlbnNpb25zIGFuZCBmaWx0ZXIgY29ycmVjdGx5IGhlcmUuXG4gICAgcmV0dXJuIHRydWVcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gQm9vbGVhbihmb2N1c2VkUHJvY2Vzcy5zZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c0NvbmRpdGlvbmFsQnJlYWtwb2ludHMpXG4gIH1cbn1cblxuZnVuY3Rpb24gX3N1cHBvcnRzVGVybWluYXRlVGhyZWFkc1JlcXVlc3QoKTogYm9vbGVhbiB7XG4gIC8vIElmIGN1cnJlbnRseSBkZWJ1Z2dpbmcsIHJldHVybiB3aGV0aGVyIG9yIG5vdCB0aGUgY3VycmVudCBkZWJ1Z2dlciBzdXBwb3J0c1xuICBjb25zdCB7IGZvY3VzZWRQcm9jZXNzIH0gPSBfc2VydmljZS52aWV3TW9kZWxcbiAgaWYgKGZvY3VzZWRQcm9jZXNzID09IG51bGwpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gQm9vbGVhbihmb2N1c2VkUHJvY2Vzcy5zZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c1Rlcm1pbmF0ZVRocmVhZHNSZXF1ZXN0KVxuICB9XG59XG5cbmZ1bmN0aW9uIF9zZXRQcm92aWRlcnNGb3JDb25uZWN0aW9uKGNvbm5lY3Rpb246IE51Y2xpZGVVcmkpOiB2b2lkIHtcbiAgY29uc3Qga2V5ID0gbnVjbGlkZVVyaS5pc1JlbW90ZShjb25uZWN0aW9uKSA/IG51Y2xpZGVVcmkuZ2V0SG9zdG5hbWUoY29ubmVjdGlvbikgOiBcImxvY2FsXCJcbiAgY29uc3QgYXZhaWxhYmxlUHJvdmlkZXJzID0gX3VpTW9kZWwuZ2V0TGF1bmNoQXR0YWNoUHJvdmlkZXJzRm9yQ29ubmVjdGlvbihjb25uZWN0aW9uKVxuICBfY29ubmVjdGlvblByb3ZpZGVycy5zZXQoa2V5LCBhdmFpbGFibGVQcm92aWRlcnMpXG59XG5cbmFzeW5jIGZ1bmN0aW9uIF9nZXRTdWdnZXN0aW9ucyhyZXF1ZXN0OiBhdG9tJEF1dG9jb21wbGV0ZVJlcXVlc3QpOiBQcm9taXNlPD9BcnJheTxhdG9tJEF1dG9jb21wbGV0ZVN1Z2dlc3Rpb24+PiB7XG4gIGxldCB0ZXh0ID0gcmVxdWVzdC5lZGl0b3IuZ2V0VGV4dCgpXG4gIGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdChcIlxcblwiKVxuICBjb25zdCB7IHJvdyB9ID0gcmVxdWVzdC5idWZmZXJQb3NpdGlvblxuICAvLyBPbmx5IGtlZXAgdGhlIGxpbmVzIHVwIHRvIGFuZCBpbmNsdWRpbmcgdGhlIGJ1ZmZlciBwb3NpdGlvbiByb3cuXG4gIHRleHQgPSBsaW5lcy5zbGljZSgwLCByb3cgKyAxKS5qb2luKFwiXFxuXCIpXG4gIGNvbnN0IHsgZm9jdXNlZFN0YWNrRnJhbWUsIGZvY3VzZWRQcm9jZXNzIH0gPSBfc2VydmljZS52aWV3TW9kZWxcbiAgaWYgKFxuICAgIGZvY3VzZWRQcm9jZXNzID09IG51bGwgfHxcbiAgICBmb2N1c2VkU3RhY2tGcmFtZSA9PSBudWxsIHx8XG4gICAgIUJvb2xlYW4oZm9jdXNlZFByb2Nlc3Muc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNDb21wbGV0aW9uc1JlcXVlc3QpXG4gICkge1xuICAgIHJldHVybiBbXVxuICB9IGVsc2Uge1xuICAgIGNvbnN0IGNvbXBsZXRpb25zID0gYXdhaXQgZm9jdXNlZFByb2Nlc3MuY29tcGxldGlvbnMoZm9jdXNlZFN0YWNrRnJhbWUuZnJhbWVJZCwgdGV4dCwgcmVxdWVzdC5idWZmZXJQb3NpdGlvbiwgMClcbiAgICByZXR1cm4gY29tcGxldGlvbnMubWFwKChpdGVtKSA9PiAoe1xuICAgICAgZGlzcGxheVRleHQ6IGl0ZW0ubGFiZWwsXG4gICAgICB0ZXh0OiBpdGVtLnRleHQgPT0gbnVsbCA/IGl0ZW0ubGFiZWwgOiBpdGVtLnRleHQsXG4gICAgICB0eXBlOiBpdGVtLnR5cGUsXG4gICAgfSkpXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNlcmlhbGl6ZSgpOiBTZXJpYWxpemVkU3RhdGUge1xuICBjb25zdCBtb2RlbCA9IF9zZXJ2aWNlLmdldE1vZGVsKClcbiAgY29uc3Qgc3RhdGUgPSB7XG4gICAgc291cmNlQnJlYWtwb2ludHM6IG1vZGVsLmdldEJyZWFrcG9pbnRzKCksXG4gICAgZnVuY3Rpb25CcmVha3BvaW50czogbW9kZWwuZ2V0RnVuY3Rpb25CcmVha3BvaW50cygpLFxuICAgIGV4Y2VwdGlvbkJyZWFrcG9pbnRzOiBtb2RlbC5nZXRFeGNlcHRpb25CcmVha3BvaW50cygpLFxuICAgIHdhdGNoRXhwcmVzc2lvbnM6IG1vZGVsLmdldFdhdGNoRXhwcmVzc2lvbnMoKS5tYXAoKGUpID0+IGUubmFtZSksXG4gICAgc2hvd0RlYnVnZ2VyOiBfbGF5b3V0TWFuYWdlci5pc0RlYnVnZ2VyVmlzaWJsZSgpLFxuICAgIHdvcmtzcGFjZURvY2tzVmlzaWJpbGl0eTogX2xheW91dE1hbmFnZXIuZ2V0V29ya3NwYWNlRG9ja3NWaXNpYmlsaXR5KCksXG4gIH1cbiAgcmV0dXJuIHN0YXRlXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWFjdGl2YXRlKCkge1xuICBfZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG59XG5cbmZ1bmN0aW9uIF9yZWdpc3RlckNvbW1hbmRzQ29udGV4dE1lbnVBbmRPcGVuZXIoKTogVW5pdmVyc2FsRGlzcG9zYWJsZSB7XG4gIGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZShcbiAgICBhdG9tLndvcmtzcGFjZS5hZGRPcGVuZXIoKHVyaSkgPT4ge1xuICAgICAgcmV0dXJuIF9sYXlvdXRNYW5hZ2VyLmdldE1vZGVsRm9yRGVidWdnZXJVcmkodXJpKVxuICAgIH0pLFxuICAgICgpID0+IHtcbiAgICAgIF9sYXlvdXRNYW5hZ2VyLmhpZGVEZWJ1Z2dlclZpZXdzKGZhbHNlKVxuICAgIH0sXG4gICAgYXRvbS5jb21tYW5kcy5hZGQoXCJhdG9tLXdvcmtzcGFjZVwiLCB7XG4gICAgICBcImRlYnVnZ2VyOnNob3dcIjogKGV2ZW50KSA9PiB7XG4gICAgICAgIGNvbnN0IGRldGFpbCA9IGV2ZW50LmRldGFpbFxuICAgICAgICBjb25zdCBzaG93ID0gZGV0YWlsID09IG51bGwgfHwgQm9vbGVhbihkZXRhaWwuc2hvd09ubHlJZkhpZGRlbikgPT09IGZhbHNlIHx8ICFfbGF5b3V0TWFuYWdlci5pc0RlYnVnZ2VyVmlzaWJsZSgpXG4gICAgICAgIGlmIChzaG93KSB7XG4gICAgICAgICAgX2xheW91dE1hbmFnZXIuc2hvd0RlYnVnZ2VyVmlld3MoKVxuICAgICAgICB9XG4gICAgICB9LFxuICAgIH0pLFxuICAgIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwge1xuICAgICAgXCJkZWJ1Z2dlcjpoaWRlXCI6ICgpID0+IHtcbiAgICAgICAgX2xheW91dE1hbmFnZXIuaGlkZURlYnVnZ2VyVmlld3MoZmFsc2UpXG4gICAgICAgIGZvciAoY29uc3QgcHJvY2VzcyBvZiBfc2VydmljZS5nZXRNb2RlbCgpLmdldFByb2Nlc3NlcygpKSB7XG4gICAgICAgICAgX3NlcnZpY2Uuc3RvcFByb2Nlc3MocHJvY2VzcylcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9KSxcbiAgICBhdG9tLmNvbW1hbmRzLmFkZChcImF0b20td29ya3NwYWNlXCIsIFwiZGVidWdnZXI6dG9nZ2xlXCIsICgpID0+IHtcbiAgICAgIGlmIChfbGF5b3V0TWFuYWdlci5pc0RlYnVnZ2VyVmlzaWJsZSgpID09PSB0cnVlKSB7XG4gICAgICAgIGF0b20uY29tbWFuZHMuZGlzcGF0Y2goYXRvbS52aWV3cy5nZXRWaWV3KGF0b20ud29ya3NwYWNlKSwgXCJkZWJ1Z2dlcjpoaWRlXCIpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhdG9tLmNvbW1hbmRzLmRpc3BhdGNoKGF0b20udmlld3MuZ2V0VmlldyhhdG9tLndvcmtzcGFjZSksIFwiZGVidWdnZXI6c2hvd1wiKVxuICAgICAgfVxuICAgIH0pLFxuICAgIF9zZXJ2aWNlLm9uRGlkQ2hhbmdlUHJvY2Vzc01vZGUoKCkgPT4gX2xheW91dE1hbmFnZXIuZGVidWdnZXJNb2RlQ2hhbmdlZCgpKSxcbiAgICBfc2VydmljZS52aWV3TW9kZWwub25EaWRDaGFuZ2VEZWJ1Z2dlckZvY3VzKCgpID0+IF9sYXlvdXRNYW5hZ2VyLmRlYnVnZ2VyTW9kZUNoYW5nZWQoKSksXG4gICAgYXRvbS5jb21tYW5kcy5hZGQoXCJhdG9tLXdvcmtzcGFjZVwiLCB7XG4gICAgICBcImRlYnVnZ2VyOnJlc2V0LWxheW91dFwiOiAoKSA9PiB7XG4gICAgICAgIF9sYXlvdXRNYW5hZ2VyLnJlc2V0TGF5b3V0KClcbiAgICAgIH0sXG4gICAgfSksXG4gICAgYXRvbS5jb250ZXh0TWVudS5hZGQoe1xuICAgICAgXCIuZGVidWdnZXItY29udGFpbmVyXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIGxhYmVsOiBcIkRlYnVnZ2VyIFZpZXdzXCIsXG4gICAgICAgICAgc3VibWVudTogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBsYWJlbDogXCJSZXNldCBMYXlvdXRcIixcbiAgICAgICAgICAgICAgY29tbWFuZDogXCJkZWJ1Z2dlcjpyZXNldC1sYXlvdXRcIixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSlcbiAgKVxuICByZXR1cm4gZGlzcG9zYWJsZVxufVxuXG5mdW5jdGlvbiBfaXNSZWFkT25seVRhcmdldCgpOiBib29sZWFuIHtcbiAgY29uc3QgeyBmb2N1c2VkUHJvY2VzcyB9ID0gX3NlcnZpY2Uudmlld01vZGVsXG4gIHJldHVybiBmb2N1c2VkUHJvY2VzcyAhPSBudWxsICYmIEJvb2xlYW4oZm9jdXNlZFByb2Nlc3MuY29uZmlndXJhdGlvbi5pc1JlYWRPbmx5KVxufVxuXG5mdW5jdGlvbiBfY29udGludWUoKSB7XG4gIGlmIChfaXNSZWFkT25seVRhcmdldCgpKSB7XG4gICAgcmV0dXJuXG4gIH1cbiAgY29uc3QgeyBmb2N1c2VkVGhyZWFkIH0gPSBfc2VydmljZS52aWV3TW9kZWxcbiAgaWYgKGZvY3VzZWRUaHJlYWQgIT0gbnVsbCkge1xuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9TVEVQX0NPTlRJTlVFKVxuICAgIGZvY3VzZWRUaHJlYWQuY29udGludWUoKVxuICB9XG59XG5cbmZ1bmN0aW9uIF9zdG9wKCkge1xuICBjb25zdCB7IGZvY3VzZWRQcm9jZXNzIH0gPSBfc2VydmljZS52aWV3TW9kZWxcbiAgaWYgKGZvY3VzZWRQcm9jZXNzKSB7XG4gICAgX3NlcnZpY2Uuc3RvcFByb2Nlc3MoZm9jdXNlZFByb2Nlc3MpXG4gIH1cbn1cblxuZnVuY3Rpb24gX3Jlc3RhcnQoKSB7XG4gIGlmIChfaXNSZWFkT25seVRhcmdldCgpKSB7XG4gICAgcmV0dXJuXG4gIH1cbiAgY29uc3QgeyBmb2N1c2VkUHJvY2VzcyB9ID0gX3NlcnZpY2Uudmlld01vZGVsXG4gIGlmIChmb2N1c2VkUHJvY2Vzcykge1xuICAgIF9zZXJ2aWNlLnJlc3RhcnRQcm9jZXNzKGZvY3VzZWRQcm9jZXNzKVxuICB9XG59XG5cbmZ1bmN0aW9uIF9zdGVwT3ZlcigpIHtcbiAgaWYgKF9pc1JlYWRPbmx5VGFyZ2V0KCkpIHtcbiAgICByZXR1cm5cbiAgfVxuICBjb25zdCB7IGZvY3VzZWRUaHJlYWQgfSA9IF9zZXJ2aWNlLnZpZXdNb2RlbFxuICBpZiAoZm9jdXNlZFRocmVhZCAhPSBudWxsKSB7XG4gICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX1NURVBfT1ZFUilcbiAgICBmb2N1c2VkVGhyZWFkLm5leHQoKVxuICB9XG59XG5cbmZ1bmN0aW9uIF9zdGVwSW50bygpIHtcbiAgaWYgKF9pc1JlYWRPbmx5VGFyZ2V0KCkpIHtcbiAgICByZXR1cm5cbiAgfVxuICBjb25zdCB7IGZvY3VzZWRUaHJlYWQgfSA9IF9zZXJ2aWNlLnZpZXdNb2RlbFxuICBpZiAoZm9jdXNlZFRocmVhZCAhPSBudWxsKSB7XG4gICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX1NURVBfSU5UTylcbiAgICBmb2N1c2VkVGhyZWFkLnN0ZXBJbigpXG4gIH1cbn1cblxuZnVuY3Rpb24gX3N0ZXBPdXQoKSB7XG4gIGlmIChfaXNSZWFkT25seVRhcmdldCgpKSB7XG4gICAgcmV0dXJuXG4gIH1cbiAgY29uc3QgeyBmb2N1c2VkVGhyZWFkIH0gPSBfc2VydmljZS52aWV3TW9kZWxcbiAgaWYgKGZvY3VzZWRUaHJlYWQgIT0gbnVsbCkge1xuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9TVEVQX09VVClcbiAgICBmb2N1c2VkVGhyZWFkLnN0ZXBPdXQoKVxuICB9XG59XG5cbmZ1bmN0aW9uIF9hZGRCcmVha3BvaW50KGV2ZW50OiBhbnkpIHtcbiAgcmV0dXJuIF9leGVjdXRlV2l0aEVkaXRvclBhdGgoZXZlbnQsIChmaWxlUGF0aCwgbGluZU51bWJlcikgPT4ge1xuICAgIF9zZXJ2aWNlLmFkZFNvdXJjZUJyZWFrcG9pbnQoZmlsZVBhdGgsIGxpbmVOdW1iZXIpXG4gIH0pXG59XG5cbmZ1bmN0aW9uIF90b2dnbGVCcmVha3BvaW50KGV2ZW50OiBhbnkpIHtcbiAgcmV0dXJuIF9leGVjdXRlV2l0aEVkaXRvclBhdGgoZXZlbnQsIChmaWxlUGF0aCwgbGluZU51bWJlcikgPT4ge1xuICAgIF9zZXJ2aWNlLnRvZ2dsZVNvdXJjZUJyZWFrcG9pbnQoZmlsZVBhdGgsIGxpbmVOdW1iZXIpXG4gIH0pXG59XG5cbmZ1bmN0aW9uIF90b2dnbGVCcmVha3BvaW50RW5hYmxlZChldmVudDogYW55KSB7XG4gIF9leGVjdXRlV2l0aEVkaXRvclBhdGgoZXZlbnQsIChmaWxlUGF0aCwgbGluZSkgPT4ge1xuICAgIGNvbnN0IGJwID0gX3NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50QXRMaW5lKGZpbGVQYXRoLCBsaW5lKVxuXG4gICAgaWYgKGJwICE9IG51bGwpIHtcbiAgICAgIF9zZXJ2aWNlLmVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzKCFicC5lbmFibGVkLCBicClcbiAgICB9XG4gIH0pXG59XG5cbmZ1bmN0aW9uIF9nZXRCcmVha3BvaW50RnJvbUV2ZW50KGV2ZW50OiBhbnkpOiA/SUJyZWFrcG9pbnQge1xuICBjb25zdCB0YXJnZXQ6IEhUTUxFbGVtZW50ID0gZXZlbnQudGFyZ2V0XG4gIGxldCBicCA9IG51bGxcbiAgaWYgKHRhcmdldCAhPSBudWxsICYmIHRhcmdldC5kYXRhc2V0ICE9IG51bGwpIHtcbiAgICBpZiAodGFyZ2V0LmRhdGFzZXQuYnBJZCAhPSBudWxsKSB7XG4gICAgICBjb25zdCBicElkID0gdGFyZ2V0LmRhdGFzZXQuYnBJZFxuICAgICAgYnAgPSBfc2VydmljZS5nZXRNb2RlbCgpLmdldEJyZWFrcG9pbnRCeUlkKGJwSWQpXG4gICAgfVxuXG4gICAgaWYgKGJwID09IG51bGwpIHtcbiAgICAgIGNvbnN0IHBhdGggPSB0YXJnZXQuZGF0YXNldC5wYXRoXG4gICAgICBjb25zdCBsaW5lID0gcGFyc2VJbnQodGFyZ2V0LmRhdGFzZXQubGluZSwgMTApXG4gICAgICBpZiAocGF0aCAhPSBudWxsICYmIGxpbmUgIT0gbnVsbCkge1xuICAgICAgICBicCA9IF9zZXJ2aWNlLmdldE1vZGVsKCkuZ2V0QnJlYWtwb2ludEF0TGluZShwYXRoLCBsaW5lKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBicFxufVxuXG5mdW5jdGlvbiBfY29uZmlndXJlQnJlYWtwb2ludChldmVudDogYW55KSB7XG4gIGNvbnN0IGJwID0gX2dldEJyZWFrcG9pbnRGcm9tRXZlbnQoZXZlbnQpXG4gIGlmIChicCAhPSBudWxsICYmIF9zdXBwb3J0c0NvbmRpdGlvbmFsQnJlYWtwb2ludHMoKSkge1xuICAgIC8vIE9wZW4gdGhlIGNvbmZpZ3VyYXRpb24gZGlhbG9nLlxuICAgIGNvbnN0IGNvbnRhaW5lciA9IG5ldyBSZWFjdE1vdW50Um9vdEVsZW1lbnQoKVxuICAgIFJlYWN0RE9NLnJlbmRlcihcbiAgICAgIDxCcmVha3BvaW50Q29uZmlnQ29tcG9uZW50XG4gICAgICAgIGJyZWFrcG9pbnQ9e2JwfVxuICAgICAgICBzZXJ2aWNlPXtfc2VydmljZX1cbiAgICAgICAgb25EaXNtaXNzPXsoKSA9PiB7XG4gICAgICAgICAgUmVhY3RET00udW5tb3VudENvbXBvbmVudEF0Tm9kZShjb250YWluZXIpXG4gICAgICAgIH19XG4gICAgICAgIGFsbG93TG9nTWVzc2FnZT17cGFzc2VzR0soXCJudWNsaWRlX2RlYnVnZ2VyX2xvZ2dpbmdfYnJlYWtwb2ludHNcIil9XG4gICAgICAvPixcbiAgICAgIGNvbnRhaW5lclxuICAgIClcbiAgfVxufVxuXG5mdW5jdGlvbiBfdGVybWluYXRlVGhyZWFkKGV2ZW50OiBhbnkpIHtcbiAgaWYgKF9pc1JlYWRPbmx5VGFyZ2V0KCkpIHtcbiAgICByZXR1cm5cbiAgfVxuICBjb25zdCB0YXJnZXQ6IEhUTUxFbGVtZW50ID0gZXZlbnQudGFyZ2V0XG4gIGlmICh0YXJnZXQuZGF0YXNldC50aHJlYWRpZCkge1xuICAgIGNvbnN0IHRocmVhZElkID0gcGFyc2VJbnQodGFyZ2V0LmRhdGFzZXQudGhyZWFkaWQsIDEwKVxuICAgIGlmICghTnVtYmVyLmlzTmFOKHRocmVhZElkKSAmJiBfc3VwcG9ydHNUZXJtaW5hdGVUaHJlYWRzUmVxdWVzdCgpKSB7XG4gICAgICBfc2VydmljZS50ZXJtaW5hdGVUaHJlYWRzKFt0aHJlYWRJZF0pXG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIF9leGVjdXRlV2l0aEVkaXRvclBhdGg8VD4oZXZlbnQ6IGFueSwgZm46IChmaWxlUGF0aDogc3RyaW5nLCBsaW5lOiBudW1iZXIpID0+IFQpOiA/VCB7XG4gIGNvbnN0IGVkaXRvciA9IGF0b20ud29ya3NwYWNlLmdldEFjdGl2ZVRleHRFZGl0b3IoKVxuICBpZiAoIWVkaXRvciB8fCAhZWRpdG9yLmdldFBhdGgoKSkge1xuICAgIHJldHVybiBudWxsXG4gIH1cblxuICBjb25zdCBsaW5lID0gZ2V0TGluZUZvckV2ZW50KGVkaXRvciwgZXZlbnQpICsgMVxuICByZXR1cm4gZm4obnVsbHRocm93cyhlZGl0b3IuZ2V0UGF0aCgpKSwgbGluZSlcbn1cblxuZnVuY3Rpb24gX2RlbGV0ZUJyZWFrcG9pbnQoZXZlbnQ6IGFueSk6IHZvaWQge1xuICBjb25zdCBicmVha3BvaW50ID0gX2dldEJyZWFrcG9pbnRGcm9tRXZlbnQoZXZlbnQpXG4gIGlmIChicmVha3BvaW50ICE9IG51bGwpIHtcbiAgICBfc2VydmljZS5yZW1vdmVCcmVha3BvaW50cyhicmVha3BvaW50LmdldElkKCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gX2RlbGV0ZUFsbEJyZWFrcG9pbnRzKCk6IHZvaWQge1xuICBfc2VydmljZS5yZW1vdmVCcmVha3BvaW50cygpXG59XG5cbmZ1bmN0aW9uIF9lbmFibGVBbGxCcmVha3BvaW50cygpOiB2b2lkIHtcbiAgX3NlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHModHJ1ZSlcbn1cblxuZnVuY3Rpb24gX2Rpc2FibGVBbGxCcmVha3BvaW50cygpOiB2b2lkIHtcbiAgX3NlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoZmFsc2UpXG59XG5cbmZ1bmN0aW9uIF9yZW5kZXJDb25maWdEaWFsb2cocGFuZWw6IGF0b20kUGFuZWwsIGFyZ3M6IExhdW5jaEF0dGFjaERpYWxvZ0FyZ3MsIGRpYWxvZ0Nsb3NlcjogKCkgPT4gdm9pZCk6IHZvaWQge1xuICBpZiAoX3NlbGVjdGVkRGVidWdDb25uZWN0aW9uID09IG51bGwpIHtcbiAgICAvLyBJZiBubyBjb25uZWN0aW9uIGlzIHNlbGVjdGVkIHlldCwgZGVmYXVsdCB0byB0aGUgbG9jYWwgY29ubmVjdGlvbi5cbiAgICBfc2VsZWN0ZWREZWJ1Z0Nvbm5lY3Rpb24gPSBcImxvY2FsXCJcbiAgfVxuXG4gIGludmFyaWFudChfc2VsZWN0ZWREZWJ1Z0Nvbm5lY3Rpb24gIT0gbnVsbClcblxuICBjb25zdCBvcHRpb25zID0gX3VpTW9kZWxcbiAgICAuZ2V0Q29ubmVjdGlvbnMoKVxuICAgIC5tYXAoKGNvbm5lY3Rpb24pID0+IHtcbiAgICAgIGNvbnN0IGRpc3BsYXlOYW1lID0gbnVjbGlkZVVyaS5pc1JlbW90ZShjb25uZWN0aW9uKSA/IG51Y2xpZGVVcmkuZ2V0SG9zdG5hbWUoY29ubmVjdGlvbikgOiBcImxvY2FsaG9zdFwiXG4gICAgICByZXR1cm4ge1xuICAgICAgICB2YWx1ZTogY29ubmVjdGlvbixcbiAgICAgICAgbGFiZWw6IGRpc3BsYXlOYW1lLFxuICAgICAgfVxuICAgIH0pXG4gICAgLmZpbHRlcigoaXRlbSkgPT4gaXRlbS52YWx1ZSAhPSBudWxsICYmIGl0ZW0udmFsdWUgIT09IFwiXCIpXG4gICAgLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSlcblxuICAvLyBmbG93bGludC1uZXh0LWxpbmUgc2tldGNoeS1udWxsLXN0cmluZzpvZmZcbiAgY29uc3QgY29ubmVjdGlvbiA9IF9zZWxlY3RlZERlYnVnQ29ubmVjdGlvbiB8fCBcImxvY2FsXCJcblxuICBSZWFjdERPTS5yZW5kZXIoXG4gICAgPERlYnVnZ2VyTGF1bmNoQXR0YWNoVUlcbiAgICAgIGRpYWxvZ01vZGU9e2FyZ3MuZGlhbG9nTW9kZX1cbiAgICAgIGluaXRpYWxTZWxlY3RlZFRhYk5hbWU9e2FyZ3Muc2VsZWN0ZWRUYWJOYW1lfVxuICAgICAgaW5pdGlhbFByb3ZpZGVyQ29uZmlnPXthcmdzLmNvbmZpZ31cbiAgICAgIGNvbm5lY3Rpb25DaGFuZ2VkPXsobmV3VmFsdWU6ID9zdHJpbmcpID0+IHtcbiAgICAgICAgX3NlbGVjdGVkRGVidWdDb25uZWN0aW9uID0gbmV3VmFsdWVcbiAgICAgICAgX3JlbmRlckNvbmZpZ0RpYWxvZyhwYW5lbCwgeyBkaWFsb2dNb2RlOiBhcmdzLmRpYWxvZ01vZGUgfSwgZGlhbG9nQ2xvc2VyKVxuICAgICAgfX1cbiAgICAgIGNvbm5lY3Rpb249e2Nvbm5lY3Rpb259XG4gICAgICBjb25uZWN0aW9uT3B0aW9ucz17b3B0aW9uc31cbiAgICAgIGRpYWxvZ0Nsb3Nlcj17ZGlhbG9nQ2xvc2VyfVxuICAgICAgcHJvdmlkZXJzPXtfY29ubmVjdGlvblByb3ZpZGVyc31cbiAgICAvPixcbiAgICBwYW5lbC5nZXRJdGVtKClcbiAgKVxufVxuXG5mdW5jdGlvbiBfc2hvd0xhdW5jaEF0dGFjaERpYWxvZyhhcmdzOiBMYXVuY2hBdHRhY2hEaWFsb2dBcmdzKTogdm9pZCB7XG4gIGNvbnN0IHsgZGlhbG9nTW9kZSB9ID0gYXJnc1xuICBpZiAoX3Zpc2libGVMYXVuY2hBdHRhY2hEaWFsb2dNb2RlICE9IG51bGwgJiYgX3Zpc2libGVMYXVuY2hBdHRhY2hEaWFsb2dNb2RlICE9PSBkaWFsb2dNb2RlKSB7XG4gICAgLy8gSWYgdGhlIGRpYWxvZyBpcyBhbHJlYWR5IHZpc2libGUsIGJ1dCBpc24ndCB0aGUgY29ycmVjdCBtb2RlLCBjbG9zZSBpdCBiZWZvcmVcbiAgICAvLyByZS1vcGVuaW5nIHRoZSBjb3JyZWN0IG1vZGUuXG4gICAgaW52YXJpYW50KF9sYXVjaEF0dGFjaERpYWxvZ0Nsb3NlciAhPSBudWxsKVxuICAgIF9sYXVjaEF0dGFjaERpYWxvZ0Nsb3NlcigpXG4gIH1cblxuICBjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKClcbiAgY29uc3QgaG9zdEVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKVxuICBjb25zdCBwYW5lID0gYXRvbS53b3Jrc3BhY2UuYWRkTW9kYWxQYW5lbCh7XG4gICAgaXRlbTogaG9zdEVsLFxuICAgIGNsYXNzTmFtZTogXCJkZWJ1Z2dlci1jb25maWctZGlhbG9nXCIsXG4gIH0pXG5cbiAgY29uc3QgcGFyZW50RWw6IEhUTUxFbGVtZW50ID0gKGhvc3RFbC5wYXJlbnRFbGVtZW50OiBhbnkpXG4gIHBhcmVudEVsLnN0eWxlLm1heFdpZHRoID0gXCIxMDBlbVwiXG5cbiAgLy8gRnVuY3Rpb24gY2FsbGJhY2sgdGhhdCBjbG9zZXMgdGhlIGRpYWxvZyBhbmQgZnJlZXMgYWxsIG9mIGl0cyByZXNvdXJjZXMuXG4gIF9yZW5kZXJDb25maWdEaWFsb2cocGFuZSwgYXJncywgKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKVxuICBfbGF1Y2hBdHRhY2hEaWFsb2dDbG9zZXIgPSAoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgZGlzcG9zYWJsZXMuYWRkKFxuICAgIHBhbmUub25EaWRDaGFuZ2VWaXNpYmxlKCh2aXNpYmxlKSA9PiB7XG4gICAgICBpZiAoIXZpc2libGUpIHtcbiAgICAgICAgZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gICAgICB9XG4gICAgfSlcbiAgKVxuICBkaXNwb3NhYmxlcy5hZGQoKCkgPT4ge1xuICAgIF9kaXNwb3NhYmxlcy5yZW1vdmUoZGlzcG9zYWJsZXMpXG4gICAgX3Zpc2libGVMYXVuY2hBdHRhY2hEaWFsb2dNb2RlID0gbnVsbFxuICAgIF9sYXVjaEF0dGFjaERpYWxvZ0Nsb3NlciA9IG51bGxcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfVE9HR0xFX0FUVEFDSF9ESUFMT0csIHtcbiAgICAgIHZpc2libGU6IGZhbHNlLFxuICAgICAgZGlhbG9nTW9kZSxcbiAgICB9KVxuICAgIFJlYWN0RE9NLnVubW91bnRDb21wb25lbnRBdE5vZGUoaG9zdEVsKVxuICAgIHBhbmUuZGVzdHJveSgpXG4gIH0pXG5cbiAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX1RPR0dMRV9BVFRBQ0hfRElBTE9HLCB7XG4gICAgdmlzaWJsZTogdHJ1ZSxcbiAgICBkaWFsb2dNb2RlLFxuICB9KVxuICBfdmlzaWJsZUxhdW5jaEF0dGFjaERpYWxvZ01vZGUgPSBkaWFsb2dNb2RlXG4gIF9kaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZXMpXG59XG5cbmZ1bmN0aW9uIF9hZGRUb1dhdGNoKCkge1xuICBjb25zdCBlZGl0b3IgPSBhdG9tLndvcmtzcGFjZS5nZXRBY3RpdmVUZXh0RWRpdG9yKClcbiAgaWYgKCFlZGl0b3IpIHtcbiAgICByZXR1cm5cbiAgfVxuICBjb25zdCBzZWxlY3RlZFRleHQgPSBlZGl0b3IuZ2V0VGV4dEluQnVmZmVyUmFuZ2UodHJpbVJhbmdlKGVkaXRvciwgZWRpdG9yLmdldFNlbGVjdGVkQnVmZmVyUmFuZ2UoKSkpXG4gIGNvbnN0IGV4cHIgPSB3b3JkQXRQb3NpdGlvbihlZGl0b3IsIGVkaXRvci5nZXRDdXJzb3JCdWZmZXJQb3NpdGlvbigpKVxuXG4gIGNvbnN0IHdhdGNoRXhwcmVzc2lvbiA9IHNlbGVjdGVkVGV4dCB8fCAoZXhwciAmJiBleHByLndvcmRNYXRjaFswXSlcbiAgaWYgKHdhdGNoRXhwcmVzc2lvbiAhPSBudWxsICYmIHdhdGNoRXhwcmVzc2lvbi5sZW5ndGggPiAwKSB7XG4gICAgX3NlcnZpY2UuYWRkV2F0Y2hFeHByZXNzaW9uKHdhdGNoRXhwcmVzc2lvbilcbiAgfVxufVxuXG5mdW5jdGlvbiBfcnVuVG9Mb2NhdGlvbihldmVudCkge1xuICBpZiAoX2lzUmVhZE9ubHlUYXJnZXQoKSkge1xuICAgIHJldHVyblxuICB9XG4gIF9leGVjdXRlV2l0aEVkaXRvclBhdGgoZXZlbnQsIChwYXRoLCBsaW5lKSA9PiB7XG4gICAgX3NlcnZpY2UucnVuVG9Mb2NhdGlvbihwYXRoLCBsaW5lKVxuICB9KVxufVxuXG5mdW5jdGlvbiBfY29weURlYnVnZ2VyRXhwcmVzc2lvblZhbHVlKGV2ZW50OiBFdmVudCkge1xuICBjb25zdCBzZWxlY3Rpb24gPSB3aW5kb3cuZ2V0U2VsZWN0aW9uKClcbiAgY29uc3QgY2xpY2tlZEVsZW1lbnQ6IEhUTUxFbGVtZW50ID0gKGV2ZW50LnRhcmdldDogYW55KVxuICBjb25zdCB0YXJnZXRDbGFzcyA9IFwiLm51Y2xpZGUtdWktZXhwcmVzc2lvbi10cmVlLXZhbHVlXCJcbiAgY29uc3QgY29weUVsZW1lbnQgPSBjbGlja2VkRWxlbWVudC5jbG9zZXN0KHRhcmdldENsYXNzKVxuXG4gIGlmIChjb3B5RWxlbWVudCAhPSBudWxsKSB7XG4gICAgLy8gSWYgdGhlIHVzZXIgaGFzIHRleHQgaW4gdGhlIHRhcmdldCBub2RlIHNlbGVjdGVkLCBjb3B5IG9ubHkgdGhlIHNlbGVjdGlvblxuICAgIC8vIGluc3RlYWQgb2YgdGhlIGVudGlyZSBub2RlIHZhbHVlLlxuICAgIGlmIChcbiAgICAgIHNlbGVjdGlvbiAhPSBudWxsICYmXG4gICAgICBzZWxlY3Rpb24udG9TdHJpbmcoKSAhPT0gXCJcIiAmJlxuICAgICAgKGNvcHlFbGVtZW50LmNvbnRhaW5zKHNlbGVjdGlvbj8uYW5jaG9yTm9kZT8ucGFyZW50RWxlbWVudCkgfHxcbiAgICAgICAgY29weUVsZW1lbnQgPT09IHNlbGVjdGlvbj8uYW5jaG9yTm9kZT8ucGFyZW50RWxlbWVudClcbiAgICApIHtcbiAgICAgIGF0b20uY2xpcGJvYXJkLndyaXRlKHNlbGVjdGlvbi50b1N0cmluZygpKVxuICAgIH0gZWxzZSB7XG4gICAgICBhdG9tLmNsaXBib2FyZC53cml0ZShjb3B5RWxlbWVudC50ZXh0Q29udGVudClcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gX2NvcHlEZWJ1Z2dlckNhbGxzdGFjayhldmVudDogRXZlbnQpIHtcbiAgY29uc3QgeyBmb2N1c2VkVGhyZWFkIH0gPSBfc2VydmljZS52aWV3TW9kZWxcbiAgaWYgKGZvY3VzZWRUaHJlYWQgIT0gbnVsbCkge1xuICAgIGxldCBjYWxsc3RhY2tUZXh0ID0gXCJcIlxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBudWNsaWRlLWludGVybmFsL3VudXNlZC1zdWJzY3JpcHRpb25cbiAgICBmb2N1c2VkVGhyZWFkXG4gICAgICAuZ2V0RnVsbENhbGxTdGFjaygpXG4gICAgICAuZmlsdGVyKChleHBlY3RlZFN0YWNrKSA9PiAhZXhwZWN0ZWRTdGFjay5pc1BlbmRpbmcpXG4gICAgICAudGFrZSgxKVxuICAgICAgLnN1YnNjcmliZSgoZXhwZWN0ZWRTdGFjaykgPT4ge1xuICAgICAgICBleHBlY3RlZFN0YWNrLmdldE9yRGVmYXVsdChbXSkuZm9yRWFjaCgoaXRlbSwgaSkgPT4ge1xuICAgICAgICAgIGNvbnN0IHBhdGggPSBudWNsaWRlVXJpLmJhc2VuYW1lKGl0ZW0uc291cmNlLnVyaSlcbiAgICAgICAgICBjYWxsc3RhY2tUZXh0ICs9IGAke2l9XFx0JHtpdGVtLm5hbWV9XFx0JHtwYXRofToke2l0ZW0ucmFuZ2Uuc3RhcnQucm93fSR7b3MuRU9MfWBcbiAgICAgICAgfSlcbiAgICAgICAgYXRvbS5jbGlwYm9hcmQud3JpdGUoY2FsbHN0YWNrVGV4dC50cmltKCkpXG4gICAgICB9KVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb25zdW1lQ3VycmVudFdvcmtpbmdEaXJlY3RvcnkoY3dkQXBpOiBudWNsaWRlJEN3ZEFwaSk6IElEaXNwb3NhYmxlIHtcbiAgY29uc3QgdXBkYXRlU2VsZWN0ZWRDb25uZWN0aW9uID0gKGRpcmVjdG9yeSkgPT4ge1xuICAgIF9zZWxlY3RlZERlYnVnQ29ubmVjdGlvbiA9IGRpcmVjdG9yeVxuICAgIGlmIChfc2VsZWN0ZWREZWJ1Z0Nvbm5lY3Rpb24gIT0gbnVsbCkge1xuICAgICAgY29uc3QgY29ubiA9IF9zZWxlY3RlZERlYnVnQ29ubmVjdGlvblxuICAgICAgaWYgKG51Y2xpZGVVcmkuaXNSZW1vdGUoY29ubikpIHtcbiAgICAgICAgLy8gVXNlIHJvb3QgaW5zdGVhZCBvZiBjdXJyZW50IGRpcmVjdG9yeSBhcyBsYXVuY2ggcG9pbnQgZm9yIGRlYnVnZ2VyLlxuICAgICAgICBfc2VsZWN0ZWREZWJ1Z0Nvbm5lY3Rpb24gPSBudWNsaWRlVXJpLmNyZWF0ZVJlbW90ZVVyaShudWNsaWRlVXJpLmdldEhvc3RuYW1lKGNvbm4pLCBcIi9cIilcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFVzZSBudWxsIGluc3RlYWQgb2YgbG9jYWwgcGF0aCB0byB1c2UgbG9jYWwgZGVidWdnZXIgZG93bnN0cmVhbS5cbiAgICAgICAgX3NlbGVjdGVkRGVidWdDb25uZWN0aW9uID0gbnVsbFxuICAgICAgfVxuICAgIH1cbiAgfVxuICBjb25zdCBkaXNwb3NhYmxlID0gY3dkQXBpLm9ic2VydmVDd2QodXBkYXRlU2VsZWN0ZWRDb25uZWN0aW9uKVxuICBfZGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGUpXG4gIHJldHVybiBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSgoKSA9PiB7XG4gICAgZGlzcG9zYWJsZS5kaXNwb3NlKClcbiAgICBfZGlzcG9zYWJsZXMucmVtb3ZlKGRpc3Bvc2FibGUpXG4gIH0pXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBdXRvY29tcGxldGVQcm92aWRlcigpOiBhdG9tJEF1dG9jb21wbGV0ZVByb3ZpZGVyIHtcbiAgcmV0dXJuIHtcbiAgICBsYWJlbHM6IFtcIm51Y2xpZGUtY29uc29sZVwiXSxcbiAgICBzZWxlY3RvcjogXCIqXCIsXG4gICAgZmlsdGVyU3VnZ2VzdGlvbnM6IHRydWUsXG4gICAgZ2V0U3VnZ2VzdGlvbnM6IF9nZXRTdWdnZXN0aW9ucy5iaW5kKHRoaXMpLFxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb25zdW1lQ29uc29sZShjcmVhdGVDb25zb2xlOiBDb25zb2xlU2VydmljZSk6IElEaXNwb3NhYmxlIHtcbiAgcmV0dXJuIHNldENvbnNvbGVTZXJ2aWNlKGNyZWF0ZUNvbnNvbGUpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb25zdW1lVGVybWluYWwodGVybWluYWxBcGk6IFRlcm1pbmFsQXBpKTogSURpc3Bvc2FibGUge1xuICByZXR1cm4gc2V0VGVybWluYWxTZXJ2aWNlKHRlcm1pbmFsQXBpKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY29uc3VtZVJwY1NlcnZpY2UocnBjU2VydmljZTogbnVjbGlkZSRScGNTZXJ2aWNlKTogSURpc3Bvc2FibGUge1xuICByZXR1cm4gc2V0UnBjU2VydmljZShycGNTZXJ2aWNlKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY29uc3VtZVJlZ2lzdGVyRXhlY3V0b3IocmVnaXN0ZXJFeGVjdXRvcjogUmVnaXN0ZXJFeGVjdXRvckZ1bmN0aW9uKTogSURpc3Bvc2FibGUge1xuICByZXR1cm4gc2V0Q29uc29sZVJlZ2lzdGVyRXhlY3V0b3IocmVnaXN0ZXJFeGVjdXRvcilcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbnN1bWVEZWJ1Z2dlclByb3ZpZGVyKHByb3ZpZGVyOiBOdWNsaWRlRGVidWdnZXJQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcbiAgX3VpTW9kZWwuYWRkRGVidWdnZXJQcm92aWRlcihwcm92aWRlcilcbiAgcmV0dXJuIG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKCgpID0+IHtcbiAgICBfdWlNb2RlbC5yZW1vdmVEZWJ1Z2dlclByb3ZpZGVyKHByb3ZpZGVyKVxuICB9KVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY29uc3VtZURlYnVnZ2VyQ29uZmlndXJhdGlvblByb3ZpZGVycyhwcm92aWRlcnM6IEFycmF5PERlYnVnZ2VyQ29uZmlndXJhdGlvblByb3ZpZGVyPik6IElEaXNwb3NhYmxlIHtcbiAgaW52YXJpYW50KEFycmF5LmlzQXJyYXkocHJvdmlkZXJzKSlcbiAgY29uc3QgZGlzcG9zYWJsZSA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKClcbiAgcHJvdmlkZXJzLmZvckVhY2goKHByb3ZpZGVyKSA9PiBkaXNwb3NhYmxlLmFkZChhZGREZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcihwcm92aWRlcikpKVxuICByZXR1cm4gZGlzcG9zYWJsZVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY29uc3VtZVRvb2xCYXIoZ2V0VG9vbEJhcjogdG9vbGJhciRHZXRUb29sYmFyKTogSURpc3Bvc2FibGUge1xuICBjb25zdCB0b29sQmFyID0gZ2V0VG9vbEJhcihcImRlYnVnZ2VyXCIpXG4gIHRvb2xCYXIuYWRkQnV0dG9uKHtcbiAgICBpY29uc2V0OiBcImljb24tbnVjbGljb25cIixcbiAgICBpY29uOiBcImRlYnVnZ2VyXCIsXG4gICAgY2FsbGJhY2s6IFwiZGVidWdnZXI6c2hvdy1hdHRhY2gtZGlhbG9nXCIsXG4gICAgdG9vbHRpcDogXCJBdHRhY2ggRGVidWdnZXJcIixcbiAgICBwcmlvcml0eTogNTAwLFxuICB9KS5lbGVtZW50XG4gIGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSgoKSA9PiB7XG4gICAgdG9vbEJhci5yZW1vdmVJdGVtcygpXG4gIH0pXG4gIF9kaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZSlcbiAgcmV0dXJuIGRpc3Bvc2FibGVcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbnN1bWVOb3RpZmljYXRpb25zKFxuICByYWlzZU5hdGl2ZU5vdGlmaWNhdGlvbjogKHRpdGxlOiBzdHJpbmcsIGJvZHk6IHN0cmluZywgdGltZW91dDogbnVtYmVyLCByYWlzZUlmQXRvbUhhc0ZvY3VzOiBib29sZWFuKSA9PiA/SURpc3Bvc2FibGVcbik6IHZvaWQge1xuICBzZXROb3RpZmljYXRpb25TZXJ2aWNlKHJhaXNlTmF0aXZlTm90aWZpY2F0aW9uKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcHJvdmlkZVJlbW90ZUNvbnRyb2xTZXJ2aWNlKCk6IFJlbW90ZUNvbnRyb2xTZXJ2aWNlIHtcbiAgcmV0dXJuIG5ldyBSZW1vdGVDb250cm9sU2VydmljZShfc2VydmljZSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbnN1bWVEYXRhdGlwU2VydmljZShzZXJ2aWNlOiBEYXRhdGlwU2VydmljZSk6IElEaXNwb3NhYmxlIHtcbiAgY29uc3QgZGlzcG9zYWJsZSA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKHNlcnZpY2UuYWRkUHJvdmlkZXIoX2NyZWF0ZURhdGF0aXBQcm92aWRlcigpKSwgc2V0RGF0YXRpcFNlcnZpY2Uoc2VydmljZSkpXG4gIF9kaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZSlcbiAgcmV0dXJuIGRpc3Bvc2FibGVcbn1cblxuZnVuY3Rpb24gX2NyZWF0ZURhdGF0aXBQcm92aWRlcigpOiBEYXRhdGlwUHJvdmlkZXIge1xuICByZXR1cm4ge1xuICAgIC8vIEVsaWdpYmlsaXR5IGlzIGRldGVybWluZWQgb25saW5lLCBiYXNlZCBvbiByZWdpc3RlcmVkIEV2YWx1YXRpb25FeHByZXNzaW9uIHByb3ZpZGVycy5cbiAgICBwcm92aWRlck5hbWU6IERBVEFUSVBfUEFDS0FHRV9OQU1FLFxuICAgIHByaW9yaXR5OiAxLFxuICAgIGRhdGF0aXA6IChlZGl0b3I6IFRleHRFZGl0b3IsIHBvc2l0aW9uOiBhdG9tJFBvaW50KSA9PiB7XG4gICAgICByZXR1cm4gZGVidWdnZXJEYXRhdGlwKF9zZXJ2aWNlLCBlZGl0b3IsIHBvc2l0aW9uKVxuICAgIH0sXG4gIH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlRGVidWdnZXJWaWV3KG1vZGVsOiBtaXhlZCk6ID9IVE1MRWxlbWVudCB7XG4gIGxldCB2aWV3ID0gbnVsbFxuICBpZiAobW9kZWwgaW5zdGFuY2VvZiBEZWJ1Z2dlclBhbmVWaWV3TW9kZWwgfHwgbW9kZWwgaW5zdGFuY2VvZiBEZWJ1Z2dlclBhbmVDb250YWluZXJWaWV3TW9kZWwpIHtcbiAgICB2aWV3ID0gbW9kZWwuY3JlYXRlVmlldygpXG4gIH1cblxuICBpZiAodmlldyAhPSBudWxsKSB7XG4gICAgY29uc3QgZWxlbSA9IHJlbmRlclJlYWN0Um9vdCh2aWV3KVxuICAgIGVsZW0uY2xhc3NOYW1lID0gXCJkZWJ1Z2dlci1jb250YWluZXJcIlxuICAgIHJldHVybiBlbGVtXG4gIH1cblxuICByZXR1cm4gbnVsbFxufVxuIl19