"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _LoadingSpinner = require("@atom-ide-community/nuclide-commons-ui/LoadingSpinner");

var _event = require("@atom-ide-community/nuclide-commons/event");

var _observable = require("@atom-ide-community/nuclide-commons/observable");

var React = _interopRequireWildcard(require("react"));

var _Button = require("@atom-ide-community/nuclide-commons-ui/Button");

var _ButtonGroup = require("@atom-ide-community/nuclide-commons-ui/ButtonGroup");

var _rxjs = require("rxjs");

var _constants = require("../constants");

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var _logger = _interopRequireDefault(require("../logger"));

var _nullthrows = _interopRequireDefault(require("nullthrows"));

var _assert = _interopRequireDefault(require("assert"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

const defaultTooltipOptions = {
  placement: "bottom"
};
const STEP_OVER_ICON = /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 100 100"
}, /*#__PURE__*/React.createElement("circle", {
  cx: "46",
  cy: "63",
  r: "10"
}), /*#__PURE__*/React.createElement("path", {
  d: "M83.8,54.7c-6.5-16.6-20.7-28.1-37.2-28.1c-19.4,0-35.6,16-39.9," + "37.3l11.6,2.9c3-16.2,14.5-28.2,28.2-28.2 c11,0,20.7,7.8,25.6," + "19.3l-9.6,2.7l20.8,14.7L93.7,52L83.8,54.7z"
}));
const STEP_INTO_ICON = /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 100 100"
}, /*#__PURE__*/React.createElement("circle", {
  cx: "50",
  cy: "75",
  r: "10"
}), /*#__PURE__*/React.createElement("polygon", {
  points: "42,20 57,20 57,40 72,40 50,60 28,40 42,40"
}));
const STEP_OUT_ICON = /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 100 100"
}, /*#__PURE__*/React.createElement("circle", {
  cx: "50",
  cy: "75",
  r: "10"
}), /*#__PURE__*/React.createElement("polygon", {
  points: "42,20 57,20 57,40 72,40 50,60 28,40 42,40",
  transform: "rotate(180, 50, 40)"
}));

function SVGButton(props) {
  return /*#__PURE__*/React.createElement(_Button.Button, {
    className: "debugger-stepping-svg-button",
    onClick: props.onClick,
    disabled: props.disabled,
    tooltip: props.tooltip
  }, /*#__PURE__*/React.createElement("div", null, props.icon));
}

class DebuggerSteppingComponent extends React.Component {
  constructor(props) {
    super(props);
    this._disposables = void 0;

    this._togglePauseState = () => {
      const pausableThread = this._getPausableThread();

      if (pausableThread == null) {
        _logger.default.error("No thread to pause/resume");

        return;
      }

      if (pausableThread.stopped) {
        pausableThread.continue();
      } else {
        this._setWaitingForPause(true);

        pausableThread.pause();
      }
    };

    this._disposables = new _UniversalDisposable.default();
    this.state = {
      waitingForPause: false,
      focusedProcess: null,
      focusedThread: null
    };
  }

  componentDidMount() {
    const {
      service
    } = this.props;
    const model = service.getModel();

    this._disposables.add(_rxjs.Observable.merge((0, _event.observableFromSubscribeFunction)(service.onDidChangeProcessMode.bind(service)), (0, _event.observableFromSubscribeFunction)(model.onDidChangeCallStack.bind(model)), (0, _event.observableFromSubscribeFunction)(service.viewModel.onDidChangeDebuggerFocus.bind(service.viewModel))).startWith(null).let((0, _observable.fastDebounce)(10)).subscribe(() => {
      const {
        viewModel
      } = this.props.service;
      const {
        focusedProcess,
        focusedThread
      } = viewModel;
      const debuggerMode = focusedProcess == null ? _constants.DebuggerMode.STOPPED : focusedProcess.debuggerMode;
      this.setState(prevState => ({
        focusedProcess,
        focusedThread,
        waitingForPause: prevState.waitingForPause && debuggerMode === _constants.DebuggerMode.RUNNING
      }));
    }));
  }

  componentWillUnmount() {
    this._disposables.dispose();
  }

  _setWaitingForPause(waiting) {
    this.setState({
      waitingForPause: waiting
    });
  }

  _getPausableThread() {
    const {
      focusedThread,
      focusedProcess
    } = this.props.service.viewModel;

    if (focusedThread != null) {
      return focusedThread;
    } else if (focusedProcess != null) {
      return focusedProcess.getAllThreads()[0];
    } else {
      return null;
    }
  }

