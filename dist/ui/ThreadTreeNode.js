"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _LoadingSpinner = require("@atom-ide-community/nuclide-commons-ui/LoadingSpinner");

var _scrollIntoView = require("@atom-ide-community/nuclide-commons-ui/scrollIntoView");

var _Table = require("@atom-ide-community/nuclide-commons-ui/Table");

var _Tree = require("@atom-ide-community/nuclide-commons-ui/Tree");

var _event = require("@atom-ide-community/nuclide-commons/event");

var _observable = require("@atom-ide-community/nuclide-commons/observable");

var React = _interopRequireWildcard(require("react"));

var _rxjsCompatUmdMin = require("rxjs-compat/bundles/rxjs-compat.umd.min.js");

var _constants = require("../constants");

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var _expected = require("@atom-ide-community/nuclide-commons/expected");

var _classnames = _interopRequireDefault(require("classnames"));

var _reactDom = _interopRequireDefault(require("react-dom"));

var _Icon = require("@atom-ide-community/nuclide-commons-ui/Icon");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

/* globals Element */
const LEVELS_TO_FETCH = 20;

class ThreadTreeNode extends React.Component {
  // Subject that emits every time this node transitions from collapsed
  // to expanded.
  constructor(props) {
    super(props);
    this._disposables = void 0;
    this._expandedSubject = void 0;
    this._nestedTreeItem = void 0;

    this.handleSelectThread = () => {
      const newCollapsed = !this.state.isCollapsed;

      this._setCollapsed(newCollapsed);
    };

    this._handleStackFrameClick = (clickedRow, callFrameIndex) => {
      this.props.service.viewModel.setFocusedStackFrame(clickedRow.frame, true);
    };

    this._expandedSubject = new _rxjsCompatUmdMin.Subject();
    this.state = {
      isCollapsed: true,
      stackFrames: _expected.Expect.pending(),
      callStackLevels: 20
    };
    this._disposables = new _UniversalDisposable.default();
  }

  _threadIsFocused() {
    const {
      service,
      thread
    } = this.props;
    const focusedThread = service.viewModel.focusedThread;
    return focusedThread != null && thread.threadId === focusedThread.threadId;
  }

  _getFrames(levels) {
    // TODO: support frame paging - fetch ~20 frames here and offer
    // a way in the UI for the user to ask for more
    return levels != null ? this.props.thread.getFullCallStack(levels) : this.props.thread.getFullCallStack();
  }

  componentWillUnmount() {
    this._disposables.dispose();
  }

  componentDidMount() {
    const {
      service
    } = this.props;
    const model = service.getModel();
    const {
      viewModel
    } = service;
    const changedCallStack = (0, _event.observableFromSubscribeFunction)(model.onDidChangeCallStack.bind(model)); // The React element may have subscribed to the event (call stack
    // changed) after the event occurred.

    const additionalFocusedCheck = this._threadIsFocused() ? changedCallStack.startWith(null) : changedCallStack;

    this._disposables.add(_rxjsCompatUmdMin.Observable.merge((0, _event.observableFromSubscribeFunction)(viewModel.onDidChangeDebuggerFocus.bind(viewModel))).subscribe(() => {
      const {
        isCollapsed
      } = this.state;
      const newIsCollapsed = isCollapsed && !this._threadIsFocused();

      this._setCollapsed(newIsCollapsed);

      setTimeout(() => {
        if (this._threadIsFocused() && this._nestedTreeItem != null) {
          const el = _reactDom.default.findDOMNode(this._nestedTreeItem);

          if (el instanceof Element) {
            (0, _scrollIntoView.scrollIntoViewIfNeeded)(el, false);
          }
        }
      }, 100);
    }), this._expandedSubject.asObservable().let((0, _observable.fastDebounce)(100)).switchMap(() => {
      return this._getFrames(this.state.callStackLevels);
    }).subscribe(frames => {
      this.setState({
        stackFrames: frames
      });
    }), additionalFocusedCheck.let((0, _observable.fastDebounce)(100)).switchMap(() => {
      // If this node was already collapsed, it stays collapsed
      // unless this thread just became the focused thread, in
      // which case it auto-expands. If this node was already
      // expanded by the user, it stays expanded.
      const newIsCollapsed = this.state.isCollapsed && !this._threadIsFocused(); // If the node is collapsed, we only need to fetch the first call
      // frame to display the stop location (if any). Otherwise, we need
      // to fetch the call stack.

      return this._getFrames(newIsCollapsed ? 1 : this.state.callStackLevels).switchMap(frames => _rxjsCompatUmdMin.Observable.of({
        frames,
        newIsCollapsed
      }));
    }).subscribe(result => {
      const {
        frames,
        newIsCollapsed
      } = result;
      this.setState({
        stackFrames: frames,
        isCollapsed: newIsCollapsed
      });
    }));
  }

  _setCollapsed(isCollapsed) {
    this.setState({
      isCollapsed
    });

    if (!isCollapsed) {
      this._expandedSubject.next();
    }
  }

  _generateTable(childItems) {
    const {
      service
    } = this.props;
    const rows = childItems.map((frame, frameIndex) => {
      const activeFrame = service.viewModel.focusedStackFrame;
      const isSelected = activeFrame != null ? frame === activeFrame : false;
      const cellData = {
        data: {
          name: frame.name,
          source: frame.source != null && frame.source.name != null ? `${frame.source.name}` : "",
          // VSP line numbers start at 0.
          line: `${frame.range.end.row + 1}`,
          frame,
          isSelected
        },
        className: isSelected ? "debugger-callstack-item-selected debugger-current-line-highlight" : undefined
      };
      return cellData;
    });
    const columns = [{
      title: "Name",
      key: "name",
      width: 0.5
    }, {
      title: "Source",
      key: "source",
      width: 0.35
    }, {
      title: "Line",
      key: "line",
      width: 0.15
    }];
    return /*#__PURE__*/React.createElement("div", {
      className: (0, _classnames.default)({
        "debugger-container-new-disabled": this.props.thread.process.debuggerMode === _constants.DebuggerMode.RUNNING
      })
    }, /*#__PURE__*/React.createElement("div", {
      className: "debugger-callstack-table-div"
    }, /*#__PURE__*/React.createElement(_Table.Table, {
      className: "debugger-callstack-table",
      columns: columns,
      rows: rows,
      selectable: cellData => cellData.frame.source.available,
      resizable: true,
      onSelect: this._handleStackFrameClick,
      sortable: false
    })));
  }

