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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyQ29udHJvbHNWaWV3LmpzIl0sIm5hbWVzIjpbIkRlYnVnZ2VyQ29udHJvbHNWaWV3IiwiUmVhY3QiLCJQdXJlQ29tcG9uZW50IiwiY29uc3RydWN0b3IiLCJwcm9wcyIsIl9kaXNwb3NhYmxlcyIsIlVuaXZlcnNhbERpc3Bvc2FibGUiLCJzdGF0ZSIsIm1vZGUiLCJEZWJ1Z2dlck1vZGUiLCJTVE9QUEVEIiwiY29tcG9uZW50RGlkTW91bnQiLCJzZXJ2aWNlIiwiYWRkIiwiT2JzZXJ2YWJsZSIsIm1lcmdlIiwib25EaWRDaGFuZ2VQcm9jZXNzTW9kZSIsImJpbmQiLCJ2aWV3TW9kZWwiLCJvbkRpZENoYW5nZURlYnVnZ2VyRm9jdXMiLCJzdGFydFdpdGgiLCJzdWJzY3JpYmUiLCJmb2N1c2VkUHJvY2VzcyIsInNldFN0YXRlIiwiZGVidWdnZXJNb2RlIiwiY29tcG9uZW50V2lsbFVubW91bnQiLCJfZGlzcG9zZSIsImRpc3Bvc2UiLCJyZW5kZXIiLCJkZWJ1Z2dlclN0b3BwZWROb3RpY2UiLCJydW5uaW5nIiwiUlVOTklORyIsInBhdXNlZCIsIlBBVVNFRCIsImRlYnVnZ2VyUnVubmluZ05vdGljZSIsImNvbmZpZ3VyYXRpb24iLCJwcm9jZXNzTmFtZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUVBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQVVlLE1BQU1BLG9CQUFOLFNBQW1DQyxLQUFLLENBQUNDLGFBQXpDLENBQXFFO0FBR2xGQyxFQUFBQSxXQUFXLENBQUNDLEtBQUQsRUFBZTtBQUN4QixVQUFNQSxLQUFOO0FBRHdCLFNBRjFCQyxZQUUwQjtBQUd4QixTQUFLQSxZQUFMLEdBQW9CLElBQUlDLDRCQUFKLEVBQXBCO0FBQ0EsU0FBS0MsS0FBTCxHQUFhO0FBQ1hDLE1BQUFBLElBQUksRUFBRUMsd0JBQWFDO0FBRFIsS0FBYjtBQUdEOztBQUVEQyxFQUFBQSxpQkFBaUIsR0FBUztBQUN4QixVQUFNO0FBQUVDLE1BQUFBO0FBQUYsUUFBYyxLQUFLUixLQUF6Qjs7QUFDQSxTQUFLQyxZQUFMLENBQWtCUSxHQUFsQixDQUNFQyw2QkFBV0MsS0FBWCxDQUNFLDRDQUFnQ0gsT0FBTyxDQUFDSSxzQkFBUixDQUErQkMsSUFBL0IsQ0FBb0NMLE9BQXBDLENBQWhDLENBREYsRUFFRSw0Q0FBZ0NBLE9BQU8sQ0FBQ00sU0FBUixDQUFrQkMsd0JBQWxCLENBQTJDRixJQUEzQyxDQUFnREwsT0FBTyxDQUFDTSxTQUF4RCxDQUFoQyxDQUZGLEVBSUdFLFNBSkgsQ0FJYSxJQUpiLEVBS0dDLFNBTEgsQ0FLYSxNQUFNO0FBQ2YsWUFBTTtBQUFFSCxRQUFBQTtBQUFGLFVBQWdCLEtBQUtkLEtBQUwsQ0FBV1EsT0FBakM7QUFDQSxZQUFNO0FBQUVVLFFBQUFBO0FBQUYsVUFBcUJKLFNBQTNCO0FBQ0EsV0FBS0ssUUFBTCxDQUFjO0FBQ1pmLFFBQUFBLElBQUksRUFBRWMsY0FBYyxJQUFJLElBQWxCLEdBQXlCYix3QkFBYUMsT0FBdEMsR0FBZ0RZLGNBQWMsQ0FBQ0U7QUFEekQsT0FBZDtBQUdELEtBWEgsQ0FERjtBQWNEOztBQUVEQyxFQUFBQSxvQkFBb0IsR0FBUztBQUMzQixTQUFLQyxRQUFMO0FBQ0Q7O0FBRURBLEVBQUFBLFFBQVEsR0FBUztBQUNmLFNBQUtyQixZQUFMLENBQWtCc0IsT0FBbEI7QUFDRDs7QUFFREMsRUFBQUEsTUFBTSxHQUFlO0FBQ25CLFVBQU07QUFBRWhCLE1BQUFBO0FBQUYsUUFBYyxLQUFLUixLQUF6QjtBQUNBLFVBQU07QUFBRUksTUFBQUE7QUFBRixRQUFXLEtBQUtELEtBQXRCO0FBQ0EsVUFBTXNCLHFCQUFxQixHQUN6QnJCLElBQUksS0FBS0Msd0JBQWFDLE9BQXRCLEdBQWdDLElBQWhDLGdCQUNFO0FBQUssTUFBQSxTQUFTLEVBQUM7QUFBZixvQkFDRTtBQUFLLE1BQUEsU0FBUyxFQUFDO0FBQWYsdUNBREYsZUFFRTtBQUFLLE1BQUEsU0FBUyxFQUFDO0FBQWYsT0FBd0MsOENBQWdCLDZCQUFoQixDQUF4QyxDQUZGLENBRko7QUFRQSxVQUFNb0IsT0FBTyxHQUFHdEIsSUFBSSxLQUFLQyx3QkFBYXNCLE9BQXRDO0FBQ0EsVUFBTUMsTUFBTSxHQUFHeEIsSUFBSSxLQUFLQyx3QkFBYXdCLE1BQXJDO0FBQ0EsVUFBTUMscUJBQXFCLEdBQ3pCLENBQUNKLE9BQUQsSUFBWSxDQUFDRSxNQUFiLEdBQXNCLElBQXRCLGdCQUNFO0FBQUssTUFBQSxTQUFTLEVBQUM7QUFBZixvQkFDRTtBQUFLLE1BQUEsU0FBUyxFQUFDO0FBQWYsT0FDRyxDQUFDcEIsT0FBTyxDQUFDTSxTQUFSLENBQWtCSSxjQUFsQixJQUFvQyxJQUFwQyxJQUNGVixPQUFPLENBQUNNLFNBQVIsQ0FBa0JJLGNBQWxCLENBQWlDYSxhQUFqQyxDQUErQ0MsV0FBL0MsSUFBOEQsSUFENUQsR0FFRSxrQkFGRixHQUdFeEIsT0FBTyxDQUFDTSxTQUFSLENBQWtCSSxjQUFsQixDQUFpQ2EsYUFBakMsQ0FBK0NDLFdBSGxELElBR2tFLE9BQU1OLE9BQU8sR0FBRyxTQUFILEdBQWUsUUFBUyxHQUoxRyxDQURGLENBRko7QUFZQSx3QkFDRTtBQUFLLE1BQUEsU0FBUyxFQUFDO0FBQWYsb0JBQ0U7QUFBSyxNQUFBLFNBQVMsRUFBQztBQUFmLG9CQUNFLG9CQUFDLCtCQUFEO0FBQXdCLE1BQUEsT0FBTyxFQUFFbEI7QUFBakMsTUFERixDQURGLGVBSUU7QUFBSyxNQUFBLFNBQVMsRUFBQztBQUFmLG9CQUNFLG9CQUFDLGtDQUFEO0FBQTJCLE1BQUEsT0FBTyxFQUFFQTtBQUFwQyxNQURGLENBSkYsRUFPR3NCLHFCQVBILEVBUUdMLHFCQVJILENBREY7QUFZRDs7QUEzRWlGIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBEZWJ1Z2dlck1vZGVUeXBlLCBJRGVidWdTZXJ2aWNlIH0gZnJvbSBcIi4uL3R5cGVzXCJcclxuXHJcbmltcG9ydCB7IG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24gfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvZXZlbnRcIlxyXG5pbXBvcnQgVW5pdmVyc2FsRGlzcG9zYWJsZSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvVW5pdmVyc2FsRGlzcG9zYWJsZVwiXHJcbmltcG9ydCAqIGFzIFJlYWN0IGZyb20gXCJyZWFjdFwiXHJcbmltcG9ydCB7IE9ic2VydmFibGUgfSBmcm9tIFwicnhqcy1jb21wYXQvYnVuZGxlcy9yeGpzLWNvbXBhdC51bWQubWluLmpzXCJcclxuaW1wb3J0IERlYnVnZ2VyU3RlcHBpbmdDb21wb25lbnQgZnJvbSBcIi4vRGVidWdnZXJTdGVwcGluZ0NvbXBvbmVudFwiXHJcbmltcG9ydCB7IERlYnVnZ2VyTW9kZSB9IGZyb20gXCIuLi9jb25zdGFudHNcIlxyXG5pbXBvcnQgRGVidWdnZXJDb250cm9sbGVyVmlldyBmcm9tIFwiLi9EZWJ1Z2dlckNvbnRyb2xsZXJWaWV3XCJcclxuaW1wb3J0IHsgQWRkVGFyZ2V0QnV0dG9uIH0gZnJvbSBcIi4vRGVidWdnZXJBZGRUYXJnZXRCdXR0b25cIlxyXG5cclxudHlwZSBQcm9wcyA9IHtcclxuICBzZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxyXG59XHJcblxyXG50eXBlIFN0YXRlID0ge1xyXG4gIG1vZGU6IERlYnVnZ2VyTW9kZVR5cGUsXHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIERlYnVnZ2VyQ29udHJvbHNWaWV3IGV4dGVuZHMgUmVhY3QuUHVyZUNvbXBvbmVudDxQcm9wcywgU3RhdGU+IHtcclxuICBfZGlzcG9zYWJsZXM6IFVuaXZlcnNhbERpc3Bvc2FibGVcclxuXHJcbiAgY29uc3RydWN0b3IocHJvcHM6IFByb3BzKSB7XHJcbiAgICBzdXBlcihwcm9wcylcclxuXHJcbiAgICB0aGlzLl9kaXNwb3NhYmxlcyA9IG5ldyBVbml2ZXJzYWxEaXNwb3NhYmxlKClcclxuICAgIHRoaXMuc3RhdGUgPSB7XHJcbiAgICAgIG1vZGU6IERlYnVnZ2VyTW9kZS5TVE9QUEVELFxyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgY29tcG9uZW50RGlkTW91bnQoKTogdm9pZCB7XHJcbiAgICBjb25zdCB7IHNlcnZpY2UgfSA9IHRoaXMucHJvcHNcclxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChcclxuICAgICAgT2JzZXJ2YWJsZS5tZXJnZShcclxuICAgICAgICBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKHNlcnZpY2Uub25EaWRDaGFuZ2VQcm9jZXNzTW9kZS5iaW5kKHNlcnZpY2UpKSxcclxuICAgICAgICBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKHNlcnZpY2Uudmlld01vZGVsLm9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cy5iaW5kKHNlcnZpY2Uudmlld01vZGVsKSlcclxuICAgICAgKVxyXG4gICAgICAgIC5zdGFydFdpdGgobnVsbClcclxuICAgICAgICAuc3Vic2NyaWJlKCgpID0+IHtcclxuICAgICAgICAgIGNvbnN0IHsgdmlld01vZGVsIH0gPSB0aGlzLnByb3BzLnNlcnZpY2VcclxuICAgICAgICAgIGNvbnN0IHsgZm9jdXNlZFByb2Nlc3MgfSA9IHZpZXdNb2RlbFxyXG4gICAgICAgICAgdGhpcy5zZXRTdGF0ZSh7XHJcbiAgICAgICAgICAgIG1vZGU6IGZvY3VzZWRQcm9jZXNzID09IG51bGwgPyBEZWJ1Z2dlck1vZGUuU1RPUFBFRCA6IGZvY3VzZWRQcm9jZXNzLmRlYnVnZ2VyTW9kZSxcclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgfSlcclxuICAgIClcclxuICB9XHJcblxyXG4gIGNvbXBvbmVudFdpbGxVbm1vdW50KCk6IHZvaWQge1xyXG4gICAgdGhpcy5fZGlzcG9zZSgpXHJcbiAgfVxyXG5cclxuICBfZGlzcG9zZSgpOiB2b2lkIHtcclxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKVxyXG4gIH1cclxuXHJcbiAgcmVuZGVyKCk6IFJlYWN0Lk5vZGUge1xyXG4gICAgY29uc3QgeyBzZXJ2aWNlIH0gPSB0aGlzLnByb3BzXHJcbiAgICBjb25zdCB7IG1vZGUgfSA9IHRoaXMuc3RhdGVcclxuICAgIGNvbnN0IGRlYnVnZ2VyU3RvcHBlZE5vdGljZSA9XHJcbiAgICAgIG1vZGUgIT09IERlYnVnZ2VyTW9kZS5TVE9QUEVEID8gbnVsbCA6IChcclxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXBhbmUtY29udGVudFwiPlxyXG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1zdGF0ZS1ub3RpY2VcIj5UaGUgZGVidWdnZXIgaXMgbm90IGF0dGFjaGVkLjwvZGl2PlxyXG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1zdGF0ZS1ub3RpY2VcIj57QWRkVGFyZ2V0QnV0dG9uKFwiZGVidWdnZXItYnV0dG9uZ3JvdXAtY2VudGVyXCIpfTwvZGl2PlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgICApXHJcblxyXG4gICAgY29uc3QgcnVubmluZyA9IG1vZGUgPT09IERlYnVnZ2VyTW9kZS5SVU5OSU5HXHJcbiAgICBjb25zdCBwYXVzZWQgPSBtb2RlID09PSBEZWJ1Z2dlck1vZGUuUEFVU0VEXHJcbiAgICBjb25zdCBkZWJ1Z2dlclJ1bm5pbmdOb3RpY2UgPVxyXG4gICAgICAhcnVubmluZyAmJiAhcGF1c2VkID8gbnVsbCA6IChcclxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXBhbmUtY29udGVudFwiPlxyXG4gICAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1zdGF0ZS1ub3RpY2VcIj5cclxuICAgICAgICAgICAgeyhzZXJ2aWNlLnZpZXdNb2RlbC5mb2N1c2VkUHJvY2VzcyA9PSBudWxsIHx8XHJcbiAgICAgICAgICAgIHNlcnZpY2Uudmlld01vZGVsLmZvY3VzZWRQcm9jZXNzLmNvbmZpZ3VyYXRpb24ucHJvY2Vzc05hbWUgPT0gbnVsbFxyXG4gICAgICAgICAgICAgID8gXCJUaGUgZGVidWcgdGFyZ2V0XCJcclxuICAgICAgICAgICAgICA6IHNlcnZpY2Uudmlld01vZGVsLmZvY3VzZWRQcm9jZXNzLmNvbmZpZ3VyYXRpb24ucHJvY2Vzc05hbWUpICsgYCBpcyAke3J1bm5pbmcgPyBcInJ1bm5pbmdcIiA6IFwicGF1c2VkXCJ9LmB9XHJcbiAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICA8L2Rpdj5cclxuICAgICAgKVxyXG5cclxuICAgIHJldHVybiAoXHJcbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItY29udGFpbmVyLW5ld1wiPlxyXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItc2VjdGlvbi1oZWFkZXJcIj5cclxuICAgICAgICAgIDxEZWJ1Z2dlckNvbnRyb2xsZXJWaWV3IHNlcnZpY2U9e3NlcnZpY2V9IC8+XHJcbiAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1zZWN0aW9uLWhlYWRlciBkZWJ1Z2dlci1jb250cm9scy1zZWN0aW9uXCI+XHJcbiAgICAgICAgICA8RGVidWdnZXJTdGVwcGluZ0NvbXBvbmVudCBzZXJ2aWNlPXtzZXJ2aWNlfSAvPlxyXG4gICAgICAgIDwvZGl2PlxyXG4gICAgICAgIHtkZWJ1Z2dlclJ1bm5pbmdOb3RpY2V9XHJcbiAgICAgICAge2RlYnVnZ2VyU3RvcHBlZE5vdGljZX1cclxuICAgICAgPC9kaXY+XHJcbiAgICApXHJcbiAgfVxyXG59XHJcbiJdfQ==