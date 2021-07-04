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

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlRocmVhZFRyZWVOb2RlLmpzIl0sIm5hbWVzIjpbIkxFVkVMU19UT19GRVRDSCIsIlRocmVhZFRyZWVOb2RlIiwiUmVhY3QiLCJDb21wb25lbnQiLCJjb25zdHJ1Y3RvciIsInByb3BzIiwiX2Rpc3Bvc2FibGVzIiwiX2V4cGFuZGVkU3ViamVjdCIsIl9uZXN0ZWRUcmVlSXRlbSIsImhhbmRsZVNlbGVjdFRocmVhZCIsIm5ld0NvbGxhcHNlZCIsInN0YXRlIiwiaXNDb2xsYXBzZWQiLCJfc2V0Q29sbGFwc2VkIiwiX2hhbmRsZVN0YWNrRnJhbWVDbGljayIsImNsaWNrZWRSb3ciLCJjYWxsRnJhbWVJbmRleCIsInNlcnZpY2UiLCJ2aWV3TW9kZWwiLCJzZXRGb2N1c2VkU3RhY2tGcmFtZSIsImZyYW1lIiwiU3ViamVjdCIsInN0YWNrRnJhbWVzIiwiRXhwZWN0IiwicGVuZGluZyIsImNhbGxTdGFja0xldmVscyIsIlVuaXZlcnNhbERpc3Bvc2FibGUiLCJfdGhyZWFkSXNGb2N1c2VkIiwidGhyZWFkIiwiZm9jdXNlZFRocmVhZCIsInRocmVhZElkIiwiX2dldEZyYW1lcyIsImxldmVscyIsImdldEZ1bGxDYWxsU3RhY2siLCJjb21wb25lbnRXaWxsVW5tb3VudCIsImRpc3Bvc2UiLCJjb21wb25lbnREaWRNb3VudCIsIm1vZGVsIiwiZ2V0TW9kZWwiLCJjaGFuZ2VkQ2FsbFN0YWNrIiwib25EaWRDaGFuZ2VDYWxsU3RhY2siLCJiaW5kIiwiYWRkaXRpb25hbEZvY3VzZWRDaGVjayIsInN0YXJ0V2l0aCIsImFkZCIsIk9ic2VydmFibGUiLCJtZXJnZSIsIm9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cyIsInN1YnNjcmliZSIsIm5ld0lzQ29sbGFwc2VkIiwic2V0VGltZW91dCIsImVsIiwiUmVhY3RET00iLCJmaW5kRE9NTm9kZSIsIkVsZW1lbnQiLCJhc09ic2VydmFibGUiLCJsZXQiLCJzd2l0Y2hNYXAiLCJmcmFtZXMiLCJzZXRTdGF0ZSIsIm9mIiwicmVzdWx0IiwibmV4dCIsIl9nZW5lcmF0ZVRhYmxlIiwiY2hpbGRJdGVtcyIsInJvd3MiLCJtYXAiLCJmcmFtZUluZGV4IiwiYWN0aXZlRnJhbWUiLCJmb2N1c2VkU3RhY2tGcmFtZSIsImlzU2VsZWN0ZWQiLCJjZWxsRGF0YSIsImRhdGEiLCJuYW1lIiwic291cmNlIiwibGluZSIsInJhbmdlIiwiZW5kIiwicm93IiwiY2xhc3NOYW1lIiwidW5kZWZpbmVkIiwiY29sdW1ucyIsInRpdGxlIiwia2V5Iiwid2lkdGgiLCJwcm9jZXNzIiwiZGVidWdnZXJNb2RlIiwiRGVidWdnZXJNb2RlIiwiUlVOTklORyIsImF2YWlsYWJsZSIsInJlbmRlciIsImlzRm9jdXNlZCIsImhhbmRsZVRpdGxlQ2xpY2siLCJldmVudCIsInN0b3BwZWQiLCJzZXRGb2N1c2VkVGhyZWFkIiwic3RvcFByb3BhZ2F0aW9uIiwiY2FuVGVybWluYXRlVGhyZWFkIiwiQm9vbGVhbiIsInNlc3Npb24iLCJjYXBhYmlsaXRpZXMiLCJzdXBwb3J0c1Rlcm1pbmF0ZVRocmVhZHNSZXF1ZXN0IiwidGVybWluYXRlVGhyZWFkIiwidGVybWluYXRlVGhyZWFkcyIsImZvcm1hdHRlZFRpdGxlIiwidGhyZWFkVGl0bGUiLCJpc1BlbmRpbmciLCJpc0Vycm9yIiwidmFsdWUiLCJsZW5ndGgiLCJMT0FESU5HIiwiRVJST1IiLCJlcnJvciIsInRvU3RyaW5nIiwiY2FsbEZyYW1lc0VsZW1lbnRzIiwiZWxlbSIsIl9yZW5kZXJMb2FkTW9yZVN0YWNrRnJhbWVzIiwiYWRkaXRpb25hbEZyYW1lc0F2YWlsYWJsZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUtBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQWxCQTtBQWdDQSxNQUFNQSxlQUFlLEdBQUcsRUFBeEI7O0FBRWUsTUFBTUMsY0FBTixTQUE2QkMsS0FBSyxDQUFDQyxTQUFuQyxDQUEyRDtBQUV4RTtBQUNBO0FBSUFDLEVBQUFBLFdBQVcsQ0FBQ0MsS0FBRCxFQUFlO0FBQ3hCLFVBQU1BLEtBQU47QUFEd0IsU0FOMUJDLFlBTTBCO0FBQUEsU0FIMUJDLGdCQUcwQjtBQUFBLFNBRjFCQyxlQUUwQjs7QUFBQSxTQXNHMUJDLGtCQXRHMEIsR0FzR0wsTUFBTTtBQUN6QixZQUFNQyxZQUFZLEdBQUcsQ0FBQyxLQUFLQyxLQUFMLENBQVdDLFdBQWpDOztBQUNBLFdBQUtDLGFBQUwsQ0FBbUJILFlBQW5CO0FBQ0QsS0F6R3lCOztBQUFBLFNBMkcxQkksc0JBM0cwQixHQTJHRCxDQUFDQyxVQUFELEVBQXFDQyxjQUFyQyxLQUFzRTtBQUM3RixXQUFLWCxLQUFMLENBQVdZLE9BQVgsQ0FBbUJDLFNBQW5CLENBQTZCQyxvQkFBN0IsQ0FBa0RKLFVBQVUsQ0FBQ0ssS0FBN0QsRUFBb0UsSUFBcEU7QUFDRCxLQTdHeUI7O0FBRXhCLFNBQUtiLGdCQUFMLEdBQXdCLElBQUljLHlCQUFKLEVBQXhCO0FBQ0EsU0FBS1YsS0FBTCxHQUFhO0FBQ1hDLE1BQUFBLFdBQVcsRUFBRSxJQURGO0FBRVhVLE1BQUFBLFdBQVcsRUFBRUMsaUJBQU9DLE9BQVAsRUFGRjtBQUdYQyxNQUFBQSxlQUFlLEVBQUU7QUFITixLQUFiO0FBS0EsU0FBS25CLFlBQUwsR0FBb0IsSUFBSW9CLDRCQUFKLEVBQXBCO0FBQ0Q7O0FBRURDLEVBQUFBLGdCQUFnQixHQUFZO0FBQzFCLFVBQU07QUFBRVYsTUFBQUEsT0FBRjtBQUFXVyxNQUFBQTtBQUFYLFFBQXNCLEtBQUt2QixLQUFqQztBQUNBLFVBQU13QixhQUFhLEdBQUdaLE9BQU8sQ0FBQ0MsU0FBUixDQUFrQlcsYUFBeEM7QUFDQSxXQUFPQSxhQUFhLElBQUksSUFBakIsSUFBeUJELE1BQU0sQ0FBQ0UsUUFBUCxLQUFvQkQsYUFBYSxDQUFDQyxRQUFsRTtBQUNEOztBQUVEQyxFQUFBQSxVQUFVLENBQUNDLE1BQUQsRUFBNEQ7QUFDcEU7QUFDQTtBQUNBLFdBQU9BLE1BQU0sSUFBSSxJQUFWLEdBQWlCLEtBQUszQixLQUFMLENBQVd1QixNQUFYLENBQWtCSyxnQkFBbEIsQ0FBbUNELE1BQW5DLENBQWpCLEdBQThELEtBQUszQixLQUFMLENBQVd1QixNQUFYLENBQWtCSyxnQkFBbEIsRUFBckU7QUFDRDs7QUFFREMsRUFBQUEsb0JBQW9CLEdBQVM7QUFDM0IsU0FBSzVCLFlBQUwsQ0FBa0I2QixPQUFsQjtBQUNEOztBQUVEQyxFQUFBQSxpQkFBaUIsR0FBUztBQUN4QixVQUFNO0FBQUVuQixNQUFBQTtBQUFGLFFBQWMsS0FBS1osS0FBekI7QUFDQSxVQUFNZ0MsS0FBSyxHQUFHcEIsT0FBTyxDQUFDcUIsUUFBUixFQUFkO0FBQ0EsVUFBTTtBQUFFcEIsTUFBQUE7QUFBRixRQUFnQkQsT0FBdEI7QUFDQSxVQUFNc0IsZ0JBQWdCLEdBQUcsNENBQWdDRixLQUFLLENBQUNHLG9CQUFOLENBQTJCQyxJQUEzQixDQUFnQ0osS0FBaEMsQ0FBaEMsQ0FBekIsQ0FKd0IsQ0FLeEI7QUFDQTs7QUFDQSxVQUFNSyxzQkFBc0IsR0FBRyxLQUFLZixnQkFBTCxLQUEwQlksZ0JBQWdCLENBQUNJLFNBQWpCLENBQTJCLElBQTNCLENBQTFCLEdBQTZESixnQkFBNUY7O0FBRUEsU0FBS2pDLFlBQUwsQ0FBa0JzQyxHQUFsQixDQUNFQyw2QkFBV0MsS0FBWCxDQUFpQiw0Q0FBZ0M1QixTQUFTLENBQUM2Qix3QkFBVixDQUFtQ04sSUFBbkMsQ0FBd0N2QixTQUF4QyxDQUFoQyxDQUFqQixFQUFzRzhCLFNBQXRHLENBQ0UsTUFBTTtBQUNKLFlBQU07QUFBRXBDLFFBQUFBO0FBQUYsVUFBa0IsS0FBS0QsS0FBN0I7QUFDQSxZQUFNc0MsY0FBYyxHQUFHckMsV0FBVyxJQUFJLENBQUMsS0FBS2UsZ0JBQUwsRUFBdkM7O0FBQ0EsV0FBS2QsYUFBTCxDQUFtQm9DLGNBQW5COztBQUNBQyxNQUFBQSxVQUFVLENBQUMsTUFBTTtBQUNmLFlBQUksS0FBS3ZCLGdCQUFMLE1BQTJCLEtBQUtuQixlQUFMLElBQXdCLElBQXZELEVBQTZEO0FBQzNELGdCQUFNMkMsRUFBRSxHQUFHQyxrQkFBU0MsV0FBVCxDQUFxQixLQUFLN0MsZUFBMUIsQ0FBWDs7QUFDQSxjQUFJMkMsRUFBRSxZQUFZRyxPQUFsQixFQUEyQjtBQUN6Qix3REFBdUJILEVBQXZCLEVBQTJCLEtBQTNCO0FBQ0Q7QUFDRjtBQUNGLE9BUFMsRUFPUCxHQVBPLENBQVY7QUFRRCxLQWJILENBREYsRUFnQkUsS0FBSzVDLGdCQUFMLENBQ0dnRCxZQURILEdBRUdDLEdBRkgsQ0FFTyw4QkFBYSxHQUFiLENBRlAsRUFHR0MsU0FISCxDQUdhLE1BQU07QUFDZixhQUFPLEtBQUsxQixVQUFMLENBQWdCLEtBQUtwQixLQUFMLENBQVdjLGVBQTNCLENBQVA7QUFDRCxLQUxILEVBTUd1QixTQU5ILENBTWNVLE1BQUQsSUFBWTtBQUNyQixXQUFLQyxRQUFMLENBQWM7QUFDWnJDLFFBQUFBLFdBQVcsRUFBRW9DO0FBREQsT0FBZDtBQUdELEtBVkgsQ0FoQkYsRUEyQkVoQixzQkFBc0IsQ0FDbkJjLEdBREgsQ0FDTyw4QkFBYSxHQUFiLENBRFAsRUFFR0MsU0FGSCxDQUVhLE1BQU07QUFDZjtBQUNBO0FBQ0E7QUFDQTtBQUNBLFlBQU1SLGNBQWMsR0FBRyxLQUFLdEMsS0FBTCxDQUFXQyxXQUFYLElBQTBCLENBQUMsS0FBS2UsZ0JBQUwsRUFBbEQsQ0FMZSxDQU9mO0FBQ0E7QUFDQTs7QUFDQSxhQUFPLEtBQUtJLFVBQUwsQ0FBZ0JrQixjQUFjLEdBQUcsQ0FBSCxHQUFPLEtBQUt0QyxLQUFMLENBQVdjLGVBQWhELEVBQWlFZ0MsU0FBakUsQ0FBNEVDLE1BQUQsSUFDaEZiLDZCQUFXZSxFQUFYLENBQWM7QUFDWkYsUUFBQUEsTUFEWTtBQUVaVCxRQUFBQTtBQUZZLE9BQWQsQ0FESyxDQUFQO0FBTUQsS0FsQkgsRUFtQkdELFNBbkJILENBbUJjYSxNQUFELElBQVk7QUFDckIsWUFBTTtBQUFFSCxRQUFBQSxNQUFGO0FBQVVULFFBQUFBO0FBQVYsVUFBNkJZLE1BQW5DO0FBQ0EsV0FBS0YsUUFBTCxDQUFjO0FBQ1pyQyxRQUFBQSxXQUFXLEVBQUVvQyxNQUREO0FBRVo5QyxRQUFBQSxXQUFXLEVBQUVxQztBQUZELE9BQWQ7QUFJRCxLQXpCSCxDQTNCRjtBQXNERDs7QUFFRHBDLEVBQUFBLGFBQWEsQ0FBQ0QsV0FBRCxFQUE2QjtBQUN4QyxTQUFLK0MsUUFBTCxDQUFjO0FBQ1ovQyxNQUFBQTtBQURZLEtBQWQ7O0FBSUEsUUFBSSxDQUFDQSxXQUFMLEVBQWtCO0FBQ2hCLFdBQUtMLGdCQUFMLENBQXNCdUQsSUFBdEI7QUFDRDtBQUNGOztBQVdEQyxFQUFBQSxjQUFjLENBQUNDLFVBQUQsRUFBaUM7QUFDN0MsVUFBTTtBQUFFL0MsTUFBQUE7QUFBRixRQUFjLEtBQUtaLEtBQXpCO0FBQ0EsVUFBTTRELElBQUksR0FBR0QsVUFBVSxDQUFDRSxHQUFYLENBQWUsQ0FBQzlDLEtBQUQsRUFBUStDLFVBQVIsS0FBdUI7QUFDakQsWUFBTUMsV0FBVyxHQUFHbkQsT0FBTyxDQUFDQyxTQUFSLENBQWtCbUQsaUJBQXRDO0FBQ0EsWUFBTUMsVUFBVSxHQUFHRixXQUFXLElBQUksSUFBZixHQUFzQmhELEtBQUssS0FBS2dELFdBQWhDLEdBQThDLEtBQWpFO0FBQ0EsWUFBTUcsUUFBUSxHQUFHO0FBQ2ZDLFFBQUFBLElBQUksRUFBRTtBQUNKQyxVQUFBQSxJQUFJLEVBQUVyRCxLQUFLLENBQUNxRCxJQURSO0FBRUpDLFVBQUFBLE1BQU0sRUFBRXRELEtBQUssQ0FBQ3NELE1BQU4sSUFBZ0IsSUFBaEIsSUFBd0J0RCxLQUFLLENBQUNzRCxNQUFOLENBQWFELElBQWIsSUFBcUIsSUFBN0MsR0FBcUQsR0FBRXJELEtBQUssQ0FBQ3NELE1BQU4sQ0FBYUQsSUFBSyxFQUF6RSxHQUE2RSxFQUZqRjtBQUdKO0FBQ0FFLFVBQUFBLElBQUksRUFBRyxHQUFFdkQsS0FBSyxDQUFDd0QsS0FBTixDQUFZQyxHQUFaLENBQWdCQyxHQUFoQixHQUFzQixDQUFFLEVBSjdCO0FBS0oxRCxVQUFBQSxLQUxJO0FBTUprRCxVQUFBQTtBQU5JLFNBRFM7QUFTZlMsUUFBQUEsU0FBUyxFQUFFVCxVQUFVLEdBQUcsa0VBQUgsR0FBd0VVO0FBVDlFLE9BQWpCO0FBV0EsYUFBT1QsUUFBUDtBQUNELEtBZlksQ0FBYjtBQWdCQSxVQUFNVSxPQUFPLEdBQUcsQ0FDZDtBQUNFQyxNQUFBQSxLQUFLLEVBQUUsTUFEVDtBQUVFQyxNQUFBQSxHQUFHLEVBQUUsTUFGUDtBQUdFQyxNQUFBQSxLQUFLLEVBQUU7QUFIVCxLQURjLEVBTWQ7QUFDRUYsTUFBQUEsS0FBSyxFQUFFLFFBRFQ7QUFFRUMsTUFBQUEsR0FBRyxFQUFFLFFBRlA7QUFHRUMsTUFBQUEsS0FBSyxFQUFFO0FBSFQsS0FOYyxFQVdkO0FBQ0VGLE1BQUFBLEtBQUssRUFBRSxNQURUO0FBRUVDLE1BQUFBLEdBQUcsRUFBRSxNQUZQO0FBR0VDLE1BQUFBLEtBQUssRUFBRTtBQUhULEtBWGMsQ0FBaEI7QUFpQkEsd0JBQ0U7QUFDRSxNQUFBLFNBQVMsRUFBRSx5QkFBVztBQUNwQiwyQ0FBbUMsS0FBSy9FLEtBQUwsQ0FBV3VCLE1BQVgsQ0FBa0J5RCxPQUFsQixDQUEwQkMsWUFBMUIsS0FBMkNDLHdCQUFhQztBQUR2RSxPQUFYO0FBRGIsb0JBS0U7QUFBSyxNQUFBLFNBQVMsRUFBQztBQUFmLG9CQUNFLG9CQUFDLFlBQUQ7QUFDRSxNQUFBLFNBQVMsRUFBQywwQkFEWjtBQUVFLE1BQUEsT0FBTyxFQUFFUCxPQUZYO0FBR0UsTUFBQSxJQUFJLEVBQUVoQixJQUhSO0FBSUUsTUFBQSxVQUFVLEVBQUdNLFFBQUQsSUFBY0EsUUFBUSxDQUFDbkQsS0FBVCxDQUFlc0QsTUFBZixDQUFzQmUsU0FKbEQ7QUFLRSxNQUFBLFNBQVMsRUFBRSxJQUxiO0FBTUUsTUFBQSxRQUFRLEVBQUUsS0FBSzNFLHNCQU5qQjtBQU9FLE1BQUEsUUFBUSxFQUFFO0FBUFosTUFERixDQUxGLENBREY7QUFtQkQ7O0FBRUQ0RSxFQUFBQSxNQUFNLEdBQWU7QUFDbkIsVUFBTTtBQUFFOUQsTUFBQUEsTUFBRjtBQUFVWCxNQUFBQTtBQUFWLFFBQXNCLEtBQUtaLEtBQWpDO0FBQ0EsVUFBTTtBQUFFaUIsTUFBQUEsV0FBRjtBQUFlVixNQUFBQTtBQUFmLFFBQStCLEtBQUtELEtBQTFDOztBQUNBLFVBQU1nRixTQUFTLEdBQUcsS0FBS2hFLGdCQUFMLEVBQWxCOztBQUNBLFVBQU1pRSxnQkFBZ0IsR0FBSUMsS0FBRCxJQUFXO0FBQ2xDLFVBQUlqRSxNQUFNLENBQUNrRSxPQUFYLEVBQW9CO0FBQ2xCN0UsUUFBQUEsT0FBTyxDQUFDQyxTQUFSLENBQWtCNkUsZ0JBQWxCLENBQW1DbkUsTUFBbkMsRUFBMkMsSUFBM0M7QUFDRDs7QUFDRGlFLE1BQUFBLEtBQUssQ0FBQ0csZUFBTjtBQUNELEtBTEQ7O0FBT0EsVUFBTUMsa0JBQWtCLEdBQ3RCQyxPQUFPLENBQUN0RSxNQUFNLENBQUN5RCxPQUFQLENBQWVjLE9BQWYsQ0FBdUJDLFlBQXZCLENBQW9DQywrQkFBckMsQ0FBUCxJQUNBekUsTUFBTSxDQUFDRSxRQUFQLEdBQWtCLENBRGxCLElBRUFGLE1BQU0sQ0FBQ2tFLE9BSFQ7QUFLQSxVQUFNUSxlQUFlLEdBQUdMLGtCQUFrQixnQkFDeEMsb0JBQUMsVUFBRDtBQUNFLE1BQUEsU0FBUyxFQUFDLG1DQURaO0FBRUUsTUFBQSxJQUFJLEVBQUMsR0FGUDtBQUdFLE1BQUEsS0FBSyxFQUFDLGtCQUhSO0FBSUUsTUFBQSxPQUFPLEVBQUUsTUFBTTtBQUNiaEYsUUFBQUEsT0FBTyxDQUFDc0YsZ0JBQVIsQ0FBeUIsQ0FBQyxLQUFLbEcsS0FBTCxDQUFXdUIsTUFBWCxDQUFrQkUsUUFBbkIsQ0FBekI7QUFDRDtBQU5ILE1BRHdDLEdBU3RDLElBVEo7QUFXQSxVQUFNMEUsY0FBYyxnQkFDbEI7QUFDRSxNQUFBLE9BQU8sRUFBRVosZ0JBRFg7QUFFRSxNQUFBLFNBQVMsRUFBRUQsU0FBUyxHQUFHLHlCQUFXLHVDQUFYLENBQUgsR0FBeUQsRUFGL0U7QUFHRSxNQUFBLEtBQUssRUFBRSxnQkFBZ0IvRCxNQUFNLENBQUNFLFFBQXZCLEdBQWtDLFVBQWxDLEdBQStDRixNQUFNLENBQUM2QztBQUgvRCxPQUtHLEtBQUtwRSxLQUFMLENBQVdvRyxXQUxkLE9BSzRCSCxlQUw1QixDQURGOztBQVVBLFFBQUksQ0FBQzFFLE1BQU0sQ0FBQ2tFLE9BQVIsSUFBb0IsQ0FBQ3hFLFdBQVcsQ0FBQ29GLFNBQWIsSUFBMEIsQ0FBQ3BGLFdBQVcsQ0FBQ3FGLE9BQXZDLElBQWtEckYsV0FBVyxDQUFDc0YsS0FBWixDQUFrQkMsTUFBbEIsS0FBNkIsQ0FBdkcsRUFBMkc7QUFDekcsMEJBQU8sb0JBQUMsY0FBRDtBQUFVLFFBQUEsU0FBUyxFQUFDO0FBQXBCLFNBQStDTCxjQUEvQyxDQUFQO0FBQ0Q7O0FBRUQsVUFBTU0sT0FBTyxnQkFDWDtBQUFLLE1BQUEsU0FBUyxFQUFFLHlCQUFXLCtCQUFYLEVBQTRDLHlCQUE1QztBQUFoQixvQkFDRTtBQUFNLE1BQUEsU0FBUyxFQUFDO0FBQWhCLG9CQUNFLG9CQUFDLDhCQUFEO0FBQWdCLE1BQUEsSUFBSSxFQUFDO0FBQXJCLE1BREYsQ0FERixDQURGO0FBUUEsVUFBTUMsS0FBSyxnQkFDVDtBQUFNLE1BQUEsU0FBUyxFQUFDO0FBQWhCLHVDQUMrQnpGLFdBQVcsQ0FBQ3FGLE9BQVosR0FBc0JyRixXQUFXLENBQUMwRixLQUFaLENBQWtCQyxRQUFsQixFQUF0QixHQUFxRCxJQURwRixDQURGO0FBTUEsVUFBTUMsa0JBQWtCLEdBQUc1RixXQUFXLENBQUNvRixTQUFaLEdBQ3ZCSSxPQUR1QixHQUV2QnhGLFdBQVcsQ0FBQ3FGLE9BQVosR0FDQUksS0FEQSxHQUVBLEtBQUtoRCxjQUFMLENBQW9CekMsV0FBVyxDQUFDc0YsS0FBaEMsQ0FKSjtBQU1BLHdCQUNFO0FBQUssTUFBQSxTQUFTLEVBQUM7QUFBZixvQkFDRSxvQkFBQyxvQkFBRDtBQUNFLE1BQUEsS0FBSyxFQUFFSixjQURUO0FBRUUsTUFBQSxTQUFTLEVBQUUsS0FBSzdGLEtBQUwsQ0FBV0MsV0FGeEI7QUFHRSxNQUFBLFFBQVEsRUFBRSxLQUFLSCxrQkFIakI7QUFJRSxNQUFBLEdBQUcsRUFBRzBHLElBQUQsSUFBVyxLQUFLM0csZUFBTCxHQUF1QjJHO0FBSnpDLE9BTUdELGtCQU5ILENBREYsRUFTR3RHLFdBQVcsR0FBRyxJQUFILEdBQVUsS0FBS3dHLDBCQUFMLEVBVHhCLENBREY7QUFhRDs7QUFFREEsRUFBQUEsMEJBQTBCLEdBQXdCO0FBQ2hELFVBQU07QUFBRXhGLE1BQUFBO0FBQUYsUUFBYSxLQUFLdkIsS0FBeEI7QUFDQSxVQUFNO0FBQUVpQixNQUFBQSxXQUFGO0FBQWVHLE1BQUFBO0FBQWYsUUFBbUMsS0FBS2QsS0FBOUM7O0FBRUEsUUFBSSxDQUFDaUIsTUFBTSxDQUFDeUYseUJBQVAsQ0FBaUM1RixlQUFlLEdBQUcsQ0FBbkQsQ0FBRCxJQUEwREgsV0FBVyxDQUFDb0YsU0FBdEUsSUFBbUZwRixXQUFXLENBQUNxRixPQUFuRyxFQUE0RztBQUMxRyxhQUFPLElBQVA7QUFDRDs7QUFFRCx3QkFDRSw4Q0FDRTtBQUNFLE1BQUEsU0FBUyxFQUFDLDRCQURaO0FBRUUsTUFBQSxPQUFPLEVBQUUsTUFBTTtBQUNiLGFBQUtoRCxRQUFMLENBQWM7QUFDWnJDLFVBQUFBLFdBQVcsRUFBRUMsaUJBQU9DLE9BQVAsRUFERDtBQUVaQyxVQUFBQSxlQUFlLEVBQUVBLGVBQWUsR0FBR3pCO0FBRnZCLFNBQWQ7O0FBSUEsYUFBS08sZ0JBQUwsQ0FBc0J1RCxJQUF0QjtBQUNEO0FBUkgsbUNBREYsQ0FERjtBQWdCRDs7QUFsUnVFIiwic291cmNlc0NvbnRlbnQiOlsiLyogZ2xvYmFscyBFbGVtZW50ICovXG5cbmltcG9ydCB0eXBlIHsgSVRocmVhZCwgSVN0YWNrRnJhbWUsIElEZWJ1Z1NlcnZpY2UgfSBmcm9tIFwiLi4vdHlwZXNcIlxuaW1wb3J0IHR5cGUgeyBFeHBlY3RlZCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9leHBlY3RlZFwiXG5cbmltcG9ydCB7IExvYWRpbmdTcGlubmVyIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0xvYWRpbmdTcGlubmVyXCJcbmltcG9ydCB7IHNjcm9sbEludG9WaWV3SWZOZWVkZWQgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvc2Nyb2xsSW50b1ZpZXdcIlxuaW1wb3J0IHsgVGFibGUgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvVGFibGVcIlxuaW1wb3J0IHsgTmVzdGVkVHJlZUl0ZW0sIFRyZWVJdGVtIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL1RyZWVcIlxuaW1wb3J0IHsgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbiB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9ldmVudFwiXG5pbXBvcnQgeyBmYXN0RGVib3VuY2UgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvb2JzZXJ2YWJsZVwiXG5pbXBvcnQgKiBhcyBSZWFjdCBmcm9tIFwicmVhY3RcIlxuaW1wb3J0IHsgT2JzZXJ2YWJsZSwgU3ViamVjdCB9IGZyb20gXCJyeGpzLWNvbXBhdC9idW5kbGVzL3J4anMtY29tcGF0LnVtZC5taW4uanNcIlxuaW1wb3J0IHsgRGVidWdnZXJNb2RlIH0gZnJvbSBcIi4uL2NvbnN0YW50c1wiXG5pbXBvcnQgVW5pdmVyc2FsRGlzcG9zYWJsZSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvVW5pdmVyc2FsRGlzcG9zYWJsZVwiXG5pbXBvcnQgeyBFeHBlY3QgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvZXhwZWN0ZWRcIlxuaW1wb3J0IGNsYXNzbmFtZXMgZnJvbSBcImNsYXNzbmFtZXNcIlxuaW1wb3J0IFJlYWN0RE9NIGZyb20gXCJyZWFjdC1kb21cIlxuaW1wb3J0IHsgSWNvbiB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9JY29uXCJcblxudHlwZSBQcm9wcyA9IHtcbiAgdGhyZWFkOiBJVGhyZWFkLFxuICBzZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuICB0aHJlYWRUaXRsZTogc3RyaW5nLFxufVxuXG50eXBlIFN0YXRlID0ge1xuICBpc0NvbGxhcHNlZDogYm9vbGVhbixcbiAgc3RhY2tGcmFtZXM6IEV4cGVjdGVkPEFycmF5PElTdGFja0ZyYW1lPj4sXG4gIGNhbGxTdGFja0xldmVsczogbnVtYmVyLFxufVxuXG5jb25zdCBMRVZFTFNfVE9fRkVUQ0ggPSAyMFxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBUaHJlYWRUcmVlTm9kZSBleHRlbmRzIFJlYWN0LkNvbXBvbmVudDxQcm9wcywgU3RhdGU+IHtcbiAgX2Rpc3Bvc2FibGVzOiBVbml2ZXJzYWxEaXNwb3NhYmxlXG4gIC8vIFN1YmplY3QgdGhhdCBlbWl0cyBldmVyeSB0aW1lIHRoaXMgbm9kZSB0cmFuc2l0aW9ucyBmcm9tIGNvbGxhcHNlZFxuICAvLyB0byBleHBhbmRlZC5cbiAgX2V4cGFuZGVkU3ViamVjdDogU3ViamVjdDx2b2lkPlxuICBfbmVzdGVkVHJlZUl0ZW06ID9OZXN0ZWRUcmVlSXRlbVxuXG4gIGNvbnN0cnVjdG9yKHByb3BzOiBQcm9wcykge1xuICAgIHN1cGVyKHByb3BzKVxuICAgIHRoaXMuX2V4cGFuZGVkU3ViamVjdCA9IG5ldyBTdWJqZWN0KClcbiAgICB0aGlzLnN0YXRlID0ge1xuICAgICAgaXNDb2xsYXBzZWQ6IHRydWUsXG4gICAgICBzdGFja0ZyYW1lczogRXhwZWN0LnBlbmRpbmcoKSxcbiAgICAgIGNhbGxTdGFja0xldmVsczogMjAsXG4gICAgfVxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoKVxuICB9XG5cbiAgX3RocmVhZElzRm9jdXNlZCgpOiBib29sZWFuIHtcbiAgICBjb25zdCB7IHNlcnZpY2UsIHRocmVhZCB9ID0gdGhpcy5wcm9wc1xuICAgIGNvbnN0IGZvY3VzZWRUaHJlYWQgPSBzZXJ2aWNlLnZpZXdNb2RlbC5mb2N1c2VkVGhyZWFkXG4gICAgcmV0dXJuIGZvY3VzZWRUaHJlYWQgIT0gbnVsbCAmJiB0aHJlYWQudGhyZWFkSWQgPT09IGZvY3VzZWRUaHJlYWQudGhyZWFkSWRcbiAgfVxuXG4gIF9nZXRGcmFtZXMobGV2ZWxzOiA/bnVtYmVyKTogT2JzZXJ2YWJsZTxFeHBlY3RlZDxBcnJheTxJU3RhY2tGcmFtZT4+PiB7XG4gICAgLy8gVE9ETzogc3VwcG9ydCBmcmFtZSBwYWdpbmcgLSBmZXRjaCB+MjAgZnJhbWVzIGhlcmUgYW5kIG9mZmVyXG4gICAgLy8gYSB3YXkgaW4gdGhlIFVJIGZvciB0aGUgdXNlciB0byBhc2sgZm9yIG1vcmVcbiAgICByZXR1cm4gbGV2ZWxzICE9IG51bGwgPyB0aGlzLnByb3BzLnRocmVhZC5nZXRGdWxsQ2FsbFN0YWNrKGxldmVscykgOiB0aGlzLnByb3BzLnRocmVhZC5nZXRGdWxsQ2FsbFN0YWNrKClcbiAgfVxuXG4gIGNvbXBvbmVudFdpbGxVbm1vdW50KCk6IHZvaWQge1xuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgY29tcG9uZW50RGlkTW91bnQoKTogdm9pZCB7XG4gICAgY29uc3QgeyBzZXJ2aWNlIH0gPSB0aGlzLnByb3BzXG4gICAgY29uc3QgbW9kZWwgPSBzZXJ2aWNlLmdldE1vZGVsKClcbiAgICBjb25zdCB7IHZpZXdNb2RlbCB9ID0gc2VydmljZVxuICAgIGNvbnN0IGNoYW5nZWRDYWxsU3RhY2sgPSBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKG1vZGVsLm9uRGlkQ2hhbmdlQ2FsbFN0YWNrLmJpbmQobW9kZWwpKVxuICAgIC8vIFRoZSBSZWFjdCBlbGVtZW50IG1heSBoYXZlIHN1YnNjcmliZWQgdG8gdGhlIGV2ZW50IChjYWxsIHN0YWNrXG4gICAgLy8gY2hhbmdlZCkgYWZ0ZXIgdGhlIGV2ZW50IG9jY3VycmVkLlxuICAgIGNvbnN0IGFkZGl0aW9uYWxGb2N1c2VkQ2hlY2sgPSB0aGlzLl90aHJlYWRJc0ZvY3VzZWQoKSA/IGNoYW5nZWRDYWxsU3RhY2suc3RhcnRXaXRoKG51bGwpIDogY2hhbmdlZENhbGxTdGFja1xuXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgT2JzZXJ2YWJsZS5tZXJnZShvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKHZpZXdNb2RlbC5vbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMuYmluZCh2aWV3TW9kZWwpKSkuc3Vic2NyaWJlKFxuICAgICAgICAoKSA9PiB7XG4gICAgICAgICAgY29uc3QgeyBpc0NvbGxhcHNlZCB9ID0gdGhpcy5zdGF0ZVxuICAgICAgICAgIGNvbnN0IG5ld0lzQ29sbGFwc2VkID0gaXNDb2xsYXBzZWQgJiYgIXRoaXMuX3RocmVhZElzRm9jdXNlZCgpXG4gICAgICAgICAgdGhpcy5fc2V0Q29sbGFwc2VkKG5ld0lzQ29sbGFwc2VkKVxuICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgaWYgKHRoaXMuX3RocmVhZElzRm9jdXNlZCgpICYmIHRoaXMuX25lc3RlZFRyZWVJdGVtICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgY29uc3QgZWwgPSBSZWFjdERPTS5maW5kRE9NTm9kZSh0aGlzLl9uZXN0ZWRUcmVlSXRlbSlcbiAgICAgICAgICAgICAgaWYgKGVsIGluc3RhbmNlb2YgRWxlbWVudCkge1xuICAgICAgICAgICAgICAgIHNjcm9sbEludG9WaWV3SWZOZWVkZWQoZWwsIGZhbHNlKVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSwgMTAwKVxuICAgICAgICB9XG4gICAgICApLFxuICAgICAgdGhpcy5fZXhwYW5kZWRTdWJqZWN0XG4gICAgICAgIC5hc09ic2VydmFibGUoKVxuICAgICAgICAubGV0KGZhc3REZWJvdW5jZSgxMDApKVxuICAgICAgICAuc3dpdGNoTWFwKCgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5fZ2V0RnJhbWVzKHRoaXMuc3RhdGUuY2FsbFN0YWNrTGV2ZWxzKVxuICAgICAgICB9KVxuICAgICAgICAuc3Vic2NyaWJlKChmcmFtZXMpID0+IHtcbiAgICAgICAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgICAgICAgIHN0YWNrRnJhbWVzOiBmcmFtZXMsXG4gICAgICAgICAgfSlcbiAgICAgICAgfSksXG4gICAgICBhZGRpdGlvbmFsRm9jdXNlZENoZWNrXG4gICAgICAgIC5sZXQoZmFzdERlYm91bmNlKDEwMCkpXG4gICAgICAgIC5zd2l0Y2hNYXAoKCkgPT4ge1xuICAgICAgICAgIC8vIElmIHRoaXMgbm9kZSB3YXMgYWxyZWFkeSBjb2xsYXBzZWQsIGl0IHN0YXlzIGNvbGxhcHNlZFxuICAgICAgICAgIC8vIHVubGVzcyB0aGlzIHRocmVhZCBqdXN0IGJlY2FtZSB0aGUgZm9jdXNlZCB0aHJlYWQsIGluXG4gICAgICAgICAgLy8gd2hpY2ggY2FzZSBpdCBhdXRvLWV4cGFuZHMuIElmIHRoaXMgbm9kZSB3YXMgYWxyZWFkeVxuICAgICAgICAgIC8vIGV4cGFuZGVkIGJ5IHRoZSB1c2VyLCBpdCBzdGF5cyBleHBhbmRlZC5cbiAgICAgICAgICBjb25zdCBuZXdJc0NvbGxhcHNlZCA9IHRoaXMuc3RhdGUuaXNDb2xsYXBzZWQgJiYgIXRoaXMuX3RocmVhZElzRm9jdXNlZCgpXG5cbiAgICAgICAgICAvLyBJZiB0aGUgbm9kZSBpcyBjb2xsYXBzZWQsIHdlIG9ubHkgbmVlZCB0byBmZXRjaCB0aGUgZmlyc3QgY2FsbFxuICAgICAgICAgIC8vIGZyYW1lIHRvIGRpc3BsYXkgdGhlIHN0b3AgbG9jYXRpb24gKGlmIGFueSkuIE90aGVyd2lzZSwgd2UgbmVlZFxuICAgICAgICAgIC8vIHRvIGZldGNoIHRoZSBjYWxsIHN0YWNrLlxuICAgICAgICAgIHJldHVybiB0aGlzLl9nZXRGcmFtZXMobmV3SXNDb2xsYXBzZWQgPyAxIDogdGhpcy5zdGF0ZS5jYWxsU3RhY2tMZXZlbHMpLnN3aXRjaE1hcCgoZnJhbWVzKSA9PlxuICAgICAgICAgICAgT2JzZXJ2YWJsZS5vZih7XG4gICAgICAgICAgICAgIGZyYW1lcyxcbiAgICAgICAgICAgICAgbmV3SXNDb2xsYXBzZWQsXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIClcbiAgICAgICAgfSlcbiAgICAgICAgLnN1YnNjcmliZSgocmVzdWx0KSA9PiB7XG4gICAgICAgICAgY29uc3QgeyBmcmFtZXMsIG5ld0lzQ29sbGFwc2VkIH0gPSByZXN1bHRcbiAgICAgICAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgICAgICAgIHN0YWNrRnJhbWVzOiBmcmFtZXMsXG4gICAgICAgICAgICBpc0NvbGxhcHNlZDogbmV3SXNDb2xsYXBzZWQsXG4gICAgICAgICAgfSlcbiAgICAgICAgfSlcbiAgICApXG4gIH1cblxuICBfc2V0Q29sbGFwc2VkKGlzQ29sbGFwc2VkOiBib29sZWFuKTogdm9pZCB7XG4gICAgdGhpcy5zZXRTdGF0ZSh7XG4gICAgICBpc0NvbGxhcHNlZCxcbiAgICB9KVxuXG4gICAgaWYgKCFpc0NvbGxhcHNlZCkge1xuICAgICAgdGhpcy5fZXhwYW5kZWRTdWJqZWN0Lm5leHQoKVxuICAgIH1cbiAgfVxuXG4gIGhhbmRsZVNlbGVjdFRocmVhZCA9ICgpID0+IHtcbiAgICBjb25zdCBuZXdDb2xsYXBzZWQgPSAhdGhpcy5zdGF0ZS5pc0NvbGxhcHNlZFxuICAgIHRoaXMuX3NldENvbGxhcHNlZChuZXdDb2xsYXBzZWQpXG4gIH1cblxuICBfaGFuZGxlU3RhY2tGcmFtZUNsaWNrID0gKGNsaWNrZWRSb3c6IHsgZnJhbWU6IElTdGFja0ZyYW1lIH0sIGNhbGxGcmFtZUluZGV4OiBudW1iZXIpOiB2b2lkID0+IHtcbiAgICB0aGlzLnByb3BzLnNlcnZpY2Uudmlld01vZGVsLnNldEZvY3VzZWRTdGFja0ZyYW1lKGNsaWNrZWRSb3cuZnJhbWUsIHRydWUpXG4gIH1cblxuICBfZ2VuZXJhdGVUYWJsZShjaGlsZEl0ZW1zOiBBcnJheTxJU3RhY2tGcmFtZT4pIHtcbiAgICBjb25zdCB7IHNlcnZpY2UgfSA9IHRoaXMucHJvcHNcbiAgICBjb25zdCByb3dzID0gY2hpbGRJdGVtcy5tYXAoKGZyYW1lLCBmcmFtZUluZGV4KSA9PiB7XG4gICAgICBjb25zdCBhY3RpdmVGcmFtZSA9IHNlcnZpY2Uudmlld01vZGVsLmZvY3VzZWRTdGFja0ZyYW1lXG4gICAgICBjb25zdCBpc1NlbGVjdGVkID0gYWN0aXZlRnJhbWUgIT0gbnVsbCA/IGZyYW1lID09PSBhY3RpdmVGcmFtZSA6IGZhbHNlXG4gICAgICBjb25zdCBjZWxsRGF0YSA9IHtcbiAgICAgICAgZGF0YToge1xuICAgICAgICAgIG5hbWU6IGZyYW1lLm5hbWUsXG4gICAgICAgICAgc291cmNlOiBmcmFtZS5zb3VyY2UgIT0gbnVsbCAmJiBmcmFtZS5zb3VyY2UubmFtZSAhPSBudWxsID8gYCR7ZnJhbWUuc291cmNlLm5hbWV9YCA6IFwiXCIsXG4gICAgICAgICAgLy8gVlNQIGxpbmUgbnVtYmVycyBzdGFydCBhdCAwLlxuICAgICAgICAgIGxpbmU6IGAke2ZyYW1lLnJhbmdlLmVuZC5yb3cgKyAxfWAsXG4gICAgICAgICAgZnJhbWUsXG4gICAgICAgICAgaXNTZWxlY3RlZCxcbiAgICAgICAgfSxcbiAgICAgICAgY2xhc3NOYW1lOiBpc1NlbGVjdGVkID8gXCJkZWJ1Z2dlci1jYWxsc3RhY2staXRlbS1zZWxlY3RlZCBkZWJ1Z2dlci1jdXJyZW50LWxpbmUtaGlnaGxpZ2h0XCIgOiB1bmRlZmluZWQsXG4gICAgICB9XG4gICAgICByZXR1cm4gY2VsbERhdGFcbiAgICB9KVxuICAgIGNvbnN0IGNvbHVtbnMgPSBbXG4gICAgICB7XG4gICAgICAgIHRpdGxlOiBcIk5hbWVcIixcbiAgICAgICAga2V5OiBcIm5hbWVcIixcbiAgICAgICAgd2lkdGg6IDAuNSxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIHRpdGxlOiBcIlNvdXJjZVwiLFxuICAgICAgICBrZXk6IFwic291cmNlXCIsXG4gICAgICAgIHdpZHRoOiAwLjM1LFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgdGl0bGU6IFwiTGluZVwiLFxuICAgICAgICBrZXk6IFwibGluZVwiLFxuICAgICAgICB3aWR0aDogMC4xNSxcbiAgICAgIH0sXG4gICAgXVxuICAgIHJldHVybiAoXG4gICAgICA8ZGl2XG4gICAgICAgIGNsYXNzTmFtZT17Y2xhc3NuYW1lcyh7XG4gICAgICAgICAgXCJkZWJ1Z2dlci1jb250YWluZXItbmV3LWRpc2FibGVkXCI6IHRoaXMucHJvcHMudGhyZWFkLnByb2Nlc3MuZGVidWdnZXJNb2RlID09PSBEZWJ1Z2dlck1vZGUuUlVOTklORyxcbiAgICAgICAgfSl9XG4gICAgICA+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItY2FsbHN0YWNrLXRhYmxlLWRpdlwiPlxuICAgICAgICAgIDxUYWJsZVxuICAgICAgICAgICAgY2xhc3NOYW1lPVwiZGVidWdnZXItY2FsbHN0YWNrLXRhYmxlXCJcbiAgICAgICAgICAgIGNvbHVtbnM9e2NvbHVtbnN9XG4gICAgICAgICAgICByb3dzPXtyb3dzfVxuICAgICAgICAgICAgc2VsZWN0YWJsZT17KGNlbGxEYXRhKSA9PiBjZWxsRGF0YS5mcmFtZS5zb3VyY2UuYXZhaWxhYmxlfVxuICAgICAgICAgICAgcmVzaXphYmxlPXt0cnVlfVxuICAgICAgICAgICAgb25TZWxlY3Q9e3RoaXMuX2hhbmRsZVN0YWNrRnJhbWVDbGlja31cbiAgICAgICAgICAgIHNvcnRhYmxlPXtmYWxzZX1cbiAgICAgICAgICAvPlxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgIClcbiAgfVxuXG4gIHJlbmRlcigpOiBSZWFjdC5Ob2RlIHtcbiAgICBjb25zdCB7IHRocmVhZCwgc2VydmljZSB9ID0gdGhpcy5wcm9wc1xuICAgIGNvbnN0IHsgc3RhY2tGcmFtZXMsIGlzQ29sbGFwc2VkIH0gPSB0aGlzLnN0YXRlXG4gICAgY29uc3QgaXNGb2N1c2VkID0gdGhpcy5fdGhyZWFkSXNGb2N1c2VkKClcbiAgICBjb25zdCBoYW5kbGVUaXRsZUNsaWNrID0gKGV2ZW50KSA9PiB7XG4gICAgICBpZiAodGhyZWFkLnN0b3BwZWQpIHtcbiAgICAgICAgc2VydmljZS52aWV3TW9kZWwuc2V0Rm9jdXNlZFRocmVhZCh0aHJlYWQsIHRydWUpXG4gICAgICB9XG4gICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKVxuICAgIH1cblxuICAgIGNvbnN0IGNhblRlcm1pbmF0ZVRocmVhZCA9XG4gICAgICBCb29sZWFuKHRocmVhZC5wcm9jZXNzLnNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzVGVybWluYXRlVGhyZWFkc1JlcXVlc3QpICYmXG4gICAgICB0aHJlYWQudGhyZWFkSWQgPiAwICYmXG4gICAgICB0aHJlYWQuc3RvcHBlZFxuXG4gICAgY29uc3QgdGVybWluYXRlVGhyZWFkID0gY2FuVGVybWluYXRlVGhyZWFkID8gKFxuICAgICAgPEljb25cbiAgICAgICAgY2xhc3NOYW1lPVwiZGVidWdnZXItdGVybWluYXRlLXRocmVhZC1jb250cm9sXCJcbiAgICAgICAgaWNvbj1cInhcIlxuICAgICAgICB0aXRsZT1cIlRlcm1pbmF0ZSB0aHJlYWRcIlxuICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XG4gICAgICAgICAgc2VydmljZS50ZXJtaW5hdGVUaHJlYWRzKFt0aGlzLnByb3BzLnRocmVhZC50aHJlYWRJZF0pXG4gICAgICAgIH19XG4gICAgICAvPlxuICAgICkgOiBudWxsXG5cbiAgICBjb25zdCBmb3JtYXR0ZWRUaXRsZSA9IChcbiAgICAgIDxzcGFuXG4gICAgICAgIG9uQ2xpY2s9e2hhbmRsZVRpdGxlQ2xpY2t9XG4gICAgICAgIGNsYXNzTmFtZT17aXNGb2N1c2VkID8gY2xhc3NuYW1lcyhcImRlYnVnZ2VyLXRyZWUtcHJvY2Vzcy10aHJlYWQtc2VsZWN0ZWRcIikgOiBcIlwifVxuICAgICAgICB0aXRsZT17XCJUaHJlYWQgSUQ6IFwiICsgdGhyZWFkLnRocmVhZElkICsgXCIsIE5hbWU6IFwiICsgdGhyZWFkLm5hbWV9XG4gICAgICA+XG4gICAgICAgIHt0aGlzLnByb3BzLnRocmVhZFRpdGxlfSB7dGVybWluYXRlVGhyZWFkfVxuICAgICAgPC9zcGFuPlxuICAgIClcblxuICAgIGlmICghdGhyZWFkLnN0b3BwZWQgfHwgKCFzdGFja0ZyYW1lcy5pc1BlbmRpbmcgJiYgIXN0YWNrRnJhbWVzLmlzRXJyb3IgJiYgc3RhY2tGcmFtZXMudmFsdWUubGVuZ3RoID09PSAwKSkge1xuICAgICAgcmV0dXJuIDxUcmVlSXRlbSBjbGFzc05hbWU9XCJkZWJ1Z2dlci10cmVlLW5vLWZyYW1lc1wiPntmb3JtYXR0ZWRUaXRsZX08L1RyZWVJdGVtPlxuICAgIH1cblxuICAgIGNvbnN0IExPQURJTkcgPSAoXG4gICAgICA8ZGl2IGNsYXNzTmFtZT17Y2xhc3NuYW1lcyhcImRlYnVnZ2VyLWV4cHJlc3Npb24tdmFsdWUtcm93XCIsIFwiZGVidWdnZXItdHJlZS1uby1mcmFtZXNcIil9PlxuICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1leHByZXNzaW9uLXZhbHVlLWNvbnRlbnRcIj5cbiAgICAgICAgICA8TG9hZGluZ1NwaW5uZXIgc2l6ZT1cIlNNQUxMXCIgLz5cbiAgICAgICAgPC9zcGFuPlxuICAgICAgPC9kaXY+XG4gICAgKVxuXG4gICAgY29uc3QgRVJST1IgPSAoXG4gICAgICA8c3BhbiBjbGFzc05hbWU9XCJkZWJ1Z2dlci10cmVlLW5vLWZyYW1lc1wiPlxuICAgICAgICBFcnJvciBmZXRjaGluZyBzdGFjayBmcmFtZXMge3N0YWNrRnJhbWVzLmlzRXJyb3IgPyBzdGFja0ZyYW1lcy5lcnJvci50b1N0cmluZygpIDogbnVsbH1cbiAgICAgIDwvc3Bhbj5cbiAgICApXG5cbiAgICBjb25zdCBjYWxsRnJhbWVzRWxlbWVudHMgPSBzdGFja0ZyYW1lcy5pc1BlbmRpbmdcbiAgICAgID8gTE9BRElOR1xuICAgICAgOiBzdGFja0ZyYW1lcy5pc0Vycm9yXG4gICAgICA/IEVSUk9SXG4gICAgICA6IHRoaXMuX2dlbmVyYXRlVGFibGUoc3RhY2tGcmFtZXMudmFsdWUpXG5cbiAgICByZXR1cm4gKFxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci10cmVlLWZyYW1lXCI+XG4gICAgICAgIDxOZXN0ZWRUcmVlSXRlbVxuICAgICAgICAgIHRpdGxlPXtmb3JtYXR0ZWRUaXRsZX1cbiAgICAgICAgICBjb2xsYXBzZWQ9e3RoaXMuc3RhdGUuaXNDb2xsYXBzZWR9XG4gICAgICAgICAgb25TZWxlY3Q9e3RoaXMuaGFuZGxlU2VsZWN0VGhyZWFkfVxuICAgICAgICAgIHJlZj17KGVsZW0pID0+ICh0aGlzLl9uZXN0ZWRUcmVlSXRlbSA9IGVsZW0pfVxuICAgICAgICA+XG4gICAgICAgICAge2NhbGxGcmFtZXNFbGVtZW50c31cbiAgICAgICAgPC9OZXN0ZWRUcmVlSXRlbT5cbiAgICAgICAge2lzQ29sbGFwc2VkID8gbnVsbCA6IHRoaXMuX3JlbmRlckxvYWRNb3JlU3RhY2tGcmFtZXMoKX1cbiAgICAgIDwvZGl2PlxuICAgIClcbiAgfVxuXG4gIF9yZW5kZXJMb2FkTW9yZVN0YWNrRnJhbWVzKCk6ID9SZWFjdC5FbGVtZW50PGFueT4ge1xuICAgIGNvbnN0IHsgdGhyZWFkIH0gPSB0aGlzLnByb3BzXG4gICAgY29uc3QgeyBzdGFja0ZyYW1lcywgY2FsbFN0YWNrTGV2ZWxzIH0gPSB0aGlzLnN0YXRlXG5cbiAgICBpZiAoIXRocmVhZC5hZGRpdGlvbmFsRnJhbWVzQXZhaWxhYmxlKGNhbGxTdGFja0xldmVscyArIDEpIHx8IHN0YWNrRnJhbWVzLmlzUGVuZGluZyB8fCBzdGFja0ZyYW1lcy5pc0Vycm9yKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHJldHVybiAoXG4gICAgICA8ZGl2PlxuICAgICAgICA8YVxuICAgICAgICAgIGNsYXNzTmFtZT1cImRlYnVnZ2VyLWZldGNoLWZyYW1lcy1saW5rXCJcbiAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgICAgICAgICAgc3RhY2tGcmFtZXM6IEV4cGVjdC5wZW5kaW5nKCksXG4gICAgICAgICAgICAgIGNhbGxTdGFja0xldmVsczogY2FsbFN0YWNrTGV2ZWxzICsgTEVWRUxTX1RPX0ZFVENILFxuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIHRoaXMuX2V4cGFuZGVkU3ViamVjdC5uZXh0KClcbiAgICAgICAgICB9fVxuICAgICAgICA+XG4gICAgICAgICAgTG9hZCBNb3JlIFN0YWNrIEZyYW1lcy4uLlxuICAgICAgICA8L2E+XG4gICAgICA8L2Rpdj5cbiAgICApXG4gIH1cbn1cbiJdfQ==