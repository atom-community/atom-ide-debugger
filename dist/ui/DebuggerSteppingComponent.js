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

var _rxjsCompatUmdMin = require("rxjs-compat/bundles/rxjs-compat.umd.min.js");

var _constants = require("../constants");

var _UniversalDisposable = _interopRequireDefault(require("@atom-ide-community/nuclide-commons/UniversalDisposable"));

var _logger = _interopRequireDefault(require("../logger"));

var _nullthrows = _interopRequireDefault(require("nullthrows"));

var _assert = _interopRequireDefault(require("assert"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

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

    this._disposables.add(_rxjsCompatUmdMin.Observable.merge((0, _event.observableFromSubscribeFunction)(service.onDidChangeProcessMode.bind(service)), (0, _event.observableFromSubscribeFunction)(model.onDidChangeCallStack.bind(model)), (0, _event.observableFromSubscribeFunction)(service.viewModel.onDidChangeDebuggerFocus.bind(service.viewModel))).startWith(null).let((0, _observable.fastDebounce)(10)).subscribe(() => {
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkRlYnVnZ2VyU3RlcHBpbmdDb21wb25lbnQuanMiXSwibmFtZXMiOlsiZGVmYXVsdFRvb2x0aXBPcHRpb25zIiwicGxhY2VtZW50IiwiU1RFUF9PVkVSX0lDT04iLCJTVEVQX0lOVE9fSUNPTiIsIlNURVBfT1VUX0lDT04iLCJTVkdCdXR0b24iLCJwcm9wcyIsIm9uQ2xpY2siLCJkaXNhYmxlZCIsInRvb2x0aXAiLCJpY29uIiwiRGVidWdnZXJTdGVwcGluZ0NvbXBvbmVudCIsIlJlYWN0IiwiQ29tcG9uZW50IiwiY29uc3RydWN0b3IiLCJfZGlzcG9zYWJsZXMiLCJfdG9nZ2xlUGF1c2VTdGF0ZSIsInBhdXNhYmxlVGhyZWFkIiwiX2dldFBhdXNhYmxlVGhyZWFkIiwibG9nZ2VyIiwiZXJyb3IiLCJzdG9wcGVkIiwiY29udGludWUiLCJfc2V0V2FpdGluZ0ZvclBhdXNlIiwicGF1c2UiLCJVbml2ZXJzYWxEaXNwb3NhYmxlIiwic3RhdGUiLCJ3YWl0aW5nRm9yUGF1c2UiLCJmb2N1c2VkUHJvY2VzcyIsImZvY3VzZWRUaHJlYWQiLCJjb21wb25lbnREaWRNb3VudCIsInNlcnZpY2UiLCJtb2RlbCIsImdldE1vZGVsIiwiYWRkIiwiT2JzZXJ2YWJsZSIsIm1lcmdlIiwib25EaWRDaGFuZ2VQcm9jZXNzTW9kZSIsImJpbmQiLCJvbkRpZENoYW5nZUNhbGxTdGFjayIsInZpZXdNb2RlbCIsIm9uRGlkQ2hhbmdlRGVidWdnZXJGb2N1cyIsInN0YXJ0V2l0aCIsImxldCIsInN1YnNjcmliZSIsImRlYnVnZ2VyTW9kZSIsIkRlYnVnZ2VyTW9kZSIsIlNUT1BQRUQiLCJzZXRTdGF0ZSIsInByZXZTdGF0ZSIsIlJVTk5JTkciLCJjb21wb25lbnRXaWxsVW5tb3VudCIsImRpc3Bvc2UiLCJ3YWl0aW5nIiwiZ2V0QWxsVGhyZWFkcyIsInJlbmRlciIsInJlYWRPbmx5IiwiQm9vbGVhbiIsImNvbmZpZ3VyYXRpb24iLCJpc1JlYWRPbmx5IiwiY3VzdG9tQ29udHJvbEJ1dHRvbnMiLCJpc1BhdXNlZCIsIlBBVVNFRCIsImlzU3RvcHBlZCIsImlzUGF1c2luZyIsInBsYXlQYXVzZUljb24iLCJsb2FkaW5nSW5kaWNhdG9yIiwiTG9hZGluZ1NwaW5uZXJTaXplcyIsIkVYVFJBX1NNQUxMIiwicmVzdGFydERlYnVnZ2VyQnV0dG9uIiwiY2FuUmVzdGFydFByb2Nlc3MiLCJ0aXRsZSIsImtleUJpbmRpbmdDb21tYW5kIiwicmVzdGFydFByb2Nlc3MiLCJEZWJ1Z2dlclN0ZXBCdXR0b24iLCJwbGF5UGF1c2VUaXRsZSIsInByb2Nlc3MiLCJnZXRQcm9jZXNzZXMiLCJhdHRhY2hlZCIsImRlYnVnTW9kZSIsInVuZGVmaW5lZCIsIm5leHQiLCJzdGVwSW4iLCJzdGVwT3V0Iiwic3RvcFByb2Nlc3MiLCJtYXAiLCJzcGVjaWZpY2F0aW9uIiwiaSIsImJ1dHRvblByb3BzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQ0E7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7QUFZQSxNQUFNQSxxQkFBcUIsR0FBRztBQUM1QkMsRUFBQUEsU0FBUyxFQUFFO0FBRGlCLENBQTlCO0FBSUEsTUFBTUMsY0FBYyxnQkFDbEI7QUFBSyxFQUFBLE9BQU8sRUFBQztBQUFiLGdCQUNFO0FBQVEsRUFBQSxFQUFFLEVBQUMsSUFBWDtBQUFnQixFQUFBLEVBQUUsRUFBQyxJQUFuQjtBQUF3QixFQUFBLENBQUMsRUFBQztBQUExQixFQURGLGVBRUU7QUFDRSxFQUFBLENBQUMsRUFDQyxtRUFDQSwrREFEQSxHQUVBO0FBSkosRUFGRixDQURGO0FBYUEsTUFBTUMsY0FBYyxnQkFDbEI7QUFBSyxFQUFBLE9BQU8sRUFBQztBQUFiLGdCQUNFO0FBQVEsRUFBQSxFQUFFLEVBQUMsSUFBWDtBQUFnQixFQUFBLEVBQUUsRUFBQyxJQUFuQjtBQUF3QixFQUFBLENBQUMsRUFBQztBQUExQixFQURGLGVBRUU7QUFBUyxFQUFBLE1BQU0s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TUFBTSx5QkFBV0EsYUFBWCxFQUEwQnNELE9BQTFCO0FBTGpCLE1BOUJGLGVBcUNFLG9CQUFDLGNBQUQ7QUFDRSxNQUFBLElBQUksRUFBQyxrQkFEUDtBQUVFLE1BQUEsUUFBUSxFQUFFcEIsU0FBUyxJQUFJbkMsY0FBYyxJQUFJLElBRjNDO0FBR0UsTUFBQSxPQUFPLEVBQUUsRUFDUCxHQUFHNUIscUJBREk7QUFFUHVFLFFBQUFBLEtBQUssRUFBRU8sUUFBUSxHQUFHLFFBQUgsR0FBYyxXQUZ0QjtBQUdQTixRQUFBQSxpQkFBaUIsRUFBRTtBQUhaLE9BSFg7QUFRRSxNQUFBLE9BQU8sRUFBRSxNQUFNO0FBQ2IsWUFBSTVDLGNBQWMsSUFBSSxJQUF0QixFQUE0QjtBQUMxQkcsVUFBQUEsT0FBTyxDQUFDcUQsV0FBUixDQUFvQnhELGNBQXBCO0FBQ0Q7QUFDRjtBQVpILE1BckNGLENBREYsZUFxREUsb0JBQUMsd0JBQUQ7QUFBYSxNQUFBLFNBQVMsRUFBQztBQUF2QixPQUNHZ0Msb0JBQW9CLENBQUN5QixHQUFyQixDQUF5QixDQUFDQyxhQUFELEVBQWdCQyxDQUFoQixLQUFzQjtBQUM5QyxZQUFNQyxXQUFXLEdBQUcsRUFDbEIsR0FBR0YsYUFEZTtBQUVsQjdFLFFBQUFBLE9BQU8sRUFBRTtBQUNQOEQsVUFBQUEsS0FBSyxFQUFFZSxhQUFhLENBQUNmO0FBRGQ7QUFGUyxPQUFwQjtBQU1BLDBCQUFPLG9CQUFDLGNBQUQsZUFBWWlCLFdBQVo7QUFBeUIsUUFBQSxHQUFHLEVBQUVEO0FBQTlCLFNBQVA7QUFDRCxLQVJBLENBREgsQ0FyREYsQ0FERjtBQW1FRDs7QUFyTkQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IElEZWJ1Z1NlcnZpY2UsIElUaHJlYWQsIElQcm9jZXNzIH0gZnJvbSBcIi4uL3R5cGVzXCJcbmltcG9ydCB7IExvYWRpbmdTcGlubmVyLCBMb2FkaW5nU3Bpbm5lclNpemVzIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0xvYWRpbmdTcGlubmVyXCJcblxuaW1wb3J0IHsgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbiB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9ldmVudFwiXG5pbXBvcnQgeyBmYXN0RGVib3VuY2UgfSBmcm9tIFwiQGF0b20taWRlLWNvbW11bml0eS9udWNsaWRlLWNvbW1vbnMvb2JzZXJ2YWJsZVwiXG5pbXBvcnQgKiBhcyBSZWFjdCBmcm9tIFwicmVhY3RcIlxuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSBcIkBhdG9tLWlkZS1jb21tdW5pdHkvbnVjbGlkZS1jb21tb25zLXVpL0J1dHRvblwiXG5pbXBvcnQgeyBCdXR0b25Hcm91cCB9IGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy11aS9CdXR0b25Hcm91cFwiXG5pbXBvcnQgeyBPYnNlcnZhYmxlIH0gZnJvbSBcInJ4anMtY29tcGF0L2J1bmRsZXMvcnhqcy1jb21wYXQudW1kLm1pbi5qc1wiXG5pbXBvcnQgeyBEZWJ1Z2dlck1vZGUgfSBmcm9tIFwiLi4vY29uc3RhbnRzXCJcbmltcG9ydCBVbml2ZXJzYWxEaXNwb3NhYmxlIGZyb20gXCJAYXRvbS1pZGUtY29tbXVuaXR5L251Y2xpZGUtY29tbW9ucy9Vbml2ZXJzYWxEaXNwb3NhYmxlXCJcbmltcG9ydCBsb2dnZXIgZnJvbSBcIi4uL2xvZ2dlclwiXG5pbXBvcnQgbnVsbHRocm93cyBmcm9tIFwibnVsbHRocm93c1wiXG5pbXBvcnQgaW52YXJpYW50IGZyb20gXCJhc3NlcnRcIlxuXG50eXBlIERlYnVnZ2VyU3RlcHBpbmdDb21wb25lbnRQcm9wcyA9IHtcbiAgc2VydmljZTogSURlYnVnU2VydmljZSxcbn1cblxudHlwZSBEZWJ1Z2dlclN0ZXBwaW5nQ29tcG9uZW50U3RhdGUgPSB7XG4gIHdhaXRpbmdGb3JQYXVzZTogYm9vbGVhbixcbiAgZm9jdXNlZFByb2Nlc3M6ID9JUHJvY2VzcyxcbiAgZm9jdXNlZFRocmVhZDogP0lUaHJlYWQsXG59XG5cbmNvbnN0IGRlZmF1bHRUb29sdGlwT3B0aW9ucyA9IHtcbiAgcGxhY2VtZW50OiBcImJvdHRvbVwiLFxufVxuXG5jb25zdCBTVEVQX09WRVJfSUNPTiA9IChcbiAgPHN2ZyB2aWV3Qm94PVwiMCAwIDEwMCAxMDBcIj5cbiAgICA8Y2lyY2xlIGN4PVwiNDZcIiBjeT1cIjYzXCIgcj1cIjEwXCIgLz5cbiAgICA8cGF0aFxuICAgICAgZD17XG4gICAgICAgIFwiTTgzLjgsNTQuN2MtNi41LTE2LjYtMjAuNy0yOC4xLTM3LjItMjguMWMtMTkuNCwwLTM1LjYsMTYtMzkuOSxcIiArXG4gICAgICAgIFwiMzcuM2wxMS42LDIuOWMzLTE2LjIsMTQuNS0yOC4yLDI4LjItMjguMiBjMTEsMCwyMC43LDcuOCwyNS42LFwiICtcbiAgICAgICAgXCIxOS4zbC05LjYsMi43bDIwLjgsMTQuN0w5My43LDUyTDgzLjgsNTQuN3pcIlxuICAgICAgfVxuICAgIC8+XG4gIDwvc3ZnPlxuKVxuXG5jb25zdCBTVEVQX0lOVE9fSUNPTiA9IChcbiAgPHN2ZyB2aWV3Qm94PVwiMCAwIDEwMCAxMDBcIj5cbiAgICA8Y2lyY2xlIGN4PVwiNTBcIiBjeT1cIjc1XCIgcj1cIjEwXCIgLz5cbiAgICA8cG9seWdvbiBwb2ludHM9XCI0MiwyMCA1NywyMCA1Nyw0MCA3Miw0MCA1MCw2MCAyOCw0MCA0Miw0MFwiIC8+XG4gIDwvc3ZnPlxuKVxuXG5jb25zdCBTVEVQX09VVF9JQ09OID0gKFxuICA8c3ZnIHZpZXdCb3g9XCIwIDAgMTAwIDEwMFwiPlxuICAgIDxjaXJjbGUgY3g9XCI1MFwiIGN5PVwiNzVcIiByPVwiMTBcIiAvPlxuICAgIDxwb2x5Z29uIHBvaW50cz1cIjQyLDIwIDU3LDIwIDU3LDQwIDcyLDQwIDUwLDYwIDI4LDQwIDQyLDQwXCIgdHJhbnNmb3JtPVwicm90YXRlKDE4MCwgNTAsIDQwKVwiIC8+XG4gIDwvc3ZnPlxuKVxuXG5mdW5jdGlvbiBTVkdCdXR0b24ocHJvcHM6IHtcbiAgb25DbGljazogKCkgPT4gbWl4ZWQsXG4gIHRvb2x0aXA6IGF0b20kVG9vbHRpcHNBZGRPcHRpb25zLFxuICBpY29uOiBSZWFjdC5FbGVtZW50PGFueT4sXG4gIGRpc2FibGVkOiBib29sZWFuLFxufSk6IFJlYWN0LkVsZW1lbnQ8YW55PiB7XG4gIHJldHVybiAoXG4gICAgPEJ1dHRvblxuICAgICAgY2xhc3NOYW1lPVwiZGVidWdnZXItc3RlcHBpbmctc3ZnLWJ1dHRvblwiXG4gICAgICBvbkNsaWNrPXtwcm9wcy5vbkNsaWNrfVxuICAgICAgZGlzYWJsZWQ9e3Byb3BzLmRpc2FibGVkfVxuICAgICAgdG9vbHRpcD17cHJvcHMudG9vbHRpcH1cbiAgICA+XG4gICAgICA8ZGl2Pntwcm9wcy5pY29ufTwvZGl2PlxuICAgIDwvQnV0dG9uPlxuICApXG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIERlYnVnZ2VyU3RlcHBpbmdDb21wb25lbnQgZXh0ZW5kcyBSZWFjdC5Db21wb25lbnQ8XG4gIERlYnVnZ2VyU3RlcHBpbmdDb21wb25lbnRQcm9wcyxcbiAgRGVidWdnZXJTdGVwcGluZ0NvbXBvbmVudFN0YXRlXG4+IHtcbiAgX2Rpc3Bvc2FibGVzOiBVbml2ZXJzYWxEaXNwb3NhYmxlXG5cbiAgY29uc3RydWN0b3IocHJvcHM6IERlYnVnZ2VyU3RlcHBpbmdDb21wb25lbnRQcm9wcykge1xuICAgIHN1cGVyKHByb3BzKVxuXG4gICAgdGhpcy5fZGlzcG9zYWJsZXMgPSBuZXcgVW5pdmVyc2FsRGlzcG9zYWJsZSgpXG4gICAgdGhpcy5zdGF0ZSA9IHtcbiAgICAgIHdhaXRpbmdGb3JQYXVzZTogZmFsc2UsXG4gICAgICBmb2N1c2VkUHJvY2VzczogbnVsbCxcbiAgICAgIGZvY3VzZWRUaHJlYWQ6IG51bGwsXG4gICAgfVxuICB9XG5cbiAgY29tcG9uZW50RGlkTW91bnQoKTogdm9pZCB7XG4gICAgY29uc3QgeyBzZXJ2aWNlIH0gPSB0aGlzLnByb3BzXG4gICAgY29uc3QgbW9kZWwgPSBzZXJ2aWNlLmdldE1vZGVsKClcbiAgICB0aGlzLl9kaXNwb3NhYmxlcy5hZGQoXG4gICAgICBPYnNlcnZhYmxlLm1lcmdlKFxuICAgICAgICBvYnNlcnZhYmxlRnJvbVN1YnNjcmliZUZ1bmN0aW9uKHNlcnZpY2Uub25EaWRDaGFuZ2VQcm9jZXNzTW9kZS5iaW5kKHNlcnZpY2UpKSxcbiAgICAgICAgb2JzZXJ2YWJsZUZyb21TdWJzY3JpYmVGdW5jdGlvbihtb2RlbC5vbkRpZENoYW5nZUNhbGxTdGFjay5iaW5kKG1vZGVsKSksXG4gICAgICAgIG9ic2VydmFibGVGcm9tU3Vic2NyaWJlRnVuY3Rpb24oc2VydmljZS52aWV3TW9kZWwub25EaWRDaGFuZ2VEZWJ1Z2dlckZvY3VzLmJpbmQoc2VydmljZS52aWV3TW9kZWwpKVxuICAgICAgKVxuICAgICAgICAuc3RhcnRXaXRoKG51bGwpXG4gICAgICAgIC5sZXQoZmFzdERlYm91bmNlKDEwKSlcbiAgICAgICAgLnN1YnNjcmliZSgoKSA9PiB7XG4gICAgICAgICAgY29uc3QgeyB2aWV3TW9kZWwgfSA9IHRoaXMucHJvcHMuc2VydmljZVxuICAgICAgICAgIGNvbnN0IHsgZm9jdXNlZFByb2Nlc3MsIGZvY3VzZWRUaHJlYWQgfSA9IHZpZXdNb2RlbFxuICAgICAgICAgIGNvbnN0IGRlYnVnZ2VyTW9kZSA9IGZvY3VzZWRQcm9jZXNzID09IG51bGwgPyBEZWJ1Z2dlck1vZGUuU1RPUFBFRCA6IGZvY3VzZWRQcm9jZXNzLmRlYnVnZ2VyTW9kZVxuXG4gICAgICAgICAgdGhpcy5zZXRTdGF0ZSgocHJldlN0YXRlKSA9PiAoe1xuICAgICAgICAgICAgZm9jdXNlZFByb2Nlc3MsXG4gICAgICAgICAgICBmb2N1c2VkVGhyZWFkLFxuICAgICAgICAgICAgd2FpdGluZ0ZvclBhdXNlOiBwcmV2U3RhdGUud2FpdGluZ0ZvclBhdXNlICYmIGRlYnVnZ2VyTW9kZSA9PT0gRGVidWdnZXJNb2RlLlJVTk5JTkcsXG4gICAgICAgICAgfSkpXG4gICAgICAgIH0pXG4gICAgKVxuICB9XG5cbiAgY29tcG9uZW50V2lsbFVubW91bnQoKTogdm9pZCB7XG4gICAgdGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG4gIH1cblxuICBfc2V0V2FpdGluZ0ZvclBhdXNlKHdhaXRpbmc6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICB0aGlzLnNldFN0YXRlKHtcbiAgICAgIHdhaXRpbmdGb3JQYXVzZTogd2FpdGluZyxcbiAgICB9KVxuICB9XG5cbiAgX2dldFBhdXNhYmxlVGhyZWFkKCk6ID9JVGhyZWFkIHtcbiAgICBjb25zdCB7IGZvY3VzZWRUaHJlYWQsIGZvY3VzZWRQcm9jZXNzIH0gPSB0aGlzLnByb3BzLnNlcnZpY2Uudmlld01vZGVsXG4gICAgaWYgKGZvY3VzZWRUaHJlYWQgIT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGZvY3VzZWRUaHJlYWRcbiAgICB9IGVsc2UgaWYgKGZvY3VzZWRQcm9jZXNzICE9IG51bGwpIHtcbiAgICAgIHJldHVybiBmb2N1c2VkUHJvY2Vzcy5nZXRBbGxUaHJlYWRzKClbMF1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG4gIH1cblxuICBfdG9nZ2xlUGF1c2VTdGF0ZSA9ICgpID0+IHtcbiAgICBjb25zdCBwYXVzYWJsZVRocmVhZCA9IHRoaXMuX2dldFBhdXNhYmxlVGhyZWFkKClcbiAgICBpZiAocGF1c2FibGVUaHJlYWQgPT0gbnVsbCkge1xuICAgICAgbG9nZ2VyLmVycm9yKFwiTm8gdGhyZWFkIHRvIHBhdXNlL3Jlc3VtZVwiKVxuICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgaWYgKHBhdXNhYmxlVGhyZWFkLnN0b3BwZWQpIHtcbiAgICAgIHBhdXNhYmxlVGhyZWFkLmNvbnRpbnVlKClcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5fc2V0V2FpdGluZ0ZvclBhdXNlKHRydWUpXG4gICAgICBwYXVzYWJsZVRocmVhZC5wYXVzZSgpXG4gICAgfVxuICB9XG5cbiAgcmVuZGVyKCk6IFJlYWN0Lk5vZGUge1xuICAgIGNvbnN0IHsgd2FpdGluZ0ZvclBhdXNlLCBmb2N1c2VkUHJvY2VzcywgZm9jdXNlZFRocmVhZCB9ID0gdGhpcy5zdGF0ZVxuICAgIGNvbnN0IHsgc2VydmljZSB9ID0gdGhpcy5wcm9wc1xuICAgIGNvbnN0IGRlYnVnZ2VyTW9kZSA9IGZvY3VzZWRQcm9jZXNzID09IG51bGwgPyBEZWJ1Z2dlck1vZGUuU1RPUFBFRCA6IGZvY3VzZWRQcm9jZXNzLmRlYnVnZ2VyTW9kZVxuICAgIGNvbnN0IHJlYWRPbmx5ID0gZm9jdXNlZFByb2Nlc3MgPT0gbnVsbCA/IGZhbHNlIDogQm9vbGVhbihmb2N1c2VkUHJvY2Vzcy5jb25maWd1cmF0aW9uLmlzUmVhZE9ubHkpXG4gICAgY29uc3QgY3VzdG9tQ29udHJvbEJ1dHRvbnMgPSBmb2N1c2VkUHJvY2VzcyA9PSBudWxsID8gW10gOiBmb2N1c2VkUHJvY2Vzcy5jb25maWd1cmF0aW9uLmN1c3RvbUNvbnRyb2xCdXR0b25zIHx8IFtdXG4gICAgY29uc3QgaXNQYXVzZWQgPSBkZWJ1Z2dlck1vZGUgPT09IERlYnVnZ2VyTW9kZS5QQVVTRURcbiAgICBjb25zdCBpc1N0b3BwZWQgPSBkZWJ1Z2dlck1vZGUgPT09IERlYnVnZ2VyTW9kZS5TVE9QUEVEXG4gICAgY29uc3QgaXNQYXVzaW5nID0gZGVidWdnZXJNb2RlID09PSBEZWJ1Z2dlck1vZGUuUlVOTklORyAmJiB3YWl0aW5nRm9yUGF1c2VcbiAgICBjb25zdCBwbGF5UGF1c2VJY29uID0gaXNQYXVzaW5nID8gbnVsbCA6IChcbiAgICAgIDxzcGFuIGNsYXNzTmFtZT17aXNQYXVzZWQgPyBcImljb24tcGxheWJhY2stcGxheVwiIDogXCJpY29uLXBsYXliYWNrLXBhdXNlXCJ9IC8+XG4gICAgKVxuXG4gICAgY29uc3QgbG9hZGluZ0luZGljYXRvciA9ICFpc1BhdXNpbmcgPyBudWxsIDogKFxuICAgICAgPExvYWRpbmdTcGlubmVyIGNsYXNzTmFtZT1cImRlYnVnZ2VyLXN0ZXBwaW5nLXBsYXlwYXVzZS1idXR0b24tbG9hZGluZ1wiIHNpemU9e0xvYWRpbmdTcGlubmVyU2l6ZXMuRVhUUkFfU01BTEx9IC8+XG4gICAgKVxuXG4gICAgY29uc3QgcmVzdGFydERlYnVnZ2VyQnV0dG9uID1cbiAgICAgIGRlYnVnZ2VyTW9kZSAhPT0gRGVidWdnZXJNb2RlLlNUT1BQRUQgJiYgc2VydmljZS5jYW5SZXN0YXJ0UHJvY2VzcygpID8gKFxuICAgICAgICA8QnV0dG9uXG4gICAgICAgICAgaWNvbj1cInN5bmNcIlxuICAgICAgICAgIGNsYXNzTmFtZT1cImRlYnVnZ2VyLXN0ZXBwaW5nLWJ1dHRvbi1zZXBhcmF0ZWRcIlxuICAgICAgICAgIGRpc2FibGVkPXtpc1N0b3BwZWQgfHwgcmVhZE9ubHl9XG4gICAgICAgICAgdG9vbHRpcD17e1xuICAgICAgICAgICAgLi4uZGVmYXVsdFRvb2x0aXBPcHRpb25zLFxuICAgICAgICAgICAgdGl0bGU6IFwiUmVzdGFydCB0aGUgZGVidWdnZXIgdXNpbmcgdGhlIHNhbWUgc2V0dGluZ3MgYXMgdGhlIGN1cnJlbnQgZGVidWcgc2Vzc2lvblwiLFxuICAgICAgICAgICAga2V5QmluZGluZ0NvbW1hbmQ6IFwiZGVidWdnZXI6cmVzdGFydC1kZWJ1Z2dpbmdcIixcbiAgICAgICAgICB9fVxuICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHtcbiAgICAgICAgICAgIGludmFyaWFudChmb2N1c2VkUHJvY2VzcyAhPSBudWxsKVxuICAgICAgICAgICAgc2VydmljZS5yZXN0YXJ0UHJvY2Vzcyhmb2N1c2VkUHJvY2VzcylcbiAgICAgICAgICB9fVxuICAgICAgICAvPlxuICAgICAgKSA6IG51bGxcblxuICAgIGNvbnN0IERlYnVnZ2VyU3RlcEJ1dHRvbiA9IChwcm9wczoge1xuICAgICAgLyogZXNsaW50LWRpc2FibGUgcmVhY3Qvbm8tdW51c2VkLXByb3AtdHlwZXMgKi9cbiAgICAgIGljb246IFJlYWN0LkVsZW1lbnQ8YW55PixcbiAgICAgIHRpdGxlOiBzdHJpbmcsXG4gICAgICBrZXlCaW5kaW5nQ29tbWFuZDogc3RyaW5nLFxuICAgICAgZGlzYWJsZWQ6IGJvb2xlYW4sXG4gICAgICBvbkNsaWNrOiAoKSA9PiBtaXhlZCxcbiAgICAgIC8qIGVzbGludC1lbmFibGUgcmVhY3Qvbm8tdW51c2VkLXByb3AtdHlwZXMgKi9cbiAgICB9KSA9PiAoXG4gICAgICA8U1ZHQnV0dG9uXG4gICAgICAgIGljb249e3Byb3BzLmljb259XG4gICAgICAgIGRpc2FibGVkPXtwcm9wcy5kaXNhYmxlZCB8fCByZWFkT25seX1cbiAgICAgICAgdG9vbHRpcD17e1xuICAgICAgICAgIC4uLmRlZmF1bHRUb29sdGlwT3B0aW9ucyxcbiAgICAgICAgICB0aXRsZTogcHJvcHMudGl0bGUsXG4gICAgICAgICAga2V5QmluZGluZ0NvbW1hbmQ6IHByb3BzLmtleUJpbmRpbmdDb21tYW5kLFxuICAgICAgICB9fVxuICAgICAgICBvbkNsaWNrPXtwcm9wcy5vbkNsaWNrfVxuICAgICAgLz5cbiAgICApXG5cbiAgICBjb25zdCBwYXVzYWJsZVRocmVhZCA9IHRoaXMuX2dldFBhdXNhYmxlVGhyZWFkKClcbiAgICBsZXQgcGxheVBhdXNlVGl0bGVcbiAgICBpZiAoaXNQYXVzaW5nKSB7XG4gICAgICBwbGF5UGF1c2VUaXRsZSA9IFwiV2FpdGluZyBmb3IgcGF1c2UuLi5cIlxuICAgIH0gZWxzZSBpZiAoaXNQYXVzZWQpIHtcbiAgICAgIHBsYXlQYXVzZVRpdGxlID0gXCJDb250aW51ZVwiXG4gICAgfSBlbHNlIGlmIChwYXVzYWJsZVRocmVhZCA9PSBudWxsKSB7XG4gICAgICBwbGF5UGF1c2VUaXRsZSA9IFwiTm8gcnVubmluZyB0aHJlYWRzIHRvIHBhdXNlIVwiXG4gICAgfSBlbHNlIHtcbiAgICAgIHBsYXlQYXVzZVRpdGxlID0gXCJQYXVzZVwiXG4gICAgfVxuXG4gICAgY29uc3QgcHJvY2VzcyA9IHNlcnZpY2UuZ2V0TW9kZWwoKS5nZXRQcm9jZXNzZXMoKVswXVxuICAgIGNvbnN0IGF0dGFjaGVkID0gcHJvY2VzcyAhPSBudWxsICYmIHByb2Nlc3MuY29uZmlndXJhdGlvbi5kZWJ1Z01vZGUgPT09IFwiYXR0YWNoXCJcblxuICAgIHJldHVybiAoXG4gICAgICA8ZGl2IGNsYXNzTmFtZT1cImRlYnVnZ2VyLXN0ZXBwaW5nLWNvbXBvbmVudFwiPlxuICAgICAgICA8QnV0dG9uR3JvdXAgY2xhc3NOYW1lPVwiZGVidWdnZXItc3RlcHBpbmctYnV0dG9uZ3JvdXBcIj5cbiAgICAgICAgICB7cmVzdGFydERlYnVnZ2VyQnV0dG9ufVxuICAgICAgICAgIDxCdXR0b25cbiAgICAgICAgICAgIGRpc2FibGVkPXtpc1BhdXNpbmcgfHwgcGF1c2FibGVUaHJlYWQgPT0gbnVsbCB8fCByZWFkT25seX1cbiAgICAgICAgICAgIHRvb2x0aXA9e3tcbiAgICAgICAgICAgICAgLi4uZGVmYXVsdFRvb2x0aXBPcHRpb25zLFxuICAgICAgICAgICAgICB0aXRsZTogcGxheVBhdXNlVGl0bGUsXG4gICAgICAgICAgICAgIGtleUJpbmRpbmdDb21tYW5kOiBpc1BhdXNlZCA/IFwiZGVidWdnZXI6Y29udGludWUtZGVidWdnaW5nXCIgOiB1bmRlZmluZWQsXG4gICAgICAgICAgICB9fVxuICAgICAgICAgICAgb25DbGljaz17dGhpcy5fdG9nZ2xlUGF1c2VTdGF0ZS5iaW5kKHRoaXMpfVxuICAgICAgICAgID5cbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZGVidWdnZXItc3RlcHBpbmctcGxheXBhdXNlLWJ1dHRvblwiPlxuICAgICAgICAgICAgICB7cGxheVBhdXNlSWNvbn1cbiAgICAgICAgICAgICAge2xvYWRpbmdJbmRpY2F0b3J9XG4gICAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgICA8L0J1dHRvbj5cbiAgICAgICAgICA8RGVidWdnZXJTdGVwQnV0dG9uXG4gICAgICAgICAgICBpY29uPXtTVEVQX09WRVJfSUNPTn1cbiAgICAgICAgICAgIGRpc2FibGVkPXshaXNQYXVzZWQgfHwgZm9jdXNlZFRocmVhZCA9PSBudWxsfVxuICAgICAgICAgICAgdGl0bGU9XCJTdGVwIG92ZXJcIlxuICAgICAgICAgICAga2V5QmluZGluZ0NvbW1hbmQ9XCJkZWJ1Z2dlcjpzdGVwLW92ZXJcIlxuICAgICAgICAgICAgb25DbGljaz17KCkgPT4gbnVsbHRocm93cyhmb2N1c2VkVGhyZWFkKS5uZXh0KCl9XG4gICAgICAgICAgLz5cbiAgICAgICAgICA8RGVidWdnZXJTdGVwQnV0dG9uXG4gICAgICAgICAgICBpY29uPXtTVEVQX0lOVE9fSUNPTn1cbiAgICAgICAgICAgIGRpc2FibGVkPXshaXNQYXVzZWQgfHwgZm9jdXNlZFRocmVhZCA9PSBudWxsfVxuICAgICAgICAgICAgdGl0bGU9XCJTdGVwIGludG9cIlxuICAgICAgICAgICAga2V5QmluZGluZ0NvbW1hbmQ9XCJkZWJ1Z2dlcjpzdGVwLWludG9cIlxuICAgICAgICAgICAgb25DbGljaz17KCkgPT4gbnVsbHRocm93cyhmb2N1c2VkVGhyZWFkKS5zdGVwSW4oKX1cbiAgICAgICAgICAvPlxuICAgICAgICAgIDxEZWJ1Z2dlclN0ZXBCdXR0b25cbiAgICAgICAgICAgIGljb249e1NURVBfT1VUX0lDT059XG4gICAgICAgICAgICBkaXNhYmxlZD17IWlzUGF1c2VkIHx8IGZvY3VzZWRUaHJlYWQgPT0gbnVsbH1cbiAgICAgICAgICAgIHRpdGxlPVwiU3RlcCBvdXRcIlxuICAgICAgICAgICAga2V5QmluZGluZ0NvbW1hbmQ9XCJkZWJ1Z2dlcjpzdGVwLW91dFwiXG4gICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiBudWxsdGhyb3dzKGZvY3VzZWRUaHJlYWQpLnN0ZXBPdXQoKX1cbiAgICAgICAgICAvPlxuICAgICAgICAgIDxCdXR0b25cbiAgICAgICAgICAgIGljb249XCJwcmltaXRpdmUtc3F1YXJlXCJcbiAgICAgICAgICAgIGRpc2FibGVkPXtpc1N0b3BwZWQgfHwgZm9jdXNlZFByb2Nlc3MgPT0gbnVsbH1cbiAgICAgICAgICAgIHRvb2x0aXA9e3tcbiAgICAgICAgICAgICAgLi4uZGVmYXVsdFRvb2x0aXBPcHRpb25zLFxuICAgICAgICAgICAgICB0aXRsZTogYXR0YWNoZWQgPyBcIkRldGFjaFwiIDogXCJUZXJtaW5hdGVcIixcbiAgICAgICAgICAgICAga2V5QmluZGluZ0NvbW1hbmQ6IFwiZGVidWdnZXI6c3RvcC1kZWJ1Z2dpbmdcIixcbiAgICAgICAgICAgIH19XG4gICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XG4gICAgICAgICAgICAgIGlmIChmb2N1c2VkUHJvY2VzcyAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgc2VydmljZS5zdG9wUHJvY2Vzcyhmb2N1c2VkUHJvY2VzcylcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfX1cbiAgICAgICAgICAvPlxuICAgICAgICA8L0J1dHRvbkdyb3VwPlxuICAgICAgICA8QnV0dG9uR3JvdXAgY2xhc3NOYW1lPVwiZGVidWdnZXItc3RlcHBpbmctYnV0dG9uZ3JvdXBcIj5cbiAgICAgICAgICB7Y3VzdG9tQ29udHJvbEJ1dHRvbnMubWFwKChzcGVjaWZpY2F0aW9uLCBpKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBidXR0b25Qcm9wcyA9IHtcbiAgICAgICAgICAgICAgLi4uc3BlY2lmaWNhdGlvbixcbiAgICAgICAgICAgICAgdG9vbHRpcDoge1xuICAgICAgICAgICAgICAgIHRpdGxlOiBzcGVjaWZpY2F0aW9uLnRpdGxlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIDxCdXR0b24gey4uLmJ1dHRvblByb3BzfSBrZXk9e2l9IC8+XG4gICAgICAgICAgfSl9XG4gICAgICAgIDwvQnV0dG9uR3JvdXA+XG4gICAgICA8L2Rpdj5cbiAgICApXG4gIH1cbn1cbiJdfQ==