  render() {
    const {
      thread,
      service
    } = this.props;
    const {
      stackFrames,
      isCollapsed
    } = this.state;

    const isFocused = this._threadIsFocused();

    const handleTitleClick = event => {
      if (thread.stopped) {
        service.viewModel.setFocusedThread(thread, true);
      }

      event.stopPropagation();
    };

    const canTerminateThread = Boolean(thread.process.session.capabilities.supportsTerminateThreadsRequest) && thread.threadId > 0 && thread.stopped;
    const terminateThread = canTerminateThread ? /*#__PURE__*/React.createElement(_Icon.Icon, {
      className: "debugger-terminate-thread-control",
      icon: "x",
      title: "Terminate thread",
      onClick: () => {
        service.terminateThreads([this.props.thread.threadId]);
      }
    }) : null;
    const formattedTitle = /*#__PURE__*/React.createElement("span", {
      onClick: handleTitleClick,
      className: isFocused ? (0, _classnames.default)("debugger-tree-process-thread-selected") : "",
      title: "Thread ID: " + thread.threadId + ", Name: " + thread.name
    }, this.props.threadTitle, " ", terminateThread);

    if (!thread.stopped || !stackFrames.isPending && !stackFrames.isError && stackFrames.value.length === 0) {
      return /*#__PURE__*/React.createElement(_Tree.TreeItem, {
        className: "debugger-tree-no-frames"
      }, formattedTitle);
    }

    const LOADING = /*#__PURE__*/React.createElement("div", {
      className: (0, _classnames.default)("debugger-expression-value-row", "debugger-tree-no-frames")
    }, /*#__PURE__*/React.createElement("span", {
      className: "debugger-expression-value-content"
    }, /*#__PURE__*/React.createElement(_LoadingSpinner.LoadingSpinner, {
      size: "SMALL"
    })));
    const ERROR = /*#__PURE__*/React.createElement("span", {
      className: "debugger-tree-no-frames"
    }, "Error fetching stack frames ", stackFrames.isError ? stackFrames.error.toString() : null);
    const callFramesElements = stackFrames.isPending ? LOADING : stackFrames.isError ? ERROR : this._generateTable(stackFrames.value);
    return /*#__PURE__*/React.createElement("div", {
      className: "debugger-tree-frame"
    }, /*#__PURE__*/React.createElement(_Tree.NestedTreeItem, {
      title: formattedTitle,
      collapsed: this.state.isCollapsed,
      onSelect: this.handleSelectThread,
      ref: elem => this._nestedTreeItem = elem
    }, callFramesElements), isCollapsed ? null : this._renderLoadMoreStackFrames());
  }

  _renderLoadMoreStackFrames() {
    const {
      thread
    } = this.props;
    const {
      stackFrames,
      callStackLevels
    } = this.state;

    if (!thread.additionalFramesAvailable(callStackLevels + 1) || stackFrames.isPending || stackFrames.isError) {
      return null;
    }

    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("a", {
      className: "debugger-fetch-frames-link",
      onClick: () => {
        this.setState({
          stackFrames: _expected.Expect.pending(),
          callStackLevels: callStackLevels + LEVELS_TO_FETCH
        });

        this._expandedSubject.next();
      }
    }, "Load More Stack Frames..."));
  }

}

