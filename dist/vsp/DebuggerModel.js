"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Model = exports.ExceptionBreakpoint = exports.FunctionBreakpoint = exports.Breakpoint = exports.Process = exports.Thread = exports.StackFrame = exports.Scope = exports.Variable = exports.Expression = exports.ExpressionContainer = exports.Source = void 0;

var _nuclideUri = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/nuclideUri"));

var _nuclideDebuggerCommon = require("@atom-ide-community/nuclide-debugger-common");

var DebugProtocol = _interopRequireWildcard(require("vscode-debugprotocol"));

var _rxjs = require("rxjs");

var _uuid = _interopRequireDefault(require("uuid"));

var _nullthrows = _interopRequireDefault(require("nullthrows"));

var _assert = _interopRequireDefault(require("assert"));

var _atom = require("atom");

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var _analytics = require("@atom-ide-community/nuclide-commons/analytics");

var _constants = require("../constants");

var _utils = require("../utils");

var _collection = require("@atom-ide-community/nuclide-commons/collection");

var _expected = require("@atom-ide-community/nuclide-commons/expected");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
The following debug model implementation was ported from VSCode's debugger implementation
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
class Source {
  constructor(raw, sessionId) {
    this.uri = void 0;
    this.available = void 0;
    this._raw = void 0;

    if (raw == null) {
      this._raw = {
        name: _constants.UNKNOWN_SOURCE
      };
    } else {
      this._raw = raw;
    }

    if (this._raw.sourceReference != null && this._raw.sourceReference > 0) {
      const name = this._raw.name != null ? this._raw.name : this._raw.path != null ? _nuclideUri.default.parsePath(this._raw.path).base : _constants.UNKNOWN_SOURCE;
      this.uri = `${_constants.DEBUG_SOURCES_URI}/${sessionId}/${this._raw.sourceReference}/${name}`;
    } else {
      this.uri = this._raw.path || "";
    }

    this.available = this.uri !== "";
  }

  get name() {
    return this._raw.name;
  }

  get origin() {
    return this._raw.origin;
  }

  get presentationHint() {
    return this._raw.presentationHint;
  }

  get raw() {
    return { ...this._raw
    };
  }

  get reference() {
    return this._raw.sourceReference;
  }

  get inMemory() {
    return this.uri.startsWith(_constants.DEBUG_SOURCES_URI);
  }

  openInEditor() {
    // eslint-disable-next-line nuclide-internal/atom-apis
    return atom.workspace.open(this.uri, {
      searchAllPanes: true,
      pending: true
    });
  }

}

exports.Source = Source;

class ExpressionContainer {
  // Use chunks to support variable paging #9537
  constructor(process, reference, id, namedVariables, indexedVariables, startOfVariables) {
    this._value = void 0;
    this._children = void 0;
    this.process = void 0;
    this._reference = void 0;
    this._id = void 0;
    this._namedVariables = void 0;
    this._indexedVariables = void 0;
    this._startOfVariables = void 0;
    this.process = process;
    this._reference = reference;
    this._id = id;
    this._namedVariables = namedVariables || 0;
    this._indexedVariables = indexedVariables || 0;
    this._startOfVariables = startOfVariables || 0;
  }

  get reference() {
    return this._reference;
  }

  set reference(value) {
    this._reference = value;
    this._children = null;
  }

  get hasChildVariables() {
    return this._namedVariables + this._indexedVariables > 0;
  }

  getChildren() {
    if (this._children == null) {
      this._children = this._doGetChildren();
    }

    return this._children;
  }

  async _doGetChildren() {
    if (!this.hasChildren()) {
      return [];
    }

    if (!this.getChildrenInChunks) {
      const variables = await this._fetchVariables();
      return variables;
    } // Check if object has named variables, fetch them independent from indexed variables #9670


    let childrenArray = [];

    if (Boolean(this._namedVariables)) {
      childrenArray = await this._fetchVariables(undefined, undefined, "named");
    } // Use a dynamic chunk size based on the number of elements #9774


    let chunkSize = ExpressionContainer.BASE_CHUNK_SIZE;

    while (this._indexedVariables > chunkSize * ExpressionContainer.BASE_CHUNK_SIZE) {
      chunkSize *= ExpressionContainer.BASE_CHUNK_SIZE;
    }

    if (this._indexedVariables > chunkSize) {
      // There are a lot of children, create fake intermediate values that represent chunks #9537
      const numberOfChunks = Math.ceil(this._indexedVariables / chunkSize);

      for (let i = 0; i < numberOfChunks; i++) {
        const start = this._startOfVariables + i * chunkSize;
        const count = Math.min(chunkSize, this._indexedVariables - i * chunkSize);
        childrenArray.push(new Variable(this.process, this, this.reference, `[${start}..${start + count - 1}]`, "", "", null, count, {
          kind: "virtual"
        }, null, true, start));
      }

      return childrenArray;
    }

    const variables = await this._fetchVariables(this._startOfVariables, this._indexedVariables, "indexed");
    return childrenArray.concat(variables);
  }

  getId() {
    return this._id;
  }

  getValue() {
    return this._value;
  }

  hasChildren() {
    // only variables with reference > 0 have children.
    return this.reference > 0;
  }

  async _fetchVariables(start, count, filter) {
    const process = this.process;
    (0, _assert.default)(process);

    try {
      const response = await process.session.variables({
        variablesReference: this.reference,
        start,
        count,
        filter
      });
      const variables = (0, _collection.distinct)(response.body.variables.filter(v => v != null && v.name), v => v.name);
      return variables.map(v => new Variable(this.process, this, v.variablesReference, v.name, v.evaluateName, v.value, v.namedVariables, v.indexedVariables, v.presentationHint, v.type));
    } catch (e) {
      return [new Variable(this.process, this, 0, null, e.message, "", 0, 0, {
        kind: "virtual"
      }, null, false)];
    }
  } // The adapter explicitly sents the children count of an expression only if there are lots of children which should be chunked.


  get getChildrenInChunks() {
    return Boolean(this._indexedVariables);
  }

  setValue(value) {
    this._value = value;
    ExpressionContainer.allValues.set(this.getId(), value);
  }

  toString() {
    return this._value;
  }

}

exports.ExpressionContainer = ExpressionContainer;
ExpressionContainer.allValues = new Map();
ExpressionContainer.BASE_CHUNK_SIZE = 100;

class Expression extends ExpressionContainer {
  constructor(name, id = _uuid.default.v4()) {
    super(null, 0, id);
    this.available = void 0;
    this._type = void 0;
    this.name = void 0;
    this.name = name;
    this.available = false;
    this._type = null; // name is not set if the expression is just being added
    // in that case do not set default value to prevent flashing #14499

    if (name) {
      this._value = Expression.DEFAULT_VALUE;
    }
  }

  get type() {
    return this._type;
  }

  async evaluate(process, stackFrame, context) {
    if (process == null || stackFrame == null && context !== "repl") {
      this._value = context === "repl" ? "Please start a debug session to evaluate" : Expression.DEFAULT_VALUE;
      this.available = false;
      this.reference = 0;
      return;
    }

    this.process = process;

    try {
      const response = await process.session.evaluate({
        expression: this.name,
        frameId: stackFrame ? stackFrame.frameId : undefined,
        context
      });
      this.available = response != null && response.body != null;

      if (response && response.body) {
        this._value = response.body.result;
        this.reference = response.body.variablesReference || 0;
        this._namedVariables = response.body.namedVariables || 0;
        this._indexedVariables = response.body.indexedVariables || 0;
        this._type = response.body.type;
      }
    } catch (err) {
      this._value = err.message;
      this.available = false;
      this.reference = 0;
    }
  }

  toString() {
    return `${this.name}\n${this._value}`;
  }

}

exports.Expression = Expression;
Expression.DEFAULT_VALUE = "not available";

class Variable extends ExpressionContainer {
  constructor(process, parent, reference, name, evaluateName, value, namedVariables, indexedVariables, presentationHint, type, available = true, _startOfVariables) {
    super(process, reference, // flowlint-next-line sketchy-null-string:off
    `variable:${parent.getId()}:${name || "no_name"}`, namedVariables, indexedVariables, _startOfVariables);
    this.parent = void 0;
    this.name = void 0;
    this.evaluateName = void 0;
    this.presentationHint = void 0;
    this._type = void 0;
    this.available = void 0;
    this.parent = parent;
    this.name = name == null ? "no_name" : name;
    this.evaluateName = evaluateName;
    this.presentationHint = presentationHint;
    this._type = type;
    this.available = available;
    this._value = value;
  }

  get type() {
    return this._type;
  }

  get grammarName() {
    if (this.process == null) {
      return null;
    }

    return this.process.configuration.grammarName;
  }

  async setVariable(value) {
    const process = (0, _nullthrows.default)(this.process);
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_EDIT_VARIABLE, {
      language: process.configuration.adapterType
    });
    const response = await process.session.setVariable({
      name: (0, _nullthrows.default)(this.name),
      value,
      variablesReference: this.parent.reference
    });

    if (response && response.body) {
      this._value = response.body.value;
      this._type = response.body.type == null ? this._type : response.body.type;
      this.reference = response.body.variablesReference || 0;
      this._namedVariables = response.body.namedVariables || 0;
      this._indexedVariables = response.body.indexedVariables || 0;
    }
  }

  canSetVariable() {
    const proc = this.process;

    if (proc == null) {
      return false;
    }

    const supportsSetVariable = Boolean(proc.session.capabilities.supportsSetVariable); // We can't set variables if the target is read only.
    // We also require a variables reference for the parent for the protocol,
    // and currently only set on leaves (variables with no children) because
    // this layer doesn't know how to parse initializer expressions for setting
    // the value of complex objects or arrays.
    // TODO: It'd be nice to be able to set array identities here like: a = {1, 2, 3}.

    const isReadOnlyTarget = Boolean(proc.configuration.isReadOnly);
    const hasValidParentReference = this.parent.reference != null && !Number.isNaN(this.parent.reference) && this.parent.reference >= 0;
    return !isReadOnlyTarget && supportsSetVariable && hasValidParentReference && !this.hasChildren();
  }

  toString() {
    return `${this.name}: ${this._value}`;
  }

}

exports.Variable = Variable;

class Scope extends ExpressionContainer {
  constructor(stackFrame, index, name, reference, expensive, namedVariables, indexedVariables, range) {
    super(stackFrame.thread.process, reference, `scope:${stackFrame.getId()}:${name}:${index}`, namedVariables, indexedVariables);
    this.name = void 0;
    this.expensive = void 0;
    this.range = void 0;
    this.name = name;
    this.expensive = expensive;
    this.range = range;
  }

}

exports.Scope = Scope;

class StackFrame {
  constructor(thread, frameId, source, name, presentationHint, range, index) {
    this.scopes = void 0;
    this.thread = void 0;
    this.frameId = void 0;
    this.source = void 0;
    this.name = void 0;
    this.presentationHint = void 0;
    this.range = void 0;
    this.index = void 0;
    this.thread = thread;
    this.frameId = frameId;
    this.source = source;
    this.name = name;
    this.presentationHint = presentationHint;
    this.range = range;
    this.index = index;
    this.scopes = null;
  }

  getId() {
    return `stackframe:${this.thread.getId()}:${this.frameId}:${this.index}`;
  }

  async getScopes(forceRefresh) {
    if (this.scopes == null || forceRefresh) {
      this.scopes = this._getScopesImpl();
    }

    return this.scopes;
  }

  async _getScopesImpl() {
    try {
      const {
        body: {
          scopes
        }
      } = await this.thread.process.session.scopes({
        frameId: this.frameId
      });
      return scopes.map((rs, index) => new Scope(this, index, rs.name, rs.variablesReference, rs.expensive, rs.namedVariables, rs.indexedVariables, rs.line != null ? new _atom.Range([rs.line - 1, (rs.column != null ? rs.column : 1) - 1], [(rs.endLine != null ? rs.endLine : rs.line) - 1, (rs.endColumn != null ? rs.endColumn : 1) - 1]) : null));
    } catch (err) {
      return [];
    }
  }

  async getMostSpecificScopes(range) {
    const scopes = (await this.getScopes(false)).filter(s => !s.expensive);
    const haveRangeInfo = scopes.some(s => s.range != null);

    if (!haveRangeInfo) {
      return scopes;
    }

    const scopesContainingRange = scopes.filter(scope => scope.range != null && scope.range.containsRange(range)).sort((first, second) => {
      const firstRange = (0, _nullthrows.default)(first.range);
      const secondRange = (0, _nullthrows.default)(second.range); // prettier-ignore

      return firstRange.end.row - firstRange.start.row - (secondRange.end.row - secondRange.end.row);
    });
    return scopesContainingRange.length ? scopesContainingRange : scopes;
  }

  async restart() {
    await this.thread.process.session.restartFrame({
      frameId: this.frameId
    }, this.thread.threadId);
  }

  toString() {
    return `${this.name} (${this.source.inMemory ? (0, _nullthrows.default)(this.source.name) : this.source.uri}:${this.range.start.row})`;
  }

  async openInEditor() {
    const rawPath = this.source.raw.path;

    const localRawPath = _nuclideUri.default.getPath(rawPath || "");

    if (rawPath != null && localRawPath !== "" && (await (0, _nuclideDebuggerCommon.getVSCodeDebuggerAdapterServiceByNuclideUri)(rawPath).exists(localRawPath))) {
      return (0, _utils.openSourceLocation)(rawPath, this.range.start.row);
    }

    if (this.source.available) {
      return (0, _utils.openSourceLocation)(this.source.uri, this.range.start.row);
    }

    return null;
  }

}

exports.StackFrame = StackFrame;

class Thread {
  constructor(process, name, threadId) {
    this._callStack = void 0;
    this._refreshInProgress = void 0;
    this.stoppedDetails = void 0;
    this.stopped = void 0;
    this.process = void 0;
    this.threadId = void 0;
    this.name = void 0;
    this.process = process;
    this.name = name;
    this.threadId = threadId;
    this.stoppedDetails = null;
    this._callStack = this._getEmptyCallstackState();
    this.stopped = false;
    this._refreshInProgress = false;
  }

  _getEmptyCallstackState() {
    return {
      valid: false,
      callFrames: []
    };
  }

  _isCallstackLoaded() {
    return this._callStack.valid;
  }

  _isCallstackFullyLoaded() {
    return this._isCallstackLoaded() && this.stoppedDetails != null && this.stoppedDetails.totalFrames != null && !Number.isNaN(this.stoppedDetails.totalFrames) && this.stoppedDetails.totalFrames >= 0 && this._callStack.callFrames.length >= this.stoppedDetails.totalFrames;
  }

  getId() {
    return `thread:${this.process.getId()}:${this.threadId}`;
  }

  additionalFramesAvailable(currentFrameCount) {
    if (this._callStack.callFrames.length > currentFrameCount) {
      return true;
    }

    const supportsDelayLoading = (0, _nullthrows.default)(this.process).session.capabilities.supportsDelayedStackTraceLoading === true;

    if (supportsDelayLoading && this.stoppedDetails != null && this.stoppedDetails.totalFrames != null && this.stoppedDetails.totalFrames > currentFrameCount) {
      return true;
    }

    return false;
  }

  clearCallStack() {
    this._callStack = this._getEmptyCallstackState();
  }

  getCallStackTopFrame() {
    return this._isCallstackLoaded() ? this._callStack.callFrames[0] : null;
  }

  getFullCallStack(levels) {
    if (this._refreshInProgress || this._isCallstackFullyLoaded() || levels != null && this._isCallstackLoaded() && this._callStack.callFrames.length >= levels) {
      // We have a sufficent call stack already loaded, just return it.
      return _rxjs.Observable.of(_expected.Expect.value(this._callStack.callFrames));
    } // Return a pending value and kick off the fetch. When the fetch
    // is done, emit the new call frames.


    return _rxjs.Observable.concat(_rxjs.Observable.of(_expected.Expect.pending()), _rxjs.Observable.fromPromise(this.refreshCallStack(levels)).switchMap(() => _rxjs.Observable.of(_expected.Expect.value(this._callStack.callFrames))));
  }

  getCachedCallStack() {
    return this._callStack.callFrames;
  }
  /**
   * Queries the debug adapter for the callstack and returns a promise
   * which completes once the call stack has been retrieved.
   * If the thread is not stopped, it returns a promise to an empty array.
   *
   * If specified, levels indicates the maximum depth of call frames to fetch.
   */


  async refreshCallStack(levels) {
    if (!this.stopped) {
      return;
    }

    const supportsDelayLoading = (0, _nullthrows.default)(this.process).session.capabilities.supportsDelayedStackTraceLoading === true;
    this._refreshInProgress = true;

    try {
      if (supportsDelayLoading) {
        const start = this._callStack.callFrames.length;
        const callStack = await this._getCallStackImpl(start, levels);

        if (start < this._callStack.callFrames.length) {
          // Set the stack frames for exact position we requested.
          // To make sure no concurrent requests create duplicate stack frames #30660
          this._callStack.callFrames.splice(start, this._callStack.callFrames.length - start);
        }

        this._callStack.callFrames = this._callStack.callFrames.concat(callStack || []);
      } else {
        // Must load the entire call stack, the debugger backend doesn't support
        // delayed call stack loading.
        this._callStack.callFrames = (await this._getCallStackImpl(0, null)) || [];
      }

      this._callStack.valid = true;
    } finally {
      this._refreshInProgress = false;
    }
  }

  async _getCallStackImpl(startFrame, levels) {
    try {
      const stackTraceArgs = {
        threadId: this.threadId,
        startFrame
      }; // Only include levels if specified and supported. If levels is omitted,
      // the debug adapter is to return all stack frames, per the protocol.

      if (levels != null) {
        stackTraceArgs.levels = levels;
      }

      const response = await this.process.session.stackTrace(stackTraceArgs);

      if (response == null || response.body == null) {
        return [];
      }

      if (this.stoppedDetails != null) {
        this.stoppedDetails.totalFrames = response.body.totalFrames;
      }

      return response.body.stackFrames.map((rsf, index) => {
        const source = this.process.getSource(rsf.source);
        return new StackFrame(this, rsf.id, source, rsf.name, rsf.presentationHint, // The UI is 0-based while VSP is 1-based.
        new _atom.Range([rsf.line - 1, (rsf.column || 1) - 1], [(rsf.endLine != null ? rsf.endLine : rsf.line) - 1, (rsf.endColumn != null ? rsf.endColumn : 1) - 1]), startFrame + index);
      });
    } catch (err) {
      if (this.stoppedDetails != null) {
        this.stoppedDetails.framesErrorMessage = err.message;
      }

      return [];
    }
  }
  /**
   * Returns exception info promise if the exception was thrown, otherwise null
   */


  async exceptionInfo() {
    const session = this.process.session;

    if (this.stoppedDetails == null || this.stoppedDetails.reason !== "exception") {
      return null;
    }

    const stoppedDetails = this.stoppedDetails;

    if (!session.capabilities.supportsExceptionInfoRequest) {
      return {
        id: null,
        details: null,
        description: stoppedDetails.description,
        breakMode: null
      };
    }

    const exception = await session.exceptionInfo({
      threadId: this.threadId
    });

    if (exception == null) {
      return null;
    }

    return {
      id: exception.body.exceptionId,
      description: exception.body.description,
      breakMode: exception.body.breakMode,
      details: exception.body.details
    };
  }

  async next() {
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_STEP_OVER);
    await this.process.session.next({
      threadId: this.threadId
    });
  }

  async stepIn() {
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_STEP_INTO);
    await this.process.session.stepIn({
      threadId: this.threadId
    });
  }

  async stepOut() {
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_STEP_OUT);
    await this.process.session.stepOut({
      threadId: this.threadId
    });
  }

  async stepBack() {
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_STEP_BACK);
    await this.process.session.stepBack({
      threadId: this.threadId
    });
  }

  async continue() {
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_STEP_CONTINUE);
    await this.process.session.continue({
      threadId: this.threadId
    });
  }

  async pause() {
    (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_STEP_PAUSE);
    await this.process.session.pause({
      threadId: this.threadId
    });
  }

  async reverseContinue() {
    await this.process.session.reverseContinue({
      threadId: this.threadId
    });
  }

}

exports.Thread = Thread;

class Process {
  constructor(configuration, session) {
    this._sources = void 0;
    this._threads = void 0;
    this._session = void 0;
    this._configuration = void 0;
    this._pendingStart = void 0;
    this._pendingStop = void 0;
    this.breakpoints = void 0;
    this.exceptionBreakpoints = void 0;
    this._configuration = configuration;
    this._session = session;
    this._threads = new Map();
    this._sources = new Map();
    this._pendingStart = true;
    this._pendingStop = false;
    this.breakpoints = [];
    this.exceptionBreakpoints = [];
  }

  get sources() {
    return this._sources;
  }

  get session() {
    return this._session;
  }

  get configuration() {
    return this._configuration;
  }

  get debuggerMode() {
    if (this._pendingStart) {
      return _constants.DebuggerMode.STARTING;
    }

    if (this._pendingStop) {
      return _constants.DebuggerMode.STOPPING;
    }

    if (this.getAllThreads().some(t => t.stopped)) {
      // TOOD: Currently our UX controls support resume and async-break
      // on a per-process basis only. This needs to be modified here if
      // we add support for freezing and resuming individual threads.
      return _constants.DebuggerMode.PAUSED;
    }

    return _constants.DebuggerMode.RUNNING;
  }

  clearProcessStartingFlag() {
    this._pendingStart = false;
  }

  setStopPending() {
    this._pendingStop = true;
  }

  getSource(raw) {
    let source = new Source(raw, this.getId());

    if (this._sources.has(source.uri)) {
      source = (0, _nullthrows.default)(this._sources.get(source.uri));
    } else {
      this._sources.set(source.uri, source);
    }

    return source;
  }

  getThread(threadId) {
    return this._threads.get(threadId);
  }

  getAllThreads() {
    return Array.from(this._threads.values());
  }

  getId() {
    return this._session.getId();
  }

  rawStoppedUpdate(data) {
    const {
      threadId,
      stoppedDetails
    } = data;
    this.clearProcessStartingFlag();

    if (threadId != null && !this._threads.has(threadId)) {
      // We're being asked to update a thread we haven't seen yet, so
      // create it
      const thread = new Thread(this, `Thread ${threadId}`, threadId);

      this._threads.set(threadId, thread);
    } // Set the availability of the threads' callstacks depending on
    // whether the thread is stopped or not


    if (stoppedDetails.allThreadsStopped) {
      this._threads.forEach(thread => {
        thread.stoppedDetails = thread.threadId === threadId ? stoppedDetails : thread.stoppedDetails;
        thread.stopped = true;
        thread.clearCallStack();
      });
    } else if (threadId != null) {
      // One thread is stopped, only update that thread.
      const thread = (0, _nullthrows.default)(this._threads.get(threadId));
      thread.stoppedDetails = stoppedDetails;
      thread.clearCallStack();
      thread.stopped = true;
    }
  }