  render() {
    const {
      waitingForPause,
      focusedProcess,
      focusedThread
    } = this.state;
    const {
      service
    } = this.props;
    const debuggerMode = focusedProcess == null ? _constants.DebuggerMode.STOPPED : focusedProcess.debuggerMode;
    const readOnly = focusedProcess == null ? false : Boolean(focusedProcess.configuration.isReadOnly);
    const customControlButtons = focusedProcess == null ? [] : focusedProcess.configuration.customControlButtons || [];
    const isPaused = debuggerMode === _constants.DebuggerMode.PAUSED;
    const isStopped = debuggerMode === _constants.DebuggerMode.STOPPED;
    const isPausing = debuggerMode === _constants.DebuggerMode.RUNNING && waitingForPause;
    const playPauseIcon = isPausing ? null : /*#__PURE__*/React.createElement("span", {
      className: isPaused ? "icon-playback-play" : "icon-playback-pause"
    });
    const loadingIndicator = !isPausing ? null : /*#__PURE__*/React.createElement(_LoadingSpinner.LoadingSpinner, {
      className: "debugger-stepping-playpause-button-loading",
      size: _LoadingSpinner.LoadingSpinnerSizes.EXTRA_SMALL
    });
    const restartDebuggerButton = debuggerMode !== _constants.DebuggerMode.STOPPED && service.canRestartProcess() ? /*#__PURE__*/React.createElement(_Button.Button, {
      icon: "sync",
      className: "debugger-stepping-button-separated",
      disabled: isStopped || readOnly,
      tooltip: { ...defaultTooltipOptions,
        title: "Restart the debugger using the same settings as the current debug session",
        keyBindingCommand: "debugger:restart-debugging"
      },
      onClick: () => {
        (0, _assert.default)(focusedProcess != null);
        service.restartProcess(focusedProcess);
      }
    }) : null;

    const DebuggerStepButton = props => /*#__PURE__*/React.createElement(SVGButton, {
      icon: props.icon,
      disabled: props.disabled || readOnly,
      tooltip: { ...defaultTooltipOptions,
        title: props.title,
        keyBindingCommand: props.keyBindingCommand
      },
      onClick: props.onClick
    });

    const pausableThread = this._getPausableThread();

    let playPauseTitle;

    if (isPausing) {
      playPauseTitle = "Waiting for pause...";
    } else if (isPaused) {
      playPauseTitle = "Continue";
    } else if (pausableThread == null) {
      playPauseTitle = "No running threads to pause!";
    } else {
      playPauseTitle = "Pause";
    }

    const process = service.getModel().getProcesses()[0];
    const attached = process != null && process.configuration.debugMode === "attach";
    return /*#__PURE__*/React.createElement("div", {
      className: "debugger-stepping-component"
    }, /*#__PURE__*/React.createElement(_ButtonGroup.ButtonGroup, {
      className: "debugger-stepping-buttongroup"
    }, restartDebuggerButton, /*#__PURE__*/React.createElement(_Button.Button, {
      disabled: isPausing || pausableThread == null || readOnly,
      tooltip: { ...defaultTooltipOptions,
        title: playPauseTitle,
        keyBindingCommand: isPaused ? "debugger:continue-debugging" : undefined
      },
      onClick: this._togglePauseState.bind(this)
    }, /*#__PURE__*/React.createElement("div", {
      className: "debugger-stepping-playpause-button"
    }, playPauseIcon, loadingIndicator)), /*#__PURE__*/React.createElement(DebuggerStepButton, {
      icon: STEP_OVER_ICON,
      disabled: !isPaused || focusedThread == null,
      title: "Step over",
      keyBindingCommand: "debugger:step-over",
      onClick: () => (0, _nullthrows.default)(focusedThread).next()
    }), /*#__PURE__*/React.createElement(DebuggerStepButton, {
      icon: STEP_INTO_ICON,
      disabled: !isPaused || focusedThread == null,
      title: "Step into",
      keyBindingCommand: "debugger:step-into",
      onClick: () => (0, _nullthrows.default)(focusedThread).stepIn()
    }), /*#__PURE__*/React.createElement(DebuggerStepButton, {
      icon: STEP_OUT_ICON,
      disabled: !isPaused || focusedThread == null,
      title: "Step out",
      keyBindingCommand: "debugger:step-out",
      onClick: () => (0, _nullthrows.default)(focusedThread).stepOut()
    }), /*#__PURE__*/React.createElement(_Button.Button, {
      icon: "primitive-square",
      disabled: isStopped || focusedProcess == null,
      tooltip: { ...defaultTooltipOptions,
        title: attached ? "Detach" : "Terminate",
        keyBindingCommand: "debugger:stop-debugging"
      },
      onClick: () => {
        if (focusedProcess != null) {
          service.stopProcess(focusedProcess);
        }
      }
    })), /*#__PURE__*/React.createElement(_ButtonGroup.ButtonGroup, {
      className: "debugger-stepping-buttongroup"
    }, customControlButtons.map((specification, i) => {
      const buttonProps = { ...specification,
        tooltip: {
          title: specification.title
        }
      };
      return /*#__PURE__*/React.createElement(_Button.Button, _extends({}, buttonProps, {
        key: i
      }));
    })));
  }

}

