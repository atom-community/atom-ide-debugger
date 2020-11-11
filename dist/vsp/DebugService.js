"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var DebugProtocol = _interopRequireWildcard(require("vscode-debugprotocol"));

var React = _interopRequireWildcard(require("react"));

var _assert = _interopRequireDefault(require("assert"));

var _Icon = require("@atom-ide-community/nuclide-commons-ui/Icon");

var _nuclideUri = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/nuclideUri"));

var _event = require("@atom-ide-community/nuclide-commons/event");

var _promise = require("@atom-ide-community/nuclide-commons/promise");

var _nuclideDebuggerCommon = require("@atom-ide-community/nuclide-debugger-common");

var _rxjsCompatUmdMin = require("rxjs-compat/bundles/rxjs-compat.umd.min.js");

var _TextEditorBanner = require("@atom-ide-community/nuclide-commons-ui/TextEditorBanner");

var _ReadOnlyNotice = _interopRequireDefault(require("@atom-ide-community/nuclide-commons-ui/ReadOnlyNotice"));

var _analytics = require("@atom-ide-community/nuclide-commons/analytics");

var _nullthrows = _interopRequireDefault(require("nullthrows"));

var _AtomServiceContainer = require("../AtomServiceContainer");

var _utils = require("../utils");

var _DebuggerModel = require("./DebuggerModel");

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var _atom = require("atom");

var _collection = require("@atom-ide-community/nuclide-commons/collection");

var _uuid = _interopRequireDefault(require("uuid"));

var _constants = require("../constants");

var _logger = _interopRequireDefault(require("../logger"));

var _stripAnsi = _interopRequireDefault(require("strip-ansi"));

var _url = _interopRequireDefault(require("url"));

var _os = _interopRequireDefault(require("os"));

var _idx = _interopRequireDefault(require("idx"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

/**
The following debug service implementation was ported from VSCode's debugger implementation
in https://github.com/Microsoft/vscode/tree/master/src/vs/workbench/parts/debug

MIT License

Copyright (c) 2015 - present Microsoft Corporation

All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
const CONSOLE_VIEW_URI = "atom://nuclide/console";
const CUSTOM_DEBUG_EVENT = "CUSTOM_DEBUG_EVENT";
const CHANGE_DEBUG_MODE = "CHANGE_DEBUG_MODE";
const START_DEBUG_SESSION = "START_DEBUG_SESSION";
const ACTIVE_THREAD_CHANGED = "ACTIVE_THREAD_CHANGED";
const DEBUGGER_FOCUS_CHANGED = "DEBUGGER_FOCUS_CHANGED";
const CHANGE_EXPRESSION_CONTEXT = "CHANGE_EXPRESSION_CONTEXT"; // Berakpoint events may arrive sooner than breakpoint responses.

const MAX_BREAKPOINT_EVENT_DELAY_MS = 5 * 1000;

class ViewModel {
  constructor() {
    this._focusedProcess = void 0;
    this._focusedThread = void 0;
    this._focusedStackFrame = void 0;
    this._emitter = void 0;
    this._focusedProcess = null;
    this._focusedThread = null;
    this._focusedStackFrame = null;
    this._emitter = new _atom.Emitter();
  }

  get focusedProcess() {
    return this._focusedProcess;
  }

  get focusedThread() {
    return this._focusedThread;
  }

  get focusedStackFrame() {
    return this._focusedStackFrame;
  }

  onDidChangeDebuggerFocus(callback) {
    return this._emitter.on(DEBUGGER_FOCUS_CHANGED, callback);
  }

  onDidChangeExpressionContext(callback) {
    return this._emitter.on(CHANGE_EXPRESSION_CONTEXT, callback);
  }

  _chooseFocusThread(process) {
    const threads = process.getAllThreads(); // If the current focused thread is in the focused process and is stopped,
    // leave that thread focused. Otherwise, choose the first
    // stopped thread in the focused process if there is one,
    // and the first running thread otherwise.

    if (this._focusedThread != null) {
      const id = this._focusedThread.getId();

      const currentFocusedThread = threads.filter(t => t.getId() === id && t.stopped);

      if (currentFocusedThread.length > 0) {
        return currentFocusedThread[0];
      }
    }

    const stoppedThreads = threads.filter(t => t.stopped);
    return stoppedThreads[0] || threads[0];
  }

  _chooseFocusStackFrame(thread) {
    if (thread == null) {
      return null;
    } // If the current focused stack frame is in the current focused thread's
    // frames, leave it alone. Otherwise return the top stack frame if the
    // thread is stopped, and null if it is running.


    const currentFocusedFrame = thread.getCachedCallStack().find(f => f === this._focusedStackFrame);
    return thread.stopped ? currentFocusedFrame || thread.getCallStackTopFrame() : null;
  }

  _setFocus(process, thread, stackFrame, explicit) {
    let newProcess = process; // If we have a focused frame, we must have a focused thread.

    (0, _assert.default)(stackFrame == null || thread === stackFrame.thread); // If we have a focused thread, we must have a focused process.

    (0, _assert.default)(thread == null || process === thread.process);

    if (newProcess == null) {
      (0, _assert.default)(thread == null && stackFrame == null);
      newProcess = this._focusedProcess;
    }

    const focusChanged = this._focusedProcess !== newProcess || this._focusedThread !== thread || this._focusedStackFrame !== stackFrame || explicit;
    this._focusedProcess = newProcess;
    this._focusedThread = thread;
    this._focusedStackFrame = stackFrame;

    if (focusChanged) {
      this._emitter.emit(DEBUGGER_FOCUS_CHANGED, {
        explicit
      });
    } else {
      // The focused stack frame didn't change, but something about the
      // context did, so interested listeners should re-evaluate expressions.
      this._emitter.emit(CHANGE_EXPRESSION_CONTEXT, {
        explicit
      });
    }
  }

  evaluateContextChanged() {
    this._emitter.emit(CHANGE_EXPRESSION_CONTEXT, {
      explicit: true
    });
  }

  setFocusedProcess(process, explicit) {
    if (process == null) {
      this._focusedProcess = null;

      this._setFocus(null, null, null, explicit);
    } else {
      const newFocusThread = this._chooseFocusThread(process);

      const newFocusFrame = this._chooseFocusStackFrame(newFocusThread);

      this._setFocus(process, newFocusThread, newFocusFrame, explicit);
    }
  }

  setFocusedThread(thread, explicit) {
    if (thread == null) {
      this._setFocus(null, null, null, explicit);
    } else {
      this._setFocus(thread.process, thread, this._chooseFocusStackFrame(thread), explicit);
    }
  }

  setFocusedStackFrame(stackFrame, explicit) {
    if (stackFrame == null) {
      this._setFocus(null, null, null, explicit);
    } else {
      this._setFocus(stackFrame.thread.process, stackFrame.thread, stackFrame, explicit);
    }
  }

}

function getDebuggerName(adapterType) {
  return `${(0, _utils.capitalize)(adapterType)} Debugger`;
}

class DebugService {
  constructor(state) {
    this._model = void 0;
    this._disposables = void 0;
    this._sessionEndDisposables = void 0;
    this._consoleDisposables = void 0;
    this._emitter = void 0;
    this._viewModel = void 0;
    this._timer = void 0;
    this._breakpointsToSendOnSave = void 0;
    this._consoleOutput = void 0;

    this._runInTerminal = async args => {
      const terminalService = (0, _AtomServiceContainer.getTerminalService)();

      if (terminalService == null) {
        throw new Error("Unable to launch in terminal since the service is not available");
      }

      const process = this._getCurrentProcess();

      if (process == null) {
        throw new Error("There's no debug process to create a terminal for!");
      }

      const {
        adapterType,
        targetUri
      } = process.configuration;
      const key = `targetUri=${targetUri}&command=${args.args[0]}`; // Ensure any previous instances of this same target are closed before
      // opening a new terminal tab. We don't want them to pile up if the
      // user keeps running the same app over and over.

      terminalService.close(key);
      const title = args.title != null ? args.title : getDebuggerName(adapterType);

      const hostname = _nuclideUri.default.getHostnameOpt(targetUri);

      const cwd = hostname == null ? args.cwd : _nuclideUri.default.createRemoteUri(hostname, args.cwd);
      const info = {
        key,
        title,
        cwd,
        command: {
          file: args.args[0],
          args: args.args.slice(1)
        },
        environmentVariables: args.env != null ? (0, _collection.mapFromObject)(args.env) : undefined,
        preservedCommands: ["debugger:continue-debugging", "debugger:stop-debugging", "debugger:restart-debugging", "debugger:step-over", "debugger:step-into", "debugger:step-out"],
        remainOnCleanExit: true,
        icon: "nuclicon-debugger",
        defaultLocation: "bottom"
      };
      const terminal = await terminalService.open(info);
      terminal.setProcessExitCallback(() => {
        // This callback is invoked if the target process dies first, ensuring
        // we tear down the debugger.
        this.stopProcess(process);
      });

      this._sessionEndDisposables.add(() => {
        // This termination path is invoked if the debugger dies first, ensuring
        // we terminate the target process. This can happen if the user hits stop,
        // or if the debugger crashes.
        terminal.setProcessExitCallback(() => {});
        terminal.terminateProcess();
      });

      const spawn = (0, _event.observableFromSubscribeFunction)(cb => terminal.onSpawn(cb));
      return spawn.take(1).toPromise();
    };

    this._onSessionEnd = async session => {
      (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_STOP);

      const removedProcesses = this._model.removeProcess(session.getId());

      if (removedProcesses.length === 0) {
        // If the process is already removed from the model, there's nothing else
        // to do. We can re-enter here if the debug session ends before the
        // debug adapter process terminates.
        return;
      } // Mark all removed processes as STOPPING.


      removedProcesses.forEach(process => {
        process.setStopPending();

        this._onDebuggerModeChanged(process, _constants.DebuggerMode.STOPPING);
      }); // Ensure all the adapters are terminated.

      await session.disconnect(false
      /* restart */
      , true
      /* force */
      );

      if (this._model.getProcesses() == null || this._model.getProcesses().length === 0) {
        this._sessionEndDisposables.dispose();

        this._consoleDisposables.dispose(); // No processes remaining, clear process focus.


        this._viewModel.setFocusedProcess(null, false);
      } else {
        if (this._viewModel.focusedProcess != null && this._viewModel.focusedProcess.getId() === session.getId()) {
          // The process that just exited was the focused process, so we need
          // to move focus to another process. If there's a process with a
          // stopped thread, choose that. Otherwise choose the last process.
          const allProcesses = this._model.getProcesses();

          const processToFocus = allProcesses.filter(p => p.getAllThreads().some(t => t.stopped))[0] || allProcesses[allProcesses.length - 1];

          this._viewModel.setFocusedProcess(processToFocus, false);
        }
      }

      removedProcesses.forEach(process => {
        this._onDebuggerModeChanged(process, _constants.DebuggerMode.STOPPED);
      });
      const createConsole = (0, _AtomServiceContainer.getConsoleService)();

      if (createConsole != null) {
        const name = "Nuclide Debugger";
        const consoleApi = createConsole({
          id: name,
          name
        });
        removedProcesses.forEach(p => consoleApi.append({
          text: "Process exited" + (p.configuration.processName == null ? "" : " (" + p.configuration.processName + ")"),
          level: "log"
        }));
      }

      if (this._timer != null) {
        this._timer.onSuccess();

        this._timer = null;
      }
    };

    this._disposables = new _UniversalDisposable.default();
    this._sessionEndDisposables = new _UniversalDisposable.default();
    this._consoleDisposables = new _UniversalDisposable.default();
    this._emitter = new _atom.Emitter();
    this._viewModel = new ViewModel();
    this._breakpointsToSendOnSave = new Set();
    this._consoleOutput = new _rxjsCompatUmdMin.Subject();
    this._model = new _DebuggerModel.Model(this._loadBreakpoints(state), true, this._loadFunctionBreakpoints(state), this._loadExceptionBreakpoints(state), this._loadWatchExpressions(state), () => this._viewModel.focusedProcess);

    this._disposables.add(this._model, this._consoleOutput);

    this._registerListeners();
  }

  get viewModel() {
    return this._viewModel;
  }

  getDebuggerMode(process) {
    if (process == null) {
      return _constants.DebuggerMode.STOPPED;
    }

    return process.debuggerMode;
  }

  _registerListeners() {
    this._disposables.add(atom.workspace.addOpener(uri => {
      if (uri.startsWith(_constants.DEBUG_SOURCES_URI)) {
        if (this.getDebuggerMode(this._viewModel.focusedProcess) !== _constants.DebuggerMode.STOPPED) {
          return this._openSourceView(uri);
        }
      }
    }));
  }

  async _openSourceView(uri) {
    const query = (_url.default.parse(uri).path || "").split("/");
    const [, sessionId, sourceReferenceRaw] = query;
    const sourceReference = parseInt(sourceReferenceRaw, 10);

    const process = this._model.getProcesses().find(p => p.getId() === sessionId) || this._viewModel.focusedProcess;

    if (process == null) {
      throw new Error(`No debug session for source: ${sourceReference}`);
    }

    const source = process.getSource({
      path: uri,
      sourceReference
    });
    let content = "";

    try {
      const response = await process.session.source({
        sourceReference,
        source: source.raw
      });
      content = response.body.content;
    } catch (error) {
      this._sourceIsNotAvailable(uri);

      throw new Error("Debug source is not available");
    }

    const editor = atom.workspace.buildTextEditor({
      buffer: new DebugSourceTextBufffer(content, uri),
      autoHeight: false,
      readOnly: true
    }); // $FlowFixMe Debugger source views shouldn't persist between reload.

    editor.serialize = () => null;

    editor.setGrammar(atom.grammars.selectGrammar(source.name || "", content));
    const textEditorBanner = new _TextEditorBanner.TextEditorBanner(editor);
    textEditorBanner.render( /*#__PURE__*/React.createElement(_ReadOnlyNotice.default, {
      detailedMessage: "This is a debug source view that may not exist on the filesystem.",
      canEditAnyway: false,
      onDismiss: textEditorBanner.dispose.bind(textEditorBanner)
    }));

    this._sessionEndDisposables.addUntilDestroyed(editor, editor, textEditorBanner);

    return editor;
  }
  /**
   * Stops the specified process.
   */


  async stopProcess(process) {
    if (process.debuggerMode === _constants.DebuggerMode.STOPPING || process.debuggerMode === _constants.DebuggerMode.STOPPED) {
      return;
    }

    this._onSessionEnd(process.session);
  }

  async _tryToAutoFocusStackFrame(thread) {
    // The call stack has already been refreshed by the logic handling
    // the thread stop event for this thread.
    const callStack = thread.getCachedCallStack();

    if (callStack.length === 0 || this._viewModel.focusedStackFrame && this._viewModel.focusedStackFrame.thread.getId() === thread.getId() && callStack.includes(this._viewModel.focusedStackFrame)) {
      return;
    } // Focus first stack frame from top that has source location if no other stack frame is focused


    const stackFrameToFocus = callStack.find(sf => sf.source != null && sf.source.available);

    if (stackFrameToFocus == null) {
      return;
    }

    this._viewModel.setFocusedStackFrame(stackFrameToFocus, false);
  }

  _registerMarkers(process) {
    let selectedFrameMarker = null;
    let threadChangeDatatip;
    let lastFocusedThreadId;
    let lastFocusedProcess;

    const cleaupMarkers = () => {
      if (selectedFrameMarker != null) {
        selectedFrameMarker.destroy();
        selectedFrameMarker = null;
      }

      if (threadChangeDatatip != null) {
        threadChangeDatatip.dispose();
        threadChangeDatatip = null;
      }
    };

    return new _UniversalDisposable.default((0, _event.observableFromSubscribeFunction)(this._viewModel.onDidChangeDebuggerFocus.bind(this._viewModel)).concatMap(event => {
      cleaupMarkers();
      const {
        explicit
      } = event;
      const stackFrame = this._viewModel.focusedStackFrame;

      if (stackFrame == null || !stackFrame.source.available) {
        if (explicit && this.getDebuggerMode(this._viewModel.focusedProcess) === _constants.DebuggerMode.PAUSED) {
          atom.notifications.addWarning("No source available for the selected stack frame");
        }

        return _rxjsCompatUmdMin.Observable.empty();
      }

      return _rxjsCompatUmdMin.Observable.fromPromise(stackFrame.openInEditor()).switchMap(editor => {
        if (editor == null) {
          const uri = stackFrame.source.uri;
          const errorMsg = uri == null || uri === "" ? "The selected stack frame has no known source location" : `Nuclide could not open ${uri}`;
          atom.notifications.addError(errorMsg);
          return _rxjsCompatUmdMin.Observable.empty();
        }

        return _rxjsCompatUmdMin.Observable.of({
          editor,
          explicit,
          stackFrame
        });
      });
    }).subscribe(({
      editor,
      explicit,
      stackFrame
    }) => {
      const line = stackFrame.range.start.row;
      selectedFrameMarker = editor.markBufferRange([[line, 0], [line, Infinity]], {
        invalidate: "never"
      });
      editor.decorateMarker(selectedFrameMarker, {
        type: "line",
        class: "debugger-current-line-highlight"
      });
      const datatipService = (0, _AtomServiceContainer.getDatatipService)();

      if (datatipService == null) {
        return;
      }

      this._model.setExceptionBreakpoints(process, stackFrame.thread.process.session.capabilities.exceptionBreakpointFilters || []);

      if (lastFocusedThreadId != null && !explicit && stackFrame.thread.threadId !== lastFocusedThreadId && process === lastFocusedProcess) {
        let message = `Active thread changed from ${lastFocusedThreadId} to ${stackFrame.thread.threadId}`;
        const newFocusedProcess = stackFrame.thread.process;

        if (lastFocusedProcess != null && !explicit && newFocusedProcess !== lastFocusedProcess) {
          if (lastFocusedProcess.configuration.processName != null && newFocusedProcess.configuration.processName != null) {
            message = "Active process changed from " + lastFocusedProcess.configuration.processName + " to " + newFocusedProcess.configuration.processName + " AND " + message;
          } else {
            message = "Active process changed AND " + message;
          }
        }

        threadChangeDatatip = datatipService.createPinnedDataTip({
          component: () => /*#__PURE__*/React.createElement("div", {
            className: "debugger-thread-switch-alert"
          }, /*#__PURE__*/React.createElement(_Icon.Icon, {
            icon: "alert"
          }), message),
          range: stackFrame.range,
          pinnable: true
        }, editor);

        this._emitter.emit(ACTIVE_THREAD_CHANGED);
      }

      lastFocusedThreadId = stackFrame.thread.threadId;
      lastFocusedProcess = stackFrame.thread.process;
    }), cleaupMarkers);
  }

  _registerSessionListeners(process, session) {
    this._sessionEndDisposables = new _UniversalDisposable.default(session);

    this._sessionEndDisposables.add(this._registerMarkers(process));

    const sessionId = session.getId();
    const threadFetcher = (0, _promise.serializeAsyncCall)(async () => {
      const response = await session.threads();

      if (response && response.body && response.body.threads) {
        response.body.threads.forEach(thread => {
          this._model.rawUpdate({
            sessionId,
            thread
          });
        });
      }
    });
    const openFilesSaved = (0, _event.observableFromSubscribeFunction)(atom.workspace.observeTextEditors.bind(atom.workspace)).flatMap(editor => {
      return (0, _event.observableFromSubscribeFunction)(editor.onDidSave.bind(editor)).map(() => editor.getPath()).takeUntil((0, _event.observableFromSubscribeFunction)(editor.onDidDestroy.bind(editor)));
    });

    this._sessionEndDisposables.add(openFilesSaved.subscribe(async filePath => {
      if (filePath == null || !this._breakpointsToSendOnSave.has(filePath)) {
        return;
      }

      this._breakpointsToSendOnSave.delete(filePath);

      await this._sendBreakpoints(filePath, true);
    }));

    this._sessionEndDisposables.add(session.observeInitializeEvents().subscribe(async event => {
      const sendConfigurationDone = async () => {
        if (session && session.getCapabilities().supportsConfigurationDoneRequest) {
          return session.configurationDone().then(_ => {
            this._onDebuggerModeChanged(process, _constants.DebuggerMode.RUNNING);
          }).catch(e => {
            // Disconnect the debug session on configuration done error #10596
            this._onSessionEnd(session);

            session.disconnect().catch(_utils.onUnexpectedError);
            atom.notifications.addError("Failed to configure debugger. This is often because either " + "the process you tried to attach to has already terminated, or " + "you do not have permissions (the process is running as root or " + "another user.)", {
              detail: e.message
            });
          });
        }
      };

      try {
        await this._sendAllBreakpoints().then(sendConfigurationDone, sendConfigurationDone);
        await threadFetcher();
      } catch (error) {
        (0, _utils.onUnexpectedError)(error);
      }
    }));

    const toFocusThreads = new _rxjsCompatUmdMin.Subject();

    const observeContinuedTo = threadId => {
      return session.observeContinuedEvents().filter(continued => continued.body.allThreadsContinued || threadId != null && threadId === continued.body.threadId).take(1);
    };

    this._sessionEndDisposables.add(session.observeStopEvents().subscribe(() => {
      this._onDebuggerModeChanged(process, _constants.DebuggerMode.PAUSED);
    }), session.observeEvaluations().subscribe(() => {
      this._viewModel.evaluateContextChanged();
    }), session.observeStopEvents().flatMap(event => _rxjsCompatUmdMin.Observable.fromPromise(threadFetcher()).ignoreElements().concat(_rxjsCompatUmdMin.Observable.of(event)).catch(error => {
      (0, _utils.onUnexpectedError)(error);
      return _rxjsCompatUmdMin.Observable.empty();
    }) // Proceeed processing the stopped event only if there wasn't
    // a continued event while we're fetching the threads
    .takeUntil(observeContinuedTo(event.body.threadId))).subscribe(event => {
      const {
        threadId
      } = event.body; // Updating stopped state needs to happen after fetching the threads

      this._model.rawUpdate({
        sessionId,
        stoppedDetails: event.body,
        threadId
      });

      if (threadId == null) {
        return;
      }

      const thread = process.getThread(threadId);

      if (thread != null) {
        toFocusThreads.next(thread);
      }
    }), toFocusThreads.concatMap(thread => {
      const {
        focusedThread
      } = this._viewModel;
      const preserveFocusHint = (0, _idx.default)(thread, _ => _.stoppedDetails.preserveFocusHint) || false;

      if (focusedThread != null && focusedThread.stopped && focusedThread.getId() !== thread.getId() && preserveFocusHint) {
        // The debugger is already stopped elsewhere.
        return _rxjsCompatUmdMin.Observable.empty();
      }

      const thisThreadIsFocused = this._viewModel.focusedStackFrame != null && this._viewModel.focusedStackFrame.thread.getId() === thread.getId(); // Fetches the first call frame in this stack to allow the UI to
      // update the thread list. Additional frames will be fetched by the UI
      // on demand, only if they are needed.
      // If this thread is the currently focused thread, fetch the entire
      // stack because the UI will certainly need it, and we need it here to
      // try and auto-focus a frame.

      return _rxjsCompatUmdMin.Observable.fromPromise(this._model.refreshCallStack(thread, thisThreadIsFocused)).ignoreElements().concat(_rxjsCompatUmdMin.Observable.of(thread)) // Avoid focusing a continued thread.
      .takeUntil(observeContinuedTo(thread.threadId)) // Verify the thread is still stopped.
      .filter(() => thread.stopped).catch(error => {
        (0, _utils.onUnexpectedError)(error);
        return _rxjsCompatUmdMin.Observable.empty();
      });
    }).subscribe(thread => {
      this._tryToAutoFocusStackFrame(thread);

      this._scheduleNativeNotification();
    }));

    this._sessionEndDisposables.add(session.observeThreadEvents().subscribe(async event => {
      if (event.body.reason === "started") {
        await threadFetcher();
      } else if (event.body.reason === "exited") {
        this._model.clearThreads(session.getId(), true, event.body.threadId);
      }
    }));

    this._sessionEndDisposables.add(session.observeTerminateDebugeeEvents().subscribe(event => {
      if (event.body && event.body.restart) {
        this.restartProcess(process).catch(err => {
          atom.notifications.addError("Failed to restart debugger", {
            detail: err.stack || String(err)
          });
        });
      } else {
        this._onSessionEnd(session);

        session.disconnect().catch(_utils.onUnexpectedError);
      }
    }));

    this._sessionEndDisposables.add(session.observeContinuedEvents().subscribe(event => {
      const threadId = event.body.allThreadsContinued !== false ? undefined : event.body.threadId;

      this._model.clearThreads(session.getId(), false, threadId);

      this._viewModel.setFocusedThread(this._viewModel.focusedThread, false);

      this._onDebuggerModeChanged(process, _constants.DebuggerMode.RUNNING);
    }));

    const outputEvents = session.observeOutputEvents().filter(event => event.body != null && typeof event.body.output === "string").share();
    const notificationStream = outputEvents.filter(e => e.body.category === "nuclide_notification").map(e => ({
      type: (0, _nullthrows.default)(e.body.data).type,
      message: e.body.output
    }));
    const nuclideTrackStream = outputEvents.filter(e => e.body.category === "nuclide_track");

    this._sessionEndDisposables.add(notificationStream.subscribe(({
      type,
      message
    }) => {
      atom.notifications.add(type, message);
    }), nuclideTrackStream.subscribe(e => {
      (0, _analytics.track)(e.body.output, e.body.data || {});
    }));

    const createConsole = (0, _AtomServiceContainer.getConsoleService)();

    if (createConsole != null) {
      const name = getDebuggerName(process.configuration.adapterType);
      const consoleApi = createConsole({
        id: name,
        name
      });

      this._sessionEndDisposables.add(consoleApi);

      const CATEGORIES_MAP = new Map([["stderr", "error"], ["console", "warning"], ["success", "success"]]);
      const IGNORED_CATEGORIES = new Set(["telemetry", "nuclide_notification", "nuclide_track"]);
      const logStream = outputEvents.filter(e => e.body.variablesReference == null).filter(e => !IGNORED_CATEGORIES.has(e.body.category)).map(e => ({
        text: (0, _stripAnsi.default)(e.body.output),
        level: CATEGORIES_MAP.get(e.body.category) || "log"
      })).filter(e => e.level != null);
      const objectStream = outputEvents.filter(e => e.body.variablesReference != null).map(e => ({
        category: e.body.category,
        variablesReference: (0, _nullthrows.default)(e.body.variablesReference)
      }));
      let lastEntryToken = null;

      const handleMessage = (line, level) => {
        const complete = line.endsWith("\n");
        const sameLevel = lastEntryToken != null && lastEntryToken.getCurrentLevel() === level;

        if (sameLevel) {
          lastEntryToken = (0, _nullthrows.default)(lastEntryToken).appendText(line);

          if (complete) {
            lastEntryToken.setComplete();
            lastEntryToken = null;
          }
        } else {
          if (lastEntryToken != null) {
            lastEntryToken.setComplete();
          }

          lastEntryToken = consoleApi.append({
            text: line,
            level,
            incomplete: !complete
          });
        }
      };

      this._sessionEndDisposables.add(logStream.subscribe(e => handleMessage(e.text, e.level)), notificationStream.subscribe(({
        type,
        message
      }) => {
        atom.notifications.add(type, message);
      }), objectStream.subscribe(({
        category,
        variablesReference
      }) => {
        const level = CATEGORIES_MAP.get(category) || "log";
        const container = new _DebuggerModel.ExpressionContainer(this._viewModel.focusedProcess, variablesReference, _uuid.default.v4());
        container.getChildren().then(children => {
          this._consoleOutput.next({
            text: `object[${children.length}]`,
            expressions: children,
            level
          });
        });
      }), () => {
        if (lastEntryToken != null) {
          lastEntryToken.setComplete();
        }

        lastEntryToken = null;
      } // TODO handle non string output (e.g. files)
      );
    }

    this._sessionEndDisposables.add(session.observeBreakpointEvents().flatMap(event => {
      const {
        breakpoint,
        reason
      } = event.body;

      if (reason !== _constants.BreakpointEventReasons.CHANGED && reason !== _constants.BreakpointEventReasons.REMOVED) {
        return _rxjsCompatUmdMin.Observable.of({
          reason,
          breakpoint,
          sourceBreakpoint: null,
          functionBreakpoint: null
        });
      } // Breakpoint events may arrive sooner than their responses.
      // Hence, we'll keep them cached and try re-processing on every change to the model's breakpoints
      // for a set maximum time, then discard.


      return (0, _event.observableFromSubscribeFunction)(this._model.onDidChangeBreakpoints.bind(this._model)).startWith(null).switchMap(() => {
        const sourceBreakpoint = this._model.getBreakpoints().filter(b => b.idFromAdapter === breakpoint.id).pop();

        const functionBreakpoint = this._model.getFunctionBreakpoints().filter(b => b.idFromAdapter === breakpoint.id).pop();

        if (sourceBreakpoint == null && functionBreakpoint == null) {
          return _rxjsCompatUmdMin.Observable.empty();
        } else {
          return _rxjsCompatUmdMin.Observable.of({
            reason,
            breakpoint,
            sourceBreakpoint,
            functionBreakpoint
          });
        }
      }).take(1).timeout(MAX_BREAKPOINT_EVENT_DELAY_MS).catch(error => {
        if (error instanceof _rxjsCompatUmdMin.TimeoutError) {
          _logger.default.error("Timed out breakpoint event handler", process.configuration.adapterType, reason, breakpoint);
        }

        return _rxjsCompatUmdMin.Observable.empty();
      });
    }).subscribe(({
      reason,
      breakpoint,
      sourceBreakpoint,
      functionBreakpoint
    }) => {
      if (reason === _constants.BreakpointEventReasons.NEW && breakpoint.source) {
        // The debug adapter is adding a new (unexpected) breakpoint to the UI.
        // TODO: Consider adding this to the current process only.
        const source = process.getSource(breakpoint.source);

        this._model.addUIBreakpoints([{
          column: breakpoint.column || 0,
          enabled: true,
          line: breakpoint.line == null ? -1 : breakpoint.line,
          uri: source.uri,
          id: _uuid.default.v4()
        }], false);
      } else if (reason === _constants.BreakpointEventReasons.REMOVED) {
        if (sourceBreakpoint != null) {
          this._model.removeBreakpoints([sourceBreakpoint]);
        }

        if (functionBreakpoint != null) {
          this._model.removeFunctionBreakpoints(functionBreakpoint.getId());
        }
      } else if (reason === _constants.BreakpointEventReasons.CHANGED) {
        if (sourceBreakpoint != null) {
          if (!sourceBreakpoint.column) {
            breakpoint.column = undefined;
          }

          this._model.updateProcessBreakpoints(process, {
            [sourceBreakpoint.getId()]: breakpoint
          });
        }

        if (functionBreakpoint != null) {
          this._model.updateFunctionBreakpoints({
            [functionBreakpoint.getId()]: breakpoint
          });
        }
      } else {
        _logger.default.warn("Unknown breakpoint event", reason, breakpoint);
      }
    }));

    this._sessionEndDisposables.add(session.observeAdapterExitedEvents().subscribe(event => {
      // 'Run without debugging' mode VSCode must terminate the extension host. More details: #3905
      this._onSessionEnd(session);
    }));

    this._sessionEndDisposables.add(session.observeCustomEvents().subscribe(event => {
      this._emitter.emit(CUSTOM_DEBUG_EVENT, event);
    })); // Clear in memory breakpoints.


    this._sessionEndDisposables.add(() => {
      const sourceRefBreakpoints = this._model.getBreakpoints().filter(bp => bp.uri.startsWith(_constants.DEBUG_SOURCES_URI));

      if (sourceRefBreakpoints.length > 0) {
        this._model.removeBreakpoints(sourceRefBreakpoints);
      }
    });
  }

  _scheduleNativeNotification() {
    const raiseNativeNotification = (0, _AtomServiceContainer.getNotificationService)();

    if (raiseNativeNotification != null) {
      const pendingNotification = raiseNativeNotification("Debugger", "Paused at a breakpoint", 3000, false);

      if (pendingNotification != null) {
        this._sessionEndDisposables.add(pendingNotification);
      }
    }
  }

  onDidChangeActiveThread(callback) {
    return this._emitter.on(ACTIVE_THREAD_CHANGED, callback);
  }

  onDidStartDebugSession(callback) {
    return this._emitter.on(START_DEBUG_SESSION, callback);
  }

  onDidCustomEvent(callback) {
    return this._emitter.on(CUSTOM_DEBUG_EVENT, callback);
  }

  onDidChangeProcessMode(callback) {
    return this._emitter.on(CHANGE_DEBUG_MODE, callback);
  }

  _loadBreakpoints(state) {
    let result = [];

    if (state == null || state.sourceBreakpoints == null) {
      return result;
    }

    try {
      result = state.sourceBreakpoints.map(breakpoint => {
        const bp = {
          uri: breakpoint.uri,
          line: breakpoint.originalLine,
          column: breakpoint.column,
          enabled: breakpoint.enabled,
          id: _uuid.default.v4()
        };

        if (breakpoint.condition != null && breakpoint.condition.trim() !== "") {
          bp.condition = breakpoint.condition;
        }

        if (breakpoint.logMessage != null && breakpoint.logMessage.trim() !== "") {
          bp.logMessage = breakpoint.logMessage;
        }

        return bp;
      });
    } catch (e) {}

    return result;
  }

  _loadFunctionBreakpoints(state) {
    let result = [];

    if (state == null || state.functionBreakpoints == null) {
      return result;
    }

    try {
      result = state.functionBreakpoints.map(fb => {
        return new _DebuggerModel.FunctionBreakpoint(fb.name, fb.enabled, fb.hitCondition);
      });
    } catch (e) {}

    return result;
  }

  _loadExceptionBreakpoints(state) {
    let result = [];

    if (state == null || state.exceptionBreakpoints == null) {
      return result;
    }

    try {
      result = state.exceptionBreakpoints.map(exBreakpoint => {
        return new _DebuggerModel.ExceptionBreakpoint(exBreakpoint.filter, exBreakpoint.label, exBreakpoint.enabled);
      });
    } catch (e) {}

    return result;
  }

  _loadWatchExpressions(state) {
    let result = [];

    if (state == null || state.watchExpressions == null) {
      return result;
    }

    try {
      result = state.watchExpressions.map(name => new _DebuggerModel.Expression(name));
    } catch (e) {}

    return result;
  }

  _onDebuggerModeChanged(process, mode) {
    this._emitter.emit(CHANGE_DEBUG_MODE, {
      data: {
        process,
        mode
      }
    });
  }

  enableOrDisableBreakpoints(enable, breakpoint) {
    if (breakpoint != null) {
      this._model.setEnablement(breakpoint, enable);

      if (breakpoint instanceof _DebuggerModel.Breakpoint) {
        return this._sendBreakpoints(breakpoint.uri);
      } else if (breakpoint instanceof _DebuggerModel.FunctionBreakpoint) {
        return this._sendFunctionBreakpoints();
      } else {
        (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_TOGGLE_EXCEPTION_BREAKPOINT);
        return this._sendExceptionBreakpoints();
      }
    }

    this._model.enableOrDisableAllBreakpoints(enable);

    return this._sendAllBreakpoints();
  }

  async addUIBreakpoints(uiBreakpoints) {
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_BREAKPOINT_ADD);

    this._model.addUIBreakpoints(uiBreakpoints);

    const uris = new Set();

    for (const bp of uiBreakpoints) {
      uris.add(bp.uri);
    }

    const promises = [];

    for (const uri of uris) {
      promises.push(this._sendBreakpoints(uri));
    }

    await Promise.all(promises);
  }

  addSourceBreakpoint(uri, line) {
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_BREAKPOINT_SINGLE_ADD);

    const existing = this._model.getBreakpointAtLine(uri, line);

    if (existing == null) {
      return this.addUIBreakpoints([{
        line,
        column: 0,
        enabled: true,
        id: _uuid.default.v4(),
        uri
      }]);
    }

    return Promise.resolve(undefined);
  }

  toggleSourceBreakpoint(uri, line) {
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_BREAKPOINT_TOGGLE);

    const existing = this._model.getBreakpointAtLine(uri, line);

    if (existing == null) {
      return this.addUIBreakpoints([{
        line,
        column: 0,
        enabled: true,
        id: _uuid.default.v4(),
        uri
      }]);
    } else {
      return this.removeBreakpoints(existing.getId(), true);
    }
  }

  updateBreakpoints(uiBreakpoints) {
    this._model.updateBreakpoints(uiBreakpoints);

    const urisToSend = new Set(uiBreakpoints.map(bp => bp.uri));

    for (const uri of urisToSend) {
      this._breakpointsToSendOnSave.add(uri);
    }
  }

  async removeBreakpoints(id, skipAnalytics = false) {
    const toRemove = this._model.getBreakpoints().filter(bp => id == null || bp.getId() === id);

    const urisToClear = (0, _collection.distinct)(toRemove, bp => bp.uri).map(bp => bp.uri);

    this._model.removeBreakpoints(toRemove);

    if (id == null) {
      (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_BREAKPOINT_DELETE_ALL);
    } else if (!skipAnalytics) {
      (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_BREAKPOINT_DELETE);
    }

    await Promise.all(urisToClear.map(uri => this._sendBreakpoints(uri)));
  }

  setBreakpointsActivated(activated) {
    this._model.setBreakpointsActivated(activated);

    return this._sendAllBreakpoints();
  }

  addFunctionBreakpoint() {
    this._model.addFunctionBreakpoint("");
  }

  renameFunctionBreakpoint(id, newFunctionName) {
    this._model.updateFunctionBreakpoints({
      [id]: {
        name: newFunctionName
      }
    });

    return this._sendFunctionBreakpoints();
  }

  removeFunctionBreakpoints(id) {
    this._model.removeFunctionBreakpoints(id);

    return this._sendFunctionBreakpoints();
  }

  async terminateThreads(threadIds) {
    const {
      focusedProcess
    } = this.viewModel;

    if (focusedProcess == null) {
      return;
    }

    const session = focusedProcess.session;
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_TERMINATE_THREAD);

    if (Boolean(session.capabilities.supportsTerminateThreadsRequest)) {
      await session.custom("terminateThreads", {
        threadIds
      });
    }
  }

  async runToLocation(uri, line) {
    const {
      focusedThread,
      focusedProcess
    } = this.viewModel;

    if (focusedThread == null || focusedProcess == null) {
      return;
    }

    const session = focusedProcess.session;
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_STEP_RUN_TO_LOCATION);

    if (Boolean(session.capabilities.supportsContinueToLocation)) {
      await session.custom("continueToLocation", {
        source: focusedProcess.getSource({
          path: uri
        }).raw,
        line,
        threadId: focusedThread.threadId
      });
      return;
    }

    const existing = this._model.getBreakpointAtLine(uri, line);

    if (existing == null) {
      await this.addUIBreakpoints([{
        line,
        column: 0,
        enabled: true,
        id: _uuid.default.v4(),
        uri
      }]);

      const runToLocationBreakpoint = this._model.getBreakpointAtLine(uri, line);

      (0, _assert.default)(runToLocationBreakpoint != null);

      const removeBreakpoint = () => {
        this.removeBreakpoints(runToLocationBreakpoint.getId(), true
        /* skip analytics */
        ).catch(error => (0, _utils.onUnexpectedError)(`Failed to clear run-to-location breakpoint! - ${String(error)}`));
        removeBreakpointDisposable.dispose();

        this._sessionEndDisposables.remove(removeBreakpointDisposable);

        this._sessionEndDisposables.remove(removeBreakpoint);
      }; // Remove if the debugger stopped at any location.


      const removeBreakpointDisposable = new _UniversalDisposable.default(session.observeStopEvents().take(1).subscribe(removeBreakpoint)); // Remove if the session has ended without hitting it.

      this._sessionEndDisposables.add(removeBreakpointDisposable, removeBreakpoint);
    }

    await focusedThread.continue();
  }

  addWatchExpression(name) {
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_WATCH_ADD_EXPRESSION);
    return this._model.addWatchExpression(name);
  }

  renameWatchExpression(id, newName) {
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_WATCH_UPDATE_EXPRESSION);
    return this._model.renameWatchExpression(id, newName);
  }

  removeWatchExpressions(id) {
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_WATCH_REMOVE_EXPRESSION);

    this._model.removeWatchExpressions(id);
  }

  createExpression(rawExpression) {
    return new _DebuggerModel.Expression(rawExpression);
  }

  async _doCreateProcess(rawConfiguration, sessionId) {
    let process;
    let session;

    const errorHandler = error => {
      if (this._timer != null) {
        this._timer.onError(error);

        this._timer = null;
      }

      (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_START_FAIL, {});
      const errorMessage = error instanceof Error ? error.message : error;
      atom.notifications.addError(`Failed to start debugger process: ${errorMessage}`);

      if (this._model.getProcesses() == null || this._model.getProcesses().length === 0) {
        this._consoleDisposables.dispose();
      }

      if (session != null && !session.isDisconnected()) {
        this._onSessionEnd(session);

        session.disconnect().catch(_utils.onUnexpectedError);
      }

      if (process != null) {
        this._model.removeProcess(process.getId());

        this._onDebuggerModeChanged(process, _constants.DebuggerMode.STOPPED);
      }
    };

    try {
      let configuration;
      let adapterExecutable; // if service does not provide adapterExecutable use the hardcoded values in debugger-registry

      if (!rawConfiguration.adapterExecutable) {
        adapterExecutable = await this._resolveAdapterExecutable(rawConfiguration);
        configuration = { ...rawConfiguration,
          adapterExecutable
        };
      } else {
        // already adapterExecutable is provided by the provider so the configuration is not raw.
        configuration = rawConfiguration;
      }

      configuration = await (0, _AtomServiceContainer.resolveDebugConfiguration)(configuration);
      const {
        adapterType,
        onDebugStartingCallback,
        onDebugStartedCallback,
        onDebugRunningCallback
      } = configuration;
      (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_START, {
        serviceName: configuration.adapterType,
        clientType: "VSP"
      });
      const sessionTeardownDisposables = new _UniversalDisposable.default();

      const instanceInterface = newSession => {
        return Object.freeze({
          customRequest: async (request, args) => {
            return newSession.custom(request, args);
          },
          observeCustomEvents: newSession.observeCustomEvents.bind(newSession)
        });
      };

      const createInitializeSession = async config => {
        const newSession = await this._createVsDebugSession(config, config.adapterExecutable || adapterExecutable, sessionId); // If this is the first process, register the console executor.

        if (this._model.getProcesses().length === 0) {
          this._registerConsoleExecutor();
        }

        process = this._model.addProcess(config, newSession);

        this._viewModel.setFocusedProcess(process, false);

        this._onDebuggerModeChanged(process, _constants.DebuggerMode.STARTING);

        this._emitter.emit(START_DEBUG_SESSION, config);

        this._registerSessionListeners(process, newSession);

        atom.commands.dispatch(atom.views.getView(atom.workspace), "debugger:show");
        await newSession.initialize({
          clientID: "atom",
          adapterID: adapterType,
          pathFormat: "path",
          linesStartAt1: true,
          columnsStartAt1: true,
          supportsVariableType: true,
          supportsVariablePaging: false,
          supportsRunInTerminalRequest: (0, _AtomServiceContainer.getTerminalService)() != null,
          locale: "en-us"
        });

        if (onDebugStartingCallback != null) {
          // Callbacks are passed IVspInstance which exposes only certain
          // methods to them, rather than getting the full session.
          const teardown = onDebugStartingCallback(instanceInterface(newSession));

          if (teardown != null) {
            sessionTeardownDisposables.add(teardown);
          }
        }

        this._model.setExceptionBreakpoints(process, newSession.getCapabilities().exceptionBreakpointFilters || []);

        return newSession;
      };

      session = await createInitializeSession(configuration);

      const setRunningState = () => {
        if (process != null) {
          process.clearProcessStartingFlag();

          this._onDebuggerModeChanged(process, _constants.DebuggerMode.RUNNING);

          this._viewModel.setFocusedProcess(process, false);

          if (onDebugRunningCallback != null && session != null) {
            // Callbacks are passed IVspInstance which exposes only certain
            // methods to them, rather than getting the full session.
            const teardown = onDebugRunningCallback(instanceInterface(session));

            if (teardown != null) {
              sessionTeardownDisposables.add(teardown);
            }
          }
        }
      }; // We're not awaiting launch/attach to finish because some debug adapters
      // need to do custom work for launch/attach to work (e.g. mobilejs)


      this._launchOrAttachTarget(session, configuration).then(() => setRunningState()).catch(async error => {
        if (process != null) {
          this.stopProcess(process);
        }

        if (configuration.debugMode === "attach" && configuration.adapterExecutable != null && configuration.adapterExecutable.command !== "sudo" && ( // sudo is not supported on Windows, and currently remote projects
        // are not supported on Windows, so a remote URI must be *nix.
        _os.default.platform() !== "win32" || _nuclideUri.default.isRemote(configuration.targetUri))) {
          configuration.adapterExecutable.args = [configuration.adapterExecutable.command, ...configuration.adapterExecutable.args];
          configuration.adapterExecutable.command = "sudo";
          const errorMessage = error instanceof Error ? error.message : error;
          atom.notifications.addWarning(`The debugger was unable to attach to the target process: ${errorMessage}. ` + "Attempting to re-launch the debugger as root...");
          session = await createInitializeSession(configuration);

          this._launchOrAttachTarget(session, configuration).then(() => setRunningState()).catch(errorHandler);
        } else {
          errorHandler(error);
        }
      });

      if (onDebugStartedCallback != null && session != null) {
        const teardown = onDebugStartedCallback(instanceInterface(session));

        if (teardown != null) {
          sessionTeardownDisposables.add(teardown);
        }
      }

      this._sessionEndDisposables.add(() => {
        this._model.onDidChangeProcesses(() => {
          if (!this.getModel().getProcesses().includes(process)) {
            sessionTeardownDisposables.dispose();
          }
        });
      });

      this._sessionEndDisposables.add(sessionTeardownDisposables);

      return process;
    } catch (error) {
      errorHandler(error);
      return null;
    }
  }

  async _resolveAdapterExecutable(configuration) {
    if (configuration.adapterExecutable != null) {
      return configuration.adapterExecutable;
    }

    return (0, _nuclideDebuggerCommon.getVSCodeDebuggerAdapterServiceByNuclideUri)(configuration.targetUri).getAdapterExecutableInfo(configuration.adapterType);
  }

  async _createVsDebugSession(configuration, adapterExecutable, sessionId) {
    const {
      targetUri
    } = configuration;
    const service = (0, _nuclideDebuggerCommon.getVSCodeDebuggerAdapterServiceByNuclideUri)(targetUri);
    const spawner = await service.createVsRawAdapterSpawnerService();
    const clientPreprocessors = [];
    const adapterPreprocessors = [];

    if (configuration.clientPreprocessor != null) {
      clientPreprocessors.push(configuration.clientPreprocessor);
    }

    if (configuration.adapterPreprocessor != null) {
      adapterPreprocessors.push(configuration.adapterPreprocessor);
    }

    const isRemote = _nuclideUri.default.isRemote(targetUri);

    if (isRemote) {
      clientPreprocessors.push((0, _nuclideDebuggerCommon.remoteToLocalProcessor)());
      adapterPreprocessors.push((0, _nuclideDebuggerCommon.localToRemoteProcessor)(targetUri));
    }

    return new _nuclideDebuggerCommon.VsDebugSession(sessionId, _logger.default, adapterExecutable, {
      adapter: configuration.adapterType,
      host: "debugService",
      isRemote
    }, spawner, clientPreprocessors, adapterPreprocessors, this._runInTerminal, Boolean(configuration.isReadOnly));
  }

  async _launchOrAttachTarget(session, configuration) {
    if (configuration.debugMode === "attach") {
      await session.attach(configuration.config);
    } else {
      // It's 'launch'
      await session.launch(configuration.config);
    }
  }

  _sourceIsNotAvailable(uri) {
    this._model.sourceIsNotAvailable(uri);
  }

  canRestartProcess() {
    const process = this._getCurrentProcess();

    return process != null && process.configuration.isRestartable === true;
  }

  async restartProcess(process) {
    if (process.session.capabilities.supportsRestartRequest) {
      await process.session.custom("restart", null);
    }

    await process.session.disconnect(true);
    await (0, _promise.sleep)(300);
    await this.startDebugging(process.configuration);
  }
  /**
   * Starts debugging. If the configOrName is not passed uses the selected configuration in the debug dropdown.
   * Also saves all files, manages if compounds are present in the configuration
   * and resolveds configurations via DebugConfigurationProviders.
   */


  async startDebugging(config) {
    this._timer = (0, _analytics.startTracking)("debugger-atom:startDebugging"); // Open the console window if it's not already opened.
    // eslint-disable-next-line nuclide-internal/atom-apis

    atom.workspace.open(CONSOLE_VIEW_URI, {
      searchAllPanes: true
    });
    await this._doCreateProcess(config, _uuid.default.v4());

    if (this._model.getProcesses().length > 1) {
      const debuggerTypes = this._model.getProcesses().map(({
        configuration
      }) => `${configuration.adapterType}: ${configuration.processName || ""}`);

      (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_MULTITARGET, {
        processesCount: this._model.getProcesses().length,
        debuggerTypes
      });
    }
  }

  getModel() {
    return this._model;
  }

  async _sendAllBreakpoints() {
    await Promise.all((0, _collection.distinct)(this._model.getBreakpoints(), bp => bp.uri).map(bp => this._sendBreakpoints(bp.uri, false)));
    await this._sendFunctionBreakpoints(); // send exception breakpoints at the end since some debug adapters rely on the order

    await this._sendExceptionBreakpoints();
  }

  async _sendBreakpoints(uri, sourceModified = false) {
    const process = this._getCurrentProcess();

    const session = this._getCurrentSession();

    if (process == null || session == null || !session.isReadyForBreakpoints()) {
      return;
    }

    const breakpointsToSend = (sourceModified ? this._model.getUIBreakpoints() : this._model.getBreakpoints()).filter(bp => this._model.areBreakpointsActivated() && bp.enabled && bp.uri === uri);
    const rawSource = process.getSource({
      path: uri,
      name: _nuclideUri.default.basename(uri)
    }).raw;

    if (!sourceModified && breakpointsToSend.length > 0 && !rawSource.adapterData && breakpointsToSend[0].adapterData) {
      rawSource.adapterData = breakpointsToSend[0].adapterData;
    } // The UI is 0-based, while VSP is 1-based.


    const response = await session.setBreakpoints({
      source: rawSource,
      lines: breakpointsToSend.map(bp => bp.line),
      breakpoints: breakpointsToSend.map(bp => {
        const bpToSend = {
          line: bp.line
        }; // Column and condition are optional in the protocol, but should
        // only be included on the object sent to the debug adapter if
        // they have values that exist.

        if (bp.column != null && bp.column > 0) {
          bpToSend.column = bp.column;
        }

        if (bp.condition != null && bp.condition !== "") {
          bpToSend.condition = bp.condition;
        }

        if (bp.logMessage != null && bp.logMessage !== "") {
          bpToSend.logMessage = bp.logMessage;
        }

        return bpToSend;
      }),
      sourceModified
    });

    if (response == null || response.body == null) {
      return;
    }

    const data = {};

    for (let i = 0; i < breakpointsToSend.length; i++) {
      // If sourceModified === true, we're dealing with new UI breakpoints that
      // represent the new location(s) the breakpoints ended up in due to the
      // file contents changing. These are of type IUIBreakpoint.  Otherwise,
      // we have process breakpoints of type IBreakpoint here. These types both have
      // an ID, but we get it a little differently.
      const bpId = sourceModified ? breakpointsToSend[i].id : breakpointsToSend[i].getId();
      data[bpId] = response.body.breakpoints[i];

      if (!breakpointsToSend[i].column) {
        // If there was no column sent ignore the breakpoint column response from the adapter
        data[bpId].column = undefined;
      }
    }

    this._model.updateProcessBreakpoints(process, data);
  }

  _getCurrentSession() {
    return this._viewModel.focusedProcess == null ? null : this._viewModel.focusedProcess.session;
  }

  _getCurrentProcess() {
    return this._viewModel.focusedProcess;
  }

  async _sendFunctionBreakpoints() {
    const session = this._getCurrentSession();

    if (session == null || !session.isReadyForBreakpoints() || !session.getCapabilities().supportsFunctionBreakpoints) {
      return;
    }

    const breakpointsToSend = this._model.getFunctionBreakpoints().filter(fbp => fbp.enabled && this._model.areBreakpointsActivated());

    const response = await session.setFunctionBreakpoints({
      breakpoints: breakpointsToSend
    });

    if (response == null || response.body == null) {
      return;
    }

    const data = {};

    for (let i = 0; i < breakpointsToSend.length; i++) {
      data[breakpointsToSend[i].getId()] = response.body.breakpoints[i];
    }

    this._model.updateFunctionBreakpoints(data);
  }

  async _sendExceptionBreakpoints() {
    const session = this._getCurrentSession();

    if (session == null || !session.isReadyForBreakpoints() || this._model.getExceptionBreakpoints().length === 0) {
      return;
    }

    const enabledExceptionBps = this._model.getExceptionBreakpoints().filter(exb => exb.enabled);

    await session.setExceptionBreakpoints({
      filters: enabledExceptionBps.map(exb => exb.filter)
    });
  }

  _evaluateExpression(expression, level) {
    const {
      focusedProcess,
      focusedStackFrame
    } = this._viewModel;

    if (focusedProcess == null) {
      _logger.default.error("Cannot evaluate while there is no active debug session");

      return;
    }

    const subscription = // We filter here because the first value in the BehaviorSubject is null no matter what, and
    // we want the console to unsubscribe the stream after the first non-null value.
    (0, _utils.evaluateExpressionAsStream)(expression, focusedProcess, focusedStackFrame, "repl").skip(1) // Skip the first pending value.
    .subscribe(result => {
      // Evaluate all watch expressions and fetch variables again since repl evaluation might have changed some.
      this._viewModel.setFocusedStackFrame(this._viewModel.focusedStackFrame, false);

      if (result.isError || result.isPending || !expression.available) {
        const message = {
          text: expression.getValue(),
          level: "error"
        };

        this._consoleOutput.next(message);
      } else if (expression.hasChildren()) {
        this._consoleOutput.next({
          text: "object",
          expressions: [expression],
          level
        });
      } else {
        this._consoleOutput.next({
          text: expression.getValue(),
          level
        });
      }

      this._consoleDisposables.remove(subscription);
    });

    this._consoleDisposables.add(subscription);
  }

  _registerConsoleExecutor() {
    this._consoleDisposables = new _UniversalDisposable.default();
    const registerExecutor = (0, _AtomServiceContainer.getConsoleRegisterExecutor)();

    if (registerExecutor == null) {
      return;
    }

    const emitter = new _atom.Emitter();
    const SCOPE_CHANGED = "SCOPE_CHANGED";
    const viewModel = this._viewModel;

    const evaluateExpression = this._evaluateExpression.bind(this);

    const executor = {
      id: "debugger",
      name: "Debugger",
      scopeName: () => {
        if (viewModel.focusedProcess != null && viewModel.focusedProcess.configuration.grammarName != null) {
          return viewModel.focusedProcess.configuration.grammarName;
        }

        return "text.plain";
      },

      onDidChangeScopeName(callback) {
        return emitter.on(SCOPE_CHANGED, callback);
      },

      send(expression) {
        evaluateExpression(new _DebuggerModel.Expression(expression), "log");
      },

      output: this._consoleOutput
    };

    this._consoleDisposables.add(emitter, this._viewModel.onDidChangeDebuggerFocus(() => {
      emitter.emit(SCOPE_CHANGED);
    }));

    this._consoleDisposables.add(registerExecutor(executor));
  }

  dispose() {
    this._disposables.dispose();

    this._consoleDisposables.dispose();

    this._sessionEndDisposables.dispose();
  }

}