  rawThreadUpdate(data) {
    const {
      thread
    } = data;
    this.clearProcessStartingFlag();

    if (!this._threads.has(thread.id)) {
      // A new thread came in, initialize it.
      this._threads.set(thread.id, new Thread(this, thread.name, thread.id));
    } else if (thread.name) {
      // Just the thread name got updated #18244
      (0, _nullthrows.default)(this._threads.get(thread.id)).name = thread.name;
    }
  }

  clearThreads(removeThreads, reference) {
    if (reference != null) {
      if (this._threads.has(reference)) {
        const thread = (0, _nullthrows.default)(this._threads.get(reference));
        thread.clearCallStack();
        thread.stoppedDetails = null;
        thread.stopped = false;

        if (removeThreads) {
          this._threads.delete(reference);
        }
      }
    } else {
      this._threads.forEach(thread => {
        thread.clearCallStack();
        thread.stoppedDetails = null;
        thread.stopped = false;
      });

      if (removeThreads) {
        this._threads.clear();

        ExpressionContainer.allValues.clear();
      }
    }
  }

  async completions(frameId, text, position, overwriteBefore) {
    if (!this._session.capabilities.supportsCompletionsRequest) {
      return [];
    }

    try {
      const response = await this._session.completions({
        frameId,
        text,
        column: position.column,
        line: position.row
      });

      if (response && response.body && response.body.targets) {
        return response.body.targets;
      } else {
        return [];
      }
    } catch (error) {
      return [];
    }
  }

}

exports.Process = Process;

class Breakpoint {
  constructor(uiBreakpointId, uri, line, column, enabled, condition, logMessage, adapterData) {
    this.verified = void 0;
    this.idFromAdapter = void 0;
    this.uiBreakpointId = void 0;
    this.uri = void 0;
    this.line = void 0;
    this.originalLine = void 0;
    this.column = void 0;
    this.enabled = void 0;
    this.condition = void 0;
    this.logMessage = void 0;
    this.adapterData = void 0;
    this.hitCount = void 0;
    this.uri = uri;
    this.line = line;
    this.originalLine = line;
    this.column = column;
    this.enabled = enabled;
    this.condition = condition;
    this.adapterData = adapterData;
    this.verified = false;
    this.uiBreakpointId = uiBreakpointId;
    this.hitCount = null;

    if (condition != null && condition.trim() !== "") {
      this.condition = condition;
    } else {
      this.condition = null;
    }

    if (logMessage != null && logMessage.trim() !== "") {
      this.logMessage = logMessage;
    } else {
      this.logMessage = null;
    }
  }

  getId() {
    return this.uiBreakpointId;
  }

}

exports.Breakpoint = Breakpoint;

class FunctionBreakpoint {
  constructor(name, enabled, hitCondition) {
    this.id = void 0;
    this.verified = void 0;
    this.idFromAdapter = void 0;
    this.name = void 0;
    this.enabled = void 0;
    this.hitCondition = void 0;
    this.condition = void 0;
    this.name = name;
    this.enabled = enabled;
    this.hitCondition = hitCondition;
    this.condition = null;
    this.verified = false;
    this.idFromAdapter = null;
    this.id = _uuid.default.v4();
  }

  getId() {
    return this.id;
  }

}

exports.FunctionBreakpoint = FunctionBreakpoint;

class ExceptionBreakpoint {
  constructor(filter, label, enabled) {
    this._id = void 0;
    this.filter = void 0;
    this.label = void 0;
    this.enabled = void 0;
    this.filter = filter;
    this.label = label;
    this.enabled = enabled == null ? false : enabled;
    this._id = _uuid.default.v4();
  }

  getId() {
    return this._id;
  }

}

exports.ExceptionBreakpoint = ExceptionBreakpoint;
const BREAKPOINTS_CHANGED = "BREAKPOINTS_CHANGED";
const WATCH_EXPRESSIONS_CHANGED = "WATCH_EXPRESSIONS_CHANGED";
const CALLSTACK_CHANGED = "CALLSTACK_CHANGED";
const PROCESSES_CHANGED = "PROCESSES_CHANGED";

class Model {
  // Exception breakpoint filters are different for each debugger back-end, so they
  // are process-specific. However, when we're not debugging, ideally we'd want to still
  // show filters so that a user can set break on exception before starting debugging, to
  // enable breaking on early exceptions as the target starts. For this reason, we cache
  // whatever options the most recently focused process offered, and offer those.
  constructor(uiBreakpoints, breakpointsActivated, functionBreakpoints, exceptionBreakpoints, watchExpressions, getFocusedProcess) {
    this._processes = void 0;
    this._uiBreakpoints = void 0;
    this._breakpointsActivated = void 0;
    this._functionBreakpoints = void 0;
    this._watchExpressions = void 0;
    this._disposables = void 0;
    this._emitter = void 0;
    this._getFocusedProcess = void 0;
    this._mostRecentExceptionBreakpoints = void 0;
    this._processes = [];
    this._uiBreakpoints = uiBreakpoints;
    this._breakpointsActivated = breakpointsActivated;
    this._functionBreakpoints = functionBreakpoints;
    this._mostRecentExceptionBreakpoints = exceptionBreakpoints;
    this._watchExpressions = watchExpressions;
    this._getFocusedProcess = getFocusedProcess;
    this._emitter = new _atom.Emitter();
    this._disposables = new _UniversalDisposable.default(this._emitter);
  }

  getId() {
    return "root";
  }

  getProcesses() {
    return this._processes;
  }

  addProcess(configuration, session) {
    const process = new Process(configuration, session); // Add breakpoints to process.

    const processBreakpoints = process.breakpoints;

    for (const uiBp of this._uiBreakpoints) {
      processBreakpoints.push(new Breakpoint(uiBp.id, uiBp.uri, uiBp.line, uiBp.column, uiBp.enabled, uiBp.condition, uiBp.logMessage));
    }

    this._processes.push(process);

    this._emitter.emit(PROCESSES_CHANGED);

    return process;
  }

  removeProcess(id) {
    const removedProcesses = [];
    this._processes = this._processes.filter(p => {
      if (p.getId() === id) {
        removedProcesses.push(p);
        return false;
      } else {
        return true;
      }
    });

    this._emitter.emit(PROCESSES_CHANGED);

    if (removedProcesses.length > 0) {
      this._mostRecentExceptionBreakpoints = removedProcesses[0].exceptionBreakpoints;
    }

    return removedProcesses;
  }

  onDidChangeBreakpoints(callback) {
    return this._emitter.on(BREAKPOINTS_CHANGED, callback);
  } // TODO: Scope this so that only the tree nodes for the process that
  // had a call stack change need to re-render


  onDidChangeCallStack(callback) {
    return this._emitter.on(CALLSTACK_CHANGED, callback);
  }

  onDidChangeProcesses(callback) {
    return this._emitter.on(PROCESSES_CHANGED, callback);
  }

  onDidChangeWatchExpressions(callback) {
    return this._emitter.on(WATCH_EXPRESSIONS_CHANGED, callback);
  }

  rawUpdate(data) {
    const process = this._processes.filter(p => p.getId() === data.sessionId).pop();

    if (process == null) {
      return;
    }

    if (data.stoppedDetails != null) {
      process.rawStoppedUpdate(data);
    } else {
      process.rawThreadUpdate(data);
    }

    this._emitter.emit(CALLSTACK_CHANGED);
  }

  clearThreads(id, removeThreads, reference) {
    const process = this._processes.filter(p => p.getId() === id).pop();

    if (process != null) {
      process.clearThreads(removeThreads, reference);

      this._emitter.emit(CALLSTACK_CHANGED);
    }
  }

  async refreshCallStack(threadI, fetchAllFrames) {
    const thread = threadI; // If the debugger supports delayed stack trace loading, load only
    // the first call stack frame, which is needed to display in the threads
    // view. We will lazily load the remaining frames only for threads that
    // are visible in the UI, allowing us to skip loading frames we don't
    // need right now.

    const framesToLoad = (0, _nullthrows.default)(thread.process).session.capabilities.supportsDelayedStackTraceLoading && !fetchAllFrames ? 1 : null;
    thread.clearCallStack();
    await thread.refreshCallStack(framesToLoad);

    this._emitter.emit(CALLSTACK_CHANGED);
  }

  getUIBreakpoints() {
    return this._uiBreakpoints;
  }

  getBreakpoints() {
    // If we're currently debugging, return the breakpoints as the current
    // debug adapter sees them.
    const focusedProcess = this._getFocusedProcess();

    if (focusedProcess != null) {
      const currentProcess = this._processes.find(p => p.getId() === focusedProcess.getId());

      if (currentProcess != null) {
        return currentProcess.breakpoints;
      }
    } // Otherwise, return the UI breakpoints. Since there is no debug process,
    // the breakpoints have their original line location and no notion of
    // verified vs not.


    return this._uiBreakpoints.map(uiBp => {
      const bp = new Breakpoint(uiBp.id, uiBp.uri, uiBp.line, uiBp.column, uiBp.enabled, uiBp.condition, uiBp.logMessage);
      bp.verified = true;
      return bp;
    });
  }

  getBreakpointAtLine(uri, line) {
    let breakpoint = this.getBreakpoints().find(bp => bp.uri === uri && bp.line === line);

    if (breakpoint == null) {
      breakpoint = this.getBreakpoints().find(bp => bp.uri === uri && bp.originalLine === line);
    }

    return breakpoint;
  }

  getBreakpointById(id) {
    return this.getBreakpoints().find(bp => bp.getId() === id);
  }

  getFunctionBreakpoints() {
    return this._functionBreakpoints;
  }

  getExceptionBreakpoints() {
    const focusedProcess = this._getFocusedProcess();

    if (focusedProcess != null) {
      return focusedProcess.exceptionBreakpoints;
    }

    return this._mostRecentExceptionBreakpoints;
  }

  setExceptionBreakpoints(process, data) {
    process.exceptionBreakpoints = data.map(d => {
      const ebp = process.exceptionBreakpoints.filter(bp => bp.filter === d.filter).pop();
      return new ExceptionBreakpoint(d.filter, d.label, ebp ? ebp.enabled : d.default);
    });

    this._emitter.emit(BREAKPOINTS_CHANGED);
  }

  areBreakpointsActivated() {
    return this._breakpointsActivated;
  }

  setBreakpointsActivated(activated) {
    this._breakpointsActivated = activated;

    this._emitter.emit(BREAKPOINTS_CHANGED);
  }

  addUIBreakpoints(uiBreakpoints, fireEvent = true) {
    this._uiBreakpoints = this._uiBreakpoints.concat(uiBreakpoints);
    this._breakpointsActivated = true;

    this._sortSyncAndDeDup({
      fireEvent
    });
  }

  removeBreakpoints(toRemove) {
    this._uiBreakpoints = this._uiBreakpoints.filter(bp => !toRemove.some(r => r.getId() === bp.id));

    this._sortSyncAndDeDup();
  }

  updateBreakpoints(newBps) {
    this._uiBreakpoints = this._uiBreakpoints.filter(bp => !newBps.some(n => n.id === bp.id)).concat(newBps);

    this._sortSyncAndDeDup();
  } // This is called when a breakpoint is updated by the debug adapter.
  // It affects only breakpoints for a particular session.


  updateProcessBreakpoints(process, data) {
    const proc = this._processes.find(p => p.getId() === process.getId());

    if (proc == null) {
      return;
    }

    const breakpoints = proc.breakpoints;
    breakpoints.forEach(bp => {
      const bpData = data[bp.getId()];

      if (bpData != null) {
        // The breakpoint's calibrated location can be different from its
        // initial location. Since we don't display ranges in the UX, a bp
        // has only one line location. We prefer the endLine if the bp instruction
        // matches a range of lines. Otherwise fall back to the (start) line.
        bp.line = bpData.endLine != null ? bpData.endLine : bpData.line != null ? bpData.line : bp.line;
        bp.column = bpData.column != null ? bpData.column : bp.column;
        bp.verified = bpData.verified != null ? bpData.verified : bp.verified;
        bp.idFromAdapter = bpData.id;
        bp.adapterData = bpData.source ? bpData.source.adapterData : bp.adapterData;
        bp.hitCount = bpData.nuclide_hitCount;
      }
    });

    this._sortSyncAndDeDup();
  }

  _sortSyncAndDeDup(options) {
    const comparer = (first, second) => {
      if (first.uri !== second.uri) {
        return first.uri.localeCompare(second.uri);
      }

      if (first.line === second.line) {
        return first.column - second.column;
      }

      return first.line - second.line;
    };

    this._uiBreakpoints = (0, _collection.distinct)(this._uiBreakpoints.sort(comparer), bp => `${bp.uri}:${bp.line}:${bp.column}`); // Sync with all active processes.

    const bpIds = new Set();

    for (const bp of this._uiBreakpoints) {
      bpIds.add(bp.id);
    }

    for (const process of this._processes) {
      // Remove any breakpoints from the process that no longer exist in the UI.
      process.breakpoints = process.breakpoints.filter(bp => bpIds.has(bp.getId())); // Sync any to the process that are missing.

      const processBps = new Map();

      for (const processBreakpoint of process.breakpoints) {
        processBps.set(processBreakpoint.getId(), processBreakpoint);
      }

      for (const uiBp of this._uiBreakpoints) {
        const processBp = processBps.get(uiBp.id);

        if (processBp == null) {
          process.breakpoints.push(new Breakpoint(uiBp.id, uiBp.uri, uiBp.line, uiBp.column, uiBp.enabled, uiBp.condition, uiBp.logMessage));
        } else {
          processBp.enabled = uiBp.enabled;
          processBp.condition = uiBp.condition;
        }
      } // Sort.


      process.breakpoints = process.breakpoints.sort(comparer);
    }

    if (options == null || options.fireEvent) {
      this._emitter.emit(BREAKPOINTS_CHANGED);
    }
  }

  setEnablement(element, enable) {
    element.enabled = enable;

    const uiBp = this._uiBreakpoints.find(bp => bp.id === element.getId());

    if (uiBp != null) {
      uiBp.enabled = enable;
    }

    this._sortSyncAndDeDup();
  }

  enableOrDisableAllBreakpoints(enable) {
    this._uiBreakpoints.forEach(bp => {
      bp.enabled = enable;
    });

    this._functionBreakpoints.forEach(fbp => {
      fbp.enabled = enable;
    });

    this._sortSyncAndDeDup();
  }

  addFunctionBreakpoint(functionName) {
    const newFunctionBreakpoint = new FunctionBreakpoint(functionName, true, null);

    this._functionBreakpoints.push(newFunctionBreakpoint);

    this._emitter.emit(BREAKPOINTS_CHANGED);

    return newFunctionBreakpoint;
  }

  updateFunctionBreakpoints(data) {
    this._functionBreakpoints.forEach(fbp => {
      const fbpData = data[fbp.getId()];

      if (fbpData != null) {
        fbp.name = fbpData.name != null ? fbpData.name : fbp.name;
        fbp.verified = fbpData.verified || fbp.verified;
        fbp.idFromAdapter = fbpData.id;
        fbp.hitCondition = fbpData.hitCondition;
      }
    });

    this._emitter.emit(BREAKPOINTS_CHANGED);
  }

  removeFunctionBreakpoints(id) {
    let removed;

    if (id != null) {
      removed = this._functionBreakpoints.filter(fbp => fbp.getId() === id);
      this._functionBreakpoints = this._functionBreakpoints.filter(fbp => fbp.getId() !== id);
    } else {
      removed = this._functionBreakpoints;
      this._functionBreakpoints = [];
    }

    this._emitter.emit(BREAKPOINTS_CHANGED, {
      removed
    });
  }

  getWatchExpressions() {
    return this._watchExpressions;
  }

  addWatchExpression(name) {
    const we = new Expression(name);

    this._watchExpressions.push(we);

    this._emitter.emit(WATCH_EXPRESSIONS_CHANGED, we);
  }

  renameWatchExpression(id, newName) {
    const filtered = this._watchExpressions.filter(we => we.getId() === id);

    if (filtered.length === 1) {
      filtered[0].name = newName;

      this._emitter.emit(WATCH_EXPRESSIONS_CHANGED, filtered[0]);
    }
  }

  removeWatchExpressions(id) {
    this._watchExpressions = id != null ? this._watchExpressions.filter(we => we.getId() !== id) : [];

    this._emitter.emit(WATCH_EXPRESSIONS_CHANGED);
  }

  sourceIsNotAvailable(uri) {
    this._processes.forEach(p => {
      if (p.sources.has(uri)) {
        (0, _nullthrows.default)(p.sources.get(uri)).available = false;
      }
    });

    this._emitter.emit(CALLSTACK_CHANGED);
  }

  dispose() {
    this._disposables.dispose();
  }

}

