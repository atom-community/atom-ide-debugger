"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _event = require("@atom-ide-community/nuclide-commons/event");

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var React = _interopRequireWildcard(require("react"));

var _rxjsCompatUmdMin = require("rxjs-compat/bundles/rxjs-compat.umd.min.js");

var _DebuggerSteppingComponent = _interopRequireDefault(require("./DebuggerSteppingComponent"));

var _constants = require("../constants");

var _DebuggerControllerView = _interopRequireDefault(require("./DebuggerControllerView"));

var _DebuggerAddTargetButton = require("./DebuggerAddTargetButton");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class DebuggerControlsView extends React.PureComponent {
  constructor(props) {
    super(props);
    this._disposables = void 0;
    this._disposables = new _UniversalDisposable.default();
    this.state = {
      mode: _constants.DebuggerMode.STOPPED
    };
  }

  componentDidMount() {
    const {
      service
    } = this.props;

    this._disposables.add(_rxjsCompatUmdMin.Observable.merge((0, _event.observableFromSubscribeFunction)(service.onDidChangeProcessMode.bind(service)), (0, _event.observableFromSubscribeFunction)(service.viewModel.onDidChangeDebuggerFocus.bind(service.viewModel))).startWith(null).subscribe(() => {
      const {
        viewModel
      } = this.props.service;
      const {
        focusedProcess
      } = viewModel;
      this.setState({
        mode: focusedProcess == null ? _constants.DebuggerMode.STOPPED : focusedProcess.debuggerMode
      });
    }));
  }

  componentWillUnmount() {
    this._dispose();
  }

  _dispose() {
    this._disposables.dispose();
  }

  render() {
    const {
      service
    } = this.props;
    const {
      mode
    } = this.state;
    const debuggerStoppedNotice = mode !== _constants.DebuggerMode.STOPPED ? null : /*#__PURE__*/React.createElement("div", {
      className: "debugger-pane-content"
    }, /*#__PURE__*/React.createElement("div", {
      className: "debugger-state-notice"
    }, "The debugger is not attached."), /*#__PURE__*/React.createElement("div", {
      className: "debugger-state-notice"
    }, (0, _DebuggerAddTargetButton.AddTargetButton)("debugger-buttongroup-center")));
    const running = mode === _constants.DebuggerMode.RUNNING;
    const paused = mode === _constants.DebuggerMode.PAUSED;
    const debuggerRunningNotice = !running && !paused ? null : /*#__PURE__*/React.createElement("div", {
      className: "debugger-pane-content"
    }, /*#__PURE__*/React.createElement("div", {
      className: "debugger-state-notice"
    }, (service.viewModel.focusedProcess == null || service.viewModel.focusedProcess.configuration.processName == null ? "The debug target" : service.viewModel.focusedProcess.configuration.processName) + ` is ${running ? "running" : "paused"}.`));
    return /*#__PURE__*/React.createElement("div", {
      className: "debugger-container-new"
    }, /*#__PURE__*/React.createElement("div", {
      className: "debugger-section-header"
    }, /*#__PURE__*/React.createElement(_DebuggerControllerView.default, {
      service: service
    })), /*#__PURE__*/React.createElement("div", {
      className: "debugger-section-header debugger-controls-section"
    }, /*#__PURE__*/React.createElement(_DebuggerSteppingComponent.default, {
      service: service
    })), debuggerRunningNotice, debuggerStoppedNotice);
  }

}

