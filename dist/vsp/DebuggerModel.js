"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Model = exports.ExceptionBreakpoint = exports.FunctionBreakpoint = exports.Breakpoint = exports.Process = exports.Thread = exports.StackFrame = exports.Scope = exports.Variable = exports.Expression = exports.ExpressionContainer = exports.Source = void 0;

var _nuclideUri = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/nuclideUri"));

var _nuclideDebuggerCommon = require("@atom-ide-community/nuclide-debugger-common");

var DebugProtocol = _interopRequireWildcard(require("vscode-debugprotocol"));

var _rxjsCompatUmdMin = require("rxjs-compat/bundles/rxjs-compat.umd.min.js");

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
      return _rxjsCompatUmdMin.Observable.of(_expected.Expect.value(this._callStack.callFrames));
    } // Return a pending value and kick off the fetch. When the fetch
    // is done, emit the new call frames.


    return _rxjsCompatUmdMin.Observable.concat(_rxjsCompatUmdMin.Observable.of(_expected.Expect.pending()), _rxjsCompatUmdMin.Observable.fromPromise(this.refreshCallStack(levels)).switchMap(() => _rxjsCompatUmdMin.Observable.of(_expected.Expect.value(this._callStack.callFrames))));
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyTW9kZWwuanMiXSwibmFtZXMiOlsiU291cmNlIiwiY29uc3RydWN0b3IiLCJyYXciLCJzZXNzaW9uSWQiLCJ1cmkiLCJhdmFpbGFibGUiLCJfcmF3IiwibmFtZSIsIlVOS05PV05fU09VUkNFIiwic291cmNlUmVmZXJlbmNlIiwicGF0aCIsIm51Y2xpZGVVcmkiLCJwYXJzZVBhdGgiLCJiYXNlIiwiREVCVUdfU09VUkNFU19VUkkiLCJvcmlnaW4iLCJwcmVzZW50YXRpb25IaW50IiwicmVmZXJlbmNlIiwiaW5NZW1vcnkiLCJzdGFydHNXaXRoIiwib3BlbkluRWRpdG9yIiwiYXRvbSIsIndvcmtzcGFjZSIsIm9wZW4iLCJzZWFyY2hBbGxQYW5lcyIsInBlbmRpbmciLCJFeHByZXNzaW9uQ29udGFpbmVyIiwicHJvY2VzcyIsImlkIiwibmFtZWRWYXJpYWJsZXMiLCJpbmRleGVkVmFyaWFibGVzIiwic3RhcnRPZlZhcmlhYmxlcyIsIl92YWx1ZSIsIl9jaGlsZHJlbiIsIl9yZWZlcmVuY2UiLCJfaWQiLCJfbmFtZWRWYXJpYWJsZXMiLCJfaW5kZXhlZFZhcmlhYmxlcyIsIl9zdGFydE9mVmFyaWFibGVzIiwidmFsdWUiLCJoYXNDaGlsZFZhcmlhYmxlcyIsImdldENoaWxkcmVuIiwiX2RvR2V0Q2hpbGRyZW4iLCJoYXNDaGlsZHJlbiIsImdldENoaWxkcmVuSW5DaHVua3MiLCJ2YXJpYWJsZXMiLCJfZmV0Y2hWYXJpYWJsZXMiLCJjaGlsZHJlbkFycmF5IiwiQm9vbGVhbiIsInVuZGVmaW5lZCIsImNodW5rU2l6ZSIsIkJBU0VfQ0hVTktfU0laRSIsIm51bWJlck9mQ2h1bmtzIiwiTWF0aCIsImNlaWwiLCJpIiwic3RhcnQiLCJjb3VudCIsIm1pbiIsInB1c2giLCJWYXJpYWJsZSIsImtpbmQiLCJjb25jYXQiLCJnZXRJZCIsImdldFZhbHVlIiwiZmlsdGVyIiwicmVzcG9uc2UiLCJzZXNzaW9uIiwidmFyaWFibGVzUmVmZXJlbmNlIiwiYm9keSIsInYiLCJtYXAiLCJldmFsdWF0ZU5hbWUiLCJ0eXBlIiwiZSIsIm1lc3NhZ2UiLCJzZXRWYWx1ZSIsImFsbFZhbHVlcyIsInNldCIsInRvU3RyaW5nIiwiTWFwIiwiRXhwcmVzc2lvbiIsInV1aWQiLCJ2NCIsIl90eXBlIiwiREVGQVVMVF9WQUxVRSIsImV2YWx1YXRlIiwic3RhY2tGcmFtZSIsImNvbnRleHQiLCJleHByZXNzaW9uIiwiZnJhbWVJZCIsInJlc3VsdCIsImVyciIsInBhcmVudCIsImdyYW1tYXJOYW1lIiwiY29uZmlndXJhdGlvbiIsInNldFZhcmlhYmxlIiwiQW5hbHl0aWNzRXZlbnRzIiwiREVCVUdHRVJfRURJVF9WQVJJQUJMRSIsImxhbmd1YWdlIiwiYWRhcHRlclR5cGUiLCJjYW5TZXRWYXJpYWJsZSIsInByb2MiLCJzdXBwb3J0c1NldFZhcmlhYmxlIiwiY2FwYWJpbGl0aWVzIiwiaXNSZWFkT25seVRhcmdldCIsImlzUmVhZE9ubHkiLCJoYXNWYWxpZFBhcmVudFJlZmVyZW5jZSIsIk51bWJlciIsImlzTmFOIiwiU2NvcGUiLCJpbmRleCIsImV4cGVuc2l2ZSIsInJhbmdlIiwidGhyZWFkIiwiU3RhY2tGcmFtZSIsInNvdXJjZSIsInNjb3BlcyIsImdldFNjb3BlcyIsImZvcmNlUmVmcmVzaCIsIl9nZXRTY29wZXNJbXBsIiwicnMiLCJsaW5lIiwiUmFuZ2UiLCJjb2x1bW4iLCJlbmRMaW5lIiwiZW5kQ29sdW1uIiwiZ2V0TW9zdFNwZWNpZmljU2NvcGVzIiwicyIsImhhdmVSYW5nZUluZm8iLCJzb21lIiwic2NvcGVzQ29udGFpbmluZ1JhbmdlIiwic2NvcGUiLCJjb250YWluc1JhbmdlIiwic29ydCIsImZpcnN0Iiwic2Vjb25kIiwiZmlyc3RSYW5nZSIsInNlY29uZFJhbmdlIiwiZW5kIiwicm93IiwibGVuZ3RoIiwicmVzdGFydCIsInJlc3RhcnRGcmFtZSIsInRocmVhZElkIiwicmF3UGF0aCIsImxvY2FsUmF3UGF0aCIsImdldFBhdGgiLCJleGlzdHMiLCJUaHJlYWQiLCJfY2FsbFN0YWNrIiwiX3JlZnJlc2hJblByb2dyZXNzIiwic3RvcHBlZERldGFpbHMiLCJzdG9wcGVkIiwiX2dldEVtcHR5Q2FsbHN0YWNrU3RhdGUiLCJ2YWxpZCIsImNhbGxGcmFtZXMiLCJfaXNDYWxsc3RhY2tMb2FkZWQiLCJfaXNDYWxsc3RhY2tGdWxseUxvYWRlZCIsInRvdGFsRnJhbWVzIiwiYWRkaXRpb25hbEZyYW1lc0F2YWlsYWJsZSIsImN1cnJlbnRGcmFtZUNvdW50Iiwic3VwcG9ydHNEZWxheUxvYWRpbmciLCJzdXBwb3J0c0RlbGF5ZWRTdGFja1RyYWNlTG9hZGluZyIsImNsZWFyQ2FsbFN0YWNrIiwiZ2V0Q2FsbFN0YWNrVG9wRnJhbWUiLCJnZXRGdWxsQ2FsbFN0YWNrIiwibGV2ZWxzIiwiT2JzZXJ2YWJsZSIsIm9mIiwiRXhwZWN0IiwiZnJvbVByb21pc2UiLCJyZWZyZXNoQ2FsbFN0YWNrIiwic3dpdGNoTWFwIiwiZ2V0Q2FjaGVkQ2FsbFN0YWNrIiwiY2FsbFN0YWNrIiwiX2dldENhbGxTdGFja0ltcGwiLCJzcGxpY2UiLCJzdGFydEZyYW1lIiwic3RhY2tUcmFjZUFyZ3MiLCJzdGFja1RyYWNlIiwic3RhY2tGcmFtZXMiLCJyc2YiLCJnZXRTb3VyY2UiLCJmcmFtZXNFcnJvck1lc3NhZ2UiLCJleGNlcHRpb25JbmZvIiwicmVhc29uIiwic3VwcG9ydHNFeGNlcHRpb25JbmZvUmVxdWVzdCIsImRldGFpbHMiLCJkZXNjcmlwdGlvbiIsImJyZWFrTW9kZSIsImV4Y2VwdGlvbiIsImV4Y2VwdGlvbklkIiwibmV4dCIsIkRFQlVHR0VSX1NURVBfT1ZFUiIsInN0ZXBJbiIsIkRFQlVHR0VSX1NURVBfSU5UTyIsInN0ZXBPdXQiLCJERUJVR0dFUl9TVEVQX09VVCIsInN0ZXBCYWNrIiwiREVCVUdHRVJfU1RFUF9CQUNLIiwiY29udGludWUiLCJERUJVR0dFUl9TVEVQX0NPTlRJTlVFIiwicGF1c2UiLCJERUJVR0dFUl9TVEVQX1BBVVNFIiwicmV2ZXJzZUNvbnRpbnVlIiwiUHJvY2VzcyIsIl9zb3VyY2VzIiwiX3RocmVhZHMiLCJfc2Vzc2lvbiIsIl9jb25maWd1cmF0aW9uIiwiX3BlbmRpbmdTdGFydCIsIl9wZW5kaW5nU3RvcCIsImJyZWFrcG9pbnRzIiwiZXhjZXB0aW9uQnJlYWtwb2ludHMiLCJzb3VyY2VzIiwiZGVidWdnZXJNb2RlIiwiRGVidWdnZXJNb2RlIiwiU1RBUlRJTkciLCJTVE9QUElORyIsImdldEFsbFRocmVhZHMiLCJ0IiwiUEFVU0VEIiwiUlVOTklORyIsImNsZWFyUHJvY2Vzc1N0YXJ0aW5nRmxhZyIsInNldFN0b3BQZW5kaW5nIiwiaGFzIiwiZ2V0IiwiZ2V0VGhyZWFkIiwiQXJyYXkiLCJmcm9tIiwidmFsdWVzIiwicmF3U3RvcHBlZFVwZGF0ZSIsImRhdGEiLCJhbGxUaHJlYWRzU3RvcHBlZCIsImZvckVhY2giLCJyYXdUaHJlYWRVcGRhdGUiLCJjbGVhclRocmVhZHMiLCJyZW1vdmVUaHJlYWRzIiwiZGVsZXRlIiwiY2xlYXIiLCJjb21wbGV0aW9ucyIsInRleHQiLCJwb3NpdGlvbiIsIm92ZXJ3cml0ZUJlZm9yZSIsInN1cHBvcnRzQ29tcGxldGlvbnNSZXF1ZXN0IiwidGFyZ2V0cyIsImVycm9yIiwiQnJlYWtwb2ludCIsInVpQnJlYWtwb2ludElkIiwiZW5hYmxlZCIsImNvbmRpdGlvbiIsImxvZ01lc3NhZ2UiLCJhZGFwdGVyRGF0YSIsInZlcmlmaWVkIiwiaWRGcm9tQWRhcHRlciIsIm9yaWdpbmFsTGluZSIsImhpdENvdW50IiwidHJpbSIsIkZ1bmN0aW9uQnJlYWtwb2ludCIsImhpdENvbmRpdGlvbiIsIkV4Y2VwdGlvbkJyZWFrcG9pbnQiLCJsYWJlbCIsIkJSRUFLUE9JTlRTX0NIQU5HRUQiLCJXQVRDSF9FWFBSRVNTSU9OU19DSEFOR0VEIiwiQ0FMTFNUQUNLX0NIQU5HRUQiLCJQUk9DRVNTRVNfQ0hBTkdFRCIsIk1vZGVsIiwidWlCcmVha3BvaW50cyIsImJyZWFrcG9pbnRzQWN0aXZhdGVkIiwiZnVuY3Rpb25CcmVha3BvaW50cyIsIndhdGNoRXhwcmVzc2lvbnMiLCJnZXRGb2N1c2VkUHJvY2VzcyIsIl9wcm9jZXNzZXMiLCJfdWlCcmVha3BvaW50cyIsIl9icmVha3BvaW50c0FjdGl2YXRlZCIsIl9mdW5jdGlvbkJyZWFrcG9pbnRzIiwiX3dhdGNoRXhwcmVzc2lvbnMiLCJfZGlzcG9zYWJsZXMiLCJfZW1pdHRlciIsIl9nZXRGb2N1c2VkUHJvY2VzcyIsIl9tb3N0UmVjZW50RXhjZXB0aW9uQnJlYWtwb2ludHMiLCJFbWl0dGVyIiwiVW5pdmVyc2FsRGlzcG9zYWJsZSIsImdldFByb2Nlc3NlcyIsImFkZFByb2Nlc3MiLCJwcm9jZXNzQnJlYWtwb2ludHMiLCJ1aUJwIiwiZW1pdCIsInJlbW92ZVByb2Nlc3MiLCJyZW1vdmVkUHJvY2Vzc2VzIiwicCIsIm9uRGlkQ2hhbmdlQnJlYWtwb2ludHMiLCJjYWxsYmFjayIsIm9uIiwib25EaWRDaGFuZ2VDYWxsU3RhY2siLCJvbkRpZENoYW5nZVByb2Nlc3NlcyIsIm9uRGlkQ2hhbmdlV2F0Y2hFeHByZXNzaW9ucyIsInJhd1VwZGF0ZSIsInBvcCIsInRocmVhZEkiLCJmZXRjaEFsbEZyYW1lcyIsImZyYW1lc1RvTG9hZCIsImdldFVJQnJlYWtwb2ludHMiLCJnZXRCcmVha3BvaW50cyIsImZvY3VzZWRQcm9jZXNzIiwiY3VycmVudFByb2Nlc3MiLCJmaW5kIiwiYnAiLCJnZXRCcmVha3BvaW50QXRMaW5lIiwiYnJlYWtwb2ludCIsImdldEJyZWFrcG9pbnRCeUlkIiwiZ2V0RnVuY3Rpb25CcmVha3BvaW50cyIsImdldEV4Y2VwdGlvbkJyZWFrcG9pbnRzIiwic2V0RXhjZXB0aW9uQnJlYWtwb2ludHMiLCJkIiwiZWJwIiwiZGVmYXVsdCIsImFyZUJyZWFrcG9pbnRzQWN0aXZhdGVkIiwic2V0QnJlYWtwb2ludHNBY3RpdmF0ZWQiLCJhY3RpdmF0ZWQiLCJhZGRVSUJyZWFrcG9pbnRzIiwiZmlyZUV2ZW50IiwiX3NvcnRTeW5jQW5kRGVEdXAiLCJyZW1vdmVCcmVha3BvaW50cyIsInRvUmVtb3ZlIiwiciIsInVwZGF0ZUJyZWFrcG9pbnRzIiwibmV3QnBzIiwibiIsInVwZGF0ZVByb2Nlc3NCcmVha3BvaW50cyIsImJwRGF0YSIsIm51Y2xpZGVfaGl0Q291bnQiLCJvcHRpb25zIiwiY29tcGFyZXIiLCJsb2NhbGVDb21wYXJlIiwiYnBJZHMiLCJTZXQiLCJhZGQiLCJwcm9jZXNzQnBzIiwicHJvY2Vzc0JyZWFrcG9pbnQiLCJwcm9jZXNzQnAiLCJzZXRFbmFibGVtZW50IiwiZWxlbWVudCIsImVuYWJsZSIsImVuYWJsZU9yRGlzYWJsZUFsbEJyZWFrcG9pbnRzIiwiZmJwIiwiYWRkRnVuY3Rpb25CcmVha3BvaW50IiwiZnVuY3Rpb25OYW1lIiwibmV3RnVuY3Rpb25CcmVha3BvaW50IiwidXBkYXRlRnVuY3Rpb25CcmVha3BvaW50cyIsImZicERhdGEiLCJyZW1vdmVGdW5jdGlvbkJyZWFrcG9pbnRzIiwicmVtb3ZlZCIsImdldFdhdGNoRXhwcmVzc2lvbnMiLCJhZGRXYXRjaEV4cHJlc3Npb24iLCJ3ZSIsInJlbmFtZVdhdGNoRXhwcmVzc2lvbiIsIm5ld05hbWUiLCJmaWx0ZXJlZCIsInJlbW92ZVdhdGNoRXhwcmVzc2lvbnMiLCJzb3VyY2VJc05vdEF2YWlsYWJsZSIsImRpc3Bvc2UiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUF3REE7O0FBQ0E7O0FBQ0E7O0FBR0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBdkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBOENPLE1BQU1BLE1BQU4sQ0FBZ0M7QUFLckNDLEVBQUFBLFdBQVcsQ0FBQ0MsR0FBRCxFQUE2QkMsU0FBN0IsRUFBZ0Q7QUFBQSxTQUoxREMsR0FJMEQ7QUFBQSxTQUgzREMsU0FHMkQ7QUFBQSxTQUYzREMsSUFFMkQ7O0FBQ3pELFFBQUlKLEdBQUcsSUFBSSxJQUFYLEVBQWlCO0FBQ2YsV0FBS0ksSUFBTCxHQUFZO0FBQUVDLFFBQUFBLElBQUksRUFBRUM7QUFBUixPQUFaO0FBQ0QsS0FGRCxNQUVPO0FBQ0wsV0FBS0YsSUFBTCxHQUFZSixHQUFaO0FBQ0Q7O0FBQ0QsUUFBSSxLQUFLSSxJQUFMLENBQVVHLGVBQVYsSUFBNkIsSUFBN0IsSUFBcUMsS0FBS0gsSUFBTCxDQUFVRyxlQUFWLEdBQTRCLENBQXJFLEVBQXdFO0FBQ3RFLFlBQU1GLElBQUksR0FDUixLQUFLRCxJQUFMLENBQVVDLElBQVYsSUFBa0IsSUFBbEIsR0FDSSxLQUFLRCxJQUFMLENBQVVDLElBRGQsR0FFSSxLQUFLRCxJQUFMLENBQVVJLElBQVYsSUFBa0IsSUFBbEIsR0FDQUMsb0JBQVdDLFNBQVgsQ0FBcUIsS0FBS04sSUFBTCxDQUFVSSxJQUEvQixFQUFxQ0csSUFEckMsR0FFQUwseUJBTE47QUFNQSxXQUFLSixHQUFMLEdBQVksR0FBRVUsNEJBQWtCLElBQUdYLFNBQVUsSUFBRyxLQUFLRyxJQUFMLENBQVVHLGVBQWdCLElBQUdGLElBQUssRUFBbEY7QUFDRCxLQVJELE1BUU87QUFDTCxXQUFLSCxHQUFMLEdBQVcsS0FBS0UsSUFBTCxDQUFVSSxJQUFWLElBQWtCLEVBQTdCO0FBQ0Q7O0FBQ0QsU0FBS0wsU0FBTCxHQUFpQixLQUFLRCxHQUFMLEtBQWEsRUFBOUI7QUFDRDs7QUFFRCxNQUFJRyxJQUFKLEdBQW9CO0FBQ2xCLFdBQU8sS0FBS0QsSUFBTCxDQUFVQyxJQUFqQjtBQUNEOztBQUVELE1BQUlRLE1BQUosR0FBc0I7QUFDcEIsV0FBTyxLQUFLVCxJQUFMLENBQVVTLE1BQWpCO0FBQ0Q7O0FBRUQsTUFBSUMsZ0JBQUosR0FBZ0Q7QUFDOUMsV0FBTyxLQUFLVixJQUFMLENBQVVVLGdCQUFqQjtBQUNEOztBQUVELE1BQUlkLEdBQUosR0FBZ0M7QUFDOUIsV0FBTyxFQUNMLEdBQUcsS0FBS0k7QUFESCxLQUFQO0FBR0Q7O0FBRUQsTUFBSVcsU0FBSixHQUF5QjtBQUN2QixXQUFPLEtBQUtYLElBQUwsQ0FBVUcsZUFBakI7QUFDRDs7QUFFRCxNQUFJUyxRQUFKLEdBQXdCO0FBQ3RCLFdBQU8sS0FBS2QsR0FBTCxDQUFTZSxVQUFULENBQW9CTCw0QkFBcEIsQ0FBUDtBQUNEOztBQUVETSxFQUFBQSxZQUFZLEdBQTZCO0FBQ3ZDO0FBQ0EsV0FBT0MsSUFBSSxDQUFDQyxTQUFMLENBQWVDLElBQWYsQ0FBb0IsS0FBS25CLEdBQXpCLEVBQThCO0FBQ25Db0IsTUFBQUEsY0FBYyxFQUFFLElBRG1CO0FBRW5DQyxNQUFBQSxPQUFPLEVBQUU7QUFGMEIsS0FBOUIsQ0FBUDtBQUlEOztBQXpEb0M7Ozs7QUE0RGhDLE1BQU1DLG1CQUFOLENBQTBEO0FBRS9EO0FBWUF6QixFQUFBQSxXQUFXLENBQ1QwQixPQURTLEVBRVRWLFNBRlMsRUFHVFcsRUFIUyxFQUlUQyxjQUpTLEVBS1RDLGdCQUxTLEVBTVRDLGdCQU5TLEVBT1Q7QUFBQSxTQWhCRkMsTUFnQkU7QUFBQSxTQWZGQyxTQWVFO0FBQUEsU0FkRk4sT0FjRTtBQUFBLFNBYkZPLFVBYUU7QUFBQSxTQVpGQyxHQVlFO0FBQUEsU0FYRkMsZUFXRTtBQUFBLFNBVkZDLGlCQVVFO0FBQUEsU0FURkMsaUJBU0U7QUFDQSxTQUFLWCxPQUFMLEdBQWVBLE9BQWY7QUFDQSxTQUFLTyxVQUFMLEdBQWtCakIsU0FBbEI7QUFDQSxTQUFLa0IsR0FBTCxHQUFXUCxFQUFYO0FBQ0EsU0FBS1EsZUFBTCxHQUF1QlAsY0FBYyxJQUFJLENBQXpDO0FBQ0EsU0FBS1EsaUJBQUwsR0FBeUJQLGdCQUFnQixJQUFJLENBQTdDO0FBQ0EsU0FBS1EsaUJBQUwsR0FBeUJQLGdCQUFnQixJQUFJLENBQTdDO0FBQ0Q7O0FBRUQsTUFBSWQsU0FBSixHQUF3QjtBQUN0QixXQUFPLEtBQUtpQixVQUFaO0FBQ0Q7O0FBRUQsTUFBSWpCLFNBQUosQ0FBY3NCLEtBQWQsRUFBNkI7QUFDM0IsU0FBS0wsVUFBTCxHQUFrQkssS0FBbEI7QUFDQSxTQUFLTixTQUFMLEdBQWlCLElBQWpCO0FBQ0Q7O0FBRUQsTUFBSU8saUJBQUosR0FBaUM7QUFDL0IsV0FBTyxLQUFLSixlQUFMLEdBQXVCLEtBQUtDLGlCQUE1QixHQUFnRCxDQUF2RDtBQUNEOztBQUVESSxFQUFBQSxXQUFXLEdBQXlCO0FBQ2xDLFFBQUksS0FBS1IsU0FBTCxJQUFrQixJQUF0QixFQUE0QjtBQUMxQixXQUFLQSxTQUFMLEdBQWlCLEtBQUtTLGNBQUwsRUFBakI7QUFDRDs7QUFFRCxXQUFPLEtBQUtULFNBQVo7QUFDRDs7QUFFRCxRQUFNUyxjQUFOLEdBQTZDO0FBQzNDLFFBQUksQ0FBQyxLQUFLQyxXQUFMLEVBQUwsRUFBeUI7QUFDdkIsYUFBTyxFQUFQO0FBQ0Q7O0FBRUQsUUFBSSxDQUFDLEtBQUtDLG1CQUFWLEVBQStCO0FBQzdCLFlBQU1DLFNBQVMsR0FBRyxNQUFNLEtBQUtDLGVBQUwsRUFBeEI7QUFDQSxhQUFPRCxTQUFQO0FBQ0QsS0FSMEMsQ0FVM0M7OztBQUNBLFFBQUlFLGFBQStCLEdBQUcsRUFBdEM7O0FBQ0EsUUFBSUMsT0FBTyxDQUFDLEtBQUtaLGVBQU4sQ0FBWCxFQUFtQztBQUNqQ1csTUFBQUEsYUFBYSxHQUFHLE1BQU0sS0FBS0QsZUFBTCxDQUFxQkcsU0FBckIsRUFBZ0NBLFNBQWhDLEVBQTJDLE9BQTNDLENBQXRCO0FBQ0QsS0FkMEMsQ0FnQjNDOzs7QUFDQSxRQUFJQyxTQUFTLEdBQUd4QixtQkFBbUIsQ0FBQ3lCLGVBQXBDOztBQUNBLFdBQU8sS0FBS2QsaUJBQUwsR0FBeUJhLFNBQVMsR0FBR3hCLG1CQUFtQixDQUFDeUIsZUFBaEUsRUFBaUY7QUFDL0VELE1BQUFBLFNBQVMsSUFBSXhCLG1CQUFtQixDQUFDeUIsZUFBakM7QUFDRDs7QUFFRCxRQUFJLEtBQUtkLGlCQUFMLEdBQXlCYSxTQUE3QixFQUF3QztBQUN0QztBQUNBLFlBQU1FLGNBQWMsR0FBR0MsSUFBSSxDQUFDQyxJQUFMLENBQVUsS0FBS2pCLGlCQUFMLEdBQXlCYSxTQUFuQyxDQUF2Qjs7QUFDQSxXQUFLLElBQUlLLENBQUMsR0FBRyxDQUFiLEVBQWdCQSxDQUFDLEdBQUdILGNBQXBCLEVBQW9DRyxDQUFDLEVBQXJDLEVBQXlDO0FBQ3ZDLGNBQU1DLEtBQUssR0FBRyxLQUFLbEIsaUJBQUwsR0FBeUJpQixDQUFDLEdBQUdMLFNBQTNDO0FBQ0EsY0FBTU8sS0FBSyxHQUFHSixJQUFJLENBQUNLLEdBQUwsQ0FBU1IsU0FBVCxFQUFvQixLQUFLYixpQkFBTCxHQUF5QmtCLENBQUMsR0FBR0wsU0FBakQsQ0FBZDtBQUNBSCxRQUFBQSxhQUFhLENBQUNZLElBQWQsQ0FDRSxJQUFJQyxRQUFKLENBQ0UsS0FBS2pDLE9BRFAsRUFFRSxJQUZGLEVBR0UsS0FBS1YsU0FIUCxFQUlHLElBQUd1QyxLQUFNLEtBQUlBLEtBQUssR0FBR0MsS0FBUixHQUFnQixDQUFFLEdBSmxDLEVBS0UsRUFMRixFQU1FLEVBTkYsRUFPRSxJQVBGLEVBUUVBLEtBUkYsRUFTRTtBQUFFSSxVQUFBQSxJQUFJLEVBQUU7QUFBUixTQVRGLEVBVUUsSUFWRixFQVdFLElBWEYsRUFZRUwsS0FaRixDQURGO0FBZ0JEOztBQUVELGFBQU9ULGFBQVA7QUFDRDs7QUFFRCxVQUFNRixTQUFTLEdBQUcsTUFBTSxLQUFLQyxlQUFMLENBQXFCLEtBQUtSLGlCQUExQixFQUE2QyxLQUFLRCxpQkFBbEQsRUFBcUUsU0FBckUsQ0FBeEI7QUFDQSxXQUFPVSxhQUFhLENBQUNlLE1BQWQsQ0FBcUJqQixTQUFyQixDQUFQO0FBQ0Q7O0FBRURrQixFQUFBQSxLQUFLLEdBQVc7QUFDZCxXQUFPLEtBQUs1QixHQUFaO0FBQ0Q7O0FBRUQ2QixFQUFBQSxRQUFRLEdBQVc7QUFDakIsV0FBTyxLQUFLaEMsTUFBWjtBQUNEOztBQUVEVyxFQUFBQSxXQUFXLEdBQVk7QUFDckI7QUFDQSxXQUFPLEtBQUsxQixTQUFMLEdBQWlCLENBQXhCO0FBQ0Q7O0FBRUQsUUFBTTZCLGVBQU4sQ0FBc0JVLEtBQXRCLEVBQXNDQyxLQUF0QyxFQUFzRFEsTUFBdEQsRUFBMEc7QUFDeEcsVUFBTXRDLE9BQU8sR0FBRyxLQUFLQSxPQUFyQjtBQUNBLHlCQUFVQSxPQUFWOztBQUNBLFFBQUk7QUFDRixZQUFNdUMsUUFBeUMsR0FBRyxNQUFNdkMsT0FBTyxDQUFDd0MsT0FBUixDQUFnQnRCLFNBQWhCLENBQTBCO0FBQ2hGdUIsUUFBQUEsa0JBQWtCLEVBQUUsS0FBS25ELFNBRHVEO0FBRWhGdUMsUUFBQUEsS0FGZ0Y7QUFHaEZDLFFBQUFBLEtBSGdGO0FBSWhGUSxRQUFBQTtBQUpnRixPQUExQixDQUF4RDtBQU1BLFlBQU1wQixTQUFTLEdBQUcsMEJBQ2hCcUIsUUFBUSxDQUFDRyxJQUFULENBQWN4QixTQUFkLENBQXdCb0IsTUFBeEIsQ0FBZ0NLLENBQUQsSUFBT0EsQ0FBQyxJQUFJLElBQUwsSUFBYUEsQ0FBQyxDQUFDL0QsSUFBckQsQ0FEZ0IsRUFFZitELENBQUQsSUFBT0EsQ0FBQyxDQUFDL0QsSUFGTyxDQUFsQjtBQUlBLGFBQU9zQyxTQUFTLENBQUMwQixHQUFWLENBQ0pELENBQUQsSUFDRSxJQUFJVixRQUFKLENBQ0UsS0FBS2pDLE9BRFAsRUFFRSxJQUZGLEVBR0UyQyxDQUFDLENBQUNGLGtCQUhKLEVBSUVFLENBQUMsQ0FBQy9ELElBSkosRUFLRStELENBQUMsQ0FBQ0UsWUFMSixFQU1FRixDQUFDLENBQUMvQixLQU5KLEVBT0UrQixDQUFDLENBQUN6QyxjQVBKLEVBUUV5QyxDQUFDLENBQUN4QyxnQkFSSixFQVNFd0MsQ0FBQyxDQUFDdEQsZ0JBVEosRUFVRXNELENBQUMsQ0FBQ0csSUFWSixDQUZHLENBQVA7QUFlRCxLQTFCRCxDQTBCRSxPQUFPQyxDQUFQLEVBQVU7QUFDVixhQUFPLENBQUMsSUFBSWQsUUFBSixDQUFhLEtBQUtqQyxPQUFsQixFQUEyQixJQUEzQixFQUFpQyxDQUFqQyxFQUFvQyxJQUFwQyxFQUEwQytDLENBQUMsQ0FBQ0MsT0FBNUMsRUFBcUQsRUFBckQsRUFBeUQsQ0FBekQsRUFBNEQsQ0FBNUQsRUFBK0Q7QUFBRWQsUUFBQUEsSUFBSSxFQUFFO0FBQVIsT0FBL0QsRUFBb0YsSUFBcEYsRUFBMEYsS0FBMUYsQ0FBRCxDQUFQO0FBQ0Q7QUFDRixHQXJKOEQsQ0F1Si9EOzs7QUFDQSxNQUFJakIsbUJBQUosR0FBbUM7QUFDakMsV0FBT0ksT0FBTyxDQUFDLEtBQUtYLGlCQUFOLENBQWQ7QUFDRDs7QUFFRHVDLEVBQUFBLFFBQVEsQ0FBQ3JDLEtBQUQsRUFBZ0I7QUFDdEIsU0FBS1AsTUFBTCxHQUFjTyxLQUFkO0FBQ0FiLElBQUFBLG1CQUFtQixDQUFDbUQsU0FBcEIsQ0FBOEJDLEdBQTlCLENBQWtDLEtBQUtmLEtBQUwsRUFBbEMsRUFBZ0R4QixLQUFoRDtBQUNEOztBQUVEd0MsRUFBQUEsUUFBUSxHQUFXO0FBQ2pCLFdBQU8sS0FBSy9DLE1BQVo7QUFDRDs7QUFuSzhEOzs7QUFBcEROLG1CLENBQ0ptRCxTLEdBQWlDLElBQUlHLEdBQUosRTtBQUQ3QnRELG1CLENBR0p5QixlLEdBQWtCLEc7O0FBbUtwQixNQUFNOEIsVUFBTixTQUF5QnZELG1CQUF6QixDQUErRTtBQU9wRnpCLEVBQUFBLFdBQVcsQ0FBQ00sSUFBRCxFQUFlcUIsRUFBVyxHQUFHc0QsY0FBS0MsRUFBTCxFQUE3QixFQUF3QztBQUNqRCxVQUFNLElBQU4sRUFBWSxDQUFaLEVBQWV2RCxFQUFmO0FBRGlELFNBSm5EdkIsU0FJbUQ7QUFBQSxTQUhuRCtFLEtBR21EO0FBQUEsU0FGbkQ3RSxJQUVtRDtBQUVqRCxTQUFLQSxJQUFMLEdBQVlBLElBQVo7QUFDQSxTQUFLRixTQUFMLEdBQWlCLEtBQWpCO0FBQ0EsU0FBSytFLEtBQUwsR0FBYSxJQUFiLENBSmlELENBS2pEO0FBQ0E7O0FBQ0EsUUFBSTdFLElBQUosRUFBVTtBQUNSLFdBQUt5QixNQUFMLEdBQWNpRCxVQUFVLENBQUNJLGFBQXpCO0FBQ0Q7QUFDRjs7QUFFRCxNQUFJWixJQUFKLEdBQW9CO0FBQ2xCLFdBQU8sS0FBS1csS0FBWjtBQUNEOztBQUVELFFBQU1FLFFBQU4sQ0FBZTNELE9BQWYsRUFBbUM0RCxVQUFuQyxFQUE2REMsT0FBN0QsRUFBNkY7QUFDM0YsUUFBSTdELE9BQU8sSUFBSSxJQUFYLElBQW9CNEQsVUFBVSxJQUFJLElBQWQsSUFBc0JDLE9BQU8sS0FBSyxNQUExRCxFQUFtRTtBQUNqRSxXQUFLeEQsTUFBTCxHQUFjd0QsT0FBTyxLQUFLLE1BQVosR0FBcUIsMENBQXJCLEdBQWtFUCxVQUFVLENBQUNJLGFBQTNGO0FBQ0EsV0FBS2hGLFNBQUwsR0FBaUIsS0FBakI7QUFDQSxXQUFLWSxTQUFMLEdBQWlCLENBQWpCO0FBQ0E7QUFDRDs7QUFFRCxTQUFLVSxPQUFMLEdBQWVBLE9BQWY7O0FBQ0EsUUFBSTtBQUNGLFlBQU11QyxRQUF3QyxHQUFHLE1BQU12QyxPQUFPLENBQUN3QyxPQUFSLENBQWdCbUIsUUFBaEIsQ0FBeUI7QUFDOUVHLFFBQUFBLFVBQVUsRUFBRSxLQUFLbEYsSUFENkQ7QUFFOUVtRixRQUFBQSxPQUFPLEVBQUVILFVBQVUsR0FBR0EsVUFBVSxDQUFDRyxPQUFkLEdBQXdCekMsU0FGbUM7QUFHOUV1QyxRQUFBQTtBQUg4RSxPQUF6QixDQUF2RDtBQU1BLFdBQUtuRixTQUFMLEdBQWlCNkQsUUFBUSxJQUFJLElBQVosSUFBb0JBLFFBQVEsQ0FBQ0csSUFBVCxJQUFpQixJQUF0RDs7QUFDQSxVQUFJSCxRQUFRLElBQUlBLFFBQVEsQ0FBQ0csSUFBekIsRUFBK0I7QUFDN0IsYUFBS3JDLE1BQUwsR0FBY2tDLFFBQVEsQ0FBQ0csSUFBVCxDQUFjc0IsTUFBNUI7QUFDQSxhQUFLMUUsU0FBTCxHQUFpQmlELFFBQVEsQ0FBQ0csSUFBVCxDQUFjRCxrQkFBZCxJQUFvQyxDQUFyRDtBQUNBLGFBQUtoQyxlQUFMLEdBQXVCOEIsUUFBUSxDQUFDRyxJQUFULENBQWN4QyxjQUFkLElBQWdDLENBQXZEO0FBQ0EsYUFBS1EsaUJBQUwsR0FBeUI2QixRQUFRLENBQUNHLElBQVQsQ0FBY3ZDLGdCQUFkLElBQWtDLENBQTNEO0FBQ0EsYUFBS3NELEtBQUwsR0FBYWxCLFFBQVEsQ0FBQ0csSUFBVCxDQUFjSSxJQUEzQjtBQUNEO0FBQ0YsS0FmRCxDQWVFLE9BQU9tQixHQUFQLEVBQVk7QUFDWixXQUFLNUQsTUFBTCxHQUFjNEQsR0FBRyxDQUFDakIsT0FBbEI7QUFDQSxXQUFLdEUsU0FBTCxHQUFpQixLQUFqQjtBQUNBLFdBQUtZLFNBQUwsR0FBaUIsQ0FBakI7QUFDRDtBQUNGOztBQUVEOEQsRUFBQUEsUUFBUSxHQUFXO0FBQ2pCLFdBQVEsR0FBRSxLQUFLeEUsSUFBSyxLQUFJLEtBQUt5QixNQUFPLEVBQXBDO0FBQ0Q7O0FBeERtRjs7O0FBQXpFaUQsVSxDQUNKSSxhLEdBQWdCLGU7O0FBMERsQixNQUFNekIsUUFBTixTQUF1QmxDLG1CQUF2QixDQUFnRTtBQVFyRXpCLEVBQUFBLFdBQVcsQ0FDVDBCLE9BRFMsRUFFVGtFLE1BRlMsRUFHVDVFLFNBSFMsRUFJVFYsSUFKUyxFQUtUaUUsWUFMUyxFQU1UakMsS0FOUyxFQU9UVixjQVBTLEVBUVRDLGdCQVJTLEVBU1RkLGdCQVRTLEVBVVR5RCxJQVZTLEVBV1RwRSxTQUFtQixHQUFHLElBWGIsRUFZVGlDLGlCQVpTLEVBYVQ7QUFDQSxVQUNFWCxPQURGLEVBRUVWLFNBRkYsRUFHRTtBQUNDLGdCQUFXNEUsTUFBTSxDQUFDOUIsS0FBUCxFQUFlLElBQUd4RCxJQUFJLElBQUksU0FBVSxFQUpsRCxFQUtFc0IsY0FMRixFQU1FQyxnQkFORixFQU9FUSxpQkFQRjtBQURBLFNBcEJGdUQsTUFvQkU7QUFBQSxTQW5CRnRGLElBbUJFO0FBQUEsU0FsQkZpRSxZQWtCRTtBQUFBLFNBakJGeEQsZ0JBaUJFO0FBQUEsU0FoQkZvRSxLQWdCRTtBQUFBLFNBZkYvRSxTQWVFO0FBVUEsU0FBS3dGLE1BQUwsR0FBY0EsTUFBZDtBQUNBLFNBQUt0RixJQUFMLEdBQVlBLElBQUksSUFBSSxJQUFSLEdBQWUsU0FBZixHQUEyQkEsSUFBdkM7QUFDQSxTQUFLaUUsWUFBTCxHQUFvQkEsWUFBcEI7QUFDQSxTQUFLeEQsZ0JBQUwsR0FBd0JBLGdCQUF4QjtBQUNBLFNBQUtvRSxLQUFMLEdBQWFYLElBQWI7QUFDQSxTQUFLcEUsU0FBTCxHQUFpQkEsU0FBakI7QUFDQSxTQUFLMkIsTUFBTCxHQUFjTyxLQUFkO0FBQ0Q7O0FBRUQsTUFBSWtDLElBQUosR0FBb0I7QUFDbEIsV0FBTyxLQUFLVyxLQUFaO0FBQ0Q7O0FBRUQsTUFBSVUsV0FBSixHQUEyQjtBQUN6QixRQUFJLEtBQUtuRSxPQUFMLElBQWdCLElBQXBCLEVBQTBCO0FBQ3hCLGFBQU8sSUFBUDtBQUNEOztBQUNELFdBQU8sS0FBS0EsT0FBTCxDQUFhb0UsYUFBYixDQUEyQkQsV0FBbEM7QUFDRDs7QUFFRCxRQUFNRSxXQUFOLENBQWtCekQsS0FBbEIsRUFBZ0Q7QUFDOUMsVUFBTVosT0FBTyxHQUFHLHlCQUFXLEtBQUtBLE9BQWhCLENBQWhCO0FBQ0EsMEJBQU1zRSwyQkFBZ0JDLHNCQUF0QixFQUE4QztBQUM1Q0MsTUFBQUEsUUFBUSxFQUFFeEUsT0FBTyxDQUFDb0UsYUFBUixDQUFzQks7QUFEWSxLQUE5QztBQUdBLFVBQU1sQyxRQUFRLEdBQUcsTUFBTXZDLE9BQU8sQ0FBQ3dDLE9BQVIsQ0FBZ0I2QixXQUFoQixDQUE0QjtBQUNqRHpGLE1BQUFBLElBQUksRUFBRSx5QkFBVyxLQUFLQSxJQUFoQixDQUQyQztBQUVqRGdDLE1BQUFBLEtBRmlEO0FBR2pENkIsTUFBQUEsa0JBQWtCLEVBQUUsS0FBS3lCLE1BQUwsQ0FBWTVFO0FBSGlCLEtBQTVCLENBQXZCOztBQUtBLFFBQUlpRCxRQUFRLElBQUlBLFFBQVEsQ0FBQ0csSUFBekIsRUFBK0I7QUFDN0IsV0FBS3JDLE1BQUwsR0FBY2tDLFFBQVEsQ0FBQ0csSUFBVCxDQUFjOUIsS0FBNUI7QUFDQSxXQUFLNkMsS0FBTCxHQUFhbEIsUUFBUSxDQUFDRyxJQUFULENBQWNJLElBQWQsSUFBc0IsSUFBdEIsR0FBNkIsS0FBS1csS0FBbEMsR0FBMENsQixRQUFRLENBQUNHLElBQVQsQ0FBY0ksSUFBckU7QUFDQSxXQUFLeEQsU0FBTCxHQUFpQmlELFFBQVEsQ0FBQ0csSUFBVCxDQUFjRCxrQkFBZCxJQUFvQyxDQUFyRDtBQUNBLFdBQUtoQyxlQUFMLEdBQXVCOEIsUUFBUSxDQUFDRyxJQUFULENBQWN4QyxjQUFkLElBQWdDLENBQXZEO0FBQ0EsV0FBS1EsaUJBQUwsR0FBeUI2QixRQUFRLENBQUNHLElBQVQsQ0FBY3ZDLGdCQUFkLElBQWtDLENBQTNEO0FBQ0Q7QUFDRjs7QUFFRHVFLEVBQUFBLGNBQWMsR0FBWTtBQUN4QixVQUFNQyxJQUFJLEdBQUcsS0FBSzNFLE9BQWxCOztBQUNBLFFBQUkyRSxJQUFJLElBQUksSUFBWixFQUFrQjtBQUNoQixhQUFPLEtBQVA7QUFDRDs7QUFFRCxVQUFNQyxtQkFBbUIsR0FBR3ZELE9BQU8sQ0FBQ3NELElBQUksQ0FBQ25DLE9BQUwsQ0FBYXFDLFlBQWIsQ0FBMEJELG1CQUEzQixDQUFuQyxDQU53QixDQVF4QjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBQ0EsVUFBTUUsZ0JBQWdCLEdBQUd6RCxPQUFPLENBQUNzRCxJQUFJLENBQUNQLGFBQUwsQ0FBbUJXLFVBQXBCLENBQWhDO0FBQ0EsVUFBTUMsdUJBQXVCLEdBQzNCLEtBQUtkLE1BQUwsQ0FBWTVFLFNBQVosSUFBeUIsSUFBekIsSUFBaUMsQ0FBQzJGLE1BQU0sQ0FBQ0MsS0FBUCxDQUFhLEtBQUtoQixNQUFMLENBQVk1RSxTQUF6QixDQUFsQyxJQUF5RSxLQUFLNEUsTUFBTCxDQUFZNUUsU0FBWixJQUF5QixDQURwRztBQUVBLFdBQU8sQ0FBQ3dGLGdCQUFELElBQXFCRixtQkFBckIsSUFBNENJLHVCQUE1QyxJQUF1RSxDQUFDLEtBQUtoRSxXQUFMLEVBQS9FO0FBQ0Q7O0FBRURvQyxFQUFBQSxRQUFRLEdBQVc7QUFDakIsV0FBUSxHQUFFLEtBQUt4RSxJQUFLLEtBQUksS0FBS3lCLE1BQU8sRUFBcEM7QUFDRDs7QUE1Rm9FOzs7O0FBK0ZoRSxNQUFNOEUsS0FBTixTQUFvQnBGLG1CQUFwQixDQUEwRDtBQUsvRHpCLEVBQUFBLFdBQVcsQ0FDVHNGLFVBRFMsRUFFVHdCLEtBRlMsRUFHVHhHLElBSFMsRUFJVFUsU0FKUyxFQUtUK0YsU0FMUyxFQU1UbkYsY0FOUyxFQU9UQyxnQkFQUyxFQVFUbUYsS0FSUyxFQVNUO0FBQ0EsVUFDRTFCLFVBQVUsQ0FBQzJCLE1BQVgsQ0FBa0J2RixPQURwQixFQUVFVixTQUZGLEVBR0csU0FBUXNFLFVBQVUsQ0FBQ3hCLEtBQVgsRUFBbUIsSUFBR3hELElBQUssSUFBR3dHLEtBQU0sRUFIL0MsRUFJRWxGLGNBSkYsRUFLRUMsZ0JBTEY7QUFEQSxTQWJEdkIsSUFhQztBQUFBLFNBWkR5RyxTQVlDO0FBQUEsU0FYREMsS0FXQztBQVFBLFNBQUsxRyxJQUFMLEdBQVlBLElBQVo7QUFDQSxTQUFLeUcsU0FBTCxHQUFpQkEsU0FBakI7QUFDQSxTQUFLQyxLQUFMLEdBQWFBLEtBQWI7QUFDRDs7QUF6QjhEOzs7O0FBNEIxRCxNQUFNRSxVQUFOLENBQXdDO0FBVTdDbEgsRUFBQUEsV0FBVyxDQUNUaUgsTUFEUyxFQUVUeEIsT0FGUyxFQUdUMEIsTUFIUyxFQUlUN0csSUFKUyxFQUtUUyxnQkFMUyxFQU1UaUcsS0FOUyxFQU9URixLQVBTLEVBUVQ7QUFBQSxTQWpCRk0sTUFpQkU7QUFBQSxTQWhCRkgsTUFnQkU7QUFBQSxTQWZGeEIsT0FlRTtBQUFBLFNBZEYwQixNQWNFO0FBQUEsU0FiRjdHLElBYUU7QUFBQSxTQVpGUyxnQkFZRTtBQUFBLFNBWEZpRyxLQVdFO0FBQUEsU0FWRkYsS0FVRTtBQUNBLFNBQUtHLE1BQUwsR0FBY0EsTUFBZDtBQUNBLFNBQUt4QixPQUFMLEdBQWVBLE9BQWY7QUFDQSxTQUFLMEIsTUFBTCxHQUFjQSxNQUFkO0FBQ0EsU0FBSzdHLElBQUwsR0FBWUEsSUFBWjtBQUNBLFNBQUtTLGdCQUFMLEdBQXdCQSxnQkFBeEI7QUFDQSxTQUFLaUcsS0FBTCxHQUFhQSxLQUFiO0FBQ0EsU0FBS0YsS0FBTCxHQUFhQSxLQUFiO0FBQ0EsU0FBS00sTUFBTCxHQUFjLElBQWQ7QUFDRDs7QUFFRHRELEVBQUFBLEtBQUssR0FBVztBQUNkLFdBQVEsY0FBYSxLQUFLbUQsTUFBTCxDQUFZbkQsS0FBWixFQUFvQixJQUFHLEtBQUsyQixPQUFRLElBQUcsS0FBS3FCLEtBQU0sRUFBdkU7QUFDRDs7QUFFRCxRQUFNTyxTQUFOLENBQWdCQyxZQUFoQixFQUEwRDtBQUN4RCxRQUFJLEtBQUtGLE1BQUwsSUFBZSxJQUFmLElBQXVCRSxZQUEzQixFQUF5QztBQUN2QyxXQUFLRixNQUFMLEdBQWMsS0FBS0csY0FBTCxFQUFkO0FBQ0Q7O0FBQ0QsV0FBUSxLQUFLSCxNQUFiO0FBQ0Q7O0FBRUQsUUFBTUcsY0FBTixHQUF5QztBQUN2QyxRQUFJO0FBQ0YsWUFBTTtBQUNKbkQsUUFBQUEsSUFBSSxFQUFFO0FBQUVnRCxVQUFBQTtBQUFGO0FBREYsVUFFRixNQUFNLEtBQUtILE1BQUwsQ0FBWXZGLE9BQVosQ0FBb0J3QyxPQUFwQixDQUE0QmtELE1BQTVCLENBQW1DO0FBQzNDM0IsUUFBQUEsT0FBTyxFQUFFLEtBQUtBO0FBRDZCLE9BQW5DLENBRlY7QUFLQSxhQUFPMkIsTUFBTSxDQUFDOUMsR0FBUCxDQUNMLENBQUNrRCxFQUFELEVBQUtWLEtBQUwsS0FDRSxJQUFJRCxLQUFKLENBQ0UsSUFERixFQUVFQyxLQUZGLEVBR0VVLEVBQUUsQ0FBQ2xILElBSEwsRUFJRWtILEVBQUUsQ0FBQ3JELGtCQUpMLEVBS0VxRCxFQUFFLENBQUNULFNBTEwsRUFNRVMsRUFBRSxDQUFDNUYsY0FOTCxFQU9FNEYsRUFBRSxDQUFDM0YsZ0JBUEwsRUFRRTJGLEVBQUUsQ0FBQ0MsSUFBSCxJQUFXLElBQVgsR0FDSSxJQUFJQyxXQUFKLENBQ0UsQ0FBQ0YsRUFBRSxDQUFDQyxJQUFILEdBQVUsQ0FBWCxFQUFjLENBQUNELEVBQUUsQ0FBQ0csTUFBSCxJQUFhLElBQWIsR0FBb0JILEVBQUUsQ0FBQ0csTUFBdkIsR0FBZ0MsQ0FBakMsSUFBc0MsQ0FBcEQsQ0FERixFQUVFLENBQUMsQ0FBQ0gsRUFBRSxDQUFDSSxPQUFILElBQWMsSUFBZCxHQUFxQkosRUFBRSxDQUFDSSxPQUF4QixHQUFrQ0osRUFBRSxDQUFDQyxJQUF0QyxJQUE4QyxDQUEvQyxFQUFrRCxDQUFDRCxFQUFFLENBQUNLLFNBQUgsSUFBZ0IsSUFBaEIsR0FBdUJMLEVBQUUsQ0FBQ0ssU0FBMUIsR0FBc0MsQ0FBdkMsSUFBNEMsQ0FBOUYsQ0FGRixDQURKLEdBS0ksSUFiTixDQUZHLENBQVA7QUFrQkQsS0F4QkQsQ0F3QkUsT0FBT2xDLEdBQVAsRUFBWTtBQUNaLGFBQU8sRUFBUDtBQUNEO0FBQ0Y7O0FBRUQsUUFBTW1DLHFCQUFOLENBQTRCZCxLQUE1QixFQUFrRTtBQUNoRSxVQUFNSSxNQUFxQixHQUFHLENBQUMsTUFBTSxLQUFLQyxTQUFMLENBQWUsS0FBZixDQUFQLEVBQThCckQsTUFBOUIsQ0FBc0MrRCxDQUFELElBQU8sQ0FBQ0EsQ0FBQyxDQUFDaEIsU0FBL0MsQ0FBOUI7QUFDQSxVQUFNaUIsYUFBYSxHQUFHWixNQUFNLENBQUNhLElBQVAsQ0FBYUYsQ0FBRCxJQUFPQSxDQUFDLENBQUNmLEtBQUYsSUFBVyxJQUE5QixDQUF0Qjs7QUFDQSxRQUFJLENBQUNnQixhQUFMLEVBQW9CO0FBQ2xCLGFBQU9aLE1BQVA7QUFDRDs7QUFFRCxVQUFNYyxxQkFBcUIsR0FBR2QsTUFBTSxDQUNqQ3BELE1BRDJCLENBQ25CbUUsS0FBRCxJQUFXQSxLQUFLLENBQUNuQixLQUFOLElBQWUsSUFBZixJQUF1Qm1CLEtBQUssQ0FBQ25CLEtBQU4sQ0FBWW9CLGFBQVosQ0FBMEJwQixLQUExQixDQURkLEVBRTNCcUIsSUFGMkIsQ0FFdEIsQ0FBQ0MsS0FBRCxFQUFRQyxNQUFSLEtBQW1CO0FBQ3ZCLFlBQU1DLFVBQVUsR0FBRyx5QkFBV0YsS0FBSyxDQUFDdEIsS0FBakIsQ0FBbkI7QUFDQSxZQUFNeUIsV0FBVyxHQUFHLHlCQUFXRixNQUFNLENBQUN2QixLQUFsQixDQUFwQixDQUZ1QixDQUd2Qjs7QUFDQSxhQUFRd0IsVUFBVSxDQUFDRSxHQUFYLENBQWVDLEdBQWYsR0FBcUJILFVBQVUsQ0FBQ2pGLEtBQVgsQ0FBaUJvRixHQUF2QyxJQUNKRixXQUFXLENBQUNDLEdBQVosQ0FBZ0JDLEdBQWhCLEdBQXNCRixXQUFXLENBQUNDLEdBQVosQ0FBZ0JDLEdBRGxDLENBQVA7QUFFRCxLQVIyQixDQUE5QjtBQVNBLFdBQU9ULHFCQUFxQixDQUFDVSxNQUF0QixHQUErQlYscUJBQS9CLEdBQXVEZCxNQUE5RDtBQUNEOztBQUVELFFBQU15QixPQUFOLEdBQStCO0FBQzdCLFVBQU0sS0FBSzVCLE1BQUwsQ0FBWXZGLE9BQVosQ0FBb0J3QyxPQUFwQixDQUE0QjRFLFlBQTVCLENBQXlDO0FBQUVyRCxNQUFBQSxPQUFPLEVBQUUsS0FBS0E7QUFBaEIsS0FBekMsRUFBb0UsS0FBS3dCLE1BQUwsQ0FBWThCLFFBQWhGLENBQU47QUFDRDs7QUFFRGpFLEVBQUFBLFFBQVEsR0FBVztBQUNqQixXQUFRLEdBQUUsS0FBS3hFLElBQUssS0FBSSxLQUFLNkcsTUFBTCxDQUFZbEcsUUFBWixHQUF1Qix5QkFBVyxLQUFLa0csTUFBTCxDQUFZN0csSUFBdkIsQ0FBdkIsR0FBc0QsS0FBSzZHLE1BQUwsQ0FBWWhILEdBQUksSUFDNUYsS0FBSzZHLEtBQUwsQ0FBV3pELEtBQVgsQ0FBaUJvRixHQUNsQixHQUZEO0FBR0Q7O0FBRUQsUUFBTXhILFlBQU4sR0FBZ0Q7QUFDOUMsVUFBTTZILE9BQU8sR0FBRyxLQUFLN0IsTUFBTCxDQUFZbEgsR0FBWixDQUFnQlEsSUFBaEM7O0FBQ0EsVUFBTXdJLFlBQVksR0FBR3ZJLG9CQUFXd0ksT0FBWCxDQUFtQkYsT0FBTyxJQUFJLEVBQTlCLENBQXJCOztBQUNBLFFBQ0VBLE9BQU8sSUFBSSxJQUFYLElBQ0FDLFlBQVksS0FBSyxFQURqQixLQUVDLE1BQU0sd0VBQTRDRCxPQUE1QyxFQUFxREcsTUFBckQsQ0FBNERGLFlBQTVELENBRlAsQ0FERixFQUlFO0FBQ0EsYUFBTywrQkFBbUJELE9BQW5CLEVBQTRCLEtBQUtoQyxLQUFMLENBQVd6RCxLQUFYLENBQWlCb0YsR0FBN0MsQ0FBUDtBQUNEOztBQUNELFFBQUksS0FBS3hCLE1BQUwsQ0FBWS9HLFNBQWhCLEVBQTJCO0FBQ3pCLGFBQU8sK0JBQW1CLEtBQUsrRyxNQUFMLENBQVloSCxHQUEvQixFQUFvQyxLQUFLNkcsS0FBTCxDQUFXekQsS0FBWCxDQUFpQm9GLEdBQXJELENBQVA7QUFDRDs7QUFDRCxXQUFPLElBQVA7QUFDRDs7QUFqSDRDOzs7O0FBeUh4QyxNQUFNUyxNQUFOLENBQWdDO0FBU3JDcEosRUFBQUEsV0FBVyxDQUFDMEIsT0FBRCxFQUFvQnBCLElBQXBCLEVBQWtDeUksUUFBbEMsRUFBb0Q7QUFBQSxTQVIvRE0sVUFRK0Q7QUFBQSxTQVAvREMsa0JBTytEO0FBQUEsU0FOL0RDLGNBTStEO0FBQUEsU0FML0RDLE9BSytEO0FBQUEsU0FKOUQ5SCxPQUk4RDtBQUFBLFNBSDlEcUgsUUFHOEQ7QUFBQSxTQUYvRHpJLElBRStEO0FBQzdELFNBQUtvQixPQUFMLEdBQWVBLE9BQWY7QUFDQSxTQUFLcEIsSUFBTCxHQUFZQSxJQUFaO0FBQ0EsU0FBS3lJLFFBQUwsR0FBZ0JBLFFBQWhCO0FBQ0EsU0FBS1EsY0FBTCxHQUFzQixJQUF0QjtBQUNBLFNBQUtGLFVBQUwsR0FBa0IsS0FBS0ksdUJBQUwsRUFBbEI7QUFDQSxTQUFLRCxPQUFMLEdBQWUsS0FBZjtBQUNBLFNBQUtGLGtCQUFMLEdBQTBCLEtBQTFCO0FBQ0Q7O0FBRURHLEVBQUFBLHVCQUF1QixHQUFjO0FBQ25DLFdBQU87QUFDTEMsTUFBQUEsS0FBSyxFQUFFLEtBREY7QUFFTEMsTUFBQUEsVUFBVSxFQUFFO0FBRlAsS0FBUDtBQUlEOztBQUVEQyxFQUFBQSxrQkFBa0IsR0FBWTtBQUM1QixXQUFPLEtBQUtQLFVBQUwsQ0FBZ0JLLEtBQXZCO0FBQ0Q7O0FBRURHLEVBQUFBLHVCQUF1QixHQUFZO0FBQ2pDLFdBQ0UsS0FBS0Qsa0JBQUwsTUFDQSxLQUFLTCxjQUFMLElBQXVCLElBRHZCLElBRUEsS0FBS0EsY0FBTCxDQUFvQk8sV0FBcEIsSUFBbUMsSUFGbkMsSUFHQSxDQUFDbkQsTUFBTSxDQUFDQyxLQUFQLENBQWEsS0FBSzJDLGNBQUwsQ0FBb0JPLFdBQWpDLENBSEQsSUFJQSxLQUFLUCxjQUFMLENBQW9CTyxXQUFwQixJQUFtQyxDQUpuQyxJQUtBLEtBQUtULFVBQUwsQ0FBZ0JNLFVBQWhCLENBQTJCZixNQUEzQixJQUFxQyxLQUFLVyxjQUFMLENBQW9CTyxXQU4zRDtBQVFEOztBQUVEaEcsRUFBQUEsS0FBSyxHQUFXO0FBQ2QsV0FBUSxVQUFTLEtBQUtwQyxPQUFMLENBQWFvQyxLQUFiLEVBQXFCLElBQUcsS0FBS2lGLFFBQVMsRUFBdkQ7QUFDRDs7QUFFRGdCLEVBQUFBLHlCQUF5QixDQUFDQyxpQkFBRCxFQUFxQztBQUM1RCxRQUFJLEtBQUtYLFVBQUwsQ0FBZ0JNLFVBQWhCLENBQTJCZixNQUEzQixHQUFvQ29CLGlCQUF4QyxFQUEyRDtBQUN6RCxhQUFPLElBQVA7QUFDRDs7QUFDRCxVQUFNQyxvQkFBb0IsR0FBRyx5QkFBVyxLQUFLdkksT0FBaEIsRUFBeUJ3QyxPQUF6QixDQUFpQ3FDLFlBQWpDLENBQThDMkQsZ0NBQTlDLEtBQW1GLElBQWhIOztBQUNBLFFBQ0VELG9CQUFvQixJQUNwQixLQUFLVixjQUFMLElBQXVCLElBRHZCLElBRUEsS0FBS0EsY0FBTCxDQUFvQk8sV0FBcEIsSUFBbUMsSUFGbkMsSUFHQSxLQUFLUCxjQUFMLENBQW9CTyxXQUFwQixHQUFrQ0UsaUJBSnBDLEVBS0U7QUFDQSxhQUFPLElBQVA7QUFDRDs7QUFFRCxXQUFPLEtBQVA7QUFDRDs7QUFFREcsRUFBQUEsY0FBYyxHQUFTO0FBQ3JCLFNBQUtkLFVBQUwsR0FBa0IsS0FBS0ksdUJBQUwsRUFBbEI7QUFDRDs7QUFFRFcsRUFBQUEsb0JBQW9CLEdBQWlCO0FBQ25DLFdBQU8sS0FBS1Isa0JBQUwsS0FBNEIsS0FBS1AsVUFBTCxDQUFnQk0sVUFBaEIsQ0FBMkIsQ0FBM0IsQ0FBNUIsR0FBNEQsSUFBbkU7QUFDRDs7QUFFRFUsRUFBQUEsZ0JBQWdCLENBQUNDLE1BQUQsRUFBdUQ7QUFDckUsUUFDRSxLQUFLaEIsa0JBQUwsSUFDQSxLQUFLTyx1QkFBTCxFQURBLElBRUNTLE1BQU0sSUFBSSxJQUFWLElBQWtCLEtBQUtWLGtCQUFMLEVBQWxCLElBQStDLEtBQUtQLFVBQUwsQ0FBZ0JNLFVBQWhCLENBQTJCZixNQUEzQixJQUFxQzBCLE1BSHZGLEVBSUU7QUFDQTtBQUNBLGFBQU9DLDZCQUFXQyxFQUFYLENBQWNDLGlCQUFPbkksS0FBUCxDQUFhLEtBQUsrRyxVQUFMLENBQWdCTSxVQUE3QixDQUFkLENBQVA7QUFDRCxLQVJvRSxDQVVyRTtBQUNBOzs7QUFDQSxXQUFPWSw2QkFBVzFHLE1BQVgsQ0FDTDBHLDZCQUFXQyxFQUFYLENBQWNDLGlCQUFPakosT0FBUCxFQUFkLENBREssRUFFTCtJLDZCQUFXRyxXQUFYLENBQXVCLEtBQUtDLGdCQUFMLENBQXNCTCxNQUF0QixDQUF2QixFQUFzRE0sU0FBdEQsQ0FBZ0UsTUFDOURMLDZCQUFXQyxFQUFYLENBQWNDLGlCQUFPbkksS0FBUCxDQUFhLEtBQUsrRyxVQUFMLENBQWdCTSxVQUE3QixDQUFkLENBREYsQ0FGSyxDQUFQO0FBTUQ7O0FBRURrQixFQUFBQSxrQkFBa0IsR0FBa0I7QUFDbEMsV0FBTyxLQUFLeEIsVUFBTCxDQUFnQk0sVUFBdkI7QUFDRDtBQUVEO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUFDRSxRQUFNZ0IsZ0JBQU4sQ0FBdUJMLE1BQXZCLEVBQXVEO0FBQ3JELFFBQUksQ0FBQyxLQUFLZCxPQUFWLEVBQW1CO0FBQ2pCO0FBQ0Q7O0FBRUQsVUFBTVMsb0JBQW9CLEdBQUcseUJBQVcsS0FBS3ZJLE9BQWhCLEVBQXlCd0MsT0FBekIsQ0FBaUNxQyxZQUFqQyxDQUE4QzJELGdDQUE5QyxLQUFtRixJQUFoSDtBQUVBLFNBQUtaLGtCQUFMLEdBQTBCLElBQTFCOztBQUNBLFFBQUk7QUFDRixVQUFJVyxvQkFBSixFQUEwQjtBQUN4QixjQUFNMUcsS0FBSyxHQUFHLEtBQUs4RixVQUFMLENBQWdCTSxVQUFoQixDQUEyQmYsTUFBekM7QUFDQSxjQUFNa0MsU0FBUyxHQUFHLE1BQU0sS0FBS0MsaUJBQUwsQ0FBdUJ4SCxLQUF2QixFQUE4QitHLE1BQTlCLENBQXhCOztBQUNBLFlBQUkvRyxLQUFLLEdBQUcsS0FBSzhGLFVBQUwsQ0FBZ0JNLFVBQWhCLENBQTJCZixNQUF2QyxFQUErQztBQUM3QztBQUNBO0FBQ0EsZUFBS1MsVUFBTCxDQUFnQk0sVUFBaEIsQ0FBMkJxQixNQUEzQixDQUFrQ3pILEtBQWxDLEVBQXlDLEtBQUs4RixVQUFMLENBQWdCTSxVQUFoQixDQUEyQmYsTUFBM0IsR0FBb0NyRixLQUE3RTtBQUNEOztBQUNELGFBQUs4RixVQUFMLENBQWdCTSxVQUFoQixHQUE2QixLQUFLTixVQUFMLENBQWdCTSxVQUFoQixDQUEyQjlGLE1BQTNCLENBQWtDaUgsU0FBUyxJQUFJLEVBQS9DLENBQTdCO0FBQ0QsT0FURCxNQVNPO0FBQ0w7QUFDQTtBQUNBLGFBQUt6QixVQUFMLENBQWdCTSxVQUFoQixHQUE2QixDQUFDLE1BQU0sS0FBS29CLGlCQUFMLENBQXVCLENBQXZCLEVBQTBCLElBQTFCLENBQVAsS0FBMkMsRUFBeEU7QUFDRDs7QUFFRCxXQUFLMUIsVUFBTCxDQUFnQkssS0FBaEIsR0FBd0IsSUFBeEI7QUFDRCxLQWpCRCxTQWlCVTtBQUNSLFdBQUtKLGtCQUFMLEdBQTBCLEtBQTFCO0FBQ0Q7QUFDRjs7QUFFRCxRQUFNeUIsaUJBQU4sQ0FBd0JFLFVBQXhCLEVBQTRDWCxNQUE1QyxFQUFxRjtBQUNuRixRQUFJO0FBQ0YsWUFBTVksY0FBaUQsR0FBRztBQUN4RG5DLFFBQUFBLFFBQVEsRUFBRSxLQUFLQSxRQUR5QztBQUV4RGtDLFFBQUFBO0FBRndELE9BQTFELENBREUsQ0FNRjtBQUNBOztBQUNBLFVBQUlYLE1BQU0sSUFBSSxJQUFkLEVBQW9CO0FBQ2xCWSxRQUFBQSxjQUFjLENBQUNaLE1BQWYsR0FBd0JBLE1BQXhCO0FBQ0Q7O0FBRUQsWUFBTXJHLFFBQTBDLEdBQUcsTUFBTSxLQUFLdkMsT0FBTCxDQUFhd0MsT0FBYixDQUFxQmlILFVBQXJCLENBQWdDRCxjQUFoQyxDQUF6RDs7QUFDQSxVQUFJakgsUUFBUSxJQUFJLElBQVosSUFBb0JBLFFBQVEsQ0FBQ0csSUFBVCxJQUFpQixJQUF6QyxFQUErQztBQUM3QyxlQUFPLEVBQVA7QUFDRDs7QUFDRCxVQUFJLEtBQUttRixjQUFMLElBQXVCLElBQTNCLEVBQWlDO0FBQy9CLGFBQUtBLGNBQUwsQ0FBb0JPLFdBQXBCLEdBQWtDN0YsUUFBUSxDQUFDRyxJQUFULENBQWMwRixXQUFoRDtBQUNEOztBQUVELGFBQU83RixRQUFRLENBQUNHLElBQVQsQ0FBY2dILFdBQWQsQ0FBMEI5RyxHQUExQixDQUE4QixDQUFDK0csR0FBRCxFQUFNdkUsS0FBTixLQUFnQjtBQUNuRCxjQUFNSyxNQUFNLEdBQUcsS0FBS3pGLE9BQUwsQ0FBYTRKLFNBQWIsQ0FBdUJELEdBQUcsQ0FBQ2xFLE1BQTNCLENBQWY7QUFFQSxlQUFPLElBQUlELFVBQUosQ0FDTCxJQURLLEVBRUxtRSxHQUFHLENBQUMxSixFQUZDLEVBR0x3RixNQUhLLEVBSUxrRSxHQUFHLENBQUMvSyxJQUpDLEVBS0wrSyxHQUFHLENBQUN0SyxnQkFMQyxFQU1MO0FBQ0EsWUFBSTJHLFdBQUosQ0FDRSxDQUFDMkQsR0FBRyxDQUFDNUQsSUFBSixHQUFXLENBQVosRUFBZSxDQUFDNEQsR0FBRyxDQUFDMUQsTUFBSixJQUFjLENBQWYsSUFBb0IsQ0FBbkMsQ0FERixFQUVFLENBQUMsQ0FBQzBELEdBQUcsQ0FBQ3pELE9BQUosSUFBZSxJQUFmLEdBQXNCeUQsR0FBRyxDQUFDekQsT0FBMUIsR0FBb0N5RCxHQUFHLENBQUM1RCxJQUF6QyxJQUFpRCxDQUFsRCxFQUFxRCxDQUFDNEQsR0FBRyxDQUFDeEQsU0FBSixJQUFpQixJQUFqQixHQUF3QndELEdBQUcsQ0FBQ3hELFNBQTVCLEdBQXdDLENBQXpDLElBQThDLENBQW5HLENBRkYsQ0FQSyxFQVdMb0QsVUFBVSxHQUFHbkUsS0FYUixDQUFQO0FBYUQsT0FoQk0sQ0FBUDtBQWlCRCxLQXJDRCxDQXFDRSxPQUFPbkIsR0FBUCxFQUFZO0FBQ1osVUFBSSxLQUFLNEQsY0FBTCxJQUF1QixJQUEzQixFQUFpQztBQUMvQixhQUFLQSxjQUFMLENBQW9CZ0Msa0JBQXBCLEdBQXlDNUYsR0FBRyxDQUFDakIsT0FBN0M7QUFDRDs7QUFFRCxhQUFPLEVBQVA7QUFDRDtBQUNGO0FBRUQ7QUFDRjtBQUNBOzs7QUFDRSxRQUFNOEcsYUFBTixHQUFnRDtBQUM5QyxVQUFNdEgsT0FBTyxHQUFHLEtBQUt4QyxPQUFMLENBQWF3QyxPQUE3Qjs7QUFDQSxRQUFJLEtBQUtxRixjQUFMLElBQXVCLElBQXZCLElBQStCLEtBQUtBLGNBQUwsQ0FBb0JrQyxNQUFwQixLQUErQixXQUFsRSxFQUErRTtBQUM3RSxhQUFPLElBQVA7QUFDRDs7QUFDRCxVQUFNbEMsY0FBYyxHQUFHLEtBQUtBLGNBQTVCOztBQUNBLFFBQUksQ0FBQ3JGLE9BQU8sQ0FBQ3FDLFlBQVIsQ0FBcUJtRiw0QkFBMUIsRUFBd0Q7QUFDdEQsYUFBTztBQUNML0osUUFBQUEsRUFBRSxFQUFFLElBREM7QUFFTGdLLFFBQUFBLE9BQU8sRUFBRSxJQUZKO0FBR0xDLFFBQUFBLFdBQVcsRUFBRXJDLGNBQWMsQ0FBQ3FDLFdBSHZCO0FBSUxDLFFBQUFBLFNBQVMsRUFBRTtBQUpOLE9BQVA7QUFNRDs7QUFFRCxVQUFNQyxTQUE4QyxHQUFHLE1BQU01SCxPQUFPLENBQUNzSCxhQUFSLENBQXNCO0FBQUV6QyxNQUFBQSxRQUFRLEVBQUUsS0FBS0E7QUFBakIsS0FBdEIsQ0FBN0Q7O0FBQ0EsUUFBSStDLFNBQVMsSUFBSSxJQUFqQixFQUF1QjtBQUNyQixhQUFPLElBQVA7QUFDRDs7QUFFRCxXQUFPO0FBQ0xuSyxNQUFBQSxFQUFFLEVBQUVtSyxTQUFTLENBQUMxSCxJQUFWLENBQWUySCxXQURkO0FBRUxILE1BQUFBLFdBQVcsRUFBRUUsU0FBUyxDQUFDMUgsSUFBVixDQUFld0gsV0FGdkI7QUFHTEMsTUFBQUEsU0FBUyxFQUFFQyxTQUFTLENBQUMxSCxJQUFWLENBQWV5SCxTQUhyQjtBQUlMRixNQUFBQSxPQUFPLEVBQUVHLFNBQVMsQ0FBQzFILElBQVYsQ0FBZXVIO0FBSm5CLEtBQVA7QUFNRDs7QUFFRCxRQUFNSyxJQUFOLEdBQTRCO0FBQzFCLDBCQUFNaEcsMkJBQWdCaUcsa0JBQXRCO0FBQ0EsVUFBTSxLQUFLdkssT0FBTCxDQUFhd0MsT0FBYixDQUFxQjhILElBQXJCLENBQTBCO0FBQUVqRCxNQUFBQSxRQUFRLEVBQUUsS0FBS0E7QUFBakIsS0FBMUIsQ0FBTjtBQUNEOztBQUVELFFBQU1tRCxNQUFOLEdBQThCO0FBQzVCLDBCQUFNbEcsMkJBQWdCbUcsa0JBQXRCO0FBQ0EsVUFBTSxLQUFLekssT0FBTCxDQUFhd0MsT0FBYixDQUFxQmdJLE1BQXJCLENBQTRCO0FBQUVuRCxNQUFBQSxRQUFRLEVBQUUsS0FBS0E7QUFBakIsS0FBNUIsQ0FBTjtBQUNEOztBQUVELFFBQU1xRCxPQUFOLEdBQStCO0FBQzdCLDBCQUFNcEcsMkJBQWdCcUcsaUJBQXRCO0FBQ0EsVUFBTSxLQUFLM0ssT0FBTCxDQUFhd0MsT0FBYixDQUFxQmtJLE9BQXJCLENBQTZCO0FBQUVyRCxNQUFBQSxRQUFRLEVBQUUsS0FBS0E7QUFBakIsS0FBN0IsQ0FBTjtBQUNEOztBQUVELFFBQU11RCxRQUFOLEdBQWdDO0FBQzlCLDBCQUFNdEcsMkJBQWdCdUcsa0JBQXRCO0FBQ0EsVUFBTSxLQUFLN0ssT0FBTCxDQUFhd0MsT0FBYixDQUFxQm9JLFFBQXJCLENBQThCO0FBQUV2RCxNQUFBQSxRQUFRLEVBQUUsS0FBS0E7QUFBakIsS0FBOUIsQ0FBTjtBQUNEOztBQUVELFFBQU15RCxRQUFOLEdBQWdDO0FBQzlCLDBCQUFNeEcsMkJBQWdCeUcsc0JBQXRCO0FBQ0EsVUFBTSxLQUFLL0ssT0FBTCxDQUFhd0MsT0FBYixDQUFxQnNJLFFBQXJCLENBQThCO0FBQUV6RCxNQUFBQSxRQUFRLEVBQUUsS0FBS0E7QUFBakIsS0FBOUIsQ0FBTjtBQUNEOztBQUVELFFBQU0yRCxLQUFOLEdBQTZCO0FBQzNCLDBCQUFNMUcsMkJBQWdCMkcsbUJBQXRCO0FBQ0EsVUFBTSxLQUFLakwsT0FBTCxDQUFhd0MsT0FBYixDQUFxQndJLEtBQXJCLENBQTJCO0FBQUUzRCxNQUFBQSxRQUFRLEVBQUUsS0FBS0E7QUFBakIsS0FBM0IsQ0FBTjtBQUNEOztBQUVELFFBQU02RCxlQUFOLEdBQXVDO0FBQ3JDLFVBQU0sS0FBS2xMLE9BQUwsQ0FBYXdDLE9BQWIsQ0FBcUIwSSxlQUFyQixDQUFxQztBQUFFN0QsTUFBQUEsUUFBUSxFQUFFLEtBQUtBO0FBQWpCLEtBQXJDLENBQU47QUFDRDs7QUFqUG9DOzs7O0FBb1BoQyxNQUFNOEQsT0FBTixDQUFrQztBQVV2QzdNLEVBQUFBLFdBQVcsQ0FBQzhGLGFBQUQsRUFBZ0M1QixPQUFoQyxFQUFrRTtBQUFBLFNBVDdFNEksUUFTNkU7QUFBQSxTQVI3RUMsUUFRNkU7QUFBQSxTQVA3RUMsUUFPNkU7QUFBQSxTQU43RUMsY0FNNkU7QUFBQSxTQUw3RUMsYUFLNkU7QUFBQSxTQUo3RUMsWUFJNkU7QUFBQSxTQUg3RUMsV0FHNkU7QUFBQSxTQUY3RUMsb0JBRTZFO0FBQzNFLFNBQUtKLGNBQUwsR0FBc0JuSCxhQUF0QjtBQUNBLFNBQUtrSCxRQUFMLEdBQWdCOUksT0FBaEI7QUFDQSxTQUFLNkksUUFBTCxHQUFnQixJQUFJaEksR0FBSixFQUFoQjtBQUNBLFNBQUsrSCxRQUFMLEdBQWdCLElBQUkvSCxHQUFKLEVBQWhCO0FBQ0EsU0FBS21JLGFBQUwsR0FBcUIsSUFBckI7QUFDQSxTQUFLQyxZQUFMLEdBQW9CLEtBQXBCO0FBQ0EsU0FBS0MsV0FBTCxHQUFtQixFQUFuQjtBQUNBLFNBQUtDLG9CQUFMLEdBQTRCLEVBQTVCO0FBQ0Q7O0FBRUQsTUFBSUMsT0FBSixHQUFvQztBQUNsQyxXQUFPLEtBQUtSLFFBQVo7QUFDRDs7QUFFRCxNQUFJNUksT0FBSixHQUF1QztBQUNyQyxXQUFPLEtBQUs4SSxRQUFaO0FBQ0Q7O0FBRUQsTUFBSWxILGFBQUosR0FBb0M7QUFDbEMsV0FBTyxLQUFLbUgsY0FBWjtBQUNEOztBQUVELE1BQUlNLFlBQUosR0FBcUM7QUFDbkMsUUFBSSxLQUFLTCxhQUFULEVBQXdCO0FBQ3RCLGFBQU9NLHdCQUFhQyxRQUFwQjtBQUNEOztBQUVELFFBQUksS0FBS04sWUFBVCxFQUF1QjtBQUNyQixhQUFPSyx3QkFBYUUsUUFBcEI7QUFDRDs7QUFFRCxRQUFJLEtBQUtDLGFBQUwsR0FBcUIxRixJQUFyQixDQUEyQjJGLENBQUQsSUFBT0EsQ0FBQyxDQUFDcEUsT0FBbkMsQ0FBSixFQUFpRDtBQUMvQztBQUNBO0FBQ0E7QUFDQSxhQUFPZ0Usd0JBQWFLLE1BQXBCO0FBQ0Q7O0FBRUQsV0FBT0wsd0JBQWFNLE9BQXBCO0FBQ0Q7O0FBRURDLEVBQUFBLHdCQUF3QixHQUFTO0FBQy9CLFNBQUtiLGFBQUwsR0FBcUIsS0FBckI7QUFDRDs7QUFFRGMsRUFBQUEsY0FBYyxHQUFTO0FBQ3JCLFNBQUtiLFlBQUwsR0FBb0IsSUFBcEI7QUFDRDs7QUFFRDdCLEVBQUFBLFNBQVMsQ0FBQ3JMLEdBQUQsRUFBc0M7QUFDN0MsUUFBSWtILE1BQU0sR0FBRyxJQUFJcEgsTUFBSixDQUFXRSxHQUFYLEVBQWdCLEtBQUs2RCxLQUFMLEVBQWhCLENBQWI7O0FBQ0EsUUFBSSxLQUFLZ0osUUFBTCxDQUFjbUIsR0FBZCxDQUFrQjlHLE1BQU0sQ0FBQ2hILEdBQXpCLENBQUosRUFBbUM7QUFDakNnSCxNQUFBQSxNQUFNLEdBQUcseUJBQVcsS0FBSzJGLFFBQUwsQ0FBY29CLEdBQWQsQ0FBa0IvRyxNQUFNLENBQUNoSCxHQUF6QixDQUFYLENBQVQ7QUFDRCxLQUZELE1BRU87QUFDTCxXQUFLMk0sUUFBTCxDQUFjakksR0FBZCxDQUFrQnNDLE1BQU0sQ0FBQ2hILEdBQXpCLEVBQThCZ0gsTUFBOUI7QUFDRDs7QUFFRCxXQUFPQSxNQUFQO0FBQ0Q7O0FBRURnSCxFQUFBQSxTQUFTLENBQUNwRixRQUFELEVBQTRCO0FBQ25DLFdBQU8sS0FBS2dFLFFBQUwsQ0FBY21CLEdBQWQsQ0FBa0JuRixRQUFsQixDQUFQO0FBQ0Q7O0FBRUQ0RSxFQUFBQSxhQUFhLEdBQWM7QUFDekIsV0FBT1MsS0FBSyxDQUFDQyxJQUFOLENBQVcsS0FBS3RCLFFBQUwsQ0FBY3VCLE1BQWQsRUFBWCxDQUFQO0FBQ0Q7O0FBRUR4SyxFQUFBQSxLQUFLLEdBQVc7QUFDZCxXQUFPLEtBQUtrSixRQUFMLENBQWNsSixLQUFkLEVBQVA7QUFDRDs7QUFFRHlLLEVBQUFBLGdCQUFnQixDQUFDQyxJQUFELEVBQWlDO0FBQy9DLFVBQU07QUFBRXpGLE1BQUFBLFFBQUY7QUFBWVEsTUFBQUE7QUFBWixRQUErQmlGLElBQXJDO0FBRUEsU0FBS1Qsd0JBQUw7O0FBRUEsUUFBSWhGLFFBQVEsSUFBSSxJQUFaLElBQW9CLENBQUMsS0FBS2dFLFFBQUwsQ0FBY2tCLEdBQWQsQ0FBa0JsRixRQUFsQixDQUF6QixFQUFzRDtBQUNwRDtBQUNBO0FBQ0EsWUFBTTlCLE1BQU0sR0FBRyxJQUFJbUMsTUFBSixDQUFXLElBQVgsRUFBa0IsVUFBU0wsUUFBUyxFQUFwQyxFQUF1Q0EsUUFBdkMsQ0FBZjs7QUFDQSxXQUFLZ0UsUUFBTCxDQUFjbEksR0FBZCxDQUFrQmtFLFFBQWxCLEVBQTRCOUIsTUFBNUI7QUFDRCxLQVY4QyxDQVkvQztBQUNBOzs7QUFDQSxRQUFJc0MsY0FBYyxDQUFDa0YsaUJBQW5CLEVBQXNDO0FBQ3BDLFdBQUsxQixRQUFMLENBQWMyQixPQUFkLENBQXVCekgsTUFBRCxJQUFZO0FBQ2hDQSxRQUFBQSxNQUFNLENBQUNzQyxjQUFQLEdBQXdCdEMsTUFBTSxDQUFDOEIsUUFBUCxLQUFvQkEsUUFBcEIsR0FBK0JRLGNBQS9CLEdBQWdEdEMsTUFBTSxDQUFDc0MsY0FBL0U7QUFDQXRDLFFBQUFBLE1BQU0sQ0FBQ3VDLE9BQVAsR0FBaUIsSUFBakI7QUFDQXZDLFFBQUFBLE1BQU0sQ0FBQ2tELGNBQVA7QUFDRCxPQUpEO0FBS0QsS0FORCxNQU1PLElBQUlwQixRQUFRLElBQUksSUFBaEIsRUFBc0I7QUFDM0I7QUFDQSxZQUFNOUIsTUFBTSxHQUFHLHlCQUFXLEtBQUs4RixRQUFMLENBQWNtQixHQUFkLENBQWtCbkYsUUFBbEIsQ0FBWCxDQUFmO0FBQ0E5QixNQUFBQSxNQUFNLENBQUNzQyxjQUFQLEdBQXdCQSxjQUF4QjtBQUNBdEMsTUFBQUEsTUFBTSxDQUFDa0QsY0FBUDtBQUNBbEQsTUFBQUEsTUFBTSxDQUFDdUMsT0FBUCxHQUFpQixJQUFqQjtBQUNEO0FBQ0Y7O0FBRURtRixFQUFBQSxlQUFlLENBQUNILElBQUQsRUFBK0I7QUFDNUMsVUFBTTtBQUFFdkgsTUFBQUE7QUFBRixRQUFhdUgsSUFBbkI7QUFFQSxTQUFLVCx3QkFBTDs7QUFFQSxRQUFJLENBQUMsS0FBS2hCLFFBQUwsQ0FBY2tCLEdBQWQsQ0FBa0JoSCxNQUFNLENBQUN0RixFQUF6QixDQUFMLEVBQW1DO0FBQ2pDO0FBQ0EsV0FBS29MLFFBQUwsQ0FBY2xJLEdBQWQsQ0FBa0JvQyxNQUFNLENBQUN0RixFQUF6QixFQUE2QixJQUFJeUgsTUFBSixDQUFXLElBQVgsRUFBaUJuQyxNQUFNLENBQUMzRyxJQUF4QixFQUE4QjJHLE1BQU0sQ0FBQ3RGLEVBQXJDLENBQTdCO0FBQ0QsS0FIRCxNQUdPLElBQUlzRixNQUFNLENBQUMzRyxJQUFYLEVBQWlCO0FBQ3RCO0FBQ0EsK0JBQVcsS0FBS3lNLFFBQUwsQ0FBY21CLEdBQWQsQ0FBa0JqSCxNQUFNLENBQUN0RixFQUF6QixDQUFYLEVBQXlDckIsSUFBekMsR0FBZ0QyRyxNQUFNLENBQUMzRyxJQUF2RDtBQUNEO0FBQ0Y7O0FBRURzTyxFQUFBQSxZQUFZLENBQUNDLGFBQUQsRUFBeUI3TixTQUF6QixFQUFtRDtBQUM3RCxRQUFJQSxTQUFTLElBQUksSUFBakIsRUFBdUI7QUFDckIsVUFBSSxLQUFLK0wsUUFBTCxDQUFja0IsR0FBZCxDQUFrQmpOLFNBQWxCLENBQUosRUFBa0M7QUFDaEMsY0FBTWlHLE1BQU0sR0FBRyx5QkFBVyxLQUFLOEYsUUFBTCxDQUFjbUIsR0FBZCxDQUFrQmxOLFNBQWxCLENBQVgsQ0FBZjtBQUNBaUcsUUFBQUEsTUFBTSxDQUFDa0QsY0FBUDtBQUNBbEQsUUFBQUEsTUFBTSxDQUFDc0MsY0FBUCxHQUF3QixJQUF4QjtBQUNBdEMsUUFBQUEsTUFBTSxDQUFDdUMsT0FBUCxHQUFpQixLQUFqQjs7QUFFQSxZQUFJcUYsYUFBSixFQUFtQjtBQUNqQixlQUFLOUIsUUFBTCxDQUFjK0IsTUFBZCxDQUFxQjlOLFNBQXJCO0FBQ0Q7QUFDRjtBQUNGLEtBWEQsTUFXTztBQUNMLFdBQUsrTCxRQUFMLENBQWMyQixPQUFkLENBQXVCekgsTUFBRCxJQUFZO0FBQ2hDQSxRQUFBQSxNQUFNLENBQUNrRCxjQUFQO0FBQ0FsRCxRQUFBQSxNQUFNLENBQUNzQyxjQUFQLEdBQXdCLElBQXhCO0FBQ0F0QyxRQUFBQSxNQUFNLENBQUN1QyxPQUFQLEdBQWlCLEtBQWpCO0FBQ0QsT0FKRDs7QUFNQSxVQUFJcUYsYUFBSixFQUFtQjtBQUNqQixhQUFLOUIsUUFBTCxDQUFjZ0MsS0FBZDs7QUFDQXROLFFBQUFBLG1CQUFtQixDQUFDbUQsU0FBcEIsQ0FBOEJtSyxLQUE5QjtBQUNEO0FBQ0Y7QUFDRjs7QUFFRCxRQUFNQyxXQUFOLENBQ0V2SixPQURGLEVBRUV3SixJQUZGLEVBR0VDLFFBSEYsRUFJRUMsZUFKRixFQUtnRDtBQUM5QyxRQUFJLENBQUMsS0FBS25DLFFBQUwsQ0FBY3pHLFlBQWQsQ0FBMkI2SSwwQkFBaEMsRUFBNEQ7QUFDMUQsYUFBTyxFQUFQO0FBQ0Q7O0FBQ0QsUUFBSTtBQUNGLFlBQU1uTCxRQUFRLEdBQUcsTUFBTSxLQUFLK0ksUUFBTCxDQUFjZ0MsV0FBZCxDQUEwQjtBQUMvQ3ZKLFFBQUFBLE9BRCtDO0FBRS9Dd0osUUFBQUEsSUFGK0M7QUFHL0N0SCxRQUFBQSxNQUFNLEVBQUV1SCxRQUFRLENBQUN2SCxNQUg4QjtBQUkvQ0YsUUFBQUEsSUFBSSxFQUFFeUgsUUFBUSxDQUFDdkc7QUFKZ0MsT0FBMUIsQ0FBdkI7O0FBTUEsVUFBSTFFLFFBQVEsSUFBSUEsUUFBUSxDQUFDRyxJQUFyQixJQUE2QkgsUUFBUSxDQUFDRyxJQUFULENBQWNpTCxPQUEvQyxFQUF3RDtBQUN0RCxlQUFPcEwsUUFBUSxDQUFDRyxJQUFULENBQWNpTCxPQUFyQjtBQUNELE9BRkQsTUFFTztBQUNMLGVBQU8sRUFBUDtBQUNEO0FBQ0YsS0FaRCxDQVlFLE9BQU9DLEtBQVAsRUFBYztBQUNkLGFBQU8sRUFBUDtBQUNEO0FBQ0Y7O0FBaExzQzs7OztBQW1MbEMsTUFBTUMsVUFBTixDQUF3QztBQWM3Q3ZQLEVBQUFBLFdBQVcsQ0FDVHdQLGNBRFMsRUFFVHJQLEdBRlMsRUFHVHNILElBSFMsRUFJVEUsTUFKUyxFQUtUOEgsT0FMUyxFQU1UQyxTQU5TLEVBT1RDLFVBUFMsRUFRVEMsV0FSUyxFQVNUO0FBQUEsU0F0QkZDLFFBc0JFO0FBQUEsU0FyQkZDLGFBcUJFO0FBQUEsU0FwQkZOLGNBb0JFO0FBQUEsU0FuQkZyUCxHQW1CRTtBQUFBLFNBbEJGc0gsSUFrQkU7QUFBQSxTQWpCRnNJLFlBaUJFO0FBQUEsU0FoQkZwSSxNQWdCRTtBQUFBLFNBZkY4SCxPQWVFO0FBQUEsU0FkRkMsU0FjRTtBQUFBLFNBYkZDLFVBYUU7QUFBQSxTQVpGQyxXQVlFO0FBQUEsU0FYRkksUUFXRTtBQUNBLFNBQUs3UCxHQUFMLEdBQVdBLEdBQVg7QUFDQSxTQUFLc0gsSUFBTCxHQUFZQSxJQUFaO0FBQ0EsU0FBS3NJLFlBQUwsR0FBb0J0SSxJQUFwQjtBQUNBLFNBQUtFLE1BQUwsR0FBY0EsTUFBZDtBQUNBLFNBQUs4SCxPQUFMLEdBQWVBLE9BQWY7QUFDQSxTQUFLQyxTQUFMLEdBQWlCQSxTQUFqQjtBQUNBLFNBQUtFLFdBQUwsR0FBbUJBLFdBQW5CO0FBQ0EsU0FBS0MsUUFBTCxHQUFnQixLQUFoQjtBQUNBLFNBQUtMLGNBQUwsR0FBc0JBLGNBQXRCO0FBQ0EsU0FBS1EsUUFBTCxHQUFnQixJQUFoQjs7QUFFQSxRQUFJTixTQUFTLElBQUksSUFBYixJQUFxQkEsU0FBUyxDQUFDTyxJQUFWLE9BQXFCLEVBQTlDLEVBQWtEO0FBQ2hELFdBQUtQLFNBQUwsR0FBaUJBLFNBQWpCO0FBQ0QsS0FGRCxNQUVPO0FBQ0wsV0FBS0EsU0FBTCxHQUFpQixJQUFqQjtBQUNEOztBQUNELFFBQUlDLFVBQVUsSUFBSSxJQUFkLElBQXNCQSxVQUFVLENBQUNNLElBQVgsT0FBc0IsRUFBaEQsRUFBb0Q7QUFDbEQsV0FBS04sVUFBTCxHQUFrQkEsVUFBbEI7QUFDRCxLQUZELE1BRU87QUFDTCxXQUFLQSxVQUFMLEdBQWtCLElBQWxCO0FBQ0Q7QUFDRjs7QUFFRDdMLEVBQUFBLEtBQUssR0FBVztBQUNkLFdBQU8sS0FBSzBMLGNBQVo7QUFDRDs7QUFqRDRDOzs7O0FBb0R4QyxNQUFNVSxrQkFBTixDQUF3RDtBQVM3RGxRLEVBQUFBLFdBQVcsQ0FBQ00sSUFBRCxFQUFlbVAsT0FBZixFQUFpQ1UsWUFBakMsRUFBd0Q7QUFBQSxTQVJuRXhPLEVBUW1FO0FBQUEsU0FQbkVrTyxRQU9tRTtBQUFBLFNBTm5FQyxhQU1tRTtBQUFBLFNBTG5FeFAsSUFLbUU7QUFBQSxTQUpuRW1QLE9BSW1FO0FBQUEsU0FIbkVVLFlBR21FO0FBQUEsU0FGbkVULFNBRW1FO0FBQ2pFLFNBQUtwUCxJQUFMLEdBQVlBLElBQVo7QUFDQSxTQUFLbVAsT0FBTCxHQUFlQSxPQUFmO0FBQ0EsU0FBS1UsWUFBTCxHQUFvQkEsWUFBcEI7QUFDQSxTQUFLVCxTQUFMLEdBQWlCLElBQWpCO0FBQ0EsU0FBS0csUUFBTCxHQUFnQixLQUFoQjtBQUNBLFNBQUtDLGFBQUwsR0FBcUIsSUFBckI7QUFDQSxTQUFLbk8sRUFBTCxHQUFVc0QsY0FBS0MsRUFBTCxFQUFWO0FBQ0Q7O0FBRURwQixFQUFBQSxLQUFLLEdBQVc7QUFDZCxXQUFPLEtBQUtuQyxFQUFaO0FBQ0Q7O0FBckI0RDs7OztBQXdCeEQsTUFBTXlPLG1CQUFOLENBQTBEO0FBTS9EcFEsRUFBQUEsV0FBVyxDQUFDZ0UsTUFBRCxFQUFpQnFNLEtBQWpCLEVBQWdDWixPQUFoQyxFQUFtRDtBQUFBLFNBTDlEdk4sR0FLOEQ7QUFBQSxTQUo3RDhCLE1BSTZEO0FBQUEsU0FIN0RxTSxLQUc2RDtBQUFBLFNBRjlEWixPQUU4RDtBQUM1RCxTQUFLekwsTUFBTCxHQUFjQSxNQUFkO0FBQ0EsU0FBS3FNLEtBQUwsR0FBYUEsS0FBYjtBQUNBLFNBQUtaLE9BQUwsR0FBZUEsT0FBTyxJQUFJLElBQVgsR0FBa0IsS0FBbEIsR0FBMEJBLE9BQXpDO0FBQ0EsU0FBS3ZOLEdBQUwsR0FBVytDLGNBQUtDLEVBQUwsRUFBWDtBQUNEOztBQUVEcEIsRUFBQUEsS0FBSyxHQUFXO0FBQ2QsV0FBTyxLQUFLNUIsR0FBWjtBQUNEOztBQWY4RDs7O0FBa0JqRSxNQUFNb08sbUJBQW1CLEdBQUcscUJBQTVCO0FBQ0EsTUFBTUMseUJBQXlCLEdBQUcsMkJBQWxDO0FBRUEsTUFBTUMsaUJBQWlCLEdBQUcsbUJBQTFCO0FBQ0EsTUFBTUMsaUJBQWlCLEdBQUcsbUJBQTFCOztBQVFPLE1BQU1DLEtBQU4sQ0FBOEI7QUFVbkM7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUdBMVEsRUFBQUEsV0FBVyxDQUNUMlEsYUFEUyxFQUVUQyxvQkFGUyxFQUdUQyxtQkFIUyxFQUlUeEQsb0JBSlMsRUFLVHlELGdCQUxTLEVBTVRDLGlCQU5TLEVBT1Q7QUFBQSxTQXZCRkMsVUF1QkU7QUFBQSxTQXRCRkMsY0FzQkU7QUFBQSxTQXJCRkMscUJBcUJFO0FBQUEsU0FwQkZDLG9CQW9CRTtBQUFBLFNBbkJGQyxpQkFtQkU7QUFBQSxTQWxCRkMsWUFrQkU7QUFBQSxTQWpCRkMsUUFpQkU7QUFBQSxTQWhCRkMsa0JBZ0JFO0FBQUEsU0FURkMsK0JBU0U7QUFDQSxTQUFLUixVQUFMLEdBQWtCLEVBQWxCO0FBQ0EsU0FBS0MsY0FBTCxHQUFzQk4sYUFBdEI7QUFDQSxTQUFLTyxxQkFBTCxHQUE2Qk4sb0JBQTdCO0FBQ0EsU0FBS08sb0JBQUwsR0FBNEJOLG1CQUE1QjtBQUNBLFNBQUtXLCtCQUFMLEdBQXlDbkUsb0JBQXpDO0FBQ0EsU0FBSytELGlCQUFMLEdBQXlCTixnQkFBekI7QUFDQSxTQUFLUyxrQkFBTCxHQUEwQlIsaUJBQTFCO0FBQ0EsU0FBS08sUUFBTCxHQUFnQixJQUFJRyxhQUFKLEVBQWhCO0FBQ0EsU0FBS0osWUFBTCxHQUFvQixJQUFJSyw0QkFBSixDQUF3QixLQUFLSixRQUE3QixDQUFwQjtBQUNEOztBQUVEeE4sRUFBQUEsS0FBSyxHQUFXO0FBQ2QsV0FBTyxNQUFQO0FBQ0Q7O0FBRUQ2TixFQUFBQSxZQUFZLEdBQWU7QUFDekIsV0FBUSxLQUFLWCxVQUFiO0FBQ0Q7O0FBRURZLEVBQUFBLFVBQVUsQ0FBQzlMLGFBQUQsRUFBZ0M1QixPQUFoQyxFQUEyRTtBQUNuRixVQUFNeEMsT0FBTyxHQUFHLElBQUltTCxPQUFKLENBQVkvRyxhQUFaLEVBQTJCNUIsT0FBM0IsQ0FBaEIsQ0FEbUYsQ0FHbkY7O0FBQ0EsVUFBTTJOLGtCQUFrQixHQUFHblEsT0FBTyxDQUFDMEwsV0FBbkM7O0FBQ0EsU0FBSyxNQUFNMEUsSUFBWCxJQUFtQixLQUFLYixjQUF4QixFQUF3QztBQUN0Q1ksTUFBQUEsa0JBQWtCLENBQUNuTyxJQUFuQixDQUNFLElBQUk2TCxVQUFKLENBQWV1QyxJQUFJLENBQUNuUSxFQUFwQixFQUF3Qm1RLElBQUksQ0FBQzNSLEdBQTdCLEVBQWtDMlIsSUFBSSxDQUFDckssSUFBdkMsRUFBNkNxSyxJQUFJLENBQUNuSyxNQUFsRCxFQUEwRG1LLElBQUksQ0FBQ3JDLE9BQS9ELEVBQXdFcUMsSUFBSSxDQUFDcEMsU0FBN0UsRUFBd0ZvQyxJQUFJLENBQUNuQyxVQUE3RixDQURGO0FBR0Q7O0FBRUQsU0FBS3FCLFVBQUwsQ0FBZ0J0TixJQUFoQixDQUFxQmhDLE9BQXJCOztBQUNBLFNBQUs0UCxRQUFMLENBQWNTLElBQWQsQ0FBbUJ0QixpQkFBbkI7O0FBQ0EsV0FBTy9PLE9BQVA7QUFDRDs7QUFFRHNRLEVBQUFBLGFBQWEsQ0FBQ3JRLEVBQUQsRUFBNkI7QUFDeEMsVUFBTXNRLGdCQUFnQixHQUFHLEVBQXpCO0FBQ0EsU0FBS2pCLFVBQUwsR0FBa0IsS0FBS0EsVUFBTCxDQUFnQmhOLE1BQWhCLENBQXdCa08sQ0FBRCxJQUFPO0FBQzlDLFVBQUlBLENBQUMsQ0FBQ3BPLEtBQUYsT0FBY25DLEVBQWxCLEVBQXNCO0FBQ3BCc1EsUUFBQUEsZ0JBQWdCLENBQUN2TyxJQUFqQixDQUFzQndPLENBQXRCO0FBQ0EsZUFBTyxLQUFQO0FBQ0QsT0FIRCxNQUdPO0FBQ0wsZUFBTyxJQUFQO0FBQ0Q7QUFDRixLQVBpQixDQUFsQjs7QUFRQSxTQUFLWixRQUFMLENBQWNTLElBQWQsQ0FBbUJ0QixpQkFBbkI7O0FBRUEsUUFBSXdCLGdCQUFnQixDQUFDckosTUFBakIsR0FBMEIsQ0FBOUIsRUFBaUM7QUFDL0IsV0FBSzRJLCtCQUFMLEdBQXVDUyxnQkFBZ0IsQ0FBQyxDQUFELENBQWhCLENBQW9CNUUsb0JBQTNEO0FBQ0Q7O0FBQ0QsV0FBTzRFLGdCQUFQO0FBQ0Q7O0FBRURFLEVBQUFBLHNCQUFzQixDQUFDQyxRQUFELEVBQXFDO0FBQ3pELFdBQU8sS0FBS2QsUUFBTCxDQUFjZSxFQUFkLENBQWlCL0IsbUJBQWpCLEVBQXNDOEIsUUFBdEMsQ0FBUDtBQUNELEdBaEZrQyxDQWtGbkM7QUFDQTs7O0FBQ0FFLEVBQUFBLG9CQUFvQixDQUFDRixRQUFELEVBQXFDO0FBQ3ZELFdBQU8sS0FBS2QsUUFBTCxDQUFjZSxFQUFkLENBQWlCN0IsaUJBQWpCLEVBQW9DNEIsUUFBcEMsQ0FBUDtBQUNEOztBQUVERyxFQUFBQSxvQkFBb0IsQ0FBQ0gsUUFBRCxFQUFxQztBQUN2RCxXQUFPLEtBQUtkLFFBQUwsQ0FBY2UsRUFBZCxDQUFpQjVCLGlCQUFqQixFQUFvQzJCLFFBQXBDLENBQVA7QUFDRDs7QUFFREksRUFBQUEsMkJBQTJCLENBQUNKLFFBQUQsRUFBNkQ7QUFDdEYsV0FBTyxLQUFLZCxRQUFMLENBQWNlLEVBQWQsQ0FBaUI5Qix5QkFBakIsRUFBNEM2QixRQUE1QyxDQUFQO0FBQ0Q7O0FBRURLLEVBQUFBLFNBQVMsQ0FBQ2pFLElBQUQsRUFBOEI7QUFDckMsVUFBTTlNLE9BQU8sR0FBRyxLQUFLc1AsVUFBTCxDQUFnQmhOLE1BQWhCLENBQXdCa08sQ0FBRCxJQUFPQSxDQUFDLENBQUNwTyxLQUFGLE9BQWMwSyxJQUFJLENBQUN0TyxTQUFqRCxFQUE0RHdTLEdBQTVELEVBQWhCOztBQUNBLFFBQUloUixPQUFPLElBQUksSUFBZixFQUFxQjtBQUNuQjtBQUNEOztBQUNELFFBQUk4TSxJQUFJLENBQUNqRixjQUFMLElBQXVCLElBQTNCLEVBQWlDO0FBQy9CN0gsTUFBQUEsT0FBTyxDQUFDNk0sZ0JBQVIsQ0FBMEJDLElBQTFCO0FBQ0QsS0FGRCxNQUVPO0FBQ0w5TSxNQUFBQSxPQUFPLENBQUNpTixlQUFSLENBQXlCSCxJQUF6QjtBQUNEOztBQUVELFNBQUs4QyxRQUFMLENBQWNTLElBQWQsQ0FBbUJ2QixpQkFBbkI7QUFDRDs7QUFFRDVCLEVBQUFBLFlBQVksQ0FBQ2pOLEVBQUQsRUFBYWtOLGFBQWIsRUFBcUM3TixTQUFyQyxFQUErRDtBQUN6RSxVQUFNVSxPQUFPLEdBQUcsS0FBS3NQLFVBQUwsQ0FBZ0JoTixNQUFoQixDQUF3QmtPLENBQUQsSUFBT0EsQ0FBQyxDQUFDcE8sS0FBRixPQUFjbkMsRUFBNUMsRUFBZ0QrUSxHQUFoRCxFQUFoQjs7QUFFQSxRQUFJaFIsT0FBTyxJQUFJLElBQWYsRUFBcUI7QUFDbkJBLE1BQUFBLE9BQU8sQ0FBQ2tOLFlBQVIsQ0FBcUJDLGFBQXJCLEVBQW9DN04sU0FBcEM7O0FBQ0EsV0FBS3NRLFFBQUwsQ0FBY1MsSUFBZCxDQUFtQnZCLGlCQUFuQjtBQUNEO0FBQ0Y7O0FBRUQsUUFBTTdGLGdCQUFOLENBQXVCZ0ksT0FBdkIsRUFBeUNDLGNBQXpDLEVBQWlGO0FBQy9FLFVBQU0zTCxNQUFjLEdBQUkwTCxPQUF4QixDQUQrRSxDQUcvRTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUNBLFVBQU1FLFlBQVksR0FDaEIseUJBQVc1TCxNQUFNLENBQUN2RixPQUFsQixFQUEyQndDLE9BQTNCLENBQW1DcUMsWUFBbkMsQ0FBZ0QyRCxnQ0FBaEQsSUFBb0YsQ0FBQzBJLGNBQXJGLEdBQXNHLENBQXRHLEdBQTBHLElBRDVHO0FBR0EzTCxJQUFBQSxNQUFNLENBQUNrRCxjQUFQO0FBQ0EsVUFBTWxELE1BQU0sQ0FBQzBELGdCQUFQLENBQXdCa0ksWUFBeEIsQ0FBTjs7QUFDQSxTQUFLdkIsUUFBTCxDQUFjUyxJQUFkLENBQW1CdkIsaUJBQW5CO0FBQ0Q7O0FBRURzQyxFQUFBQSxnQkFBZ0IsR0FBb0I7QUFDbEMsV0FBTyxLQUFLN0IsY0FBWjtBQUNEOztBQUVEOEIsRUFBQUEsY0FBYyxHQUFrQjtBQUM5QjtBQUNBO0FBQ0EsVUFBTUMsY0FBYyxHQUFHLEtBQUt6QixrQkFBTCxFQUF2Qjs7QUFDQSxRQUFJeUIsY0FBYyxJQUFJLElBQXRCLEVBQTRCO0FBQzFCLFlBQU1DLGNBQWMsR0FBRyxLQUFLakMsVUFBTCxDQUFnQmtDLElBQWhCLENBQXNCaEIsQ0FBRCxJQUFPQSxDQUFDLENBQUNwTyxLQUFGLE9BQWNrUCxjQUFjLENBQUNsUCxLQUFmLEVBQTFDLENBQXZCOztBQUNBLFVBQUltUCxjQUFjLElBQUksSUFBdEIsRUFBNEI7QUFDMUIsZUFBUUEsY0FBYyxDQUFDN0YsV0FBdkI7QUFDRDtBQUNGLEtBVDZCLENBVzlCO0FBQ0E7QUFDQTs7O0FBQ0EsV0FBTyxLQUFLNkQsY0FBTCxDQUFvQjNNLEdBQXBCLENBQXlCd04sSUFBRCxJQUFVO0FBQ3ZDLFlBQU1xQixFQUFFLEdBQUcsSUFBSTVELFVBQUosQ0FDVHVDLElBQUksQ0FBQ25RLEVBREksRUFFVG1RLElBQUksQ0FBQzNSLEdBRkksRUFHVDJSLElBQUksQ0FBQ3JLLElBSEksRUFJVHFLLElBQUksQ0FBQ25LLE1BSkksRUFLVG1LLElBQUksQ0FBQ3JDLE9BTEksRUFNVHFDLElBQUksQ0FBQ3BDLFNBTkksRUFPVG9DLElBQUksQ0FBQ25DLFVBUEksQ0FBWDtBQVNBd0QsTUFBQUEsRUFBRSxDQUFDdEQsUUFBSCxHQUFjLElBQWQ7QUFDQSxhQUFPc0QsRUFBUDtBQUNELEtBWk0sQ0FBUDtBQWFEOztBQUVEQyxFQUFBQSxtQkFBbUIsQ0FBQ2pULEdBQUQsRUFBY3NILElBQWQsRUFBMEM7QUFDM0QsUUFBSTRMLFVBQVUsR0FBRyxLQUFLTixjQUFMLEdBQXNCRyxJQUF0QixDQUE0QkMsRUFBRCxJQUFRQSxFQUFFLENBQUNoVCxHQUFILEtBQVdBLEdBQVgsSUFBa0JnVCxFQUFFLENBQUMxTCxJQUFILEtBQVlBLElBQWpFLENBQWpCOztBQUNBLFFBQUk0TCxVQUFVLElBQUksSUFBbEIsRUFBd0I7QUFDdEJBLE1BQUFBLFVBQVUsR0FBRyxLQUFLTixjQUFMLEdBQXNCRyxJQUF0QixDQUE0QkMsRUFBRCxJQUFRQSxFQUFFLENBQUNoVCxHQUFILEtBQVdBLEdBQVgsSUFBa0JnVCxFQUFFLENBQUNwRCxZQUFILEtBQW9CdEksSUFBekUsQ0FBYjtBQUNEOztBQUNELFdBQU80TCxVQUFQO0FBQ0Q7O0FBRURDLEVBQUFBLGlCQUFpQixDQUFDM1IsRUFBRCxFQUEyQjtBQUMxQyxXQUFPLEtBQUtvUixjQUFMLEdBQXNCRyxJQUF0QixDQUE0QkMsRUFBRCxJQUFRQSxFQUFFLENBQUNyUCxLQUFILE9BQWVuQyxFQUFsRCxDQUFQO0FBQ0Q7O0FBRUQ0UixFQUFBQSxzQkFBc0IsR0FBMEI7QUFDOUMsV0FBUSxLQUFLcEMsb0JBQWI7QUFDRDs7QUFFRHFDLEVBQUFBLHVCQUF1QixHQUEyQjtBQUNoRCxVQUFNUixjQUFjLEdBQUcsS0FBS3pCLGtCQUFMLEVBQXZCOztBQUNBLFFBQUl5QixjQUFjLElBQUksSUFBdEIsRUFBNEI7QUFDMUIsYUFBUUEsY0FBYyxDQUFDM0Ysb0JBQXZCO0FBQ0Q7O0FBQ0QsV0FBUSxLQUFLbUUsK0JBQWI7QUFDRDs7QUFFRGlDLEVBQUFBLHVCQUF1QixDQUFDL1IsT0FBRCxFQUFvQjhNLElBQXBCLEVBQTRFO0FBQ2pHOU0sSUFBQUEsT0FBTyxDQUFDMkwsb0JBQVIsR0FBK0JtQixJQUFJLENBQUNsSyxHQUFMLENBQVVvUCxDQUFELElBQU87QUFDN0MsWUFBTUMsR0FBRyxHQUFHalMsT0FBTyxDQUFDMkwsb0JBQVIsQ0FBNkJySixNQUE3QixDQUFxQ21QLEVBQUQsSUFBUUEsRUFBRSxDQUFDblAsTUFBSCxLQUFjMFAsQ0FBQyxDQUFDMVAsTUFBNUQsRUFBb0UwTyxHQUFwRSxFQUFaO0FBQ0EsYUFBTyxJQUFJdEMsbUJBQUosQ0FBd0JzRCxDQUFDLENBQUMxUCxNQUExQixFQUFrQzBQLENBQUMsQ0FBQ3JELEtBQXBDLEVBQTJDc0QsR0FBRyxHQUFHQSxHQUFHLENBQUNsRSxPQUFQLEdBQWlCaUUsQ0FBQyxDQUFDRSxPQUFqRSxDQUFQO0FBQ0QsS0FIOEIsQ0FBL0I7O0FBSUEsU0FBS3RDLFFBQUwsQ0FBY1MsSUFBZCxDQUFtQnpCLG1CQUFuQjtBQUNEOztBQUVEdUQsRUFBQUEsdUJBQXVCLEdBQVk7QUFDakMsV0FBTyxLQUFLM0MscUJBQVo7QUFDRDs7QUFFRDRDLEVBQUFBLHVCQUF1QixDQUFDQyxTQUFELEVBQTJCO0FBQ2hELFNBQUs3QyxxQkFBTCxHQUE2QjZDLFNBQTdCOztBQUNBLFNBQUt6QyxRQUFMLENBQWNTLElBQWQsQ0FBbUJ6QixtQkFBbkI7QUFDRDs7QUFFRDBELEVBQUFBLGdCQUFnQixDQUFDckQsYUFBRCxFQUFpQ3NELFNBQW1CLEdBQUcsSUFBdkQsRUFBbUU7QUFDakYsU0FBS2hELGNBQUwsR0FBc0IsS0FBS0EsY0FBTCxDQUFvQnBOLE1BQXBCLENBQTJCOE0sYUFBM0IsQ0FBdEI7QUFDQSxTQUFLTyxxQkFBTCxHQUE2QixJQUE3Qjs7QUFDQSxTQUFLZ0QsaUJBQUwsQ0FBdUI7QUFBRUQsTUFBQUE7QUFBRixLQUF2QjtBQUNEOztBQUVERSxFQUFBQSxpQkFBaUIsQ0FBQ0MsUUFBRCxFQUFnQztBQUMvQyxTQUFLbkQsY0FBTCxHQUFzQixLQUFLQSxjQUFMLENBQW9Cak4sTUFBcEIsQ0FBNEJtUCxFQUFELElBQVEsQ0FBQ2lCLFFBQVEsQ0FBQ25NLElBQVQsQ0FBZW9NLENBQUQsSUFBT0EsQ0FBQyxDQUFDdlEsS0FBRixPQUFjcVAsRUFBRSxDQUFDeFIsRUFBdEMsQ0FBcEMsQ0FBdEI7O0FBRUEsU0FBS3VTLGlCQUFMO0FBQ0Q7O0FBRURJLEVBQUFBLGlCQUFpQixDQUFDQyxNQUFELEVBQWdDO0FBQy9DLFNBQUt0RCxjQUFMLEdBQXNCLEtBQUtBLGNBQUwsQ0FBb0JqTixNQUFwQixDQUE0Qm1QLEVBQUQsSUFBUSxDQUFDb0IsTUFBTSxDQUFDdE0sSUFBUCxDQUFhdU0sQ0FBRCxJQUFPQSxDQUFDLENBQUM3UyxFQUFGLEtBQVN3UixFQUFFLENBQUN4UixFQUEvQixDQUFwQyxFQUF3RWtDLE1BQXhFLENBQStFMFEsTUFBL0UsQ0FBdEI7O0FBRUEsU0FBS0wsaUJBQUw7QUFDRCxHQWpPa0MsQ0FtT25DO0FBQ0E7OztBQUNBTyxFQUFBQSx3QkFBd0IsQ0FDdEIvUyxPQURzQixFQUV0QjhNLElBRnNCLEVBS2hCO0FBQ04sVUFBTW5JLElBQUksR0FBRyxLQUFLMkssVUFBTCxDQUFnQmtDLElBQWhCLENBQXNCaEIsQ0FBRCxJQUFPQSxDQUFDLENBQUNwTyxLQUFGLE9BQWNwQyxPQUFPLENBQUNvQyxLQUFSLEVBQTFDLENBQWI7O0FBQ0EsUUFBSXVDLElBQUksSUFBSSxJQUFaLEVBQWtCO0FBQ2hCO0FBQ0Q7O0FBRUQsVUFBTStHLFdBQVcsR0FBRy9HLElBQUksQ0FBQytHLFdBQXpCO0FBQ0FBLElBQUFBLFdBQVcsQ0FBQ3NCLE9BQVosQ0FBcUJ5RSxFQUFELElBQVE7QUFDMUIsWUFBTXVCLE1BQU0sR0FBR2xHLElBQUksQ0FBQzJFLEVBQUUsQ0FBQ3JQLEtBQUgsRUFBRCxDQUFuQjs7QUFDQSxVQUFJNFEsTUFBTSxJQUFJLElBQWQsRUFBb0I7QUFDbEI7QUFDQTtBQUNBO0FBQ0E7QUFDQXZCLFFBQUFBLEVBQUUsQ0FBQzFMLElBQUgsR0FBVWlOLE1BQU0sQ0FBQzlNLE9BQVAsSUFBa0IsSUFBbEIsR0FBeUI4TSxNQUFNLENBQUM5TSxPQUFoQyxHQUEwQzhNLE1BQU0sQ0FBQ2pOLElBQVAsSUFBZSxJQUFmLEdBQXNCaU4sTUFBTSxDQUFDak4sSUFBN0IsR0FBb0MwTCxFQUFFLENBQUMxTCxJQUEzRjtBQUNBMEwsUUFBQUEsRUFBRSxDQUFDeEwsTUFBSCxHQUFZK00sTUFBTSxDQUFDL00sTUFBUCxJQUFpQixJQUFqQixHQUF3QitNLE1BQU0sQ0FBQy9NLE1BQS9CLEdBQXdDd0wsRUFBRSxDQUFDeEwsTUFBdkQ7QUFDQXdMLFFBQUFBLEVBQUUsQ0FBQ3RELFFBQUgsR0FBYzZFLE1BQU0sQ0FBQzdFLFFBQVAsSUFBbUIsSUFBbkIsR0FBMEI2RSxNQUFNLENBQUM3RSxRQUFqQyxHQUE0Q3NELEVBQUUsQ0FBQ3RELFFBQTdEO0FBQ0FzRCxRQUFBQSxFQUFFLENBQUNyRCxhQUFILEdBQW1CNEUsTUFBTSxDQUFDL1MsRUFBMUI7QUFDQXdSLFFBQUFBLEVBQUUsQ0FBQ3ZELFdBQUgsR0FBaUI4RSxNQUFNLENBQUN2TixNQUFQLEdBQWdCdU4sTUFBTSxDQUFDdk4sTUFBUCxDQUFjeUksV0FBOUIsR0FBNEN1RCxFQUFFLENBQUN2RCxXQUFoRTtBQUNBdUQsUUFBQUEsRUFBRSxDQUFDbkQsUUFBSCxHQUFjMEUsTUFBTSxDQUFDQyxnQkFBckI7QUFDRDtBQUNGLEtBZEQ7O0FBZUEsU0FBS1QsaUJBQUw7QUFDRDs7QUFFREEsRUFBQUEsaUJBQWlCLENBQUNVLE9BQUQsRUFBOEI7QUFDN0MsVUFBTUMsUUFBUSxHQUFHLENBQUN2TSxLQUFELEVBQVFDLE1BQVIsS0FBbUI7QUFDbEMsVUFBSUQsS0FBSyxDQUFDbkksR0FBTixLQUFjb0ksTUFBTSxDQUFDcEksR0FBekIsRUFBOEI7QUFDNUIsZUFBT21JLEtBQUssQ0FBQ25JLEdBQU4sQ0FBVTJVLGFBQVYsQ0FBd0J2TSxNQUFNLENBQUNwSSxHQUEvQixDQUFQO0FBQ0Q7O0FBQ0QsVUFBSW1JLEtBQUssQ0FBQ2IsSUFBTixLQUFlYyxNQUFNLENBQUNkLElBQTFCLEVBQWdDO0FBQzlCLGVBQU9hLEtBQUssQ0FBQ1gsTUFBTixHQUFlWSxNQUFNLENBQUNaLE1BQTdCO0FBQ0Q7O0FBRUQsYUFBT1csS0FBSyxDQUFDYixJQUFOLEdBQWFjLE1BQU0sQ0FBQ2QsSUFBM0I7QUFDRCxLQVREOztBQVdBLFNBQUt3SixjQUFMLEdBQXNCLDBCQUFTLEtBQUtBLGNBQUwsQ0FBb0I1SSxJQUFwQixDQUF5QndNLFFBQXpCLENBQVQsRUFBOEMxQixFQUFELElBQVMsR0FBRUEsRUFBRSxDQUFDaFQsR0FBSSxJQUFHZ1QsRUFBRSxDQUFDMUwsSUFBSyxJQUFHMEwsRUFBRSxDQUFDeEwsTUFBTyxFQUF2RixDQUF0QixDQVo2QyxDQWM3Qzs7QUFDQSxVQUFNb04sS0FBSyxHQUFHLElBQUlDLEdBQUosRUFBZDs7QUFDQSxTQUFLLE1BQU03QixFQUFYLElBQWlCLEtBQUtsQyxjQUF0QixFQUFzQztBQUNwQzhELE1BQUFBLEtBQUssQ0FBQ0UsR0FBTixDQUFVOUIsRUFBRSxDQUFDeFIsRUFBYjtBQUNEOztBQUVELFNBQUssTUFBTUQsT0FBWCxJQUFzQixLQUFLc1AsVUFBM0IsRUFBdUM7QUFDckM7QUFDQXRQLE1BQUFBLE9BQU8sQ0FBQzBMLFdBQVIsR0FBc0IxTCxPQUFPLENBQUMwTCxXQUFSLENBQW9CcEosTUFBcEIsQ0FBNEJtUCxFQUFELElBQVE0QixLQUFLLENBQUM5RyxHQUFOLENBQVVrRixFQUFFLENBQUNyUCxLQUFILEVBQVYsQ0FBbkMsQ0FBdEIsQ0FGcUMsQ0FJckM7O0FBQ0EsWUFBTW9SLFVBQVUsR0FBRyxJQUFJblEsR0FBSixFQUFuQjs7QUFDQSxXQUFLLE1BQU1vUSxpQkFBWCxJQUFnQ3pULE9BQU8sQ0FBQzBMLFdBQXhDLEVBQXFEO0FBQ25EOEgsUUFBQUEsVUFBVSxDQUFDclEsR0FBWCxDQUFlc1EsaUJBQWlCLENBQUNyUixLQUFsQixFQUFmLEVBQTBDcVIsaUJBQTFDO0FBQ0Q7O0FBRUQsV0FBSyxNQUFNckQsSUFBWCxJQUFtQixLQUFLYixjQUF4QixFQUF3QztBQUN0QyxjQUFNbUUsU0FBUyxHQUFHRixVQUFVLENBQUNoSCxHQUFYLENBQWU0RCxJQUFJLENBQUNuUSxFQUFwQixDQUFsQjs7QUFDQSxZQUFJeVQsU0FBUyxJQUFJLElBQWpCLEVBQXVCO0FBQ3JCMVQsVUFBQUEsT0FBTyxDQUFDMEwsV0FBUixDQUFvQjFKLElBQXBCLENBQ0UsSUFBSTZMLFVBQUosQ0FBZXVDLElBQUksQ0FBQ25RLEVBQXBCLEVBQXdCbVEsSUFBSSxDQUFDM1IsR0FBN0IsRUFBa0MyUixJQUFJLENBQUNySyxJQUF2QyxFQUE2Q3FLLElBQUksQ0FBQ25LLE1BQWxELEVBQTBEbUssSUFBSSxDQUFDckMsT0FBL0QsRUFBd0VxQyxJQUFJLENBQUNwQyxTQUE3RSxFQUF3Rm9DLElBQUksQ0FBQ25DLFVBQTdGLENBREY7QUFHRCxTQUpELE1BSU87QUFDTHlGLFVBQUFBLFNBQVMsQ0FBQzNGLE9BQVYsR0FBb0JxQyxJQUFJLENBQUNyQyxPQUF6QjtBQUNBMkYsVUFBQUEsU0FBUyxDQUFDMUYsU0FBVixHQUFzQm9DLElBQUksQ0FBQ3BDLFNBQTNCO0FBQ0Q7QUFDRixPQXBCb0MsQ0FzQnJDOzs7QUFDQWhPLE1BQUFBLE9BQU8sQ0FBQzBMLFdBQVIsR0FBc0IxTCxPQUFPLENBQUMwTCxXQUFSLENBQW9CL0UsSUFBcEIsQ0FBeUJ3TSxRQUF6QixDQUF0QjtBQUNEOztBQUVELFFBQUlELE9BQU8sSUFBSSxJQUFYLElBQW1CQSxPQUFPLENBQUNYLFNBQS9CLEVBQTBDO0FBQ3hDLFdBQUszQyxRQUFMLENBQWNTLElBQWQsQ0FBbUJ6QixtQkFBbkI7QUFDRDtBQUNGOztBQUVEK0UsRUFBQUEsYUFBYSxDQUFDQyxPQUFELEVBQXVCQyxNQUF2QixFQUE4QztBQUN6REQsSUFBQUEsT0FBTyxDQUFDN0YsT0FBUixHQUFrQjhGLE1BQWxCOztBQUNBLFVBQU16RCxJQUFJLEdBQUcsS0FBS2IsY0FBTCxDQUFvQmlDLElBQXBCLENBQTBCQyxFQUFELElBQVFBLEVBQUUsQ0FBQ3hSLEVBQUgsS0FBVTJULE9BQU8sQ0FBQ3hSLEtBQVIsRUFBM0MsQ0FBYjs7QUFDQSxRQUFJZ08sSUFBSSxJQUFJLElBQVosRUFBa0I7QUFDaEJBLE1BQUFBLElBQUksQ0FBQ3JDLE9BQUwsR0FBZThGLE1BQWY7QUFDRDs7QUFDRCxTQUFLckIsaUJBQUw7QUFDRDs7QUFFRHNCLEVBQUFBLDZCQUE2QixDQUFDRCxNQUFELEVBQXdCO0FBQ25ELFNBQUt0RSxjQUFMLENBQW9CdkMsT0FBcEIsQ0FBNkJ5RSxFQUFELElBQVE7QUFDbENBLE1BQUFBLEVBQUUsQ0FBQzFELE9BQUgsR0FBYThGLE1BQWI7QUFDRCxLQUZEOztBQUdBLFNBQUtwRSxvQkFBTCxDQUEwQnpDLE9BQTFCLENBQW1DK0csR0FBRCxJQUFTO0FBQ3pDQSxNQUFBQSxHQUFHLENBQUNoRyxPQUFKLEdBQWM4RixNQUFkO0FBQ0QsS0FGRDs7QUFJQSxTQUFLckIsaUJBQUw7QUFDRDs7QUFFRHdCLEVBQUFBLHFCQUFxQixDQUFDQyxZQUFELEVBQTJDO0FBQzlELFVBQU1DLHFCQUFxQixHQUFHLElBQUkxRixrQkFBSixDQUF1QnlGLFlBQXZCLEVBQXFDLElBQXJDLEVBQTJDLElBQTNDLENBQTlCOztBQUNBLFNBQUt4RSxvQkFBTCxDQUEwQnpOLElBQTFCLENBQStCa1MscUJBQS9COztBQUNBLFNBQUt0RSxRQUFMLENBQWNTLElBQWQsQ0FBbUJ6QixtQkFBbkI7O0FBQ0EsV0FBT3NGLHFCQUFQO0FBQ0Q7O0FBRURDLEVBQUFBLHlCQUF5QixDQUFDckgsSUFBRCxFQU9oQjtBQUNQLFNBQUsyQyxvQkFBTCxDQUEwQnpDLE9BQTFCLENBQW1DK0csR0FBRCxJQUFTO0FBQ3pDLFlBQU1LLE9BQU8sR0FBR3RILElBQUksQ0FBQ2lILEdBQUcsQ0FBQzNSLEtBQUosRUFBRCxDQUFwQjs7QUFDQSxVQUFJZ1MsT0FBTyxJQUFJLElBQWYsRUFBcUI7QUFDbkJMLFFBQUFBLEdBQUcsQ0FBQ25WLElBQUosR0FBV3dWLE9BQU8sQ0FBQ3hWLElBQVIsSUFBZ0IsSUFBaEIsR0FBdUJ3VixPQUFPLENBQUN4VixJQUEvQixHQUFzQ21WLEdBQUcsQ0FBQ25WLElBQXJEO0FBQ0FtVixRQUFBQSxHQUFHLENBQUM1RixRQUFKLEdBQWVpRyxPQUFPLENBQUNqRyxRQUFSLElBQW9CNEYsR0FBRyxDQUFDNUYsUUFBdkM7QUFDQTRGLFFBQUFBLEdBQUcsQ0FBQzNGLGFBQUosR0FBb0JnRyxPQUFPLENBQUNuVSxFQUE1QjtBQUNBOFQsUUFBQUEsR0FBRyxDQUFDdEYsWUFBSixHQUFtQjJGLE9BQU8sQ0FBQzNGLFlBQTNCO0FBQ0Q7QUFDRixLQVJEOztBQVVBLFNBQUttQixRQUFMLENBQWNTLElBQWQsQ0FBbUJ6QixtQkFBbkI7QUFDRDs7QUFFRHlGLEVBQUFBLHlCQUF5QixDQUFDcFUsRUFBRCxFQUFvQjtBQUMzQyxRQUFJcVUsT0FBSjs7QUFDQSxRQUFJclUsRUFBRSxJQUFJLElBQVYsRUFBZ0I7QUFDZHFVLE1BQUFBLE9BQU8sR0FBRyxLQUFLN0Usb0JBQUwsQ0FBMEJuTixNQUExQixDQUFrQ3lSLEdBQUQsSUFBU0EsR0FBRyxDQUFDM1IsS0FBSixPQUFnQm5DLEVBQTFELENBQVY7QUFDQSxXQUFLd1Asb0JBQUwsR0FBNEIsS0FBS0Esb0JBQUwsQ0FBMEJuTixNQUExQixDQUFrQ3lSLEdBQUQsSUFBU0EsR0FBRyxDQUFDM1IsS0FBSixPQUFnQm5DLEVBQTFELENBQTVCO0FBQ0QsS0FIRCxNQUdPO0FBQ0xxVSxNQUFBQSxPQUFPLEdBQUcsS0FBSzdFLG9CQUFmO0FBQ0EsV0FBS0Esb0JBQUwsR0FBNEIsRUFBNUI7QUFDRDs7QUFDRCxTQUFLRyxRQUFMLENBQWNTLElBQWQsQ0FBbUJ6QixtQkFBbkIsRUFBd0M7QUFBRTBGLE1BQUFBO0FBQUYsS0FBeEM7QUFDRDs7QUFFREMsRUFBQUEsbUJBQW1CLEdBQTZCO0FBQzlDLFdBQVEsS0FBSzdFLGlCQUFiO0FBQ0Q7O0FBRUQ4RSxFQUFBQSxrQkFBa0IsQ0FBQzVWLElBQUQsRUFBcUI7QUFDckMsVUFBTTZWLEVBQUUsR0FBRyxJQUFJblIsVUFBSixDQUFlMUUsSUFBZixDQUFYOztBQUNBLFNBQUs4USxpQkFBTCxDQUF1QjFOLElBQXZCLENBQTRCeVMsRUFBNUI7O0FBQ0EsU0FBSzdFLFFBQUwsQ0FBY1MsSUFBZCxDQUFtQnhCLHlCQUFuQixFQUE4QzRGLEVBQTlDO0FBQ0Q7O0FBRURDLEVBQUFBLHFCQUFxQixDQUFDelUsRUFBRCxFQUFhMFUsT0FBYixFQUFvQztBQUN2RCxVQUFNQyxRQUFRLEdBQUcsS0FBS2xGLGlCQUFMLENBQXVCcE4sTUFBdkIsQ0FBK0JtUyxFQUFELElBQVFBLEVBQUUsQ0FBQ3JTLEtBQUgsT0FBZW5DLEVBQXJELENBQWpCOztBQUNBLFFBQUkyVSxRQUFRLENBQUMxTixNQUFULEtBQW9CLENBQXhCLEVBQTJCO0FBQ3pCME4sTUFBQUEsUUFBUSxDQUFDLENBQUQsQ0FBUixDQUFZaFcsSUFBWixHQUFtQitWLE9BQW5COztBQUNBLFdBQUsvRSxRQUFMLENBQWNTLElBQWQsQ0FBbUJ4Qix5QkFBbkIsRUFBOEMrRixRQUFRLENBQUMsQ0FBRCxDQUF0RDtBQUNEO0FBQ0Y7O0FBRURDLEVBQUFBLHNCQUFzQixDQUFDNVUsRUFBRCxFQUFvQjtBQUN4QyxTQUFLeVAsaUJBQUwsR0FBeUJ6UCxFQUFFLElBQUksSUFBTixHQUFhLEtBQUt5UCxpQkFBTCxDQUF1QnBOLE1BQXZCLENBQStCbVMsRUFBRCxJQUFRQSxFQUFFLENBQUNyUyxLQUFILE9BQWVuQyxFQUFyRCxDQUFiLEdBQXdFLEVBQWpHOztBQUNBLFNBQUsyUCxRQUFMLENBQWNTLElBQWQsQ0FBbUJ4Qix5QkFBbkI7QUFDRDs7QUFFRGlHLEVBQUFBLG9CQUFvQixDQUFDclcsR0FBRCxFQUFvQjtBQUN0QyxTQUFLNlEsVUFBTCxDQUFnQnRDLE9BQWhCLENBQXlCd0QsQ0FBRCxJQUFPO0FBQzdCLFVBQUlBLENBQUMsQ0FBQzVFLE9BQUYsQ0FBVVcsR0FBVixDQUFjOU4sR0FBZCxDQUFKLEVBQXdCO0FBQ3RCLGlDQUFXK1IsQ0FBQyxDQUFDNUUsT0FBRixDQUFVWSxHQUFWLENBQWMvTixHQUFkLENBQVgsRUFBK0JDLFNBQS9CLEdBQTJDLEtBQTNDO0FBQ0Q7QUFDRixLQUpEOztBQUtBLFNBQUtrUixRQUFMLENBQWNTLElBQWQsQ0FBbUJ2QixpQkFBbkI7QUFDRDs7QUFFRGlHLEVBQUFBLE9BQU8sR0FBUztBQUNkLFNBQUtwRixZQUFMLENBQWtCb0YsT0FBbEI7QUFDRDs7QUFwWmtDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXHJcblRoZSBmb2xsb3dpbmcgZGVidWcgbW9kZWwgaW1wbGVtZW50YXRpb24gd2FzIHBvcnRlZCBmcm9tIFZTQ29kZSdzIGRlYnVnZ2VyIGltcGxlbWVudGF0aW9uXHJcbmluIGh0dHBzOi8vZ2l0aHViLmNvbS9NaWNyb3NvZnQvdnNjb2RlL3RyZWUvbWFzdGVyL3NyYy92cy93b3JrYmVuY2gvcGFydHMvZGVidWdcclxuXHJcbk1JVCBMaWNlbnNlXHJcblxyXG5Db3B5cmlnaHQgKGMpIDIwMTUgLSBwcmVzZW50IE1pY3Jvc29mdCBDb3Jwb3JhdGlvblxyXG5cclxuQWxsIHJpZ2h0cyByZXNlcnZlZC5cclxuXHJcblBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcclxub2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxyXG5pbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXHJcbnRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcclxuY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXHJcbmZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XHJcblxyXG5UaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiBhbGxcclxuY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cclxuXHJcblRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcclxuSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXHJcbkZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxyXG5BVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXHJcbkxJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXHJcbk9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFXHJcblNPRlRXQVJFLlxyXG4qL1xyXG5cclxuaW1wb3J0IHR5cGUge1xyXG4gIElFeHByZXNzaW9uLFxyXG4gIElFeHByZXNzaW9uQ29udGFpbmVyLFxyXG4gIElFdmFsdWF0YWJsZUV4cHJlc3Npb24sXHJcbiAgSVN0YWNrRnJhbWUsXHJcbiAgSUJyZWFrcG9pbnQsXHJcbiAgSVJhd01vZGVsVXBkYXRlLFxyXG4gIElSYXdTdG9wcHBlZFVwZGF0ZSxcclxuICBJUmF3VGhyZWFkVXBkYXRlLFxyXG4gIElTZXNzaW9uLFxyXG4gIElUaHJlYWQsXHJcbiAgSU1vZGVsLFxyXG4gIElTY29wZSxcclxuICBJU291cmNlLFxyXG4gIElQcm9jZXNzLFxyXG4gIElSYXdTdG9wcGVkRGV0YWlscyxcclxuICBJRW5hYmxlYWJsZSxcclxuICBJVUlCcmVha3BvaW50LFxyXG4gIElFeGNlcHRpb25JbmZvLFxyXG4gIElFeGNlcHRpb25CcmVha3BvaW50LFxyXG4gIElGdW5jdGlvbkJyZWFrcG9pbnQsXHJcbiAgSVRyZWVFbGVtZW50LFxyXG4gIElWYXJpYWJsZSxcclxuICBTb3VyY2VQcmVzZW50YXRpb25IaW50LFxyXG4gIERlYnVnZ2VyTW9kZVR5cGUsXHJcbn0gZnJvbSBcIi4uL3R5cGVzXCJcclxuaW1wb3J0IHR5cGUgeyBJUHJvY2Vzc0NvbmZpZyB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtZGVidWdnZXItY29tbW9uXCJcclxuaW1wb3J0IG51Y2xpZGVVcmkgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL251Y2xpZGVVcmlcIlxyXG5pbXBvcnQgeyBnZXRWU0NvZGVEZWJ1Z2dlckFkYXB0ZXJTZXJ2aWNlQnlOdWNsaWRlVXJpIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1kZWJ1Z2dlci1jb21tb25cIlxyXG5pbXBvcnQgKiBhcyBEZWJ1Z1Byb3RvY29sIGZyb20gXCJ2c2NvZGUtZGVidWdwcm90b2NvbFwiXHJcbmltcG9ydCB0eXBlIHsgRXhwZWN0ZWQgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvZXhwZWN0ZWRcIlxyXG5cclxuaW1wb3J0IHsgT2JzZXJ2YWJsZSB9IGZyb20gXCJyeGpzLWNvbXBhdC9idW5kbGVzL3J4anMtY29tcGF0LnVtZC5taW4uanNcIlxyXG5pbXBvcnQgdXVpZCBmcm9tIFwidXVpZFwiXHJcbmltcG9ydCBudWxsdGhyb3dzIGZyb20gXCJudWxsdGhyb3dzXCJcclxuaW1wb3J0IGludmFyaWFudCBmcm9tIFwiYXNzZXJ0XCJcclxuaW1wb3J0IHsgRW1pdHRlciwgUmFuZ2UgfSBmcm9tIFwiYXRvbVwiXHJcbmltcG9ydCBVbml2ZXJzYWxEaXNwb3NhYmxlIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9Vbml2ZXJzYWxEaXNwb3NhYmxlXCJcclxuaW1wb3J0IHsgdHJhY2sgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvYW5hbHl0aWNzXCJcclxuaW1wb3J0IHsgQW5hbHl0aWNzRXZlbnRzLCBVTktOT1dOX1NPVVJDRSwgREVCVUdfU09VUkNFU19VUkksIERlYnVnZ2VyTW9kZSB9IGZyb20gXCIuLi9jb25zdGFudHNcIlxyXG5pbXBvcnQgeyBvcGVuU291cmNlTG9jYXRpb24gfSBmcm9tIFwiLi4vdXRpbHNcIlxyXG5pbXBvcnQgeyBkaXN0aW5jdCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9jb2xsZWN0aW9uXCJcclxuaW1wb3J0IHsgRXhwZWN0IH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL2V4cGVjdGVkXCJcclxuXHJcbmV4cG9ydCBjbGFzcyBTb3VyY2UgaW1wbGVtZW50cyBJU291cmNlIHtcclxuICArdXJpOiBzdHJpbmdcclxuICBhdmFpbGFibGU6IGJvb2xlYW5cclxuICBfcmF3OiBEZWJ1Z1Byb3RvY29sLlNvdXJjZVxyXG5cclxuICBjb25zdHJ1Y3RvcihyYXc6ID9EZWJ1Z1Byb3RvY29sLlNvdXJjZSwgc2Vzc2lvbklkOiBzdHJpbmcpIHtcclxuICAgIGlmIChyYXcgPT0gbnVsbCkge1xyXG4gICAgICB0aGlzLl9yYXcgPSB7IG5hbWU6IFVOS05PV05fU09VUkNFIH1cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMuX3JhdyA9IHJhd1xyXG4gICAgfVxyXG4gICAgaWYgKHRoaXMuX3Jhdy5zb3VyY2VSZWZlcmVuY2UgIT0gbnVsbCAmJiB0aGlzLl9yYXcuc291cmNlUmVmZXJlbmNlID4gMCkge1xyXG4gICAgICBjb25zdCBuYW1lID1cclxuICAgICAgICB0aGlzLl9yYXcubmFtZSAhPSBudWxsXHJcbiAgICAgICAgICA/IHRoaXMuX3Jhdy5uYW1lXHJcbiAgICAgICAgICA6IHRoaXMuX3Jhdy5wYXRoICE9IG51bGxcclxuICAgICAgICAgID8gbnVjbGlkZVVyaS5wYXJzZVBhdGgodGhpcy5fcmF3LnBhdGgpLmJhc2VcclxuICAgICAgICAgIDogVU5LTk9XTl9TT1VSQ0VcclxuICAgICAgdGhpcy51cmkgPSBgJHtERUJVR19TT1VSQ0VTX1VSSX0vJHtzZXNzaW9uSWR9LyR7dGhpcy5fcmF3LnNvdXJjZVJlZmVyZW5jZX0vJHtuYW1lfWBcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMudXJpID0gdGhpcy5fcmF3LnBhdGggfHwgXCJcIlxyXG4gICAgfVxyXG4gICAgdGhpcy5hdmFpbGFibGUgPSB0aGlzLnVyaSAhPT0gXCJcIlxyXG4gIH1cclxuXHJcbiAgZ2V0IG5hbWUoKTogP3N0cmluZyB7XHJcbiAgICByZXR1cm4gdGhpcy5fcmF3Lm5hbWVcclxuICB9XHJcblxyXG4gIGdldCBvcmlnaW4oKTogP3N0cmluZyB7XHJcbiAgICByZXR1cm4gdGhpcy5fcmF3Lm9yaWdpblxyXG4gIH1cclxuXHJcbiAgZ2V0IHByZXNlbnRhdGlvbkhpbnQoKTogP1NvdXJjZVByZXNlbnRhdGlvbkhpbnQge1xyXG4gICAgcmV0dXJuIHRoaXMuX3Jhdy5wcmVzZW50YXRpb25IaW50XHJcbiAgfVxyXG5cclxuICBnZXQgcmF3KCk6IERlYnVnUHJvdG9jb2wuU291cmNlIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIC4uLnRoaXMuX3JhdyxcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGdldCByZWZlcmVuY2UoKTogP251bWJlciB7XHJcbiAgICByZXR1cm4gdGhpcy5fcmF3LnNvdXJjZVJlZmVyZW5jZVxyXG4gIH1cclxuXHJcbiAgZ2V0IGluTWVtb3J5KCk6IGJvb2xlYW4ge1xyXG4gICAgcmV0dXJuIHRoaXMudXJpLnN0YXJ0c1dpdGgoREVCVUdfU09VUkNFU19VUkkpXHJcbiAgfVxyXG5cclxuICBvcGVuSW5FZGl0b3IoKTogUHJvbWlzZTxhdG9tJFRleHRFZGl0b3I+IHtcclxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBudWNsaWRlLWludGVybmFsL2F0b20tYXBpc1xyXG4gICAgcmV0dXJuIGF0b20ud29ya3NwYWNlLm9wZW4odGhpcy51cmksIHtcclxuICAgICAgc2VhcmNoQWxsUGFuZXM6IHRydWUsXHJcbiAgICAgIHBlbmRpbmc6IHRydWUsXHJcbiAgICB9KVxyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIEV4cHJlc3Npb25Db250YWluZXIgaW1wbGVtZW50cyBJRXhwcmVzc2lvbkNvbnRhaW5lciB7XHJcbiAgc3RhdGljIGFsbFZhbHVlczogTWFwPHN0cmluZywgc3RyaW5nPiA9IG5ldyBNYXAoKVxyXG4gIC8vIFVzZSBjaHVua3MgdG8gc3VwcG9ydCB2YXJpYWJsZSBwYWdpbmcgIzk1MzdcclxuICBzdGF0aWMgQkFTRV9DSFVOS19TSVpFID0gMTAwXHJcblxyXG4gIF92YWx1ZTogc3RyaW5nXHJcbiAgX2NoaWxkcmVuOiA/UHJvbWlzZTxJVmFyaWFibGVbXT5cclxuICBwcm9jZXNzOiA/SVByb2Nlc3NcclxuICBfcmVmZXJlbmNlOiBudW1iZXJcclxuICBfaWQ6IHN0cmluZ1xyXG4gIF9uYW1lZFZhcmlhYmxlczogbnVtYmVyXHJcbiAgX2luZGV4ZWRWYXJpYWJsZXM6IG51bWJlclxyXG4gIF9zdGFydE9mVmFyaWFibGVzOiBudW1iZXJcclxuXHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICBwcm9jZXNzOiA/SVByb2Nlc3MsXHJcbiAgICByZWZlcmVuY2U6IG51bWJlcixcclxuICAgIGlkOiBzdHJpbmcsXHJcbiAgICBuYW1lZFZhcmlhYmxlczogP251bWJlcixcclxuICAgIGluZGV4ZWRWYXJpYWJsZXM6ID9udW1iZXIsXHJcbiAgICBzdGFydE9mVmFyaWFibGVzOiA/bnVtYmVyXHJcbiAgKSB7XHJcbiAgICB0aGlzLnByb2Nlc3MgPSBwcm9jZXNzXHJcbiAgICB0aGlzLl9yZWZlcmVuY2UgPSByZWZlcmVuY2VcclxuICAgIHRoaXMuX2lkID0gaWRcclxuICAgIHRoaXMuX25hbWVkVmFyaWFibGVzID0gbmFtZWRWYXJpYWJsZXMgfHwgMFxyXG4gICAgdGhpcy5faW5kZXhlZFZhcmlhYmxlcyA9IGluZGV4ZWRWYXJpYWJsZXMgfHwgMFxyXG4gICAgdGhpcy5fc3RhcnRPZlZhcmlhYmxlcyA9IHN0YXJ0T2ZWYXJpYWJsZXMgfHwgMFxyXG4gIH1cclxuXHJcbiAgZ2V0IHJlZmVyZW5jZSgpOiBudW1iZXIge1xyXG4gICAgcmV0dXJuIHRoaXMuX3JlZmVyZW5jZVxyXG4gIH1cclxuXHJcbiAgc2V0IHJlZmVyZW5jZSh2YWx1ZTogbnVtYmVyKSB7XHJcbiAgICB0aGlzLl9yZWZlcmVuY2UgPSB2YWx1ZVxyXG4gICAgdGhpcy5fY2hpbGRyZW4gPSBudWxsXHJcbiAgfVxyXG5cclxuICBnZXQgaGFzQ2hpbGRWYXJpYWJsZXMoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5fbmFtZWRWYXJpYWJsZXMgKyB0aGlzLl9pbmRleGVkVmFyaWFibGVzID4gMFxyXG4gIH1cclxuXHJcbiAgZ2V0Q2hpbGRyZW4oKTogUHJvbWlzZTxJVmFyaWFibGVbXT4ge1xyXG4gICAgaWYgKHRoaXMuX2NoaWxkcmVuID09IG51bGwpIHtcclxuICAgICAgdGhpcy5fY2hpbGRyZW4gPSB0aGlzLl9kb0dldENoaWxkcmVuKClcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdGhpcy5fY2hpbGRyZW5cclxuICB9XHJcblxyXG4gIGFzeW5jIF9kb0dldENoaWxkcmVuKCk6IFByb21pc2U8SVZhcmlhYmxlW10+IHtcclxuICAgIGlmICghdGhpcy5oYXNDaGlsZHJlbigpKSB7XHJcbiAgICAgIHJldHVybiBbXVxyXG4gICAgfVxyXG5cclxuICAgIGlmICghdGhpcy5nZXRDaGlsZHJlbkluQ2h1bmtzKSB7XHJcbiAgICAgIGNvbnN0IHZhcmlhYmxlcyA9IGF3YWl0IHRoaXMuX2ZldGNoVmFyaWFibGVzKClcclxuICAgICAgcmV0dXJuIHZhcmlhYmxlc1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIGlmIG9iamVjdCBoYXMgbmFtZWQgdmFyaWFibGVzLCBmZXRjaCB0aGVtIGluZGVwZW5kZW50IGZyb20gaW5kZXhlZCB2YXJpYWJsZXMgIzk2NzBcclxuICAgIGxldCBjaGlsZHJlbkFycmF5OiBBcnJheTxJVmFyaWFibGU+ID0gW11cclxuICAgIGlmIChCb29sZWFuKHRoaXMuX25hbWVkVmFyaWFibGVzKSkge1xyXG4gICAgICBjaGlsZHJlbkFycmF5ID0gYXdhaXQgdGhpcy5fZmV0Y2hWYXJpYWJsZXModW5kZWZpbmVkLCB1bmRlZmluZWQsIFwibmFtZWRcIilcclxuICAgIH1cclxuXHJcbiAgICAvLyBVc2UgYSBkeW5hbWljIGNodW5rIHNpemUgYmFzZWQgb24gdGhlIG51bWJlciBvZiBlbGVtZW50cyAjOTc3NFxyXG4gICAgbGV0IGNodW5rU2l6ZSA9IEV4cHJlc3Npb25Db250YWluZXIuQkFTRV9DSFVOS19TSVpFXHJcbiAgICB3aGlsZSAodGhpcy5faW5kZXhlZFZhcmlhYmxlcyA+IGNodW5rU2l6ZSAqIEV4cHJlc3Npb25Db250YWluZXIuQkFTRV9DSFVOS19TSVpFKSB7XHJcbiAgICAgIGNodW5rU2l6ZSAqPSBFeHByZXNzaW9uQ29udGFpbmVyLkJBU0VfQ0hVTktfU0laRVxyXG4gICAgfVxyXG5cclxuICAgIGlmICh0aGlzLl9pbmRleGVkVmFyaWFibGVzID4gY2h1bmtTaXplKSB7XHJcbiAgICAgIC8vIFRoZXJlIGFyZSBhIGxvdCBvZiBjaGlsZHJlbiwgY3JlYXRlIGZha2UgaW50ZXJtZWRpYXRlIHZhbHVlcyB0aGF0IHJlcHJlc2VudCBjaHVua3MgIzk1MzdcclxuICAgICAgY29uc3QgbnVtYmVyT2ZDaHVua3MgPSBNYXRoLmNlaWwodGhpcy5faW5kZXhlZFZhcmlhYmxlcyAvIGNodW5rU2l6ZSlcclxuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBudW1iZXJPZkNodW5rczsgaSsrKSB7XHJcbiAgICAgICAgY29uc3Qgc3RhcnQgPSB0aGlzLl9zdGFydE9mVmFyaWFibGVzICsgaSAqIGNodW5rU2l6ZVxyXG4gICAgICAgIGNvbnN0IGNvdW50ID0gTWF0aC5taW4oY2h1bmtTaXplLCB0aGlzLl9pbmRleGVkVmFyaWFibGVzIC0gaSAqIGNodW5rU2l6ZSlcclxuICAgICAgICBjaGlsZHJlbkFycmF5LnB1c2goXHJcbiAgICAgICAgICBuZXcgVmFyaWFibGUoXHJcbiAgICAgICAgICAgIHRoaXMucHJvY2VzcyxcclxuICAgICAgICAgICAgdGhpcyxcclxuICAgICAgICAgICAgdGhpcy5yZWZlcmVuY2UsXHJcbiAgICAgICAgICAgIGBbJHtzdGFydH0uLiR7c3RhcnQgKyBjb3VudCAtIDF9XWAsXHJcbiAgICAgICAgICAgIFwiXCIsXHJcbiAgICAgICAgICAgIFwiXCIsXHJcbiAgICAgICAgICAgIG51bGwsXHJcbiAgICAgICAgICAgIGNvdW50LFxyXG4gICAgICAgICAgICB7IGtpbmQ6IFwidmlydHVhbFwiIH0sXHJcbiAgICAgICAgICAgIG51bGwsXHJcbiAgICAgICAgICAgIHRydWUsXHJcbiAgICAgICAgICAgIHN0YXJ0XHJcbiAgICAgICAgICApXHJcbiAgICAgICAgKVxyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gY2hpbGRyZW5BcnJheVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHZhcmlhYmxlcyA9IGF3YWl0IHRoaXMuX2ZldGNoVmFyaWFibGVzKHRoaXMuX3N0YXJ0T2ZWYXJpYWJsZXMsIHRoaXMuX2luZGV4ZWRWYXJpYWJsZXMsIFwiaW5kZXhlZFwiKVxyXG4gICAgcmV0dXJuIGNoaWxkcmVuQXJyYXkuY29uY2F0KHZhcmlhYmxlcylcclxuICB9XHJcblxyXG4gIGdldElkKCk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gdGhpcy5faWRcclxuICB9XHJcblxyXG4gIGdldFZhbHVlKCk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gdGhpcy5fdmFsdWVcclxuICB9XHJcblxyXG4gIGhhc0NoaWxkcmVuKCk6IGJvb2xlYW4ge1xyXG4gICAgLy8gb25seSB2YXJpYWJsZXMgd2l0aCByZWZlcmVuY2UgPiAwIGhhdmUgY2hpbGRyZW4uXHJcbiAgICByZXR1cm4gdGhpcy5yZWZlcmVuY2UgPiAwXHJcbiAgfVxyXG5cclxuICBhc3luYyBfZmV0Y2hWYXJpYWJsZXMoc3RhcnQ/OiBudW1iZXIsIGNvdW50PzogbnVtYmVyLCBmaWx0ZXI/OiBcImluZGV4ZWRcIiB8IFwibmFtZWRcIik6IFByb21pc2U8SVZhcmlhYmxlW10+IHtcclxuICAgIGNvbnN0IHByb2Nlc3MgPSB0aGlzLnByb2Nlc3NcclxuICAgIGludmFyaWFudChwcm9jZXNzKVxyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzcG9uc2U6IERlYnVnUHJvdG9jb2wuVmFyaWFibGVzUmVzcG9uc2UgPSBhd2FpdCBwcm9jZXNzLnNlc3Npb24udmFyaWFibGVzKHtcclxuICAgICAgICB2YXJpYWJsZXNSZWZlcmVuY2U6IHRoaXMucmVmZXJlbmNlLFxyXG4gICAgICAgIHN0YXJ0LFxyXG4gICAgICAgIGNvdW50LFxyXG4gICAgICAgIGZpbHRlcixcclxuICAgICAgfSlcclxuICAgICAgY29uc3QgdmFyaWFibGVzID0gZGlzdGluY3QoXHJcbiAgICAgICAgcmVzcG9uc2UuYm9keS52YXJpYWJsZXMuZmlsdGVyKCh2KSA9PiB2ICE9IG51bGwgJiYgdi5uYW1lKSxcclxuICAgICAgICAodikgPT4gdi5uYW1lXHJcbiAgICAgIClcclxuICAgICAgcmV0dXJuIHZhcmlhYmxlcy5tYXAoXHJcbiAgICAgICAgKHYpID0+XHJcbiAgICAgICAgICBuZXcgVmFyaWFibGUoXHJcbiAgICAgICAgICAgIHRoaXMucHJvY2VzcyxcclxuICAgICAgICAgICAgdGhpcyxcclxuICAgICAgICAgICAgdi52YXJpYWJsZXNSZWZlcmVuY2UsXHJcbiAgICAgICAgICAgIHYubmFtZSxcclxuICAgICAgICAgICAgdi5ldmFsdWF0ZU5hbWUsXHJcbiAgICAgICAgICAgIHYudmFsdWUsXHJcbiAgICAgICAgICAgIHYubmFtZWRWYXJpYWJsZXMsXHJcbiAgICAgICAgICAgIHYuaW5kZXhlZFZhcmlhYmxlcyxcclxuICAgICAgICAgICAgdi5wcmVzZW50YXRpb25IaW50LFxyXG4gICAgICAgICAgICB2LnR5cGVcclxuICAgICAgICAgIClcclxuICAgICAgKVxyXG4gICAgfSBjYXRjaCAoZSkge1xyXG4gICAgICByZXR1cm4gW25ldyBWYXJpYWJsZSh0aGlzLnByb2Nlc3MsIHRoaXMsIDAsIG51bGwsIGUubWVzc2FnZSwgXCJcIiwgMCwgMCwgeyBraW5kOiBcInZpcnR1YWxcIiB9LCBudWxsLCBmYWxzZSldXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICAvLyBUaGUgYWRhcHRlciBleHBsaWNpdGx5IHNlbnRzIHRoZSBjaGlsZHJlbiBjb3VudCBvZiBhbiBleHByZXNzaW9uIG9ubHkgaWYgdGhlcmUgYXJlIGxvdHMgb2YgY2hpbGRyZW4gd2hpY2ggc2hvdWxkIGJlIGNodW5rZWQuXHJcbiAgZ2V0IGdldENoaWxkcmVuSW5DaHVua3MoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gQm9vbGVhbih0aGlzLl9pbmRleGVkVmFyaWFibGVzKVxyXG4gIH1cclxuXHJcbiAgc2V0VmFsdWUodmFsdWU6IHN0cmluZykge1xyXG4gICAgdGhpcy5fdmFsdWUgPSB2YWx1ZVxyXG4gICAgRXhwcmVzc2lvbkNvbnRhaW5lci5hbGxWYWx1ZXMuc2V0KHRoaXMuZ2V0SWQoKSwgdmFsdWUpXHJcbiAgfVxyXG5cclxuICB0b1N0cmluZygpOiBzdHJpbmcge1xyXG4gICAgcmV0dXJuIHRoaXMuX3ZhbHVlXHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgRXhwcmVzc2lvbiBleHRlbmRzIEV4cHJlc3Npb25Db250YWluZXIgaW1wbGVtZW50cyBJRXZhbHVhdGFibGVFeHByZXNzaW9uIHtcclxuICBzdGF0aWMgREVGQVVMVF9WQUxVRSA9IFwibm90IGF2YWlsYWJsZVwiXHJcblxyXG4gIGF2YWlsYWJsZTogYm9vbGVhblxyXG4gIF90eXBlOiA/c3RyaW5nXHJcbiAgbmFtZTogc3RyaW5nXHJcblxyXG4gIGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZywgaWQ/OiBzdHJpbmcgPSB1dWlkLnY0KCkpIHtcclxuICAgIHN1cGVyKG51bGwsIDAsIGlkKVxyXG4gICAgdGhpcy5uYW1lID0gbmFtZVxyXG4gICAgdGhpcy5hdmFpbGFibGUgPSBmYWxzZVxyXG4gICAgdGhpcy5fdHlwZSA9IG51bGxcclxuICAgIC8vIG5hbWUgaXMgbm90IHNldCBpZiB0aGUgZXhwcmVzc2lvbiBpcyBqdXN0IGJlaW5nIGFkZGVkXHJcbiAgICAvLyBpbiB0aGF0IGNhc2UgZG8gbm90IHNldCBkZWZhdWx0IHZhbHVlIHRvIHByZXZlbnQgZmxhc2hpbmcgIzE0NDk5XHJcbiAgICBpZiAobmFtZSkge1xyXG4gICAgICB0aGlzLl92YWx1ZSA9IEV4cHJlc3Npb24uREVGQVVMVF9WQUxVRVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZ2V0IHR5cGUoKTogP3N0cmluZyB7XHJcbiAgICByZXR1cm4gdGhpcy5fdHlwZVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgZXZhbHVhdGUocHJvY2VzczogP0lQcm9jZXNzLCBzdGFja0ZyYW1lOiA/SVN0YWNrRnJhbWUsIGNvbnRleHQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgaWYgKHByb2Nlc3MgPT0gbnVsbCB8fCAoc3RhY2tGcmFtZSA9PSBudWxsICYmIGNvbnRleHQgIT09IFwicmVwbFwiKSkge1xyXG4gICAgICB0aGlzLl92YWx1ZSA9IGNvbnRleHQgPT09IFwicmVwbFwiID8gXCJQbGVhc2Ugc3RhcnQgYSBkZWJ1ZyBzZXNzaW9uIHRvIGV2YWx1YXRlXCIgOiBFeHByZXNzaW9uLkRFRkFVTFRfVkFMVUVcclxuICAgICAgdGhpcy5hdmFpbGFibGUgPSBmYWxzZVxyXG4gICAgICB0aGlzLnJlZmVyZW5jZSA9IDBcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcblxyXG4gICAgdGhpcy5wcm9jZXNzID0gcHJvY2Vzc1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3QgcmVzcG9uc2U6IERlYnVnUHJvdG9jb2wuRXZhbHVhdGVSZXNwb25zZSA9IGF3YWl0IHByb2Nlc3Muc2Vzc2lvbi5ldmFsdWF0ZSh7XHJcbiAgICAgICAgZXhwcmVzc2lvbjogdGhpcy5uYW1lLFxyXG4gICAgICAgIGZyYW1lSWQ6IHN0YWNrRnJhbWUgPyBzdGFja0ZyYW1lLmZyYW1lSWQgOiB1bmRlZmluZWQsXHJcbiAgICAgICAgY29udGV4dCxcclxuICAgICAgfSlcclxuXHJcbiAgICAgIHRoaXMuYXZhaWxhYmxlID0gcmVzcG9uc2UgIT0gbnVsbCAmJiByZXNwb25zZS5ib2R5ICE9IG51bGxcclxuICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLmJvZHkpIHtcclxuICAgICAgICB0aGlzLl92YWx1ZSA9IHJlc3BvbnNlLmJvZHkucmVzdWx0XHJcbiAgICAgICAgdGhpcy5yZWZlcmVuY2UgPSByZXNwb25zZS5ib2R5LnZhcmlhYmxlc1JlZmVyZW5jZSB8fCAwXHJcbiAgICAgICAgdGhpcy5fbmFtZWRWYXJpYWJsZXMgPSByZXNwb25zZS5ib2R5Lm5hbWVkVmFyaWFibGVzIHx8IDBcclxuICAgICAgICB0aGlzLl9pbmRleGVkVmFyaWFibGVzID0gcmVzcG9uc2UuYm9keS5pbmRleGVkVmFyaWFibGVzIHx8IDBcclxuICAgICAgICB0aGlzLl90eXBlID0gcmVzcG9uc2UuYm9keS50eXBlXHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICB0aGlzLl92YWx1ZSA9IGVyci5tZXNzYWdlXHJcbiAgICAgIHRoaXMuYXZhaWxhYmxlID0gZmFsc2VcclxuICAgICAgdGhpcy5yZWZlcmVuY2UgPSAwXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICB0b1N0cmluZygpOiBzdHJpbmcge1xyXG4gICAgcmV0dXJuIGAke3RoaXMubmFtZX1cXG4ke3RoaXMuX3ZhbHVlfWBcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBWYXJpYWJsZSBleHRlbmRzIEV4cHJlc3Npb25Db250YWluZXIgaW1wbGVtZW50cyBJVmFyaWFibGUge1xyXG4gIHBhcmVudDogRXhwcmVzc2lvbkNvbnRhaW5lclxyXG4gIG5hbWU6IHN0cmluZ1xyXG4gIGV2YWx1YXRlTmFtZTogP3N0cmluZ1xyXG4gIHByZXNlbnRhdGlvbkhpbnQ6ID9EZWJ1Z1Byb3RvY29sLlZhcmlhYmxlUHJlc2VudGF0aW9uSGludFxyXG4gIF90eXBlOiA/c3RyaW5nXHJcbiAgYXZhaWxhYmxlOiBib29sZWFuXHJcblxyXG4gIGNvbnN0cnVjdG9yKFxyXG4gICAgcHJvY2VzczogP0lQcm9jZXNzLFxyXG4gICAgcGFyZW50OiBFeHByZXNzaW9uQ29udGFpbmVyLFxyXG4gICAgcmVmZXJlbmNlOiBudW1iZXIsXHJcbiAgICBuYW1lOiA/c3RyaW5nLFxyXG4gICAgZXZhbHVhdGVOYW1lOiA/c3RyaW5nLFxyXG4gICAgdmFsdWU6IHN0cmluZyxcclxuICAgIG5hbWVkVmFyaWFibGVzOiA/bnVtYmVyLFxyXG4gICAgaW5kZXhlZFZhcmlhYmxlczogP251bWJlcixcclxuICAgIHByZXNlbnRhdGlvbkhpbnQ6ID9EZWJ1Z1Byb3RvY29sLlZhcmlhYmxlUHJlc2VudGF0aW9uSGludCxcclxuICAgIHR5cGU6ID9zdHJpbmcsXHJcbiAgICBhdmFpbGFibGU/OiBib29sZWFuID0gdHJ1ZSxcclxuICAgIF9zdGFydE9mVmFyaWFibGVzOiA/bnVtYmVyXHJcbiAgKSB7XHJcbiAgICBzdXBlcihcclxuICAgICAgcHJvY2VzcyxcclxuICAgICAgcmVmZXJlbmNlLFxyXG4gICAgICAvLyBmbG93bGludC1uZXh0LWxpbmUgc2tldGNoeS1udWxsLXN0cmluZzpvZmZcclxuICAgICAgYHZhcmlhYmxlOiR7cGFyZW50LmdldElkKCl9OiR7bmFtZSB8fCBcIm5vX25hbWVcIn1gLFxyXG4gICAgICBuYW1lZFZhcmlhYmxlcyxcclxuICAgICAgaW5kZXhlZFZhcmlhYmxlcyxcclxuICAgICAgX3N0YXJ0T2ZWYXJpYWJsZXNcclxuICAgIClcclxuICAgIHRoaXMucGFyZW50ID0gcGFyZW50XHJcbiAgICB0aGlzLm5hbWUgPSBuYW1lID09IG51bGwgPyBcIm5vX25hbWVcIiA6IG5hbWVcclxuICAgIHRoaXMuZXZhbHVhdGVOYW1lID0gZXZhbHVhdGVOYW1lXHJcbiAgICB0aGlzLnByZXNlbnRhdGlvbkhpbnQgPSBwcmVzZW50YXRpb25IaW50XHJcbiAgICB0aGlzLl90eXBlID0gdHlwZVxyXG4gICAgdGhpcy5hdmFpbGFibGUgPSBhdmFpbGFibGVcclxuICAgIHRoaXMuX3ZhbHVlID0gdmFsdWVcclxuICB9XHJcblxyXG4gIGdldCB0eXBlKCk6ID9zdHJpbmcge1xyXG4gICAgcmV0dXJuIHRoaXMuX3R5cGVcclxuICB9XHJcblxyXG4gIGdldCBncmFtbWFyTmFtZSgpOiA/c3RyaW5nIHtcclxuICAgIGlmICh0aGlzLnByb2Nlc3MgPT0gbnVsbCkge1xyXG4gICAgICByZXR1cm4gbnVsbFxyXG4gICAgfVxyXG4gICAgcmV0dXJuIHRoaXMucHJvY2Vzcy5jb25maWd1cmF0aW9uLmdyYW1tYXJOYW1lXHJcbiAgfVxyXG5cclxuICBhc3luYyBzZXRWYXJpYWJsZSh2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCBwcm9jZXNzID0gbnVsbHRocm93cyh0aGlzLnByb2Nlc3MpXHJcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfRURJVF9WQVJJQUJMRSwge1xyXG4gICAgICBsYW5ndWFnZTogcHJvY2Vzcy5jb25maWd1cmF0aW9uLmFkYXB0ZXJUeXBlLFxyXG4gICAgfSlcclxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcHJvY2Vzcy5zZXNzaW9uLnNldFZhcmlhYmxlKHtcclxuICAgICAgbmFtZTogbnVsbHRocm93cyh0aGlzLm5hbWUpLFxyXG4gICAgICB2YWx1ZSxcclxuICAgICAgdmFyaWFibGVzUmVmZXJlbmNlOiB0aGlzLnBhcmVudC5yZWZlcmVuY2UsXHJcbiAgICB9KVxyXG4gICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLmJvZHkpIHtcclxuICAgICAgdGhpcy5fdmFsdWUgPSByZXNwb25zZS5ib2R5LnZhbHVlXHJcbiAgICAgIHRoaXMuX3R5cGUgPSByZXNwb25zZS5ib2R5LnR5cGUgPT0gbnVsbCA/IHRoaXMuX3R5cGUgOiByZXNwb25zZS5ib2R5LnR5cGVcclxuICAgICAgdGhpcy5yZWZlcmVuY2UgPSByZXNwb25zZS5ib2R5LnZhcmlhYmxlc1JlZmVyZW5jZSB8fCAwXHJcbiAgICAgIHRoaXMuX25hbWVkVmFyaWFibGVzID0gcmVzcG9uc2UuYm9keS5uYW1lZFZhcmlhYmxlcyB8fCAwXHJcbiAgICAgIHRoaXMuX2luZGV4ZWRWYXJpYWJsZXMgPSByZXNwb25zZS5ib2R5LmluZGV4ZWRWYXJpYWJsZXMgfHwgMFxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgY2FuU2V0VmFyaWFibGUoKTogYm9vbGVhbiB7XHJcbiAgICBjb25zdCBwcm9jID0gdGhpcy5wcm9jZXNzXHJcbiAgICBpZiAocHJvYyA9PSBudWxsKSB7XHJcbiAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHN1cHBvcnRzU2V0VmFyaWFibGUgPSBCb29sZWFuKHByb2Muc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNTZXRWYXJpYWJsZSlcclxuXHJcbiAgICAvLyBXZSBjYW4ndCBzZXQgdmFyaWFibGVzIGlmIHRoZSB0YXJnZXQgaXMgcmVhZCBvbmx5LlxyXG4gICAgLy8gV2UgYWxzbyByZXF1aXJlIGEgdmFyaWFibGVzIHJlZmVyZW5jZSBmb3IgdGhlIHBhcmVudCBmb3IgdGhlIHByb3RvY29sLFxyXG4gICAgLy8gYW5kIGN1cnJlbnRseSBvbmx5IHNldCBvbiBsZWF2ZXMgKHZhcmlhYmxlcyB3aXRoIG5vIGNoaWxkcmVuKSBiZWNhdXNlXHJcbiAgICAvLyB0aGlzIGxheWVyIGRvZXNuJ3Qga25vdyBob3cgdG8gcGFyc2UgaW5pdGlhbGl6ZXIgZXhwcmVzc2lvbnMgZm9yIHNldHRpbmdcclxuICAgIC8vIHRoZSB2YWx1ZSBvZiBjb21wbGV4IG9iamVjdHMgb3IgYXJyYXlzLlxyXG4gICAgLy8gVE9ETzogSXQnZCBiZSBuaWNlIHRvIGJlIGFibGUgdG8gc2V0IGFycmF5IGlkZW50aXRpZXMgaGVyZSBsaWtlOiBhID0gezEsIDIsIDN9LlxyXG4gICAgY29uc3QgaXNSZWFkT25seVRhcmdldCA9IEJvb2xlYW4ocHJvYy5jb25maWd1cmF0aW9uLmlzUmVhZE9ubHkpXHJcbiAgICBjb25zdCBoYXNWYWxpZFBhcmVudFJlZmVyZW5jZSA9XHJcbiAgICAgIHRoaXMucGFyZW50LnJlZmVyZW5jZSAhPSBudWxsICYmICFOdW1iZXIuaXNOYU4odGhpcy5wYXJlbnQucmVmZXJlbmNlKSAmJiB0aGlzLnBhcmVudC5yZWZlcmVuY2UgPj0gMFxyXG4gICAgcmV0dXJuICFpc1JlYWRPbmx5VGFyZ2V0ICYmIHN1cHBvcnRzU2V0VmFyaWFibGUgJiYgaGFzVmFsaWRQYXJlbnRSZWZlcmVuY2UgJiYgIXRoaXMuaGFzQ2hpbGRyZW4oKVxyXG4gIH1cclxuXHJcbiAgdG9TdHJpbmcoKTogc3RyaW5nIHtcclxuICAgIHJldHVybiBgJHt0aGlzLm5hbWV9OiAke3RoaXMuX3ZhbHVlfWBcclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBTY29wZSBleHRlbmRzIEV4cHJlc3Npb25Db250YWluZXIgaW1wbGVtZW50cyBJU2NvcGUge1xyXG4gICtuYW1lOiBzdHJpbmdcclxuICArZXhwZW5zaXZlOiBib29sZWFuXHJcbiAgK3JhbmdlOiA/YXRvbSRSYW5nZVxyXG5cclxuICBjb25zdHJ1Y3RvcihcclxuICAgIHN0YWNrRnJhbWU6IElTdGFja0ZyYW1lLFxyXG4gICAgaW5kZXg6IG51bWJlcixcclxuICAgIG5hbWU6IHN0cmluZyxcclxuICAgIHJlZmVyZW5jZTogbnVtYmVyLFxyXG4gICAgZXhwZW5zaXZlOiBib29sZWFuLFxyXG4gICAgbmFtZWRWYXJpYWJsZXM6ID9udW1iZXIsXHJcbiAgICBpbmRleGVkVmFyaWFibGVzOiA/bnVtYmVyLFxyXG4gICAgcmFuZ2U6ID9hdG9tJFJhbmdlXHJcbiAgKSB7XHJcbiAgICBzdXBlcihcclxuICAgICAgc3RhY2tGcmFtZS50aHJlYWQucHJvY2VzcyxcclxuICAgICAgcmVmZXJlbmNlLFxyXG4gICAgICBgc2NvcGU6JHtzdGFja0ZyYW1lLmdldElkKCl9OiR7bmFtZX06JHtpbmRleH1gLFxyXG4gICAgICBuYW1lZFZhcmlhYmxlcyxcclxuICAgICAgaW5kZXhlZFZhcmlhYmxlc1xyXG4gICAgKVxyXG4gICAgdGhpcy5uYW1lID0gbmFtZVxyXG4gICAgdGhpcy5leHBlbnNpdmUgPSBleHBlbnNpdmVcclxuICAgIHRoaXMucmFuZ2UgPSByYW5nZVxyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIFN0YWNrRnJhbWUgaW1wbGVtZW50cyBJU3RhY2tGcmFtZSB7XHJcbiAgc2NvcGVzOiA/UHJvbWlzZTxTY29wZVtdPlxyXG4gIHRocmVhZDogSVRocmVhZFxyXG4gIGZyYW1lSWQ6IG51bWJlclxyXG4gIHNvdXJjZTogSVNvdXJjZVxyXG4gIG5hbWU6IHN0cmluZ1xyXG4gIHByZXNlbnRhdGlvbkhpbnQ6ID9zdHJpbmdcclxuICByYW5nZTogYXRvbSRSYW5nZVxyXG4gIGluZGV4OiBudW1iZXJcclxuXHJcbiAgY29uc3RydWN0b3IoXHJcbiAgICB0aHJlYWQ6IElUaHJlYWQsXHJcbiAgICBmcmFtZUlkOiBudW1iZXIsXHJcbiAgICBzb3VyY2U6IElTb3VyY2UsXHJcbiAgICBuYW1lOiBzdHJpbmcsXHJcbiAgICBwcmVzZW50YXRpb25IaW50OiA/c3RyaW5nLFxyXG4gICAgcmFuZ2U6IGF0b20kUmFuZ2UsXHJcbiAgICBpbmRleDogbnVtYmVyXHJcbiAgKSB7XHJcbiAgICB0aGlzLnRocmVhZCA9IHRocmVhZFxyXG4gICAgdGhpcy5mcmFtZUlkID0gZnJhbWVJZFxyXG4gICAgdGhpcy5zb3VyY2UgPSBzb3VyY2VcclxuICAgIHRoaXMubmFtZSA9IG5hbWVcclxuICAgIHRoaXMucHJlc2VudGF0aW9uSGludCA9IHByZXNlbnRhdGlvbkhpbnRcclxuICAgIHRoaXMucmFuZ2UgPSByYW5nZVxyXG4gICAgdGhpcy5pbmRleCA9IGluZGV4XHJcbiAgICB0aGlzLnNjb3BlcyA9IG51bGxcclxuICB9XHJcblxyXG4gIGdldElkKCk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gYHN0YWNrZnJhbWU6JHt0aGlzLnRocmVhZC5nZXRJZCgpfToke3RoaXMuZnJhbWVJZH06JHt0aGlzLmluZGV4fWBcclxuICB9XHJcblxyXG4gIGFzeW5jIGdldFNjb3Blcyhmb3JjZVJlZnJlc2g6IGJvb2xlYW4pOiBQcm9taXNlPElTY29wZVtdPiB7XHJcbiAgICBpZiAodGhpcy5zY29wZXMgPT0gbnVsbCB8fCBmb3JjZVJlZnJlc2gpIHtcclxuICAgICAgdGhpcy5zY29wZXMgPSB0aGlzLl9nZXRTY29wZXNJbXBsKClcclxuICAgIH1cclxuICAgIHJldHVybiAodGhpcy5zY29wZXM6IGFueSlcclxuICB9XHJcblxyXG4gIGFzeW5jIF9nZXRTY29wZXNJbXBsKCk6IFByb21pc2U8U2NvcGVbXT4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3Qge1xyXG4gICAgICAgIGJvZHk6IHsgc2NvcGVzIH0sXHJcbiAgICAgIH0gPSBhd2FpdCB0aGlzLnRocmVhZC5wcm9jZXNzLnNlc3Npb24uc2NvcGVzKHtcclxuICAgICAgICBmcmFtZUlkOiB0aGlzLmZyYW1lSWQsXHJcbiAgICAgIH0pXHJcbiAgICAgIHJldHVybiBzY29wZXMubWFwKFxyXG4gICAgICAgIChycywgaW5kZXgpID0+XHJcbiAgICAgICAgICBuZXcgU2NvcGUoXHJcbiAgICAgICAgICAgIHRoaXMsXHJcbiAgICAgICAgICAgIGluZGV4LFxyXG4gICAgICAgICAgICBycy5uYW1lLFxyXG4gICAgICAgICAgICBycy52YXJpYWJsZXNSZWZlcmVuY2UsXHJcbiAgICAgICAgICAgIHJzLmV4cGVuc2l2ZSxcclxuICAgICAgICAgICAgcnMubmFtZWRWYXJpYWJsZXMsXHJcbiAgICAgICAgICAgIHJzLmluZGV4ZWRWYXJpYWJsZXMsXHJcbiAgICAgICAgICAgIHJzLmxpbmUgIT0gbnVsbFxyXG4gICAgICAgICAgICAgID8gbmV3IFJhbmdlKFxyXG4gICAgICAgICAgICAgICAgICBbcnMubGluZSAtIDEsIChycy5jb2x1bW4gIT0gbnVsbCA/IHJzLmNvbHVtbiA6IDEpIC0gMV0sXHJcbiAgICAgICAgICAgICAgICAgIFsocnMuZW5kTGluZSAhPSBudWxsID8gcnMuZW5kTGluZSA6IHJzLmxpbmUpIC0gMSwgKHJzLmVuZENvbHVtbiAhPSBudWxsID8gcnMuZW5kQ29sdW1uIDogMSkgLSAxXVxyXG4gICAgICAgICAgICAgICAgKVxyXG4gICAgICAgICAgICAgIDogbnVsbFxyXG4gICAgICAgICAgKVxyXG4gICAgICApXHJcbiAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgcmV0dXJuIFtdXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBhc3luYyBnZXRNb3N0U3BlY2lmaWNTY29wZXMocmFuZ2U6IGF0b20kUmFuZ2UpOiBQcm9taXNlPElTY29wZVtdPiB7XHJcbiAgICBjb25zdCBzY29wZXM6IEFycmF5PElTY29wZT4gPSAoYXdhaXQgdGhpcy5nZXRTY29wZXMoZmFsc2UpKS5maWx0ZXIoKHMpID0+ICFzLmV4cGVuc2l2ZSlcclxuICAgIGNvbnN0IGhhdmVSYW5nZUluZm8gPSBzY29wZXMuc29tZSgocykgPT4gcy5yYW5nZSAhPSBudWxsKVxyXG4gICAgaWYgKCFoYXZlUmFuZ2VJbmZvKSB7XHJcbiAgICAgIHJldHVybiBzY29wZXNcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBzY29wZXNDb250YWluaW5nUmFuZ2UgPSBzY29wZXNcclxuICAgICAgLmZpbHRlcigoc2NvcGUpID0+IHNjb3BlLnJhbmdlICE9IG51bGwgJiYgc2NvcGUucmFuZ2UuY29udGFpbnNSYW5nZShyYW5nZSkpXHJcbiAgICAgIC5zb3J0KChmaXJzdCwgc2Vjb25kKSA9PiB7XHJcbiAgICAgICAgY29uc3QgZmlyc3RSYW5nZSA9IG51bGx0aHJvd3MoZmlyc3QucmFuZ2UpXHJcbiAgICAgICAgY29uc3Qgc2Vjb25kUmFuZ2UgPSBudWxsdGhyb3dzKHNlY29uZC5yYW5nZSlcclxuICAgICAgICAvLyBwcmV0dGllci1pZ25vcmVcclxuICAgICAgICByZXR1cm4gKGZpcnN0UmFuZ2UuZW5kLnJvdyAtIGZpcnN0UmFuZ2Uuc3RhcnQucm93KSAtXHJcbiAgICAgICAgICAoc2Vjb25kUmFuZ2UuZW5kLnJvdyAtIHNlY29uZFJhbmdlLmVuZC5yb3cpO1xyXG4gICAgICB9KVxyXG4gICAgcmV0dXJuIHNjb3Blc0NvbnRhaW5pbmdSYW5nZS5sZW5ndGggPyBzY29wZXNDb250YWluaW5nUmFuZ2UgOiBzY29wZXNcclxuICB9XHJcblxyXG4gIGFzeW5jIHJlc3RhcnQoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBhd2FpdCB0aGlzLnRocmVhZC5wcm9jZXNzLnNlc3Npb24ucmVzdGFydEZyYW1lKHsgZnJhbWVJZDogdGhpcy5mcmFtZUlkIH0sIHRoaXMudGhyZWFkLnRocmVhZElkKVxyXG4gIH1cclxuXHJcbiAgdG9TdHJpbmcoKTogc3RyaW5nIHtcclxuICAgIHJldHVybiBgJHt0aGlzLm5hbWV9ICgke3RoaXMuc291cmNlLmluTWVtb3J5ID8gbnVsbHRocm93cyh0aGlzLnNvdXJjZS5uYW1lKSA6IHRoaXMuc291cmNlLnVyaX06JHtcclxuICAgICAgdGhpcy5yYW5nZS5zdGFydC5yb3dcclxuICAgIH0pYFxyXG4gIH1cclxuXHJcbiAgYXN5bmMgb3BlbkluRWRpdG9yKCk6IFByb21pc2U8P2F0b20kVGV4dEVkaXRvcj4ge1xyXG4gICAgY29uc3QgcmF3UGF0aCA9IHRoaXMuc291cmNlLnJhdy5wYXRoXHJcbiAgICBjb25zdCBsb2NhbFJhd1BhdGggPSBudWNsaWRlVXJpLmdldFBhdGgocmF3UGF0aCB8fCBcIlwiKVxyXG4gICAgaWYgKFxyXG4gICAgICByYXdQYXRoICE9IG51bGwgJiZcclxuICAgICAgbG9jYWxSYXdQYXRoICE9PSBcIlwiICYmXHJcbiAgICAgIChhd2FpdCBnZXRWU0NvZGVEZWJ1Z2dlckFkYXB0ZXJTZXJ2aWNlQnlOdWNsaWRlVXJpKHJhd1BhdGgpLmV4aXN0cyhsb2NhbFJhd1BhdGgpKVxyXG4gICAgKSB7XHJcbiAgICAgIHJldHVybiBvcGVuU291cmNlTG9jYXRpb24ocmF3UGF0aCwgdGhpcy5yYW5nZS5zdGFydC5yb3cpXHJcbiAgICB9XHJcbiAgICBpZiAodGhpcy5zb3VyY2UuYXZhaWxhYmxlKSB7XHJcbiAgICAgIHJldHVybiBvcGVuU291cmNlTG9jYXRpb24odGhpcy5zb3VyY2UudXJpLCB0aGlzLnJhbmdlLnN0YXJ0LnJvdylcclxuICAgIH1cclxuICAgIHJldHVybiBudWxsXHJcbiAgfVxyXG59XHJcblxyXG50eXBlIENhbGxTdGFjayA9IHtcclxuICB2YWxpZDogYm9vbGVhbixcclxuICBjYWxsRnJhbWVzOiBJU3RhY2tGcmFtZVtdLFxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgVGhyZWFkIGltcGxlbWVudHMgSVRocmVhZCB7XHJcbiAgX2NhbGxTdGFjazogQ2FsbFN0YWNrXHJcbiAgX3JlZnJlc2hJblByb2dyZXNzOiBib29sZWFuXHJcbiAgc3RvcHBlZERldGFpbHM6ID9JUmF3U3RvcHBlZERldGFpbHNcclxuICBzdG9wcGVkOiBib29sZWFuXHJcbiAgK3Byb2Nlc3M6IElQcm9jZXNzXHJcbiAgK3RocmVhZElkOiBudW1iZXJcclxuICBuYW1lOiBzdHJpbmdcclxuXHJcbiAgY29uc3RydWN0b3IocHJvY2VzczogSVByb2Nlc3MsIG5hbWU6IHN0cmluZywgdGhyZWFkSWQ6IG51bWJlcikge1xyXG4gICAgdGhpcy5wcm9jZXNzID0gcHJvY2Vzc1xyXG4gICAgdGhpcy5uYW1lID0gbmFtZVxyXG4gICAgdGhpcy50aHJlYWRJZCA9IHRocmVhZElkXHJcbiAgICB0aGlzLnN0b3BwZWREZXRhaWxzID0gbnVsbFxyXG4gICAgdGhpcy5fY2FsbFN0YWNrID0gdGhpcy5fZ2V0RW1wdHlDYWxsc3RhY2tTdGF0ZSgpXHJcbiAgICB0aGlzLnN0b3BwZWQgPSBmYWxzZVxyXG4gICAgdGhpcy5fcmVmcmVzaEluUHJvZ3Jlc3MgPSBmYWxzZVxyXG4gIH1cclxuXHJcbiAgX2dldEVtcHR5Q2FsbHN0YWNrU3RhdGUoKTogQ2FsbFN0YWNrIHtcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHZhbGlkOiBmYWxzZSxcclxuICAgICAgY2FsbEZyYW1lczogW10sXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBfaXNDYWxsc3RhY2tMb2FkZWQoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5fY2FsbFN0YWNrLnZhbGlkXHJcbiAgfVxyXG5cclxuICBfaXNDYWxsc3RhY2tGdWxseUxvYWRlZCgpOiBib29sZWFuIHtcclxuICAgIHJldHVybiAoXHJcbiAgICAgIHRoaXMuX2lzQ2FsbHN0YWNrTG9hZGVkKCkgJiZcclxuICAgICAgdGhpcy5zdG9wcGVkRGV0YWlscyAhPSBudWxsICYmXHJcbiAgICAgIHRoaXMuc3RvcHBlZERldGFpbHMudG90YWxGcmFtZXMgIT0gbnVsbCAmJlxyXG4gICAgICAhTnVtYmVyLmlzTmFOKHRoaXMuc3RvcHBlZERldGFpbHMudG90YWxGcmFtZXMpICYmXHJcbiAgICAgIHRoaXMuc3RvcHBlZERldGFpbHMudG90YWxGcmFtZXMgPj0gMCAmJlxyXG4gICAgICB0aGlzLl9jYWxsU3RhY2suY2FsbEZyYW1lcy5sZW5ndGggPj0gdGhpcy5zdG9wcGVkRGV0YWlscy50b3RhbEZyYW1lc1xyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgZ2V0SWQoKTogc3RyaW5nIHtcclxuICAgIHJldHVybiBgdGhyZWFkOiR7dGhpcy5wcm9jZXNzLmdldElkKCl9OiR7dGhpcy50aHJlYWRJZH1gXHJcbiAgfVxyXG5cclxuICBhZGRpdGlvbmFsRnJhbWVzQXZhaWxhYmxlKGN1cnJlbnRGcmFtZUNvdW50OiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgIGlmICh0aGlzLl9jYWxsU3RhY2suY2FsbEZyYW1lcy5sZW5ndGggPiBjdXJyZW50RnJhbWVDb3VudCkge1xyXG4gICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgfVxyXG4gICAgY29uc3Qgc3VwcG9ydHNEZWxheUxvYWRpbmcgPSBudWxsdGhyb3dzKHRoaXMucHJvY2Vzcykuc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNEZWxheWVkU3RhY2tUcmFjZUxvYWRpbmcgPT09IHRydWVcclxuICAgIGlmIChcclxuICAgICAgc3VwcG9ydHNEZWxheUxvYWRpbmcgJiZcclxuICAgICAgdGhpcy5zdG9wcGVkRGV0YWlscyAhPSBudWxsICYmXHJcbiAgICAgIHRoaXMuc3RvcHBlZERldGFpbHMudG90YWxGcmFtZXMgIT0gbnVsbCAmJlxyXG4gICAgICB0aGlzLnN0b3BwZWREZXRhaWxzLnRvdGFsRnJhbWVzID4gY3VycmVudEZyYW1lQ291bnRcclxuICAgICkge1xyXG4gICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBmYWxzZVxyXG4gIH1cclxuXHJcbiAgY2xlYXJDYWxsU3RhY2soKTogdm9pZCB7XHJcbiAgICB0aGlzLl9jYWxsU3RhY2sgPSB0aGlzLl9nZXRFbXB0eUNhbGxzdGFja1N0YXRlKClcclxuICB9XHJcblxyXG4gIGdldENhbGxTdGFja1RvcEZyYW1lKCk6ID9JU3RhY2tGcmFtZSB7XHJcbiAgICByZXR1cm4gdGhpcy5faXNDYWxsc3RhY2tMb2FkZWQoKSA/IHRoaXMuX2NhbGxTdGFjay5jYWxsRnJhbWVzWzBdIDogbnVsbFxyXG4gIH1cclxuXHJcbiAgZ2V0RnVsbENhbGxTdGFjayhsZXZlbHM/OiBudW1iZXIpOiBPYnNlcnZhYmxlPEV4cGVjdGVkPElTdGFja0ZyYW1lW10+PiB7XHJcbiAgICBpZiAoXHJcbiAgICAgIHRoaXMuX3JlZnJlc2hJblByb2dyZXNzIHx8XHJcbiAgICAgIHRoaXMuX2lzQ2FsbHN0YWNrRnVsbHlMb2FkZWQoKSB8fFxyXG4gICAgICAobGV2ZWxzICE9IG51bGwgJiYgdGhpcy5faXNDYWxsc3RhY2tMb2FkZWQoKSAmJiB0aGlzLl9jYWxsU3RhY2suY2FsbEZyYW1lcy5sZW5ndGggPj0gbGV2ZWxzKVxyXG4gICAgKSB7XHJcbiAgICAgIC8vIFdlIGhhdmUgYSBzdWZmaWNlbnQgY2FsbCBzdGFjayBhbHJlYWR5IGxvYWRlZCwganVzdCByZXR1cm4gaXQuXHJcbiAgICAgIHJldHVybiBPYnNlcnZhYmxlLm9mKEV4cGVjdC52YWx1ZSh0aGlzLl9jYWxsU3RhY2suY2FsbEZyYW1lcykpXHJcbiAgICB9XHJcblxyXG4gICAgLy8gUmV0dXJuIGEgcGVuZGluZyB2YWx1ZSBhbmQga2ljayBvZmYgdGhlIGZldGNoLiBXaGVuIHRoZSBmZXRjaFxyXG4gICAgLy8gaXMgZG9uZSwgZW1pdCB0aGUgbmV3IGNhbGwgZnJhbWVzLlxyXG4gICAgcmV0dXJuIE9ic2VydmFibGUuY29uY2F0KFxyXG4gICAgICBPYnNlcnZhYmxlLm9mKEV4cGVjdC5wZW5kaW5nKCkpLFxyXG4gICAgICBPYnNlcnZhYmxlLmZyb21Qcm9taXNlKHRoaXMucmVmcmVzaENhbGxTdGFjayhsZXZlbHMpKS5zd2l0Y2hNYXAoKCkgPT5cclxuICAgICAgICBPYnNlcnZhYmxlLm9mKEV4cGVjdC52YWx1ZSh0aGlzLl9jYWxsU3RhY2suY2FsbEZyYW1lcykpXHJcbiAgICAgIClcclxuICAgIClcclxuICB9XHJcblxyXG4gIGdldENhY2hlZENhbGxTdGFjaygpOiBJU3RhY2tGcmFtZVtdIHtcclxuICAgIHJldHVybiB0aGlzLl9jYWxsU3RhY2suY2FsbEZyYW1lc1xyXG4gIH1cclxuXHJcbiAgLyoqXHJcbiAgICogUXVlcmllcyB0aGUgZGVidWcgYWRhcHRlciBmb3IgdGhlIGNhbGxzdGFjayBhbmQgcmV0dXJucyBhIHByb21pc2VcclxuICAgKiB3aGljaCBjb21wbGV0ZXMgb25jZSB0aGUgY2FsbCBzdGFjayBoYXMgYmVlbiByZXRyaWV2ZWQuXHJcbiAgICogSWYgdGhlIHRocmVhZCBpcyBub3Qgc3RvcHBlZCwgaXQgcmV0dXJucyBhIHByb21pc2UgdG8gYW4gZW1wdHkgYXJyYXkuXHJcbiAgICpcclxuICAgKiBJZiBzcGVjaWZpZWQsIGxldmVscyBpbmRpY2F0ZXMgdGhlIG1heGltdW0gZGVwdGggb2YgY2FsbCBmcmFtZXMgdG8gZmV0Y2guXHJcbiAgICovXHJcbiAgYXN5bmMgcmVmcmVzaENhbGxTdGFjayhsZXZlbHM6ID9udW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGlmICghdGhpcy5zdG9wcGVkKSB7XHJcbiAgICAgIHJldHVyblxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IHN1cHBvcnRzRGVsYXlMb2FkaW5nID0gbnVsbHRocm93cyh0aGlzLnByb2Nlc3MpLnNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzRGVsYXllZFN0YWNrVHJhY2VMb2FkaW5nID09PSB0cnVlXHJcblxyXG4gICAgdGhpcy5fcmVmcmVzaEluUHJvZ3Jlc3MgPSB0cnVlXHJcbiAgICB0cnkge1xyXG4gICAgICBpZiAoc3VwcG9ydHNEZWxheUxvYWRpbmcpIHtcclxuICAgICAgICBjb25zdCBzdGFydCA9IHRoaXMuX2NhbGxTdGFjay5jYWxsRnJhbWVzLmxlbmd0aFxyXG4gICAgICAgIGNvbnN0IGNhbGxTdGFjayA9IGF3YWl0IHRoaXMuX2dldENhbGxTdGFja0ltcGwoc3RhcnQsIGxldmVscylcclxuICAgICAgICBpZiAoc3RhcnQgPCB0aGlzLl9jYWxsU3RhY2suY2FsbEZyYW1lcy5sZW5ndGgpIHtcclxuICAgICAgICAgIC8vIFNldCB0aGUgc3RhY2sgZnJhbWVzIGZvciBleGFjdCBwb3NpdGlvbiB3ZSByZXF1ZXN0ZWQuXHJcbiAgICAgICAgICAvLyBUbyBtYWtlIHN1cmUgbm8gY29uY3VycmVudCByZXF1ZXN0cyBjcmVhdGUgZHVwbGljYXRlIHN0YWNrIGZyYW1lcyAjMzA2NjBcclxuICAgICAgICAgIHRoaXMuX2NhbGxTdGFjay5jYWxsRnJhbWVzLnNwbGljZShzdGFydCwgdGhpcy5fY2FsbFN0YWNrLmNhbGxGcmFtZXMubGVuZ3RoIC0gc3RhcnQpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHRoaXMuX2NhbGxTdGFjay5jYWxsRnJhbWVzID0gdGhpcy5fY2FsbFN0YWNrLmNhbGxGcmFtZXMuY29uY2F0KGNhbGxTdGFjayB8fCBbXSlcclxuICAgICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBNdXN0IGxvYWQgdGhlIGVudGlyZSBjYWxsIHN0YWNrLCB0aGUgZGVidWdnZXIgYmFja2VuZCBkb2Vzbid0IHN1cHBvcnRcclxuICAgICAgICAvLyBkZWxheWVkIGNhbGwgc3RhY2sgbG9hZGluZy5cclxuICAgICAgICB0aGlzLl9jYWxsU3RhY2suY2FsbEZyYW1lcyA9IChhd2FpdCB0aGlzLl9nZXRDYWxsU3RhY2tJbXBsKDAsIG51bGwpKSB8fCBbXVxyXG4gICAgICB9XHJcblxyXG4gICAgICB0aGlzLl9jYWxsU3RhY2sudmFsaWQgPSB0cnVlXHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICB0aGlzLl9yZWZyZXNoSW5Qcm9ncmVzcyA9IGZhbHNlXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBhc3luYyBfZ2V0Q2FsbFN0YWNrSW1wbChzdGFydEZyYW1lOiBudW1iZXIsIGxldmVsczogP251bWJlcik6IFByb21pc2U8SVN0YWNrRnJhbWVbXT4ge1xyXG4gICAgdHJ5IHtcclxuICAgICAgY29uc3Qgc3RhY2tUcmFjZUFyZ3M6IERlYnVnUHJvdG9jb2wuU3RhY2tUcmFjZUFyZ3VtZW50cyA9IHtcclxuICAgICAgICB0aHJlYWRJZDogdGhpcy50aHJlYWRJZCxcclxuICAgICAgICBzdGFydEZyYW1lLFxyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBPbmx5IGluY2x1ZGUgbGV2ZWxzIGlmIHNwZWNpZmllZCBhbmQgc3VwcG9ydGVkLiBJZiBsZXZlbHMgaXMgb21pdHRlZCxcclxuICAgICAgLy8gdGhlIGRlYnVnIGFkYXB0ZXIgaXMgdG8gcmV0dXJuIGFsbCBzdGFjayBmcmFtZXMsIHBlciB0aGUgcHJvdG9jb2wuXHJcbiAgICAgIGlmIChsZXZlbHMgIT0gbnVsbCkge1xyXG4gICAgICAgIHN0YWNrVHJhY2VBcmdzLmxldmVscyA9IGxldmVsc1xyXG4gICAgICB9XHJcblxyXG4gICAgICBjb25zdCByZXNwb25zZTogRGVidWdQcm90b2NvbC5TdGFja1RyYWNlUmVzcG9uc2UgPSBhd2FpdCB0aGlzLnByb2Nlc3Muc2Vzc2lvbi5zdGFja1RyYWNlKHN0YWNrVHJhY2VBcmdzKVxyXG4gICAgICBpZiAocmVzcG9uc2UgPT0gbnVsbCB8fCByZXNwb25zZS5ib2R5ID09IG51bGwpIHtcclxuICAgICAgICByZXR1cm4gW11cclxuICAgICAgfVxyXG4gICAgICBpZiAodGhpcy5zdG9wcGVkRGV0YWlscyAhPSBudWxsKSB7XHJcbiAgICAgICAgdGhpcy5zdG9wcGVkRGV0YWlscy50b3RhbEZyYW1lcyA9IHJlc3BvbnNlLmJvZHkudG90YWxGcmFtZXNcclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIHJlc3BvbnNlLmJvZHkuc3RhY2tGcmFtZXMubWFwKChyc2YsIGluZGV4KSA9PiB7XHJcbiAgICAgICAgY29uc3Qgc291cmNlID0gdGhpcy5wcm9jZXNzLmdldFNvdXJjZShyc2Yuc291cmNlKVxyXG5cclxuICAgICAgICByZXR1cm4gbmV3IFN0YWNrRnJhbWUoXHJcbiAgICAgICAgICB0aGlzLFxyXG4gICAgICAgICAgcnNmLmlkLFxyXG4gICAgICAgICAgc291cmNlLFxyXG4gICAgICAgICAgcnNmLm5hbWUsXHJcbiAgICAgICAgICByc2YucHJlc2VudGF0aW9uSGludCxcclxuICAgICAgICAgIC8vIFRoZSBVSSBpcyAwLWJhc2VkIHdoaWxlIFZTUCBpcyAxLWJhc2VkLlxyXG4gICAgICAgICAgbmV3IFJhbmdlKFxyXG4gICAgICAgICAgICBbcnNmLmxpbmUgLSAxLCAocnNmLmNvbHVtbiB8fCAxKSAtIDFdLFxyXG4gICAgICAgICAgICBbKHJzZi5lbmRMaW5lICE9IG51bGwgPyByc2YuZW5kTGluZSA6IHJzZi5saW5lKSAtIDEsIChyc2YuZW5kQ29sdW1uICE9IG51bGwgPyByc2YuZW5kQ29sdW1uIDogMSkgLSAxXVxyXG4gICAgICAgICAgKSxcclxuICAgICAgICAgIHN0YXJ0RnJhbWUgKyBpbmRleFxyXG4gICAgICAgIClcclxuICAgICAgfSlcclxuICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICBpZiAodGhpcy5zdG9wcGVkRGV0YWlscyAhPSBudWxsKSB7XHJcbiAgICAgICAgdGhpcy5zdG9wcGVkRGV0YWlscy5mcmFtZXNFcnJvck1lc3NhZ2UgPSBlcnIubWVzc2FnZVxyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gW11cclxuICAgIH1cclxuICB9XHJcblxyXG4gIC8qKlxyXG4gICAqIFJldHVybnMgZXhjZXB0aW9uIGluZm8gcHJvbWlzZSBpZiB0aGUgZXhjZXB0aW9uIHdhcyB0aHJvd24sIG90aGVyd2lzZSBudWxsXHJcbiAgICovXHJcbiAgYXN5bmMgZXhjZXB0aW9uSW5mbygpOiBQcm9taXNlPD9JRXhjZXB0aW9uSW5mbz4ge1xyXG4gICAgY29uc3Qgc2Vzc2lvbiA9IHRoaXMucHJvY2Vzcy5zZXNzaW9uXHJcbiAgICBpZiAodGhpcy5zdG9wcGVkRGV0YWlscyA9PSBudWxsIHx8IHRoaXMuc3RvcHBlZERldGFpbHMucmVhc29uICE9PSBcImV4Y2VwdGlvblwiKSB7XHJcbiAgICAgIHJldHVybiBudWxsXHJcbiAgICB9XHJcbiAgICBjb25zdCBzdG9wcGVkRGV0YWlscyA9IHRoaXMuc3RvcHBlZERldGFpbHNcclxuICAgIGlmICghc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNFeGNlcHRpb25JbmZvUmVxdWVzdCkge1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIGlkOiBudWxsLFxyXG4gICAgICAgIGRldGFpbHM6IG51bGwsXHJcbiAgICAgICAgZGVzY3JpcHRpb246IHN0b3BwZWREZXRhaWxzLmRlc2NyaXB0aW9uLFxyXG4gICAgICAgIGJyZWFrTW9kZTogbnVsbCxcclxuICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGV4Y2VwdGlvbjogRGVidWdQcm90b2NvbC5FeGNlcHRpb25JbmZvUmVzcG9uc2UgPSBhd2FpdCBzZXNzaW9uLmV4Y2VwdGlvbkluZm8oeyB0aHJlYWRJZDogdGhpcy50aHJlYWRJZCB9KVxyXG4gICAgaWYgKGV4Y2VwdGlvbiA9PSBudWxsKSB7XHJcbiAgICAgIHJldHVybiBudWxsXHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgaWQ6IGV4Y2VwdGlvbi5ib2R5LmV4Y2VwdGlvbklkLFxyXG4gICAgICBkZXNjcmlwdGlvbjogZXhjZXB0aW9uLmJvZHkuZGVzY3JpcHRpb24sXHJcbiAgICAgIGJyZWFrTW9kZTogZXhjZXB0aW9uLmJvZHkuYnJlYWtNb2RlLFxyXG4gICAgICBkZXRhaWxzOiBleGNlcHRpb24uYm9keS5kZXRhaWxzLFxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgbmV4dCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9TVEVQX09WRVIpXHJcbiAgICBhd2FpdCB0aGlzLnByb2Nlc3Muc2Vzc2lvbi5uZXh0KHsgdGhyZWFkSWQ6IHRoaXMudGhyZWFkSWQgfSlcclxuICB9XHJcblxyXG4gIGFzeW5jIHN0ZXBJbigpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9TVEVQX0lOVE8pXHJcbiAgICBhd2FpdCB0aGlzLnByb2Nlc3Muc2Vzc2lvbi5zdGVwSW4oeyB0aHJlYWRJZDogdGhpcy50aHJlYWRJZCB9KVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgc3RlcE91dCgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9TVEVQX09VVClcclxuICAgIGF3YWl0IHRoaXMucHJvY2Vzcy5zZXNzaW9uLnN0ZXBPdXQoeyB0aHJlYWRJZDogdGhpcy50aHJlYWRJZCB9KVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgc3RlcEJhY2soKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfU1RFUF9CQUNLKVxyXG4gICAgYXdhaXQgdGhpcy5wcm9jZXNzLnNlc3Npb24uc3RlcEJhY2soeyB0aHJlYWRJZDogdGhpcy50aHJlYWRJZCB9KVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgY29udGludWUoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfU1RFUF9DT05USU5VRSlcclxuICAgIGF3YWl0IHRoaXMucHJvY2Vzcy5zZXNzaW9uLmNvbnRpbnVlKHsgdGhyZWFkSWQ6IHRoaXMudGhyZWFkSWQgfSlcclxuICB9XHJcblxyXG4gIGFzeW5jIHBhdXNlKCk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX1NURVBfUEFVU0UpXHJcbiAgICBhd2FpdCB0aGlzLnByb2Nlc3Muc2Vzc2lvbi5wYXVzZSh7IHRocmVhZElkOiB0aGlzLnRocmVhZElkIH0pXHJcbiAgfVxyXG5cclxuICBhc3luYyByZXZlcnNlQ29udGludWUoKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBhd2FpdCB0aGlzLnByb2Nlc3Muc2Vzc2lvbi5yZXZlcnNlQ29udGludWUoeyB0aHJlYWRJZDogdGhpcy50aHJlYWRJZCB9KVxyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIFByb2Nlc3MgaW1wbGVtZW50cyBJUHJvY2VzcyB7XHJcbiAgX3NvdXJjZXM6IE1hcDxzdHJpbmcsIElTb3VyY2U+XHJcbiAgX3RocmVhZHM6IE1hcDxudW1iZXIsIFRocmVhZD5cclxuICBfc2Vzc2lvbjogSVNlc3Npb24gJiBJVHJlZUVsZW1lbnRcclxuICBfY29uZmlndXJhdGlvbjogSVByb2Nlc3NDb25maWdcclxuICBfcGVuZGluZ1N0YXJ0OiBib29sZWFuXHJcbiAgX3BlbmRpbmdTdG9wOiBib29sZWFuXHJcbiAgYnJlYWtwb2ludHM6IEJyZWFrcG9pbnRbXVxyXG4gIGV4Y2VwdGlvbkJyZWFrcG9pbnRzOiBJRXhjZXB0aW9uQnJlYWtwb2ludFtdXHJcblxyXG4gIGNvbnN0cnVjdG9yKGNvbmZpZ3VyYXRpb246IElQcm9jZXNzQ29uZmlnLCBzZXNzaW9uOiBJU2Vzc2lvbiAmIElUcmVlRWxlbWVudCkge1xyXG4gICAgdGhpcy5fY29uZmlndXJhdGlvbiA9IGNvbmZpZ3VyYXRpb25cclxuICAgIHRoaXMuX3Nlc3Npb24gPSBzZXNzaW9uXHJcbiAgICB0aGlzLl90aHJlYWRzID0gbmV3IE1hcCgpXHJcbiAgICB0aGlzLl9zb3VyY2VzID0gbmV3IE1hcCgpXHJcbiAgICB0aGlzLl9wZW5kaW5nU3RhcnQgPSB0cnVlXHJcbiAgICB0aGlzLl9wZW5kaW5nU3RvcCA9IGZhbHNlXHJcbiAgICB0aGlzLmJyZWFrcG9pbnRzID0gW11cclxuICAgIHRoaXMuZXhjZXB0aW9uQnJlYWtwb2ludHMgPSBbXVxyXG4gIH1cclxuXHJcbiAgZ2V0IHNvdXJjZXMoKTogTWFwPHN0cmluZywgSVNvdXJjZT4ge1xyXG4gICAgcmV0dXJuIHRoaXMuX3NvdXJjZXNcclxuICB9XHJcblxyXG4gIGdldCBzZXNzaW9uKCk6IElTZXNzaW9uICYgSVRyZWVFbGVtZW50IHtcclxuICAgIHJldHVybiB0aGlzLl9zZXNzaW9uXHJcbiAgfVxyXG5cclxuICBnZXQgY29uZmlndXJhdGlvbigpOiBJUHJvY2Vzc0NvbmZpZyB7XHJcbiAgICByZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblxyXG4gIH1cclxuXHJcbiAgZ2V0IGRlYnVnZ2VyTW9kZSgpOiBEZWJ1Z2dlck1vZGVUeXBlIHtcclxuICAgIGlmICh0aGlzLl9wZW5kaW5nU3RhcnQpIHtcclxuICAgICAgcmV0dXJuIERlYnVnZ2VyTW9kZS5TVEFSVElOR1xyXG4gICAgfVxyXG5cclxuICAgIGlmICh0aGlzLl9wZW5kaW5nU3RvcCkge1xyXG4gICAgICByZXR1cm4gRGVidWdnZXJNb2RlLlNUT1BQSU5HXHJcbiAgICB9XHJcblxyXG4gICAgaWYgKHRoaXMuZ2V0QWxsVGhyZWFkcygpLnNvbWUoKHQpID0+IHQuc3RvcHBlZCkpIHtcclxuICAgICAgLy8gVE9PRDogQ3VycmVudGx5IG91ciBVWCBjb250cm9scyBzdXBwb3J0IHJlc3VtZSBhbmQgYXN5bmMtYnJlYWtcclxuICAgICAgLy8gb24gYSBwZXItcHJvY2VzcyBiYXNpcyBvbmx5LiBUaGlzIG5lZWRzIHRvIGJlIG1vZGlmaWVkIGhlcmUgaWZcclxuICAgICAgLy8gd2UgYWRkIHN1cHBvcnQgZm9yIGZyZWV6aW5nIGFuZCByZXN1bWluZyBpbmRpdmlkdWFsIHRocmVhZHMuXHJcbiAgICAgIHJldHVybiBEZWJ1Z2dlck1vZGUuUEFVU0VEXHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIERlYnVnZ2VyTW9kZS5SVU5OSU5HXHJcbiAgfVxyXG5cclxuICBjbGVhclByb2Nlc3NTdGFydGluZ0ZsYWcoKTogdm9pZCB7XHJcbiAgICB0aGlzLl9wZW5kaW5nU3RhcnQgPSBmYWxzZVxyXG4gIH1cclxuXHJcbiAgc2V0U3RvcFBlbmRpbmcoKTogdm9pZCB7XHJcbiAgICB0aGlzLl9wZW5kaW5nU3RvcCA9IHRydWVcclxuICB9XHJcblxyXG4gIGdldFNvdXJjZShyYXc6ID9EZWJ1Z1Byb3RvY29sLlNvdXJjZSk6IElTb3VyY2Uge1xyXG4gICAgbGV0IHNvdXJjZSA9IG5ldyBTb3VyY2UocmF3LCB0aGlzLmdldElkKCkpXHJcbiAgICBpZiAodGhpcy5fc291cmNlcy5oYXMoc291cmNlLnVyaSkpIHtcclxuICAgICAgc291cmNlID0gbnVsbHRocm93cyh0aGlzLl9zb3VyY2VzLmdldChzb3VyY2UudXJpKSlcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHRoaXMuX3NvdXJjZXMuc2V0KHNvdXJjZS51cmksIHNvdXJjZSlcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gc291cmNlXHJcbiAgfVxyXG5cclxuICBnZXRUaHJlYWQodGhyZWFkSWQ6IG51bWJlcik6ID9UaHJlYWQge1xyXG4gICAgcmV0dXJuIHRoaXMuX3RocmVhZHMuZ2V0KHRocmVhZElkKVxyXG4gIH1cclxuXHJcbiAgZ2V0QWxsVGhyZWFkcygpOiBJVGhyZWFkW10ge1xyXG4gICAgcmV0dXJuIEFycmF5LmZyb20odGhpcy5fdGhyZWFkcy52YWx1ZXMoKSlcclxuICB9XHJcblxyXG4gIGdldElkKCk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gdGhpcy5fc2Vzc2lvbi5nZXRJZCgpXHJcbiAgfVxyXG5cclxuICByYXdTdG9wcGVkVXBkYXRlKGRhdGE6IElSYXdTdG9wcHBlZFVwZGF0ZSk6IHZvaWQge1xyXG4gICAgY29uc3QgeyB0aHJlYWRJZCwgc3RvcHBlZERldGFpbHMgfSA9IGRhdGFcclxuXHJcbiAgICB0aGlzLmNsZWFyUHJvY2Vzc1N0YXJ0aW5nRmxhZygpXHJcblxyXG4gICAgaWYgKHRocmVhZElkICE9IG51bGwgJiYgIXRoaXMuX3RocmVhZHMuaGFzKHRocmVhZElkKSkge1xyXG4gICAgICAvLyBXZSdyZSBiZWluZyBhc2tlZCB0byB1cGRhdGUgYSB0aHJlYWQgd2UgaGF2ZW4ndCBzZWVuIHlldCwgc29cclxuICAgICAgLy8gY3JlYXRlIGl0XHJcbiAgICAgIGNvbnN0IHRocmVhZCA9IG5ldyBUaHJlYWQodGhpcywgYFRocmVhZCAke3RocmVhZElkfWAsIHRocmVhZElkKVxyXG4gICAgICB0aGlzLl90aHJlYWRzLnNldCh0aHJlYWRJZCwgdGhyZWFkKVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFNldCB0aGUgYXZhaWxhYmlsaXR5IG9mIHRoZSB0aHJlYWRzJyBjYWxsc3RhY2tzIGRlcGVuZGluZyBvblxyXG4gICAgLy8gd2hldGhlciB0aGUgdGhyZWFkIGlzIHN0b3BwZWQgb3Igbm90XHJcbiAgICBpZiAoc3RvcHBlZERldGFpbHMuYWxsVGhyZWFkc1N0b3BwZWQpIHtcclxuICAgICAgdGhpcy5fdGhyZWFkcy5mb3JFYWNoKCh0aHJlYWQpID0+IHtcclxuICAgICAgICB0aHJlYWQuc3RvcHBlZERldGFpbHMgPSB0aHJlYWQudGhyZWFkSWQgPT09IHRocmVhZElkID8gc3RvcHBlZERldGFpbHMgOiB0aHJlYWQuc3RvcHBlZERldGFpbHNcclxuICAgICAgICB0aHJlYWQuc3RvcHBlZCA9IHRydWVcclxuICAgICAgICB0aHJlYWQuY2xlYXJDYWxsU3RhY2soKVxyXG4gICAgICB9KVxyXG4gICAgfSBlbHNlIGlmICh0aHJlYWRJZCAhPSBudWxsKSB7XHJcbiAgICAgIC8vIE9uZSB0aHJlYWQgaXMgc3RvcHBlZCwgb25seSB1cGRhdGUgdGhhdCB0aHJlYWQuXHJcbiAgICAgIGNvbnN0IHRocmVhZCA9IG51bGx0aHJvd3ModGhpcy5fdGhyZWFkcy5nZXQodGhyZWFkSWQpKVxyXG4gICAgICB0aHJlYWQuc3RvcHBlZERldGFpbHMgPSBzdG9wcGVkRGV0YWlsc1xyXG4gICAgICB0aHJlYWQuY2xlYXJDYWxsU3RhY2soKVxyXG4gICAgICB0aHJlYWQuc3RvcHBlZCA9IHRydWVcclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJhd1RocmVhZFVwZGF0ZShkYXRhOiBJUmF3VGhyZWFkVXBkYXRlKTogdm9pZCB7XHJcbiAgICBjb25zdCB7IHRocmVhZCB9ID0gZGF0YVxyXG5cclxuICAgIHRoaXMuY2xlYXJQcm9jZXNzU3RhcnRpbmdGbGFnKClcclxuXHJcbiAgICBpZiAoIXRoaXMuX3RocmVhZHMuaGFzKHRocmVhZC5pZCkpIHtcclxuICAgICAgLy8gQSBuZXcgdGhyZWFkIGNhbWUgaW4sIGluaXRpYWxpemUgaXQuXHJcbiAgICAgIHRoaXMuX3RocmVhZHMuc2V0KHRocmVhZC5pZCwgbmV3IFRocmVhZCh0aGlzLCB0aHJlYWQubmFtZSwgdGhyZWFkLmlkKSlcclxuICAgIH0gZWxzZSBpZiAodGhyZWFkLm5hbWUpIHtcclxuICAgICAgLy8gSnVzdCB0aGUgdGhyZWFkIG5hbWUgZ290IHVwZGF0ZWQgIzE4MjQ0XHJcbiAgICAgIG51bGx0aHJvd3ModGhpcy5fdGhyZWFkcy5nZXQodGhyZWFkLmlkKSkubmFtZSA9IHRocmVhZC5uYW1lXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBjbGVhclRocmVhZHMocmVtb3ZlVGhyZWFkczogYm9vbGVhbiwgcmVmZXJlbmNlPzogbnVtYmVyKTogdm9pZCB7XHJcbiAgICBpZiAocmVmZXJlbmNlICE9IG51bGwpIHtcclxuICAgICAgaWYgKHRoaXMuX3RocmVhZHMuaGFzKHJlZmVyZW5jZSkpIHtcclxuICAgICAgICBjb25zdCB0aHJlYWQgPSBudWxsdGhyb3dzKHRoaXMuX3RocmVhZHMuZ2V0KHJlZmVyZW5jZSkpXHJcbiAgICAgICAgdGhyZWFkLmNsZWFyQ2FsbFN0YWNrKClcclxuICAgICAgICB0aHJlYWQuc3RvcHBlZERldGFpbHMgPSBudWxsXHJcbiAgICAgICAgdGhyZWFkLnN0b3BwZWQgPSBmYWxzZVxyXG5cclxuICAgICAgICBpZiAocmVtb3ZlVGhyZWFkcykge1xyXG4gICAgICAgICAgdGhpcy5fdGhyZWFkcy5kZWxldGUocmVmZXJlbmNlKVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5fdGhyZWFkcy5mb3JFYWNoKCh0aHJlYWQpID0+IHtcclxuICAgICAgICB0aHJlYWQuY2xlYXJDYWxsU3RhY2soKVxyXG4gICAgICAgIHRocmVhZC5zdG9wcGVkRGV0YWlscyA9IG51bGxcclxuICAgICAgICB0aHJlYWQuc3RvcHBlZCA9IGZhbHNlXHJcbiAgICAgIH0pXHJcblxyXG4gICAgICBpZiAocmVtb3ZlVGhyZWFkcykge1xyXG4gICAgICAgIHRoaXMuX3RocmVhZHMuY2xlYXIoKVxyXG4gICAgICAgIEV4cHJlc3Npb25Db250YWluZXIuYWxsVmFsdWVzLmNsZWFyKClcclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgYXN5bmMgY29tcGxldGlvbnMoXHJcbiAgICBmcmFtZUlkOiBudW1iZXIsXHJcbiAgICB0ZXh0OiBzdHJpbmcsXHJcbiAgICBwb3NpdGlvbjogYXRvbSRQb2ludCxcclxuICAgIG92ZXJ3cml0ZUJlZm9yZTogbnVtYmVyXHJcbiAgKTogUHJvbWlzZTxBcnJheTxEZWJ1Z1Byb3RvY29sLkNvbXBsZXRpb25JdGVtPj4ge1xyXG4gICAgaWYgKCF0aGlzLl9zZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c0NvbXBsZXRpb25zUmVxdWVzdCkge1xyXG4gICAgICByZXR1cm4gW11cclxuICAgIH1cclxuICAgIHRyeSB7XHJcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fc2Vzc2lvbi5jb21wbGV0aW9ucyh7XHJcbiAgICAgICAgZnJhbWVJZCxcclxuICAgICAgICB0ZXh0LFxyXG4gICAgICAgIGNvbHVtbjogcG9zaXRpb24uY29sdW1uLFxyXG4gICAgICAgIGxpbmU6IHBvc2l0aW9uLnJvdyxcclxuICAgICAgfSlcclxuICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLmJvZHkgJiYgcmVzcG9uc2UuYm9keS50YXJnZXRzKSB7XHJcbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlLmJvZHkudGFyZ2V0c1xyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJldHVybiBbXVxyXG4gICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICByZXR1cm4gW11cclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbmV4cG9ydCBjbGFzcyBCcmVha3BvaW50IGltcGxlbWVudHMgSUJyZWFrcG9pbnQge1xyXG4gIHZlcmlmaWVkOiBib29sZWFuXHJcbiAgaWRGcm9tQWRhcHRlcjogP251bWJlclxyXG4gIHVpQnJlYWtwb2ludElkOiBzdHJpbmdcclxuICB1cmk6IHN0cmluZ1xyXG4gIGxpbmU6IG51bWJlclxyXG4gIG9yaWdpbmFsTGluZTogbnVtYmVyXHJcbiAgY29sdW1uOiBudW1iZXJcclxuICBlbmFibGVkOiBib29sZWFuXHJcbiAgY29uZGl0aW9uOiA/c3RyaW5nXHJcbiAgbG9nTWVzc2FnZTogP3N0cmluZ1xyXG4gIGFkYXB0ZXJEYXRhOiBhbnlcclxuICBoaXRDb3VudDogP251bWJlclxyXG5cclxuICBjb25zdHJ1Y3RvcihcclxuICAgIHVpQnJlYWtwb2ludElkOiBzdHJpbmcsXHJcbiAgICB1cmk6IHN0cmluZyxcclxuICAgIGxpbmU6IG51bWJlcixcclxuICAgIGNvbHVtbjogbnVtYmVyLFxyXG4gICAgZW5hYmxlZDogYm9vbGVhbixcclxuICAgIGNvbmRpdGlvbjogP3N0cmluZyxcclxuICAgIGxvZ01lc3NhZ2U6ID9zdHJpbmcsXHJcbiAgICBhZGFwdGVyRGF0YT86IGFueVxyXG4gICkge1xyXG4gICAgdGhpcy51cmkgPSB1cmlcclxuICAgIHRoaXMubGluZSA9IGxpbmVcclxuICAgIHRoaXMub3JpZ2luYWxMaW5lID0gbGluZVxyXG4gICAgdGhpcy5jb2x1bW4gPSBjb2x1bW5cclxuICAgIHRoaXMuZW5hYmxlZCA9IGVuYWJsZWRcclxuICAgIHRoaXMuY29uZGl0aW9uID0gY29uZGl0aW9uXHJcbiAgICB0aGlzLmFkYXB0ZXJEYXRhID0gYWRhcHRlckRhdGFcclxuICAgIHRoaXMudmVyaWZpZWQgPSBmYWxzZVxyXG4gICAgdGhpcy51aUJyZWFrcG9pbnRJZCA9IHVpQnJlYWtwb2ludElkXHJcbiAgICB0aGlzLmhpdENvdW50ID0gbnVsbFxyXG5cclxuICAgIGlmIChjb25kaXRpb24gIT0gbnVsbCAmJiBjb25kaXRpb24udHJpbSgpICE9PSBcIlwiKSB7XHJcbiAgICAgIHRoaXMuY29uZGl0aW9uID0gY29uZGl0aW9uXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICB0aGlzLmNvbmRpdGlvbiA9IG51bGxcclxuICAgIH1cclxuICAgIGlmIChsb2dNZXNzYWdlICE9IG51bGwgJiYgbG9nTWVzc2FnZS50cmltKCkgIT09IFwiXCIpIHtcclxuICAgICAgdGhpcy5sb2dNZXNzYWdlID0gbG9nTWVzc2FnZVxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgdGhpcy5sb2dNZXNzYWdlID0gbnVsbFxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgZ2V0SWQoKTogc3RyaW5nIHtcclxuICAgIHJldHVybiB0aGlzLnVpQnJlYWtwb2ludElkXHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgRnVuY3Rpb25CcmVha3BvaW50IGltcGxlbWVudHMgSUZ1bmN0aW9uQnJlYWtwb2ludCB7XHJcbiAgaWQ6IHN0cmluZ1xyXG4gIHZlcmlmaWVkOiBib29sZWFuXHJcbiAgaWRGcm9tQWRhcHRlcjogP251bWJlclxyXG4gIG5hbWU6IHN0cmluZ1xyXG4gIGVuYWJsZWQ6IGJvb2xlYW5cclxuICBoaXRDb25kaXRpb246ID9zdHJpbmdcclxuICBjb25kaXRpb246ID9zdHJpbmdcclxuXHJcbiAgY29uc3RydWN0b3IobmFtZTogc3RyaW5nLCBlbmFibGVkOiBib29sZWFuLCBoaXRDb25kaXRpb246ID9zdHJpbmcpIHtcclxuICAgIHRoaXMubmFtZSA9IG5hbWVcclxuICAgIHRoaXMuZW5hYmxlZCA9IGVuYWJsZWRcclxuICAgIHRoaXMuaGl0Q29uZGl0aW9uID0gaGl0Q29uZGl0aW9uXHJcbiAgICB0aGlzLmNvbmRpdGlvbiA9IG51bGxcclxuICAgIHRoaXMudmVyaWZpZWQgPSBmYWxzZVxyXG4gICAgdGhpcy5pZEZyb21BZGFwdGVyID0gbnVsbFxyXG4gICAgdGhpcy5pZCA9IHV1aWQudjQoKVxyXG4gIH1cclxuXHJcbiAgZ2V0SWQoKTogc3RyaW5nIHtcclxuICAgIHJldHVybiB0aGlzLmlkXHJcbiAgfVxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgRXhjZXB0aW9uQnJlYWtwb2ludCBpbXBsZW1lbnRzIElFeGNlcHRpb25CcmVha3BvaW50IHtcclxuICBfaWQ6IHN0cmluZ1xyXG4gICtmaWx0ZXI6IHN0cmluZ1xyXG4gICtsYWJlbDogc3RyaW5nXHJcbiAgZW5hYmxlZDogYm9vbGVhblxyXG5cclxuICBjb25zdHJ1Y3RvcihmaWx0ZXI6IHN0cmluZywgbGFiZWw6IHN0cmluZywgZW5hYmxlZDogP2Jvb2xlYW4pIHtcclxuICAgIHRoaXMuZmlsdGVyID0gZmlsdGVyXHJcbiAgICB0aGlzLmxhYmVsID0gbGFiZWxcclxuICAgIHRoaXMuZW5hYmxlZCA9IGVuYWJsZWQgPT0gbnVsbCA/IGZhbHNlIDogZW5hYmxlZFxyXG4gICAgdGhpcy5faWQgPSB1dWlkLnY0KClcclxuICB9XHJcblxyXG4gIGdldElkKCk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gdGhpcy5faWRcclxuICB9XHJcbn1cclxuXHJcbmNvbnN0IEJSRUFLUE9JTlRTX0NIQU5HRUQgPSBcIkJSRUFLUE9JTlRTX0NIQU5HRURcIlxyXG5jb25zdCBXQVRDSF9FWFBSRVNTSU9OU19DSEFOR0VEID0gXCJXQVRDSF9FWFBSRVNTSU9OU19DSEFOR0VEXCJcclxuXHJcbmNvbnN0IENBTExTVEFDS19DSEFOR0VEID0gXCJDQUxMU1RBQ0tfQ0hBTkdFRFwiXHJcbmNvbnN0IFBST0NFU1NFU19DSEFOR0VEID0gXCJQUk9DRVNTRVNfQ0hBTkdFRFwiXHJcblxyXG50eXBlIGdldEZvY3VzZWRQcm9jZXNzQ2FsbGJhY2sgPSAoKSA9PiA/SVByb2Nlc3NcclxuXHJcbnR5cGUgU3luY09wdGlvbnMgPSB7XHJcbiAgZmlyZUV2ZW50OiBib29sZWFuLFxyXG59XHJcblxyXG5leHBvcnQgY2xhc3MgTW9kZWwgaW1wbGVtZW50cyBJTW9kZWwge1xyXG4gIF9wcm9jZXNzZXM6IFByb2Nlc3NbXVxyXG4gIF91aUJyZWFrcG9pbnRzOiBJVUlCcmVha3BvaW50W11cclxuICBfYnJlYWtwb2ludHNBY3RpdmF0ZWQ6IGJvb2xlYW5cclxuICBfZnVuY3Rpb25CcmVha3BvaW50czogRnVuY3Rpb25CcmVha3BvaW50W11cclxuICBfd2F0Y2hFeHByZXNzaW9uczogRXhwcmVzc2lvbltdXHJcbiAgX2Rpc3Bvc2FibGVzOiBVbml2ZXJzYWxEaXNwb3NhYmxlXHJcbiAgX2VtaXR0ZXI6IEVtaXR0ZXJcclxuICBfZ2V0Rm9jdXNlZFByb2Nlc3M6IGdldEZvY3VzZWRQcm9jZXNzQ2FsbGJhY2tcclxuXHJcbiAgLy8gRXhjZXB0aW9uIGJyZWFrcG9pbnQgZmlsdGVycyBhcmUgZGlmZmVyZW50IGZvciBlYWNoIGRlYnVnZ2VyIGJhY2stZW5kLCBzbyB0aGV5XHJcbiAgLy8gYXJlIHByb2Nlc3Mtc3BlY2lmaWMuIEhvd2V2ZXIsIHdoZW4gd2UncmUgbm90IGRlYnVnZ2luZywgaWRlYWxseSB3ZSdkIHdhbnQgdG8gc3RpbGxcclxuICAvLyBzaG93IGZpbHRlcnMgc28gdGhhdCBhIHVzZXIgY2FuIHNldCBicmVhayBvbiBleGNlcHRpb24gYmVmb3JlIHN0YXJ0aW5nIGRlYnVnZ2luZywgdG9cclxuICAvLyBlbmFibGUgYnJlYWtpbmcgb24gZWFybHkgZXhjZXB0aW9ucyBhcyB0aGUgdGFyZ2V0IHN0YXJ0cy4gRm9yIHRoaXMgcmVhc29uLCB3ZSBjYWNoZVxyXG4gIC8vIHdoYXRldmVyIG9wdGlvbnMgdGhlIG1vc3QgcmVjZW50bHkgZm9jdXNlZCBwcm9jZXNzIG9mZmVyZWQsIGFuZCBvZmZlciB0aG9zZS5cclxuICBfbW9zdFJlY2VudEV4Y2VwdGlvbkJyZWFrcG9pbnRzOiBJRXhjZXB0aW9uQnJlYWtwb2ludFtdXHJcblxyXG4gIGNvbnN0cnVjdG9yKFxyXG4gICAgdWlCcmVha3BvaW50czogSVVJQnJlYWtwb2ludFtdLFxyXG4gICAgYnJlYWtwb2ludHNBY3RpdmF0ZWQ6IGJvb2xlYW4sXHJcbiAgICBmdW5jdGlvbkJyZWFrcG9pbnRzOiBGdW5jdGlvbkJyZWFrcG9pbnRbXSxcclxuICAgIGV4Y2VwdGlvbkJyZWFrcG9pbnRzOiBFeGNlcHRpb25CcmVha3BvaW50W10sXHJcbiAgICB3YXRjaEV4cHJlc3Npb25zOiBFeHByZXNzaW9uW10sXHJcbiAgICBnZXRGb2N1c2VkUHJvY2VzczogZ2V0Rm9jdXNlZFByb2Nlc3NDYWxsYmFja1xyXG4gICkge1xyXG4gICAgdGhpcy5fcHJvY2Vzc2VzID0gW11cclxuICAgIHRoaXMuX3VpQnJlYWtwb2ludHMgPSB1aUJyZWFrcG9pbnRzXHJcbiAgICB0aGlzLl9icmVha3BvaW50c0FjdGl2YXRlZCA9IGJyZWFrcG9pbnRzQWN0aXZhdGVkXHJcbiAgICB0aGlzLl9mdW5jdGlvbkJyZWFrcG9pbnRzID0gZnVuY3Rpb25CcmVha3BvaW50c1xyXG4gICAgdGhpcy5fbW9zdFJlY2VudEV4Y2VwdGlvbkJyZWFrcG9pbnRzID0gKChleGNlcHRpb25CcmVha3BvaW50czogYW55KTogSUV4Y2VwdGlvbkJyZWFrcG9pbnRbXSlcclxuICAgIHRoaXMuX3dhdGNoRXhwcmVzc2lvbnMgPSB3YXRjaEV4cHJlc3Npb25zXHJcbiAgICB0aGlzLl9nZXRGb2N1c2VkUHJvY2VzcyA9IGdldEZvY3VzZWRQcm9jZXNzXHJcbiAgICB0aGlzLl9lbWl0dGVyID0gbmV3IEVtaXR0ZXIoKVxyXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSh0aGlzLl9lbWl0dGVyKVxyXG4gIH1cclxuXHJcbiAgZ2V0SWQoKTogc3RyaW5nIHtcclxuICAgIHJldHVybiBcInJvb3RcIlxyXG4gIH1cclxuXHJcbiAgZ2V0UHJvY2Vzc2VzKCk6IElQcm9jZXNzW10ge1xyXG4gICAgcmV0dXJuICh0aGlzLl9wcm9jZXNzZXM6IGFueSlcclxuICB9XHJcblxyXG4gIGFkZFByb2Nlc3MoY29uZmlndXJhdGlvbjogSVByb2Nlc3NDb25maWcsIHNlc3Npb246IElTZXNzaW9uICYgSVRyZWVFbGVtZW50KTogUHJvY2VzcyB7XHJcbiAgICBjb25zdCBwcm9jZXNzID0gbmV3IFByb2Nlc3MoY29uZmlndXJhdGlvbiwgc2Vzc2lvbilcclxuXHJcbiAgICAvLyBBZGQgYnJlYWtwb2ludHMgdG8gcHJvY2Vzcy5cclxuICAgIGNvbnN0IHByb2Nlc3NCcmVha3BvaW50cyA9IHByb2Nlc3MuYnJlYWtwb2ludHNcclxuICAgIGZvciAoY29uc3QgdWlCcCBvZiB0aGlzLl91aUJyZWFrcG9pbnRzKSB7XHJcbiAgICAgIHByb2Nlc3NCcmVha3BvaW50cy5wdXNoKFxyXG4gICAgICAgIG5ldyBCcmVha3BvaW50KHVpQnAuaWQsIHVpQnAudXJpLCB1aUJwLmxpbmUsIHVpQnAuY29sdW1uLCB1aUJwLmVuYWJsZWQsIHVpQnAuY29uZGl0aW9uLCB1aUJwLmxvZ01lc3NhZ2UpXHJcbiAgICAgIClcclxuICAgIH1cclxuXHJcbiAgICB0aGlzLl9wcm9jZXNzZXMucHVzaChwcm9jZXNzKVxyXG4gICAgdGhpcy5fZW1pdHRlci5lbWl0KFBST0NFU1NFU19DSEFOR0VEKVxyXG4gICAgcmV0dXJuIHByb2Nlc3NcclxuICB9XHJcblxyXG4gIHJlbW92ZVByb2Nlc3MoaWQ6IHN0cmluZyk6IEFycmF5PFByb2Nlc3M+IHtcclxuICAgIGNvbnN0IHJlbW92ZWRQcm9jZXNzZXMgPSBbXVxyXG4gICAgdGhpcy5fcHJvY2Vzc2VzID0gdGhpcy5fcHJvY2Vzc2VzLmZpbHRlcigocCkgPT4ge1xyXG4gICAgICBpZiAocC5nZXRJZCgpID09PSBpZCkge1xyXG4gICAgICAgIHJlbW92ZWRQcm9jZXNzZXMucHVzaChwKVxyXG4gICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIHJldHVybiB0cnVlXHJcbiAgICAgIH1cclxuICAgIH0pXHJcbiAgICB0aGlzLl9lbWl0dGVyLmVtaXQoUFJPQ0VTU0VTX0NIQU5HRUQpXHJcblxyXG4gICAgaWYgKHJlbW92ZWRQcm9jZXNzZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICB0aGlzLl9tb3N0UmVjZW50RXhjZXB0aW9uQnJlYWtwb2ludHMgPSByZW1vdmVkUHJvY2Vzc2VzWzBdLmV4Y2VwdGlvbkJyZWFrcG9pbnRzXHJcbiAgICB9XHJcbiAgICByZXR1cm4gcmVtb3ZlZFByb2Nlc3Nlc1xyXG4gIH1cclxuXHJcbiAgb25EaWRDaGFuZ2VCcmVha3BvaW50cyhjYWxsYmFjazogKCkgPT4gbWl4ZWQpOiBJRGlzcG9zYWJsZSB7XHJcbiAgICByZXR1cm4gdGhpcy5fZW1pdHRlci5vbihCUkVBS1BPSU5UU19DSEFOR0VELCBjYWxsYmFjaylcclxuICB9XHJcblxyXG4gIC8vIFRPRE86IFNjb3BlIHRoaXMgc28gdGhhdCBvbmx5IHRoZSB0cmVlIG5vZGVzIGZvciB0aGUgcHJvY2VzcyB0aGF0XHJcbiAgLy8gaGFkIGEgY2FsbCBzdGFjayBjaGFuZ2UgbmVlZCB0byByZS1yZW5kZXJcclxuICBvbkRpZENoYW5nZUNhbGxTdGFjayhjYWxsYmFjazogKCkgPT4gbWl4ZWQpOiBJRGlzcG9zYWJsZSB7XHJcbiAgICByZXR1cm4gdGhpcy5fZW1pdHRlci5vbihDQUxMU1RBQ0tfQ0hBTkdFRCwgY2FsbGJhY2spXHJcbiAgfVxyXG5cclxuICBvbkRpZENoYW5nZVByb2Nlc3NlcyhjYWxsYmFjazogKCkgPT4gbWl4ZWQpOiBJRGlzcG9zYWJsZSB7XHJcbiAgICByZXR1cm4gdGhpcy5fZW1pdHRlci5vbihQUk9DRVNTRVNfQ0hBTkdFRCwgY2FsbGJhY2spXHJcbiAgfVxyXG5cclxuICBvbkRpZENoYW5nZVdhdGNoRXhwcmVzc2lvbnMoY2FsbGJhY2s6IChleHByZXNzaW9uOiA/SUV4cHJlc3Npb24pID0+IG1peGVkKTogSURpc3Bvc2FibGUge1xyXG4gICAgcmV0dXJuIHRoaXMuX2VtaXR0ZXIub24oV0FUQ0hfRVhQUkVTU0lPTlNfQ0hBTkdFRCwgY2FsbGJhY2spXHJcbiAgfVxyXG5cclxuICByYXdVcGRhdGUoZGF0YTogSVJhd01vZGVsVXBkYXRlKTogdm9pZCB7XHJcbiAgICBjb25zdCBwcm9jZXNzID0gdGhpcy5fcHJvY2Vzc2VzLmZpbHRlcigocCkgPT4gcC5nZXRJZCgpID09PSBkYXRhLnNlc3Npb25JZCkucG9wKClcclxuICAgIGlmIChwcm9jZXNzID09IG51bGwpIHtcclxuICAgICAgcmV0dXJuXHJcbiAgICB9XHJcbiAgICBpZiAoZGF0YS5zdG9wcGVkRGV0YWlscyAhPSBudWxsKSB7XHJcbiAgICAgIHByb2Nlc3MucmF3U3RvcHBlZFVwZGF0ZSgoZGF0YTogYW55KSlcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgIHByb2Nlc3MucmF3VGhyZWFkVXBkYXRlKChkYXRhOiBhbnkpKVxyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChDQUxMU1RBQ0tfQ0hBTkdFRClcclxuICB9XHJcblxyXG4gIGNsZWFyVGhyZWFkcyhpZDogc3RyaW5nLCByZW1vdmVUaHJlYWRzOiBib29sZWFuLCByZWZlcmVuY2U/OiBudW1iZXIpOiB2b2lkIHtcclxuICAgIGNvbnN0IHByb2Nlc3MgPSB0aGlzLl9wcm9jZXNzZXMuZmlsdGVyKChwKSA9PiBwLmdldElkKCkgPT09IGlkKS5wb3AoKVxyXG5cclxuICAgIGlmIChwcm9jZXNzICE9IG51bGwpIHtcclxuICAgICAgcHJvY2Vzcy5jbGVhclRocmVhZHMocmVtb3ZlVGhyZWFkcywgcmVmZXJlbmNlKVxyXG4gICAgICB0aGlzLl9lbWl0dGVyLmVtaXQoQ0FMTFNUQUNLX0NIQU5HRUQpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBhc3luYyByZWZyZXNoQ2FsbFN0YWNrKHRocmVhZEk6IElUaHJlYWQsIGZldGNoQWxsRnJhbWVzOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCB0aHJlYWQ6IFRocmVhZCA9ICh0aHJlYWRJOiBhbnkpXHJcblxyXG4gICAgLy8gSWYgdGhlIGRlYnVnZ2VyIHN1cHBvcnRzIGRlbGF5ZWQgc3RhY2sgdHJhY2UgbG9hZGluZywgbG9hZCBvbmx5XHJcbiAgICAvLyB0aGUgZmlyc3QgY2FsbCBzdGFjayBmcmFtZSwgd2hpY2ggaXMgbmVlZGVkIHRvIGRpc3BsYXkgaW4gdGhlIHRocmVhZHNcclxuICAgIC8vIHZpZXcuIFdlIHdpbGwgbGF6aWx5IGxvYWQgdGhlIHJlbWFpbmluZyBmcmFtZXMgb25seSBmb3IgdGhyZWFkcyB0aGF0XHJcbiAgICAvLyBhcmUgdmlzaWJsZSBpbiB0aGUgVUksIGFsbG93aW5nIHVzIHRvIHNraXAgbG9hZGluZyBmcmFtZXMgd2UgZG9uJ3RcclxuICAgIC8vIG5lZWQgcmlnaHQgbm93LlxyXG4gICAgY29uc3QgZnJhbWVzVG9Mb2FkID1cclxuICAgICAgbnVsbHRocm93cyh0aHJlYWQucHJvY2Vzcykuc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNEZWxheWVkU3RhY2tUcmFjZUxvYWRpbmcgJiYgIWZldGNoQWxsRnJhbWVzID8gMSA6IG51bGxcclxuXHJcbiAgICB0aHJlYWQuY2xlYXJDYWxsU3RhY2soKVxyXG4gICAgYXdhaXQgdGhyZWFkLnJlZnJlc2hDYWxsU3RhY2soZnJhbWVzVG9Mb2FkKVxyXG4gICAgdGhpcy5fZW1pdHRlci5lbWl0KENBTExTVEFDS19DSEFOR0VEKVxyXG4gIH1cclxuXHJcbiAgZ2V0VUlCcmVha3BvaW50cygpOiBJVUlCcmVha3BvaW50W10ge1xyXG4gICAgcmV0dXJuIHRoaXMuX3VpQnJlYWtwb2ludHNcclxuICB9XHJcblxyXG4gIGdldEJyZWFrcG9pbnRzKCk6IElCcmVha3BvaW50W10ge1xyXG4gICAgLy8gSWYgd2UncmUgY3VycmVudGx5IGRlYnVnZ2luZywgcmV0dXJuIHRoZSBicmVha3BvaW50cyBhcyB0aGUgY3VycmVudFxyXG4gICAgLy8gZGVidWcgYWRhcHRlciBzZWVzIHRoZW0uXHJcbiAgICBjb25zdCBmb2N1c2VkUHJvY2VzcyA9IHRoaXMuX2dldEZvY3VzZWRQcm9jZXNzKClcclxuICAgIGlmIChmb2N1c2VkUHJvY2VzcyAhPSBudWxsKSB7XHJcbiAgICAgIGNvbnN0IGN1cnJlbnRQcm9jZXNzID0gdGhpcy5fcHJvY2Vzc2VzLmZpbmQoKHApID0+IHAuZ2V0SWQoKSA9PT0gZm9jdXNlZFByb2Nlc3MuZ2V0SWQoKSlcclxuICAgICAgaWYgKGN1cnJlbnRQcm9jZXNzICE9IG51bGwpIHtcclxuICAgICAgICByZXR1cm4gKGN1cnJlbnRQcm9jZXNzLmJyZWFrcG9pbnRzOiBhbnkpXHJcbiAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBPdGhlcndpc2UsIHJldHVybiB0aGUgVUkgYnJlYWtwb2ludHMuIFNpbmNlIHRoZXJlIGlzIG5vIGRlYnVnIHByb2Nlc3MsXHJcbiAgICAvLyB0aGUgYnJlYWtwb2ludHMgaGF2ZSB0aGVpciBvcmlnaW5hbCBsaW5lIGxvY2F0aW9uIGFuZCBubyBub3Rpb24gb2ZcclxuICAgIC8vIHZlcmlmaWVkIHZzIG5vdC5cclxuICAgIHJldHVybiB0aGlzLl91aUJyZWFrcG9pbnRzLm1hcCgodWlCcCkgPT4ge1xyXG4gICAgICBjb25zdCBicCA9IG5ldyBCcmVha3BvaW50KFxyXG4gICAgICAgIHVpQnAuaWQsXHJcbiAgICAgICAgdWlCcC51cmksXHJcbiAgICAgICAgdWlCcC5saW5lLFxyXG4gICAgICAgIHVpQnAuY29sdW1uLFxyXG4gICAgICAgIHVpQnAuZW5hYmxlZCxcclxuICAgICAgICB1aUJwLmNvbmRpdGlvbixcclxuICAgICAgICB1aUJwLmxvZ01lc3NhZ2VcclxuICAgICAgKVxyXG4gICAgICBicC52ZXJpZmllZCA9IHRydWVcclxuICAgICAgcmV0dXJuIGJwXHJcbiAgICB9KVxyXG4gIH1cclxuXHJcbiAgZ2V0QnJlYWtwb2ludEF0TGluZSh1cmk6IHN0cmluZywgbGluZTogbnVtYmVyKTogP0lCcmVha3BvaW50IHtcclxuICAgIGxldCBicmVha3BvaW50ID0gdGhpcy5nZXRCcmVha3BvaW50cygpLmZpbmQoKGJwKSA9PiBicC51cmkgPT09IHVyaSAmJiBicC5saW5lID09PSBsaW5lKVxyXG4gICAgaWYgKGJyZWFrcG9pbnQgPT0gbnVsbCkge1xyXG4gICAgICBicmVha3BvaW50ID0gdGhpcy5nZXRCcmVha3BvaW50cygpLmZpbmQoKGJwKSA9PiBicC51cmkgPT09IHVyaSAmJiBicC5vcmlnaW5hbExpbmUgPT09IGxpbmUpXHJcbiAgICB9XHJcbiAgICByZXR1cm4gYnJlYWtwb2ludFxyXG4gIH1cclxuXHJcbiAgZ2V0QnJlYWtwb2ludEJ5SWQoaWQ6IHN0cmluZyk6ID9JQnJlYWtwb2ludCB7XHJcbiAgICByZXR1cm4gdGhpcy5nZXRCcmVha3BvaW50cygpLmZpbmQoKGJwKSA9PiBicC5nZXRJZCgpID09PSBpZClcclxuICB9XHJcblxyXG4gIGdldEZ1bmN0aW9uQnJlYWtwb2ludHMoKTogSUZ1bmN0aW9uQnJlYWtwb2ludFtdIHtcclxuICAgIHJldHVybiAodGhpcy5fZnVuY3Rpb25CcmVha3BvaW50czogYW55KVxyXG4gIH1cclxuXHJcbiAgZ2V0RXhjZXB0aW9uQnJlYWtwb2ludHMoKTogSUV4Y2VwdGlvbkJyZWFrcG9pbnRbXSB7XHJcbiAgICBjb25zdCBmb2N1c2VkUHJvY2VzcyA9IHRoaXMuX2dldEZvY3VzZWRQcm9jZXNzKClcclxuICAgIGlmIChmb2N1c2VkUHJvY2VzcyAhPSBudWxsKSB7XHJcbiAgICAgIHJldHVybiAoZm9jdXNlZFByb2Nlc3MuZXhjZXB0aW9uQnJlYWtwb2ludHM6IGFueSlcclxuICAgIH1cclxuICAgIHJldHVybiAodGhpcy5fbW9zdFJlY2VudEV4Y2VwdGlvbkJyZWFrcG9pbnRzOiBhbnkpXHJcbiAgfVxyXG5cclxuICBzZXRFeGNlcHRpb25CcmVha3BvaW50cyhwcm9jZXNzOiBJUHJvY2VzcywgZGF0YTogRGVidWdQcm90b2NvbC5FeGNlcHRpb25CcmVha3BvaW50c0ZpbHRlcltdKTogdm9pZCB7XHJcbiAgICBwcm9jZXNzLmV4Y2VwdGlvbkJyZWFrcG9pbnRzID0gZGF0YS5tYXAoKGQpID0+IHtcclxuICAgICAgY29uc3QgZWJwID0gcHJvY2Vzcy5leGNlcHRpb25CcmVha3BvaW50cy5maWx0ZXIoKGJwKSA9PiBicC5maWx0ZXIgPT09IGQuZmlsdGVyKS5wb3AoKVxyXG4gICAgICByZXR1cm4gbmV3IEV4Y2VwdGlvbkJyZWFrcG9pbnQoZC5maWx0ZXIsIGQubGFiZWwsIGVicCA/IGVicC5lbmFibGVkIDogZC5kZWZhdWx0KVxyXG4gICAgfSlcclxuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChCUkVBS1BPSU5UU19DSEFOR0VEKVxyXG4gIH1cclxuXHJcbiAgYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQoKTogYm9vbGVhbiB7XHJcbiAgICByZXR1cm4gdGhpcy5fYnJlYWtwb2ludHNBY3RpdmF0ZWRcclxuICB9XHJcblxyXG4gIHNldEJyZWFrcG9pbnRzQWN0aXZhdGVkKGFjdGl2YXRlZDogYm9vbGVhbik6IHZvaWQge1xyXG4gICAgdGhpcy5fYnJlYWtwb2ludHNBY3RpdmF0ZWQgPSBhY3RpdmF0ZWRcclxuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChCUkVBS1BPSU5UU19DSEFOR0VEKVxyXG4gIH1cclxuXHJcbiAgYWRkVUlCcmVha3BvaW50cyh1aUJyZWFrcG9pbnRzOiBJVUlCcmVha3BvaW50W10sIGZpcmVFdmVudD86IGJvb2xlYW4gPSB0cnVlKTogdm9pZCB7XHJcbiAgICB0aGlzLl91aUJyZWFrcG9pbnRzID0gdGhpcy5fdWlCcmVha3BvaW50cy5jb25jYXQodWlCcmVha3BvaW50cylcclxuICAgIHRoaXMuX2JyZWFrcG9pbnRzQWN0aXZhdGVkID0gdHJ1ZVxyXG4gICAgdGhpcy5fc29ydFN5bmNBbmREZUR1cCh7IGZpcmVFdmVudCB9KVxyXG4gIH1cclxuXHJcbiAgcmVtb3ZlQnJlYWtwb2ludHModG9SZW1vdmU6IElCcmVha3BvaW50W10pOiB2b2lkIHtcclxuICAgIHRoaXMuX3VpQnJlYWtwb2ludHMgPSB0aGlzLl91aUJyZWFrcG9pbnRzLmZpbHRlcigoYnApID0+ICF0b1JlbW92ZS5zb21lKChyKSA9PiByLmdldElkKCkgPT09IGJwLmlkKSlcclxuXHJcbiAgICB0aGlzLl9zb3J0U3luY0FuZERlRHVwKClcclxuICB9XHJcblxyXG4gIHVwZGF0ZUJyZWFrcG9pbnRzKG5ld0JwczogSVVJQnJlYWtwb2ludFtdKTogdm9pZCB7XHJcbiAgICB0aGlzLl91aUJyZWFrcG9pbnRzID0gdGhpcy5fdWlCcmVha3BvaW50cy5maWx0ZXIoKGJwKSA9PiAhbmV3QnBzLnNvbWUoKG4pID0+IG4uaWQgPT09IGJwLmlkKSkuY29uY2F0KG5ld0JwcylcclxuXHJcbiAgICB0aGlzLl9zb3J0U3luY0FuZERlRHVwKClcclxuICB9XHJcblxyXG4gIC8vIFRoaXMgaXMgY2FsbGVkIHdoZW4gYSBicmVha3BvaW50IGlzIHVwZGF0ZWQgYnkgdGhlIGRlYnVnIGFkYXB0ZXIuXHJcbiAgLy8gSXQgYWZmZWN0cyBvbmx5IGJyZWFrcG9pbnRzIGZvciBhIHBhcnRpY3VsYXIgc2Vzc2lvbi5cclxuICB1cGRhdGVQcm9jZXNzQnJlYWtwb2ludHMoXHJcbiAgICBwcm9jZXNzOiBJUHJvY2VzcyxcclxuICAgIGRhdGE6IHtcclxuICAgICAgW2lkOiBzdHJpbmddOiBEZWJ1Z1Byb3RvY29sLkJyZWFrcG9pbnQsXHJcbiAgICB9XHJcbiAgKTogdm9pZCB7XHJcbiAgICBjb25zdCBwcm9jID0gdGhpcy5fcHJvY2Vzc2VzLmZpbmQoKHApID0+IHAuZ2V0SWQoKSA9PT0gcHJvY2Vzcy5nZXRJZCgpKVxyXG4gICAgaWYgKHByb2MgPT0gbnVsbCkge1xyXG4gICAgICByZXR1cm5cclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBicmVha3BvaW50cyA9IHByb2MuYnJlYWtwb2ludHNcclxuICAgIGJyZWFrcG9pbnRzLmZvckVhY2goKGJwKSA9PiB7XHJcbiAgICAgIGNvbnN0IGJwRGF0YSA9IGRhdGFbYnAuZ2V0SWQoKV1cclxuICAgICAgaWYgKGJwRGF0YSAhPSBudWxsKSB7XHJcbiAgICAgICAgLy8gVGhlIGJyZWFrcG9pbnQncyBjYWxpYnJhdGVkIGxvY2F0aW9uIGNhbiBiZSBkaWZmZXJlbnQgZnJvbSBpdHNcclxuICAgICAgICAvLyBpbml0aWFsIGxvY2F0aW9uLiBTaW5jZSB3ZSBkb24ndCBkaXNwbGF5IHJhbmdlcyBpbiB0aGUgVVgsIGEgYnBcclxuICAgICAgICAvLyBoYXMgb25seSBvbmUgbGluZSBsb2NhdGlvbi4gV2UgcHJlZmVyIHRoZSBlbmRMaW5lIGlmIHRoZSBicCBpbnN0cnVjdGlvblxyXG4gICAgICAgIC8vIG1hdGNoZXMgYSByYW5nZSBvZiBsaW5lcy4gT3RoZXJ3aXNlIGZhbGwgYmFjayB0byB0aGUgKHN0YXJ0KSBsaW5lLlxyXG4gICAgICAgIGJwLmxpbmUgPSBicERhdGEuZW5kTGluZSAhPSBudWxsID8gYnBEYXRhLmVuZExpbmUgOiBicERhdGEubGluZSAhPSBudWxsID8gYnBEYXRhLmxpbmUgOiBicC5saW5lXHJcbiAgICAgICAgYnAuY29sdW1uID0gYnBEYXRhLmNvbHVtbiAhPSBudWxsID8gYnBEYXRhLmNvbHVtbiA6IGJwLmNvbHVtblxyXG4gICAgICAgIGJwLnZlcmlmaWVkID0gYnBEYXRhLnZlcmlmaWVkICE9IG51bGwgPyBicERhdGEudmVyaWZpZWQgOiBicC52ZXJpZmllZFxyXG4gICAgICAgIGJwLmlkRnJvbUFkYXB0ZXIgPSBicERhdGEuaWRcclxuICAgICAgICBicC5hZGFwdGVyRGF0YSA9IGJwRGF0YS5zb3VyY2UgPyBicERhdGEuc291cmNlLmFkYXB0ZXJEYXRhIDogYnAuYWRhcHRlckRhdGFcclxuICAgICAgICBicC5oaXRDb3VudCA9IGJwRGF0YS5udWNsaWRlX2hpdENvdW50XHJcbiAgICAgIH1cclxuICAgIH0pXHJcbiAgICB0aGlzLl9zb3J0U3luY0FuZERlRHVwKClcclxuICB9XHJcblxyXG4gIF9zb3J0U3luY0FuZERlRHVwKG9wdGlvbnM/OiBTeW5jT3B0aW9ucyk6IHZvaWQge1xyXG4gICAgY29uc3QgY29tcGFyZXIgPSAoZmlyc3QsIHNlY29uZCkgPT4ge1xyXG4gICAgICBpZiAoZmlyc3QudXJpICE9PSBzZWNvbmQudXJpKSB7XHJcbiAgICAgICAgcmV0dXJuIGZpcnN0LnVyaS5sb2NhbGVDb21wYXJlKHNlY29uZC51cmkpXHJcbiAgICAgIH1cclxuICAgICAgaWYgKGZpcnN0LmxpbmUgPT09IHNlY29uZC5saW5lKSB7XHJcbiAgICAgICAgcmV0dXJuIGZpcnN0LmNvbHVtbiAtIHNlY29uZC5jb2x1bW5cclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIGZpcnN0LmxpbmUgLSBzZWNvbmQubGluZVxyXG4gICAgfVxyXG5cclxuICAgIHRoaXMuX3VpQnJlYWtwb2ludHMgPSBkaXN0aW5jdCh0aGlzLl91aUJyZWFrcG9pbnRzLnNvcnQoY29tcGFyZXIpLCAoYnApID0+IGAke2JwLnVyaX06JHticC5saW5lfToke2JwLmNvbHVtbn1gKVxyXG5cclxuICAgIC8vIFN5bmMgd2l0aCBhbGwgYWN0aXZlIHByb2Nlc3Nlcy5cclxuICAgIGNvbnN0IGJwSWRzID0gbmV3IFNldCgpXHJcbiAgICBmb3IgKGNvbnN0IGJwIG9mIHRoaXMuX3VpQnJlYWtwb2ludHMpIHtcclxuICAgICAgYnBJZHMuYWRkKGJwLmlkKVxyXG4gICAgfVxyXG5cclxuICAgIGZvciAoY29uc3QgcHJvY2VzcyBvZiB0aGlzLl9wcm9jZXNzZXMpIHtcclxuICAgICAgLy8gUmVtb3ZlIGFueSBicmVha3BvaW50cyBmcm9tIHRoZSBwcm9jZXNzIHRoYXQgbm8gbG9uZ2VyIGV4aXN0IGluIHRoZSBVSS5cclxuICAgICAgcHJvY2Vzcy5icmVha3BvaW50cyA9IHByb2Nlc3MuYnJlYWtwb2ludHMuZmlsdGVyKChicCkgPT4gYnBJZHMuaGFzKGJwLmdldElkKCkpKVxyXG5cclxuICAgICAgLy8gU3luYyBhbnkgdG8gdGhlIHByb2Nlc3MgdGhhdCBhcmUgbWlzc2luZy5cclxuICAgICAgY29uc3QgcHJvY2Vzc0JwcyA9IG5ldyBNYXAoKVxyXG4gICAgICBmb3IgKGNvbnN0IHByb2Nlc3NCcmVha3BvaW50IG9mIHByb2Nlc3MuYnJlYWtwb2ludHMpIHtcclxuICAgICAgICBwcm9jZXNzQnBzLnNldChwcm9jZXNzQnJlYWtwb2ludC5nZXRJZCgpLCBwcm9jZXNzQnJlYWtwb2ludClcclxuICAgICAgfVxyXG5cclxuICAgICAgZm9yIChjb25zdCB1aUJwIG9mIHRoaXMuX3VpQnJlYWtwb2ludHMpIHtcclxuICAgICAgICBjb25zdCBwcm9jZXNzQnAgPSBwcm9jZXNzQnBzLmdldCh1aUJwLmlkKVxyXG4gICAgICAgIGlmIChwcm9jZXNzQnAgPT0gbnVsbCkge1xyXG4gICAgICAgICAgcHJvY2Vzcy5icmVha3BvaW50cy5wdXNoKFxyXG4gICAgICAgICAgICBuZXcgQnJlYWtwb2ludCh1aUJwLmlkLCB1aUJwLnVyaSwgdWlCcC5saW5lLCB1aUJwLmNvbHVtbiwgdWlCcC5lbmFibGVkLCB1aUJwLmNvbmRpdGlvbiwgdWlCcC5sb2dNZXNzYWdlKVxyXG4gICAgICAgICAgKVxyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICBwcm9jZXNzQnAuZW5hYmxlZCA9IHVpQnAuZW5hYmxlZFxyXG4gICAgICAgICAgcHJvY2Vzc0JwLmNvbmRpdGlvbiA9IHVpQnAuY29uZGl0aW9uXHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcblxyXG4gICAgICAvLyBTb3J0LlxyXG4gICAgICBwcm9jZXNzLmJyZWFrcG9pbnRzID0gcHJvY2Vzcy5icmVha3BvaW50cy5zb3J0KGNvbXBhcmVyKVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChvcHRpb25zID09IG51bGwgfHwgb3B0aW9ucy5maXJlRXZlbnQpIHtcclxuICAgICAgdGhpcy5fZW1pdHRlci5lbWl0KEJSRUFLUE9JTlRTX0NIQU5HRUQpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBzZXRFbmFibGVtZW50KGVsZW1lbnQ6IElFbmFibGVhYmxlLCBlbmFibGU6IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgIGVsZW1lbnQuZW5hYmxlZCA9IGVuYWJsZVxyXG4gICAgY29uc3QgdWlCcCA9IHRoaXMuX3VpQnJlYWtwb2ludHMuZmluZCgoYnApID0+IGJwLmlkID09PSBlbGVtZW50LmdldElkKCkpXHJcbiAgICBpZiAodWlCcCAhPSBudWxsKSB7XHJcbiAgICAgIHVpQnAuZW5hYmxlZCA9IGVuYWJsZVxyXG4gICAgfVxyXG4gICAgdGhpcy5fc29ydFN5bmNBbmREZUR1cCgpXHJcbiAgfVxyXG5cclxuICBlbmFibGVPckRpc2FibGVBbGxCcmVha3BvaW50cyhlbmFibGU6IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgIHRoaXMuX3VpQnJlYWtwb2ludHMuZm9yRWFjaCgoYnApID0+IHtcclxuICAgICAgYnAuZW5hYmxlZCA9IGVuYWJsZVxyXG4gICAgfSlcclxuICAgIHRoaXMuX2Z1bmN0aW9uQnJlYWtwb2ludHMuZm9yRWFjaCgoZmJwKSA9PiB7XHJcbiAgICAgIGZicC5lbmFibGVkID0gZW5hYmxlXHJcbiAgICB9KVxyXG5cclxuICAgIHRoaXMuX3NvcnRTeW5jQW5kRGVEdXAoKVxyXG4gIH1cclxuXHJcbiAgYWRkRnVuY3Rpb25CcmVha3BvaW50KGZ1bmN0aW9uTmFtZTogc3RyaW5nKTogRnVuY3Rpb25CcmVha3BvaW50IHtcclxuICAgIGNvbnN0IG5ld0Z1bmN0aW9uQnJlYWtwb2ludCA9IG5ldyBGdW5jdGlvbkJyZWFrcG9pbnQoZnVuY3Rpb25OYW1lLCB0cnVlLCBudWxsKVxyXG4gICAgdGhpcy5fZnVuY3Rpb25CcmVha3BvaW50cy5wdXNoKG5ld0Z1bmN0aW9uQnJlYWtwb2ludClcclxuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChCUkVBS1BPSU5UU19DSEFOR0VEKVxyXG4gICAgcmV0dXJuIG5ld0Z1bmN0aW9uQnJlYWtwb2ludFxyXG4gIH1cclxuXHJcbiAgdXBkYXRlRnVuY3Rpb25CcmVha3BvaW50cyhkYXRhOiB7XHJcbiAgICBbaWQ6IHN0cmluZ106IHtcclxuICAgICAgbmFtZT86IHN0cmluZyxcclxuICAgICAgdmVyaWZpZWQ/OiBib29sZWFuLFxyXG4gICAgICBpZD86IG51bWJlcixcclxuICAgICAgaGl0Q29uZGl0aW9uPzogc3RyaW5nLFxyXG4gICAgfSxcclxuICB9KTogdm9pZCB7XHJcbiAgICB0aGlzLl9mdW5jdGlvbkJyZWFrcG9pbnRzLmZvckVhY2goKGZicCkgPT4ge1xyXG4gICAgICBjb25zdCBmYnBEYXRhID0gZGF0YVtmYnAuZ2V0SWQoKV1cclxuICAgICAgaWYgKGZicERhdGEgIT0gbnVsbCkge1xyXG4gICAgICAgIGZicC5uYW1lID0gZmJwRGF0YS5uYW1lICE9IG51bGwgPyBmYnBEYXRhLm5hbWUgOiBmYnAubmFtZVxyXG4gICAgICAgIGZicC52ZXJpZmllZCA9IGZicERhdGEudmVyaWZpZWQgfHwgZmJwLnZlcmlmaWVkXHJcbiAgICAgICAgZmJwLmlkRnJvbUFkYXB0ZXIgPSBmYnBEYXRhLmlkXHJcbiAgICAgICAgZmJwLmhpdENvbmRpdGlvbiA9IGZicERhdGEuaGl0Q29uZGl0aW9uXHJcbiAgICAgIH1cclxuICAgIH0pXHJcblxyXG4gICAgdGhpcy5fZW1pdHRlci5lbWl0KEJSRUFLUE9JTlRTX0NIQU5HRUQpXHJcbiAgfVxyXG5cclxuICByZW1vdmVGdW5jdGlvbkJyZWFrcG9pbnRzKGlkPzogc3RyaW5nKTogdm9pZCB7XHJcbiAgICBsZXQgcmVtb3ZlZDogRnVuY3Rpb25CcmVha3BvaW50W11cclxuICAgIGlmIChpZCAhPSBudWxsKSB7XHJcbiAgICAgIHJlbW92ZWQgPSB0aGlzLl9mdW5jdGlvbkJyZWFrcG9pbnRzLmZpbHRlcigoZmJwKSA9PiBmYnAuZ2V0SWQoKSA9PT0gaWQpXHJcbiAgICAgIHRoaXMuX2Z1bmN0aW9uQnJlYWtwb2ludHMgPSB0aGlzLl9mdW5jdGlvbkJyZWFrcG9pbnRzLmZpbHRlcigoZmJwKSA9PiBmYnAuZ2V0SWQoKSAhPT0gaWQpXHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByZW1vdmVkID0gdGhpcy5fZnVuY3Rpb25CcmVha3BvaW50c1xyXG4gICAgICB0aGlzLl9mdW5jdGlvbkJyZWFrcG9pbnRzID0gW11cclxuICAgIH1cclxuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChCUkVBS1BPSU5UU19DSEFOR0VELCB7IHJlbW92ZWQgfSlcclxuICB9XHJcblxyXG4gIGdldFdhdGNoRXhwcmVzc2lvbnMoKTogSUV2YWx1YXRhYmxlRXhwcmVzc2lvbltdIHtcclxuICAgIHJldHVybiAodGhpcy5fd2F0Y2hFeHByZXNzaW9uczogYW55KVxyXG4gIH1cclxuXHJcbiAgYWRkV2F0Y2hFeHByZXNzaW9uKG5hbWU6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgY29uc3Qgd2UgPSBuZXcgRXhwcmVzc2lvbihuYW1lKVxyXG4gICAgdGhpcy5fd2F0Y2hFeHByZXNzaW9ucy5wdXNoKHdlKVxyXG4gICAgdGhpcy5fZW1pdHRlci5lbWl0KFdBVENIX0VYUFJFU1NJT05TX0NIQU5HRUQsIHdlKVxyXG4gIH1cclxuXHJcbiAgcmVuYW1lV2F0Y2hFeHByZXNzaW9uKGlkOiBzdHJpbmcsIG5ld05hbWU6IHN0cmluZyk6IHZvaWQge1xyXG4gICAgY29uc3QgZmlsdGVyZWQgPSB0aGlzLl93YXRjaEV4cHJlc3Npb25zLmZpbHRlcigod2UpID0+IHdlLmdldElkKCkgPT09IGlkKVxyXG4gICAgaWYgKGZpbHRlcmVkLmxlbmd0aCA9PT0gMSkge1xyXG4gICAgICBmaWx0ZXJlZFswXS5uYW1lID0gbmV3TmFtZVxyXG4gICAgICB0aGlzLl9lbWl0dGVyLmVtaXQoV0FUQ0hfRVhQUkVTU0lPTlNfQ0hBTkdFRCwgZmlsdGVyZWRbMF0pXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZW1vdmVXYXRjaEV4cHJlc3Npb25zKGlkOiA/c3RyaW5nKTogdm9pZCB7XHJcbiAgICB0aGlzLl93YXRjaEV4cHJlc3Npb25zID0gaWQgIT0gbnVsbCA/IHRoaXMuX3dhdGNoRXhwcmVzc2lvbnMuZmlsdGVyKCh3ZSkgPT4gd2UuZ2V0SWQoKSAhPT0gaWQpIDogW11cclxuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChXQVRDSF9FWFBSRVNTSU9OU19DSEFOR0VEKVxyXG4gIH1cclxuXHJcbiAgc291cmNlSXNOb3RBdmFpbGFibGUodXJpOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgIHRoaXMuX3Byb2Nlc3Nlcy5mb3JFYWNoKChwKSA9PiB7XHJcbiAgICAgIGlmIChwLnNvdXJjZXMuaGFzKHVyaSkpIHtcclxuICAgICAgICBudWxsdGhyb3dzKHAuc291cmNlcy5nZXQodXJpKSkuYXZhaWxhYmxlID0gZmFsc2VcclxuICAgICAgfVxyXG4gICAgfSlcclxuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChDQUxMU1RBQ0tfQ0hBTkdFRClcclxuICB9XHJcblxyXG4gIGRpc3Bvc2UoKTogdm9pZCB7XHJcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKClcclxuICB9XHJcbn1cclxuIl19