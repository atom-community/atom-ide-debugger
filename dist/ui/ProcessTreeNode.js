"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _AtomInput = require("@atom-ide-community/nuclide-commons-ui/AtomInput");

var _Tree = require("@atom-ide-community/nuclide-commons-ui/Tree");

var _event = require("@atom-ide-community/nuclide-commons/event");

var _observable = require("@atom-ide-community/nuclide-commons/observable");

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var React = _interopRequireWildcard(require("react"));

var _rxjs = require("rxjs");

var _ThreadTreeNode = _interopRequireDefault(require("./ThreadTreeNode"));

var _constants = require("../constants");

var _LoadingSpinner = require("@atom-ide-community/nuclide-commons-ui/LoadingSpinner");

var _Icon = require("@atom-ide-community/nuclide-commons-ui/Icon");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class ProcessTreeNode extends React.Component {
  constructor(props) {
    super(props);
    this._disposables = void 0;
    this._filter = void 0;

    this._handleFocusChanged = () => {
      this.setState(prevState => this._getState(!(this._computeIsFocused() || !prevState.isCollapsed)));
    };

    this._handleCallStackChanged = () => {
      const {
        process
      } = this.props;
      this.setState({
        threads: process.getAllThreads()
      });
    };

    this.handleSelect = () => {
      this.setState(prevState => this._getState(!prevState.isCollapsed));
    };

    this._threadTitle = thread => {
      const stopReason = thread.stoppedDetails == null ? "" : thread.stoppedDetails.description != null ? ": " + thread.stoppedDetails.description : thread.stoppedDetails.reason != null ? ": " + thread.stoppedDetails.reason : "";
      return thread.name + (thread.stopped ? ` (Paused${stopReason})` : " (Running)");
    };

    this.state = this._getState();
    this._disposables = new _UniversalDisposable.default();
  }

  componentDidMount() {
    const {
      service
    } = this.props;
    const model = service.getModel();
    const {
      viewModel
    } = service;

    this._disposables.add(_rxjs.Observable.merge((0, _event.observableFromSubscribeFunction)(viewModel.onDidChangeDebuggerFocus.bind(viewModel))).let((0, _observable.fastDebounce)(15)).subscribe(this._handleFocusChanged), (0, _event.observableFromSubscribeFunction)(model.onDidChangeCallStack.bind(model)).let((0, _observable.fastDebounce)(15)).subscribe(this._handleCallStackChanged), (0, _event.observableFromSubscribeFunction)(service.onDidChangeProcessMode.bind(service)).subscribe(() => this.setState(prevState => this._getState(prevState.isCollapsed))));
  }

  componentWillUnmount() {
    this._disposables.dispose();
  }

  _computeIsFocused() {
    const {
      service,
      process
    } = this.props;
    const focusedProcess = service.viewModel.focusedProcess;
    return process === focusedProcess;
  }

  _getState(shouldBeCollapsed) {
    const {
      process
    } = this.props;

    const isFocused = this._computeIsFocused();

    const pendingStart = process.debuggerMode === _constants.DebuggerMode.STARTING;
    const isCollapsed = shouldBeCollapsed != null ? shouldBeCollapsed : !isFocused;
    return {
      isFocused,
      threads: process.getAllThreads(),
      isCollapsed,
      pendingStart
    };
  }

  // Returns true if thread should be kept.
  filterThread(thread) {
    const {
      filter,
      filterRegEx
    } = this.props;

    if (this.props.showPausedThreadsOnly && !thread.stopped) {
      return false;
    }

    if (filter == null) {
      return true;
    } else if (filterRegEx == null) {
      // User entered an invalid regular expression.
      // Simply check if any thread contains the user's input.
      return this.props.title.toUpperCase().includes(filter.toUpperCase());
    } else {
      return this._threadTitle(thread).match(filterRegEx) != null || thread.getCachedCallStack().some(frame => frame.name.match(filterRegEx) || frame.source.name != null && frame.source.name.match(filterRegEx));
    }
  }

  render() {
    const {
      service,
      title,
      process
    } = this.props;
    const {
      threads,
      isFocused,
      isCollapsed
    } = this.state;
    const readOnly = service.viewModel.focusedProcess != null && service.viewModel.focusedProcess.configuration.isReadOnly;

    const handleTitleClick = event => {
      if (!this._computeIsFocused()) {
        service.viewModel.setFocusedProcess(process, true);
        event.stopPropagation();
      }
    };

    const firstExtension = this.props.process.configuration.servicedFileExtensions == null ? "" : String(this.props.process.configuration.servicedFileExtensions[0]);
    const fileIcon = this.state.pendingStart ? /*#__PURE__*/React.createElement("div", {
      className: "inline-block",
      title: "Starting debugger..."
    }, /*#__PURE__*/React.createElement(_LoadingSpinner.LoadingSpinner, {
      size: _LoadingSpinner.LoadingSpinnerSizes.EXTRA_SMALL,
      className: "inline-block"
    })) : /*#__PURE__*/React.createElement("span", {
      className: `debugger-tree-file-icon ${firstExtension}-icon`,
      onClick: handleTitleClick,
      title: firstExtension.toUpperCase()
    });
    const formattedTitle = /*#__PURE__*/React.createElement("span", null, fileIcon, /*#__PURE__*/React.createElement("span", {
      onClick: handleTitleClick,
      className: isFocused ? "debugger-tree-process debugger-tree-process-thread-selected" : "debugger-tree-process",
      title: title
    }, title, readOnly ? " (READ ONLY)" : null));
    const filteredThreads = threads.filter(t => this.filterThread(t));
    const focusedThread = service.viewModel.focusedThread;
    const selectedThreadFiltered = threads.some(t => t === focusedThread) && !filteredThreads.some(t => t === focusedThread);
    const focusedThreadHiddenWarning = /*#__PURE__*/React.createElement("span", {
      className: "debugger-thread-no-match-text"
    }, /*#__PURE__*/React.createElement(_Icon.Icon, {
      icon: "nuclicon-warning"
    }), "The focused thread is hidden by your thread filter!");
    return threads.length === 0 ? /*#__PURE__*/React.createElement(_Tree.TreeItem, null, formattedTitle) : /*#__PURE__*/React.createElement(_Tree.NestedTreeItem, {
      title: formattedTitle,
      collapsed: isCollapsed,
      onSelect: this.handleSelect
    }, filteredThreads.length === 0 && threads.length > 0 ? selectedThreadFiltered ? focusedThreadHiddenWarning : /*#__PURE__*/React.createElement("span", {
      className: "debugger-thread-no-match-text"
    }, "No threads match the current filter.") : filteredThreads.map((thread, threadIndex) => /*#__PURE__*/React.createElement(_ThreadTreeNode.default, {
      key: threadIndex,
      thread: thread,
      service: service,
      threadTitle: this._threadTitle(thread)
    })).concat(selectedThreadFiltered ? focusedThreadHiddenWarning : null));
  }

}

