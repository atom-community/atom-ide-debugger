"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var _assert = _interopRequireDefault(require("assert"));

var React = _interopRequireWildcard(require("react"));

var _nuclideUri = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/nuclideUri"));

var _Checkbox = require("@atom-ide-community/nuclide-commons-ui/Checkbox");

var _analytics = require("@atom-ide-community/nuclide-commons/analytics");

var _ListView = require("@atom-ide-community/nuclide-commons-ui/ListView");

var _classnames = _interopRequireDefault(require("classnames"));

var _Icon = require("@atom-ide-community/nuclide-commons-ui/Icon");

var _rxjs = require("rxjs");

var _constants = require("../constants");

var _utils = require("../utils");

var _Section = require("@atom-ide-community/nuclide-commons-ui/Section");

var _featureConfig = _interopRequireDefault(require("@atom-ide-community/nuclide-commons-atom/feature-config"));

var _projects = require("@atom-ide-community/nuclide-commons-atom/projects");

var _passesGK = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/passesGK"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class BreakpointListComponent extends React.Component {
  constructor(props) {
    super(props);
    this._disposables = void 0;

    this._handleBreakpointEnabledChange = (breakpoint, enabled) => {
      this.props.service.enableOrDisableBreakpoints(enabled, breakpoint);
    };

    this._handleBreakpointClick = (breakpointIndex, breakpoint) => {
      (0, _assert.default)(breakpoint != null);
      const {
        uri,
        line
      } = breakpoint; // Debugger model is 1-based while Atom UI is zero-based.

      (0, _utils.openSourceLocation)(uri, line - 1);
    };

    this._setExceptionCollapsed = collapsed => {
      _featureConfig.default.set("debugger-exceptionBreakpointsCollapsed", collapsed);

      this.setState({
        exceptionBreakpointsCollapsed: collapsed
      });
    };

    this._setUnavailableCollapsed = collapsed => {
      this.setState({
        unavailableBreakpointsCollapsed: collapsed
      });
    };

    this.state = this._computeState();
    this._disposables = new _UniversalDisposable.default(_rxjs.Observable.fromPromise((0, _passesGK.default)("nuclide_debugger_logging_breakpoints")).subscribe(supportsLogMessage => {
      this.setState({
        supportsLogMessage
      });
    }));
  }

  _computeState() {
    const {
      service
    } = this.props;
    const {
      focusedProcess
    } = service.viewModel;
    const model = service.getModel();
    const exceptionBreakpointsCollapsed = Boolean(_featureConfig.default.get("debugger-exceptionBreakpointsCollapsed"));
    let newActiveProjects = [];
    let newSupportsLogMessage = false;

    if (this.state != null) {
      const {
        activeProjects,
        supportsLogMessage
      } = this.state;

      if (activeProjects != null) {
        newActiveProjects = activeProjects;
      }

      newSupportsLogMessage = supportsLogMessage;
    }

    return {
      supportsConditionalBreakpoints: focusedProcess != null && Boolean(focusedProcess.session.capabilities.supportsConditionalBreakpoints),
      breakpoints: model.getBreakpoints(),
      exceptionBreakpoints: model.getExceptionBreakpoints(),
      exceptionBreakpointsCollapsed,
      unavailableBreakpointsCollapsed: true,
      activeProjects: newActiveProjects,
      supportsLogMessage: newSupportsLogMessage
    };
  }

  componentDidMount() {
    const model = this.props.service.getModel();
    const {
      viewModel
    } = this.props.service;

    this._disposables.add(model.onDidChangeBreakpoints(() => {
      this.setState(this._computeState());
    }), // Exception breakpoint filters are different for different debuggers,
    // so we must refresh when switching debugger focus.
    viewModel.onDidChangeDebuggerFocus(() => {
      this.setState(this._computeState());
    }), (0, _projects.observeProjectPathsAll)(projectPaths => this.setState({
      activeProjects: projectPaths
    })));
  }

  componentWillUnmount() {
    if (this._disposables != null) {
      this._disposables.dispose();
    }
  }

  _getHostnameTranslated(uri) {
    try {
      // $FlowFB
      const {
        getBreakpointHostnameTranslated
      } = require("./fb-utils");

      return getBreakpointHostnameTranslated(uri);
    } catch (_) {}

    if (_nuclideUri.default.isLocal(uri)) {
      return "local";
    } else {
      return _nuclideUri.default.getHostname(uri);
    }
  }

  _renderLogMessage(breakpoint) {
    if (!this.props.service.viewModel.focusedProcess || !this.state.supportsLogMessage || breakpoint.logMessage == null) {
      return null;
    }

    return /*#__PURE__*/React.createElement("div", {
      className: "debugger-breakpoint-condition",
      title: `Breakpoint log message: ${breakpoint.logMessage}`,
      "data-path": breakpoint.uri,
      "data-line": breakpoint.line,
      "data-bpid": breakpoint.getId(),
      onClick: event => {
        atom.commands.dispatch(event.target, "debugger:edit-breakpoint");
      }
    }, "Log Message: ", breakpoint.logMessage);
  }

  render() {
    const {
      exceptionBreakpoints,
      supportsConditionalBreakpoints,
      activeProjects,
      breakpoints
    } = this.state;
    const {
      service
    } = this.props;
    const availableHosts = activeProjects.filter(uri => _nuclideUri.default.isRemote(uri)).map(uri => this._getHostnameTranslated(uri));

    const breakpointGroup = available => breakpoints.filter(bp => {
      const match = _nuclideUri.default.isLocal(bp.uri) || availableHosts.some(host => this._getHostnameTranslated(bp.uri) === host);
      return available ? match : !match;
    }).sort((breakpointA, breakpointB) => {
      const fileA = _nuclideUri.default.basename(breakpointA.uri);

      const fileB = _nuclideUri.default.basename(breakpointB.uri);

      if (fileA !== fileB) {
        return fileA.localeCompare(fileB);
      }

      return breakpointA.line - breakpointB.line;
    }).map((breakpoint, i) => {
      const host = this._getHostnameTranslated(breakpoint.uri) || "local";

      const basename = _nuclideUri.default.basename(breakpoint.uri);

      const {
        line,
        verified,
        uri: path
      } = breakpoint;
      const enabled = breakpoint.enabled && available;
      const bpId = breakpoint.getId();
      const label = `${basename}:${line}`;
      const title = (!enabled ? "Disabled breakpoint" : !verified ? "Unresolved Breakpoint" : `Breakpoint at ${label} (resolved)`) + (available ? "" : ` - ${host}:${_nuclideUri.default.getPath(breakpoint.uri)}`);
      const conditionElement = supportsConditionalBreakpoints && breakpoint.condition != null ? /*#__PURE__*/React.createElement("div", {
        className: "debugger-breakpoint-condition",
        title: `Breakpoint condition: ${breakpoint.condition}`,
        "data-path": path,
        "data-line": line,
        "data-bpid": bpId,
        onClick: event => {
          atom.commands.dispatch(event.target, "debugger:edit-breakpoint");
        }
      }, "Condition: ", breakpoint.condition) : null;
      const hitcountElement = breakpoint.hitCount != null && breakpoint.hitCount > 0 ? /*#__PURE__*/React.createElement("div", {
        className: "debugger-breakpoint-hitcount"
      }, "Hit count: ", breakpoint.hitCount) : null;
      const content = /*#__PURE__*/React.createElement("div", {
        className: "inline-block"
      }, /*#__PURE__*/React.createElement("div", {
        className: (0, _classnames.default)({
          "debugger-breakpoint-disabled": !enabled,
          "debugger-breakpoint-with-condition": Boolean(breakpoint.condition)
        }),
        key: i
      }, /*#__PURE__*/React.createElement(_Checkbox.Checkbox, {
        checked: enabled,
        onChange: this._handleBreakpointEnabledChange.bind(this, breakpoint),
        onClick: event => event.stopPropagation(),
        title: title,
        disabled: !available,
        className: (0, _classnames.default)(verified ? "" : "debugger-breakpoint-unresolved", "debugger-breakpoint-checkbox")
      }), /*#__PURE__*/React.createElement("span", {
        title: title,
        "data-path": path,
        "data-bpid": bpId,
        "data-line": line
      }, /*#__PURE__*/React.createElement("div", {
        className: "debugger-breakpoint-condition-controls"
      }, /*#__PURE__*/React.createElement(_Icon.Icon, {
        icon: "pencil",
        className: "debugger-breakpoint-condition-control",
        "data-path": path,
        "data-bpid": bpId,
        "data-line": line,
        onClick: event => {
          (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_EDIT_BREAKPOINT_FROM_ICON);
          atom.commands.dispatch(event.target, "debugger:edit-breakpoint");
        }
      }), /*#__PURE__*/React.createElement(_Icon.Icon, {
        icon: "x",
        className: "debugger-breakpoint-condition-control",
        "data-path": path,
        "data-bpid": bpId,
        "data-line": line,
        onClick: event => {
          (0, _analytics.track)(_constants.AnalyticsEvents.DEBUGGER_DELETE_BREAKPOINT_FROM_ICON);
          atom.commands.dispatch(event.target, "debugger:remove-breakpoint");
          event.stopPropagation();
        }
      })), label), conditionElement, this._renderLogMessage(breakpoint), hitcountElement));
      return /*#__PURE__*/React.createElement(_ListView.ListViewItem, {
        key: label,
        index: i,
        value: breakpoint,
        "data-path": path,
        "data-bpid": bpId,
        "data-line": line,
        title: title,
        className: "debugger-breakpoint"
      }, content);
    });

    const availableBreakpoints = breakpointGroup(true);
    const unavailableBreakpoints = breakpointGroup(false);
    return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(_ListView.ListView, {
      alternateBackground: true,
      onSelect: this._handleBreakpointClick,
      selectable: true
    }, availableBreakpoints), breakpoints.length === 0 ? /*#__PURE__*/React.createElement("span", {
      className: "debugger-breakpoint"
    }, "You currently have no source breakpoints set.") : null, exceptionBreakpoints.length > 0 ? /*#__PURE__*/React.createElement(_Section.Section, {
      className: "debugger-breakpoint-section",
      headline: "Exception breakpoints",
      collapsable: true,
      onChange: this._setExceptionCollapsed,
      collapsed: this.state.exceptionBreakpointsCollapsed
    }, exceptionBreakpoints.map(exceptionBreakpoint => {
      return /*#__PURE__*/React.createElement("div", {
        className: "debugger-breakpoint",
        key: exceptionBreakpoint.getId()
      }, /*#__PURE__*/React.createElement(_Checkbox.Checkbox, {
        className: (0, _classnames.default)("debugger-breakpoint-checkbox", "debugger-exception-checkbox"),
        onChange: enabled => service.enableOrDisableBreakpoints(enabled, exceptionBreakpoint),
        checked: exceptionBreakpoint.enabled
      }), exceptionBreakpoint.label || `${exceptionBreakpoint.filter} exceptions`);
    })) : null, unavailableBreakpoints.length > 0 ? /*#__PURE__*/React.createElement(_Section.Section, {
      className: "debugger-breakpoint-section",
      headline: /*#__PURE__*/React.createElement("div", {
        className: "inline-block"
      }, /*#__PURE__*/React.createElement(_Icon.Icon, {
        icon: "nuclicon-warning"
      }), " Unavailable breakpoints"),
      collapsable: true,
      onChange: this._setUnavailableCollapsed,
      collapsed: this.state.unavailableBreakpointsCollapsed
    }, /*#__PURE__*/React.createElement("div", {
      className: "debugger-unavailable-breakpoint-help"
    }, "These breakpoints are in files that are not currently available in any project root. Add the corresponding local or remote project to your file tree to enable these breakpoints."), /*#__PURE__*/React.createElement(_ListView.ListView, {
      alternateBackground: true,
      selectable: false
    }, unavailableBreakpoints)) : null);
  }

}

