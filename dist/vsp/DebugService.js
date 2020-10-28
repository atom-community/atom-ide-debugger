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

var _rxjs = require("rxjs");

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
    this._consoleOutput = new _rxjs.Subject();
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

        return _rxjs.Observable.empty();
      }

      return _rxjs.Observable.fromPromise(stackFrame.openInEditor()).switchMap(editor => {
        if (editor == null) {
          const uri = stackFrame.source.uri;
          const errorMsg = uri == null || uri === "" ? "The selected stack frame has no known source location" : `Nuclide could not open ${uri}`;
          atom.notifications.addError(errorMsg);
          return _rxjs.Observable.empty();
        }

        return _rxjs.Observable.of({
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

    const toFocusThreads = new _rxjs.Subject();

    const observeContinuedTo = threadId => {
      return session.observeContinuedEvents().filter(continued => continued.body.allThreadsContinued || threadId != null && threadId === continued.body.threadId).take(1);
    };

    this._sessionEndDisposables.add(session.observeStopEvents().subscribe(() => {
      this._onDebuggerModeChanged(process, _constants.DebuggerMode.PAUSED);
    }), session.observeEvaluations().subscribe(() => {
      this._viewModel.evaluateContextChanged();
    }), session.observeStopEvents().flatMap(event => _rxjs.Observable.fromPromise(threadFetcher()).ignoreElements().concat(_rxjs.Observable.of(event)).catch(error => {
      (0, _utils.onUnexpectedError)(error);
      return _rxjs.Observable.empty();
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
        return _rxjs.Observable.empty();
      }

      const thisThreadIsFocused = this._viewModel.focusedStackFrame != null && this._viewModel.focusedStackFrame.thread.getId() === thread.getId(); // Fetches the first call frame in this stack to allow the UI to
      // update the thread list. Additional frames will be fetched by the UI
      // on demand, only if they are needed.
      // If this thread is the currently focused thread, fetch the entire
      // stack because the UI will certainly need it, and we need it here to
      // try and auto-focus a frame.

      return _rxjs.Observable.fromPromise(this._model.refreshCallStack(thread, thisThreadIsFocused)).ignoreElements().concat(_rxjs.Observable.of(thread)) // Avoid focusing a continued thread.
      .takeUntil(observeContinuedTo(thread.threadId)) // Verify the thread is still stopped.
      .filter(() => thread.stopped).catch(error => {
        (0, _utils.onUnexpectedError)(error);
        return _rxjs.Observable.empty();
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
        return _rxjs.Observable.of({
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
          return _rxjs.Observable.empty();
        } else {
          return _rxjs.Observable.of({
            reason,
            breakpoint,
            sourceBreakpoint,
            functionBreakpoint
          });
        }
      }).take(1).timeout(MAX_BREAKPOINT_EVENT_DELAY_MS).catch(error => {
        if (error instanceof _rxjs.TimeoutError) {
          _logger.default.error("Timed out breakpoint event handler", process.configuration.adapterType, reason, breakpoint);
        }

        return _rxjs.Observable.empty();
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnU2VydmljZS5qcyJdLCJuYW1lcyI6WyJDT05TT0xFX1ZJRVdfVVJJIiwiQ1VTVE9NX0RFQlVHX0VWRU5UIiwiQ0hBTkdFX0RFQlVHX01PREUiLCJTVEFSVF9ERUJVR19TRVNTSU9OIiwiQUNUSVZFX1RIUkVBRF9DSEFOR0VEIiwiREVCVUdHRVJfRk9DVVNfQ0hBTkdFRCIsIkNIQU5HRV9FWFBSRVNTSU9OX0NPTlRFWFQiLCJNQVhfQlJFQUtQT0lOVF9FVkVOVF9ERUxBWV9NUyIsIlZpZXdNb2RlbCIsImNvbnN0cnVjdG9yIiwiX2ZvY3VzZWRQcm9jZXNzIiwiX2ZvY3VzZWRUaHJlYWQiLCJfZm9jdXNlZFN0YWNrRnJhbWUiLCJfZW1pdHRlciIsIkVtaXR0ZXIiLCJmb2N1c2VkUHJvY2VzcyIsImZvY3VzZWRUaHJlYWQiLCJmb2N1c2VkU3RhY2tGcmFtZSIsIm9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cyIsImNhbGxiYWNrIiwib24iLCJvbkRpZENoYW5nZUV4cHJlc3Npb25Db250ZXh0IiwiX2Nob29zZUZvY3VzVGhyZWFkIiwicHJvY2VzcyIsInRocmVhZHMiLCJnZXRBbGxUaHJlYWRzIiwiaWQiLCJnZXRJZCIsImN1cnJlbnRGb2N1c2VkVGhyZWFkIiwiZmlsdGVyIiwidCIsInN0b3BwZWQiLCJsZW5ndGgiLCJzdG9wcGVkVGhyZWFkcyIsIl9jaG9vc2VGb2N1c1N0YWNrRnJhbWUiLCJ0aHJlYWQiLCJjdXJyZW50Rm9jdXNlZEZyYW1lIiwiZ2V0Q2FjaGVkQ2FsbFN0YWNrIiwiZmluZCIsImYiLCJnZXRDYWxsU3RhY2tUb3BGcmFtZSIsIl9zZXRGb2N1cyIsInN0YWNrRnJhbWUiLCJleHBsaWNpdCIsIm5ld1Byb2Nlc3MiLCJmb2N1c0NoYW5nZWQiLCJlbWl0IiwiZXZhbHVhdGVDb250ZXh0Q2hhbmdlZCIsInNldEZvY3VzZWRQcm9jZXNzIiwibmV3Rm9jdXNUaHJlYWQiLCJuZXdGb2N1c0ZyYW1lIiwic2V0Rm9jdXNlZFRocmVhZCIsInNldEZvY3VzZWRTdGFja0ZyYW1lIiwiZ2V0RGVidWdnZXJOYW1lIiwiYWRhcHRlclR5cGUiLCJEZWJ1Z1NlcnZpY2UiLCJzdGF0ZSIsIl9tb2RlbCIsIl9kaXNwb3NhYmxlcyIsIl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMiLCJfY29uc29sZURpc3Bvc2FibGVzIiwiX3ZpZXdNb2RlbCIsIl90aW1lciIsIl9icmVha3BvaW50c1RvU2VuZE9uU2F2ZSIsIl9jb25zb2xlT3V0cHV0IiwiX3J1bkluVGVybWluYWwiLCJhcmdzIiwidGVybWluYWxTZXJ2aWNlIiwiRXJyb3IiLCJfZ2V0Q3VycmVudFByb2Nlc3MiLCJ0YXJnZXRVcmkiLCJjb25maWd1cmF0aW9uIiwia2V5IiwiY2xvc2UiLCJ0aXRsZSIsImhvc3RuYW1lIiwibnVjbGlkZVVyaSIsImdldEhvc3RuYW1lT3B0IiwiY3dkIiwiY3JlYXRlUmVtb3RlVXJpIiwiaW5mbyIsImNvbW1hbmQiLCJmaWxlIiwic2xpY2UiLCJlbnZpcm9ubWVudFZhcmlhYmxlcyIsImVudiIsInVuZGVmaW5lZCIsInByZXNlcnZlZENvbW1hbmRzIiwicmVtYWluT25DbGVhbkV4aXQiLCJpY29uIiwiZGVmYXVsdExvY2F0aW9uIiwidGVybWluYWwiLCJvcGVuIiwic2V0UHJvY2Vzc0V4aXRDYWxsYmFjayIsInN0b3BQcm9jZXNzIiwiYWRkIiwidGVybWluYXRlUHJvY2VzcyIsInNwYXduIiwiY2IiLCJvblNwYXduIiwidGFrZSIsInRvUHJvbWlzZSIsIl9vblNlc3Npb25FbmQiLCJzZXNzaW9uIiwiQW5hbHl0aWNzRXZlbnRzIiwiREVCVUdHRVJfU1RPUCIsInJlbW92ZWRQcm9jZXNzZXMiLCJyZW1vdmVQcm9jZXNzIiwiZm9yRWFjaCIsInNldFN0b3BQZW5kaW5nIiwiX29uRGVidWdnZXJNb2RlQ2hhbmdlZCIsIkRlYnVnZ2VyTW9kZSIsIlNUT1BQSU5HIiwiZGlzY29ubmVjdCIsImdldFByb2Nlc3NlcyIsImRpc3Bvc2UiLCJhbGxQcm9jZXNzZXMiLCJwcm9jZXNzVG9Gb2N1cyIsInAiLCJzb21lIiwiU1RPUFBFRCIsImNyZWF0ZUNvbnNvbGUiLCJuYW1lIiwiY29uc29sZUFwaSIsImFwcGVuZCIsInRleHQiLCJwcm9jZXNzTmFtZSIsImxldmVsIiwib25TdWNjZXNzIiwiVW5pdmVyc2FsRGlzcG9zYWJsZSIsIlNldCIsIlN1YmplY3QiLCJNb2RlbCIsIl9sb2FkQnJlYWtwb2ludHMiLCJfbG9hZEZ1bmN0aW9uQnJlYWtwb2ludHMiLCJfbG9hZEV4Y2VwdGlvbkJyZWFrcG9pbnRzIiwiX2xvYWRXYXRjaEV4cHJlc3Npb25zIiwiX3JlZ2lzdGVyTGlzdGVuZXJzIiwidmlld01vZGVsIiwiZ2V0RGVidWdnZXJNb2RlIiwiZGVidWdnZXJNb2RlIiwiYXRvbSIsIndvcmtzcGFjZSIsImFkZE9wZW5lciIsInVyaSIsInN0YXJ0c1dpdGgiLCJERUJVR19TT1VSQ0VTX1VSSSIsIl9vcGVuU291cmNlVmlldyIsInF1ZXJ5IiwidXJsIiwicGFyc2UiLCJwYXRoIiwic3BsaXQiLCJzZXNzaW9uSWQiLCJzb3VyY2VSZWZlcmVuY2VSYXciLCJzb3VyY2VSZWZlcmVuY2UiLCJwYXJzZUludCIsInNvdXJjZSIsImdldFNvdXJjZSIsImNvbnRlbnQiLCJyZXNwb25zZSIsInJhdyIsImJvZHkiLCJlcnJvciIsIl9zb3VyY2VJc05vdEF2YWlsYWJsZSIsImVkaXRvciIsImJ1aWxkVGV4dEVkaXRvciIsImJ1ZmZlciIsIkRlYnVnU291cmNlVGV4dEJ1ZmZmZXIiLCJhdXRvSGVpZ2h0IiwicmVhZE9ubHkiLCJzZXJpYWxpemUiLCJzZXRHcmFtbWFyIiwiZ3JhbW1hcnMiLCJzZWxlY3RHcmFtbWFyIiwidGV4dEVkaXRvckJhbm5lciIsIlRleHRFZGl0b3JCYW5uZXIiLCJyZW5kZXIiLCJiaW5kIiwiYWRkVW50aWxEZXN0cm95ZWQiLCJfdHJ5VG9BdXRvRm9jdXNTdGFja0ZyYW1lIiwiY2FsbFN0YWNrIiwiaW5jbHVkZXMiLCJzdGFja0ZyYW1lVG9Gb2N1cyIsInNmIiwiYXZhaWxhYmxlIiwiX3JlZ2lzdGVyTWFya2VycyIsInNlbGVjdGVkRnJhbWVNYXJrZXIiLCJ0aHJlYWRDaGFuZ2VEYXRhdGlwIiwibGFzdEZvY3VzZWRUaHJlYWRJZCIsImxhc3RGb2N1c2VkUHJvY2VzcyIsImNsZWF1cE1hcmtlcnMiLCJkZXN0cm95IiwiY29uY2F0TWFwIiwiZXZlbnQiLCJQQVVTRUQiLCJub3RpZmljYXRpb25zIiwiYWRkV2FybmluZyIsIk9ic2VydmFibGUiLCJlbXB0eSIsImZyb21Qcm9taXNlIiwib3BlbkluRWRpdG9yIiwic3dpdGNoTWFwIiwiZXJyb3JNc2ciLCJhZGRFcnJvciIsIm9mIiwic3Vic2NyaWJlIiwibGluZSIsInJhbmdlIiwic3RhcnQiLCJyb3ciLCJtYXJrQnVmZmVyUmFuZ2UiLCJJbmZpbml0eSIsImludmFsaWRhdGUiLCJkZWNvcmF0ZU1hcmtlciIsInR5cGUiLCJjbGFzcyIsImRhdGF0aXBTZXJ2aWNlIiwic2V0RXhjZXB0aW9uQnJlYWtwb2ludHMiLCJjYXBhYmlsaXRpZXMiLCJleGNlcHRpb25CcmVha3BvaW50RmlsdGVycyIsInRocmVhZElkIiwibWVzc2FnZSIsIm5ld0ZvY3VzZWRQcm9jZXNzIiwiY3JlYXRlUGlubmVkRGF0YVRpcCIsImNvbXBvbmVudCIsInBpbm5hYmxlIiwiX3JlZ2lzdGVyU2Vzc2lvbkxpc3RlbmVycyIsInRocmVhZEZldGNoZXIiLCJyYXdVcGRhdGUiLCJvcGVuRmlsZXNTYXZlZCIsIm9ic2VydmVUZXh0RWRpdG9ycyIsImZsYXRNYXAiLCJvbkRpZFNhdmUiLCJtYXAiLCJnZXRQYXRoIiwidGFrZVVudGlsIiwib25EaWREZXN0cm95IiwiZmlsZVBhdGgiLCJoYXMiLCJkZWxldGUiLCJfc2VuZEJyZWFrcG9pbnRzIiwib2JzZXJ2ZUluaXRpYWxpemVFdmVudHMiLCJzZW5kQ29uZmlndXJhdGlvbkRvbmUiLCJnZXRDYXBhYmlsaXRpZXMiLCJzdXBwb3J0c0NvbmZpZ3VyYXRpb25Eb25lUmVxdWVzdCIsImNvbmZpZ3VyYXRpb25Eb25lIiwidGhlbiIsIl8iLCJSVU5OSU5HIiwiY2F0Y2giLCJlIiwib25VbmV4cGVjdGVkRXJyb3IiLCJkZXRhaWwiLCJfc2VuZEFsbEJyZWFrcG9pbnRzIiwidG9Gb2N1c1RocmVhZHMiLCJvYnNlcnZlQ29udGludWVkVG8iLCJvYnNlcnZlQ29udGludWVkRXZlbnRzIiwiY29udGludWVkIiwiYWxsVGhyZWFkc0NvbnRpbnVlZCIsIm9ic2VydmVTdG9wRXZlbnRzIiwib2JzZXJ2ZUV2YWx1YXRpb25zIiwiaWdub3JlRWxlbWVudHMiLCJjb25jYXQiLCJzdG9wcGVkRGV0YWlscyIsImdldFRocmVhZCIsIm5leHQiLCJwcmVzZXJ2ZUZvY3VzSGludCIsInRoaXNUaHJlYWRJc0ZvY3VzZWQiLCJyZWZyZXNoQ2FsbFN0YWNrIiwiX3NjaGVkdWxlTmF0aXZlTm90aWZpY2F0aW9uIiwib2JzZXJ2ZVRocmVhZEV2ZW50cyIsInJlYXNvbiIsImNsZWFyVGhyZWFkcyIsIm9ic2VydmVUZXJtaW5hdGVEZWJ1Z2VlRXZlbnRzIiwicmVzdGFydCIsInJlc3RhcnRQcm9jZXNzIiwiZXJyIiwic3RhY2siLCJTdHJpbmciLCJvdXRwdXRFdmVudHMiLCJvYnNlcnZlT3V0cHV0RXZlbnRzIiwib3V0cHV0Iiwic2hhcmUiLCJub3RpZmljYXRpb25TdHJlYW0iLCJjYXRlZ29yeSIsImRhdGEiLCJudWNsaWRlVHJhY2tTdHJlYW0iLCJDQVRFR09SSUVTX01BUCIsIk1hcCIsIklHTk9SRURfQ0FURUdPUklFUyIsImxvZ1N0cmVhbSIsInZhcmlhYmxlc1JlZmVyZW5jZSIsImdldCIsIm9iamVjdFN0cmVhbSIsImxhc3RFbnRyeVRva2VuIiwiaGFuZGxlTWVzc2FnZSIsImNvbXBsZXRlIiwiZW5kc1dpdGgiLCJzYW1lTGV2ZWwiLCJnZXRDdXJyZW50TGV2ZWwiLCJhcHBlbmRUZXh0Iiwic2V0Q29tcGxldGUiLCJpbmNvbXBsZXRlIiwiY29udGFpbmVyIiwiRXhwcmVzc2lvbkNvbnRhaW5lciIsInV1aWQiLCJ2NCIsImdldENoaWxkcmVuIiwiY2hpbGRyZW4iLCJleHByZXNzaW9ucyIsIm9ic2VydmVCcmVha3BvaW50RXZlbnRzIiwiYnJlYWtwb2ludCIsIkJyZWFrcG9pbnRFdmVudFJlYXNvbnMiLCJDSEFOR0VEIiwiUkVNT1ZFRCIsInNvdXJjZUJyZWFrcG9pbnQiLCJmdW5jdGlvbkJyZWFrcG9pbnQiLCJvbkRpZENoYW5nZUJyZWFrcG9pbnRzIiwic3RhcnRXaXRoIiwiZ2V0QnJlYWtwb2ludHMiLCJiIiwiaWRGcm9tQWRhcHRlciIsInBvcCIsImdldEZ1bmN0aW9uQnJlYWtwb2ludHMiLCJ0aW1lb3V0IiwiVGltZW91dEVycm9yIiwibG9nZ2VyIiwiTkVXIiwiYWRkVUlCcmVha3BvaW50cyIsImNvbHVtbiIsImVuYWJsZWQiLCJyZW1vdmVCcmVha3BvaW50cyIsInJlbW92ZUZ1bmN0aW9uQnJlYWtwb2ludHMiLCJ1cGRhdGVQcm9jZXNzQnJlYWtwb2ludHMiLCJ1cGRhdGVGdW5jdGlvbkJyZWFrcG9pbnRzIiwid2FybiIsIm9ic2VydmVBZGFwdGVyRXhpdGVkRXZlbnRzIiwib2JzZXJ2ZUN1c3RvbUV2ZW50cyIsInNvdXJjZVJlZkJyZWFrcG9pbnRzIiwiYnAiLCJyYWlzZU5hdGl2ZU5vdGlmaWNhdGlvbiIsInBlbmRpbmdOb3RpZmljYXRpb24iLCJvbkRpZENoYW5nZUFjdGl2ZVRocmVhZCIsIm9uRGlkU3RhcnREZWJ1Z1Nlc3Npb24iLCJvbkRpZEN1c3RvbUV2ZW50Iiwib25EaWRDaGFuZ2VQcm9jZXNzTW9kZSIsInJlc3VsdCIsInNvdXJjZUJyZWFrcG9pbnRzIiwib3JpZ2luYWxMaW5lIiwiY29uZGl0aW9uIiwidHJpbSIsImxvZ01lc3NhZ2UiLCJmdW5jdGlvbkJyZWFrcG9pbnRzIiwiZmIiLCJGdW5jdGlvbkJyZWFrcG9pbnQiLCJoaXRDb25kaXRpb24iLCJleGNlcHRpb25CcmVha3BvaW50cyIsImV4QnJlYWtwb2ludCIsIkV4Y2VwdGlvbkJyZWFrcG9pbnQiLCJsYWJlbCIsIndhdGNoRXhwcmVzc2lvbnMiLCJFeHByZXNzaW9uIiwibW9kZSIsImVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzIiwiZW5hYmxlIiwic2V0RW5hYmxlbWVudCIsIkJyZWFrcG9pbnQiLCJfc2VuZEZ1bmN0aW9uQnJlYWtwb2ludHMiLCJERUJVR0dFUl9UT0dHTEVfRVhDRVBUSU9OX0JSRUFLUE9JTlQiLCJfc2VuZEV4Y2VwdGlvbkJyZWFrcG9pbnRzIiwiZW5hYmxlT3JEaXNhYmxlQWxsQnJlYWtwb2ludHMiLCJ1aUJyZWFrcG9pbnRzIiwiREVCVUdHRVJfQlJFQUtQT0lOVF9BREQiLCJ1cmlzIiwicHJvbWlzZXMiLCJwdXNoIiwiUHJvbWlzZSIsImFsbCIsImFkZFNvdXJjZUJyZWFrcG9pbnQiLCJERUJVR0dFUl9CUkVBS1BPSU5UX1NJTkdMRV9BREQiLCJleGlzdGluZyIsImdldEJyZWFrcG9pbnRBdExpbmUiLCJyZXNvbHZlIiwidG9nZ2xlU291cmNlQnJlYWtwb2ludCIsIkRFQlVHR0VSX0JSRUFLUE9JTlRfVE9HR0xFIiwidXBkYXRlQnJlYWtwb2ludHMiLCJ1cmlzVG9TZW5kIiwic2tpcEFuYWx5dGljcyIsInRvUmVtb3ZlIiwidXJpc1RvQ2xlYXIiLCJERUJVR0dFUl9CUkVBS1BPSU5UX0RFTEVURV9BTEwiLCJERUJVR0dFUl9CUkVBS1BPSU5UX0RFTEVURSIsInNldEJyZWFrcG9pbnRzQWN0aXZhdGVkIiwiYWN0aXZhdGVkIiwiYWRkRnVuY3Rpb25CcmVha3BvaW50IiwicmVuYW1lRnVuY3Rpb25CcmVha3BvaW50IiwibmV3RnVuY3Rpb25OYW1lIiwidGVybWluYXRlVGhyZWFkcyIsInRocmVhZElkcyIsIkRFQlVHR0VSX1RFUk1JTkFURV9USFJFQUQiLCJCb29sZWFuIiwic3VwcG9ydHNUZXJtaW5hdGVUaHJlYWRzUmVxdWVzdCIsImN1c3RvbSIsInJ1blRvTG9jYXRpb24iLCJERUJVR0dFUl9TVEVQX1JVTl9UT19MT0NBVElPTiIsInN1cHBvcnRzQ29udGludWVUb0xvY2F0aW9uIiwicnVuVG9Mb2NhdGlvbkJyZWFrcG9pbnQiLCJyZW1vdmVCcmVha3BvaW50IiwicmVtb3ZlQnJlYWtwb2ludERpc3Bvc2FibGUiLCJyZW1vdmUiLCJjb250aW51ZSIsImFkZFdhdGNoRXhwcmVzc2lvbiIsIkRFQlVHR0VSX1dBVENIX0FERF9FWFBSRVNTSU9OIiwicmVuYW1lV2F0Y2hFeHByZXNzaW9uIiwibmV3TmFtZSIsIkRFQlVHR0VSX1dBVENIX1VQREFURV9FWFBSRVNTSU9OIiwicmVtb3ZlV2F0Y2hFeHByZXNzaW9ucyIsIkRFQlVHR0VSX1dBVENIX1JFTU9WRV9FWFBSRVNTSU9OIiwiY3JlYXRlRXhwcmVzc2lvbiIsInJhd0V4cHJlc3Npb24iLCJfZG9DcmVhdGVQcm9jZXNzIiwicmF3Q29uZmlndXJhdGlvbiIsImVycm9ySGFuZGxlciIsIm9uRXJyb3IiLCJERUJVR0dFUl9TVEFSVF9GQUlMIiwiZXJyb3JNZXNzYWdlIiwiaXNEaXNjb25uZWN0ZWQiLCJhZGFwdGVyRXhlY3V0YWJsZSIsIl9yZXNvbHZlQWRhcHRlckV4ZWN1dGFibGUiLCJvbkRlYnVnU3RhcnRpbmdDYWxsYmFjayIsIm9uRGVidWdTdGFydGVkQ2FsbGJhY2siLCJvbkRlYnVnUnVubmluZ0NhbGxiYWNrIiwiREVCVUdHRVJfU1RBUlQiLCJzZXJ2aWNlTmFtZSIsImNsaWVudFR5cGUiLCJzZXNzaW9uVGVhcmRvd25EaXNwb3NhYmxlcyIsImluc3RhbmNlSW50ZXJmYWNlIiwibmV3U2Vzc2lvbiIsIk9iamVjdCIsImZyZWV6ZSIsImN1c3RvbVJlcXVlc3QiLCJyZXF1ZXN0IiwiY3JlYXRlSW5pdGlhbGl6ZVNlc3Npb24iLCJjb25maWciLCJfY3JlYXRlVnNEZWJ1Z1Nlc3Npb24iLCJfcmVnaXN0ZXJDb25zb2xlRXhlY3V0b3IiLCJhZGRQcm9jZXNzIiwiU1RBUlRJTkciLCJjb21tYW5kcyIsImRpc3BhdGNoIiwidmlld3MiLCJnZXRWaWV3IiwiaW5pdGlhbGl6ZSIsImNsaWVudElEIiwiYWRhcHRlcklEIiwicGF0aEZvcm1hdCIsImxpbmVzU3RhcnRBdDEiLCJjb2x1bW5zU3RhcnRBdDEiLCJzdXBwb3J0c1ZhcmlhYmxlVHlwZSIsInN1cHBvcnRzVmFyaWFibGVQYWdpbmciLCJzdXBwb3J0c1J1bkluVGVybWluYWxSZXF1ZXN0IiwibG9jYWxlIiwidGVhcmRvd24iLCJzZXRSdW5uaW5nU3RhdGUiLCJjbGVhclByb2Nlc3NTdGFydGluZ0ZsYWciLCJfbGF1bmNoT3JBdHRhY2hUYXJnZXQiLCJkZWJ1Z01vZGUiLCJvcyIsInBsYXRmb3JtIiwiaXNSZW1vdGUiLCJvbkRpZENoYW5nZVByb2Nlc3NlcyIsImdldE1vZGVsIiwiZ2V0QWRhcHRlckV4ZWN1dGFibGVJbmZvIiwic2VydmljZSIsInNwYXduZXIiLCJjcmVhdGVWc1Jhd0FkYXB0ZXJTcGF3bmVyU2VydmljZSIsImNsaWVudFByZXByb2Nlc3NvcnMiLCJhZGFwdGVyUHJlcHJvY2Vzc29ycyIsImNsaWVudFByZXByb2Nlc3NvciIsImFkYXB0ZXJQcmVwcm9jZXNzb3IiLCJWc0RlYnVnU2Vzc2lvbiIsImFkYXB0ZXIiLCJob3N0IiwiaXNSZWFkT25seSIsImF0dGFjaCIsImxhdW5jaCIsInNvdXJjZUlzTm90QXZhaWxhYmxlIiwiY2FuUmVzdGFydFByb2Nlc3MiLCJpc1Jlc3RhcnRhYmxlIiwic3VwcG9ydHNSZXN0YXJ0UmVxdWVzdCIsInN0YXJ0RGVidWdnaW5nIiwic2VhcmNoQWxsUGFuZXMiLCJkZWJ1Z2dlclR5cGVzIiwiREVCVUdHRVJfTVVMVElUQVJHRVQiLCJwcm9jZXNzZXNDb3VudCIsInNvdXJjZU1vZGlmaWVkIiwiX2dldEN1cnJlbnRTZXNzaW9uIiwiaXNSZWFkeUZvckJyZWFrcG9pbnRzIiwiYnJlYWtwb2ludHNUb1NlbmQiLCJnZXRVSUJyZWFrcG9pbnRzIiwiYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQiLCJyYXdTb3VyY2UiLCJiYXNlbmFtZSIsImFkYXB0ZXJEYXRhIiwic2V0QnJlYWtwb2ludHMiLCJsaW5lcyIsImJyZWFrcG9pbnRzIiwiYnBUb1NlbmQiLCJpIiwiYnBJZCIsInN1cHBvcnRzRnVuY3Rpb25CcmVha3BvaW50cyIsImZicCIsInNldEZ1bmN0aW9uQnJlYWtwb2ludHMiLCJnZXRFeGNlcHRpb25CcmVha3BvaW50cyIsImVuYWJsZWRFeGNlcHRpb25CcHMiLCJleGIiLCJmaWx0ZXJzIiwiX2V2YWx1YXRlRXhwcmVzc2lvbiIsImV4cHJlc3Npb24iLCJzdWJzY3JpcHRpb24iLCJza2lwIiwiaXNFcnJvciIsImlzUGVuZGluZyIsImdldFZhbHVlIiwiaGFzQ2hpbGRyZW4iLCJyZWdpc3RlckV4ZWN1dG9yIiwiZW1pdHRlciIsIlNDT1BFX0NIQU5HRUQiLCJldmFsdWF0ZUV4cHJlc3Npb24iLCJleGVjdXRvciIsInNjb3BlTmFtZSIsImdyYW1tYXJOYW1lIiwib25EaWRDaGFuZ2VTY29wZU5hbWUiLCJzZW5kIiwiVGV4dEJ1ZmZlciIsImNvbnRlbnRzIiwiX3VyaSIsImdldFVyaSIsImlzTW9kaWZpZWQiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFtREE7O0FBQ0E7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBTUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBUUE7O0FBQ0E7O0FBU0E7O0FBQ0E7O0FBQ0E7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBbEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBeUVBLE1BQU1BLGdCQUFnQixHQUFHLHdCQUF6QjtBQUVBLE1BQU1DLGtCQUFrQixHQUFHLG9CQUEzQjtBQUNBLE1BQU1DLGlCQUFpQixHQUFHLG1CQUExQjtBQUNBLE1BQU1DLG1CQUFtQixHQUFHLHFCQUE1QjtBQUNBLE1BQU1DLHFCQUFxQixHQUFHLHVCQUE5QjtBQUVBLE1BQU1DLHNCQUFzQixHQUFHLHdCQUEvQjtBQUNBLE1BQU1DLHlCQUF5QixHQUFHLDJCQUFsQyxDLENBRUE7O0FBQ0EsTUFBTUMsNkJBQTZCLEdBQUcsSUFBSSxJQUExQzs7QUFFQSxNQUFNQyxTQUFOLENBQXNDO0FBTXBDQyxFQUFBQSxXQUFXLEdBQUc7QUFBQSxTQUxkQyxlQUtjO0FBQUEsU0FKZEMsY0FJYztBQUFBLFNBSGRDLGtCQUdjO0FBQUEsU0FGZEMsUUFFYztBQUNaLFNBQUtILGVBQUwsR0FBdUIsSUFBdkI7QUFDQSxTQUFLQyxjQUFMLEdBQXNCLElBQXRCO0FBQ0EsU0FBS0Msa0JBQUwsR0FBMEIsSUFBMUI7QUFDQSxTQUFLQyxRQUFMLEdBQWdCLElBQUlDLGFBQUosRUFBaEI7QUFDRDs7QUFFRCxNQUFJQyxjQUFKLEdBQWdDO0FBQzlCLFdBQU8sS0FBS0wsZUFBWjtBQUNEOztBQUVELE1BQUlNLGFBQUosR0FBOEI7QUFDNUIsV0FBTyxLQUFLTCxjQUFaO0FBQ0Q7O0FBRUQsTUFBSU0saUJBQUosR0FBc0M7QUFDcEMsV0FBTyxLQUFLTCxrQkFBWjtBQUNEOztBQUVETSxFQUFBQSx3QkFBd0IsQ0FBQ0MsUUFBRCxFQUFnRTtBQUN0RixXQUFPLEtBQUtOLFFBQUwsQ0FBY08sRUFBZCxDQUFpQmYsc0JBQWpCLEVBQXlDYyxRQUF6QyxDQUFQO0FBQ0Q7O0FBRURFLEVBQUFBLDRCQUE0QixDQUFDRixRQUFELEVBQWdFO0FBQzFGLFdBQU8sS0FBS04sUUFBTCxDQUFjTyxFQUFkLENBQWlCZCx5QkFBakIsRUFBNENhLFFBQTVDLENBQVA7QUFDRDs7QUFFREcsRUFBQUEsa0JBQWtCLENBQUNDLE9BQUQsRUFBOEI7QUFDOUMsVUFBTUMsT0FBTyxHQUFHRCxPQUFPLENBQUNFLGFBQVIsRUFBaEIsQ0FEOEMsQ0FHOUM7QUFDQTtBQUNBO0FBQ0E7O0FBQ0EsUUFBSSxLQUFLZCxjQUFMLElBQXVCLElBQTNCLEVBQWlDO0FBQy9CLFlBQU1lLEVBQUUsR0FBRyxLQUFLZixjQUFMLENBQW9CZ0IsS0FBcEIsRUFBWDs7QUFDQSxZQUFNQyxvQkFBb0IsR0FBR0osT0FBTyxDQUFDSyxNQUFSLENBQWdCQyxDQUFELElBQU9BLENBQUMsQ0FBQ0gsS0FBRixPQUFjRCxFQUFkLElBQW9CSSxDQUFDLENBQUNDLE9BQTVDLENBQTdCOztBQUNBLFVBQUlILG9CQUFvQixDQUFDSSxNQUFyQixHQUE4QixDQUFsQyxFQUFxQztBQUNuQyxlQUFPSixvQkFBb0IsQ0FBQyxDQUFELENBQTNCO0FBQ0Q7QUFDRjs7QUFFRCxVQUFNSyxjQUFjLEdBQUdULE9BQU8sQ0FBQ0ssTUFBUixDQUFnQkMsQ0FBRCxJQUFPQSxDQUFDLENBQUNDLE9BQXhCLENBQXZCO0FBQ0EsV0FBT0UsY0FBYyxDQUFDLENBQUQsQ0FBZCxJQUFxQlQsT0FBTyxDQUFDLENBQUQsQ0FBbkM7QUFDRDs7QUFFRFUsRUFBQUEsc0JBQXNCLENBQUNDLE1BQUQsRUFBaUM7QUFDckQsUUFBSUEsTUFBTSxJQUFJLElBQWQsRUFBb0I7QUFDbEIsYUFBTyxJQUFQO0FBQ0QsS0FIb0QsQ0FLckQ7QUFDQTtBQUNBOzs7QUFDQSxVQUFNQyxtQkFBbUIsR0FBR0QsTUFBTSxDQUFDRSxrQkFBUCxHQUE0QkMsSUFBNUIsQ0FBa0NDLENBQUQsSUFBT0EsQ0FBQyxLQUFLLEtBQUszQixrQkFBbkQsQ0FBNUI7QUFDQSxXQUFPdUIsTUFBTSxDQUFDSixPQUFQLEdBQWlCSyxtQkFBbUIsSUFBSUQsTUFBTSxDQUFDSyxvQkFBUCxFQUF4QyxHQUF3RSxJQUEvRTtBQUNEOztBQUVEQyxFQUFBQSxTQUFTLENBQUNsQixPQUFELEVBQXFCWSxNQUFyQixFQUF1Q08sVUFBdkMsRUFBaUVDLFFBQWpFLEVBQW9GO0FBQzNGLFFBQUlDLFVBQVUsR0FBR3JCLE9BQWpCLENBRDJGLENBRzNGOztBQUNBLHlCQUFVbUIsVUFBVSxJQUFJLElBQWQsSUFBc0JQLE1BQU0sS0FBS08sVUFBVSxDQUFDUCxNQUF0RCxFQUoyRixDQU0zRjs7QUFDQSx5QkFBVUEsTUFBTSxJQUFJLElBQVYsSUFBa0JaLE9BQU8sS0FBS1ksTUFBTSxDQUFDWixPQUEvQzs7QUFFQSxRQUFJcUIsVUFBVSxJQUFJLElBQWxCLEVBQXdCO0FBQ3RCLDJCQUFVVCxNQUFNLElBQUksSUFBVixJQUFrQk8sVUFBVSxJQUFJLElBQTFDO0FBQ0FFLE1BQUFBLFVBQVUsR0FBRyxLQUFLbEMsZUFBbEI7QUFDRDs7QUFFRCxVQUFNbUMsWUFBWSxHQUNoQixLQUFLbkMsZUFBTCxLQUF5QmtDLFVBQXpCLElBQ0EsS0FBS2pDLGNBQUwsS0FBd0J3QixNQUR4QixJQUVBLEtBQUt2QixrQkFBTCxLQUE0QjhCLFVBRjVCLElBR0FDLFFBSkY7QUFNQSxTQUFLakMsZUFBTCxHQUF1QmtDLFVBQXZCO0FBQ0EsU0FBS2pDLGNBQUwsR0FBc0J3QixNQUF0QjtBQUNBLFNBQUt2QixrQkFBTCxHQUEwQjhCLFVBQTFCOztBQUVBLFFBQUlHLFlBQUosRUFBa0I7QUFDaEIsV0FBS2hDLFFBQUwsQ0FBY2lDLElBQWQsQ0FBbUJ6QyxzQkFBbkIsRUFBMkM7QUFBRXNDLFFBQUFBO0FBQUYsT0FBM0M7QUFDRCxLQUZELE1BRU87QUFDTDtBQUNBO0FBQ0EsV0FBSzlCLFFBQUwsQ0FBY2lDLElBQWQsQ0FBbUJ4Qyx5QkFBbkIsRUFBOEM7QUFBRXFDLFFBQUFBO0FBQUYsT0FBOUM7QUFDRDtBQUNGOztBQUVESSxFQUFBQSxzQkFBc0IsR0FBUztBQUM3QixTQUFLbEMsUUFBTCxDQUFjaUMsSUFBZCxDQUFtQnhDLHlCQUFuQixFQUE4QztBQUFFcUMsTUFBQUEsUUFBUSxFQUFFO0FBQVosS0FBOUM7QUFDRDs7QUFFREssRUFBQUEsaUJBQWlCLENBQUN6QixPQUFELEVBQXFCb0IsUUFBckIsRUFBd0M7QUFDdkQsUUFBSXBCLE9BQU8sSUFBSSxJQUFmLEVBQXFCO0FBQ25CLFdBQUtiLGVBQUwsR0FBdUIsSUFBdkI7O0FBQ0EsV0FBSytCLFNBQUwsQ0FBZSxJQUFmLEVBQXFCLElBQXJCLEVBQTJCLElBQTNCLEVBQWlDRSxRQUFqQztBQUNELEtBSEQsTUFHTztBQUNMLFlBQU1NLGNBQWMsR0FBRyxLQUFLM0Isa0JBQUwsQ0FBd0JDLE9BQXhCLENBQXZCOztBQUNBLFlBQU0yQixhQUFhLEdBQUcsS0FBS2hCLHNCQUFMLENBQTRCZSxjQUE1QixDQUF0Qjs7QUFDQSxXQUFLUixTQUFMLENBQWVsQixPQUFmLEVBQXdCMEIsY0FBeEIsRUFBd0NDLGFBQXhDLEVBQXVEUCxRQUF2RDtBQUNEO0FBQ0Y7O0FBRURRLEVBQUFBLGdCQUFnQixDQUFDaEIsTUFBRCxFQUFtQlEsUUFBbkIsRUFBc0M7QUFDcEQsUUFBSVIsTUFBTSxJQUFJLElBQWQsRUFBb0I7QUFDbEIsV0FBS00sU0FBTCxDQUFlLElBQWYsRUFBcUIsSUFBckIsRUFBMkIsSUFBM0IsRUFBaUNFLFFBQWpDO0FBQ0QsS0FGRCxNQUVPO0FBQ0wsV0FBS0YsU0FBTCxDQUFlTixNQUFNLENBQUNaLE9BQXRCLEVBQStCWSxNQUEvQixFQUF1QyxLQUFLRCxzQkFBTCxDQUE0QkMsTUFBNUIsQ0FBdkMsRUFBNEVRLFFBQTVFO0FBQ0Q7QUFDRjs7QUFFRFMsRUFBQUEsb0JBQW9CLENBQUNWLFVBQUQsRUFBMkJDLFFBQTNCLEVBQThDO0FBQ2hFLFFBQUlELFVBQVUsSUFBSSxJQUFsQixFQUF3QjtBQUN0QixXQUFLRCxTQUFMLENBQWUsSUFBZixFQUFxQixJQUFyQixFQUEyQixJQUEzQixFQUFpQ0UsUUFBakM7QUFDRCxLQUZELE1BRU87QUFDTCxXQUFLRixTQUFMLENBQWVDLFVBQVUsQ0FBQ1AsTUFBWCxDQUFrQlosT0FBakMsRUFBMENtQixVQUFVLENBQUNQLE1BQXJELEVBQTZETyxVQUE3RCxFQUF5RUMsUUFBekU7QUFDRDtBQUNGOztBQTlIbUM7O0FBaUl0QyxTQUFTVSxlQUFULENBQXlCQyxXQUF6QixFQUFzRDtBQUNwRCxTQUFRLEdBQUUsdUJBQVdBLFdBQVgsQ0FBd0IsV0FBbEM7QUFDRDs7QUFFYyxNQUFNQyxZQUFOLENBQTRDO0FBV3pEOUMsRUFBQUEsV0FBVyxDQUFDK0MsS0FBRCxFQUEwQjtBQUFBLFNBVnJDQyxNQVVxQztBQUFBLFNBVHJDQyxZQVNxQztBQUFBLFNBUnJDQyxzQkFRcUM7QUFBQSxTQVByQ0MsbUJBT3FDO0FBQUEsU0FOckMvQyxRQU1xQztBQUFBLFNBTHJDZ0QsVUFLcUM7QUFBQSxTQUpyQ0MsTUFJcUM7QUFBQSxTQUhyQ0Msd0JBR3FDO0FBQUEsU0FGckNDLGNBRXFDOztBQUFBLFNBb3BDckNDLGNBcHBDcUMsR0FvcENwQixNQUFPQyxJQUFQLElBQTRFO0FBQzNGLFlBQU1DLGVBQWUsR0FBRywrQ0FBeEI7O0FBQ0EsVUFBSUEsZUFBZSxJQUFJLElBQXZCLEVBQTZCO0FBQzNCLGNBQU0sSUFBSUMsS0FBSixDQUFVLGlFQUFWLENBQU47QUFDRDs7QUFDRCxZQUFNN0MsT0FBTyxHQUFHLEtBQUs4QyxrQkFBTCxFQUFoQjs7QUFDQSxVQUFJOUMsT0FBTyxJQUFJLElBQWYsRUFBcUI7QUFDbkIsY0FBTSxJQUFJNkMsS0FBSixDQUFVLG9EQUFWLENBQU47QUFDRDs7QUFDRCxZQUFNO0FBQUVkLFFBQUFBLFdBQUY7QUFBZWdCLFFBQUFBO0FBQWYsVUFBNkIvQyxPQUFPLENBQUNnRCxhQUEzQztBQUNBLFlBQU1DLEdBQUcsR0FBSSxhQUFZRixTQUFVLFlBQVdKLElBQUksQ0FBQ0EsSUFBTCxDQUFVLENBQVYsQ0FBYSxFQUEzRCxDQVYyRixDQVkzRjtBQUNBO0FBQ0E7O0FBQ0FDLE1BQUFBLGVBQWUsQ0FBQ00sS0FBaEIsQ0FBc0JELEdBQXRCO0FBRUEsWUFBTUUsS0FBSyxHQUFHUixJQUFJLENBQUNRLEtBQUwsSUFBYyxJQUFkLEdBQXFCUixJQUFJLENBQUNRLEtBQTFCLEdBQWtDckIsZUFBZSxDQUFDQyxXQUFELENBQS9EOztBQUNBLFlBQU1xQixRQUFRLEdBQUdDLG9CQUFXQyxjQUFYLENBQTBCUCxTQUExQixDQUFqQjs7QUFDQSxZQUFNUSxHQUFHLEdBQUdILFFBQVEsSUFBSSxJQUFaLEdBQW1CVCxJQUFJLENBQUNZLEdBQXhCLEdBQThCRixvQkFBV0csZUFBWCxDQUEyQkosUUFBM0IsRUFBcUNULElBQUksQ0FBQ1ksR0FBMUMsQ0FBMUM7QUFFQSxZQUFNRSxJQUFrQixHQUFHO0FBQ3pCUixRQUFBQSxHQUR5QjtBQUV6QkUsUUFBQUEsS0FGeUI7QUFHekJJLFFBQUFBLEdBSHlCO0FBSXpCRyxRQUFBQSxPQUFPLEVBQUU7QUFDUEMsVUFBQUEsSUFBSSxFQUFFaEIsSUFBSSxDQUFDQSxJQUFMLENBQVUsQ0FBVixDQURDO0FBRVBBLFVBQUFBLElBQUksRUFBRUEsSUFBSSxDQUFDQSxJQUFMLENBQVVpQixLQUFWLENBQWdCLENBQWhCO0FBRkMsU0FKZ0I7QUFRekJDLFFBQUFBLG9CQUFvQixFQUFFbEIsSUFBSSxDQUFDbUIsR0FBTCxJQUFZLElBQVosR0FBbUIsK0JBQWNuQixJQUFJLENBQUNtQixHQUFuQixDQUFuQixHQUE2Q0MsU0FSMUM7QUFTekJDLFFBQUFBLGlCQUFpQixFQUFFLENBQ2pCLDZCQURpQixFQUVqQix5QkFGaUIsRUFHakIsNEJBSGlCLEVBSWpCLG9CQUppQixFQUtqQixvQkFMaUIsRUFNakIsbUJBTmlCLENBVE07QUFpQnpCQyxRQUFBQSxpQkFBaUIsRUFBRSxJQWpCTTtBQWtCekJDLFFBQUFBLElBQUksRUFBRSxtQkFsQm1CO0FBbUJ6QkMsUUFBQUEsZUFBZSxFQUFFO0FBbkJRLE9BQTNCO0FBcUJBLFlBQU1DLFFBQTBCLEdBQUcsTUFBTXhCLGVBQWUsQ0FBQ3lCLElBQWhCLENBQXFCWixJQUFyQixDQUF6QztBQUVBVyxNQUFBQSxRQUFRLENBQUNFLHNCQUFULENBQWdDLE1BQU07QUFDcEM7QUFDQTtBQUNBLGFBQUtDLFdBQUwsQ0FBaUJ2RSxPQUFqQjtBQUNELE9BSkQ7O0FBTUEsV0FBS29DLHNCQUFMLENBQTRCb0MsR0FBNUIsQ0FBZ0MsTUFBTTtBQUNwQztBQUNBO0FBQ0E7QUFDQUosUUFBQUEsUUFBUSxDQUFDRSxzQkFBVCxDQUFnQyxNQUFNLENBQUUsQ0FBeEM7QUFDQUYsUUFBQUEsUUFBUSxDQUFDSyxnQkFBVDtBQUNELE9BTkQ7O0FBUUEsWUFBTUMsS0FBSyxHQUFHLDRDQUFpQ0MsRUFBRCxJQUFRUCxRQUFRLENBQUNRLE9BQVQsQ0FBaUJELEVBQWpCLENBQXhDLENBQWQ7QUFDQSxhQUFPRCxLQUFLLENBQUNHLElBQU4sQ0FBVyxDQUFYLEVBQWNDLFNBQWQsRUFBUDtBQUNELEtBaHRDb0M7O0FBQUEsU0F5dkNyQ0MsYUF6dkNxQyxHQXl2Q3JCLE1BQU9DLE9BQVAsSUFBa0Q7QUFDaEUsNEJBQU1DLDJCQUFnQkMsYUFBdEI7O0FBQ0EsWUFBTUMsZ0JBQWdCLEdBQUcsS0FBS2pELE1BQUwsQ0FBWWtELGFBQVosQ0FBMEJKLE9BQU8sQ0FBQzVFLEtBQVIsRUFBMUIsQ0FBekI7O0FBQ0EsVUFBSStFLGdCQUFnQixDQUFDMUUsTUFBakIsS0FBNEIsQ0FBaEMsRUFBbUM7QUFDakM7QUFDQTtBQUNBO0FBQ0E7QUFDRCxPQVIrRCxDQVVoRTs7O0FBQ0EwRSxNQUFBQSxnQkFBZ0IsQ0FBQ0UsT0FBakIsQ0FBMEJyRixPQUFELElBQWE7QUFDcENBLFFBQUFBLE9BQU8sQ0FBQ3NGLGNBQVI7O0FBQ0EsYUFBS0Msc0JBQUwsQ0FBNEJ2RixPQUE1QixFQUFxQ3dGLHdCQUFhQyxRQUFsRDtBQUNELE9BSEQsRUFYZ0UsQ0FnQmhFOztBQUNBLFlBQU1ULE9BQU8sQ0FBQ1UsVUFBUixDQUFtQjtBQUFNO0FBQXpCLFFBQXdDO0FBQUs7QUFBN0MsT0FBTjs7QUFFQSxVQUFJLEtBQUt4RCxNQUFMLENBQVl5RCxZQUFaLE1BQThCLElBQTlCLElBQXNDLEtBQUt6RCxNQUFMLENBQVl5RCxZQUFaLEdBQTJCbEYsTUFBM0IsS0FBc0MsQ0FBaEYsRUFBbUY7QUFDakYsYUFBSzJCLHNCQUFMLENBQTRCd0QsT0FBNUI7O0FBQ0EsYUFBS3ZELG1CQUFMLENBQXlCdUQsT0FBekIsR0FGaUYsQ0FJakY7OztBQUNBLGFBQUt0RCxVQUFMLENBQWdCYixpQkFBaEIsQ0FBa0MsSUFBbEMsRUFBd0MsS0FBeEM7QUFDRCxPQU5ELE1BTU87QUFDTCxZQUFJLEtBQUthLFVBQUwsQ0FBZ0I5QyxjQUFoQixJQUFrQyxJQUFsQyxJQUEwQyxLQUFLOEMsVUFBTCxDQUFnQjlDLGNBQWhCLENBQStCWSxLQUEvQixPQUEyQzRFLE9BQU8sQ0FBQzVFLEtBQVIsRUFBekYsRUFBMEc7QUFDeEc7QUFDQTtBQUNBO0FBQ0EsZ0JBQU15RixZQUFZLEdBQUcsS0FBSzNELE1BQUwsQ0FBWXlELFlBQVosRUFBckI7O0FBQ0EsZ0JBQU1HLGNBQWMsR0FDbEJELFlBQVksQ0FBQ3ZGLE1BQWIsQ0FBcUJ5RixDQUFELElBQU9BLENBQUMsQ0FBQzdGLGFBQUYsR0FBa0I4RixJQUFsQixDQUF3QnpGLENBQUQsSUFBT0EsQ0FBQyxDQUFDQyxPQUFoQyxDQUEzQixFQUFxRSxDQUFyRSxLQUNBcUYsWUFBWSxDQUFDQSxZQUFZLENBQUNwRixNQUFiLEdBQXNCLENBQXZCLENBRmQ7O0FBR0EsZUFBSzZCLFVBQUwsQ0FBZ0JiLGlCQUFoQixDQUFrQ3FFLGNBQWxDLEVBQWtELEtBQWxEO0FBQ0Q7QUFDRjs7QUFFRFgsTUFBQUEsZ0JBQWdCLENBQUNFLE9BQWpCLENBQTBCckYsT0FBRCxJQUFhO0FBQ3BDLGFBQUt1RixzQkFBTCxDQUE0QnZGLE9BQTVCLEVBQXFDd0Ysd0JBQWFTLE9BQWxEO0FBQ0QsT0FGRDtBQUlBLFlBQU1DLGFBQWEsR0FBRyw4Q0FBdEI7O0FBQ0EsVUFBSUEsYUFBYSxJQUFJLElBQXJCLEVBQTJCO0FBQ3pCLGNBQU1DLElBQUksR0FBRyxrQkFBYjtBQUNBLGNBQU1DLFVBQVUsR0FBR0YsYUFBYSxDQUFDO0FBQy9CL0YsVUFBQUEsRUFBRSxFQUFFZ0csSUFEMkI7QUFFL0JBLFVBQUFBO0FBRitCLFNBQUQsQ0FBaEM7QUFLQWhCLFFBQUFBLGdCQUFnQixDQUFDRSxPQUFqQixDQUEwQlUsQ0FBRCxJQUN2QkssVUFBVSxDQUFDQyxNQUFYLENBQWtCO0FBQ2hCQyxVQUFBQSxJQUFJLEVBQ0Ysb0JBQW9CUCxDQUFDLENBQUMvQyxhQUFGLENBQWdCdUQsV0FBaEIsSUFBK0IsSUFBL0IsR0FBc0MsRUFBdEMsR0FBMkMsT0FBT1IsQ0FBQyxDQUFDL0MsYUFBRixDQUFnQnVELFdBQXZCLEdBQXFDLEdBQXBHLENBRmM7QUFHaEJDLFVBQUFBLEtBQUssRUFBRTtBQUhTLFNBQWxCLENBREY7QUFPRDs7QUFFRCxVQUFJLEtBQUtqRSxNQUFMLElBQWUsSUFBbkIsRUFBeUI7QUFDdkIsYUFBS0EsTUFBTCxDQUFZa0UsU0FBWjs7QUFDQSxhQUFLbEUsTUFBTCxHQUFjLElBQWQ7QUFDRDtBQUNGLEtBeHpDb0M7O0FBQ25DLFNBQUtKLFlBQUwsR0FBb0IsSUFBSXVFLDRCQUFKLEVBQXBCO0FBQ0EsU0FBS3RFLHNCQUFMLEdBQThCLElBQUlzRSw0QkFBSixFQUE5QjtBQUNBLFNBQUtyRSxtQkFBTCxHQUEyQixJQUFJcUUsNEJBQUosRUFBM0I7QUFDQSxTQUFLcEgsUUFBTCxHQUFnQixJQUFJQyxhQUFKLEVBQWhCO0FBQ0EsU0FBSytDLFVBQUwsR0FBa0IsSUFBSXJELFNBQUosRUFBbEI7QUFDQSxTQUFLdUQsd0JBQUwsR0FBZ0MsSUFBSW1FLEdBQUosRUFBaEM7QUFDQSxTQUFLbEUsY0FBTCxHQUFzQixJQUFJbUUsYUFBSixFQUF0QjtBQUVBLFNBQUsxRSxNQUFMLEdBQWMsSUFBSTJFLG9CQUFKLENBQ1osS0FBS0MsZ0JBQUwsQ0FBc0I3RSxLQUF0QixDQURZLEVBRVosSUFGWSxFQUdaLEtBQUs4RSx3QkFBTCxDQUE4QjlFLEtBQTlCLENBSFksRUFJWixLQUFLK0UseUJBQUwsQ0FBK0IvRSxLQUEvQixDQUpZLEVBS1osS0FBS2dGLHFCQUFMLENBQTJCaEYsS0FBM0IsQ0FMWSxFQU1aLE1BQU0sS0FBS0ssVUFBTCxDQUFnQjlDLGNBTlYsQ0FBZDs7QUFRQSxTQUFLMkMsWUFBTCxDQUFrQnFDLEdBQWxCLENBQXNCLEtBQUt0QyxNQUEzQixFQUFtQyxLQUFLTyxjQUF4Qzs7QUFDQSxTQUFLeUUsa0JBQUw7QUFDRDs7QUFFRCxNQUFJQyxTQUFKLEdBQTRCO0FBQzFCLFdBQU8sS0FBSzdFLFVBQVo7QUFDRDs7QUFFRDhFLEVBQUFBLGVBQWUsQ0FBQ3BILE9BQUQsRUFBdUM7QUFDcEQsUUFBSUEsT0FBTyxJQUFJLElBQWYsRUFBcUI7QUFDbkIsYUFBT3dGLHdCQUFhUyxPQUFwQjtBQUNEOztBQUNELFdBQU9qRyxPQUFPLENBQUNxSCxZQUFmO0FBQ0Q7O0FBRURILEVBQUFBLGtCQUFrQixHQUFTO0FBQ3pCLFNBQUsvRSxZQUFMLENBQWtCcUMsR0FBbEIsQ0FDRThDLElBQUksQ0FBQ0MsU0FBTCxDQUFlQyxTQUFmLENBQTBCQyxHQUFELElBQVM7QUFDaEMsVUFBSUEsR0FBRyxDQUFDQyxVQUFKLENBQWVDLDRCQUFmLENBQUosRUFBdUM7QUFDckMsWUFBSSxLQUFLUCxlQUFMLENBQXFCLEtBQUs5RSxVQUFMLENBQWdCOUMsY0FBckMsTUFBeURnRyx3QkFBYVMsT0FBMUUsRUFBbUY7QUFDakYsaUJBQU8sS0FBSzJCLGVBQUwsQ0FBcUJILEdBQXJCLENBQVA7QUFDRDtBQUNGO0FBQ0YsS0FORCxDQURGO0FBU0Q7O0FBRUQsUUFBTUcsZUFBTixDQUFzQkgsR0FBdEIsRUFBNkQ7QUFDM0QsVUFBTUksS0FBSyxHQUFHLENBQUNDLGFBQUlDLEtBQUosQ0FBVU4sR0FBVixFQUFlTyxJQUFmLElBQXVCLEVBQXhCLEVBQTRCQyxLQUE1QixDQUFrQyxHQUFsQyxDQUFkO0FBQ0EsVUFBTSxHQUFHQyxTQUFILEVBQWNDLGtCQUFkLElBQW9DTixLQUExQztBQUNBLFVBQU1PLGVBQWUsR0FBR0MsUUFBUSxDQUFDRixrQkFBRCxFQUFxQixFQUFyQixDQUFoQzs7QUFFQSxVQUFNbkksT0FBTyxHQUFHLEtBQUtrQyxNQUFMLENBQVl5RCxZQUFaLEdBQTJCNUUsSUFBM0IsQ0FBaUNnRixDQUFELElBQU9BLENBQUMsQ0FBQzNGLEtBQUYsT0FBYzhILFNBQXJELEtBQW1FLEtBQUs1RixVQUFMLENBQWdCOUMsY0FBbkc7O0FBQ0EsUUFBSVEsT0FBTyxJQUFJLElBQWYsRUFBcUI7QUFDbkIsWUFBTSxJQUFJNkMsS0FBSixDQUFXLGdDQUErQnVGLGVBQWdCLEVBQTFELENBQU47QUFDRDs7QUFFRCxVQUFNRSxNQUFNLEdBQUd0SSxPQUFPLENBQUN1SSxTQUFSLENBQWtCO0FBQy9CUCxNQUFBQSxJQUFJLEVBQUVQLEdBRHlCO0FBRS9CVyxNQUFBQTtBQUYrQixLQUFsQixDQUFmO0FBS0EsUUFBSUksT0FBTyxHQUFHLEVBQWQ7O0FBQ0EsUUFBSTtBQUNGLFlBQU1DLFFBQVEsR0FBRyxNQUFNekksT0FBTyxDQUFDZ0YsT0FBUixDQUFnQnNELE1BQWhCLENBQXVCO0FBQzVDRixRQUFBQSxlQUQ0QztBQUU1Q0UsUUFBQUEsTUFBTSxFQUFFQSxNQUFNLENBQUNJO0FBRjZCLE9BQXZCLENBQXZCO0FBSUFGLE1BQUFBLE9BQU8sR0FBR0MsUUFBUSxDQUFDRSxJQUFULENBQWNILE9BQXhCO0FBQ0QsS0FORCxDQU1FLE9BQU9JLEtBQVAsRUFBYztBQUNkLFdBQUtDLHFCQUFMLENBQTJCcEIsR0FBM0I7O0FBQ0EsWUFBTSxJQUFJNUUsS0FBSixDQUFVLCtCQUFWLENBQU47QUFDRDs7QUFFRCxVQUFNaUcsTUFBTSxHQUFHeEIsSUFBSSxDQUFDQyxTQUFMLENBQWV3QixlQUFmLENBQStCO0FBQzVDQyxNQUFBQSxNQUFNLEVBQUUsSUFBSUMsc0JBQUosQ0FBMkJULE9BQTNCLEVBQW9DZixHQUFwQyxDQURvQztBQUU1Q3lCLE1BQUFBLFVBQVUsRUFBRSxLQUZnQztBQUc1Q0MsTUFBQUEsUUFBUSxFQUFFO0FBSGtDLEtBQS9CLENBQWYsQ0EzQjJELENBaUMzRDs7QUFDQUwsSUFBQUEsTUFBTSxDQUFDTSxTQUFQLEdBQW1CLE1BQU0sSUFBekI7O0FBQ0FOLElBQUFBLE1BQU0sQ0FBQ08sVUFBUCxDQUFrQi9CLElBQUksQ0FBQ2dDLFFBQUwsQ0FBY0MsYUFBZCxDQUE0QmpCLE1BQU0sQ0FBQ25DLElBQVAsSUFBZSxFQUEzQyxFQUErQ3FDLE9BQS9DLENBQWxCO0FBQ0EsVUFBTWdCLGdCQUFnQixHQUFHLElBQUlDLGtDQUFKLENBQXFCWCxNQUFyQixDQUF6QjtBQUNBVSxJQUFBQSxnQkFBZ0IsQ0FBQ0UsTUFBakIsZUFDRSxvQkFBQyx1QkFBRDtBQUNFLE1BQUEsZUFBZSxFQUFDLG1FQURsQjtBQUVFLE1BQUEsYUFBYSxFQUFFLEtBRmpCO0FBR0UsTUFBQSxTQUFTLEVBQUVGLGdCQUFnQixDQUFDNUQsT0FBakIsQ0FBeUIrRCxJQUF6QixDQUE4QkgsZ0JBQTlCO0FBSGIsTUFERjs7QUFRQSxTQUFLcEgsc0JBQUwsQ0FBNEJ3SCxpQkFBNUIsQ0FBOENkLE1BQTlDLEVBQXNEQSxNQUF0RCxFQUE4RFUsZ0JBQTlEOztBQUVBLFdBQU9WLE1BQVA7QUFDRDtBQUVEO0FBQ0Y7QUFDQTs7O0FBQ0UsUUFBTXZFLFdBQU4sQ0FBa0J2RSxPQUFsQixFQUFvRDtBQUNsRCxRQUFJQSxPQUFPLENBQUNxSCxZQUFSLEtBQXlCN0Isd0JBQWFDLFFBQXRDLElBQWtEekYsT0FBTyxDQUFDcUgsWUFBUixLQUF5QjdCLHdCQUFhUyxPQUE1RixFQUFxRztBQUNuRztBQUNEOztBQUNELFNBQUtsQixhQUFMLENBQW9CL0UsT0FBTyxDQUFDZ0YsT0FBNUI7QUFDRDs7QUFFRCxRQUFNNkUseUJBQU4sQ0FBZ0NqSixNQUFoQyxFQUFnRTtBQUM5RDtBQUNBO0FBQ0EsVUFBTWtKLFNBQVMsR0FBR2xKLE1BQU0sQ0FBQ0Usa0JBQVAsRUFBbEI7O0FBQ0EsUUFDRWdKLFNBQVMsQ0FBQ3JKLE1BQVYsS0FBcUIsQ0FBckIsSUFDQyxLQUFLNkIsVUFBTCxDQUFnQjVDLGlCQUFoQixJQUNDLEtBQUs0QyxVQUFMLENBQWdCNUMsaUJBQWhCLENBQWtDa0IsTUFBbEMsQ0FBeUNSLEtBQXpDLE9BQXFEUSxNQUFNLENBQUNSLEtBQVAsRUFEdEQsSUFFQzBKLFNBQVMsQ0FBQ0MsUUFBVixDQUFtQixLQUFLekgsVUFBTCxDQUFnQjVDLGlCQUFuQyxDQUpKLEVBS0U7QUFDQTtBQUNELEtBWDZELENBYTlEOzs7QUFDQSxVQUFNc0ssaUJBQWlCLEdBQUdGLFNBQVMsQ0FBQy9JLElBQVYsQ0FBZ0JrSixFQUFELElBQVFBLEVBQUUsQ0FBQzNCLE1BQUgsSUFBYSxJQUFiLElBQXFCMkIsRUFBRSxDQUFDM0IsTUFBSCxDQUFVNEIsU0FBdEQsQ0FBMUI7O0FBQ0EsUUFBSUYsaUJBQWlCLElBQUksSUFBekIsRUFBK0I7QUFDN0I7QUFDRDs7QUFFRCxTQUFLMUgsVUFBTCxDQUFnQlQsb0JBQWhCLENBQXFDbUksaUJBQXJDLEVBQXdELEtBQXhEO0FBQ0Q7O0FBRURHLEVBQUFBLGdCQUFnQixDQUFDbkssT0FBRCxFQUFpQztBQUMvQyxRQUFJb0ssbUJBQWlDLEdBQUcsSUFBeEM7QUFDQSxRQUFJQyxtQkFBSjtBQUNBLFFBQUlDLG1CQUFKO0FBQ0EsUUFBSUMsa0JBQUo7O0FBRUEsVUFBTUMsYUFBYSxHQUFHLE1BQU07QUFDMUIsVUFBSUosbUJBQW1CLElBQUksSUFBM0IsRUFBaUM7QUFDL0JBLFFBQUFBLG1CQUFtQixDQUFDSyxPQUFwQjtBQUNBTCxRQUFBQSxtQkFBbUIsR0FBRyxJQUF0QjtBQUNEOztBQUVELFVBQUlDLG1CQUFtQixJQUFJLElBQTNCLEVBQWlDO0FBQy9CQSxRQUFBQSxtQkFBbUIsQ0FBQ3pFLE9BQXBCO0FBQ0F5RSxRQUFBQSxtQkFBbUIsR0FBRyxJQUF0QjtBQUNEO0FBQ0YsS0FWRDs7QUFZQSxXQUFPLElBQUkzRCw0QkFBSixDQUNMLDRDQUFnQyxLQUFLcEUsVUFBTCxDQUFnQjNDLHdCQUFoQixDQUF5Q2dLLElBQXpDLENBQThDLEtBQUtySCxVQUFuRCxDQUFoQyxFQUNHb0ksU0FESCxDQUNjQyxLQUFELElBQVc7QUFDcEJILE1BQUFBLGFBQWE7QUFFYixZQUFNO0FBQUVwSixRQUFBQTtBQUFGLFVBQWV1SixLQUFyQjtBQUNBLFlBQU14SixVQUFVLEdBQUcsS0FBS21CLFVBQUwsQ0FBZ0I1QyxpQkFBbkM7O0FBRUEsVUFBSXlCLFVBQVUsSUFBSSxJQUFkLElBQXNCLENBQUNBLFVBQVUsQ0FBQ21ILE1BQVgsQ0FBa0I0QixTQUE3QyxFQUF3RDtBQUN0RCxZQUFJOUksUUFBUSxJQUFJLEtBQUtnRyxlQUFMLENBQXFCLEtBQUs5RSxVQUFMLENBQWdCOUMsY0FBckMsTUFBeURnRyx3QkFBYW9GLE1BQXRGLEVBQThGO0FBQzVGdEQsVUFBQUEsSUFBSSxDQUFDdUQsYUFBTCxDQUFtQkMsVUFBbkIsQ0FBOEIsa0RBQTlCO0FBQ0Q7O0FBQ0QsZUFBT0MsaUJBQVdDLEtBQVgsRUFBUDtBQUNEOztBQUNELGFBQU9ELGlCQUFXRSxXQUFYLENBQXVCOUosVUFBVSxDQUFDK0osWUFBWCxFQUF2QixFQUFrREMsU0FBbEQsQ0FBNkRyQyxNQUFELElBQVk7QUFDN0UsWUFBSUEsTUFBTSxJQUFJLElBQWQsRUFBb0I7QUFDbEIsZ0JBQU1yQixHQUFHLEdBQUd0RyxVQUFVLENBQUNtSCxNQUFYLENBQWtCYixHQUE5QjtBQUNBLGdCQUFNMkQsUUFBUSxHQUNaM0QsR0FBRyxJQUFJLElBQVAsSUFBZUEsR0FBRyxLQUFLLEVBQXZCLEdBQ0ksdURBREosR0FFSywwQkFBeUJBLEdBQUksRUFIcEM7QUFJQUgsVUFBQUEsSUFBSSxDQUFDdUQsYUFBTCxDQUFtQlEsUUFBbkIsQ0FBNEJELFFBQTVCO0FBQ0EsaUJBQU9MLGlCQUFXQyxLQUFYLEVBQVA7QUFDRDs7QUFDRCxlQUFPRCxpQkFBV08sRUFBWCxDQUFjO0FBQUV4QyxVQUFBQSxNQUFGO0FBQVUxSCxVQUFBQSxRQUFWO0FBQW9CRCxVQUFBQTtBQUFwQixTQUFkLENBQVA7QUFDRCxPQVhNLENBQVA7QUFZRCxLQXpCSCxFQTBCR29LLFNBMUJILENBMEJhLENBQUM7QUFBRXpDLE1BQUFBLE1BQUY7QUFBVTFILE1BQUFBLFFBQVY7QUFBb0JELE1BQUFBO0FBQXBCLEtBQUQsS0FBc0M7QUFDL0MsWUFBTXFLLElBQUksR0FBR3JLLFVBQVUsQ0FBQ3NLLEtBQVgsQ0FBaUJDLEtBQWpCLENBQXVCQyxHQUFwQztBQUNBdkIsTUFBQUEsbUJBQW1CLEdBQUd0QixNQUFNLENBQUM4QyxlQUFQLENBQ3BCLENBQ0UsQ0FBQ0osSUFBRCxFQUFPLENBQVAsQ0FERixFQUVFLENBQUNBLElBQUQsRUFBT0ssUUFBUCxDQUZGLENBRG9CLEVBS3BCO0FBQ0VDLFFBQUFBLFVBQVUsRUFBRTtBQURkLE9BTG9CLENBQXRCO0FBU0FoRCxNQUFBQSxNQUFNLENBQUNpRCxjQUFQLENBQXNCM0IsbUJBQXRCLEVBQTJDO0FBQ3pDNEIsUUFBQUEsSUFBSSxFQUFFLE1BRG1DO0FBRXpDQyxRQUFBQSxLQUFLLEVBQUU7QUFGa0MsT0FBM0M7QUFLQSxZQUFNQyxjQUFjLEdBQUcsOENBQXZCOztBQUNBLFVBQUlBLGNBQWMsSUFBSSxJQUF0QixFQUE0QjtBQUMxQjtBQUNEOztBQUVELFdBQUtoSyxNQUFMLENBQVlpSyx1QkFBWixDQUNFbk0sT0FERixFQUVFbUIsVUFBVSxDQUFDUCxNQUFYLENBQWtCWixPQUFsQixDQUEwQmdGLE9BQTFCLENBQWtDb0gsWUFBbEMsQ0FBK0NDLDBCQUEvQyxJQUE2RSxFQUYvRTs7QUFLQSxVQUNFL0IsbUJBQW1CLElBQUksSUFBdkIsSUFDQSxDQUFDbEosUUFERCxJQUVBRCxVQUFVLENBQUNQLE1BQVgsQ0FBa0IwTCxRQUFsQixLQUErQmhDLG1CQUYvQixJQUdBdEssT0FBTyxLQUFLdUssa0JBSmQsRUFLRTtBQUNBLFlBQUlnQyxPQUFPLEdBQUksOEJBQTZCakMsbUJBQW9CLE9BQU1uSixVQUFVLENBQUNQLE1BQVgsQ0FBa0IwTCxRQUFTLEVBQWpHO0FBQ0EsY0FBTUUsaUJBQWlCLEdBQUdyTCxVQUFVLENBQUNQLE1BQVgsQ0FBa0JaLE9BQTVDOztBQUNBLFlBQUl1SyxrQkFBa0IsSUFBSSxJQUF0QixJQUE4QixDQUFDbkosUUFBL0IsSUFBMkNvTCxpQkFBaUIsS0FBS2pDLGtCQUFyRSxFQUF5RjtBQUN2RixjQUNFQSxrQkFBa0IsQ0FBQ3ZILGFBQW5CLENBQWlDdUQsV0FBakMsSUFBZ0QsSUFBaEQsSUFDQWlHLGlCQUFpQixDQUFDeEosYUFBbEIsQ0FBZ0N1RCxXQUFoQyxJQUErQyxJQUZqRCxFQUdFO0FBQ0FnRyxZQUFBQSxPQUFPLEdBQ0wsaUNBQ0FoQyxrQkFBa0IsQ0FBQ3ZILGFBQW5CLENBQWlDdUQsV0FEakMsR0FFQSxNQUZBLEdBR0FpRyxpQkFBaUIsQ0FBQ3hKLGFBQWxCLENBQWdDdUQsV0FIaEMsR0FJQSxPQUpBLEdBS0FnRyxPQU5GO0FBT0QsV0FYRCxNQVdPO0FBQ0xBLFlBQUFBLE9BQU8sR0FBRyxnQ0FBZ0NBLE9BQTFDO0FBQ0Q7QUFDRjs7QUFDRGxDLFFBQUFBLG1CQUFtQixHQUFHNkIsY0FBYyxDQUFDTyxtQkFBZixDQUNwQjtBQUNFQyxVQUFBQSxTQUFTLEVBQUUsbUJBQ1Q7QUFBSyxZQUFBLFNBQVMsRUFBQztBQUFmLDBCQUNFLG9CQUFDLFVBQUQ7QUFBTSxZQUFBLElBQUksRUFBQztBQUFYLFlBREYsRUFFR0gsT0FGSCxDQUZKO0FBT0VkLFVBQUFBLEtBQUssRUFBRXRLLFVBQVUsQ0FBQ3NLLEtBUHBCO0FBUUVrQixVQUFBQSxRQUFRLEVBQUU7QUFSWixTQURvQixFQVdwQjdELE1BWG9CLENBQXRCOztBQWFBLGFBQUt4SixRQUFMLENBQWNpQyxJQUFkLENBQW1CMUMscUJBQW5CO0FBQ0Q7O0FBQ0R5TCxNQUFBQSxtQkFBbUIsR0FBR25KLFVBQVUsQ0FBQ1AsTUFBWCxDQUFrQjBMLFFBQXhDO0FBQ0EvQixNQUFBQSxrQkFBa0IsR0FBR3BKLFVBQVUsQ0FBQ1AsTUFBWCxDQUFrQlosT0FBdkM7QUFDRCxLQTdGSCxDQURLLEVBZ0dMd0ssYUFoR0ssQ0FBUDtBQWtHRDs7QUFFRG9DLEVBQUFBLHlCQUF5QixDQUFDNU0sT0FBRCxFQUFtQmdGLE9BQW5CLEVBQWtEO0FBQ3pFLFNBQUs1QyxzQkFBTCxHQUE4QixJQUFJc0UsNEJBQUosQ0FBd0IxQixPQUF4QixDQUE5Qjs7QUFDQSxTQUFLNUMsc0JBQUwsQ0FBNEJvQyxHQUE1QixDQUFnQyxLQUFLMkYsZ0JBQUwsQ0FBc0JuSyxPQUF0QixDQUFoQzs7QUFFQSxVQUFNa0ksU0FBUyxHQUFHbEQsT0FBTyxDQUFDNUUsS0FBUixFQUFsQjtBQUVBLFVBQU15TSxhQUFhLEdBQUcsaUNBQW1CLFlBQVk7QUFDbkQsWUFBTXBFLFFBQVEsR0FBRyxNQUFNekQsT0FBTyxDQUFDL0UsT0FBUixFQUF2Qjs7QUFDQSxVQUFJd0ksUUFBUSxJQUFJQSxRQUFRLENBQUNFLElBQXJCLElBQTZCRixRQUFRLENBQUNFLElBQVQsQ0FBYzFJLE9BQS9DLEVBQXdEO0FBQ3REd0ksUUFBQUEsUUFBUSxDQUFDRSxJQUFULENBQWMxSSxPQUFkLENBQXNCb0YsT0FBdEIsQ0FBK0J6RSxNQUFELElBQVk7QUFDeEMsZUFBS3NCLE1BQUwsQ0FBWTRLLFNBQVosQ0FBc0I7QUFDcEI1RSxZQUFBQSxTQURvQjtBQUVwQnRILFlBQUFBO0FBRm9CLFdBQXRCO0FBSUQsU0FMRDtBQU1EO0FBQ0YsS0FWcUIsQ0FBdEI7QUFZQSxVQUFNbU0sY0FBYyxHQUFHLDRDQUNyQnpGLElBQUksQ0FBQ0MsU0FBTCxDQUFleUYsa0JBQWYsQ0FBa0NyRCxJQUFsQyxDQUF1Q3JDLElBQUksQ0FBQ0MsU0FBNUMsQ0FEcUIsRUFFckIwRixPQUZxQixDQUVabkUsTUFBRCxJQUFZO0FBQ3BCLGFBQU8sNENBQWdDQSxNQUFNLENBQUNvRSxTQUFQLENBQWlCdkQsSUFBakIsQ0FBc0JiLE1BQXRCLENBQWhDLEVBQ0pxRSxHQURJLENBQ0EsTUFBTXJFLE1BQU0sQ0FBQ3NFLE9BQVAsRUFETixFQUVKQyxTQUZJLENBRU0sNENBQWdDdkUsTUFBTSxDQUFDd0UsWUFBUCxDQUFvQjNELElBQXBCLENBQXlCYixNQUF6QixDQUFoQyxDQUZOLENBQVA7QUFHRCxLQU5zQixDQUF2Qjs7QUFRQSxTQUFLMUcsc0JBQUwsQ0FBNEJvQyxHQUE1QixDQUNFdUksY0FBYyxDQUFDeEIsU0FBZixDQUF5QixNQUFPZ0MsUUFBUCxJQUFvQjtBQUMzQyxVQUFJQSxRQUFRLElBQUksSUFBWixJQUFvQixDQUFDLEtBQUsvSyx3QkFBTCxDQUE4QmdMLEdBQTlCLENBQWtDRCxRQUFsQyxDQUF6QixFQUFzRTtBQUNwRTtBQUNEOztBQUNELFdBQUsvSyx3QkFBTCxDQUE4QmlMLE1BQTlCLENBQXFDRixRQUFyQzs7QUFDQSxZQUFNLEtBQUtHLGdCQUFMLENBQXNCSCxRQUF0QixFQUFnQyxJQUFoQyxDQUFOO0FBQ0QsS0FORCxDQURGOztBQVVBLFNBQUtuTCxzQkFBTCxDQUE0Qm9DLEdBQTVCLENBQ0VRLE9BQU8sQ0FBQzJJLHVCQUFSLEdBQWtDcEMsU0FBbEMsQ0FBNEMsTUFBT1osS0FBUCxJQUFpQjtBQUMzRCxZQUFNaUQscUJBQXFCLEdBQUcsWUFBWTtBQUN4QyxZQUFJNUksT0FBTyxJQUFJQSxPQUFPLENBQUM2SSxlQUFSLEdBQTBCQyxnQ0FBekMsRUFBMkU7QUFDekUsaUJBQU85SSxPQUFPLENBQ1grSSxpQkFESSxHQUVKQyxJQUZJLENBRUVDLENBQUQsSUFBTztBQUNYLGlCQUFLMUksc0JBQUwsQ0FBNEJ2RixPQUE1QixFQUFxQ3dGLHdCQUFhMEksT0FBbEQ7QUFDRCxXQUpJLEVBS0pDLEtBTEksQ0FLR0MsQ0FBRCxJQUFPO0FBQ1o7QUFDQSxpQkFBS3JKLGFBQUwsQ0FBbUJDLE9BQW5COztBQUNBQSxZQUFBQSxPQUFPLENBQUNVLFVBQVIsR0FBcUJ5SSxLQUFyQixDQUEyQkUsd0JBQTNCO0FBQ0EvRyxZQUFBQSxJQUFJLENBQUN1RCxhQUFMLENBQW1CUSxRQUFuQixDQUNFLGdFQUNFLGdFQURGLEdBRUUsaUVBRkYsR0FHRSxnQkFKSixFQUtFO0FBQ0VpRCxjQUFBQSxNQUFNLEVBQUVGLENBQUMsQ0FBQzdCO0FBRFosYUFMRjtBQVNELFdBbEJJLENBQVA7QUFtQkQ7QUFDRixPQXRCRDs7QUF3QkEsVUFBSTtBQUNGLGNBQU0sS0FBS2dDLG1CQUFMLEdBQTJCUCxJQUEzQixDQUFnQ0oscUJBQWhDLEVBQXVEQSxxQkFBdkQsQ0FBTjtBQUNBLGNBQU1mLGFBQWEsRUFBbkI7QUFDRCxPQUhELENBR0UsT0FBT2pFLEtBQVAsRUFBYztBQUNkLHNDQUFrQkEsS0FBbEI7QUFDRDtBQUNGLEtBL0JELENBREY7O0FBbUNBLFVBQU00RixjQUFjLEdBQUcsSUFBSTVILGFBQUosRUFBdkI7O0FBRUEsVUFBTTZILGtCQUFrQixHQUFJbkMsUUFBRCxJQUF1QjtBQUNoRCxhQUFPdEgsT0FBTyxDQUNYMEosc0JBREksR0FFSnBPLE1BRkksQ0FHRnFPLFNBQUQsSUFDRUEsU0FBUyxDQUFDaEcsSUFBVixDQUFlaUcsbUJBQWYsSUFBdUN0QyxRQUFRLElBQUksSUFBWixJQUFvQkEsUUFBUSxLQUFLcUMsU0FBUyxDQUFDaEcsSUFBVixDQUFlMkQsUUFKdEYsRUFNSnpILElBTkksQ0FNQyxDQU5ELENBQVA7QUFPRCxLQVJEOztBQVVBLFNBQUt6QyxzQkFBTCxDQUE0Qm9DLEdBQTVCLENBQ0VRLE9BQU8sQ0FBQzZKLGlCQUFSLEdBQTRCdEQsU0FBNUIsQ0FBc0MsTUFBTTtBQUMxQyxXQUFLaEcsc0JBQUwsQ0FBNEJ2RixPQUE1QixFQUFxQ3dGLHdCQUFhb0YsTUFBbEQ7QUFDRCxLQUZELENBREYsRUFJRTVGLE9BQU8sQ0FBQzhKLGtCQUFSLEdBQTZCdkQsU0FBN0IsQ0FBdUMsTUFBTTtBQUMzQyxXQUFLakosVUFBTCxDQUFnQmQsc0JBQWhCO0FBQ0QsS0FGRCxDQUpGLEVBT0V3RCxPQUFPLENBQ0o2SixpQkFESCxHQUVHNUIsT0FGSCxDQUVZdEMsS0FBRCxJQUNQSSxpQkFBV0UsV0FBWCxDQUF1QjRCLGFBQWEsRUFBcEMsRUFDR2tDLGNBREgsR0FFR0MsTUFGSCxDQUVVakUsaUJBQVdPLEVBQVgsQ0FBY1gsS0FBZCxDQUZWLEVBR0d3RCxLQUhILENBR1V2RixLQUFELElBQVc7QUFDaEIsb0NBQWtCQSxLQUFsQjtBQUNBLGFBQU9tQyxpQkFBV0MsS0FBWCxFQUFQO0FBQ0QsS0FOSCxFQU9FO0FBQ0E7QUFSRixLQVNHcUMsU0FUSCxDQVNhb0Isa0JBQWtCLENBQUM5RCxLQUFLLENBQUNoQyxJQUFOLENBQVcyRCxRQUFaLENBVC9CLENBSEosRUFjR2YsU0FkSCxDQWNjWixLQUFELElBQXVDO0FBQ2hELFlBQU07QUFBRTJCLFFBQUFBO0FBQUYsVUFBZTNCLEtBQUssQ0FBQ2hDLElBQTNCLENBRGdELENBRWhEOztBQUNBLFdBQUt6RyxNQUFMLENBQVk0SyxTQUFaLENBQXNCO0FBQ3BCNUUsUUFBQUEsU0FEb0I7QUFFcEIrRyxRQUFBQSxjQUFjLEVBQUd0RSxLQUFLLENBQUNoQyxJQUZIO0FBR3BCMkQsUUFBQUE7QUFIb0IsT0FBdEI7O0FBTUEsVUFBSUEsUUFBUSxJQUFJLElBQWhCLEVBQXNCO0FBQ3BCO0FBQ0Q7O0FBQ0QsWUFBTTFMLE1BQU0sR0FBR1osT0FBTyxDQUFDa1AsU0FBUixDQUFrQjVDLFFBQWxCLENBQWY7O0FBQ0EsVUFBSTFMLE1BQU0sSUFBSSxJQUFkLEVBQW9CO0FBQ2xCNE4sUUFBQUEsY0FBYyxDQUFDVyxJQUFmLENBQW9Cdk8sTUFBcEI7QUFDRDtBQUNGLEtBOUJILENBUEYsRUF1Q0U0TixjQUFjLENBQ1g5RCxTQURILENBQ2M5SixNQUFELElBQVk7QUFDckIsWUFBTTtBQUFFbkIsUUFBQUE7QUFBRixVQUFvQixLQUFLNkMsVUFBL0I7QUFDQSxZQUFNOE0saUJBQWlCLEdBQUcsa0JBQUl4TyxNQUFKLEVBQWFxTixDQUFELElBQU9BLENBQUMsQ0FBQ2dCLGNBQUYsQ0FBaUJHLGlCQUFwQyxLQUEwRCxLQUFwRjs7QUFFQSxVQUNFM1AsYUFBYSxJQUFJLElBQWpCLElBQ0FBLGFBQWEsQ0FBQ2UsT0FEZCxJQUVBZixhQUFhLENBQUNXLEtBQWQsT0FBMEJRLE1BQU0sQ0FBQ1IsS0FBUCxFQUYxQixJQUdBZ1AsaUJBSkYsRUFLRTtBQUNBO0FBQ0EsZUFBT3JFLGlCQUFXQyxLQUFYLEVBQVA7QUFDRDs7QUFFRCxZQUFNcUUsbUJBQW1CLEdBQ3ZCLEtBQUsvTSxVQUFMLENBQWdCNUMsaUJBQWhCLElBQXFDLElBQXJDLElBQ0EsS0FBSzRDLFVBQUwsQ0FBZ0I1QyxpQkFBaEIsQ0FBa0NrQixNQUFsQyxDQUF5Q1IsS0FBekMsT0FBcURRLE1BQU0sQ0FBQ1IsS0FBUCxFQUZ2RCxDQWRxQixDQWtCckI7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUNBLGFBQ0UySyxpQkFBV0UsV0FBWCxDQUF1QixLQUFLL0ksTUFBTCxDQUFZb04sZ0JBQVosQ0FBNkIxTyxNQUE3QixFQUFxQ3lPLG1CQUFyQyxDQUF2QixFQUNHTixjQURILEdBRUdDLE1BRkgsQ0FFVWpFLGlCQUFXTyxFQUFYLENBQWMxSyxNQUFkLENBRlYsRUFHRTtBQUhGLE9BSUd5TSxTQUpILENBSWFvQixrQkFBa0IsQ0FBQzdOLE1BQU0sQ0FBQzBMLFFBQVIsQ0FKL0IsRUFLRTtBQUxGLE9BTUdoTSxNQU5ILENBTVUsTUFBTU0sTUFBTSxDQUFDSixPQU52QixFQU9HMk4sS0FQSCxDQU9VdkYsS0FBRCxJQUFXO0FBQ2hCLHNDQUFrQkEsS0FBbEI7QUFDQSxlQUFPbUMsaUJBQVdDLEtBQVgsRUFBUDtBQUNELE9BVkgsQ0FERjtBQWFELEtBdENILEVBdUNHTyxTQXZDSCxDQXVDYzNLLE1BQUQsSUFBWTtBQUNyQixXQUFLaUoseUJBQUwsQ0FBK0JqSixNQUEvQjs7QUFDQSxXQUFLMk8sMkJBQUw7QUFDRCxLQTFDSCxDQXZDRjs7QUFvRkEsU0FBS25OLHNCQUFMLENBQTRCb0MsR0FBNUIsQ0FDRVEsT0FBTyxDQUFDd0ssbUJBQVIsR0FBOEJqRSxTQUE5QixDQUF3QyxNQUFPWixLQUFQLElBQWlCO0FBQ3ZELFVBQUlBLEtBQUssQ0FBQ2hDLElBQU4sQ0FBVzhHLE1BQVgsS0FBc0IsU0FBMUIsRUFBcUM7QUFDbkMsY0FBTTVDLGFBQWEsRUFBbkI7QUFDRCxPQUZELE1BRU8sSUFBSWxDLEtBQUssQ0FBQ2hDLElBQU4sQ0FBVzhHLE1BQVgsS0FBc0IsUUFBMUIsRUFBb0M7QUFDekMsYUFBS3ZOLE1BQUwsQ0FBWXdOLFlBQVosQ0FBeUIxSyxPQUFPLENBQUM1RSxLQUFSLEVBQXpCLEVBQTBDLElBQTFDLEVBQWdEdUssS0FBSyxDQUFDaEMsSUFBTixDQUFXMkQsUUFBM0Q7QUFDRDtBQUNGLEtBTkQsQ0FERjs7QUFVQSxTQUFLbEssc0JBQUwsQ0FBNEJvQyxHQUE1QixDQUNFUSxPQUFPLENBQUMySyw2QkFBUixHQUF3Q3BFLFNBQXhDLENBQW1EWixLQUFELElBQVc7QUFDM0QsVUFBSUEsS0FBSyxDQUFDaEMsSUFBTixJQUFjZ0MsS0FBSyxDQUFDaEMsSUFBTixDQUFXaUgsT0FBN0IsRUFBc0M7QUFDcEMsYUFBS0MsY0FBTCxDQUFvQjdQLE9BQXBCLEVBQTZCbU8sS0FBN0IsQ0FBb0MyQixHQUFELElBQVM7QUFDMUN4SSxVQUFBQSxJQUFJLENBQUN1RCxhQUFMLENBQW1CUSxRQUFuQixDQUE0Qiw0QkFBNUIsRUFBMEQ7QUFDeERpRCxZQUFBQSxNQUFNLEVBQUV3QixHQUFHLENBQUNDLEtBQUosSUFBYUMsTUFBTSxDQUFDRixHQUFEO0FBRDZCLFdBQTFEO0FBR0QsU0FKRDtBQUtELE9BTkQsTUFNTztBQUNMLGFBQUsvSyxhQUFMLENBQW1CQyxPQUFuQjs7QUFDQUEsUUFBQUEsT0FBTyxDQUFDVSxVQUFSLEdBQXFCeUksS0FBckIsQ0FBMkJFLHdCQUEzQjtBQUNEO0FBQ0YsS0FYRCxDQURGOztBQWVBLFNBQUtqTSxzQkFBTCxDQUE0Qm9DLEdBQTVCLENBQ0VRLE9BQU8sQ0FBQzBKLHNCQUFSLEdBQWlDbkQsU0FBakMsQ0FBNENaLEtBQUQsSUFBVztBQUNwRCxZQUFNMkIsUUFBUSxHQUFHM0IsS0FBSyxDQUFDaEMsSUFBTixDQUFXaUcsbUJBQVgsS0FBbUMsS0FBbkMsR0FBMkM3SyxTQUEzQyxHQUF1RDRHLEtBQUssQ0FBQ2hDLElBQU4sQ0FBVzJELFFBQW5GOztBQUNBLFdBQUtwSyxNQUFMLENBQVl3TixZQUFaLENBQXlCMUssT0FBTyxDQUFDNUUsS0FBUixFQUF6QixFQUEwQyxLQUExQyxFQUFpRGtNLFFBQWpEOztBQUNBLFdBQUtoSyxVQUFMLENBQWdCVixnQkFBaEIsQ0FBaUMsS0FBS1UsVUFBTCxDQUFnQjdDLGFBQWpELEVBQWdFLEtBQWhFOztBQUNBLFdBQUs4RixzQkFBTCxDQUE0QnZGLE9BQTVCLEVBQXFDd0Ysd0JBQWEwSSxPQUFsRDtBQUNELEtBTEQsQ0FERjs7QUFTQSxVQUFNK0IsWUFBWSxHQUFHakwsT0FBTyxDQUN6QmtMLG1CQURrQixHQUVsQjVQLE1BRmtCLENBRVZxSyxLQUFELElBQVdBLEtBQUssQ0FBQ2hDLElBQU4sSUFBYyxJQUFkLElBQXNCLE9BQU9nQyxLQUFLLENBQUNoQyxJQUFOLENBQVd3SCxNQUFsQixLQUE2QixRQUZuRCxFQUdsQkMsS0FIa0IsRUFBckI7QUFLQSxVQUFNQyxrQkFBa0IsR0FBR0osWUFBWSxDQUNwQzNQLE1BRHdCLENBQ2hCOE4sQ0FBRCxJQUFPQSxDQUFDLENBQUN6RixJQUFGLENBQU8ySCxRQUFQLEtBQW9CLHNCQURWLEVBRXhCbkQsR0FGd0IsQ0FFbkJpQixDQUFELEtBQVE7QUFDWHBDLE1BQUFBLElBQUksRUFBRSx5QkFBV29DLENBQUMsQ0FBQ3pGLElBQUYsQ0FBTzRILElBQWxCLEVBQXdCdkUsSUFEbkI7QUFFWE8sTUFBQUEsT0FBTyxFQUFFNkIsQ0FBQyxDQUFDekYsSUFBRixDQUFPd0g7QUFGTCxLQUFSLENBRm9CLENBQTNCO0FBTUEsVUFBTUssa0JBQWtCLEdBQUdQLFlBQVksQ0FBQzNQLE1BQWIsQ0FBcUI4TixDQUFELElBQU9BLENBQUMsQ0FBQ3pGLElBQUYsQ0FBTzJILFFBQVAsS0FBb0IsZUFBL0MsQ0FBM0I7O0FBQ0EsU0FBS2xPLHNCQUFMLENBQTRCb0MsR0FBNUIsQ0FDRTZMLGtCQUFrQixDQUFDOUUsU0FBbkIsQ0FBNkIsQ0FBQztBQUFFUyxNQUFBQSxJQUFGO0FBQVFPLE1BQUFBO0FBQVIsS0FBRCxLQUF1QjtBQUNsRGpGLE1BQUFBLElBQUksQ0FBQ3VELGFBQUwsQ0FBbUJyRyxHQUFuQixDQUF1QndILElBQXZCLEVBQTZCTyxPQUE3QjtBQUNELEtBRkQsQ0FERixFQUlFaUUsa0JBQWtCLENBQUNqRixTQUFuQixDQUE4QjZDLENBQUQsSUFBTztBQUNsQyw0QkFBTUEsQ0FBQyxDQUFDekYsSUFBRixDQUFPd0gsTUFBYixFQUFxQi9CLENBQUMsQ0FBQ3pGLElBQUYsQ0FBTzRILElBQVAsSUFBZSxFQUFwQztBQUNELEtBRkQsQ0FKRjs7QUFTQSxVQUFNckssYUFBYSxHQUFHLDhDQUF0Qjs7QUFDQSxRQUFJQSxhQUFhLElBQUksSUFBckIsRUFBMkI7QUFDekIsWUFBTUMsSUFBSSxHQUFHckUsZUFBZSxDQUFDOUIsT0FBTyxDQUFDZ0QsYUFBUixDQUFzQmpCLFdBQXZCLENBQTVCO0FBQ0EsWUFBTXFFLFVBQVUsR0FBR0YsYUFBYSxDQUFDO0FBQy9CL0YsUUFBQUEsRUFBRSxFQUFFZ0csSUFEMkI7QUFFL0JBLFFBQUFBO0FBRitCLE9BQUQsQ0FBaEM7O0FBSUEsV0FBSy9ELHNCQUFMLENBQTRCb0MsR0FBNUIsQ0FBZ0M0QixVQUFoQzs7QUFDQSxZQUFNcUssY0FBYyxHQUFHLElBQUlDLEdBQUosQ0FBUSxDQUM3QixDQUFDLFFBQUQsRUFBVyxPQUFYLENBRDZCLEVBRTdCLENBQUMsU0FBRCxFQUFZLFNBQVosQ0FGNkIsRUFHN0IsQ0FBQyxTQUFELEVBQVksU0FBWixDQUg2QixDQUFSLENBQXZCO0FBS0EsWUFBTUMsa0JBQWtCLEdBQUcsSUFBSWhLLEdBQUosQ0FBUSxDQUFDLFdBQUQsRUFBYyxzQkFBZCxFQUFzQyxlQUF0QyxDQUFSLENBQTNCO0FBQ0EsWUFBTWlLLFNBQVMsR0FBR1gsWUFBWSxDQUMzQjNQLE1BRGUsQ0FDUDhOLENBQUQsSUFBT0EsQ0FBQyxDQUFDekYsSUFBRixDQUFPa0ksa0JBQVAsSUFBNkIsSUFENUIsRUFFZnZRLE1BRmUsQ0FFUDhOLENBQUQsSUFBTyxDQUFDdUMsa0JBQWtCLENBQUNuRCxHQUFuQixDQUF1QlksQ0FBQyxDQUFDekYsSUFBRixDQUFPMkgsUUFBOUIsQ0FGQSxFQUdmbkQsR0FIZSxDQUdWaUIsQ0FBRCxLQUFRO0FBQ1g5SCxRQUFBQSxJQUFJLEVBQUUsd0JBQVU4SCxDQUFDLENBQUN6RixJQUFGLENBQU93SCxNQUFqQixDQURLO0FBRVgzSixRQUFBQSxLQUFLLEVBQUVpSyxjQUFjLENBQUNLLEdBQWYsQ0FBbUIxQyxDQUFDLENBQUN6RixJQUFGLENBQU8ySCxRQUExQixLQUF1QztBQUZuQyxPQUFSLENBSFcsRUFPZmhRLE1BUGUsQ0FPUDhOLENBQUQsSUFBT0EsQ0FBQyxDQUFDNUgsS0FBRixJQUFXLElBUFYsQ0FBbEI7QUFRQSxZQUFNdUssWUFBWSxHQUFHZCxZQUFZLENBQzlCM1AsTUFEa0IsQ0FDVjhOLENBQUQsSUFBT0EsQ0FBQyxDQUFDekYsSUFBRixDQUFPa0ksa0JBQVAsSUFBNkIsSUFEekIsRUFFbEIxRCxHQUZrQixDQUViaUIsQ0FBRCxLQUFRO0FBQ1hrQyxRQUFBQSxRQUFRLEVBQUVsQyxDQUFDLENBQUN6RixJQUFGLENBQU8ySCxRQUROO0FBRVhPLFFBQUFBLGtCQUFrQixFQUFFLHlCQUFXekMsQ0FBQyxDQUFDekYsSUFBRixDQUFPa0ksa0JBQWxCO0FBRlQsT0FBUixDQUZjLENBQXJCO0FBT0EsVUFBSUcsY0FBNEIsR0FBRyxJQUFuQzs7QUFDQSxZQUFNQyxhQUFhLEdBQUcsQ0FBQ3pGLElBQUQsRUFBT2hGLEtBQVAsS0FBaUI7QUFDckMsY0FBTTBLLFFBQVEsR0FBRzFGLElBQUksQ0FBQzJGLFFBQUwsQ0FBYyxJQUFkLENBQWpCO0FBQ0EsY0FBTUMsU0FBUyxHQUFHSixjQUFjLElBQUksSUFBbEIsSUFBMEJBLGNBQWMsQ0FBQ0ssZUFBZixPQUFxQzdLLEtBQWpGOztBQUNBLFlBQUk0SyxTQUFKLEVBQWU7QUFDYkosVUFBQUEsY0FBYyxHQUFHLHlCQUFXQSxjQUFYLEVBQTJCTSxVQUEzQixDQUFzQzlGLElBQXRDLENBQWpCOztBQUNBLGNBQUkwRixRQUFKLEVBQWM7QUFDWkYsWUFBQUEsY0FBYyxDQUFDTyxXQUFmO0FBQ0FQLFlBQUFBLGNBQWMsR0FBRyxJQUFqQjtBQUNEO0FBQ0YsU0FORCxNQU1PO0FBQ0wsY0FBSUEsY0FBYyxJQUFJLElBQXRCLEVBQTRCO0FBQzFCQSxZQUFBQSxjQUFjLENBQUNPLFdBQWY7QUFDRDs7QUFDRFAsVUFBQUEsY0FBYyxHQUFHNUssVUFBVSxDQUFDQyxNQUFYLENBQWtCO0FBQ2pDQyxZQUFBQSxJQUFJLEVBQUVrRixJQUQyQjtBQUVqQ2hGLFlBQUFBLEtBRmlDO0FBR2pDZ0wsWUFBQUEsVUFBVSxFQUFFLENBQUNOO0FBSG9CLFdBQWxCLENBQWpCO0FBS0Q7QUFDRixPQW5CRDs7QUFvQkEsV0FBSzlPLHNCQUFMLENBQTRCb0MsR0FBNUIsQ0FDRW9NLFNBQVMsQ0FBQ3JGLFNBQVYsQ0FBcUI2QyxDQUFELElBQU82QyxhQUFhLENBQUM3QyxDQUFDLENBQUM5SCxJQUFILEVBQVM4SCxDQUFDLENBQUM1SCxLQUFYLENBQXhDLENBREYsRUFFRTZKLGtCQUFrQixDQUFDOUUsU0FBbkIsQ0FBNkIsQ0FBQztBQUFFUyxRQUFBQSxJQUFGO0FBQVFPLFFBQUFBO0FBQVIsT0FBRCxLQUF1QjtBQUNsRGpGLFFBQUFBLElBQUksQ0FBQ3VELGFBQUwsQ0FBbUJyRyxHQUFuQixDQUF1QndILElBQXZCLEVBQTZCTyxPQUE3QjtBQUNELE9BRkQsQ0FGRixFQUtFd0UsWUFBWSxDQUFDeEYsU0FBYixDQUF1QixDQUFDO0FBQUUrRSxRQUFBQSxRQUFGO0FBQVlPLFFBQUFBO0FBQVosT0FBRCxLQUFzQztBQUMzRCxjQUFNckssS0FBSyxHQUFHaUssY0FBYyxDQUFDSyxHQUFmLENBQW1CUixRQUFuQixLQUFnQyxLQUE5QztBQUNBLGNBQU1tQixTQUFTLEdBQUcsSUFBSUMsa0NBQUosQ0FBd0IsS0FBS3BQLFVBQUwsQ0FBZ0I5QyxjQUF4QyxFQUF3RHFSLGtCQUF4RCxFQUE0RWMsY0FBS0MsRUFBTCxFQUE1RSxDQUFsQjtBQUNBSCxRQUFBQSxTQUFTLENBQUNJLFdBQVYsR0FBd0I3RCxJQUF4QixDQUE4QjhELFFBQUQsSUFBYztBQUN6QyxlQUFLclAsY0FBTCxDQUFvQjBNLElBQXBCLENBQXlCO0FBQ3ZCN0ksWUFBQUEsSUFBSSxFQUFHLFVBQVN3TCxRQUFRLENBQUNyUixNQUFPLEdBRFQ7QUFFdkJzUixZQUFBQSxXQUFXLEVBQUVELFFBRlU7QUFHdkJ0TCxZQUFBQTtBQUh1QixXQUF6QjtBQUtELFNBTkQ7QUFPRCxPQVZELENBTEYsRUFnQkUsTUFBTTtBQUNKLFlBQUl3SyxjQUFjLElBQUksSUFBdEIsRUFBNEI7QUFDMUJBLFVBQUFBLGNBQWMsQ0FBQ08sV0FBZjtBQUNEOztBQUNEUCxRQUFBQSxjQUFjLEdBQUcsSUFBakI7QUFDRCxPQXJCSCxDQXNCRTtBQXRCRjtBQXdCRDs7QUFFRCxTQUFLNU8sc0JBQUwsQ0FBNEJvQyxHQUE1QixDQUNFUSxPQUFPLENBQ0pnTix1QkFESCxHQUVHL0UsT0FGSCxDQUVZdEMsS0FBRCxJQUFXO0FBQ2xCLFlBQU07QUFBRXNILFFBQUFBLFVBQUY7QUFBY3hDLFFBQUFBO0FBQWQsVUFBeUI5RSxLQUFLLENBQUNoQyxJQUFyQzs7QUFDQSxVQUFJOEcsTUFBTSxLQUFLeUMsa0NBQXVCQyxPQUFsQyxJQUE2QzFDLE1BQU0sS0FBS3lDLGtDQUF1QkUsT0FBbkYsRUFBNEY7QUFDMUYsZUFBT3JILGlCQUFXTyxFQUFYLENBQWM7QUFDbkJtRSxVQUFBQSxNQURtQjtBQUVuQndDLFVBQUFBLFVBRm1CO0FBR25CSSxVQUFBQSxnQkFBZ0IsRUFBRSxJQUhDO0FBSW5CQyxVQUFBQSxrQkFBa0IsRUFBRTtBQUpELFNBQWQsQ0FBUDtBQU1ELE9BVGlCLENBV2xCO0FBQ0E7QUFDQTs7O0FBQ0EsYUFBTyw0Q0FBZ0MsS0FBS3BRLE1BQUwsQ0FBWXFRLHNCQUFaLENBQW1DNUksSUFBbkMsQ0FBd0MsS0FBS3pILE1BQTdDLENBQWhDLEVBQ0pzUSxTQURJLENBQ00sSUFETixFQUVKckgsU0FGSSxDQUVNLE1BQU07QUFDZixjQUFNa0gsZ0JBQWdCLEdBQUcsS0FBS25RLE1BQUwsQ0FDdEJ1USxjQURzQixHQUV0Qm5TLE1BRnNCLENBRWRvUyxDQUFELElBQU9BLENBQUMsQ0FBQ0MsYUFBRixLQUFvQlYsVUFBVSxDQUFDOVIsRUFGdkIsRUFHdEJ5UyxHQUhzQixFQUF6Qjs7QUFJQSxjQUFNTixrQkFBa0IsR0FBRyxLQUFLcFEsTUFBTCxDQUN4QjJRLHNCQUR3QixHQUV4QnZTLE1BRndCLENBRWhCb1MsQ0FBRCxJQUFPQSxDQUFDLENBQUNDLGFBQUYsS0FBb0JWLFVBQVUsQ0FBQzlSLEVBRnJCLEVBR3hCeVMsR0FId0IsRUFBM0I7O0FBSUEsWUFBSVAsZ0JBQWdCLElBQUksSUFBcEIsSUFBNEJDLGtCQUFrQixJQUFJLElBQXRELEVBQTREO0FBQzFELGlCQUFPdkgsaUJBQVdDLEtBQVgsRUFBUDtBQUNELFNBRkQsTUFFTztBQUNMLGlCQUFPRCxpQkFBV08sRUFBWCxDQUFjO0FBQ25CbUUsWUFBQUEsTUFEbUI7QUFFbkJ3QyxZQUFBQSxVQUZtQjtBQUduQkksWUFBQUEsZ0JBSG1CO0FBSW5CQyxZQUFBQTtBQUptQixXQUFkLENBQVA7QUFNRDtBQUNGLE9BckJJLEVBc0JKek4sSUF0QkksQ0FzQkMsQ0F0QkQsRUF1QkppTyxPQXZCSSxDQXVCSTlULDZCQXZCSixFQXdCSm1QLEtBeEJJLENBd0JHdkYsS0FBRCxJQUFXO0FBQ2hCLFlBQUlBLEtBQUssWUFBWW1LLGtCQUFyQixFQUFtQztBQUNqQ0MsMEJBQU9wSyxLQUFQLENBQ0Usb0NBREYsRUFFRTVJLE9BQU8sQ0FBQ2dELGFBQVIsQ0FBc0JqQixXQUZ4QixFQUdFME4sTUFIRixFQUlFd0MsVUFKRjtBQU1EOztBQUNELGVBQU9sSCxpQkFBV0MsS0FBWCxFQUFQO0FBQ0QsT0FsQ0ksQ0FBUDtBQW1DRCxLQW5ESCxFQW9ER08sU0FwREgsQ0FvRGEsQ0FBQztBQUFFa0UsTUFBQUEsTUFBRjtBQUFVd0MsTUFBQUEsVUFBVjtBQUFzQkksTUFBQUEsZ0JBQXRCO0FBQXdDQyxNQUFBQTtBQUF4QyxLQUFELEtBQWtFO0FBQzNFLFVBQUk3QyxNQUFNLEtBQUt5QyxrQ0FBdUJlLEdBQWxDLElBQXlDaEIsVUFBVSxDQUFDM0osTUFBeEQsRUFBZ0U7QUFDOUQ7QUFDQTtBQUNBLGNBQU1BLE1BQU0sR0FBR3RJLE9BQU8sQ0FBQ3VJLFNBQVIsQ0FBa0IwSixVQUFVLENBQUMzSixNQUE3QixDQUFmOztBQUNBLGFBQUtwRyxNQUFMLENBQVlnUixnQkFBWixDQUNFLENBQ0U7QUFDRUMsVUFBQUEsTUFBTSxFQUFFbEIsVUFBVSxDQUFDa0IsTUFBWCxJQUFxQixDQUQvQjtBQUVFQyxVQUFBQSxPQUFPLEVBQUUsSUFGWDtBQUdFNUgsVUFBQUEsSUFBSSxFQUFFeUcsVUFBVSxDQUFDekcsSUFBWCxJQUFtQixJQUFuQixHQUEwQixDQUFDLENBQTNCLEdBQStCeUcsVUFBVSxDQUFDekcsSUFIbEQ7QUFJRS9ELFVBQUFBLEdBQUcsRUFBRWEsTUFBTSxDQUFDYixHQUpkO0FBS0V0SCxVQUFBQSxFQUFFLEVBQUV3UixjQUFLQyxFQUFMO0FBTE4sU0FERixDQURGLEVBVUUsS0FWRjtBQVlELE9BaEJELE1BZ0JPLElBQUluQyxNQUFNLEtBQUt5QyxrQ0FBdUJFLE9BQXRDLEVBQStDO0FBQ3BELFlBQUlDLGdCQUFnQixJQUFJLElBQXhCLEVBQThCO0FBQzVCLGVBQUtuUSxNQUFMLENBQVltUixpQkFBWixDQUE4QixDQUFDaEIsZ0JBQUQsQ0FBOUI7QUFDRDs7QUFDRCxZQUFJQyxrQkFBa0IsSUFBSSxJQUExQixFQUFnQztBQUM5QixlQUFLcFEsTUFBTCxDQUFZb1IseUJBQVosQ0FBc0NoQixrQkFBa0IsQ0FBQ2xTLEtBQW5CLEVBQXRDO0FBQ0Q7QUFDRixPQVBNLE1BT0EsSUFBSXFQLE1BQU0sS0FBS3lDLGtDQUF1QkMsT0FBdEMsRUFBK0M7QUFDcEQsWUFBSUUsZ0JBQWdCLElBQUksSUFBeEIsRUFBOEI7QUFDNUIsY0FBSSxDQUFDQSxnQkFBZ0IsQ0FBQ2MsTUFBdEIsRUFBOEI7QUFDNUJsQixZQUFBQSxVQUFVLENBQUNrQixNQUFYLEdBQW9CcFAsU0FBcEI7QUFDRDs7QUFDRCxlQUFLN0IsTUFBTCxDQUFZcVIsd0JBQVosQ0FBcUN2VCxPQUFyQyxFQUE4QztBQUM1QyxhQUFDcVMsZ0JBQWdCLENBQUNqUyxLQUFqQixFQUFELEdBQTRCNlI7QUFEZ0IsV0FBOUM7QUFHRDs7QUFDRCxZQUFJSyxrQkFBa0IsSUFBSSxJQUExQixFQUFnQztBQUM5QixlQUFLcFEsTUFBTCxDQUFZc1IseUJBQVosQ0FBc0M7QUFDcEMsYUFBQ2xCLGtCQUFrQixDQUFDbFMsS0FBbkIsRUFBRCxHQUE4QjZSO0FBRE0sV0FBdEM7QUFHRDtBQUNGLE9BZE0sTUFjQTtBQUNMZSx3QkFBT1MsSUFBUCxDQUFZLDBCQUFaLEVBQXdDaEUsTUFBeEMsRUFBZ0R3QyxVQUFoRDtBQUNEO0FBQ0YsS0E3RkgsQ0FERjs7QUFpR0EsU0FBSzdQLHNCQUFMLENBQTRCb0MsR0FBNUIsQ0FDRVEsT0FBTyxDQUFDME8sMEJBQVIsR0FBcUNuSSxTQUFyQyxDQUFnRFosS0FBRCxJQUFXO0FBQ3hEO0FBQ0EsV0FBSzVGLGFBQUwsQ0FBbUJDLE9BQW5CO0FBQ0QsS0FIRCxDQURGOztBQU9BLFNBQUs1QyxzQkFBTCxDQUE0Qm9DLEdBQTVCLENBQ0VRLE9BQU8sQ0FBQzJPLG1CQUFSLEdBQThCcEksU0FBOUIsQ0FBeUNaLEtBQUQsSUFBVztBQUNqRCxXQUFLckwsUUFBTCxDQUFjaUMsSUFBZCxDQUFtQjdDLGtCQUFuQixFQUF1Q2lNLEtBQXZDO0FBQ0QsS0FGRCxDQURGLEVBbFp5RSxDQXdaekU7OztBQUNBLFNBQUt2SSxzQkFBTCxDQUE0Qm9DLEdBQTVCLENBQWdDLE1BQU07QUFDcEMsWUFBTW9QLG9CQUFvQixHQUFHLEtBQUsxUixNQUFMLENBQVl1USxjQUFaLEdBQTZCblMsTUFBN0IsQ0FBcUN1VCxFQUFELElBQVFBLEVBQUUsQ0FBQ3BNLEdBQUgsQ0FBT0MsVUFBUCxDQUFrQkMsNEJBQWxCLENBQTVDLENBQTdCOztBQUNBLFVBQUlpTSxvQkFBb0IsQ0FBQ25ULE1BQXJCLEdBQThCLENBQWxDLEVBQXFDO0FBQ25DLGFBQUt5QixNQUFMLENBQVltUixpQkFBWixDQUE4Qk8sb0JBQTlCO0FBQ0Q7QUFDRixLQUxEO0FBTUQ7O0FBRURyRSxFQUFBQSwyQkFBMkIsR0FBUztBQUNsQyxVQUFNdUUsdUJBQXVCLEdBQUcsbURBQWhDOztBQUNBLFFBQUlBLHVCQUF1QixJQUFJLElBQS9CLEVBQXFDO0FBQ25DLFlBQU1DLG1CQUFtQixHQUFHRCx1QkFBdUIsQ0FBQyxVQUFELEVBQWEsd0JBQWIsRUFBdUMsSUFBdkMsRUFBNkMsS0FBN0MsQ0FBbkQ7O0FBQ0EsVUFBSUMsbUJBQW1CLElBQUksSUFBM0IsRUFBaUM7QUFDL0IsYUFBSzNSLHNCQUFMLENBQTRCb0MsR0FBNUIsQ0FBZ0N1UCxtQkFBaEM7QUFDRDtBQUNGO0FBQ0Y7O0FBRURDLEVBQUFBLHVCQUF1QixDQUFDcFUsUUFBRCxFQUFxQztBQUMxRCxXQUFPLEtBQUtOLFFBQUwsQ0FBY08sRUFBZCxDQUFpQmhCLHFCQUFqQixFQUF3Q2UsUUFBeEMsQ0FBUDtBQUNEOztBQUVEcVUsRUFBQUEsc0JBQXNCLENBQUNyVSxRQUFELEVBQTJEO0FBQy9FLFdBQU8sS0FBS04sUUFBTCxDQUFjTyxFQUFkLENBQWlCakIsbUJBQWpCLEVBQXNDZ0IsUUFBdEMsQ0FBUDtBQUNEOztBQUVEc1UsRUFBQUEsZ0JBQWdCLENBQUN0VSxRQUFELEVBQW9FO0FBQ2xGLFdBQU8sS0FBS04sUUFBTCxDQUFjTyxFQUFkLENBQWlCbkIsa0JBQWpCLEVBQXFDa0IsUUFBckMsQ0FBUDtBQUNEOztBQUVEdVUsRUFBQUEsc0JBQXNCLENBQUN2VSxRQUFELEVBQXdGO0FBQzVHLFdBQU8sS0FBS04sUUFBTCxDQUFjTyxFQUFkLENBQWlCbEIsaUJBQWpCLEVBQW9DaUIsUUFBcEMsQ0FBUDtBQUNEOztBQUVEa0gsRUFBQUEsZ0JBQWdCLENBQUM3RSxLQUFELEVBQTJDO0FBQ3pELFFBQUltUyxNQUF1QixHQUFHLEVBQTlCOztBQUNBLFFBQUluUyxLQUFLLElBQUksSUFBVCxJQUFpQkEsS0FBSyxDQUFDb1MsaUJBQU4sSUFBMkIsSUFBaEQsRUFBc0Q7QUFDcEQsYUFBT0QsTUFBUDtBQUNEOztBQUNELFFBQUk7QUFDRkEsTUFBQUEsTUFBTSxHQUFHblMsS0FBSyxDQUFDb1MsaUJBQU4sQ0FBd0JsSCxHQUF4QixDQUE2QjhFLFVBQUQsSUFBZ0I7QUFDbkQsY0FBTTRCLEVBQWlCLEdBQUc7QUFDeEJwTSxVQUFBQSxHQUFHLEVBQUV3SyxVQUFVLENBQUN4SyxHQURRO0FBRXhCK0QsVUFBQUEsSUFBSSxFQUFFeUcsVUFBVSxDQUFDcUMsWUFGTztBQUd4Qm5CLFVBQUFBLE1BQU0sRUFBRWxCLFVBQVUsQ0FBQ2tCLE1BSEs7QUFJeEJDLFVBQUFBLE9BQU8sRUFBRW5CLFVBQVUsQ0FBQ21CLE9BSkk7QUFLeEJqVCxVQUFBQSxFQUFFLEVBQUV3UixjQUFLQyxFQUFMO0FBTG9CLFNBQTFCOztBQU9BLFlBQUlLLFVBQVUsQ0FBQ3NDLFNBQVgsSUFBd0IsSUFBeEIsSUFBZ0N0QyxVQUFVLENBQUNzQyxTQUFYLENBQXFCQyxJQUFyQixPQUFnQyxFQUFwRSxFQUF3RTtBQUN0RVgsVUFBQUEsRUFBRSxDQUFDVSxTQUFILEdBQWV0QyxVQUFVLENBQUNzQyxTQUExQjtBQUNEOztBQUNELFlBQUl0QyxVQUFVLENBQUN3QyxVQUFYLElBQXlCLElBQXpCLElBQWlDeEMsVUFBVSxDQUFDd0MsVUFBWCxDQUFzQkQsSUFBdEIsT0FBaUMsRUFBdEUsRUFBMEU7QUFDeEVYLFVBQUFBLEVBQUUsQ0FBQ1ksVUFBSCxHQUFnQnhDLFVBQVUsQ0FBQ3dDLFVBQTNCO0FBQ0Q7O0FBQ0QsZUFBT1osRUFBUDtBQUNELE9BZlEsQ0FBVDtBQWdCRCxLQWpCRCxDQWlCRSxPQUFPekYsQ0FBUCxFQUFVLENBQUU7O0FBRWQsV0FBT2dHLE1BQVA7QUFDRDs7QUFFRHJOLEVBQUFBLHdCQUF3QixDQUFDOUUsS0FBRCxFQUFnRDtBQUN0RSxRQUFJbVMsTUFBNEIsR0FBRyxFQUFuQzs7QUFDQSxRQUFJblMsS0FBSyxJQUFJLElBQVQsSUFBaUJBLEtBQUssQ0FBQ3lTLG1CQUFOLElBQTZCLElBQWxELEVBQXdEO0FBQ3RELGFBQU9OLE1BQVA7QUFDRDs7QUFDRCxRQUFJO0FBQ0ZBLE1BQUFBLE1BQU0sR0FBR25TLEtBQUssQ0FBQ3lTLG1CQUFOLENBQTBCdkgsR0FBMUIsQ0FBK0J3SCxFQUFELElBQVE7QUFDN0MsZUFBTyxJQUFJQyxpQ0FBSixDQUF1QkQsRUFBRSxDQUFDeE8sSUFBMUIsRUFBZ0N3TyxFQUFFLENBQUN2QixPQUFuQyxFQUE0Q3VCLEVBQUUsQ0FBQ0UsWUFBL0MsQ0FBUDtBQUNELE9BRlEsQ0FBVDtBQUdELEtBSkQsQ0FJRSxPQUFPekcsQ0FBUCxFQUFVLENBQUU7O0FBRWQsV0FBT2dHLE1BQVA7QUFDRDs7QUFFRHBOLEVBQUFBLHlCQUF5QixDQUFDL0UsS0FBRCxFQUFpRDtBQUN4RSxRQUFJbVMsTUFBNkIsR0FBRyxFQUFwQzs7QUFDQSxRQUFJblMsS0FBSyxJQUFJLElBQVQsSUFBaUJBLEtBQUssQ0FBQzZTLG9CQUFOLElBQThCLElBQW5ELEVBQXlEO0FBQ3ZELGFBQU9WLE1BQVA7QUFDRDs7QUFDRCxRQUFJO0FBQ0ZBLE1BQUFBLE1BQU0sR0FBR25TLEtBQUssQ0FBQzZTLG9CQUFOLENBQTJCM0gsR0FBM0IsQ0FBZ0M0SCxZQUFELElBQWtCO0FBQ3hELGVBQU8sSUFBSUMsa0NBQUosQ0FBd0JELFlBQVksQ0FBQ3pVLE1BQXJDLEVBQTZDeVUsWUFBWSxDQUFDRSxLQUExRCxFQUFpRUYsWUFBWSxDQUFDM0IsT0FBOUUsQ0FBUDtBQUNELE9BRlEsQ0FBVDtBQUdELEtBSkQsQ0FJRSxPQUFPaEYsQ0FBUCxFQUFVLENBQUU7O0FBRWQsV0FBT2dHLE1BQVA7QUFDRDs7QUFFRG5OLEVBQUFBLHFCQUFxQixDQUFDaEYsS0FBRCxFQUF3QztBQUMzRCxRQUFJbVMsTUFBb0IsR0FBRyxFQUEzQjs7QUFDQSxRQUFJblMsS0FBSyxJQUFJLElBQVQsSUFBaUJBLEtBQUssQ0FBQ2lULGdCQUFOLElBQTBCLElBQS9DLEVBQXFEO0FBQ25ELGFBQU9kLE1BQVA7QUFDRDs7QUFDRCxRQUFJO0FBQ0ZBLE1BQUFBLE1BQU0sR0FBR25TLEtBQUssQ0FBQ2lULGdCQUFOLENBQXVCL0gsR0FBdkIsQ0FBNEJoSCxJQUFELElBQVUsSUFBSWdQLHlCQUFKLENBQWVoUCxJQUFmLENBQXJDLENBQVQ7QUFDRCxLQUZELENBRUUsT0FBT2lJLENBQVAsRUFBVSxDQUFFOztBQUVkLFdBQU9nRyxNQUFQO0FBQ0Q7O0FBRUQ3TyxFQUFBQSxzQkFBc0IsQ0FBQ3ZGLE9BQUQsRUFBb0JvVixJQUFwQixFQUFrRDtBQUN0RSxTQUFLOVYsUUFBTCxDQUFjaUMsSUFBZCxDQUFtQjVDLGlCQUFuQixFQUFzQztBQUNwQzRSLE1BQUFBLElBQUksRUFBRTtBQUNKdlEsUUFBQUEsT0FESTtBQUVKb1YsUUFBQUE7QUFGSTtBQUQ4QixLQUF0QztBQU1EOztBQUVEQyxFQUFBQSwwQkFBMEIsQ0FBQ0MsTUFBRCxFQUFrQnJELFVBQWxCLEVBQTJEO0FBQ25GLFFBQUlBLFVBQVUsSUFBSSxJQUFsQixFQUF3QjtBQUN0QixXQUFLL1AsTUFBTCxDQUFZcVQsYUFBWixDQUEwQnRELFVBQTFCLEVBQXNDcUQsTUFBdEM7O0FBQ0EsVUFBSXJELFVBQVUsWUFBWXVELHlCQUExQixFQUFzQztBQUNwQyxlQUFPLEtBQUs5SCxnQkFBTCxDQUFzQnVFLFVBQVUsQ0FBQ3hLLEdBQWpDLENBQVA7QUFDRCxPQUZELE1BRU8sSUFBSXdLLFVBQVUsWUFBWTJDLGlDQUExQixFQUE4QztBQUNuRCxlQUFPLEtBQUthLHdCQUFMLEVBQVA7QUFDRCxPQUZNLE1BRUE7QUFDTCw4QkFBTXhRLDJCQUFnQnlRLG9DQUF0QjtBQUNBLGVBQU8sS0FBS0MseUJBQUwsRUFBUDtBQUNEO0FBQ0Y7O0FBRUQsU0FBS3pULE1BQUwsQ0FBWTBULDZCQUFaLENBQTBDTixNQUExQzs7QUFDQSxXQUFPLEtBQUsvRyxtQkFBTCxFQUFQO0FBQ0Q7O0FBRUQsUUFBTTJFLGdCQUFOLENBQXVCMkMsYUFBdkIsRUFBc0U7QUFDcEUsMEJBQU01USwyQkFBZ0I2USx1QkFBdEI7O0FBQ0EsU0FBSzVULE1BQUwsQ0FBWWdSLGdCQUFaLENBQTZCMkMsYUFBN0I7O0FBRUEsVUFBTUUsSUFBSSxHQUFHLElBQUlwUCxHQUFKLEVBQWI7O0FBQ0EsU0FBSyxNQUFNa04sRUFBWCxJQUFpQmdDLGFBQWpCLEVBQWdDO0FBQzlCRSxNQUFBQSxJQUFJLENBQUN2UixHQUFMLENBQVNxUCxFQUFFLENBQUNwTSxHQUFaO0FBQ0Q7O0FBRUQsVUFBTXVPLFFBQVEsR0FBRyxFQUFqQjs7QUFDQSxTQUFLLE1BQU12TyxHQUFYLElBQWtCc08sSUFBbEIsRUFBd0I7QUFDdEJDLE1BQUFBLFFBQVEsQ0FBQ0MsSUFBVCxDQUFjLEtBQUt2SSxnQkFBTCxDQUFzQmpHLEdBQXRCLENBQWQ7QUFDRDs7QUFFRCxVQUFNeU8sT0FBTyxDQUFDQyxHQUFSLENBQVlILFFBQVosQ0FBTjtBQUNEOztBQUVESSxFQUFBQSxtQkFBbUIsQ0FBQzNPLEdBQUQsRUFBYytELElBQWQsRUFBMkM7QUFDNUQsMEJBQU12RywyQkFBZ0JvUiw4QkFBdEI7O0FBQ0EsVUFBTUMsUUFBUSxHQUFHLEtBQUtwVSxNQUFMLENBQVlxVSxtQkFBWixDQUFnQzlPLEdBQWhDLEVBQXFDK0QsSUFBckMsQ0FBakI7O0FBQ0EsUUFBSThLLFFBQVEsSUFBSSxJQUFoQixFQUFzQjtBQUNwQixhQUFPLEtBQUtwRCxnQkFBTCxDQUFzQixDQUFDO0FBQUUxSCxRQUFBQSxJQUFGO0FBQVEySCxRQUFBQSxNQUFNLEVBQUUsQ0FBaEI7QUFBbUJDLFFBQUFBLE9BQU8sRUFBRSxJQUE1QjtBQUFrQ2pULFFBQUFBLEVBQUUsRUFBRXdSLGNBQUtDLEVBQUwsRUFBdEM7QUFBaURuSyxRQUFBQTtBQUFqRCxPQUFELENBQXRCLENBQVA7QUFDRDs7QUFDRCxXQUFPeU8sT0FBTyxDQUFDTSxPQUFSLENBQWdCelMsU0FBaEIsQ0FBUDtBQUNEOztBQUVEMFMsRUFBQUEsc0JBQXNCLENBQUNoUCxHQUFELEVBQWMrRCxJQUFkLEVBQTJDO0FBQy9ELDBCQUFNdkcsMkJBQWdCeVIsMEJBQXRCOztBQUNBLFVBQU1KLFFBQVEsR0FBRyxLQUFLcFUsTUFBTCxDQUFZcVUsbUJBQVosQ0FBZ0M5TyxHQUFoQyxFQUFxQytELElBQXJDLENBQWpCOztBQUNBLFFBQUk4SyxRQUFRLElBQUksSUFBaEIsRUFBc0I7QUFDcEIsYUFBTyxLQUFLcEQsZ0JBQUwsQ0FBc0IsQ0FBQztBQUFFMUgsUUFBQUEsSUFBRjtBQUFRMkgsUUFBQUEsTUFBTSxFQUFFLENBQWhCO0FBQW1CQyxRQUFBQSxPQUFPLEVBQUUsSUFBNUI7QUFBa0NqVCxRQUFBQSxFQUFFLEVBQUV3UixjQUFLQyxFQUFMLEVBQXRDO0FBQWlEbkssUUFBQUE7QUFBakQsT0FBRCxDQUF0QixDQUFQO0FBQ0QsS0FGRCxNQUVPO0FBQ0wsYUFBTyxLQUFLNEwsaUJBQUwsQ0FBdUJpRCxRQUFRLENBQUNsVyxLQUFULEVBQXZCLEVBQXlDLElBQXpDLENBQVA7QUFDRDtBQUNGOztBQUVEdVcsRUFBQUEsaUJBQWlCLENBQUNkLGFBQUQsRUFBaUM7QUFDaEQsU0FBSzNULE1BQUwsQ0FBWXlVLGlCQUFaLENBQThCZCxhQUE5Qjs7QUFFQSxVQUFNZSxVQUFVLEdBQUcsSUFBSWpRLEdBQUosQ0FBUWtQLGFBQWEsQ0FBQzFJLEdBQWQsQ0FBbUIwRyxFQUFELElBQVFBLEVBQUUsQ0FBQ3BNLEdBQTdCLENBQVIsQ0FBbkI7O0FBQ0EsU0FBSyxNQUFNQSxHQUFYLElBQWtCbVAsVUFBbEIsRUFBOEI7QUFDNUIsV0FBS3BVLHdCQUFMLENBQThCZ0MsR0FBOUIsQ0FBa0NpRCxHQUFsQztBQUNEO0FBQ0Y7O0FBRUQsUUFBTTRMLGlCQUFOLENBQXdCbFQsRUFBeEIsRUFBcUMwVyxhQUF1QixHQUFHLEtBQS9ELEVBQXFGO0FBQ25GLFVBQU1DLFFBQVEsR0FBRyxLQUFLNVUsTUFBTCxDQUFZdVEsY0FBWixHQUE2Qm5TLE1BQTdCLENBQXFDdVQsRUFBRCxJQUFRMVQsRUFBRSxJQUFJLElBQU4sSUFBYzBULEVBQUUsQ0FBQ3pULEtBQUgsT0FBZUQsRUFBekUsQ0FBakI7O0FBQ0EsVUFBTTRXLFdBQVcsR0FBRywwQkFBU0QsUUFBVCxFQUFvQmpELEVBQUQsSUFBUUEsRUFBRSxDQUFDcE0sR0FBOUIsRUFBbUMwRixHQUFuQyxDQUF3QzBHLEVBQUQsSUFBUUEsRUFBRSxDQUFDcE0sR0FBbEQsQ0FBcEI7O0FBRUEsU0FBS3ZGLE1BQUwsQ0FBWW1SLGlCQUFaLENBQThCeUQsUUFBOUI7O0FBRUEsUUFBSTNXLEVBQUUsSUFBSSxJQUFWLEVBQWdCO0FBQ2QsNEJBQU04RSwyQkFBZ0IrUiw4QkFBdEI7QUFDRCxLQUZELE1BRU8sSUFBSSxDQUFDSCxhQUFMLEVBQW9CO0FBQ3pCLDRCQUFNNVIsMkJBQWdCZ1MsMEJBQXRCO0FBQ0Q7O0FBRUQsVUFBTWYsT0FBTyxDQUFDQyxHQUFSLENBQVlZLFdBQVcsQ0FBQzVKLEdBQVosQ0FBaUIxRixHQUFELElBQVMsS0FBS2lHLGdCQUFMLENBQXNCakcsR0FBdEIsQ0FBekIsQ0FBWixDQUFOO0FBQ0Q7O0FBRUR5UCxFQUFBQSx1QkFBdUIsQ0FBQ0MsU0FBRCxFQUFvQztBQUN6RCxTQUFLalYsTUFBTCxDQUFZZ1YsdUJBQVosQ0FBb0NDLFNBQXBDOztBQUNBLFdBQU8sS0FBSzVJLG1CQUFMLEVBQVA7QUFDRDs7QUFFRDZJLEVBQUFBLHFCQUFxQixHQUFTO0FBQzVCLFNBQUtsVixNQUFMLENBQVlrVixxQkFBWixDQUFrQyxFQUFsQztBQUNEOztBQUVEQyxFQUFBQSx3QkFBd0IsQ0FBQ2xYLEVBQUQsRUFBYW1YLGVBQWIsRUFBcUQ7QUFDM0UsU0FBS3BWLE1BQUwsQ0FBWXNSLHlCQUFaLENBQXNDO0FBQUUsT0FBQ3JULEVBQUQsR0FBTTtBQUFFZ0csUUFBQUEsSUFBSSxFQUFFbVI7QUFBUjtBQUFSLEtBQXRDOztBQUNBLFdBQU8sS0FBSzdCLHdCQUFMLEVBQVA7QUFDRDs7QUFFRG5DLEVBQUFBLHlCQUF5QixDQUFDblQsRUFBRCxFQUE2QjtBQUNwRCxTQUFLK0IsTUFBTCxDQUFZb1IseUJBQVosQ0FBc0NuVCxFQUF0Qzs7QUFDQSxXQUFPLEtBQUtzVix3QkFBTCxFQUFQO0FBQ0Q7O0FBRUQsUUFBTThCLGdCQUFOLENBQXVCQyxTQUF2QixFQUFnRTtBQUM5RCxVQUFNO0FBQUVoWSxNQUFBQTtBQUFGLFFBQXFCLEtBQUsySCxTQUFoQzs7QUFDQSxRQUFJM0gsY0FBYyxJQUFJLElBQXRCLEVBQTRCO0FBQzFCO0FBQ0Q7O0FBRUQsVUFBTXdGLE9BQU8sR0FBR3hGLGNBQWMsQ0FBQ3dGLE9BQS9CO0FBQ0EsMEJBQU1DLDJCQUFnQndTLHlCQUF0Qjs7QUFDQSxRQUFJQyxPQUFPLENBQUMxUyxPQUFPLENBQUNvSCxZQUFSLENBQXFCdUwsK0JBQXRCLENBQVgsRUFBbUU7QUFDakUsWUFBTTNTLE9BQU8sQ0FBQzRTLE1BQVIsQ0FBZSxrQkFBZixFQUFtQztBQUN2Q0osUUFBQUE7QUFEdUMsT0FBbkMsQ0FBTjtBQUdEO0FBQ0Y7O0FBRUQsUUFBTUssYUFBTixDQUFvQnBRLEdBQXBCLEVBQWlDK0QsSUFBakMsRUFBOEQ7QUFDNUQsVUFBTTtBQUFFL0wsTUFBQUEsYUFBRjtBQUFpQkQsTUFBQUE7QUFBakIsUUFBb0MsS0FBSzJILFNBQS9DOztBQUNBLFFBQUkxSCxhQUFhLElBQUksSUFBakIsSUFBeUJELGNBQWMsSUFBSSxJQUEvQyxFQUFxRDtBQUNuRDtBQUNEOztBQUVELFVBQU13RixPQUFPLEdBQUd4RixjQUFjLENBQUN3RixPQUEvQjtBQUVBLDBCQUFNQywyQkFBZ0I2Uyw2QkFBdEI7O0FBQ0EsUUFBSUosT0FBTyxDQUFDMVMsT0FBTyxDQUFDb0gsWUFBUixDQUFxQjJMLDBCQUF0QixDQUFYLEVBQThEO0FBQzVELFlBQU0vUyxPQUFPLENBQUM0UyxNQUFSLENBQWUsb0JBQWYsRUFBcUM7QUFDekN0UCxRQUFBQSxNQUFNLEVBQUU5SSxjQUFjLENBQUMrSSxTQUFmLENBQXlCO0FBQUVQLFVBQUFBLElBQUksRUFBRVA7QUFBUixTQUF6QixFQUF3Q2lCLEdBRFA7QUFFekM4QyxRQUFBQSxJQUZ5QztBQUd6Q2MsUUFBQUEsUUFBUSxFQUFFN00sYUFBYSxDQUFDNk07QUFIaUIsT0FBckMsQ0FBTjtBQUtBO0FBQ0Q7O0FBQ0QsVUFBTWdLLFFBQVEsR0FBRyxLQUFLcFUsTUFBTCxDQUFZcVUsbUJBQVosQ0FBZ0M5TyxHQUFoQyxFQUFxQytELElBQXJDLENBQWpCOztBQUNBLFFBQUk4SyxRQUFRLElBQUksSUFBaEIsRUFBc0I7QUFDcEIsWUFBTSxLQUFLcEQsZ0JBQUwsQ0FBc0IsQ0FBQztBQUFFMUgsUUFBQUEsSUFBRjtBQUFRMkgsUUFBQUEsTUFBTSxFQUFFLENBQWhCO0FBQW1CQyxRQUFBQSxPQUFPLEVBQUUsSUFBNUI7QUFBa0NqVCxRQUFBQSxFQUFFLEVBQUV3UixjQUFLQyxFQUFMLEVBQXRDO0FBQWlEbkssUUFBQUE7QUFBakQsT0FBRCxDQUF0QixDQUFOOztBQUNBLFlBQU11USx1QkFBdUIsR0FBRyxLQUFLOVYsTUFBTCxDQUFZcVUsbUJBQVosQ0FBZ0M5TyxHQUFoQyxFQUFxQytELElBQXJDLENBQWhDOztBQUNBLDJCQUFVd00sdUJBQXVCLElBQUksSUFBckM7O0FBRUEsWUFBTUMsZ0JBQWdCLEdBQUcsTUFBTTtBQUM3QixhQUFLNUUsaUJBQUwsQ0FBdUIyRSx1QkFBdUIsQ0FBQzVYLEtBQXhCLEVBQXZCLEVBQXdEO0FBQUs7QUFBN0QsVUFBbUYrTixLQUFuRixDQUEwRnZGLEtBQUQsSUFDdkYsOEJBQW1CLGlEQUFnRG9ILE1BQU0sQ0FBQ3BILEtBQUQsQ0FBUSxFQUFqRixDQURGO0FBR0FzUCxRQUFBQSwwQkFBMEIsQ0FBQ3RTLE9BQTNCOztBQUNBLGFBQUt4RCxzQkFBTCxDQUE0QitWLE1BQTVCLENBQW1DRCwwQkFBbkM7O0FBQ0EsYUFBSzlWLHNCQUFMLENBQTRCK1YsTUFBNUIsQ0FBbUNGLGdCQUFuQztBQUNELE9BUEQsQ0FMb0IsQ0FjcEI7OztBQUNBLFlBQU1DLDBCQUEwQixHQUFHLElBQUl4Uiw0QkFBSixDQUNqQzFCLE9BQU8sQ0FBQzZKLGlCQUFSLEdBQTRCaEssSUFBNUIsQ0FBaUMsQ0FBakMsRUFBb0MwRyxTQUFwQyxDQUE4QzBNLGdCQUE5QyxDQURpQyxDQUFuQyxDQWZvQixDQWtCcEI7O0FBQ0EsV0FBSzdWLHNCQUFMLENBQTRCb0MsR0FBNUIsQ0FBZ0MwVCwwQkFBaEMsRUFBNERELGdCQUE1RDtBQUNEOztBQUNELFVBQU14WSxhQUFhLENBQUMyWSxRQUFkLEVBQU47QUFDRDs7QUFFREMsRUFBQUEsa0JBQWtCLENBQUNsUyxJQUFELEVBQXFCO0FBQ3JDLDBCQUFNbEIsMkJBQWdCcVQsNkJBQXRCO0FBQ0EsV0FBTyxLQUFLcFcsTUFBTCxDQUFZbVcsa0JBQVosQ0FBK0JsUyxJQUEvQixDQUFQO0FBQ0Q7O0FBRURvUyxFQUFBQSxxQkFBcUIsQ0FBQ3BZLEVBQUQsRUFBYXFZLE9BQWIsRUFBb0M7QUFDdkQsMEJBQU12VCwyQkFBZ0J3VCxnQ0FBdEI7QUFDQSxXQUFPLEtBQUt2VyxNQUFMLENBQVlxVyxxQkFBWixDQUFrQ3BZLEVBQWxDLEVBQXNDcVksT0FBdEMsQ0FBUDtBQUNEOztBQUVERSxFQUFBQSxzQkFBc0IsQ0FBQ3ZZLEVBQUQsRUFBb0I7QUFDeEMsMEJBQU04RSwyQkFBZ0IwVCxnQ0FBdEI7O0FBQ0EsU0FBS3pXLE1BQUwsQ0FBWXdXLHNCQUFaLENBQW1DdlksRUFBbkM7QUFDRDs7QUFFRHlZLEVBQUFBLGdCQUFnQixDQUFDQyxhQUFELEVBQWdEO0FBQzlELFdBQU8sSUFBSTFELHlCQUFKLENBQWUwRCxhQUFmLENBQVA7QUFDRDs7QUFFRCxRQUFNQyxnQkFBTixDQUF1QkMsZ0JBQXZCLEVBQXlEN1EsU0FBekQsRUFBZ0c7QUFDOUYsUUFBSWxJLE9BQUo7QUFDQSxRQUFJZ0YsT0FBSjs7QUFDQSxVQUFNZ1UsWUFBWSxHQUFJcFEsS0FBRCxJQUFrQjtBQUNyQyxVQUFJLEtBQUtyRyxNQUFMLElBQWUsSUFBbkIsRUFBeUI7QUFDdkIsYUFBS0EsTUFBTCxDQUFZMFcsT0FBWixDQUFvQnJRLEtBQXBCOztBQUNBLGFBQUtyRyxNQUFMLEdBQWMsSUFBZDtBQUNEOztBQUNELDRCQUFNMEMsMkJBQWdCaVUsbUJBQXRCLEVBQTJDLEVBQTNDO0FBQ0EsWUFBTUMsWUFBWSxHQUFHdlEsS0FBSyxZQUFZL0YsS0FBakIsR0FBeUIrRixLQUFLLENBQUMyRCxPQUEvQixHQUF5QzNELEtBQTlEO0FBQ0F0QixNQUFBQSxJQUFJLENBQUN1RCxhQUFMLENBQW1CUSxRQUFuQixDQUE2QixxQ0FBb0M4TixZQUFhLEVBQTlFOztBQUVBLFVBQUksS0FBS2pYLE1BQUwsQ0FBWXlELFlBQVosTUFBOEIsSUFBOUIsSUFBc0MsS0FBS3pELE1BQUwsQ0FBWXlELFlBQVosR0FBMkJsRixNQUEzQixLQUFzQyxDQUFoRixFQUFtRjtBQUNqRixhQUFLNEIsbUJBQUwsQ0FBeUJ1RCxPQUF6QjtBQUNEOztBQUNELFVBQUlaLE9BQU8sSUFBSSxJQUFYLElBQW1CLENBQUNBLE9BQU8sQ0FBQ29VLGNBQVIsRUFBeEIsRUFBa0Q7QUFDaEQsYUFBS3JVLGFBQUwsQ0FBbUJDLE9BQW5COztBQUNBQSxRQUFBQSxPQUFPLENBQUNVLFVBQVIsR0FBcUJ5SSxLQUFyQixDQUEyQkUsd0JBQTNCO0FBQ0Q7O0FBQ0QsVUFBSXJPLE9BQU8sSUFBSSxJQUFmLEVBQXFCO0FBQ25CLGFBQUtrQyxNQUFMLENBQVlrRCxhQUFaLENBQTBCcEYsT0FBTyxDQUFDSSxLQUFSLEVBQTFCOztBQUNBLGFBQUttRixzQkFBTCxDQUE0QnZGLE9BQTVCLEVBQXFDd0Ysd0JBQWFTLE9BQWxEO0FBQ0Q7QUFDRixLQXBCRDs7QUFzQkEsUUFBSTtBQUNGLFVBQUlqRCxhQUFKO0FBQ0EsVUFBSXFXLGlCQUFKLENBRkUsQ0FHRjs7QUFDQSxVQUFJLENBQUNOLGdCQUFnQixDQUFDTSxpQkFBdEIsRUFBeUM7QUFDdkNBLFFBQUFBLGlCQUFpQixHQUFHLE1BQU0sS0FBS0MseUJBQUwsQ0FBK0JQLGdCQUEvQixDQUExQjtBQUNBL1YsUUFBQUEsYUFBYSxHQUFHLEVBQ2QsR0FBRytWLGdCQURXO0FBRWRNLFVBQUFBO0FBRmMsU0FBaEI7QUFJRCxPQU5ELE1BTU87QUFDTDtBQUNBclcsUUFBQUEsYUFBYSxHQUFHK1YsZ0JBQWhCO0FBQ0Q7O0FBQ0QvVixNQUFBQSxhQUFhLEdBQUcsTUFBTSxxREFBMEJBLGFBQTFCLENBQXRCO0FBQ0EsWUFBTTtBQUFFakIsUUFBQUEsV0FBRjtBQUFld1gsUUFBQUEsdUJBQWY7QUFBd0NDLFFBQUFBLHNCQUF4QztBQUFnRUMsUUFBQUE7QUFBaEUsVUFBMkZ6VyxhQUFqRztBQUVBLDRCQUFNaUMsMkJBQWdCeVUsY0FBdEIsRUFBc0M7QUFDcENDLFFBQUFBLFdBQVcsRUFBRTNXLGFBQWEsQ0FBQ2pCLFdBRFM7QUFFcEM2WCxRQUFBQSxVQUFVLEVBQUU7QUFGd0IsT0FBdEM7QUFLQSxZQUFNQywwQkFBMEIsR0FBRyxJQUFJblQsNEJBQUosRUFBbkM7O0FBRUEsWUFBTW9ULGlCQUFpQixHQUFJQyxVQUFELElBQWdCO0FBQ3hDLGVBQU9DLE1BQU0sQ0FBQ0MsTUFBUCxDQUFjO0FBQ25CQyxVQUFBQSxhQUFhLEVBQUUsT0FBT0MsT0FBUCxFQUF3QnhYLElBQXhCLEtBQTZFO0FBQzFGLG1CQUFPb1gsVUFBVSxDQUFDbkMsTUFBWCxDQUFrQnVDLE9BQWxCLEVBQTJCeFgsSUFBM0IsQ0FBUDtBQUNELFdBSGtCO0FBSW5CZ1IsVUFBQUEsbUJBQW1CLEVBQUVvRyxVQUFVLENBQUNwRyxtQkFBWCxDQUErQmhLLElBQS9CLENBQW9Db1EsVUFBcEM7QUFKRixTQUFkLENBQVA7QUFNRCxPQVBEOztBQVNBLFlBQU1LLHVCQUF1QixHQUFHLE1BQU9DLE1BQVAsSUFBa0M7QUFDaEUsY0FBTU4sVUFBVSxHQUFHLE1BQU0sS0FBS08scUJBQUwsQ0FDdkJELE1BRHVCLEVBRXZCQSxNQUFNLENBQUNoQixpQkFBUCxJQUE0QkEsaUJBRkwsRUFHdkJuUixTQUh1QixDQUF6QixDQURnRSxDQU9oRTs7QUFDQSxZQUFJLEtBQUtoRyxNQUFMLENBQVl5RCxZQUFaLEdBQTJCbEYsTUFBM0IsS0FBc0MsQ0FBMUMsRUFBNkM7QUFDM0MsZUFBSzhaLHdCQUFMO0FBQ0Q7O0FBRUR2YSxRQUFBQSxPQUFPLEdBQUcsS0FBS2tDLE1BQUwsQ0FBWXNZLFVBQVosQ0FBdUJILE1BQXZCLEVBQStCTixVQUEvQixDQUFWOztBQUNBLGFBQUt6WCxVQUFMLENBQWdCYixpQkFBaEIsQ0FBa0N6QixPQUFsQyxFQUEyQyxLQUEzQzs7QUFDQSxhQUFLdUYsc0JBQUwsQ0FBNEJ2RixPQUE1QixFQUFxQ3dGLHdCQUFhaVYsUUFBbEQ7O0FBQ0EsYUFBS25iLFFBQUwsQ0FBY2lDLElBQWQsQ0FBbUIzQyxtQkFBbkIsRUFBd0N5YixNQUF4Qzs7QUFDQSxhQUFLek4seUJBQUwsQ0FBK0I1TSxPQUEvQixFQUF3QytaLFVBQXhDOztBQUNBelMsUUFBQUEsSUFBSSxDQUFDb1QsUUFBTCxDQUFjQyxRQUFkLENBQXVCclQsSUFBSSxDQUFDc1QsS0FBTCxDQUFXQyxPQUFYLENBQW1CdlQsSUFBSSxDQUFDQyxTQUF4QixDQUF2QixFQUEyRCxlQUEzRDtBQUNBLGNBQU13UyxVQUFVLENBQUNlLFVBQVgsQ0FBc0I7QUFDMUJDLFVBQUFBLFFBQVEsRUFBRSxNQURnQjtBQUUxQkMsVUFBQUEsU0FBUyxFQUFFalosV0FGZTtBQUcxQmtaLFVBQUFBLFVBQVUsRUFBRSxNQUhjO0FBSTFCQyxVQUFBQSxhQUFhLEVBQUUsSUFKVztBQUsxQkMsVUFBQUEsZUFBZSxFQUFFLElBTFM7QUFNMUJDLFVBQUFBLG9CQUFvQixFQUFFLElBTkk7QUFPMUJDLFVBQUFBLHNCQUFzQixFQUFFLEtBUEU7QUFRMUJDLFVBQUFBLDRCQUE0QixFQUFFLG1EQUF3QixJQVI1QjtBQVMxQkMsVUFBQUEsTUFBTSxFQUFFO0FBVGtCLFNBQXRCLENBQU47O0FBWUEsWUFBSWhDLHVCQUF1QixJQUFJLElBQS9CLEVBQXFDO0FBQ25DO0FBQ0E7QUFDQSxnQkFBTWlDLFFBQVEsR0FBR2pDLHVCQUF1QixDQUFDTyxpQkFBaUIsQ0FBQ0MsVUFBRCxDQUFsQixDQUF4Qzs7QUFDQSxjQUFJeUIsUUFBUSxJQUFJLElBQWhCLEVBQXNCO0FBQ3BCM0IsWUFBQUEsMEJBQTBCLENBQUNyVixHQUEzQixDQUErQmdYLFFBQS9CO0FBQ0Q7QUFDRjs7QUFFRCxhQUFLdFosTUFBTCxDQUFZaUssdUJBQVosQ0FBb0NuTSxPQUFwQyxFQUE2QytaLFVBQVUsQ0FBQ2xNLGVBQVgsR0FBNkJ4QiwwQkFBN0IsSUFBMkQsRUFBeEc7O0FBQ0EsZUFBTzBOLFVBQVA7QUFDRCxPQXpDRDs7QUEyQ0EvVSxNQUFBQSxPQUFPLEdBQUcsTUFBTW9WLHVCQUF1QixDQUFDcFgsYUFBRCxDQUF2Qzs7QUFFQSxZQUFNeVksZUFBZSxHQUFHLE1BQU07QUFDNUIsWUFBSXpiLE9BQU8sSUFBSSxJQUFmLEVBQXFCO0FBQ25CQSxVQUFBQSxPQUFPLENBQUMwYix3QkFBUjs7QUFDQSxlQUFLblcsc0JBQUwsQ0FBNEJ2RixPQUE1QixFQUFxQ3dGLHdCQUFhMEksT0FBbEQ7O0FBQ0EsZUFBSzVMLFVBQUwsQ0FBZ0JiLGlCQUFoQixDQUFrQ3pCLE9BQWxDLEVBQTJDLEtBQTNDOztBQUNBLGNBQUl5WixzQkFBc0IsSUFBSSxJQUExQixJQUFrQ3pVLE9BQU8sSUFBSSxJQUFqRCxFQUF1RDtBQUNyRDtBQUNBO0FBQ0Esa0JBQU13VyxRQUFRLEdBQUcvQixzQkFBc0IsQ0FBQ0ssaUJBQWlCLENBQUM5VSxPQUFELENBQWxCLENBQXZDOztBQUNBLGdCQUFJd1csUUFBUSxJQUFJLElBQWhCLEVBQXNCO0FBQ3BCM0IsY0FBQUEsMEJBQTBCLENBQUNyVixHQUEzQixDQUErQmdYLFFBQS9CO0FBQ0Q7QUFDRjtBQUNGO0FBQ0YsT0FkRCxDQTlFRSxDQThGRjtBQUNBOzs7QUFDQSxXQUFLRyxxQkFBTCxDQUEyQjNXLE9BQTNCLEVBQW9DaEMsYUFBcEMsRUFDR2dMLElBREgsQ0FDUSxNQUFNeU4sZUFBZSxFQUQ3QixFQUVHdE4sS0FGSCxDQUVTLE1BQU92RixLQUFQLElBQWlCO0FBQ3RCLFlBQUk1SSxPQUFPLElBQUksSUFBZixFQUFxQjtBQUNuQixlQUFLdUUsV0FBTCxDQUFpQnZFLE9BQWpCO0FBQ0Q7O0FBRUQsWUFDRWdELGFBQWEsQ0FBQzRZLFNBQWQsS0FBNEIsUUFBNUIsSUFDQTVZLGFBQWEsQ0FBQ3FXLGlCQUFkLElBQW1DLElBRG5DLElBRUFyVyxhQUFhLENBQUNxVyxpQkFBZCxDQUFnQzNWLE9BQWhDLEtBQTRDLE1BRjVDLE1BR0E7QUFDQTtBQUNDbVksb0JBQUdDLFFBQUgsT0FBa0IsT0FBbEIsSUFBNkJ6WSxvQkFBVzBZLFFBQVgsQ0FBb0IvWSxhQUFhLENBQUNELFNBQWxDLENBTDlCLENBREYsRUFPRTtBQUNBQyxVQUFBQSxhQUFhLENBQUNxVyxpQkFBZCxDQUFnQzFXLElBQWhDLEdBQXVDLENBQ3JDSyxhQUFhLENBQUNxVyxpQkFBZCxDQUFnQzNWLE9BREssRUFFckMsR0FBR1YsYUFBYSxDQUFDcVcsaUJBQWQsQ0FBZ0MxVyxJQUZFLENBQXZDO0FBSUFLLFVBQUFBLGFBQWEsQ0FBQ3FXLGlCQUFkLENBQWdDM1YsT0FBaEMsR0FBMEMsTUFBMUM7QUFFQSxnQkFBTXlWLFlBQVksR0FBR3ZRLEtBQUssWUFBWS9GLEtBQWpCLEdBQXlCK0YsS0FBSyxDQUFDMkQsT0FBL0IsR0FBeUMzRCxLQUE5RDtBQUNBdEIsVUFBQUEsSUFBSSxDQUFDdUQsYUFBTCxDQUFtQkMsVUFBbkIsQ0FDRyw0REFBMkRxTyxZQUFhLElBQXpFLEdBQ0UsaURBRko7QUFLQW5VLFVBQUFBLE9BQU8sR0FBRyxNQUFNb1YsdUJBQXVCLENBQUNwWCxhQUFELENBQXZDOztBQUNBLGVBQUsyWSxxQkFBTCxDQUEyQjNXLE9BQTNCLEVBQW9DaEMsYUFBcEMsRUFDR2dMLElBREgsQ0FDUSxNQUFNeU4sZUFBZSxFQUQ3QixFQUVHdE4sS0FGSCxDQUVTNkssWUFGVDtBQUdELFNBeEJELE1Bd0JPO0FBQ0xBLFVBQUFBLFlBQVksQ0FBQ3BRLEtBQUQsQ0FBWjtBQUNEO0FBQ0YsT0FsQ0g7O0FBb0NBLFVBQUk0USxzQkFBc0IsSUFBSSxJQUExQixJQUFrQ3hVLE9BQU8sSUFBSSxJQUFqRCxFQUF1RDtBQUNyRCxjQUFNd1csUUFBUSxHQUFHaEMsc0JBQXNCLENBQUNNLGlCQUFpQixDQUFDOVUsT0FBRCxDQUFsQixDQUF2Qzs7QUFDQSxZQUFJd1csUUFBUSxJQUFJLElBQWhCLEVBQXNCO0FBQ3BCM0IsVUFBQUEsMEJBQTBCLENBQUNyVixHQUEzQixDQUErQmdYLFFBQS9CO0FBQ0Q7QUFDRjs7QUFFRCxXQUFLcFosc0JBQUwsQ0FBNEJvQyxHQUE1QixDQUFnQyxNQUFNO0FBQ3BDLGFBQUt0QyxNQUFMLENBQVk4WixvQkFBWixDQUFpQyxNQUFNO0FBQ3JDLGNBQUksQ0FBQyxLQUFLQyxRQUFMLEdBQWdCdFcsWUFBaEIsR0FBK0JvRSxRQUEvQixDQUF3Qy9KLE9BQXhDLENBQUwsRUFBdUQ7QUFDckQ2WixZQUFBQSwwQkFBMEIsQ0FBQ2pVLE9BQTNCO0FBQ0Q7QUFDRixTQUpEO0FBS0QsT0FORDs7QUFPQSxXQUFLeEQsc0JBQUwsQ0FBNEJvQyxHQUE1QixDQUFnQ3FWLDBCQUFoQzs7QUFFQSxhQUFPN1osT0FBUDtBQUNELEtBckpELENBcUpFLE9BQU80SSxLQUFQLEVBQWM7QUFDZG9RLE1BQUFBLFlBQVksQ0FBQ3BRLEtBQUQsQ0FBWjtBQUNBLGFBQU8sSUFBUDtBQUNEO0FBQ0Y7O0FBRUQsUUFBTTBRLHlCQUFOLENBQWdDdFcsYUFBaEMsRUFBaUc7QUFDL0YsUUFBSUEsYUFBYSxDQUFDcVcsaUJBQWQsSUFBbUMsSUFBdkMsRUFBNkM7QUFDM0MsYUFBT3JXLGFBQWEsQ0FBQ3FXLGlCQUFyQjtBQUNEOztBQUNELFdBQU8sd0VBQTRDclcsYUFBYSxDQUFDRCxTQUExRCxFQUFxRW1aLHdCQUFyRSxDQUNMbFosYUFBYSxDQUFDakIsV0FEVCxDQUFQO0FBR0Q7O0FBRUQsUUFBTXVZLHFCQUFOLENBQ0V0WCxhQURGLEVBRUVxVyxpQkFGRixFQUdFblIsU0FIRixFQUkyQjtBQUN6QixVQUFNO0FBQUVuRixNQUFBQTtBQUFGLFFBQWdCQyxhQUF0QjtBQUNBLFVBQU1tWixPQUFPLEdBQUcsd0VBQTRDcFosU0FBNUMsQ0FBaEI7QUFDQSxVQUFNcVosT0FBTyxHQUFHLE1BQU1ELE9BQU8sQ0FBQ0UsZ0NBQVIsRUFBdEI7QUFFQSxVQUFNQyxtQkFBNEMsR0FBRyxFQUFyRDtBQUNBLFVBQU1DLG9CQUE2QyxHQUFHLEVBQXREOztBQUNBLFFBQUl2WixhQUFhLENBQUN3WixrQkFBZCxJQUFvQyxJQUF4QyxFQUE4QztBQUM1Q0YsTUFBQUEsbUJBQW1CLENBQUNyRyxJQUFwQixDQUF5QmpULGFBQWEsQ0FBQ3daLGtCQUF2QztBQUNEOztBQUNELFFBQUl4WixhQUFhLENBQUN5WixtQkFBZCxJQUFxQyxJQUF6QyxFQUErQztBQUM3Q0YsTUFBQUEsb0JBQW9CLENBQUN0RyxJQUFyQixDQUEwQmpULGFBQWEsQ0FBQ3laLG1CQUF4QztBQUNEOztBQUNELFVBQU1WLFFBQVEsR0FBRzFZLG9CQUFXMFksUUFBWCxDQUFvQmhaLFNBQXBCLENBQWpCOztBQUNBLFFBQUlnWixRQUFKLEVBQWM7QUFDWk8sTUFBQUEsbUJBQW1CLENBQUNyRyxJQUFwQixDQUF5QixvREFBekI7QUFDQXNHLE1BQUFBLG9CQUFvQixDQUFDdEcsSUFBckIsQ0FBMEIsbURBQXVCbFQsU0FBdkIsQ0FBMUI7QUFDRDs7QUFDRCxXQUFPLElBQUkyWixxQ0FBSixDQUNMeFUsU0FESyxFQUVMOEssZUFGSyxFQUdMcUcsaUJBSEssRUFJTDtBQUFFc0QsTUFBQUEsT0FBTyxFQUFFM1osYUFBYSxDQUFDakIsV0FBekI7QUFBc0M2YSxNQUFBQSxJQUFJLEVBQUUsY0FBNUM7QUFBNERiLE1BQUFBO0FBQTVELEtBSkssRUFLTEssT0FMSyxFQU1MRSxtQkFOSyxFQU9MQyxvQkFQSyxFQVFMLEtBQUs3WixjQVJBLEVBU0xnVixPQUFPLENBQUMxVSxhQUFhLENBQUM2WixVQUFmLENBVEYsQ0FBUDtBQVdEOztBQUVELFFBQU1sQixxQkFBTixDQUE0QjNXLE9BQTVCLEVBQXFEaEMsYUFBckQsRUFBbUc7QUFDakcsUUFBSUEsYUFBYSxDQUFDNFksU0FBZCxLQUE0QixRQUFoQyxFQUEwQztBQUN4QyxZQUFNNVcsT0FBTyxDQUFDOFgsTUFBUixDQUFlOVosYUFBYSxDQUFDcVgsTUFBN0IsQ0FBTjtBQUNELEtBRkQsTUFFTztBQUNMO0FBQ0EsWUFBTXJWLE9BQU8sQ0FBQytYLE1BQVIsQ0FBZS9aLGFBQWEsQ0FBQ3FYLE1BQTdCLENBQU47QUFDRDtBQUNGOztBQUVEeFIsRUFBQUEscUJBQXFCLENBQUNwQixHQUFELEVBQW9CO0FBQ3ZDLFNBQUt2RixNQUFMLENBQVk4YSxvQkFBWixDQUFpQ3ZWLEdBQWpDO0FBQ0Q7O0FBZ0VEd1YsRUFBQUEsaUJBQWlCLEdBQVk7QUFDM0IsVUFBTWpkLE9BQU8sR0FBRyxLQUFLOEMsa0JBQUwsRUFBaEI7O0FBQ0EsV0FBTzlDLE9BQU8sSUFBSSxJQUFYLElBQW1CQSxPQUFPLENBQUNnRCxhQUFSLENBQXNCa2EsYUFBdEIsS0FBd0MsSUFBbEU7QUFDRDs7QUFFRCxRQUFNck4sY0FBTixDQUFxQjdQLE9BQXJCLEVBQXVEO0FBQ3JELFFBQUlBLE9BQU8sQ0FBQ2dGLE9BQVIsQ0FBZ0JvSCxZQUFoQixDQUE2QitRLHNCQUFqQyxFQUF5RDtBQUN2RCxZQUFNbmQsT0FBTyxDQUFDZ0YsT0FBUixDQUFnQjRTLE1BQWhCLENBQXVCLFNBQXZCLEVBQWtDLElBQWxDLENBQU47QUFDRDs7QUFDRCxVQUFNNVgsT0FBTyxDQUFDZ0YsT0FBUixDQUFnQlUsVUFBaEIsQ0FBMkIsSUFBM0IsQ0FBTjtBQUNBLFVBQU0sb0JBQU0sR0FBTixDQUFOO0FBQ0EsVUFBTSxLQUFLMFgsY0FBTCxDQUFvQnBkLE9BQU8sQ0FBQ2dELGFBQTVCLENBQU47QUFDRDtBQUVEO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7OztBQUNFLFFBQU1vYSxjQUFOLENBQXFCL0MsTUFBckIsRUFBNEQ7QUFDMUQsU0FBSzlYLE1BQUwsR0FBYyw4QkFBYyw4QkFBZCxDQUFkLENBRDBELENBRzFEO0FBQ0E7O0FBQ0ErRSxJQUFBQSxJQUFJLENBQUNDLFNBQUwsQ0FBZWxELElBQWYsQ0FBb0I1RixnQkFBcEIsRUFBc0M7QUFBRTRlLE1BQUFBLGNBQWMsRUFBRTtBQUFsQixLQUF0QztBQUVBLFVBQU0sS0FBS3ZFLGdCQUFMLENBQXNCdUIsTUFBdEIsRUFBOEIxSSxjQUFLQyxFQUFMLEVBQTlCLENBQU47O0FBRUEsUUFBSSxLQUFLMVAsTUFBTCxDQUFZeUQsWUFBWixHQUEyQmxGLE1BQTNCLEdBQW9DLENBQXhDLEVBQTJDO0FBQ3pDLFlBQU02YyxhQUFhLEdBQUcsS0FBS3BiLE1BQUwsQ0FDbkJ5RCxZQURtQixHQUVuQndILEdBRm1CLENBRWYsQ0FBQztBQUFFbkssUUFBQUE7QUFBRixPQUFELEtBQXdCLEdBQUVBLGFBQWEsQ0FBQ2pCLFdBQVksS0FBSWlCLGFBQWEsQ0FBQ3VELFdBQWQsSUFBNkIsRUFBRyxFQUZ6RSxDQUF0Qjs7QUFHQSw0QkFBTXRCLDJCQUFnQnNZLG9CQUF0QixFQUE0QztBQUMxQ0MsUUFBQUEsY0FBYyxFQUFFLEtBQUt0YixNQUFMLENBQVl5RCxZQUFaLEdBQTJCbEYsTUFERDtBQUUxQzZjLFFBQUFBO0FBRjBDLE9BQTVDO0FBSUQ7QUFDRjs7QUFtRURyQixFQUFBQSxRQUFRLEdBQVc7QUFDakIsV0FBTyxLQUFLL1osTUFBWjtBQUNEOztBQUVELFFBQU1xTSxtQkFBTixHQUEyQztBQUN6QyxVQUFNMkgsT0FBTyxDQUFDQyxHQUFSLENBQ0osMEJBQVMsS0FBS2pVLE1BQUwsQ0FBWXVRLGNBQVosRUFBVCxFQUF3Q29CLEVBQUQsSUFBUUEsRUFBRSxDQUFDcE0sR0FBbEQsRUFBdUQwRixHQUF2RCxDQUE0RDBHLEVBQUQsSUFBUSxLQUFLbkcsZ0JBQUwsQ0FBc0JtRyxFQUFFLENBQUNwTSxHQUF6QixFQUE4QixLQUE5QixDQUFuRSxDQURJLENBQU47QUFHQSxVQUFNLEtBQUtnTyx3QkFBTCxFQUFOLENBSnlDLENBS3pDOztBQUNBLFVBQU0sS0FBS0UseUJBQUwsRUFBTjtBQUNEOztBQUVELFFBQU1qSSxnQkFBTixDQUF1QmpHLEdBQXZCLEVBQW9DZ1csY0FBd0IsR0FBRyxLQUEvRCxFQUFxRjtBQUNuRixVQUFNemQsT0FBTyxHQUFHLEtBQUs4QyxrQkFBTCxFQUFoQjs7QUFDQSxVQUFNa0MsT0FBTyxHQUFHLEtBQUswWSxrQkFBTCxFQUFoQjs7QUFDQSxRQUFJMWQsT0FBTyxJQUFJLElBQVgsSUFBbUJnRixPQUFPLElBQUksSUFBOUIsSUFBc0MsQ0FBQ0EsT0FBTyxDQUFDMlkscUJBQVIsRUFBM0MsRUFBNEU7QUFDMUU7QUFDRDs7QUFFRCxVQUFNQyxpQkFBaUIsR0FBSSxDQUFDSCxjQUFjLEdBQUcsS0FBS3ZiLE1BQUwsQ0FBWTJiLGdCQUFaLEVBQUgsR0FBb0MsS0FBSzNiLE1BQUwsQ0FBWXVRLGNBQVosRUFBbkQsRUFBaUZuUyxNQUFqRixDQUN4QnVULEVBQUQsSUFBUSxLQUFLM1IsTUFBTCxDQUFZNGIsdUJBQVosTUFBeUNqSyxFQUFFLENBQUNULE9BQTVDLElBQXVEUyxFQUFFLENBQUNwTSxHQUFILEtBQVdBLEdBRGpELENBQTNCO0FBSUEsVUFBTXNXLFNBQVMsR0FBRy9kLE9BQU8sQ0FBQ3VJLFNBQVIsQ0FBa0I7QUFDbENQLE1BQUFBLElBQUksRUFBRVAsR0FENEI7QUFFbEN0QixNQUFBQSxJQUFJLEVBQUU5QyxvQkFBVzJhLFFBQVgsQ0FBb0J2VyxHQUFwQjtBQUY0QixLQUFsQixFQUdmaUIsR0FISDs7QUFLQSxRQUFJLENBQUMrVSxjQUFELElBQW1CRyxpQkFBaUIsQ0FBQ25kLE1BQWxCLEdBQTJCLENBQTlDLElBQW1ELENBQUNzZCxTQUFTLENBQUNFLFdBQTlELElBQTZFTCxpQkFBaUIsQ0FBQyxDQUFELENBQWpCLENBQXFCSyxXQUF0RyxFQUFtSDtBQUNqSEYsTUFBQUEsU0FBUyxDQUFDRSxXQUFWLEdBQXdCTCxpQkFBaUIsQ0FBQyxDQUFELENBQWpCLENBQXFCSyxXQUE3QztBQUNELEtBbEJrRixDQW9CbkY7OztBQUNBLFVBQU14VixRQUFRLEdBQUcsTUFBTXpELE9BQU8sQ0FBQ2taLGNBQVIsQ0FBdUI7QUFDNUM1VixNQUFBQSxNQUFNLEVBQUd5VixTQURtQztBQUU1Q0ksTUFBQUEsS0FBSyxFQUFFUCxpQkFBaUIsQ0FBQ3pRLEdBQWxCLENBQXVCMEcsRUFBRCxJQUFRQSxFQUFFLENBQUNySSxJQUFqQyxDQUZxQztBQUc1QzRTLE1BQUFBLFdBQVcsRUFBRVIsaUJBQWlCLENBQUN6USxHQUFsQixDQUF1QjBHLEVBQUQsSUFBUTtBQUN6QyxjQUFNd0ssUUFBZ0IsR0FBRztBQUN2QjdTLFVBQUFBLElBQUksRUFBRXFJLEVBQUUsQ0FBQ3JJO0FBRGMsU0FBekIsQ0FEeUMsQ0FJekM7QUFDQTtBQUNBOztBQUNBLFlBQUlxSSxFQUFFLENBQUNWLE1BQUgsSUFBYSxJQUFiLElBQXFCVSxFQUFFLENBQUNWLE1BQUgsR0FBWSxDQUFyQyxFQUF3QztBQUN0Q2tMLFVBQUFBLFFBQVEsQ0FBQ2xMLE1BQVQsR0FBa0JVLEVBQUUsQ0FBQ1YsTUFBckI7QUFDRDs7QUFDRCxZQUFJVSxFQUFFLENBQUNVLFNBQUgsSUFBZ0IsSUFBaEIsSUFBd0JWLEVBQUUsQ0FBQ1UsU0FBSCxLQUFpQixFQUE3QyxFQUFpRDtBQUMvQzhKLFVBQUFBLFFBQVEsQ0FBQzlKLFNBQVQsR0FBcUJWLEVBQUUsQ0FBQ1UsU0FBeEI7QUFDRDs7QUFDRCxZQUFJVixFQUFFLENBQUNZLFVBQUgsSUFBaUIsSUFBakIsSUFBeUJaLEVBQUUsQ0FBQ1ksVUFBSCxLQUFrQixFQUEvQyxFQUFtRDtBQUNqRDRKLFVBQUFBLFFBQVEsQ0FBQzVKLFVBQVQsR0FBc0JaLEVBQUUsQ0FBQ1ksVUFBekI7QUFDRDs7QUFDRCxlQUFPNEosUUFBUDtBQUNELE9BakJZLENBSCtCO0FBcUI1Q1osTUFBQUE7QUFyQjRDLEtBQXZCLENBQXZCOztBQXVCQSxRQUFJaFYsUUFBUSxJQUFJLElBQVosSUFBb0JBLFFBQVEsQ0FBQ0UsSUFBVCxJQUFpQixJQUF6QyxFQUErQztBQUM3QztBQUNEOztBQUVELFVBQU00SCxJQUFnRCxHQUFHLEVBQXpEOztBQUNBLFNBQUssSUFBSStOLENBQUMsR0FBRyxDQUFiLEVBQWdCQSxDQUFDLEdBQUdWLGlCQUFpQixDQUFDbmQsTUFBdEMsRUFBOEM2ZCxDQUFDLEVBQS9DLEVBQW1EO0FBQ2pEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxZQUFNQyxJQUFJLEdBQUdkLGNBQWMsR0FBR0csaUJBQWlCLENBQUNVLENBQUQsQ0FBakIsQ0FBcUJuZSxFQUF4QixHQUE2QnlkLGlCQUFpQixDQUFDVSxDQUFELENBQWpCLENBQXFCbGUsS0FBckIsRUFBeEQ7QUFFQW1RLE1BQUFBLElBQUksQ0FBQ2dPLElBQUQsQ0FBSixHQUFhOVYsUUFBUSxDQUFDRSxJQUFULENBQWN5VixXQUFkLENBQTBCRSxDQUExQixDQUFiOztBQUNBLFVBQUksQ0FBQ1YsaUJBQWlCLENBQUNVLENBQUQsQ0FBakIsQ0FBcUJuTCxNQUExQixFQUFrQztBQUNoQztBQUNBNUMsUUFBQUEsSUFBSSxDQUFDZ08sSUFBRCxDQUFKLENBQVdwTCxNQUFYLEdBQW9CcFAsU0FBcEI7QUFDRDtBQUNGOztBQUVELFNBQUs3QixNQUFMLENBQVlxUix3QkFBWixDQUFxQ3ZULE9BQXJDLEVBQThDdVEsSUFBOUM7QUFDRDs7QUFFRG1OLEVBQUFBLGtCQUFrQixHQUFvQjtBQUNwQyxXQUFPLEtBQUtwYixVQUFMLENBQWdCOUMsY0FBaEIsSUFBa0MsSUFBbEMsR0FBeUMsSUFBekMsR0FBaUQsS0FBSzhDLFVBQUwsQ0FBZ0I5QyxjQUFoQixDQUErQndGLE9BQXZGO0FBQ0Q7O0FBRURsQyxFQUFBQSxrQkFBa0IsR0FBYztBQUM5QixXQUFPLEtBQUtSLFVBQUwsQ0FBZ0I5QyxjQUF2QjtBQUNEOztBQUVELFFBQU1pVyx3QkFBTixHQUFnRDtBQUM5QyxVQUFNelEsT0FBTyxHQUFHLEtBQUswWSxrQkFBTCxFQUFoQjs7QUFDQSxRQUFJMVksT0FBTyxJQUFJLElBQVgsSUFBbUIsQ0FBQ0EsT0FBTyxDQUFDMlkscUJBQVIsRUFBcEIsSUFBdUQsQ0FBQzNZLE9BQU8sQ0FBQzZJLGVBQVIsR0FBMEIyUSwyQkFBdEYsRUFBbUg7QUFDakg7QUFDRDs7QUFFRCxVQUFNWixpQkFBc0IsR0FBRyxLQUFLMWIsTUFBTCxDQUM1QjJRLHNCQUQ0QixHQUU1QnZTLE1BRjRCLENBRXBCbWUsR0FBRCxJQUFTQSxHQUFHLENBQUNyTCxPQUFKLElBQWUsS0FBS2xSLE1BQUwsQ0FBWTRiLHVCQUFaLEVBRkgsQ0FBL0I7O0FBR0EsVUFBTXJWLFFBQXNELEdBQUcsTUFBTXpELE9BQU8sQ0FBQzBaLHNCQUFSLENBQStCO0FBQ2xHTixNQUFBQSxXQUFXLEVBQUVSO0FBRHFGLEtBQS9CLENBQXJFOztBQUdBLFFBQUluVixRQUFRLElBQUksSUFBWixJQUFvQkEsUUFBUSxDQUFDRSxJQUFULElBQWlCLElBQXpDLEVBQStDO0FBQzdDO0FBQ0Q7O0FBRUQsVUFBTTRILElBQUksR0FBRyxFQUFiOztBQUNBLFNBQUssSUFBSStOLENBQUMsR0FBRyxDQUFiLEVBQWdCQSxDQUFDLEdBQUdWLGlCQUFpQixDQUFDbmQsTUFBdEMsRUFBOEM2ZCxDQUFDLEVBQS9DLEVBQW1EO0FBQ2pEL04sTUFBQUEsSUFBSSxDQUFDcU4saUJBQWlCLENBQUNVLENBQUQsQ0FBakIsQ0FBcUJsZSxLQUFyQixFQUFELENBQUosR0FBcUNxSSxRQUFRLENBQUNFLElBQVQsQ0FBY3lWLFdBQWQsQ0FBMEJFLENBQTFCLENBQXJDO0FBQ0Q7O0FBRUQsU0FBS3BjLE1BQUwsQ0FBWXNSLHlCQUFaLENBQXNDakQsSUFBdEM7QUFDRDs7QUFFRCxRQUFNb0YseUJBQU4sR0FBaUQ7QUFDL0MsVUFBTTNRLE9BQU8sR0FBRyxLQUFLMFksa0JBQUwsRUFBaEI7O0FBQ0EsUUFBSTFZLE9BQU8sSUFBSSxJQUFYLElBQW1CLENBQUNBLE9BQU8sQ0FBQzJZLHFCQUFSLEVBQXBCLElBQXVELEtBQUt6YixNQUFMLENBQVl5Yyx1QkFBWixHQUFzQ2xlLE1BQXRDLEtBQWlELENBQTVHLEVBQStHO0FBQzdHO0FBQ0Q7O0FBRUQsVUFBTW1lLG1CQUFtQixHQUFHLEtBQUsxYyxNQUFMLENBQVl5Yyx1QkFBWixHQUFzQ3JlLE1BQXRDLENBQThDdWUsR0FBRCxJQUFTQSxHQUFHLENBQUN6TCxPQUExRCxDQUE1Qjs7QUFDQSxVQUFNcE8sT0FBTyxDQUFDbUgsdUJBQVIsQ0FBZ0M7QUFDcEMyUyxNQUFBQSxPQUFPLEVBQUVGLG1CQUFtQixDQUFDelIsR0FBcEIsQ0FBeUIwUixHQUFELElBQVNBLEdBQUcsQ0FBQ3ZlLE1BQXJDO0FBRDJCLEtBQWhDLENBQU47QUFHRDs7QUFFRHllLEVBQUFBLG1CQUFtQixDQUFDQyxVQUFELEVBQXFDeFksS0FBckMsRUFBbUQ7QUFDcEUsVUFBTTtBQUFFaEgsTUFBQUEsY0FBRjtBQUFrQkUsTUFBQUE7QUFBbEIsUUFBd0MsS0FBSzRDLFVBQW5EOztBQUNBLFFBQUk5QyxjQUFjLElBQUksSUFBdEIsRUFBNEI7QUFDMUJ3VCxzQkFBT3BLLEtBQVAsQ0FBYSx3REFBYjs7QUFDQTtBQUNEOztBQUNELFVBQU1xVyxZQUFZLEdBQ2hCO0FBQ0E7QUFDQSwyQ0FBMkJELFVBQTNCLEVBQXVDeGYsY0FBdkMsRUFBdURFLGlCQUF2RCxFQUEwRSxNQUExRSxFQUNHd2YsSUFESCxDQUNRLENBRFIsRUFDVztBQURYLEtBRUczVCxTQUZILENBRWM2SSxNQUFELElBQVk7QUFDckI7QUFDQSxXQUFLOVIsVUFBTCxDQUFnQlQsb0JBQWhCLENBQXFDLEtBQUtTLFVBQUwsQ0FBZ0I1QyxpQkFBckQsRUFBd0UsS0FBeEU7O0FBRUEsVUFBSTBVLE1BQU0sQ0FBQytLLE9BQVAsSUFBa0IvSyxNQUFNLENBQUNnTCxTQUF6QixJQUFzQyxDQUFDSixVQUFVLENBQUM5VSxTQUF0RCxFQUFpRTtBQUMvRCxjQUFNcUMsT0FBdUIsR0FBRztBQUM5QmpHLFVBQUFBLElBQUksRUFBRTBZLFVBQVUsQ0FBQ0ssUUFBWCxFQUR3QjtBQUU5QjdZLFVBQUFBLEtBQUssRUFBRTtBQUZ1QixTQUFoQzs7QUFJQSxhQUFLL0QsY0FBTCxDQUFvQjBNLElBQXBCLENBQXlCNUMsT0FBekI7QUFDRCxPQU5ELE1BTU8sSUFBSXlTLFVBQVUsQ0FBQ00sV0FBWCxFQUFKLEVBQThCO0FBQ25DLGFBQUs3YyxjQUFMLENBQW9CME0sSUFBcEIsQ0FBeUI7QUFDdkI3SSxVQUFBQSxJQUFJLEVBQUUsUUFEaUI7QUFFdkJ5TCxVQUFBQSxXQUFXLEVBQUUsQ0FBQ2lOLFVBQUQsQ0FGVTtBQUd2QnhZLFVBQUFBO0FBSHVCLFNBQXpCO0FBS0QsT0FOTSxNQU1BO0FBQ0wsYUFBSy9ELGNBQUwsQ0FBb0IwTSxJQUFwQixDQUF5QjtBQUN2QjdJLFVBQUFBLElBQUksRUFBRTBZLFVBQVUsQ0FBQ0ssUUFBWCxFQURpQjtBQUV2QjdZLFVBQUFBO0FBRnVCLFNBQXpCO0FBSUQ7O0FBQ0QsV0FBS25FLG1CQUFMLENBQXlCOFYsTUFBekIsQ0FBZ0M4RyxZQUFoQztBQUNELEtBekJILENBSEY7O0FBNkJBLFNBQUs1YyxtQkFBTCxDQUF5Qm1DLEdBQXpCLENBQTZCeWEsWUFBN0I7QUFDRDs7QUFFRDFFLEVBQUFBLHdCQUF3QixHQUFHO0FBQ3pCLFNBQUtsWSxtQkFBTCxHQUEyQixJQUFJcUUsNEJBQUosRUFBM0I7QUFDQSxVQUFNNlksZ0JBQWdCLEdBQUcsdURBQXpCOztBQUNBLFFBQUlBLGdCQUFnQixJQUFJLElBQXhCLEVBQThCO0FBQzVCO0FBQ0Q7O0FBRUQsVUFBTUMsT0FBTyxHQUFHLElBQUlqZ0IsYUFBSixFQUFoQjtBQUNBLFVBQU1rZ0IsYUFBYSxHQUFHLGVBQXRCO0FBQ0EsVUFBTXRZLFNBQVMsR0FBRyxLQUFLN0UsVUFBdkI7O0FBQ0EsVUFBTW9kLGtCQUFrQixHQUFHLEtBQUtYLG1CQUFMLENBQXlCcFYsSUFBekIsQ0FBOEIsSUFBOUIsQ0FBM0I7O0FBQ0EsVUFBTWdXLFFBQVEsR0FBRztBQUNmeGYsTUFBQUEsRUFBRSxFQUFFLFVBRFc7QUFFZmdHLE1BQUFBLElBQUksRUFBRSxVQUZTO0FBR2Z5WixNQUFBQSxTQUFTLEVBQUUsTUFBTTtBQUNmLFlBQUl6WSxTQUFTLENBQUMzSCxjQUFWLElBQTRCLElBQTVCLElBQW9DMkgsU0FBUyxDQUFDM0gsY0FBVixDQUF5QndELGFBQXpCLENBQXVDNmMsV0FBdkMsSUFBc0QsSUFBOUYsRUFBb0c7QUFDbEcsaUJBQU8xWSxTQUFTLENBQUMzSCxjQUFWLENBQXlCd0QsYUFBekIsQ0FBdUM2YyxXQUE5QztBQUNEOztBQUNELGVBQU8sWUFBUDtBQUNELE9BUmM7O0FBU2ZDLE1BQUFBLG9CQUFvQixDQUFDbGdCLFFBQUQsRUFBcUM7QUFDdkQsZUFBTzRmLE9BQU8sQ0FBQzNmLEVBQVIsQ0FBVzRmLGFBQVgsRUFBMEI3ZixRQUExQixDQUFQO0FBQ0QsT0FYYzs7QUFZZm1nQixNQUFBQSxJQUFJLENBQUNmLFVBQUQsRUFBcUI7QUFDdkJVLFFBQUFBLGtCQUFrQixDQUFDLElBQUl2Syx5QkFBSixDQUFlNkosVUFBZixDQUFELEVBQTZCLEtBQTdCLENBQWxCO0FBQ0QsT0FkYzs7QUFlZjdPLE1BQUFBLE1BQU0sRUFBRSxLQUFLMU47QUFmRSxLQUFqQjs7QUFrQkEsU0FBS0osbUJBQUwsQ0FBeUJtQyxHQUF6QixDQUNFZ2IsT0FERixFQUVFLEtBQUtsZCxVQUFMLENBQWdCM0Msd0JBQWhCLENBQXlDLE1BQU07QUFDN0M2ZixNQUFBQSxPQUFPLENBQUNqZSxJQUFSLENBQWFrZSxhQUFiO0FBQ0QsS0FGRCxDQUZGOztBQU1BLFNBQUtwZCxtQkFBTCxDQUF5Qm1DLEdBQXpCLENBQTZCK2EsZ0JBQWdCLENBQUNJLFFBQUQsQ0FBN0M7QUFDRDs7QUFFRC9aLEVBQUFBLE9BQU8sR0FBUztBQUNkLFNBQUt6RCxZQUFMLENBQWtCeUQsT0FBbEI7O0FBQ0EsU0FBS3ZELG1CQUFMLENBQXlCdUQsT0FBekI7O0FBQ0EsU0FBS3hELHNCQUFMLENBQTRCd0QsT0FBNUI7QUFDRDs7QUFqaER3RDs7OztBQW9oRDNELE1BQU1xRCxzQkFBTixTQUFxQytXLGdCQUFyQyxDQUFnRDtBQUc5QzlnQixFQUFBQSxXQUFXLENBQUMrZ0IsUUFBRCxFQUFtQnhZLEdBQW5CLEVBQWdDO0FBQ3pDLFVBQU13WSxRQUFOO0FBRHlDLFNBRjNDQyxJQUUyQztBQUV6QyxTQUFLQSxJQUFMLEdBQVl6WSxHQUFaO0FBQ0Q7O0FBRUQwWSxFQUFBQSxNQUFNLEdBQUc7QUFDUCxXQUFPLEtBQUtELElBQVo7QUFDRDs7QUFFRDlTLEVBQUFBLE9BQU8sR0FBRztBQUNSLFdBQU8sS0FBSzhTLElBQVo7QUFDRDs7QUFFREUsRUFBQUEsVUFBVSxHQUFHO0FBQ1gsV0FBTyxLQUFQO0FBQ0Q7O0FBbEI2QyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuVGhlIGZvbGxvd2luZyBkZWJ1ZyBzZXJ2aWNlIGltcGxlbWVudGF0aW9uIHdhcyBwb3J0ZWQgZnJvbSBWU0NvZGUncyBkZWJ1Z2dlciBpbXBsZW1lbnRhdGlvblxuaW4gaHR0cHM6Ly9naXRodWIuY29tL01pY3Jvc29mdC92c2NvZGUvdHJlZS9tYXN0ZXIvc3JjL3ZzL3dvcmtiZW5jaC9wYXJ0cy9kZWJ1Z1xuXG5NSVQgTGljZW5zZVxuXG5Db3B5cmlnaHQgKGMpIDIwMTUgLSBwcmVzZW50IE1pY3Jvc29mdCBDb3Jwb3JhdGlvblxuXG5BbGwgcmlnaHRzIHJlc2VydmVkLlxuXG5QZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG5vZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG5pbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG50byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG5jb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbmZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG5cblRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbFxuY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cblxuVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG5GSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbkFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbkxJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG5PVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuU09GVFdBUkUuXG4qL1xuXG5pbXBvcnQgdHlwZSB7IENvbnNvbGVNZXNzYWdlIH0gZnJvbSBcImF0b20taWRlLXVpXCJcbmltcG9ydCB0eXBlIHsgUmVjb3JkVG9rZW4sIExldmVsIH0gZnJvbSBcIi4uLy4uLy4uL2F0b20taWRlLWNvbnNvbGUvbGliL3R5cGVzXCJcbmltcG9ydCB0eXBlIHsgVGVybWluYWxJbmZvLCBUZXJtaW5hbEluc3RhbmNlIH0gZnJvbSBcIi4uLy4uLy4uL2F0b20taWRlLXRlcm1pbmFsL2xpYi90eXBlc1wiXG5pbXBvcnQgdHlwZSB7XG4gIERlYnVnZ2VyTW9kZVR5cGUsXG4gIElEZWJ1Z1NlcnZpY2UsXG4gIElNb2RlbCxcbiAgSVZpZXdNb2RlbCxcbiAgSVByb2Nlc3MsXG4gIElUaHJlYWQsXG4gIElFbmFibGVhYmxlLFxuICBJRXZhbHVhdGFibGVFeHByZXNzaW9uLFxuICBJVUlCcmVha3BvaW50LFxuICBJU3RhY2tGcmFtZSxcbiAgU2VyaWFsaXplZFN0YXRlLFxufSBmcm9tIFwiLi4vdHlwZXNcIlxuaW1wb3J0IHR5cGUge1xuICBJUHJvY2Vzc0NvbmZpZyxcbiAgTWVzc2FnZVByb2Nlc3NvcixcbiAgVlNBZGFwdGVyRXhlY3V0YWJsZUluZm8sXG59IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtZGVidWdnZXItY29tbW9uXCJcbmltcG9ydCB0eXBlIHsgVGltaW5nVHJhY2tlciB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9hbmFseXRpY3NcIlxuaW1wb3J0ICogYXMgRGVidWdQcm90b2NvbCBmcm9tIFwidnNjb2RlLWRlYnVncHJvdG9jb2xcIlxuaW1wb3J0ICogYXMgUmVhY3QgZnJvbSBcInJlYWN0XCJcblxuaW1wb3J0IGludmFyaWFudCBmcm9tIFwiYXNzZXJ0XCJcbmltcG9ydCB7IEljb24gfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvSWNvblwiXG5pbXBvcnQgbnVjbGlkZVVyaSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvbnVjbGlkZVVyaVwiXG5pbXBvcnQgeyBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL2V2ZW50XCJcbmltcG9ydCB7IHNsZWVwLCBzZXJpYWxpemVBc3luY0NhbGwgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvcHJvbWlzZVwiXG5pbXBvcnQge1xuICBWc0RlYnVnU2Vzc2lvbixcbiAgbG9jYWxUb1JlbW90ZVByb2Nlc3NvcixcbiAgcmVtb3RlVG9Mb2NhbFByb2Nlc3NvcixcbiAgZ2V0VlNDb2RlRGVidWdnZXJBZGFwdGVyU2VydmljZUJ5TnVjbGlkZVVyaSxcbn0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1kZWJ1Z2dlci1jb21tb25cIlxuaW1wb3J0IHsgT2JzZXJ2YWJsZSwgU3ViamVjdCwgVGltZW91dEVycm9yIH0gZnJvbSBcInJ4anNcIlxuaW1wb3J0IHsgVGV4dEVkaXRvckJhbm5lciB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9UZXh0RWRpdG9yQmFubmVyXCJcbmltcG9ydCBSZWFkT25seU5vdGljZSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvUmVhZE9ubHlOb3RpY2VcIlxuaW1wb3J0IHsgdHJhY2ssIHN0YXJ0VHJhY2tpbmcgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvYW5hbHl0aWNzXCJcbmltcG9ydCBudWxsdGhyb3dzIGZyb20gXCJudWxsdGhyb3dzXCJcbmltcG9ydCB7XG4gIGdldENvbnNvbGVSZWdpc3RlckV4ZWN1dG9yLFxuICBnZXRDb25zb2xlU2VydmljZSxcbiAgZ2V0Tm90aWZpY2F0aW9uU2VydmljZSxcbiAgZ2V0RGF0YXRpcFNlcnZpY2UsXG4gIGdldFRlcm1pbmFsU2VydmljZSxcbiAgcmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbixcbn0gZnJvbSBcIi4uL0F0b21TZXJ2aWNlQ29udGFpbmVyXCJcbmltcG9ydCB7IGV2YWx1YXRlRXhwcmVzc2lvbkFzU3RyZWFtLCBjYXBpdGFsaXplIH0gZnJvbSBcIi4uL3V0aWxzXCJcbmltcG9ydCB7XG4gIE1vZGVsLFxuICBFeGNlcHRpb25CcmVha3BvaW50LFxuICBGdW5jdGlvbkJyZWFrcG9pbnQsXG4gIEJyZWFrcG9pbnQsXG4gIEV4cHJlc3Npb24sXG4gIFByb2Nlc3MsXG4gIEV4cHJlc3Npb25Db250YWluZXIsXG59IGZyb20gXCIuL0RlYnVnZ2VyTW9kZWxcIlxuaW1wb3J0IFVuaXZlcnNhbERpc3Bvc2FibGUgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL1VuaXZlcnNhbERpc3Bvc2FibGVcIlxuaW1wb3J0IHsgRW1pdHRlciwgVGV4dEJ1ZmZlciB9IGZyb20gXCJhdG9tXCJcbmltcG9ydCB7IGRpc3RpbmN0LCBtYXBGcm9tT2JqZWN0IH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL2NvbGxlY3Rpb25cIlxuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tIFwiLi4vdXRpbHNcIlxuaW1wb3J0IHV1aWQgZnJvbSBcInV1aWRcIlxuaW1wb3J0IHsgQnJlYWtwb2ludEV2ZW50UmVhc29ucywgRGVidWdnZXJNb2RlLCBBbmFseXRpY3NFdmVudHMsIERFQlVHX1NPVVJDRVNfVVJJIH0gZnJvbSBcIi4uL2NvbnN0YW50c1wiXG5pbXBvcnQgbG9nZ2VyIGZyb20gXCIuLi9sb2dnZXJcIlxuaW1wb3J0IHN0cmlwQW5zaSBmcm9tIFwic3RyaXAtYW5zaVwiXG5pbXBvcnQgdXJsIGZyb20gXCJ1cmxcIlxuaW1wb3J0IG9zIGZyb20gXCJvc1wiXG5pbXBvcnQgaWR4IGZyb20gXCJpZHhcIlxuXG5jb25zdCBDT05TT0xFX1ZJRVdfVVJJID0gXCJhdG9tOi8vbnVjbGlkZS9jb25zb2xlXCJcblxuY29uc3QgQ1VTVE9NX0RFQlVHX0VWRU5UID0gXCJDVVNUT01fREVCVUdfRVZFTlRcIlxuY29uc3QgQ0hBTkdFX0RFQlVHX01PREUgPSBcIkNIQU5HRV9ERUJVR19NT0RFXCJcbmNvbnN0IFNUQVJUX0RFQlVHX1NFU1NJT04gPSBcIlNUQVJUX0RFQlVHX1NFU1NJT05cIlxuY29uc3QgQUNUSVZFX1RIUkVBRF9DSEFOR0VEID0gXCJBQ1RJVkVfVEhSRUFEX0NIQU5HRURcIlxuXG5jb25zdCBERUJVR0dFUl9GT0NVU19DSEFOR0VEID0gXCJERUJVR0dFUl9GT0NVU19DSEFOR0VEXCJcbmNvbnN0IENIQU5HRV9FWFBSRVNTSU9OX0NPTlRFWFQgPSBcIkNIQU5HRV9FWFBSRVNTSU9OX0NPTlRFWFRcIlxuXG4vLyBCZXJha3BvaW50IGV2ZW50cyBtYXkgYXJyaXZlIHNvb25lciB0aGFuIGJyZWFrcG9pbnQgcmVzcG9uc2VzLlxuY29uc3QgTUFYX0JSRUFLUE9JTlRfRVZFTlRfREVMQVlfTVMgPSA1ICogMTAwMFxuXG5jbGFzcyBWaWV3TW9kZWwgaW1wbGVtZW50cyBJVmlld01vZGVsIHtcbiAgX2ZvY3VzZWRQcm9jZXNzOiA/SVByb2Nlc3NcbiAgX2ZvY3VzZWRUaHJlYWQ6ID9JVGhyZWFkXG4gIF9mb2N1c2VkU3RhY2tGcmFtZTogP0lTdGFja0ZyYW1lXG4gIF9lbWl0dGVyOiBFbWl0dGVyXG5cbiAgY29uc3RydWN0b3IoKSB7XG4gICAgdGhpcy5fZm9jdXNlZFByb2Nlc3MgPSBudWxsXG4gICAgdGhpcy5fZm9jdXNlZFRocmVhZCA9IG51bGxcbiAgICB0aGlzLl9mb2N1c2VkU3RhY2tGcmFtZSA9IG51bGxcbiAgICB0aGlzLl9lbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxuICB9XG5cbiAgZ2V0IGZvY3VzZWRQcm9jZXNzKCk6ID9JUHJvY2VzcyB7XG4gICAgcmV0dXJuIHRoaXMuX2ZvY3VzZWRQcm9jZXNzXG4gIH1cblxuICBnZXQgZm9jdXNlZFRocmVhZCgpOiA/SVRocmVhZCB7XG4gICAgcmV0dXJuIHRoaXMuX2ZvY3VzZWRUaHJlYWRcbiAgfVxuXG4gIGdldCBmb2N1c2VkU3RhY2tGcmFtZSgpOiA/SVN0YWNrRnJhbWUge1xuICAgIHJldHVybiB0aGlzLl9mb2N1c2VkU3RhY2tGcmFtZVxuICB9XG5cbiAgb25EaWRDaGFuZ2VEZWJ1Z2dlckZvY3VzKGNhbGxiYWNrOiAoZGF0YTogeyBleHBsaWNpdDogYm9vbGVhbiB9KSA9PiBtaXhlZCk6IElEaXNwb3NhYmxlIHtcbiAgICByZXR1cm4gdGhpcy5fZW1pdHRlci5vbihERUJVR0dFUl9GT0NVU19DSEFOR0VELCBjYWxsYmFjaylcbiAgfVxuXG4gIG9uRGlkQ2hhbmdlRXhwcmVzc2lvbkNvbnRleHQoY2FsbGJhY2s6IChkYXRhOiB7IGV4cGxpY2l0OiBib29sZWFuIH0pID0+IG1peGVkKTogSURpc3Bvc2FibGUge1xuICAgIHJldHVybiB0aGlzLl9lbWl0dGVyLm9uKENIQU5HRV9FWFBSRVNTSU9OX0NPTlRFWFQsIGNhbGxiYWNrKVxuICB9XG5cbiAgX2Nob29zZUZvY3VzVGhyZWFkKHByb2Nlc3M6IElQcm9jZXNzKTogP0lUaHJlYWQge1xuICAgIGNvbnN0IHRocmVhZHMgPSBwcm9jZXNzLmdldEFsbFRocmVhZHMoKVxuXG4gICAgLy8gSWYgdGhlIGN1cnJlbnQgZm9jdXNlZCB0aHJlYWQgaXMgaW4gdGhlIGZvY3VzZWQgcHJvY2VzcyBhbmQgaXMgc3RvcHBlZCxcbiAgICAvLyBsZWF2ZSB0aGF0IHRocmVhZCBmb2N1c2VkLiBPdGhlcndpc2UsIGNob29zZSB0aGUgZmlyc3RcbiAgICAvLyBzdG9wcGVkIHRocmVhZCBpbiB0aGUgZm9jdXNlZCBwcm9jZXNzIGlmIHRoZXJlIGlzIG9uZSxcbiAgICAvLyBhbmQgdGhlIGZpcnN0IHJ1bm5pbmcgdGhyZWFkIG90aGVyd2lzZS5cbiAgICBpZiAodGhpcy5fZm9jdXNlZFRocmVhZCAhPSBudWxsKSB7XG4gICAgICBjb25zdCBpZCA9IHRoaXMuX2ZvY3VzZWRUaHJlYWQuZ2V0SWQoKVxuICAgICAgY29uc3QgY3VycmVudEZvY3VzZWRUaHJlYWQgPSB0aHJlYWRzLmZpbHRlcigodCkgPT4gdC5nZXRJZCgpID09PSBpZCAmJiB0LnN0b3BwZWQpXG4gICAgICBpZiAoY3VycmVudEZvY3VzZWRUaHJlYWQubGVuZ3RoID4gMCkge1xuICAgICAgICByZXR1cm4gY3VycmVudEZvY3VzZWRUaHJlYWRbMF1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBzdG9wcGVkVGhyZWFkcyA9IHRocmVhZHMuZmlsdGVyKCh0KSA9PiB0LnN0b3BwZWQpXG4gICAgcmV0dXJuIHN0b3BwZWRUaHJlYWRzWzBdIHx8IHRocmVhZHNbMF1cbiAgfVxuXG4gIF9jaG9vc2VGb2N1c1N0YWNrRnJhbWUodGhyZWFkOiA/SVRocmVhZCk6ID9JU3RhY2tGcmFtZSB7XG4gICAgaWYgKHRocmVhZCA9PSBudWxsKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIC8vIElmIHRoZSBjdXJyZW50IGZvY3VzZWQgc3RhY2sgZnJhbWUgaXMgaW4gdGhlIGN1cnJlbnQgZm9jdXNlZCB0aHJlYWQnc1xuICAgIC8vIGZyYW1lcywgbGVhdmUgaXQgYWxvbmUuIE90aGVyd2lzZSByZXR1cm4gdGhlIHRvcCBzdGFjayBmcmFtZSBpZiB0aGVcbiAgICAvLyB0aHJlYWQgaXMgc3RvcHBlZCwgYW5kIG51bGwgaWYgaXQgaXMgcnVubmluZy5cbiAgICBjb25zdCBjdXJyZW50Rm9jdXNlZEZyYW1lID0gdGhyZWFkLmdldENhY2hlZENhbGxTdGFjaygpLmZpbmQoKGYpID0+IGYgPT09IHRoaXMuX2ZvY3VzZWRTdGFja0ZyYW1lKVxuICAgIHJldHVybiB0aHJlYWQuc3RvcHBlZCA/IGN1cnJlbnRGb2N1c2VkRnJhbWUgfHwgdGhyZWFkLmdldENhbGxTdGFja1RvcEZyYW1lKCkgOiBudWxsXG4gIH1cblxuICBfc2V0Rm9jdXMocHJvY2VzczogP0lQcm9jZXNzLCB0aHJlYWQ6ID9JVGhyZWFkLCBzdGFja0ZyYW1lOiA/SVN0YWNrRnJhbWUsIGV4cGxpY2l0OiBib29sZWFuKSB7XG4gICAgbGV0IG5ld1Byb2Nlc3MgPSBwcm9jZXNzXG5cbiAgICAvLyBJZiB3ZSBoYXZlIGEgZm9jdXNlZCBmcmFtZSwgd2UgbXVzdCBoYXZlIGEgZm9jdXNlZCB0aHJlYWQuXG4gICAgaW52YXJpYW50KHN0YWNrRnJhbWUgPT0gbnVsbCB8fCB0aHJlYWQgPT09IHN0YWNrRnJhbWUudGhyZWFkKVxuXG4gICAgLy8gSWYgd2UgaGF2ZSBhIGZvY3VzZWQgdGhyZWFkLCB3ZSBtdXN0IGhhdmUgYSBmb2N1c2VkIHByb2Nlc3MuXG4gICAgaW52YXJpYW50KHRocmVhZCA9PSBudWxsIHx8IHByb2Nlc3MgPT09IHRocmVhZC5wcm9jZXNzKVxuXG4gICAgaWYgKG5ld1Byb2Nlc3MgPT0gbnVsbCkge1xuICAgICAgaW52YXJpYW50KHRocmVhZCA9PSBudWxsICYmIHN0YWNrRnJhbWUgPT0gbnVsbClcbiAgICAgIG5ld1Byb2Nlc3MgPSB0aGlzLl9mb2N1c2VkUHJvY2Vzc1xuICAgIH1cblxuICAgIGNvbnN0IGZvY3VzQ2hhbmdlZCA9XG4gICAgICB0aGlzLl9mb2N1c2VkUHJvY2VzcyAhPT0gbmV3UHJvY2VzcyB8fFxuICAgICAgdGhpcy5fZm9jdXNlZFRocmVhZCAhPT0gdGhyZWFkIHx8XG4gICAgICB0aGlzLl9mb2N1c2VkU3RhY2tGcmFtZSAhPT0gc3RhY2tGcmFtZSB8fFxuICAgICAgZXhwbGljaXRcblxuICAgIHRoaXMuX2ZvY3VzZWRQcm9jZXNzID0gbmV3UHJvY2Vzc1xuICAgIHRoaXMuX2ZvY3VzZWRUaHJlYWQgPSB0aHJlYWRcbiAgICB0aGlzLl9mb2N1c2VkU3RhY2tGcmFtZSA9IHN0YWNrRnJhbWVcblxuICAgIGlmIChmb2N1c0NoYW5nZWQpIHtcbiAgICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChERUJVR0dFUl9GT0NVU19DSEFOR0VELCB7IGV4cGxpY2l0IH0pXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFRoZSBmb2N1c2VkIHN0YWNrIGZyYW1lIGRpZG4ndCBjaGFuZ2UsIGJ1dCBzb21ldGhpbmcgYWJvdXQgdGhlXG4gICAgICAvLyBjb250ZXh0IGRpZCwgc28gaW50ZXJlc3RlZCBsaXN0ZW5lcnMgc2hvdWxkIHJlLWV2YWx1YXRlIGV4cHJlc3Npb25zLlxuICAgICAgdGhpcy5fZW1pdHRlci5lbWl0KENIQU5HRV9FWFBSRVNTSU9OX0NPTlRFWFQsIHsgZXhwbGljaXQgfSlcbiAgICB9XG4gIH1cblxuICBldmFsdWF0ZUNvbnRleHRDaGFuZ2VkKCk6IHZvaWQge1xuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChDSEFOR0VfRVhQUkVTU0lPTl9DT05URVhULCB7IGV4cGxpY2l0OiB0cnVlIH0pXG4gIH1cblxuICBzZXRGb2N1c2VkUHJvY2Vzcyhwcm9jZXNzOiA/SVByb2Nlc3MsIGV4cGxpY2l0OiBib29sZWFuKSB7XG4gICAgaWYgKHByb2Nlc3MgPT0gbnVsbCkge1xuICAgICAgdGhpcy5fZm9jdXNlZFByb2Nlc3MgPSBudWxsXG4gICAgICB0aGlzLl9zZXRGb2N1cyhudWxsLCBudWxsLCBudWxsLCBleHBsaWNpdClcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgbmV3Rm9jdXNUaHJlYWQgPSB0aGlzLl9jaG9vc2VGb2N1c1RocmVhZChwcm9jZXNzKVxuICAgICAgY29uc3QgbmV3Rm9jdXNGcmFtZSA9IHRoaXMuX2Nob29zZUZvY3VzU3RhY2tGcmFtZShuZXdGb2N1c1RocmVhZClcbiAgICAgIHRoaXMuX3NldEZvY3VzKHByb2Nlc3MsIG5ld0ZvY3VzVGhyZWFkLCBuZXdGb2N1c0ZyYW1lLCBleHBsaWNpdClcbiAgICB9XG4gIH1cblxuICBzZXRGb2N1c2VkVGhyZWFkKHRocmVhZDogP0lUaHJlYWQsIGV4cGxpY2l0OiBib29sZWFuKSB7XG4gICAgaWYgKHRocmVhZCA9PSBudWxsKSB7XG4gICAgICB0aGlzLl9zZXRGb2N1cyhudWxsLCBudWxsLCBudWxsLCBleHBsaWNpdClcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5fc2V0Rm9jdXModGhyZWFkLnByb2Nlc3MsIHRocmVhZCwgdGhpcy5fY2hvb3NlRm9jdXNTdGFja0ZyYW1lKHRocmVhZCksIGV4cGxpY2l0KVxuICAgIH1cbiAgfVxuXG4gIHNldEZvY3VzZWRTdGFja0ZyYW1lKHN0YWNrRnJhbWU6ID9JU3RhY2tGcmFtZSwgZXhwbGljaXQ6IGJvb2xlYW4pIHtcbiAgICBpZiAoc3RhY2tGcmFtZSA9PSBudWxsKSB7XG4gICAgICB0aGlzLl9zZXRGb2N1cyhudWxsLCBudWxsLCBudWxsLCBleHBsaWNpdClcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5fc2V0Rm9jdXMoc3RhY2tGcmFtZS50aHJlYWQucHJvY2Vzcywgc3RhY2tGcmFtZS50aHJlYWQsIHN0YWNrRnJhbWUsIGV4cGxpY2l0KVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBnZXREZWJ1Z2dlck5hbWUoYWRhcHRlclR5cGU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBgJHtjYXBpdGFsaXplKGFkYXB0ZXJUeXBlKX0gRGVidWdnZXJgXG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIERlYnVnU2VydmljZSBpbXBsZW1lbnRzIElEZWJ1Z1NlcnZpY2Uge1xuICBfbW9kZWw6IE1vZGVsXG4gIF9kaXNwb3NhYmxlczogVW5pdmVyc2FsRGlzcG9zYWJsZVxuICBfc2Vzc2lvbkVuZERpc3Bvc2FibGVzOiBVbml2ZXJzYWxEaXNwb3NhYmxlXG4gIF9jb25zb2xlRGlzcG9zYWJsZXM6IFVuaXZlcnNhbERpc3Bvc2FibGVcbiAgX2VtaXR0ZXI6IEVtaXR0ZXJcbiAgX3ZpZXdNb2RlbDogVmlld01vZGVsXG4gIF90aW1lcjogP1RpbWluZ1RyYWNrZXJcbiAgX2JyZWFrcG9pbnRzVG9TZW5kT25TYXZlOiBTZXQ8c3RyaW5nPlxuICBfY29uc29sZU91dHB1dDogU3ViamVjdDxDb25zb2xlTWVzc2FnZT5cblxuICBjb25zdHJ1Y3RvcihzdGF0ZTogP1NlcmlhbGl6ZWRTdGF0ZSkge1xuICAgIHRoaXMuX2Rpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoKVxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcyA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKClcbiAgICB0aGlzLl9jb25zb2xlRGlzcG9zYWJsZXMgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5fZW1pdHRlciA9IG5ldyBFbWl0dGVyKClcbiAgICB0aGlzLl92aWV3TW9kZWwgPSBuZXcgVmlld01vZGVsKClcbiAgICB0aGlzLl9icmVha3BvaW50c1RvU2VuZE9uU2F2ZSA9IG5ldyBTZXQoKVxuICAgIHRoaXMuX2NvbnNvbGVPdXRwdXQgPSBuZXcgU3ViamVjdCgpXG5cbiAgICB0aGlzLl9tb2RlbCA9IG5ldyBNb2RlbChcbiAgICAgIHRoaXMuX2xvYWRCcmVha3BvaW50cyhzdGF0ZSksXG4gICAgICB0cnVlLFxuICAgICAgdGhpcy5fbG9hZEZ1bmN0aW9uQnJlYWtwb2ludHMoc3RhdGUpLFxuICAgICAgdGhpcy5fbG9hZEV4Y2VwdGlvbkJyZWFrcG9pbnRzKHN0YXRlKSxcbiAgICAgIHRoaXMuX2xvYWRXYXRjaEV4cHJlc3Npb25zKHN0YXRlKSxcbiAgICAgICgpID0+IHRoaXMuX3ZpZXdNb2RlbC5mb2N1c2VkUHJvY2Vzc1xuICAgIClcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fbW9kZWwsIHRoaXMuX2NvbnNvbGVPdXRwdXQpXG4gICAgdGhpcy5fcmVnaXN0ZXJMaXN0ZW5lcnMoKVxuICB9XG5cbiAgZ2V0IHZpZXdNb2RlbCgpOiBJVmlld01vZGVsIHtcbiAgICByZXR1cm4gdGhpcy5fdmlld01vZGVsXG4gIH1cblxuICBnZXREZWJ1Z2dlck1vZGUocHJvY2VzczogP0lQcm9jZXNzKTogRGVidWdnZXJNb2RlVHlwZSB7XG4gICAgaWYgKHByb2Nlc3MgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIERlYnVnZ2VyTW9kZS5TVE9QUEVEXG4gICAgfVxuICAgIHJldHVybiBwcm9jZXNzLmRlYnVnZ2VyTW9kZVxuICB9XG5cbiAgX3JlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChcbiAgICAgIGF0b20ud29ya3NwYWNlLmFkZE9wZW5lcigodXJpKSA9PiB7XG4gICAgICAgIGlmICh1cmkuc3RhcnRzV2l0aChERUJVR19TT1VSQ0VTX1VSSSkpIHtcbiAgICAgICAgICBpZiAodGhpcy5nZXREZWJ1Z2dlck1vZGUodGhpcy5fdmlld01vZGVsLmZvY3VzZWRQcm9jZXNzKSAhPT0gRGVidWdnZXJNb2RlLlNUT1BQRUQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9vcGVuU291cmNlVmlldyh1cmkpXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIClcbiAgfVxuXG4gIGFzeW5jIF9vcGVuU291cmNlVmlldyh1cmk6IHN0cmluZyk6IFByb21pc2U8YXRvbSRUZXh0RWRpdG9yPiB7XG4gICAgY29uc3QgcXVlcnkgPSAodXJsLnBhcnNlKHVyaSkucGF0aCB8fCBcIlwiKS5zcGxpdChcIi9cIilcbiAgICBjb25zdCBbLCBzZXNzaW9uSWQsIHNvdXJjZVJlZmVyZW5jZVJhd10gPSBxdWVyeVxuICAgIGNvbnN0IHNvdXJjZVJlZmVyZW5jZSA9IHBhcnNlSW50KHNvdXJjZVJlZmVyZW5jZVJhdywgMTApXG5cbiAgICBjb25zdCBwcm9jZXNzID0gdGhpcy5fbW9kZWwuZ2V0UHJvY2Vzc2VzKCkuZmluZCgocCkgPT4gcC5nZXRJZCgpID09PSBzZXNzaW9uSWQpIHx8IHRoaXMuX3ZpZXdNb2RlbC5mb2N1c2VkUHJvY2Vzc1xuICAgIGlmIChwcm9jZXNzID09IG51bGwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgTm8gZGVidWcgc2Vzc2lvbiBmb3Igc291cmNlOiAke3NvdXJjZVJlZmVyZW5jZX1gKVxuICAgIH1cblxuICAgIGNvbnN0IHNvdXJjZSA9IHByb2Nlc3MuZ2V0U291cmNlKHtcbiAgICAgIHBhdGg6IHVyaSxcbiAgICAgIHNvdXJjZVJlZmVyZW5jZSxcbiAgICB9KVxuXG4gICAgbGV0IGNvbnRlbnQgPSBcIlwiXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcHJvY2Vzcy5zZXNzaW9uLnNvdXJjZSh7XG4gICAgICAgIHNvdXJjZVJlZmVyZW5jZSxcbiAgICAgICAgc291cmNlOiBzb3VyY2UucmF3LFxuICAgICAgfSlcbiAgICAgIGNvbnRlbnQgPSByZXNwb25zZS5ib2R5LmNvbnRlbnRcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgdGhpcy5fc291cmNlSXNOb3RBdmFpbGFibGUodXJpKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRGVidWcgc291cmNlIGlzIG5vdCBhdmFpbGFibGVcIilcbiAgICB9XG5cbiAgICBjb25zdCBlZGl0b3IgPSBhdG9tLndvcmtzcGFjZS5idWlsZFRleHRFZGl0b3Ioe1xuICAgICAgYnVmZmVyOiBuZXcgRGVidWdTb3VyY2VUZXh0QnVmZmZlcihjb250ZW50LCB1cmkpLFxuICAgICAgYXV0b0hlaWdodDogZmFsc2UsXG4gICAgICByZWFkT25seTogdHJ1ZSxcbiAgICB9KVxuXG4gICAgLy8gJEZsb3dGaXhNZSBEZWJ1Z2dlciBzb3VyY2Ugdmlld3Mgc2hvdWxkbid0IHBlcnNpc3QgYmV0d2VlbiByZWxvYWQuXG4gICAgZWRpdG9yLnNlcmlhbGl6ZSA9ICgpID0+IG51bGxcbiAgICBlZGl0b3Iuc2V0R3JhbW1hcihhdG9tLmdyYW1tYXJzLnNlbGVjdEdyYW1tYXIoc291cmNlLm5hbWUgfHwgXCJcIiwgY29udGVudCkpXG4gICAgY29uc3QgdGV4dEVkaXRvckJhbm5lciA9IG5ldyBUZXh0RWRpdG9yQmFubmVyKGVkaXRvcilcbiAgICB0ZXh0RWRpdG9yQmFubmVyLnJlbmRlcihcbiAgICAgIDxSZWFkT25seU5vdGljZVxuICAgICAgICBkZXRhaWxlZE1lc3NhZ2U9XCJUaGlzIGlzIGEgZGVidWcgc291cmNlIHZpZXcgdGhhdCBtYXkgbm90IGV4aXN0IG9uIHRoZSBmaWxlc3lzdGVtLlwiXG4gICAgICAgIGNhbkVkaXRBbnl3YXk9e2ZhbHNlfVxuICAgICAgICBvbkRpc21pc3M9e3RleHRFZGl0b3JCYW5uZXIuZGlzcG9zZS5iaW5kKHRleHRFZGl0b3JCYW5uZXIpfVxuICAgICAgLz5cbiAgICApXG5cbiAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuYWRkVW50aWxEZXN0cm95ZWQoZWRpdG9yLCBlZGl0b3IsIHRleHRFZGl0b3JCYW5uZXIpXG5cbiAgICByZXR1cm4gZWRpdG9yXG4gIH1cblxuICAvKipcbiAgICogU3RvcHMgdGhlIHNwZWNpZmllZCBwcm9jZXNzLlxuICAgKi9cbiAgYXN5bmMgc3RvcFByb2Nlc3MocHJvY2VzczogSVByb2Nlc3MpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAocHJvY2Vzcy5kZWJ1Z2dlck1vZGUgPT09IERlYnVnZ2VyTW9kZS5TVE9QUElORyB8fCBwcm9jZXNzLmRlYnVnZ2VyTW9kZSA9PT0gRGVidWdnZXJNb2RlLlNUT1BQRUQpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICB0aGlzLl9vblNlc3Npb25FbmQoKHByb2Nlc3Muc2Vzc2lvbjogYW55KSlcbiAgfVxuXG4gIGFzeW5jIF90cnlUb0F1dG9Gb2N1c1N0YWNrRnJhbWUodGhyZWFkOiBJVGhyZWFkKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgLy8gVGhlIGNhbGwgc3RhY2sgaGFzIGFscmVhZHkgYmVlbiByZWZyZXNoZWQgYnkgdGhlIGxvZ2ljIGhhbmRsaW5nXG4gICAgLy8gdGhlIHRocmVhZCBzdG9wIGV2ZW50IGZvciB0aGlzIHRocmVhZC5cbiAgICBjb25zdCBjYWxsU3RhY2sgPSB0aHJlYWQuZ2V0Q2FjaGVkQ2FsbFN0YWNrKClcbiAgICBpZiAoXG4gICAgICBjYWxsU3RhY2subGVuZ3RoID09PSAwIHx8XG4gICAgICAodGhpcy5fdmlld01vZGVsLmZvY3VzZWRTdGFja0ZyYW1lICYmXG4gICAgICAgIHRoaXMuX3ZpZXdNb2RlbC5mb2N1c2VkU3RhY2tGcmFtZS50aHJlYWQuZ2V0SWQoKSA9PT0gdGhyZWFkLmdldElkKCkgJiZcbiAgICAgICAgY2FsbFN0YWNrLmluY2x1ZGVzKHRoaXMuX3ZpZXdNb2RlbC5mb2N1c2VkU3RhY2tGcmFtZSkpXG4gICAgKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICAvLyBGb2N1cyBmaXJzdCBzdGFjayBmcmFtZSBmcm9tIHRvcCB0aGF0IGhhcyBzb3VyY2UgbG9jYXRpb24gaWYgbm8gb3RoZXIgc3RhY2sgZnJhbWUgaXMgZm9jdXNlZFxuICAgIGNvbnN0IHN0YWNrRnJhbWVUb0ZvY3VzID0gY2FsbFN0YWNrLmZpbmQoKHNmKSA9PiBzZi5zb3VyY2UgIT0gbnVsbCAmJiBzZi5zb3VyY2UuYXZhaWxhYmxlKVxuICAgIGlmIChzdGFja0ZyYW1lVG9Gb2N1cyA9PSBudWxsKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICB0aGlzLl92aWV3TW9kZWwuc2V0Rm9jdXNlZFN0YWNrRnJhbWUoc3RhY2tGcmFtZVRvRm9jdXMsIGZhbHNlKVxuICB9XG5cbiAgX3JlZ2lzdGVyTWFya2Vycyhwcm9jZXNzOiBJUHJvY2Vzcyk6IElEaXNwb3NhYmxlIHtcbiAgICBsZXQgc2VsZWN0ZWRGcmFtZU1hcmtlcjogP2F0b20kTWFya2VyID0gbnVsbFxuICAgIGxldCB0aHJlYWRDaGFuZ2VEYXRhdGlwOiA/SURpc3Bvc2FibGVcbiAgICBsZXQgbGFzdEZvY3VzZWRUaHJlYWRJZDogP251bWJlclxuICAgIGxldCBsYXN0Rm9jdXNlZFByb2Nlc3M6ID9JUHJvY2Vzc1xuXG4gICAgY29uc3QgY2xlYXVwTWFya2VycyA9ICgpID0+IHtcbiAgICAgIGlmIChzZWxlY3RlZEZyYW1lTWFya2VyICE9IG51bGwpIHtcbiAgICAgICAgc2VsZWN0ZWRGcmFtZU1hcmtlci5kZXN0cm95KClcbiAgICAgICAgc2VsZWN0ZWRGcmFtZU1hcmtlciA9IG51bGxcbiAgICAgIH1cblxuICAgICAgaWYgKHRocmVhZENoYW5nZURhdGF0aXAgIT0gbnVsbCkge1xuICAgICAgICB0aHJlYWRDaGFuZ2VEYXRhdGlwLmRpc3Bvc2UoKVxuICAgICAgICB0aHJlYWRDaGFuZ2VEYXRhdGlwID0gbnVsbFxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZShcbiAgICAgIG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24odGhpcy5fdmlld01vZGVsLm9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cy5iaW5kKHRoaXMuX3ZpZXdNb2RlbCkpXG4gICAgICAgIC5jb25jYXRNYXAoKGV2ZW50KSA9PiB7XG4gICAgICAgICAgY2xlYXVwTWFya2VycygpXG5cbiAgICAgICAgICBjb25zdCB7IGV4cGxpY2l0IH0gPSBldmVudFxuICAgICAgICAgIGNvbnN0IHN0YWNrRnJhbWUgPSB0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFN0YWNrRnJhbWVcblxuICAgICAgICAgIGlmIChzdGFja0ZyYW1lID09IG51bGwgfHwgIXN0YWNrRnJhbWUuc291cmNlLmF2YWlsYWJsZSkge1xuICAgICAgICAgICAgaWYgKGV4cGxpY2l0ICYmIHRoaXMuZ2V0RGVidWdnZXJNb2RlKHRoaXMuX3ZpZXdNb2RlbC5mb2N1c2VkUHJvY2VzcykgPT09IERlYnVnZ2VyTW9kZS5QQVVTRUQpIHtcbiAgICAgICAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZFdhcm5pbmcoXCJObyBzb3VyY2UgYXZhaWxhYmxlIGZvciB0aGUgc2VsZWN0ZWQgc3RhY2sgZnJhbWVcIilcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLmVtcHR5KClcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIE9ic2VydmFibGUuZnJvbVByb21pc2Uoc3RhY2tGcmFtZS5vcGVuSW5FZGl0b3IoKSkuc3dpdGNoTWFwKChlZGl0b3IpID0+IHtcbiAgICAgICAgICAgIGlmIChlZGl0b3IgPT0gbnVsbCkge1xuICAgICAgICAgICAgICBjb25zdCB1cmkgPSBzdGFja0ZyYW1lLnNvdXJjZS51cmlcbiAgICAgICAgICAgICAgY29uc3QgZXJyb3JNc2cgPVxuICAgICAgICAgICAgICAgIHVyaSA9PSBudWxsIHx8IHVyaSA9PT0gXCJcIlxuICAgICAgICAgICAgICAgICAgPyBcIlRoZSBzZWxlY3RlZCBzdGFjayBmcmFtZSBoYXMgbm8ga25vd24gc291cmNlIGxvY2F0aW9uXCJcbiAgICAgICAgICAgICAgICAgIDogYE51Y2xpZGUgY291bGQgbm90IG9wZW4gJHt1cml9YFxuICAgICAgICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoZXJyb3JNc2cpXG4gICAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLmVtcHR5KClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLm9mKHsgZWRpdG9yLCBleHBsaWNpdCwgc3RhY2tGcmFtZSB9KVxuICAgICAgICAgIH0pXG4gICAgICAgIH0pXG4gICAgICAgIC5zdWJzY3JpYmUoKHsgZWRpdG9yLCBleHBsaWNpdCwgc3RhY2tGcmFtZSB9KSA9PiB7XG4gICAgICAgICAgY29uc3QgbGluZSA9IHN0YWNrRnJhbWUucmFuZ2Uuc3RhcnQucm93XG4gICAgICAgICAgc2VsZWN0ZWRGcmFtZU1hcmtlciA9IGVkaXRvci5tYXJrQnVmZmVyUmFuZ2UoXG4gICAgICAgICAgICBbXG4gICAgICAgICAgICAgIFtsaW5lLCAwXSxcbiAgICAgICAgICAgICAgW2xpbmUsIEluZmluaXR5XSxcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGludmFsaWRhdGU6IFwibmV2ZXJcIixcbiAgICAgICAgICAgIH1cbiAgICAgICAgICApXG4gICAgICAgICAgZWRpdG9yLmRlY29yYXRlTWFya2VyKHNlbGVjdGVkRnJhbWVNYXJrZXIsIHtcbiAgICAgICAgICAgIHR5cGU6IFwibGluZVwiLFxuICAgICAgICAgICAgY2xhc3M6IFwiZGVidWdnZXItY3VycmVudC1saW5lLWhpZ2hsaWdodFwiLFxuICAgICAgICAgIH0pXG5cbiAgICAgICAgICBjb25zdCBkYXRhdGlwU2VydmljZSA9IGdldERhdGF0aXBTZXJ2aWNlKClcbiAgICAgICAgICBpZiAoZGF0YXRpcFNlcnZpY2UgPT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdGhpcy5fbW9kZWwuc2V0RXhjZXB0aW9uQnJlYWtwb2ludHMoXG4gICAgICAgICAgICBwcm9jZXNzLFxuICAgICAgICAgICAgc3RhY2tGcmFtZS50aHJlYWQucHJvY2Vzcy5zZXNzaW9uLmNhcGFiaWxpdGllcy5leGNlcHRpb25CcmVha3BvaW50RmlsdGVycyB8fCBbXVxuICAgICAgICAgIClcblxuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGxhc3RGb2N1c2VkVGhyZWFkSWQgIT0gbnVsbCAmJlxuICAgICAgICAgICAgIWV4cGxpY2l0ICYmXG4gICAgICAgICAgICBzdGFja0ZyYW1lLnRocmVhZC50aHJlYWRJZCAhPT0gbGFzdEZvY3VzZWRUaHJlYWRJZCAmJlxuICAgICAgICAgICAgcHJvY2VzcyA9PT0gbGFzdEZvY3VzZWRQcm9jZXNzXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBsZXQgbWVzc2FnZSA9IGBBY3RpdmUgdGhyZWFkIGNoYW5nZWQgZnJvbSAke2xhc3RGb2N1c2VkVGhyZWFkSWR9IHRvICR7c3RhY2tGcmFtZS50aHJlYWQudGhyZWFkSWR9YFxuICAgICAgICAgICAgY29uc3QgbmV3Rm9jdXNlZFByb2Nlc3MgPSBzdGFja0ZyYW1lLnRocmVhZC5wcm9jZXNzXG4gICAgICAgICAgICBpZiAobGFzdEZvY3VzZWRQcm9jZXNzICE9IG51bGwgJiYgIWV4cGxpY2l0ICYmIG5ld0ZvY3VzZWRQcm9jZXNzICE9PSBsYXN0Rm9jdXNlZFByb2Nlc3MpIHtcbiAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgIGxhc3RGb2N1c2VkUHJvY2Vzcy5jb25maWd1cmF0aW9uLnByb2Nlc3NOYW1lICE9IG51bGwgJiZcbiAgICAgICAgICAgICAgICBuZXdGb2N1c2VkUHJvY2Vzcy5jb25maWd1cmF0aW9uLnByb2Nlc3NOYW1lICE9IG51bGxcbiAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9XG4gICAgICAgICAgICAgICAgICBcIkFjdGl2ZSBwcm9jZXNzIGNoYW5nZWQgZnJvbSBcIiArXG4gICAgICAgICAgICAgICAgICBsYXN0Rm9jdXNlZFByb2Nlc3MuY29uZmlndXJhdGlvbi5wcm9jZXNzTmFtZSArXG4gICAgICAgICAgICAgICAgICBcIiB0byBcIiArXG4gICAgICAgICAgICAgICAgICBuZXdGb2N1c2VkUHJvY2Vzcy5jb25maWd1cmF0aW9uLnByb2Nlc3NOYW1lICtcbiAgICAgICAgICAgICAgICAgIFwiIEFORCBcIiArXG4gICAgICAgICAgICAgICAgICBtZXNzYWdlXG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbWVzc2FnZSA9IFwiQWN0aXZlIHByb2Nlc3MgY2hhbmdlZCBBTkQgXCIgKyBtZXNzYWdlXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocmVhZENoYW5nZURhdGF0aXAgPSBkYXRhdGlwU2VydmljZS5jcmVhdGVQaW5uZWREYXRhVGlwKFxuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgY29tcG9uZW50OiAoKSA9PiAoXG4gICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXRocmVhZC1zd2l0Y2gtYWxlcnRcIj5cbiAgICAgICAgICAgICAgICAgICAgPEljb24gaWNvbj1cImFsZXJ0XCIgLz5cbiAgICAgICAgICAgICAgICAgICAge21lc3NhZ2V9XG4gICAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgIHJhbmdlOiBzdGFja0ZyYW1lLnJhbmdlLFxuICAgICAgICAgICAgICAgIHBpbm5hYmxlOiB0cnVlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBlZGl0b3JcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChBQ1RJVkVfVEhSRUFEX0NIQU5HRUQpXG4gICAgICAgICAgfVxuICAgICAgICAgIGxhc3RGb2N1c2VkVGhyZWFkSWQgPSBzdGFja0ZyYW1lLnRocmVhZC50aHJlYWRJZFxuICAgICAgICAgIGxhc3RGb2N1c2VkUHJvY2VzcyA9IHN0YWNrRnJhbWUudGhyZWFkLnByb2Nlc3NcbiAgICAgICAgfSksXG5cbiAgICAgIGNsZWF1cE1hcmtlcnNcbiAgICApXG4gIH1cblxuICBfcmVnaXN0ZXJTZXNzaW9uTGlzdGVuZXJzKHByb2Nlc3M6IFByb2Nlc3MsIHNlc3Npb246IFZzRGVidWdTZXNzaW9uKTogdm9pZCB7XG4gICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoc2Vzc2lvbilcbiAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuYWRkKHRoaXMuX3JlZ2lzdGVyTWFya2Vycyhwcm9jZXNzKSlcblxuICAgIGNvbnN0IHNlc3Npb25JZCA9IHNlc3Npb24uZ2V0SWQoKVxuXG4gICAgY29uc3QgdGhyZWFkRmV0Y2hlciA9IHNlcmlhbGl6ZUFzeW5jQ2FsbChhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHNlc3Npb24udGhyZWFkcygpXG4gICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2UuYm9keSAmJiByZXNwb25zZS5ib2R5LnRocmVhZHMpIHtcbiAgICAgICAgcmVzcG9uc2UuYm9keS50aHJlYWRzLmZvckVhY2goKHRocmVhZCkgPT4ge1xuICAgICAgICAgIHRoaXMuX21vZGVsLnJhd1VwZGF0ZSh7XG4gICAgICAgICAgICBzZXNzaW9uSWQsXG4gICAgICAgICAgICB0aHJlYWQsXG4gICAgICAgICAgfSlcbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9KVxuXG4gICAgY29uc3Qgb3BlbkZpbGVzU2F2ZWQgPSBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKFxuICAgICAgYXRvbS53b3Jrc3BhY2Uub2JzZXJ2ZVRleHRFZGl0b3JzLmJpbmQoYXRvbS53b3Jrc3BhY2UpXG4gICAgKS5mbGF0TWFwKChlZGl0b3IpID0+IHtcbiAgICAgIHJldHVybiBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKGVkaXRvci5vbkRpZFNhdmUuYmluZChlZGl0b3IpKVxuICAgICAgICAubWFwKCgpID0+IGVkaXRvci5nZXRQYXRoKCkpXG4gICAgICAgIC50YWtlVW50aWwob2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbihlZGl0b3Iub25EaWREZXN0cm95LmJpbmQoZWRpdG9yKSkpXG4gICAgfSlcblxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoXG4gICAgICBvcGVuRmlsZXNTYXZlZC5zdWJzY3JpYmUoYXN5bmMgKGZpbGVQYXRoKSA9PiB7XG4gICAgICAgIGlmIChmaWxlUGF0aCA9PSBudWxsIHx8ICF0aGlzLl9icmVha3BvaW50c1RvU2VuZE9uU2F2ZS5oYXMoZmlsZVBhdGgpKSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fYnJlYWtwb2ludHNUb1NlbmRPblNhdmUuZGVsZXRlKGZpbGVQYXRoKVxuICAgICAgICBhd2FpdCB0aGlzLl9zZW5kQnJlYWtwb2ludHMoZmlsZVBhdGgsIHRydWUpXG4gICAgICB9KVxuICAgIClcblxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoXG4gICAgICBzZXNzaW9uLm9ic2VydmVJbml0aWFsaXplRXZlbnRzKCkuc3Vic2NyaWJlKGFzeW5jIChldmVudCkgPT4ge1xuICAgICAgICBjb25zdCBzZW5kQ29uZmlndXJhdGlvbkRvbmUgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgaWYgKHNlc3Npb24gJiYgc2Vzc2lvbi5nZXRDYXBhYmlsaXRpZXMoKS5zdXBwb3J0c0NvbmZpZ3VyYXRpb25Eb25lUmVxdWVzdCkge1xuICAgICAgICAgICAgcmV0dXJuIHNlc3Npb25cbiAgICAgICAgICAgICAgLmNvbmZpZ3VyYXRpb25Eb25lKClcbiAgICAgICAgICAgICAgLnRoZW4oKF8pID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLl9vbkRlYnVnZ2VyTW9kZUNoYW5nZWQocHJvY2VzcywgRGVidWdnZXJNb2RlLlJVTk5JTkcpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC5jYXRjaCgoZSkgPT4ge1xuICAgICAgICAgICAgICAgIC8vIERpc2Nvbm5lY3QgdGhlIGRlYnVnIHNlc3Npb24gb24gY29uZmlndXJhdGlvbiBkb25lIGVycm9yICMxMDU5NlxuICAgICAgICAgICAgICAgIHRoaXMuX29uU2Vzc2lvbkVuZChzZXNzaW9uKVxuICAgICAgICAgICAgICAgIHNlc3Npb24uZGlzY29ubmVjdCgpLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKVxuICAgICAgICAgICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcihcbiAgICAgICAgICAgICAgICAgIFwiRmFpbGVkIHRvIGNvbmZpZ3VyZSBkZWJ1Z2dlci4gVGhpcyBpcyBvZnRlbiBiZWNhdXNlIGVpdGhlciBcIiArXG4gICAgICAgICAgICAgICAgICAgIFwidGhlIHByb2Nlc3MgeW91IHRyaWVkIHRvIGF0dGFjaCB0byBoYXMgYWxyZWFkeSB0ZXJtaW5hdGVkLCBvciBcIiArXG4gICAgICAgICAgICAgICAgICAgIFwieW91IGRvIG5vdCBoYXZlIHBlcm1pc3Npb25zICh0aGUgcHJvY2VzcyBpcyBydW5uaW5nIGFzIHJvb3Qgb3IgXCIgK1xuICAgICAgICAgICAgICAgICAgICBcImFub3RoZXIgdXNlci4pXCIsXG4gICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGRldGFpbDogZS5tZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgIGF3YWl0IHRoaXMuX3NlbmRBbGxCcmVha3BvaW50cygpLnRoZW4oc2VuZENvbmZpZ3VyYXRpb25Eb25lLCBzZW5kQ29uZmlndXJhdGlvbkRvbmUpXG4gICAgICAgICAgYXdhaXQgdGhyZWFkRmV0Y2hlcigpXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgb25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgKVxuXG4gICAgY29uc3QgdG9Gb2N1c1RocmVhZHMgPSBuZXcgU3ViamVjdCgpXG5cbiAgICBjb25zdCBvYnNlcnZlQ29udGludWVkVG8gPSAodGhyZWFkSWQ6ID9udW1iZXIpID0+IHtcbiAgICAgIHJldHVybiBzZXNzaW9uXG4gICAgICAgIC5vYnNlcnZlQ29udGludWVkRXZlbnRzKClcbiAgICAgICAgLmZpbHRlcihcbiAgICAgICAgICAoY29udGludWVkKSA9PlxuICAgICAgICAgICAgY29udGludWVkLmJvZHkuYWxsVGhyZWFkc0NvbnRpbnVlZCB8fCAodGhyZWFkSWQgIT0gbnVsbCAmJiB0aHJlYWRJZCA9PT0gY29udGludWVkLmJvZHkudGhyZWFkSWQpXG4gICAgICAgIClcbiAgICAgICAgLnRha2UoMSlcbiAgICB9XG5cbiAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuYWRkKFxuICAgICAgc2Vzc2lvbi5vYnNlcnZlU3RvcEV2ZW50cygpLnN1YnNjcmliZSgoKSA9PiB7XG4gICAgICAgIHRoaXMuX29uRGVidWdnZXJNb2RlQ2hhbmdlZChwcm9jZXNzLCBEZWJ1Z2dlck1vZGUuUEFVU0VEKVxuICAgICAgfSksXG4gICAgICBzZXNzaW9uLm9ic2VydmVFdmFsdWF0aW9ucygpLnN1YnNjcmliZSgoKSA9PiB7XG4gICAgICAgIHRoaXMuX3ZpZXdNb2RlbC5ldmFsdWF0ZUNvbnRleHRDaGFuZ2VkKClcbiAgICAgIH0pLFxuICAgICAgc2Vzc2lvblxuICAgICAgICAub2JzZXJ2ZVN0b3BFdmVudHMoKVxuICAgICAgICAuZmxhdE1hcCgoZXZlbnQpID0+XG4gICAgICAgICAgT2JzZXJ2YWJsZS5mcm9tUHJvbWlzZSh0aHJlYWRGZXRjaGVyKCkpXG4gICAgICAgICAgICAuaWdub3JlRWxlbWVudHMoKVxuICAgICAgICAgICAgLmNvbmNhdChPYnNlcnZhYmxlLm9mKGV2ZW50KSlcbiAgICAgICAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgb25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpXG4gICAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLmVtcHR5KClcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAvLyBQcm9jZWVlZCBwcm9jZXNzaW5nIHRoZSBzdG9wcGVkIGV2ZW50IG9ubHkgaWYgdGhlcmUgd2Fzbid0XG4gICAgICAgICAgICAvLyBhIGNvbnRpbnVlZCBldmVudCB3aGlsZSB3ZSdyZSBmZXRjaGluZyB0aGUgdGhyZWFkc1xuICAgICAgICAgICAgLnRha2VVbnRpbChvYnNlcnZlQ29udGludWVkVG8oZXZlbnQuYm9keS50aHJlYWRJZCkpXG4gICAgICAgIClcbiAgICAgICAgLnN1YnNjcmliZSgoZXZlbnQ6IERlYnVnUHJvdG9jb2wuU3RvcHBlZEV2ZW50KSA9PiB7XG4gICAgICAgICAgY29uc3QgeyB0aHJlYWRJZCB9ID0gZXZlbnQuYm9keVxuICAgICAgICAgIC8vIFVwZGF0aW5nIHN0b3BwZWQgc3RhdGUgbmVlZHMgdG8gaGFwcGVuIGFmdGVyIGZldGNoaW5nIHRoZSB0aHJlYWRzXG4gICAgICAgICAgdGhpcy5fbW9kZWwucmF3VXBkYXRlKHtcbiAgICAgICAgICAgIHNlc3Npb25JZCxcbiAgICAgICAgICAgIHN0b3BwZWREZXRhaWxzOiAoZXZlbnQuYm9keTogYW55KSxcbiAgICAgICAgICAgIHRocmVhZElkLFxuICAgICAgICAgIH0pXG5cbiAgICAgICAgICBpZiAodGhyZWFkSWQgPT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHRocmVhZCA9IHByb2Nlc3MuZ2V0VGhyZWFkKHRocmVhZElkKVxuICAgICAgICAgIGlmICh0aHJlYWQgIT0gbnVsbCkge1xuICAgICAgICAgICAgdG9Gb2N1c1RocmVhZHMubmV4dCh0aHJlYWQpXG4gICAgICAgICAgfVxuICAgICAgICB9KSxcblxuICAgICAgdG9Gb2N1c1RocmVhZHNcbiAgICAgICAgLmNvbmNhdE1hcCgodGhyZWFkKSA9PiB7XG4gICAgICAgICAgY29uc3QgeyBmb2N1c2VkVGhyZWFkIH0gPSB0aGlzLl92aWV3TW9kZWxcbiAgICAgICAgICBjb25zdCBwcmVzZXJ2ZUZvY3VzSGludCA9IGlkeCh0aHJlYWQsIChfKSA9PiBfLnN0b3BwZWREZXRhaWxzLnByZXNlcnZlRm9jdXNIaW50KSB8fCBmYWxzZVxuXG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgZm9jdXNlZFRocmVhZCAhPSBudWxsICYmXG4gICAgICAgICAgICBmb2N1c2VkVGhyZWFkLnN0b3BwZWQgJiZcbiAgICAgICAgICAgIGZvY3VzZWRUaHJlYWQuZ2V0SWQoKSAhPT0gdGhyZWFkLmdldElkKCkgJiZcbiAgICAgICAgICAgIHByZXNlcnZlRm9jdXNIaW50XG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICAvLyBUaGUgZGVidWdnZXIgaXMgYWxyZWFkeSBzdG9wcGVkIGVsc2V3aGVyZS5cbiAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLmVtcHR5KClcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCB0aGlzVGhyZWFkSXNGb2N1c2VkID1cbiAgICAgICAgICAgIHRoaXMuX3ZpZXdNb2RlbC5mb2N1c2VkU3RhY2tGcmFtZSAhPSBudWxsICYmXG4gICAgICAgICAgICB0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFN0YWNrRnJhbWUudGhyZWFkLmdldElkKCkgPT09IHRocmVhZC5nZXRJZCgpXG5cbiAgICAgICAgICAvLyBGZXRjaGVzIHRoZSBmaXJzdCBjYWxsIGZyYW1lIGluIHRoaXMgc3RhY2sgdG8gYWxsb3cgdGhlIFVJIHRvXG4gICAgICAgICAgLy8gdXBkYXRlIHRoZSB0aHJlYWQgbGlzdC4gQWRkaXRpb25hbCBmcmFtZXMgd2lsbCBiZSBmZXRjaGVkIGJ5IHRoZSBVSVxuICAgICAgICAgIC8vIG9uIGRlbWFuZCwgb25seSBpZiB0aGV5IGFyZSBuZWVkZWQuXG4gICAgICAgICAgLy8gSWYgdGhpcyB0aHJlYWQgaXMgdGhlIGN1cnJlbnRseSBmb2N1c2VkIHRocmVhZCwgZmV0Y2ggdGhlIGVudGlyZVxuICAgICAgICAgIC8vIHN0YWNrIGJlY2F1c2UgdGhlIFVJIHdpbGwgY2VydGFpbmx5IG5lZWQgaXQsIGFuZCB3ZSBuZWVkIGl0IGhlcmUgdG9cbiAgICAgICAgICAvLyB0cnkgYW5kIGF1dG8tZm9jdXMgYSBmcmFtZS5cbiAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgT2JzZXJ2YWJsZS5mcm9tUHJvbWlzZSh0aGlzLl9tb2RlbC5yZWZyZXNoQ2FsbFN0YWNrKHRocmVhZCwgdGhpc1RocmVhZElzRm9jdXNlZCkpXG4gICAgICAgICAgICAgIC5pZ25vcmVFbGVtZW50cygpXG4gICAgICAgICAgICAgIC5jb25jYXQoT2JzZXJ2YWJsZS5vZih0aHJlYWQpKVxuICAgICAgICAgICAgICAvLyBBdm9pZCBmb2N1c2luZyBhIGNvbnRpbnVlZCB0aHJlYWQuXG4gICAgICAgICAgICAgIC50YWtlVW50aWwob2JzZXJ2ZUNvbnRpbnVlZFRvKHRocmVhZC50aHJlYWRJZCkpXG4gICAgICAgICAgICAgIC8vIFZlcmlmeSB0aGUgdGhyZWFkIGlzIHN0aWxsIHN0b3BwZWQuXG4gICAgICAgICAgICAgIC5maWx0ZXIoKCkgPT4gdGhyZWFkLnN0b3BwZWQpXG4gICAgICAgICAgICAgIC5jYXRjaCgoZXJyb3IpID0+IHtcbiAgICAgICAgICAgICAgICBvblVuZXhwZWN0ZWRFcnJvcihlcnJvcilcbiAgICAgICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5lbXB0eSgpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgKVxuICAgICAgICB9KVxuICAgICAgICAuc3Vic2NyaWJlKCh0aHJlYWQpID0+IHtcbiAgICAgICAgICB0aGlzLl90cnlUb0F1dG9Gb2N1c1N0YWNrRnJhbWUodGhyZWFkKVxuICAgICAgICAgIHRoaXMuX3NjaGVkdWxlTmF0aXZlTm90aWZpY2F0aW9uKClcbiAgICAgICAgfSlcbiAgICApXG5cbiAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuYWRkKFxuICAgICAgc2Vzc2lvbi5vYnNlcnZlVGhyZWFkRXZlbnRzKCkuc3Vic2NyaWJlKGFzeW5jIChldmVudCkgPT4ge1xuICAgICAgICBpZiAoZXZlbnQuYm9keS5yZWFzb24gPT09IFwic3RhcnRlZFwiKSB7XG4gICAgICAgICAgYXdhaXQgdGhyZWFkRmV0Y2hlcigpXG4gICAgICAgIH0gZWxzZSBpZiAoZXZlbnQuYm9keS5yZWFzb24gPT09IFwiZXhpdGVkXCIpIHtcbiAgICAgICAgICB0aGlzLl9tb2RlbC5jbGVhclRocmVhZHMoc2Vzc2lvbi5nZXRJZCgpLCB0cnVlLCBldmVudC5ib2R5LnRocmVhZElkKVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIClcblxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoXG4gICAgICBzZXNzaW9uLm9ic2VydmVUZXJtaW5hdGVEZWJ1Z2VlRXZlbnRzKCkuc3Vic2NyaWJlKChldmVudCkgPT4ge1xuICAgICAgICBpZiAoZXZlbnQuYm9keSAmJiBldmVudC5ib2R5LnJlc3RhcnQpIHtcbiAgICAgICAgICB0aGlzLnJlc3RhcnRQcm9jZXNzKHByb2Nlc3MpLmNhdGNoKChlcnIpID0+IHtcbiAgICAgICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcihcIkZhaWxlZCB0byByZXN0YXJ0IGRlYnVnZ2VyXCIsIHtcbiAgICAgICAgICAgICAgZGV0YWlsOiBlcnIuc3RhY2sgfHwgU3RyaW5nKGVyciksXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5fb25TZXNzaW9uRW5kKHNlc3Npb24pXG4gICAgICAgICAgc2Vzc2lvbi5kaXNjb25uZWN0KCkuY2F0Y2gob25VbmV4cGVjdGVkRXJyb3IpXG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgKVxuXG4gICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmFkZChcbiAgICAgIHNlc3Npb24ub2JzZXJ2ZUNvbnRpbnVlZEV2ZW50cygpLnN1YnNjcmliZSgoZXZlbnQpID0+IHtcbiAgICAgICAgY29uc3QgdGhyZWFkSWQgPSBldmVudC5ib2R5LmFsbFRocmVhZHNDb250aW51ZWQgIT09IGZhbHNlID8gdW5kZWZpbmVkIDogZXZlbnQuYm9keS50aHJlYWRJZFxuICAgICAgICB0aGlzLl9tb2RlbC5jbGVhclRocmVhZHMoc2Vzc2lvbi5nZXRJZCgpLCBmYWxzZSwgdGhyZWFkSWQpXG4gICAgICAgIHRoaXMuX3ZpZXdNb2RlbC5zZXRGb2N1c2VkVGhyZWFkKHRoaXMuX3ZpZXdNb2RlbC5mb2N1c2VkVGhyZWFkLCBmYWxzZSlcbiAgICAgICAgdGhpcy5fb25EZWJ1Z2dlck1vZGVDaGFuZ2VkKHByb2Nlc3MsIERlYnVnZ2VyTW9kZS5SVU5OSU5HKVxuICAgICAgfSlcbiAgICApXG5cbiAgICBjb25zdCBvdXRwdXRFdmVudHMgPSBzZXNzaW9uXG4gICAgICAub2JzZXJ2ZU91dHB1dEV2ZW50cygpXG4gICAgICAuZmlsdGVyKChldmVudCkgPT4gZXZlbnQuYm9keSAhPSBudWxsICYmIHR5cGVvZiBldmVudC5ib2R5Lm91dHB1dCA9PT0gXCJzdHJpbmdcIilcbiAgICAgIC5zaGFyZSgpXG5cbiAgICBjb25zdCBub3RpZmljYXRpb25TdHJlYW0gPSBvdXRwdXRFdmVudHNcbiAgICAgIC5maWx0ZXIoKGUpID0+IGUuYm9keS5jYXRlZ29yeSA9PT0gXCJudWNsaWRlX25vdGlmaWNhdGlvblwiKVxuICAgICAgLm1hcCgoZSkgPT4gKHtcbiAgICAgICAgdHlwZTogbnVsbHRocm93cyhlLmJvZHkuZGF0YSkudHlwZSxcbiAgICAgICAgbWVzc2FnZTogZS5ib2R5Lm91dHB1dCxcbiAgICAgIH0pKVxuICAgIGNvbnN0IG51Y2xpZGVUcmFja1N0cmVhbSA9IG91dHB1dEV2ZW50cy5maWx0ZXIoKGUpID0+IGUuYm9keS5jYXRlZ29yeSA9PT0gXCJudWNsaWRlX3RyYWNrXCIpXG4gICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmFkZChcbiAgICAgIG5vdGlmaWNhdGlvblN0cmVhbS5zdWJzY3JpYmUoKHsgdHlwZSwgbWVzc2FnZSB9KSA9PiB7XG4gICAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGQodHlwZSwgbWVzc2FnZSlcbiAgICAgIH0pLFxuICAgICAgbnVjbGlkZVRyYWNrU3RyZWFtLnN1YnNjcmliZSgoZSkgPT4ge1xuICAgICAgICB0cmFjayhlLmJvZHkub3V0cHV0LCBlLmJvZHkuZGF0YSB8fCB7fSlcbiAgICAgIH0pXG4gICAgKVxuXG4gICAgY29uc3QgY3JlYXRlQ29uc29sZSA9IGdldENvbnNvbGVTZXJ2aWNlKClcbiAgICBpZiAoY3JlYXRlQ29uc29sZSAhPSBudWxsKSB7XG4gICAgICBjb25zdCBuYW1lID0gZ2V0RGVidWdnZXJOYW1lKHByb2Nlc3MuY29uZmlndXJhdGlvbi5hZGFwdGVyVHlwZSlcbiAgICAgIGNvbnN0IGNvbnNvbGVBcGkgPSBjcmVhdGVDb25zb2xlKHtcbiAgICAgICAgaWQ6IG5hbWUsXG4gICAgICAgIG5hbWUsXG4gICAgICB9KVxuICAgICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmFkZChjb25zb2xlQXBpKVxuICAgICAgY29uc3QgQ0FURUdPUklFU19NQVAgPSBuZXcgTWFwKFtcbiAgICAgICAgW1wic3RkZXJyXCIsIFwiZXJyb3JcIl0sXG4gICAgICAgIFtcImNvbnNvbGVcIiwgXCJ3YXJuaW5nXCJdLFxuICAgICAgICBbXCJzdWNjZXNzXCIsIFwic3VjY2Vzc1wiXSxcbiAgICAgIF0pXG4gICAgICBjb25zdCBJR05PUkVEX0NBVEVHT1JJRVMgPSBuZXcgU2V0KFtcInRlbGVtZXRyeVwiLCBcIm51Y2xpZGVfbm90aWZpY2F0aW9uXCIsIFwibnVjbGlkZV90cmFja1wiXSlcbiAgICAgIGNvbnN0IGxvZ1N0cmVhbSA9IG91dHB1dEV2ZW50c1xuICAgICAgICAuZmlsdGVyKChlKSA9PiBlLmJvZHkudmFyaWFibGVzUmVmZXJlbmNlID09IG51bGwpXG4gICAgICAgIC5maWx0ZXIoKGUpID0+ICFJR05PUkVEX0NBVEVHT1JJRVMuaGFzKGUuYm9keS5jYXRlZ29yeSkpXG4gICAgICAgIC5tYXAoKGUpID0+ICh7XG4gICAgICAgICAgdGV4dDogc3RyaXBBbnNpKGUuYm9keS5vdXRwdXQpLFxuICAgICAgICAgIGxldmVsOiBDQVRFR09SSUVTX01BUC5nZXQoZS5ib2R5LmNhdGVnb3J5KSB8fCBcImxvZ1wiLFxuICAgICAgICB9KSlcbiAgICAgICAgLmZpbHRlcigoZSkgPT4gZS5sZXZlbCAhPSBudWxsKVxuICAgICAgY29uc3Qgb2JqZWN0U3RyZWFtID0gb3V0cHV0RXZlbnRzXG4gICAgICAgIC5maWx0ZXIoKGUpID0+IGUuYm9keS52YXJpYWJsZXNSZWZlcmVuY2UgIT0gbnVsbClcbiAgICAgICAgLm1hcCgoZSkgPT4gKHtcbiAgICAgICAgICBjYXRlZ29yeTogZS5ib2R5LmNhdGVnb3J5LFxuICAgICAgICAgIHZhcmlhYmxlc1JlZmVyZW5jZTogbnVsbHRocm93cyhlLmJvZHkudmFyaWFibGVzUmVmZXJlbmNlKSxcbiAgICAgICAgfSkpXG5cbiAgICAgIGxldCBsYXN0RW50cnlUb2tlbjogP1JlY29yZFRva2VuID0gbnVsbFxuICAgICAgY29uc3QgaGFuZGxlTWVzc2FnZSA9IChsaW5lLCBsZXZlbCkgPT4ge1xuICAgICAgICBjb25zdCBjb21wbGV0ZSA9IGxpbmUuZW5kc1dpdGgoXCJcXG5cIilcbiAgICAgICAgY29uc3Qgc2FtZUxldmVsID0gbGFzdEVudHJ5VG9rZW4gIT0gbnVsbCAmJiBsYXN0RW50cnlUb2tlbi5nZXRDdXJyZW50TGV2ZWwoKSA9PT0gbGV2ZWxcbiAgICAgICAgaWYgKHNhbWVMZXZlbCkge1xuICAgICAgICAgIGxhc3RFbnRyeVRva2VuID0gbnVsbHRocm93cyhsYXN0RW50cnlUb2tlbikuYXBwZW5kVGV4dChsaW5lKVxuICAgICAgICAgIGlmIChjb21wbGV0ZSkge1xuICAgICAgICAgICAgbGFzdEVudHJ5VG9rZW4uc2V0Q29tcGxldGUoKVxuICAgICAgICAgICAgbGFzdEVudHJ5VG9rZW4gPSBudWxsXG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmIChsYXN0RW50cnlUb2tlbiAhPSBudWxsKSB7XG4gICAgICAgICAgICBsYXN0RW50cnlUb2tlbi5zZXRDb21wbGV0ZSgpXG4gICAgICAgICAgfVxuICAgICAgICAgIGxhc3RFbnRyeVRva2VuID0gY29uc29sZUFwaS5hcHBlbmQoe1xuICAgICAgICAgICAgdGV4dDogbGluZSxcbiAgICAgICAgICAgIGxldmVsLFxuICAgICAgICAgICAgaW5jb21wbGV0ZTogIWNvbXBsZXRlLFxuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoXG4gICAgICAgIGxvZ1N0cmVhbS5zdWJzY3JpYmUoKGUpID0+IGhhbmRsZU1lc3NhZ2UoZS50ZXh0LCBlLmxldmVsKSksXG4gICAgICAgIG5vdGlmaWNhdGlvblN0cmVhbS5zdWJzY3JpYmUoKHsgdHlwZSwgbWVzc2FnZSB9KSA9PiB7XG4gICAgICAgICAgYXRvbS5ub3RpZmljYXRpb25zLmFkZCh0eXBlLCBtZXNzYWdlKVxuICAgICAgICB9KSxcbiAgICAgICAgb2JqZWN0U3RyZWFtLnN1YnNjcmliZSgoeyBjYXRlZ29yeSwgdmFyaWFibGVzUmVmZXJlbmNlIH0pID0+IHtcbiAgICAgICAgICBjb25zdCBsZXZlbCA9IENBVEVHT1JJRVNfTUFQLmdldChjYXRlZ29yeSkgfHwgXCJsb2dcIlxuICAgICAgICAgIGNvbnN0IGNvbnRhaW5lciA9IG5ldyBFeHByZXNzaW9uQ29udGFpbmVyKHRoaXMuX3ZpZXdNb2RlbC5mb2N1c2VkUHJvY2VzcywgdmFyaWFibGVzUmVmZXJlbmNlLCB1dWlkLnY0KCkpXG4gICAgICAgICAgY29udGFpbmVyLmdldENoaWxkcmVuKCkudGhlbigoY2hpbGRyZW4pID0+IHtcbiAgICAgICAgICAgIHRoaXMuX2NvbnNvbGVPdXRwdXQubmV4dCh7XG4gICAgICAgICAgICAgIHRleHQ6IGBvYmplY3RbJHtjaGlsZHJlbi5sZW5ndGh9XWAsXG4gICAgICAgICAgICAgIGV4cHJlc3Npb25zOiBjaGlsZHJlbixcbiAgICAgICAgICAgICAgbGV2ZWwsXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH0pXG4gICAgICAgIH0pLFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgaWYgKGxhc3RFbnRyeVRva2VuICE9IG51bGwpIHtcbiAgICAgICAgICAgIGxhc3RFbnRyeVRva2VuLnNldENvbXBsZXRlKClcbiAgICAgICAgICB9XG4gICAgICAgICAgbGFzdEVudHJ5VG9rZW4gPSBudWxsXG4gICAgICAgIH1cbiAgICAgICAgLy8gVE9ETyBoYW5kbGUgbm9uIHN0cmluZyBvdXRwdXQgKGUuZy4gZmlsZXMpXG4gICAgICApXG4gICAgfVxuXG4gICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmFkZChcbiAgICAgIHNlc3Npb25cbiAgICAgICAgLm9ic2VydmVCcmVha3BvaW50RXZlbnRzKClcbiAgICAgICAgLmZsYXRNYXAoKGV2ZW50KSA9PiB7XG4gICAgICAgICAgY29uc3QgeyBicmVha3BvaW50LCByZWFzb24gfSA9IGV2ZW50LmJvZHlcbiAgICAgICAgICBpZiAocmVhc29uICE9PSBCcmVha3BvaW50RXZlbnRSZWFzb25zLkNIQU5HRUQgJiYgcmVhc29uICE9PSBCcmVha3BvaW50RXZlbnRSZWFzb25zLlJFTU9WRUQpIHtcbiAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLm9mKHtcbiAgICAgICAgICAgICAgcmVhc29uLFxuICAgICAgICAgICAgICBicmVha3BvaW50LFxuICAgICAgICAgICAgICBzb3VyY2VCcmVha3BvaW50OiBudWxsLFxuICAgICAgICAgICAgICBmdW5jdGlvbkJyZWFrcG9pbnQ6IG51bGwsXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIEJyZWFrcG9pbnQgZXZlbnRzIG1heSBhcnJpdmUgc29vbmVyIHRoYW4gdGhlaXIgcmVzcG9uc2VzLlxuICAgICAgICAgIC8vIEhlbmNlLCB3ZSdsbCBrZWVwIHRoZW0gY2FjaGVkIGFuZCB0cnkgcmUtcHJvY2Vzc2luZyBvbiBldmVyeSBjaGFuZ2UgdG8gdGhlIG1vZGVsJ3MgYnJlYWtwb2ludHNcbiAgICAgICAgICAvLyBmb3IgYSBzZXQgbWF4aW11bSB0aW1lLCB0aGVuIGRpc2NhcmQuXG4gICAgICAgICAgcmV0dXJuIG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24odGhpcy5fbW9kZWwub25EaWRDaGFuZ2VCcmVha3BvaW50cy5iaW5kKHRoaXMuX21vZGVsKSlcbiAgICAgICAgICAgIC5zdGFydFdpdGgobnVsbClcbiAgICAgICAgICAgIC5zd2l0Y2hNYXAoKCkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBzb3VyY2VCcmVha3BvaW50ID0gdGhpcy5fbW9kZWxcbiAgICAgICAgICAgICAgICAuZ2V0QnJlYWtwb2ludHMoKVxuICAgICAgICAgICAgICAgIC5maWx0ZXIoKGIpID0+IGIuaWRGcm9tQWRhcHRlciA9PT0gYnJlYWtwb2ludC5pZClcbiAgICAgICAgICAgICAgICAucG9wKClcbiAgICAgICAgICAgICAgY29uc3QgZnVuY3Rpb25CcmVha3BvaW50ID0gdGhpcy5fbW9kZWxcbiAgICAgICAgICAgICAgICAuZ2V0RnVuY3Rpb25CcmVha3BvaW50cygpXG4gICAgICAgICAgICAgICAgLmZpbHRlcigoYikgPT4gYi5pZEZyb21BZGFwdGVyID09PSBicmVha3BvaW50LmlkKVxuICAgICAgICAgICAgICAgIC5wb3AoKVxuICAgICAgICAgICAgICBpZiAoc291cmNlQnJlYWtwb2ludCA9PSBudWxsICYmIGZ1bmN0aW9uQnJlYWtwb2ludCA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIE9ic2VydmFibGUuZW1wdHkoKVxuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBPYnNlcnZhYmxlLm9mKHtcbiAgICAgICAgICAgICAgICAgIHJlYXNvbixcbiAgICAgICAgICAgICAgICAgIGJyZWFrcG9pbnQsXG4gICAgICAgICAgICAgICAgICBzb3VyY2VCcmVha3BvaW50LFxuICAgICAgICAgICAgICAgICAgZnVuY3Rpb25CcmVha3BvaW50LFxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGFrZSgxKVxuICAgICAgICAgICAgLnRpbWVvdXQoTUFYX0JSRUFLUE9JTlRfRVZFTlRfREVMQVlfTVMpXG4gICAgICAgICAgICAuY2F0Y2goKGVycm9yKSA9PiB7XG4gICAgICAgICAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFRpbWVvdXRFcnJvcikge1xuICAgICAgICAgICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICAgICAgICAgIFwiVGltZWQgb3V0IGJyZWFrcG9pbnQgZXZlbnQgaGFuZGxlclwiLFxuICAgICAgICAgICAgICAgICAgcHJvY2Vzcy5jb25maWd1cmF0aW9uLmFkYXB0ZXJUeXBlLFxuICAgICAgICAgICAgICAgICAgcmVhc29uLFxuICAgICAgICAgICAgICAgICAgYnJlYWtwb2ludFxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gT2JzZXJ2YWJsZS5lbXB0eSgpXG4gICAgICAgICAgICB9KVxuICAgICAgICB9KVxuICAgICAgICAuc3Vic2NyaWJlKCh7IHJlYXNvbiwgYnJlYWtwb2ludCwgc291cmNlQnJlYWtwb2ludCwgZnVuY3Rpb25CcmVha3BvaW50IH0pID0+IHtcbiAgICAgICAgICBpZiAocmVhc29uID09PSBCcmVha3BvaW50RXZlbnRSZWFzb25zLk5FVyAmJiBicmVha3BvaW50LnNvdXJjZSkge1xuICAgICAgICAgICAgLy8gVGhlIGRlYnVnIGFkYXB0ZXIgaXMgYWRkaW5nIGEgbmV3ICh1bmV4cGVjdGVkKSBicmVha3BvaW50IHRvIHRoZSBVSS5cbiAgICAgICAgICAgIC8vIFRPRE86IENvbnNpZGVyIGFkZGluZyB0aGlzIHRvIHRoZSBjdXJyZW50IHByb2Nlc3Mgb25seS5cbiAgICAgICAgICAgIGNvbnN0IHNvdXJjZSA9IHByb2Nlc3MuZ2V0U291cmNlKGJyZWFrcG9pbnQuc291cmNlKVxuICAgICAgICAgICAgdGhpcy5fbW9kZWwuYWRkVUlCcmVha3BvaW50cyhcbiAgICAgICAgICAgICAgW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgIGNvbHVtbjogYnJlYWtwb2ludC5jb2x1bW4gfHwgMCxcbiAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICAgICAgICBsaW5lOiBicmVha3BvaW50LmxpbmUgPT0gbnVsbCA/IC0xIDogYnJlYWtwb2ludC5saW5lLFxuICAgICAgICAgICAgICAgICAgdXJpOiBzb3VyY2UudXJpLFxuICAgICAgICAgICAgICAgICAgaWQ6IHV1aWQudjQoKSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICBmYWxzZVxuICAgICAgICAgICAgKVxuICAgICAgICAgIH0gZWxzZSBpZiAocmVhc29uID09PSBCcmVha3BvaW50RXZlbnRSZWFzb25zLlJFTU9WRUQpIHtcbiAgICAgICAgICAgIGlmIChzb3VyY2VCcmVha3BvaW50ICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgdGhpcy5fbW9kZWwucmVtb3ZlQnJlYWtwb2ludHMoW3NvdXJjZUJyZWFrcG9pbnRdKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZ1bmN0aW9uQnJlYWtwb2ludCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgIHRoaXMuX21vZGVsLnJlbW92ZUZ1bmN0aW9uQnJlYWtwb2ludHMoZnVuY3Rpb25CcmVha3BvaW50LmdldElkKCkpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChyZWFzb24gPT09IEJyZWFrcG9pbnRFdmVudFJlYXNvbnMuQ0hBTkdFRCkge1xuICAgICAgICAgICAgaWYgKHNvdXJjZUJyZWFrcG9pbnQgIT0gbnVsbCkge1xuICAgICAgICAgICAgICBpZiAoIXNvdXJjZUJyZWFrcG9pbnQuY29sdW1uKSB7XG4gICAgICAgICAgICAgICAgYnJlYWtwb2ludC5jb2x1bW4gPSB1bmRlZmluZWRcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB0aGlzLl9tb2RlbC51cGRhdGVQcm9jZXNzQnJlYWtwb2ludHMocHJvY2Vzcywge1xuICAgICAgICAgICAgICAgIFtzb3VyY2VCcmVha3BvaW50LmdldElkKCldOiBicmVha3BvaW50LFxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGZ1bmN0aW9uQnJlYWtwb2ludCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgIHRoaXMuX21vZGVsLnVwZGF0ZUZ1bmN0aW9uQnJlYWtwb2ludHMoe1xuICAgICAgICAgICAgICAgIFtmdW5jdGlvbkJyZWFrcG9pbnQuZ2V0SWQoKV06IGJyZWFrcG9pbnQsXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxvZ2dlci53YXJuKFwiVW5rbm93biBicmVha3BvaW50IGV2ZW50XCIsIHJlYXNvbiwgYnJlYWtwb2ludClcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgKVxuXG4gICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmFkZChcbiAgICAgIHNlc3Npb24ub2JzZXJ2ZUFkYXB0ZXJFeGl0ZWRFdmVudHMoKS5zdWJzY3JpYmUoKGV2ZW50KSA9PiB7XG4gICAgICAgIC8vICdSdW4gd2l0aG91dCBkZWJ1Z2dpbmcnIG1vZGUgVlNDb2RlIG11c3QgdGVybWluYXRlIHRoZSBleHRlbnNpb24gaG9zdC4gTW9yZSBkZXRhaWxzOiAjMzkwNVxuICAgICAgICB0aGlzLl9vblNlc3Npb25FbmQoc2Vzc2lvbilcbiAgICAgIH0pXG4gICAgKVxuXG4gICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmFkZChcbiAgICAgIHNlc3Npb24ub2JzZXJ2ZUN1c3RvbUV2ZW50cygpLnN1YnNjcmliZSgoZXZlbnQpID0+IHtcbiAgICAgICAgdGhpcy5fZW1pdHRlci5lbWl0KENVU1RPTV9ERUJVR19FVkVOVCwgZXZlbnQpXG4gICAgICB9KVxuICAgIClcblxuICAgIC8vIENsZWFyIGluIG1lbW9yeSBicmVha3BvaW50cy5cbiAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuYWRkKCgpID0+IHtcbiAgICAgIGNvbnN0IHNvdXJjZVJlZkJyZWFrcG9pbnRzID0gdGhpcy5fbW9kZWwuZ2V0QnJlYWtwb2ludHMoKS5maWx0ZXIoKGJwKSA9PiBicC51cmkuc3RhcnRzV2l0aChERUJVR19TT1VSQ0VTX1VSSSkpXG4gICAgICBpZiAoc291cmNlUmVmQnJlYWtwb2ludHMubGVuZ3RoID4gMCkge1xuICAgICAgICB0aGlzLl9tb2RlbC5yZW1vdmVCcmVha3BvaW50cyhzb3VyY2VSZWZCcmVha3BvaW50cylcbiAgICAgIH1cbiAgICB9KVxuICB9XG5cbiAgX3NjaGVkdWxlTmF0aXZlTm90aWZpY2F0aW9uKCk6IHZvaWQge1xuICAgIGNvbnN0IHJhaXNlTmF0aXZlTm90aWZpY2F0aW9uID0gZ2V0Tm90aWZpY2F0aW9uU2VydmljZSgpXG4gICAgaWYgKHJhaXNlTmF0aXZlTm90aWZpY2F0aW9uICE9IG51bGwpIHtcbiAgICAgIGNvbnN0IHBlbmRpbmdOb3RpZmljYXRpb24gPSByYWlzZU5hdGl2ZU5vdGlmaWNhdGlvbihcIkRlYnVnZ2VyXCIsIFwiUGF1c2VkIGF0IGEgYnJlYWtwb2ludFwiLCAzMDAwLCBmYWxzZSlcbiAgICAgIGlmIChwZW5kaW5nTm90aWZpY2F0aW9uICE9IG51bGwpIHtcbiAgICAgICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmFkZChwZW5kaW5nTm90aWZpY2F0aW9uKVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIG9uRGlkQ2hhbmdlQWN0aXZlVGhyZWFkKGNhbGxiYWNrOiAoKSA9PiBtaXhlZCk6IElEaXNwb3NhYmxlIHtcbiAgICByZXR1cm4gdGhpcy5fZW1pdHRlci5vbihBQ1RJVkVfVEhSRUFEX0NIQU5HRUQsIGNhbGxiYWNrKVxuICB9XG5cbiAgb25EaWRTdGFydERlYnVnU2Vzc2lvbihjYWxsYmFjazogKGNvbmZpZzogSVByb2Nlc3NDb25maWcpID0+IG1peGVkKTogSURpc3Bvc2FibGUge1xuICAgIHJldHVybiB0aGlzLl9lbWl0dGVyLm9uKFNUQVJUX0RFQlVHX1NFU1NJT04sIGNhbGxiYWNrKVxuICB9XG5cbiAgb25EaWRDdXN0b21FdmVudChjYWxsYmFjazogKGV2ZW50OiBEZWJ1Z1Byb3RvY29sLkRlYnVnRXZlbnQpID0+IG1peGVkKTogSURpc3Bvc2FibGUge1xuICAgIHJldHVybiB0aGlzLl9lbWl0dGVyLm9uKENVU1RPTV9ERUJVR19FVkVOVCwgY2FsbGJhY2spXG4gIH1cblxuICBvbkRpZENoYW5nZVByb2Nlc3NNb2RlKGNhbGxiYWNrOiAoZGF0YTogeyBwcm9jZXNzOiBJUHJvY2VzcywgbW9kZTogRGVidWdnZXJNb2RlVHlwZSB9KSA9PiBtaXhlZCk6IElEaXNwb3NhYmxlIHtcbiAgICByZXR1cm4gdGhpcy5fZW1pdHRlci5vbihDSEFOR0VfREVCVUdfTU9ERSwgY2FsbGJhY2spXG4gIH1cblxuICBfbG9hZEJyZWFrcG9pbnRzKHN0YXRlOiA/U2VyaWFsaXplZFN0YXRlKTogSVVJQnJlYWtwb2ludFtdIHtcbiAgICBsZXQgcmVzdWx0OiBJVUlCcmVha3BvaW50W10gPSBbXVxuICAgIGlmIChzdGF0ZSA9PSBudWxsIHx8IHN0YXRlLnNvdXJjZUJyZWFrcG9pbnRzID09IG51bGwpIHtcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIHJlc3VsdCA9IHN0YXRlLnNvdXJjZUJyZWFrcG9pbnRzLm1hcCgoYnJlYWtwb2ludCkgPT4ge1xuICAgICAgICBjb25zdCBicDogSVVJQnJlYWtwb2ludCA9IHtcbiAgICAgICAgICB1cmk6IGJyZWFrcG9pbnQudXJpLFxuICAgICAgICAgIGxpbmU6IGJyZWFrcG9pbnQub3JpZ2luYWxMaW5lLFxuICAgICAgICAgIGNvbHVtbjogYnJlYWtwb2ludC5jb2x1bW4sXG4gICAgICAgICAgZW5hYmxlZDogYnJlYWtwb2ludC5lbmFibGVkLFxuICAgICAgICAgIGlkOiB1dWlkLnY0KCksXG4gICAgICAgIH1cbiAgICAgICAgaWYgKGJyZWFrcG9pbnQuY29uZGl0aW9uICE9IG51bGwgJiYgYnJlYWtwb2ludC5jb25kaXRpb24udHJpbSgpICE9PSBcIlwiKSB7XG4gICAgICAgICAgYnAuY29uZGl0aW9uID0gYnJlYWtwb2ludC5jb25kaXRpb25cbiAgICAgICAgfVxuICAgICAgICBpZiAoYnJlYWtwb2ludC5sb2dNZXNzYWdlICE9IG51bGwgJiYgYnJlYWtwb2ludC5sb2dNZXNzYWdlLnRyaW0oKSAhPT0gXCJcIikge1xuICAgICAgICAgIGJwLmxvZ01lc3NhZ2UgPSBicmVha3BvaW50LmxvZ01lc3NhZ2VcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYnBcbiAgICAgIH0pXG4gICAgfSBjYXRjaCAoZSkge31cblxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIF9sb2FkRnVuY3Rpb25CcmVha3BvaW50cyhzdGF0ZTogP1NlcmlhbGl6ZWRTdGF0ZSk6IEZ1bmN0aW9uQnJlYWtwb2ludFtdIHtcbiAgICBsZXQgcmVzdWx0OiBGdW5jdGlvbkJyZWFrcG9pbnRbXSA9IFtdXG4gICAgaWYgKHN0YXRlID09IG51bGwgfHwgc3RhdGUuZnVuY3Rpb25CcmVha3BvaW50cyA9PSBudWxsKSB7XG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICByZXN1bHQgPSBzdGF0ZS5mdW5jdGlvbkJyZWFrcG9pbnRzLm1hcCgoZmIpID0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBGdW5jdGlvbkJyZWFrcG9pbnQoZmIubmFtZSwgZmIuZW5hYmxlZCwgZmIuaGl0Q29uZGl0aW9uKVxuICAgICAgfSlcbiAgICB9IGNhdGNoIChlKSB7fVxuXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgX2xvYWRFeGNlcHRpb25CcmVha3BvaW50cyhzdGF0ZTogP1NlcmlhbGl6ZWRTdGF0ZSk6IEV4Y2VwdGlvbkJyZWFrcG9pbnRbXSB7XG4gICAgbGV0IHJlc3VsdDogRXhjZXB0aW9uQnJlYWtwb2ludFtdID0gW11cbiAgICBpZiAoc3RhdGUgPT0gbnVsbCB8fCBzdGF0ZS5leGNlcHRpb25CcmVha3BvaW50cyA9PSBudWxsKSB7XG4gICAgICByZXR1cm4gcmVzdWx0XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICByZXN1bHQgPSBzdGF0ZS5leGNlcHRpb25CcmVha3BvaW50cy5tYXAoKGV4QnJlYWtwb2ludCkgPT4ge1xuICAgICAgICByZXR1cm4gbmV3IEV4Y2VwdGlvbkJyZWFrcG9pbnQoZXhCcmVha3BvaW50LmZpbHRlciwgZXhCcmVha3BvaW50LmxhYmVsLCBleEJyZWFrcG9pbnQuZW5hYmxlZClcbiAgICAgIH0pXG4gICAgfSBjYXRjaCAoZSkge31cblxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIF9sb2FkV2F0Y2hFeHByZXNzaW9ucyhzdGF0ZTogP1NlcmlhbGl6ZWRTdGF0ZSk6IEV4cHJlc3Npb25bXSB7XG4gICAgbGV0IHJlc3VsdDogRXhwcmVzc2lvbltdID0gW11cbiAgICBpZiAoc3RhdGUgPT0gbnVsbCB8fCBzdGF0ZS53YXRjaEV4cHJlc3Npb25zID09IG51bGwpIHtcbiAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIHJlc3VsdCA9IHN0YXRlLndhdGNoRXhwcmVzc2lvbnMubWFwKChuYW1lKSA9PiBuZXcgRXhwcmVzc2lvbihuYW1lKSlcbiAgICB9IGNhdGNoIChlKSB7fVxuXG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgX29uRGVidWdnZXJNb2RlQ2hhbmdlZChwcm9jZXNzOiBJUHJvY2VzcywgbW9kZTogRGVidWdnZXJNb2RlVHlwZSk6IHZvaWQge1xuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChDSEFOR0VfREVCVUdfTU9ERSwge1xuICAgICAgZGF0YToge1xuICAgICAgICBwcm9jZXNzLFxuICAgICAgICBtb2RlLFxuICAgICAgfSxcbiAgICB9KVxuICB9XG5cbiAgZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoZW5hYmxlOiBib29sZWFuLCBicmVha3BvaW50PzogSUVuYWJsZWFibGUpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoYnJlYWtwb2ludCAhPSBudWxsKSB7XG4gICAgICB0aGlzLl9tb2RlbC5zZXRFbmFibGVtZW50KGJyZWFrcG9pbnQsIGVuYWJsZSlcbiAgICAgIGlmIChicmVha3BvaW50IGluc3RhbmNlb2YgQnJlYWtwb2ludCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc2VuZEJyZWFrcG9pbnRzKGJyZWFrcG9pbnQudXJpKVxuICAgICAgfSBlbHNlIGlmIChicmVha3BvaW50IGluc3RhbmNlb2YgRnVuY3Rpb25CcmVha3BvaW50KSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zZW5kRnVuY3Rpb25CcmVha3BvaW50cygpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfVE9HR0xFX0VYQ0VQVElPTl9CUkVBS1BPSU5UKVxuICAgICAgICByZXR1cm4gdGhpcy5fc2VuZEV4Y2VwdGlvbkJyZWFrcG9pbnRzKClcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLl9tb2RlbC5lbmFibGVPckRpc2FibGVBbGxCcmVha3BvaW50cyhlbmFibGUpXG4gICAgcmV0dXJuIHRoaXMuX3NlbmRBbGxCcmVha3BvaW50cygpXG4gIH1cblxuICBhc3luYyBhZGRVSUJyZWFrcG9pbnRzKHVpQnJlYWtwb2ludHM6IElVSUJyZWFrcG9pbnRbXSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9CUkVBS1BPSU5UX0FERClcbiAgICB0aGlzLl9tb2RlbC5hZGRVSUJyZWFrcG9pbnRzKHVpQnJlYWtwb2ludHMpXG5cbiAgICBjb25zdCB1cmlzID0gbmV3IFNldCgpXG4gICAgZm9yIChjb25zdCBicCBvZiB1aUJyZWFrcG9pbnRzKSB7XG4gICAgICB1cmlzLmFkZChicC51cmkpXG4gICAgfVxuXG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXVxuICAgIGZvciAoY29uc3QgdXJpIG9mIHVyaXMpIHtcbiAgICAgIHByb21pc2VzLnB1c2godGhpcy5fc2VuZEJyZWFrcG9pbnRzKHVyaSkpXG4gICAgfVxuXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpXG4gIH1cblxuICBhZGRTb3VyY2VCcmVha3BvaW50KHVyaTogc3RyaW5nLCBsaW5lOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfQlJFQUtQT0lOVF9TSU5HTEVfQUREKVxuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fbW9kZWwuZ2V0QnJlYWtwb2ludEF0TGluZSh1cmksIGxpbmUpXG4gICAgaWYgKGV4aXN0aW5nID09IG51bGwpIHtcbiAgICAgIHJldHVybiB0aGlzLmFkZFVJQnJlYWtwb2ludHMoW3sgbGluZSwgY29sdW1uOiAwLCBlbmFibGVkOiB0cnVlLCBpZDogdXVpZC52NCgpLCB1cmkgfV0pXG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKVxuICB9XG5cbiAgdG9nZ2xlU291cmNlQnJlYWtwb2ludCh1cmk6IHN0cmluZywgbGluZTogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX0JSRUFLUE9JTlRfVE9HR0xFKVxuICAgIGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fbW9kZWwuZ2V0QnJlYWtwb2ludEF0TGluZSh1cmksIGxpbmUpXG4gICAgaWYgKGV4aXN0aW5nID09IG51bGwpIHtcbiAgICAgIHJldHVybiB0aGlzLmFkZFVJQnJlYWtwb2ludHMoW3sgbGluZSwgY29sdW1uOiAwLCBlbmFibGVkOiB0cnVlLCBpZDogdXVpZC52NCgpLCB1cmkgfV0pXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB0aGlzLnJlbW92ZUJyZWFrcG9pbnRzKGV4aXN0aW5nLmdldElkKCksIHRydWUpXG4gICAgfVxuICB9XG5cbiAgdXBkYXRlQnJlYWtwb2ludHModWlCcmVha3BvaW50czogSVVJQnJlYWtwb2ludFtdKSB7XG4gICAgdGhpcy5fbW9kZWwudXBkYXRlQnJlYWtwb2ludHModWlCcmVha3BvaW50cylcblxuICAgIGNvbnN0IHVyaXNUb1NlbmQgPSBuZXcgU2V0KHVpQnJlYWtwb2ludHMubWFwKChicCkgPT4gYnAudXJpKSlcbiAgICBmb3IgKGNvbnN0IHVyaSBvZiB1cmlzVG9TZW5kKSB7XG4gICAgICB0aGlzLl9icmVha3BvaW50c1RvU2VuZE9uU2F2ZS5hZGQodXJpKVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHJlbW92ZUJyZWFrcG9pbnRzKGlkPzogc3RyaW5nLCBza2lwQW5hbHl0aWNzPzogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgdG9SZW1vdmUgPSB0aGlzLl9tb2RlbC5nZXRCcmVha3BvaW50cygpLmZpbHRlcigoYnApID0+IGlkID09IG51bGwgfHwgYnAuZ2V0SWQoKSA9PT0gaWQpXG4gICAgY29uc3QgdXJpc1RvQ2xlYXIgPSBkaXN0aW5jdCh0b1JlbW92ZSwgKGJwKSA9PiBicC51cmkpLm1hcCgoYnApID0+IGJwLnVyaSlcblxuICAgIHRoaXMuX21vZGVsLnJlbW92ZUJyZWFrcG9pbnRzKHRvUmVtb3ZlKVxuXG4gICAgaWYgKGlkID09IG51bGwpIHtcbiAgICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9CUkVBS1BPSU5UX0RFTEVURV9BTEwpXG4gICAgfSBlbHNlIGlmICghc2tpcEFuYWx5dGljcykge1xuICAgICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX0JSRUFLUE9JTlRfREVMRVRFKVxuICAgIH1cblxuICAgIGF3YWl0IFByb21pc2UuYWxsKHVyaXNUb0NsZWFyLm1hcCgodXJpKSA9PiB0aGlzLl9zZW5kQnJlYWtwb2ludHModXJpKSkpXG4gIH1cblxuICBzZXRCcmVha3BvaW50c0FjdGl2YXRlZChhY3RpdmF0ZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0aGlzLl9tb2RlbC5zZXRCcmVha3BvaW50c0FjdGl2YXRlZChhY3RpdmF0ZWQpXG4gICAgcmV0dXJuIHRoaXMuX3NlbmRBbGxCcmVha3BvaW50cygpXG4gIH1cblxuICBhZGRGdW5jdGlvbkJyZWFrcG9pbnQoKTogdm9pZCB7XG4gICAgdGhpcy5fbW9kZWwuYWRkRnVuY3Rpb25CcmVha3BvaW50KFwiXCIpXG4gIH1cblxuICByZW5hbWVGdW5jdGlvbkJyZWFrcG9pbnQoaWQ6IHN0cmluZywgbmV3RnVuY3Rpb25OYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0aGlzLl9tb2RlbC51cGRhdGVGdW5jdGlvbkJyZWFrcG9pbnRzKHsgW2lkXTogeyBuYW1lOiBuZXdGdW5jdGlvbk5hbWUgfSB9KVxuICAgIHJldHVybiB0aGlzLl9zZW5kRnVuY3Rpb25CcmVha3BvaW50cygpXG4gIH1cblxuICByZW1vdmVGdW5jdGlvbkJyZWFrcG9pbnRzKGlkPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy5fbW9kZWwucmVtb3ZlRnVuY3Rpb25CcmVha3BvaW50cyhpZClcbiAgICByZXR1cm4gdGhpcy5fc2VuZEZ1bmN0aW9uQnJlYWtwb2ludHMoKVxuICB9XG5cbiAgYXN5bmMgdGVybWluYXRlVGhyZWFkcyh0aHJlYWRJZHM6IEFycmF5PG51bWJlcj4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCB7IGZvY3VzZWRQcm9jZXNzIH0gPSB0aGlzLnZpZXdNb2RlbFxuICAgIGlmIChmb2N1c2VkUHJvY2VzcyA9PSBudWxsKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCBzZXNzaW9uID0gZm9jdXNlZFByb2Nlc3Muc2Vzc2lvblxuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9URVJNSU5BVEVfVEhSRUFEKVxuICAgIGlmIChCb29sZWFuKHNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzVGVybWluYXRlVGhyZWFkc1JlcXVlc3QpKSB7XG4gICAgICBhd2FpdCBzZXNzaW9uLmN1c3RvbShcInRlcm1pbmF0ZVRocmVhZHNcIiwge1xuICAgICAgICB0aHJlYWRJZHMsXG4gICAgICB9KVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHJ1blRvTG9jYXRpb24odXJpOiBzdHJpbmcsIGxpbmU6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHsgZm9jdXNlZFRocmVhZCwgZm9jdXNlZFByb2Nlc3MgfSA9IHRoaXMudmlld01vZGVsXG4gICAgaWYgKGZvY3VzZWRUaHJlYWQgPT0gbnVsbCB8fCBmb2N1c2VkUHJvY2VzcyA9PSBudWxsKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCBzZXNzaW9uID0gZm9jdXNlZFByb2Nlc3Muc2Vzc2lvblxuXG4gICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX1NURVBfUlVOX1RPX0xPQ0FUSU9OKVxuICAgIGlmIChCb29sZWFuKHNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzQ29udGludWVUb0xvY2F0aW9uKSkge1xuICAgICAgYXdhaXQgc2Vzc2lvbi5jdXN0b20oXCJjb250aW51ZVRvTG9jYXRpb25cIiwge1xuICAgICAgICBzb3VyY2U6IGZvY3VzZWRQcm9jZXNzLmdldFNvdXJjZSh7IHBhdGg6IHVyaSB9KS5yYXcsXG4gICAgICAgIGxpbmUsXG4gICAgICAgIHRocmVhZElkOiBmb2N1c2VkVGhyZWFkLnRocmVhZElkLFxuICAgICAgfSlcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBjb25zdCBleGlzdGluZyA9IHRoaXMuX21vZGVsLmdldEJyZWFrcG9pbnRBdExpbmUodXJpLCBsaW5lKVxuICAgIGlmIChleGlzdGluZyA9PSBudWxsKSB7XG4gICAgICBhd2FpdCB0aGlzLmFkZFVJQnJlYWtwb2ludHMoW3sgbGluZSwgY29sdW1uOiAwLCBlbmFibGVkOiB0cnVlLCBpZDogdXVpZC52NCgpLCB1cmkgfV0pXG4gICAgICBjb25zdCBydW5Ub0xvY2F0aW9uQnJlYWtwb2ludCA9IHRoaXMuX21vZGVsLmdldEJyZWFrcG9pbnRBdExpbmUodXJpLCBsaW5lKVxuICAgICAgaW52YXJpYW50KHJ1blRvTG9jYXRpb25CcmVha3BvaW50ICE9IG51bGwpXG5cbiAgICAgIGNvbnN0IHJlbW92ZUJyZWFrcG9pbnQgPSAoKSA9PiB7XG4gICAgICAgIHRoaXMucmVtb3ZlQnJlYWtwb2ludHMocnVuVG9Mb2NhdGlvbkJyZWFrcG9pbnQuZ2V0SWQoKSwgdHJ1ZSAvKiBza2lwIGFuYWx5dGljcyAqLykuY2F0Y2goKGVycm9yKSA9PlxuICAgICAgICAgIG9uVW5leHBlY3RlZEVycm9yKGBGYWlsZWQgdG8gY2xlYXIgcnVuLXRvLWxvY2F0aW9uIGJyZWFrcG9pbnQhIC0gJHtTdHJpbmcoZXJyb3IpfWApXG4gICAgICAgIClcbiAgICAgICAgcmVtb3ZlQnJlYWtwb2ludERpc3Bvc2FibGUuZGlzcG9zZSgpXG4gICAgICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5yZW1vdmUocmVtb3ZlQnJlYWtwb2ludERpc3Bvc2FibGUpXG4gICAgICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5yZW1vdmUocmVtb3ZlQnJlYWtwb2ludClcbiAgICAgIH1cblxuICAgICAgLy8gUmVtb3ZlIGlmIHRoZSBkZWJ1Z2dlciBzdG9wcGVkIGF0IGFueSBsb2NhdGlvbi5cbiAgICAgIGNvbnN0IHJlbW92ZUJyZWFrcG9pbnREaXNwb3NhYmxlID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoXG4gICAgICAgIHNlc3Npb24ub2JzZXJ2ZVN0b3BFdmVudHMoKS50YWtlKDEpLnN1YnNjcmliZShyZW1vdmVCcmVha3BvaW50KVxuICAgICAgKVxuICAgICAgLy8gUmVtb3ZlIGlmIHRoZSBzZXNzaW9uIGhhcyBlbmRlZCB3aXRob3V0IGhpdHRpbmcgaXQuXG4gICAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuYWRkKHJlbW92ZUJyZWFrcG9pbnREaXNwb3NhYmxlLCByZW1vdmVCcmVha3BvaW50KVxuICAgIH1cbiAgICBhd2FpdCBmb2N1c2VkVGhyZWFkLmNvbnRpbnVlKClcbiAgfVxuXG4gIGFkZFdhdGNoRXhwcmVzc2lvbihuYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfV0FUQ0hfQUREX0VYUFJFU1NJT04pXG4gICAgcmV0dXJuIHRoaXMuX21vZGVsLmFkZFdhdGNoRXhwcmVzc2lvbihuYW1lKVxuICB9XG5cbiAgcmVuYW1lV2F0Y2hFeHByZXNzaW9uKGlkOiBzdHJpbmcsIG5ld05hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9XQVRDSF9VUERBVEVfRVhQUkVTU0lPTilcbiAgICByZXR1cm4gdGhpcy5fbW9kZWwucmVuYW1lV2F0Y2hFeHByZXNzaW9uKGlkLCBuZXdOYW1lKVxuICB9XG5cbiAgcmVtb3ZlV2F0Y2hFeHByZXNzaW9ucyhpZD86IHN0cmluZyk6IHZvaWQge1xuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9XQVRDSF9SRU1PVkVfRVhQUkVTU0lPTilcbiAgICB0aGlzLl9tb2RlbC5yZW1vdmVXYXRjaEV4cHJlc3Npb25zKGlkKVxuICB9XG5cbiAgY3JlYXRlRXhwcmVzc2lvbihyYXdFeHByZXNzaW9uOiBzdHJpbmcpOiBJRXZhbHVhdGFibGVFeHByZXNzaW9uIHtcbiAgICByZXR1cm4gbmV3IEV4cHJlc3Npb24ocmF3RXhwcmVzc2lvbilcbiAgfVxuXG4gIGFzeW5jIF9kb0NyZWF0ZVByb2Nlc3MocmF3Q29uZmlndXJhdGlvbjogSVByb2Nlc3NDb25maWcsIHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTw/SVByb2Nlc3M+IHtcbiAgICBsZXQgcHJvY2VzczogP1Byb2Nlc3NcbiAgICBsZXQgc2Vzc2lvbjogP1ZzRGVidWdTZXNzaW9uXG4gICAgY29uc3QgZXJyb3JIYW5kbGVyID0gKGVycm9yOiBFcnJvcikgPT4ge1xuICAgICAgaWYgKHRoaXMuX3RpbWVyICE9IG51bGwpIHtcbiAgICAgICAgdGhpcy5fdGltZXIub25FcnJvcihlcnJvcilcbiAgICAgICAgdGhpcy5fdGltZXIgPSBudWxsXG4gICAgICB9XG4gICAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfU1RBUlRfRkFJTCwge30pXG4gICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yXG4gICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkRXJyb3IoYEZhaWxlZCB0byBzdGFydCBkZWJ1Z2dlciBwcm9jZXNzOiAke2Vycm9yTWVzc2FnZX1gKVxuXG4gICAgICBpZiAodGhpcy5fbW9kZWwuZ2V0UHJvY2Vzc2VzKCkgPT0gbnVsbCB8fCB0aGlzLl9tb2RlbC5nZXRQcm9jZXNzZXMoKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgdGhpcy5fY29uc29sZURpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICAgICAgfVxuICAgICAgaWYgKHNlc3Npb24gIT0gbnVsbCAmJiAhc2Vzc2lvbi5pc0Rpc2Nvbm5lY3RlZCgpKSB7XG4gICAgICAgIHRoaXMuX29uU2Vzc2lvbkVuZChzZXNzaW9uKVxuICAgICAgICBzZXNzaW9uLmRpc2Nvbm5lY3QoKS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcilcbiAgICAgIH1cbiAgICAgIGlmIChwcm9jZXNzICE9IG51bGwpIHtcbiAgICAgICAgdGhpcy5fbW9kZWwucmVtb3ZlUHJvY2Vzcyhwcm9jZXNzLmdldElkKCkpXG4gICAgICAgIHRoaXMuX29uRGVidWdnZXJNb2RlQ2hhbmdlZChwcm9jZXNzLCBEZWJ1Z2dlck1vZGUuU1RPUFBFRClcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0cnkge1xuICAgICAgbGV0IGNvbmZpZ3VyYXRpb246IElQcm9jZXNzQ29uZmlnXG4gICAgICBsZXQgYWRhcHRlckV4ZWN1dGFibGU6IFZTQWRhcHRlckV4ZWN1dGFibGVJbmZvXG4gICAgICAvLyBpZiBzZXJ2aWNlIGRvZXMgbm90IHByb3ZpZGUgYWRhcHRlckV4ZWN1dGFibGUgdXNlIHRoZSBoYXJkY29kZWQgdmFsdWVzIGluIGRlYnVnZ2VyLXJlZ2lzdHJ5XG4gICAgICBpZiAoIXJhd0NvbmZpZ3VyYXRpb24uYWRhcHRlckV4ZWN1dGFibGUpIHtcbiAgICAgICAgYWRhcHRlckV4ZWN1dGFibGUgPSBhd2FpdCB0aGlzLl9yZXNvbHZlQWRhcHRlckV4ZWN1dGFibGUocmF3Q29uZmlndXJhdGlvbilcbiAgICAgICAgY29uZmlndXJhdGlvbiA9IHtcbiAgICAgICAgICAuLi5yYXdDb25maWd1cmF0aW9uLFxuICAgICAgICAgIGFkYXB0ZXJFeGVjdXRhYmxlLFxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBhbHJlYWR5IGFkYXB0ZXJFeGVjdXRhYmxlIGlzIHByb3ZpZGVkIGJ5IHRoZSBwcm92aWRlciBzbyB0aGUgY29uZmlndXJhdGlvbiBpcyBub3QgcmF3LlxuICAgICAgICBjb25maWd1cmF0aW9uID0gcmF3Q29uZmlndXJhdGlvblxuICAgICAgfVxuICAgICAgY29uZmlndXJhdGlvbiA9IGF3YWl0IHJlc29sdmVEZWJ1Z0NvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvbilcbiAgICAgIGNvbnN0IHsgYWRhcHRlclR5cGUsIG9uRGVidWdTdGFydGluZ0NhbGxiYWNrLCBvbkRlYnVnU3RhcnRlZENhbGxiYWNrLCBvbkRlYnVnUnVubmluZ0NhbGxiYWNrIH0gPSBjb25maWd1cmF0aW9uXG5cbiAgICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9TVEFSVCwge1xuICAgICAgICBzZXJ2aWNlTmFtZTogY29uZmlndXJhdGlvbi5hZGFwdGVyVHlwZSxcbiAgICAgICAgY2xpZW50VHlwZTogXCJWU1BcIixcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHNlc3Npb25UZWFyZG93bkRpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoKVxuXG4gICAgICBjb25zdCBpbnN0YW5jZUludGVyZmFjZSA9IChuZXdTZXNzaW9uKSA9PiB7XG4gICAgICAgIHJldHVybiBPYmplY3QuZnJlZXplKHtcbiAgICAgICAgICBjdXN0b21SZXF1ZXN0OiBhc3luYyAocmVxdWVzdDogc3RyaW5nLCBhcmdzOiBhbnkpOiBQcm9taXNlPERlYnVnUHJvdG9jb2wuQ3VzdG9tUmVzcG9uc2U+ID0+IHtcbiAgICAgICAgICAgIHJldHVybiBuZXdTZXNzaW9uLmN1c3RvbShyZXF1ZXN0LCBhcmdzKVxuICAgICAgICAgIH0sXG4gICAgICAgICAgb2JzZXJ2ZUN1c3RvbUV2ZW50czogbmV3U2Vzc2lvbi5vYnNlcnZlQ3VzdG9tRXZlbnRzLmJpbmQobmV3U2Vzc2lvbiksXG4gICAgICAgIH0pXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGNyZWF0ZUluaXRpYWxpemVTZXNzaW9uID0gYXN5bmMgKGNvbmZpZzogSVByb2Nlc3NDb25maWcpID0+IHtcbiAgICAgICAgY29uc3QgbmV3U2Vzc2lvbiA9IGF3YWl0IHRoaXMuX2NyZWF0ZVZzRGVidWdTZXNzaW9uKFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBjb25maWcuYWRhcHRlckV4ZWN1dGFibGUgfHwgYWRhcHRlckV4ZWN1dGFibGUsXG4gICAgICAgICAgc2Vzc2lvbklkXG4gICAgICAgIClcblxuICAgICAgICAvLyBJZiB0aGlzIGlzIHRoZSBmaXJzdCBwcm9jZXNzLCByZWdpc3RlciB0aGUgY29uc29sZSBleGVjdXRvci5cbiAgICAgICAgaWYgKHRoaXMuX21vZGVsLmdldFByb2Nlc3NlcygpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIHRoaXMuX3JlZ2lzdGVyQ29uc29sZUV4ZWN1dG9yKClcbiAgICAgICAgfVxuXG4gICAgICAgIHByb2Nlc3MgPSB0aGlzLl9tb2RlbC5hZGRQcm9jZXNzKGNvbmZpZywgbmV3U2Vzc2lvbilcbiAgICAgICAgdGhpcy5fdmlld01vZGVsLnNldEZvY3VzZWRQcm9jZXNzKHByb2Nlc3MsIGZhbHNlKVxuICAgICAgICB0aGlzLl9vbkRlYnVnZ2VyTW9kZUNoYW5nZWQocHJvY2VzcywgRGVidWdnZXJNb2RlLlNUQVJUSU5HKVxuICAgICAgICB0aGlzLl9lbWl0dGVyLmVtaXQoU1RBUlRfREVCVUdfU0VTU0lPTiwgY29uZmlnKVxuICAgICAgICB0aGlzLl9yZWdpc3RlclNlc3Npb25MaXN0ZW5lcnMocHJvY2VzcywgbmV3U2Vzc2lvbilcbiAgICAgICAgYXRvbS5jb21tYW5kcy5kaXNwYXRjaChhdG9tLnZpZXdzLmdldFZpZXcoYXRvbS53b3Jrc3BhY2UpLCBcImRlYnVnZ2VyOnNob3dcIilcbiAgICAgICAgYXdhaXQgbmV3U2Vzc2lvbi5pbml0aWFsaXplKHtcbiAgICAgICAgICBjbGllbnRJRDogXCJhdG9tXCIsXG4gICAgICAgICAgYWRhcHRlcklEOiBhZGFwdGVyVHlwZSxcbiAgICAgICAgICBwYXRoRm9ybWF0OiBcInBhdGhcIixcbiAgICAgICAgICBsaW5lc1N0YXJ0QXQxOiB0cnVlLFxuICAgICAgICAgIGNvbHVtbnNTdGFydEF0MTogdHJ1ZSxcbiAgICAgICAgICBzdXBwb3J0c1ZhcmlhYmxlVHlwZTogdHJ1ZSxcbiAgICAgICAgICBzdXBwb3J0c1ZhcmlhYmxlUGFnaW5nOiBmYWxzZSxcbiAgICAgICAgICBzdXBwb3J0c1J1bkluVGVybWluYWxSZXF1ZXN0OiBnZXRUZXJtaW5hbFNlcnZpY2UoKSAhPSBudWxsLFxuICAgICAgICAgIGxvY2FsZTogXCJlbi11c1wiLFxuICAgICAgICB9KVxuXG4gICAgICAgIGlmIChvbkRlYnVnU3RhcnRpbmdDYWxsYmFjayAhPSBudWxsKSB7XG4gICAgICAgICAgLy8gQ2FsbGJhY2tzIGFyZSBwYXNzZWQgSVZzcEluc3RhbmNlIHdoaWNoIGV4cG9zZXMgb25seSBjZXJ0YWluXG4gICAgICAgICAgLy8gbWV0aG9kcyB0byB0aGVtLCByYXRoZXIgdGhhbiBnZXR0aW5nIHRoZSBmdWxsIHNlc3Npb24uXG4gICAgICAgICAgY29uc3QgdGVhcmRvd24gPSBvbkRlYnVnU3RhcnRpbmdDYWxsYmFjayhpbnN0YW5jZUludGVyZmFjZShuZXdTZXNzaW9uKSlcbiAgICAgICAgICBpZiAodGVhcmRvd24gIT0gbnVsbCkge1xuICAgICAgICAgICAgc2Vzc2lvblRlYXJkb3duRGlzcG9zYWJsZXMuYWRkKHRlYXJkb3duKVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX21vZGVsLnNldEV4Y2VwdGlvbkJyZWFrcG9pbnRzKHByb2Nlc3MsIG5ld1Nlc3Npb24uZ2V0Q2FwYWJpbGl0aWVzKCkuZXhjZXB0aW9uQnJlYWtwb2ludEZpbHRlcnMgfHwgW10pXG4gICAgICAgIHJldHVybiBuZXdTZXNzaW9uXG4gICAgICB9XG5cbiAgICAgIHNlc3Npb24gPSBhd2FpdCBjcmVhdGVJbml0aWFsaXplU2Vzc2lvbihjb25maWd1cmF0aW9uKVxuXG4gICAgICBjb25zdCBzZXRSdW5uaW5nU3RhdGUgPSAoKSA9PiB7XG4gICAgICAgIGlmIChwcm9jZXNzICE9IG51bGwpIHtcbiAgICAgICAgICBwcm9jZXNzLmNsZWFyUHJvY2Vzc1N0YXJ0aW5nRmxhZygpXG4gICAgICAgICAgdGhpcy5fb25EZWJ1Z2dlck1vZGVDaGFuZ2VkKHByb2Nlc3MsIERlYnVnZ2VyTW9kZS5SVU5OSU5HKVxuICAgICAgICAgIHRoaXMuX3ZpZXdNb2RlbC5zZXRGb2N1c2VkUHJvY2Vzcyhwcm9jZXNzLCBmYWxzZSlcbiAgICAgICAgICBpZiAob25EZWJ1Z1J1bm5pbmdDYWxsYmFjayAhPSBudWxsICYmIHNlc3Npb24gIT0gbnVsbCkge1xuICAgICAgICAgICAgLy8gQ2FsbGJhY2tzIGFyZSBwYXNzZWQgSVZzcEluc3RhbmNlIHdoaWNoIGV4cG9zZXMgb25seSBjZXJ0YWluXG4gICAgICAgICAgICAvLyBtZXRob2RzIHRvIHRoZW0sIHJhdGhlciB0aGFuIGdldHRpbmcgdGhlIGZ1bGwgc2Vzc2lvbi5cbiAgICAgICAgICAgIGNvbnN0IHRlYXJkb3duID0gb25EZWJ1Z1J1bm5pbmdDYWxsYmFjayhpbnN0YW5jZUludGVyZmFjZShzZXNzaW9uKSlcbiAgICAgICAgICAgIGlmICh0ZWFyZG93biAhPSBudWxsKSB7XG4gICAgICAgICAgICAgIHNlc3Npb25UZWFyZG93bkRpc3Bvc2FibGVzLmFkZCh0ZWFyZG93bilcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gV2UncmUgbm90IGF3YWl0aW5nIGxhdW5jaC9hdHRhY2ggdG8gZmluaXNoIGJlY2F1c2Ugc29tZSBkZWJ1ZyBhZGFwdGVyc1xuICAgICAgLy8gbmVlZCB0byBkbyBjdXN0b20gd29yayBmb3IgbGF1bmNoL2F0dGFjaCB0byB3b3JrIChlLmcuIG1vYmlsZWpzKVxuICAgICAgdGhpcy5fbGF1bmNoT3JBdHRhY2hUYXJnZXQoc2Vzc2lvbiwgY29uZmlndXJhdGlvbilcbiAgICAgICAgLnRoZW4oKCkgPT4gc2V0UnVubmluZ1N0YXRlKCkpXG4gICAgICAgIC5jYXRjaChhc3luYyAoZXJyb3IpID0+IHtcbiAgICAgICAgICBpZiAocHJvY2VzcyAhPSBudWxsKSB7XG4gICAgICAgICAgICB0aGlzLnN0b3BQcm9jZXNzKHByb2Nlc3MpXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgY29uZmlndXJhdGlvbi5kZWJ1Z01vZGUgPT09IFwiYXR0YWNoXCIgJiZcbiAgICAgICAgICAgIGNvbmZpZ3VyYXRpb24uYWRhcHRlckV4ZWN1dGFibGUgIT0gbnVsbCAmJlxuICAgICAgICAgICAgY29uZmlndXJhdGlvbi5hZGFwdGVyRXhlY3V0YWJsZS5jb21tYW5kICE9PSBcInN1ZG9cIiAmJlxuICAgICAgICAgICAgLy8gc3VkbyBpcyBub3Qgc3VwcG9ydGVkIG9uIFdpbmRvd3MsIGFuZCBjdXJyZW50bHkgcmVtb3RlIHByb2plY3RzXG4gICAgICAgICAgICAvLyBhcmUgbm90IHN1cHBvcnRlZCBvbiBXaW5kb3dzLCBzbyBhIHJlbW90ZSBVUkkgbXVzdCBiZSAqbml4LlxuICAgICAgICAgICAgKG9zLnBsYXRmb3JtKCkgIT09IFwid2luMzJcIiB8fCBudWNsaWRlVXJpLmlzUmVtb3RlKGNvbmZpZ3VyYXRpb24udGFyZ2V0VXJpKSlcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIGNvbmZpZ3VyYXRpb24uYWRhcHRlckV4ZWN1dGFibGUuYXJncyA9IFtcbiAgICAgICAgICAgICAgY29uZmlndXJhdGlvbi5hZGFwdGVyRXhlY3V0YWJsZS5jb21tYW5kLFxuICAgICAgICAgICAgICAuLi5jb25maWd1cmF0aW9uLmFkYXB0ZXJFeGVjdXRhYmxlLmFyZ3MsXG4gICAgICAgICAgICBdXG4gICAgICAgICAgICBjb25maWd1cmF0aW9uLmFkYXB0ZXJFeGVjdXRhYmxlLmNvbW1hbmQgPSBcInN1ZG9cIlxuXG4gICAgICAgICAgICBjb25zdCBlcnJvck1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IGVycm9yXG4gICAgICAgICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkV2FybmluZyhcbiAgICAgICAgICAgICAgYFRoZSBkZWJ1Z2dlciB3YXMgdW5hYmxlIHRvIGF0dGFjaCB0byB0aGUgdGFyZ2V0IHByb2Nlc3M6ICR7ZXJyb3JNZXNzYWdlfS4gYCArXG4gICAgICAgICAgICAgICAgXCJBdHRlbXB0aW5nIHRvIHJlLWxhdW5jaCB0aGUgZGVidWdnZXIgYXMgcm9vdC4uLlwiXG4gICAgICAgICAgICApXG5cbiAgICAgICAgICAgIHNlc3Npb24gPSBhd2FpdCBjcmVhdGVJbml0aWFsaXplU2Vzc2lvbihjb25maWd1cmF0aW9uKVxuICAgICAgICAgICAgdGhpcy5fbGF1bmNoT3JBdHRhY2hUYXJnZXQoc2Vzc2lvbiwgY29uZmlndXJhdGlvbilcbiAgICAgICAgICAgICAgLnRoZW4oKCkgPT4gc2V0UnVubmluZ1N0YXRlKCkpXG4gICAgICAgICAgICAgIC5jYXRjaChlcnJvckhhbmRsZXIpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVycm9ySGFuZGxlcihlcnJvcilcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG5cbiAgICAgIGlmIChvbkRlYnVnU3RhcnRlZENhbGxiYWNrICE9IG51bGwgJiYgc2Vzc2lvbiAhPSBudWxsKSB7XG4gICAgICAgIGNvbnN0IHRlYXJkb3duID0gb25EZWJ1Z1N0YXJ0ZWRDYWxsYmFjayhpbnN0YW5jZUludGVyZmFjZShzZXNzaW9uKSlcbiAgICAgICAgaWYgKHRlYXJkb3duICE9IG51bGwpIHtcbiAgICAgICAgICBzZXNzaW9uVGVhcmRvd25EaXNwb3NhYmxlcy5hZGQodGVhcmRvd24pXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmFkZCgoKSA9PiB7XG4gICAgICAgIHRoaXMuX21vZGVsLm9uRGlkQ2hhbmdlUHJvY2Vzc2VzKCgpID0+IHtcbiAgICAgICAgICBpZiAoIXRoaXMuZ2V0TW9kZWwoKS5nZXRQcm9jZXNzZXMoKS5pbmNsdWRlcyhwcm9jZXNzKSkge1xuICAgICAgICAgICAgc2Vzc2lvblRlYXJkb3duRGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgfSlcbiAgICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5hZGQoc2Vzc2lvblRlYXJkb3duRGlzcG9zYWJsZXMpXG5cbiAgICAgIHJldHVybiBwcm9jZXNzXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGVycm9ySGFuZGxlcihlcnJvcilcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG5cbiAgYXN5bmMgX3Jlc29sdmVBZGFwdGVyRXhlY3V0YWJsZShjb25maWd1cmF0aW9uOiBJUHJvY2Vzc0NvbmZpZyk6IFByb21pc2U8VlNBZGFwdGVyRXhlY3V0YWJsZUluZm8+IHtcbiAgICBpZiAoY29uZmlndXJhdGlvbi5hZGFwdGVyRXhlY3V0YWJsZSAhPSBudWxsKSB7XG4gICAgICByZXR1cm4gY29uZmlndXJhdGlvbi5hZGFwdGVyRXhlY3V0YWJsZVxuICAgIH1cbiAgICByZXR1cm4gZ2V0VlNDb2RlRGVidWdnZXJBZGFwdGVyU2VydmljZUJ5TnVjbGlkZVVyaShjb25maWd1cmF0aW9uLnRhcmdldFVyaSkuZ2V0QWRhcHRlckV4ZWN1dGFibGVJbmZvKFxuICAgICAgY29uZmlndXJhdGlvbi5hZGFwdGVyVHlwZVxuICAgIClcbiAgfVxuXG4gIGFzeW5jIF9jcmVhdGVWc0RlYnVnU2Vzc2lvbihcbiAgICBjb25maWd1cmF0aW9uOiBJUHJvY2Vzc0NvbmZpZyxcbiAgICBhZGFwdGVyRXhlY3V0YWJsZTogVlNBZGFwdGVyRXhlY3V0YWJsZUluZm8sXG4gICAgc2Vzc2lvbklkOiBzdHJpbmdcbiAgKTogUHJvbWlzZTxWc0RlYnVnU2Vzc2lvbj4ge1xuICAgIGNvbnN0IHsgdGFyZ2V0VXJpIH0gPSBjb25maWd1cmF0aW9uXG4gICAgY29uc3Qgc2VydmljZSA9IGdldFZTQ29kZURlYnVnZ2VyQWRhcHRlclNlcnZpY2VCeU51Y2xpZGVVcmkodGFyZ2V0VXJpKVxuICAgIGNvbnN0IHNwYXduZXIgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZVZzUmF3QWRhcHRlclNwYXduZXJTZXJ2aWNlKClcblxuICAgIGNvbnN0IGNsaWVudFByZXByb2Nlc3NvcnM6IEFycmF5PE1lc3NhZ2VQcm9jZXNzb3I+ID0gW11cbiAgICBjb25zdCBhZGFwdGVyUHJlcHJvY2Vzc29yczogQXJyYXk8TWVzc2FnZVByb2Nlc3Nvcj4gPSBbXVxuICAgIGlmIChjb25maWd1cmF0aW9uLmNsaWVudFByZXByb2Nlc3NvciAhPSBudWxsKSB7XG4gICAgICBjbGllbnRQcmVwcm9jZXNzb3JzLnB1c2goY29uZmlndXJhdGlvbi5jbGllbnRQcmVwcm9jZXNzb3IpXG4gICAgfVxuICAgIGlmIChjb25maWd1cmF0aW9uLmFkYXB0ZXJQcmVwcm9jZXNzb3IgIT0gbnVsbCkge1xuICAgICAgYWRhcHRlclByZXByb2Nlc3NvcnMucHVzaChjb25maWd1cmF0aW9uLmFkYXB0ZXJQcmVwcm9jZXNzb3IpXG4gICAgfVxuICAgIGNvbnN0IGlzUmVtb3RlID0gbnVjbGlkZVVyaS5pc1JlbW90ZSh0YXJnZXRVcmkpXG4gICAgaWYgKGlzUmVtb3RlKSB7XG4gICAgICBjbGllbnRQcmVwcm9jZXNzb3JzLnB1c2gocmVtb3RlVG9Mb2NhbFByb2Nlc3NvcigpKVxuICAgICAgYWRhcHRlclByZXByb2Nlc3NvcnMucHVzaChsb2NhbFRvUmVtb3RlUHJvY2Vzc29yKHRhcmdldFVyaSkpXG4gICAgfVxuICAgIHJldHVybiBuZXcgVnNEZWJ1Z1Nlc3Npb24oXG4gICAgICBzZXNzaW9uSWQsXG4gICAgICBsb2dnZXIsXG4gICAgICBhZGFwdGVyRXhlY3V0YWJsZSxcbiAgICAgIHsgYWRhcHRlcjogY29uZmlndXJhdGlvbi5hZGFwdGVyVHlwZSwgaG9zdDogXCJkZWJ1Z1NlcnZpY2VcIiwgaXNSZW1vdGUgfSxcbiAgICAgIHNwYXduZXIsXG4gICAgICBjbGllbnRQcmVwcm9jZXNzb3JzLFxuICAgICAgYWRhcHRlclByZXByb2Nlc3NvcnMsXG4gICAgICB0aGlzLl9ydW5JblRlcm1pbmFsLFxuICAgICAgQm9vbGVhbihjb25maWd1cmF0aW9uLmlzUmVhZE9ubHkpXG4gICAgKVxuICB9XG5cbiAgYXN5bmMgX2xhdW5jaE9yQXR0YWNoVGFyZ2V0KHNlc3Npb246IFZzRGVidWdTZXNzaW9uLCBjb25maWd1cmF0aW9uOiBJUHJvY2Vzc0NvbmZpZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmIChjb25maWd1cmF0aW9uLmRlYnVnTW9kZSA9PT0gXCJhdHRhY2hcIikge1xuICAgICAgYXdhaXQgc2Vzc2lvbi5hdHRhY2goY29uZmlndXJhdGlvbi5jb25maWcpXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEl0J3MgJ2xhdW5jaCdcbiAgICAgIGF3YWl0IHNlc3Npb24ubGF1bmNoKGNvbmZpZ3VyYXRpb24uY29uZmlnKVxuICAgIH1cbiAgfVxuXG4gIF9zb3VyY2VJc05vdEF2YWlsYWJsZSh1cmk6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMuX21vZGVsLnNvdXJjZUlzTm90QXZhaWxhYmxlKHVyaSlcbiAgfVxuXG4gIF9ydW5JblRlcm1pbmFsID0gYXN5bmMgKGFyZ3M6IERlYnVnUHJvdG9jb2wuUnVuSW5UZXJtaW5hbFJlcXVlc3RBcmd1bWVudHMpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgICBjb25zdCB0ZXJtaW5hbFNlcnZpY2UgPSBnZXRUZXJtaW5hbFNlcnZpY2UoKVxuICAgIGlmICh0ZXJtaW5hbFNlcnZpY2UgPT0gbnVsbCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVW5hYmxlIHRvIGxhdW5jaCBpbiB0ZXJtaW5hbCBzaW5jZSB0aGUgc2VydmljZSBpcyBub3QgYXZhaWxhYmxlXCIpXG4gICAgfVxuICAgIGNvbnN0IHByb2Nlc3MgPSB0aGlzLl9nZXRDdXJyZW50UHJvY2VzcygpXG4gICAgaWYgKHByb2Nlc3MgPT0gbnVsbCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVGhlcmUncyBubyBkZWJ1ZyBwcm9jZXNzIHRvIGNyZWF0ZSBhIHRlcm1pbmFsIGZvciFcIilcbiAgICB9XG4gICAgY29uc3QgeyBhZGFwdGVyVHlwZSwgdGFyZ2V0VXJpIH0gPSBwcm9jZXNzLmNvbmZpZ3VyYXRpb25cbiAgICBjb25zdCBrZXkgPSBgdGFyZ2V0VXJpPSR7dGFyZ2V0VXJpfSZjb21tYW5kPSR7YXJncy5hcmdzWzBdfWBcblxuICAgIC8vIEVuc3VyZSBhbnkgcHJldmlvdXMgaW5zdGFuY2VzIG9mIHRoaXMgc2FtZSB0YXJnZXQgYXJlIGNsb3NlZCBiZWZvcmVcbiAgICAvLyBvcGVuaW5nIGEgbmV3IHRlcm1pbmFsIHRhYi4gV2UgZG9uJ3Qgd2FudCB0aGVtIHRvIHBpbGUgdXAgaWYgdGhlXG4gICAgLy8gdXNlciBrZWVwcyBydW5uaW5nIHRoZSBzYW1lIGFwcCBvdmVyIGFuZCBvdmVyLlxuICAgIHRlcm1pbmFsU2VydmljZS5jbG9zZShrZXkpXG5cbiAgICBjb25zdCB0aXRsZSA9IGFyZ3MudGl0bGUgIT0gbnVsbCA/IGFyZ3MudGl0bGUgOiBnZXREZWJ1Z2dlck5hbWUoYWRhcHRlclR5cGUpXG4gICAgY29uc3QgaG9zdG5hbWUgPSBudWNsaWRlVXJpLmdldEhvc3RuYW1lT3B0KHRhcmdldFVyaSlcbiAgICBjb25zdCBjd2QgPSBob3N0bmFtZSA9PSBudWxsID8gYXJncy5jd2QgOiBudWNsaWRlVXJpLmNyZWF0ZVJlbW90ZVVyaShob3N0bmFtZSwgYXJncy5jd2QpXG5cbiAgICBjb25zdCBpbmZvOiBUZXJtaW5hbEluZm8gPSB7XG4gICAgICBrZXksXG4gICAgICB0aXRsZSxcbiAgICAgIGN3ZCxcbiAgICAgIGNvbW1hbmQ6IHtcbiAgICAgICAgZmlsZTogYXJncy5hcmdzWzBdLFxuICAgICAgICBhcmdzOiBhcmdzLmFyZ3Muc2xpY2UoMSksXG4gICAgICB9LFxuICAgICAgZW52aXJvbm1lbnRWYXJpYWJsZXM6IGFyZ3MuZW52ICE9IG51bGwgPyBtYXBGcm9tT2JqZWN0KGFyZ3MuZW52KSA6IHVuZGVmaW5lZCxcbiAgICAgIHByZXNlcnZlZENvbW1hbmRzOiBbXG4gICAgICAgIFwiZGVidWdnZXI6Y29udGludWUtZGVidWdnaW5nXCIsXG4gICAgICAgIFwiZGVidWdnZXI6c3RvcC1kZWJ1Z2dpbmdcIixcbiAgICAgICAgXCJkZWJ1Z2dlcjpyZXN0YXJ0LWRlYnVnZ2luZ1wiLFxuICAgICAgICBcImRlYnVnZ2VyOnN0ZXAtb3ZlclwiLFxuICAgICAgICBcImRlYnVnZ2VyOnN0ZXAtaW50b1wiLFxuICAgICAgICBcImRlYnVnZ2VyOnN0ZXAtb3V0XCIsXG4gICAgICBdLFxuICAgICAgcmVtYWluT25DbGVhbkV4aXQ6IHRydWUsXG4gICAgICBpY29uOiBcIm51Y2xpY29uLWRlYnVnZ2VyXCIsXG4gICAgICBkZWZhdWx0TG9jYXRpb246IFwiYm90dG9tXCIsXG4gICAgfVxuICAgIGNvbnN0IHRlcm1pbmFsOiBUZXJtaW5hbEluc3RhbmNlID0gYXdhaXQgdGVybWluYWxTZXJ2aWNlLm9wZW4oaW5mbylcblxuICAgIHRlcm1pbmFsLnNldFByb2Nlc3NFeGl0Q2FsbGJhY2soKCkgPT4ge1xuICAgICAgLy8gVGhpcyBjYWxsYmFjayBpcyBpbnZva2VkIGlmIHRoZSB0YXJnZXQgcHJvY2VzcyBkaWVzIGZpcnN0LCBlbnN1cmluZ1xuICAgICAgLy8gd2UgdGVhciBkb3duIHRoZSBkZWJ1Z2dlci5cbiAgICAgIHRoaXMuc3RvcFByb2Nlc3MocHJvY2VzcylcbiAgICB9KVxuXG4gICAgdGhpcy5fc2Vzc2lvbkVuZERpc3Bvc2FibGVzLmFkZCgoKSA9PiB7XG4gICAgICAvLyBUaGlzIHRlcm1pbmF0aW9uIHBhdGggaXMgaW52b2tlZCBpZiB0aGUgZGVidWdnZXIgZGllcyBmaXJzdCwgZW5zdXJpbmdcbiAgICAgIC8vIHdlIHRlcm1pbmF0ZSB0aGUgdGFyZ2V0IHByb2Nlc3MuIFRoaXMgY2FuIGhhcHBlbiBpZiB0aGUgdXNlciBoaXRzIHN0b3AsXG4gICAgICAvLyBvciBpZiB0aGUgZGVidWdnZXIgY3Jhc2hlcy5cbiAgICAgIHRlcm1pbmFsLnNldFByb2Nlc3NFeGl0Q2FsbGJhY2soKCkgPT4ge30pXG4gICAgICB0ZXJtaW5hbC50ZXJtaW5hdGVQcm9jZXNzKClcbiAgICB9KVxuXG4gICAgY29uc3Qgc3Bhd24gPSBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKChjYikgPT4gdGVybWluYWwub25TcGF3bihjYikpXG4gICAgcmV0dXJuIHNwYXduLnRha2UoMSkudG9Qcm9taXNlKClcbiAgfVxuXG4gIGNhblJlc3RhcnRQcm9jZXNzKCk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHByb2Nlc3MgPSB0aGlzLl9nZXRDdXJyZW50UHJvY2VzcygpXG4gICAgcmV0dXJuIHByb2Nlc3MgIT0gbnVsbCAmJiBwcm9jZXNzLmNvbmZpZ3VyYXRpb24uaXNSZXN0YXJ0YWJsZSA9PT0gdHJ1ZVxuICB9XG5cbiAgYXN5bmMgcmVzdGFydFByb2Nlc3MocHJvY2VzczogSVByb2Nlc3MpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAocHJvY2Vzcy5zZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c1Jlc3RhcnRSZXF1ZXN0KSB7XG4gICAgICBhd2FpdCBwcm9jZXNzLnNlc3Npb24uY3VzdG9tKFwicmVzdGFydFwiLCBudWxsKVxuICAgIH1cbiAgICBhd2FpdCBwcm9jZXNzLnNlc3Npb24uZGlzY29ubmVjdCh0cnVlKVxuICAgIGF3YWl0IHNsZWVwKDMwMClcbiAgICBhd2FpdCB0aGlzLnN0YXJ0RGVidWdnaW5nKHByb2Nlc3MuY29uZmlndXJhdGlvbilcbiAgfVxuXG4gIC8qKlxuICAgKiBTdGFydHMgZGVidWdnaW5nLiBJZiB0aGUgY29uZmlnT3JOYW1lIGlzIG5vdCBwYXNzZWQgdXNlcyB0aGUgc2VsZWN0ZWQgY29uZmlndXJhdGlvbiBpbiB0aGUgZGVidWcgZHJvcGRvd24uXG4gICAqIEFsc28gc2F2ZXMgYWxsIGZpbGVzLCBtYW5hZ2VzIGlmIGNvbXBvdW5kcyBhcmUgcHJlc2VudCBpbiB0aGUgY29uZmlndXJhdGlvblxuICAgKiBhbmQgcmVzb2x2ZWRzIGNvbmZpZ3VyYXRpb25zIHZpYSBEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcnMuXG4gICAqL1xuICBhc3luYyBzdGFydERlYnVnZ2luZyhjb25maWc6IElQcm9jZXNzQ29uZmlnKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy5fdGltZXIgPSBzdGFydFRyYWNraW5nKFwiZGVidWdnZXItYXRvbTpzdGFydERlYnVnZ2luZ1wiKVxuXG4gICAgLy8gT3BlbiB0aGUgY29uc29sZSB3aW5kb3cgaWYgaXQncyBub3QgYWxyZWFkeSBvcGVuZWQuXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG51Y2xpZGUtaW50ZXJuYWwvYXRvbS1hcGlzXG4gICAgYXRvbS53b3Jrc3BhY2Uub3BlbihDT05TT0xFX1ZJRVdfVVJJLCB7IHNlYXJjaEFsbFBhbmVzOiB0cnVlIH0pXG5cbiAgICBhd2FpdCB0aGlzLl9kb0NyZWF0ZVByb2Nlc3MoY29uZmlnLCB1dWlkLnY0KCkpXG5cbiAgICBpZiAodGhpcy5fbW9kZWwuZ2V0UHJvY2Vzc2VzKCkubGVuZ3RoID4gMSkge1xuICAgICAgY29uc3QgZGVidWdnZXJUeXBlcyA9IHRoaXMuX21vZGVsXG4gICAgICAgIC5nZXRQcm9jZXNzZXMoKVxuICAgICAgICAubWFwKCh7IGNvbmZpZ3VyYXRpb24gfSkgPT4gYCR7Y29uZmlndXJhdGlvbi5hZGFwdGVyVHlwZX06ICR7Y29uZmlndXJhdGlvbi5wcm9jZXNzTmFtZSB8fCBcIlwifWApXG4gICAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfTVVMVElUQVJHRVQsIHtcbiAgICAgICAgcHJvY2Vzc2VzQ291bnQ6IHRoaXMuX21vZGVsLmdldFByb2Nlc3NlcygpLmxlbmd0aCxcbiAgICAgICAgZGVidWdnZXJUeXBlcyxcbiAgICAgIH0pXG4gICAgfVxuICB9XG5cbiAgX29uU2Vzc2lvbkVuZCA9IGFzeW5jIChzZXNzaW9uOiBWc0RlYnVnU2Vzc2lvbik6IFByb21pc2U8dm9pZD4gPT4ge1xuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9TVE9QKVxuICAgIGNvbnN0IHJlbW92ZWRQcm9jZXNzZXMgPSB0aGlzLl9tb2RlbC5yZW1vdmVQcm9jZXNzKHNlc3Npb24uZ2V0SWQoKSlcbiAgICBpZiAocmVtb3ZlZFByb2Nlc3Nlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIC8vIElmIHRoZSBwcm9jZXNzIGlzIGFscmVhZHkgcmVtb3ZlZCBmcm9tIHRoZSBtb2RlbCwgdGhlcmUncyBub3RoaW5nIGVsc2VcbiAgICAgIC8vIHRvIGRvLiBXZSBjYW4gcmUtZW50ZXIgaGVyZSBpZiB0aGUgZGVidWcgc2Vzc2lvbiBlbmRzIGJlZm9yZSB0aGVcbiAgICAgIC8vIGRlYnVnIGFkYXB0ZXIgcHJvY2VzcyB0ZXJtaW5hdGVzLlxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgLy8gTWFyayBhbGwgcmVtb3ZlZCBwcm9jZXNzZXMgYXMgU1RPUFBJTkcuXG4gICAgcmVtb3ZlZFByb2Nlc3Nlcy5mb3JFYWNoKChwcm9jZXNzKSA9PiB7XG4gICAgICBwcm9jZXNzLnNldFN0b3BQZW5kaW5nKClcbiAgICAgIHRoaXMuX29uRGVidWdnZXJNb2RlQ2hhbmdlZChwcm9jZXNzLCBEZWJ1Z2dlck1vZGUuU1RPUFBJTkcpXG4gICAgfSlcblxuICAgIC8vIEVuc3VyZSBhbGwgdGhlIGFkYXB0ZXJzIGFyZSB0ZXJtaW5hdGVkLlxuICAgIGF3YWl0IHNlc3Npb24uZGlzY29ubmVjdChmYWxzZSAvKiByZXN0YXJ0ICovLCB0cnVlIC8qIGZvcmNlICovKVxuXG4gICAgaWYgKHRoaXMuX21vZGVsLmdldFByb2Nlc3NlcygpID09IG51bGwgfHwgdGhpcy5fbW9kZWwuZ2V0UHJvY2Vzc2VzKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICB0aGlzLl9zZXNzaW9uRW5kRGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gICAgICB0aGlzLl9jb25zb2xlRGlzcG9zYWJsZXMuZGlzcG9zZSgpXG5cbiAgICAgIC8vIE5vIHByb2Nlc3NlcyByZW1haW5pbmcsIGNsZWFyIHByb2Nlc3MgZm9jdXMuXG4gICAgICB0aGlzLl92aWV3TW9kZWwuc2V0Rm9jdXNlZFByb2Nlc3MobnVsbCwgZmFsc2UpXG4gICAgfSBlbHNlIHtcbiAgICAgIGlmICh0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3MgIT0gbnVsbCAmJiB0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3MuZ2V0SWQoKSA9PT0gc2Vzc2lvbi5nZXRJZCgpKSB7XG4gICAgICAgIC8vIFRoZSBwcm9jZXNzIHRoYXQganVzdCBleGl0ZWQgd2FzIHRoZSBmb2N1c2VkIHByb2Nlc3MsIHNvIHdlIG5lZWRcbiAgICAgICAgLy8gdG8gbW92ZSBmb2N1cyB0byBhbm90aGVyIHByb2Nlc3MuIElmIHRoZXJlJ3MgYSBwcm9jZXNzIHdpdGggYVxuICAgICAgICAvLyBzdG9wcGVkIHRocmVhZCwgY2hvb3NlIHRoYXQuIE90aGVyd2lzZSBjaG9vc2UgdGhlIGxhc3QgcHJvY2Vzcy5cbiAgICAgICAgY29uc3QgYWxsUHJvY2Vzc2VzID0gdGhpcy5fbW9kZWwuZ2V0UHJvY2Vzc2VzKClcbiAgICAgICAgY29uc3QgcHJvY2Vzc1RvRm9jdXMgPVxuICAgICAgICAgIGFsbFByb2Nlc3Nlcy5maWx0ZXIoKHApID0+IHAuZ2V0QWxsVGhyZWFkcygpLnNvbWUoKHQpID0+IHQuc3RvcHBlZCkpWzBdIHx8XG4gICAgICAgICAgYWxsUHJvY2Vzc2VzW2FsbFByb2Nlc3Nlcy5sZW5ndGggLSAxXVxuICAgICAgICB0aGlzLl92aWV3TW9kZWwuc2V0Rm9jdXNlZFByb2Nlc3MocHJvY2Vzc1RvRm9jdXMsIGZhbHNlKVxuICAgICAgfVxuICAgIH1cblxuICAgIHJlbW92ZWRQcm9jZXNzZXMuZm9yRWFjaCgocHJvY2VzcykgPT4ge1xuICAgICAgdGhpcy5fb25EZWJ1Z2dlck1vZGVDaGFuZ2VkKHByb2Nlc3MsIERlYnVnZ2VyTW9kZS5TVE9QUEVEKVxuICAgIH0pXG5cbiAgICBjb25zdCBjcmVhdGVDb25zb2xlID0gZ2V0Q29uc29sZVNlcnZpY2UoKVxuICAgIGlmIChjcmVhdGVDb25zb2xlICE9IG51bGwpIHtcbiAgICAgIGNvbnN0IG5hbWUgPSBcIk51Y2xpZGUgRGVidWdnZXJcIlxuICAgICAgY29uc3QgY29uc29sZUFwaSA9IGNyZWF0ZUNvbnNvbGUoe1xuICAgICAgICBpZDogbmFtZSxcbiAgICAgICAgbmFtZSxcbiAgICAgIH0pXG5cbiAgICAgIHJlbW92ZWRQcm9jZXNzZXMuZm9yRWFjaCgocCkgPT5cbiAgICAgICAgY29uc29sZUFwaS5hcHBlbmQoe1xuICAgICAgICAgIHRleHQ6XG4gICAgICAgICAgICBcIlByb2Nlc3MgZXhpdGVkXCIgKyAocC5jb25maWd1cmF0aW9uLnByb2Nlc3NOYW1lID09IG51bGwgPyBcIlwiIDogXCIgKFwiICsgcC5jb25maWd1cmF0aW9uLnByb2Nlc3NOYW1lICsgXCIpXCIpLFxuICAgICAgICAgIGxldmVsOiBcImxvZ1wiLFxuICAgICAgICB9KVxuICAgICAgKVxuICAgIH1cblxuICAgIGlmICh0aGlzLl90aW1lciAhPSBudWxsKSB7XG4gICAgICB0aGlzLl90aW1lci5vblN1Y2Nlc3MoKVxuICAgICAgdGhpcy5fdGltZXIgPSBudWxsXG4gICAgfVxuICB9XG5cbiAgZ2V0TW9kZWwoKTogSU1vZGVsIHtcbiAgICByZXR1cm4gdGhpcy5fbW9kZWxcbiAgfVxuXG4gIGFzeW5jIF9zZW5kQWxsQnJlYWtwb2ludHMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICBkaXN0aW5jdCh0aGlzLl9tb2RlbC5nZXRCcmVha3BvaW50cygpLCAoYnApID0+IGJwLnVyaSkubWFwKChicCkgPT4gdGhpcy5fc2VuZEJyZWFrcG9pbnRzKGJwLnVyaSwgZmFsc2UpKVxuICAgIClcbiAgICBhd2FpdCB0aGlzLl9zZW5kRnVuY3Rpb25CcmVha3BvaW50cygpXG4gICAgLy8gc2VuZCBleGNlcHRpb24gYnJlYWtwb2ludHMgYXQgdGhlIGVuZCBzaW5jZSBzb21lIGRlYnVnIGFkYXB0ZXJzIHJlbHkgb24gdGhlIG9yZGVyXG4gICAgYXdhaXQgdGhpcy5fc2VuZEV4Y2VwdGlvbkJyZWFrcG9pbnRzKClcbiAgfVxuXG4gIGFzeW5jIF9zZW5kQnJlYWtwb2ludHModXJpOiBzdHJpbmcsIHNvdXJjZU1vZGlmaWVkPzogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcHJvY2VzcyA9IHRoaXMuX2dldEN1cnJlbnRQcm9jZXNzKClcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5fZ2V0Q3VycmVudFNlc3Npb24oKVxuICAgIGlmIChwcm9jZXNzID09IG51bGwgfHwgc2Vzc2lvbiA9PSBudWxsIHx8ICFzZXNzaW9uLmlzUmVhZHlGb3JCcmVha3BvaW50cygpKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCBicmVha3BvaW50c1RvU2VuZCA9ICgoc291cmNlTW9kaWZpZWQgPyB0aGlzLl9tb2RlbC5nZXRVSUJyZWFrcG9pbnRzKCkgOiB0aGlzLl9tb2RlbC5nZXRCcmVha3BvaW50cygpKS5maWx0ZXIoXG4gICAgICAoYnApID0+IHRoaXMuX21vZGVsLmFyZUJyZWFrcG9pbnRzQWN0aXZhdGVkKCkgJiYgYnAuZW5hYmxlZCAmJiBicC51cmkgPT09IHVyaVxuICAgICk6IGFueSlcblxuICAgIGNvbnN0IHJhd1NvdXJjZSA9IHByb2Nlc3MuZ2V0U291cmNlKHtcbiAgICAgIHBhdGg6IHVyaSxcbiAgICAgIG5hbWU6IG51Y2xpZGVVcmkuYmFzZW5hbWUodXJpKSxcbiAgICB9KS5yYXdcblxuICAgIGlmICghc291cmNlTW9kaWZpZWQgJiYgYnJlYWtwb2ludHNUb1NlbmQubGVuZ3RoID4gMCAmJiAhcmF3U291cmNlLmFkYXB0ZXJEYXRhICYmIGJyZWFrcG9pbnRzVG9TZW5kWzBdLmFkYXB0ZXJEYXRhKSB7XG4gICAgICByYXdTb3VyY2UuYWRhcHRlckRhdGEgPSBicmVha3BvaW50c1RvU2VuZFswXS5hZGFwdGVyRGF0YVxuICAgIH1cblxuICAgIC8vIFRoZSBVSSBpcyAwLWJhc2VkLCB3aGlsZSBWU1AgaXMgMS1iYXNlZC5cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHNlc3Npb24uc2V0QnJlYWtwb2ludHMoe1xuICAgICAgc291cmNlOiAocmF3U291cmNlOiBhbnkpLFxuICAgICAgbGluZXM6IGJyZWFrcG9pbnRzVG9TZW5kLm1hcCgoYnApID0+IGJwLmxpbmUpLFxuICAgICAgYnJlYWtwb2ludHM6IGJyZWFrcG9pbnRzVG9TZW5kLm1hcCgoYnApID0+IHtcbiAgICAgICAgY29uc3QgYnBUb1NlbmQ6IE9iamVjdCA9IHtcbiAgICAgICAgICBsaW5lOiBicC5saW5lLFxuICAgICAgICB9XG4gICAgICAgIC8vIENvbHVtbiBhbmQgY29uZGl0aW9uIGFyZSBvcHRpb25hbCBpbiB0aGUgcHJvdG9jb2wsIGJ1dCBzaG91bGRcbiAgICAgICAgLy8gb25seSBiZSBpbmNsdWRlZCBvbiB0aGUgb2JqZWN0IHNlbnQgdG8gdGhlIGRlYnVnIGFkYXB0ZXIgaWZcbiAgICAgICAgLy8gdGhleSBoYXZlIHZhbHVlcyB0aGF0IGV4aXN0LlxuICAgICAgICBpZiAoYnAuY29sdW1uICE9IG51bGwgJiYgYnAuY29sdW1uID4gMCkge1xuICAgICAgICAgIGJwVG9TZW5kLmNvbHVtbiA9IGJwLmNvbHVtblxuICAgICAgICB9XG4gICAgICAgIGlmIChicC5jb25kaXRpb24gIT0gbnVsbCAmJiBicC5jb25kaXRpb24gIT09IFwiXCIpIHtcbiAgICAgICAgICBicFRvU2VuZC5jb25kaXRpb24gPSBicC5jb25kaXRpb25cbiAgICAgICAgfVxuICAgICAgICBpZiAoYnAubG9nTWVzc2FnZSAhPSBudWxsICYmIGJwLmxvZ01lc3NhZ2UgIT09IFwiXCIpIHtcbiAgICAgICAgICBicFRvU2VuZC5sb2dNZXNzYWdlID0gYnAubG9nTWVzc2FnZVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBicFRvU2VuZFxuICAgICAgfSksXG4gICAgICBzb3VyY2VNb2RpZmllZCxcbiAgICB9KVxuICAgIGlmIChyZXNwb25zZSA9PSBudWxsIHx8IHJlc3BvbnNlLmJvZHkgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgZGF0YTogeyBbaWQ6IHN0cmluZ106IERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludCB9ID0ge31cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGJyZWFrcG9pbnRzVG9TZW5kLmxlbmd0aDsgaSsrKSB7XG4gICAgICAvLyBJZiBzb3VyY2VNb2RpZmllZCA9PT0gdHJ1ZSwgd2UncmUgZGVhbGluZyB3aXRoIG5ldyBVSSBicmVha3BvaW50cyB0aGF0XG4gICAgICAvLyByZXByZXNlbnQgdGhlIG5ldyBsb2NhdGlvbihzKSB0aGUgYnJlYWtwb2ludHMgZW5kZWQgdXAgaW4gZHVlIHRvIHRoZVxuICAgICAgLy8gZmlsZSBjb250ZW50cyBjaGFuZ2luZy4gVGhlc2UgYXJlIG9mIHR5cGUgSVVJQnJlYWtwb2ludC4gIE90aGVyd2lzZSxcbiAgICAgIC8vIHdlIGhhdmUgcHJvY2VzcyBicmVha3BvaW50cyBvZiB0eXBlIElCcmVha3BvaW50IGhlcmUuIFRoZXNlIHR5cGVzIGJvdGggaGF2ZVxuICAgICAgLy8gYW4gSUQsIGJ1dCB3ZSBnZXQgaXQgYSBsaXR0bGUgZGlmZmVyZW50bHkuXG4gICAgICBjb25zdCBicElkID0gc291cmNlTW9kaWZpZWQgPyBicmVha3BvaW50c1RvU2VuZFtpXS5pZCA6IGJyZWFrcG9pbnRzVG9TZW5kW2ldLmdldElkKClcblxuICAgICAgZGF0YVticElkXSA9IHJlc3BvbnNlLmJvZHkuYnJlYWtwb2ludHNbaV1cbiAgICAgIGlmICghYnJlYWtwb2ludHNUb1NlbmRbaV0uY29sdW1uKSB7XG4gICAgICAgIC8vIElmIHRoZXJlIHdhcyBubyBjb2x1bW4gc2VudCBpZ25vcmUgdGhlIGJyZWFrcG9pbnQgY29sdW1uIHJlc3BvbnNlIGZyb20gdGhlIGFkYXB0ZXJcbiAgICAgICAgZGF0YVticElkXS5jb2x1bW4gPSB1bmRlZmluZWRcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLl9tb2RlbC51cGRhdGVQcm9jZXNzQnJlYWtwb2ludHMocHJvY2VzcywgZGF0YSlcbiAgfVxuXG4gIF9nZXRDdXJyZW50U2Vzc2lvbigpOiA/VnNEZWJ1Z1Nlc3Npb24ge1xuICAgIHJldHVybiB0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3MgPT0gbnVsbCA/IG51bGwgOiAodGhpcy5fdmlld01vZGVsLmZvY3VzZWRQcm9jZXNzLnNlc3Npb246IGFueSlcbiAgfVxuXG4gIF9nZXRDdXJyZW50UHJvY2VzcygpOiA/SVByb2Nlc3Mge1xuICAgIHJldHVybiB0aGlzLl92aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3NcbiAgfVxuXG4gIGFzeW5jIF9zZW5kRnVuY3Rpb25CcmVha3BvaW50cygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5fZ2V0Q3VycmVudFNlc3Npb24oKVxuICAgIGlmIChzZXNzaW9uID09IG51bGwgfHwgIXNlc3Npb24uaXNSZWFkeUZvckJyZWFrcG9pbnRzKCkgfHwgIXNlc3Npb24uZ2V0Q2FwYWJpbGl0aWVzKCkuc3VwcG9ydHNGdW5jdGlvbkJyZWFrcG9pbnRzKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCBicmVha3BvaW50c1RvU2VuZDogYW55ID0gdGhpcy5fbW9kZWxcbiAgICAgIC5nZXRGdW5jdGlvbkJyZWFrcG9pbnRzKClcbiAgICAgIC5maWx0ZXIoKGZicCkgPT4gZmJwLmVuYWJsZWQgJiYgdGhpcy5fbW9kZWwuYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQoKSlcbiAgICBjb25zdCByZXNwb25zZTogRGVidWdQcm90b2NvbC5TZXRGdW5jdGlvbkJyZWFrcG9pbnRzUmVzcG9uc2UgPSBhd2FpdCBzZXNzaW9uLnNldEZ1bmN0aW9uQnJlYWtwb2ludHMoe1xuICAgICAgYnJlYWtwb2ludHM6IGJyZWFrcG9pbnRzVG9TZW5kLFxuICAgIH0pXG4gICAgaWYgKHJlc3BvbnNlID09IG51bGwgfHwgcmVzcG9uc2UuYm9keSA9PSBudWxsKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCBkYXRhID0ge31cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGJyZWFrcG9pbnRzVG9TZW5kLmxlbmd0aDsgaSsrKSB7XG4gICAgICBkYXRhW2JyZWFrcG9pbnRzVG9TZW5kW2ldLmdldElkKCldID0gcmVzcG9uc2UuYm9keS5icmVha3BvaW50c1tpXVxuICAgIH1cblxuICAgIHRoaXMuX21vZGVsLnVwZGF0ZUZ1bmN0aW9uQnJlYWtwb2ludHMoZGF0YSlcbiAgfVxuXG4gIGFzeW5jIF9zZW5kRXhjZXB0aW9uQnJlYWtwb2ludHMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2dldEN1cnJlbnRTZXNzaW9uKClcbiAgICBpZiAoc2Vzc2lvbiA9PSBudWxsIHx8ICFzZXNzaW9uLmlzUmVhZHlGb3JCcmVha3BvaW50cygpIHx8IHRoaXMuX21vZGVsLmdldEV4Y2VwdGlvbkJyZWFrcG9pbnRzKCkubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCBlbmFibGVkRXhjZXB0aW9uQnBzID0gdGhpcy5fbW9kZWwuZ2V0RXhjZXB0aW9uQnJlYWtwb2ludHMoKS5maWx0ZXIoKGV4YikgPT4gZXhiLmVuYWJsZWQpXG4gICAgYXdhaXQgc2Vzc2lvbi5zZXRFeGNlcHRpb25CcmVha3BvaW50cyh7XG4gICAgICBmaWx0ZXJzOiBlbmFibGVkRXhjZXB0aW9uQnBzLm1hcCgoZXhiKSA9PiBleGIuZmlsdGVyKSxcbiAgICB9KVxuICB9XG5cbiAgX2V2YWx1YXRlRXhwcmVzc2lvbihleHByZXNzaW9uOiBJRXZhbHVhdGFibGVFeHByZXNzaW9uLCBsZXZlbDogTGV2ZWwpIHtcbiAgICBjb25zdCB7IGZvY3VzZWRQcm9jZXNzLCBmb2N1c2VkU3RhY2tGcmFtZSB9ID0gdGhpcy5fdmlld01vZGVsXG4gICAgaWYgKGZvY3VzZWRQcm9jZXNzID09IG51bGwpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihcIkNhbm5vdCBldmFsdWF0ZSB3aGlsZSB0aGVyZSBpcyBubyBhY3RpdmUgZGVidWcgc2Vzc2lvblwiKVxuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9XG4gICAgICAvLyBXZSBmaWx0ZXIgaGVyZSBiZWNhdXNlIHRoZSBmaXJzdCB2YWx1ZSBpbiB0aGUgQmVoYXZpb3JTdWJqZWN0IGlzIG51bGwgbm8gbWF0dGVyIHdoYXQsIGFuZFxuICAgICAgLy8gd2Ugd2FudCB0aGUgY29uc29sZSB0byB1bnN1YnNjcmliZSB0aGUgc3RyZWFtIGFmdGVyIHRoZSBmaXJzdCBub24tbnVsbCB2YWx1ZS5cbiAgICAgIGV2YWx1YXRlRXhwcmVzc2lvbkFzU3RyZWFtKGV4cHJlc3Npb24sIGZvY3VzZWRQcm9jZXNzLCBmb2N1c2VkU3RhY2tGcmFtZSwgXCJyZXBsXCIpXG4gICAgICAgIC5za2lwKDEpIC8vIFNraXAgdGhlIGZpcnN0IHBlbmRpbmcgdmFsdWUuXG4gICAgICAgIC5zdWJzY3JpYmUoKHJlc3VsdCkgPT4ge1xuICAgICAgICAgIC8vIEV2YWx1YXRlIGFsbCB3YXRjaCBleHByZXNzaW9ucyBhbmQgZmV0Y2ggdmFyaWFibGVzIGFnYWluIHNpbmNlIHJlcGwgZXZhbHVhdGlvbiBtaWdodCBoYXZlIGNoYW5nZWQgc29tZS5cbiAgICAgICAgICB0aGlzLl92aWV3TW9kZWwuc2V0Rm9jdXNlZFN0YWNrRnJhbWUodGhpcy5fdmlld01vZGVsLmZvY3VzZWRTdGFja0ZyYW1lLCBmYWxzZSlcblxuICAgICAgICAgIGlmIChyZXN1bHQuaXNFcnJvciB8fCByZXN1bHQuaXNQZW5kaW5nIHx8ICFleHByZXNzaW9uLmF2YWlsYWJsZSkge1xuICAgICAgICAgICAgY29uc3QgbWVzc2FnZTogQ29uc29sZU1lc3NhZ2UgPSB7XG4gICAgICAgICAgICAgIHRleHQ6IGV4cHJlc3Npb24uZ2V0VmFsdWUoKSxcbiAgICAgICAgICAgICAgbGV2ZWw6IFwiZXJyb3JcIixcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuX2NvbnNvbGVPdXRwdXQubmV4dChtZXNzYWdlKVxuICAgICAgICAgIH0gZWxzZSBpZiAoZXhwcmVzc2lvbi5oYXNDaGlsZHJlbigpKSB7XG4gICAgICAgICAgICB0aGlzLl9jb25zb2xlT3V0cHV0Lm5leHQoe1xuICAgICAgICAgICAgICB0ZXh0OiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgICBleHByZXNzaW9uczogW2V4cHJlc3Npb25dLFxuICAgICAgICAgICAgICBsZXZlbCxcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX2NvbnNvbGVPdXRwdXQubmV4dCh7XG4gICAgICAgICAgICAgIHRleHQ6IGV4cHJlc3Npb24uZ2V0VmFsdWUoKSxcbiAgICAgICAgICAgICAgbGV2ZWwsXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH1cbiAgICAgICAgICB0aGlzLl9jb25zb2xlRGlzcG9zYWJsZXMucmVtb3ZlKHN1YnNjcmlwdGlvbilcbiAgICAgICAgfSlcbiAgICB0aGlzLl9jb25zb2xlRGlzcG9zYWJsZXMuYWRkKHN1YnNjcmlwdGlvbilcbiAgfVxuXG4gIF9yZWdpc3RlckNvbnNvbGVFeGVjdXRvcigpIHtcbiAgICB0aGlzLl9jb25zb2xlRGlzcG9zYWJsZXMgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSgpXG4gICAgY29uc3QgcmVnaXN0ZXJFeGVjdXRvciA9IGdldENvbnNvbGVSZWdpc3RlckV4ZWN1dG9yKClcbiAgICBpZiAocmVnaXN0ZXJFeGVjdXRvciA9PSBudWxsKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxuICAgIGNvbnN0IFNDT1BFX0NIQU5HRUQgPSBcIlNDT1BFX0NIQU5HRURcIlxuICAgIGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuX3ZpZXdNb2RlbFxuICAgIGNvbnN0IGV2YWx1YXRlRXhwcmVzc2lvbiA9IHRoaXMuX2V2YWx1YXRlRXhwcmVzc2lvbi5iaW5kKHRoaXMpXG4gICAgY29uc3QgZXhlY3V0b3IgPSB7XG4gICAgICBpZDogXCJkZWJ1Z2dlclwiLFxuICAgICAgbmFtZTogXCJEZWJ1Z2dlclwiLFxuICAgICAgc2NvcGVOYW1lOiAoKSA9PiB7XG4gICAgICAgIGlmICh2aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3MgIT0gbnVsbCAmJiB2aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3MuY29uZmlndXJhdGlvbi5ncmFtbWFyTmFtZSAhPSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuIHZpZXdNb2RlbC5mb2N1c2VkUHJvY2Vzcy5jb25maWd1cmF0aW9uLmdyYW1tYXJOYW1lXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFwidGV4dC5wbGFpblwiXG4gICAgICB9LFxuICAgICAgb25EaWRDaGFuZ2VTY29wZU5hbWUoY2FsbGJhY2s6ICgpID0+IG1peGVkKTogSURpc3Bvc2FibGUge1xuICAgICAgICByZXR1cm4gZW1pdHRlci5vbihTQ09QRV9DSEFOR0VELCBjYWxsYmFjaylcbiAgICAgIH0sXG4gICAgICBzZW5kKGV4cHJlc3Npb246IHN0cmluZykge1xuICAgICAgICBldmFsdWF0ZUV4cHJlc3Npb24obmV3IEV4cHJlc3Npb24oZXhwcmVzc2lvbiksIFwibG9nXCIpXG4gICAgICB9LFxuICAgICAgb3V0cHV0OiB0aGlzLl9jb25zb2xlT3V0cHV0LFxuICAgIH1cblxuICAgIHRoaXMuX2NvbnNvbGVEaXNwb3NhYmxlcy5hZGQoXG4gICAgICBlbWl0dGVyLFxuICAgICAgdGhpcy5fdmlld01vZGVsLm9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cygoKSA9PiB7XG4gICAgICAgIGVtaXR0ZXIuZW1pdChTQ09QRV9DSEFOR0VEKVxuICAgICAgfSlcbiAgICApXG4gICAgdGhpcy5fY29uc29sZURpc3Bvc2FibGVzLmFkZChyZWdpc3RlckV4ZWN1dG9yKGV4ZWN1dG9yKSlcbiAgfVxuXG4gIGRpc3Bvc2UoKTogdm9pZCB7XG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gICAgdGhpcy5fY29uc29sZURpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICAgIHRoaXMuX3Nlc3Npb25FbmREaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxufVxuXG5jbGFzcyBEZWJ1Z1NvdXJjZVRleHRCdWZmZmVyIGV4dGVuZHMgVGV4dEJ1ZmZlciB7XG4gIF91cmk6IHN0cmluZ1xuXG4gIGNvbnN0cnVjdG9yKGNvbnRlbnRzOiBzdHJpbmcsIHVyaTogc3RyaW5nKSB7XG4gICAgc3VwZXIoY29udGVudHMpXG4gICAgdGhpcy5fdXJpID0gdXJpXG4gIH1cblxuICBnZXRVcmkoKSB7XG4gICAgcmV0dXJuIHRoaXMuX3VyaVxuICB9XG5cbiAgZ2V0UGF0aCgpIHtcbiAgICByZXR1cm4gdGhpcy5fdXJpXG4gIH1cblxuICBpc01vZGlmaWVkKCkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59XG4iXX0=