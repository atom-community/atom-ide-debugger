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

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkJyZWFrcG9pbnRMaXN0Q29tcG9uZW50LmpzIl0sIm5hbWVzIjpbIkJyZWFrcG9pbnRMaXN0Q29tcG9uZW50IiwiUmVhY3QiLCJDb21wb25lbnQiLCJjb25zdHJ1Y3RvciIsInByb3BzIiwiX2Rpc3Bvc2FibGVzIiwiX2hhbmRsZUJyZWFrcG9pbnRFbmFibGVkQ2hhbmdlIiwiYnJlYWtwb2ludCIsImVuYWJsZWQiLCJzZXJ2aWNlIiwiZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMiLCJfaGFuZGxlQnJlYWtwb2ludENsaWNrIiwiYnJlYWtwb2ludEluZGV4IiwidXJpIiwibGluZSIsIl9zZXRFeGNlcHRpb25Db2xsYXBzZWQiLCJjb2xsYXBzZWQiLCJmZWF0dXJlQ29uZmlnIiwic2V0Iiwic2V0U3RhdGUiLCJleGNlcHRpb25CcmVha3BvaW50c0NvbGxhcHNlZCIsIl9zZXRVbmF2YWlsYWJsZUNvbGxhcHNlZCIsInVuYXZhaWxhYmxlQnJlYWtwb2ludHNDb2xsYXBzZWQiLCJzdGF0ZSIsIl9jb21wdXRlU3RhdGUiLCJVbml2ZXJzYWxEaXNwb3NhYmxlIiwiT2JzZXJ2YWJsZSIsImZyb21Qcm9taXNlIiwic3Vic2NyaWJlIiwic3VwcG9ydHNMb2dNZXNzYWdlIiwiZm9jdXNlZFByb2Nlc3MiLCJ2aWV3TW9kZWwiLCJtb2RlbCIsImdldE1vZGVsIiwiQm9vbGVhbiIsImdldCIsIm5ld0FjdGl2ZVByb2plY3RzIiwibmV3U3VwcG9ydHNMb2dNZXNzYWdlIiwiYWN0aXZlUHJvamVjdHMiLCJzdXBwb3J0c0NvbmRpdGlvbmFsQnJlYWtwb2ludHMiLCJzZXNzaW9uIiwiY2FwYWJpbGl0aWVzIiwiYnJlYWtwb2ludHMiLCJnZXRCcmVha3BvaW50cyIsImV4Y2VwdGlvbkJyZWFrcG9pbnRzIiwiZ2V0RXhjZXB0aW9uQnJlYWtwb2ludHMiLCJjb21wb25lbnREaWRNb3VudCIsImFkZCIsIm9uRGlkQ2hhbmdlQnJlYWtwb2ludHMiLCJvbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMiLCJwcm9qZWN0UGF0aHMiLCJjb21wb25lbnRXaWxsVW5tb3VudCIsImRpc3Bvc2UiLCJfZ2V0SG9zdG5hbWVUcmFuc2xhdGVkIiwiZ2V0QnJlYWtwb2ludEhvc3RuYW1lVHJhbnNsYXRlZCIsInJlcXVpcmUiLCJfIiwibnVjbGlkZVVyaSIsImlzTG9jYWwiLCJnZXRIb3N0bmFtZSIsIl9yZW5kZXJMb2dNZXNzYWdlIiwibG9nTWVzc2FnZSIsImdldElkIiwiZXZlbnQiLCJhdG9tIiwiY29tbWFuZHMiLCJkaXNwYXRjaCIsInRhcmdldCIsInJlbmRlciIsImF2YWlsYWJsZUhvc3RzIiwiZmlsdGVyIiwiaXNSZW1vdGUiLCJtYXAiLCJicmVha3BvaW50R3JvdXAiLCJhdmFpbGFibGUiLCJicCIsIm1hdGNoIiwic29tZSIsImhvc3QiLCJzb3J0IiwiYnJlYWtwb2ludEEiLCJicmVha3BvaW50QiIsImZpbGVBIiwiYmFzZW5hbWUiLCJmaWxlQiIsImxvY2FsZUNvbXBhcmUiLCJpIiwidmVyaWZpZWQiLCJwYXRoIiwiYnBJZCIsImxhYmVsIiwidGl0bGUiLCJnZXRQYXRoIiwiY29uZGl0aW9uRWxlbWVudCIsImNvbmRpdGlvbiIsImhpdGNvdW50RWxlbWVudCIsImhpdENvdW50IiwiY29udGVudCIsImJpbmQiLCJzdG9wUHJvcGFnYXRpb24iLCJBbmFseXRpY3NFdmVudHMiLCJERUJVR0dFUl9FRElUX0JSRUFLUE9JTlRfRlJPTV9JQ09OIiwiREVCVUdHRVJfREVMRVRFX0JSRUFLUE9JTlRfRlJPTV9JQ09OIiwiYXZhaWxhYmxlQnJlYWtwb2ludHMiLCJ1bmF2YWlsYWJsZUJyZWFrcG9pbnRzIiwibGVuZ3RoIiwiZXhjZXB0aW9uQnJlYWtwb2ludCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUdBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQWdCZSxNQUFNQSx1QkFB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QVdFO0FBQUssTUFBQSxTQUFTLEVBQUM7QUFBZiwyTEFYRixlQWVFLG9CQUFDLGtCQUFEO0FBQVUsTUFBQSxtQkFBbUIsRUFBRSxJQUEvQjtBQUFxQyxNQUFBLFVBQVUsRUFBRTtBQUFqRCxPQUNHa0Ysc0JBREgsQ0FmRixDQURELEdBb0JHLElBakROLENBREY7QUFxREQ7O0FBL1NnRiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgSUJyZWFrcG9pbnQsIElEZWJ1Z1NlcnZpY2UsIElFeGNlcHRpb25CcmVha3BvaW50IH0gZnJvbSBcIi4uL3R5cGVzXCJcbmltcG9ydCB0eXBlIHsgTnVjbGlkZVVyaSB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9udWNsaWRlVXJpXCJcblxuaW1wb3J0IFVuaXZlcnNhbERpc3Bvc2FibGUgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL1VuaXZlcnNhbERpc3Bvc2FibGVcIlxuaW1wb3J0IGludmFyaWFudCBmcm9tIFwiYXNzZXJ0XCJcbmltcG9ydCAqIGFzIFJlYWN0IGZyb20gXCJyZWFjdFwiXG5pbXBvcnQgbnVjbGlkZVVyaSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvbnVjbGlkZVVyaVwiXG5pbXBvcnQgeyBDaGVja2JveCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9DaGVja2JveFwiXG5pbXBvcnQgeyB0cmFjayB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9hbmFseXRpY3NcIlxuaW1wb3J0IHsgTGlzdFZpZXcsIExpc3RWaWV3SXRlbSB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9MaXN0Vmlld1wiXG5pbXBvcnQgY2xhc3NuYW1lcyBmcm9tIFwiY2xhc3NuYW1lc1wiXG5pbXBvcnQgeyBJY29uIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0ljb25cIlxuaW1wb3J0IHsgT2JzZXJ2YWJsZSB9IGZyb20gXCJyeGpzLWNvbXBhdC9idW5kbGVzL3J4anMtY29tcGF0LnVtZC5taW4uanNcIlxuaW1wb3J0IHsgQW5hbHl0aWNzRXZlbnRzIH0gZnJvbSBcIi4uL2NvbnN0YW50c1wiXG5pbXBvcnQgeyBvcGVuU291cmNlTG9jYXRpb24gfSBmcm9tIFwiLi4vdXRpbHNcIlxuaW1wb3J0IHsgU2VjdGlvbiB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9TZWN0aW9uXCJcbmltcG9ydCBmZWF0dXJlQ29uZmlnIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy1hdG9tL2ZlYXR1cmUtY29uZmlnXCJcbmltcG9ydCB7IG9ic2VydmVQcm9qZWN0UGF0aHNBbGwgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMtYXRvbS9wcm9qZWN0c1wiXG5pbXBvcnQgcGFzc2VzR0sgZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zL3Bhc3Nlc0dLXCJcblxudHlwZSBQcm9wcyA9IHtcbiAgc2VydmljZTogSURlYnVnU2VydmljZSxcbn1cblxudHlwZSBTdGF0ZSA9IHtcbiAgc3VwcG9ydHNDb25kaXRpb25hbEJyZWFrcG9pbnRzOiBib29sZWFuLFxuICBicmVha3BvaW50czogSUJyZWFrcG9pbnRbXSxcbiAgZXhjZXB0aW9uQnJlYWtwb2ludHM6IElFeGNlcHRpb25CcmVha3BvaW50W10sXG4gIGV4Y2VwdGlvbkJyZWFrcG9pbnRzQ29sbGFwc2VkOiBib29sZWFuLFxuICB1bmF2YWlsYWJsZUJyZWFrcG9pbnRzQ29sbGFwc2VkOiBib29sZWFuLFxuICBhY3RpdmVQcm9qZWN0czogTnVjbGlkZVVyaVtdLFxuICBzdXBwb3J0c0xvZ01lc3NhZ2U6IGJvb2xlYW4sXG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEJyZWFrcG9pbnRMaXN0Q29tcG9uZW50IGV4dGVuZHMgUmVhY3QuQ29tcG9uZW50PFByb3BzLCBTdGF0ZT4ge1xuICBfZGlzcG9zYWJsZXM6IFVuaXZlcnNhbERpc3Bvc2FibGVcblxuICBjb25zdHJ1Y3Rvcihwcm9wczogUHJvcHMpIHtcbiAgICBzdXBlcihwcm9wcylcbiAgICB0aGlzLnN0YXRlID0gdGhpcy5fY29tcHV0ZVN0YXRlKClcbiAgICB0aGlzLl9kaXNwb3NhYmxlcyA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKFxuICAgICAgT2JzZXJ2YWJsZS5mcm9tUHJvbWlzZShwYXNzZXNHSyhcIm51Y2xpZGVfZGVidWdnZXJfbG9nZ2luZ19icmVha3BvaW50c1wiKSkuc3Vic2NyaWJlKChzdXBwb3J0c0xvZ01lc3NhZ2UpID0+IHtcbiAgICAgICAgdGhpcy5zZXRTdGF0ZSh7IHN1cHBvcnRzTG9nTWVzc2FnZSB9KVxuICAgICAgfSlcbiAgICApXG4gIH1cblxuICBfY29tcHV0ZVN0YXRlKCk6IFN0YXRlIHtcbiAgICBjb25zdCB7IHNlcnZpY2UgfSA9IHRoaXMucHJvcHNcbiAgICBjb25zdCB7IGZvY3VzZWRQcm9jZXNzIH0gPSBzZXJ2aWNlLnZpZXdNb2RlbFxuICAgIGNvbnN0IG1vZGVsID0gc2VydmljZS5nZXRNb2RlbCgpXG5cbiAgICBjb25zdCBleGNlcHRpb25CcmVha3BvaW50c0NvbGxhcHNlZCA9IEJvb2xlYW4oZmVhdHVyZUNvbmZpZy5nZXQoXCJkZWJ1Z2dlci1leGNlcHRpb25CcmVha3BvaW50c0NvbGxhcHNlZFwiKSlcblxuICAgIGxldCBuZXdBY3RpdmVQcm9qZWN0cyA9IFtdXG4gICAgbGV0IG5ld1N1cHBvcnRzTG9nTWVzc2FnZSA9IGZhbHNlXG4gICAgaWYgKHRoaXMuc3RhdGUgIT0gbnVsbCkge1xuICAgICAgY29uc3QgeyBhY3RpdmVQcm9qZWN0cywgc3VwcG9ydHNMb2dNZXNzYWdlIH0gPSB0aGlzLnN0YXRlXG4gICAgICBpZiAoYWN0aXZlUHJvamVjdHMgIT0gbnVsbCkge1xuICAgICAgICBuZXdBY3RpdmVQcm9qZWN0cyA9IGFjdGl2ZVByb2plY3RzXG4gICAgICB9XG4gICAgICBuZXdTdXBwb3J0c0xvZ01lc3NhZ2UgPSBzdXBwb3J0c0xvZ01lc3NhZ2VcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3VwcG9ydHNDb25kaXRpb25hbEJyZWFrcG9pbnRzOlxuICAgICAgICBmb2N1c2VkUHJvY2VzcyAhPSBudWxsICYmIEJvb2xlYW4oZm9jdXNlZFByb2Nlc3Muc2Vzc2lvbi5jYXBhYmlsaXRpZXMuc3VwcG9ydHNDb25kaXRpb25hbEJyZWFrcG9pbnRzKSxcbiAgICAgIGJyZWFrcG9pbnRzOiBtb2RlbC5nZXRCcmVha3BvaW50cygpLFxuICAgICAgZXhjZXB0aW9uQnJlYWtwb2ludHM6IG1vZGVsLmdldEV4Y2VwdGlvbkJyZWFrcG9pbnRzKCksXG4gICAgICBleGNlcHRpb25CcmVha3BvaW50c0NvbGxhcHNlZCxcbiAgICAgIHVuYXZhaWxhYmxlQnJlYWtwb2ludHNDb2xsYXBzZWQ6IHRydWUsXG4gICAgICBhY3RpdmVQcm9qZWN0czogbmV3QWN0aXZlUHJvamVjdHMsXG4gICAgICBzdXBwb3J0c0xvZ01lc3NhZ2U6IG5ld1N1cHBvcnRzTG9nTWVzc2FnZSxcbiAgICB9XG4gIH1cblxuICBjb21wb25lbnREaWRNb3VudCgpOiB2b2lkIHtcbiAgICBjb25zdCBtb2RlbCA9IHRoaXMucHJvcHMuc2VydmljZS5nZXRNb2RlbCgpXG4gICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IHRoaXMucHJvcHMuc2VydmljZVxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChcbiAgICAgIG1vZGVsLm9uRGlkQ2hhbmdlQnJlYWtwb2ludHMoKCkgPT4ge1xuICAgICAgICB0aGlzLnNldFN0YXRlKHRoaXMuX2NvbXB1dGVTdGF0ZSgpKVxuICAgICAgfSksXG4gICAgICAvLyBFeGNlcHRpb24gYnJlYWtwb2ludCBmaWx0ZXJzIGFyZSBkaWZmZXJlbnQgZm9yIGRpZmZlcmVudCBkZWJ1Z2dlcnMsXG4gICAgICAvLyBzbyB3ZSBtdXN0IHJlZnJlc2ggd2hlbiBzd2l0Y2hpbmcgZGVidWdnZXIgZm9jdXMuXG4gICAgICB2aWV3TW9kZWwub25EaWRDaGFuZ2VEZWJ1Z2dlckZvY3VzKCgpID0+IHtcbiAgICAgICAgdGhpcy5zZXRTdGF0ZSh0aGlzLl9jb21wdXRlU3RhdGUoKSlcbiAgICAgIH0pLFxuICAgICAgb2JzZXJ2ZVByb2plY3RQYXRoc0FsbCgocHJvamVjdFBhdGhzKSA9PiB0aGlzLnNldFN0YXRlKHsgYWN0aXZlUHJvamVjdHM6IHByb2plY3RQYXRocyB9KSlcbiAgICApXG4gIH1cblxuICBjb21wb25lbnRXaWxsVW5tb3VudCgpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5fZGlzcG9zYWJsZXMgIT0gbnVsbCkge1xuICAgICAgdGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gICAgfVxuICB9XG5cbiAgX2hhbmRsZUJyZWFrcG9pbnRFbmFibGVkQ2hhbmdlID0gKGJyZWFrcG9pbnQ6IElCcmVha3BvaW50LCBlbmFibGVkOiBib29sZWFuKTogdm9pZCA9PiB7XG4gICAgdGhpcy5wcm9wcy5zZXJ2aWNlLmVuYWJsZU9yRGlzYWJsZUJyZWFrcG9pbnRzKGVuYWJsZWQsIGJyZWFrcG9pbnQpXG4gIH1cblxuICBfaGFuZGxlQnJlYWtwb2ludENsaWNrID0gKGJyZWFrcG9pbnRJbmRleDogbnVtYmVyLCBicmVha3BvaW50OiA/SUJyZWFrcG9pbnQpOiB2b2lkID0+IHtcbiAgICBpbnZhcmlhbnQoYnJlYWtwb2ludCAhPSBudWxsKVxuICAgIGNvbnN0IHsgdXJpLCBsaW5lIH0gPSBicmVha3BvaW50XG4gICAgLy8gRGVidWdnZXIgbW9kZWwgaXMgMS1iYXNlZCB3aGlsZSBBdG9tIFVJIGlzIHplcm8tYmFzZWQuXG4gICAgb3BlblNvdXJjZUxvY2F0aW9uKHVyaSwgbGluZSAtIDEpXG4gIH1cblxuICBfc2V0RXhjZXB0aW9uQ29sbGFwc2VkID0gKGNvbGxhcHNlZDogYm9vbGVhbik6IHZvaWQgPT4ge1xuICAgIGZlYXR1cmVDb25maWcuc2V0KFwiZGVidWdnZXItZXhjZXB0aW9uQnJlYWtwb2ludHNDb2xsYXBzZWRcIiwgY29sbGFwc2VkKVxuICAgIHRoaXMuc2V0U3RhdGUoeyBleGNlcHRpb25CcmVha3BvaW50c0NvbGxhcHNlZDogY29sbGFwc2VkIH0pXG4gIH1cblxuICBfc2V0VW5hdmFpbGFibGVDb2xsYXBzZWQgPSAoY29sbGFwc2VkOiBib29sZWFuKTogdm9pZCA9PiB7XG4gICAgdGhpcy5zZXRTdGF0ZSh7IHVuYXZhaWxhYmxlQnJlYWtwb2ludHNDb2xsYXBzZWQ6IGNvbGxhcHNlZCB9KVxuICB9XG5cbiAgX2dldEhvc3RuYW1lVHJhbnNsYXRlZCh1cmk6IE51Y2xpZGVVcmkpOiBzdHJpbmcge1xuICAgIHRyeSB7XG4gICAgICAvLyAkRmxvd0ZCXG4gICAgICBjb25zdCB7IGdldEJyZWFrcG9pbnRIb3N0bmFtZVRyYW5zbGF0ZWQgfSA9IHJlcXVpcmUoXCIuL2ZiLXV0aWxzXCIpXG4gICAgICByZXR1cm4gZ2V0QnJlYWtwb2ludEhvc3RuYW1lVHJhbnNsYXRlZCh1cmkpXG4gICAgfSBjYXRjaCAoXykge31cblxuICAgIGlmIChudWNsaWRlVXJpLmlzTG9jYWwodXJpKSkge1xuICAgICAgcmV0dXJuIFwibG9jYWxcIlxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gbnVjbGlkZVVyaS5nZXRIb3N0bmFtZSh1cmkpXG4gICAgfVxuICB9XG5cbiAgX3JlbmRlckxvZ01lc3NhZ2UoYnJlYWtwb2ludDogSUJyZWFrcG9pbnQpOiA/UmVhY3QuTm9kZSB7XG4gICAgaWYgKFxuICAgICAgIXRoaXMucHJvcHMuc2VydmljZS52aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3MgfHxcbiAgICAgICF0aGlzLnN0YXRlLnN1cHBvcnRzTG9nTWVzc2FnZSB8fFxuICAgICAgYnJlYWtwb2ludC5sb2dNZXNzYWdlID09IG51bGxcbiAgICApIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuXG4gICAgcmV0dXJuIChcbiAgICAgIDxkaXZcbiAgICAgICAgY2xhc3NOYW1lPVwiZGVidWdnZXItYnJlYWtwb2ludC1jb25kaXRpb25cIlxuICAgICAgICB0aXRsZT17YEJyZWFrcG9pbnQgbG9nIG1lc3NhZ2U6ICR7YnJlYWtwb2ludC5sb2dNZXNzYWdlfWB9XG4gICAgICAgIGRhdGEtcGF0aD17YnJlYWtwb2ludC51cml9XG4gICAgICAgIGRhdGEtbGluZT17YnJlYWtwb2ludC5saW5lfVxuICAgICAgICBkYXRhLWJwaWQ9e2JyZWFrcG9pbnQuZ2V0SWQoKX1cbiAgICAgICAgb25DbGljaz17KGV2ZW50KSA9PiB7XG4gICAgICAgICAgYXRvbS5jb21tYW5kcy5kaXNwYXRjaChldmVudC50YXJnZXQsIFwiZGVidWdnZXI6ZWRpdC1icmVha3BvaW50XCIpXG4gICAgICAgIH19XG4gICAgICA+XG4gICAgICAgIExvZyBNZXNzYWdlOiB7YnJlYWtwb2ludC5sb2dNZXNzYWdlfVxuICAgICAgPC9kaXY+XG4gICAgKVxuICB9XG5cbiAgcmVuZGVyKCk6IFJlYWN0Lk5vZGUge1xuICAgIGNvbnN0IHsgZXhjZXB0aW9uQnJlYWtwb2ludHMsIHN1cHBvcnRzQ29uZGl0aW9uYWxCcmVha3BvaW50cywgYWN0aXZlUHJvamVjdHMsIGJyZWFrcG9pbnRzIH0gPSB0aGlzLnN0YXRlXG4gICAgY29uc3QgeyBzZXJ2aWNlIH0gPSB0aGlzLnByb3BzXG4gICAgY29uc3QgYXZhaWxhYmxlSG9zdHMgPSBhY3RpdmVQcm9qZWN0c1xuICAgICAgLmZpbHRlcigodXJpKSA9PiBudWNsaWRlVXJpLmlzUmVtb3RlKHVyaSkpXG4gICAgICAubWFwKCh1cmkpID0+IHRoaXMuX2dldEhvc3RuYW1lVHJhbnNsYXRlZCh1cmkpKVxuICAgIGNvbnN0IGJyZWFrcG9pbnRHcm91cCA9IChhdmFpbGFibGUpID0+XG4gICAgICBicmVha3BvaW50c1xuICAgICAgICAuZmlsdGVyKChicCkgPT4ge1xuICAgICAgICAgIGNvbnN0IG1hdGNoID1cbiAgICAgICAgICAgIG51Y2xpZGVVcmkuaXNMb2NhbChicC51cmkpIHx8IGF2YWlsYWJsZUhvc3RzLnNvbWUoKGhvc3QpID0+IHRoaXMuX2dldEhvc3RuYW1lVHJhbnNsYXRlZChicC51cmkpID09PSBob3N0KVxuICAgICAgICAgIHJldHVybiBhdmFpbGFibGUgPyBtYXRjaCA6ICFtYXRjaFxuICAgICAgICB9KVxuICAgICAgICAuc29ydCgoYnJlYWtwb2ludEEsIGJyZWFrcG9pbnRCKSA9PiB7XG4gICAgICAgICAgY29uc3QgZmlsZUEgPSBudWNsaWRlVXJpLmJhc2VuYW1lKGJyZWFrcG9pbnRBLnVyaSlcbiAgICAgICAgICBjb25zdCBmaWxlQiA9IG51Y2xpZGVVcmkuYmFzZW5hbWUoYnJlYWtwb2ludEIudXJpKVxuICAgICAgICAgIGlmIChmaWxlQSAhPT0gZmlsZUIpIHtcbiAgICAgICAgICAgIHJldHVybiBmaWxlQS5sb2NhbGVDb21wYXJlKGZpbGVCKVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gYnJlYWtwb2ludEEubGluZSAtIGJyZWFrcG9pbnRCLmxpbmVcbiAgICAgICAgfSlcbiAgICAgICAgLm1hcCgoYnJlYWtwb2ludCwgaSkgPT4ge1xuICAgICAgICAgIGNvbnN0IGhvc3QgPSB0aGlzLl9nZXRIb3N0bmFtZVRyYW5zbGF0ZWQoYnJlYWtwb2ludC51cmkpIHx8IFwibG9jYWxcIlxuICAgICAgICAgIGNvbnN0IGJhc2VuYW1lID0gbnVjbGlkZVVyaS5iYXNlbmFtZShicmVha3BvaW50LnVyaSlcbiAgICAgICAgICBjb25zdCB7IGxpbmUsIHZlcmlmaWVkLCB1cmk6IHBhdGggfSA9IGJyZWFrcG9pbnRcbiAgICAgICAgICBjb25zdCBlbmFibGVkID0gYnJlYWtwb2ludC5lbmFibGVkICYmIGF2YWlsYWJsZVxuICAgICAgICAgIGNvbnN0IGJwSWQgPSBicmVha3BvaW50LmdldElkKClcbiAgICAgICAgICBjb25zdCBsYWJlbCA9IGAke2Jhc2VuYW1lfToke2xpbmV9YFxuICAgICAgICAgIGNvbnN0IHRpdGxlID1cbiAgICAgICAgICAgICghZW5hYmxlZFxuICAgICAgICAgICAgICA/IFwiRGlzYWJsZWQgYnJlYWtwb2ludFwiXG4gICAgICAgICAgICAgIDogIXZlcmlmaWVkXG4gICAgICAgICAgICAgID8gXCJVbnJlc29sdmVkIEJyZWFrcG9pbnRcIlxuICAgICAgICAgICAgICA6IGBCcmVha3BvaW50IGF0ICR7bGFiZWx9IChyZXNvbHZlZClgKSArXG4gICAgICAgICAgICAoYXZhaWxhYmxlID8gXCJcIiA6IGAgLSAke2hvc3R9OiR7bnVjbGlkZVVyaS5nZXRQYXRoKGJyZWFrcG9pbnQudXJpKX1gKVxuXG4gICAgICAgICAgY29uc3QgY29uZGl0aW9uRWxlbWVudCA9XG4gICAgICAgICAgICBzdXBwb3J0c0NvbmRpdGlvbmFsQnJlYWtwb2ludHMgJiYgYnJlYWtwb2ludC5jb25kaXRpb24gIT0gbnVsbCA/IChcbiAgICAgICAgICAgICAgPGRpdlxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZT1cImRlYnVnZ2VyLWJyZWFrcG9pbnQtY29uZGl0aW9uXCJcbiAgICAgICAgICAgICAgICB0aXRsZT17YEJyZWFrcG9pbnQgY29uZGl0aW9uOiAke2JyZWFrcG9pbnQuY29uZGl0aW9ufWB9XG4gICAgICAgICAgICAgICAgZGF0YS1wYXRoPXtwYXRofVxuICAgICAgICAgICAgICAgIGRhdGEtbGluZT17bGluZX1cbiAgICAgICAgICAgICAgICBkYXRhLWJwaWQ9e2JwSWR9XG4gICAgICAgICAgICAgICAgb25DbGljaz17KGV2ZW50KSA9PiB7XG4gICAgICAgICAgICAgICAgICBhdG9tLmNvbW1hbmRzLmRpc3BhdGNoKGV2ZW50LnRhcmdldCwgXCJkZWJ1Z2dlcjplZGl0LWJyZWFrcG9pbnRcIilcbiAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgQ29uZGl0aW9uOiB7YnJlYWtwb2ludC5jb25kaXRpb259XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgKSA6IG51bGxcblxuICAgICAgICAgIGNvbnN0IGhpdGNvdW50RWxlbWVudCA9XG4gICAgICAgICAgICBicmVha3BvaW50LmhpdENvdW50ICE9IG51bGwgJiYgYnJlYWtwb2ludC5oaXRDb3VudCA+IDAgPyAoXG4gICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItYnJlYWtwb2ludC1oaXRjb3VudFwiPkhpdCBjb3VudDoge2JyZWFrcG9pbnQuaGl0Q291bnR9PC9kaXY+XG4gICAgICAgICAgICApIDogbnVsbFxuICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSAoXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImlubGluZS1ibG9ja1wiPlxuICAgICAgICAgICAgICA8ZGl2XG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lPXtjbGFzc25hbWVzKHtcbiAgICAgICAgICAgICAgICAgIFwiZGVidWdnZXItYnJlYWtwb2ludC1kaXNhYmxlZFwiOiAhZW5hYmxlZCxcbiAgICAgICAgICAgICAgICAgIFwiZGVidWdnZXItYnJlYWtwb2ludC13aXRoLWNvbmRpdGlvblwiOiBCb29sZWFuKGJyZWFrcG9pbnQuY29uZGl0aW9uKSxcbiAgICAgICAgICAgICAgICB9KX1cbiAgICAgICAgICAgICAgICBrZXk9e2l9XG4gICAgICAgICAgICAgID5cbiAgICAgICAgICAgICAgICA8Q2hlY2tib3hcbiAgICAgICAgICAgICAgICAgIGNoZWNrZWQ9e2VuYWJsZWR9XG4gICAgICAgICAgICAgICAgICBvbkNoYW5nZT17dGhpcy5faGFuZGxlQnJlYWtwb2ludEVuYWJsZWRDaGFuZ2UuYmluZCh0aGlzLCBicmVha3BvaW50KX1cbiAgICAgICAgICAgICAgICAgIG9uQ2xpY2s9eyhldmVudDogU3ludGhldGljRXZlbnQ8PikgPT4gZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCl9XG4gICAgICAgICAgICAgICAgICB0aXRsZT17dGl0bGV9XG4gICAgICAgICAgICAgICAgICBkaXNhYmxlZD17IWF2YWlsYWJsZX1cbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZT17Y2xhc3NuYW1lcyhcbiAgICAgICAgICAgICAgICAgICAgdmVyaWZpZWQgPyBcIlwiIDogXCJkZWJ1Z2dlci1icmVha3BvaW50LXVucmVzb2x2ZWRcIixcbiAgICAgICAgICAgICAgICAgICAgXCJkZWJ1Z2dlci1icmVha3BvaW50LWNoZWNrYm94XCJcbiAgICAgICAgICAgICAgICAgICl9XG4gICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgICA8c3BhbiB0aXRsZT17dGl0bGV9IGRhdGEtcGF0aD17cGF0aH0gZGF0YS1icGlkPXticElkfSBkYXRhLWxpbmU9e2xpbmV9PlxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1icmVha3BvaW50LWNvbmRpdGlvbi1jb250cm9sc1wiPlxuICAgICAgICAgICAgICAgICAgICA8SWNvblxuICAgICAgICAgICAgICAgICAgICAgIGljb249XCJwZW5jaWxcIlxuICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZT1cImRlYnVnZ2VyLWJyZWFrcG9pbnQtY29uZGl0aW9uLWNvbnRyb2xcIlxuICAgICAgICAgICAgICAgICAgICAgIGRhdGEtcGF0aD17cGF0aH1cbiAgICAgICAgICAgICAgICAgICAgICBkYXRhLWJwaWQ9e2JwSWR9XG4gICAgICAgICAgICAgICAgICAgICAgZGF0YS1saW5lPXtsaW5lfVxuICAgICAgICAgICAgICAgICAgICAgIG9uQ2xpY2s9eyhldmVudCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJhY2soQW5hbHl0aWNzRXZlbnRzLkRFQlVHR0VSX0VESVRfQlJFQUtQT0lOVF9GUk9NX0lDT04pXG4gICAgICAgICAgICAgICAgICAgICAgICBhdG9tLmNvbW1hbmRzLmRpc3BhdGNoKGV2ZW50LnRhcmdldCwgXCJkZWJ1Z2dlcjplZGl0LWJyZWFrcG9pbnRcIilcbiAgICAgICAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgICA8SWNvblxuICAgICAgICAgICAgICAgICAgICAgIGljb249XCJ4XCJcbiAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU9XCJkZWJ1Z2dlci1icmVha3BvaW50LWNvbmRpdGlvbi1jb250cm9sXCJcbiAgICAgICAgICAgICAgICAgICAgICBkYXRhLXBhdGg9e3BhdGh9XG4gICAgICAgICAgICAgICAgICAgICAgZGF0YS1icGlkPXticElkfVxuICAgICAgICAgICAgICAgICAgICAgIGRhdGEtbGluZT17bGluZX1cbiAgICAgICAgICAgICAgICAgICAgICBvbkNsaWNrPXsoZXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyYWNrKEFuYWx5dGljc0V2ZW50cy5ERUJVR0dFUl9ERUxFVEVfQlJFQUtQT0lOVF9GUk9NX0lDT04pXG4gICAgICAgICAgICAgICAgICAgICAgICBhdG9tLmNvbW1hbmRzLmRpc3BhdGNoKGV2ZW50LnRhcmdldCwgXCJkZWJ1Z2dlcjpyZW1vdmUtYnJlYWtwb2ludFwiKVxuICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKClcbiAgICAgICAgICAgICAgICAgICAgICB9fVxuICAgICAgICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgICAgICAgICB7bGFiZWx9XG4gICAgICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgICAgIHtjb25kaXRpb25FbGVtZW50fVxuICAgICAgICAgICAgICAgIHt0aGlzLl9yZW5kZXJMb2dNZXNzYWdlKGJyZWFrcG9pbnQpfVxuICAgICAgICAgICAgICAgIHtoaXRjb3VudEVsZW1lbnR9XG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgKVxuICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICA8TGlzdFZpZXdJdGVtXG4gICAgICAgICAgICAgIGtleT17bGFiZWx9XG4gICAgICAgICAgICAgIGluZGV4PXtpfVxuICAgICAgICAgICAgICB2YWx1ZT17YnJlYWtwb2ludH1cbiAgICAgICAgICAgICAgZGF0YS1wYXRoPXtwYXRofVxuICAgICAgICAgICAgICBkYXRhLWJwaWQ9e2JwSWR9XG4gICAgICAgICAgICAgIGRhdGEtbGluZT17bGluZX1cbiAgICAgICAgICAgICAgdGl0bGU9e3RpdGxlfVxuICAgICAgICAgICAgICBjbGFzc05hbWU9XCJkZWJ1Z2dlci1icmVha3BvaW50XCJcbiAgICAgICAgICAgID5cbiAgICAgICAgICAgICAge2NvbnRlbnR9XG4gICAgICAgICAgICA8L0xpc3RWaWV3SXRlbT5cbiAgICAgICAgICApXG4gICAgICAgIH0pXG4gICAgY29uc3QgYXZhaWxhYmxlQnJlYWtwb2ludHMgPSBicmVha3BvaW50R3JvdXAodHJ1ZSlcbiAgICBjb25zdCB1bmF2YWlsYWJsZUJyZWFrcG9pbnRzID0gYnJlYWtwb2ludEdyb3VwKGZhbHNlKVxuICAgIHJldHVybiAoXG4gICAgICA8ZGl2PlxuICAgICAgICA8TGlzdFZpZXcgYWx0ZXJuYXRlQmFja2dyb3VuZD17dHJ1ZX0gb25TZWxlY3Q9e3RoaXMuX2hhbmRsZUJyZWFrcG9pbnRDbGlja30gc2VsZWN0YWJsZT17dHJ1ZX0+XG4gICAgICAgICAge2F2YWlsYWJsZUJyZWFrcG9pbnRzfVxuICAgICAgICA8L0xpc3RWaWV3PlxuICAgICAgICB7YnJlYWtwb2ludHMubGVuZ3RoID09PSAwID8gKFxuICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT1cImRlYnVnZ2VyLWJyZWFrcG9pbnRcIj5Zb3UgY3VycmVudGx5IGhhdmUgbm8gc291cmNlIGJyZWFrcG9pbnRzIHNldC48L3NwYW4+XG4gICAgICAgICkgOiBudWxsfVxuICAgICAgICB7ZXhjZXB0aW9uQnJlYWtwb2ludHMubGVuZ3RoID4gMCA/IChcbiAgICAgICAgICA8U2VjdGlvblxuICAgICAgICAgICAgY2xhc3NOYW1lPVwiZGVidWdnZXItYnJlYWtwb2ludC1zZWN0aW9uXCJcbiAgICAgICAgICAgIGhlYWRsaW5lPVwiRXhjZXB0aW9uIGJyZWFrcG9pbnRzXCJcbiAgICAgICAgICAgIGNvbGxhcHNhYmxlPXt0cnVlfVxuICAgICAgICAgICAgb25DaGFuZ2U9e3RoaXMuX3NldEV4Y2VwdGlvbkNvbGxhcHNlZH1cbiAgICAgICAgICAgIGNvbGxhcHNlZD17dGhpcy5zdGF0ZS5leGNlcHRpb25CcmVha3BvaW50c0NvbGxhcHNlZH1cbiAgICAgICAgICA+XG4gICAgICAgICAgICB7ZXhjZXB0aW9uQnJlYWtwb2ludHMubWFwKChleGNlcHRpb25CcmVha3BvaW50KSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1icmVha3BvaW50XCIga2V5PXtleGNlcHRpb25CcmVha3BvaW50LmdldElkKCl9PlxuICAgICAgICAgICAgICAgICAgPENoZWNrYm94XG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZT17Y2xhc3NuYW1lcyhcImRlYnVnZ2VyLWJyZWFrcG9pbnQtY2hlY2tib3hcIiwgXCJkZWJ1Z2dlci1leGNlcHRpb24tY2hlY2tib3hcIil9XG4gICAgICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsoZW5hYmxlZCkgPT4gc2VydmljZS5lbmFibGVPckRpc2FibGVCcmVha3BvaW50cyhlbmFibGVkLCBleGNlcHRpb25CcmVha3BvaW50KX1cbiAgICAgICAgICAgICAgICAgICAgY2hlY2tlZD17ZXhjZXB0aW9uQnJlYWtwb2ludC5lbmFibGVkfVxuICAgICAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgICAgICAgIHtleGNlcHRpb25CcmVha3BvaW50LmxhYmVsIHx8IGAke2V4Y2VwdGlvbkJyZWFrcG9pbnQuZmlsdGVyfSBleGNlcHRpb25zYH1cbiAgICAgICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgfSl9XG4gICAgICAgICAgPC9TZWN0aW9uPlxuICAgICAgICApIDogbnVsbH1cbiAgICAgICAge3VuYXZhaWxhYmxlQnJlYWtwb2ludHMubGVuZ3RoID4gMCA/IChcbiAgICAgICAgICA8U2VjdGlvblxuICAgICAgICAgICAgY2xhc3NOYW1lPVwiZGVidWdnZXItYnJlYWtwb2ludC1zZWN0aW9uXCJcbiAgICAgICAgICAgIGhlYWRsaW5lPXtcbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJpbmxpbmUtYmxvY2tcIj5cbiAgICAgICAgICAgICAgICA8SWNvbiBpY29uPVwibnVjbGljb24td2FybmluZ1wiIC8+IFVuYXZhaWxhYmxlIGJyZWFrcG9pbnRzXG4gICAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29sbGFwc2FibGU9e3RydWV9XG4gICAgICAgICAgICBvbkNoYW5nZT17dGhpcy5fc2V0VW5hdmFpbGFibGVDb2xsYXBzZWR9XG4gICAgICAgICAgICBjb2xsYXBzZWQ9e3RoaXMuc3RhdGUudW5hdmFpbGFibGVCcmVha3BvaW50c0NvbGxhcHNlZH1cbiAgICAgICAgICA+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXVuYXZhaWxhYmxlLWJyZWFrcG9pbnQtaGVscFwiPlxuICAgICAgICAgICAgICBUaGVzZSBicmVha3BvaW50cyBhcmUgaW4gZmlsZXMgdGhhdCBhcmUgbm90IGN1cnJlbnRseSBhdmFpbGFibGUgaW4gYW55IHByb2plY3Qgcm9vdC4gQWRkIHRoZSBjb3JyZXNwb25kaW5nXG4gICAgICAgICAgICAgIGxvY2FsIG9yIHJlbW90ZSBwcm9qZWN0IHRvIHlvdXIgZmlsZSB0cmVlIHRvIGVuYWJsZSB0aGVzZSBicmVha3BvaW50cy5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgICAgPExpc3RWaWV3IGFsdGVybmF0ZUJhY2tncm91bmQ9e3RydWV9IHNlbGVjdGFibGU9e2ZhbHNlfT5cbiAgICAgICAgICAgICAge3VuYXZhaWxhYmxlQnJlYWtwb2ludHN9XG4gICAgICAgICAgICA8L0xpc3RWaWV3PlxuICAgICAgICAgIDwvU2VjdGlvbj5cbiAgICAgICAgKSA6IG51bGx9XG4gICAgICA8L2Rpdj5cbiAgICApXG4gIH1cbn1cbiJdfQ==