exports.default = DebuggerSteppingComponent;
module.exports = exports.default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyU3RlcHBpbmdDb21wb25lbnQuanMiXSwibmFtZXMiOlsiZGVmYXVsdFRvb2x0aXBPcHRpb25zIiwicGxhY2VtZW50IiwiU1RFUF9PVkVSX0lDT04iLCJTVEVQX0lOVE9fSUNPTiIsIlNURVBfT1VUX0lDT04iLCJTVkdCdXR0b24iLCJwcm9wcyIsIm9uQ2xpY2siLCJkaXNhYmxlZCIsInRvb2x0aXAiLCJpY29uIiwiRGVidWdnZXJTdGVwcGluZ0NvbXBvbmVudCIsIlJlYWN0IiwiQ29tcG9uZW50IiwiY29uc3RydWN0b3IiLCJfZGlzcG9zYWJsZXMiLCJfdG9nZ2xlUGF1c2VTdGF0ZSIsInBhdXNhYmxlVGhyZWFkIiwiX2dldFBhdXNhYmxlVGhyZWFkIiwibG9nZ2VyIiwiZXJyb3IiLCJzdG9wcGVkIiwiY29udGludWUiLCJfc2V0V2FpdGluZ0ZvclBhdXNlIiwicGF1c2UiLCJVbml2ZXJzYWxEaXNwb3NhYmxlIiwic3RhdGUiLCJ3YWl0aW5nRm9yUGF1c2UiLCJmb2N1c2VkUHJvY2VzcyIsImZvY3VzZWRUaHJlYWQiLCJjb21wb25lbnREaWRNb3VudCIsInNlcnZpY2UiLCJtb2RlbCIsImdldE1vZGVsIiwiYWRkIiwiT2JzZXJ2YWJsZSIsIm1lcmdlIiwib25EaWRDaGFuZ2VQcm9jZXNzTW9kZSIsImJpbmQiLCJvbkRpZENoYW5nZUNhbGxTdGFjayIsInZpZXdNb2RlbCIsIm9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cyIsInN0YXJ0V2l0aCIsImxldCIsInN1YnNjcmliZSIsImRlYnVnZ2VyTW9kZSIsIkRlYnVnZ2VyTW9kZSIsIlNUT1BQRUQiLCJzZXRTdGF0ZSIsInByZXZTdGF0ZSIsIlJVTk5JTkciLCJjb21wb25lbnRXaWxsVW5tb3VudCIsImRpc3Bvc2UiLCJ3YWl0aW5nIiwiZ2V0QWxsVGhyZWFkcyIsInJlbmRlciIsInJlYWRPbmx5IiwiQm9vbGVhbiIsImNvbmZpZ3VyYXRpb24iLCJpc1JlYWRPbmx5IiwiY3VzdG9tQ29udHJvbEJ1dHRvbnMiLCJpc1BhdXNlZCIsIlBBVVNFRCIsImlzU3RvcHBlZCIsImlzUGF1c2luZyIsInBsYXlQYXVzZUljb24iLCJsb2FkaW5nSW5kaWNhdG9yIiwiTG9hZGluZ1NwaW5uZXJTaXplcyIsIkVYVFJBX1NNQUxMIiwicmVzdGFydERlYnVnZ2VyQnV0dG9uIiwiY2FuUmVzdGFydFByb2Nlc3MiLCJ0aXRsZSIsImtleUJpbmRpbmdDb21tYW5kIiwicmVzdGFydFByb2Nlc3MiLCJEZWJ1Z2dlclN0ZXBCdXR0b24iLCJwbGF5UGF1c2VUaXRsZSIsInByb2Nlc3MiLCJnZXRQcm9jZXNzZXMiLCJhdHRhY2hlZCIsImRlYnVnTW9kZSIsInVuZGVmaW5lZCIsIm5leHQiLCJzdGVwSW4iLCJzdGVwT3V0Iiwic3RvcFByb2Nlc3MiLCJtYXAiLCJzcGVjaWZpY2F0aW9uIiwiaSIsImJ1dHRvblByb3BzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQ0E7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7QUFZQSxNQUFNQSxxQkFBcUIsR0FBRztBQUM1QkMsRUFBQUEsU0FBUyxFQUFFO0FBRGlCLENBQTlCO0FBSUEsTUFBTUMsY0FBYyxnQkFDbEI7QUFBSyxFQUFBLE9BQU8sRUFBQztBQUFiLGdCQUNFO0FBQVEsRUFBQSxFQUFFLEVBQUMsSUFBWDtBQUFnQixFQUFBLEVBQUUsRUFBQyxJQUFuQjtBQUF3QixFQUFBLENBQUMsRUFBQztBQUExQixFQURGLGVBRUU7QUFDRSxFQUFBLENBQUMsRUFDQyxtRUFDQSwrREFEQSxHQUVBO0FBSkosRUFGRixDQURGO0FBYUEsTUFBTUMsY0FBYyxnQkFDbEI7QUFBSyxFQUFBLE9BQU8sRUFBQztBQUFiLGdCQUNFO0FBQVEsRUFBQSxFQUFFLEVBQUMsSUFBWDtBQUFnQixFQUFBLEVBQUUsRUFBQyxJQUFuQjtBQUF3QixFQUFBLENBQUMsRUFBQztBQUExQixFQURGLGVBRUU7QUFBUyxFQUFBLE1BQU0s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TUFBTSx5QkFBV0EsYUFBWCxFQUEwQnNELE9BQTFCO0FBTGpCLE1BOUJGLGVBcUNFLG9CQUFDLGNBQUQ7QUFDRSxNQUFBLElBQUksRUFBQyxrQkFEUDtBQUVFLE1BQUEsUUFBUSxFQUFFcEIsU0FBUyxJQUFJbkMsY0FBYyxJQUFJLElBRjNDO0FBR0UsTUFBQSxPQUFPLEVBQUUsRUFDUCxHQUFHNUIscUJBREk7QUFFUHVFLFFBQUFBLEtBQUssRUFBRU8sUUFBUSxHQUFHLFFBQUgsR0FBYyxXQUZ0QjtBQUdQTixRQUFBQSxpQkFBaUIsRUFBRTtBQUhaLE9BSFg7QUFRRSxNQUFBLE9BQU8sRUFBRSxNQUFNO0FBQ2IsWUFBSTVDLGNBQWMsSUFBSSxJQUF0QixFQUE0QjtBQUMxQkcsVUFBQUEsT0FBTyxDQUFDcUQsV0FBUixDQUFvQnhELGNBQXBCO0FBQ0Q7QUFDRjtBQVpILE1BckNGLENBREYsZUFxREUsb0JBQUMsd0JBQUQ7QUFBYSxNQUFBLFNBQVMsRUFBQztBQUF2QixPQUNHZ0Msb0JBQW9CLENBQUN5QixHQUFyQixDQUF5QixDQUFDQyxhQUFELEVBQWdCQyxDQUFoQixLQUFzQjtBQUM5QyxZQUFNQyxXQUFXLEdBQUcsRUFDbEIsR0FBR0YsYUFEZTtBQUVsQjdFLFFBQUFBLE9BQU8sRUFBRTtBQUNQOEQsVUFBQUEsS0FBSyxFQUFFZSxhQUFhLENBQUNmO0FBRGQ7QUFGUyxPQUFwQjtBQU1BLDBCQUFPLG9CQUFDLGNBQUQsZUFBWWlCLFdBQVo7QUFBeUIsUUFBQSxHQUFHLEVBQUVEO0FBQTlCLFNBQVA7QUFDRCxLQVJBLENBREgsQ0FyREYsQ0FERjtBQW1FRDs7QUFyTkQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IElEZWJ1Z1NlcnZpY2UsIElUaHJlYWQsIElQcm9jZXNzIH0gZnJvbSBcIi4uL3R5cGVzXCJcbmltcG9ydCB7IExvYWRpbmdTcGlubmVyLCBMb2FkaW5nU3Bpbm5lclNpemVzIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0xvYWRpbmdTcGlubmVyXCJcblxuaW1wb3J0IHsgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbiB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9ldmVudFwiXG5pbXBvcnQgeyBmYXN0RGVib3VuY2UgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvb2JzZXJ2YWJsZVwiXG5pbXBvcnQgKiBhcyBSZWFjdCBmcm9tIFwicmVhY3RcIlxuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0J1dHRvblwiXG5pbXBvcnQgeyBCdXR0b25Hcm91cCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9CdXR0b25Hcm91cFwiXG5pbXBvcnQgeyBPYnNlcnZhYmxlIH0gZnJvbSBcInJ4anNcIlxuaW1wb3J0IHsgRGVidWdnZXJNb2RlIH0gZnJvbSBcIi4uL2NvbnN0YW50c1wiXG5pbXBvcnQgVW5pdmVyc2FsRGlzcG9zYWJsZSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvVW5pdmVyc2FsRGlzcG9zYWJsZVwiXG5pbXBvcnQgbG9nZ2VyIGZyb20gXCIuLi9sb2dnZXJcIlxuaW1wb3J0IG51bGx0aHJvd3MgZnJvbSBcIm51bGx0aHJvd3NcIlxuaW1wb3J0IGludmFyaWFudCBmcm9tIFwiYXNzZXJ0XCJcblxudHlwZSBEZWJ1Z2dlclN0ZXBwaW5nQ29tcG9uZW50UHJvcHMgPSB7XG4gIHNlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG59XG5cbnR5cGUgRGVidWdnZXJTdGVwcGluZ0NvbXBvbmVudFN0YXRlID0ge1xuICB3YWl0aW5nRm9yUGF1c2U6IGJvb2xlYW4sXG4gIGZvY3VzZWRQcm9jZXNzOiA/SVByb2Nlc3MsXG4gIGZvY3VzZWRUaHJlYWQ6ID9JVGhyZWFkLFxufVxuXG5jb25zdCBkZWZhdWx0VG9vbHRpcE9wdGlvbnMgPSB7XG4gIHBsYWNlbWVudDogXCJib3R0b21cIixcbn1cblxuY29uc3QgU1RFUF9PVkVSX0lDT04gPSAoXG4gIDxzdmcgdmlld0JveD1cIjAgMCAxMDAgMTAwXCI+XG4gICAgPGNpcmNsZSBjeD1cIjQ2XCIgY3k9XCI2M1wiIHI9XCIxMFwiIC8+XG4gICAgPHBhdGhcbiAgICAgIGQ9e1xuICAgICAgICBcIk04My44LDU0LjdjLTYuNS0xNi42LTIwLjctMjguMS0zNy4yLTI4LjFjLTE5LjQsMC0zNS42LDE2LTM5LjksXCIgK1xuICAgICAgICBcIjM3LjNsMTEuNiwyLjljMy0xNi4yLDE0LjUtMjguMiwyOC4yLTI4LjIgYzExLDAsMjAuNyw3LjgsMjUuNixcIiArXG4gICAgICAgIFwiMTkuM2wtOS42LDIuN2wyMC44LDE0LjdMOTMuNyw1Mkw4My44LDU0Ljd6XCJcbiAgICAgIH1cbiAgICAvPlxuICA8L3N2Zz5cbilcblxuY29uc3QgU1RFUF9JTlRPX0lDT04gPSAoXG4gIDxzdmcgdmlld0JveD1cIjAgMCAxMDAgMTAwXCI+XG4gICAgPGNpcmNsZSBjeD1cIjUwXCIgY3k9XCI3NVwiIHI9XCIxMFwiIC8+XG4gICAgPHBvbHlnb24gcG9pbnRzPVwiNDIsMjAgNTcsMjAgNTcsNDAgNzIsNDAgNTAsNjAgMjgsNDAgNDIsNDBcIiAvPlxuICA8L3N2Zz5cbilcblxuY29uc3QgU1RFUF9PVVRfSUNPTiA9IChcbiAgPHN2ZyB2aWV3Qm94PVwiMCAwIDEwMCAxMDBcIj5cbiAgICA8Y2lyY2xlIGN4PVwiNTBcIiBjeT1cIjc1XCIgcj1cIjEwXCIgLz5cbiAgICA8cG9seWdvbiBwb2ludHM9XCI0MiwyMCA1NywyMCA1Nyw0MCA3Miw0MCA1MCw2MCAyOCw0MCA0Miw0MFwiIHRyYW5zZm9ybT1cInJvdGF0ZSgxODAsIDUwLCA0MClcIiAvPlxuICA8L3N2Zz5cbilcblxuZnVuY3Rpb24gU1ZHQnV0dG9uKHByb3BzOiB7XG4gIG9uQ2xpY2s6ICgpID0+IG1peGVkLFxuICB0b29sdGlwOiBhdG9tJFRvb2x0aXBzQWRkT3B0aW9ucyxcbiAgaWNvbjogUmVhY3QuRWxlbWVudDxhbnk+LFxuICBkaXNhYmxlZDogYm9vbGVhbixcbn0pOiBSZWFjdC5FbGVtZW50PGFueT4ge1xuICByZXR1cm4gKFxuICAgIDxCdXR0b25cbiAgICAgIGNsYXNzTmFtZT1cImRlYnVnZ2VyLXN0ZXBwaW5nLXN2Zy1idXR0b25cIlxuICAgICAgb25DbGljaz17cHJvcHMub25DbGlja31cbiAgICAgIGRpc2FibGVkPXtwcm9wcy5kaXNhYmxlZH1cbiAgICAgIHRvb2x0aXA9e3Byb3BzLnRvb2x0aXB9XG4gICAgPlxuICAgICAgPGRpdj57cHJvcHMuaWNvbn08L2Rpdj5cbiAgICA8L0J1dHRvbj5cbiAgKVxufVxuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBEZWJ1Z2dlclN0ZXBwaW5nQ29tcG9uZW50IGV4dGVuZHMgUmVhY3QuQ29tcG9uZW50PFxuICBEZWJ1Z2dlclN0ZXBwaW5nQ29tcG9uZW50UHJvcHMsXG4gIERlYnVnZ2VyU3RlcHBpbmdDb21wb25lbnRTdGF0ZVxuPiB7XG4gIF9kaXNwb3NhYmxlczogVW5pdmVyc2FsRGlzcG9zYWJsZVxuXG4gIGNvbnN0cnVjdG9yKHByb3BzOiBEZWJ1Z2dlclN0ZXBwaW5nQ29tcG9uZW50UHJvcHMpIHtcbiAgICBzdXBlcihwcm9wcylcblxuICAgIHRoaXMuX2Rpc3Bvc2FibGVzID0gbmV3IFVuaXZlcnNhbERpc3Bvc2FibGUoKVxuICAgIHRoaXMuc3RhdGUgPSB7XG4gICAgICB3YWl0aW5nRm9yUGF1c2U6IGZhbHNlLFxuICAgICAgZm9jdXNlZFByb2Nlc3M6IG51bGwsXG4gICAgICBmb2N1c2VkVGhyZWFkOiBudWxsLFxuICAgIH1cbiAgfVxuXG4gIGNvbXBvbmVudERpZE1vdW50KCk6IHZvaWQge1xuICAgIGNvbnN0IHsgc2VydmljZSB9ID0gdGhpcy5wcm9wc1xuICAgIGNvbnN0IG1vZGVsID0gc2VydmljZS5nZXRNb2RlbCgpXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuYWRkKFxuICAgICAgT2JzZXJ2YWJsZS5tZXJnZShcbiAgICAgICAgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbihzZXJ2aWNlLm9uRGlkQ2hhbmdlUHJvY2Vzc01vZGUuYmluZChzZXJ2aWNlKSksXG4gICAgICAgIG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24obW9kZWwub25EaWRDaGFuZ2VDYWxsU3RhY2suYmluZChtb2RlbCkpLFxuICAgICAgICBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKHNlcnZpY2Uudmlld01vZGVsLm9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cy5iaW5kKHNlcnZpY2Uudmlld01vZGVsKSlcbiAgICAgIClcbiAgICAgICAgLnN0YXJ0V2l0aChudWxsKVxuICAgICAgICAubGV0KGZhc3REZWJvdW5jZSgxMCkpXG4gICAgICAgIC5zdWJzY3JpYmUoKCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHsgdmlld01vZGVsIH0gPSB0aGlzLnByb3BzLnNlcnZpY2VcbiAgICAgICAgICBjb25zdCB7IGZvY3VzZWRQcm9jZXNzLCBmb2N1c2VkVGhyZWFkIH0gPSB2aWV3TW9kZWxcbiAgICAgICAgICBjb25zdCBkZWJ1Z2dlck1vZGUgPSBmb2N1c2VkUHJvY2VzcyA9PSBudWxsID8gRGVidWdnZXJNb2RlLlNUT1BQRUQgOiBmb2N1c2VkUHJvY2Vzcy5kZWJ1Z2dlck1vZGVcblxuICAgICAgICAgIHRoaXMuc2V0U3RhdGUoKHByZXZTdGF0ZSkgPT4gKHtcbiAgICAgICAgICAgIGZvY3VzZWRQcm9jZXNzLFxuICAgICAgICAgICAgZm9jdXNlZFRocmVhZCxcbiAgICAgICAgICAgIHdhaXRpbmdGb3JQYXVzZTogcHJldlN0YXRlLndhaXRpbmdGb3JQYXVzZSAmJiBkZWJ1Z2dlck1vZGUgPT09IERlYnVnZ2VyTW9kZS5SVU5OSU5HLFxuICAgICAgICAgIH0pKVxuICAgICAgICB9KVxuICAgIClcbiAgfVxuXG4gIGNvbXBvbmVudFdpbGxVbm1vdW50KCk6IHZvaWQge1xuICAgIHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuICB9XG5cbiAgX3NldFdhaXRpbmdGb3JQYXVzZSh3YWl0aW5nOiBib29sZWFuKTogdm9pZCB7XG4gICAgdGhpcy5zZXRTdGF0ZSh7XG4gICAgICB3YWl0aW5nRm9yUGF1c2U6IHdhaXRpbmcsXG4gICAgfSlcbiAgfVxuXG4gIF9nZXRQYXVzYWJsZVRocmVhZCgpOiA/SVRocmVhZCB7XG4gICAgY29uc3QgeyBmb2N1c2VkVGhyZWFkLCBmb2N1c2VkUHJvY2VzcyB9ID0gdGhpcy5wcm9wcy5zZXJ2aWNlLnZpZXdNb2RlbFxuICAgIGlmIChmb2N1c2VkVGhyZWFkICE9IG51bGwpIHtcbiAgICAgIHJldHVybiBmb2N1c2VkVGhyZWFkXG4gICAgfSBlbHNlIGlmIChmb2N1c2VkUHJvY2VzcyAhPSBudWxsKSB7XG4gICAgICByZXR1cm4gZm9jdXNlZFByb2Nlc3MuZ2V0QWxsVGhyZWFkcygpWzBdXG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBudWxsXG4gICAgfVxuICB9XG5cbiAgX3RvZ2dsZVBhdXNlU3RhdGUgPSAoKSA9PiB7XG4gICAgY29uc3QgcGF1c2FibGVUaHJlYWQgPSB0aGlzLl9nZXRQYXVzYWJsZVRocmVhZCgpXG4gICAgaWYgKHBhdXNhYmxlVGhyZWFkID09IG51bGwpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihcIk5vIHRocmVhZCB0byBwYXVzZS9yZXN1bWVcIilcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGlmIChwYXVzYWJsZVRocmVhZC5zdG9wcGVkKSB7XG4gICAgICBwYXVzYWJsZVRocmVhZC5jb250aW51ZSgpXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX3NldFdhaXRpbmdGb3JQYXVzZSh0cnVlKVxuICAgICAgcGF1c2FibGVUaHJlYWQucGF1c2UoKVxuICAgIH1cbiAgfVxuXG4gIHJlbmRlcigpOiBSZWFjdC5Ob2RlIHtcbiAgICBjb25zdCB7IHdhaXRpbmdGb3JQYXVzZSwgZm9jdXNlZFByb2Nlc3MsIGZvY3VzZWRUaHJlYWQgfSA9IHRoaXMuc3RhdGVcbiAgICBjb25zdCB7IHNlcnZpY2UgfSA9IHRoaXMucHJvcHNcbiAgICBjb25zdCBkZWJ1Z2dlck1vZGUgPSBmb2N1c2VkUHJvY2VzcyA9PSBudWxsID8gRGVidWdnZXJNb2RlLlNUT1BQRUQgOiBmb2N1c2VkUHJvY2Vzcy5kZWJ1Z2dlck1vZGVcbiAgICBjb25zdCByZWFkT25seSA9IGZvY3VzZWRQcm9jZXNzID09IG51bGwgPyBmYWxzZSA6IEJvb2xlYW4oZm9jdXNlZFByb2Nlc3MuY29uZmlndXJhdGlvbi5pc1JlYWRPbmx5KVxuICAgIGNvbnN0IGN1c3RvbUNvbnRyb2xCdXR0b25zID0gZm9jdXNlZFByb2Nlc3MgPT0gbnVsbCA/IFtdIDogZm9jdXNlZFByb2Nlc3MuY29uZmlndXJhdGlvbi5jdXN0b21Db250cm9sQnV0dG9ucyB8fCBbXVxuICAgIGNvbnN0IGlzUGF1c2VkID0gZGVidWdnZXJNb2RlID09PSBEZWJ1Z2dlck1vZGUuUEFVU0VEXG4gICAgY29uc3QgaXNTdG9wcGVkID0gZGVidWdnZXJNb2RlID09PSBEZWJ1Z2dlck1vZGUuU1RPUFBFRFxuICAgIGNvbnN0IGlzUGF1c2luZyA9IGRlYnVnZ2VyTW9kZSA9PT0gRGVidWdnZXJNb2RlLlJVTk5JTkcgJiYgd2FpdGluZ0ZvclBhdXNlXG4gICAgY29uc3QgcGxheVBhdXNlSWNvbiA9IGlzUGF1c2luZyA/IG51bGwgOiAoXG4gICAgICA8c3BhbiBjbGFzc05hbWU9e2lzUGF1c2VkID8gXCJpY29uLXBsYXliYWNrLXBsYXlcIiA6IFwiaWNvbi1wbGF5YmFjay1wYXVzZVwifSAvPlxuICAgIClcblxuICAgIGNvbnN0IGxvYWRpbmdJbmRpY2F0b3IgPSAhaXNQYXVzaW5nID8gbnVsbCA6IChcbiAgICAgIDxMb2FkaW5nU3Bpbm5lciBjbGFzc05hbWU9XCJkZWJ1Z2dlci1zdGVwcGluZy1wbGF5cGF1c2UtYnV0dG9uLWxvYWRpbmdcIiBzaXplPXtMb2FkaW5nU3Bpbm5lclNpemVzLkVYVFJBX1NNQUxMfSAvPlxuICAgIClcblxuICAgIGNvbnN0IHJlc3RhcnREZWJ1Z2dlckJ1dHRvbiA9XG4gICAgICBkZWJ1Z2dlck1vZGUgIT09IERlYnVnZ2VyTW9kZS5TVE9QUEVEICYmIHNlcnZpY2UuY2FuUmVzdGFydFByb2Nlc3MoKSA/IChcbiAgICAgICAgPEJ1dHRvblxuICAgICAgICAgIGljb249XCJzeW5jXCJcbiAgICAgICAgICBjbGFzc05hbWU9XCJkZWJ1Z2dlci1zdGVwcGluZy1idXR0b24tc2VwYXJhdGVkXCJcbiAgICAgICAgICBkaXNhYmxlZD17aXNTdG9wcGVkIHx8IHJlYWRPbmx5fVxuICAgICAgICAgIHRvb2x0aXA9e3tcbiAgICAgICAgICAgIC4uLmRlZmF1bHRUb29sdGlwT3B0aW9ucyxcbiAgICAgICAgICAgIHRpdGxlOiBcIlJlc3RhcnQgdGhlIGRlYnVnZ2VyIHVzaW5nIHRoZSBzYW1lIHNldHRpbmdzIGFzIHRoZSBjdXJyZW50IGRlYnVnIHNlc3Npb25cIixcbiAgICAgICAgICAgIGtleUJpbmRpbmdDb21tYW5kOiBcImRlYnVnZ2VyOnJlc3RhcnQtZGVidWdnaW5nXCIsXG4gICAgICAgICAgfX1cbiAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XG4gICAgICAgICAgICBpbnZhcmlhbnQoZm9jdXNlZFByb2Nlc3MgIT0gbnVsbClcbiAgICAgICAgICAgIHNlcnZpY2UucmVzdGFydFByb2Nlc3MoZm9jdXNlZFByb2Nlc3MpXG4gICAgICAgICAgfX1cbiAgICAgICAgLz5cbiAgICAgICkgOiBudWxsXG5cbiAgICBjb25zdCBEZWJ1Z2dlclN0ZXBCdXR0b24gPSAocHJvcHM6IHtcbiAgICAgIC8qIGVzbGludC1kaXNhYmxlIHJlYWN0L25vLXVudXNlZC1wcm9wLXR5cGVzICovXG4gICAgICBpY29uOiBSZWFjdC5FbGVtZW50PGFueT4sXG4gICAgICB0aXRsZTogc3RyaW5nLFxuICAgICAga2V5QmluZGluZ0NvbW1hbmQ6IHN0cmluZyxcbiAgICAgIGRpc2FibGVkOiBib29sZWFuLFxuICAgICAgb25DbGljazogKCkgPT4gbWl4ZWQsXG4gICAgICAvKiBlc2xpbnQtZW5hYmxlIHJlYWN0L25vLXVudXNlZC1wcm9wLXR5cGVzICovXG4gICAgfSkgPT4gKFxuICAgICAgPFNWR0J1dHRvblxuICAgICAgICBpY29uPXtwcm9wcy5pY29ufVxuICAgICAgICBkaXNhYmxlZD17cHJvcHMuZGlzYWJsZWQgfHwgcmVhZE9ubHl9XG4gICAgICAgIHRvb2x0aXA9e3tcbiAgICAgICAgICAuLi5kZWZhdWx0VG9vbHRpcE9wdGlvbnMsXG4gICAgICAgICAgdGl0bGU6IHByb3BzLnRpdGxlLFxuICAgICAgICAgIGtleUJpbmRpbmdDb21tYW5kOiBwcm9wcy5rZXlCaW5kaW5nQ29tbWFuZCxcbiAgICAgICAgfX1cbiAgICAgICAgb25DbGljaz17cHJvcHMub25DbGlja31cbiAgICAgIC8+XG4gICAgKVxuXG4gICAgY29uc3QgcGF1c2FibGVUaHJlYWQgPSB0aGlzLl9nZXRQYXVzYWJsZVRocmVhZCgpXG4gICAgbGV0IHBsYXlQYXVzZVRpdGxlXG4gICAgaWYgKGlzUGF1c2luZykge1xuICAgICAgcGxheVBhdXNlVGl0bGUgPSBcIldhaXRpbmcgZm9yIHBhdXNlLi4uXCJcbiAgICB9IGVsc2UgaWYgKGlzUGF1c2VkKSB7XG4gICAgICBwbGF5UGF1c2VUaXRsZSA9IFwiQ29udGludWVcIlxuICAgIH0gZWxzZSBpZiAocGF1c2FibGVUaHJlYWQgPT0gbnVsbCkge1xuICAgICAgcGxheVBhdXNlVGl0bGUgPSBcIk5vIHJ1bm5pbmcgdGhyZWFkcyB0byBwYXVzZSFcIlxuICAgIH0gZWxzZSB7XG4gICAgICBwbGF5UGF1c2VUaXRsZSA9IFwiUGF1c2VcIlxuICAgIH1cblxuICAgIGNvbnN0IHByb2Nlc3MgPSBzZXJ2aWNlLmdldE1vZGVsKCkuZ2V0UHJvY2Vzc2VzKClbMF1cbiAgICBjb25zdCBhdHRhY2hlZCA9IHByb2Nlc3MgIT0gbnVsbCAmJiBwcm9jZXNzLmNvbmZpZ3VyYXRpb24uZGVidWdNb2RlID09PSBcImF0dGFjaFwiXG5cbiAgICByZXR1cm4gKFxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJkZWJ1Z2dlci1zdGVwcGluZy1jb21wb25lbnRcIj5cbiAgICAgICAgPEJ1dHRvbkdyb3VwIGNsYXNzTmFtZT1cImRlYnVnZ2VyLXN0ZXBwaW5nLWJ1dHRvbmdyb3VwXCI+XG4gICAgICAgICAge3Jlc3RhcnREZWJ1Z2dlckJ1dHRvbn1cbiAgICAgICAgICA8QnV0dG9uXG4gICAgICAgICAgICBkaXNhYmxlZD17aXNQYXVzaW5nIHx8IHBhdXNhYmxlVGhyZWFkID09IG51bGwgfHwgcmVhZE9ubHl9XG4gICAgICAgICAgICB0b29sdGlwPXt7XG4gICAgICAgICAgICAgIC4uLmRlZmF1bHRUb29sdGlwT3B0aW9ucyxcbiAgICAgICAgICAgICAgdGl0bGU6IHBsYXlQYXVzZVRpdGxlLFxuICAgICAgICAgICAgICBrZXlCaW5kaW5nQ29tbWFuZDogaXNQYXVzZWQgPyBcImRlYnVnZ2VyOmNvbnRpbnVlLWRlYnVnZ2luZ1wiIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgfX1cbiAgICAgICAgICAgIG9uQ2xpY2s9e3RoaXMuX3RvZ2dsZVBhdXNlU3RhdGUuYmluZCh0aGlzKX1cbiAgICAgICAgICA+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXN0ZXBwaW5nLXBsYXlwYXVzZS1idXR0b25cIj5cbiAgICAgICAgICAgICAge3BsYXlQYXVzZUljb259XG4gICAgICAgICAgICAgIHtsb2FkaW5nSW5kaWNhdG9yfVxuICAgICAgICAgICAgPC9kaXY+XG4gICAgICAgICAgPC9CdXR0b24+XG4gICAgICAgICAgPERlYnVnZ2VyU3RlcEJ1dHRvblxuICAgICAgICAgICAgaWNvbj17U1RFUF9PVkVSX0lDT059XG4gICAgICAgICAgICBkaXNhYmxlZD17IWlzUGF1c2VkIHx8IGZvY3VzZWRUaHJlYWQgPT0gbnVsbH1cbiAgICAgICAgICAgIHRpdGxlPVwiU3RlcCBvdmVyXCJcbiAgICAgICAgICAgIGtleUJpbmRpbmdDb21tYW5kPVwiZGVidWdnZXI6c3RlcC1vdmVyXCJcbiAgICAgICAgICAgIG9uQ2xpY2s9eygpID0+IG51bGx0aHJvd3MoZm9jdXNlZFRocmVhZCkubmV4dCgpfVxuICAgICAgICAgIC8+XG4gICAgICAgICAgPERlYnVnZ2VyU3RlcEJ1dHRvblxuICAgICAgICAgICAgaWNvbj17U1RFUF9JTlRPX0lDT059XG4gICAgICAgICAgICBkaXNhYmxlZD17IWlzUGF1c2VkIHx8IGZvY3VzZWRUaHJlYWQgPT0gbnVsbH1cbiAgICAgICAgICAgIHRpdGxlPVwiU3RlcCBpbnRvXCJcbiAgICAgICAgICAgIGtleUJpbmRpbmdDb21tYW5kPVwiZGVidWdnZXI6c3RlcC1pbnRvXCJcbiAgICAgICAgICAgIG9uQ2xpY2s9eygpID0+IG51bGx0aHJvd3MoZm9jdXNlZFRocmVhZCkuc3RlcEluKCl9XG4gICAgICAgICAgLz5cbiAgICAgICAgICA8RGVidWdnZXJTdGVwQnV0dG9uXG4gICAgICAgICAgICBpY29uPXtTVEVQX09VVF9JQ09OfVxuICAgICAgICAgICAgZGlzYWJsZWQ9eyFpc1BhdXNlZCB8fCBmb2N1c2VkVGhyZWFkID09IG51bGx9XG4gICAgICAgICAgICB0aXRsZT1cIlN0ZXAgb3V0XCJcbiAgICAgICAgICAgIGtleUJpbmRpbmdDb21tYW5kPVwiZGVidWdnZXI6c3RlcC1vdXRcIlxuICAgICAgICAgICAgb25DbGljaz17KCkgPT4gbnVsbHRocm93cyhmb2N1c2VkVGhyZWFkKS5zdGVwT3V0KCl9XG4gICAgICAgICAgLz5cbiAgICAgICAgICA8QnV0dG9uXG4gICAgICAgICAgICBpY29uPVwicHJpbWl0aXZlLXNxdWFyZVwiXG4gICAgICAgICAgICBkaXNhYmxlZD17aXNTdG9wcGVkIHx8IGZvY3VzZWRQcm9jZXNzID09IG51bGx9XG4gICAgICAgICAgICB0b29sdGlwPXt7XG4gICAgICAgICAgICAgIC4uLmRlZmF1bHRUb29sdGlwT3B0aW9ucyxcbiAgICAgICAgICAgICAgdGl0bGU6IGF0dGFjaGVkID8gXCJEZXRhY2hcIiA6IFwiVGVybWluYXRlXCIsXG4gICAgICAgICAgICAgIGtleUJpbmRpbmdDb21tYW5kOiBcImRlYnVnZ2VyOnN0b3AtZGVidWdnaW5nXCIsXG4gICAgICAgICAgICB9fVxuICAgICAgICAgICAgb25DbGljaz17KCkgPT4ge1xuICAgICAgICAgICAgICBpZiAoZm9jdXNlZFByb2Nlc3MgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHNlcnZpY2Uuc3RvcFByb2Nlc3MoZm9jdXNlZFByb2Nlc3MpXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH19XG4gICAgICAgICAgLz5cbiAgICAgICAgPC9CdXR0b25Hcm91cD5cbiAgICAgICAgPEJ1dHRvbkdyb3VwIGNsYXNzTmFtZT1cImRlYnVnZ2VyLXN0ZXBwaW5nLWJ1dHRvbmdyb3VwXCI+XG4gICAgICAgICAge2N1c3RvbUNvbnRyb2xCdXR0b25zLm1hcCgoc3BlY2lmaWNhdGlvbiwgaSkgPT4ge1xuICAgICAgICAgICAgY29uc3QgYnV0dG9uUHJvcHMgPSB7XG4gICAgICAgICAgICAgIC4uLnNwZWNpZmljYXRpb24sXG4gICAgICAgICAgICAgIHRvb2x0aXA6IHtcbiAgICAgICAgICAgICAgICB0aXRsZTogc3BlY2lmaWNhdGlvbi50aXRsZSxcbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiA8QnV0dG9uIHsuLi5idXR0b25Qcm9wc30ga2V5PXtpfSAvPlxuICAgICAgICAgIH0pfVxuICAgICAgICA8L0J1dHRvbkdyb3VwPlxuICAgICAgPC9kaXY+XG4gICAgKVxuICB9XG59XG4iXX0=