exports.default = ThreadTreeNode;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlRocmVhZFRyZWVOb2RlLmpzIl0sIm5hbWVzIjpbIkxFVkVMU19UT19GRVRDSCIsIlRocmVhZFRyZWVOb2RlIiwiUmVhY3QiLCJDb21wb25lbnQiLCJjb25zdHJ1Y3RvciIsInByb3BzIiwiX2Rpc3Bvc2FibGVzIiwiX2V4cGFuZGVkU3ViamVjdCIsIl9uZXN0ZWRUcmVlSXRlbSIsImhhbmRsZVNlbGVjdFRocmVhZCIsIm5ld0NvbGxhcHNlZCIsInN0YXRlIiwiaXNDb2xsYXBzZWQiLCJfc2V0Q29sbGFwc2VkIiwiX2hhbmRsZVN0YWNrRnJhbWVDbGljayIsImNsaWNrZWRSb3ciLCJjYWxsRnJhbWVJbmRleCIsInNlcnZpY2UiLCJ2aWV3TW9kZWwiLCJzZXRGb2N1c2VkU3RhY2tGcmFtZSIsImZyYW1lIiwiU3ViamVjdCIsInN0YWNrRnJhbWVzIiwiRXhwZWN0IiwicGVuZGluZyIsImNhbGxTdGFja0xldmVscyIsIlVuaXZlcnNhbERpc3Bvc2FibGUiLCJfdGhyZWFkSXNGb2N1c2VkIiwidGhyZWFkIiwiZm9jdXNlZFRocmVhZCIsInRocmVhZElkIiwiX2dldEZyYW1lcyIsImxldmVscyIsImdldEZ1bGxDYWxsU3RhY2siLCJjb21wb25lbnRXaWxsVW5tb3VudCIsImRpc3Bvc2UiLCJjb21wb25lbnREaWRNb3VudCIsIm1vZGVsIiwiZ2V0TW9kZWwiLCJjaGFuZ2VkQ2FsbFN0YWNrIiwib25EaWRDaGFuZ2VDYWxsU3RhY2siLCJiaW5kIiwiYWRkaXRpb25hbEZvY3VzZWRDaGVjayIsInN0YXJ0V2l0aCIsImFkZCIsIk9ic2VydmFibGUiLCJtZXJnZSIsIm9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cyIsInN1YnNjcmliZSIsIm5ld0lzQ29sbGFwc2VkIiwic2V0VGltZW91dCIsImVsIiwiUmVhY3RET00iLCJmaW5kRE9NTm9kZSIsIkVsZW1lbnQiLCJhc09ic2VydmFibGUiLCJsZXQiLCJzd2l0Y2hNYXAiLCJmcmFtZXMiLCJzZXRTdGF0ZSIsIm9mIiwicmVzdWx0IiwibmV4dCIsIl9nZW5lcmF0ZVRhYmxlIiwiY2hpbGRJdGVtcyIsInJvd3MiLCJtYXAiLCJmcmFtZUluZGV4IiwiYWN0aXZlRnJhbWUiLCJmb2N1c2VkU3RhY2tGcmFtZSIsImlzU2VsZWN0ZWQiLCJjZWxsRGF0YSIsImRhdGEiLCJuYW1lIiwic291cmNlIiwibGluZSIsInJhbmdlIiwiZW5kIiwicm93IiwiY2xhc3NOYW1lIiwidW5kZWZpbmVkIiwiY29sdW1ucyIsInRpdGxlIiwia2V5Iiwid2lkdGgiLCJwcm9jZXNzIiwiZGVidWdnZXJNb2RlIiwiRGVidWdnZXJNb2RlIiwiUlVOTklORyIsImF2YWlsYWJsZSIsInJlbmRlciIsImlzRm9jdXNlZCIsImhhbmRsZVRpdGxlQ2xpY2siLCJldmVudCIsInN0b3BwZWQiLCJzZXRGb2N1c2VkVGhyZWFkIiwic3RvcFByb3BhZ2F0aW9uIiwiY2FuVGVybWluYXRlVGhyZWFkIiwiQm9vbGVhbiIsInNlc3Npb24iLCJjYXBhYmlsaXRpZXMiLCJzdXBwb3J0c1Rlcm1pbmF0ZVRocmVhZHNSZXF1ZXN0IiwidGVybWluYXRlVGhyZWFkIiwidGVybWluYXRlVGhyZWFkcyIsImZvcm1hdHRlZFRpdGxlIiwidGhyZWFkVGl0bGUiLCJpc1BlbmRpbmciLCJpc0Vycm9yIiwidmFsdWUiLCJsZW5ndGgiLCJMT0FESU5HIiwiRVJST1IiLCJlcnJvciIsInRvU3RyaW5nIiwiY2FsbEZyYW1lc0VsZW1lbnRzIiwiZWxlbSIsIl9yZW5kZXJMb2FkTW9yZVN0YWNrRnJhbWVzIiwiYWRkaXRpb25hbEZyYW1lc0F2YWlsYWJsZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUtBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQWxCQTtBQWdDQSxNQUFNQSxlQUFlLEdBQUcsRUFBeEI7O0FBRWUsTUFBTUMsY0FBTixTQUE2QkMsS0FBSyxDQUFDQyxTQUFuQyxDQUEyRDtB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akI7QUFJRSxNQUFBLEdBQUcsRUFBRzBHLElBQUQsSUFBVyxLQUFLM0csZUFBTCxHQUF1QjJHO0FBSnpDLE9BTUdELGtCQU5ILENBREYsRUFTR3RHLFdBQVcsR0FBRyxJQUFILEdBQVUsS0FBS3dHLDBCQUFMLEVBVHhCLENBREY7QUFhRDs7QUFFREEsRUFBQUEsMEJBQTBCLEdBQXdCO0FBQ2hELFVBQU07QUFBRXhGLE1BQUFBO0FBQUYsUUFBYSxLQUFLdkIsS0FBeEI7QUFDQSxVQUFNO0FBQUVpQixNQUFBQSxXQUFGO0FBQWVHLE1BQUFBO0FBQWYsUUFBbUMsS0FBS2QsS0FBOUM7O0FBRUEsUUFBSSxDQUFDaUIsTUFBTSxDQUFDeUYseUJBQVAsQ0FBaUM1RixlQUFlLEdBQUcsQ0FBbkQsQ0FBRCxJQUEwREgsV0FBVyxDQUFDb0YsU0FBdEUsSUFBbUZwRixXQUFXLENBQUNxRixPQUFuRyxFQUE0RztBQUMxRyxhQUFPLElBQVA7QUFDRDs7QUFFRCx3QkFDRSw4Q0FDRTtBQUNFLE1BQUEsU0FBUyxFQUFDLDRCQURaO0FBRUUsTUFBQSxPQUFPLEVBQUUsTUFBTTtBQUNiLGFBQUtoRCxRQUFMLENBQWM7QUFDWnJDLFVBQUFBLFdBQVcsRUFBRUMsaUJBQU9DLE9BQVAsRUFERDtBQUVaQyxVQUFBQSxlQUFlLEVBQUVBLGVBQWUsR0FBR3pCO0FBRnZCLFNBQWQ7O0FBSUEsYUFBS08sZ0JBQUwsQ0FBc0J1RCxJQUF0QjtBQUNEO0FBUkgsbUNBREYsQ0FERjtBQWdCRDs7QUFsUnVFIiwic291cmNlc0NvbnRlbnQiOlsiLyogZ2xvYmFscyBFbGVtZW50ICovXHJcblxyXG5pbXBvcnQgdHlwZSB7IElUaHJlYWQsIElTdGFja0ZyYW1lLCBJRGVidWdTZXJ2aWNlIH0gZnJvbSBcIi4uL3R5cGVzXCJcclxuaW1wb3J0IHR5cGUgeyBFeHBlY3RlZCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9leHBlY3RlZFwiXHJcblxyXG5pbXBvcnQgeyBMb2FkaW5nU3Bpbm5lciB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9Mb2FkaW5nU3Bpbm5lclwiXHJcbmltcG9ydCB7IHNjcm9sbEludG9WaWV3SWZOZWVkZWQgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvc2Nyb2xsSW50b1ZpZXdcIlxyXG5pbXBvcnQgeyBUYWJsZSB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9UYWJsZVwiXHJcbmltcG9ydCB7IE5lc3RlZFRyZWVJdGVtLCBUcmVlSXRlbSB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9UcmVlXCJcclxuaW1wb3J0IHsgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbiB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9ldmVudFwiXHJcbmltcG9ydCB7IGZhc3REZWJvdW5jZSB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9vYnNlcnZhYmxlXCJcclxuaW1wb3J0ICogYXMgUmVhY3QgZnJvbSBcInJlYWN0XCJcclxuaW1wb3J0IHsgT2JzZXJ2YWJsZSwgU3ViamVjdCB9IGZyb20gXCJyeGpzLWNvbXBhdC9idW5kbGVzL3J4anMtY29tcGF0LnVtZC5taW4uanNcIlxyXG5pbXBvcnQgeyBEZWJ1Z2dlck1vZGUgfSBmcm9tIFwiLi4vY29uc3RhbnRzXCJcclxuaW1wb3J0IFVuaXZlcnNhbERpc3Bvc2FibGUgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL1VuaXZlcnNhbERpc3Bvc2FibGVcIlxyXG5pbXBvcnQgeyBFeHBlY3QgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvZXhwZWN0ZWRcIlxyXG5pbXBvcnQgY2xhc3NuYW1lcyBmcm9tIFwiY2xhc3NuYW1lc1wiXHJcbmltcG9ydCBSZWFjdERPTSBmcm9tIFwicmVhY3QtZG9tXCJcclxuaW1wb3J0IHsgSWNvbiB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9JY29uXCJcclxuXHJcbnR5cGUgUHJvcHMgPSB7XHJcbiAgdGhyZWFkOiBJVGhyZWFkLFxyXG4gIHNlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXHJcbiAgdGhyZWFkVGl0bGU6IHN0cmluZyxcclxufVxyXG5cclxudHlwZSBTdGF0ZSA9IHtcclxuICBpc0NvbGxhcHNlZDogYm9vbGVhbixcclxuICBzdGFja0ZyYW1lczogRXhwZWN0ZWQ8QXJyYXk8SVN0YWNrRnJhbWU+PixcclxuICBjYWxsU3RhY2tMZXZlbHM6IG51bWJlcixcclxufVxyXG5cclxuY29uc3QgTEVWRUxTX1RPX0ZFVENIID0gMjBcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFRocmVhZFRyZWVOb2RlIGV4dGVuZHMgUmVhY3QuQ29tcG9uZW50PFByb3BzLCBTdGF0ZT4ge1xyXG4gIF9kaXNwb3NhYmxlczogVW5pdmVyc2FsRGlzcG9zYWJsZVxyXG4gIC8vIFN1YmplY3QgdGhhdCBlbWl0cyBldmVyeSB0aW1lIHRoaXMgbm9kZSB0cmFuc2l0aW9ucyBmcm9tIGNvbGxhcHNlZFxyXG4gIC8vIHRvIGV4cGFuZGVkLlxyXG4gIF9leHBhbmRlZFN1YmplY3Q6IFN1YmplY3Q8dm9pZD5cclxuICBfbmVzdGVkVHJlZUl0ZW06ID9OZXN0ZWRUcmVlSXRlbVxyXG5cclxuICBjb25zdHJ1Y3Rvcihwcm9wczogUHJvcHMpIHtcclxuICAgIHN1cGVyKHByb3BzKVxyXG4gICAgdGhpcy5fZXhwYW5kZWRTdWJqZWN0ID0gbmV3IFN1YmplY3QoKVxyXG4gICAgdGhpcy5zdGF0ZSA9IHtcclxuICAgICAgaXNDb2xsYXBzZWQ6IHRydWUsXHJcbiAgICAgIHN0YWNrRnJhbWVzOiBFeHBlY3QucGVuZGluZygpLFxyXG4gICAgICBjYWxsU3RhY2tMZXZlbHM6IDIwLFxyXG4gICAgfVxyXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSgpXHJcbiAgfVxyXG5cclxuICBfdGhyZWFkSXNGb2N1c2VkKCk6IGJvb2xlYW4ge1xyXG4gICAgY29uc3QgeyBzZXJ2aWNlLCB0aHJlYWQgfSA9IHRoaXMucHJvcHNcclxuICAgIGNvbnN0IGZvY3VzZWRUaHJlYWQgPSBzZXJ2aWNlLnZpZXdNb2RlbC5mb2N1c2VkVGhyZWFkXHJcbiAgICByZXR1cm4gZm9jdXNlZFRocmVhZCAhPSBudWxsICYmIHRocmVhZC50aHJlYWRJZCA9PT0gZm9jdXNlZFRocmVhZC50aHJlYWRJZFxyXG4gIH1cclxuXHJcbiAgX2dldEZyYW1lcyhsZXZlbHM6ID9udW1iZXIpOiBPYnNlcnZhYmxlPEV4cGVjdGVkPEFycmF5PElTdGFja0ZyYW1lPj4+IHtcclxuICAgIC8vIFRPRE86IHN1cHBvcnQgZnJhbWUgcGFnaW5nIC0gZmV0Y2ggfjIwIGZyYW1lcyBoZXJlIGFuZCBvZmZlclxyXG4gICAgLy8gYSB3YXkgaW4gdGhlIFVJIGZvciB0aGUgdXNlciB0byBhc2sgZm9yIG1vcmVcclxuICAgIHJldHVybiBsZXZlbHMgIT0gbnVsbCA/IHRoaXMucHJvcHMudGhyZWFkLmdldEZ1bGxDYWxsU3RhY2sobGV2ZWxzKSA6IHRoaXMucHJvcHMudGhyZWFkLmdldEZ1bGxDYWxsU3RhY2soKVxyXG4gIH1cclxuXHJcbiAgY29tcG9uZW50V2lsbFVubW91bnQoKTogdm9pZCB7XHJcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKClcclxuICB9XHJcblxyXG4gIGNvbXBvbmVudERpZE1vdW50KCk6IHZvaWQge1xyXG4gICAgY29uc3QgeyBzZXJ2aWNlIH0gPSB0aGlzLnByb3BzXHJcbiAgICBjb25zdCBtb2RlbCA9IHNlcnZpY2UuZ2V0TW9kZWwoKVxyXG4gICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IHNlcnZpY2VcclxuICAgIGNvbnN0IGNoYW5nZWRDYWxsU3RhY2sgPSBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKG1vZGVsLm9uRGlkQ2hhbmdlQ2FsbFN0YWNrLmJpbmQobW9kZWwpKVxyXG4gICAgLy8gVGhlIFJlYWN0IGVsZW1lbnQgbWF5IGhhdmUgc3Vic2NyaWJlZCB0byB0aGUgZXZlbnQgKGNhbGwgc3RhY2tcclxuICAgIC8vIGNoYW5nZWQpIGFmdGVyIHRoZSBldmVudCBvY2N1cnJlZC5cclxuICAgIGNvbnN0IGFkZGl0aW9uYWxGb2N1c2VkQ2hlY2sgPSB0aGlzLl90aHJlYWRJc0ZvY3VzZWQoKSA/IGNoYW5nZWRDYWxsU3RhY2suc3RhcnRXaXRoKG51bGwpIDogY2hhbmdlZENhbGxTdGFja1xyXG5cclxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChcclxuICAgICAgT2JzZXJ2YWJsZS5tZXJnZShvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKHZpZXdNb2RlbC5vbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMuYmluZCh2aWV3TW9kZWwpKSkuc3Vic2NyaWJlKFxyXG4gICAgICAgICgpID0+IHtcclxuICAgICAgICAgIGNvbnN0IHsgaXNDb2xsYXBzZWQgfSA9IHRoaXMuc3RhdGVcclxuICAgICAgICAgIGNvbnN0IG5ld0lzQ29sbGFwc2VkID0gaXNDb2xsYXBzZWQgJiYgIXRoaXMuX3RocmVhZElzRm9jdXNlZCgpXHJcbiAgICAgICAgICB0aGlzLl9zZXRDb2xsYXBzZWQobmV3SXNDb2xsYXBzZWQpXHJcbiAgICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuX3RocmVhZElzRm9jdXNlZCgpICYmIHRoaXMuX25lc3RlZFRyZWVJdGVtICE9IG51bGwpIHtcclxuICAgICAgICAgICAgICBjb25zdCBlbCA9IFJlYWN0RE9NLmZpbmRET01Ob2RlKHRoaXMuX25lc3RlZFRyZWVJdGVtKVxyXG4gICAgICAgICAgICAgIGlmIChlbCBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcclxuICAgICAgICAgICAgICAgIHNjcm9sbEludG9WaWV3SWZOZWVkZWQoZWwsIGZhbHNlKVxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfSwgMTAwKVxyXG4gICAgICAgIH1cclxuICAgICAgKSxcclxuICAgICAgdGhpcy5fZXhwYW5kZWRTdWJqZWN0XHJcbiAgICAgICAgLmFzT2JzZXJ2YWJsZSgpXHJcbiAgICAgICAgLmxldChmYXN0RGVib3VuY2UoMTAwKSlcclxuICAgICAgICAuc3dpdGNoTWFwKCgpID0+IHtcclxuICAgICAgICAgIHJldHVybiB0aGlzLl9nZXRGcmFtZXModGhpcy5zdGF0ZS5jYWxsU3RhY2tMZXZlbHMpXHJcbiAgICAgICAgfSlcclxuICAgICAgICAuc3Vic2NyaWJlKChmcmFtZXMpID0+IHtcclxuICAgICAgICAgIHRoaXMuc2V0U3RhdGUoe1xyXG4gICAgICAgICAgICBzdGFja0ZyYW1lczogZnJhbWVzLFxyXG4gICAgICAgICAgfSlcclxuICAgICAgICB9KSxcclxuICAgICAgYWRkaXRpb25hbEZvY3VzZWRDaGVja1xyXG4gICAgICAgIC5sZXQoZmFzdERlYm91bmNlKDEwMCkpXHJcbiAgICAgICAgLnN3aXRjaE1hcCgoKSA9PiB7XHJcbiAgICAgICAgICAvLyBJZiB0aGlzIG5vZGUgd2FzIGFscmVhZHkgY29sbGFwc2VkLCBpdCBzdGF5cyBjb2xsYXBzZWRcclxuICAgICAgICAgIC8vIHVubGVzcyB0aGlzIHRocmVhZCBqdXN0IGJlY2FtZSB0aGUgZm9jdXNlZCB0aHJlYWQsIGluXHJcbiAgICAgICAgICAvLyB3aGljaCBjYXNlIGl0IGF1dG8tZXhwYW5kcy4gSWYgdGhpcyBub2RlIHdhcyBhbHJlYWR5XHJcbiAgICAgICAgICAvLyBleHBhbmRlZCBieSB0aGUgdXNlciwgaXQgc3RheXMgZXhwYW5kZWQuXHJcbiAgICAgICAgICBjb25zdCBuZXdJc0NvbGxhcHNlZCA9IHRoaXMuc3RhdGUuaXNDb2xsYXBzZWQgJiYgIXRoaXMuX3RocmVhZElzRm9jdXNlZCgpXHJcblxyXG4gICAgICAgICAgLy8gSWYgdGhlIG5vZGUgaXMgY29sbGFwc2VkLCB3ZSBvbmx5IG5lZWQgdG8gZmV0Y2ggdGhlIGZpcnN0IGNhbGxcclxuICAgICAgICAgIC8vIGZyYW1lIHRvIGRpc3BsYXkgdGhlIHN0b3AgbG9jYXRpb24gKGlmIGFueSkuIE90aGVyd2lzZSwgd2UgbmVlZFxyXG4gICAgICAgICAgLy8gdG8gZmV0Y2ggdGhlIGNhbGwgc3RhY2suXHJcbiAgICAgICAgICByZXR1cm4gdGhpcy5fZ2V0RnJhbWVzKG5ld0lzQ29sbGFwc2VkID8gMSA6IHRoaXMuc3RhdGUuY2FsbFN0YWNrTGV2ZWxzKS5zd2l0Y2hNYXAoKGZyYW1lcykgPT5cclxuICAgICAgICAgICAgT2JzZXJ2YWJsZS5vZih7XHJcbiAgICAgICAgICAgICAgZnJhbWVzLFxyXG4gICAgICAgICAgICAgIG5ld0lzQ29sbGFwc2VkLFxyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgICAgKVxyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLnN1YnNjcmliZSgocmVzdWx0KSA9PiB7XHJcbiAgICAgICAgICBjb25zdCB7IGZyYW1lcywgbmV3SXNDb2xsYXBzZWQgfSA9IHJlc3VsdFxyXG4gICAgICAgICAgdGhpcy5zZXRTdGF0ZSh7XHJcbiAgICAgICAgICAgIHN0YWNrRnJhbWVzOiBmcmFtZXMsXHJcbiAgICAgICAgICAgIGlzQ29sbGFwc2VkOiBuZXdJc0NvbGxhcHNlZCxcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgfSlcclxuICAgIClcclxuICB9XHJcblxyXG4gIF9zZXRDb2xsYXBzZWQoaXNDb2xsYXBzZWQ6IGJvb2xlYW4pOiB2b2lkIHtcclxuICAgIHRoaXMuc2V0U3RhdGUoe1xyXG4gICAgICBpc0NvbGxhcHNlZCxcclxuICAgIH0pXHJcblxyXG4gICAgaWYgKCFpc0NvbGxhcHNlZCkge1xyXG4gICAgICB0aGlzLl9leHBhbmRlZFN1YmplY3QubmV4dCgpXHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBoYW5kbGVTZWxlY3RUaHJlYWQgPSAoKSA9PiB7XHJcbiAgICBjb25zdCBuZXdDb2xsYXBzZWQgPSAhdGhpcy5zdGF0ZS5pc0NvbGxhcHNlZFxyXG4gICAgdGhpcy5fc2V0Q29sbGFwc2VkKG5ld0NvbGxhcHNlZClcclxuICB9XHJcblxyXG4gIF9oYW5kbGVTdGFja0ZyYW1lQ2xpY2sgPSAoY2xpY2tlZFJvdzogeyBmcmFtZTogSVN0YWNrRnJhbWUgfSwgY2FsbEZyYW1lSW5kZXg6IG51bWJlcik6IHZvaWQgPT4ge1xyXG4gICAgdGhpcy5wcm9wcy5zZXJ2aWNlLnZpZXdNb2RlbC5zZXRGb2N1c2VkU3RhY2tGcmFtZShjbGlja2VkUm93LmZyYW1lLCB0cnVlKVxyXG4gIH1cclxuXHJcbiAgX2dlbmVyYXRlVGFibGUoY2hpbGRJdGVtczogQXJyYXk8SVN0YWNrRnJhbWU+KSB7XHJcbiAgICBjb25zdCB7IHNlcnZpY2UgfSA9IHRoaXMucHJvcHNcclxuICAgIGNvbnN0IHJvd3MgPSBjaGlsZEl0ZW1zLm1hcCgoZnJhbWUsIGZyYW1lSW5kZXgpID0+IHtcclxuICAgICAgY29uc3QgYWN0aXZlRnJhbWUgPSBzZXJ2aWNlLnZpZXdNb2RlbC5mb2N1c2VkU3RhY2tGcmFtZVxyXG4gICAgICBjb25zdCBpc1NlbGVjdGVkID0gYWN0aXZlRnJhbWUgIT0gbnVsbCA/IGZyYW1lID09PSBhY3RpdmVGcmFtZSA6IGZhbHNlXHJcbiAgICAgIGNvbnN0IGNlbGxEYXRhID0ge1xyXG4gICAgICAgIGRhdGE6IHtcclxuICAgICAgICAgIG5hbWU6IGZyYW1lLm5hbWUsXHJcbiAgICAgICAgICBzb3VyY2U6IGZyYW1lLnNvdXJjZSAhPSBudWxsICYmIGZyYW1lLnNvdXJjZS5uYW1lICE9IG51bGwgPyBgJHtmcmFtZS5zb3VyY2UubmFtZX1gIDogXCJcIixcclxuICAgICAgICAgIC8vIFZTUCBsaW5lIG51bWJlcnMgc3RhcnQgYXQgMC5cclxuICAgICAgICAgIGxpbmU6IGAke2ZyYW1lLnJhbmdlLmVuZC5yb3cgKyAxfWAsXHJcbiAgICAgICAgICBmcmFtZSxcclxuICAgICAgICAgIGlzU2VsZWN0ZWQsXHJcbiAgICAgICAgfSxcclxuICAgICAgICBjbGFzc05hbWU6IGlzU2VsZWN0ZWQgPyBcImRlYnVnZ2VyLWNhbGxzdGFjay1pdGVtLXNlbGVjdGVkIGRlYnVnZ2VyLWN1cnJlbnQtbGluZS1oaWdobGlnaHRcIiA6IHVuZGVmaW5lZCxcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gY2VsbERhdGFcclxuICAgIH0pXHJcbiAgICBjb25zdCBjb2x1bW5zID0gW1xyXG4gICAgICB7XHJcbiAgICAgICAgdGl0bGU6IFwiTmFtZVwiLFxyXG4gICAgICAgIGtleTogXCJuYW1lXCIsXHJcbiAgICAgICAgd2lkdGg6IDAuNSxcclxuICAgICAgfSxcclxuICAgICAge1xyXG4gICAgICAgIHRpdGxlOiBcIlNvdXJjZVwiLFxyXG4gICAgICAgIGtleTogXCJzb3VyY2VcIixcclxuICAgICAgICB3aWR0aDogMC4zNSxcclxuICAgICAgfSxcclxuICAgICAge1xyXG4gICAgICAgIHRpdGxlOiBcIkxpbmVcIixcclxuICAgICAgICBrZXk6IFwibGluZVwiLFxyXG4gICAgICAgIHdpZHRoOiAwLjE1LFxyXG4gICAgICB9LFxyXG4gICAgXVxyXG4gICAgcmV0dXJuIChcclxuICAgICAgPGRpdlxyXG4gICAgICAgIGNsYXNzTmFtZT17Y2xhc3NuYW1lcyh7XHJcbiAgICAgICAgICBcImRlYnVnZ2VyLWNvbnRhaW5lci1uZXctZGlzYWJsZWRcIjogdGhpcy5wcm9wcy50aHJlYWQucHJvY2Vzcy5kZWJ1Z2dlck1vZGUgPT09IERlYnVnZ2VyTW9kZS5SVU5OSU5HLFxyXG4gICAgICAgIH0pfVxyXG4gICAgICA+XHJcbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1jYWxsc3RhY2stdGFibGUtZGl2XCI+XHJcbiAgICAgICAgICA8VGFibGVcclxuICAgICAgICAgICAgY2xhc3NOYW1lPVwiZGVidWdnZXItY2FsbHN0YWNrLXRhYmxlXCJcclxuICAgICAgICAgICAgY29sdW1ucz17Y29sdW1uc31cclxuICAgICAgICAgICAgcm93cz17cm93c31cclxuICAgICAgICAgICAgc2VsZWN0YWJsZT17KGNlbGxEYXRhKSA9PiBjZWxsRGF0YS5mcmFtZS5zb3VyY2UuYXZhaWxhYmxlfVxyXG4gICAgICAgICAgICByZXNpemFibGU9e3RydWV9XHJcbiAgICAgICAgICAgIG9uU2VsZWN0PXt0aGlzLl9oYW5kbGVTdGFja0ZyYW1lQ2xpY2t9XHJcbiAgICAgICAgICAgIHNvcnRhYmxlPXtmYWxzZX1cclxuICAgICAgICAgIC8+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICAgIDwvZGl2PlxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgcmVuZGVyKCk6IFJlYWN0Lk5vZGUge1xyXG4gICAgY29uc3QgeyB0aHJlYWQsIHNlcnZpY2UgfSA9IHRoaXMucHJvcHNcclxuICAgIGNvbnN0IHsgc3RhY2tGcmFtZXMsIGlzQ29sbGFwc2VkIH0gPSB0aGlzLnN0YXRlXHJcbiAgICBjb25zdCBpc0ZvY3VzZWQgPSB0aGlzLl90aHJlYWRJc0ZvY3VzZWQoKVxyXG4gICAgY29uc3QgaGFuZGxlVGl0bGVDbGljayA9IChldmVudCkgPT4ge1xyXG4gICAgICBpZiAodGhyZWFkLnN0b3BwZWQpIHtcclxuICAgICAgICBzZXJ2aWNlLnZpZXdNb2RlbC5zZXRGb2N1c2VkVGhyZWFkKHRocmVhZCwgdHJ1ZSlcclxuICAgICAgfVxyXG4gICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKVxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGNhblRlcm1pbmF0ZVRocmVhZCA9XHJcbiAgICAgIEJvb2xlYW4odGhyZWFkLnByb2Nlc3Muc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNUZXJtaW5hdGVUaHJlYWRzUmVxdWVzdCkgJiZcclxuICAgICAgdGhyZWFkLnRocmVhZElkID4gMCAmJlxyXG4gICAgICB0aHJlYWQuc3RvcHBlZFxyXG5cclxuICAgIGNvbnN0IHRlcm1pbmF0ZVRocmVhZCA9IGNhblRlcm1pbmF0ZVRocmVhZCA/IChcclxuICAgICAgPEljb25cclxuICAgICAgICBjbGFzc05hbWU9XCJkZWJ1Z2dlci10ZXJtaW5hdGUtdGhyZWFkLWNvbnRyb2xcIlxyXG4gICAgICAgIGljb249XCJ4XCJcclxuICAgICAgICB0aXRsZT1cIlRlcm1pbmF0ZSB0aHJlYWRcIlxyXG4gICAgICAgIG9uQ2xpY2s9eygpID0+IHtcclxuICAgICAgICAgIHNlcnZpY2UudGVybWluYXRlVGhyZWFkcyhbdGhpcy5wcm9wcy50aHJlYWQudGhyZWFkSWRdKVxyXG4gICAgICAgIH19XHJcbiAgICAgIC8+XHJcbiAgICApIDogbnVsbFxyXG5cclxuICAgIGNvbnN0IGZvcm1hdHRlZFRpdGxlID0gKFxyXG4gICAgICA8c3BhblxyXG4gICAgICAgIG9uQ2xpY2s9e2hhbmRsZVRpdGxlQ2xpY2t9XHJcbiAgICAgICAgY2xhc3NOYW1lPXtpc0ZvY3VzZWQgPyBjbGFzc25hbWVzKFwiZGVidWdnZXItdHJlZS1wcm9jZXNzLXRocmVhZC1zZWxlY3RlZFwiKSA6IFwiXCJ9XHJcbiAgICAgICAgdGl0bGU9e1wiVGhyZWFkIElEOiBcIiArIHRocmVhZC50aHJlYWRJZCArIFwiLCBOYW1lOiBcIiArIHRocmVhZC5uYW1lfVxyXG4gICAgICA+XHJcbiAgICAgICAge3RoaXMucHJvcHMudGhyZWFkVGl0bGV9IHt0ZXJtaW5hdGVUaHJlYWR9XHJcbiAgICAgIDwvc3Bhbj5cclxuICAgIClcclxuXHJcbiAgICBpZiAoIXRocmVhZC5zdG9wcGVkIHx8ICghc3RhY2tGcmFtZXMuaXNQZW5kaW5nICYmICFzdGFja0ZyYW1lcy5pc0Vycm9yICYmIHN0YWNrRnJhbWVzLnZhbHVlLmxlbmd0aCA9PT0gMCkpIHtcclxuICAgICAgcmV0dXJuIDxUcmVlSXRlbSBjbGFzc05hbWU9XCJkZWJ1Z2dlci10cmVlLW5vLWZyYW1lc1wiPntmb3JtYXR0ZWRUaXRsZX08L1RyZWVJdGVtPlxyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IExPQURJTkcgPSAoXHJcbiAgICAgIDxkaXYgY2xhc3NOYW1lPXtjbGFzc25hbWVzKFwiZGVidWdnZXItZXhwcmVzc2lvbi12YWx1ZS1yb3dcIiwgXCJkZWJ1Z2dlci10cmVlLW5vLWZyYW1lc1wiKX0+XHJcbiAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwiZGVidWdnZXItZXhwcmVzc2lvbi12YWx1ZS1jb250ZW50XCI+XHJcbiAgICAgICAgICA8TG9hZGluZ1NwaW5uZXIgc2l6ZT1cIlNNQUxMXCIgLz5cclxuICAgICAgICA8L3NwYW4+XHJcbiAgICAgIDwvZGl2PlxyXG4gICAgKVxyXG5cclxuICAgIGNvbnN0IEVSUk9SID0gKFxyXG4gICAgICA8c3BhbiBjbGFzc05hbWU9XCJkZWJ1Z2dlci10cmVlLW5vLWZyYW1lc1wiPlxyXG4gICAgICAgIEVycm9yIGZldGNoaW5nIHN0YWNrIGZyYW1lcyB7c3RhY2tGcmFtZXMuaXNFcnJvciA/IHN0YWNrRnJhbWVzLmVycm9yLnRvU3RyaW5nKCkgOiBudWxsfVxyXG4gICAgICA8L3NwYW4+XHJcbiAgICApXHJcblxyXG4gICAgY29uc3QgY2FsbEZyYW1lc0VsZW1lbnRzID0gc3RhY2tGcmFtZXMuaXNQZW5kaW5nXHJcbiAgICAgID8gTE9BRElOR1xyXG4gICAgICA6IHN0YWNrRnJhbWVzLmlzRXJyb3JcclxuICAgICAgPyBFUlJPUlxyXG4gICAgICA6IHRoaXMuX2dlbmVyYXRlVGFibGUoc3RhY2tGcmFtZXMudmFsdWUpXHJcblxyXG4gICAgcmV0dXJuIChcclxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci10cmVlLWZyYW1lXCI+XHJcbiAgICAgICAgPE5lc3RlZFRyZWVJdGVtXHJcbiAgICAgICAgICB0aXRsZT17Zm9ybWF0dGVkVGl0bGV9XHJcbiAgICAgICAgICBjb2xsYXBzZWQ9e3RoaXMuc3RhdGUuaXNDb2xsYXBzZWR9XHJcbiAgICAgICAgICBvblNlbGVjdD17dGhpcy5oYW5kbGVTZWxlY3RUaHJlYWR9XHJcbiAgICAgICAgICByZWY9eyhlbGVtKSA9PiAodGhpcy5fbmVzdGVkVHJlZUl0ZW0gPSBlbGVtKX1cclxuICAgICAgICA+XHJcbiAgICAgICAgICB7Y2FsbEZyYW1lc0VsZW1lbnRzfVxyXG4gICAgICAgIDwvTmVzdGVkVHJlZUl0ZW0+XHJcbiAgICAgICAge2lzQ29sbGFwc2VkID8gbnVsbCA6IHRoaXMuX3JlbmRlckxvYWRNb3JlU3RhY2tGcmFtZXMoKX1cclxuICAgICAgPC9kaXY+XHJcbiAgICApXHJcbiAgfVxyXG5cclxuICBfcmVuZGVyTG9hZE1vcmVTdGFja0ZyYW1lcygpOiA/UmVhY3QuRWxlbWVudDxhbnk+IHtcclxuICAgIGNvbnN0IHsgdGhyZWFkIH0gPSB0aGlzLnByb3BzXHJcbiAgICBjb25zdCB7IHN0YWNrRnJhbWVzLCBjYWxsU3RhY2tMZXZlbHMgfSA9IHRoaXMuc3RhdGVcclxuXHJcbiAgICBpZiAoIXRocmVhZC5hZGRpdGlvbmFsRnJhbWVzQXZhaWxhYmxlKGNhbGxTdGFja0xldmVscyArIDEpIHx8IHN0YWNrRnJhbWVzLmlzUGVuZGluZyB8fCBzdGFja0ZyYW1lcy5pc0Vycm9yKSB7XHJcbiAgICAgIHJldHVybiBudWxsXHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIChcclxuICAgICAgPGRpdj5cclxuICAgICAgICA8YVxyXG4gICAgICAgICAgY2xhc3NOYW1lPVwiZGVidWdnZXItZmV0Y2gtZnJhbWVzLWxpbmtcIlxyXG4gICAgICAgICAgb25DbGljaz17KCkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnNldFN0YXRlKHtcclxuICAgICAgICAgICAgICBzdGFja0ZyYW1lczogRXhwZWN0LnBlbmRpbmcoKSxcclxuICAgICAgICAgICAgICBjYWxsU3RhY2tMZXZlbHM6IGNhbGxTdGFja0xldmVscyArIExFVkVMU19UT19GRVRDSCxcclxuICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgdGhpcy5fZXhwYW5kZWRTdWJqZWN0Lm5leHQoKVxyXG4gICAgICAgICAgfX1cclxuICAgICAgICA+XHJcbiAgICAgICAgICBMb2FkIE1vcmUgU3RhY2sgRnJhbWVzLi4uXHJcbiAgICAgICAgPC9hPlxyXG4gICAgICA8L2Rpdj5cclxuICAgIClcclxuICB9XHJcbn1cclxuIl19