exports.default = DebugService;

class DebugSourceTextBufffer extends _atom.TextBuffer {
  constructor(contents, uri) {
    super(contents);
    this._uri = void 0;
    this._uri = uri;
  }

  getUri() {
    return this._uri;
  }

  getPath() {
    return this._uri;
  }

  isModified() {
    return false;
  }

}

module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnU2VydmljZS5qcyJdLCJuYW1lcyI6WyJDT05TT0xFX1ZJRVdfVVJJIiwiQ1VTVE9NX0RFQlVHX0VWRU5UIiwiQ0hBTkdFX0RFQlVHX01PREUiLCJTVEFSVF9ERUJVR19TRVNTSU9OIiwiQUNUSVZFX1RIUkVBRF9DSEFOR0VEIiwiREVCVUdHRVJfRk9DVVNfQ0hBTkdFRCIsIkNIQU5HRV9FWFBSRVNTSU9OX0NPTlRFWFQiLCJNQVhfQlJFQUtQT0lOVF9FVkVOVF9ERUxBWV9NUyIsIlZpZXdNb2RlbCIsImNvbnN0cnVjdG9yIiwiX2ZvY3VzZWRQcm9jZXNzIiwiX2ZvY3VzZWRUaHJlYWQiLCJfZm9jdXNlZFN0YWNrRnJhbWUiLCJfZW1pdHRlciIsIkVtaXR0ZXIiLCJmb2N1c2VkUHJvY2VzcyIsImZvY3VzZWRUaHJlYWQiLCJmb2N1c2VkU3RhY2tGcmFtZSIsIm9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cyIsImNhbGxiYWNrIiwib24iLCJvbkRpZENoYW5nZUV4cHJlc3Npb25Db250ZXh0IiwiX2Nob29zZUZvY3VzVGhyZWFkIiwicHJvY2VzcyIsInRocmVhZHMiLCJnZXRBbGxUaHJlYWRzIiwiaWQiLCJnZXRJZCIsImN1cnJlbnRGb2N1c2VkVGhyZWFkIiwiZmlsdGVyIiwidCIsInN0b3BwZWQiLCJsZW5ndGgiLCJzdG9wcGVkVGhyZWFkcyIsIl9jaG9vc2VGb2N1c1N0YWNrRnJhbWUiLCJ0aHJlYWQiLCJjdXJyZW50Rm9jdXNlZEZyYW1lIiwiZ2V0Q2FjaGVkQ2FsbFN0YWNrIiwiZmluZCIsImYiLCJnZXRDYWxsU3RhY2tUb3BGcmFtZSIsIl9zZXRGb2N1cyIsInN0YWNrRnJhbWUiLCJleHBsaWNpdCIsIm5ld1Byb2Nlc3MiLCJmb2N1c0NoYW5nZWQiLCJlbWl0IiwiZXZhbHVhdGVDb250ZXh0Q2hhbmdlZCIsInNldEZvY3VzZWRQcm9jZXNzIiwibmV3Rm9jdXNUaHJlYWQiLCJuZXdGb2N1c0ZyYW1lIiwic2V0Rm9jdXNlZFRocmVhZCIsInNldEZvY3VzZWRTdGFja0ZyYW1lIiwiZ2V0RGVidWdnZXJOYW1lIiwiYWRhcHRlclR5cGUiLCJEZWJ1Z1NlcnZpY2UiLCJzdGF0ZSIsIl9tb2RlbCIsIl9kaXNwb3NhYmxlcyIsIl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMiLCJfY29uc29sZURpc3Bvc2FibGVzIiwiX3ZpZXdNb2RlbCIsIl90aW1lciIsIl9icmVha3BvaW50c1RvU2VuZE9uU2F2ZSIsIl9jb25zb2xlT3V0cHV0IiwiX3J1bkluVGVybWluYWwiLCJhcmdzIiwidGVybWluYWxTZXJ2aWNlIiwiRXJyb3IiLCJfZ2V0Q3VycmVudFByb2Nlc3MiLCJ0YXJnZXRVcmkiLCJjb25maWd1cmF0aW9uIiwia2V5IiwiY2xvc2UiLCJ0aXRsZSIsImhvc3RuYW1lIiwibnVjbGlkZVVyaSIsImdldEhvc3RuYW1lT3B0IiwiY3dkIiwiY3JlYXRlUmVtb3RlVXJpIiwiaW5mbyIsImNvbW1hbmQiLCJmaWxlIiwic2xpY2UiLCJlbnZpcm9ubWVudFZhcmlhYmxlcyIsImVudiIsInVuZGVmaW5lZCIsInByZXNlcnZlZENvbW1hbmRzIiwicmVtYWluT25DbGVhbkV4aXQiLCJpY29uIiwiZGVmYXVsdExvY2F0aW9uIiwidGVybWluYWwiLCJvcGVuIiwic2V0UHJvY2Vzc0V4aXRDYWxsYmFjayIsInN0b3BQcm9jZXNzIiwiYWRkIiwidGVybWluYXRlUHJvY2VzcyIsInNwYXduIiwiY2IiLCJvblNwYXduIiwidGFrZSIsInRvUHJvbWlzZSIsIl9vblNlc3Npb25FbmQiLCJzZXNzaW9uIiwiQW5hbHl0aWNzRXZlbnRzIiwiREVCVUdHRVJfU1RPUCIsInJlbW92ZWRQcm9jZXNzZXMiLCJyZW1vdmVQcm9jZXNzIiwiZm9yRWFjaCIsInNldFN0b3BQZW5kaW5nIiwiX29uRGVidWdnZXJNb2RlQ2hhbmdlZCIsIkRlYnVnZ2VyTW9kZSIsIlNUT1BQSU5HIiwiZGlzY29ubmVjdCIsImdldFByb2Nlc3NlcyIsImRpc3Bvc2UiLCJhbGxQcm9jZXNzZXMiLCJwcm9jZXNzVG9Gb2N1cyIsInAiLCJzb21lIiwiU1RPUFBFRCIsImNyZWF0ZUNvbnNvbGUiLCJuYW1lIiwiY29uc29sZUFwaSIsImFwcGVuZCIsInRleHQiLCJwcm9jZXNzTmFtZSIsImxldmVsIiwib25TdWNjZXNzIiwiVW5pdmVyc2FsRGlzcG9zYWJsZSIsIlNldCIsIlN1YmplY3QiLCJNb2RlbCIsIl9sb2FkQnJlYWtwb2ludHMiLCJfbG9hZEZ1bmN0aW9uQnJlYWtwb2ludHMiLCJfbG9hZEV4Y2VwdGlvbkJyZWFrcG9pbnRzIiwiX2xvYWRXYXRjaEV4cHJlc3Npb25zIiwiX3JlZ2lzdGVyTGlzdGVuZXJzIiwidmlld01vZGVsIiwiZ2V0RGVidWdnZXJNb2RlIiwiZGVidWdnZXJNb2RlIiwiYXRvbSIsIndvcmtzcGFjZSIsImFkZE9wZW5lciIsInVyaSIsInN0YXJ0c1dpdGgiLCJERUJVR19TT1VSQ0VTX1VSSSIsIl9vcGVuU291cmNlVmlldyIsInF1ZXJ5IiwidXJsIiwicGFyc2UiLCJwYXRoIiwic3BsaXQiLCJzZXNzaW9uSWQiLCJzb3VyY2VSZWZlcmVuY2VSYXciLCJzb3VyY2VSZWZlcmVuY2UiLCJwYXJzZUludCIsInNvdXJjZSIsImdldFNvdXJjZSIsImNvbnRlbnQiLCJyZXNwb25zZSIsInJhdyIsImJvZHkiLCJlcnJvciIsIl9zb3VyY2VJc05vdEF2YWlsYWJsZSIsImVkaXRvciIsImJ1aWxkVGV4dEVkaXRvciIsImJ1ZmZlciIsIkRlYnVnU291cmNlVGV4dEJ1ZmZmZXIiLCJhdXRvSGVpZ2h0IiwicmVhZE9ubHkiLCJzZXJpYWxpemUiLCJzZXRHcmFtbWFyIiwiZ3JhbW1hcnMiLCJzZWxlY3RHcmFtbWFyIiwidGV4dEVkaXRvckJhbm5lciIsIlRleHRFZGl0b3JCYW5uZXIiLCJyZW5kZXIiLCJiaW5kIiwiYWRkVW50aWxEZXN0cm95ZWQiLCJfdHJ5VG9BdXRvRm9jdXNTdGFja0ZyYW1lIiwiY2FsbFN0YWNrIiwiaW5jbHVkZXMiLCJzdGFja0ZyYW1lVG9Gb2N1cyIsInNmIiwiYXZhaWxhYmxlIiwiX3JlZ2lzdGVyTWFya2VycyIsInNlbGVjdGVkRnJhbWVNYXJrZXIiLCJ0aHJlYWRDaGFuZ2VEYXRhdGlwIiwibGFzdEZvY3VzZWRUaHJlYWRJZCIsImxhc3RGb2N1c2VkUHJvY2VzcyIsImNsZWF1cE1hcmtlcnMiLCJkZXN0cm95IiwiY29uY2F0TWFwIiwiZXZlbnQiLCJQQVVTRUQiLCJub3RpZmljYXRpb25zIiwiYWRkV2FybmluZyIsIk9ic2VydmFibGUiLCJlbXB0eSIsImZyb21Qcm9taXNlIiwib3BlbkluRWRpdG9yIiwic3dpdGNoTWFwIiwiZXJyb3JNc2ciLCJhZGRFcnJvciIsIm9mIiwic3Vic2NyaWJlIiwibGluZSIsInJhbmdlIiwic3RhcnQiLCJyb3ciLCJtYXJrQnVmZmVyUmFuZ2UiLCJJbmZpbml0eSIsImludmFsaWRhdGUiLCJkZWNvcmF0ZU1hcmtlciIsInR5cGUiLCJjbGFzcyIsImRhdGF0aXBTZXJ2aWNlIiwic2V0RXhjZXB0aW9uQnJlYWtwb2ludHMiLCJjYXBhYmlsaXRpZXMiLCJleGNlcHRpb25CcmVha3BvaW50RmlsdGVycyIsInRocmVhZElkIiwibWVzc2FnZSIsIm5ld0ZvY3VzZWRQcm9jZXNzIiwiY3JlYXRlUGlubmVkRGF0YVRpcCIsImNvbXBvbmVudCIsInBpbm5hYmxlIiwiX3JlZ2lzdGVyU2Vzc2lvbkxpc3RlbmVycyIsInRocmVhZEZldGNoZXIiLCJyYXdVcGRhdGUiLCJvcGVuRmlsZXNTYXZlZCIsIm9ic2VydmVUZXh0RWRpdG9ycyIsImZsYXRNYXAiLCJvbkRpZFNhdmUiLCJtYXAiLCJnZXRQYXRoIiwidGFrZVVudGlsIiwib25EaWREZXN0cm95IiwiZmlsZVBhdGgiLCJoYXMiLCJkZWxldGUiLCJfc2VuZEJyZWFrcG9pbnRzIiwib2JzZXJ2ZUluaXRpYWxpemVFdmVudHMiLCJzZW5kQ29uZmlndXJhdGlvbkRvbmUiLCJnZXRDYXBhYmlsaXRpZXMiLCJzdXBwb3J0c0NvbmZpZ3VyYXRpb25Eb25lUmVxdWVzdCIsImNvbmZpZ3VyYXRpb25Eb25lIiwidGhlbiIsIl8iLCJSVU5OSU5HIiwiY2F0Y2giLCJlIiwib25VbmV4cGVjdGVkRXJyb3IiLCJkZXRhaWwiLCJfc2VuZEFsbEJyZWFrcG9pbnRzIiwidG9Gb2N1c1RocmVhZHMiLCJvYnNlcnZlQ29udGludWVkVG8iLCJvYnNlcnZlQ29udGludWVkRXZlbnRzIiwiY29udGludWVkIiwiYWxsVGhyZWFkc0NvbnRpbnVlZCIsIm9ic2VydmVTdG9wRXZlbnRzIiwib2JzZXJ2ZUV2YWx1YXRpb25zIiwiaWdub3JlRWxlbWVudHMiLCJjb25jYXQiLCJzdG9wcGVkRGV0YWlscyIsImdldFRocmVhZCIsIm5leHQiLCJwcmVzZXJ2ZUZvY3VzSGludCIsInRoaXNUaHJlYWRJc0ZvY3VzZWQiLCJyZWZyZXNoQ2FsbFN0YWNrIiwiX3NjaGVkdWxlTmF0aXZlTm90aWZpY2F0aW9uIiwib2JzZXJ2ZVRocmVhZEV2ZW50cyIsInJlYXNvbiIsImNsZWFyVGhyZWFkcyIsIm9ic2VydmVUZXJtaW5hdGVEZWJ1Z2VlRXZlbnRzIiwicmVzdGFydCIsInJlc3RhcnRQcm9jZXNzIiwiZXJyIiwic3RhY2siLCJTdHJpbmciLCJvdXRwdXRFdmVudHMiLCJvYnNlcnZlT3V0cHV0RXZlbnRzIiwib3V0cHV0Iiwic2hhcmUiLCJub3RpZmljYXRpb25TdHJlYW0iLCJjYXRlZ29yeSIsImRhdGEiLCJudWNsaWRlVHJhY2tTdHJlYW0iLCJDQVRFR09SSUVTX01BUCIsIk1hcCIsIklHTk9SRURfQ0FURUdPUklFUyIsImxvZ1N0cmVhbSIsInZhcmlhYmxlc1JlZmVyZW5jZSIsImdldCIsIm9iamVjdFN0cmVhbSIsImxhc3RFbnRyeVRva2VuIiwiaGFuZGxlTWVzc2FnZSIsImNvbXBsZXRlIiwiZW5kc1dpdGgiLCJzYW1lTGV2ZWwiLCJnZXRDdXJyZW50TGV2ZWwiLCJhcHBlbmRUZXh0Iiwic2V0Q29tcGxldGUiLCJpbmNvbXBsZXRlIiwiY29udGFpbmVyIiwiRXhwcmVzc2lvbkNvbnRhaW5lciIsInV1aWQiLCJ2NCIsImdldENoaWxkcmVuIiwiY2hpbGRyZW4iLCJleHByZXNzaW9ucyIsIm9ic2VydmVCcmVha3BvaW50RXZlbnRzIiwiYnJlYWtwb2ludCIsIkJyZWFrcG9pbnRFdmVudFJlYXNvbnMiLCJDSEFOR0VEIiwiUkVNT1ZFRCIsInNvdXJjZUJyZWFrcG9pbnQiLCJmdW5jdGlvbkJyZWFrcG9pbnQiLCJvbkRpZENoYW5nZUJyZWFrcG9pbnRzIiwic3RhcnRXaXRoIiwiZ2V0QnJlYWtwb2ludHMiLCJiIiwiaWRGcm9tQWRhcHRlciIsInBvcCIsImdldEZ1bmN0aW9uQnJlYWtwb2ludHMiLCJ0aW1lb3V0IiwiVGltZW91dEVycm9yIiwibG9nZ2VyIiwiTkVXIiwiYWRkVUlCcmVha3BvaW50cyIsImNvbHVtbiIsImVuYWJsZWQiLCJyZW1vdmVCcmVha3BvaW50cyIsInJlbW92ZUZ1bmN0aW9uQnJlYWtwb2ludHMiLCJ1cGRhdGVQcm9jZXNzQnJlYWtwb2ludHMiLCJ1cGRhdGVGdW5jdGlvbkJyZWFrcG9pbnRzIiwid2FybiIsIm9ic2VydmVBZGFwdGVyRXhpdGVkRXZlbnRzIiwib2JzZXJ2ZUN1c3RvbUV2ZW50cyIsInNvdXJjZVJlZkJyZWFrcG9pbnRzIiwiYnAiLCJyYWlzZU5hdGl2ZU5vdGlmaWNhdGlvbiIsInBlbmRpbmdOb3RpZmljYXRpb24iLCJvbkRpZENoYW5nZUFjdGl2ZVRocmVhZCIsIm9uRGlkU3RhcnREZWJ1Z1Nlc3Npb24iLCJvbkRpZEN1c3RvbUV2ZW50Iiwib25EaWRDaGFuZ2VQcm9jZXNzTW9kZSIsInJlc3VsdCIsInNvdXJjZUJyZWFrcG9pbnRzIiwib3JpZ2luYWxMaW5lIiwiY29uZGl0aW9uIiwidHJpbSIsImxvZ01lc3NhZ2UiLCJmdW5jdGlvbkJyZWFrcG9pbnRzIiwiZmIiLCJGdW5jdGlvbkJyZWFrcG9pbnQiLCJoaXRDb25kaXRpb24iLCJleGNlcHRpb25CcmVha3BvaW50cyIsImV4QnJlYWtwb2ludCIsIkV4Y2VwdGlvbkJyZWFrcG9pbnQiLCJsYWJlbCIsIndhdGNoRXhwcmVzc2lvbnMiLCJFeHByZXNzaW9uIiwibW9kZSIsImVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzIiwiZW5hYmxlIiwic2V0RW5hYmxlbWVudCIsIkJyZWFrcG9pbnQiLCJfc2VuZEZ1bmN0aW9uQnJlYWtwb2ludHMiLCJERUJVR0dFUl9UT0dHTEVfRVhDRVBUSU9OX0JSRUFLUE9JTlQiLCJfc2VuZEV4Y2VwdGlvbkJyZWFrcG9pbnRzIiwiZW5hYmxlT3JEaXNhYmxlQWxsQnJlYWtwb2ludHMiLCJ1aUJyZWFrcG9pbnRzIiwiREVCVUdHRVJfQlJFQUtQT0lOVF9BREQiLCJ1cmlzIiwicHJvbWlzZXMiLCJwdXNoIiwiUHJvbWlzZSIsImFsbCIsImFkZFNvdXJjZUJyZWFrcG9pbnQiLCJERUJVR0dFUl9CUkVBS1BPSU5UX1NJTkdMRV9BREQiLCJleGlzdGluZyIsImdldEJyZWFrcG9pbnRBdExpbmUiLCJyZXNvbHZlIiwidG9nZ2xlU291cmNlQnJlYWtwb2ludCIsIkRFQlVHR0VSX0JSRUFLUE9JTlRfVE9HR0xFIiwidXBkYXRlQnJlYWtwb2ludHMiLCJ1cmlzVG9TZW5kIiwic2tpcEFuYWx5dGljcyIsInRvUmVtb3ZlIiwidXJpc1RvQ2xlYXIiLCJERUJVR0dFUl9CUkVBS1BPSU5UX0RFTEVURV9BTEwiLCJERUJVR0dFUl9CUkVBS1BPSU5UX0RFTEVURSIsInNldEJyZWFrcG9pbnRzQWN0aXZhdGVkIiwiYWN0aXZhdGVkIiwiYWRkRnVuY3Rpb25CcmVha3BvaW50IiwicmVuYW1lRnVuY3Rpb25CcmVha3BvaW50IiwibmV3RnVuY3Rpb25OYW1lIiwidGVybWluYXRlVGhyZWFkcyIsInRocmVhZElkcyIsIkRFQlVHR0VSX1RFUk1JTkFURV9USFJFQUQiLCJCb29sZWFuIiwic3VwcG9ydHNUZXJtaW5hdGVUaHJlYWRzUmVxdWVzdCIsImN1c3RvbSIsInJ1blRvTG9jYXRpb24iLCJERUJVR0dFUl9TVEVQX1JVTl9UT19MT0NBVElPTiIsInN1cHBvcnRzQ29udGludWVUb0xvY2F0aW9uIiwicnVuVG9Mb2NhdGlvbkJyZWFrcG9pbnQiLCJyZW1vdmVCcmVha3BvaW50IiwicmVtb3ZlQnJlYWtwb2ludERpc3Bvc2FibGUiLCJyZW1vdmUiLCJjb250aW51ZSIsImFkZFdhdGNoRXhwcmVzc2lvbiIsIkRFQlVHR0VSX1dBVENIX0FERF9FWFBSRVNTSU9OIiwicmVuYW1lV2F0Y2hFeHByZXNzaW9uIiwibmV3TmFtZSIsIkRFQlVHR0VSX1dBVENIX1VQREFURV9FWFBSRVNTSU9OIiwicmVtb3ZlV2F0Y2hFeHByZXNzaW9ucyIsIkRFQlVHR0VSX1dBVENIX1JFTU9WRV9FWFBSRVNTSU9OIiwiY3JlYXRlRXhwcmVzc2lvbiIsInJhd0V4cHJlc3Npb24iLCJfZG9DcmVhdGVQcm9jZXNzIiwicmF3Q29uZmlndXJhdGlvbiIsImVycm9ySGFuZGxlciIsIm9uRXJyb3IiLCJERUJVR0dFUl9TVEFSVF9GQUlMIiwiZXJyb3JNZXNzYWdlIiwiaXNEaXNjb25uZWN0ZWQiLCJhZGFwdGVyRXhlY3V0YWJsZSIsIl9yZXNvbHZlQWRhcHRlckV4ZWN1dGFibGUiLCJvbkRlYnVnU3RhcnRpbmdDYWxsYmFjayIsIm9uRGVidWdTdGFydGVkQ2FsbGJhY2siLCJvbkRlYnVnUnVubmluZ0NhbGxiYWNrIiwiREVCVUdHRVJfU1RBUlQiLCJzZXJ2aWNlTmFtZSIsImNsaWVudFR5cGUiLCJzZXNzaW9uVGVhcmRvd25EaXNwb3NhYmxlcyIsImluc3RhbmNlSW50ZXJmYWNlIiwibmV3U2Vzc2lvbiIsIk9iamVjdCIsImZyZWV6ZSIsImN1c3RvbVJlcXVlc3QiLCJyZXF1ZXN0IiwiY3JlYXRlSW5pdGlhbGl6ZVNlc3Npb24iLCJjb25maWciLCJfY3JlYXRlVnNEZWJ1Z1Nlc3Npb24iLCJfcmVnaXN0ZXJDb25zb2xlRXhlY3V0b3IiLCJhZGRQcm9jZXNzIiwiU1RBUlRJTkciLCJjb21tYW5kcyIsImRpc3BhdGNoIiwidmlld3MiLCJnZXRWaWV3IiwiaW5pdGlhbGl6ZSIsImNsaWVudElEIiwiYWRhcHRlcklEIiwicGF0aEZvcm1hdCIsImxpbmVzU3RhcnRBdDEiLCJjb2x1bW5zU3RhcnRBdDEiLCJzdXBwb3J0c1ZhcmlhYmxlVHlwZSIsInN1cHBvcnRzVmFyaWFibGVQYWdpbmciLCJzdXBwb3J0c1J1bkluVGVybWluYWxSZXF1ZXN0IiwibG9jYWxlIiwidGVhcmRvd24iLCJzZXRSdW5uaW5nU3RhdGUiLCJjbGVhclByb2Nlc3NTdGFydGluZ0ZsYWciLCJfbGF1bmNoT3JBdHRhY2hUYXJnZXQiLCJkZWJ1Z01vZGUiLCJvcyIsInBsYXRmb3JtIiwiaXNSZW1vdGUiLCJvbkRpZENoYW5nZVByb2Nlc3NlcyIsImdldE1vZGVsIiwiZ2V0QWRhcHRlckV4ZWN1dGFibGVJbmZvIiwic2VydmljZSIsInNwYXduZXIiLCJjcmVhdGVWc1Jhd0FkYXB0ZXJTcGF3bmVyU2VydmljZSIsImNsaWVudFByZXByb2Nlc3NvcnMiLCJhZGFwdGVyUHJlcHJvY2Vzc29ycyIsImNsaWVudFByZXByb2Nlc3NvciIsImFkYXB0ZXJQcmVwcm9jZXNzb3IiLCJWc0RlYnVnU2Vzc2lvbiIsImFkYXB0ZXIiLCJob3N0IiwiaXNSZWFkT25seSIsImF0dGFjaCIsImxhdW5jaCIsInNvdXJjZUlzTm90QXZhaWxhYmxlIiwiY2FuUmVzdGFydFByb2Nlc3MiLCJpc1Jlc3RhcnRhYmxlIiwic3VwcG9ydHNSZXN0YXJ0UmVxdWVzdCIsInN0YXJ0RGVidWdnaW5nIiwic2VhcmNoQWxsUGFuZXMiLCJkZWJ1Z2dlclR5cGVzIiwiREVCVUdHRVJfTVVMVElUQVJHRVQiLCJwcm9jZXNzZXNDb3VudCIsInNvdXJjZU1vZGlmaWVkIiwiX2dldEN1cnJlbnRTZXNzaW9uIiwiaXNSZWFkeUZvckJyZWFrcG9pbnRzIiwiYnJlYWtwb2ludHNUb1NlbmQiLCJnZXRVSUJyZWFrcG9pbnRzIiwiYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQiLCJyYXdTb3VyY2UiLCJiYXNlbmFtZSIsImFkYXB0ZXJEYXRhIiwic2V0QnJlYWtwb2ludHMiLCJsaW5lcyIsImJyZWFrcG9pbnRzIiwiYnBUb1NlbmQiLCJpIiwiYnBJZCIsInN1cHBvcnRzRnVuY3Rpb25CcmVha3BvaW50cyIsImZicCIsInNldEZ1bmN0aW9uQnJlYWtwb2ludHMiLCJnZXRFeGNlcHRpb25CcmVha3BvaW50cyIsImVuYWJsZWRFeGNlcHRpb25CcHMiLCJleGIiLCJmaWx0ZXJzIiwiX2V2YWx1YXRlRXhwcmVzc2lvbiIsImV4cHJlc3Npb24iLCJzdWJzY3JpcHRpb24iLCJza2lwIiwiaXNFcnJvciIsImlzUGVuZGluZyIsImdldFZhbHVlIiwiaGFzQ2hpbGRyZW4iLCJyZWdpc3RlckV4ZWN1dG9yIiwiZW1pdHRlciIsIlNDT1BFX0NIQU5HRUQiLCJldmFsdWF0ZUV4cHJlc3Npb24iLCJleGVjdXRvciIsInNjb3BlTmFtZSIsImdyYW1tYXJOYW1lIiwib25EaWRDaGFuZ2VTY29wZU5hbWUiLCJzZW5kIiwiVGV4dEJ1ZmZlciIsImNvbnRlbnRzIiwiX3VyaSIsImdldFVyaSIsImlzTW9kaWZpZWQiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFtREE7O0FBQ0E7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBTUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBUUE7O0FBQ0E7O0FBU0E7O0FBQ0E7O0FBQ0E7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBbEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBeUVBLE1BQU1BLGdCQUFnQixHQUFHLHdCQUF6QjtBQUVBLE1BQU1DLGtCQUFrQixHQUFHLG9CQUEzQjtBQUNBLE1BQU1DLGlCQUFpQixHQUFHLG1CQUExQjtBQUNBLE1BQU1DLG1CQUFtQixHQUFHLHFCQUE1QjtBQUNBLE1BQU1DLHFCQUFxQixHQUFHLHVCQUE5QjtBQUVBLE1BQU1DLHNCQUFzQixHQUFHLHdCQUEvQjtBQUNBLE1BQU1DLHlCQUF5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S3BkLG1CQUFMLENBQXlCbUMsR0FBekIsQ0FBNkIrYSxnQkFBZ0IsQ0FBQ0ksUUFBRCxDQUE3QztBQUNEOztBQUVEL1osRUFBQUEsT0FBTyxHQUFTO0FBQ2QsU0FBS3pELFlBQUwsQ0FBa0J5RCxPQUFsQjs7QUFDQSxTQUFLdkQsbUJBQUwsQ0FBeUJ1RCxPQUF6Qjs7QUFDQSxTQUFLeEQsc0JBQUwsQ0FBNEJ3RCxPQUE1QjtBQUNEOztBQWpoRHdEOzs7O0FBb2hEM0QsTUFBTXFELHNCQUFOLFNBQXFDK1csZ0JBQXJDLENBQWdEO0FBRzlDOWdCLEVBQUFBLFdBQVcsQ0FBQytnQixRQUFELEVBQW1CeFksR0FBbkIsRUFBZ0M7QUFDekMsVUFBTXdZLFFBQU47QUFEeUMsU0FGM0NDLElBRTJDO0FBRXpDLFNBQUtBLElBQUwsR0FBWXpZLEdBQVo7QUFDRDs7QUFFRDBZLEVBQUFBLE1BQU0sR0FBRztBQUNQLFdBQU8sS0FBS0QsSUFBWjtBQUNEOztBQUVEOVMsRUFBQUEsT0FBTyxHQUFHO0FBQ1IsV0FBTyxLQUFLOFMsSUFBWjtBQUNEOztBQUVERSxFQUFBQSxVQUFVLEdBQUc7QUFDWCxXQUFPLEtBQVA7QUFDRDs7QUFsQjZDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcblRoZSBmb2xsb3dpbmcgZGVidWcgc2VydmljZSBpbXBsZW1lbnRhdGlvbiB3YXMgcG9ydGVkIGZyb20gVlNDb2RlJ3MgZGVidWdnZXIgaW1wbGVtZW50YXRpb25cclxuaW4gaHR0cHM6Ly9naXRodWIuY29tL01pY3Jvc29mdC92c2NvZGUvdHJlZS9tYXN0ZXIvc3JjL3ZzL3dvcmtiZW5jaC9wYXJ0cy9kZWJ1Z1xyXG5cclxuTUlUIExpY2Vuc2VcclxuXHJcbkNvcHlyaWdodCAoYykgMjAxNSAtIHByZXNlbnQgTWljcm9zb2Z0IENvcnBvcmF0aW9uXHJcblxyXG5BbGwgcmlnaHRzIHJlc2VydmVkLlxyXG5cclxuUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxyXG5vZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXHJcbmluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcclxudG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxyXG5jb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcclxuZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcclxuXHJcblRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbFxyXG5jb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxyXG5cclxuVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxyXG5JTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcclxuRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXHJcbkFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcclxuTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcclxuT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEVcclxuU09GVFdBUkUuXHJcbiovXHJcblxyXG5pbXBvcnQgdHlwZSB7IENvbnNvbGVNZXNzYWdlIH0gZnJvbSBcImF0b20taWRlLXVpXCJcclxuaW1wb3J0IHR5cGUgeyBSZWNvcmRUb2tlbiwgTGV2ZWwgfSBmcm9tIFwiLi4vLi4vLi4vYXRvbS1pZGUtY29uc29sZS9saWIvdHlwZXNcIlxyXG5pbXBvcnQgdHlwZSB7IFRlcm1pbmFsSW5mbywgVGVybWluYWxJbnN0YW5jZSB9IGZyb20gXCIuLi8uLi8uLi9hdG9tLWlkZS10ZXJtaW5hbC9saWIvdHlwZXNcIlxyXG5pbXBvcnQgdHlwZSB7XHJcbiAgRGVidWdnZXJNb2RlVHlwZSxcclxuICBJRGVidWdTZXJ2aWNlLFxyXG4gIElNb2RlbCxcclxuICBJVmlld01vZGVsLFxyXG4gIElQcm9jZXNzLFxyXG4gIElUaHJlYWQsXHJcbiAgSUVuYWJsZWFibGUsXHJcbiAgSUV2YWx1YXRhYmxlRXhwcmVzc2lvbixcclxuICBJVUlCcmVha3BvaW50LFxyXG4gIElTdGFja0ZyYW1lLFxyXG4gIFNlcmlhbGl6ZWRTdGF0ZSxcclxufSBmcm9tIFwiLi4vdHlwZXNcIlxyXG5pbXBvcnQgdHlwZSB7XHJcbiAgSVByb2Nlc3NDb25maWcsXHJcbiAgTWVzc2FnZVByb2Nlc3NvcixcclxuICBWU0FkYXB0ZXJFeGVjdXRhYmxlSW5mbyxcclxufSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWRlYnVnZ2VyLWNvbW1vblwiXHJcbmltcG9ydCB0eXBlIHsgVGltaW5nVHJhY2tlciB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9hbmFseXRpY3NcIlxyXG5pbXBvcnQgKiBhcyBEZWJ1Z1Byb3RvY29sIGZyb20gXCJ2c2NvZGUtZGVidWdwcm90b2NvbFwiXHJcbmltcG9ydCAqIGFzIFJlYWN0IGZyb20gXCJyZWFjdFwiXHJcblxyXG5pbXBvcnQgaW52YXJpYW50IGZyb20gXCJhc3NlcnRcIlxyXG5pbXBvcnQgeyBJY29uIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0ljb25cIlxyXG5pbXBvcnQgbnVjbGlkZVVyaSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvbnVjbGlkZVVyaVwiXHJcbmltcG9ydCB7IG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24gfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvZXZlbnRcIlxyXG5pbXBvcnQgeyBzbGVlcCwgc2VyaWFsaXplQXN5bmNDYWxsIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL3Byb21pc2VcIlxyXG5pbXBvcnQge1xyXG4gIFZzRGVidWdTZXNzaW9uLFxyXG4gIGxvY2FsVG9SZW1vdGVQcm9jZXNzb3IsXHJcbiAgcmVtb3RlVG9Mb2NhbFByb2Nlc3NvcixcclxuICBnZXRWU0NvZGVEZWJ1Z2dlckFkYXB0ZXJTZXJ2aWNlQnlOdWNsaWRlVXJpLFxyXG59IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtZGVidWdnZXItY29tbW9uXCJcclxuaW1wb3J0IHsgT2JzZXJ2YWJsZSwgU3ViamVjdCwgVGltZW91dEVycm9yIH0gZnJvbSBcInJ4anMtY29tcGF0L2J1bmRsZXMvcnhqcy1jb21wYXQudW1kLm1pbi5qc1wiXHJcbmltcG9ydCB7IFRleHRFZGl0b3JCYW5uZXIgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvVGV4dEVkaXRvckJhbm5lclwiXHJcbmltcG9ydCBSZWFkT25seU5vdGljZSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvUmVhZE9ubHlOb3RpY2VcIlxyXG5pbXBvcnQgeyB0cmFjaywgc3RhcnRUcmFja2luZyB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9hbmFseXRpY3NcIlxyXG5pbXBvcnQgbnVsbHRocm93cyBmcm9tIFwibnVsbHRocm93c1wiXHJcbmltcG9ydCB7XHJcbiAgZ2V0Q29uc29sZVJlZ2lzdGVyRXhlY3V0b3IsXHJcbiAgZ2V0Q29uc29sZVNlcnZpY2UsXHJcbiAgZ2V0Tm90aWZpY2F0aW9uU2VydmljZSxcclxuICBnZXREYXRhdGlwU2VydmljZSxcclxuICBnZXRUZXJtaW5hbFNlcnZpY2UsXHJcbiAgcmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbixcclxufSBmcm9tIFwiLi4vQXRvbVNlcnZpY2VDb250YWluZXJcIlxyXG5pbXBvcnQgeyBldmFsdWF0ZUV4cHJlc3Npb25Bc1N0cmVhbSwgY2FwaXRhbGl6ZSB9IGZyb20gXCIuLi91dGlsc1wiXHJcbmltcG9ydCB7XHJcbiAgTW9kZWwsXHJcbiAgRXhjZXB0aW9uQnJlYWtwb2ludCxcclxuICBGdW5jdGlvbkJyZWFrcG9pbnQsXHJcbiAgQnJlYWtwb2ludCxcclxuICBFeHByZXNzaW9uLFxyXG4gIFByb2Nlc3MsXHJcbiAgRXhwcmVzc2lvbkNvbnRhaW5lcixcclxufSBmcm9tIFwiLi9EZWJ1Z2dlck1vZGVsXCJcclxuaW1wb3J0IFVuaXZlcnNhbERpc3Bvc2FibGUgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL1VuaXZlcnNhbERpc3Bvc2FibGVcIlxyXG5pbXBvcnQgeyBFbWl0dGVyLCBUZXh0QnVmZmVyIH0gZnJvbSBcImF0b21cIlxyXG5pbXBvcnQgeyBkaXN0aW5jdCwgbWFwRnJvbU9iamVjdCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9jb2xsZWN0aW9uXCJcclxuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tIFwiLi4vdXRpbHNcIlxyXG5pbXBvcnQgdXVpZCBmcm9tIFwidXVpZFwiXHJcbmltcG9ydCB7IEJyZWFrcG9pbnRFdmVudFJlYXNvbnMsIERlYnVnZ2VyTW9kZSwgQW5hbHl0aWNzRXZlbnRzLCBERUJVR19TT1VSQ0VTX1VSSSB9IGZyb20gXCIuLi9jb25zdGFudHNcIlxyXG5pbXBvcnQgbG9nZ2VyIGZyb20gXCIuLi9sb2dnZXJcIlxyXG5pbXBvcnQgc3RyaXBBbnNpIGZyb20gXCJzdHJpcC1hbnNpXCJcclxuaW1wb3J0IHVybCBmcm9tIFwidXJsXCJcclxuaW1wb3J0IG9zIGZyb20gXCJvc1wiXHJcbmltcG9ydCBpZHggZnJvbSBcImlkeFwiXHJcblxyXG5jb25zdCBDT05TT0xFX1ZJRVdfVVJJID0gXCJhdG9tOi8vbnVjbGlkZS9jb25zb2xlXCJcclxuXHJcbmNvbnN0IENVU1RPTV9ERUJVR19FVkVOVCA9IFwiQ1VTVE9NX0RFQlVHX0VWRU5UXCJcclxuY29uc3QgQ0hBTkdFX0RFQlVHX01PREUgPSBcIkNIQU5HRV9ERUJVR19NT0RFXCJcclxuY29uc3QgU1RBUlRfREVCVUdfU0VTU0lPTiA9IFwiU1RBUlRfREVCVUdfU0VTU0lPTlwiXHJcbmNvbnN0IEFDVElWRV9USFJFQURfQ0hBTkdFRCA9IFwiQUNUSVZFX1RIUkVBRF9DSEFOR0VEXCJcclxuXHJcbmNvbnN0IERFQlVHR0VSX0ZPQ1VTX0NIQU5HRUQgPSBcIkRFQlVHR0VSX0ZPQ1VTX0NIQU5HRURcIlxyXG5jb25zdCBDSEFOR0VfRVhQUkVTU0lPTl9DT05URVhUID0gXCJDSEFOR0VfRVhQUkVTU0lPTl9DT05URVhUXCJcclxuXHJcbi8vIEJlcmFrcG9pbnQgZXZlbnRzIG1heSBhcnJpdmUgc29vbmVyIHRoYW4gYnJlYWtwb2ludCByZXNwb25zZXMuXHJcbmNvbnN0IE1BWF9CUkVBS1BPSU5UX0VWRU5UX0RFTEFZX01TID0gNSAqIDEwMDBcclxuXHJcbmNsYXNzIFZpZXdNb2RlbCBpbXBsZW1lbnRzIElWaWV3TW9kZWwge1xyXG4gIF9mb2N1c2VkUHJvY2VzczogP0lQcm9jZXNzXHJcbiAgX2ZvY3VzZWRUaHJlYWQ6ID9JVGhyZWFkXHJcbiAgX2ZvY3VzZWRTdGFja0ZyYW1lOiA/SVN0YWNrRnJhbWVcclxuICBfZW1pdHRlcjogRW1pdHRlclxyXG5cclxuICBjb25zdHJ1Y3RvcigpIHtcclxuICAgIHRoaXMuX2ZvY3VzZWRQcm9jZXNzID0gbnVsbFxyXG4gICAgdGhpcy5fZm9jdXNlZFRocmVhZCA9IG51bGxcclxuICAgIHRoaXMuX2ZvY3VzZWRTdGFja0ZyYW1lID0gbnVsbFxyXG4gICAgdGhpcy5fZW1pdHRlciA9IG5ldyBFbWl0dGVyKClcclxuICB9XHJcblxyXG4gIGdldCBmb2N1c2VkUHJvY2VzcygpOiA/SVByb2Nlc3Mge1xyXG4gICAgcmV0dXJuIHRoaXMuX2ZvY3VzZWRQcm9jZXNzXHJcbiAgfVxyXG5cclxuICBnZXQgZm9jdXNlZFRocmVhZCgpOiA/SVRocmVhZCB7XHJcbiAgICByZXR1cm4gdGhpcy5fZm9jdXNlZFRocmVhZFxyXG4gIH1cclxuXHJcbiAgZ2V0IGZvY3VzZWRTdGFja0ZyYW1lKCk6ID9JU3RhY2tGcmFtZSB7XHJcbiAgICByZXR1cm4gdGhpcy5fZm9jdXNlZFN0YWNrRnJhbWVcclxuICB9XHJcblxyXG4gIG9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cyhjYWxsYmFjazogKGRhdGE6IHsgZXhwbGljaXQ6IGJvb2xlYW4gfSkgPT4gbWl4ZWQpOiBJRGlzcG9zYWJsZSB7XHJcbiAgICByZXR1cm4gdGhpcy5fZW1pdHRlci5vbihERUJVR0dFUl9GT0NVU19DSEFOR0VELCBjYWxsYmFjaylcclxuICB9XHJcblxyXG4gIG9uRGlkQ2hhbmdlRXhwcmVzc2lvbkNvbnRleHQoY2FsbGJhY2s6IChkYXRhOiB7IGV4cGxpY2l0OiBib29sZWFuIH0pID0+IG1peGVkKTogSURpc3Bvc2FibGUge1xyXG4gICAgcmV0dXJuIHRoaXMuX2VtaXR0ZXIub24oQ0hBTkdFX0VYUFJFU1NJT05fQ09OVEVYVCwgY2FsbGJhY2spXHJcbiAgfVxyXG5cclxuICBfY2hvb3NlRm9jdXNUaHJlYWQocHJvY2VzczogSVByb2Nlc3MpOiA/SVRocmVhZCB7XHJcbiAgICBjb25zdCB0aHJlYWRzID0gcHJvY2Vzcy5nZXRBbGxUaHJlYWRzKClcclxuXHJcbiAgICAvLyBJZiB0aGUgY3VycmVudCBmb2N1c2VkIHRocmVhZCBpcyBpbiB0aGUgZm9jdXNlZCBwcm9jZXNzIGFuZCBpcyBzdG9wcGVkLFxyXG4gICAgLy8gbGVhdmUgdGhhdCB0aHJlYWQgZm9jdXNlZC4gT3RoZXJ3aXNlLCBjaG9vc2UgdGhlIGZpcnN0XHJcbiAgICAvLyBzdG9wcGVkIHRocmVhZCBpbiB0aGUgZm9jdXNlZCBwcm9jZXNzIGlmIHRoZXJlIGlzIG9uZSxcclxuICAgIC8vIGFuZCB0aGUgZmlyc3QgcnVubmluZyB0aHJlYWQgb3RoZXJ3aXNlLlxyXG4gICAgaWYgKHRoaXMuX2ZvY3VzZWRUaHJlYWQgIT0gbnVsbCkge1xyXG4gICAgICBjb25zdCBpZCA9IHRoaXMuX2ZvY3VzZWRUaHJlYWQuZ2V0SWQoKVxyXG4gICAgICBjb25zdCBjdXJyZW50Rm9jdXNlZFRocmVhZCA9IHRocmVhZHMuZmlsdGVyKCh0KSA9PiB0LmdldElkKCkgPT09IGlkICYmIHQuc3RvcHBlZClcclxuICAgICAgaWYgKGN1cnJlbnRGb2N1c2VkVGhyZWFkLmxlbmd0aCA+IDApIHtcclxuICAgICAgICByZXR1cm4gY3VycmVudEZvY3VzZWRUaHJlYWRbMF1cclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHN0b3BwZWRUaHJlYWRzID0gdGhyZWFkcy5maWx0ZXIoKHQpID0+IHQuc3RvcHBlZClcclxuICAgIHJldHVybiBzdG9wcGVkVGhyZWFkc1swXSB8fCB0aHJlYWRzWzBdXHJcbiAgfVxyXG5cclxuICBfY2hvb3NlRm9jdXNTdGFja0ZyYW1lKHRocmVhZDogP0lUaHJlYWQpOiA/SVN0YWNrRnJhbWUge1xyXG4gICAgaWYgKHRocmVhZCA9PSBudWxsKSB7XHJcbiAgICAgIHJldHVybiBudWxsXHJcbiAgICB9XHJcblxyXG4gICAgLy8gSWYgdGhlIGN1cnJlbnQgZm9jdXNlZCBzdGFjayBmcmFtZSBpcyBpbiB0aGUgY3VycmVudCBmb2N1c2VkIHRocmVhZCdzXHJcbiAgICAvLyBmcmFtZXMsIGxlYXZlIGl0IGFsb25lLiBPdGhlcndpc2UgcmV0dXJuIHRoZSB0b3Agc3RhY2sgZnJhbWUgaWYgdGhlXHJcbiAgICAvLyB0aHJlYWQgaXMgc3RvcHBlZCwgYW5kIG51bGwgaWYgaXQgaXMgcnVubmluZy5cclxuICAgIGNvbnN0IGN1cnJlbnRGb2N1c2VkRnJhbWUgPSB0aHJlYWQuZ2V0Q2FjaGVkQ2FsbFN0YWNrKCkuZmluZCgoZikgPT4gZiA9PT0gdGhpcy5fZm9jdXNlZFN0YWNrRnJhbWUpXHJcbiAgICByZXR1cm4gdGhyZWFkLnN0b3BwZWQgPyBjdXJyZW50Rm9jdXNlZEZyYW1lIHx8IHRocmVhZC5nZXRDYWxsU3RhY2tUb3BGcmFtZSgpIDogbnVsbFxyXG4gIH1cclxuXHJcbiAgX3NldEZvY3VzKHByb2Nlc3M6ID9JUHJvY2VzcywgdGhyZWFkOiA/SVRocmVhZCwgc3RhY2tGcmFtZTogP0lTdGFja0ZyYW1lLCBleHBsaWNpdDogYm9vbGVhbikge1xyXG4gICAgbGV0IG5ld1Byb2Nlc3MgPSBwcm9jZXNzXHJcblxyXG4gICAgLy8gSWYgd2UgaGF2ZSBhIGZvY3VzZWQgZnJhbWUsIHdlIG11c3QgaGF2ZSBhIGZvY3VzZWQgdGhyZWFkLlxyXG4gICAgaW52YXJpYW50KHN0YWNrRnJhbWUgPT0gbnVsbCB8fCB0aHJlYWQgPT09IHN0YWNrRnJhbWUudGhyZWFkKVxyXG5cclxuICAgIC8vIElmIHdlIGhhdmUgYSBmb2N1c2VkIHRocmVhZCwgd2UgbXVzdCBoYXZlIGEgZm9jdXNlZCBwcm9jZXNzLlxyXG4gICAgaW52YXJpYW50KHRocmVhZCA9PSBudWxsIHx8IHByb2Nlc3MgPT09IHRocmVhZC5wcm9jZXNzKVxyXG5cclxuICAgIGlmIChuZXdQcm9jZXNzID09IG51bGwpIHtcclxuICAgICAgaW52YXJpYW50KHRocmVhZCA9PSBudWxsICYmIHN0YWNrRnJhbWUgPT0gbnVsbClcclxuICAgICAgbmV3UHJvY2VzcyA9IHRoaXMuX2ZvY3VzZWRQcm9jZXNzXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZm9jdXNDaGFuZ2VkID1cclxuICAgICAgdGhpcy5fZm9jdXNlZFByb2Nlc3MgIT09IG5ld1Byb2Nlc3MgfHxcclxuICAgICAgdGhpcy5fZm9jdXNlZFRocmVhZCAhPT0gdGhyZWFkIHx8XHJcbiAgICAgIHRoaXMuX2ZvY3VzZWRTdGFja0ZyYW1lICE9PSBzdGFja0ZyYW1lIHx8XHJcbiAgICAgIGV4cGxpY2l0XHJcblxyXG4gICAgdGhpcy5fZm9jdXNlZFByb2Nlc3MgPSBuZXdQcm9jZXNzXHJcbiAgICB0aGlzLl9mb2N1c2VkVGhyZWFkID0gdGhyZWFkXHJcbiAgICB0aGlzLl9mb2N1c2VkU3RhY2tGcmFtZSA9IHN0YWNrRnJhbWVcclxuXHJcbiAgICBpZiAoZm9jdXNDaGFuZ2VkKSB7XHJcbiAgICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChERUJVR0dFUl9GT0NVU19DSEFOR0VELCB7IGV4cGxpY2l0IH0pXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAvLyBUaGUgZm9jdXNlZCBzdGFjayBmcmFtZSBkaWRuJ3QgY2hhbmdlLCBidXQgc29tZXRoaW5nIGFib3V0IHRoZVxyXG4gICAgICAvLyBjb250ZXh0IGRpZCwgc28gaW50ZXJlc3RlZCBsaXN0ZW5lcnMgc2hvdWxkIHJlLWV2YWx1YXRlIGV4cHJlc3Npb25zLlxyXG4gICAgICB0aGlzLl9lbWl0dGVyLmVtaXQoQ0hBTkdFX0VYUFJFU1NJT05fQ09OVEVYVCwgeyBleHBsaWNpdCB9KVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZXZhbHVhdGVDb250ZXh0Q2hhbmdlZCgpOiB2b2lkIHtcclxuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChDSEFOR0VfRVhQUkVTU0lPTl9DT05URVhULCB7IGV4cGxpY2l0OiB0cnVlIH0pXHJcbiAgfVxyXG5cclxuICBzZXRGb2N1c2VkUHJvY2Vzcyhwcm9jZXNzOiA/SVByb2Nlc3MsIGV4cGxpY2l0OiBib29sZWFuKSB7XHJcbiAgICBpZiAocHJvY2VzcyA9PSBudWxsKSB7XHJcbiAgICAgIHRoaXMuX2ZvY3VzZWRQcm9jZXNzID0gbnVsbFxyXG4gICAgICB0aGlzLl9zZXRGb2N1cyhudWxsLCBudWxsLCBudWxsLCBleHBsaWNpdClcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIGNvbnN0IG5ld0ZvY3VzVGhyZWFkID0gdGhpcy5fY2hvb3NlRm9jdXNUaHJlYWQocHJvY2VzcylcclxuICAgICAgY29uc3QgbmV3Rm9jdXNGcmFtZSA9IHRoaXMuX2Nob29zZUZvY3VzU3RhY2tGcmFtZShuZXdGb2N1c1RocmVhZClcclxuICAgICAgdGhpcy5fc2V0Rm9jdXMocHJvY2VzcywgbmV3Rm9jdXNUaHJlYWQsIG5ld0ZvY3VzRnJhbWUsIGV4cGxpY2l0KVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgc2V0Rm9jdXNlZFRocmVhZCh0aHJlYWQ6ID9JVGhyZWFkLCBleHBsaWNpdDogYm9vbGVhbikge1xyXG4gICAgaWYgKHRocmVhZCA9PSBudWxsKSB7XHJcbiAgICAgIHRoaXMuX3NldEZvY3VzKG51bGwsIG51bGwsIG51bGwsIGV4cGxpY2l0KVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5fc2V0Rm9jdXModGhyZWFkLnByb2Nlc3MsIHRocmVhZCwgdGhpcy5fY2hvb3NlRm9jdXNTdGFja0ZyYW1lKHRocmVhZCksIGV4cGxpY2l0KVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgc2V0Rm9jdXNlZFN0YWNrRnJhbWUoc3RhY2tGcmFtZTogP0lTdGFja0ZyYW1lLCBleHBsaWNpdDogYm9vbGVhbikge1xyXG4gICAgaWYgKHN0YWNrRnJhbWUgPT0gbnVsbCkge1xyXG4gICAgICB0aGlzLl9zZXRGb2N1cyhudWxsLCBudWxsLCBudWxsLCBleHBsaWNpdClcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMuX3NldEZvY3VzKHN0YWNrRnJhbWUudGhyZWFkLnByb2Nlc3MsIHN0YWNrRnJhbWUudGhyZWFkLCBzdGFja0ZyYW1lLCBleHBsaWNpdClcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGdldERlYnVnZ2VyTmFtZShhZGFwdGVyVHlwZTogc3RyaW5nKTogc3RyaW5nIHtcclxuICByZXR1cm4gYCR7Y2FwaXRhbGl6ZShhZGFwdGVyVHlwZSl9IERlYnVnZ2VyYFxyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBEZWJ1Z1NlcnZpY2UgaW1wbGVtZW50cyBJRGVidWdTZXJ2aWNlIHtcclxuICBfbW9kZWw6IE1vZGVsXHJcbiAgX2Rpc3Bvc2FibGVzOiBVbml2ZXJzYWxEaXNwb3NhYmxlXHJcbiAgX3Nlc3Npb25FbmREaXNwb3NhYmxlczogVW5pdmVyc2FsRGlzcG9zYWJsZVxyXG4gIF9jb25zb2xlRGlzcG9zYWJsZXM6IFVuaXZlcnNhbERpc3Bvc2FibGVcclxuICBfZW1pdHRlcjogRW1pdHRlclxyXG4gIF92aWV3TW9kZWw6IFZpZXdNb2RlbFxyXG4gIF90aW1lcjogP1RpbWluZ1RyYWNrZXJcclxuICBfYnJlYWtwb2ludHNUb1NlbmRPblNhdmU6IFNldDxzdHJpbmc+XHJcbiAgX2NvbnNvbGVPdXRwdXQ6IFN1YmplY3Q8Q29uc29sZU1lc3NhZ2U+XHJcblxyXG4gIGNvbnN0cnVjdG9yKHN0YXRlOiA/U2VyaWFsaXplZFN0YXRlKSB7XHJcbiAgICB0aGlzLl9kaXNwb3NhYmxlcyA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKClcclxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcyA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKClcclxuICAgIHRoaXMuX2NvbnNvbGVEaXNwb3NhYmxlcyA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKClcclxuICAgIHRoaXMuX2VtaXR0ZXIgPSBuZXcgRW1pdHRlcigpXHJcbiAgICB0aGlzLl92aWV3TW9kZWwgPSBuZXcgVmlld01vZGVsKClcclxuICAgIHRoaXMuX2JyZWFrcG9pbnRzVG9TZW5kT25TYXZlID0gbmV3IFNldCgpXHJcbiAgICB0aGlzLl9jb25zb2xlT3V0cHV0ID0gbmV3IFN1YmplY3QoKVxyXG5cclxuICAgIHRoaXMuX21vZGVsID0gbmV3IE1vZGVsKFxyXG4gICAgICB0aGlzLl9sb2FkQnJlYWtwb2ludHMoc3RhdGUpLFxyXG4gICAgICB0cnVlLFxyXG4gICAgICB0aGlzLl9sb2FkRnVuY3Rpb25CcmVha3BvaW50cyhzdGF0ZSksXHJcbiAgICAgIHRoaXMuX2xvYWRFeGNlcHRpb25CcmVha3BvaW50cyhzdGF0ZSksXHJcbiAgICAgIHRoaXMuX2xvYWRXYXRjaEV4cHJlc3Npb25zKHN0YXRlKSxcclxuICAgICAgKCkgPT4gdGhpcy5fdmlld01vZGVsLmZvY3VzZWRQcm9jZXNzXHJcbiAgICApXHJcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fbW9kZWwsIHRoaXMuX2NvbnNvbGVPdXRwdXQpXHJcbiAgICB0aGlzLl9yZWdpc3Rlckxpc3RlbmVycygpXHJcbiAgfVxyXG5cclxuICBnZXQgdmlld01vZGVsKCk6IElWaWV3TW9kZWwge1xyXG4gICAgcmV0dXJuIHRoaXMuX3ZpZXdNb2RlbFxyXG4gIH1cclxuXHJcbiAgZ2V0RGVidWdnZXJNb2RlKHByb2Nlc3M6ID9JUHJvY2Vzcyk6IERlYnVnZ2VyTW9kZVR5cGUge1xyXG4gICAgaWYgKHByb2Nlc3MgPT0gbnVsbCkge1xyXG4gICAgICByZXR1cm4gRGVidWdnZXJNb2RlLlNUT1BQRURcclxuICAgIH1cclxuICAgIHJldHVybiBwcm9jZXNzLmRlYnVnZ2VyTW9kZVxyXG4gIH1cclxuXHJcbiAgX3JlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xyXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuYWRkKFxyXG4gICAgICBhdG9tLndvcmtzcGFjZS5hZGRPcGVuZXIoKHVyaSkgPT4ge1xyXG4gICAgICAgIGlmICh1cmkuc3RhcnRzV2l0aChERUJVR19TT1VSQ0VTX1VSSSkpIHtcclxuICAgICAgICAgIGlmICh0aGlzLmdldERlYnVnZ2VyTW9kZSh0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3MpICE9PSBEZWJ1Z2dlck1vZGUuU1RPUFBFRCkge1xyXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fb3BlblNvdXJjZVZpZXcodXJpKVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfSlcclxuICAgIClcclxuICB9XHJcblxyXG4gIGFzeW5jIF9vcGVuU291cmNlVmlldyh1cmk6IHN0cmluZyk6IFByb21pc2U8YXRvbSRUZXh0RWRpdG9yPiB7XHJcbiAgICBjb25zdCBxdWVyeSA9ICh1cmwucGFyc2UodXJpKS5wYXRoIHx8IFwiXCIpLnNwbGl0KFwiL1wiKVxyXG4gICAgY29uc3QgWywgc2Vzc2lvbklkLCBzb3VyY2VSZWZlcmVuY2VSYXddID0gcXVlcnlcclxuICAgIGNvbnN0IHNvdXJjZVJlZmVyZW5jZSA9IHBhcnNlSW50KHNvdXJjZVJlZmVyZW5jZVJhdywgMTApXHJcblxyXG4gICAgY29uc3QgcHJvY2VzcyA9IHRoaXMuX21vZGVsLmdldFByb2Nlc3NlcygpLmZpbmQoKHApID0+IHAuZ2V0SWQoKSA9PT0gc2Vzc2lvbklkKSB8fCB0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3NcclxuICAgIGlmIChwcm9jZXNzID09IG51bGwpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBObyBkZWJ1ZyBzZXNzaW9uIGZvciBzb3VyY2U6ICR7c291cmNlUmVmZXJlbmNlfWApXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgc291cmNlID0gcHJvY2Vzcy5nZXRTb3VyY2Uoe1xyXG4gICAgICBwYXRoOiB1cmksXHJcbiAgICAgIHNvdXJjZVJlZmVyZW5jZSxcclxuICAgIH0pXHJcblxyXG4gICAgbGV0IGNvbnRlbnQgPSBcIlwiXHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHByb2Nlc3Muc2Vzc2lvbi5zb3VyY2Uoe1xyXG4gICAgICAgIHNvdXJjZVJlZmVyZW5jZSxcclxuICAgICAgICBzb3VyY2U6IHNvdXJjZS5yYXcsXHJcbiAgICAgIH0pXHJcbiAgICAgIGNvbnRlbnQgPSByZXNwb25zZS5ib2R5LmNvbnRlbnRcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgIHRoaXMuX3NvdXJjZUlzTm90QXZhaWxhYmxlKHVyaSlcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRGVidWcgc291cmNlIGlzIG5vdCBhdmFpbGFibGVcIilcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBlZGl0b3IgPSBhdG9tLndvcmtzcGFjZS5idWlsZFRleHRFZGl0b3Ioe1xyXG4gICAgICBidWZmZXI6IG5ldyBEZWJ1Z1NvdXJjZVRleHRCdWZmZmVyKGNvbnRlbnQsIHVyaSksXHJcbiAgICAgIGF1dG9IZWlnaHQ6IGZhbHNlLFxyXG4gICAgICByZWFkT25seTogdHJ1ZSxcclxuICAgIH0pXHJcblxyXG4gICAgLy8gJEZsb3dGaXhNZSBEZWJ1Z2dlciBzb3VyY2Ugdmlld3Mgc2hvdWxkbid0IHBlcnNpc3QgYmV0d2VlbiByZWxvYWQuXHJcbiAgICBlZGl0b3Iuc2VyaWFsaXplID0gKCkgPT4gbnVsbFxyXG4gICAgZWRpdG9yLnNldEdyYW1tYXIoYXRvbS5ncmFtbWFycy5zZWxlY3RHcmFtbWFyKHNvdXJjZS5uYW1lIHx8IFwiXCIsIGNvbnRlbnQpKVxyXG4gICAgY29uc3QgdGV4dEVkaXRvckJhbm5lciA9IG5ldyBUZXh0RWRpdG9yQmFubmVyKGVkaXRvcilcclxuICAgIHRleHRFZGl0b3JCYW5uZXIucmVuZGVyKFxyXG4gICAgICA8UmVhZE9ubHlOb3RpY2VcclxuICAgICAgICBkZXRhaWxlZE1lc3NhZ2U9XCJUaGlzIGlzIGEgZGVidWcgc291cmNlIHZpZXcgdGhhdCBtYXkgbm90IGV4aXN0IG9uIHRoZSBmaWxlc3lzdGVtLlwiXHJcbiAgICAgICAgY2FuRWRpdEFueXdheT17ZmFsc2V9XHJcbiAgICAgICAgb25EaXNtaXNzPXt0ZXh0RWRpdG9yQmFubmVyLmRpc3Bvc2UuYmluZCh0ZXh0RWRpdG9yQmFubmVyKX1cclxuICAgICAgLz5cclxuICAgIClcclxuXHJcbiAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuYWRkVW50aWxEZXN0cm95ZWQoZWRpdG9yLCBlZGl0b3IsIHRleHRFZGl0b3JCYW5uZXIpXHJcblxyXG4gICAgcmV0dXJuIGVkaXRvclxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogU3RvcHMgdGhlIHNwZWNpZmllZCBwcm9jZXNzLlxyXG4gICAqL1xyXG4gIGFzeW5jIHN0b3BQcm9jZXNzKHByb2Nlc3M6IElQcm9jZXNzKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBpZiAocHJvY2Vzcy5kZWJ1Z2dlck1vZGUgPT09IERlYnVnZ2VyTW9kZS5TVE9QUElORyB8fCBwcm9jZXNzLmRlYnVnZ2VyTW9kZSA9PT0gRGVidWdnZXJNb2RlLlNUT1BQRUQpIHtcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcbiAgICB0aGlzLl9vblNlc3Npb25FbmQoKHByb2Nlc3Muc2Vzc2lvbjogYW55KSlcclxuICB9XHJcblxyXG4gIGFzeW5jIF90cnlUb0F1dG9Gb2N1c1N0YWNrRnJhbWUodGhyZWFkOiBJVGhyZWFkKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAvLyBUaGUgY2FsbCBzdGFjayBoYXMgYWxyZWFkeSBiZWVuIHJlZnJlc2hlZCBieSB0aGUgbG9naWMgaGFuZGxpbmdcclxuICAgIC8vIHRoZSB0aHJlYWQgc3RvcCBldmVudCBmb3IgdGhpcyB0aHJlYWQuXHJcbiAgICBjb25zdCBjYWxsU3RhY2sgPSB0aHJlYWQuZ2V0Q2FjaGVkQ2FsbFN0YWNrKClcclxuICAgIGlmIChcclxuICAgICAgY2FsbFN0YWNrLmxlbmd0aCA9PT0gMCB8fFxyXG4gICAgICAodGhpcy5fdmlld01vZGVsLmZvY3VzZWRTdGFja0ZyYW1lICYmXHJcbiAgICAgICAgdGhpcy5fdmlld01vZGVsLmZvY3VzZWRTdGFja0ZyYW1lLnRocmVhZC5nZXRJZCgpID09PSB0aHJlYWQuZ2V0SWQoKSAmJlxyXG4gICAgICAgIGNhbGxTdGFjay5pbmNsdWRlcyh0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFN0YWNrRnJhbWUpKVxyXG4gICAgKSB7XHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG5cclxuICAgIC8vIEZvY3VzIGZpcnN0IHN0YWNrIGZyYW1lIGZyb20gdG9wIHRoYXQgaGFzIHNvdXJjZSBsb2NhdGlvbiBpZiBubyBvdGhlciBzdGFjayBmcmFtZSBpcyBmb2N1c2VkXHJcbiAgICBjb25zdCBzdGFja0ZyYW1lVG9Gb2N1cyA9IGNhbGxTdGFjay5maW5kKChzZikgPT4gc2Yuc291cmNlICE9IG51bGwgJiYgc2Yuc291cmNlLmF2YWlsYWJsZSlcclxuICAgIGlmIChzdGFja0ZyYW1lVG9Gb2N1cyA9PSBudWxsKSB7XHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuX3ZpZXdNb2RlbC5zZXRGb2N1c2VkU3RhY2tGcmFtZShzdGFja0ZyYW1lVG9Gb2N1cywgZmFsc2UpXHJcbiAgfVxyXG5cclxuICBfcmVnaXN0ZXJNYXJrZXJzKHByb2Nlc3M6IElQcm9jZXNzKTogSURpc3Bvc2FibGUge1xyXG4gICAgbGV0IHNlbGVjdGVkRnJhbWVNYXJrZXI6ID9hdG9tJE1hcmtlciA9IG51bGxcclxuICAgIGxldCB0aHJlYWRDaGFuZ2VEYXRhdGlwOiA/SURpc3Bvc2FibGVcclxuICAgIGxldCBsYXN0Rm9jdXNlZFRocmVhZElkOiA/bnVtYmVyXHJcbiAgICBsZXQgbGFzdEZvY3VzZWRQcm9jZXNzOiA/SVByb2Nlc3NcclxuXHJcbiAgICBjb25zdCBjbGVhdXBNYXJrZXJzID0gKCkgPT4ge1xyXG4gICAgICBpZiAoc2VsZWN0ZWRGcmFtZU1hcmtlciAhPSBudWxsKSB7XHJcbiAgICAgICAgc2VsZWN0ZWRGcmFtZU1hcmtlci5kZXN0cm95KClcclxuICAgICAgICBzZWxlY3RlZEZyYW1lTWFya2VyID0gbnVsbFxyXG4gICAgICB9XHJcblxyXG4gICAgICBpZiAodGhyZWFkQ2hhbmdlRGF0YXRpcCAhPSBudWxsKSB7XHJcbiAgICAgICAgdGhyZWFkQ2hhbmdlRGF0YXRpcC5kaXNwb3NlKClcclxuICAgICAgICB0aHJlYWRDaGFuZ2VEYXRhdGlwID0gbnVsbFxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKFxyXG4gICAgICBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKHRoaXMuX3ZpZXdNb2RlbC5vbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMuYmluZCh0aGlzLl92aWV3TW9kZWwpKVxyXG4gICAgICAgIC5jb25jYXRNYXAoKGV2ZW50KSA9PiB7XHJcbiAgICAgICAgICBjbGVhdXBNYXJrZXJzKClcclxuXHJcbiAgICAgICAgICBjb25zdCB7IGV4cGxpY2l0IH0gPSBldmVudFxyXG4gICAgICAgICAgY29uc3Qgc3RhY2tGcmFtZSA9IHRoaXMuX3ZpZXdNb2RlbC5mb2N1c2VkU3RhY2tGcmFtZVxyXG5cclxuICAgICAgICAgIGlmIChzdGFja0ZyYW1lID09IG51bGwgfHwgIXN0YWNrRnJhbWUuc291cmNlLmF2YWlsYWJsZSkge1xyXG4gICAgICAgICAgICBpZiAoZXhwbGljaXQgJiYgdGhpcy5nZXREZWJ1Z2dlck1vZGUodGhpcy5fdmlld01vZGVsLmZvY3VzZWRQcm9jZXNzKSA9PT0gRGVidWdnZXJNb2RlLlBBVVNFRCkge1xyXG4gICAgICAgICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRXYXJuaW5nKFwiTm8gc291cmNlIGF2YWlsYWJsZSBmb3IgdGhlIHNlbGVjdGVkIHN0YWNrIGZyYW1lXCIpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIE9ic2VydmFibGUuZW1wdHkoKVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgcmV0dXJuIE9ic2VydmFibGUuZnJvbVByb21pc2Uoc3RhY2tGcmFtZS5vcGVuSW5FZGl0b3IoKSkuc3dpdGNoTWFwKChlZGl0b3IpID0+IHtcclxuICAgICAgICAgICAgaWYgKGVkaXRvciA9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgY29uc3QgdXJpID0gc3RhY2tGcmFtZS5zb3VyY2UudXJpXHJcbiAgICAgICAgICAgICAgY29uc3QgZXJyb3JNc2cgPVxyXG4gICAgICAgICAgICAgICAgdXJpID09IG51bGwgfHwgdXJpID09PSBcIlwiXHJcbiAgICAgICAgICAgICAgICAgID8gXCJUaGUgc2VsZWN0ZWQgc3RhY2sgZnJhbWUgaGFzIG5vIGtub3duIHNvdXJjZSBsb2NhdGlvblwiXHJcbiAgICAgICAgICAgICAgICAgIDogYE51Y2xpZGUgY291bGQgbm90IG9wZW4gJHt1cml9YFxyXG4gICAgICAgICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcihlcnJvck1zZylcclxuICAgICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5lbXB0eSgpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIE9ic2VydmFibGUub2YoeyBlZGl0b3IsIGV4cGxpY2l0LCBzdGFja0ZyYW1lIH0pXHJcbiAgICAgICAgICB9KVxyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLnN1YnNjcmliZSgoeyBlZGl0b3IsIGV4cGxpY2l0LCBzdGFja0ZyYW1lIH0pID0+IHtcclxuICAgICAgICAgIGNvbnN0IGxpbmUgPSBzdGFja0ZyYW1lLnJhbmdlLnN0YXJ0LnJvd1xyXG4gICAgICAgICAgc2VsZWN0ZWRGcmFtZU1hcmtlciA9IGVkaXRvci5tYXJrQnVmZmVyUmFuZ2UoXHJcbiAgICAgICAgICAgIFtcclxuICAgICAgICAgICAgICBbbGluZSwgMF0sXHJcbiAgICAgICAgICAgICAgW2xpbmUsIEluZmluaXR5XSxcclxuICAgICAgICAgICAgXSxcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgIGludmFsaWRhdGU6IFwibmV2ZXJcIixcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgKVxyXG4gICAgICAgICAgZWRpdG9yLmRlY29yYXRlTWFya2VyKHNlbGVjdGVkRnJhbWVNYXJrZXIsIHtcclxuICAgICAgICAgICAgdHlwZTogXCJsaW5lXCIsXHJcbiAgICAgICAgICAgIGNsYXNzOiBcImRlYnVnZ2VyLWN1cnJlbnQtbGluZS1oaWdobGlnaHRcIixcclxuICAgICAgICAgIH0pXHJcblxyXG4gICAgICAgICAgY29uc3QgZGF0YXRpcFNlcnZpY2UgPSBnZXREYXRhdGlwU2VydmljZSgpXHJcbiAgICAgICAgICBpZiAoZGF0YXRpcFNlcnZpY2UgPT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm5cclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICB0aGlzLl9tb2RlbC5zZXRFeGNlcHRpb25CcmVha3BvaW50cyhcclxuICAgICAgICAgICAgcHJvY2VzcyxcclxuICAgICAgICAgICAgc3RhY2tGcmFtZS50aHJlYWQucHJvY2Vzcy5zZXNzaW9uLmNhcGFiaWxpdGllcy5leGNlcHRpb25CcmVha3BvaW50RmlsdGVycyB8fCBbXVxyXG4gICAgICAgICAgKVxyXG5cclxuICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgbGFzdEZvY3VzZWRUaHJlYWRJZCAhPSBudWxsICYmXHJcbiAgICAgICAgICAgICFleHBsaWNpdCAmJlxyXG4gICAgICAgICAgICBzdGFja0ZyYW1lLnRocmVhZC50aHJlYWRJZCAhPT0gbGFzdEZvY3VzZWRUaHJlYWRJZCAmJlxyXG4gICAgICAgICAgICBwcm9jZXNzID09PSBsYXN0Rm9jdXNlZFByb2Nlc3NcclxuICAgICAgICAgICkge1xyXG4gICAgICAgICAgICBsZXQgbWVzc2FnZSA9IGBBY3RpdmUgdGhyZWFkIGNoYW5nZWQgZnJvbSAke2xhc3RGb2N1c2VkVGhyZWFkSWR9IHRvICR7c3RhY2tGcmFtZS50aHJlYWQudGhyZWFkSWR9YFxyXG4gICAgICAgICAgICBjb25zdCBuZXdGb2N1c2VkUHJvY2VzcyA9IHN0YWNrRnJhbWUudGhyZWFkLnByb2Nlc3NcclxuICAgICAgICAgICAgaWYgKGxhc3RGb2N1c2VkUHJvY2VzcyAhPSBudWxsICYmICFleHBsaWNpdCAmJiBuZXdGb2N1c2VkUHJvY2VzcyAhPT0gbGFzdEZvY3VzZWRQcm9jZXNzKSB7XHJcbiAgICAgICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICAgICAgbGFzdEZvY3VzZWRQcm9jZXNzLmNvbmZpZ3VyYXRpb24ucHJvY2Vzc05hbWUgIT0gbnVsbCAmJlxyXG4gICAgICAgICAgICAgICAgbmV3Rm9jdXNlZFByb2Nlc3MuY29uZmlndXJhdGlvbi5wcm9jZXNzTmFtZSAhPSBudWxsXHJcbiAgICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICBtZXNzYWdlID1cclxuICAgICAgICAgICAgICAgICAgXCJBY3RpdmUgcHJvY2VzcyBjaGFuZ2VkIGZyb20gXCIgK1xyXG4gICAgICAgICAgICAgICAgICBsYXN0Rm9jdXNlZFByb2Nlc3MuY29uZmlndXJhdGlvbi5wcm9jZXNzTmFtZSArXHJcbiAgICAgICAgICAgICAgICAgIFwiIHRvIFwiICtcclxuICAgICAgICAgICAgICAgICAgbmV3Rm9jdXNlZFByb2Nlc3MuY29uZmlndXJhdGlvbi5wcm9jZXNzTmFtZSArXHJcbiAgICAgICAgICAgICAgICAgIFwiIEFORCBcIiArXHJcbiAgICAgICAgICAgICAgICAgIG1lc3NhZ2VcclxuICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IFwiQWN0aXZlIHByb2Nlc3MgY2hhbmdlZCBBTkQgXCIgKyBtZXNzYWdlXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHRocmVhZENoYW5nZURhdGF0aXAgPSBkYXRhdGlwU2VydmljZS5jcmVhdGVQaW5uZWREYXRhVGlwKFxyXG4gICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGNvbXBvbmVudDogKCkgPT4gKFxyXG4gICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXRocmVhZC1zd2l0Y2gtYWxlcnRcIj5cclxuICAgICAgICAgICAgICAgICAgICA8SWNvbiBpY29uPVwiYWxlcnRcIiAvPlxyXG4gICAgICAgICAgICAgICAgICAgIHttZXNzYWdlfVxyXG4gICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICksXHJcbiAgICAgICAgICAgICAgICByYW5nZTogc3RhY2tGcmFtZS5yYW5nZSxcclxuICAgICAgICAgICAgICAgIHBpbm5hYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgZWRpdG9yXHJcbiAgICAgICAgICAgIClcclxuICAgICAgICAgICAgdGhpcy5fZW1pdHRlci5lbWl0KEFDVElWRV9USFJFQURfQ0hBTkdFRClcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGxhc3RGb2N1c2VkVGhyZWFkSWQgPSBzdGFja0ZyYW1lLnRocmVhZC50aHJlYWRJZFxyXG4gICAgICAgICAgbGFzdEZvY3VzZWRQcm9jZXNzID0gc3RhY2tGcmFtZS50aHJlYWQucHJvY2Vzc1xyXG4gICAgICAgIH0pLFxyXG5cclxuICAgICAgY2xlYXVwTWFya2Vyc1xyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgX3JlZ2lzdGVyU2Vzc2lvbkxpc3RlbmVycyhwcm9jZXNzOiBQcm9jZXNzLCBzZXNzaW9uOiBWc0RlYnVnU2Vzc2lvbik6IHZvaWQge1xyXG4gICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoc2Vzc2lvbilcclxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQodGhpcy5fcmVnaXN0ZXJNYXJrZXJzKHByb2Nlc3MpKVxyXG5cclxuICAgIGNvbnN0IHNlc3Npb25JZCA9IHNlc3Npb24uZ2V0SWQoKVxyXG5cclxuICAgIGNvbnN0IHRocmVhZEZldGNoZXIgPSBzZXJpYWxpemVBc3luY0NhbGwoYXN5bmMgKCkgPT4ge1xyXG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHNlc3Npb24udGhyZWFkcygpXHJcbiAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5ib2R5ICYmIHJlc3BvbnNlLmJvZHkudGhyZWFkcykge1xyXG4gICAgICAgIHJlc3BvbnNlLmJvZHkudGhyZWFkcy5mb3JFYWNoKCh0aHJlYWQpID0+IHtcclxuICAgICAgICAgIHRoaXMuX21vZGVsLnJhd1VwZGF0ZSh7XHJcbiAgICAgICAgICAgIHNlc3Npb25JZCxcclxuICAgICAgICAgICAgdGhyZWFkLFxyXG4gICAgICAgICAgfSlcclxuICAgICAgICB9KVxyXG4gICAgICB9XHJcbiAgICB9KVxyXG5cclxuICAgIGNvbnN0IG9wZW5GaWxlc1NhdmVkID0gb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbihcclxuICAgICAgYXRvbS53b3Jrc3BhY2Uub2JzZXJ2ZVRleHRFZGl0b3JzLmJpbmQoYXRvbS53b3Jrc3BhY2UpXHJcbiAgICApLmZsYXRNYXAoKGVkaXRvcikgPT4ge1xyXG4gICAgICByZXR1cm4gb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbihlZGl0b3Iub25EaWRTYXZlLmJpbmQoZWRpdG9yKSlcclxuICAgICAgICAubWFwKCgpID0+IGVkaXRvci5nZXRQYXRoKCkpXHJcbiAgICAgICAgLnRha2VVbnRpbChvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKGVkaXRvci5vbkRpZERlc3Ryb3kuYmluZChlZGl0b3IpKSlcclxuICAgIH0pXHJcblxyXG4gICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmFkZChcclxuICAgICAgb3BlbkZpbGVzU2F2ZWQuc3Vic2NyaWJlKGFzeW5jIChmaWxlUGF0aCkgPT4ge1xyXG4gICAgICAgIGlmIChmaWxlUGF0aCA9PSBudWxsIHx8ICF0aGlzLl9icmVha3BvaW50c1RvU2VuZE9uU2F2ZS5oYXMoZmlsZVBhdGgpKSB7XHJcbiAgICAgICAgICByZXR1cm5cclxuICAgICAgICB9XHJcbiAgICAgICAgdGhpcy5fYnJlYWtwb2ludHNUb1NlbmRPblNhdmUuZGVsZXRlKGZpbGVQYXRoKVxyXG4gICAgICAgIGF3YWl0IHRoaXMuX3NlbmRCcmVha3BvaW50cyhmaWxlUGF0aCwgdHJ1ZSlcclxuICAgICAgfSlcclxuICAgIClcclxuXHJcbiAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuYWRkKFxyXG4gICAgICBzZXNzaW9uLm9ic2VydmVJbml0aWFsaXplRXZlbnRzKCkuc3Vic2NyaWJlKGFzeW5jIChldmVudCkgPT4ge1xyXG4gICAgICAgIGNvbnN0IHNlbmRDb25maWd1cmF0aW9uRG9uZSA9IGFzeW5jICgpID0+IHtcclxuICAgICAgICAgIGlmIChzZXNzaW9uICYmIHNlc3Npb24uZ2V0Q2FwYWJpbGl0aWVzKCkuc3VwcG9ydHNDb25maWd1cmF0aW9uRG9uZVJlcXVlc3QpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHNlc3Npb25cclxuICAgICAgICAgICAgICAuY29uZmlndXJhdGlvbkRvbmUoKVxyXG4gICAgICAgICAgICAgIC50aGVuKChfKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLl9vbkRlYnVnZ2VyTW9kZUNoYW5nZWQocHJvY2VzcywgRGVidWdnZXJNb2RlLlJVTk5JTkcpXHJcbiAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgICAuY2F0Y2goKGUpID0+IHtcclxuICAgICAgICAgICAgICAgIC8vIERpc2Nvbm5lY3QgdGhlIGRlYnVnIHNlc3Npb24gb24gY29uZmlndXJhdGlvbiBkb25lIGVycm9yICMxMDU5NlxyXG4gICAgICAgICAgICAgICAgdGhpcy5fb25TZXNzaW9uRW5kKHNlc3Npb24pXHJcbiAgICAgICAgICAgICAgICBzZXNzaW9uLmRpc2Nvbm5lY3QoKS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcilcclxuICAgICAgICAgICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcihcclxuICAgICAgICAgICAgICAgICAgXCJGYWlsZWQgdG8gY29uZmlndXJlIGRlYnVnZ2VyLiBUaGlzIGlzIG9mdGVuIGJlY2F1c2UgZWl0aGVyIFwiICtcclxuICAgICAgICAgICAgICAgICAgICBcInRoZSBwcm9jZXNzIHlvdSB0cmllZCB0byBhdHRhY2ggdG8gaGFzIGFscmVhZHkgdGVybWluYXRlZCwgb3IgXCIgK1xyXG4gICAgICAgICAgICAgICAgICAgIFwieW91IGRvIG5vdCBoYXZlIHBlcm1pc3Npb25zICh0aGUgcHJvY2VzcyBpcyBydW5uaW5nIGFzIHJvb3Qgb3IgXCIgK1xyXG4gICAgICAgICAgICAgICAgICAgIFwiYW5vdGhlciB1c2VyLilcIixcclxuICAgICAgICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgICAgIGRldGFpbDogZS5tZXNzYWdlLFxyXG4gICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICApXHJcbiAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICBhd2FpdCB0aGlzLl9zZW5kQWxsQnJlYWtwb2ludHMoKS50aGVuKHNlbmRDb25maWd1cmF0aW9uRG9uZSwgc2VuZENvbmZpZ3VyYXRpb25Eb25lKVxyXG4gICAgICAgICAgYXdhaXQgdGhyZWFkRmV0Y2hlcigpXHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgIG9uVW5leHBlY3RlZEVycm9yKGVycm9yKVxyXG4gICAgICAgIH1cclxuICAgICAgfSlcclxuICAgIClcclxuXHJcbiAgICBjb25zdCB0b0ZvY3VzVGhyZWFkcyA9IG5ldyBTdWJqZWN0KClcclxuXHJcbiAgICBjb25zdCBvYnNlcnZlQ29udGludWVkVG8gPSAodGhyZWFkSWQ6ID9udW1iZXIpID0+IHtcclxuICAgICAgcmV0dXJuIHNlc3Npb25cclxuICAgICAgICAub2JzZXJ2ZUNvbnRpbnVlZEV2ZW50cygpXHJcbiAgICAgICAgLmZpbHRlcihcclxuICAgICAgICAgIChjb250aW51ZWQpID0+XHJcbiAgICAgICAgICAgIGNvbnRpbnVlZC5ib2R5LmFsbFRocmVhZHNDb250aW51ZWQgfHwgKHRocmVhZElkICE9IG51bGwgJiYgdGhyZWFkSWQgPT09IGNvbnRpbnVlZC5ib2R5LnRocmVhZElkKVxyXG4gICAgICAgIClcclxuICAgICAgICAudGFrZSgxKVxyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoXHJcbiAgICAgIHNlc3Npb24ub2JzZXJ2ZVN0b3BFdmVudHMoKS5zdWJzY3JpYmUoKCkgPT4ge1xyXG4gICAgICAgIHRoaXMuX29uRGVidWdnZXJNb2RlQ2hhbmdlZChwcm9jZXNzLCBEZWJ1Z2dlck1vZGUuUEFVU0VEKVxyXG4gICAgICB9KSxcclxuICAgICAgc2Vzc2lvbi5vYnNlcnZlRXZhbHVhdGlvbnMoKS5zdWJzY3JpYmUoKCkgPT4ge1xyXG4gICAgICAgIHRoaXMuX3ZpZXdNb2RlbC5ldmFsdWF0ZUNvbnRleHRDaGFuZ2VkKClcclxuICAgICAgfSksXHJcbiAgICAgIHNlc3Npb25cclxuICAgICAgICAub2JzZXJ2ZVN0b3BFdmVudHMoKVxyXG4gICAgICAgIC5mbGF0TWFwKChldmVudCkgPT5cclxuICAgICAgICAgIE9ic2VydmFibGUuZnJvbVByb21pc2UodGhyZWFkRmV0Y2hlcigpKVxyXG4gICAgICAgICAgICAuaWdub3JlRWxlbWVudHMoKVxyXG4gICAgICAgICAgICAuY29uY2F0KE9ic2VydmFibGUub2YoZXZlbnQpKVxyXG4gICAgICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XHJcbiAgICAgICAgICAgICAgb25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpXHJcbiAgICAgICAgICAgICAgcmV0dXJuIE9ic2VydmFibGUuZW1wdHkoKVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAvLyBQcm9jZWVlZCBwcm9jZXNzaW5nIHRoZSBzdG9wcGVkIGV2ZW50IG9ubHkgaWYgdGhlcmUgd2Fzbid0XHJcbiAgICAgICAgICAgIC8vIGEgY29udGludWVkIGV2ZW50IHdoaWxlIHdlJ3JlIGZldGNoaW5nIHRoZSB0aHJlYWRzXHJcbiAgICAgICAgICAgIC50YWtlVW50aWwob2JzZXJ2ZUNvbnRpbnVlZFRvKGV2ZW50LmJvZHkudGhyZWFkSWQpKVxyXG4gICAgICAgIClcclxuICAgICAgICAuc3Vic2NyaWJlKChldmVudDogRGVidWdQcm90b2NvbC5TdG9wcGVkRXZlbnQpID0+IHtcclxuICAgICAgICAgIGNvbnN0IHsgdGhyZWFkSWQgfSA9IGV2ZW50LmJvZHlcclxuICAgICAgICAgIC8vIFVwZGF0aW5nIHN0b3BwZWQgc3RhdGUgbmVlZHMgdG8gaGFwcGVuIGFmdGVyIGZldGNoaW5nIHRoZSB0aHJlYWRzXHJcbiAgICAgICAgICB0aGlzLl9tb2RlbC5yYXdVcGRhdGUoe1xyXG4gICAgICAgICAgICBzZXNzaW9uSWQsXHJcbiAgICAgICAgICAgIHN0b3BwZWREZXRhaWxzOiAoZXZlbnQuYm9keTogYW55KSxcclxuICAgICAgICAgICAgdGhyZWFkSWQsXHJcbiAgICAgICAgICB9KVxyXG5cclxuICAgICAgICAgIGlmICh0aHJlYWRJZCA9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVyblxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgY29uc3QgdGhyZWFkID0gcHJvY2Vzcy5nZXRUaHJlYWQodGhyZWFkSWQpXHJcbiAgICAgICAgICBpZiAodGhyZWFkICE9IG51bGwpIHtcclxuICAgICAgICAgICAgdG9Gb2N1c1RocmVhZHMubmV4dCh0aHJlYWQpXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSksXHJcblxyXG4gICAgICB0b0ZvY3VzVGhyZWFkc1xyXG4gICAgICAgIC5jb25jYXRNYXAoKHRocmVhZCkgPT4ge1xyXG4gICAgICAgICAgY29uc3QgeyBmb2N1c2VkVGhyZWFkIH0gPSB0aGlzLl92aWV3TW9kZWxcclxuICAgICAgICAgIGNvbnN0IHByZXNlcnZlRm9jdXNIaW50ID0gaWR4KHRocmVhZCwgKF8pID0+IF8uc3RvcHBlZERldGFpbHMucHJlc2VydmVGb2N1c0hpbnQpIHx8IGZhbHNlXHJcblxyXG4gICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICBmb2N1c2VkVGhyZWFkICE9IG51bGwgJiZcclxuICAgICAgICAgICAgZm9jdXNlZFRocmVhZC5zdG9wcGVkICYmXHJcbiAgICAgICAgICAgIGZvY3VzZWRUaHJlYWQuZ2V0SWQoKSAhPT0gdGhyZWFkLmdldElkKCkgJiZcclxuICAgICAgICAgICAgcHJlc2VydmVGb2N1c0hpbnRcclxuICAgICAgICAgICkge1xyXG4gICAgICAgICAgICAvLyBUaGUgZGVidWdnZXIgaXMgYWxyZWFkeSBzdG9wcGVkIGVsc2V3aGVyZS5cclxuICAgICAgICAgICAgcmV0dXJuIE9ic2VydmFibGUuZW1wdHkoKVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGNvbnN0IHRoaXNUaHJlYWRJc0ZvY3VzZWQgPVxyXG4gICAgICAgICAgICB0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFN0YWNrRnJhbWUgIT0gbnVsbCAmJlxyXG4gICAgICAgICAgICB0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFN0YWNrRnJhbWUudGhyZWFkLmdldElkKCkgPT09IHRocmVhZC5nZXRJZCgpXHJcblxyXG4gICAgICAgICAgLy8gRmV0Y2hlcyB0aGUgZmlyc3QgY2FsbCBmcmFtZSBpbiB0aGlzIHN0YWNrIHRvIGFsbG93IHRoZSBVSSB0b1xyXG4gICAgICAgICAgLy8gdXBkYXRlIHRoZSB0aHJlYWQgbGlzdC4gQWRkaXRpb25hbCBmcmFtZXMgd2lsbCBiZSBmZXRjaGVkIGJ5IHRoZSBVSVxyXG4gICAgICAgICAgLy8gb24gZGVtYW5kLCBvbmx5IGlmIHRoZXkgYXJlIG5lZWRlZC5cclxuICAgICAgICAgIC8vIElmIHRoaXMgdGhyZWFkIGlzIHRoZSBjdXJyZW50bHkgZm9jdXNlZCB0aHJlYWQsIGZldGNoIHRoZSBlbnRpcmVcclxuICAgICAgICAgIC8vIHN0YWNrIGJlY2F1c2UgdGhlIFVJIHdpbGwgY2VydGFpbmx5IG5lZWQgaXQsIGFuZCB3ZSBuZWVkIGl0IGhlcmUgdG9cclxuICAgICAgICAgIC8vIHRyeSBhbmQgYXV0by1mb2N1cyBhIGZyYW1lLlxyXG4gICAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgT2JzZXJ2YWJsZS5mcm9tUHJvbWlzZSh0aGlzLl9tb2RlbC5yZWZyZXNoQ2FsbFN0YWNrKHRocmVhZCwgdGhpc1RocmVhZElzRm9jdXNlZCkpXHJcbiAgICAgICAgICAgICAgLmlnbm9yZUVsZW1lbnRzKClcclxuICAgICAgICAgICAgICAuY29uY2F0KE9ic2VydmFibGUub2YodGhyZWFkKSlcclxuICAgICAgICAgICAgICAvLyBBdm9pZCBmb2N1c2luZyBhIGNvbnRpbnVlZCB0aHJlYWQuXHJcbiAgICAgICAgICAgICAgLnRha2VVbnRpbChvYnNlcnZlQ29udGludWVkVG8odGhyZWFkLnRocmVhZElkKSlcclxuICAgICAgICAgICAgICAvLyBWZXJpZnkgdGhlIHRocmVhZCBpcyBzdGlsbCBzdG9wcGVkLlxyXG4gICAgICAgICAgICAgIC5maWx0ZXIoKCkgPT4gdGhyZWFkLnN0b3BwZWQpXHJcbiAgICAgICAgICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xyXG4gICAgICAgICAgICAgICAgb25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5lbXB0eSgpXHJcbiAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgIClcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5zdWJzY3JpYmUoKHRocmVhZCkgPT4ge1xyXG4gICAgICAgICAgdGhpcy5fdHJ5VG9BdXRvRm9jdXNTdGFja0ZyYW1lKHRocmVhZClcclxuICAgICAgICAgIHRoaXMuX3NjaGVkdWxlTmF0aXZlTm90aWZpY2F0aW9uKClcclxuICAgICAgICB9KVxyXG4gICAgKVxyXG5cclxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoXHJcbiAgICAgIHNlc3Npb24ub2JzZXJ2ZVRocmVhZEV2ZW50cygpLnN1YnNjcmliZShhc3luYyAoZXZlbnQpID0+IHtcclxuICAgICAgICBpZiAoZXZlbnQuYm9keS5yZWFzb24gPT09IFwic3RhcnRlZFwiKSB7XHJcbiAgICAgICAgICBhd2FpdCB0aHJlYWRGZXRjaGVyKClcclxuICAgICAgICB9IGVsc2UgaWYgKGV2ZW50LmJvZHkucmVhc29uID09PSBcImV4aXRlZFwiKSB7XHJcbiAgICAgICAgICB0aGlzLl9tb2RlbC5jbGVhclRocmVhZHMoc2Vzc2lvbi5nZXRJZCgpLCB0cnVlLCBldmVudC5ib2R5LnRocmVhZElkKVxyXG4gICAgICAgIH1cclxuICAgICAgfSlcclxuICAgIClcclxuXHJcbiAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuYWRkKFxyXG4gICAgICBzZXNzaW9uLm9ic2VydmVUZXJtaW5hdGVEZWJ1Z2VlRXZlbnRzKCkuc3Vic2NyaWJlKChldmVudCkgPT4ge1xyXG4gICAgICAgIGlmIChldmVudC5ib2R5ICYmIGV2ZW50LmJvZHkucmVzdGFydCkge1xyXG4gICAgICAgICAgdGhpcy5yZXN0YXJ0UHJvY2Vzcyhwcm9jZXNzKS5jYXRjaCgoZXJyKSA9PiB7XHJcbiAgICAgICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcihcIkZhaWxlZCB0byByZXN0YXJ0IGRlYnVnZ2VyXCIsIHtcclxuICAgICAgICAgICAgICBkZXRhaWw6IGVyci5zdGFjayB8fCBTdHJpbmcoZXJyKSxcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIHRoaXMuX29uU2Vzc2lvbkVuZChzZXNzaW9uKVxyXG4gICAgICAgICAgc2Vzc2lvbi5kaXNjb25uZWN0KCkuY2F0Y2gob25VbmV4cGVjdGVkRXJyb3IpXHJcbiAgICAgICAgfVxyXG4gICAgICB9KVxyXG4gICAgKVxyXG5cclxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoXHJcbiAgICAgIHNlc3Npb24ub2JzZXJ2ZUNvbnRpbnVlZEV2ZW50cygpLnN1YnNjcmliZSgoZXZlbnQpID0+IHtcclxuICAgICAgICBjb25zdCB0aHJlYWRJZCA9IGV2ZW50LmJvZHkuYWxsVGhyZWFkc0NvbnRpbnVlZCAhPT0gZmFsc2UgPyB1bmRlZmluZWQgOiBldmVudC5ib2R5LnRocmVhZElkXHJcbiAgICAgICAgdGhpcy5fbW9kZWwuY2xlYXJUaHJlYWRzKHNlc3Npb24uZ2V0SWQoKSwgZmFsc2UsIHRocmVhZElkKVxyXG4gICAgICAgIHRoaXMuX3ZpZXdNb2RlbC5zZXRGb2N1c2VkVGhyZWFkKHRoaXMuX3ZpZXdNb2RlbC5mb2N1c2VkVGhyZWFkLCBmYWxzZSlcclxuICAgICAgICB0aGlzLl9vbkRlYnVnZ2VyTW9kZUNoYW5nZWQocHJvY2VzcywgRGVidWdnZXJNb2RlLlJVTk5JTkcpXHJcbiAgICAgIH0pXHJcbiAgICApXHJcblxyXG4gICAgY29uc3Qgb3V0cHV0RXZlbnRzID0gc2Vzc2lvblxyXG4gICAgICAub2JzZXJ2ZU91dHB1dEV2ZW50cygpXHJcbiAgICAgIC5maWx0ZXIoKGV2ZW50KSA9PiBldmVudC5ib2R5ICE9IG51bGwgJiYgdHlwZW9mIGV2ZW50LmJvZHkub3V0cHV0ID09PSBcInN0cmluZ1wiKVxyXG4gICAgICAuc2hhcmUoKVxyXG5cclxuICAgIGNvbnN0IG5vdGlmaWNhdGlvblN0cmVhbSA9IG91dHB1dEV2ZW50c1xyXG4gICAgICAuZmlsdGVyKChlKSA9PiBlLmJvZHkuY2F0ZWdvcnkgPT09IFwibnVjbGlkZV9ub3RpZmljYXRpb25cIilcclxuICAgICAgLm1hcCgoZSkgPT4gKHtcclxuICAgICAgICB0eXBlOiBudWxsdGhyb3dzKGUuYm9keS5kYXRhKS50eXBlLFxyXG4gICAgICAgIG1lc3NhZ2U6IGUuYm9keS5vdXRwdXQsXHJcbiAgICAgIH0pKVxyXG4gICAgY29uc3QgbnVjbGlkZVRyYWNrU3RyZWFtID0gb3V0cHV0RXZlbnRzLmZpbHRlcigoZSkgPT4gZS5ib2R5LmNhdGVnb3J5ID09PSBcIm51Y2xpZGVfdHJhY2tcIilcclxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoXHJcbiAgICAgIG5vdGlmaWNhdGlvblN0cmVhbS5zdWJzY3JpYmUoKHsgdHlwZSwgbWVzc2FnZSB9KSA9PiB7XHJcbiAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZCh0eXBlLCBtZXNzYWdlKVxyXG4gICAgICB9KSxcclxuICAgICAgbnVjbGlkZVRyYWNrU3RyZWFtLnN1YnNjcmliZSgoZSkgPT4ge1xyXG4gICAgICAgIHRyYWNrKGUuYm9keS5vdXRwdXQsIGUuYm9keS5kYXRhIHx8IHt9KVxyXG4gICAgICB9KVxyXG4gICAgKVxyXG5cclxuICAgIGNvbnN0IGNyZWF0ZUNvbnNvbGUgPSBnZXRDb25zb2xlU2VydmljZSgpXHJcbiAgICBpZiAoY3JlYXRlQ29uc29sZSAhPSBudWxsKSB7XHJcbiAgICAgIGNvbnN0IG5hbWUgPSBnZXREZWJ1Z2dlck5hbWUocHJvY2Vzcy5jb25maWd1cmF0aW9uLmFkYXB0ZXJUeXBlKVxyXG4gICAgICBjb25zdCBjb25zb2xlQXBpID0gY3JlYXRlQ29uc29sZSh7XHJcbiAgICAgICAgaWQ6IG5hbWUsXHJcbiAgICAgICAgbmFtZSxcclxuICAgICAgfSlcclxuICAgICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmFkZChjb25zb2xlQXBpKVxyXG4gICAgICBjb25zdCBDQVRFR09SSUVTX01BUCA9IG5ldyBNYXAoW1xyXG4gICAgICAgIFtcInN0ZGVyclwiLCBcImVycm9yXCJdLFxyXG4gICAgICAgIFtcImNvbnNvbGVcIiwgXCJ3YXJuaW5nXCJdLFxyXG4gICAgICAgIFtcInN1Y2Nlc3NcIiwgXCJzdWNjZXNzXCJdLFxyXG4gICAgICBdKVxyXG4gICAgICBjb25zdCBJR05PUkVEX0NBVEVHT1JJRVMgPSBuZXcgU2V0KFtcInRlbGVtZXRyeVwiLCBcIm51Y2xpZGVfbm90aWZpY2F0aW9uXCIsIFwibnVjbGlkZV90cmFja1wiXSlcclxuICAgICAgY29uc3QgbG9nU3RyZWFtID0gb3V0cHV0RXZlbnRzXHJcbiAgICAgICAgLmZpbHRlcigoZSkgPT4gZS5ib2R5LnZhcmlhYmxlc1JlZmVyZW5jZSA9PSBudWxsKVxyXG4gICAgICAgIC5maWx0ZXIoKGUpID0+ICFJR05PUkVEX0NBVEVHT1JJRVMuaGFzKGUuYm9keS5jYXRlZ29yeSkpXHJcbiAgICAgICAgLm1hcCgoZSkgPT4gKHtcclxuICAgICAgICAgIHRleHQ6IHN0cmlwQW5zaShlLmJvZHkub3V0cHV0KSxcclxuICAgICAgICAgIGxldmVsOiBDQVRFR09SSUVTX01BUC5nZXQoZS5ib2R5LmNhdGVnb3J5KSB8fCBcImxvZ1wiLFxyXG4gICAgICAgIH0pKVxyXG4gICAgICAgIC5maWx0ZXIoKGUpID0+IGUubGV2ZWwgIT0gbnVsbClcclxuICAgICAgY29uc3Qgb2JqZWN0U3RyZWFtID0gb3V0cHV0RXZlbnRzXHJcbiAgICAgICAgLmZpbHRlcigoZSkgPT4gZS5ib2R5LnZhcmlhYmxlc1JlZmVyZW5jZSAhPSBudWxsKVxyXG4gICAgICAgIC5tYXAoKGUpID0+ICh7XHJcbiAgICAgICAgICBjYXRlZ29yeTogZS5ib2R5LmNhdGVnb3J5LFxyXG4gICAgICAgICAgdmFyaWFibGVzUmVmZXJlbmNlOiBudWxsdGhyb3dzKGUuYm9keS52YXJpYWJsZXNSZWZlcmVuY2UpLFxyXG4gICAgICAgIH0pKVxyXG5cclxuICAgICAgbGV0IGxhc3RFbnRyeVRva2VuOiA/UmVjb3JkVG9rZW4gPSBudWxsXHJcbiAgICAgIGNvbnN0IGhhbmRsZU1lc3NhZ2UgPSAobGluZSwgbGV2ZWwpID0+IHtcclxuICAgICAgICBjb25zdCBjb21wbGV0ZSA9IGxpbmUuZW5kc1dpdGgoXCJcXG5cIilcclxuICAgICAgICBjb25zdCBzYW1lTGV2ZWwgPSBsYXN0RW50cnlUb2tlbiAhPSBudWxsICYmIGxhc3RFbnRyeVRva2VuLmdldEN1cnJlbnRMZXZlbCgpID09PSBsZXZlbFxyXG4gICAgICAgIGlmIChzYW1lTGV2ZWwpIHtcclxuICAgICAgICAgIGxhc3RFbnRyeVRva2VuID0gbnVsbHRocm93cyhsYXN0RW50cnlUb2tlbikuYXBwZW5kVGV4dChsaW5lKVxyXG4gICAgICAgICAgaWYgKGNvbXBsZXRlKSB7XHJcbiAgICAgICAgICAgIGxhc3RFbnRyeVRva2VuLnNldENvbXBsZXRlKClcclxuICAgICAgICAgICAgbGFzdEVudHJ5VG9rZW4gPSBudWxsXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgIGlmIChsYXN0RW50cnlUb2tlbiAhPSBudWxsKSB7XHJcbiAgICAgICAgICAgIGxhc3RFbnRyeVRva2VuLnNldENvbXBsZXRlKClcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIGxhc3RFbnRyeVRva2VuID0gY29uc29sZUFwaS5hcHBlbmQoe1xyXG4gICAgICAgICAgICB0ZXh0OiBsaW5lLFxyXG4gICAgICAgICAgICBsZXZlbCxcclxuICAgICAgICAgICAgaW5jb21wbGV0ZTogIWNvbXBsZXRlLFxyXG4gICAgICAgICAgfSlcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmFkZChcclxuICAgICAgICBsb2dTdHJlYW0uc3Vic2NyaWJlKChlKSA9PiBoYW5kbGVNZXNzYWdlKGUudGV4dCwgZS5sZXZlbCkpLFxyXG4gICAgICAgIG5vdGlmaWNhdGlvblN0cmVhbS5zdWJzY3JpYmUoKHsgdHlwZSwgbWVzc2FnZSB9KSA9PiB7XHJcbiAgICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkKHR5cGUsIG1lc3NhZ2UpXHJcbiAgICAgICAgfSksXHJcbiAgICAgICAgb2JqZWN0U3RyZWFtLnN1YnNjcmliZSgoeyBjYXRlZ29yeSwgdmFyaWFibGVzUmVmZXJlbmNlIH0pID0+IHtcclxuICAgICAgICAgIGNvbnN0IGxldmVsID0gQ0FURUdPUklFU19NQVAuZ2V0KGNhdGVnb3J5KSB8fCBcImxvZ1wiXHJcbiAgICAgICAgICBjb25zdCBjb250YWluZXIgPSBuZXcgRXhwcmVzc2lvbkNvbnRhaW5lcih0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3MsIHZhcmlhYmxlc1JlZmVyZW5jZSwgdXVpZC52NCgpKVxyXG4gICAgICAgICAgY29udGFpbmVyLmdldENoaWxkcmVuKCkudGhlbigoY2hpbGRyZW4pID0+IHtcclxuICAgICAgICAgICAgdGhpcy5fY29uc29sZU91dHB1dC5uZXh0KHtcclxuICAgICAgICAgICAgICB0ZXh0OiBgb2JqZWN0WyR7Y2hpbGRyZW4ubGVuZ3RofV1gLFxyXG4gICAgICAgICAgICAgIGV4cHJlc3Npb25zOiBjaGlsZHJlbixcclxuICAgICAgICAgICAgICBsZXZlbCxcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgfSksXHJcbiAgICAgICAgKCkgPT4ge1xyXG4gICAgICAgICAgaWYgKGxhc3RFbnRyeVRva2VuICE9IG51bGwpIHtcclxuICAgICAgICAgICAgbGFzdEVudHJ5VG9rZW4uc2V0Q29tcGxldGUoKVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgbGFzdEVudHJ5VG9rZW4gPSBudWxsXHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIFRPRE8gaGFuZGxlIG5vbiBzdHJpbmcgb3V0cHV0IChlLmcuIGZpbGVzKVxyXG4gICAgICApXHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmFkZChcclxuICAgICAgc2Vzc2lvblxyXG4gICAgICAgIC5vYnNlcnZlQnJlYWtwb2ludEV2ZW50cygpXHJcbiAgICAgICAgLmZsYXRNYXAoKGV2ZW50KSA9PiB7XHJcbiAgICAgICAgICBjb25zdCB7IGJyZWFrcG9pbnQsIHJlYXNvbiB9ID0gZXZlbnQuYm9keVxyXG4gICAgICAgICAgaWYgKHJlYXNvbiAhPT0gQnJlYWtwb2ludEV2ZW50UmVhc29ucy5DSEFOR0VEICYmIHJlYXNvbiAhPT0gQnJlYWtwb2ludEV2ZW50UmVhc29ucy5SRU1PVkVEKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLm9mKHtcclxuICAgICAgICAgICAgICByZWFzb24sXHJcbiAgICAgICAgICAgICAgYnJlYWtwb2ludCxcclxuICAgICAgICAgICAgICBzb3VyY2VCcmVha3BvaW50OiBudWxsLFxyXG4gICAgICAgICAgICAgIGZ1bmN0aW9uQnJlYWtwb2ludDogbnVsbCxcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAvLyBCcmVha3BvaW50IGV2ZW50cyBtYXkgYXJyaXZlIHNvb25lciB0aGFuIHRoZWlyIHJlc3BvbnNlcy5cclxuICAgICAgICAgIC8vIEhlbmNlLCB3ZSdsbCBrZWVwIHRoZW0gY2FjaGVkIGFuZCB0cnkgcmUtcHJvY2Vzc2luZyBvbiBldmVyeSBjaGFuZ2UgdG8gdGhlIG1vZGVsJ3MgYnJlYWtwb2ludHNcclxuICAgICAgICAgIC8vIGZvciBhIHNldCBtYXhpbXVtIHRpbWUsIHRoZW4gZGlzY2FyZC5cclxuICAgICAgICAgIHJldHVybiBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKHRoaXMuX21vZGVsLm9uRGlkQ2hhbmdlQnJlYWtwb2ludHMuYmluZCh0aGlzLl9tb2RlbCkpXHJcbiAgICAgICAgICAgIC5zdGFydFdpdGgobnVsbClcclxuICAgICAgICAgICAgLnN3aXRjaE1hcCgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgY29uc3Qgc291cmNlQnJlYWtwb2ludCA9IHRoaXMuX21vZGVsXHJcbiAgICAgICAgICAgICAgICAuZ2V0QnJlYWtwb2ludHMoKVxyXG4gICAgICAgICAgICAgICAgLmZpbHRlcigoYikgPT4gYi5pZEZyb21BZGFwdGVyID09PSBicmVha3BvaW50LmlkKVxyXG4gICAgICAgICAgICAgICAgLnBvcCgpXHJcbiAgICAgICAgICAgICAgY29uc3QgZnVuY3Rpb25CcmVha3BvaW50ID0gdGhpcy5fbW9kZWxcclxuICAgICAgICAgICAgICAgIC5nZXRGdW5jdGlvbkJyZWFrcG9pbnRzKClcclxuICAgICAgICAgICAgICAgIC5maWx0ZXIoKGIpID0+IGIuaWRGcm9tQWRhcHRlciA9PT0gYnJlYWtwb2ludC5pZClcclxuICAgICAgICAgICAgICAgIC5wb3AoKVxyXG4gICAgICAgICAgICAgIGlmIChzb3VyY2VCcmVha3BvaW50ID09IG51bGwgJiYgZnVuY3Rpb25CcmVha3BvaW50ID09IG51bGwpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLmVtcHR5KClcclxuICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE9ic2VydmFibGUub2Yoe1xyXG4gICAgICAgICAgICAgICAgICByZWFzb24sXHJcbiAgICAgICAgICAgICAgICAgIGJyZWFrcG9pbnQsXHJcbiAgICAgICAgICAgICAgICAgIHNvdXJjZUJyZWFrcG9pbnQsXHJcbiAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uQnJlYWtwb2ludCxcclxuICAgICAgICAgICAgICAgIH0pXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAudGFrZSgxKVxyXG4gICAgICAgICAgICAudGltZW91dChNQVhfQlJFQUtQT0lOVF9FVkVOVF9ERUxBWV9NUylcclxuICAgICAgICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xyXG4gICAgICAgICAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFRpbWVvdXRFcnJvcikge1xyXG4gICAgICAgICAgICAgICAgbG9nZ2VyLmVycm9yKFxyXG4gICAgICAgICAgICAgICAgICBcIlRpbWVkIG91dCBicmVha3BvaW50IGV2ZW50IGhhbmRsZXJcIixcclxuICAgICAgICAgICAgICAgICAgcHJvY2Vzcy5jb25maWd1cmF0aW9uLmFkYXB0ZXJUeXBlLFxyXG4gICAgICAgICAgICAgICAgICByZWFzb24sXHJcbiAgICAgICAgICAgICAgICAgIGJyZWFrcG9pbnRcclxuICAgICAgICAgICAgICAgIClcclxuICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgcmV0dXJuIE9ic2VydmFibGUuZW1wdHkoKVxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLnN1YnNjcmliZSgoeyByZWFzb24sIGJyZWFrcG9pbnQsIHNvdXJjZUJyZWFrcG9pbnQsIGZ1bmN0aW9uQnJlYWtwb2ludCB9KSA9PiB7XHJcbiAgICAgICAgICBpZiAocmVhc29uID09PSBCcmVha3BvaW50RXZlbnRSZWFzb25zLk5FVyAmJiBicmVha3BvaW50LnNvdXJjZSkge1xyXG4gICAgICAgICAgICAvLyBUaGUgZGVidWcgYWRhcHRlciBpcyBhZGRpbmcgYSBuZXcgKHVuZXhwZWN0ZWQpIGJyZWFrcG9pbnQgdG8gdGhlIFVJLlxyXG4gICAgICAgICAgICAvLyBUT0RPOiBDb25zaWRlciBhZGRpbmcgdGhpcyB0byB0aGUgY3VycmVudCBwcm9jZXNzIG9ubHkuXHJcbiAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IHByb2Nlc3MuZ2V0U291cmNlKGJyZWFrcG9pbnQuc291cmNlKVxyXG4gICAgICAgICAgICB0aGlzLl9tb2RlbC5hZGRVSUJyZWFrcG9pbnRzKFxyXG4gICAgICAgICAgICAgIFtcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgY29sdW1uOiBicmVha3BvaW50LmNvbHVtbiB8fCAwLFxyXG4gICAgICAgICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgICBsaW5lOiBicmVha3BvaW50LmxpbmUgPT0gbnVsbCA/IC0xIDogYnJlYWtwb2ludC5saW5lLFxyXG4gICAgICAgICAgICAgICAgICB1cmk6IHNvdXJjZS51cmksXHJcbiAgICAgICAgICAgICAgICAgIGlkOiB1dWlkLnY0KCksXHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgIF0sXHJcbiAgICAgICAgICAgICAgZmFsc2VcclxuICAgICAgICAgICAgKVxyXG4gICAgICAgICAgfSBlbHNlIGlmIChyZWFzb24gPT09IEJyZWFrcG9pbnRFdmVudFJlYXNvbnMuUkVNT1ZFRCkge1xyXG4gICAgICAgICAgICBpZiAoc291cmNlQnJlYWtwb2ludCAhPSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgdGhpcy5fbW9kZWwucmVtb3ZlQnJlYWtwb2ludHMoW3NvdXJjZUJyZWFrcG9pbnRdKVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChmdW5jdGlvbkJyZWFrcG9pbnQgIT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgIHRoaXMuX21vZGVsLnJlbW92ZUZ1bmN0aW9uQnJlYWtwb2ludHMoZnVuY3Rpb25CcmVha3BvaW50LmdldElkKCkpXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0gZWxzZSBpZiAocmVhc29uID09PSBCcmVha3BvaW50RXZlbnRSZWFzb25zLkNIQU5HRUQpIHtcclxuICAgICAgICAgICAgaWYgKHNvdXJjZUJyZWFrcG9pbnQgIT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgIGlmICghc291cmNlQnJlYWtwb2ludC5jb2x1bW4pIHtcclxuICAgICAgICAgICAgICAgIGJyZWFrcG9pbnQuY29sdW1uID0gdW5kZWZpbmVkXHJcbiAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgIHRoaXMuX21vZGVsLnVwZGF0ZVByb2Nlc3NCcmVha3BvaW50cyhwcm9jZXNzLCB7XHJcbiAgICAgICAgICAgICAgICBbc291cmNlQnJlYWtwb2ludC5nZXRJZCgpXTogYnJlYWtwb2ludCxcclxuICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChmdW5jdGlvbkJyZWFrcG9pbnQgIT0gbnVsbCkge1xyXG4gICAgICAgICAgICAgIHRoaXMuX21vZGVsLnVwZGF0ZUZ1bmN0aW9uQnJlYWtwb2ludHMoe1xyXG4gICAgICAgICAgICAgICAgW2Z1bmN0aW9uQnJlYWtwb2ludC5nZXRJZCgpXTogYnJlYWtwb2ludCxcclxuICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBsb2dnZXIud2FybihcIlVua25vd24gYnJlYWtwb2ludCBldmVudFwiLCByZWFzb24sIGJyZWFrcG9pbnQpXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSlcclxuICAgIClcclxuXHJcbiAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuYWRkKFxyXG4gICAgICBzZXNzaW9uLm9ic2VydmVBZGFwdGVyRXhpdGVkRXZlbnRzKCkuc3Vic2NyaWJlKChldmVudCkgPT4ge1xyXG4gICAgICAgIC8vICdSdW4gd2l0aG91dCBkZWJ1Z2dpbmcnIG1vZGUgVlNDb2RlIG11c3QgdGVybWluYXRlIHRoZSBleHRlbnNpb24gaG9zdC4gTW9yZSBkZXRhaWxzOiAjMzkwNVxyXG4gICAgICAgIHRoaXMuX29uU2Vzc2lvbkVuZChzZXNzaW9uKVxyXG4gICAgICB9KVxyXG4gICAgKVxyXG5cclxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoXHJcbiAgICAgIHNlc3Npb24ub2JzZXJ2ZUN1c3RvbUV2ZW50cygpLnN1YnNjcmliZSgoZXZlbnQpID0+IHtcclxuICAgICAgICB0aGlzLl9lbWl0dGVyLmVtaXQoQ1VTVE9NX0RFQlVHX0VWRU5ULCBldmVudClcclxuICAgICAgfSlcclxuICAgIClcclxuXHJcbiAgICAvLyBDbGVhciBpbiBtZW1vcnkgYnJlYWtwb2ludHMuXHJcbiAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuYWRkKCgpID0+IHtcclxuICAgICAgY29uc3Qgc291cmNlUmVmQnJlYWtwb2ludHMgPSB0aGlzLl9tb2RlbC5nZXRCcmVha3BvaW50cygpLmZpbHRlcigoYnApID0+IGJwLnVyaS5zdGFydHNXaXRoKERFQlVHX1NPVVJDRVNfVVJJKSlcclxuICAgICAgaWYgKHNvdXJjZVJlZkJyZWFrcG9pbnRzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICB0aGlzLl9tb2RlbC5yZW1vdmVCcmVha3BvaW50cyhzb3VyY2VSZWZCcmVha3BvaW50cylcclxuICAgICAgfVxyXG4gICAgfSlcclxuICB9XHJcblxyXG4gIF9zY2hlZHVsZU5hdGl2ZU5vdGlmaWNhdGlvbigpOiB2b2lkIHtcclxuICAgIGNvbnN0IHJhaXNlTmF0aXZlTm90aWZpY2F0aW9uID0gZ2V0Tm90aWZpY2F0aW9uU2VydmljZSgpXHJcbiAgICBpZiAocmFpc2VOYXRpdmVOb3RpZmljYXRpb24gIT0gbnVsbCkge1xyXG4gICAgICBjb25zdCBwZW5kaW5nTm90aWZpY2F0aW9uID0gcmFpc2VOYXRpdmVOb3RpZmljYXRpb24oXCJEZWJ1Z2dlclwiLCBcIlBhdXNlZCBhdCBhIGJyZWFrcG9pbnRcIiwgMzAwMCwgZmFsc2UpXHJcbiAgICAgIGlmIChwZW5kaW5nTm90aWZpY2F0aW9uICE9IG51bGwpIHtcclxuICAgICAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuYWRkKHBlbmRpbmdOb3RpZmljYXRpb24pXHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIG9uRGlkQ2hhbmdlQWN0aXZlVGhyZWFkKGNhbGxiYWNrOiAoKSA9PiBtaXhlZCk6IElEaXNwb3NhYmxlIHtcclxuICAgIHJldHVybiB0aGlzLl9lbWl0dGVyLm9uKEFDVElWRV9USFJFQURfQ0hBTkdFRCwgY2FsbGJhY2spXHJcbiAgfVxyXG5cclxuICBvbkRpZFN0YXJ0RGVidWdTZXNzaW9uKGNhbGxiYWNrOiAoY29uZmlnOiBJUHJvY2Vzc0NvbmZpZykgPT4gbWl4ZWQpOiBJRGlzcG9zYWJsZSB7XHJcbiAgICByZXR1cm4gdGhpcy5fZW1pdHRlci5vbihTVEFSVF9ERUJVR19TRVNTSU9OLCBjYWxsYmFjaylcclxuICB9XHJcblxyXG4gIG9uRGlkQ3VzdG9tRXZlbnQoY2FsbGJhY2s6IChldmVudDogRGVidWdQcm90b2NvbC5EZWJ1Z0V2ZW50KSA9PiBtaXhlZCk6IElEaXNwb3NhYmxlIHtcclxuICAgIHJldHVybiB0aGlzLl9lbWl0dGVyLm9uKENVU1RPTV9ERUJVR19FVkVOVCwgY2FsbGJhY2spXHJcbiAgfVxyXG5cclxuICBvbkRpZENoYW5nZVByb2Nlc3NNb2RlKGNhbGxiYWNrOiAoZGF0YTogeyBwcm9jZXNzOiBJUHJvY2VzcywgbW9kZTogRGVidWdnZXJNb2RlVHlwZSB9KSA9PiBtaXhlZCk6IElEaXNwb3NhYmxlIHtcclxuICAgIHJldHVybiB0aGlzLl9lbWl0dGVyLm9uKENIQU5HRV9ERUJVR19NT0RFLCBjYWxsYmFjaylcclxuICB9XHJcblxyXG4gIF9sb2FkQnJlYWtwb2ludHMoc3RhdGU6ID9TZXJpYWxpemVkU3RhdGUpOiBJVUlCcmVha3BvaW50W10ge1xyXG4gICAgbGV0IHJlc3VsdDogSVVJQnJlYWtwb2ludFtdID0gW11cclxuICAgIGlmIChzdGF0ZSA9PSBudWxsIHx8IHN0YXRlLnNvdXJjZUJyZWFrcG9pbnRzID09IG51bGwpIHtcclxuICAgICAgcmV0dXJuIHJlc3VsdFxyXG4gICAgfVxyXG4gICAgdHJ5IHtcclxuICAgICAgcmVzdWx0ID0gc3RhdGUuc291cmNlQnJlYWtwb2ludHMubWFwKChicmVha3BvaW50KSA9PiB7XHJcbiAgICAgICAgY29uc3QgYnA6IElVSUJyZWFrcG9pbnQgPSB7XHJcbiAgICAgICAgICB1cmk6IGJyZWFrcG9pbnQudXJpLFxyXG4gICAgICAgICAgbGluZTogYnJlYWtwb2ludC5vcmlnaW5hbExpbmUsXHJcbiAgICAgICAgICBjb2x1bW46IGJyZWFrcG9pbnQuY29sdW1uLFxyXG4gICAgICAgICAgZW5hYmxlZDogYnJlYWtwb2ludC5lbmFibGVkLFxyXG4gICAgICAgICAgaWQ6IHV1aWQudjQoKSxcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGJyZWFrcG9pbnQuY29uZGl0aW9uICE9IG51bGwgJiYgYnJlYWtwb2ludC5jb25kaXRpb24udHJpbSgpICE9PSBcIlwiKSB7XHJcbiAgICAgICAgICBicC5jb25kaXRpb24gPSBicmVha3BvaW50LmNvbmRpdGlvblxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoYnJlYWtwb2ludC5sb2dNZXNzYWdlICE9IG51bGwgJiYgYnJlYWtwb2ludC5sb2dNZXNzYWdlLnRyaW0oKSAhPT0gXCJcIikge1xyXG4gICAgICAgICAgYnAubG9nTWVzc2FnZSA9IGJyZWFrcG9pbnQubG9nTWVzc2FnZVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gYnBcclxuICAgICAgfSlcclxuICAgIH0gY2F0Y2ggKGUpIHt9XHJcblxyXG4gICAgcmV0dXJuIHJlc3VsdFxyXG4gIH1cclxuXHJcbiAgX2xvYWRGdW5jdGlvbkJyZWFrcG9pbnRzKHN0YXRlOiA/U2VyaWFsaXplZFN0YXRlKTogRnVuY3Rpb25CcmVha3BvaW50W10ge1xyXG4gICAgbGV0IHJlc3VsdDogRnVuY3Rpb25CcmVha3BvaW50W10gPSBbXVxyXG4gICAgaWYgKHN0YXRlID09IG51bGwgfHwgc3RhdGUuZnVuY3Rpb25CcmVha3BvaW50cyA9PSBudWxsKSB7XHJcbiAgICAgIHJldHVybiByZXN1bHRcclxuICAgIH1cclxuICAgIHRyeSB7XHJcbiAgICAgIHJlc3VsdCA9IHN0YXRlLmZ1bmN0aW9uQnJlYWtwb2ludHMubWFwKChmYikgPT4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgRnVuY3Rpb25CcmVha3BvaW50KGZiLm5hbWUsIGZiLmVuYWJsZWQsIGZiLmhpdENvbmRpdGlvbilcclxuICAgICAgfSlcclxuICAgIH0gY2F0Y2ggKGUpIHt9XHJcblxyXG4gICAgcmV0dXJuIHJlc3VsdFxyXG4gIH1cclxuXHJcbiAgX2xvYWRFeGNlcHRpb25CcmVha3BvaW50cyhzdGF0ZTogP1NlcmlhbGl6ZWRTdGF0ZSk6IEV4Y2VwdGlvbkJyZWFrcG9pbnRbXSB7XHJcbiAgICBsZXQgcmVzdWx0OiBFeGNlcHRpb25CcmVha3BvaW50W10gPSBbXVxyXG4gICAgaWYgKHN0YXRlID09IG51bGwgfHwgc3RhdGUuZXhjZXB0aW9uQnJlYWtwb2ludHMgPT0gbnVsbCkge1xyXG4gICAgICByZXR1cm4gcmVzdWx0XHJcbiAgICB9XHJcbiAgICB0cnkge1xyXG4gICAgICByZXN1bHQgPSBzdGF0ZS5leGNlcHRpb25CcmVha3BvaW50cy5tYXAoKGV4QnJlYWtwb2ludCkgPT4ge1xyXG4gICAgICAgIHJldHVybiBuZXcgRXhjZXB0aW9uQnJlYWtwb2ludChleEJyZWFrcG9pbnQuZmlsdGVyLCBleEJyZWFrcG9pbnQubGFiZWwsIGV4QnJlYWtwb2ludC5lbmFibGVkKVxyXG4gICAgICB9KVxyXG4gICAgfSBjYXRjaCAoZSkge31cclxuXHJcbiAgICByZXR1cm4gcmVzdWx0XHJcbiAgfVxyXG5cclxuICBfbG9hZFdhdGNoRXhwcmVzc2lvbnMoc3RhdGU6ID9TZXJpYWxpemVkU3RhdGUpOiBFeHByZXNzaW9uW10ge1xyXG4gICAgbGV0IHJlc3VsdDogRXhwcmVzc2lvbltdID0gW11cclxuICAgIGlmIChzdGF0ZSA9PSBudWxsIHx8IHN0YXRlLndhdGNoRXhwcmVzc2lvbnMgPT0gbnVsbCkge1xyXG4gICAgICByZXR1cm4gcmVzdWx0XHJcbiAgICB9XHJcbiAgICB0cnkge1xyXG4gICAgICByZXN1bHQgPSBzdGF0ZS53YXRjaEV4cHJlc3Npb25zLm1hcCgobmFtZSkgPT4gbmV3IEV4cHJlc3Npb24obmFtZSkpXHJcbiAgICB9IGNhdGNoIChlKSB7fVxyXG5cclxuICAgIHJldHVybiByZXN1bHRcclxuICB9XHJcblxyXG4gIF9vbkRlYnVnZ2VyTW9kZUNoYW5nZWQocHJvY2VzczogSVByb2Nlc3MsIG1vZGU6IERlYnVnZ2VyTW9kZVR5cGUpOiB2b2lkIHtcclxuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChDSEFOR0VfREVCVUdfTU9ERSwge1xyXG4gICAgICBkYXRhOiB7XHJcbiAgICAgICAgcHJvY2VzcyxcclxuICAgICAgICBtb2RlLFxyXG4gICAgICB9LFxyXG4gICAgfSlcclxuICB9XHJcblxyXG4gIGVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzKGVuYWJsZTogYm9vbGVhbiwgYnJlYWtwb2ludD86IElFbmFibGVhYmxlKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBpZiAoYnJlYWtwb2ludCAhPSBudWxsKSB7XHJcbiAgICAgIHRoaXMuX21vZGVsLnNldEVuYWJsZW1lbnQoYnJlYWtwb2ludCwgZW5hYmxlKVxyXG4gICAgICBpZiAoYnJlYWtwb2ludCBpbnN0YW5jZW9mIEJyZWFrcG9pbnQpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5fc2VuZEJyZWFrcG9pbnRzKGJyZWFrcG9pbnQudXJpKVxyXG4gICAgICB9IGVsc2UgaWYgKGJyZWFrcG9pbnQgaW5zdGFuY2VvZiBGdW5jdGlvbkJyZWFrcG9pbnQpIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5fc2VuZEZ1bmN0aW9uQnJlYWtwb2ludHMoKVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9UT0dHTEVfRVhDRVBUSU9OX0JSRUFLUE9JTlQpXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NlbmRFeGNlcHRpb25CcmVha3BvaW50cygpXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0aGlzLl9tb2RlbC5lbmFibGVPckRpc2FibGVBbGxCcmVha3BvaW50cyhlbmFibGUpXHJcbiAgICByZXR1cm4gdGhpcy5fc2VuZEFsbEJyZWFrcG9pbnRzKClcclxuICB9XHJcblxyXG4gIGFzeW5jIGFkZFVJQnJlYWtwb2ludHModWlCcmVha3BvaW50czogSVVJQnJlYWtwb2ludFtdKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfQlJFQUtQT0lOVF9BREQpXHJcbiAgICB0aGlzLl9tb2RlbC5hZGRVSUJyZWFrcG9pbnRzKHVpQnJlYWtwb2ludHMpXHJcblxyXG4gICAgY29uc3QgdXJpcyA9IG5ldyBTZXQoKVxyXG4gICAgZm9yIChjb25zdCBicCBvZiB1aUJyZWFrcG9pbnRzKSB7XHJcbiAgICAgIHVyaXMuYWRkKGJwLnVyaSlcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBwcm9taXNlcyA9IFtdXHJcbiAgICBmb3IgKGNvbnN0IHVyaSBvZiB1cmlzKSB7XHJcbiAgICAgIHByb21pc2VzLnB1c2godGhpcy5fc2VuZEJyZWFrcG9pbnRzKHVyaSkpXHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpXHJcbiAgfVxyXG5cclxuICBhZGRTb3VyY2VCcmVha3BvaW50KHVyaTogc3RyaW5nLCBsaW5lOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9CUkVBS1BPSU5UX1NJTkdMRV9BREQpXHJcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuX21vZGVsLmdldEJyZWFrcG9pbnRBdExpbmUodXJpLCBsaW5lKVxyXG4gICAgaWYgKGV4aXN0aW5nID09IG51bGwpIHtcclxuICAgICAgcmV0dXJuIHRoaXMuYWRkVUlCcmVha3BvaW50cyhbeyBsaW5lLCBjb2x1bW46IDAsIGVuYWJsZWQ6IHRydWUsIGlkOiB1dWlkLnY0KCksIHVyaSB9XSlcclxuICAgIH1cclxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKVxyXG4gIH1cclxuXHJcbiAgdG9nZ2xlU291cmNlQnJlYWtwb2ludCh1cmk6IHN0cmluZywgbGluZTogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfQlJFQUtQT0lOVF9UT0dHTEUpXHJcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuX21vZGVsLmdldEJyZWFrcG9pbnRBdExpbmUodXJpLCBsaW5lKVxyXG4gICAgaWYgKGV4aXN0aW5nID09IG51bGwpIHtcclxuICAgICAgcmV0dXJuIHRoaXMuYWRkVUlCcmVha3BvaW50cyhbeyBsaW5lLCBjb2x1bW46IDAsIGVuYWJsZWQ6IHRydWUsIGlkOiB1dWlkLnY0KCksIHVyaSB9XSlcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHJldHVybiB0aGlzLnJlbW92ZUJyZWFrcG9pbnRzKGV4aXN0aW5nLmdldElkKCksIHRydWUpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICB1cGRhdGVCcmVha3BvaW50cyh1aUJyZWFrcG9pbnRzOiBJVUlCcmVha3BvaW50W10pIHtcclxuICAgIHRoaXMuX21vZGVsLnVwZGF0ZUJyZWFrcG9pbnRzKHVpQnJlYWtwb2ludHMpXHJcblxyXG4gICAgY29uc3QgdXJpc1RvU2VuZCA9IG5ldyBTZXQodWlCcmVha3BvaW50cy5tYXAoKGJwKSA9PiBicC51cmkpKVxyXG4gICAgZm9yIChjb25zdCB1cmkgb2YgdXJpc1RvU2VuZCkge1xyXG4gICAgICB0aGlzLl9icmVha3BvaW50c1RvU2VuZE9uU2F2ZS5hZGQodXJpKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgcmVtb3ZlQnJlYWtwb2ludHMoaWQ/OiBzdHJpbmcsIHNraXBBbmFseXRpY3M/OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IHRvUmVtb3ZlID0gdGhpcy5fbW9kZWwuZ2V0QnJlYWtwb2ludHMoKS5maWx0ZXIoKGJwKSA9PiBpZCA9PSBudWxsIHx8IGJwLmdldElkKCkgPT09IGlkKVxyXG4gICAgY29uc3QgdXJpc1RvQ2xlYXIgPSBkaXN0aW5jdCh0b1JlbW92ZSwgKGJwKSA9PiBicC51cmkpLm1hcCgoYnApID0+IGJwLnVyaSlcclxuXHJcbiAgICB0aGlzLl9tb2RlbC5yZW1vdmVCcmVha3BvaW50cyh0b1JlbW92ZSlcclxuXHJcbiAgICBpZiAoaWQgPT0gbnVsbCkge1xyXG4gICAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfQlJFQUtQT0lOVF9ERUxFVEVfQUxMKVxyXG4gICAgfSBlbHNlIGlmICghc2tpcEFuYWx5dGljcykge1xyXG4gICAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfQlJFQUtQT0lOVF9ERUxFVEUpXHJcbiAgICB9XHJcblxyXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwodXJpc1RvQ2xlYXIubWFwKCh1cmkpID0+IHRoaXMuX3NlbmRCcmVha3BvaW50cyh1cmkpKSlcclxuICB9XHJcblxyXG4gIHNldEJyZWFrcG9pbnRzQWN0aXZhdGVkKGFjdGl2YXRlZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdGhpcy5fbW9kZWwuc2V0QnJlYWtwb2ludHNBY3RpdmF0ZWQoYWN0aXZhdGVkKVxyXG4gICAgcmV0dXJuIHRoaXMuX3NlbmRBbGxCcmVha3BvaW50cygpXHJcbiAgfVxyXG5cclxuICBhZGRGdW5jdGlvbkJyZWFrcG9pbnQoKTogdm9pZCB7XHJcbiAgICB0aGlzLl9tb2RlbC5hZGRGdW5jdGlvbkJyZWFrcG9pbnQoXCJcIilcclxuICB9XHJcblxyXG4gIHJlbmFtZUZ1bmN0aW9uQnJlYWtwb2ludChpZDogc3RyaW5nLCBuZXdGdW5jdGlvbk5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdGhpcy5fbW9kZWwudXBkYXRlRnVuY3Rpb25CcmVha3BvaW50cyh7IFtpZF06IHsgbmFtZTogbmV3RnVuY3Rpb25OYW1lIH0gfSlcclxuICAgIHJldHVybiB0aGlzLl9zZW5kRnVuY3Rpb25CcmVha3BvaW50cygpXHJcbiAgfVxyXG5cclxuICByZW1vdmVGdW5jdGlvbkJyZWFrcG9pbnRzKGlkPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0aGlzLl9tb2RlbC5yZW1vdmVGdW5jdGlvbkJyZWFrcG9pbnRzKGlkKVxyXG4gICAgcmV0dXJuIHRoaXMuX3NlbmRGdW5jdGlvbkJyZWFrcG9pbnRzKClcclxuICB9XHJcblxyXG4gIGFzeW5jIHRlcm1pbmF0ZVRocmVhZHModGhyZWFkSWRzOiBBcnJheTxudW1iZXI+KTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCB7IGZvY3VzZWRQcm9jZXNzIH0gPSB0aGlzLnZpZXdNb2RlbFxyXG4gICAgaWYgKGZvY3VzZWRQcm9jZXNzID09IG51bGwpIHtcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgc2Vzc2lvbiA9IGZvY3VzZWRQcm9jZXNzLnNlc3Npb25cclxuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9URVJNSU5BVEVfVEhSRUFEKVxyXG4gICAgaWYgKEJvb2xlYW4oc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNUZXJtaW5hdGVUaHJlYWRzUmVxdWVzdCkpIHtcclxuICAgICAgYXdhaXQgc2Vzc2lvbi5jdXN0b20oXCJ0ZXJtaW5hdGVUaHJlYWRzXCIsIHtcclxuICAgICAgICB0aHJlYWRJZHMsXHJcbiAgICAgIH0pXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBhc3luYyBydW5Ub0xvY2F0aW9uKHVyaTogc3RyaW5nLCBsaW5lOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IHsgZm9jdXNlZFRocmVhZCwgZm9jdXNlZFByb2Nlc3MgfSA9IHRoaXMudmlld01vZGVsXHJcbiAgICBpZiAoZm9jdXNlZFRocmVhZCA9PSBudWxsIHx8IGZvY3VzZWRQcm9jZXNzID09IG51bGwpIHtcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgc2Vzc2lvbiA9IGZvY3VzZWRQcm9jZXNzLnNlc3Npb25cclxuXHJcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfU1RFUF9SVU5fVE9fTE9DQVRJT04pXHJcbiAgICBpZiAoQm9vbGVhbihzZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c0NvbnRpbnVlVG9Mb2NhdGlvbikpIHtcclxuICAgICAgYXdhaXQgc2Vzc2lvbi5jdXN0b20oXCJjb250aW51ZVRvTG9jYXRpb25cIiwge1xyXG4gICAgICAgIHNvdXJjZTogZm9jdXNlZFByb2Nlc3MuZ2V0U291cmNlKHsgcGF0aDogdXJpIH0pLnJhdyxcclxuICAgICAgICBsaW5lLFxyXG4gICAgICAgIHRocmVhZElkOiBmb2N1c2VkVGhyZWFkLnRocmVhZElkLFxyXG4gICAgICB9KVxyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fbW9kZWwuZ2V0QnJlYWtwb2ludEF0TGluZSh1cmksIGxpbmUpXHJcbiAgICBpZiAoZXhpc3RpbmcgPT0gbnVsbCkge1xyXG4gICAgICBhd2FpdCB0aGlzLmFkZFVJQnJlYWtwb2ludHMoW3sgbGluZSwgY29sdW1uOiAwLCBlbmFibGVkOiB0cnVlLCBpZDogdXVpZC52NCgpLCB1cmkgfV0pXHJcbiAgICAgIGNvbnN0IHJ1blRvTG9jYXRpb25CcmVha3BvaW50ID0gdGhpcy5fbW9kZWwuZ2V0QnJlYWtwb2ludEF0TGluZSh1cmksIGxpbmUpXHJcbiAgICAgIGludmFyaWFudChydW5Ub0xvY2F0aW9uQnJlYWtwb2ludCAhPSBudWxsKVxyXG5cclxuICAgICAgY29uc3QgcmVtb3ZlQnJlYWtwb2ludCA9ICgpID0+IHtcclxuICAgICAgICB0aGlzLnJlbW92ZUJyZWFrcG9pbnRzKHJ1blRvTG9jYXRpb25CcmVha3BvaW50LmdldElkKCksIHRydWUgLyogc2tpcCBhbmFseXRpY3MgKi8pLmNhdGNoKChlcnJvcikgPT5cclxuICAgICAgICAgIG9uVW5leHBlY3RlZEVycm9yKGBGYWlsZWQgdG8gY2xlYXIgcnVuLXRvLWxvY2F0aW9uIGJyZWFrcG9pbnQhIC0gJHtTdHJpbmcoZXJyb3IpfWApXHJcbiAgICAgICAgKVxyXG4gICAgICAgIHJlbW92ZUJyZWFrcG9pbnREaXNwb3NhYmxlLmRpc3Bvc2UoKVxyXG4gICAgICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5yZW1vdmUocmVtb3ZlQnJlYWtwb2ludERpc3Bvc2FibGUpXHJcbiAgICAgICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLnJlbW92ZShyZW1vdmVCcmVha3BvaW50KVxyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBSZW1vdmUgaWYgdGhlIGRlYnVnZ2VyIHN0b3BwZWQgYXQgYW55IGxvY2F0aW9uLlxyXG4gICAgICBjb25zdCByZW1vdmVCcmVha3BvaW50RGlzcG9zYWJsZSA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKFxyXG4gICAgICAgIHNlc3Npb24ub2JzZXJ2ZVN0b3BFdmVudHMoKS50YWtlKDEpLnN1YnNjcmliZShyZW1vdmVCcmVha3BvaW50KVxyXG4gICAgICApXHJcbiAgICAgIC8vIFJlbW92ZSBpZiB0aGUgc2Vzc2lvbiBoYXMgZW5kZWQgd2l0aG91dCBoaXR0aW5nIGl0LlxyXG4gICAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuYWRkKHJlbW92ZUJyZWFrcG9pbnREaXNwb3NhYmxlLCByZW1vdmVCcmVha3BvaW50KVxyXG4gICAgfVxyXG4gICAgYXdhaXQgZm9jdXNlZFRocmVhZC5jb250aW51ZSgpXHJcbiAgfVxyXG5cclxuICBhZGRXYXRjaEV4cHJlc3Npb24obmFtZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfV0FUQ0hfQUREX0VYUFJFU1NJT04pXHJcbiAgICByZXR1cm4gdGhpcy5fbW9kZWwuYWRkV2F0Y2hFeHByZXNzaW9uKG5hbWUpXHJcbiAgfVxyXG5cclxuICByZW5hbWVXYXRjaEV4cHJlc3Npb24oaWQ6IHN0cmluZywgbmV3TmFtZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfV0FUQ0hfVVBEQVRFX0VYUFJFU1NJT04pXHJcbiAgICByZXR1cm4gdGhpcy5fbW9kZWwucmVuYW1lV2F0Y2hFeHByZXNzaW9uKGlkLCBuZXdOYW1lKVxyXG4gIH1cclxuXHJcbiAgcmVtb3ZlV2F0Y2hFeHByZXNzaW9ucyhpZD86IHN0cmluZyk6IHZvaWQge1xyXG4gICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX1dBVENIX1JFTU9WRV9FWFBSRVNTSU9OKVxyXG4gICAgdGhpcy5fbW9kZWwucmVtb3ZlV2F0Y2hFeHByZXNzaW9ucyhpZClcclxuICB9XHJcblxyXG4gIGNyZWF0ZUV4cHJlc3Npb24ocmF3RXhwcmVzc2lvbjogc3RyaW5nKTogSUV2YWx1YXRhYmxlRXhwcmVzc2lvbiB7XHJcbiAgICByZXR1cm4gbmV3IEV4cHJlc3Npb24ocmF3RXhwcmVzc2lvbilcclxuICB9XHJcblxyXG4gIGFzeW5jIF9kb0NyZWF0ZVByb2Nlc3MocmF3Q29uZmlndXJhdGlvbjogSVByb2Nlc3NDb25maWcsIHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTw/SVByb2Nlc3M+IHtcclxuICAgIGxldCBwcm9jZXNzOiA/UHJvY2Vzc1xyXG4gICAgbGV0IHNlc3Npb246ID9Wc0RlYnVnU2Vzc2lvblxyXG4gICAgY29uc3QgZXJyb3JIYW5kbGVyID0gKGVycm9yOiBFcnJvcikgPT4ge1xyXG4gICAgICBpZiAodGhpcy5fdGltZXIgIT0gbnVsbCkge1xyXG4gICAgICAgIHRoaXMuX3RpbWVyLm9uRXJyb3IoZXJyb3IpXHJcbiAgICAgICAgdGhpcy5fdGltZXIgPSBudWxsXHJcbiAgICAgIH1cclxuICAgICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX1NUQVJUX0ZBSUwsIHt9KVxyXG4gICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yXHJcbiAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcihgRmFpbGVkIHRvIHN0YXJ0IGRlYnVnZ2VyIHByb2Nlc3M6ICR7ZXJyb3JNZXNzYWdlfWApXHJcblxyXG4gICAgICBpZiAodGhpcy5fbW9kZWwuZ2V0UHJvY2Vzc2VzKCkgPT0gbnVsbCB8fCB0aGlzLl9tb2RlbC5nZXRQcm9jZXNzZXMoKS5sZW5ndGggPT09IDApIHtcclxuICAgICAgICB0aGlzLl9jb25zb2xlRGlzcG9zYWJsZXMuZGlzcG9zZSgpXHJcbiAgICAgIH1cclxuICAgICAgaWYgKHNlc3Npb24gIT0gbnVsbCAmJiAhc2Vzc2lvbi5pc0Rpc2Nvbm5lY3RlZCgpKSB7XHJcbiAgICAgICAgdGhpcy5fb25TZXNzaW9uRW5kKHNlc3Npb24pXHJcbiAgICAgICAgc2Vzc2lvbi5kaXNjb25uZWN0KCkuY2F0Y2gob25VbmV4cGVjdGVkRXJyb3IpXHJcbiAgICAgIH1cclxuICAgICAgaWYgKHByb2Nlc3MgIT0gbnVsbCkge1xyXG4gICAgICAgIHRoaXMuX21vZGVsLnJlbW92ZVByb2Nlc3MocHJvY2Vzcy5nZXRJZCgpKVxyXG4gICAgICAgIHRoaXMuX29uRGVidWdnZXJNb2RlQ2hhbmdlZChwcm9jZXNzLCBEZWJ1Z2dlck1vZGUuU1RPUFBFRClcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgIGxldCBjb25maWd1cmF0aW9uOiBJUHJvY2Vzc0NvbmZpZ1xyXG4gICAgICBsZXQgYWRhcHRlckV4ZWN1dGFibGU6IFZTQWRhcHRlckV4ZWN1dGFibGVJbmZvXHJcbiAgICAgIC8vIGlmIHNlcnZpY2UgZG9lcyBub3QgcHJvdmlkZSBhZGFwdGVyRXhlY3V0YWJsZSB1c2UgdGhlIGhhcmRjb2RlZCB2YWx1ZXMgaW4gZGVidWdnZXItcmVnaXN0cnlcclxuICAgICAgaWYgKCFyYXdDb25maWd1cmF0aW9uLmFkYXB0ZXJFeGVjdXRhYmxlKSB7XHJcbiAgICAgICAgYWRhcHRlckV4ZWN1dGFibGUgPSBhd2FpdCB0aGlzLl9yZXNvbHZlQWRhcHRlckV4ZWN1dGFibGUocmF3Q29uZmlndXJhdGlvbilcclxuICAgICAgICBjb25maWd1cmF0aW9uID0ge1xyXG4gICAgICAgICAgLi4ucmF3Q29uZmlndXJhdGlvbixcclxuICAgICAgICAgIGFkYXB0ZXJFeGVjdXRhYmxlLFxyXG4gICAgICAgIH1cclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBhbHJlYWR5IGFkYXB0ZXJFeGVjdXRhYmxlIGlzIHByb3ZpZGVkIGJ5IHRoZSBwcm92aWRlciBzbyB0aGUgY29uZmlndXJhdGlvbiBpcyBub3QgcmF3LlxyXG4gICAgICAgIGNvbmZpZ3VyYXRpb24gPSByYXdDb25maWd1cmF0aW9uXHJcbiAgICAgIH1cclxuICAgICAgY29uZmlndXJhdGlvbiA9IGF3YWl0IHJlc29sdmVEZWJ1Z0NvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvbilcclxuICAgICAgY29uc3QgeyBhZGFwdGVyVHlwZSwgb25EZWJ1Z1N0YXJ0aW5nQ2FsbGJhY2ssIG9uRGVidWdTdGFydGVkQ2FsbGJhY2ssIG9uRGVidWdSdW5uaW5nQ2FsbGJhY2sgfSA9IGNvbmZpZ3VyYXRpb25cclxuXHJcbiAgICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9TVEFSVCwge1xyXG4gICAgICAgIHNlcnZpY2VOYW1lOiBjb25maWd1cmF0aW9uLmFkYXB0ZXJUeXBlLFxyXG4gICAgICAgIGNsaWVudFR5cGU6IFwiVlNQXCIsXHJcbiAgICAgIH0pXHJcblxyXG4gICAgICBjb25zdCBzZXNzaW9uVGVhcmRvd25EaXNwb3NhYmxlcyA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKClcclxuXHJcbiAgICAgIGNvbnN0IGluc3RhbmNlSW50ZXJmYWNlID0gKG5ld1Nlc3Npb24pID0+IHtcclxuICAgICAgICByZXR1cm4gT2JqZWN0LmZyZWV6ZSh7XHJcbiAgICAgICAgICBjdXN0b21SZXF1ZXN0OiBhc3luYyAocmVxdWVzdDogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuQ3VzdG9tUmVzcG9uc2U+ID0+IHtcclxuICAgICAgICAgICAgcmV0dXJuIG5ld1Nlc3Npb24uY3VzdG9tKHJlcXVlc3QsIGFyZ3MpXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAgb2JzZXJ2ZUN1c3RvbUV2ZW50czogbmV3U2Vzc2lvbi5vYnNlcnZlQ3VzdG9tRXZlbnRzLmJpbmQobmV3U2Vzc2lvbiksXHJcbiAgICAgICAgfSlcclxuICAgICAgfVxyXG5cclxuICAgICAgY29uc3QgY3JlYXRlSW5pdGlhbGl6ZVNlc3Npb24gPSBhc3luYyAoY29uZmlnOiBJUHJvY2Vzc0NvbmZpZykgPT4ge1xyXG4gICAgICAgIGNvbnN0IG5ld1Nlc3Npb24gPSBhd2FpdCB0aGlzLl9jcmVhdGVWc0RlYnVnU2Vzc2lvbihcclxuICAgICAgICAgIGNvbmZpZyxcclxuICAgICAgICAgIGNvbmZpZy5hZGFwdGVyRXhlY3V0YWJsZSB8fCBhZGFwdGVyRXhlY3V0YWJsZSxcclxuICAgICAgICAgIHNlc3Npb25JZFxyXG4gICAgICAgIClcclxuXHJcbiAgICAgICAgLy8gSWYgdGhpcyBpcyB0aGUgZmlyc3QgcHJvY2VzcywgcmVnaXN0ZXIgdGhlIGNvbnNvbGUgZXhlY3V0b3IuXHJcbiAgICAgICAgaWYgKHRoaXMuX21vZGVsLmdldFByb2Nlc3NlcygpLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgdGhpcy5fcmVnaXN0ZXJDb25zb2xlRXhlY3V0b3IoKVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcHJvY2VzcyA9IHRoaXMuX21vZGVsLmFkZFByb2Nlc3MoY29uZmlnLCBuZXdTZXNzaW9uKVxyXG4gICAgICAgIHRoaXMuX3ZpZXdNb2RlbC5zZXRGb2N1c2VkUHJvY2Vzcyhwcm9jZXNzLCBmYWxzZSlcclxuICAgICAgICB0aGlzLl9vbkRlYnVnZ2VyTW9kZUNoYW5nZWQocHJvY2VzcywgRGVidWdnZXJNb2RlLlNUQVJUSU5HKVxyXG4gICAgICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChTVEFSVF9ERUJVR19TRVNTSU9OLCBjb25maWcpXHJcbiAgICAgICAgdGhpcy5fcmVnaXN0ZXJTZXNzaW9uTGlzdGVuZXJzKHByb2Nlc3MsIG5ld1Nlc3Npb24pXHJcbiAgICAgICAgYXRvbS5jb21tYW5kcy5kaXNwYXRjaChhdG9tLnZpZXdzLmdldFZpZXcoYXRvbS53b3Jrc3BhY2UpLCBcImRlYnVnZ2VyOnNob3dcIilcclxuICAgICAgICBhd2FpdCBuZXdTZXNzaW9uLmluaXRpYWxpemUoe1xyXG4gICAgICAgICAgY2xpZW50SUQ6IFwiYXRvbVwiLFxyXG4gICAgICAgICAgYWRhcHRlcklEOiBhZGFwdGVyVHlwZSxcclxuICAgICAgICAgIHBhdGhGb3JtYXQ6IFwicGF0aFwiLFxyXG4gICAgICAgICAgbGluZXNTdGFydEF0MTogdHJ1ZSxcclxuICAgICAgICAgIGNvbHVtbnNTdGFydEF0MTogdHJ1ZSxcclxuICAgICAgICAgIHN1cHBvcnRzVmFyaWFibGVUeXBlOiB0cnVlLFxyXG4gICAgICAgICAgc3VwcG9ydHNWYXJpYWJsZVBhZ2luZzogZmFsc2UsXHJcbiAgICAgICAgICBzdXBwb3J0c1J1bkluVGVybWluYWxSZXF1ZXN0OiBnZXRUZXJtaW5hbFNlcnZpY2UoKSAhPSBudWxsLFxyXG4gICAgICAgICAgbG9jYWxlOiBcImVuLXVzXCIsXHJcbiAgICAgICAgfSlcclxuXHJcbiAgICAgICAgaWYgKG9uRGVidWdTdGFydGluZ0NhbGxiYWNrICE9IG51bGwpIHtcclxuICAgICAgICAgIC8vIENhbGxiYWNrcyBhcmUgcGFzc2VkIElWc3BJbnN0YW5jZSB3aGljaCBleHBvc2VzIG9ubHkgY2VydGFpblxyXG4gICAgICAgICAgLy8gbWV0aG9kcyB0byB0aGVtLCByYXRoZXIgdGhhbiBnZXR0aW5nIHRoZSBmdWxsIHNlc3Npb24uXHJcbiAgICAgICAgICBjb25zdCB0ZWFyZG93biA9IG9uRGVidWdTdGFydGluZ0NhbGxiYWNrKGluc3RhbmNlSW50ZXJmYWNlKG5ld1Nlc3Npb24pKVxyXG4gICAgICAgICAgaWYgKHRlYXJkb3duICE9IG51bGwpIHtcclxuICAgICAgICAgICAgc2Vzc2lvblRlYXJkb3duRGlzcG9zYWJsZXMuYWRkKHRlYXJkb3duKVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5fbW9kZWwuc2V0RXhjZXB0aW9uQnJlYWtwb2ludHMocHJvY2VzcywgbmV3U2Vzc2lvbi5nZXRDYXBhYmlsaXRpZXMoKS5leGNlcHRpb25CcmVha3BvaW50RmlsdGVycyB8fCBbXSlcclxuICAgICAgICByZXR1cm4gbmV3U2Vzc2lvblxyXG4gICAgICB9XHJcblxyXG4gICAgICBzZXNzaW9uID0gYXdhaXQgY3JlYXRlSW5pdGlhbGl6ZVNlc3Npb24oY29uZmlndXJhdGlvbilcclxuXHJcbiAgICAgIGNvbnN0IHNldFJ1bm5pbmdTdGF0ZSA9ICgpID0+IHtcclxuICAgICAgICBpZiAocHJvY2VzcyAhPSBudWxsKSB7XHJcbiAgICAgICAgICBwcm9jZXNzLmNsZWFyUHJvY2Vzc1N0YXJ0aW5nRmxhZygpXHJcbiAgICAgICAgICB0aGlzLl9vbkRlYnVnZ2VyTW9kZUNoYW5nZWQocHJvY2VzcywgRGVidWdnZXJNb2RlLlJVTk5JTkcpXHJcbiAgICAgICAgICB0aGlzLl92aWV3TW9kZWwuc2V0Rm9jdXNlZFByb2Nlc3MocHJvY2VzcywgZmFsc2UpXHJcbiAgICAgICAgICBpZiAob25EZWJ1Z1J1bm5pbmdDYWxsYmFjayAhPSBudWxsICYmIHNlc3Npb24gIT0gbnVsbCkge1xyXG4gICAgICAgICAgICAvLyBDYWxsYmFja3MgYXJlIHBhc3NlZCBJVnNwSW5zdGFuY2Ugd2hpY2ggZXhwb3NlcyBvbmx5IGNlcnRhaW5cclxuICAgICAgICAgICAgLy8gbWV0aG9kcyB0byB0aGVtLCByYXRoZXIgdGhhbiBnZXR0aW5nIHRoZSBmdWxsIHNlc3Npb24uXHJcbiAgICAgICAgICAgIGNvbnN0IHRlYXJkb3duID0gb25EZWJ1Z1J1bm5pbmdDYWxsYmFjayhpbnN0YW5jZUludGVyZmFjZShzZXNzaW9uKSlcclxuICAgICAgICAgICAgaWYgKHRlYXJkb3duICE9IG51bGwpIHtcclxuICAgICAgICAgICAgICBzZXNzaW9uVGVhcmRvd25EaXNwb3NhYmxlcy5hZGQodGVhcmRvd24pXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIC8vIFdlJ3JlIG5vdCBhd2FpdGluZyBsYXVuY2gvYXR0YWNoIHRvIGZpbmlzaCBiZWNhdXNlIHNvbWUgZGVidWcgYWRhcHRlcnNcclxuICAgICAgLy8gbmVlZCB0byBkbyBjdXN0b20gd29yayBmb3IgbGF1bmNoL2F0dGFjaCB0byB3b3JrIChlLmcuIG1vYmlsZWpzKVxyXG4gICAgICB0aGlzLl9sYXVuY2hPckF0dGFjaFRhcmdldChzZXNzaW9uLCBjb25maWd1cmF0aW9uKVxyXG4gICAgICAgIC50aGVuKCgpID0+IHNldFJ1bm5pbmdTdGF0ZSgpKVxyXG4gICAgICAgIC5jYXRjaChhc3luYyAoZXJyb3IpID0+IHtcclxuICAgICAgICAgIGlmIChwcm9jZXNzICE9IG51bGwpIHtcclxuICAgICAgICAgICAgdGhpcy5zdG9wUHJvY2Vzcyhwcm9jZXNzKVxyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgY29uZmlndXJhdGlvbi5kZWJ1Z01vZGUgPT09IFwiYXR0YWNoXCIgJiZcclxuICAgICAgICAgICAgY29uZmlndXJhdGlvbi5hZGFwdGVyRXhlY3V0YWJsZSAhPSBudWxsICYmXHJcbiAgICAgICAgICAgIGNvbmZpZ3VyYXRpb24uYWRhcHRlckV4ZWN1dGFibGUuY29tbWFuZCAhPT0gXCJzdWRvXCIgJiZcclxuICAgICAgICAgICAgLy8gc3VkbyBpcyBub3Qgc3VwcG9ydGVkIG9uIFdpbmRvd3MsIGFuZCBjdXJyZW50bHkgcmVtb3RlIHByb2plY3RzXHJcbiAgICAgICAgICAgIC8vIGFyZSBub3Qgc3VwcG9ydGVkIG9uIFdpbmRvd3MsIHNvIGEgcmVtb3RlIFVSSSBtdXN0IGJlICpuaXguXHJcbiAgICAgICAgICAgIChvcy5wbGF0Zm9ybSgpICE9PSBcIndpbjMyXCIgfHwgbnVjbGlkZVVyaS5pc1JlbW90ZShjb25maWd1cmF0aW9uLnRhcmdldFVyaSkpXHJcbiAgICAgICAgICApIHtcclxuICAgICAgICAgICAgY29uZmlndXJhdGlvbi5hZGFwdGVyRXhlY3V0YWJsZS5hcmdzID0gW1xyXG4gICAgICAgICAgICAgIGNvbmZpZ3VyYXRpb24uYWRhcHRlckV4ZWN1dGFibGUuY29tbWFuZCxcclxuICAgICAgICAgICAgICAuLi5jb25maWd1cmF0aW9uLmFkYXB0ZXJFeGVjdXRhYmxlLmFyZ3MsXHJcbiAgICAgICAgICAgIF1cclxuICAgICAgICAgICAgY29uZmlndXJhdGlvbi5hZGFwdGVyRXhlY3V0YWJsZS5jb21tYW5kID0gXCJzdWRvXCJcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3JcclxuICAgICAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZFdhcm5pbmcoXHJcbiAgICAgICAgICAgICAgYFRoZSBkZWJ1Z2dlciB3YXMgdW5hYmxlIHRvIGF0dGFjaCB0byB0aGUgdGFyZ2V0IHByb2Nlc3M6ICR7ZXJyb3JNZXNzYWdlfS4gYCArXHJcbiAgICAgICAgICAgICAgICBcIkF0dGVtcHRpbmcgdG8gcmUtbGF1bmNoIHRoZSBkZWJ1Z2dlciBhcyByb290Li4uXCJcclxuICAgICAgICAgICAgKVxyXG5cclxuICAgICAgICAgICAgc2Vzc2lvbiA9IGF3YWl0IGNyZWF0ZUluaXRpYWxpemVTZXNzaW9uKGNvbmZpZ3VyYXRpb24pXHJcbiAgICAgICAgICAgIHRoaXMuX2xhdW5jaE9yQXR0YWNoVGFyZ2V0KHNlc3Npb24sIGNvbmZpZ3VyYXRpb24pXHJcbiAgICAgICAgICAgICAgLnRoZW4oKCkgPT4gc2V0UnVubmluZ1N0YXRlKCkpXHJcbiAgICAgICAgICAgICAgLmNhdGNoKGVycm9ySGFuZGxlcilcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIGVycm9ySGFuZGxlcihlcnJvcilcclxuICAgICAgICAgIH1cclxuICAgICAgICB9KVxyXG5cclxuICAgICAgaWYgKG9uRGVidWdTdGFydGVkQ2FsbGJhY2sgIT0gbnVsbCAmJiBzZXNzaW9uICE9IG51bGwpIHtcclxuICAgICAgICBjb25zdCB0ZWFyZG93biA9IG9uRGVidWdTdGFydGVkQ2FsbGJhY2soaW5zdGFuY2VJbnRlcmZhY2Uoc2Vzc2lvbikpXHJcbiAgICAgICAgaWYgKHRlYXJkb3duICE9IG51bGwpIHtcclxuICAgICAgICAgIHNlc3Npb25UZWFyZG93bkRpc3Bvc2FibGVzLmFkZCh0ZWFyZG93bilcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoKCkgPT4ge1xyXG4gICAgICAgIHRoaXMuX21vZGVsLm9uRGlkQ2hhbmdlUHJvY2Vzc2VzKCgpID0+IHtcclxuICAgICAgICAgIGlmICghdGhpcy5nZXRNb2RlbCgpLmdldFByb2Nlc3NlcygpLmluY2x1ZGVzKHByb2Nlc3MpKSB7XHJcbiAgICAgICAgICAgIHNlc3Npb25UZWFyZG93bkRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH0pXHJcbiAgICAgIH0pXHJcbiAgICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoc2Vzc2lvblRlYXJkb3duRGlzcG9zYWJsZXMpXHJcblxyXG4gICAgICByZXR1cm4gcHJvY2Vzc1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgZXJyb3JIYW5kbGVyKGVycm9yKVxyXG4gICAgICByZXR1cm4gbnVsbFxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgX3Jlc29sdmVBZGFwdGVyRXhlY3V0YWJsZShjb25maWd1cmF0aW9uOiBJUHJvY2Vzc0NvbmZpZyk6IFByb21pc2U8VlNBZGFwdGVyRXhlY3V0YWJsZUluZm8+IHtcclxuICAgIGlmIChjb25maWd1cmF0aW9uLmFkYXB0ZXJFeGVjdXRhYmxlICE9IG51bGwpIHtcclxuICAgICAgcmV0dXJuIGNvbmZpZ3VyYXRpb24uYWRhcHRlckV4ZWN1dGFibGVcclxuICAgIH1cclxuICAgIHJldHVybiBnZXRWU0NvZGVEZWJ1Z2dlckFkYXB0ZXJTZXJ2aWNlQnlOdWNsaWRlVXJpKGNvbmZpZ3VyYXRpb24udGFyZ2V0VXJpKS5nZXRBZGFwdGVyRXhlY3V0YWJsZUluZm8oXHJcbiAgICAgIGNvbmZpZ3VyYXRpb24uYWRhcHRlclR5cGVcclxuICAgIClcclxuICB9XHJcblxyXG4gIGFzeW5jIF9jcmVhdGVWc0RlYnVnU2Vzc2lvbihcclxuICAgIGNvbmZpZ3VyYXRpb246IElQcm9jZXNzQ29uZmlnLFxyXG4gICAgYWRhcHRlckV4ZWN1dGFibGU6IFZTQWRhcHRlckV4ZWN1dGFibGVJbmZvLFxyXG4gICAgc2Vzc2lvbklkOiBzdHJpbmdcclxuICApOiBQcm9taXNlPFZzRGVidWdTZXNzaW9uPiB7XHJcbiAgICBjb25zdCB7IHRhcmdldFVyaSB9ID0gY29uZmlndXJhdGlvblxyXG4gICAgY29uc3Qgc2VydmljZSA9IGdldFZTQ29kZURlYnVnZ2VyQWRhcHRlclNlcnZpY2VCeU51Y2xpZGVVcmkodGFyZ2V0VXJpKVxyXG4gICAgY29uc3Qgc3Bhd25lciA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlVnNSYXdBZGFwdGVyU3Bhd25lclNlcnZpY2UoKVxyXG5cclxuICAgIGNvbnN0IGNsaWVudFByZXByb2Nlc3NvcnM6IEFycmF5PE1lc3NhZ2VQcm9jZXNzb3I+ID0gW11cclxuICAgIGNvbnN0IGFkYXB0ZXJQcmVwcm9jZXNzb3JzOiBBcnJheTxNZXNzYWdlUHJvY2Vzc29yPiA9IFtdXHJcbiAgICBpZiAoY29uZmlndXJhdGlvbi5jbGllbnRQcmVwcm9jZXNzb3IgIT0gbnVsbCkge1xyXG4gICAgICBjbGllbnRQcmVwcm9jZXNzb3JzLnB1c2goY29uZmlndXJhdGlvbi5jbGllbnRQcmVwcm9jZXNzb3IpXHJcbiAgICB9XHJcbiAgICBpZiAoY29uZmlndXJhdGlvbi5hZGFwdGVyUHJlcHJvY2Vzc29yICE9IG51bGwpIHtcclxuICAgICAgYWRhcHRlclByZXByb2Nlc3NvcnMucHVzaChjb25maWd1cmF0aW9uLmFkYXB0ZXJQcmVwcm9jZXNzb3IpXHJcbiAgICB9XHJcbiAgICBjb25zdCBpc1JlbW90ZSA9IG51Y2xpZGVVcmkuaXNSZW1vdGUodGFyZ2V0VXJpKVxyXG4gICAgaWYgKGlzUmVtb3RlKSB7XHJcbiAgICAgIGNsaWVudFByZXByb2Nlc3NvcnMucHVzaChyZW1vdGVUb0xvY2FsUHJvY2Vzc29yKCkpXHJcbiAgICAgIGFkYXB0ZXJQcmVwcm9jZXNzb3JzLnB1c2gobG9jYWxUb1JlbW90ZVByb2Nlc3Nvcih0YXJnZXRVcmkpKVxyXG4gICAgfVxyXG4gICAgcmV0dXJuIG5ldyBWc0RlYnVnU2Vzc2lvbihcclxuICAgICAgc2Vzc2lvbklkLFxyXG4gICAgICBsb2dnZXIsXHJcbiAgICAgIGFkYXB0ZXJFeGVjdXRhYmxlLFxyXG4gICAgICB7IGFkYXB0ZXI6IGNvbmZpZ3VyYXRpb24uYWRhcHRlclR5cGUsIGhvc3Q6IFwiZGVidWdTZXJ2aWNlXCIsIGlzUmVtb3RlIH0sXHJcbiAgICAgIHNwYXduZXIsXHJcbiAgICAgIGNsaWVudFByZXByb2Nlc3NvcnMsXHJcbiAgICAgIGFkYXB0ZXJQcmVwcm9jZXNzb3JzLFxyXG4gICAgICB0aGlzLl9ydW5JblRlcm1pbmFsLFxyXG4gICAgICBCb29sZWFuKGNvbmZpZ3VyYXRpb24uaXNSZWFkT25seSlcclxuICAgIClcclxuICB9XHJcblxyXG4gIGFzeW5jIF9sYXVuY2hPckF0dGFjaFRhcmdldChzZXNzaW9uOiBWc0RlYnVnU2Vzc2lvbiwgY29uZmlndXJhdGlvbjogSVByb2Nlc3NDb25maWcpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGlmIChjb25maWd1cmF0aW9uLmRlYnVnTW9kZSA9PT0gXCJhdHRhY2hcIikge1xyXG4gICAgICBhd2FpdCBzZXNzaW9uLmF0dGFjaChjb25maWd1cmF0aW9uLmNvbmZpZylcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIC8vIEl0J3MgJ2xhdW5jaCdcclxuICAgICAgYXdhaXQgc2Vzc2lvbi5sYXVuY2goY29uZmlndXJhdGlvbi5jb25maWcpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBfc291cmNlSXNOb3RBdmFpbGFibGUodXJpOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgIHRoaXMuX21vZGVsLnNvdXJjZUlzTm90QXZhaWxhYmxlKHVyaSlcclxuICB9XHJcblxyXG4gIF9ydW5JblRlcm1pbmFsID0gYXN5bmMgKGFyZ3M6IERlYnVnUHJvdG9jb2wuUnVuSW5UZXJtaW5hbFJlcXVlc3RBcmd1bWVudHMpOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIGNvbnN0IHRlcm1pbmFsU2VydmljZSA9IGdldFRlcm1pbmFsU2VydmljZSgpXHJcbiAgICBpZiAodGVybWluYWxTZXJ2aWNlID09IG51bGwpIHtcclxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVW5hYmxlIHRvIGxhdW5jaCBpbiB0ZXJtaW5hbCBzaW5jZSB0aGUgc2VydmljZSBpcyBub3QgYXZhaWxhYmxlXCIpXHJcbiAgICB9XHJcbiAgICBjb25zdCBwcm9jZXNzID0gdGhpcy5fZ2V0Q3VycmVudFByb2Nlc3MoKVxyXG4gICAgaWYgKHByb2Nlc3MgPT0gbnVsbCkge1xyXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGVyZSdzIG5vIGRlYnVnIHByb2Nlc3MgdG8gY3JlYXRlIGEgdGVybWluYWwgZm9yIVwiKVxyXG4gICAgfVxyXG4gICAgY29uc3QgeyBhZGFwdGVyVHlwZSwgdGFyZ2V0VXJpIH0gPSBwcm9jZXNzLmNvbmZpZ3VyYXRpb25cclxuICAgIGNvbnN0IGtleSA9IGB0YXJnZXRVcmk9JHt0YXJnZXRVcml9JmNvbW1hbmQ9JHthcmdzLmFyZ3NbMF19YFxyXG5cclxuICAgIC8vIEVuc3VyZSBhbnkgcHJldmlvdXMgaW5zdGFuY2VzIG9mIHRoaXMgc2FtZSB0YXJnZXQgYXJlIGNsb3NlZCBiZWZvcmVcclxuICAgIC8vIG9wZW5pbmcgYSBuZXcgdGVybWluYWwgdGFiLiBXZSBkb24ndCB3YW50IHRoZW0gdG8gcGlsZSB1cCBpZiB0aGVcclxuICAgIC8vIHVzZXIga2VlcHMgcnVubmluZyB0aGUgc2FtZSBhcHAgb3ZlciBhbmQgb3Zlci5cclxuICAgIHRlcm1pbmFsU2VydmljZS5jbG9zZShrZXkpXHJcblxyXG4gICAgY29uc3QgdGl0bGUgPSBhcmdzLnRpdGxlICE9IG51bGwgPyBhcmdzLnRpdGxlIDogZ2V0RGVidWdnZXJOYW1lKGFkYXB0ZXJUeXBlKVxyXG4gICAgY29uc3QgaG9zdG5hbWUgPSBudWNsaWRlVXJpLmdldEhvc3RuYW1lT3B0KHRhcmdldFVyaSlcclxuICAgIGNvbnN0IGN3ZCA9IGhvc3RuYW1lID09IG51bGwgPyBhcmdzLmN3ZCA6IG51Y2xpZGVVcmkuY3JlYXRlUmVtb3RlVXJpKGhvc3RuYW1lLCBhcmdzLmN3ZClcclxuXHJcbiAgICBjb25zdCBpbmZvOiBUZXJtaW5hbEluZm8gPSB7XHJcbiAgICAgIGtleSxcclxuICAgICAgdGl0bGUsXHJcbiAgICAgIGN3ZCxcclxuICAgICAgY29tbWFuZDoge1xyXG4gICAgICAgIGZpbGU6IGFyZ3MuYXJnc1swXSxcclxuICAgICAgICBhcmdzOiBhcmdzLmFyZ3Muc2xpY2UoMSksXHJcbiAgICAgIH0sXHJcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzOiBhcmdzLmVudiAhPSBudWxsID8gbWFwRnJvbU9iamVjdChhcmdzLmVudikgOiB1bmRlZmluZWQsXHJcbiAgICAgIHByZXNlcnZlZENvbW1hbmRzOiBbXHJcbiAgICAgICAgXCJkZWJ1Z2dlcjpjb250aW51ZS1kZWJ1Z2dpbmdcIixcclxuICAgICAgICBcImRlYnVnZ2VyOnN0b3AtZGVidWdnaW5nXCIsXHJcbiAgICAgICAgXCJkZWJ1Z2dlcjpyZXN0YXJ0LWRlYnVnZ2luZ1wiLFxyXG4gICAgICAgIFwiZGVidWdnZXI6c3RlcC1vdmVyXCIsXHJcbiAgICAgICAgXCJkZWJ1Z2dlcjpzdGVwLWludG9cIixcclxuICAgICAgICBcImRlYnVnZ2VyOnN0ZXAtb3V0XCIsXHJcbiAgICAgIF0sXHJcbiAgICAgIHJlbWFpbk9uQ2xlYW5FeGl0OiB0cnVlLFxyXG4gICAgICBpY29uOiBcIm51Y2xpY29uLWRlYnVnZ2VyXCIsXHJcbiAgICAgIGRlZmF1bHRMb2NhdGlvbjogXCJib3R0b21cIixcclxuICAgIH1cclxuICAgIGNvbnN0IHRlcm1pbmFsOiBUZXJtaW5hbEluc3RhbmNlID0gYXdhaXQgdGVybWluYWxTZXJ2aWNlLm9wZW4oaW5mbylcclxuXHJcbiAgICB0ZXJtaW5hbC5zZXRQcm9jZXNzRXhpdENhbGxiYWNrKCgpID0+IHtcclxuICAgICAgLy8gVGhpcyBjYWxsYmFjayBpcyBpbnZva2VkIGlmIHRoZSB0YXJnZXQgcHJvY2VzcyBkaWVzIGZpcnN0LCBlbnN1cmluZ1xyXG4gICAgICAvLyB3ZSB0ZWFyIGRvd24gdGhlIGRlYnVnZ2VyLlxyXG4gICAgICB0aGlzLnN0b3BQcm9jZXNzKHByb2Nlc3MpXHJcbiAgICB9KVxyXG5cclxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoKCkgPT4ge1xyXG4gICAgICAvLyBUaGlzIHRlcm1pbmF0aW9uIHBhdGggaXMgaW52b2tlZCBpZiB0aGUgZGVidWdnZXIgZGllcyBmaXJzdCwgZW5zdXJpbmdcclxuICAgICAgLy8gd2UgdGVybWluYXRlIHRoZSB0YXJnZXQgcHJvY2Vzcy4gVGhpcyBjYW4gaGFwcGVuIGlmIHRoZSB1c2VyIGhpdHMgc3RvcCxcclxuICAgICAgLy8gb3IgaWYgdGhlIGRlYnVnZ2VyIGNyYXNoZXMuXHJcbiAgICAgIHRlcm1pbmFsLnNldFByb2Nlc3NFeGl0Q2FsbGJhY2soKCkgPT4ge30pXHJcbiAgICAgIHRlcm1pbmFsLnRlcm1pbmF0ZVByb2Nlc3MoKVxyXG4gICAgfSlcclxuXHJcbiAgICBjb25zdCBzcGF3biA9IG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24oKGNiKSA9PiB0ZXJtaW5hbC5vblNwYXduKGNiKSlcclxuICAgIHJldHVybiBzcGF3bi50YWtlKDEpLnRvUHJvbWlzZSgpXHJcbiAgfVxyXG5cclxuICBjYW5SZXN0YXJ0UHJvY2VzcygpOiBib29sZWFuIHtcclxuICAgIGNvbnN0IHByb2Nlc3MgPSB0aGlzLl9nZXRDdXJyZW50UHJvY2VzcygpXHJcbiAgICByZXR1cm4gcHJvY2VzcyAhPSBudWxsICYmIHByb2Nlc3MuY29uZmlndXJhdGlvbi5pc1Jlc3RhcnRhYmxlID09PSB0cnVlXHJcbiAgfVxyXG5cclxuICBhc3luYyByZXN0YXJ0UHJvY2Vzcyhwcm9jZXNzOiBJUHJvY2Vzcyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgaWYgKHByb2Nlc3Muc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNSZXN0YXJ0UmVxdWVzdCkge1xyXG4gICAgICBhd2FpdCBwcm9jZXNzLnNlc3Npb24uY3VzdG9tKFwicmVzdGFydFwiLCBudWxsKVxyXG4gICAgfVxyXG4gICAgYXdhaXQgcHJvY2Vzcy5zZXNzaW9uLmRpc2Nvbm5lY3QodHJ1ZSlcclxuICAgIGF3YWl0IHNsZWVwKDMwMClcclxuICAgIGF3YWl0IHRoaXMuc3RhcnREZWJ1Z2dpbmcocHJvY2Vzcy5jb25maWd1cmF0aW9uKVxyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogU3RhcnRzIGRlYnVnZ2luZy4gSWYgdGhlIGNvbmZpZ09yTmFtZSBpcyBub3QgcGFzc2VkIHVzZXMgdGhlIHNlbGVjdGVkIGNvbmZpZ3VyYXRpb24gaW4gdGhlIGRlYnVnIGRyb3Bkb3duLlxyXG4gICAqIEFsc28gc2F2ZXMgYWxsIGZpbGVzLCBtYW5hZ2VzIGlmIGNvbXBvdW5kcyBhcmUgcHJlc2VudCBpbiB0aGUgY29uZmlndXJhdGlvblxyXG4gICAqIGFuZCByZXNvbHZlZHMgY29uZmlndXJhdGlvbnMgdmlhIERlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVycy5cclxuICAgKi9cclxuICBhc3luYyBzdGFydERlYnVnZ2luZyhjb25maWc6IElQcm9jZXNzQ29uZmlnKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0aGlzLl90aW1lciA9IHN0YXJ0VHJhY2tpbmcoXCJkZWJ1Z2dlci1hdG9tOnN0YXJ0RGVidWdnaW5nXCIpXHJcblxyXG4gICAgLy8gT3BlbiB0aGUgY29uc29sZSB3aW5kb3cgaWYgaXQncyBub3QgYWxyZWFkeSBvcGVuZWQuXHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbnVjbGlkZS1pbnRlcm5hbC9hdG9tLWFwaXNcclxuICAgIGF0b20ud29ya3NwYWNlLm9wZW4oQ09OU09MRV9WSUVXX1VSSSwgeyBzZWFyY2hBbGxQYW5lczogdHJ1ZSB9KVxyXG5cclxuICAgIGF3YWl0IHRoaXMuX2RvQ3JlYXRlUHJvY2Vzcyhjb25maWcsIHV1aWQudjQoKSlcclxuXHJcbiAgICBpZiAodGhpcy5fbW9kZWwuZ2V0UHJvY2Vzc2VzKCkubGVuZ3RoID4gMSkge1xyXG4gICAgICBjb25zdCBkZWJ1Z2dlclR5cGVzID0gdGhpcy5fbW9kZWxcclxuICAgICAgICAuZ2V0UHJvY2Vzc2VzKClcclxuICAgICAgICAubWFwKCh7IGNvbmZpZ3VyYXRpb24gfSkgPT4gYCR7Y29uZmlndXJhdGlvbi5hZGFwdGVyVHlwZX06ICR7Y29uZmlndXJhdGlvbi5wcm9jZXNzTmFtZSB8fCBcIlwifWApXHJcbiAgICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9NVUxUSVRBUkdFVCwge1xyXG4gICAgICAgIHByb2Nlc3Nlc0NvdW50OiB0aGlzLl9tb2RlbC5nZXRQcm9jZXNzZXMoKS5sZW5ndGgsXHJcbiAgICAgICAgZGVidWdnZXJUeXBlcyxcclxuICAgICAgfSlcclxuICAgIH1cclxuICB9XHJcblxyXG4gIF9vblNlc3Npb25FbmQgPSBhc3luYyAoc2Vzc2lvbjogVnNEZWJ1Z1Nlc3Npb24pOiBQcm9taXNlPHZvaWQ+ID0+IHtcclxuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9TVE9QKVxyXG4gICAgY29uc3QgcmVtb3ZlZFByb2Nlc3NlcyA9IHRoaXMuX21vZGVsLnJlbW92ZVByb2Nlc3Moc2Vzc2lvbi5nZXRJZCgpKVxyXG4gICAgaWYgKHJlbW92ZWRQcm9jZXNzZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIC8vIElmIHRoZSBwcm9jZXNzIGlzIGFscmVhZHkgcmVtb3ZlZCBmcm9tIHRoZSBtb2RlbCwgdGhlcmUncyBub3RoaW5nIGVsc2VcclxuICAgICAgLy8gdG8gZG8uIFdlIGNhbiByZS1lbnRlciBoZXJlIGlmIHRoZSBkZWJ1ZyBzZXNzaW9uIGVuZHMgYmVmb3JlIHRoZVxyXG4gICAgICAvLyBkZWJ1ZyBhZGFwdGVyIHByb2Nlc3MgdGVybWluYXRlcy5cclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcblxyXG4gICAgLy8gTWFyayBhbGwgcmVtb3ZlZCBwcm9jZXNzZXMgYXMgU1RPUFBJTkcuXHJcbiAgICByZW1vdmVkUHJvY2Vzc2VzLmZvckVhY2goKHByb2Nlc3MpID0+IHtcclxuICAgICAgcHJvY2Vzcy5zZXRTdG9wUGVuZGluZygpXHJcbiAgICAgIHRoaXMuX29uRGVidWdnZXJNb2RlQ2hhbmdlZChwcm9jZXNzLCBEZWJ1Z2dlck1vZGUuU1RPUFBJTkcpXHJcbiAgICB9KVxyXG5cclxuICAgIC8vIEVuc3VyZSBhbGwgdGhlIGFkYXB0ZXJzIGFyZSB0ZXJtaW5hdGVkLlxyXG4gICAgYXdhaXQgc2Vzc2lvbi5kaXNjb25uZWN0KGZhbHNlIC8qIHJlc3RhcnQgKi8sIHRydWUgLyogZm9yY2UgKi8pXHJcblxyXG4gICAgaWYgKHRoaXMuX21vZGVsLmdldFByb2Nlc3NlcygpID09IG51bGwgfHwgdGhpcy5fbW9kZWwuZ2V0UHJvY2Vzc2VzKCkubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5kaXNwb3NlKClcclxuICAgICAgdGhpcy5fY29uc29sZURpc3Bvc2FibGVzLmRpc3Bvc2UoKVxyXG5cclxuICAgICAgLy8gTm8gcHJvY2Vzc2VzIHJlbWFpbmluZywgY2xlYXIgcHJvY2VzcyBmb2N1cy5cclxuICAgICAgdGhpcy5fdmlld01vZGVsLnNldEZvY3VzZWRQcm9jZXNzKG51bGwsIGZhbHNlKVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgaWYgKHRoaXMuX3ZpZXdNb2RlbC5mb2N1c2VkUHJvY2VzcyAhPSBudWxsICYmIHRoaXMuX3ZpZXdNb2RlbC5mb2N1c2VkUHJvY2Vzcy5nZXRJZCgpID09PSBzZXNzaW9uLmdldElkKCkpIHtcclxuICAgICAgICAvLyBUaGUgcHJvY2VzcyB0aGF0IGp1c3QgZXhpdGVkIHdhcyB0aGUgZm9jdXNlZCBwcm9jZXNzLCBzbyB3ZSBuZWVkXHJcbiAgICAgICAgLy8gdG8gbW92ZSBmb2N1cyB0byBhbm90aGVyIHByb2Nlc3MuIElmIHRoZXJlJ3MgYSBwcm9jZXNzIHdpdGggYVxyXG4gICAgICAgIC8vIHN0b3BwZWQgdGhyZWFkLCBjaG9vc2UgdGhhdC4gT3RoZXJ3aXNlIGNob29zZSB0aGUgbGFzdCBwcm9jZXNzLlxyXG4gICAgICAgIGNvbnN0IGFsbFByb2Nlc3NlcyA9IHRoaXMuX21vZGVsLmdldFByb2Nlc3NlcygpXHJcbiAgICAgICAgY29uc3QgcHJvY2Vzc1RvRm9jdXMgPVxyXG4gICAgICAgICAgYWxsUHJvY2Vzc2VzLmZpbHRlcigocCkgPT4gcC5nZXRBbGxUaHJlYWRzKCkuc29tZSgodCkgPT4gdC5zdG9wcGVkKSlbMF0gfHxcclxuICAgICAgICAgIGFsbFByb2Nlc3Nlc1thbGxQcm9jZXNzZXMubGVuZ3RoIC0gMV1cclxuICAgICAgICB0aGlzLl92aWV3TW9kZWwuc2V0Rm9jdXNlZFByb2Nlc3MocHJvY2Vzc1RvRm9jdXMsIGZhbHNlKVxyXG4gICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmVtb3ZlZFByb2Nlc3Nlcy5mb3JFYWNoKChwcm9jZXNzKSA9PiB7XHJcbiAgICAgIHRoaXMuX29uRGVidWdnZXJNb2RlQ2hhbmdlZChwcm9jZXNzLCBEZWJ1Z2dlck1vZGUuU1RPUFBFRClcclxuICAgIH0pXHJcblxyXG4gICAgY29uc3QgY3JlYXRlQ29uc29sZSA9IGdldENvbnNvbGVTZXJ2aWNlKClcclxuICAgIGlmIChjcmVhdGVDb25zb2xlICE9IG51bGwpIHtcclxuICAgICAgY29uc3QgbmFtZSA9IFwiTnVjbGlkZSBEZWJ1Z2dlclwiXHJcbiAgICAgIGNvbnN0IGNvbnNvbGVBcGkgPSBjcmVhdGVDb25zb2xlKHtcclxuICAgICAgICBpZDogbmFtZSxcclxuICAgICAgICBuYW1lLFxyXG4gICAgICB9KVxyXG5cclxuICAgICAgcmVtb3ZlZFByb2Nlc3Nlcy5mb3JFYWNoKChwKSA9PlxyXG4gICAgICAgIGNvbnNvbGVBcGkuYXBwZW5kKHtcclxuICAgICAgICAgIHRleHQ6XHJcbiAgICAgICAgICAgIFwiUHJvY2VzcyBleGl0ZWRcIiArIChwLmNvbmZpZ3VyYXRpb24ucHJvY2Vzc05hbWUgPT0gbnVsbCA/IFwiXCIgOiBcIiAoXCIgKyBwLmNvbmZpZ3VyYXRpb24ucHJvY2Vzc05hbWUgKyBcIilcIiksXHJcbiAgICAgICAgICBsZXZlbDogXCJsb2dcIixcclxuICAgICAgICB9KVxyXG4gICAgICApXHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMuX3RpbWVyICE9IG51bGwpIHtcclxuICAgICAgdGhpcy5fdGltZXIub25TdWNjZXNzKClcclxuICAgICAgdGhpcy5fdGltZXIgPSBudWxsXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBnZXRNb2RlbCgpOiBJTW9kZWwge1xyXG4gICAgcmV0dXJuIHRoaXMuX21vZGVsXHJcbiAgfVxyXG5cclxuICBhc3luYyBfc2VuZEFsbEJyZWFrcG9pbnRzKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXHJcbiAgICAgIGRpc3RpbmN0KHRoaXMuX21vZGVsLmdldEJyZWFrcG9pbnRzKCksIChicCkgPT4gYnAudXJpKS5tYXAoKGJwKSA9PiB0aGlzLl9zZW5kQnJlYWtwb2ludHMoYnAudXJpLCBmYWxzZSkpXHJcbiAgICApXHJcbiAgICBhd2FpdCB0aGlzLl9zZW5kRnVuY3Rpb25CcmVha3BvaW50cygpXHJcbiAgICAvLyBzZW5kIGV4Y2VwdGlvbiBicmVha3BvaW50cyBhdCB0aGUgZW5kIHNpbmNlIHNvbWUgZGVidWcgYWRhcHRlcnMgcmVseSBvbiB0aGUgb3JkZXJcclxuICAgIGF3YWl0IHRoaXMuX3NlbmRFeGNlcHRpb25CcmVha3BvaW50cygpXHJcbiAgfVxyXG5cclxuICBhc3luYyBfc2VuZEJyZWFrcG9pbnRzKHVyaTogc3RyaW5nLCBzb3VyY2VNb2RpZmllZD86IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgcHJvY2VzcyA9IHRoaXMuX2dldEN1cnJlbnRQcm9jZXNzKClcclxuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLl9nZXRDdXJyZW50U2Vzc2lvbigpXHJcbiAgICBpZiAocHJvY2VzcyA9PSBudWxsIHx8IHNlc3Npb24gPT0gbnVsbCB8fCAhc2Vzc2lvbi5pc1JlYWR5Rm9yQnJlYWtwb2ludHMoKSkge1xyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBicmVha3BvaW50c1RvU2VuZCA9ICgoc291cmNlTW9kaWZpZWQgPyB0aGlzLl9tb2RlbC5nZXRVSUJyZWFrcG9pbnRzKCkgOiB0aGlzLl9tb2RlbC5nZXRCcmVha3BvaW50cygpKS5maWx0ZXIoXHJcbiAgICAgIChicCkgPT4gdGhpcy5fbW9kZWwuYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQoKSAmJiBicC5lbmFibGVkICYmIGJwLnVyaSA9PT0gdXJpXHJcbiAgICApOiBhbnkpXHJcblxyXG4gICAgY29uc3QgcmF3U291cmNlID0gcHJvY2Vzcy5nZXRTb3VyY2Uoe1xyXG4gICAgICBwYXRoOiB1cmksXHJcbiAgICAgIG5hbWU6IG51Y2xpZGVVcmkuYmFzZW5hbWUodXJpKSxcclxuICAgIH0pLnJhd1xyXG5cclxuICAgIGlmICghc291cmNlTW9kaWZpZWQgJiYgYnJlYWtwb2ludHNUb1NlbmQubGVuZ3RoID4gMCAmJiAhcmF3U291cmNlLmFkYXB0ZXJEYXRhICYmIGJyZWFrcG9pbnRzVG9TZW5kWzBdLmFkYXB0ZXJEYXRhKSB7XHJcbiAgICAgIHJhd1NvdXJjZS5hZGFwdGVyRGF0YSA9IGJyZWFrcG9pbnRzVG9TZW5kWzBdLmFkYXB0ZXJEYXRhXHJcbiAgICB9XHJcblxyXG4gICAgLy8gVGhlIFVJIGlzIDAtYmFzZWQsIHdoaWxlIFZTUCBpcyAxLWJhc2VkLlxyXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzZXNzaW9uLnNldEJyZWFrcG9pbnRzKHtcclxuICAgICAgc291cmNlOiAocmF3U291cmNlOiBhbnkpLFxyXG4gICAgICBsaW5lczogYnJlYWtwb2ludHNUb1NlbmQubWFwKChicCkgPT4gYnAubGluZSksXHJcbiAgICAgIGJyZWFrcG9pbnRzOiBicmVha3BvaW50c1RvU2VuZC5tYXAoKGJwKSA9PiB7XHJcbiAgICAgICAgY29uc3QgYnBUb1NlbmQ6IE9iamVjdCA9IHtcclxuICAgICAgICAgIGxpbmU6IGJwLmxpbmUsXHJcbiAgICAgICAgfVxyXG4gICAgICAgIC8vIENvbHVtbiBhbmQgY29uZGl0aW9uIGFyZSBvcHRpb25hbCBpbiB0aGUgcHJvdG9jb2wsIGJ1dCBzaG91bGRcclxuICAgICAgICAvLyBvbmx5IGJlIGluY2x1ZGVkIG9uIHRoZSBvYmplY3Qgc2VudCB0byB0aGUgZGVidWcgYWRhcHRlciBpZlxyXG4gICAgICAgIC8vIHRoZXkgaGF2ZSB2YWx1ZXMgdGhhdCBleGlzdC5cclxuICAgICAgICBpZiAoYnAuY29sdW1uICE9IG51bGwgJiYgYnAuY29sdW1uID4gMCkge1xyXG4gICAgICAgICAgYnBUb1NlbmQuY29sdW1uID0gYnAuY29sdW1uXHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmIChicC5jb25kaXRpb24gIT0gbnVsbCAmJiBicC5jb25kaXRpb24gIT09IFwiXCIpIHtcclxuICAgICAgICAgIGJwVG9TZW5kLmNvbmRpdGlvbiA9IGJwLmNvbmRpdGlvblxyXG4gICAgICAgIH1cclxuICAgICAgICBpZiAoYnAubG9nTWVzc2FnZSAhPSBudWxsICYmIGJwLmxvZ01lc3NhZ2UgIT09IFwiXCIpIHtcclxuICAgICAgICAgIGJwVG9TZW5kLmxvZ01lc3NhZ2UgPSBicC5sb2dNZXNzYWdlXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBicFRvU2VuZFxyXG4gICAgICB9KSxcclxuICAgICAgc291cmNlTW9kaWZpZWQsXHJcbiAgICB9KVxyXG4gICAgaWYgKHJlc3BvbnNlID09IG51bGwgfHwgcmVzcG9uc2UuYm9keSA9PSBudWxsKSB7XHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGRhdGE6IHsgW2lkOiBzdHJpbmddOiBEZWJ1Z1Byb3RvY29sLkJyZWFrcG9pbnQgfSA9IHt9XHJcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGJyZWFrcG9pbnRzVG9TZW5kLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIC8vIElmIHNvdXJjZU1vZGlmaWVkID09PSB0cnVlLCB3ZSdyZSBkZWFsaW5nIHdpdGggbmV3IFVJIGJyZWFrcG9pbnRzIHRoYXRcclxuICAgICAgLy8gcmVwcmVzZW50IHRoZSBuZXcgbG9jYXRpb24ocykgdGhlIGJyZWFrcG9pbnRzIGVuZGVkIHVwIGluIGR1ZSB0byB0aGVcclxuICAgICAgLy8gZmlsZSBjb250ZW50cyBjaGFuZ2luZy4gVGhlc2UgYXJlIG9mIHR5cGUgSVVJQnJlYWtwb2ludC4gIE90aGVyd2lzZSxcclxuICAgICAgLy8gd2UgaGF2ZSBwcm9jZXNzIGJyZWFrcG9pbnRzIG9mIHR5cGUgSUJyZWFrcG9pbnQgaGVyZS4gVGhlc2UgdHlwZXMgYm90aCBoYXZlXHJcbiAgICAgIC8vIGFuIElELCBidXQgd2UgZ2V0IGl0IGEgbGl0dGxlIGRpZmZlcmVudGx5LlxyXG4gICAgICBjb25zdCBicElkID0gc291cmNlTW9kaWZpZWQgPyBicmVha3BvaW50c1RvU2VuZFtpXS5pZCA6IGJyZWFrcG9pbnRzVG9TZW5kW2ldLmdldElkKClcclxuXHJcbiAgICAgIGRhdGFbYnBJZF0gPSByZXNwb25zZS5ib2R5LmJyZWFrcG9pbnRzW2ldXHJcbiAgICAgIGlmICghYnJlYWtwb2ludHNUb1NlbmRbaV0uY29sdW1uKSB7XHJcbiAgICAgICAgLy8gSWYgdGhlcmUgd2FzIG5vIGNvbHVtbiBzZW50IGlnbm9yZSB0aGUgYnJlYWtwb2ludCBjb2x1bW4gcmVzcG9uc2UgZnJvbSB0aGUgYWRhcHRlclxyXG4gICAgICAgIGRhdGFbYnBJZF0uY29sdW1uID0gdW5kZWZpbmVkXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICB0aGlzLl9tb2RlbC51cGRhdGVQcm9jZXNzQnJlYWtwb2ludHMocHJvY2VzcywgZGF0YSlcclxuICB9XHJcblxyXG4gIF9nZXRDdXJyZW50U2Vzc2lvbigpOiA/VnNEZWJ1Z1Nlc3Npb24ge1xyXG4gICAgcmV0dXJuIHRoaXMuX3ZpZXdNb2RlbC5mb2N1c2VkUHJvY2VzcyA9PSBudWxsID8gbnVsbCA6ICh0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3Muc2Vzc2lvbjogYW55KVxyXG4gIH1cclxuXHJcbiAgX2dldEN1cnJlbnRQcm9jZXNzKCk6ID9JUHJvY2VzcyB7XHJcbiAgICByZXR1cm4gdGhpcy5fdmlld01vZGVsLmZvY3VzZWRQcm9jZXNzXHJcbiAgfVxyXG5cclxuICBhc3luYyBfc2VuZEZ1bmN0aW9uQnJlYWtwb2ludHMoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5fZ2V0Q3VycmVudFNlc3Npb24oKVxyXG4gICAgaWYgKHNlc3Npb24gPT0gbnVsbCB8fCAhc2Vzc2lvbi5pc1JlYWR5Rm9yQnJlYWtwb2ludHMoKSB8fCAhc2Vzc2lvbi5nZXRDYXBhYmlsaXRpZXMoKS5zdXBwb3J0c0Z1bmN0aW9uQnJlYWtwb2ludHMpIHtcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgYnJlYWtwb2ludHNUb1NlbmQ6IGFueSA9IHRoaXMuX21vZGVsXHJcbiAgICAgIC5nZXRGdW5jdGlvbkJyZWFrcG9pbnRzKClcclxuICAgICAgLmZpbHRlcigoZmJwKSA9PiBmYnAuZW5hYmxlZCAmJiB0aGlzLl9tb2RlbC5hcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpKVxyXG4gICAgY29uc3QgcmVzcG9uc2U6IERlYnVnUHJvdG9jb2wuU2V0RnVuY3Rpb25CcmVha3BvaW50c1Jlc3BvbnNlID0gYXdhaXQgc2Vzc2lvbi5zZXRGdW5jdGlvbkJyZWFrcG9pbnRzKHtcclxuICAgICAgYnJlYWtwb2ludHM6IGJyZWFrcG9pbnRzVG9TZW5kLFxyXG4gICAgfSlcclxuICAgIGlmIChyZXNwb25zZSA9PSBudWxsIHx8IHJlc3BvbnNlLmJvZHkgPT0gbnVsbCkge1xyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBkYXRhID0ge31cclxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgYnJlYWtwb2ludHNUb1NlbmQubGVuZ3RoOyBpKyspIHtcclxuICAgICAgZGF0YVticmVha3BvaW50c1RvU2VuZFtpXS5nZXRJZCgpXSA9IHJlc3BvbnNlLmJvZHkuYnJlYWtwb2ludHNbaV1cclxuICAgIH1cclxuXHJcbiAgICB0aGlzLl9tb2RlbC51cGRhdGVGdW5jdGlvbkJyZWFrcG9pbnRzKGRhdGEpXHJcbiAgfVxyXG5cclxuICBhc3luYyBfc2VuZEV4Y2VwdGlvbkJyZWFrcG9pbnRzKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2dldEN1cnJlbnRTZXNzaW9uKClcclxuICAgIGlmIChzZXNzaW9uID09IG51bGwgfHwgIXNlc3Npb24uaXNSZWFkeUZvckJyZWFrcG9pbnRzKCkgfHwgdGhpcy5fbW9kZWwuZ2V0RXhjZXB0aW9uQnJlYWtwb2ludHMoKS5sZW5ndGggPT09IDApIHtcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZW5hYmxlZEV4Y2VwdGlvbkJwcyA9IHRoaXMuX21vZGVsLmdldEV4Y2VwdGlvbkJyZWFrcG9pbnRzKCkuZmlsdGVyKChleGIpID0+IGV4Yi5lbmFibGVkKVxyXG4gICAgYXdhaXQgc2Vzc2lvbi5zZXRFeGNlcHRpb25CcmVha3BvaW50cyh7XHJcbiAgICAgIGZpbHRlcnM6IGVuYWJsZWRFeGNlcHRpb25CcHMubWFwKChleGIpID0+IGV4Yi5maWx0ZXIpLFxyXG4gICAgfSlcclxuICB9XHJcblxyXG4gIF9ldmFsdWF0ZUV4cHJlc3Npb24oZXhwcmVzc2lvbjogSUV2YWx1YXRhYmxlRXhwcmVzc2lvbiwgbGV2ZWw6IExldmVsKSB7XHJcbiAgICBjb25zdCB7IGZvY3VzZWRQcm9jZXNzLCBmb2N1c2VkU3RhY2tGcmFtZSB9ID0gdGhpcy5fdmlld01vZGVsXHJcbiAgICBpZiAoZm9jdXNlZFByb2Nlc3MgPT0gbnVsbCkge1xyXG4gICAgICBsb2dnZXIuZXJyb3IoXCJDYW5ub3QgZXZhbHVhdGUgd2hpbGUgdGhlcmUgaXMgbm8gYWN0aXZlIGRlYnVnIHNlc3Npb25cIilcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcbiAgICBjb25zdCBzdWJzY3JpcHRpb24gPVxyXG4gICAgICAvLyBXZSBmaWx0ZXIgaGVyZSBiZWNhdXNlIHRoZSBmaXJzdCB2YWx1ZSBpbiB0aGUgQmVoYXZpb3JTdWJqZWN0IGlzIG51bGwgbm8gbWF0dGVyIHdoYXQsIGFuZFxyXG4gICAgICAvLyB3ZSB3YW50IHRoZSBjb25zb2xlIHRvIHVuc3Vic2NyaWJlIHRoZSBzdHJlYW0gYWZ0ZXIgdGhlIGZpcnN0IG5vbi1udWxsIHZhbHVlLlxyXG4gICAgICBldmFsdWF0ZUV4cHJlc3Npb25Bc1N0cmVhbShleHByZXNzaW9uLCBmb2N1c2VkUHJvY2VzcywgZm9jdXNlZFN0YWNrRnJhbWUsIFwicmVwbFwiKVxyXG4gICAgICAgIC5za2lwKDEpIC8vIFNraXAgdGhlIGZpcnN0IHBlbmRpbmcgdmFsdWUuXHJcbiAgICAgICAgLnN1YnNjcmliZSgocmVzdWx0KSA9PiB7XHJcbiAgICAgICAgICAvLyBFdmFsdWF0ZSBhbGwgd2F0Y2ggZXhwcmVzc2lvbnMgYW5kIGZldGNoIHZhcmlhYmxlcyBhZ2FpbiBzaW5jZSByZXBsIGV2YWx1YXRpb24gbWlnaHQgaGF2ZSBjaGFuZ2VkIHNvbWUuXHJcbiAgICAgICAgICB0aGlzLl92aWV3TW9kZWwuc2V0Rm9jdXNlZFN0YWNrRnJhbWUodGhpcy5fdmlld01vZGVsLmZvY3VzZWRTdGFja0ZyYW1lLCBmYWxzZSlcclxuXHJcbiAgICAgICAgICBpZiAocmVzdWx0LmlzRXJyb3IgfHwgcmVzdWx0LmlzUGVuZGluZyB8fCAhZXhwcmVzc2lvbi5hdmFpbGFibGUpIHtcclxuICAgICAgICAgICAgY29uc3QgbWVzc2FnZTogQ29uc29sZU1lc3NhZ2UgPSB7XHJcbiAgICAgICAgICAgICAgdGV4dDogZXhwcmVzc2lvbi5nZXRWYWx1ZSgpLFxyXG4gICAgICAgICAgICAgIGxldmVsOiBcImVycm9yXCIsXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgdGhpcy5fY29uc29sZU91dHB1dC5uZXh0KG1lc3NhZ2UpXHJcbiAgICAgICAgICB9IGVsc2UgaWYgKGV4cHJlc3Npb24uaGFzQ2hpbGRyZW4oKSkge1xyXG4gICAgICAgICAgICB0aGlzLl9jb25zb2xlT3V0cHV0Lm5leHQoe1xyXG4gICAgICAgICAgICAgIHRleHQ6IFwib2JqZWN0XCIsXHJcbiAgICAgICAgICAgICAgZXhwcmVzc2lvbnM6IFtleHByZXNzaW9uXSxcclxuICAgICAgICAgICAgICBsZXZlbCxcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRoaXMuX2NvbnNvbGVPdXRwdXQubmV4dCh7XHJcbiAgICAgICAgICAgICAgdGV4dDogZXhwcmVzc2lvbi5nZXRWYWx1ZSgpLFxyXG4gICAgICAgICAgICAgIGxldmVsLFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgdGhpcy5fY29uc29sZURpc3Bvc2FibGVzLnJlbW92ZShzdWJzY3JpcHRpb24pXHJcbiAgICAgICAgfSlcclxuICAgIHRoaXMuX2NvbnNvbGVEaXNwb3NhYmxlcy5hZGQoc3Vic2NyaXB0aW9uKVxyXG4gIH1cclxuXHJcbiAgX3JlZ2lzdGVyQ29uc29sZUV4ZWN1dG9yKCkge1xyXG4gICAgdGhpcy5fY29uc29sZURpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoKVxyXG4gICAgY29uc3QgcmVnaXN0ZXJFeGVjdXRvciA9IGdldENvbnNvbGVSZWdpc3RlckV4ZWN1dG9yKClcclxuICAgIGlmIChyZWdpc3RlckV4ZWN1dG9yID09IG51bGwpIHtcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyKClcclxuICAgIGNvbnN0IFNDT1BFX0NIQU5HRUQgPSBcIlNDT1BFX0NIQU5HRURcIlxyXG4gICAgY29uc3Qgdmlld01vZGVsID0gdGhpcy5fdmlld01vZGVsXHJcbiAgICBjb25zdCBldmFsdWF0ZUV4cHJlc3Npb24gPSB0aGlzLl9ldmFsdWF0ZUV4cHJlc3Npb24uYmluZCh0aGlzKVxyXG4gICAgY29uc3QgZXhlY3V0b3IgPSB7XHJcbiAgICAgIGlkOiBcImRlYnVnZ2VyXCIsXHJcbiAgICAgIG5hbWU6IFwiRGVidWdnZXJcIixcclxuICAgICAgc2NvcGVOYW1lOiAoKSA9PiB7XHJcbiAgICAgICAgaWYgKHZpZXdNb2RlbC5mb2N1c2VkUHJvY2VzcyAhPSBudWxsICYmIHZpZXdNb2RlbC5mb2N1c2VkUHJvY2Vzcy5jb25maWd1cmF0aW9uLmdyYW1tYXJOYW1lICE9IG51bGwpIHtcclxuICAgICAgICAgIHJldHVybiB2aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3MuY29uZmlndXJhdGlvbi5ncmFtbWFyTmFtZVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gXCJ0ZXh0LnBsYWluXCJcclxuICAgICAgfSxcclxuICAgICAgb25EaWRDaGFuZ2VTY29wZU5hbWUoY2FsbGJhY2s6ICgpID0+IG1peGVkKTogSURpc3Bvc2FibGUge1xyXG4gICAgICAgIHJldHVybiBlbWl0dGVyLm9uKFNDT1BFX0NIQU5HRUQsIGNhbGxiYWNrKVxyXG4gICAgICB9LFxyXG4gICAgICBzZW5kKGV4cHJlc3Npb246IHN0cmluZykge1xyXG4gICAgICAgIGV2YWx1YXRlRXhwcmVzc2lvbihuZXcgRXhwcmVzc2lvbihleHByZXNzaW9uKSwgXCJsb2dcIilcclxuICAgICAgfSxcclxuICAgICAgb3V0cHV0OiB0aGlzLl9jb25zb2xlT3V0cHV0LFxyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuX2NvbnNvbGVEaXNwb3NhYmxlcy5hZGQoXHJcbiAgICAgIGVtaXR0ZXIsXHJcbiAgICAgIHRoaXMuX3ZpZXdNb2RlbC5vbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMoKCkgPT4ge1xyXG4gICAgICAgIGVtaXR0ZXIuZW1pdChTQ09QRV9DSEFOR0VEKVxyXG4gICAgICB9KVxyXG4gICAgKVxyXG4gICAgdGhpcy5fY29uc29sZURpc3Bvc2FibGVzLmFkZChyZWdpc3RlckV4ZWN1dG9yKGV4ZWN1dG9yKSlcclxuICB9XHJcblxyXG4gIGRpc3Bvc2UoKTogdm9pZCB7XHJcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKClcclxuICAgIHRoaXMuX2NvbnNvbGVEaXNwb3NhYmxlcy5kaXNwb3NlKClcclxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5kaXNwb3NlKClcclxuICB9XHJcbn1cclxuXHJcbmNsYXNzIERlYnVnU291cmNlVGV4dEJ1ZmZmZXIgZXh0ZW5kcyBUZXh0QnVmZmVyIHtcclxuICBfdXJpOiBzdHJpbmdcclxuXHJcbiAgY29uc3RydWN0b3IoY29udGVudHM6IHN0cmluZywgdXJpOiBzdHJpbmcpIHtcclxuICAgIHN1cGVyKGNvbnRlbnRzKVxyXG4gICAgdGhpcy5fdXJpID0gdXJpXHJcbiAgfVxyXG5cclxuICBnZXRVcmkoKSB7XHJcbiAgICByZXR1cm4gdGhpcy5fdXJpXHJcbiAgfVxyXG5cclxuICBnZXRQYXRoKCkge1xyXG4gICAgcmV0dXJuIHRoaXMuX3VyaVxyXG4gIH1cclxuXHJcbiAgaXNNb2RpZmllZCgpIHtcclxuICAgIHJldHVybiBmYWxzZVxyXG4gIH1cclxufVxyXG4iXX0=