exports.default = DebuggerControlsView;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyQ29udHJvbHNWaWV3LmpzIl0sIm5hbWVzIjpbIkRlYnVnZ2VyQ29udHJvbHNWaWV3IiwiUmVhY3QiLCJQdXJlQ29tcG9uZW50IiwiY29uc3RydWN0b3IiLCJwcm9wcyIsIl9kaXNwb3NhYmxlcyIsIlVuaXZlcnNhbERpc3Bvc2FibGUiLCJzdGF0ZSIsIm1vZGUiLCJEZWJ1Z2dlck1vZGUiLCJTVE9QUEVEIiwiY29tcG9uZW50RGlkTW91bnQiLCJzZXJ2aWNlIiwiYWRkIiwiT2JzZXJ2YWJsZSIsIm1lcmdlIiwib25EaWRDaGFuZ2VQcm9jZXNzTW9kZSIsImJpbmQiLCJ2aWV3TW9kZWwiLCJvbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMiLCJzdGFydFdpdGgiLCJzdWJzY3JpYmUiLCJmb2N1c2VkUHJvY2VzcyIsInNldFN0YXRlIiwiZGVidWdnZXJNb2RlIiwiY29tcG9uZW50V2lsbFVubW91bnQiLCJfZGlzcG9zZSIsImRpc3Bvc2UiLCJyZW5kZXIiLCJkZWJ1Z2dlclN0b3BwZWROb3RpY2UiLCJydW5uaW5nIiwiUlVOTklORyIsInBhdXNlZCIsIlBBVVNFRCIsImRlYnVnZ2VyUnVubmluZ05vdGljZSIsImNvbmZpZ3VyYXRpb24iLCJwcm9jZXNzTmFtZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUVBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQVVlLE1BQU1BLG9CQUFOLFNBQW1DQyxLQUFLLENBQUNDLGFBQXpDLENBQXFFO0FBR2xGQyxFQUFBQSxXQUFXLENBQUNDLEtBQUQsRUFBZTtBQUN4QixVQUFNQSxLQUFOO0FBRHdCLFNBRjFCQyxZQUUwQjtBQUd4QixTQUFLQSxZQUFMLEdBQW9CLElBQUlDLDRCQUFKLEVBQXBCO0FBQ0EsU0FBS0MsS0FBTCxHQUFhO0FBQ1hDLE1BQUFBLElBQUksRUFBRUMsd0JBQWFDO0FBRFIsS0FBYjtBQUdEOztBQUVEQyxFQUFBQSxpQkFBaUIsR0FBUztBQUN4QixVQUFNO0FBQUVDLE1BQUFBO0FBQUYsUUFBYyxLQUFLUixLQUF6Qjs7QUFDQSxTQUFLQyxZQUFMLENBQWtCUSxHQUFsQixDQUNFQyw2QkFBV0MsS0FBWCxDQUNFLDRDQUFnQ0gsT0FBTyxDQUFDSSxzQkFBUixDQUErQkMsSUFBL0IsQ0FBb0NMLE9BQXBDLENBQWhDLENBREYsRUFFRSw0Q0FBZ0NBLE9BQU8sQ0FBQ00sU0FBUixDQUFrQkMsd0JBQWxCLENBQTJDRixJQUEzQyxDQUFnREwsT0FBTyxDQUFDTSxTQUF4RCxDQUFoQyxDQUZGLEVBSUdFLFNBSkgsQ0FJYSxJQUpiLEVBS0dDLFNBTEgsQ0FLYSxNQUFNO0FBQ2YsWUFBTTtBQUFFSCxRQUFBQTtBQUFGLFVBQWdCLEtBQUtkLEtBQUwsQ0FBV1EsT0FBakM7QUFDQSxZQUFNO0FBQUVVLFFBQUFBO0FBQUYsVUFBcUJKLFNBQTNCO0FBQ0EsV0FBS0ssUUFBTCxDQUFjO0FBQ1pmLFFBQUFBLElBQUksRUFBRWMsY0FBYyxJQUFJLElBQWxCLEdBQXlCYix3QkFBYUMsT0FBdEMsR0FBZ0RZLGNBQWMsQ0FBQ0U7QUFEekQsT0FBZDtBQUdELEtBWEgsQ0FERjtBQWNEOztBQUVEQyxFQUFBQSxvQkFBb0IsR0FBUztBQUMzQixTQUFLQyxRQUFMO0FBQ0Q7O0FBRURBLEVBQUFBLFFBQVEsR0FBUztBQUNmLFNBQUtyQixZQUFMLENBQWtCc0IsT0FBbEI7QUFDRDs7QUFFREMsRUFBQUEsTUFBTSxHQUFlO0FBQ25CLFVBQU07QUFBRWhCLE1BQUFBO0FBQUYsUUFBYyxLQUFLUixLQUF6QjtBQUNBLFVBQU07QUFBRUksTUFBQUE7QUFBRixRQUFXLEtBQUtELEtBQXRCO0FBQ0EsVUFBTXNCLHFCQUFxQixHQUN6QnJCLElBQUksS0FBS0Msd0JBQWFDLE9BQXRCLEdBQWdDLElBQWhDLGdCQUNFO0FBQUssTUFBQSxTQUFTLEVBQUM7QUFBZixvQkFDRTtBQUFLLE1BQUEsU0FBUyxFQUFDO0FBQWYsdUNBREYsZUFFRTtBQUFLLE1BQUEsU0FBUyxFQUFDO0FBQWYsT0FBd0MsOENBQWdCLDZCQUFoQixDQUF4QyxDQUZGLENBRko7QUFRQSxVQUFNb0IsT0FBTyxHQUFHdEIsSUFBSSxLQUFLQyx3QkFBYXNCLE9BQXRDO0FBQ0EsVUFBTUMsTUFBTSxHQUFHeEIsSUFBSSxLQUFLQyx3QkFBYXdCLE1BQXJDO0FBQ0EsVUFBTUMscUJBQXFCLEdBQ3pCLENBQUNKLE9BQUQsSUFBWSxDQUFDRSxNQUFiLEdBQXNCLElBQXRCLGdCQUNFO0FBQUssTUFBQSxTQUFTLEVBQUM7QUFBZixvQkFDRTtBQUFLLE1BQUEsU0FBUyxFQUFDO0FBQWYsT0FDRyxDQUFDcEIsT0FBTyxDQUFDTSxTQUFSLENBQWtCSSxjQUFsQixJQUFvQyxJQUFwQyxJQUNGVixPQUFPLENBQUNNLFNBQVIsQ0FBa0JJLGNBQWxCLENBQWlDYSxhQUFqQyxDQUErQ0MsV0FBL0MsSUFBOEQsSUFENUQsR0FFRSxrQkFGRixHQUdFeEIsT0FBTyxDQUFDTSxTQUFSLENBQWtCSSxjQUFsQixDQUFpQ2EsYUFBakMsQ0FBK0NDLFdBSGxELElBR2tFLE9BQU1OLE9BQU8sR0FBRyxTQUFILEdBQWUsUUFBUyxHQUoxRyxDQURGLENBRko7QUFZQSx3QkFDRTtBQUFLLE1BQUEsU0FBUyxFQUFDO0FBQWYsb0JBQ0U7QUFBSyxNQUFBLFNBQVMsRUFBQztBQUFmLG9CQUNFLG9CQUFDLCtCQUFEO0FBQXdCLE1BQUEsT0FBTyxFQUFFbEI7QUFBakMsTUFERixDQURGLGVBSUU7QUFBSyxNQUFBLFNBQVMsRUFBQztBQUFmLG9CQUNFLG9CQUFDLGtDQUFEO0FBQTJCLE1BQUEsT0FBTyxFQUFFQTtBQUFwQyxNQURGLENBSkYsRUFPR3NCLHFCQVBILEVBUUdMLHFCQVJILENBREY7QUFZRDs7QUEzRWlGIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBEZWJ1Z2dlck1vZGVUeXBlLCBJRGVidWdTZXJ2aWNlIH0gZnJvbSBcIi4uL3R5cGVzXCJcblxuaW1wb3J0IHsgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbiB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9ldmVudFwiXG5pbXBvcnQgVW5pdmVyc2FsRGlzcG9zYWJsZSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvVW5pdmVyc2FsRGlzcG9zYWJsZVwiXG5pbXBvcnQgKiBhcyBSZWFjdCBmcm9tIFwicmVhY3RcIlxuaW1wb3J0IHsgT2JzZXJ2YWJsZSB9IGZyb20gXCJyeGpzLWNvbXBhdC9idW5kbGVzL3J4anMtY29tcGF0LnVtZC5taW4uanNcIlxuaW1wb3J0IERlYnVnZ2VyU3RlcHBpbmdDb21wb25lbnQgZnJvbSBcIi4vRGVidWdnZXJTdGVwcGluZ0NvbXBvbmVudFwiXG5pbXBvcnQgeyBEZWJ1Z2dlck1vZGUgfSBmcm9tIFwiLi4vY29uc3RhbnRzXCJcbmltcG9ydCBEZWJ1Z2dlckNvbnRyb2xsZXJWaWV3IGZyb20gXCIuL0RlYnVnZ2VyQ29udHJvbGxlclZpZXdcIlxuaW1wb3J0IHsgQWRkVGFyZ2V0QnV0dG9uIH0gZnJvbSBcIi4vRGVidWdnZXJBZGRUYXJnZXRCdXR0b25cIlxuXG50eXBlIFByb3BzID0ge1xuICBzZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxufVxuXG50eXBlIFN0YXRlID0ge1xuICBtb2RlOiBEZWJ1Z2dlck1vZGVUeXBlLFxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBEZWJ1Z2dlckNvbnRyb2xzVmlldyBleHRlbmRzIFJlYWN0LlB1cmVDb21wb25lbnQ8UHJvcHMsIFN0YXRlPiB7XG4gIF9kaXNwb3NhYmxlczogVW5pdmVyc2FsRGlzcG9zYWJsZVxuXG4gIGNvbnN0cnVjdG9yKHByb3BzOiBQcm9wcykge1xuICAgIHN1cGVyKHByb3BzKVxuXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5zdGF0ZSA9IHtcbiAgICAgIG1vZGU6IERlYnVnZ2VyTW9kZS5TVE9QUEVELFxuICAgIH1cbiAgfVxuXG4gIGNvbXBvbmVudERpZE1vdW50KCk6IHZvaWQge1xuICAgIGNvbnN0IHsgc2VydmljZSB9ID0gdGhpcy5wcm9wc1xuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChcbiAgICAgIE9ic2VydmFibGUubWVyZ2UoXG4gICAgICAgIG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24oc2VydmljZS5vbkRpZENoYW5nZVByb2Nlc3NNb2RlLmJpbmQoc2VydmljZSkpLFxuICAgICAgICBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKHNlcnZpY2Uudmlld01vZGVsLm9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cy5iaW5kKHNlcnZpY2Uudmlld01vZGVsKSlcbiAgICAgIClcbiAgICAgICAgLnN0YXJ0V2l0aChudWxsKVxuICAgICAgICAuc3Vic2NyaWJlKCgpID0+IHtcbiAgICAgICAgICBjb25zdCB7IHZpZXdNb2RlbCB9ID0gdGhpcy5wcm9wcy5zZXJ2aWNlXG4gICAgICAgICAgY29uc3QgeyBmb2N1c2VkUHJvY2VzcyB9ID0gdmlld01vZGVsXG4gICAgICAgICAgdGhpcy5zZXRTdGF0ZSh7XG4gICAgICAgICAgICBtb2RlOiBmb2N1c2VkUHJvY2VzcyA9PSBudWxsID8gRGVidWdnZXJNb2RlLlNUT1BQRUQgOiBmb2N1c2VkUHJvY2Vzcy5kZWJ1Z2dlck1vZGUsXG4gICAgICAgICAgfSlcbiAgICAgICAgfSlcbiAgICApXG4gIH1cblxuICBjb21wb25lbnRXaWxsVW5tb3VudCgpOiB2b2lkIHtcbiAgICB0aGlzLl9kaXNwb3NlKClcbiAgfVxuXG4gIF9kaXNwb3NlKCk6IHZvaWQge1xuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgcmVuZGVyKCk6IFJlYWN0Lk5vZGUge1xuICAgIGNvbnN0IHsgc2VydmljZSB9ID0gdGhpcy5wcm9wc1xuICAgIGNvbnN0IHsgbW9kZSB9ID0gdGhpcy5zdGF0ZVxuICAgIGNvbnN0IGRlYnVnZ2VyU3RvcHBlZE5vdGljZSA9XG4gICAgICBtb2RlICE9PSBEZWJ1Z2dlck1vZGUuU1RPUFBFRCA/IG51bGwgOiAoXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItcGFuZS1jb250ZW50XCI+XG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1zdGF0ZS1ub3RpY2VcIj5UaGUgZGVidWdnZXIgaXMgbm90IGF0dGFjaGVkLjwvZGl2PlxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItc3RhdGUtbm90aWNlXCI+e0FkZFRhcmdldEJ1dHRvbihcImRlYnVnZ2VyLWJ1dHRvbmdyb3VwLWNlbnRlclwiKX08L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICApXG5cbiAgICBjb25zdCBydW5uaW5nID0gbW9kZSA9PT0gRGVidWdnZXJNb2RlLlJVTk5JTkdcbiAgICBjb25zdCBwYXVzZWQgPSBtb2RlID09PSBEZWJ1Z2dlck1vZGUuUEFVU0VEXG4gICAgY29uc3QgZGVidWdnZXJSdW5uaW5nTm90aWNlID1cbiAgICAgICFydW5uaW5nICYmICFwYXVzZWQgPyBudWxsIDogKFxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXBhbmUtY29udGVudFwiPlxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItc3RhdGUtbm90aWNlXCI+XG4gICAgICAgICAgICB7KHNlcnZpY2Uudmlld01vZGVsLmZvY3VzZWRQcm9jZXNzID09IG51bGwgfHxcbiAgICAgICAgICAgIHNlcnZpY2Uudmlld01vZGVsLmZvY3VzZWRQcm9jZXNzLmNvbmZpZ3VyYXRpb24ucHJvY2Vzc05hbWUgPT0gbnVsbFxuICAgICAgICAgICAgICA/IFwiVGhlIGRlYnVnIHRhcmdldFwiXG4gICAgICAgICAgICAgIDogc2VydmljZS52aWV3TW9kZWwuZm9jdXNlZFByb2Nlc3MuY29uZmlndXJhdGlvbi5wcm9jZXNzTmFtZSkgKyBgIGlzICR7cnVubmluZyA/IFwicnVubmluZ1wiIDogXCJwYXVzZWRcIn0uYH1cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICApXG5cbiAgICByZXR1cm4gKFxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1jb250YWluZXItbmV3XCI+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItc2VjdGlvbi1oZWFkZXJcIj5cbiAgICAgICAgICA8RGVidWdnZXJDb250cm9sbGVyVmlldyBzZXJ2aWNlPXtzZXJ2aWNlfSAvPlxuICAgICAgICA8L2Rpdj5cbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1zZWN0aW9uLWhlYWRlciBkZWJ1Z2dlci1jb250cm9scy1zZWN0aW9uXCI+XG4gICAgICAgICAgPERlYnVnZ2VyU3RlcHBpbmdDb21wb25lbnQgc2VydmljZT17c2VydmljZX0gLz5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIHtkZWJ1Z2dlclJ1bm5pbmdOb3RpY2V9XG4gICAgICAgIHtkZWJ1Z2dlclN0b3BwZWROb3RpY2V9XG4gICAgICA8L2Rpdj5cbiAgICApXG4gIH1cbn1cbiJdfQ==