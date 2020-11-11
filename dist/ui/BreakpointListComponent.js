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

var _rxjsCompatUmdMin = require("rxjs-compat/bundles/rxjs-compat.umd.min.js");

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
    this._disposables = new _UniversalDisposable.default(_rxjsCompatUmdMin.Observable.fromPromise((0, _passesGK.default)("nuclide_debugger_logging_breakpoints")).subscribe(supportsLogMessage => {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkJyZWFrcG9pbnRMaXN0Q29tcG9uZW50LmpzIl0sIm5hbWVzIjpbIkJyZWFrcG9pbnRMaXN0Q29tcG9uZW50IiwiUmVhY3QiLCJDb21wb25lbnQiLCJjb25zdHJ1Y3RvciIsInByb3BzIiwiX2Rpc3Bvc2FibGVzIiwiX2hhbmRsZUJyZWFrcG9pbnRFbmFibGVkQ2hhbmdlIiwiYnJlYWtwb2ludCIsImVuYWJsZWQiLCJzZXJ2aWNlIiwiZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMiLCJfaGFuZGxlQnJlYWtwb2ludENsaWNrIiwiYnJlYWtwb2ludEluZGV4IiwidXJpIiwibGluZSIsIl9zZXRFeGNlcHRpb25Db2xsYXBzZWQiLCJjb2xsYXBzZWQiLCJmZWF0dXJlQ29uZmlnIiwic2V0Iiwic2V0U3RhdGUiLCJleGNlcHRpb25CcmVha3BvaW50c0NvbGxhcHNlZCIsIl9zZXRVbmF2YWlsYWJsZUNvbGxhcHNlZCIsInVuYXZhaWxhYmxlQnJlYWtwb2ludHNDb2xsYXBzZWQiLCJzdGF0ZSIsIl9jb21wdXRlU3RhdGUiLCJVbml2ZXJzYWxEaXNwb3NhYmxlIiwiT2JzZXJ2YWJsZSIsImZyb21Qcm9taXNlIiwic3Vic2NyaWJlIiwic3VwcG9ydHNMb2dNZXNzYWdlIiwiZm9jdXNlZFByb2Nlc3MiLCJ2aWV3TW9kZWwiLCJtb2RlbCIsImdldE1vZGVsIiwiQm9vbGVhbiIsImdldCIsIm5ld0FjdGl2ZVByb2plY3RzIiwibmV3U3VwcG9ydHNMb2dNZXNzYWdlIiwiYWN0aXZlUHJvamVjdHMiLCJzdXBwb3J0c0NvbmRpdGlvbmFsQnJlYWtwb2ludHMiLCJzZXNzaW9uIiwiY2FwYWJpbGl0aWVzIiwiYnJlYWtwb2ludHMiLCJnZXRCcmVha3BvaW50cyIsImV4Y2VwdGlvbkJyZWFrcG9pbnRzIiwiZ2V0RXhjZXB0aW9uQnJlYWtwb2ludHMiLCJjb21wb25lbnREaWRNb3VudCIsImFkZCIsIm9uRGlkQ2hhbmdlQnJlYWtwb2ludHMiLCJvbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMiLCJwcm9qZWN0UGF0aHMiLCJjb21wb25lbnRXaWxsVW5tb3VudCIsImRpc3Bvc2UiLCJfZ2V0SG9zdG5hbWVUcmFuc2xhdGVkIiwiZ2V0QnJlYWtwb2ludEhvc3RuYW1lVHJhbnNsYXRlZCIsInJlcXVpcmUiLCJfIiwibnVjbGlkZVVyaSIsImlzTG9jYWwiLCJnZXRIb3N0bmFtZSIsIl9yZW5kZXJMb2dNZXNzYWdlIiwibG9nTWVzc2FnZSIsImdldElkIiwiZXZlbnQiLCJhdG9tIiwiY29tbWFuZHMiLCJkaXNwYXRjaCIsInRhcmdldCIsInJlbmRlciIsImF2YWlsYWJsZUhvc3RzIiwiZmlsdGVyIiwiaXNSZW1vdGUiLCJtYXAiLCJicmVha3BvaW50R3JvdXAiLCJhdmFpbGFibGUiLCJicCIsIm1hdGNoIiwic29tZSIsImhvc3QiLCJzb3J0IiwiYnJlYWtwb2ludEEiLCJicmVha3BvaW50QiIsImZpbGVBIiwiYmFzZW5hbWUiLCJmaWxlQiIsImxvY2FsZUNvbXBhcmUiLCJpIiwidmVyaWZpZWQiLCJwYXRoIiwiYnBJZCIsImxhYmVsIiwidGl0bGUiLCJnZXRQYXRoIiwiY29uZGl0aW9uRWxlbWVudCIsImNvbmRpdGlvbiIsImhpdGNvdW50RWxlbWVudCIsImhpdENvdW50IiwiY29udGVudCIsImJpbmQiLCJzdG9wUHJvcGFnYXRpb24iLCJBbmFseXRpY3NFdmVudHMiLCJERUJVR0dFUl9FRElUX0JSRUFLUE9JTlRfRlJPTV9JQ09OIiwiREVCVUdHRVJfREVMRVRFX0JSRUFLUE9JTlRfRlJPTV9JQ09OIiwiYXZhaWxhYmxlQnJlYWtwb2ludHMiLCJ1bmF2YWlsYWJsZUJyZWFrcG9pbnRzIiwibGVuZ3RoIiwiZXhjZXB0aW9uQnJlYWtwb2ludCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUdBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQWdCZSxNQUFNQSx1QkFB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QVdFO0FBQUssTUFBQSxTQUFTLEVBQUM7QUFBZiwyTEFYRixlQWVFLG9CQUFDLGtCQUFEO0FBQVUsTUFBQSxtQkFBbUIsRUFBRSxJQUEvQjtBQUFxQyxNQUFBLFVBQVUsRUFBRTtBQUFqRCxPQUNHa0Ysc0JBREgsQ0FmRixDQURELEdBb0JHLElBakROLENBREY7QUFxREQ7O0FBL1NnRiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgSUJyZWFrcG9pbnQsIElEZWJ1Z1NlcnZpY2UsIElFeGNlcHRpb25CcmVha3BvaW50IH0gZnJvbSBcIi4uL3R5cGVzXCJcclxuaW1wb3J0IHR5cGUgeyBOdWNsaWRlVXJpIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL251Y2xpZGVVcmlcIlxyXG5cclxuaW1wb3J0IFVuaXZlcnNhbERpc3Bvc2FibGUgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL1VuaXZlcnNhbERpc3Bvc2FibGVcIlxyXG5pbXBvcnQgaW52YXJpYW50IGZyb20gXCJhc3NlcnRcIlxyXG5pbXBvcnQgKiBhcyBSZWFjdCBmcm9tIFwicmVhY3RcIlxyXG5pbXBvcnQgbnVjbGlkZVVyaSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvbnVjbGlkZVVyaVwiXHJcbmltcG9ydCB7IENoZWNrYm94IH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0NoZWNrYm94XCJcclxuaW1wb3J0IHsgdHJhY2sgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvYW5hbHl0aWNzXCJcclxuaW1wb3J0IHsgTGlzdFZpZXcsIExpc3RWaWV3SXRlbSB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9MaXN0Vmlld1wiXHJcbmltcG9ydCBjbGFzc25hbWVzIGZyb20gXCJjbGFzc25hbWVzXCJcclxuaW1wb3J0IHsgSWNvbiB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9JY29uXCJcclxuaW1wb3J0IHsgT2JzZXJ2YWJsZSB9IGZyb20gXCJyeGpzLWNvbXBhdC9idW5kbGVzL3J4anMtY29tcGF0LnVtZC5taW4uanNcIlxyXG5pbXBvcnQgeyBBbmFseXRpY3NFdmVudHMgfSBmcm9tIFwiLi4vY29uc3RhbnRzXCJcclxuaW1wb3J0IHsgb3BlblNvdXJjZUxvY2F0aW9uIH0gZnJvbSBcIi4uL3V0aWxzXCJcclxuaW1wb3J0IHsgU2VjdGlvbiB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9TZWN0aW9uXCJcclxuaW1wb3J0IGZlYXR1cmVDb25maWcgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLWF0b20vZmVhdHVyZS1jb25maWdcIlxyXG5pbXBvcnQgeyBvYnNlcnZlUHJvamVjdFBhdGhzQWxsIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLWF0b20vcHJvamVjdHNcIlxyXG5pbXBvcnQgcGFzc2VzR0sgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL3Bhc3Nlc0dLXCJcclxuXHJcbnR5cGUgUHJvcHMgPSB7XHJcbiAgc2VydmljZTogSURlYnVnU2VydmljZSxcclxufVxyXG5cclxudHlwZSBTdGF0ZSA9IHtcclxuICBzdXBwb3J0c0NvbmRpdGlvbmFsQnJlYWtwb2ludHM6IGJvb2xlYW4sXHJcbiAgYnJlYWtwb2ludHM6IElCcmVha3BvaW50W10sXHJcbiAgZXhjZXB0aW9uQnJlYWtwb2ludHM6IElFeGNlcHRpb25CcmVha3BvaW50W10sXHJcbiAgZXhjZXB0aW9uQnJlYWtwb2ludHNDb2xsYXBzZWQ6IGJvb2xlYW4sXHJcbiAgdW5hdmFpbGFibGVCcmVha3BvaW50c0NvbGxhcHNlZDogYm9vbGVhbixcclxuICBhY3RpdmVQcm9qZWN0czogTnVjbGlkZVVyaVtdLFxyXG4gIHN1cHBvcnRzTG9nTWVzc2FnZTogYm9vbGVhbixcclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgQnJlYWtwb2ludExpc3RDb21wb25lbnQgZXh0ZW5kcyBSZWFjdC5Db21wb25lbnQ8UHJvcHMsIFN0YXRlPiB7XHJcbiAgX2Rpc3Bvc2FibGVzOiBVbml2ZXJzYWxEaXNwb3NhYmxlXHJcblxyXG4gIGNvbnN0cnVjdG9yKHByb3BzOiBQcm9wcykge1xyXG4gICAgc3VwZXIocHJvcHMpXHJcbiAgICB0aGlzLnN0YXRlID0gdGhpcy5fY29tcHV0ZVN0YXRlKClcclxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoXHJcbiAgICAgIE9ic2VydmFibGUuZnJvbVByb21pc2UocGFzc2VzR0soXCJudWNsaWRlX2RlYnVnZ2VyX2xvZ2dpbmdfYnJlYWtwb2ludHNcIikpLnN1YnNjcmliZSgoc3VwcG9ydHNMb2dNZXNzYWdlKSA9PiB7XHJcbiAgICAgICAgdGhpcy5zZXRTdGF0ZSh7IHN1cHBvcnRzTG9nTWVzc2FnZSB9KVxyXG4gICAgICB9KVxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgX2NvbXB1dGVTdGF0ZSgpOiBTdGF0ZSB7XHJcbiAgICBjb25zdCB7IHNlcnZpY2UgfSA9IHRoaXMucHJvcHNcclxuICAgIGNvbnN0IHsgZm9jdXNlZFByb2Nlc3MgfSA9IHNlcnZpY2Uudmlld01vZGVsXHJcbiAgICBjb25zdCBtb2RlbCA9IHNlcnZpY2UuZ2V0TW9kZWwoKVxyXG5cclxuICAgIGNvbnN0IGV4Y2VwdGlvbkJyZWFrcG9pbnRzQ29sbGFwc2VkID0gQm9vbGVhbihmZWF0dXJlQ29uZmlnLmdldChcImRlYnVnZ2VyLWV4Y2VwdGlvbkJyZWFrcG9pbnRzQ29sbGFwc2VkXCIpKVxyXG5cclxuICAgIGxldCBuZXdBY3RpdmVQcm9qZWN0cyA9IFtdXHJcbiAgICBsZXQgbmV3U3VwcG9ydHNMb2dNZXNzYWdlID0gZmFsc2VcclxuICAgIGlmICh0aGlzLnN0YXRlICE9IG51bGwpIHtcclxuICAgICAgY29uc3QgeyBhY3RpdmVQcm9qZWN0cywgc3VwcG9ydHNMb2dNZXNzYWdlIH0gPSB0aGlzLnN0YXRlXHJcbiAgICAgIGlmIChhY3RpdmVQcm9qZWN0cyAhPSBudWxsKSB7XHJcbiAgICAgICAgbmV3QWN0aXZlUHJvamVjdHMgPSBhY3RpdmVQcm9qZWN0c1xyXG4gICAgICB9XHJcbiAgICAgIG5ld1N1cHBvcnRzTG9nTWVzc2FnZSA9IHN1cHBvcnRzTG9nTWVzc2FnZVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIHN1cHBvcnRzQ29uZGl0aW9uYWxCcmVha3BvaW50czpcclxuICAgICAgICBmb2N1c2VkUHJvY2VzcyAhPSBudWxsICYmIEJvb2xlYW4oZm9jdXNlZFByb2Nlc3Muc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNDb25kaXRpb25hbEJyZWFrcG9pbnRzKSxcclxuICAgICAgYnJlYWtwb2ludHM6IG1vZGVsLmdldEJyZWFrcG9pbnRzKCksXHJcbiAgICAgIGV4Y2VwdGlvbkJyZWFrcG9pbnRzOiBtb2RlbC5nZXRFeGNlcHRpb25CcmVha3BvaW50cygpLFxyXG4gICAgICBleGNlcHRpb25CcmVha3BvaW50c0NvbGxhcHNlZCxcclxuICAgICAgdW5hdmFpbGFibGVCcmVha3BvaW50c0NvbGxhcHNlZDogdHJ1ZSxcclxuICAgICAgYWN0aXZlUHJvamVjdHM6IG5ld0FjdGl2ZVByb2plY3RzLFxyXG4gICAgICBzdXBwb3J0c0xvZ01lc3NhZ2U6IG5ld1N1cHBvcnRzTG9nTWVzc2FnZSxcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGNvbXBvbmVudERpZE1vdW50KCk6IHZvaWQge1xyXG4gICAgY29uc3QgbW9kZWwgPSB0aGlzLnByb3BzLnNlcnZpY2UuZ2V0TW9kZWwoKVxyXG4gICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IHRoaXMucHJvcHMuc2VydmljZVxyXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuYWRkKFxyXG4gICAgICBtb2RlbC5vbkRpZENoYW5nZUJyZWFrcG9pbnRzKCgpID0+IHtcclxuICAgICAgICB0aGlzLnNldFN0YXRlKHRoaXMuX2NvbXB1dGVTdGF0ZSgpKVxyXG4gICAgICB9KSxcclxuICAgICAgLy8gRXhjZXB0aW9uIGJyZWFrcG9pbnQgZmlsdGVycyBhcmUgZGlmZmVyZW50IGZvciBkaWZmZXJlbnQgZGVidWdnZXJzLFxyXG4gICAgICAvLyBzbyB3ZSBtdXN0IHJlZnJlc2ggd2hlbiBzd2l0Y2hpbmcgZGVidWdnZXIgZm9jdXMuXHJcbiAgICAgIHZpZXdNb2RlbC5vbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMoKCkgPT4ge1xyXG4gICAgICAgIHRoaXMuc2V0U3RhdGUodGhpcy5fY29tcHV0ZVN0YXRlKCkpXHJcbiAgICAgIH0pLFxyXG4gICAgICBvYnNlcnZlUHJvamVjdFBhdGhzQWxsKChwcm9qZWN0UGF0aHMpID0+IHRoaXMuc2V0U3RhdGUoeyBhY3RpdmVQcm9qZWN0czogcHJvamVjdFBhdGhzIH0pKVxyXG4gICAgKVxyXG4gIH1cclxuXHJcbiAgY29tcG9uZW50V2lsbFVubW91bnQoKTogdm9pZCB7XHJcbiAgICBpZiAodGhpcy5fZGlzcG9zYWJsZXMgIT0gbnVsbCkge1xyXG4gICAgICB0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKClcclxuICAgIH1cclxuICB9XHJcblxyXG4gIF9oYW5kbGVCcmVha3BvaW50RW5hYmxlZENoYW5nZSA9IChicmVha3BvaW50OiBJQnJlYWtwb2ludCwgZW5hYmxlZDogYm9vbGVhbik6IHZvaWQgPT4ge1xyXG4gICAgdGhpcy5wcm9wcy5zZXJ2aWNlLmVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzKGVuYWJsZWQsIGJyZWFrcG9pbnQpXHJcbiAgfVxyXG5cclxuICBfaGFuZGxlQnJlYWtwb2ludENsaWNrID0gKGJyZWFrcG9pbnRJbmRleDogbnVtYmVyLCBicmVha3BvaW50OiA/SUJyZWFrcG9pbnQpOiB2b2lkID0+IHtcclxuICAgIGludmFyaWFudChicmVha3BvaW50ICE9IG51bGwpXHJcbiAgICBjb25zdCB7IHVyaSwgbGluZSB9ID0gYnJlYWtwb2ludFxyXG4gICAgLy8gRGVidWdnZXIgbW9kZWwgaXMgMS1iYXNlZCB3aGlsZSBBdG9tIFVJIGlzIHplcm8tYmFzZWQuXHJcbiAgICBvcGVuU291cmNlTG9jYXRpb24odXJpLCBsaW5lIC0gMSlcclxuICB9XHJcblxyXG4gIF9zZXRFeGNlcHRpb25Db2xsYXBzZWQgPSAoY29sbGFwc2VkOiBib29sZWFuKTogdm9pZCA9PiB7XHJcbiAgICBmZWF0dXJlQ29uZmlnLnNldChcImRlYnVnZ2VyLWV4Y2VwdGlvbkJyZWFrcG9pbnRzQ29sbGFwc2VkXCIsIGNvbGxhcHNlZClcclxuICAgIHRoaXMuc2V0U3RhdGUoeyBleGNlcHRpb25CcmVha3BvaW50c0NvbGxhcHNlZDogY29sbGFwc2VkIH0pXHJcbiAgfVxyXG5cclxuICBfc2V0VW5hdmFpbGFibGVDb2xsYXBzZWQgPSAoY29sbGFwc2VkOiBib29sZWFuKTogdm9pZCA9PiB7XHJcbiAgICB0aGlzLnNldFN0YXRlKHsgdW5hdmFpbGFibGVCcmVha3BvaW50c0NvbGxhcHNlZDogY29sbGFwc2VkIH0pXHJcbiAgfVxyXG5cclxuICBfZ2V0SG9zdG5hbWVUcmFuc2xhdGVkKHVyaTogTnVjbGlkZVVyaSk6IHN0cmluZyB7XHJcbiAgICB0cnkge1xyXG4gICAgICAvLyAkRmxvd0ZCXHJcbiAgICAgIGNvbnN0IHsgZ2V0QnJlYWtwb2ludEhvc3RuYW1lVHJhbnNsYXRlZCB9ID0gcmVxdWlyZShcIi4vZmItdXRpbHNcIilcclxuICAgICAgcmV0dXJuIGdldEJyZWFrcG9pbnRIb3N0bmFtZVRyYW5zbGF0ZWQodXJpKVxyXG4gICAgfSBjYXRjaCAoXykge31cclxuXHJcbiAgICBpZiAobnVjbGlkZVVyaS5pc0xvY2FsKHVyaSkpIHtcclxuICAgICAgcmV0dXJuIFwibG9jYWxcIlxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgcmV0dXJuIG51Y2xpZGVVcmkuZ2V0SG9zdG5hbWUodXJpKVxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgX3JlbmRlckxvZ01lc3NhZ2UoYnJlYWtwb2ludDogSUJyZWFrcG9pbnQpOiA/UmVhY3QuTm9kZSB7XHJcbiAgICBpZiAoXHJcbiAgICAgICF0aGlzLnByb3BzLnNlcnZpY2Uudmlld01vZGVsLmZvY3VzZWRQcm9jZXNzIHx8XHJcbiAgICAgICF0aGlzLnN0YXRlLnN1cHBvcnRzTG9nTWVzc2FnZSB8fFxyXG4gICAgICBicmVha3BvaW50LmxvZ01lc3NhZ2UgPT0gbnVsbFxyXG4gICAgKSB7XHJcbiAgICAgIHJldHVybiBudWxsXHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIChcclxuICAgICAgPGRpdlxyXG4gICAgICAgIGNsYXNzTmFtZT1cImRlYnVnZ2VyLWJyZWFrcG9pbnQtY29uZGl0aW9uXCJcclxuICAgICAgICB0aXRsZT17YEJyZWFrcG9pbnQgbG9nIG1lc3NhZ2U6ICR7YnJlYWtwb2ludC5sb2dNZXNzYWdlfWB9XHJcbiAgICAgICAgZGF0YS1wYXRoPXticmVha3BvaW50LnVyaX1cclxuICAgICAgICBkYXRhLWxpbmU9e2JyZWFrcG9pbnQubGluZX1cclxuICAgICAgICBkYXRhLWJwaWQ9e2JyZWFrcG9pbnQuZ2V0SWQoKX1cclxuICAgICAgICBvbkNsaWNrPXsoZXZlbnQpID0+IHtcclxuICAgICAgICAgIGF0b20uY29tbWFuZHMuZGlzcGF0Y2goZXZlbnQudGFyZ2V0LCBcImRlYnVnZ2VyOmVkaXQtYnJlYWtwb2ludFwiKVxyXG4gICAgICAgIH19XHJcbiAgICAgID5cclxuICAgICAgICBMb2cgTWVzc2FnZToge2JyZWFrcG9pbnQubG9nTWVzc2FnZX1cclxuICAgICAgPC9kaXY+XHJcbiAgICApXHJcbiAgfVxyXG5cclxuICByZW5kZXIoKTogUmVhY3QuTm9kZSB7XHJcbiAgICBjb25zdCB7IGV4Y2VwdGlvbkJyZWFrcG9pbnRzLCBzdXBwb3J0c0NvbmRpdGlvbmFsQnJlYWtwb2ludHMsIGFjdGl2ZVByb2plY3RzLCBicmVha3BvaW50cyB9ID0gdGhpcy5zdGF0ZVxyXG4gICAgY29uc3QgeyBzZXJ2aWNlIH0gPSB0aGlzLnByb3BzXHJcbiAgICBjb25zdCBhdmFpbGFibGVIb3N0cyA9IGFjdGl2ZVByb2plY3RzXHJcbiAgICAgIC5maWx0ZXIoKHVyaSkgPT4gbnVjbGlkZVVyaS5pc1JlbW90ZSh1cmkpKVxyXG4gICAgICAubWFwKCh1cmkpID0+IHRoaXMuX2dldEhvc3RuYW1lVHJhbnNsYXRlZCh1cmkpKVxyXG4gICAgY29uc3QgYnJlYWtwb2ludEdyb3VwID0gKGF2YWlsYWJsZSkgPT5cclxuICAgICAgYnJlYWtwb2ludHNcclxuICAgICAgICAuZmlsdGVyKChicCkgPT4ge1xyXG4gICAgICAgICAgY29uc3QgbWF0Y2ggPVxyXG4gICAgICAgICAgICBudWNsaWRlVXJpLmlzTG9jYWwoYnAudXJpKSB8fCBhdmFpbGFibGVIb3N0cy5zb21lKChob3N0KSA9PiB0aGlzLl9nZXRIb3N0bmFtZVRyYW5zbGF0ZWQoYnAudXJpKSA9PT0gaG9zdClcclxuICAgICAgICAgIHJldHVybiBhdmFpbGFibGUgPyBtYXRjaCA6ICFtYXRjaFxyXG4gICAgICAgIH0pXHJcbiAgICAgICAgLnNvcnQoKGJyZWFrcG9pbnRBLCBicmVha3BvaW50QikgPT4ge1xyXG4gICAgICAgICAgY29uc3QgZmlsZUEgPSBudWNsaWRlVXJpLmJhc2VuYW1lKGJyZWFrcG9pbnRBLnVyaSlcclxuICAgICAgICAgIGNvbnN0IGZpbGVCID0gbnVjbGlkZVVyaS5iYXNlbmFtZShicmVha3BvaW50Qi51cmkpXHJcbiAgICAgICAgICBpZiAoZmlsZUEgIT09IGZpbGVCKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmaWxlQS5sb2NhbGVDb21wYXJlKGZpbGVCKVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgcmV0dXJuIGJyZWFrcG9pbnRBLmxpbmUgLSBicmVha3BvaW50Qi5saW5lXHJcbiAgICAgICAgfSlcclxuICAgICAgICAubWFwKChicmVha3BvaW50LCBpKSA9PiB7XHJcbiAgICAgICAgICBjb25zdCBob3N0ID0gdGhpcy5fZ2V0SG9zdG5hbWVUcmFuc2xhdGVkKGJyZWFrcG9pbnQudXJpKSB8fCBcImxvY2FsXCJcclxuICAgICAgICAgIGNvbnN0IGJhc2VuYW1lID0gbnVjbGlkZVVyaS5iYXNlbmFtZShicmVha3BvaW50LnVyaSlcclxuICAgICAgICAgIGNvbnN0IHsgbGluZSwgdmVyaWZpZWQsIHVyaTogcGF0aCB9ID0gYnJlYWtwb2ludFxyXG4gICAgICAgICAgY29uc3QgZW5hYmxlZCA9IGJyZWFrcG9pbnQuZW5hYmxlZCAmJiBhdmFpbGFibGVcclxuICAgICAgICAgIGNvbnN0IGJwSWQgPSBicmVha3BvaW50LmdldElkKClcclxuICAgICAgICAgIGNvbnN0IGxhYmVsID0gYCR7YmFzZW5hbWV9OiR7bGluZX1gXHJcbiAgICAgICAgICBjb25zdCB0aXRsZSA9XHJcbiAgICAgICAgICAgICghZW5hYmxlZFxyXG4gICAgICAgICAgICAgID8gXCJEaXNhYmxlZCBicmVha3BvaW50XCJcclxuICAgICAgICAgICAgICA6ICF2ZXJpZmllZFxyXG4gICAgICAgICAgICAgID8gXCJVbnJlc29sdmVkIEJyZWFrcG9pbnRcIlxyXG4gICAgICAgICAgICAgIDogYEJyZWFrcG9pbnQgYXQgJHtsYWJlbH0gKHJlc29sdmVkKWApICtcclxuICAgICAgICAgICAgKGF2YWlsYWJsZSA/IFwiXCIgOiBgIC0gJHtob3N0fToke251Y2xpZGVVcmkuZ2V0UGF0aChicmVha3BvaW50LnVyaSl9YClcclxuXHJcbiAgICAgICAgICBjb25zdCBjb25kaXRpb25FbGVtZW50ID1cclxuICAgICAgICAgICAgc3VwcG9ydHNDb25kaXRpb25hbEJyZWFrcG9pbnRzICYmIGJyZWFrcG9pbnQuY29uZGl0aW9uICE9IG51bGwgPyAoXHJcbiAgICAgICAgICAgICAgPGRpdlxyXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lPVwiZGVidWdnZXItYnJlYWtwb2ludC1jb25kaXRpb25cIlxyXG4gICAgICAgICAgICAgICAgdGl0bGU9e2BCcmVha3BvaW50IGNvbmRpdGlvbjogJHticmVha3BvaW50LmNvbmRpdGlvbn1gfVxyXG4gICAgICAgICAgICAgICAgZGF0YS1wYXRoPXtwYXRofVxyXG4gICAgICAgICAgICAgICAgZGF0YS1saW5lPXtsaW5lfVxyXG4gICAgICAgICAgICAgICAgZGF0YS1icGlkPXticElkfVxyXG4gICAgICAgICAgICAgICAgb25DbGljaz17KGV2ZW50KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgIGF0b20uY29tbWFuZHMuZGlzcGF0Y2goZXZlbnQudGFyZ2V0LCBcImRlYnVnZ2VyOmVkaXQtYnJlYWtwb2ludFwiKVxyXG4gICAgICAgICAgICAgICAgfX1cclxuICAgICAgICAgICAgICA+XHJcbiAgICAgICAgICAgICAgICBDb25kaXRpb246IHticmVha3BvaW50LmNvbmRpdGlvbn1cclxuICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgKSA6IG51bGxcclxuXHJcbiAgICAgICAgICBjb25zdCBoaXRjb3VudEVsZW1lbnQgPVxyXG4gICAgICAgICAgICBicmVha3BvaW50LmhpdENvdW50ICE9IG51bGwgJiYgYnJlYWtwb2ludC5oaXRDb3VudCA+IDAgPyAoXHJcbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1icmVha3BvaW50LWhpdGNvdW50XCI+SGl0IGNvdW50OiB7YnJlYWtwb2ludC5oaXRDb3VudH08L2Rpdj5cclxuICAgICAgICAgICAgKSA6IG51bGxcclxuICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSAoXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiaW5saW5lLWJsb2NrXCI+XHJcbiAgICAgICAgICAgICAgPGRpdlxyXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lPXtjbGFzc25hbWVzKHtcclxuICAgICAgICAgICAgICAgICAgXCJkZWJ1Z2dlci1icmVha3BvaW50LWRpc2FibGVkXCI6ICFlbmFibGVkLFxyXG4gICAgICAgICAgICAgICAgICBcImRlYnVnZ2VyLWJyZWFrcG9pbnQtd2l0aC1jb25kaXRpb25cIjogQm9vbGVhbihicmVha3BvaW50LmNvbmRpdGlvbiksXHJcbiAgICAgICAgICAgICAgICB9KX1cclxuICAgICAgICAgICAgICAgIGtleT17aX1cclxuICAgICAgICAgICAgICA+XHJcbiAgICAgICAgICAgICAgICA8Q2hlY2tib3hcclxuICAgICAgICAgICAgICAgICAgY2hlY2tlZD17ZW5hYmxlZH1cclxuICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9e3RoaXMuX2hhbmRsZUJyZWFrcG9pbnRFbmFibGVkQ2hhbmdlLmJpbmQodGhpcywgYnJlYWtwb2ludCl9XHJcbiAgICAgICAgICAgICAgICAgIG9uQ2xpY2s9eyhldmVudDogU3ludGhldGljRXZlbnQ8PikgPT4gZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCl9XHJcbiAgICAgICAgICAgICAgICAgIHRpdGxlPXt0aXRsZX1cclxuICAgICAgICAgICAgICAgICAgZGlzYWJsZWQ9eyFhdmFpbGFibGV9XHJcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZT17Y2xhc3NuYW1lcyhcclxuICAgICAgICAgICAgICAgICAgICB2ZXJpZmllZCA/IFwiXCIgOiBcImRlYnVnZ2VyLWJyZWFrcG9pbnQtdW5yZXNvbHZlZFwiLFxyXG4gICAgICAgICAgICAgICAgICAgIFwiZGVidWdnZXItYnJlYWtwb2ludC1jaGVja2JveFwiXHJcbiAgICAgICAgICAgICAgICAgICl9XHJcbiAgICAgICAgICAgICAgICAvPlxyXG4gICAgICAgICAgICAgICAgPHNwYW4gdGl0bGU9e3RpdGxlfSBkYXRhLXBhdGg9e3BhdGh9IGRhdGEtYnBpZD17YnBJZH0gZGF0YS1saW5lPXtsaW5lfT5cclxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1icmVha3BvaW50LWNvbmRpdGlvbi1jb250cm9sc1wiPlxyXG4gICAgICAgICAgICAgICAgICAgIDxJY29uXHJcbiAgICAgICAgICAgICAgICAgICAgICBpY29uPVwicGVuY2lsXCJcclxuICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZT1cImRlYnVnZ2VyLWJyZWFrcG9pbnQtY29uZGl0aW9uLWNvbnRyb2xcIlxyXG4gICAgICAgICAgICAgICAgICAgICAgZGF0YS1wYXRoPXtwYXRofVxyXG4gICAgICAgICAgICAgICAgICAgICAgZGF0YS1icGlkPXticElkfVxyXG4gICAgICAgICAgICAgICAgICAgICAgZGF0YS1saW5lPXtsaW5lfVxyXG4gICAgICAgICAgICAgICAgICAgICAgb25DbGljaz17KGV2ZW50KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9FRElUX0JSRUFLUE9JTlRfRlJPTV9JQ09OKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBhdG9tLmNvbW1hbmRzLmRpc3BhdGNoKGV2ZW50LnRhcmdldCwgXCJkZWJ1Z2dlcjplZGl0LWJyZWFrcG9pbnRcIilcclxuICAgICAgICAgICAgICAgICAgICAgIH19XHJcbiAgICAgICAgICAgICAgICAgICAgLz5cclxuICAgICAgICAgICAgICAgICAgICA8SWNvblxyXG4gICAgICAgICAgICAgICAgICAgICAgaWNvbj1cInhcIlxyXG4gICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lPVwiZGVidWdnZXItYnJlYWtwb2ludC1jb25kaXRpb24tY29udHJvbFwiXHJcbiAgICAgICAgICAgICAgICAgICAgICBkYXRhLXBhdGg9e3BhdGh9XHJcbiAgICAgICAgICAgICAgICAgICAgICBkYXRhLWJwaWQ9e2JwSWR9XHJcbiAgICAgICAgICAgICAgICAgICAgICBkYXRhLWxpbmU9e2xpbmV9XHJcbiAgICAgICAgICAgICAgICAgICAgICBvbkNsaWNrPXsoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX0RFTEVURV9CUkVBS1BPSU5UX0ZST01fSUNPTilcclxuICAgICAgICAgICAgICAgICAgICAgICAgYXRvbS5jb21tYW5kcy5kaXNwYXRjaChldmVudC50YXJnZXQsIFwiZGVidWdnZXI6cmVtb3ZlLWJyZWFrcG9pbnRcIilcclxuICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKClcclxuICAgICAgICAgICAgICAgICAgICAgIH19XHJcbiAgICAgICAgICAgICAgICAgICAgLz5cclxuICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgIHtsYWJlbH1cclxuICAgICAgICAgICAgICAgIDwvc3Bhbj5cclxuICAgICAgICAgICAgICAgIHtjb25kaXRpb25FbGVtZW50fVxyXG4gICAgICAgICAgICAgICAge3RoaXMuX3JlbmRlckxvZ01lc3NhZ2UoYnJlYWtwb2ludCl9XHJcbiAgICAgICAgICAgICAgICB7aGl0Y291bnRFbGVtZW50fVxyXG4gICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgIClcclxuICAgICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgIDxMaXN0Vmlld0l0ZW1cclxuICAgICAgICAgICAgICBrZXk9e2xhYmVsfVxyXG4gICAgICAgICAgICAgIGluZGV4PXtpfVxyXG4gICAgICAgICAgICAgIHZhbHVlPXticmVha3BvaW50fVxyXG4gICAgICAgICAgICAgIGRhdGEtcGF0aD17cGF0aH1cclxuICAgICAgICAgICAgICBkYXRhLWJwaWQ9e2JwSWR9XHJcbiAgICAgICAgICAgICAgZGF0YS1saW5lPXtsaW5lfVxyXG4gICAgICAgICAgICAgIHRpdGxlPXt0aXRsZX1cclxuICAgICAgICAgICAgICBjbGFzc05hbWU9XCJkZWJ1Z2dlci1icmVha3BvaW50XCJcclxuICAgICAgICAgICAgPlxyXG4gICAgICAgICAgICAgIHtjb250ZW50fVxyXG4gICAgICAgICAgICA8L0xpc3RWaWV3SXRlbT5cclxuICAgICAgICAgIClcclxuICAgICAgICB9KVxyXG4gICAgY29uc3QgYXZhaWxhYmxlQnJlYWtwb2ludHMgPSBicmVha3BvaW50R3JvdXAodHJ1ZSlcclxuICAgIGNvbnN0IHVuYXZhaWxhYmxlQnJlYWtwb2ludHMgPSBicmVha3BvaW50R3JvdXAoZmFsc2UpXHJcbiAgICByZXR1cm4gKFxyXG4gICAgICA8ZGl2PlxyXG4gICAgICAgIDxMaXN0VmlldyBhbHRlcm5hdGVCYWNrZ3JvdW5kPXt0cnVlfSBvblNlbGVjdD17dGhpcy5faGFuZGxlQnJlYWtwb2ludENsaWNrfSBzZWxlY3RhYmxlPXt0cnVlfT5cclxuICAgICAgICAgIHthdmFpbGFibGVCcmVha3BvaW50c31cclxuICAgICAgICA8L0xpc3RWaWV3PlxyXG4gICAgICAgIHticmVha3BvaW50cy5sZW5ndGggPT09IDAgPyAoXHJcbiAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1icmVha3BvaW50XCI+WW91IGN1cnJlbnRseSBoYXZlIG5vIHNvdXJjZSBicmVha3BvaW50cyBzZXQuPC9zcGFuPlxyXG4gICAgICAgICkgOiBudWxsfVxyXG4gICAgICAgIHtleGNlcHRpb25CcmVha3BvaW50cy5sZW5ndGggPiAwID8gKFxyXG4gICAgICAgICAgPFNlY3Rpb25cclxuICAgICAgICAgICAgY2xhc3NOYW1lPVwiZGVidWdnZXItYnJlYWtwb2ludC1zZWN0aW9uXCJcclxuICAgICAgICAgICAgaGVhZGxpbmU9XCJFeGNlcHRpb24gYnJlYWtwb2ludHNcIlxyXG4gICAgICAgICAgICBjb2xsYXBzYWJsZT17dHJ1ZX1cclxuICAgICAgICAgICAgb25DaGFuZ2U9e3RoaXMuX3NldEV4Y2VwdGlvbkNvbGxhcHNlZH1cclxuICAgICAgICAgICAgY29sbGFwc2VkPXt0aGlzLnN0YXRlLmV4Y2VwdGlvbkJyZWFrcG9pbnRzQ29sbGFwc2VkfVxyXG4gICAgICAgICAgPlxyXG4gICAgICAgICAgICB7ZXhjZXB0aW9uQnJlYWtwb2ludHMubWFwKChleGNlcHRpb25CcmVha3BvaW50KSA9PiB7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItYnJlYWtwb2ludFwiIGtleT17ZXhjZXB0aW9uQnJlYWtwb2ludC5nZXRJZCgpfT5cclxuICAgICAgICAgICAgICAgICAgPENoZWNrYm94XHJcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lPXtjbGFzc25hbWVzKFwiZGVidWdnZXItYnJlYWtwb2ludC1jaGVja2JveFwiLCBcImRlYnVnZ2VyLWV4Y2VwdGlvbi1jaGVja2JveFwiKX1cclxuICAgICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KGVuYWJsZWQpID0+IHNlcnZpY2UuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoZW5hYmxlZCwgZXhjZXB0aW9uQnJlYWtwb2ludCl9XHJcbiAgICAgICAgICAgICAgICAgICAgY2hlY2tlZD17ZXhjZXB0aW9uQnJlYWtwb2ludC5lbmFibGVkfVxyXG4gICAgICAgICAgICAgICAgICAvPlxyXG4gICAgICAgICAgICAgICAgICB7ZXhjZXB0aW9uQnJlYWtwb2ludC5sYWJlbCB8fCBgJHtleGNlcHRpb25CcmVha3BvaW50LmZpbHRlcn0gZXhjZXB0aW9uc2B9XHJcbiAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICApXHJcbiAgICAgICAgICAgIH0pfVxyXG4gICAgICAgICAgPC9TZWN0aW9uPlxyXG4gICAgICAgICkgOiBudWxsfVxyXG4gICAgICAgIHt1bmF2YWlsYWJsZUJyZWFrcG9pbnRzLmxlbmd0aCA+IDAgPyAoXHJcbiAgICAgICAgICA8U2VjdGlvblxyXG4gICAgICAgICAgICBjbGFzc05hbWU9XCJkZWJ1Z2dlci1icmVha3BvaW50LXNlY3Rpb25cIlxyXG4gICAgICAgICAgICBoZWFkbGluZT17XHJcbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJpbmxpbmUtYmxvY2tcIj5cclxuICAgICAgICAgICAgICAgIDxJY29uIGljb249XCJudWNsaWNvbi13YXJuaW5nXCIgLz4gVW5hdmFpbGFibGUgYnJlYWtwb2ludHNcclxuICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb2xsYXBzYWJsZT17dHJ1ZX1cclxuICAgICAgICAgICAgb25DaGFuZ2U9e3RoaXMuX3NldFVuYXZhaWxhYmxlQ29sbGFwc2VkfVxyXG4gICAgICAgICAgICBjb2xsYXBzZWQ9e3RoaXMuc3RhdGUudW5hdmFpbGFibGVCcmVha3BvaW50c0NvbGxhcHNlZH1cclxuICAgICAgICAgID5cclxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci11bmF2YWlsYWJsZS1icmVha3BvaW50LWhlbHBcIj5cclxuICAgICAgICAgICAgICBUaGVzZSBicmVha3BvaW50cyBhcmUgaW4gZmlsZXMgdGhhdCBhcmUgbm90IGN1cnJlbnRseSBhdmFpbGFibGUgaW4gYW55IHByb2plY3Qgcm9vdC4gQWRkIHRoZSBjb3JyZXNwb25kaW5nXHJcbiAgICAgICAgICAgICAgbG9jYWwgb3IgcmVtb3RlIHByb2plY3QgdG8geW91ciBmaWxlIHRyZWUgdG8gZW5hYmxlIHRoZXNlIGJyZWFrcG9pbnRzLlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgPExpc3RWaWV3IGFsdGVybmF0ZUJhY2tncm91bmQ9e3RydWV9IHNlbGVjdGFibGU9e2ZhbHNlfT5cclxuICAgICAgICAgICAgICB7dW5hdmFpbGFibGVCcmVha3BvaW50c31cclxuICAgICAgICAgICAgPC9MaXN0Vmlldz5cclxuICAgICAgICAgIDwvU2VjdGlvbj5cclxuICAgICAgICApIDogbnVsbH1cclxuICAgICAgPC9kaXY+XHJcbiAgICApXHJcbiAgfVxyXG59XHJcbiJdfQ==