exports.default = ProcessTreeNode;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlByb2Nlc3NUcmVlTm9kZS5qcyJdLCJuYW1lcyI6WyJQcm9jZXNzVHJlZU5vZGUiLCJSZWFjdCIsIkNvbXBvbmVudCIsImNvbnN0cnVjdG9yIiwicHJvcHMiLCJfZGlzcG9zYWJsZXMiLCJfZmlsdGVyIiwiX2hhbmRsZUZvY3VzQ2hhbmdlZCIsInNldFN0YXRlIiwicHJldlN0YXRlIiwiX2dldFN0YXRlIiwiX2NvbXB1dGVJc0ZvY3VzZWQiLCJpc0NvbGxhcHNlZCIsIl9oYW5kbGVDYWxsU3RhY2tDaGFuZ2VkIiwicHJvY2VzcyIsInRocmVhZHMiLCJnZXRBbGxUaHJlYWRzIiwiaGFuZGxlU2VsZWN0IiwiX3RocmVhZFRpdGxlIiwidGhyZWFkIiwic3RvcFJlYXNvbiIsInN0b3BwZWREZXRhaWxzIiwiZGVzY3JpcHRpb24iLCJyZWFzb24iLCJuYW1lIiwic3RvcHBlZCIsInN0YXRlIiwiVW5pdmVyc2FsRGlzcG9zYWJsZSIsImNvbXBvbmVudERpZE1vdW50Iiwic2VydmljZSIsIm1vZGVsIiwiZ2V0TW9kZWwiLCJ2aWV3TW9kZWwiLCJhZGQiLCJPYnNlcnZhYmxlIiwibWVyZ2UiLCJvbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMiLCJiaW5kIiwibGV0Iiwic3Vic2NyaWJlIiwib25EaWRDaGFuZ2VDYWxsU3RhY2siLCJvbkRpZENoYW5nZVByb2Nlc3NNb2RlIiwiY29tcG9uZW50V2lsbFVubW91bnQiLCJkaXNwb3NlIiwiZm9jdXNlZFByb2Nlc3MiLCJzaG91bGRCZUNvbGxhcHNlZCIsImlzRm9jdXNlZCIsInBlbmRpbmdTdGFydCIsImRlYnVnZ2VyTW9kZSIsIkRlYnVnZ2VyTW9kZSIsIlNUQVJUSU5HIiwiZmlsdGVyVGhyZWFkIiwiZmlsdGVyIiwiZmlsdGVyUmVnRXgiLCJzaG93UGF1c2VkVGhyZWFkc09ubHkiLCJ0aXRsZSIsInRvVXBwZXJDYXNlIiwiaW5jbHVkZXMiLCJtYXRjaCIsImdldENhY2hlZENhbGxTdGFjayIsInNvbWUiLCJmcmFtZSIsInNvdXJjZSIsInJlbmRlciIsInJlYWRPbmx5IiwiY29uZmlndXJhdGlvbiIsImlzUmVhZE9ubHkiLCJoYW5kbGVUaXRsZUNsaWNrIiwiZXZlbnQiLCJzZXRGb2N1c2VkUHJvY2VzcyIsInN0b3BQcm9wYWdhdGlvbiIsImZpcnN0RXh0ZW5zaW9uIiwic2VydmljZWRGaWxlRXh0ZW5zaW9ucyIsIlN0cmluZyIsImZpbGVJY29uIiwiTG9hZGluZ1NwaW5uZXJTaXplcyIsIkVYVFJBX1NNQUxMIiwiZm9ybWF0dGVkVGl0bGUiLCJmaWx0ZXJlZFRocmVhZHMiLCJ0IiwiZm9jdXNlZFRocmVhZCIsInNlbGVjdGVkVGhyZWFkRmlsdGVyZWQiLCJmb2N1c2VkVGhyZWFkSGlkZGVuV2FybmluZyIsImxlbmd0aCIsIm1hcCIsInRocmVhZEluZGV4IiwiY29uY2F0Il0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBa0JlLE1BQU1BLGVBQU4sU0FBOEJDLEtBQUssQ0FBQ0MsU0FBcEMsQ0FBNEQ7QUFJekVDLEVBQUFBLFdBQVcsQ0FBQ0MsS0FBRCxFQUFlO0FBQ3hCLFVBQU1BLEtBQU47QUFEd0IsU0FIMUJDLFlBRzBCO0FBQUEsU0FGMUJDLE9BRTBCOztBQUFBLFNBMkIxQkMsbUJBM0IwQixHQTJCSixNQUFZO0FBQ2hDLFdBQUtDLFFBQUwsQ0FBZUMsU0FBRCxJQUFlLEtBQUtDLFNBQUwsQ0FBZSxFQUFFLEtBQUtDLGlCQUFMLE1BQTRCLENBQUNGLFNBQVMsQ0FBQ0csV0FBekMsQ0FBZixDQUE3QjtBQUNELEtBN0J5Qjs7QUFBQSxTQStCMUJDLHVCQS9CMEIsR0ErQkEsTUFBWTtBQUNwQyxZQUFNO0FBQUVDLFFBQUFBO0FBQUYsVUFBYyxLQUFLVixLQUF6QjtBQUNBLFdBQUtJLFFBQUwsQ0FBYztBQUNaTyxRQUFBQSxPQUFPLEVBQUVELE9BQU8sQ0FBQ0UsYUFBUjtBQURHLE9BQWQ7QUFHRCxLQXBD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R0FPQ0osZUFBZSxDQUNaTSxHQURILENBQ08sQ0FBQ2pFLE1BQUQsRUFBU2tFLFdBQVQsa0JBQ0gsb0JBQUMsdUJBQUQ7QUFDRSxNQUFBLEdBQUcsRUFBRUEsV0FEUDtBQUVFLE1BQUEsTUFBTSxFQUFFbEUsTUFGVjtBQUdFLE1BQUEsT0FBTyxFQUFFVSxPQUhYO0FBSUUsTUFBQSxXQUFXLEVBQUUsS0FBS1gsWUFBTCxDQUFrQkMsTUFBbEI7QUFKZixNQUZKLEVBU0dtRSxNQVRILENBU1VMLHNCQUFzQixHQUFHQywwQkFBSCxHQUFnQyxJQVRoRSxDQVJKLENBSEY7QUF3QkQ7O0FBdEx3RSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgSVByb2Nlc3MsIElEZWJ1Z1NlcnZpY2UsIElUaHJlYWQgfSBmcm9tIFwiLi4vdHlwZXNcIlxuXG5pbXBvcnQgeyBBdG9tSW5wdXQgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvQXRvbUlucHV0XCJcbmltcG9ydCB7IFRyZWVJdGVtLCBOZXN0ZWRUcmVlSXRlbSB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9UcmVlXCJcbmltcG9ydCB7IG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24gfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvZXZlbnRcIlxuaW1wb3J0IHsgZmFzdERlYm91bmNlIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL29ic2VydmFibGVcIlxuaW1wb3J0IFVuaXZlcnNhbERpc3Bvc2FibGUgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL1VuaXZlcnNhbERpc3Bvc2FibGVcIlxuaW1wb3J0ICogYXMgUmVhY3QgZnJvbSBcInJlYWN0XCJcbmltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tIFwicnhqc1wiXG5pbXBvcnQgVGhyZWFkVHJlZU5vZGUgZnJvbSBcIi4vVGhyZWFkVHJlZU5vZGVcIlxuaW1wb3J0IHsgRGVidWdnZXJNb2RlIH0gZnJvbSBcIi4uL2NvbnN0YW50c1wiXG5pbXBvcnQgeyBMb2FkaW5nU3Bpbm5lclNpemVzLCBMb2FkaW5nU3Bpbm5lciB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9Mb2FkaW5nU3Bpbm5lclwiXG5pbXBvcnQgeyBJY29uIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0ljb25cIlxuXG50eXBlIFByb3BzID0ge1xuICBwcm9jZXNzOiBJUHJvY2VzcyxcbiAgc2VydmljZTogSURlYnVnU2VydmljZSxcbiAgdGl0bGU6IHN0cmluZyxcbiAgZmlsdGVyOiA/c3RyaW5nLFxuICBmaWx0ZXJSZWdFeDogP1JlZ0V4cCxcbiAgc2hvd1BhdXNlZFRocmVhZHNPbmx5OiBib29sZWFuLFxufVxuXG50eXBlIFN0YXRlID0ge1xuICBpc0NvbGxhcHNlZDogYm9vbGVhbixcbiAgdGhyZWFkczogQXJyYXk8SVRocmVhZD4sXG4gIGlzRm9jdXNlZDogYm9vbGVhbixcbiAgcGVuZGluZ1N0YXJ0OiBib29sZWFuLFxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBQcm9jZXNzVHJlZU5vZGUgZXh0ZW5kcyBSZWFjdC5Db21wb25lbnQ8UHJvcHMsIFN0YXRlPiB7XG4gIF9kaXNwb3NhYmxlczogVW5pdmVyc2FsRGlzcG9zYWJsZVxuICBfZmlsdGVyOiA/QXRvbUlucHV0XG5cbiAgY29uc3RydWN0b3IocHJvcHM6IFByb3BzKSB7XG4gICAgc3VwZXIocHJvcHMpXG4gICAgdGhpcy5zdGF0ZSA9IHRoaXMuX2dldFN0YXRlKClcbiAgICB0aGlzLl9kaXNwb3NhYmxlcyA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKClcbiAgfVxuXG4gIGNvbXBvbmVudERpZE1vdW50KCk6IHZvaWQge1xuICAgIGNvbnN0IHsgc2VydmljZSB9ID0gdGhpcy5wcm9wc1xuICAgIGNvbnN0IG1vZGVsID0gc2VydmljZS5nZXRNb2RlbCgpXG4gICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IHNlcnZpY2VcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5hZGQoXG4gICAgICBPYnNlcnZhYmxlLm1lcmdlKG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24odmlld01vZGVsLm9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cy5iaW5kKHZpZXdNb2RlbCkpKVxuICAgICAgICAubGV0KGZhc3REZWJvdW5jZSgxNSkpXG4gICAgICAgIC5zdWJzY3JpYmUodGhpcy5faGFuZGxlRm9jdXNDaGFuZ2VkKSxcbiAgICAgIG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24obW9kZWwub25EaWRDaGFuZ2VDYWxsU3RhY2suYmluZChtb2RlbCkpXG4gICAgICAgIC5sZXQoZmFzdERlYm91bmNlKDE1KSlcbiAgICAgICAgLnN1YnNjcmliZSh0aGlzLl9oYW5kbGVDYWxsU3RhY2tDaGFuZ2VkKSxcbiAgICAgIG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24oc2VydmljZS5vbkRpZENoYW5nZVByb2Nlc3NNb2RlLmJpbmQoc2VydmljZSkpLnN1YnNjcmliZSgoKSA9PlxuICAgICAgICB0aGlzLnNldFN0YXRlKChwcmV2U3RhdGUpID0+IHRoaXMuX2dldFN0YXRlKHByZXZTdGF0ZS5pc0NvbGxhcHNlZCkpXG4gICAgICApXG4gICAgKVxuICB9XG5cbiAgY29tcG9uZW50V2lsbFVubW91bnQoKSB7XG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gIH1cblxuICBfaGFuZGxlRm9jdXNDaGFuZ2VkID0gKCk6IHZvaWQgPT4ge1xuICAgIHRoaXMuc2V0U3RhdGUoKHByZXZTdGF0ZSkgPT4gdGhpcy5fZ2V0U3RhdGUoISh0aGlzLl9jb21wdXRlSXNGb2N1c2VkKCkgfHwgIXByZXZTdGF0ZS5pc0NvbGxhcHNlZCkpKVxuICB9XG5cbiAgX2hhbmRsZUNhbGxTdGFja0NoYW5nZWQgPSAoKTogdm9pZCA9PiB7XG4gICAgY29uc3QgeyBwcm9jZXNzIH0gPSB0aGlzLnByb3BzXG4gICAgdGhpcy5zZXRTdGF0ZSh7XG4gICAgICB0aHJlYWRzOiBwcm9jZXNzLmdldEFsbFRocmVhZHMoKSxcbiAgICB9KVxuICB9XG5cbiAgX2NvbXB1dGVJc0ZvY3VzZWQoKTogYm9vbGVhbiB7XG4gICAgY29uc3QgeyBzZXJ2aWNlLCBwcm9jZXNzIH0gPSB0aGlzLnByb3BzXG4gICAgY29uc3QgZm9jdXNlZFByb2Nlc3MgPSBzZXJ2aWNlLnZpZXdNb2RlbC5mb2N1c2VkUHJvY2Vzc1xuICAgIHJldHVybiBwcm9jZXNzID09PSBmb2N1c2VkUHJvY2Vzc1xuICB9XG5cbiAgX2dldFN0YXRlKHNob3VsZEJlQ29sbGFwc2VkOiA/Ym9vbGVhbikge1xuICAgIGNvbnN0IHsgcHJvY2VzcyB9ID0gdGhpcy5wcm9wc1xuICAgIGNvbnN0IGlzRm9jdXNlZCA9IHRoaXMuX2NvbXB1dGVJc0ZvY3VzZWQoKVxuICAgIGNvbnN0IHBlbmRpbmdTdGFydCA9IHByb2Nlc3MuZGVidWdnZXJNb2RlID09PSBEZWJ1Z2dlck1vZGUuU1RBUlRJTkdcbiAgICBjb25zdCBpc0NvbGxhcHNlZCA9IHNob3VsZEJlQ29sbGFwc2VkICE9IG51bGwgPyBzaG91bGRCZUNvbGxhcHNlZCA6ICFpc0ZvY3VzZWRcbiAgICByZXR1cm4ge1xuICAgICAgaXNGb2N1c2VkLFxuICAgICAgdGhyZWFkczogcHJvY2Vzcy5nZXRBbGxUaHJlYWRzKCksXG4gICAgICBpc0NvbGxhcHNlZCxcbiAgICAgIHBlbmRpbmdTdGFydCxcbiAgICB9XG4gIH1cblxuICBoYW5kbGVTZWxlY3QgPSAoKSA9PiB7XG4gICAgdGhpcy5zZXRTdGF0ZSgocHJldlN0YXRlKSA9PiB0aGlzLl9nZXRTdGF0ZSghcHJldlN0YXRlLmlzQ29sbGFwc2VkKSlcbiAgfVxuXG4gIF90aHJlYWRUaXRsZSA9ICh0aHJlYWQ6IElUaHJlYWQpID0+IHtcbiAgICBjb25zdCBzdG9wUmVhc29uID1cbiAgICAgIHRocmVhZC5zdG9wcGVkRGV0YWlscyA9PSBudWxsXG4gICAgICAgID8gXCJcIlxuICAgICAgICA6IHRocmVhZC5zdG9wcGVkRGV0YWlscy5kZXNjcmlwdGlvbiAhPSBudWxsXG4gICAgICAgID8gXCI6IFwiICsgdGhyZWFkLnN0b3BwZWREZXRhaWxzLmRlc2NyaXB0aW9uXG4gICAgICAgIDogdGhyZWFkLnN0b3BwZWREZXRhaWxzLnJlYXNvbiAhPSBudWxsXG4gICAgICAgID8gXCI6IFwiICsgdGhyZWFkLnN0b3BwZWREZXRhaWxzLnJlYXNvblxuICAgICAgICA6IFwiXCJcbiAgICByZXR1cm4gdGhyZWFkLm5hbWUgKyAodGhyZWFkLnN0b3BwZWQgPyBgIChQYXVzZWQke3N0b3BSZWFzb259KWAgOiBcIiAoUnVubmluZylcIilcbiAgfVxuXG4gIC8vIFJldHVybnMgdHJ1ZSBpZiB0aHJlYWQgc2hvdWxkIGJlIGtlcHQuXG4gIGZpbHRlclRocmVhZCh0aHJlYWQ6IElUaHJlYWQpOiBib29sZWFuIHtcbiAgICBjb25zdCB7IGZpbHRlciwgZmlsdGVyUmVnRXggfSA9IHRoaXMucHJvcHNcbiAgICBpZiAodGhpcy5wcm9wcy5zaG93UGF1c2VkVGhyZWFkc09ubHkgJiYgIXRocmVhZC5zdG9wcGVkKSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG5cbiAgICBpZiAoZmlsdGVyID09IG51bGwpIHtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfSBlbHNlIGlmIChmaWx0ZXJSZWdFeCA9PSBudWxsKSB7XG4gICAgICAvLyBVc2VyIGVudGVyZWQgYW4gaW52YWxpZCByZWd1bGFyIGV4cHJlc3Npb24uXG4gICAgICAvLyBTaW1wbHkgY2hlY2sgaWYgYW55IHRocmVhZCBjb250YWlucyB0aGUgdXNlcidzIGlucHV0LlxuICAgICAgcmV0dXJuIHRoaXMucHJvcHMudGl0bGUudG9VcHBlckNhc2UoKS5pbmNsdWRlcyhmaWx0ZXIudG9VcHBlckNhc2UoKSlcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIChcbiAgICAgICAgdGhpcy5fdGhyZWFkVGl0bGUodGhyZWFkKS5tYXRjaChmaWx0ZXJSZWdFeCkgIT0gbnVsbCB8fFxuICAgICAgICB0aHJlYWRcbiAgICAgICAgICAuZ2V0Q2FjaGVkQ2FsbFN0YWNrKClcbiAgICAgICAgICAuc29tZShcbiAgICAgICAgICAgIChmcmFtZSkgPT5cbiAgICAgICAgICAgICAgZnJhbWUubmFtZS5tYXRjaChmaWx0ZXJSZWdFeCkgfHwgKGZyYW1lLnNvdXJjZS5uYW1lICE9IG51bGwgJiYgZnJhbWUuc291cmNlLm5hbWUubWF0Y2goZmlsdGVyUmVnRXgpKVxuICAgICAgICAgIClcbiAgICAgIClcbiAgICB9XG4gIH1cblxuICByZW5kZXIoKSB7XG4gICAgY29uc3QgeyBzZXJ2aWNlLCB0aXRsZSwgcHJvY2VzcyB9ID0gdGhpcy5wcm9wc1xuICAgIGNvbnN0IHsgdGhyZWFkcywgaXNGb2N1c2VkLCBpc0NvbGxhcHNlZCB9ID0gdGhpcy5zdGF0ZVxuXG4gICAgY29uc3QgcmVhZE9ubHkgPVxuICAgICAgc2VydmljZS52aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3MgIT0gbnVsbCAmJiBzZXJ2aWNlLnZpZXdNb2RlbC5mb2N1c2VkUHJvY2Vzcy5jb25maWd1cmF0aW9uLmlzUmVhZE9ubHlcbiAgICBjb25zdCBoYW5kbGVUaXRsZUNsaWNrID0gKGV2ZW50KSA9PiB7XG4gICAgICBpZiAoIXRoaXMuX2NvbXB1dGVJc0ZvY3VzZWQoKSkge1xuICAgICAgICBzZXJ2aWNlLnZpZXdNb2RlbC5zZXRGb2N1c2VkUHJvY2Vzcyhwcm9jZXNzLCB0cnVlKVxuICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IGZpcnN0RXh0ZW5zaW9uID1cbiAgICAgIHRoaXMucHJvcHMucHJvY2Vzcy5jb25maWd1cmF0aW9uLnNlcnZpY2VkRmlsZUV4dGVuc2lvbnMgPT0gbnVsbFxuICAgICAgICA/IFwiXCJcbiAgICAgICAgOiBTdHJpbmcodGhpcy5wcm9wcy5wcm9jZXNzLmNvbmZpZ3VyYXRpb24uc2VydmljZWRGaWxlRXh0ZW5zaW9uc1swXSlcbiAgICBjb25zdCBmaWxlSWNvbiA9IHRoaXMuc3RhdGUucGVuZGluZ1N0YXJ0ID8gKFxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJpbmxpbmUtYmxvY2tcIiB0aXRsZT1cIlN0YXJ0aW5nIGRlYnVnZ2VyLi4uXCI+XG4gICAgICAgIDxMb2FkaW5nU3Bpbm5lciBzaXplPXtMb2FkaW5nU3Bpbm5lclNpemVzLkVYVFJBX1NNQUxMfSBjbGFzc05hbWU9XCJpbmxpbmUtYmxvY2tcIiAvPlxuICAgICAgPC9kaXY+XG4gICAgKSA6IChcbiAgICAgIDxzcGFuXG4gICAgICAgIGNsYXNzTmFtZT17YGRlYnVnZ2VyLXRyZWUtZmlsZS1pY29uICR7Zmlyc3RFeHRlbnNpb259LWljb25gfVxuICAgICAgICBvbkNsaWNrPXtoYW5kbGVUaXRsZUNsaWNrfVxuICAgICAgICB0aXRsZT17Zmlyc3RFeHRlbnNpb24udG9VcHBlckNhc2UoKX1cbiAgICAgIC8+XG4gICAgKVxuXG4gICAgY29uc3QgZm9ybWF0dGVkVGl0bGUgPSAoXG4gICAgICA8c3Bhbj5cbiAgICAgICAge2ZpbGVJY29ufVxuICAgICAgICA8c3BhblxuICAgICAgICAgIG9uQ2xpY2s9e2hhbmRsZVRpdGxlQ2xpY2t9XG4gICAgICAgICAgY2xhc3NOYW1lPXtcbiAgICAgICAgICAgIGlzRm9jdXNlZCA/IFwiZGVidWdnZXItdHJlZS1wcm9jZXNzIGRlYnVnZ2VyLXRyZWUtcHJvY2Vzcy10aHJlYWQtc2VsZWN0ZWRcIiA6IFwiZGVidWdnZXItdHJlZS1wcm9jZXNzXCJcbiAgICAgICAgICB9XG4gICAgICAgICAgdGl0bGU9e3RpdGxlfVxuICAgICAgICA+XG4gICAgICAgICAge3RpdGxlfVxuICAgICAgICAgIHtyZWFkT25seSA/IFwiIChSRUFEIE9OTFkpXCIgOiBudWxsfVxuICAgICAgICA8L3NwYW4+XG4gICAgICA8L3NwYW4+XG4gICAgKVxuXG4gICAgY29uc3QgZmlsdGVyZWRUaHJlYWRzID0gdGhyZWFkcy5maWx0ZXIoKHQpID0+IHRoaXMuZmlsdGVyVGhyZWFkKHQpKVxuICAgIGNvbnN0IGZvY3VzZWRUaHJlYWQgPSBzZXJ2aWNlLnZpZXdNb2RlbC5mb2N1c2VkVGhyZWFkXG4gICAgY29uc3Qgc2VsZWN0ZWRUaHJlYWRGaWx0ZXJlZCA9XG4gICAgICB0aHJlYWRzLnNvbWUoKHQpID0+IHQgPT09IGZvY3VzZWRUaHJlYWQpICYmICFmaWx0ZXJlZFRocmVhZHMuc29tZSgodCkgPT4gdCA9PT0gZm9jdXNlZFRocmVhZClcbiAgICBjb25zdCBmb2N1c2VkVGhyZWFkSGlkZGVuV2FybmluZyA9IChcbiAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImRlYnVnZ2VyLXRocmVhZC1uby1tYXRjaC10ZXh0XCI+XG4gICAgICAgIDxJY29uIGljb249XCJudWNsaWNvbi13YXJuaW5nXCIgLz5cbiAgICAgICAgVGhlIGZvY3VzZWQgdGhyZWFkIGlzIGhpZGRlbiBieSB5b3VyIHRocmVhZCBmaWx0ZXIhXG4gICAgICA8L3NwYW4+XG4gICAgKVxuICAgIHJldHVybiB0aHJlYWRzLmxlbmd0aCA9PT0gMCA/IChcbiAgICAgIDxUcmVlSXRlbT57Zm9ybWF0dGVkVGl0bGV9PC9UcmVlSXRlbT5cbiAgICApIDogKFxuICAgICAgPE5lc3RlZFRyZWVJdGVtIHRpdGxlPXtmb3JtYXR0ZWRUaXRsZX0gY29sbGFwc2VkPXtpc0NvbGxhcHNlZH0gb25TZWxlY3Q9e3RoaXMuaGFuZGxlU2VsZWN0fT5cbiAgICAgICAge2ZpbHRlcmVkVGhyZWFkcy5sZW5ndGggPT09IDAgJiYgdGhyZWFkcy5sZW5ndGggPiAwID8gKFxuICAgICAgICAgIHNlbGVjdGVkVGhyZWFkRmlsdGVyZWQgPyAoXG4gICAgICAgICAgICBmb2N1c2VkVGhyZWFkSGlkZGVuV2FybmluZ1xuICAgICAgICAgICkgOiAoXG4gICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJkZWJ1Z2dlci10aHJlYWQtbm8tbWF0Y2gtdGV4dFwiPk5vIHRocmVhZHMgbWF0Y2ggdGhlIGN1cnJlbnQgZmlsdGVyLjwvc3Bhbj5cbiAgICAgICAgICApXG4gICAgICAgICkgOiAoXG4gICAgICAgICAgZmlsdGVyZWRUaHJlYWRzXG4gICAgICAgICAgICAubWFwKCh0aHJlYWQsIHRocmVhZEluZGV4KSA9PiAoXG4gICAgICAgICAgICAgIDxUaHJlYWRUcmVlTm9kZVxuICAgICAgICAgICAgICAgIGtleT17dGhyZWFkSW5kZXh9XG4gICAgICAgICAgICAgICAgdGhyZWFkPXt0aHJlYWR9XG4gICAgICAgICAgICAgICAgc2VydmljZT17c2VydmljZX1cbiAgICAgICAgICAgICAgICB0aHJlYWRUaXRsZT17dGhpcy5fdGhyZWFkVGl0bGUodGhyZWFkKX1cbiAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICkpXG4gICAgICAgICAgICAuY29uY2F0KHNlbGVjdGVkVGhyZWFkRmlsdGVyZWQgPyBmb2N1c2VkVGhyZWFkSGlkZGVuV2FybmluZyA6IG51bGwpXG4gICAgICAgICl9XG4gICAgICA8L05lc3RlZFRyZWVJdGVtPlxuICAgIClcbiAgfVxufVxuIl19