exports.default = BreakpointListComponent;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkJyZWFrcG9pbnRMaXN0Q29tcG9uZW50LmpzIl0sIm5hbWVzIjpbIkJyZWFrcG9pbnRMaXN0Q29tcG9uZW50IiwiUmVhY3QiLCJDb21wb25lbnQiLCJjb25zdHJ1Y3RvciIsInByb3BzIiwiX2Rpc3Bvc2FibGVzIiwiX2hhbmRsZUJyZWFrcG9pbnRFbmFibGVkQ2hhbmdlIiwiYnJlYWtwb2ludCIsImVuYWJsZWQiLCJzZXJ2aWNlIiwiZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMiLCJfaGFuZGxlQnJlYWtwb2ludENsaWNrIiwiYnJlYWtwb2ludEluZGV4IiwidXJpIiwibGluZSIsIl9zZXRFeGNlcHRpb25Db2xsYXBzZWQiLCJjb2xsYXBzZWQiLCJmZWF0dXJlQ29uZmlnIiwic2V0Iiwic2V0U3RhdGUiLCJleGNlcHRpb25CcmVha3BvaW50c0NvbGxhcHNlZCIsIl9zZXRVbmF2YWlsYWJsZUNvbGxhcHNlZCIsInVuYXZhaWxhYmxlQnJlYWtwb2ludHNDb2xsYXBzZWQiLCJzdGF0ZSIsIl9jb21wdXRlU3RhdGUiLCJVbml2ZXJzYWxEaXNwb3NhYmxlIiwiT2JzZXJ2YWJsZSIsImZyb21Qcm9taXNlIiwic3Vic2NyaWJlIiwic3VwcG9ydHNMb2dNZXNzYWdlIiwiZm9jdXNlZFByb2Nlc3MiLCJ2aWV3TW9kZWwiLCJtb2RlbCIsImdldE1vZGVsIiwiQm9vbGVhbiIsImdldCIsIm5ld0FjdGl2ZVByb2plY3RzIiwibmV3U3VwcG9ydHNMb2dNZXNzYWdlIiwiYWN0aXZlUHJvamVjdHMiLCJzdXBwb3J0c0NvbmRpdGlvbmFsQnJlYWtwb2ludHMiLCJzZXNzaW9uIiwiY2FwYWJpbGl0aWVzIiwiYnJlYWtwb2ludHMiLCJnZXRCcmVha3BvaW50cyIsImV4Y2VwdGlvbkJyZWFrcG9pbnRzIiwiZ2V0RXhjZXB0aW9uQnJlYWtwb2ludHMiLCJjb21wb25lbnREaWRNb3VudCIsImFkZCIsIm9uRGlkQ2hhbmdlQnJlYWtwb2ludHMiLCJvbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMiLCJwcm9qZWN0UGF0aHMiLCJjb21wb25lbnRXaWxsVW5tb3VudCIsImRpc3Bvc2UiLCJfZ2V0SG9zdG5hbWVUcmFuc2xhdGVkIiwiZ2V0QnJlYWtwb2ludEhvc3RuYW1lVHJhbnNsYXRlZCIsInJlcXVpcmUiLCJfIiwibnVjbGlkZVVyaSIsImlzTG9jYWwiLCJnZXRIb3N0bmFtZSIsIl9yZW5kZXJMb2dNZXNzYWdlIiwibG9nTWVzc2FnZSIsImdldElkIiwiZXZlbnQiLCJhdG9tIiwiY29tbWFuZHMiLCJkaXNwYXRjaCIsInRhcmdldCIsInJlbmRlciIsImF2YWlsYWJsZUhvc3RzIiwiZmlsdGVyIiwiaXNSZW1vdGUiLCJtYXAiLCJicmVha3BvaW50R3JvdXAiLCJhdmFpbGFibGUiLCJicCIsIm1hdGNoIiwic29tZSIsImhvc3QiLCJzb3J0IiwiYnJlYWtwb2ludEEiLCJicmVha3BvaW50QiIsImZpbGVBIiwiYmFzZW5hbWUiLCJmaWxlQiIsImxvY2FsZUNvbXBhcmUiLCJpIiwidmVyaWZpZWQiLCJwYXRoIiwiYnBJZCIsImxhYmVsIiwidGl0bGUiLCJnZXRQYXRoIiwiY29uZGl0aW9uRWxlbWVudCIsImNvbmRpdGlvbiIsImhpdGNvdW50RWxlbWVudCIsImhpdENvdW50IiwiY29udGVudCIsImJpbmQiLCJzdG9wUHJvcGFnYXRpb24iLCJBbmFseXRpY3NFdmVudHMiLCJERUJVR0dFUl9FRElUX0JSRUFLUE9JTlRfRlJPTV9JQ09OIiwiREVCVUdHRVJfREVMRVRFX0JSRUFLUE9JTlRfRlJPTV9JQ09OIiwiYXZhaWxhYmxlQnJlYWtwb2ludHMiLCJ1bmF2YWlsYWJsZUJyZWFrcG9pbnRzIiwibGVuZ3RoIiwiZXhjZXB0aW9uQnJlYWtwb2ludCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUdBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQWdCZSxNQUFNQSx1QkFB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QVdFO0FBQUssTUFBQSxTQUFTLEVBQUM7QUFBZiwyTEFYRixlQWVFLG9CQUFDLGtCQUFEO0FBQVUsTUFBQSxtQkFBbUIsRUFBRSxJQUEvQjtBQUFxQyxNQUFBLFVBQVUsRUFBRTtBQUFqRCxPQUNHa0Ysc0JBREgsQ0FmRixDQURELEdBb0JHLElBakROLENBREY7QUFxREQ7O0FBL1NnRiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgSUJyZWFrcG9pbnQsIElEZWJ1Z1NlcnZpY2UsIElFeGNlcHRpb25CcmVha3BvaW50IH0gZnJvbSBcIi4uL3R5cGVzXCJcbmltcG9ydCB0eXBlIHsgTnVjbGlkZVVyaSB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9udWNsaWRlVXJpXCJcblxuaW1wb3J0IFVuaXZlcnNhbERpc3Bvc2FibGUgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL1VuaXZlcnNhbERpc3Bvc2FibGVcIlxuaW1wb3J0IGludmFyaWFudCBmcm9tIFwiYXNzZXJ0XCJcbmltcG9ydCAqIGFzIFJlYWN0IGZyb20gXCJyZWFjdFwiXG5pbXBvcnQgbnVjbGlkZVVyaSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvbnVjbGlkZVVyaVwiXG5pbXBvcnQgeyBDaGVja2JveCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9DaGVja2JveFwiXG5pbXBvcnQgeyB0cmFjayB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9hbmFseXRpY3NcIlxuaW1wb3J0IHsgTGlzdFZpZXcsIExpc3RWaWV3SXRlbSB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9MaXN0Vmlld1wiXG5pbXBvcnQgY2xhc3NuYW1lcyBmcm9tIFwiY2xhc3NuYW1lc1wiXG5pbXBvcnQgeyBJY29uIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0ljb25cIlxuaW1wb3J0IHsgT2JzZXJ2YWJsZSB9IGZyb20gXCJyeGpzXCJcbmltcG9ydCB7IEFuYWx5dGljc0V2ZW50cyB9IGZyb20gXCIuLi9jb25zdGFudHNcIlxuaW1wb3J0IHsgb3BlblNvdXJjZUxvY2F0aW9uIH0gZnJvbSBcIi4uL3V0aWxzXCJcbmltcG9ydCB7IFNlY3Rpb24gfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtdWkvU2VjdGlvblwiXG5pbXBvcnQgZmVhdHVyZUNvbmZpZyBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtYXRvbS9mZWF0dXJlLWNvbmZpZ1wiXG5pbXBvcnQgeyBvYnNlcnZlUHJvamVjdFBhdGhzQWxsIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLWF0b20vcHJvamVjdHNcIlxuaW1wb3J0IHBhc3Nlc0dLIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9wYXNzZXNHS1wiXG5cbnR5cGUgUHJvcHMgPSB7XG4gIHNlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG59XG5cbnR5cGUgU3RhdGUgPSB7XG4gIHN1cHBvcnRzQ29uZGl0aW9uYWxCcmVha3BvaW50czogYm9vbGVhbixcbiAgYnJlYWtwb2ludHM6IElCcmVha3BvaW50W10sXG4gIGV4Y2VwdGlvbkJyZWFrcG9pbnRzOiBJRXhjZXB0aW9uQnJlYWtwb2ludFtdLFxuICBleGNlcHRpb25CcmVha3BvaW50c0NvbGxhcHNlZDogYm9vbGVhbixcbiAgdW5hdmFpbGFibGVCcmVha3BvaW50c0NvbGxhcHNlZDogYm9vbGVhbixcbiAgYWN0aXZlUHJvamVjdHM6IE51Y2xpZGVVcmlbXSxcbiAgc3VwcG9ydHNMb2dNZXNzYWdlOiBib29sZWFuLFxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBCcmVha3BvaW50TGlzdENvbXBvbmVudCBleHRlbmRzIFJlYWN0LkNvbXBvbmVudDxQcm9wcywgU3RhdGU+IHtcbiAgX2Rpc3Bvc2FibGVzOiBVbml2ZXJzYWxEaXNwb3NhYmxlXG5cbiAgY29uc3RydWN0b3IocHJvcHM6IFByb3BzKSB7XG4gICAgc3VwZXIocHJvcHMpXG4gICAgdGhpcy5zdGF0ZSA9IHRoaXMuX2NvbXB1dGVTdGF0ZSgpXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZShcbiAgICAgIE9ic2VydmFibGUuZnJvbVByb21pc2UocGFzc2VzR0soXCJudWNsaWRlX2RlYnVnZ2VyX2xvZ2dpbmdfYnJlYWtwb2ludHNcIikpLnN1YnNjcmliZSgoc3VwcG9ydHNMb2dNZXNzYWdlKSA9PiB7XG4gICAgICAgIHRoaXMuc2V0U3RhdGUoeyBzdXBwb3J0c0xvZ01lc3NhZ2UgfSlcbiAgICAgIH0pXG4gICAgKVxuICB9XG5cbiAgX2NvbXB1dGVTdGF0ZSgpOiBTdGF0ZSB7XG4gICAgY29uc3QgeyBzZXJ2aWNlIH0gPSB0aGlzLnByb3BzXG4gICAgY29uc3QgeyBmb2N1c2VkUHJvY2VzcyB9ID0gc2VydmljZS52aWV3TW9kZWxcbiAgICBjb25zdCBtb2RlbCA9IHNlcnZpY2UuZ2V0TW9kZWwoKVxuXG4gICAgY29uc3QgZXhjZXB0aW9uQnJlYWtwb2ludHNDb2xsYXBzZWQgPSBCb29sZWFuKGZlYXR1cmVDb25maWcuZ2V0KFwiZGVidWdnZXItZXhjZXB0aW9uQnJlYWtwb2ludHNDb2xsYXBzZWRcIikpXG5cbiAgICBsZXQgbmV3QWN0aXZlUHJvamVjdHMgPSBbXVxuICAgIGxldCBuZXdTdXBwb3J0c0xvZ01lc3NhZ2UgPSBmYWxzZVxuICAgIGlmICh0aGlzLnN0YXRlICE9IG51bGwpIHtcbiAgICAgIGNvbnN0IHsgYWN0aXZlUHJvamVjdHMsIHN1cHBvcnRzTG9nTWVzc2FnZSB9ID0gdGhpcy5zdGF0ZVxuICAgICAgaWYgKGFjdGl2ZVByb2plY3RzICE9IG51bGwpIHtcbiAgICAgICAgbmV3QWN0aXZlUHJvamVjdHMgPSBhY3RpdmVQcm9qZWN0c1xuICAgICAgfVxuICAgICAgbmV3U3VwcG9ydHNMb2dNZXNzYWdlID0gc3VwcG9ydHNMb2dNZXNzYWdlXG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN1cHBvcnRzQ29uZGl0aW9uYWxCcmVha3BvaW50czpcbiAgICAgICAgZm9jdXNlZFByb2Nlc3MgIT0gbnVsbCAmJiBCb29sZWFuKGZvY3VzZWRQcm9jZXNzLnNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzQ29uZGl0aW9uYWxCcmVha3BvaW50cyksXG4gICAgICBicmVha3BvaW50czogbW9kZWwuZ2V0QnJlYWtwb2ludHMoKSxcbiAgICAgIGV4Y2VwdGlvbkJyZWFrcG9pbnRzOiBtb2RlbC5nZXRFeGNlcHRpb25CcmVha3BvaW50cygpLFxuICAgICAgZXhjZXB0aW9uQnJlYWtwb2ludHNDb2xsYXBzZWQsXG4gICAgICB1bmF2YWlsYWJsZUJyZWFrcG9pbnRzQ29sbGFwc2VkOiB0cnVlLFxuICAgICAgYWN0aXZlUHJvamVjdHM6IG5ld0FjdGl2ZVByb2plY3RzLFxuICAgICAgc3VwcG9ydHNMb2dNZXNzYWdlOiBuZXdTdXBwb3J0c0xvZ01lc3NhZ2UsXG4gICAgfVxuICB9XG5cbiAgY29tcG9uZW50RGlkTW91bnQoKTogdm9pZCB7XG4gICAgY29uc3QgbW9kZWwgPSB0aGlzLnByb3BzLnNlcnZpY2UuZ2V0TW9kZWwoKVxuICAgIGNvbnN0IHsgdmlld01vZGVsIH0gPSB0aGlzLnByb3BzLnNlcnZpY2VcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5hZGQoXG4gICAgICBtb2RlbC5vbkRpZENoYW5nZUJyZWFrcG9pbnRzKCgpID0+IHtcbiAgICAgICAgdGhpcy5zZXRTdGF0ZSh0aGlzLl9jb21wdXRlU3RhdGUoKSlcbiAgICAgIH0pLFxuICAgICAgLy8gRXhjZXB0aW9uIGJyZWFrcG9pbnQgZmlsdGVycyBhcmUgZGlmZmVyZW50IGZvciBkaWZmZXJlbnQgZGVidWdnZXJzLFxuICAgICAgLy8gc28gd2UgbXVzdCByZWZyZXNoIHdoZW4gc3dpdGNoaW5nIGRlYnVnZ2VyIGZvY3VzLlxuICAgICAgdmlld01vZGVsLm9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cygoKSA9PiB7XG4gICAgICAgIHRoaXMuc2V0U3RhdGUodGhpcy5fY29tcHV0ZVN0YXRlKCkpXG4gICAgICB9KSxcbiAgICAgIG9ic2VydmVQcm9qZWN0UGF0aHNBbGwoKHByb2plY3RQYXRocykgPT4gdGhpcy5zZXRTdGF0ZSh7IGFjdGl2ZVByb2plY3RzOiBwcm9qZWN0UGF0aHMgfSkpXG4gICAgKVxuICB9XG5cbiAgY29tcG9uZW50V2lsbFVubW91bnQoKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuX2Rpc3Bvc2FibGVzICE9IG51bGwpIHtcbiAgICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICAgIH1cbiAgfVxuXG4gIF9oYW5kbGVCcmVha3BvaW50RW5hYmxlZENoYW5nZSA9IChicmVha3BvaW50OiBJQnJlYWtwb2ludCwgZW5hYmxlZDogYm9vbGVhbik6IHZvaWQgPT4ge1xuICAgIHRoaXMucHJvcHMuc2VydmljZS5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyhlbmFibGVkLCBicmVha3BvaW50KVxuICB9XG5cbiAgX2hhbmRsZUJyZWFrcG9pbnRDbGljayA9IChicmVha3BvaW50SW5kZXg6IG51bWJlciwgYnJlYWtwb2ludDogP0lCcmVha3BvaW50KTogdm9pZCA9PiB7XG4gICAgaW52YXJpYW50KGJyZWFrcG9pbnQgIT0gbnVsbClcbiAgICBjb25zdCB7IHVyaSwgbGluZSB9ID0gYnJlYWtwb2ludFxuICAgIC8vIERlYnVnZ2VyIG1vZGVsIGlzIDEtYmFzZWQgd2hpbGUgQXRvbSBVSSBpcyB6ZXJvLWJhc2VkLlxuICAgIG9wZW5Tb3VyY2VMb2NhdGlvbih1cmksIGxpbmUgLSAxKVxuICB9XG5cbiAgX3NldEV4Y2VwdGlvbkNvbGxhcHNlZCA9IChjb2xsYXBzZWQ6IGJvb2xlYW4pOiB2b2lkID0+IHtcbiAgICBmZWF0dXJlQ29uZmlnLnNldChcImRlYnVnZ2VyLWV4Y2VwdGlvbkJyZWFrcG9pbnRzQ29sbGFwc2VkXCIsIGNvbGxhcHNlZClcbiAgICB0aGlzLnNldFN0YXRlKHsgZXhjZXB0aW9uQnJlYWtwb2ludHNDb2xsYXBzZWQ6IGNvbGxhcHNlZCB9KVxuICB9XG5cbiAgX3NldFVuYXZhaWxhYmxlQ29sbGFwc2VkID0gKGNvbGxhcHNlZDogYm9vbGVhbik6IHZvaWQgPT4ge1xuICAgIHRoaXMuc2V0U3RhdGUoeyB1bmF2YWlsYWJsZUJyZWFrcG9pbnRzQ29sbGFwc2VkOiBjb2xsYXBzZWQgfSlcbiAgfVxuXG4gIF9nZXRIb3N0bmFtZVRyYW5zbGF0ZWQodXJpOiBOdWNsaWRlVXJpKTogc3RyaW5nIHtcbiAgICB0cnkge1xuICAgICAgLy8gJEZsb3dGQlxuICAgICAgY29uc3QgeyBnZXRCcmVha3BvaW50SG9zdG5hbWVUcmFuc2xhdGVkIH0gPSByZXF1aXJlKFwiLi9mYi11dGlsc1wiKVxuICAgICAgcmV0dXJuIGdldEJyZWFrcG9pbnRIb3N0bmFtZVRyYW5zbGF0ZWQodXJpKVxuICAgIH0gY2F0Y2ggKF8pIHt9XG5cbiAgICBpZiAobnVjbGlkZVVyaS5pc0xvY2FsKHVyaSkpIHtcbiAgICAgIHJldHVybiBcImxvY2FsXCJcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG51Y2xpZGVVcmkuZ2V0SG9zdG5hbWUodXJpKVxuICAgIH1cbiAgfVxuXG4gIF9yZW5kZXJMb2dNZXNzYWdlKGJyZWFrcG9pbnQ6IElCcmVha3BvaW50KTogP1JlYWN0Lk5vZGUge1xuICAgIGlmIChcbiAgICAgICF0aGlzLnByb3BzLnNlcnZpY2Uudmlld01vZGVsLmZvY3VzZWRQcm9jZXNzIHx8XG4gICAgICAhdGhpcy5zdGF0ZS5zdXBwb3J0c0xvZ01lc3NhZ2UgfHxcbiAgICAgIGJyZWFrcG9pbnQubG9nTWVzc2FnZSA9PSBudWxsXG4gICAgKSB7XG4gICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHJldHVybiAoXG4gICAgICA8ZGl2XG4gICAgICAgIGNsYXNzTmFtZT1cImRlYnVnZ2VyLWJyZWFrcG9pbnQtY29uZGl0aW9uXCJcbiAgICAgICAgdGl0bGU9e2BCcmVha3BvaW50IGxvZyBtZXNzYWdlOiAke2JyZWFrcG9pbnQubG9nTWVzc2FnZX1gfVxuICAgICAgICBkYXRhLXBhdGg9e2JyZWFrcG9pbnQudXJpfVxuICAgICAgICBkYXRhLWxpbmU9e2JyZWFrcG9pbnQubGluZX1cbiAgICAgICAgZGF0YS1icGlkPXticmVha3BvaW50LmdldElkKCl9XG4gICAgICAgIG9uQ2xpY2s9eyhldmVudCkgPT4ge1xuICAgICAgICAgIGF0b20uY29tbWFuZHMuZGlzcGF0Y2goZXZlbnQudGFyZ2V0LCBcImRlYnVnZ2VyOmVkaXQtYnJlYWtwb2ludFwiKVxuICAgICAgICB9fVxuICAgICAgPlxuICAgICAgICBMb2cgTWVzc2FnZToge2JyZWFrcG9pbnQubG9nTWVzc2FnZX1cbiAgICAgIDwvZGl2PlxuICAgIClcbiAgfVxuXG4gIHJlbmRlcigpOiBSZWFjdC5Ob2RlIHtcbiAgICBjb25zdCB7IGV4Y2VwdGlvbkJyZWFrcG9pbnRzLCBzdXBwb3J0c0NvbmRpdGlvbmFsQnJlYWtwb2ludHMsIGFjdGl2ZVByb2plY3RzLCBicmVha3BvaW50cyB9ID0gdGhpcy5zdGF0ZVxuICAgIGNvbnN0IHsgc2VydmljZSB9ID0gdGhpcy5wcm9wc1xuICAgIGNvbnN0IGF2YWlsYWJsZUhvc3RzID0gYWN0aXZlUHJvamVjdHNcbiAgICAgIC5maWx0ZXIoKHVyaSkgPT4gbnVjbGlkZVVyaS5pc1JlbW90ZSh1cmkpKVxuICAgICAgLm1hcCgodXJpKSA9PiB0aGlzLl9nZXRIb3N0bmFtZVRyYW5zbGF0ZWQodXJpKSlcbiAgICBjb25zdCBicmVha3BvaW50R3JvdXAgPSAoYXZhaWxhYmxlKSA9PlxuICAgICAgYnJlYWtwb2ludHNcbiAgICAgICAgLmZpbHRlcigoYnApID0+IHtcbiAgICAgICAgICBjb25zdCBtYXRjaCA9XG4gICAgICAgICAgICBudWNsaWRlVXJpLmlzTG9jYWwoYnAudXJpKSB8fCBhdmFpbGFibGVIb3N0cy5zb21lKChob3N0KSA9PiB0aGlzLl9nZXRIb3N0bmFtZVRyYW5zbGF0ZWQoYnAudXJpKSA9PT0gaG9zdClcbiAgICAgICAgICByZXR1cm4gYXZhaWxhYmxlID8gbWF0Y2ggOiAhbWF0Y2hcbiAgICAgICAgfSlcbiAgICAgICAgLnNvcnQoKGJyZWFrcG9pbnRBLCBicmVha3BvaW50QikgPT4ge1xuICAgICAgICAgIGNvbnN0IGZpbGVBID0gbnVjbGlkZVVyaS5iYXNlbmFtZShicmVha3BvaW50QS51cmkpXG4gICAgICAgICAgY29uc3QgZmlsZUIgPSBudWNsaWRlVXJpLmJhc2VuYW1lKGJyZWFrcG9pbnRCLnVyaSlcbiAgICAgICAgICBpZiAoZmlsZUEgIT09IGZpbGVCKSB7XG4gICAgICAgICAgICByZXR1cm4gZmlsZUEubG9jYWxlQ29tcGFyZShmaWxlQilcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGJyZWFrcG9pbnRBLmxpbmUgLSBicmVha3BvaW50Qi5saW5lXG4gICAgICAgIH0pXG4gICAgICAgIC5tYXAoKGJyZWFrcG9pbnQsIGkpID0+IHtcbiAgICAgICAgICBjb25zdCBob3N0ID0gdGhpcy5fZ2V0SG9zdG5hbWVUcmFuc2xhdGVkKGJyZWFrcG9pbnQudXJpKSB8fCBcImxvY2FsXCJcbiAgICAgICAgICBjb25zdCBiYXNlbmFtZSA9IG51Y2xpZGVVcmkuYmFzZW5hbWUoYnJlYWtwb2ludC51cmkpXG4gICAgICAgICAgY29uc3QgeyBsaW5lLCB2ZXJpZmllZCwgdXJpOiBwYXRoIH0gPSBicmVha3BvaW50XG4gICAgICAgICAgY29uc3QgZW5hYmxlZCA9IGJyZWFrcG9pbnQuZW5hYmxlZCAmJiBhdmFpbGFibGVcbiAgICAgICAgICBjb25zdCBicElkID0gYnJlYWtwb2ludC5nZXRJZCgpXG4gICAgICAgICAgY29uc3QgbGFiZWwgPSBgJHtiYXNlbmFtZX06JHtsaW5lfWBcbiAgICAgICAgICBjb25zdCB0aXRsZSA9XG4gICAgICAgICAgICAoIWVuYWJsZWRcbiAgICAgICAgICAgICAgPyBcIkRpc2FibGVkIGJyZWFrcG9pbnRcIlxuICAgICAgICAgICAgICA6ICF2ZXJpZmllZFxuICAgICAgICAgICAgICA/IFwiVW5yZXNvbHZlZCBCcmVha3BvaW50XCJcbiAgICAgICAgICAgICAgOiBgQnJlYWtwb2ludCBhdCAke2xhYmVsfSAocmVzb2x2ZWQpYCkgK1xuICAgICAgICAgICAgKGF2YWlsYWJsZSA/IFwiXCIgOiBgIC0gJHtob3N0fToke251Y2xpZGVVcmkuZ2V0UGF0aChicmVha3BvaW50LnVyaSl9YClcblxuICAgICAgICAgIGNvbnN0IGNvbmRpdGlvbkVsZW1lbnQgPVxuICAgICAgICAgICAgc3VwcG9ydHNDb25kaXRpb25hbEJyZWFrcG9pbnRzICYmIGJyZWFrcG9pbnQuY29uZGl0aW9uICE9IG51bGwgPyAoXG4gICAgICAgICAgICAgIDxkaXZcbiAgICAgICAgICAgICAgICBjbGFzc05hbWU9XCJkZWJ1Z2dlci1icmVha3BvaW50LWNvbmRpdGlvblwiXG4gICAgICAgICAgICAgICAgdGl0bGU9e2BCcmVha3BvaW50IGNvbmRpdGlvbjogJHticmVha3BvaW50LmNvbmRpdGlvbn1gfVxuICAgICAgICAgICAgICAgIGRhdGEtcGF0aD17cGF0aH1cbiAgICAgICAgICAgICAgICBkYXRhLWxpbmU9e2xpbmV9XG4gICAgICAgICAgICAgICAgZGF0YS1icGlkPXticElkfVxuICAgICAgICAgICAgICAgIG9uQ2xpY2s9eyhldmVudCkgPT4ge1xuICAgICAgICAgICAgICAgICAgYXRvbS5jb21tYW5kcy5kaXNwYXRjaChldmVudC50YXJnZXQsIFwiZGVidWdnZXI6ZWRpdC1icmVha3BvaW50XCIpXG4gICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgPlxuICAgICAgICAgICAgICAgIENvbmRpdGlvbjoge2JyZWFrcG9pbnQuY29uZGl0aW9ufVxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICkgOiBudWxsXG5cbiAgICAgICAgICBjb25zdCBoaXRjb3VudEVsZW1lbnQgPVxuICAgICAgICAgICAgYnJlYWtwb2ludC5oaXRDb3VudCAhPSBudWxsICYmIGJyZWFrcG9pbnQuaGl0Q291bnQgPiAwID8gKFxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLWJyZWFrcG9pbnQtaGl0Y291bnRcIj5IaXQgY291bnQ6IHticmVha3BvaW50LmhpdENvdW50fTwvZGl2PlxuICAgICAgICAgICAgKSA6IG51bGxcbiAgICAgICAgICBjb25zdCBjb250ZW50ID0gKFxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJpbmxpbmUtYmxvY2tcIj5cbiAgICAgICAgICAgICAgPGRpdlxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZT17Y2xhc3NuYW1lcyh7XG4gICAgICAgICAgICAgICAgICBcImRlYnVnZ2VyLWJyZWFrcG9pbnQtZGlzYWJsZWRcIjogIWVuYWJsZWQsXG4gICAgICAgICAgICAgICAgICBcImRlYnVnZ2VyLWJyZWFrcG9pbnQtd2l0aC1jb25kaXRpb25cIjogQm9vbGVhbihicmVha3BvaW50LmNvbmRpdGlvbiksXG4gICAgICAgICAgICAgICAgfSl9XG4gICAgICAgICAgICAgICAga2V5PXtpfVxuICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgPENoZWNrYm94XG4gICAgICAgICAgICAgICAgICBjaGVja2VkPXtlbmFibGVkfVxuICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9e3RoaXMuX2hhbmRsZUJyZWFrcG9pbnRFbmFibGVkQ2hhbmdlLmJpbmQodGhpcywgYnJlYWtwb2ludCl9XG4gICAgICAgICAgICAgICAgICBvbkNsaWNrPXsoZXZlbnQ6IFN5bnRoZXRpY0V2ZW50PD4pID0+IGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpfVxuICAgICAgICAgICAgICAgICAgdGl0bGU9e3RpdGxlfVxuICAgICAgICAgICAgICAgICAgZGlzYWJsZWQ9eyFhdmFpbGFibGV9XG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWU9e2NsYXNzbmFtZXMoXG4gICAgICAgICAgICAgICAgICAgIHZlcmlmaWVkID8gXCJcIiA6IFwiZGVidWdnZXItYnJlYWtwb2ludC11bnJlc29sdmVkXCIsXG4gICAgICAgICAgICAgICAgICAgIFwiZGVidWdnZXItYnJlYWtwb2ludC1jaGVja2JveFwiXG4gICAgICAgICAgICAgICAgICApfVxuICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgPHNwYW4gdGl0bGU9e3RpdGxlfSBkYXRhLXBhdGg9e3BhdGh9IGRhdGEtYnBpZD17YnBJZH0gZGF0YS1saW5lPXtsaW5lfT5cbiAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItYnJlYWtwb2ludC1jb25kaXRpb24tY29udHJvbHNcIj5cbiAgICAgICAgICAgICAgICAgICAgPEljb25cbiAgICAgICAgICAgICAgICAgICAgICBpY29uPVwicGVuY2lsXCJcbiAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU9XCJkZWJ1Z2dlci1icmVha3BvaW50LWNvbmRpdGlvbi1jb250cm9sXCJcbiAgICAgICAgICAgICAgICAgICAgICBkYXRhLXBhdGg9e3BhdGh9XG4gICAgICAgICAgICAgICAgICAgICAgZGF0YS1icGlkPXticElkfVxuICAgICAgICAgICAgICAgICAgICAgIGRhdGEtbGluZT17bGluZX1cbiAgICAgICAgICAgICAgICAgICAgICBvbkNsaWNrPXsoZXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9FRElUX0JSRUFLUE9JTlRfRlJPTV9JQ09OKVxuICAgICAgICAgICAgICAgICAgICAgICAgYXRvbS5jb21tYW5kcy5kaXNwYXRjaChldmVudC50YXJnZXQsIFwiZGVidWdnZXI6ZWRpdC1icmVha3BvaW50XCIpXG4gICAgICAgICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgICAgICAgPEljb25cbiAgICAgICAgICAgICAgICAgICAgICBpY29uPVwieFwiXG4gICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lPVwiZGVidWdnZXItYnJlYWtwb2ludC1jb25kaXRpb24tY29udHJvbFwiXG4gICAgICAgICAgICAgICAgICAgICAgZGF0YS1wYXRoPXtwYXRofVxuICAgICAgICAgICAgICAgICAgICAgIGRhdGEtYnBpZD17YnBJZH1cbiAgICAgICAgICAgICAgICAgICAgICBkYXRhLWxpbmU9e2xpbmV9XG4gICAgICAgICAgICAgICAgICAgICAgb25DbGljaz17KGV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFjayhBbmFseXRpY3NFdmVudHMuREVCVUdHRVJfREVMRVRFX0JSRUFLUE9JTlRfRlJPTV9JQ09OKVxuICAgICAgICAgICAgICAgICAgICAgICAgYXRvbS5jb21tYW5kcy5kaXNwYXRjaChldmVudC50YXJnZXQsIFwiZGVidWdnZXI6cmVtb3ZlLWJyZWFrcG9pbnRcIilcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpXG4gICAgICAgICAgICAgICAgICAgICAgfX1cbiAgICAgICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgICAgICAge2xhYmVsfVxuICAgICAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgICAgICB7Y29uZGl0aW9uRWxlbWVudH1cbiAgICAgICAgICAgICAgICB7dGhpcy5fcmVuZGVyTG9nTWVzc2FnZShicmVha3BvaW50KX1cbiAgICAgICAgICAgICAgICB7aGl0Y291bnRFbGVtZW50fVxuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIClcbiAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgPExpc3RWaWV3SXRlbVxuICAgICAgICAgICAgICBrZXk9e2xhYmVsfVxuICAgICAgICAgICAgICBpbmRleD17aX1cbiAgICAgICAgICAgICAgdmFsdWU9e2JyZWFrcG9pbnR9XG4gICAgICAgICAgICAgIGRhdGEtcGF0aD17cGF0aH1cbiAgICAgICAgICAgICAgZGF0YS1icGlkPXticElkfVxuICAgICAgICAgICAgICBkYXRhLWxpbmU9e2xpbmV9XG4gICAgICAgICAgICAgIHRpdGxlPXt0aXRsZX1cbiAgICAgICAgICAgICAgY2xhc3NOYW1lPVwiZGVidWdnZXItYnJlYWtwb2ludFwiXG4gICAgICAgICAgICA+XG4gICAgICAgICAgICAgIHtjb250ZW50fVxuICAgICAgICAgICAgPC9MaXN0Vmlld0l0ZW0+XG4gICAgICAgICAgKVxuICAgICAgICB9KVxuICAgIGNvbnN0IGF2YWlsYWJsZUJyZWFrcG9pbnRzID0gYnJlYWtwb2ludEdyb3VwKHRydWUpXG4gICAgY29uc3QgdW5hdmFpbGFibGVCcmVha3BvaW50cyA9IGJyZWFrcG9pbnRHcm91cChmYWxzZSlcbiAgICByZXR1cm4gKFxuICAgICAgPGRpdj5cbiAgICAgICAgPExpc3RWaWV3IGFsdGVybmF0ZUJhY2tncm91bmQ9e3RydWV9IG9uU2VsZWN0PXt0aGlzLl9oYW5kbGVCcmVha3BvaW50Q2xpY2t9IHNlbGVjdGFibGU9e3RydWV9PlxuICAgICAgICAgIHthdmFpbGFibGVCcmVha3BvaW50c31cbiAgICAgICAgPC9MaXN0Vmlldz5cbiAgICAgICAge2JyZWFrcG9pbnRzLmxlbmd0aCA9PT0gMCA/IChcbiAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1icmVha3BvaW50XCI+WW91IGN1cnJlbnRseSBoYXZlIG5vIHNvdXJjZSBicmVha3BvaW50cyBzZXQuPC9zcGFuPlxuICAgICAgICApIDogbnVsbH1cbiAgICAgICAge2V4Y2VwdGlvbkJyZWFrcG9pbnRzLmxlbmd0aCA+IDAgPyAoXG4gICAgICAgICAgPFNlY3Rpb25cbiAgICAgICAgICAgIGNsYXNzTmFtZT1cImRlYnVnZ2VyLWJyZWFrcG9pbnQtc2VjdGlvblwiXG4gICAgICAgICAgICBoZWFkbGluZT1cIkV4Y2VwdGlvbiBicmVha3BvaW50c1wiXG4gICAgICAgICAgICBjb2xsYXBzYWJsZT17dHJ1ZX1cbiAgICAgICAgICAgIG9uQ2hhbmdlPXt0aGlzLl9zZXRFeGNlcHRpb25Db2xsYXBzZWR9XG4gICAgICAgICAgICBjb2xsYXBzZWQ9e3RoaXMuc3RhdGUuZXhjZXB0aW9uQnJlYWtwb2ludHNDb2xsYXBzZWR9XG4gICAgICAgICAgPlxuICAgICAgICAgICAge2V4Y2VwdGlvbkJyZWFrcG9pbnRzLm1hcCgoZXhjZXB0aW9uQnJlYWtwb2ludCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItYnJlYWtwb2ludFwiIGtleT17ZXhjZXB0aW9uQnJlYWtwb2ludC5nZXRJZCgpfT5cbiAgICAgICAgICAgICAgICAgIDxDaGVja2JveFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU9e2NsYXNzbmFtZXMoXCJkZWJ1Z2dlci1icmVha3BvaW50LWNoZWNrYm94XCIsIFwiZGVidWdnZXItZXhjZXB0aW9uLWNoZWNrYm94XCIpfVxuICAgICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KGVuYWJsZWQpID0+IHNlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoZW5hYmxlZCwgZXhjZXB0aW9uQnJlYWtwb2ludCl9XG4gICAgICAgICAgICAgICAgICAgIGNoZWNrZWQ9e2V4Y2VwdGlvbkJyZWFrcG9pbnQuZW5hYmxlZH1cbiAgICAgICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICAgICAgICB7ZXhjZXB0aW9uQnJlYWtwb2ludC5sYWJlbCB8fCBgJHtleGNlcHRpb25CcmVha3BvaW50LmZpbHRlcn0gZXhjZXB0aW9uc2B9XG4gICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgIH0pfVxuICAgICAgICAgIDwvU2VjdGlvbj5cbiAgICAgICAgKSA6IG51bGx9XG4gICAgICAgIHt1bmF2YWlsYWJsZUJyZWFrcG9pbnRzLmxlbmd0aCA+IDAgPyAoXG4gICAgICAgICAgPFNlY3Rpb25cbiAgICAgICAgICAgIGNsYXNzTmFtZT1cImRlYnVnZ2VyLWJyZWFrcG9pbnQtc2VjdGlvblwiXG4gICAgICAgICAgICBoZWFkbGluZT17XG4gICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiaW5saW5lLWJsb2NrXCI+XG4gICAgICAgICAgICAgICAgPEljb24gaWNvbj1cIm51Y2xpY29uLXdhcm5pbmdcIiAvPiBVbmF2YWlsYWJsZSBicmVha3BvaW50c1xuICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbGxhcHNhYmxlPXt0cnVlfVxuICAgICAgICAgICAgb25DaGFuZ2U9e3RoaXMuX3NldFVuYXZhaWxhYmxlQ29sbGFwc2VkfVxuICAgICAgICAgICAgY29sbGFwc2VkPXt0aGlzLnN0YXRlLnVuYXZhaWxhYmxlQnJlYWtwb2ludHNDb2xsYXBzZWR9XG4gICAgICAgICAgPlxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci11bmF2YWlsYWJsZS1icmVha3BvaW50LWhlbHBcIj5cbiAgICAgICAgICAgICAgVGhlc2UgYnJlYWtwb2ludHMgYXJlIGluIGZpbGVzIHRoYXQgYXJlIG5vdCBjdXJyZW50bHkgYXZhaWxhYmxlIGluIGFueSBwcm9qZWN0IHJvb3QuIEFkZCB0aGUgY29ycmVzcG9uZGluZ1xuICAgICAgICAgICAgICBsb2NhbCBvciByZW1vdGUgcHJvamVjdCB0byB5b3VyIGZpbGUgdHJlZSB0byBlbmFibGUgdGhlc2UgYnJlYWtwb2ludHMuXG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgIDxMaXN0VmlldyBhbHRlcm5hdGVCYWNrZ3JvdW5kPXt0cnVlfSBzZWxlY3RhYmxlPXtmYWxzZX0+XG4gICAgICAgICAgICAgIHt1bmF2YWlsYWJsZUJyZWFrcG9pbnRzfVxuICAgICAgICAgICAgPC9MaXN0Vmlldz5cbiAgICAgICAgICA8L1NlY3Rpb24+XG4gICAgICAgICkgOiBudWxsfVxuICAgICAgPC9kaXY+XG4gICAgKVxuICB9XG59XG4iXX0=