exports.Model = Model;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyTW9kZWwuanMiXSwibmFtZXMiOlsiU291cmNlIiwiY29uc3RydWN0b3IiLCJyYXciLCJzZXNzaW9uSWQiLCJ1cmkiLCJhdmFpbGFibGUiLCJfcmF3IiwibmFtZSIsIlVOS05PV05fU09VUkNFIiwic291cmNlUmVmZXJlbmNlIiwicGF0aCIsIm51Y2xpZGVVcmkiLCJwYXJzZVBhdGgiLCJiYXNlIiwiREVCVUdfU09VUkNFU19VUkkiLCJvcmlnaW4iLCJwcmVzZW50YXRpb25IaW50IiwicmVmZXJlbmNlIiwiaW5NZW1vcnkiLCJzdGFydHNXaXRoIiwib3BlbkluRWRpdG9yIiwiYXRvbSIsIndvcmtzcGFjZSIsIm9wZW4iLCJzZWFyY2hBbGxQYW5lcyIsInBlbmRpbmciLCJFeHByZXNzaW9uQ29udGFpbmVyIiwicHJvY2VzcyIsImlkIiwibmFtZWRWYXJpYWJsZXMiLCJpbmRleGVkVmFyaWFibGVzIiwic3RhcnRPZlZhcmlhYmxlcyIsIl92YWx1ZSIsIl9jaGlsZHJlbiIsIl9yZWZlcmVuY2UiLCJfaWQiLCJfbmFtZWRWYXJpYWJsZXMiLCJfaW5kZXhlZFZhcmlhYmxlcyIsIl9zdGFydE9mVmFyaWFibGVzIiwidmFsdWUiLCJoYXNDaGlsZFZhcmlhYmxlcyIsImdldENoaWxkcmVuIiwiX2RvR2V0Q2hpbGRyZW4iLCJoYXNDaGlsZHJlbiIsImdldENoaWxkcmVuSW5DaHVua3MiLCJ2YXJpYWJsZXMiLCJfZmV0Y2hWYXJpYWJsZXMiLCJjaGlsZHJlbkFycmF5IiwiQm9vbGVhbiIsInVuZGVmaW5lZCIsImNodW5rU2l6ZSIsIkJBU0VfQ0hVTktfU0laRSIsIm51bWJlck9mQ2h1bmtzIiwiTWF0aCIsImNlaWwiLCJpIiwic3RhcnQiLCJjb3VudCIsIm1pbiIsInB1c2giLCJWYXJpYWJsZSIsImtpbmQiLCJjb25jYXQiLCJnZXRJZCIsImdldFZhbHVlIiwiZmlsdGVyIiwicmVzcG9uc2UiLCJzZXNzaW9uIiwidmFyaWFibGVzUmVmZXJlbmNlIiwiYm9keSIsInYiLCJtYXAiLCJldmFsdWF0ZU5hbWUiLCJ0eXBlIiwiZSIsIm1lc3NhZ2UiLCJzZXRWYWx1ZSIsImFsbFZhbHVlcyIsInNldCIsInRvU3RyaW5nIiwiTWFwIiwiRXhwcmVzc2lvbiIsInV1aWQiLCJ2NCIsIl90eXBlIiwiREVGQVVMVF9WQUxVRSIsImV2YWx1YXRlIiwic3RhY2tGcmFtZSIsImNvbnRleHQiLCJleHByZXNzaW9uIiwiZnJhbWVJZCIsInJlc3VsdCIsImVyciIsInBhcmVudCIsImdyYW1tYXJOYW1lIiwiY29uZmlndXJhdGlvbiIsInNldFZhcmlhYmxlIiwiQW5hbHl0aWNzRXZlbnRzIiwiREVCVUdHRVJfRURJVF9WQVJJQUJMRSIsImxhbmd1YWdlIiwiYWRhcHRlclR5cGUiLCJjYW5TZXRWYXJpYWJsZSIsInByb2MiLCJzdXBwb3J0c1NldFZhcmlhYmxlIiwiY2FwYWJpbGl0aWVzIiwiaXNSZWFkT25seVRhcmdldCIsImlzUmVhZE9ubHkiLCJoYXNWYWxpZFBhcmVudFJlZmVyZW5jZSIsIk51bWJlciIsImlzTmFOIiwiU2NvcGUiLCJpbmRleCIsImV4cGVuc2l2ZSIsInJhbmdlIiwidGhyZWFkIiwiU3RhY2tGcmFtZSIsInNvdXJjZSIsInNjb3BlcyIsImdldFNjb3BlcyIsImZvcmNlUmVmcmVzaCIsIl9nZXRTY29wZXNJbXBsIiwicnMiLCJsaW5lIiwiUmFuZ2UiLCJjb2x1bW4iLCJlbmRMaW5lIiwiZW5kQ29sdW1uIiwiZ2V0TW9zdFNwZWNpZmljU2NvcGVzIiwicyIsImhhdmVSYW5nZUluZm8iLCJzb21lIiwic2NvcGVzQ29udGFpbmluZ1JhbmdlIiwic2NvcGUiLCJjb250YWluc1JhbmdlIiwic29ydCIsImZpcnN0Iiwic2Vjb25kIiwiZmlyc3RSYW5nZSIsInNlY29uZFJhbmdlIiwiZW5kIiwicm93IiwibGVuZ3RoIiwicmVzdGFydCIsInJlc3RhcnRGcmFtZSIsInRocmVhZElkIiwicmF3UGF0aCIsImxvY2FsUmF3UGF0aCIsImdldFBhdGgiLCJleGlzdHMiLCJUaHJlYWQiLCJfY2FsbFN0YWNrIiwiX3JlZnJlc2hJblByb2dyZXNzIiwic3RvcHBlZERldGFpbHMiLCJzdG9wcGVkIiwiX2dldEVtcHR5Q2FsbHN0YWNrU3RhdGUiLCJ2YWxpZCIsImNhbGxGcmFtZXMiLCJfaXNDYWxsc3RhY2tMb2FkZWQiLCJfaXNDYWxsc3RhY2tGdWxseUxvYWRlZCIsInRvdGFsRnJhbWVzIiwiYWRkaXRpb25hbEZyYW1lc0F2YWlsYWJsZSIsImN1cnJlbnRGcmFtZUNvdW50Iiwic3VwcG9ydHNEZWxheUxvYWRpbmciLCJzdXBwb3J0c0RlbGF5ZWRTdGFja1RyYWNlTG9hZGluZyIsImNsZWFyQ2FsbFN0YWNrIiwiZ2V0Q2FsbFN0YWNrVG9wRnJhbWUiLCJnZXRGdWxsQ2FsbFN0YWNrIiwibGV2ZWxzIiwiT2JzZXJ2YWJsZSIsIm9mIiwiRXhwZWN0IiwiZnJvbVByb21pc2UiLCJyZWZyZXNoQ2FsbFN0YWNrIiwic3dpdGNoTWFwIiwiZ2V0Q2FjaGVkQ2FsbFN0YWNrIiwiY2FsbFN0YWNrIiwiX2dldENhbGxTdGFja0ltcGwiLCJzcGxpY2UiLCJzdGFydEZyYW1lIiwic3RhY2tUcmFjZUFyZ3MiLCJzdGFja1RyYWNlIiwic3RhY2tGcmFtZXMiLCJyc2YiLCJnZXRTb3VyY2UiLCJmcmFtZXNFcnJvck1lc3NhZ2UiLCJleGNlcHRpb25JbmZvIiwicmVhc29uIiwic3VwcG9ydHNFeGNlcHRpb25JbmZvUmVxdWVzdCIsImRldGFpbHMiLCJkZXNjcmlwdGlvbiIsImJyZWFrTW9kZSIsImV4Y2VwdGlvbiIsImV4Y2VwdGlvbklkIiwibmV4dCIsIkRFQlVHR0VSX1NURVBfT1ZFUiIsInN0ZXBJbiIsIkRFQlVHR0VSX1NURVBfSU5UTyIsInN0ZXBPdXQiLCJERUJVR0dFUl9TVEVQX09VVCIsInN0ZXBCYWNrIiwiREVCVUdHRVJfU1RFUF9CQUNLIiwiY29udGludWUiLCJERUJVR0dFUl9TVEVQX0NPTlRJTlVFIiwicGF1c2UiLCJERUJVR0dFUl9TVEVQX1BBVVNFIiwicmV2ZXJzZUNvbnRpbnVlIiwiUHJvY2VzcyIsIl9zb3VyY2VzIiwiX3RocmVhZHMiLCJfc2Vzc2lvbiIsIl9jb25maWd1cmF0aW9uIiwiX3BlbmRpbmdTdGFydCIsIl9wZW5kaW5nU3RvcCIsImJyZWFrcG9pbnRzIiwiZXhjZXB0aW9uQnJlYWtwb2ludHMiLCJzb3VyY2VzIiwiZGVidWdnZXJNb2RlIiwiRGVidWdnZXJNb2RlIiwiU1RBUlRJTkciLCJTVE9QUElORyIsImdldEFsbFRocmVhZHMiLCJ0IiwiUEFVU0VEIiwiUlVOTklORyIsImNsZWFyUHJvY2Vzc1N0YXJ0aW5nRmxhZyIsInNldFN0b3BQZW5kaW5nIiwiaGFzIiwiZ2V0IiwiZ2V0VGhyZWFkIiwiQXJyYXkiLCJmcm9tIiwidmFsdWVzIiwicmF3U3RvcHBlZFVwZGF0ZSIsImRhdGEiLCJhbGxUaHJlYWRzU3RvcHBlZCIsImZvckVhY2giLCJyYXdUaHJlYWRVcGRhdGUiLCJjbGVhclRocmVhZHMiLCJyZW1vdmVUaHJlYWRzIiwiZGVsZXRlIiwiY2xlYXIiLCJjb21wbGV0aW9ucyIsInRleHQiLCJwb3NpdGlvbiIsIm92ZXJ3cml0ZUJlZm9yZSIsInN1cHBvcnRzQ29tcGxldGlvbnNSZXF1ZXN0IiwidGFyZ2V0cyIsImVycm9yIiwiQnJlYWtwb2ludCIsInVpQnJlYWtwb2ludElkIiwiZW5hYmxlZCIsImNvbmRpdGlvbiIsImxvZ01lc3NhZ2UiLCJhZGFwdGVyRGF0YSIsInZlcmlmaWVkIiwiaWRGcm9tQWRhcHRlciIsIm9yaWdpbmFsTGluZSIsImhpdENvdW50IiwidHJpbSIsIkZ1bmN0aW9uQnJlYWtwb2ludCIsImhpdENvbmRpdGlvbiIsIkV4Y2VwdGlvbkJyZWFrcG9pbnQiLCJsYWJlbCIsIkJSRUFLUE9JTlRTX0NIQU5HRUQiLCJXQVRDSF9FWFBSRVNTSU9OU19DSEFOR0VEIiwiQ0FMTFNUQUNLX0NIQU5HRUQiLCJQUk9DRVNTRVNfQ0hBTkdFRCIsIk1vZGVsIiwidWlCcmVha3BvaW50cyIsImJyZWFrcG9pbnRzQWN0aXZhdGVkIiwiZnVuY3Rpb25CcmVha3BvaW50cyIsIndhdGNoRXhwcmVzc2lvbnMiLCJnZXRGb2N1c2VkUHJvY2VzcyIsIl9wcm9jZXNzZXMiLCJfdWlCcmVha3BvaW50cyIsIl9icmVha3BvaW50c0FjdGl2YXRlZCIsIl9mdW5jdGlvbkJyZWFrcG9pbnRzIiwiX3dhdGNoRXhwcmVzc2lvbnMiLCJfZGlzcG9zYWJsZXMiLCJfZW1pdHRlciIsIl9nZXRGb2N1c2VkUHJvY2VzcyIsIl9tb3N0UmVjZW50RXhjZXB0aW9uQnJlYWtwb2ludHMiLCJFbWl0dGVyIiwiVW5pdmVyc2FsRGlzcG9zYWJsZSIsImdldFByb2Nlc3NlcyIsImFkZFByb2Nlc3MiLCJwcm9jZXNzQnJlYWtwb2ludHMiLCJ1aUJwIiwiZW1pdCIsInJlbW92ZVByb2Nlc3MiLCJyZW1vdmVkUHJvY2Vzc2VzIiwicCIsIm9uRGlkQ2hhbmdlQnJlYWtwb2ludHMiLCJjYWxsYmFjayIsIm9uIiwib25EaWRDaGFuZ2VDYWxsU3RhY2siLCJvbkRpZENoYW5nZVByb2Nlc3NlcyIsIm9uRGlkQ2hhbmdlV2F0Y2hFeHByZXNzaW9ucyIsInJhd1VwZGF0ZSIsInBvcCIsInRocmVhZEkiLCJmZXRjaEFsbEZyYW1lcyIsImZyYW1lc1RvTG9hZCIsImdldFVJQnJlYWtwb2ludHMiLCJnZXRCcmVha3BvaW50cyIsImZvY3VzZWRQcm9jZXNzIiwiY3VycmVudFByb2Nlc3MiLCJmaW5kIiwiYnAiLCJnZXRCcmVha3BvaW50QXRMaW5lIiwiYnJlYWtwb2ludCIsImdldEJyZWFrcG9pbnRCeUlkIiwiZ2V0RnVuY3Rpb25CcmVha3BvaW50cyIsImdldEV4Y2VwdGlvbkJyZWFrcG9pbnRzIiwic2V0RXhjZXB0aW9uQnJlYWtwb2ludHMiLCJkIiwiZWJwIiwiZGVmYXVsdCIsImFyZUJyZWFrcG9pbnRzQWN0aXZhdGVkIiwic2V0QnJlYWtwb2ludHNBY3RpdmF0ZWQiLCJhY3RpdmF0ZWQiLCJhZGRVSUJyZWFrcG9pbnRzIiwiZmlyZUV2ZW50IiwiX3NvcnRTeW5jQW5kRGVEdXAiLCJyZW1vdmVCcmVha3BvaW50cyIsInRvUmVtb3ZlIiwiciIsInVwZGF0ZUJyZWFrcG9pbnRzIiwibmV3QnBzIiwibiIsInVwZGF0ZVByb2Nlc3NCcmVha3BvaW50cyIsImJwRGF0YSIsIm51Y2xpZGVfaGl0Q291bnQiLCJvcHRpb25zIiwiY29tcGFyZXIiLCJsb2NhbGVDb21wYXJlIiwiYnBJZHMiLCJTZXQiLCJhZGQiLCJwcm9jZXNzQnBzIiwicHJvY2Vzc0JyZWFrcG9pbnQiLCJwcm9jZXNzQnAiLCJzZXRFbmFibGVtZW50IiwiZWxlbWVudCIsImVuYWJsZSIsImVuYWJsZU9yRGlzYWJsZUFsbEJyZWFrcG9pbnRzIiwiZmJwIiwiYWRkRnVuY3Rpb25CcmVha3BvaW50IiwiZnVuY3Rpb25OYW1lIiwibmV3RnVuY3Rpb25CcmVha3BvaW50IiwidXBkYXRlRnVuY3Rpb25CcmVha3BvaW50cyIsImZicERhdGEiLCJyZW1vdmVGdW5jdGlvbkJyZWFrcG9pbnRzIiwicmVtb3ZlZCIsImdldFdhdGNoRXhwcmVzc2lvbnMiLCJhZGRXYXRjaEV4cHJlc3Npb24iLCJ3ZSIsInJlbmFtZVdhdGNoRXhwcmVzc2lvbiIsIm5ld05hbWUiLCJmaWx0ZXJlZCIsInJlbW92ZVdhdGNoRXhwcmVzc2lvbnMiLCJzb3VyY2VJc05vdEF2YWlsYWJsZSIsImRpc3Bvc2UiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUF3REE7O0FBQ0E7O0FBQ0E7O0FBR0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBdkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBOENPLE1BQU1BLE1BQU4sQ0FBZ0M7QUFLckNDLEVBQUFBLFdBQVcsQ0FBQ0MsR0FBRCxFQUE2QkMsU0FBN0IsRUFBZ0Q7QUFBQSxTQUox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c0NvbnRlbnQiOlsiLyoqXG5UaGUgZm9sbG93aW5nIGRlYnVnIG1vZGVsIGltcGxlbWVudGF0aW9uIHdhcyBwb3J0ZWQgZnJvbSBWU0NvZGUncyBkZWJ1Z2dlciBpbXBsZW1lbnRhdGlvblxuaW4gaHR0cHM6Ly9naXRodWIuY29tL01pY3Jvc29mdC92c2NvZGUvdHJlZS9tYXN0ZXIvc3JjL3ZzL3dvcmtiZW5jaC9wYXJ0cy9kZWJ1Z1xuXG5NSVQgTGljZW5zZVxuXG5Db3B5cmlnaHQgKGMpIDIwMTUgLSBwcmVzZW50IE1pY3Jvc29mdCBDb3Jwb3JhdGlvblxuXG5BbGwgcmlnaHRzIHJlc2VydmVkLlxuXG5QZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG5vZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG5pbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG50byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG5jb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbmZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG5cblRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbFxuY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cblxuVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG5GSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbkFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbkxJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG5PVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuU09GVFdBUkUuXG4qL1xuXG5pbXBvcnQgdHlwZSB7XG4gIElFeHByZXNzaW9uLFxuICBJRXhwcmVzc2lvbkNvbnRhaW5lcixcbiAgSUV2YWx1YXRhYmxlRXhwcmVzc2lvbixcbiAgSVN0YWNrRnJhbWUsXG4gIElCcmVha3BvaW50LFxuICBJUmF3TW9kZWxVcGRhdGUsXG4gIElSYXdTdG9wcHBlZFVwZGF0ZSxcbiAgSVJhd1RocmVhZFVwZGF0ZSxcbiAgSVNlc3Npb24sXG4gIElUaHJlYWQsXG4gIElNb2RlbCxcbiAgSVNjb3BlLFxuICBJU291cmNlLFxuICBJUHJvY2VzcyxcbiAgSVJhd1N0b3BwZWREZXRhaWxzLFxuICBJRW5hYmxlYWJsZSxcbiAgSVVJQnJlYWtwb2ludCxcbiAgSUV4Y2VwdGlvbkluZm8sXG4gIElFeGNlcHRpb25CcmVha3BvaW50LFxuICBJRnVuY3Rpb25CcmVha3BvaW50LFxuICBJVHJlZUVsZW1lbnQsXG4gIElWYXJpYWJsZSxcbiAgU291cmNlUHJlc2VudGF0aW9uSGludCxcbiAgRGVidWdnZXJNb2RlVHlwZSxcbn0gZnJvbSBcIi4uL3R5cGVzXCJcbmltcG9ydCB0eXBlIHsgSVByb2Nlc3NDb25maWcgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWRlYnVnZ2VyLWNvbW1vblwiXG5pbXBvcnQgbnVjbGlkZVVyaSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvbnVjbGlkZVVyaVwiXG5pbXBvcnQgeyBnZXRWU0NvZGVEZWJ1Z2dlckFkYXB0ZXJTZXJ2aWNlQnlOdWNsaWRlVXJpIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1kZWJ1Z2dlci1jb21tb25cIlxuaW1wb3J0ICogYXMgRGVidWdQcm90b2NvbCBmcm9tIFwidnNjb2RlLWRlYnVncHJvdG9jb2xcIlxuaW1wb3J0IHR5cGUgeyBFeHBlY3RlZCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9leHBlY3RlZFwiXG5cbmltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tIFwicnhqc1wiXG5pbXBvcnQgdXVpZCBmcm9tIFwidXVpZFwiXG5pbXBvcnQgbnVsbHRocm93cyBmcm9tIFwibnVsbHRocm93c1wiXG5pbXBvcnQgaW52YXJpYW50IGZyb20gXCJhc3NlcnRcIlxuaW1wb3J0IHsgRW1pdHRlciwgUmFuZ2UgfSBmcm9tIFwiYXRvbVwiXG5pbXBvcnQgVW5pdmVyc2FsRGlzcG9zYWJsZSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvVW5pdmVyc2FsRGlzcG9zYWJsZVwiXG5pbXBvcnQgeyB0cmFjayB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9hbmFseXRpY3NcIlxuaW1wb3J0IHsgQW5hbHl0aWNzRXZlbnRzLCBVTktOT1dOX1NPVVJDRSwgREVCVUdfU09VUkNFU19VUkksIERlYnVnZ2VyTW9kZSB9IGZyb20gXCIuLi9jb25zdGFudHNcIlxuaW1wb3J0IHsgb3BlblNvdXJjZUxvY2F0aW9uIH0gZnJvbSBcIi4uL3V0aWxzXCJcbmltcG9ydCB7IGRpc3RpbmN0IH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL2NvbGxlY3Rpb25cIlxuaW1wb3J0IHsgRXhwZWN0IH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL2V4cGVjdGVkXCJcblxuZXhwb3J0IGNsYXNzIFNvdXJjZSBpbXBsZW1lbnRzIElTb3VyY2Uge1xuICArdXJpOiBzdHJpbmdcbiAgYXZhaWxhYmxlOiBib29sZWFuXG4gIF9yYXc6IERlYnVnUHJvdG9jb2wuU291cmNlXG5cbiAgY29uc3RydWN0b3IocmF3OiA/RGVidWdQcm90b2NvbC5Tb3VyY2UsIHNlc3Npb25JZDogc3RyaW5nKSB7XG4gICAgaWYgKHJhdyA9PSBudWxsKSB7XG4gICAgICB0aGlzLl9yYXcgPSB7IG5hbWU6IFVOS05PV05fU09VUkNFIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5fcmF3ID0gcmF3XG4gICAgfVxuICAgIGlmICh0aGlzLl9yYXcuc291cmNlUmVmZXJlbmNlICE9IG51bGwgJiYgdGhpcy5fcmF3LnNvdXJjZVJlZmVyZW5jZSA+IDApIHtcbiAgICAgIGNvbnN0IG5hbWUgPVxuICAgICAgICB0aGlzLl9yYXcubmFtZSAhPSBudWxsXG4gICAgICAgICAgPyB0aGlzLl9yYXcubmFtZVxuICAgICAgICAgIDogdGhpcy5fcmF3LnBhdGggIT0gbnVsbFxuICAgICAgICAgID8gbnVjbGlkZVVyaS5wYXJzZVBhdGgodGhpcy5fcmF3LnBhdGgpLmJhc2VcbiAgICAgICAgICA6IFVOS05PV05fU09VUkNFXG4gICAgICB0aGlzLnVyaSA9IGAke0RFQlVHX1NPVVJDRVNfVVJJfS8ke3Nlc3Npb25JZH0vJHt0aGlzLl9yYXcuc291cmNlUmVmZXJlbmNlfS8ke25hbWV9YFxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnVyaSA9IHRoaXMuX3Jhdy5wYXRoIHx8IFwiXCJcbiAgICB9XG4gICAgdGhpcy5hdmFpbGFibGUgPSB0aGlzLnVyaSAhPT0gXCJcIlxuICB9XG5cbiAgZ2V0IG5hbWUoKTogP3N0cmluZyB7XG4gICAgcmV0dXJuIHRoaXMuX3Jhdy5uYW1lXG4gIH1cblxuICBnZXQgb3JpZ2luKCk6ID9zdHJpbmcge1xuICAgIHJldHVybiB0aGlzLl9yYXcub3JpZ2luXG4gIH1cblxuICBnZXQgcHJlc2VudGF0aW9uSGludCgpOiA/U291cmNlUHJlc2VudGF0aW9uSGludCB7XG4gICAgcmV0dXJuIHRoaXMuX3Jhdy5wcmVzZW50YXRpb25IaW50XG4gIH1cblxuICBnZXQgcmF3KCk6IERlYnVnUHJvdG9jb2wuU291cmNlIHtcbiAgICByZXR1cm4ge1xuICAgICAgLi4udGhpcy5fcmF3LFxuICAgIH1cbiAgfVxuXG4gIGdldCByZWZlcmVuY2UoKTogP251bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuX3Jhdy5zb3VyY2VSZWZlcmVuY2VcbiAgfVxuXG4gIGdldCBpbk1lbW9yeSgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy51cmkuc3RhcnRzV2l0aChERUJVR19TT1VSQ0VTX1VSSSlcbiAgfVxuXG4gIG9wZW5JbkVkaXRvcigpOiBQcm9taXNlPGF0b20kVGV4dEVkaXRvcj4ge1xuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBudWNsaWRlLWludGVybmFsL2F0b20tYXBpc1xuICAgIHJldHVybiBhdG9tLndvcmtzcGFjZS5vcGVuKHRoaXMudXJpLCB7XG4gICAgICBzZWFyY2hBbGxQYW5lczogdHJ1ZSxcbiAgICAgIHBlbmRpbmc6IHRydWUsXG4gICAgfSlcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRXhwcmVzc2lvbkNvbnRhaW5lciBpbXBsZW1lbnRzIElFeHByZXNzaW9uQ29udGFpbmVyIHtcbiAgc3RhdGljIGFsbFZhbHVlczogTWFwPHN0cmluZywgc3RyaW5nPiA9IG5ldyBNYXAoKVxuICAvLyBVc2UgY2h1bmtzIHRvIHN1cHBvcnQgdmFyaWFibGUgcGFnaW5nICM5NTM3XG4gIHN0YXRpYyBCQVNFX0NIVU5LX1NJWkUgPSAxMDBcblxuICBfdmFsdWU6IHN0cmluZ1xuICBfY2hpbGRyZW46ID9Qcm9taXNlPElWYXJpYWJsZVtdPlxuICBwcm9jZXNzOiA/SVByb2Nlc3NcbiAgX3JlZmVyZW5jZTogbnVtYmVyXG4gIF9pZDogc3RyaW5nXG4gIF9uYW1lZFZhcmlhYmxlczogbnVtYmVyXG4gIF9pbmRleGVkVmFyaWFibGVzOiBudW1iZXJcbiAgX3N0YXJ0T2ZWYXJpYWJsZXM6IG51bWJlclxuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByb2Nlc3M6ID9JUHJvY2VzcyxcbiAgICByZWZlcmVuY2U6IG51bWJlcixcbiAgICBpZDogc3RyaW5nLFxuICAgIG5hbWVkVmFyaWFibGVzOiA/bnVtYmVyLFxuICAgIGluZGV4ZWRWYXJpYWJsZXM6ID9udW1iZXIsXG4gICAgc3RhcnRPZlZhcmlhYmxlczogP251bWJlclxuICApIHtcbiAgICB0aGlzLnByb2Nlc3MgPSBwcm9jZXNzXG4gICAgdGhpcy5fcmVmZXJlbmNlID0gcmVmZXJlbmNlXG4gICAgdGhpcy5faWQgPSBpZFxuICAgIHRoaXMuX25hbWVkVmFyaWFibGVzID0gbmFtZWRWYXJpYWJsZXMgfHwgMFxuICAgIHRoaXMuX2luZGV4ZWRWYXJpYWJsZXMgPSBpbmRleGVkVmFyaWFibGVzIHx8IDBcbiAgICB0aGlzLl9zdGFydE9mVmFyaWFibGVzID0gc3RhcnRPZlZhcmlhYmxlcyB8fCAwXG4gIH1cblxuICBnZXQgcmVmZXJlbmNlKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuX3JlZmVyZW5jZVxuICB9XG5cbiAgc2V0IHJlZmVyZW5jZSh2YWx1ZTogbnVtYmVyKSB7XG4gICAgdGhpcy5fcmVmZXJlbmNlID0gdmFsdWVcbiAgICB0aGlzLl9jaGlsZHJlbiA9IG51bGxcbiAgfVxuXG4gIGdldCBoYXNDaGlsZFZhcmlhYmxlcygpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5fbmFtZWRWYXJpYWJsZXMgKyB0aGlzLl9pbmRleGVkVmFyaWFibGVzID4gMFxuICB9XG5cbiAgZ2V0Q2hpbGRyZW4oKTogUHJvbWlzZTxJVmFyaWFibGVbXT4ge1xuICAgIGlmICh0aGlzLl9jaGlsZHJlbiA9PSBudWxsKSB7XG4gICAgICB0aGlzLl9jaGlsZHJlbiA9IHRoaXMuX2RvR2V0Q2hpbGRyZW4oKVxuICAgIH1cblxuICAgIHJldHVybiB0aGlzLl9jaGlsZHJlblxuICB9XG5cbiAgYXN5bmMgX2RvR2V0Q2hpbGRyZW4oKTogUHJvbWlzZTxJVmFyaWFibGVbXT4ge1xuICAgIGlmICghdGhpcy5oYXNDaGlsZHJlbigpKSB7XG4gICAgICByZXR1cm4gW11cbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuZ2V0Q2hpbGRyZW5JbkNodW5rcykge1xuICAgICAgY29uc3QgdmFyaWFibGVzID0gYXdhaXQgdGhpcy5fZmV0Y2hWYXJpYWJsZXMoKVxuICAgICAgcmV0dXJuIHZhcmlhYmxlc1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIG9iamVjdCBoYXMgbmFtZWQgdmFyaWFibGVzLCBmZXRjaCB0aGVtIGluZGVwZW5kZW50IGZyb20gaW5kZXhlZCB2YXJpYWJsZXMgIzk2NzBcbiAgICBsZXQgY2hpbGRyZW5BcnJheTogQXJyYXk8SVZhcmlhYmxlPiA9IFtdXG4gICAgaWYgKEJvb2xlYW4odGhpcy5fbmFtZWRWYXJpYWJsZXMpKSB7XG4gICAgICBjaGlsZHJlbkFycmF5ID0gYXdhaXQgdGhpcy5fZmV0Y2hWYXJpYWJsZXModW5kZWZpbmVkLCB1bmRlZmluZWQsIFwibmFtZWRcIilcbiAgICB9XG5cbiAgICAvLyBVc2UgYSBkeW5hbWljIGNodW5rIHNpemUgYmFzZWQgb24gdGhlIG51bWJlciBvZiBlbGVtZW50cyAjOTc3NFxuICAgIGxldCBjaHVua1NpemUgPSBFeHByZXNzaW9uQ29udGFpbmVyLkJBU0VfQ0hVTktfU0laRVxuICAgIHdoaWxlICh0aGlzLl9pbmRleGVkVmFyaWFibGVzID4gY2h1bmtTaXplICogRXhwcmVzc2lvbkNvbnRhaW5lci5CQVNFX0NIVU5LX1NJWkUpIHtcbiAgICAgIGNodW5rU2l6ZSAqPSBFeHByZXNzaW9uQ29udGFpbmVyLkJBU0VfQ0hVTktfU0laRVxuICAgIH1cblxuICAgIGlmICh0aGlzLl9pbmRleGVkVmFyaWFibGVzID4gY2h1bmtTaXplKSB7XG4gICAgICAvLyBUaGVyZSBhcmUgYSBsb3Qgb2YgY2hpbGRyZW4sIGNyZWF0ZSBmYWtlIGludGVybWVkaWF0ZSB2YWx1ZXMgdGhhdCByZXByZXNlbnQgY2h1bmtzICM5NTM3XG4gICAgICBjb25zdCBudW1iZXJPZkNodW5rcyA9IE1hdGguY2VpbCh0aGlzLl9pbmRleGVkVmFyaWFibGVzIC8gY2h1bmtTaXplKVxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBudW1iZXJPZkNodW5rczsgaSsrKSB7XG4gICAgICAgIGNvbnN0IHN0YXJ0ID0gdGhpcy5fc3RhcnRPZlZhcmlhYmxlcyArIGkgKiBjaHVua1NpemVcbiAgICAgICAgY29uc3QgY291bnQgPSBNYXRoLm1pbihjaHVua1NpemUsIHRoaXMuX2luZGV4ZWRWYXJpYWJsZXMgLSBpICogY2h1bmtTaXplKVxuICAgICAgICBjaGlsZHJlbkFycmF5LnB1c2goXG4gICAgICAgICAgbmV3IFZhcmlhYmxlKFxuICAgICAgICAgICAgdGhpcy5wcm9jZXNzLFxuICAgICAgICAgICAgdGhpcyxcbiAgICAgICAgICAgIHRoaXMucmVmZXJlbmNlLFxuICAgICAgICAgICAgYFske3N0YXJ0fS4uJHtzdGFydCArIGNvdW50IC0gMX1dYCxcbiAgICAgICAgICAgIFwiXCIsXG4gICAgICAgICAgICBcIlwiLFxuICAgICAgICAgICAgbnVsbCxcbiAgICAgICAgICAgIGNvdW50LFxuICAgICAgICAgICAgeyBraW5kOiBcInZpcnR1YWxcIiB9LFxuICAgICAgICAgICAgbnVsbCxcbiAgICAgICAgICAgIHRydWUsXG4gICAgICAgICAgICBzdGFydFxuICAgICAgICAgIClcbiAgICAgICAgKVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gY2hpbGRyZW5BcnJheVxuICAgIH1cblxuICAgIGNvbnN0IHZhcmlhYmxlcyA9IGF3YWl0IHRoaXMuX2ZldGNoVmFyaWFibGVzKHRoaXMuX3N0YXJ0T2ZWYXJpYWJsZXMsIHRoaXMuX2luZGV4ZWRWYXJpYWJsZXMsIFwiaW5kZXhlZFwiKVxuICAgIHJldHVybiBjaGlsZHJlbkFycmF5LmNvbmNhdCh2YXJpYWJsZXMpXG4gIH1cblxuICBnZXRJZCgpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLl9pZFxuICB9XG5cbiAgZ2V0VmFsdWUoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5fdmFsdWVcbiAgfVxuXG4gIGhhc0NoaWxkcmVuKCk6IGJvb2xlYW4ge1xuICAgIC8vIG9ubHkgdmFyaWFibGVzIHdpdGggcmVmZXJlbmNlID4gMCBoYXZlIGNoaWxkcmVuLlxuICAgIHJldHVybiB0aGlzLnJlZmVyZW5jZSA+IDBcbiAgfVxuXG4gIGFzeW5jIF9mZXRjaFZhcmlhYmxlcyhzdGFydD86IG51bWJlciwgY291bnQ/OiBudW1iZXIsIGZpbHRlcj86IFwiaW5kZXhlZFwiIHwgXCJuYW1lZFwiKTogUHJvbWlzZTxJVmFyaWFibGVbXT4ge1xuICAgIGNvbnN0IHByb2Nlc3MgPSB0aGlzLnByb2Nlc3NcbiAgICBpbnZhcmlhbnQocHJvY2VzcylcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2U6IERlYnVnUHJvdG9jb2wuVmFyaWFibGVzUmVzcG9uc2UgPSBhd2FpdCBwcm9jZXNzLnNlc3Npb24udmFyaWFibGVzKHtcbiAgICAgICAgdmFyaWFibGVzUmVmZXJlbmNlOiB0aGlzLnJlZmVyZW5jZSxcbiAgICAgICAgc3RhcnQsXG4gICAgICAgIGNvdW50LFxuICAgICAgICBmaWx0ZXIsXG4gICAgICB9KVxuICAgICAgY29uc3QgdmFyaWFibGVzID0gZGlzdGluY3QoXG4gICAgICAgIHJlc3BvbnNlLmJvZHkudmFyaWFibGVzLmZpbHRlcigodikgPT4gdiAhPSBudWxsICYmIHYubmFtZSksXG4gICAgICAgICh2KSA9PiB2Lm5hbWVcbiAgICAgIClcbiAgICAgIHJldHVybiB2YXJpYWJsZXMubWFwKFxuICAgICAgICAodikgPT5cbiAgICAgICAgICBuZXcgVmFyaWFibGUoXG4gICAgICAgICAgICB0aGlzLnByb2Nlc3MsXG4gICAgICAgICAgICB0aGlzLFxuICAgICAgICAgICAgdi52YXJpYWJsZXNSZWZlcmVuY2UsXG4gICAgICAgICAgICB2Lm5hbWUsXG4gICAgICAgICAgICB2LmV2YWx1YXRlTmFtZSxcbiAgICAgICAgICAgIHYudmFsdWUsXG4gICAgICAgICAgICB2Lm5hbWVkVmFyaWFibGVzLFxuICAgICAgICAgICAgdi5pbmRleGVkVmFyaWFibGVzLFxuICAgICAgICAgICAgdi5wcmVzZW50YXRpb25IaW50LFxuICAgICAgICAgICAgdi50eXBlXG4gICAgICAgICAgKVxuICAgICAgKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBbbmV3IFZhcmlhYmxlKHRoaXMucHJvY2VzcywgdGhpcywgMCwgbnVsbCwgZS5tZXNzYWdlLCBcIlwiLCAwLCAwLCB7IGtpbmQ6IFwidmlydHVhbFwiIH0sIG51bGwsIGZhbHNlKV1cbiAgICB9XG4gIH1cblxuICAvLyBUaGUgYWRhcHRlciBleHBsaWNpdGx5IHNlbnRzIHRoZSBjaGlsZHJlbiBjb3VudCBvZiBhbiBleHByZXNzaW9uIG9ubHkgaWYgdGhlcmUgYXJlIGxvdHMgb2YgY2hpbGRyZW4gd2hpY2ggc2hvdWxkIGJlIGNodW5rZWQuXG4gIGdldCBnZXRDaGlsZHJlbkluQ2h1bmtzKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBCb29sZWFuKHRoaXMuX2luZGV4ZWRWYXJpYWJsZXMpXG4gIH1cblxuICBzZXRWYWx1ZSh2YWx1ZTogc3RyaW5nKSB7XG4gICAgdGhpcy5fdmFsdWUgPSB2YWx1ZVxuICAgIEV4cHJlc3Npb25Db250YWluZXIuYWxsVmFsdWVzLnNldCh0aGlzLmdldElkKCksIHZhbHVlKVxuICB9XG5cbiAgdG9TdHJpbmcoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5fdmFsdWVcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRXhwcmVzc2lvbiBleHRlbmRzIEV4cHJlc3Npb25Db250YWluZXIgaW1wbGVtZW50cyBJRXZhbHVhdGFibGVFeHByZXNzaW9uIHtcbiAgc3RhdGljIERFRkFVTFRfVkFMVUUgPSBcIm5vdCBhdmFpbGFibGVcIlxuXG4gIGF2YWlsYWJsZTogYm9vbGVhblxuICBfdHlwZTogP3N0cmluZ1xuICBuYW1lOiBzdHJpbmdcblxuICBjb25zdHJ1Y3RvcihuYW1lOiBzdHJpbmcsIGlkPzogc3RyaW5nID0gdXVpZC52NCgpKSB7XG4gICAgc3VwZXIobnVsbCwgMCwgaWQpXG4gICAgdGhpcy5uYW1lID0gbmFtZVxuICAgIHRoaXMuYXZhaWxhYmxlID0gZmFsc2VcbiAgICB0aGlzLl90eXBlID0gbnVsbFxuICAgIC8vIG5hbWUgaXMgbm90IHNldCBpZiB0aGUgZXhwcmVzc2lvbiBpcyBqdXN0IGJlaW5nIGFkZGVkXG4gICAgLy8gaW4gdGhhdCBjYXNlIGRvIG5vdCBzZXQgZGVmYXVsdCB2YWx1ZSB0byBwcmV2ZW50IGZsYXNoaW5nICMxNDQ5OVxuICAgIGlmIChuYW1lKSB7XG4gICAgICB0aGlzLl92YWx1ZSA9IEV4cHJlc3Npb24uREVGQVVMVF9WQUxVRVxuICAgIH1cbiAgfVxuXG4gIGdldCB0eXBlKCk6ID9zdHJpbmcge1xuICAgIHJldHVybiB0aGlzLl90eXBlXG4gIH1cblxuICBhc3luYyBldmFsdWF0ZShwcm9jZXNzOiA/SVByb2Nlc3MsIHN0YWNrRnJhbWU6ID9JU3RhY2tGcmFtZSwgY29udGV4dDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHByb2Nlc3MgPT0gbnVsbCB8fCAoc3RhY2tGcmFtZSA9PSBudWxsICYmIGNvbnRleHQgIT09IFwicmVwbFwiKSkge1xuICAgICAgdGhpcy5fdmFsdWUgPSBjb250ZXh0ID09PSBcInJlcGxcIiA/IFwiUGxlYXNlIHN0YXJ0IGEgZGVidWcgc2Vzc2lvbiB0byBldmFsdWF0ZVwiIDogRXhwcmVzc2lvbi5ERUZBVUxUX1ZBTFVFXG4gICAgICB0aGlzLmF2YWlsYWJsZSA9IGZhbHNlXG4gICAgICB0aGlzLnJlZmVyZW5jZSA9IDBcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIHRoaXMucHJvY2VzcyA9IHByb2Nlc3NcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVzcG9uc2U6IERlYnVnUHJvdG9jb2wuRXZhbHVhdGVSZXNwb25zZSA9IGF3YWl0IHByb2Nlc3Muc2Vzc2lvbi5ldmFsdWF0ZSh7XG4gICAgICAgIGV4cHJlc3Npb246IHRoaXMubmFtZSxcbiAgICAgICAgZnJhbWVJZDogc3RhY2tGcmFtZSA/IHN0YWNrRnJhbWUuZnJhbWVJZCA6IHVuZGVmaW5lZCxcbiAgICAgICAgY29udGV4dCxcbiAgICAgIH0pXG5cbiAgICAgIHRoaXMuYXZhaWxhYmxlID0gcmVzcG9uc2UgIT0gbnVsbCAmJiByZXNwb25zZS5ib2R5ICE9IG51bGxcbiAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5ib2R5KSB7XG4gICAgICAgIHRoaXMuX3ZhbHVlID0gcmVzcG9uc2UuYm9keS5yZXN1bHRcbiAgICAgICAgdGhpcy5yZWZlcmVuY2UgPSByZXNwb25zZS5ib2R5LnZhcmlhYmxlc1JlZmVyZW5jZSB8fCAwXG4gICAgICAgIHRoaXMuX25hbWVkVmFyaWFibGVzID0gcmVzcG9uc2UuYm9keS5uYW1lZFZhcmlhYmxlcyB8fCAwXG4gICAgICAgIHRoaXMuX2luZGV4ZWRWYXJpYWJsZXMgPSByZXNwb25zZS5ib2R5LmluZGV4ZWRWYXJpYWJsZXMgfHwgMFxuICAgICAgICB0aGlzLl90eXBlID0gcmVzcG9uc2UuYm9keS50eXBlXG4gICAgICB9XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICB0aGlzLl92YWx1ZSA9IGVyci5tZXNzYWdlXG4gICAgICB0aGlzLmF2YWlsYWJsZSA9IGZhbHNlXG4gICAgICB0aGlzLnJlZmVyZW5jZSA9IDBcbiAgICB9XG4gIH1cblxuICB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgIHJldHVybiBgJHt0aGlzLm5hbWV9XFxuJHt0aGlzLl92YWx1ZX1gXG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIFZhcmlhYmxlIGV4dGVuZHMgRXhwcmVzc2lvbkNvbnRhaW5lciBpbXBsZW1lbnRzIElWYXJpYWJsZSB7XG4gIHBhcmVudDogRXhwcmVzc2lvbkNvbnRhaW5lclxuICBuYW1lOiBzdHJpbmdcbiAgZXZhbHVhdGVOYW1lOiA/c3RyaW5nXG4gIHByZXNlbnRhdGlvbkhpbnQ6ID9EZWJ1Z1Byb3RvY29sLlZhcmlhYmxlUHJlc2VudGF0aW9uSGludFxuICBfdHlwZTogP3N0cmluZ1xuICBhdmFpbGFibGU6IGJvb2xlYW5cblxuICBjb25zdHJ1Y3RvcihcbiAgICBwcm9jZXNzOiA/SVByb2Nlc3MsXG4gICAgcGFyZW50OiBFeHByZXNzaW9uQ29udGFpbmVyLFxuICAgIHJlZmVyZW5jZTogbnVtYmVyLFxuICAgIG5hbWU6ID9zdHJpbmcsXG4gICAgZXZhbHVhdGVOYW1lOiA/c3RyaW5nLFxuICAgIHZhbHVlOiBzdHJpbmcsXG4gICAgbmFtZWRWYXJpYWJsZXM6ID9udW1iZXIsXG4gICAgaW5kZXhlZFZhcmlhYmxlczogP251bWJlcixcbiAgICBwcmVzZW50YXRpb25IaW50OiA/RGVidWdQcm90b2NvbC5WYXJpYWJsZVByZXNlbnRhdGlvbkhpbnQsXG4gICAgdHlwZTogP3N0cmluZyxcbiAgICBhdmFpbGFibGU/OiBib29sZWFuID0gdHJ1ZSxcbiAgICBfc3RhcnRPZlZhcmlhYmxlczogP251bWJlclxuICApIHtcbiAgICBzdXBlcihcbiAgICAgIHByb2Nlc3MsXG4gICAgICByZWZlcmVuY2UsXG4gICAgICAvLyBmbG93bGludC1uZXh0LWxpbmUgc2tldGNoeS1udWxsLXN0cmluZzpvZmZcbiAgICAgIGB2YXJpYWJsZToke3BhcmVudC5nZXRJZCgpfToke25hbWUgfHwgXCJub19uYW1lXCJ9YCxcbiAgICAgIG5hbWVkVmFyaWFibGVzLFxuICAgICAgaW5kZXhlZFZhcmlhYmxlcyxcbiAgICAgIF9zdGFydE9mVmFyaWFibGVzXG4gICAgKVxuICAgIHRoaXMucGFyZW50ID0gcGFyZW50XG4gICAgdGhpcy5uYW1lID0gbmFtZSA9PSBudWxsID8gXCJub19uYW1lXCIgOiBuYW1lXG4gICAgdGhpcy5ldmFsdWF0ZU5hbWUgPSBldmFsdWF0ZU5hbWVcbiAgICB0aGlzLnByZXNlbnRhdGlvbkhpbnQgPSBwcmVzZW50YXRpb25IaW50XG4gICAgdGhpcy5fdHlwZSA9IHR5cGVcbiAgICB0aGlzLmF2YWlsYWJsZSA9IGF2YWlsYWJsZVxuICAgIHRoaXMuX3ZhbHVlID0gdmFsdWVcbiAgfVxuXG4gIGdldCB0eXBlKCk6ID9zdHJpbmcge1xuICAgIHJldHVybiB0aGlzLl90eXBlXG4gIH1cblxuICBnZXQgZ3JhbW1hck5hbWUoKTogP3N0cmluZyB7XG4gICAgaWYgKHRoaXMucHJvY2VzcyA9PSBudWxsKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgICByZXR1cm4gdGhpcy5wcm9jZXNzLmNvbmZpZ3VyYXRpb24uZ3JhbW1hck5hbWVcbiAgfVxuXG4gIGFzeW5jIHNldFZhcmlhYmxlKHZhbHVlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBwcm9jZXNzID0gbnVsbHRocm93cyh0aGlzLnByb2Nlc3MpXG4gICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX0VESVRfVkFSSUFCTEUsIHtcbiAgICAgIGxhbmd1YWdlOiBwcm9jZXNzLmNvbmZpZ3VyYXRpb24uYWRhcHRlclR5cGUsXG4gICAgfSlcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHByb2Nlc3Muc2Vzc2lvbi5zZXRWYXJpYWJsZSh7XG4gICAgICBuYW1lOiBudWxsdGhyb3dzKHRoaXMubmFtZSksXG4gICAgICB2YWx1ZSxcbiAgICAgIHZhcmlhYmxlc1JlZmVyZW5jZTogdGhpcy5wYXJlbnQucmVmZXJlbmNlLFxuICAgIH0pXG4gICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLmJvZHkpIHtcbiAgICAgIHRoaXMuX3ZhbHVlID0gcmVzcG9uc2UuYm9keS52YWx1ZVxuICAgICAgdGhpcy5fdHlwZSA9IHJlc3BvbnNlLmJvZHkudHlwZSA9PSBudWxsID8gdGhpcy5fdHlwZSA6IHJlc3BvbnNlLmJvZHkudHlwZVxuICAgICAgdGhpcy5yZWZlcmVuY2UgPSByZXNwb25zZS5ib2R5LnZhcmlhYmxlc1JlZmVyZW5jZSB8fCAwXG4gICAgICB0aGlzLl9uYW1lZFZhcmlhYmxlcyA9IHJlc3BvbnNlLmJvZHkubmFtZWRWYXJpYWJsZXMgfHwgMFxuICAgICAgdGhpcy5faW5kZXhlZFZhcmlhYmxlcyA9IHJlc3BvbnNlLmJvZHkuaW5kZXhlZFZhcmlhYmxlcyB8fCAwXG4gICAgfVxuICB9XG5cbiAgY2FuU2V0VmFyaWFibGUoKTogYm9vbGVhbiB7XG4gICAgY29uc3QgcHJvYyA9IHRoaXMucHJvY2Vzc1xuICAgIGlmIChwcm9jID09IG51bGwpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cblxuICAgIGNvbnN0IHN1cHBvcnRzU2V0VmFyaWFibGUgPSBCb29sZWFuKHByb2Muc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNTZXRWYXJpYWJsZSlcblxuICAgIC8vIFdlIGNhbid0IHNldCB2YXJpYWJsZXMgaWYgdGhlIHRhcmdldCBpcyByZWFkIG9ubHkuXG4gICAgLy8gV2UgYWxzbyByZXF1aXJlIGEgdmFyaWFibGVzIHJlZmVyZW5jZSBmb3IgdGhlIHBhcmVudCBmb3IgdGhlIHByb3RvY29sLFxuICAgIC8vIGFuZCBjdXJyZW50bHkgb25seSBzZXQgb24gbGVhdmVzICh2YXJpYWJsZXMgd2l0aCBubyBjaGlsZHJlbikgYmVjYXVzZVxuICAgIC8vIHRoaXMgbGF5ZXIgZG9lc24ndCBrbm93IGhvdyB0byBwYXJzZSBpbml0aWFsaXplciBleHByZXNzaW9ucyBmb3Igc2V0dGluZ1xuICAgIC8vIHRoZSB2YWx1ZSBvZiBjb21wbGV4IG9iamVjdHMgb3IgYXJyYXlzLlxuICAgIC8vIFRPRE86IEl0J2QgYmUgbmljZSB0byBiZSBhYmxlIHRvIHNldCBhcnJheSBpZGVudGl0aWVzIGhlcmUgbGlrZTogYSA9IHsxLCAyLCAzfS5cbiAgICBjb25zdCBpc1JlYWRPbmx5VGFyZ2V0ID0gQm9vbGVhbihwcm9jLmNvbmZpZ3VyYXRpb24uaXNSZWFkT25seSlcbiAgICBjb25zdCBoYXNWYWxpZFBhcmVudFJlZmVyZW5jZSA9XG4gICAgICB0aGlzLnBhcmVudC5yZWZlcmVuY2UgIT0gbnVsbCAmJiAhTnVtYmVyLmlzTmFOKHRoaXMucGFyZW50LnJlZmVyZW5jZSkgJiYgdGhpcy5wYXJlbnQucmVmZXJlbmNlID49IDBcbiAgICByZXR1cm4gIWlzUmVhZE9ubHlUYXJnZXQgJiYgc3VwcG9ydHNTZXRWYXJpYWJsZSAmJiBoYXNWYWxpZFBhcmVudFJlZmVyZW5jZSAmJiAhdGhpcy5oYXNDaGlsZHJlbigpXG4gIH1cblxuICB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgIHJldHVybiBgJHt0aGlzLm5hbWV9OiAke3RoaXMuX3ZhbHVlfWBcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgU2NvcGUgZXh0ZW5kcyBFeHByZXNzaW9uQ29udGFpbmVyIGltcGxlbWVudHMgSVNjb3BlIHtcbiAgK25hbWU6IHN0cmluZ1xuICArZXhwZW5zaXZlOiBib29sZWFuXG4gICtyYW5nZTogP2F0b20kUmFuZ2VcblxuICBjb25zdHJ1Y3RvcihcbiAgICBzdGFja0ZyYW1lOiBJU3RhY2tGcmFtZSxcbiAgICBpbmRleDogbnVtYmVyLFxuICAgIG5hbWU6IHN0cmluZyxcbiAgICByZWZlcmVuY2U6IG51bWJlcixcbiAgICBleHBlbnNpdmU6IGJvb2xlYW4sXG4gICAgbmFtZWRWYXJpYWJsZXM6ID9udW1iZXIsXG4gICAgaW5kZXhlZFZhcmlhYmxlczogP251bWJlcixcbiAgICByYW5nZTogP2F0b20kUmFuZ2VcbiAgKSB7XG4gICAgc3VwZXIoXG4gICAgICBzdGFja0ZyYW1lLnRocmVhZC5wcm9jZXNzLFxuICAgICAgcmVmZXJlbmNlLFxuICAgICAgYHNjb3BlOiR7c3RhY2tGcmFtZS5nZXRJZCgpfToke25hbWV9OiR7aW5kZXh9YCxcbiAgICAgIG5hbWVkVmFyaWFibGVzLFxuICAgICAgaW5kZXhlZFZhcmlhYmxlc1xuICAgIClcbiAgICB0aGlzLm5hbWUgPSBuYW1lXG4gICAgdGhpcy5leHBlbnNpdmUgPSBleHBlbnNpdmVcbiAgICB0aGlzLnJhbmdlID0gcmFuZ2VcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgU3RhY2tGcmFtZSBpbXBsZW1lbnRzIElTdGFja0ZyYW1lIHtcbiAgc2NvcGVzOiA/UHJvbWlzZTxTY29wZVtdPlxuICB0aHJlYWQ6IElUaHJlYWRcbiAgZnJhbWVJZDogbnVtYmVyXG4gIHNvdXJjZTogSVNvdXJjZVxuICBuYW1lOiBzdHJpbmdcbiAgcHJlc2VudGF0aW9uSGludDogP3N0cmluZ1xuICByYW5nZTogYXRvbSRSYW5nZVxuICBpbmRleDogbnVtYmVyXG5cbiAgY29uc3RydWN0b3IoXG4gICAgdGhyZWFkOiBJVGhyZWFkLFxuICAgIGZyYW1lSWQ6IG51bWJlcixcbiAgICBzb3VyY2U6IElTb3VyY2UsXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIHByZXNlbnRhdGlvbkhpbnQ6ID9zdHJpbmcsXG4gICAgcmFuZ2U6IGF0b20kUmFuZ2UsXG4gICAgaW5kZXg6IG51bWJlclxuICApIHtcbiAgICB0aGlzLnRocmVhZCA9IHRocmVhZFxuICAgIHRoaXMuZnJhbWVJZCA9IGZyYW1lSWRcbiAgICB0aGlzLnNvdXJjZSA9IHNvdXJjZVxuICAgIHRoaXMubmFtZSA9IG5hbWVcbiAgICB0aGlzLnByZXNlbnRhdGlvbkhpbnQgPSBwcmVzZW50YXRpb25IaW50XG4gICAgdGhpcy5yYW5nZSA9IHJhbmdlXG4gICAgdGhpcy5pbmRleCA9IGluZGV4XG4gICAgdGhpcy5zY29wZXMgPSBudWxsXG4gIH1cblxuICBnZXRJZCgpOiBzdHJpbmcge1xuICAgIHJldHVybiBgc3RhY2tmcmFtZToke3RoaXMudGhyZWFkLmdldElkKCl9OiR7dGhpcy5mcmFtZUlkfToke3RoaXMuaW5kZXh9YFxuICB9XG5cbiAgYXN5bmMgZ2V0U2NvcGVzKGZvcmNlUmVmcmVzaDogYm9vbGVhbik6IFByb21pc2U8SVNjb3BlW10+IHtcbiAgICBpZiAodGhpcy5zY29wZXMgPT0gbnVsbCB8fCBmb3JjZVJlZnJlc2gpIHtcbiAgICAgIHRoaXMuc2NvcGVzID0gdGhpcy5fZ2V0U2NvcGVzSW1wbCgpXG4gICAgfVxuICAgIHJldHVybiAodGhpcy5zY29wZXM6IGFueSlcbiAgfVxuXG4gIGFzeW5jIF9nZXRTY29wZXNJbXBsKCk6IFByb21pc2U8U2NvcGVbXT4ge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB7XG4gICAgICAgIGJvZHk6IHsgc2NvcGVzIH0sXG4gICAgICB9ID0gYXdhaXQgdGhpcy50aHJlYWQucHJvY2Vzcy5zZXNzaW9uLnNjb3Blcyh7XG4gICAgICAgIGZyYW1lSWQ6IHRoaXMuZnJhbWVJZCxcbiAgICAgIH0pXG4gICAgICByZXR1cm4gc2NvcGVzLm1hcChcbiAgICAgICAgKHJzLCBpbmRleCkgPT5cbiAgICAgICAgICBuZXcgU2NvcGUoXG4gICAgICAgICAgICB0aGlzLFxuICAgICAgICAgICAgaW5kZXgsXG4gICAgICAgICAgICBycy5uYW1lLFxuICAgICAgICAgICAgcnMudmFyaWFibGVzUmVmZXJlbmNlLFxuICAgICAgICAgICAgcnMuZXhwZW5zaXZlLFxuICAgICAgICAgICAgcnMubmFtZWRWYXJpYWJsZXMsXG4gICAgICAgICAgICBycy5pbmRleGVkVmFyaWFibGVzLFxuICAgICAgICAgICAgcnMubGluZSAhPSBudWxsXG4gICAgICAgICAgICAgID8gbmV3IFJhbmdlKFxuICAgICAgICAgICAgICAgICAgW3JzLmxpbmUgLSAxLCAocnMuY29sdW1uICE9IG51bGwgPyBycy5jb2x1bW4gOiAxKSAtIDFdLFxuICAgICAgICAgICAgICAgICAgWyhycy5lbmRMaW5lICE9IG51bGwgPyBycy5lbmRMaW5lIDogcnMubGluZSkgLSAxLCAocnMuZW5kQ29sdW1uICE9IG51bGwgPyBycy5lbmRDb2x1bW4gOiAxKSAtIDFdXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICA6IG51bGxcbiAgICAgICAgICApXG4gICAgICApXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICByZXR1cm4gW11cbiAgICB9XG4gIH1cblxuICBhc3luYyBnZXRNb3N0U3BlY2lmaWNTY29wZXMocmFuZ2U6IGF0b20kUmFuZ2UpOiBQcm9taXNlPElTY29wZVtdPiB7XG4gICAgY29uc3Qgc2NvcGVzOiBBcnJheTxJU2NvcGU+ID0gKGF3YWl0IHRoaXMuZ2V0U2NvcGVzKGZhbHNlKSkuZmlsdGVyKChzKSA9PiAhcy5leHBlbnNpdmUpXG4gICAgY29uc3QgaGF2ZVJhbmdlSW5mbyA9IHNjb3Blcy5zb21lKChzKSA9PiBzLnJhbmdlICE9IG51bGwpXG4gICAgaWYgKCFoYXZlUmFuZ2VJbmZvKSB7XG4gICAgICByZXR1cm4gc2NvcGVzXG4gICAgfVxuXG4gICAgY29uc3Qgc2NvcGVzQ29udGFpbmluZ1JhbmdlID0gc2NvcGVzXG4gICAgICAuZmlsdGVyKChzY29wZSkgPT4gc2NvcGUucmFuZ2UgIT0gbnVsbCAmJiBzY29wZS5yYW5nZS5jb250YWluc1JhbmdlKHJhbmdlKSlcbiAgICAgIC5zb3J0KChmaXJzdCwgc2Vjb25kKSA9PiB7XG4gICAgICAgIGNvbnN0IGZpcnN0UmFuZ2UgPSBudWxsdGhyb3dzKGZpcnN0LnJhbmdlKVxuICAgICAgICBjb25zdCBzZWNvbmRSYW5nZSA9IG51bGx0aHJvd3Moc2Vjb25kLnJhbmdlKVxuICAgICAgICAvLyBwcmV0dGllci1pZ25vcmVcbiAgICAgICAgcmV0dXJuIChmaXJzdFJhbmdlLmVuZC5yb3cgLSBmaXJzdFJhbmdlLnN0YXJ0LnJvdykgLVxuICAgICAgICAgIChzZWNvbmRSYW5nZS5lbmQucm93IC0gc2Vjb25kUmFuZ2UuZW5kLnJvdyk7XG4gICAgICB9KVxuICAgIHJldHVybiBzY29wZXNDb250YWluaW5nUmFuZ2UubGVuZ3RoID8gc2NvcGVzQ29udGFpbmluZ1JhbmdlIDogc2NvcGVzXG4gIH1cblxuICBhc3luYyByZXN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMudGhyZWFkLnByb2Nlc3Muc2Vzc2lvbi5yZXN0YXJ0RnJhbWUoeyBmcmFtZUlkOiB0aGlzLmZyYW1lSWQgfSwgdGhpcy50aHJlYWQudGhyZWFkSWQpXG4gIH1cblxuICB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgIHJldHVybiBgJHt0aGlzLm5hbWV9ICgke3RoaXMuc291cmNlLmluTWVtb3J5ID8gbnVsbHRocm93cyh0aGlzLnNvdXJjZS5uYW1lKSA6IHRoaXMuc291cmNlLnVyaX06JHtcbiAgICAgIHRoaXMucmFuZ2Uuc3RhcnQucm93XG4gICAgfSlgXG4gIH1cblxuICBhc3luYyBvcGVuSW5FZGl0b3IoKTogUHJvbWlzZTw/YXRvbSRUZXh0RWRpdG9yPiB7XG4gICAgY29uc3QgcmF3UGF0aCA9IHRoaXMuc291cmNlLnJhdy5wYXRoXG4gICAgY29uc3QgbG9jYWxSYXdQYXRoID0gbnVjbGlkZVVyaS5nZXRQYXRoKHJhd1BhdGggfHwgXCJcIilcbiAgICBpZiAoXG4gICAgICByYXdQYXRoICE9IG51bGwgJiZcbiAgICAgIGxvY2FsUmF3UGF0aCAhPT0gXCJcIiAmJlxuICAgICAgKGF3YWl0IGdldFZTQ29kZURlYnVnZ2VyQWRhcHRlclNlcnZpY2VCeU51Y2xpZGVVcmkocmF3UGF0aCkuZXhpc3RzKGxvY2FsUmF3UGF0aCkpXG4gICAgKSB7XG4gICAgICByZXR1cm4gb3BlblNvdXJjZUxvY2F0aW9uKHJhd1BhdGgsIHRoaXMucmFuZ2Uuc3RhcnQucm93KVxuICAgIH1cbiAgICBpZiAodGhpcy5zb3VyY2UuYXZhaWxhYmxlKSB7XG4gICAgICByZXR1cm4gb3BlblNvdXJjZUxvY2F0aW9uKHRoaXMuc291cmNlLnVyaSwgdGhpcy5yYW5nZS5zdGFydC5yb3cpXG4gICAgfVxuICAgIHJldHVybiBudWxsXG4gIH1cbn1cblxudHlwZSBDYWxsU3RhY2sgPSB7XG4gIHZhbGlkOiBib29sZWFuLFxuICBjYWxsRnJhbWVzOiBJU3RhY2tGcmFtZVtdLFxufVxuXG5leHBvcnQgY2xhc3MgVGhyZWFkIGltcGxlbWVudHMgSVRocmVhZCB7XG4gIF9jYWxsU3RhY2s6IENhbGxTdGFja1xuICBfcmVmcmVzaEluUHJvZ3Jlc3M6IGJvb2xlYW5cbiAgc3RvcHBlZERldGFpbHM6ID9JUmF3U3RvcHBlZERldGFpbHNcbiAgc3RvcHBlZDogYm9vbGVhblxuICArcHJvY2VzczogSVByb2Nlc3NcbiAgK3RocmVhZElkOiBudW1iZXJcbiAgbmFtZTogc3RyaW5nXG5cbiAgY29uc3RydWN0b3IocHJvY2VzczogSVByb2Nlc3MsIG5hbWU6IHN0cmluZywgdGhyZWFkSWQ6IG51bWJlcikge1xuICAgIHRoaXMucHJvY2VzcyA9IHByb2Nlc3NcbiAgICB0aGlzLm5hbWUgPSBuYW1lXG4gICAgdGhpcy50aHJlYWRJZCA9IHRocmVhZElkXG4gICAgdGhpcy5zdG9wcGVkRGV0YWlscyA9IG51bGxcbiAgICB0aGlzLl9jYWxsU3RhY2sgPSB0aGlzLl9nZXRFbXB0eUNhbGxzdGFja1N0YXRlKClcbiAgICB0aGlzLnN0b3BwZWQgPSBmYWxzZVxuICAgIHRoaXMuX3JlZnJlc2hJblByb2dyZXNzID0gZmFsc2VcbiAgfVxuXG4gIF9nZXRFbXB0eUNhbGxzdGFja1N0YXRlKCk6IENhbGxTdGFjayB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHZhbGlkOiBmYWxzZSxcbiAgICAgIGNhbGxGcmFtZXM6IFtdLFxuICAgIH1cbiAgfVxuXG4gIF9pc0NhbGxzdGFja0xvYWRlZCgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5fY2FsbFN0YWNrLnZhbGlkXG4gIH1cblxuICBfaXNDYWxsc3RhY2tGdWxseUxvYWRlZCgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5faXNDYWxsc3RhY2tMb2FkZWQoKSAmJlxuICAgICAgdGhpcy5zdG9wcGVkRGV0YWlscyAhPSBudWxsICYmXG4gICAgICB0aGlzLnN0b3BwZWREZXRhaWxzLnRvdGFsRnJhbWVzICE9IG51bGwgJiZcbiAgICAgICFOdW1iZXIuaXNOYU4odGhpcy5zdG9wcGVkRGV0YWlscy50b3RhbEZyYW1lcykgJiZcbiAgICAgIHRoaXMuc3RvcHBlZERldGFpbHMudG90YWxGcmFtZXMgPj0gMCAmJlxuICAgICAgdGhpcy5fY2FsbFN0YWNrLmNhbGxGcmFtZXMubGVuZ3RoID49IHRoaXMuc3RvcHBlZERldGFpbHMudG90YWxGcmFtZXNcbiAgICApXG4gIH1cblxuICBnZXRJZCgpOiBzdHJpbmcge1xuICAgIHJldHVybiBgdGhyZWFkOiR7dGhpcy5wcm9jZXNzLmdldElkKCl9OiR7dGhpcy50aHJlYWRJZH1gXG4gIH1cblxuICBhZGRpdGlvbmFsRnJhbWVzQXZhaWxhYmxlKGN1cnJlbnRGcmFtZUNvdW50OiBudW1iZXIpOiBib29sZWFuIHtcbiAgICBpZiAodGhpcy5fY2FsbFN0YWNrLmNhbGxGcmFtZXMubGVuZ3RoID4gY3VycmVudEZyYW1lQ291bnQpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuICAgIGNvbnN0IHN1cHBvcnRzRGVsYXlMb2FkaW5nID0gbnVsbHRocm93cyh0aGlzLnByb2Nlc3MpLnNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzRGVsYXllZFN0YWNrVHJhY2VMb2FkaW5nID09PSB0cnVlXG4gICAgaWYgKFxuICAgICAgc3VwcG9ydHNEZWxheUxvYWRpbmcgJiZcbiAgICAgIHRoaXMuc3RvcHBlZERldGFpbHMgIT0gbnVsbCAmJlxuICAgICAgdGhpcy5zdG9wcGVkRGV0YWlscy50b3RhbEZyYW1lcyAhPSBudWxsICYmXG4gICAgICB0aGlzLnN0b3BwZWREZXRhaWxzLnRvdGFsRnJhbWVzID4gY3VycmVudEZyYW1lQ291bnRcbiAgICApIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICBjbGVhckNhbGxTdGFjaygpOiB2b2lkIHtcbiAgICB0aGlzLl9jYWxsU3RhY2sgPSB0aGlzLl9nZXRFbXB0eUNhbGxzdGFja1N0YXRlKClcbiAgfVxuXG4gIGdldENhbGxTdGFja1RvcEZyYW1lKCk6ID9JU3RhY2tGcmFtZSB7XG4gICAgcmV0dXJuIHRoaXMuX2lzQ2FsbHN0YWNrTG9hZGVkKCkgPyB0aGlzLl9jYWxsU3RhY2suY2FsbEZyYW1lc1swXSA6IG51bGxcbiAgfVxuXG4gIGdldEZ1bGxDYWxsU3RhY2sobGV2ZWxzPzogbnVtYmVyKTogT2JzZXJ2YWJsZTxFeHBlY3RlZDxJU3RhY2tGcmFtZVtdPj4ge1xuICAgIGlmIChcbiAgICAgIHRoaXMuX3JlZnJlc2hJblByb2dyZXNzIHx8XG4gICAgICB0aGlzLl9pc0NhbGxzdGFja0Z1bGx5TG9hZGVkKCkgfHxcbiAgICAgIChsZXZlbHMgIT0gbnVsbCAmJiB0aGlzLl9pc0NhbGxzdGFja0xvYWRlZCgpICYmIHRoaXMuX2NhbGxTdGFjay5jYWxsRnJhbWVzLmxlbmd0aCA+PSBsZXZlbHMpXG4gICAgKSB7XG4gICAgICAvLyBXZSBoYXZlIGEgc3VmZmljZW50IGNhbGwgc3RhY2sgYWxyZWFkeSBsb2FkZWQsIGp1c3QgcmV0dXJuIGl0LlxuICAgICAgcmV0dXJuIE9ic2VydmFibGUub2YoRXhwZWN0LnZhbHVlKHRoaXMuX2NhbGxTdGFjay5jYWxsRnJhbWVzKSlcbiAgICB9XG5cbiAgICAvLyBSZXR1cm4gYSBwZW5kaW5nIHZhbHVlIGFuZCBraWNrIG9mZiB0aGUgZmV0Y2guIFdoZW4gdGhlIGZldGNoXG4gICAgLy8gaXMgZG9uZSwgZW1pdCB0aGUgbmV3IGNhbGwgZnJhbWVzLlxuICAgIHJldHVybiBPYnNlcnZhYmxlLmNvbmNhdChcbiAgICAgIE9ic2VydmFibGUub2YoRXhwZWN0LnBlbmRpbmcoKSksXG4gICAgICBPYnNlcnZhYmxlLmZyb21Qcm9taXNlKHRoaXMucmVmcmVzaENhbGxTdGFjayhsZXZlbHMpKS5zd2l0Y2hNYXAoKCkgPT5cbiAgICAgICAgT2JzZXJ2YWJsZS5vZihFeHBlY3QudmFsdWUodGhpcy5fY2FsbFN0YWNrLmNhbGxGcmFtZXMpKVxuICAgICAgKVxuICAgIClcbiAgfVxuXG4gIGdldENhY2hlZENhbGxTdGFjaygpOiBJU3RhY2tGcmFtZVtdIHtcbiAgICByZXR1cm4gdGhpcy5fY2FsbFN0YWNrLmNhbGxGcmFtZXNcbiAgfVxuXG4gIC8qKlxuICAgKiBRdWVyaWVzIHRoZSBkZWJ1ZyBhZGFwdGVyIGZvciB0aGUgY2FsbHN0YWNrIGFuZCByZXR1cm5zIGEgcHJvbWlzZVxuICAgKiB3aGljaCBjb21wbGV0ZXMgb25jZSB0aGUgY2FsbCBzdGFjayBoYXMgYmVlbiByZXRyaWV2ZWQuXG4gICAqIElmIHRoZSB0aHJlYWQgaXMgbm90IHN0b3BwZWQsIGl0IHJldHVybnMgYSBwcm9taXNlIHRvIGFuIGVtcHR5IGFycmF5LlxuICAgKlxuICAgKiBJZiBzcGVjaWZpZWQsIGxldmVscyBpbmRpY2F0ZXMgdGhlIG1heGltdW0gZGVwdGggb2YgY2FsbCBmcmFtZXMgdG8gZmV0Y2guXG4gICAqL1xuICBhc3luYyByZWZyZXNoQ2FsbFN0YWNrKGxldmVsczogP251bWJlcik6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghdGhpcy5zdG9wcGVkKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCBzdXBwb3J0c0RlbGF5TG9hZGluZyA9IG51bGx0aHJvd3ModGhpcy5wcm9jZXNzKS5zZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c0RlbGF5ZWRTdGFja1RyYWNlTG9hZGluZyA9PT0gdHJ1ZVxuXG4gICAgdGhpcy5fcmVmcmVzaEluUHJvZ3Jlc3MgPSB0cnVlXG4gICAgdHJ5IHtcbiAgICAgIGlmIChzdXBwb3J0c0RlbGF5TG9hZGluZykge1xuICAgICAgICBjb25zdCBzdGFydCA9IHRoaXMuX2NhbGxTdGFjay5jYWxsRnJhbWVzLmxlbmd0aFxuICAgICAgICBjb25zdCBjYWxsU3RhY2sgPSBhd2FpdCB0aGlzLl9nZXRDYWxsU3RhY2tJbXBsKHN0YXJ0LCBsZXZlbHMpXG4gICAgICAgIGlmIChzdGFydCA8IHRoaXMuX2NhbGxTdGFjay5jYWxsRnJhbWVzLmxlbmd0aCkge1xuICAgICAgICAgIC8vIFNldCB0aGUgc3RhY2sgZnJhbWVzIGZvciBleGFjdCBwb3NpdGlvbiB3ZSByZXF1ZXN0ZWQuXG4gICAgICAgICAgLy8gVG8gbWFrZSBzdXJlIG5vIGNvbmN1cnJlbnQgcmVxdWVzdHMgY3JlYXRlIGR1cGxpY2F0ZSBzdGFjayBmcmFtZXMgIzMwNjYwXG4gICAgICAgICAgdGhpcy5fY2FsbFN0YWNrLmNhbGxGcmFtZXMuc3BsaWNlKHN0YXJ0LCB0aGlzLl9jYWxsU3RhY2suY2FsbEZyYW1lcy5sZW5ndGggLSBzdGFydClcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9jYWxsU3RhY2suY2FsbEZyYW1lcyA9IHRoaXMuX2NhbGxTdGFjay5jYWxsRnJhbWVzLmNvbmNhdChjYWxsU3RhY2sgfHwgW10pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBNdXN0IGxvYWQgdGhlIGVudGlyZSBjYWxsIHN0YWNrLCB0aGUgZGVidWdnZXIgYmFja2VuZCBkb2Vzbid0IHN1cHBvcnRcbiAgICAgICAgLy8gZGVsYXllZCBjYWxsIHN0YWNrIGxvYWRpbmcuXG4gICAgICAgIHRoaXMuX2NhbGxTdGFjay5jYWxsRnJhbWVzID0gKGF3YWl0IHRoaXMuX2dldENhbGxTdGFja0ltcGwoMCwgbnVsbCkpIHx8IFtdXG4gICAgICB9XG5cbiAgICAgIHRoaXMuX2NhbGxTdGFjay52YWxpZCA9IHRydWVcbiAgICB9IGZpbmFsbHkge1xuICAgICAgdGhpcy5fcmVmcmVzaEluUHJvZ3Jlc3MgPSBmYWxzZVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIF9nZXRDYWxsU3RhY2tJbXBsKHN0YXJ0RnJhbWU6IG51bWJlciwgbGV2ZWxzOiA/bnVtYmVyKTogUHJvbWlzZTxJU3RhY2tGcmFtZVtdPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHN0YWNrVHJhY2VBcmdzOiBEZWJ1Z1Byb3RvY29sLlN0YWNrVHJhY2VBcmd1bWVudHMgPSB7XG4gICAgICAgIHRocmVhZElkOiB0aGlzLnRocmVhZElkLFxuICAgICAgICBzdGFydEZyYW1lLFxuICAgICAgfVxuXG4gICAgICAvLyBPbmx5IGluY2x1ZGUgbGV2ZWxzIGlmIHNwZWNpZmllZCBhbmQgc3VwcG9ydGVkLiBJZiBsZXZlbHMgaXMgb21pdHRlZCxcbiAgICAgIC8vIHRoZSBkZWJ1ZyBhZGFwdGVyIGlzIHRvIHJldHVybiBhbGwgc3RhY2sgZnJhbWVzLCBwZXIgdGhlIHByb3RvY29sLlxuICAgICAgaWYgKGxldmVscyAhPSBudWxsKSB7XG4gICAgICAgIHN0YWNrVHJhY2VBcmdzLmxldmVscyA9IGxldmVsc1xuICAgICAgfVxuXG4gICAgICBjb25zdCByZXNwb25zZTogRGVidWdQcm90b2NvbC5TdGFja1RyYWNlUmVzcG9uc2UgPSBhd2FpdCB0aGlzLnByb2Nlc3Muc2Vzc2lvbi5zdGFja1RyYWNlKHN0YWNrVHJhY2VBcmdzKVxuICAgICAgaWYgKHJlc3BvbnNlID09IG51bGwgfHwgcmVzcG9uc2UuYm9keSA9PSBudWxsKSB7XG4gICAgICAgIHJldHVybiBbXVxuICAgICAgfVxuICAgICAgaWYgKHRoaXMuc3RvcHBlZERldGFpbHMgIT0gbnVsbCkge1xuICAgICAgICB0aGlzLnN0b3BwZWREZXRhaWxzLnRvdGFsRnJhbWVzID0gcmVzcG9uc2UuYm9keS50b3RhbEZyYW1lc1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVzcG9uc2UuYm9keS5zdGFja0ZyYW1lcy5tYXAoKHJzZiwgaW5kZXgpID0+IHtcbiAgICAgICAgY29uc3Qgc291cmNlID0gdGhpcy5wcm9jZXNzLmdldFNvdXJjZShyc2Yuc291cmNlKVxuXG4gICAgICAgIHJldHVybiBuZXcgU3RhY2tGcmFtZShcbiAgICAgICAgICB0aGlzLFxuICAgICAgICAgIHJzZi5pZCxcbiAgICAgICAgICBzb3VyY2UsXG4gICAgICAgICAgcnNmLm5hbWUsXG4gICAgICAgICAgcnNmLnByZXNlbnRhdGlvbkhpbnQsXG4gICAgICAgICAgLy8gVGhlIFVJIGlzIDAtYmFzZWQgd2hpbGUgVlNQIGlzIDEtYmFzZWQuXG4gICAgICAgICAgbmV3IFJhbmdlKFxuICAgICAgICAgICAgW3JzZi5saW5lIC0gMSwgKHJzZi5jb2x1bW4gfHwgMSkgLSAxXSxcbiAgICAgICAgICAgIFsocnNmLmVuZExpbmUgIT0gbnVsbCA/IHJzZi5lbmRMaW5lIDogcnNmLmxpbmUpIC0gMSwgKHJzZi5lbmRDb2x1bW4gIT0gbnVsbCA/IHJzZi5lbmRDb2x1bW4gOiAxKSAtIDFdXG4gICAgICAgICAgKSxcbiAgICAgICAgICBzdGFydEZyYW1lICsgaW5kZXhcbiAgICAgICAgKVxuICAgICAgfSlcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGlmICh0aGlzLnN0b3BwZWREZXRhaWxzICE9IG51bGwpIHtcbiAgICAgICAgdGhpcy5zdG9wcGVkRGV0YWlscy5mcmFtZXNFcnJvck1lc3NhZ2UgPSBlcnIubWVzc2FnZVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gW11cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyBleGNlcHRpb24gaW5mbyBwcm9taXNlIGlmIHRoZSBleGNlcHRpb24gd2FzIHRocm93biwgb3RoZXJ3aXNlIG51bGxcbiAgICovXG4gIGFzeW5jIGV4Y2VwdGlvbkluZm8oKTogUHJvbWlzZTw/SUV4Y2VwdGlvbkluZm8+IHtcbiAgICBjb25zdCBzZXNzaW9uID0gdGhpcy5wcm9jZXNzLnNlc3Npb25cbiAgICBpZiAodGhpcy5zdG9wcGVkRGV0YWlscyA9PSBudWxsIHx8IHRoaXMuc3RvcHBlZERldGFpbHMucmVhc29uICE9PSBcImV4Y2VwdGlvblwiKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cbiAgICBjb25zdCBzdG9wcGVkRGV0YWlscyA9IHRoaXMuc3RvcHBlZERldGFpbHNcbiAgICBpZiAoIXNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzRXhjZXB0aW9uSW5mb1JlcXVlc3QpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGlkOiBudWxsLFxuICAgICAgICBkZXRhaWxzOiBudWxsLFxuICAgICAgICBkZXNjcmlwdGlvbjogc3RvcHBlZERldGFpbHMuZGVzY3JpcHRpb24sXG4gICAgICAgIGJyZWFrTW9kZTogbnVsbCxcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBleGNlcHRpb246IERlYnVnUHJvdG9jb2wuRXhjZXB0aW9uSW5mb1Jlc3BvbnNlID0gYXdhaXQgc2Vzc2lvbi5leGNlcHRpb25JbmZvKHsgdGhyZWFkSWQ6IHRoaXMudGhyZWFkSWQgfSlcbiAgICBpZiAoZXhjZXB0aW9uID09IG51bGwpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIGlkOiBleGNlcHRpb24uYm9keS5leGNlcHRpb25JZCxcbiAgICAgIGRlc2NyaXB0aW9uOiBleGNlcHRpb24uYm9keS5kZXNjcmlwdGlvbixcbiAgICAgIGJyZWFrTW9kZTogZXhjZXB0aW9uLmJvZHkuYnJlYWtNb2RlLFxuICAgICAgZGV0YWlsczogZXhjZXB0aW9uLmJvZHkuZGV0YWlscyxcbiAgICB9XG4gIH1cblxuICBhc3luYyBuZXh0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9TVEVQX09WRVIpXG4gICAgYXdhaXQgdGhpcy5wcm9jZXNzLnNlc3Npb24ubmV4dCh7IHRocmVhZElkOiB0aGlzLnRocmVhZElkIH0pXG4gIH1cblxuICBhc3luYyBzdGVwSW4oKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX1NURVBfSU5UTylcbiAgICBhd2FpdCB0aGlzLnByb2Nlc3Muc2Vzc2lvbi5zdGVwSW4oeyB0aHJlYWRJZDogdGhpcy50aHJlYWRJZCB9KVxuICB9XG5cbiAgYXN5bmMgc3RlcE91dCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfU1RFUF9PVVQpXG4gICAgYXdhaXQgdGhpcy5wcm9jZXNzLnNlc3Npb24uc3RlcE91dCh7IHRocmVhZElkOiB0aGlzLnRocmVhZElkIH0pXG4gIH1cblxuICBhc3luYyBzdGVwQmFjaygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfU1RFUF9CQUNLKVxuICAgIGF3YWl0IHRoaXMucHJvY2Vzcy5zZXNzaW9uLnN0ZXBCYWNrKHsgdGhyZWFkSWQ6IHRoaXMudGhyZWFkSWQgfSlcbiAgfVxuXG4gIGFzeW5jIGNvbnRpbnVlKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9TVEVQX0NPTlRJTlVFKVxuICAgIGF3YWl0IHRoaXMucHJvY2Vzcy5zZXNzaW9uLmNvbnRpbnVlKHsgdGhyZWFkSWQ6IHRoaXMudGhyZWFkSWQgfSlcbiAgfVxuXG4gIGFzeW5jIHBhdXNlKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9TVEVQX1BBVVNFKVxuICAgIGF3YWl0IHRoaXMucHJvY2Vzcy5zZXNzaW9uLnBhdXNlKHsgdGhyZWFkSWQ6IHRoaXMudGhyZWFkSWQgfSlcbiAgfVxuXG4gIGFzeW5jIHJldmVyc2VDb250aW51ZSgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBhd2FpdCB0aGlzLnByb2Nlc3Muc2Vzc2lvbi5yZXZlcnNlQ29udGludWUoeyB0aHJlYWRJZDogdGhpcy50aHJlYWRJZCB9KVxuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBQcm9jZXNzIGltcGxlbWVudHMgSVByb2Nlc3Mge1xuICBfc291cmNlczogTWFwPHN0cmluZywgSVNvdXJjZT5cbiAgX3RocmVhZHM6IE1hcDxudW1iZXIsIFRocmVhZD5cbiAgX3Nlc3Npb246IElTZXNzaW9uICYgSVRyZWVFbGVtZW50XG4gIF9jb25maWd1cmF0aW9uOiBJUHJvY2Vzc0NvbmZpZ1xuICBfcGVuZGluZ1N0YXJ0OiBib29sZWFuXG4gIF9wZW5kaW5nU3RvcDogYm9vbGVhblxuICBicmVha3BvaW50czogQnJlYWtwb2ludFtdXG4gIGV4Y2VwdGlvbkJyZWFrcG9pbnRzOiBJRXhjZXB0aW9uQnJlYWtwb2ludFtdXG5cbiAgY29uc3RydWN0b3IoY29uZmlndXJhdGlvbjogSVByb2Nlc3NDb25maWcsIHNlc3Npb246IElTZXNzaW9uICYgSVRyZWVFbGVtZW50KSB7XG4gICAgdGhpcy5fY29uZmlndXJhdGlvbiA9IGNvbmZpZ3VyYXRpb25cbiAgICB0aGlzLl9zZXNzaW9uID0gc2Vzc2lvblxuICAgIHRoaXMuX3RocmVhZHMgPSBuZXcgTWFwKClcbiAgICB0aGlzLl9zb3VyY2VzID0gbmV3IE1hcCgpXG4gICAgdGhpcy5fcGVuZGluZ1N0YXJ0ID0gdHJ1ZVxuICAgIHRoaXMuX3BlbmRpbmdTdG9wID0gZmFsc2VcbiAgICB0aGlzLmJyZWFrcG9pbnRzID0gW11cbiAgICB0aGlzLmV4Y2VwdGlvbkJyZWFrcG9pbnRzID0gW11cbiAgfVxuXG4gIGdldCBzb3VyY2VzKCk6IE1hcDxzdHJpbmcsIElTb3VyY2U+IHtcbiAgICByZXR1cm4gdGhpcy5fc291cmNlc1xuICB9XG5cbiAgZ2V0IHNlc3Npb24oKTogSVNlc3Npb24gJiBJVHJlZUVsZW1lbnQge1xuICAgIHJldHVybiB0aGlzLl9zZXNzaW9uXG4gIH1cblxuICBnZXQgY29uZmlndXJhdGlvbigpOiBJUHJvY2Vzc0NvbmZpZyB7XG4gICAgcmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25cbiAgfVxuXG4gIGdldCBkZWJ1Z2dlck1vZGUoKTogRGVidWdnZXJNb2RlVHlwZSB7XG4gICAgaWYgKHRoaXMuX3BlbmRpbmdTdGFydCkge1xuICAgICAgcmV0dXJuIERlYnVnZ2VyTW9kZS5TVEFSVElOR1xuICAgIH1cblxuICAgIGlmICh0aGlzLl9wZW5kaW5nU3RvcCkge1xuICAgICAgcmV0dXJuIERlYnVnZ2VyTW9kZS5TVE9QUElOR1xuICAgIH1cblxuICAgIGlmICh0aGlzLmdldEFsbFRocmVhZHMoKS5zb21lKCh0KSA9PiB0LnN0b3BwZWQpKSB7XG4gICAgICAvLyBUT09EOiBDdXJyZW50bHkgb3VyIFVYIGNvbnRyb2xzIHN1cHBvcnQgcmVzdW1lIGFuZCBhc3luYy1icmVha1xuICAgICAgLy8gb24gYSBwZXItcHJvY2VzcyBiYXNpcyBvbmx5LiBUaGlzIG5lZWRzIHRvIGJlIG1vZGlmaWVkIGhlcmUgaWZcbiAgICAgIC8vIHdlIGFkZCBzdXBwb3J0IGZvciBmcmVlemluZyBhbmQgcmVzdW1pbmcgaW5kaXZpZHVhbCB0aHJlYWRzLlxuICAgICAgcmV0dXJuIERlYnVnZ2VyTW9kZS5QQVVTRURcbiAgICB9XG5cbiAgICByZXR1cm4gRGVidWdnZXJNb2RlLlJVTk5JTkdcbiAgfVxuXG4gIGNsZWFyUHJvY2Vzc1N0YXJ0aW5nRmxhZygpOiB2b2lkIHtcbiAgICB0aGlzLl9wZW5kaW5nU3RhcnQgPSBmYWxzZVxuICB9XG5cbiAgc2V0U3RvcFBlbmRpbmcoKTogdm9pZCB7XG4gICAgdGhpcy5fcGVuZGluZ1N0b3AgPSB0cnVlXG4gIH1cblxuICBnZXRTb3VyY2UocmF3OiA/RGVidWdQcm90b2NvbC5Tb3VyY2UpOiBJU291cmNlIHtcbiAgICBsZXQgc291cmNlID0gbmV3IFNvdXJjZShyYXcsIHRoaXMuZ2V0SWQoKSlcbiAgICBpZiAodGhpcy5fc291cmNlcy5oYXMoc291cmNlLnVyaSkpIHtcbiAgICAgIHNvdXJjZSA9IG51bGx0aHJvd3ModGhpcy5fc291cmNlcy5nZXQoc291cmNlLnVyaSkpXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3NvdXJjZXMuc2V0KHNvdXJjZS51cmksIHNvdXJjZSlcbiAgICB9XG5cbiAgICByZXR1cm4gc291cmNlXG4gIH1cblxuICBnZXRUaHJlYWQodGhyZWFkSWQ6IG51bWJlcik6ID9UaHJlYWQge1xuICAgIHJldHVybiB0aGlzLl90aHJlYWRzLmdldCh0aHJlYWRJZClcbiAgfVxuXG4gIGdldEFsbFRocmVhZHMoKTogSVRocmVhZFtdIHtcbiAgICByZXR1cm4gQXJyYXkuZnJvbSh0aGlzLl90aHJlYWRzLnZhbHVlcygpKVxuICB9XG5cbiAgZ2V0SWQoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5fc2Vzc2lvbi5nZXRJZCgpXG4gIH1cblxuICByYXdTdG9wcGVkVXBkYXRlKGRhdGE6IElSYXdTdG9wcHBlZFVwZGF0ZSk6IHZvaWQge1xuICAgIGNvbnN0IHsgdGhyZWFkSWQsIHN0b3BwZWREZXRhaWxzIH0gPSBkYXRhXG5cbiAgICB0aGlzLmNsZWFyUHJvY2Vzc1N0YXJ0aW5nRmxhZygpXG5cbiAgICBpZiAodGhyZWFkSWQgIT0gbnVsbCAmJiAhdGhpcy5fdGhyZWFkcy5oYXModGhyZWFkSWQpKSB7XG4gICAgICAvLyBXZSdyZSBiZWluZyBhc2tlZCB0byB1cGRhdGUgYSB0aHJlYWQgd2UgaGF2ZW4ndCBzZWVuIHlldCwgc29cbiAgICAgIC8vIGNyZWF0ZSBpdFxuICAgICAgY29uc3QgdGhyZWFkID0gbmV3IFRocmVhZCh0aGlzLCBgVGhyZWFkICR7dGhyZWFkSWR9YCwgdGhyZWFkSWQpXG4gICAgICB0aGlzLl90aHJlYWRzLnNldCh0aHJlYWRJZCwgdGhyZWFkKVxuICAgIH1cblxuICAgIC8vIFNldCB0aGUgYXZhaWxhYmlsaXR5IG9mIHRoZSB0aHJlYWRzJyBjYWxsc3RhY2tzIGRlcGVuZGluZyBvblxuICAgIC8vIHdoZXRoZXIgdGhlIHRocmVhZCBpcyBzdG9wcGVkIG9yIG5vdFxuICAgIGlmIChzdG9wcGVkRGV0YWlscy5hbGxUaHJlYWRzU3RvcHBlZCkge1xuICAgICAgdGhpcy5fdGhyZWFkcy5mb3JFYWNoKCh0aHJlYWQpID0+IHtcbiAgICAgICAgdGhyZWFkLnN0b3BwZWREZXRhaWxzID0gdGhyZWFkLnRocmVhZElkID09PSB0aHJlYWRJZCA/IHN0b3BwZWREZXRhaWxzIDogdGhyZWFkLnN0b3BwZWREZXRhaWxzXG4gICAgICAgIHRocmVhZC5zdG9wcGVkID0gdHJ1ZVxuICAgICAgICB0aHJlYWQuY2xlYXJDYWxsU3RhY2soKVxuICAgICAgfSlcbiAgICB9IGVsc2UgaWYgKHRocmVhZElkICE9IG51bGwpIHtcbiAgICAgIC8vIE9uZSB0aHJlYWQgaXMgc3RvcHBlZCwgb25seSB1cGRhdGUgdGhhdCB0aHJlYWQuXG4gICAgICBjb25zdCB0aHJlYWQgPSBudWxsdGhyb3dzKHRoaXMuX3RocmVhZHMuZ2V0KHRocmVhZElkKSlcbiAgICAgIHRocmVhZC5zdG9wcGVkRGV0YWlscyA9IHN0b3BwZWREZXRhaWxzXG4gICAgICB0aHJlYWQuY2xlYXJDYWxsU3RhY2soKVxuICAgICAgdGhyZWFkLnN0b3BwZWQgPSB0cnVlXG4gICAgfVxuICB9XG5cbiAgcmF3VGhyZWFkVXBkYXRlKGRhdGE6IElSYXdUaHJlYWRVcGRhdGUpOiB2b2lkIHtcbiAgICBjb25zdCB7IHRocmVhZCB9ID0gZGF0YVxuXG4gICAgdGhpcy5jbGVhclByb2Nlc3NTdGFydGluZ0ZsYWcoKVxuXG4gICAgaWYgKCF0aGlzLl90aHJlYWRzLmhhcyh0aHJlYWQuaWQpKSB7XG4gICAgICAvLyBBIG5ldyB0aHJlYWQgY2FtZSBpbiwgaW5pdGlhbGl6ZSBpdC5cbiAgICAgIHRoaXMuX3RocmVhZHMuc2V0KHRocmVhZC5pZCwgbmV3IFRocmVhZCh0aGlzLCB0aHJlYWQubmFtZSwgdGhyZWFkLmlkKSlcbiAgICB9IGVsc2UgaWYgKHRocmVhZC5uYW1lKSB7XG4gICAgICAvLyBKdXN0IHRoZSB0aHJlYWQgbmFtZSBnb3QgdXBkYXRlZCAjMTgyNDRcbiAgICAgIG51bGx0aHJvd3ModGhpcy5fdGhyZWFkcy5nZXQodGhyZWFkLmlkKSkubmFtZSA9IHRocmVhZC5uYW1lXG4gICAgfVxuICB9XG5cbiAgY2xlYXJUaHJlYWRzKHJlbW92ZVRocmVhZHM6IGJvb2xlYW4sIHJlZmVyZW5jZT86IG51bWJlcik6IHZvaWQge1xuICAgIGlmIChyZWZlcmVuY2UgIT0gbnVsbCkge1xuICAgICAgaWYgKHRoaXMuX3RocmVhZHMuaGFzKHJlZmVyZW5jZSkpIHtcbiAgICAgICAgY29uc3QgdGhyZWFkID0gbnVsbHRocm93cyh0aGlzLl90aHJlYWRzLmdldChyZWZlcmVuY2UpKVxuICAgICAgICB0aHJlYWQuY2xlYXJDYWxsU3RhY2soKVxuICAgICAgICB0aHJlYWQuc3RvcHBlZERldGFpbHMgPSBudWxsXG4gICAgICAgIHRocmVhZC5zdG9wcGVkID0gZmFsc2VcblxuICAgICAgICBpZiAocmVtb3ZlVGhyZWFkcykge1xuICAgICAgICAgIHRoaXMuX3RocmVhZHMuZGVsZXRlKHJlZmVyZW5jZSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl90aHJlYWRzLmZvckVhY2goKHRocmVhZCkgPT4ge1xuICAgICAgICB0aHJlYWQuY2xlYXJDYWxsU3RhY2soKVxuICAgICAgICB0aHJlYWQuc3RvcHBlZERldGFpbHMgPSBudWxsXG4gICAgICAgIHRocmVhZC5zdG9wcGVkID0gZmFsc2VcbiAgICAgIH0pXG5cbiAgICAgIGlmIChyZW1vdmVUaHJlYWRzKSB7XG4gICAgICAgIHRoaXMuX3RocmVhZHMuY2xlYXIoKVxuICAgICAgICBFeHByZXNzaW9uQ29udGFpbmVyLmFsbFZhbHVlcy5jbGVhcigpXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgY29tcGxldGlvbnMoXG4gICAgZnJhbWVJZDogbnVtYmVyLFxuICAgIHRleHQ6IHN0cmluZyxcbiAgICBwb3NpdGlvbjogYXRvbSRQb2ludCxcbiAgICBvdmVyd3JpdGVCZWZvcmU6IG51bWJlclxuICApOiBQcm9taXNlPEFycmF5PERlYnVnUHJvdG9jb2wuQ29tcGxldGlvbkl0ZW0+PiB7XG4gICAgaWYgKCF0aGlzLl9zZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c0NvbXBsZXRpb25zUmVxdWVzdCkge1xuICAgICAgcmV0dXJuIFtdXG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX3Nlc3Npb24uY29tcGxldGlvbnMoe1xuICAgICAgICBmcmFtZUlkLFxuICAgICAgICB0ZXh0LFxuICAgICAgICBjb2x1bW46IHBvc2l0aW9uLmNvbHVtbixcbiAgICAgICAgbGluZTogcG9zaXRpb24ucm93LFxuICAgICAgfSlcbiAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5ib2R5ICYmIHJlc3BvbnNlLmJvZHkudGFyZ2V0cykge1xuICAgICAgICByZXR1cm4gcmVzcG9uc2UuYm9keS50YXJnZXRzXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gW11cbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgcmV0dXJuIFtdXG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBCcmVha3BvaW50IGltcGxlbWVudHMgSUJyZWFrcG9pbnQge1xuICB2ZXJpZmllZDogYm9vbGVhblxuICBpZEZyb21BZGFwdGVyOiA/bnVtYmVyXG4gIHVpQnJlYWtwb2ludElkOiBzdHJpbmdcbiAgdXJpOiBzdHJpbmdcbiAgbGluZTogbnVtYmVyXG4gIG9yaWdpbmFsTGluZTogbnVtYmVyXG4gIGNvbHVtbjogbnVtYmVyXG4gIGVuYWJsZWQ6IGJvb2xlYW5cbiAgY29uZGl0aW9uOiA/c3RyaW5nXG4gIGxvZ01lc3NhZ2U6ID9zdHJpbmdcbiAgYWRhcHRlckRhdGE6IGFueVxuICBoaXRDb3VudDogP251bWJlclxuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHVpQnJlYWtwb2ludElkOiBzdHJpbmcsXG4gICAgdXJpOiBzdHJpbmcsXG4gICAgbGluZTogbnVtYmVyLFxuICAgIGNvbHVtbjogbnVtYmVyLFxuICAgIGVuYWJsZWQ6IGJvb2xlYW4sXG4gICAgY29uZGl0aW9uOiA/c3RyaW5nLFxuICAgIGxvZ01lc3NhZ2U6ID9zdHJpbmcsXG4gICAgYWRhcHRlckRhdGE/OiBhbnlcbiAgKSB7XG4gICAgdGhpcy51cmkgPSB1cmlcbiAgICB0aGlzLmxpbmUgPSBsaW5lXG4gICAgdGhpcy5vcmlnaW5hbExpbmUgPSBsaW5lXG4gICAgdGhpcy5jb2x1bW4gPSBjb2x1bW5cbiAgICB0aGlzLmVuYWJsZWQgPSBlbmFibGVkXG4gICAgdGhpcy5jb25kaXRpb24gPSBjb25kaXRpb25cbiAgICB0aGlzLmFkYXB0ZXJEYXRhID0gYWRhcHRlckRhdGFcbiAgICB0aGlzLnZlcmlmaWVkID0gZmFsc2VcbiAgICB0aGlzLnVpQnJlYWtwb2ludElkID0gdWlCcmVha3BvaW50SWRcbiAgICB0aGlzLmhpdENvdW50ID0gbnVsbFxuXG4gICAgaWYgKGNvbmRpdGlvbiAhPSBudWxsICYmIGNvbmRpdGlvbi50cmltKCkgIT09IFwiXCIpIHtcbiAgICAgIHRoaXMuY29uZGl0aW9uID0gY29uZGl0aW9uXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuY29uZGl0aW9uID0gbnVsbFxuICAgIH1cbiAgICBpZiAobG9nTWVzc2FnZSAhPSBudWxsICYmIGxvZ01lc3NhZ2UudHJpbSgpICE9PSBcIlwiKSB7XG4gICAgICB0aGlzLmxvZ01lc3NhZ2UgPSBsb2dNZXNzYWdlXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMubG9nTWVzc2FnZSA9IG51bGxcbiAgICB9XG4gIH1cblxuICBnZXRJZCgpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLnVpQnJlYWtwb2ludElkXG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEZ1bmN0aW9uQnJlYWtwb2ludCBpbXBsZW1lbnRzIElGdW5jdGlvbkJyZWFrcG9pbnQge1xuICBpZDogc3RyaW5nXG4gIHZlcmlmaWVkOiBib29sZWFuXG4gIGlkRnJvbUFkYXB0ZXI6ID9udW1iZXJcbiAgbmFtZTogc3RyaW5nXG4gIGVuYWJsZWQ6IGJvb2xlYW5cbiAgaGl0Q29uZGl0aW9uOiA/c3RyaW5nXG4gIGNvbmRpdGlvbjogP3N0cmluZ1xuXG4gIGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZywgZW5hYmxlZDogYm9vbGVhbiwgaGl0Q29uZGl0aW9uOiA/c3RyaW5nKSB7XG4gICAgdGhpcy5uYW1lID0gbmFtZVxuICAgIHRoaXMuZW5hYmxlZCA9IGVuYWJsZWRcbiAgICB0aGlzLmhpdENvbmRpdGlvbiA9IGhpdENvbmRpdGlvblxuICAgIHRoaXMuY29uZGl0aW9uID0gbnVsbFxuICAgIHRoaXMudmVyaWZpZWQgPSBmYWxzZVxuICAgIHRoaXMuaWRGcm9tQWRhcHRlciA9IG51bGxcbiAgICB0aGlzLmlkID0gdXVpZC52NCgpXG4gIH1cblxuICBnZXRJZCgpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLmlkXG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4Y2VwdGlvbkJyZWFrcG9pbnQgaW1wbGVtZW50cyBJRXhjZXB0aW9uQnJlYWtwb2ludCB7XG4gIF9pZDogc3RyaW5nXG4gICtmaWx0ZXI6IHN0cmluZ1xuICArbGFiZWw6IHN0cmluZ1xuICBlbmFibGVkOiBib29sZWFuXG5cbiAgY29uc3RydWN0b3IoZmlsdGVyOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIGVuYWJsZWQ6ID9ib29sZWFuKSB7XG4gICAgdGhpcy5maWx0ZXIgPSBmaWx0ZXJcbiAgICB0aGlzLmxhYmVsID0gbGFiZWxcbiAgICB0aGlzLmVuYWJsZWQgPSBlbmFibGVkID09IG51bGwgPyBmYWxzZSA6IGVuYWJsZWRcbiAgICB0aGlzLl9pZCA9IHV1aWQudjQoKVxuICB9XG5cbiAgZ2V0SWQoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5faWRcbiAgfVxufVxuXG5jb25zdCBCUkVBS1BPSU5UU19DSEFOR0VEID0gXCJCUkVBS1BPSU5UU19DSEFOR0VEXCJcbmNvbnN0IFdBVENIX0VYUFJFU1NJT05TX0NIQU5HRUQgPSBcIldBVENIX0VYUFJFU1NJT05TX0NIQU5HRURcIlxuXG5jb25zdCBDQUxMU1RBQ0tfQ0hBTkdFRCA9IFwiQ0FMTFNUQUNLX0NIQU5HRURcIlxuY29uc3QgUFJPQ0VTU0VTX0NIQU5HRUQgPSBcIlBST0NFU1NFU19DSEFOR0VEXCJcblxudHlwZSBnZXRGb2N1c2VkUHJvY2Vzc0NhbGxiYWNrID0gKCkgPT4gP0lQcm9jZXNzXG5cbnR5cGUgU3luY09wdGlvbnMgPSB7XG4gIGZpcmVFdmVudDogYm9vbGVhbixcbn1cblxuZXhwb3J0IGNsYXNzIE1vZGVsIGltcGxlbWVudHMgSU1vZGVsIHtcbiAgX3Byb2Nlc3NlczogUHJvY2Vzc1tdXG4gIF91aUJyZWFrcG9pbnRzOiBJVUlCcmVha3BvaW50W11cbiAgX2JyZWFrcG9pbnRzQWN0aXZhdGVkOiBib29sZWFuXG4gIF9mdW5jdGlvbkJyZWFrcG9pbnRzOiBGdW5jdGlvbkJyZWFrcG9pbnRbXVxuICBfd2F0Y2hFeHByZXNzaW9uczogRXhwcmVzc2lvbltdXG4gIF9kaXNwb3NhYmxlczogVW5pdmVyc2FsRGlzcG9zYWJsZVxuICBfZW1pdHRlcjogRW1pdHRlclxuICBfZ2V0Rm9jdXNlZFByb2Nlc3M6IGdldEZvY3VzZWRQcm9jZXNzQ2FsbGJhY2tcblxuICAvLyBFeGNlcHRpb24gYnJlYWtwb2ludCBmaWx0ZXJzIGFyZSBkaWZmZXJlbnQgZm9yIGVhY2ggZGVidWdnZXIgYmFjay1lbmQsIHNvIHRoZXlcbiAgLy8gYXJlIHByb2Nlc3Mtc3BlY2lmaWMuIEhvd2V2ZXIsIHdoZW4gd2UncmUgbm90IGRlYnVnZ2luZywgaWRlYWxseSB3ZSdkIHdhbnQgdG8gc3RpbGxcbiAgLy8gc2hvdyBmaWx0ZXJzIHNvIHRoYXQgYSB1c2VyIGNhbiBzZXQgYnJlYWsgb24gZXhjZXB0aW9uIGJlZm9yZSBzdGFydGluZyBkZWJ1Z2dpbmcsIHRvXG4gIC8vIGVuYWJsZSBicmVha2luZyBvbiBlYXJseSBleGNlcHRpb25zIGFzIHRoZSB0YXJnZXQgc3RhcnRzLiBGb3IgdGhpcyByZWFzb24sIHdlIGNhY2hlXG4gIC8vIHdoYXRldmVyIG9wdGlvbnMgdGhlIG1vc3QgcmVjZW50bHkgZm9jdXNlZCBwcm9jZXNzIG9mZmVyZWQsIGFuZCBvZmZlciB0aG9zZS5cbiAgX21vc3RSZWNlbnRFeGNlcHRpb25CcmVha3BvaW50czogSUV4Y2VwdGlvbkJyZWFrcG9pbnRbXVxuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHVpQnJlYWtwb2ludHM6IElVSUJyZWFrcG9pbnRbXSxcbiAgICBicmVha3BvaW50c0FjdGl2YXRlZDogYm9vbGVhbixcbiAgICBmdW5jdGlvbkJyZWFrcG9pbnRzOiBGdW5jdGlvbkJyZWFrcG9pbnRbXSxcbiAgICBleGNlcHRpb25CcmVha3BvaW50czogRXhjZXB0aW9uQnJlYWtwb2ludFtdLFxuICAgIHdhdGNoRXhwcmVzc2lvbnM6IEV4cHJlc3Npb25bXSxcbiAgICBnZXRGb2N1c2VkUHJvY2VzczogZ2V0Rm9jdXNlZFByb2Nlc3NDYWxsYmFja1xuICApIHtcbiAgICB0aGlzLl9wcm9jZXNzZXMgPSBbXVxuICAgIHRoaXMuX3VpQnJlYWtwb2ludHMgPSB1aUJyZWFrcG9pbnRzXG4gICAgdGhpcy5fYnJlYWtwb2ludHNBY3RpdmF0ZWQgPSBicmVha3BvaW50c0FjdGl2YXRlZFxuICAgIHRoaXMuX2Z1bmN0aW9uQnJlYWtwb2ludHMgPSBmdW5jdGlvbkJyZWFrcG9pbnRzXG4gICAgdGhpcy5fbW9zdFJlY2VudEV4Y2VwdGlvbkJyZWFrcG9pbnRzID0gKChleGNlcHRpb25CcmVha3BvaW50czogYW55KTogSUV4Y2VwdGlvbkJyZWFrcG9pbnRbXSlcbiAgICB0aGlzLl93YXRjaEV4cHJlc3Npb25zID0gd2F0Y2hFeHByZXNzaW9uc1xuICAgIHRoaXMuX2dldEZvY3VzZWRQcm9jZXNzID0gZ2V0Rm9jdXNlZFByb2Nlc3NcbiAgICB0aGlzLl9lbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUodGhpcy5fZW1pdHRlcilcbiAgfVxuXG4gIGdldElkKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIFwicm9vdFwiXG4gIH1cblxuICBnZXRQcm9jZXNzZXMoKTogSVByb2Nlc3NbXSB7XG4gICAgcmV0dXJuICh0aGlzLl9wcm9jZXNzZXM6IGFueSlcbiAgfVxuXG4gIGFkZFByb2Nlc3MoY29uZmlndXJhdGlvbjogSVByb2Nlc3NDb25maWcsIHNlc3Npb246IElTZXNzaW9uICYgSVRyZWVFbGVtZW50KTogUHJvY2VzcyB7XG4gICAgY29uc3QgcHJvY2VzcyA9IG5ldyBQcm9jZXNzKGNvbmZpZ3VyYXRpb24sIHNlc3Npb24pXG5cbiAgICAvLyBBZGQgYnJlYWtwb2ludHMgdG8gcHJvY2Vzcy5cbiAgICBjb25zdCBwcm9jZXNzQnJlYWtwb2ludHMgPSBwcm9jZXNzLmJyZWFrcG9pbnRzXG4gICAgZm9yIChjb25zdCB1aUJwIG9mIHRoaXMuX3VpQnJlYWtwb2ludHMpIHtcbiAgICAgIHByb2Nlc3NCcmVha3BvaW50cy5wdXNoKFxuICAgICAgICBuZXcgQnJlYWtwb2ludCh1aUJwLmlkLCB1aUJwLnVyaSwgdWlCcC5saW5lLCB1aUJwLmNvbHVtbiwgdWlCcC5lbmFibGVkLCB1aUJwLmNvbmRpdGlvbiwgdWlCcC5sb2dNZXNzYWdlKVxuICAgICAgKVxuICAgIH1cblxuICAgIHRoaXMuX3Byb2Nlc3Nlcy5wdXNoKHByb2Nlc3MpXG4gICAgdGhpcy5fZW1pdHRlci5lbWl0KFBST0NFU1NFU19DSEFOR0VEKVxuICAgIHJldHVybiBwcm9jZXNzXG4gIH1cblxuICByZW1vdmVQcm9jZXNzKGlkOiBzdHJpbmcpOiBBcnJheTxQcm9jZXNzPiB7XG4gICAgY29uc3QgcmVtb3ZlZFByb2Nlc3NlcyA9IFtdXG4gICAgdGhpcy5fcHJvY2Vzc2VzID0gdGhpcy5fcHJvY2Vzc2VzLmZpbHRlcigocCkgPT4ge1xuICAgICAgaWYgKHAuZ2V0SWQoKSA9PT0gaWQpIHtcbiAgICAgICAgcmVtb3ZlZFByb2Nlc3Nlcy5wdXNoKHApXG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cbiAgICB9KVxuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChQUk9DRVNTRVNfQ0hBTkdFRClcblxuICAgIGlmIChyZW1vdmVkUHJvY2Vzc2VzLmxlbmd0aCA+IDApIHtcbiAgICAgIHRoaXMuX21vc3RSZWNlbnRFeGNlcHRpb25CcmVha3BvaW50cyA9IHJlbW92ZWRQcm9jZXNzZXNbMF0uZXhjZXB0aW9uQnJlYWtwb2ludHNcbiAgICB9XG4gICAgcmV0dXJuIHJlbW92ZWRQcm9jZXNzZXNcbiAgfVxuXG4gIG9uRGlkQ2hhbmdlQnJlYWtwb2ludHMoY2FsbGJhY2s6ICgpID0+IG1peGVkKTogSURpc3Bvc2FibGUge1xuICAgIHJldHVybiB0aGlzLl9lbWl0dGVyLm9uKEJSRUFLUE9JTlRTX0NIQU5HRUQsIGNhbGxiYWNrKVxuICB9XG5cbiAgLy8gVE9ETzogU2NvcGUgdGhpcyBzbyB0aGF0IG9ubHkgdGhlIHRyZWUgbm9kZXMgZm9yIHRoZSBwcm9jZXNzIHRoYXRcbiAgLy8gaGFkIGEgY2FsbCBzdGFjayBjaGFuZ2UgbmVlZCB0byByZS1yZW5kZXJcbiAgb25EaWRDaGFuZ2VDYWxsU3RhY2soY2FsbGJhY2s6ICgpID0+IG1peGVkKTogSURpc3Bvc2FibGUge1xuICAgIHJldHVybiB0aGlzLl9lbWl0dGVyLm9uKENBTExTVEFDS19DSEFOR0VELCBjYWxsYmFjaylcbiAgfVxuXG4gIG9uRGlkQ2hhbmdlUHJvY2Vzc2VzKGNhbGxiYWNrOiAoKSA9PiBtaXhlZCk6IElEaXNwb3NhYmxlIHtcbiAgICByZXR1cm4gdGhpcy5fZW1pdHRlci5vbihQUk9DRVNTRVNfQ0hBTkdFRCwgY2FsbGJhY2spXG4gIH1cblxuICBvbkRpZENoYW5nZVdhdGNoRXhwcmVzc2lvbnMoY2FsbGJhY2s6IChleHByZXNzaW9uOiA/SUV4cHJlc3Npb24pID0+IG1peGVkKTogSURpc3Bvc2FibGUge1xuICAgIHJldHVybiB0aGlzLl9lbWl0dGVyLm9uKFdBVENIX0VYUFJFU1NJT05TX0NIQU5HRUQsIGNhbGxiYWNrKVxuICB9XG5cbiAgcmF3VXBkYXRlKGRhdGE6IElSYXdNb2RlbFVwZGF0ZSk6IHZvaWQge1xuICAgIGNvbnN0IHByb2Nlc3MgPSB0aGlzLl9wcm9jZXNzZXMuZmlsdGVyKChwKSA9PiBwLmdldElkKCkgPT09IGRhdGEuc2Vzc2lvbklkKS5wb3AoKVxuICAgIGlmIChwcm9jZXNzID09IG51bGwpIHtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICBpZiAoZGF0YS5zdG9wcGVkRGV0YWlscyAhPSBudWxsKSB7XG4gICAgICBwcm9jZXNzLnJhd1N0b3BwZWRVcGRhdGUoKGRhdGE6IGFueSkpXG4gICAgfSBlbHNlIHtcbiAgICAgIHByb2Nlc3MucmF3VGhyZWFkVXBkYXRlKChkYXRhOiBhbnkpKVxuICAgIH1cblxuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChDQUxMU1RBQ0tfQ0hBTkdFRClcbiAgfVxuXG4gIGNsZWFyVGhyZWFkcyhpZDogc3RyaW5nLCByZW1vdmVUaHJlYWRzOiBib29sZWFuLCByZWZlcmVuY2U/OiBudW1iZXIpOiB2b2lkIHtcbiAgICBjb25zdCBwcm9jZXNzID0gdGhpcy5fcHJvY2Vzc2VzLmZpbHRlcigocCkgPT4gcC5nZXRJZCgpID09PSBpZCkucG9wKClcblxuICAgIGlmIChwcm9jZXNzICE9IG51bGwpIHtcbiAgICAgIHByb2Nlc3MuY2xlYXJUaHJlYWRzKHJlbW92ZVRocmVhZHMsIHJlZmVyZW5jZSlcbiAgICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChDQUxMU1RBQ0tfQ0hBTkdFRClcbiAgICB9XG4gIH1cblxuICBhc3luYyByZWZyZXNoQ2FsbFN0YWNrKHRocmVhZEk6IElUaHJlYWQsIGZldGNoQWxsRnJhbWVzOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgdGhyZWFkOiBUaHJlYWQgPSAodGhyZWFkSTogYW55KVxuXG4gICAgLy8gSWYgdGhlIGRlYnVnZ2VyIHN1cHBvcnRzIGRlbGF5ZWQgc3RhY2sgdHJhY2UgbG9hZGluZywgbG9hZCBvbmx5XG4gICAgLy8gdGhlIGZpcnN0IGNhbGwgc3RhY2sgZnJhbWUsIHdoaWNoIGlzIG5lZWRlZCB0byBkaXNwbGF5IGluIHRoZSB0aHJlYWRzXG4gICAgLy8gdmlldy4gV2Ugd2lsbCBsYXppbHkgbG9hZCB0aGUgcmVtYWluaW5nIGZyYW1lcyBvbmx5IGZvciB0aHJlYWRzIHRoYXRcbiAgICAvLyBhcmUgdmlzaWJsZSBpbiB0aGUgVUksIGFsbG93aW5nIHVzIHRvIHNraXAgbG9hZGluZyBmcmFtZXMgd2UgZG9uJ3RcbiAgICAvLyBuZWVkIHJpZ2h0IG5vdy5cbiAgICBjb25zdCBmcmFtZXNUb0xvYWQgPVxuICAgICAgbnVsbHRocm93cyh0aHJlYWQucHJvY2Vzcykuc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNEZWxheWVkU3RhY2tUcmFjZUxvYWRpbmcgJiYgIWZldGNoQWxsRnJhbWVzID8gMSA6IG51bGxcblxuICAgIHRocmVhZC5jbGVhckNhbGxTdGFjaygpXG4gICAgYXdhaXQgdGhyZWFkLnJlZnJlc2hDYWxsU3RhY2soZnJhbWVzVG9Mb2FkKVxuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChDQUxMU1RBQ0tfQ0hBTkdFRClcbiAgfVxuXG4gIGdldFVJQnJlYWtwb2ludHMoKTogSVVJQnJlYWtwb2ludFtdIHtcbiAgICByZXR1cm4gdGhpcy5fdWlCcmVha3BvaW50c1xuICB9XG5cbiAgZ2V0QnJlYWtwb2ludHMoKTogSUJyZWFrcG9pbnRbXSB7XG4gICAgLy8gSWYgd2UncmUgY3VycmVudGx5IGRlYnVnZ2luZywgcmV0dXJuIHRoZSBicmVha3BvaW50cyBhcyB0aGUgY3VycmVudFxuICAgIC8vIGRlYnVnIGFkYXB0ZXIgc2VlcyB0aGVtLlxuICAgIGNvbnN0IGZvY3VzZWRQcm9jZXNzID0gdGhpcy5fZ2V0Rm9jdXNlZFByb2Nlc3MoKVxuICAgIGlmIChmb2N1c2VkUHJvY2VzcyAhPSBudWxsKSB7XG4gICAgICBjb25zdCBjdXJyZW50UHJvY2VzcyA9IHRoaXMuX3Byb2Nlc3Nlcy5maW5kKChwKSA9PiBwLmdldElkKCkgPT09IGZvY3VzZWRQcm9jZXNzLmdldElkKCkpXG4gICAgICBpZiAoY3VycmVudFByb2Nlc3MgIT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gKGN1cnJlbnRQcm9jZXNzLmJyZWFrcG9pbnRzOiBhbnkpXG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gT3RoZXJ3aXNlLCByZXR1cm4gdGhlIFVJIGJyZWFrcG9pbnRzLiBTaW5jZSB0aGVyZSBpcyBubyBkZWJ1ZyBwcm9jZXNzLFxuICAgIC8vIHRoZSBicmVha3BvaW50cyBoYXZlIHRoZWlyIG9yaWdpbmFsIGxpbmUgbG9jYXRpb24gYW5kIG5vIG5vdGlvbiBvZlxuICAgIC8vIHZlcmlmaWVkIHZzIG5vdC5cbiAgICByZXR1cm4gdGhpcy5fdWlCcmVha3BvaW50cy5tYXAoKHVpQnApID0+IHtcbiAgICAgIGNvbnN0IGJwID0gbmV3IEJyZWFrcG9pbnQoXG4gICAgICAgIHVpQnAuaWQsXG4gICAgICAgIHVpQnAudXJpLFxuICAgICAgICB1aUJwLmxpbmUsXG4gICAgICAgIHVpQnAuY29sdW1uLFxuICAgICAgICB1aUJwLmVuYWJsZWQsXG4gICAgICAgIHVpQnAuY29uZGl0aW9uLFxuICAgICAgICB1aUJwLmxvZ01lc3NhZ2VcbiAgICAgIClcbiAgICAgIGJwLnZlcmlmaWVkID0gdHJ1ZVxuICAgICAgcmV0dXJuIGJwXG4gICAgfSlcbiAgfVxuXG4gIGdldEJyZWFrcG9pbnRBdExpbmUodXJpOiBzdHJpbmcsIGxpbmU6IG51bWJlcik6ID9JQnJlYWtwb2ludCB7XG4gICAgbGV0IGJyZWFrcG9pbnQgPSB0aGlzLmdldEJyZWFrcG9pbnRzKCkuZmluZCgoYnApID0+IGJwLnVyaSA9PT0gdXJpICYmIGJwLmxpbmUgPT09IGxpbmUpXG4gICAgaWYgKGJyZWFrcG9pbnQgPT0gbnVsbCkge1xuICAgICAgYnJlYWtwb2ludCA9IHRoaXMuZ2V0QnJlYWtwb2ludHMoKS5maW5kKChicCkgPT4gYnAudXJpID09PSB1cmkgJiYgYnAub3JpZ2luYWxMaW5lID09PSBsaW5lKVxuICAgIH1cbiAgICByZXR1cm4gYnJlYWtwb2ludFxuICB9XG5cbiAgZ2V0QnJlYWtwb2ludEJ5SWQoaWQ6IHN0cmluZyk6ID9JQnJlYWtwb2ludCB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0QnJlYWtwb2ludHMoKS5maW5kKChicCkgPT4gYnAuZ2V0SWQoKSA9PT0gaWQpXG4gIH1cblxuICBnZXRGdW5jdGlvbkJyZWFrcG9pbnRzKCk6IElGdW5jdGlvbkJyZWFrcG9pbnRbXSB7XG4gICAgcmV0dXJuICh0aGlzLl9mdW5jdGlvbkJyZWFrcG9pbnRzOiBhbnkpXG4gIH1cblxuICBnZXRFeGNlcHRpb25CcmVha3BvaW50cygpOiBJRXhjZXB0aW9uQnJlYWtwb2ludFtdIHtcbiAgICBjb25zdCBmb2N1c2VkUHJvY2VzcyA9IHRoaXMuX2dldEZvY3VzZWRQcm9jZXNzKClcbiAgICBpZiAoZm9jdXNlZFByb2Nlc3MgIT0gbnVsbCkge1xuICAgICAgcmV0dXJuIChmb2N1c2VkUHJvY2Vzcy5leGNlcHRpb25CcmVha3BvaW50czogYW55KVxuICAgIH1cbiAgICByZXR1cm4gKHRoaXMuX21vc3RSZWNlbnRFeGNlcHRpb25CcmVha3BvaW50czogYW55KVxuICB9XG5cbiAgc2V0RXhjZXB0aW9uQnJlYWtwb2ludHMocHJvY2VzczogSVByb2Nlc3MsIGRhdGE6IERlYnVnUHJvdG9jb2wuRXhjZXB0aW9uQnJlYWtwb2ludHNGaWx0ZXJbXSk6IHZvaWQge1xuICAgIHByb2Nlc3MuZXhjZXB0aW9uQnJlYWtwb2ludHMgPSBkYXRhLm1hcCgoZCkgPT4ge1xuICAgICAgY29uc3QgZWJwID0gcHJvY2Vzcy5leGNlcHRpb25CcmVha3BvaW50cy5maWx0ZXIoKGJwKSA9PiBicC5maWx0ZXIgPT09IGQuZmlsdGVyKS5wb3AoKVxuICAgICAgcmV0dXJuIG5ldyBFeGNlcHRpb25CcmVha3BvaW50KGQuZmlsdGVyLCBkLmxhYmVsLCBlYnAgPyBlYnAuZW5hYmxlZCA6IGQuZGVmYXVsdClcbiAgICB9KVxuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChCUkVBS1BPSU5UU19DSEFOR0VEKVxuICB9XG5cbiAgYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuX2JyZWFrcG9pbnRzQWN0aXZhdGVkXG4gIH1cblxuICBzZXRCcmVha3BvaW50c0FjdGl2YXRlZChhY3RpdmF0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICB0aGlzLl9icmVha3BvaW50c0FjdGl2YXRlZCA9IGFjdGl2YXRlZFxuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChCUkVBS1BPSU5UU19DSEFOR0VEKVxuICB9XG5cbiAgYWRkVUlCcmVha3BvaW50cyh1aUJyZWFrcG9pbnRzOiBJVUlCcmVha3BvaW50W10sIGZpcmVFdmVudD86IGJvb2xlYW4gPSB0cnVlKTogdm9pZCB7XG4gICAgdGhpcy5fdWlCcmVha3BvaW50cyA9IHRoaXMuX3VpQnJlYWtwb2ludHMuY29uY2F0KHVpQnJlYWtwb2ludHMpXG4gICAgdGhpcy5fYnJlYWtwb2ludHNBY3RpdmF0ZWQgPSB0cnVlXG4gICAgdGhpcy5fc29ydFN5bmNBbmREZUR1cCh7IGZpcmVFdmVudCB9KVxuICB9XG5cbiAgcmVtb3ZlQnJlYWtwb2ludHModG9SZW1vdmU6IElCcmVha3BvaW50W10pOiB2b2lkIHtcbiAgICB0aGlzLl91aUJyZWFrcG9pbnRzID0gdGhpcy5fdWlCcmVha3BvaW50cy5maWx0ZXIoKGJwKSA9PiAhdG9SZW1vdmUuc29tZSgocikgPT4gci5nZXRJZCgpID09PSBicC5pZCkpXG5cbiAgICB0aGlzLl9zb3J0U3luY0FuZERlRHVwKClcbiAgfVxuXG4gIHVwZGF0ZUJyZWFrcG9pbnRzKG5ld0JwczogSVVJQnJlYWtwb2ludFtdKTogdm9pZCB7XG4gICAgdGhpcy5fdWlCcmVha3BvaW50cyA9IHRoaXMuX3VpQnJlYWtwb2ludHMuZmlsdGVyKChicCkgPT4gIW5ld0Jwcy5zb21lKChuKSA9PiBuLmlkID09PSBicC5pZCkpLmNvbmNhdChuZXdCcHMpXG5cbiAgICB0aGlzLl9zb3J0U3luY0FuZERlRHVwKClcbiAgfVxuXG4gIC8vIFRoaXMgaXMgY2FsbGVkIHdoZW4gYSBicmVha3BvaW50IGlzIHVwZGF0ZWQgYnkgdGhlIGRlYnVnIGFkYXB0ZXIuXG4gIC8vIEl0IGFmZmVjdHMgb25seSBicmVha3BvaW50cyBmb3IgYSBwYXJ0aWN1bGFyIHNlc3Npb24uXG4gIHVwZGF0ZVByb2Nlc3NCcmVha3BvaW50cyhcbiAgICBwcm9jZXNzOiBJUHJvY2VzcyxcbiAgICBkYXRhOiB7XG4gICAgICBbaWQ6IHN0cmluZ106IERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludCxcbiAgICB9XG4gICk6IHZvaWQge1xuICAgIGNvbnN0IHByb2MgPSB0aGlzLl9wcm9jZXNzZXMuZmluZCgocCkgPT4gcC5nZXRJZCgpID09PSBwcm9jZXNzLmdldElkKCkpXG4gICAgaWYgKHByb2MgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgY29uc3QgYnJlYWtwb2ludHMgPSBwcm9jLmJyZWFrcG9pbnRzXG4gICAgYnJlYWtwb2ludHMuZm9yRWFjaCgoYnApID0+IHtcbiAgICAgIGNvbnN0IGJwRGF0YSA9IGRhdGFbYnAuZ2V0SWQoKV1cbiAgICAgIGlmIChicERhdGEgIT0gbnVsbCkge1xuICAgICAgICAvLyBUaGUgYnJlYWtwb2ludCdzIGNhbGlicmF0ZWQgbG9jYXRpb24gY2FuIGJlIGRpZmZlcmVudCBmcm9tIGl0c1xuICAgICAgICAvLyBpbml0aWFsIGxvY2F0aW9uLiBTaW5jZSB3ZSBkb24ndCBkaXNwbGF5IHJhbmdlcyBpbiB0aGUgVVgsIGEgYnBcbiAgICAgICAgLy8gaGFzIG9ubHkgb25lIGxpbmUgbG9jYXRpb24uIFdlIHByZWZlciB0aGUgZW5kTGluZSBpZiB0aGUgYnAgaW5zdHJ1Y3Rpb25cbiAgICAgICAgLy8gbWF0Y2hlcyBhIHJhbmdlIG9mIGxpbmVzLiBPdGhlcndpc2UgZmFsbCBiYWNrIHRvIHRoZSAoc3RhcnQpIGxpbmUuXG4gICAgICAgIGJwLmxpbmUgPSBicERhdGEuZW5kTGluZSAhPSBudWxsID8gYnBEYXRhLmVuZExpbmUgOiBicERhdGEubGluZSAhPSBudWxsID8gYnBEYXRhLmxpbmUgOiBicC5saW5lXG4gICAgICAgIGJwLmNvbHVtbiA9IGJwRGF0YS5jb2x1bW4gIT0gbnVsbCA/IGJwRGF0YS5jb2x1bW4gOiBicC5jb2x1bW5cbiAgICAgICAgYnAudmVyaWZpZWQgPSBicERhdGEudmVyaWZpZWQgIT0gbnVsbCA/IGJwRGF0YS52ZXJpZmllZCA6IGJwLnZlcmlmaWVkXG4gICAgICAgIGJwLmlkRnJvbUFkYXB0ZXIgPSBicERhdGEuaWRcbiAgICAgICAgYnAuYWRhcHRlckRhdGEgPSBicERhdGEuc291cmNlID8gYnBEYXRhLnNvdXJjZS5hZGFwdGVyRGF0YSA6IGJwLmFkYXB0ZXJEYXRhXG4gICAgICAgIGJwLmhpdENvdW50ID0gYnBEYXRhLm51Y2xpZGVfaGl0Q291bnRcbiAgICAgIH1cbiAgICB9KVxuICAgIHRoaXMuX3NvcnRTeW5jQW5kRGVEdXAoKVxuICB9XG5cbiAgX3NvcnRTeW5jQW5kRGVEdXAob3B0aW9ucz86IFN5bmNPcHRpb25zKTogdm9pZCB7XG4gICAgY29uc3QgY29tcGFyZXIgPSAoZmlyc3QsIHNlY29uZCkgPT4ge1xuICAgICAgaWYgKGZpcnN0LnVyaSAhPT0gc2Vjb25kLnVyaSkge1xuICAgICAgICByZXR1cm4gZmlyc3QudXJpLmxvY2FsZUNvbXBhcmUoc2Vjb25kLnVyaSlcbiAgICAgIH1cbiAgICAgIGlmIChmaXJzdC5saW5lID09PSBzZWNvbmQubGluZSkge1xuICAgICAgICByZXR1cm4gZmlyc3QuY29sdW1uIC0gc2Vjb25kLmNvbHVtblxuICAgICAgfVxuXG4gICAgICByZXR1cm4gZmlyc3QubGluZSAtIHNlY29uZC5saW5lXG4gICAgfVxuXG4gICAgdGhpcy5fdWlCcmVha3BvaW50cyA9IGRpc3RpbmN0KHRoaXMuX3VpQnJlYWtwb2ludHMuc29ydChjb21wYXJlciksIChicCkgPT4gYCR7YnAudXJpfToke2JwLmxpbmV9OiR7YnAuY29sdW1ufWApXG5cbiAgICAvLyBTeW5jIHdpdGggYWxsIGFjdGl2ZSBwcm9jZXNzZXMuXG4gICAgY29uc3QgYnBJZHMgPSBuZXcgU2V0KClcbiAgICBmb3IgKGNvbnN0IGJwIG9mIHRoaXMuX3VpQnJlYWtwb2ludHMpIHtcbiAgICAgIGJwSWRzLmFkZChicC5pZClcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHByb2Nlc3Mgb2YgdGhpcy5fcHJvY2Vzc2VzKSB7XG4gICAgICAvLyBSZW1vdmUgYW55IGJyZWFrcG9pbnRzIGZyb20gdGhlIHByb2Nlc3MgdGhhdCBubyBsb25nZXIgZXhpc3QgaW4gdGhlIFVJLlxuICAgICAgcHJvY2Vzcy5icmVha3BvaW50cyA9IHByb2Nlc3MuYnJlYWtwb2ludHMuZmlsdGVyKChicCkgPT4gYnBJZHMuaGFzKGJwLmdldElkKCkpKVxuXG4gICAgICAvLyBTeW5jIGFueSB0byB0aGUgcHJvY2VzcyB0aGF0IGFyZSBtaXNzaW5nLlxuICAgICAgY29uc3QgcHJvY2Vzc0JwcyA9IG5ldyBNYXAoKVxuICAgICAgZm9yIChjb25zdCBwcm9jZXNzQnJlYWtwb2ludCBvZiBwcm9jZXNzLmJyZWFrcG9pbnRzKSB7XG4gICAgICAgIHByb2Nlc3NCcHMuc2V0KHByb2Nlc3NCcmVha3BvaW50LmdldElkKCksIHByb2Nlc3NCcmVha3BvaW50KVxuICAgICAgfVxuXG4gICAgICBmb3IgKGNvbnN0IHVpQnAgb2YgdGhpcy5fdWlCcmVha3BvaW50cykge1xuICAgICAgICBjb25zdCBwcm9jZXNzQnAgPSBwcm9jZXNzQnBzLmdldCh1aUJwLmlkKVxuICAgICAgICBpZiAocHJvY2Vzc0JwID09IG51bGwpIHtcbiAgICAgICAgICBwcm9jZXNzLmJyZWFrcG9pbnRzLnB1c2goXG4gICAgICAgICAgICBuZXcgQnJlYWtwb2ludCh1aUJwLmlkLCB1aUJwLnVyaSwgdWlCcC5saW5lLCB1aUJwLmNvbHVtbiwgdWlCcC5lbmFibGVkLCB1aUJwLmNvbmRpdGlvbiwgdWlCcC5sb2dNZXNzYWdlKVxuICAgICAgICAgIClcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwcm9jZXNzQnAuZW5hYmxlZCA9IHVpQnAuZW5hYmxlZFxuICAgICAgICAgIHByb2Nlc3NCcC5jb25kaXRpb24gPSB1aUJwLmNvbmRpdGlvblxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIFNvcnQuXG4gICAgICBwcm9jZXNzLmJyZWFrcG9pbnRzID0gcHJvY2Vzcy5icmVha3BvaW50cy5zb3J0KGNvbXBhcmVyKVxuICAgIH1cblxuICAgIGlmIChvcHRpb25zID09IG51bGwgfHwgb3B0aW9ucy5maXJlRXZlbnQpIHtcbiAgICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChCUkVBS1BPSU5UU19DSEFOR0VEKVxuICAgIH1cbiAgfVxuXG4gIHNldEVuYWJsZW1lbnQoZWxlbWVudDogSUVuYWJsZWFibGUsIGVuYWJsZTogYm9vbGVhbik6IHZvaWQge1xuICAgIGVsZW1lbnQuZW5hYmxlZCA9IGVuYWJsZVxuICAgIGNvbnN0IHVpQnAgPSB0aGlzLl91aUJyZWFrcG9pbnRzLmZpbmQoKGJwKSA9PiBicC5pZCA9PT0gZWxlbWVudC5nZXRJZCgpKVxuICAgIGlmICh1aUJwICE9IG51bGwpIHtcbiAgICAgIHVpQnAuZW5hYmxlZCA9IGVuYWJsZVxuICAgIH1cbiAgICB0aGlzLl9zb3J0U3luY0FuZERlRHVwKClcbiAgfVxuXG4gIGVuYWJsZU9yRGlzYWJsZUFsbEJyZWFrcG9pbnRzKGVuYWJsZTogYm9vbGVhbik6IHZvaWQge1xuICAgIHRoaXMuX3VpQnJlYWtwb2ludHMuZm9yRWFjaCgoYnApID0+IHtcbiAgICAgIGJwLmVuYWJsZWQgPSBlbmFibGVcbiAgICB9KVxuICAgIHRoaXMuX2Z1bmN0aW9uQnJlYWtwb2ludHMuZm9yRWFjaCgoZmJwKSA9PiB7XG4gICAgICBmYnAuZW5hYmxlZCA9IGVuYWJsZVxuICAgIH0pXG5cbiAgICB0aGlzLl9zb3J0U3luY0FuZERlRHVwKClcbiAgfVxuXG4gIGFkZEZ1bmN0aW9uQnJlYWtwb2ludChmdW5jdGlvbk5hbWU6IHN0cmluZyk6IEZ1bmN0aW9uQnJlYWtwb2ludCB7XG4gICAgY29uc3QgbmV3RnVuY3Rpb25CcmVha3BvaW50ID0gbmV3IEZ1bmN0aW9uQnJlYWtwb2ludChmdW5jdGlvbk5hbWUsIHRydWUsIG51bGwpXG4gICAgdGhpcy5fZnVuY3Rpb25CcmVha3BvaW50cy5wdXNoKG5ld0Z1bmN0aW9uQnJlYWtwb2ludClcbiAgICB0aGlzLl9lbWl0dGVyLmVtaXQoQlJFQUtQT0lOVFNfQ0hBTkdFRClcbiAgICByZXR1cm4gbmV3RnVuY3Rpb25CcmVha3BvaW50XG4gIH1cblxuICB1cGRhdGVGdW5jdGlvbkJyZWFrcG9pbnRzKGRhdGE6IHtcbiAgICBbaWQ6IHN0cmluZ106IHtcbiAgICAgIG5hbWU/OiBzdHJpbmcsXG4gICAgICB2ZXJpZmllZD86IGJvb2xlYW4sXG4gICAgICBpZD86IG51bWJlcixcbiAgICAgIGhpdENvbmRpdGlvbj86IHN0cmluZyxcbiAgICB9LFxuICB9KTogdm9pZCB7XG4gICAgdGhpcy5fZnVuY3Rpb25CcmVha3BvaW50cy5mb3JFYWNoKChmYnApID0+IHtcbiAgICAgIGNvbnN0IGZicERhdGEgPSBkYXRhW2ZicC5nZXRJZCgpXVxuICAgICAgaWYgKGZicERhdGEgIT0gbnVsbCkge1xuICAgICAgICBmYnAubmFtZSA9IGZicERhdGEubmFtZSAhPSBudWxsID8gZmJwRGF0YS5uYW1lIDogZmJwLm5hbWVcbiAgICAgICAgZmJwLnZlcmlmaWVkID0gZmJwRGF0YS52ZXJpZmllZCB8fCBmYnAudmVyaWZpZWRcbiAgICAgICAgZmJwLmlkRnJvbUFkYXB0ZXIgPSBmYnBEYXRhLmlkXG4gICAgICAgIGZicC5oaXRDb25kaXRpb24gPSBmYnBEYXRhLmhpdENvbmRpdGlvblxuICAgICAgfVxuICAgIH0pXG5cbiAgICB0aGlzLl9lbWl0dGVyLmVtaXQoQlJFQUtQT0lOVFNfQ0hBTkdFRClcbiAgfVxuXG4gIHJlbW92ZUZ1bmN0aW9uQnJlYWtwb2ludHMoaWQ/OiBzdHJpbmcpOiB2b2lkIHtcbiAgICBsZXQgcmVtb3ZlZDogRnVuY3Rpb25CcmVha3BvaW50W11cbiAgICBpZiAoaWQgIT0gbnVsbCkge1xuICAgICAgcmVtb3ZlZCA9IHRoaXMuX2Z1bmN0aW9uQnJlYWtwb2ludHMuZmlsdGVyKChmYnApID0+IGZicC5nZXRJZCgpID09PSBpZClcbiAgICAgIHRoaXMuX2Z1bmN0aW9uQnJlYWtwb2ludHMgPSB0aGlzLl9mdW5jdGlvbkJyZWFrcG9pbnRzLmZpbHRlcigoZmJwKSA9PiBmYnAuZ2V0SWQoKSAhPT0gaWQpXG4gICAgfSBlbHNlIHtcbiAgICAgIHJlbW92ZWQgPSB0aGlzLl9mdW5jdGlvbkJyZWFrcG9pbnRzXG4gICAgICB0aGlzLl9mdW5jdGlvbkJyZWFrcG9pbnRzID0gW11cbiAgICB9XG4gICAgdGhpcy5fZW1pdHRlci5lbWl0KEJSRUFLUE9JTlRTX0NIQU5HRUQsIHsgcmVtb3ZlZCB9KVxuICB9XG5cbiAgZ2V0V2F0Y2hFeHByZXNzaW9ucygpOiBJRXZhbHVhdGFibGVFeHByZXNzaW9uW10ge1xuICAgIHJldHVybiAodGhpcy5fd2F0Y2hFeHByZXNzaW9uczogYW55KVxuICB9XG5cbiAgYWRkV2F0Y2hFeHByZXNzaW9uKG5hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IHdlID0gbmV3IEV4cHJlc3Npb24obmFtZSlcbiAgICB0aGlzLl93YXRjaEV4cHJlc3Npb25zLnB1c2god2UpXG4gICAgdGhpcy5fZW1pdHRlci5lbWl0KFdBVENIX0VYUFJFU1NJT05TX0NIQU5HRUQsIHdlKVxuICB9XG5cbiAgcmVuYW1lV2F0Y2hFeHByZXNzaW9uKGlkOiBzdHJpbmcsIG5ld05hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IGZpbHRlcmVkID0gdGhpcy5fd2F0Y2hFeHByZXNzaW9ucy5maWx0ZXIoKHdlKSA9PiB3ZS5nZXRJZCgpID09PSBpZClcbiAgICBpZiAoZmlsdGVyZWQubGVuZ3RoID09PSAxKSB7XG4gICAgICBmaWx0ZXJlZFswXS5uYW1lID0gbmV3TmFtZVxuICAgICAgdGhpcy5fZW1pdHRlci5lbWl0KFdBVENIX0VYUFJFU1NJT05TX0NIQU5HRUQsIGZpbHRlcmVkWzBdKVxuICAgIH1cbiAgfVxuXG4gIHJlbW92ZVdhdGNoRXhwcmVzc2lvbnMoaWQ6ID9zdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLl93YXRjaEV4cHJlc3Npb25zID0gaWQgIT0gbnVsbCA/IHRoaXMuX3dhdGNoRXhwcmVzc2lvbnMuZmlsdGVyKCh3ZSkgPT4gd2UuZ2V0SWQoKSAhPT0gaWQpIDogW11cbiAgICB0aGlzLl9lbWl0dGVyLmVtaXQoV0FUQ0hfRVhQUkVTU0lPTlNfQ0hBTkdFRClcbiAgfVxuXG4gIHNvdXJjZUlzTm90QXZhaWxhYmxlKHVyaTogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy5fcHJvY2Vzc2VzLmZvckVhY2goKHApID0+IHtcbiAgICAgIGlmIChwLnNvdXJjZXMuaGFzKHVyaSkpIHtcbiAgICAgICAgbnVsbHRocm93cyhwLnNvdXJjZXMuZ2V0KHVyaSkpLmF2YWlsYWJsZSA9IGZhbHNlXG4gICAgICB9XG4gICAgfSlcbiAgICB0aGlzLl9lbWl0dGVyLmVtaXQoQ0FMTFNUQUNLX0NIQU5HRUQpXG4gIH1cblxuICBkaXNwb3NlKCk6IHZvaWQge1xuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG59XG4iXX0=