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

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyTW9kZWwuanMiXSwibmFtZXMiOlsiU291cmNlIiwiY29uc3RydWN0b3IiLCJyYXciLCJzZXNzaW9uSWQiLCJ1cmkiLCJhdmFpbGFibGUiLCJfcmF3IiwibmFtZSIsIlVOS05PV05fU09VUkNFIiwic291cmNlUmVmZXJlbmNlIiwicGF0aCIsIm51Y2xpZGVVcmkiLCJwYXJzZVBhdGgiLCJiYXNlIiwiREVCVUdfU09VUkNFU19VUkkiLCJvcmlnaW4iLCJwcmVzZW50YXRpb25IaW50IiwicmVmZXJlbmNlIiwiaW5NZW1vcnkiLCJzdGFydHNXaXRoIiwib3BlbkluRWRpdG9yIiwiYXRvbSIsIndvcmtzcGFjZSIsIm9wZW4iLCJzZWFyY2hBbGxQYW5lcyIsInBlbmRpbmciLCJFeHByZXNzaW9uQ29udGFpbmVyIiwicHJvY2VzcyIsImlkIiwibmFtZWRWYXJpYWJsZXMiLCJpbmRleGVkVmFyaWFibGVzIiwic3RhcnRPZlZhcmlhYmxlcyIsIl92YWx1ZSIsIl9jaGlsZHJlbiIsIl9yZWZlcmVuY2UiLCJfaWQiLCJfbmFtZWRWYXJpYWJsZXMiLCJfaW5kZXhlZFZhcmlhYmxlcyIsIl9zdGFydE9mVmFyaWFibGVzIiwidmFsdWUiLCJoYXNDaGlsZFZhcmlhYmxlcyIsImdldENoaWxkcmVuIiwiX2RvR2V0Q2hpbGRyZW4iLCJoYXNDaGlsZHJlbiIsImdldENoaWxkcmVuSW5DaHVua3MiLCJ2YXJpYWJsZXMiLCJfZmV0Y2hWYXJpYWJsZXMiLCJjaGlsZHJlbkFycmF5IiwiQm9vbGVhbiIsInVuZGVmaW5lZCIsImNodW5rU2l6ZSIsIkJBU0VfQ0hVTktfU0laRSIsIm51bWJlck9mQ2h1bmtzIiwiTWF0aCIsImNlaWwiLCJpIiwic3RhcnQiLCJjb3VudCIsIm1pbiIsInB1c2giLCJWYXJpYWJsZSIsImtpbmQiLCJjb25jYXQiLCJnZXRJZCIsImdldFZhbHVlIiwiZmlsdGVyIiwicmVzcG9uc2UiLCJzZXNzaW9uIiwidmFyaWFibGVzUmVmZXJlbmNlIiwiYm9keSIsInYiLCJtYXAiLCJldmFsdWF0ZU5hbWUiLCJ0eXBlIiwiZSIsIm1lc3NhZ2UiLCJzZXRWYWx1ZSIsImFsbFZhbHVlcyIsInNldCIsInRvU3RyaW5nIiwiTWFwIiwiRXhwcmVzc2lvbiIsInV1aWQiLCJ2NCIsIl90eXBlIiwiREVGQVVMVF9WQUxVRSIsImV2YWx1YXRlIiwic3RhY2tGcmFtZSIsImNvbnRleHQiLCJleHByZXNzaW9uIiwiZnJhbWVJZCIsInJlc3VsdCIsImVyciIsInBhcmVudCIsImdyYW1tYXJOYW1lIiwiY29uZmlndXJhdGlvbiIsInNldFZhcmlhYmxlIiwiQW5hbHl0aWNzRXZlbnRzIiwiREVCVUdHRVJfRURJVF9WQVJJQUJMRSIsImxhbmd1YWdlIiwiYWRhcHRlclR5cGUiLCJjYW5TZXRWYXJpYWJsZSIsInByb2MiLCJzdXBwb3J0c1NldFZhcmlhYmxlIiwiY2FwYWJpbGl0aWVzIiwiaXNSZWFkT25seVRhcmdldCIsImlzUmVhZE9ubHkiLCJoYXNWYWxpZFBhcmVudFJlZmVyZW5jZSIsIk51bWJlciIsImlzTmFOIiwiU2NvcGUiLCJpbmRleCIsImV4cGVuc2l2ZSIsInJhbmdlIiwidGhyZWFkIiwiU3RhY2tGcmFtZSIsInNvdXJjZSIsInNjb3BlcyIsImdldFNjb3BlcyIsImZvcmNlUmVmcmVzaCIsIl9nZXRTY29wZXNJbXBsIiwicnMiLCJsaW5lIiwiUmFuZ2UiLCJjb2x1bW4iLCJlbmRMaW5lIiwiZW5kQ29sdW1uIiwiZ2V0TW9zdFNwZWNpZmljU2NvcGVzIiwicyIsImhhdmVSYW5nZUluZm8iLCJzb21lIiwic2NvcGVzQ29udGFpbmluZ1JhbmdlIiwic2NvcGUiLCJjb250YWluc1JhbmdlIiwic29ydCIsImZpcnN0Iiwic2Vjb25kIiwiZmlyc3RSYW5nZSIsInNlY29uZFJhbmdlIiwiZW5kIiwicm93IiwibGVuZ3RoIiwicmVzdGFydCIsInJlc3RhcnRGcmFtZSIsInRocmVhZElkIiwicmF3UGF0aCIsImxvY2FsUmF3UGF0aCIsImdldFBhdGgiLCJleGlzdHMiLCJUaHJlYWQiLCJfY2FsbFN0YWNrIiwiX3JlZnJlc2hJblByb2dyZXNzIiwic3RvcHBlZERldGFpbHMiLCJzdG9wcGVkIiwiX2dldEVtcHR5Q2FsbHN0YWNrU3RhdGUiLCJ2YWxpZCIsImNhbGxGcmFtZXMiLCJfaXNDYWxsc3RhY2tMb2FkZWQiLCJfaXNDYWxsc3RhY2tGdWxseUxvYWRlZCIsInRvdGFsRnJhbWVzIiwiYWRkaXRpb25hbEZyYW1lc0F2YWlsYWJsZSIsImN1cnJlbnRGcmFtZUNvdW50Iiwic3VwcG9ydHNEZWxheUxvYWRpbmciLCJzdXBwb3J0c0RlbGF5ZWRTdGFja1RyYWNlTG9hZGluZyIsImNsZWFyQ2FsbFN0YWNrIiwiZ2V0Q2FsbFN0YWNrVG9wRnJhbWUiLCJnZXRGdWxsQ2FsbFN0YWNrIiwibGV2ZWxzIiwiT2JzZXJ2YWJsZSIsIm9mIiwiRXhwZWN0IiwiZnJvbVByb21pc2UiLCJyZWZyZXNoQ2FsbFN0YWNrIiwic3dpdGNoTWFwIiwiZ2V0Q2FjaGVkQ2FsbFN0YWNrIiwiY2FsbFN0YWNrIiwiX2dldENhbGxTdGFja0ltcGwiLCJzcGxpY2UiLCJzdGFydEZyYW1lIiwic3RhY2tUcmFjZUFyZ3MiLCJzdGFja1RyYWNlIiwic3RhY2tGcmFtZXMiLCJyc2YiLCJnZXRTb3VyY2UiLCJmcmFtZXNFcnJvck1lc3NhZ2UiLCJleGNlcHRpb25JbmZvIiwicmVhc29uIiwic3VwcG9ydHNFeGNlcHRpb25JbmZvUmVxdWVzdCIsImRldGFpbHMiLCJkZXNjcmlwdGlvbiIsImJyZWFrTW9kZSIsImV4Y2VwdGlvbiIsImV4Y2VwdGlvbklkIiwibmV4dCIsIkRFQlVHR0VSX1NURVBfT1ZFUiIsInN0ZXBJbiIsIkRFQlVHR0VSX1NURVBfSU5UTyIsInN0ZXBPdXQiLCJERUJVR0dFUl9TVEVQX09VVCIsInN0ZXBCYWNrIiwiREVCVUdHRVJfU1RFUF9CQUNLIiwiY29udGludWUiLCJERUJVR0dFUl9TVEVQX0NPTlRJTlVFIiwicGF1c2UiLCJERUJVR0dFUl9TVEVQX1BBVVNFIiwicmV2ZXJzZUNvbnRpbnVlIiwiUHJvY2VzcyIsIl9zb3VyY2VzIiwiX3RocmVhZHMiLCJfc2Vzc2lvbiIsIl9jb25maWd1cmF0aW9uIiwiX3BlbmRpbmdTdGFydCIsIl9wZW5kaW5nU3RvcCIsImJyZWFrcG9pbnRzIiwiZXhjZXB0aW9uQnJlYWtwb2ludHMiLCJzb3VyY2VzIiwiZGVidWdnZXJNb2RlIiwiRGVidWdnZXJNb2RlIiwiU1RBUlRJTkciLCJTVE9QUElORyIsImdldEFsbFRocmVhZHMiLCJ0IiwiUEFVU0VEIiwiUlVOTklORyIsImNsZWFyUHJvY2Vzc1N0YXJ0aW5nRmxhZyIsInNldFN0b3BQZW5kaW5nIiwiaGFzIiwiZ2V0IiwiZ2V0VGhyZWFkIiwiQXJyYXkiLCJmcm9tIiwidmFsdWVzIiwicmF3U3RvcHBlZFVwZGF0ZSIsImRhdGEiLCJhbGxUaHJlYWRzU3RvcHBlZCIsImZvckVhY2giLCJyYXdUaHJlYWRVcGRhdGUiLCJjbGVhclRocmVhZHMiLCJyZW1vdmVUaHJlYWRzIiwiZGVsZXRlIiwiY2xlYXIiLCJjb21wbGV0aW9ucyIsInRleHQiLCJwb3NpdGlvbiIsIm92ZXJ3cml0ZUJlZm9yZSIsInN1cHBvcnRzQ29tcGxldGlvbnNSZXF1ZXN0IiwidGFyZ2V0cyIsImVycm9yIiwiQnJlYWtwb2ludCIsInVpQnJlYWtwb2ludElkIiwiZW5hYmxlZCIsImNvbmRpdGlvbiIsImxvZ01lc3NhZ2UiLCJhZGFwdGVyRGF0YSIsInZlcmlmaWVkIiwiaWRGcm9tQWRhcHRlciIsIm9yaWdpbmFsTGluZSIsImhpdENvdW50IiwidHJpbSIsIkZ1bmN0aW9uQnJlYWtwb2ludCIsImhpdENvbmRpdGlvbiIsIkV4Y2VwdGlvbkJyZWFrcG9pbnQiLCJsYWJlbCIsIkJSRUFLUE9JTlRTX0NIQU5HRUQiLCJXQVRDSF9FWFBSRVNTSU9OU19DSEFOR0VEIiwiQ0FMTFNUQUNLX0NIQU5HRUQiLCJQUk9DRVNTRVNfQ0hBTkdFRCIsIk1vZGVsIiwidWlCcmVha3BvaW50cyIsImJyZWFrcG9pbnRzQWN0aXZhdGVkIiwiZnVuY3Rpb25CcmVha3BvaW50cyIsIndhdGNoRXhwcmVzc2lvbnMiLCJnZXRGb2N1c2VkUHJvY2VzcyIsIl9wcm9jZXNzZXMiLCJfdWlCcmVha3BvaW50cyIsIl9icmVha3BvaW50c0FjdGl2YXRlZCIsIl9mdW5jdGlvbkJyZWFrcG9pbnRzIiwiX3dhdGNoRXhwcmVzc2lvbnMiLCJfZGlzcG9zYWJsZXMiLCJfZW1pdHRlciIsIl9nZXRGb2N1c2VkUHJvY2VzcyIsIl9tb3N0UmVjZW50RXhjZXB0aW9uQnJlYWtwb2ludHMiLCJFbWl0dGVyIiwiVW5pdmVyc2FsRGlzcG9zYWJsZSIsImdldFByb2Nlc3NlcyIsImFkZFByb2Nlc3MiLCJwcm9jZXNzQnJlYWtwb2ludHMiLCJ1aUJwIiwiZW1pdCIsInJlbW92ZVByb2Nlc3MiLCJyZW1vdmVkUHJvY2Vzc2VzIiwicCIsIm9uRGlkQ2hhbmdlQnJlYWtwb2ludHMiLCJjYWxsYmFjayIsIm9uIiwib25EaWRDaGFuZ2VDYWxsU3RhY2siLCJvbkRpZENoYW5nZVByb2Nlc3NlcyIsIm9uRGlkQ2hhbmdlV2F0Y2hFeHByZXNzaW9ucyIsInJhd1VwZGF0ZSIsInBvcCIsInRocmVhZEkiLCJmZXRjaEFsbEZyYW1lcyIsImZyYW1lc1RvTG9hZCIsImdldFVJQnJlYWtwb2ludHMiLCJnZXRCcmVha3BvaW50cyIsImZvY3VzZWRQcm9jZXNzIiwiY3VycmVudFByb2Nlc3MiLCJmaW5kIiwiYnAiLCJnZXRCcmVha3BvaW50QXRMaW5lIiwiYnJlYWtwb2ludCIsImdldEJyZWFrcG9pbnRCeUlkIiwiZ2V0RnVuY3Rpb25CcmVha3BvaW50cyIsImdldEV4Y2VwdGlvbkJyZWFrcG9pbnRzIiwic2V0RXhjZXB0aW9uQnJlYWtwb2ludHMiLCJkIiwiZWJwIiwiZGVmYXVsdCIsImFyZUJyZWFrcG9pbnRzQWN0aXZhdGVkIiwic2V0QnJlYWtwb2ludHNBY3RpdmF0ZWQiLCJhY3RpdmF0ZWQiLCJhZGRVSUJyZWFrcG9pbnRzIiwiZmlyZUV2ZW50IiwiX3NvcnRTeW5jQW5kRGVEdXAiLCJyZW1vdmVCcmVha3BvaW50cyIsInRvUmVtb3ZlIiwiciIsInVwZGF0ZUJyZWFrcG9pbnRzIiwibmV3QnBzIiwibiIsInVwZGF0ZVByb2Nlc3NCcmVha3BvaW50cyIsImJwRGF0YSIsIm51Y2xpZGVfaGl0Q291bnQiLCJvcHRpb25zIiwiY29tcGFyZXIiLCJsb2NhbGVDb21wYXJlIiwiYnBJZHMiLCJTZXQiLCJhZGQiLCJwcm9jZXNzQnBzIiwicHJvY2Vzc0JyZWFrcG9pbnQiLCJwcm9jZXNzQnAiLCJzZXRFbmFibGVtZW50IiwiZWxlbWVudCIsImVuYWJsZSIsImVuYWJsZU9yRGlzYWJsZUFsbEJyZWFrcG9pbnRzIiwiZmJwIiwiYWRkRnVuY3Rpb25CcmVha3BvaW50IiwiZnVuY3Rpb25OYW1lIiwibmV3RnVuY3Rpb25CcmVha3BvaW50IiwidXBkYXRlRnVuY3Rpb25CcmVha3BvaW50cyIsImZicERhdGEiLCJyZW1vdmVGdW5jdGlvbkJyZWFrcG9pbnRzIiwicmVtb3ZlZCIsImdldFdhdGNoRXhwcmVzc2lvbnMiLCJhZGRXYXRjaEV4cHJlc3Npb24iLCJ3ZSIsInJlbmFtZVdhdGNoRXhwcmVzc2lvbiIsIm5ld05hbWUiLCJmaWx0ZXJlZCIsInJlbW92ZVdhdGNoRXhwcmVzc2lvbnMiLCJzb3VyY2VJc05vdEF2YWlsYWJsZSIsImRpc3Bvc2UiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUF3REE7O0FBQ0E7O0FBQ0E7O0FBR0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBdkVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBOENPLE1BQU1BLE1BQU4sQ0FBZ0M7QUFLckNDLEVBQUFBLFdBQVcsQ0FBQ0MsR0FBRCxFQUE2QkMsU0FBN0IsRUFBZ0Q7QUFBQSxTQUox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c291cmNlc0NvbnRlbnQiOlsiLyoqXG5UaGUgZm9sbG93aW5nIGRlYnVnIG1vZGVsIGltcGxlbWVudGF0aW9uIHdhcyBwb3J0ZWQgZnJvbSBWU0NvZGUncyBkZWJ1Z2dlciBpbXBsZW1lbnRhdGlvblxuaW4gaHR0cHM6Ly9naXRodWIuY29tL01pY3Jvc29mdC92c2NvZGUvdHJlZS9tYXN0ZXIvc3JjL3ZzL3dvcmtiZW5jaC9wYXJ0cy9kZWJ1Z1xuXG5NSVQgTGljZW5zZVxuXG5Db3B5cmlnaHQgKGMpIDIwMTUgLSBwcmVzZW50IE1pY3Jvc29mdCBDb3Jwb3JhdGlvblxuXG5BbGwgcmlnaHRzIHJlc2VydmVkLlxuXG5QZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG5vZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG5pbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG50byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG5jb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbmZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG5cblRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluIGFsbFxuY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cblxuVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG5GSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbkFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbkxJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG5PVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuU09GVFdBUkUuXG4qL1xuXG5pbXBvcnQgdHlwZSB7XG4gIElFeHByZXNzaW9uLFxuICBJRXhwcmVzc2lvbkNvbnRhaW5lcixcbiAgSUV2YWx1YXRhYmxlRXhwcmVzc2lvbixcbiAgSVN0YWNrRnJhbWUsXG4gIElCcmVha3BvaW50LFxuICBJUmF3TW9kZWxVcGRhdGUsXG4gIElSYXdTdG9wcHBlZFVwZGF0ZSxcbiAgSVJhd1RocmVhZFVwZGF0ZSxcbiAgSVNlc3Npb24sXG4gIElUaHJlYWQsXG4gIElNb2RlbCxcbiAgSVNjb3BlLFxuICBJU291cmNlLFxuICBJUHJvY2VzcyxcbiAgSVJhd1N0b3BwZWREZXRhaWxzLFxuICBJRW5hYmxlYWJsZSxcbiAgSVVJQnJlYWtwb2ludCxcbiAgSUV4Y2VwdGlvbkluZm8sXG4gIElFeGNlcHRpb25CcmVha3BvaW50LFxuICBJRnVuY3Rpb25CcmVha3BvaW50LFxuICBJVHJlZUVsZW1lbnQsXG4gIElWYXJpYWJsZSxcbiAgU291cmNlUHJlc2VudGF0aW9uSGludCxcbiAgRGVidWdnZXJNb2RlVHlwZSxcbn0gZnJvbSBcIi4uL3R5cGVzXCJcbmltcG9ydCB0eXBlIHsgSVByb2Nlc3NDb25maWcgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWRlYnVnZ2VyLWNvbW1vblwiXG5pbXBvcnQgbnVjbGlkZVVyaSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvbnVjbGlkZVVyaVwiXG5pbXBvcnQgeyBnZXRWU0NvZGVEZWJ1Z2dlckFkYXB0ZXJTZXJ2aWNlQnlOdWNsaWRlVXJpIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1kZWJ1Z2dlci1jb21tb25cIlxuaW1wb3J0ICogYXMgRGVidWdQcm90b2NvbCBmcm9tIFwidnNjb2RlLWRlYnVncHJvdG9jb2xcIlxuaW1wb3J0IHR5cGUgeyBFeHBlY3RlZCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9leHBlY3RlZFwiXG5cbmltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tIFwicnhqcy1jb21wYXQvYnVuZGxlcy9yeGpzLWNvbXBhdC51bWQubWluLmpzXCJcbmltcG9ydCB1dWlkIGZyb20gXCJ1dWlkXCJcbmltcG9ydCBudWxsdGhyb3dzIGZyb20gXCJudWxsdGhyb3dzXCJcbmltcG9ydCBpbnZhcmlhbnQgZnJvbSBcImFzc2VydFwiXG5pbXBvcnQgeyBFbWl0dGVyLCBSYW5nZSB9IGZyb20gXCJhdG9tXCJcbmltcG9ydCBVbml2ZXJzYWxEaXNwb3NhYmxlIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9Vbml2ZXJzYWxEaXNwb3NhYmxlXCJcbmltcG9ydCB7IHRyYWNrIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL2FuYWx5dGljc1wiXG5pbXBvcnQgeyBBbmFseXRpY3NFdmVudHMsIFVOS05PV05fU09VUkNFLCBERUJVR19TT1VSQ0VTX1VSSSwgRGVidWdnZXJNb2RlIH0gZnJvbSBcIi4uL2NvbnN0YW50c1wiXG5pbXBvcnQgeyBvcGVuU291cmNlTG9jYXRpb24gfSBmcm9tIFwiLi4vdXRpbHNcIlxuaW1wb3J0IHsgZGlzdGluY3QgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvY29sbGVjdGlvblwiXG5pbXBvcnQgeyBFeHBlY3QgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvZXhwZWN0ZWRcIlxuXG5leHBvcnQgY2xhc3MgU291cmNlIGltcGxlbWVudHMgSVNvdXJjZSB7XG4gICt1cmk6IHN0cmluZ1xuICBhdmFpbGFibGU6IGJvb2xlYW5cbiAgX3JhdzogRGVidWdQcm90b2NvbC5Tb3VyY2VcblxuICBjb25zdHJ1Y3RvcihyYXc6ID9EZWJ1Z1Byb3RvY29sLlNvdXJjZSwgc2Vzc2lvbklkOiBzdHJpbmcpIHtcbiAgICBpZiAocmF3ID09IG51bGwpIHtcbiAgICAgIHRoaXMuX3JhdyA9IHsgbmFtZTogVU5LTk9XTl9TT1VSQ0UgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLl9yYXcgPSByYXdcbiAgICB9XG4gICAgaWYgKHRoaXMuX3Jhdy5zb3VyY2VSZWZlcmVuY2UgIT0gbnVsbCAmJiB0aGlzLl9yYXcuc291cmNlUmVmZXJlbmNlID4gMCkge1xuICAgICAgY29uc3QgbmFtZSA9XG4gICAgICAgIHRoaXMuX3Jhdy5uYW1lICE9IG51bGxcbiAgICAgICAgICA/IHRoaXMuX3Jhdy5uYW1lXG4gICAgICAgICAgOiB0aGlzLl9yYXcucGF0aCAhPSBudWxsXG4gICAgICAgICAgPyBudWNsaWRlVXJpLnBhcnNlUGF0aCh0aGlzLl9yYXcucGF0aCkuYmFzZVxuICAgICAgICAgIDogVU5LTk9XTl9TT1VSQ0VcbiAgICAgIHRoaXMudXJpID0gYCR7REVCVUdfU09VUkNFU19VUkl9LyR7c2Vzc2lvbklkfS8ke3RoaXMuX3Jhdy5zb3VyY2VSZWZlcmVuY2V9LyR7bmFtZX1gXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMudXJpID0gdGhpcy5fcmF3LnBhdGggfHwgXCJcIlxuICAgIH1cbiAgICB0aGlzLmF2YWlsYWJsZSA9IHRoaXMudXJpICE9PSBcIlwiXG4gIH1cblxuICBnZXQgbmFtZSgpOiA/c3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5fcmF3Lm5hbWVcbiAgfVxuXG4gIGdldCBvcmlnaW4oKTogP3N0cmluZyB7XG4gICAgcmV0dXJuIHRoaXMuX3Jhdy5vcmlnaW5cbiAgfVxuXG4gIGdldCBwcmVzZW50YXRpb25IaW50KCk6ID9Tb3VyY2VQcmVzZW50YXRpb25IaW50IHtcbiAgICByZXR1cm4gdGhpcy5fcmF3LnByZXNlbnRhdGlvbkhpbnRcbiAgfVxuXG4gIGdldCByYXcoKTogRGVidWdQcm90b2NvbC5Tb3VyY2Uge1xuICAgIHJldHVybiB7XG4gICAgICAuLi50aGlzLl9yYXcsXG4gICAgfVxuICB9XG5cbiAgZ2V0IHJlZmVyZW5jZSgpOiA/bnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5fcmF3LnNvdXJjZVJlZmVyZW5jZVxuICB9XG5cbiAgZ2V0IGluTWVtb3J5KCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLnVyaS5zdGFydHNXaXRoKERFQlVHX1NPVVJDRVNfVVJJKVxuICB9XG5cbiAgb3BlbkluRWRpdG9yKCk6IFByb21pc2U8YXRvbSRUZXh0RWRpdG9yPiB7XG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG51Y2xpZGUtaW50ZXJuYWwvYXRvbS1hcGlzXG4gICAgcmV0dXJuIGF0b20ud29ya3NwYWNlLm9wZW4odGhpcy51cmksIHtcbiAgICAgIHNlYXJjaEFsbFBhbmVzOiB0cnVlLFxuICAgICAgcGVuZGluZzogdHJ1ZSxcbiAgICB9KVxuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHByZXNzaW9uQ29udGFpbmVyIGltcGxlbWVudHMgSUV4cHJlc3Npb25Db250YWluZXIge1xuICBzdGF0aWMgYWxsVmFsdWVzOiBNYXA8c3RyaW5nLCBzdHJpbmc+ID0gbmV3IE1hcCgpXG4gIC8vIFVzZSBjaHVua3MgdG8gc3VwcG9ydCB2YXJpYWJsZSBwYWdpbmcgIzk1MzdcbiAgc3RhdGljIEJBU0VfQ0hVTktfU0laRSA9IDEwMFxuXG4gIF92YWx1ZTogc3RyaW5nXG4gIF9jaGlsZHJlbjogP1Byb21pc2U8SVZhcmlhYmxlW10+XG4gIHByb2Nlc3M6ID9JUHJvY2Vzc1xuICBfcmVmZXJlbmNlOiBudW1iZXJcbiAgX2lkOiBzdHJpbmdcbiAgX25hbWVkVmFyaWFibGVzOiBudW1iZXJcbiAgX2luZGV4ZWRWYXJpYWJsZXM6IG51bWJlclxuICBfc3RhcnRPZlZhcmlhYmxlczogbnVtYmVyXG5cbiAgY29uc3RydWN0b3IoXG4gICAgcHJvY2VzczogP0lQcm9jZXNzLFxuICAgIHJlZmVyZW5jZTogbnVtYmVyLFxuICAgIGlkOiBzdHJpbmcsXG4gICAgbmFtZWRWYXJpYWJsZXM6ID9udW1iZXIsXG4gICAgaW5kZXhlZFZhcmlhYmxlczogP251bWJlcixcbiAgICBzdGFydE9mVmFyaWFibGVzOiA/bnVtYmVyXG4gICkge1xuICAgIHRoaXMucHJvY2VzcyA9IHByb2Nlc3NcbiAgICB0aGlzLl9yZWZlcmVuY2UgPSByZWZlcmVuY2VcbiAgICB0aGlzLl9pZCA9IGlkXG4gICAgdGhpcy5fbmFtZWRWYXJpYWJsZXMgPSBuYW1lZFZhcmlhYmxlcyB8fCAwXG4gICAgdGhpcy5faW5kZXhlZFZhcmlhYmxlcyA9IGluZGV4ZWRWYXJpYWJsZXMgfHwgMFxuICAgIHRoaXMuX3N0YXJ0T2ZWYXJpYWJsZXMgPSBzdGFydE9mVmFyaWFibGVzIHx8IDBcbiAgfVxuXG4gIGdldCByZWZlcmVuY2UoKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5fcmVmZXJlbmNlXG4gIH1cblxuICBzZXQgcmVmZXJlbmNlKHZhbHVlOiBudW1iZXIpIHtcbiAgICB0aGlzLl9yZWZlcmVuY2UgPSB2YWx1ZVxuICAgIHRoaXMuX2NoaWxkcmVuID0gbnVsbFxuICB9XG5cbiAgZ2V0IGhhc0NoaWxkVmFyaWFibGVzKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLl9uYW1lZFZhcmlhYmxlcyArIHRoaXMuX2luZGV4ZWRWYXJpYWJsZXMgPiAwXG4gIH1cblxuICBnZXRDaGlsZHJlbigpOiBQcm9taXNlPElWYXJpYWJsZVtdPiB7XG4gICAgaWYgKHRoaXMuX2NoaWxkcmVuID09IG51bGwpIHtcbiAgICAgIHRoaXMuX2NoaWxkcmVuID0gdGhpcy5fZG9HZXRDaGlsZHJlbigpXG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX2NoaWxkcmVuXG4gIH1cblxuICBhc3luYyBfZG9HZXRDaGlsZHJlbigpOiBQcm9taXNlPElWYXJpYWJsZVtdPiB7XG4gICAgaWYgKCF0aGlzLmhhc0NoaWxkcmVuKCkpIHtcbiAgICAgIHJldHVybiBbXVxuICAgIH1cblxuICAgIGlmICghdGhpcy5nZXRDaGlsZHJlbkluQ2h1bmtzKSB7XG4gICAgICBjb25zdCB2YXJpYWJsZXMgPSBhd2FpdCB0aGlzLl9mZXRjaFZhcmlhYmxlcygpXG4gICAgICByZXR1cm4gdmFyaWFibGVzXG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgb2JqZWN0IGhhcyBuYW1lZCB2YXJpYWJsZXMsIGZldGNoIHRoZW0gaW5kZXBlbmRlbnQgZnJvbSBpbmRleGVkIHZhcmlhYmxlcyAjOTY3MFxuICAgIGxldCBjaGlsZHJlbkFycmF5OiBBcnJheTxJVmFyaWFibGU+ID0gW11cbiAgICBpZiAoQm9vbGVhbih0aGlzLl9uYW1lZFZhcmlhYmxlcykpIHtcbiAgICAgIGNoaWxkcmVuQXJyYXkgPSBhd2FpdCB0aGlzLl9mZXRjaFZhcmlhYmxlcyh1bmRlZmluZWQsIHVuZGVmaW5lZCwgXCJuYW1lZFwiKVxuICAgIH1cblxuICAgIC8vIFVzZSBhIGR5bmFtaWMgY2h1bmsgc2l6ZSBiYXNlZCBvbiB0aGUgbnVtYmVyIG9mIGVsZW1lbnRzICM5Nzc0XG4gICAgbGV0IGNodW5rU2l6ZSA9IEV4cHJlc3Npb25Db250YWluZXIuQkFTRV9DSFVOS19TSVpFXG4gICAgd2hpbGUgKHRoaXMuX2luZGV4ZWRWYXJpYWJsZXMgPiBjaHVua1NpemUgKiBFeHByZXNzaW9uQ29udGFpbmVyLkJBU0VfQ0hVTktfU0laRSkge1xuICAgICAgY2h1bmtTaXplICo9IEV4cHJlc3Npb25Db250YWluZXIuQkFTRV9DSFVOS19TSVpFXG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX2luZGV4ZWRWYXJpYWJsZXMgPiBjaHVua1NpemUpIHtcbiAgICAgIC8vIFRoZXJlIGFyZSBhIGxvdCBvZiBjaGlsZHJlbiwgY3JlYXRlIGZha2UgaW50ZXJtZWRpYXRlIHZhbHVlcyB0aGF0IHJlcHJlc2VudCBjaHVua3MgIzk1MzdcbiAgICAgIGNvbnN0IG51bWJlck9mQ2h1bmtzID0gTWF0aC5jZWlsKHRoaXMuX2luZGV4ZWRWYXJpYWJsZXMgLyBjaHVua1NpemUpXG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG51bWJlck9mQ2h1bmtzOyBpKyspIHtcbiAgICAgICAgY29uc3Qgc3RhcnQgPSB0aGlzLl9zdGFydE9mVmFyaWFibGVzICsgaSAqIGNodW5rU2l6ZVxuICAgICAgICBjb25zdCBjb3VudCA9IE1hdGgubWluKGNodW5rU2l6ZSwgdGhpcy5faW5kZXhlZFZhcmlhYmxlcyAtIGkgKiBjaHVua1NpemUpXG4gICAgICAgIGNoaWxkcmVuQXJyYXkucHVzaChcbiAgICAgICAgICBuZXcgVmFyaWFibGUoXG4gICAgICAgICAgICB0aGlzLnByb2Nlc3MsXG4gICAgICAgICAgICB0aGlzLFxuICAgICAgICAgICAgdGhpcy5yZWZlcmVuY2UsXG4gICAgICAgICAgICBgWyR7c3RhcnR9Li4ke3N0YXJ0ICsgY291bnQgLSAxfV1gLFxuICAgICAgICAgICAgXCJcIixcbiAgICAgICAgICAgIFwiXCIsXG4gICAgICAgICAgICBudWxsLFxuICAgICAgICAgICAgY291bnQsXG4gICAgICAgICAgICB7IGtpbmQ6IFwidmlydHVhbFwiIH0sXG4gICAgICAgICAgICBudWxsLFxuICAgICAgICAgICAgdHJ1ZSxcbiAgICAgICAgICAgIHN0YXJ0XG4gICAgICAgICAgKVxuICAgICAgICApXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBjaGlsZHJlbkFycmF5XG4gICAgfVxuXG4gICAgY29uc3QgdmFyaWFibGVzID0gYXdhaXQgdGhpcy5fZmV0Y2hWYXJpYWJsZXModGhpcy5fc3RhcnRPZlZhcmlhYmxlcywgdGhpcy5faW5kZXhlZFZhcmlhYmxlcywgXCJpbmRleGVkXCIpXG4gICAgcmV0dXJuIGNoaWxkcmVuQXJyYXkuY29uY2F0KHZhcmlhYmxlcylcbiAgfVxuXG4gIGdldElkKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHRoaXMuX2lkXG4gIH1cblxuICBnZXRWYWx1ZSgpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLl92YWx1ZVxuICB9XG5cbiAgaGFzQ2hpbGRyZW4oKTogYm9vbGVhbiB7XG4gICAgLy8gb25seSB2YXJpYWJsZXMgd2l0aCByZWZlcmVuY2UgPiAwIGhhdmUgY2hpbGRyZW4uXG4gICAgcmV0dXJuIHRoaXMucmVmZXJlbmNlID4gMFxuICB9XG5cbiAgYXN5bmMgX2ZldGNoVmFyaWFibGVzKHN0YXJ0PzogbnVtYmVyLCBjb3VudD86IG51bWJlciwgZmlsdGVyPzogXCJpbmRleGVkXCIgfCBcIm5hbWVkXCIpOiBQcm9taXNlPElWYXJpYWJsZVtdPiB7XG4gICAgY29uc3QgcHJvY2VzcyA9IHRoaXMucHJvY2Vzc1xuICAgIGludmFyaWFudChwcm9jZXNzKVxuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZTogRGVidWdQcm90b2NvbC5WYXJpYWJsZXNSZXNwb25zZSA9IGF3YWl0IHByb2Nlc3Muc2Vzc2lvbi52YXJpYWJsZXMoe1xuICAgICAgICB2YXJpYWJsZXNSZWZlcmVuY2U6IHRoaXMucmVmZXJlbmNlLFxuICAgICAgICBzdGFydCxcbiAgICAgICAgY291bnQsXG4gICAgICAgIGZpbHRlcixcbiAgICAgIH0pXG4gICAgICBjb25zdCB2YXJpYWJsZXMgPSBkaXN0aW5jdChcbiAgICAgICAgcmVzcG9uc2UuYm9keS52YXJpYWJsZXMuZmlsdGVyKCh2KSA9PiB2ICE9IG51bGwgJiYgdi5uYW1lKSxcbiAgICAgICAgKHYpID0+IHYubmFtZVxuICAgICAgKVxuICAgICAgcmV0dXJuIHZhcmlhYmxlcy5tYXAoXG4gICAgICAgICh2KSA9PlxuICAgICAgICAgIG5ldyBWYXJpYWJsZShcbiAgICAgICAgICAgIHRoaXMucHJvY2VzcyxcbiAgICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgICB2LnZhcmlhYmxlc1JlZmVyZW5jZSxcbiAgICAgICAgICAgIHYubmFtZSxcbiAgICAgICAgICAgIHYuZXZhbHVhdGVOYW1lLFxuICAgICAgICAgICAgdi52YWx1ZSxcbiAgICAgICAgICAgIHYubmFtZWRWYXJpYWJsZXMsXG4gICAgICAgICAgICB2LmluZGV4ZWRWYXJpYWJsZXMsXG4gICAgICAgICAgICB2LnByZXNlbnRhdGlvbkhpbnQsXG4gICAgICAgICAgICB2LnR5cGVcbiAgICAgICAgICApXG4gICAgICApXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIFtuZXcgVmFyaWFibGUodGhpcy5wcm9jZXNzLCB0aGlzLCAwLCBudWxsLCBlLm1lc3NhZ2UsIFwiXCIsIDAsIDAsIHsga2luZDogXCJ2aXJ0dWFsXCIgfSwgbnVsbCwgZmFsc2UpXVxuICAgIH1cbiAgfVxuXG4gIC8vIFRoZSBhZGFwdGVyIGV4cGxpY2l0bHkgc2VudHMgdGhlIGNoaWxkcmVuIGNvdW50IG9mIGFuIGV4cHJlc3Npb24gb25seSBpZiB0aGVyZSBhcmUgbG90cyBvZiBjaGlsZHJlbiB3aGljaCBzaG91bGQgYmUgY2h1bmtlZC5cbiAgZ2V0IGdldENoaWxkcmVuSW5DaHVua3MoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIEJvb2xlYW4odGhpcy5faW5kZXhlZFZhcmlhYmxlcylcbiAgfVxuXG4gIHNldFZhbHVlKHZhbHVlOiBzdHJpbmcpIHtcbiAgICB0aGlzLl92YWx1ZSA9IHZhbHVlXG4gICAgRXhwcmVzc2lvbkNvbnRhaW5lci5hbGxWYWx1ZXMuc2V0KHRoaXMuZ2V0SWQoKSwgdmFsdWUpXG4gIH1cblxuICB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLl92YWx1ZVxuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHByZXNzaW9uIGV4dGVuZHMgRXhwcmVzc2lvbkNvbnRhaW5lciBpbXBsZW1lbnRzIElFdmFsdWF0YWJsZUV4cHJlc3Npb24ge1xuICBzdGF0aWMgREVGQVVMVF9WQUxVRSA9IFwibm90IGF2YWlsYWJsZVwiXG5cbiAgYXZhaWxhYmxlOiBib29sZWFuXG4gIF90eXBlOiA/c3RyaW5nXG4gIG5hbWU6IHN0cmluZ1xuXG4gIGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZywgaWQ/OiBzdHJpbmcgPSB1dWlkLnY0KCkpIHtcbiAgICBzdXBlcihudWxsLCAwLCBpZClcbiAgICB0aGlzLm5hbWUgPSBuYW1lXG4gICAgdGhpcy5hdmFpbGFibGUgPSBmYWxzZVxuICAgIHRoaXMuX3R5cGUgPSBudWxsXG4gICAgLy8gbmFtZSBpcyBub3Qgc2V0IGlmIHRoZSBleHByZXNzaW9uIGlzIGp1c3QgYmVpbmcgYWRkZWRcbiAgICAvLyBpbiB0aGF0IGNhc2UgZG8gbm90IHNldCBkZWZhdWx0IHZhbHVlIHRvIHByZXZlbnQgZmxhc2hpbmcgIzE0NDk5XG4gICAgaWYgKG5hbWUpIHtcbiAgICAgIHRoaXMuX3ZhbHVlID0gRXhwcmVzc2lvbi5ERUZBVUxUX1ZBTFVFXG4gICAgfVxuICB9XG5cbiAgZ2V0IHR5cGUoKTogP3N0cmluZyB7XG4gICAgcmV0dXJuIHRoaXMuX3R5cGVcbiAgfVxuXG4gIGFzeW5jIGV2YWx1YXRlKHByb2Nlc3M6ID9JUHJvY2Vzcywgc3RhY2tGcmFtZTogP0lTdGFja0ZyYW1lLCBjb250ZXh0OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAocHJvY2VzcyA9PSBudWxsIHx8IChzdGFja0ZyYW1lID09IG51bGwgJiYgY29udGV4dCAhPT0gXCJyZXBsXCIpKSB7XG4gICAgICB0aGlzLl92YWx1ZSA9IGNvbnRleHQgPT09IFwicmVwbFwiID8gXCJQbGVhc2Ugc3RhcnQgYSBkZWJ1ZyBzZXNzaW9uIHRvIGV2YWx1YXRlXCIgOiBFeHByZXNzaW9uLkRFRkFVTFRfVkFMVUVcbiAgICAgIHRoaXMuYXZhaWxhYmxlID0gZmFsc2VcbiAgICAgIHRoaXMucmVmZXJlbmNlID0gMFxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgdGhpcy5wcm9jZXNzID0gcHJvY2Vzc1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXNwb25zZTogRGVidWdQcm90b2NvbC5FdmFsdWF0ZVJlc3BvbnNlID0gYXdhaXQgcHJvY2Vzcy5zZXNzaW9uLmV2YWx1YXRlKHtcbiAgICAgICAgZXhwcmVzc2lvbjogdGhpcy5uYW1lLFxuICAgICAgICBmcmFtZUlkOiBzdGFja0ZyYW1lID8gc3RhY2tGcmFtZS5mcmFtZUlkIDogdW5kZWZpbmVkLFxuICAgICAgICBjb250ZXh0LFxuICAgICAgfSlcblxuICAgICAgdGhpcy5hdmFpbGFibGUgPSByZXNwb25zZSAhPSBudWxsICYmIHJlc3BvbnNlLmJvZHkgIT0gbnVsbFxuICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLmJvZHkpIHtcbiAgICAgICAgdGhpcy5fdmFsdWUgPSByZXNwb25zZS5ib2R5LnJlc3VsdFxuICAgICAgICB0aGlzLnJlZmVyZW5jZSA9IHJlc3BvbnNlLmJvZHkudmFyaWFibGVzUmVmZXJlbmNlIHx8IDBcbiAgICAgICAgdGhpcy5fbmFtZWRWYXJpYWJsZXMgPSByZXNwb25zZS5ib2R5Lm5hbWVkVmFyaWFibGVzIHx8IDBcbiAgICAgICAgdGhpcy5faW5kZXhlZFZhcmlhYmxlcyA9IHJlc3BvbnNlLmJvZHkuaW5kZXhlZFZhcmlhYmxlcyB8fCAwXG4gICAgICAgIHRoaXMuX3R5cGUgPSByZXNwb25zZS5ib2R5LnR5cGVcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIHRoaXMuX3ZhbHVlID0gZXJyLm1lc3NhZ2VcbiAgICAgIHRoaXMuYXZhaWxhYmxlID0gZmFsc2VcbiAgICAgIHRoaXMucmVmZXJlbmNlID0gMFxuICAgIH1cbiAgfVxuXG4gIHRvU3RyaW5nKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGAke3RoaXMubmFtZX1cXG4ke3RoaXMuX3ZhbHVlfWBcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgVmFyaWFibGUgZXh0ZW5kcyBFeHByZXNzaW9uQ29udGFpbmVyIGltcGxlbWVudHMgSVZhcmlhYmxlIHtcbiAgcGFyZW50OiBFeHByZXNzaW9uQ29udGFpbmVyXG4gIG5hbWU6IHN0cmluZ1xuICBldmFsdWF0ZU5hbWU6ID9zdHJpbmdcbiAgcHJlc2VudGF0aW9uSGludDogP0RlYnVnUHJvdG9jb2wuVmFyaWFibGVQcmVzZW50YXRpb25IaW50XG4gIF90eXBlOiA/c3RyaW5nXG4gIGF2YWlsYWJsZTogYm9vbGVhblxuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHByb2Nlc3M6ID9JUHJvY2VzcyxcbiAgICBwYXJlbnQ6IEV4cHJlc3Npb25Db250YWluZXIsXG4gICAgcmVmZXJlbmNlOiBudW1iZXIsXG4gICAgbmFtZTogP3N0cmluZyxcbiAgICBldmFsdWF0ZU5hbWU6ID9zdHJpbmcsXG4gICAgdmFsdWU6IHN0cmluZyxcbiAgICBuYW1lZFZhcmlhYmxlczogP251bWJlcixcbiAgICBpbmRleGVkVmFyaWFibGVzOiA/bnVtYmVyLFxuICAgIHByZXNlbnRhdGlvbkhpbnQ6ID9EZWJ1Z1Byb3RvY29sLlZhcmlhYmxlUHJlc2VudGF0aW9uSGludCxcbiAgICB0eXBlOiA/c3RyaW5nLFxuICAgIGF2YWlsYWJsZT86IGJvb2xlYW4gPSB0cnVlLFxuICAgIF9zdGFydE9mVmFyaWFibGVzOiA/bnVtYmVyXG4gICkge1xuICAgIHN1cGVyKFxuICAgICAgcHJvY2VzcyxcbiAgICAgIHJlZmVyZW5jZSxcbiAgICAgIC8vIGZsb3dsaW50LW5leHQtbGluZSBza2V0Y2h5LW51bGwtc3RyaW5nOm9mZlxuICAgICAgYHZhcmlhYmxlOiR7cGFyZW50LmdldElkKCl9OiR7bmFtZSB8fCBcIm5vX25hbWVcIn1gLFxuICAgICAgbmFtZWRWYXJpYWJsZXMsXG4gICAgICBpbmRleGVkVmFyaWFibGVzLFxuICAgICAgX3N0YXJ0T2ZWYXJpYWJsZXNcbiAgICApXG4gICAgdGhpcy5wYXJlbnQgPSBwYXJlbnRcbiAgICB0aGlzLm5hbWUgPSBuYW1lID09IG51bGwgPyBcIm5vX25hbWVcIiA6IG5hbWVcbiAgICB0aGlzLmV2YWx1YXRlTmFtZSA9IGV2YWx1YXRlTmFtZVxuICAgIHRoaXMucHJlc2VudGF0aW9uSGludCA9IHByZXNlbnRhdGlvbkhpbnRcbiAgICB0aGlzLl90eXBlID0gdHlwZVxuICAgIHRoaXMuYXZhaWxhYmxlID0gYXZhaWxhYmxlXG4gICAgdGhpcy5fdmFsdWUgPSB2YWx1ZVxuICB9XG5cbiAgZ2V0IHR5cGUoKTogP3N0cmluZyB7XG4gICAgcmV0dXJuIHRoaXMuX3R5cGVcbiAgfVxuXG4gIGdldCBncmFtbWFyTmFtZSgpOiA/c3RyaW5nIHtcbiAgICBpZiAodGhpcy5wcm9jZXNzID09IG51bGwpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICAgIHJldHVybiB0aGlzLnByb2Nlc3MuY29uZmlndXJhdGlvbi5ncmFtbWFyTmFtZVxuICB9XG5cbiAgYXN5bmMgc2V0VmFyaWFibGUodmFsdWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHByb2Nlc3MgPSBudWxsdGhyb3dzKHRoaXMucHJvY2VzcylcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfRURJVF9WQVJJQUJMRSwge1xuICAgICAgbGFuZ3VhZ2U6IHByb2Nlc3MuY29uZmlndXJhdGlvbi5hZGFwdGVyVHlwZSxcbiAgICB9KVxuICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcHJvY2Vzcy5zZXNzaW9uLnNldFZhcmlhYmxlKHtcbiAgICAgIG5hbWU6IG51bGx0aHJvd3ModGhpcy5uYW1lKSxcbiAgICAgIHZhbHVlLFxuICAgICAgdmFyaWFibGVzUmVmZXJlbmNlOiB0aGlzLnBhcmVudC5yZWZlcmVuY2UsXG4gICAgfSlcbiAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2UuYm9keSkge1xuICAgICAgdGhpcy5fdmFsdWUgPSByZXNwb25zZS5ib2R5LnZhbHVlXG4gICAgICB0aGlzLl90eXBlID0gcmVzcG9uc2UuYm9keS50eXBlID09IG51bGwgPyB0aGlzLl90eXBlIDogcmVzcG9uc2UuYm9keS50eXBlXG4gICAgICB0aGlzLnJlZmVyZW5jZSA9IHJlc3BvbnNlLmJvZHkudmFyaWFibGVzUmVmZXJlbmNlIHx8IDBcbiAgICAgIHRoaXMuX25hbWVkVmFyaWFibGVzID0gcmVzcG9uc2UuYm9keS5uYW1lZFZhcmlhYmxlcyB8fCAwXG4gICAgICB0aGlzLl9pbmRleGVkVmFyaWFibGVzID0gcmVzcG9uc2UuYm9keS5pbmRleGVkVmFyaWFibGVzIHx8IDBcbiAgICB9XG4gIH1cblxuICBjYW5TZXRWYXJpYWJsZSgpOiBib29sZWFuIHtcbiAgICBjb25zdCBwcm9jID0gdGhpcy5wcm9jZXNzXG4gICAgaWYgKHByb2MgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfVxuXG4gICAgY29uc3Qgc3VwcG9ydHNTZXRWYXJpYWJsZSA9IEJvb2xlYW4ocHJvYy5zZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c1NldFZhcmlhYmxlKVxuXG4gICAgLy8gV2UgY2FuJ3Qgc2V0IHZhcmlhYmxlcyBpZiB0aGUgdGFyZ2V0IGlzIHJlYWQgb25seS5cbiAgICAvLyBXZSBhbHNvIHJlcXVpcmUgYSB2YXJpYWJsZXMgcmVmZXJlbmNlIGZvciB0aGUgcGFyZW50IGZvciB0aGUgcHJvdG9jb2wsXG4gICAgLy8gYW5kIGN1cnJlbnRseSBvbmx5IHNldCBvbiBsZWF2ZXMgKHZhcmlhYmxlcyB3aXRoIG5vIGNoaWxkcmVuKSBiZWNhdXNlXG4gICAgLy8gdGhpcyBsYXllciBkb2Vzbid0IGtub3cgaG93IHRvIHBhcnNlIGluaXRpYWxpemVyIGV4cHJlc3Npb25zIGZvciBzZXR0aW5nXG4gICAgLy8gdGhlIHZhbHVlIG9mIGNvbXBsZXggb2JqZWN0cyBvciBhcnJheXMuXG4gICAgLy8gVE9ETzogSXQnZCBiZSBuaWNlIHRvIGJlIGFibGUgdG8gc2V0IGFycmF5IGlkZW50aXRpZXMgaGVyZSBsaWtlOiBhID0gezEsIDIsIDN9LlxuICAgIGNvbnN0IGlzUmVhZE9ubHlUYXJnZXQgPSBCb29sZWFuKHByb2MuY29uZmlndXJhdGlvbi5pc1JlYWRPbmx5KVxuICAgIGNvbnN0IGhhc1ZhbGlkUGFyZW50UmVmZXJlbmNlID1cbiAgICAgIHRoaXMucGFyZW50LnJlZmVyZW5jZSAhPSBudWxsICYmICFOdW1iZXIuaXNOYU4odGhpcy5wYXJlbnQucmVmZXJlbmNlKSAmJiB0aGlzLnBhcmVudC5yZWZlcmVuY2UgPj0gMFxuICAgIHJldHVybiAhaXNSZWFkT25seVRhcmdldCAmJiBzdXBwb3J0c1NldFZhcmlhYmxlICYmIGhhc1ZhbGlkUGFyZW50UmVmZXJlbmNlICYmICF0aGlzLmhhc0NoaWxkcmVuKClcbiAgfVxuXG4gIHRvU3RyaW5nKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGAke3RoaXMubmFtZX06ICR7dGhpcy5fdmFsdWV9YFxuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBTY29wZSBleHRlbmRzIEV4cHJlc3Npb25Db250YWluZXIgaW1wbGVtZW50cyBJU2NvcGUge1xuICArbmFtZTogc3RyaW5nXG4gICtleHBlbnNpdmU6IGJvb2xlYW5cbiAgK3JhbmdlOiA/YXRvbSRSYW5nZVxuXG4gIGNvbnN0cnVjdG9yKFxuICAgIHN0YWNrRnJhbWU6IElTdGFja0ZyYW1lLFxuICAgIGluZGV4OiBudW1iZXIsXG4gICAgbmFtZTogc3RyaW5nLFxuICAgIHJlZmVyZW5jZTogbnVtYmVyLFxuICAgIGV4cGVuc2l2ZTogYm9vbGVhbixcbiAgICBuYW1lZFZhcmlhYmxlczogP251bWJlcixcbiAgICBpbmRleGVkVmFyaWFibGVzOiA/bnVtYmVyLFxuICAgIHJhbmdlOiA/YXRvbSRSYW5nZVxuICApIHtcbiAgICBzdXBlcihcbiAgICAgIHN0YWNrRnJhbWUudGhyZWFkLnByb2Nlc3MsXG4gICAgICByZWZlcmVuY2UsXG4gICAgICBgc2NvcGU6JHtzdGFja0ZyYW1lLmdldElkKCl9OiR7bmFtZX06JHtpbmRleH1gLFxuICAgICAgbmFtZWRWYXJpYWJsZXMsXG4gICAgICBpbmRleGVkVmFyaWFibGVzXG4gICAgKVxuICAgIHRoaXMubmFtZSA9IG5hbWVcbiAgICB0aGlzLmV4cGVuc2l2ZSA9IGV4cGVuc2l2ZVxuICAgIHRoaXMucmFuZ2UgPSByYW5nZVxuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBTdGFja0ZyYW1lIGltcGxlbWVudHMgSVN0YWNrRnJhbWUge1xuICBzY29wZXM6ID9Qcm9taXNlPFNjb3BlW10+XG4gIHRocmVhZDogSVRocmVhZFxuICBmcmFtZUlkOiBudW1iZXJcbiAgc291cmNlOiBJU291cmNlXG4gIG5hbWU6IHN0cmluZ1xuICBwcmVzZW50YXRpb25IaW50OiA/c3RyaW5nXG4gIHJhbmdlOiBhdG9tJFJhbmdlXG4gIGluZGV4OiBudW1iZXJcblxuICBjb25zdHJ1Y3RvcihcbiAgICB0aHJlYWQ6IElUaHJlYWQsXG4gICAgZnJhbWVJZDogbnVtYmVyLFxuICAgIHNvdXJjZTogSVNvdXJjZSxcbiAgICBuYW1lOiBzdHJpbmcsXG4gICAgcHJlc2VudGF0aW9uSGludDogP3N0cmluZyxcbiAgICByYW5nZTogYXRvbSRSYW5nZSxcbiAgICBpbmRleDogbnVtYmVyXG4gICkge1xuICAgIHRoaXMudGhyZWFkID0gdGhyZWFkXG4gICAgdGhpcy5mcmFtZUlkID0gZnJhbWVJZFxuICAgIHRoaXMuc291cmNlID0gc291cmNlXG4gICAgdGhpcy5uYW1lID0gbmFtZVxuICAgIHRoaXMucHJlc2VudGF0aW9uSGludCA9IHByZXNlbnRhdGlvbkhpbnRcbiAgICB0aGlzLnJhbmdlID0gcmFuZ2VcbiAgICB0aGlzLmluZGV4ID0gaW5kZXhcbiAgICB0aGlzLnNjb3BlcyA9IG51bGxcbiAgfVxuXG4gIGdldElkKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGBzdGFja2ZyYW1lOiR7dGhpcy50aHJlYWQuZ2V0SWQoKX06JHt0aGlzLmZyYW1lSWR9OiR7dGhpcy5pbmRleH1gXG4gIH1cblxuICBhc3luYyBnZXRTY29wZXMoZm9yY2VSZWZyZXNoOiBib29sZWFuKTogUHJvbWlzZTxJU2NvcGVbXT4ge1xuICAgIGlmICh0aGlzLnNjb3BlcyA9PSBudWxsIHx8IGZvcmNlUmVmcmVzaCkge1xuICAgICAgdGhpcy5zY29wZXMgPSB0aGlzLl9nZXRTY29wZXNJbXBsKClcbiAgICB9XG4gICAgcmV0dXJuICh0aGlzLnNjb3BlczogYW55KVxuICB9XG5cbiAgYXN5bmMgX2dldFNjb3Blc0ltcGwoKTogUHJvbWlzZTxTY29wZVtdPiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHtcbiAgICAgICAgYm9keTogeyBzY29wZXMgfSxcbiAgICAgIH0gPSBhd2FpdCB0aGlzLnRocmVhZC5wcm9jZXNzLnNlc3Npb24uc2NvcGVzKHtcbiAgICAgICAgZnJhbWVJZDogdGhpcy5mcmFtZUlkLFxuICAgICAgfSlcbiAgICAgIHJldHVybiBzY29wZXMubWFwKFxuICAgICAgICAocnMsIGluZGV4KSA9PlxuICAgICAgICAgIG5ldyBTY29wZShcbiAgICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgICBpbmRleCxcbiAgICAgICAgICAgIHJzLm5hbWUsXG4gICAgICAgICAgICBycy52YXJpYWJsZXNSZWZlcmVuY2UsXG4gICAgICAgICAgICBycy5leHBlbnNpdmUsXG4gICAgICAgICAgICBycy5uYW1lZFZhcmlhYmxlcyxcbiAgICAgICAgICAgIHJzLmluZGV4ZWRWYXJpYWJsZXMsXG4gICAgICAgICAgICBycy5saW5lICE9IG51bGxcbiAgICAgICAgICAgICAgPyBuZXcgUmFuZ2UoXG4gICAgICAgICAgICAgICAgICBbcnMubGluZSAtIDEsIChycy5jb2x1bW4gIT0gbnVsbCA/IHJzLmNvbHVtbiA6IDEpIC0gMV0sXG4gICAgICAgICAgICAgICAgICBbKHJzLmVuZExpbmUgIT0gbnVsbCA/IHJzLmVuZExpbmUgOiBycy5saW5lKSAtIDEsIChycy5lbmRDb2x1bW4gIT0gbnVsbCA/IHJzLmVuZENvbHVtbiA6IDEpIC0gMV1cbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIDogbnVsbFxuICAgICAgICAgIClcbiAgICAgIClcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIHJldHVybiBbXVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGdldE1vc3RTcGVjaWZpY1Njb3BlcyhyYW5nZTogYXRvbSRSYW5nZSk6IFByb21pc2U8SVNjb3BlW10+IHtcbiAgICBjb25zdCBzY29wZXM6IEFycmF5PElTY29wZT4gPSAoYXdhaXQgdGhpcy5nZXRTY29wZXMoZmFsc2UpKS5maWx0ZXIoKHMpID0+ICFzLmV4cGVuc2l2ZSlcbiAgICBjb25zdCBoYXZlUmFuZ2VJbmZvID0gc2NvcGVzLnNvbWUoKHMpID0+IHMucmFuZ2UgIT0gbnVsbClcbiAgICBpZiAoIWhhdmVSYW5nZUluZm8pIHtcbiAgICAgIHJldHVybiBzY29wZXNcbiAgICB9XG5cbiAgICBjb25zdCBzY29wZXNDb250YWluaW5nUmFuZ2UgPSBzY29wZXNcbiAgICAgIC5maWx0ZXIoKHNjb3BlKSA9PiBzY29wZS5yYW5nZSAhPSBudWxsICYmIHNjb3BlLnJhbmdlLmNvbnRhaW5zUmFuZ2UocmFuZ2UpKVxuICAgICAgLnNvcnQoKGZpcnN0LCBzZWNvbmQpID0+IHtcbiAgICAgICAgY29uc3QgZmlyc3RSYW5nZSA9IG51bGx0aHJvd3MoZmlyc3QucmFuZ2UpXG4gICAgICAgIGNvbnN0IHNlY29uZFJhbmdlID0gbnVsbHRocm93cyhzZWNvbmQucmFuZ2UpXG4gICAgICAgIC8vIHByZXR0aWVyLWlnbm9yZVxuICAgICAgICByZXR1cm4gKGZpcnN0UmFuZ2UuZW5kLnJvdyAtIGZpcnN0UmFuZ2Uuc3RhcnQucm93KSAtXG4gICAgICAgICAgKHNlY29uZFJhbmdlLmVuZC5yb3cgLSBzZWNvbmRSYW5nZS5lbmQucm93KTtcbiAgICAgIH0pXG4gICAgcmV0dXJuIHNjb3Blc0NvbnRhaW5pbmdSYW5nZS5sZW5ndGggPyBzY29wZXNDb250YWluaW5nUmFuZ2UgOiBzY29wZXNcbiAgfVxuXG4gIGFzeW5jIHJlc3RhcnQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgYXdhaXQgdGhpcy50aHJlYWQucHJvY2Vzcy5zZXNzaW9uLnJlc3RhcnRGcmFtZSh7IGZyYW1lSWQ6IHRoaXMuZnJhbWVJZCB9LCB0aGlzLnRocmVhZC50aHJlYWRJZClcbiAgfVxuXG4gIHRvU3RyaW5nKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGAke3RoaXMubmFtZX0gKCR7dGhpcy5zb3VyY2UuaW5NZW1vcnkgPyBudWxsdGhyb3dzKHRoaXMuc291cmNlLm5hbWUpIDogdGhpcy5zb3VyY2UudXJpfToke1xuICAgICAgdGhpcy5yYW5nZS5zdGFydC5yb3dcbiAgICB9KWBcbiAgfVxuXG4gIGFzeW5jIG9wZW5JbkVkaXRvcigpOiBQcm9taXNlPD9hdG9tJFRleHRFZGl0b3I+IHtcbiAgICBjb25zdCByYXdQYXRoID0gdGhpcy5zb3VyY2UucmF3LnBhdGhcbiAgICBjb25zdCBsb2NhbFJhd1BhdGggPSBudWNsaWRlVXJpLmdldFBhdGgocmF3UGF0aCB8fCBcIlwiKVxuICAgIGlmIChcbiAgICAgIHJhd1BhdGggIT0gbnVsbCAmJlxuICAgICAgbG9jYWxSYXdQYXRoICE9PSBcIlwiICYmXG4gICAgICAoYXdhaXQgZ2V0VlNDb2RlRGVidWdnZXJBZGFwdGVyU2VydmljZUJ5TnVjbGlkZVVyaShyYXdQYXRoKS5leGlzdHMobG9jYWxSYXdQYXRoKSlcbiAgICApIHtcbiAgICAgIHJldHVybiBvcGVuU291cmNlTG9jYXRpb24ocmF3UGF0aCwgdGhpcy5yYW5nZS5zdGFydC5yb3cpXG4gICAgfVxuICAgIGlmICh0aGlzLnNvdXJjZS5hdmFpbGFibGUpIHtcbiAgICAgIHJldHVybiBvcGVuU291cmNlTG9jYXRpb24odGhpcy5zb3VyY2UudXJpLCB0aGlzLnJhbmdlLnN0YXJ0LnJvdylcbiAgICB9XG4gICAgcmV0dXJuIG51bGxcbiAgfVxufVxuXG50eXBlIENhbGxTdGFjayA9IHtcbiAgdmFsaWQ6IGJvb2xlYW4sXG4gIGNhbGxGcmFtZXM6IElTdGFja0ZyYW1lW10sXG59XG5cbmV4cG9ydCBjbGFzcyBUaHJlYWQgaW1wbGVtZW50cyBJVGhyZWFkIHtcbiAgX2NhbGxTdGFjazogQ2FsbFN0YWNrXG4gIF9yZWZyZXNoSW5Qcm9ncmVzczogYm9vbGVhblxuICBzdG9wcGVkRGV0YWlsczogP0lSYXdTdG9wcGVkRGV0YWlsc1xuICBzdG9wcGVkOiBib29sZWFuXG4gICtwcm9jZXNzOiBJUHJvY2Vzc1xuICArdGhyZWFkSWQ6IG51bWJlclxuICBuYW1lOiBzdHJpbmdcblxuICBjb25zdHJ1Y3Rvcihwcm9jZXNzOiBJUHJvY2VzcywgbmFtZTogc3RyaW5nLCB0aHJlYWRJZDogbnVtYmVyKSB7XG4gICAgdGhpcy5wcm9jZXNzID0gcHJvY2Vzc1xuICAgIHRoaXMubmFtZSA9IG5hbWVcbiAgICB0aGlzLnRocmVhZElkID0gdGhyZWFkSWRcbiAgICB0aGlzLnN0b3BwZWREZXRhaWxzID0gbnVsbFxuICAgIHRoaXMuX2NhbGxTdGFjayA9IHRoaXMuX2dldEVtcHR5Q2FsbHN0YWNrU3RhdGUoKVxuICAgIHRoaXMuc3RvcHBlZCA9IGZhbHNlXG4gICAgdGhpcy5fcmVmcmVzaEluUHJvZ3Jlc3MgPSBmYWxzZVxuICB9XG5cbiAgX2dldEVtcHR5Q2FsbHN0YWNrU3RhdGUoKTogQ2FsbFN0YWNrIHtcbiAgICByZXR1cm4ge1xuICAgICAgdmFsaWQ6IGZhbHNlLFxuICAgICAgY2FsbEZyYW1lczogW10sXG4gICAgfVxuICB9XG5cbiAgX2lzQ2FsbHN0YWNrTG9hZGVkKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLl9jYWxsU3RhY2sudmFsaWRcbiAgfVxuXG4gIF9pc0NhbGxzdGFja0Z1bGx5TG9hZGVkKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLl9pc0NhbGxzdGFja0xvYWRlZCgpICYmXG4gICAgICB0aGlzLnN0b3BwZWREZXRhaWxzICE9IG51bGwgJiZcbiAgICAgIHRoaXMuc3RvcHBlZERldGFpbHMudG90YWxGcmFtZXMgIT0gbnVsbCAmJlxuICAgICAgIU51bWJlci5pc05hTih0aGlzLnN0b3BwZWREZXRhaWxzLnRvdGFsRnJhbWVzKSAmJlxuICAgICAgdGhpcy5zdG9wcGVkRGV0YWlscy50b3RhbEZyYW1lcyA+PSAwICYmXG4gICAgICB0aGlzLl9jYWxsU3RhY2suY2FsbEZyYW1lcy5sZW5ndGggPj0gdGhpcy5zdG9wcGVkRGV0YWlscy50b3RhbEZyYW1lc1xuICAgIClcbiAgfVxuXG4gIGdldElkKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIGB0aHJlYWQ6JHt0aGlzLnByb2Nlc3MuZ2V0SWQoKX06JHt0aGlzLnRocmVhZElkfWBcbiAgfVxuXG4gIGFkZGl0aW9uYWxGcmFtZXNBdmFpbGFibGUoY3VycmVudEZyYW1lQ291bnQ6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgIGlmICh0aGlzLl9jYWxsU3RhY2suY2FsbEZyYW1lcy5sZW5ndGggPiBjdXJyZW50RnJhbWVDb3VudCkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG4gICAgY29uc3Qgc3VwcG9ydHNEZWxheUxvYWRpbmcgPSBudWxsdGhyb3dzKHRoaXMucHJvY2Vzcykuc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNEZWxheWVkU3RhY2tUcmFjZUxvYWRpbmcgPT09IHRydWVcbiAgICBpZiAoXG4gICAgICBzdXBwb3J0c0RlbGF5TG9hZGluZyAmJlxuICAgICAgdGhpcy5zdG9wcGVkRGV0YWlscyAhPSBudWxsICYmXG4gICAgICB0aGlzLnN0b3BwZWREZXRhaWxzLnRvdGFsRnJhbWVzICE9IG51bGwgJiZcbiAgICAgIHRoaXMuc3RvcHBlZERldGFpbHMudG90YWxGcmFtZXMgPiBjdXJyZW50RnJhbWVDb3VudFxuICAgICkge1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIGNsZWFyQ2FsbFN0YWNrKCk6IHZvaWQge1xuICAgIHRoaXMuX2NhbGxTdGFjayA9IHRoaXMuX2dldEVtcHR5Q2FsbHN0YWNrU3RhdGUoKVxuICB9XG5cbiAgZ2V0Q2FsbFN0YWNrVG9wRnJhbWUoKTogP0lTdGFja0ZyYW1lIHtcbiAgICByZXR1cm4gdGhpcy5faXNDYWxsc3RhY2tMb2FkZWQoKSA/IHRoaXMuX2NhbGxTdGFjay5jYWxsRnJhbWVzWzBdIDogbnVsbFxuICB9XG5cbiAgZ2V0RnVsbENhbGxTdGFjayhsZXZlbHM/OiBudW1iZXIpOiBPYnNlcnZhYmxlPEV4cGVjdGVkPElTdGFja0ZyYW1lW10+PiB7XG4gICAgaWYgKFxuICAgICAgdGhpcy5fcmVmcmVzaEluUHJvZ3Jlc3MgfHxcbiAgICAgIHRoaXMuX2lzQ2FsbHN0YWNrRnVsbHlMb2FkZWQoKSB8fFxuICAgICAgKGxldmVscyAhPSBudWxsICYmIHRoaXMuX2lzQ2FsbHN0YWNrTG9hZGVkKCkgJiYgdGhpcy5fY2FsbFN0YWNrLmNhbGxGcmFtZXMubGVuZ3RoID49IGxldmVscylcbiAgICApIHtcbiAgICAgIC8vIFdlIGhhdmUgYSBzdWZmaWNlbnQgY2FsbCBzdGFjayBhbHJlYWR5IGxvYWRlZCwganVzdCByZXR1cm4gaXQuXG4gICAgICByZXR1cm4gT2JzZXJ2YWJsZS5vZihFeHBlY3QudmFsdWUodGhpcy5fY2FsbFN0YWNrLmNhbGxGcmFtZXMpKVxuICAgIH1cblxuICAgIC8vIFJldHVybiBhIHBlbmRpbmcgdmFsdWUgYW5kIGtpY2sgb2ZmIHRoZSBmZXRjaC4gV2hlbiB0aGUgZmV0Y2hcbiAgICAvLyBpcyBkb25lLCBlbWl0IHRoZSBuZXcgY2FsbCBmcmFtZXMuXG4gICAgcmV0dXJuIE9ic2VydmFibGUuY29uY2F0KFxuICAgICAgT2JzZXJ2YWJsZS5vZihFeHBlY3QucGVuZGluZygpKSxcbiAgICAgIE9ic2VydmFibGUuZnJvbVByb21pc2UodGhpcy5yZWZyZXNoQ2FsbFN0YWNrKGxldmVscykpLnN3aXRjaE1hcCgoKSA9PlxuICAgICAgICBPYnNlcnZhYmxlLm9mKEV4cGVjdC52YWx1ZSh0aGlzLl9jYWxsU3RhY2suY2FsbEZyYW1lcykpXG4gICAgICApXG4gICAgKVxuICB9XG5cbiAgZ2V0Q2FjaGVkQ2FsbFN0YWNrKCk6IElTdGFja0ZyYW1lW10ge1xuICAgIHJldHVybiB0aGlzLl9jYWxsU3RhY2suY2FsbEZyYW1lc1xuICB9XG5cbiAgLyoqXG4gICAqIFF1ZXJpZXMgdGhlIGRlYnVnIGFkYXB0ZXIgZm9yIHRoZSBjYWxsc3RhY2sgYW5kIHJldHVybnMgYSBwcm9taXNlXG4gICAqIHdoaWNoIGNvbXBsZXRlcyBvbmNlIHRoZSBjYWxsIHN0YWNrIGhhcyBiZWVuIHJldHJpZXZlZC5cbiAgICogSWYgdGhlIHRocmVhZCBpcyBub3Qgc3RvcHBlZCwgaXQgcmV0dXJucyBhIHByb21pc2UgdG8gYW4gZW1wdHkgYXJyYXkuXG4gICAqXG4gICAqIElmIHNwZWNpZmllZCwgbGV2ZWxzIGluZGljYXRlcyB0aGUgbWF4aW11bSBkZXB0aCBvZiBjYWxsIGZyYW1lcyB0byBmZXRjaC5cbiAgICovXG4gIGFzeW5jIHJlZnJlc2hDYWxsU3RhY2sobGV2ZWxzOiA/bnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCF0aGlzLnN0b3BwZWQpIHtcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGNvbnN0IHN1cHBvcnRzRGVsYXlMb2FkaW5nID0gbnVsbHRocm93cyh0aGlzLnByb2Nlc3MpLnNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzRGVsYXllZFN0YWNrVHJhY2VMb2FkaW5nID09PSB0cnVlXG5cbiAgICB0aGlzLl9yZWZyZXNoSW5Qcm9ncmVzcyA9IHRydWVcbiAgICB0cnkge1xuICAgICAgaWYgKHN1cHBvcnRzRGVsYXlMb2FkaW5nKSB7XG4gICAgICAgIGNvbnN0IHN0YXJ0ID0gdGhpcy5fY2FsbFN0YWNrLmNhbGxGcmFtZXMubGVuZ3RoXG4gICAgICAgIGNvbnN0IGNhbGxTdGFjayA9IGF3YWl0IHRoaXMuX2dldENhbGxTdGFja0ltcGwoc3RhcnQsIGxldmVscylcbiAgICAgICAgaWYgKHN0YXJ0IDwgdGhpcy5fY2FsbFN0YWNrLmNhbGxGcmFtZXMubGVuZ3RoKSB7XG4gICAgICAgICAgLy8gU2V0IHRoZSBzdGFjayBmcmFtZXMgZm9yIGV4YWN0IHBvc2l0aW9uIHdlIHJlcXVlc3RlZC5cbiAgICAgICAgICAvLyBUbyBtYWtlIHN1cmUgbm8gY29uY3VycmVudCByZXF1ZXN0cyBjcmVhdGUgZHVwbGljYXRlIHN0YWNrIGZyYW1lcyAjMzA2NjBcbiAgICAgICAgICB0aGlzLl9jYWxsU3RhY2suY2FsbEZyYW1lcy5zcGxpY2Uoc3RhcnQsIHRoaXMuX2NhbGxTdGFjay5jYWxsRnJhbWVzLmxlbmd0aCAtIHN0YXJ0KVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2NhbGxTdGFjay5jYWxsRnJhbWVzID0gdGhpcy5fY2FsbFN0YWNrLmNhbGxGcmFtZXMuY29uY2F0KGNhbGxTdGFjayB8fCBbXSlcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIE11c3QgbG9hZCB0aGUgZW50aXJlIGNhbGwgc3RhY2ssIHRoZSBkZWJ1Z2dlciBiYWNrZW5kIGRvZXNuJ3Qgc3VwcG9ydFxuICAgICAgICAvLyBkZWxheWVkIGNhbGwgc3RhY2sgbG9hZGluZy5cbiAgICAgICAgdGhpcy5fY2FsbFN0YWNrLmNhbGxGcmFtZXMgPSAoYXdhaXQgdGhpcy5fZ2V0Q2FsbFN0YWNrSW1wbCgwLCBudWxsKSkgfHwgW11cbiAgICAgIH1cblxuICAgICAgdGhpcy5fY2FsbFN0YWNrLnZhbGlkID0gdHJ1ZVxuICAgIH0gZmluYWxseSB7XG4gICAgICB0aGlzLl9yZWZyZXNoSW5Qcm9ncmVzcyA9IGZhbHNlXG4gICAgfVxuICB9XG5cbiAgYXN5bmMgX2dldENhbGxTdGFja0ltcGwoc3RhcnRGcmFtZTogbnVtYmVyLCBsZXZlbHM6ID9udW1iZXIpOiBQcm9taXNlPElTdGFja0ZyYW1lW10+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3Qgc3RhY2tUcmFjZUFyZ3M6IERlYnVnUHJvdG9jb2wuU3RhY2tUcmFjZUFyZ3VtZW50cyA9IHtcbiAgICAgICAgdGhyZWFkSWQ6IHRoaXMudGhyZWFkSWQsXG4gICAgICAgIHN0YXJ0RnJhbWUsXG4gICAgICB9XG5cbiAgICAgIC8vIE9ubHkgaW5jbHVkZSBsZXZlbHMgaWYgc3BlY2lmaWVkIGFuZCBzdXBwb3J0ZWQuIElmIGxldmVscyBpcyBvbWl0dGVkLFxuICAgICAgLy8gdGhlIGRlYnVnIGFkYXB0ZXIgaXMgdG8gcmV0dXJuIGFsbCBzdGFjayBmcmFtZXMsIHBlciB0aGUgcHJvdG9jb2wuXG4gICAgICBpZiAobGV2ZWxzICE9IG51bGwpIHtcbiAgICAgICAgc3RhY2tUcmFjZUFyZ3MubGV2ZWxzID0gbGV2ZWxzXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlOiBEZWJ1Z1Byb3RvY29sLlN0YWNrVHJhY2VSZXNwb25zZSA9IGF3YWl0IHRoaXMucHJvY2Vzcy5zZXNzaW9uLnN0YWNrVHJhY2Uoc3RhY2tUcmFjZUFyZ3MpXG4gICAgICBpZiAocmVzcG9uc2UgPT0gbnVsbCB8fCByZXNwb25zZS5ib2R5ID09IG51bGwpIHtcbiAgICAgICAgcmV0dXJuIFtdXG4gICAgICB9XG4gICAgICBpZiAodGhpcy5zdG9wcGVkRGV0YWlscyAhPSBudWxsKSB7XG4gICAgICAgIHRoaXMuc3RvcHBlZERldGFpbHMudG90YWxGcmFtZXMgPSByZXNwb25zZS5ib2R5LnRvdGFsRnJhbWVzXG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXNwb25zZS5ib2R5LnN0YWNrRnJhbWVzLm1hcCgocnNmLCBpbmRleCkgPT4ge1xuICAgICAgICBjb25zdCBzb3VyY2UgPSB0aGlzLnByb2Nlc3MuZ2V0U291cmNlKHJzZi5zb3VyY2UpXG5cbiAgICAgICAgcmV0dXJuIG5ldyBTdGFja0ZyYW1lKFxuICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgcnNmLmlkLFxuICAgICAgICAgIHNvdXJjZSxcbiAgICAgICAgICByc2YubmFtZSxcbiAgICAgICAgICByc2YucHJlc2VudGF0aW9uSGludCxcbiAgICAgICAgICAvLyBUaGUgVUkgaXMgMC1iYXNlZCB3aGlsZSBWU1AgaXMgMS1iYXNlZC5cbiAgICAgICAgICBuZXcgUmFuZ2UoXG4gICAgICAgICAgICBbcnNmLmxpbmUgLSAxLCAocnNmLmNvbHVtbiB8fCAxKSAtIDFdLFxuICAgICAgICAgICAgWyhyc2YuZW5kTGluZSAhPSBudWxsID8gcnNmLmVuZExpbmUgOiByc2YubGluZSkgLSAxLCAocnNmLmVuZENvbHVtbiAhPSBudWxsID8gcnNmLmVuZENvbHVtbiA6IDEpIC0gMV1cbiAgICAgICAgICApLFxuICAgICAgICAgIHN0YXJ0RnJhbWUgKyBpbmRleFxuICAgICAgICApXG4gICAgICB9KVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgaWYgKHRoaXMuc3RvcHBlZERldGFpbHMgIT0gbnVsbCkge1xuICAgICAgICB0aGlzLnN0b3BwZWREZXRhaWxzLmZyYW1lc0Vycm9yTWVzc2FnZSA9IGVyci5tZXNzYWdlXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBbXVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGV4Y2VwdGlvbiBpbmZvIHByb21pc2UgaWYgdGhlIGV4Y2VwdGlvbiB3YXMgdGhyb3duLCBvdGhlcndpc2UgbnVsbFxuICAgKi9cbiAgYXN5bmMgZXhjZXB0aW9uSW5mbygpOiBQcm9taXNlPD9JRXhjZXB0aW9uSW5mbz4ge1xuICAgIGNvbnN0IHNlc3Npb24gPSB0aGlzLnByb2Nlc3Muc2Vzc2lvblxuICAgIGlmICh0aGlzLnN0b3BwZWREZXRhaWxzID09IG51bGwgfHwgdGhpcy5zdG9wcGVkRGV0YWlscy5yZWFzb24gIT09IFwiZXhjZXB0aW9uXCIpIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICAgIGNvbnN0IHN0b3BwZWREZXRhaWxzID0gdGhpcy5zdG9wcGVkRGV0YWlsc1xuICAgIGlmICghc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNFeGNlcHRpb25JbmZvUmVxdWVzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgaWQ6IG51bGwsXG4gICAgICAgIGRldGFpbHM6IG51bGwsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBzdG9wcGVkRGV0YWlscy5kZXNjcmlwdGlvbixcbiAgICAgICAgYnJlYWtNb2RlOiBudWxsLFxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGV4Y2VwdGlvbjogRGVidWdQcm90b2NvbC5FeGNlcHRpb25JbmZvUmVzcG9uc2UgPSBhd2FpdCBzZXNzaW9uLmV4Y2VwdGlvbkluZm8oeyB0aHJlYWRJZDogdGhpcy50aHJlYWRJZCB9KVxuICAgIGlmIChleGNlcHRpb24gPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgaWQ6IGV4Y2VwdGlvbi5ib2R5LmV4Y2VwdGlvbklkLFxuICAgICAgZGVzY3JpcHRpb246IGV4Y2VwdGlvbi5ib2R5LmRlc2NyaXB0aW9uLFxuICAgICAgYnJlYWtNb2RlOiBleGNlcHRpb24uYm9keS5icmVha01vZGUsXG4gICAgICBkZXRhaWxzOiBleGNlcHRpb24uYm9keS5kZXRhaWxzLFxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIG5leHQoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX1NURVBfT1ZFUilcbiAgICBhd2FpdCB0aGlzLnByb2Nlc3Muc2Vzc2lvbi5uZXh0KHsgdGhyZWFkSWQ6IHRoaXMudGhyZWFkSWQgfSlcbiAgfVxuXG4gIGFzeW5jIHN0ZXBJbigpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfU1RFUF9JTlRPKVxuICAgIGF3YWl0IHRoaXMucHJvY2Vzcy5zZXNzaW9uLnN0ZXBJbih7IHRocmVhZElkOiB0aGlzLnRocmVhZElkIH0pXG4gIH1cblxuICBhc3luYyBzdGVwT3V0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9TVEVQX09VVClcbiAgICBhd2FpdCB0aGlzLnByb2Nlc3Muc2Vzc2lvbi5zdGVwT3V0KHsgdGhyZWFkSWQ6IHRoaXMudGhyZWFkSWQgfSlcbiAgfVxuXG4gIGFzeW5jIHN0ZXBCYWNrKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9TVEVQX0JBQ0spXG4gICAgYXdhaXQgdGhpcy5wcm9jZXNzLnNlc3Npb24uc3RlcEJhY2soeyB0aHJlYWRJZDogdGhpcy50aHJlYWRJZCB9KVxuICB9XG5cbiAgYXN5bmMgY29udGludWUoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX1NURVBfQ09OVElOVUUpXG4gICAgYXdhaXQgdGhpcy5wcm9jZXNzLnNlc3Npb24uY29udGludWUoeyB0aHJlYWRJZDogdGhpcy50aHJlYWRJZCB9KVxuICB9XG5cbiAgYXN5bmMgcGF1c2UoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX1NURVBfUEFVU0UpXG4gICAgYXdhaXQgdGhpcy5wcm9jZXNzLnNlc3Npb24ucGF1c2UoeyB0aHJlYWRJZDogdGhpcy50aHJlYWRJZCB9KVxuICB9XG5cbiAgYXN5bmMgcmV2ZXJzZUNvbnRpbnVlKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGF3YWl0IHRoaXMucHJvY2Vzcy5zZXNzaW9uLnJldmVyc2VDb250aW51ZSh7IHRocmVhZElkOiB0aGlzLnRocmVhZElkIH0pXG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIFByb2Nlc3MgaW1wbGVtZW50cyBJUHJvY2VzcyB7XG4gIF9zb3VyY2VzOiBNYXA8c3RyaW5nLCBJU291cmNlPlxuICBfdGhyZWFkczogTWFwPG51bWJlciwgVGhyZWFkPlxuICBfc2Vzc2lvbjogSVNlc3Npb24gJiBJVHJlZUVsZW1lbnRcbiAgX2NvbmZpZ3VyYXRpb246IElQcm9jZXNzQ29uZmlnXG4gIF9wZW5kaW5nU3RhcnQ6IGJvb2xlYW5cbiAgX3BlbmRpbmdTdG9wOiBib29sZWFuXG4gIGJyZWFrcG9pbnRzOiBCcmVha3BvaW50W11cbiAgZXhjZXB0aW9uQnJlYWtwb2ludHM6IElFeGNlcHRpb25CcmVha3BvaW50W11cblxuICBjb25zdHJ1Y3Rvcihjb25maWd1cmF0aW9uOiBJUHJvY2Vzc0NvbmZpZywgc2Vzc2lvbjogSVNlc3Npb24gJiBJVHJlZUVsZW1lbnQpIHtcbiAgICB0aGlzLl9jb25maWd1cmF0aW9uID0gY29uZmlndXJhdGlvblxuICAgIHRoaXMuX3Nlc3Npb24gPSBzZXNzaW9uXG4gICAgdGhpcy5fdGhyZWFkcyA9IG5ldyBNYXAoKVxuICAgIHRoaXMuX3NvdXJjZXMgPSBuZXcgTWFwKClcbiAgICB0aGlzLl9wZW5kaW5nU3RhcnQgPSB0cnVlXG4gICAgdGhpcy5fcGVuZGluZ1N0b3AgPSBmYWxzZVxuICAgIHRoaXMuYnJlYWtwb2ludHMgPSBbXVxuICAgIHRoaXMuZXhjZXB0aW9uQnJlYWtwb2ludHMgPSBbXVxuICB9XG5cbiAgZ2V0IHNvdXJjZXMoKTogTWFwPHN0cmluZywgSVNvdXJjZT4ge1xuICAgIHJldHVybiB0aGlzLl9zb3VyY2VzXG4gIH1cblxuICBnZXQgc2Vzc2lvbigpOiBJU2Vzc2lvbiAmIElUcmVlRWxlbWVudCB7XG4gICAgcmV0dXJuIHRoaXMuX3Nlc3Npb25cbiAgfVxuXG4gIGdldCBjb25maWd1cmF0aW9uKCk6IElQcm9jZXNzQ29uZmlnIHtcbiAgICByZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblxuICB9XG5cbiAgZ2V0IGRlYnVnZ2VyTW9kZSgpOiBEZWJ1Z2dlck1vZGVUeXBlIHtcbiAgICBpZiAodGhpcy5fcGVuZGluZ1N0YXJ0KSB7XG4gICAgICByZXR1cm4gRGVidWdnZXJNb2RlLlNUQVJUSU5HXG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX3BlbmRpbmdTdG9wKSB7XG4gICAgICByZXR1cm4gRGVidWdnZXJNb2RlLlNUT1BQSU5HXG4gICAgfVxuXG4gICAgaWYgKHRoaXMuZ2V0QWxsVGhyZWFkcygpLnNvbWUoKHQpID0+IHQuc3RvcHBlZCkpIHtcbiAgICAgIC8vIFRPT0Q6IEN1cnJlbnRseSBvdXIgVVggY29udHJvbHMgc3VwcG9ydCByZXN1bWUgYW5kIGFzeW5jLWJyZWFrXG4gICAgICAvLyBvbiBhIHBlci1wcm9jZXNzIGJhc2lzIG9ubHkuIFRoaXMgbmVlZHMgdG8gYmUgbW9kaWZpZWQgaGVyZSBpZlxuICAgICAgLy8gd2UgYWRkIHN1cHBvcnQgZm9yIGZyZWV6aW5nIGFuZCByZXN1bWluZyBpbmRpdmlkdWFsIHRocmVhZHMuXG4gICAgICByZXR1cm4gRGVidWdnZXJNb2RlLlBBVVNFRFxuICAgIH1cblxuICAgIHJldHVybiBEZWJ1Z2dlck1vZGUuUlVOTklOR1xuICB9XG5cbiAgY2xlYXJQcm9jZXNzU3RhcnRpbmdGbGFnKCk6IHZvaWQge1xuICAgIHRoaXMuX3BlbmRpbmdTdGFydCA9IGZhbHNlXG4gIH1cblxuICBzZXRTdG9wUGVuZGluZygpOiB2b2lkIHtcbiAgICB0aGlzLl9wZW5kaW5nU3RvcCA9IHRydWVcbiAgfVxuXG4gIGdldFNvdXJjZShyYXc6ID9EZWJ1Z1Byb3RvY29sLlNvdXJjZSk6IElTb3VyY2Uge1xuICAgIGxldCBzb3VyY2UgPSBuZXcgU291cmNlKHJhdywgdGhpcy5nZXRJZCgpKVxuICAgIGlmICh0aGlzLl9zb3VyY2VzLmhhcyhzb3VyY2UudXJpKSkge1xuICAgICAgc291cmNlID0gbnVsbHRocm93cyh0aGlzLl9zb3VyY2VzLmdldChzb3VyY2UudXJpKSlcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5fc291cmNlcy5zZXQoc291cmNlLnVyaSwgc291cmNlKVxuICAgIH1cblxuICAgIHJldHVybiBzb3VyY2VcbiAgfVxuXG4gIGdldFRocmVhZCh0aHJlYWRJZDogbnVtYmVyKTogP1RocmVhZCB7XG4gICAgcmV0dXJuIHRoaXMuX3RocmVhZHMuZ2V0KHRocmVhZElkKVxuICB9XG5cbiAgZ2V0QWxsVGhyZWFkcygpOiBJVGhyZWFkW10ge1xuICAgIHJldHVybiBBcnJheS5mcm9tKHRoaXMuX3RocmVhZHMudmFsdWVzKCkpXG4gIH1cblxuICBnZXRJZCgpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLl9zZXNzaW9uLmdldElkKClcbiAgfVxuXG4gIHJhd1N0b3BwZWRVcGRhdGUoZGF0YTogSVJhd1N0b3BwcGVkVXBkYXRlKTogdm9pZCB7XG4gICAgY29uc3QgeyB0aHJlYWRJZCwgc3RvcHBlZERldGFpbHMgfSA9IGRhdGFcblxuICAgIHRoaXMuY2xlYXJQcm9jZXNzU3RhcnRpbmdGbGFnKClcblxuICAgIGlmICh0aHJlYWRJZCAhPSBudWxsICYmICF0aGlzLl90aHJlYWRzLmhhcyh0aHJlYWRJZCkpIHtcbiAgICAgIC8vIFdlJ3JlIGJlaW5nIGFza2VkIHRvIHVwZGF0ZSBhIHRocmVhZCB3ZSBoYXZlbid0IHNlZW4geWV0LCBzb1xuICAgICAgLy8gY3JlYXRlIGl0XG4gICAgICBjb25zdCB0aHJlYWQgPSBuZXcgVGhyZWFkKHRoaXMsIGBUaHJlYWQgJHt0aHJlYWRJZH1gLCB0aHJlYWRJZClcbiAgICAgIHRoaXMuX3RocmVhZHMuc2V0KHRocmVhZElkLCB0aHJlYWQpXG4gICAgfVxuXG4gICAgLy8gU2V0IHRoZSBhdmFpbGFiaWxpdHkgb2YgdGhlIHRocmVhZHMnIGNhbGxzdGFja3MgZGVwZW5kaW5nIG9uXG4gICAgLy8gd2hldGhlciB0aGUgdGhyZWFkIGlzIHN0b3BwZWQgb3Igbm90XG4gICAgaWYgKHN0b3BwZWREZXRhaWxzLmFsbFRocmVhZHNTdG9wcGVkKSB7XG4gICAgICB0aGlzLl90aHJlYWRzLmZvckVhY2goKHRocmVhZCkgPT4ge1xuICAgICAgICB0aHJlYWQuc3RvcHBlZERldGFpbHMgPSB0aHJlYWQudGhyZWFkSWQgPT09IHRocmVhZElkID8gc3RvcHBlZERldGFpbHMgOiB0aHJlYWQuc3RvcHBlZERldGFpbHNcbiAgICAgICAgdGhyZWFkLnN0b3BwZWQgPSB0cnVlXG4gICAgICAgIHRocmVhZC5jbGVhckNhbGxTdGFjaygpXG4gICAgICB9KVxuICAgIH0gZWxzZSBpZiAodGhyZWFkSWQgIT0gbnVsbCkge1xuICAgICAgLy8gT25lIHRocmVhZCBpcyBzdG9wcGVkLCBvbmx5IHVwZGF0ZSB0aGF0IHRocmVhZC5cbiAgICAgIGNvbnN0IHRocmVhZCA9IG51bGx0aHJvd3ModGhpcy5fdGhyZWFkcy5nZXQodGhyZWFkSWQpKVxuICAgICAgdGhyZWFkLnN0b3BwZWREZXRhaWxzID0gc3RvcHBlZERldGFpbHNcbiAgICAgIHRocmVhZC5jbGVhckNhbGxTdGFjaygpXG4gICAgICB0aHJlYWQuc3RvcHBlZCA9IHRydWVcbiAgICB9XG4gIH1cblxuICByYXdUaHJlYWRVcGRhdGUoZGF0YTogSVJhd1RocmVhZFVwZGF0ZSk6IHZvaWQge1xuICAgIGNvbnN0IHsgdGhyZWFkIH0gPSBkYXRhXG5cbiAgICB0aGlzLmNsZWFyUHJvY2Vzc1N0YXJ0aW5nRmxhZygpXG5cbiAgICBpZiAoIXRoaXMuX3RocmVhZHMuaGFzKHRocmVhZC5pZCkpIHtcbiAgICAgIC8vIEEgbmV3IHRocmVhZCBjYW1lIGluLCBpbml0aWFsaXplIGl0LlxuICAgICAgdGhpcy5fdGhyZWFkcy5zZXQodGhyZWFkLmlkLCBuZXcgVGhyZWFkKHRoaXMsIHRocmVhZC5uYW1lLCB0aHJlYWQuaWQpKVxuICAgIH0gZWxzZSBpZiAodGhyZWFkLm5hbWUpIHtcbiAgICAgIC8vIEp1c3QgdGhlIHRocmVhZCBuYW1lIGdvdCB1cGRhdGVkICMxODI0NFxuICAgICAgbnVsbHRocm93cyh0aGlzLl90aHJlYWRzLmdldCh0aHJlYWQuaWQpKS5uYW1lID0gdGhyZWFkLm5hbWVcbiAgICB9XG4gIH1cblxuICBjbGVhclRocmVhZHMocmVtb3ZlVGhyZWFkczogYm9vbGVhbiwgcmVmZXJlbmNlPzogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKHJlZmVyZW5jZSAhPSBudWxsKSB7XG4gICAgICBpZiAodGhpcy5fdGhyZWFkcy5oYXMocmVmZXJlbmNlKSkge1xuICAgICAgICBjb25zdCB0aHJlYWQgPSBudWxsdGhyb3dzKHRoaXMuX3RocmVhZHMuZ2V0KHJlZmVyZW5jZSkpXG4gICAgICAgIHRocmVhZC5jbGVhckNhbGxTdGFjaygpXG4gICAgICAgIHRocmVhZC5zdG9wcGVkRGV0YWlscyA9IG51bGxcbiAgICAgICAgdGhyZWFkLnN0b3BwZWQgPSBmYWxzZVxuXG4gICAgICAgIGlmIChyZW1vdmVUaHJlYWRzKSB7XG4gICAgICAgICAgdGhpcy5fdGhyZWFkcy5kZWxldGUocmVmZXJlbmNlKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3RocmVhZHMuZm9yRWFjaCgodGhyZWFkKSA9PiB7XG4gICAgICAgIHRocmVhZC5jbGVhckNhbGxTdGFjaygpXG4gICAgICAgIHRocmVhZC5zdG9wcGVkRGV0YWlscyA9IG51bGxcbiAgICAgICAgdGhyZWFkLnN0b3BwZWQgPSBmYWxzZVxuICAgICAgfSlcblxuICAgICAgaWYgKHJlbW92ZVRocmVhZHMpIHtcbiAgICAgICAgdGhpcy5fdGhyZWFkcy5jbGVhcigpXG4gICAgICAgIEV4cHJlc3Npb25Db250YWluZXIuYWxsVmFsdWVzLmNsZWFyKClcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBhc3luYyBjb21wbGV0aW9ucyhcbiAgICBmcmFtZUlkOiBudW1iZXIsXG4gICAgdGV4dDogc3RyaW5nLFxuICAgIHBvc2l0aW9uOiBhdG9tJFBvaW50LFxuICAgIG92ZXJ3cml0ZUJlZm9yZTogbnVtYmVyXG4gICk6IFByb21pc2U8QXJyYXk8RGVidWdQcm90b2NvbC5Db21wbGV0aW9uSXRlbT4+IHtcbiAgICBpZiAoIXRoaXMuX3Nlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzQ29tcGxldGlvbnNSZXF1ZXN0KSB7XG4gICAgICByZXR1cm4gW11cbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fc2Vzc2lvbi5jb21wbGV0aW9ucyh7XG4gICAgICAgIGZyYW1lSWQsXG4gICAgICAgIHRleHQsXG4gICAgICAgIGNvbHVtbjogcG9zaXRpb24uY29sdW1uLFxuICAgICAgICBsaW5lOiBwb3NpdGlvbi5yb3csXG4gICAgICB9KVxuICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLmJvZHkgJiYgcmVzcG9uc2UuYm9keS50YXJnZXRzKSB7XG4gICAgICAgIHJldHVybiByZXNwb25zZS5ib2R5LnRhcmdldHNcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBbXVxuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICByZXR1cm4gW11cbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEJyZWFrcG9pbnQgaW1wbGVtZW50cyBJQnJlYWtwb2ludCB7XG4gIHZlcmlmaWVkOiBib29sZWFuXG4gIGlkRnJvbUFkYXB0ZXI6ID9udW1iZXJcbiAgdWlCcmVha3BvaW50SWQ6IHN0cmluZ1xuICB1cmk6IHN0cmluZ1xuICBsaW5lOiBudW1iZXJcbiAgb3JpZ2luYWxMaW5lOiBudW1iZXJcbiAgY29sdW1uOiBudW1iZXJcbiAgZW5hYmxlZDogYm9vbGVhblxuICBjb25kaXRpb246ID9zdHJpbmdcbiAgbG9nTWVzc2FnZTogP3N0cmluZ1xuICBhZGFwdGVyRGF0YTogYW55XG4gIGhpdENvdW50OiA/bnVtYmVyXG5cbiAgY29uc3RydWN0b3IoXG4gICAgdWlCcmVha3BvaW50SWQ6IHN0cmluZyxcbiAgICB1cmk6IHN0cmluZyxcbiAgICBsaW5lOiBudW1iZXIsXG4gICAgY29sdW1uOiBudW1iZXIsXG4gICAgZW5hYmxlZDogYm9vbGVhbixcbiAgICBjb25kaXRpb246ID9zdHJpbmcsXG4gICAgbG9nTWVzc2FnZTogP3N0cmluZyxcbiAgICBhZGFwdGVyRGF0YT86IGFueVxuICApIHtcbiAgICB0aGlzLnVyaSA9IHVyaVxuICAgIHRoaXMubGluZSA9IGxpbmVcbiAgICB0aGlzLm9yaWdpbmFsTGluZSA9IGxpbmVcbiAgICB0aGlzLmNvbHVtbiA9IGNvbHVtblxuICAgIHRoaXMuZW5hYmxlZCA9IGVuYWJsZWRcbiAgICB0aGlzLmNvbmRpdGlvbiA9IGNvbmRpdGlvblxuICAgIHRoaXMuYWRhcHRlckRhdGEgPSBhZGFwdGVyRGF0YVxuICAgIHRoaXMudmVyaWZpZWQgPSBmYWxzZVxuICAgIHRoaXMudWlCcmVha3BvaW50SWQgPSB1aUJyZWFrcG9pbnRJZFxuICAgIHRoaXMuaGl0Q291bnQgPSBudWxsXG5cbiAgICBpZiAoY29uZGl0aW9uICE9IG51bGwgJiYgY29uZGl0aW9uLnRyaW0oKSAhPT0gXCJcIikge1xuICAgICAgdGhpcy5jb25kaXRpb24gPSBjb25kaXRpb25cbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5jb25kaXRpb24gPSBudWxsXG4gICAgfVxuICAgIGlmIChsb2dNZXNzYWdlICE9IG51bGwgJiYgbG9nTWVzc2FnZS50cmltKCkgIT09IFwiXCIpIHtcbiAgICAgIHRoaXMubG9nTWVzc2FnZSA9IGxvZ01lc3NhZ2VcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5sb2dNZXNzYWdlID0gbnVsbFxuICAgIH1cbiAgfVxuXG4gIGdldElkKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHRoaXMudWlCcmVha3BvaW50SWRcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRnVuY3Rpb25CcmVha3BvaW50IGltcGxlbWVudHMgSUZ1bmN0aW9uQnJlYWtwb2ludCB7XG4gIGlkOiBzdHJpbmdcbiAgdmVyaWZpZWQ6IGJvb2xlYW5cbiAgaWRGcm9tQWRhcHRlcjogP251bWJlclxuICBuYW1lOiBzdHJpbmdcbiAgZW5hYmxlZDogYm9vbGVhblxuICBoaXRDb25kaXRpb246ID9zdHJpbmdcbiAgY29uZGl0aW9uOiA/c3RyaW5nXG5cbiAgY29uc3RydWN0b3IobmFtZTogc3RyaW5nLCBlbmFibGVkOiBib29sZWFuLCBoaXRDb25kaXRpb246ID9zdHJpbmcpIHtcbiAgICB0aGlzLm5hbWUgPSBuYW1lXG4gICAgdGhpcy5lbmFibGVkID0gZW5hYmxlZFxuICAgIHRoaXMuaGl0Q29uZGl0aW9uID0gaGl0Q29uZGl0aW9uXG4gICAgdGhpcy5jb25kaXRpb24gPSBudWxsXG4gICAgdGhpcy52ZXJpZmllZCA9IGZhbHNlXG4gICAgdGhpcy5pZEZyb21BZGFwdGVyID0gbnVsbFxuICAgIHRoaXMuaWQgPSB1dWlkLnY0KClcbiAgfVxuXG4gIGdldElkKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHRoaXMuaWRcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgRXhjZXB0aW9uQnJlYWtwb2ludCBpbXBsZW1lbnRzIElFeGNlcHRpb25CcmVha3BvaW50IHtcbiAgX2lkOiBzdHJpbmdcbiAgK2ZpbHRlcjogc3RyaW5nXG4gICtsYWJlbDogc3RyaW5nXG4gIGVuYWJsZWQ6IGJvb2xlYW5cblxuICBjb25zdHJ1Y3RvcihmaWx0ZXI6IHN0cmluZywgbGFiZWw6IHN0cmluZywgZW5hYmxlZDogP2Jvb2xlYW4pIHtcbiAgICB0aGlzLmZpbHRlciA9IGZpbHRlclxuICAgIHRoaXMubGFiZWwgPSBsYWJlbFxuICAgIHRoaXMuZW5hYmxlZCA9IGVuYWJsZWQgPT0gbnVsbCA/IGZhbHNlIDogZW5hYmxlZFxuICAgIHRoaXMuX2lkID0gdXVpZC52NCgpXG4gIH1cblxuICBnZXRJZCgpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLl9pZFxuICB9XG59XG5cbmNvbnN0IEJSRUFLUE9JTlRTX0NIQU5HRUQgPSBcIkJSRUFLUE9JTlRTX0NIQU5HRURcIlxuY29uc3QgV0FUQ0hfRVhQUkVTU0lPTlNfQ0hBTkdFRCA9IFwiV0FUQ0hfRVhQUkVTU0lPTlNfQ0hBTkdFRFwiXG5cbmNvbnN0IENBTExTVEFDS19DSEFOR0VEID0gXCJDQUxMU1RBQ0tfQ0hBTkdFRFwiXG5jb25zdCBQUk9DRVNTRVNfQ0hBTkdFRCA9IFwiUFJPQ0VTU0VTX0NIQU5HRURcIlxuXG50eXBlIGdldEZvY3VzZWRQcm9jZXNzQ2FsbGJhY2sgPSAoKSA9PiA/SVByb2Nlc3NcblxudHlwZSBTeW5jT3B0aW9ucyA9IHtcbiAgZmlyZUV2ZW50OiBib29sZWFuLFxufVxuXG5leHBvcnQgY2xhc3MgTW9kZWwgaW1wbGVtZW50cyBJTW9kZWwge1xuICBfcHJvY2Vzc2VzOiBQcm9jZXNzW11cbiAgX3VpQnJlYWtwb2ludHM6IElVSUJyZWFrcG9pbnRbXVxuICBfYnJlYWtwb2ludHNBY3RpdmF0ZWQ6IGJvb2xlYW5cbiAgX2Z1bmN0aW9uQnJlYWtwb2ludHM6IEZ1bmN0aW9uQnJlYWtwb2ludFtdXG4gIF93YXRjaEV4cHJlc3Npb25zOiBFeHByZXNzaW9uW11cbiAgX2Rpc3Bvc2FibGVzOiBVbml2ZXJzYWxEaXNwb3NhYmxlXG4gIF9lbWl0dGVyOiBFbWl0dGVyXG4gIF9nZXRGb2N1c2VkUHJvY2VzczogZ2V0Rm9jdXNlZFByb2Nlc3NDYWxsYmFja1xuXG4gIC8vIEV4Y2VwdGlvbiBicmVha3BvaW50IGZpbHRlcnMgYXJlIGRpZmZlcmVudCBmb3IgZWFjaCBkZWJ1Z2dlciBiYWNrLWVuZCwgc28gdGhleVxuICAvLyBhcmUgcHJvY2Vzcy1zcGVjaWZpYy4gSG93ZXZlciwgd2hlbiB3ZSdyZSBub3QgZGVidWdnaW5nLCBpZGVhbGx5IHdlJ2Qgd2FudCB0byBzdGlsbFxuICAvLyBzaG93IGZpbHRlcnMgc28gdGhhdCBhIHVzZXIgY2FuIHNldCBicmVhayBvbiBleGNlcHRpb24gYmVmb3JlIHN0YXJ0aW5nIGRlYnVnZ2luZywgdG9cbiAgLy8gZW5hYmxlIGJyZWFraW5nIG9uIGVhcmx5IGV4Y2VwdGlvbnMgYXMgdGhlIHRhcmdldCBzdGFydHMuIEZvciB0aGlzIHJlYXNvbiwgd2UgY2FjaGVcbiAgLy8gd2hhdGV2ZXIgb3B0aW9ucyB0aGUgbW9zdCByZWNlbnRseSBmb2N1c2VkIHByb2Nlc3Mgb2ZmZXJlZCwgYW5kIG9mZmVyIHRob3NlLlxuICBfbW9zdFJlY2VudEV4Y2VwdGlvbkJyZWFrcG9pbnRzOiBJRXhjZXB0aW9uQnJlYWtwb2ludFtdXG5cbiAgY29uc3RydWN0b3IoXG4gICAgdWlCcmVha3BvaW50czogSVVJQnJlYWtwb2ludFtdLFxuICAgIGJyZWFrcG9pbnRzQWN0aXZhdGVkOiBib29sZWFuLFxuICAgIGZ1bmN0aW9uQnJlYWtwb2ludHM6IEZ1bmN0aW9uQnJlYWtwb2ludFtdLFxuICAgIGV4Y2VwdGlvbkJyZWFrcG9pbnRzOiBFeGNlcHRpb25CcmVha3BvaW50W10sXG4gICAgd2F0Y2hFeHByZXNzaW9uczogRXhwcmVzc2lvbltdLFxuICAgIGdldEZvY3VzZWRQcm9jZXNzOiBnZXRGb2N1c2VkUHJvY2Vzc0NhbGxiYWNrXG4gICkge1xuICAgIHRoaXMuX3Byb2Nlc3NlcyA9IFtdXG4gICAgdGhpcy5fdWlCcmVha3BvaW50cyA9IHVpQnJlYWtwb2ludHNcbiAgICB0aGlzLl9icmVha3BvaW50c0FjdGl2YXRlZCA9IGJyZWFrcG9pbnRzQWN0aXZhdGVkXG4gICAgdGhpcy5fZnVuY3Rpb25CcmVha3BvaW50cyA9IGZ1bmN0aW9uQnJlYWtwb2ludHNcbiAgICB0aGlzLl9tb3N0UmVjZW50RXhjZXB0aW9uQnJlYWtwb2ludHMgPSAoKGV4Y2VwdGlvbkJyZWFrcG9pbnRzOiBhbnkpOiBJRXhjZXB0aW9uQnJlYWtwb2ludFtdKVxuICAgIHRoaXMuX3dhdGNoRXhwcmVzc2lvbnMgPSB3YXRjaEV4cHJlc3Npb25zXG4gICAgdGhpcy5fZ2V0Rm9jdXNlZFByb2Nlc3MgPSBnZXRGb2N1c2VkUHJvY2Vzc1xuICAgIHRoaXMuX2VtaXR0ZXIgPSBuZXcgRW1pdHRlcigpXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSh0aGlzLl9lbWl0dGVyKVxuICB9XG5cbiAgZ2V0SWQoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gXCJyb290XCJcbiAgfVxuXG4gIGdldFByb2Nlc3NlcygpOiBJUHJvY2Vzc1tdIHtcbiAgICByZXR1cm4gKHRoaXMuX3Byb2Nlc3NlczogYW55KVxuICB9XG5cbiAgYWRkUHJvY2Vzcyhjb25maWd1cmF0aW9uOiBJUHJvY2Vzc0NvbmZpZywgc2Vzc2lvbjogSVNlc3Npb24gJiBJVHJlZUVsZW1lbnQpOiBQcm9jZXNzIHtcbiAgICBjb25zdCBwcm9jZXNzID0gbmV3IFByb2Nlc3MoY29uZmlndXJhdGlvbiwgc2Vzc2lvbilcblxuICAgIC8vIEFkZCBicmVha3BvaW50cyB0byBwcm9jZXNzLlxuICAgIGNvbnN0IHByb2Nlc3NCcmVha3BvaW50cyA9IHByb2Nlc3MuYnJlYWtwb2ludHNcbiAgICBmb3IgKGNvbnN0IHVpQnAgb2YgdGhpcy5fdWlCcmVha3BvaW50cykge1xuICAgICAgcHJvY2Vzc0JyZWFrcG9pbnRzLnB1c2goXG4gICAgICAgIG5ldyBCcmVha3BvaW50KHVpQnAuaWQsIHVpQnAudXJpLCB1aUJwLmxpbmUsIHVpQnAuY29sdW1uLCB1aUJwLmVuYWJsZWQsIHVpQnAuY29uZGl0aW9uLCB1aUJwLmxvZ01lc3NhZ2UpXG4gICAgICApXG4gICAgfVxuXG4gICAgdGhpcy5fcHJvY2Vzc2VzLnB1c2gocHJvY2VzcylcbiAgICB0aGlzLl9lbWl0dGVyLmVtaXQoUFJPQ0VTU0VTX0NIQU5HRUQpXG4gICAgcmV0dXJuIHByb2Nlc3NcbiAgfVxuXG4gIHJlbW92ZVByb2Nlc3MoaWQ6IHN0cmluZyk6IEFycmF5PFByb2Nlc3M+IHtcbiAgICBjb25zdCByZW1vdmVkUHJvY2Vzc2VzID0gW11cbiAgICB0aGlzLl9wcm9jZXNzZXMgPSB0aGlzLl9wcm9jZXNzZXMuZmlsdGVyKChwKSA9PiB7XG4gICAgICBpZiAocC5nZXRJZCgpID09PSBpZCkge1xuICAgICAgICByZW1vdmVkUHJvY2Vzc2VzLnB1c2gocClcbiAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfVxuICAgIH0pXG4gICAgdGhpcy5fZW1pdHRlci5lbWl0KFBST0NFU1NFU19DSEFOR0VEKVxuXG4gICAgaWYgKHJlbW92ZWRQcm9jZXNzZXMubGVuZ3RoID4gMCkge1xuICAgICAgdGhpcy5fbW9zdFJlY2VudEV4Y2VwdGlvbkJyZWFrcG9pbnRzID0gcmVtb3ZlZFByb2Nlc3Nlc1swXS5leGNlcHRpb25CcmVha3BvaW50c1xuICAgIH1cbiAgICByZXR1cm4gcmVtb3ZlZFByb2Nlc3Nlc1xuICB9XG5cbiAgb25EaWRDaGFuZ2VCcmVha3BvaW50cyhjYWxsYmFjazogKCkgPT4gbWl4ZWQpOiBJRGlzcG9zYWJsZSB7XG4gICAgcmV0dXJuIHRoaXMuX2VtaXR0ZXIub24oQlJFQUtQT0lOVFNfQ0hBTkdFRCwgY2FsbGJhY2spXG4gIH1cblxuICAvLyBUT0RPOiBTY29wZSB0aGlzIHNvIHRoYXQgb25seSB0aGUgdHJlZSBub2RlcyBmb3IgdGhlIHByb2Nlc3MgdGhhdFxuICAvLyBoYWQgYSBjYWxsIHN0YWNrIGNoYW5nZSBuZWVkIHRvIHJlLXJlbmRlclxuICBvbkRpZENoYW5nZUNhbGxTdGFjayhjYWxsYmFjazogKCkgPT4gbWl4ZWQpOiBJRGlzcG9zYWJsZSB7XG4gICAgcmV0dXJuIHRoaXMuX2VtaXR0ZXIub24oQ0FMTFNUQUNLX0NIQU5HRUQsIGNhbGxiYWNrKVxuICB9XG5cbiAgb25EaWRDaGFuZ2VQcm9jZXNzZXMoY2FsbGJhY2s6ICgpID0+IG1peGVkKTogSURpc3Bvc2FibGUge1xuICAgIHJldHVybiB0aGlzLl9lbWl0dGVyLm9uKFBST0NFU1NFU19DSEFOR0VELCBjYWxsYmFjaylcbiAgfVxuXG4gIG9uRGlkQ2hhbmdlV2F0Y2hFeHByZXNzaW9ucyhjYWxsYmFjazogKGV4cHJlc3Npb246ID9JRXhwcmVzc2lvbikgPT4gbWl4ZWQpOiBJRGlzcG9zYWJsZSB7XG4gICAgcmV0dXJuIHRoaXMuX2VtaXR0ZXIub24oV0FUQ0hfRVhQUkVTU0lPTlNfQ0hBTkdFRCwgY2FsbGJhY2spXG4gIH1cblxuICByYXdVcGRhdGUoZGF0YTogSVJhd01vZGVsVXBkYXRlKTogdm9pZCB7XG4gICAgY29uc3QgcHJvY2VzcyA9IHRoaXMuX3Byb2Nlc3Nlcy5maWx0ZXIoKHApID0+IHAuZ2V0SWQoKSA9PT0gZGF0YS5zZXNzaW9uSWQpLnBvcCgpXG4gICAgaWYgKHByb2Nlc3MgPT0gbnVsbCkge1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIGlmIChkYXRhLnN0b3BwZWREZXRhaWxzICE9IG51bGwpIHtcbiAgICAgIHByb2Nlc3MucmF3U3RvcHBlZFVwZGF0ZSgoZGF0YTogYW55KSlcbiAgICB9IGVsc2Uge1xuICAgICAgcHJvY2Vzcy5yYXdUaHJlYWRVcGRhdGUoKGRhdGE6IGFueSkpXG4gICAgfVxuXG4gICAgdGhpcy5fZW1pdHRlci5lbWl0KENBTExTVEFDS19DSEFOR0VEKVxuICB9XG5cbiAgY2xlYXJUaHJlYWRzKGlkOiBzdHJpbmcsIHJlbW92ZVRocmVhZHM6IGJvb2xlYW4sIHJlZmVyZW5jZT86IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IHByb2Nlc3MgPSB0aGlzLl9wcm9jZXNzZXMuZmlsdGVyKChwKSA9PiBwLmdldElkKCkgPT09IGlkKS5wb3AoKVxuXG4gICAgaWYgKHByb2Nlc3MgIT0gbnVsbCkge1xuICAgICAgcHJvY2Vzcy5jbGVhclRocmVhZHMocmVtb3ZlVGhyZWFkcywgcmVmZXJlbmNlKVxuICAgICAgdGhpcy5fZW1pdHRlci5lbWl0KENBTExTVEFDS19DSEFOR0VEKVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHJlZnJlc2hDYWxsU3RhY2sodGhyZWFkSTogSVRocmVhZCwgZmV0Y2hBbGxGcmFtZXM6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCB0aHJlYWQ6IFRocmVhZCA9ICh0aHJlYWRJOiBhbnkpXG5cbiAgICAvLyBJZiB0aGUgZGVidWdnZXIgc3VwcG9ydHMgZGVsYXllZCBzdGFjayB0cmFjZSBsb2FkaW5nLCBsb2FkIG9ubHlcbiAgICAvLyB0aGUgZmlyc3QgY2FsbCBzdGFjayBmcmFtZSwgd2hpY2ggaXMgbmVlZGVkIHRvIGRpc3BsYXkgaW4gdGhlIHRocmVhZHNcbiAgICAvLyB2aWV3LiBXZSB3aWxsIGxhemlseSBsb2FkIHRoZSByZW1haW5pbmcgZnJhbWVzIG9ubHkgZm9yIHRocmVhZHMgdGhhdFxuICAgIC8vIGFyZSB2aXNpYmxlIGluIHRoZSBVSSwgYWxsb3dpbmcgdXMgdG8gc2tpcCBsb2FkaW5nIGZyYW1lcyB3ZSBkb24ndFxuICAgIC8vIG5lZWQgcmlnaHQgbm93LlxuICAgIGNvbnN0IGZyYW1lc1RvTG9hZCA9XG4gICAgICBudWxsdGhyb3dzKHRocmVhZC5wcm9jZXNzKS5zZXNzaW9uLmNhcGFiaWxpdGllcy5zdXBwb3J0c0RlbGF5ZWRTdGFja1RyYWNlTG9hZGluZyAmJiAhZmV0Y2hBbGxGcmFtZXMgPyAxIDogbnVsbFxuXG4gICAgdGhyZWFkLmNsZWFyQ2FsbFN0YWNrKClcbiAgICBhd2FpdCB0aHJlYWQucmVmcmVzaENhbGxTdGFjayhmcmFtZXNUb0xvYWQpXG4gICAgdGhpcy5fZW1pdHRlci5lbWl0KENBTExTVEFDS19DSEFOR0VEKVxuICB9XG5cbiAgZ2V0VUlCcmVha3BvaW50cygpOiBJVUlCcmVha3BvaW50W10ge1xuICAgIHJldHVybiB0aGlzLl91aUJyZWFrcG9pbnRzXG4gIH1cblxuICBnZXRCcmVha3BvaW50cygpOiBJQnJlYWtwb2ludFtdIHtcbiAgICAvLyBJZiB3ZSdyZSBjdXJyZW50bHkgZGVidWdnaW5nLCByZXR1cm4gdGhlIGJyZWFrcG9pbnRzIGFzIHRoZSBjdXJyZW50XG4gICAgLy8gZGVidWcgYWRhcHRlciBzZWVzIHRoZW0uXG4gICAgY29uc3QgZm9jdXNlZFByb2Nlc3MgPSB0aGlzLl9nZXRGb2N1c2VkUHJvY2VzcygpXG4gICAgaWYgKGZvY3VzZWRQcm9jZXNzICE9IG51bGwpIHtcbiAgICAgIGNvbnN0IGN1cnJlbnRQcm9jZXNzID0gdGhpcy5fcHJvY2Vzc2VzLmZpbmQoKHApID0+IHAuZ2V0SWQoKSA9PT0gZm9jdXNlZFByb2Nlc3MuZ2V0SWQoKSlcbiAgICAgIGlmIChjdXJyZW50UHJvY2VzcyAhPSBudWxsKSB7XG4gICAgICAgIHJldHVybiAoY3VycmVudFByb2Nlc3MuYnJlYWtwb2ludHM6IGFueSlcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBPdGhlcndpc2UsIHJldHVybiB0aGUgVUkgYnJlYWtwb2ludHMuIFNpbmNlIHRoZXJlIGlzIG5vIGRlYnVnIHByb2Nlc3MsXG4gICAgLy8gdGhlIGJyZWFrcG9pbnRzIGhhdmUgdGhlaXIgb3JpZ2luYWwgbGluZSBsb2NhdGlvbiBhbmQgbm8gbm90aW9uIG9mXG4gICAgLy8gdmVyaWZpZWQgdnMgbm90LlxuICAgIHJldHVybiB0aGlzLl91aUJyZWFrcG9pbnRzLm1hcCgodWlCcCkgPT4ge1xuICAgICAgY29uc3QgYnAgPSBuZXcgQnJlYWtwb2ludChcbiAgICAgICAgdWlCcC5pZCxcbiAgICAgICAgdWlCcC51cmksXG4gICAgICAgIHVpQnAubGluZSxcbiAgICAgICAgdWlCcC5jb2x1bW4sXG4gICAgICAgIHVpQnAuZW5hYmxlZCxcbiAgICAgICAgdWlCcC5jb25kaXRpb24sXG4gICAgICAgIHVpQnAubG9nTWVzc2FnZVxuICAgICAgKVxuICAgICAgYnAudmVyaWZpZWQgPSB0cnVlXG4gICAgICByZXR1cm4gYnBcbiAgICB9KVxuICB9XG5cbiAgZ2V0QnJlYWtwb2ludEF0TGluZSh1cmk6IHN0cmluZywgbGluZTogbnVtYmVyKTogP0lCcmVha3BvaW50IHtcbiAgICBsZXQgYnJlYWtwb2ludCA9IHRoaXMuZ2V0QnJlYWtwb2ludHMoKS5maW5kKChicCkgPT4gYnAudXJpID09PSB1cmkgJiYgYnAubGluZSA9PT0gbGluZSlcbiAgICBpZiAoYnJlYWtwb2ludCA9PSBudWxsKSB7XG4gICAgICBicmVha3BvaW50ID0gdGhpcy5nZXRCcmVha3BvaW50cygpLmZpbmQoKGJwKSA9PiBicC51cmkgPT09IHVyaSAmJiBicC5vcmlnaW5hbExpbmUgPT09IGxpbmUpXG4gICAgfVxuICAgIHJldHVybiBicmVha3BvaW50XG4gIH1cblxuICBnZXRCcmVha3BvaW50QnlJZChpZDogc3RyaW5nKTogP0lCcmVha3BvaW50IHtcbiAgICByZXR1cm4gdGhpcy5nZXRCcmVha3BvaW50cygpLmZpbmQoKGJwKSA9PiBicC5nZXRJZCgpID09PSBpZClcbiAgfVxuXG4gIGdldEZ1bmN0aW9uQnJlYWtwb2ludHMoKTogSUZ1bmN0aW9uQnJlYWtwb2ludFtdIHtcbiAgICByZXR1cm4gKHRoaXMuX2Z1bmN0aW9uQnJlYWtwb2ludHM6IGFueSlcbiAgfVxuXG4gIGdldEV4Y2VwdGlvbkJyZWFrcG9pbnRzKCk6IElFeGNlcHRpb25CcmVha3BvaW50W10ge1xuICAgIGNvbnN0IGZvY3VzZWRQcm9jZXNzID0gdGhpcy5fZ2V0Rm9jdXNlZFByb2Nlc3MoKVxuICAgIGlmIChmb2N1c2VkUHJvY2VzcyAhPSBudWxsKSB7XG4gICAgICByZXR1cm4gKGZvY3VzZWRQcm9jZXNzLmV4Y2VwdGlvbkJyZWFrcG9pbnRzOiBhbnkpXG4gICAgfVxuICAgIHJldHVybiAodGhpcy5fbW9zdFJlY2VudEV4Y2VwdGlvbkJyZWFrcG9pbnRzOiBhbnkpXG4gIH1cblxuICBzZXRFeGNlcHRpb25CcmVha3BvaW50cyhwcm9jZXNzOiBJUHJvY2VzcywgZGF0YTogRGVidWdQcm90b2NvbC5FeGNlcHRpb25CcmVha3BvaW50c0ZpbHRlcltdKTogdm9pZCB7XG4gICAgcHJvY2Vzcy5leGNlcHRpb25CcmVha3BvaW50cyA9IGRhdGEubWFwKChkKSA9PiB7XG4gICAgICBjb25zdCBlYnAgPSBwcm9jZXNzLmV4Y2VwdGlvbkJyZWFrcG9pbnRzLmZpbHRlcigoYnApID0+IGJwLmZpbHRlciA9PT0gZC5maWx0ZXIpLnBvcCgpXG4gICAgICByZXR1cm4gbmV3IEV4Y2VwdGlvbkJyZWFrcG9pbnQoZC5maWx0ZXIsIGQubGFiZWwsIGVicCA/IGVicC5lbmFibGVkIDogZC5kZWZhdWx0KVxuICAgIH0pXG4gICAgdGhpcy5fZW1pdHRlci5lbWl0KEJSRUFLUE9JTlRTX0NIQU5HRUQpXG4gIH1cblxuICBhcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5fYnJlYWtwb2ludHNBY3RpdmF0ZWRcbiAgfVxuXG4gIHNldEJyZWFrcG9pbnRzQWN0aXZhdGVkKGFjdGl2YXRlZDogYm9vbGVhbik6IHZvaWQge1xuICAgIHRoaXMuX2JyZWFrcG9pbnRzQWN0aXZhdGVkID0gYWN0aXZhdGVkXG4gICAgdGhpcy5fZW1pdHRlci5lbWl0KEJSRUFLUE9JTlRTX0NIQU5HRUQpXG4gIH1cblxuICBhZGRVSUJyZWFrcG9pbnRzKHVpQnJlYWtwb2ludHM6IElVSUJyZWFrcG9pbnRbXSwgZmlyZUV2ZW50PzogYm9vbGVhbiA9IHRydWUpOiB2b2lkIHtcbiAgICB0aGlzLl91aUJyZWFrcG9pbnRzID0gdGhpcy5fdWlCcmVha3BvaW50cy5jb25jYXQodWlCcmVha3BvaW50cylcbiAgICB0aGlzLl9icmVha3BvaW50c0FjdGl2YXRlZCA9IHRydWVcbiAgICB0aGlzLl9zb3J0U3luY0FuZERlRHVwKHsgZmlyZUV2ZW50IH0pXG4gIH1cblxuICByZW1vdmVCcmVha3BvaW50cyh0b1JlbW92ZTogSUJyZWFrcG9pbnRbXSk6IHZvaWQge1xuICAgIHRoaXMuX3VpQnJlYWtwb2ludHMgPSB0aGlzLl91aUJyZWFrcG9pbnRzLmZpbHRlcigoYnApID0+ICF0b1JlbW92ZS5zb21lKChyKSA9PiByLmdldElkKCkgPT09IGJwLmlkKSlcblxuICAgIHRoaXMuX3NvcnRTeW5jQW5kRGVEdXAoKVxuICB9XG5cbiAgdXBkYXRlQnJlYWtwb2ludHMobmV3QnBzOiBJVUlCcmVha3BvaW50W10pOiB2b2lkIHtcbiAgICB0aGlzLl91aUJyZWFrcG9pbnRzID0gdGhpcy5fdWlCcmVha3BvaW50cy5maWx0ZXIoKGJwKSA9PiAhbmV3QnBzLnNvbWUoKG4pID0+IG4uaWQgPT09IGJwLmlkKSkuY29uY2F0KG5ld0JwcylcblxuICAgIHRoaXMuX3NvcnRTeW5jQW5kRGVEdXAoKVxuICB9XG5cbiAgLy8gVGhpcyBpcyBjYWxsZWQgd2hlbiBhIGJyZWFrcG9pbnQgaXMgdXBkYXRlZCBieSB0aGUgZGVidWcgYWRhcHRlci5cbiAgLy8gSXQgYWZmZWN0cyBvbmx5IGJyZWFrcG9pbnRzIGZvciBhIHBhcnRpY3VsYXIgc2Vzc2lvbi5cbiAgdXBkYXRlUHJvY2Vzc0JyZWFrcG9pbnRzKFxuICAgIHByb2Nlc3M6IElQcm9jZXNzLFxuICAgIGRhdGE6IHtcbiAgICAgIFtpZDogc3RyaW5nXTogRGVidWdQcm90b2NvbC5CcmVha3BvaW50LFxuICAgIH1cbiAgKTogdm9pZCB7XG4gICAgY29uc3QgcHJvYyA9IHRoaXMuX3Byb2Nlc3Nlcy5maW5kKChwKSA9PiBwLmdldElkKCkgPT09IHByb2Nlc3MuZ2V0SWQoKSlcbiAgICBpZiAocHJvYyA9PSBudWxsKSB7XG4gICAgICByZXR1cm5cbiAgICB9XG5cbiAgICBjb25zdCBicmVha3BvaW50cyA9IHByb2MuYnJlYWtwb2ludHNcbiAgICBicmVha3BvaW50cy5mb3JFYWNoKChicCkgPT4ge1xuICAgICAgY29uc3QgYnBEYXRhID0gZGF0YVticC5nZXRJZCgpXVxuICAgICAgaWYgKGJwRGF0YSAhPSBudWxsKSB7XG4gICAgICAgIC8vIFRoZSBicmVha3BvaW50J3MgY2FsaWJyYXRlZCBsb2NhdGlvbiBjYW4gYmUgZGlmZmVyZW50IGZyb20gaXRzXG4gICAgICAgIC8vIGluaXRpYWwgbG9jYXRpb24uIFNpbmNlIHdlIGRvbid0IGRpc3BsYXkgcmFuZ2VzIGluIHRoZSBVWCwgYSBicFxuICAgICAgICAvLyBoYXMgb25seSBvbmUgbGluZSBsb2NhdGlvbi4gV2UgcHJlZmVyIHRoZSBlbmRMaW5lIGlmIHRoZSBicCBpbnN0cnVjdGlvblxuICAgICAgICAvLyBtYXRjaGVzIGEgcmFuZ2Ugb2YgbGluZXMuIE90aGVyd2lzZSBmYWxsIGJhY2sgdG8gdGhlIChzdGFydCkgbGluZS5cbiAgICAgICAgYnAubGluZSA9IGJwRGF0YS5lbmRMaW5lICE9IG51bGwgPyBicERhdGEuZW5kTGluZSA6IGJwRGF0YS5saW5lICE9IG51bGwgPyBicERhdGEubGluZSA6IGJwLmxpbmVcbiAgICAgICAgYnAuY29sdW1uID0gYnBEYXRhLmNvbHVtbiAhPSBudWxsID8gYnBEYXRhLmNvbHVtbiA6IGJwLmNvbHVtblxuICAgICAgICBicC52ZXJpZmllZCA9IGJwRGF0YS52ZXJpZmllZCAhPSBudWxsID8gYnBEYXRhLnZlcmlmaWVkIDogYnAudmVyaWZpZWRcbiAgICAgICAgYnAuaWRGcm9tQWRhcHRlciA9IGJwRGF0YS5pZFxuICAgICAgICBicC5hZGFwdGVyRGF0YSA9IGJwRGF0YS5zb3VyY2UgPyBicERhdGEuc291cmNlLmFkYXB0ZXJEYXRhIDogYnAuYWRhcHRlckRhdGFcbiAgICAgICAgYnAuaGl0Q291bnQgPSBicERhdGEubnVjbGlkZV9oaXRDb3VudFxuICAgICAgfVxuICAgIH0pXG4gICAgdGhpcy5fc29ydFN5bmNBbmREZUR1cCgpXG4gIH1cblxuICBfc29ydFN5bmNBbmREZUR1cChvcHRpb25zPzogU3luY09wdGlvbnMpOiB2b2lkIHtcbiAgICBjb25zdCBjb21wYXJlciA9IChmaXJzdCwgc2Vjb25kKSA9PiB7XG4gICAgICBpZiAoZmlyc3QudXJpICE9PSBzZWNvbmQudXJpKSB7XG4gICAgICAgIHJldHVybiBmaXJzdC51cmkubG9jYWxlQ29tcGFyZShzZWNvbmQudXJpKVxuICAgICAgfVxuICAgICAgaWYgKGZpcnN0LmxpbmUgPT09IHNlY29uZC5saW5lKSB7XG4gICAgICAgIHJldHVybiBmaXJzdC5jb2x1bW4gLSBzZWNvbmQuY29sdW1uXG4gICAgICB9XG5cbiAgICAgIHJldHVybiBmaXJzdC5saW5lIC0gc2Vjb25kLmxpbmVcbiAgICB9XG5cbiAgICB0aGlzLl91aUJyZWFrcG9pbnRzID0gZGlzdGluY3QodGhpcy5fdWlCcmVha3BvaW50cy5zb3J0KGNvbXBhcmVyKSwgKGJwKSA9PiBgJHticC51cml9OiR7YnAubGluZX06JHticC5jb2x1bW59YClcblxuICAgIC8vIFN5bmMgd2l0aCBhbGwgYWN0aXZlIHByb2Nlc3Nlcy5cbiAgICBjb25zdCBicElkcyA9IG5ldyBTZXQoKVxuICAgIGZvciAoY29uc3QgYnAgb2YgdGhpcy5fdWlCcmVha3BvaW50cykge1xuICAgICAgYnBJZHMuYWRkKGJwLmlkKVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgcHJvY2VzcyBvZiB0aGlzLl9wcm9jZXNzZXMpIHtcbiAgICAgIC8vIFJlbW92ZSBhbnkgYnJlYWtwb2ludHMgZnJvbSB0aGUgcHJvY2VzcyB0aGF0IG5vIGxvbmdlciBleGlzdCBpbiB0aGUgVUkuXG4gICAgICBwcm9jZXNzLmJyZWFrcG9pbnRzID0gcHJvY2Vzcy5icmVha3BvaW50cy5maWx0ZXIoKGJwKSA9PiBicElkcy5oYXMoYnAuZ2V0SWQoKSkpXG5cbiAgICAgIC8vIFN5bmMgYW55IHRvIHRoZSBwcm9jZXNzIHRoYXQgYXJlIG1pc3NpbmcuXG4gICAgICBjb25zdCBwcm9jZXNzQnBzID0gbmV3IE1hcCgpXG4gICAgICBmb3IgKGNvbnN0IHByb2Nlc3NCcmVha3BvaW50IG9mIHByb2Nlc3MuYnJlYWtwb2ludHMpIHtcbiAgICAgICAgcHJvY2Vzc0Jwcy5zZXQocHJvY2Vzc0JyZWFrcG9pbnQuZ2V0SWQoKSwgcHJvY2Vzc0JyZWFrcG9pbnQpXG4gICAgICB9XG5cbiAgICAgIGZvciAoY29uc3QgdWlCcCBvZiB0aGlzLl91aUJyZWFrcG9pbnRzKSB7XG4gICAgICAgIGNvbnN0IHByb2Nlc3NCcCA9IHByb2Nlc3NCcHMuZ2V0KHVpQnAuaWQpXG4gICAgICAgIGlmIChwcm9jZXNzQnAgPT0gbnVsbCkge1xuICAgICAgICAgIHByb2Nlc3MuYnJlYWtwb2ludHMucHVzaChcbiAgICAgICAgICAgIG5ldyBCcmVha3BvaW50KHVpQnAuaWQsIHVpQnAudXJpLCB1aUJwLmxpbmUsIHVpQnAuY29sdW1uLCB1aUJwLmVuYWJsZWQsIHVpQnAuY29uZGl0aW9uLCB1aUJwLmxvZ01lc3NhZ2UpXG4gICAgICAgICAgKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHByb2Nlc3NCcC5lbmFibGVkID0gdWlCcC5lbmFibGVkXG4gICAgICAgICAgcHJvY2Vzc0JwLmNvbmRpdGlvbiA9IHVpQnAuY29uZGl0aW9uXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gU29ydC5cbiAgICAgIHByb2Nlc3MuYnJlYWtwb2ludHMgPSBwcm9jZXNzLmJyZWFrcG9pbnRzLnNvcnQoY29tcGFyZXIpXG4gICAgfVxuXG4gICAgaWYgKG9wdGlvbnMgPT0gbnVsbCB8fCBvcHRpb25zLmZpcmVFdmVudCkge1xuICAgICAgdGhpcy5fZW1pdHRlci5lbWl0KEJSRUFLUE9JTlRTX0NIQU5HRUQpXG4gICAgfVxuICB9XG5cbiAgc2V0RW5hYmxlbWVudChlbGVtZW50OiBJRW5hYmxlYWJsZSwgZW5hYmxlOiBib29sZWFuKTogdm9pZCB7XG4gICAgZWxlbWVudC5lbmFibGVkID0gZW5hYmxlXG4gICAgY29uc3QgdWlCcCA9IHRoaXMuX3VpQnJlYWtwb2ludHMuZmluZCgoYnApID0+IGJwLmlkID09PSBlbGVtZW50LmdldElkKCkpXG4gICAgaWYgKHVpQnAgIT0gbnVsbCkge1xuICAgICAgdWlCcC5lbmFibGVkID0gZW5hYmxlXG4gICAgfVxuICAgIHRoaXMuX3NvcnRTeW5jQW5kRGVEdXAoKVxuICB9XG5cbiAgZW5hYmxlT3JEaXNhYmxlQWxsQnJlYWtwb2ludHMoZW5hYmxlOiBib29sZWFuKTogdm9pZCB7XG4gICAgdGhpcy5fdWlCcmVha3BvaW50cy5mb3JFYWNoKChicCkgPT4ge1xuICAgICAgYnAuZW5hYmxlZCA9IGVuYWJsZVxuICAgIH0pXG4gICAgdGhpcy5fZnVuY3Rpb25CcmVha3BvaW50cy5mb3JFYWNoKChmYnApID0+IHtcbiAgICAgIGZicC5lbmFibGVkID0gZW5hYmxlXG4gICAgfSlcblxuICAgIHRoaXMuX3NvcnRTeW5jQW5kRGVEdXAoKVxuICB9XG5cbiAgYWRkRnVuY3Rpb25CcmVha3BvaW50KGZ1bmN0aW9uTmFtZTogc3RyaW5nKTogRnVuY3Rpb25CcmVha3BvaW50IHtcbiAgICBjb25zdCBuZXdGdW5jdGlvbkJyZWFrcG9pbnQgPSBuZXcgRnVuY3Rpb25CcmVha3BvaW50KGZ1bmN0aW9uTmFtZSwgdHJ1ZSwgbnVsbClcbiAgICB0aGlzLl9mdW5jdGlvbkJyZWFrcG9pbnRzLnB1c2gobmV3RnVuY3Rpb25CcmVha3BvaW50KVxuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChCUkVBS1BPSU5UU19DSEFOR0VEKVxuICAgIHJldHVybiBuZXdGdW5jdGlvbkJyZWFrcG9pbnRcbiAgfVxuXG4gIHVwZGF0ZUZ1bmN0aW9uQnJlYWtwb2ludHMoZGF0YToge1xuICAgIFtpZDogc3RyaW5nXToge1xuICAgICAgbmFtZT86IHN0cmluZyxcbiAgICAgIHZlcmlmaWVkPzogYm9vbGVhbixcbiAgICAgIGlkPzogbnVtYmVyLFxuICAgICAgaGl0Q29uZGl0aW9uPzogc3RyaW5nLFxuICAgIH0sXG4gIH0pOiB2b2lkIHtcbiAgICB0aGlzLl9mdW5jdGlvbkJyZWFrcG9pbnRzLmZvckVhY2goKGZicCkgPT4ge1xuICAgICAgY29uc3QgZmJwRGF0YSA9IGRhdGFbZmJwLmdldElkKCldXG4gICAgICBpZiAoZmJwRGF0YSAhPSBudWxsKSB7XG4gICAgICAgIGZicC5uYW1lID0gZmJwRGF0YS5uYW1lICE9IG51bGwgPyBmYnBEYXRhLm5hbWUgOiBmYnAubmFtZVxuICAgICAgICBmYnAudmVyaWZpZWQgPSBmYnBEYXRhLnZlcmlmaWVkIHx8IGZicC52ZXJpZmllZFxuICAgICAgICBmYnAuaWRGcm9tQWRhcHRlciA9IGZicERhdGEuaWRcbiAgICAgICAgZmJwLmhpdENvbmRpdGlvbiA9IGZicERhdGEuaGl0Q29uZGl0aW9uXG4gICAgICB9XG4gICAgfSlcblxuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChCUkVBS1BPSU5UU19DSEFOR0VEKVxuICB9XG5cbiAgcmVtb3ZlRnVuY3Rpb25CcmVha3BvaW50cyhpZD86IHN0cmluZyk6IHZvaWQge1xuICAgIGxldCByZW1vdmVkOiBGdW5jdGlvbkJyZWFrcG9pbnRbXVxuICAgIGlmIChpZCAhPSBudWxsKSB7XG4gICAgICByZW1vdmVkID0gdGhpcy5fZnVuY3Rpb25CcmVha3BvaW50cy5maWx0ZXIoKGZicCkgPT4gZmJwLmdldElkKCkgPT09IGlkKVxuICAgICAgdGhpcy5fZnVuY3Rpb25CcmVha3BvaW50cyA9IHRoaXMuX2Z1bmN0aW9uQnJlYWtwb2ludHMuZmlsdGVyKChmYnApID0+IGZicC5nZXRJZCgpICE9PSBpZClcbiAgICB9IGVsc2Uge1xuICAgICAgcmVtb3ZlZCA9IHRoaXMuX2Z1bmN0aW9uQnJlYWtwb2ludHNcbiAgICAgIHRoaXMuX2Z1bmN0aW9uQnJlYWtwb2ludHMgPSBbXVxuICAgIH1cbiAgICB0aGlzLl9lbWl0dGVyLmVtaXQoQlJFQUtQT0lOVFNfQ0hBTkdFRCwgeyByZW1vdmVkIH0pXG4gIH1cblxuICBnZXRXYXRjaEV4cHJlc3Npb25zKCk6IElFdmFsdWF0YWJsZUV4cHJlc3Npb25bXSB7XG4gICAgcmV0dXJuICh0aGlzLl93YXRjaEV4cHJlc3Npb25zOiBhbnkpXG4gIH1cblxuICBhZGRXYXRjaEV4cHJlc3Npb24obmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3Qgd2UgPSBuZXcgRXhwcmVzc2lvbihuYW1lKVxuICAgIHRoaXMuX3dhdGNoRXhwcmVzc2lvbnMucHVzaCh3ZSlcbiAgICB0aGlzLl9lbWl0dGVyLmVtaXQoV0FUQ0hfRVhQUkVTU0lPTlNfQ0hBTkdFRCwgd2UpXG4gIH1cblxuICByZW5hbWVXYXRjaEV4cHJlc3Npb24oaWQ6IHN0cmluZywgbmV3TmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3QgZmlsdGVyZWQgPSB0aGlzLl93YXRjaEV4cHJlc3Npb25zLmZpbHRlcigod2UpID0+IHdlLmdldElkKCkgPT09IGlkKVxuICAgIGlmIChmaWx0ZXJlZC5sZW5ndGggPT09IDEpIHtcbiAgICAgIGZpbHRlcmVkWzBdLm5hbWUgPSBuZXdOYW1lXG4gICAgICB0aGlzLl9lbWl0dGVyLmVtaXQoV0FUQ0hfRVhQUkVTU0lPTlNfQ0hBTkdFRCwgZmlsdGVyZWRbMF0pXG4gICAgfVxuICB9XG5cbiAgcmVtb3ZlV2F0Y2hFeHByZXNzaW9ucyhpZDogP3N0cmluZyk6IHZvaWQge1xuICAgIHRoaXMuX3dhdGNoRXhwcmVzc2lvbnMgPSBpZCAhPSBudWxsID8gdGhpcy5fd2F0Y2hFeHByZXNzaW9ucy5maWx0ZXIoKHdlKSA9PiB3ZS5nZXRJZCgpICE9PSBpZCkgOiBbXVxuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChXQVRDSF9FWFBSRVNTSU9OU19DSEFOR0VEKVxuICB9XG5cbiAgc291cmNlSXNOb3RBdmFpbGFibGUodXJpOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLl9wcm9jZXNzZXMuZm9yRWFjaCgocCkgPT4ge1xuICAgICAgaWYgKHAuc291cmNlcy5oYXModXJpKSkge1xuICAgICAgICBudWxsdGhyb3dzKHAuc291cmNlcy5nZXQodXJpKSkuYXZhaWxhYmxlID0gZmFsc2VcbiAgICAgIH1cbiAgICB9KVxuICAgIHRoaXMuX2VtaXR0ZXIuZW1pdChDQUxMU1RBQ0tfQ0hBTkdFRClcbiAgfVxuXG4gIGRpc3Bvc2UoKTogdm9pZCB7XG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gIH1cbn1cbiJdfQ==