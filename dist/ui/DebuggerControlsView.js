"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _event = require("@atom-ide-community/nuclide-commons/event");

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var React = _interopRequireWildcard(require("react"));

var _rxjs = require("rxjs");

var _DebuggerSteppingComponent = _interopRequireDefault(require("./DebuggerSteppingComponent"));

var _constants = require("../constants");

var _DebuggerControllerView = _interopRequireDefault(require("./DebuggerControllerView"));

var _DebuggerAddTargetButton = require("./DebuggerAddTargetButton");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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

    this._disposables.add(_rxjs.Observable.merge((0, _event.observableFromSubscribeFunction)(service.onDidChangeProcessMode.bind(service)), (0, _event.observableFromSubscribeFunction)(service.viewModel.onDidChangeDebuggerFocus.bind(service.viewModel))).startWith(null).subscribe(() => {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyQ29udHJvbHNWaWV3LmpzIl0sIm5hbWVzIjpbIkRlYnVnZ2VyQ29udHJvbHNWaWV3IiwiUmVhY3QiLCJQdXJlQ29tcG9uZW50IiwiY29uc3RydWN0b3IiLCJwcm9wcyIsIl9kaXNwb3NhYmxlcyIsIlVuaXZlcnNhbERpc3Bvc2FibGUiLCJzdGF0ZSIsIm1vZGUiLCJEZWJ1Z2dlck1vZGUiLCJTVE9QUEVEIiwiY29tcG9uZW50RGlkTW91bnQiLCJzZXJ2aWNlIiwiYWRkIiwiT2JzZXJ2YWJsZSIsIm1lcmdlIiwib25EaWRDaGFuZ2VQcm9jZXNzTW9kZSIsImJpbmQiLCJ2aWV3TW9kZWwiLCJvbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMiLCJzdGFydFdpdGgiLCJzdWJzY3JpYmUiLCJmb2N1c2VkUHJvY2VzcyIsInNldFN0YXRlIiwiZGVidWdnZXJNb2RlIiwiY29tcG9uZW50V2lsbFVubW91bnQiLCJfZGlzcG9zZSIsImRpc3Bvc2UiLCJyZW5kZXIiLCJkZWJ1Z2dlclN0b3BwZWROb3RpY2UiLCJydW5uaW5nIiwiUlVOTklORyIsInBhdXNlZCIsIlBBVVNFRCIsImRlYnVnZ2VyUnVubmluZ05vdGljZSIsImNvbmZpZ3VyYXRpb24iLCJwcm9jZXNzTmFtZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUVBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQVVlLE1BQU1BLG9CQUFOLFNBQW1DQyxLQUFLLENBQUNDLGFBQXpDLENBQXFFO0FBR2xGQyxFQUFBQSxXQUFXLENBQUNDLEtBQUQsRUFBZTtBQUN4QixVQUFNQSxLQUFOO0FBRHdCLFNBRjFCQyxZQUUwQjtBQUd4QixTQUFLQSxZQUFMLEdBQW9CLElBQUlDLDRCQUFKLEVBQXBCO0FBQ0EsU0FBS0MsS0FBTCxHQUFhO0FBQ1hDLE1BQUFBLElBQUksRUFBRUMsd0JBQWFDO0FBRFIsS0FBYjtBQUdEOztBQUVEQyxFQUFBQSxpQkFBaUIsR0FBUztBQUN4QixVQUFNO0FBQUVDLE1BQUFBO0FBQUYsUUFBYyxLQUFLUixLQUF6Qjs7QUFDQSxTQUFLQyxZQUFMLENBQWtCUSxHQUFsQixDQUNFQyxpQkFBV0MsS0FBWCxDQUNFLDRDQUFnQ0gsT0FBTyxDQUFDSSxzQkFBUixDQUErQkMsSUFBL0IsQ0FBb0NMLE9BQXBDLENBQWhDLENBREYsRUFFRSw0Q0FBZ0NBLE9BQU8sQ0FBQ00sU0FBUixDQUFrQkMsd0JBQWxCLENBQTJDRixJQUEzQyxDQUFnREwsT0FBTyxDQUFDTSxTQUF4RCxDQUFoQyxDQUZGLEVBSUdFLFNBSkgsQ0FJYSxJQUpiLEVBS0dDLFNBTEgsQ0FLYSxNQUFNO0FBQ2YsWUFBTTtBQUFFSCxRQUFBQTtBQUFGLFVBQWdCLEtBQUtkLEtBQUwsQ0FBV1EsT0FBakM7QUFDQSxZQUFNO0FBQUVVLFFBQUFBO0FBQUYsVUFBcUJKLFNBQTNCO0FBQ0EsV0FBS0ssUUFBTCxDQUFjO0FBQ1pmLFFBQUFBLElBQUksRUFBRWMsY0FBYyxJQUFJLElBQWxCLEdBQXlCYix3QkFBYUMsT0FBdEMsR0FBZ0RZLGNBQWMsQ0FBQ0U7QUFEekQsT0FBZDtBQUdELEtBWEgsQ0FERjtBQWNEOztBQUVEQyxFQUFBQSxvQkFBb0IsR0FBUztBQUMzQixTQUFLQyxRQUFMO0FBQ0Q7O0FBRURBLEVBQUFBLFFBQVEsR0FBUztBQUNmLFNBQUtyQixZQUFMLENBQWtCc0IsT0FBbEI7QUFDRDs7QUFFREMsRUFBQUEsTUFBTSxHQUFlO0FBQ25CLFVBQU07QUFBRWhCLE1BQUFBO0FBQUYsUUFBYyxLQUFLUixLQUF6QjtBQUNBLFVBQU07QUFBRUksTUFBQUE7QUFBRixRQUFXLEtBQUtELEtBQXRCO0FBQ0EsVUFBTXNCLHFCQUFxQixHQUN6QnJCLElBQUksS0FBS0Msd0JBQWFDLE9BQXRCLEdBQWdDLElBQWhDLGdCQUNFO0FBQUssTUFBQSxTQUFTLEVBQUM7QUFBZixvQkFDRTtBQUFLLE1BQUEsU0FBUyxFQUFDO0FBQWYsdUNBREYsZUFFRTtBQUFLLE1BQUEsU0FBUyxFQUFDO0FBQWYsT0FBd0MsOENBQWdCLDZCQUFoQixDQUF4QyxDQUZGLENBRko7QUFRQSxVQUFNb0IsT0FBTyxHQUFHdEIsSUFBSSxLQUFLQyx3QkFBYXNCLE9BQXRDO0FBQ0EsVUFBTUMsTUFBTSxHQUFHeEIsSUFBSSxLQUFLQyx3QkFBYXdCLE1BQXJDO0FBQ0EsVUFBTUMscUJBQXFCLEdBQ3pCLENBQUNKLE9BQUQsSUFBWSxDQUFDRSxNQUFiLEdBQXNCLElBQXRCLGdCQUNFO0FBQUssTUFBQSxTQUFTLEVBQUM7QUFBZixvQkFDRTtBQUFLLE1BQUEsU0FBUyxFQUFDO0FBQWYsT0FDRyxDQUFDcEIsT0FBTyxDQUFDTSxTQUFSLENBQWtCSSxjQUFsQixJQUFvQyxJQUFwQyxJQUNGVixPQUFPLENBQUNNLFNBQVIsQ0FBa0JJLGNBQWxCLENBQWlDYSxhQUFqQyxDQUErQ0MsV0FBL0MsSUFBOEQsSUFENUQsR0FFRSxrQkFGRixHQUdFeEIsT0FBTyxDQUFDTSxTQUFSLENBQWtCSSxjQUFsQixDQUFpQ2EsYUFBakMsQ0FBK0NDLFdBSGxELElBR2tFLE9BQU1OLE9BQU8sR0FBRyxTQUFILEdBQWUsUUFBUyxHQUoxRyxDQURGLENBRko7QUFZQSx3QkFDRTtBQUFLLE1BQUEsU0FBUyxFQUFDO0FBQWYsb0JBQ0U7QUFBSyxNQUFBLFNBQVMsRUFBQztBQUFmLG9CQUNFLG9CQUFDLCtCQUFEO0FBQXdCLE1BQUEsT0FBTyxFQUFFbEI7QUFBakMsTUFERixDQURGLGVBSUU7QUFBSyxNQUFBLFNBQVMsRUFBQztBQUFmLG9CQUNFLG9CQUFDLGtDQUFEO0FBQTJCLE1BQUEsT0FBTyxFQUFFQTtBQUFwQyxNQURGLENBSkYsRUFPR3NCLHFCQVBILEVBUUdMLHFCQVJILENBREY7QUFZRDs7QUEzRWlGIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBEZWJ1Z2dlck1vZGVUeXBlLCBJRGVidWdTZXJ2aWNlIH0gZnJvbSBcIi4uL3R5cGVzXCJcblxuaW1wb3J0IHsgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbiB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9ldmVudFwiXG5pbXBvcnQgVW5pdmVyc2FsRGlzcG9zYWJsZSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvVW5pdmVyc2FsRGlzcG9zYWJsZVwiXG5pbXBvcnQgKiBhcyBSZWFjdCBmcm9tIFwicmVhY3RcIlxuaW1wb3J0IHsgT2JzZXJ2YWJsZSB9IGZyb20gXCJyeGpzXCJcbmltcG9ydCBEZWJ1Z2dlclN0ZXBwaW5nQ29tcG9uZW50IGZyb20gXCIuL0RlYnVnZ2VyU3RlcHBpbmdDb21wb25lbnRcIlxuaW1wb3J0IHsgRGVidWdnZXJNb2RlIH0gZnJvbSBcIi4uL2NvbnN0YW50c1wiXG5pbXBvcnQgRGVidWdnZXJDb250cm9sbGVyVmlldyBmcm9tIFwiLi9EZWJ1Z2dlckNvbnRyb2xsZXJWaWV3XCJcbmltcG9ydCB7IEFkZFRhcmdldEJ1dHRvbiB9IGZyb20gXCIuL0RlYnVnZ2VyQWRkVGFyZ2V0QnV0dG9uXCJcblxudHlwZSBQcm9wcyA9IHtcbiAgc2VydmljZTogSURlYnVnU2VydmljZSxcbn1cblxudHlwZSBTdGF0ZSA9IHtcbiAgbW9kZTogRGVidWdnZXJNb2RlVHlwZSxcbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRGVidWdnZXJDb250cm9sc1ZpZXcgZXh0ZW5kcyBSZWFjdC5QdXJlQ29tcG9uZW50PFByb3BzLCBTdGF0ZT4ge1xuICBfZGlzcG9zYWJsZXM6IFVuaXZlcnNhbERpc3Bvc2FibGVcblxuICBjb25zdHJ1Y3Rvcihwcm9wczogUHJvcHMpIHtcbiAgICBzdXBlcihwcm9wcylcblxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoKVxuICAgIHRoaXMuc3RhdGUgPSB7XG4gICAgICBtb2RlOiBEZWJ1Z2dlck1vZGUuU1RPUFBFRCxcbiAgICB9XG4gIH1cblxuICBjb21wb25lbnREaWRNb3VudCgpOiB2b2lkIHtcbiAgICBjb25zdCB7IHNlcnZpY2UgfSA9IHRoaXMucHJvcHNcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5hZGQoXG4gICAgICBPYnNlcnZhYmxlLm1lcmdlKFxuICAgICAgICBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKHNlcnZpY2Uub25EaWRDaGFuZ2VQcm9jZXNzTW9kZS5iaW5kKHNlcnZpY2UpKSxcbiAgICAgICAgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbihzZXJ2aWNlLnZpZXdNb2RlbC5vbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMuYmluZChzZXJ2aWNlLnZpZXdNb2RlbCkpXG4gICAgICApXG4gICAgICAgIC5zdGFydFdpdGgobnVsbClcbiAgICAgICAgLnN1YnNjcmliZSgoKSA9PiB7XG4gICAgICAgICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IHRoaXMucHJvcHMuc2VydmljZVxuICAgICAgICAgIGNvbnN0IHsgZm9jdXNlZFByb2Nlc3MgfSA9IHZpZXdNb2RlbFxuICAgICAgICAgIHRoaXMuc2V0U3RhdGUoe1xuICAgICAgICAgICAgbW9kZTogZm9jdXNlZFByb2Nlc3MgPT0gbnVsbCA/IERlYnVnZ2VyTW9kZS5TVE9QUEVEIDogZm9jdXNlZFByb2Nlc3MuZGVidWdnZXJNb2RlLFxuICAgICAgICAgIH0pXG4gICAgICAgIH0pXG4gICAgKVxuICB9XG5cbiAgY29tcG9uZW50V2lsbFVubW91bnQoKTogdm9pZCB7XG4gICAgdGhpcy5fZGlzcG9zZSgpXG4gIH1cblxuICBfZGlzcG9zZSgpOiB2b2lkIHtcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKClcbiAgfVxuXG4gIHJlbmRlcigpOiBSZWFjdC5Ob2RlIHtcbiAgICBjb25zdCB7IHNlcnZpY2UgfSA9IHRoaXMucHJvcHNcbiAgICBjb25zdCB7IG1vZGUgfSA9IHRoaXMuc3RhdGVcbiAgICBjb25zdCBkZWJ1Z2dlclN0b3BwZWROb3RpY2UgPVxuICAgICAgbW9kZSAhPT0gRGVidWdnZXJNb2RlLlNUT1BQRUQgPyBudWxsIDogKFxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXBhbmUtY29udGVudFwiPlxuICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItc3RhdGUtbm90aWNlXCI+VGhlIGRlYnVnZ2VyIGlzIG5vdCBhdHRhY2hlZC48L2Rpdj5cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXN0YXRlLW5vdGljZVwiPntBZGRUYXJnZXRCdXR0b24oXCJkZWJ1Z2dlci1idXR0b25ncm91cC1jZW50ZXJcIil9PC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgICAgKVxuXG4gICAgY29uc3QgcnVubmluZyA9IG1vZGUgPT09IERlYnVnZ2VyTW9kZS5SVU5OSU5HXG4gICAgY29uc3QgcGF1c2VkID0gbW9kZSA9PT0gRGVidWdnZXJNb2RlLlBBVVNFRFxuICAgIGNvbnN0IGRlYnVnZ2VyUnVubmluZ05vdGljZSA9XG4gICAgICAhcnVubmluZyAmJiAhcGF1c2VkID8gbnVsbCA6IChcbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1wYW5lLWNvbnRlbnRcIj5cbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXN0YXRlLW5vdGljZVwiPlxuICAgICAgICAgICAgeyhzZXJ2aWNlLnZpZXdNb2RlbC5mb2N1c2VkUHJvY2VzcyA9PSBudWxsIHx8XG4gICAgICAgICAgICBzZXJ2aWNlLnZpZXdNb2RlbC5mb2N1c2VkUHJvY2Vzcy5jb25maWd1cmF0aW9uLnByb2Nlc3NOYW1lID09IG51bGxcbiAgICAgICAgICAgICAgPyBcIlRoZSBkZWJ1ZyB0YXJnZXRcIlxuICAgICAgICAgICAgICA6IHNlcnZpY2Uudmlld01vZGVsLmZvY3VzZWRQcm9jZXNzLmNvbmZpZ3VyYXRpb24ucHJvY2Vzc05hbWUpICsgYCBpcyAke3J1bm5pbmcgPyBcInJ1bm5pbmdcIiA6IFwicGF1c2VkXCJ9LmB9XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgICAgKVxuXG4gICAgcmV0dXJuIChcbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItY29udGFpbmVyLW5ld1wiPlxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXNlY3Rpb24taGVhZGVyXCI+XG4gICAgICAgICAgPERlYnVnZ2VyQ29udHJvbGxlclZpZXcgc2VydmljZT17c2VydmljZX0gLz5cbiAgICAgICAgPC9kaXY+XG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItc2VjdGlvbi1oZWFkZXIgZGVidWdnZXItY29udHJvbHMtc2VjdGlvblwiPlxuICAgICAgICAgIDxEZWJ1Z2dlclN0ZXBwaW5nQ29tcG9uZW50IHNlcnZpY2U9e3NlcnZpY2V9IC8+XG4gICAgICAgIDwvZGl2PlxuICAgICAgICB7ZGVidWdnZXJSdW5uaW5nTm90aWNlfVxuICAgICAgICB7ZGVidWdnZXJTdG9wcGVkTm90aWNlfVxuICAgICAgPC9kaXY+XG4gICAgKVxuICB9XG59XG4iXX0=