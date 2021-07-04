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

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnU2VydmljZS5qcyJdLCJuYW1lcyI6WyJDT05TT0xFX1ZJRVdfVVJJIiwiQ1VTVE9NX0RFQlVHX0VWRU5UIiwiQ0hBTkdFX0RFQlVHX01PREUiLCJTVEFSVF9ERUJVR19TRVNTSU9OIiwiQUNUSVZFX1RIUkVBRF9DSEFOR0VEIiwiREVCVUdHRVJfRk9DVVNfQ0hBTkdFRCIsIkNIQU5HRV9FWFBSRVNTSU9OX0NPTlRFWFQiLCJNQVhfQlJFQUtQT0lOVF9FVkVOVF9ERUxBWV9NUyIsIlZpZXdNb2RlbCIsImNvbnN0cnVjdG9yIiwiX2ZvY3VzZWRQcm9jZXNzIiwiX2ZvY3VzZWRUaHJlYWQiLCJfZm9jdXNlZFN0YWNrRnJhbWUiLCJfZW1pdHRlciIsIkVtaXR0ZXIiLCJmb2N1c2VkUHJvY2VzcyIsImZvY3VzZWRUaHJlYWQiLCJmb2N1c2VkU3RhY2tGcmFtZSIsIm9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cyIsImNhbGxiYWNrIiwib24iLCJvbkRpZENoYW5nZUV4cHJlc3Npb25Db250ZXh0IiwiX2Nob29zZUZvY3VzVGhyZWFkIiwicHJvY2VzcyIsInRocmVhZHMiLCJnZXRBbGxUaHJlYWRzIiwiaWQiLCJnZXRJZCIsImN1cnJlbnRGb2N1c2VkVGhyZWFkIiwiZmlsdGVyIiwidCIsInN0b3BwZWQiLCJsZW5ndGgiLCJzdG9wcGVkVGhyZWFkcyIsIl9jaG9vc2VGb2N1c1N0YWNrRnJhbWUiLCJ0aHJlYWQiLCJjdXJyZW50Rm9jdXNlZEZyYW1lIiwiZ2V0Q2FjaGVkQ2FsbFN0YWNrIiwiZmluZCIsImYiLCJnZXRDYWxsU3RhY2tUb3BGcmFtZSIsIl9zZXRGb2N1cyIsInN0YWNrRnJhbWUiLCJleHBsaWNpdCIsIm5ld1Byb2Nlc3MiLCJmb2N1c0NoYW5nZWQiLCJlbWl0IiwiZXZhbHVhdGVDb250ZXh0Q2hhbmdlZCIsInNldEZvY3VzZWRQcm9jZXNzIiwibmV3Rm9jdXNUaHJlYWQiLCJuZXdGb2N1c0ZyYW1lIiwic2V0Rm9jdXNlZFRocmVhZCIsInNldEZvY3VzZWRTdGFja0ZyYW1lIiwiZ2V0RGVidWdnZXJOYW1lIiwiYWRhcHRlclR5cGUiLCJEZWJ1Z1NlcnZpY2UiLCJzdGF0ZSIsIl9tb2RlbCIsIl9kaXNwb3NhYmxlcyIsIl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMiLCJfY29uc29sZURpc3Bvc2FibGVzIiwiX3ZpZXdNb2RlbCIsIl90aW1lciIsIl9icmVha3BvaW50c1RvU2VuZE9uU2F2ZSIsIl9jb25zb2xlT3V0cHV0IiwiX3J1bkluVGVybWluYWwiLCJhcmdzIiwidGVybWluYWxTZXJ2aWNlIiwiRXJyb3IiLCJfZ2V0Q3VycmVudFByb2Nlc3MiLCJ0YXJnZXRVcmkiLCJjb25maWd1cmF0aW9uIiwia2V5IiwiY2xvc2UiLCJ0aXRsZSIsImhvc3RuYW1lIiwibnVjbGlkZVVyaSIsImdldEhvc3RuYW1lT3B0IiwiY3dkIiwiY3JlYXRlUmVtb3RlVXJpIiwiaW5mbyIsImNvbW1hbmQiLCJmaWxlIiwic2xpY2UiLCJlbnZpcm9ubWVudFZhcmlhYmxlcyIsImVudiIsInVuZGVmaW5lZCIsInByZXNlcnZlZENvbW1hbmRzIiwicmVtYWluT25DbGVhbkV4aXQiLCJpY29uIiwiZGVmYXVsdExvY2F0aW9uIiwidGVybWluYWwiLCJvcGVuIiwic2V0UHJvY2Vzc0V4aXRDYWxsYmFjayIsInN0b3BQcm9jZXNzIiwiYWRkIiwidGVybWluYXRlUHJvY2VzcyIsInNwYXduIiwiY2IiLCJvblNwYXduIiwidGFrZSIsInRvUHJvbWlzZSIsIl9vblNlc3Npb25FbmQiLCJzZXNzaW9uIiwiQW5hbHl0aWNzRXZlbnRzIiwiREVCVUdHRVJfU1RPUCIsInJlbW92ZWRQcm9jZXNzZXMiLCJyZW1vdmVQcm9jZXNzIiwiZm9yRWFjaCIsInNldFN0b3BQZW5kaW5nIiwiX29uRGVidWdnZXJNb2RlQ2hhbmdlZCIsIkRlYnVnZ2VyTW9kZSIsIlNUT1BQSU5HIiwiZGlzY29ubmVjdCIsImdldFByb2Nlc3NlcyIsImRpc3Bvc2UiLCJhbGxQcm9jZXNzZXMiLCJwcm9jZXNzVG9Gb2N1cyIsInAiLCJzb21lIiwiU1RPUFBFRCIsImNyZWF0ZUNvbnNvbGUiLCJuYW1lIiwiY29uc29sZUFwaSIsImFwcGVuZCIsInRleHQiLCJwcm9jZXNzTmFtZSIsImxldmVsIiwib25TdWNjZXNzIiwiVW5pdmVyc2FsRGlzcG9zYWJsZSIsIlNldCIsIlN1YmplY3QiLCJNb2RlbCIsIl9sb2FkQnJlYWtwb2ludHMiLCJfbG9hZEZ1bmN0aW9uQnJlYWtwb2ludHMiLCJfbG9hZEV4Y2VwdGlvbkJyZWFrcG9pbnRzIiwiX2xvYWRXYXRjaEV4cHJlc3Npb25zIiwiX3JlZ2lzdGVyTGlzdGVuZXJzIiwidmlld01vZGVsIiwiZ2V0RGVidWdnZXJNb2RlIiwiZGVidWdnZXJNb2RlIiwiYXRvbSIsIndvcmtzcGFjZSIsImFkZE9wZW5lciIsInVyaSIsInN0YXJ0c1dpdGgiLCJERUJVR19TT1VSQ0VTX1VSSSIsIl9vcGVuU291cmNlVmlldyIsInF1ZXJ5IiwidXJsIiwicGFyc2UiLCJwYXRoIiwic3BsaXQiLCJzZXNzaW9uSWQiLCJzb3VyY2VSZWZlcmVuY2VSYXciLCJzb3VyY2VSZWZlcmVuY2UiLCJwYXJzZUludCIsInNvdXJjZSIsImdldFNvdXJjZSIsImNvbnRlbnQiLCJyZXNwb25zZSIsInJhdyIsImJvZHkiLCJlcnJvciIsIl9zb3VyY2VJc05vdEF2YWlsYWJsZSIsImVkaXRvciIsImJ1aWxkVGV4dEVkaXRvciIsImJ1ZmZlciIsIkRlYnVnU291cmNlVGV4dEJ1ZmZmZXIiLCJhdXRvSGVpZ2h0IiwicmVhZE9ubHkiLCJzZXJpYWxpemUiLCJzZXRHcmFtbWFyIiwiZ3JhbW1hcnMiLCJzZWxlY3RHcmFtbWFyIiwidGV4dEVkaXRvckJhbm5lciIsIlRleHRFZGl0b3JCYW5uZXIiLCJyZW5kZXIiLCJiaW5kIiwiYWRkVW50aWxEZXN0cm95ZWQiLCJfdHJ5VG9BdXRvRm9jdXNTdGFja0ZyYW1lIiwiY2FsbFN0YWNrIiwiaW5jbHVkZXMiLCJzdGFja0ZyYW1lVG9Gb2N1cyIsInNmIiwiYXZhaWxhYmxlIiwiX3JlZ2lzdGVyTWFya2VycyIsInNlbGVjdGVkRnJhbWVNYXJrZXIiLCJ0aHJlYWRDaGFuZ2VEYXRhdGlwIiwibGFzdEZvY3VzZWRUaHJlYWRJZCIsImxhc3RGb2N1c2VkUHJvY2VzcyIsImNsZWF1cE1hcmtlcnMiLCJkZXN0cm95IiwiY29uY2F0TWFwIiwiZXZlbnQiLCJQQVVTRUQiLCJub3RpZmljYXRpb25zIiwiYWRkV2FybmluZyIsIk9ic2VydmFibGUiLCJlbXB0eSIsImZyb21Qcm9taXNlIiwib3BlbkluRWRpdG9yIiwic3dpdGNoTWFwIiwiZXJyb3JNc2ciLCJhZGRFcnJvciIsIm9mIiwic3Vic2NyaWJlIiwibGluZSIsInJhbmdlIiwic3RhcnQiLCJyb3ciLCJtYXJrQnVmZmVyUmFuZ2UiLCJJbmZpbml0eSIsImludmFsaWRhdGUiLCJkZWNvcmF0ZU1hcmtlciIsInR5cGUiLCJjbGFzcyIsImRhdGF0aXBTZXJ2aWNlIiwic2V0RXhjZXB0aW9uQnJlYWtwb2ludHMiLCJjYXBhYmlsaXRpZXMiLCJleGNlcHRpb25CcmVha3BvaW50RmlsdGVycyIsInRocmVhZElkIiwibWVzc2FnZSIsIm5ld0ZvY3VzZWRQcm9jZXNzIiwiY3JlYXRlUGlubmVkRGF0YVRpcCIsImNvbXBvbmVudCIsInBpbm5hYmxlIiwiX3JlZ2lzdGVyU2Vzc2lvbkxpc3RlbmVycyIsInRocmVhZEZldGNoZXIiLCJyYXdVcGRhdGUiLCJvcGVuRmlsZXNTYXZlZCIsIm9ic2VydmVUZXh0RWRpdG9ycyIsImZsYXRNYXAiLCJvbkRpZFNhdmUiLCJtYXAiLCJnZXRQYXRoIiwidGFrZVVudGlsIiwib25EaWREZXN0cm95IiwiZmlsZVBhdGgiLCJoYXMiLCJkZWxldGUiLCJfc2VuZEJyZWFrcG9pbnRzIiwib2JzZXJ2ZUluaXRpYWxpemVFdmVudHMiLCJzZW5kQ29uZmlndXJhdGlvbkRvbmUiLCJnZXRDYXBhYmlsaXRpZXMiLCJzdXBwb3J0c0NvbmZpZ3VyYXRpb25Eb25lUmVxdWVzdCIsImNvbmZpZ3VyYXRpb25Eb25lIiwidGhlbiIsIl8iLCJSVU5OSU5HIiwiY2F0Y2giLCJlIiwib25VbmV4cGVjdGVkRXJyb3IiLCJkZXRhaWwiLCJfc2VuZEFsbEJyZWFrcG9pbnRzIiwidG9Gb2N1c1RocmVhZHMiLCJvYnNlcnZlQ29udGludWVkVG8iLCJvYnNlcnZlQ29udGludWVkRXZlbnRzIiwiY29udGludWVkIiwiYWxsVGhyZWFkc0NvbnRpbnVlZCIsIm9ic2VydmVTdG9wRXZlbnRzIiwib2JzZXJ2ZUV2YWx1YXRpb25zIiwiaWdub3JlRWxlbWVudHMiLCJjb25jYXQiLCJzdG9wcGVkRGV0YWlscyIsImdldFRocmVhZCIsIm5leHQiLCJwcmVzZXJ2ZUZvY3VzSGludCIsInRoaXNUaHJlYWRJc0ZvY3VzZWQiLCJyZWZyZXNoQ2FsbFN0YWNrIiwiX3NjaGVkdWxlTmF0aXZlTm90aWZpY2F0aW9uIiwib2JzZXJ2ZVRocmVhZEV2ZW50cyIsInJlYXNvbiIsImNsZWFyVGhyZWFkcyIsIm9ic2VydmVUZXJtaW5hdGVEZWJ1Z2VlRXZlbnRzIiwicmVzdGFydCIsInJlc3RhcnRQcm9jZXNzIiwiZXJyIiwic3RhY2siLCJTdHJpbmciLCJvdXRwdXRFdmVudHMiLCJvYnNlcnZlT3V0cHV0RXZlbnRzIiwib3V0cHV0Iiwic2hhcmUiLCJub3RpZmljYXRpb25TdHJlYW0iLCJjYXRlZ29yeSIsImRhdGEiLCJudWNsaWRlVHJhY2tTdHJlYW0iLCJDQVRFR09SSUVTX01BUCIsIk1hcCIsIklHTk9SRURfQ0FURUdPUklFUyIsImxvZ1N0cmVhbSIsInZhcmlhYmxlc1JlZmVyZW5jZSIsImdldCIsIm9iamVjdFN0cmVhbSIsImxhc3RFbnRyeVRva2VuIiwiaGFuZGxlTWVzc2FnZSIsImNvbXBsZXRlIiwiZW5kc1dpdGgiLCJzYW1lTGV2ZWwiLCJnZXRDdXJyZW50TGV2ZWwiLCJhcHBlbmRUZXh0Iiwic2V0Q29tcGxldGUiLCJpbmNvbXBsZXRlIiwiY29udGFpbmVyIiwiRXhwcmVzc2lvbkNvbnRhaW5lciIsInV1aWQiLCJ2NCIsImdldENoaWxkcmVuIiwiY2hpbGRyZW4iLCJleHByZXNzaW9ucyIsIm9ic2VydmVCcmVha3BvaW50RXZlbnRzIiwiYnJlYWtwb2ludCIsIkJyZWFrcG9pbnRFdmVudFJlYXNvbnMiLCJDSEFOR0VEIiwiUkVNT1ZFRCIsInNvdXJjZUJyZWFrcG9pbnQiLCJmdW5jdGlvbkJyZWFrcG9pbnQiLCJvbkRpZENoYW5nZUJyZWFrcG9pbnRzIiwic3RhcnRXaXRoIiwiZ2V0QnJlYWtwb2ludHMiLCJiIiwiaWRGcm9tQWRhcHRlciIsInBvcCIsImdldEZ1bmN0aW9uQnJlYWtwb2ludHMiLCJ0aW1lb3V0IiwiVGltZW91dEVycm9yIiwibG9nZ2VyIiwiTkVXIiwiYWRkVUlCcmVha3BvaW50cyIsImNvbHVtbiIsImVuYWJsZWQiLCJyZW1vdmVCcmVha3BvaW50cyIsInJlbW92ZUZ1bmN0aW9uQnJlYWtwb2ludHMiLCJ1cGRhdGVQcm9jZXNzQnJlYWtwb2ludHMiLCJ1cGRhdGVGdW5jdGlvbkJyZWFrcG9pbnRzIiwid2FybiIsIm9ic2VydmVBZGFwdGVyRXhpdGVkRXZlbnRzIiwib2JzZXJ2ZUN1c3RvbUV2ZW50cyIsInNvdXJjZVJlZkJyZWFrcG9pbnRzIiwiYnAiLCJyYWlzZU5hdGl2ZU5vdGlmaWNhdGlvbiIsInBlbmRpbmdOb3RpZmljYXRpb24iLCJvbkRpZENoYW5nZUFjdGl2ZVRocmVhZCIsIm9uRGlkU3RhcnREZWJ1Z1Nlc3Npb24iLCJvbkRpZEN1c3RvbUV2ZW50Iiwib25EaWRDaGFuZ2VQcm9jZXNzTW9kZSIsInJlc3VsdCIsInNvdXJjZUJyZWFrcG9pbnRzIiwib3JpZ2luYWxMaW5lIiwiY29uZGl0aW9uIiwidHJpbSIsImxvZ01lc3NhZ2UiLCJmdW5jdGlvbkJyZWFrcG9pbnRzIiwiZmIiLCJGdW5jdGlvbkJyZWFrcG9pbnQiLCJoaXRDb25kaXRpb24iLCJleGNlcHRpb25CcmVha3BvaW50cyIsImV4QnJlYWtwb2ludCIsIkV4Y2VwdGlvbkJyZWFrcG9pbnQiLCJsYWJlbCIsIndhdGNoRXhwcmVzc2lvbnMiLCJFeHByZXNzaW9uIiwibW9kZSIsImVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzIiwiZW5hYmxlIiwic2V0RW5hYmxlbWVudCIsIkJyZWFrcG9pbnQiLCJfc2VuZEZ1bmN0aW9uQnJlYWtwb2ludHMiLCJERUJVR0dFUl9UT0dHTEVfRVhDRVBUSU9OX0JSRUFLUE9JTlQiLCJfc2VuZEV4Y2VwdGlvbkJyZWFrcG9pbnRzIiwiZW5hYmxlT3JEaXNhYmxlQWxsQnJlYWtwb2ludHMiLCJ1aUJyZWFrcG9pbnRzIiwiREVCVUdHRVJfQlJFQUtQT0lOVF9BREQiLCJ1cmlzIiwicHJvbWlzZXMiLCJwdXNoIiwiUHJvbWlzZSIsImFsbCIsImFkZFNvdXJjZUJyZWFrcG9pbnQiLCJERUJVR0dFUl9CUkVBS1BPSU5UX1NJTkdMRV9BREQiLCJleGlzdGluZyIsImdldEJyZWFrcG9pbnRBdExpbmUiLCJyZXNvbHZlIiwidG9nZ2xlU291cmNlQnJlYWtwb2ludCIsIkRFQlVHR0VSX0JSRUFLUE9JTlRfVE9HR0xFIiwidXBkYXRlQnJlYWtwb2ludHMiLCJ1cmlzVG9TZW5kIiwic2tpcEFuYWx5dGljcyIsInRvUmVtb3ZlIiwidXJpc1RvQ2xlYXIiLCJERUJVR0dFUl9CUkVBS1BPSU5UX0RFTEVURV9BTEwiLCJERUJVR0dFUl9CUkVBS1BPSU5UX0RFTEVURSIsInNldEJyZWFrcG9pbnRzQWN0aXZhdGVkIiwiYWN0aXZhdGVkIiwiYWRkRnVuY3Rpb25CcmVha3BvaW50IiwicmVuYW1lRnVuY3Rpb25CcmVha3BvaW50IiwibmV3RnVuY3Rpb25OYW1lIiwidGVybWluYXRlVGhyZWFkcyIsInRocmVhZElkcyIsIkRFQlVHR0VSX1RFUk1JTkFURV9USFJFQUQiLCJCb29sZWFuIiwic3VwcG9ydHNUZXJtaW5hdGVUaHJlYWRzUmVxdWVzdCIsImN1c3RvbSIsInJ1blRvTG9jYXRpb24iLCJERUJVR0dFUl9TVEVQX1JVTl9UT19MT0NBVElPTiIsInN1cHBvcnRzQ29udGludWVUb0xvY2F0aW9uIiwicnVuVG9Mb2NhdGlvbkJyZWFrcG9pbnQiLCJyZW1vdmVCcmVha3BvaW50IiwicmVtb3ZlQnJlYWtwb2ludERpc3Bvc2FibGUiLCJyZW1vdmUiLCJjb250aW51ZSIsImFkZFdhdGNoRXhwcmVzc2lvbiIsIkRFQlVHR0VSX1dBVENIX0FERF9FWFBSRVNTSU9OIiwicmVuYW1lV2F0Y2hFeHByZXNzaW9uIiwibmV3TmFtZSIsIkRFQlVHR0VSX1dBVENIX1VQREFURV9FWFBSRVNTSU9OIiwicmVtb3ZlV2F0Y2hFeHByZXNzaW9ucyIsIkRFQlVHR0VSX1dBVENIX1JFTU9WRV9FWFBSRVNTSU9OIiwiY3JlYXRlRXhwcmVzc2lvbiIsInJhd0V4cHJlc3Npb24iLCJfZG9DcmVhdGVQcm9jZXNzIiwicmF3Q29uZmlndXJhdGlvbiIsImVycm9ySGFuZGxlciIsIm9uRXJyb3IiLCJERUJVR0dFUl9TVEFSVF9GQUlMIiwiZXJyb3JNZXNzYWdlIiwiaXNEaXNjb25uZWN0ZWQiLCJhZGFwdGVyRXhlY3V0YWJsZSIsIl9yZXNvbHZlQWRhcHRlckV4ZWN1dGFibGUiLCJvbkRlYnVnU3RhcnRpbmdDYWxsYmFjayIsIm9uRGVidWdTdGFydGVkQ2FsbGJhY2siLCJvbkRlYnVnUnVubmluZ0NhbGxiYWNrIiwiREVCVUdHRVJfU1RBUlQiLCJzZXJ2aWNlTmFtZSIsImNsaWVudFR5cGUiLCJzZXNzaW9uVGVhcmRvd25EaXNwb3NhYmxlcyIsImluc3RhbmNlSW50ZXJmYWNlIiwibmV3U2Vzc2lvbiIsIk9iamVjdCIsImZyZWV6ZSIsImN1c3RvbVJlcXVlc3QiLCJyZXF1ZXN0IiwiY3JlYXRlSW5pdGlhbGl6ZVNlc3Npb24iLCJjb25maWciLCJfY3JlYXRlVnNEZWJ1Z1Nlc3Npb24iLCJfcmVnaXN0ZXJDb25zb2xlRXhlY3V0b3IiLCJhZGRQcm9jZXNzIiwiU1RBUlRJTkciLCJjb21tYW5kcyIsImRpc3BhdGNoIiwidmlld3MiLCJnZXRWaWV3IiwiaW5pdGlhbGl6ZSIsImNsaWVudElEIiwiYWRhcHRlcklEIiwicGF0aEZvcm1hdCIsImxpbmVzU3RhcnRBdDEiLCJjb2x1bW5zU3RhcnRBdDEiLCJzdXBwb3J0c1ZhcmlhYmxlVHlwZSIsInN1cHBvcnRzVmFyaWFibGVQYWdpbmciLCJzdXBwb3J0c1J1bkluVGVybWluYWxSZXF1ZXN0IiwibG9jYWxlIiwidGVhcmRvd24iLCJzZXRSdW5uaW5nU3RhdGUiLCJjbGVhclByb2Nlc3NTdGFydGluZ0ZsYWciLCJfbGF1bmNoT3JBdHRhY2hUYXJnZXQiLCJkZWJ1Z01vZGUiLCJvcyIsInBsYXRmb3JtIiwiaXNSZW1vdGUiLCJvbkRpZENoYW5nZVByb2Nlc3NlcyIsImdldE1vZGVsIiwiZ2V0QWRhcHRlckV4ZWN1dGFibGVJbmZvIiwic2VydmljZSIsInNwYXduZXIiLCJjcmVhdGVWc1Jhd0FkYXB0ZXJTcGF3bmVyU2VydmljZSIsImNsaWVudFByZXByb2Nlc3NvcnMiLCJhZGFwdGVyUHJlcHJvY2Vzc29ycyIsImNsaWVudFByZXByb2Nlc3NvciIsImFkYXB0ZXJQcmVwcm9jZXNzb3IiLCJWc0RlYnVnU2Vzc2lvbiIsImFkYXB0ZXIiLCJob3N0IiwiaXNSZWFkT25seSIsImF0dGFjaCIsImxhdW5jaCIsInNvdXJjZUlzTm90QXZhaWxhYmxlIiwiY2FuUmVzdGFydFByb2Nlc3MiLCJpc1Jlc3RhcnRhYmxlIiwic3VwcG9ydHNSZXN0YXJ0UmVxdWVzdCIsInN0YXJ0RGVidWdnaW5nIiwic2VhcmNoQWxsUGFuZXMiLCJkZWJ1Z2dlclR5cGVzIiwiREVCVUdHRVJfTVVMVElUQVJHRVQiLCJwcm9jZXNzZXNDb3VudCIsInNvdXJjZU1vZGlmaWVkIiwiX2dldEN1cnJlbnRTZXNzaW9uIiwiaXNSZWFkeUZvckJyZWFrcG9pbnRzIiwiYnJlYWtwb2ludHNUb1NlbmQiLCJnZXRVSUJyZWFrcG9pbnRzIiwiYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQiLCJyYXdTb3VyY2UiLCJiYXNlbmFtZSIsImFkYXB0ZXJEYXRhIiwic2V0QnJlYWtwb2ludHMiLCJsaW5lcyIsImJyZWFrcG9pbnRzIiwiYnBUb1NlbmQiLCJpIiwiYnBJZCIsInN1cHBvcnRzRnVuY3Rpb25CcmVha3BvaW50cyIsImZicCIsInNldEZ1bmN0aW9uQnJlYWtwb2ludHMiLCJnZXRFeGNlcHRpb25CcmVha3BvaW50cyIsImVuYWJsZWRFeGNlcHRpb25CcHMiLCJleGIiLCJmaWx0ZXJzIiwiX2V2YWx1YXRlRXhwcmVzc2lvbiIsImV4cHJlc3Npb24iLCJzdWJzY3JpcHRpb24iLCJza2lwIiwiaXNFcnJvciIsImlzUGVuZGluZyIsImdldFZhbHVlIiwiaGFzQ2hpbGRyZW4iLCJyZWdpc3RlckV4ZWN1dG9yIiwiZW1pdHRlciIsIlNDT1BFX0NIQU5HRUQiLCJldmFsdWF0ZUV4cHJlc3Npb24iLCJleGVjdXRvciIsInNjb3BlTmFtZSIsImdyYW1tYXJOYW1lIiwib25EaWRDaGFuZ2VTY29wZU5hbWUiLCJzZW5kIiwiVGV4dEJ1ZmZlciIsImNvbnRlbnRzIiwiX3VyaSIsImdldFVyaSIsImlzTW9kaWZpZWQiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFtREE7O0FBQ0E7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBTUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBUUE7O0FBQ0E7O0FBU0E7O0FBQ0E7O0FBQ0E7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBbEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBeUVBLE1BQU1BLGdCQUFnQixHQUFHLHdCQUF6QjtBQUVBLE1BQU1DLGtCQUFrQixHQUFHLG9CQUEzQjtBQUNBLE1BQU1DLGlCQUFpQixHQUFHLG1CQUExQjtBQUNBLE1BQU1DLG1CQUFtQixHQUFHLHFCQUE1QjtBQUNBLE1BQU1DLHFCQUFxQixHQUFHLHVCQUE5QjtBQUVBLE1BQU1DLHNCQUFzQixHQUFHLHdCQUEvQjtBQUNBLE1BQU1DLHlCQUF5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QUZELENBRkY7O0FBTUEsU0FBS3BkLG1CQUFMLENBQXlCbUMsR0FBekIsQ0FBNkIrYSxnQkFBZ0IsQ0FBQ0ksUUFBRCxDQUE3QztBQUNEOztBQUVEL1osRUFBQUEsT0FBTyxHQUFTO0FBQ2QsU0FBS3pELFlBQUwsQ0FBa0J5RCxPQUFsQjs7QUFDQSxTQUFLdkQsbUJBQUwsQ0FBeUJ1RCxPQUF6Qjs7QUFDQSxTQUFLeEQsc0JBQUwsQ0FBNEJ3RCxPQUE1QjtBQUNEOztBQWpoRHdEOzs7O0FBb2hEM0QsTUFBTXFELHNCQUFOLFNBQXFDK1csZ0JBQXJDLENBQWdEO0FBRzlDOWdCLEVBQUFBLFdBQVcsQ0FBQytnQixRQUFELEVBQW1CeFksR0FBbkIsRUFBZ0M7QUFDekMsVUFBTXdZLFFBQU47QUFEeUMsU0FGM0NDLElBRTJDO0FBRXpDLFNBQUtBLElBQUwsR0FBWXpZLEdBQVo7QUFDRDs7QUFFRDBZLEVBQUFBLE1BQU0sR0FBRztBQUNQLFdBQU8sS0FBS0QsSUFBWjtBQUNEOztBQUVEOVMsRUFBQUEsT0FBTyxHQUFHO0FBQ1IsV0FBTyxLQUFLOFMsSUFBWjtBQUNEOztBQUVERSxFQUFBQSxVQUFVLEdBQUc7QUFDWCxXQUFPLEtBQVA7QUFDRDs7QUFsQjZDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG5UaGUgZm9sbG93aW5nIGRlYnVnIHNlcnZpY2UgaW1wbGVtZW50YXRpb24gd2FzIHBvcnRlZCBmcm9tIFZTQ29kZSdzIGRlYnVnZ2VyIGltcGxlbWVudGF0aW9uXG5pbiBodHRwczovL2dpdGh1Yi5jb20vTWljcm9zb2Z0L3ZzY29kZS90cmVlL21hc3Rlci9zcmMvdnMvd29ya2JlbmNoL3BhcnRzL2RlYnVnXG5cbk1JVCBMaWNlbnNlXG5cbkNvcHlyaWdodCAoYykgMjAxNSAtIHByZXNlbnQgTWljcm9zb2Z0IENvcnBvcmF0aW9uXG5cbkFsbCByaWdodHMgcmVzZXJ2ZWQuXG5cblBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbm9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbmluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbnRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbmNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcblxuVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW4gYWxsXG5jb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG5JTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbkZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbk9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFXG5TT0ZUV0FSRS5cbiovXG5cbmltcG9ydCB0eXBlIHsgQ29uc29sZU1lc3NhZ2UgfSBmcm9tIFwiYXRvbS1pZGUtdWlcIlxuaW1wb3J0IHR5cGUgeyBSZWNvcmRUb2tlbiwgTGV2ZWwgfSBmcm9tIFwiLi4vLi4vLi4vYXRvbS1pZGUtY29uc29sZS9saWIvdHlwZXNcIlxuaW1wb3J0IHR5cGUgeyBUZXJtaW5hbEluZm8sIFRlcm1pbmFsSW5zdGFuY2UgfSBmcm9tIFwiLi4vLi4vLi4vYXRvbS1pZGUtdGVybWluYWwvbGliL3R5cGVzXCJcbmltcG9ydCB0eXBlIHtcbiAgRGVidWdnZXJNb2RlVHlwZSxcbiAgSURlYnVnU2VydmljZSxcbiAgSU1vZGVsLFxuICBJVmlld01vZGVsLFxuICBJUHJvY2VzcyxcbiAgSVRocmVhZCxcbiAgSUVuYWJsZWFibGUsXG4gIElFdmFsdWF0YWJsZUV4cHJlc3Npb24sXG4gIElVSUJyZWFrcG9pbnQsXG4gIElTdGFja0ZyYW1lLFxuICBTZXJpYWxpemVkU3RhdGUsXG59IGZyb20gXCIuLi90eXBlc1wiXG5pbXBvcnQgdHlwZSB7XG4gIElQcm9jZXNzQ29uZmlnLFxuICBNZXNzYWdlUHJvY2Vzc29yLFxuICBWU0FkYXB0ZXJFeGVjdXRhYmxlSW5mbyxcbn0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1kZWJ1Z2dlci1jb21tb25cIlxuaW1wb3J0IHR5cGUgeyBUaW1pbmdUcmFja2VyIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL2FuYWx5dGljc1wiXG5pbXBvcnQgKiBhcyBEZWJ1Z1Byb3RvY29sIGZyb20gXCJ2c2NvZGUtZGVidWdwcm90b2NvbFwiXG5pbXBvcnQgKiBhcyBSZWFjdCBmcm9tIFwicmVhY3RcIlxuXG5pbXBvcnQgaW52YXJpYW50IGZyb20gXCJhc3NlcnRcIlxuaW1wb3J0IHsgSWNvbiB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9JY29uXCJcbmltcG9ydCBudWNsaWRlVXJpIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9udWNsaWRlVXJpXCJcbmltcG9ydCB7IG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24gfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvZXZlbnRcIlxuaW1wb3J0IHsgc2xlZXAsIHNlcmlhbGl6ZUFzeW5jQ2FsbCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9wcm9taXNlXCJcbmltcG9ydCB7XG4gIFZzRGVidWdTZXNzaW9uLFxuICBsb2NhbFRvUmVtb3RlUHJvY2Vzc29yLFxuICByZW1vdGVUb0xvY2FsUHJvY2Vzc29yLFxuICBnZXRWU0NvZGVEZWJ1Z2dlckFkYXB0ZXJTZXJ2aWNlQnlOdWNsaWRlVXJpLFxufSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWRlYnVnZ2VyLWNvbW1vblwiXG5pbXBvcnQgeyBPYnNlcnZhYmxlLCBTdWJqZWN0LCBUaW1lb3V0RXJyb3IgfSBmcm9tIFwicnhqcy1jb21wYXQvYnVuZGxlcy9yeGpzLWNvbXBhdC51bWQubWluLmpzXCJcbmltcG9ydCB7IFRleHRFZGl0b3JCYW5uZXIgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvVGV4dEVkaXRvckJhbm5lclwiXG5pbXBvcnQgUmVhZE9ubHlOb3RpY2UgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL1JlYWRPbmx5Tm90aWNlXCJcbmltcG9ydCB7IHRyYWNrLCBzdGFydFRyYWNraW5nIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL2FuYWx5dGljc1wiXG5pbXBvcnQgbnVsbHRocm93cyBmcm9tIFwibnVsbHRocm93c1wiXG5pbXBvcnQge1xuICBnZXRDb25zb2xlUmVnaXN0ZXJFeGVjdXRvcixcbiAgZ2V0Q29uc29sZVNlcnZpY2UsXG4gIGdldE5vdGlmaWNhdGlvblNlcnZpY2UsXG4gIGdldERhdGF0aXBTZXJ2aWNlLFxuICBnZXRUZXJtaW5hbFNlcnZpY2UsXG4gIHJlc29sdmVEZWJ1Z0NvbmZpZ3VyYXRpb24sXG59IGZyb20gXCIuLi9BdG9tU2VydmljZUNvbnRhaW5lclwiXG5pbXBvcnQgeyBldmFsdWF0ZUV4cHJlc3Npb25Bc1N0cmVhbSwgY2FwaXRhbGl6ZSB9IGZyb20gXCIuLi91dGlsc1wiXG5pbXBvcnQge1xuICBNb2RlbCxcbiAgRXhjZXB0aW9uQnJlYWtwb2ludCxcbiAgRnVuY3Rpb25CcmVha3BvaW50LFxuICBCcmVha3BvaW50LFxuICBFeHByZXNzaW9uLFxuICBQcm9jZXNzLFxuICBFeHByZXNzaW9uQ29udGFpbmVyLFxufSBmcm9tIFwiLi9EZWJ1Z2dlck1vZGVsXCJcbmltcG9ydCBVbml2ZXJzYWxEaXNwb3NhYmxlIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9Vbml2ZXJzYWxEaXNwb3NhYmxlXCJcbmltcG9ydCB7IEVtaXR0ZXIsIFRleHRCdWZmZXIgfSBmcm9tIFwiYXRvbVwiXG5pbXBvcnQgeyBkaXN0aW5jdCwgbWFwRnJvbU9iamVjdCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9jb2xsZWN0aW9uXCJcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSBcIi4uL3V0aWxzXCJcbmltcG9ydCB1dWlkIGZyb20gXCJ1dWlkXCJcbmltcG9ydCB7IEJyZWFrcG9pbnRFdmVudFJlYXNvbnMsIERlYnVnZ2VyTW9kZSwgQW5hbHl0aWNzRXZlbnRzLCBERUJVR19TT1VSQ0VTX1VSSSB9IGZyb20gXCIuLi9jb25zdGFudHNcIlxuaW1wb3J0IGxvZ2dlciBmcm9tIFwiLi4vbG9nZ2VyXCJcbmltcG9ydCBzdHJpcEFuc2kgZnJvbSBcInN0cmlwLWFuc2lcIlxuaW1wb3J0IHVybCBmcm9tIFwidXJsXCJcbmltcG9ydCBvcyBmcm9tIFwib3NcIlxuaW1wb3J0IGlkeCBmcm9tIFwiaWR4XCJcblxuY29uc3QgQ09OU09MRV9WSUVXX1VSSSA9IFwiYXRvbTovL251Y2xpZGUvY29uc29sZVwiXG5cbmNvbnN0IENVU1RPTV9ERUJVR19FVkVOVCA9IFwiQ1VTVE9NX0RFQlVHX0VWRU5UXCJcbmNvbnN0IENIQU5HRV9ERUJVR19NT0RFID0gXCJDSEFOR0VfREVCVUdfTU9ERVwiXG5jb25zdCBTVEFSVF9ERUJVR19TRVNTSU9OID0gXCJTVEFSVF9ERUJVR19TRVNTSU9OXCJcbmNvbnN0IEFDVElWRV9USFJFQURfQ0hBTkdFRCA9IFwiQUNUSVZFX1RIUkVBRF9DSEFOR0VEXCJcblxuY29uc3QgREVCVUdHRVJfRk9DVVNfQ0hBTkdFRCA9IFwiREVCVUdHRVJfRk9DVVNfQ0hBTkdFRFwiXG5jb25zdCBDSEFOR0VfRVhQUkVTU0lPTl9DT05URVhUID0gXCJDSEFOR0VfRVhQUkVTU0lPTl9DT05URVhUXCJcblxuLy8gQmVyYWtwb2ludCBldmVudHMgbWF5IGFycml2ZSBzb29uZXIgdGhhbiBicmVha3BvaW50IHJlc3BvbnNlcy5cbmNvbnN0IE1BWF9CUkVBS1BPSU5UX0VWRU5UX0RFTEFZX01TID0gNSAqIDEwMDBcblxuY2xhc3MgVmlld01vZGVsIGltcGxlbWVudHMgSVZpZXdNb2RlbCB7XG4gIF9mb2N1c2VkUHJvY2VzczogP0lQcm9jZXNzXG4gIF9mb2N1c2VkVGhyZWFkOiA/SVRocmVhZFxuICBfZm9jdXNlZFN0YWNrRnJhbWU6ID9JU3RhY2tGcmFtZVxuICBfZW1pdHRlcjogRW1pdHRlclxuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuX2ZvY3VzZWRQcm9jZXNzID0gbnVsbFxuICAgIHRoaXMuX2ZvY3VzZWRUaHJlYWQgPSBudWxsXG4gICAgdGhpcy5fZm9jdXNlZFN0YWNrRnJhbWUgPSBudWxsXG4gICAgdGhpcy5fZW1pdHRlciA9IG5ldyBFbWl0dGVyKClcbiAgfVxuXG4gIGdldCBmb2N1c2VkUHJvY2VzcygpOiA/SVByb2Nlc3Mge1xuICAgIHJldHVybiB0aGlzLl9mb2N1c2VkUHJvY2Vzc1xuICB9XG5cbiAgZ2V0IGZvY3VzZWRUaHJlYWQoKTogP0lUaHJlYWQge1xuICAgIHJldHVybiB0aGlzLl9mb2N1c2VkVGhyZWFkXG4gIH1cblxuICBnZXQgZm9jdXNlZFN0YWNrRnJhbWUoKTogP0lTdGFja0ZyYW1lIHtcbiAgICByZXR1cm4gdGhpcy5fZm9jdXNlZFN0YWNrRnJhbWVcbiAgfVxuXG4gIG9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cyhjYWxsYmFjazogKGRhdGE6IHsgZXhwbGljaXQ6IGJvb2xlYW4gfSkgPT4gbWl4ZWQpOiBJRGlzcG9zYWJsZSB7XG4gICAgcmV0dXJuIHRoaXMuX2VtaXR0ZXIub24oREVCVUdHRVJfRk9DVVNfQ0hBTkdFRCwgY2FsbGJhY2spXG4gIH1cblxuICBvbkRpZENoYW5nZUV4cHJlc3Npb25Db250ZXh0KGNhbGxiYWNrOiAoZGF0YTogeyBleHBsaWNpdDogYm9vbGVhbiB9KSA9PiBtaXhlZCk6IElEaXNwb3NhYmxlIHtcbiAgICByZXR1cm4gdGhpcy5fZW1pdHRlci5vbihDSEFOR0VfRVhQUkVTU0lPTl9DT05URVhULCBjYWxsYmFjaylcbiAgfVxuXG4gIF9jaG9vc2VGb2N1c1RocmVhZChwcm9jZXNzOiBJUHJvY2Vzcyk6ID9JVGhyZWFkIHtcbiAgICBjb25zdCB0aHJlYWRzID0gcHJvY2Vzcy5nZXRBbGxUaHJlYWRzKClcblxuICAgIC8vIElmIHRoZSBjdXJyZW50IGZvY3VzZWQgdGhyZWFkIGlzIGluIHRoZSBmb2N1c2VkIHByb2Nlc3MgYW5kIGlzIHN0b3BwZWQsXG4gICAgLy8gbGVhdmUgdGhhdCB0aHJlYWQgZm9jdXNlZC4gT3RoZXJ3aXNlLCBjaG9vc2UgdGhlIGZpcnN0XG4gICAgLy8gc3RvcHBlZCB0aHJlYWQgaW4gdGhlIGZvY3VzZWQgcHJvY2VzcyBpZiB0aGVyZSBpcyBvbmUsXG4gICAgLy8gYW5kIHRoZSBmaXJzdCBydW5uaW5nIHRocmVhZCBvdGhlcndpc2UuXG4gICAgaWYgKHRoaXMuX2ZvY3VzZWRUaHJlYWQgIT0gbnVsbCkge1xuICAgICAgY29uc3QgaWQgPSB0aGlzLl9mb2N1c2VkVGhyZWFkLmdldElkKClcbiAgICAgIGNvbnN0IGN1cnJlbnRGb2N1c2VkVGhyZWFkID0gdGhyZWFkcy5maWx0ZXIoKHQpID0+IHQuZ2V0SWQoKSA9PT0gaWQgJiYgdC5zdG9wcGVkKVxuICAgICAgaWYgKGN1cnJlbnRGb2N1c2VkVGhyZWFkLmxlbmd0aCA+IDApIHtcbiAgICAgICAgcmV0dXJuIGN1cnJlbnRGb2N1c2VkVGhyZWFkWzBdXG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3Qgc3RvcHBlZFRocmVhZHMgPSB0aHJlYWRzLmZpbHRlcigodCkgPT4gdC5zdG9wcGVkKVxuICAgIHJldHVybiBzdG9wcGVkVGhyZWFkc1swXSB8fCB0aHJlYWRzWzBdXG4gIH1cblxuICBfY2hvb3NlRm9jdXNTdGFja0ZyYW1lKHRocmVhZDogP0lUaHJlYWQpOiA/SVN0YWNrRnJhbWUge1xuICAgIGlmICh0aHJlYWQgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICAvLyBJZiB0aGUgY3VycmVudCBmb2N1c2VkIHN0YWNrIGZyYW1lIGlzIGluIHRoZSBjdXJyZW50IGZvY3VzZWQgdGhyZWFkJ3NcbiAgICAvLyBmcmFtZXMsIGxlYXZlIGl0IGFsb25lLiBPdGhlcndpc2UgcmV0dXJuIHRoZSB0b3Agc3RhY2sgZnJhbWUgaWYgdGhlXG4gICAgLy8gdGhyZWFkIGlzIHN0b3BwZWQsIGFuZCBudWxsIGlmIGl0IGlzIHJ1bm5pbmcuXG4gICAgY29uc3QgY3VycmVudEZvY3VzZWRGcmFtZSA9IHRocmVhZC5nZXRDYWNoZWRDYWxsU3RhY2soKS5maW5kKChmKSA9PiBmID09PSB0aGlzLl9mb2N1c2VkU3RhY2tGcmFtZSlcbiAgICByZXR1cm4gdGhyZWFkLnN0b3BwZWQgPyBjdXJyZW50Rm9jdXNlZEZyYW1lIHx8IHRocmVhZC5nZXRDYWxsU3RhY2tUb3BGcmFtZSgpIDogbnVsbFxuICB9XG5cbiAgX3NldEZvY3VzKHByb2Nlc3M6ID9JUHJvY2VzcywgdGhyZWFkOiA/SVRocmVhZCwgc3RhY2tGcmFtZTogP0lTdGFja0ZyYW1lLCBleHBsaWNpdDogYm9vbGVhbikge1xuICAgIGxldCBuZXdQcm9jZXNzID0gcHJvY2Vzc1xuXG4gICAgLy8gSWYgd2UgaGF2ZSBhIGZvY3VzZWQgZnJhbWUsIHdlIG11c3QgaGF2ZSBhIGZvY3VzZWQgdGhyZWFkLlxuICAgIGludmFyaWFudChzdGFja0ZyYW1lID09IG51bGwgfHwgdGhyZWFkID09PSBzdGFja0ZyYW1lLnRocmVhZClcblxuICAgIC8vIElmIHdlIGhhdmUgYSBmb2N1c2VkIHRocmVhZCwgd2UgbXVzdCBoYXZlIGEgZm9jdXNlZCBwcm9jZXNzLlxuICAgIGludmFyaWFudCh0aHJlYWQgPT0gbnVsbCB8fCBwcm9jZXNzID09PSB0aHJlYWQucHJvY2VzcylcblxuICAgIGlmIChuZXdQcm9jZXNzID09IG51bGwpIHtcbiAgICAgIGludmFyaWFudCh0aHJlYWQgPT0gbnVsbCAmJiBzdGFja0ZyYW1lID09IG51bGwpXG4gICAgICBuZXdQcm9jZXNzID0gdGhpcy5fZm9jdXNlZFByb2Nlc3NcbiAgICB9XG5cbiAgICBjb25zdCBmb2N1c0NoYW5nZWQgPVxuICAgICAgdGhpcy5fZm9jdXNlZFByb2Nlc3MgIT09IG5ld1Byb2Nlc3MgfHxcbiAgICAgIHRoaXMuX2ZvY3VzZWRUaHJlYWQgIT09IHRocmVhZCB8fFxuICAgICAgdGhpcy5fZm9jdXNlZFN0YWNrRnJhbWUgIT09IHN0YWNrRnJhbWUgfHxcbiAgICAgIGV4cGxpY2l0XG5cbiAgICB0aGlzLl9mb2N1c2VkUHJvY2VzcyA9IG5ld1Byb2Nlc3NcbiAgICB0aGlzLl9mb2N1c2VkVGhyZWFkID0gdGhyZWFkXG4gICAgdGhpcy5fZm9jdXNlZFN0YWNrRnJhbWUgPSBzdGFja0ZyYW1lXG5cbiAgICBpZiAoZm9jdXNDaGFuZ2VkKSB7XG4gICAgICB0aGlzLl9lbWl0dGVyLmVtaXQoREVCVUdHRVJfRk9DVVNfQ0hBTkdFRCwgeyBleHBsaWNpdCB9KVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBUaGUgZm9jdXNlZCBzdGFjayBmcmFtZSBkaWRuJ3QgY2hhbmdlLCBidXQgc29tZXRoaW5nIGFib3V0IHRoZVxuICAgICAgLy8gY29udGV4dCBkaWQsIHNvIGludGVyZXN0ZWQgbGlzdGVuZXJzIHNob3VsZCByZS1ldmFsdWF0ZSBleHByZXNzaW9ucy5cbiAgICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChDSEFOR0VfRVhQUkVTU0lPTl9DT05URVhULCB7IGV4cGxpY2l0IH0pXG4gICAgfVxuICB9XG5cbiAgZXZhbHVhdGVDb250ZXh0Q2hhbmdlZCgpOiB2b2lkIHtcbiAgICB0aGlzLl9lbWl0dGVyLmVtaXQoQ0hBTkdFX0VYUFJFU1NJT05fQ09OVEVYVCwgeyBleHBsaWNpdDogdHJ1ZSB9KVxuICB9XG5cbiAgc2V0Rm9jdXNlZFByb2Nlc3MocHJvY2VzczogP0lQcm9jZXNzLCBleHBsaWNpdDogYm9vbGVhbikge1xuICAgIGlmIChwcm9jZXNzID09IG51bGwpIHtcbiAgICAgIHRoaXMuX2ZvY3VzZWRQcm9jZXNzID0gbnVsbFxuICAgICAgdGhpcy5fc2V0Rm9jdXMobnVsbCwgbnVsbCwgbnVsbCwgZXhwbGljaXQpXG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IG5ld0ZvY3VzVGhyZWFkID0gdGhpcy5fY2hvb3NlRm9jdXNUaHJlYWQocHJvY2VzcylcbiAgICAgIGNvbnN0IG5ld0ZvY3VzRnJhbWUgPSB0aGlzLl9jaG9vc2VGb2N1c1N0YWNrRnJhbWUobmV3Rm9jdXNUaHJlYWQpXG4gICAgICB0aGlzLl9zZXRGb2N1cyhwcm9jZXNzLCBuZXdGb2N1c1RocmVhZCwgbmV3Rm9jdXNGcmFtZSwgZXhwbGljaXQpXG4gICAgfVxuICB9XG5cbiAgc2V0Rm9jdXNlZFRocmVhZCh0aHJlYWQ6ID9JVGhyZWFkLCBleHBsaWNpdDogYm9vbGVhbikge1xuICAgIGlmICh0aHJlYWQgPT0gbnVsbCkge1xuICAgICAgdGhpcy5fc2V0Rm9jdXMobnVsbCwgbnVsbCwgbnVsbCwgZXhwbGljaXQpXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3NldEZvY3VzKHRocmVhZC5wcm9jZXNzLCB0aHJlYWQsIHRoaXMuX2Nob29zZUZvY3VzU3RhY2tGcmFtZSh0aHJlYWQpLCBleHBsaWNpdClcbiAgICB9XG4gIH1cblxuICBzZXRGb2N1c2VkU3RhY2tGcmFtZShzdGFja0ZyYW1lOiA/SVN0YWNrRnJhbWUsIGV4cGxpY2l0OiBib29sZWFuKSB7XG4gICAgaWYgKHN0YWNrRnJhbWUgPT0gbnVsbCkge1xuICAgICAgdGhpcy5fc2V0Rm9jdXMobnVsbCwgbnVsbCwgbnVsbCwgZXhwbGljaXQpXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3NldEZvY3VzKHN0YWNrRnJhbWUudGhyZWFkLnByb2Nlc3MsIHN0YWNrRnJhbWUudGhyZWFkLCBzdGFja0ZyYW1lLCBleHBsaWNpdClcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0RGVidWdnZXJOYW1lKGFkYXB0ZXJUeXBlOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gYCR7Y2FwaXRhbGl6ZShhZGFwdGVyVHlwZSl9IERlYnVnZ2VyYFxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBEZWJ1Z1NlcnZpY2UgaW1wbGVtZW50cyBJRGVidWdTZXJ2aWNlIHtcbiAgX21vZGVsOiBNb2RlbFxuICBfZGlzcG9zYWJsZXM6IFVuaXZlcnNhbERpc3Bvc2FibGVcbiAgX3Nlc3Npb25FbmREaXNwb3NhYmxlczogVW5pdmVyc2FsRGlzcG9zYWJsZVxuICBfY29uc29sZURpc3Bvc2FibGVzOiBVbml2ZXJzYWxEaXNwb3NhYmxlXG4gIF9lbWl0dGVyOiBFbWl0dGVyXG4gIF92aWV3TW9kZWw6IFZpZXdNb2RlbFxuICBfdGltZXI6ID9UaW1pbmdUcmFja2VyXG4gIF9icmVha3BvaW50c1RvU2VuZE9uU2F2ZTogU2V0PHN0cmluZz5cbiAgX2NvbnNvbGVPdXRwdXQ6IFN1YmplY3Q8Q29uc29sZU1lc3NhZ2U+XG5cbiAgY29uc3RydWN0b3Ioc3RhdGU6ID9TZXJpYWxpemVkU3RhdGUpIHtcbiAgICB0aGlzLl9kaXNwb3NhYmxlcyA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKClcbiAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5fY29uc29sZURpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoKVxuICAgIHRoaXMuX2VtaXR0ZXIgPSBuZXcgRW1pdHRlcigpXG4gICAgdGhpcy5fdmlld01vZGVsID0gbmV3IFZpZXdNb2RlbCgpXG4gICAgdGhpcy5fYnJlYWtwb2ludHNUb1NlbmRPblNhdmUgPSBuZXcgU2V0KClcbiAgICB0aGlzLl9jb25zb2xlT3V0cHV0ID0gbmV3IFN1YmplY3QoKVxuXG4gICAgdGhpcy5fbW9kZWwgPSBuZXcgTW9kZWwoXG4gICAgICB0aGlzLl9sb2FkQnJlYWtwb2ludHMoc3RhdGUpLFxuICAgICAgdHJ1ZSxcbiAgICAgIHRoaXMuX2xvYWRGdW5jdGlvbkJyZWFrcG9pbnRzKHN0YXRlKSxcbiAgICAgIHRoaXMuX2xvYWRFeGNlcHRpb25CcmVha3BvaW50cyhzdGF0ZSksXG4gICAgICB0aGlzLl9sb2FkV2F0Y2hFeHByZXNzaW9ucyhzdGF0ZSksXG4gICAgICAoKSA9PiB0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3NcbiAgICApXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX21vZGVsLCB0aGlzLl9jb25zb2xlT3V0cHV0KVxuICAgIHRoaXMuX3JlZ2lzdGVyTGlzdGVuZXJzKClcbiAgfVxuXG4gIGdldCB2aWV3TW9kZWwoKTogSVZpZXdNb2RlbCB7XG4gICAgcmV0dXJuIHRoaXMuX3ZpZXdNb2RlbFxuICB9XG5cbiAgZ2V0RGVidWdnZXJNb2RlKHByb2Nlc3M6ID9JUHJvY2Vzcyk6IERlYnVnZ2VyTW9kZVR5cGUge1xuICAgIGlmIChwcm9jZXNzID09IG51bGwpIHtcbiAgICAgIHJldHVybiBEZWJ1Z2dlck1vZGUuU1RPUFBFRFxuICAgIH1cbiAgICByZXR1cm4gcHJvY2Vzcy5kZWJ1Z2dlck1vZGVcbiAgfVxuXG4gIF9yZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5hZGQoXG4gICAgICBhdG9tLndvcmtzcGFjZS5hZGRPcGVuZXIoKHVyaSkgPT4ge1xuICAgICAgICBpZiAodXJpLnN0YXJ0c1dpdGgoREVCVUdfU09VUkNFU19VUkkpKSB7XG4gICAgICAgICAgaWYgKHRoaXMuZ2V0RGVidWdnZXJNb2RlKHRoaXMuX3ZpZXdNb2RlbC5mb2N1c2VkUHJvY2VzcykgIT09IERlYnVnZ2VyTW9kZS5TVE9QUEVEKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fb3BlblNvdXJjZVZpZXcodXJpKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSlcbiAgICApXG4gIH1cblxuICBhc3luYyBfb3BlblNvdXJjZVZpZXcodXJpOiBzdHJpbmcpOiBQcm9taXNlPGF0b20kVGV4dEVkaXRvcj4ge1xuICAgIGNvbnN0IHF1ZXJ5ID0gKHVybC5wYXJzZSh1cmkpLnBhdGggfHwgXCJcIikuc3BsaXQoXCIvXCIpXG4gICAgY29uc3QgWywgc2Vzc2lvbklkLCBzb3VyY2VSZWZlcmVuY2VSYXddID0gcXVlcnlcbiAgICBjb25zdCBzb3VyY2VSZWZlcmVuY2UgPSBwYXJzZUludChzb3VyY2VSZWZlcmVuY2VSYXcsIDEwKVxuXG4gICAgY29uc3QgcHJvY2VzcyA9IHRoaXMuX21vZGVsLmdldFByb2Nlc3NlcygpLmZpbmQoKHApID0+IHAuZ2V0SWQoKSA9PT0gc2Vzc2lvbklkKSB8fCB0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3NcbiAgICBpZiAocHJvY2VzcyA9PSBudWxsKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYE5vIGRlYnVnIHNlc3Npb24gZm9yIHNvdXJjZTogJHtzb3VyY2VSZWZlcmVuY2V9YClcbiAgICB9XG5cbiAgICBjb25zdCBzb3VyY2UgPSBwcm9jZXNzLmdldFNvdXJjZSh7XG4gICAgICBwYXRoOiB1cmksXG4gICAgICBzb3VyY2VSZWZlcmVuY2UsXG4gICAgfSlcblxuICAgIGxldCBjb250ZW50ID0gXCJcIlxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHByb2Nlc3Muc2Vzc2lvbi5zb3VyY2Uoe1xuICAgICAgICBzb3VyY2VSZWZlcmVuY2UsXG4gICAgICAgIHNvdXJjZTogc291cmNlLnJhdyxcbiAgICAgIH0pXG4gICAgICBjb250ZW50ID0gcmVzcG9uc2UuYm9keS5jb250ZW50XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIHRoaXMuX3NvdXJjZUlzTm90QXZhaWxhYmxlKHVyaSlcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkRlYnVnIHNvdXJjZSBpcyBub3QgYXZhaWxhYmxlXCIpXG4gICAgfVxuXG4gICAgY29uc3QgZWRpdG9yID0gYXRvbS53b3Jrc3BhY2UuYnVpbGRUZXh0RWRpdG9yKHtcbiAgICAgIGJ1ZmZlcjogbmV3IERlYnVnU291cmNlVGV4dEJ1ZmZmZXIoY29udGVudCwgdXJpKSxcbiAgICAgIGF1dG9IZWlnaHQ6IGZhbHNlLFxuICAgICAgcmVhZE9ubHk6IHRydWUsXG4gICAgfSlcblxuICAgIC8vICRGbG93Rml4TWUgRGVidWdnZXIgc291cmNlIHZpZXdzIHNob3VsZG4ndCBwZXJzaXN0IGJldHdlZW4gcmVsb2FkLlxuICAgIGVkaXRvci5zZXJpYWxpemUgPSAoKSA9PiBudWxsXG4gICAgZWRpdG9yLnNldEdyYW1tYXIoYXRvbS5ncmFtbWFycy5zZWxlY3RHcmFtbWFyKHNvdXJjZS5uYW1lIHx8IFwiXCIsIGNvbnRlbnQpKVxuICAgIGNvbnN0IHRleHRFZGl0b3JCYW5uZXIgPSBuZXcgVGV4dEVkaXRvckJhbm5lcihlZGl0b3IpXG4gICAgdGV4dEVkaXRvckJhbm5lci5yZW5kZXIoXG4gICAgICA8UmVhZE9ubHlOb3RpY2VcbiAgICAgICAgZGV0YWlsZWRNZXNzYWdlPVwiVGhpcyBpcyBhIGRlYnVnIHNvdXJjZSB2aWV3IHRoYXQgbWF5IG5vdCBleGlzdCBvbiB0aGUgZmlsZXN5c3RlbS5cIlxuICAgICAgICBjYW5FZGl0QW55d2F5PXtmYWxzZX1cbiAgICAgICAgb25EaXNtaXNzPXt0ZXh0RWRpdG9yQmFubmVyLmRpc3Bvc2UuYmluZCh0ZXh0RWRpdG9yQmFubmVyKX1cbiAgICAgIC8+XG4gICAgKVxuXG4gICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmFkZFVudGlsRGVzdHJveWVkKGVkaXRvciwgZWRpdG9yLCB0ZXh0RWRpdG9yQmFubmVyKVxuXG4gICAgcmV0dXJuIGVkaXRvclxuICB9XG5cbiAgLyoqXG4gICAqIFN0b3BzIHRoZSBzcGVjaWZpZWQgcHJvY2Vzcy5cbiAgICovXG4gIGFzeW5jIHN0b3BQcm9jZXNzKHByb2Nlc3M6IElQcm9jZXNzKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHByb2Nlc3MuZGVidWdnZXJNb2RlID09PSBEZWJ1Z2dlck1vZGUuU1RPUFBJTkcgfHwgcHJvY2Vzcy5kZWJ1Z2dlck1vZGUgPT09IERlYnVnZ2VyTW9kZS5TVE9QUEVEKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgdGhpcy5fb25TZXNzaW9uRW5kKChwcm9jZXNzLnNlc3Npb246IGFueSkpXG4gIH1cblxuICBhc3luYyBfdHJ5VG9BdXRvRm9jdXNTdGFja0ZyYW1lKHRocmVhZDogSVRocmVhZCk6IFByb21pc2U8dm9pZD4ge1xuICAgIC8vIFRoZSBjYWxsIHN0YWNrIGhhcyBhbHJlYWR5IGJlZW4gcmVmcmVzaGVkIGJ5IHRoZSBsb2dpYyBoYW5kbGluZ1xuICAgIC8vIHRoZSB0aHJlYWQgc3RvcCBldmVudCBmb3IgdGhpcyB0aHJlYWQuXG4gICAgY29uc3QgY2FsbFN0YWNrID0gdGhyZWFkLmdldENhY2hlZENhbGxTdGFjaygpXG4gICAgaWYgKFxuICAgICAgY2FsbFN0YWNrLmxlbmd0aCA9PT0gMCB8fFxuICAgICAgKHRoaXMuX3ZpZXdNb2RlbC5mb2N1c2VkU3RhY2tGcmFtZSAmJlxuICAgICAgICB0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFN0YWNrRnJhbWUudGhyZWFkLmdldElkKCkgPT09IHRocmVhZC5nZXRJZCgpICYmXG4gICAgICAgIGNhbGxTdGFjay5pbmNsdWRlcyh0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFN0YWNrRnJhbWUpKVxuICAgICkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gRm9jdXMgZmlyc3Qgc3RhY2sgZnJhbWUgZnJvbSB0b3AgdGhhdCBoYXMgc291cmNlIGxvY2F0aW9uIGlmIG5vIG90aGVyIHN0YWNrIGZyYW1lIGlzIGZvY3VzZWRcbiAgICBjb25zdCBzdGFja0ZyYW1lVG9Gb2N1cyA9IGNhbGxTdGFjay5maW5kKChzZikgPT4gc2Yuc291cmNlICE9IG51bGwgJiYgc2Yuc291cmNlLmF2YWlsYWJsZSlcbiAgICBpZiAoc3RhY2tGcmFtZVRvRm9jdXMgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgdGhpcy5fdmlld01vZGVsLnNldEZvY3VzZWRTdGFja0ZyYW1lKHN0YWNrRnJhbWVUb0ZvY3VzLCBmYWxzZSlcbiAgfVxuXG4gIF9yZWdpc3Rlck1hcmtlcnMocHJvY2VzczogSVByb2Nlc3MpOiBJRGlzcG9zYWJsZSB7XG4gICAgbGV0IHNlbGVjdGVkRnJhbWVNYXJrZXI6ID9hdG9tJE1hcmtlciA9IG51bGxcbiAgICBsZXQgdGhyZWFkQ2hhbmdlRGF0YXRpcDogP0lEaXNwb3NhYmxlXG4gICAgbGV0IGxhc3RGb2N1c2VkVGhyZWFkSWQ6ID9udW1iZXJcbiAgICBsZXQgbGFzdEZvY3VzZWRQcm9jZXNzOiA/SVByb2Nlc3NcblxuICAgIGNvbnN0IGNsZWF1cE1hcmtlcnMgPSAoKSA9PiB7XG4gICAgICBpZiAoc2VsZWN0ZWRGcmFtZU1hcmtlciAhPSBudWxsKSB7XG4gICAgICAgIHNlbGVjdGVkRnJhbWVNYXJrZXIuZGVzdHJveSgpXG4gICAgICAgIHNlbGVjdGVkRnJhbWVNYXJrZXIgPSBudWxsXG4gICAgICB9XG5cbiAgICAgIGlmICh0aHJlYWRDaGFuZ2VEYXRhdGlwICE9IG51bGwpIHtcbiAgICAgICAgdGhyZWFkQ2hhbmdlRGF0YXRpcC5kaXNwb3NlKClcbiAgICAgICAgdGhyZWFkQ2hhbmdlRGF0YXRpcCA9IG51bGxcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoXG4gICAgICBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKHRoaXMuX3ZpZXdNb2RlbC5vbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMuYmluZCh0aGlzLl92aWV3TW9kZWwpKVxuICAgICAgICAuY29uY2F0TWFwKChldmVudCkgPT4ge1xuICAgICAgICAgIGNsZWF1cE1hcmtlcnMoKVxuXG4gICAgICAgICAgY29uc3QgeyBleHBsaWNpdCB9ID0gZXZlbnRcbiAgICAgICAgICBjb25zdCBzdGFja0ZyYW1lID0gdGhpcy5fdmlld01vZGVsLmZvY3VzZWRTdGFja0ZyYW1lXG5cbiAgICAgICAgICBpZiAoc3RhY2tGcmFtZSA9PSBudWxsIHx8ICFzdGFja0ZyYW1lLnNvdXJjZS5hdmFpbGFibGUpIHtcbiAgICAgICAgICAgIGlmIChleHBsaWNpdCAmJiB0aGlzLmdldERlYnVnZ2VyTW9kZSh0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3MpID09PSBEZWJ1Z2dlck1vZGUuUEFVU0VEKSB7XG4gICAgICAgICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRXYXJuaW5nKFwiTm8gc291cmNlIGF2YWlsYWJsZSBmb3IgdGhlIHNlbGVjdGVkIHN0YWNrIGZyYW1lXCIpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5lbXB0eSgpXG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLmZyb21Qcm9taXNlKHN0YWNrRnJhbWUub3BlbkluRWRpdG9yKCkpLnN3aXRjaE1hcCgoZWRpdG9yKSA9PiB7XG4gICAgICAgICAgICBpZiAoZWRpdG9yID09IG51bGwpIHtcbiAgICAgICAgICAgICAgY29uc3QgdXJpID0gc3RhY2tGcmFtZS5zb3VyY2UudXJpXG4gICAgICAgICAgICAgIGNvbnN0IGVycm9yTXNnID1cbiAgICAgICAgICAgICAgICB1cmkgPT0gbnVsbCB8fCB1cmkgPT09IFwiXCJcbiAgICAgICAgICAgICAgICAgID8gXCJUaGUgc2VsZWN0ZWQgc3RhY2sgZnJhbWUgaGFzIG5vIGtub3duIHNvdXJjZSBsb2NhdGlvblwiXG4gICAgICAgICAgICAgICAgICA6IGBOdWNsaWRlIGNvdWxkIG5vdCBvcGVuICR7dXJpfWBcbiAgICAgICAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKGVycm9yTXNnKVxuICAgICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5lbXB0eSgpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5vZih7IGVkaXRvciwgZXhwbGljaXQsIHN0YWNrRnJhbWUgfSlcbiAgICAgICAgICB9KVxuICAgICAgICB9KVxuICAgICAgICAuc3Vic2NyaWJlKCh7IGVkaXRvciwgZXhwbGljaXQsIHN0YWNrRnJhbWUgfSkgPT4ge1xuICAgICAgICAgIGNvbnN0IGxpbmUgPSBzdGFja0ZyYW1lLnJhbmdlLnN0YXJ0LnJvd1xuICAgICAgICAgIHNlbGVjdGVkRnJhbWVNYXJrZXIgPSBlZGl0b3IubWFya0J1ZmZlclJhbmdlKFxuICAgICAgICAgICAgW1xuICAgICAgICAgICAgICBbbGluZSwgMF0sXG4gICAgICAgICAgICAgIFtsaW5lLCBJbmZpbml0eV0sXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBpbnZhbGlkYXRlOiBcIm5ldmVyXCIsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgKVxuICAgICAgICAgIGVkaXRvci5kZWNvcmF0ZU1hcmtlcihzZWxlY3RlZEZyYW1lTWFya2VyLCB7XG4gICAgICAgICAgICB0eXBlOiBcImxpbmVcIixcbiAgICAgICAgICAgIGNsYXNzOiBcImRlYnVnZ2VyLWN1cnJlbnQtbGluZS1oaWdobGlnaHRcIixcbiAgICAgICAgICB9KVxuXG4gICAgICAgICAgY29uc3QgZGF0YXRpcFNlcnZpY2UgPSBnZXREYXRhdGlwU2VydmljZSgpXG4gICAgICAgICAgaWYgKGRhdGF0aXBTZXJ2aWNlID09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cblxuICAgICAgICAgIHRoaXMuX21vZGVsLnNldEV4Y2VwdGlvbkJyZWFrcG9pbnRzKFxuICAgICAgICAgICAgcHJvY2VzcyxcbiAgICAgICAgICAgIHN0YWNrRnJhbWUudGhyZWFkLnByb2Nlc3Muc2Vzc2lvbi5jYXBhYmlsaXRpZXMuZXhjZXB0aW9uQnJlYWtwb2ludEZpbHRlcnMgfHwgW11cbiAgICAgICAgICApXG5cbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBsYXN0Rm9jdXNlZFRocmVhZElkICE9IG51bGwgJiZcbiAgICAgICAgICAgICFleHBsaWNpdCAmJlxuICAgICAgICAgICAgc3RhY2tGcmFtZS50aHJlYWQudGhyZWFkSWQgIT09IGxhc3RGb2N1c2VkVGhyZWFkSWQgJiZcbiAgICAgICAgICAgIHByb2Nlc3MgPT09IGxhc3RGb2N1c2VkUHJvY2Vzc1xuICAgICAgICAgICkge1xuICAgICAgICAgICAgbGV0IG1lc3NhZ2UgPSBgQWN0aXZlIHRocmVhZCBjaGFuZ2VkIGZyb20gJHtsYXN0Rm9jdXNlZFRocmVhZElkfSB0byAke3N0YWNrRnJhbWUudGhyZWFkLnRocmVhZElkfWBcbiAgICAgICAgICAgIGNvbnN0IG5ld0ZvY3VzZWRQcm9jZXNzID0gc3RhY2tGcmFtZS50aHJlYWQucHJvY2Vzc1xuICAgICAgICAgICAgaWYgKGxhc3RGb2N1c2VkUHJvY2VzcyAhPSBudWxsICYmICFleHBsaWNpdCAmJiBuZXdGb2N1c2VkUHJvY2VzcyAhPT0gbGFzdEZvY3VzZWRQcm9jZXNzKSB7XG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBsYXN0Rm9jdXNlZFByb2Nlc3MuY29uZmlndXJhdGlvbi5wcm9jZXNzTmFtZSAhPSBudWxsICYmXG4gICAgICAgICAgICAgICAgbmV3Rm9jdXNlZFByb2Nlc3MuY29uZmlndXJhdGlvbi5wcm9jZXNzTmFtZSAhPSBudWxsXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPVxuICAgICAgICAgICAgICAgICAgXCJBY3RpdmUgcHJvY2VzcyBjaGFuZ2VkIGZyb20gXCIgK1xuICAgICAgICAgICAgICAgICAgbGFzdEZvY3VzZWRQcm9jZXNzLmNvbmZpZ3VyYXRpb24ucHJvY2Vzc05hbWUgK1xuICAgICAgICAgICAgICAgICAgXCIgdG8gXCIgK1xuICAgICAgICAgICAgICAgICAgbmV3Rm9jdXNlZFByb2Nlc3MuY29uZmlndXJhdGlvbi5wcm9jZXNzTmFtZSArXG4gICAgICAgICAgICAgICAgICBcIiBBTkQgXCIgK1xuICAgICAgICAgICAgICAgICAgbWVzc2FnZVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBcIkFjdGl2ZSBwcm9jZXNzIGNoYW5nZWQgQU5EIFwiICsgbWVzc2FnZVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJlYWRDaGFuZ2VEYXRhdGlwID0gZGF0YXRpcFNlcnZpY2UuY3JlYXRlUGlubmVkRGF0YVRpcChcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGNvbXBvbmVudDogKCkgPT4gKFxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci10aHJlYWQtc3dpdGNoLWFsZXJ0XCI+XG4gICAgICAgICAgICAgICAgICAgIDxJY29uIGljb249XCJhbGVydFwiIC8+XG4gICAgICAgICAgICAgICAgICAgIHttZXNzYWdlfVxuICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICByYW5nZTogc3RhY2tGcmFtZS5yYW5nZSxcbiAgICAgICAgICAgICAgICBwaW5uYWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgZWRpdG9yXG4gICAgICAgICAgICApXG4gICAgICAgICAgICB0aGlzLl9lbWl0dGVyLmVtaXQoQUNUSVZFX1RIUkVBRF9DSEFOR0VEKVxuICAgICAgICAgIH1cbiAgICAgICAgICBsYXN0Rm9jdXNlZFRocmVhZElkID0gc3RhY2tGcmFtZS50aHJlYWQudGhyZWFkSWRcbiAgICAgICAgICBsYXN0Rm9jdXNlZFByb2Nlc3MgPSBzdGFja0ZyYW1lLnRocmVhZC5wcm9jZXNzXG4gICAgICAgIH0pLFxuXG4gICAgICBjbGVhdXBNYXJrZXJzXG4gICAgKVxuICB9XG5cbiAgX3JlZ2lzdGVyU2Vzc2lvbkxpc3RlbmVycyhwcm9jZXNzOiBQcm9jZXNzLCBzZXNzaW9uOiBWc0RlYnVnU2Vzc2lvbik6IHZvaWQge1xuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcyA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKHNlc3Npb24pXG4gICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmFkZCh0aGlzLl9yZWdpc3Rlck1hcmtlcnMocHJvY2VzcykpXG5cbiAgICBjb25zdCBzZXNzaW9uSWQgPSBzZXNzaW9uLmdldElkKClcblxuICAgIGNvbnN0IHRocmVhZEZldGNoZXIgPSBzZXJpYWxpemVBc3luY0NhbGwoYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzZXNzaW9uLnRocmVhZHMoKVxuICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLmJvZHkgJiYgcmVzcG9uc2UuYm9keS50aHJlYWRzKSB7XG4gICAgICAgIHJlc3BvbnNlLmJvZHkudGhyZWFkcy5mb3JFYWNoKCh0aHJlYWQpID0+IHtcbiAgICAgICAgICB0aGlzLl9tb2RlbC5yYXdVcGRhdGUoe1xuICAgICAgICAgICAgc2Vzc2lvbklkLFxuICAgICAgICAgICAgdGhyZWFkLFxuICAgICAgICAgIH0pXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSlcblxuICAgIGNvbnN0IG9wZW5GaWxlc1NhdmVkID0gb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbihcbiAgICAgIGF0b20ud29ya3NwYWNlLm9ic2VydmVUZXh0RWRpdG9ycy5iaW5kKGF0b20ud29ya3NwYWNlKVxuICAgICkuZmxhdE1hcCgoZWRpdG9yKSA9PiB7XG4gICAgICByZXR1cm4gb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbihlZGl0b3Iub25EaWRTYXZlLmJpbmQoZWRpdG9yKSlcbiAgICAgICAgLm1hcCgoKSA9PiBlZGl0b3IuZ2V0UGF0aCgpKVxuICAgICAgICAudGFrZVVudGlsKG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24oZWRpdG9yLm9uRGlkRGVzdHJveS5iaW5kKGVkaXRvcikpKVxuICAgIH0pXG5cbiAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuYWRkKFxuICAgICAgb3BlbkZpbGVzU2F2ZWQuc3Vic2NyaWJlKGFzeW5jIChmaWxlUGF0aCkgPT4ge1xuICAgICAgICBpZiAoZmlsZVBhdGggPT0gbnVsbCB8fCAhdGhpcy5fYnJlYWtwb2ludHNUb1NlbmRPblNhdmUuaGFzKGZpbGVQYXRoKSkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2JyZWFrcG9pbnRzVG9TZW5kT25TYXZlLmRlbGV0ZShmaWxlUGF0aClcbiAgICAgICAgYXdhaXQgdGhpcy5fc2VuZEJyZWFrcG9pbnRzKGZpbGVQYXRoLCB0cnVlKVxuICAgICAgfSlcbiAgICApXG5cbiAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuYWRkKFxuICAgICAgc2Vzc2lvbi5vYnNlcnZlSW5pdGlhbGl6ZUV2ZW50cygpLnN1YnNjcmliZShhc3luYyAoZXZlbnQpID0+IHtcbiAgICAgICAgY29uc3Qgc2VuZENvbmZpZ3VyYXRpb25Eb25lID0gYXN5bmMgKCkgPT4ge1xuICAgICAgICAgIGlmIChzZXNzaW9uICYmIHNlc3Npb24uZ2V0Q2FwYWJpbGl0aWVzKCkuc3VwcG9ydHNDb25maWd1cmF0aW9uRG9uZVJlcXVlc3QpIHtcbiAgICAgICAgICAgIHJldHVybiBzZXNzaW9uXG4gICAgICAgICAgICAgIC5jb25maWd1cmF0aW9uRG9uZSgpXG4gICAgICAgICAgICAgIC50aGVuKChfKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5fb25EZWJ1Z2dlck1vZGVDaGFuZ2VkKHByb2Nlc3MsIERlYnVnZ2VyTW9kZS5SVU5OSU5HKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAuY2F0Y2goKGUpID0+IHtcbiAgICAgICAgICAgICAgICAvLyBEaXNjb25uZWN0IHRoZSBkZWJ1ZyBzZXNzaW9uIG9uIGNvbmZpZ3VyYXRpb24gZG9uZSBlcnJvciAjMTA1OTZcbiAgICAgICAgICAgICAgICB0aGlzLl9vblNlc3Npb25FbmQoc2Vzc2lvbilcbiAgICAgICAgICAgICAgICBzZXNzaW9uLmRpc2Nvbm5lY3QoKS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcilcbiAgICAgICAgICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoXG4gICAgICAgICAgICAgICAgICBcIkZhaWxlZCB0byBjb25maWd1cmUgZGVidWdnZXIuIFRoaXMgaXMgb2Z0ZW4gYmVjYXVzZSBlaXRoZXIgXCIgK1xuICAgICAgICAgICAgICAgICAgICBcInRoZSBwcm9jZXNzIHlvdSB0cmllZCB0byBhdHRhY2ggdG8gaGFzIGFscmVhZHkgdGVybWluYXRlZCwgb3IgXCIgK1xuICAgICAgICAgICAgICAgICAgICBcInlvdSBkbyBub3QgaGF2ZSBwZXJtaXNzaW9ucyAodGhlIHByb2Nlc3MgaXMgcnVubmluZyBhcyByb290IG9yIFwiICtcbiAgICAgICAgICAgICAgICAgICAgXCJhbm90aGVyIHVzZXIuKVwiLFxuICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBkZXRhaWw6IGUubWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBhd2FpdCB0aGlzLl9zZW5kQWxsQnJlYWtwb2ludHMoKS50aGVuKHNlbmRDb25maWd1cmF0aW9uRG9uZSwgc2VuZENvbmZpZ3VyYXRpb25Eb25lKVxuICAgICAgICAgIGF3YWl0IHRocmVhZEZldGNoZXIoKVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgIG9uVW5leHBlY3RlZEVycm9yKGVycm9yKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIClcblxuICAgIGNvbnN0IHRvRm9jdXNUaHJlYWRzID0gbmV3IFN1YmplY3QoKVxuXG4gICAgY29uc3Qgb2JzZXJ2ZUNvbnRpbnVlZFRvID0gKHRocmVhZElkOiA/bnVtYmVyKSA9PiB7XG4gICAgICByZXR1cm4gc2Vzc2lvblxuICAgICAgICAub2JzZXJ2ZUNvbnRpbnVlZEV2ZW50cygpXG4gICAgICAgIC5maWx0ZXIoXG4gICAgICAgICAgKGNvbnRpbnVlZCkgPT5cbiAgICAgICAgICAgIGNvbnRpbnVlZC5ib2R5LmFsbFRocmVhZHNDb250aW51ZWQgfHwgKHRocmVhZElkICE9IG51bGwgJiYgdGhyZWFkSWQgPT09IGNvbnRpbnVlZC5ib2R5LnRocmVhZElkKVxuICAgICAgICApXG4gICAgICAgIC50YWtlKDEpXG4gICAgfVxuXG4gICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmFkZChcbiAgICAgIHNlc3Npb24ub2JzZXJ2ZVN0b3BFdmVudHMoKS5zdWJzY3JpYmUoKCkgPT4ge1xuICAgICAgICB0aGlzLl9vbkRlYnVnZ2VyTW9kZUNoYW5nZWQocHJvY2VzcywgRGVidWdnZXJNb2RlLlBBVVNFRClcbiAgICAgIH0pLFxuICAgICAgc2Vzc2lvbi5vYnNlcnZlRXZhbHVhdGlvbnMoKS5zdWJzY3JpYmUoKCkgPT4ge1xuICAgICAgICB0aGlzLl92aWV3TW9kZWwuZXZhbHVhdGVDb250ZXh0Q2hhbmdlZCgpXG4gICAgICB9KSxcbiAgICAgIHNlc3Npb25cbiAgICAgICAgLm9ic2VydmVTdG9wRXZlbnRzKClcbiAgICAgICAgLmZsYXRNYXAoKGV2ZW50KSA9PlxuICAgICAgICAgIE9ic2VydmFibGUuZnJvbVByb21pc2UodGhyZWFkRmV0Y2hlcigpKVxuICAgICAgICAgICAgLmlnbm9yZUVsZW1lbnRzKClcbiAgICAgICAgICAgIC5jb25jYXQoT2JzZXJ2YWJsZS5vZihldmVudCkpXG4gICAgICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgICAgICAgIG9uVW5leHBlY3RlZEVycm9yKGVycm9yKVxuICAgICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5lbXB0eSgpXG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLy8gUHJvY2VlZWQgcHJvY2Vzc2luZyB0aGUgc3RvcHBlZCBldmVudCBvbmx5IGlmIHRoZXJlIHdhc24ndFxuICAgICAgICAgICAgLy8gYSBjb250aW51ZWQgZXZlbnQgd2hpbGUgd2UncmUgZmV0Y2hpbmcgdGhlIHRocmVhZHNcbiAgICAgICAgICAgIC50YWtlVW50aWwob2JzZXJ2ZUNvbnRpbnVlZFRvKGV2ZW50LmJvZHkudGhyZWFkSWQpKVxuICAgICAgICApXG4gICAgICAgIC5zdWJzY3JpYmUoKGV2ZW50OiBEZWJ1Z1Byb3RvY29sLlN0b3BwZWRFdmVudCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHsgdGhyZWFkSWQgfSA9IGV2ZW50LmJvZHlcbiAgICAgICAgICAvLyBVcGRhdGluZyBzdG9wcGVkIHN0YXRlIG5lZWRzIHRvIGhhcHBlbiBhZnRlciBmZXRjaGluZyB0aGUgdGhyZWFkc1xuICAgICAgICAgIHRoaXMuX21vZGVsLnJhd1VwZGF0ZSh7XG4gICAgICAgICAgICBzZXNzaW9uSWQsXG4gICAgICAgICAgICBzdG9wcGVkRGV0YWlsczogKGV2ZW50LmJvZHk6IGFueSksXG4gICAgICAgICAgICB0aHJlYWRJZCxcbiAgICAgICAgICB9KVxuXG4gICAgICAgICAgaWYgKHRocmVhZElkID09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCB0aHJlYWQgPSBwcm9jZXNzLmdldFRocmVhZCh0aHJlYWRJZClcbiAgICAgICAgICBpZiAodGhyZWFkICE9IG51bGwpIHtcbiAgICAgICAgICAgIHRvRm9jdXNUaHJlYWRzLm5leHQodGhyZWFkKVxuICAgICAgICAgIH1cbiAgICAgICAgfSksXG5cbiAgICAgIHRvRm9jdXNUaHJlYWRzXG4gICAgICAgIC5jb25jYXRNYXAoKHRocmVhZCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHsgZm9jdXNlZFRocmVhZCB9ID0gdGhpcy5fdmlld01vZGVsXG4gICAgICAgICAgY29uc3QgcHJlc2VydmVGb2N1c0hpbnQgPSBpZHgodGhyZWFkLCAoXykgPT4gXy5zdG9wcGVkRGV0YWlscy5wcmVzZXJ2ZUZvY3VzSGludCkgfHwgZmFsc2VcblxuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGZvY3VzZWRUaHJlYWQgIT0gbnVsbCAmJlxuICAgICAgICAgICAgZm9jdXNlZFRocmVhZC5zdG9wcGVkICYmXG4gICAgICAgICAgICBmb2N1c2VkVGhyZWFkLmdldElkKCkgIT09IHRocmVhZC5nZXRJZCgpICYmXG4gICAgICAgICAgICBwcmVzZXJ2ZUZvY3VzSGludFxuICAgICAgICAgICkge1xuICAgICAgICAgICAgLy8gVGhlIGRlYnVnZ2VyIGlzIGFscmVhZHkgc3RvcHBlZCBlbHNld2hlcmUuXG4gICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5lbXB0eSgpXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgdGhpc1RocmVhZElzRm9jdXNlZCA9XG4gICAgICAgICAgICB0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFN0YWNrRnJhbWUgIT0gbnVsbCAmJlxuICAgICAgICAgICAgdGhpcy5fdmlld01vZGVsLmZvY3VzZWRTdGFja0ZyYW1lLnRocmVhZC5nZXRJZCgpID09PSB0aHJlYWQuZ2V0SWQoKVxuXG4gICAgICAgICAgLy8gRmV0Y2hlcyB0aGUgZmlyc3QgY2FsbCBmcmFtZSBpbiB0aGlzIHN0YWNrIHRvIGFsbG93IHRoZSBVSSB0b1xuICAgICAgICAgIC8vIHVwZGF0ZSB0aGUgdGhyZWFkIGxpc3QuIEFkZGl0aW9uYWwgZnJhbWVzIHdpbGwgYmUgZmV0Y2hlZCBieSB0aGUgVUlcbiAgICAgICAgICAvLyBvbiBkZW1hbmQsIG9ubHkgaWYgdGhleSBhcmUgbmVlZGVkLlxuICAgICAgICAgIC8vIElmIHRoaXMgdGhyZWFkIGlzIHRoZSBjdXJyZW50bHkgZm9jdXNlZCB0aHJlYWQsIGZldGNoIHRoZSBlbnRpcmVcbiAgICAgICAgICAvLyBzdGFjayBiZWNhdXNlIHRoZSBVSSB3aWxsIGNlcnRhaW5seSBuZWVkIGl0LCBhbmQgd2UgbmVlZCBpdCBoZXJlIHRvXG4gICAgICAgICAgLy8gdHJ5IGFuZCBhdXRvLWZvY3VzIGEgZnJhbWUuXG4gICAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICAgIE9ic2VydmFibGUuZnJvbVByb21pc2UodGhpcy5fbW9kZWwucmVmcmVzaENhbGxTdGFjayh0aHJlYWQsIHRoaXNUaHJlYWRJc0ZvY3VzZWQpKVxuICAgICAgICAgICAgICAuaWdub3JlRWxlbWVudHMoKVxuICAgICAgICAgICAgICAuY29uY2F0KE9ic2VydmFibGUub2YodGhyZWFkKSlcbiAgICAgICAgICAgICAgLy8gQXZvaWQgZm9jdXNpbmcgYSBjb250aW51ZWQgdGhyZWFkLlxuICAgICAgICAgICAgICAudGFrZVVudGlsKG9ic2VydmVDb250aW51ZWRUbyh0aHJlYWQudGhyZWFkSWQpKVxuICAgICAgICAgICAgICAvLyBWZXJpZnkgdGhlIHRocmVhZCBpcyBzdGlsbCBzdG9wcGVkLlxuICAgICAgICAgICAgICAuZmlsdGVyKCgpID0+IHRocmVhZC5zdG9wcGVkKVxuICAgICAgICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgICAgICAgICAgb25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpXG4gICAgICAgICAgICAgICAgcmV0dXJuIE9ic2VydmFibGUuZW1wdHkoKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgIClcbiAgICAgICAgfSlcbiAgICAgICAgLnN1YnNjcmliZSgodGhyZWFkKSA9PiB7XG4gICAgICAgICAgdGhpcy5fdHJ5VG9BdXRvRm9jdXNTdGFja0ZyYW1lKHRocmVhZClcbiAgICAgICAgICB0aGlzLl9zY2hlZHVsZU5hdGl2ZU5vdGlmaWNhdGlvbigpXG4gICAgICAgIH0pXG4gICAgKVxuXG4gICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmFkZChcbiAgICAgIHNlc3Npb24ub2JzZXJ2ZVRocmVhZEV2ZW50cygpLnN1YnNjcmliZShhc3luYyAoZXZlbnQpID0+IHtcbiAgICAgICAgaWYgKGV2ZW50LmJvZHkucmVhc29uID09PSBcInN0YXJ0ZWRcIikge1xuICAgICAgICAgIGF3YWl0IHRocmVhZEZldGNoZXIoKVxuICAgICAgICB9IGVsc2UgaWYgKGV2ZW50LmJvZHkucmVhc29uID09PSBcImV4aXRlZFwiKSB7XG4gICAgICAgICAgdGhpcy5fbW9kZWwuY2xlYXJUaHJlYWRzKHNlc3Npb24uZ2V0SWQoKSwgdHJ1ZSwgZXZlbnQuYm9keS50aHJlYWRJZClcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICApXG5cbiAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuYWRkKFxuICAgICAgc2Vzc2lvbi5vYnNlcnZlVGVybWluYXRlRGVidWdlZUV2ZW50cygpLnN1YnNjcmliZSgoZXZlbnQpID0+IHtcbiAgICAgICAgaWYgKGV2ZW50LmJvZHkgJiYgZXZlbnQuYm9keS5yZXN0YXJ0KSB7XG4gICAgICAgICAgdGhpcy5yZXN0YXJ0UHJvY2Vzcyhwcm9jZXNzKS5jYXRjaCgoZXJyKSA9PiB7XG4gICAgICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoXCJGYWlsZWQgdG8gcmVzdGFydCBkZWJ1Z2dlclwiLCB7XG4gICAgICAgICAgICAgIGRldGFpbDogZXJyLnN0YWNrIHx8IFN0cmluZyhlcnIpLFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuX29uU2Vzc2lvbkVuZChzZXNzaW9uKVxuICAgICAgICAgIHNlc3Npb24uZGlzY29ubmVjdCgpLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIClcblxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoXG4gICAgICBzZXNzaW9uLm9ic2VydmVDb250aW51ZWRFdmVudHMoKS5zdWJzY3JpYmUoKGV2ZW50KSA9PiB7XG4gICAgICAgIGNvbnN0IHRocmVhZElkID0gZXZlbnQuYm9keS5hbGxUaHJlYWRzQ29udGludWVkICE9PSBmYWxzZSA/IHVuZGVmaW5lZCA6IGV2ZW50LmJvZHkudGhyZWFkSWRcbiAgICAgICAgdGhpcy5fbW9kZWwuY2xlYXJUaHJlYWRzKHNlc3Npb24uZ2V0SWQoKSwgZmFsc2UsIHRocmVhZElkKVxuICAgICAgICB0aGlzLl92aWV3TW9kZWwuc2V0Rm9jdXNlZFRocmVhZCh0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFRocmVhZCwgZmFsc2UpXG4gICAgICAgIHRoaXMuX29uRGVidWdnZXJNb2RlQ2hhbmdlZChwcm9jZXNzLCBEZWJ1Z2dlck1vZGUuUlVOTklORylcbiAgICAgIH0pXG4gICAgKVxuXG4gICAgY29uc3Qgb3V0cHV0RXZlbnRzID0gc2Vzc2lvblxuICAgICAgLm9ic2VydmVPdXRwdXRFdmVudHMoKVxuICAgICAgLmZpbHRlcigoZXZlbnQpID0+IGV2ZW50LmJvZHkgIT0gbnVsbCAmJiB0eXBlb2YgZXZlbnQuYm9keS5vdXRwdXQgPT09IFwic3RyaW5nXCIpXG4gICAgICAuc2hhcmUoKVxuXG4gICAgY29uc3Qgbm90aWZpY2F0aW9uU3RyZWFtID0gb3V0cHV0RXZlbnRzXG4gICAgICAuZmlsdGVyKChlKSA9PiBlLmJvZHkuY2F0ZWdvcnkgPT09IFwibnVjbGlkZV9ub3RpZmljYXRpb25cIilcbiAgICAgIC5tYXAoKGUpID0+ICh7XG4gICAgICAgIHR5cGU6IG51bGx0aHJvd3MoZS5ib2R5LmRhdGEpLnR5cGUsXG4gICAgICAgIG1lc3NhZ2U6IGUuYm9keS5vdXRwdXQsXG4gICAgICB9KSlcbiAgICBjb25zdCBudWNsaWRlVHJhY2tTdHJlYW0gPSBvdXRwdXRFdmVudHMuZmlsdGVyKChlKSA9PiBlLmJvZHkuY2F0ZWdvcnkgPT09IFwibnVjbGlkZV90cmFja1wiKVxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoXG4gICAgICBub3RpZmljYXRpb25TdHJlYW0uc3Vic2NyaWJlKCh7IHR5cGUsIG1lc3NhZ2UgfSkgPT4ge1xuICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkKHR5cGUsIG1lc3NhZ2UpXG4gICAgICB9KSxcbiAgICAgIG51Y2xpZGVUcmFja1N0cmVhbS5zdWJzY3JpYmUoKGUpID0+IHtcbiAgICAgICAgdHJhY2soZS5ib2R5Lm91dHB1dCwgZS5ib2R5LmRhdGEgfHwge30pXG4gICAgICB9KVxuICAgIClcblxuICAgIGNvbnN0IGNyZWF0ZUNvbnNvbGUgPSBnZXRDb25zb2xlU2VydmljZSgpXG4gICAgaWYgKGNyZWF0ZUNvbnNvbGUgIT0gbnVsbCkge1xuICAgICAgY29uc3QgbmFtZSA9IGdldERlYnVnZ2VyTmFtZShwcm9jZXNzLmNvbmZpZ3VyYXRpb24uYWRhcHRlclR5cGUpXG4gICAgICBjb25zdCBjb25zb2xlQXBpID0gY3JlYXRlQ29uc29sZSh7XG4gICAgICAgIGlkOiBuYW1lLFxuICAgICAgICBuYW1lLFxuICAgICAgfSlcbiAgICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoY29uc29sZUFwaSlcbiAgICAgIGNvbnN0IENBVEVHT1JJRVNfTUFQID0gbmV3IE1hcChbXG4gICAgICAgIFtcInN0ZGVyclwiLCBcImVycm9yXCJdLFxuICAgICAgICBbXCJjb25zb2xlXCIsIFwid2FybmluZ1wiXSxcbiAgICAgICAgW1wic3VjY2Vzc1wiLCBcInN1Y2Nlc3NcIl0sXG4gICAgICBdKVxuICAgICAgY29uc3QgSUdOT1JFRF9DQVRFR09SSUVTID0gbmV3IFNldChbXCJ0ZWxlbWV0cnlcIiwgXCJudWNsaWRlX25vdGlmaWNhdGlvblwiLCBcIm51Y2xpZGVfdHJhY2tcIl0pXG4gICAgICBjb25zdCBsb2dTdHJlYW0gPSBvdXRwdXRFdmVudHNcbiAgICAgICAgLmZpbHRlcigoZSkgPT4gZS5ib2R5LnZhcmlhYmxlc1JlZmVyZW5jZSA9PSBudWxsKVxuICAgICAgICAuZmlsdGVyKChlKSA9PiAhSUdOT1JFRF9DQVRFR09SSUVTLmhhcyhlLmJvZHkuY2F0ZWdvcnkpKVxuICAgICAgICAubWFwKChlKSA9PiAoe1xuICAgICAgICAgIHRleHQ6IHN0cmlwQW5zaShlLmJvZHkub3V0cHV0KSxcbiAgICAgICAgICBsZXZlbDogQ0FURUdPUklFU19NQVAuZ2V0KGUuYm9keS5jYXRlZ29yeSkgfHwgXCJsb2dcIixcbiAgICAgICAgfSkpXG4gICAgICAgIC5maWx0ZXIoKGUpID0+IGUubGV2ZWwgIT0gbnVsbClcbiAgICAgIGNvbnN0IG9iamVjdFN0cmVhbSA9IG91dHB1dEV2ZW50c1xuICAgICAgICAuZmlsdGVyKChlKSA9PiBlLmJvZHkudmFyaWFibGVzUmVmZXJlbmNlICE9IG51bGwpXG4gICAgICAgIC5tYXAoKGUpID0+ICh7XG4gICAgICAgICAgY2F0ZWdvcnk6IGUuYm9keS5jYXRlZ29yeSxcbiAgICAgICAgICB2YXJpYWJsZXNSZWZlcmVuY2U6IG51bGx0aHJvd3MoZS5ib2R5LnZhcmlhYmxlc1JlZmVyZW5jZSksXG4gICAgICAgIH0pKVxuXG4gICAgICBsZXQgbGFzdEVudHJ5VG9rZW46ID9SZWNvcmRUb2tlbiA9IG51bGxcbiAgICAgIGNvbnN0IGhhbmRsZU1lc3NhZ2UgPSAobGluZSwgbGV2ZWwpID0+IHtcbiAgICAgICAgY29uc3QgY29tcGxldGUgPSBsaW5lLmVuZHNXaXRoKFwiXFxuXCIpXG4gICAgICAgIGNvbnN0IHNhbWVMZXZlbCA9IGxhc3RFbnRyeVRva2VuICE9IG51bGwgJiYgbGFzdEVudHJ5VG9rZW4uZ2V0Q3VycmVudExldmVsKCkgPT09IGxldmVsXG4gICAgICAgIGlmIChzYW1lTGV2ZWwpIHtcbiAgICAgICAgICBsYXN0RW50cnlUb2tlbiA9IG51bGx0aHJvd3MobGFzdEVudHJ5VG9rZW4pLmFwcGVuZFRleHQobGluZSlcbiAgICAgICAgICBpZiAoY29tcGxldGUpIHtcbiAgICAgICAgICAgIGxhc3RFbnRyeVRva2VuLnNldENvbXBsZXRlKClcbiAgICAgICAgICAgIGxhc3RFbnRyeVRva2VuID0gbnVsbFxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAobGFzdEVudHJ5VG9rZW4gIT0gbnVsbCkge1xuICAgICAgICAgICAgbGFzdEVudHJ5VG9rZW4uc2V0Q29tcGxldGUoKVxuICAgICAgICAgIH1cbiAgICAgICAgICBsYXN0RW50cnlUb2tlbiA9IGNvbnNvbGVBcGkuYXBwZW5kKHtcbiAgICAgICAgICAgIHRleHQ6IGxpbmUsXG4gICAgICAgICAgICBsZXZlbCxcbiAgICAgICAgICAgIGluY29tcGxldGU6ICFjb21wbGV0ZSxcbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuYWRkKFxuICAgICAgICBsb2dTdHJlYW0uc3Vic2NyaWJlKChlKSA9PiBoYW5kbGVNZXNzYWdlKGUudGV4dCwgZS5sZXZlbCkpLFxuICAgICAgICBub3RpZmljYXRpb25TdHJlYW0uc3Vic2NyaWJlKCh7IHR5cGUsIG1lc3NhZ2UgfSkgPT4ge1xuICAgICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGQodHlwZSwgbWVzc2FnZSlcbiAgICAgICAgfSksXG4gICAgICAgIG9iamVjdFN0cmVhbS5zdWJzY3JpYmUoKHsgY2F0ZWdvcnksIHZhcmlhYmxlc1JlZmVyZW5jZSB9KSA9PiB7XG4gICAgICAgICAgY29uc3QgbGV2ZWwgPSBDQVRFR09SSUVTX01BUC5nZXQoY2F0ZWdvcnkpIHx8IFwibG9nXCJcbiAgICAgICAgICBjb25zdCBjb250YWluZXIgPSBuZXcgRXhwcmVzc2lvbkNvbnRhaW5lcih0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3MsIHZhcmlhYmxlc1JlZmVyZW5jZSwgdXVpZC52NCgpKVxuICAgICAgICAgIGNvbnRhaW5lci5nZXRDaGlsZHJlbigpLnRoZW4oKGNoaWxkcmVuKSA9PiB7XG4gICAgICAgICAgICB0aGlzLl9jb25zb2xlT3V0cHV0Lm5leHQoe1xuICAgICAgICAgICAgICB0ZXh0OiBgb2JqZWN0WyR7Y2hpbGRyZW4ubGVuZ3RofV1gLFxuICAgICAgICAgICAgICBleHByZXNzaW9uczogY2hpbGRyZW4sXG4gICAgICAgICAgICAgIGxldmVsLFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9KVxuICAgICAgICB9KSxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgIGlmIChsYXN0RW50cnlUb2tlbiAhPSBudWxsKSB7XG4gICAgICAgICAgICBsYXN0RW50cnlUb2tlbi5zZXRDb21wbGV0ZSgpXG4gICAgICAgICAgfVxuICAgICAgICAgIGxhc3RFbnRyeVRva2VuID0gbnVsbFxuICAgICAgICB9XG4gICAgICAgIC8vIFRPRE8gaGFuZGxlIG5vbiBzdHJpbmcgb3V0cHV0IChlLmcuIGZpbGVzKVxuICAgICAgKVxuICAgIH1cblxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoXG4gICAgICBzZXNzaW9uXG4gICAgICAgIC5vYnNlcnZlQnJlYWtwb2ludEV2ZW50cygpXG4gICAgICAgIC5mbGF0TWFwKChldmVudCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHsgYnJlYWtwb2ludCwgcmVhc29uIH0gPSBldmVudC5ib2R5XG4gICAgICAgICAgaWYgKHJlYXNvbiAhPT0gQnJlYWtwb2ludEV2ZW50UmVhc29ucy5DSEFOR0VEICYmIHJlYXNvbiAhPT0gQnJlYWtwb2ludEV2ZW50UmVhc29ucy5SRU1PVkVEKSB7XG4gICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5vZih7XG4gICAgICAgICAgICAgIHJlYXNvbixcbiAgICAgICAgICAgICAgYnJlYWtwb2ludCxcbiAgICAgICAgICAgICAgc291cmNlQnJlYWtwb2ludDogbnVsbCxcbiAgICAgICAgICAgICAgZnVuY3Rpb25CcmVha3BvaW50OiBudWxsLFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBCcmVha3BvaW50IGV2ZW50cyBtYXkgYXJyaXZlIHNvb25lciB0aGFuIHRoZWlyIHJlc3BvbnNlcy5cbiAgICAgICAgICAvLyBIZW5jZSwgd2UnbGwga2VlcCB0aGVtIGNhY2hlZCBhbmQgdHJ5IHJlLXByb2Nlc3Npbmcgb24gZXZlcnkgY2hhbmdlIHRvIHRoZSBtb2RlbCdzIGJyZWFrcG9pbnRzXG4gICAgICAgICAgLy8gZm9yIGEgc2V0IG1heGltdW0gdGltZSwgdGhlbiBkaXNjYXJkLlxuICAgICAgICAgIHJldHVybiBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKHRoaXMuX21vZGVsLm9uRGlkQ2hhbmdlQnJlYWtwb2ludHMuYmluZCh0aGlzLl9tb2RlbCkpXG4gICAgICAgICAgICAuc3RhcnRXaXRoKG51bGwpXG4gICAgICAgICAgICAuc3dpdGNoTWFwKCgpID0+IHtcbiAgICAgICAgICAgICAgY29uc3Qgc291cmNlQnJlYWtwb2ludCA9IHRoaXMuX21vZGVsXG4gICAgICAgICAgICAgICAgLmdldEJyZWFrcG9pbnRzKClcbiAgICAgICAgICAgICAgICAuZmlsdGVyKChiKSA9PiBiLmlkRnJvbUFkYXB0ZXIgPT09IGJyZWFrcG9pbnQuaWQpXG4gICAgICAgICAgICAgICAgLnBvcCgpXG4gICAgICAgICAgICAgIGNvbnN0IGZ1bmN0aW9uQnJlYWtwb2ludCA9IHRoaXMuX21vZGVsXG4gICAgICAgICAgICAgICAgLmdldEZ1bmN0aW9uQnJlYWtwb2ludHMoKVxuICAgICAgICAgICAgICAgIC5maWx0ZXIoKGIpID0+IGIuaWRGcm9tQWRhcHRlciA9PT0gYnJlYWtwb2ludC5pZClcbiAgICAgICAgICAgICAgICAucG9wKClcbiAgICAgICAgICAgICAgaWYgKHNvdXJjZUJyZWFrcG9pbnQgPT0gbnVsbCAmJiBmdW5jdGlvbkJyZWFrcG9pbnQgPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLmVtcHR5KClcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5vZih7XG4gICAgICAgICAgICAgICAgICByZWFzb24sXG4gICAgICAgICAgICAgICAgICBicmVha3BvaW50LFxuICAgICAgICAgICAgICAgICAgc291cmNlQnJlYWtwb2ludCxcbiAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uQnJlYWtwb2ludCxcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRha2UoMSlcbiAgICAgICAgICAgIC50aW1lb3V0KE1BWF9CUkVBS1BPSU5UX0VWRU5UX0RFTEFZX01TKVxuICAgICAgICAgICAgLmNhdGNoKChlcnJvcikgPT4ge1xuICAgICAgICAgICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBUaW1lb3V0RXJyb3IpIHtcbiAgICAgICAgICAgICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICAgICAgICAgICBcIlRpbWVkIG91dCBicmVha3BvaW50IGV2ZW50IGhhbmRsZXJcIixcbiAgICAgICAgICAgICAgICAgIHByb2Nlc3MuY29uZmlndXJhdGlvbi5hZGFwdGVyVHlwZSxcbiAgICAgICAgICAgICAgICAgIHJlYXNvbixcbiAgICAgICAgICAgICAgICAgIGJyZWFrcG9pbnRcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIE9ic2VydmFibGUuZW1wdHkoKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfSlcbiAgICAgICAgLnN1YnNjcmliZSgoeyByZWFzb24sIGJyZWFrcG9pbnQsIHNvdXJjZUJyZWFrcG9pbnQsIGZ1bmN0aW9uQnJlYWtwb2ludCB9KSA9PiB7XG4gICAgICAgICAgaWYgKHJlYXNvbiA9PT0gQnJlYWtwb2ludEV2ZW50UmVhc29ucy5ORVcgJiYgYnJlYWtwb2ludC5zb3VyY2UpIHtcbiAgICAgICAgICAgIC8vIFRoZSBkZWJ1ZyBhZGFwdGVyIGlzIGFkZGluZyBhIG5ldyAodW5leHBlY3RlZCkgYnJlYWtwb2ludCB0byB0aGUgVUkuXG4gICAgICAgICAgICAvLyBUT0RPOiBDb25zaWRlciBhZGRpbmcgdGhpcyB0byB0aGUgY3VycmVudCBwcm9jZXNzIG9ubHkuXG4gICAgICAgICAgICBjb25zdCBzb3VyY2UgPSBwcm9jZXNzLmdldFNvdXJjZShicmVha3BvaW50LnNvdXJjZSlcbiAgICAgICAgICAgIHRoaXMuX21vZGVsLmFkZFVJQnJlYWtwb2ludHMoXG4gICAgICAgICAgICAgIFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICBjb2x1bW46IGJyZWFrcG9pbnQuY29sdW1uIHx8IDAsXG4gICAgICAgICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgbGluZTogYnJlYWtwb2ludC5saW5lID09IG51bGwgPyAtMSA6IGJyZWFrcG9pbnQubGluZSxcbiAgICAgICAgICAgICAgICAgIHVyaTogc291cmNlLnVyaSxcbiAgICAgICAgICAgICAgICAgIGlkOiB1dWlkLnY0KCksXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgZmFsc2VcbiAgICAgICAgICAgIClcbiAgICAgICAgICB9IGVsc2UgaWYgKHJlYXNvbiA9PT0gQnJlYWtwb2ludEV2ZW50UmVhc29ucy5SRU1PVkVEKSB7XG4gICAgICAgICAgICBpZiAoc291cmNlQnJlYWtwb2ludCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgIHRoaXMuX21vZGVsLnJlbW92ZUJyZWFrcG9pbnRzKFtzb3VyY2VCcmVha3BvaW50XSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChmdW5jdGlvbkJyZWFrcG9pbnQgIT0gbnVsbCkge1xuICAgICAgICAgICAgICB0aGlzLl9tb2RlbC5yZW1vdmVGdW5jdGlvbkJyZWFrcG9pbnRzKGZ1bmN0aW9uQnJlYWtwb2ludC5nZXRJZCgpKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAocmVhc29uID09PSBCcmVha3BvaW50RXZlbnRSZWFzb25zLkNIQU5HRUQpIHtcbiAgICAgICAgICAgIGlmIChzb3VyY2VCcmVha3BvaW50ICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgaWYgKCFzb3VyY2VCcmVha3BvaW50LmNvbHVtbikge1xuICAgICAgICAgICAgICAgIGJyZWFrcG9pbnQuY29sdW1uID0gdW5kZWZpbmVkXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdGhpcy5fbW9kZWwudXBkYXRlUHJvY2Vzc0JyZWFrcG9pbnRzKHByb2Nlc3MsIHtcbiAgICAgICAgICAgICAgICBbc291cmNlQnJlYWtwb2ludC5nZXRJZCgpXTogYnJlYWtwb2ludCxcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChmdW5jdGlvbkJyZWFrcG9pbnQgIT0gbnVsbCkge1xuICAgICAgICAgICAgICB0aGlzLl9tb2RlbC51cGRhdGVGdW5jdGlvbkJyZWFrcG9pbnRzKHtcbiAgICAgICAgICAgICAgICBbZnVuY3Rpb25CcmVha3BvaW50LmdldElkKCldOiBicmVha3BvaW50LFxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsb2dnZXIud2FybihcIlVua25vd24gYnJlYWtwb2ludCBldmVudFwiLCByZWFzb24sIGJyZWFrcG9pbnQpXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIClcblxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoXG4gICAgICBzZXNzaW9uLm9ic2VydmVBZGFwdGVyRXhpdGVkRXZlbnRzKCkuc3Vic2NyaWJlKChldmVudCkgPT4ge1xuICAgICAgICAvLyAnUnVuIHdpdGhvdXQgZGVidWdnaW5nJyBtb2RlIFZTQ29kZSBtdXN0IHRlcm1pbmF0ZSB0aGUgZXh0ZW5zaW9uIGhvc3QuIE1vcmUgZGV0YWlsczogIzM5MDVcbiAgICAgICAgdGhpcy5fb25TZXNzaW9uRW5kKHNlc3Npb24pXG4gICAgICB9KVxuICAgIClcblxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoXG4gICAgICBzZXNzaW9uLm9ic2VydmVDdXN0b21FdmVudHMoKS5zdWJzY3JpYmUoKGV2ZW50KSA9PiB7XG4gICAgICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChDVVNUT01fREVCVUdfRVZFTlQsIGV2ZW50KVxuICAgICAgfSlcbiAgICApXG5cbiAgICAvLyBDbGVhciBpbiBtZW1vcnkgYnJlYWtwb2ludHMuXG4gICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmFkZCgoKSA9PiB7XG4gICAgICBjb25zdCBzb3VyY2VSZWZCcmVha3BvaW50cyA9IHRoaXMuX21vZGVsLmdldEJyZWFrcG9pbnRzKCkuZmlsdGVyKChicCkgPT4gYnAudXJpLnN0YXJ0c1dpdGgoREVCVUdfU09VUkNFU19VUkkpKVxuICAgICAgaWYgKHNvdXJjZVJlZkJyZWFrcG9pbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhpcy5fbW9kZWwucmVtb3ZlQnJlYWtwb2ludHMoc291cmNlUmVmQnJlYWtwb2ludHMpXG4gICAgICB9XG4gICAgfSlcbiAgfVxuXG4gIF9zY2hlZHVsZU5hdGl2ZU5vdGlmaWNhdGlvbigpOiB2b2lkIHtcbiAgICBjb25zdCByYWlzZU5hdGl2ZU5vdGlmaWNhdGlvbiA9IGdldE5vdGlmaWNhdGlvblNlcnZpY2UoKVxuICAgIGlmIChyYWlzZU5hdGl2ZU5vdGlmaWNhdGlvbiAhPSBudWxsKSB7XG4gICAgICBjb25zdCBwZW5kaW5nTm90aWZpY2F0aW9uID0gcmFpc2VOYXRpdmVOb3RpZmljYXRpb24oXCJEZWJ1Z2dlclwiLCBcIlBhdXNlZCBhdCBhIGJyZWFrcG9pbnRcIiwgMzAwMCwgZmFsc2UpXG4gICAgICBpZiAocGVuZGluZ05vdGlmaWNhdGlvbiAhPSBudWxsKSB7XG4gICAgICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQocGVuZGluZ05vdGlmaWNhdGlvbilcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBvbkRpZENoYW5nZUFjdGl2ZVRocmVhZChjYWxsYmFjazogKCkgPT4gbWl4ZWQpOiBJRGlzcG9zYWJsZSB7XG4gICAgcmV0dXJuIHRoaXMuX2VtaXR0ZXIub24oQUNUSVZFX1RIUkVBRF9DSEFOR0VELCBjYWxsYmFjaylcbiAgfVxuXG4gIG9uRGlkU3RhcnREZWJ1Z1Nlc3Npb24oY2FsbGJhY2s6IChjb25maWc6IElQcm9jZXNzQ29uZmlnKSA9PiBtaXhlZCk6IElEaXNwb3NhYmxlIHtcbiAgICByZXR1cm4gdGhpcy5fZW1pdHRlci5vbihTVEFSVF9ERUJVR19TRVNTSU9OLCBjYWxsYmFjaylcbiAgfVxuXG4gIG9uRGlkQ3VzdG9tRXZlbnQoY2FsbGJhY2s6IChldmVudDogRGVidWdQcm90b2NvbC5EZWJ1Z0V2ZW50KSA9PiBtaXhlZCk6IElEaXNwb3NhYmxlIHtcbiAgICByZXR1cm4gdGhpcy5fZW1pdHRlci5vbihDVVNUT01fREVCVUdfRVZFTlQsIGNhbGxiYWNrKVxuICB9XG5cbiAgb25EaWRDaGFuZ2VQcm9jZXNzTW9kZShjYWxsYmFjazogKGRhdGE6IHsgcHJvY2VzczogSVByb2Nlc3MsIG1vZGU6IERlYnVnZ2VyTW9kZVR5cGUgfSkgPT4gbWl4ZWQpOiBJRGlzcG9zYWJsZSB7XG4gICAgcmV0dXJuIHRoaXMuX2VtaXR0ZXIub24oQ0hBTkdFX0RFQlVHX01PREUsIGNhbGxiYWNrKVxuICB9XG5cbiAgX2xvYWRCcmVha3BvaW50cyhzdGF0ZTogP1NlcmlhbGl6ZWRTdGF0ZSk6IElVSUJyZWFrcG9pbnRbXSB7XG4gICAgbGV0IHJlc3VsdDogSVVJQnJlYWtwb2ludFtdID0gW11cbiAgICBpZiAoc3RhdGUgPT0gbnVsbCB8fCBzdGF0ZS5zb3VyY2VCcmVha3BvaW50cyA9PSBudWxsKSB7XG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICByZXN1bHQgPSBzdGF0ZS5zb3VyY2VCcmVha3BvaW50cy5tYXAoKGJyZWFrcG9pbnQpID0+IHtcbiAgICAgICAgY29uc3QgYnA6IElVSUJyZWFrcG9pbnQgPSB7XG4gICAgICAgICAgdXJpOiBicmVha3BvaW50LnVyaSxcbiAgICAgICAgICBsaW5lOiBicmVha3BvaW50Lm9yaWdpbmFsTGluZSxcbiAgICAgICAgICBjb2x1bW46IGJyZWFrcG9pbnQuY29sdW1uLFxuICAgICAgICAgIGVuYWJsZWQ6IGJyZWFrcG9pbnQuZW5hYmxlZCxcbiAgICAgICAgICBpZDogdXVpZC52NCgpLFxuICAgICAgICB9XG4gICAgICAgIGlmIChicmVha3BvaW50LmNvbmRpdGlvbiAhPSBudWxsICYmIGJyZWFrcG9pbnQuY29uZGl0aW9uLnRyaW0oKSAhPT0gXCJcIikge1xuICAgICAgICAgIGJwLmNvbmRpdGlvbiA9IGJyZWFrcG9pbnQuY29uZGl0aW9uXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGJyZWFrcG9pbnQubG9nTWVzc2FnZSAhPSBudWxsICYmIGJyZWFrcG9pbnQubG9nTWVzc2FnZS50cmltKCkgIT09IFwiXCIpIHtcbiAgICAgICAgICBicC5sb2dNZXNzYWdlID0gYnJlYWtwb2ludC5sb2dNZXNzYWdlXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGJwXG4gICAgICB9KVxuICAgIH0gY2F0Y2ggKGUpIHt9XG5cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBfbG9hZEZ1bmN0aW9uQnJlYWtwb2ludHMoc3RhdGU6ID9TZXJpYWxpemVkU3RhdGUpOiBGdW5jdGlvbkJyZWFrcG9pbnRbXSB7XG4gICAgbGV0IHJlc3VsdDogRnVuY3Rpb25CcmVha3BvaW50W10gPSBbXVxuICAgIGlmIChzdGF0ZSA9PSBudWxsIHx8IHN0YXRlLmZ1bmN0aW9uQnJlYWtwb2ludHMgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cbiAgICB0cnkge1xuICAgICAgcmVzdWx0ID0gc3RhdGUuZnVuY3Rpb25CcmVha3BvaW50cy5tYXAoKGZiKSA9PiB7XG4gICAgICAgIHJldHVybiBuZXcgRnVuY3Rpb25CcmVha3BvaW50KGZiLm5hbWUsIGZiLmVuYWJsZWQsIGZiLmhpdENvbmRpdGlvbilcbiAgICAgIH0pXG4gICAgfSBjYXRjaCAoZSkge31cblxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIF9sb2FkRXhjZXB0aW9uQnJlYWtwb2ludHMoc3RhdGU6ID9TZXJpYWxpemVkU3RhdGUpOiBFeGNlcHRpb25CcmVha3BvaW50W10ge1xuICAgIGxldCByZXN1bHQ6IEV4Y2VwdGlvbkJyZWFrcG9pbnRbXSA9IFtdXG4gICAgaWYgKHN0YXRlID09IG51bGwgfHwgc3RhdGUuZXhjZXB0aW9uQnJlYWtwb2ludHMgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cbiAgICB0cnkge1xuICAgICAgcmVzdWx0ID0gc3RhdGUuZXhjZXB0aW9uQnJlYWtwb2ludHMubWFwKChleEJyZWFrcG9pbnQpID0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBFeGNlcHRpb25CcmVha3BvaW50KGV4QnJlYWtwb2ludC5maWx0ZXIsIGV4QnJlYWtwb2ludC5sYWJlbCwgZXhCcmVha3BvaW50LmVuYWJsZWQpXG4gICAgICB9KVxuICAgIH0gY2F0Y2ggKGUpIHt9XG5cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICBfbG9hZFdhdGNoRXhwcmVzc2lvbnMoc3RhdGU6ID9TZXJpYWxpemVkU3RhdGUpOiBFeHByZXNzaW9uW10ge1xuICAgIGxldCByZXN1bHQ6IEV4cHJlc3Npb25bXSA9IFtdXG4gICAgaWYgKHN0YXRlID09IG51bGwgfHwgc3RhdGUud2F0Y2hFeHByZXNzaW9ucyA9PSBudWxsKSB7XG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICByZXN1bHQgPSBzdGF0ZS53YXRjaEV4cHJlc3Npb25zLm1hcCgobmFtZSkgPT4gbmV3IEV4cHJlc3Npb24obmFtZSkpXG4gICAgfSBjYXRjaCAoZSkge31cblxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIF9vbkRlYnVnZ2VyTW9kZUNoYW5nZWQocHJvY2VzczogSVByb2Nlc3MsIG1vZGU6IERlYnVnZ2VyTW9kZVR5cGUpOiB2b2lkIHtcbiAgICB0aGlzLl9lbWl0dGVyLmVtaXQoQ0hBTkdFX0RFQlVHX01PREUsIHtcbiAgICAgIGRhdGE6IHtcbiAgICAgICAgcHJvY2VzcyxcbiAgICAgICAgbW9kZSxcbiAgICAgIH0sXG4gICAgfSlcbiAgfVxuXG4gIGVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzKGVuYWJsZTogYm9vbGVhbiwgYnJlYWtwb2ludD86IElFbmFibGVhYmxlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKGJyZWFrcG9pbnQgIT0gbnVsbCkge1xuICAgICAgdGhpcy5fbW9kZWwuc2V0RW5hYmxlbWVudChicmVha3BvaW50LCBlbmFibGUpXG4gICAgICBpZiAoYnJlYWtwb2ludCBpbnN0YW5jZW9mIEJyZWFrcG9pbnQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NlbmRCcmVha3BvaW50cyhicmVha3BvaW50LnVyaSlcbiAgICAgIH0gZWxzZSBpZiAoYnJlYWtwb2ludCBpbnN0YW5jZW9mIEZ1bmN0aW9uQnJlYWtwb2ludCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2VuZEZ1bmN0aW9uQnJlYWtwb2ludHMoKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX1RPR0dMRV9FWENFUFRJT05fQlJFQUtQT0lOVClcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NlbmRFeGNlcHRpb25CcmVha3BvaW50cygpXG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5fbW9kZWwuZW5hYmxlT3JEaXNhYmxlQWxsQnJlYWtwb2ludHMoZW5hYmxlKVxuICAgIHJldHVybiB0aGlzLl9zZW5kQWxsQnJlYWtwb2ludHMoKVxuICB9XG5cbiAgYXN5bmMgYWRkVUlCcmVha3BvaW50cyh1aUJyZWFrcG9pbnRzOiBJVUlCcmVha3BvaW50W10pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfQlJFQUtQT0lOVF9BREQpXG4gICAgdGhpcy5fbW9kZWwuYWRkVUlCcmVha3BvaW50cyh1aUJyZWFrcG9pbnRzKVxuXG4gICAgY29uc3QgdXJpcyA9IG5ldyBTZXQoKVxuICAgIGZvciAoY29uc3QgYnAgb2YgdWlCcmVha3BvaW50cykge1xuICAgICAgdXJpcy5hZGQoYnAudXJpKVxuICAgIH1cblxuICAgIGNvbnN0IHByb21pc2VzID0gW11cbiAgICBmb3IgKGNvbnN0IHVyaSBvZiB1cmlzKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKHRoaXMuX3NlbmRCcmVha3BvaW50cyh1cmkpKVxuICAgIH1cblxuICAgIGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKVxuICB9XG5cbiAgYWRkU291cmNlQnJlYWtwb2ludCh1cmk6IHN0cmluZywgbGluZTogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX0JSRUFLUE9JTlRfU0lOR0xFX0FERClcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuX21vZGVsLmdldEJyZWFrcG9pbnRBdExpbmUodXJpLCBsaW5lKVxuICAgIGlmIChleGlzdGluZyA9PSBudWxsKSB7XG4gICAgICByZXR1cm4gdGhpcy5hZGRVSUJyZWFrcG9pbnRzKFt7IGxpbmUsIGNvbHVtbjogMCwgZW5hYmxlZDogdHJ1ZSwgaWQ6IHV1aWQudjQoKSwgdXJpIH1dKVxuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZClcbiAgfVxuXG4gIHRvZ2dsZVNvdXJjZUJyZWFrcG9pbnQodXJpOiBzdHJpbmcsIGxpbmU6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9CUkVBS1BPSU5UX1RPR0dMRSlcbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuX21vZGVsLmdldEJyZWFrcG9pbnRBdExpbmUodXJpLCBsaW5lKVxuICAgIGlmIChleGlzdGluZyA9PSBudWxsKSB7XG4gICAgICByZXR1cm4gdGhpcy5hZGRVSUJyZWFrcG9pbnRzKFt7IGxpbmUsIGNvbHVtbjogMCwgZW5hYmxlZDogdHJ1ZSwgaWQ6IHV1aWQudjQoKSwgdXJpIH1dKVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy5yZW1vdmVCcmVha3BvaW50cyhleGlzdGluZy5nZXRJZCgpLCB0cnVlKVxuICAgIH1cbiAgfVxuXG4gIHVwZGF0ZUJyZWFrcG9pbnRzKHVpQnJlYWtwb2ludHM6IElVSUJyZWFrcG9pbnRbXSkge1xuICAgIHRoaXMuX21vZGVsLnVwZGF0ZUJyZWFrcG9pbnRzKHVpQnJlYWtwb2ludHMpXG5cbiAgICBjb25zdCB1cmlzVG9TZW5kID0gbmV3IFNldCh1aUJyZWFrcG9pbnRzLm1hcCgoYnApID0+IGJwLnVyaSkpXG4gICAgZm9yIChjb25zdCB1cmkgb2YgdXJpc1RvU2VuZCkge1xuICAgICAgdGhpcy5fYnJlYWtwb2ludHNUb1NlbmRPblNhdmUuYWRkKHVyaSlcbiAgICB9XG4gIH1cblxuICBhc3luYyByZW1vdmVCcmVha3BvaW50cyhpZD86IHN0cmluZywgc2tpcEFuYWx5dGljcz86IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHRvUmVtb3ZlID0gdGhpcy5fbW9kZWwuZ2V0QnJlYWtwb2ludHMoKS5maWx0ZXIoKGJwKSA9PiBpZCA9PSBudWxsIHx8IGJwLmdldElkKCkgPT09IGlkKVxuICAgIGNvbnN0IHVyaXNUb0NsZWFyID0gZGlzdGluY3QodG9SZW1vdmUsIChicCkgPT4gYnAudXJpKS5tYXAoKGJwKSA9PiBicC51cmkpXG5cbiAgICB0aGlzLl9tb2RlbC5yZW1vdmVCcmVha3BvaW50cyh0b1JlbW92ZSlcblxuICAgIGlmIChpZCA9PSBudWxsKSB7XG4gICAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfQlJFQUtQT0lOVF9ERUxFVEVfQUxMKVxuICAgIH0gZWxzZSBpZiAoIXNraXBBbmFseXRpY3MpIHtcbiAgICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9CUkVBS1BPSU5UX0RFTEVURSlcbiAgICB9XG5cbiAgICBhd2FpdCBQcm9taXNlLmFsbCh1cmlzVG9DbGVhci5tYXAoKHVyaSkgPT4gdGhpcy5fc2VuZEJyZWFrcG9pbnRzKHVyaSkpKVxuICB9XG5cbiAgc2V0QnJlYWtwb2ludHNBY3RpdmF0ZWQoYWN0aXZhdGVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy5fbW9kZWwuc2V0QnJlYWtwb2ludHNBY3RpdmF0ZWQoYWN0aXZhdGVkKVxuICAgIHJldHVybiB0aGlzLl9zZW5kQWxsQnJlYWtwb2ludHMoKVxuICB9XG5cbiAgYWRkRnVuY3Rpb25CcmVha3BvaW50KCk6IHZvaWQge1xuICAgIHRoaXMuX21vZGVsLmFkZEZ1bmN0aW9uQnJlYWtwb2ludChcIlwiKVxuICB9XG5cbiAgcmVuYW1lRnVuY3Rpb25CcmVha3BvaW50KGlkOiBzdHJpbmcsIG5ld0Z1bmN0aW9uTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy5fbW9kZWwudXBkYXRlRnVuY3Rpb25CcmVha3BvaW50cyh7IFtpZF06IHsgbmFtZTogbmV3RnVuY3Rpb25OYW1lIH0gfSlcbiAgICByZXR1cm4gdGhpcy5fc2VuZEZ1bmN0aW9uQnJlYWtwb2ludHMoKVxuICB9XG5cbiAgcmVtb3ZlRnVuY3Rpb25CcmVha3BvaW50cyhpZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMuX21vZGVsLnJlbW92ZUZ1bmN0aW9uQnJlYWtwb2ludHMoaWQpXG4gICAgcmV0dXJuIHRoaXMuX3NlbmRGdW5jdGlvbkJyZWFrcG9pbnRzKClcbiAgfVxuXG4gIGFzeW5jIHRlcm1pbmF0ZVRocmVhZHModGhyZWFkSWRzOiBBcnJheTxudW1iZXI+KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgeyBmb2N1c2VkUHJvY2VzcyB9ID0gdGhpcy52aWV3TW9kZWxcbiAgICBpZiAoZm9jdXNlZFByb2Nlc3MgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3Qgc2Vzc2lvbiA9IGZvY3VzZWRQcm9jZXNzLnNlc3Npb25cbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfVEVSTUlOQVRFX1RIUkVBRClcbiAgICBpZiAoQm9vbGVhbihzZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c1Rlcm1pbmF0ZVRocmVhZHNSZXF1ZXN0KSkge1xuICAgICAgYXdhaXQgc2Vzc2lvbi5jdXN0b20oXCJ0ZXJtaW5hdGVUaHJlYWRzXCIsIHtcbiAgICAgICAgdGhyZWFkSWRzLFxuICAgICAgfSlcbiAgICB9XG4gIH1cblxuICBhc3luYyBydW5Ub0xvY2F0aW9uKHVyaTogc3RyaW5nLCBsaW5lOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCB7IGZvY3VzZWRUaHJlYWQsIGZvY3VzZWRQcm9jZXNzIH0gPSB0aGlzLnZpZXdNb2RlbFxuICAgIGlmIChmb2N1c2VkVGhyZWFkID09IG51bGwgfHwgZm9jdXNlZFByb2Nlc3MgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3Qgc2Vzc2lvbiA9IGZvY3VzZWRQcm9jZXNzLnNlc3Npb25cblxuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9TVEVQX1JVTl9UT19MT0NBVElPTilcbiAgICBpZiAoQm9vbGVhbihzZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c0NvbnRpbnVlVG9Mb2NhdGlvbikpIHtcbiAgICAgIGF3YWl0IHNlc3Npb24uY3VzdG9tKFwiY29udGludWVUb0xvY2F0aW9uXCIsIHtcbiAgICAgICAgc291cmNlOiBmb2N1c2VkUHJvY2Vzcy5nZXRTb3VyY2UoeyBwYXRoOiB1cmkgfSkucmF3LFxuICAgICAgICBsaW5lLFxuICAgICAgICB0aHJlYWRJZDogZm9jdXNlZFRocmVhZC50aHJlYWRJZCxcbiAgICAgIH0pXG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgY29uc3QgZXhpc3RpbmcgPSB0aGlzLl9tb2RlbC5nZXRCcmVha3BvaW50QXRMaW5lKHVyaSwgbGluZSlcbiAgICBpZiAoZXhpc3RpbmcgPT0gbnVsbCkge1xuICAgICAgYXdhaXQgdGhpcy5hZGRVSUJyZWFrcG9pbnRzKFt7IGxpbmUsIGNvbHVtbjogMCwgZW5hYmxlZDogdHJ1ZSwgaWQ6IHV1aWQudjQoKSwgdXJpIH1dKVxuICAgICAgY29uc3QgcnVuVG9Mb2NhdGlvbkJyZWFrcG9pbnQgPSB0aGlzLl9tb2RlbC5nZXRCcmVha3BvaW50QXRMaW5lKHVyaSwgbGluZSlcbiAgICAgIGludmFyaWFudChydW5Ub0xvY2F0aW9uQnJlYWtwb2ludCAhPSBudWxsKVxuXG4gICAgICBjb25zdCByZW1vdmVCcmVha3BvaW50ID0gKCkgPT4ge1xuICAgICAgICB0aGlzLnJlbW92ZUJyZWFrcG9pbnRzKHJ1blRvTG9jYXRpb25CcmVha3BvaW50LmdldElkKCksIHRydWUgLyogc2tpcCBhbmFseXRpY3MgKi8pLmNhdGNoKChlcnJvcikgPT5cbiAgICAgICAgICBvblVuZXhwZWN0ZWRFcnJvcihgRmFpbGVkIHRvIGNsZWFyIHJ1bi10by1sb2NhdGlvbiBicmVha3BvaW50ISAtICR7U3RyaW5nKGVycm9yKX1gKVxuICAgICAgICApXG4gICAgICAgIHJlbW92ZUJyZWFrcG9pbnREaXNwb3NhYmxlLmRpc3Bvc2UoKVxuICAgICAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMucmVtb3ZlKHJlbW92ZUJyZWFrcG9pbnREaXNwb3NhYmxlKVxuICAgICAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMucmVtb3ZlKHJlbW92ZUJyZWFrcG9pbnQpXG4gICAgICB9XG5cbiAgICAgIC8vIFJlbW92ZSBpZiB0aGUgZGVidWdnZXIgc3RvcHBlZCBhdCBhbnkgbG9jYXRpb24uXG4gICAgICBjb25zdCByZW1vdmVCcmVha3BvaW50RGlzcG9zYWJsZSA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKFxuICAgICAgICBzZXNzaW9uLm9ic2VydmVTdG9wRXZlbnRzKCkudGFrZSgxKS5zdWJzY3JpYmUocmVtb3ZlQnJlYWtwb2ludClcbiAgICAgIClcbiAgICAgIC8vIFJlbW92ZSBpZiB0aGUgc2Vzc2lvbiBoYXMgZW5kZWQgd2l0aG91dCBoaXR0aW5nIGl0LlxuICAgICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmFkZChyZW1vdmVCcmVha3BvaW50RGlzcG9zYWJsZSwgcmVtb3ZlQnJlYWtwb2ludClcbiAgICB9XG4gICAgYXdhaXQgZm9jdXNlZFRocmVhZC5jb250aW51ZSgpXG4gIH1cblxuICBhZGRXYXRjaEV4cHJlc3Npb24obmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX1dBVENIX0FERF9FWFBSRVNTSU9OKVxuICAgIHJldHVybiB0aGlzLl9tb2RlbC5hZGRXYXRjaEV4cHJlc3Npb24obmFtZSlcbiAgfVxuXG4gIHJlbmFtZVdhdGNoRXhwcmVzc2lvbihpZDogc3RyaW5nLCBuZXdOYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfV0FUQ0hfVVBEQVRFX0VYUFJFU1NJT04pXG4gICAgcmV0dXJuIHRoaXMuX21vZGVsLnJlbmFtZVdhdGNoRXhwcmVzc2lvbihpZCwgbmV3TmFtZSlcbiAgfVxuXG4gIHJlbW92ZVdhdGNoRXhwcmVzc2lvbnMoaWQ/OiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfV0FUQ0hfUkVNT1ZFX0VYUFJFU1NJT04pXG4gICAgdGhpcy5fbW9kZWwucmVtb3ZlV2F0Y2hFeHByZXNzaW9ucyhpZClcbiAgfVxuXG4gIGNyZWF0ZUV4cHJlc3Npb24ocmF3RXhwcmVzc2lvbjogc3RyaW5nKTogSUV2YWx1YXRhYmxlRXhwcmVzc2lvbiB7XG4gICAgcmV0dXJuIG5ldyBFeHByZXNzaW9uKHJhd0V4cHJlc3Npb24pXG4gIH1cblxuICBhc3luYyBfZG9DcmVhdGVQcm9jZXNzKHJhd0NvbmZpZ3VyYXRpb246IElQcm9jZXNzQ29uZmlnLCBzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8P0lQcm9jZXNzPiB7XG4gICAgbGV0IHByb2Nlc3M6ID9Qcm9jZXNzXG4gICAgbGV0IHNlc3Npb246ID9Wc0RlYnVnU2Vzc2lvblxuICAgIGNvbnN0IGVycm9ySGFuZGxlciA9IChlcnJvcjogRXJyb3IpID0+IHtcbiAgICAgIGlmICh0aGlzLl90aW1lciAhPSBudWxsKSB7XG4gICAgICAgIHRoaXMuX3RpbWVyLm9uRXJyb3IoZXJyb3IpXG4gICAgICAgIHRoaXMuX3RpbWVyID0gbnVsbFxuICAgICAgfVxuICAgICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX1NUQVJUX0ZBSUwsIHt9KVxuICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvclxuICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZEVycm9yKGBGYWlsZWQgdG8gc3RhcnQgZGVidWdnZXIgcHJvY2VzczogJHtlcnJvck1lc3NhZ2V9YClcblxuICAgICAgaWYgKHRoaXMuX21vZGVsLmdldFByb2Nlc3NlcygpID09IG51bGwgfHwgdGhpcy5fbW9kZWwuZ2V0UHJvY2Vzc2VzKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHRoaXMuX2NvbnNvbGVEaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgICAgIH1cbiAgICAgIGlmIChzZXNzaW9uICE9IG51bGwgJiYgIXNlc3Npb24uaXNEaXNjb25uZWN0ZWQoKSkge1xuICAgICAgICB0aGlzLl9vblNlc3Npb25FbmQoc2Vzc2lvbilcbiAgICAgICAgc2Vzc2lvbi5kaXNjb25uZWN0KCkuY2F0Y2gob25VbmV4cGVjdGVkRXJyb3IpXG4gICAgICB9XG4gICAgICBpZiAocHJvY2VzcyAhPSBudWxsKSB7XG4gICAgICAgIHRoaXMuX21vZGVsLnJlbW92ZVByb2Nlc3MocHJvY2Vzcy5nZXRJZCgpKVxuICAgICAgICB0aGlzLl9vbkRlYnVnZ2VyTW9kZUNoYW5nZWQocHJvY2VzcywgRGVidWdnZXJNb2RlLlNUT1BQRUQpXG4gICAgICB9XG4gICAgfVxuXG4gICAgdHJ5IHtcbiAgICAgIGxldCBjb25maWd1cmF0aW9uOiBJUHJvY2Vzc0NvbmZpZ1xuICAgICAgbGV0IGFkYXB0ZXJFeGVjdXRhYmxlOiBWU0FkYXB0ZXJFeGVjdXRhYmxlSW5mb1xuICAgICAgLy8gaWYgc2VydmljZSBkb2VzIG5vdCBwcm92aWRlIGFkYXB0ZXJFeGVjdXRhYmxlIHVzZSB0aGUgaGFyZGNvZGVkIHZhbHVlcyBpbiBkZWJ1Z2dlci1yZWdpc3RyeVxuICAgICAgaWYgKCFyYXdDb25maWd1cmF0aW9uLmFkYXB0ZXJFeGVjdXRhYmxlKSB7XG4gICAgICAgIGFkYXB0ZXJFeGVjdXRhYmxlID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUFkYXB0ZXJFeGVjdXRhYmxlKHJhd0NvbmZpZ3VyYXRpb24pXG4gICAgICAgIGNvbmZpZ3VyYXRpb24gPSB7XG4gICAgICAgICAgLi4ucmF3Q29uZmlndXJhdGlvbixcbiAgICAgICAgICBhZGFwdGVyRXhlY3V0YWJsZSxcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gYWxyZWFkeSBhZGFwdGVyRXhlY3V0YWJsZSBpcyBwcm92aWRlZCBieSB0aGUgcHJvdmlkZXIgc28gdGhlIGNvbmZpZ3VyYXRpb24gaXMgbm90IHJhdy5cbiAgICAgICAgY29uZmlndXJhdGlvbiA9IHJhd0NvbmZpZ3VyYXRpb25cbiAgICAgIH1cbiAgICAgIGNvbmZpZ3VyYXRpb24gPSBhd2FpdCByZXNvbHZlRGVidWdDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb24pXG4gICAgICBjb25zdCB7IGFkYXB0ZXJUeXBlLCBvbkRlYnVnU3RhcnRpbmdDYWxsYmFjaywgb25EZWJ1Z1N0YXJ0ZWRDYWxsYmFjaywgb25EZWJ1Z1J1bm5pbmdDYWxsYmFjayB9ID0gY29uZmlndXJhdGlvblxuXG4gICAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfU1RBUlQsIHtcbiAgICAgICAgc2VydmljZU5hbWU6IGNvbmZpZ3VyYXRpb24uYWRhcHRlclR5cGUsXG4gICAgICAgIGNsaWVudFR5cGU6IFwiVlNQXCIsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCBzZXNzaW9uVGVhcmRvd25EaXNwb3NhYmxlcyA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKClcblxuICAgICAgY29uc3QgaW5zdGFuY2VJbnRlcmZhY2UgPSAobmV3U2Vzc2lvbikgPT4ge1xuICAgICAgICByZXR1cm4gT2JqZWN0LmZyZWV6ZSh7XG4gICAgICAgICAgY3VzdG9tUmVxdWVzdDogYXN5bmMgKHJlcXVlc3Q6IHN0cmluZywgYXJnczogYW55KTogUHJvbWlzZTxEZWJ1Z1Byb3RvY29sLkN1c3RvbVJlc3BvbnNlPiA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbmV3U2Vzc2lvbi5jdXN0b20ocmVxdWVzdCwgYXJncylcbiAgICAgICAgICB9LFxuICAgICAgICAgIG9ic2VydmVDdXN0b21FdmVudHM6IG5ld1Nlc3Npb24ub2JzZXJ2ZUN1c3RvbUV2ZW50cy5iaW5kKG5ld1Nlc3Npb24pLFxuICAgICAgICB9KVxuICAgICAgfVxuXG4gICAgICBjb25zdCBjcmVhdGVJbml0aWFsaXplU2Vzc2lvbiA9IGFzeW5jIChjb25maWc6IElQcm9jZXNzQ29uZmlnKSA9PiB7XG4gICAgICAgIGNvbnN0IG5ld1Nlc3Npb24gPSBhd2FpdCB0aGlzLl9jcmVhdGVWc0RlYnVnU2Vzc2lvbihcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgY29uZmlnLmFkYXB0ZXJFeGVjdXRhYmxlIHx8IGFkYXB0ZXJFeGVjdXRhYmxlLFxuICAgICAgICAgIHNlc3Npb25JZFxuICAgICAgICApXG5cbiAgICAgICAgLy8gSWYgdGhpcyBpcyB0aGUgZmlyc3QgcHJvY2VzcywgcmVnaXN0ZXIgdGhlIGNvbnNvbGUgZXhlY3V0b3IuXG4gICAgICAgIGlmICh0aGlzLl9tb2RlbC5nZXRQcm9jZXNzZXMoKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICB0aGlzLl9yZWdpc3RlckNvbnNvbGVFeGVjdXRvcigpXG4gICAgICAgIH1cblxuICAgICAgICBwcm9jZXNzID0gdGhpcy5fbW9kZWwuYWRkUHJvY2Vzcyhjb25maWcsIG5ld1Nlc3Npb24pXG4gICAgICAgIHRoaXMuX3ZpZXdNb2RlbC5zZXRGb2N1c2VkUHJvY2Vzcyhwcm9jZXNzLCBmYWxzZSlcbiAgICAgICAgdGhpcy5fb25EZWJ1Z2dlck1vZGVDaGFuZ2VkKHByb2Nlc3MsIERlYnVnZ2VyTW9kZS5TVEFSVElORylcbiAgICAgICAgdGhpcy5fZW1pdHRlci5lbWl0KFNUQVJUX0RFQlVHX1NFU1NJT04sIGNvbmZpZylcbiAgICAgICAgdGhpcy5fcmVnaXN0ZXJTZXNzaW9uTGlzdGVuZXJzKHByb2Nlc3MsIG5ld1Nlc3Npb24pXG4gICAgICAgIGF0b20uY29tbWFuZHMuZGlzcGF0Y2goYXRvbS52aWV3cy5nZXRWaWV3KGF0b20ud29ya3NwYWNlKSwgXCJkZWJ1Z2dlcjpzaG93XCIpXG4gICAgICAgIGF3YWl0IG5ld1Nlc3Npb24uaW5pdGlhbGl6ZSh7XG4gICAgICAgICAgY2xpZW50SUQ6IFwiYXRvbVwiLFxuICAgICAgICAgIGFkYXB0ZXJJRDogYWRhcHRlclR5cGUsXG4gICAgICAgICAgcGF0aEZvcm1hdDogXCJwYXRoXCIsXG4gICAgICAgICAgbGluZXNTdGFydEF0MTogdHJ1ZSxcbiAgICAgICAgICBjb2x1bW5zU3RhcnRBdDE6IHRydWUsXG4gICAgICAgICAgc3VwcG9ydHNWYXJpYWJsZVR5cGU6IHRydWUsXG4gICAgICAgICAgc3VwcG9ydHNWYXJpYWJsZVBhZ2luZzogZmFsc2UsXG4gICAgICAgICAgc3VwcG9ydHNSdW5JblRlcm1pbmFsUmVxdWVzdDogZ2V0VGVybWluYWxTZXJ2aWNlKCkgIT0gbnVsbCxcbiAgICAgICAgICBsb2NhbGU6IFwiZW4tdXNcIixcbiAgICAgICAgfSlcblxuICAgICAgICBpZiAob25EZWJ1Z1N0YXJ0aW5nQ2FsbGJhY2sgIT0gbnVsbCkge1xuICAgICAgICAgIC8vIENhbGxiYWNrcyBhcmUgcGFzc2VkIElWc3BJbnN0YW5jZSB3aGljaCBleHBvc2VzIG9ubHkgY2VydGFpblxuICAgICAgICAgIC8vIG1ldGhvZHMgdG8gdGhlbSwgcmF0aGVyIHRoYW4gZ2V0dGluZyB0aGUgZnVsbCBzZXNzaW9uLlxuICAgICAgICAgIGNvbnN0IHRlYXJkb3duID0gb25EZWJ1Z1N0YXJ0aW5nQ2FsbGJhY2soaW5zdGFuY2VJbnRlcmZhY2UobmV3U2Vzc2lvbikpXG4gICAgICAgICAgaWYgKHRlYXJkb3duICE9IG51bGwpIHtcbiAgICAgICAgICAgIHNlc3Npb25UZWFyZG93bkRpc3Bvc2FibGVzLmFkZCh0ZWFyZG93bilcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9tb2RlbC5zZXRFeGNlcHRpb25CcmVha3BvaW50cyhwcm9jZXNzLCBuZXdTZXNzaW9uLmdldENhcGFiaWxpdGllcygpLmV4Y2VwdGlvbkJyZWFrcG9pbnRGaWx0ZXJzIHx8IFtdKVxuICAgICAgICByZXR1cm4gbmV3U2Vzc2lvblxuICAgICAgfVxuXG4gICAgICBzZXNzaW9uID0gYXdhaXQgY3JlYXRlSW5pdGlhbGl6ZVNlc3Npb24oY29uZmlndXJhdGlvbilcblxuICAgICAgY29uc3Qgc2V0UnVubmluZ1N0YXRlID0gKCkgPT4ge1xuICAgICAgICBpZiAocHJvY2VzcyAhPSBudWxsKSB7XG4gICAgICAgICAgcHJvY2Vzcy5jbGVhclByb2Nlc3NTdGFydGluZ0ZsYWcoKVxuICAgICAgICAgIHRoaXMuX29uRGVidWdnZXJNb2RlQ2hhbmdlZChwcm9jZXNzLCBEZWJ1Z2dlck1vZGUuUlVOTklORylcbiAgICAgICAgICB0aGlzLl92aWV3TW9kZWwuc2V0Rm9jdXNlZFByb2Nlc3MocHJvY2VzcywgZmFsc2UpXG4gICAgICAgICAgaWYgKG9uRGVidWdSdW5uaW5nQ2FsbGJhY2sgIT0gbnVsbCAmJiBzZXNzaW9uICE9IG51bGwpIHtcbiAgICAgICAgICAgIC8vIENhbGxiYWNrcyBhcmUgcGFzc2VkIElWc3BJbnN0YW5jZSB3aGljaCBleHBvc2VzIG9ubHkgY2VydGFpblxuICAgICAgICAgICAgLy8gbWV0aG9kcyB0byB0aGVtLCByYXRoZXIgdGhhbiBnZXR0aW5nIHRoZSBmdWxsIHNlc3Npb24uXG4gICAgICAgICAgICBjb25zdCB0ZWFyZG93biA9IG9uRGVidWdSdW5uaW5nQ2FsbGJhY2soaW5zdGFuY2VJbnRlcmZhY2Uoc2Vzc2lvbikpXG4gICAgICAgICAgICBpZiAodGVhcmRvd24gIT0gbnVsbCkge1xuICAgICAgICAgICAgICBzZXNzaW9uVGVhcmRvd25EaXNwb3NhYmxlcy5hZGQodGVhcmRvd24pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFdlJ3JlIG5vdCBhd2FpdGluZyBsYXVuY2gvYXR0YWNoIHRvIGZpbmlzaCBiZWNhdXNlIHNvbWUgZGVidWcgYWRhcHRlcnNcbiAgICAgIC8vIG5lZWQgdG8gZG8gY3VzdG9tIHdvcmsgZm9yIGxhdW5jaC9hdHRhY2ggdG8gd29yayAoZS5nLiBtb2JpbGVqcylcbiAgICAgIHRoaXMuX2xhdW5jaE9yQXR0YWNoVGFyZ2V0KHNlc3Npb24sIGNvbmZpZ3VyYXRpb24pXG4gICAgICAgIC50aGVuKCgpID0+IHNldFJ1bm5pbmdTdGF0ZSgpKVxuICAgICAgICAuY2F0Y2goYXN5bmMgKGVycm9yKSA9PiB7XG4gICAgICAgICAgaWYgKHByb2Nlc3MgIT0gbnVsbCkge1xuICAgICAgICAgICAgdGhpcy5zdG9wUHJvY2Vzcyhwcm9jZXNzKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGNvbmZpZ3VyYXRpb24uZGVidWdNb2RlID09PSBcImF0dGFjaFwiICYmXG4gICAgICAgICAgICBjb25maWd1cmF0aW9uLmFkYXB0ZXJFeGVjdXRhYmxlICE9IG51bGwgJiZcbiAgICAgICAgICAgIGNvbmZpZ3VyYXRpb24uYWRhcHRlckV4ZWN1dGFibGUuY29tbWFuZCAhPT0gXCJzdWRvXCIgJiZcbiAgICAgICAgICAgIC8vIHN1ZG8gaXMgbm90IHN1cHBvcnRlZCBvbiBXaW5kb3dzLCBhbmQgY3VycmVudGx5IHJlbW90ZSBwcm9qZWN0c1xuICAgICAgICAgICAgLy8gYXJlIG5vdCBzdXBwb3J0ZWQgb24gV2luZG93cywgc28gYSByZW1vdGUgVVJJIG11c3QgYmUgKm5peC5cbiAgICAgICAgICAgIChvcy5wbGF0Zm9ybSgpICE9PSBcIndpbjMyXCIgfHwgbnVjbGlkZVVyaS5pc1JlbW90ZShjb25maWd1cmF0aW9uLnRhcmdldFVyaSkpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBjb25maWd1cmF0aW9uLmFkYXB0ZXJFeGVjdXRhYmxlLmFyZ3MgPSBbXG4gICAgICAgICAgICAgIGNvbmZpZ3VyYXRpb24uYWRhcHRlckV4ZWN1dGFibGUuY29tbWFuZCxcbiAgICAgICAgICAgICAgLi4uY29uZmlndXJhdGlvbi5hZGFwdGVyRXhlY3V0YWJsZS5hcmdzLFxuICAgICAgICAgICAgXVxuICAgICAgICAgICAgY29uZmlndXJhdGlvbi5hZGFwdGVyRXhlY3V0YWJsZS5jb21tYW5kID0gXCJzdWRvXCJcblxuICAgICAgICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBlcnJvclxuICAgICAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZFdhcm5pbmcoXG4gICAgICAgICAgICAgIGBUaGUgZGVidWdnZXIgd2FzIHVuYWJsZSB0byBhdHRhY2ggdG8gdGhlIHRhcmdldCBwcm9jZXNzOiAke2Vycm9yTWVzc2FnZX0uIGAgK1xuICAgICAgICAgICAgICAgIFwiQXR0ZW1wdGluZyB0byByZS1sYXVuY2ggdGhlIGRlYnVnZ2VyIGFzIHJvb3QuLi5cIlxuICAgICAgICAgICAgKVxuXG4gICAgICAgICAgICBzZXNzaW9uID0gYXdhaXQgY3JlYXRlSW5pdGlhbGl6ZVNlc3Npb24oY29uZmlndXJhdGlvbilcbiAgICAgICAgICAgIHRoaXMuX2xhdW5jaE9yQXR0YWNoVGFyZ2V0KHNlc3Npb24sIGNvbmZpZ3VyYXRpb24pXG4gICAgICAgICAgICAgIC50aGVuKCgpID0+IHNldFJ1bm5pbmdTdGF0ZSgpKVxuICAgICAgICAgICAgICAuY2F0Y2goZXJyb3JIYW5kbGVyKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBlcnJvckhhbmRsZXIoZXJyb3IpXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuXG4gICAgICBpZiAob25EZWJ1Z1N0YXJ0ZWRDYWxsYmFjayAhPSBudWxsICYmIHNlc3Npb24gIT0gbnVsbCkge1xuICAgICAgICBjb25zdCB0ZWFyZG93biA9IG9uRGVidWdTdGFydGVkQ2FsbGJhY2soaW5zdGFuY2VJbnRlcmZhY2Uoc2Vzc2lvbikpXG4gICAgICAgIGlmICh0ZWFyZG93biAhPSBudWxsKSB7XG4gICAgICAgICAgc2Vzc2lvblRlYXJkb3duRGlzcG9zYWJsZXMuYWRkKHRlYXJkb3duKVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoKCkgPT4ge1xuICAgICAgICB0aGlzLl9tb2RlbC5vbkRpZENoYW5nZVByb2Nlc3NlcygoKSA9PiB7XG4gICAgICAgICAgaWYgKCF0aGlzLmdldE1vZGVsKCkuZ2V0UHJvY2Vzc2VzKCkuaW5jbHVkZXMocHJvY2VzcykpIHtcbiAgICAgICAgICAgIHNlc3Npb25UZWFyZG93bkRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuYWRkKHNlc3Npb25UZWFyZG93bkRpc3Bvc2FibGVzKVxuXG4gICAgICByZXR1cm4gcHJvY2Vzc1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBlcnJvckhhbmRsZXIoZXJyb3IpXG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIF9yZXNvbHZlQWRhcHRlckV4ZWN1dGFibGUoY29uZmlndXJhdGlvbjogSVByb2Nlc3NDb25maWcpOiBQcm9taXNlPFZTQWRhcHRlckV4ZWN1dGFibGVJbmZvPiB7XG4gICAgaWYgKGNvbmZpZ3VyYXRpb24uYWRhcHRlckV4ZWN1dGFibGUgIT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGNvbmZpZ3VyYXRpb24uYWRhcHRlckV4ZWN1dGFibGVcbiAgICB9XG4gICAgcmV0dXJuIGdldFZTQ29kZURlYnVnZ2VyQWRhcHRlclNlcnZpY2VCeU51Y2xpZGVVcmkoY29uZmlndXJhdGlvbi50YXJnZXRVcmkpLmdldEFkYXB0ZXJFeGVjdXRhYmxlSW5mbyhcbiAgICAgIGNvbmZpZ3VyYXRpb24uYWRhcHRlclR5cGVcbiAgICApXG4gIH1cblxuICBhc3luYyBfY3JlYXRlVnNEZWJ1Z1Nlc3Npb24oXG4gICAgY29uZmlndXJhdGlvbjogSVByb2Nlc3NDb25maWcsXG4gICAgYWRhcHRlckV4ZWN1dGFibGU6IFZTQWRhcHRlckV4ZWN1dGFibGVJbmZvLFxuICAgIHNlc3Npb25JZDogc3RyaW5nXG4gICk6IFByb21pc2U8VnNEZWJ1Z1Nlc3Npb24+IHtcbiAgICBjb25zdCB7IHRhcmdldFVyaSB9ID0gY29uZmlndXJhdGlvblxuICAgIGNvbnN0IHNlcnZpY2UgPSBnZXRWU0NvZGVEZWJ1Z2dlckFkYXB0ZXJTZXJ2aWNlQnlOdWNsaWRlVXJpKHRhcmdldFVyaSlcbiAgICBjb25zdCBzcGF3bmVyID0gYXdhaXQgc2VydmljZS5jcmVhdGVWc1Jhd0FkYXB0ZXJTcGF3bmVyU2VydmljZSgpXG5cbiAgICBjb25zdCBjbGllbnRQcmVwcm9jZXNzb3JzOiBBcnJheTxNZXNzYWdlUHJvY2Vzc29yPiA9IFtdXG4gICAgY29uc3QgYWRhcHRlclByZXByb2Nlc3NvcnM6IEFycmF5PE1lc3NhZ2VQcm9jZXNzb3I+ID0gW11cbiAgICBpZiAoY29uZmlndXJhdGlvbi5jbGllbnRQcmVwcm9jZXNzb3IgIT0gbnVsbCkge1xuICAgICAgY2xpZW50UHJlcHJvY2Vzc29ycy5wdXNoKGNvbmZpZ3VyYXRpb24uY2xpZW50UHJlcHJvY2Vzc29yKVxuICAgIH1cbiAgICBpZiAoY29uZmlndXJhdGlvbi5hZGFwdGVyUHJlcHJvY2Vzc29yICE9IG51bGwpIHtcbiAgICAgIGFkYXB0ZXJQcmVwcm9jZXNzb3JzLnB1c2goY29uZmlndXJhdGlvbi5hZGFwdGVyUHJlcHJvY2Vzc29yKVxuICAgIH1cbiAgICBjb25zdCBpc1JlbW90ZSA9IG51Y2xpZGVVcmkuaXNSZW1vdGUodGFyZ2V0VXJpKVxuICAgIGlmIChpc1JlbW90ZSkge1xuICAgICAgY2xpZW50UHJlcHJvY2Vzc29ycy5wdXNoKHJlbW90ZVRvTG9jYWxQcm9jZXNzb3IoKSlcbiAgICAgIGFkYXB0ZXJQcmVwcm9jZXNzb3JzLnB1c2gobG9jYWxUb1JlbW90ZVByb2Nlc3Nvcih0YXJnZXRVcmkpKVxuICAgIH1cbiAgICByZXR1cm4gbmV3IFZzRGVidWdTZXNzaW9uKFxuICAgICAgc2Vzc2lvbklkLFxuICAgICAgbG9nZ2VyLFxuICAgICAgYWRhcHRlckV4ZWN1dGFibGUsXG4gICAgICB7IGFkYXB0ZXI6IGNvbmZpZ3VyYXRpb24uYWRhcHRlclR5cGUsIGhvc3Q6IFwiZGVidWdTZXJ2aWNlXCIsIGlzUmVtb3RlIH0sXG4gICAgICBzcGF3bmVyLFxuICAgICAgY2xpZW50UHJlcHJvY2Vzc29ycyxcbiAgICAgIGFkYXB0ZXJQcmVwcm9jZXNzb3JzLFxuICAgICAgdGhpcy5fcnVuSW5UZXJtaW5hbCxcbiAgICAgIEJvb2xlYW4oY29uZmlndXJhdGlvbi5pc1JlYWRPbmx5KVxuICAgIClcbiAgfVxuXG4gIGFzeW5jIF9sYXVuY2hPckF0dGFjaFRhcmdldChzZXNzaW9uOiBWc0RlYnVnU2Vzc2lvbiwgY29uZmlndXJhdGlvbjogSVByb2Nlc3NDb25maWcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoY29uZmlndXJhdGlvbi5kZWJ1Z01vZGUgPT09IFwiYXR0YWNoXCIpIHtcbiAgICAgIGF3YWl0IHNlc3Npb24uYXR0YWNoKGNvbmZpZ3VyYXRpb24uY29uZmlnKVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBJdCdzICdsYXVuY2gnXG4gICAgICBhd2FpdCBzZXNzaW9uLmxhdW5jaChjb25maWd1cmF0aW9uLmNvbmZpZylcbiAgICB9XG4gIH1cblxuICBfc291cmNlSXNOb3RBdmFpbGFibGUodXJpOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLl9tb2RlbC5zb3VyY2VJc05vdEF2YWlsYWJsZSh1cmkpXG4gIH1cblxuICBfcnVuSW5UZXJtaW5hbCA9IGFzeW5jIChhcmdzOiBEZWJ1Z1Byb3RvY29sLlJ1bkluVGVybWluYWxSZXF1ZXN0QXJndW1lbnRzKTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gICAgY29uc3QgdGVybWluYWxTZXJ2aWNlID0gZ2V0VGVybWluYWxTZXJ2aWNlKClcbiAgICBpZiAodGVybWluYWxTZXJ2aWNlID09IG51bGwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlVuYWJsZSB0byBsYXVuY2ggaW4gdGVybWluYWwgc2luY2UgdGhlIHNlcnZpY2UgaXMgbm90IGF2YWlsYWJsZVwiKVxuICAgIH1cbiAgICBjb25zdCBwcm9jZXNzID0gdGhpcy5fZ2V0Q3VycmVudFByb2Nlc3MoKVxuICAgIGlmIChwcm9jZXNzID09IG51bGwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlRoZXJlJ3Mgbm8gZGVidWcgcHJvY2VzcyB0byBjcmVhdGUgYSB0ZXJtaW5hbCBmb3IhXCIpXG4gICAgfVxuICAgIGNvbnN0IHsgYWRhcHRlclR5cGUsIHRhcmdldFVyaSB9ID0gcHJvY2Vzcy5jb25maWd1cmF0aW9uXG4gICAgY29uc3Qga2V5ID0gYHRhcmdldFVyaT0ke3RhcmdldFVyaX0mY29tbWFuZD0ke2FyZ3MuYXJnc1swXX1gXG5cbiAgICAvLyBFbnN1cmUgYW55IHByZXZpb3VzIGluc3RhbmNlcyBvZiB0aGlzIHNhbWUgdGFyZ2V0IGFyZSBjbG9zZWQgYmVmb3JlXG4gICAgLy8gb3BlbmluZyBhIG5ldyB0ZXJtaW5hbCB0YWIuIFdlIGRvbid0IHdhbnQgdGhlbSB0byBwaWxlIHVwIGlmIHRoZVxuICAgIC8vIHVzZXIga2VlcHMgcnVubmluZyB0aGUgc2FtZSBhcHAgb3ZlciBhbmQgb3Zlci5cbiAgICB0ZXJtaW5hbFNlcnZpY2UuY2xvc2Uoa2V5KVxuXG4gICAgY29uc3QgdGl0bGUgPSBhcmdzLnRpdGxlICE9IG51bGwgPyBhcmdzLnRpdGxlIDogZ2V0RGVidWdnZXJOYW1lKGFkYXB0ZXJUeXBlKVxuICAgIGNvbnN0IGhvc3RuYW1lID0gbnVjbGlkZVVyaS5nZXRIb3N0bmFtZU9wdCh0YXJnZXRVcmkpXG4gICAgY29uc3QgY3dkID0gaG9zdG5hbWUgPT0gbnVsbCA/IGFyZ3MuY3dkIDogbnVjbGlkZVVyaS5jcmVhdGVSZW1vdGVVcmkoaG9zdG5hbWUsIGFyZ3MuY3dkKVxuXG4gICAgY29uc3QgaW5mbzogVGVybWluYWxJbmZvID0ge1xuICAgICAga2V5LFxuICAgICAgdGl0bGUsXG4gICAgICBjd2QsXG4gICAgICBjb21tYW5kOiB7XG4gICAgICAgIGZpbGU6IGFyZ3MuYXJnc1swXSxcbiAgICAgICAgYXJnczogYXJncy5hcmdzLnNsaWNlKDEpLFxuICAgICAgfSxcbiAgICAgIGVudmlyb25tZW50VmFyaWFibGVzOiBhcmdzLmVudiAhPSBudWxsID8gbWFwRnJvbU9iamVjdChhcmdzLmVudikgOiB1bmRlZmluZWQsXG4gICAgICBwcmVzZXJ2ZWRDb21tYW5kczogW1xuICAgICAgICBcImRlYnVnZ2VyOmNvbnRpbnVlLWRlYnVnZ2luZ1wiLFxuICAgICAgICBcImRlYnVnZ2VyOnN0b3AtZGVidWdnaW5nXCIsXG4gICAgICAgIFwiZGVidWdnZXI6cmVzdGFydC1kZWJ1Z2dpbmdcIixcbiAgICAgICAgXCJkZWJ1Z2dlcjpzdGVwLW92ZXJcIixcbiAgICAgICAgXCJkZWJ1Z2dlcjpzdGVwLWludG9cIixcbiAgICAgICAgXCJkZWJ1Z2dlcjpzdGVwLW91dFwiLFxuICAgICAgXSxcbiAgICAgIHJlbWFpbk9uQ2xlYW5FeGl0OiB0cnVlLFxuICAgICAgaWNvbjogXCJudWNsaWNvbi1kZWJ1Z2dlclwiLFxuICAgICAgZGVmYXVsdExvY2F0aW9uOiBcImJvdHRvbVwiLFxuICAgIH1cbiAgICBjb25zdCB0ZXJtaW5hbDogVGVybWluYWxJbnN0YW5jZSA9IGF3YWl0IHRlcm1pbmFsU2VydmljZS5vcGVuKGluZm8pXG5cbiAgICB0ZXJtaW5hbC5zZXRQcm9jZXNzRXhpdENhbGxiYWNrKCgpID0+IHtcbiAgICAgIC8vIFRoaXMgY2FsbGJhY2sgaXMgaW52b2tlZCBpZiB0aGUgdGFyZ2V0IHByb2Nlc3MgZGllcyBmaXJzdCwgZW5zdXJpbmdcbiAgICAgIC8vIHdlIHRlYXIgZG93biB0aGUgZGVidWdnZXIuXG4gICAgICB0aGlzLnN0b3BQcm9jZXNzKHByb2Nlc3MpXG4gICAgfSlcblxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoKCkgPT4ge1xuICAgICAgLy8gVGhpcyB0ZXJtaW5hdGlvbiBwYXRoIGlzIGludm9rZWQgaWYgdGhlIGRlYnVnZ2VyIGRpZXMgZmlyc3QsIGVuc3VyaW5nXG4gICAgICAvLyB3ZSB0ZXJtaW5hdGUgdGhlIHRhcmdldCBwcm9jZXNzLiBUaGlzIGNhbiBoYXBwZW4gaWYgdGhlIHVzZXIgaGl0cyBzdG9wLFxuICAgICAgLy8gb3IgaWYgdGhlIGRlYnVnZ2VyIGNyYXNoZXMuXG4gICAgICB0ZXJtaW5hbC5zZXRQcm9jZXNzRXhpdENhbGxiYWNrKCgpID0+IHt9KVxuICAgICAgdGVybWluYWwudGVybWluYXRlUHJvY2VzcygpXG4gICAgfSlcblxuICAgIGNvbnN0IHNwYXduID0gb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbigoY2IpID0+IHRlcm1pbmFsLm9uU3Bhd24oY2IpKVxuICAgIHJldHVybiBzcGF3bi50YWtlKDEpLnRvUHJvbWlzZSgpXG4gIH1cblxuICBjYW5SZXN0YXJ0UHJvY2VzcygpOiBib29sZWFuIHtcbiAgICBjb25zdCBwcm9jZXNzID0gdGhpcy5fZ2V0Q3VycmVudFByb2Nlc3MoKVxuICAgIHJldHVybiBwcm9jZXNzICE9IG51bGwgJiYgcHJvY2Vzcy5jb25maWd1cmF0aW9uLmlzUmVzdGFydGFibGUgPT09IHRydWVcbiAgfVxuXG4gIGFzeW5jIHJlc3RhcnRQcm9jZXNzKHByb2Nlc3M6IElQcm9jZXNzKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHByb2Nlc3Muc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNSZXN0YXJ0UmVxdWVzdCkge1xuICAgICAgYXdhaXQgcHJvY2Vzcy5zZXNzaW9uLmN1c3RvbShcInJlc3RhcnRcIiwgbnVsbClcbiAgICB9XG4gICAgYXdhaXQgcHJvY2Vzcy5zZXNzaW9uLmRpc2Nvbm5lY3QodHJ1ZSlcbiAgICBhd2FpdCBzbGVlcCgzMDApXG4gICAgYXdhaXQgdGhpcy5zdGFydERlYnVnZ2luZyhwcm9jZXNzLmNvbmZpZ3VyYXRpb24pXG4gIH1cblxuICAvKipcbiAgICogU3RhcnRzIGRlYnVnZ2luZy4gSWYgdGhlIGNvbmZpZ09yTmFtZSBpcyBub3QgcGFzc2VkIHVzZXMgdGhlIHNlbGVjdGVkIGNvbmZpZ3VyYXRpb24gaW4gdGhlIGRlYnVnIGRyb3Bkb3duLlxuICAgKiBBbHNvIHNhdmVzIGFsbCBmaWxlcywgbWFuYWdlcyBpZiBjb21wb3VuZHMgYXJlIHByZXNlbnQgaW4gdGhlIGNvbmZpZ3VyYXRpb25cbiAgICogYW5kIHJlc29sdmVkcyBjb25maWd1cmF0aW9ucyB2aWEgRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXJzLlxuICAgKi9cbiAgYXN5bmMgc3RhcnREZWJ1Z2dpbmcoY29uZmlnOiBJUHJvY2Vzc0NvbmZpZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMuX3RpbWVyID0gc3RhcnRUcmFja2luZyhcImRlYnVnZ2VyLWF0b206c3RhcnREZWJ1Z2dpbmdcIilcblxuICAgIC8vIE9wZW4gdGhlIGNvbnNvbGUgd2luZG93IGlmIGl0J3Mgbm90IGFscmVhZHkgb3BlbmVkLlxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBudWNsaWRlLWludGVybmFsL2F0b20tYXBpc1xuICAgIGF0b20ud29ya3NwYWNlLm9wZW4oQ09OU09MRV9WSUVXX1VSSSwgeyBzZWFyY2hBbGxQYW5lczogdHJ1ZSB9KVxuXG4gICAgYXdhaXQgdGhpcy5fZG9DcmVhdGVQcm9jZXNzKGNvbmZpZywgdXVpZC52NCgpKVxuXG4gICAgaWYgKHRoaXMuX21vZGVsLmdldFByb2Nlc3NlcygpLmxlbmd0aCA+IDEpIHtcbiAgICAgIGNvbnN0IGRlYnVnZ2VyVHlwZXMgPSB0aGlzLl9tb2RlbFxuICAgICAgICAuZ2V0UHJvY2Vzc2VzKClcbiAgICAgICAgLm1hcCgoeyBjb25maWd1cmF0aW9uIH0pID0+IGAke2NvbmZpZ3VyYXRpb24uYWRhcHRlclR5cGV9OiAke2NvbmZpZ3VyYXRpb24ucHJvY2Vzc05hbWUgfHwgXCJcIn1gKVxuICAgICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX01VTFRJVEFSR0VULCB7XG4gICAgICAgIHByb2Nlc3Nlc0NvdW50OiB0aGlzLl9tb2RlbC5nZXRQcm9jZXNzZXMoKS5sZW5ndGgsXG4gICAgICAgIGRlYnVnZ2VyVHlwZXMsXG4gICAgICB9KVxuICAgIH1cbiAgfVxuXG4gIF9vblNlc3Npb25FbmQgPSBhc3luYyAoc2Vzc2lvbjogVnNEZWJ1Z1Nlc3Npb24pOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfU1RPUClcbiAgICBjb25zdCByZW1vdmVkUHJvY2Vzc2VzID0gdGhpcy5fbW9kZWwucmVtb3ZlUHJvY2VzcyhzZXNzaW9uLmdldElkKCkpXG4gICAgaWYgKHJlbW92ZWRQcm9jZXNzZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAvLyBJZiB0aGUgcHJvY2VzcyBpcyBhbHJlYWR5IHJlbW92ZWQgZnJvbSB0aGUgbW9kZWwsIHRoZXJlJ3Mgbm90aGluZyBlbHNlXG4gICAgICAvLyB0byBkby4gV2UgY2FuIHJlLWVudGVyIGhlcmUgaWYgdGhlIGRlYnVnIHNlc3Npb24gZW5kcyBiZWZvcmUgdGhlXG4gICAgICAvLyBkZWJ1ZyBhZGFwdGVyIHByb2Nlc3MgdGVybWluYXRlcy5cbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIC8vIE1hcmsgYWxsIHJlbW92ZWQgcHJvY2Vzc2VzIGFzIFNUT1BQSU5HLlxuICAgIHJlbW92ZWRQcm9jZXNzZXMuZm9yRWFjaCgocHJvY2VzcykgPT4ge1xuICAgICAgcHJvY2Vzcy5zZXRTdG9wUGVuZGluZygpXG4gICAgICB0aGlzLl9vbkRlYnVnZ2VyTW9kZUNoYW5nZWQocHJvY2VzcywgRGVidWdnZXJNb2RlLlNUT1BQSU5HKVxuICAgIH0pXG5cbiAgICAvLyBFbnN1cmUgYWxsIHRoZSBhZGFwdGVycyBhcmUgdGVybWluYXRlZC5cbiAgICBhd2FpdCBzZXNzaW9uLmRpc2Nvbm5lY3QoZmFsc2UgLyogcmVzdGFydCAqLywgdHJ1ZSAvKiBmb3JjZSAqLylcblxuICAgIGlmICh0aGlzLl9tb2RlbC5nZXRQcm9jZXNzZXMoKSA9PSBudWxsIHx8IHRoaXMuX21vZGVsLmdldFByb2Nlc3NlcygpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICAgICAgdGhpcy5fY29uc29sZURpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuXG4gICAgICAvLyBObyBwcm9jZXNzZXMgcmVtYWluaW5nLCBjbGVhciBwcm9jZXNzIGZvY3VzLlxuICAgICAgdGhpcy5fdmlld01vZGVsLnNldEZvY3VzZWRQcm9jZXNzKG51bGwsIGZhbHNlKVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAodGhpcy5fdmlld01vZGVsLmZvY3VzZWRQcm9jZXNzICE9IG51bGwgJiYgdGhpcy5fdmlld01vZGVsLmZvY3VzZWRQcm9jZXNzLmdldElkKCkgPT09IHNlc3Npb24uZ2V0SWQoKSkge1xuICAgICAgICAvLyBUaGUgcHJvY2VzcyB0aGF0IGp1c3QgZXhpdGVkIHdhcyB0aGUgZm9jdXNlZCBwcm9jZXNzLCBzbyB3ZSBuZWVkXG4gICAgICAgIC8vIHRvIG1vdmUgZm9jdXMgdG8gYW5vdGhlciBwcm9jZXNzLiBJZiB0aGVyZSdzIGEgcHJvY2VzcyB3aXRoIGFcbiAgICAgICAgLy8gc3RvcHBlZCB0aHJlYWQsIGNob29zZSB0aGF0LiBPdGhlcndpc2UgY2hvb3NlIHRoZSBsYXN0IHByb2Nlc3MuXG4gICAgICAgIGNvbnN0IGFsbFByb2Nlc3NlcyA9IHRoaXMuX21vZGVsLmdldFByb2Nlc3NlcygpXG4gICAgICAgIGNvbnN0IHByb2Nlc3NUb0ZvY3VzID1cbiAgICAgICAgICBhbGxQcm9jZXNzZXMuZmlsdGVyKChwKSA9PiBwLmdldEFsbFRocmVhZHMoKS5zb21lKCh0KSA9PiB0LnN0b3BwZWQpKVswXSB8fFxuICAgICAgICAgIGFsbFByb2Nlc3Nlc1thbGxQcm9jZXNzZXMubGVuZ3RoIC0gMV1cbiAgICAgICAgdGhpcy5fdmlld01vZGVsLnNldEZvY3VzZWRQcm9jZXNzKHByb2Nlc3NUb0ZvY3VzLCBmYWxzZSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZW1vdmVkUHJvY2Vzc2VzLmZvckVhY2goKHByb2Nlc3MpID0+IHtcbiAgICAgIHRoaXMuX29uRGVidWdnZXJNb2RlQ2hhbmdlZChwcm9jZXNzLCBEZWJ1Z2dlck1vZGUuU1RPUFBFRClcbiAgICB9KVxuXG4gICAgY29uc3QgY3JlYXRlQ29uc29sZSA9IGdldENvbnNvbGVTZXJ2aWNlKClcbiAgICBpZiAoY3JlYXRlQ29uc29sZSAhPSBudWxsKSB7XG4gICAgICBjb25zdCBuYW1lID0gXCJOdWNsaWRlIERlYnVnZ2VyXCJcbiAgICAgIGNvbnN0IGNvbnNvbGVBcGkgPSBjcmVhdGVDb25zb2xlKHtcbiAgICAgICAgaWQ6IG5hbWUsXG4gICAgICAgIG5hbWUsXG4gICAgICB9KVxuXG4gICAgICByZW1vdmVkUHJvY2Vzc2VzLmZvckVhY2goKHApID0+XG4gICAgICAgIGNvbnNvbGVBcGkuYXBwZW5kKHtcbiAgICAgICAgICB0ZXh0OlxuICAgICAgICAgICAgXCJQcm9jZXNzIGV4aXRlZFwiICsgKHAuY29uZmlndXJhdGlvbi5wcm9jZXNzTmFtZSA9PSBudWxsID8gXCJcIiA6IFwiIChcIiArIHAuY29uZmlndXJhdGlvbi5wcm9jZXNzTmFtZSArIFwiKVwiKSxcbiAgICAgICAgICBsZXZlbDogXCJsb2dcIixcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fdGltZXIgIT0gbnVsbCkge1xuICAgICAgdGhpcy5fdGltZXIub25TdWNjZXNzKClcbiAgICAgIHRoaXMuX3RpbWVyID0gbnVsbFxuICAgIH1cbiAgfVxuXG4gIGdldE1vZGVsKCk6IElNb2RlbCB7XG4gICAgcmV0dXJuIHRoaXMuX21vZGVsXG4gIH1cblxuICBhc3luYyBfc2VuZEFsbEJyZWFrcG9pbnRzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgZGlzdGluY3QodGhpcy5fbW9kZWwuZ2V0QnJlYWtwb2ludHMoKSwgKGJwKSA9PiBicC51cmkpLm1hcCgoYnApID0+IHRoaXMuX3NlbmRCcmVha3BvaW50cyhicC51cmksIGZhbHNlKSlcbiAgICApXG4gICAgYXdhaXQgdGhpcy5fc2VuZEZ1bmN0aW9uQnJlYWtwb2ludHMoKVxuICAgIC8vIHNlbmQgZXhjZXB0aW9uIGJyZWFrcG9pbnRzIGF0IHRoZSBlbmQgc2luY2Ugc29tZSBkZWJ1ZyBhZGFwdGVycyByZWx5IG9uIHRoZSBvcmRlclxuICAgIGF3YWl0IHRoaXMuX3NlbmRFeGNlcHRpb25CcmVha3BvaW50cygpXG4gIH1cblxuICBhc3luYyBfc2VuZEJyZWFrcG9pbnRzKHVyaTogc3RyaW5nLCBzb3VyY2VNb2RpZmllZD86IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHByb2Nlc3MgPSB0aGlzLl9nZXRDdXJyZW50UHJvY2VzcygpXG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2dldEN1cnJlbnRTZXNzaW9uKClcbiAgICBpZiAocHJvY2VzcyA9PSBudWxsIHx8IHNlc3Npb24gPT0gbnVsbCB8fCAhc2Vzc2lvbi5pc1JlYWR5Rm9yQnJlYWtwb2ludHMoKSkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgYnJlYWtwb2ludHNUb1NlbmQgPSAoKHNvdXJjZU1vZGlmaWVkID8gdGhpcy5fbW9kZWwuZ2V0VUlCcmVha3BvaW50cygpIDogdGhpcy5fbW9kZWwuZ2V0QnJlYWtwb2ludHMoKSkuZmlsdGVyKFxuICAgICAgKGJwKSA9PiB0aGlzLl9tb2RlbC5hcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpICYmIGJwLmVuYWJsZWQgJiYgYnAudXJpID09PSB1cmlcbiAgICApOiBhbnkpXG5cbiAgICBjb25zdCByYXdTb3VyY2UgPSBwcm9jZXNzLmdldFNvdXJjZSh7XG4gICAgICBwYXRoOiB1cmksXG4gICAgICBuYW1lOiBudWNsaWRlVXJpLmJhc2VuYW1lKHVyaSksXG4gICAgfSkucmF3XG5cbiAgICBpZiAoIXNvdXJjZU1vZGlmaWVkICYmIGJyZWFrcG9pbnRzVG9TZW5kLmxlbmd0aCA+IDAgJiYgIXJhd1NvdXJjZS5hZGFwdGVyRGF0YSAmJiBicmVha3BvaW50c1RvU2VuZFswXS5hZGFwdGVyRGF0YSkge1xuICAgICAgcmF3U291cmNlLmFkYXB0ZXJEYXRhID0gYnJlYWtwb2ludHNUb1NlbmRbMF0uYWRhcHRlckRhdGFcbiAgICB9XG5cbiAgICAvLyBUaGUgVUkgaXMgMC1iYXNlZCwgd2hpbGUgVlNQIGlzIDEtYmFzZWQuXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzZXNzaW9uLnNldEJyZWFrcG9pbnRzKHtcbiAgICAgIHNvdXJjZTogKHJhd1NvdXJjZTogYW55KSxcbiAgICAgIGxpbmVzOiBicmVha3BvaW50c1RvU2VuZC5tYXAoKGJwKSA9PiBicC5saW5lKSxcbiAgICAgIGJyZWFrcG9pbnRzOiBicmVha3BvaW50c1RvU2VuZC5tYXAoKGJwKSA9PiB7XG4gICAgICAgIGNvbnN0IGJwVG9TZW5kOiBPYmplY3QgPSB7XG4gICAgICAgICAgbGluZTogYnAubGluZSxcbiAgICAgICAgfVxuICAgICAgICAvLyBDb2x1bW4gYW5kIGNvbmRpdGlvbiBhcmUgb3B0aW9uYWwgaW4gdGhlIHByb3RvY29sLCBidXQgc2hvdWxkXG4gICAgICAgIC8vIG9ubHkgYmUgaW5jbHVkZWQgb24gdGhlIG9iamVjdCBzZW50IHRvIHRoZSBkZWJ1ZyBhZGFwdGVyIGlmXG4gICAgICAgIC8vIHRoZXkgaGF2ZSB2YWx1ZXMgdGhhdCBleGlzdC5cbiAgICAgICAgaWYgKGJwLmNvbHVtbiAhPSBudWxsICYmIGJwLmNvbHVtbiA+IDApIHtcbiAgICAgICAgICBicFRvU2VuZC5jb2x1bW4gPSBicC5jb2x1bW5cbiAgICAgICAgfVxuICAgICAgICBpZiAoYnAuY29uZGl0aW9uICE9IG51bGwgJiYgYnAuY29uZGl0aW9uICE9PSBcIlwiKSB7XG4gICAgICAgICAgYnBUb1NlbmQuY29uZGl0aW9uID0gYnAuY29uZGl0aW9uXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGJwLmxvZ01lc3NhZ2UgIT0gbnVsbCAmJiBicC5sb2dNZXNzYWdlICE9PSBcIlwiKSB7XG4gICAgICAgICAgYnBUb1NlbmQubG9nTWVzc2FnZSA9IGJwLmxvZ01lc3NhZ2VcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYnBUb1NlbmRcbiAgICAgIH0pLFxuICAgICAgc291cmNlTW9kaWZpZWQsXG4gICAgfSlcbiAgICBpZiAocmVzcG9uc2UgPT0gbnVsbCB8fCByZXNwb25zZS5ib2R5ID09IG51bGwpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IGRhdGE6IHsgW2lkOiBzdHJpbmddOiBEZWJ1Z1Byb3RvY29sLkJyZWFrcG9pbnQgfSA9IHt9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBicmVha3BvaW50c1RvU2VuZC5sZW5ndGg7IGkrKykge1xuICAgICAgLy8gSWYgc291cmNlTW9kaWZpZWQgPT09IHRydWUsIHdlJ3JlIGRlYWxpbmcgd2l0aCBuZXcgVUkgYnJlYWtwb2ludHMgdGhhdFxuICAgICAgLy8gcmVwcmVzZW50IHRoZSBuZXcgbG9jYXRpb24ocykgdGhlIGJyZWFrcG9pbnRzIGVuZGVkIHVwIGluIGR1ZSB0byB0aGVcbiAgICAgIC8vIGZpbGUgY29udGVudHMgY2hhbmdpbmcuIFRoZXNlIGFyZSBvZiB0eXBlIElVSUJyZWFrcG9pbnQuICBPdGhlcndpc2UsXG4gICAgICAvLyB3ZSBoYXZlIHByb2Nlc3MgYnJlYWtwb2ludHMgb2YgdHlwZSBJQnJlYWtwb2ludCBoZXJlLiBUaGVzZSB0eXBlcyBib3RoIGhhdmVcbiAgICAgIC8vIGFuIElELCBidXQgd2UgZ2V0IGl0IGEgbGl0dGxlIGRpZmZlcmVudGx5LlxuICAgICAgY29uc3QgYnBJZCA9IHNvdXJjZU1vZGlmaWVkID8gYnJlYWtwb2ludHNUb1NlbmRbaV0uaWQgOiBicmVha3BvaW50c1RvU2VuZFtpXS5nZXRJZCgpXG5cbiAgICAgIGRhdGFbYnBJZF0gPSByZXNwb25zZS5ib2R5LmJyZWFrcG9pbnRzW2ldXG4gICAgICBpZiAoIWJyZWFrcG9pbnRzVG9TZW5kW2ldLmNvbHVtbikge1xuICAgICAgICAvLyBJZiB0aGVyZSB3YXMgbm8gY29sdW1uIHNlbnQgaWdub3JlIHRoZSBicmVha3BvaW50IGNvbHVtbiByZXNwb25zZSBmcm9tIHRoZSBhZGFwdGVyXG4gICAgICAgIGRhdGFbYnBJZF0uY29sdW1uID0gdW5kZWZpbmVkXG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5fbW9kZWwudXBkYXRlUHJvY2Vzc0JyZWFrcG9pbnRzKHByb2Nlc3MsIGRhdGEpXG4gIH1cblxuICBfZ2V0Q3VycmVudFNlc3Npb24oKTogP1ZzRGVidWdTZXNzaW9uIHtcbiAgICByZXR1cm4gdGhpcy5fdmlld01vZGVsLmZvY3VzZWRQcm9jZXNzID09IG51bGwgPyBudWxsIDogKHRoaXMuX3ZpZXdNb2RlbC5mb2N1c2VkUHJvY2Vzcy5zZXNzaW9uOiBhbnkpXG4gIH1cblxuICBfZ2V0Q3VycmVudFByb2Nlc3MoKTogP0lQcm9jZXNzIHtcbiAgICByZXR1cm4gdGhpcy5fdmlld01vZGVsLmZvY3VzZWRQcm9jZXNzXG4gIH1cblxuICBhc3luYyBfc2VuZEZ1bmN0aW9uQnJlYWtwb2ludHMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2dldEN1cnJlbnRTZXNzaW9uKClcbiAgICBpZiAoc2Vzc2lvbiA9PSBudWxsIHx8ICFzZXNzaW9uLmlzUmVhZHlGb3JCcmVha3BvaW50cygpIHx8ICFzZXNzaW9uLmdldENhcGFiaWxpdGllcygpLnN1cHBvcnRzRnVuY3Rpb25CcmVha3BvaW50cykge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgYnJlYWtwb2ludHNUb1NlbmQ6IGFueSA9IHRoaXMuX21vZGVsXG4gICAgICAuZ2V0RnVuY3Rpb25CcmVha3BvaW50cygpXG4gICAgICAuZmlsdGVyKChmYnApID0+IGZicC5lbmFibGVkICYmIHRoaXMuX21vZGVsLmFyZUJyZWFrcG9pbnRzQWN0aXZhdGVkKCkpXG4gICAgY29uc3QgcmVzcG9uc2U6IERlYnVnUHJvdG9jb2wuU2V0RnVuY3Rpb25CcmVha3BvaW50c1Jlc3BvbnNlID0gYXdhaXQgc2Vzc2lvbi5zZXRGdW5jdGlvbkJyZWFrcG9pbnRzKHtcbiAgICAgIGJyZWFrcG9pbnRzOiBicmVha3BvaW50c1RvU2VuZCxcbiAgICB9KVxuICAgIGlmIChyZXNwb25zZSA9PSBudWxsIHx8IHJlc3BvbnNlLmJvZHkgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgZGF0YSA9IHt9XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBicmVha3BvaW50c1RvU2VuZC5sZW5ndGg7IGkrKykge1xuICAgICAgZGF0YVticmVha3BvaW50c1RvU2VuZFtpXS5nZXRJZCgpXSA9IHJlc3BvbnNlLmJvZHkuYnJlYWtwb2ludHNbaV1cbiAgICB9XG5cbiAgICB0aGlzLl9tb2RlbC51cGRhdGVGdW5jdGlvbkJyZWFrcG9pbnRzKGRhdGEpXG4gIH1cblxuICBhc3luYyBfc2VuZEV4Y2VwdGlvbkJyZWFrcG9pbnRzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLl9nZXRDdXJyZW50U2Vzc2lvbigpXG4gICAgaWYgKHNlc3Npb24gPT0gbnVsbCB8fCAhc2Vzc2lvbi5pc1JlYWR5Rm9yQnJlYWtwb2ludHMoKSB8fCB0aGlzLl9tb2RlbC5nZXRFeGNlcHRpb25CcmVha3BvaW50cygpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgZW5hYmxlZEV4Y2VwdGlvbkJwcyA9IHRoaXMuX21vZGVsLmdldEV4Y2VwdGlvbkJyZWFrcG9pbnRzKCkuZmlsdGVyKChleGIpID0+IGV4Yi5lbmFibGVkKVxuICAgIGF3YWl0IHNlc3Npb24uc2V0RXhjZXB0aW9uQnJlYWtwb2ludHMoe1xuICAgICAgZmlsdGVyczogZW5hYmxlZEV4Y2VwdGlvbkJwcy5tYXAoKGV4YikgPT4gZXhiLmZpbHRlciksXG4gICAgfSlcbiAgfVxuXG4gIF9ldmFsdWF0ZUV4cHJlc3Npb24oZXhwcmVzc2lvbjogSUV2YWx1YXRhYmxlRXhwcmVzc2lvbiwgbGV2ZWw6IExldmVsKSB7XG4gICAgY29uc3QgeyBmb2N1c2VkUHJvY2VzcywgZm9jdXNlZFN0YWNrRnJhbWUgfSA9IHRoaXMuX3ZpZXdNb2RlbFxuICAgIGlmIChmb2N1c2VkUHJvY2VzcyA9PSBudWxsKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoXCJDYW5ub3QgZXZhbHVhdGUgd2hpbGUgdGhlcmUgaXMgbm8gYWN0aXZlIGRlYnVnIHNlc3Npb25cIilcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBjb25zdCBzdWJzY3JpcHRpb24gPVxuICAgICAgLy8gV2UgZmlsdGVyIGhlcmUgYmVjYXVzZSB0aGUgZmlyc3QgdmFsdWUgaW4gdGhlIEJlaGF2aW9yU3ViamVjdCBpcyBudWxsIG5vIG1hdHRlciB3aGF0LCBhbmRcbiAgICAgIC8vIHdlIHdhbnQgdGhlIGNvbnNvbGUgdG8gdW5zdWJzY3JpYmUgdGhlIHN0cmVhbSBhZnRlciB0aGUgZmlyc3Qgbm9uLW51bGwgdmFsdWUuXG4gICAgICBldmFsdWF0ZUV4cHJlc3Npb25Bc1N0cmVhbShleHByZXNzaW9uLCBmb2N1c2VkUHJvY2VzcywgZm9jdXNlZFN0YWNrRnJhbWUsIFwicmVwbFwiKVxuICAgICAgICAuc2tpcCgxKSAvLyBTa2lwIHRoZSBmaXJzdCBwZW5kaW5nIHZhbHVlLlxuICAgICAgICAuc3Vic2NyaWJlKChyZXN1bHQpID0+IHtcbiAgICAgICAgICAvLyBFdmFsdWF0ZSBhbGwgd2F0Y2ggZXhwcmVzc2lvbnMgYW5kIGZldGNoIHZhcmlhYmxlcyBhZ2FpbiBzaW5jZSByZXBsIGV2YWx1YXRpb24gbWlnaHQgaGF2ZSBjaGFuZ2VkIHNvbWUuXG4gICAgICAgICAgdGhpcy5fdmlld01vZGVsLnNldEZvY3VzZWRTdGFja0ZyYW1lKHRoaXMuX3ZpZXdNb2RlbC5mb2N1c2VkU3RhY2tGcmFtZSwgZmFsc2UpXG5cbiAgICAgICAgICBpZiAocmVzdWx0LmlzRXJyb3IgfHwgcmVzdWx0LmlzUGVuZGluZyB8fCAhZXhwcmVzc2lvbi5hdmFpbGFibGUpIHtcbiAgICAgICAgICAgIGNvbnN0IG1lc3NhZ2U6IENvbnNvbGVNZXNzYWdlID0ge1xuICAgICAgICAgICAgICB0ZXh0OiBleHByZXNzaW9uLmdldFZhbHVlKCksXG4gICAgICAgICAgICAgIGxldmVsOiBcImVycm9yXCIsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLl9jb25zb2xlT3V0cHV0Lm5leHQobWVzc2FnZSlcbiAgICAgICAgICB9IGVsc2UgaWYgKGV4cHJlc3Npb24uaGFzQ2hpbGRyZW4oKSkge1xuICAgICAgICAgICAgdGhpcy5fY29uc29sZU91dHB1dC5uZXh0KHtcbiAgICAgICAgICAgICAgdGV4dDogXCJvYmplY3RcIixcbiAgICAgICAgICAgICAgZXhwcmVzc2lvbnM6IFtleHByZXNzaW9uXSxcbiAgICAgICAgICAgICAgbGV2ZWwsXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLl9jb25zb2xlT3V0cHV0Lm5leHQoe1xuICAgICAgICAgICAgICB0ZXh0OiBleHByZXNzaW9uLmdldFZhbHVlKCksXG4gICAgICAgICAgICAgIGxldmVsLFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5fY29uc29sZURpc3Bvc2FibGVzLnJlbW92ZShzdWJzY3JpcHRpb24pXG4gICAgICAgIH0pXG4gICAgdGhpcy5fY29uc29sZURpc3Bvc2FibGVzLmFkZChzdWJzY3JpcHRpb24pXG4gIH1cblxuICBfcmVnaXN0ZXJDb25zb2xlRXhlY3V0b3IoKSB7XG4gICAgdGhpcy5fY29uc29sZURpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoKVxuICAgIGNvbnN0IHJlZ2lzdGVyRXhlY3V0b3IgPSBnZXRDb25zb2xlUmVnaXN0ZXJFeGVjdXRvcigpXG4gICAgaWYgKHJlZ2lzdGVyRXhlY3V0b3IgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyKClcbiAgICBjb25zdCBTQ09QRV9DSEFOR0VEID0gXCJTQ09QRV9DSEFOR0VEXCJcbiAgICBjb25zdCB2aWV3TW9kZWwgPSB0aGlzLl92aWV3TW9kZWxcbiAgICBjb25zdCBldmFsdWF0ZUV4cHJlc3Npb24gPSB0aGlzLl9ldmFsdWF0ZUV4cHJlc3Npb24uYmluZCh0aGlzKVxuICAgIGNvbnN0IGV4ZWN1dG9yID0ge1xuICAgICAgaWQ6IFwiZGVidWdnZXJcIixcbiAgICAgIG5hbWU6IFwiRGVidWdnZXJcIixcbiAgICAgIHNjb3BlTmFtZTogKCkgPT4ge1xuICAgICAgICBpZiAodmlld01vZGVsLmZvY3VzZWRQcm9jZXNzICE9IG51bGwgJiYgdmlld01vZGVsLmZvY3VzZWRQcm9jZXNzLmNvbmZpZ3VyYXRpb24uZ3JhbW1hck5hbWUgIT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiB2aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3MuY29uZmlndXJhdGlvbi5ncmFtbWFyTmFtZVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBcInRleHQucGxhaW5cIlxuICAgICAgfSxcbiAgICAgIG9uRGlkQ2hhbmdlU2NvcGVOYW1lKGNhbGxiYWNrOiAoKSA9PiBtaXhlZCk6IElEaXNwb3NhYmxlIHtcbiAgICAgICAgcmV0dXJuIGVtaXR0ZXIub24oU0NPUEVfQ0hBTkdFRCwgY2FsbGJhY2spXG4gICAgICB9LFxuICAgICAgc2VuZChleHByZXNzaW9uOiBzdHJpbmcpIHtcbiAgICAgICAgZXZhbHVhdGVFeHByZXNzaW9uKG5ldyBFeHByZXNzaW9uKGV4cHJlc3Npb24pLCBcImxvZ1wiKVxuICAgICAgfSxcbiAgICAgIG91dHB1dDogdGhpcy5fY29uc29sZU91dHB1dCxcbiAgICB9XG5cbiAgICB0aGlzLl9jb25zb2xlRGlzcG9zYWJsZXMuYWRkKFxuICAgICAgZW1pdHRlcixcbiAgICAgIHRoaXMuX3ZpZXdNb2RlbC5vbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMoKCkgPT4ge1xuICAgICAgICBlbWl0dGVyLmVtaXQoU0NPUEVfQ0hBTkdFRClcbiAgICAgIH0pXG4gICAgKVxuICAgIHRoaXMuX2NvbnNvbGVEaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJFeGVjdXRvcihleGVjdXRvcikpXG4gIH1cblxuICBkaXNwb3NlKCk6IHZvaWQge1xuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICAgIHRoaXMuX2NvbnNvbGVEaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gIH1cbn1cblxuY2xhc3MgRGVidWdTb3VyY2VUZXh0QnVmZmZlciBleHRlbmRzIFRleHRCdWZmZXIge1xuICBfdXJpOiBzdHJpbmdcblxuICBjb25zdHJ1Y3Rvcihjb250ZW50czogc3RyaW5nLCB1cmk6IHN0cmluZykge1xuICAgIHN1cGVyKGNvbnRlbnRzKVxuICAgIHRoaXMuX3VyaSA9IHVyaVxuICB9XG5cbiAgZ2V0VXJpKCkge1xuICAgIHJldHVybiB0aGlzLl91cmlcbiAgfVxuXG4gIGdldFBhdGgoKSB7XG4gICAgcmV0dXJuIHRoaXMuX3VyaVxuICB9XG5cbiAgaXNNb2RpZmllZCgpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxufVxuIl19